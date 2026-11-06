// Actual presentation module with small DOM port; separate from browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ResearchWorkspace,agentContinuationText,crystalStatusLabel,crystalCurrentnessLabel} from '../ui/image-panel/research-workspace.mjs';
import {roiObservationModel} from '../ui/image-panel/roi-observations.mjs';
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),P='d'.repeat(32),E='e'.repeat(32);
const mark=(id,x)=>({annotation_id:id,kind:'rectangle',text:id,note:`Why ${id}`,status:'hypothesized',anchor:{source_object_id:A,coordinate_space:'source_pixels',coordinates:[x,0,x+16,16]}});
function state(){return {panel_id:P,object:{object_id:B,annotations:[mark('ROI 1',0),mark('ROI 2',16)],panels:[{domain:'spatial_pixels',source_object_id:A,source_rect_xyxy:[0,0,32,16],image_rect_xyxy:[0,0,320,160]}],xy_calibration:{calibration_id:C,revision:1,status:'active',coordinate_domain:'real_space',source:'user_statement_not_independently_verified',xy_scale:{x:.02,y:-.03,unit:'nm'}}},frame_identity:{frame_object_id:A,frame_index:0},source_identity:{filename:'public.tiff'},edit_state:{dirty:false,gesture_active:false},selection:null};}
class Element{constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.disabled=false;this.hidden=false;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}querySelectorAll(selector){return this.children.flatMap(n=>[...(n.tagName===selector.toUpperCase()?[n]:[]),...n.querySelectorAll(selector)]);}showModal(){this.open=true;}set innerHTML(_){throw Error('Untrusted text must never become HTML');}}
function setup(){const nodes=new Map(),actions=[];const doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:tag=>new Element(tag)};const ui=new ResearchWorkspace({document:doc,onSave:reason=>actions.push(['save',reason]),onSelect:id=>actions.push(['select',id]),onNavigate:id=>actions.push(['navigate',id]),onError:error=>actions.push(['error',error]),onDraftChange:()=>actions.push(['draft'])});return {ui,nodes,actions};}
const text=n=>[n.textContent,...n.children.map(text)].join(' ');

test('FFT notice describes verified return relation without promising compare or immediate operation',()=>{
 const {ui,nodes,actions}=setup(),s=state();s.object.annotations=[];s.object.panels=[{domain:'frequency',source_object_id:E,image_rect_xyxy:[0,0,32,32],fft_shape_yx:[32,32],fft_rect_xyxy:[0,0,32,32]}];s.spatial_return={version:1,status:'ready',view_object_id:B};
 // A valid active FFT can have a separately verified return but no optional
 // window comparison reference, including after restoring legacy metadata.
 s.window_collection={schema_version:1,frame_object_id:A,active_window_id:C,windows:[{window_id:C,object_id:s.object.object_id,role:'fft'}]};
 assert.equal(s.window_collection.windows[0].source_reference,undefined);
 for(const [dirty,options] of [[false,{}],[true,{}],[false,{busy:true}],[false,{gesture:true}]]){
  s.edit_state.dirty=dirty;const original=structuredClone(s);ui.render(s,options);const notice=nodes.get('roi-current').textContent+' '+text(nodes.get('roi-observations'));
  assert.match(notice,/当前编辑域：FFT/);assert.match(notice,/空间 ROI 属于来源原图/);assert.match(notice,/来源返回关系已核对/);assert.match(notice,/按钮可用时/);assert.match(notice,/不代表当前操作可点击/);assert.doesNotMatch(notice,/原图与 FFT 对照/);assert.deepEqual(s,original);assert.deepEqual(actions,[]);
 }
 s.edit_state.dirty=false;
 for(const relation of [{status:'unavailable'},{status:'unknown'},undefined]){
  s.spatial_return=relation;ui.render(s);const notice=text(nodes.get('roi-observations'));assert.match(notice,/当前没有已核对的来源返回入口/);assert.doesNotMatch(notice,/来源返回关系已核对|按钮可用时|原图与 FFT 对照/);
 }
 const spatial=state();spatial.object.annotations=[];ui.render(spatial);assert.doesNotMatch(nodes.get('roi-current').textContent,/FFT/);assert.match(text(nodes.get('roi-observations')),/暂无已记录观察/);
});
test('continuation includes only saved exact observations, not current draft selection or a pretend wake',()=>{
 const s=state();s.selection={kind:'rectangle',source_object_id:A,coordinate_space:'source_pixels',coordinates:[1,1,8,8],panel:s.object.panels[0]};const model=roiObservationModel(s),prompt=agentContinuationText(model,P);
 assert.match(prompt,/Why ROI 1/);assert.match(prompt,/Why ROI 2/);assert.doesNotMatch(prompt,/1, 1, 8, 8/);assert.match(prompt,/不会自动唤醒/);assert.match(prompt,new RegExp(P));assert.doesNotMatch(prompt,/https?:/);
 s.edit_state.dirty=true;assert.throws(()=>agentContinuationText(roiObservationModel(s),P),/草稿/);
});
test('unknown, incompatible and insufficient states are not renamed a confirmed phase',()=>{
 assert.match(crystalStatusLabel('insufficient_evidence'),/证据不足/);assert.match(crystalStatusLabel('incompatible'),/不相容/);assert.equal(crystalStatusLabel('invented'),'未判');assert.match(crystalCurrentnessLabel('unvalidated_snapshot'),/待工具复核/);
});
test('ROI labels/reasons remain text, unknown scale remains unknown, selection never recomputes',async()=>{
 const {ui,nodes,actions}=setup(),s=state();s.object.annotations[0].note='<img src=x onerror=bad>';delete s.object.xy_calibration;const before=structuredClone(s);ui.render(s);
 assert.match(text(nodes.get('roi-observations')),/<img src=x onerror=bad>/);assert.match(nodes.get('research-calibration').textContent,/未知/);assert.doesNotMatch(nodes.get('research-calibration').textContent,/nm/);
 await nodes.get('roi-observations').children[0].children[0].onclick();assert.deepEqual(actions,[['select','ROI 1']]);assert.deepEqual(s,before);
});
test('typed unsaved reason survives a new rendering and is not handed to Agent',()=>{
 const {ui,nodes,actions}=setup();ui.render(state());nodes.get('roi-reason').value='not committed yet';nodes.get('roi-reason').oninput();ui.render(state());assert.equal(nodes.get('roi-reason').value,'not committed yet');assert.equal(nodes.get('agent-continue').disabled,true);assert.throws(()=>ui.showHandoff(state()),/应用/);assert.deepEqual(actions,[['draft']]);
});
test('comparison retains candidates/unmatched/unknown counts and navigation uses saved refs only',async()=>{
 const {ui,nodes,actions}=setup(),s=state();s.crystal_evidence={presentation_request_id:'attach-1',currentness:'needs_review',currentness_reasons:['different_calibration_revision'],payload:{object_id:E,status:'insufficient_evidence',source:{observation_view_object_id:B},domains:[{current_image_object_id:A}],candidates:[{label:'<candidate>',status:'insufficient_evidence',sides:[{matched_count:null,unmatched_experimental_count:3,unmatched_simulated_count:4,ambiguity_count:1}]}]}};
 const before=structuredClone(s);ui.render(s);const card=nodes.get('crystal-evidence');assert.match(text(card),/待更新/);assert.match(text(card),/匹配 未知/);assert.match(text(card),/实验未匹配 3/);assert.match(text(card),/歧义检查记录 1/);assert.doesNotMatch(text(card),/歧义 1/);assert.match(text(card),/<candidate>/);assert.match(text(card),/不是唯一物相/);await card.querySelectorAll('button')[0].onclick();assert.deepEqual(actions,[['navigate',B]]);assert.deepEqual(s,before);
 ui.render(s,{busy:true});assert.ok(card.querySelectorAll('button').every(b=>b.disabled));
});

test('six unambiguous checks are never labeled as six actual ambiguities',()=>{
 const {ui,nodes}=setup(),s=state();s.crystal_evidence={currentness:'current',payload:{object_id:E,status:'compatible',candidates:[{label:'candidate',status:'compatible',sides:[{matched_count:6,unmatched_experimental_count:0,unmatched_simulated_count:2,ambiguity_count:6,ambiguity:Array.from({length:6},()=>({ambiguous_within_tolerance:false}))}]}]}};
 const before=structuredClone(s);ui.render(s);assert.match(text(nodes.get('crystal-evidence')),/歧义检查记录 6/);assert.doesNotMatch(text(nodes.get('crystal-evidence')),/；歧义 6/);assert.deepEqual(s,before);
});

test('FFT continuation retains original observation references and latest measurement without projecting old ROI',()=>{
 const {ui,nodes}=setup(),s=state();s.object.annotations=[];s.object.panels=[{domain:'frequency',source_object_id:E,image_rect_xyxy:[0,0,96,96],fft_shape_yx:[96,96],fft_rect_xyxy:[0,0,96,96]}];s.crystal_evidence={currentness:'needs_review',latest_measurement_refs:[{object_id:C,request_id:'original-correction',source_object_id:E}],payload:{object_id:E,source:{observation_view_object_id:B},observations:[{annotation_id:'ROI 1',text:'ROI 1',reason:'original operator reason',rect_xyxy:[0,0,16,16]}],domains:[],candidates:[],status:'insufficient_evidence'}};
 ui.render(s);assert.equal(nodes.get('agent-continue').disabled,false);assert.match(nodes.get('research-count').textContent,/另一保存视图/);assert.match(text(nodes.get('roi-observations')),/不会投到当前 FFT/);const prompt=agentContinuationText(roiObservationModel(s),P,s.crystal_evidence);assert.match(prompt,/不是当前图上的新 ROI/);assert.match(prompt,/original-correction/);assert.match(prompt,/待更新/);
 s.edit_state.dirty=true;assert.throws(()=>agentContinuationText(roiObservationModel(s),P,s.crystal_evidence),/草稿/);
});

test('pending observation save locks only its text input so a late acknowledgement cannot discard newer typing',()=>{
 const {ui,nodes}=setup(),s=state();ui.render(s);nodes.get('roi-reason').value='Submitted reason';nodes.get('roi-reason').oninput();
 ui.render(s,{busy:true});assert.equal(nodes.get('roi-reason').disabled,true);assert.equal(nodes.get('roi-reason').value,'Submitted reason');assert.equal(nodes.get('save-observation').disabled,true);
 ui.render(s);assert.equal(nodes.get('roi-reason').disabled,false);assert.equal(nodes.get('roi-reason').value,'Submitted reason');
 ui.render(s,{gesture:true});assert.equal(nodes.get('roi-reason').disabled,true);
});

test('shared research workspace renders saved GPA evidence and clears it on non-GPA navigation',()=>{
 const {ui,nodes,actions}=setup(),s=state();s.object.kind='gpa_view';s.object.material_strain_verified=false;
 s.object.interpretation_status='hypothesized';s.object.evidence_assessment={semantics_version:1,
  numerical_field_status:'computed_conditional',material_strain_status:'insufficient_evidence',material_strain_validated:null,
  reason_codes:['band_limited_field_cannot_exclude_out_of_band_deformation'],
  spatial_transfer:{model:'small phase, isolated carrier, 1D interior derivative',frequency_unit:'cycles/pixel',
   aperture_sigma_cycles_per_pixel:[.012,.012],aperture_cutoff_cycles_per_pixel:[.036,.036],
   nominal_untruncated_gaussian_real_space_fwhm_pixels:[31,31],response_samples:[{modulation_period_pixels:32,
    phase_gain_per_reflection:[.03,.03],central_difference_gain_1d:.99,first_order_strain_gain_1d_per_reflection:[.0297,.0297]}],
   scope:'analytic approximation, not measured resolution'}};
 const before=structuredClone(s);ui.render(s);
 assert.equal(nodes.get('gpa-evidence').hidden,false);assert.match(text(nodes.get('gpa-evidence')),/材料应变未验证/);
 assert.match(text(nodes.get('gpa-evidence')),/带宽之外/);assert.deepEqual(s,before);assert.deepEqual(actions,[]);
 const detail=nodes.get('gpa-evidence').children.find(n=>n.tagName==='DETAILS');detail.open=true;
 ui.render(structuredClone(s));assert.equal(nodes.get('gpa-evidence').children.find(n=>n.tagName==='DETAILS'),detail);
 assert.equal(detail.open,true);
 ui.render(state());assert.equal(nodes.get('gpa-evidence').hidden,true);assert.equal(nodes.get('gpa-evidence').children.length,0);
});

test('old last operation semantics cannot attach to the current scientific object',()=>{
 const {ui,nodes}=setup(),s=state();s.last_operation={kind:'measure',object_id:E,result_semantics:{version:99,note:'OLD_MEASURE_ONLY'}};
 ui.render(s);assert.equal(nodes.get('result-semantics').hidden,true);assert.doesNotMatch(text(nodes.get('result-semantics')),/OLD_MEASURE_ONLY/);
 s.object.kind='fft';ui.render(s);assert.match(text(nodes.get('result-semantics')),/未记录/);assert.doesNotMatch(text(nodes.get('result-semantics')),/OLD_MEASURE_ONLY/);
});


for (const [name, patch, message] of [
 ['queued Agent result', {pending_result:{object_id:E,request_id:'already-computed'}}, /待接纳/],
 ['draft persistence pending', {draft_persistence:{pending:true,error:null}}, /保存/],
 ['draft persistence failed', {draft_persistence:{pending:false,error:'private-disk-error'}}, /保存/],
 ['scientific outcome unresolved', {last_operation:{state:'submitted',request_id:'original-write'}}, /原请求/],
 ['missing draft state', {edit_state:null}, /状态/],
]) {
 test(`handoff blocks ${name} without accepting results or replaying a scientific request`,()=>{
  const {ui,nodes,actions}=setup(),s={...state(),...patch},before=structuredClone(s);
  ui.render(s);
  assert.equal(nodes.get('agent-continue').disabled,true);
  assert.match(nodes.get('observation-draft-state').textContent,message);
  assert.throws(()=>agentContinuationText(roiObservationModel(s),P),message);
  assert.throws(()=>ui.showHandoff(s),message);
  assert.deepEqual(actions,[]);assert.deepEqual(s,before);
  assert.doesNotMatch(nodes.get('observation-draft-state').textContent,/private-disk-error/);
 });
}

test('resolved handoff re-enables the existing button, without inventing model wake or permission',()=>{
 const {ui,nodes}=setup(),s=state();s.pending_result={object_id:E,request_id:'saved-result'};
 ui.render(s);assert.equal(nodes.get('agent-continue').disabled,true);
 s.pending_result=null;s.draft_persistence={pending:false,error:null};
 ui.render(s);assert.equal(nodes.get('agent-continue').disabled,false);
 assert.match(agentContinuationText(roiObservationModel(s),P),/image_panel_current/);
});

test('rejected over-budget observation keeps exact Unicode draft and surfaces its length',async()=>{
 const {ui,nodes,actions}=setup(),s=state();ui.render(s);
 const {checkObservationNote}=await import('../ui/image-panel/observation-contract.mjs');
 ui.options.onSave=reason=>checkObservationNote(reason,'note');
 const long='😀'.repeat(501);nodes.get('roi-reason').value=long;nodes.get('roi-reason').oninput();
 await nodes.get('save-observation').onclick();ui.render(s);
 assert.equal(nodes.get('roi-reason').value,long);assert.equal(ui.reasonDirty,true);
 assert.ok(actions.some(([kind,message])=>kind==='error'&&/note: actual_length=1002; limit=1000 UTF-16.*no truncation/.test(message)));
 assert.equal(nodes.get('agent-continue').disabled,true);
});


test('raw observation whitespace counts toward write budget and is never silently trimmed to pass',async()=>{
 const {ui,nodes,actions}=setup(),s=state();ui.render(s);
 const {checkObservationNote}=await import('../ui/image-panel/observation-contract.mjs');ui.options.onSave=reason=>checkObservationNote(reason,'note');
 const long='x'.repeat(1000)+' ';nodes.get('roi-reason').value=long;nodes.get('roi-reason').oninput();await nodes.get('save-observation').onclick();
 assert.equal(nodes.get('roi-reason').value,long);assert.ok(actions.some(([kind,message])=>kind==='error'&&/actual_length=1001/.test(message)));assert.equal(ui.reasonDirty,true);
});

function selectReason(s,id='ROI 1'){const saved=s.object.annotations.find(mark=>mark.annotation_id===id);s.selection={kind:'rectangle',...structuredClone(saved.anchor),panel:structuredClone(s.object.panels[0])};return s;}
test('reason baseline: undoing temporary text to the exact saved empty reason clears only the reason draft',()=>{
 const {ui,nodes,actions}=setup(),s=selectReason(state());s.object.annotations[0].note='';ui.render(s);const field=nodes.get('roi-reason');field.value='temporary';field.oninput();assert.equal(ui.reasonDirty,true);field.value='';field.oninput();assert.equal(ui.reasonDirty,false);ui.render(s);assert.equal(field.value,'');assert.deepEqual(actions,[['draft'],['draft']]);
});
test('reason baseline: saved whitespace and Unicode are exact values, never trimmed aliases',()=>{
 const {ui,nodes}=setup(),s=selectReason(state());const saved='  观察 😀\n';s.object.annotations[0].note=saved;ui.render(s);const field=nodes.get('roi-reason');assert.equal(field.value,saved);field.value=saved.trim();field.oninput();assert.equal(ui.reasonDirty,true);field.value=saved;field.oninput();assert.equal(ui.reasonDirty,false);
});
test('reason baseline: a dirty draft cannot become clean by matching another ROI or a late saved version',()=>{
 const {ui,nodes}=setup(),a=selectReason(state()),b=selectReason(state(),'ROI 2');ui.render(a);const field=nodes.get('roi-reason');field.value='new draft';field.oninput();ui.render(b);assert.equal(field.value,'new draft');field.value=b.object.annotations[1].note;field.oninput();assert.equal(ui.reasonDirty,true,'another ROI has a different baseline');const late=structuredClone(a);late.object.object_id=E;late.object.annotations[0].note=field.value;ui.render(late,{observationSavePhase:'verifying'});assert.equal(ui.reasonDirty,true);assert.equal(field.value,b.object.annotations[1].note);assert.ok(ui.reasonDirty);
});
test('reason baseline: clean selection changes load that ROI saved reason and keep independent baselines',()=>{
 const {ui,nodes}=setup(),a=selectReason(state()),b=selectReason(state(),'ROI 2');ui.render(a);assert.equal(nodes.get('roi-reason').value,'Why ROI 1');ui.render(b);assert.equal(nodes.get('roi-reason').value,'Why ROI 2');nodes.get('roi-reason').value='Why ROI 1';nodes.get('roi-reason').oninput();assert.equal(ui.reasonDirty,true);nodes.get('roi-reason').value='Why ROI 2';nodes.get('roi-reason').oninput();assert.equal(ui.reasonDirty,false);
});
test('reason baseline: legacy dirty flags equal to the exact saved note are reconciled during render and hydration',()=>{
 const {ui,nodes}=setup(),s=selectReason(state());s.object.annotations[0].note='';ui.render(s);ui.reasonDirty=true;ui.render(s);assert.equal(ui.reasonDirty,false);assert.equal(nodes.get('roi-reason').value,'');ui.restoreReason(s,'');assert.equal(ui.reasonDirty,false);ui.restoreReason(s,'actual unsaved text');assert.equal(ui.reasonDirty,true);assert.equal(nodes.get('roi-reason').value,'actual unsaved text');
});
