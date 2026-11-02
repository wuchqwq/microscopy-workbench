// A bounded display collection over immutable provider objects. It owns no
// scientific arrays, draft lease, operation queue, or independent history.
import {randomBytes,createHash} from 'node:crypto';
import type {PanelMetadata as Row,PanelFrameIdentity,PanelWindowCollection,PanelWindowEntry,PanelWindowLayout,PanelWindowSourceReference} from './image_panel_contracts.mjs';
import type {SpatialReturnReference} from './panel_spatial_return.mjs';
import {validateSpatialReturn} from './panel_spatial_return.mjs';

const objectId=/^[a-f0-9]{32}$/;
const isRow=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const clone=<T,>(value:T):T=>structuredClone(value);
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):isRow(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const rect=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===4&&v.every(n=>Number.isSafeInteger(n)&&n>=0)&&v[0]<v[2]&&v[1]<v[3];
function error(message:string):never{throw Object.assign(new Error(message),{status:409});}
export const PANEL_WINDOW_LIMIT=5;
interface WindowRecord {entry:PanelWindowEntry;grid_key:string;asset_fingerprint:string;input_calibration:unknown;}
interface Descriptor {object_id:string;frame_id:string;grid_key:string;frequency:boolean;fingerprint:string;}

export function panelWindowFingerprint(value:Row):string {
 return createHash('sha256').update(JSON.stringify(canonical({object_id:value.object_id,panels:value.panels??[],scientific_grid_identity:value.scientific_grid_identity??null,xy_calibration:value.xy_calibration??null,files_sha256:value.files_sha256??null}))).digest('hex');
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
 snapshot():PanelWindowCollection{return {schema_version:1,revision:this.revision,frame_object_id:this.frameId,active_window_id:this.activeId,windows:this.records.map(r=>clone(r.entry)),...(this.unavailableReason?{unavailable_reason:this.unavailableReason}:{})};}
 checkpoint():Row{return {...this.snapshot(),records:this.records.map(r=>clone(r))};}
 lookup(windowId:unknown,revision:unknown):PanelWindowEntry {
  this.requireRevision(revision);if(!objectId.test(String(windowId)))error('Explicit window identity required');
  const found=this.records.find(r=>r.entry.window_id===windowId);if(!found)error('Saved window is no longer in this collection');return clone(found.entry);
 }
 requireRevision(value:unknown):void{if(!Number.isSafeInteger(value)||value!==this.revision)error('Stale window collection; read the current state');}
 assetMatches(windowId:string,value:Row):boolean {const record=this.records.find(r=>r.entry.window_id===windowId);return Boolean(record&&record.entry.object_id===value.object_id&&record.asset_fingerprint===panelWindowFingerprint(value));}
 canAdmit(value:Row,frame:PanelFrameIdentity|null):boolean {
  const d=describe(value,frame);return !d||d.frame_id!==this.frameId||this.records.some(r=>r.entry.object_id===d.object_id||r.grid_key===d.grid_key)||this.records.length<PANEL_WINDOW_LIMIT;
 }
 admit(value:Row,frame:PanelFrameIdentity|null,source?:SpatialReturnReference|null,inputCalibration?:unknown):void {
  const d=describe(value,frame);
  if(!d){
   const explicitFrame=objectId.test(String(frame?.frame_object_id))?frame!.frame_object_id as string:null;
   // Unsupported active displays do not evict saved windows. With no proven
   // frame, retain them only as the old collection's inactive references.
   if(explicitFrame&&explicitFrame!==this.frameId){this.records=[];this.frameId=explicitFrame;}
   this.activeId=null;this.unavailableReason=explicitFrame?'unsupported_view':'unverified_frame';this.revision++;return;
  }
  if(d.frame_id!==this.frameId){this.records=[];this.activeId=null;this.frameId=d.frame_id;}
  this.unavailableReason=undefined;
  let record=this.records.find(r=>r.entry.object_id===d.object_id)??this.records.find(r=>r.grid_key===d.grid_key);
  if(!record){
   if(this.records.length>=PANEL_WINDOW_LIMIT)error('Five image windows are already open; close a read-only window before accepting the saved result');
   const sourceWindow=!d.frequency&&!this.records.some(r=>r.entry.role==='source');
   const role=d.frequency?'fft':sourceWindow?'source':'roi',prefix=role==='fft'?'FFT':'局部图',n=this.records.length;
   let count=1;while(role!=='source'&&this.records.some(r=>r.entry.title===`${prefix} ${count}`))count++;
   record={entry:{window_id:randomBytes(16).toString('hex'),object_id:d.object_id,role,title:role==='source'?'来源图像':role==='fft'?`FFT ${count}`:`局部图 ${count}`,layout:{x:(n%2)*.48,y:Math.floor(n/2)*.08,width:n?.52:1,height:n?.72:1,z:n}},grid_key:d.grid_key,asset_fingerprint:d.fingerprint,input_calibration:null};
   // Initial placement is bounded even at the fifth entry. Only display
   // metadata is generated here; this is not an inferred scientific relation.
   record.entry.layout.x=Math.min(record.entry.layout.x,1-record.entry.layout.width);
   record.entry.layout.y=Math.min(record.entry.layout.y,1-record.entry.layout.height);
   this.records.push(record);
  }
  record.entry.object_id=d.object_id;record.asset_fingerprint=d.fingerprint;
  if(d.frequency&&source?.frame_object_id===d.frame_id&&d.grid_key==='fft:'+source.fft_object_id){
   const existing=record.entry.source_reference;
   if(!existing){record.input_calibration=clone(inputCalibration??null);record.entry.source_reference={input_view_object_id:source.view_object_id,frame_object_id:source.frame_object_id,raw_fft_object_id:source.fft_object_id,processing_rect_xyxy:[...source.source_rect_xyxy],calibration_relation:'unknown'};}
  }
  if(record.entry.source_reference){const a=record.input_calibration,b=value.xy_calibration??null;record.entry.source_reference.calibration_relation=a==null||b==null?'unknown':same(a,b)?'same':'different';}
  if(this.activeId!==record.entry.window_id){
   let highest=Math.max(-1,...this.records.filter(r=>r!==record).map(r=>r.entry.layout.z));
   if(record.entry.layout.z<=highest){
    if(highest>=9999){[...this.records].sort((a,b)=>a.entry.layout.z-b.entry.layout.z).forEach((r,i)=>r.entry.layout.z=i);highest=Math.max(-1,...this.records.filter(r=>r!==record).map(r=>r.entry.layout.z));}
    record.entry.layout.z=highest+1;
   }
  }
  this.activeId=record.entry.window_id;this.revision++;
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
  const entry=this.lookup(windowId,revision);if(entry.window_id===this.activeId)error('The current editing window cannot be closed; return to a saved source view first');
  this.records=this.records.filter(r=>r.entry.window_id!==entry.window_id);this.revision++;
 }
 async restore(raw:unknown,current:Row,currentFrame:PanelFrameIdentity|null,read:(id:string)=>Promise<{object:Row;frame:PanelFrameIdentity|null;png:unknown}>):Promise<void> {
  // The active object was already admitted by the owned recovery protocol.
  // Bad passive records are omitted independently, never breaking that path.
  if(!isRow(raw)||Object.keys(raw).some(k=>!['schema_version','revision','frame_object_id','active_window_id','windows','unavailable_reason','records'].includes(k))||raw.schema_version!==1||raw.frame_object_id!==currentFrame?.frame_object_id||!Array.isArray(raw.records)||raw.records.length>PANEL_WINDOW_LIMIT||!Number.isSafeInteger(raw.revision)||(raw.revision as number)<0||(raw.revision as number)>=Number.MAX_SAFE_INTEGER)return;
  const restored:WindowRecord[]=[];const used=new Set<string>(),grids=new Set<string>();
  for(const item of raw.records){try{
   if(!isRow(item)||Object.keys(item).some(k=>!['entry','grid_key','asset_fingerprint','input_calibration'].includes(k))||!isRow(item.entry)||Object.keys(item.entry).some(k=>!['window_id','object_id','role','title','layout','source_reference'].includes(k))||!objectId.test(String(item.entry.window_id))||!objectId.test(String(item.entry.object_id))||used.has(item.entry.window_id as string))continue;
   const saved=await read(item.entry.object_id as string),d=describe(saved.object,saved.frame);if(!d||d.frame_id!==currentFrame?.frame_object_id||d.fingerprint!==item.asset_fingerprint||grids.has(d.grid_key))continue;
   if(!['source','roi','fft'].includes(String(item.entry.role))||(item.entry.role==='fft')!==d.frequency||typeof item.entry.title!=='string'||item.entry.title.length>64||item.grid_key!==d.grid_key)continue;
   const entry:PanelWindowEntry={window_id:item.entry.window_id as string,object_id:d.object_id,role:item.entry.role as PanelWindowEntry['role'],title:item.entry.title,layout:readPanelWindowLayout(item.entry.layout)};
   const reference=item.entry.source_reference;let inputCalibration:unknown=null;
   if(reference!==undefined){try{
    if(!isRow(reference)||Object.keys(reference).some(k=>!['input_view_object_id','frame_object_id','raw_fft_object_id','processing_rect_xyxy','calibration_relation'].includes(k))||!objectId.test(String(reference.input_view_object_id))||reference.frame_object_id!==d.frame_id||!objectId.test(String(reference.raw_fft_object_id))||d.grid_key!=='fft:'+reference.raw_fft_object_id||!rect(reference.processing_rect_xyxy)||!['same','different','unknown'].includes(String(reference.calibration_relation)))throw new Error('Invalid historical window relation');
    const input=await read(reference.input_view_object_id as string),rawFFT=await read(reference.raw_fft_object_id as string);
    validateSpatialReturn({version:1,view_object_id:reference.input_view_object_id as string,frame_object_id:d.frame_id,fft_object_id:reference.raw_fft_object_id as string,source_rect_xyxy:reference.processing_rect_xyxy},input.object,input.png,input.frame,rawFFT.object,rawFFT.frame);
    inputCalibration=clone(input.object.xy_calibration??null);
    const b=saved.object.xy_calibration??null;entry.source_reference={...clone(reference),calibration_relation:inputCalibration==null||b==null?'unknown':same(inputCalibration,b)?'same':'different'} as unknown as PanelWindowSourceReference;
   }catch{inputCalibration=null;/* Keep the valid saved view, without an unqualified relation. */}}
   restored.push({entry,grid_key:d.grid_key,asset_fingerprint:d.fingerprint,input_calibration:inputCalibration});used.add(entry.window_id);grids.add(d.grid_key);
  }catch{/* Omit an unavailable or malformed passive window. */}}
  const active=restored.find(r=>r.entry.object_id===current.object_id);
  if(!active||raw.active_window_id!==active.entry.window_id)return;
  this.records=restored;this.frameId=currentFrame!.frame_object_id as string;this.activeId=active.entry.window_id;this.unavailableReason=undefined;this.revision=Math.max(this.revision,raw.revision as number)+1;
 }
}
