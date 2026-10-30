// Actual public MCP/Python topology handoff. Analytic texture, no private specimen/model/GUI/DM.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Data=Record<string,unknown>;
const record=(value:unknown):Data=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Data;};
const identifier=(value:unknown):string=>{assert.equal(typeof value,'string');assert.match(value as string,/^[a-f0-9]{32}$/);return value as string;};
const rows=(value:unknown):Data[]=>{assert.ok(Array.isArray(value));return value.map(record);};
const png=(value:unknown)=>{assert.equal(typeof value,'string');assert.equal(Buffer.from(value as string,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'projected-topology-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(code:string,args:string[]=[]):string=>{
 const reply=spawnSync(candidate,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});
 if(reply.error)throw reply.error;assert.equal(reply.status,0,reply.stderr);return reply.stdout.trim();
};
const python=execute('import sys;print(sys.executable)'),workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const versions=JSON.parse(execute('import sys,json,numpy,scipy,skimage;print(json.dumps(dict(python=sys.version,numpy=numpy.__version__,scipy=scipy.__version__,scikit_image=skimage.__version__)))')) as unknown;
const truth=record(JSON.parse(execute(String.raw`
import sys,json,pathlib,numpy as np,tifffile
sys.path.insert(0,sys.argv[1]);import create_topology_fixtures as fixture
d=pathlib.Path(sys.argv[2])
for name,case in [('positive',fixture.volterra_fixture()),('smoothnull',fixture.null_fixture())]:
 tifffile.imwrite(d/(name+'.tiff'),case['image'].astype(np.float32),metadata=None)
tifffile.imwrite(d/'nosignal.tiff',np.zeros((256,256),np.float32),metadata=None)
print(json.dumps(dict(g=fixture.G_VECTORS.tolist(),sigma=fixture.MASK_SIGMA,reference_rect=fixture.REFERENCE_RECT,loops=fixture.NESTED_LOOPS,expected_winding=[-1,0,-1],expected_b=[8,0],metric_nm_xy=[.02,-.035],oracle='Prescribed continuum u=[8,0]*atan2(y-128.5,x-128.5)/(2*pi), phi=-2*pi*g*u. Smooth single-valued displacement has zero continuum circulation; production topology solver not imported.')))
`,[path.join(repo,'tools'),directory])));
writeFileSync(path.join(directory,'oracle.json'),JSON.stringify(truth,null,2));
const config=path.join(directory,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workspaceRoot,structures:false},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const clients=[makeClient()],first=clients[0],started=performance.now();
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const objects=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json')));
const metadata=(id:string)=>record(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')));
const fftCount=()=>objects().filter(id=>metadata(id).kind==='fft').length;
const allFiles=(id:string)=>Object.fromEntries(readdirSync(path.join(workspace,'objects',id)).map(name=>[name,hash(path.join(workspace,'objects',id,name))]));
const timings:Data[]=[],checks:string[]=[],report:Data={started_utc:new Date().toISOString(),scope:'Actual public MCP stdio and independent Python; analytic projected phase evidence, export, recovery and saved Panel HTTP only',versions,oracle:truth,checks,timings,not_tested:['browser/GUI gestures or computer use','fresh ordinary model session','real specimen/material defect accuracy','GPA/topology cancellation or lost-response injection','native DM/GMS/vendor/hardware','unique conventional 3D Burgers vector','F3b segmentation/defect census','ptychography']};
let serial=0,panelId:string|undefined;
const call=async(name:string,args:Data={},client=first)=>{
 const request_id=typeof args.request_id==='string'?args.request_id:`topology-smoke-${++serial}`,t=performance.now();
 try{return await client.tool(name,{...args,request_id});}finally{timings.push({tool:name,request_id,elapsed_ms:performance.now()-t});}
};
const data=async(name:string,args:Data={},client=first)=>record((await call(name,args,client)).data);
const options={source_domain:'real_space_lattice',source_domain_text:'Public analytic real scalar spatial lattice texture, not diffraction intensity or reconstruction phase.',mask_sigma:truth.sigma,reference_rect:truth.reference_rect,reference_mode:'fixed_g',reference_text:'Prescribed carrier waves and selected reference patch fix the GPA gauge; this is a synthetic model assumption, not experimental strain-free calibration.',amplitude_floor_relative:.05,max_size:512};
const assumption='Public synthetic continuum texture: phi=-2*pi*g*u with u=[8,0]*atan2(y-128.5,x-128.5)/(2*pi), positive image XY closure [8,0] pixels. Candidate values are prescribed analytic controls. Winding is hypothesized image-phase evidence, not a confirmed material defect.';
const loops=(truth.loops as number[][]).map((rect,index)=>({rect,orientation:'positive_image_xy',loop_id:index?'outer':'inner'}));
const sourceFFT=async(name:string)=>{
 const source=path.join(directory,name+'.tiff'),before=hash(source);
 const opened=await data('image_open',{source_path:source}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0});
 const fft=await data('image_fft',{object_id:frame.object_id,rect:[0,0,256,256],window:'none',subtract_mean:true});
 assert.equal(hash(source),before);return {source,source_sha256:before,opened,frame,fft};
};
const g=truth.g as number[][];
const gpas=async(id:string)=>[await data('image_gpa',{object_id:id,...options,g_vectors:[g[0],g[1]]}),await data('image_gpa',{object_id:id,...options,g_vectors:[g[0],g[2]]})];
const assertScientificFlags=(saved:Data)=>{
 assert.equal(saved.interpretation_status,'hypothesized');assert.equal(saved.material_dislocation_confirmed,false);assert.equal(saved.burgers_3d_unique,false);
 assert.equal(saved.fft_recomputed,false);assert.equal(saved.gpa_recomputed,false);assert.equal(saved.source_arrays_modified,false);
};
try{
 await first.rpc('initialize');
 const catalog=record(record(await first.rpc('tools/list')).result).tools;assert.ok(Array.isArray(catalog));
 assert.ok(catalog.some(tool=>record(tool).name==='image_topology'));
 writeFileSync(path.join(directory,'topology-catalog.json'),JSON.stringify(catalog.filter(tool=>record(tool).name==='image_topology'),null,2));
 const positive=await sourceFFT('positive'),fftId=identifier(positive.fft.object_id),fftOriginal=allFiles(fftId);
 const calibrated=await data('image_calibrate',{object_id:fftId,scope:'image',xy_scale:{x:.02,y:-.035,unit:'nm'},source_text:'Public synthetic signed anisotropic calibration oracle, not an experimental calibration.'});
 const bands=await gpas(identifier(calibrated.object_id)),bandIds=bands.map(band=>identifier(band.object_id)),bandOriginal=bandIds.map(allFiles);
 const common={object_ids:bandIds,loops,model_assumption_text:assumption,burgers_candidates:[{label:'analytic8x',b_pixel_xy:[8,0]},{label:'wrong8y',b_pixel_xy:[0,8]}],max_size:512};
 const two=await data('image_topology',{...common,object_ids:[bandIds[0]]});
 assert.equal(record(two.report).status,'constrained_candidate_without_redundancy');assert.equal(record(record(two.report).projected_burgers).redundancy_validated,false);
 const mainReply=await call('image_topology',common),main=record(mainReply.data),mainId=identifier(main.object_id);png(mainReply.png);assertScientificFlags(main);
 writeFileSync(path.join(directory,'topology-preview.png'),Buffer.from(mainReply.png as string,'base64'));
 const mainReport=record(main.report),fit=record(mainReport.projected_burgers);
 assert.equal(mainReport.reflection_count,3);assert.equal(mainReport.status,'projected_topological_evidence');assert.equal(fit.redundancy_validated,true);
 assert.equal(fit.direction_family_count,3);assert.deepEqual(record(main.input_dependency).gpa_records instanceof Array,true);
 assert.ok((fit.b_pixel_xy as number[]).every((v,i)=>Math.abs(v-[8,0][i])<1e-6));
 assert.ok((fit.b_nm_xy as number[]).every((v,i)=>Math.abs(v-[.16,0][i])<1e-6));
 assert.deepEqual(rows(mainReport.burgers_candidates).map(row=>row.matches_saved_constraints),[true,false]);
 for(const loop of rows(mainReport.loops))assert.deepEqual(rows(loop.reflections).map(row=>row.canonical_winding_integer),[-1,0,-1]);
 const mainOriginal=allFiles(mainId),revision=await data('image_topology',{...common,loops:loops.map(loop=>({...loop,orientation:'negative_image_xy'})),previous_topology_id:mainId});
 assertScientificFlags(revision);assert.notEqual(revision.object_id,mainId);
 for(const loop of rows(record(revision.report).loops)){
  assert.deepEqual(rows(loop.reflections).map(row=>row.winding_integer),[1,0,1]);assert.deepEqual(rows(loop.reflections).map(row=>row.canonical_winding_integer),[-1,0,-1]);
 }
 assert.deepEqual(allFiles(mainId),mainOriginal);assert.equal(fftCount(),1);
 checks.push('One saved FFT -> two fixed_g GPA records -> three deduplicated nonharmonic bands; signed metric, independent [-1,0,-1] winding/[8,0] closure, candidate match/nonmatch, two-direction nonvalidation and immutable reversed-orientation revision.');
 const nullSource=await sourceFFT('smoothnull'),nullBands=await gpas(identifier(nullSource.fft.object_id));
 const nullResult=await data('image_topology',{object_ids:nullBands.map(b=>b.object_id),loops,model_assumption_text:'Public synthetic smooth Gaussian displacement hotspot is single valued, has nonzero local gradient and exactly zero continuum phase circulation. Zero measured net winding does not prove defect absence.',max_size:512});
 assert.equal(record(nullResult.report).status,'no_net_winding_detected');assertScientificFlags(nullResult);
 for(const loop of rows(record(nullResult.report).loops))assert.deepEqual(rows(loop.reflections).map(row=>row.canonical_winding_integer),[0,0,0]);
 checks.push('Actual MCP smooth single-valued displacement/strain-hotspot control yields zero net winding; no defect-absence claim.');
 const blank=await sourceFFT('nosignal');let noSignalError='';
 try{await data('image_gpa',{object_id:blank.fft.object_id,...options,g_vectors:[g[0],g[1]]});}catch(caught){noSignalError=caught instanceof Error?caught.message:String(caught);}
 assert.ok(noSignalError,'Zero-signal image must not produce a usable GPA/topology result');report.no_signal={outcome:'GPA_REFUSED_BEFORE_TOPOLOGY',error:noSignalError};
 checks.push('Actual zero-signal image is refused upstream by GPA; no topology evidence is invented.');
 const exports:Data[]=[];
 for(const [label,saved] of [['positive',main],['revision',revision]] as const){
  const exported=await data('image_export',{object_id:saved.object_id,output_dir:path.join(directory,label+'-export')}),files=record(exported.exported_files_sha256);
  for(const [name,digest] of Object.entries(files))assert.equal(hash(path.join(String(exported.output_dir),name)),digest);
  for(const name of ['path_xy.npy','path_offsets.npy','wrapped_phase_step_radians.npy','loop_valid.npy','loop_winding_cycles.npy','topology-report.json','topology-circuits.csv','manifest.json','provenance.json','preview.png'])assert.ok(name in files,name);
  execute(String.raw`
import sys,pathlib,json,csv,numpy as np
d=pathlib.Path(sys.argv[1]);r=json.load(open(d/'topology-report.json',encoding='utf8'));w=np.load(d/'loop_winding_cycles.npy');v=np.load(d/'loop_valid.npy');steps=np.load(d/'wrapped_phase_step_radians.npy');offsets=np.load(d/'path_offsets.npy');xy=np.load(d/'path_xy.npy')
assert w.shape==(2,3) and v.shape==(2,3) and v.dtype==np.bool_ and v.all()
assert steps.shape==(3,len(xy)) and offsets.tolist()==[0,380,888]
assert np.isfinite(steps).all() and np.max(np.abs(steps))<.8*np.pi
expected=np.array([-1,0,-1])*(1 if sys.argv[2]=='positive' else -1)
assert np.max(np.abs(w-expected))<1e-6
assert len(list(csv.DictReader(open(d/'topology-circuits.csv',encoding='utf8',newline=''))))==6
assert r['interpretation_status']=='hypothesized' and r['phase_source']=='saved_phase_demodulated_wrapped_no_unwrap_or_fft'
`,[String(exported.output_dir),label]);
  exports.push(exported);
 }
 await assert.rejects(data('image_export',{object_id:mainId,output_dir:exports[0].output_dir}),/OUTPUT_EXISTS|already exists/);
 checks.push('Topology and revision scientific exports reopen as NPY/JSON/CSV with verified file hashes, path bounds/steps, sign and masks; overwrite refused.');
 const beforeRecovery={objects:objects().length,ffts:fftCount()},fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of [bands[0],bands[1],two,main,revision,nullResult]){
  const recovered=record((await fresh.tool('image_result',{request_id:saved.request_id})).data);assert.equal(recovered.object_id,saved.object_id);
  assert.equal(record((await fresh.tool('image_info',{object_id:saved.object_id})).data).object_id,saved.object_id);
 }
 assert.deepEqual({objects:objects().length,ffts:fftCount()},beforeRecovery);
 const panelRequest={object_id:mainId,request_id:'topology-smoke-panel'},panelReply=await first.tool('image_panel_open',panelRequest),panel=record(panelReply.data);png(panelReply.png);panelId=identifier(panel.panel_id);
 assert.equal(record(record(panel.view).object).object_id,mainId);
 const current=record((await fresh.tool('image_panel_current',{panel_id:panelId})).data);assert.equal(record(record(current.view).object).object_id,mainId);
 const recoveredPanel=record((await fresh.tool('image_panel_open',panelRequest)).data);assert.equal(recoveredPanel.panel_id,panelId);assert.equal(recoveredPanel.recovered,true);
 report.panel={formal_open_current_recovery:'PASS',panel_id:panelId,object_id:mainId,scope:'Saved immutable preview and actual owned local Panel HTTP/state; no browser/GUI gestures'};
 checks.push('Fresh MCP client recovers original GPA/topology IDs without new scientific objects/FFT; existing image_panel_open/current recovers the same saved preview and owned panel.');
 assert.deepEqual(allFiles(fftId),fftOriginal);for(let i=0;i<bandIds.length;i++)assert.deepEqual(allFiles(bandIds[i]),bandOriginal[i]);assert.deepEqual(allFiles(mainId),mainOriginal);
 for(const source of [positive,nullSource,blank])assert.equal(hash(source.source),source.source_sha256);
 assert.equal(fftCount(),3);report.source_integrity={source_hashes:[positive,nullSource,blank].map(source=>({label:path.basename(source.source),sha256:source.source_sha256})),positive_fft_files:fftOriginal,positive_gpa_unchanged:true,prior_topology_unchanged:true,forward_fft_count:3,meaning:'One explicit FFT per positive, smooth-null and zero-signal source. GPA/topology/revision/export/recovery add none.'};
 report.references={positive_fft:fftId,gpa:bandIds,two_direction:two.object_id,topology:mainId,revision:revision.object_id,smooth_null:nullResult.object_id};
 report.topology=mainReport;report.smooth_null=record(nullResult.report);report.exports=exports;report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
 console.log('PASS: actual topology MCP/Python, independent public winding oracle, saved FFT/GPA reuse, null/refusal, immutable revision, scientific export, fresh recovery and Panel HTTP.');
}catch(caught){report.result='FAIL';report.error=caught instanceof Error?caught.stack:String(caught);report.runtime_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw caught;}
finally{
 for(const client of clients)await client.close();
 if(panelId){const owned=record(JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',panelId+'.json'),'utf8')));assert.equal(owned.panel_id,panelId);try{process.kill(owned.pid as number);}catch{/* Owned helper may already have stopped. */}}
 if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
 console.log('Retained evidence: '+path.join(directory,'report.json'));
}
