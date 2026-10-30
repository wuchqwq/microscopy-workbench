"""Independent analytic image observations; no material-defect accuracy claim."""
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.image_discovery_core import DiscoveryError, MAX_WINDOWS, propose


class ImageDiscoveryCore(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.y, cls.x = np.indices((256,256))
        cls.lattice = np.cos(2*np.pi*cls.x/8)+np.cos(2*np.pi*cls.y/8)
        # Ground truth is only a modulation of contrast, with unchanged carrier
        # geometry. It is NOT prescribed as a physical strain/defect field.
        cls.envelope = 1-.95*np.exp(-((cls.x-120)**2+(cls.y-136)**2)/(2*15**2))
        cls.interrupted = cls.envelope*cls.lattice

    def test_local_contrast_interruption_hits_independent_source_coordinate(self):
        result = propose(self.interrupted)
        self.assertTrue(result["candidates"])
        best = result["candidates"][0]
        x0,y0,x1,y1 = best["rect"]
        self.assertTrue(x0 <= 120 < x1 and y0 <= 136 < y1)
        self.assertGreater(best["metrics"]["gradient_energy_coefficient_of_variation"], .2)
        self.assertTrue(any("texture energy" in text for text in best["reasons"]))
        # Independently verify that the nominated image contains the prescribed
        # contrast reduction. This does not use any detector statistic as truth.
        self.assertLess(float(np.std(self.interrupted[124:148,108:132])),
                        .5*float(np.std(self.lattice[124:148,108:132])))
        self.assertEqual(result["cost"]["new_fft_pixels"], 0)
        self.assertIsNone(result["physical_conclusion"])

    def test_clean_periodic_image_and_constant_control_do_not_invent_features(self):
        clean = propose(self.lattice)
        self.assertEqual(clean["candidates"], [])
        self.assertIn("narrow/weak", clean["stop_reason"])
        constant = propose(np.full((64,64), 123, dtype=np.uint16))
        self.assertEqual(constant["quality"]["status"], "no_observable_contrast")
        self.assertEqual(constant["candidates"], [])
        self.assertEqual(constant["cost"]["gaussian_filter_passes"], 0)

    def test_white_noise_is_quality_limited_not_a_defect(self):
        for seed in (7, 19, 105):
            result = propose(np.random.default_rng(seed).normal(size=(256,256)))
            self.assertEqual(result["quality"]["status"], "quality_limited")
            self.assertEqual(result["candidates"], [])
            self.assertTrue(result["quality"]["diagnostic_not_noise_classifier"])
            self.assertTrue(result["observations"], "Rejected observation metrics remain inspectable")
            self.assertIn("no automatic refinement", result["stop_reason"])

    def test_orthogonal_interface_records_orientation_but_retains_threshold_miss(self):
        values = np.where(self.x<128, np.cos(2*np.pi*self.x/8), np.cos(2*np.pi*self.y/8))
        result = propose(values)
        boundary = max(result["observations"], key=lambda row:row["score_components"]["orientation_disagreement_proxy"])
        self.assertLess(boundary["rect"][0], 128)
        self.assertGreater(boundary["rect"][2], 128)
        self.assertGreater(boundary["score_components"]["orientation_disagreement_proxy"], .6)
        # Known negative result at preregistered threshold, NOT a successful
        # interface detector. Scores remain available for manual entry/review.
        self.assertEqual(result["candidates"], [])
        self.assertLess(max(row["score"] for row in result["observations"]), result["settings"]["score_threshold"])

    def test_deterministic_raw_data_preservation_and_affine_display_independence(self):
        values = self.interrupted.astype(np.float32)
        original = hashlib.sha256(values.tobytes()).hexdigest()
        first = propose(values)
        second = propose(values)
        self.assertEqual(first, second)
        self.assertEqual(hashlib.sha256(values.tobytes()).hexdigest(), original)
        scaled = propose(values.astype(np.float64)*(-3)+250)
        self.assertEqual([row["rect"] for row in first["candidates"]], [row["rect"] for row in scaled["candidates"]])
        self.assertEqual(first["dtype"], "float32")
        self.assertEqual(first["coordinate_space"], "source_array_indices")
        self.assertIsNone(first["uncertainty"])
        json.dumps(first, allow_nan=False)

    def test_sampling_scales_and_pixel_costs_are_bounded(self):
        result = propose(np.tile(self.lattice, (2,2)), [32,64], 2)
        self.assertLessEqual(result["cost"]["sampled_windows"], MAX_WINDOWS)
        self.assertEqual(result["cost"]["sampled_windows"], len(result["observations"]))
        self.assertEqual(result["cost"]["spatial_filter_pixel_passes"], 5*512*512)
        self.assertEqual(result["settings"]["window_sizes"], [32,64])
        self.assertLessEqual(len(result["candidates"]), 2)
        for row in result["observations"]:
            x0,y0,x1,y1 = row["rect"]
            self.assertTrue(0 <= x0 < x1 <= 512 and 0 <= y0 < y1 <= 512)
            self.assertIn(x1-x0, [32,64])
        small = propose(np.ones((32,32)), [32])
        self.assertEqual(small["shape_yx"], [32,32])

    def test_nonfinite_complex_oversize_and_invalid_scales_refused(self):
        for values, sizes, count in [(np.ones((32,32))*np.nan,[32],1),
                                     (np.ones((64,64),dtype=complex),[64],1),
                                     (np.ones((16,64)),[32],1),
                                     (np.ones((64,64)),[32,32],1),
                                     (np.ones((64,64)),[32,64,128],1),
                                     (np.ones((64,64)),[128],1),
                                     (np.ones((64,64)),[True],1),
                                     (np.ones((64,64)),[64],True),
                                     (np.ones((64,64)),[64],5)]:
            with self.subTest(shape=values.shape, sizes=sizes,count=count):
                with self.assertRaises(DiscoveryError):
                    propose(values,sizes,count)
        with self.assertRaises(DiscoveryError) as caught:
            propose(np.zeros((2049,2048)),[64])
        self.assertEqual(caught.exception.code, "BUDGET_EXCEEDED")
        outlier = self.lattice.copy()
        outlier[30,30] = 1e300
        with self.assertRaises(DiscoveryError):
            propose(outlier)
        # Finite derivatives/energy can still overflow the second moment used
        # by local std. Previously this returned9 rows containing inf rather
        # than rejecting the unsupported numerical range.
        outlier[30,30] = 1e149
        with np.errstate(over="ignore", invalid="ignore"):
            with self.assertRaises(DiscoveryError) as caught:
                propose(outlier)
        self.assertIn("feature statistics are not finite", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
