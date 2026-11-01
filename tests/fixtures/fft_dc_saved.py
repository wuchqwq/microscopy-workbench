"""Real saved TIFF/atlas/feature chains and genuine v2 history in-place.

create NEW_DIR: MICROSCOPY_TEST_REPOSITORY selects a frozen producer if set.
history OLD_DIR NEW_REPORT: new provider reads old bytes and explicitly revises.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
import tifffile

ROOT=Path(os.environ.get('MICROSCOPY_TEST_REPOSITORY',Path(__file__).resolve().parents[2])).resolve()
sys.path.insert(0,str(ROOT/'tools'))
import image_workspace as worker
import image_peaks

MODE=sys.argv[1];OUT=Path(sys.argv[-1]).resolve();OUT.mkdir(parents=True,exist_ok=False)
BASE=OUT if MODE=='create' else Path(sys.argv[2]).resolve()
W=BASE/'workspace';calls=[];targets=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected={str(p):sha(p) for p in BASE.rglob('*') if p.is_file()} if MODE=='history' else {}


def dump(name,value):
    (OUT/name).write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')


def call(action,**params):
    request=dict(action=action,workspace=str(W),**params)
    if action not in ('get','result'):request.setdefault('request_id','dc-'+MODE+'-'+str(len(calls)))
    value=worker.execute(request);calls.append(dict(request=request,response=value));dump('calls.json',calls)
    return value


def ok(action,**params):
    value=call(action,**params);assert value['ok'],value
    return value['result']


def obj(ident):return json.loads((W/'objects'/ident/'object.json').read_text())
def fft_ids():return {p.parent.name for p in W.glob('objects/*/object.json') if json.loads(p.read_text())['kind']=='fft'}


try:
    if MODE=='create':
        for kind in ('delta_float32','delta_uint16','periodic'):
            n=63;y,x=np.indices((n,2*n));image=np.full((n,2*n),100.)
            if kind=='periodic':image+=.001*np.cos(2*np.pi*6*x/n)+.001*np.cos(2*np.pi*8*y/n)
            else:image[20,25]=image[20,88]=101
            image=image.astype(np.uint16 if kind=='delta_uint16' else np.float32)
            source=OUT/(kind+'.tiff');tifffile.imwrite(source,image,photometric='minisblack')
            opened=ok('open',source_path=str(source));frame=ok('frame',object_id=opened['object_id'],frame_index=0)
            for subtract in (False,True):
                options=dict(threshold_rel=.05,min_separation_bins=16 if kind!='periodic' else 3,refinement='none')
                atlas=ok('spatial_atlas',object_id=frame['object_id'],rects=[[0,0,63,63],[63,0,126,63]],
                    window='none',subtract_mean=subtract,max_peaks=16,peak_options=options,max_size=256)
                field=ok('feature_field',object_id=atlas['object_id'],coordinate_domain='pixel',display_feature='family_count',max_size=256)
                comp=ok('local_signature_compare',object_id=atlas['object_id'],reference_index=0,target_indices=[1],
                    angles_degrees=[0,90],coordinate_domain='pixel',tolerance=.01)
                targets.append(dict(case=kind,subtract_mean=subtract,atlas=atlas['object_id'],field=field['object_id'],
                    comparison=comp['object_id'],statuses=[s['status'] for s in field['samples']],
                    family_counts=[s['features']['family_count'] for s in field['samples']],
                    peaks=[r['peaks_object_id'] for r in atlas['regions']]))
                if image_peaks.DETECTOR_VERSION==3:
                    expected='valid' if kind=='periodic' else 'insufficient_evidence'
                    assert all(s['status']==expected for s in field['samples']),field
                for row in atlas['regions']:
                    p=obj(row['peaks_object_id']);f=obj(row['fft_object_id'])
                    assert p['files_sha256']['data.npy']==f['files_sha256']['data.npy']
        dump('targets.json',targets)
    elif MODE=='history':
        targets=json.loads((BASE/'targets.json').read_text())
        original=[json.loads(p.read_text()) for p in sorted((W/'requests').glob('*.json'))]
        for old in original:
            if old['state']!='completed':continue
            expected={k:v for k,v in old['response'].items() if k!='ok'}
            assert ok('result',query_request_id=old['request_id'])==expected
            replay=worker.execute(old['parameters']);assert replay['ok'] and replay['result']==expected
            got=ok('get',object_id=expected['object_id'])
            if 'peak_table' in expected:
                assert got['peak_table']==expected['peak_table']
                assert got['peak_detection']['version']==2
        before=fft_ids()
        for target in targets:
            old=obj(target['atlas'])
            for action,args in [('peak_measurements',dict(object_id=target['peaks'][0])),
                ('feature_field',dict(object_id=target['atlas'],coordinate_domain='pixel',display_feature='family_count')),
                ('local_signature_compare',dict(object_id=target['atlas'],reference_index=0,target_indices=[1],angles_degrees=[0],coordinate_domain='pixel',tolerance=.01))]:
                refused=call(action,**args)
                assert not refused['ok'] and refused['error']['code']=='LEGACY_PEAK_DETECTION',refused
            prior=json.loads((W/'requests'/(old['request_id']+'.json')).read_text())['parameters']
            revised=ok('spatial_atlas',**{k:v for k,v in prior.items() if k not in ('action','workspace','request_id')},previous_atlas_id=old['object_id'])
            for a,b in zip(old['regions'],revised['regions']):
                assert b['fft_reused'] and a['fft_object_id']==b['fft_object_id']
                assert a['peaks_object_id']!=b['peaks_object_id'] and obj(b['peaks_object_id'])['peak_detection']['version']==3
            field=ok('feature_field',object_id=revised['object_id'],coordinate_domain='pixel',display_feature='family_count',max_size=256)
            assert all(s['status']==('valid' if target['case']=='periodic' else 'insufficient_evidence') for s in field['samples'])
            assert ok('get',object_id=target['field'])['samples']==obj(target['field'])['samples']
        assert fft_ids()==before
        assert all(sha(Path(p))==v for p,v in protected.items())
        dump('history.json',dict(completed_original_requests=sum(r['state']=='completed' for r in original),
            original_files_sha256=protected,original_files_unchanged=True,reused_fft_ids=sorted(before)))
    else:raise ValueError('mode must be create or history')
finally:
    dump('manifest.json',dict(mode=MODE,repository=str(ROOT),commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        producer_tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip(),calls=len(calls),
        fixture_sha256=sha(Path(__file__)),module_sha256={p.name:sha(p) for p in (ROOT/'tools').glob('image_*.py')},
        files_sha256={str(p.relative_to(BASE)):sha(p) for p in BASE.rglob('*') if p.is_file()}))
print('PASS',MODE,len(calls),'calls',targets)
