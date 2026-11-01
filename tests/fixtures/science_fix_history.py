"""Actual historical worker receipts, never rewritten to make validation pass.

Usage: python this.py /absolute/legacy-saved-run /absolute/fresh-output
Legacy run is made by science_fix_saved.py against the frozen pre-fix worker.
New comparison requests append only to that dedicated synthetic run workspace;
every original file is checked unchanged. No production/private workspace used.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(sys.argv[1]).resolve();OUT=Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True,exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected={p:sha(p) for p in BASE.rglob('*') if p.is_file()}
rows=[];count=0


def call(request):
    global count
    count+=1
    p=subprocess.run([sys.executable,'-B',str(ROOT/'tools/structure_worker.py')],input=json.dumps(request),
                     text=True,capture_output=True,cwd=ROOT,timeout=180)
    (OUT/f'{count:02d}.request.json').write_text(json.dumps(request,indent=2)+'\n')
    (OUT/f'{count:02d}.response.json').write_text(p.stdout)
    (OUT/f'{count:02d}.stderr.txt').write_text(p.stderr)
    result=json.loads(p.stdout);assert result['ok'],result
    return result


for file in sorted((BASE/'calls').glob('*.input.json')):
    request=json.loads(file.read_text())
    if request['action'] not in ('register','compare'):continue
    response_file=Path(str(file).replace('.input.json','.stdout.json'))
    old=json.loads(response_file.read_text())
    if not old.get('ok'):continue
    result=old['result'];assert 'evidence_semantics_version' not in result
    recovered=call(dict(action='result',workspace=request['workspace'],query_request_id=request['request_id']))
    assert recovered['result']==result
    repeated=call(request);assert repeated['result']==result
    call(dict(action='get',workspace=request['workspace'],object_id=result['object_id']))
    row=dict(action=request['action'],original_object_id=result['object_id'],original_response_sha256=sha(response_file),
             replay_equal=True,original_pass=result.get('held_out_validation_passed'))
    if request['action']=='compare' and request.get('registration_object_id'):
        new=call({**request,'request_id':'science-fix-current-'+request['request_id']})['result']
        assert new['independent_validation']['status']=='insufficient_evidence'
        assert new['source_registration_evidence_semantics_version']==1
        assert new['fit_validation_evidence']['source_evidence_semantics_version']==1
        for key,value in result['fit_validation_evidence'].items():assert new['fit_validation_evidence'][key]==value
        assert new['matched']==result['matched'] and new['ambiguity']==result['ambiguity']
        row.update(new_object_id=new['object_id'],current_independent_validation=new['independent_validation'],
                   historical_pass_preserved=new['fit_validation_evidence']['held_out_validation_passed'])
    rows.append(row)
assert all(sha(p)==h for p,h in protected.items())
(OUT/'summary.json').write_text(json.dumps(dict(rows=rows,original_file_count=len(protected),
    all_original_files_unchanged=True,calls=count,source_file_sha256=sha(Path(__file__))),indent=2)+'\n')
print('PASS',len(rows),'historical records;',len(protected),'original files unchanged;',count,'worker calls')
