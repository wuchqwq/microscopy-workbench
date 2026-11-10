import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectVisualReadiness} from '../ui/image-panel/research-input-readiness.mjs';

const viewId='a'.repeat(32),frameId='b'.repeat(32),otherId='c'.repeat(32);
const local=()=>({view_id:viewId,state_revision:7,draft_revision:3,settled:true});
function snapshot(){return {
 object:{object_id:viewId,kind:'view',dtype:'uint16',shape_yx:[22,20],annotations:[],annotation_reprojection:false,files_sha256:{'preview.png':'d'.repeat(64)},panels:[{domain:'spatial_pixels',source_object_id:frameId,source_rect_xyxy:[5,6,25,28],image_rect_xyxy:[0,0,200,220]}]},
 frame_identity:{frame_object_id:frameId},state_revision:7,
 edit_state:{draft_revision:3,dirty:false,gesture_active:false,annotation_edit:null,selection:null},
 draft_persistence:{pending:false,error:null},selection:null,pending_result:null,last_operation:null,
 window_collection:{revision:8},workspace_analysis:{status:'dirty',working_revision:9,unresolved_request_id:null,unresolved_save_id:null,recovery_available:false},
 research_question:{version:1,text:'Local question; never copied to the output',context_object_id:viewId,frame_object_id:frameId,recorded_utc:'2026-11-08T00:00:00.000Z'}
};}
const encoded=v=>v===undefined?undefined:JSON.stringify(v);
const display=s=>s?.object?.files_sha256?.['preview.png']?{view_id:s.object.object_id,png_sha256:s.object.files_sha256['preview.png']}:undefined;
const inspect=(s=snapshot(),u=local())=>inspectVisualReadiness(encoded(s),encoded(u),encoded(display(s)));
function blocked(s,u,code){const r=inspectVisualReadiness(encoded(s),encoded(u),encoded(display(s)));assert.equal(r.status,'blocked');assert.ok(r.blockers.includes(code),JSON.stringify(r));return r;}

test('clean saved spatial metadata is inspectable without claiming approval, provenance or model vision',()=>{
 const s=snapshot(),u=local(),before=structuredClone({s,u}),r=inspect(s,u);
 assert.equal(r.status,'metadata_ready');assert.deepEqual(r.blockers,[]);
 assert.equal(r.mode,'inspection_only');assert.equal(r.read_only,true);assert.equal(r.requires_fresh_check,true);
 for(const key of ['approved','model_can_view','owner_verified','image_bytes_checked','provider_records_checked'])assert.equal(r[key],false,key);
 assert.equal(r.scope,'complete_saved_spatial_view');assert.equal(r.coordinate_space,'source_pixels');
 assert.deepEqual(r.source_rect_xyxy,[5,6,25,28]);assert.deepEqual(r.image_rect_xyxy,[0,0,200,220]);assert.deepEqual(r.shape_yx,[22,20]);assert.equal(r.dtype,'uint16');
 assert.deepEqual(r.question_binding,{status:'exact_view',view_id:viewId,frame_id:frameId});assert.deepEqual(r.revisions,{state:7,draft:3,collection:8,working:9});
 assert.deepEqual({s,u},before);r.source_rect_xyxy[0]=99;r.shape_yx[0]=1;assert.deepEqual({s,u},before,'output arrays cannot mutate source metadata');
});
test('only the declared projection is returned; private text, images, paths and unknown metadata stay absent',()=>{
 const s=snapshot();s.png_base64='PRIVATE_PIXELS';s.workspace='/private/path';s.object.user_context={private:'PRIVATE_DETAIL'};s.research_question.text='PRIVATE_QUESTION_MARKER';
 const r=inspect(s);assert.equal(r.status,'metadata_ready');const encoded=JSON.stringify(r);
 assert.doesNotMatch(encoded,/PRIVATE_|png_base64|data:image|workspace|image_path|user_context|filename|startTurn/);
 assert.deepEqual(Object.keys(r).sort(),['schema_version','mode','read_only','status','blockers','approved','model_can_view','owner_verified','image_bytes_checked','provider_records_checked','requires_fresh_check','view_id','frame_id','scope','coordinate_space','source_rect_xyxy','image_rect_xyxy','dtype','shape_yx','declared_png_sha256','question_binding','revisions'].sort());
});
test('unpublished inputs and mismatched local revisions block even a clean server snapshot',()=>{
 blocked(snapshot(),{...local(),settled:false},'local_inputs_unsettled');
 for(const change of [{view_id:otherId},{state_revision:8},{draft_revision:4}])blocked(snapshot(),{...local(),...change},'local_snapshot_differs');
 blocked(snapshot(),undefined,'local_inputs_unsettled');
});
for(const [name,change,code] of [
 ['missing frame',s=>{s.frame_identity=null;},'frame_missing'],
 ['foreign mapping',s=>{s.object.panels[0].source_object_id=otherId;},'source_mapping_invalid'],
 ['FFT',s=>{s.object.panels[0].domain='frequency';},'unsupported_view'],
 ['composite',s=>{s.object.panels.push(structuredClone(s.object.panels[0]));},'unsupported_view'],
 ['raw frame',s=>{s.object.kind='frame';},'unsupported_view'],
 ['saved overlay',s=>{s.object.annotations=[{kind:'rectangle'}];},'annotations_present_or_unknown'],
 ['reprojected overlay',s=>{s.object.annotation_reprojection=true;},'annotations_present_or_unknown'],
 ['malformed annotations',s=>{s.object.annotations={};},'annotations_present_or_unknown'],
 ['missing PNG reference',s=>{delete s.object.files_sha256;},'display_reference_missing'],
 ['fractional range',s=>{s.object.panels[0].source_rect_xyxy[0]=5.5;},'source_mapping_invalid'],
 ['zero display extent',s=>{s.object.panels[0].image_rect_xyxy=[0,0,0,1];},'source_mapping_invalid'],
 ['array/display confusion',s=>{s.object.shape_yx=[220,200];},'array_metadata_invalid'],
 ['complex dtype',s=>{s.object.dtype='complex64';},'array_metadata_invalid'],
 ['missing question',s=>{delete s.research_question;},'question_missing_or_invalid'],
 ['malformed question',s=>{s.research_question.extra='private';},'question_missing_or_invalid'],
 ['another question view',s=>{s.research_question.context_object_id=otherId;},'question_source_differs'],
 ['another question frame',s=>{s.research_question.frame_object_id=otherId;},'question_source_differs'],
 ['dirty edit',s=>{s.edit_state.dirty=true;},'draft_unsettled'],
 ['gesture',s=>{s.edit_state.gesture_active=true;},'draft_unsettled'],
 ['pending annotation edit',s=>{s.edit_state.annotation_edit={};},'draft_unsettled'],
 ['missing edit state',s=>{delete s.edit_state;},'draft_unsettled'],
 ['unconfirmed draft publication',s=>{delete s.draft_persistence;},'draft_persistence_unsettled'],
 ['draft publication pending',s=>{s.draft_persistence.pending=true;},'draft_persistence_unsettled'],
 ['draft publication failure',s=>{s.draft_persistence.error='do not echo private detail';},'draft_persistence_unsettled'],
 ['new selection',s=>{s.selection={kind:'rectangle',coordinates:[6,7,8,9]};},'selection_requires_saved_view'],
 ['pending display',s=>{s.pending_result={object_id:otherId};},'pending_result_or_unknown'],
 ['unknown pending state',s=>{delete s.pending_result;},'pending_result_or_unknown'],
 ['original unknown request',s=>{s.last_operation={state:'unknown',request_id:'original-request'};},'operation_unresolved'],
 ['submitted request',s=>{s.last_operation={state:'submitted',request_id:'original-request'};},'operation_unresolved'],
 ['unrecognized operation',s=>{s.last_operation={state:'future-state'};},'operation_unresolved'],
 ['source recheck',s=>{s.source_recheck={status:'available'};},'source_recheck_pending'],
 ['missing revision',s=>{delete s.window_collection.revision;},'revisions_unknown'],
 ['unknown save',s=>{s.workspace_analysis.status='save_unknown';},'workspace_unsettled'],
 ['unresolved request',s=>{s.workspace_analysis.unresolved_request_id='original-request';},'workspace_unsettled'],
 ['unresolved save',s=>{s.workspace_analysis.unresolved_save_id='original-save';},'workspace_unsettled'],
 ['recovery',s=>{s.workspace_analysis.recovery_available=true;},'workspace_unsettled'],
 ['unknown recovery state',s=>{delete s.workspace_analysis.recovery_available;},'workspace_unsettled']
])test('metadata abstains: '+name,()=>{const s=snapshot();change(s);const before=structuredClone(s);blocked(s,local(),code);assert.deepEqual(s,before,'original input/request is preserved');});

test('missing snapshots fail closed, and known terminal operations remain metadata-only',()=>{
 for(const s of [undefined,null,[],false,'snapshot'])blocked(s,local(),'snapshot_missing');
 for(const state of ['completed','failed','interrupted']){const s=snapshot();s.last_operation={state,request_id:'retain-original'};assert.equal(inspect(s).status,'metadata_ready');assert.equal(s.last_operation.request_id,'retain-original');}
});
test('each read recomputes current conditions; returning to old metadata grants no lasting capability',()=>{
 const s=snapshot(),first=inspect(s);s.research_question.context_object_id=otherId;blocked(s,local(),'question_source_differs');s.research_question.context_object_id=viewId;
 const restored=inspect(s);assert.equal(restored.status,'metadata_ready');assert.notEqual(restored,first);assert.equal(restored.approved,false);
});
test('malformed status objects are refused without executing their coercion methods',()=>{
 const s=snapshot(),trap={toString(){assert.fail('Unexpected status coercion');}};
 s.last_operation={state:trap};s.workspace_analysis.status=trap;
 const r=inspect(s);assert.equal(r.status,'blocked');assert.ok(r.blockers.includes('operation_unresolved'));assert.ok(r.blockers.includes('workspace_unsettled'));
});
test('the deployed inspector depends only on the existing pure question reader',()=>{
 const code=readFileSync(new URL('../ui/image-panel/research-input-readiness.mjs',import.meta.url),'utf8');
 assert.deepEqual([...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(v=>v[1]),['./research-question.mjs']);
 assert.doesNotMatch(code,/\b(?:fetch|XMLHttpRequest|WebSocket|readFileSync|openSync|Buffer|Image|createResearchSendGate|prepareResearchHostImage|hostTurnWireInput|startTurn)\s*\(/);
});
