// Read-only coordinate handoff over the saved Panel snapshot. No scientific
// object, scale, annotation or request is created or changed here.
import {selectionRectangle} from '../ui/image-panel/coordinates.mjs';
import type {Rectangle,WireSpatialPanel} from '../ui/image-panel/coordinates.mjs';
import type {IdentityCheckedPanelState} from './panel_manager_contracts.mjs';

type Slots=Record<string,unknown>;
type Anchor={source_object_id:string|null;coordinate_space:string|null;coordinates:readonly number[]|null};
export interface PanelRoiRectangle {
 readonly origin:'saved_annotation'|'current_selection';
 readonly annotation_id:string|null;readonly text:string|null;readonly status:string|null;
 readonly original_anchor:Anchor;readonly usable:boolean;readonly reason:string;
 readonly rect_xyxy?:Rectangle;
}
export interface PanelScientificInput {
 readonly usable:boolean;readonly status:string;readonly reason:string;
 readonly frame_object_id:string|null;readonly calibration_object_id:string|null;
 readonly calibration_revision:number|null;readonly calibration_status:string|null;
 readonly direct_input_object_id:string|null;
 readonly prepare_call:{tool:'image_calibrate';arguments:{object_id:string;calibration_object_id:string};request_id_required:true}|null;
}
export interface PanelRoiHandoff {
 readonly schema_version:1;readonly read_only:true;readonly source_view_object_id:string;
 readonly state_revision:number|null;readonly inspection_status:string;readonly coordinate_policy:string;
 readonly scientific_input:PanelScientificInput;readonly saved_rectangles:readonly PanelRoiRectangle[];
 readonly current_selection:PanelRoiRectangle|null;
 readonly draft_state:{dirty:boolean|null;gesture_active:boolean|null;requires_user_commit:boolean};
}

const slots=(value:unknown):Slots|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Slots:null;
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const boundedText=(value:unknown,max:number):string|null=>typeof value==='string'&&value.length<=max?value:null;
const numbers=(value:unknown):number[]|null=>Array.isArray(value)&&value.length<=4&&value.every((v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v))?[...value]:null;
const rectangle=(value:unknown):Rectangle|null=>{
 const result=numbers(value);return result?.length===4&&result[0]<result[2]&&result[1]<result[3]?[result[0],result[1],result[2],result[3]]:null;
};
const sameRect=(a:Rectangle,b:Rectangle)=>a.every((value,index)=>value===b[index]);

function scientificInput(state:IdentityCheckedPanelState):PanelScientificInput {
 const frame=slots(state.frame_identity),frameId=objectId(frame?.frame_object_id)?frame.frame_object_id:null;
 const calibration=slots(state.object.xy_calibration);
 const calibrationId=objectId(calibration?.calibration_id)?calibration.calibration_id:null;
 const revision=integer(calibration?.revision)&&calibration.revision>=1?calibration.revision:null;
 const status=boundedText(calibration?.status,64);
 const base={frame_object_id:frameId,calibration_object_id:calibrationId,calibration_revision:revision,calibration_status:status,
  direct_input_object_id:null,prepare_call:null};
 if(frameId===null)return {...base,usable:false,status:'unusable',reason:'Missing exact source-frame identity; current display object is not a raw-frame substitute.'};
 if(state.object.xy_calibration===null||state.object.xy_calibration===undefined)return {...base,usable:true,status:'pixel_only',
  reason:'No current physical calibration is declared; retain pixel coordinates and unknown physical scale.',direct_input_object_id:frameId};
 if(!calibration||!calibrationId||revision===null||!['active','withdrawn'].includes(status??'')||calibration.coordinate_domain!=='real_space'){
  return {...base,usable:false,status:'unusable',reason:'Current calibration lacks a usable exact real-space reference; do not fall back to an older frame scale.'};
 }
 return {...base,usable:true,status:status==='active'?'attach_current_calibration':'pixel_only_withdrawn',
  reason:status==='active'?'Explicitly attach the exact current calibration before using full-frame scientific tools; it is not independently verified here.':'Attach the withdrawn record explicitly so an old frame scale is not resurrected; physical scale remains unavailable.',
  prepare_call:{tool:'image_calibrate',arguments:{object_id:frameId,calibration_object_id:calibrationId},request_id_required:true}};
}

function spatialPanels(value:unknown):WireSpatialPanel[] {
 if(!Array.isArray(value)||value.length>32)return [];
 const result:WireSpatialPanel[]=[];
 for(const valuePanel of value){
  const panel=slots(valuePanel),source=rectangle(panel?.source_rect_xyxy),image=rectangle(panel?.image_rect_xyxy);
  if(panel?.domain==='spatial_pixels'&&objectId(panel.source_object_id)&&source&&image){
   result.push({domain:'spatial_pixels',source_object_id:panel.source_object_id,source_rect_xyxy:source,image_rect_xyxy:image});
  }
 }
 return result;
}

function handoffRectangle(value:unknown,origin:PanelRoiRectangle['origin'],panels:readonly WireSpatialPanel[],frameId:string|null):PanelRoiRectangle {
 const row=slots(value),anchor=origin==='saved_annotation'?slots(row?.anchor):row;
 const coordinates=numbers(anchor?.coordinates);
 const base={origin,annotation_id:origin==='saved_annotation'?boundedText(row?.annotation_id,64):null,
  text:origin==='saved_annotation'?boundedText(row?.text,256):null,status:origin==='saved_annotation'?boundedText(row?.status,64):null,
  original_anchor:{source_object_id:objectId(anchor?.source_object_id)?anchor.source_object_id:null,
   coordinate_space:boundedText(anchor?.coordinate_space,64),coordinates}};
 const refused=(reason:string):PanelRoiRectangle=>({...base,usable:false,reason});
 if(row?.kind!=='rectangle'||!coordinates||coordinates.length!==4||!rectangle(coordinates))return refused('A finite increasing rectangle is required.');
 if(origin==='saved_annotation'&&base.annotation_id===null)return refused('Saved rectangle has no bounded annotation identity.');
 if(base.status==='retracted')return refused('Retracted rectangles are historical and are not selected for new analysis.');
 if(frameId===null||base.original_anchor.source_object_id!==frameId)return refused('Rectangle does not name the exact current source-frame grid.');
 if(base.original_anchor.coordinate_space!=='source_pixels')return refused('Only spatial source-pixel rectangles can enter this handoff; frequency and imported array coordinates remain distinct.');
 let matches=panels.filter(panel=>panel.source_object_id===frameId);
 if(origin==='current_selection'){
  const selected=slots(row?.panel),selectedSource=rectangle(selected?.source_rect_xyxy),selectedImage=rectangle(selected?.image_rect_xyxy);
  if(selected?.domain!=='spatial_pixels'||selected.source_object_id!==frameId||!selectedSource||!selectedImage)return refused('Current selection has no exact spatial panel mapping.');
  matches=matches.filter(panel=>sameRect(panel.source_rect_xyxy,selectedSource)&&sameRect(panel.image_rect_xyxy,selectedImage));
 }
 if(matches.length!==1)return refused('Exactly one matching current spatial panel is required; no panel is guessed.');
 try{
  // This is the identical edge conversion used by the Panel ROI/FFT actions.
  const rect=selectionRectangle({kind:'rectangle',coordinate_space:'source_pixels',source_object_id:frameId,coordinates,panel:matches[0]});
  return {...base,usable:true,reason:'Bounded outward integer-pixel edges; original annotation coordinates are unchanged.',rect_xyxy:[rect[0],rect[1],rect[2],rect[3]]};
 }catch{return refused('Rectangle lies outside the current source window or has no nonempty integer extent; no clipping is applied.');}
}

export function panelRoiHandoff(state:IdentityCheckedPanelState):PanelRoiHandoff {
 const input=scientificInput(state),allMarks=state.object.annotations,marks:unknown[]=Array.isArray(allMarks)&&allMarks.length<=100?allMarks:[];
 const panels=spatialPanels(state.object.panels),draft=slots(state.edit_state);
 const dirty=typeof draft?.dirty==='boolean'?draft.dirty:null,gesture=typeof draft?.gesture_active==='boolean'?draft.gesture_active:null;
 const inspection=Array.isArray(allMarks)&&allMarks.length>100?'annotation_budget_exceeded':Array.isArray(state.object.panels)&&state.object.panels.length>32?'panel_budget_exceeded':'bounded_snapshot';
 return {schema_version:1,read_only:true,source_view_object_id:state.object.object_id,state_revision:integer(state.state_revision)?state.state_revision:null,
  inspection_status:inspection,coordinate_policy:'Existing selectionRectangle: outward half-open integer source-pixel edges; preserved fractional anchors; no clamp, physical scale, frame or panel is inferred.',
  scientific_input:input,saved_rectangles:marks.filter(mark=>slots(mark)?.kind==='rectangle').map(mark=>handoffRectangle(mark,'saved_annotation',panels,input.frame_object_id)),
  current_selection:state.selection===null||state.selection===undefined?null:handoffRectangle(state.selection,'current_selection',panels,input.frame_object_id),
  draft_state:{dirty,gesture_active:gesture,requires_user_commit:dirty===true||gesture===true||draft?.annotation_edit!==null&&draft?.annotation_edit!==undefined}};
}
