"""Synthetic saved-phase checks; no material-defect or real-host qualification."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.image_topology_core import TopologyError, analyze


class SavedPhaseTopologyTest(unittest.TestCase):
    n = 64
    g = np.array([[.125, 0], [0, .125], [.125, .125]])
    loops = [[10, 10, 54, 54], [20, 20, 44, 44]]

    def phases(self, b=(8, 0), g=None, cores=None, smooth=False):
        g = self.g if g is None else np.asarray(g)
        y, x = np.indices((self.n, self.n), dtype=np.float64)
        displacement = np.zeros((self.n, self.n, 2))
        for cx, cy, vector in ([(31.5, 31.5, b)] if cores is None else cores):
            angle = np.arctan2(y - cy, x - cx)
            displacement += angle[..., None] * np.asarray(vector) / (2 * np.pi)
        if smooth:
            displacement += np.stack((.005 * x + .003 * y, -.002 * x + .004 * y), axis=-1)
        phase = -2 * np.pi * np.einsum("ij,yxj->iyx", g, displacement)
        return (phase + np.pi) % (2 * np.pi) - np.pi

    def run_topology(self, phase=None, **kwargs):
        phase = self.phases() if phase is None else phase
        return analyze(phase, np.ones_like(phase), self.g, self.loops, **kwargs)

    def test_projected_nonzero_multig_nested_constraint_and_read_only_inputs(self):
        phase = self.phases(smooth=True)
        amplitude = np.ones_like(phase)
        saved_phase, saved_amplitude = phase.copy(), amplitude.copy()
        result = analyze(phase, amplitude, self.g, self.loops)
        report, arrays = result["report"], result["arrays"]
        self.assertEqual(report["status"], "projected_topological_evidence")
        self.assertEqual(report["interpretation_status"], "hypothesized")
        np.testing.assert_array_equal(phase, saved_phase)
        np.testing.assert_array_equal(amplitude, saved_amplitude)
        np.testing.assert_allclose(arrays["loop_winding_integer"], [[-1, 0, -1]] * 2)
        np.testing.assert_allclose(report["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-12)
        self.assertTrue(report["projected_burgers"]["redundancy_validated"])
        self.assertEqual(report["projected_burgers"]["direction_family_count"], 3)
        self.assertLess(float(arrays["loop_integer_residual_cycles"].max()), 1e-12)
        self.assertIn("not_confidence", report["integer_residual_semantics"])
        json.dumps(report, allow_nan=False)

    def test_orientation_reversal_flips_raw_charge_not_canonical_b(self):
        loops = [{"rect": self.loops[0], "orientation": "negative_image_xy", "loop_id": "outer"},
                 {"rect": self.loops[1], "orientation": "positive_image_xy"}]
        result = analyze(self.phases(), np.ones((3, self.n, self.n)), self.g, loops)
        np.testing.assert_array_equal(result["arrays"]["loop_winding_integer"], [[1, 0, 1], [-1, 0, -1]])
        np.testing.assert_allclose(result["report"]["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-12)
        self.assertEqual(result["report"]["loops"][0]["loop_id"], "outer")
        path = result["arrays"]["path_xy"][:result["arrays"]["path_offsets"][1]]
        area2 = np.sum(path[:, 0] * np.roll(path[:, 1], -1) - path[:, 1] * np.roll(path[:, 0], -1))
        self.assertLess(area2, 0)

    def test_loop_boundary_is_simple_adjacent_and_half_open(self):
        arrays = self.run_topology()["arrays"]
        for index, rect in enumerate(self.loops):
            path = arrays["path_xy"][arrays["path_offsets"][index]:arrays["path_offsets"][index + 1]]
            self.assertEqual(len(path), 2 * ((rect[2] - rect[0]) + (rect[3] - rect[1])) - 4)
            self.assertEqual(len(set(map(tuple, path))), len(path))
            np.testing.assert_array_equal(np.sum(np.abs(np.roll(path, -1, axis=0) - path), axis=1), 1)
            self.assertEqual(path[:, 0].max(), rect[2] - 1)
            self.assertEqual(path[:, 1].max(), rect[3] - 1)

    def test_two_reflections_are_exact_fit_without_independent_redundancy(self):
        result = analyze(self.phases()[:2], np.ones((2, self.n, self.n)), self.g[:2], self.loops)
        report = result["report"]
        self.assertEqual(report["status"], "constrained_candidate_without_redundancy")
        self.assertFalse(report["projected_burgers"]["redundancy_validated"])
        self.assertFalse(report["projected_burgers"]["two_reflection_exact_fit_is_independent_validation"])

    def test_harmonic_reflections_do_not_create_third_direction_family(self):
        g = np.array([[.1, 0], [0, .1], [.2, 0], [0, .2]])
        phase = self.phases((10, 0), g=g)
        report = analyze(phase, np.ones_like(phase), g, self.loops)["report"]
        self.assertEqual(report["status"], "constrained_candidate_without_redundancy")
        self.assertEqual(report["projected_burgers"]["direction_family_count"], 2)
        self.assertTrue(all(entry["compatible"] for entry in report["projected_burgers"]["leave_one_reflection_out"]))

    def test_signed_calibration_preserves_circuit_b_and_exposes_orientation_mapping(self):
        report = self.run_topology(calibration_nm_xy=[.02, -.03])["report"]
        np.testing.assert_allclose(report["projected_burgers"]["b_nm_xy"], [.16, 0], atol=1e-12)
        self.assertFalse(report["physical_orientation_mapping"]["positive_image_xy_has_positive_physical_xy_area"])
        self.assertLess(report["physical_orientation_mapping"]["signed_metric_determinant"], 0)

    def test_interior_core_is_allowed_even_when_phase_nonfinite_and_amplitude_zero(self):
        phase = self.phases()
        amplitude = np.ones_like(phase)
        phase[:, 30:34, 30:34] = np.nan
        amplitude[:, 30:34, 30:34] = 0
        report = analyze(phase, amplitude, self.g, self.loops)["report"]
        self.assertEqual(report["status"], "projected_topological_evidence")
        self.assertTrue(all(entry["stable"] for entry in report["reflections"]))

    def test_only_touched_band_path_is_invalidated(self):
        amplitude = np.ones((3, self.n, self.n))
        amplitude[0, 10, 10] = 0
        result = analyze(self.phases(), amplitude, self.g, self.loops)
        self.assertFalse(result["arrays"]["loop_valid"][0, 0])
        self.assertTrue(np.isnan(result["arrays"]["loop_winding_cycles"][0, 0]))
        self.assertEqual(result["arrays"]["loop_diagnostic_winding_integer"][0, 0], -1)
        self.assertTrue(result["arrays"]["loop_valid"][0, 1:].all())
        self.assertEqual(result["report"]["status"], "partial_projected_constraints")
        self.assertEqual(result["report"]["loops"][0]["reflections"][0]["low_amplitude_path_pixels"], 1)
        self.assertIsNone(result["report"]["loops"][0]["reflections"][0]["winding_integer"])
        self.assertEqual(result["report"]["loops"][0]["reflections"][0]["diagnostic_winding_integer"], -1)

    def test_nonfinite_path_is_invalid_and_report_stays_json_safe(self):
        phase = self.phases()
        phase[:, 10, 10] = np.nan
        report = self.run_topology(phase)["report"]
        self.assertEqual(report["status"], "insufficient_loop_stability")
        self.assertIsNone(report["loops"][0]["reflections"][0]["winding_integer"])
        json.dumps(report, allow_nan=False)

    def test_no_eligible_phase_or_amplitude_stays_unknown_with_json_safe_diagnostics(self):
        phase = self.phases()
        for input_phase, amplitude in ((np.full_like(phase, np.nan), np.ones_like(phase)),
                                       (phase, np.full_like(phase, np.nan)),
                                       (phase, np.zeros_like(phase))):
            with self.subTest(phase_finite=bool(np.isfinite(input_phase).all()),
                              amplitude_finite=bool(np.isfinite(amplitude).all())):
                result = analyze(input_phase, amplitude, self.g, self.loops, burgers_candidates=[[8, 0]])
                self.assertEqual(result["report"]["status"], "insufficient_loop_stability")
                self.assertFalse(result["arrays"]["loop_valid"].any())
                self.assertFalse(result["arrays"]["eligible_phase"].any())
                self.assertIsNone(result["report"]["projected_burgers"]["b_pixel_xy"])
                self.assertFalse(result["report"]["burgers_candidates"][0]["matches_saved_constraints"])
                json.dumps(result["report"], allow_nan=False)

    def test_edge_mask_can_be_per_band_and_interior_edges_do_not_mask_path(self):
        edge = np.zeros((3, self.n, self.n), dtype=bool)
        edge[:, 30:34, 30:34] = True
        self.assertEqual(self.run_topology(edge_invalid=edge)["report"]["status"], "projected_topological_evidence")
        edge[0, 10, 10] = True
        report = self.run_topology(edge_invalid=edge)["report"]
        self.assertEqual(report["loops"][0]["reflections"][0]["edge_invalid_path_pixels"], 1)

    def test_amplitude_floor_uses_global_nonedge_maximum_not_loop_maximum(self):
        amplitude = np.ones((3, self.n, self.n))
        amplitude[:, 5, 5] = 100
        report = analyze(self.phases(), amplitude, self.g, self.loops)["report"]
        self.assertEqual(report["amplitude_reference_maxima"], [100, 100, 100])
        self.assertEqual(report["amplitude_thresholds"], [5, 5, 5])
        self.assertEqual(report["status"], "insufficient_loop_stability")
        edge = np.zeros((self.n, self.n), dtype=bool)
        edge[5, 5] = True
        report = analyze(self.phases(), amplitude, self.g, self.loops, edge_invalid=edge)["report"]
        self.assertEqual(report["amplitude_reference_maxima"], [1, 1, 1])
        self.assertEqual(report["status"], "projected_topological_evidence")

    def test_near_pi_path_step_rejected_even_with_exact_integer_closure(self):
        phase = self.phases()
        phase[0, 10, 10] = phase[0, 10, 11] + .95 * np.pi
        phase = (phase + np.pi) % (2 * np.pi) - np.pi
        report = self.run_topology(phase)["report"]
        reflection = report["loops"][0]["reflections"][0]
        self.assertIn("ambiguous_phase_step", reflection["failures"])
        self.assertFalse(reflection["valid"])
        self.assertLess(reflection["integer_residual_cycles"], 1e-12)

    def test_zero_nonzero_nested_mixture_is_inconsistent_not_defect_absence(self):
        phase = self.phases(cores=[(31.5, 31.5, (8, 0)), (47.5, 31.5, (-8, 0))])
        report = self.run_topology(phase)["report"]
        self.assertEqual(report["status"], "inconsistent_or_partial_evidence")
        self.assertEqual(report["reflections"][0]["status"], "inconsistent_winding")
        self.assertEqual(set(report["reflections"][0]["canonical_winding_integers"]), {0, -1})

    def test_cancelled_pair_has_zero_net_winding_with_explicit_absence_limit(self):
        phase = self.phases(cores=[(28.5, 31.5, (8, 0)), (35.5, 31.5, (-8, 0))])
        report = self.run_topology(phase)["report"]
        self.assertEqual(report["status"], "no_net_winding_detected")
        self.assertTrue(any("not defect absence" in text for text in report["limitations"]))

    def test_singlevalued_smooth_field_gives_zero_net_only(self):
        phase = self.phases(cores=[], smooth=True)
        report = self.run_topology(phase)["report"]
        self.assertEqual(report["status"], "no_net_winding_detected")
        self.assertEqual(report["reflections"][1]["status"], "stable_zero")

    def test_incompatible_third_g_rejects_projected_vector_solution(self):
        phase = self.phases()
        phase[2] = 0
        report = self.run_topology(phase)["report"]
        self.assertEqual(report["status"], "inconsistent_vector_constraints")
        self.assertFalse(report["projected_burgers"]["compatible"])
        self.assertFalse(report["projected_burgers"]["redundancy_validated"])

    def test_collinear_vectors_and_ill_conditioned_vectors_have_no_b_solution(self):
        for g in (np.array([[.125, 0], [.25, 0]]), np.array([[.125, 0], [.125, .00001]])):
            phase = self.phases(g=g)
            report = analyze(phase, np.ones_like(phase), g, self.loops)["report"]
            self.assertEqual(report["status"], "insufficient_vector_constraints")
            self.assertIsNone(report["projected_burgers"]["b_pixel_xy"])

    def test_identical_or_touching_loops_are_not_independent_nested_checks(self):
        phase = self.phases()
        for loops in ([self.loops[0]] * 2, [self.loops[0], [10, 20, 44, 44]], [self.loops[0]]):
            report = analyze(phase, np.ones_like(phase), self.g, loops)["report"]
            self.assertEqual(report["status"], "insufficient_loop_stability")
            self.assertFalse(report["reflections"][0]["strictly_nested_valid_loop_pairs"])

    def test_user_candidates_preserve_units_and_do_not_claim_unique_match(self):
        report = self.run_topology(calibration_nm_xy=[.02, -.03],
                                   burgers_candidates=[{"label": "candidate", "b_pixel_xy": [8, 0]}, [0, 8]])["report"]
        self.assertTrue(report["burgers_candidates"][0]["matches_saved_constraints"])
        self.assertFalse(report["burgers_candidates"][1]["matches_saved_constraints"])
        np.testing.assert_allclose(report["burgers_candidates"][0]["b_nm_xy"], [.16, 0])
        self.assertIn("not_established", report["burgers_candidates"][0]["uniqueness_status"])

    def test_selected_random_phase_noise_is_rejected_by_sampling_guard(self):
        phase = np.random.default_rng(7103).uniform(-np.pi, np.pi, (3, self.n, self.n))
        result = self.run_topology(phase)
        self.assertFalse(result["arrays"]["loop_valid"].any())
        self.assertTrue(any("contrast/noise vortices" in text for text in result["report"]["limitations"]))

    def test_contrast_vortex_is_only_conditional_even_when_algebraically_compatible(self):
        # These phase arrays can be contrast coefficients with zero material u.
        report = self.run_topology()["report"]
        self.assertEqual(report["interpretation_status"], "hypothesized")
        self.assertTrue(any("does not confirm a material dislocation" in text for text in report["limitations"]))
        self.assertTrue(any("unsampled aliasing" in text for text in report["limitations"]))

    def test_bounded_explicit_inputs_reject_invalid_shapes_masks_vectors_and_loops(self):
        phase = self.phases()
        amplitude = np.ones_like(phase)
        bad_calls = [
            lambda: analyze(phase, amplitude, self.g, []),
            lambda: analyze(phase, amplitude, self.g, self.loops * 5),
            lambda: analyze(phase, amplitude, self.g, [[1, 1, 3, 8]]),
            lambda: analyze(phase, amplitude, self.g, [[True, 1, 20, 20]]),
            lambda: analyze(phase, amplitude, self.g, [[0, 0, 65, 64]]),
            lambda: analyze(phase, amplitude, self.g, [{"rect": self.loops[0], "orientation": "ccw"}]),
            lambda: analyze(phase, amplitude, self.g, self.loops, edge_invalid=np.zeros((64, 64))),
            lambda: analyze(phase, amplitude, self.g, self.loops, phase_step_limit=np.pi),
            lambda: analyze(phase, amplitude, self.g, self.loops, amplitude_floor_relative=0),
            lambda: analyze(phase, amplitude, self.g, self.loops, calibration_nm_xy=[0, .1]),
            lambda: analyze(phase, amplitude, self.g, self.loops, burgers_candidates=[[np.inf, 0]]),
            lambda: analyze(phase[:2], amplitude[:2], [self.g[0], -self.g[0]], self.loops),
            lambda: analyze(phase[:2], amplitude[:2], [self.g[0], self.g[0]], self.loops),
            lambda: analyze(phase[:2], amplitude[:2], [[.5, 0], [0, .1]], self.loops),
            lambda: analyze(phase[0], amplitude[0], self.g, self.loops),
            lambda: analyze(phase + 4 * np.pi, amplitude, self.g, self.loops),
            lambda: analyze(phase, -amplitude, self.g, self.loops),
        ]
        for call in bad_calls:
            with self.subTest(call=call), self.assertRaises(TopologyError):
                call()


if __name__ == "__main__":
    unittest.main()
