"""Independent array reductions and exact export checks; no simulation replay."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import tifffile,ase.io
ROOT=Path(__file__).resolve().parent;RUN=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'run-03')
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def save(p,v):p.write_text(json.dumps(v,indent=2,allow_nan=False)+'\n',encoding='utf-8')
truth=read(RUN/'assessor/truth.json');summary=read(RUN/'simulation-summary.json')
rects=[truth['primary_rect'],*truth['reference_rects']]
def stats(a):
 m=[float(np.sum(a[y0:y1,x0:x1].astype(np.float64))/((x1-x0)*(y1-y0))) for x0,y0,x1,y1 in rects]
 return dict(primary_mean=m[0],reference_means=m[1:],primary_minus_reference_median=m[0]-float(np.median(m[1:])))
pristine=ase.io.read(RUN/'assessor/pristine.extxyz');vacancy=ase.io.read(RUN/'assessor/single-s-vacancy.extxyz');index=truth['deleted_atom']['index']
assert len(pristine)==90 and len(vacancy)==89 and pristine[index].symbol=='S'
assert np.allclose(np.delete(pristine.positions,index,axis=0),vacancy.positions,rtol=0,atol=1e-7)
assert np.array_equal(np.delete(pristine.numbers,index),vacancy.numbers)
xy=np.array(truth['target']['xy']);before=np.where(np.linalg.norm(pristine.positions[:,:2]-xy,axis=1)<1e-7)[0];after=np.where(np.linalg.norm(vacancy.positions[:,:2]-xy,axis=1)<1e-7)[0]
assert [pristine[i].symbol for i in before]==['S','S'] and len(after)==1 and vacancy[int(after[0])].symbol=='S'
report=dict(run=RUN.name,candidate='03ea9534c34e606295b851637d6e9e03b35bcab5',scope='Known-site structural and numerical audit, not blind detection',atom_counts=[90,89],projected_target_counts=[2,1],deleted_z_is_geometric_max=True,arrays=[],noise=[],convergence=[])
clean=read(RUN/'assessor/clean-controls.json');originals={}
for state in ('pristine','vacancy'):
 label=state+'-clean';raw=np.load(RUN/'raw'/(label+'-abtem-xy.npy'));yx=np.load(RUN/'raw'/(label+'-yx.npy'));tiff=tifffile.imread(RUN/'raw'/(label+'.tiff'))
 assert raw.shape==(40,48) and yx.shape==(48,40) and raw.dtype==yx.dtype==tiff.dtype==np.dtype('float32')
 assert np.array_equal(raw.T,yx) and np.array_equal(yx,tiff)
 assert stats(yx)==clean[state]
 originals[state]=yx;report['arrays'].append(dict(label=label,dtype=str(yx.dtype),full_xy_to_yx_bit_exact=True,full_tiff_exact=True,statistics=stats(yx),sha256=hashlib.sha256((RUN/'raw'/(label+'.tiff')).read_bytes()).hexdigest()))
noise=read(RUN/'assessor/noise-controls.json');seeds=[]
for row in noise:
 label=row['label'];a=np.load(RUN/'raw'/(label+'-yx.npy'));b=tifffile.imread(RUN/'raw'/(label+'.tiff'))
 assert a.dtype==np.dtype('float32') and np.array_equal(a,b) and np.all(a>=0) and np.equal(a,np.floor(a)).all()
 actual=stats(a);assert all(actual[k]==row[k] for k in actual)
 electrons=row['dose_per_area']*.0625;assert electrons==row['incident_electrons_per_pixel']
 expected=originals[row['state']].astype(np.float64)*electrons
 z=(float(np.sum(a,dtype=np.float64))-float(np.sum(expected)))/float(np.sqrt(np.sum(expected)))
 seeds.append(row['seed']);report['noise'].append(dict(label=label,seed=row['seed'],dose=row['dose_per_area'],incident_electrons_per_pixel=electrons,maximum_count=float(a.max()),count_total_z_diagnostic=z,normalized_difference=row['normalized_difference'],array_and_tiff_exact=True))
assert len(set(seeds))==len(seeds)==16
for c in summary['convergence']:
 diffs=[]
 for state in ('pristine','vacancy'):
  a=np.load(RUN/'raw'/(c['label']+'-'+state+'-abtem-xy.npy')).reshape(-1)
  m=[float(np.sum(a[k*25:(k+1)*25],dtype=np.float64)/25) for k in range(len(rects))]
  diffs.append(m[0]-float(np.median(m[1:])))
 effect=diffs[1]-diffs[0];base=clean['paired_local_effect'];rel=abs(effect-base)/max(abs(base),1e-12)
 assert diffs==c['local_contrasts'] and effect==c['paired_effect'] and rel==c['relative_change']
 assert c['gate_pass']==bool(abs(base)>1e-12 and effect*base>0 and rel<=.1)
 report['convergence'].append(c)
report.update(physical_numerical_gate_pass=summary['convergence_pass'],noise_seed_count=len(set(seeds)),clean_target_mean_ratio=clean['site_primary_mean_ratio'],elapsed_simulation_seconds=summary['elapsed_seconds'],limitations=['Coordinate checks on EXTXYZ allow1e-7angstrom for text formatting; image arrays are bit exact','Distinct seeds/documented streams do not prove statistical independence from a finite sample','Local paired-effect numerical gate is not single-image defect probability or real-specimen validation'])
save(RUN/'assessor/physical-audit.json',report)
print(json.dumps(dict(run=RUN.name,gate=report['physical_numerical_gate_pass'],structure_S2_to_S=True,exact_clean_arrays=2,noise_draws=16,convergence=[(c['label'],c['relative_change'],c['gate_pass']) for c in report['convergence']])))
