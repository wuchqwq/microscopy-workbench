import test from 'node:test';
import assert from 'node:assert/strict';
import {panelStemHandoff} from '../lib/panel_stem_handoff.mjs';
const F='a'.repeat(32),V='b'.repeat(32),panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,64,64],image_rect_xyxy:[0,0,256,256]};
function state(kind='point',coordinates=[22.25,22.5]){return {state_revision:7,object:{object_id:V,panels:[panel],annotations:[
 {kind:'rectangle',annotation_id:'target',status:'hypothesized',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:[20,20,25,25]}},
 {kind:'rectangle',annotation_id:'reference',status:'user_confirmed',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:[4,4,9,9]}}]},
 frame_identity:{frame_object_id:F},selection:{kind,coordinates,source_object_id:F,coordinate_space:'source_pixels',panel},
 edit_state:{dirty:false,gesture_active:false,annotation_edit:null,draft_revision:3}};}
test('source-bound expected coordinate and unassigned reference supports are exact, read-only priors',()=>{
 const s=state(),before=structuredClone(s),h=panelStemHandoff(s);
 assert.equal(h.selection_status,'supplied_expected_position');assert.deepEqual(h.expected_position_proposal.position_xy,[22.25,22.5]);
 assert.equal(h.scientific_input_reference,'roi_handoff.scientific_input');assert.equal(h.source_view_object_id,V);assert.equal(h.draft_revision,3);
 assert.equal(h.region_catalog_reference,'roi_handoff.saved_rectangles');assert.equal(h.regions,undefined,'Do not duplicate up to100 ROI records in the AI payload');assert.match(h.region_roles,/unassigned/);
 assert.equal(h.s2.execution,'not_dispatched');assert.deepEqual(s,before);
});
test('line retains both supplied endpoints without a claim of dumbbell resolution',()=>{
 const h=panelStemHandoff(state('line',[20.25,22.5,24.25,22.5]));assert.deepEqual(h.profile_proposal.points,[[20.25,22.5],[24.25,22.5]]);
 assert.equal(h.expected_position_proposal,null);assert.match(h.s2.limits,/dumbbell/);
});
test('foreign, reciprocal, ambiguous, out-of-centre and pending selections cannot become executable priors',()=>{
 for(const change of [s=>s.selection.source_object_id=V,s=>s.selection.coordinate_space='frequency_cycles_per_pixel',
  s=>s.object.panels.push({...panel}),s=>s.selection.coordinates=[63.25,22],s=>s.edit_state.dirty=true,
  s=>s.edit_state.gesture_active=true,s=>s.pending_result={object_id:V},s=>s.edit_state.annotation_edit={},s=>delete s.frame_identity]){
  const s=state();change(s);const h=panelStemHandoff(s);assert.equal(h.expected_position_proposal,null);assert.equal(h.profile_proposal,null);
 }
 const s=state();delete s.edit_state.gesture_active;assert.equal(panelStemHandoff(s).expected_position_proposal,null);
});
