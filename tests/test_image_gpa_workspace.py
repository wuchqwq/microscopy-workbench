"""Real workspace journal/array integration on synthetic TIFF inputs only."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker


class GPAWorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="microscopy-gpa-workspace-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.workspace = self.root / "workspace"
        self.counter = 0
        y, x = np.indices((304, 320), dtype=float)
        image = np.cos(2 * np.pi * .125 * x) + np.cos(2 * np.pi * .125 * y)
        self.source = self.root / "synthetic-lattice.tiff"
        tifffile.imwrite(self.source, image.astype(np.float32))
        self.source_hash = worker.sha_file(self.source)
        opened = self.call("open", source_path=str(self.source))
        self.frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        self.calibration = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                                     xy_scale={"x": .02, "y": -.035, "unit": "nm"},
                                     source_text="Synthetic signed anisotropic metric; not independently verified")
        self.view = self.call("view", object_id=self.calibration["object_id"], rect=[16, 24, 288, 280], max_size=256)
        self.fft = self.call("fft", object_id=self.view["object_id"], rect=[8, 0, 264, 256],
                             window="none", subtract_mean=True, max_size=256)
        self.parameters = dict(object_id=self.fft["object_id"], g_vectors=[[.125, 0], [0, .125]],
                               mask_sigma=.018, reference_rect=[80, 80, 176, 176], reference_mode="fixed_g",
                               reference_text="Synthetic two-reflection undeformed real-space lattice basis", max_size=256,
                               source_domain="real_space_lattice", source_domain_text="Known synthetic spatial lattice generated for GPA")

    def request(self, action, request_id=None, **kwargs):
        self.counter += 1
        return dict(workspace=str(self.workspace), action=action,
                    **({"request_id": request_id or "integration_%d" % self.counter} if action not in ("get", "result") else {}),
                    **kwargs)

    def call(self, action, **kwargs):
        response = worker.execute(self.request(action, **kwargs))
        self.assertTrue(response["ok"], response)
        return response["result"]

    def fft_objects(self):
        return {p.parent.name for p in (self.workspace / "objects").glob("*/object.json")
                if worker.read_json(p)["kind"] == "fft"}

    def test_full_pipeline_mapping_arrays_read_export_revision_and_recovery(self):
        before_fft = self.fft_objects()
        protected = {p: worker.sha_file(p) for p in (self.workspace / "objects").glob("*/data.npy")}
        gpa = self.call("gpa", request_id="saved_gpa_request", **self.parameters)
        self.assertFalse(gpa["fft_recomputed"])
        self.assertEqual(gpa["input_dependency"]["source_mapping"]["source_object_id"], self.frame["object_id"])
        self.assertEqual(gpa["input_dependency"]["source_mapping"]["source_rect_xyxy"], [24, 24, 280, 280])
        self.assertEqual(gpa["report"]["coordinate_domain"], "physical_cartesian_nm")
        self.assertEqual(gpa["report"]["calibration_nm_xy"], [.02, -.035])
        self.assertFalse(gpa["material_strain_verified"])
        self.assertEqual(gpa["array_manifest"]["strain_green_lagrange_xy"]["shape"], [256, 256, 2, 2])
        self.assertEqual(gpa["array_manifest"]["mask_frequency"]["axes"], "reflection,fy,fx")
        self.assertEqual(gpa["array_manifest"]["mask_frequency"]["coordinate_domain"], "fft_frequency_grid")
        self.assertEqual(gpa["array_manifest"]["phase_unwrap_discontinuity"]["axes"], "reflection,y,x")
        self.assertEqual(gpa["array_manifest"]["displacement_nm_xy"]["unit"], "nm")
        read = self.call("gpa_read", object_id=gpa["object_id"], points=[[128, 128], [0, 0]])
        self.assertTrue(read["samples"][0]["tensor_valid"])
        self.assertEqual(read["samples"][0]["ux_unit"], "nm")
        self.assertEqual(read["samples"][0]["rotation_unit"], "degree")
        self.assertFalse(read["samples"][1]["phase_valid"])
        self.assertIsNone(read["samples"][1]["exx"])
        self.assertIsNone(read["samples"][1]["ux"])
        sample_export = self.call("export", object_id=read["object_id"], output_dir=str(self.root / "exported-samples"))
        self.assertEqual(worker.sha_file(Path(sample_export["output_dir"]) / "gpa-samples.json"),
                         read["files_sha256"]["gpa-samples.json"])
        self.assertEqual(worker.sha_file(Path(sample_export["output_dir"]) / "gpa-samples.csv"),
                         read["files_sha256"]["gpa-samples.csv"])
        rendered = self.call("gpa_view", object_id=read["object_id"], component="rotation", max_size=256)
        self.assertEqual(rendered["display"]["component"], "rotation")
        self.assertFalse(rendered["gpa_recomputed"])
        exported = self.call("export", object_id=rendered["object_id"], output_dir=str(self.root / "exported-gpa"))
        output = Path(exported["output_dir"])
        self.assertEqual(worker.sha_file(output / "preview.png"), worker.sha_file(rendered["image_path"]))
        self.assertEqual(worker.sha_file(output / "strain_green_lagrange_xy.npy"),
                         gpa["files_sha256"]["strain_green_lagrange_xy.npy"])
        manifest = worker.read_json(output / "manifest.json")
        self.assertEqual(manifest["scientific_object"]["object_id"], gpa["object_id"])
        self.assertEqual(manifest["display_object"]["object_id"], rendered["object_id"])
        for name, expected in exported["exported_files_sha256"].items():
            self.assertEqual(worker.sha_file(output / name), expected)
        revision = self.call("gpa", **{**self.parameters, "mask_sigma": .02,
                                       "previous_gpa_id": gpa["object_id"], "reference_mode": "fit_reference"})
        self.assertEqual(revision["history"][0]["object_id"], gpa["object_id"])
        self.assertEqual(revision["input_dependency"]["fft"], gpa["input_dependency"]["fft"])
        revision_export = self.call("export", object_id=revision["object_id"], output_dir=str(self.root / "exported-revision"))
        revision_provenance = worker.read_json(Path(revision_export["output_dir"]) / "provenance.json")
        self.assertIn(gpa["object_id"], revision_provenance["objects"])
        recovered = self.call("result", query_request_id="saved_gpa_request")
        self.assertEqual(recovered["object_id"], gpa["object_id"])
        replayed = self.call("gpa", request_id="saved_gpa_request", **self.parameters)
        self.assertEqual(replayed, recovered)
        self.assertEqual(self.call("get", object_id=revision["object_id"])["object_id"], revision["object_id"])
        self.assertEqual(self.fft_objects(), before_fft)
        self.assertEqual(worker.sha_file(self.source), self.source_hash)
        for path, expected in protected.items():
            self.assertEqual(worker.sha_file(path), expected)

    def test_conflict_hann_source_and_different_fft_revision_refused(self):
        first = self.call("gpa", request_id="same_id", **self.parameters)
        conflict = worker.execute(self.request("gpa", request_id="same_id", **{**self.parameters, "mask_sigma": .02}))
        self.assertFalse(conflict["ok"])
        self.assertEqual(conflict["error"]["code"], "REQUEST_CONFLICT")
        frame_input = worker.execute(self.request("gpa", **{**self.parameters, "object_id": self.frame["object_id"]}))
        self.assertFalse(frame_input["ok"])
        self.assertEqual(frame_input["error"]["code"], "UNSUPPORTED_OPERATION")
        hann = self.call("fft", object_id=self.view["object_id"], rect=[8, 0, 264, 256], window="hann", max_size=256)
        before_fft = self.fft_objects()
        bad_window = worker.execute(self.request("gpa", **{**self.parameters, "object_id": hann["object_id"]}))
        self.assertFalse(bad_window["ok"])
        self.assertEqual(bad_window["error"]["code"], "UNSUPPORTED_OPERATION")
        other = self.call("fft", object_id=self.view["object_id"], rect=[0, 0, 256, 256], window="none", max_size=256)
        wrong_revision = worker.execute(self.request("gpa", **{**self.parameters, "object_id": other["object_id"],
                                                               "previous_gpa_id": first["object_id"]}))
        self.assertFalse(wrong_revision["ok"])
        self.assertIn("exact FFT producer", wrong_revision["error"]["message"])
        self.assertEqual(self.fft_objects(), before_fft | {other["object_id"]})
        self.assertEqual(worker.sha_file(self.source), self.source_hash)

    def test_missing_explicit_source_domain_is_refused(self):
        without_domain = {key: value for key, value in self.parameters.items()
                          if key not in ("source_domain", "source_domain_text")}
        response = worker.execute(self.request("gpa", **without_domain))
        self.assertFalse(response["ok"])
        self.assertIn("source_domain", response["error"]["message"])

    def test_selected_fft_calibration_wrapper_drives_physical_units(self):
        selected = self.call("calibrate", object_id=self.fft["object_id"], scope="image",
                             xy_scale={"x": .03, "y": -.06, "unit": "nm"},
                             source_text="Synthetic revised FFT-source metric, preserving original FFT")
        frequency_view = self.call("view", object_id=selected["object_id"], representation="amplitude",
                                   frequency_rect=[112, 112, 176, 176], max_size=256)
        before_fft = self.fft_objects()
        gpa = self.call("gpa", **{**self.parameters, "object_id": frequency_view["object_id"]})
        self.assertEqual(gpa["report"]["shape_yx"], [256, 256])
        self.assertEqual(gpa["report"]["calibration_nm_xy"], [.03, -.06])
        self.assertEqual(gpa["input_dependency"]["selected"]["object_id"], frequency_view["object_id"])
        self.assertEqual(gpa["input_dependency"]["fft"]["object_id"], self.fft["object_id"])
        self.assertEqual(gpa["calibration_dependency"]["calibration_id"], selected["object_id"])
        self.assertEqual(self.fft_objects(), before_fft)
        self.assertEqual(worker.sha_file(Path(self.fft["array_path"])), self.fft["files_sha256"]["data.npy"])

    def test_recalibrated_read_cannot_export_old_samples_under_new_metric(self):
        gpa = self.call("gpa", **self.parameters)
        read = self.call("gpa_read", object_id=gpa["object_id"], points=[[128, 128]])
        revised = self.call("calibrate", object_id=read["object_id"], scope="image",
                            xy_scale={"x": .04, "y": -.07, "unit": "nm"},
                            source_text="Synthetic later scale; saved GPA samples must not be relabelled")
        response = worker.execute(self.request("export", object_id=revised["object_id"],
                                               output_dir=str(self.root / "stale-export")))
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "STALE_CALIBRATION_RESULT")

    def test_known_reciprocal_scalar_source_is_refused(self):
        reciprocal = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                               xy_scale={"x": .01, "y": .01, "unit": "1/nm"}, coordinate_domain="reciprocal_space",
                               declare_reciprocal=True, source_text="Synthetic explicit reciprocal-image interpretation for negative boundary check")
        fft = self.call("fft", object_id=reciprocal["object_id"], rect=[24, 24, 280, 280], window="none", max_size=256)
        response = worker.execute(self.request("gpa", **{**self.parameters, "object_id": fft["object_id"]}))
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "UNSUPPORTED_OPERATION")

    def test_unknown_metric_stays_in_image_coordinates(self):
        fft = self.call("fft", object_id=self.frame["object_id"], rect=[24, 24, 280, 280], window="none", max_size=256)
        before_fft = self.fft_objects()
        gpa = self.call("gpa", **{**self.parameters, "object_id": fft["object_id"]})
        self.assertEqual(gpa["report"]["coordinate_domain"], "image_coordinate")
        self.assertIsNone(gpa["report"]["calibration_nm_xy"])
        self.assertNotIn("displacement_nm_xy", gpa["array_manifest"])
        read = self.call("gpa_read", object_id=gpa["object_id"], points=[[128, 128]])
        self.assertEqual(read["samples"][0]["ux_unit"], "pixel")
        self.assertEqual(read["samples"][0]["exx_unit"], "image-coordinate only")
        self.assertEqual(read["samples"][0]["rotation_unit"], "image-coordinate degree")
        self.assertEqual(self.fft_objects(), before_fft)


if __name__ == "__main__":
    unittest.main()
