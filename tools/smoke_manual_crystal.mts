// Opt-in actual MCP/Python acceptance: explicit operator ROIs -> bounded atlas
// -> shared manual reviews/general crystal evidence -> one-anchor revision.
// The analytic cosine image is not specimen data or an HRTEM contrast model.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const rows=(value:unknown):Row[]=>{assert.ok(Array.isArray(value));return value.map(row);};
const text=(value:unknown):string=>{assert.equal(typeof value,'string');return value as string;};
const vectors=(value:unknown):number[][]=>{assert.ok(Array.isArray(value));return value.map(v=>{assert.ok(Array.isArray(v)&&v.every(x=>typeof x==='number'&&Number.isFinite(x)));return v as number[];});};
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const near=(a:number[],b:number[],tolerance:number)=>{assert.equal(a.length,b.length);assert.ok(a.every((value,i)=>Math.abs(value-b[i])<=tolerance),JSON.stringify({actual:a,expected:b,tolerance}));};
const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'manual-crystal-'));
const executable=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const py=(code:string,args:string[]=[])=>{const output=spawnSync(executable,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(output.status,0,output.stderr||output.error?.message);return output.stdout.trim();};
const python=py('import sys;print(sys.executable)');
const fixture=row(JSON.parse(py(String.raw`
from pathlib import Path
import sys,json,hashlib,numpy as np,tifffile
p=Path(sys.argv[1]);p.mkdir();n=64
def cif(name,a):
 lines=['# Public synthetic fully ordered FCC basis; candidate, not measured Cu parameters','data_'+name,
 f'_cell_length_a {a}',f'_cell_length_b {a}',f'_cell_length_c {a}',
 '_cell_angle_alpha 90','_cell_angle_beta 90','_cell_angle_gamma 90',
 "_space_group_name_H-M_alt 'P 1'",'_space_group_IT_number 1','loop_',
 '_atom_site_label','_atom_site_type_symbol','_atom_site_fract_x','_atom_site_fract_y','_atom_site_fract_z','_atom_site_occupancy']
 positions=[[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]]
 lines += [f'Cu{i+1} Cu {x} {y} {z} 1' for i,(x,y,z) in enumerate(positions)]
 f=p/(name+'.cif');f.write_text('\n'.join(lines)+'\n',encoding='ascii');return str(f)
structures={'a4':cif('candidate_a',4.),'a3_2':cif('candidate_b',3.2)}
# Independent conventional-cell reciprocal geometry: 200/020/220 for a=4 A.
qs=[[.5,0.],[0.,.5],[.5,.5]];scale=[.25,-.25];y,x=np.indices((n,n));parts=[]
for side in range(2):
 v=np.full((n,n),100.)
 for i,(qx,qy) in enumerate(qs):
  fx,fy=qx*scale[0],qy*scale[1]
  assert abs(fx*n-round(fx*n))<1e-12 and abs(fy*n-round(fy*n))<1e-12
  v+=(6.-i-side*.5)*np.cos(2*np.pi*(fx*x+fy*y))
 parts.append(v.astype('float32'))
source=p/'two_operator_rois.tiff';tifffile.imwrite(source,np.concatenate(parts,axis=1),photometric='minisblack',metadata=None)
truth={'source_path':str(source),'shape_yx':[64,128],'dtype':'float32','rects':[[0,0,64,64],[64,0,128,64]],
 'scale_nm':[.025,-.025],'q_inv_angstrom':qs,'hkls':[[2,0,0],[0,2,0],[2,2,0]],'structures':structures,
 'operator_input':'Explicit synthetic test-operator ROI/reasons, not human-confirmed material interpretation or browser selection',
 'registered_settings':{'window':'none','subtract_mean':True,'max_peaks':8,'threshold_rel':.2,'refinement':'none','radius_inv_angstrom':1.,'max_excitation_error_inv_angstrom':.02,'residual_inv_angstrom':.005,'revision_delta_cycles_per_pixel':.0005}}
truth['source_sha256']={str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.iterdir() if f.is_file()}
(p/'truth.json').write_text(json.dumps(truth,indent=2)+'\n',encoding='utf-8');print(json.dumps(truth))
`,[path.join(directory,'fixture')])));
const workspaceRoot=path.join(directory,'workspace'),images=path.join(workspaceRoot,'images'),structures=path.join(workspaceRoot,'structures');
const config=path.join(directory,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python,structure_python:python,workspace_root:workspaceRoot,structures:true},null,2)+'\n');
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace:images,python,serverPath:path.join(repo,'tools/plugin_server.mjs')});
const first=makeClient(),clients=[first],started=performance.now(),calls:Row[]=[],checks:string[]=[],recovery:Row[]=[];
let serial=0;
const call=async(name:string,args:Row={},client=first)=>{
 const readonly=['image_info','structure_info','image_result','structure_result'].includes(name);
 const requestId=typeof args.request_id==='string'?args.request_id:readonly?undefined:`manual-crystal-${++serial}`;
 const parameters=requestId===undefined?args:{...args,request_id:requestId},before=performance.now();let state='failed_or_unknown';
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before_dispatch',tool:name,request_id:requestId??null,arguments:parameters})+'\n');
 console.log('MCP '+name+' '+(requestId??'read-only'));
 try{const result=await client.tool(name,parameters),data=row(result.data);assert.equal(data.backend,name.startsWith('structure_')?'external-structure-workspace':'external-image-workspace');state='completed';return {...result,data};}
 finally{calls.push({tool:name,request_id:requestId??null,state,elapsed_ms:performance.now()-before});}
};
const data=async(name:string,args:Row={},client=first)=>(await call(name,args,client)).data;
const objects=(w:string)=>existsSync(path.join(w,'objects'))?readdirSync(path.join(w,'objects')).filter(id=>existsSync(path.join(w,'objects',id,'object.json'))):[];
const metadata=(w:string,id:string):Row=>row(JSON.parse(readFileSync(path.join(w,'objects',id,'object.json'),'utf8')));
const counts=()=>({fft:objects(images).filter(id=>metadata(images,id).kind==='fft').length,simulate:objects(structures).filter(id=>metadata(structures,id).kind==='simulate').length,
 full_fields:objects(images).filter(id=>['spatial_field','field_extend','domain_map'].includes(text(metadata(images,id).kind))).length});
const immutable=()=>Object.fromEntries([images,structures].flatMap(w=>['objects','requests'].flatMap(namespace=>{const dir=path.join(w,namespace);if(!existsSync(dir))return [];return namespace==='requests'?readdirSync(dir).map(n=>path.join(dir,n)):readdirSync(dir).flatMap(id=>readdirSync(path.join(dir,id)).map(n=>path.join(dir,id,n)));})).map(f=>[f,hash(f)]));
const science=()=>Object.fromEntries([images,structures].flatMap(w=>objects(w).filter(id=>['frame','fft','structure','orient','simulate'].includes(text(metadata(w,id).kind))).flatMap(id=>readdirSync(path.join(w,'objects',id)).map(n=>{const f=path.join(w,'objects',id,n);return [f,hash(f)];}))));
const unchanged=(before:Record<string,string>)=>{for(const [f,digest] of Object.entries(before))assert.equal(hash(f),digest,'Existing record changed: '+f);};
const saveImage=(name:string,png:unknown)=>{assert.equal(typeof png,'string');const bytes=Buffer.from(png as string,'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');writeFileSync(path.join(directory,name+'.png'),bytes);};
const remember=(provider:string,saved:Row)=>recovery.push({provider,object_id:saved.object_id,request_id:saved.request_id});
const registration={rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'Declared independent synthetic reciprocal laboratory axes, signed XY scale; no per-ROI fit or inferred mirror.'};
const report:Row={schema_version:1,scope:'Actual compiled MCP/Python manual-ROI-to-general-crystal integration; public analytic synthetic operator input, not human GUI or real specimen qualification',started_utc:new Date().toISOString(),oracle:fixture,calls,checks,
 not_tested:['human-selected or browser-operated ROIs','fresh runtime Agent session','real specimen/independent phase identification','dynamical or HRTEM contrast/intensity prediction','actual worker interruption','Mac desktop or DM']};
try{
 await first.rpc('initialize');
 const catalog=rows(row(row(await first.rpc('tools/list')).result).tools);
 for(const name of ['image_discovery','image_spatial_atlas','image_discovery_review','structure_general_compare'])assert.ok(catalog.some(t=>t.name===name));
 const opened=await data('image_open',{source_path:fixture.source_path}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0});
 assert.equal(frame.dtype,'float32');assert.deepEqual(frame.shape_yx,fixture.shape_yx);
 const calibrated=await data('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.025,y:-.025,unit:'nm'},source_text:'Explicit public synthetic signed sampling; not independent experimental calibration.'});
 const rects=vectors(fixture.rects),reasons=['Synthetic operator selects left periodic region for comparison; material identity unconfirmed.','Synthetic operator selects neighboring region with changed display contrast; cause unconfirmed.'];
 const discoveryReply=await call('image_discovery',{object_id:calibrated.object_id,entry:'manual',regions:rects.map((rect,i)=>({rect,reason:reasons[i],candidate_explanations:['Explicit candidate geometry only; no physical phase or twin conclusion.'],unresolved:['Independent physical interpretation is absent.']}))});
 const discovery=discoveryReply.data;saveImage('manual-attention',discoveryReply.png);assert.equal(discovery.support_status,'MANUAL_SUPPORTED_LIMITED');assert.equal(discovery.full_structure_field_required,false);assert.equal(discovery.physical_conclusion,null);
 const candidates=rows(discovery.candidates);assert.deepEqual(candidates.map(c=>c.rect),rects);remember('image',discovery);
 const atlasParameters:Row={object_id:calibrated.object_id,rects,window:'none',subtract_mean:true,max_peaks:8,max_size:512,peak_options:{min_separation_bins:2,exclude_dc_radius_bins:2,threshold_rel:.2,refinement:'none'}};
 const atlasReply=await call('image_spatial_atlas',atlasParameters),atlas=atlasReply.data;saveImage('two-roi-atlas',atlasReply.png);
 const regions=rows(atlas.regions);assert.equal(regions.length,2);assert.equal(counts().fft,2);assert.equal(counts().full_fields,0);remember('image',atlas);
 const expected=vectors(fixture.q_inv_angstrom).flatMap(q=>[q.map(v=>10*v),q.map(v=>-10*v)]),reviews:Row[]=[];
 const domains=(saved:Row)=>rows(saved.regions).map(region=>({field_object_id:saved.object_id,rect_xyxy:region.rect,current_image_object_id:region.view_object_id,measurement_object_ids:region.measurement_object_ids}));
 for(let i=0;i<regions.length;i++){
  const region=regions[i],ids=region.measurement_object_ids as string[];assert.equal(ids.length,6);
  assert.equal(region.fft_reused,false);assert.deepEqual(region.rect,rects[i]);
  const measurements=ids.map(id=>metadata(images,id));
  for(const m of measurements){const q=m.physical_vector_xy as number[];assert.equal(m.d_spacing_unit,'nm');assert.ok(expected.some(e=>Math.hypot(q[0]-e[0],q[1]-e[1])<1e-10));}
  for(const q of expected)assert.ok(measurements.some(m=>Math.hypot((m.physical_vector_xy as number[])[0]-q[0],(m.physical_vector_xy as number[])[1]-q[1])<1e-10));
  const evidence=[region.fft_object_id,region.peak_measurements_object_id];
  const reviewed=await call('image_discovery_review',{object_id:discovery.object_id,candidate_id:candidates[i].candidate_id,evidence_ids:evidence,observation_text:'Shared atlas FFT and actual measurements are bound to this exact synthetic operator ROI; no independent material conclusion.'});
  saveImage('review-'+i,reviewed.png);const review=reviewed.data;reviews.push(review);remember('image',review);
  assert.equal(review.support_status,'MANUAL_SUPPORTED_LIMITED');assert.equal(review.review_is_scientific_verification,false);
  assert.deepEqual(row(review.candidate).rect,rects[i]);assert.deepEqual(rows(review.evidence_refs).map(ref=>ref.object_id),evidence);
  assert.equal(rows(review.fft_refs)[0].object_id,region.fft_object_id);
 }
 checks.push('Explicit synthetic-operator manual ROI records and exact two-window atlas share the same source/calibration; both manual reviews bind the original atlas FFT/measurement children. No full structural field is created.');
 const models:Record<string,Row>={},simulations:Record<string,Row>={};
 for(const key of ['a4','a3_2']){
  const model=await data('structure_open',{source_path:row(fixture.structures)[key]});models[key]=model;
  const orientation=await data('structure_orient',{object_id:model.object_id,zone_axis_uvw:[0,0,1],in_plane_direction_uvw:[1,0,0]});
  vectors(row(orientation.orientation).rotation_matrix_cartesian).forEach((v,i)=>near(v,[+(i===0),+(i===1),+(i===2)],2e-12));
  const sim=await data('structure_simulate',{object_id:model.object_id,orientation_id:orientation.object_id,voltage_kv:200,reciprocal_radius_inv_angstrom:1,max_excitation_error_inv_angstrom:.02,size:64,sigma_pixels:1,with_direct_beam:false,native_float32:false});simulations[key]=sim;remember('structure',sim);
  if(key==='a4'){
   const reflected=row(sim.reflections),hkls=vectors(reflected.hkl),coords=vectors(reflected.coordinates_inv_angstrom),wanted=vectors(fixture.hkls),q=vectors(fixture.q_inv_angstrom);
   for(let i=0;i<wanted.length;i++){const j=hkls.findIndex(h=>JSON.stringify(h)===JSON.stringify(wanted[i]));assert.ok(j>=0,'Independent allowed FCC HKL missing: '+wanted[i]);near(coords[j],[...q[i],0],2e-12);}
  }
 }
 assert.deepEqual(counts(),{fft:2,simulate:2,full_fields:0});
 const pair=(label:string,key:string)=>({label,simulation_a_object_id:simulations[key].object_id,simulation_b_object_id:simulations[key].object_id,basis:'Explicit supplied ordered FCC source and [001] projection; lattice parameters are synthetic candidates, not measured material labels.'});
 const comparisonParameters:Row={current_spatial_image_object_id:calibrated.object_id,domains:domains(atlas),experimental_kind:'real_space_fft',registration,max_residual_inv_angstrom:.005,candidates:[pair('FCC candidate a4','a4'),pair('wrong metric candidate a3.2','a3_2')]};
 const compared=await call('structure_general_compare',comparisonParameters),comparison=compared.data;saveImage('general-evidence',compared.png);remember('structure',comparison);
 assert.equal(comparison.status,'compatible');assert.deepEqual(rows(comparison.candidate_pairs).map(c=>c.status),['compatible','incompatible']);assert.equal(comparison.phase_identified,false);assert.equal(comparison.twin_law_tested,false);
 const beforeRevision=immutable(),protectedScience=science(),fftIds=regions.map(r=>text(r.fft_object_id));
 const display=await data('image_preview',{object_id:regions[0].view_object_id,gamma:.65,representation:'log_amplitude',max_size:512});remember('image',display);assert.deepEqual(science(),protectedScience);
 const oldIds=regions[0].measurement_object_ids as string[];
 const targetId=oldIds.find(id=>Math.abs(vectors(metadata(images,id).points)[1][0])>.01);assert.ok(targetId);
 const oldMeasurement=metadata(images,targetId!),points=vectors(oldMeasurement.points).map(p=>p.slice());points[1][0]+=.0005;
 const corrected=await data('image_remeasure',{object_id:regions[0].view_object_id,measurement_object_id:targetId,points,source_text:'Explicit synthetic operator anchor revision +0.0005 cycles/pixel in X for integration testing; not a peak-detection accuracy claim.'});remember('image',corrected);
 assert.notEqual(corrected.object_id,targetId);assert.ok(Math.abs(Number(corrected.d_spacing)-Number(oldMeasurement.d_spacing))>1e-8);
 const correctedIds=oldIds.map(id=>id===targetId?text(corrected.object_id):id);
 const revisedAtlas=await data('image_spatial_atlas',{...atlasParameters,previous_atlas_id:atlas.object_id,measurement_overrides:[{region_index:0,measurement_object_ids:correctedIds}]});remember('image',revisedAtlas);
 const revisedRegions=rows(revisedAtlas.regions);assert.deepEqual(revisedRegions.map(r=>r.fft_object_id),fftIds);assert.ok(revisedRegions.every(r=>r.fft_reused===true));
 assert.deepEqual(revisedRegions[1].measurement_object_ids,regions[1].measurement_object_ids);assert.deepEqual(revisedRegions[1].measurements,regions[1].measurements);
 const revisedReviewReply=await call('image_discovery_review',{object_id:discovery.object_id,candidate_id:candidates[0].candidate_id,evidence_ids:[regions[0].fft_object_id,...correctedIds],previous_review_id:reviews[0].object_id,observation_text:'Only one explicitly corrected frequency anchor changed. Retain original FFT, all other measurements and the unchanged neighboring ROI review.'});
 const revisedReview=revisedReviewReply.data;saveImage('revised-review-a',revisedReviewReply.png);remember('image',revisedReview);assert.equal(rows(revisedReview.history).at(-1)!.object_id,reviews[0].object_id);
 const revisedReply=await call('structure_general_compare',{...comparisonParameters,domains:domains(revisedAtlas),previous_evidence_id:comparison.object_id,revision_note:'One explicit synthetic operator peak-anchor correction; source/ROIs/calibration and complex spectra unchanged.'});
 const revisedComparison=revisedReply.data;saveImage('revised-general-evidence',revisedReply.png);remember('structure',revisedComparison);
 assert.deepEqual(rows(revisedComparison.candidate_pairs).map(c=>c.status),['compatible','incompatible']);
 const oldB=rows(rows(comparison.candidate_pairs)[0].sides)[1];
 const newB=rows(rows(revisedComparison.candidate_pairs)[0].sides)[1];assert.deepEqual(newB.matched,oldB.matched);assert.deepEqual(newB.unmatched_experimental,oldB.unmatched_experimental);
 unchanged(beforeRevision);assert.deepEqual(science(),protectedScience);assert.deepEqual(counts(),{fft:2,simulate:2,full_fields:0});
 checks.push('One explicit anchor is remeasured, both unchanged FFT IDs/hashes are reused through atlas revision, other measurement IDs/values and neighboring manual review remain unchanged. General comparison children are new lightweight match records, not new FFTs or simulations.');
 await assert.rejects(data('structure_general_compare',{...comparisonParameters,request_id:comparison.request_id,max_residual_inv_angstrom:.006}),/REQUEST_CONFLICT/);
 let wrongRoiError='';try{await data('image_discovery_review',{object_id:discovery.object_id,candidate_id:candidates[0].candidate_id,evidence_ids:[regions[1].fft_object_id],observation_text:'Deliberate wrong-ROI binding control.'});}catch(error){wrongRoiError=error instanceof Error?error.message:String(error);}assert.match(wrongRoiError,/DISCOVERY_SCOPE_MISMATCH/);const wrongRoiRequest=text(calls.at(-1)!.request_id);
 const nextScale=await data('image_calibrate',{object_id:calibrated.object_id,scope:'image',xy_scale:{x:.026,y:-.025,unit:'nm'},source_text:'Deliberate synthetic scale-revision guard control; old physical observations must not masquerade as current.'});
 await assert.rejects(data('structure_general_compare',{...comparisonParameters,current_spatial_image_object_id:nextScale.object_id}),/MEASUREMENT_SCOPE_MISMATCH/);
 assert.deepEqual(counts(),{fft:2,simulate:2,full_fields:0});unchanged(beforeRevision);
 const exportResult=await data('image_export',{object_id:revisedReview.object_id,output_dir:path.join(directory,'manual-review-export')});
 for(const [name,digest] of Object.entries(row(exportResult.exported_files_sha256)))assert.equal(hash(path.join(text(exportResult.output_dir),name)),digest);
 for(let i=0;i<fftIds.length;i++){
  const exported=await data('image_export',{object_id:fftIds[i],output_dir:path.join(directory,'fft-export-'+i)});
  assert.equal(hash(path.join(text(exported.output_dir),'data.npy')),hash(path.join(images,'objects',fftIds[i],'data.npy')));
 }
 const numericInput=path.join(directory,'independent-input.json');writeFileSync(numericInput,JSON.stringify({source:fixture.source_path,frame_path:frame.array_path,rects,fft_paths:fftIds.map(id=>path.join(images,'objects',id,'data.npy'))},null,2)+'\n');
 const independent=row(JSON.parse(py(String.raw`
import sys,json,numpy as np,tifffile
p=json.load(open(sys.argv[1],encoding='utf-8'));source=tifffile.imread(p['source']);saved=np.load(p['frame_path'],allow_pickle=False)
assert source.dtype==saved.dtype==np.dtype('float32') and np.array_equal(source,saved)
errors=[]
for rect,file in zip(p['rects'],p['fft_paths']):
 x0,y0,x1,y1=rect;v=source[y0:y1,x0:x1].astype(float);v-=v.mean();h,w=v.shape
 ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
 expected=np.roll(np.roll(ey@v@ex.T,h//2,0),w//2,1);actual=np.load(file,allow_pickle=False)
 error=float(np.max(np.abs(expected-actual)));assert error<1e-7,error;errors.append(error)
print(json.dumps({'result':'PASS','source_array_equal':True,'all_bin_direct_dft_max_errors':errors,'unchanged_tolerance':1e-7}))
`,[numericInput])));
 const beforeRecovery=immutable(),fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of recovery){const restored=await data(saved.provider==='structure'?'structure_result':'image_result',{request_id:saved.request_id},fresh);assert.equal(restored.object_id,saved.object_id);}
 let recoveredWrongRoi='';try{await data('image_result',{request_id:wrongRoiRequest},fresh);}catch(error){recoveredWrongRoi=error instanceof Error?error.message:String(error);}assert.equal(recoveredWrongRoi,wrongRoiError);
 assert.deepEqual(immutable(),beforeRecovery);assert.deepEqual(science(),protectedScience);assert.deepEqual(counts(),{fft:2,simulate:2,full_fields:0});
 for(const [file,digest] of Object.entries(row(fixture.source_sha256)))assert.equal(hash(file),digest);
 const copies:Row[]=[];
 for(const [label,saved] of [['comparison',comparison],['revised-comparison',revisedComparison]] as const){for(const name of ['comparisons.json','observation-bindings.json','qualification.json','reflections.csv','preview.png','object.json']){const source=path.join(structures,'objects',text(saved.object_id),name),target=path.join(directory,label+'-'+name);copyFileSync(source,target);assert.equal(hash(target),hash(source));copies.push({source,target,sha256:hash(target)});}}
 report.discovery=discovery;report.atlas=atlas;report.manual_reviews=reviews;report.comparison=comparison;
 report.revision={measurement:corrected,atlas:revisedAtlas,review_a:revisedReview,unchanged_review_b:reviews[1].object_id,comparison:revisedComparison,delta_cycles_per_pixel:.0005};
 report.references={source_path:fixture.source_path,image_source:opened.object_id,frame:frame.object_id,calibrated_frame:calibrated.object_id,discovery:discovery.object_id,atlas:atlas.object_id,ffts:fftIds,manual_reviews:reviews.map(r=>r.object_id),models:Object.fromEntries(Object.entries(models).map(([k,v])=>[k,v.object_id])),simulations:Object.fromEntries(Object.entries(simulations).map(([k,v])=>[k,v.object_id])),comparison:comparison.object_id,revised_atlas:revisedAtlas.object_id,revised_comparison:revisedComparison.object_id};
 report.independent_numeric=independent;report.refusals={wrong_roi:wrongRoiError,wrong_roi_original_request:wrongRoiRequest,failed_request_recovered_identically:true,stale_calibration_refused:true};report.evidence_copies=copies;
 report.integrity={counts:counts(),protected_scientific_files:Object.keys(protectedScience).length,old_files_preserved:Object.keys(beforeRevision).length,recovery_files_unchanged:Object.keys(beforeRecovery).length,source_sha256:fixture.source_sha256,recovery};
 checks.push('Actual FCC shared-orientation diffsims tables agree with independent HKL/q, correct candidate fits and wrong metric candidate refuses geometrically; all results remain hypotheses, not a unique material or twin identification.');
 checks.push('Conflicting original ID, foreign-ROI evidence and stale calibration refuse. A fresh MCP client recovers original successful and failed outcomes without adding scientific computation or altering original records.');
 checks.push('Source/frame arrays equal the TIFF, both spectra match independent finite DFT, scientific NPY and scientific evidence copies match saved bytes; display gamma never changes scientific arrays.');
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.runtime_ms=performance.now()-started;throw error;}
finally{writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');for(const client of clients)await client.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;console.log(text(report.result)+': retained at '+path.join(directory,'report.json'));}
