"""Independent regression cases for saved/raw provenance and completeness."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

path=Path(__file__).parent/'fixtures'/'summarize_fft_noise.py'
spec=importlib.util.spec_from_file_location('fft_summary',path)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(path,value): path.write_text(json.dumps(value,sort_keys=True)+'\n')


class SavedProvenance(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name);self.raw=root/'raw';self.saved=root/'saved';self.raw.mkdir();self.saved.mkdir()
        self.raw_row={'case':'weak','noise_model':'poisson','dose':500.,'seed':1000,'source_file':'a.tiff',
                      'source_sha256_tiff':'tiff-a','source_sha256_array':'array-a','window':'hann',
                      'refinement':'quadratic','roi_xyxy':[0,0,128,128],'execution':'ok'}
        (self.raw/'raw.jsonl').write_text(json.dumps(self.raw_row)+'\n')
        self.raw_run={'manifest_sha256':'manifest-a','git_head':'commit-a','evaluator_sha256':'eval-a',
                      'module_hashes':{'tools.image_peaks':{'path':'/repo/tools/image_peaks.py','sha256':'producer-a'}}}
        self.row={**self.raw_row,'record_type':'roi','parity':True,'public_status':'ambiguous',
                  'checks':{'peak_count':{'equal':True}}}
        self.summary={'mode':'background-holdout','ok':True,'failures':[],'expected_sources':1,'expected_roi_evaluations':1,'expected_comparisons':0,
                      'counts':{'source_attempted':1,'source_ok':1,'roi_attempted':1,'roi_ok':1,'roi_parity_pass':1},
                      'run':{'raw_sha256':digest(self.raw/'raw.jsonl'),'manifest_sha256':'manifest-a',
                             'git_head':'commit-a','raw_run':copy.deepcopy(self.raw_run),
                             'producer_module_sha256':{'/repo/tools/image_peaks.py':'producer-a'}}}

    def check(self,summary=None,rows=None):
        summary=summary if summary is not None else self.summary
        rows=rows if rows is not None else [self.row]
        dump(self.saved/'summary.json',summary)
        (self.saved/'results.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
        dump(self.saved/'filehash-manifest.json',{'files_sha256':{n:digest(self.saved/n) for n in ('summary.json','results.jsonl')}})
        return m.validate_saved(self.saved,summary,rows,[('single',self.raw,self.raw_run,[self.raw_row])])

    def test_matching_real_shape_passes(self): self.assertEqual(self.check(),'single')
    def test_cross_dataset_rejected(self):
        s=copy.deepcopy(self.summary);s['run']['manifest_sha256']='manifest-other'
        with self.assertRaisesRegex(ValueError,'not bound'): self.check(s)
    def test_cross_raw_rejected(self):
        s=copy.deepcopy(self.summary);s['run']['raw_sha256']='raw-other'
        with self.assertRaisesRegex(ValueError,'not bound'): self.check(s)
    def test_producer_rejected(self):
        s=copy.deepcopy(self.summary);s['run']['producer_module_sha256']['/repo/tools/image_peaks.py']='producer-other'
        with self.assertRaisesRegex(ValueError,'not bound'): self.check(s)
    def test_failed_row_rejected_even_when_summary_claims_success(self):
        for field,value in (('execution','error'),('parity',False),('public_status',None)):
            r=copy.deepcopy(self.row);r[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError): self.check(rows=[r])
    def test_check_and_source_mismatch_rejected(self):
        for field,value in (('checks',{'peak_count':{'equal':False}}),('source_sha256_tiff','different')):
            r=copy.deepcopy(self.row);r[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError): self.check(rows=[r])
    def test_missing_and_duplicate_rows_rejected(self):
        for rows in ([],[self.row,self.row]):
            with self.subTest(count=len(rows)),self.assertRaises(ValueError): self.check(rows=rows)
    def test_file_hash_mismatch_rejected(self):
        self.check()
        (self.saved/'results.jsonl').write_text('tampered\n')
        with self.assertRaisesRegex(ValueError,'file hash mismatch'):
            m.validate_saved(self.saved,self.summary,[self.row],[('single',self.raw,self.raw_run,[self.raw_row])])


if __name__=='__main__': unittest.main()
