// Bounded, rebuildable metadata view of the existing image provider journal.
// No pixels, scientific computation or independent measurement authority lives here.
import {createHash} from 'node:crypto';
import type {BinaryLike} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// A journal identity/hash check does not qualify the remaining scientific JSON.
// Local casts below adapt native legacy property/array operations only.
type Metadata = Record<string,unknown>;
interface SavedIdentity extends Metadata {object_id:string;backend:typeof BACKEND;}
interface SavedObject {value:SavedIdentity;manifest_sha256:string;parameters:Metadata;}
interface Lineage {frames:Metadata[];sources:Metadata[];source_identity:unknown;}
export interface MeasurementReadOptions {workspace?:string;objectId?:string;limit?:number;}
export interface MeasurementRecord extends Metadata {
 measurement_object_id:unknown;measurement_manifest_sha256:string;input_object_id:unknown;annotation_id:unknown;name:unknown;
 measurement_kind:'dc_to_peak'|'two_point';previous_measurement_object_id:unknown;status:'historical'|'needs_remeasurement'|'current';
 same_grid:boolean;same_frame:boolean;visible_in_current_view:boolean;annotation_matches_current:boolean;
 source:{source_identity:unknown;frame_index:unknown;source_rect_xyxy:unknown;source_object_id:unknown};
}
export interface MeasurementLinkInput {schema_version?:1;measurement_object_id:string;input_object_id:string;annotation_id:string;measurement_kind:'dc_to_peak'|'two_point';name:string;previous_measurement_object_id?:string|null;}


const OBJECT=/^[a-f0-9]{32}$/,REQUEST=/^[A-Za-z0-9_-]{1,64}$/,ANNOTATION=/^[A-Za-z0-9_-]{1,64}$/;
const BACKEND='external-image-workspace';
const MAX_REQUESTS=8192,MAX_OBJECTS=2048,MAX_JSON=2*1024*1024,MAX_TOTAL=64*1024*1024;
const sha=(raw:BinaryLike)=>createHash('sha256').update(raw).digest('hex');
const canonical=(value:unknown)=>JSON.stringify(value,(_:string,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const same=(a:unknown,b:unknown)=>canonical(a??null)===canonical(b??null);
function need(ok:unknown,message:string,code='CORRUPT_OBJECT'):asserts ok{if(!ok)throw Object.assign(new Error(message),{code});}
const inside=(root:string,file:string)=>{const rel=path.relative(root,file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};

function reader(workspace:unknown){
 need(typeof workspace==='string'&&path.isAbsolute(workspace),'Explicit absolute image workspace required','INVALID_ARGUMENT');
 need(lstatSync(workspace).isDirectory()&&!lstatSync(workspace).isSymbolicLink(),'Workspace must be an ordinary directory');
 const root=realpathSync.native(workspace),cache=new Map<string,SavedObject>();let bytes=0;
 for(const name of ['objects','requests']){const p=path.join(root,name);need(lstatSync(p).isDirectory()&&!lstatSync(p).isSymbolicLink(),'Workspace metadata directory is missing or linked');}
 function json(file:string){
  const info=lstatSync(file);need(info.isFile()&&!info.isSymbolicLink()&&info.size<=MAX_JSON,'Missing, linked or oversized workspace metadata');
  need(inside(root,realpathSync.native(file)),'Workspace metadata escapes configured directory');
  bytes+=info.size;need(bytes<=MAX_TOTAL,'Measurement metadata exceeds bounded read budget','BUDGET_EXCEEDED');
  const raw=readFileSync(file),value:unknown=JSON.parse(raw.toString('utf8'));need(value&&typeof value==='object'&&!Array.isArray(value),'Invalid workspace JSON metadata');
  return {raw,value:value as Metadata};
 }
 function object(ident:unknown):SavedObject{
  need(typeof ident==='string'&&OBJECT.test(ident),'Explicit saved workspace object ID required','INVALID_ARGUMENT');
  if(cache.has(ident))return cache.get(ident)!;
  need(cache.size<MAX_OBJECTS,'Measurement ancestry exceeds object budget','BUDGET_EXCEEDED');
  const directory=path.join(root,'objects',ident);need(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink(),'Object directory is missing or linked');
  const {raw,value}=json(path.join(directory,'object.json'));
  need(value.object_id===ident&&value.backend===BACKEND&&REQUEST.test((value.request_id??'') as string),'Scientific object identity mismatch');
  const journal=json(path.join(root,'requests',value.request_id+'.json')).value;
  need(journal.state==='completed'&&journal.request_id===value.request_id&&journal.object_manifest_sha256===sha(raw),'Uncommitted or changed scientific object manifest');
  need((journal.parameters as Metadata|undefined)?.request_id===value.request_id&&typeof (journal.parameters as Metadata|undefined)?.workspace==='string'&&realpathSync.native((journal.parameters as Metadata).workspace as string)===root,'Original request belongs to another workspace or request');
  need(same(journal.response,{ok:true,state:'completed',backend:BACKEND,request_id:value.request_id,...value}),'Scientific object and original journal response disagree');
  const result={value:value as SavedIdentity,manifest_sha256:sha(raw),parameters:journal.parameters as Metadata};cache.set(ident,result);return result;
 }
 function lineage(ident:unknown):Lineage{
  const queue:unknown[]=[ident],seen=new Set<unknown>(),frames:Metadata[]=[],sources:Metadata[]=[];let sourceIdentity:unknown=null;
  while(queue.length){const id=queue.pop();if(seen.has(id))continue;need(seen.size<64,'Scientific source ancestry exceeds budget','BUDGET_EXCEEDED');seen.add(id);
   const value=object(id).value;if(value.kind==='frame')frames.push(value);if((['tiff_source','dm_source'] as readonly unknown[]).includes(value.kind))sources.push(value);
   sourceIdentity??=value.source_identity??null;
   // Previous calibration/measurement records are history, not input ancestry.
   for(const key of ['parent_object_id','base_object_id','source_object_id','render_base_object_id','spectrum_object_id']){const next=value[key];if(next&&next!==id)queue.push(next);}
   for(const next of (value.object_ids??[]) as unknown[])queue.push(next);
  }
  return {frames,sources,source_identity:sourceIdentity};
 }
 function operand(ident:unknown){let value=object(ident).value,record=value.xy_calibration??null;const seen=new Set();
  while((['calibration','context','measure','annotate'] as readonly unknown[]).includes(value.kind)){
   need(!seen.has(value.object_id)&&seen.size<32,'Scientific operand ancestry is cyclic or exceeds budget');seen.add(value.object_id);
   const next=value.kind==='annotate'?value.render_base_object_id:value.kind==='measure'?value.parent_object_id:value.base_object_id;
   value=object(next).value;record??=value.xy_calibration??null;
  }
  const spectral=(['fft','fft_view'] as readonly unknown[]).includes(value.kind),panel=(value.panels as Metadata[]|undefined)?.length===1?(value.panels as Metadata[])[0]:null;
  let grid=null;
  if((['frame','view','fft','fft_view'] as readonly unknown[]).includes(value.kind)&&value.shape_yx&&(value.files_sha256 as Metadata|undefined)?.['data.npy'])grid={
   source_grid_object_id:spectral?(value.spectrum_object_id??value.object_id):(value.kind==='view'?panel?.source_object_id:value.object_id),
   shape_yx:value.shape_yx,dtype:value.dtype,array_sha256:(value.files_sha256 as Metadata)['data.npy'],
   source_rect_xyxy:spectral?null:(value.kind==='view'?panel?.source_rect_xyxy:[0,0,(value.shape_yx as unknown[])[1],(value.shape_yx as unknown[])[0]]),
   coordinate_space:spectral?'frequency_cycles_per_pixel':(['frequency','reciprocal'] as readonly unknown[]).includes(value.array_domain)?'source_array_indices':'source_pixels'};
  const sourceRect=value.source_rect_xyxy??(spectral&&value.spectrum_object_id?object(value.spectrum_object_id).value.source_rect_xyxy:null)??grid?.source_rect_xyxy??null;
  return {value,record,grid,lineage:lineage(ident),panel,sourceRect};
 }
 return {root,json,object,lineage,operand};
}

function annotationPoints(mark:Metadata|undefined){
 const c=(mark?.anchor as Metadata|undefined)?.coordinates;if(!Array.isArray(c))return null;
 return c.length===2?[c]:c.length===4?[c.slice(0,2),c.slice(2)]:null;
}
function anchorMatches(mark:Metadata|undefined,measure:Metadata){
 if(!mark?.anchor||(mark.anchor as Metadata).coordinate_space!==measure.coordinate_space||(mark.anchor as Metadata).source_object_id!==(measure.scientific_grid_identity as Metadata|undefined)?.source_grid_object_id)return false;
 const pts=annotationPoints(mark);if(!pts)return false;
 if(pts.length===2)return same(pts,measure.points)||same([...pts].reverse(),measure.points);
 return typeof measure.dc_reference_point_index==='number'&&same(pts[0],(measure.points as unknown[])[1-measure.dc_reference_point_index]);
}
function visible(measure:Metadata,current:ReturnType<ReturnType<typeof reader>['operand']>){
 const panel=current.panel;if(!panel||!Array.isArray(measure.points))return false;
 const bounds=panel.domain==='frequency'?panel.frequency_bounds_centers_xyxy:panel.source_rect_xyxy;
 if(!bounds)return false;
 // A DC-referenced peak stays visible when DC itself is outside a frequency zoom.
 const points=typeof measure.dc_reference_point_index==='number'?measure.points.filter((_,i)=>i!==measure.dc_reference_point_index):measure.points;
 return (points as number[][]).every(([x,y])=>x>=(bounds as number[])[0]&&y>=(bounds as number[])[1]&&x<=(panel.domain==='frequency'?(bounds as number[])[2]:(bounds as number[])[2]-1)&&y<=(panel.domain==='frequency'?(bounds as number[])[3]:(bounds as number[])[3]-1));
}
function sharedSource(a:Lineage,b:Lineage){
 const as=new Set(a.sources.map(x=>x.object_id));if(as.size)return b.sources.some(x=>as.has(x.object_id));
 const af=new Set(a.frames.map(x=>x.object_id));return b.frames.some(x=>af.has(x.object_id));
}
function singleFrame(lineage:Lineage){return lineage.frames.length===1?lineage.frames[0]:null;}

export function readImageMeasurements({workspace,objectId,limit=256}:MeasurementReadOptions={}){
 need(Number.isSafeInteger(limit)&&limit>=1&&limit<=512,'Measurement limit must be 1..512','INVALID_ARGUMENT');
 const r=reader(workspace),top=r.object(objectId).value,current=r.operand(objectId),frame=singleFrame(current.lineage);
 // A derived atlas view may deliberately give a saved measurement a new mark
 // ID. Follow only this display's immutable ancestry, and require its explicit
 // label reference to have matched the original scientific anchors there.
 // A moved current mark alone must never authorize rebinding another result.
 const displayHistory:Metadata[]=[];let display=top;const displaySeen=new Set();
 while((['annotate','view','fft_view','calibration','context'] as readonly unknown[]).includes(display.kind)){
  need(!displaySeen.has(display.object_id)&&displaySeen.size<64,'Display binding ancestry is cyclic or exceeds budget');displaySeen.add(display.object_id);displayHistory.push(display);
  const parent=display.parent_object_id??display.base_object_id;if(!parent)break;display=r.object(parent).value;
 }
 const requests=readdirSync(path.join(r.root,'requests'),{withFileTypes:true});
 need(requests.length<=MAX_REQUESTS,'Workspace request count exceeds bounded measurement read; use a narrower workspace','BUDGET_EXCEEDED');
 const records:MeasurementRecord[]=[];
 for(const item of requests){if(!item.name.endsWith('.json'))continue;need(item.isFile()&&!item.isSymbolicLink()&&REQUEST.test(item.name.slice(0,-5)),'Unexpected linked or invalid request metadata');
  const saved=r.json(path.join(r.root,'requests',item.name)).value;
  if(saved.state!=='completed'||(saved.response as Metadata|undefined)?.kind!=='measure')continue;
  const record=r.object((saved.response as Metadata).object_id),measure=record.value,input=r.operand(measure.parent_object_id);
  need((['measure','remeasure'] as readonly unknown[]).includes(record.parameters.action)&&record.parameters.object_id===measure.parent_object_id,'Measurement original input identity disagrees');
  need(same(measure.scientific_grid_identity,input.grid),'Measurement grid differs from its saved input');
  if(record.parameters.action==='measure')need(same(record.parameters.points,measure.points)&&(!record.parameters.coordinate_space||record.parameters.coordinate_space===measure.coordinate_space),'Measurement points differ from original request');
  else need(record.parameters.measurement_object_id===(measure.remeasurement as Metadata|undefined)?.previous_measurement_object_id,'Remeasurement predecessor identity disagrees');
  if(!sharedSource(current.lineage,input.lineage))continue;
  const sourceFrame=singleFrame(input.lineage),sameGrid=same(current.grid,measure.scientific_grid_identity),sameFrame=!!frame&&frame.object_id===sourceFrame?.object_id;
  const linkPath=path.join(r.root,'measurement-links',measure.object_id+'.json');let link:Metadata|null=null;
  if(existsSync(linkPath)){
   need(!lstatSync(path.dirname(linkPath)).isSymbolicLink(),'Measurement link directory is linked');link=r.json(linkPath).value;
   need(link.schema_version===1&&link.measurement_object_id===measure.object_id&&link.measurement_manifest_sha256===record.manifest_sha256&&link.input_object_id===measure.parent_object_id&&link.input_manifest_sha256===r.object(measure.parent_object_id).manifest_sha256,'Measurement convenience link does not match immutable provider records');
   need(ANNOTATION.test((link.annotation_id??'') as string)&&typeof link.name==='string'&&link.name.length<=256&&
    link.measurement_kind===(typeof measure.dc_reference_point_index==='number'?'dc_to_peak':'two_point')&&
    (link.previous_measurement_object_id??null)===((measure.remeasurement as Metadata|undefined)?.previous_measurement_object_id??null)&&
    ((r.object(measure.parent_object_id).value.annotations??[]) as Metadata[]).some(mark=>mark.annotation_id===link!.annotation_id&&anchorMatches(mark,measure)),
    'Measurement convenience link contradicts its saved annotation, endpoint kind or predecessor');
  }
  const marks=(top.annotations??[]) as Metadata[],explicit=link?.annotation_id??null;
  // A link can be absent if the scientific result committed but publishing the
  // convenience reference failed. Recover a unique creation association from
  // its immutable input before consulting the current (possibly moved) marks.
  const savedMatches=((r.object(measure.parent_object_id).value.annotations??[]) as Metadata[]).filter(mark=>anchorMatches(mark,measure));
  const anchorMatchesNow=marks.filter(mark=>anchorMatches(mark,measure));
  const inferred=savedMatches.length===1?savedMatches[0]:savedMatches.length>1?null:anchorMatchesNow.length===1?anchorMatchesNow[0]:null;
  const adopted=marks.filter(mark=>((mark.presentation as Metadata|undefined)?.label as Metadata|undefined)?.measurement_object_id===measure.object_id&&
   (mark.anchor as Metadata|undefined)?.source_object_id===(measure.scientific_grid_identity as Metadata|undefined)?.source_grid_object_id&&(mark.anchor as Metadata|undefined)?.coordinate_space===measure.coordinate_space&&
   displayHistory.some(value=>((value.annotations??[]) as Metadata[]).some(saved=>saved.annotation_id===mark.annotation_id&&saved.kind===mark.kind&&
    ((saved.presentation as Metadata|undefined)?.label as Metadata|undefined)?.measurement_object_id===measure.object_id&&anchorMatches(saved,measure))));
  const annotationId=adopted.length===1?adopted[0].annotation_id:explicit??inferred?.annotation_id??null;
  const selectedMark=marks.find(mark=>mark.annotation_id===annotationId),matched=!!selectedMark&&anchorMatches(selectedMark,measure);
  const calibrationChanged=sameGrid&&!same((measure.xy_calibration as Metadata|undefined)?.calibration_id,(current.record as Metadata|undefined)?.calibration_id);
  const geometryChanged=sameGrid&&!!annotationId&&!!selectedMark&&!matched;
  records.push({...measure,measurement_object_id:measure.object_id,measurement_manifest_sha256:record.manifest_sha256,
   input_object_id:measure.parent_object_id,annotation_id:annotationId,name:link?.name??(typeof inferred?.text==='string'?inferred.text:null),
   measurement_kind:typeof measure.dc_reference_point_index==='number'?'dc_to_peak':'two_point',
   previous_measurement_object_id:(measure.remeasurement as Metadata|undefined)?.previous_measurement_object_id??null,
   status:!sameGrid?'historical':calibrationChanged||geometryChanged?'needs_remeasurement':'current',
   same_grid:sameGrid,same_frame:sameFrame,visible_in_current_view:sameGrid&&visible(measure,current),annotation_matches_current:matched,
   source:{source_identity:input.lineage.source_identity,frame_index:sourceFrame?.frame_index??null,
    source_rect_xyxy:input.sourceRect,
    source_object_id:input.lineage.sources.length===1?input.lineage.sources[0].object_id:sourceFrame?.object_id??null}});
 }
 const superseded=new Set(records.map(x=>x.previous_measurement_object_id).filter(Boolean));
 for(const record of records)if(superseded.has(record.object_id))record.status='historical';
 records.sort((a,b)=>((b.created_utc??'') as string).localeCompare((a.created_utc??'') as string)||(a.object_id as string).localeCompare(b.object_id as string));
 return {schema_version:1,backend:BACKEND,workspace:r.root,
  current:{object_id:objectId,scientific_grid_identity:current.grid,source_identity:current.lineage.source_identity,
   frame_index:frame?.frame_index??null,shape_yx:current.value.shape_yx??null,dtype:current.value.dtype??null,
   domain:current.grid?.coordinate_space==='frequency_cycles_per_pixel'?'reciprocal_space':(current.record as Metadata|undefined)?.coordinate_domain??((['frequency','reciprocal'] as readonly unknown[]).includes(current.value.array_domain)?'reciprocal_space':current.value.array_domain==='spatial'||frame?.source_identity&&!(['dm3','dm4'] as readonly unknown[]).includes(frame?.source_file_format)?'real_space':'unknown'),
   xy_calibration:current.record,source_object_id:current.lineage.sources.length===1?current.lineage.sources[0].object_id:frame?.object_id??null,
   source_rect_xyxy:current.sourceRect,
   source_kind:current.lineage.sources.some(value=>value.kind==='dm_source')?(current.lineage.sources.find(value=>value.kind==='dm_source')!.source_file_format??'dm4'):current.lineage.sources.length?'tiff':frame?.origin==='explicit_imported_saved_capture'?((frame.upstream_backend as string|undefined)?.includes('digitalmicrograph')?'native_capture':'imported_capture'):'unknown',
   provenance:current.value.user_context??top.user_context??null},
  entries:records.slice(0,limit),total_count:records.length,truncated:records.length>limit,
  verification:'Immutable provider manifest SHA-256 and original completed journal response; metadata-only read, not a fresh pixel/source capture'};
}

export function writeMeasurementLink(workspace:unknown,link:unknown){
 need(link&&typeof link==='object'&&!Array.isArray(link)&&Object.keys(link).every(k=>(['schema_version','measurement_object_id','input_object_id','annotation_id','measurement_kind','name','previous_measurement_object_id'] as readonly unknown[]).includes(k))&&((link as Metadata).schema_version===undefined||(link as Metadata).schema_version===1),'Unexpected measurement link fields','INVALID_ARGUMENT');
 const entry=link as Metadata;
 const r=reader(workspace),measure=r.object(entry.measurement_object_id),input=r.object(entry.input_object_id);
 need(measure.value.kind==='measure'&&measure.value.parent_object_id===entry.input_object_id,'Measurement link input differs from actual provider record');
 need(ANNOTATION.test((entry.annotation_id??'') as string)&&typeof entry.name==='string'&&entry.name.length<=256,'Bound annotation ID and bounded measurement name required','INVALID_ARGUMENT');
 need(entry.measurement_kind===(typeof measure.value.dc_reference_point_index==='number'?'dc_to_peak':'two_point'),'Measurement kind differs from saved scientific endpoints');
 const previous=(measure.value.remeasurement as Metadata|undefined)?.previous_measurement_object_id??null;
 need((entry.previous_measurement_object_id??null)===previous,'Measurement link predecessor differs from actual provider record');
 const mark=((input.value.annotations??[]) as Metadata[]).find(m=>m.annotation_id===entry.annotation_id);
 need(mark&&anchorMatches(mark,measure.value),'Measurement annotation does not match committed scientific anchors');
 const value={schema_version:1,...entry,previous_measurement_object_id:previous,measurement_manifest_sha256:measure.manifest_sha256,input_manifest_sha256:input.manifest_sha256};
 const directory=path.join(r.root,'measurement-links');mkdirSync(directory,{recursive:true});need(!lstatSync(directory).isSymbolicLink(),'Measurement link directory is linked');
 const file=path.join(directory,measure.value.object_id+'.json');
 if(existsSync(file)){need(same(r.json(file).value,value),'Existing measurement link conflicts with original immutable reference','REQUEST_CONFLICT');return value;}
 const fd=openSync(file,'wx');try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}return value;
}
