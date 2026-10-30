"""Independent analytic oracles and real-image -> existing GPA topology checks.

Expected windings are continuum Volterra truth from the generator, never
computed by a second copy of the tested discrete circulation algorithm.
Preregistered bounds in topology_truth.json must not widen after failures.
"""

import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import create_topology_fixtures as fixture
from image_gpa_core import analyze as gpa_analyze
from image_topology_core import analyze


def extract_existing_gpa(image):
    """Use saved GPA diagnostics; no replacement FFT aperture or unwrapping.

    The existing two-g implementation is called with (g0,g1) and (g0,g2).
    Its original-input-g wrapped diagnostics are retained independently of its
    unwrap cuts and tensors, whose validity is not topology path eligibility.
    Any GPA hard refusal propagates and is retained by the evidence runner.
    """
    spectrum = np.fft.fftshift(np.fft.fft2(image)).astype(np.complex128)
    first = gpa_analyze(spectrum, fixture.G_VECTORS[[0, 1]], fixture.MASK_SIGMA,
                        fixture.REFERENCE_RECT)
    second = gpa_analyze(spectrum, fixture.G_VECTORS[[0, 2]], fixture.MASK_SIGMA,
                         fixture.REFERENCE_RECT)
    phases = np.concatenate((first["arrays"]["phase_demodulated_wrapped"],
                             second["arrays"]["phase_demodulated_wrapped"][[1]]))
    amplitudes = np.concatenate((first["arrays"]["amplitude"], second["arrays"]["amplitude"][[1]]))
    return phases, amplitudes, first["arrays"]["edge_invalid"], [first["report"], second["report"]]


class IndependentTopologyPhysics(unittest.TestCase):
    def run_exact(self, case, loops=None, **kwargs):
        return analyze(case["phase_wrapped"], case["amplitude"], fixture.G_VECTORS,
                       fixture.NESTED_LOOPS if loops is None else loops, **kwargs)

    def run_filtered(self, case, loops=None, **kwargs):
        original = case["image"].copy()
        phase, amplitude, edge, gpa_reports = extract_existing_gpa(case["image"])
        np.testing.assert_array_equal(case["image"], original)
        result = analyze(phase, amplitude, fixture.G_VECTORS,
                         fixture.NESTED_LOOPS if loops is None else loops, edge_invalid=edge, **kwargs)
        result["gpa_reports"] = gpa_reports
        return result

    def assert_winding(self, result, expected, filtered=False):
        expected = np.broadcast_to(expected, result["arrays"]["loop_winding_cycles"].shape)
        atol = fixture.TOLERANCES["filtered_winding_integer_max_abs_error" if filtered else
                                  "exact_winding_integer_max_abs_error"]
        np.testing.assert_allclose(result["arrays"]["loop_winding_cycles"], expected, rtol=0, atol=atol)
        self.assertTrue(result["arrays"]["loop_valid"].all(), result["report"]["loops"])

    def assert_b(self, result, expected):
        np.testing.assert_allclose(result["report"]["projected_burgers"]["b_pixel_xy"], expected,
                                   rtol=0, atol=fixture.TOLERANCES["burgers_pixel_xy_max_abs_error"])

    def assert_conditional(self, result):
        report = result["report"]
        self.assertEqual(report["interpretation_status"], "hypothesized")
        self.assertIn("does not confirm a material dislocation", " ".join(report["limitations"]))
        self.assertNotIn("confirmed", report["status"])

    def test_public_manifest_matches_independent_analytic_generator(self):
        path = ROOT / "tests" / "fixtures" / "topology_truth.json"
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), fixture.manifest())

    def test_exact_positive_negative_burgers_and_loop_radius_shift_stability(self):
        for b in ((8, 0), (-8, 0)):
            for regular in ("none", "smooth_hotspot"):
                with self.subTest(b=b, regular=regular):
                    case = fixture.volterra_fixture(b, regular=regular)
                    loops = fixture.NESTED_LOOPS + [fixture.SHIFTED_LOOP]
                    result = self.run_exact(case, loops)
                    expected = fixture.continuum_truth(case["cores"], loops[0])["phase_winding"]
                    self.assert_winding(result, expected)
                    self.assert_b(result, b)
                    self.assertEqual(result["report"]["status"], "projected_topological_evidence")
                    self.assert_conditional(result)

    def test_reverse_orientation_flips_raw_winding_preserves_canonical_b(self):
        case = fixture.volterra_fixture()
        positive = self.run_exact(case)
        reverse = self.run_exact(case, [{"rect": r, "orientation": "negative_image_xy"}
                                        for r in fixture.NESTED_LOOPS])
        np.testing.assert_allclose(reverse["arrays"]["loop_winding_cycles"],
                                   -positive["arrays"]["loop_winding_cycles"], rtol=0, atol=1e-8)
        self.assert_b(reverse, [8, 0])

    def test_invalid_masked_core_inside_loop_is_permitted(self):
        case = fixture.volterra_fixture()
        case["phase_wrapped"][:, 123:134, 123:134] = np.nan
        case["amplitude"][:, 123:134, 123:134] = 0
        edge = np.zeros((256, 256), dtype=bool)
        edge[123:134, 123:134] = True
        result = self.run_exact(case, edge_invalid=edge)
        self.assert_winding(result, [-1, 0, -1])
        self.assert_b(result, [8, 0])

    def test_masked_low_amplitude_or_nonfinite_path_is_rejected(self):
        for kind in ("edge", "amplitude", "nonfinite"):
            with self.subTest(kind=kind):
                case = fixture.volterra_fixture()
                edge = np.zeros((256, 256), dtype=bool)
                # Both preregistered top edges are modified, independently.
                for rect in fixture.NESTED_LOOPS:
                    x, y = rect[:2]
                    if kind == "edge":
                        edge[y, x] = True
                    elif kind == "amplitude":
                        case["amplitude"][:, y, x] = 0
                    else:
                        case["phase_wrapped"][:, y, x] = np.nan
                result = self.run_exact(case, edge_invalid=edge)
                self.assertFalse(result["arrays"]["loop_valid"].any())
                self.assertTrue(np.isnan(result["arrays"]["loop_winding_cycles"]).all())
                self.assertTrue(all(r["winding_cycles"] is None
                                    for loop in result["report"]["loops"] for r in loop["reflections"]))
                self.assertEqual(result["report"]["status"], "insufficient_loop_stability")

    def test_near_pi_path_jumps_are_rejected(self):
        case = fixture.null_fixture("none")
        for x, y, _, _ in fixture.NESTED_LOOPS:
            case["phase_wrapped"][:, y, x] = 0.9 * np.pi
        result = self.run_exact(case)
        self.assertFalse(result["arrays"]["loop_valid"].any())
        self.assertTrue(all("ambiguous_phase_step" in r["failures"]
                            for loop in result["report"]["loops"] for r in loop["reflections"]))

    def test_selected_undersampled_high_charge_vortex_is_rejected(self):
        case = fixture.volterra_fixture((96, 0))
        result = self.run_exact(case, [[125, 125, 133, 133], [124, 124, 134, 134]])
        self.assertFalse(result["arrays"]["loop_valid"][:, [0, 2]].any())
        self.assertNotEqual(result["report"]["status"], "projected_topological_evidence")
        self.assertIn("cannot rule out unsampled aliasing", " ".join(result["report"]["limitations"]))

    def test_invisible_reflection_and_exterior_loop_zero_are_not_absence(self):
        case = fixture.volterra_fixture()
        result = self.run_exact(case)
        self.assertEqual(result["report"]["reflections"][1]["status"], "stable_zero")
        self.assertEqual(result["report"]["reflections"][0]["status"], "stable_nonzero")
        exterior = [[44, 44, 68, 68], fixture.EXTERIOR_LOOP]
        outside = self.run_exact(case, exterior)
        self.assert_winding(outside, [0, 0, 0])
        self.assertEqual(outside["report"]["status"], "no_net_winding_detected")
        self.assertIn("not defect absence", " ".join(outside["report"]["limitations"]))

    def test_opposite_cores_have_zero_net_but_individual_nonzero_winding(self):
        case = fixture.opposite_pair_fixture()
        result = self.run_exact(case)
        self.assert_winding(result, [0, 0, 0])
        left = self.run_exact(case, [[80, 104, 124, 152], [76, 100, 128, 156]])
        self.assert_winding(left, [-1, 0, -1])
        self.assert_b(left, [8, 0])
        self.assertIn("opposite-sign enclosed charges can cancel", " ".join(result["report"]["limitations"]))

    def test_affine_and_high_gradient_smooth_nulls_have_zero_winding(self):
        for kind in ("affine", "smooth_hotspot"):
            with self.subTest(kind=kind):
                case = fixture.null_fixture(kind)
                result = self.run_exact(case)
                self.assert_winding(result, [0, 0, 0])
                self.assertEqual(result["report"]["status"], "no_net_winding_detected")
                if kind == "smooth_hotspot":
                    self.assertGreater(float(np.max(np.abs(case["regular_gradient_xy"]))),
                                       fixture.TOLERANCES["smooth_null_min_max_abs_displacement_gradient"])

    def test_contrast_only_vortex_is_observationally_identical_not_material_confirmation(self):
        contrast = fixture.contrast_vortex_fixture()
        displaced = fixture.volterra_fixture()
        np.testing.assert_array_equal(contrast["image"], displaced["image"])
        np.testing.assert_array_equal(contrast["true_material_displacement_pixel_xy"], 0)
        result = self.run_exact(contrast)
        self.assert_winding(result, [-1, 0, -1])
        self.assertEqual(result["report"]["status"], "projected_topological_evidence")
        self.assert_conditional(result)

    def test_selected_random_phase_noise_has_no_determined_topology(self):
        result = self.run_exact(fixture.noise_fixture())
        self.assertFalse(result["arrays"]["loop_valid"].any())
        self.assertEqual(result["report"]["status"], "insufficient_loop_stability")
        self.assert_conditional(result)

    def test_unknown_metric_has_pixel_b_only_and_signed_metric_transforms_components(self):
        case = fixture.volterra_fixture((8, 8))
        pixel = self.run_exact(case)
        self.assert_b(pixel, [8, 8])
        self.assertNotIn("b_nm_xy", pixel["report"]["projected_burgers"])
        metric = self.run_exact(case, calibration_nm_xy=[0.02, -0.035])
        np.testing.assert_allclose(metric["report"]["projected_burgers"]["b_nm_xy"], [0.16, -0.28],
                                   rtol=0, atol=fixture.TOLERANCES["burgers_pixel_xy_max_abs_error"])

    def test_actual_image_fft_existing_gpa_positive_negative_and_smooth_addition(self):
        for b, regular in (((8, 0), "none"), ((-8, 0), "none"), ((8, 0), "smooth_hotspot")):
            with self.subTest(b=b, regular=regular):
                case = fixture.volterra_fixture(b, regular=regular)
                result = self.run_filtered(case, fixture.NESTED_LOOPS + [fixture.SHIFTED_LOOP])
                expected = fixture.continuum_truth(case["cores"], fixture.NESTED_LOOPS[0])["phase_winding"]
                self.assert_winding(result, expected, filtered=True)
                self.assert_b(result, b)
                self.assertEqual(result["report"]["status"], "projected_topological_evidence")
                self.assert_conditional(result)

    def test_actual_image_fft_existing_gpa_null_pair_and_exterior(self):
        cases = [("affine", fixture.null_fixture("affine"), fixture.NESTED_LOOPS),
                 ("smooth_hotspot", fixture.null_fixture(), fixture.NESTED_LOOPS),
                 ("opposite_pair", fixture.opposite_pair_fixture(), fixture.NESTED_LOOPS),
                 ("exterior", fixture.volterra_fixture(), [[44, 44, 68, 68], fixture.EXTERIOR_LOOP])]
        for name, case, loops in cases:
            with self.subTest(name=name):
                result = self.run_filtered(case, loops)
                self.assert_winding(result, [0, 0, 0], filtered=True)
                self.assertEqual(result["report"]["status"], "no_net_winding_detected")
                self.assert_conditional(result)

    def test_actual_contrast_vortex_still_cannot_confirm_material_defect(self):
        result = self.run_filtered(fixture.contrast_vortex_fixture())
        self.assert_winding(result, [-1, 0, -1], filtered=True)
        self.assert_conditional(result)

    def test_actual_noise_image_is_unstable_for_preregistered_paths(self):
        result = self.run_filtered(fixture.noise_fixture())
        self.assertNotEqual(result["report"]["status"], "projected_topological_evidence")
        self.assert_conditional(result)


if __name__ == "__main__":
    unittest.main()
