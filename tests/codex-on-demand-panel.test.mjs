import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {acquireAnalysisWorkspaceOwner,AnalysisWorkspace} from '../lib/analysis_workspace.mjs';
import {DesktopPanelNotDispatched} from '../lib/desktop_panel_activation.mjs';

const panel_id='a'.repeat(32),helper_session_id='b'.repeat(32);
const object_id='c'.repeat(32),token='d'.repeat(48);
const data=result=>JSON.parse(result.content[0].text);

async function fixture(t,run) {
 const workspace=mkdtempSync(path.join(os.tmpdir(),'mwb-on-demand-'));
 t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 const receipts=new Map(),calls=[];
 const state={panel_id,helper_session_id,panel_generation:1,state_revision:4,object:{object_id}};
 let dispatch=async()=>({status:'activated',visible:true,focused:false,reused:false});
 const manager=()=>new ImagePanelManager({
  workspace,python:'unused',inspect:()=>assert.fail('Unexpected provider work'),
  launch:()=>assert.fail('Unexpected Panel launch'),
  fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(state)}),
  desktopActivation:{
   activate:async input=>{calls.push(input);return dispatch(input);},
   read:input=>receipts.get(input.requestId)??null,
  },
 });
 const instance=manager();
 instance.initialize();
 writeFileSync(instance.connectionFile(panel_id),JSON.stringify({
  schema_version:2,panel_id,port:31234,token,pid:process.pid,status:'running',
  evidence_token:'e'.repeat(64),helper_session_id,generation:1,
  checkpoint_file:path.join(workspace,'unused-checkpoint.json'),
 }));
 await run({workspace,state,manager,calls,receipts,setDispatch:fn=>{dispatch=fn;}});
}

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
