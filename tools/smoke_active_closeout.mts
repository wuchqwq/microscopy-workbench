// Small actual Panel/MCP/Python closeout. Browser gestures are performed and
// qualified separately; resume consumes their saved measurement, never invents it.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const list=(v:unknown):unknown[]=>{assert.ok(Array.isArray(v));return v;};
const rows=(v:unknown):Row[]=>list(v).map(row);
const str=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const num=(v:unknown):number=>{assert.ok(typeof v==='number'&&Number.isFinite(v));return v as number;};
const hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url)),directory=str(process.env.MICROSCOPY_SMOKE_OUTPUT),stage=process.env.MICROSCOPY_CLOSEOUT_STAGE??'prepare';
assert.ok(directory&&path.isAbsolute(directory),'A new absolute MICROSCOPY_SMOKE_OUTPUT is required');
assert.ok(['prepare','resume','mcp-revise'].includes(stage));
if(stage==='prepare'){assert.ok(!existsSync(directory),'Prepare never overwrites evidence');mkdirSync(directory,{recursive:true});}
const workspace=path.join(directory,'workspace/images'),config=path.join(directory,'plugin-config.json'),receiptFile=path.join(directory,'prepare-receipt.json');
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
if(stage==='prepare')writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:path.dirname(workspace),structures:false}));
const previous=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const client=new StdioImageClient({workspace,python,serverPath:path.join(root,'tools/plugin_server.mjs')}),tag=hash(config).slice(0,10),timings:Row[]=[];
let counter=0;
const readonly=new Set(['image_info','image_result','image_evidence','image_panel_current','analysis_read']);
async function call(name:string,parameters:Row={}):Promise<Row>{
 const args=readonly.has(name)?parameters:{...parameters,request_id:parameters.request_id??`closeout-${tag}-${stage}-${++counter}`},started=performance.now();
 appendFileSync(path.join(directory,stage+'-calls.jsonl'),JSON.stringify({event:'submit',tool:name,args})+'\n');
 const raw=row(await client.rpc('tools/call',{name,arguments:args})),result=row(raw.result??{}),content=rows(result.content??[]),entry=content.find(c=>c.type==='text');
 const timing={tool:name,request_id:args.request_id??null,elapsed_ms:performance.now()-started,mcp_result_bytes:Buffer.byteLength(JSON.stringify(result)),image_blocks:content.filter(c=>c.type==='image').length};timings.push(timing);
 appendFileSync(path.join(directory,stage+'-calls.jsonl'),JSON.stringify({event:'returned',...timing})+'\n');
 assert.ok(!raw.error&&!result.isError,entry?.text as string);assert.ok(entry);return row(JSON.parse(str(entry.text)));
}
const object=(id:unknown)=>row(JSON.parse(readFileSync(path.join(workspace,'objects',str(id),'object.json'),'utf8')));
const fftIds=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json'))&&object(id).kind==='fft');
const objectFiles=(id:unknown)=>Object.fromEntries(readdirSync(path.join(workspace,'objects',str(id))).map(f=>[f,hash(path.join(workspace,'objects',str(id),f))]));
const assertFiles=(id:unknown,expected:Row)=>assert.deepEqual(objectFiles(id),expected);
const compact=(value:Row)=>{assert.equal(value.evidence_format,'image-evidence-summary-v1');assert.equal(value.authoritative_record,false);assert.match(str(value.manifest_sha256),/^[a-f0-9]{64}$/);return value;};
const save=(name:string,value:unknown)=>writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
try{
 await client.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'active-closeout-acceptance',version:'1'}});
 if(stage==='prepare'){
  const source=path.join(directory,'public-reconstruction.tiff');
  const fixture=spawnSync(python,['-B','-c',String.raw`import sys,numpy as np,tifffile
y,x=np.indices((96,96),dtype=np.float64)
a=np.cos(2*np.pi*10*x/64)+.7*np.cos(2*np.pi*15*y/64)
b=np.cos(2*np.pi*(8*x+6*y)/64)+.7*np.cos(2*np.pi*(-9*x+12*y)/64)
tifffile.imwrite(sys.argv[1],np.where(x>=32,b,a).astype(np.float32),photometric='minisblack',metadata=None)
`,source],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(fixture.status,0,fixture.stderr||fixture.error?.message);
  const opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});assert.equal(frame.dtype,'float32');
  const initial=await call('image_spatial_field',{object_id:frame.object_id,rect:[0,0,64,64],window_sizes:[64],stride_xy:[64,64],max_windows:1,coordinate_domain:'pixel',window:'none',subtract_mean:true,max_peaks:16,peak_options:{threshold_rel:.18,min_separation_bins:2,exclude_dc_radius_bins:3,refinement:'quadratic'},max_size:512});
  const field=await call('image_field_extend',{object_id:initial.object_id,rects:[[0,0,32,32],[32,8,64,40]],source_text:'Public analytic offset-support validation; not an experimental phase assignment',max_size:512});
  const settings={object_id:field.object_id,tolerance:.01,angles_degrees:[0,30,45,60,90],max_size:512};
  const legacy=await call('image_domain_map',settings),legacyFiles=objectFiles(legacy.object_id);
  const mapped=await call('image_domain_map',{...settings,neighbor_policy:'support_contact_v1'});
  assert.equal(mapped.neighbor_policy,'support_contact_v1');assert.ok(rows(mapped.edges).some(e=>e.support_relation==='shared_edge'&&e.shared_edge_pixels===24));assert.equal(rows(legacy.edges).length,0);
  await call('image_info',{object_id:legacy.object_id});assertFiles(legacy.object_id,legacyFiles);
  const projected=compact(await call('image_info',{object_id:field.object_id,response_detail:'compact'}));
  const expanded=await call('image_evidence',{object_id:field.object_id,manifest_sha256:projected.manifest_sha256,section:'samples',offset:0,limit:3});
  assert.equal(expanded.authoritative_record,false);
  const sample=rows(field.samples).find(s=>JSON.stringify(s.rect_xyxy)==='[0,0,32,32]');assert.ok(sample);
  const view=await call('image_info',{object_id:sample.view_object_id});
  const mark=rows(view.annotations).find(m=>row(row(m.presentation??{}).label??{}).measurement_object_id);assert.ok(mark);
  const measurementId=row(row(mark.presentation).label).measurement_object_id;assert.ok(list(sample.measurement_object_ids).includes(measurementId));
  const analysisId='public-closeout-'+tag,created=await call('analysis_create',{analysis_id:analysisId,reason:'Public small F4 closeout: preserve source and current evidence'});let revision=num(row(created.context).revision);
  for(const selections of [{experiment:{provider:'image',object_id:frame.object_id},spatial_field:{provider:'image',object_id:field.object_id}},{domains:{provider:'image',object_id:mapped.object_id}}])revision=num(row((await call('analysis_update',{analysis_id:analysisId,expected_revision:revision,selections,reason:'Bind exact source, incremental field and opt-in support map'})).context).revision);
  const panel=await call('image_panel_open',{object_id:mapped.object_id});assert.equal((await fetch(str(panel.panel_url))).status,200);
  const spectrum=fftIds().map(id=>({object_id:id,data_sha256:hash(path.join(workspace,'objects',id,'data.npy'))}));assert.equal(spectrum.length,3);
  const protectedArrays=readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'data.npy'))).map(id=>({object_id:id,kind:object(id).kind,data_sha256:hash(path.join(workspace,'objects',id,'data.npy'))}));assert.ok(protectedArrays.some(value=>value.object_id===frame.object_id),'The extracted source pixel array must be protected too');
  const receipt={scope:'Prepared actual compiled MCP/Python; browser gesture not yet qualified',source,source_sha256:hash(source),frame:frame.object_id,initial:initial.object_id,field:field.object_id,map:mapped.object_id,legacy_map:legacy.object_id,legacy_files:legacyFiles,analysis_id:analysisId,context_revision:revision,panel,
   target:{observation_key:sample.observation_key,rect_xyxy:sample.rect_xyxy,view_object_id:sample.view_object_id,annotation_id:mark.annotation_id,coordinates:row(mark.anchor).coordinates,measurement_object_id:measurementId,measurement_object_ids:sample.measurement_object_ids,measurement_files:objectFiles(measurementId)},spectra:spectrum,protected_arrays:protectedArrays,window_count:3,fft_pixels:6144,compact_manifest_sha256:projected.manifest_sha256,timings};
  save('prepare-receipt.json',receipt);console.log(JSON.stringify({stage:'PREPARED',receipt:receiptFile,panel,analysis_id:analysisId,target:receipt.target}));
 }else{
  assert.ok(!existsSync(path.join(directory,stage+'-started.json'))&&!existsSync(path.join(directory,'resume-report.json')),'Revision was already submitted; query its original receipts instead of replay');save(stage+'-started.json',{utc:new Date().toISOString()});
  const prepared=row(JSON.parse(readFileSync(receiptFile,'utf8'))),target=row(prepared.target),panel=row(prepared.panel),before=fftIds();
  assert.equal(hash(str(prepared.source)),prepared.source_sha256);for(const s of rows(prepared.spectra))assert.equal(hash(path.join(workspace,'objects',str(s.object_id),'data.npy')),s.data_sha256);
  for(const s of rows(prepared.protected_arrays))assert.equal(hash(path.join(workspace,'objects',str(s.object_id),'data.npy')),s.data_sha256);
  let shown:Row,mark:Row|undefined,measured:Row;
  if(stage==='mcp-revise'){
   // Formal scientific tools only. This is not a Panel action, mouse gesture,
   // fabricated last_operation or workaround for an unsafe browser controller.
   const coordinates=list(target.coordinates).map(num);coordinates[0]=coordinates[0]!+.003;
   shown=await call('image_annotate',{object_id:target.view_object_id,updates:[{annotation_id:target.annotation_id,coordinates,note:'Explicit synthetic MCP-only peak correction; browser gesture not performed',presentation:{label:{visible:false}}}]});
   mark=rows(shown.annotations).find(m=>m.annotation_id===target.annotation_id);
   measured=await call('image_remeasure',{object_id:shown.object_id,measurement_object_id:target.measurement_object_id,points:[[0,0],coordinates],source_text:'Predeclared +0.003 cycles/pixel synthetic correction through formal MCP; no browser or user gesture claimed'});
  }else{
   const current=row((await call('image_panel_current',{panel_id:panel.panel_id})).view);shown=row(current.object);mark=rows(shown.annotations).find(m=>m.annotation_id===target.annotation_id);
   measured=row(current.last_operation);assert.equal(measured.annotation_id,target.annotation_id);
  }
  assert.ok(mark);assert.notDeepEqual(row(mark.anchor).coordinates,target.coordinates,'A real saved scientific anchor revision is required');
  assert.equal(measured.kind,'measure');assert.notEqual(measured.object_id,target.measurement_object_id);
  assert.deepEqual(list(measured.points)[1],row(mark.anchor).coordinates);assertFiles(target.measurement_object_id,row(target.measurement_files));
  const replacements=list(target.measurement_object_ids).map(id=>id===target.measurement_object_id?measured.object_id:id);
  const field=await call('image_field_extend',{object_id:prepared.field,rects:[],measurement_overrides:[{observation_key:target.observation_key,measurement_object_ids:replacements}],source_text:stage==='mcp-revise'?'Explicit saved MCP-only correction relayed by stable scientific observation identity; no GUI gesture':'Saved GUI peak correction relayed by stable scientific observation identity',max_size:512});
  assert.deepEqual(fftIds(),before);const corrected=rows(field.samples).find(s=>s.observation_key===target.observation_key);assert.ok(corrected);assert.deepEqual(corrected.measurement_object_ids,replacements);
  const mapped=await call('image_domain_map',{object_id:field.object_id,tolerance:.01,angles_degrees:[0,30,45,60,90],neighbor_policy:'support_contact_v1',max_size:512});
  const plan=await call('image_analysis_candidates',{object_id:mapped.object_id,budget_windows:5,budget_fft_pixels:8192,candidate_scales:[32],response_detail:'compact'});compact(plan);
  let revision=num(row((await call('analysis_read',{analysis_id:prepared.analysis_id})).context).revision);
  for(const selections of [{spatial_field:{provider:'image',object_id:field.object_id}},{domains:{provider:'image',object_id:mapped.object_id}},{active_plan:{provider:'image',object_id:plan.object_id}}])revision=num(row((await call('analysis_update',{analysis_id:prepared.analysis_id,expected_revision:revision,selections,reason:'Continue after exact saved scientific measurement revision; spectra unchanged'})).context).revision);
  const live=row((await call('image_panel_current',{panel_id:panel.panel_id})).view);await call('image_panel_show',{panel_id:panel.panel_id,object_id:mapped.object_id,expected_object_id:row(live.object).object_id,draft_revision:row(live.edit_state).draft_revision});
  const original=await call('image_result',{request_id:field.request_id,response_detail:'compact'});assert.equal(original.object_id,field.object_id);
  const fresh=new StdioImageClient({workspace,python,serverPath:path.join(root,'tools/plugin_server.mjs')});try{
   await fresh.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'active-closeout-recovery',version:'1'}});
   const restored=row((await fresh.tool('analysis_read',{analysis_id:prepared.analysis_id})).data);assert.equal(row(restored.context).revision,revision);
   const queried=row((await fresh.tool('image_result',{request_id:field.request_id,response_detail:'compact'})).data);assert.equal(queried.object_id,field.object_id);
  }finally{await fresh.close();}
  await call('image_info',{object_id:prepared.legacy_map});assertFiles(prepared.legacy_map,row(prepared.legacy_files));assert.deepEqual(fftIds(),before);
  for(const s of rows(prepared.spectra))assert.equal(hash(path.join(workspace,'objects',str(s.object_id),'data.npy')),s.data_sha256);assert.equal(hash(str(prepared.source)),prepared.source_sha256);
  for(const s of rows(prepared.protected_arrays))assert.equal(hash(path.join(workspace,'objects',str(s.object_id),'data.npy')),s.data_sha256);
  save('resume-report.json',{status:'PASS',scope:stage==='mcp-revise'?'Formal MCP-only scientific anchor/measurement revision; NOT a browser gesture or Panel action':'Actual saved Panel measurement relayed through MCP/Python; gesture qualification separate',revision_stage:stage,browser_gesture:stage==='mcp-revise'?'NOT_TESTED':'Separate root qualification',source_sha256:prepared.source_sha256,observation_key:target.observation_key,old_measurement:target.measurement_object_id,new_measurement:measured.object_id,field:field.object_id,map:mapped.object_id,proposal:plan.object_id,analysis_id:prepared.analysis_id,context_revision:revision,old_spectrum_hashes_unchanged:true,new_fft_count:0,legacy_map_files_unchanged:true,original_request_recovered:true,new_client_recovery:true,panel_id:panel.panel_id,timings});console.log('PASS: saved '+stage+' correction -> stable-key field/map/context, no FFT and original-ID recovery');
 }
}catch(error){save(stage+'-failure.json',{status:'FAIL',error:error instanceof Error?error.stack:String(error),timings});throw error;}
finally{await client.close();if(previous===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previous;}
