"""Algebra-only holdout model checks; no detector or random holdout sampled."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

path=Path(__file__).parent/'fixtures'/'controlled_fft_backgrounds.py'
spec=importlib.util.spec_from_file_location('controlled_backgrounds',path)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class FakeRng:
    def __init__(self,seed): self.calls=[]
    def poisson(self,lam,size=None):
        self.calls.append(('poisson',np.asarray(lam).shape))
        return np.full(size,100,dtype=int) if size is not None else np.round(lam).astype(int)
    def normal(self,loc,scale,size):
        self.calls.append(('normal',scale)); return np.full(size,5.)


class ControlledBackgroundAlgebra(unittest.TestCase):
    def test_expected_and_affine_truth(self):
        signal,physical,offset,sigma,truth=m.expected('signal')
        self.assertAlmostEqual(float(signal.mean()),500.)
        self.assertEqual((physical,offset,sigma),(0.,0.,0.))
        for name in ('digital_offset','physical_background','read_noise'):
            np.testing.assert_array_equal(m.expected(name)[0],signal)
        self.assertEqual(m.expected('digital_offset')[2],100.)
        self.assertEqual(m.expected('physical_background')[1],100.)
        self.assertEqual(m.expected('read_noise')[3],5.)
        affine=m.expected('affine')[-1]['q_xy_cycles_per_pixel']
        np.testing.assert_allclose(affine,np.asarray(m.SPEC['affine_xy']).T@np.asarray(m.SPEC['source_q_xy_cycles_per_pixel']))
        self.assertEqual(truth['region_xyxy'],[0,0,128,128])

    def test_poisson_vs_offset_vs_read_uses_distinct_calls(self):
        instances=[]
        def factory(seed):
            r=FakeRng(seed);instances.append(r);return r
        base,_=m.observe('signal',1000,factory)
        digital,_=m.observe('digital_offset',1000,factory)
        physical,_=m.observe('physical_background',1000,factory)
        read,_=m.observe('read_noise',1000,factory)
        np.testing.assert_array_equal(digital,base+100)
        np.testing.assert_array_equal(physical,base+100)
        np.testing.assert_array_equal(read,base+5)
        self.assertEqual([len(r.calls) for r in instances],[1,1,2,2])
        self.assertEqual(instances[2].calls[1][0],'poisson')
        self.assertEqual(instances[3].calls[1][0],'normal')
        self.assertEqual(base.dtype,np.float32)

    def test_seed_boundary_and_parameter_hash(self):
        with self.assertRaises(ValueError): m.observe('signal',100)
        self.assertEqual(len(m.SPEC['seeds']),16)
        self.assertEqual((m.SPEC['seeds'][0],m.SPEC['seeds'][-1]),(1000,1015))
        self.assertEqual(m.parameters_sha256(),m.sha(m.canonical(m.SPEC)))


if __name__=='__main__': unittest.main()
