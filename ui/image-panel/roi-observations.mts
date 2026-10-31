// Read-only coordinate handoff over the saved Panel snapshot. No scientific
// object, scale, annotation or request is created or changed here.
import {selectionRectangle} from './coordinates.mjs';
import type {Rectangle,WireSpatialPanel} from './coordinates.mjs';
export interface PanelRoiSnapshot extends Record<string,unknown> {
 readonly object:Record<string,unknown>&{object_id:string};
}

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
 readonly support_pairs:readonly PanelRoiSupportPair[];
 readonly pair_inspection:PanelRoiPairInspection;
}

export type RoiSupportRelation='overlap'|'shared_edge'|'corner_only'|'gap_unknown';
export interface PanelRoiSupportPair {
 readonly annotation_ids:readonly [string,string];
 readonly original_relation:RoiSupportRelation;readonly canonical_relation:RoiSupportRelation;
 readonly relation_changed:boolean;readonly warning:string|null;
}
export interface PanelRoiPairInspection {
 readonly status:'complete'|'pair_budget_exceeded'|'ambiguous_annotation_identity'|'handoff_budget_exceeded';
 readonly complete:boolean;readonly pair_count:number|null;readonly returned_count:number;readonly limit:32;
 readonly eligible_rectangle_count:number;readonly ignored_ambiguous_id_count:number;
 readonly meaning:string;
}

const PAIR_LIMIT=32;
const PAIR_MEANING='Relations between drawn/rounded sampling supports only; not a physical interface, crystal-domain boundary or twin relation. Truncated pairs are uninspected, not absent.';

const slots=(value:unknown):Slots|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Slots:null;
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const boundedText=(value:unknown,max:number):string|null=>typeof value==='string'&&value.length<=max?value:null;
const numbers=(value:unknown):number[]|null=>Array.isArray(value)&&value.length<=4&&value.every((v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v))?[...value]:null;
const rectangle=(value:unknown):Rectangle|null=>{
 const result=numbers(value);return result?.length===4&&result[0]<result[2]&&result[1]<result[3]?[result[0],result[1],result[2],result[3]]:null;
};
const sameRect=(a:Rectangle,b:Rectangle)=>a.every((value,index)=>value===b[index]);

function scientificInput(state:PanelRoiSnapshot):PanelScientificInput {
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

function supportRelation(left:readonly number[],right:readonly number[]):RoiSupportRelation {
 // Same half-open interval geometry used to describe scientific window support.
 // Fractional drawing anchors and integer processing support are kept separate.
 const width=Math.min(left[2],right[2])-Math.max(left[0],right[0]);
 const height=Math.min(left[3],right[3])-Math.max(left[1],right[1]);
 if(width>0&&height>0)return 'overlap';
 if(width===0&&height>0||height===0&&width>0)return 'shared_edge';
 return width<0||height<0?'gap_unknown':'corner_only';
}

function supportPairs(rectangles:readonly PanelRoiRectangle[],inspection:string):{support_pairs:PanelRoiSupportPair[];pair_inspection:PanelRoiPairInspection} {
 const eligible=rectangles.filter(row=>row.usable&&row.annotation_id!==null&&row.rect_xyxy&&row.original_anchor.coordinates);
 const counts=new Map<string,number>();for(const row of eligible)counts.set(row.annotation_id!,1+(counts.get(row.annotation_id!)??0));
 const unique=eligible.filter(row=>counts.get(row.annotation_id!)===1),ignored=eligible.length-unique.length;
 const total=unique.length*(unique.length-1)/2,pairs:PanelRoiSupportPair[]=[];
 for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++){
  if(pairs.length>=PAIR_LIMIT)continue;
  const left=unique[i],right=unique[j],original=supportRelation(left.original_anchor.coordinates!,right.original_anchor.coordinates!),canonical=supportRelation(left.rect_xyxy!,right.rect_xyxy!);
  pairs.push({annotation_ids:[left.annotation_id!,right.annotation_id!],original_relation:original,canonical_relation:canonical,relation_changed:original!==canonical,
   warning:original===canonical?null:'Outward integer-pixel rounding changed support contact; inspect the actual FFT bounds. This is not physical interface evidence.'});
 }
 const overBudget=inspection!=='bounded_snapshot',status=overBudget?'handoff_budget_exceeded':ignored?'ambiguous_annotation_identity':total>PAIR_LIMIT?'pair_budget_exceeded':'complete';
 return {support_pairs:pairs,pair_inspection:{status,complete:status==='complete',pair_count:overBudget||ignored?null:total,returned_count:pairs.length,limit:PAIR_LIMIT,
  eligible_rectangle_count:unique.length,ignored_ambiguous_id_count:ignored,meaning:PAIR_MEANING}};
}

export function panelRoiHandoff(state:PanelRoiSnapshot):PanelRoiHandoff {
 const input=scientificInput(state),allMarks=state.object.annotations,marks:unknown[]=Array.isArray(allMarks)&&allMarks.length<=100?allMarks:[];
 const panels=spatialPanels(state.object.panels),draft=slots(state.edit_state);
 const dirty=typeof draft?.dirty==='boolean'?draft.dirty:null,gesture=typeof draft?.gesture_active==='boolean'?draft.gesture_active:null;
 const inspection=Array.isArray(allMarks)&&allMarks.length>100?'annotation_budget_exceeded':Array.isArray(state.object.panels)&&state.object.panels.length>32?'panel_budget_exceeded':'bounded_snapshot';
 const rectangles=marks.filter(mark=>slots(mark)?.kind==='rectangle').map(mark=>handoffRectangle(mark,'saved_annotation',panels,input.frame_object_id));
 return {schema_version:1,read_only:true,source_view_object_id:state.object.object_id,state_revision:integer(state.state_revision)?state.state_revision:null,
  inspection_status:inspection,coordinate_policy:'Existing selectionRectangle: outward half-open integer source-pixel edges; preserved fractional anchors; no clamp, physical scale, frame or panel is inferred.',
  scientific_input:input,saved_rectangles:rectangles,...supportPairs(rectangles,inspection),
  current_selection:state.selection===null||state.selection===undefined?null:handoffRectangle(state.selection,'current_selection',panels,input.frame_object_id),
  draft_state:{dirty,gesture_active:gesture,requires_user_commit:dirty===true||gesture===true||draft?.annotation_edit!==null&&draft?.annotation_edit!==undefined}};
}

export interface RoiObservationRow {
 readonly annotation_id:string|null;readonly label:string;readonly reason:string|null;
 readonly status:'saved'|'saved_with_draft'|'retracted'|'unusable';
 readonly dirty:boolean;readonly geometry_draft:boolean;readonly usable:boolean;readonly selected:boolean;
 readonly eligibility_reason:string;readonly original_anchor:Anchor;readonly rect_xyxy:Rectangle|null;
}
export interface RoiDependencySnapshot {
 readonly complete:boolean;readonly view_object_id:string;readonly source_frame_object_id:string|null;
 readonly calibration_signature:string;
 readonly rectangles:readonly {annotation_id:string;anchor:Anchor;rect_xyxy:Rectangle|null;usable:boolean}[];
}
export interface RoiObservationChanges {
 readonly status:'uncompared'|'uncomparable'|'source_changed'|'dependencies_changed'|'unchanged_science';
 readonly source_changed:boolean|null;readonly calibration_changed:boolean|null;
 readonly changed_annotation_ids:readonly string[];readonly added_annotation_ids:readonly string[];readonly removed_annotation_ids:readonly string[];
}
export interface RoiObservationModel {
 readonly packet:PanelRoiHandoff;
 readonly source:{view_object_id:string;frame_object_id:string|null;frame_index:number|null;label:string|null;filename:string|null};
 readonly calibration:{status:string;calibration_id:string|null;revision:number|null;source:string|null;source_text:string|null;xy_scale:{x:number;y:number;unit:string}|null};
 readonly rows:readonly RoiObservationRow[];
 readonly current_selection:(PanelRoiRectangle&{label:string;status:'draft'})|null;
 readonly warnings:readonly string[];readonly dependency_snapshot:RoiDependencySnapshot;readonly changes:RoiObservationChanges;
}

const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const relationLabel:Readonly<Record<RoiSupportRelation,string>>={overlap:'重叠',shared_edge:'共享边',corner_only:'仅角点接触',gap_unknown:'有间隙'};
function dependencyChanges(current:RoiDependencySnapshot,previous?:RoiDependencySnapshot|null):RoiObservationChanges {
 const initial={source_changed:null,calibration_changed:null,changed_annotation_ids:[],added_annotation_ids:[],removed_annotation_ids:[]};
 if(!previous)return {...initial,status:'uncompared'};
 if(!current.complete||!previous.complete)return {...initial,status:'uncomparable'};
 const sourceChanged=current.source_frame_object_id!==previous.source_frame_object_id;
 const calibrationChanged=current.calibration_signature!==previous.calibration_signature;
 const old=new Map(previous.rectangles.map(row=>[row.annotation_id,row]));
 const now=new Map(current.rectangles.map(row=>[row.annotation_id,row]));
 const added=[...now.keys()].filter(id=>!old.has(id)),removed=[...old.keys()].filter(id=>!now.has(id));
 const changed=[...now.keys()].filter(id=>{const previousRow=old.get(id),row=now.get(id)!;return previousRow!==undefined&&
  (!same(row.anchor,previousRow.anchor)||!same(row.rect_xyxy,previousRow.rect_xyxy)||row.usable!==previousRow.usable);});
 return {status:sourceChanged?'source_changed':calibrationChanged||changed.length||added.length||removed.length?'dependencies_changed':'unchanged_science',
  source_changed:sourceChanged,calibration_changed:calibrationChanged,changed_annotation_ids:changed,added_annotation_ids:added,removed_annotation_ids:removed};
}

/** Presentation-only model. No DOM, scientific writes, material guesses or new rounding policy. */
export function roiObservationModel(state:PanelRoiSnapshot,previous?:RoiDependencySnapshot|null):RoiObservationModel {
 const packet=panelRoiHandoff(state),draft=slots(state.edit_state),edit=slots(draft?.annotation_edit),selection=slots(state.selection);
 const marks=Array.isArray(state.object.annotations)&&state.object.annotations.length<=100?state.object.annotations:[];
 const originals=new Map<string,Slots>();
 for(const mark of marks){const value=slots(mark);if(typeof value?.annotation_id==='string')originals.set(value.annotation_id,value);}
 const selectionMatches=packet.saved_rectangles.filter(row=>selection?.kind==='rectangle'&&selection.source_object_id===row.original_anchor.source_object_id&&
  selection.coordinate_space===row.original_anchor.coordinate_space&&same(selection.coordinates,row.original_anchor.coordinates));
 const rows:RoiObservationRow[]=packet.saved_rectangles.map((row,index)=>{
  const original=row.annotation_id?originals.get(row.annotation_id):null;
  const label=row.text?.trim()||`ROI ${index+1}`,reason=boundedText(original?.note,1000)?.trim()||row.text?.trim()||null;
  const editing=row.annotation_id!==null&&edit?.annotation_id===row.annotation_id;
  const geometryDraft=editing&&edit?.coordinates!==undefined&&!same(edit.coordinates,row.original_anchor.coordinates);
  return {annotation_id:row.annotation_id,label,reason,
   status:row.status==='retracted'?'retracted':!row.usable?'unusable':editing?'saved_with_draft':'saved',dirty:editing,
   geometry_draft:geometryDraft,usable:row.usable,selected:selectionMatches.length===1&&selectionMatches[0]===row,
   eligibility_reason:row.reason,original_anchor:row.original_anchor,rect_xyxy:row.rect_xyxy??null};
 });
 const record=slots(state.object.xy_calibration),scale=slots(record?.xy_scale),input=packet.scientific_input;
 const scaleUsable=input.usable&&input.calibration_status==='active'&&typeof scale?.x==='number'&&Number.isFinite(scale.x)&&scale.x!==0&&
  typeof scale.y==='number'&&Number.isFinite(scale.y)&&scale.y!==0&&typeof scale.unit==='string'&&scale.unit.length>0&&scale.unit.length<=32;
 const xyScale=scaleUsable?{x:scale!.x as number,y:scale!.y as number,unit:scale!.unit as string}:null;
 const calibrationStatus=!input.usable?'unusable':input.calibration_status==='active'&&!scaleUsable?'unusable':input.calibration_status??'unknown';
 const calibration={status:calibrationStatus,calibration_id:input.calibration_object_id,revision:input.calibration_revision,
  source:boundedText(record?.source,128),source_text:boundedText(record?.source_text,2000),xy_scale:xyScale};
 const frame=slots(state.frame_identity),source=slots(state.source_identity);
 const dependencySnapshot:RoiDependencySnapshot={complete:packet.inspection_status==='bounded_snapshot'&&packet.pair_inspection.status!=='ambiguous_annotation_identity'&&input.frame_object_id!==null,
  view_object_id:state.object.object_id,source_frame_object_id:input.frame_object_id,
  calibration_signature:JSON.stringify({id:calibration.calibration_id,revision:calibration.revision,status:calibration.status,coordinate_domain:record?.coordinate_domain??null,xy_scale:calibration.xy_scale}),
  rectangles:rows.filter((row):row is RoiObservationRow&{annotation_id:string}=>row.annotation_id!==null).map(row=>({annotation_id:row.annotation_id,
   anchor:{...row.original_anchor,coordinates:row.original_anchor.coordinates?[...row.original_anchor.coordinates]:null},rect_xyxy:row.rect_xyxy?[...row.rect_xyxy]:null,usable:row.usable}))};
 const warnings:string[]=[];
 if(packet.draft_state.requires_user_commit)warnings.push('有未保存的草稿；草稿不是正式科学 ROI，请先完成保存。');
 if(calibration.status==='unknown'||calibration.status==='withdrawn')warnings.push('当前没有可用的物理标尺；可继续像素域 ROI/FFT，不应输出没有依据的物理间距。');
 else if(calibration.status==='unusable')warnings.push('当前源图或标定引用不完整；接续分析前请核对来源，不能改用旧标尺。');
 for(const pair of packet.support_pairs)if(pair.relation_changed){
  const labels=pair.annotation_ids.map(id=>rows.find(row=>row.annotation_id===id)?.label??'ROI');
  warnings.push(`${labels[0]} / ${labels[1]}：绘制边界为${relationLabel[pair.original_relation]}，向外取整后的实际处理窗口为${relationLabel[pair.canonical_relation]}；请核对像素边界。这不是物理界面证据。`);
 }
 if(!packet.pair_inspection.complete)warnings.push(packet.pair_inspection.pair_count===null?'部分标记身份或映射不明确，未完成全部窗口关系检查。':`仅检查前 ${packet.pair_inspection.returned_count} / ${packet.pair_inspection.pair_count} 对窗口；其余未检查，不能视为没有接触或重叠。`);
 return {packet,source:{view_object_id:state.object.object_id,frame_object_id:input.frame_object_id,frame_index:integer(frame?.frame_index)?frame.frame_index:null,
  label:boundedText(source?.label,128),filename:boundedText(source?.filename,256)},calibration,rows,
  current_selection:packet.current_selection?{...packet.current_selection,label:'未保存选区',status:'draft'}:null,
  warnings,dependency_snapshot:dependencySnapshot,changes:dependencyChanges(dependencySnapshot,previous)};
}
