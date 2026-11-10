// Actual Panel HTTP/owned checkpoints and MCP consumer, controlled provider.
// No numerical FFT, real specimen, browser gesture or model qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createImagePanel} from '../tools/image_panel.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';

const id=n=>n.toString(16).padStart(32,'0'),T=id(1),F=id(2),V=id(3),P=id(4),X=id(5);
const bytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=bytes.toString('base64'),digest=createHash('sha256').update(bytes).digest('hex');
const a=[1.5,2.5,20.5,21.5],b=[30.25,31.125,50.75,52.25],c=[5.5,35.25,22.5,53.75];
const spatialPanel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,64,64],image_rect_xyxy:[0,0,64,64]};
const selection=coordinates=>({kind:'rectangle',coordinate_space:'source_pixels',source_object_id:F,coordinates,panel:structuredClone(spatialPanel)});
const savedMark=(annotation_id,coordinates,note='')=>({annotation_id,kind:'rectangle',text:annotation_id,note,purpose:'resumable_observation',selection_origin:'researcher',observation_contract_version:1,selection_origin_basis:'caller_reported_not_authenticated',status:'hypothesized',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates}});
const source=()=>({object_id:V,kind:'view',parent_object_id:F,array_domain:'spatial',shape_yx:[64,64],panels:[structuredClone(spatialPanel)],annotations:[savedMark('roi-a',a)],display:{gamma:1},files_sha256:{'preview.png':digest}});
const spectral=(ident,rect)=>({object_id:ident,kind:'fft',window:'hann',subtract_mean:true,parent_object_id:F,array_domain:'frequency',source_rect_xyxy:rect,shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],panels:[{domain:'frequency',source_object_id:ident,fft_shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],image_rect_xyxy:[0,0,rect[2]-rect[0],rect[3]-rect[1]]}],annotations:[],display:{gamma:1},files_sha256:{'preview.png':digest}});

async function fixture(run,{empty=false}={}){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-multi-roi-')),records=new Map([[T,{object_id:T,kind:'tiff_source'}],[F,{object_id:F,kind:'frame',source_object_id:T,frame_index:0}],[X,{object_id:X,kind:'frame',source_object_id:T,frame_index:1}]]),calls=[],live=[];
 let sequence=100,panel,owned,holdInfo=null,failFFT=false;
 const save=value=>{records.set(value.object_id,structuredClone(value));if(value.files_sha256){const directory=path.join(workspace,'objects',value.object_id);mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'preview.png'),bytes);}return value;};
 const initial=source();if(empty)initial.annotations=[];save(initial);
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_fft','image_preview','image_annotate'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){
  calls.push({name,args:structuredClone(args)});
  if(name==='image_info'&&holdInfo?.object_id===args.object_id){const hold=holdInfo;holdInfo=null;hold.entered();await hold.wait;}
  let value;
  if(name==='image_info')value=records.get(args.object_id);
  else if(name==='image_fft'){if(failFFT)throw new Error('Controlled unknown FFT');value=save({...spectral(id(++sequence),args.rect),request_id:args.request_id,state:'completed'});}
  else if(name==='image_preview')value=save({...source(),object_id:id(++sequence),request_id:args.request_id,state:'completed'});
  else if(name==='image_annotate'){
   value=structuredClone(records.get(args.object_id));value.object_id=id(++sequence);value.kind='annotate';value.parent_object_id=args.object_id;value.render_base_object_id=records.get(args.object_id).render_base_object_id??args.object_id;value.request_id=args.request_id;value.state='completed';
   if(args.annotations)value.annotations=args.annotations.map(mark=>{const {coordinates,coordinate_space,source_object_id,...rest}=mark;return {...rest,anchor:{coordinates,coordinate_space,source_object_id},...(mark.purpose==='resumable_observation'?{observation_contract_version:1,selection_origin_basis:'caller_reported_not_authenticated'}:{})};});
   for(const update of args.updates??[]){const mark=value.annotations.find(item=>item.annotation_id===update.annotation_id);if(update.coordinates)mark.anchor.coordinates=update.coordinates;for(const key of ['note','text','purpose','selection_origin','status'])if(update[key]!==undefined)mark[key]=update[key];}
   save(value);
  }
  assert.ok(value,'Missing controlled saved object '+args.object_id);return {data:structuredClone(value),png:value.files_sha256?png:null};
 },async close(){}});
 const state=()=>panel.state();
 const start=async()=>{owned=prepareOwnedPanelRegistration({workspace,panel_id:P});panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:owned.checkpoint?.object_id??V,client:client(),panel_id:P,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory,...(owned.checkpoint?{resume_checkpoint:owned.checkpoint}:{})});owned.publish(panel);live.push({owned,panel});};
 const get=async(route,authenticated=true)=>{const r=await fetch(panel.url.split('/#')[0]+route,{headers:authenticated?{'X-Panel-Token':panel.token,Connection:'close'}:{Connection:'close'}});return {status:r.status,data:await r.json()};};
 const act=async(action,params={},extra={})=>{const origin=panel.url.split('/#')[0],r=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({expected_object_id:state().object.object_id,draft_revision:state().edit_state.draft_revision,action,params,...extra})});return {status:r.status,data:await r.json()};};
 const handoff=(snapshot=state(),authenticated=true)=>get('/api/roi-handoff?'+new URLSearchParams({expected_object_id:snapshot.object.object_id,state_revision:String(snapshot.state_revision),draft_revision:String(snapshot.edit_state.draft_revision),collection_revision:String(snapshot.window_collection.revision)}),authenticated);
 const context=async(coordinates,selected_annotation_id=null)=>{assert.equal((await act('draft',{draft_revision:state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:selection(coordinates),confirm_persistence:true})).status,200);assert.equal((await act('window-context',{collection_revision:state().window_collection.revision,camera:{scale:2,center_image_xy:[32,32]},selected_annotation_id})).status,200);};
 const mark=(annotation_id,coordinates,note='')=>act('mark',{selection:selection(coordinates),annotation_id,purpose:'resumable_observation',selection_origin:'researcher',text:annotation_id,note,status:'hypothesized'});
 const activate=object_id=>{const current=state(),entry=current.window_collection.windows.find(window=>window.object_id===object_id);assert.ok(entry);return act('activate-window',{window_id:entry.window_id,collection_revision:current.window_collection.revision});};
 const hold=object_id=>{let release,entered;const wait=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);holdInfo={object_id,wait,entered};return {release,started};};
 const cold=async()=>{await owned.close(panel);await start();};
 try{await start();await run({workspace,records,calls,state,save,get,act,handoff,context,mark,activate,hold,cold,unknown:()=>{failFFT=true;}});}finally{for(const item of live.reverse()){try{await item.owned.close(item.panel);}catch{}}assert.equal(path.dirname(path.resolve(workspace)),path.resolve(tmpdir()));rmSync(workspace,{recursive:true,force:true});}
}
async function fft(h,coordinates=a,selected='roi-a',{capture=true}={}){if(capture)await h.context(coordinates,selected);assert.equal((await h.act('fft',{selection:selection(coordinates)})).status,200);return h.state().object.object_id;}

test('fresh handoff carries three saved ROIs, blank reasoning and separate frozen A/B FFT inputs without writes',()=>fixture(async h=>{
 const rawA=await fft(h);await h.act('return-spatial');assert.equal((await h.mark('roi-b',b)).status,200);assert.equal((await h.mark('roi-c',c,'Inspect this region; interpretation unconfirmed')).status,200);const latest=h.state().object.object_id,rawB=await fft(h,b,'roi-b');
 const before=h.state(),calls=h.calls.length,read=await h.handoff();assert.equal(read.status,200,read.data.error);const packet=read.data;
 assert.equal(packet.read_only,true);assert.equal(packet.validation_status,'validated');assert.equal(packet.active_view_object_id,rawB);assert.equal(packet.active_handoff.current_selection,null);assert.equal(packet.source_observations.length,2);
 const current=packet.source_observations.find(item=>item.object_id===latest);assert.equal(current.observations.length,3);assert.equal(current.observations.find(mark=>mark.annotation_id==='roi-b').reason,null);assert.equal(current.observations.find(mark=>mark.annotation_id==='roi-b').reason_status,'unknown');assert.equal(current.observations.find(mark=>mark.annotation_id==='roi-c').reason_status,'recorded');assert.ok(current.observations.every(mark=>mark.selection_origin_basis==='caller_reported_not_authenticated'));
 const relationA=packet.fft_relations.find(item=>item.raw_fft_object_id===rawA),relationB=packet.fft_relations.find(item=>item.raw_fft_object_id===rawB);assert.equal(relationA.input_view_object_id,V);assert.equal(relationB.input_view_object_id,latest);assert.deepEqual(relationA.input_float_coordinates,a);assert.deepEqual(relationB.input_float_coordinates,b);assert.deepEqual(relationA.recipe,{window:'hann',subtract_mean:true});assert.equal(relationA.input_annotation_id,'roi-a');assert.equal(relationB.input_annotation_id,'roi-b');assert.deepEqual(h.state(),before);assert.ok(h.calls.slice(calls).every(call=>call.name==='image_info'));
}));

test('moved stable ROI is changed geometry while a later saved mark only shares processing support',()=>fixture(async h=>{
 const raw=await fft(h);await h.act('return-spatial');const moved=[1.75,2.75,20.75,21.75];assert.equal((await h.act('edit',{updates:[{annotation_id:'roi-a',coordinates:moved,selection_origin:'researcher'}]})).status,200);assert.equal((await h.mark('roi-later',a)).status,200);
 const read=await h.handoff();assert.equal(read.status,200,read.data.error);const relation=read.data.fft_relations.find(item=>item.raw_fft_object_id===raw),current=h.state().object.object_id;
 assert.deepEqual(relation.input_float_coordinates,a);assert.equal(relation.input_view_object_id,V);assert.equal(relation.current_observation_matches.find(item=>item.source_view_object_id===current&&item.annotation_id==='roi-a').relation,'changed_geometry');assert.equal(relation.current_observation_matches.find(item=>item.source_view_object_id===current&&item.annotation_id==='roi-later').relation,'same_processing_window');
}));

test('closed source still qualifies through the FFT own input; old missing float context never invents one',()=>fixture(async h=>{
 const raw=await fft(h,a,null,{capture:false}),collection=h.state().window_collection,sourceWindow=collection.windows.find(window=>window.object_id===V);assert.equal((await h.act('close-window',{collection_revision:collection.revision,window_id:sourceWindow.window_id})).status,200);
 const read=await h.handoff();assert.equal(read.status,200,read.data.error);const relation=read.data.fft_relations.find(item=>item.raw_fft_object_id===raw);assert.equal(relation.status,'validated');assert.equal(relation.input_float_coordinates,null);assert.equal(relation.input_annotation_id,null);assert.equal(relation.reason_code,'original_float_context_unknown');assert.ok(relation.current_observation_matches.every(match=>match.relation!=='exact_original_geometry'));assert.ok(read.data.source_observations.find(item=>item.object_id===V).roles.includes('fft_input'));
}));

test('source bitmap or frame failures become unavailable references and do not change current data',()=>fixture(async h=>{
 await fft(h);const before=h.state();writeFileSync(path.join(h.workspace,'objects',V,'preview.png'),Buffer.from('corrupt'));
 let read=await h.handoff();assert.equal(read.status,200,read.data.error);assert.equal(read.data.source_observations.find(item=>item.object_id===V).status,'unavailable');assert.equal(read.data.fft_relations[0].status,'unavailable');assert.deepEqual(h.state(),before);
 writeFileSync(path.join(h.workspace,'objects',V,'preview.png'),bytes);h.records.get(V).parent_object_id=X;read=await h.handoff();assert.equal(read.status,200);assert.equal(read.data.source_observations.find(item=>item.object_id===V).status,'unavailable');assert.deepEqual(h.state(),before);
}));

test('unchanged dirty or unresolved state remains inspectable with a blocked gate; stale reads reject without science replay',()=>fixture(async h=>{
 await fft(h);await h.act('return-spatial');await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:selection(b),confirm_persistence:true});let read=await h.handoff();assert.equal(read.status,200);assert.equal(read.data.interaction_gate.status,'blocked');assert.ok(read.data.interaction_gate.reasons.includes('unsaved_draft'));assert.equal(read.data.source_observations[0].handoff.current_selection,null);
 const old=h.state();await h.act('draft',{draft_revision:old.edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:selection(a),confirm_persistence:true});assert.equal((await h.handoff(old)).status,409);
 const gate=h.hold(V),operation=h.handoff();await gate.started;assert.equal((await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:selection(c),confirm_persistence:true})).status,200);gate.release();assert.equal((await operation).status,409);assert.deepEqual(h.state().selection.coordinates,c);
 await h.act('draft',{draft_revision:h.state().edit_state.draft_revision+1,dirty:false,gesture_active:false,selection:selection(a),confirm_persistence:true});h.unknown();assert.equal((await h.act('fft',{selection:selection(a)})).status,400);const before=h.state(),calls=h.calls.length;read=await h.handoff();assert.equal(read.status,200,read.data.error);assert.ok(read.data.interaction_gate.reasons.includes('operation_unresolved'));assert.deepEqual(h.state().last_operation,before.last_operation);assert.ok(h.calls.slice(calls).every(call=>call.name==='image_info'));
}));

test('handoff authentication, ambiguity and annotation budgets do not produce an apparently valid truncated ROI set',()=>fixture(async h=>{
 assert.equal((await h.handoff(h.state(),false)).status,403);const object=h.records.get(V);object.annotations=[savedMark('duplicate',a),savedMark('duplicate',b)];let read=await h.handoff();assert.equal(read.status,200);assert.equal(read.data.source_observations[0].status,'unavailable');assert.equal(read.data.source_observations[0].reason_code,'ambiguous_annotation_identity');
 object.annotations=Array.from({length:101},(_,i)=>savedMark('roi-'+i,a));read=await h.handoff();assert.equal(read.status,200);assert.equal(read.data.source_observations[0].status,'unavailable');assert.deepEqual(read.data.source_observations[0].observations,[]);
}));

test('MCP current consumes the qualified HTTP handoff and preserves its one active saved PNG semantics',()=>fixture(async h=>{
 const raw=await fft(h),before=h.state(),manager=new ImagePanelManager({workspace:h.workspace,python:path.resolve('unused-python'),inspect:async()=>({})});manager.initialize();
 const result=await manager.current({panel_id:P}),data=JSON.parse(result.content.find(item=>item.type==='text').text);assert.equal(data.view.object.object_id,raw);assert.equal(data.roi_handoff.source_view_object_id,raw);assert.equal(data.multi_roi_handoff.active_view_object_id,raw);assert.equal(data.multi_roi_handoff.source_observations.find(source=>source.object_id===V).status,'validated');assert.equal(data.multi_roi_handoff.panel_generation,before.panel_generation);assert.equal(result.content.filter(item=>item.type==='image').length,1);assert.deepEqual(h.state(),before);
}));

test('explicit latest observation reference survives historical P3 return and owned reopen without rebinding FFT input',()=>fixture(async h=>{
 const raw=await fft(h);await h.act('return-spatial');await h.mark('roi-b',b);await h.mark('roi-c',c);const latest=h.state().object.object_id;assert.equal((await h.activate(raw)).status,200);assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().object.object_id,V);
 let read=await h.handoff();assert.equal(read.status,200,read.data.error);let packet=read.data;assert.equal(packet.source_observations.find(source=>source.object_id===latest).observations.length,3);assert.ok(packet.source_observations.find(source=>source.object_id===latest).roles.includes('latest_observation'));assert.equal(packet.fft_relations[0].input_view_object_id,V);assert.deepEqual(packet.fft_relations[0].input_float_coordinates,a);
 const calls=h.calls.length;assert.equal((await h.mark('roi-historical',b)).status,409);assert.equal((await h.act('edit',{updates:[{annotation_id:'roi-a',note:'Must not branch older observations'}]})).status,409);assert.equal(h.calls.length,calls,'Historical source writes are refused before annotation dispatch');
 assert.equal((await h.activate(raw)).status,200);const collection=h.state().window_collection,sourceWindow=collection.windows.find(window=>window.object_id===V);assert.equal((await h.act('close-window',{collection_revision:collection.revision,window_id:sourceWindow.window_id})).status,200);
 read=await h.handoff();assert.equal(read.status,200,read.data.error);assert.equal(read.data.source_observations.find(source=>source.object_id===latest).observations.length,3);
 await h.cold();read=await h.handoff();assert.equal(read.status,200,read.data.error);packet=read.data;assert.equal(packet.source_observations.find(source=>source.object_id===latest).observations.length,3);assert.equal(packet.fft_relations[0].input_view_object_id,V);assert.equal(h.calls.filter(call=>call.name==='image_fft').length,1);
}));
