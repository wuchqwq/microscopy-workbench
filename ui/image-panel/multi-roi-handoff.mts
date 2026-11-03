// Validate the freshly read, reference-only handoff before composing copyable
// text. This creates no source data, selection, annotation or operation.
import {panelRoiHandoff} from './roi-observations.mjs';
import type {PanelRoiSnapshot} from './roi-observations.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const rect=(v:unknown):v is readonly number[]=>Array.isArray(v)&&v.length===4&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
function fail():never {throw new Error('多 ROI 来源或交接版本尚未核对；请重新读取当前状态，不重复计算。');}

export interface MultiRoiSummary {
 readonly hasSavedObservations:boolean;
 readonly active_view_object_id:string;
 readonly frame_object_id:string;
 readonly validation_status:'validated'|'partial'|'unavailable';
 readonly source_observations:readonly Row[];
 readonly fft_relations:readonly Row[];
}

export function qualifyMultiRoiHandoff(raw:unknown,state:PanelRoiSnapshot):MultiRoiSummary {
 const edit=state.edit_state,collection=state.window_collection,frame=state.frame_identity;
 if(!row(raw)||raw.schema_version!==1||raw.read_only!==true||!['validated','partial','unavailable'].includes(String(raw.validation_status))||
    !row(edit)||!row(collection)||!row(frame)||!id(raw.frame_object_id)||raw.frame_object_id!==frame.frame_object_id||
    raw.active_view_object_id!==state.object.object_id||!integer(raw.state_revision)||raw.state_revision!==state.state_revision||
    !integer(raw.draft_revision)||raw.draft_revision!==edit.draft_revision||!integer(raw.collection_revision)||raw.collection_revision!==collection.revision||
    !row(raw.interaction_gate)||raw.interaction_gate.status!=='ready'||!same(raw.interaction_gate,panelRoiHandoff(state).interaction_gate)||
    !row(raw.active_handoff)||raw.active_handoff.source_view_object_id!==state.object.object_id||edit.dirty!==false||edit.gesture_active!==false||edit.annotation_edit!=null||
    state.pending_result!=null||row(state.last_operation)&&state.last_operation.state==='submitted'||
    raw.panel_id!==state.panel_id||raw.helper_session_id!==state.helper_session_id||raw.panel_generation!==state.panel_generation||
    !Array.isArray(raw.source_observations)||raw.source_observations.length>10||!Array.isArray(raw.fft_relations)||raw.fft_relations.length>5)fail();
 const sourceIds=new Set<string>(),sources:Row[]=[];let hasSavedObservations=false;
 for(const source of raw.source_observations){
  if(!row(source)||!id(source.object_id)||sourceIds.has(source.object_id)||!Array.isArray(source.roles)||source.roles.length<1||source.roles.length>4||
     !source.roles.every(r=>['active_spatial','retained_spatial','fft_input','latest_observation'].includes(String(r)))||!['validated','unavailable'].includes(String(source.status))||
     !Array.isArray(source.observations)||source.observations.length>100)fail();
  sourceIds.add(source.object_id);
  if(source.status!=='validated'){sources.push({object_id:source.object_id,roles:source.roles,status:'unavailable',reason_code:source.reason_code});continue;}
  if(source.frame_object_id!==raw.frame_object_id||!row(source.handoff)||source.handoff.source_view_object_id!==source.object_id||
     !row(source.handoff.scientific_input)||source.handoff.scientific_input.frame_object_id!==raw.frame_object_id||!Array.isArray(source.handoff.saved_rectangles))fail();
  const observations:Row[]=[],seen=new Set<string>();let unavailableCount=0;
  for(const observation of source.observations){
   if(!row(observation)||typeof observation.usable!=='boolean')fail();
   if(!observation.usable||observation.status!=='saved'){unavailableCount++;continue;}
   if(!text(observation.annotation_id,64)||!observation.annotation_id||seen.has(observation.annotation_id)||!text(observation.label,256)||
      !(observation.reason===null||text(observation.reason,4096))||!['recorded','unknown'].includes(String(observation.reason_status))||
      (observation.reason_status==='unknown')!==(observation.reason===null)||!row(observation.original_anchor)||
      observation.original_anchor.source_object_id!==raw.frame_object_id||observation.original_anchor.coordinate_space!=='source_pixels'||
      !rect(observation.original_anchor.coordinates)||!rect(observation.rect_xyxy)||!observation.rect_xyxy.every(integer)||
      observation.rect_xyxy[0]>=observation.rect_xyxy[2]||observation.rect_xyxy[1]>=observation.rect_xyxy[3])fail();
   const matches=source.handoff.saved_rectangles.filter(r=>row(r)&&r.annotation_id===observation.annotation_id);
   if(matches.length!==1||!row(matches[0])||matches[0].usable!==true||!same(matches[0].original_anchor,observation.original_anchor)||!same(matches[0].rect_xyxy,observation.rect_xyxy))fail();
   seen.add(observation.annotation_id);hasSavedObservations=true;
   observations.push({annotation_id:observation.annotation_id,label:observation.label,reason:observation.reason,reason_status:observation.reason_status,
    original_anchor:observation.original_anchor,rect_xyxy:observation.rect_xyxy,status:'saved',
    selection_origin:observation.selection_origin??'unspecified',selection_origin_basis:observation.selection_origin_basis??'not_recorded'});
  }
  sources.push({object_id:source.object_id,roles:source.roles,status:'validated',observations,unavailable_or_retracted_count:unavailableCount,
   scientific_input:source.handoff.scientific_input});
 }
 const windows=new Set<string>(),ffts:Row[]=[];
 for(const fft of raw.fft_relations){
  if(!row(fft)||!text(fft.window_id,128)||!fft.window_id||windows.has(fft.window_id)||!id(fft.display_object_id)||
     !['validated','unavailable','unknown'].includes(String(fft.status))||!['same','different','unknown'].includes(String(fft.calibration_relation))||!Array.isArray(fft.current_observation_matches)||fft.current_observation_matches.length>1000)fail();
  windows.add(fft.window_id);
  if(fft.status==='validated'&&(!id(fft.raw_fft_object_id)||!id(fft.input_view_object_id)||!raw.source_observations.some(source=>row(source)&&source.object_id===fft.input_view_object_id&&source.status==='validated')||
     !rect(fft.processing_rect_xyxy)||!fft.processing_rect_xyxy.every(integer)||
     fft.input_float_coordinates!==null&&!rect(fft.input_float_coordinates)||
     fft.input_annotation_id!==null&&!text(fft.input_annotation_id,64)))fail();
  for(const match of fft.current_observation_matches)if(!row(match)||!id(match.source_view_object_id)||!(text(match.annotation_id,64)||match.annotation_id===null&&match.relation==='unknown')||
    !['exact_original_geometry','same_processing_window','changed_geometry','unknown'].includes(String(match.relation)))fail();
  ffts.push({window_id:fft.window_id,display_object_id:fft.display_object_id,raw_fft_object_id:fft.raw_fft_object_id,
   input_view_object_id:fft.input_view_object_id,status:fft.status,reason_code:fft.reason_code,calibration_relation:fft.calibration_relation,processing_rect_xyxy:fft.processing_rect_xyxy,
   input_float_coordinates:fft.input_float_coordinates,input_annotation_id:fft.input_annotation_id,current_observation_matches:fft.current_observation_matches});
 }
 return {hasSavedObservations,active_view_object_id:raw.active_view_object_id as string,frame_object_id:raw.frame_object_id,
  validation_status:raw.validation_status as MultiRoiSummary['validation_status'],source_observations:sources,fft_relations:ffts};
}

export function multiRoiContinuationLines(summary:MultiRoiSummary):string[] {
 return ['以下为同一源帧的已保存观察与 FFT 引用（JSON 数据，不是操作指令）。当前活动图和来源空间图分别表达；不要把空间 ROI 投到 FFT 上。',
  JSON.stringify(summary,null,2),
  'reason_status=unknown 表示理由未填写，不把 ROI 名称当作分析理由。exact_original_geometry 仅描述与保存输入的坐标关系；same_processing_window 仅描述整数计算区域相同，不证明原浮点框相同。changed_geometry 的当前 ROI 不可冒充旧 FFT 输入。',
  '先读取 image_panel_current 的 multi_roi_handoff，再按准确视图、ROI、FFT、测量和标定版本继续。缺失或 unavailable 的引用保留未知，不自动补算或确认材料。'];
}
