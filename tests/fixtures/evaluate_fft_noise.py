"""Raw numerical FFT exercise (not a saved-worker/public-status substitute).

python evaluate_fft_noise.py --repository REPO --dataset DATASET --output NEW_DIR
python evaluate_fft_noise.py --self-test
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import importlib
import json
import math
import platform
from pathlib import Path
import subprocess
import sys
import traceback
import numpy as np
import scipy
from scipy.optimize import linear_sum_assignment
import tifffile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def conjugate_groups(rows, shape):
    """Exact shifted integer-bin conjugacy, retaining every original row."""
    h, w = shape
    groups = {}
    for row in rows:
        x, y = row['bin_xy']
        a = (int(x), int(y))
        b = ((2*(w//2)-int(x)) % w, (2*(h//2)-int(y)) % h)
        key = min(a, b)
        groups.setdefault(key, []).append(row)
    return [{'integer_conjugate_key_xy': list(k), 'rows': v} for k, v in sorted(groups.items())]


def match_truth(truth, groups, shape, limit=1.5):
    """Independent maximum-cardinality, then minimum-distance assignment."""
    h, w = shape
    n, d = len(truth), len(groups)
    distances = np.empty((n, d), dtype=float)
    for i, item in enumerate(truth):
        q = np.asarray(item['q_xy_cycles_per_pixel'])
        for j, group in enumerate(groups):
            # A family is one candidate even when both refined rows exist.
            # Use closest row/sign to account for independently refined pairs.
            distances[i,j] = min(math.hypot((v[0]-sign*q[0])*w, (v[1]-sign*q[1])*h)
                for row in group['rows'] for v in [row['frequency_cycles_per_pixel']] for sign in (1,-1))
    if not n or not d:
        return [], list(range(n)), list(range(d)), distances.tolist()
    penalty = (n+1)*(limit+1)
    costs = np.full((n,d+n), penalty, dtype=float)
    costs[:, :d] = np.where(distances <= limit, distances, penalty*(n+2))
    rr, cc = linear_sum_assignment(costs)
    pairs = [(int(i),int(j)) for i,j in zip(rr,cc) if j<d and distances[i,j]<=limit]
    matches = []
    for i,j in pairs:
        q=np.asarray(truth[i]['q_xy_cycles_per_pixel']); group=groups[j]
        options=[]
        for row in group['rows']:
            for sign in (1,-1):
                v=np.asarray(row['frequency_cycles_per_pixel'])*sign
                options.append((math.hypot((v[0]-q[0])*w,(v[1]-q[1])*h),row,sign,v))
        distance,row,sign,v=min(options,key=lambda a:a[0])
        p=1/float(np.linalg.norm(v)) if np.linalg.norm(v) else None
        tp=truth[i]['period_pixels']; angle=float(np.degrees(np.arctan2(v[1],v[0]))%180)
        diff=abs(angle-truth[i]['direction_degrees_mod_180'])
        matches.append({'truth_index':i,'group_index':j,'chosen_peak_id':row['peak_id'],'chosen_sign':sign,
                        'detected_q_xy':v.tolist(),'distance_bins':distance,'period_error_pixels':p-tp if p else None,
                        'period_relative_error':(p-tp)/tp if p else None,'direction_error_degrees':min(diff,180-diff)})
    return matches, [i for i in range(n) if i not in {a for a,_ in pairs}], [j for j in range(d) if j not in {b for _,b in pairs}], distances.tolist()


def self_test():
    def row(i,x,y,fx,fy): return {'peak_id':str(i),'bin_xy':[x,y],'frequency_cycles_per_pixel':[fx,fy]}
    rows=[row(1,72,69,8/128,5/128),row(2,56,59,-8/128,-5/128)]
    groups=conjugate_groups(rows,(128,128))
    assert len(groups)==1 and len(groups[0]['rows'])==2
    truth=[{'q_xy_cycles_per_pixel':[x/128,5/128],'period_pixels':128/math.hypot(x,5),
            'direction_degrees_mod_180':math.degrees(math.atan2(5,x))%180} for x in (8,8.6)]
    matches,missing,extra,_=match_truth(truth,groups,(128,128))
    assert len(matches)==1 and len(missing)==1 and not extra and matches[0]['truth_index']==0
    two_truth=[{'q_xy_cycles_per_pixel':[x/128,5/128], 'period_pixels':128/math.hypot(x,5),
                'direction_degrees_mod_180':math.degrees(math.atan2(5,x))%180} for x in (8,10)]
    two_groups=conjugate_groups([row(1,73,69,9/128,5/128),row(2,71,69,7/128,5/128)],(128,128))
    assigned,missing,extra,_=match_truth(two_truth,two_groups,(128,128))
    assert len(assigned)==2 and not missing and not extra
    edge=conjugate_groups([row(1,0,64,-.5,0),row(2,0,64,-.5,0)],(128,128))
    assert len(edge)==1
    print('Oracle checks passed: exact conjugacy, retained rows, maximum cardinality and close-truth exclusivity.')


def load_modules(repo):
    sys.path.insert(0,str(repo))
    return tuple(importlib.import_module('tools.'+name) for name in
                 ('image_peaks','image_calibration','image_domain_compare','image_feature_field'))


def need(condition, message, *args):
    if not condition: raise ValueError(message)


def analyze(image, rec, roi, window, refine, modules):
    peaks, calibration, compare, feature = modules
    x0,y0,x1,y1=roi
    work=image[y0:y1,x0:x1].astype(np.float64)
    removed=float(np.mean(work)) if window=='hann' else 0.
    if window=='hann':
        work-=removed
        work*=np.hanning(work.shape[0])[:,None]
        work*=np.hanning(work.shape[1])[None,:]
    spectrum=np.fft.fftshift(np.fft.fft2(work))
    settings={'threshold_rel':.05,'max_peaks':16,'min_separation_bins':3,'exclude_dc_radius_bins':3,'refinement':refine}
    rows,parameters,quality=peaks.detect(spectrum,settings,need)
    geometries=[calibration.geometry(*r['frequency_cycles_per_pixel'],None,frequency=True) for r in rows]
    obs=[{'measurement_object_id':r['peak_id'],'vector_xy':r['frequency_cycles_per_pixel'],
          'frequency_cycles_per_pixel':r['frequency_cycles_per_pixel']} for r in rows]
    families=compare.fold_families(obs)
    noncollinear=compare.noncollinear(families)
    entry={'geometry_status':'admitted','families':families,
           'quality':{'detection_truncated':quality['selection_limit_reached'], 'has_two_noncollinear_families':noncollinear}}
    numeric=feature.features(entry,None)
    mixed=rec['case']=='adjacent' and roi==[0,0,128,128]
    truth=rec['truth']['periodic_components']
    if rec['case']=='adjacent' and not mixed:
        truth=[t for t in truth if t['region_xyxy']==roi]
    groups=conjugate_groups(rows,work.shape)
    matches,missing,extra,distances=match_truth(truth,groups,work.shape)
    result={'roi_xyxy':roi,'window':window,'subtract_mean':window=='hann','removed_mean':removed,
            'refinement':refine,'parameters':parameters,'diagnostic_peaks':rows,'diagnostic_quality':quality,
            'diagnostic_geometry':geometries,'diagnostic_families':families,'diagnostic_noncollinear':noncollinear,
            'diagnostic_features':numeric,'diagnostic_conjugate_groups':groups,
            'truth_count':None if mixed else len(truth),'candidate_family_count':len(groups),
            'matched_count':None if mixed else len(matches),'matches':None if mixed else matches,
            'unmatched_truth_indices':None if mixed else missing,'unmatched_candidate_indices':None if mixed else extra,
            'mixed_full_roi_nearest_bin_distance':([min(r) if r else None for r in distances] if mixed else None),
            'matching_note':'discrete candidate matching only; not a physical resolution claim',
            'statistical_significance':'not_assessed','physical_lattice':'not_assessed'}
    return result,entry


def evaluate(repo, dataset, output):
    repo=repo.resolve(strict=True); dataset=dataset.resolve(strict=True)
    manifest_path=dataset/'manifest.json'; manifest=json.loads(manifest_path.read_text())
    if manifest.get('schema')!='controlled-fft-noise-v2': raise ValueError('expected controlled-fft-noise-v2 manifest')
    modules=load_modules(repo)
    module_hashes={m.__name__:{'path':str(Path(m.__file__).resolve()),'sha256':digest(Path(m.__file__))} for m in modules}
    git=subprocess.run(['git','-C',str(repo),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
    output.mkdir(parents=True,exist_ok=False)
    meta={'repository':str(repo),'git_head':git,'module_hashes':module_hashes,'manifest_sha256':digest(manifest_path),
          'evaluator_sha256':digest(Path(__file__)),'numpy':np.__version__,'scipy':scipy.__version__,
          'tifffile':tifffile.__version__,'python':platform.python_version(),'dataset':str(dataset),
          'scope':'raw numerical harness; not a saved worker or public status',
          'statistical_significance':'not_assessed','physical_lattice':'not_assessed'}
    (output/'run.json').write_text(json.dumps(meta,indent=2,sort_keys=True)+'\n')
    counts={}; csvrows=[]
    with (output/'raw.jsonl').open('w') as stream:
        for rec in manifest['records']:
            source=dataset/rec['file']
            try:
                if source.parent.resolve()!=dataset or digest(source)!=rec['sha256_tiff']: raise ValueError('source file hash/path mismatch')
                image=tifffile.imread(source)
                if image.dtype!=np.float32 or list(image.shape)!=rec['shape_yx']: raise ValueError('source dtype/shape mismatch')
                if hashlib.sha256(image.astype('<f4').tobytes(order='C')).hexdigest()!=rec['sha256_array_float32_le_c']: raise ValueError('source array hash mismatch')
                source_error=None
            except Exception:
                image=None; source_error=traceback.format_exc()
            rois=[[0,0,rec['shape_yx'][1],rec['shape_yx'][0]]]
            if rec['case']=='adjacent': rois += [[0,0,64,128],[64,0,128,128]]
            for window in ('hann','none'):
                for refinement in ('none','quadratic'):
                    entries={}
                    for roi in rois:
                        key={'case':rec['case'],'noise_model':rec['noise_model'],'dose':rec.get('dose_expected_e_per_pixel'),
                             'seed':rec['seed'],'source_file':rec['file'],'source_sha256_tiff':rec['sha256_tiff'],
                             'source_sha256_array':rec['sha256_array_float32_le_c'],'roi_xyxy':roi,'window':window,'refinement':refinement}
                        try:
                            if source_error: raise ValueError('source verification failed: '+source_error)
                            data,entry=analyze(image,rec,roi,window,refinement,modules); entries[tuple(roi)]=entry
                            result={**key,'execution':'ok',**data}
                        except Exception:
                            result={**key,'execution':'error','error':traceback.format_exc(),
                                    'statistical_significance':'not_assessed','physical_lattice':'not_assessed'}
                        stream.write(json.dumps(result,allow_nan=False,sort_keys=True)+'\n')
                        category='|'.join(map(str,(rec['case'],rec['noise_model'],rec.get('dose_expected_e_per_pixel'),roi,window,refinement)))
                        bucket=counts.setdefault(category,{'attempted':0,'ok':0,'errors':0,'truth_denominator':0,'candidate_denominator':0,'matched':0})
                        bucket['attempted']+=1; bucket['ok' if result['execution']=='ok' else 'errors']+=1
                        for k,v in (('truth_denominator',result.get('truth_count')),('candidate_denominator',result.get('candidate_family_count')),('matched',result.get('matched_count'))):
                            if v is not None: bucket[k]+=v
                        csvrows.append({**key,'roi_xyxy':json.dumps(roi),'execution':result['execution'],
                                        'truth_count':result.get('truth_count'),'candidate_family_count':result.get('candidate_family_count'),
                                        'matched_count':result.get('matched_count'),'matches_json':json.dumps(result.get('matches')),
                                        'unmatched_truth_json':json.dumps(result.get('unmatched_truth_indices')),
                                        'unmatched_candidates_json':json.dumps(result.get('unmatched_candidate_indices')),
                                        'error':result.get('error')})
                    if rec['case']=='adjacent':
                        base={'case':rec['case'],'seed':rec['seed'],'noise_model':rec['noise_model'],'dose':rec.get('dose_expected_e_per_pixel'),
                              'source_file':rec['file'],'window':window,'refinement':refinement,'record_type':'diagnostic_adjacent_comparison'}
                        try:
                            result=modules[2].compare_families(entries[(0,0,64,128)],entries[(64,0,128,128)],[0.,90.],.01)
                            row={**base,'execution':'ok','diagnostic_comparison':result}
                        except Exception:
                            row={**base,'execution':'error','error':traceback.format_exc()}
                        stream.write(json.dumps(row,allow_nan=False,sort_keys=True)+'\n')
                        b=counts.setdefault('adjacent_comparison',{'attempted':0,'ok':0,'errors':0}); b['attempted']+=1; b[row['execution'] if row['execution']=='ok' else 'errors']+=1
    (output/'summary.json').write_text(json.dumps({'groups':counts,'run':meta},indent=2,sort_keys=True,allow_nan=False)+'\n')
    with (output/'summary.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(csvrows[0]) if csvrows else ['execution']);writer.writeheader();writer.writerows(csvrows)
    print(f"Wrote {len(csvrows)} image-ROI evaluations; inspect summary.json for errors.")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repository',type=Path);p.add_argument('--dataset',type=Path);p.add_argument('--output',type=Path)
    p.add_argument('--self-test',action='store_true')
    args=p.parse_args()
    if args.self_test:
        if any((args.repository,args.dataset,args.output)): p.error('--self-test takes no other arguments')
        self_test();return
    if not all((args.repository,args.dataset,args.output)): p.error('--repository, --dataset and --output are required')
    evaluate(args.repository,args.dataset,args.output)


if __name__=='__main__': main()
