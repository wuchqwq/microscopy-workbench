"""Independent synthetic analytic probes; no repository fixture generates truth.

Run from repository root: .venv/bin/python audits/scientific_algorithms/astra_probes.py
All writes are beneath this audit directory. Existing run evidence is retained.
"""
import hashlib
import itertools
import json
import math
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import numpy as np
from tools import image_gpa_core as gpa, image_topology_core as topology
from crystallography import orientation, indexing, hexagonal, reflection_compare, structure_tools, twin_geometry
from ase import Atoms

OUT = Path(__file__).parent / ("astra_evidence_" + time.strftime("%Y%m%dT%H%M%S"))
OUT.mkdir()
(OUT/'executed_astra_probes.py').write_bytes(Path(__file__).read_bytes())
(OUT/'execution.json').write_text(json.dumps({'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'python':sys.version,'baseline_sha':'b6dd9075dc730deec24c0f87a0ec3a3cee127d1c','exit_semantics':'0 means probe execution completed; scientific FAIL/METHOD_LIMIT are data; 2 means PROBE_ERROR'},indent=2))
RESULTS = []

def record(name, status, **details):
    RESULTS.append(dict(name=name, status=status, **details))
    (OUT / "results.json").write_text(json.dumps(RESULTS, indent=2, allow_nan=False))
    print(name, status, flush=True)

def attempt(name, fn):
    try:
        fn()
    except Exception as exc:
        import traceback
        record(name, "PROBE_ERROR", exception=repr(exc), traceback=traceback.format_exc())

def gpa_affine():
    y,x = np.indices((256,256),dtype=float)
    reference = np.array([[.125,0],[0,.125]])
    observed = np.array([[31/256,1/256],[0,33/256]])
    # I(x) = sum cos(2 pi (G F^-1)x), independent analytical deformation.
    invf = np.array([[31/32,1/32],[0,33/32]])
    expected_f = np.linalg.inv(invf)
    image = sum(np.cos(2*np.pi*(q[0]*x+q[1]*y)) for q in observed)
    np.save(OUT / "affine_source.npy",image)
    for metric in (None,[.02,-.05]):
        result = gpa.analyze(np.fft.fftshift(np.fft.fft2(image)),reference,.018,[90,90,166,166],calibration_nm_xy=metric)
        arrays = result['arrays']; valid=arrays['valid_tensor']
        f = expected_f if metric is None else np.diag(metric)@expected_f@np.diag(1/np.array(metric))
        strain=.5*(f.T@f-np.eye(2))
        rotation=math.atan2(f[1,0]-f[0,1],f[0,0]+f[1,1])
        errors=dict(F=float(np.max(abs(arrays['deformation_gradient_xy'][valid]-f))),E=float(np.max(abs(arrays['strain_green_lagrange_xy'][valid]-strain))),rotation=float(np.max(abs(arrays['rotation_radians'][valid]-rotation))))
        record('gpa_affine_'+('signed_metric' if metric else 'pixels'),'PASS' if max(errors.values())<1e-11 else 'FAIL',expected_F=f.tolist(),expected_E=strain.tolist(),max_abs_error=errors,valid_pixels=int(valid.sum()))
    fitted=gpa.analyze(np.fft.fftshift(np.fft.fft2(image)),reference,.018,[90,90,166,166],reference_mode='fit_reference')
    error=float(np.nanmax(abs(fitted['arrays']['deformation_gradient_xy']-np.eye(2))))
    record('gpa_fit_reference_removes_uniform_affine','PASS' if error<1e-11 else 'FAIL',max_error=error,effective_g=fitted['report']['effective_g_vectors_cycles_per_pixel'])
    try:
        gpa.analyze(np.fft.fftshift(np.fft.fft2(np.cos(2*np.pi*.125*x))),reference,.018,[90,90,166,166])
    except gpa.GPAError as exc:
        record('gpa_missing_second_reflection','PASS',rejection=exc.code,message=str(exc))
    else:
        record('gpa_missing_second_reflection','FAIL')

def gpa_contrast_limit():
    y,x=np.indices((256,256),dtype=float)
    # Atomic carrier positions do not move; two quadrature contrast components
    # exchange weight. Identical image to a displaced lattice: nonidentifiable.
    psi=.35*np.sin(2*np.pi*x/128)
    image=np.cos(psi)*np.cos(2*np.pi*.125*x)+np.sin(psi)*np.sin(2*np.pi*.125*x)+np.cos(2*np.pi*.125*y)
    out=gpa.analyze(np.fft.fftshift(np.fft.fft2(image)),[[.125,0],[0,.125]],.018,[90,90,166,166])
    valid=out['arrays']['valid_tensor']; strain=out['arrays']['strain_green_lagrange_xy'][...,0,0]
    record('gpa_contrast_phase_nonidentifiability','METHOD_LIMIT',true_material_strain=0,apparent_exx_range=[float(strain[valid].min()),float(strain[valid].max())],documented_limit=out['report']['limitations'][1])

def gpa_rigid_rotation():
    # Rational Pythagorean rotation permits exact DFT-bin carriers at n=512:
    # cos(alpha)=63/65, sin(alpha)=16/65; no interpolation constructs truth.
    y,x=np.indices((512,512),dtype=float)
    image=np.cos(2*np.pi*(63*x+16*y)/512)+np.cos(2*np.pi*(-16*x+63*y)/512)
    out=gpa.analyze(np.fft.fftshift(np.fft.fft2(image)),[[65/512,0],[0,65/512]],.018,[180,180,332,332])
    expected=np.array([[63,-16],[16,63]],dtype=float)/65
    valid=out['arrays']['valid_tensor']
    errors=dict(F=float(np.max(abs(out['arrays']['deformation_gradient_xy'][valid]-expected))),E=float(np.max(abs(out['arrays']['strain_green_lagrange_xy'][valid]))),rotation=float(np.max(abs(out['arrays']['rotation_radians'][valid]-math.atan2(16,63)))))
    record('gpa_rigid_rotation_zero_finite_strain','PASS' if max(errors.values())<1e-10 else 'FAIL',truth_rotation_radians=math.atan2(16,63),truth_green_lagrange_strain=0,max_abs_error=errors)

def topology_cases():
    y,x=np.indices((128,128),dtype=float)
    theta=np.arctan2(y-63.5,x-63.5)
    g=np.array([[.125,0],[0,.125],[.125,.125]])
    phases=np.array([-theta,0*theta,-theta]); amp=np.ones_like(phases)
    loops=[[35,35,94,94],[20,20,109,109]]
    out=topology.analyze(phases,amp,g,loops,calibration_nm_xy=[.02,-.03])
    b=out['report']['projected_burgers']['b_pixel_xy']
    record('topology_analytic_unit_vortex','PASS' if np.allclose(b,[8,0]) and out['report']['status']=='projected_topological_evidence' else 'FAIL',expected_b=[8,0],report=out['report'])
    reverse=topology.analyze(phases,amp,g,[dict(rect=r,orientation='negative_image_xy') for r in loops])
    record('topology_reverse_path_canonical_sign','PASS' if np.allclose(reverse['report']['projected_burgers']['b_pixel_xy'],[8,0]) else 'FAIL',raw_windings=reverse['arrays']['loop_winding_integer'].tolist(),canonical_b=reverse['report']['projected_burgers']['b_pixel_xy'])
    two=np.arctan2(y-63.5,x-54.5)-np.arctan2(y-63.5,x-72.5)
    phases2=np.angle(np.exp(1j*np.array([-two,0*two,-two])))
    cancelled=topology.analyze(phases2,amp,g,loops)
    record('topology_dipole_is_zero_net_not_no_defects','PASS' if cancelled['report']['status']=='no_net_winding_detected' else 'FAIL',known_enclosed_core_count=2,status_actual=cancelled['report']['status'])
    corrupted=amp.copy(); corrupted[:,35,50]=0
    invalid=topology.analyze(phases,corrupted,g,loops)
    record('topology_path_gap_invalidates_evidence','PASS' if not invalid['arrays']['loop_valid'][0].any() and invalid['report']['status']=='insufficient_loop_stability' else 'FAIL',status_actual=invalid['report']['status'],loop_valid=invalid['arrays']['loop_valid'].tolist())
    # Sampled wrapped fields contain no material identity: optical contrast
    # vortex and elastic dislocation with identical phases have same answer.
    record('topology_image_vortex_not_material_dislocation','METHOD_LIMIT',identical_input_may_be_contrast_vortex=True,algorithm_status=out['report']['status'],interpretation_status=out['report']['interpretation_status'],limitation=out['report']['limitations'][0])

def topology_group_version_cases():
    from tools import image_topology_legacy_v1
    y,x=np.indices((160,160),dtype=float)
    theta=np.arctan2(y-40.5,x-40.5)-np.arctan2(y-110.5,x-110.5)
    phases=np.angle(np.exp(1j*np.array([-theta,0*theta,-theta])))
    amp=np.ones_like(phases); g=[[.125,0],[0,.125],[.125,.125]]
    loops=[[20,20,62,62],[10,10,72,72],[90,90,132,132],[80,80,142,142]]
    v2=topology.analyze(phases,amp,g,loops)['report']
    v1=image_topology_legacy_v1.analyze(phases,amp,g,loops)['report']
    expected=[[8,0],[-8,0]]; actual=[r['projected_burgers']['b_pixel_xy'] for r in v2['loop_groups']]
    good=v2['status']=='spatially_grouped_evidence' and np.allclose(actual,expected) and v2['projected_burgers'] is None and v1['status']=='inconsistent_or_partial_evidence'
    record('topology_v1_v2_separated_opposite_cores','PASS' if good else 'FAIL',expected_local_b=expected,actual_v2_local_b=actual,v2_status=v2['status'],v1_historical_semantics_status=v1['status'])
    nested=topology.analyze(phases,amp,g,[[20,20,62,62],[5,5,150,150]])['report']
    charges=[r['reflections'][0]['canonical_winding_integer'] for r in nested['loops']]
    record('topology_nested_annular_charge_change','PASS' if charges==[-1,0] and nested['status']=='inconsistent_or_partial_evidence' else 'FAIL',expected_charge=[-1,0],actual_charge=charges,status_actual=nested['status'],scope='Failure of one stable net closure; opposite core added in annulus, not impossible physics')

def crystal_geometry():
    # Direct oblique cell and explicit cross-product reciprocal basis truth.
    cell=np.array([[3.,0,0],[-1.,4.,0],[.5,.25,5.]])
    uvw=np.array([1,2,1]); ref=np.array([1,0,0]); beam=uvw@cell; beam/=np.linalg.norm(beam)
    xx=ref@cell; xx-=xx@beam*beam; xx/=np.linalg.norm(xx)
    yy=np.cross(beam,xx); truth=np.stack([xx,yy,beam])
    result=orientation.from_zone_axis(cell,[1,2,1],[1,0,0]); matrix=np.array(result['rotation_matrix_cartesian'])
    record('orientation_oblique_direct_zone','PASS' if np.max(abs(matrix-truth))<1e-12 else 'FAIL',max_matrix_error=float(np.max(abs(matrix-truth))))
    # Independent exact centered-cubic reciprocal vectors, no search used to
    # synthesize them. F[001], a=.4 nm, hkl=(200),(020),(220).
    result=indexing.index_cubic([[5.,0],[0,5.],[5.,5.]],calibrated=True,max_index=2,centerings=['F'],candidate_lattice_nm={'F':.4},max_candidates=100)
    (OUT/'cubic_candidates.json').write_text(json.dumps(result,indent=2))
    candidates=result['candidates']
    record('cubic_F001_fixed_a','PASS' if candidates else 'FAIL',candidate_count=len(candidates),best=candidates[0] if candidates else None)
    # Exhaustive 3-observation matching oracle, including dummy assignments.
    rng=np.random.default_rng(20261101); failures=[]
    for trial in range(100):
        d=rng.uniform(0,1.5,(3,4)); got=reflection_compare.assign_within_tolerance(d,1.)
        actual=(-len(got),sum(d[i,j] for i,j in got))
        possibilities=[]
        for assign in itertools.product(range(-1,4),repeat=3):
            used=[j for j in assign if j>=0]
            if len(used)!=len(set(used)) or any(d[i,j]>1 for i,j in enumerate(assign) if j>=0): continue
            possibilities.append((-len(used),sum(d[i,j] for i,j in enumerate(assign) if j>=0)))
        expected=min(possibilities)
        if actual[0]!=expected[0] or abs(actual[1]-expected[1])>1e-12: failures.append(trial)
    record('reflection_assignment_exhaustive_oracle','PASS' if not failures else 'FAIL',random_matrices=100,failures=failures)
    # HCP unit basis factors are checked by a direct independent complex sum.
    error=0.
    for h,k,l in itertools.product(range(-2,3),repeat=3):
        expected=abs(1+np.exp(2j*np.pi*(h/3+2*k/3+l/2)))**2
        error=max(error,abs(expected-hexagonal.hcp_basis_diagnostic([h,k,l])['ideal_identical_atom_basis_factor_squared']))
    record('hcp_basis_factor_independent_complex_sum','PASS' if error<1e-12 else 'FAIL',max_error=error)
    fcc=np.array([[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]])
    atoms=Atoms('Cu4',scaled_positions=fcc,cell=np.eye(3)*3.6,pbc=True)
    result=twin_geometry.orient_candidate(atoms,{'rotation_matrix_cartesian':np.eye(3).tolist()},[1,1,1])
    # Exact +60 about [111], Rodrigues evaluated symbolically.
    expected=np.array([[2,-1,2],[2,2,-1],[-1,2,2]],dtype=float)/3
    got=np.array(result['orientation']['rotation_matrix_cartesian'])
    record('twin_sigma3_exact_rodrigues','PASS' if np.max(abs(got-expected))<1e-12 else 'FAIL',max_error=float(np.max(abs(got-expected))),expected=expected.tolist(),actual=got.tolist())

def crystal_candidate_ambiguity():
    # Finite F reflections 200,020,220 at a=.4 nm coincide with primitive
    # 100,010,110 at a=.2 nm. Missing/other peaks are not supplied evidence.
    result=indexing.index_cubic([[5.,0],[0,5.],[5.,5.]],calibrated=True,max_index=2,centerings=['F','P'],candidate_lattice_nm={'F':.4,'P':.2},max_candidates=100)
    candidates=result['candidates']; families=sorted(set(c['centering'] for c in candidates))
    (OUT/'alternative_cubic_candidates.json').write_text(json.dumps(result,indent=2))
    record('finite_projection_accepts_alternative_crystal_candidates','METHOD_LIMIT' if families==['F','P'] and all(not c['chemical_phase_identified'] for c in candidates) else 'FAIL',synthetic_generating_candidate='F cubic a=.4nm',alternative='P cubic a=.2nm',accepted_centerings=families,best_residual_by_family={f:min(c['rms_relative_vector_residual'] for c in candidates if c['centering']==f) for f in families},phase_identification_claimed=any(c['chemical_phase_identified'] for c in candidates),ambiguity=result['ambiguity'])

def occupancy_full_api():
    # Standard extXYZ permits additional per-atom properties. ASE reads this
    # explicit field; no custom parser or monkeypatch supplies the truth.
    source=OUT/'partial_occupancy.xyz'
    source.write_text('1\nLattice="3.6 0 0 0 3.6 0 0 0 3.6" Properties=species:S:1:pos:R:3:occupancy:R:1 pbc="T T T"\nCu 0 0 0 0.5\n')
    atoms,_,_=structure_tools.load_structure(str(source))
    workspace=OUT/'partial_workspace'
    request=dict(workspace=str(workspace),action='open',request_id='partial_open',source_path=str(source))
    opened=structure_tools.execute(request)
    (OUT/'occupancy_open_response.json').write_text(json.dumps(opened,indent=2))
    result=opened.get('result',opened)
    if not opened.get('ok'): raise RuntimeError(opened)
    request=dict(workspace=str(workspace),action='simulate',request_id='partial_simulate',object_id=result['object_id'],voltage_kv=200,euler_rzxz_deg=[0,0,0],reciprocal_radius_inv_angstrom=.8,max_excitation_error_inv_angstrom=.02,size=64)
    simulated=structure_tools.execute(request)
    (OUT/'occupancy_simulate_response.json').write_text(json.dumps(simulated,indent=2))
    stored=json.loads((workspace/'objects'/result['object_id']/'atoms.json').read_text())
    record('partial_occupancy_full_open_simulate','FAIL' if simulated.get('ok') else 'PASS',ase_input_occupancy=atoms.arrays['occupancy'].tolist(),stored_atoms=stored,simulation_ok=simulated.get('ok'),expected='Reject unsupported partial occupancy or preserve/use its explicit scientific value; never silently occupancy=1',actual='All simulated diffpy atoms constructed with occupancy=1' if simulated.get('ok') else simulated)

def occupancy_extinction_and_twin():
    def call(workspace, action, **kw):
        response=structure_tools.execute(dict(workspace=str(workspace),action=action,request_id=action+'_'+str(len(list(workspace.glob('requests/*')))),**kw))
        if not response.get('ok'): raise RuntimeError(response)
        return response.get('result',response)
    simulations=[]
    for label,occ in [('partial',.5),('full',1.)]:
        source=OUT/('two_site_'+label+'.xyz')
        source.write_text('2\nLattice="3.6 0 0 0 3.6 0 0 0 3.6" Properties=species:S:1:pos:R:3:occupancy:R:1 pbc="T T T"\nCu 0 0 0 1.0\nCu 1.8 0 0 '+str(occ)+'\n')
        workspace=OUT/('two_site_'+label+'_workspace')
        opened=call(workspace,'open',source_path=str(source))
        simulation=call(workspace,'simulate',object_id=opened['object_id'],voltage_kv=200,euler_rzxz_deg=[0,0,0],reciprocal_radius_inv_angstrom=.8,max_excitation_error_inv_angstrom=.02,size=64)
        simulations.append(simulation)
    a,b=[s['reflections'] for s in simulations]
    identical=a==b
    # F100 / fCu(q100) = 1 - .5 = .5 for partial occupation,
    # whereas full equal sites give 1-1=0. Positive Lorentzian excitation
    # weight and positive Cu elastic factor cannot turn .25 into exact absence.
    odd_h=[row for row in a['hkl'] if abs(row[0])%2==1 and row[1:]==[0,0]]
    record('partial_occupancy_changes_extinction_but_api_erases_it','FAIL' if identical else 'PASS',reflection_tables_identical=identical,expected_partial_100_basis_intensity=.25,expected_full_100_basis_intensity=0,actual_partial_100_reflections=odd_h,source_hashes={label:hashlib.sha256((OUT/('two_site_'+label+'.xyz')).read_bytes()).hexdigest() for label in ('partial','full')})
    # Fully occupied conventional FCC admission must not be regained by IO.
    source=OUT/'partial_fcc.xyz'
    source.write_text('4\nLattice="3.6 0 0 0 3.6 0 0 0 3.6" Properties=species:S:1:pos:R:3:occupancy:R:1 pbc="T T T"\nCu 0 0 0 0.5\nCu 0 1.8 1.8 1\nCu 1.8 0 1.8 1\nCu 1.8 1.8 0 1\n')
    atoms,_,_=structure_tools.load_structure(str(source))
    try:
        twin_geometry.qualify(atoms); direct_rejected=False
    except twin_geometry.TwinGeometryError:
        direct_rejected=True
    workspace=OUT/'partial_fcc_workspace'
    opened=call(workspace,'open',source_path=str(source))
    orient=call(workspace,'orient',object_id=opened['object_id'],zone_axis_uvw=[0,0,1],in_plane_direction_uvw=[1,0,0])
    response=structure_tools.execute(dict(workspace=str(workspace),action='twin_orient',request_id='partial_twin',object_id=opened['object_id'],orientation_id=orient['object_id'],plane_hkl=[1,1,1],candidate_basis='Synthetic audit: explicitly partial occupation must not qualify as fully occupied FCC.'))
    (OUT/'partial_fcc_twin_response.json').write_text(json.dumps(response,indent=2))
    record('partial_fcc_twin_admission_changes_after_saved_reload','FAIL' if direct_rejected and response.get('ok') else 'PASS',direct_qualify_rejected=direct_rejected,public_twin_orient_ok=response.get('ok'),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest())

def gpa_topology_full_api():
    import tifffile
    from tools import image_workspace
    y,x=np.indices((256,256),dtype=float); theta=np.arctan2(y-127.5,x-127.5)
    image=np.cos(2*np.pi*.125*x-theta)+np.cos(2*np.pi*.125*y)+np.cos(2*np.pi*.125*(x+y)-theta)
    source=OUT/'phase_vortex.tiff'; tifffile.imwrite(source,image.astype(np.float32))
    workspace=OUT/'phase_vortex_workspace'; counter=0
    def call(action,**kw):
        nonlocal counter
        counter+=1
        response=image_workspace.execute(dict(workspace=str(workspace),action=action,request_id='vortex_'+str(counter),**kw))
        if not response.get('ok'): raise RuntimeError(response)
        return response['result']
    opened=call('open',source_path=str(source)); frame=call('frame',object_id=opened['object_id'],frame_index=0)
    fft=call('fft',object_id=frame['object_id'],rect=[0,0,256,256],window='none',subtract_mean=True,max_size=256)
    common=dict(object_id=fft['object_id'],mask_sigma=.014,reference_rect=[50,50,75,75],reference_mode='fixed_g',reference_text='Analytic carriers with one synthetic phase vortex',source_domain='real_space_lattice',source_domain_text='Synthetic three-carrier image; contrast winding is not proof of material defect',max_size=256)
    first=call('gpa',**common,g_vectors=[[.125,0],[0,.125]])
    second=call('gpa',**common,g_vectors=[[.125,0],[.125,.125]])
    result=call('topology',object_ids=[first['object_id'],second['object_id']],loops=[dict(rect=r,orientation='positive_image_xy') for r in [[75,75,182,182],[60,60,197,197]]],model_assumption_text='Only analytic synthetic image-phase winding; no material dislocation assertion',max_size=256)
    report=result['report']; b=report['projected_burgers']['b_pixel_xy']
    (OUT/'full_api_topology_response.json').write_text(json.dumps(result,indent=2))
    record('full_api_image_fft_gpa_saved_topology','PASS' if b is not None and np.max(abs(np.array(b)-[8,0]))<1e-10 and report['status']=='projected_topological_evidence' else 'FAIL',expected_b=[8,0],actual_b=b,status_actual=report['status'],retained_reflections=report['reflection_count'])
    # Reusing one Fourier band with a slightly different demodulation carrier
    # is not another independent reflection; truth contains only TWO carriers.
    source2=OUT/'two_carrier_vortex.tiff'
    image2=np.cos(2*np.pi*.125*x-theta)+np.cos(2*np.pi*.125*y)
    tifffile.imwrite(source2,image2.astype(np.float32))
    opened2=call('open',source_path=str(source2)); frame2=call('frame',object_id=opened2['object_id'],frame_index=0)
    fft2=call('fft',object_id=frame2['object_id'],rect=[0,0,256,256],window='none',subtract_mean=True,max_size=256)
    common['object_id']=fft2['object_id']
    first2=call('gpa',**common,g_vectors=[[.125,0],[0,.125]])
    second2=call('gpa',**common,g_vectors=[[.125,.004],[0,.125]])
    alias=call('topology',object_ids=[first2['object_id'],second2['object_id']],loops=[dict(rect=r,orientation='positive_image_xy') for r in [[75,75,182,182],[60,60,197,197]]],model_assumption_text='Audit counterexample: two source carriers; shifted mask samples SAME first reflection again.',max_size=256)
    report=alias['report']
    (OUT/'overlapping_band_topology_response.json').write_text(json.dumps(alias,indent=2))
    mask1=np.load(workspace/'objects'/first2['object_id']/'mask_frequency.npy')[0]
    mask2=np.load(workspace/'objects'/second2['object_id']/'mask_frequency.npy')[0]
    overlap=float(((mask1>0)&(mask2>0)).sum()/min((mask1>0).sum(),(mask2>0).sum()))
    normalized_inner=float(np.sum(mask1*mask2)/np.sqrt(np.sum(mask1**2)*np.sum(mask2**2)))
    record('overlapping_gpa_bands_counted_as_independent_topology','FAIL' if report['projected_burgers']['redundancy_validated'] else 'PASS',source_carrier_count=2,mask_sigma=.014,mask_centres_distance=.004,support_radii_sum=.084,mask_support_intersection_fraction=overlap,mask_normalized_inner_product=normalized_inner,centre_distance_in_fourier_bins=.004*256,direction_separation_degrees=math.degrees(math.atan(.004/.125)),status_actual=report['status'],projected_burgers=report['projected_burgers'],source_sha256=hashlib.sha256(source2.read_bytes()).hexdigest())

def simulation_orientation_geometry():
    angle=math.radians(27)
    basis=np.array([[math.cos(angle),-math.sin(angle),0],[math.sin(angle),math.cos(angle),0],[0,0,1]])
    cell=3.6*basis.T
    source=OUT/'rotated_cubic.xyz'
    source.write_text('1\nLattice="'+' '.join(map(str,cell.ravel()))+'" Properties=species:S:1:pos:R:3 pbc="T T T"\nCu 0 0 0\n')
    workspace=OUT/'rotated_cubic_workspace'; counter=0
    def call(action,**kw):
        nonlocal counter
        counter+=1
        response=structure_tools.execute(dict(workspace=str(workspace),action=action,request_id='rotated_'+str(counter),**kw))
        if not response.get('ok'): raise RuntimeError(response)
        return response['result']
    opened=call('open',source_path=str(source)); ori=call('orient',object_id=opened['object_id'],zone_axis_uvw=[0,0,1],in_plane_direction_uvw=[1,0,0])
    simulation=call('simulate',object_id=opened['object_id'],orientation_id=ori['object_id'],voltage_kv=200,reciprocal_radius_inv_angstrom=.8,max_excitation_error_inv_angstrom=.02,size=64)
    # Aligning the rotated direct a1 to lab +x leaves reciprocal hkl/a in lab.
    expected=np.array(simulation['reflections']['hkl'],dtype=float)/3.6
    actual=np.array(simulation['reflections']['coordinates_inv_angstrom'])
    error=float(np.max(abs(actual-expected)))
    record('full_api_rotated_cell_orientation_simulation_coordinates','PASS' if error<1e-12 else 'FAIL',max_coordinate_error=error,reflection_count=len(actual),source_cell=cell.tolist())

if __name__=='__main__':
    for name,fn in [('gpa_affine',gpa_affine),('gpa_contrast_limit',gpa_contrast_limit),('gpa_rigid_rotation',gpa_rigid_rotation),('topology',topology_cases),('topology_groups',topology_group_version_cases),('crystal_geometry',crystal_geometry),('crystal_candidate_ambiguity',crystal_candidate_ambiguity),('occupancy_full_api',occupancy_full_api),('occupancy_extinction_twin',occupancy_extinction_and_twin),('gpa_topology_full_api',gpa_topology_full_api),('simulation_orientation_geometry',simulation_orientation_geometry)]: attempt(name,fn)
    from collections import Counter
    print('Summary:',dict(Counter(r['status'] for r in RESULTS)))
    print('Evidence:',OUT)
    sys.exit(2 if any(r['status']=='PROBE_ERROR' for r in RESULTS) else 0)
