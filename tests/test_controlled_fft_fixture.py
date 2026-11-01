"""Check independent synthetic inputs/oracles, not random measurement success."""
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import tifffile

sys.path.insert(0,str(Path(__file__).resolve().parent/'fixtures'))
import controlled_fft_noise as fixture
import evaluate_fft_noise as oracle


class ControlledFixture(unittest.TestCase):
    def test_original_exact_delta_is_never_randomized(self):
        a,m=fixture.build('delta_control','none',None,None)
        self.assertEqual(a.dtype,np.float32)
        self.assertEqual(a.shape,(63,63))
        self.assertEqual(np.count_nonzero(a!=100),1)
        self.assertEqual(a[20,25],101)
        self.assertEqual(m['truth']['non_dc_modulus'],1)
        with self.assertRaises(ValueError):fixture.build('delta_control','poisson',500.,100)

    def test_seed_reproducibility_and_expected_count_units(self):
        for model in ('poisson','poisson_read','gaussian_read_only'):
            a,m=fixture.build('one',model,500.,100)
            b,n=fixture.build('one',model,500.,100)
            np.testing.assert_array_equal(a,b);self.assertEqual(m,n)
            self.assertAlmostEqual(m['expected_total_e'],500*128*128,places=6)
            self.assertEqual(m['read_sigma_e_per_pixel'],0. if model=='poisson' else 5.)
        with self.assertRaises(ValueError):fixture.build('one','poisson',500.,999)
        with self.assertRaises(ValueError):fixture.build('one','none',500.,100)

    def test_noiseless_background_and_affine_truth(self):
        a,m=fixture.build('uniform','none',500.,None)
        np.testing.assert_array_equal(a,np.full((128,128),500,dtype=np.float32))
        self.assertEqual(m['truth']['periodic_components'],[])
        _,m=fixture.build('affine','none',500.,None)
        # Independently multiply the documented coordinate transform: 8.64-.15,
        # .48+4.70. No FFT/peak output is used to generate this expectation.
        np.testing.assert_allclose(m['truth']['periodic_components'][0]['q_xy_cycles_per_pixel'],[8.49/128,5.18/128],rtol=1e-15)

    def test_fixed_coverage_and_lossless_tiff_input(self):
        self.assertEqual(len(list(fixture.jobs())),510)
        self.assertEqual(len(list(fixture.jobs(True))),76)
        self.assertEqual(fixture.SEEDS,tuple(range(100,116)))
        a,m=fixture.build('adjacent','poisson',500.,100)
        self.assertEqual([t['region_xyxy'] for t in m['truth']['periodic_components']],
            [[0,0,64,128]]*2+[[64,0,128,128]]*2)
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'source.tiff';tifffile.imwrite(p,a,photometric='minisblack',metadata=None)
            np.testing.assert_array_equal(tifffile.imread(p),a)

    def test_truth_assignment_never_double_counts_conjugate_pair(self):
        oracle.self_test()


if __name__=='__main__':unittest.main()
