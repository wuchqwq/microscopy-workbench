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
  const additions=['image_spatial_field','image_domain_map','image_analysis_candidates','image_field_extend','image_evidence'];
  assert.deepEqual(currentSchema.filter(tool=>!schema.some(old=>old.name===tool.name)).map(tool=>tool.name).sort(),additions.slice().sort());
  const retainedSchema=structuredClone(currentSchema.filter(tool=>!additions.includes(tool.name)));
  // Presentation controls are explicitly additive and must never become a
  // required scientific parameter or alter old full-return behavior.
  for(const name of ['image_spatial_field','image_domain_map','image_analysis_candidates','image_field_extend','image_info','image_result']){
    const tool=currentSchema.find(tool=>tool.name===name),detail=tool.inputSchema.properties.response_detail;
    assert.equal(detail.type,'string');assert.deepEqual(detail.enum.slice().sort(),['compact','full']);
    assert.ok(!tool.inputSchema.required.includes('response_detail'));
  }
  for(const name of ['image_info','image_result'])delete retainedSchema.find(tool=>tool.name===name).inputSchema.properties.response_detail;
  const contextProperties=retainedSchema.find(tool=>tool.name==='analysis_update').inputSchema.properties.selections.properties;
  for(const role of ['spatial_field','domains','active_plan']){assert.deepEqual(contextProperties[role],contextProperties.atlas,'New context selection retains the exact scoped-reference schema');delete contextProperties[role];}
  assert.deepEqual(retainedSchema,schema,'All existing schemas/descriptions remain exact except the named optional presentation controls and additive F1a/F4 tools');
  assert.deepEqual(await current.rpc('tools/call',{name:'image_result',arguments:{request_id:'unknown-original-request'}}),{...refused,id:current.next},'Original-request error remains compatible');
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
