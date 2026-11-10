// Pure contract/presentation checks. Not a provider, GUI or AI qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readStemStudyInput,stemStudyMissingConditions,stemStatisticsArguments,stemDiscoveryArguments,stemReviewArguments,stemReviewPresentation,stemProfileCall,stemLinkedReviewCall} from '../lib/panel_stem_continuation.mjs';
const A='a'.repeat(32),F='f'.repeat(32),D='d'.repeat(32),S='1'.repeat(32),C='c'.repeat(32),R='2'.repeat(32),P='3'.repeat(32),OLD='4'.repeat(32);
const input=()=>({object_id:A,frame_object_id:F,shape_yx:[64,64],target_rect:[20,20,25,25],reference_rects:[[4,4,9,9],[40,40,45,45]],reference_source_text:'两处同尺寸人工参考，等价性未经确认',expected_position_xy:[22.25,22.5],position_source_text:'研究者指定，不吸附27,22处亮峰',question:'该原预期点的原数组值和全部参考有何差异？',modality:'haadf',signal_kind:'stored_scalar',signal_source_text:'公开合成标量，非独立Poisson计数'});
const records=()=>({discovery:{kind:'discovery',object_id:D,source_dependency:{selected:{object_id:A},science:{frame_object_id:F,shape_yx:[64,64]}},candidates:[{candidate_id:C,rect:[20,20,25,25]}]},statistics:{kind:'statistics',object_id:S,parent_object_id:A,component:'raw',source_rect_xyxy:[20,20,25,25],reference_comparison:{reference_rects:[[4,4,9,9],[40,40,45,45]],source_text:input().reference_source_text}}});
function review(status='tool_proposed',direction='below_or_equal_to_all_references'){
 const source={frame_object_id:F,array_sha256:'e'.repeat(64),dtype:'float32',shape_yx:[64,64]},point=[22.25,22.5];
 return {kind:'discovery_review',state:'completed',object_id:R,request_id:'review-original',source_dependency:{science:source},evidence_refs:[{object_id:S},{object_id:OLD}],physical_conclusion:null,
 site_observation:{context:{expected_position_xy:point,modality:'haadf',signal_kind:'stored_scalar'},readout_rect_xyxy:[20,20,25,25],position_status:'expected_not_localized',profile_ids:[OLD],profile_coverage:{status:'not_verified'},raw_observation:{target_mean:4,references:[{reference_index:0,rect:[4,4,9,9],mean:10,target_minus_reference:-6},{reference_index:1,rect:[40,40,45,45],mean:10,target_minus_reference:-6}],reference_source_text:'all refs',reference_mean_median:10,target_minus_reference_median:-6},comparison:{direction},limitations:['Not localization or physical classification']},
 site_continuation:{version:2,status,reason:'Existing bounded raw profile',source_review_id:R,source_review_request_id:'review-original',source_science:source,expected_position_xy:point,action:{tool:'image_profile',arguments:{object_id:A,points:[[20.25,22.5],[24.25,22.5]],line_width:1,interpolation:'nearest',sample_count:5,request_id:'profile-original'}},after_success:{tool:'image_discovery_review',require_result_kind:'profile',require_result_request_id:'profile-original',arguments:{object_id:D,candidate_id:C,evidence_ids:[S,OLD],site_context:{expected_position_xy:point,modality:'haadf',signal_kind:'stored_scalar'},previous_review_id:R,request_id:'linked-original'}}}};
}
const profile=()=>({state:'completed',kind:'profile',object_id:P,request_id:'profile-original',parent_object_id:A,component:'raw',points:[[20.25,22.5],[24.25,22.5]],sampling:{line_width:1,interpolation:'nearest',sample_count:5},scientific_grid_identity:{source_grid_object_id:F,array_sha256:'e'.repeat(64),dtype:'float32',shape_yx:[64,64]}});
test('source point and all references retain full precision and caller order without aliasing',()=>{
 const a=input(),before=structuredClone(a),r=readStemStudyInput(a);assert.deepEqual(r,a);assert.deepEqual(stemStatisticsArguments(a,'statistics-original').reference_comparison.reference_rects,a.reference_rects);r.expected_position_xy[0]=27;r.reference_rects[0][0]=0;assert.deepEqual(a,before);assert.equal(readStemStudyInput(a).expected_position_xy[0],22.25);
});
test('reject missing, duplicate, unequal, outside references and moved/outside expected position',()=>{
 for(const change of [{reference_rects:[]},{reference_rects:Array(9).fill([4,4,9,9])},{reference_rects:[[20,20,25,25]]},{reference_rects:[[4,4,9,9],[4,4,9,9]]},{reference_rects:[[4,4,8,9]]},{reference_rects:[[60,60,65,65]]},{expected_position_xy:[27,22]},{expected_position_xy:[true,22]},{target_rect:[20.1,20,25,25]},{reference_source_text:''},{object_id:'latest'}])assert.throws(()=>readStemStudyInput({...input(),...change}));
});
test('all eight references are retained, with no silent truncation or sorting',()=>{
 const a=input();a.reference_rects=Array.from({length:8},(_,i)=>[i*6,0,i*6+5,5]);assert.deepEqual(stemStatisticsArguments(a,'all-eight').reference_comparison.reference_rects,a.reference_rects);
});
test('unknown conditions stay explicit and measurable; no inference from stored scalar',()=>{
 const a={...input(),modality:'unknown',signal_kind:'unknown',signal_source_text:'研究者尚未提供探测和处理信息'};assert.equal(stemStudyMissingConditions(a).length,2);assert.equal(readStemStudyInput(a).modality,'unknown');assert.equal(stemStatisticsArguments(a,'unknown-statistics').component,'raw');assert.equal(stemStudyMissingConditions(input()).length,0);assert.ok(stemStudyMissingConditions({...a,position_source_text:''}).some(v=>v.includes('预期位置')));
});
test('manual discovery includes supplied target/question and identifies researcher selection',()=>{
 const a=input(),r=stemDiscoveryArguments(a,'manual-original');assert.deepEqual(r,{object_id:A,entry:'manual',selection_origin:'researcher',regions:[{rect:a.target_rect,reason:a.question}],request_id:'manual-original'});assert.equal(r.expected_position_xy,undefined);
});
test('review binds original point, complete evidence and exact source without numerical recomputation',()=>{
 const a=input(),{discovery,statistics}=records(),r=stemReviewArguments(a,discovery,statistics,'site-original',[OLD],R);assert.deepEqual(r.evidence_ids,[S,OLD]);assert.deepEqual(r.site_context.expected_position_xy,[22.25,22.5]);assert.equal(r.site_context.signal_kind,'stored_scalar');assert.equal(r.previous_review_id,R);assert.equal(r.include_site_continuation,true);assert.deepEqual(r.site_context.statistics_id,S);
});
test('review refuses changed source, missing reference or source text, duplicated/lost identity',()=>{
 const {discovery,statistics}=records();
 for(const edit of [x=>x.discovery.source_dependency.science.frame_object_id=C,x=>x.discovery.candidates.push(x.discovery.candidates[0]),x=>x.statistics.reference_comparison.reference_rects.pop(),x=>x.statistics.reference_comparison.source_text='new explanation',x=>x.statistics.parent_object_id=F,x=>x.statistics.component='amplitude']){const x=structuredClone({discovery,statistics});edit(x);assert.throws(()=>stemReviewArguments(input(),x.discovery,x.statistics,'review'));}
 assert.throws(()=>stemReviewArguments(input(),discovery,statistics,'review',[S]));assert.throws(()=>stemReviewArguments(input(),discovery,statistics,'review',Array.from({length:8},(_,i)=>i.toString(16).repeat(32))));
});
test('presentation preserves every raw reference even when a median hides sign conflict',()=>{
 const r=review('needs_reference_review','references_straddle_target');r.site_observation.raw_observation.target_mean=5;r.site_observation.raw_observation.reference_mean_median=5;r.site_observation.raw_observation.target_minus_reference_median=0;r.site_observation.raw_observation.references[0].mean=2;r.site_observation.raw_observation.references[0].target_minus_reference=3;r.site_observation.raw_observation.references[1].mean=8;r.site_observation.raw_observation.references[1].target_minus_reference=-3;const before=structuredClone(r),p=stemReviewPresentation(r);assert.equal(p.reference_conflict,true);assert.deepEqual(p.references.map(v=>v.target_minus_reference),[3,-3]);assert.equal(p.target_minus_reference_median,0);assert.equal(p.continuation_status,'needs_reference_review');assert.equal(p.physical_conclusion,null);p.references.pop();assert.deepEqual(r,before);assert.throws(()=>stemProfileCall(r));
});
test('profile uses exact saved original request and unchanged source point; no new ID or auto call',()=>{
 const r=review(),before=structuredClone(r),call=stemProfileCall(r);assert.equal(call.arguments.request_id,'profile-original');assert.deepEqual(call.arguments.points,[[20.25,22.5],[24.25,22.5]]);call.arguments.points[0][0]=99;assert.deepEqual(r,before);
 for(const state of ['needs_information','needs_reference_review','stop_at_observation','needs_supported_profile'])assert.throws(()=>stemProfileCall(review(state)));
 const old=review();old.site_continuation.version=1;assert.throws(()=>stemProfileCall(old));const moved=review();moved.site_continuation.expected_position_xy=[27,22];assert.throws(()=>stemProfileCall(moved));const changedContext=review();changedContext.site_continuation.after_success.arguments.site_context.modality='unknown';assert.throws(()=>stemProfileCall(changedContext));
});
test('completed exact profile appends only itself, preserving old profile, references and linked identity',()=>{
 const r=review(),p=profile(),before=structuredClone([r,p]),call=stemLinkedReviewCall(r,p);assert.equal(call.tool,'image_discovery_review');assert.deepEqual(call.arguments.evidence_ids,[S,OLD,P]);assert.equal(call.arguments.request_id,'linked-original');assert.equal(call.arguments.previous_review_id,R);assert.deepEqual(call.arguments.site_context.expected_position_xy,[22.25,22.5]);assert.deepEqual([r,p],before);
});
test('unknown/failed/wrong profile receipts block without replay or evidence substitution',()=>{
 for(const edit of [p=>p.state='unknown',p=>p.state='failed',p=>p.request_id='replacement',p=>p.kind='statistics',p=>p.parent_object_id=F,p=>p.component='power',p=>p.points[0][0]+=1,p=>p.sampling.sample_count=7,p=>p.scientific_grid_identity.array_sha256='b'.repeat(64),p=>p.scientific_grid_identity.source_grid_object_id=A]){const p=profile();edit(p);assert.throws(()=>stemLinkedReviewCall(review(),p));}
 for(const edit of [r=>r.site_continuation.after_success.arguments.evidence_ids.pop(),r=>r.site_continuation.after_success.arguments.evidence_ids.reverse(),r=>r.evidence_refs.push({object_id:P})]){const r=review();edit(r);assert.throws(()=>stemLinkedReviewCall(r,profile()));}
});
