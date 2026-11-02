// Optional loopback gesture surface over the real image_* stdio MCP server.
// It owns no scientific state: every saved revision is an existing tool object.
import http from 'node:http';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import type {AddressInfo} from 'node:net';
import type {PanelMetadata as Metadata,PanelClient,ImageToolReply,PanelState,PanelSelection,PanelEditState,PanelFrameIdentity,PanelDraftAcknowledgment} from '../lib/image_panel_contracts.mjs';
interface NativeImageReply {data:Metadata;png?:unknown;sequenceEvidence?:unknown;domainEvidence?:unknown;domainPng?:unknown;}
interface PreparedView {object:Metadata;png:unknown;clean:unknown;digest:string|null;baseId:unknown;display:unknown;displayId:unknown;sequenceEvidence?:unknown;domainEvidence?:unknown;domainPng?:unknown;}
interface PendingView {prepared:PreparedView;frameIdentity:PanelFrameIdentity|null;request_id:unknown;annotationIds?:unknown[];preserve_selection?:boolean;spatialReturnReference?:SpatialReturnReference|null;spatialReturnReason?:string;reason?:'unsaved_draft'|'window_capacity';}
export interface ImagePanelOptions {workspace?:string;python?:string;object_id?:string;port?:number;panel_id?:string|null;helper_session_id?:string;panel_generation?:number;resume_checkpoint?:unknown;client?:PanelClient;journalDirectory?:string;numeric_result_refs?:unknown;crystal_evidence_snapshot?:unknown;}
interface StdioClientOptions {workspace:string;python:string;serverPath?:string;}
interface PendingRPC {resolve:(value:unknown)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>;}

import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync,openSync,fsyncSync,closeSync,renameSync,realpathSync,statSync,linkSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Selection} from '../ui/image-panel/coordinates.mjs';
import {validateSpatialDomainEvidence} from '../ui/image-panel/evidence-contracts.mjs';
import {selectionRectangle} from '../ui/image-panel/coordinates.mjs';
import {annotationPresentation} from '../lib/image_workspace.mjs';
import {validate} from '../lib/runtime/schema.mjs';
import {figureDisplayParameters,readFigureRecipe,recipeIdentity} from '../ui/image-panel/figure-export.mjs';
import {readImageMeasurements,writeMeasurementLink} from '../lib/image_measurement_records.mjs';
import {framePreviewRecipe} from '../ui/image-panel/user-workflow.mjs';
import type {DisplayParameters} from '../ui/image-panel/figure-export.mjs';
import {resolveComposition} from '../lib/figure_composer_assets.mjs';
import {attachCrystalEvidence,crystalEvidenceForState,restoreCrystalEvidenceSnapshot,rememberCrystalScienceEvent} from '../lib/panel_crystal_evidence.mjs';
import {loadOwnedPanelRegistration} from '../lib/panel_ownership.mjs';
import {projectResultSemantics} from '../ui/image-panel/result-semantics.mjs';
import {checkObservationNote,checkResumableInputs} from '../ui/image-panel/observation-contract.mjs';
import {projectGpaEvidence} from '../ui/image-panel/gpa-evidence.mjs';
import {readSpatialReturnReference,validateSpatialReturn,spatialReturnState,SpatialReturnError} from '../lib/panel_spatial_return.mjs';
import type {SpatialReturnReference} from '../lib/panel_spatial_return.mjs';
import {PanelWindowStore} from '../lib/panel_window_collection.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const objectId=/^[a-f0-9]{32}$/;
const safeId=/^[A-Za-z0-9_-]{1,64}$/;
function publicImageObject(value:Metadata):Metadata{const fields=['source_file_format','source_reader','dm_dataset_index','dm_dataset','dm_catalog','calibration_admission','dm_plane_selection'];return {...publicObject(value),...projectGpaEvidence(value),...projectResultSemantics(value),...Object.fromEntries(fields.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]))};}
function fail(message:string,status=400):never{const e=new Error(message) as Error&{status:number};e.status=status;throw e;}
function fields(value:unknown,allowed:readonly string[]):asserts value is Metadata{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Unexpected action fields');}
function presentationUpdate(value:Metadata){if(value.presentation!==undefined)validate(value.presentation,annotationPresentation,'presentation');if(value.presentation_replace!==undefined&&(typeof value.presentation_replace!=='boolean'||value.presentation===undefined))fail('presentation_replace requires an explicit boolean and presentation metadata');}
// Saved manifests and fresh worker replies may serialize dictionary keys in a
// different order. Compare their complete values; array order stays significant.
function sameRecord(left:unknown,right:unknown){const sorted=(_key:string,value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,(value as Metadata)[key]])):value;return JSON.stringify(left,sorted)===JSON.stringify(right,sorted);}
function writeJournal(file:string,value:unknown){const fd=openSync(file,'wx');try{writeFileSync(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}}
function publicObject(value:Metadata):Metadata{
 const keys=['object_id','kind','request_id','parent_object_id','base_object_id','source_object_id','frame_index','page_count','pages','shape_yx','source_shape_yx','dtype','axes','display','panels','annotations','user_context','calibration','xy_calibration','calibration_record','calibration_status','active_calibration','calibration_dependency','calibration_review','display_calibration_id','frequency_axes','physical_frequency_axes','physical_frequency_magnitude','physical_frequency_unit','scale_bar','measurement','points','dx','dy','coordinate_space','coordinate_system','frequency_distance_cycles_per_pixel','pixel_period','image_coordinate_angle_degrees','physical_angle','physical_angle_degrees','physical_vector_xy','measurement_uncertainty','uncertainty_status','limitation','reciprocal_interpretation','distance_pixels','distance_physical','physical_distance','displacement_pixels','physical_displacement','physical_unit','period','period_unit','d_spacing','d_spacing_unit','fft_recomputed','scientific_data_changed','scientific_grid_identity','array_domain','scientific_semantics'];
 return Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
}
export class StdioImageClient implements PanelClient {
 declare child:ChildProcessWithoutNullStreams;declare next:number;declare pending:Map<unknown,PendingRPC>;declare stderr:string;
 private receivedRenderReferences?:Set<string>;private acknowledgedPreviewReferences?:Set<string>;
 constructor({workspace,python,serverPath=path.join(root,'server.mjs')}:StdioClientOptions){
  this.child=spawn(process.execPath,[serverPath],{env:{...process.env,DM_MCP_BACKEND:'images',DM_IMAGE_WORKSPACE:workspace,DM_IMAGE_PYTHON:python,MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_STRUCTURE_WORKSPACE:'',MICROSCOPY_CONTEXT_WORKSPACE:'',MICROSCOPY_EXECUTION_OBSERVABILITY:'0'},stdio:['pipe','pipe','pipe'],windowsHide:true});
  this.next=1;this.pending=new Map();let buffer='';this.stderr='';
  this.child.stderr.on('data',(c:Buffer)=>{this.stderr=(this.stderr+c).slice(-4000);});
  this.child.stdout.on('data',(c:Buffer)=>{buffer+=c;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const msg=JSON.parse(line) as Metadata,p=this.pending.get(msg.id);if(p){this.pending.delete(msg.id);clearTimeout(p.timer);p.resolve(msg);}}catch(e){this.rejectAll(e);}}});
  this.child.on('error',e=>this.rejectAll(e));this.child.on('exit',()=>this.rejectAll(new Error('MCP client exited '+this.stderr)));this.child.stdin.on('error',()=>{});
 }
 rejectAll(error:unknown){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
 rpc(method:string,params:Readonly<Record<string,unknown>>={}):Promise<unknown>{return new Promise<unknown>((resolve,reject)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Stopped waiting; query the journaled original request_id. Do not resubmit automatically.'));},130000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 private async acknowledgeDeliveredPreviews(name:string,data:Metadata):Promise<void>{
  const renderingWrites=new Set(['image_preview','image_compare','image_annotate','image_fft_batch','image_spatial_atlas','image_joint_observations','image_roi_propose','image_discovery','image_spatial_field','image_field_extend','image_feature_field','image_domain_map']);
  if(!renderingWrites.has(name))return;
  // Performance cache of THIS receiving client's successful immutable-reference
  // traversal. Never admission authority, never populated by read-only calls.
  const inspected=this.receivedRenderReferences??=new Set<string>(),acknowledged=this.acknowledgedPreviewReferences??=new Set<string>();
  if(inspected.size>4096)inspected.clear();if(acknowledged.size>4096)acknowledged.clear();
  // This is the receiving MCP client, after a complete reply was decoded. The
  // server never assumes its own completion/serialization proves delivery.
  const refs=new Set<string>(),records:Metadata[]=[data];
  const collect=(v:unknown):void=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){for(const x of v)collect(x);return;}for(const [key,x] of Object.entries(v)){if((key==='view_object_id'||key==='overview_object_id'||key.endsWith('_view_object_id')||key==='render_base_object_id'||key==='roi_object_id')&&typeof x==='string'&&objectId.test(x))refs.add(x);else if(x&&typeof x==='object')collect(x);}};
  collect(data);
  if(refs.size>100)throw new Error('Delivered preview reference budget exceeded; acknowledge explicitly');
  const seen=new Set<string>();let complete=true;
  while([...refs].some(ref=>!seen.has(ref)&&!inspected.has(ref))){if(seen.size>=100)throw new Error('Delivered render-reference budget exceeded; acknowledge explicitly');const object_id=[...refs].find(ref=>!seen.has(ref)&&!inspected.has(ref))!;seen.add(object_id);const response=(await this.rpc('tools/call',{name:'image_info',arguments:{object_id}})) as Metadata;if(response.error||(response.result as Metadata|undefined)?.isError){complete=false;continue;}const block=((response.result as Metadata).content as Metadata[]).find(c=>c.type==='text');if(block&&typeof block.text==='string'){const record=JSON.parse(block.text) as Metadata;if(record.object_id!==object_id)throw new Error('Delivered reference returned a different object');records.push(record);collect(record);}else complete=false;}
  const done=new Set<string>();
  for(const record of records){const ref=record.preview_execution as Metadata|undefined;if(ref?.version!==1||!safeId.test(String(ref.request_id))||ref.object_id!==record.object_id||done.has(String(ref.request_id)))continue;done.add(String(ref.request_id));const key=String(ref.request_id)+':'+String(ref.object_id);if(acknowledged.has(key))continue;
   const request_id='received-'+createHash('sha256').update(key).digest('hex').slice(0,48),response=(await this.rpc('tools/call',{name:'image_preview_acknowledge',arguments:{preview_request_id:ref.request_id,object_id:ref.object_id,request_id}})) as Metadata;
   if(response.error||(response.result as Metadata|undefined)?.isError)throw new Error('Preview acknowledgement remains unconfirmed; preserve original result and query its request');
   const block=((response.result as Metadata|undefined)?.content as Metadata[]|undefined)?.find(c=>c.type==='text'),receipt=block&&typeof block.text==='string'?JSON.parse(block.text) as Metadata:null;
   if(receipt?.state!=='completed'||receipt.kind!=='preview_acknowledgement'||receipt.request_id!==request_id||receipt.preview_request_id!==ref.request_id||receipt.original_object_id!==ref.object_id||receipt.operational_receipt!==true||receipt.scientific_object_created!==false)throw new Error('Invalid preview acknowledgement receipt; preserve the original request');
   acknowledged.add(key);
  }
  if(complete)for(const ident of seen)inspected.add(ident);
 }
 async tool(name:string,args:Readonly<Record<string,unknown>>):Promise<ImageToolReply>{const msg=(await this.rpc('tools/call',{name,arguments:args})) as Metadata;if(msg.error||(msg.result as Metadata|undefined)?.isError)throw new Error(((msg.error as Metadata|undefined)?.message??((msg.result as Metadata|undefined)?.content as Metadata[]|undefined)?.find(c=>c.type==='text')?.text??'MCP operation failed') as string);const data:unknown=JSON.parse((((msg as Metadata).result as Metadata).content as Metadata[]).find(c=>c.type==='text')!.text as string);const png=(((msg as Metadata).result as Metadata).content as Metadata[]).find(c=>c.type==='image'&&c.mimeType==='image/png');
  try{await this.acknowledgeDeliveredPreviews(name,data as Metadata);}catch(error){console.error('Saved scientific result is preserved; '+(error as Error).message);}
  return {data,png:png?.data};}

 async close(){if(this.child.exitCode===null)await new Promise<void>(resolve=>{this.child.once('exit',resolve);this.child.stdin.end();});}
}
function originalMark(mark:Metadata):Metadata{if(!mark.anchor)fail('A legacy mark has no unique scientific anchor; replace it through MCP first');return {...Object.fromEntries(['annotation_id','kind','status','text','note','color','line_width','arrowhead_size','arrow_length','presentation','purpose','selection_origin'].filter(k=>mark[k]!==undefined).map(k=>[k,mark[k]])),...mark.anchor};}
export async function createImagePanel({workspace,python,object_id,port=0,panel_id=null,helper_session_id,panel_generation,resume_checkpoint,client:givenClient,journalDirectory,numeric_result_refs,crystal_evidence_snapshot}:ImagePanelOptions={}){
 if(!path.isAbsolute(workspace??'')||!path.isAbsolute(python??'')||!objectId.test(object_id??''))throw new Error('Explicit absolute workspace/python and existing object_id required');
 if((helper_session_id===undefined)!==(panel_generation===undefined)||helper_session_id!==undefined&&(!objectId.test(helper_session_id)||!objectId.test(panel_id??'')||!Number.isSafeInteger(panel_generation)||panel_generation!<1))throw new Error('Invalid owned Panel helper generation');
 const checkpoint=resume_checkpoint===undefined?null:resume_checkpoint as Metadata;
 if(checkpoint&&(!helper_session_id||checkpoint.object_id!==object_id||checkpoint.panel_id!==panel_id||!objectId.test(String(checkpoint.helper_session_id))||!Number.isSafeInteger(checkpoint.panel_generation)||checkpoint.panel_generation!==panel_generation!-1||!Number.isSafeInteger(checkpoint.state_revision)||(checkpoint.state_revision as number)<0||!Number.isSafeInteger((checkpoint.edit_state as Metadata|undefined)?.draft_revision)||((checkpoint.edit_state as Metadata).draft_revision as number)<0))throw new Error('Invalid exact owned Panel resume checkpoint');
 if(checkpoint){numeric_result_refs=checkpoint.numeric_result_refs??null;crystal_evidence_snapshot=checkpoint.crystal_evidence??null;}
 const token=randomBytes(24).toString('hex'),evidenceToken=randomBytes(32).toString('hex'),session=randomBytes(8).toString('hex');
 let crystalEvidence=restoreCrystalEvidenceSnapshot(crystal_evidence_snapshot);
 const journal=journalDirectory??path.join(workspace!,'panel-journals',session);mkdirSync(journal,{recursive:true});
 const client=givenClient??new StdioImageClient({workspace:workspace!,python:python!});let tools:Metadata[],current!:Metadata,png:unknown,cleanPng:unknown=null,cleanHash:string|null=null,renderBaseId:unknown=null,sequence=0,selection:PanelSelection|null=null,busy:Promise<unknown>=Promise.resolve(),lastOperation:Metadata|null=null,frameIdentity:PanelFrameIdentity|null=null,effectiveDisplay:unknown=null,displaySourceObjectId:unknown=null,stateRevision=0,pendingResult:PendingView|null=null,researchObservation:Metadata|null=null,selectionTimer:ReturnType<typeof setTimeout>|null=null,selectionPersistenceError:string|null=null;
 let sequenceEvidence:unknown=null;
 let domainEvidence:unknown=null;
 let domainPng:unknown=null;
 let spatialReturnReference:SpatialReturnReference|null=null;
 const windowStore=new PanelWindowStore(),windowInputCalibrations=new Map<string,unknown>();
 let spatialReturnReason=checkpoint&&!Object.hasOwn(checkpoint,'spatial_return_reference')?'legacy_checkpoint_missing':'no_saved_return';
 const adoptSpatialReturn=(reference:SpatialReturnReference|null|undefined,reason?:string)=>{if(reference!==undefined){spatialReturnReference=reference;spatialReturnReason=reason??(reference?'':'no_saved_return');}};
 const sources=new Map<unknown,Metadata>(),figureBars=new Map<unknown,unknown>();
 const numericResults:Record<'statistics'|'profile',Metadata|null>={statistics:null,profile:null};
 const numericRecovery={state:numeric_result_refs===undefined?'not_requested':numeric_result_refs===null?'legacy_missing_refs':'pending',results:{} as Record<string,Metadata>};
 const numericResultRefs=():Record<string,{object_id:unknown;request_id:unknown}|null>=>Object.fromEntries(['statistics','profile'].map(kind=>{const value=(numericResults as Metadata)[kind];return [kind,objectId.test((((value as Metadata|undefined)?.object_id??'' as string) as string))&&safeId.test((((value as Metadata|undefined)?.request_id??'' as string) as string))?{object_id:(value as Metadata).object_id,request_id:(value as Metadata).request_id}:null];}));
 let editState:PanelEditState={draft_revision:0,dirty:false,gesture_active:false,selection:null,annotation_edit:null,base_object_id:null};
 try{const init=(await client.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'mcp-dm-local-image-panel',version:'1'}})) as Metadata;if(init.error)throw new Error((init.error as Metadata).message as string);
 tools=(((await client.rpc('tools/list')) as Metadata).result as Metadata).tools as Metadata[];}catch(caught){const error=caught as Error&{status?:number};await client.close();throw error;}const names=new Set(tools.map(t=>t.name));
 const journalCall=async(name:string,args:Metadata):Promise<NativeImageReply>=>{if(!names.has(name))fail('Tool unavailable: '+name);const write=name!=='image_info'&&name!=='image_result';if(write){args={...args,request_id:`panel-${session}-${++sequence}`};writeJournal(path.join(journal,`${args.request_id}.request.json`),{name,arguments:args});lastOperation={state:'submitted',tool:name,request_id:args.request_id,object_id:args.object_id};saveSelection();}try{const r=(await client.tool(name,args)) as NativeImageReply;if(write){writeJournal(path.join(journal,`${args.request_id}.response.json`),{object_id:r.data.object_id,request_id:args.request_id,state:r.data.state});if(r.data.state==='completed'&&lastOperation?.request_id===args.request_id){lastOperation={...lastOperation,state:'completed',object_id:r.data.object_id};saveSelection();}}return r;}catch(caught){const error=caught as Error&{status?:number};if(write)error.message+=` Original request_id=${args.request_id}; query image_result with this ID. Do not automatically repeat the operation.`;throw error;}};
 const displayObject=async(r:NativeImageReply):Promise<NativeImageReply>=>{
  if((['spatial_atlas','local_signature_compare','feature_field','spatial_field','field_extend','analysis_candidates','domain_map'] as readonly unknown[]).includes(r.data.kind)){
   const {result_semantics:omittedSemantics,...evidenceBase}=r.data;
   const evidence={...evidenceBase,...projectResultSemantics(r.data)};
   if((['spatial_field','field_extend','analysis_candidates','domain_map'] as readonly unknown[]).includes(evidence.kind))validateSpatialDomainEvidence(evidence);
   // A comparison may explicitly use an unverified R2 reference: that row
   // has no overview, but other saved rows can still have an exact FFT view.
   // Show one such view without changing the saved not-comparable evidence.
   const fallback=evidence.kind==='local_signature_compare'&&(evidence.source_entries as Metadata[]|undefined)?.find(row=>objectId.test(((row.view_object_id??'' as string) as string)))?.view_object_id;
   const displayId=objectId.test(((evidence.overview_object_id??'' as string) as string))?evidence.overview_object_id:fallback;
   if(!objectId.test(((displayId??'' as string) as string)))fail('Spatial evidence has no saved source overview or observation view');
   const shown=await journalCall('image_info',{object_id:displayId});
   return {...shown,domainEvidence:evidence,domainPng:(['feature_field','spatial_field','field_extend','analysis_candidates','domain_map'] as readonly unknown[]).includes(evidence.kind)?r.png??null:null};
  }
  if(r.data.kind==='joint_observations'){
   const evidence=r.data,frame=(evidence.frame_observations as Metadata[]|undefined)?.find(row=>row.frame_index===evidence.reference_index&&row.view_object_id);
   if(!frame)fail('Joint observations have no saved reference-frame view');
   const correspondence=(await journalCall('image_info',{object_id:evidence.correspondence_object_id})).data;
   if(correspondence.kind!=='region_correspondence'||correspondence.sequence_object_id!==evidence.sequence_object_id)fail('Joint evidence correspondence identity mismatch');
   const frameEvidence=((evidence as Metadata).frame_observations as Metadata[]).map(row=>{
    const mapping=((correspondence as Metadata).rows as Metadata[]).find(candidate=>candidate.frame_index===row.frame_index);
    if(!mapping||mapping.selected_object_id!==row.selected_object_id||mapping.status!==row.status)fail('Joint evidence frame identity mismatch');
    return {...row,method:mapping.method,basis:mapping.basis,reason:mapping.reason,shift_xy:mapping.shift_xy};
   });
   const shown=await journalCall('image_info',{object_id:frame.view_object_id});
   return {...shown,sequenceEvidence:{...projectResultSemantics(evidence),kind:evidence.kind,object_id:evidence.object_id,request_id:evidence.request_id,sequence_object_id:evidence.sequence_object_id,correspondence_object_id:evidence.correspondence_object_id,reference_index:evidence.reference_index,frame_observations:frameEvidence,observations:evidence.observations}};
  }
  let renderKind=r.data.kind,renderDtype=r.data.dtype;
  if((['tiff_source','dm_source'] as readonly unknown[]).includes(r.data.kind)||r.png&&r.data.kind!=='calibration')return r;
  if(r.data.kind==='calibration'){
   let base=r.data;
   for(let i=0;i<64&&base.kind==='calibration';i++)base=(await journalCall('image_info',{object_id:base.base_object_id})).data;
   if(base.kind==='tiff_source')return {...r,png:null};
   renderKind=base.kind;renderDtype=base.dtype;
  }
  fail('PREVIEW_REQUIRED: open an explicitly saved preview object. Panel does not create a preview as a fallback; recover any original preview request before submitting new work.');
 };
 // Prepare immutable render assets before committing the visible identity. A
 // draft can arrive while ancestry lookup/worker I/O is waiting.
 const prepareCurrent=async(r:NativeImageReply):Promise<PreparedView>=>{
  let value=r.data,display=null,displayId=null;const seen=new Set();
  for(let n=0;n<64;n++){
   if(seen.has(value.object_id))fail('Display ancestry contains a cycle');seen.add(value.object_id);
   if(value.display){display=structuredClone(value.display);displayId=value.object_id;break;}
   if((['tiff_source','dm_source'] as readonly unknown[]).includes(value.kind))break;
   const next=value.render_base_object_id??value.base_object_id??value.parent_object_id;
   if(!objectId.test(((next??'' as string) as string)))break;
   value=(await journalCall('image_info',{object_id:next})).data;
   if(n===63)fail('Display ancestry exceeds 64 records');
  }
  let base=r.data;
  if(objectId.test(((base.render_base_object_id??'' as string) as string)))base=(await journalCall('image_info',{object_id:base.render_base_object_id})).data;
  let clean=null,digest=null;
  const file=(base.files_sha256 as Metadata)?.['unannotated.png']?'unannotated.png':!((base.annotations as unknown[]|undefined)?.length)&&(base.files_sha256 as Metadata)?.['preview.png']?'preview.png':null;
  if(file&&r.png){
   if(!sameRecord(base.panels??[],r.data.panels??[]))fail('Clean render panel mapping differs from annotation revision');
   const directory=realpathSync(workspace!),target=realpathSync(path.join((workspace as string),'objects',(base.object_id as string),file)),relative=path.relative(directory,target);
   if(relative.startsWith('..')||path.isAbsolute(relative)||statSync(target).size>2*1024*1024)fail('Clean render lies outside bounded workspace');
   const bytes=readFileSync(target);digest=createHash('sha256').update(bytes).digest('hex');
   if(digest!==((base as Metadata).files_sha256 as Metadata)[file]||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('Clean PNG hash or format mismatch');
   clean=bytes.toString('base64');
  }else if(!(r.data.annotations as unknown[]|undefined)?.length){clean=r.png??null;digest=clean?createHash('sha256').update(Buffer.from(clean as string,'base64')).digest('hex'):null;}
  return {object:r.data,png:r.png??null,clean,digest,baseId:base.object_id,display,displayId,sequenceEvidence:r.sequenceEvidence,domainEvidence:r.domainEvidence,domainPng:r.domainPng};
 };
 const commitCurrent=(prepared:PreparedView,{annotationIds=[]}:{annotationIds?:unknown[]}={})=>{
  if(prepared.sequenceEvidence)sequenceEvidence=prepared.sequenceEvidence;
  if(prepared.domainEvidence){domainEvidence=prepared.domainEvidence;domainPng=prepared.domainPng??null;}
  current=prepared.object;png=prepared.png;cleanPng=prepared.clean;cleanHash=prepared.digest;renderBaseId=prepared.baseId;effectiveDisplay=prepared.display;displaySourceObjectId=prepared.displayId;selection=null;stateRevision++;
  // A saved drag is still the researcher's exact selection. Retain only the
  // explicitly edited mark; never infer a mark from array order or recency.
  if(annotationIds.length===1){
   const mark=(current.annotations as Metadata[]|undefined)?.find(value=>value.annotation_id===annotationIds[0]);
   const matches=mark?.anchor?((current.panels??[]) as Metadata[]).filter(value=>value.source_object_id===((mark as Metadata).anchor as Metadata).source_object_id&&(({frequency:'frequency_cycles_per_pixel',spatial_pixels:'source_pixels',source_array_indices:'source_array_indices'} as Metadata)[value.domain as string])===((mark as Metadata).anchor as Metadata).coordinate_space):[];
   if(mark?.status!=='retracted'&&mark?.kind!=='text'&&matches.length===1){
    try{selection=checkSelection({...(mark!.anchor as Metadata),kind:mark!.kind,panel:matches[0]});}
    catch{/* A valid saved mark outside this zoom is not a current selection. */}
   }
  }
  editState={draft_revision:editState.draft_revision,dirty:false,gesture_active:false,selection:null,annotation_edit:null,base_object_id:current.object_id};
 };
 const setCurrent=async(r:NativeImageReply)=>commitCurrent(await prepareCurrent(r));
 const describeSource=(value:Metadata,declared:unknown):Metadata=>{
  if((['synthetic_demo','synthetic','合成演示'] as readonly unknown[]).includes(declared))return {kind:'synthetic',label:'合成演示',basis:'explicit user_context.data_meaning statement'};
  if((['digitalmicrograph','digitalmicrograph-native','saved digitalmicrograph-native READ numeric snapshot','saved digitalmicrograph-native PROFILE numeric snapshot','saved digitalmicrograph-native HISTOGRAM numeric snapshot'] as readonly unknown[]).includes(value.upstream_backend))return {kind:'dm_capture',label:'DM 捕获',basis:'validated imported capture backend'};
  if((value.source_identity as Metadata|undefined)?.path&&(['dm3','dm4'] as readonly unknown[]).includes(value.source_file_format))return {kind:value.source_file_format,label:((value as Metadata).source_file_format as string).toUpperCase()+' 外部只读',filename:path.win32.basename(path.basename(((value.source_identity as Metadata).path as string))),dataset_index:value.dm_dataset_index??null,reader:value.source_reader??null,basis:'hashed '+((value as Metadata).source_file_format as string).toUpperCase()+' file decoded by the explicit external reader; not a live DM capture'};
  if((value.source_identity as Metadata|undefined)?.path)return {kind:'tiff',label:'用户指定 TIFF',filename:path.win32.basename(path.basename(((value.source_identity as Metadata).path as string))),basis:'fixed source TIFF provenance'};
  return {kind:'unknown',label:'来源未声明',basis:'no supported explicit source declaration'};
 };
 const findFrameIdentity=async(value:Metadata):Promise<PanelFrameIdentity|null>=>{const original=value.object_id,declared=(value.user_context as Metadata|undefined)?.data_meaning,visited=new Set();for(let n=0;n<64;n++){if(value.kind==='frame'){sources.set(original,describeSource(value,declared));return Number.isInteger(value.frame_index)?{frame_object_id:value.object_id,frame_index:value.frame_index as number,source_object_id:value.source_object_id,...(Number.isInteger(value.dm_dataset_index)?{dataset_index:value.dm_dataset_index as number}:{}),...(value.dm_plane_selection?{plane_selection:value.dm_plane_selection}:{})}:null;}if((['tiff_source','dm_source'] as readonly unknown[]).includes(value.kind)){sources.set(original,describeSource(value,declared));return null;}if(value.kind==='compare'||visited.has(value.object_id))return null;visited.add(value.object_id);const id=value.parent_object_id??value.base_object_id??value.source_object_id;if(!objectId.test(((id??'' as string) as string)))return null;value=(await journalCall('image_info',{object_id:id})).data;}return null;};
 const qualifySpatialReturn=async(raw:unknown)=>{
  const reference=readSpatialReturnReference(raw),view=await journalCall('image_info',{object_id:reference.view_object_id}),fft=await journalCall('image_info',{object_id:reference.fft_object_id});
  validateSpatialReturn(reference,view.data,view.png,await findFrameIdentity(view.data),fft.data,await findFrameIdentity(fft.data));
  windowInputCalibrations.set(reference.view_object_id,structuredClone(view.data.xy_calibration??null));
  return {reference,view};
 };
 const syncWindows=()=>windowStore.admit(current,frameIdentity,!spatialReturnReason?spatialReturnReference:null,spatialReturnReference?windowInputCalibrations.get(spatialReturnReference.view_object_id):undefined);
 const readWindowSaved=async(id:string)=>{
  const reply=await journalCall('image_info',{object_id:id});
  if(reply.data.object_id!==id||typeof reply.png!=='string'||!reply.png||reply.png.length>Math.ceil(2*1024*1024*4/3)+4)fail('Window has no bounded exact saved PNG asset',409);
  if(reply.data.kind==='annotate'&&reply.data.array_domain===undefined&&(reply.data.panels as Metadata[]|undefined)?.some(p=>p.domain==='frequency')){
   if(!objectId.test(String(reply.data.render_base_object_id)))fail('Annotated frequency window has no exact saved render base',409);
   const base=(await journalCall('image_info',{object_id:reply.data.render_base_object_id})).data;
   if(base.object_id!==reply.data.render_base_object_id||base.array_domain!=='frequency'||!sameRecord(base.panels??[],reply.data.panels??[])||reply.data.scientific_grid_identity!==undefined&&!sameRecord(base.scientific_grid_identity??null,reply.data.scientific_grid_identity))fail('Annotated frequency window differs from its saved scientific render base',409);
  }
  const expected=(reply.data.files_sha256 as Metadata|undefined)?.['preview.png'];
  if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))fail('Window has no saved preview hash',409);
  const directory=realpathSync(workspace!),target=realpathSync(path.join(workspace!,'objects',id,'preview.png')),relative=path.relative(directory,target);
  if(relative.startsWith('..')||path.isAbsolute(relative)||statSync(target).size>2*1024*1024)fail('Window PNG lies outside the bounded workspace',409);
  const bytes=readFileSync(target),delivered=Buffer.from(reply.png,'base64');
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||createHash('sha256').update(bytes).digest('hex')!==expected||!bytes.equals(delivered))fail('Window saved PNG hash or delivered asset mismatch',409);
  return {object:reply.data,frame:await findFrameIdentity(reply.data),png:reply.png};
 };
 const returnFailure=(error:unknown)=>error instanceof SpatialReturnError?error.code:'target_unavailable';
 try{
  const initial=await journalCall('image_info',{object_id});if(checkpoint&&!initial.png)fail('Owned resume requires the exact saved PNG view; no new preview is computed');
  await setCurrent(checkpoint?initial:await displayObject(initial));frameIdentity=await findFrameIdentity(current);syncWindows();
  if(numeric_result_refs!==undefined&&numeric_result_refs!==null){
   let validContainer=true;try{fields(numeric_result_refs,['statistics','profile']);}catch{validContainer=false;}
   for(const kind of ['statistics','profile']){
    const reference=validContainer?(numeric_result_refs as Metadata)[kind]:undefined;
    if(validContainer&&reference==null){numericRecovery.results[kind]={state:'not_saved'};continue;}
    try{
     if(!validContainer)throw new Error('Saved numeric reference container is invalid');fields(reference,['object_id','request_id']);
     if(!objectId.test(((reference.object_id??'' as string) as string))||!safeId.test(((reference.request_id??'' as string) as string)))throw new Error('Saved numeric reference identity is invalid');
     const value=(await journalCall('image_info',{object_id:reference.object_id})).data;
     if(value.object_id!==reference.object_id||value.kind!==kind||value.request_id!==reference.request_id||value.state!=='completed')throw new Error('Saved numeric result does not match its original object, kind and completed request');
     // Load the immutable record, not a new calculation. The existing panel
     // grid/calibration checks decide whether it can be shown as current.
     (numericResults as Metadata)[kind]=value;numericRecovery.results[kind]={state:'loaded_saved_record',...reference};
    }catch(caught){const error=caught as Error&{status?:number};numericRecovery.results[kind]={state:'unavailable',reason:error.message};}
   }
   numericRecovery.state=Object.values(numericRecovery.results).some(value=>value.state==='unavailable')?'partial':'completed';
  }
 }
 catch(caught){const error=caught as Error&{status?:number};await client.close();throw error;}
 const observationState=()=>researchObservation?{...structuredClone(researchObservation),current_view_relation:current.object_id===researchObservation.base_object_id?'same_saved_view':'different_saved_view_review_scope'}:null;
 const sourceIdentity=()=>sources.get(current.object_id)??describeSource(current,(current.user_context as Metadata|undefined)?.data_meaning);
 const draftPersistence=()=>({pending:selectionTimer!==null,error:selectionPersistenceError});
 const draftAck=():PanelDraftAcknowledgment=>({schema_version:1,panel_id,object_id:current.object_id,state_revision:stateRevision,edit_state:structuredClone(editState),selection,research_observation:observationState(),draft_persistence:draftPersistence()});
 const state=():PanelState=>{const value:PanelState={schema_version:1,panel_id,...(helper_session_id?{helper_session_id,panel_generation}:{}),sequence_evidence:sequenceEvidence,domain_evidence:domainEvidence,domain_png_base64:domainPng,numeric_results:numericResults,numeric_result_recovery:numericRecovery,backend:'external-image-workspace',state_revision:stateRevision,object:publicImageObject(current),source_identity:sourceIdentity(),effective_display:effectiveDisplay,display_source_object_id:displaySourceObjectId,render_base_id:renderBaseId,clean_png_base64:cleanPng,clean_png_sha256:cleanHash,frame_identity:frameIdentity,png_base64:png,tools:tools.map(t=>({name:t.name,inputSchema:t.inputSchema})),selection,last_operation:lastOperation,research_observation:observationState(),draft_persistence:draftPersistence(),edit_state:structuredClone(editState),spatial_return:spatialReturnState(spatialReturnReference,current,frameIdentity,spatialReturnReason),window_collection:windowStore.snapshot(),pending_result:pendingResult?{object_id:pendingResult.prepared.object.object_id,request_id:pendingResult.request_id,reason:pendingResult.reason??'unsaved_draft',scientific_operation_complete:true}:null};return {...value,crystal_evidence:crystalEvidenceForState(crystalEvidence,value)};};
 function writeSelection(){if(!current)return;const evidence=crystalEvidenceForState(crystalEvidence,state());const snapshot=evidence?(()=>{const {image_png_base64,...payload}=evidence.payload;void image_png_base64;return {...evidence,payload};})():null;const temp=path.join(journal,`.selection-${randomBytes(6).toString('hex')}.json`);writeJournal(temp,{schema_version:1,panel_id,...(helper_session_id?{helper_session_id,panel_generation}:{}),object_id:current.object_id,state_revision:stateRevision,frame_identity:frameIdentity,selection,edit_state:editState,spatial_return_reference:spatialReturnReference,window_collection:windowStore.checkpoint(),pending_result:pendingResult?{object_id:pendingResult.prepared.object.object_id,request_id:pendingResult.request_id,...(pendingResult.reason==='window_capacity'?{reason:'window_capacity'}:{}),...(pendingResult.spatialReturnReference!==undefined?{spatial_return_reference:pendingResult.spatialReturnReference}:{} )}:null,last_operation:lastOperation,numeric_result_refs:numericResultRefs(),crystal_evidence:snapshot,research_observation:observationState(),updated_utc:new Date().toISOString()});renameSync(temp,path.join(journal,'current-selection.json'));selectionPersistenceError=null;}
 // Only the replaceable gesture handoff snapshot is coalesced. Scientific
 // request/response journals keep their original before-dispatch fsync path.
 function saveSelection({coalesce=false}={}){
  if(selectionTimer!==null){clearTimeout(selectionTimer);selectionTimer=null;}
  if(coalesce){selectionTimer=setTimeout(()=>{selectionTimer=null;try{writeSelection();}catch(caught){const error=caught as Error&{status?:number};selectionPersistenceError=error.message;}},100);selectionTimer.unref?.();}
  else {try{writeSelection();}catch(caught){selectionPersistenceError=(caught as Error).message;throw caught;}}
 }
 const figureAsset=async(r:NativeImageReply)=>{
  const prepared=await prepareCurrent(r);
  if(!sameRecord(prepared.object.panels??[],current.panels??[]))fail('Figure base must retain the exact current source/render mapping; disable FFT axes before exporting',409);
  if(!prepared.clean||!prepared.digest)fail('A verified clean figure base is unavailable');
  return {...state(),figure_base:{object_id:r.data.object_id,request_id:r.data.request_id,clean_png_base64:prepared.clean,
   clean_png_sha256:prepared.digest,scale_bar:figureBars.get(current.object_id)??null,panels:structuredClone(prepared.object.panels??[])}};
 };
 const annotationIdentity=(value:Metadata):Metadata[]=>((value.annotations??[]) as Metadata[]).map(mark=>Object.fromEntries(['annotation_id','kind','anchor','status','text','note','presentation'].filter(key=>mark[key]!==undefined).map(key=>[key,mark[key]])));
 const verifyFigureDisplay=(prepared:PreparedView,nextFrame:PanelFrameIdentity|null,restore:Metadata)=>{
  if(!sameRecord(recipeIdentity({object:prepared.object,frame_identity:nextFrame}),restore.source)||!sameRecord(figureDisplayParameters(prepared.display,prepared.object.panels),restore.display)||!sameRecord(annotationIdentity(prepared.object),restore.annotations))fail('Restored figure display changed the scientific source, calibration, anchors, labels or exact render mapping; saved result was not adopted',409);
 };
 function saveResearchObservation(data:Metadata,{baseObjectId=data.parent_object_id,baseRevision=stateRevision,baseFrameIdentity=null}:{baseObjectId?:unknown;baseRevision?:number;baseFrameIdentity?:PanelFrameIdentity|null}={}){
  const observation=(data.user_context as Metadata|undefined)?.research_observation;
  if(data.kind!=='context'||!objectId.test(((data.object_id??'' as string) as string))||(observation as Metadata|undefined)?.kind!=='twinning_present'||!(['user_confirmed','synthetic_fixture'] as readonly unknown[]).includes((observation as Metadata).authority)||(data.research_observation_scope as Metadata|undefined)?.confirmation_scope!=='twinning_present_only'||(data.research_observation_scope as Metadata).source_object_id!==data.parent_object_id)fail('Research observation result is not a saved scoped context');
  researchObservation={object_id:data.object_id,request_id:data.request_id,...(structuredClone(observation) as Metadata),scope:structuredClone(data.research_observation_scope??null),base_object_id:baseObjectId,base_state_revision:baseRevision,base_frame_identity:structuredClone(baseFrameIdentity)};
  lastOperation={action:'research-observation',object_id:data.object_id,request_id:data.request_id,state:'completed',confirmation_scope:'twinning_present_only'};
  stateRevision++;saveSelection();return state();
 }
 const sourceForFrame=async()=>{let value=current;const visited=new Set();for(let n=0;n<64;n++){if((['tiff_source','dm_source'] as readonly unknown[]).includes(value.kind))return value.object_id;if(visited.has(value.object_id))break;visited.add(value.object_id);const next=value.parent_object_id??value.base_object_id??value.source_object_id;if(!objectId.test(((next??'' as string) as string)))break;value=(await journalCall('image_info',{object_id:next})).data;}fail('No explicit TIFF/DM-file source ancestry; choose another supported source');};
 const withCurrentContext=async(sourceId:unknown,{newFrame=false}={})=>{
  let target=sourceId;
  const context:Metadata=Object.fromEntries(Object.entries((current.user_context??{}) as Metadata).filter(([key])=>(['reconstruction_type','data_meaning','frame_meaning','xy_scale','value_unit','frame_scale','source_text'] as readonly unknown[]).includes(key)));
  if(Object.keys(context).length&&names.has('image_context'))target=(await journalCall('image_context',{object_id:target,metadata:context})).data.object_id;
  const calibration=current.xy_calibration;
  if((calibration as Metadata|undefined)?.calibration_id&&(!newFrame||(calibration as Metadata).scope==='sequence'))target=(await journalCall('image_calibrate',{object_id:target,calibration_object_id:(calibration as Metadata).calibration_id})).data.object_id;
  return target;
 };
 const checkSelection=(input:unknown):PanelSelection=>{const value=input as Metadata;fields(value,['kind','coordinate_space','source_object_id','coordinates','panel']);const lengths={point:2,line:4,arrow:4,rectangle:4,polygon:null},c=value.coordinates;if(!(((value as Metadata).kind as string) in lengths)||!Array.isArray(c)||!c.every(Number.isFinite)||!objectId.test(((value.source_object_id??'' as string) as string))||(value.kind==='polygon'?(c.length<6||c.length>64||c.length%2):c.length!==lengths[value.kind as keyof typeof lengths]))fail('Invalid scientific selection');const p=(current.panels as Metadata[]|undefined)?.find(p=>p.source_object_id===value.source_object_id&&sameRecord(p,value.panel));if(!p)fail('Selection must use an exact current panel');const space=({frequency:'frequency_cycles_per_pixel',spatial_pixels:'source_pixels',source_array_indices:'source_array_indices'} as Metadata)[p.domain as string];if(value.coordinate_space!==space)fail('Selection coordinate domain mismatch');const edges=(['rectangle','polygon'] as readonly unknown[]).includes(value.kind);let bounds;if(p.domain==='frequency'){const [h,w]=p.fft_shape_yx as number[],[x0,y0,x1,y1]=(p.fft_rect_xyxy??[0,0,w,h]) as number[],margin=edges?.5:0;bounds=[(x0-Math.floor(w/2)-margin)/w,(y0-Math.floor(h/2)-margin)/h,(x1-1-Math.floor(w/2)+margin)/w,(y1-1-Math.floor(h/2)+margin)/h];}else{const [x0,y0,x1,y1]=p.source_rect_xyxy as number[];bounds=[x0,y0,edges?x1:x1-1,edges?y1:y1-1];}for(let i=0;i<c.length;i++)if(c[i]<bounds[i%2]-1e-12||c[i]>bounds[i%2+2]+1e-12)fail('Selection lies outside current source window');if(value.kind==='rectangle'&&(c[0]>=c[2]||c[1]>=c[3]))fail('Rectangle needs increasing nonempty edges');if((['line','arrow'] as readonly unknown[]).includes(value.kind)&&c[0]===c[2]&&c[1]===c[3])fail('Line needs distinct endpoints');return structuredClone(value) as PanelSelection;};
 const act=async(input:unknown)=>{const body=input as Metadata;
  fields(body,['expected_object_id','draft_revision','action','params','lightweight']);if(body.lightweight!==undefined&&(body.action!=='draft'||typeof body.lightweight!=='boolean'))fail('lightweight is an explicit boolean for draft acknowledgments only');if(body.expected_object_id!==current.object_id)fail('Stale object revision; reload before editing',409);const p=body.params??{},startedRevision=body.draft_revision??editState.draft_revision;let r:NativeImageReply,figureRestore:Metadata|null=null;
  if(!Number.isSafeInteger(startedRevision)||(startedRevision as number)<0)fail('Invalid draft_revision');
  // Display-only operations share the exact current identity but never consume
  // its draft lease, pending result, original request, or scientific selection.
  if(body.action==='window-layout'||body.action==='close-window'){
   if(body.action==='window-layout'){fields(p,['collection_revision','windows']);windowStore.updateLayouts(p.collection_revision,p.windows);}
   else{fields(p,['collection_revision','window_id']);windowStore.close(p.collection_revision,p.window_id);}
   stateRevision++;saveSelection();return state();
  }
  // A pending result must not prevent saving the current observation. Such a
  // save can only adopt on the exact current grid, through the same guarded
  // path as an automatic annotation revision; the old pending entry survives.
  const pendingAnnotationSave=Boolean(pendingResult)&&(body.action==='mark'||body.action==='edit');
  if(pendingAnnotationSave&&lastOperation?.state==='submitted')fail('Original request is unresolved; query its original request_id before saving an annotation',409);
  const opensImage=(['frame','roi','fft','show','return-spatial','preview','calibrate','restore-figure-display','measurement-jump'] as readonly unknown[]).includes(body.action)||body.action==='edit-layout'&&(p as Metadata).auto_commit===false;
  if(pendingResult&&opensImage)fail('Resolve the pending saved result before opening another scientific view; close a read-only window if capacity is full',409);
  const scientificBefore=state();
  const fftReturnSource=body.action==='fft'?{object:current,png,frame:frameIdentity}:null;
  if(body.action==='draft'){const previousDraft=editState;fields(p,['draft_revision','dirty','gesture_active','selection','annotation_edit','confirm_persistence']);if(p.confirm_persistence!==undefined&&typeof p.confirm_persistence!=='boolean')fail('confirm_persistence must be an explicit boolean');if(!Number.isSafeInteger(p.draft_revision)||((p as Metadata).draft_revision as number)<editState.draft_revision||typeof p.dirty!=='boolean'||typeof p.gesture_active!=='boolean')fail('Invalid or stale draft revision',409);const picked=p.selection==null?null:checkSelection(p.selection);let annotationEdit=editState.annotation_edit??null;if(p.annotation_edit!==undefined){annotationEdit=null;if(p.annotation_edit!==null){const u=p.annotation_edit;fields(u,['annotation_id','coordinates','text','color','status','presentation']);if(u.presentation!==undefined)validate(u.presentation,annotationPresentation,'presentation');const mark=((current.annotations??[]) as Metadata[]).find(m=>m.annotation_id===u.annotation_id);if(!mark?.anchor)fail('Draft annotation must name an existing anchored mark');if(u.text!==undefined&&(typeof u.text!=='string'||u.text.length>256)||u.color!==undefined&&!(['cyan','orange','white','amber','green'] as readonly unknown[]).includes(u.color)||u.status!==undefined&&!(['hypothesized','user_confirmed','retracted'] as readonly unknown[]).includes(u.status))fail('Invalid annotation draft fields');const panels=((current.panels??[]) as Metadata[]).filter(p=>p.source_object_id===((mark as Metadata).anchor as Metadata).source_object_id&&(({frequency:'frequency_cycles_per_pixel',spatial_pixels:'source_pixels',source_array_indices:'source_array_indices'} as Metadata)[p.domain as string])===((mark as Metadata).anchor as Metadata).coordinate_space);if(panels.length!==1)fail('Draft annotation requires one exact current panel');const anchor=checkSelection({...(mark!.anchor as Metadata),kind:mark!.kind,coordinates:u.coordinates??(mark.anchor as Metadata).coordinates,panel:panels[0]});annotationEdit={...structuredClone(u),kind:mark.kind,coordinate_space:anchor.coordinate_space,source_object_id:anchor.source_object_id,panel:anchor.panel};}}editState={draft_revision:p.draft_revision as number,dirty:p.dirty,gesture_active:p.gesture_active,selection:p.selection===undefined?editState.selection:picked,annotation_edit:annotationEdit,base_object_id:current.object_id};if(p.selection!==undefined)selection=picked;saveSelection({coalesce:p.confirm_persistence!==true&&previousDraft.gesture_active===editState.gesture_active&&previousDraft.dirty===editState.dirty});return body.lightweight?draftAck():state();}
  if(body.action==='accept-result'){fields(p,[]);if(startedRevision!==editState.draft_revision)fail('Stale draft revision; inspect current state before accepting a result',409);if(editState.dirty||editState.gesture_active)fail('Save or explicitly discard draft before viewing pending result',409);if(pendingResult){if(!windowStore.canAdmit(pendingResult.prepared.object,pendingResult.frameIdentity))fail('Five image windows are open; close a read-only window before accepting the saved result',409);const selected=selection;commitCurrent(pendingResult.prepared,{annotationIds:pendingResult.annotationIds});adoptSpatialReturn(pendingResult.spatialReturnReference,pendingResult.spatialReturnReason);if(pendingResult.preserve_selection)selection=selected;frameIdentity=pendingResult.frameIdentity;syncWindows();lastOperation={action:'accept-result',object_id:current.object_id,request_id:pendingResult.request_id,...(pendingResult.annotationIds?.length?{annotation_ids:pendingResult.annotationIds}:{})};pendingResult=null;saveSelection();}return state();}
  if(body.action==='select'){fields(p,['selection']);selection=checkSelection(p.selection);saveSelection();return state();}
  if(body.action==='research-observation'){
   fields(p,['source_text','authority']);if(typeof p.source_text!=='string'||!p.source_text.trim()||p.source_text.length>1000||!(['user_confirmed','synthetic_fixture'] as readonly unknown[]).includes(p.authority))fail('Provide a bounded observation statement and its explicit human or synthetic authority');
   const baseObjectId=current.object_id,baseRevision=stateRevision,baseFrameIdentity=structuredClone(frameIdentity);
   r=await journalCall('image_context',{object_id:baseObjectId,metadata:{research_observation:{kind:'twinning_present',source_text:p.source_text,authority:p.authority}}});
   // The provider object is the scientific record. Keep only its reference in
   // panel state; neither swap the saved image nor consume a local draft.
   return saveResearchObservation(r.data,{baseObjectId,baseRevision,baseFrameIdentity});
  }
  if(body.action==='preview'){fields(p,['gamma','display_range','max_size','upscale','interpolation','frequency_rect','spectrum_axes','scale_bar','component']);r=await journalCall('image_preview',{...p,object_id:current.object_id});}
  else if(body.action==='restore-figure-display'){
   fields(p,['recipe']);if(editState.dirty||editState.gesture_active||pendingResult)fail('Save or resolve the current draft/result before restoring a figure display',409);
   readFigureRecipe(p.recipe,state());
   const display=figureDisplayParameters(((p as Metadata).recipe as Metadata).display_recipe,(((p as Metadata).recipe as Metadata).source as Metadata).panels),saved=(await journalCall('image_info',{object_id:((p as Metadata).recipe as Metadata).source_object_id})),savedDisplay=await prepareCurrent(saved),savedFrame=await findFrameIdentity(saved.data);
   if(!sameRecord(recipeIdentity({object:saved.data,frame_identity:savedFrame}),((p as Metadata).recipe as Metadata).source)||!sameRecord(figureDisplayParameters(savedDisplay.display,saved.data.panels),display))fail('Figure recipe does not match its authoritative saved source/display version',409);
   const args:Omit<DisplayParameters,'display_range'>&{display_range?:number[]}={...display},existing=figureDisplayParameters(effectiveDisplay,current.panels);
   // Constant automatically ranged images have equal saved limits. The worker
   // admits those only through unchanged inherited range, never explicit limits.
   if(args.display_range![0]===args.display_range![1]){
    if(!sameRecord(existing.display_range,args.display_range)||(existing as Metadata).representation!==(args as Metadata).representation||!sameRecord((existing as Metadata).spectrum_filter??null,(args as Metadata).spectrum_filter??null))fail('Cannot safely restore a constant display range from this current rendering; open the original display version',409);
    delete args.display_range;
   }
   figureRestore={source:structuredClone(((p as Metadata).recipe as Metadata).source),display,annotations:structuredClone(annotationIdentity(current))};
   try{r=await journalCall('image_preview',{object_id:current.object_id,...args});lastOperation={...lastOperation,action:'restore-figure-display',figure_restore:figureRestore};saveSelection();}
   catch(caught){const error=caught as Error&{status?:number};lastOperation={...lastOperation,action:'restore-figure-display',figure_restore:figureRestore};saveSelection();throw error;}
  }
  else if(body.action==='frame'){fields(p,['frame_index']);r=await journalCall('image_frame',{object_id:await sourceForFrame(),frame_index:p.frame_index,...(Number.isInteger(frameIdentity?.dataset_index)?{dataset_index:frameIdentity!.dataset_index}:{}),...(frameIdentity?.plane_selection?{plane_axes:(frameIdentity.plane_selection as Metadata).plane_axes_yx,plane_indices:(frameIdentity.plane_selection as Metadata).indices_by_source_axis}:{})});const target=await withCurrentContext(r.data.object_id,{newFrame:true});r=await journalCall('image_preview',{object_id:target,...framePreviewRecipe(current,effectiveDisplay as Metadata|null|undefined)});}
  else if(body.action==='roi'||body.action==='fft'){fields(p,body.action==='fft'?['selection','window','subtract_mean']:['selection']);if(body.action==='fft'&&(p.window!==undefined&&!(['hann','none'] as readonly unknown[]).includes(p.window)||p.subtract_mean!==undefined&&typeof p.subtract_mean!=='boolean'))fail('Invalid explicit FFT preprocessing');const selected=checkSelection(p.selection),rect=selectionRectangle(selected as unknown as Selection);if(selected.panel.domain==='frequency'){if(body.action==='fft')fail('FFT needs a spatial ROI, not a frequency crop');r=await journalCall('image_preview',{object_id:current.object_id,frequency_rect:rect});}else {if(selected.panel.domain!=='spatial_pixels')fail('Imported frequency arrays have no spatial ROI mapping');const target=await withCurrentContext(selected.source_object_id),recipe:Metadata=Object.fromEntries(['gamma','display_range','max_size','upscale','interpolation','component'].filter(key=>(effectiveDisplay as Metadata)?.[key]!==undefined).map(key=>[key,(effectiveDisplay as Metadata)[key]]));r=await journalCall(body.action==='fft'?'image_fft':'image_preview',{object_id:target,rect,...(body.action==='fft'?{window:p.window??'hann',subtract_mean:p.subtract_mean??true}:recipe)});}}
  else if(body.action==='mark'){fields(p,['selection','annotation_id','text','note','color','status','presentation','purpose','selection_origin']);if(p.note!==undefined)checkObservationNote(p.note,'note');if(p.presentation!==undefined)validate(p.presentation,annotationPresentation,'presentation');const selected=checkSelection(p.selection);if(p.annotation_id===undefined)p.annotation_id=`mark-${randomBytes(8).toString('hex')}`;if(!safeId.test((p.annotation_id as string)))fail('Invalid annotation_id');const old=current.annotations??[];if((old as Metadata[]).some(m=>m.annotation_id===p.annotation_id))fail('annotation_id already exists; choose it in the edit list');checkResumableInputs({annotations:[p]});const {panel,...anchor}=selected;r=await journalCall('image_annotate',{object_id:current.object_id,annotations:[...(old as Metadata[]).map(originalMark),{...anchor,annotation_id:p.annotation_id,...(p.purpose!==undefined?{purpose:p.purpose}:{}),...(p.selection_origin!==undefined?{selection_origin:p.selection_origin}:{}),text:p.text??'',...(p.note!==undefined?{note:p.note}:{}),color:p.color??'cyan',status:p.status??'hypothesized',...(p.presentation!==undefined?{presentation:p.presentation}:{})}]});}
  else if(body.action==='edit'){fields(p,['updates','auto_commit']);if(p.auto_commit!==undefined&&typeof p.auto_commit!=='boolean')fail('auto_commit must be an explicit boolean');if(!Array.isArray(p.updates)||p.updates.length!==1)fail('Edit exactly one existing annotation per gesture');const u=p.updates[0];fields(u,['annotation_id','coordinates','text','color','status','note','presentation','presentation_replace','purpose','selection_origin']);checkResumableInputs({updates:[u]});presentationUpdate(u);if(!((current.annotations??[]) as Metadata[]).some(m=>m.annotation_id===u.annotation_id))fail('Unknown annotation_id');r=await journalCall('image_annotate',{object_id:current.object_id,updates:p.updates});}
  else if(body.action==='edit-layout'){
   fields(p,['updates','auto_commit']);if(p.auto_commit!==undefined&&typeof p.auto_commit!=='boolean')fail('auto_commit must be an explicit boolean');
   if(!Array.isArray(p.updates)||!p.updates.length||p.updates.length>100)fail('Layout edits require 1..100 existing annotations');
   const ids=new Set();
   for(const u of p.updates){fields(u,['annotation_id','presentation','presentation_replace']);if(u.presentation===undefined)fail('Layout edits require presentation metadata');presentationUpdate(u);
    if(!((current.annotations??[]) as Metadata[]).some(m=>m.annotation_id===u.annotation_id)||ids.has(u.annotation_id))fail('Layout edits require distinct existing annotation IDs');ids.add(u.annotation_id);}
   r=await journalCall('image_annotate',{object_id:current.object_id,updates:p.updates});
  }
  else if(body.action==='statistics'||body.action==='profile'){
   fields(p,body.action==='statistics'?['selection','component']:['selection','component','sample_count']);
   const selected=checkSelection(p.selection);
   if(((current.panels??[]) as unknown[]).length!==1)fail('Inspect one explicit scientific input, not a comparison composite');
   let args:Metadata={object_id:current.object_id,component:p.component??'raw'};
   if(body.action==='statistics'){
    if(selected.kind!=='rectangle')fail('Draw an explicit ROI for array statistics');
    args={...args,[selected.panel.domain==='frequency'?'frequency_rect':'rect']:selectionRectangle(selected as unknown as Selection)};
   }else{
    if(!(['line','arrow'] as readonly unknown[]).includes(selected.kind)||selected.coordinates.length!==4)fail('Draw a two-point line for an intensity profile');
    args={...args,points:[selected.coordinates.slice(0,2),selected.coordinates.slice(2)],coordinate_space:selected.coordinate_space,sample_count:p.sample_count??128,line_width:1,interpolation:'nearest'};
   }
   r=await journalCall(body.action==='statistics'?'image_statistics':'image_profile',args);
   numericResults[body.action]=r.data;lastOperation={...r.data};selection=selected;saveSelection();return state();
  }
  else if(body.action==='measurement-jump'){
   fields(p,['measurement_object_id']);
   const entry=readImageMeasurements({workspace,objectId:current.object_id as string}).entries.find(value=>value.object_id===p.measurement_object_id);
   if(!entry)fail('Measurement is not in this source workspace',404);
   if(editState.dirty||editState.gesture_active)fail('Save or discard drafts before explicitly jumping to a historical view',409);
   r=await displayObject(await journalCall('image_info',{object_id:entry.input_object_id}));
  }
  else if(body.action==='measure'){
   fields(p,['selection','annotation_id','measurement_object_id']);const selected=checkSelection(p.selection),domain=selected.panel.domain;
   const mark=p.annotation_id===undefined?null:((current.annotations??[]) as Metadata[]).find(value=>value.annotation_id===p.annotation_id);
   if(p.annotation_id!==undefined&&(!mark||mark.kind!==selected.kind||!sameRecord((mark.anchor as Metadata|undefined)?.coordinates,selected.coordinates)||(mark.anchor as Metadata|undefined)?.source_object_id!==selected.source_object_id||(mark.anchor as Metadata|undefined)?.coordinate_space!==selected.coordinate_space))fail('Measurement mark does not match the exact saved scientific selection',409);
   const spectral=domain==='frequency',scalar=domain==='source_array_indices',peak=selected.kind==='point';
   if(!(['frequency','source_array_indices','spatial_pixels'] as readonly unknown[]).includes(domain))fail('Unsupported measurement domain');
   let dc=null;
   if(peak){
    if(spectral)dc=[0,0];
    else if(scalar){
     const record=current.xy_calibration;
     if((record as Metadata|undefined)?.status!=='active'||(record as Metadata).coordinate_domain!=='reciprocal_space'||
        !Array.isArray((record as Metadata).dc_index_xy)||((record as Metadata).dc_index_xy as unknown[]).length!==2||!((record as Metadata).dc_index_xy as Metadata[]).every(Number.isFinite))
       fail('A reciprocal peak requires an active calibration with an explicit DC; draw a two-point line for pixel geometry');
     dc=(record as Metadata).dc_index_xy;
    }else fail('Draw a two-point spatial line, or choose a reciprocal peak with an explicit DC');
   }else if(selected.coordinates.length!==4||!(['line','arrow'] as readonly unknown[]).includes(selected.kind))fail('Draw a two-point line or select a reciprocal peak');
   // measurement_operand resolves the saved view/annotation and its selected
   // calibration. Measure that exact revision without intermediate writes.
   const target=current.object_id;
   const args={object_id:target,points:peak?[dc,selected.coordinates]:[selected.coordinates.slice(0,2),selected.coordinates.slice(2)],
    coordinate_space:spectral?'frequency_cycles_per_pixel':scalar?'source_array_indices':'source_pixels'};
   if(p.measurement_object_id!==undefined){
    const entry=readImageMeasurements({workspace,objectId:current.object_id as string}).entries.find(value=>value.object_id===p.measurement_object_id);
    if(!entry||p.annotation_id&&entry.annotation_id!==p.annotation_id)fail('Original measurement is not bound to this annotation/source',409);
    r=await journalCall('image_remeasure',{object_id:target,measurement_object_id:entry.object_id,points:args.points,source_text:'Researcher revised or remeasured this exact saved GUI selection; no phase confirmation.'});
   }else r=await journalCall('image_measure',args);
   if(mark)writeMeasurementLink(workspace,{measurement_object_id:r.data.object_id,input_object_id:target,annotation_id:mark.annotation_id,measurement_kind:Number.isInteger(r.data.dc_reference_point_index)?'dc_to_peak':'two_point',name:mark.text??'',...(p.measurement_object_id?{previous_measurement_object_id:p.measurement_object_id}:{})});
   lastOperation={...publicImageObject(r.data),...(mark?{annotation_id:mark.annotation_id}:{}),...(peak?{reference:spectral?'mathematical DC [0,0]; geometric period, not phase identification':'recorded calibrated DC; not an independently verified beam centre'}:{})};
   crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'measure',scientificBefore,r.data,{annotation_id:mark?.annotation_id,source_object_id:selected.source_object_id});
   selection=selected;saveSelection();return state();
  }
  else if(body.action==='calibrate'){fields(p,['scope','xy_scale','source_text','coordinate_domain']);const calibrated=await journalCall('image_calibrate',{object_id:current.object_id,...p});r=await journalCall('image_preview',{object_id:calibrated.data.object_id});}
  else if(body.action==='figure-base'){
   fields(p,[]);
   const spectral=((current.panels??[]) as Metadata[]).some(panel=>panel.domain==='frequency');
   let step='scale';
   try{
    let bar=(current.scale_bar as Metadata|undefined)?.visible?structuredClone(current.scale_bar):null;
    if(!spectral&&(current.xy_calibration as Metadata|undefined)?.status==='active'&&(current.xy_calibration as Metadata).coordinate_domain==='real_space'&&!bar){
     const scaled=await journalCall('image_preview',{object_id:current.object_id,scale_bar:true});
     if(!sameRecord(scaled.data.panels??[],current.panels??[]))fail('Scale-bar source/render mapping changed',409);
     bar=scaled.data.scale_bar??null;
    }
    figureBars.set(current.object_id,bar);step='clean';
    r=await journalCall('image_preview',{object_id:current.object_id,...(spectral?{spectrum_axes:false}:{scale_bar:false})});
    lastOperation={action:'figure-base',figure_step:'clean',object_id:r.data.object_id,request_id:r.data.request_id,state:'completed'};
    const result=await figureAsset(r);saveSelection();return result;
   }catch(caught){const error=caught as Error&{status?:number};lastOperation={...lastOperation,action:'figure-base',figure_step:step};saveSelection();throw error;}
  }
  else if(body.action==='export'){fields(p,[]);mkdirSync(path.join((workspace as string),'exports'),{recursive:true});const output_dir=path.join((workspace as string),'exports',`panel-${session}-${sequence+1}`);r=await journalCall('image_export',{object_id:current.object_id,output_dir});lastOperation={...publicImageObject(r.data),output_dir};saveSelection();return state();}
  else if(body.action==='return-spatial'){
   fields(p,[]);
   if(lastOperation?.state==='submitted')fail('Original scientific request is unresolved; query its original request_id='+String(lastOperation.request_id??'unknown')+' before navigating',409);
   if(body.draft_revision!==editState.draft_revision||editState.dirty||editState.gesture_active||pendingResult)fail('Save or resolve the exact current draft and pending result before returning to the spatial observation',409);
   const offered=spatialReturnState(spatialReturnReference,current,frameIdentity,spatialReturnReason);
   if(offered.status!=='ready')fail('Spatial return unavailable: '+offered.reason_code,409);
   try{const qualified=await qualifySpatialReturn(spatialReturnReference);r=qualified.view;}
   catch(error){spatialReturnReason=returnFailure(error);try{spatialReturnReference=readSpatialReturnReference(spatialReturnReference);}catch{spatialReturnReference=null;}stateRevision++;saveSelection();fail('Spatial return unavailable: '+spatialReturnReason,409);}
  }
  else if(body.action==='show'){
   fields(p,['object_id','source_view']);if(!objectId.test(((p.object_id??'' as string) as string)))fail('Explicit existing object_id required');if(p.source_view!==undefined&&p.source_view!==true)fail('source_view must be true when provided');
   if(p.source_view){if(p.object_id!==frameIdentity?.frame_object_id)fail('Source view must name this exact frame',409);const target=await withCurrentContext(p.object_id);r=await journalCall('image_preview',{object_id:target});}
   else r=await displayObject(await journalCall('image_info',{object_id:p.object_id}));
  }
  else if(body.action==='recover'){fields(p,['request_id']);if(p.request_id!==undefined&&(typeof p.request_id!=='string'||!safeId.test(p.request_id)))fail('Valid original request_id required');let operation=lastOperation;const original=p.request_id??operation?.request_id;if(!safeId.test(((original??'' as string) as string)))fail('No valid saved request to query');if(p.request_id!==undefined){if(!existsSync(path.join(journal,`${original}.request.json`)))fail('Original request is not journaled by this panel',404);if(operation?.request_id!==original)operation={request_id:original};}r=await journalCall('image_result',{request_id:original});if(!r.data.object_id)fail('Original request has not returned an image object');if(operation!.action==='figure-base'){if(operation!.figure_step==='scale'){figureBars.set(current.object_id,r.data.scale_bar??null);return {...state(),figure_base_recovery:{state:'scale_render_saved_clean_render_not_submitted',request_id:original,object_id:r.data.object_id}};}return figureAsset(r);}if(operation!.action==='restore-figure-display')figureRestore=operation!.figure_restore as Metadata|null;if(r.data.kind==='context'&&(r.data.user_context as Metadata|undefined)?.research_observation)return saveResearchObservation(r.data);if((['statistics','profile'] as readonly unknown[]).includes(r.data.kind)){numericResults[r.data.kind as 'statistics'|'profile']=r.data;lastOperation=r.data;saveSelection();return state();}if((['measure','export'] as readonly unknown[]).includes(r.data.kind)){if(r.data.kind==='measure')crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'measure',scientificBefore,r.data,{annotation_id:operation?.annotation_id});lastOperation=publicImageObject(r.data);saveSelection();return state();}if(r.data.kind==='annotate')crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'edit',scientificBefore,r.data);if(r.data.kind==='calibration')crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'calibrate',scientificBefore,r.data);r=await displayObject(r);}
  else fail('Unknown panel action');
  if((['edit','mark','calibrate'] as readonly unknown[]).includes(body.action))crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,body.action as string,scientificBefore,r.data);
  const prepared=await prepareCurrent(r),nextFrame=await findFrameIdentity(r.data);
  if(body.action==='return-spatial'&&(editState.draft_revision!==startedRevision||editState.dirty||editState.gesture_active||pendingResult))fail('Draft changed while reading the saved spatial view; current view and edits are retained',409);
  let nextSpatialReturn:SpatialReturnReference|null|undefined,nextSpatialReason='no_saved_return';
  if(fftReturnSource){
   try{
    nextSpatialReturn=readSpatialReturnReference({version:1,view_object_id:fftReturnSource.object.object_id,frame_object_id:fftReturnSource.frame?.frame_object_id,fft_object_id:r.data.object_id,source_rect_xyxy:selectionRectangle(p.selection as unknown as Selection)});
    validateSpatialReturn(nextSpatialReturn,fftReturnSource.object,fftReturnSource.png,fftReturnSource.frame,r.data,nextFrame);
    windowInputCalibrations.set(nextSpatialReturn.view_object_id,structuredClone(fftReturnSource.object.xy_calibration??null));
    nextSpatialReason='';
   }catch(error){nextSpatialReturn=null;nextSpatialReason=returnFailure(error);}
  }
  if(figureRestore)verifyFigureDisplay(prepared,nextFrame,figureRestore as Metadata);
  const annotationIds=body.action==='mark'?[p.annotation_id]:(['edit','edit-layout'] as readonly unknown[]).includes(body.action)?((p as Metadata).updates as Metadata[]).map(value=>value.annotation_id):[];
  const affected={...(annotationIds.length?{annotation_ids:annotationIds}:{}),...(figureRestore?{figure_restore:figureRestore}:{})};
  const layoutEdit=body.action==='edit-layout',autoEdit=body.action==='edit'&&p.auto_commit===true||layoutEdit&&p.auto_commit!==false||pendingAnnotationSave;
  if(layoutEdit||autoEdit){
   if(!sameRecord(prepared.object.panels??[],current.panels??[])||!sameRecord(prepared.object.scientific_grid_identity??null,current.scientific_grid_identity??null))fail('Automatic annotation adoption requires the exact same scientific grid and render mapping',409);
  }
  if(autoEdit){
   const newerDraft=editState.draft_revision!==startedRevision||editState.gesture_active,latestEdit=structuredClone(editState),latestSelection=selection;
   commitCurrent(prepared,{annotationIds});frameIdentity=nextFrame;syncWindows();
   if(layoutEdit)selection=latestSelection;
   if(newerDraft){editState={...latestEdit,base_object_id:current.object_id};selection=latestSelection;}
   lastOperation={action:body.action,object_id:current.object_id,request_id:current.request_id,...affected};
   saveSelection();return {...state(),auto_edit_committed:true};
  }
  const capacityBlocked=!windowStore.canAdmit(prepared.object,nextFrame);
  if(editState.draft_revision!==startedRevision||editState.gesture_active||capacityBlocked){pendingResult={prepared,frameIdentity:nextFrame,request_id:r.data.request_id,annotationIds,reason:capacityBlocked?'window_capacity':'unsaved_draft',...(layoutEdit?{preserve_selection:true}:{}),...(nextSpatialReturn!==undefined?{spatialReturnReference:nextSpatialReturn,spatialReturnReason:nextSpatialReason}:{})};lastOperation={action:body.action,object_id:r.data.object_id,request_id:r.data.request_id,state:'completed_pending_view',...affected};}else{const selected=selection;commitCurrent(prepared,{annotationIds});adoptSpatialReturn(nextSpatialReturn,nextSpatialReason);if(layoutEdit)selection=selected;frameIdentity=nextFrame;syncWindows();lastOperation={action:body.action,object_id:current.object_id,request_id:current.request_id,...affected};}
  saveSelection();return state();
 };
 const presentationDirectory=path.join(journal,'presentations');mkdirSync(presentationDirectory,{recursive:true});
 const presentationReceipt=(id:unknown):unknown=>{if(!safeId.test(((id??'' as string) as string)))fail('Valid original request_id required');const response=path.join(presentationDirectory,`${id}.response.json`);if(existsSync(response))return JSON.parse(readFileSync(response,'utf8'));if(existsSync(path.join(presentationDirectory,`${id}.request.json`)))return {presentation:{request_id:id,status:'pending',limitation:'query original ID; never automatically resubmit'}};fail('Presentation request not found',404);};
 const present=async(input:unknown)=>{const body=input as Metadata;
  fields(body,['object_id','expected_object_id','draft_revision','request_id']);
  if(!objectId.test(((body.object_id??'' as string) as string))||!objectId.test(((body.expected_object_id??'' as string) as string))||!safeId.test(((body.request_id??'' as string) as string))||!Number.isSafeInteger(body.draft_revision)||((body as Metadata).draft_revision as number)<0)fail('Explicit object, expected view, draft revision and original request ID required');
  const file=path.join(presentationDirectory,`${body.request_id}.request.json`);
  if(existsSync(file)){const decoded:unknown=JSON.parse(readFileSync(file,'utf8'));const prior=decoded as Metadata;if(['object_id','expected_object_id','draft_revision','request_id'].some(key=>prior[key]!==body[key]))fail('Presentation request ID parameter conflict',409);return presentationReceipt(body.request_id);}
  if(body.expected_object_id!==current.object_id)fail('Stale panel object; read current selection again',409);
  if(pendingResult)fail('Resolve pending result before presenting another result',409);
  writeJournal(file,body);
  try{
   const r=await displayObject(await journalCall('image_info',{object_id:body.object_id})),prepared=await prepareCurrent(r),nextFrame=await findFrameIdentity(r.data);
   const capacityBlocked=!windowStore.canAdmit(prepared.object,nextFrame),queued=editState.dirty||editState.gesture_active||editState.draft_revision!==body.draft_revision||capacityBlocked;
   if(queued)pendingResult={prepared,frameIdentity:nextFrame,request_id:body.request_id,reason:capacityBlocked?'window_capacity':'unsaved_draft'};else{commitCurrent(prepared);frameIdentity=nextFrame;syncWindows();}
   saveSelection();const response={...state(),presentation:{request_id:body.request_id,status:queued?'queued':'shown',object_id:r.data.object_id}};writeJournal(path.join(presentationDirectory,`${body.request_id}.response.json`),response);return response;
  }catch(caught){const error=caught as Error&{status?:number};writeJournal(path.join(presentationDirectory,`${body.request_id}.response.json`),{presentation:{request_id:body.request_id,status:'failed',error:error.message}});throw error;}
 };
 const evidenceDirectory=path.join(journal,'crystal-presentations');mkdirSync(evidenceDirectory,{recursive:true});
 const evidenceReceipt=(id:unknown):unknown=>{if(!safeId.test(((id??'') as string)))fail('Valid original evidence request_id required');const response=path.join(evidenceDirectory,`${id}.response.json`);if(existsSync(response))return JSON.parse(readFileSync(response,'utf8'));if(existsSync(path.join(evidenceDirectory,`${id}.request.json`)))return {presentation:{request_id:id,status:'pending',limitation:'Query original ID; do not replay the attachment'}};fail('Evidence presentation request not found',404);};
 const presentEvidence=async(input:unknown)=>{const body=input as Metadata;
  fields(body,['expected_object_id','draft_revision','request_id','evidence']);
  if(!objectId.test((body.expected_object_id??'') as string)||!safeId.test((body.request_id??'') as string)||!Number.isSafeInteger(body.draft_revision)||(body.draft_revision as number)<0)fail('Explicit evidence view, draft revision and original request identity required');
  const file=path.join(evidenceDirectory,`${body.request_id}.request.json`);
  if(existsSync(file)){if(!sameRecord(JSON.parse(readFileSync(file,'utf8')),body))fail('Evidence request ID parameter conflict',409);return evidenceReceipt(body.request_id);}
  if(body.expected_object_id!==current.object_id||body.draft_revision!==editState.draft_revision)fail('Stale Panel view or draft; inspect current state before attaching evidence',409);
  if(editState.dirty||editState.gesture_active||editState.annotation_edit||pendingResult)fail('Save or discard the current draft and resolve pending results before attaching evidence',409);
  const envelope=restoreCrystalEvidenceSnapshot(body.evidence);if(!envelope||typeof envelope.payload.image_png_base64!=='string'||envelope.presentation_request_id!==body.request_id||envelope.attached_object_id!==current.object_id)fail('Evidence attachment identity or qualified asset differs from the owned view',409);
  // A separate private parent-only key admits this snapshot. The browser token
  // cannot forge provider-qualified evidence, and no image object is replaced.
  let verified;try{verified=attachCrystalEvidence(envelope.payload,state(),body.request_id as string);}catch(error){fail((error as Error).message,409);}
  writeJournal(file,body);crystalEvidence={...verified,geometry:envelope.geometry,geometry_scope:envelope.geometry_scope};stateRevision++;saveSelection();
  const response={...state(),presentation:{request_id:body.request_id,status:'attached',object_id:envelope.payload.object_id,scientific_object_created:false}};
  writeJournal(path.join(evidenceDirectory,`${body.request_id}.response.json`),response);return response;
 };
 const staticFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/coordinates.mjs',['coordinates.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/viewer-state.mjs',['viewer-state.mjs','text/javascript; charset=utf-8']],['/viewer-render.mjs',['viewer-render.mjs','text/javascript; charset=utf-8']],['/annotation-presentation.mjs',['annotation-presentation.mjs','text/javascript; charset=utf-8']],['/figure-export.mjs',['figure-export.mjs','text/javascript; charset=utf-8']],['/measurement-workspace.mjs',['measurement-workspace.mjs','text/javascript; charset=utf-8']],['/data-probes.mjs',['data-probes.mjs','text/javascript; charset=utf-8']],['/user-workflow.mjs',['user-workflow.mjs','text/javascript; charset=utf-8']]]);
 staticFiles.set('/figure-composer.mjs',['figure-composer.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/sequence-evidence.mjs',['sequence-evidence.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/domain-evidence.mjs',['domain-evidence.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/evidence-contracts.mjs',['evidence-contracts.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/roi-observations.mjs',['roi-observations.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/observation-contract.mjs',['observation-contract.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/research-workspace.mjs',['research-workspace.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/result-semantics.mjs',['result-semantics.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/gpa-evidence.mjs',['gpa-evidence.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/window-workspace.mjs',['window-workspace.mjs','text/javascript; charset=utf-8']);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  try{
   const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;if(req.headers.host!==`127.0.0.1:${(server.address() as AddressInfo).port}`)fail('Invalid Host',403);const url=new URL(req.url!,origin);
   if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
   if(req.method==='GET'&&staticFiles.has(url.pathname)){const [file,type]=staticFiles.get(url.pathname)!;res.setHeader('Content-Type',type);res.end(readFileSync(path.join(root,'ui','image-panel',file)));return;}
   const supplied=req.headers['x-panel-token'];if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))fail('Panel token required',403);
   if(req.headers.origin&&req.headers.origin!==origin)fail('Cross-origin requests refused',403);
   res.setHeader('Content-Type','application/json');
   if(req.method==='GET'&&url.pathname==='/api/state'){res.end(JSON.stringify(state()));return;}
   if(req.method==='GET'&&url.pathname==='/api/window-asset'){
    if([...url.searchParams.keys()].some(key=>!['window_id','revision'].includes(key))||url.searchParams.getAll('window_id').length!==1||url.searchParams.getAll('revision').length!==1||!/^\d{1,16}$/.test(url.searchParams.get('revision')??''))fail('Explicit saved window identity and collection revision required');
    const revision=Number(url.searchParams.get('revision')),entry=windowStore.lookup(url.searchParams.get('window_id'),revision),saved=await readWindowSaved(entry.object_id);
    // Immutable reads can overlap a new adoption or layout publication. Never
    // bind the completed bitmap to a newer object/window collection by recency.
    const latest=windowStore.lookup(entry.window_id,revision);
    if(latest.object_id!==entry.object_id||saved.frame?.frame_object_id!==windowStore.snapshot().frame_object_id||!windowStore.assetMatches(entry.window_id,saved.object))fail('Saved window asset changed while reading; inspect the current collection',409);
    res.end(JSON.stringify({schema_version:1,collection_revision:revision,window_id:entry.window_id,object_id:entry.object_id,object:publicImageObject(saved.object),png_base64:saved.png}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/measurements'){
    if([...url.searchParams.keys()].some(key=>key!=='object_id')||url.searchParams.get('object_id')!==current.object_id)fail('Measurement inspection requires the exact current object',409);
    const inspected=current.object_id,revision=stateRevision;
    const records=readImageMeasurements({workspace,objectId:inspected as string});
    res.end(JSON.stringify({...records,object_id:inspected,state_revision:revision}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/revision'){res.end(JSON.stringify({state_revision:stateRevision,object_id:current.object_id,pending_result:pendingResult?{object_id:pendingResult.prepared.object.object_id,request_id:pendingResult.request_id}:null,edit_state:{draft_revision:editState.draft_revision,dirty:editState.dirty,gesture_active:editState.gesture_active}}));return;}
   if(req.method==='GET'&&url.pathname==='/api/present'){res.end(JSON.stringify(presentationReceipt(url.searchParams.get('request_id'))));return;}
   if(req.method==='GET'&&url.pathname==='/api/evidence'){res.end(JSON.stringify(evidenceReceipt(url.searchParams.get('request_id'))));return;}
   if(req.method!=='POST'||!(['/api/action','/api/present','/api/evidence','/api/probe','/api/composition/resolve'] as readonly unknown[]).includes(url.pathname))fail('Not found',404);if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))fail('Same-origin JSON required',403);
   if(url.pathname==='/api/evidence'){const supplied=req.headers['x-panel-evidence-key'];if(typeof supplied!=='string'||supplied.length!==evidenceToken.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(evidenceToken)))fail('Parent-only admitted evidence capability required',403);}
   const requestLimit=url.pathname==='/api/evidence'?4*1024*1024:url.pathname==='/api/composition/resolve'?512*1024:64*1024;
   let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>requestLimit)fail('Request exceeds bounded JSON limit',413);raw+=chunk;}let decodedBody:unknown;try{decodedBody=JSON.parse(raw);}catch{fail('Invalid JSON');}const body=decodedBody as Metadata;
   if(url.pathname==='/api/composition/resolve'){
    fields(body,['composition']);
    const readObject=async(id:string)=>(await journalCall('image_info',{object_id:id})).data;
    const readState=async(id:string)=>{const r=await journalCall('image_info',{object_id:id}),saved=await prepareCurrent(r);return {object:saved.object,effective_display:saved.display,frame_identity:await findFrameIdentity(saved.object),clean_png_base64:saved.clean,clean_png_sha256:saved.digest};};
    const run=busy.then(()=>resolveComposition(body.composition,{readState,readObject}));busy=run.catch(()=>{});res.end(JSON.stringify({panels:await run}));return;
   }
   if(url.pathname==='/api/probe'){
    fields(body,['expected_object_id','source_object_id','coordinate_space','coordinates','component']);
    if(body.expected_object_id!==current.object_id)fail('Probe belongs to a changed current image',409);
    if(((current.panels??[]) as unknown[]).length!==1)fail('Inspect a single scientific array, not a comparison PNG');
    const selected=checkSelection({kind:'point',source_object_id:body.source_object_id,coordinate_space:body.coordinate_space,coordinates:body.coordinates,panel:((current as Metadata).panels as Metadata)[0]}),id=current.object_id,revision=stateRevision;
    const result=await client.tool('image_probe',{object_id:id,points:[selected.coordinates],coordinate_space:selected.coordinate_space,component:body.component??'raw'});
    if(current.object_id!==id||stateRevision!==revision)fail('Probe completed for an older image revision',409);
    if((result.data as Metadata).object_id!==id)fail('Probe returned a foreign scientific object',409);
    res.end(JSON.stringify({...(result.data as Metadata),state_revision:revision}));return;
   }
   if(url.pathname==='/api/action'&&body.action==='draft'){res.end(JSON.stringify(await act(body)));return;}
   const run=busy.then(()=>url.pathname==='/api/present'?present(body):url.pathname==='/api/evidence'?presentEvidence(body):act(body));busy=run.catch(()=>{});res.end(JSON.stringify(await run));
  }catch(caught){const error=caught as Error&{status?:number};res.statusCode=error.status??400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
 });
 try{if(checkpoint){
  if(!sameRecord(checkpoint.frame_identity??null,frameIdentity))fail('Saved owned checkpoint frame no longer matches the admitted object');
  const saved=checkpoint.edit_state as Metadata;fields(saved,['draft_revision','dirty','gesture_active','selection','annotation_edit','base_object_id']);
  if(typeof saved.dirty!=='boolean'||typeof saved.gesture_active!=='boolean'||saved.annotation_edit!==null&&(!saved.annotation_edit||typeof saved.annotation_edit!=='object'||Array.isArray(saved.annotation_edit)))fail('Invalid saved owned draft state');
  selection=checkpoint.selection==null?null:checkSelection(checkpoint.selection);
  editState={draft_revision:(saved.draft_revision as number)+1,dirty:saved.dirty,gesture_active:false,selection:saved.selection==null?null:checkSelection(saved.selection),annotation_edit:structuredClone(saved.annotation_edit) as Metadata|null,base_object_id:saved.base_object_id};
  if(!Number.isSafeInteger(editState.draft_revision))fail('Owned draft revision exhausted');
  stateRevision=(checkpoint.state_revision as number)+1;lastOperation=checkpoint.last_operation&&typeof checkpoint.last_operation==='object'?structuredClone(checkpoint.last_operation) as Metadata:null;
  if(checkpoint.research_observation){
   const saved=checkpoint.research_observation as Metadata;fields(saved,['object_id','request_id','kind','source_text','authority','scope','base_object_id','base_state_revision','base_frame_identity','current_view_relation']);
   if(!objectId.test(String(saved.object_id))||!safeId.test(String(saved.request_id))||!objectId.test(String(saved.base_object_id)))fail('Saved research observation has no exact provider reference');
   const admitted=(await journalCall('image_info',{object_id:saved.object_id})).data,observation=(admitted.user_context as Metadata|undefined)?.research_observation as Metadata|undefined;
   if(admitted.object_id!==saved.object_id||admitted.request_id!==saved.request_id||admitted.kind!=='context'||admitted.parent_object_id!==saved.base_object_id||observation?.kind!=='twinning_present'||!['user_confirmed','synthetic_fixture'].includes(String(observation.authority))||(admitted.research_observation_scope as Metadata|undefined)?.confirmation_scope!=='twinning_present_only'||!sameRecord(admitted.research_observation_scope,saved.scope)||!['kind','source_text','authority'].every(key=>sameRecord(observation[key],saved[key])))fail('Saved research observation does not match its provider source/scope');
   if(saved.base_frame_identity!=null&&!sameRecord(await findFrameIdentity(admitted),saved.base_frame_identity))fail('Saved research observation frame reference differs from provider');
   const {current_view_relation,...reference}=saved;void current_view_relation;researchObservation=structuredClone(reference);
  }
  if(checkpoint.spatial_return_reference!=null){try{spatialReturnReference=readSpatialReturnReference(checkpoint.spatial_return_reference);adoptSpatialReturn((await qualifySpatialReturn(spatialReturnReference)).reference);}catch(error){spatialReturnReason=returnFailure(error);}}
  syncWindows();
  if(checkpoint.window_collection!==undefined)await windowStore.restore(checkpoint.window_collection,current,frameIdentity,readWindowSaved);
  if(checkpoint.pending_result){const pending=checkpoint.pending_result as Metadata;fields(pending,['object_id','request_id','spatial_return_reference','reason']);if(!objectId.test(String(pending.object_id))||!safeId.test(String(pending.request_id))||pending.reason!==undefined&&!['window_capacity','unsaved_draft'].includes(String(pending.reason)))fail('Invalid saved pending result');const reply=await journalCall('image_info',{object_id:pending.object_id});if(!reply.png)fail('Saved pending view is not a saved PNG; no render was recomputed');pendingResult={prepared:await prepareCurrent(reply),frameIdentity:await findFrameIdentity(reply.data),request_id:pending.request_id,...(pending.reason?{reason:pending.reason as 'window_capacity'|'unsaved_draft'}:{})};
   if(Object.hasOwn(pending,'spatial_return_reference')){pendingResult.spatialReturnReference=null;try{if(pending.spatial_return_reference!==null){pendingResult.spatialReturnReference=readSpatialReturnReference(pending.spatial_return_reference);await qualifySpatialReturn(pendingResult.spatialReturnReference);pendingResult.spatialReturnReason='';}}catch(error){pendingResult.spatialReturnReason=returnFailure(error);}}
  }
 }}catch(error){await client.close();throw error;}
 try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});saveSelection();}catch(caught){const error=caught as Error&{status?:number};await client.close();throw error;}
 return {server,client,url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/#${token}`,token,evidenceToken,journal,state,async close(){try{await new Promise<void>(resolve=>server.close(resolve as (error?:Error)=>void));saveSelection();}finally{if(selectionTimer!==null){clearTimeout(selectionTimer);selectionTimer=null;}await client.close();}}};
}
if(isDirectInvocation(import.meta.url)){
 const options:Record<string,string>={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!(['--workspace','--python','--object','--port','--selection','--connection-file','--panel-id','--owned-registration'] as readonly unknown[]).includes(key)||!value)throw new Error('Usage: node tools/image_panel.mjs --workspace ABS --python ABS --object ID [--port 0]; --selection ABS_CURRENT_SELECTION_JSON');options[key.slice(2)]=value;}
 if(options.selection){if(!path.isAbsolute(options.selection)||!existsSync(options.selection))throw new Error('Existing absolute selection record required');process.stdout.write(readFileSync(options.selection));}
 else if(options['owned-registration']){
  if(options['connection-file']||options['panel-id']||options.port)throw new Error('Owned registration supplies its own exact identity and fresh loopback port');
  const owned=loadOwnedPanelRegistration(options.workspace,options['owned-registration']);const panel=await createImagePanel({workspace:options.workspace,python:options.python,object_id:options.object,panel_id:owned.panel_id,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory,...(owned.checkpoint?{resume_checkpoint:owned.checkpoint}:{})});
  try{owned.publish(panel);}catch(error){await panel.close();throw error;}
  process.stdout.write(JSON.stringify({url:panel.url,panel_id:owned.panel_id,helper_session_id:owned.helper_session_id,panel_generation:owned.generation})+'\n');let closing=false;const close=async()=>{if(!closing){closing=true;await owned.close(panel);}};process.on('SIGINT',close);process.on('SIGTERM',close);
 }
 else {if(options['connection-file']&&(!path.isAbsolute(options['connection-file'])||!objectId.test(options['panel-id']??'')||existsSync(options['connection-file'])))throw new Error('Absolute new connection file and random panel ID required');const panel=await createImagePanel({workspace:options.workspace,python:options.python,object_id:options.object,port:Number(options.port??0),panel_id:options['panel-id']??null});if(options['connection-file']){if(!path.isAbsolute(options['connection-file'])||!objectId.test(options['panel-id']??''))throw new Error('Absolute new connection file and random panel ID required');const temporary=options['connection-file']+'.'+randomBytes(8).toString('hex')+'.tmp';try{writeJournal(temporary,{schema_version:1,panel_id:options['panel-id'],port:(panel.server.address() as AddressInfo).port,token:panel.token,evidence_token:panel.evidenceToken,pid:process.pid});linkSync(temporary,options['connection-file']);}finally{if(existsSync(temporary))unlinkSync(temporary);}}process.stdout.write(JSON.stringify({url:panel.url,selection_path:path.join(panel.journal,'current-selection.json')})+'\n');let closing=false;const close=async()=>{if(!closing){closing=true;await panel.close();}};process.on('SIGINT',close);process.on('SIGTERM',close);}
}
