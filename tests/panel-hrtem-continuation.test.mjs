// Pure integration adapter checks, not a numerical or native GUI qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hrtemComparisonReadiness,hrtemComparisonParameters,hrtemComparisonContext,hrtemComparisonSummary} from '../lib/panel_hrtem_continuation.mjs';
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),D='d'.repeat(32);
const seed=()=>({object_id:A,request_id:'saved-bands',kind:'gpa',shape_yx:[128,128],parameters:{reference_mode:'fixed_g',g_vectors:[[.125,0],[0,.125]],reference_text:'Explicit synthetic reference',mask_sigma:.025},input_dependency:{source:{object_id:B,request_id:'source',manifest_sha256:'1'.repeat(64)},fft:{object_id:C,request_id:'fft',manifest_sha256:'2'.repeat(64)},source_mapping:{domain:'spatial_pixels',source_object_id:B,source_rect_xyxy:[20,30,148,158],image_rect_xyxy:[0,0,128,128]},xy_calibration:null}});
const input=()=>({seed:seed(),target_rect:[70,50,90,70],reference_rect:[10,50,30,70],reference_text:'Same image explicit reference; equivalence is an assumption'});
test('one saved fixed-g input yields only existing zero-budget comparison parameters with exact references',()=>{
 const original=input(),before=structuredClone(original),p=hrtemComparisonParameters(original);
 assert.deepEqual(original,before);assert.deepEqual(p.object_ids,[A]);assert.deepEqual(p.budget,{method_calls:0,fft_pixels:0,gpa_band_pixels:0,topology_path_samples:0});
 assert.deepEqual(p.information,{goal:'peak_roi_comparison',roi_rect:[70,50,90,70],reference_rect:[10,50,30,70],reference_text:original.reference_text});
 assert.equal(Object.hasOwn(p,'request_id'),false,'shared caller owns original request admission and journal');
 const context=hrtemComparisonContext(original);assert.equal(context.seed_object_id,A);assert.deepEqual(context.input_dependency,original.seed.input_dependency);assert.equal(context.reference.source_text,original.reference_text);
 context.target.rect[0]=0;context.input_dependency.fft.object_id=D;assert.deepEqual(original,before);
});
test('explicit source-image rectangles translate through exact saved frame mapping; display coordinates are not accepted',()=>{
 const original={...input(),coordinate_space:'source_pixels',source_object_id:B,target_rect:[90,80,110,100],reference_rect:[30,80,50,100]};
 const p=hrtemComparisonParameters(original);assert.deepEqual(p.information.roi_rect,[70,50,90,70]);assert.deepEqual(p.information.reference_rect,[10,50,30,70]);
 assert.throws(()=>hrtemComparisonParameters({...original,source_object_id:D}),/准确源帧/);
 assert.throws(()=>hrtemComparisonParameters({...original,target_rect:[10,80,40,100]}),/超出/);
 assert.throws(()=>hrtemComparisonParameters({...original,coordinate_space:'display_pixels'}),/不接受显示像素/);
});
test('incomplete, raw, unsupported and fractional selections stop before dispatch rather than inventing a new GPA',()=>{
 for(const change of [s=>s.kind='frame',s=>s.parameters.reference_mode='fit_reference',s=>s.shape_yx=null,s=>s.parameters.g_vectors=[[.125,0]],s=>delete s.input_dependency.fft]){
  const s=seed();change(s);assert.equal(hrtemComparisonReadiness(s).ready,false);assert.throws(()=>hrtemComparisonParameters({...input(),seed:s}));
 }
 for(const target_rect of [[0,0,0,2],[0.2,0,4,5],[0,0,129,10],[-1,0,4,5]])assert.throws(()=>hrtemComparisonParameters({...input(),target_rect}));
 for(const reference_text of ['', ' ', 'x'.repeat(2001),null])assert.throws(()=>hrtemComparisonParameters({...input(),reference_text}),/参考/);
});
const region=(phase=true)=>({pixel_count:400,valid_count:400,invalid_count:0,low_amplitude_count:0,amplitude_status:'observed',status:phase?'observed':'insufficient_evidence',amplitude_weighted_phase_coherence:phase?.99:.1,reason:phase?null:'insufficient_valid_support_or_incoherent_phase'});
const result=()=>({object_id:D,request_id:'comparison-one',kind:'method_plan',root_plan_id:D,seed_object_ids:[A],input_refs:[{object_id:A,request_id:'saved-bands',manifest_sha256:'3'.repeat(64)}],information:{goal:'peak_roi_comparison'},decision:{peak_comparison:{status:'observed',roi_rect:[70,50,90,70],reference_rect:[10,50,30,70],reference_text:'Explicit reference',physical_strain_admitted:false,peaks:[0,1].map(i=>({band_id:A+':band:'+i,band_index:i,g_cycles_per_pixel:i?[0,.125]:[.125,0],regions:{roi_rect:region(),reference_rect:region()},phase_difference_wrapped_rad:.4,amplitude_ratio:1.6000000000000003,status:'observed'}))}}});
test('saved result read retains exact ids, values and reasons while rounding only display strings',()=>{
 const saved=result(),before=structuredClone(saved),summary=hrtemComparisonSummary(saved);assert.equal(summary.available,true);assert.equal(summary.request_id,'comparison-one');assert.deepEqual(summary.input_refs,saved.input_refs);
 assert.equal(summary.bands[0].amplitude_ratio,1.6000000000000003);assert.match(summary.bands[0].text,/幅值比 1.6；/);assert.deepEqual(saved,before);
 summary.exact_report.peaks[0].amplitude_ratio=0;assert.deepEqual(saved,before);
});
test('amplitude-only phase abstention and insufficient support preserve null, counts and exact provider disposition',()=>{
 const saved=result(),r=saved.decision.peak_comparison;r.status='insufficient_evidence';r.peaks[0].status='insufficient_evidence';r.peaks[0].phase_difference_wrapped_rad=null;r.peaks[0].regions.roi_rect=region(false);
 let summary=hrtemComparisonSummary(saved);assert.equal(summary.status,'insufficient_evidence');assert.equal(summary.bands[0].amplitude_ratio,1.6000000000000003);assert.equal(summary.bands[0].phase_difference_wrapped_rad,null);assert.match(summary.bands[0].text,/相位差 不可用/);assert.match(summary.bands[0].text,/incoherent_phase/);
 r.peaks[1].amplitude_ratio=null;r.peaks[1].phase_difference_wrapped_rad=null;r.peaks[1].regions.roi_rect={...region(false),valid_count:2,invalid_count:398};
 summary=hrtemComparisonSummary(saved);assert.equal(summary.bands[1].amplitude_ratio,null);assert.match(summary.bands[1].text,/幅值比 不可用/);assert.match(summary.bands[1].text,/2\/400/);
 assert.equal(hrtemComparisonSummary({kind:'frame',object_id:A}).available,false);
});
