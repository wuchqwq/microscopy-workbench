# Fixture adapted from audit PR #55 (6c24dd7385cef2ca79b59460767e7fe8278c7732).
# Original source SHA256: 7daf4cded2afb7a67a6bfa9916ed7a2ec404c1a2a720fa8a985a9ff02a222609
# Only root/output selection and the renamed conditional-geometry assertions differ.
# Both legacy and current workers run identical generated data and constraints.
"""Independent round-two public saved-worker audit. No production function creates truth.
Run from repository root: .venv/bin/python audits/scientific_algorithms_round2/crystal/probe_saved_crystal.py
Every worker input/stdout/stderr is retained before interpretation; fresh output directory only.
"""
import hashlib, importlib.metadata, json, math, os, pathlib, subprocess, sys, time
import numpy as np
import tifffile
ROOT = pathlib.Path(os.environ.get('MICROSCOPY_TEST_REPOSITORY', pathlib.Path(__file__).resolve().parents[2]))
OUT = pathlib.Path(os.environ.get('MICROSCOPY_TEST_OUTPUT', ROOT / 'analysis' / ('science-fix-saved-' + str(time.time_ns()))))
OUT.mkdir(parents=True, exist_ok=False)
IMAGES, STRUCTURES = OUT / 'images', OUT / 'structures'
CALLS = OUT / 'calls'; CALLS.mkdir()
REPORT = {'root': str(OUT), 'versions': {p: importlib.metadata.version(p) for p in ['numpy','scipy','ase','diffsims','tifffile']}, 'cases':{}, 'calls':[]}
serial = 0

def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')

def call(provider, action, *, expect_ok=True, request_id=None, **params):
    global serial
    serial += 1
    req = dict(workspace=str(IMAGES if provider == 'image' else STRUCTURES), action=action, request_id=request_id or f'r2-crystal-{serial:03d}', **params)
    stem = CALLS / f'{serial:03d}-{provider}-{action}'
    dump(stem.with_suffix('.input.json'),req)
    script = 'tools/image_workspace.py' if provider == 'image' else 'tools/structure_worker.py'
    p = subprocess.run([sys.executable,'-B',str(ROOT/script)],input=json.dumps(req),text=True,capture_output=True,cwd=ROOT,timeout=180)
    stem.with_suffix('.stdout.json').write_text(p.stdout)
    stem.with_suffix('.stderr.txt').write_text(p.stderr)
    result=json.loads(p.stdout)
    REPORT['calls'].append({'index':serial,'provider':provider,'action':action,'request_id':req['request_id'],'ok':result.get('ok'),'response_sha256':hashlib.sha256(p.stdout.encode()).hexdigest()})
    dump(OUT/'report.partial.json',REPORT)
    print(serial, provider, action, result.get('ok'),flush=True)
    if expect_ok: assert result.get('ok'), result
    return result['result'] if result.get('ok') else result

def cif(name, cell, positions, symbol='Cu'):
    f=OUT/(name+'.cif')
    s=[f'data_{name}',*[f'_cell_length_{ax} {val}' for ax,val in zip('abc',cell)],'_cell_angle_alpha 90','_cell_angle_beta 90','_cell_angle_gamma 90',"_space_group_name_H-M_alt 'P 1'",'_space_group_IT_number 1','loop_','_atom_site_label','_atom_site_type_symbol','_atom_site_fract_x','_atom_site_fract_y','_atom_site_fract_z','_atom_site_occupancy']
    s += [f'{symbol}{i} {symbol} {p[0]} {p[1]} {p[2]} 1' for i,p in enumerate(positions)]
    f.write_text('\n'.join(s)+'\n'); return f

def simulate(struct,orient,radius=.8,excitation=.015):
    return call('structure','simulate',object_id=struct['object_id'],orientation_id=orient['object_id'],voltage_kv=200,reciprocal_radius_inv_angstrom=radius,max_excitation_error_inv_angstrom=excitation,size=64,sigma_pixels=1,with_direct_beam=False,native_float32=False)

def save_image(name, qs, scales, n=128):
    y,x=np.indices((n,n));parts=[]
    for vectors in qs:
        a=np.full((n,n),1000.,dtype=float)
        for j,q in enumerate(vectors):
            bins=np.asarray(q)*np.asarray(scales)*n
            assert np.max(np.abs(bins-np.rint(bins)))<1e-10
            a+=(100.-10*j)*np.cos(2*np.pi*(bins[0]*x+bins[1]*y)/n + .13*j)
        parts.append(a)
    f=OUT/(name+'.tiff');tifffile.imwrite(f,np.concatenate(parts).astype('float32'),photometric='minisblack',metadata=None)
    opened=call('image','open',source_path=str(f));frame=call('image','frame',object_id=opened['object_id'],frame_index=0)
    calibrated=call('image','calibrate',object_id=frame['object_id'],scope='image',xy_scale={'x':scales[0],'y':scales[1],'unit':'angstrom'},source_text='Independent round-two analytic sampling, not experimental calibration')
    return calibrated

def field_domains(cal):
    field=call('image','spatial_field',object_id=cal['object_id'],window_sizes=[128],stride_xy=[128,128],max_windows=2,coordinate_domain='physical',window='none',subtract_mean=True,max_peaks=12,max_size=256,peak_options={'min_separation_bins':1,'exclude_dc_radius_bins':1,'threshold_rel':.2,'refinement':'none'})
    domains=[dict(field_object_id=field['object_id'],rect_xyxy=s['rect_xyxy'],current_image_object_id=s.get('view_object_id') or s['fft_object_id'],measurement_object_ids=s['measurement_object_ids']) for s in field['samples']]
    return field,domains

def metadata(ident): return json.loads((IMAGES/'objects'/ident/'object.json').read_text())
def paths(ids): return [str(IMAGES/'objects'/i/'object.json') for i in ids]
def corr(index,hkl): return dict(measurement_index=index,hkl=hkl)
def findq(ids,q):
    found=[i for i,ident in enumerate(ids) if np.linalg.norm(np.asarray(metadata(ident)['physical_vector_xy'])-q)<1e-10]
    assert len(found)==1,(found,q);return found[0]
def compact_reg(value):
    return {k:value[k] for k in ['object_id','request_id','registration','fit_status','validation_status','held_out_validation_passed','held_out_independence','fit_evidence','validation_evidence']}

try:
    # FCC5A; explicit right-handed [1,-1,0] source-to-lab basis, derived by dot products.
    a=5.;n=128;s2,s3,s6=math.sqrt(2),math.sqrt(3),math.sqrt(6)
    M=np.array([[1,1,-2],[1,1,1],[1,-1,0]],float)/np.array([[s6],[s3],[s2]])
    T=np.array([[2,-1,2],[2,2,-1],[-1,2,2]],float)/3
    angle=23.;theta=math.radians(angle);R=np.array([[math.cos(theta),-math.sin(theta),0],[math.sin(theta),math.cos(theta),0],[0,0,1.]])
    hp=np.array([[1,1,1],[1,1,-1],[2,2,0],[1,1,3]])
    ht=np.array([[1,1,1],[-1,1,1],[0,2,2],[3,1,1]])
    qp=(M@hp.T).T[:,:2]/a;qt=(M@T@ht.T).T[:,:2]/a
    scales=[a*s6/n,-a*s3/n]
    dump(OUT/'analytic_truth.json',{'q_parent':qp.tolist(),'q_twin':qt.tolist(),'hkl_parent':hp.tolist(),'hkl_twin':ht.tolist(),'M':M.tolist(),'T':T.tolist(),'R23':R.tolist(),'source_xy_scale_angstrom':scales,'bin_resolution_inv_angstrom':[1/(n*abs(s)) for s in scales],'convention':'column q_lab=U hkl/a; cycles/angstrom, no 2pi; analytic cosines only'})
    src=cif('fcc_a5',[a,a,a],[[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]])
    struct=call('structure','open',source_path=str(src))
    parent=call('structure','orient',object_id=struct['object_id'],zone_axis_uvw=[1,-1,0],in_plane_direction_uvw=[1,1,-2],in_plane_rotation_deg=angle)
    twin=call('structure','twin_orient',object_id=struct['object_id'],orientation_id=parent['object_id'],plane_hkl=[1,1,1],candidate_basis='Analytic FCC5 model; prescribed positive60 about111, independent source-to-lab basis')
    assert np.max(np.abs(np.asarray(parent['orientation']['rotation_matrix_cartesian'])-R@M))<2e-12
    assert np.max(np.abs(np.asarray(twin['orientation']['rotation_matrix_cartesian'])-R@M@T))<2e-12
    ps,ts=simulate(struct,parent),simulate(struct,twin)
    for sim,hkls,oracle in [(ps,hp,(R@M@hp.T).T/a),(ts,ht,(R@M@T@ht.T).T/a)]:
        for h,q in zip(hkls,oracle):
            j=sim['reflections']['hkl'].index(h.tolist())
            assert np.max(np.abs(np.asarray(sim['reflections']['coordinates_inv_angstrom'][j])-q))<2e-12
    cal=save_image('independent_fcc_twinned',[qp,qt],scales)
    field,domains=field_domains(cal)
    ids=domains[0]['measurement_object_ids'];assert len(ids)==8
    for domain,qset in zip(domains,[qp,qt]):
        assert len(domain['measurement_object_ids'])==8
        for q in qset:
            findq(domain['measurement_object_ids'],q);findq(domain['measurement_object_ids'],-q)
    fits=[corr(findq(ids,qp[i]),hp[i].tolist()) for i in [0,1]]
    holds=[corr(findq(ids,qp[i]),hp[i].tolist()) for i in [2,3]]
    register=dict(object_id=ps['object_id'],measurement_paths=paths(ids),experimental_kind='real_space_fft',current_image_object_id=domains[0]['current_image_object_id'],fit_correspondences=fits,validation_correspondences=holds,screen_axes={'flip_y':False,'basis':'Signed analytic real-space metric; same orthogonal screen map for both domains'},confirmation={'source':'synthetic_fixture','source_text':'HKL correspondences independently fixed before worker invocation; analytic matrix R23 and cubic reciprocal vectors'},max_residual_inv_angstrom=.003)
    reg=call('structure','register',**register)
    assert abs(reg['registration']['rotation_deg']-angle)<1e-10 and reg.get('held_out_geometry_passed', reg['held_out_validation_passed']) is True
    compared=call('structure','compare',object_id=ps['object_id'],measurement_paths=paths(ids),experimental_kind='real_space_fft',current_image_object_id=domains[0]['current_image_object_id'],registration_object_id=reg['object_id'],max_residual_inv_angstrom=.003)
    assert compared['all_experimental_reflections_matched_within_tolerance']
    REPORT['cases']['registration_positive']={'proposal':compact_reg(reg),'compare_id':compared['object_id'],'comparison_is_not_new_independent_validation':compared['comparison_is_not_new_independent_validation'],'unmatched_simulated_count':len(compared['unmatched_simulated'])}
    # General/twin expose explicit transform only; carry fit provenance in basis, do not claim binding.
    transform={**reg['registration'],'basis':'Rotation23 from saved parent fit '+reg['object_id']+'; carried explicitly; both domain candidates share this same transform'}
    pair=lambda label,p,t:dict(label=label,simulation_a_object_id=p['object_id'],simulation_b_object_id=t['object_id'],basis='Predetermined analytic FCC candidate, not an identified material')
    gc=dict(image_workspace=str(IMAGES),domains=domains,current_spatial_image_object_id=cal['object_id'],registration=transform,experimental_kind='real_space_fft',max_residual_inv_angstrom=.003,candidates=[pair('FCC parent and Sigma3',ps,ts),pair('wrong untwinned FCC',ps,ps)])
    general=call('structure','general_compare',**gc)
    assert [p['status'] for p in general['candidate_pairs']]==['compatible','incompatible']
    REPORT['cases']['general_positive_wrong_alternative']={'object_id':general['object_id'],'status':general['status'],'candidate_pairs':general['candidate_pairs']}
    line=call('image','measure',object_id=cal['object_id'],coordinate_space='source_pixels',points=[[0,128],[127,128]])
    tc=dict(object_id=twin['object_id'],parent_simulation_object_id=ps['object_id'],twin_simulation_object_id=ts['object_id'],image_workspace=str(IMAGES),domains=domains,current_spatial_image_object_id=cal['object_id'],registration=transform,max_residual_inv_angstrom=.003,angular_tolerance_deg=1,interface_measurement_object_id=line['object_id'],interface_projection_basis='Analytic horizontal seam; orthographic beam+Z edge-on111 candidate')
    twin_result=call('structure','twin_compare',**tc)
    assert twin_result['status']=='compatible'
    wrongline=call('image','measure',object_id=cal['object_id'],coordinate_space='source_pixels',points=[[64,0],[64,255]])
    wrong=call('structure','twin_compare',**{**tc,'interface_measurement_object_id':wrongline['object_id']})
    assert wrong['status']=='incompatible' and wrong['projected_relation']['status']=='compatible'
    REPORT['cases']['twin_positive_wrong_trace']={label:{k:r[k] for k in ['object_id','status','projected_relation','interface']} for label,r in [('positive',twin_result),('wrong',wrong)]}
    # Independent negative transfer to another candidate cannot consume a saved fit as if candidate-free.
    mismatch=call('structure','compare',expect_ok=False,object_id=ts['object_id'],measurement_paths=paths(ids),experimental_kind='real_space_fft',current_image_object_id=domains[0]['current_image_object_id'],registration_object_id=reg['object_id'],max_residual_inv_angstrom=.003)
    assert not mismatch['ok'];REPORT['cases']['cross_candidate_registration_rejected']=mismatch
    # Fit never repairs scale; held-out wrong correspondence cannot influence angle.
    wrong_register={**register,'validation_correspondences':[corr(holds[0]['measurement_index'],[2,2,2])]}
    badhold=call('structure','register',**wrong_register)
    assert badhold.get('held_out_geometry_passed', badhold['held_out_validation_passed']) is False and abs(badhold['registration']['rotation_deg']-angle)<1e-10
    REPORT['cases']['held_out_wrong_correspondence']=compact_reg(badhold)
    # Preserve conflict and original request recovery, hash before/after.
    journal=STRUCTURES/'requests'/(general['request_id']+'.json');before=hashlib.sha256(journal.read_bytes()).hexdigest()
    conflict=call('structure','general_compare',expect_ok=False,request_id=general['request_id'],**{**gc,'max_residual_inv_angstrom':.004})
    recovered=call('structure','result',query_request_id=general['request_id'])
    assert not conflict['ok'] and recovered['object_id']==general['object_id'] and before==hashlib.sha256(journal.read_bytes()).hexdigest()
    REPORT['cases']['conflict_and_recovery']={'conflict':conflict,'object_id':recovered['object_id'],'original_journal_sha256':before}
    # Finite-resolution pseudo-holdout: c20 and small tilt project distinct hkl onto one unresolved source peak.
    src2=cif('tetragonal_projected_alias',[4,4,20],[[0,0,0]],'C')
    s2obj=call('structure','open',source_path=str(src2))
    o2=call('structure','orient',object_id=s2obj['object_id'],zone_axis_uvw=[0,1,32],in_plane_direction_uvw=[1,0,0],in_plane_rotation_deg=17)
    sim2=simulate(s2obj,o2,radius=.6,excitation=.12)
    # Image contains just two cosine peaks. third anchor lies 0.0200 FFT bins from first.
    cal2=save_image('only_two_observed_peaks',[[[.25,0],[0,.25]]],[.5,.5])
    fft2=call('image','fft',object_id=cal2['object_id'],window='none',subtract_mean=True,max_size=256)
    tilt=math.atan(4/640);q2=[ [.25,0],[0,.25*math.cos(tilt)],[.25,-.05*math.sin(tilt)] ]
    measures=[call('image','measure',object_id=fft2['object_id'],coordinate_space='frequency_cycles_per_pixel',points=[[0,0],[q[0]*.5,q[1]*.5]]) for q in q2]
    alias=call('structure','register',object_id=sim2['object_id'],measurement_paths=paths([m['object_id'] for m in measures]),experimental_kind='real_space_fft',current_image_object_id=fft2['object_id'],fit_correspondences=[corr(0,[1,0,0]),corr(1,[0,1,0])],validation_correspondences=[corr(2,[1,0,1])],screen_axes={'flip_y':False,'basis':'Explicit signed analytic metric'},confirmation={'source':'synthetic_fixture','source_text':'Intentional counterexample: third anchor is an unresolved offset of first observed peak, not an independent observed spot'},max_residual_inv_angstrom=.003)
    alias_cmp=call('structure','compare',object_id=sim2['object_id'],measurement_paths=paths([m['object_id'] for m in measures]),experimental_kind='real_space_fft',current_image_object_id=fft2['object_id'],registration_object_id=alias['object_id'],max_residual_inv_angstrom=.003)
    REPORT['cases']['unresolved_projection_alias']={'proposal':compact_reg(alias),'source_has_two_cosine_families':True,'fit_to_hold_q_separation':float(np.linalg.norm(np.array(q2[0])-q2[2])),'fft_bin_resolution_inv_angstrom':1/64,'separation_in_fft_bins':float(np.linalg.norm(np.array(q2[0])-q2[2]))*64,'compare_id':alias_cmp['object_id'],'propagated_fit_validation_evidence':alias_cmp['fit_validation_evidence'],'comparison_ambiguity':alias_cmp['ambiguity']}
    REPORT['result']='COMPLETED'
except Exception as exc:
    REPORT['result']='INCOMPLETE';REPORT['failure']=repr(exc)
    raise
finally:
    REPORT['evidence_files']={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.rglob('*') if p.is_file() and p.name not in ['report.json','report.partial.json']}
    dump(OUT/'report.json',REPORT)
    print('RETAINED',OUT,flush=True)
