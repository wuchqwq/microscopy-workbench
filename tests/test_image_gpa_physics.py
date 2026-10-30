"""Independent analytic GPA physics oracles and a fixed-atom counterexample.

Tolerances are preregistered in create_gpa_fixtures.TOLERANCES and the public
truth JSON. They must not be relaxed in response to a failing implementation.
These tests establish bounded synthetic consistency, never material validity.
"""

import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import create_gpa_fixtures as fixture
from image_gpa_core import GPAError, analyze


def fft_of(image):
    return np.fft.fftshift(np.fft.fft2(image)).astype(np.complex128)


def rectangle_mask(shape, rect):
    mask = np.zeros(shape, dtype=bool)
    x0, y0, x1, y1 = rect
    mask[y0:y1, x0:x1] = True
    return mask


class IndependentGPAPhysics(unittest.TestCase):
    def run_gpa(self, image, **kwargs):
        return analyze(fft_of(image), fixture.G_VECTORS, fixture.MASK_SIGMA,
                       kwargs.pop("reference_rect", fixture.REFERENCE_RECT), **kwargs)

    def interior(self, arrays):
        margin = fixture.TOLERANCES["interior_margin_pixels"]
        inside = arrays["valid_tensor"].copy()
        inside[:margin] = inside[-margin:] = False
        inside[:, :margin] = inside[:, -margin:] = False
        self.assertGreater(np.count_nonzero(inside), 1000, "Insufficient independent interior coverage")
        return inside

    def assert_affine_truth(self, result, displacement_truth, truth):
        arrays = result["arrays"]
        inside = self.interior(arrays)
        reference = rectangle_mask(inside.shape, fixture.REFERENCE_RECT) & arrays["valid_displacement"]
        expected_u = displacement_truth - displacement_truth[reference].mean(axis=0)
        rms = float(np.sqrt(np.mean((arrays["displacement_pixel_xy"][inside] - expected_u[inside]) ** 2)))
        self.assertLessEqual(rms, fixture.TOLERANCES["displacement_gauge_removed_rms_pixels"],
                             "Eulerian displacement RMS %.8g px exceeds preregistered bound" % rms)
        np.testing.assert_allclose(np.median(arrays["deformation_gradient_pixel_xy"][inside], axis=0),
                                   truth["F_pixel"], rtol=0,
                                   atol=fixture.TOLERANCES["median_deformation_gradient_max_abs"])
        np.testing.assert_allclose(np.median(arrays["deformation_gradient_xy"][inside], axis=0),
                                   truth["F_xy"], rtol=0,
                                   atol=fixture.TOLERANCES["median_deformation_gradient_max_abs"])
        np.testing.assert_allclose(np.median(arrays["strain_green_lagrange_xy"][inside], axis=0),
                                   truth["green_lagrange_xy"], rtol=0,
                                   atol=fixture.TOLERANCES["median_green_lagrange_max_abs"])
        angle_error = float(np.median(arrays["rotation_radians"][inside]) - truth["polar_rotation_radians"])
        self.assertLessEqual(abs(np.degrees(angle_error)), fixture.TOLERANCES["median_polar_rotation_degrees"])

    def test_public_truth_manifest_matches_independent_generator(self):
        path = ROOT / "tests" / "fixtures" / "gpa_physics_truth.json"
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), fixture.manifest())

    def test_current_coordinate_rotation_stretch_shear_and_signed_nonsquare_metric(self):
        for name, deformation, shape, metric in fixture.fixture_specs():
            with self.subTest(fixture=name):
                image, exact_u = fixture.affine_fixture(deformation, shape_yx=shape)
                original = image.copy()
                result = self.run_gpa(image, calibration_nm_xy=metric)
                self.assert_affine_truth(result, exact_u, fixture.finite_truth(deformation, metric))
                np.testing.assert_array_equal(image, original)
                self.assertEqual(result["report"]["coordinate_domain"], "physical_cartesian_nm")
                self.assertEqual(result["report"]["interpretation_status"], "hypothesized")
                np.testing.assert_allclose(result["arrays"]["displacement_nm_xy"],
                                           result["arrays"]["displacement_pixel_xy"] * metric, rtol=0, atol=1e-14,
                                           equal_nan=True)
                if "rotation" in name:
                    # At .12 rad, infinitesimal sym(R-I) produces a spurious
                    # |strain|=.00719. This gate requires the finite tensor.
                    inside = self.interior(result["arrays"])
                    self.assertLessEqual(np.max(np.abs(np.median(result["arrays"]["strain_green_lagrange_xy"][inside], axis=0))),
                                         fixture.TOLERANCES["median_green_lagrange_max_abs"])

    def test_constant_reference_gauge_does_not_claim_absolute_translation(self):
        deformation = np.array([[1.02, 0.03], [-0.01, 0.99]])
        image_a, truth_a = fixture.affine_fixture(deformation, translation_xy=(0, 0))
        image_b, truth_b = fixture.affine_fixture(deformation, translation_xy=(2.1, -1.7))
        result_a, result_b = self.run_gpa(image_a), self.run_gpa(image_b)
        self.assert_affine_truth(result_a, truth_a, fixture.finite_truth(deformation))
        self.assert_affine_truth(result_b, truth_b, fixture.finite_truth(deformation))
        for result in (result_a, result_b):
            arrays = result["arrays"]
            reference = rectangle_mask(image_a.shape, fixture.REFERENCE_RECT) & arrays["valid_displacement"]
            np.testing.assert_allclose(arrays["displacement_pixel_xy"][reference].mean(axis=0), 0, rtol=0, atol=1e-12)
            self.assertIn("constant_phase_gauge", result["report"]["reference_semantics"])
        joint = self.interior(result_a["arrays"]) & self.interior(result_b["arrays"])
        rms = np.sqrt(np.mean((result_a["arrays"]["displacement_pixel_xy"][joint] -
                               result_b["arrays"]["displacement_pixel_xy"][joint]) ** 2))
        self.assertLessEqual(float(rms), fixture.TOLERANCES["displacement_gauge_removed_rms_pixels"])

    def test_smooth_nonuniform_field_matches_analytic_inverse_map_pointwise(self):
        image, truth = fixture.smooth_nonuniform_fixture()
        result = self.run_gpa(image, calibration_nm_xy=[0.02, 0.02])
        arrays = result["arrays"]
        inside = self.interior(arrays)
        reference = rectangle_mask(image.shape, fixture.REFERENCE_RECT) & arrays["valid_displacement"]
        expected_u = truth["displacement"] - truth["displacement"][reference].mean(axis=0)
        error = arrays["displacement_pixel_xy"][inside] - expected_u[inside]
        self.assertLessEqual(float(np.sqrt(np.mean(error ** 2))),
                             fixture.TOLERANCES["displacement_gauge_removed_rms_pixels"])
        # Require spatial agreement rather than a median that could hide an
        # incorrect constant result. Truth is an analytic Jacobian of X(x).
        self.assertGreater(float(np.ptp(truth["strain"][inside, 0, 0])), 0.01)
        np.testing.assert_allclose(arrays["deformation_gradient_xy"][inside], truth["deformation"][inside],
                                   rtol=0, atol=fixture.TOLERANCES["nonuniform_pointwise_deformation_gradient_max_abs"])
        np.testing.assert_allclose(arrays["strain_green_lagrange_xy"][inside], truth["strain"][inside],
                                   rtol=0, atol=fixture.TOLERANCES["nonuniform_pointwise_green_lagrange_max_abs"])
        angle_error = np.degrees(arrays["rotation_radians"][inside] - truth["rotation_radians"][inside])
        self.assertLessEqual(float(np.max(np.abs(angle_error))),
                             fixture.TOLERANCES["nonuniform_pointwise_polar_rotation_degrees"])

    def test_fitted_reference_is_explicit_relative_deformation(self):
        deformation = np.array([[1.03, 0.04], [0.01, 0.98]])
        image, _ = fixture.affine_fixture(deformation)
        result = self.run_gpa(image, reference_mode="fit_reference")
        inside = self.interior(result["arrays"])
        np.testing.assert_allclose(np.median(result["arrays"]["strain_green_lagrange_xy"][inside], axis=0),
                                   0, rtol=0, atol=fixture.TOLERANCES["median_green_lagrange_max_abs"])
        np.testing.assert_allclose(result["report"]["effective_g_vectors_cycles_per_pixel"],
                                   fixture.G_VECTORS @ np.linalg.inv(deformation), rtol=0, atol=0.0004)
        self.assertIn("uniform_reference_deformation_removed", result["report"]["reference_semantics"])

    def test_unknown_metric_remains_pixel_image_measurement(self):
        deformation = np.array([[1.02, 0.04], [-0.01, 0.99]])
        image, exact_u = fixture.affine_fixture(deformation, shape_yx=(256, 320))
        result = self.run_gpa(image)
        self.assert_affine_truth(result, exact_u, fixture.finite_truth(deformation))
        self.assertIsNone(result["report"]["calibration_nm_xy"])
        self.assertEqual(result["report"]["coordinate_domain"], "image_coordinate")
        self.assertNotIn("displacement_nm_xy", result["arrays"])
        self.assertTrue(any("No physical strain" in text for text in result["report"]["limitations"]))

    def test_negative_reflection_sign_recovers_same_eulerian_field(self):
        deformation = np.array([[1.025, 0.035], [-0.01, 0.99]])
        image, exact_u = fixture.affine_fixture(deformation)
        result = analyze(fft_of(image), [[-0.125, 0], [0, 0.125]], fixture.MASK_SIGMA,
                         fixture.REFERENCE_RECT)
        self.assert_affine_truth(result, exact_u, fixture.finite_truth(deformation))

    def test_dc_conjugate_and_collinear_vectors_are_rejected(self):
        image, _ = fixture.affine_fixture(np.eye(2))
        for name, vectors in (("DC", [[0, 0], [0, 0.125]]),
                              ("conjugate", [[0.125, 0], [-0.125, 0]]),
                              ("collinear", [[0.125, 0], [0.25, 0]])):
            with self.subTest(geometry=name), self.assertRaises(GPAError):
                analyze(fft_of(image), vectors, fixture.MASK_SIGMA, fixture.REFERENCE_RECT)

    def test_missing_selected_reflection_is_not_numerical_leakage_evidence(self):
        yy, xx = np.indices((256, 256), dtype=np.float64)
        one_reflection_image = np.cos(2 * np.pi * 0.125 * xx)
        with self.assertRaises(GPAError) as error:
            self.run_gpa(one_reflection_image)
        self.assertIn(error.exception.code, ("GPA_INSUFFICIENT_EVIDENCE", "GPA_REFERENCE_INVALID"))

    def test_low_amplitude_hole_is_invalid_not_zero_displacement(self):
        image, _ = fixture.affine_fixture(np.eye(2))
        yy, xx = np.indices(image.shape, dtype=np.float64)
        image[((xx - 128) ** 2 + (yy - 128) ** 2) < 40 ** 2] = 0
        result = self.run_gpa(image, reference_rect=[60, 60, 88, 96], amplitude_floor_relative=0.2)
        arrays = result["arrays"]
        hole = ((xx - 128) ** 2 + (yy - 128) ** 2) < 16 ** 2
        self.assertTrue(arrays["low_amplitude"][:, hole].all())
        self.assertFalse(arrays["valid_displacement"][hole].any())
        self.assertFalse(arrays["valid_tensor"][hole].any())
        self.assertTrue(np.isnan(arrays["displacement_pixel_xy"][hole]).all())
        self.assertTrue(np.isnan(arrays["strain_green_lagrange_xy"][hole]).all())

    def test_fixed_atoms_varying_contrast_create_apparent_not_material_strain(self):
        image, positions, brightness = fixture.fixed_sublattice_contrast_fixture()
        # Each coordinate is exactly on one of the two unchanged sublattices.
        remainders = np.remainder(positions, 8)
        self.assertTrue(((remainders == 0).all(axis=1) | (remainders == 2).all(axis=1)).all())
        self.assertGreater(float(np.ptp(brightness)), 1)
        truth = fixture.manifest()["pseudo_strain_case"]
        self.assertEqual(truth["true_atomic_displacement_pixels"], [0, 0])
        self.assertEqual(truth["true_green_lagrange_xy"], [[0, 0], [0, 0]])
        self.assertFalse(truth["material_validation"])
        result = self.run_gpa(image, reference_rect=truth["reference_rect_xyxy"])
        arrays = result["arrays"]
        interface = rectangle_mask(image.shape, truth["interface_measurement_rect_xyxy"]) & arrays["valid_tensor"]
        self.assertGreater(int(interface.sum()), 500)
        apparent = float(np.median(np.abs(arrays["strain_green_lagrange_xy"][interface, 0, 0])))
        self.assertGreater(apparent, fixture.TOLERANCES["pseudo_strain_min_interface_abs_median_exx"],
                           "Fixed atom contrast counterexample must visibly expose apparent strain")
        self.assertEqual(result["report"]["interpretation_status"], "hypothesized")
        self.assertTrue(any("contrast" in text and "apparent strain" in text
                            for text in result["report"]["limitations"]))


if __name__ == "__main__":
    unittest.main()
