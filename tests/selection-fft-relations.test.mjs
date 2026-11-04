// Pure consumer / controlled read promises only. No provider, GUI or arrays.
import test from 'node:test';import assert from 'node:assert/strict';
import {selectionFftRelationsModel,SelectionFftRelations} from '../ui/image-panel/selection-fft-relations.mjs';
const id=n=>n.toString(16).padStart(32,'0'),copy=v=>JSON.parse(JSON.stringify(v)),F=id(1),V=id(2),X=id(3),D=id(4),P=id(5),H=id(6),W=id(7),A=id(8),float=[10.1,20.2,40.3,60.4],support=[10,20,41,61],sha='a'.repeat(64),request='panel-'+id(50)+'-1';
function fixture(){
 const anchor={source_object_id:F,coordinate_space:'source_pixels',coordinates:float},observation={annotation_id:'roi-a',label:'ROI A',status:'saved',usable:true,original_anchor:anchor,rect_xyxy:support},panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,100,100],image_rect_xyxy:[0,0,100,100]},reference={input_view_object_id:V,frame_object_id:F,raw_fft_object_id:X,processing_rect_xyxy:support,calibration_relation:'same'};
 const state={panel_id:P,helper_session_id:H,panel_generation:2,state_revision:11,object:{object_id:V,panels:[panel],annotations:[{annotation_id:'roi-a',kind:'rectangle',status:'hypothesized',anchor}],xy_calibration:null},frame_identity:{frame_object_id:F},edit_state:{draft_revision:9,dirty:false,gesture_active:false},window_collection:{schema_version:1,revision:4,frame_object_id:F,active_window_id:A,windows:[{window_id:A,object_id:V,role:'source',title:'来源图像',layout:{x:0,y:0,width:.5,height:1,z:1}},{window_id:W,object_id:D,role:'fft',title:'FFT A',layout:{x:.5,y:0,width:.5,height:1,z:2},source_reference:reference}]}};
 const packet={schema_version:1,read_only:true,validation_status:'validated',panel_id:P,helper_session_id:H,panel_generation:2,active_view_object_id:V,frame_object_id:F,state_revision:11,draft_revision:9,collection_revision:4,interaction_gate:{status:'blocked'},source_observations:[{object_id:V,roles:['active_spatial','fft_input'],status:'validated',frame_object_id:F,observations:[observation],handoff:{source_view_object_id:V,scientific_input:{frame_object_id:F},saved_rectangles:[observation]}}],fft_relations:[{window_id:W,display_object_id:D,raw_fft_object_id:X,input_view_object_id:V,status:'validated',processing_rect_xyxy:support,input_float_coordinates:float,input_annotation_id:'roi-a',calibration_relation:'same',current_observation_matches:[]}]};
 const history={schema_version:1,read_only:true,records:[{schema_version:1,kind:'gui_fft_input_v1',qualification:'validated',status:'completed',request_id:request,input_sha256:sha,fft_object_id:X,input_snapshot:{schema_version:1,source_view_object_id:V,provider_input_object_id:F,frame_object_id:F,annotation_id:'roi-a',float_roi_xyxy:float,processing_rect_xyxy:support,source_view_manifest_sha256:sha,provider_input_manifest_sha256:sha,frame_manifest_sha256:sha,frame_array_sha256:sha,calibration_sha256:sha,calibration_snapshot:null,recipe:{window:'hann',subtract_mean:true}}}]};
 return copy({state,packet,history,selected:{annotation_id:'roi-a',selection:{kind:'rectangle',...anchor,panel},pending_geometry:false}});
}
const model=f=>selectionFftRelationsModel(f.state,f.selected,f.packet,f.history);
test('original saved ROI has exact source/float/support and guarded view references without Agent readiness',()=>{
 const f=fixture(),before=copy(f),m=model(f),r=m.rows[0];assert.equal(m.status,'ready');assert.equal(r.relation,'original_roi');assert.deepEqual(r.input_float_coordinates,float);assert.deepEqual(r.processing_rect_xyxy,support);assert.equal(r.source_object_id,F);assert.equal(r.coordinate_space,'source_pixels');assert.equal(r.calibration_relation,'same');assert.equal(r.canReuse,false);assert.deepEqual(r.viewTarget,{kind:'window',window_id:W,object_id:D,collection_revision:4});assert.deepEqual(r.inputTarget,{kind:'show',object_id:V});assert.deepEqual(f,before);
});
test('FFT mode remains available with selected peak/line or no selection',()=>{
 const f=fixture();f.state.object={object_id:D,panels:[{domain:'frequency',source_object_id:X,fft_shape_yx:[41,31]}],annotations:[]};f.state.window_collection.active_window_id=W;f.packet.active_view_object_id=D;
 for(const selected of [null,{annotation_id:'peak-g1',selection:{kind:'point'}},{selection:{kind:'line'}}]){const m=selectionFftRelationsModel(f.state,selected,f.packet,f.history);assert.equal(m.mode,'fft');assert.equal(m.rows[0].raw_fft_object_id,X);assert.equal(m.rows[0].inputTarget.object_id,V);assert.equal(m.rows[0].canReuse,false);}
});
test('same float under another ID is not original ownership; matching support alone is never exact',()=>{
 for(const [coords,expected]of [[float,'same_float'],[[10.2,20.3,40.4,60.5],'same_support']]){const f=fixture();f.state.object.annotations[0].annotation_id='roi-b';f.state.object.annotations[0].anchor.coordinates=coords;f.selected.annotation_id='roi-b';f.selected.selection.coordinates=coords;const r=model(f).rows[0];assert.equal(r.relation,expected);assert.equal(r.input_annotation_id,'roi-a');assert.equal(r.canReuse,false);}
});
test('a moved stable ROI keeps old FFT input; pending local geometry is not treated as canonical',()=>{
 const f=fixture();f.state.object.annotations[0].anchor.coordinates=[60,60,90,90];f.selected.selection.coordinates=[60,60,90,90];let r=model(f).rows[0];assert.equal(r.relation,'changed_geometry');assert.equal(r.historical,true);assert.deepEqual(r.input_float_coordinates,float);
 const pending=fixture();pending.selected.selection.coordinates=[20,30,50,70];pending.selected.pending_geometry=true;const m=model(pending);assert.equal(m.pending_geometry,true);r=m.rows[0];assert.equal(r.historical,true);assert.match(r.reason,/工作位置尚未应用/);assert.deepEqual(r.input_float_coordinates,float);assert.equal(r.canReuse,false);
});
test('different calibration and display shape cannot enable current reuse',()=>{
 const f=fixture();f.state.object.xy_calibration={calibration_id:id(90),xy_scale:{x:.1,y:.2,unit:'nm'}};f.state.object.shape_yx=[999,2000];const r=model(f).rows[0];assert.equal(r.calibration_relation,'different');assert.equal(r.historical,true);assert.equal(r.canReuse,false);
});
test('closed and additional parameter versions come from qualified existing execution history',()=>{
 const f=fixture(),old=f.state.window_collection.windows.pop();f.state.window_collection.closed_windows=[old];f.packet.fft_relations=[];
 const extra=copy(f.history.records[0]);extra.fft_object_id=id(91);extra.request_id='panel-'+id(51)+'-2';extra.input_snapshot.recipe={window:'none',subtract_mean:false};f.history.records.push(extra);const m=model(f);assert.equal(m.rows.length,2);assert.equal(m.rows[0].viewTarget.kind,'window');assert.deepEqual(m.rows[1].recipe,{window:'none',subtract_mean:false});assert.deepEqual(m.rows[1].viewTarget,{kind:'show',object_id:id(91),input_reference:{kind:'execution',request_id:extra.request_id}});
});
test('legacy/unqualified/budget history remains unknown, never an assertion that no FFT exists',()=>{
 for(const history of [null,{schema_version:1,read_only:true,records:[{qualification:'unavailable',status:'unknown'}]},{schema_version:1,read_only:true,records:Array.from({length:513},()=>({}))}]){const f=fixture();f.history=history;f.packet.fft_relations=[];const m=model(f);assert.equal(m.status,'partial');assert.equal(m.rows.length,0);assert.match(m.message,/未知/);assert.doesNotMatch(m.message,/尚无对应|没有.*FFT/);assert.ok(m.warnings.length);}
});
test('all envelope identities and versions reject foreign or late packets',()=>{
 for(const [field,value]of [['panel_id',id(20)],['helper_session_id',id(21)],['panel_generation',3],['active_view_object_id',id(22)],['frame_object_id',id(23)],['state_revision',12],['draft_revision',10],['collection_revision',5]]){const f=fixture();f.packet[field]=value;const m=model(f);assert.equal(m.status,'unavailable',field);assert.equal(m.rows.length,0);}
});
test('malformed/conflicting float support, saved anchors and duplicate proofs cannot produce a viewing authority',()=>{
 for(const change of [f=>{f.packet.fft_relations[0].input_float_coordinates=[11.1,20.2,40.3,60.4];},f=>{f.packet.source_observations[0].handoff.saved_rectangles=[];},f=>{f.history.records.push(copy(f.history.records[0]));}]){const f=fixture();change(f);const m=model(f);assert.equal(m.status,'unavailable');assert.equal(m.rows.length,0);}
 const f=fixture();f.history.records[0].input_snapshot.float_roi_xyxy=[10.2,20.2,40.3,60.4];const m=model(f);assert.equal(m.status,'partial');assert.equal(m.rows[0].relation,'unknown');assert.equal(m.rows[0].viewTarget,null);
});
test('temporary selection can match known geometry without inventing a stable original ROI ID',()=>{
 const f=fixture();f.selected.annotation_id=null;const r=model(f).rows[0];assert.equal(r.relation,'same_float');assert.equal(r.canReuse,false);
});
test('foreign temporary mapping is not a canonical ROI and missing floats do not assert a geometry change',()=>{
 const f=fixture();f.selected.annotation_id=null;f.selected.selection.panel.source_object_id=id(99);assert.equal(model(f).mode,'none');
 const unknown=fixture();unknown.history.records=[];unknown.packet.fft_relations[0].input_float_coordinates=null;assert.equal(model(unknown).rows[0].relation,'unknown');
});
test('a valid raw execution cannot qualify an unavailable derivative display window',()=>{
 const f=fixture();f.packet.fft_relations[0].status='unavailable';const r=model(f).rows[0];assert.equal(r.viewTarget.kind,'show');assert.equal(r.viewTarget.object_id,X);assert.equal(r.inputTarget.object_id,V);
});
test('controller performs only the two existing GETs and returns the exact model',async()=>{
 const f=fixture(),calls=[],published=[],controller=new SelectionFftRelations({getState:()=>f.state,getSelection:()=>f.selected,api:async url=>{calls.push(url);return url==='/api/execution-history'?f.history:f.packet;},onChange:m=>published.push(m)});
 const m=await controller.refresh();assert.equal(m.rows.length,1);assert.equal(published.length,1);assert.equal(calls.length,2);assert.match(calls[0],/^\/api\/roi-handoff\?expected_object_id=.*&state_revision=11&draft_revision=9&collection_revision=4$/);assert.equal(calls[1],'/api/execution-history');
});
test('controller allows published drafts but rejects a changed selection/envelope while waiting',async()=>{
 for(const change of [f=>{f.selected.pending_geometry=true;},f=>{f.state.panel_generation++;},f=>{f.state.edit_state.draft_revision++;},f=>{f.state.window_collection.revision++;},f=>{f.state.object.object_id=id(88);}]){const f=fixture();f.state.edit_state.dirty=true;const releases=[],published=[];const c=new SelectionFftRelations({getState:()=>f.state,getSelection:()=>f.selected,api:()=>new Promise(resolve=>releases.push(resolve)),onChange:m=>published.push(m)});const waiting=c.refresh();change(f);releases[0](f.packet);releases[1](f.history);assert.equal(await waiting,null);assert.equal(published.length,0);}
 const f=fixture();f.state.edit_state.dirty=true;const c=new SelectionFftRelations({getState:()=>f.state,getSelection:()=>f.selected,api:async url=>url==='/api/execution-history'?f.history:f.packet});assert.equal((await c.refresh()).rows.length,1);
});
test('superseded reads and invalidation do not publish old models; GET errors are unavailable',async()=>{
 const f=fixture(),releases=[],published=[],c=new SelectionFftRelations({getState:()=>f.state,getSelection:()=>f.selected,api:()=>new Promise(resolve=>releases.push(resolve)),onChange:m=>published.push(m)});const one=c.refresh(),two=c.refresh();releases[2](f.packet);releases[3](f.history);assert.equal((await two).rows.length,1);releases[0](f.packet);releases[1](f.history);assert.equal(await one,null);assert.equal(published.length,1);
 const three=c.refresh();c.invalidate();releases[4](f.packet);releases[5](f.history);assert.equal(await three,null);
 const fail=new SelectionFftRelations({getState:()=>f.state,getSelection:()=>f.selected,api:async()=>{throw Error('controlled bounded read failure');}});assert.equal((await fail.refresh()).status,'unavailable');
 const historyFail=new SelectionFftRelations({getState:()=>f.state,getSelection:()=>f.selected,api:async url=>{if(url==='/api/execution-history')throw Error('history timeout');return f.packet;}});assert.match((await historyFail.refresh()).message,/执行历史读取未完成.*history timeout/);
});
