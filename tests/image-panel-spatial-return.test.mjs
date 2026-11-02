// Real Panel HTTP/checkpoint contracts with a controlled provider; no numerics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createImagePanel} from '../tools/image_panel.mjs';
import {prepareOwnedPanelRegistration,readOwnedPanelCheckpoint,readOwnedPanelConnection} from '../lib/panel_ownership.mjs';
const id=n=>n.toString(16).padStart(32,'0'),T=id(1),F=id(2),V=id(3),K=id(4),E=id(5),B=id(6),P=id(7),X=id(8),D=id(9),C=id(12);
const pngBytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=pngBytes.toString('base64'),digest=createHash('sha256').update(pngBytes).digest('hex');
const support=[2,3,20,25],grid={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,32,32],image_rect_xyxy:[0,0,32,32]};
const roi={annotation_id:'saved-roi',kind:'rectangle',text:'ROI 1',note:'Original observation',purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:support}};
const spatial={object_id:V,kind:'view',parent_object_id:F,array_domain:'spatial',shape_yx:[32,32],panels:[grid],annotations:[roi],display:{gamma:1,display_range:[0,255]},files_sha256:{'preview.png':digest}};
const fft={object_id:K,kind:'fft',parent_object_id:F,source_object_id:F,array_domain:'frequency',source_rect_xyxy:support,shape_yx:[22,18],panels:[{domain:'frequency',source_object_id:K,fft_shape_yx:[22,18],image_rect_xyxy:[0,0,18,22]}],annotations:[{annotation_id:'peak',kind:'point',anchor:{source_object_id:K,coordinate_space:'frequency_cycles_per_pixel',coordinates:[.1,0]}}],display:{gamma:1,display_range:[0,12]}};
const selection={kind:'rectangle',source_object_id:F,coordinate_space:'source_pixels',coordinates:support,panel:grid};
const calibrationA={calibration_id:id(10),revision:1,status:'active',source:'user_statement_not_independently_verified',coordinate_domain:'real_space',xy_scale:{x:.02,y:.02,unit:'nm'}},calibrationB={...calibrationA,calibration_id:id(11),revision:2,previous_calibration_id:id(10),xy_scale:{x:.03,y:.03,unit:'nm'}};
const dependency=c=>({calibration_id:c.calibration_id,revision:c.revision,status:c.status,source:c.source,coordinate_domain:c.coordinate_domain});
async function fixture(run,{initial=V,calibrated=false}={}){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-spatial-return-')),calls=[],live=[];
 const records=new Map([[T,{object_id:T,kind:'tiff_source'}],[F,{object_id:F,kind:'frame',source_object_id:T,frame_index:0}],[X,{object_id:X,kind:'frame',source_object_id:T,frame_index:1}],[V,structuredClone(spatial)],[K,structuredClone(fft)],[B,{...structuredClone(fft),object_id:B,source_rect_xyxy:[0,0,10,10],shape_yx:[10,10],panels:[{...fft.panels[0],source_object_id:B,fft_shape_yx:[10,10]}]}]]);
 if(calibrated){for(const ident of [V,K])Object.assign(records.get(ident),{xy_calibration:structuredClone(calibrationA),display_calibration_id:calibrationA.calibration_id});records.get(K).panels[0].calibration_dependency=dependency(calibrationA);}
 const directory=path.join(workspace,'objects',V);mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'preview.png'),pngBytes);
 let panel,owned,holdFFT=null,holdTarget=null;
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_fft','image_annotate','image_preview',...(calibrated?['image_calibrate']:[])].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){
  calls.push({name,args:structuredClone(args)});
  if(name==='image_info'&&args.object_id===V&&holdTarget){const h=holdTarget;holdTarget=null;h.started();await h.wait;}
  if(name==='image_calibrate'){assert.equal(args.object_id,F);assert.equal(args.calibration_object_id,calibrationA.calibration_id);records.set(C,{object_id:C,kind:'calibration',base_object_id:F,parent_object_id:F,xy_calibration:structuredClone(calibrationA),request_id:args.request_id,state:'completed'});}
  else if(name==='image_fft'){if(holdFFT){const h=holdFFT;holdFFT=null;h.started();await h.wait;}assert.equal(args.object_id,calibrated?C:F);records.set(K,{...structuredClone(records.get(K)),parent_object_id:args.object_id,request_id:args.request_id,state:'completed'});}
  else if(name==='image_annotate'){const data={...structuredClone(records.get(args.object_id)),object_id:E,kind:'annotate',parent_object_id:args.object_id,request_id:args.request_id,state:'completed'};for(const u of args.updates)data.annotations.find(a=>a.annotation_id===u.annotation_id).anchor.coordinates=u.coordinates;records.set(E,data);}
  else if(name==='image_preview')records.set(D,{...structuredClone(records.get(args.object_id)),object_id:D,kind:'fft_view',spectrum_object_id:K,parent_object_id:args.object_id,request_id:args.request_id});
  const ident=name==='image_info'?args.object_id:name==='image_calibrate'?C:name==='image_fft'?K:name==='image_annotate'?E:D;
  assert.ok(records.has(ident),'controlled provider missing '+ident);const data=structuredClone(records.get(ident));
  return {data,png:['frame','tiff_source','calibration'].includes(data.kind)||data.no_preview?null:png};
 },async close(){}});
 const start=async()=>{owned=prepareOwnedPanelRegistration({workspace,panel_id:P});panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:owned.checkpoint?.object_id??initial,client:client(),panel_id:P,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory,...(owned.checkpoint?{resume_checkpoint:owned.checkpoint}:{})});owned.publish(panel);live.push({owned,panel});};
 const post=async(endpoint,body)=>{const origin=panel.url.split('/#')[0],reply=await fetch(origin+endpoint,{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:reply.status,data:await reply.json()};};
 const act=(action,params={},extra={})=>post('/api/action',{expected_object_id:panel.state().object.object_id,draft_revision:panel.state().edit_state.draft_revision,action,params,...extra});
 const checkpoint=()=>readOwnedPanelCheckpoint(workspace,readOwnedPanelConnection(workspace,P));
 const cold=async mutate=>{await owned.close(panel);const conn=readOwnedPanelConnection(workspace,P);if(mutate){const data=checkpoint();mutate(data);writeFileSync(conn.checkpoint_file,JSON.stringify(data));}await start();};
 const hold=target=>{let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);if(target==='fft')holdFFT={wait,started:entered};else holdTarget={wait,started:entered};return {release,started};};
 try{await start();await run({workspace,records,calls,act,post,cold,checkpoint,hold,state:()=>panel.state()});}
 finally{for(const entry of live.reverse()){try{await entry.owned.close(entry.panel);}catch{}}rmSync(workspace,{recursive:true,force:true});}
}

test('GUI FFT retains the exact saved spatial observation through peak edits and cold reopen, then returns without computation',()=>fixture(async h=>{
 const original=structuredClone(h.records.get(V));assert.equal(h.state().spatial_return.reason_code,'no_saved_return');
 assert.equal((await h.act('fft',{selection})).status,200);assert.equal(h.state().spatial_return.status,'ready');assert.equal(h.state().spatial_return.view_object_id,V);
 await h.act('edit',{updates:[{annotation_id:'peak',coordinates:[.13,0]}],auto_commit:true});assert.equal(h.state().object.object_id,E);
 const before=h.checkpoint();assert.equal(before.spatial_return_reference.fft_object_id,K);
 await h.cold();assert.equal(h.state().object.object_id,E);assert.equal(h.state().spatial_return.status,'ready');
 const calls=h.calls.length,returned=await h.act('return-spatial');assert.equal(returned.status,200,returned.data.error);assert.equal(h.state().object.object_id,V);
 assert.deepEqual(h.state().object.annotations,original.annotations);assert.deepEqual(h.state().effective_display,original.display);
 assert.ok(h.calls.slice(calls).every(c=>c.name==='image_info'));assert.deepEqual(h.records.get(V),original);assert.equal(h.calls.filter(c=>c.name==='image_fft').length,1);
}));

test('FFT display preview inherits its recorded return, while another FFT on the same frame cannot borrow it',()=>fixture(async h=>{
 await h.act('fft',{selection});await h.act('preview',{gamma:2});assert.equal(h.state().spatial_return.status,'ready');
 const s=h.state();const offered=await h.post('/api/present',{object_id:B,expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision,request_id:'different-roi'});assert.equal(offered.status,200);
 assert.equal(h.state().spatial_return.reason_code,'different_fft');assert.equal((await h.act('return-spatial')).status,409);assert.equal(h.state().object.object_id,B);
 await h.act('show',{object_id:K});assert.equal(h.state().spatial_return.status,'ready');
}));

test('direct Agent FFT and legacy checkpoints do not invent a spatial observation',()=>fixture(async h=>{
 assert.equal(h.state().spatial_return.status,'unavailable');assert.equal((await h.act('return-spatial')).status,409);
 await h.cold(c=>delete c.spatial_return_reference);assert.equal(h.state().object.object_id,K);assert.equal(h.state().spatial_return.reason_code,'legacy_checkpoint_missing');
 assert.equal(h.calls.filter(c=>c.name!=='image_info').length,0);
},{initial:K}));

for(const [name,mutate,reason]of [
 ['malformed',c=>c.spatial_return_reference.view_object_id='bad','invalid_reference'],
 ['wrong frame',c=>c.spatial_return_reference.frame_object_id=X,'different_frame'],
 ['wrong support',c=>c.spatial_return_reference.source_rect_xyxy=[0,0,10,10],'different_fft_support'],
])test(`cold reopen keeps the FFT but refuses a ${name} navigation reference`,()=>fixture(async h=>{
 await h.act('fft',{selection});await h.cold(mutate);assert.equal(h.state().object.object_id,K);assert.equal(h.state().spatial_return.reason_code,reason);assert.equal((await h.act('return-spatial')).status,409);
 if(name==='malformed')assert.equal(h.checkpoint().spatial_return_reference,null,'malformed structure is never retained as a candidate');
}));

for(const [name,mutate,reason]of [
 ['missing target',h=>h.records.delete(V),'target_unavailable'],
 ['missing PNG',h=>h.records.get(V).no_preview=true,'missing_saved_preview'],
 ['invalid PNG digest',h=>h.records.get(V).files_sha256['preview.png']='0'.repeat(64),'invalid_saved_preview'],
 ['frequency source',h=>h.records.get(V).panels[0].domain='source_array_indices','not_spatial'],
])test(`saved return is requalified on action and ${name} does not damage the current FFT`,()=>fixture(async h=>{
 await h.act('fft',{selection});mutate(h);const result=await h.act('return-spatial');assert.equal(result.status,409);assert.equal(h.state().object.object_id,K);assert.equal(h.state().spatial_return.reason_code,reason);
}));

test('return-spatial requires exact CAS/revision and rejects drafts, gestures, pending results and arbitrary IDs',()=>fixture(async h=>{
 await h.act('fft',{selection});const before=h.calls.length;
 for(const extra of [{expected_object_id:V},{draft_revision:99},{draft_revision:undefined}])assert.equal((await h.act('return-spatial',{},extra)).status,409);
 assert.equal((await h.act('return-spatial',{object_id:V})).status,400);assert.equal(h.calls.length,before);
 for(const flags of [{dirty:true,gesture_active:false},{dirty:false,gesture_active:true}]){await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,...flags});assert.equal((await h.act('return-spatial')).status,409);}
 await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false});
 const s=h.state();await h.post('/api/present',{object_id:B,expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision-1,request_id:'stale-offer'});assert.ok(h.state().pending_result);
 assert.equal((await h.act('return-spatial')).status,409);assert.equal(h.state().object.object_id,K);
}));

test('a new draft during saved-view verification prevents navigation and preserves the new draft',()=>fixture(async h=>{
 await h.act('fft',{selection});const delay=h.hold('target'),returning=h.act('return-spatial');await delay.started;
 await h.act('draft',{draft_revision:1,dirty:true,gesture_active:false});delay.release();const result=await returning;
 assert.equal(result.status,409);assert.equal(h.state().object.object_id,K);assert.equal(h.state().edit_state.dirty,true);assert.equal(h.state().spatial_return.status,'ready');
}));

test('cold unresolved original request cannot be hidden by spatial navigation',()=>fixture(async h=>{
 await h.act('fft',{selection});await h.cold(c=>c.last_operation={state:'submitted',request_id:'unknown-original-write',object_id:K,tool:'image_annotate'});
 const before=h.calls.length,result=await h.act('return-spatial');
 assert.equal(result.status,409);assert.match(result.data.error,/unresolved.*request_id=unknown-original-write/);
 assert.equal(h.state().object.object_id,K);assert.equal(h.state().last_operation.state,'submitted');assert.equal(h.state().last_operation.request_id,'unknown-original-write');
 assert.equal(h.calls.length,before,'unresolved request is retained without dispatching or replaying any provider operation');
}));

for(const failure of ['provider','PNG'])test(`temporary ${failure} failure publishes unavailable qualification while retaining the candidate for verified cold reopen`,()=>fixture(async h=>{
 await h.act('fft',{selection});const reference=structuredClone(h.checkpoint().spatial_return_reference),original=structuredClone(h.records.get(V)),revision=h.state().state_revision;
 if(failure==='provider')h.records.delete(V);else h.records.get(V).no_preview=true;
 const rejected=await h.act('return-spatial');assert.equal(rejected.status,409);
 assert.equal(h.state().spatial_return.status,'unavailable');assert.equal(h.state().spatial_return.reason_code,failure==='provider'?'target_unavailable':'missing_saved_preview');
 assert.equal(h.state().state_revision,revision+1,'qualification loss must be visible to revision polling');
 assert.deepEqual(h.checkpoint().spatial_return_reference,reference,'a structurally valid candidate is not discarded on transient read failure');
 const before=h.calls.length;h.records.set(V,original);assert.equal((await h.act('return-spatial')).status,409);
 assert.equal(h.calls.length,before,'unqualified candidate cannot trigger an implicit retry or navigation');
 await h.cold();assert.equal(h.state().spatial_return.status,'ready');assert.equal(h.state().object.object_id,K);
 assert.ok(h.calls.slice(before).every(c=>c.name==='image_info'),'cold validation is read-only, not a new preview or FFT');
 assert.deepEqual(h.checkpoint().spatial_return_reference,reference);assert.equal((await h.act('return-spatial')).status,200);
 assert.equal(h.calls.filter(c=>c.name==='image_fft').length,1);
}));

test('a valid checkpoint candidate that cannot be read at startup remains unavailable and survives until another normal reopen',()=>fixture(async h=>{
 await h.act('fft',{selection});const reference=structuredClone(h.checkpoint().spatial_return_reference),original=structuredClone(h.records.get(V));
 h.records.get(V).no_preview=true;const before=h.calls.length;await h.cold();
 assert.equal(h.state().spatial_return.reason_code,'missing_saved_preview');assert.deepEqual(h.checkpoint().spatial_return_reference,reference);
 assert.equal((await h.act('return-spatial')).status,409);h.records.set(V,original);await h.cold();
 assert.equal(h.state().spatial_return.status,'ready');assert.ok(h.calls.slice(before).every(c=>c.name==='image_info'));assert.equal(h.calls.filter(c=>c.name==='image_fft').length,1);
}));

test('same frame and ROI cannot qualify another saved view with a different original calibration dependency',()=>fixture(async h=>{
 const computed=await h.act('fft',{selection});assert.equal(computed.status,200,computed.data.error);assert.equal(h.state().spatial_return.status,'ready');
 h.records.set(D,{...structuredClone(h.records.get(V)),object_id:D,xy_calibration:structuredClone(calibrationB),display_calibration_id:calibrationB.calibration_id});
 const before=h.calls.length;await h.cold(c=>c.spatial_return_reference.view_object_id=D);
 assert.equal(h.state().object.object_id,K);assert.equal(h.state().spatial_return.reason_code,'different_calibration');
 assert.equal((await h.act('return-spatial')).status,409);assert.ok(h.calls.slice(before).every(c=>c.name==='image_info'));
},{calibrated:true}));

test('later current FFT calibration does not replace the raw FFT dependency or block return to its true old saved view',()=>fixture(async h=>{
 const computed=await h.act('fft',{selection});assert.equal(computed.status,200,computed.data.error);
 const wrapper={...structuredClone(h.records.get(K)),object_id:D,kind:'fft_view',parent_object_id:K,spectrum_object_id:K,xy_calibration:structuredClone(calibrationB),display_calibration_id:calibrationB.calibration_id,display:{gamma:3,display_range:[0,18]}};
 wrapper.panels[0].calibration_dependency=dependency(calibrationB);h.records.set(D,wrapper);const shown=await h.act('show',{object_id:D});assert.equal(shown.status,200,shown.data.error);
 assert.equal(h.state().object.xy_calibration.calibration_id,calibrationB.calibration_id);assert.equal(h.state().spatial_return.status,'ready');
 const before=h.calls.length,result=await h.act('return-spatial');assert.equal(result.status,200,result.data.error);
 assert.equal(h.state().object.object_id,V);assert.deepEqual(h.state().object.xy_calibration,calibrationA);assert.deepEqual(h.records.get(K).xy_calibration,calibrationA);
 assert.equal(h.state().effective_display.gamma,1);assert.ok(h.calls.slice(before).every(c=>c.name==='image_info'));
},{calibrated:true}));

test('a late FFT keeps its reference with pending result until explicit acceptance, including cold reopen',()=>fixture(async h=>{
 const delay=h.hold('fft'),computing=h.act('fft',{selection});await delay.started;
 await h.act('draft',{draft_revision:1,dirty:true,gesture_active:false});delay.release();await computing;
 assert.equal(h.state().object.object_id,V);assert.equal(h.state().spatial_return.status,'unavailable');assert.equal(h.checkpoint().pending_result.spatial_return_reference.view_object_id,V);
 await h.cold();assert.ok(h.state().pending_result);assert.equal((await h.act('return-spatial')).status,409);
 await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false});await h.act('accept-result');
 assert.equal(h.state().object.object_id,K);assert.equal(h.state().spatial_return.status,'ready');
}));
