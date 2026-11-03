// A bounded display collection over immutable provider objects. It owns no
// scientific arrays, draft lease, operation queue, or independent history.
import {randomBytes,createHash} from 'node:crypto';
import type {PanelMetadata as Row,PanelFrameIdentity,PanelWindowCollection,PanelWindowEntry,PanelWindowLayout,PanelWindowSourceReference,PanelWindowCamera,PanelWindowViewContext,PanelSelection} from './image_panel_contracts.mjs';
import type {SpatialReturnReference} from './panel_spatial_return.mjs';
import {validateSpatialReturn} from './panel_spatial_return.mjs';
import {selectionRectangle} from '../ui/image-panel/coordinates.mjs';
import type {Selection} from '../ui/image-panel/coordinates.mjs';

const objectId=/^[a-f0-9]{32}$/;
const isRow=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const clone=<T,>(value:T):T=>structuredClone(value);
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):isRow(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const rect=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===4&&v.every(n=>Number.isSafeInteger(n)&&n>=0)&&v[0]<v[2]&&v[1]<v[3];
function error(message:string):never{throw Object.assign(new Error(message),{status:409});}
export const PANEL_WINDOW_LIMIT=5;
interface WindowRecord {entry:PanelWindowEntry;grid_key:string;asset_fingerprint:string;input_calibration:unknown;hidden?:boolean;latest_observation_asset_fingerprint?:string;latest_observation_grid_key?:string;}
interface Descriptor {object_id:string;frame_id:string;grid_key:string;frequency:boolean;fingerprint:string;}

export function panelWindowFingerprint(value:Row):string {
 return createHash('sha256').update(JSON.stringify(canonical({object_id:value.object_id,panels:value.panels??[],scientific_grid_identity:value.scientific_grid_identity??null,xy_calibration:value.xy_calibration??null,files_sha256:value.files_sha256??null}))).digest('hex');
}
export function panelWindowMappingFingerprint(value:Row):string {
 return createHash('sha256').update(JSON.stringify(canonical({panels:value.panels??[],scientific_grid_identity:value.scientific_grid_identity??null}))).digest('hex');
}
export function readPanelWindowCamera(value:unknown):PanelWindowCamera {
 if(!isRow(value)||Object.keys(value).some(k=>!['scale','center_image_xy'].includes(k))||typeof value.scale!=='number'||!Number.isFinite(value.scale)||value.scale<1e-6||value.scale>1e4||!Array.isArray(value.center_image_xy)||value.center_image_xy.length!==2||!value.center_image_xy.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7))error('Invalid bounded image-window camera');
 return {scale:value.scale,center_image_xy:[value.center_image_xy[0] as number,value.center_image_xy[1] as number]};
}
export function qualifyPanelWindowContext(raw:unknown,value:Row,checkSelection:(selection:unknown,target:Row)=>PanelSelection):PanelWindowViewContext|null {
 try{
  if(!isRow(raw)||Object.keys(raw).some(k=>!['version','object_id','panel_mapping_fingerprint','camera','selection_candidate','selected_annotation_id','camera_origin'].includes(k))||raw.version!==1||raw.camera_origin!==undefined&&raw.camera_origin!=='new_fit_preference'||raw.object_id!==value.object_id||raw.panel_mapping_fingerprint!==panelWindowMappingFingerprint(value)||raw.selected_annotation_id!==null&&(typeof raw.selected_annotation_id!=='string'||!raw.selected_annotation_id.length||raw.selected_annotation_id.length>64))return null;
  const camera=readPanelWindowCamera(raw.camera),candidate=raw.selection_candidate===null?null:checkSelection(raw.selection_candidate,value);
  const selected=(value.annotations as Row[]|undefined)?.filter(mark=>mark.annotation_id===raw.selected_annotation_id&&mark.status!=='retracted')??[];
  return {version:1,object_id:value.object_id as string,panel_mapping_fingerprint:raw.panel_mapping_fingerprint as string,camera,selection_candidate:candidate,selected_annotation_id:selected.length===1?raw.selected_annotation_id as string:null,...(raw.camera_origin==='new_fit_preference'?{camera_origin:'new_fit_preference' as const}:{})};
 }catch{return null;}
}
function describe(value:Row,frame:PanelFrameIdentity|null):Descriptor|null {
 if(!objectId.test(String(value.object_id))||!objectId.test(String(frame?.frame_object_id)))return null;
 const panels=value.panels;if(!Array.isArray(panels)||panels.length!==1||!isRow(panels[0]))return null;
 const panel=panels[0],frequency=panel.domain==='frequency';
 if(!frequency&&(panel.domain!=='spatial_pixels'||panel.source_object_id!==frame!.frame_object_id||!rect(panel.source_rect_xyxy)))return null;
 // Historical annotation revisions intentionally do not invent array_domain.
 // Their saved render base/panels are verified by the Panel asset boundary.
 const derivedFrequency=value.array_domain===undefined&&value.kind==='annotate'&&objectId.test(String(value.render_base_object_id));
 if(frequency&&(!objectId.test(String(panel.source_object_id))||value.array_domain!=='frequency'&&!derivedFrequency||!Array.isArray(panel.fft_shape_yx)||panel.fft_shape_yx.length!==2||!panel.fft_shape_yx.every(n=>Number.isSafeInteger(n)&&n>0)||value.kind==='fft'&&panel.source_object_id!==value.object_id||value.spectrum_object_id!==undefined&&value.spectrum_object_id!==panel.source_object_id))return null;
 const grid_key=frequency?'fft:'+String(panel.source_object_id):'spatial:'+String(panel.source_object_id)+':'+JSON.stringify(panel.source_rect_xyxy);
 return {object_id:value.object_id as string,frame_id:frame!.frame_object_id as string,grid_key,frequency,fingerprint:panelWindowFingerprint(value)};
}
export function readPanelWindowLayout(value:unknown):PanelWindowLayout {
 if(!isRow(value)||Object.keys(value).some(k=>!['x','y','width','height','z'].includes(k)))error('Invalid window layout fields');
 if(!['x','y','width','height','z'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])))error('Window layout needs finite numbers');
 const {x,y,width,height,z}=value as unknown as PanelWindowLayout;
 if(x<0||x>1||y<0||y>1||width<.05||width>1||height<.05||height>1||x+width>1+1e-9||y+height>1+1e-9||!Number.isSafeInteger(z)||z<0||z>10000)error('Window layout lies outside its bounded workspace');
 return {x,y,width,height,z};
}

export class PanelWindowStore {
 private records:WindowRecord[]=[];
 private revision=0;
 private frameId:string|null=null;
 private activeId:string|null=null;
 private unavailableReason:string|undefined;
 private mappingFingerprints=new Map<string,string>();
 snapshot():PanelWindowCollection{return {schema_version:1,revision:this.revision,frame_object_id:this.frameId,active_window_id:this.activeId,windows:this.records.filter(r=>!r.hidden).map(r=>clone(r.entry)),...(this.records.some(r=>r.hidden)?{closed_windows:this.records.filter(r=>r.hidden).map(r=>clone(r.entry))}:{}),...(this.unavailableReason?{unavailable_reason:this.unavailableReason}:{})};}
 checkpoint():Row{return {...this.snapshot(),records:this.records.map(r=>clone(r))};}
 lookup(windowId:unknown,revision:unknown):PanelWindowEntry {
  this.requireRevision(revision);if(!objectId.test(String(windowId)))error('Explicit window identity required');
  const found=this.records.find(r=>r.entry.window_id===windowId);if(!found)error('Saved window is no longer in this collection');return clone(found.entry);
 }
 requireRevision(value:unknown):void{if(!Number.isSafeInteger(value)||value!==this.revision)error('Stale window collection; read the current state');}
 assetMatches(windowId:string,value:Row,frame?:PanelFrameIdentity|null):boolean {const record=this.records.find(r=>r.entry.window_id===windowId),descriptor=frame?describe(value,frame):null;return Boolean(record&&record.entry.object_id===value.object_id&&record.asset_fingerprint===panelWindowFingerprint(value)&&(frame===undefined||descriptor&&descriptor.grid_key===record.grid_key&&descriptor.frame_id===this.frameId));}
 observationMatches(windowId:string,value:Row,frame:PanelFrameIdentity|null):boolean {
  const record=this.records.find(r=>r.entry.window_id===windowId),d=describe(value,frame);
  return Boolean(record&&d&&!d.frequency&&d.frame_id===this.frameId&&record.entry.latest_observation_view_object_id===d.object_id&&record.latest_observation_grid_key===d.grid_key&&record.latest_observation_asset_fingerprint===d.fingerprint);
 }
 canAdmit(value:Row,frame:PanelFrameIdentity|null):boolean {
  const d=describe(value,frame),existing=this.records.find(r=>r.entry.object_id===d?.object_id||r.grid_key===d?.grid_key);return !d||d.frame_id!==this.frameId||Boolean(existing&&!existing.hidden)||this.records.filter(r=>!r.hidden).length<PANEL_WINDOW_LIMIT&&(Boolean(existing)||this.records.length<32);
 }
 admit(value:Row,frame:PanelFrameIdentity|null,source?:SpatialReturnReference|null,inputCalibration?:unknown,inputViewContext?:PanelWindowViewContext|null):void {
  const d=describe(value,frame);
  if(!d){
   const explicitFrame=objectId.test(String(frame?.frame_object_id))?frame!.frame_object_id as string:null;
   // Unsupported active displays do not evict saved windows. With no proven
   // frame, retain them only as the old collection's inactive references.
   if(explicitFrame&&explicitFrame!==this.frameId){this.records=[];this.mappingFingerprints.clear();this.frameId=explicitFrame;}
   this.activeId=null;this.unavailableReason=explicitFrame?'unsupported_view':'unverified_frame';this.revision++;return;
  }
  if(d.frame_id!==this.frameId){this.records=[];this.mappingFingerprints.clear();this.activeId=null;this.frameId=d.frame_id;}
  this.unavailableReason=undefined;
  let record=this.records.find(r=>r.entry.object_id===d.object_id)??this.records.find(r=>r.grid_key===d.grid_key);
  if(!record){
   if(this.records.filter(r=>!r.hidden).length>=PANEL_WINDOW_LIMIT)error('Five image windows are already open; close a display before accepting the saved result');
   if(this.records.length>=32)error('Retained display limit reached; saved scientific records remain available in history');
   const sourceWindow=!d.frequency&&!this.records.some(r=>r.entry.role==='source');
   const role=d.frequency?'fft':sourceWindow?'source':'roi',prefix=role==='fft'?'FFT':'局部图',n=this.records.length;
   let count=1;while(role!=='source'&&this.records.some(r=>r.entry.title===`${prefix} ${count}`))count++;
   record={entry:{window_id:randomBytes(16).toString('hex'),object_id:d.object_id,role,title:role==='source'?'来源图像':role==='fft'?`FFT ${count}`:`局部图 ${count}`,layout:{x:(n%2)*.48,y:Math.floor(n/2)*.08,width:n?.52:1,height:n?.72:1,z:n}},grid_key:d.grid_key,asset_fingerprint:d.fingerprint,input_calibration:null};
   // Initial placement is bounded even at the fifth entry. Only display
   // metadata is generated here; this is not an inferred scientific relation.
   record.entry.layout.x=Math.min(record.entry.layout.x,1-record.entry.layout.width);
   record.entry.layout.y=Math.min(record.entry.layout.y,1-record.entry.layout.height);
   this.records.push(record);
   // A newly admitted saved spatial view is the known working version, not
   // an inferred newer version of any existing source window.
   const retainedLatest=this.records.filter(r=>r!==record&&r.latest_observation_grid_key===d.grid_key&&r.entry.latest_observation_view_object_id&&r.latest_observation_asset_fingerprint);
   const knownLatestIds=new Set(retainedLatest.map(r=>r.entry.latest_observation_view_object_id));
   if(!d.frequency&&knownLatestIds.size===1){const known=retainedLatest[0];record.entry.latest_observation_view_object_id=known.entry.latest_observation_view_object_id;record.latest_observation_asset_fingerprint=known.latest_observation_asset_fingerprint;record.latest_observation_grid_key=d.grid_key;}
   else if(!d.frequency&&!knownLatestIds.size&&Array.isArray(value.annotations)&&value.annotations.some(mark=>isRow(mark)&&mark.kind==='rectangle')){
    record.entry.latest_observation_view_object_id=d.object_id;record.latest_observation_asset_fingerprint=d.fingerprint;record.latest_observation_grid_key=d.grid_key;
   }
  }
  if(record.hidden&&this.records.filter(r=>!r.hidden).length>=PANEL_WINDOW_LIMIT)error('Five image windows are already open; close a display before reopening this result');
  delete record.hidden;
  const mapping=panelWindowMappingFingerprint(value),context=record.entry.view_context;
  if(context){
   if(context.object_id!==record.entry.object_id||context.panel_mapping_fingerprint!==mapping)delete record.entry.view_context;
   else{context.object_id=d.object_id;const matches=(value.annotations as Row[]|undefined)?.filter(mark=>mark.annotation_id===context.selected_annotation_id&&mark.status!=='retracted')??[];if(matches.length!==1)context.selected_annotation_id=null;}
  }
  record.entry.object_id=d.object_id;record.asset_fingerprint=d.fingerprint;this.mappingFingerprints.set(record.entry.window_id,mapping);
  if(d.frequency&&source?.frame_object_id===d.frame_id&&d.grid_key==='fft:'+source.fft_object_id){
   const existing=record.entry.source_reference;
   if(!existing){
    record.input_calibration=clone(inputCalibration??null);record.entry.source_reference={input_view_object_id:source.view_object_id,frame_object_id:source.frame_object_id,raw_fft_object_id:source.fft_object_id,processing_rect_xyxy:[...source.source_rect_xyxy],calibration_relation:'unknown'};
    // Only a newly created GUI FFT relation can capture this field. A later
    // display or peak revision must never fill it from a newer source context.
    if(inputViewContext?.object_id===source.view_object_id&&inputViewContext.selection_candidate&&same(selectionRectangle(inputViewContext.selection_candidate as unknown as Selection),source.source_rect_xyxy))record.entry.source_reference.input_view_context=clone(inputViewContext);
   }else if(inputViewContext){
    if(existing.input_view_object_id!==source.view_object_id||existing.frame_object_id!==source.frame_object_id||existing.raw_fft_object_id!==source.fft_object_id||!same(existing.processing_rect_xyxy,source.source_rect_xyxy)||inputViewContext.object_id!==source.view_object_id||!inputViewContext.selection_candidate||!same(selectionRectangle(inputViewContext.selection_candidate as unknown as Selection),source.source_rect_xyxy))error('Verified input context differs from the retained original source relation');
    if(existing.input_view_context?.selection_candidate&&!same(existing.input_view_context.selection_candidate,inputViewContext.selection_candidate))error('Retained original float selection differs from verified input');
    if(!existing.input_view_context)existing.input_view_context=clone(inputViewContext);
   }
  }
  if(record.entry.source_reference){const a=record.input_calibration,b=value.xy_calibration??null;record.entry.source_reference.calibration_relation=a==null||b==null?'unknown':same(a,b)?'same':'different';}
  if(d.frequency&&record.entry.source_reference&&!record.entry.latest_observation_view_object_id){
   const inputId=record.entry.source_reference.input_view_object_id,known=this.records.find(r=>r!==record&&r.entry.object_id===inputId&&r.entry.latest_observation_view_object_id&&r.latest_observation_asset_fingerprint);
   if(known){record.entry.latest_observation_view_object_id=known.entry.latest_observation_view_object_id;record.latest_observation_asset_fingerprint=known.latest_observation_asset_fingerprint;record.latest_observation_grid_key=known.latest_observation_grid_key;}
  }
  if(this.activeId!==record.entry.window_id){
   let highest=Math.max(-1,...this.records.filter(r=>r!==record).map(r=>r.entry.layout.z));
   if(record.entry.layout.z<=highest){
    if(highest>=9999){[...this.records].sort((a,b)=>a.entry.layout.z-b.entry.layout.z).forEach((r,i)=>r.entry.layout.z=i);highest=Math.max(-1,...this.records.filter(r=>r!==record).map(r=>r.entry.layout.z));}
    record.entry.layout.z=highest+1;
   }
  }
  this.activeId=record.entry.window_id;this.revision++;
 }
 rememberObservations(value:Row,frame:PanelFrameIdentity|null):void {
  const d=describe(value,frame);if(!d||d.frequency||d.frame_id!==this.frameId)return;
  const record=this.records.find(r=>r.grid_key===d.grid_key);
  if(!record||this.mappingFingerprints.get(record.entry.window_id)!==panelWindowMappingFingerprint(value))return;
  // The caller supplies an explicitly completed ROI mark/edit. Merely showing
  // a historical FFT input must never replace this working-version reference.
  if(record.entry.latest_observation_view_object_id===d.object_id&&record.latest_observation_asset_fingerprint===d.fingerprint)return;
  const previous=record.entry.object_id;
  for(const related of this.records)if(related===record||related.latest_observation_grid_key===d.grid_key&&related.entry.latest_observation_view_object_id===previous||related.entry.source_reference?.input_view_object_id===previous){
   related.entry.latest_observation_view_object_id=d.object_id;related.latest_observation_asset_fingerprint=d.fingerprint;related.latest_observation_grid_key=d.grid_key;
  }
  this.revision++;
 }
 continueObservations(previous:Row,value:Row,frame:PanelFrameIdentity|null):void {
  const record=this.records.find(r=>r.entry.object_id===previous.object_id),rectangles=(view:Row)=>(Array.isArray(view.annotations)?view.annotations:[]).filter(mark=>isRow(mark)&&mark.kind==='rectangle');
  // Explicit display/calibration successors may retain the complete ROI set.
  // An old saved-view navigation never enters this path, even if it looks alike.
  if(record?.entry.latest_observation_view_object_id!==previous.object_id||!same(rectangles(previous),rectangles(value)))return;
  this.rememberObservations(value,frame);
 }
 updateLayouts(revision:unknown,updates:unknown):void {
  this.requireRevision(revision);if(!Array.isArray(updates)||updates.length<1||updates.length>PANEL_WINDOW_LIMIT)error('Provide one to five window layouts');
  const seen=new Set<string>(),prepared=updates.map(update=>{
   if(!isRow(update)||Object.keys(update).some(k=>!['window_id','layout'].includes(k)))error('Unexpected window layout update');
   const entry=this.lookup(update.window_id,revision);if(seen.has(entry.window_id))error('Duplicate window layout identity');seen.add(entry.window_id);
   return {window_id:entry.window_id,layout:readPanelWindowLayout(update.layout)};
  });
  for(const update of prepared)this.records.find(r=>r.entry.window_id===update.window_id)!.entry.layout=update.layout;
  this.revision++;
 }
 close(revision:unknown,windowId:unknown):void {
  const entry=this.lookup(windowId,revision),record=this.records.find(r=>r.entry.window_id===entry.window_id)!;
  record.hidden=true;if(entry.window_id===this.activeId)this.activeId=null;this.revision++;
 }
 setContext(revision:unknown,windowId:unknown,value:Row,context:PanelWindowViewContext|null):void {
  const entry=this.lookup(windowId,revision);
  const mapping=panelWindowMappingFingerprint(value);
  if(entry.window_id!==this.activeId||entry.object_id!==value.object_id||this.mappingFingerprints.get(entry.window_id)!==mapping||context&&(context.object_id!==entry.object_id||context.panel_mapping_fingerprint!==mapping))error('Viewing context requires the exact current editing window and mapping');
  const target=this.records.find(r=>r.entry.window_id===entry.window_id)!.entry;
  if(context)target.view_context=clone(context);else delete target.view_context;this.revision++;
 }
 updateCamera(revision:unknown,windowId:unknown,objectId:unknown,camera:unknown):void {
  const entry=this.lookup(windowId,revision),mapping=this.mappingFingerprints.get(entry.window_id),checked=readPanelWindowCamera(camera);
  if(entry.object_id!==objectId||!mapping)error('Camera belongs to a changed saved window');
  const prior=entry.view_context,context:PanelWindowViewContext=prior&&prior.object_id===entry.object_id&&prior.panel_mapping_fingerprint===mapping?(()=>{const {camera_origin,...recorded}=prior;void camera_origin;return {...recorded,camera:checked};})():{version:1,object_id:entry.object_id,panel_mapping_fingerprint:mapping,camera:checked,selection_candidate:null,selected_annotation_id:null};
  this.records.find(r=>r.entry.window_id===entry.window_id)!.entry.view_context=clone(context);this.revision++;
 }
 async restore(raw:unknown,current:Row,currentFrame:PanelFrameIdentity|null,read:(id:string)=>Promise<{object:Row;frame:PanelFrameIdentity|null;png:unknown}>,checkSelection?:(selection:unknown,target:Row)=>PanelSelection):Promise<void> {
  // The active object was already admitted by the owned recovery protocol.
  // Bad passive records are omitted independently, never breaking that path.
  if(!isRow(raw)||Object.keys(raw).some(k=>!['schema_version','revision','frame_object_id','active_window_id','windows','closed_windows','unavailable_reason','records'].includes(k))||raw.schema_version!==1||raw.frame_object_id!==currentFrame?.frame_object_id||!Array.isArray(raw.records)||raw.records.length>32||!Number.isSafeInteger(raw.revision)||(raw.revision as number)<0||(raw.revision as number)>=Number.MAX_SAFE_INTEGER)return;
  const restored:WindowRecord[]=[];const used=new Set<string>(),grids=new Set<string>(),mappings=new Map<string,string>();
  for(const item of raw.records){try{
   if(!isRow(item)||Object.keys(item).some(k=>!['entry','grid_key','asset_fingerprint','input_calibration','hidden','latest_observation_asset_fingerprint','latest_observation_grid_key'].includes(k))||item.hidden!==undefined&&typeof item.hidden!=='boolean'||!isRow(item.entry)||Object.keys(item.entry).some(k=>!['window_id','object_id','role','title','layout','source_reference','view_context','latest_observation_view_object_id'].includes(k))||!objectId.test(String(item.entry.window_id))||!objectId.test(String(item.entry.object_id))||used.has(item.entry.window_id as string))continue;
   const saved=await read(item.entry.object_id as string),d=describe(saved.object,saved.frame);if(!d||d.frame_id!==currentFrame?.frame_object_id||d.fingerprint!==item.asset_fingerprint||grids.has(d.grid_key))continue;
   if(!['source','roi','fft'].includes(String(item.entry.role))||(item.entry.role==='fft')!==d.frequency||typeof item.entry.title!=='string'||item.entry.title.length>64||item.grid_key!==d.grid_key)continue;
   const entry:PanelWindowEntry={window_id:item.entry.window_id as string,object_id:d.object_id,role:item.entry.role as PanelWindowEntry['role'],title:item.entry.title,layout:readPanelWindowLayout(item.entry.layout)};
   if(item.entry.view_context!==undefined&&checkSelection){const context=qualifyPanelWindowContext(item.entry.view_context,saved.object,checkSelection);if(context)entry.view_context=context;}
   const reference=item.entry.source_reference;let inputCalibration:unknown=null,latestExpectedGrid=d.frequency?null:d.grid_key;
   if(reference!==undefined){try{
    if(!isRow(reference)||Object.keys(reference).some(k=>!['input_view_object_id','frame_object_id','raw_fft_object_id','processing_rect_xyxy','calibration_relation','input_view_context'].includes(k))||!objectId.test(String(reference.input_view_object_id))||reference.frame_object_id!==d.frame_id||!objectId.test(String(reference.raw_fft_object_id))||d.grid_key!=='fft:'+reference.raw_fft_object_id||!rect(reference.processing_rect_xyxy)||!['same','different','unknown'].includes(String(reference.calibration_relation)))throw new Error('Invalid historical window relation');
    const input=await read(reference.input_view_object_id as string),rawFFT=await read(reference.raw_fft_object_id as string);
    validateSpatialReturn({version:1,view_object_id:reference.input_view_object_id as string,frame_object_id:d.frame_id,fft_object_id:reference.raw_fft_object_id as string,source_rect_xyxy:reference.processing_rect_xyxy},input.object,input.png,input.frame,rawFFT.object,rawFFT.frame);
     latestExpectedGrid=describe(input.object,input.frame)?.grid_key??null;
    inputCalibration=clone(input.object.xy_calibration??null);
    const {input_view_context:rawInputContext,...referenceBase}=reference;
    const b=saved.object.xy_calibration??null;entry.source_reference={...clone(referenceBase),calibration_relation:inputCalibration==null||b==null?'unknown':same(inputCalibration,b)?'same':'different'} as unknown as PanelWindowSourceReference;
    if(rawInputContext!==undefined&&checkSelection){const context=qualifyPanelWindowContext(rawInputContext,input.object,checkSelection);if(context?.selection_candidate&&same(selectionRectangle(context.selection_candidate as unknown as Selection),reference.processing_rect_xyxy))entry.source_reference.input_view_context=context;}
   }catch{inputCalibration=null;/* Keep the valid saved view, without an unqualified relation. */}}
   let latestFingerprint:string|undefined;
   if(objectId.test(String(item.entry.latest_observation_view_object_id))&&typeof item.latest_observation_asset_fingerprint==='string'&&typeof item.latest_observation_grid_key==='string'){
    try{const latest=await read(item.entry.latest_observation_view_object_id as string),latestDescriptor=describe(latest.object,latest.frame);
     if(latestDescriptor&&!latestDescriptor.frequency&&latestDescriptor.frame_id===d.frame_id&&latestDescriptor.grid_key===item.latest_observation_grid_key&&latestDescriptor.grid_key===latestExpectedGrid&&latestDescriptor.fingerprint===item.latest_observation_asset_fingerprint){entry.latest_observation_view_object_id=latestDescriptor.object_id;latestFingerprint=latestDescriptor.fingerprint;}
    }catch{/* The qualified current image survives an unavailable optional working version. */}
   }
   restored.push({entry,grid_key:d.grid_key,asset_fingerprint:d.fingerprint,input_calibration:inputCalibration,...(item.hidden?{hidden:true}:{}),...(latestFingerprint?{latest_observation_asset_fingerprint:latestFingerprint,latest_observation_grid_key:item.latest_observation_grid_key as string}:{})});used.add(entry.window_id);grids.add(d.grid_key);mappings.set(entry.window_id,panelWindowMappingFingerprint(saved.object));
  }catch{/* Omit an unavailable or malformed passive window. */}}
  const active=restored.find(r=>r.entry.object_id===current.object_id);
  if(!active||raw.active_window_id!==active.entry.window_id&&!(raw.active_window_id===null&&active.hidden)||restored.filter(r=>!r.hidden).length>PANEL_WINDOW_LIMIT)return;
  this.records=restored;this.mappingFingerprints=mappings;this.frameId=currentFrame!.frame_object_id as string;this.activeId=active.hidden?null:active.entry.window_id;this.unavailableReason=undefined;this.revision=Math.max(this.revision,raw.revision as number)+1;
 }
}
