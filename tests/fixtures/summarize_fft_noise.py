"""Independent, descriptive raw FFT aggregation; optional completed public tier.

python summarize_fft_noise.py RAW_OLD RAW_NEW --output NEW_DIR [--saved COMPLETED_DIR ...]
python summarize_fft_noise.py --single RAW --output NEW_DIR [--saved COMPLETED_DIR ...]
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
import math
from pathlib import Path
import sys
import numpy as np
import tifffile
from scipy.optimize import linear_sum_assignment


def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()


def load_jsonl(p):
    with p.open() as f:
        return [json.loads(line) for line in f if line.strip()]


def key(r):
    return (r['case'],r['noise_model'],r.get('dose'),r['window'],r['refinement'],tuple(r['roi_xyxy']))


def audit(row, record):
    """Reconstruct integer antipodal grouping and solve independently against truth."""
    if row['execution']!='ok': return
    h=row['roi_xyxy'][3]-row['roi_xyxy'][1]; w=row['roi_xyxy'][2]-row['roi_xyxy'][0]
    groups=row['diagnostic_conjugate_groups']; peakrows=row['diagnostic_peaks']
    bykey=defaultdict(list)
    for p in peakrows:
        x,y=p['bin_xy']; bykey[min((x,y),((2*(w//2)-x)%w,(2*(h//2)-y)%h))].append(p['peak_id'])
    actual={tuple(g['integer_conjugate_key_xy']):[p['peak_id'] for p in g['rows']] for g in groups}
    if len(actual)!=len(groups) or actual!=dict(sorted(bykey.items())): raise ValueError('integer conjugate grouping mismatch')
    if row['case']=='adjacent' and row['roi_xyxy']==[0,0,128,128]:
        if row['matches'] is not None or row['matched_count'] is not None: raise ValueError('mixed full ROI must not claim recovery')
        return
    truth=record['truth']['periodic_components']
    if row['case']=='adjacent': truth=[t for t in truth if t['region_xyxy']==row['roi_xyxy']]
    n,d=len(truth),len(groups)
    if row['truth_count']!=n or row['candidate_family_count']!=d: raise ValueError('truth/candidate count mismatch')
    distances=np.empty((n,d))
    for i,t in enumerate(truth):
        q=t['q_xy_cycles_per_pixel']
        for j,g in enumerate(groups):
            distances[i,j]=min(math.hypot((p['frequency_cycles_per_pixel'][0]-s*q[0])*w,(p['frequency_cycles_per_pixel'][1]-s*q[1])*h)
                               for p in g['rows'] for s in (-1,1))
    if n and d:
        # Independent augmented assignment. Penalty dominates any feasible distance sum.
        cost=np.full((n,d+n),1000.);cost[:,:d]=np.where(distances<=1.5,distances,100000.)
        rr,cc=linear_sum_assignment(cost)
        expected=[(int(i),int(j)) for i,j in zip(rr,cc) if j<d and distances[i,j]<=1.5]
    else: expected=[]
    matches=row['matches']; indices=[(m['truth_index'],m['group_index']) for m in matches]
    if len(indices)!=len(set(i for i,j in indices)) or len(indices)!=len(set(j for i,j in indices)): raise ValueError('truth or conjugate group reused')
    if len(matches)!=len(expected) or row['matched_count']!=len(expected): raise ValueError('assignment cardinality mismatch')
    if not math.isclose(sum(distances[i,j] for i,j in indices),sum(distances[i,j] for i,j in expected),abs_tol=1e-9): raise ValueError('assignment cost mismatch')
    if sorted(row['unmatched_truth_indices'])!=sorted(set(range(n))-{i for i,j in indices}): raise ValueError('unmatched truth mismatch')
    if sorted(row['unmatched_candidate_indices'])!=sorted(set(range(d))-{j for i,j in indices}): raise ValueError('unmatched groups mismatch')
    for m in matches:
        i,j=m['truth_index'],m['group_index']; p=next((p for p in groups[j]['rows'] if p['peak_id']==m['chosen_peak_id']),None)
        if p is None: raise ValueError('chosen peak not in group')
        q=truth[i]['q_xy_cycles_per_pixel']; v=[m['chosen_sign']*x for x in p['frequency_cycles_per_pixel']]
        dist=math.hypot((v[0]-q[0])*w,(v[1]-q[1])*h)
        period=1/math.hypot(*v); angle=math.degrees(math.atan2(v[1],v[0]))%180
        delta=abs(angle-truth[i]['direction_degrees_mod_180']); delta=min(delta,180-delta)
        checks=((dist,m['distance_bins']),((period-truth[i]['period_pixels'])/truth[i]['period_pixels'],m['period_relative_error']),(delta,m['direction_error_degrees']))
        if not all(math.isclose(a,b,abs_tol=1e-9) for a,b in checks): raise ValueError('matched error mismatch')


def quantile(xs,p): return float(np.percentile(xs,p)) if xs else None


def aggregate(rows):
    bags=defaultdict(list)
    for r in rows:
        if r.get('record_type')=='diagnostic_adjacent_comparison': continue
        bags[key(r)].append(r)
    out=[]
    for k,rr in sorted(bags.items(),key=lambda x:str(x[0])):
        ok=[r for r in rr if r['execution']=='ok']; eligible=[r for r in ok if r.get('matched_count') is not None]
        truth=[r for r in eligible if r['truth_count']>0]
        matched=[m for r in truth for m in r['matches']]
        periods=[abs(m['period_relative_error'])*100 for m in matched]
        directions=[m['direction_error_degrees'] for m in matched]
        unmatched=[len(r['unmatched_candidate_indices']) for r in eligible]
        case,model,dose,window,refine,roi=k
        out.append({'case':case,'noise_model':model,'dose':dose,'window':window,'refinement':refine,'roi_xyxy':list(roi),
                    'attempted':len(rr),'ok':len(ok),'errors':len(rr)-len(ok),'eligible':len(eligible),
                    'truth_image_denominator':len(truth),'truth_component_denominator':sum(r['truth_count'] for r in truth),
                    'candidate_group_denominator':sum(r['candidate_family_count'] for r in eligible),
                    'matched_component_count':len(matched),'both_or_all':sum(r['truth_count']>=2 and r['matched_count']==r['truth_count'] for r in truth),
                    'one':sum(r['matched_count']==1 for r in truth),'none':sum(r['matched_count']==0 for r in truth),
                    'match_count_histogram':dict(Counter(str(r['matched_count']) for r in truth)),
                    'unmatched_groups_total':sum(unmatched),'images_with_unmatched_groups':sum(v>0 for v in unmatched),
                    'unmatched_groups_median':quantile(unmatched,50), 'matched_error_denominator':len(matched),
                    'abs_period_error_percent_median':quantile(periods,50),'abs_period_error_percent_empirical_p95':quantile(periods,95),
                    'direction_error_degrees_median':quantile(directions,50),'direction_error_degrees_empirical_p95':quantile(directions,95),
                    'seed_values':sorted([r['seed'] for r in rr if r['seed'] is not None])})
    return out


def write_csv(p,rows):
    if not rows: return
    with p.open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader()
        for row in rows: w.writerow({k:json.dumps(v,sort_keys=True) if isinstance(v,(dict,list)) else v for k,v in row.items()})


def validate_saved(directory, summary, rows, candidate_runs):
    """Bind saved evidence to a supplied raw run and validate its complete rows."""
    run=summary['run']
    files=json.loads((directory/'filehash-manifest.json').read_text())['files_sha256']
    for name in ('summary.json','results.jsonl'):
        if files.get(name)!=sha(directory/name): raise ValueError('saved file hash mismatch: '+name)
    eligible=[]
    for label,source,raw_run,raw_rows in candidate_runs:
        if run.get('raw_sha256')!=sha(source/'raw.jsonl') or run.get('manifest_sha256')!=raw_run['manifest_sha256']:
            continue
        embedded=run.get('raw_run',{})
        if any(embedded.get(k)!=raw_run.get(k) for k in ('manifest_sha256','git_head','evaluator_sha256','module_hashes')):
            continue
        if run.get('git_head')!=raw_run['git_head']: continue
        producer=run.get('producer_module_sha256',{})
        if not raw_run.get('module_hashes') or any(producer.get(info['path'])!=info['sha256'] for info in raw_run['module_hashes'].values()):
            continue
        eligible.append((label,raw_rows))
    if not eligible: raise ValueError('saved run is not bound to an input raw SHA, manifest SHA and producer identity')
    if len(eligible)!=1: raise ValueError('saved run matches multiple raw versions')
    label,raw_rows=eligible[0]
    def rowkey(row):
        comparison=row.get('record_type') in ('comparison','diagnostic_adjacent_comparison')
        return (row['source_file'],row['window'],row['refinement'],None if comparison else tuple(row['roi_xyxy']))
    index={}
    for row in raw_rows:
        k=rowkey(row)
        if k in index: raise ValueError('duplicate raw record identity')
        index[k]=row
    seen=set(); counts=Counter(); sources=set()
    roi_status={'valid','ambiguous','insufficient_evidence'}
    comparison_status={'insufficient_geometry','incomplete_detection','ambiguous','compatible_signature','partial_match','incompatible'}
    for row in rows:
        kind=row.get('record_type')
        if kind not in ('roi','comparison'): raise ValueError('unexpected saved record type')
        k=rowkey(row)
        if k in seen or k not in index: raise ValueError('duplicate or unmatched saved record')
        seen.add(k); raw=index[k]
        if row.get('execution')!='ok' or row.get('parity') is not True or raw.get('execution')!='ok': raise ValueError('saved/raw row execution or parity failed')
        if not row.get('checks') or any(v.get('equal') is not True for v in row['checks'].values()): raise ValueError('saved row parity checks failed')
        if row.get('public_status') not in (roi_status if kind=='roi' else comparison_status): raise ValueError('missing or invalid saved public status')
        for field in ('case','noise_model','dose','seed','source_file','window','refinement'):
            if row.get(field)!=raw.get(field): raise ValueError('saved/raw identity mismatch: '+field)
        if kind=='roi':
            for field in ('source_sha256_tiff','source_sha256_array'):
                if row.get(field)!=raw.get(field): raise ValueError('saved/raw source hash mismatch')
        sources.add(row['source_file']); counts[kind]+=1
    mode=summary.get('mode')
    if mode not in ('fixed-subset','full-primary','background-holdout'):
        raise ValueError('unknown saved coverage mode')
    def included(raw):
        if raw['source_file'] not in sources: return False
        if mode=='fixed-subset': return True
        if raw['window']=='hann' and raw['refinement']=='quadratic': return True
        return mode=='full-primary' and raw['case']=='delta_control' and raw['window']=='none' and raw['refinement']=='quadratic'
    required={k for k,raw in index.items() if included(raw)}
    if seen!=required: raise ValueError('saved configuration coverage mismatch')
    c=summary['counts']
    for kind,expected_key in (('roi','expected_roi_evaluations'),('comparison','expected_comparisons')):
        n=summary[expected_key]
        if counts[kind]!=n or c.get(kind+'_attempted',0)!=n or c.get(kind+'_ok',0)!=n or c.get(kind+'_parity_pass',0)!=n:
            raise ValueError('saved row/count/parity coverage mismatch: '+kind)
    if len(sources)!=summary['expected_sources'] or c.get('source_attempted')!=len(sources) or c.get('source_ok')!=len(sources):
        raise ValueError('saved source coverage mismatch')
    if len(rows)!=sum(counts.values()) or summary.get('ok') is not True or summary.get('failures'):
        raise ValueError('saved summary incomplete or failed')
    return label

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('rawold',type=Path,nargs='?');p.add_argument('rawnew',type=Path,nargs='?');p.add_argument('--single',type=Path)
    p.add_argument('--output',required=True,type=Path);p.add_argument('--saved',type=Path,action='append',default=[]);a=p.parse_args()
    if a.single:
        if a.rawold or a.rawnew: p.error('--single cannot be combined with positional raw versions')
        versions=(('single',a.single),)
    else:
        if not a.rawold or not a.rawnew: p.error('provide RAW_OLD RAW_NEW or --single RAW')
        versions=(('old',a.rawold),('new',a.rawnew))
    sources={}; data={}; manifests={}; all_audits={}; dataset_audits={}; candidate_runs=[]
    for label,source in versions:
        source=source.resolve(strict=True); runpath=source/'run.json'; rawpath=source/'raw.jsonl';run=json.loads(runpath.read_text())
        manifestpath=Path(run['dataset'])/'manifest.json'
        if sha(manifestpath)!=run['manifest_sha256']: raise ValueError('dataset manifest hash mismatch')
        manifest=json.loads(manifestpath.read_text()); records={r['file']:r for r in manifest['records']}
        dataset=manifestpath.parent
        if manifest.get('fixture')=='controlled-backgrounds-holdout-v1':
            parameter_path=dataset/'parameters.json'
            if sha(parameter_path)!=manifest['parameters_sha256']: raise ValueError('holdout parameter hash mismatch')
            arrays={}
            for rec in manifest['records']:
                path=dataset/rec['file']; image=tifffile.imread(path)
                if sha(path)!=rec['sha256_tiff'] or hashlib.sha256(image.astype('<f4').tobytes(order='C')).hexdigest()!=rec['sha256_array_float32_le_c']:
                    raise ValueError('holdout TIFF hash mismatch: '+rec['file'])
                ideal=dataset/rec['ideal_expected_npy']; array=np.load(ideal,allow_pickle=False)
                if sha(ideal)!=rec['ideal_expected_npy_sha256'] or hashlib.sha256(array.astype('<f8').tobytes(order='C')).hexdigest()!=rec['ideal_expected_float64_le_c_sha256']:
                    raise ValueError('holdout ideal hash mismatch: '+str(ideal))
                arrays[(rec['case'],rec['seed'])]=image
            paired=[]
            for seed in range(1000,1016):
                equal=np.array_equal(arrays[('digital_offset',seed)],arrays[('signal',seed)]+np.float32(100))
                paired.append({'seed':seed,'exact':bool(equal)})
                if not equal: raise ValueError('digital offset paired check failed: '+str(seed))
            dataset_audits[label]={'parameter_sha256':sha(parameter_path),'parameter_values':json.loads(parameter_path.read_text()),'generator_sha256':manifest['generator_sha256'],
                                   'source_count':len(manifest['records']),'source_and_ideal_hashes_valid':True,'digital_offset_pair_checks':paired,
                                   'noiseless_note':'Float32 rounding occurs after offset; float32(signal)+100 need not equal float32(signal+100).'}
        rows=load_jsonl(rawpath); fail=[]; checked=0
        if label in dataset_audits:
            row_index={(row['case'],row['seed'],row['window'],row['refinement']):row for row in rows if row.get('record_type')!='diagnostic_adjacent_comparison'}
            comparisons=[]
            for window in ('hann','none'):
                for refinement in ('none','quadratic'):
                    for seed in range(1000,1016):
                        left=row_index[('signal',seed,window,refinement)];right=row_index[('digital_offset',seed,window,refinement)]
                        comparisons.append({'seed':seed,'window':window,'refinement':refinement,
                                            'peaks_exact':left.get('diagnostic_peaks')==right.get('diagnostic_peaks') and left['execution']==right['execution']=='ok'})
            dataset_audits[label]['digital_offset_raw_peak_pair_checks']=comparisons
        for index,row in enumerate(rows):
            if row.get('record_type')=='diagnostic_adjacent_comparison': continue
            try:
                rec=records[row['source_file']]
                if (row['source_sha256_tiff'],row['source_sha256_array'])!=(rec['sha256_tiff'],rec['sha256_array_float32_le_c']): raise ValueError('source manifest hashes differ')
                audit(row,rec);checked+=1
            except Exception as e: fail.append({'row_index':index,'error':str(e)})
        sources[label]={'path':str(source),'raw_sha256':sha(rawpath),'run_sha256':sha(runpath),'manifest_sha256':sha(manifestpath),'git_head':run['git_head']}
        data[label]=rows;manifests[label]=run['manifest_sha256'];all_audits[label]={'checked':checked,'failures':fail}
        candidate_runs.append((label,source,run,rows))
    if len(set(manifests.values()))!=1: raise ValueError('datasets differ')
    saved_outputs=[]
    for sp in a.saved:
        sp=sp.resolve(strict=True); summary=json.loads((sp/'summary.json').read_text()); rows=load_jsonl(sp/'results.jsonl')
        c=summary['counts']
        bound_label=validate_saved(sp,summary,rows,candidate_runs)
        public=Counter((r.get('case'),r.get('noise_model'),r.get('dose'),r.get('window'),r.get('refinement'),str(r.get('roi_xyxy')),r.get('public_status')) for r in rows if r.get('record_type')=='roi')
        saved_outputs.append({'path':str(sp),'bound_raw_label':bound_label,'filehash_manifest_sha256':sha(sp/'filehash-manifest.json'),'results_sha256':sha(sp/'results.jsonl'),'summary_sha256':sha(sp/'summary.json'),
                              'counts':summary['counts'],'statuses':[{'case':k[0],'model':k[1],'dose':k[2],'window':k[3],'refinement':k[4],'roi':k[5],'public_status':k[6],'count':v} for k,v in sorted(public.items(),key=lambda z:str(z[0]))]})
    a.output.mkdir(parents=True,exist_ok=False)
    for label,rows in data.items():
        grouped=aggregate(rows);(a.output/f'{label}-groups.json').write_text(json.dumps(grouped,indent=2,sort_keys=True)+'\n');write_csv(a.output/f'{label}-groups.csv',grouped)
    out={'sources':sources,'script_sha256':sha(Path(__file__)),'matcher_audit':all_audits,'dataset_audit':dataset_audits,'saved':saved_outputs,
         'limitations':'Descriptive finite-model summaries only; p95 is an empirical percentile, not confidence interval or error rate. Matched-only errors exclude misses.','python':sys.version,'numpy':np.__version__}
    (a.output/'provenance.json').write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
    if any(v['failures'] for v in all_audits.values()): raise SystemExit('Matcher audit failures: see provenance.json')
    print('Aggregated and audited:',{k:v['checked'] for k,v in all_audits.items()})

if __name__=='__main__': main()
