// Actual Inspector/HTTP/owned-registration contracts with a controlled provider.
// Real stdio/Python/scientific qualification is in the separate opt-in smoke.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {startResearcherInspector} from '../tools/researcher_inspector.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {readOwnedPanelConnection,readOwnedPanelCheckpoint} from '../lib/panel_ownership.mjs';
const id=n=>n.toString(16).padStart(32,'0'),T=id(1),F=id(2),V=id(3),png='iVBORw0KGgo=';
test('compiled inspector help uses the package script and exits without opening a scientific workspace',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../tools/researcher_inspector.mjs',import.meta.url)),'--help'],{encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/npm run inspect -- --source/);assert.match(result.stdout,/npm run build/);
 assert.doesNotMatch(result.stdout,/node tools\/researcher_inspector\.mjs/);assert.equal(result.stderr,'');
});
function fixture(workspace){
 const calls=[],base={ok:true,state:'completed',backend:'external-image-workspace'};
 const objects={
  [T]:{...base,object_id:T,request_id:'source',kind:'tiff_source',page_count:1},
  [F]:{...base,object_id:F,request_id:'frame',kind:'frame',source_object_id:T,frame_index:0,shape_yx:[3,4],dtype:'float32'},
  [V]:{...base,object_id:V,request_id:'preview',kind:'view',parent_object_id:F,shape_yx:[3,4],dtype:'float32',annotations:[],panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,4,3],image_rect_xyxy:[0,0,4,3]}],display:{gamma:1,display_range:[0,10]},files_sha256:{'preview.png':createHash('sha256').update(Buffer.from(png,'base64')).digest('hex')}}
 };
 return {calls,objects,createClient:({workspace:outputWorkspace=workspace}={})=>({async rpc(name){return {result:name==='tools/list'?{tools:['image_info','image_open','image_frame','image_preview'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){calls.push({name,args:structuredClone(args)});let object;if(name==='image_info')object=objects[args.object_id];else if(name==='image_open')object=objects[T];else if(name==='image_frame')object=objects[F];else if(name==='image_preview')object=objects[V];else assert.fail('Unexpected scientific submission '+name);assert.ok(object);if(outputWorkspace){const directory=path.join(outputWorkspace,'objects',object.object_id);mkdirSync(directory,{recursive:true});if(!existsSync(path.join(directory,'object.json')))writeFileSync(path.join(directory,'object.json'),JSON.stringify(object));if(object.object_id===V&&!existsSync(path.join(directory,'preview.png')))writeFileSync(path.join(directory,'preview.png'),Buffer.from(png,'base64'));}return {data:structuredClone(object),...(object.object_id===V?{png}:{})};},async close(){}})};
}
const text=result=>JSON.parse(result.content.find(c=>c.type==='text').text);
test('normal Inspector registers its real helper and cold reopen keeps the Panel identity without scientific replay',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'owned-inspector-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let first,second;
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
test('explicit saved A reopens with the separate original submitted B request, and query never replays or silently adopts B',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-unresolved-saved-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace),B=id(5),original='original-unresolved-preview-B';let first,second,third,queries=0;
 const createClient=options=>{const client=provider.createClient(options),rpc=client.rpc,tool=client.tool;return {...client,async rpc(name,params){const reply=await rpc(name,params);if(name==='tools/list')reply.result.tools.push({name:'image_result',inputSchema:{}});return reply;},async tool(name,args){if(name==='image_result'){queries++;assert.equal(args.request_id,original);return {data:structuredClone(provider.objects[B]),png};}return tool(name,args);}};};
 const post=async(instance,route,body)=>{const origin=instance.panel.url.split('/#')[0],response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Panel-Token':instance.panel.token,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 try{writeFileSync(source,'Public controlled-port source');first=await startResearcherInspector({workspace,python:process.execPath,source},{createClient});let state=first.panel.state(),result=await post(first,'/api/workspace',{action:'save',save_id:'saved-analysis-A',expected_working_revision:state.workspace_analysis.working_revision});assert.equal(result.status,200,result.data.error);await first.close();const connection=readOwnedPanelConnection(workspace,first.panel_registration.panel_id),checkpoint=readOwnedPanelCheckpoint(workspace,connection);first=null;
  writeFileSync(path.join(path.dirname(connection.checkpoint_file),original+'.request.json'),JSON.stringify({name:'image_preview',arguments:{object_id:V,gamma:2,request_id:original}}));checkpoint.last_operation={state:'submitted',tool:'image_preview',object_id:V,request_id:original};writeFileSync(connection.checkpoint_file,JSON.stringify(checkpoint));provider.objects[B]={...structuredClone(provider.objects[V]),object_id:B,request_id:original,parent_object_id:V,display:{gamma:2,display_range:[0,10]}};const dir=path.join(workspace,'objects',B);mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'preview.png'),Buffer.from(png,'base64'));writeFileSync(path.join(dir,'object.json'),JSON.stringify(provider.objects[B]));
  const before=provider.calls.length;second=await startResearcherInspector({workspace,python:process.execPath},{createClient});state=second.panel.state();assert.equal(state.object.object_id,V);assert.equal(state.workspace_analysis.dirty,false);assert.equal(state.last_operation.request_id,original);assert.equal(state.workspace_analysis.unresolved_request_id,original);assert.equal(state.workspace_analysis.can_close,false);result=await post(second,'/api/workspace',{action:'close',expected_working_revision:state.workspace_analysis.working_revision});assert.equal(result.status,409);await second.close();second=null;
  third=await startResearcherInspector({workspace,python:process.execPath},{createClient});state=third.panel.state();assert.equal(state.object.object_id,V);assert.equal(state.last_operation.request_id,original);result=await post(third,'/api/action',{action:'recover',expected_object_id:V,draft_revision:state.edit_state.draft_revision,params:{request_id:original}});assert.equal(result.status,200,result.data.error);assert.equal(queries,1);assert.equal(result.data.object.object_id,V);assert.equal(result.data.pending_result.object_id,B);assert.equal(result.data.last_operation.result_not_adopted,true);assert.ok(provider.calls.slice(before).every(call=>call.name==='image_info'),'Reopen/query cannot replay image_preview or another write');
 }finally{await first?.close();await second?.close();await third?.close();assert.equal(path.dirname(workspace),path.resolve(tmpdir()));rmSync(workspace,{recursive:true,force:true});}
});
test('a live Inspector refuses a second helper and missing registered ownership never becomes a guessed registration',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-owned-refusal-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let instance;
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
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-pointer-failure-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);
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


// Only the helper ownership claim may be rolled back. The Inspector session and
// any provider requests remain original records, including failed/unknown work.
const sessionAt=workspace=>JSON.parse(readFileSync(path.join(workspace,'researcher-inspector','session.json'),'utf8'));
const lockAt=workspace=>path.join(workspace,'panel-registry','panels',sessionAt(workspace).session_id+'.lock');
const connectionAt=workspace=>path.join(workspace,'panel-registry','panels',sessionAt(workspace).session_id+'.json');
const startupBytes=workspace=>Object.fromEntries(readdirSync(path.join(workspace,'researcher-inspector','startup')).map(name=>[name,readFileSync(path.join(workspace,'researcher-inspector','startup',name))]));

for(const mode of ['client_constructor','initialize_rejection','initialize_error_reply']){
 test(`pre-helper ${mode} releases only its claim and permits explicit same-workspace retry`,async()=>{
  const workspace=mkdtempSync(path.join(tmpdir(),'inspector-prelaunch-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let instance,attempts=0,closed=0;
  try{
   writeFileSync(source,'Public controlled-port fixture');
   const createClient=()=>{attempts++;if(mode==='client_constructor')throw Error('Controlled bootstrap constructor failure');const client=provider.createClient();return {...client,async rpc(){if(mode==='initialize_rejection')throw Error('Controlled initialize failure');return {error:{message:'Controlled initialize error reply'}};},async close(){closed++;await client.close();}};};
   await assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/Controlled/);
   assert.equal(attempts,1);assert.equal(closed,mode==='client_constructor'?0:1);
   assert.equal(provider.calls.length,0,'Initialization failure must not submit science');
   assert.equal(existsSync(connectionAt(workspace)),false,'No helper was published');
   assert.equal(existsSync(lockAt(workspace)),false,'A provably pre-helper failure must not poison the workspace');
   const sessionFile=path.join(workspace,'researcher-inspector','session.json'),before=readFileSync(sessionFile);
   instance=await startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient});
   assert.equal(instance.panel_registration.status,'registered');assert.equal(instance.panel_registration.generation,1);
   assert.equal(instance.panel_registration.panel_id,sessionAt(workspace).session_id);
   assert.deepEqual(readFileSync(sessionFile),before,'Same original session; no replacement workspace');
  }finally{await instance?.close();rmSync(workspace,{recursive:true,force:true});}
 });
}

test('pre-helper image_info failure on cold reopen preserves the closed generation and original scientific requests',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-read-prelaunch-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let first,second;
 try{
  writeFileSync(source,'Public controlled-port fixture');first=await startResearcherInspector({workspace,python:process.execPath,source},{createClient:provider.createClient});
  const id=first.panel_registration.panel_id;await first.close();first=null;
  const connection=readOwnedPanelConnection(workspace,id),beforeConnection=readFileSync(connectionAt(workspace)),beforeCheckpoint=readFileSync(connection.checkpoint_file),beforeStartup=startupBytes(workspace),beforeSession=readFileSync(path.join(workspace,'researcher-inspector','session.json'));
  let clients=0;const createClient=()=>{clients++;const c=provider.createClient();return {...c,async tool(name){assert.equal(name,'image_info');throw Error('Controlled saved-read failure');}};};
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient}),/Controlled saved-read/);
  assert.equal(clients,1,'Failure is before a Panel client is created');assert.equal(existsSync(lockAt(workspace)),false);
  assert.deepEqual(readFileSync(connectionAt(workspace)),beforeConnection);assert.deepEqual(readFileSync(connection.checkpoint_file),beforeCheckpoint);
  const callStart=provider.calls.length;second=await startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient});
  assert.equal(second.panel_registration.panel_id,id);assert.equal(second.panel_registration.generation,2);
  assert.ok(provider.calls.slice(callStart).every(c=>c.name==='image_info'),'Reopen only reads old science');
  assert.deepEqual(startupBytes(workspace),beforeStartup);assert.deepEqual(readFileSync(path.join(workspace,'researcher-inspector','session.json')),beforeSession);assert.deepEqual(readFileSync(connection.checkpoint_file),beforeCheckpoint);
 }finally{await first?.close();await second?.close();rmSync(workspace,{recursive:true,force:true});}
});

test('pre-helper cleanup failure after saved startup queries original requests on retry, never replays science',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-close-prelaunch-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace),outcomes=new Map();let instance,clients=0,failClose=true;
 try{
  writeFileSync(source,'Public controlled-port fixture');
  const createClient=()=>{const c=provider.createClient(),index=++clients;return {...c,async tool(name,args){if(name==='image_result'){assert.ok(outcomes.has(args.request_id));return structuredClone(outcomes.get(args.request_id));}const result=await c.tool(name,args);if(args.request_id)outcomes.set(args.request_id,structuredClone(result));return result;},async close(){await c.close();if(index===1&&failClose){failClose=false;throw Error('Controlled bootstrap close failure');}}};};
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/Controlled bootstrap close/);
  assert.equal(existsSync(lockAt(workspace)),false);assert.equal(existsSync(connectionAt(workspace)),false);
  const before=startupBytes(workspace),start=provider.calls.length;
  instance=await startResearcherInspector({workspace,python:process.execPath},{createClient});
  assert.equal(instance.panel_registration.generation,1);assert.equal(outcomes.size,3);
  assert.ok(provider.calls.slice(start).every(c=>c.name==='image_info'),'Original open/frame/preview must not be resubmitted');assert.deepEqual(startupBytes(workspace),before);
 }finally{await instance?.close();rmSync(workspace,{recursive:true,force:true});}
});

test('concurrent Inspector cannot steal or release the first unlaunched claim',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-concurrent-prelaunch-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let instance,release,entered,first;
 const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
 try{
  writeFileSync(source,'Public controlled-port fixture');
  const createClient=()=>{const c=provider.createClient();return {...c,async rpc(){entered();await gate;throw Error('Controlled paused initialize failure');}};};
  first=assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/Controlled paused/);await ready;
  const before=readFileSync(lockAt(workspace));let competitorClients=0;
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient:()=>{competitorClients++;return provider.createClient();}}),/EEXIST/);
  assert.equal(competitorClients,0);assert.deepEqual(readFileSync(lockAt(workspace)),before,'Competitor must leave the owner claim untouched');
  release();await first;assert.equal(existsSync(lockAt(workspace)),false);
  instance=await startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient});assert.equal(instance.panel_registration.generation,1);
 }finally{release();await first;await instance?.close();rmSync(workspace,{recursive:true,force:true});}
});

test('prelaunch rollback refuses a foreign nonce rather than deleting a changed claim',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-foreign-prelaunch-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let replaced;
 try{
  writeFileSync(source,'Public controlled-port fixture');
  const createClient=()=>{const c=provider.createClient();return {...c,async rpc(){const lock=JSON.parse(readFileSync(lockAt(workspace),'utf8'));lock.nonce='e'.repeat(64);replaced=Buffer.from(JSON.stringify(lock));writeFileSync(lockAt(workspace),replaced);throw Error('Controlled bootstrap failure with changed claim');}};};
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/claim.*retained|lock.*match/);
  assert.deepEqual(readFileSync(lockAt(workspace)),replaced);assert.equal(existsSync(connectionAt(workspace)),false);
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient}),/EEXIST/);
 }finally{rmSync(workspace,{recursive:true,force:true});}
});

test('failure after helper entry begins retains its claim and cannot be treated as prelaunch rollback',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-helper-unknown-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let clients=0;
 try{
  writeFileSync(source,'Public controlled-port fixture');
  const createClient=()=>{const c=provider.createClient();return ++clients===2?{...c,async rpc(){throw Error('Controlled helper-entry failure');}}:c;};
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/Controlled helper-entry/);
  assert.equal(clients,2);const before=readFileSync(lockAt(workspace));
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient:provider.createClient}),/EEXIST/);
  assert.deepEqual(readFileSync(lockAt(workspace)),before,'Helper-entry unknown state stays fail-closed');
 }finally{rmSync(workspace,{recursive:true,force:true});}
});

test('releasing a pre-helper claim never resets or resubmits a failed scientific startup request',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'inspector-science-failure-')),source=path.join(workspace,'public-placeholder.tiff'),provider=fixture(workspace);let submissions=0,queries=0,originalId;
 try{
  writeFileSync(source,'Public controlled-port fixture');
  const createClient=()=>{const c=provider.createClient();return {...c,async tool(name,args){if(name==='image_open'){submissions++;originalId=args.request_id;throw Error('Controlled original science failure');}assert.equal(name,'image_result');assert.equal(args.request_id,originalId);queries++;throw Error('Controlled original science failure');}};};
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath,source},{createClient}),/original science failure/);
  const before=startupBytes(workspace),session=readFileSync(path.join(workspace,'researcher-inspector','session.json'));
  assert.equal(existsSync(lockAt(workspace)),false);
  await assert.rejects(startResearcherInspector({workspace,python:process.execPath},{createClient}),/original science failure/);
  assert.equal(submissions,1);assert.equal(queries,1);assert.equal(existsSync(lockAt(workspace)),false);assert.equal(existsSync(connectionAt(workspace)),false);
  assert.deepEqual(startupBytes(workspace),before);assert.deepEqual(readFileSync(path.join(workspace,'researcher-inspector','session.json')),session);
 }finally{rmSync(workspace,{recursive:true,force:true});}
});
