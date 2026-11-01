// Real loopback helpers with a controlled read-only provider. These qualify
// ownership/recovery, not scientific numerics, browser gestures or process kill.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createImagePanel} from '../tools/image_panel.mjs';
import {ImagePanelManager,imagePanelTools,imagePanelResumeTool} from '../lib/image_panel_mcp.mjs';
import {prepareOwnedPanelRegistration,loadOwnedPanelRegistration,readOwnedPanelConnection,readOwnedPanelCheckpoint} from '../lib/panel_ownership.mjs';

const A='a'.repeat(32),P='b'.repeat(32),F='f'.repeat(32),png='iVBORw0KGgo=';
const grid={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,32,32],image_rect_xyxy:[0,0,32,32]};
const image={object_id:A,kind:'view',panels:[grid],annotations:[],display:{gamma:1}};
const selection={kind:'rectangle',coordinate_space:'source_pixels',source_object_id:F,coordinates:[2,3,20,25],panel:grid};
const data=r=>JSON.parse(r.content.find(c=>c.type==='text').text);
async function fixture(fn){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-owned-')),live=[],calls=[],records=new Map([[A,image]]);let launches=0;
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_result'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){calls.push({name,args});assert.equal(name,'image_info','Ownership must never compute/replay science');assert.ok(records.has(args.object_id));return {data:structuredClone(records.get(args.object_id)),png};},async close(){}});
 const start=async owned=>{const panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:A,client:client(),panel_id:owned.panel_id,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory,...(owned.checkpoint?{resume_checkpoint:owned.checkpoint}:{})});owned.publish(panel);live.push({owned,panel});return panel;};
 const manager=()=>new ImagePanelManager({workspace,python:path.resolve('unused-python'),inspect:async id=>{assert.equal(id,A);return {content:[]};},launch:async request=>{launches++;const owned=loadOwnedPanelRegistration(workspace,request.registration_file);return start(owned);}});
 try{await fn({workspace,live,calls,records,start,manager,launches:()=>launches});}finally{for(const {owned,panel} of live.reverse()){try{await owned.close(panel);}catch{try{await panel.close();}catch{}}}rmSync(workspace,{recursive:true,force:true});}
}
test('official fresh registration exposes exact live helper and binds checkpoint tuple; legacy schemas unchanged',()=>fixture(async({workspace,start,manager})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned),conn=readOwnedPanelConnection(workspace,P),snapshot=readOwnedPanelCheckpoint(workspace,conn);
 assert.equal(conn.schema_version,2);assert.equal(conn.helper_session_id,owned.helper_session_id);assert.equal(conn.generation,1);assert.equal(snapshot.panel_id,P);assert.equal(snapshot.helper_session_id,owned.helper_session_id);assert.equal(snapshot.panel_generation,1);
 const current=data(await manager().call('image_panel_current',{}));assert.equal(current.panel_id,P);assert.equal(current.view.helper_session_id,owned.helper_session_id);assert.equal(current.view.object.object_id,A);assert.equal(panel.state().panel_generation,1);
 assert.deepEqual(imagePanelTools.map(t=>t.name),['image_panel_open','image_panel_current','image_panel_show']);assert.deepEqual(imagePanelResumeTool.inputSchema.required,['panel_id','request_id']);
 assert.throws(()=>prepareOwnedPanelRegistration({workspace,panel_id:P}),/still present/);
}));
test('saved scoped observation reopens only from its exact provider object/request/scope without new context',()=>fixture(async({workspace,start,manager,records,calls})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned);await owned.close(panel);const conn=readOwnedPanelConnection(workspace,P),checkpoint=readOwnedPanelCheckpoint(workspace,conn),R='d'.repeat(32);
 const observation={kind:'twinning_present',source_text:'Observed interface; only presence statement',authority:'synthetic_fixture'},scope={confirmation_scope:'twinning_present_only',source_object_id:A};
 records.set(R,{object_id:R,request_id:'saved-context-request',kind:'context',parent_object_id:A,user_context:{research_observation:observation},research_observation_scope:scope});
 checkpoint.research_observation={object_id:R,request_id:'saved-context-request',...observation,scope,base_object_id:A,base_state_revision:1,base_frame_identity:null,current_view_relation:'same_saved_view'};writeFileSync(conn.checkpoint_file,JSON.stringify(checkpoint));
 const resumed=data(await manager().call('image_panel_resume',{panel_id:P,request_id:'resume-context'}));assert.equal(resumed.view.research_observation.object_id,R);assert.equal(resumed.view.research_observation.source_text,observation.source_text);assert.equal(resumed.view.research_observation.scope.confirmation_scope,'twinning_present_only');assert.ok(calls.every(call=>call.name==='image_info'));
 const current=readOwnedPanelConnection(workspace,P);const saved=readOwnedPanelCheckpoint(workspace,current);assert.deepEqual(saved.research_observation,resumed.view.research_observation);
}));
test('scoped observation request/source mismatch refuses owned resume rather than restoring false context',()=>fixture(async({workspace,start,manager,records,launches})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned);await owned.close(panel);const conn=readOwnedPanelConnection(workspace,P),checkpoint=readOwnedPanelCheckpoint(workspace,conn),R='d'.repeat(32),observation={kind:'twinning_present',source_text:'fixture statement',authority:'synthetic_fixture'},scope={confirmation_scope:'twinning_present_only',source_object_id:A};
 records.set(R,{object_id:R,request_id:'different-provider-request',kind:'context',parent_object_id:A,user_context:{research_observation:observation},research_observation_scope:scope});checkpoint.research_observation={object_id:R,request_id:'claimed-saved-request',...observation,scope,base_object_id:A,base_state_revision:1,base_frame_identity:null};writeFileSync(conn.checkpoint_file,JSON.stringify(checkpoint));
 const args={panel_id:P,request_id:'context-mismatch'};await assert.rejects(manager().call('image_panel_resume',args),/does not match its provider/);assert.equal(launches(),1);await assert.rejects(manager().call('image_panel_resume',args),/unverified/);assert.equal(launches(),1);assert.equal(readOwnedPanelConnection(workspace,P).generation,1);
}));
test('normal closed generation explicitly resumes once, preserves exact draft, rotates capability and receipts',()=>fixture(async({workspace,start,manager,launches,calls})=>{
 const first=prepareOwnedPanelRegistration({workspace,panel_id:P}),old=await start(first),origin=old.url.split('/#')[0];
 const post=await fetch(origin+'/api/action',{method:'POST',headers:{Origin:origin,'X-Panel-Token':old.token,'Content-Type':'application/json'},body:JSON.stringify({action:'draft',params:{draft_revision:5,dirty:true,gesture_active:true,selection},expected_object_id:A,draft_revision:0})});assert.equal(post.status,200);const before=old.state();
 await first.close(old);const conn1=readOwnedPanelConnection(workspace,P);assert.equal(conn1.status,'closed');
 const m=manager(),args={panel_id:P,request_id:'explicit-resume'},r=data(await m.call('image_panel_resume',args)),conn2=readOwnedPanelConnection(workspace,P);
 assert.equal(launches(),1);assert.equal(r.resumed,true);assert.equal(r.panel_generation,2);assert.equal(r.view.panel_id,P);assert.notEqual(conn2.helper_session_id,conn1.helper_session_id);assert.notEqual(conn2.token,conn1.token);assert.notEqual(conn2.evidence_token,conn1.evidence_token);
 assert.equal(r.view.edit_state.draft_revision,6);assert.equal(r.view.edit_state.dirty,true);assert.equal(r.view.edit_state.gesture_active,false);assert.deepEqual(r.view.selection,before.selection);assert.deepEqual(r.view.edit_state.selection,before.edit_state.selection);
 const recovered=data(await manager().call('image_panel_resume',args));assert.equal(recovered.recovered,true);assert.deepEqual(recovered.view,r.view);assert.equal(launches(),1);
 const offered=data(await manager().call('image_panel_show',{panel_id:P,object_id:A,expected_object_id:A,draft_revision:5,request_id:'pre-cold-revision'}));assert.equal(offered.view.presentation.status,'queued','Pre-cold CAS/draft must not replace the resumed draft');assert.equal(offered.view.edit_state.draft_revision,6);assert.equal(offered.view.edit_state.dirty,true);
 const denied=await fetch(r.panel_url.split('/#')[0]+'/api/state',{headers:{'X-Panel-Token':conn1.token}});assert.equal(denied.status,403);
 assert.ok(calls.every(c=>c.name==='image_info'));assert.equal(readdirSync(first.journalDirectory).filter(f=>f.endsWith('.request.json')).length,0);assert.equal(readdirSync(path.dirname(conn2.checkpoint_file)).filter(f=>f.endsWith('.request.json')).length,0);
}));
test('cross-client per-panel claim remains exclusive while caller stops waiting; original ID recovers one helper',()=>fixture(async({workspace,start})=>{
 const old=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(old);await old.close(panel);let release,entered,launches=0;
 const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const manager=()=>new ImagePanelManager({workspace,python:path.resolve('unused-python'),inspect:async()=>({content:[]}),launch:async req=>{launches++;entered();await gate;return start(loadOwnedPanelRegistration(workspace,req.registration_file));}});
 const m=manager(),controller=new AbortController(),args={panel_id:P,request_id:'cancel-wait-resume'},waiting=m.call('image_panel_resume',args,controller.signal);await started;controller.abort();await assert.rejects(waiting,/Stopped waiting/);
 await assert.rejects(manager().call('image_panel_resume',{panel_id:P,request_id:'competing-resume'}),/EEXIST/);assert.equal(launches,1);release();
 let recovered;for(let n=0;n<40;n++){try{recovered=data(await manager().call('image_panel_resume',args));break;}catch(error){if(!String(error).includes('unverified'))throw error;await new Promise(resolve=>setTimeout(resolve,10));}}
 assert.equal(recovered.recovered,true);assert.equal(recovered.view.panel_generation,2);assert.equal(launches,1);
 const receipt=JSON.parse(readFileSync(path.join(workspace,'panel-registry','requests',args.request_id+'.json')));assert.equal(receipt.status,'completed');
}));
test('failed original resume ID remains failed after helper closes; explicit new ID can resume',()=>fixture(async({workspace,start,manager,launches})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned),m=manager(),args={panel_id:P,request_id:'refused-while-live'};
 await assert.rejects(m.call('image_panel_resume',args),/still present/);assert.equal(launches(),0);
 await owned.close(panel);await assert.rejects(manager().call('image_panel_resume',args),/still present/);assert.equal(launches(),0);
 await manager().call('image_panel_resume',{panel_id:P,request_id:'new-explicit-resume'});assert.equal(launches(),1);
}));
test('tampered checkpoint binding and legacy ownership refuse before launch',()=>fixture(async({workspace,start,manager,launches})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned);await owned.close(panel);const file=readOwnedPanelConnection(workspace,P).checkpoint_file,checkpoint=JSON.parse(readFileSync(file));writeFileSync(file,JSON.stringify({...checkpoint,helper_session_id:F}));
 await assert.rejects(manager().call('image_panel_resume',{panel_id:P,request_id:'wrong-tuple'}),/binding mismatch/);assert.equal(launches(),0);
 const connFile=path.join(workspace,'panel-registry','panels',P+'.json');writeFileSync(connFile,JSON.stringify({schema_version:1,panel_id:P,port:1234,token:'c'.repeat(48),pid:process.pid}));
 await assert.rejects(manager().call('image_panel_resume',{panel_id:P,request_id:'legacy-refuse'}),/Legacy helper/);assert.equal(launches(),0);
}));
test('unknown launch outcome does not launch again from another manager/client',()=>fixture(async({workspace,start,launches})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned);await owned.close(panel);let attempts=0;
 const manager=()=>new ImagePanelManager({workspace,python:path.resolve('unused-python'),inspect:async()=>({content:[]}),launch:async()=>{attempts++;throw new Error('Controlled lost launch outcome');}});
 const args={panel_id:P,request_id:'unknown-launch'};await assert.rejects(manager().call('image_panel_resume',args),/lost launch outcome/);await assert.rejects(manager().call('image_panel_resume',args),/unverified/);assert.equal(attempts,1);assert.equal(launches(),0);
 const record=JSON.parse(readFileSync(path.join(workspace,'panel-registry','requests','unknown-launch.json')));assert.equal(record.status,'submitted');assert.equal(record.stage,'launching');
 await assert.rejects(manager().call('image_panel_resume',{panel_id:P,request_id:'different-id-after-unknown'}),/EEXIST/);assert.equal(attempts,1);
}));
test('interrupted preflight with no assigned generation cannot qualify legacy or malformed completed receipts',()=>fixture(async({workspace,start})=>{
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P}),panel=await start(owned);await owned.close(panel);
 const connFile=path.join(workspace,'panel-registry','panels',P+'.json');writeFileSync(connFile,JSON.stringify({schema_version:1,panel_id:P,port:1234,token:'c'.repeat(48),pid:process.pid}));let fetches=0,launches=0;
 const m=new ImagePanelManager({workspace,python:path.resolve('unused-python'),inspect:async()=>({content:[]}),fetchImpl:async()=>{fetches++;return {ok:true,status:200,text:async()=>JSON.stringify({panel_id:P,object:image})};},launch:async()=>{launches++;}});m.initialize();
 for(const [status,stage] of [['submitted','preflight'],['completed','completed']]){
  const request_id='interrupted-'+status,args={panel_id:P,request_id};writeFileSync(path.join(workspace,'panel-registry','requests',request_id+'.json'),JSON.stringify({schema_version:1,name:'image_panel_resume',arguments:args,panel_id:P,request_id,status,stage,response:{panel_id:P,object:image}}));
  await assert.rejects(m.call('image_panel_resume',args),/no qualified assigned helper generation/);
 }
 assert.equal(fetches,0);assert.equal(launches,0);
}));
