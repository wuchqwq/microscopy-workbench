// Controlled provider/HTTP presentation boundaries, not numerical qualification
// or actual browser acceptance. Existing real MCP smoke covers the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {buildCrystalEvidencePayload,addCrystalInteractionViews,attachCrystalEvidence,crystalEvidenceForState,restoreCrystalEvidenceSnapshot,rememberCrystalScienceEvent} from '../lib/panel_crystal_evidence.mjs';
import {ImagePanelManager,imagePanelEvidenceTool,imagePanelTools} from '../lib/image_panel_mcp.mjs';
import {createImagePanel} from '../tools/image_panel.mjs';
import {createImagePanelModule} from '../lib/tools/image_panel_module.mjs';

const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),D='d'.repeat(32),E='e'.repeat(32),F='f'.repeat(32),P='1'.repeat(32),G='2'.repeat(32),M='3'.repeat(32),N='4'.repeat(32);
const X='6'.repeat(32);
const clone=structuredClone,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const png=Buffer.from('89504e470d0a1a0a00000000','hex');
const dependency={calibration_id:C,revision:1,status:'active',source:'user_statement_not_independently_verified',coordinate_domain:'real_space'};
const scale={...dependency,xy_scale:{x:.025,y:-.03,unit:'nm'}};
const panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,32,16],image_rect_xyxy:[0,0,32,16]};
const marks=[{annotation_id:'roi-a',kind:'rectangle',text:'A',note:'Operator reason A',status:'hypothesized',anchor:{coordinate_space:'source_pixels',source_object_id:F,coordinates:[0,0,16,16]}},{annotation_id:'roi-b',kind:'rectangle',text:'B',note:'Operator reason B',status:'hypothesized',anchor:{coordinate_space:'source_pixels',source_object_id:F,coordinates:[16,0,32,16]}}];
const sourceState=()=>({panel_id:P,object:{object_id:A,kind:'annotate',panels:[clone(panel)],annotations:clone(marks),xy_calibration:clone(scale)},frame_identity:{frame_object_id:F,frame_index:0,source_object_id:E},last_operation:null,edit_state:{dirty:false,gesture_active:false,draft_revision:0}});
const toolResult=(data,pngValue=png.toString('base64'))=>({content:[{type:'text',text:JSON.stringify(data)},...(pngValue?[{type:'image',mimeType:'image/png',data:pngValue}]:[])]});

function fixture(){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-crystal-')),directory=path.join(workspace,'objects',B);mkdirSync(directory,{recursive:true});
 const child={matched:[{measurement_object_id:M,measurement_index:0,hkl:[2,0,0],experiment_original_q_xy_inv_angstrom:[.5,0],simulation_q_xyz_inv_angstrom:[.5,0,0],position_residual_inv_angstrom:0,within_declared_tolerance:true}],unmatched_experimental:[],unmatched_simulated:Array.from({length:101},(_,i)=>({hkl:[i,1,0],q_xyz_inv_angstrom:[i,1,0],simulation_reflection_index:i})),ambiguity:[{measurement_index:0,candidate_count:2,ambiguous_within_tolerance:true,assignment_is_unique_proof:false,candidates:[{hkl:[2,0,0]},{hkl:[-2,0,0]}]}]};
 const details={'finite candidate:0':child,'finite candidate:1':child};const bytes=Buffer.from(JSON.stringify(details));writeFileSync(path.join(directory,'comparisons.json'),bytes);
 const qualifier={source:{status:'hash_bound_candidate',format:'cif',source_sha256:'9'.repeat(64)},sites:{status:'valid_candidate_sites',atom_count:4,elements:['Cu'],basis_chemistry_verified:false},cell:{status:'qualified_reciprocal_geometry',cell_angstrom:[[4,0,0],[0,4,0],[0,0,4]],pbc:[true,true,true],rank:3,condition_number:1,reciprocal_convention:'cycles_per_angstrom_no_2pi'},occupancy:{status:'explicit_full_occupancy',qualified_ordered_model:true},symmetry:{space_group_status:'declared_not_verified',point_group_status:'not_verified',space_group_verified:false,point_group_verified:false},kinematic_simulation:{status:'qualified_saved_kinematic_model',executed_saved_simulation:true,reasons:[],enumeration:{completeness_certified:true}},limits:['No unique phase']};
 const domain=(index,fft,measurement)=>({rect_xyxy:index?[16,0,32,16]:[0,0,16,16],fft_object_id:fft,current_image_object_id:fft,field_object_id:G,measurement_object_ids:[measurement],fft_array_sha256:'8'.repeat(64),evidence_quality_ready:true,evidence_quality_reasons:[],insufficient_reasons:[],physical_observations:[{measurement_object_id:measurement,original_points:[[0,0],[.125,0]],dc_reference_point_index:0,q_xy_inv_angstrom:[.5,0]}],experimental_geometry_binding:{ordered_measurement_geometry:[{points:[[0,0],[.125,0]],dc_reference_point_index:0,q_xy_inv_angstrom:[.5,0]}]}});
 const data={object_id:B,kind:'crystal_evidence',backend:'external-structure-workspace',request_id:'original-comparison',status:'insufficient_evidence',reason:'Several finite projections remain possible',phase_identified:false,twin_law_tested:false,intensity_comparison_performed:false,interpretation_status:'hypothesized',source_binding:{frame_object_id:F,frame_index:0,source_object_id:E,current_spatial_image_object_id:C,source_array_sha256:'7'.repeat(64),shape_yx:[16,32],dtype:'float32',calibration_dependency:clone(dependency),xy_calibration:clone(scale)},domains:[domain(0,D,M),domain(1,E,N)],candidate_pairs:[{label:'finite candidate',status:'compatible',basis:'Explicit finite test model, not experimental truth',independent_validation:'NOT_VALIDATED',interpretation_status:'hypothesized',sides:[{side:0,status:'compatible',comparison_object_id:G,comparison_request_id:'side-a',structure_object_id:E,orientation_object_id:E,simulation_object_id:E},{side:1,status:'compatible',comparison_object_id:G,comparison_request_id:'side-b',structure_object_id:E,orientation_object_id:E,simulation_object_id:E}]}],candidate_qualification:{[E]:{structure_object_id:E,orientation_object_id:E,qualification:qualifier}},registration:{rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'Declared independent frame'},max_residual_inv_angstrom:.005,experimental_kind:'real_space_fft',scientific_limits:['Projected geometry only','No unique phase or twin confirmation'],files_sha256:{'comparisons.json':sha(bytes),'preview.png':sha(png)}};
 return {workspace,data,result:toolResult(data),payload:()=>buildCrystalEvidencePayload(toolResult(data),workspace,B),close:()=>rmSync(workspace,{recursive:true,force:true})};
}

test('qualified bounded projection preserves ambiguity, unmatched totals, signed scale and actual original references',()=>{
 const f=fixture();try{const p=f.payload();assert.equal(p.status,'insufficient_evidence');assert.equal(p.phase_identified,false);assert.deepEqual(p.source.xy_scale,{x:.025,y:-.03,unit:'nm'});assert.equal(p.candidates[0].sides[0].unmatched_simulated_count,101);assert.equal(p.candidates[0].sides[0].unmatched_simulated.length,96);assert.equal(p.candidates[0].sides[0].omitted_unmatched_simulated,5);assert.equal(p.candidates[0].sides[0].ambiguity[0].assignment_is_unique_proof,false);assert.equal(p.candidates[0].sides[0].full_evidence_reference.tool,'structure_info');assert.equal(p.request_id,'original-comparison');assert.equal(p.image_png_sha256,sha(png));}finally{f.close();}
});

test('wrong kind/claim, changed admitted file and mismatched saved PNG refuse instead of presenting qualified evidence',()=>{
 const f=fixture();try{
  for(const patch of [{kind:'simulate'},{phase_identified:true},{object_id:C}])assert.throws(()=>buildCrystalEvidencePayload(toolResult({...f.data,...patch}),f.workspace,B),/Crystal evidence/);
  assert.throws(()=>buildCrystalEvidencePayload(toolResult(f.data,Buffer.concat([png,Buffer.from('x')]).toString('base64')),f.workspace,B),/PNG/);
  writeFileSync(path.join(f.workspace,'objects',B,'comparisons.json'),'{}');assert.throws(()=>f.payload(),/file changed/);
 }finally{f.close();}
});

test('unknown physical calibration and uncompleted children remain insufficient with unknown counts, never fabricated zeros',()=>{
 const f=fixture();try{const data=clone(f.data),bytes=Buffer.from('{}');writeFileSync(path.join(f.workspace,'objects',B,'comparisons.json'),bytes);data.files_sha256['comparisons.json']=sha(bytes);data.source_binding.calibration_dependency=null;data.source_binding.xy_calibration=null;
  for(const d of data.domains){d.physical_ready=false;d.physical_observations=[];d.experimental_geometry_binding=null;d.measurement_object_ids=[];}
  data.candidate_pairs[0].status='insufficient_evidence';for(const side of data.candidate_pairs[0].sides)Object.assign(side,{status:'insufficient_evidence',comparison_object_id:null,comparison_request_id:null,reason:'No sourced physical reciprocal calibration'});
  const p=buildCrystalEvidencePayload(toolResult(data),f.workspace,B);assert.equal(p.source.xy_scale,null);assert.equal(p.candidates[0].sides[0].matched_count,null);assert.equal(p.candidates[0].sides[0].unmatched_simulated_count,null);assert.equal(p.candidates[0].sides[0].computation_status,'not_completed');
  const state=sourceState();delete state.object.xy_calibration;assert.equal(attachCrystalEvidence(p,state,'unknown-scale').currentness,'current');assert.equal(p.status,'insufficient_evidence');
 }finally{f.close();}
});

test('attach requires current frame/calibration/canonical ROI; display or label edits do not stale science',()=>{
 const f=fixture();try{const p=f.payload(),s=sourceState(),e=attachCrystalEvidence(p,s,'attach');
  for(const edit of [x=>x.frame_identity.frame_object_id=C,x=>x.object.xy_calibration.revision=2,x=>x.object.annotations[1].anchor.coordinates=[15.6,0,31.8,16]]){const wrong=clone(s);edit(wrong);assert.throws(()=>attachCrystalEvidence(p,wrong,'wrong'),/stale scientific binding/);}
  const display=clone(s);display.object.display={gamma:2};display.object.annotations[0].text='new label';display.object.annotations[0].presentation={label:{offset:[20,10]}};assert.equal(crystalEvidenceForState(e,display).currentness,'current');
  const moved=clone(s);moved.object.annotations[0].anchor.coordinates=[1,0,16,16];assert.equal(crystalEvidenceForState(e,moved).currentness,'needs_review');
  const measured=clone(s);measured.last_operation={kind:'measure',source_object_id:D,object_id:'5'.repeat(32)};assert.ok(crystalEvidenceForState(e,measured).currentness_reasons.includes('new_measurement_not_in_saved_comparison'));
 }finally{f.close();}
});

test('optional original observation validates exact saved rectangles and retains reasons without confirmation',()=>{
 const f=fixture();try{const s=sourceState(),e=attachCrystalEvidence(f.payload(),s,'attach',toolResult(s.object));assert.equal(e.payload.source.observation_view_object_id,A);assert.equal(e.payload.observations[0].status,'hypothesized');assert.equal(e.payload.observations[0].reason,'Operator reason A');assert.deepEqual(e.payload.observations[0].original_anchor.coordinates,[0,0,16,16]);const wrong=clone(s.object);wrong.annotations.pop();assert.throws(()=>attachCrystalEvidence(f.payload(),s,'attach',toolResult(wrong)),/observation view|stale/);}finally{f.close();}
});

test('same frame and calibration do not admit another ROI FFT; both saved FFT views remain current',()=>{
 const f=fixture();try{const payload=f.payload(),source=sourceState(),original=attachCrystalEvidence(payload,source,'source-attach');
  const frequencyView=id=>({...clone(source),object:{object_id:id,kind:'fft_view',panels:[{domain:'frequency',source_object_id:id,fft_shape_yx:[16,16],fft_rect_xyxy:[0,0,16,16],image_rect_xyxy:[0,0,16,16]}],annotations:[],xy_calibration:clone(scale)}});
  for(const id of [D,E]){const allowed=frequencyView(id);assert.equal(crystalEvidenceForState(original,allowed).currentness,'current');assert.equal(attachCrystalEvidence(payload,allowed,'allowed-'+id).currentness,'current');}
  const third=frequencyView('5'.repeat(32));assert.equal(third.frame_identity.frame_object_id,F);assert.deepEqual(third.object.xy_calibration,source.object.xy_calibration);
  assert.throws(()=>attachCrystalEvidence(payload,third,'unrelated-fft'),/different_saved_fft/);
  const historical=crystalEvidenceForState(original,third);assert.equal(historical.currentness,'needs_review');assert.ok(historical.currentness_reasons.includes('different_saved_fft'));assert.equal(original.currentness,'current','Reading another view cannot rewrite original card');
 }finally{f.close();}
});

const fftView=(object,fft,measurement,coordinates=[.125,0])=>({object_id:object,backend:'external-image-workspace',kind:'annotate',parent_object_id:fft,xy_calibration:clone(scale),panels:[{domain:'frequency',source_object_id:fft,fft_shape_yx:[16,16],fft_rect_xyxy:[0,0,16,16],image_rect_xyxy:[0,0,16,16]}],annotations:measurement?[{annotation_id:'peak-'+fft[0],kind:'point',text:'saved peak',status:'hypothesized',anchor:{coordinate_space:'frequency_cycles_per_pixel',source_object_id:fft,coordinates},presentation:{label:{measurement_object_id:measurement,measurement_kind:'period',text:'numeric label'}}}]:[]});

test('interaction hints use exact ROI+FFT and bound measurement labels, cache shared atlas, and never guess raw views',async()=>{
 const f=fixture();try{const payload=f.payload(),VA='7'.repeat(32),VB='8'.repeat(32),calls=[];
  const field={object_id:G,backend:'external-image-workspace',kind:'spatial_atlas',regions:[{rect:[16,0,32,16],fft_object_id:E,view_object_id:VB},{rect:[0,0,16,16],fft_object_id:D,view_object_id:VA}]};
  const records=new Map([[G,field],[VA,fftView(VA,D,M)],[VB,fftView(VB,E,N)]]),read=id=>{calls.push(id);return toolResult(records.get(id));};
  const hinted=await addCrystalInteractionViews(payload,read);assert.deepEqual(hinted.domains.map(d=>d.interaction_view_object_id),[VA,VB]);assert.deepEqual(calls,[G,VA,VB]);assert.ok(hinted.domains.every(d=>d.interaction_view_status==='verified_saved_measurement_view'));
  const rawState={...sourceState(),object:fftView(D,D,null)},original=attachCrystalEvidence(hinted,rawState,'raw-attach');
  assert.equal(crystalEvidenceForState(original,{...sourceState(),object:records.get(VA)}).currentness,'current','Opening an already saved qualified marked view is navigation, not an edit');
  const revised=clone(payload);revised.domains[0].measurement_object_ids=[P];revised.domains[0].measurement_geometry=[{measurement_object_id:P,points:[[0,0],[.15,0]]}];
  const refused=await addCrystalInteractionViews(revised,read);assert.equal(refused.domains[0].interaction_view_object_id,undefined);assert.equal(refused.domains[0].interaction_view_status,'unavailable');
  records.set(VA,fftView(VA,D,P,[.15,0]));const corrected=await addCrystalInteractionViews(revised,read);assert.equal(corrected.domains[0].interaction_view_object_id,VA);
 }finally{f.close();}
});

test('known peak edits and remeasurement stay stale after source navigation; only updated bound evidence clears context',()=>{
 const f=fixture();try{const payload=f.payload(),view=fftView(X,D,M),before={...sourceState(),object:view},original=attachCrystalEvidence(payload,before,'original'),oldBytes=JSON.stringify(original);
  const moved=fftView('7'.repeat(32),D,M,[.15,0]),dirty=rememberCrystalScienceEvent(original,'edit',before,moved);
  assert.ok(dirty.sticky_reasons.includes('saved_scientific_anchor_changed'));assert.equal(crystalEvidenceForState(dirty,sourceState()).currentness,'needs_review');
  assert.throws(()=>attachCrystalEvidence(payload,{...sourceState(),crystal_evidence:dirty},'same-old'),/predates_local_scientific_revision/);
  const replacement=clone(payload);replacement.object_id=X;replacement.domains[0].fft_object_id='5'.repeat(32);replacement.domains[0].current_image_object_id='5'.repeat(32);
  assert.throws(()=>attachCrystalEvidence(replacement,{...sourceState(),crystal_evidence:dirty},'replace-pending-fft'),/edited_fft_not_in_saved_comparison/);
  const measure={object_id:P,request_id:'moved-measure',kind:'measure',source_object_id:D,points:[[0,0],[.15,0]],scientific_grid_identity:{source_grid_object_id:D}};
  const measured=rememberCrystalScienceEvent(dirty,'measure',{...before,object:moved},measure,{annotation_id:'peak-d',source_object_id:D});
  assert.deepEqual(measured.latest_measurement_refs,[{object_id:P,request_id:'moved-measure',source_object_id:D,annotation_id:'peak-d'}]);assert.equal(measured.pending_anchor_refs.length,0);assert.equal(crystalEvidenceForState(measured,sourceState()).currentness,'needs_review');
  const newButStale={...payload,object_id:X,request_id:'revised-with-old-measure'};assert.throws(()=>attachCrystalEvidence(newButStale,{...sourceState(),crystal_evidence:measured},'stale-new'),/latest_measurement_not_in_saved_comparison/);
  assert.throws(()=>attachCrystalEvidence(replacement,{...sourceState(),crystal_evidence:measured},'replace-required-fft'),/required_fft_not_in_saved_comparison/);
  const revised=clone(newButStale);revised.domains[0].measurement_object_ids=[P];revised.domains[0].measurement_geometry=[{measurement_object_id:P,points:measure.points}];
  const attached=attachCrystalEvidence(revised,{...sourceState(),crystal_evidence:measured},'revised-valid');assert.deepEqual(attached.sticky_reasons,[]);assert.equal(attached.currentness,'current');assert.deepEqual(attached.latest_measurement_refs,measured.latest_measurement_refs);assert.equal(JSON.stringify(original),oldBytes);
  const restored=restoreCrystalEvidenceSnapshot(clone(measured));assert.deepEqual(restored.latest_measurement_refs,measured.latest_measurement_refs);assert.equal(crystalEvidenceForState(restored,sourceState()).currentness,'unvalidated_snapshot');
 }finally{f.close();}
});

test('removed bare scientific anchor has no invented measurement binding and cannot silently retain old geometry',()=>{
 const f=fixture();try{const payload=f.payload(),bare=fftView(X,D,M);delete bare.annotations[0].presentation.label.measurement_object_id;
  const before={...sourceState(),object:bare},original=attachCrystalEvidence(payload,before,'bare-original'),removed={...clone(bare),object_id:'7'.repeat(32),annotations:[]};
  const dirty=rememberCrystalScienceEvent(original,'edit',before,removed);assert.equal(dirty.pending_anchor_refs[0].removed,true);assert.equal(dirty.pending_anchor_refs[0].previous_measurement_object_id,undefined);assert.equal(crystalEvidenceForState(dirty,sourceState()).currentness,'needs_review');
  assert.throws(()=>attachCrystalEvidence({...payload,object_id:'8'.repeat(32)},{...sourceState(),crystal_evidence:dirty},'bare-old-geometry'),/removed_anchor_binding_unresolved/);
  assert.equal(original.currentness,'current');assert.deepEqual(original.sticky_reasons,[]);
 }finally{f.close();}
});

test('label/display navigation does not set sticky invalidation, while known calibration revision cannot be undone by browsing old source',()=>{
 const f=fixture();try{const payload=f.payload(),view=fftView(X,D,M),before={...sourceState(),object:view},original=attachCrystalEvidence(payload,before,'original');
  const label=clone(view);label.annotations[0].text='rearranged';label.annotations[0].presentation.label.offset=[20,30];label.display={gamma:2};
  const display=rememberCrystalScienceEvent(original,'edit',before,label);assert.deepEqual(display.sticky_reasons,[]);assert.equal(crystalEvidenceForState(display,{...before,object:label}).currentness,'current');
  const third={...before,object:fftView(P,P,null)};assert.ok(crystalEvidenceForState(original,third).currentness_reasons.includes('different_saved_fft'));assert.equal(crystalEvidenceForState(original,before).currentness,'current');
  const changed=clone(view);changed.xy_calibration={...clone(scale),calibration_id:P,revision:2};const scaled=rememberCrystalScienceEvent(original,'calibrate',before,changed);assert.equal(crystalEvidenceForState(scaled,sourceState()).currentness,'needs_review');assert.equal(scaled.required_calibration_dependency.calibration_id,P);
  assert.throws(()=>attachCrystalEvidence({...payload,object_id:X},{...sourceState(),crystal_evidence:scaled},'old-scale'),/latest_calibration_not_in_saved_comparison/);
 }finally{f.close();}
});

test('process-reopen snapshot remains explicitly unvalidated, including matching source and prior validated flag',()=>{
 const f=fixture();try{const s=sourceState(),e=attachCrystalEvidence(f.payload(),s,'attach'),restored=restoreCrystalEvidenceSnapshot(clone(e));assert.equal(restored.attachment_status,'restored_unvalidated');assert.equal(crystalEvidenceForState(restored,s).currentness,'unvalidated_snapshot');const corrupted=clone(e);corrupted.payload.image_png_base64='bad';assert.throws(()=>restoreCrystalEvidenceSnapshot(corrupted),/PNG/);}finally{f.close();}
});

async function panelFixture(run,{lostReply=false}={}){
 const f=fixture(),images=mkdtempSync(path.join(tmpdir(),'crystal-panel-images-')),calls=[];
 const view={...sourceState().object,parent_object_id:F,display:{gamma:1}};
 const client={async rpc(method){return {result:method==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}};},async tool(name,args){calls.push({name,args:clone(args)});assert.equal(name,'image_info');return {data:clone(args.object_id===A?view:args.object_id===X?{...view,object_id:X}:{object_id:F,kind:'frame',frame_index:0,source_object_id:E}),png:png.toString('base64')};},async close(){}};
 const panel=await createImagePanel({workspace:images,python:path.resolve('unused-python'),object_id:A,panel_id:P,client});
 const origin=panel.url.split('/#')[0],headers={'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'};
 let evidenceReads=0,evidencePosts=0,dropped=false;const manager=new ImagePanelManager({workspace:images,python:path.resolve('unused-python'),inspect:async()=>toolResult(view),inspectEvidence:async()=>{evidenceReads++;return f.payload();},fetchImpl:async(url,args)=>{if(args.method==='POST'&&url.endsWith('/api/evidence'))evidencePosts++;const r=await fetch(url,args);if(lostReply&&!dropped&&args.method==='POST'&&url.endsWith('/api/evidence')){dropped=true;await r.text();throw new Error('Controlled response loss after attach');}return r;}});
 manager.getConnection=()=>({schema_version:1,panel_id:P,port:panel.server.address().port,token:panel.token,evidence_token:panel.evidenceToken,pid:process.pid});
 const args={panel_id:P,comparison_object_id:B,expected_object_id:A,draft_revision:0,request_id:'attach-original'};
 try{await run({f,panel,manager,args,calls,origin,headers,reads:()=>evidenceReads,posts:()=>evidencePosts});}finally{await panel.close();f.close();rmSync(images,{recursive:true,force:true});}
}

test('actual owned HTTP attachment preserves image and original receipt; browser capability cannot forge evidence',()=>panelFixture(async({panel,manager,args,calls,origin,headers,reads})=>{
 const fake=await fetch(origin+'/api/evidence',{method:'POST',headers,body:JSON.stringify({})});assert.equal(fake.status,403);
 const before=clone(panel.state().object),reply=await manager.call('image_panel_evidence',args),decoded=JSON.parse(reply.content[0].text);
 assert.equal(decoded.view.crystal_evidence.currentness,'current');assert.equal(decoded.view.crystal_evidence.payload.status,'insufficient_evidence');assert.equal(decoded.view.crystal_evidence.payload.image_png_base64,undefined,'Do not duplicate base64 in MCP text');assert.equal(reply.content.filter(v=>v.type==='image').length,2);
 assert.deepEqual(panel.state().object,before);assert.equal(reads(),1);assert.ok(calls.every(c=>c.name==='image_info'));
 const saved=JSON.parse(readFileSync(path.join(panel.journal,'current-selection.json'),'utf8'));assert.equal(saved.crystal_evidence.payload.object_id,B);assert.equal(saved.crystal_evidence.payload.image_png_base64,undefined);assert.equal(restoreCrystalEvidenceSnapshot(saved.crystal_evidence).attachment_status,'restored_unvalidated');
 const recovered=JSON.parse((await manager.call('image_panel_evidence',args)).content[0].text);assert.equal(recovered.recovered,true);assert.equal(reads(),1);
 await assert.rejects(manager.call('image_panel_evidence',{...args,comparison_object_id:C}),/conflict/);assert.equal(reads(),1);
}));

test('lost attachment response queries original receipt without another provider admission or POST',()=>panelFixture(async({manager,args,reads,panel})=>{
 await assert.rejects(manager.call('image_panel_evidence',args),/Controlled response loss/);assert.equal(panel.state().crystal_evidence.currentness,'current');
 const r=JSON.parse((await manager.call('image_panel_evidence',args)).content[0].text);assert.equal(r.recovered,true);assert.equal(r.view.crystal_evidence.payload.object_id,B);assert.equal(reads(),1);
},{lostReply:true}));

test('stale view and dirty/newer drafts refuse; failed original attachment is not silently retried',()=>panelFixture(async({manager,args,panel,origin,headers,reads})=>{
 await assert.rejects(manager.call('image_panel_evidence',{...args,expected_object_id:C}),/Stale/);assert.equal(panel.state().crystal_evidence,null);
 const draft=await fetch(origin+'/api/action',{method:'POST',headers,body:JSON.stringify({expected_object_id:A,action:'draft',lightweight:true,params:{draft_revision:2,dirty:true,gesture_active:false}})});assert.equal(draft.status,200);
 const dirtyArgs={...args,request_id:'dirty-original',draft_revision:2};await assert.rejects(manager.call('image_panel_evidence',dirtyArgs),/draft/);
 const before=reads();await assert.rejects(manager.call('image_panel_evidence',dirtyArgs),/draft/);assert.equal(reads(),before);assert.equal(panel.state().crystal_evidence,null);
}));

test('preflight failure reserves the original ID; restoring the view cannot turn it into a new attachment',()=>panelFixture(async({manager,args,panel,origin,headers,reads,posts})=>{
 const show=async(object,expected,request_id)=>{const r=await fetch(origin+'/api/present',{method:'POST',headers,body:JSON.stringify({object_id:object,expected_object_id:expected,draft_revision:0,request_id})});assert.equal(r.status,200);};
 await show(X,A,'preflight-view-away');let first;
 await assert.rejects(manager.call('image_panel_evidence',args),error=>{first=error.message;return /Stale owned Panel/.test(error.message);});
 const saved=JSON.parse(readFileSync(manager.requestFile(args.request_id),'utf8'));assert.equal(saved.status,'failed');assert.equal(saved.stage,'preflight');assert.equal(saved.error,first);assert.equal(reads(),1);assert.equal(posts(),0);
 await show(A,X,'preflight-view-restored');
 await assert.rejects(manager.call('image_panel_evidence',args),error=>error.message===first);assert.equal(reads(),1);assert.equal(posts(),0);assert.equal(panel.state().crystal_evidence,null);
 const fresh=JSON.parse((await manager.call('image_panel_evidence',{...args,request_id:'explicit-new-after-preflight'})).content[0].text);assert.equal(fresh.recovered,false);assert.equal(fresh.view.crystal_evidence.currentness,'current');assert.equal(reads(),2);assert.equal(posts(),1);
}));

test('an interrupted submitted preflight only queries its original receipt, never repeats provider admission or POST',()=>panelFixture(async({manager,args,reads,posts})=>{
 manager.initialize();writeFileSync(manager.requestFile(args.request_id),JSON.stringify({schema_version:1,name:'image_panel_evidence',arguments:args,request_id:args.request_id,panel_id:P,status:'submitted',stage:'preflight'}),{flag:'wx'});
 await assert.rejects(manager.call('image_panel_evidence',args),/not found/i);assert.equal(reads(),0);assert.equal(posts(),0);
 const saved=JSON.parse(readFileSync(manager.requestFile(args.request_id),'utf8'));assert.equal(saved.status,'submitted');assert.equal(saved.stage,'preflight');
}));

test('exclusive submitted intent already exists when the new tool starts provider qualification',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'crystal-preflight-intent-')),args={panel_id:P,comparison_object_id:B,expected_object_id:A,draft_revision:0,request_id:'provider-refusal'},marker='Controlled provider qualification refused';let reads=0;
 const manager=new ImagePanelManager({workspace,python:path.resolve('unused'),inspect(){throw Error('Not an image operation');},inspectEvidence(){reads++;const saved=JSON.parse(readFileSync(manager.requestFile(args.request_id),'utf8'));assert.equal(saved.status,'submitted');assert.equal(saved.stage,'preflight');assert.deepEqual(saved.arguments,args);throw Error(marker);}});
 try{await assert.rejects(manager.call('image_panel_evidence',args),new RegExp(marker));assert.equal(JSON.parse(readFileSync(manager.requestFile(args.request_id),'utf8')).status,'failed');await assert.rejects(manager.call('image_panel_evidence',args),new RegExp(marker));assert.equal(reads,1);}finally{rmSync(workspace,{recursive:true,force:true});}
});

test('old Panel schemas remain unchanged and evidence tool is absent without explicit structure provider',()=>{
 assert.deepEqual(imagePanelTools.map(t=>t.name),['image_panel_open','image_panel_current','image_panel_show']);
 const manager={workspace:path.resolve('unused'),call(){throw Error('not executed');}};
 assert.equal(createImagePanelModule({manager}).tools.some(t=>t.definition.name==='image_panel_evidence'),false);
 assert.ok(createImagePanelModule({manager,structureWorkspace:{workspace:path.resolve('explicit'),call(){throw Error('not executed');}}}).tools.some(t=>t.definition.name==='image_panel_evidence'));
 assert.ok(imagePanelEvidenceTool.inputSchema.properties.observation_view_object_id);
});
