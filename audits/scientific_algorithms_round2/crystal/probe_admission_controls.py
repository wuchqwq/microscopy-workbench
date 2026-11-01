"""Continue a completed probe_saved_crystal workspace via fresh public requests.
Usage: .venv/bin/python this_script.py /absolute/path/to/completed/raw/directory
Never overwrites original inputs/results; writes a sibling controls directory.
"""
import hashlib,json,math,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=pathlib.Path(sys.argv[1]).resolve()
OUT=ROOT/'analysis'/('algorithm-audit-round2-crystal-controls-'+time.strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True,exist_ok=False);(OUT/'calls').mkdir()
IMAGES,STRUCTURES=BASE/'images',BASE/'structures'
REPORT={'base':str(BASE),'output':str(OUT),'cases':{},'calls':[]};serial=0

def dump(p,v):p.write_text(json.dumps(v,indent=2,allow_nan=False)+'\n')
def orig(n,part='stdout'):
    return json.loads(next((BASE/'calls').glob(f'{n:03d}-*.{part}.json')).read_text())
def saved(n):return orig(n)['result']
def call(provider,action,expect_ok=True,**kwargs):
    global serial
    serial+=1;req=dict(workspace=str(IMAGES if provider=='image' else STRUCTURES),request_id=f'r2-controls-{serial:03d}',action=action,**kwargs)
    stem=OUT/'calls'/f'{serial:03d}-{provider}-{action}';dump(stem.with_suffix('.input.json'),req)
    p=subprocess.run([sys.executable,'-B',str(ROOT/('tools/image_workspace.py' if provider=='image' else 'tools/structure_worker.py'))],input=json.dumps(req),text=True,capture_output=True,timeout=180,cwd=ROOT)
    stem.with_suffix('.stdout.json').write_text(p.stdout);stem.with_suffix('.stderr.txt').write_text(p.stderr)
    r=json.loads(p.stdout);REPORT['calls'].append({'index':serial,'action':action,'ok':r.get('ok')});dump(OUT/'report.partial.json',REPORT)
    print(serial,provider,action,r.get('ok'),flush=True)
    if expect_ok:assert r.get('ok'),r
    return r['result'] if r.get('ok') else r

def req_without_id(n):return {k:v for k,v in orig(n,'input').items() if k not in ['action','workspace','request_id']}
def path(ident):return str(IMAGES/'objects'/ident/'object.json')
def m(fft,q):return call('image','measure',object_id=fft,coordinate_space='frequency_cycles_per_pixel',points=[[0,0],[q[0]*.5,q[1]*.5]])
def compact(r):return {k:r[k] for k in ['object_id','registration','fit_status','validation_status','held_out_validation_passed','held_out_independence']}

def domains_for(frame,physical):
    f=call('image','spatial_field',object_id=frame['object_id'],window_sizes=[128],stride_xy=[128,128],max_windows=2,coordinate_domain='physical' if physical else 'pixel',window='none',subtract_mean=True,max_peaks=12,max_size=256,peak_options={'min_separation_bins':1,'exclude_dc_radius_bins':1,'threshold_rel':.2,'refinement':'none'})
    d=[dict(field_object_id=f['object_id'],rect_xyxy=s['rect_xyxy'],current_image_object_id=s.get('view_object_id') or s['fft_object_id'],measurement_object_ids=s['measurement_object_ids']) for s in f['samples']]
    return d
try:
    aliasreq=req_without_id(31);fft=saved(27)['object_id'];tilt=math.atan(4/640)
    # The real cosine's negative partner is a conjugate, not a new observation.
    # Different l avoids the exact -HKL rejection while tiny transverse shift stays within same Fourier peak.
    near=m(fft,[-.25,-.05*math.sin(tilt)])
    p=aliasreq['measurement_paths'][:2]+[path(near['object_id'])]
    nr=call('structure','register',**{**aliasreq,'measurement_paths':p,'validation_correspondences':[{'measurement_index':2,'hkl':[-1,0,1]}]})
    REPORT['cases']['near_conjugate_projected_alias']=compact(nr)
    assert nr['held_out_validation_passed'] is True
    exact=m(fft,[-.25,0])
    er=call('structure','register',expect_ok=False,**{**aliasreq,'measurement_paths':aliasreq['measurement_paths'][:2]+[path(exact['object_id'])],'validation_correspondences':[{'measurement_index':2,'hkl':[-1,0,0]}]})
    assert not er['ok'];REPORT['cases']['exact_friedel_rejected']=er
    # Harmonic at a distinct location is a radial consistency check but no new angular family.
    harmonic=m(fft,[.5,0])
    hr=call('structure','register',**{**aliasreq,'measurement_paths':aliasreq['measurement_paths'][:2]+[path(harmonic['object_id'])],'validation_correspondences':[{'measurement_index':2,'hkl':[2,0,0]}]})
    REPORT['cases']['harmonic_geometry_holdout']=compact(hr)
    # Two harmonic fit vectors are rank one; no implicit plane rotation admitted.
    deg=call('structure','register',expect_ok=False,**{**aliasreq,'measurement_paths':[aliasreq['measurement_paths'][0],path(harmonic['object_id'])],'fit_correspondences':[{'measurement_index':0,'hkl':[1,0,0]},{'measurement_index':1,'hkl':[2,0,0]}],'validation_correspondences':[]})
    assert not deg['ok'];REPORT['cases']['collinear_fit_rejected']=deg
    empty=call('structure','register',**{**aliasreq,'validation_correspondences':[]})
    assert empty['held_out_validation_passed'] is None;REPORT['cases']['no_holdout_not_tested']=compact(empty)
    # Geometrical witnesses without independent physical scale cannot be a crystal verdict.
    gc=req_without_id(12);tc=req_without_id(14)
    raw=saved(7);d=domains_for(raw,False)
    ng=call('structure','general_compare',**{**gc,'domains':d,'current_spatial_image_object_id':raw['object_id']})
    nt=call('structure','twin_compare',**{k:v for k,v in {**tc,'domains':d,'current_spatial_image_object_id':raw['object_id']}.items() if k not in ['interface_measurement_object_id','interface_projection_basis']})
    assert ng['status']==nt['status']=='insufficient_evidence'
    REPORT['cases']['absent_scale']={'general_status':ng['status'],'general_id':ng['object_id'],'twin_status':nt['status'],'twin_id':nt['object_id'],'twin_projected_relation':nt['projected_relation']}
    # Ten percent scale error: no fitting of scale, no candidate-dependent correction.
    truth=json.loads((BASE/'analytic_truth.json').read_text());scale=truth['source_xy_scale_angstrom']
    badscale=call('image','calibrate',object_id=raw['object_id'],scope='image',xy_scale={'x':scale[0]*1.1,'y':scale[1]*1.1,'unit':'angstrom'},source_text='Intentional analytic negative: 10 percent wrong physical scale')
    d=domains_for(badscale,True)
    bg=call('structure','general_compare',**{**gc,'domains':d,'current_spatial_image_object_id':badscale['object_id']})
    bt=call('structure','twin_compare',**{k:v for k,v in {**tc,'domains':d,'current_spatial_image_object_id':badscale['object_id']}.items() if k not in ['interface_measurement_object_id','interface_projection_basis']})
    assert bg['status']=='incompatible' and bt['status']=='insufficient_evidence'
    # Re-use the original fitted calibration/FFT measurements against new current geometry fails.
    stale=call('structure','compare',expect_ok=False,**{**req_without_id(11),'current_image_object_id':d[0]['current_image_object_id']})
    assert not stale['ok']
    REPORT['cases']['wrong_scale']={'general_status':bg['status'],'general_id':bg['object_id'],'twin_status':bt['status'],'twin_id':bt['object_id'],'twin_projected_relation':bt['projected_relation'],'stale_proposal_rejected':stale}
    # One direction's conjugate pair cannot make domain A adequate for general/twin.
    gooddomains=gc['domains'];ids=gooddomains[0]['measurement_object_ids'];first=json.loads(pathlib.Path(path(ids[0])).read_text());q=first['physical_vector_xy']
    partner=next(i for i in ids[1:] if all(abs(a+b)<1e-10 for a,b in zip(json.loads(pathlib.Path(path(i)).read_text())['physical_vector_xy'],q)))
    fd=[{**gooddomains[0],'measurement_object_ids':[ids[0],partner]},gooddomains[1]]
    fg=call('structure','general_compare',**{**gc,'domains':fd})
    ft=call('structure','twin_compare',**{**tc,'domains':fd})
    assert fg['status']==ft['status']=='insufficient_evidence'
    REPORT['cases']['one_family_friedel']={'general_status':fg['status'],'twin_status':ft['status'],'direction_evidence':fg['candidate_pairs'][0]['sides'][0]['direction_evidence']}
    REPORT['result']='COMPLETED'
except Exception as exc:
    REPORT['result']='INCOMPLETE';REPORT['failure']=repr(exc);raise
finally:
    REPORT['evidence_sha256']={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.rglob('*') if p.is_file() and p.name not in ['report.json','report.partial.json']}
    dump(OUT/'report.json',REPORT);print('RETAINED',OUT,flush=True)
