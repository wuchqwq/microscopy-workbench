// Opt-in actual MCP save/read/recover chain for additive Route A semantics.
// Independent public cosine/impulse fixtures; no Agent, browser or specimen claim.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const rows=(v:unknown):Row[]=>{assert.ok(Array.isArray(v));return v.map(row);};
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const numbers=(v:unknown):number[]=>{assert.ok(Array.isArray(v)&&v.every(x=>typeof x==='number'&&Number.isFinite(x)));return v as number[];};
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const dump=(file:string,value:unknown)=>writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const root=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'result-semantics-'));
const executable=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const py=(code:string,args:string[]=[])=>{const result=spawnSync(executable,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const python=py('import sys;print(sys.executable)');
const fixture=row(JSON.parse(py(String.raw`
import sys,json,hashlib,numpy as np,tifffile
from pathlib import Path
p=Path(sys.argv[1]);p.mkdir();y,x=np.indices((64,64));q=[[.125,0],[0,-.125],[.125,-.125]]
a=100+6*np.cos(2*np.pi*x/8)+5*np.cos(2*np.pi*y/8)+4*np.cos(2*np.pi*(x-y)/8)
sources={}
for name,values in [('two_rois',np.concatenate([a,a],axis=1)),('one_direction',100+6*np.cos(2*np.pi*x/8))]:
 f=p/(name+'.tiff');tifffile.imwrite(f,values.astype('float32'),photometric='minisblack',metadata=None);sources[name]=str(f)
impulse=np.full((63,63),100,dtype=np.float32);impulse[17,29]=101
f=p/'constant_plus_impulse.tiff';tifffile.imwrite(f,impulse,photometric='minisblack',metadata=None);sources['impulse']=str(f)
models={}
for label,cell in [('cell4',4.),('cell3_2',3.2)]:
 lines=['data_candidate',f'_cell_length_a {cell}',f'_cell_length_b {cell}',f'_cell_length_c {cell}',
 '_cell_angle_alpha 90','_cell_angle_beta 90','_cell_angle_gamma 90',"_space_group_name_H-M_alt 'P 1'",'loop_',
 '_atom_site_label','_atom_site_type_symbol','_atom_site_fract_x','_atom_site_fract_y','_atom_site_fract_z','_atom_site_occupancy']
 lines += [f'Cu{i+1} Cu {u} {v} {w} 1' for i,(u,v,w) in enumerate([[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]])]
 f=p/(label+'.cif');f.write_text('\n'.join(lines)+'\n');models[label]=str(f)
truth={'scope':'Independent prescribed image frequencies and conventional cubic geometry, not an HRTEM or material truth',
 'source_paths':sources,'model_paths':models,'q_cycles_per_pixel':q,'q_inv_angstrom':[[.5,0],[0,.5],[.5,.5]],
 'hkls':[[2,0,0],[0,2,0],[2,2,0]],'signed_scale_nm':[.025,-.025],
 'fixed_parameters':{'window':'none','subtract_mean':True,'max_peaks':8,'threshold_rel':.2,'refinement':'none',
 'comparison_tolerance_inv_angstrom':.005,'local_tolerance_cycles_per_pixel':.000001},
 'source_sha256':{str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.iterdir() if f.is_file()}}
(p/'truth.json').write_text(json.dumps(truth,indent=2)+'\n');print(json.dumps(truth))
`,[path.join(directory,'fixture')])));
const workspaceRoot=path.join(directory,'workspace'),images=path.join(workspaceRoot,'images'),structures=path.join(workspaceRoot,'structures');
const config=path.join(directory,'plugin-config.json');
const writeConfig=(target:string,workspace:string)=>dump(target,{schema_version:1,python,structure_python:python,workspace_root:workspace,structures:true});
writeConfig(config,workspaceRoot);
const originalConfig=process.env.MICROSCOPY_PLUGIN_CONFIG,clients:StdioImageClient[]=[];
const makeClient=(targetConfig=config,workspace=images)=>{process.env.MICROSCOPY_PLUGIN_CONFIG=targetConfig;const client=new StdioImageClient({workspace,python,serverPath:path.join(root,'tools/plugin_server.mjs')});clients.push(client);return client;};
const first=makeClient(),started=performance.now(),calls:Row[]=[],checks:string[]=[],saved:Row[]=[];
let serial=0;
const call=async(name:string,args:Row={},client=first)=>{
 const readOnly=['image_info','image_result','structure_info','structure_result'].includes(name);
 const requestId=typeof args.request_id==='string'?args.request_id:readOnly?undefined:'result-semantics-'+(++serial);
 const parameters=requestId===undefined?args:{...args,request_id:requestId};
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before_dispatch',tool:name,request_id:requestId??null,arguments:parameters})+'\n');
 console.log('MCP '+name+' '+(requestId??'read-only'));
 const start=performance.now();let outcome='failed_or_unknown';
 try{const reply=await client.tool(name,parameters),value=row(reply.data);assert.equal(value.backend,name.startsWith('structure_')?'external-structure-workspace':'external-image-workspace');outcome='completed';
  if(reply.png!==undefined){assert.equal(Buffer.from(text(reply.png),'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
  appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'after_dispatch',tool:name,request_id:requestId??null,object_id:value.object_id,data:value,image_block:reply.png!==undefined})+'\n');return value;
 }finally{calls.push({tool:name,request_id:requestId??null,outcome,elapsed_ms:performance.now()-start});}
};
const walk=(dir:string):string[]=>!existsSync(dir)?[]:readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);
const runtimeInventory=()=>Object.fromEntries(['tools','lib','crystallography'].flatMap(n=>walk(path.join(root,n))).filter(f=>/\.(py|mjs)$/.test(f)).map(f=>[path.relative(root,f),hash(f)]));
const runtimeBefore=runtimeInventory();dump(path.join(directory,'runtime-before-sha256.json'),runtimeBefore);
const git=spawnSync('git',['-C',process.cwd(),'rev-parse','HEAD','HEAD^{tree}'],{encoding:'utf8'});
const sourceReference=git.status===0?git.stdout.trim().split('\n'):null;
const inventory=(workspace:string)=>Object.fromEntries(['objects','requests'].flatMap(n=>walk(path.join(workspace,n))).map(f=>[f,hash(f)]));
const unchanged=(snapshot:Record<string,string>)=>{for(const [f,digest] of Object.entries(snapshot))assert.equal(hash(f),digest,'Changed historical file: '+f);};
const metadata=(workspace:string,id:unknown)=>row(JSON.parse(readFileSync(path.join(workspace,'objects',text(id),'object.json'),'utf8')));
const aspect=(value:Row,layer:string,name:string)=>{const semantics=row(value.result_semantics),section=row(semantics[layer]),entries=rows(section[layer==='numerical'?'checks':'assessments']);const found=entries.find(r=>r.aspect===name);assert.ok(found,'Missing scoped assessment '+name);return found;};
const semantics=(value:Row,provider='image')=>{
 const s=row(value.result_semantics);assert.equal(s.version,1);assert.equal(s.scope,'candidate_measurement_and_assisted_interpretation');assert.equal(row(s.numerical).execution,'completed');
 for(const name of ['noise_significance','localization_uncertainty','resolvability','parameter_sensitivity'])assert.equal(aspect(value,'measurement_reliability',name).status,'not_assessed');
 const own=metadata(provider==='image'?images:structures,value.object_id);assert.deepEqual(own.result_semantics,s);
 for(const [layer,key] of [['numerical','checks'],['measurement_reliability','assessments'],['interpretation','assessments']])for(const item of rows(row(s[layer])[key])){
  assert.ok(['satisfied','issues_detected','not_assessed','insufficient_evidence'].includes(text(item.status)));
  assert.ok(Array.isArray(item.source_fields));for(const field of item.source_fields){let current:unknown=own;for(const part of text(field).split('.')){assert.ok(current&&typeof current==='object'&&!Array.isArray(current)&&Object.hasOwn(current,part));current=row(current)[part];}}
 }
 assert.ok(Buffer.byteLength(JSON.stringify(s))<=24*1024);
 saved.push({provider,object_id:value.object_id,request_id:value.request_id,result_semantics:s,legacy_status:value.status??null});return value;
};
const frame=async(source:unknown)=>{const opened=await call('image_open',{source_path:source});assert.equal(Object.hasOwn(opened,'result_semantics'),false);const f=await call('image_frame',{object_id:opened.object_id,frame_index:0});assert.equal(Object.hasOwn(f,'result_semantics'),false);return f;};
const atlasSettings={rects:[[0,0,64,64],[64,0,128,64]],window:'none',subtract_mean:true,max_peaks:8,max_size:256,peak_options:{min_separation_bins:2,exclude_dc_radius_bins:2,threshold_rel:.2,refinement:'none'}};
const report:Row={schema_version:1,scope:'Actual compiled MCP/Python save/read/recover of scoped result semantics on public synthetic data',started_utc:new Date().toISOString(),runtime_root:root,source_reference_head_tree:sourceReference,source_reference_scope:'Git reference only; actual executed files are independently hashed in runtime-before-sha256.json, including any uncommitted build inputs.',fixture,calls,checks,saved,
 not_tested:['actual runtime Agent judgments','browser gestures or GUI visibility','private/real specimen accuracy','calibrated noise false-discovery probability','GPA/topology/twin execution in this bounded smoke','old structure-provider record compatibility in this bounded smoke']};
try{
 await first.rpc('initialize');
 const catalog=rows(row(row(await first.rpc('tools/list')).result).tools);
 for(const name of ['image_fft','image_peaks','image_measure','image_peak_measurements','image_spatial_atlas','image_feature_field','image_local_signature_compare','structure_register','structure_compare','structure_general_compare'])assert.ok(catalog.some(v=>v.name===name));
 const input=await frame(row(fixture.source_paths).two_rois);
 const fft=semantics(await call('image_fft',{object_id:input.object_id,rect:[0,0,64,64],window:'none',subtract_mean:true}));
 assert.equal(aspect(fft,'numerical','finite_fft').status,'satisfied');
 const peaks=semantics(await call('image_peaks',{object_id:fft.object_id,max_peaks:8,min_separation_bins:2,exclude_dc_radius_bins:2,threshold_rel:.2,refinement:'none'}));
 assert.equal(rows(peaks.peak_table).length,6);assert.equal(aspect(peaks,'numerical','global_numerical_contrast').status,'satisfied');assert.equal(aspect(peaks,'interpretation','peak_candidates').status,'not_assessed');
 const measured=semantics(await call('image_measure',{object_id:fft.object_id,coordinate_space:'frequency_cycles_per_pixel',points:[[0,0],[.125,0]]}));
 assert.equal(measured.pixel_period,8);assert.equal(aspect(measured,'numerical','physical_coordinate_availability').status,'insufficient_evidence');
 const bulk=semantics(await call('image_peak_measurements',{object_id:peaks.object_id,max_peaks:8}));assert.equal(rows(bulk.measurements).length,6);
 const atlas=semantics(await call('image_spatial_atlas',{...atlasSettings,object_id:input.object_id}));
 const beforeFeature=inventory(images);
 const field=semantics(await call('image_feature_field',{object_id:atlas.object_id,coordinate_domain:'pixel',display_feature:'family_count',max_size:256}));
 assert.ok(rows(field.samples).every(s=>s.status==='valid'));assert.equal(aspect(field,'numerical','multidirection_descriptor_admission').status,'satisfied');assert.equal(aspect(field,'interpretation','structure_descriptor').status,'not_assessed');unchanged(beforeFeature);
 const local=semantics(await call('image_local_signature_compare',{object_id:atlas.object_id,reference_index:0,target_indices:[1],angles_degrees:[0],coordinate_domain:'pixel',tolerance:.000001}));
 assert.equal(rows(local.relations)[0].status,'compatible_signature');assert.equal(aspect(local,'interpretation','finite_signature_comparison').status,'satisfied');
 const absentScale=semantics(await call('image_local_signature_compare',{object_id:atlas.object_id,reference_index:0,target_indices:[1],angles_degrees:[0],coordinate_domain:'physical',tolerance:.000001}));
 assert.equal(rows(absentScale.relations)[0].status,'insufficient_evidence');assert.equal(aspect(absentScale,'interpretation','finite_signature_comparison').status,'insufficient_evidence');
 const display=await call('image_preview',{object_id:peaks.object_id,gamma:1.3,max_size:256});assert.equal(Object.hasOwn(display,'result_semantics'),false,'Display-only publication must not inherit peak assessment');
 checks.push('Actual FFT/peak/individual+bulk measurement/atlas/feature/local-comparison objects save scoped v1 semantics; unassessed noise/localization/resolution remain unknown; physical-only insufficiency leaves pixel period 8 available; display-only preview does not inherit a fresh assessment.');
 const single=await frame(row(fixture.source_paths).one_direction),singleAtlas=semantics(await call('image_spatial_atlas',{...atlasSettings,object_id:single.object_id,rects:[[0,0,64,64]]}));
 const singleField=semantics(await call('image_feature_field',{object_id:singleAtlas.object_id,coordinate_domain:'pixel',display_feature:'shortest_period',max_size:256}));
 const one=rows(singleField.samples)[0];assert.equal(one.status,'insufficient_evidence');const family=rows(row(one.features).families)[0];assert.equal(family.period,8);assert.equal(family.period_valid,true);assert.equal(aspect(singleField,'numerical','multidirection_descriptor_admission').status,'insufficient_evidence');
 const impulse=await frame(row(fixture.source_paths).impulse),impulseFft=semantics(await call('image_fft',{object_id:impulse.object_id,window:'none',subtract_mean:false}));
 const impulsePeaks=semantics(await call('image_peaks',{object_id:impulseFft.object_id,max_peaks:16,min_separation_bins:16}));
 assert.deepEqual(impulsePeaks.peak_table,[]);assert.equal(aspect(impulsePeaks,'numerical','global_numerical_contrast').status,'insufficient_evidence');
 checks.push('Single-direction descriptor insufficiency preserves the independently prescribed 8-pixel period. Constant100+one101 impulse, 63x63, no window/no mean subtraction remains a completed FFT with no admitted peaks and explicit numerical-contrast insufficiency.');
 const calibrated=await call('image_calibrate',{object_id:input.object_id,scope:'image',xy_scale:{x:.025,y:-.025,unit:'nm'},source_text:'Public synthetic signed sampling for conventional cubic reciprocal geometry only; no experimental metrology qualification.'});
 const physicalAtlas=semantics(await call('image_spatial_atlas',{...atlasSettings,object_id:calibrated.object_id})),regions=rows(physicalAtlas.regions),simulations:Record<string,Row>={};
 for(const key of ['cell4','cell3_2']){
  const model=await call('structure_open',{source_path:row(fixture.model_paths)[key]}),orientation=await call('structure_orient',{object_id:model.object_id,zone_axis_uvw:[0,0,1],in_plane_direction_uvw:[1,0,0]});
  simulations[key]=await call('structure_simulate',{object_id:model.object_id,orientation_id:orientation.object_id,voltage_kv:200,reciprocal_radius_inv_angstrom:1,max_excitation_error_inv_angstrom:.02,size:64,sigma_pixels:1,with_direct_beam:false,native_float32:false});
 }
 const measureIds=regions[0].measurement_object_ids as string[],measurements=measureIds.map(id=>metadata(images,id));
 const locate=(q:number[])=>{const index=measurements.findIndex(m=>numbers(m.physical_vector_xy).every((v,i)=>Math.abs(v-10*q[i])<1e-10));assert.ok(index>=0,'Independent expected reciprocal vector was not measured');return index;};
 const correspondence=(q:number[],hkl:number[])=>({measurement_index:locate(q),hkl});
 const measurementPaths=measureIds.map(id=>path.join(images,'objects',id,'object.json'));
 const registration=semantics(await call('structure_register',{object_id:simulations.cell4.object_id,measurement_paths:measurementPaths,current_image_object_id:regions[0].view_object_id,experimental_kind:'real_space_fft',fit_correspondences:[correspondence([.5,0],[2,0,0]),correspondence([0,.5],[0,2,0])],validation_correspondences:[correspondence([.5,.5],[2,2,0])],screen_axes:{flip_y:false,basis:'Prescribed signed synthetic XY axes'},confirmation:{source:'synthetic_fixture',source_text:'Prescribed conventional cubic HKL geometry, not an experimentally confirmed assignment'},max_residual_inv_angstrom:.005}),'structure');
 assert.equal(registration.fit_status,'within_declared_tolerance');assert.equal(registration.validation_status,'insufficient_evidence');assert.equal(registration.held_out_validation_passed,null);assert.equal(aspect(registration,'numerical','registration_fit').status,'satisfied');assert.equal(aspect(registration,'measurement_reliability','held_out_geometry').status,'satisfied');
 const compared=semantics(await call('structure_compare',{object_id:simulations.cell4.object_id,measurement_paths:measurementPaths,current_image_object_id:regions[0].view_object_id,experimental_kind:'real_space_fft',registration_object_id:registration.object_id,max_residual_inv_angstrom:.005}),'structure');
 assert.equal(compared.comparison_status,'within_declared_geometric_tolerance');assert.equal(aspect(compared,'interpretation','finite_reciprocal_comparison').status,'satisfied');
 const pair=(key:string)=>({label:key,simulation_a_object_id:simulations[key].object_id,simulation_b_object_id:simulations[key].object_id,basis:'Finite public synthetic candidate geometry, not identified material'});
 const general=semantics(await call('structure_general_compare',{current_spatial_image_object_id:calibrated.object_id,domains:regions.map(r=>({field_object_id:physicalAtlas.object_id,rect_xyxy:r.rect,current_image_object_id:r.view_object_id,measurement_object_ids:r.measurement_object_ids})),experimental_kind:'real_space_fft',registration:{rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'One prescribed common Cartesian frame; no candidate-dependent fit'},max_residual_inv_angstrom:.005,candidates:[pair('cell4'),pair('cell3_2')]}),'structure');
 assert.deepEqual(rows(general.candidate_pairs).map(r=>r.status),['compatible','incompatible']);assert.equal(general.phase_identified,false);assert.equal(aspect(general,'interpretation','finite_projected_candidates').status,'satisfied');
 checks.push('Actual ASE/diffsims structure save/simulate/register/compare/general_compare preserves geometry-qualified fit separately from independent-validation insufficiency. Correct and wrong cell candidates remain finite geometric compatibility/conflict, not phase identification.');
 const numericalInput=path.join(directory,'direct-dft-input.json');dump(numericalInput,{source:row(fixture.source_paths).two_rois,fft:fft.array_path});
 report.independent_dft=JSON.parse(py(String.raw`
import json,sys,numpy as np,tifffile
p=json.load(open(sys.argv[1]));a=tifffile.imread(p['source'])[:64,:64].astype(float);a-=a.mean();n=64
E=np.exp(-2j*np.pi*np.outer(np.arange(n),np.arange(n))/n)
expected=np.roll(np.roll(E@a@E.T,n//2,0),n//2,1);actual=np.load(p['fft'],allow_pickle=False)
error=float(np.max(np.abs(expected-actual)));assert error<1e-7,error
print(json.dumps({'oracle':'direct separable finite DFT definition, not np.fft or Workbench FFT','maximum_absolute_error':error,'fixed_tolerance':1e-7}))
`,[numericalInput]));
 const beforeRecovery={...inventory(images),...inventory(structures)};dump(path.join(directory,'current-before-recovery-sha256.json'),beforeRecovery);
 const fresh=makeClient();await fresh.rpc('initialize');
 for(const item of saved){const recovered=await call(item.provider==='image'?'image_result':'structure_result',{request_id:item.request_id},fresh);assert.equal(recovered.object_id,item.object_id);assert.deepEqual(recovered.result_semantics,item.result_semantics);assert.equal(recovered.status??null,item.legacy_status);
  const read=await call(item.provider==='image'?'image_info':'structure_info',{object_id:item.object_id},fresh);assert.deepEqual(read.result_semantics,item.result_semantics);}
 assert.deepEqual({...inventory(images),...inventory(structures)},beforeRecovery);
 report.recovered_current_records=saved.length;
 const legacySource=process.env.MICROSCOPY_LEGACY_SOURCE;
 if(legacySource){
  assert.ok(path.isAbsolute(legacySource));const legacyWorkspace=path.join(directory,'legacy-workspace'),legacyImages=path.join(legacyWorkspace,'images');
  const legacy=row(JSON.parse(py(String.raw`
import sys,json,hashlib,subprocess
from pathlib import Path
source=Path(sys.argv[1]);sys.path.insert(0,str(source));from tools import image_workspace as worker
workspace=Path(sys.argv[2]);input_path=sys.argv[3];out=Path(sys.argv[4]);calls=[];saved=[]
def call(action,**p):
 req={'workspace':str(workspace),'action':action,'request_id':'old64-'+str(len(calls)+1),**p};calls.append(req)
 reply=worker.execute(req);assert reply['ok'],reply;record=reply['result'];assert 'result_semantics' not in record
 saved.append({'object_id':record['object_id'],'request_id':record['request_id'],'kind':record['kind'],'status':record.get('status')});return record
opened=call('open',source_path=input_path);f=call('frame',object_id=opened['object_id'],frame_index=0)
fft=call('fft',object_id=f['object_id'],rect=[0,0,64,64],window='none',subtract_mean=True)
peaks=call('peaks',object_id=fft['object_id'],max_peaks=8,threshold_rel=.2,refinement='none')
measure=call('measure',object_id=fft['object_id'],points=[[0,0],[.125,0]])
atlas=call('spatial_atlas',object_id=f['object_id'],rects=[[0,0,64,64],[64,0,128,64]],window='none',subtract_mean=True,max_peaks=8,peak_options={'threshold_rel':.2,'refinement':'none'})
field=call('feature_field',object_id=atlas['object_id'],coordinate_domain='pixel',display_feature='family_count',max_size=256)
compare=call('local_signature_compare',object_id=atlas['object_id'],reference_index=0,target_indices=[1],angles_degrees=[0],coordinate_domain='pixel',tolerance=.000001)
result={'source_root':str(source),'commit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD^{tree}'],text=True).strip(),
 'worker_sha256':hashlib.sha256(Path(worker.__file__).read_bytes()).hexdigest(),'saved':saved,'requests':calls,'fft_object_id':fft['object_id'],
 'producer_scope':'actual frozen Python worker publication; current compiled MCP performs the later reads, not a mock with removed fields'}
(out/'legacy-producer-record.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
`,[legacySource,legacyImages,text(row(fixture.source_paths).two_rois),directory])));
  assert.equal(legacy.commit,'7f0e523ba287de11c0913abd68f553655f008182','Only explicit frozen #64 producer is admitted by this compatibility test');
  const legacyBefore=inventory(legacyImages);dump(path.join(directory,'legacy-before-read-sha256.json'),legacyBefore);
  const legacyConfig=path.join(directory,'legacy-plugin-config.json');writeConfig(legacyConfig,legacyWorkspace);const reader=makeClient(legacyConfig,legacyImages);await reader.rpc('initialize');
  for(const item of rows(legacy.saved)){const recovered=await call('image_result',{request_id:item.request_id},reader),read=await call('image_info',{object_id:item.object_id},reader);for(const record of [recovered,read]){assert.equal(record.object_id,item.object_id);assert.equal(Object.hasOwn(record,'result_semantics'),false);assert.equal(record.status??null,item.status);}}
  assert.deepEqual(inventory(legacyImages),legacyBefore);
  const derived=await call('image_peaks',{object_id:legacy.fft_object_id,max_peaks:8,threshold_rel:.2,refinement:'none'},reader);assert.equal(row(derived.result_semantics).version,1);assert.deepEqual(metadata(legacyImages,derived.object_id).result_semantics,derived.result_semantics);unchanged(legacyBefore);
  const derivedRecovered=await call('image_result',{request_id:derived.request_id},reader);assert.deepEqual(derivedRecovered.result_semantics,derived.result_semantics);unchanged(legacyBefore);
  report.legacy={...legacy,files_unchanged: Object.keys(legacyBefore).length,read_via_current_mcp:true,new_child_object_id:derived.object_id,new_child_request_id:derived.request_id};
  dump(path.join(directory,'legacy-after-read-sha256.json'),inventory(legacyImages));checks.push('Actual frozen #64 worker produced missing-field FFT/peaks/measure/atlas/feature/local-comparison history; current formal MCP info/original-request recovery preserves absent fields and all bytes. A new child uses v1 semantics without rewriting the old FFT or original requests.');
 }else report.legacy={status:'NOT_TESTED',reason:'Set MICROSCOPY_LEGACY_SOURCE to the exact clean frozen #64 worktree to execute compatibility'};
 for(const [file,digest] of Object.entries(row(fixture.source_sha256)))assert.equal(hash(file),digest);
 const runtimeAfter=runtimeInventory();assert.deepEqual(runtimeAfter,runtimeBefore,'Compiled runtime files changed during acceptance');dump(path.join(directory,'runtime-after-sha256.json'),runtimeAfter);
 unchanged(beforeRecovery);dump(path.join(directory,'current-after-recovery-sha256.json'),{...inventory(images),...inventory(structures)});
 report.source_hashes_unchanged=fixture.source_sha256;report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.runtime_ms=performance.now()-started;throw error;}
finally{dump(path.join(directory,'report.json'),report);for(const client of clients)await client.close();if(originalConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=originalConfig;console.log(text(report.result)+': '+path.join(directory,'report.json'));}
