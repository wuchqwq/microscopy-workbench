"""Frozen fixed-site scalar proxies; NOT multislice, STEM or blind detection."""
from pathlib import Path
import hashlib,json,sys,time
import numpy as np
import tifffile

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent/'point-observation-fix'
sys.path.insert(0,str(REPO));sys.path.insert(0,str(REPO/'tests'))
from tools import image_workspace as worker
from preview_test_support import acknowledge_received_previews

def save(path,value):path.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def mean(a,r):x0,y0,x1,y1=r;return float(np.sum(a[y0:y1,x0:x1].astype(np.float64))/((x1-x0)*(y1-y0)))
RECT=[60,60,68,68]
REFS=[[x-4,y-4,x+4,y+4] for y in (48,64,80) for x in (48,64,80) if (x,y)!=(64,64)]
Y,X=np.indices((128,128));BASE=np.full((128,128),.1,np.float64)
for y in range(8,128,16):
 for x in range(8,128,16):BASE+=np.exp(-((X-x)**2+(Y-y)**2)/(2*1.2**2))
for y in range(16,128,16):
 for x in range(16,128,16):BASE+=.6*np.exp(-((X-x)**2+(Y-y)**2)/(2*1.2**2))
TARGET=np.exp(-((X-64)**2+(Y-64)**2)/(2*1.2**2))
cases=[]
for condition in ('pristine','partial_column','missing_column'):
 for sigma,seed in [(0,None),*[(s,k) for s in (.08,.2) for k in range(100,104)]]:
  cases.append(dict(id='c%02d'%len(cases),condition=condition,sigma=sigma,seed=seed,invert=False,wrong_refs=False))
for condition in ('gradient_pristine','wrong_column_reference','identical_pixel_contrast_artifact','inverted_missing'):
 for sigma,seed in ((0,None),(.08,100),(.2,100)):
  cases.append(dict(id='c%02d'%len(cases),condition=condition,sigma=sigma,seed=seed,invert=condition=='inverted_missing',wrong_refs=condition=='wrong_column_reference'))
PLAN=dict(version='fixed-site-proxy-v1',baseline='a83bf8aae5fcffc30adfb81059232b180e3000df',
          type='two-sublattice Gaussian intensity proxy, no physical scattering simulation',dtype='float32',shape=[128,128],
          primary_rect=RECT,reference_rects=REFS,noise='additive iid Gaussian on stored intensity, fixed PCG64 seeds; not Poisson STEM dose',
          interpretation='No classifier threshold. Measure signed means; geometry and reference identity supplied by assessor. Pristine pairs only evaluate truth.',
          cases=cases)
if (ROOT/'controls-plan.json').exists():raise RuntimeError('Refuse overwrite; inspect original outcomes')
save(ROOT/'controls-plan.json',PLAN)
(ROOT/'inputs').mkdir();(ROOT/'assessor').mkdir()
workspace=ROOT/'controlled-provider';serial=0;results=[];start=time.monotonic()
def call(action,**kwargs):
 global serial
 serial+=1;req=dict(workspace=str(workspace),action=action,**kwargs)
 if action not in ('get','result'):req['request_id']='control-%04d'%serial
 response=worker.execute(req)
 with (ROOT/'controlled-worker-calls.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(dict(request=req,response=response),allow_nan=False)+'\n')
 if not response['ok']:raise RuntimeError(response)
 acknowledge_received_previews(worker,workspace,response['result'])
 return response['result']
for c in cases:
 kind=c['condition'];a=BASE.copy();refs=REFS
 if kind=='partial_column':a-=.3*TARGET
 if kind in ('missing_column','inverted_missing','identical_pixel_contrast_artifact'):a-=.6*TARGET
 if kind=='gradient_pristine':a+=.003*X
 if c['wrong_refs']:refs=[[x-4,y-4,x+4,y+4] for x,y in ((56,56),(72,56),(56,72),(72,72))]
 if c['invert']:a=1.5-a
 if c['seed'] is not None:a+=np.random.Generator(np.random.PCG64(c['seed'])).normal(0,c['sigma'],a.shape)
 a=a.astype(np.float32);path=ROOT/'inputs'/(c['id']+'.tiff');tifffile.imwrite(path,a,photometric='minisblack')
 np.save(ROOT/'inputs'/(c['id']+'.npy'),a,allow_pickle=False)
 opened=call('open',source_path=str(path));frame=call('frame',object_id=opened['object_id'],frame_index=0)
 st=call('statistics',object_id=frame['object_id'],rect=RECT,reference_comparison=dict(reference_rects=refs,source_text='Assessor fixed expected projected B-site and nominal same-type neighbors; equivalence not inferred by tool'))
 expected=mean(a,RECT)-float(np.median([mean(a,r) for r in refs]))
 actual=st['reference_comparison']['primary_mean_minus_reference_median']
 assert actual==expected,(c['id'],actual,expected)
 row=dict(**c,frame_id=frame['object_id'],statistics_id=st['object_id'],primary_mean=st['statistics']['mean'],
          reference_means=[v['mean'] for v in st['reference_comparison']['reference_statistics']],difference=actual,
          independent_sum_reference_error=actual-expected,source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),reference_rects=refs)
 results.append(row);save(ROOT/'assessor'/'control-results.json',results)
 print(c['id'],kind,c['sigma'],actual,flush=True)
groups={}
for condition in sorted(set(c['condition'] for c in cases)):
 for sigma in sorted(set(c['sigma'] for c in cases)):
  rows=[r for r in results if r['condition']==condition and r['sigma']==sigma]
  if rows:groups[condition+' sigma='+str(sigma)]=dict(n=len(rows),min=min(r['difference'] for r in rows),max=max(r['difference'] for r in rows),mean=float(np.mean([r['difference'] for r in rows])))
save(ROOT/'assessor'/'controls-summary.json',dict(case_count=len(cases),calls=serial,elapsed_seconds=time.monotonic()-start,
     exact_independent_numerical_matches=len(results),groups=groups,
     warnings=['Not physical STEM or blind identification; site/type supplied',
               'Wrong-type references create deficits in a pristine array',
               'Intensity-subtraction artifact and missing-column proxy are pixel-identical; no image-only method distinguishes their assigned causes',
               'No universal sign/threshold: inverted contrast reverses deficit sign',
               'Four seeds per noisy principal group; no real-sample error rate']))
