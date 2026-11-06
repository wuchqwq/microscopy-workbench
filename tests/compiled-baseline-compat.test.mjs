// Exact frozen JS -> relocated compiled package, with actual MCP/Python/Panel.
// No browser gestures, model session, private data or GMS qualification here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const BASELINE='3790b3d57e427010f0a5cbfce8a31143a7883eef';
const here=fileURLToPath(new URL('../',import.meta.url));
// This file runs both from the source tests folder and its build copy.
const packageRoot=path.basename(path.resolve(here))==='dist'?here:path.join(here,'dist');
const sourceRoot=path.basename(path.resolve(here))==='dist'?path.dirname(path.resolve(here)):here;
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');

const GPA_ADDITIONS=['image_discovery','image_discovery_review','image_gpa','image_gpa_read','image_gpa_view','image_method_next','image_method_plan','image_method_step','image_panel_resume','image_topology'];
function assertCompatibleCatalog(current,frozen){
 const additions=new Set(GPA_ADDITIONS);
 assert.deepEqual(current.filter(tool=>additions.has(tool.name)).map(tool=>tool.name).sort(),GPA_ADDITIONS,
  'Only the explicitly enumerated GPA/topology, cross-method, image-first and explicit owned Panel recovery tools may extend the frozen catalog');
 assert.deepEqual(current.filter(tool=>!additions.has(tool.name)),frozen,
  'Every frozen tool/schema/description and relative order must remain exactly compatible');
}

const FROZEN_IMAGE_INFO_DESCRIPTION='Inspect a saved image/view/context object without running analysis.';
const FRAME_ANCESTRY_GUIDANCE=' Optional include_frame_ancestry qualifies the same bounded parent/base/source chain in one worker; absent projection requires ordinary parent reads.';
const FRAME_ANCESTRY_PARAMETER={type:'boolean',description:'Optional read-only bounded frame ancestry; no new object, array or inferred identity.'};
function normalizeNamedFrameAncestryExtension(current,frozen){
 const info=current.find(tool=>tool.name==='image_info'),old=frozen.find(tool=>tool.name==='image_info');
 assert.equal(old.description,FROZEN_IMAGE_INFO_DESCRIPTION,'The original frozen image_info description is unchanged');
 assert.equal(old.inputSchema.properties.include_frame_ancestry,undefined,'The frozen catalog does not already contain this named extension');
 assert.equal(info.description,FROZEN_IMAGE_INFO_DESCRIPTION+FRAME_ANCESTRY_GUIDANCE,'Only the complete, explicitly authorized ancestry guidance extends image_info');
 assert.deepEqual(info.inputSchema.properties.include_frame_ancestry,FRAME_ANCESTRY_PARAMETER,'The named optional read parameter retains its exact boolean schema and description');
 assert.ok(!(info.inputSchema.required??[]).includes('include_frame_ancestry'),'Frame ancestry must remain optional for legacy callers');
 delete info.inputSchema.properties.include_frame_ancestry;
 info.description=old.description;
}

const FROZEN_IMAGE_EXPORT_DESCRIPTION='Write scientific NPY or saved sparse feature JSON/CSV, available display PNG and provenance to a new output directory under an EXISTING parent. OUTPUT_PARENT_MISSING requires an existing parent, not merely another basename. Refuse overwrite; data handoff, not DM native SaveAs.';
const REPORT_EXPORT_GUIDANCE=' Saved-band comparison exports also include method-decision.json and available peak-comparison.txt; candidate-review exports include discovery-review.json and available candidate-review.txt. Report export does not include its parent GPA arrays; export each GPA object separately for amplitude/masks.';
function normalizeNamedReportExportGuidance(current,frozen){
 const selected=current.filter(tool=>tool.name==='image_export'),original=frozen.filter(tool=>tool.name==='image_export');
 assert.equal(selected.length,1,'Exactly one existing image_export retains its name');
 assert.equal(original.length,1,'Exactly one original frozen image_export is required');
 const tool=selected[0],old=original[0];
 assert.equal(old.description,FROZEN_IMAGE_EXPORT_DESCRIPTION,'Never rewrite the original frozen description');
 assert.equal(tool.description,FROZEN_IMAGE_EXPORT_DESCRIPTION+REPORT_EXPORT_GUIDANCE,
  'Only the reviewed report-file guidance may extend image_export; all original refusal guidance remains');
 const {description:currentDescription,...currentContract}=tool;
 const {description:oldDescription,...oldContract}=old;
 assert.deepEqual(currentContract,oldContract,'Report guidance changes no name, schema or other tool metadata');
 tool.description=old.description;
}

test('additive GPA catalog still rejects removed/modified legacy tools and unexpected additions',()=>{
 const frozen=[{name:'image_fft',description:'frozen',inputSchema:{type:'object'}}];
 const current=[...GPA_ADDITIONS.map(name=>({name})),...frozen];
 assertCompatibleCatalog(current,frozen);
 assert.throws(()=>assertCompatibleCatalog(current.slice(0,GPA_ADDITIONS.length),frozen));
 assert.throws(()=>assertCompatibleCatalog([...current.slice(0,GPA_ADDITIONS.length),{...frozen[0],description:'changed'}],frozen));
 assert.throws(()=>assertCompatibleCatalog([...current,{name:'unexpected_tool'}],frozen));
 assert.throws(()=>assertCompatibleCatalog([...current,{name:'image_gpa'}],frozen));
});

test('named optional frame ancestry normalization does not hide changes to frozen fields or other tools',()=>{
 const frozen=[{name:'image_info',description:FROZEN_IMAGE_INFO_DESCRIPTION,inputSchema:{type:'object',additionalProperties:false,required:['object_id'],properties:{object_id:{type:'string'}}}},{name:'image_fft',description:'frozen FFT description',inputSchema:{type:'object',required:['object_id']}}];
 const current=structuredClone(frozen);current[0].description+=FRAME_ANCESTRY_GUIDANCE;current[0].inputSchema.properties.include_frame_ancestry=structuredClone(FRAME_ANCESTRY_PARAMETER);
 const check=value=>{const retained=structuredClone(value);normalizeNamedFrameAncestryExtension(retained,frozen);assert.deepEqual(retained,frozen);};check(current);
 for(const mutate of [
  value=>value[0].inputSchema.properties.include_frame_ancestry.type='string',
  value=>value[0].inputSchema.properties.include_frame_ancestry.description='different guidance',
  value=>value[0].inputSchema.properties.include_frame_ancestry.default=true,
  value=>value[0].inputSchema.required.push('include_frame_ancestry'),
  value=>value[0].description='changed frozen prefix'+FRAME_ANCESTRY_GUIDANCE,
  value=>value[0].description+=' unexpected extra sentence',
  value=>value[0].inputSchema.properties.object_id.type='number',
  value=>value[0].inputSchema.required=[],
  value=>value[0].inputSchema.properties.unexpected_flag={type:'boolean'},
  value=>value[1].description='changed unrelated FFT description',
 ]){const changed=structuredClone(current);mutate(changed);assert.throws(()=>check(changed));}
 assert.deepEqual(frozen[0].description,FROZEN_IMAGE_INFO_DESCRIPTION,'Normalizing a copy never edits the frozen catalog');
});

test('named report export guidance preserves exact legacy contracts and rejects unreviewed prose',()=>{
 const frozen=[{name:'image_export',description:FROZEN_IMAGE_EXPORT_DESCRIPTION,inputSchema:{type:'object',additionalProperties:false,required:['object_id','output_dir','request_id'],properties:{object_id:{type:'string'},output_dir:{type:'string',minLength:1},request_id:{type:'string'}}}},{name:'image_fft',description:'frozen FFT description',inputSchema:{type:'object',required:['object_id']}}];
 const original=structuredClone(frozen),current=structuredClone(frozen);current[0].description+=REPORT_EXPORT_GUIDANCE;
 const check=value=>{const retained=structuredClone(value);normalizeNamedReportExportGuidance(retained,frozen);assert.deepEqual(retained,frozen);};check(current);
 assert.equal(current[0].description,FROZEN_IMAGE_EXPORT_DESCRIPTION+REPORT_EXPORT_GUIDANCE,'Normalization touches a comparison copy only');
 for(const mutate of [
  value=>value[0].description=REPORT_EXPORT_GUIDANCE,
  value=>value[0].description=FROZEN_IMAGE_EXPORT_DESCRIPTION,
  value=>value[0].description=value[0].description.replace('Refuse overwrite; ',''),
  value=>value[0].description=value[0].description.replace('Report export does not include its parent GPA arrays','Report export includes its parent GPA arrays'),
  value=>value[0].description+=' unreviewed promise',
  value=>value[0].name='renamed_export',
  value=>value.splice(0,1),
  value=>value.push(structuredClone(value[0])),
  value=>value[0].inputSchema.properties.output_dir.type='number',
  value=>value[0].inputSchema.properties.object_id.type='number',
  value=>value[0].inputSchema.required.pop(),
  value=>value[0].inputSchema.properties.unexpected_flag={type:'boolean'},
  value=>value[0].inputSchema.additionalProperties=true,
  value=>value[0].outputSchema={type:'object'},
  value=>value[1].description='changed unrelated FFT description',
 ]){const changed=structuredClone(current);mutate(changed);assert.throws(()=>check(changed));}
 const changedBaseline=structuredClone(frozen);changedBaseline[0].description+=' rewritten history';
 assert.throws(()=>normalizeNamedReportExportGuidance(structuredClone(current),changedBaseline));
 assert.deepEqual(frozen,original,'The entire frozen catalog remains unchanged');
});

function snapshot(directory,prefix=''){
 const result={};
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const relative=prefix+entry.name,full=path.join(directory,entry.name);
  if(entry.isDirectory())Object.assign(result,snapshot(full,relative+'/'));
  else if(entry.isFile())result[relative]=hash(full);
 }
 return result;
}

function pythonRun(python,code,args=[]){
 const result=spawnSync(python,['-B','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});
 assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();
}

class Client{
 constructor(root,config,cwd,{canonicalizeLegacyEntry=false}={}){
  const manifest=JSON.parse(readFileSync(path.join(root,'.mcp.json'),'utf8')).mcpServers.microscopy_workbench;
  assert.equal(manifest.command,'node');assert.equal(manifest.cwd,'.');
  const entry=path.resolve(root,manifest.args[0]);
  assert.ok(entry.startsWith(path.resolve(root)+path.sep));assert.ok(existsSync(entry));
  // Frozen JS uses string-equality argv/ESM direct-entry detection. On macOS
  // os.tmpdir() can be /var/... while Node resolves ESM URLs as /private/var/...
  // Launch the unmodified frozen baseline by its canonical path; the candidate
  // stays on its original alias path and must independently prove the fix.
  const launchEntry=canonicalizeLegacyEntry?realpathSync.native(entry):entry;
  this.child=spawn(process.execPath,[launchEntry,...manifest.args.slice(1)],{cwd,stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,MICROSCOPY_PLUGIN_CONFIG:config,MICROSCOPY_PANEL:'1',MICROSCOPY_EXECUTION_OBSERVABILITY:'1'}});
  this.next=0;this.pending=new Map();this.stderr='';let buffer='';
  this.child.stderr.on('data',chunk=>this.stderr=(this.stderr+chunk).slice(-4096));
  this.child.stdout.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
   try{const value=JSON.parse(line),pending=this.pending.get(value.id);if(pending){this.pending.delete(value.id);clearTimeout(pending.timer);pending.resolve(value);}}
   catch(error){this.reject(error);}
  }});
  this.child.once('error',error=>this.reject(error));this.child.once('exit',()=>this.reject(new Error('MCP exited: '+this.stderr)));
  this.child.stdin.on('error',error=>this.reject(error));
 }
 reject(error){for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();}
 rpc(method,params={}){return new Promise((resolve,reject)=>{
  const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('MCP timeout; original request outcome must be queried'));},130000);
  this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 });}
 async tool(name,args){
  const response=await this.rpc('tools/call',{name,arguments:args});
  assert.ok(!response.error,JSON.stringify(response.error));assert.ok(!response.result.isError,JSON.stringify(response.result));
  return JSON.parse(response.result.content.find(row=>row.type==='text').text);
 }
 async close(){if(this.child.exitCode!==null)return;await new Promise(resolve=>{
  const timer=setTimeout(()=>this.child.kill(),5000);this.child.once('close',()=>{clearTimeout(timer);resolve();});this.child.stdin.end();
 });}
}

test('frozen JS workspace and schema survive a copied compiled plugin without FFT replay',{timeout:300000},async t=>{
 assert.ok(existsSync(path.join(packageRoot,'.mcp.json')),'Run npm run build before compiled compatibility acceptance');
 const directory=mkdtempSync(path.join(tmpdir(),'microscopy-compiled-baseline-'));
 const frozen=path.join(directory,'frozen-js'),installed=path.join(directory,'copied plugin with spaces'),workRoot=path.join(directory,'public-workspace'),workspace=path.join(workRoot,'images');
 const config=path.join(directory,'plugin-config.json'),source=path.join(directory,'public-pattern.tiff');
 const clients=[];let panelPID,keepOutput=false;
 try{
  const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
  const python=pythonRun(candidate,'import sys;print(sys.executable)');
  const archived=path.join(directory,'frozen.zip');
  const archive=spawnSync('git',['archive','--format=zip','--output='+archived,BASELINE],{cwd:sourceRoot,encoding:'utf8',windowsHide:true});
  assert.equal(archive.status,0,archive.stderr||'Frozen baseline Git object must be available (CI checkout fetch-depth: 0)');
  mkdirSync(frozen);pythonRun(python,'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',[archived,frozen]);
  cpSync(packageRoot,installed,{recursive:true});
  assert.equal(existsSync(path.join(installed,'node_modules')),false,'Installed runtime must not need compiler dependencies');
  const manifest=JSON.parse(readFileSync(path.join(installed,'.codex-plugin/plugin.json'),'utf8'));
  for(const relative of [manifest.skills,manifest.mcpServers])assert.ok(existsSync(path.resolve(installed,relative)));
  const skillRoot=path.resolve(installed,manifest.skills);
  assert.ok(readdirSync(skillRoot,{withFileTypes:true}).some(row=>row.isDirectory()&&existsSync(path.join(skillRoot,row.name,'SKILL.md'))));
  writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workRoot,structures:false}));
  pythonRun(python,'import sys,numpy as np,tifffile;y,x=np.indices((32,32));a=np.rint(20000+4000*np.cos(2*np.pi*x/8)+2500*np.cos(2*np.pi*y/16)).astype(np.uint16);tifffile.imwrite(sys.argv[1],a,photometric="minisblack",metadata=None)',[source]);
  const originalSource=hash(source);
  // An unrelated stable cwd catches package-relative path mistakes without
  // making a detached Panel inherit the directory this test must remove.
  const old=new Client(frozen,config,tmpdir(),{canonicalizeLegacyEntry:true});clients.push(old);await old.rpc('initialize');
  const schema=(await old.rpc('tools/list')).result.tools;
  writeFileSync(path.join(directory,'frozen-tool-schema.json'),JSON.stringify(schema,null,2));
  const opened=await old.tool('image_open',{request_id:'frozen-open',source_path:source});
  const frame=await old.tool('image_frame',{request_id:'frozen-frame',object_id:opened.object_id,frame_index:0});
  const calibration=await old.tool('image_calibrate',{request_id:'frozen-calibration',object_id:frame.object_id,scope:'image',xy_scale:{x:.02,y:-.03,unit:'nm'},source_text:'Public synthetic sampling; not instrument calibration'});
  const fft=await old.tool('image_fft',{request_id:'frozen-fft',object_id:calibration.object_id,window:'none',subtract_mean:true,max_size:128});
  const measure=await old.tool('image_measure',{request_id:'frozen-measure',object_id:fft.object_id,coordinate_space:'frequency_cycles_per_pixel',points:[[0,0],[.125,0]]});
  const analysis=await old.tool('analysis_create',{analysis_id:'frozen-public-analysis',request_id:'frozen-context-create',reason:'Frozen public compatibility fixture'});
  const selected=await old.tool('analysis_update',{analysis_id:'frozen-public-analysis',request_id:'frozen-context-select',expected_revision:analysis.context.revision,selections:{fft:{provider:'image',object_id:fft.object_id},measurements:[{provider:'image',object_id:measure.object_id}]},reason:'Preserve exact saved spectrum and measurement'});
  const refused=await old.rpc('tools/call',{name:'image_result',arguments:{request_id:'unknown-original-request'}});
  assert.ok(refused.result.isError,'Unknown original request is not success');
  await old.close();
  const existing=snapshot(workRoot),fftCount=()=>readdirSync(path.join(workspace,'requests')).map(name=>JSON.parse(readFileSync(path.join(workspace,'requests',name),'utf8'))).filter(row=>row.parameters?.action==='fft').length;
  assert.equal(fftCount(),1);
  const current=new Client(installed,config,tmpdir());clients.push(current);await current.rpc('initialize');
  const currentSchema=(await current.rpc('tools/list')).result.tools;
  // F1a/F4-lite add the explicitly enumerated tools and optional context selections. Keep the frozen
  // comparison exact for every pre-existing field; authorize only these named
  // additive changes, never drop descriptions or weaken old scientific tests.
  // #126 authorizes exactly these three additive metadata tools; the frozen
  // catalog and every retained legacy tool/schema remain compared below.
  const additions=['image_spatial_field','image_domain_map','image_analysis_candidates','image_field_extend','image_evidence','image_discovery','image_discovery_review','image_gpa','image_gpa_read','image_gpa_view','image_method_next','image_method_plan','image_method_step','image_panel_resume','image_topology','image_preview_acknowledge','image_source_proof','image_source_proof_info','image_source_proof_revoke'];
  assert.deepEqual(currentSchema.filter(tool=>!schema.some(old=>old.name===tool.name)).map(tool=>tool.name).sort(),additions.slice().sort());
  const retainedSchema=structuredClone(currentSchema.filter(tool=>!additions.includes(tool.name)));
  // #70 intentionally changes preview admission, not old scientific arguments.
  const preview=retainedSchema.find(tool=>tool.name==='image_preview'),oldPreview=schema.find(tool=>tool.name==='image_preview');
  const resolved=preview.inputSchema.properties.resolved_preview;
  assert.deepEqual(resolved.required,['request_id']);assert.equal(resolved.additionalProperties,false);
  assert.deepEqual(Object.keys(resolved.properties).sort(),['object_id','request_id']);
  assert.ok(!preview.inputSchema.required.includes('resolved_preview'));
  delete preview.inputSchema.properties.resolved_preview;
  assert.ok(preview.description.endsWith(oldPreview.description),'Only recovery guidance prefixes the old render description');
  assert.match(preview.description,/new ID or size does not recover/);preview.description=oldPreview.description;
  const panelOpen=retainedSchema.find(tool=>tool.name==='image_panel_open');
  assert.match(panelOpen.description,/explicitly saved preview\/view/);assert.match(panelOpen.description,/PREVIEW_REQUIRED means no rendering was dispatched/);
  panelOpen.description=schema.find(tool=>tool.name==='image_panel_open').description;
  // #72 adds optional intent on NEW annotations; anonymous historical inputs
  // and every pre-existing scientific field/required argument stay unchanged.
  const annotate=retainedSchema.find(tool=>tool.name==='image_annotate');
  for(const field of ['annotations','updates']){
    const item=annotate.inputSchema.properties[field].items;
    assert.deepEqual(item.properties.purpose.enum,['resumable_observation']);
    assert.deepEqual(item.properties.selection_origin.enum,['researcher','agent','unspecified']);
    for(const key of ['purpose','selection_origin']){
      assert.ok(!(item.required??[]).includes(key));delete item.properties[key];
    }
  }
  const intentGuidance='For a new resumable ROI set purpose=resumable_observation with stable annotation_id and selection_origin; read back image_panel_current and verify the exact handoff after saving. ';
  assert.ok(annotate.description.includes(intentGuidance));annotate.description=annotate.description.replace(intentGuidance,'');
  // Presentation controls are explicitly additive and must never become a
  // required scientific parameter or alter old full-return behavior.
  for(const name of ['image_spatial_field','image_domain_map','image_analysis_candidates','image_field_extend','image_info','image_result']){
    const tool=currentSchema.find(tool=>tool.name===name),detail=tool.inputSchema.properties.response_detail;
    assert.equal(detail.type,'string');assert.deepEqual(detail.enum.slice().sort(),['compact','full']);
    assert.ok(!tool.inputSchema.required.includes('response_detail'));
  }
  for(const name of ['image_info','image_result'])delete retainedSchema.find(tool=>tool.name===name).inputSchema.properties.response_detail;
  // The single-process ancestry read is a separately enumerated optional
  // extension. Validate its entire schema/guidance before normalizing only it;
  // every remaining frozen property and every other description stay exact.
  normalizeNamedFrameAncestryExtension(retainedSchema,schema);
  // Owner-authorized HRTEM report guidance is one exact prose-only extension;
  // validate it and the unchanged entire export contract before normalizing.
  normalizeNamedReportExportGuidance(retainedSchema,schema);
  const contextProperties=retainedSchema.find(tool=>tool.name==='analysis_update').inputSchema.properties.selections.properties;
  for(const role of ['spatial_field','domains','active_plan']){assert.deepEqual(contextProperties[role],contextProperties.atlas,'New context selection retains the exact scoped-reference schema');delete contextProperties[role];}
  assert.deepEqual(retainedSchema,schema,'All existing schemas/descriptions remain exact except named presentation/ancestry controls, exact report export guidance and additive F1a/F4 tools');
  const unknown=await current.rpc('tools/call',{name:'image_result',arguments:{request_id:'unknown-original-request'}});
  const oldText=refused.result.content[0].text,newText=unknown.result.content[0].text;
  assert.ok(newText.startsWith(oldText+'. Query image_result with original request_id=unknown-original-request;'));
  const diagnostic=JSON.parse(newText.slice(newText.indexOf(' {')+1));
  assert.equal(diagnostic.request_id,'unknown-original-request');assert.equal(diagnostic.provider,'external-image-workspace');
  assert.equal(diagnostic.submission_state,'outcome_unknown','NOT_FOUND must not be reinterpreted as proven non-dispatch');
  unknown.result.content[0].text=oldText;
  assert.deepEqual(unknown,{...refused,id:current.next},'Only bounded original-request diagnostics extend the old refusal');
  assert.deepEqual(await current.tool('image_result',{request_id:'frozen-fft'}),fft);
  assert.deepEqual(await current.tool('image_info',{object_id:measure.object_id}),await current.tool('image_result',{request_id:'frozen-measure'}));
  const restored=await current.tool('analysis_read',{analysis_id:'frozen-public-analysis'});
  const retainedContext=structuredClone(restored.context);
  for(const role of ['spatial_field','domains','active_plan']){assert.equal(retainedContext.fingerprints[role],null,'Unselected added roles cannot relabel old science');delete retainedContext.fingerprints[role];}
  assert.deepEqual(retainedContext,selected.context);
  const exported=await current.tool('image_export',{request_id:'compiled-export',object_id:fft.object_id,output_dir:path.join(directory,'new-export')});
  assert.equal(exported.state,'completed');
  const changed=await current.tool('image_remeasure',{request_id:'compiled-remeasure',object_id:fft.object_id,measurement_object_id:measure.object_id,points:[[0,0],[.125,.03125]],source_text:'Continue the frozen synthetic measurement'});
  assert.equal(changed.remeasurement.previous_measurement_object_id,measure.object_id);
  assert.ok(Math.abs(changed.d_spacing-1/Math.hypot(.125/.02,.03125/-.03))<1e-12);
  const panel=await current.tool('image_panel_open',{request_id:'compiled-panel',object_id:fft.object_id});
  const connection=JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',panel.panel_id+'.json'),'utf8'));panelPID=connection.pid;
  const origin=panel.panel_url.split('/#')[0];
  for(const [route,mime] of [['/','text/html'],['/app.mjs','javascript'],['/coordinates.mjs','javascript'],['/style.css','text/css']]){
   const response=await fetch(origin+route);assert.equal(response.status,200,route);assert.ok(response.headers.get('content-type').includes(mime),route);assert.ok((await response.text()).length>0);
  }
  const state=await current.tool('image_panel_current',{panel_id:panel.panel_id});assert.equal(state.view.object.object_id,fft.object_id);
  assert.equal(fftCount(),1,'Recovery, export, continuation and Panel must not recompute the saved FFT');
  assert.equal(hash(source),originalSource);
  for(const [relative,digest] of Object.entries(existing))assert.equal(hash(path.join(workRoot,relative)),digest,'Historical workspace file changed: '+relative);
  if(process.env.MICROSCOPY_COMPAT_RETAIN==='1'){
   keepOutput=true;writeFileSync(path.join(directory,'browser-review.json'),JSON.stringify({package_root:installed,workspace,panel_url:panel.panel_url,panel_id:panel.panel_id,object_id:fft.object_id},null,2));
   t.diagnostic('Retained public fixture and live copied-package Panel: '+path.join(directory,'browser-review.json'));
  }
  t.diagnostic('PASS: exact frozen JS schema/workspace → copied compiled plugin → original requests/context/export/remeasure/Panel assets; old bytes and one FFT preserved. Browser gestures/model/GMS NOT_TESTED.');
 }finally{
  for(const client of clients)await client.close();
  if(!keepOutput){
   const ownedPIDs=new Set(panelPID?[panelPID]:[]);
   const panelDirectory=path.join(workspace,'panel-registry','panels');
   if(existsSync(panelDirectory))for(const file of readdirSync(panelDirectory)){
    try{const owned=JSON.parse(readFileSync(path.join(panelDirectory,file),'utf8'));if(Number.isSafeInteger(owned.pid)&&owned.pid>0)ownedPIDs.add(owned.pid);}catch{}
   }
   for(const pid of ownedPIDs)try{process.kill(pid);}catch{}
   // This test owns only the mkdtemp child verified below.
   assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('microscopy-compiled-baseline-'));
   // Windows can retain the helper's cwd briefly while its stdio child exits.
   rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
 }
});
