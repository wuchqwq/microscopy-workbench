"""Independent spatial-loop regressions from analytic saved wrapped phases.

The expected winding comes from explicitly enclosed Volterra charges, never a
second implementation of discrete path circulation. These synthetic fixtures
establish bounded projected constraints, not a material-defect identification.
Bounds and cases were fixed in analysis/f3a-loop-review-r1 before the v2 fix.
"""

from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.image_topology_core import analyze


class IndependentSpatialLoopGroups(unittest.TestCase):
    n = 128
    g = 0.125 * np.array([[1, 0], [0, 1], [1, 1]], dtype=np.float64)
    winding_atol = 1e-8
    burgers_atol = 1e-10
    separated_loops = [[8, 8, 56, 56], [16, 16, 48, 48],
                       [72, 72, 120, 120], [80, 80, 112, 112]]

    def phase_for_cores(self, cores):
        y, x = np.indices((self.n, self.n), dtype=np.float64)
        phase = np.zeros((len(self.g), self.n, self.n), dtype=np.float64)
        for cx, cy, b in cores:
            angle = np.arctan2(y - cy, x - cx)
            phase -= (self.g @ np.asarray(b, dtype=np.float64))[:, None, None] * angle
        return (phase + np.pi) % (2 * np.pi) - np.pi

    def run_case(self, cores, loops, *, amplitude=None):
        phase = self.phase_for_cores(cores)
        amplitude = np.ones_like(phase) if amplitude is None else amplitude
        original_phase, original_amplitude = phase.copy(), amplitude.copy()
        result = analyze(phase, amplitude, self.g, loops)
        np.testing.assert_array_equal(phase, original_phase)
        np.testing.assert_array_equal(amplitude, original_amplitude)
        return result

    def groups_by_members(self, result):
        groups = result["report"]["loop_groups"]
        self.assertEqual(result["report"]["grouping"]["policy"], "strict_nesting_components_v1")
        self.assertEqual(result["report"]["grouping"]["group_count"], len(groups))
        indexed = {frozenset(group["loop_indices"]): group for group in groups}
        self.assertEqual(len(indexed), len(groups), "Group membership must be unambiguous")
        members = [index for group in groups for index in group["loop_indices"]]
        self.assertEqual(sorted(members), list(range(result["report"]["loop_count"])))
        for group in groups:
            for index in group["loop_indices"]:
                self.assertEqual(result["report"]["loops"][index]["group_index"], group["group_index"])
            for reflection in group["reflections"]:
                self.assertTrue(set(reflection["valid_loop_indices"]) <= set(group["loop_indices"]))
                self.assertTrue(all(set(pair) <= set(group["loop_indices"])
                                    for pair in reflection["strictly_nested_valid_loop_pairs"]))
        return indexed

    def assert_b(self, group, expected):
        self.assertEqual(group["status"], "projected_topological_evidence")
        inference = group["projected_burgers"]
        np.testing.assert_allclose(inference["b_pixel_xy"], expected,
                                   rtol=0, atol=self.burgers_atol)
        self.assertTrue(inference["compatible"])
        self.assertTrue(inference["redundancy_validated"])
        self.assertEqual(inference["stable_reflection_indices"], [0, 1, 2])
        self.assertEqual(inference["rank"], 2)

    def assert_no_cross_group_fit(self, result):
        self.assertEqual(result["report"]["status"], "spatially_grouped_evidence")
        self.assertIsNone(result["report"]["projected_burgers"])
        self.assertEqual(result["report"]["reflections"], [])
        self.assertEqual(result["report"]["burgers_candidates"], [])
        self.assertEqual(result["report"]["interpretation_status"], "hypothesized")

    def test_exact_user_repro_retains_local_evidence_and_remote_zero(self):
        loops = [[8, 8, 64, 64], [16, 16, 56, 56], [80, 80, 120, 120]]
        result = self.run_case([(32.5, 32.5, (8, 0))], loops)
        self.assertTrue(result["arrays"]["loop_valid"].all())
        np.testing.assert_allclose(result["arrays"]["loop_winding_cycles"],
                                   [[-1, 0, -1], [-1, 0, -1], [0, 0, 0]],
                                   rtol=0, atol=self.winding_atol)
        groups = self.groups_by_members(result)
        self.assertEqual(set(groups), {frozenset([0, 1]), frozenset([2])})
        self.assert_b(groups[frozenset([0, 1])], [8, 0])
        remote = groups[frozenset([2])]
        self.assertEqual(remote["status"], "insufficient_loop_stability")
        self.assertIsNone(remote["projected_burgers"]["b_pixel_xy"])
        for reflection in remote["reflections"]:
            self.assertEqual(reflection["status"], "insufficient_nested_loops")
            self.assertEqual(reflection["canonical_winding_integers"], [0])
            self.assertFalse(reflection["stable"])
        self.assertNotEqual(result["report"]["status"], "inconsistent_or_partial_evidence")
        self.assert_no_cross_group_fit(result)

    def test_separated_nested_groups_fit_independently_even_when_b_matches(self):
        for right_b in ((8, 0), (0, 8)):
            with self.subTest(right_b=right_b):
                result = self.run_case([(32.5, 32.5, (8, 0)),
                                        (96.5, 96.5, right_b)], self.separated_loops)
                self.assertTrue(result["arrays"]["loop_valid"].all())
                groups = self.groups_by_members(result)
                self.assertEqual(set(groups), {frozenset([0, 1]), frozenset([2, 3])})
                self.assert_b(groups[frozenset([0, 1])], [8, 0])
                self.assert_b(groups[frozenset([2, 3])], right_b)
                self.assert_no_cross_group_fit(result)

    def test_loop_order_does_not_change_geometry_groups_or_constraints(self):
        cores = [(32.5, 32.5, (8, 0)), (96.5, 96.5, (0, 8))]
        before = self.run_case(cores, self.separated_loops)
        permutation = [3, 0, 2, 1]
        after = self.run_case(cores, [self.separated_loops[i] for i in permutation])
        before_groups = self.groups_by_members(before)
        after_groups = self.groups_by_members(after)
        expected_members = {frozenset(permutation.index(i) for i in key): group
                            for key, group in before_groups.items()}
        self.assertEqual(set(after_groups), set(expected_members))
        for key, expected in expected_members.items():
            actual = after_groups[key]
            self.assertEqual(actual["status"], expected["status"])
            self.assert_b(actual, expected["projected_burgers"]["b_pixel_xy"])
            self.assertEqual([r["representative_winding_integer"] for r in actual["reflections"]],
                             [r["representative_winding_integer"] for r in expected["reflections"]])
        np.testing.assert_allclose(after["arrays"]["loop_winding_cycles"],
                                   before["arrays"]["loop_winding_cycles"][permutation],
                                   rtol=0, atol=self.winding_atol)
        self.assert_no_cross_group_fit(after)

    def test_orientation_reversal_changes_raw_winding_not_group_b(self):
        cores = [(32.5, 32.5, (8, 0)), (96.5, 96.5, (0, 8))]
        before = self.run_case(cores, self.separated_loops)
        loops = [{"rect": rect, "orientation": "negative_image_xy" if i in (0, 2)
                  else "positive_image_xy"} for i, rect in enumerate(self.separated_loops)]
        reverse = self.run_case(cores, loops)
        expected_raw = before["arrays"]["loop_winding_cycles"].copy()
        expected_raw[[0, 2]] *= -1
        np.testing.assert_allclose(reverse["arrays"]["loop_winding_cycles"], expected_raw,
                                   rtol=0, atol=self.winding_atol)
        groups = self.groups_by_members(reverse)
        self.assert_b(groups[frozenset([0, 1])], [8, 0])
        self.assert_b(groups[frozenset([2, 3])], [0, 8])
        for loop_index, loop in enumerate(reverse["report"]["loops"]):
            self.assertEqual([r["canonical_winding_integer"] for r in loop["reflections"]],
                             [r["canonical_winding_integer"]
                              for r in before["report"]["loops"][loop_index]["reflections"]])

    def test_annular_canceling_charge_is_local_single_closure_inconsistency(self):
        cores = [(32.5, 32.5, (8, 0)), (60.5, 32.5, (-8, 0)),
                 (100.5, 100.5, (0, 8))]
        loops = [[8, 8, 72, 72], [16, 16, 56, 56],
                 [80, 80, 124, 124], [88, 88, 116, 116]]
        result = self.run_case(cores, loops)
        self.assertTrue(result["arrays"]["loop_valid"].all())
        np.testing.assert_allclose(result["arrays"]["loop_winding_cycles"],
                                   [[0, 0, 0], [-1, 0, -1], [0, -1, -1], [0, -1, -1]],
                                   rtol=0, atol=self.winding_atol)
        groups = self.groups_by_members(result)
        changing = groups[frozenset([0, 1])]
        self.assertEqual(changing["status"], "inconsistent_or_partial_evidence")
        self.assertEqual(changing["reflections"][0]["status"], "inconsistent_winding")
        self.assertEqual(changing["reflections"][2]["status"], "inconsistent_winding")
        self.assertIsNone(changing["projected_burgers"]["b_pixel_xy"])
        self.assert_b(groups[frozenset([2, 3])], [0, 8])
        limitations = " ".join(result["report"]["limitations"])
        self.assertIn("added or cancelling enclosed cores", limitations)
        self.assertIn("single stable closure", limitations)
        self.assert_no_cross_group_fit(result)

    def test_intersecting_nonnested_rectangles_do_not_connect_groups(self):
        cores = [(24.5, 24.5, (8, 0)), (88.5, 88.5, (0, 8))]
        # Outer rectangles intersect. Neither contains the other or the other
        # group's inner rectangle, so overlap provides no stability relation.
        loops = [[8, 8, 64, 64], [16, 16, 40, 40],
                 [40, 40, 104, 104], [72, 72, 96, 96]]
        result = self.run_case(cores, loops)
        self.assertTrue(result["arrays"]["loop_valid"].all())
        groups = self.groups_by_members(result)
        self.assertEqual(set(groups), {frozenset([0, 1]), frozenset([2, 3])})
        self.assert_b(groups[frozenset([0, 1])], [8, 0])
        self.assert_b(groups[frozenset([2, 3])], [0, 8])
        self.assert_no_cross_group_fit(result)

    def test_invalid_paths_preserve_geometry_and_unknown_without_poisoning_other_group(self):
        cores = [(32.5, 32.5, (8, 0)), (96.5, 96.5, (0, 8))]
        before = self.run_case(cores, self.separated_loops)
        amplitude = np.ones((3, self.n, self.n), dtype=np.float64)
        amplitude[:, 8, 8] = 0
        amplitude[:, 16, 16] = 0
        invalid = self.run_case(cores, self.separated_loops, amplitude=amplitude)
        before_groups = self.groups_by_members(before)
        groups = self.groups_by_members(invalid)
        self.assertEqual(set(groups), set(before_groups))
        self.assertFalse(invalid["arrays"]["loop_valid"][:2].any())
        self.assertTrue(invalid["arrays"]["loop_valid"][2:].all())
        self.assertTrue(np.isnan(invalid["arrays"]["loop_winding_cycles"][:2]).all())
        unknown = groups[frozenset([0, 1])]
        self.assertEqual(unknown["status"], "insufficient_loop_stability")
        self.assertIsNone(unknown["projected_burgers"]["b_pixel_xy"])
        for reflection in unknown["reflections"]:
            self.assertEqual(reflection["status"], "no_valid_loops")
            self.assertEqual(reflection["canonical_winding_integers"], [])
            self.assertEqual(reflection["invalid_loop_count"], 2)
        for loop in invalid["report"]["loops"][:2]:
            for reflection in loop["reflections"]:
                self.assertIsNone(reflection["winding_cycles"])
                self.assertIsNone(reflection["winding_integer"])
                self.assertIsNotNone(reflection["diagnostic_winding_integer"])
                self.assertIn("ineligible_path_pixel", reflection["failures"])
        self.assert_b(groups[frozenset([2, 3])], [0, 8])
        self.assert_no_cross_group_fit(invalid)


if __name__ == "__main__":
    unittest.main()
