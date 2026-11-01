"""Replay genuine old saved chains in place, preserving every original byte.

First run science_fix_saved.py with MICROSCOPY_TEST_REPOSITORY at the frozen
pre-occupancy commit. This probe uses the current worker at its original bound
workspace path; it never rewrites hashes, paths or old interpretations.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE, OUT = (Path(v).resolve() for v in sys.argv[1:3])
OUT.mkdir(parents=True, exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
protected = {str(p): sha(p) for p in BASE.rglob('*') if p.is_file()}
calls, records = [], []


def call(request):
    p = subprocess.run([sys.executable, '-B', str(ROOT/'tools/structure_worker.py')],
                       input=json.dumps(request), text=True, capture_output=True,
                       cwd=ROOT, timeout=180)
    stem = OUT / f'{len(calls)+1:03d}'
    stem.with_suffix('.request.json').write_text(json.dumps(request, indent=2)+'\n')
    stem.with_suffix('.response.json').write_text(p.stdout)
    stem.with_suffix('.stderr.txt').write_text(p.stderr)
    value = json.loads(p.stdout)
    calls.append(dict(action=request['action'], request_id=request.get('request_id'),
                      ok=value['ok'], response_sha256=hashlib.sha256(p.stdout.encode()).hexdigest()))
    return value


for file in sorted((BASE/'calls').glob('*-structure-*.input.json')):
    request = json.loads(file.read_text())
    old = json.loads(file.with_name(file.name.replace('.input.', '.stdout.')).read_text())
    if not old['ok'] or request['action'] == 'result':
        continue
    expected = old['result']
    recovered = call(dict(action='result', workspace=request['workspace'], query_request_id=request['request_id']))
    repeated = call(request)
    assert recovered == old and repeated == old, (request, recovered, repeated)
    fetched = call(dict(action='get', workspace=request['workspace'], object_id=expected['object_id']))
    assert fetched['ok'] and fetched['result']['object_id'] == expected['object_id'], fetched
    # Recovered historical structures retain their original five-field snapshot.
    if expected['kind'] == 'structure':
        included = call(dict(action='get', workspace=request['workspace'], object_id=expected['object_id'], include_atoms=True))
        original = json.loads((Path(expected['manifest_path']).parent/'atoms.json').read_text())
        assert included['result']['atoms'] == original and 'atom_model_version' not in original
        refused = call(dict(action='derive', workspace=request['workspace'], object_id=expected['object_id'],
                            repeat=[1,1,1], request_id='occupancy-new-derive-'+request['request_id']))
        assert not refused['ok'] and refused['error']['code'] == 'LEGACY_OCCUPANCY_UNQUALIFIED', refused
    if request['action'] in ('simulate', 'register', 'compare', 'general_compare', 'twin_orient', 'twin_compare'):
        refused = call({**request, 'request_id':'occupancy-new-'+request['request_id']})
        assert not refused['ok'], refused
        assert refused['error']['code'] in ('LEGACY_OCCUPANCY_UNQUALIFIED', 'UNSUPPORTED_TWIN_SCOPE'), refused
    records.append(dict(action=request['action'], kind=expected['kind'], object_id=expected['object_id'],
                        exact_request_replay=True, exact_recovery=True))

assert all(sha(Path(p)) == h for p,h in protected.items())
(OUT/'summary.json').write_text(json.dumps(dict(records=records, calls=calls,
    original_files_sha256=protected, original_files_unchanged=True,
    source_sha256=sha(Path(__file__))), indent=2)+'\n')
print('PASS', len(records), 'old records;', len(calls), 'actual worker calls;',
      len(protected), 'original files unchanged')
