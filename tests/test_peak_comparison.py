"""Known-answer saved-provider Task A, including reopen and negative controls."""
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker
from tools import image_peak_comparison as comparison


class SavedComparison(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.workspace = self.root/'workspace'
        self.counter = 0

    def call(self, action, **args):
        self.counter += 1
        response = worker.execute(dict(workspace=str(self.workspace), action=action,
            request_id='case-'+str(self.counter), **args))
        self.assertTrue(response['ok'], response)
        return response['result']

    def seed(self, changed=False, dark=False):
        y,x = np.indices((256,256))
        amp = np.where(x >= 128, 0. if dark else 1.6, 1.) if changed or dark else np.ones(x.shape)
        phase = np.where(x >= 128, .4, 0.) if changed else 0.
        raw = amp*np.cos(2*np.pi*x/8+phase)+amp*np.cos(2*np.pi*y/8-phase)
        source = self.root/'source.tiff'
        tifffile.imwrite(source, raw.astype('float32'))
        opened = self.call('open',source_path=str(source))
        frame = self.call('frame',object_id=opened['object_id'],frame_index=0)
        fft = self.call('fft',object_id=frame['object_id'],rect=[0,0,256,256],window='none',subtract_mean=True)
        return self.call('gpa',object_id=fft['object_id'],g_vectors=[[.125,0],[0,.125]],mask_sigma=.025,
            reference_rect=[40,96,72,128],reference_mode='fixed_g',reference_text='Known synthetic carrier',
            source_domain='real_space_lattice',source_domain_text='Synthetic test assumption')

    def plan(self, seed, roi=None):
        return self.call('method_plan',object_ids=[seed['object_id']],
            information=dict(goal=comparison.GOAL,roi_rect=roi or [184,96,216,128],reference_rect=[40,96,72,128],reference_text='Same image left reference'),
            budget=dict(method_calls=0,fft_pixels=0,gpa_band_pixels=0,topology_path_samples=0))

    def test_known_change_reopen_and_report(self):
        seed = self.seed(changed=True)
        result = self.plan(seed)
        report = result['decision']['peak_comparison']
        self.assertEqual(report['status'],'observed')
        for i,p in enumerate(report['peaks']):
            self.assertAlmostEqual(p['phase_difference_wrapped_rad'], .4 if i == 0 else -.4, delta=.003)
            self.assertAlmostEqual(p['amplitude_ratio'],1.6,delta=.003)
        self.assertFalse(report['physical_strain_admitted'])
        self.assertEqual(result['actions'],[])
        self.assertEqual(result['ledger']['spent']['method_calls'],0)
        reopened = worker.Workspace(str(self.workspace),False).object(result['object_id'])[0]
        self.assertEqual(reopened['decision'],result['decision'])
        queried = worker.execute(dict(workspace=str(self.workspace),action='result',query_request_id=result['request_id']))
        self.assertTrue(queried['ok'],queried)
        self.assertEqual(queried['result']['decision'],result['decision'])
        artifact = self.workspace/'objects'/result['object_id']/'peak-comparison.txt'
        self.assertIn('Band 0',artifact.read_text())
        revised = self.call('method_next',object_id=result['object_id'],information_patch={'roi_rect':[180,100,212,132]})
        self.assertEqual(revised['root_plan_id'],result['object_id'])
        self.assertAlmostEqual(revised['decision']['peak_comparison']['peaks'][0]['phase_difference_wrapped_rad'],.4,delta=.003)
        self.assertEqual(worker.Workspace(str(self.workspace),False).object(result['object_id'])[0]['decision'],result['decision'])
        # Read must revalidate bound original scientific arrays, not trust a cached summary.
        array = self.workspace/'objects'/seed['object_id']/'amplitude.npy'
        array.write_bytes(array.read_bytes()+b'corrupt')
        denied = worker.execute(dict(workspace=str(self.workspace),action='get',object_id=result['object_id']))
        self.assertFalse(denied['ok'])

    def test_moving_window_unchanged_carrier(self):
        seed = self.seed()
        for rect in ([184,96,216,128],[181,99,213,131]):
            result = self.plan(seed,rect)
            for p in result['decision']['peak_comparison']['peaks']:
                self.assertAlmostEqual(p['phase_difference_wrapped_rad'],0.,delta=1e-10)
                self.assertAlmostEqual(p['amplitude_ratio'],1.,delta=1e-10)

    def test_low_signal_abstains(self):
        result = self.plan(self.seed(dark=True))
        report = result['decision']['peak_comparison']
        self.assertEqual(report['status'],'insufficient_evidence')
        for p in report['peaks']:
            self.assertIsNone(p['phase_difference_wrapped_rad'])
            self.assertIsNone(p['amplitude_ratio'])
            self.assertGreater(p['regions']['roi_rect']['low_amplitude_count'],0)

    def test_invalid_roi_and_goal_switch_are_rejected(self):
        seed = self.seed()
        plan = self.plan(seed)
        for patch in ({'roi_rect':[0,0,300,32]}, {'goal':'projected_topology'}):
            result = worker.execute(dict(workspace=str(self.workspace),action='method_next',object_id=plan['object_id'],
                information_patch=patch,request_id='invalid-'+str(len(patch['roi_rect'])) if 'roi_rect' in patch else 'invalid-goal'))
            self.assertFalse(result['ok'])
        stopped = self.call('method_next',object_id=plan['object_id'],user_stop=True)
        self.assertEqual(stopped['decision']['status'],'stopped')
        self.assertEqual(worker.Workspace(str(self.workspace),False).object(stopped['object_id'])[0]['decision'],stopped['decision'])

    def test_incoherent_phase_preserves_amplitude_observation(self):
        shape = (2,32,32)
        phase = np.zeros(shape)
        phase[:,:,16::2] = np.pi
        arrays = dict(amplitude=np.ones(shape),phase_demodulated_wrapped=phase,
                      valid_phase=np.ones(shape,bool),low_amplitude=np.zeros(shape,bool))
        seed = dict(shape_yx=[32,32],object_id='synthetic',parameters={'g_vectors':[[.125,0],[0,.125]]},input_dependency={})
        report = comparison.summarize(arrays,seed,dict(roi_rect=[16,0,32,32],reference_rect=[0,0,16,32],reference_text='unit synthetic'),worker)
        for p in report['peaks']:
            self.assertIsNone(p['phase_difference_wrapped_rad'])
            self.assertEqual(p['amplitude_ratio'],1.)
            self.assertEqual(p['regions']['roi_rect']['amplitude_status'],'observed')

    def test_zero_input_remains_existing_gpa_evidence_refusal(self):
        with self.assertRaises(worker.gpa.core.GPAError) as caught:
            worker.gpa.core.analyze(np.zeros((128,128),complex),[[.125,0],[0,.125]],.025,[40,40,56,56])
        self.assertEqual(caught.exception.code,'GPA_INSUFFICIENT_EVIDENCE')

if __name__ == '__main__':
    unittest.main()
