"""Independent synthetic checks of explicit local-ROI atlas composition."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import image_workspace as worker
import image_automation as automation
import image_spatial_atlas as atlas


class SpatialAtlas(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="spatial-atlas-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.counter = 0
        self.source_hashes = {}
        y, x = np.indices((48, 64))
        self.values = np.rint(20000+4000*np.cos(2*np.pi*x/8)+2000*np.cos(2*np.pi*y/6)).astype(np.uint16)
        self.frame = self.open_frame(self.values, "public-local-reflections.tiff")
        self.calibrated = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                                    xy_scale={"x": .02, "y": -.03, "unit": "nm"}, source_text="Explicit synthetic signed XY scale")
        self.rects = [[0,0,32,24], [32,24,64,48]]

    def tearDown(self):
        for filename, original in self.source_hashes.items():
            self.assertEqual(hashlib.sha256(filename.read_bytes()).hexdigest(), original)
        self.temp.cleanup()

    def call(self, action, ok=True, **parameters):
        self.counter += 1
        request = {"workspace": str(self.workspace), "action": action, **parameters}
        if action not in ("get", "result"):
            request.setdefault("request_id", "atlas-test-%d" % self.counter)
        result = worker.execute(request)
        self.assertEqual(result["ok"], ok, result)
        return result["result"] if ok else result

    def open_frame(self, values, name):
        filename = self.root / name
        tifffile.imwrite(filename, values, photometric="minisblack")
        self.source_hashes[filename] = hashlib.sha256(filename.read_bytes()).hexdigest()
        opened = self.call("open", source_path=str(filename))
        return self.call("frame", object_id=opened["object_id"], frame_index=0)

    def run_atlas(self, **parameters):
        options = {"object_id": self.calibrated["object_id"], "rects": self.rects, "window": "none", "subtract_mean": True,
                   "peak_options": {"refinement": "none", "threshold_rel": .1, "min_separation_bins": 1, "exclude_dc_radius_bins": 1},
                   "max_peaks": 8, **parameters}
        return self.call("spatial_atlas", **options)

    def fft_hashes(self):
        return {record["object_id"]: hashlib.sha256(filename.with_name("data.npy").read_bytes()).hexdigest()
                for filename in self.workspace.glob("objects/*/object.json")
                if (record := json.loads(filename.read_text()))["kind"] == "fft"}

    def assert_direct_dft(self, row, values):
        fft = self.call("get", object_id=row["fft_object_id"])
        x0, y0, x1, y1 = row["rect"]
        roi = values[y0:y1, x0:x1].astype(np.float64)
        work = roi-roi.mean()
        height, width = roi.shape
        # Direct DFT matrices, independent of np.fft and the production worker.
        left = np.exp(-2j*np.pi*np.outer(np.arange(height), np.arange(height))/height)
        right = np.exp(-2j*np.pi*np.outer(np.arange(width), np.arange(width))/width)
        expected = left @ work @ right.T
        expected = np.roll(np.roll(expected, height//2, axis=0), width//2, axis=1)
        np.testing.assert_allclose(np.load(fft["array_path"]), expected, rtol=0, atol=1e-6)

    def test_explicit_source_rois_all_bin_dft_signed_geometry_and_recovery(self):
        result = self.run_atlas(request_id="atlas-original")
        self.assertEqual(result["kind"], "spatial_atlas")
        self.assertEqual(result["source_context"]["dtype"], "uint16")
        self.assertEqual(result["source_context"]["frame_object_id"], self.frame["object_id"])
        self.assertEqual([row["rect"] for row in result["regions"]], self.rects)
        self.assertEqual(len(self.fft_hashes()), 2)
        batch = self.call("get", object_id=result["fft_batch_object_id"])
        self.assertEqual(len(batch["regions"]), 2)
        for row in result["regions"]:
            self.assert_direct_dft(row, self.values)
            self.assertEqual(row["status"], "observed")
            self.assertEqual(len(row["measurements"]), 4)
            for measured in row["measurements"]:
                fx, fy = measured["frequency_cycles_per_pixel"]
                self.assertAlmostEqual(measured["d_spacing"], 1/np.hypot(fx/.02, fy/-.03))
                self.assertEqual(measured["interpretation_status"], "hypothesized")
        self.assertEqual(self.call("result", query_request_id="atlas-original"), result)
        self.assertEqual(self.run_atlas(request_id="atlas-original"), result)
        self.assertEqual(self.run_atlas(ok=False, request_id="atlas-original", window="hann")["error"]["code"], "REQUEST_CONFLICT")

    def test_reorder_and_local_revision_reuse_exact_unchanged_spectra_and_measurements(self):
        original = self.run_atlas()
        hashes = self.fft_hashes()
        revised = self.run_atlas(rects=[self.rects[1], self.rects[0]], previous_atlas_id=original["object_id"])
        self.assertEqual(self.fft_hashes(), hashes)
        for new, old in zip(revised["regions"], reversed(original["regions"])):
            self.assertTrue(new["fft_reused"])
            for key in ("fft_object_id", "peaks_object_id", "peak_measurements_object_id", "measurement_object_ids"):
                self.assertEqual(new[key], old[key])
        changed = self.run_atlas(rects=[self.rects[0], [8,12,40,36]], previous_atlas_id=revised["object_id"])
        self.assertTrue(changed["regions"][0]["fft_reused"])
        self.assertFalse(changed["regions"][1]["fft_reused"])
        self.assertEqual(len(self.fft_hashes()), 3)
        self.assertEqual(self.call("get", object_id=changed["object_id"])["regions"], changed["regions"])
        settings = self.run_atlas(previous_atlas_id=changed["object_id"], window="hann")
        self.assertFalse(any(row["fft_reused"] for row in settings["regions"]))
        self.assertEqual(len(self.fft_hashes()), 5)

    def test_manual_correction_follows_exact_roi_after_reorder_and_detector_revision(self):
        original = self.run_atlas()
        row = original["regions"][0]
        old = row["measurements"][0]
        point = [old["frequency_cycles_per_pixel"][0]+.02, old["frequency_cycles_per_pixel"][1]]
        revised_measure = self.call("remeasure", object_id=row["view_object_id"], measurement_object_id=old["measurement_object_id"],
                                   points=[[0,0], point], source_text="Synthetic manual anchor correction")
        selected = [revised_measure["object_id"]]+row["measurement_object_ids"][1:]
        hashes = self.fft_hashes()
        corrected = self.run_atlas(previous_atlas_id=original["object_id"],
                                   measurement_overrides=[{"region_index": 0, "measurement_object_ids": selected}])
        continued = self.run_atlas(rects=list(reversed(self.rects)), previous_atlas_id=corrected["object_id"],
                                   peak_options={"refinement": "none", "threshold_rel": .2, "min_separation_bins": 1, "exclude_dc_radius_bins": 1})
        self.assertEqual(self.fft_hashes(), hashes)
        self.assertEqual(continued["regions"][1]["measurement_object_ids"], selected)
        self.assertEqual(continued["regions"][1]["measurements"][0]["frequency_cycles_per_pixel"], point)
        self.assertEqual(continued["regions"][1]["override_source"], {"request_id": corrected["request_id"], "region_index": 0})
        self.assertEqual(self.call("get", object_id=continued["object_id"])["regions"], continued["regions"])
        self.assertEqual(self.call("get", object_id=original["object_id"])["regions"][0]["measurements"][0], old)

    def test_wrong_roi_or_calibration_override_refused_before_any_child(self):
        original = self.run_atlas()
        wrong = original["regions"][1]["measurement_object_ids"][:1]
        result = self.run_atlas(ok=False, request_id="wrong-roi", previous_atlas_id=original["object_id"],
                                measurement_overrides=[{"region_index": 0, "measurement_object_ids": wrong}])
        self.assertEqual(result["error"]["code"], "MEASUREMENT_SCOPE_MISMATCH")
        self.assertFalse((self.workspace / "requests" / (automation.child_request_id("wrong-roi", "fft-batch")+".json")).exists())
        recalibrated = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                                xy_scale={"x": .04, "y": -.03, "unit": "nm"}, source_text="Changed synthetic scale")
        self.run_atlas(ok=False, object_id=recalibrated["object_id"], previous_atlas_id=original["object_id"])

    def test_partial_failure_exposes_exact_children_and_never_replays(self):
        real = automation.run_child
        def fail_later(workspace, request, label, action, **parameters):
            if label == "region-1-peaks":
                raise RuntimeError("Deliberate partial atlas acceptance fault")
            return real(workspace, request, label, action, **parameters)
        with mock.patch.object(automation, "run_child", side_effect=fail_later):
            self.run_atlas(ok=False, request_id="partial-atlas")
        hashes = self.fft_hashes()
        self.assertEqual(len(hashes), 2)
        result = self.call("result", ok=False, query_request_id="partial-atlas")
        evidence = result["partial_results"]
        self.assertFalse(evidence["automatic_retry"])
        self.assertTrue(any(row["role"] == "measurements" and row["region_index"] == 0 and row["state"] == "completed" for row in evidence["children"]))
        self.assertTrue(any(row["role"] == "fft-batch/fft" and row["region_index"] == 1 and row["state"] == "completed" for row in evidence["children"]))
        self.run_atlas(ok=False, request_id="partial-atlas")
        self.assertEqual(self.fft_hashes(), hashes)

    def test_recovery_refuses_corrupt_array_and_unrelated_preoccupied_batch(self):
        original = self.run_atlas(request_id="atlas-corrupt")
        fft = self.call("get", object_id=original["regions"][0]["fft_object_id"])
        filename = Path(fft["array_path"])
        encoded = filename.read_bytes()
        changed = bytearray(encoded)
        changed[-1] ^= 1
        filename.write_bytes(changed)
        try:
            result = self.call("result", ok=False, query_request_id="atlas-corrupt")
            self.assertEqual(result["error"]["code"], "CORRUPT_OBJECT")
        finally:
            filename.write_bytes(encoded)
        self.assertEqual(self.call("result", query_request_id="atlas-corrupt")["object_id"], original["object_id"])
        occupied = automation.child_request_id("occupied-atlas", "fft-batch")
        wrong = self.call("fft_batch", request_id=occupied, object_id=self.frame["object_id"], rects=self.rects,
                          window="none", subtract_mean=True, max_size=512)
        self.run_atlas(ok=False, request_id="occupied-atlas")
        partial = self.call("result", ok=False, query_request_id="occupied-atlas")["partial_results"]
        entry = next(row for row in partial["children"] if row["request_id"] == occupied)
        self.assertEqual(entry["state"], "unrelated")
        self.assertNotIn("object_id", entry)
        self.assertFalse(any(row.get("object_id") == wrong["object_id"] for row in partial["children"]))
        # Matching pixels/settings still do not make a differently requested
        # reuse operation the original atlas child.
        occupied_reuse = automation.child_request_id("occupied-reuse-atlas", "fft-batch")
        self.call("fft_batch", request_id=occupied_reuse, object_id=self.calibrated["object_id"], rects=self.rects,
                  window="none", subtract_mean=True, max_size=512, previous_batch_id=original["fft_batch_object_id"])
        self.run_atlas(ok=False, request_id="occupied-reuse-atlas")
        partial = self.call("result", ok=False, query_request_id="occupied-reuse-atlas")["partial_results"]
        self.assertEqual(next(row for row in partial["children"] if row["request_id"] == occupied_reuse)["state"], "unrelated")

    def test_constant_roi_retains_not_detected_and_pixel_only_units(self):
        values = self.values.copy()
        values[24:48,32:64] = 100
        frame = self.open_frame(values, "public-low-information-control.tiff")
        result = self.run_atlas(object_id=frame["object_id"])
        row = result["regions"][1]
        self.assertEqual(row["status"], "not_detected")
        self.assertEqual(row["measurements"], [])
        self.assertIsNotNone(row["detection_quality"]["empty_reason"])
        self.assertTrue(all(item["d_spacing"] is None and item["d_spacing_unit"] is None for item in result["regions"][0]["measurements"]))
        self.assertEqual(self.call("get", object_id=result["object_id"])["regions"], result["regions"])

    def test_signed_float32_preserved_in_source_and_direct_dft(self):
        y, x = np.indices((48, 64))
        values = (-1.25+np.cos(2*np.pi*x/8)+.5*np.cos(2*np.pi*y/6)).astype(np.float32)
        frame = self.open_frame(values, "public-negative-float32.tiff")
        np.testing.assert_array_equal(np.load(frame["array_path"]), values)
        result = self.run_atlas(object_id=frame["object_id"])
        self.assertEqual(result["source_context"]["dtype"], "float32")
        self.assertLess(float(values.min()), 0)
        for row in result["regions"]:
            self.assert_direct_dft(row, values)
        self.assertEqual(self.call("get", object_id=result["object_id"])["source_context"]["dtype"], "float32")

    def test_all_rois_preflight_and_complex_or_frequency_inputs_refuse(self):
        for index, rects in enumerate(([self.rects[0], [0,0,65,48]], [self.rects[0], self.rects[0]], [[0,0,3,3]], self.rects*5)):
            request_id = "bad-atlas-%d" % index
            self.run_atlas(ok=False, request_id=request_id, rects=rects)
            self.assertFalse((self.workspace / "requests" / (automation.child_request_id(request_id, "fft-batch")+".json")).exists())
        good = self.run_atlas()
        self.run_atlas(ok=False, object_id=good["regions"][0]["fft_object_id"])


if __name__ == "__main__":
    unittest.main()
