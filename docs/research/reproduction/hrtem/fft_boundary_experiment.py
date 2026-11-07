"""Isolated synthetic FFT-candidate boundary experiment; never edits the provider.

prepare freezes analytic input truth and scoring before detect() is run.
run evaluates the unchanged pinned provider's detector, not a model simulation.
"""
from pathlib import Path
import sys, json, math, hashlib, subprocess, csv, datetime, platform, collections
sys.dont_write_bytecode=True
import numpy as np
import scipy
from scipy.optimize import linear_sum_assignment
import tifffile
ROOT=Path(__file__).resolve().parent
REPO=ROOT/'science-7a1d3e0';OUT=ROOT/'fft-peak-boundary-7a1d3e0'
BASELINE='7a1d3e01f9142432345fa4754268437c90a17d04'
def dump(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def need(ok,message,*args):
 if not ok:raise ValueError(message)
def generate(spec,n=128):
 y,x=np.indices((n,n),dtype=np.float64);a=np.zeros((n,n))
 for tone in spec['tones']:
  qx,qy=tone['bin_xy'];a+=tone['amplitude']*np.cos(2*np.pi*(qx*x+qy*y)/n+tone['phase'])
 rms=float(np.sqrt(np.mean((a-a.mean())**2)))
 if rms:a/=rms
 return a,rms
def tone(x,y=11.2,amplitude=1.,phase=0.):return {'bin_xy':[x,y],'amplitude':amplitude,'phase':phase}
def prepare():
 need(subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD'],text=True).strip()==BASELINE,'Wrong baseline')
 OUT.mkdir(exist_ok=False);(OUT/'inputs').mkdir();specs=[]
 def add(label,kind,tones,**kw):specs.append({'label':label,'kind':kind,'tones':tones,**kw})
 add('single_integer','single',[tone(24,11)])
 add('single_fractional','single',[tone(24.3)])
 gaps=[.3,.6,1.,1.5,2.,2.5,3.,4.,6.]
 for gap in gaps:
  q=[tone(24.3-gap/2),tone(24.3+gap/2)]
  for phase in [0.,math.pi/2]:
   tones=[dict(q[0]),dict(q[1],phase=phase)]
   add(f'pair_d{gap:g}_p{0 if phase==0 else 90}','equal_pair',tones,gap_bins=gap,relative_phase=phase,template_bin_xy=[v['bin_xy'] for v in q])
  add(f'single_lower_d{gap:g}','single_pair_control',[q[0]],gap_bins=gap,template_bin_xy=[v['bin_xy'] for v in q])
 for ratio in [.5,.2,.1,.05,.02,.01]:
  q=[tone(20.3),tone(26.3,amplitude=ratio)]
  add(f'strong_weak_r{ratio:g}','strong_weak',q,gap_bins=6.,weak_ratio=ratio,template_bin_xy=[v['bin_xy'] for v in q])
 add('strong_only','strong_only_control',[tone(20.3)],gap_bins=6.,template_bin_xy=[[20.3,11.2],[26.3,11.2]])
 add('noise_only','noise',[])
 defaults={'max_peaks':12,'min_separation_bins':3,'exclude_dc_radius_bins':3,'threshold_rel':.05,'refinement':'quadratic'}
 plan={'prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':BASELINE,'shape_yx':[128,128],'input_dtype':'float64','frequency_unit':'cycles/pixel; analytic bin vector divided by128; no physical calibration','noise':{'distribution':'independent additive Gaussian pixels, NumPy PCG64 default_rng(seed)','sigma_over_clean_contrast_rms':[0,.25,1,2],'seeds':list(range(100,116)),'clean_once':True,'paired_noise':'same standardized array per seed across signal/noise levels; paired comparisons, not independent matrix cells','noise_only_reference':'clean signal is zero; nonzero sigma is absolute relative to unit-RMS signal convention, ratio to its own zero RMS undefined'},'detector_parameters':defaults,'main_preprocessing':[{'window':w,'subtract_mean':m} for w in ['none','hann'] for m in [False,True]],'actual_API_defaults':{'FFT':{'window':'none','subtract_mean':False},'peaks':defaults},'matching':{'method':'Hungarian maximum-cardinality then minimum Euclidean bin distance, fixed0.5bin gate, one-to-one over explicit +/- tone truth','miss_cost':100.,'forbidden_cost':1e6,'gate_bins':.5,'conjugates':'Report signed matches AND tone families with both signs; conjugates are not independent physical evidence','strict_pair':'Both signs of both templates matched one-to-one inside min(0.5,gap/4)bin disjoint gates; observed separation within25% of truth on each branch','false_pair_control':'Apply same two-template criterion to a single-tone source; not a true resolved pair','interpretation':'Recovering two analytic components is an operational criterion, not certified resolution or physical phase validation'},'sensitivity':{'min_separation_values':[1,2,4],'only_labels':['pair_d0.6_p0','pair_d1.5_p0','pair_d2_p0','pair_d2.5_p0','pair_d3_p0','pair_d4_p0','single_lower_d0.6','single_lower_d2','single_lower_d3'],'threshold_values':[.01,.1,.25,.5,.9],'threshold_labels':['single_fractional','strong_weak_r0.1','strong_weak_r0.05','strong_weak_r0.02','strong_only','noise_only'],'noise_levels':[0,1,2],'seed_subset':list(range(100,104)),'preprocessing':[{'window':'none','subtract_mean':False},{'window':'hann','subtract_mean':True}]},'old_result_context':'Parent supplied summary of old3d59c2b/#63,128² Hann/mean/quadratic seeds100..115,0.6bin unresolved. Old parameters/data/artifacts were not available or imported. Current run is pinned7a1d3e0, not a reclassification of old evidence. D50 noise semantics unknown; do not equate it to a current sigma level.','scopes':['Scalar cosine imaging proxies, not scattering/atomistic microscopy','Conditional results at one size, two relative phases and a fixed finite seed set','Extra candidates relative to analytic tone truth, not phase false-positive rates'],'specs':specs,'cases':[],'environment':{'python':sys.version,'numpy':np.__version__,'scipy':scipy.__version__,'platform':platform.platform()},'source_hashes':{str(p.relative_to(REPO)):sha(p) for p in [REPO/'tools/image_peaks.py',REPO/'tools/image_workspace.py',REPO/'tools/result_semantics.py']}}
 for spec in specs:
  clean,rms=generate(spec)
  for sigma in [0,.25,1.,2.]:
   for seed in ([None] if sigma==0 else range(100,116)):
    case_id=f'c{len(plan["cases"]):04d}';a=clean.copy() if sigma==0 else clean+sigma*np.random.default_rng(seed).standard_normal(clean.shape)
    file=OUT/'inputs'/f'{case_id}.tiff';tifffile.imwrite(file,a.astype(np.float64),photometric='minisblack',metadata=None,compression='deflate')
    truth=[]
    for j,t in enumerate(spec['tones']):
     for sign in [1,-1]:truth.append({'tone':j,'sign':sign,'bin_xy':[sign*v for v in t['bin_xy']]})
    plan['cases'].append({'case_id':case_id,'label':spec['label'],'kind':spec['kind'],'sigma':sigma,'seed':seed,'path':str(file.relative_to(OUT)),'sha256':sha(file),'actual_clean_contrast_rms':float(np.sqrt(np.mean((clean-clean.mean())**2))),'raw_generator_contrast_rms':rms,'truth':truth})
 dump(OUT/'frozen-plan.json',plan);dump(OUT/'plan-sha256.json',{'frozen-plan.json':sha(OUT/'frozen-plan.json'),'experiment_script':sha(Path(__file__))});print(json.dumps({'prepared':str(OUT),'base_specs':len(specs),'raw_inputs':len(plan['cases']),'planned_main_evaluations':len(plan['cases'])*4}))
def match(rows,truth,gate):
 q=np.array([r['frequency_cycles_per_pixel'] for r in rows])*128
 t=np.array([v['bin_xy'] for v in truth],dtype=float)
 if len(t)==0:return [],list(range(len(rows))),[]
 dist=np.linalg.norm(t[:,None,:]-q[None,:,:],axis=2) if len(rows) else np.empty((len(t),0))
 costs=np.concatenate([np.where(dist<=gate,dist,1e6),np.full((len(t),len(t)),100.)],axis=1)
 aa,bb=linear_sum_assignment(costs);matches=[{'truth_index':int(i),'candidate_index':int(j),'distance_bins':float(dist[i,j]),'truth_bin_xy':t[i].tolist(),'observed_bin_xy':q[j].tolist(),'tone':truth[i]['tone'],'sign':truth[i]['sign']} for i,j in zip(aa,bb) if j<len(rows) and dist[i,j]<=gate]
 return matches,[j for j in range(len(rows)) if j not in {r['candidate_index'] for r in matches}],[i for i in range(len(t)) if i not in {r['truth_index'] for r in matches}]
def pair_check(rows,spec):
 if 'template_bin_xy' not in spec:return None
 truth=[{'tone':i,'sign':sign,'bin_xy':[sign*x for x in q]} for i,q in enumerate(spec['template_bin_xy']) for sign in [1,-1]]
 matches,extra,missing=match(rows,truth,min(.5,spec['gap_bins']/4));separations={}
 for sign in [1,-1]:
  branch=sorted([x for x in matches if x['sign']==sign],key=lambda v:v['tone'])
  if len(branch)==2:separations[str(sign)]=float(np.linalg.norm(np.array(branch[0]['observed_bin_xy'])-branch[1]['observed_bin_xy']))
 passed=len(matches)==4 and all(abs(x-spec['gap_bins'])<=.25*spec['gap_bins'] for x in separations.values())
 return {'passes_two_component_criterion':passed,'strict_gate_bins':min(.5,spec['gap_bins']/4),'strict_matches':matches,'observed_separations_bins':separations,'control_has_only_one_true_tone':len(spec['tones'])==1}
def run():
 plan=read(OUT/'frozen-plan.json');need(sha(OUT/'frozen-plan.json')==read(OUT/'plan-sha256.json')['frozen-plan.json'],'Frozen plan changed')
 need(sha(Path(__file__))==read(OUT/'plan-sha256.json')['experiment_script'],'Runner changed after pre-run freeze')
 need(subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD'],text=True).strip()==BASELINE,'Wrong baseline')
 sys.path.insert(0,str(REPO/'tools'));import image_peaks
 need(image_peaks.DETECTOR_VERSION==3,'Unexpected detector')
 (OUT/'observations').mkdir(exist_ok=False);specs={s['label']:s for s in plan['specs']};stats=collections.defaultdict(list);allrows=[];failures=[]
 for case in plan['cases']:
  p=OUT/case['path'];need(sha(p)==case['sha256'],'Changed input');a=tifffile.imread(p);spec=specs[case['label']]
  protocols=[(w,m,dict(plan['detector_parameters']),'main') for w in ['none','hann'] for m in [False,True]]
  sens=plan['sensitivity'];selected=case['sigma'] in sens['noise_levels'] and (case['seed'] is None or case['seed'] in sens['seed_subset'])
  if selected:
   for pre in sens['preprocessing']:
    if case['label'] in sens['only_labels']:
     protocols.extend((pre['window'],pre['subtract_mean'],{**plan['detector_parameters'],'min_separation_bins':v},'min_separation') for v in sens['min_separation_values'])
    if case['label'] in sens['threshold_labels']:
     protocols.extend((pre['window'],pre['subtract_mean'],{**plan['detector_parameters'],'threshold_rel':v},'threshold') for v in sens['threshold_values'])
  observations=[];cache={}
  for w,m,params,section in protocols:
   key=(w,m)
   if key not in cache:
    work=a.astype(np.float64).copy()
    if m:work-=work.mean()
    if w=='hann':
     work*=np.hanning(128)[:,None]
     work*=np.hanning(128)[None,:]
    cache[key]=np.fft.fftshift(np.fft.fft2(work)).astype(np.complex128)
   try:
    rows,normalized,quality=image_peaks.detect(cache[key],params,need);matched,extra,missing=match(rows,case['truth'],.5);pair=pair_check(rows,spec)
    families=sum(all(any(x['tone']==tone and x['sign']==sign for x in matched) for sign in [1,-1]) for tone in range(len(spec['tones'])))
    obs={'window':w,'subtract_mean':m,'section':section,'parameters':normalized,'peaks':rows,'quality':quality,'matches':matched,'missing_truth_indices':missing,'extra_candidate_indices':extra,'both_sign_tone_families_recovered':families,'pair':pair};observations.append(obs)
    result={k:case[k] for k in ['case_id','label','kind','sigma','seed']};result.update(section=section,window=w,subtract_mean=m,min_separation=params['min_separation_bins'],threshold=params['threshold_rel'],truth_signed_count=len(case['truth']),returned=len(rows),matched=len(matched),missed=len(missing),extra=len(extra),tone_families=len(spec['tones']),recovered_families=families,mean_error_bins=float(np.mean([x['distance_bins'] for x in matched])) if matched else None,max_error_bins=max([x['distance_bins'] for x in matched],default=None),error_sum_bins=sum(x['distance_bins'] for x in matched),contrast=quality['numerical_contrast']['status'],cap=quality['selection_limit_reached'],two_component_criterion=pair['passes_two_component_criterion'] if pair else None,strict_pair_match_count=len(pair['strict_matches']) if pair else None,observed_positive_separation_bins=pair['observed_separations_bins'].get('1') if pair else None)
    allrows.append(result)
   except Exception as error:failures.append({'case':case['case_id'],'section':section,'window':w,'subtract_mean':m,'parameters':params,'error':str(error)});observations.append(failures[-1])
  dump(OUT/'observations'/f'{case["case_id"]}.json',{'case':case,'observations':observations})
  if int(case['case_id'][1:])%250==0:print(json.dumps({'processed_inputs':int(case['case_id'][1:])+1,'evaluations':len(allrows),'failures':len(failures)}),flush=True)
 with (OUT/'results.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(allrows[0]));writer.writeheader();writer.writerows(allrows)
 for row in allrows:stats[tuple(row[k] for k in ['section','label','sigma','window','subtract_mean','min_separation','threshold'])].append(row)
 groups=[]
 for key,rows in stats.items():
  matched=sum(r['matched'] for r in rows);errors=[r['max_error_bins'] for r in rows if r['max_error_bins'] is not None]
  group=dict(zip(['section','label','sigma','window','subtract_mean','min_separation','threshold'],key));group.update(n=len(rows),truth_signed=sum(r['truth_signed_count'] for r in rows),matched=matched,missed=sum(r['missed'] for r in rows),extra=sum(r['extra'] for r in rows),all_families_recovered_runs=sum(r['recovered_families']==r['tone_families'] for r in rows),matched_conditional_mean_error_bins=sum(r['error_sum_bins'] for r in rows)/matched if matched else None,max_error_bins=max(errors,default=None),returned_min=min(r['returned'] for r in rows),returned_max=max(r['returned'] for r in rows),cap_runs=sum(r['cap'] for r in rows),resolved_numeric_runs=sum(r['contrast']=='resolved_amplitude_variation' for r in rows),two_component_runs=sum(r['two_component_criterion'] is True for r in rows),positive_separations=[r['observed_positive_separation_bins'] for r in rows],strict_match_counts=[r['strict_pair_match_count'] for r in rows]);groups.append(group)
 dump(OUT/'aggregate.json',groups);dump(OUT/'failures.json',failures);dump(OUT/'run-summary.json',{'completed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':BASELINE,'inputs':len(plan['cases']),'evaluations':len(allrows),'groups':len(groups),'failures':len(failures),'source_hashes_unchanged':all(sha(REPO/k)==h for k,h in plan['source_hashes'].items()),'scope':'Direct unchanged production image_peaks.detect; no model inference, no physical interpretation. Small formal MCP handoff checked separately.'});print(json.dumps(read(OUT/'run-summary.json')))
if __name__=='__main__':{'prepare':prepare,'run':run}[sys.argv[1]]()
