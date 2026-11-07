"""Frozen CPU multislice experiment. Assessor coordinates are NEVER blind input."""
from pathlib import Path
import collections,datetime,hashlib,json,os,time,traceback
import numpy as np
import ase,ase.build,ase.io
import abtem,dask,tifffile
from abtem.core.energy import energy2wavelength

ROOT=Path(__file__).resolve().parent
PLAN=json.loads((ROOT/'protocol.json').read_text(encoding='utf-8'))
def save(path,value):path.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def array(path,value):np.save(path,value,allow_pickle=False)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def log(stage,**details):
 row=dict(utc=now(),since_start_seconds=time.monotonic()-START,stage=stage,**details)
 with (ROOT/'simulation-events.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(row,allow_nan=False)+'\n')
 print(json.dumps(row,allow_nan=False),flush=True)
START=time.monotonic()
if (ROOT/'assessor').exists():raise RuntimeError('Refuse overwrite or replay. Inspect original outcome first.')
for folder in ('assessor','raw','potentials','controls'):(ROOT/folder).mkdir()
save(ROOT/'execution-start.json',dict(utc=now(),pid=os.getpid(),protocol_sha256=hashlib.sha256((ROOT/'protocol.json').read_bytes()).hexdigest(),script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),abtem=abtem.__version__,numpy=np.__version__,ase=ase.__version__))
abtem.config.set({'device':'cpu','fft':'fftw','diagnostics.task_progress':False,'diagnostics.progress_bar':False})
unit=abtem.orthogonalize_cell(ase.build.mx2('MoS2',kind='2H',a=3.18,thickness=3.172,vacuum=2))
atoms=unit*(5,3,1)
cell=atoms.cell.lengths();start=np.array(cell[:2])/2-np.array([5.,6.]);end=start+[10.,12.]
scan=abtem.GridScan(start=start,end=end,gpts=(40,48),endpoint=False)
positions=np.asarray(scan.get_positions())
assert positions.shape==(40,48,2)
assert np.allclose(positions[1,0]-positions[0,0],[.25,0],atol=1e-6)
assert np.allclose(positions[0,1]-positions[0,0],[0,.25],atol=1e-6)
array(ROOT/'assessor/scan-positions-xy.npy',positions)
groups={}
for i,atom in enumerate(atoms):groups.setdefault(tuple(np.round(atom.position[:2],8)),[]).append(i)
columns=[dict(xy=list(xy),atom_indices=inds,symbols=[atoms[i].symbol for i in inds],z=[float(atoms[i].z) for i in inds]) for xy,inds in groups.items()]
scols=[c for c in columns if c['symbols']==['S','S'] and np.all(np.array(c['xy'])>=start+1.25) and np.all(np.array(c['xy'])<end-1.25)]
assert len(scols)>=5,len(scols)
target=scols[int(np.random.Generator(np.random.PCG64(48015)).integers(len(scols)))]
deleted=max(target['atom_indices'],key=lambda i:atoms[i].z)
vacancy=atoms.copy();del vacancy[deleted]
reference=sorted([c for c in scols if c is not target],key=lambda c:(float(np.linalg.norm(np.array(c['xy'])-target['xy'])),*c['xy']))[:8]
def pixel(xy):return ((np.array(xy)-positions[0,0])/.25).tolist()
def rect(xy):
 x,y=np.floor(np.array(pixel(xy))+.5).astype(int)
 result=[int(x-2),int(y-2),int(x+3),int(y+3)]
 assert 0<=result[0]<result[2]<=40 and 0<=result[1]<result[3]<=48
 return result
rects=[rect(c['xy']) for c in [target,*reference]]
assert len({tuple(r) for r in rects})==len(rects)
for c in columns:c['source_pixel_xy']=pixel(c['xy'])
truth=dict(cell_angstrom=atoms.cell.array.tolist(),unit_cell_angstrom=unit.cell.array.tolist(),scan_start_xy=positions[0,0].tolist(),scan_end_exclusive_xy=end.tolist(),scan_sampling_xy=[.25,.25],source_shape_yx=[48,40],columns=columns,target=target,target_pixel_xy=pixel(target['xy']),deleted_atom=dict(index=deleted,symbol=atoms[deleted].symbol,position=atoms[deleted].position.tolist()),remaining_projected_target_atoms=1,element_counts_pristine=dict(collections.Counter(atoms.get_chemical_symbols())),element_counts_vacancy=dict(collections.Counter(vacancy.get_chemical_symbols())),primary_rect=rects[0],reference_rects=rects[1:],reference_sites=reference,axis_transform='abTEM array[x,y] -> np.ascontiguousarray(array.T)[y,x], dtype preserved',physical_scope='Static unrelaxed independent-atom single S-Mo-S layer, not inverse depth recovery')
save(ROOT/'assessor/truth.json',truth);ase.io.write(ROOT/'assessor/pristine.extxyz',atoms);ase.io.write(ROOT/'assessor/single-s-vacancy.extxyz',vacancy)
log('geometry_frozen',atoms=len(atoms),vacancy_atoms=len(vacancy),projected_s2_candidates=len(scols),references=len(reference))
detector=abtem.AnnularDetector(inner=90,outer=200)
def potential(model,label,gpts=(400,432),slice_thickness=.5):
 t=time.monotonic();p=abtem.Potential(model,gpts=gpts,slice_thickness=slice_thickness,parametrization='lobato',projection='finite',device='cpu')
 built=p.build(lazy=False)
 value=np.asarray(built.array)
 assert np.isfinite(value).all()
 array(ROOT/'potentials'/(label+'.npy'),value)
 record=dict(label=label,seconds=time.monotonic()-t,shape=list(value.shape),dtype=str(value.dtype),gpts=list(p.gpts),sampling=list(p.sampling),extent=list(p.extent),slice_thickness=np.asarray(built.slice_thickness).tolist())
 save(ROOT/'potentials'/(label+'.json'),record);log('potential_built',**record)
 return p,built
def image(p,built,chosen_scan,label):
 t=time.monotonic();probe=abtem.Probe(energy=80000,semiangle_cutoff=20,defocus=0,Cs=0,device='cpu');probe.grid.match(p)
 cutoff=float(energy2wavelength(80000)/(3*max(probe.sampling))*1000)
 assert cutoff>200,cutoff
 with dask.config.set(scheduler='synchronous'):
  measurement=probe.scan(built,scan=chosen_scan,detectors=detector,max_batch=32,lazy=True).compute()
 v=np.asarray(measurement.array)
 assert np.isfinite(v).all() and np.min(v)>=0 and np.max(v)<=1.00001
 array(ROOT/'raw'/(label+'-abtem-xy.npy'),v)
 record=dict(label=label,seconds=time.monotonic()-t,shape=list(v.shape),dtype=str(v.dtype),sampling=list(getattr(measurement,'sampling',[])),probe_gpts=list(probe.gpts),probe_sampling=list(probe.sampling),anti_alias_estimate_mrad=cutoff,minimum=float(v.min()),maximum=float(v.max()),mean=float(v.mean()),axes=[dict(label=getattr(a,'label',None),units=getattr(a,'units',None),offset=getattr(a,'offset',None),sampling=getattr(a,'sampling',None)) for a in measurement.axes_metadata])
 save(ROOT/'raw'/(label+'.json'),record);log('scan_complete',**record)
 return measurement
def export(measurement,label):
 original=np.asarray(measurement.array);yx=np.ascontiguousarray(original.T)
 assert yx.dtype==original.dtype and yx[7,3]==original[3,7] and yx[11,17]==original[17,11]
 array(ROOT/'raw'/(label+'-yx.npy'),yx)
 tifffile.imwrite(ROOT/'raw'/(label+'.tiff'),yx,photometric='minisblack',metadata={'axes':'YX'})
 assert np.array_equal(tifffile.imread(ROOT/'raw'/(label+'.tiff')),yx)
 return yx
def means(v):
 result=[]
 for x0,y0,x1,y1 in rects:result.append(float(np.mean(v[y0:y1,x0:x1],dtype=np.float64)))
 return dict(primary_mean=result[0],reference_means=result[1:],primary_minus_reference_median=result[0]-float(np.median(result[1:])))
try:
 # A small pristine scan and a vacuum detector negative control establish API,
 # angular budget and nonnegative fractional output before the main images.
 p,pa=potential(atoms,'pristine')
 baseline_scan=abtem.GridScan(start=start,end=start+[1.,1.5],gpts=(4,6),endpoint=False)
 baseline=image(p,pa,baseline_scan,'baseline-pristine-4x6')
 vacuum=atoms.copy();del vacuum[:]
 pv,pva=potential(vacuum,'vacuum')
 vac=image(pv,pva,abtem.CustomScan(positions=[positions[0,0],positions[3,7],positions[17,11]]),'baseline-vacuum')
 assert float(np.max(vac.array))<1e-8,'Unexpected high-angle vacuum signal'
 save(ROOT/'controls/baseline.json',dict(status='PASS',vacuum_max=float(np.max(vac.array)),scope='API/finite fractional signal/angular budget/vacuum negative; not full physical convergence'))
 full=image(p,pa,scan,'pristine-clean');full_yx=export(full,'pristine-clean')
 pd,pda=potential(vacancy,'vacancy');defect=image(pd,pda,scan,'vacancy-clean');defect_yx=export(defect,'vacancy-clean')
 result=dict(pristine=means(full_yx),vacancy=means(defect_yx))
 result['paired_local_effect']=result['vacancy']['primary_minus_reference_median']-result['pristine']['primary_minus_reference_median']
 result['remaining_column_positive_intensity']=result['vacancy']['primary_mean']>0
 result['site_primary_mean_ratio']=result['vacancy']['primary_mean']/result['pristine']['primary_mean']
 save(ROOT/'assessor/clean-controls.json',result)
 log('clean_pair_complete',paired_local_effect=result['paired_local_effect'],remaining_column_ratio=result['site_primary_mean_ratio'])
 noisy=[]
 for state,measurement in [('pristine',full),('vacancy',defect)]:
  for dose in (10000,100000):
   for seed in PLAN['poisson']['seeds'][state+'_D'+str(dose)]:
    with dask.config.set(scheduler='synchronous'):n=measurement.poisson_noise(dose_per_area=dose,seed=seed).compute()
    label=state+'-D'+str(dose)+'-seed'+str(seed);values=export(n,label)
    assert np.equal(values,np.floor(values)).all()
    m=means(values);row=dict(label=label,state=state,dose_per_area=dose,seed=seed,dtype=str(values.dtype),incident_electrons_per_pixel=dose*.25*.25,maximum_count=float(values.max()),**m)
    row['normalized_difference']=m['primary_minus_reference_median']/row['incident_electrons_per_pixel'];noisy.append(row)
 save(ROOT/'assessor/noise-controls.json',noisy);log('poisson_complete',draws=len(noisy),dtype=str(values.dtype))
 # Same physical ROI sample centres: no brightness-based reference reselection.
 sample_points=[];slices=[]
 for x0,y0,x1,y1 in rects:
  slices.append([len(sample_points),len(sample_points)+25])
  sample_points.extend([positions[x,y].tolist() for y in range(y0,y1) for x in range(x0,x1)])
 sample_points=np.asarray(sample_points)
 def vector_means(v):
  flat=np.asarray(v).reshape(-1);m=[float(np.mean(flat[a:b],dtype=np.float64)) for a,b in slices]
  return m[0]-float(np.median(m[1:]))
 controls=[]
 for label,grid,thickness,bigger in [('grid-480x512',(480,512),.5,False),('slice-025',(400,432),.25,False),('buffer-7x5',(560,720),.5,True)]:
  effect=[]
  for state,model in [('pristine',atoms),('vacancy',vacancy)]:
   shift=np.zeros(2)
   if bigger:
    model=unit*(7,5,1);shift=unit.cell.lengths()[:2]
    if state=='vacancy':
     wanted=np.array(truth['deleted_atom']['position'])+np.r_[shift,0]
     matches=np.where((model.numbers==16)&(np.linalg.norm(model.positions-wanted,axis=1)<1e-6))[0];assert len(matches)==1;del model[int(matches[0])]
   pc,pca=potential(model,label+'-'+state,grid,thickness)
   observed=image(pc,pca,abtem.CustomScan(positions=sample_points+shift),label+'-'+state)
   effect.append(vector_means(observed.array))
  paired=effect[1]-effect[0];base=result['paired_local_effect'];relative=abs(paired-base)/max(abs(base),1e-12)
  controls.append(dict(label=label,local_contrasts=effect,paired_effect=paired,relative_change=relative,sign_stable=bool(paired*base>0),gate_pass=bool(abs(base)>1e-12 and paired*base>0 and relative<=.1)))
  save(ROOT/'controls/convergence.json',controls);log('convergence_complete',**controls[-1])
 save(ROOT/'simulation-summary.json',dict(status='COMPLETE',elapsed_seconds=time.monotonic()-START,clean=result,noise_draws=len(noisy),convergence=controls,convergence_pass=all(c['gate_pass'] for c in controls),source_dtype=str(full_yx.dtype),source_shape_yx=list(full_yx.shape),no_training=True,no_inverse_depth=True))
 log('complete',elapsed_seconds=time.monotonic()-START)
except Exception as e:
 save(ROOT/'simulation-failure.json',dict(utc=now(),elapsed_seconds=time.monotonic()-START,error=type(e).__name__+': '+str(e),traceback=traceback.format_exc(),last_stage='Inspect simulation-events.jsonl; original outputs retained; no replay'))
 raise
