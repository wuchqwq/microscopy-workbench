"""Actual image-provider bindings on public synthetic data, never specimens."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import image_workspace as image
from crystallography.twin_observations import load_domains


class TwinObservations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="public-twin-observation-bindings-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        cls.workspace = cls.root / "image-workspace"
        cls.serial = 0
        y, x = np.indices((64, 128))
        values = (2*np.cos(2*np.pi*x/8) + np.cos(2*np.pi*y/8)).astype(np.float32)
        cls.source = cls.root / "public-analytic-two-frame.tiff"
        tifffile.imwrite(cls.source, np.stack([values, values]), photometric="minisblack")
        cls.source_hash = image.sha_file(cls.source)
        opened = cls.call("open", source_path=str(cls.source))
        cls.frame = cls.call("frame", object_id=opened["object_id"], frame_index=0)
        cls.other_frame = cls.call("frame", object_id=opened["object_id"], frame_index=1)
        cls.calibrated = cls.call("calibrate", object_id=cls.frame["object_id"], scope="image",
                                  xy_scale={"x": .02, "y": -.03, "unit": "nm"},
                                  source_text="Explicit public synthetic signed XY; no instrument calibration")
        cls.rects = [[0, 0, 64, 64], [64, 0, 128, 64]]
        cls.atlas = cls.make_atlas(cls.calibrated)
        cls.line = cls.call("measure", object_id=cls.calibrated["object_id"],
                            coordinate_space="source_pixels", points=[[63, 4], [63, 58]])

    @classmethod
    def call(cls, action, **parameters):
        cls.serial += 1
        response = image.execute({"workspace": str(cls.workspace), "action": action,
                                  "request_id": "twin-observations-%d" % cls.serial, **parameters})
        if not response.get("ok"):
            raise AssertionError(response)
        return response["result"]

    @classmethod
    def make_atlas(cls, selected, rects=None):
        return cls.call("spatial_atlas", object_id=selected["object_id"], rects=rects or cls.rects,
                        window="none", subtract_mean=True, max_size=256, max_peaks=8,
                        peak_options={"refinement": "none", "threshold_rel": .1})

    @staticmethod
    def references(saved):
        return [{"field_object_id": saved["object_id"],
                 "rect_xyxy": row.get("rect", row.get("rect_xyxy")),
                 "current_image_object_id": row["fft_object_id"]}
                for row in saved.get("regions", saved.get("samples", []))]

    def load(self, references=None, current=None, line=None):
        return load_domains(str(self.workspace), references or self.references(self.atlas),
                            current or self.calibrated["object_id"], line)

    def hashes(self):
        return {str(path.relative_to(self.workspace)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in self.workspace.rglob("*") if path.is_file()}

    def test_actual_atlas_and_saved_line_are_serializable_without_writes(self):
        before = self.hashes()
        result = self.load(line=self.line["object_id"])
        self.assertTrue(result["physical_ready"])
        self.assertTrue(result["evidence_quality_ready"])
        self.assertEqual(result["adjacency"]["support_relation"], "shared_edge")
        self.assertEqual(result["source_binding"]["frame_object_id"], self.frame["object_id"])
        self.assertEqual(result["interface"]["pixel_vector_xy"], [0, 54])
        self.assertAlmostEqual(result["interface"]["physical_vector_xy"][1], -1.62)
        self.assertEqual(json.loads(result["interface"]["manifest_text"]), result["interface"]["measurement"])
        for side in result["domains"]:
            self.assertEqual(side["measurement_object_ids"], [m["object_id"] for m in side["measurements"]])
            self.assertTrue(side["physical_observations"])
            self.assertTrue(all(Path(source["journal_path"]).is_file() for source in side["sources"]))
        json.dumps(result, allow_nan=False)
        self.assertEqual(self.hashes(), before)
        self.assertEqual(image.sha_file(self.source), self.source_hash)

    def test_missing_and_withdrawn_calibration_preserve_pixel_observations(self):
        withdrawn = self.call("calibrate", object_id=self.calibrated["object_id"], scope="image", xy_scale=None,
                              source_text="Withdraw the public synthetic scale for pixel-only testing")
        for current in (self.frame, withdrawn):
            with self.subTest(status=current.get("xy_calibration", {}).get("status", "absent")):
                atlas = self.make_atlas(current)
                line = self.call("measure", object_id=current["object_id"], coordinate_space="source_pixels",
                                 points=[[63, 4], [63, 58]])
                before = self.hashes()
                result = self.load(self.references(atlas), current["object_id"], line["object_id"])
                self.assertFalse(result["physical_ready"])
                self.assertTrue(result["insufficient_reasons"])
                self.assertTrue(all(side["pixel_observations"] and not side["physical_observations"]
                                    for side in result["domains"]))
                self.assertIsNone(result["interface"]["physical_vector_xy"])
                self.assertEqual(self.hashes(), before)

    def test_unrelated_source_and_different_frame_are_refused(self):
        other_path = self.root / "other-source-same-pixels.tiff"
        tifffile.imwrite(other_path, np.zeros((64, 128), dtype=np.float32), photometric="minisblack")
        other_source = self.call("open", source_path=str(other_path))
        other = self.call("frame", object_id=other_source["object_id"], frame_index=0)
        for frame in (other, self.other_frame):
            with self.subTest(frame=frame["object_id"]):
                with self.assertRaisesRegex(ValueError, "different spatial source/frame/array"):
                    self.load(current=frame["object_id"])
                other_line = self.call("measure", object_id=frame["object_id"], coordinate_space="source_pixels",
                                       points=[[63, 4], [63, 58]])
                with self.assertRaisesRegex(ValueError, "another spatial source"):
                    self.load(line=other_line["object_id"])

    def test_gap_and_corner_supports_are_refused(self):
        for rects in ([[0, 0, 48, 64], [64, 0, 112, 64]], [[0, 0, 32, 32], [32, 32, 64, 64]]):
            with self.subTest(rects=rects):
                atlas = self.make_atlas(self.calibrated, rects)
                with self.assertRaisesRegex(ValueError, "gaps and corner-only"):
                    self.load(self.references(atlas))

    def test_stale_calibration_wrong_fft_roi_and_foreign_measurement_are_refused(self):
        revised = self.call("calibrate", object_id=self.calibrated["object_id"], scope="image",
                            xy_scale={"x": .04, "y": -.03, "unit": "nm"},
                            source_text="Explicit changed public synthetic scale revision")
        with self.assertRaisesRegex(ValueError, "different current spatial calibration"):
            self.load(current=revised["object_id"])
        wrong_grid = self.references(self.atlas)
        wrong_grid[1]["current_image_object_id"] = wrong_grid[0]["current_image_object_id"]
        with self.assertRaisesRegex(ValueError, "different source/ROI/grid"):
            self.load(wrong_grid)
        wrong_rect = self.references(self.atlas)
        wrong_rect[0]["rect_xyxy"] = [0, 0, 63, 64]
        with self.assertRaisesRegex(ValueError, "exact source-pixel rectangle"):
            self.load(wrong_rect)
        wrong_measurement = self.references(self.atlas)
        wrong_measurement[0]["measurement_object_ids"] = self.atlas["regions"][1]["measurement_object_ids"][:1]
        with self.assertRaisesRegex(ValueError, "this exact saved observation"):
            self.load(wrong_measurement)

    def test_spatial_field_and_domain_map_select_by_rectangle(self):
        field = self.call("spatial_field", object_id=self.calibrated["object_id"], window_sizes=[64],
                          stride_xy=[64, 64], max_windows=2, coordinate_domain="pixel", max_size=256,
                          window="none", subtract_mean=True, max_peaks=8,
                          peak_options={"refinement": "none", "threshold_rel": .1})
        references = self.references(field)
        field_result = self.load(references)
        domain_map = self.call("domain_map", object_id=field["object_id"], angles_degrees=[0], tolerance=.001,
                               max_size=256, neighbor_policy="support_contact_v1")
        domain_references = copy.deepcopy(references)
        for row in domain_references:
            row["field_object_id"] = domain_map["object_id"]
        result = self.load(domain_references)
        self.assertTrue(result["physical_ready"])
        self.assertEqual([row["observation_key"] for row in result["domains"]],
                         [row["observation_key"] for row in field_result["domains"]])
        self.assertEqual([row["resolved_field_object_id"] for row in result["domains"]],
                         [field["object_id"], field["object_id"]])
        extended = self.call("field_extend", object_id=field["object_id"], rects=[[32, 0, 96, 64]],
                             source_text="Public synthetic overlapping follow-up window", max_size=256)
        extended_result = self.load(self.references(extended)[:2])
        self.assertTrue(extended_result["physical_ready"])
        self.assertEqual([row["observation_key"] for row in extended_result["domains"]],
                         [row["observation_key"] for row in field_result["domains"]])

    def test_truncated_observations_keep_physical_vectors_but_are_quality_insufficient(self):
        atlas = self.call("spatial_atlas", object_id=self.calibrated["object_id"], rects=self.rects,
                          window="none", subtract_mean=True, max_size=256, max_peaks=1,
                          peak_options={"refinement": "none", "threshold_rel": .1})
        result = self.load(self.references(atlas))
        self.assertTrue(result["physical_ready"])
        self.assertFalse(result["evidence_quality_ready"])
        self.assertTrue(all(side["physical_observations"] and side["evidence_quality_reasons"]
                            for side in result["domains"]))
        field = self.call("spatial_field", object_id=self.calibrated["object_id"], window_sizes=[64],
                          stride_xy=[64, 64], max_windows=2, coordinate_domain="pixel", max_size=256,
                          window="none", subtract_mean=True, max_peaks=1,
                          peak_options={"refinement": "none", "threshold_rel": .1})
        domain_map = self.call("domain_map", object_id=field["object_id"], angles_degrees=[0], tolerance=.001,
                               max_size=256, neighbor_policy="support_contact_v1")
        references = self.references(field)
        for row in references:
            row["field_object_id"] = domain_map["object_id"]
        mapped = self.load(references)
        self.assertTrue(mapped["physical_ready"])
        self.assertFalse(mapped["evidence_quality_ready"])
        self.assertTrue(all(side["domain_status"] == "unknown" and side["physical_observations"]
                            for side in mapped["domains"]))


if __name__ == "__main__":
    unittest.main()
