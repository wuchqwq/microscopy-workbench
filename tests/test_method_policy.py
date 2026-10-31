"""Finite method decisions from saved diagnostics, independent of science kernels."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.image_method_policy import propose


def seed(identifier="a" * 32, vectors=None, clean=False):
    return {"kind": "gpa", "object_id": identifier, "shape_yx": [256, 256],
            "parent_object_id": "f" * 32,
            "input_dependency": {"selected": {"object_id": "f" * 32},
                                 "fft": {"object_id": "f" * 32}, "shape_yx": [256, 256]},
            "parameters": {"source_domain": "real_space_lattice", "source_domain_text": "Declared synthetic lattice",
                           "g_vectors": vectors or [[.125, 0], [0, .125]], "mask_sigma": .012,
                           "reference_mode": "fixed_g", "reference_rect": [56, 56, 88, 88],
                           "reference_text": "Prescribed fixed reciprocal basis; only phase gauge is removed",
                           "amplitude_floor_relative": .05},
            "report": {"shape_yx": [256, 256], "quality": {
                "phase_valid_fraction": .47,
                # Real qualified Volterra fixtures have zero eligible residue
                # counts because the low-amplitude core is excluded.
                "phase_residue_plaquettes_per_reflection": [{"positive": 0, "negative": 0}] * 2,
                "low_amplitude_pixels_per_reflection": [0 if clean else 31, 0],
                "unwrap_discontinuity_pixels_per_reflection": [0 if clean else 354, 0]}}}


def information():
    return {"goal": "projected_topology", "model_assumption_text": "Test complete projected-dislocation model conditionally",
            "loops": [{"rect": rect, "orientation": "positive_image_xy"}
                      for rect in ([80, 80, 176, 176], [64, 64, 192, 192])],
            "followup_g_vectors": [[.125, 0], [.125, .125]],
            "followup_basis": "Independently prescribed synthetic third reciprocal carrier"}


BUDGET = {"method_calls": 2, "gpa_band_pixels": 131072, "topology_path_samples": 10000}


class MethodPolicyTest(unittest.TestCase):
    def run_policy(self, seeds=None, info=None, budget=None, attempts=None, result=None):
        return propose(seeds or [seed()], result, information() if info is None else info,
                       BUDGET if budget is None else budget, [] if attempts is None else attempts)

    def test_optional_followup_then_topology_then_stop(self):
        first = seed()
        inputs = copy.deepcopy(([first], information(), BUDGET))
        followup = self.run_policy([first])
        action = followup["actions"][0]
        self.assertEqual(action["kind"], "gpa")
        self.assertEqual(action["cost"], {"method_calls": 1, "gpa_band_pixels": 131072,
                                         "topology_path_samples": 0, "fft_pixels": 0})
        self.assertEqual(action["parameters"]["mask_sigma"], first["parameters"]["mask_sigma"])
        self.assertEqual(action["parameters"]["reference_mode"], "fixed_g")
        second = seed("b" * 32, [[.125, 0], [.125, .125]])
        attempted = [{**action, "state": "completed", "request_id": "original-followup"}]
        proposed = self.run_policy([first, second], attempts=attempted)
        self.assertEqual(proposed["actions"][0]["kind"], "topology")
        self.assertEqual(proposed["actions"][0]["cost"]["topology_path_samples"], 5328)
        self.assertEqual(proposed["decision"]["diagnostics"]["directions"]["family_count"], 3)
        finished = self.run_policy([first, second], attempts=attempted, result={"report": {
            "status": "spatially_grouped_evidence", "loop_groups": [{"status": "projected_topological_evidence"},
                                                                    {"status": "insufficient_loop_stability"}]}})
        self.assertEqual(finished["actions"][0]["kind"], "stop")
        self.assertEqual(finished["decision"]["diagnostics"]["topology_loop_group_statuses"],
                         ["projected_topological_evidence", "insufficient_loop_stability"])
        self.assertFalse(finished["decision"]["material_defect_confirmed"])
        self.assertEqual(inputs, ([first], information(), BUDGET))

    def test_smooth_strain_hotspot_is_clean_finite_phase_stop(self):
        clean = seed(clean=True)
        clean["report"]["maximum_abs_strain"] = 1.e9
        result = self.run_policy([clean])
        self.assertEqual(result["decision"]["reason"], "clean_finite_saved_phase_roi")
        self.assertIn("absence", " ".join(result["actions"][0]["preconditions"]))

    def test_quality_limited_noise_stops_without_search(self):
        noisy = seed()
        noisy["report"]["quality"]["low_amplitude_pixels_per_reflection"] = [4000, 4000]
        self.assertEqual(self.run_policy([noisy])["decision"]["reason"], "phase_quality_limited")
        noisy = seed()
        noisy["report"]["quality"]["phase_valid_fraction"] = .01
        self.assertEqual(self.run_policy([noisy])["actions"][0]["kind"], "stop")

    def test_missing_model_or_loops_requests_explicit_information(self):
        for field in ("model_assumption_text", "loops"):
            info = information()
            del info[field]
            action = self.run_policy(info=info)["actions"][0]
            self.assertEqual(action["kind"], "request_information")
            self.assertIn(field, action["parameters"]["required_fields"])

    def test_non_nested_or_missing_orientation_requires_new_information(self):
        for loops in ([{"rect": [80, 80, 176, 176]}, {"rect": [64, 64, 192, 192]}],
                      [{"rect": [50, 50, 70, 70], "orientation": "positive_image_xy"},
                       {"rect": [90, 90, 110, 110], "orientation": "positive_image_xy"}]):
            info = information()
            info["loops"] = loops
            self.assertEqual(self.run_policy(info=info)["decision"]["reason"], "nested_circuits_required")

    def test_remote_group_is_retained_beside_nested_pair(self):
        info = information()
        info["loops"].append({"rect": [40, 40, 60, 60], "orientation": "negative_image_xy"})
        seeds = [seed(), seed("b" * 32, [[.125, 0], [.125, .125]])]
        result = self.run_policy(seeds, info=info)
        self.assertEqual(result["actions"][0]["kind"], "topology")
        self.assertEqual(result["actions"][0]["parameters"]["loops"], info["loops"])
        self.assertEqual(len(result["decision"]["diagnostics"]["requested_loop_groups"]), 2)

    def test_friedel_harmonic_and_small_angular_jitter_are_not_third_direction(self):
        for g in ([-.125001, .000001], [.250001, .000001], [.125, .0001]):
            info = information()
            info["followup_g_vectors"] = [[0, .125], g]
            result = self.run_policy(info=info)
            self.assertEqual(result["decision"]["reason"], "followup_direction_unresolved")
            self.assertEqual(result["decision"]["diagnostics"]["followup_directions"]["family_count"], 2)

    def test_followup_reuses_existing_fourier_geometry_guard(self):
        info = information()
        info["followup_g_vectors"] = [[.125, 0], [.49, .49]]
        result = self.run_policy(info=info)
        self.assertEqual(result["actions"][0]["kind"], "request_information")
        self.assertEqual(result["decision"]["reason"], "followup_gpa_geometry_invalid")

    def test_three_saved_gpa_records_cannot_append_fourth_for_redundancy(self):
        seeds = [seed(identifier * 32) for identifier in ("a", "b", "c")]
        result = self.run_policy(seeds)
        self.assertEqual(result["actions"][0]["kind"], "stop")
        self.assertEqual(result["decision"]["reason"], "gpa_record_limit_without_redundancy")
        self.assertEqual(result["actions"][0]["cost"]["method_calls"], 0)

    def test_budget_charges_both_bands_and_conservative_six_band_circuits(self):
        budget = {**BUDGET, "gpa_band_pixels": 131071}
        self.assertEqual(self.run_policy(budget=budget)["decision"]["reason"], "budget_exhausted")
        seeds = [seed(), seed("b" * 32, [[.125, 0], [.125, .125]])]
        budget = {**BUDGET, "topology_path_samples": 5327}
        self.assertEqual(self.run_policy(seeds, budget=budget)["decision"]["reason"], "budget_exhausted")
        self.assertEqual(self.run_policy(budget={})["actions"][0]["kind"], "request_information")

    def test_identical_attempt_never_replayed_even_after_failure(self):
        action = self.run_policy()["actions"][0]
        for state in ("failed", "completed", "refused"):
            result = self.run_policy(attempts=[{**action, "state": state, "request_id": "kept-original"}])
            self.assertEqual(result["actions"][0]["kind"], "stop")
        result = self.run_policy(attempts=[{**action, "state": "unknown", "request_id": "recover-original"}])
        self.assertEqual(result["decision"]["reason"], "original_request_outcome_unresolved")
        self.assertEqual(result["actions"][0]["parameters"]["original_request_ids"], ["recover-original"])

    def test_contrast_origin_remains_hypothesized_and_explicit_warning(self):
        result = self.run_policy([seed(), seed("b" * 32, [[.125, 0], [.125, .125]])])
        self.assertEqual(result["decision"]["interpretation_status"], "hypothesized")
        self.assertIn("Contrast-only", " ".join(result["decision"]["limitations"]))


if __name__ == "__main__":
    unittest.main()
