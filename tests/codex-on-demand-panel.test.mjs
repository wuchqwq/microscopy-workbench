import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {acquireAnalysisWorkspaceOwner,AnalysisWorkspace} from '../lib/analysis_workspace.mjs';
import {DesktopPanelNotDispatched} from '../lib/desktop_panel_activation.mjs';

const panel_id='a'.repeat(32),helper_session_id='b'.repeat(32);
const object_id='c'.repeat(32),token='d'.repeat(48);
const data=result=>JSON.parse(result.content[0].text);

function panelConnection(workspace,id=panel_id){
 return {
  schema_version:2,panel_id:id,port:31234,token,pid:process.pid,status:'running',
  evidence_token:'e'.repeat(64),helper_session_id,generation:1,
  checkpoint_file:path.join(workspace,'unused-checkpoint.json'),
 };
}

async function fixture(t,run,{withConnection=true}={}) {
 const workspace=mkdtempSync(path.join(os.tmpdir(),'mwb-on-demand-'));
 t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 const receipts=new Map(),calls=[];
 const state={panel_id,helper_session_id,panel_generation:1,state_revision:4,object:{object_id}};
 let dispatch=async()=>({status:'activated',visible:true,focused:false,reused:false});
 const manager=(options={})=>new ImagePanelManager({
  workspace,python:'unused',inspect:()=>assert.fail('Unexpected provider work'),
  launch:()=>assert.fail('Unexpected Panel launch'),
  fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(state)}),
  desktopActivation:{
   activate:async input=>{calls.push(input);return dispatch(input);},
   read:input=>receipts.get(input.requestId)??null,
  },
  ...options,
 });
 const instance=manager();
 instance.initialize();
 if(withConnection)writeFileSync(instance.connectionFile(panel_id),JSON.stringify(panelConnection(workspace)));
 await run({workspace,state,manager,calls,receipts,setDispatch:fn=>{dispatch=fn;}});
}

const preview={content:[{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='}]};
const openArgs=request_id=>({object_id,request_id});
const ownerFile=workspace=>path.join(workspace,'analysis-workspace','owner.json');
const readReceipt=(manager,requestId)=>JSON.parse(readFileSync(manager.requestFile(requestId),'utf8'));

function openFixture(t,run,{withConnection=false}={}){
 return fixture(t,async({workspace,state,manager})=>{
  const calls={inspect:0,launch:0};
  const openManager=({launch=()=>assert.fail('Unexpected helper launch'),...options}={})=>manager({
   inspect:id=>{assert.equal(id,object_id);calls.inspect++;return preview;},
   launch:request=>{calls.launch++;return launch(request);},
   readyTimeoutMs:250,
   ...options,
  });
  await run({workspace,state,openManager,calls});
 },{withConnection});
}

test('occupied workspace refuses new Panel and retains exact original owner and reuse hint',t=>openFixture(t,async({workspace,state,openManager,calls})=>{
 const owner=acquireAnalysisWorkspaceOwner(workspace,{role:'gui',owner_id:helper_session_id});
 const manager=openManager();
 const args=openArgs('open-occupied');
 const beforeOwner=readFileSync(ownerFile(workspace));
 const beforeConnection=readFileSync(manager.connectionFile(panel_id));
 let refusal;
 try{
  await assert.rejects(manager.call('image_panel_open',args),error=>{
   assert.match(error.message,/PANEL_WORKSPACE_OCCUPIED/);
   assert.match(error.message,/image_panel_current/);
   assert.ok(error.message.includes(panel_id));
   assert.ok(!error.message.includes(token));
   refusal=error.message;
   return true;
  });
  assert.equal(readReceipt(manager,args.request_id).status,'failed');
  assert.deepEqual(readFileSync(ownerFile(workspace)),beforeOwner);
  assert.deepEqual(readFileSync(manager.connectionFile(panel_id)),beforeConnection);
  assert.deepEqual(readdirSync(manager.panels),[panel_id+'.json']);
  assert.equal(existsSync(path.join(manager.directory,'registrations')),false);
  assert.equal(data(await manager.call('image_panel_current',{panel_id})).view.object.object_id,state.object.object_id);
 }finally{owner.release();}
 await assert.rejects(openManager().call('image_panel_open',args),error=>error.message===refusal);
 assert.equal(calls.launch,0);
},{withConnection:true}));

test('CLI, unmatched GUI and malformed owner claims block without guessing a Panel',async t=>{
 for(const [name,claim,message] of [
  ['cli',{schema_version:1,role:'cli',owner_id:helper_session_id,pid:process.pid},/PANEL_WORKSPACE_OCCUPIED/],
  ['other-session',{schema_version:1,role:'gui',owner_id:'f'.repeat(32),pid:process.pid},/PANEL_WORKSPACE_OCCUPIED/],
  ['other-process',{schema_version:1,role:'gui',owner_id:helper_session_id,pid:2_147_483_647},/PANEL_WORKSPACE_OCCUPIED/],
  ['malformed',{schema_version:1,role:'gui',owner_id:helper_session_id,pid:'invalid'},/Cannot verify the analysis workspace owner/],
 ])await t.test(name,tt=>openFixture(tt,async({workspace,openManager,calls})=>{
  const file=ownerFile(workspace);
  mkdirSync(path.dirname(file),{recursive:true});
  const bytes=JSON.stringify({...claim,created_utc:'2026-01-01T00:00:00Z'});
  writeFileSync(file,bytes);
  const manager=openManager(),args=openArgs('open-owner-'+name);
  await assert.rejects(manager.call('image_panel_open',args),error=>{
   assert.match(error.message,message);
   assert.ok(!error.message.includes(panel_id));
   assert.ok(!error.message.includes(token));
   return true;
  });
  assert.equal(readReceipt(manager,args.request_id).status,'failed');
  assert.equal(calls.launch,0);
  assert.equal(readFileSync(file,'utf8'),bytes);
  assert.deepEqual(readdirSync(manager.panels),[panel_id+'.json']);
 },{withConnection:true}));
});

test('a previous submitted open remains unknown even when a different owner is now visible',t=>openFixture(t,async({workspace,openManager,calls})=>{
 const owner=acquireAnalysisWorkspaceOwner(workspace,{role:'gui',owner_id:helper_session_id});
 try{
  const manager=openManager(),args=openArgs('legacy-unknown-open');
  const file=manager.requestFile(args.request_id);
  const original=JSON.stringify({schema_version:1,request_id:args.request_id,name:'image_panel_open',
   arguments:args,panel_id:'f'.repeat(32),status:'submitted'});
  writeFileSync(file,original);
  await assert.rejects(manager.call('image_panel_open',args),/unverified/);
  assert.equal(readFileSync(file,'utf8'),original);
  assert.deepEqual(calls,{inspect:0,launch:0});
 }finally{owner.release();}
},{withConnection:true}));

test('exact child occupancy exit after preflight is a terminal refusal',t=>openFixture(t,async({openManager,calls})=>{
 const exit={code:73,signal:null};
 const args=openArgs('open-owner-race');
 const manager=openManager({launch:({onExit})=>onExit(exit)});
 let refusal;
 await assert.rejects(manager.call('image_panel_open',args),error=>{
  assert.match(error.message,/PANEL_WORKSPACE_OCCUPIED/);
  refusal=error.message;
  return true;
 });
 const receipt=readReceipt(manager,args.request_id);
 assert.equal(receipt.status,'failed');
 assert.deepEqual(receipt.launch_exit,exit);
 await assert.rejects(openManager().call('image_panel_open',args),error=>error.message===refusal);
 assert.equal(calls.launch,1);
}));

test('generic child exit or signal remains unknown with bounded diagnostics and no replay',async t=>{
 for(const [name,exit,diagnostic] of [
  ['code',{code:17,signal:null},/Observed helper exit code: 17/],
  ['signal',{code:null,signal:'SIGTERM'},/Observed helper signal: SIGTERM/],
 ])await t.test(name,tt=>openFixture(tt,async({openManager,calls})=>{
  const args=openArgs('open-unknown-'+name);
  const manager=openManager({launch:({onExit})=>onExit(exit)});
  const check=error=>{
   assert.match(error.message,/unverified/);
   assert.match(error.message,diagnostic);
   return true;
  };
  await assert.rejects(manager.call('image_panel_open',args),check);
  const receipt=readReceipt(manager,args.request_id);
  assert.equal(receipt.status,'submitted');
  assert.deepEqual(receipt.launch_exit,exit);
  await assert.rejects(openManager().call('image_panel_open',args),check);
  assert.deepEqual(readReceipt(manager,args.request_id),receipt);
  assert.equal(calls.launch,1);
 }));
});

test('an exact published connection takes precedence over a generic launch exit',t=>openFixture(t,async({workspace,state,openManager,calls})=>{
 const args=openArgs('open-published');
 const manager=openManager({launch:request=>{
  state.panel_id=request.panel_id;
  writeFileSync(request.connection_file,JSON.stringify(panelConnection(workspace,request.panel_id)));
  request.onExit({code:17,signal:null});
 }});
 const opened=data(await manager.call('image_panel_open',args));
 const receipt=readReceipt(manager,args.request_id);
 assert.equal(receipt.status,'completed');
 assert.equal(opened.panel_id,receipt.panel_id);
 const recovered=data(await openManager().call('image_panel_open',args));
 assert.equal(recovered.panel_id,opened.panel_id);
 assert.equal(recovered.recovered,true);
 assert.equal(calls.launch,1);
}));

test('state read failure after launch is not proof that the original open did not start',t=>openFixture(t,async({workspace,state,openManager,calls})=>{
 const args=openArgs('open-published-state-conflict');
 const manager=openManager({
  launch:request=>{
   state.panel_id=request.panel_id;
   writeFileSync(request.connection_file,JSON.stringify(panelConnection(workspace,request.panel_id)));
  },
  fetchImpl:async()=>({ok:false,status:409,text:async()=>JSON.stringify({error:'Panel state unavailable'})}),
 });
 await assert.rejects(manager.call('image_panel_open',args),/Panel state unavailable/);
 const receipt=readReceipt(manager,args.request_id);
 assert.equal(receipt.status,'submitted');
 const recovered=data(await openManager().call('image_panel_open',args));
 assert.equal(recovered.panel_id,receipt.panel_id);
 assert.equal(recovered.recovered,true);
 assert.equal(calls.launch,1);
}));

test('invalid Python is a known non-start and original open receipt stays failed',t=>openFixture(t,async({workspace,openManager})=>{
 const args=openArgs('open-invalid-python');
 const manager=new ImagePanelManager({workspace,python:'relative-python',inspect:()=>preview,readyTimeoutMs:250});
 await assert.rejects(manager.call('image_panel_open',args),/absolute.*PYTHON/);
 assert.equal(readReceipt(manager,args.request_id).status,'failed');
 assert.equal(existsSync(path.join(manager.directory,'registrations')),false);
 await assert.rejects(openManager().call('image_panel_open',args),/absolute.*PYTHON/);
}));

test('Windows native tools are opt-in on the same core provider',t=>fixture(t,async({workspace})=>{
 for(const [flags,available] of [[{},false],[{MICROSCOPY_PANEL:'0',MICROSCOPY_PANEL_DESKTOP:'1'},false],
  [{MICROSCOPY_PANEL:'1',MICROSCOPY_PANEL_DESKTOP:'1'},process.platform==='win32']]){
  const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,...flags}});
  try{
   const tools=runtime.registry.listTools().map(tool=>tool.name);
   assert.equal(tools.includes('image_panel_activate'),available);
   assert.equal(tools.includes('image_panel_saved'),available);
   assert.ok(tools.includes('image_info'));
  }finally{runtime.close();}
 }
}));

test('same activation recovers the original window observation across managers',t=>fixture(t,async({manager,calls})=>{
 const args={panel_id,request_id:'first-activation'};
 const first=data(await manager().call('image_panel_activate',args));
 assert.equal(first.panel_id,panel_id);
 assert.equal(first.helper_session_id,helper_session_id);
 assert.equal(first.panel_generation,1);
 assert.deepEqual(first.activation,{status:'activated',visible:true,focused:false,reused:false});
 assert.equal(first.recovered,false);
 const second=data(await manager().call('image_panel_activate',args));
 assert.deepEqual(second,{...first,recovered:true});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,`http://127.0.0.1:31234/#${token}`);
 assert.ok(!JSON.stringify(first).includes(token));
 await assert.rejects(manager().call('image_panel_activate',{...args,panel_id:object_id}),/conflicts/);
}));

test('cancelled activation remains query-only until the original receipt arrives',t=>fixture(t,async({manager,setDispatch,calls,receipts})=>{
 let entered,finish;
 const started=new Promise(resolve=>{entered=resolve;});
 const dispatched=new Promise(resolve=>{finish=resolve;});
 setDispatch(()=>{entered();return dispatched;});
 const args={panel_id,request_id:'cancel-wait'};
 const controller=new AbortController();
 const waiting=manager().call('image_panel_activate',args,controller.signal);
 await started;
 controller.abort();
 await assert.rejects(waiting,/Stopped waiting/);
 await assert.rejects(manager().call('image_panel_activate',args),/unverified/);
 const observation={status:'activated',visible:true,focused:true,reused:true};
 receipts.set(args.request_id,observation);
 const recovered=data(await manager().call('image_panel_activate',args));
 assert.equal(recovered.recovered,true);
 assert.deepEqual(recovered.activation,observation);
 finish(observation);
 assert.equal(calls.length,1);
}));

test('known non-dispatch remains failed and mismatched helper is refused before native launch',t=>fixture(t,async({manager,setDispatch,calls,state})=>{
 setDispatch(async()=>{throw new DesktopPanelNotDispatched('Desktop runtime missing');});
 const args={panel_id,request_id:'missing-runtime'};
 await assert.rejects(manager().call('image_panel_activate',args),/runtime missing/);
 await assert.rejects(manager().call('image_panel_activate',args),/runtime missing/);
 state.helper_session_id='f'.repeat(32);
 await assert.rejects(manager().call('image_panel_activate',{panel_id,request_id:'foreign-helper'}),/generation/);
 assert.equal(calls.length,1);
}));

test('renderer loss reports explicit recovery and never replays the refused activation',t=>fixture(t,async({manager,setDispatch,calls})=>{
 setDispatch(async()=>({status:'refused',reason:'renderer_gone'}));
 const args={panel_id,request_id:'renderer-gone'};
 const refused=/renderer_gone.*Close the failed native window.*image_panel_resume/;
 await assert.rejects(manager().call('image_panel_activate',args),refused);
 await assert.rejects(manager().call('image_panel_activate',args),refused);
 assert.equal(calls.length,1);
}));

test('exact settled GUI save verifies stored provider references and refuses a draft or newer save',t=>fixture(t,async({workspace,manager,state})=>{
 const objectDir=path.join(workspace,'objects',object_id);
 mkdirSync(objectDir,{recursive:true});
 const manifest=path.join(objectDir,'object.json');
 writeFileSync(manifest,JSON.stringify({object_id}));
 const selection={kind:'rectangle',coordinate_space:'source_pixels',coordinates:[2,4,12,14]};
 const frame_identity={frame_object_id:object_id};
 const edit_state={dirty:false,gesture_active:false,annotation_edit:null};
 const owner=acquireAnalysisWorkspaceOwner(workspace,{role:'gui'});
 try{
  const analysis=new AnalysisWorkspace(workspace,{object_id,frame_identity,selection,edit_state,window_collection:{}},owner);
  const save_id='save-r1';
  await analysis.save(save_id,0,async()=>{});
  Object.assign(state,{workspace_analysis:analysis.status(),edit_state,pending_result:null,draft_persistence:{pending:false,error:null}});
  // A live tab can show a different object while the exact saved view is unchanged.
  state.object={object_id:panel_id};
  const saved=data(await manager().call('image_panel_saved',{panel_id,save_id}));
  assert.equal(saved.object_id,object_id);
  assert.deepEqual(saved.selection,selection);
  assert.deepEqual(saved.frame_identity,frame_identity);
  await assert.rejects(manager().call('image_panel_saved',{panel_id,save_id:'other-save'}),/no matching settled/);
  state.draft_persistence.pending=true;
  await assert.rejects(manager().call('image_panel_saved',{panel_id,save_id}),/no matching settled/);
  state.draft_persistence.pending=false;
  writeFileSync(manifest,JSON.stringify({object_id,changed:true}));
  await assert.rejects(manager().call('image_panel_saved',{panel_id,save_id}),/reference hash mismatch/);
 }finally{owner.release();}
}));
