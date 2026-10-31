// Bounded presentation of fully admitted existing General Crystallographic
// Evidence. No scientific write, fitting, array conversion or new computation.
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {panelRoiHandoff} from './panel_roi_handoff.mjs';
import type {IdentityCheckedPanelState} from './panel_manager_contracts.mjs';
import type {ToolResult} from './runtime/contracts.mjs';

type Row=Record<string,unknown>;
const record=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need:(v:unknown,reason:string)=>asserts v=(v,reason)=>{if(!v)throw new Error('Crystal evidence presentation: '+reason);};
const row=(v:unknown):Row=>{need(record(v),'record required');return v;};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const request=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const list=(v:unknown,max:number):unknown[]=>{need(Array.isArray(v)&&v.length<=max,'array exceeds declared presentation budget');return v;};
const pick=(v:unknown,keys:readonly string[]):Row=>{const source=row(v);return Object.fromEntries(keys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));};
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null,(_k,v:unknown)=>record(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)===JSON.stringify(b??null,(_k,v:unknown)=>record(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const calibration=(v:unknown)=>v==null?null:pick(v,['calibration_id','revision','status','source','coordinate_domain','centre_revision_id']);
const rect=(v:unknown)=>Array.isArray(v)&&v.length===4&&v.every(x=>typeof x==='number'&&Number.isFinite(x))&&v[0]<v[2]&&v[1]<v[3];
const checkedJSON=(v:unknown,maxBytes:number)=>{const visit=(x:unknown,depth=0):void=>{need(depth<=16,'nested presentation exceeds depth bound');if(typeof x==='number')need(Number.isFinite(x),'nonfinite presentation number');else if(typeof x==='string')need(x.length<=4096,'presentation text exceeds bound');else if(Array.isArray(x)){need(x.length<=4096,'presentation list exceeds bound');x.forEach(y=>visit(y,depth+1));}else if(record(x)){need(Object.keys(x).length<=256,'presentation record exceeds bound');Object.values(x).forEach(y=>visit(y,depth+1));}else need(x===null||typeof x==='boolean','unsupported presentation value');};visit(v);need(Buffer.byteLength(JSON.stringify(v))<=maxBytes,'presentation exceeds byte bound');return v;};

export interface CrystalEvidencePayload extends Row {
 schema_version:1;provider:'external-structure-workspace';object_id:string;request_id:string;
 source:Row;domains:Row[];candidates:Row[];status:string;image_png_base64?:string;
}
export interface CrystalEvidenceEnvelope extends Row {
 schema_version:1;presentation_request_id:string;attached_object_id:string;
 attachment_status:'validated'|'restored_unvalidated';payload:CrystalEvidencePayload;
 geometry:unknown[];geometry_scope:unknown;currentness:string;currentness_reasons:string[];
 sticky_reasons?:string[];latest_measurement_refs?:Row[];pending_anchor_refs?:Row[];required_calibration_dependency?:unknown;
}

export function admittedToolReply(result:unknown):{data:Row;png:unknown}{
 const response=row(result);need(response.isError!==true,'provider refused original record');
 const content=list(response.content,8),text=content.find(v=>record(v)&&v.type==='text');
 need(record(text)&&typeof text.text==='string'&&Buffer.byteLength(text.text)<=20*1024*1024,'missing bounded provider JSON');
 const value:unknown=JSON.parse(text.text);return {data:row(value),png:(content.find(v=>record(v)&&v.type==='image'&&v.mimeType==='image/png') as Row|undefined)?.data};
}

function admittedFile(workspace:string,objectId:string,name:string,expected:unknown):unknown {
 need(path.isAbsolute(workspace)&&digest(expected),'explicit workspace and admitted file hash required');const root=realpathSync.native(workspace);
 const file=realpathSync.native(path.join(root,'objects',objectId,name)),relative=path.relative(root,file);
 need(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)&&statSync(file).size<=4*1024*1024,'admitted file escapes configured structure workspace or size budget');
 const bytes=readFileSync(file);need(createHash('sha256').update(bytes).digest('hex')===expected,'admitted evidence file changed');
 return JSON.parse(bytes.toString('utf8')) as unknown;
}

function boundedRows(v:unknown,keys:readonly string[],limit=96){
 const values=list(v,4096);return {rows:values.slice(0,limit).map(value=>pick(value,keys)),total:values.length,omitted:Math.max(0,values.length-limit)};
}

export function buildCrystalEvidencePayload(result:ToolResult,workspace:string,objectId:string):CrystalEvidencePayload {
 const {data:v,png}=admittedToolReply(result);
 need(v.object_id===objectId&&v.backend==='external-structure-workspace'&&v.kind==='crystal_evidence'&&request(v.request_id),'wrong provider, kind, identity or original request');
 need(['compatible','incompatible','insufficient_evidence'].includes(String(v.status)),'unsupported scientific status');
 need(v.phase_identified===false&&v.twin_law_tested===false&&v.intensity_comparison_performed===false,'unsupported physical claim');
 const binding=row(v.source_binding);need(id(binding.frame_object_id)&&id(binding.current_spatial_image_object_id)&&digest(binding.source_array_sha256),'missing fixed experimental identity');
 const details=row(admittedFile(workspace,objectId,'comparisons.json',row(v.files_sha256)['comparisons.json']));
 const domains=list(v.domains,2).map(domain=>{const d=row(domain);need(rect(d.rect_xyxy)&&id(d.fft_object_id)&&id(d.current_image_object_id)&&id(d.field_object_id),'domain lacks explicit ROI/FFT/field identity');
  const measurements=list(d.measurement_object_ids,16);need(measurements.every(id),'invalid domain measurement identity');
  const physical=list(d.physical_observations??[],16);
  const geometry=physical.length?physical.map(value=>{const m=row(value);need(id(m.measurement_object_id)&&measurements.includes(m.measurement_object_id),'physical measurement identity differs from domain');return {measurement_object_id:m.measurement_object_id,points:m.original_points,dc_reference_point_index:m.dc_reference_point_index,q_xy_inv_angstrom:m.q_xy_inv_angstrom};}):record(d.experimental_geometry_binding)?list(d.experimental_geometry_binding.ordered_measurement_geometry,16).map(g=>pick(g,['points','dc_reference_point_index','q_xy_inv_angstrom'])):[];
  return {...pick(d,['rect_xyxy','fft_object_id','current_image_object_id','field_object_id','measurement_object_ids','fft_array_sha256','observation_key','evidence_quality_ready','evidence_quality_reasons','insufficient_reasons','physical_ready']),measurement_geometry:geometry};
 });need(domains.length===2,'exactly two saved domain supports required');
 const matchKeys=['measurement_object_id','measurement_index','hkl','simulation_reflection_index','experiment_original_q_xy_inv_angstrom','experiment_registered_q_xy_inv_angstrom','simulation_q_xyz_inv_angstrom','position_residual_inv_angstrom','within_declared_tolerance'];
 const candidates=list(v.candidate_pairs,3).map(candidate=>{const c=row(candidate);need(typeof c.label==='string'&&c.label.length<=256,'candidate label required');
  const sides=list(c.sides,2).map((side,index)=>{const s=row(side),detail=details[`${c.label}:${index}`];
   if(s.comparison_object_id===null){need(s.status==='insufficient_evidence'&&detail===undefined,'missing child cannot imply a completed comparison');const attempts=list(v.child_receipts??[],6).filter(value=>record(value)&&value.candidate_label===c.label&&value.side===index).map(value=>pick(value,['request_id','state','error','automatic_retry','object_id']));return {...pick(s,['side','rect_xyxy','status','reason','comparison_object_id','comparison_request_id','structure_object_id','orientation_object_id','simulation_object_id','independent_validation']),computation_status:'not_completed',matched:[],matched_count:null,omitted_matched:0,unmatched_experimental:[],unmatched_experimental_count:null,omitted_unmatched_experimental:0,unmatched_simulated:[],unmatched_simulated_count:null,omitted_unmatched_simulated:0,ambiguity:[],ambiguity_count:null,omitted_ambiguity:0,attempt_receipts:attempts,full_evidence_reference:{tool:'structure_info',object_id:objectId,fields:['child_receipts','domains']}};}
   const full=row(detail);need(id(s.comparison_object_id)&&request(s.comparison_request_id),'child comparison identity missing');
   const matches=boundedRows(full.matched,matchKeys),unmatched=boundedRows(full.unmatched_experimental,['measurement_object_id','measurement_request_id','measurement_index','q_xy_inv_angstrom','original_points','projected_period_angstrom','uncertainty_status','reason']),predictions=boundedRows(full.unmatched_simulated,['hkl','simulation_reflection_index','q_xyz_inv_angstrom','coordinates_inv_angstrom','intensity','kinematic_intensity']);
   const ambiguity=boundedRows(full.ambiguity,['measurement_index','candidate_count','ambiguous_within_tolerance','assignment_is_unique_proof']);
   ambiguity.rows=ambiguity.rows.map((value,i)=>{const original=row(list(full.ambiguity,4096)[i]),options=boundedRows(original.candidates,['hkl','residual_inv_angstrom','simulation_reflection_index'],8);return {...value,candidates:options.rows,omitted_candidates:options.omitted};});
   return {...pick(s,['side','rect_xyxy','status','reason','comparison_object_id','comparison_request_id','structure_object_id','orientation_object_id','simulation_object_id','independent_validation']),...(record(s.direction_evidence)?{direction_evidence:pick(s.direction_evidence,['adequate','noncollinear_direction_family_count','direction_policy_version','independence_scope','unresolved_measurement_object_ids'])}:{}),matched:matches.rows,matched_count:matches.total,omitted_matched:matches.omitted,unmatched_experimental:unmatched.rows,unmatched_experimental_count:unmatched.total,omitted_unmatched_experimental:unmatched.omitted,unmatched_simulated:predictions.rows,unmatched_simulated_count:predictions.total,omitted_unmatched_simulated:predictions.omitted,ambiguity:ambiguity.rows,ambiguity_count:ambiguity.total,omitted_ambiguity:ambiguity.omitted,full_evidence_reference:{tool:'structure_info',object_id:s.comparison_object_id,fields:['matched','unmatched_experimental','unmatched_simulated','ambiguity']}};
  });need(sides.length===2,'two candidate sides required');return {...pick(c,['label','status','reason','basis','independent_validation','interpretation_status']),sides};
 });need(candidates.length>=1,'candidate evidence missing');
 const qualifications=Object.entries(row(v.candidate_qualification)).slice(0,6).map(([simulationId,value])=>{const entry=row(value),q=row(entry.qualification);return {simulation_object_id:simulationId,...pick(entry,['structure_object_id','orientation_object_id']),qualification:{source:pick(q.source,['status','format','source_sha256']),sites:pick(q.sites,['status','atom_count','elements','basis_chemistry_verified']),cell:pick(q.cell,['status','cell_angstrom','pbc','rank','condition_number','reciprocal_convention']),occupancy:pick(q.occupancy,['status','qualified_ordered_model']),symmetry:pick(q.symmetry,['space_group_status','point_group_status','space_group_verified','point_group_verified','declared_space_group']),kinematic_simulation:pick(q.kinematic_simulation,['status','executed_saved_simulation','reasons','enumeration']),limits:q.limits}};});
 need(typeof png==='string'&&png.length<=3*1024*1024,'saved comparison PNG missing or too large');const bytes=Buffer.from(png,'base64');need(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&createHash('sha256').update(bytes).digest('hex')===row(v.files_sha256)['preview.png'],'comparison PNG signature/hash mismatch');
 const payload:CrystalEvidencePayload={schema_version:1,provider:'external-structure-workspace',object_id:objectId,request_id:v.request_id,status:String(v.status),reason:v.reason,interpretation_status:v.interpretation_status,phase_identified:false,twin_law_tested:false,intensity_comparison_performed:false,source:{...pick(binding,['frame_object_id','frame_index','source_object_id','source_array_sha256','shape_yx','dtype','calibration_dependency']),spatial_image_object_id:binding.current_spatial_image_object_id,xy_scale:record(binding.xy_calibration)?binding.xy_calibration.xy_scale:null},domains,candidates,qualification:qualifications,registration:v.registration,max_residual_inv_angstrom:v.max_residual_inv_angstrom,experimental_kind:v.experimental_kind,limits:v.scientific_limits,image_png_base64:png,image_png_sha256:createHash('sha256').update(bytes).digest('hex'),evidence_files_sha256:pick(v.files_sha256,['comparisons.json','observation-bindings.json','qualification.json','reflections.csv','preview.png'])};
 // PNG is separately bounded; numerical/text details cannot silently balloon.
 const {image_png_base64,...metadata}=payload;checkedJSON(metadata,512*1024);return payload;
}

function isBoundMeasurementView(view:Row,domain:Row,source:Row):boolean {
 const panels=Array.isArray(view.panels)?view.panels:[];
 if(panels.length!==1||!record(panels[0])||panels[0].domain!=='frequency'||panels[0].source_object_id!==domain.fft_object_id||!same(calibration(view.xy_calibration),source.calibration_dependency))return false;
 const expected=list(domain.measurement_object_ids,16),geometry=list(domain.measurement_geometry,16),found=new Set<unknown>();
 if(!expected.length||!Array.isArray(view.annotations)||view.annotations.length>100)return false;
 for(const value of view.annotations){if(!record(value)||!record(value.presentation)||!record(value.presentation.label)||value.presentation.label.measurement_object_id===undefined)continue;
  const measurement=value.presentation.label.measurement_object_id,anchor=record(value.anchor)?value.anchor:null;
  if(!expected.includes(measurement)||found.has(measurement)||!anchor||anchor.source_object_id!==domain.fft_object_id||anchor.coordinate_space!=='frequency_cycles_per_pixel')return false;
  const matches=geometry.filter(g=>record(g)&&g.measurement_object_id===measurement);if(matches.length!==1)return false;
  const points=row(matches[0]).points;if(!Array.isArray(points)||points.length!==2||!Array.isArray(points[0])||!Array.isArray(points[1]))return false;
  const correct=value.kind==='point'?same(anchor.coordinates,points[1])&&same(points[0],[0,0]):['line','arrow'].includes(String(value.kind))?same(anchor.coordinates,[...points[0],...points[1]]):false;
  if(!correct)return false;found.add(measurement);
 }
 return found.size===expected.length;
}

export async function addCrystalInteractionViews(payload:CrystalEvidencePayload,readInfo:(objectId:string)=>PromiseLike<ToolResult>|ToolResult):Promise<CrystalEvidencePayload>{
 const fields=new Map<string,Promise<Row>>(),views=new Map<string,Promise<Row>>();
 const read=(cache:Map<string,Promise<Row>>,objectId:string)=>{let pending=cache.get(objectId);if(!pending){pending=Promise.resolve(readInfo(objectId)).then(result=>{const {data}=admittedToolReply(result);need(data.object_id===objectId&&data.backend==='external-image-workspace','image hint provider or identity differs');return data;});cache.set(objectId,pending);}return pending;};
 const domains:Row[]=[];
 for(const domain of payload.domains){let hint:Row={interaction_view_status:'unavailable',interaction_view_reason:'No admitted saved measurement view is available.'};
  try{const fieldId=domain.field_object_id;need(id(fieldId)&&(fields.size<2||fields.has(fieldId)),'field hint inspection budget exceeded');
   const field=await read(fields,fieldId);need(field.kind==='spatial_atlas','interaction hint is limited to saved spatial_atlas records');
   const matches=list(field.regions,8).filter(value=>record(value)&&same(value.rect??value.rect_xyxy,domain.rect_xyxy)&&value.fft_object_id===domain.fft_object_id);
   need(matches.length===1,'unique exact ROI and FFT region required; region indices are not identities');const match=row(matches[0]);need(id(match.view_object_id),'saved region measurement view missing');
   const view=await read(views,match.view_object_id);need(isBoundMeasurementView(view,domain,payload.source),'saved view labels do not bind the current domain measurement IDs and geometry');
   hint={interaction_view_object_id:match.view_object_id,interaction_view_status:'verified_saved_measurement_view',interaction_view_reason:'Existing admitted atlas view; exact ROI/FFT, measurement IDs and scientific label anchors verified. No FFT or measurement computed.'};
  }catch(error){hint={interaction_view_status:'unavailable',interaction_view_reason:(error instanceof Error?error.message:String(error)).slice(0,1000)};}
  domains.push({...domain,...hint});
 }
 return {...payload,domains};
}

function checkedState(state:unknown):IdentityCheckedPanelState {const s=row(state),o=row(s.object);need(id(o.object_id),'current view identity missing');return s as IdentityCheckedPanelState;}
function viewGeometry(state:IdentityCheckedPanelState,payload:CrystalEvidencePayload):unknown[]{
 const sources=[row(payload.source).frame_object_id,...payload.domains.map(d=>d.fft_object_id)];
 return list(state.object.annotations??[],100).filter(v=>record(v)&&record(v.anchor)&&sources.includes(v.anchor.source_object_id)&&v.kind!=='text').map(v=>pick(v,['annotation_id','kind','anchor','status'])).sort((a,b)=>String(a.annotation_id).localeCompare(String(b.annotation_id)));
}
const geometryScope=(state:IdentityCheckedPanelState)=>list(state.object.panels??[],32).map(v=>pick(v,['source_object_id','domain','source_rect_xyxy','fft_shape_yx','fft_rect_xyxy']));
function sourceReasons(payload:CrystalEvidencePayload,state:IdentityCheckedPanelState):string[]{
 const frame=record(state.frame_identity)?state.frame_identity:{},source=payload.source,reasons:string[]=[];
 if(frame.frame_object_id!==source.frame_object_id)reasons.push('different_source_frame');
 if(!same(calibration(state.object.xy_calibration),source.calibration_dependency))reasons.push('different_calibration_revision');
 const savedFFTs=payload.domains.map(d=>d.fft_object_id);
 if(list(state.object.panels??[],32).some(value=>record(value)&&value.domain==='frequency'&&!savedFFTs.includes(value.source_object_id)))reasons.push('different_saved_fft');
 const packet=panelRoiHandoff(state),spatial=packet.saved_rectangles.filter(r=>r.original_anchor.source_object_id===source.frame_object_id&&r.original_anchor.coordinate_space==='source_pixels'),rectangles=spatial.filter(r=>r.usable);
 if(spatial.length&&(rectangles.length!==spatial.length||!same(rectangles.map(r=>JSON.stringify(r.rect_xyxy)).sort(),payload.domains.map(d=>JSON.stringify(d.rect_xyxy)).sort())))reasons.push('saved_roi_geometry_changed');
 const operation=record(state.last_operation)?state.last_operation:null;
 if(operation?.kind==='measure'&&id(operation.object_id)&&payload.domains.some(d=>list(d.measurement_object_ids,16).includes(operation.object_id)===false&&operation.source_object_id===d.fft_object_id))reasons.push('new_measurement_not_in_saved_comparison');
 return reasons;
}
const anchorKey=(v:Row)=>JSON.stringify([v.source_object_id,v.annotation_id??null]);
function anchorPointsMatch(anchor:Row,geometry:Row):boolean {
 const points=geometry.points;if(!Array.isArray(points)||points.length!==2||!Array.isArray(points[0])||!Array.isArray(points[1]))return false;
 return anchor.kind==='point'?same(anchor.coordinates,points[1])&&same(points[0],[0,0]):['line','arrow'].includes(String(anchor.kind))&&same(anchor.coordinates,[...points[0],...points[1]]);
}
function requiredContextReasons(previous:unknown,payload:CrystalEvidencePayload):string[]{
 if(!record(previous)||!record(previous.payload))return [];
 const sticky=list(previous.sticky_reasons??[],16),reasons:string[]=[];
 if(sticky.length&&previous.payload.object_id===payload.object_id)reasons.push('saved_comparison_predates_local_scientific_revision');
 if(sticky.includes('local_context_budget_exceeded'))reasons.push('local_context_budget_exceeded');
 if(Object.hasOwn(previous,'required_calibration_dependency')&&!same(previous.required_calibration_dependency,payload.source.calibration_dependency))reasons.push('latest_calibration_not_in_saved_comparison');
 for(const value of list(previous.latest_measurement_refs??[],16)){const ref=row(value),domain=payload.domains.find(d=>d.fft_object_id===ref.source_object_id);if(!domain)reasons.push('required_fft_not_in_saved_comparison');else if(!list(domain.measurement_object_ids,16).includes(ref.object_id))reasons.push('latest_measurement_not_in_saved_comparison');}
 for(const value of list(previous.pending_anchor_refs??[],16)){const anchor=row(value),domain=payload.domains.find(d=>d.fft_object_id===anchor.source_object_id);
  if(domain){if(anchor.removed===true){if(!id(anchor.previous_measurement_object_id))reasons.push('removed_anchor_binding_unresolved');else if(list(domain.measurement_object_ids,16).includes(anchor.previous_measurement_object_id))reasons.push('removed_anchor_measurement_still_used');}
   else if(!list(domain.measurement_geometry,16).some(g=>record(g)&&anchorPointsMatch(anchor,g)))reasons.push('edited_anchor_not_in_saved_comparison');
  }else if(list(previous.payload.domains,2).some(value=>record(value)&&value.fft_object_id===anchor.source_object_id))reasons.push('edited_fft_not_in_saved_comparison');
  else if(anchor.source_object_id===payload.source.frame_object_id&&anchor.kind==='rectangle'){
   const included=payload.domains.some(d=>same(d.rect_xyxy,anchor.rect_xyxy));if(anchor.removed===true?included:!included)reasons.push('edited_roi_not_in_saved_comparison');
  }
 }
 return [...new Set(reasons)];
}

// Called only after an existing scientific action succeeded, never by state GET.
// These bounded references retain local continuation requirements, not science.
export function rememberCrystalScienceEvent(value:CrystalEvidenceEnvelope|null,action:string,beforeValue:unknown,resultValue:unknown,hint:Row={}):CrystalEvidenceEnvelope|null {
 if(!value)return null;const before=checkedState(beforeValue),result=row(resultValue);
 if(!record(before.frame_identity)||before.frame_identity.frame_object_id!==value.payload.source.frame_object_id)return value;
 const sticky=new Set(list(value.sticky_reasons??[],16).map(String)),latest=list(value.latest_measurement_refs??[],16).map(row),pending=list(value.pending_anchor_refs??[],16).map(row);
 const retain=(values:Row[],next:Row)=>{const index=values.findIndex(v=>anchorKey(v)===anchorKey(next));if(index>=0)values[index]=next;else if(values.length<16)values.push(next);else sticky.add('local_context_budget_exceeded');};
 let required=value.required_calibration_dependency,hasRequired=Object.hasOwn(value,'required_calibration_dependency');
 if(action==='measure'&&result.kind==='measure'&&id(result.object_id)&&request(result.request_id)){
  const grid=record(result.scientific_grid_identity)?result.scientific_grid_identity.source_grid_object_id:null;
  const source=[hint.source_object_id,grid,result.source_object_id].find(source=>value.payload.domains.some(d=>d.fft_object_id===source));
  if(id(source)){
   const ref={object_id:result.object_id,request_id:result.request_id,source_object_id:source,...(typeof hint.annotation_id==='string'?{annotation_id:hint.annotation_id}:{})};retain(latest,ref);
   if(!value.payload.domains.some(d=>d.fft_object_id===source&&list(d.measurement_object_ids,16).includes(result.object_id)))sticky.add('new_measurement_not_in_saved_comparison');
   for(let i=pending.length-1;i>=0;i--)if(anchorKey(pending[i])===anchorKey(ref)&&anchorPointsMatch(pending[i],result))pending.splice(i,1);
  }
 }else if(['edit','mark'].includes(action)){
  const after={...before,object:result} as IdentityCheckedPanelState,old=viewGeometry(before,value.payload),current=viewGeometry(after,value.payload);
  for(const key of new Set([...old,...current].map(v=>String(row(v).annotation_id)))){
   const a=old.find(v=>row(v).annotation_id===key),b=current.find(v=>row(v).annotation_id===key);if(same(a,b))continue;
   const chosen=row(b??a),anchor=row(chosen.anchor),priorMark=list(before.object.annotations??[],100).find(v=>record(v)&&v.annotation_id===key),priorLabel=record(priorMark)&&record(priorMark.presentation)&&record(priorMark.presentation.label)?priorMark.presentation.label:null;
   const next:Row={annotation_id:key,source_object_id:anchor.source_object_id,kind:chosen.kind,coordinates:anchor.coordinates,removed:b===undefined||chosen.status==='retracted',...(id(priorLabel?.measurement_object_id)?{previous_measurement_object_id:priorLabel.measurement_object_id}:{})};
   if(chosen.kind==='rectangle'){const r=panelRoiHandoff(after).saved_rectangles.find(r=>r.annotation_id===key);const oldRect=panelRoiHandoff(before).saved_rectangles.find(r=>r.annotation_id===key);next.rect_xyxy=r?.rect_xyxy??oldRect?.rect_xyxy??null;}
   retain(pending,next);sticky.add('saved_scientific_anchor_changed');
  }
 }else if(action==='calibrate'){
  required=calibration(result.xy_calibration);hasRequired=true;if(!same(required,value.payload.source.calibration_dependency))sticky.add('different_calibration_revision');
 }
 return {...value,sticky_reasons:[...sticky].slice(0,16),latest_measurement_refs:latest,pending_anchor_refs:pending,...(hasRequired?{required_calibration_dependency:required}:{})};
}
export function attachCrystalEvidence(payload:CrystalEvidencePayload,stateValue:unknown,presentationRequestId:string,observation?:unknown):CrystalEvidenceEnvelope {
 const state=checkedState(stateValue),reasons=[...sourceReasons(payload,state),...requiredContextReasons(state.crystal_evidence,payload)];need(reasons.length===0,'stale scientific binding: '+reasons.join(', '));
 let result=payload;
 if(observation!==undefined){const {data}=admittedToolReply(observation);need(id(data.object_id),'observation view identity missing');
  const observationState={...state,object:data} as IdentityCheckedPanelState;const packet=panelRoiHandoff(observationState);
  need(sourceReasons(payload,observationState).filter(r=>r!=='new_measurement_not_in_saved_comparison').length===0,'observation view source/calibration differs');
  need(packet.saved_rectangles.length===2&&packet.saved_rectangles.every(r=>r.usable),'observation view needs exactly two usable saved spatial rectangles');
  result={...payload,source:{...payload.source,observation_view_object_id:data.object_id},observations:packet.saved_rectangles.map(r=>{const original=list(data.annotations??[],100).find(v=>record(v)&&v.annotation_id===r.annotation_id);return {annotation_id:r.annotation_id,text:r.text,reason:record(original)&&typeof original.note==='string'&&original.note.length<=1000?original.note:r.text,status:r.status,original_anchor:r.original_anchor,rect_xyxy:r.rect_xyxy};})};
 }
 const previous=record(state.crystal_evidence)?state.crystal_evidence:null;
 return {schema_version:1,presentation_request_id:presentationRequestId,attached_object_id:state.object.object_id,attachment_status:'validated',payload:result,geometry:viewGeometry(state,result),geometry_scope:geometryScope(state),currentness:'current',currentness_reasons:[],sticky_reasons:[],latest_measurement_refs:list(previous?.latest_measurement_refs??[],16).map(row),pending_anchor_refs:[],...(previous&&Object.hasOwn(previous,'required_calibration_dependency')?{required_calibration_dependency:previous.required_calibration_dependency}:{})};
}
export function crystalEvidenceForState(value:CrystalEvidenceEnvelope|null,stateValue:unknown):CrystalEvidenceEnvelope|null {
 if(!value)return null;const state=checkedState(stateValue);
 if(value.attachment_status==='restored_unvalidated')return {...value,currentness:'unvalidated_snapshot',currentness_reasons:['Saved presentation snapshot only; use image_panel_evidence for full structure_info revalidation.']};
 const reasons=[...sourceReasons(value.payload,state),...list(value.sticky_reasons??[],16).map(String)],geometry=viewGeometry(state,value.payload);
 const boundView=value.payload.domains.some(domain=>isBoundMeasurementView(state.object,domain,value.payload.source));
 if(!boundView){if(same(value.geometry_scope,geometryScope(state))&&!same(value.geometry,geometry))reasons.push('saved_scientific_anchor_changed');
  else for(const old of value.geometry){const previous=row(old),current=geometry.find(g=>row(g).annotation_id===previous.annotation_id);if(current&&!same(current,previous))reasons.push('saved_scientific_anchor_changed');}}
 const draft=record(state.edit_state)?state.edit_state.annotation_edit:null;
 if(record(draft)&&draft.coordinates!==undefined){const mark=list(state.object.annotations??[],100).find(v=>record(v)&&v.annotation_id===draft.annotation_id);if(record(mark)&&record(mark.anchor)&&!same(mark.anchor.coordinates,draft.coordinates))reasons.push('unsaved_scientific_anchor_draft');}
 return {...value,currentness:reasons.length?'needs_review':'current',currentness_reasons:[...new Set(reasons)]};
}
export function restoreCrystalEvidenceSnapshot(value:unknown):CrystalEvidenceEnvelope|null {
 if(value==null)return null;const recordValue=row(value);need(recordValue.schema_version===1&&request(recordValue.presentation_request_id)&&id(recordValue.attached_object_id),'invalid saved presentation reference');
 const payload=row(recordValue.payload);need(payload.provider==='external-structure-workspace'&&id(payload.object_id)&&request(payload.request_id),'invalid saved evidence identity');
 need(payload.schema_version===1&&['compatible','incompatible','insufficient_evidence'].includes(String(payload.status))&&payload.phase_identified===false&&payload.twin_law_tested===false,'invalid saved evidence scope');
 const source=row(payload.source);need(id(source.frame_object_id)&&id(source.spatial_image_object_id),'invalid saved source reference');
 need(Array.isArray(payload.domains)&&payload.domains.length===2,'invalid saved domain references');
 for(const value of payload.domains){const d=row(value);need(rect(d.rect_xyxy)&&id(d.fft_object_id)&&id(d.current_image_object_id)&&list(d.measurement_object_ids,16).every(id),'invalid saved domain geometry');}
 need(Array.isArray(payload.candidates)&&payload.candidates.length>=1&&payload.candidates.length<=3,'invalid saved candidate references');
 for(const value of payload.candidates){const c=row(value);need(typeof c.label==='string'&&['compatible','incompatible','insufficient_evidence'].includes(String(c.status))&&list(c.sides,2).length===2,'invalid saved candidate status');}
 need(digest(payload.image_png_sha256),'invalid saved display-asset hash');
 if(payload.image_png_base64!==undefined){need(typeof payload.image_png_base64==='string'&&payload.image_png_base64.length<=3*1024*1024,'invalid saved PNG budget');
  const bytes=Buffer.from(payload.image_png_base64,'base64');need(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&createHash('sha256').update(bytes).digest('hex')===payload.image_png_sha256,'invalid saved PNG identity');}
 const {image_png_base64,...details}=payload;void image_png_base64;checkedJSON(details,512*1024);
 list(recordValue.geometry,100);list(recordValue.geometry_scope,32);
 need(list(recordValue.sticky_reasons??[],16).every(v=>typeof v==='string'&&v.length<=1000),'invalid saved sticky reasons');
 for(const value of list(recordValue.latest_measurement_refs??[],16)){const ref=row(value);need(id(ref.object_id)&&request(ref.request_id)&&id(ref.source_object_id)&&(ref.annotation_id===undefined||typeof ref.annotation_id==='string'&&ref.annotation_id.length<=64),'invalid saved measurement reference');}
 list(recordValue.pending_anchor_refs??[],16);checkedJSON(recordValue.pending_anchor_refs??[],32*1024);
 // Structure qualification is deliberately NOT inferred from this local JSON.
 need(Buffer.byteLength(JSON.stringify(recordValue))<=4*1024*1024,'saved presentation exceeds bound');
 return {...recordValue,attachment_status:'restored_unvalidated',currentness:'unvalidated_snapshot',currentness_reasons:['Full provider revalidation required after process reopen.']} as CrystalEvidenceEnvelope;
}
