"""Independent carrier/support oracle adapted from the GPT-6-astra baseline probe.
Run with fresh output directory. Only synthetic image truth; actual saved worker.
"""
import hashlib,json,math,pathlib,sys
FROZEN=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(FROZEN))
import numpy as np,tifffile
from tools import image_workspace
OUT=pathlib.Path(sys.argv[1]).resolve();OUT.mkdir(exist_ok=False)
calls=[];rows=[];w=OUT/'workspace'
def save(): (OUT/'calls.json').write_text(json.dumps(calls,indent=2)+'\n')
def call(action,**kw):
 req={'workspace':str(w),'action':action,'request_id':'astra-topology-'+str(len(calls)),**kw}
 response=image_workspace.execute(req);calls.append({'request':req,'response':response});save()
 if not response.get('ok'): raise RuntimeError(response)
 return response['result']
y,x=np.indices((256,256),dtype=float);theta=np.arctan2(y-127.5,x-127.5)
loops=[{'rect':r,'orientation':'positive_image_xy'}for r in [[75,75,182,182],[60,60,197,197]]]
def source(name,terms):
 path=OUT/(name+'.tiff');image=sum(np.cos(2*np.pi*(gx*x+gy*y)-charge*theta)for gx,gy,charge in terms)
 tifffile.imwrite(path,image.astype(np.float32));o=call('open',source_path=str(path));f=call('frame',object_id=o['object_id'],frame_index=0)
 fft=call('fft',object_id=f['object_id'],rect=[0,0,256,256],window='none',subtract_mean=True,max_size=256)
 return fft,path

def gpa(fft,g):return call('gpa',object_id=fft['object_id'],g_vectors=g,mask_sigma=.014,reference_rect=[50,50,75,75],reference_mode='fixed_g',reference_text='Fixed analytic test basis; no fitted reference',source_domain='real_space_lattice',source_domain_text='Synthetic carrier image, not a material defect certificate',max_size=256)
def topo(name,ids):
 r=call('topology',object_ids=ids,loops=loops,model_assumption_text='Independent synthetic test, not real-specimen validation',max_size=256)
 report=r['report'];b=report['projected_burgers'];rows.append({'case':name,'object_id':r['object_id'],'status':report['status'],'retained_count':report['reflection_count'],'b':b,'sources':ids});return r
# Genuine third angular carrier, independent of detector outputs.
fft3,p3=source('three-separated',[(.125,0,1),(0,.125,0),(.125,.125,1)])
a3=gpa(fft3,[[.125,0],[0,.125]]);b3=gpa(fft3,[[.125,0],[.125,.125]])
pos=topo('three_separated_positive',[a3['object_id'],b3['object_id']])
# Exactly two intended carriers; extra filters are a source alias.
fft2,p2=source('two-carriers',[(.125,0,1),(0,.125,0)])
a=gpa(fft2,[[.125,0],[0,.125]]);b=gpa(fft2,[[.125,.004],[0,.125]])
alias=topo('shifted_same_band',[a['object_id'],b['object_id']])
c=gpa(fft2,[[-.125,.004],[0,.125]])
conjshift=topo('shifted_conjugate_band',[a['object_id'],c['object_id']])
d=gpa(fft2,[[-.125,0],[0,.125]])
exact=topo('exact_friedel_alias',[a['object_id'],d['object_id']])
# Harmonic records are spectrally disjoint but no additional angular direction.
ffth,ph=source('harmonic',[(.125,0,1),(0,.125,0),(.25,0,2)])
ah=gpa(ffth,[[.125,0],[0,.125]]);bh=gpa(ffth,[[.25,0],[0,.125]])
harmonic=topo('harmonic_third_band',[ah['object_id'],bh['object_id']])
def mask(g,i):return np.load(w/'objects'/g['object_id']/'mask_frequency.npy',allow_pickle=False)[i]
def conjugate(m):
 u=np.fft.ifftshift(m);return np.fft.fftshift(u[np.ix_((-np.arange(u.shape[0]))%u.shape[0],(-np.arange(u.shape[1]))%u.shape[1])])
def pair(label,m,n):
 rows=[]
 for sign,k in [(1,n),(-1,conjugate(n))]:
  intersection=int(np.count_nonzero((m>0)&(k>0)))
  rows.append({'sign':sign,'support_intersection_count':intersection,'intersection_fraction_of_smaller':intersection/min(np.count_nonzero(m),np.count_nonzero(k)),'normalized_weight_inner_product':float(np.sum(m*k)/np.sqrt(np.sum(m*m)*np.sum(k*k)))})
 return {'pair':label,'a_nonzero':int(np.count_nonzero(m)),'b_nonzero':int(np.count_nonzero(n)),'comparisons':rows}
supports=[pair('shifted',mask(a,0),mask(b,0)),pair('shifted_conjugate',mask(a,0),mask(c,0)),pair('exact_conjugate',mask(a,0),mask(d,0)),pair('separated_diag',mask(a3,0),mask(b3,1)),pair('separated_xy',mask(a3,0),mask(a3,1)),pair('harmonic',mask(ah,0),mask(bh,0))]
report={'producer':'current source (see module hashes)','scope':'Actual saved worker calls; analytic phase-carrier truth; not material validation or MCP transport','calls':len(calls),'results':rows,'supports':supports,'source_hashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in (p2,p3,ph)},'module_hashes':{n:hashlib.sha256((FROZEN/'tools'/n).read_bytes()).hexdigest()for n in ('image_topology.py','image_topology_core.py','image_topology_legacy_v1.py','image_gpa_core.py')}}
(OUT/'summary.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

for name,value in [('positive',pos),('alias',alias),('conjugate',conjshift),('friedel',exact),('harmonic',harmonic)]:
 r=value['report'];assert r['algorithm']=='saved-wrapped-phase-rectangular-topology-v3'
 assert r['band_dependency']['qualified_cross_band_support']==(name not in ('alias','conjugate'))
 for group in [r,*r['loop_groups']]:
  assert group['projected_burgers']['redundancy_validated']==(name=='positive')
  assert group['projected_burgers']['statistical_independence_established'] is False
 if name in ('alias','conjugate'):
  assert r['status']=='constrained_candidate_without_redundancy'
  assert np.allclose(r['projected_burgers']['b_pixel_xy'],[8,0],atol=1e-10)
 if name=='positive':assert r['status']=='projected_topological_evidence'
 recovered=call('result',query_request_id=value['request_id'])
 assert recovered['report']==r and recovered['input_dependency']==value['input_dependency']
 fetched=call('get',object_id=value['object_id'])
 assert fetched['report']==r
assert supports[0]['comparisons'][0]['support_intersection_count']==336
assert supports[1]['comparisons'][0]['support_intersection_count']==0
assert supports[1]['comparisons'][1]['support_intersection_count']==336
print('PASS: saved v3 positive, shifted/conjugate overlap negatives, exact aliases, harmonic negative and v3 recovery')
