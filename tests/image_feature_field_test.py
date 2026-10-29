"""Sparse-feature scientific records and display mapping; public synthetic data."""
import copy
import csv
import io
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import image_feature_field as field
import image_workspace as worker


class SparseField(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sparse-field-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.n = 0
        self.sources = {}
        y, x = np.indices((64,64))
        periodic = .2+3*np.cos(2*np.pi*5*x/64)+2*np.cos(2*np.pi*10*y/64)
        noise = np.random.default_rng(6192).normal(size=(64,64))
        self.values = np.concatenate([periodic, np.full((64,64), -.375), noise], axis=1).astype(np.float32)
        self.frame = self.open_frames(self.values, "public-features.tiff")[0]
        self.calibrated = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                                   xy_scale={"x": .02, "y": -.03, "unit": "nm"}, source_text="Synthetic signed anisotropic scale, not instrument calibration")
        self.rects = [[0,0,64,64],[64,0,128,64],[128,0,192,64]]
        self.options = {"rects": self.rects, "window": "none", "subtract_mean": True, "max_peaks": 8,
                        "peak_options": {"refinement": "none", "threshold_rel": .1}}

    def tearDown(self):
        for filename, digest in self.sources.items():
            self.assertEqual(worker.sha_file(filename), digest)
        self.temp.cleanup()

    def call(self, action, ok=True, **parameters):
        self.n += 1
        request = {"action": action, "workspace": str(self.workspace), **parameters}
        if action not in ("get", "result"):
            request.setdefault("request_id", "field-test-%d" % self.n)
        response = worker.execute(request)
        self.assertEqual(response["ok"], ok, response)
        return response["result"] if ok else response

    def open_frames(self, values, name):
        filename = self.root / name
        tifffile.imwrite(filename, values, photometric="minisblack", metadata={"axes": "QYX"} if values.ndim == 3 else None)
        self.sources[filename] = worker.sha_file(filename)
        opened = self.call("open", source_path=str(filename))
        return [self.call("frame", object_id=opened["object_id"], frame_index=i) for i in range(values.shape[0] if values.ndim == 3 else 1)]

    def atlas(self, calibrated=True):
        return self.call("spatial_atlas", object_id=(self.calibrated if calibrated else self.frame)["object_id"], **self.options)

    def arrays(self):
        return {str(filename): worker.sha_file(filename) for filename in self.workspace.glob("objects/*/*.npy")}

    def test_physical_vectors_periods_centers_masks_and_exact_display_mapping(self):
        atlas = self.atlas()
        before = self.arrays()
        result = self.call("feature_field", object_id=atlas["object_id"], coordinate_domain="physical", display_feature="shortest_period", max_size=768)
        self.assertEqual(result["sampling"], "irregular_sampling")
        self.assertIsNone(result["stride_xy"])
        self.assertFalse(result["interpolated"])
        self.assertFalse(result["fft_recomputed"])
        self.assertEqual(result["fft_parameters"], {"window": "none", "subtract_mean": True})
        sample, constant, noise = result["samples"]
        self.assertEqual(sample["status"], "valid")
        self.assertEqual(sample["center_xy"], [31.5,31.5])
        self.assertEqual(sample["rect_xyxy"], self.rects[0])
        self.assertEqual(sample["source_array"]["dtype"], "float32")
        self.assertEqual(sample["source_array"]["shape_yx"], [64,192])
        self.assertEqual(sample["features"]["family_count"], 2)
        np.testing.assert_allclose(sorted(f["period"] for f in sample["features"]["families"]), [.192,.256], rtol=0, atol=1e-14)
        self.assertAlmostEqual(sample["features"]["shortest_period"], .192)
        self.assertEqual(sorted(f["direction_angle_mod180"] for f in sample["features"]["families"]), [0.,90.])
        self.assertAlmostEqual(sample["features"]["pairwise_angles_degrees"][0]["acute_line_angle_degrees"], 90.)
        self.assertEqual(sum(len(f["measurement_object_ids"]) for f in sample["features"]["families"]), 4)
        # Individual raw members preserve signs even though the representative
        # uses an antipodal half-plane. Physical q_y uses the negative Y scale.
        for family in sample["features"]["families"]:
            for member in family["members"]:
                fx, fy = member["frequency_cycles_per_pixel"]
                np.testing.assert_allclose(member["vector_xy"], [fx/.02, fy/-.03], atol=1e-14)
        self.assertEqual(constant["status"], "insufficient_evidence")
        self.assertIsNone(constant["display_value"])
        self.assertIsNone(constant["features"]["shortest_period"])
        self.assertEqual(noise["status"], "ambiguous")
        self.assertIsNone(noise["display_value"])
        self.assertTrue(noise["quality"]["detection_truncated"])
        plan = result["field_image"]
        self.assertEqual(len(plan["hotspots"]), 3)
        self.assertLessEqual(plan["height"], 2048)
        panel = plan["panels"][0]
        sx0, sy0, sx1, sy1 = panel["base"]["source_panel"]["source_rect_xyxy"]
        px0, py0, px1, py1 = panel["base"]["source_panel"]["image_rect_xyxy"]
        dx0, dy0, dx1, dy1 = panel["image_rect_xyxy"]
        ow, oh = panel["base"]["original_size"]
        expected = [dx0+(px0+(self.rects[0][0]-sx0)*(px1-px0)/(sx1-sx0))*(dx1-dx0)/ow,
                    dy0+(py0+(self.rects[0][1]-sy0)*(py1-py0)/(sy1-sy0))*(dy1-dy0)/oh,
                    dx0+(px0+(self.rects[0][2]-sx0)*(px1-px0)/(sx1-sx0))*(dx1-dx0)/ow,
                    dy0+(py0+(self.rects[0][3]-sy0)*(py1-py0)/(sy1-sy0))*(dy1-dy0)/oh]
        np.testing.assert_allclose(plan["hotspots"][0]["rect_xyxy"], expected, atol=1e-12)
        with Image.open(result["image_path"]) as image:
            self.assertEqual(image.size, (plan["width"], plan["height"]))
        self.assertEqual(self.arrays(), before)
        self.assertEqual(result, self.call("get", object_id=result["object_id"]))

    def test_unknown_scale_stays_null_csv_blank_and_comparison_hypotheses_stay_explicit(self):
        atlas = self.atlas(calibrated=False)
        comparison = self.call("local_signature_compare", object_id=atlas["object_id"], reference_index=0,
                               target_indices=[1,2], angles_degrees=[0.,90.], coordinate_domain="pixel", tolerance=.001)
        before = self.arrays()
        result = self.call("feature_field", object_id=comparison["object_id"], coordinate_domain="physical", display_feature="family_count")
        self.assertEqual(result["source_kind"], "local_signature_compare")
        self.assertEqual(result["source_parent_object_id"], atlas["object_id"])
        self.assertEqual(result["comparison_hypotheses"]["coordinate_domain"], "pixel")
        self.assertEqual(result["comparison_hypotheses"]["relations"], comparison["relations"])
        self.assertTrue(all(s["features"]["family_count"] is None and s["features"]["shortest_period"] is None for s in result["samples"]))
        self.assertTrue(all(s["status"] == "insufficient_evidence" and s["display_value"] is None for s in result["samples"]))
        self.assertEqual(result["samples"][0]["measurement_object_ids"], [m["measurement_object_id"] for m in atlas["regions"][0]["measurements"]])
        rows = list(csv.DictReader(io.StringIO(Path(result["table_path"]).read_text())))
        self.assertTrue(all(row["family_count"] == "" and row["shortest_period"] == "" and row["period"] == "" for row in rows))
        self.assertEqual(Path(result["field_path"]).name, "feature-field.json")
        self.assertEqual(Path(result["table_path"]).name, "feature-field.csv")
        self.assertEqual(self.arrays(), before)

    def test_r2_keeps_actual_source_coordinates_mapping_basis_and_invalid_frame(self):
        y, x = np.indices((64,80))
        base = 3*np.cos(2*np.pi*x/8)+2*np.cos(2*np.pi*y/12)
        frames = self.open_frames(np.stack([base, base+.1, base+.2]).astype(np.float32), "public-sequence.tiff")
        sequence = self.call("sequence_create", frames=[{"object_id": frame["object_id"]} for frame in frames],
                             axis={"meaning": "reconstruction_depth", "source_text": "Synthetic selected order only; no resolved physical depth"})
        correspondence = self.call("region_correspondence", sequence_object_id=sequence["object_id"], reference_index=0,
                                   rect=[8,8,56,56], mode="translation", source_text="Synthetic coordinate declaration, not independent registration",
                                   translations=[{"frame_index": 1, "shift_xy": [3,-2]}])
        joint = self.call("joint_observations", correspondence_object_id=correspondence["object_id"], window="none", subtract_mean=True,
                          peak_options={"refinement": "none", "threshold_rel": .1}, max_peaks=8)
        before = self.arrays()
        result = self.call("feature_field", object_id=joint["object_id"], coordinate_domain="pixel", display_feature="family_count")
        self.assertEqual([s["index_kind"] for s in result["samples"]], ["frame_index"]*3)
        first, second, missing = result["samples"]
        self.assertEqual(first["rect_xyxy"], [8,8,56,56])
        self.assertEqual(second["rect_xyxy"], [11,6,59,54])
        self.assertEqual(second["center_xy"], [34.5,29.5])
        self.assertEqual(second["reference_rect_xyxy"], [8,8,56,56])
        self.assertEqual(second["shift_xy"], [3,-2])
        self.assertEqual(second["mapping_evidence"], correspondence["rows"][1])
        self.assertEqual(second["frame_identity"]["source_frame_index"], 1)
        self.assertEqual(second["frame_identity"]["frame_object_id"], frames[1]["object_id"])
        self.assertEqual(missing["status"], "insufficient_evidence")
        self.assertIsNone(missing["rect_xyxy"])
        self.assertIsNone(missing["center_xy"])
        self.assertEqual(missing["measurement_object_ids"], [])
        self.assertEqual(missing["mapping_evidence"]["status"], "UNVERIFIED")
        self.assertEqual(len(result["field_image"]["panels"]), 3)
        self.assertEqual(len(result["field_image"]["hotspots"]), 2)
        self.assertEqual(self.arrays(), before)

    def test_formal_recovery_json_csv_validation_and_source_corruption(self):
        atlas = self.atlas()
        parameters = {"object_id": atlas["object_id"], "coordinate_domain": "pixel", "display_feature": "family_count"}
        saved = self.call("feature_field", request_id="original-feature-field", **parameters)
        count = len(list((self.workspace / "objects").iterdir()))
        self.assertEqual(saved, self.call("feature_field", request_id="original-feature-field", **parameters))
        self.assertEqual(saved, self.call("result", query_request_id="original-feature-field"))
        self.assertEqual(count, len(list((self.workspace / "objects").iterdir())))
        self.assertEqual(json.loads(Path(saved["field_path"]).read_text())["samples"], saved["samples"])
        workspace = worker.Workspace(str(self.workspace), writable=False)
        tampered = copy.deepcopy(saved)
        tampered["samples"][0]["center_xy"] = [32.,32.]
        with self.assertRaisesRegex(ValueError, "numerical/spatial sources"):
            field.validate_references(workspace, tampered, worker)
        source_array = self.workspace / "objects" / self.frame["object_id"] / "data.npy"
        raw = bytearray(source_array.read_bytes())
        raw[-1] ^= 1
        source_array.write_bytes(raw)
        failed = self.call("get", ok=False, object_id=saved["object_id"])
        self.assertEqual(failed["error"]["code"], "CORRUPT_OBJECT")


class SmallNumerics(unittest.TestCase):
    def test_independent_three_four_five_period_and_unoriented_pair_angle(self):
        entry = {"geometry_status": "admitted", "families": [
            {"family_id": "g1", "vector_xy": [3.,4.], "measurement_object_ids": ["p","minus-p"], "members": []},
            {"family_id": "g2", "vector_xy": [0.,5.], "measurement_object_ids": ["q"], "members": []}]}
        value = field.features(entry, worker)
        self.assertEqual(value["shortest_period"], .2)
        self.assertEqual([f["period"] for f in value["families"]], [.2,.2])
        self.assertAlmostEqual(value["families"][0]["direction_angle_mod180"], 53.13010235415598)
        self.assertAlmostEqual(value["pairwise_angles_degrees"][0]["acute_line_angle_degrees"], 36.86989764584402)

    def test_explicit_settings(self):
        base = {"coordinate_domain": "pixel", "display_feature": "family_count"}
        self.assertEqual(field.settings(base, worker), ("pixel", "family_count", 768))
        for change in ({"coordinate_domain": "auto"}, {"display_feature": "phase"}, {"max_size": 255}, {"max_size": 1025}, {"max_size": True}):
            with self.assertRaises(ValueError):
                field.settings({**base, **change}, worker)


if __name__ == "__main__":
    unittest.main()
