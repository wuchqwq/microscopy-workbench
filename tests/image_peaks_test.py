"""Numerical and journal tests for formal image_peaks, without private inputs."""
from pathlib import Path
import hashlib
import math
import sys
import tempfile
import unittest

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import image_workspace as worker
import image_peaks


class PeakDetection(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="image-peaks-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.sequence = 0
        y, x = np.indices((48, 64))
        # Two known orthogonal tones; conjugate pairs are not four independent
        # lattice observations. Quantization remains explicit uint16 input.
        self.values = np.rint(20000 + 4000*np.cos(2*np.pi*x/8) + 2000*np.cos(2*np.pi*y/12)).astype(np.uint16)
        self.source = self.root / "public-periodic.tiff"
        tifffile.imwrite(self.source, self.values, photometric="minisblack")

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, ok=True, request_id=None, **args):
        self.sequence += 1
        request = {"action": action, "workspace": str(self.workspace), **args}
        if action not in ("get", "result"):
            request["request_id"] = request_id or "peaks-"+str(self.sequence)
        response = worker.execute(request)
        self.assertEqual(response["ok"], ok, response)
        return response["result"] if ok else response

    def fft(self, calibrated=False):
        opened = self.call("open", source_path=str(self.source))
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        operand = frame
        if calibrated:
            operand = self.call("calibrate", object_id=frame["object_id"], scope="image",
                                xy_scale={"x": .02, "y": -.03, "unit": "nm"},
                                source_text="Synthetic fixture: explicitly defined signed anisotropic pixel spacing")
        return frame, self.call("fft", object_id=operand["object_id"], window="none", subtract_mean=True)

    def test_known_peaks_no_scale_and_gui_view_preserve_spectrum(self):
        before = hashlib.sha256(self.source.read_bytes()).hexdigest()
        frame, fft = self.fft()
        peaks = self.call("peaks", object_id=fft["object_id"], max_peaks=8, threshold_rel=.1, refinement="none")
        frequencies = {tuple(row["frequency_cycles_per_pixel"]) for row in peaks["peak_table"]}
        self.assertEqual(frequencies, {(1/8, 0), (-1/8, 0), (0, 1/12), (0, -1/12)})
        self.assertEqual(peaks["kind"], "fft_view")
        self.assertFalse(peaks["fft_recomputed"])
        self.assertFalse(peaks["scientific_data_changed"])
        np.testing.assert_array_equal(np.load(peaks["array_path"]), np.load(fft["array_path"]))
        self.assertEqual(Path(peaks["array_path"]).read_bytes(), Path(fft["array_path"]).read_bytes())
        for row in peaks["peak_table"]:
            self.assertIsNone(row["d_spacing"])
            self.assertIsNone(row["d_spacing_unit"])
            self.assertIsNone(row["physical_angle_degrees"])
            self.assertEqual(row["status"], "hypothesized")
            self.assertEqual(len(row["conjugate_peak_ids"]), 1)
        self.assertEqual(len(peaks["annotations"]), 4)
        self.assertTrue(all(mark["anchor"]["source_object_id"] == fft["object_id"] for mark in peaks["annotations"]))
        display = self.call("view", object_id=peaks["object_id"], gamma=.5)
        self.assertEqual(len(display["annotations"]), 4)
        np.testing.assert_array_equal(np.load(display["array_path"]), np.load(fft["array_path"]))
        observed_again = self.call("peaks", object_id=display["object_id"], threshold_rel=.1, refinement="none")
        self.assertEqual({tuple(row["frequency_cycles_per_pixel"]) for row in observed_again["peak_table"]}, frequencies)
        self.assertFalse(observed_again["peak_quality"]["display_selection_used"])
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), before)

    def test_signed_anisotropic_calibration_agrees_with_saved_measurement(self):
        _, fft = self.fft(calibrated=True)
        peaks = self.call("peaks", object_id=fft["object_id"], threshold_rel=.1, refinement="none")
        for row in peaks["peak_table"]:
            fx, fy = row["frequency_cycles_per_pixel"]
            expected = [fx/.02, fy/-.03]
            np.testing.assert_allclose(row["physical_vector_xy"], expected, atol=1e-14)
            self.assertAlmostEqual(row["d_spacing"], 1/math.hypot(*expected), places=14)
            self.assertEqual(row["d_spacing_unit"], "nm")
            measured = self.call("measure", object_id=peaks["object_id"], points=[[0, 0], [fx, fy]],
                                 coordinate_space="frequency_cycles_per_pixel")
            self.assertEqual(measured["d_spacing"], row["d_spacing"])
            self.assertEqual(measured["calibration_dependency"], row["calibration_dependency"])
            self.assertEqual(measured["scientific_grid_identity"]["source_grid_object_id"], fft["object_id"])

    def test_log_quadratic_refinement_analytic_reference_and_boundaries(self):
        y, x = np.indices((31, 33))
        # Analytic log Gaussian is exactly quadratic with its known maximum.
        spectrum = np.exp(-.5*((x-22.25)**2+(y-9.2)**2)).astype(np.complex128)
        rows, _, quality = image_peaks.detect(spectrum, {"max_peaks": 1, "exclude_dc_radius_bins": 1}, worker.need)
        np.testing.assert_allclose(rows[0]["refined_bin_xy"], [22.25, 9.2], atol=1e-12)
        self.assertTrue(rows[0]["refined"])
        self.assertIsNone(rows[0]["localization_uncertainty_bins"])
        edge = np.zeros((9, 9), dtype=np.complex128)
        edge[0, 2] = 10
        row = image_peaks.detect(edge, {"exclude_dc_radius_bins": 0}, worker.need)[0][0]
        self.assertFalse(row["refined"])
        self.assertEqual(row["refined_bin_xy"], [2., 0.])
        constant = np.ones((9, 9), dtype=np.complex128)
        rows, _, quality = image_peaks.detect(constant, {}, worker.need)
        self.assertEqual(rows, [])
        self.assertIsNotNone(quality["empty_reason"])

    def test_recovery_conflict_no_second_object_and_invalid_input(self):
        frame, fft = self.fft()
        parameters = {"object_id": fft["object_id"], "threshold_rel": .1, "max_peaks": 4}
        peak = self.call("peaks", request_id="saved-before-submit", **parameters)
        count = len(list((self.workspace / "objects").iterdir()))
        replay = self.call("peaks", request_id="saved-before-submit", **parameters)
        recovered = self.call("result", query_request_id="saved-before-submit")
        self.assertEqual(replay["object_id"], peak["object_id"])
        self.assertEqual(recovered["object_id"], peak["object_id"])
        self.assertEqual(len(list((self.workspace / "objects").iterdir())), count)
        conflict = self.call("peaks", ok=False, request_id="saved-before-submit", **{**parameters, "max_peaks": 3})
        self.assertEqual(conflict["error"]["code"], "REQUEST_CONFLICT")
        refused = self.call("peaks", ok=False, object_id=frame["object_id"])
        self.assertEqual(refused["error"]["code"], "UNSUPPORTED_OPERATION")
        self.call("peaks", ok=False, object_id=fft["object_id"], threshold_rel=0)
        invalid = np.zeros((9, 9), dtype=np.complex128)
        invalid[1, 2] = complex(float("nan"), 0)
        with self.assertRaisesRegex(ValueError, "Nonfinite"):
            image_peaks.detect(invalid, {}, worker.need)
        missing_id = worker.execute({"workspace": str(self.workspace), "action": "peaks", "object_id": fft["object_id"]})
        self.assertFalse(missing_id["ok"])


if __name__ == "__main__":
    unittest.main()
