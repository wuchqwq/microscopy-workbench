"""Independent analytic peak fixtures; no detector internals generate truth."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.image_column_candidates import CandidateError, detect


def image(peaks, shape=(64, 64), baseline=12.0):
    yy, xx = np.indices(shape)
    out = np.full(shape, baseline)
    for x, y, amplitude, sigma in peaks:
        out += amplitude * np.exp(-((xx-x)**2+(yy-y)**2)/(2*sigma*sigma))
    return out


def xy(result):
    return [(c['x'], c['y']) for c in result['candidates']]


class BrightCandidateTests(unittest.TestCase):
    def test_intensity_variation_independent_truth_and_no_mutation(self):
        data = image([(12, 14, 100, 1), (35, 15, 40, 1.2), (26, 45, 20, 1)])
        before = data.tobytes()
        data.flags.writeable = False
        result = detect(data, [0, 0, 64, 64])
        self.assertEqual(xy(result), [(12, 14), (35, 15), (26, 45)])
        self.assertEqual(data.tobytes(), before)
        self.assertFalse(result['quality']['atomic_identity_established'])
        self.assertEqual(json.loads(json.dumps(result, allow_nan=False)), result)
        self.assertEqual(result, detect(data, [0, 0, 64, 64]))

    def test_small_seeded_noise_matrix(self):
        truth = [(12, 14), (35, 15), (26, 45)]
        base = image([(x, y, amplitude, 1.2) for (x,y),amplitude in zip(truth,[100,50,25])])
        for seed in [6, 19, 102]:
            noisy = base + np.random.default_rng(seed).normal(0, 1.5, base.shape)
            result = detect(noisy, [0,0,64,64], smooth_sigma=0.6, threshold_rel=.15, prominence_rel=.08)
            self.assertEqual(xy(result), truth)

    def test_separated_nearby_and_unresolved_overlap(self):
        nearby = image([(24,30,100,1), (28,30,80,1)])
        self.assertEqual(xy(detect(nearby,[0,0,64,64],min_distance=3)), [(24,30),(28,30)])
        self.assertEqual(xy(detect(nearby,[0,0,64,64],min_distance=5)), [(24,30)])
        broad = image([(24,30,100,3), (26,30,100,3)])
        self.assertEqual(xy(detect(broad,[0,0,64,64])), [(25,30)])

    def test_plateau_and_flat_abstain(self):
        flat = np.ones((20,20))
        self.assertEqual(xy(detect(flat,[0,0,20,20])), [])
        flat[8:12,8:12] = 20
        result = detect(flat,[0,0,20,20])
        self.assertEqual(xy(result), [])
        self.assertGreater(result['quality']['plateau_component_count'],0)

    def test_roi_coordinates_no_outside_influence(self):
        data = image([(20,21,50,1),(40,40,1000,1)])
        result = detect(data,[10.2,11.4,30.1,31.2])
        self.assertEqual(xy(result),[(20,21)])
        self.assertEqual(result['provenance']['source_rect_xyxy'],[10,11,31,32])
        changed = data.copy()
        changed[32:, :] = 1e20
        self.assertEqual(xy(detect(changed,[10.2,11.4,30.1,31.2])),[(20,21)])

    def test_boundary_not_promoted(self):
        data = np.zeros((10,10))
        data[0,5] = 30
        result = detect(data,[0,0,10,10],noise_floor_sigma=0)
        self.assertEqual(xy(result),[])
        self.assertEqual(result['quality']['boundary_maxima_excluded'],1)
        data[1,5] = 30  # Boundary-spanning plateau remains rejected.
        result = detect(data,[0,0,10,10],noise_floor_sigma=0)
        self.assertEqual(xy(result),[])
        self.assertGreater(result['quality']['plateau_component_count'],0)

    def test_parameter_effects_and_offset_scale_invariance(self):
        data = image([(12,14,100,1), (35,15,20,1)])
        self.assertEqual(len(xy(detect(data,[0,0,64,64],threshold_rel=.3))),1)
        expected = xy(detect(data,[0,0,64,64]))
        self.assertEqual(xy(detect(data*3-500,[0,0,64,64])),expected)
        self.assertEqual(xy(detect(data,[0,0,64,64],prominence_rel=.5)),[(12,14)])

    def test_invalid_inputs_and_domains(self):
        data = np.zeros((10,10))
        for value in [np.full((10,10),np.nan),np.full((10,10),np.inf),
                      data.astype(complex),np.zeros((2,10,10)),np.zeros((10,10),dtype=bool),
                      np.zeros((10,10),dtype=object),np.full((10,10),2**63,dtype=np.uint64)]:
            with self.assertRaises(CandidateError): detect(value,[0,0,10,10])
        for rect in [[-1,0,10,10],[0,0,11,10],[3,0,2,10],[0,0,1,1],[0,0,float('nan'),10]]:
            with self.assertRaises(CandidateError): detect(data,rect)
        for kwargs in [dict(array_domain='frequency'),dict(array_domain='unknown'),dict(min_distance=0),
                       dict(threshold_rel=0),dict(threshold_rel=2),dict(smooth_sigma=-1),
                       dict(prominence_rel=float('nan')),dict(min_distance=True)]:
            with self.assertRaises(CandidateError): detect(data,[0,0,10,10],**kwargs)

    def test_large_signed_values_remain_finite_and_json_safe(self):
        data = np.full((10,10),-1e308)
        data[5,5] = 1e308
        result = detect(data,[0,0,10,10],noise_floor_sigma=0)
        self.assertEqual(xy(result),[(5,5)])
        json.dumps(result,allow_nan=False)

    def test_noise_only_background_abstains_fixed_seeds(self):
        for seed in (2026110905, 173, 81):
            rng = np.random.default_rng(seed)
            for data in (rng.poisson(10, (80,112)).astype(float),
                         10 + rng.normal(0, 3, (80,112))):
                for smoothing in (0, 1):
                    result = detect(data,[0,0,112,80],smooth_sigma=smoothing)
                    self.assertEqual(xy(result), [])
                    self.assertEqual(result['parameters']['noise_floor_sigma'],6.0)
                    self.assertFalse(result['provenance']['noise_floor']['statistical_significance'])
                    self.assertFalse(result['provenance']['noise_floor']['inferred_noise_model'])

    def test_noise_gate_is_reported_and_explicitly_adjustable(self):
        data = np.random.default_rng(2026110905).poisson(10, (80,112)).astype(float)
        ungated = detect(data,[0,0,112,80],noise_floor_sigma=0)
        gated = detect(data,[0,0,112,80])
        self.assertGreater(len(ungated['candidates']),0)
        self.assertEqual(gated['candidates'],[])
        self.assertGreater(gated['quality']['noise_floor_rejected_count'],0)
        self.assertGreater(gated['provenance']['noise_floor']['estimate'],0)
        json.dumps(gated,allow_nan=False)
        for value in (-1, float('nan'), True, 101):
            with self.assertRaises(CandidateError):
                detect(data,[0,0,112,80],noise_floor_sigma=value)

    def test_degenerate_mad_sparse_noise_uses_conservative_scale(self):
        # Development negatives only. Independent held-out seeds are separate.
        for seed in (173, 81):
            for mean in (0.02, 0.1, 0.3):
                data = np.random.default_rng(seed).poisson(mean, (80,112)).astype(float)
                before = data.tobytes()
                for sigma in (0, 1):
                    result = detect(data, [0,0,112,80], smooth_sigma=sigma)
                    self.assertEqual(xy(result), [])
                    gate = result['provenance']['noise_floor']
                    self.assertEqual(gate['difference_mad'], 0)
                    self.assertTrue(gate['degenerate_mad_fallback']['used'])
                    self.assertGreater(gate['estimate'], 0)
                    self.assertFalse(gate['inferred_noise_model'])
                    json.dumps(result, allow_nan=False)
                self.assertEqual(data.tobytes(), before)

    def test_degenerate_mad_may_abstain_on_isolated_signal_and_can_be_disabled(self):
        data = np.zeros((32,32)); data[16,16] = 100
        result = detect(data, [0,0,32,32])
        self.assertEqual(xy(result), [])
        self.assertTrue(result['quality']['degenerate_noise_scale'])
        self.assertEqual(xy(detect(data,[0,0,32,32],noise_floor_sigma=0)), [(16,16)])
        self.assertEqual(xy(detect(data*3-500,[0,0,32,32])), [])
        flat = detect(np.zeros((32,32)),[0,0,32,32])
        self.assertFalse(flat['quality']['degenerate_noise_scale'])
        self.assertEqual(flat['candidates'], [])

    def test_minimum_separation_equality(self):
        data = np.zeros((10,10),dtype=np.uint16)
        data[4,3], data[4,6] = 100,80
        self.assertEqual(xy(detect(data,[0,0,10,10],min_distance=3,noise_floor_sigma=0)),[(3,4),(6,4)])


if __name__ == '__main__':
    unittest.main()
