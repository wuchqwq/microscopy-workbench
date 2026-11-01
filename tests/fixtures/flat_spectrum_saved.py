"""Actual saved detector/atlas/field history; new synthetic sources only.

create FRESH_DIR: optional MICROSCOPY_TEST_REPOSITORY selects frozen producer.
history OLD_DIR FRESH_DIR: current source reads/replays old objects in place and
creates explicit new detector/atlas revisions. Original bytes are hash-checked.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import numpy as np
import tifffile

ROOT=Path(os.environ.get('MICROSCOPY_TEST_REPOSITORY',Path(__file__).resolve().parents[2]))
sys.path.insert(0,str(ROOT/'tools'))
import image_workspace as worker
MODE=sys.argv[1];OUT=Path(sys.argv[-1]).resolve();OUT.mkdir(parents=True,exist_ok=False)
BASE=OUT if MODE=='create' else Path(sys.argv[2]).resolve()
W=BASE/'workspace';calls=[];targets=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected={str(p):sha(p) for p in BASE.rglob('*') if p.is_file()} if MODE=='history' else {}


def dump(name,value):
    (OUT/name).write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')


def call(action,**params):
    request=dict(action=action,workspace=str(W),**params)
    if action not in ('get','result'):request.setdefault('request_id','flat-'+MODE+'-'+str(len(calls)))
    value=worker.execute(request);calls.append(dict(request=request,response=value));dump('calls.json',calls)
    return value


def ok(action,**params):
    value=call(action,**params);assert value['ok'],value
    return value['result']


def journal(ident):return json.loads((W/'requests'/(ident+'.json')).read_text())
def metadata(ident):return json.loads((W/'objects'/ident/'object.json').read_text())
def fft_ids():return {p.parent.name for p in W.glob('objects/*/object.json') if json.loads(p.read_text())['kind']=='fft'}


try:
    if MODE=='create':
        for name in ('impulse','periodic'):
            n=63;y,x=np.indices((n,2*n));a=np.zeros((n,2*n));a[20,25]=a[20,88]=1
            if name=='periodic':a=np.cos(2*np.pi*6*x/n)+np.cos(2*np.pi*8*y/n)
            source=OUT/(name+'.tiff');tifffile.imwrite(source,a.astype(np.float32),photometric='minisblack')
            opened=ok('open',source_path=str(source));frame=ok('frame',object_id=opened['object_id'],frame_index=0)
            settings=dict(window='none',subtract_mean=False,max_peaks=12,max_size=256,
                          peak_options=dict(threshold_rel=1. if name=='impulse' else .05,refinement='none'))
            atlas=ok('spatial_atlas',object_id=frame['object_id'],rects=[[0,0,63,63],[63,0,126,63]],**settings)
            feature=ok('feature_field',object_id=atlas['object_id'],coordinate_domain='pixel',display_feature='family_count',max_size=256)
            compared=ok('local_signature_compare',object_id=atlas['object_id'],reference_index=0,target_indices=[1],angles_degrees=[0,90],coordinate_domain='pixel',tolerance=.01)
            spatial=ok('spatial_field',object_id=frame['object_id'],window_sizes=[63],stride_xy=[63,63],max_windows=2,coordinate_domain='pixel',**settings)
            mapped=ok('domain_map',object_id=spatial['object_id'],angles_degrees=[0,90],tolerance=.01,max_size=256)
            targets.append(dict(case=name,frame=frame['object_id'],atlas=atlas['object_id'],feature=feature['object_id'],
                comparison=compared['object_id'],spatial=spatial['object_id'],domain=mapped['object_id'],
                statuses=[s['status'] for s in feature['samples']],families=[s['features']['family_count'] for s in feature['samples']]))
            if os.environ.get('MICROSCOPY_TEST_REPOSITORY') is None:
                expected='insufficient_evidence' if name=='impulse' else 'valid'
                assert all(s['status']==expected for s in spatial['samples']),spatial['samples']
                assert all(s['status']==expected for s in feature['samples']),feature['samples']
                if name=='impulse':
                    assert compared['relations'][0]['status']=='insufficient_geometry'
                    assert compared['relations'][0]['accepted_angles_degrees']==[]
        dump('targets.json',targets)
    else:
        targets=json.loads((BASE/'targets.json').read_text())
        # Snapshot the list first: subsequent new requests cannot become history.
        old_journals=[json.loads(p.read_text()) for p in sorted((W/'requests').glob('*.json'))]
        for old in old_journals:
            if old['state']!='completed':continue
            expected={k:v for k,v in old['response'].items() if k!='ok'}
            assert ok('result',query_request_id=old['request_id'])==expected
            assert worker.execute(old['parameters'])['result']==expected
            got=ok('get',object_id=expected['object_id'])
            if 'peak_table' in expected:
                assert got['peak_table']==expected['peak_table'] and 'version' not in got['peak_detection']
        before=fft_ids()
        for target in targets:
            atlas=metadata(target['atlas']);old_peaks=atlas['regions'][0]['peaks_object_id']
            for action,args in [('peak_measurements',dict(object_id=old_peaks)),
                ('feature_field',dict(object_id=target['atlas'],coordinate_domain='pixel',display_feature='family_count')),
                ('local_signature_compare',dict(object_id=target['atlas'],reference_index=0,target_indices=[1],angles_degrees=[0],coordinate_domain='pixel',tolerance=.01)),
                ('domain_map',dict(object_id=target['spatial'],angles_degrees=[0],tolerance=.01))]:
                refused=call(action,**args);assert not refused['ok'] and refused['error']['code']=='LEGACY_PEAK_DETECTION',refused
            prior=journal(atlas['request_id'])['parameters']
            revised=ok('spatial_atlas',**{k:v for k,v in prior.items() if k not in ('action','workspace','request_id')},previous_atlas_id=target['atlas'])
            assert all(r['fft_reused'] for r in revised['regions'])
            for old,new in zip(atlas['regions'],revised['regions']):
                assert old['fft_object_id']==new['fft_object_id'] and old['peaks_object_id']!=new['peaks_object_id']
                assert metadata(new['peaks_object_id'])['peak_detection']['version']==2
            new_field=ok('feature_field',object_id=revised['object_id'],coordinate_domain='pixel',display_feature='family_count',max_size=256)
            status='insufficient_evidence' if target['case']=='impulse' else 'valid'
            assert all(s['status']==status for s in new_field['samples'])
            assert ok('get',object_id=target['feature'])['samples']==metadata(target['feature'])['samples']
            assert ok('result',query_request_id=new_field['request_id'])==new_field
        assert fft_ids()==before,'Detector migration must reuse exact saved FFTs'
        assert all(sha(Path(p))==h for p,h in protected.items()),'Historical bytes changed'
        dump('history.json',dict(old_completed=sum(r['state']=='completed' for r in old_journals),
            original_files_unchanged=True,original_files_sha256=protected,fft_ids_unchanged=sorted(before),targets=targets))
finally:
    dump('manifest.json',dict(mode=MODE,repository=str(ROOT),
        commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        source_sha256=sha(Path(__file__)),calls=len(calls),
        module_sha256={p.name:sha(p) for p in (ROOT/'tools').glob('image_*.py')},
        files_sha256={str(p.relative_to(BASE)):sha(p) for p in BASE.rglob('*') if p.is_file()}))
print('PASS',MODE,len(calls),'saved worker calls; targets',targets)
