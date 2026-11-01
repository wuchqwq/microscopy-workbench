// Actual Inspector/HTTP/owned-registration contracts with a controlled provider.
// Real stdio/Python/scientific qualification is in the separate opt-in smoke.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startResearcherInspector} from '../tools/researcher_inspector.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {readOwnedPanelConnection,readOwnedPanelCheckpoint} from '../lib/panel_ownership.mjs';
const id=n=>n.toString(16).padStart(32,'0'),T=id(1),F=id(2),V=id(3),png='iVBORw0KGgo=';
function fixture(){
 const calls=[],base={ok:true,state:'completed',backend:'external-image-workspace'};
 const objects={
  [T]:{...base,object_id:T,request_id:'source',kind:'tiff_source',page_count:1},
  [F]:{...base,object_id:F,request_id:'frame',kind:'frame',source_object_id:T,frame_index:0,shape_yx:[3,4],dtype:'float32'},
  [V]:{...base,object_id:V,request_id:'preview',kind:'view',parent_object_id:F,shape_yx:[3,4],dtype:'float32',annotations:[],panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,4,3],image_rect_xyxy:[0,0,4,3]}],display:{gamma:1,display_range:[0,10]}}
 };
 return {calls,createClient:()=>({async rpc(name){return {result:name==='tools/list'?{tools:['image_info','image_open','image_frame','image_preview'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){calls.push({name,args:structuredClone(args)});let object;if(name==='image_info')object=objects[args.object_id];else if(name==='image_open')object=objects[T];else if(name==='image_frame')object=objects[F];else if(name==='image_preview')object=objects[V];else assert.fail('Unexpected scientific submission '+name);assert.ok(object);return {data:structuredClone(object),...(object.object_id===V?{png}:{})};},async close(){}})};
}
const text=result=>JSON.parse(result.content.find(c=>c.type==='text').text);
test('normal Inspector registers its real helper and cold reopen keeps the Panel identity without scientific replay',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'owned-inspector-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture();let first,second;
 try{
  writeFileSync(source,'Public controlled-port fixture; not a scientific decoding test');
  first=await startResearcherInspector({workspace,python:process.execPath,source},{createClient:provider.createClient});
  const a=first.panel_registration;assert.equal(a.status,'registered');assert.match(a.panel_id,/^[a-f0-9]{32}$/);assert.equal(first.panel.state().panel_id,a.panel_id);
  const manager=new ImagePanelManager({workspace,python:process.execPath,inspect:()=>assert.fail('Current selection must not submit science')});
  assert.equal(text(await manager.call('image_panel_current',{panel_id:a.panel_id})).view.object.object_id,V);
  const connection=readOwnedPanelConnection(workspace,a.panel_id),snapshot=readOwnedPanelCheckpoint(workspace,connection);assert.equal(connection.pid,process.pid);assert.equal(snapshot.object_id,V);
  await first.close();await first.close();first=null;
  const checkpointBytes=readFileSync(connection.checkpoint_file);
  assert.equal(readOwnedPanelConnection(workspace,a.panel_id).status,'closed');const start=provider.calls.length;
  second=await startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient});
  const b=second.panel_registration;assert.equal(second.resumed,true);assert.equal(b.panel_id,a.panel_id);assert.equal(b.generation,a.generation+1);assert.notEqual(b.helper_session_id,a.helper_session_id);
  assert.equal(second.panel.state().object.object_id,V);assert.ok(second.panel.state().edit_state.draft_revision>snapshot.edit_state.draft_revision);
  assert.ok(provider.calls.slice(start).every(c=>c.name==='image_info'),'reopening cannot replay open/frame/preview or another write');
  assert.deepEqual(readFileSync(connection.checkpoint_file),checkpointBytes,'old checkpoint is immutable');
  assert.equal(text(await manager.call('image_panel_current',{panel_id:a.panel_id})).view.helper_session_id,b.helper_session_id);
 }finally{await first?.close();await second?.close();rmSync(workspace,{recursive:true,force:true});}
});
test('a live Inspector refuses a second helper and missing registered ownership never becomes a guessed registration',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-owned-refusal-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture();let instance;
 try{
  writeFileSync(source,'Public controlled-port fixture');instance=await startResearcherInspector({workspace,python:process.execPath,source},{createClient:provider.createClient});
  const registration=instance.panel_registration,start=provider.calls.length;
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient}),/still present|duplicate|Previous owned helper/);
  assert.equal(provider.calls.length,start);await instance.close();instance=null;
  const pointer=path.join(workspace,'researcher-inspector','latest-panel.json'),before=readFileSync(pointer);
  unlinkSync(path.join(workspace,'panel-registry','panels',registration.panel_id+'.json'));
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient}),/ownership is missing/);
  assert.deepEqual(readFileSync(pointer),before);
 }finally{await instance?.close();rmSync(workspace,{recursive:true,force:true});}
});

test('failure saving the Inspector pointer normally closes an already published helper generation',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-pointer-failure-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture();
 try{
  writeFileSync(source,'Public controlled-port fixture');
  const createClient=()=>{const client=provider.createClient(),tool=client.tool;return {...client,async tool(name,args){const result=await tool(name,args);if(name==='image_info'&&args.object_id===V)mkdirSync(path.join(workspace,'researcher-inspector','latest-panel.json'),{recursive:true});return result;}};};
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/EISDIR|EPERM|EACCES|directory/);
  const session=JSON.parse(readFileSync(path.join(workspace,'researcher-inspector','session.json'),'utf8'));
  const connection=readOwnedPanelConnection(workspace,session.session_id);assert.equal(connection.status,'closed');assert.equal(connection.generation,1);
  const manager=new ImagePanelManager({workspace,python:process.execPath,inspect:()=>assert.fail('Closed query must not compute')});
  await assert.rejects(manager.call('image_panel_current',{panel_id:session.session_id}),/normally closed/);
 }finally{rmSync(workspace,{recursive:true,force:true});}
});
