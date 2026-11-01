"""Independent DFT-index support examples; no detector generates the oracle."""
import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_topology_core as core


class FourierDependence(unittest.TestCase):
    def test_even_odd_rectangular_conjugacy_and_shared_single_coefficient(self):
        for h,w in ((64,64),(63,65),(64,63)):
            # Frequency (kx,ky) maps to shifted index (floor(w/2)+kx, floor(h/2)+ky).
            a=np.zeros((h,w));b=a.copy();c=a.copy()
            a[h//2+3,w//2+7]=.25
            b[h//2-3,w//2-7]=.75
            c[h//2+9,w//2+2]=1
            out=core.band_dependency([a,b,c])
            self.assertFalse(out['qualified_cross_band_support'])
            p=out['pairs'][0]
            self.assertEqual(p['shared_coefficients'],0)
            self.assertEqual(p['shared_conjugate_coefficients'],1)
            self.assertTrue(core.band_dependency([a,c])['qualified_cross_band_support'])
            # Tiny nonzero weight is still reused support; no tuned percentage cutoff.
            c[h//2+3,w//2+7]=1e-100
            self.assertFalse(core.band_dependency([a,c])['qualified_cross_band_support'])

    def test_actual_support_not_centres_or_ids(self):
        a=np.zeros((32,32));a[20,20]=1;a[20,21]=.1
        b=np.zeros_like(a);b[25,25]=1;b[20,21]=.01
        out=core.band_dependency([a,b])
        self.assertFalse(out['qualified_cross_band_support'])
        self.assertEqual(out['pairs'][0]['shared_coefficients'],1)
        b[20,21]=0
        self.assertTrue(core.band_dependency([a,b])['qualified_cross_band_support'])

    def test_invalid_masks_and_missing_coverage_fail(self):
        for masks in (np.zeros((2,8,8)),np.full((2,8,8),np.nan),-np.ones((2,8,8))):
            with self.assertRaises(core.TopologyError):core.band_dependency(masks)
        with self.assertRaises(core.TopologyError):
            core.analyze_with_dependencies(None,None,[[1,0],[0,1]],[],band_dependency={})


if __name__=='__main__':unittest.main()
