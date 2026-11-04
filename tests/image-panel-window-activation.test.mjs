// Real Panel transport/owned checkpoints with a controlled provider; no numerics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,realpathSync,readdirSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createImagePanel} from '../tools/image_panel.mjs';
import {prepareOwnedPanelRegistration,readOwnedPanelCheckpoint,readOwnedPanelConnection} from '../lib/panel_ownership.mjs';
import {panelWindowMappingFingerprint,readPanelWindowCamera} from '../lib/panel_window_collection.mjs';

const id=n=>n.toString(16).padStart(32,'0'),T=id(1),F=id(2),V=id(3),P=id(4),X=id(5);
const bytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=bytes.toString('base64'),digest=createHash('sha256').update(bytes).digest('hex');
const a=[1.5,2.5,20.5,21.5],b=[30.25,31.125,50.75,52.25];
const cameraA={scale:3.25,center_image_xy:[21.75,25.5]},cameraB={scale:1.75,center_image_xy:[42.25,44.125]},cameraFFT={scale:4.5,center_image_xy:[12.25,10.5]};
const panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,64,64],image_rect_xyxy:[0,0,64,64]};
const picked=(coordinates,p=panel)=>({kind:'rectangle',coordinate_space:'source_pixels',source_object_id:F,coordinates,panel:p});
const mark={annotation_id:'saved-roi',kind:'rectangle',text:'ROI A',note:'Original observation',purpose:'resumable_observation',selection_origin:'researcher',observation_contract_version:1,selection_origin_basis:'caller_reported_not_authenticated',status:'hypothesized',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:a}};
const source=()=>({object_id:V,kind:'view',parent_object_id:F,array_domain:'spatial',shape_yx:[64,64],panels:[structuredClone(panel)],annotations:[structuredClone(mark)],display:{gamma:1},files_sha256:{'preview.png':digest}});
const spectral=(ident,rect=[1,2,21,22])=>({object_id:ident,kind:'fft',parent_object_id:F,array_domain:'frequency',source_rect_xyxy:rect,shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],panels:[{domain:'frequency',source_object_id:ident,fft_shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],image_rect_xyxy:[0,0,rect[2]-rect[0],rect[3]-rect[1]]}],annotations:[{annotation_id:'peak',kind:'point',anchor:{source_object_id:ident,coordinate_space:'frequency_cycles_per_pixel',coordinates:[.1,0]},status:'hypothesized'}],display:{gamma:1},files_sha256:{'preview.png':digest}});

async function fixture(run){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-window-activate-')),records=new Map([[T,{object_id:T,kind:'tiff_source'}],[F,{object_id:F,kind:'frame',source_object_id:T,frame_index:0}],[X,{object_id:X,kind:'frame',source_object_id:T,frame_index:1}]]),calls=[],live=[];
 let sequence=100,panelInstance,owned,holdInfo=null,holdFFT=null,failFFT=false,blockedObject=null,movedJournal=null,annotationFailure=null;
 const save=value=>{records.set(value.object_id,structuredClone(value));if(value.files_sha256){const dir=path.join(workspace,'objects',value.object_id);mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'preview.png'),bytes);}return value;};save(source());
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_fft','image_preview','image_annotate'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){
  calls.push({name,args:structuredClone(args)});
  if(name==='image_info'&&args.object_id===blockedObject)throw new Error('Controlled temporarily unavailable saved object');
  if(name==='image_info'&&holdInfo?.object_id===args.object_id){const hold=holdInfo;holdInfo=null;hold.entered();await hold.wait;}
  let value;
  if(name==='image_info')value=records.get(args.object_id);
  else if(name==='image_fft'){if(holdFFT){const hold=holdFFT;holdFFT=null;hold.entered();await hold.wait;}if(failFFT)throw new Error('Controlled FFT outcome unknown');value=save({...spectral(id(++sequence),args.rect),request_id:args.request_id,state:'completed'});}
  else if(name==='image_preview')value=save({...source(),object_id:id(++sequence),request_id:args.request_id,state:'completed'});
  else if(name==='image_annotate'){if(annotationFailure)throw annotationFailure;value=structuredClone(records.get(args.object_id));value.object_id=id(++sequence);value.kind='annotate';value.parent_object_id=args.object_id;value.render_base_object_id=records.get(args.object_id).render_base_object_id??args.object_id;value.request_id=args.request_id;value.state='completed';delete value.array_domain;for(const update of args.updates){const m=value.annotations.find(v=>v.annotation_id===update.annotation_id);if(update.coordinates)m.anchor.coordinates=update.coordinates;if(update.text!==undefined)m.text=update.text;}save(value);}
  assert.ok(value,'Missing controlled object '+args.object_id);return {data:structuredClone(value),png:value.files_sha256?png:null};
 },async close(){}});
 const start=async()=>{owned=prepareOwnedPanelRegistration({workspace,panel_id:P});panelInstance=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:owned.checkpoint?.object_id??V,client:client(),panel_id:P,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory,...(owned.checkpoint?{resume_checkpoint:owned.checkpoint}:{})});owned.publish(panelInstance);live.push({owned,panel:panelInstance});};
 const post=async(route,body)=>{const origin=panelInstance.url.split('/#')[0],r=await fetch(origin+route,{method:'POST',headers:{'X-Panel-Token':panelInstance.token,Origin:origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const state=()=>panelInstance.state();
 const act=(action,params={},extra={})=>post('/api/action',{expected_object_id:state().object.object_id,draft_revision:state().edit_state.draft_revision,action,params,...extra});
 const get=async route=>{const r=await fetch(panelInstance.url.split('/#')[0]+route,{headers:{'X-Panel-Token':panelInstance.token,Connection:'close'}});return {status:r.status,data:r.headers.get('Content-Type')?.includes('application/json')?await r.json():await r.text()};};
 const context=async(selection,camera=cameraA,selected_annotation_id=null)=>{
  const current=state(),published=await act('draft',{draft_revision:current.edit_state.draft_revision+1,dirty:false,gesture_active:false,selection,confirm_persistence:true});assert.equal(published.status,200,published.data.error);
  const saved=await act('window-context',{collection_revision:state().window_collection.revision,camera,selected_annotation_id});assert.equal(saved.status,200,saved.data.error);return saved;
 };
 const windowFor=object_id=>state().window_collection.windows.find(w=>w.object_id===object_id);
 const activate=window=>act('activate-window',{window_id:window.window_id,collection_revision:state().window_collection.revision});
 const hold=(object_id=undefined)=>{let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r),hold={object_id,wait,entered};if(object_id===undefined)holdFFT=hold;else holdInfo=hold;return {release,started};};
 const restoreJournal=()=>{if(movedJournal){rmSync(movedJournal.original);renameSync(movedJournal.backup,movedJournal.original);movedJournal=null;}};
 const breakJournal=()=>{const original=panelInstance.journal,canonicalWorkspace=realpathSync.native(workspace),canonicalJournal=realpathSync.native(original),relative=path.relative(canonicalWorkspace,canonicalJournal);assert.ok(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'The canonical journal must remain inside the controlled temporary workspace: '+JSON.stringify({canonicalWorkspace,canonicalJournal,relative}));const backup=original+'-blocked-test';renameSync(original,backup);writeFileSync(original,'blocked test journal');movedJournal={original,backup};};
 const cold=async mutate=>{await owned.close(panelInstance);if(mutate){const conn=readOwnedPanelConnection(workspace,P),checkpoint=readOwnedPanelCheckpoint(workspace,conn);mutate(checkpoint);writeFileSync(conn.checkpoint_file,JSON.stringify(checkpoint));}await start();};
 try{await start();await run({workspace,records,calls,state,save,post,act,get,context,windowFor,activate,hold,cold,breakJournal,restoreJournal,journal:()=>panelInstance.journal,failAnnotation:error=>{annotationFailure=error;},unknownFFT:()=>{failFFT=true;},blockObject:value=>{blockedObject=value;}});}finally{restoreJournal();for(const item of live.reverse()){try{await item.owned.close(item.panel);}catch{}}rmSync(workspace,{recursive:true,force:true});}
}

async function firstFFT(h,{capture=true,coordinates=a}={}){
 if(capture)await h.context(picked(coordinates),cameraA,'saved-roi');
 assert.equal((await h.act('fft',{selection:picked(coordinates)})).status,200);return h.state().object.object_id;
}

const preflightBatch='panel-action-12345678-1234-1234-1234-123456789abc';
const expectedPreflight=body=>({schema_version:1,kind:'panel_action_preflight_failure',code:'HISTORICAL_ROI_SOURCE',phase:'before_scientific_dispatch',submission_state:'not_submitted',provider_request_id:null,automatic_retry:false,action:body.action,expected_object_id:body.expected_object_id,draft_revision:body.draft_revision,client_batch_id:body.client_batch_id});
function fileSnapshot(directory,prefix=''){return Object.fromEntries(readdirSync(directory).sort().flatMap(name=>{const file=path.join(directory,name),key=prefix+name;return statSync(file).isDirectory()?Object.entries(fileSnapshot(file,key+'/')):[[key,createHash('sha256').update(readFileSync(file)).digest('hex')]];}));}
test('Panel preflight transport: exact historical guard refuses before a provider request and preserves old operation and files',()=>fixture(async h=>{
 const module=await h.get('/panel-preflight.mjs');assert.equal(module.status,200);assert.match(module.data,/readPanelActionPreflight/);
 const fft=await firstFFT(h);assert.equal((await h.act('return-spatial')).status,200);const latest=await h.act('edit',{updates:[{annotation_id:'saved-roi',text:'Latest ROI'}],auto_commit:true});assert.equal(latest.status,200,latest.data.error);assert.equal((await h.act('show',{object_id:fft})).status,200);assert.equal((await h.act('return-spatial')).status,200);assert.notEqual(h.windowFor(V).latest_observation_view_object_id,V);
 const before=h.state(),files=fileSnapshot(h.workspace),calls=h.calls.length,body={expected_object_id:V,draft_revision:before.edit_state.draft_revision,action:'edit',params:{updates:[{annotation_id:'saved-roi',text:'Rejected local text'}],auto_commit:true},client_batch_id:preflightBatch};const result=await h.post('/api/action',body);assert.equal(result.status,409,result.data.error);assert.deepEqual(result.data.panel_preflight,expectedPreflight(body));assert.equal(result.data.admission_failure,undefined);assert.deepEqual(h.state().last_operation,before.last_operation);assert.deepEqual(h.state(),before);assert.equal(h.calls.length,calls);assert.deepEqual(fileSnapshot(h.workspace),files);
 const markBody={...body,action:'mark',params:{selection:picked(b),annotation_id:'new-local-roi',text:'New local ROI',note:'Not submitted',color:'cyan',status:'hypothesized'}},markResult=await h.post('/api/action',markBody);assert.equal(markResult.status,409,markResult.data.error);assert.deepEqual(markResult.data.panel_preflight,expectedPreflight(markBody));assert.deepEqual(h.state(),before);assert.equal(h.calls.length,calls);assert.deepEqual(fileSnapshot(h.workspace),files);const wrongMark=await h.post('/api/action',{...markBody,client_batch_id:'not-a-batch'});assert.equal(wrongMark.data.panel_preflight,undefined);
 for(const altered of [{...body,client_batch_id:undefined},{...body,client_batch_id:'not-a-batch'},{...body,draft_revision:body.draft_revision-1}]){const rejected=await h.post('/api/action',altered);assert.ok(rejected.status>=400);assert.equal(rejected.data.panel_preflight,undefined);assert.deepEqual(h.state().last_operation,before.last_operation);}assert.equal(h.calls.length,calls);assert.deepEqual(fileSnapshot(h.workspace),files);
}));
test('Panel preflight transport: a journaled failure cannot forge a Panel preflight proof or erase its real request',()=>fixture(async h=>{
 const body={expected_object_id:V,draft_revision:h.state().edit_state.draft_revision,action:'edit',params:{updates:[{annotation_id:'saved-roi',text:'Attempted edit'}],auto_commit:true},client_batch_id:preflightBatch},forged=expectedPreflight(body);h.failAnnotation(Object.assign(new Error('Historical ROI not_submitted text after dispatch'),{status:409,panel_preflight:forged}));const result=await h.post('/api/action',body);assert.equal(result.status,409);assert.equal(result.data.panel_preflight,undefined);assert.equal(h.calls.filter(call=>call.name==='image_annotate').length,1);const operation=h.state().last_operation;assert.equal(operation.state,'submitted');assert.ok(operation.request_id);assert.equal(existsSync(path.join(h.journal(),operation.request_id+'.request.json')),true);const blocked=await h.post('/api/action',{...body,client_batch_id:'panel-action-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'});assert.equal(blocked.status,409);assert.equal(blocked.data.panel_preflight,undefined);assert.equal(h.state().last_operation.request_id,operation.request_id);assert.equal(h.calls.filter(call=>call.name==='image_annotate').length,1);
}));

test('activate restores exact per-window float selection, camera and selected mark through owned reopen without computing',()=>fixture(async h=>{
 const raw=await firstFFT(h),fft=h.state().object,peak={kind:'point',coordinate_space:'frequency_cycles_per_pixel',source_object_id:raw,coordinates:[.1,0],panel:fft.panels[0]};await h.context(peak,cameraFFT,'peak');
 const prior=h.state().edit_state.draft_revision;assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().edit_state.draft_revision,prior+1);assert.deepEqual(h.state().selection.coordinates,a);assert.deepEqual(h.windowFor(V).view_context.camera,cameraA);assert.equal(h.windowFor(V).view_context.selected_annotation_id,'saved-roi');
 const calls=h.calls.length,result=await h.activate(h.windowFor(raw));assert.equal(result.status,200,result.data.error);assert.deepEqual(h.state().selection,peak);assert.equal(h.state().edit_state.draft_revision,prior+2);assert.deepEqual(h.windowFor(raw).view_context.camera,cameraFFT);assert.equal(h.windowFor(raw).view_context.panel_mapping_fingerprint,h.state().panel_mapping_fingerprint);assert.ok(h.calls.slice(calls).every(c=>c.name==='image_info'));
 const ids=h.state().window_collection.windows.map(w=>w.window_id);await h.cold();assert.deepEqual(h.state().window_collection.windows.map(w=>w.window_id),ids);assert.deepEqual(h.windowFor(raw).view_context.camera,cameraFFT);assert.deepEqual(h.state().selection,peak);assert.equal(h.windowFor(raw).view_context.selected_annotation_id,'peak');assert.equal(h.calls.filter(c=>c.name==='image_fft').length,1);
}));

test('each FFT freezes its own source context: A/B P3 returns restore A/B rather than the latest source selection',()=>fixture(async h=>{
 const rawA=await firstFFT(h);assert.equal((await h.act('return-spatial')).status,200);await h.context(picked(b),cameraB,null);assert.equal((await h.act('fft',{selection:picked(b)})).status,200);const rawB=h.state().object.object_id;
 assert.deepEqual(h.windowFor(rawA).source_reference.input_view_context.selection_candidate.coordinates,a);assert.deepEqual(h.windowFor(rawB).source_reference.input_view_context.selection_candidate.coordinates,b);
 assert.equal((await h.activate(h.windowFor(rawA))).status,200);assert.equal(h.state().spatial_return.status,'ready');assert.equal((await h.act('return-spatial')).status,200);assert.deepEqual(h.state().selection.coordinates,a);assert.deepEqual(h.windowFor(V).view_context.camera,cameraA);
 assert.equal((await h.activate(h.windowFor(rawB))).status,200);assert.equal((await h.act('return-spatial')).status,200);assert.deepEqual(h.state().selection.coordinates,b);assert.deepEqual(h.windowFor(V).view_context.camera,cameraB);assert.equal(h.calls.filter(c=>c.name==='image_fft').length,2);
}));

test('P3 source-FFT-source transition fences a late source draft with the single global revision',()=>fixture(async h=>{
 await h.context(picked(a));const oldRevision=h.state().edit_state.draft_revision;assert.equal((await h.act('fft',{selection:picked(a)})).status,200);assert.equal((await h.act('return-spatial')).status,200);assert.ok(h.state().edit_state.draft_revision>oldRevision);
 const before=h.state(),late=await h.act('draft',{draft_revision:oldRevision,dirty:false,gesture_active:false,selection:picked(b),confirm_persistence:true},{draft_revision:oldRevision});assert.equal(late.status,409);assert.deepEqual(h.state(),before);
}));

test('activate A-B-A rejects old same-object draft acknowledgments instead of reusing per-window leases',()=>fixture(async h=>{
 const raw=await firstFFT(h);assert.equal((await h.act('return-spatial')).status,200);const old=h.state(),sourceWindow=h.windowFor(V);assert.equal((await h.activate(h.windowFor(raw))).status,200);assert.equal((await h.activate(sourceWindow)).status,200);assert.equal(h.state().object.object_id,V);assert.equal(h.state().edit_state.draft_revision,old.edit_state.draft_revision+2);
 const before=h.state(),late=await h.act('draft',{draft_revision:old.edit_state.draft_revision,dirty:true,gesture_active:false,selection:picked(b),confirm_persistence:true},{draft_revision:old.edit_state.draft_revision});assert.equal(late.status,409);assert.deepEqual(h.state(),before);
}));

test('activation refuses dirty, gesture, pending and stale identities before reading the target',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');const target=h.windowFor(raw);
 for(const flags of [{dirty:true,gesture_active:false},{dirty:false,gesture_active:true}]){await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,...flags,selection:picked(a),confirm_persistence:true});const count=h.calls.length,before=h.state(),r=await h.activate(target);assert.equal(r.status,409);assert.equal(h.calls.length,count);assert.deepEqual(h.state(),before);}
 await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:picked(a),confirm_persistence:true});const other=h.save(spectral(id(500),[30,30,50,50])),s=h.state();assert.equal((await h.post('/api/present',{object_id:other.object_id,expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision,request_id:'queued'})).status,200);await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:picked(a),confirm_persistence:true});const before=h.state(),count=h.calls.length;assert.equal((await h.activate(target)).status,409);assert.equal(h.calls.length,count);assert.deepEqual(h.state().pending_result,before.pending_result);
}));

test('activation keeps the exact unresolved scientific request and performs no target read',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');h.unknownFFT();assert.equal((await h.act('fft',{selection:picked(a)})).status,400);const before=h.state(),calls=h.calls.length;assert.equal(before.last_operation.state,'submitted');assert.equal((await h.activate(h.windowFor(raw))).status,409);assert.equal(h.calls.length,calls);assert.deepEqual(h.state().last_operation,before.last_operation);assert.equal(h.state().object.object_id,V);
}));

test('activation refuses unconfirmed persistence failure and succeeds only after explicit confirmation recovers it',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');h.breakJournal();assert.equal((await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:picked(a),confirm_persistence:true})).status,400);assert.ok(h.state().draft_persistence.error);const calls=h.calls.length;assert.equal((await h.activate(h.windowFor(raw))).status,409);assert.equal(h.calls.length,calls);h.restoreJournal();assert.equal((await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:picked(a),confirm_persistence:true})).status,200);assert.equal((await h.activate(h.windowFor(raw))).status,200);
}));

test('a direct newer draft arriving during immutable target reads aborts activation before commit',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');const before=h.state(),gate=h.hold(raw),operation=h.activate(h.windowFor(raw));
 try{await Promise.race([gate.started,operation.then(r=>assert.fail('Activation did not reach held target read: '+r.status))]);assert.equal((await h.act('draft',{draft_revision:before.edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:picked(b),confirm_persistence:true})).status,200);}finally{gate.release();}
 const rejected=await operation;assert.equal(rejected.status,409,rejected.data.error);assert.equal(h.state().object.object_id,V);assert.deepEqual(h.state().selection.coordinates,b);assert.equal(h.state().edit_state.dirty,true);assert.deepEqual(h.state().last_operation,before.last_operation);
}));

test('an explicit clean source lease fence resolves an unknown in-flight activation without replaying it',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');const before=h.state(),gate=h.hold(raw),operation=h.activate(h.windowFor(raw));
 try{await Promise.race([gate.started,operation.then(r=>assert.fail('Activation did not reach held target read: '+r.status))]);assert.equal((await h.act('draft',{draft_revision:before.edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:picked(a),confirm_persistence:true})).status,200);}finally{gate.release();}
 assert.equal((await operation).status,409);assert.equal(h.state().object.object_id,V);assert.equal(h.state().edit_state.draft_revision,before.edit_state.draft_revision+1);assert.equal(h.state().edit_state.dirty,false);assert.deepEqual(h.state().last_operation,before.last_operation);assert.equal(h.calls.filter(c=>c.name==='image_fft').length,1);
}));

test('a legal FFT can activate with its own unavailable source candidate and never inherits a different FFT return',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');h.blockObject(V);const result=await h.activate(h.windowFor(raw));assert.equal(result.status,200,result.data.error);assert.equal(h.state().object.object_id,raw);assert.equal(h.state().spatial_return.status,'unavailable');assert.equal(h.state().spatial_return.reason_code,'target_unavailable');h.blockObject(null);
 const unpaired=h.save(spectral(id(501),[30,30,50,50])),current=h.state();assert.equal((await h.post('/api/present',{object_id:unpaired.object_id,expected_object_id:current.object.object_id,draft_revision:current.edit_state.draft_revision,request_id:'unpaired-fft'})).status,200);assert.equal((await h.activate(h.windowFor(raw))).status,200);assert.equal(h.state().spatial_return.status,'ready');assert.equal((await h.activate(h.windowFor(unpaired.object_id))).status,200);assert.equal(h.state().spatial_return.reason_code,'no_saved_return');assert.equal((await h.act('return-spatial')).status,409);
}));

test('passive camera metadata preserves the single active selection, lease and original operation',()=>fixture(async h=>{
 const raw=await firstFFT(h),before=h.state(),target=h.windowFor(V),result=await h.act('window-camera',{collection_revision:before.window_collection.revision,window_id:target.window_id,object_id:V,camera:cameraB});assert.equal(result.status,200,result.data.error);assert.equal(h.state().object.object_id,raw);assert.deepEqual(h.state().selection,before.selection);assert.deepEqual(h.state().edit_state,before.edit_state);assert.deepEqual(h.state().last_operation,before.last_operation);assert.deepEqual(h.windowFor(V).view_context.camera,cameraB);
 const count=h.calls.length,wrong=await h.act('window-camera',{collection_revision:h.state().window_collection.revision,window_id:target.window_id,object_id:raw,camera:cameraA});assert.equal(wrong.status,409);assert.equal(h.calls.length,count);assert.throws(()=>readPanelWindowCamera({scale:Infinity,center_image_xy:[0,0]}),/bounded/);assert.throws(()=>readPanelWindowCamera({scale:1,center_image_xy:[0,0],selection:picked(a)}),/bounded/);
 assert.deepEqual(h.windowFor(raw).source_reference.input_view_context.camera,cameraA);assert.equal((await h.activate(h.windowFor(V))).status,200);assert.deepEqual(h.windowFor(V).view_context.camera,cameraB);assert.equal((await h.activate(h.windowFor(raw))).status,200);assert.equal((await h.act('return-spatial')).status,200);assert.deepEqual(h.windowFor(V).view_context.camera,cameraA);
}));

test('activating a later calibrated FFT display retains the original raw input and P3 snapshot',()=>fixture(async h=>{
 const raw=await firstFFT(h),original=structuredClone(h.records.get(raw));await h.act('return-spatial');const calibration={calibration_id:id(900),revision:1,status:'active',source:'user_statement_not_independently_verified',coordinate_domain:'real_space',xy_scale:{x:.02,y:.02,unit:'nm'}},dependency={calibration_id:calibration.calibration_id,revision:1,status:'active',source:calibration.source,coordinate_domain:'real_space'};
 const display=h.save({...original,object_id:id(601),kind:'fft_view',parent_object_id:raw,spectrum_object_id:raw,xy_calibration:calibration,display_calibration_id:calibration.calibration_id,panels:original.panels.map(p=>({...p,calibration_dependency:dependency}))});assert.equal((await h.act('show',{object_id:display.object_id})).status,200);assert.equal(h.windowFor(display.object_id).source_reference.raw_fft_object_id,raw);assert.deepEqual(h.windowFor(display.object_id).source_reference.input_view_context.selection_candidate.coordinates,a);
 assert.equal((await h.activate(h.windowFor(V))).status,200);assert.equal((await h.activate(h.windowFor(display.object_id))).status,200);assert.equal(h.state().spatial_return.status,'ready');assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().object.object_id,V);assert.deepEqual(h.state().selection.coordinates,a);assert.equal(h.state().object.xy_calibration,undefined);assert.deepEqual(h.records.get(raw),original);
}));

test('FFT input context is absent when the explicit float request differs even within the same integer window',()=>fixture(async h=>{
 await h.context(picked(a));const shifted=[1.75,2.75,20.75,21.75];assert.equal((await h.act('fft',{selection:picked(shifted)})).status,200);const raw=h.state().object.object_id;assert.equal(h.windowFor(raw).source_reference.input_view_context,undefined);assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().selection,null);assert.equal(h.windowFor(V).view_context,undefined);
}));

test('pending FFT keeps its submission input context through cold restore, not the later source draft',()=>fixture(async h=>{
 await h.context(picked(a),cameraA,'saved-roi');const gate=h.hold(),operation=h.act('fft',{selection:picked(a)}),before=h.state();
 try{await Promise.race([gate.started,operation.then(r=>assert.fail('FFT did not reach controlled read: '+r.status))]);assert.equal((await h.act('draft',{draft_revision:before.edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:picked(b),confirm_persistence:true})).status,200);}finally{gate.release();}
 assert.equal((await operation).status,200);assert.ok(h.state().pending_result);const pending=h.state().pending_result;await h.cold();assert.deepEqual(h.state().pending_result,pending);await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:picked(b),confirm_persistence:true});assert.equal((await h.act('accept-result')).status,200);const raw=h.state().object.object_id;assert.deepEqual(h.windowFor(raw).source_reference.input_view_context.selection_candidate.coordinates,a);assert.equal((await h.act('return-spatial')).status,200);assert.deepEqual(h.state().selection.coordinates,a);assert.deepEqual(h.windowFor(V).view_context.camera,cameraA);
}));

test('old checkpoints and malformed optional contexts do not invent selections or prevent valid image recovery',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.cold(checkpoint=>{for(const record of checkpoint.window_collection.records){record.entry.view_context={version:1,object_id:record.entry.object_id,panel_mapping_fingerprint:'bad',camera:cameraA,selection_candidate:picked(b),selected_annotation_id:null};if(record.entry.source_reference)record.entry.source_reference.input_view_context={version:1,object_id:V,panel_mapping_fingerprint:'bad',camera:cameraB,selection_candidate:picked(b),selected_annotation_id:null};}});assert.equal(h.state().object.object_id,raw);assert.equal(h.windowFor(raw).view_context,undefined);assert.equal(h.windowFor(raw).source_reference.input_view_context,undefined);assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().selection,null);
 assert.equal((await h.activate(h.windowFor(raw))).status,200);await h.cold(checkpoint=>{delete checkpoint.window_collection;});assert.equal(h.state().object.object_id,raw);assert.equal(h.windowFor(raw).view_context,undefined);assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().selection,null);
}));

test('target frame, saved bitmap and mapping must qualify before the current object or lease changes',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');const before=h.state(),original=structuredClone(h.records.get(raw));h.records.get(raw).parent_object_id=X;
 assert.equal((await h.activate(h.windowFor(raw))).status,409);assert.equal(h.state().object.object_id,V);assert.deepEqual(h.state().edit_state,before.edit_state);h.records.set(raw,structuredClone(original));
 writeFileSync(path.join(h.workspace,'objects',raw,'preview.png'),Buffer.from('tampered'));assert.equal((await h.activate(h.windowFor(raw))).status,409);writeFileSync(path.join(h.workspace,'objects',raw,'preview.png'),bytes);h.records.get(raw).panels[0].image_rect_xyxy=[0,0,10,10];assert.equal((await h.activate(h.windowFor(raw))).status,409);assert.deepEqual(h.state().edit_state,before.edit_state);assert.deepEqual(h.state().last_operation,before.last_operation);
}));

test('view-context cannot accept a forged selection or annotation and mapping fingerprint stays exact',()=>fixture(async h=>{
 await h.context(picked(a),cameraA,'saved-roi');const before=h.state(),revision=before.window_collection.revision;
 const forged=await h.act('window-context',{collection_revision:revision,camera:cameraB,selected_annotation_id:null,selection_candidate:picked(b)});assert.equal(forged.status,400);assert.deepEqual(h.state(),before);
 const wrong=await h.act('window-context',{collection_revision:revision,camera:cameraB,selected_annotation_id:'not-on-this-image'});assert.equal(wrong.status,409);assert.deepEqual(h.state(),before);assert.equal(before.panel_mapping_fingerprint,panelWindowMappingFingerprint(before.object));
 const active=h.windowFor(V),asset=await h.get(`/api/window-asset?window_id=${active.window_id}&revision=${revision}`);assert.equal(asset.status,200,asset.data.error);assert.equal(asset.data.panel_mapping_fingerprint,active.view_context.panel_mapping_fingerprint);
}));

test('ordinary saved show refuses unresolved requests and dirty leases before reading its target',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');
 await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:picked(a),confirm_persistence:true});
 let before=h.state(),calls=h.calls.length;assert.equal((await h.act('show',{object_id:raw})).status,409);assert.equal(h.calls.length,calls);assert.deepEqual(h.state(),before);
 await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:picked(a),confirm_persistence:true});
 h.unknownFFT();assert.equal((await h.act('fft',{selection:picked(a)})).status,400);before=h.state();calls=h.calls.length;
 assert.equal((await h.act('show',{object_id:raw})).status,409);assert.equal(h.calls.length,calls);assert.deepEqual(h.state().last_operation,before.last_operation);assert.equal(h.state().object.object_id,V);
 assert.equal((await h.act('show',{object_id:F,source_view:true})).status,409);assert.equal(h.calls.length,calls);
}));

test('ordinary saved show fences same-object ABA and restores each registered FFT own return context',()=>fixture(async h=>{
 const rawA=await firstFFT(h);await h.act('return-spatial');await h.context(picked(b),cameraB,null);assert.equal((await h.act('fft',{selection:picked(b)})).status,200);const rawB=h.state().object.object_id;
 assert.equal((await h.act('show',{object_id:rawA})).status,200);assert.equal(h.state().spatial_return.status,'ready');assert.equal((await h.act('return-spatial')).status,200);assert.deepEqual(h.state().selection.coordinates,a);
 const before=h.state();assert.equal((await h.act('show',{object_id:rawB})).status,200);assert.equal((await h.act('show',{object_id:V})).status,200);assert.equal(h.state().edit_state.draft_revision,before.edit_state.draft_revision+2);
 const current=h.state(),late=await h.act('draft',{draft_revision:before.edit_state.draft_revision,dirty:false,gesture_active:false,selection:picked(b),confirm_persistence:true},{draft_revision:before.edit_state.draft_revision});assert.equal(late.status,409);assert.deepEqual(h.state(),current);assert.equal(h.calls.filter(call=>call.name==='image_fft').length,2);
}));

test('ordinary saved show rejects a newer draft after target reads without replacing current or pending',()=>fixture(async h=>{
 const raw=await firstFFT(h);await h.act('return-spatial');const before=h.state(),gate=h.hold(raw),operation=h.act('show',{object_id:raw});
 try{await Promise.race([gate.started,operation.then(r=>assert.fail('Saved show did not reach held read: '+r.status))]);assert.equal((await h.act('draft',{draft_revision:before.edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:picked(b),confirm_persistence:true})).status,200);}finally{gate.release();}
 const rejected=await operation;assert.equal(rejected.status,409,rejected.data.error);assert.equal(h.state().object.object_id,V);assert.deepEqual(h.state().selection.coordinates,b);assert.equal(h.state().edit_state.dirty,true);assert.deepEqual(h.state().pending_result,before.pending_result);assert.deepEqual(h.state().last_operation,before.last_operation);
}));

test('saved show of an unpaired FFT clears another FFT return rather than inheriting its source',()=>fixture(async h=>{
 const raw=await firstFFT(h),unpaired=h.save(spectral(id(888),[30,30,50,50]));assert.equal((await h.act('show',{object_id:unpaired.object_id})).status,200);
 assert.equal(h.state().spatial_return.status,'unavailable');assert.equal(h.state().spatial_return.reason_code,'no_saved_return');assert.equal((await h.act('return-spatial')).status,409);
 assert.equal((await h.act('show',{object_id:raw})).status,200);assert.equal(h.state().spatial_return.status,'ready');
}));
