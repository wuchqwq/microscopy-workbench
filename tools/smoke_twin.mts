// Actual public F3b MCP/Python handoff; analytic image, no specimen/model/GUI/DM.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Data=Record<string,unknown>;
const record=(value:unknown):Data=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Data;};
const rows=(value:unknown):Data[]=>{assert.ok(Array.isArray(value));return value.map(record);};
const identifier=(value:unknown):string=>{assert.equal(typeof value,'string');assert.match(value as string,/^[a-f0-9]{32}$/);return value as string;};
const vectors=(value:unknown):number[][]=>{assert.ok(Array.isArray(value));return value.map(row=>{assert.ok(Array.isArray(row));assert.ok(row.every(v=>typeof v==='number'&&Number.isFinite(v)));return row as number[];});};
const png=(value:unknown)=>{assert.equal(typeof value,'string');assert.equal(Buffer.from(value as string,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const closeVector=(actual:number[],expected:number[],tolerance:number)=>{assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=tolerance,`${actual} != ${expected}`);};
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'sigma3-twin-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(code:string,args:string[]=[]):string=>{
 const reply=spawnSync(candidate,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});
 if(reply.error)throw reply.error;assert.equal(reply.status,0,reply.stderr);return reply.stdout.trim();
};
const python=execute('import sys;print(sys.executable)'),workspaceRoot=path.join(directory,'workspace');
const imageWorkspace=path.join(workspaceRoot,'images'),structureWorkspace=path.join(workspaceRoot,'structures');
const fixture=record(JSON.parse(execute(String.raw`
import sys,json,runpy
module=runpy.run_path(sys.argv[1]);print(json.dumps(module['create_fixture'](sys.argv[2])))
`,[path.join(repo,'tests','fixtures','twin_f3b','create_fixture.py'),path.join(directory,'fixture')])));
const truth=record(fixture.truth_data),versions=JSON.parse(execute(String.raw`
import sys,json,importlib.metadata,numpy,scipy,ase,tifffile
print(json.dumps(dict(python=sys.version,numpy=numpy.__version__,scipy=scipy.__version__,ase=ase.__version__,tifffile=tifffile.__version__,diffsims=importlib.metadata.version('diffsims'))))
`)) as unknown;
const sourceFiles=['image','fcc_cif','diamond_cif'].map(key=>String(fixture[key]));
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(file)]));
const config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python,structure_python:python,workspace_root:workspaceRoot,structures:true},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace:imageWorkspace,python,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const clients=[makeClient()],first=clients[0],started=performance.now(),timings:Data[]=[],checks:string[]=[];
let serial=0;
const call=async(name:string,args:Data={},client=first)=>{
 const readOnlyWithoutRequest=['structure_info','image_info','structure_twin_evidence'].includes(name);
 const request_id=typeof args.request_id==='string'?args.request_id:readOnlyWithoutRequest?undefined:`twin-smoke-${++serial}`,start=performance.now();
 console.log('MCP '+name+' '+request_id);
 try{return await client.tool(name,request_id===undefined?args:{...args,request_id});}finally{timings.push({tool:name,request_id,elapsed_ms:performance.now()-start});}
};
const data=async(name:string,args:Data={},client=first)=>record((await call(name,args,client)).data);
const objects=(workspace:string)=>existsSync(path.join(workspace,'objects'))?readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json'))):[];
const metadata=(workspace:string,id:string)=>record(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')));
const allFiles=(workspace:string,id:string)=>Object.fromEntries(readdirSync(path.join(workspace,'objects',id)).map(name=>[name,hash(path.join(workspace,'objects',id,name))]));
const counts=()=>({image_objects:objects(imageWorkspace).length,structure_objects:objects(structureWorkspace).length,
 image_requests:existsSync(path.join(imageWorkspace,'requests'))?readdirSync(path.join(imageWorkspace,'requests')).length:0,
 structure_requests:existsSync(path.join(structureWorkspace,'requests'))?readdirSync(path.join(structureWorkspace,'requests')).length:0,
 ffts:objects(imageWorkspace).filter(id=>metadata(imageWorkspace,id).kind==='fft').length,
 simulations:objects(structureWorkspace).filter(id=>metadata(structureWorkspace,id).kind==='simulate').length});
const report:Data={started_utc:new Date().toISOString(),scope:'Actual public stdio MCP and independent ASE/diffsims/image provider; finite synthetic Sigma3 projected geometry, source binding, immutable revision and recovery',
 versions,oracle:truth,checks,timings,not_tested:['real specimen or material identification','unique three-dimensional twin or atomic coherence','HRTEM contrast or intensity interpretation','browser/GUI gestures','fresh ordinary model comprehension','cancellation/lost-response/interrupted-worker injection','native DM/GMS/vendor/hardware','all twin systems or orientation search']};
const registration={rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'Declared common synthetic laboratory frame after independently supplied signed XY calibration; no rotation, scale, screen parity or domain-B fit'};
const assertFlags=(saved:Data)=>{
 assert.equal(saved.interpretation_status,'hypothesized');assert.equal(saved.twin_confirmed,false);assert.equal(saved.phase_identified,false);
 assert.equal(saved.unique_3d_twin,false);assert.equal(saved.atomic_coherence_verified,false);assert.equal(saved.intensity_comparison_performed,false);
 assert.equal(saved.fft_recomputed,false);assert.equal(saved.simulation_recomputed,false);assert.equal(saved.source_arrays_modified,false);
};
try{
 await first.rpc('initialize');
 const catalog=rows(record(record(await first.rpc('tools/list')).result).tools);
 for(const name of ['structure_twin_orient','structure_twin_compare','structure_twin_evidence','image_spatial_field'])assert.ok(catalog.some(tool=>tool.name===name),name);
 writeFileSync(path.join(directory,'twin-catalog.json'),JSON.stringify(catalog.filter(tool=>String(tool.name).startsWith('structure_twin_')),null,2));
 const opened=await data('image_open',{source_path:fixture.image}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0});
 const scale=truth.source_xy_scale_nm as number[];
 const calibrated=await data('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:scale[0],y:scale[1],unit:'nm'},source_text:'Public analytic cosine fixture; declared anisotropic signed source sampling, not instrument calibration'});
 const field=await data('image_spatial_field',{object_id:calibrated.object_id,window_sizes:[128],stride_xy:[128,128],max_windows:2,coordinate_domain:'physical',window:'none',subtract_mean:true,max_peaks:12,max_size:512,
  peak_options:{min_separation_bins:1,exclude_dc_radius_bins:1,threshold_rel:.2,refinement:'none'}});
 const samples=rows(field.samples);assert.equal(samples.length,2);assert.equal(counts().ffts,2);
 const expectedSets=[vectors(truth.parent_q_xy_cycles_per_nm),vectors(truth.child_q_xy_cycles_per_nm)];
 const domains=samples.map((sample,index)=>{
  const ids=sample.measurement_object_ids;assert.ok(Array.isArray(ids));assert.equal(ids.length,8,'Four real cosine families must retain both partners');
  const observed=ids.map(id=>{const measured=metadata(imageWorkspace,identifier(id));return {id:identifier(id),q:measured.physical_vector_xy as number[]};});
  const expected=expectedSets[index].flatMap(q=>[q,q.map(v=>-v)]);
  for(const measured of observed){const distances=expected.map(q=>Math.hypot(q[0]-measured.q[0],q[1]-measured.q[1]));assert.ok(Math.min(...distances)<=1e-10,JSON.stringify(measured));}
  for(const q of expected)assert.ok(observed.some(measured=>Math.hypot(q[0]-measured.q[0],q[1]-measured.q[1])<=1e-10));
  return {field_object_id:field.object_id,rect_xyxy:sample.rect_xyxy,current_image_object_id:sample.view_object_id??sample.fft_object_id,measurement_object_ids:ids};
 });
 const fftIds=samples.map(sample=>identifier(sample.fft_object_id)),fftBefore=fftIds.map(id=>allFiles(imageWorkspace,id));
 const frameBase=identifier(frame.object_id),frameBefore=allFiles(imageWorkspace,frameBase);
 checks.push('Actual spatial_field saved two exact128 ROIs and two FFTs; all8 peak measurements per ROI independently match the signed anisotropic analytic q oracle, including Friedel partners.');
 const structure=await data('structure_open',{source_path:fixture.diamond_cif});
 const parent=await data('structure_orient',{object_id:structure.object_id,zone_axis_uvw:[1,-1,0],in_plane_direction_uvw:[1,1,-2]});
 const child=await data('structure_twin_orient',{object_id:structure.object_id,orientation_id:parent.object_id,plane_hkl:[1,1,1],candidate_basis:'Explicit public diamond8 conventional-cell Sigma3 60degree about111 candidate; no image-derived phase assignment'});
 const expectedMatrix=vectors(truth.child_matrix_source_to_lab),actualMatrix=vectors(record(child.orientation).rotation_matrix_cartesian);
 actualMatrix.forEach((row,i)=>closeVector(row,expectedMatrix[i],2e-12));
 const simulationOptions={object_id:structure.object_id,voltage_kv:200,reciprocal_radius_inv_angstrom:.9,max_excitation_error_inv_angstrom:.02,size:64,sigma_pixels:1,with_direct_beam:false,native_float32:false};
 const parentSim=await data('structure_simulate',{...simulationOptions,orientation_id:parent.object_id});
 const childSim=await data('structure_simulate',{...simulationOptions,orientation_id:child.object_id});
 for(const [saved,hkls,qValues] of [[parentSim,truth.parent_hkls,truth.parent_q_xy_inv_angstrom],[childSim,truth.child_hkls,truth.child_q_xy_inv_angstrom]] as const){
  const reflection=record(saved.reflections),indices=vectors(reflection.hkl),coordinates=vectors(reflection.coordinates_inv_angstrom),expectedHkls=vectors(hkls),expectedQ=vectors(qValues);
  for(let i=0;i<expectedHkls.length;i++){const position=indices.findIndex(row=>JSON.stringify(row)===JSON.stringify(expectedHkls[i]));assert.ok(position>=0,'Analytic allowed HKL absent from actual diffsims: '+expectedHkls[i]);closeVector(coordinates[position],[...expectedQ[i],0],2e-12);}
 }
 assert.equal(counts().simulations,2);
 checks.push('Actual pinned diffsims parent/twin runs separately use the same diamond8 source and identical parameters; hard-coded matrices/HKL/q independently match both authoritative unrastered tables.');
 const line=await data('image_measure',{object_id:calibrated.object_id,coordinate_space:'source_pixels',points:truth.interface_trace_source_pixels});
 const common={object_id:child.object_id,parent_simulation_object_id:parentSim.object_id,twin_simulation_object_id:childSim.object_id,current_spatial_image_object_id:calibrated.object_id,domains,registration,
  max_residual_inv_angstrom:.005,angular_tolerance_deg:1,interface_measurement_object_id:line.object_id,
  interface_projection_basis:'Public stacked source-frame horizontal seam, calibrated signed XY source-pixel line; declared orthographic beam+Z and coherent111 candidate; no observed atomic coherence'};
 const reply=await call('structure_twin_compare',common),main=record(reply.data),mainId=identifier(main.object_id);png(reply.png);assertFlags(main);
 writeFileSync(path.join(directory,'twin-preview.png'),Buffer.from(reply.png as string,'base64'));
 report.positive=main;
 assert.equal(record(main.projected_relation).status,'compatible',JSON.stringify(main.projected_relation));assert.equal(record(main.interface).status,'compatible',JSON.stringify(main.interface));assert.equal(main.status,'compatible');
 const mainBefore=allFiles(structureWorkspace,mainId),simulationIds=[identifier(parentSim.object_id),identifier(childSim.object_id)],simulationBefore=simulationIds.map(id=>allFiles(structureWorkspace,id));
 const beforeRevision=counts();
 const wrongLine=await data('image_measure',{object_id:calibrated.object_id,coordinate_space:'source_pixels',points:truth.wrong_interface_source_pixels});
 const revised=await data('structure_twin_compare',{...common,interface_measurement_object_id:wrongLine.object_id,previous_twin_comparison_id:mainId,revision_note:'Independent negative control changes only same-source saved interface trace to vertical; preserve compatible reflection relation and prior evidence'});
 assertFlags(revised);assert.notEqual(revised.object_id,mainId);assert.equal(record(revised.projected_relation).status,'compatible');assert.equal(record(revised.interface).status,'incompatible');assert.equal(revised.status,'incompatible');
 assert.ok(Math.abs(Number(record(revised.interface).unoriented_trace_residual_degrees)-90)<1e-10);
 assert.equal(record(revised.revision_history).previous_twin_comparison_id,mainId);assert.deepEqual(allFiles(structureWorkspace,mainId),mainBefore);
 assert.equal(counts().ffts,beforeRevision.ffts);assert.equal(counts().simulations,beforeRevision.simulations);
 checks.push('Actual compatible projected diamond Sigma3/trace hypothesis; immutable wrong-trace revision becomes interface-incompatible while retaining reflection compatibility, old evidence bytes, two FFTs and two simulations.');
 const beforeConflict=counts();
 await assert.rejects(data('structure_twin_compare',{...common,request_id:main.request_id,max_residual_inv_angstrom:.006}),/REQUEST_CONFLICT|REQUEST_ID_CONFLICT|different|conflict|already/i);
 assert.deepEqual(counts(),beforeConflict);
 checks.push('Reusing the original comparison request ID with changed bounds is refused without new scientific objects.');
 const beforeRecovery=counts(),fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of [child,parentSim,childSim,main,revised]){
  const recovered=await data('structure_result',{request_id:saved.request_id},fresh);assert.equal(recovered.object_id,saved.object_id);
  const inspected=await data('structure_info',{object_id:saved.object_id},fresh);assert.equal(inspected.object_id,saved.object_id);
 }
 for(const saved of [field,line,wrongLine])assert.equal((await data('image_result',{request_id:saved.request_id},fresh)).object_id,saved.object_id);
 assert.deepEqual(counts(),beforeRecovery);
 checks.push('A fresh MCP client recovers original candidate/simulation/comparison/field/line IDs and inspects saved inputs without adding FFTs, simulations or objects; no lost-response injection is claimed.');
 const beforePages=counts(),full=record(JSON.parse(readFileSync(path.join(structureWorkspace,'objects',mainId,'comparisons.json'),'utf8'))),paging:Data[]=[];
 for(const comparison of ['parent_domain','twin_domain']){
  const expected=rows(record(record(full.comparisons)[comparison]).unmatched_simulated),received:Data[]=[];
  assert.ok(expected.length>1,'The selected finite geometry leaves genuine predicted reflections unmatched');
  let offset=0;
  do{
   const page=await data('structure_twin_evidence',{object_id:mainId,comparison,section:'unmatched_simulated',offset,limit:offset===0?1:128},fresh);
   assert.equal(page.object_id,mainId);assert.equal(page.request_id,main.request_id);assert.equal(page.total,expected.length);assert.equal(page.offset,offset);
   received.push(...rows(page.rows));paging.push(page);
   if(page.next_offset===null)break;
   assert.equal(typeof page.next_offset,'number');assert.ok(Number(page.next_offset)>offset);offset=Number(page.next_offset);
  }while(offset<expected.length);
  assert.deepEqual(received,expected);
  assert.equal(Number(record(record(main.comparisons)[comparison]).unmatched_simulated_count),received.length);
 }
 assert.deepEqual(counts(),beforePages);report.unmatched_reflection_pages=paging;
 checks.push('Formal read-only structure_twin_evidence paginates both complete unmatched simulated reflection lists, exactly equals committed JSON, preserves the original request ID and creates no requests or scientific objects.');
 const exports:Data[]=[];
 for(const [label,saved] of [['positive',main],['wrong-trace-revision',revised]] as const){
  const id=identifier(saved.object_id),target=path.join(directory,label+'-evidence');mkdirSync(target);
  const original=allFiles(structureWorkspace,id);
  for(const name of Object.keys(original))copyFileSync(path.join(structureWorkspace,'objects',id,name),path.join(target,name));
  for(const name of ['comparisons.json','observation-bindings.json','reflections.csv','preview.png','object.json'])assert.ok(name in original,name);
  for(const [name,digest] of Object.entries(original))assert.equal(hash(path.join(target,name)),digest);
  const comparisons=record(JSON.parse(readFileSync(path.join(target,'comparisons.json'),'utf8')));assert.equal(comparisons.status,saved.status);
  const csv=readFileSync(path.join(target,'reflections.csv'),'utf8');assert.match(csv,/measurement_object_id/);assert.match(csv,/matched_hypothesis/);
  for(const receipt of rows(saved.fixed_input_receipts))assert.equal(hash(String(receipt.original_path)),receipt.sha256);
  exports.push({label,object_id:id,directory:target,files_sha256:original,scope:'Exact copies of committed provider JSON/CSV/PNG/input receipts; no separate scientific recomputation or new export API'});
 }
 for(let i=0;i<fftIds.length;i++)assert.deepEqual(allFiles(imageWorkspace,fftIds[i]),fftBefore[i]);
 for(let i=0;i<simulationIds.length;i++)assert.deepEqual(allFiles(structureWorkspace,simulationIds[i]),simulationBefore[i]);
 assert.deepEqual(allFiles(imageWorkspace,frameBase),frameBefore);assert.deepEqual(allFiles(structureWorkspace,mainId),mainBefore);
 for(const [file,digest] of Object.entries(sourceHashes))assert.equal(hash(file),digest);
 assert.equal(counts().ffts,2);assert.equal(counts().simulations,2);
 report.source_integrity={source_sha256:sourceHashes,source_frame_unchanged:true,fft_files:fftBefore,simulation_files:simulationBefore,prior_comparison_unchanged:true,counts:counts()};
 report.references={image_source:opened.object_id,source_frame:frame.object_id,calibrated_frame:calibrated.object_id,field:field.object_id,ffts:fftIds,structure:structure.object_id,parent_orientation:parent.object_id,twin_orientation:child.object_id,simulations:simulationIds,comparison:mainId,wrong_trace_revision:revised.object_id};
 report.revision=revised;report.exports=exports;report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
 console.log('PASS: actual public F3b MCP/Python, independent analytic q/HKL, separate pinned simulations, source/ROI/line binding, wrong-trace revision, request conflict, immutable recovery and evidence copies.');
}catch(caught){report.result='FAIL';report.error=caught instanceof Error?caught.stack:String(caught);report.runtime_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw caught;}
finally{
 for(const client of clients)await client.close();
 if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
 console.log('Retained evidence: '+path.join(directory,'report.json'));
}
