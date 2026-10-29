"""Public synthetic acceptance of bounded operation composition."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import image_workspace as worker
from image_automation import child_request_id


class Automation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.n = 0
        y, x = np.indices((48, 64))
        self.values = np.rint(20000+4000*np.cos(2*np.pi*x/8)+2000*np.cos(2*np.pi*y/12)).astype(np.uint16)
        self.source = self.root / "two-tones.tiff"
        tifffile.imwrite(self.source, self.values, photometric="minisblack")
        self.hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        opened = self.call("open", source_path=str(self.source))
        self.frame = self.call("frame", object_id=opened["object_id"], frame_index=0)

    def tearDown(self):
        self.assertEqual(self.hash, hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.temp.cleanup()

    def call(self, action, ok=True, **parameters):
        self.n += 1
        request = dict(action=action, workspace=str(self.root / "workspace"), **parameters)
        if action not in ("get", "result"):
            request.setdefault("request_id", "auto-test-%d" % self.n)
        result = worker.execute(request)
        self.assertEqual(result["ok"], ok, result)
        return result["result"] if ok else result

    def test_regions_batch_reuse_recovery_measurements_and_revision(self):
        calibrated = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                               xy_scale={"x": .02, "y": -.03, "unit": "nm"}, source_text="Synthetic signed anisotropic scale")
        proposal = self.call("roi_propose", object_id=calibrated["object_id"], window_sizes=[24,48], max_regions=4)
        self.assertEqual({r["window_size"] for r in proposal["regions"]}, {24,48})
        self.assertEqual(proposal["source_context"]["dtype"], "uint16")
        self.assertEqual(proposal["source_context"]["source_identity"]["sha256"], self.hash)
        self.assertEqual(proposal["source_context"]["frame_index"], 0)
        self.assertEqual(proposal["source_context"]["xy_calibration"], calibrated["xy_calibration"])
        rects = [[0,0,64,48], [0,0,32,24]]
        batch = self.call("fft_batch", request_id="batch1", object_id=calibrated["object_id"], rects=rects,
                          window="none", subtract_mean=True)
        repeat = self.call("fft_batch", request_id="batch1", object_id=calibrated["object_id"], rects=rects,
                           window="none", subtract_mean=True)
        self.assertEqual(batch, repeat)
        self.assertEqual(batch, self.call("result", query_request_id="batch1"))
        self.call("fft_batch", ok=False, request_id="batch1", object_id=calibrated["object_id"], rects=rects[:1])
        revised = self.call("fft_batch", object_id=calibrated["object_id"], rects=[rects[0],[8,12,40,36]],
                            window="none", subtract_mean=True, previous_batch_id=batch["object_id"])
        self.assertTrue(revised["regions"][0]["fft_reused"])
        self.assertEqual(revised["regions"][0]["fft_object_id"],batch["regions"][0]["fft_object_id"])
        self.assertFalse(revised["regions"][1]["fft_reused"])
        fft = self.call("get", object_id=batch["regions"][0]["fft_object_id"])
        original_spectrum = Path(fft["array_path"]).read_bytes()
        detected = self.call("peaks", object_id=fft["object_id"], refinement="none", threshold_rel=.1)
        measured = self.call("peak_measurements", object_id=detected["object_id"])
        self.assertEqual(len(measured["measurements"]),4)
        self.assertEqual(measured["calibration_dependency"], detected["peak_table"][0]["calibration_dependency"])
        for row in measured["measurements"]:
            g = row["frequency_cycles_per_pixel"]
            self.assertAlmostEqual(row["d_spacing"],1/np.hypot(g[0]/.02,g[1]/-.03))
            self.assertEqual(row["status"],"hypothesized")
        first = measured["measurements"][0]
        old = self.call("get",object_id=first["measurement_object_id"])
        new = self.call("remeasure",object_id=detected["object_id"],measurement_object_id=old["object_id"],
                        points=[[0,0],[.15,0]],source_text="Synthetic user correction of this anchor")
        self.assertNotEqual(new["object_id"],old["object_id"])
        self.assertEqual(Path(fft["array_path"]).read_bytes(),original_spectrum)
        for row in measured["measurements"][1:]:
            self.assertEqual(self.call("get",object_id=row["measurement_object_id"])["d_spacing"],row["d_spacing"])
        # Actual transform: a direct DFT coefficient, not merely matching two FFT implementations.
        expected = sum((float(self.values[y,x])-self.values.mean())*np.exp(-2j*np.pi*x/8)
                       for y in range(48) for x in range(64))
        self.assertLess(abs(np.load(fft["array_path"])[24,40]-expected),1e-6)

    def test_no_scale_invalid_domain_and_preflight(self):
        batch = self.call("fft_batch",object_id=self.frame["object_id"],rects=[[0,0,64,48]],window="none")
        peaks = self.call("peaks",object_id=batch["regions"][0]["fft_object_id"],refinement="none",threshold_rel=.1)
        measurements = self.call("peak_measurements",object_id=peaks["object_id"])
        self.assertTrue(all(r["d_spacing"] is None and r["d_spacing_unit"] is None for r in measurements["measurements"]))
        self.call("roi_propose",ok=False,object_id=peaks["object_id"])
        self.call("peak_measurements",ok=False,object_id=peaks["object_id"],peak_ids=["missing"])
        self.call("fft_batch",ok=False,request_id="invalid-rects",object_id=self.frame["object_id"],rects=[[0,0,64,48],[0,0,65,48]])
        child = self.root / "workspace" / "requests" / (child_request_id("invalid-rects","fft-0")+".json")
        self.assertFalse(child.exists(),"Validate complete batch before starting children")

    def test_export_missing_parent_is_not_existing_destination(self):
        missing = self.call("export",ok=False,object_id=self.frame["object_id"],output_dir=str(self.root/"missing"/"result"))
        self.assertEqual(missing["error"]["code"],"OUTPUT_PARENT_MISSING")
        existing = self.call("export",ok=False,object_id=self.frame["object_id"],output_dir=str(self.root))
        self.assertEqual(existing["error"]["code"],"OUTPUT_EXISTS")
        saved = self.call("export",object_id=self.frame["object_id"],output_dir=str(self.root/"new-result"))
        np.testing.assert_array_equal(np.load(Path(saved["output_dir"])/"data.npy"),self.values)

    def test_aggregate_recovery_revalidates_child_science_and_original_parameters(self):
        batch = self.call("fft_batch", request_id="recover-child", object_id=self.frame["object_id"],
                          rects=[[0,0,32,24]], window="none")
        fft = self.call("get", object_id=batch["regions"][0]["fft_object_id"])
        array = Path(fft["array_path"])
        original = array.read_bytes()
        damaged = bytearray(original)
        damaged[-1] ^= 1
        array.write_bytes(damaged)
        try:
            failed = self.call("result", ok=False, query_request_id="recover-child")
            self.assertEqual(failed["error"]["code"], "CORRUPT_OBJECT")
        finally:
            array.write_bytes(original)
        self.assertEqual(self.call("result", query_request_id="recover-child")["object_id"], batch["object_id"])
        journal = self.root / "workspace" / "requests" / (fft["request_id"]+".json")
        encoded = journal.read_bytes()
        original_record = json.loads(encoded)
        original_record["parameters"]["window"] = "hann"
        journal.write_text(json.dumps(original_record), encoding="utf8")
        try:
            failed = self.call("result", ok=False, query_request_id="recover-child")
            self.assertEqual(failed["error"]["code"], "CORRUPT_OBJECT")
        finally:
            journal.write_bytes(encoded)

    def test_changed_settings_do_not_reuse_and_missing_measurement_is_not_success(self):
        batch = self.call("fft_batch", object_id=self.frame["object_id"], rects=[[0,0,64,48]], window="none")
        changed = self.call("fft_batch", object_id=self.frame["object_id"], rects=[[0,0,64,48]], window="hann",
                            previous_batch_id=batch["object_id"])
        self.assertFalse(changed["regions"][0]["fft_reused"])
        self.assertNotEqual(changed["regions"][0]["fft_object_id"], batch["regions"][0]["fft_object_id"])
        calibrated = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                               xy_scale={"x": .04, "y": -.02, "unit": "nm"}, source_text="Changed synthetic scale")
        self.call("fft_batch", ok=False, object_id=calibrated["object_id"], rects=[[0,0,64,48]],
                  previous_batch_id=batch["object_id"])
        peaks = self.call("peaks", object_id=batch["regions"][0]["fft_object_id"], threshold_rel=.1, refinement="none")
        measurements = self.call("peak_measurements", request_id="measure-recover", object_id=peaks["object_id"], max_peaks=2)
        child = self.root / "workspace" / "requests" / (measurements["measurements"][0]["measurement_request_id"]+".json")
        encoded = child.read_bytes()
        child.unlink()
        try:
            self.call("result", ok=False, query_request_id="measure-recover")
        finally:
            child.write_bytes(encoded)


if __name__ == "__main__":
    unittest.main()
