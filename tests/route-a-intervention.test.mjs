// Protocol-controller unit contracts only. No browser or person is simulated by DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertInterventionGate,interventionAnchor,redactInterventionLog} from '../tools/qualify_route_a_intervention.mjs';

const P='a'.repeat(32),O='b'.repeat(32);
const current=()=>({panel_id:P,view:{panel_id:P,object:{object_id:O},pending_result:null,
 edit_state:{draft_revision:0,dirty:false,gesture_active:false}},roi_handoff:{draft_state:{requires_user_commit:false},interaction_gate:{status:'ready'}}});

test('explicit clean Panel identity is required; stale, pending, dirty and unknown drafts stop',()=>{
 const value=current(),before=structuredClone(value);assert.equal(assertInterventionGate(value,P,O),value.view);assert.deepEqual(value,before);
 for(const mutate of [v=>v.panel_id='c'.repeat(32),v=>v.view.object.object_id='c'.repeat(32),
  v=>v.view.edit_state.dirty=true,v=>v.view.edit_state.gesture_active=true,
  v=>v.view.pending_result={object_id:'c'.repeat(32)},v=>delete v.view.pending_result,
  v=>v.roi_handoff.interaction_gate.status='blocked',v=>delete v.roi_handoff.interaction_gate,
  v=>v.roi_handoff.draft_state.requires_user_commit=true,v=>v.view.edit_state.draft_revision=-1]){
  const v=current();mutate(v);assert.throws(()=>assertInterventionGate(v,P,O));
 }
});

test('edit delta changes only the actual endpoint in its saved coordinate system',()=>{
 const point={kind:'point',anchor:{coordinate_space:'frequency_cycles_per_pixel',coordinates:[.1,.05]}},before=structuredClone(point);
 assert.deepEqual(interventionAnchor(point,.002,-.001),[.10200000000000001,.049]);assert.deepEqual(point,before);
 const arrow={kind:'arrow',anchor:{coordinate_space:'frequency_cycles_per_pixel',coordinates:[0,0,.1,.05]}};
 assert.deepEqual(interventionAnchor(arrow,.01,0),[0,0,.11,.05]);
 assert.throws(()=>interventionAnchor(point,0,0));assert.throws(()=>interventionAnchor(point,NaN,1));
 assert.throws(()=>interventionAnchor({...point,kind:'rectangle'},1,1));
 assert.throws(()=>interventionAnchor({kind:'point',anchor:{coordinate_space:'rendered_image_pixels',coordinates:[1,2]}},1,1));
});

test('saved protocol logs remove capabilities and Panel URL fragments recursively',()=>{
 const raw={panel_url:'http://127.0.0.1:1234/#secret',view:{token:'secret',evidence_token:'more'},
  nested:[{owner_nonce:'nonce',text:'Open http://127.0.0.1:1234/#longsecret to inspect'}],object_id:O};
 const before=structuredClone(raw),out=redactInterventionLog(raw),text=JSON.stringify(out);
 assert.doesNotMatch(text,/longsecret|#secret|"secret"|"more"|"nonce"/);assert.equal(out.object_id,O);assert.deepEqual(raw,before);
});
