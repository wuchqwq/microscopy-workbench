// Read-only presentation of existing, server-qualified references. This module
// owns no scientific identity, index, computation, selection or permission gate.
import {outwardSourceRectangle} from './coordinates.mjs';
import {readWindowCollection} from './window-workspace.mjs';
import type {WindowCollection,WindowEntry} from './window-workspace.mjs';
type Row=Readonly<Record<string,unknown>>;
type Rect=readonly [number,number,number,number];
export interface RelationSelection {annotation_id?:string|null;selection?:unknown;pending_geometry?:boolean;}
export type RelationViewTarget={kind:'window';window_id:string;object_id:string;collection_revision:number}|{kind:'show';object_id:string;input_reference:{kind:'execution';request_id:string}};
export interface RelationInputTarget {kind:'show';object_id:string;}
export type SelectionFftRelation='original_roi'|'same_float'|'changed_geometry'|'same_support'|'unknown';
export interface SelectionFftRelationRow {
 key:string;label:string;relation:SelectionFftRelation;historical:boolean;reason:string;
 raw_fft_object_id:string|null;display_object_id:string|null;input_view_object_id:string|null;
 input_annotation_id:string|null;input_float_coordinates:Rect|null;processing_rect_xyxy:Rect|null;
 source_object_id:string|null;coordinate_space:'source_pixels';
 calibration_relation:'same'|'different'|'unknown';recipe:{window:'none'|'hann';subtract_mean:boolean}|null;
 canReuse:false;viewTarget:RelationViewTarget|null;inputTarget:RelationInputTarget|null;
}
export interface SelectionFftRelationsModel {
 status:'idle'|'ready'|'partial'|'unavailable';mode:'none'|'roi'|'fft';message:string;
 rows:readonly SelectionFftRelationRow[];pending_geometry:boolean;warnings:readonly string[];
}
export type SelectionFftReadUrl=`/api/roi-handoff?${string}`|'/api/execution-history';
export interface SelectionFftRelationsOptions {
 getState:()=>unknown;getSelection:()=>RelationSelection|null;
 api:(url:SelectionFftReadUrl)=>Promise<unknown>;onChange?:(model:SelectionFftRelationsModel)=>unknown;
}
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const markId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const rect=(v:unknown):v is Rect=>Array.isArray(v)&&v.length===4&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&v[0]<v[2]&&v[1]<v[3];
const support=(v:unknown):v is Rect=>rect(v)&&v.every(int);
const canonical=(v:unknown):string=>JSON.stringify(v,(_key,item)=>row(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const same=(a:unknown,b:unknown)=>canonical(a??null)===canonical(b??null);
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
function need(ok:unknown,reason:string):asserts ok {if(!ok)throw new Error(reason);}
const unavailable=(reason:string):SelectionFftRelationsModel=>({status:'unavailable',mode:'none',message:reason,rows:[],pending_geometry:false,warnings:[reason]});
interface Snapshot {raw:Row;object:Row;collection:WindowCollection;frame:string;envelope:Row;}
function snapshot(raw:unknown):Snapshot {
 need(row(raw)&&row(raw.object)&&id(raw.object.object_id)&&row(raw.frame_identity)&&id(raw.frame_identity.frame_object_id)&&row(raw.edit_state)&&int(raw.edit_state.draft_revision)&&int(raw.state_revision),'当前图像、源帧或编辑版本尚未核对。');
 const object=raw.object,collection=readWindowCollection(raw.window_collection);need(collection&&collection.frame_object_id===raw.frame_identity.frame_object_id,'窗口与来源帧尚未核对。');
 need(collection.active_window_id===null||collection.windows.some(w=>w.window_id===collection.active_window_id&&w.object_id===object.object_id),'活动图像身份不一致。');
 need(raw.panel_id===null||id(raw.panel_id),'面板身份尚未核对。');
 need(raw.helper_session_id===undefined||raw.helper_session_id===null||id(raw.helper_session_id),'后台身份尚未核对。');
 need(raw.panel_generation===undefined||raw.panel_generation===null||int(raw.panel_generation),'后台代次尚未核对。');
 const envelope={panel_id:raw.panel_id,helper_session_id:raw.helper_session_id??null,panel_generation:raw.panel_generation??null,active_view_object_id:raw.object.object_id,frame_object_id:raw.frame_identity.frame_object_id,state_revision:raw.state_revision,draft_revision:raw.edit_state.draft_revision,collection_revision:collection.revision};
 return {raw,object:raw.object,collection,frame:raw.frame_identity.frame_object_id,envelope};
}
function checkEnvelope(packet:unknown,s:Snapshot):asserts packet is Row {
 need(row(packet)&&packet.schema_version===1&&packet.read_only===true&&['validated','partial','unavailable'].includes(String(packet.validation_status)),'来源关系未返回可核对的只读记录。');
 for(const [key,value]of Object.entries(s.envelope))need(same(packet[key],value),'来源关系属于另一图像、后台或编辑版本；请重新读取。');
 need(Array.isArray(packet.source_observations)&&packet.source_observations.length<=10&&Array.isArray(packet.fft_relations)&&packet.fft_relations.length<=5,'来源关系超过既有读取预算，未能列全。');
}
interface Candidate {raw:string;display:string;source:string;frame:string;annotation:string|null;float:Rect|null;support:Rect;window:WindowEntry|null;request:string|null;calibration:unknown;calibrationKnown:boolean;recipe:SelectionFftRelationRow['recipe'];qualified:boolean;reason:string;}
function sourceRows(packet:Row,frame:string):Map<string,Row> {
 const result=new Map<string,Row>();
 for(const source of packet.source_observations as unknown[]){
  need(row(source)&&id(source.object_id)&&!result.has(source.object_id),'来源空间视图身份重复或不明确。');result.set(source.object_id,source);
  if(source.status!=='validated')continue;
  need(source.frame_object_id===frame&&row(source.handoff)&&source.handoff.source_view_object_id===source.object_id&&row(source.handoff.scientific_input)&&source.handoff.scientific_input.frame_object_id===frame&&Array.isArray(source.handoff.saved_rectangles)&&Array.isArray(source.observations)&&source.observations.length<=100,'来源 ROI 证明不完整。');
  const seen=new Set<string>();for(const mark of source.observations){if(!row(mark)||mark.usable!==true)continue;
   need(mark.status==='saved'&&markId(mark.annotation_id)&&!seen.has(mark.annotation_id)&&row(mark.original_anchor)&&mark.original_anchor.source_object_id===frame&&mark.original_anchor.coordinate_space==='source_pixels'&&rect(mark.original_anchor.coordinates)&&support(mark.rect_xyxy)&&same(outwardSourceRectangle(mark.original_anchor.coordinates),mark.rect_xyxy),'来源 ROI 坐标或身份未通过核对。');seen.add(mark.annotation_id);
   const matches=source.handoff.saved_rectangles.filter(r=>row(r)&&r.annotation_id===mark.annotation_id);need(matches.length===1&&row(matches[0])&&matches[0].usable===true&&same(matches[0].original_anchor,mark.original_anchor)&&same(matches[0].rect_xyxy,mark.rect_xyxy),'来源 ROI 与保存记录不一致。');
  }
 }
 return result;
}
function recipe(value:unknown):SelectionFftRelationRow['recipe'] {return row(value)&&['none','hann'].includes(String(value.window))&&typeof value.subtract_mean==='boolean'?{window:value.window as 'none'|'hann',subtract_mean:value.subtract_mean}:null;}
function candidates(s:Snapshot,packet:Row,history:unknown,warnings:string[]):Candidate[] {
 const sources=sourceRows(packet,s.frame),all=[...s.collection.windows,...s.collection.closed_windows??[]],result=new Map<string,Candidate>();
 for(const value of packet.fft_relations as unknown[]){
  need(row(value)&&typeof value.window_id==='string'&&id(value.display_object_id)&&['validated','unknown','unavailable'].includes(String(value.status)),'FFT 来源关系格式不完整。');
  const window=s.collection.windows.find(w=>w.window_id===value.window_id&&w.object_id===value.display_object_id&&w.role==='fft');need(window,'FFT 来源关系与当前窗口版本不一致。');
  if(!id(value.raw_fft_object_id)||!id(value.input_view_object_id)||!support(value.processing_rect_xyxy)){warnings.push('有 FFT 缺少原始输入引用，关联未知。');continue;}
  need(!result.has(value.raw_fft_object_id),'FFT 来源身份重复。');
  const source=sources.get(value.input_view_object_id),known=value.status==='validated'&&source?.status==='validated';
  need(value.input_float_coordinates===null||rect(value.input_float_coordinates),'原浮点 ROI 格式不正确。');need(value.input_annotation_id===null||markId(value.input_annotation_id),'原 ROI 身份不正确。');
  if(rect(value.input_float_coordinates))need(same(outwardSourceRectangle(value.input_float_coordinates),value.processing_rect_xyxy),'浮点 ROI 与实际处理范围不一致。');
  if(value.input_annotation_id!==null&&rect(value.input_float_coordinates)&&known){const matches=(source!.observations as Row[]).filter(m=>m.annotation_id===value.input_annotation_id&&m.usable===true&&row(m.original_anchor)&&same(m.original_anchor.coordinates,value.input_float_coordinates));need(matches.length===1,'原 ROI 身份未匹配其保存几何。');}
  result.set(value.raw_fft_object_id,{raw:value.raw_fft_object_id,display:value.display_object_id,source:value.input_view_object_id,frame:s.frame,annotation:value.input_annotation_id as string|null,float:value.input_float_coordinates as Rect|null,support:value.processing_rect_xyxy,window,request:null,calibration:null,calibrationKnown:false,recipe:known?recipe(value.recipe):null,qualified:known,reason:known?'':'FFT 保存来源尚无法核对。'});
 }
 if(!row(history)||history.schema_version!==1||history.read_only!==true||!Array.isArray(history.records)||history.records.length>512){warnings.push('执行历史不可用或超过预算，未能列全对应结果。');return [...result.values()];}
 const requests=new Set<string>(),ffts=new Set<string>();for(const value of history.records){
  if(!row(value)||value.qualification!=='validated'||value.status!=='completed'){warnings.push('历史中有未知、旧版或未完成输入证明；不能判定没有对应结果。');continue;}
  const input=value.input_snapshot;
  if(value.kind!=='gui_fft_input_v1'||!id(value.fft_object_id)||typeof value.request_id!=='string'||!/^panel-[a-f0-9]{32}-[1-9][0-9]{0,15}$/.test(value.request_id)||!hash(value.input_sha256)||!row(input)||input.schema_version!==1||!id(input.source_view_object_id)||!id(input.provider_input_object_id)||!id(input.frame_object_id)||!rect(input.float_roi_xyxy)||!support(input.processing_rect_xyxy)||!same(outwardSourceRectangle(input.float_roi_xyxy),input.processing_rect_xyxy)||!(input.annotation_id===null||markId(input.annotation_id))||![input.source_view_manifest_sha256,input.provider_input_manifest_sha256,input.frame_manifest_sha256,input.frame_array_sha256,input.calibration_sha256].every(hash)||!recipe(input.recipe)||!Object.hasOwn(input,'calibration_snapshot')){warnings.push('历史输入证明缺少可核对字段，关联未知。');continue;}
  need(!requests.has(value.request_id)&&!ffts.has(value.fft_object_id),'执行历史原请求或 FFT 身份重复；未采用歧义来源。');requests.add(value.request_id);ffts.add(value.fft_object_id);
  if(input.frame_object_id!==s.frame)continue;
  const existing=result.get(value.fft_object_id),window=all.find(w=>w.role==='fft'&&(w.object_id===value.fft_object_id||w.source_reference?.raw_fft_object_id===value.fft_object_id))??null;
  if(existing&&(existing.source!==input.source_view_object_id||!same(existing.support,input.processing_rect_xyxy)||existing.float!==null&&!same(existing.float,input.float_roi_xyxy)||existing.annotation!==null&&input.annotation_id!==null&&existing.annotation!==input.annotation_id)||window?.source_reference&&(window.source_reference.input_view_object_id!==input.source_view_object_id||!same(window.source_reference.processing_rect_xyxy,input.processing_rect_xyxy))){warnings.push('窗口与原执行输入证明冲突，未采用此 FFT 的查看引用。');if(existing){existing.qualified=false;existing.reason='窗口与原执行输入证明冲突。';}continue;}
  const targetWindow=existing&&!existing.qualified?null:window;
  result.set(value.fft_object_id,{raw:value.fft_object_id,display:targetWindow?.object_id??value.fft_object_id,source:input.source_view_object_id,frame:s.frame,annotation:existing?.annotation??input.annotation_id as string|null,float:input.float_roi_xyxy,support:input.processing_rect_xyxy,window:targetWindow,request:value.request_id,calibration:input.calibration_snapshot,calibrationKnown:true,recipe:recipe(input.recipe),qualified:true,reason:''});
 }
 return [...result.values()];
}
function roiSelection(s:Snapshot,selected:RelationSelection):{id:string|null;coordinates:Rect;pending:boolean}|null {
 const panels=Array.isArray(s.object.panels)?s.object.panels:[],panel=panels.length===1&&row(panels[0])&&panels[0].domain==='spatial_pixels'&&panels[0].source_object_id===s.frame&&rect(panels[0].source_rect_xyxy)?panels[0]:null;
 if(!panel)return null;const bounds=panel.source_rect_xyxy as Rect,inside=(coordinates:Rect)=>coordinates[0]>=bounds[0]&&coordinates[1]>=bounds[1]&&coordinates[2]<=bounds[2]&&coordinates[3]<=bounds[3];
 const marks=Array.isArray(s.object.annotations)?s.object.annotations:[],matches=selected.annotation_id?marks.filter(m=>row(m)&&m.annotation_id===selected.annotation_id&&m.kind==='rectangle'&&m.status!=='retracted'):[];
 if(matches.length>1)throw new Error('选中 ROI 身份重复，关联未知。');
 const mark=matches[0],anchor=row(mark)&&row(mark.anchor)?mark.anchor:null,local=row(selected.selection)?selected.selection:null;
 if(anchor&&anchor.source_object_id===s.frame&&anchor.coordinate_space==='source_pixels'&&rect(anchor.coordinates)){need(inside(anchor.coordinates),'保存 ROI 超出当前空间图的可核对范围。');return {id:selected.annotation_id!,coordinates:anchor.coordinates,pending:selected.pending_geometry===true||Boolean(local&&(!same(local.coordinates,anchor.coordinates)||local.source_object_id!==s.frame||local.coordinate_space!=='source_pixels'||local.panel!==undefined&&!same(local.panel,panel)))};}
 if(selected.annotation_id)return null;
 return local?.kind==='rectangle'&&local.coordinate_space==='source_pixels'&&local.source_object_id===s.frame&&rect(local.coordinates)&&same(local.panel,panel)&&inside(local.coordinates)?{id:null,coordinates:local.coordinates,pending:selected.pending_geometry===true}:null;
}
const relationText:Record<SelectionFftRelation,string>={original_roi:'原 ROI 身份与冻结几何一致',same_float:'浮点几何相同；不是原 ROI 身份证明',changed_geometry:'同一 ROI 已改变几何；FFT 保留旧输入',same_support:'仅整数计算区域相同；原浮点 ROI 不同或未知',unknown:'原始 ROI 关联未知'};
export function selectionFftRelationsModel(state:unknown,selected:RelationSelection|null,packet:unknown,history:unknown):SelectionFftRelationsModel {
 try{
  const s=snapshot(state);checkEnvelope(packet,s);const warnings:string[]=[],items=candidates(s,packet,history,warnings),panels=Array.isArray(s.object.panels)?s.object.panels:[],frequency=panels.length===1&&row(panels[0])&&panels[0].domain==='frequency',raw=frequency&&row(panels[0])&&id(panels[0].source_object_id)?panels[0].source_object_id:null,roi=frequency?null:roiSelection(s,selected??{}),mode=frequency?'fft':roi?'roi':'none';
  if(mode==='none')return {status:'idle',mode,message:'选择一处 ROI 或 FFT 查看已有来源关系。',rows:[],pending_geometry:false,warnings};
  const rows:SelectionFftRelationRow[]=[];for(const candidate of items){
   let relation:SelectionFftRelation='unknown';if(frequency){if(candidate.raw!==raw)continue;relation=candidate.annotation!==null&&candidate.float!==null?'original_roi':'unknown';}
   else if(roi){if(roi.id!==null&&candidate.annotation===roi.id)relation=candidate.float===null?'unknown':same(candidate.float,roi.coordinates)?'original_roi':'changed_geometry';else if(candidate.float&&same(candidate.float,roi.coordinates))relation='same_float';else if(same(outwardSourceRectangle(roi.coordinates),candidate.support))relation='same_support';else continue;}
   const pending=roi?.pending===true,calibration=candidate.calibrationKnown?(same(candidate.calibration,s.object.xy_calibration??null)?'same':'different'):'unknown',qualified=candidate.qualified;
   if(!qualified)relation='unknown';const viewTarget:RelationViewTarget|null=!qualified?null:candidate.window?{kind:'window',window_id:candidate.window.window_id,object_id:candidate.window.object_id,collection_revision:s.collection.revision}:candidate.request?{kind:'show',object_id:candidate.raw,input_reference:{kind:'execution',request_id:candidate.request}}:null;
   rows.push({key:candidate.raw,label:candidate.window?.title??'已保存 FFT',relation,historical:pending||relation==='changed_geometry'||calibration==='different',reason:pending?'工作位置尚未应用；以下仅对应保存版本，不确认当前工作几何。':candidate.reason||relationText[relation],raw_fft_object_id:candidate.raw,display_object_id:candidate.display,input_view_object_id:candidate.source,input_annotation_id:candidate.annotation,input_float_coordinates:candidate.float,processing_rect_xyxy:candidate.support,source_object_id:candidate.frame,coordinate_space:'source_pixels',calibration_relation:calibration,recipe:candidate.recipe,canReuse:false,viewTarget,inputTarget:qualified?{kind:'show',object_id:candidate.source}:null});
  }
  if(frequency&&!rows.length)rows.push({key:String(s.object.object_id),label:'当前 FFT',relation:'unknown',historical:false,reason:'缺少经过核对的原始输入引用；不从最近 ROI 推测来源。',raw_fft_object_id:raw,display_object_id:s.object.object_id as string,input_view_object_id:null,input_annotation_id:null,input_float_coordinates:null,processing_rect_xyxy:null,source_object_id:s.frame,coordinate_space:'source_pixels',calibration_relation:'unknown',recipe:null,canReuse:false,viewTarget:null,inputTarget:null});
  const partial=warnings.length>0||rows.some(r=>r.relation==='unknown')||packet.validation_status!=='validated';return {status:partial?'partial':'ready',mode,message:rows.length?'来源关系仅供查看；当前复用资格未评估。':'未找到经过核对的对应 FFT；旧记录或超预算结果可能仍关联未知。',rows,pending_geometry:roi?.pending===true,warnings:[...new Set(warnings)]};
 }catch(error){return unavailable((error as Error).message);}
}
function frozenInput(state:unknown,selection:RelationSelection|null){const s=snapshot(state);return {state:{...s.envelope,object:s.object,frame_identity:s.raw.frame_identity,edit_state:s.raw.edit_state,window_collection:s.collection},envelope:s.envelope,selection};}
export class SelectionFftRelations {
 private ticket=0;
 constructor(private readonly options:SelectionFftRelationsOptions){}
 invalidate():void {this.ticket++;}
 async refresh():Promise<SelectionFftRelationsModel|null>{
  const ticket=++this.ticket;let result:SelectionFftRelationsModel;
  try{const frozen=copy(frozenInput(this.options.getState(),this.options.getSelection())),signature=canonical(frozen),e=frozen.envelope;
   const query=`expected_object_id=${encodeURIComponent(String(e.active_view_object_id))}&state_revision=${e.state_revision}&draft_revision=${e.draft_revision}&collection_revision=${e.collection_revision}`;
   const [packet,history]=await Promise.allSettled([this.options.api(`/api/roi-handoff?${query}`),this.options.api('/api/execution-history')]);
   if(ticket!==this.ticket)return null;
   // An invalid/transitioning latest identity is itself a stale completion,
   // not an error from the old read that should replace the new UI state.
   try{if(canonical(frozenInput(this.options.getState(),this.options.getSelection()))!==signature)return null;}catch{return null;}
   result=packet.status==='rejected'?unavailable('来源关系读取未完成：'+String(packet.reason instanceof Error?packet.reason.message:packet.reason).slice(0,240)):history.status==='rejected'?unavailable('执行历史读取未完成：'+String(history.reason instanceof Error?history.reason.message:history.reason).slice(0,240)):selectionFftRelationsModel(frozen.state,frozen.selection,packet.value,history.value);
  }catch(error){if(ticket!==this.ticket)return null;result=unavailable('来源关系读取未完成：'+(error as Error).message.slice(0,240));}
  this.options.onChange?.(result);return result;
 }
}
