import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyMultiRoiHandoff,multiRoiContinuationLines} from '../ui/image-panel/multi-roi-handoff.mjs';
import {panelRoiHandoff,roiObservationModel} from '../ui/image-panel/roi-observations.mjs';
import {ResearchWorkspace,agentContinuationText} from '../ui/image-panel/research-workspace.mjs';
const id=n=>n.toString(16).padStart(32,'0'),F=id(1),OLD=id(2),LATEST=id(3),FFT=id(4),P=id(5);
const panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,128,96],image_rect_xyxy:[0,0,128,96]};
const marker=(n,c,note='')=>({annotation_id:'roi-'+n,kind:'rectangle',text:'ROI '+n,note,status:'hypothesized',purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:c}});
const source=(object_id,annotations)=>({object:{object_id,panels:[panel],annotations},frame_identity:{frame_object_id:F},selection:null,edit_state:{dirty:false,gesture_active:false,annotation_edit:null,draft_revision:8}});
function fixture(){
 const old=source(OLD,[marker(1,[1.5,2.5,20.5,21.5])]),latest=source(LATEST,[marker(1,[5.5,2.5,24.5,21.5]),marker(2,[40,2,60,22],'Compare the two public regions'),marker(3,[70,2,90,22])]);
 const state={panel_id:P,multi_roi_handoff_schema_version:1,state_revision:40,object:{object_id:FFT,panels:[{domain:'frequency',source_object_id:FFT,fft_shape_yx:[20,20],image_rect_xyxy:[0,0,20,20]}],annotations:[]},frame_identity:{frame_object_id:F},selection:{kind:'point',coordinate_space:'frequency_cycles_per_pixel',source_object_id:FFT,coordinates:[.1,0]},edit_state:{dirty:false,gesture_active:false,annotation_edit:null,draft_revision:8},draft_persistence:{pending:false,error:null},window_collection:{revision:12,windows:[{role:'source',object_id:LATEST},{role:'fft',object_id:FFT,source_reference:{input_view_object_id:OLD}}]}};
 const sources=[old,latest].map((s,i)=>({object_id:s.object.object_id,frame_object_id:F,roles:[i?'retained_spatial':'fft_input'],status:'validated',reason_code:null,handoff:panelRoiHandoff(s),observations:roiObservationModel(s).rows.map(r=>({...r,reason_status:r.reason===null?'unknown':'recorded'}))}));
 const active=panelRoiHandoff(state),packet={schema_version:1,read_only:true,panel_id:P,validation_status:'validated',active_view_object_id:FFT,state_revision:40,draft_revision:8,collection_revision:12,frame_object_id:F,interaction_gate:active.interaction_gate,active_handoff:active,source_observations:sources,fft_relations:[{window_id:'fft-window',display_object_id:FFT,raw_fft_object_id:FFT,input_view_object_id:OLD,status:'validated',reason_code:null,calibration_relation:'unknown',processing_rect_xyxy:[1,2,21,22],input_float_coordinates:[1.5,2.5,20.5,21.5],input_annotation_id:'roi-1',current_observation_matches:[{source_view_object_id:LATEST,annotation_id:'roi-1',relation:'changed_geometry'}]}]};
 return {state,packet};
}
test('FFT handoff preserves three current ROIs and its earlier input geometry without projecting the active frequency pick',()=>{
 const {state,packet}=fixture(),before=structuredClone(packet),summary=qualifyMultiRoiHandoff(packet,state),prompt=agentContinuationText(roiObservationModel(state),P,undefined,summary);
 assert.equal(summary.source_observations[1].observations.length,3);assert.equal(summary.fft_relations[0].input_view_object_id,OLD);
 assert.deepEqual(summary.fft_relations[0].input_float_coordinates,[1.5,2.5,20.5,21.5]);assert.deepEqual(summary.source_observations[1].observations[0].original_anchor.coordinates,[5.5,2.5,24.5,21.5]);
 assert.equal(summary.source_observations[1].observations[0].reason,null);assert.match(prompt,/ROI 3/);assert.match(prompt,/changed_geometry/);assert.match(prompt,/理由未填写/);assert.doesNotMatch(prompt,/frequency_cycles_per_pixel/);assert.deepEqual(packet,before);
});
for(const slot of ['state_revision','draft_revision','collection_revision'])test('stale '+slot+' cannot create a mixed-version Agent prompt',()=>{
 const {state,packet}=fixture();packet[slot]--;assert.throws(()=>qualifyMultiRoiHandoff(packet,state),/版本/);
});
test('wrong source frame, forged usable geometry, duplicate ROI identity and forged ready gate are refused',()=>{
 for(const corrupt of [p=>p.source_observations[1].frame_object_id=id(9),p=>p.source_observations[1].observations[0].original_anchor.coordinates=[1,2,3,4],p=>p.source_observations[1].observations.push(p.source_observations[1].observations[0]),p=>p.interaction_gate.reasons=['unsaved_draft']]){
  const {state,packet}=fixture();corrupt(packet);assert.throws(()=>qualifyMultiRoiHandoff(packet,state),/核对/);
 }
});
test('readonly sources can be unavailable and floats unknown without filling them from newer ROIs',()=>{
 const {state,packet}=fixture();packet.validation_status='partial';packet.source_observations[0]={...packet.source_observations[0],status:'unavailable',reason_code:'target_unavailable',handoff:null,observations:[]};packet.fft_relations[0]={...packet.fft_relations[0],status:'unavailable',input_float_coordinates:null,input_annotation_id:null};
 const summary=qualifyMultiRoiHandoff(packet,state),lines=multiRoiContinuationLines(summary).join('\n');assert.equal(summary.fft_relations[0].input_float_coordinates,null);assert.equal(summary.hasSavedObservations,true);assert.match(lines,/target_unavailable/);assert.match(lines,/不自动补算/);
});
test('bounded long labels, unknown legacy matches and calibration differences remain visible',()=>{
 const {state,packet}=fixture();packet.source_observations[1].observations[0].label='观'.repeat(256);packet.fft_relations[0].calibration_relation='different';packet.fft_relations[0].current_observation_matches.push({source_view_object_id:LATEST,annotation_id:null,relation:'unknown'});
 const summary=qualifyMultiRoiHandoff(packet,state);assert.equal(summary.source_observations[1].observations[0].label.length,256);assert.equal(summary.fft_relations[0].calibration_relation,'different');assert.equal(summary.fft_relations[0].current_observation_matches[1].annotation_id,null);assert.ok(summary.source_observations[1].scientific_input);
 packet.fft_relations[0].current_observation_matches[1].relation='exact_original_geometry';assert.throws(()=>qualifyMultiRoiHandoff(packet,state),/核对/);
});
test('another helper generation or a contradictory validated input is refused',()=>{
 const {state,packet}=fixture();packet.helper_session_id=id(9);assert.throws(()=>qualifyMultiRoiHandoff(packet,state),/版本/);delete packet.helper_session_id;
 packet.source_observations[0].status='unavailable';assert.throws(()=>qualifyMultiRoiHandoff(packet,state),/核对/);
});
test('an unchanged dirty or unresolved active view cannot use a clean source as permission to continue',()=>{
 for(const patch of [{edit_state:{dirty:true,gesture_active:false,draft_revision:8}},{last_operation:{state:'submitted',request_id:'keep-original'}},{pending_result:{object_id:id(8)}}]){
  const {state,packet}=fixture();Object.assign(state,patch);assert.throws(()=>qualifyMultiRoiHandoff(packet,state),/核对/);
 }
});
test('ResearchWorkspace allows a fresh source handoff from FFT while refusing an unverified or stale packet',()=>{
 const nodes=new Map();class Element{constructor(){this.children=[];this.textContent='';this.value='';}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}querySelectorAll(){return [];}showModal(){this.open=true;}}
 const doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()},ui=new ResearchWorkspace({document:doc,onSave(){},onSelect(){},onNavigate(){},onError(){},onDraftChange(){}}),{state,packet}=fixture();
 ui.render(state);assert.equal(nodes.get('agent-continue').disabled,false);assert.throws(()=>ui.showHandoff(state),/先读取/);assert.notEqual(nodes.get('agent-handoff-dialog')?.open,true);
 ui.showHandoff(state,packet);assert.equal(nodes.get('agent-handoff-dialog').open,true);assert.match(nodes.get('agent-prompt').value,/ROI 3/);packet.draft_revision--;assert.throws(()=>ui.showHandoff(state,packet),/版本/);
});
