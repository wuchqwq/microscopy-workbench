"""Standard-library package/hash/aggregate check; NOT a physical rerun."""
import collections,hashlib,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def close(a,b):return math.isclose(a,b,rel_tol=1e-11,abs_tol=1e-15)
def aggregate(m):
    if 'n' in m:return m
    return m.get('estimate_with_fallback',m.get('routed_or_fixed_with_fallback'))
def check(values,expected):
    assert len(values)==expected['n']
    if values:
        assert close(math.fsum(values)/len(values),expected['mae'])
        assert close(math.sqrt(math.fsum(v*v for v in values)/len(values)),expected['rmse'])
    else:assert expected['mae'] is None and expected['rmse'] is None
manifest=load(ROOT/'manifest.json')
actual={str(p.relative_to(ROOT)).replace('\\','/') for p in ROOT.rglob('*') if p.is_file() and p!=ROOT/'manifest.json'}
assert actual==set(manifest['files'])
for name,record in manifest['files'].items():
    p=(ROOT/name).resolve();assert p.is_relative_to(ROOT)
    assert p.stat().st_size==record['bytes'] and sha(p)==record['sha256']
    if p.suffix=='.json':load(p)
reports=[]
for p in sorted((ROOT/'studies').glob('*.json')):
    study=load(p);points=study['points'];groups=collections.defaultdict(list)
    for q in points:
        assert math.isfinite(q['absolute_error_detector_fraction']) and q['absolute_error_detector_fraction']>=0
        groups[q['method']].append(q)
    for method,rows in groups.items():
        assert len(rows)==study['query_denominator']
        assert len({(q['opaque_frame_id'],q['query_index']) for q in rows})==len(rows)
        check([q['absolute_error_detector_fraction'] for q in rows],aggregate(study['methods'][method]))
        if method!='S0':
            m=study['methods'][method];accepted=[q for q in rows if q.get('target_status')=='CONDITIONAL_POINT_ESTIMATE']
            s2=m.get('accepted_subset_S2',m.get('conditional_S2_accepted_subset'))
            s0=m.get('S0_on_same_accepted_subset',m.get('S0_on_same_accepted_subset'))
            if s2 is not None:
                check([q['absolute_error_detector_fraction'] for q in accepted],s2)
                baseline={(q['opaque_frame_id'],q['query_index']):q for q in groups['S0']}
                check([baseline[q['opaque_frame_id'],q['query_index']]['absolute_error_detector_fraction'] for q in accepted],s0)
    assert study['physical_model_verified'] is False and study['physical_classification']=='UNKNOWN'
    reports.append(dict(study=study['study_id'],queries=study['query_denominator'],arithmetic='PASS'))
one=load(ROOT/'studies/01-original-blind.json')
assert one['methods']['S2']['status']=='NOT_TESTED_NOT_REQUESTED'
assert one['methods']['AI_ROUTE']['requested']==0
two=load(ROOT/'studies/02-revealed-same-frame.json')
assert two['design']=='EXPLORATORY_NONBLIND_FIXED_S2_TRUTH_ALREADY_REVEALED'
assert two['whole_comparison_UNKNOWN']==2 and two['reference_UNKNOWN_occurrences']==2
three=load(ROOT/'studies/03-new-unseen.json')
assert aggregate(three['methods']['S0'])['mae'] < aggregate(three['methods']['AI_ROUTE'])['mae'] < aggregate(three['methods']['FIXED_S2'])['mae']
for p in ROOT.rglob('*.json'):
    def inspect(v):
        if isinstance(v,dict):
            for k,x in v.items():
                assert k not in {'truth','true_means','truth_expected_counts_per_pixel','state','hidden_target_site','noise_seeds','seeds','credentials','user.email','user.account_id'}
                inspect(x)
        elif isinstance(v,list):
            for x in v:inspect(x)
    inspect(load(p))
print(json.dumps(dict(status='PASS',manifest_sha256=sha(ROOT/'manifest.json'),files_verified=len(actual),studies=reports,scope='File integrity and safe-error aggregate arithmetic only; no physics, fitting, model, original-journal requalification or hidden truth reconstruction.'),indent=2))
