"""Finite direction resolution: jitter is not a second reciprocal constraint."""
import copy
import math
from pathlib import Path
import sys
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
from crystallography import twin_geometry as twin
from test_twin_geometry import measurement_rows, cases, REGISTRATION, INTERFACE


def rows(q, prefix=1):
    return measurement_rows(q, prefix=prefix, friedel=False)


class FiniteDirectionAdmission(unittest.TestCase):
    def test_review_near_friedel_pair_is_one_direction(self):
        r = twin._independence(rows([[.4, .2], [-.400001, -.199999]]))
        self.assertFalse(r['adequate'])
        self.assertEqual(r['noncollinear_direction_family_count'], 1)
        self.assertTrue(r['numerical_rank_two_diagnostic_only'])
        self.assertEqual(r['direction_policy_version'], 'finite_reciprocal_direction_support_v2')
        self.assertEqual(len(r['direction_families'][0]['measurement_object_ids']), 2)

    def test_near_harmonics_do_not_create_directions(self):
        r = twin._independence(rows([[.2, .1], [.400001, .199999], [-.600001, -.300002]]))
        self.assertFalse(r['adequate'])
        self.assertEqual(r['noncollinear_direction_family_count'], 1)

    def test_exact_friedel_and_harmonics_remain_one_direction(self):
        r = twin._independence(rows([[.4, .2], [-.4, -.2], [.8, .4]]))
        self.assertFalse(r['adequate'])
        self.assertEqual(r['noncollinear_direction_family_count'], 1)

    def test_two_genuinely_separated_families_survive(self):
        r = twin._independence(rows([[.4, .2], [-.400001, -.199999], [.2, -.4], [-.200001, .400001]]))
        self.assertTrue(r['adequate'])
        self.assertEqual(r['noncollinear_direction_family_count'], 2)

    def test_order_and_sign_do_not_change_membership(self):
        data = rows([[.4, .2], [-.400001, -.199999], [.2, -.4], [-.200001, .400001]])
        a = twin._independence(data)
        b = twin._independence([data[i] for i in [2, 0, 3, 1]])
        key = lambda r: {frozenset(f['measurement_object_ids']) for f in r['direction_families']}
        self.assertEqual(key(a), key(b))
        flipped = copy.deepcopy(data)
        for row in flipped:
            row['points'][1] = [-v for v in row['points'][1]]
            row['physical_vector_xy'] = [-v for v in row['physical_vector_xy']]
        self.assertEqual(key(a), key(twin._independence(flipped)))

    def test_declared_radius_must_resolve_angular_separation(self):
        a = math.radians(3)
        data = rows([[.1, 0], [.1 * math.cos(a), .1 * math.sin(a)]])
        self.assertFalse(twin._independence(data, .005)['adequate'])
        self.assertTrue(twin._independence(data, .0001)['adequate'])

    def test_small_matching_tolerance_cannot_bypass_one_degree_floor(self):
        a = math.radians(.2)
        r = twin._independence(rows([[.4, 0], [.4 * math.cos(a), .4 * math.sin(a)]]), 1e-12)
        self.assertFalse(r['adequate'])
        self.assertEqual(r['direction_admission']['minimum_line_separation_degrees'], 1.)

    def test_dc_indistinguishable_vectors_remain_unresolved(self):
        r = twin._independence(rows([[.001, 0], [0, .001]]), .005)
        self.assertFalse(r['adequate'])
        self.assertEqual(len(r['unresolved_measurement_object_ids']), 2)
        self.assertEqual(r['noncollinear_direction_family_count'], 0)

    def test_conservative_chain_cannot_invent_a_second_family(self):
        q = [[.4 * math.cos(math.radians(a)), .4 * math.sin(math.radians(a))] for a in [0, .8, 1.6]]
        r = twin._independence(rows(q), 1e-12)
        self.assertFalse(r['adequate'])
        self.assertEqual(r['noncollinear_direction_family_count'], 1)

    def test_common_rotation_preserves_admission(self):
        q = np.array([[.4, .2], [-.400001, -.199999], [.2, -.4]])
        a = .73
        rotation = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        self.assertEqual(twin._independence(rows(q))['noncollinear_direction_family_count'],
                         twin._independence(rows(q @ rotation.T))['noncollinear_direction_family_count'])

    def test_input_records_stay_unchanged(self):
        data = rows([[.4, .2], [-.400001, -.199999]])
        before = copy.deepcopy(data)
        twin._independence(data)
        self.assertEqual(before, data)

    def test_invalid_guard_is_not_silently_accepted(self):
        for tolerance in [0, -1, math.nan, math.inf, 2]:
            with self.subTest(tolerance=tolerance), self.assertRaises(ValueError):
                twin._independence(rows([[.4, .2], [.2, -.4]]), tolerance)

    def test_noisy_single_family_cannot_become_a_twin_verdict(self):
        a, b, parent, child = cases()
        def jittered(data, prefix):
            q = np.array(data[1]['physical_vector_xy'])
            return rows([q, -q + np.array([1e-6, -1e-6])], prefix)
        result = twin.evaluate(jittered(a, 1), jittered(b, 2), parent, child,
                               REGISTRATION, .005, interface=INTERFACE)
        self.assertEqual(result['status'], 'insufficient_evidence')
        for side in ['domain_a_geometry', 'domain_b_geometry']:
            self.assertFalse(result['projected_relation'][side]['adequate'])
            self.assertEqual(result['projected_relation'][side]['noncollinear_direction_family_count'], 1)
        self.assertIn('independent', result['projected_relation']['reason'])

    def test_positive_multifamily_comparison_retains_original_tolerance(self):
        result = twin.evaluate(*cases(), REGISTRATION, .005, interface=INTERFACE)
        self.assertEqual(result['status'], 'compatible')
        for side in ['domain_a_geometry', 'domain_b_geometry']:
            self.assertTrue(result['projected_relation'][side]['adequate'])
            self.assertEqual(result['projected_relation'][side]['direction_admission']['reciprocal_radius_inv_angstrom'], .005)


if __name__ == '__main__':
    unittest.main()
