"""Focused synthetic numerical checks, not specimen/GUI qualification."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.image_gpa_core import GPAError, _residues, analyze


class ClassicalGPATest(unittest.TestCase):
    n = 256
    g = np.array([[.125, 0], [0, .125]])
    reference = [88, 88, 168, 168]

    def spectrum(self, deformation=None, translation=(0, 0), amplitude=None):
        y, x = np.indices((self.n, self.n), dtype=np.float64)
        current = np.stack((x, y), axis=-1)
        deformation = np.eye(2) if deformation is None else deformation
        material = np.einsum("ij,yxj->yxi", np.linalg.inv(deformation), current - translation)
        image = np.cos(2 * np.pi * np.einsum("ij,yxj->iyx", self.g, material)).sum(axis=0)
        if amplitude is not None:
            image *= amplitude
        return np.fft.fftshift(np.fft.fft2(image)).astype(np.complex128)

    def run_gpa(self, spectrum, **kwargs):
        return analyze(spectrum, self.g, .012, self.reference, **kwargs)

    def interior(self, arrays):
        inside = arrays["valid_tensor"].copy()
        inside[:80] = inside[-80:] = False
        inside[:, :80] = inside[:, -80:] = False
        return inside

    def test_translation_gauge_zero_strain_and_read_only_spectrum(self):
        spectrum = self.spectrum(translation=(.7, -.4))
        saved = spectrum.copy()
        result = self.run_gpa(spectrum)
        arrays = result["arrays"]
        np.testing.assert_array_equal(spectrum, saved)
        self.assertEqual(result["report"]["coordinate_domain"], "image_coordinate")
        self.assertNotIn("displacement_nm_xy", arrays)
        np.testing.assert_allclose(arrays["displacement_pixel_xy"][arrays["valid_displacement"]], 0, atol=1e-12)
        np.testing.assert_allclose(arrays["strain_green_lagrange_xy"][arrays["valid_tensor"]], 0, atol=1e-12)
        self.assertTrue(np.isnan(arrays["phase_unwrapped"][:, ~arrays["valid_displacement"]]).all())
        self.assertTrue(np.isnan(arrays["deformation_gradient_xy"][~arrays["valid_tensor"]]).all())
        self.assertTrue(arrays["edge_invalid"][0].all())
        self.assertEqual(arrays["valid_phase"].shape, (2, self.n, self.n))
        json.dumps(result["report"], allow_nan=False)

    def test_finite_rigid_rotation_has_zero_strain(self):
        angle = .09
        expected = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
        arrays = self.run_gpa(self.spectrum(expected))["arrays"]
        inside = self.interior(arrays)
        np.testing.assert_allclose(np.median(arrays["deformation_gradient_xy"][inside], axis=0), expected, atol=.001)
        self.assertLess(np.max(np.abs(np.median(arrays["strain_green_lagrange_xy"][inside], axis=0))), .001)
        self.assertAlmostEqual(float(np.median(arrays["rotation_radians"][inside])), angle, delta=.001)

    def test_fixed_basis_preserves_uniform_strain_fitted_reference_removes_it_explicitly(self):
        deformation = np.array([[1.035, .025], [.012, .985]])
        spectrum = self.spectrum(deformation)
        fixed = self.run_gpa(spectrum)
        relative = self.run_gpa(spectrum, reference_mode="fit_reference")
        inside = self.interior(fixed["arrays"])
        expected_e = .5 * (deformation.T @ deformation - np.eye(2))
        np.testing.assert_allclose(np.median(fixed["arrays"]["strain_green_lagrange_xy"][inside], axis=0), expected_e, atol=.001)
        np.testing.assert_allclose(np.median(relative["arrays"]["strain_green_lagrange_xy"][inside], axis=0), 0, atol=.001)
        np.testing.assert_allclose(relative["report"]["effective_g_vectors_cycles_per_pixel"], self.g @ np.linalg.inv(deformation), atol=.0001)
        self.assertIn("uniform_reference_deformation_removed", relative["report"]["reference_semantics"])
        self.assertIn("preserves_uniform_deformation", fixed["report"]["reference_semantics"])

    def test_signed_anisotropic_metric_is_applied_before_finite_strain(self):
        metric = np.array([.02, -.035])
        angle = .07
        physical_rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
        f_pixel = np.diag(1 / metric) @ physical_rotation @ np.diag(metric)
        result = self.run_gpa(self.spectrum(f_pixel), calibration_nm_xy=metric)
        arrays = result["arrays"]
        inside = self.interior(arrays)
        self.assertEqual(result["report"]["coordinate_domain"], "physical_cartesian_nm")
        np.testing.assert_allclose(np.median(arrays["deformation_gradient_xy"][inside], axis=0), physical_rotation, atol=.001)
        np.testing.assert_allclose(np.median(arrays["deformation_gradient_pixel_xy"][inside], axis=0), f_pixel, atol=.001)
        np.testing.assert_allclose(np.median(arrays["strain_green_lagrange_xy"][inside], axis=0), 0, atol=.001)
        np.testing.assert_allclose(arrays["displacement_nm_xy"][inside], arrays["displacement_pixel_xy"][inside] * metric, atol=1e-12)
        self.assertAlmostEqual(float(np.median(arrays["rotation_radians"][inside])), angle, delta=.001)

    def test_invalid_geometry_and_attempted_guard_reduction_are_rejected(self):
        spectrum = self.spectrum()
        cases = [
            dict(g_vectors=[[.125, 0], [.124, 0]], mask_sigma=.012),
            dict(g_vectors=[[.01, 0], [0, .125]], mask_sigma=.012),
            dict(g_vectors=[[.49, 0], [0, .125]], mask_sigma=.012),
            dict(g_vectors=[[.125, 0], [.13, .01]], mask_sigma=.012),
            dict(g_vectors=[[.125, 0], [-.125, .001]], mask_sigma=.012),
            dict(g_vectors=self.g, mask_sigma=.012, edge_margin=1),
            dict(g_vectors=self.g, mask_sigma=.012, calibration_nm_xy=[.02, 0]),
        ]
        for options in cases:
            with self.subTest(options=options), self.assertRaises(GPAError):
                analyze(spectrum, reference_rect=self.reference, **options)
        with self.assertRaises(GPAError):
            self.run_gpa(spectrum.astype(np.complex64))

    def test_absent_reflection_is_insufficient_evidence(self):
        with self.assertRaises(GPAError) as context:
            self.run_gpa(np.zeros((self.n, self.n), dtype=np.complex128))
        self.assertEqual(context.exception.code, "GPA_INSUFFICIENT_EVIDENCE")

    def test_missing_second_reflection_cannot_normalize_roundoff_into_signal(self):
        y, x = np.indices((self.n, self.n), dtype=float)
        image = np.cos(2 * np.pi * .125 * x) + 1e-16 * np.cos(2 * np.pi * .125 * y)
        spectrum = np.fft.fftshift(np.fft.fft2(image)).astype(np.complex128)
        with self.assertRaises(GPAError) as context:
            self.run_gpa(spectrum)
        self.assertEqual(context.exception.code, "GPA_INSUFFICIENT_EVIDENCE")

    def test_only_reference_connected_amplitude_island_is_valid(self):
        envelope = np.ones((self.n, self.n))
        envelope[:, 96:160] = 0
        spectrum = self.spectrum(amplitude=envelope)
        result = analyze(spectrum, self.g, .018, [50, 80, 80, 120], amplitude_floor_relative=.4)
        arrays = result["arrays"]
        self.assertGreater(result["report"]["quality"]["disconnected_pixels_excluded"], 0)
        self.assertTrue(arrays["disconnected_invalid"][:, 180:200].any())
        self.assertFalse(arrays["valid_displacement"][:, 180:200].any())
        self.assertTrue(np.isnan(arrays["displacement_pixel_xy"][:, 180:200]).all())
        with self.assertRaises(GPAError) as context:
            analyze(spectrum, self.g, .018, [50, 80, 200, 120], amplitude_floor_relative=.4)
        self.assertEqual(context.exception.code, "GPA_REFERENCE_INVALID")

    def test_analytic_phase_winding_is_masked_without_defect_interpretation(self):
        y, x = np.indices((20, 20), dtype=float)
        phase = np.arctan2(y - 9.5, x - 9.5)
        invalid, counts = _residues(phase, np.ones((20, 20), dtype=bool))
        self.assertEqual(counts, {"positive": 1, "negative": 0})
        self.assertTrue(invalid[8:12, 8:12].all())
        self.assertFalse(invalid[0].any())

    def test_reproducible_unwrap(self):
        spectrum = self.spectrum(np.array([[1.02, .01], [0, .99]]))
        first = self.run_gpa(spectrum, unwrap_seed=19)
        second = self.run_gpa(spectrum, unwrap_seed=19)
        np.testing.assert_array_equal(first["arrays"]["phase_unwrapped"], second["arrays"]["phase_unwrapped"])


if __name__ == "__main__":
    unittest.main()
