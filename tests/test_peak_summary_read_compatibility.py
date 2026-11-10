"""Coherence-only read compatibility: true archive and adversarial controls."""
import copy
from decimal import Decimal
import hashlib
import io
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker
from tools import image_peak_comparison as comparison
from tools import image_peak_summary_validation as validation


def diagnostic_case(side=8, mode='observed'):
    shape = (2, side, side*2)
    phase = np.zeros(shape)
    phase[0, :, side:] = .4; phase[1, :, side:] = -.4
    if mode == 'cancellation':
        phase[0, :, side:] = 0.; phase[0, :, side::2] = math.pi
    if mode == 'threshold':
        phase[0, :, :side] = math.acos(.9)
        phase[0, :, :side:2] *= -1
    arrays = dict(amplitude=np.ones(shape), phase_demodulated_wrapped=phase,
                  valid_phase=np.ones(shape, bool), low_amplitude=np.zeros(shape, bool))
    hashes = {}
    for key, value in arrays.items():
        stream=io.BytesIO(); np.save(stream,value,allow_pickle=False)
        hashes[key+'.npy']=hashlib.sha256(stream.getvalue()).hexdigest()
    seed = dict(object_id='a'*32, shape_yx=[side,side*2], input_dependency={},
                parameters={'g_vectors':[[.125,0],[0,.125]]}, files_sha256=hashes)
    info=dict(roi_rect=[side,0,side*2,side],reference_rect=[0,0,side,side],reference_text='Direct synthetic diagnostic, not a saved provider object')
    report=comparison.summarize(arrays,seed,info,worker)
    decision=dict(status=report['status'],peak_comparison=report,reason='Direct summary test',cost=0)
    return arrays,seed,info,decision


def coherence(decision, band=0, region='roi_rect'):
    return decision['peak_comparison']['peaks'][band]['regions'][region]


class ReductionContract(unittest.TestCase):
    def check(self, case, saved):
        arrays,seed,info,expected=case
        return validation.validate_diagnostics(saved,expected,arrays,seed,info,worker)

    def test_exact_then_compatible_one_ulp_without_any_rejudgment(self):
        case=diagnostic_case(); expected=case[-1]
        self.assertEqual(self.check(case,expected)['route'],'exact')
        saved=copy.deepcopy(expected)
        coherence(saved)[validation.FIELD]=math.nextafter(coherence(saved)[validation.FIELD],0.)
        before=copy.deepcopy(saved)
        receipt=self.check(case,saved)
        self.assertEqual(receipt['route'],'coherence_reduction_compatibility')
        self.assertEqual(len(receipt['changed_fields']),1)
        self.assertEqual(saved,before)
        self.assertEqual(receipt['source_arrays_sha256'],case[1]['files_sha256'])

    def test_sample_count_controls_envelope_even_for_one_repeated_sample(self):
        small=diagnostic_case(8); large=diagnostic_case(64)
        for case, admitted in ((small,False),(large,True)):
            saved=copy.deepcopy(case[-1])
            coherence(saved)[validation.FIELD] -= 1e-13
            if admitted: self.assertEqual(self.check(case,saved)['route'],'coherence_reduction_compatibility')
            else:
                with self.assertRaisesRegex(ValueError,'envelope exceeded'):self.check(case,saved)
        lo=validation.coherence_interval(np.ones(64),np.zeros(64))
        hi=validation.coherence_interval(np.ones(4096),np.zeros(4096))
        self.assertEqual((lo['n'],hi['n']),(64,4096))
        self.assertGreater(Decimal(hi['upper'])-Decimal(hi['lower']),10*(Decimal(lo['upper'])-Decimal(lo['lower'])))

    def test_cancellation_uses_absolute_sum_bound_not_relative_result_error(self):
        case=diagnostic_case(mode='cancellation')
        saved=copy.deepcopy(case[-1]); coherence(saved)[validation.FIELD]=0.
        before=copy.deepcopy(saved)
        receipt=self.check(case,saved)
        interval=next(r for r in receipt['intervals'] if r['band_index']==0 and r['region']=='roi_rect')
        self.assertEqual(Decimal(interval['lower']),0)
        self.assertLess(Decimal(interval['reference']),Decimal('1e-15'))
        self.assertIsNone(coherence(saved)['circular_phase_rad'])
        self.assertEqual(saved,before)

    def test_unchanged_region_crossing_point_nine_blocks_whole_compat_read(self):
        case=diagnostic_case(mode='threshold')
        saved=copy.deepcopy(case[-1])
        # Force compatibility only in the safe ROI; the unchanged reference is ambiguous.
        coherence(saved)[validation.FIELD]=math.nextafter(coherence(saved)[validation.FIELD],0.)
        before=copy.deepcopy(saved)
        with self.assertRaisesRegex(ValueError,'0.9 guard'):self.check(case,saved)
        self.assertEqual(saved,before)

    def test_status_null_count_reference_parameters_and_types_are_exact(self):
        case=diagnostic_case()
        for mode in ('status','null','count','reference','parameter','cost','type'):
            with self.subTest(mode=mode):
                saved=copy.deepcopy(case[-1]); row=coherence(saved)
                row[validation.FIELD]=math.nextafter(row[validation.FIELD],0.)
                if mode=='status':row['status']='insufficient_evidence'
                if mode=='null':row['circular_phase_rad']=None
                if mode=='count':row['valid_count']-=1
                if mode=='reference':saved['peak_comparison']['reference_rect'][0]=1
                if mode=='parameter':saved['peak_comparison']['filter_parameters']['g_vectors'][0][0]=.126
                if mode=='cost':saved['cost']=1
                if mode=='type':row['valid_count']=float(row['valid_count'])
                with self.assertRaisesRegex(ValueError,'Non-allowlisted'):self.check(case,saved)

    def test_nonfinite_excess_zero_weight_underflow_and_resource_refusal(self):
        case=diagnostic_case()
        for bad in (float('nan'),float('inf'),-float('inf'),1-1e-10):
            saved=copy.deepcopy(case[-1]); coherence(saved)[validation.FIELD]=bad
            with self.assertRaises(ValueError):self.check(case,saved)
        self.assertTrue(validation.coherence_interval(np.zeros(16),np.zeros(16))['zero_weight'])
        with self.assertRaisesRegex(ValueError,'underflow'):validation.coherence_interval(np.full(16,math.ulp(0.)),np.zeros(16))
        with self.assertRaisesRegex(ValueError,'resource'):validation.coherence_interval(np.ones(65537),np.zeros(65537))
        for a,p in (([1.,-1.],[0.,0.]),([1.,1.],[0.,float('nan')]),([1.,1.],[0.,math.pi+1e-10])):
            with self.assertRaises(ValueError):validation.coherence_interval(a,p)


HANDOFF=Path(os.environ.get('HRTEM_HANDOFF_ROOT','__handoff_not_configured__'))


@unittest.skipUnless((HANDOFF/'positive'/'workspace').is_dir(),'Set HRTEM_HANDOFF_ROOT; original archive required, no regenerated substitute')
class OriginalPlans(unittest.TestCase):
    def test_true_original_get_result_compact_and_every_package_hash_unchanged(self):
        manifest=worker.read_json(HANDOFF.parent/'MANIFEST.json')
        def hashes():return {k:worker.sha_file(HANDOFF.parent/k) for k in manifest['files']}
        before=hashes()
        for label,ident in [('positive','ec1a8c8a062b49eaba3ce4250204ff72'),('abstention','aa5cba25f18040fd8aeedc34ff32a46f')]:
            root=HANDOFF/label/'workspace'
            original=worker.read_json(root/'objects'/ident/'object.json')
            for args in (dict(action='get',object_id=ident),dict(action='result',query_request_id='case-5'),
                         dict(action='get',object_id=ident,response_detail='compact'),dict(action='result',query_request_id='case-5',response_detail='compact')):
                response=worker.execute(dict(workspace=str(root),**args));self.assertTrue(response['ok'],response)
                result=response['result'];self.assertEqual(result['object_id'],ident)
                self.assertEqual(result['decision'],original['decision'])
                for key in ('information','budget','actions','input_refs','seed_object_ids','root_plan_id','ledger'):
                    self.assertEqual(result[key],original[key])
                if 'response_detail' not in args:
                    for k,v in original.items():self.assertEqual(result[k],v,k)
                receipt=result[validation.RECEIPT_KEY]['records'][0]
                self.assertEqual(receipt['manifest_sha256'],worker.sha_file(root/'objects'/ident/'object.json'))
                self.assertEqual(len(receipt['changed_fields']),3 if label=='positive' else 1)
                self.assertEqual(len(receipt['intervals']),4)
                self.assertEqual(receipt['route'],'coherence_reduction_compatibility')
                self.assertIn('gpa_analytic_read_validation',result)
        self.assertEqual(hashes(),before)
        self.assertEqual(before,{k:v['sha256'] for k,v in manifest['files'].items()})

    def test_bound_source_id_regions_masks_counts_parameters_actions_budget_tampering_refused(self):
        ident='ec1a8c8a062b49eaba3ce4250204ff72'
        for mode in ('source_array','id','roi','reference','mask','count','parameter','action','budget'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp)/'workspace';shutil.copytree(HANDOFF/'positive'/'workspace',root)
                path=root/'objects'/ident/'object.json'; journal_path=root/'requests'/'case-5.json'
                metadata=worker.read_json(path);journal=worker.read_json(journal_path)
                if mode in ('source_array','mask'):
                    payload=root/'objects'/('12832433936f4b7da2e8af8c5e2b05c3' if mode=='source_array' else '7d5e0f3f49524593a05a9850f053e1eb')/('data.npy' if mode=='source_array' else 'valid_phase.npy')
                    payload.write_bytes(payload.read_bytes()+b'changed')
                else:
                    if mode=='id':metadata['seed_object_ids']=['0'*32]
                    if mode=='roi':metadata['information']['roi_rect'][0]+=1
                    if mode=='reference':metadata['information']['reference_rect'][0]+=1
                    if mode=='count':coherence(metadata['decision'])['valid_count']-=1
                    if mode=='parameter':metadata['decision']['peak_comparison']['filter_parameters']['mask_sigma']=.024
                    if mode=='action':metadata['actions']=[{'kind':'stop','action_id':'0'*32}]
                    if mode=='budget':metadata['budget']['method_calls']=1
                    path.write_bytes(worker.canonical(metadata)+b'\n')
                    journal['object_manifest_sha256']=worker.sha_file(path)
                    journal['response']={'ok':True,'state':'completed','backend':worker.BACKEND,'request_id':'case-5',**metadata}
                    journal_path.write_bytes(worker.canonical(journal))
                response=worker.execute(dict(workspace=str(root),action='get',object_id=ident))
                self.assertFalse(response['ok'],response)
                self.assertEqual(response['error']['code'],'CORRUPT_OBJECT',response)
                self.assertNotIn(validation.RECEIPT_KEY,response)


if __name__=='__main__':unittest.main()
