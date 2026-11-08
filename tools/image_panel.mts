import {JointResearchOwner} from '../lib/research_joint_owner.mjs';
// Optional loopback gesture surface over the real image_* stdio MCP server.
// It owns no scientific state: every saved revision is an existing tool object.
import http from 'node:http';
import {DesktopPublicResearch,PublicResearchRefused} from '../lib/desktop_public_research.mjs';
import {readOfflineResearch,readOfflineBinding,readOfflineResponse,offlineLead} from '../ui/image-panel/offline-research.mjs';
import {offlineContext,offlineLease} from '../lib/research_offline.mjs';
import {readResearchQuestion} from '../ui/image-panel/research-question.mjs';
import {readResearchLeads,readLeadDraft,sameResearchValue,referenceFromStatistics as referenceFromStatisticsOffline} from '../ui/image-panel/research-leads.mjs';
import {validateLeadEvidence,resolveResearchLeads} from '../lib/research_lead_evidence.mjs';
import {PanelRestoreReads} from '../lib/panel_restore_reads.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readImageFrameAncestry} from '../lib/image_frame_ancestry.mjs';
import {resolvePanelFrame} from '../lib/panel_frame_resolution.mjs';
import type {PanelFrameResolution} from '../lib/panel_frame_resolution.mjs';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import type {AddressInfo} from 'node:net';
import type {PanelMetadata as Metadata,PanelClient,ImageToolReply,PanelState,PanelSelection,PanelEditState,PanelFrameIdentity,PanelDraftAcknowledgment,PanelWindowViewContext,PanelWindowEntry,PanelMultiRoiHandoff,PanelSourceObservations,PanelSourceRoiObservation,PanelFftRoiRelation,PanelFftObservationMatch} from '../lib/image_panel_contracts.mjs';
interface NativeImageReply {data:Metadata;png?:unknown;sequenceEvidence?:unknown;domainEvidence?:unknown;domainPng?:unknown;}
interface PreparedView {object:Metadata;png:unknown;clean:unknown;digest:string|null;baseId:unknown;display:unknown;displayId:unknown;sequenceEvidence?:unknown;domainEvidence?:unknown;domainPng?:unknown;}
interface PendingView {prepared:PreparedView;frameIdentity:PanelFrameIdentity|null;request_id:unknown;annotationIds?:unknown[];preserve_selection?:boolean;spatialReturnReference?:SpatialReturnReference|null;spatialReturnReason?:string;inputViewContext?:PanelWindowViewContext|null;viewContextRestore?:PanelWindowViewContext|null;navigationLease?:boolean;reason?:'unsaved_draft'|'window_capacity';}
export interface ImagePanelOptions {workspace?:string;python?:string;object_id?:string;port?:number;panel_id?:string|null;helper_session_id?:string;panel_generation?:number;resume_checkpoint?:unknown;analysis_restore?:unknown;analysis_legacy?:boolean;execution_recovery_checkpoint?:unknown;client?:PanelClient;journalDirectory?:string;numeric_result_refs?:unknown;crystal_evidence_snapshot?:unknown;}
interface StdioClientOptions {workspace:string;python:string;serverPath?:string;}
interface PendingRPC {resolve:(value:unknown)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>;}

import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync,openSync,fsyncSync,closeSync,renameSync,realpathSync,statSync,lstatSync,linkSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Selection} from '../ui/image-panel/coordinates.mjs';
import {validateSpatialDomainEvidence} from '../ui/image-panel/evidence-contracts.mjs';
import {selectionRectangle} from '../ui/image-panel/coordinates.mjs';
import {annotationPresentation} from '../lib/image_workspace.mjs';
import {validate} from '../lib/runtime/schema.mjs';
import {figureDisplayParameters,readFigureRecipe,recipeIdentity} from '../ui/image-panel/figure-export.mjs';
import {readImageMeasurements,writeMeasurementLink} from '../lib/image_measurement_records.mjs';
import {readImageStatisticsHistory} from '../lib/image_statistics_history.mjs';
import {framePreviewRecipe} from '../ui/image-panel/user-workflow.mjs';
import type {DisplayParameters} from '../ui/image-panel/figure-export.mjs';
import {resolveComposition} from '../lib/figure_composer_assets.mjs';
import {attachCrystalEvidence,crystalEvidenceForState,restoreCrystalEvidenceSnapshot,rememberCrystalScienceEvent} from '../lib/panel_crystal_evidence.mjs';
import {loadOwnedPanelRegistration,readOwnedPanelConnection,readOwnedPanelCheckpoint} from '../lib/panel_ownership.mjs';
import {projectResultSemantics} from '../ui/image-panel/result-semantics.mjs';
import {checkObservationNote,checkResumableInputs} from '../ui/image-panel/observation-contract.mjs';
import {projectGpaEvidence} from '../ui/image-panel/gpa-evidence.mjs';
import {readSpatialReturnReference,validateSpatialReturn,spatialReturnState,SpatialReturnError} from '../lib/panel_spatial_return.mjs';
import type {SpatialReturnReference} from '../lib/panel_spatial_return.mjs';
import {PanelWindowStore,panelWindowMappingFingerprint,readPanelWindowCamera,readPanelWindowUiPanels,qualifyPanelWindowContext} from '../lib/panel_window_collection.mjs';
import {panelRoiHandoff,roiObservationModel} from '../ui/image-panel/roi-observations.mjs';
import {AnalysisWorkspace,acquireAnalysisWorkspaceOwner,readAnalysisWorkspace,readAnalysisWorkspaceInitial,readAnalysisWorkspaceResumeSnapshot,verifyAnalysisReferences} from '../lib/analysis_workspace.mjs';
import type {AnalysisSnapshot,AnalysisWorkspaceOwner} from '../lib/analysis_workspace.mjs';
import {writePanelExecutionInput,listPanelExecutionInputs,readPanelExecutionInput,panelJournalRelativePath} from '../lib/panel_execution_inputs.mjs';
import {imageAdmissionFailureFromError,readImageAdmissionFailure} from '../lib/runtime/image_admission_failure.mjs';
import {makePanelActionPreflight,panelBatchId} from '../ui/image-panel/panel-preflight.mjs';
import type {PanelActionPreflight} from '../ui/image-panel/panel-preflight.mjs';
import {readImageSourceProof,readImageSourceProofs,readSourceProofReferences} from '../lib/image_source_proofs.mjs';
import type {SourceProofReference,SourceProofProjection} from '../lib/image_source_proofs.mjs';
import type {PanelRoiSnapshot} from '../ui/image-panel/roi-observations.mjs';

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
 async tool(name:string,args:Readonly<Record<string,unknown>>):Promise<ImageToolReply>{const msg=(await this.rpc('tools/call',{name,arguments:args})) as Metadata;if(msg.error||(msg.result as Metadata|undefined)?.isError){const message=((msg.error as Metadata|undefined)?.message??((msg.result as Metadata|undefined)?.content as Metadata[]|undefined)?.find(c=>c.type==='text')?.text??'MCP operation failed') as string,admission=readImageAdmissionFailure((msg.result as Metadata|undefined)?.structuredContent,name,args.request_id);throw admission?Object.assign(new Error(message),admission,{status:admission.code.startsWith('WORKSPACE_')?409:502}):new Error(message);}const data:unknown=JSON.parse((((msg as Metadata).result as Metadata).content as Metadata[]).find(c=>c.type==='text')!.text as string);const png=(((msg as Metadata).result as Metadata).content as Metadata[]).find(c=>c.type==='image'&&c.mimeType==='image/png');
  try{await this.acknowledgeDeliveredPreviews(name,data as Metadata);}catch(error){console.error('Saved scientific result is preserved; '+(error as Error).message);}
  return {data,png:png?.data};}

 async close(){
  // A signal-stopped child retains exitCode=null; its exit event already fired.
  if(this.child.exitCode!==null||this.child.signalCode!==null)return;
  await new Promise<void>(resolve=>{this.child.once('exit',resolve);this.child.stdin.end();});
 }
}
function originalMark(mark:Metadata):Metadata{if(!mark.anchor)fail('A legacy mark has no unique scientific anchor; replace it through MCP first');return {...Object.fromEntries(['annotation_id','kind','status','text','note','color','line_width','arrowhead_size','arrow_length','presentation','purpose','selection_origin'].filter(k=>mark[k]!==undefined).map(k=>[k,mark[k]])),...mark.anchor};}
export async function createImagePanel({workspace,python,object_id,port=0,panel_id=null,helper_session_id,panel_generation,resume_checkpoint,analysis_restore,analysis_legacy=false,execution_recovery_checkpoint,client:givenClient,journalDirectory,numeric_result_refs,crystal_evidence_snapshot}:ImagePanelOptions={}){
 if(!path.isAbsolute(workspace??'')||!path.isAbsolute(python??'')||!objectId.test(object_id??''))throw new Error('Explicit absolute workspace/python and existing object_id required');
 if((helper_session_id===undefined)!==(panel_generation===undefined)||helper_session_id!==undefined&&(!objectId.test(helper_session_id)||!objectId.test(panel_id??'')||!Number.isSafeInteger(panel_generation)||panel_generation!<1))throw new Error('Invalid owned Panel helper generation');
 const checkpoint=resume_checkpoint===undefined?null:resume_checkpoint as Metadata;
 const explicitRestore=analysis_restore===undefined?null:analysis_restore as AnalysisSnapshot;
 if(explicitRestore){const saved=readAnalysisWorkspace(workspace!).savepoint,projected=readAnalysisWorkspaceResumeSnapshot(workspace!);if(explicitRestore.object_id!==object_id||!sameRecord(projected,explicitRestore))throw new Error('Analysis resume must be the exact explicit savepoint or initial reference');if(saved)verifyAnalysisReferences(workspace!,saved);}
 if(checkpoint&&(!helper_session_id||checkpoint.object_id!==object_id||checkpoint.panel_id!==panel_id||!objectId.test(String(checkpoint.helper_session_id))||!Number.isSafeInteger(checkpoint.panel_generation)||checkpoint.panel_generation!==panel_generation!-1||!Number.isSafeInteger(checkpoint.state_revision)||(checkpoint.state_revision as number)<0||!Number.isSafeInteger((checkpoint.edit_state as Metadata|undefined)?.draft_revision)||((checkpoint.edit_state as Metadata).draft_revision as number)<0))throw new Error('Invalid exact owned Panel resume checkpoint');
 if(checkpoint){numeric_result_refs=checkpoint.numeric_result_refs??null;crystal_evidence_snapshot=checkpoint.crystal_evidence??null;}
 let inheritedOperation:Metadata|null=null,inheritedJournal:string|null=null;
 if(execution_recovery_checkpoint!==undefined){
  if(!helper_session_id||!panel_id||!panel_generation)throw new Error('Execution recovery requires the exact owned helper successor');
  const connection=readOwnedPanelConnection(workspace!,panel_id),trusted=readOwnedPanelCheckpoint(workspace!,connection),operation=trusted.last_operation as Metadata|undefined;
  if(connection.schema_version!==2||connection.generation!==panel_generation-1||!sameRecord(trusted,execution_recovery_checkpoint)||operation?.state!=='submitted'||!safeId.test(String(operation.request_id)))throw new Error('Execution recovery is not the exact prior owned checkpoint request');
  const relative=operation.original_journal_relative_path??panelJournalRelativePath(workspace!,path.dirname(connection.checkpoint_file!));
  if(typeof relative!=='string'||!/^panel-journals\/[A-Za-z0-9_-]{1,128}$/.test(relative))throw new Error('Original execution journal is not an owned Panel journal');
  const root=realpathSync.native(workspace!),qualifiedRelative=panelJournalRelativePath(workspace!,path.join(root,...relative.split('/')));inheritedJournal=path.join(root,...qualifiedRelative.split('/'));const requestFile=path.join(inheritedJournal,operation.request_id+'.request.json'),entry=lstatSync(requestFile),file=realpathSync.native(requestFile),rel=path.relative(root,file);
  if(rel.startsWith('..')||path.isAbsolute(rel)||entry.isSymbolicLink()||!entry.isFile()||entry.size>64*1024)throw new Error('Original execution request escapes its bounded workspace');
  const original=JSON.parse(readFileSync(file,'utf8')) as Metadata,args=original.arguments as Metadata|undefined;
  if(original.name!==operation.tool||typeof original.name!=='string'||!original.name.startsWith('image_')||['image_info','image_result'].includes(original.name)||args?.request_id!==operation.request_id||operation.object_id!==undefined&&args?.object_id!==operation.object_id)throw new Error('Original execution request differs from the trusted checkpoint');
  inheritedOperation={...structuredClone(operation),original_journal_relative_path:relative,recovered_from_previous_helper:true};
 }
 const token=randomBytes(24).toString('hex'),evidenceToken=randomBytes(32).toString('hex'),session=randomBytes(8).toString('hex'),fftInputNonce=randomBytes(32).toString('hex');
 let crystalEvidence=restoreCrystalEvidenceSnapshot(crystal_evidence_snapshot);
 const journal=journalDirectory??path.join(workspace!,'panel-journals',session);mkdirSync(journal,{recursive:true});
 let publicResearch:DesktopPublicResearch|undefined;let jointOwner:JointResearchOwner|undefined;
 const client=givenClient??new StdioImageClient({workspace:workspace!,python:python!});let tools:Metadata[],current!:Metadata,png:unknown,cleanPng:unknown=null,cleanHash:string|null=null,renderBaseId:unknown=null,sequence=0,selection:PanelSelection|null=null,busy:Promise<unknown>=Promise.resolve(),lastOperation:Metadata|null=null,frameIdentity:PanelFrameIdentity|null=null,effectiveDisplay:unknown=null,displaySourceObjectId:unknown=null,stateRevision=0,pendingResult:PendingView|null=null,researchObservation:Metadata|null=null,selectionTimer:ReturnType<typeof setTimeout>|null=null,selectionPersistenceError:string|null=null;
 let sequenceEvidence:unknown=null;
 let domainEvidence:unknown=null;
 let domainPng:unknown=null;
 let spatialReturnReference:SpatialReturnReference|null=null;
 let windowStore=new PanelWindowStore();const windowInputCalibrations=new Map<string,unknown>();
 let spatialReturnReason=checkpoint&&!Object.hasOwn(checkpoint,'spatial_return_reference')?'legacy_checkpoint_missing':'no_saved_return';
 const adoptSpatialReturn=(reference:SpatialReturnReference|null|undefined,reason?:string)=>{if(reference!==undefined){spatialReturnReference=reference;spatialReturnReason=reason??(reference?'':'no_saved_return');}};
 const sources=new Map<unknown,Metadata>(),figureBars=new Map<unknown,unknown>();
 // Display diagnostics never substitute for a qualified read or grant a frame.
 let lastFrameDiagnostic:PanelState['frame_resolution']|null=null,legacyNullSource:{object_id:string;frame:PanelFrameIdentity;records_checked:number}|null=null;
 const frameDiagnostic=(value:Metadata,result:PanelFrameResolution)=>({object_id:value.object_id,status:result.status,reason_code:result.reason_code,records_checked:result.records_checked,ancestor_reads:result.ancestor_reads});
 const emptyLegacyWindows=(value:unknown)=>{const raw=value as Metadata|undefined;return Boolean(raw&&raw.schema_version===1&&raw.frame_object_id==null&&raw.active_window_id==null&&Array.isArray(raw.records)&&raw.records.length===0&&(!raw.windows||Array.isArray(raw.windows)&&raw.windows.length===0)&&(!raw.closed_windows||Array.isArray(raw.closed_windows)&&raw.closed_windows.length===0));};
 const deferredNull=(value:AnalysisSnapshot|Metadata,object:Metadata,result:PanelFrameResolution)=>value.object_id===object.object_id&&Object.hasOwn(value,'frame_identity')&&value.frame_identity===null&&emptyLegacyWindows(value.window_collection)&&value.pending_result==null&&value.spatial_return_reference==null&&(value.last_operation as Metadata|undefined)?.state!=='submitted'&&result.status==='found'&&result.records_checked===65&&result.ancestor_reads===64&&Boolean(result.frame)&&((object.panels??[]) as Metadata[]).length===1&&(object.panels as Metadata[])[0]?.domain==='spatial_pixels';
 const numericResults:Record<'statistics'|'profile',Metadata|null>={statistics:null,profile:null};
 const numericRecovery={state:numeric_result_refs===undefined?'not_requested':numeric_result_refs===null?'legacy_missing_refs':'pending',results:{} as Record<string,Metadata>};
 const numericResultRefs=():Record<string,{object_id:unknown;request_id:unknown}|null>=>Object.fromEntries(['statistics','profile'].map(kind=>{const value=(numericResults as Metadata)[kind];return [kind,objectId.test((((value as Metadata|undefined)?.object_id??'' as string) as string))&&safeId.test((((value as Metadata|undefined)?.request_id??'' as string) as string))?{object_id:(value as Metadata).object_id,request_id:(value as Metadata).request_id}:null];}));
 let editState:PanelEditState={draft_revision:0,dirty:false,gesture_active:false,selection:null,annotation_edit:null,base_object_id:null};
 let analysis:AnalysisWorkspace|undefined,analysisOwner:AnalysisWorkspaceOwner|undefined,workspaceDrafts:Metadata={},workingSelections:Metadata={},adoptedResults:unknown[]=structuredClone((checkpoint??explicitRestore)?.adopted_results??[]) as unknown[];
 const sourceProofScope=new AsyncLocalStorage<readonly SourceProofReference[]>(),sourceProofRecords=new Map<string,Metadata>();
 let researchQuestion=readResearchQuestion((checkpoint??explicitRestore)?.research_question);
 let researchLeads=readResearchLeads((checkpoint??explicitRestore)?.research_leads);
  let researchOffline=readOfflineResearch((checkpoint??explicitRestore)?.research_offline);
  const offlineActions=['stage-offline-candidate','accept-offline-candidate','reject-offline-candidate'];
 // Exact per-helper transport receipts, never a provider/scientific journal.
 const leadUpdateReceipts=new Map<string,{key:string;receipt:Metadata}>();
 const leadCommandKey=(value:unknown)=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const matchesLeadUpdate=(command:Metadata)=>{if(offlineActions.includes(String(command.action))){const c=researchOffline?.entries.find(c=>c.response.candidate_id===command.lead_id);if(!c)return false;if(command.action==='stage-offline-candidate')return sameResearchValue(c.binding,command.offline_binding)&&sameResearchValue(c.response,command.offline_response);if(command.action==='reject-offline-candidate')return c.status==='rejected'&&c.rejection_note===command.withdrawal_note;return c.status==='accepted'&&sameResearchValue(c.accepted_draft,offlineLead(readOfflineResponse(command.offline_response,c.binding),c.binding))&&researchLeads?.entries.some(e=>{const {created_utc,withdrawn_utc,withdrawal_note,...draft}=e;return sameResearchValue(draft,c.accepted_draft);})===true;}const ident=String(command.lead_id??(command.lead_draft as Metadata|undefined)?.lead_id??''),found=researchLeads?.entries.find(e=>e.lead_id===ident);if(!found)return false;if(command.action==='withdraw-research-lead')return Boolean(found.withdrawn_utc&&found.withdrawal_note===command.withdrawal_note);const {created_utc,withdrawn_utc,withdrawal_note,...saved}=found;void created_utc;void withdrawn_utc;void withdrawal_note;return sameResearchValue(saved,command.lead_draft);};
 const sourceProofRefs=()=>sourceProofScope.getStore()??readSourceProofReferences(adoptedResults);
 const rememberSourceProof=(proof:SourceProofProjection)=>{sourceProofRecords.set(proof.proof_object_id,{proof_object_id:proof.proof_object_id,manifest_sha256:proof.manifest_sha256,status:proof.status,purpose:proof.purpose,basis:proof.basis,original_qualification:proof.original_qualification,root_object_id:proof.root_object_id,frame_identity:proof.frame_identity,eligible_for_exact_scope:proof.eligible_for_exact_scope,eligible_for_strict_reuse:proof.eligible_for_strict_reuse,reason:proof.reason,last_checked_utc:new Date().toISOString()});return proof;};
 const sourceProofState=()=>({schema_version:1,records:[...sourceProofRecords.values()].map(record=>{const ref=sourceProofRefs().find(ref=>ref.object_id===record.proof_object_id),mismatch=Boolean(ref&&record.status==='verified'&&ref.manifest_sha256!==record.manifest_sha256);return {...record,...(mismatch?{status:'unavailable',eligible_for_exact_scope:false,eligible_for_strict_reuse:false,reason:'Adopted proof manifest differs from the currently observed proof; the original reference is retained'}:{}),adopted:Boolean(ref),adopted_manifest_sha256:ref?.manifest_sha256??null};}),references:sourceProofRefs()});
 let analysisCloseConfirmed=false;
 let workspaceTransition=false;const restoreReadScope=new AsyncLocalStorage<PanelRestoreReads<NativeImageReply>>();
 const panelPreflightErrors=new WeakMap<Error,PanelActionPreflight>();
 const panelActionScope=new AsyncLocalStorage<Metadata>();
 try{const init=(await client.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'mcp-dm-local-image-panel',version:'1'}})) as Metadata;if(init.error)throw new Error((init.error as Metadata).message as string);
 tools=(((await client.rpc('tools/list')) as Metadata).result as Metadata).tools as Metadata[];}catch(caught){const error=caught as Error&{status?:number};await client.close();throw error;}const names=new Set(tools.map(t=>t.name));
 const journalCall=async(name:string,args:Metadata,frozenFft?:{source_view_object_id:string;frame_object_id:string;selection:PanelSelection;annotation_id:string|null;calibration:unknown},operationContext?:Metadata):Promise<NativeImageReply>=>{if(!names.has(name))fail('Tool unavailable: '+name);const restoreReads=restoreReadScope.getStore();if(restoreReads&&name==='image_info'&&Object.keys(args).length===1&&objectId.test(String(args.object_id)))return restoreReads.read(String(args.object_id));if(restoreReads&&name==='image_info'&&Object.keys(args).length===2&&args.include_frame_ancestry===true&&objectId.test(String(args.object_id))){const capturedId=String(args.object_id);return restoreReads.readQualified('image_info:frame_ancestry:'+capturedId,async()=>(await client.tool('image_info',{object_id:capturedId,include_frame_ancestry:true})) as NativeImageReply);}const write=!['image_info','image_result','image_source_proof_info'].includes(name);if(write){analysis?.assertSemanticEditingAllowed();if(!['image_source_proof','image_source_proof_revoke'].includes(name)){const checked=readImageSourceProofs(workspace!,sourceProofRefs()).map(rememberSourceProof),invalid=checked.find(proof=>proof.status!=='verified'||!proof.eligible_for_exact_scope);if(invalid){const message='Adopted source proof is invalid: '+String(invalid.reason??invalid.status)+'; explicitly record and replace its reference before scientific writing',scope=panelActionScope.getStore(),proof=scope?.expected_object_id===current.object_id&&scope?.draft_revision===editState.draft_revision?makePanelActionPreflight(scope,'SOURCE_PROOF_INVALID'):null;if(proof){const error=Object.assign(new Error(message),{status:409});panelPreflightErrors.set(error,proof);throw error;}fail(message,409);}}const next=++sequence;let requestId=name==='image_source_proof'&&operationContext?.action==='source-proof'&&safeId.test(String(operationContext.request_id))?String(operationContext.request_id):`panel-${session}-${next}`;if(name==='image_fft'){if(!frozenFft)fail('GUI FFT needs an exact frozen input before dispatch',409);requestId=writePanelExecutionInput({workspace:workspace!,journal,session_nonce:fftInputNonce,sequence:next,parameters:args,...frozenFft,...(sourceProofRefs().length?{source_proof_refs:structuredClone(sourceProofRefs())}:{})}).request_id;}args={...args,request_id:requestId};writeJournal(path.join(journal,`${args.request_id}.request.json`),{name,arguments:args});lastOperation={state:'submitted',tool:name,request_id:args.request_id,object_id:args.object_id,...operationContext};saveSelection();}try{const r=(await client.tool(name,args)) as NativeImageReply;if(write){writeJournal(path.join(journal,`${args.request_id}.response.json`),{object_id:r.data.object_id,request_id:args.request_id,state:r.data.state});if(r.data.state==='completed'&&lastOperation?.request_id===args.request_id){lastOperation={...lastOperation,state:'completed',object_id:r.data.object_id};saveSelection();}}return r;}catch(caught){const error=caught as Error&{status?:number};if(write){const admission=imageAdmissionFailureFromError(error,name,args.request_id);if(admission){Object.assign(error,admission,{status:admission.code.startsWith('WORKSPACE_')?409:502});lastOperation={state:'not_submitted',tool:name,request_id:args.request_id,object_id:args.object_id,...operationContext,admission_failure:admission};stateRevision++;try{writeJournal(path.join(journal,`${args.request_id}.response.json`),{state:'not_submitted',request_id:args.request_id,admission_failure:admission});saveSelection();}catch(persistenceError){selectionPersistenceError=(persistenceError as Error).message;}error.message+=` Original request_id=${args.request_id} was not submitted; edits remain. A new attempt requires an explicit user action.`;}else error.message+=` Original request_id=${args.request_id}; query image_result with this ID. Do not automatically repeat the operation.`;}throw error;}};
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
 // This reads an existing immutable PNG only. It never creates a preview to
 // obtain a clean layer, including for legacy objects without a saved base.
 const readCleanRender=async(r:NativeImageReply)=>{
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
  return {clean,digest,base};
 };
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
  const {clean,digest,base}=await readCleanRender(r);
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
 const resolveFrame=async(value:Metadata,ancestry:Metadata[]|null=null,bundleAttempted=false)=>{
  // Only references already adopted by this exact restore/working snapshot may
  // participate. Each attempt freshly checks the complete proof DAG and files.
  const proofs=readImageSourceProofs(workspace!,sourceProofRefs()).map(rememberSourceProof),pathObjects:Metadata[]=[value];
  for(const proof of proofs)if(proof.status!=='verified'||!proof.eligible_for_exact_scope)fail('Explicit source proof is invalid: '+String(proof.reason??proof.status)+'; original objects and saved references are retained',409);
  const provenFrame=(candidate:Metadata)=>{const id=String(candidate.object_id);for(const proof of proofs){if(proof.status!=='verified'||!proof.eligible_for_exact_scope||!proof.frame_identity)continue;const dependency=(proof.dependencies as Metadata[]).find(entry=>entry.object_id===id);if(dependency&&createHash('sha256').update(readFileSync(path.join(workspace!,'objects',id,'object.json'))).digest('hex')===dependency.manifest_sha256)return proof.frame_identity as PanelFrameIdentity;}return null;};
  const direct=provenFrame(value);if(direct){const result:PanelFrameResolution={status:'found',frame:direct,terminal:value,records_checked:1,ancestor_reads:0,callback_reads:0,bundled:false,reason_code:'explicit_source_proof_verified'};lastFrameDiagnostic=frameDiagnostic(value,result);return result;}
  const schema=tools.find(tool=>tool.name==='image_info')?.inputSchema as Metadata|undefined,properties=schema?.properties as Metadata|undefined;
  if(ancestry===null&&!bundleAttempted&&(properties?.include_frame_ancestry as Metadata|undefined)?.type==='boolean'&&!['frame','tiff_source','dm_source','compare'].includes(String(value.kind))&&objectId.test(String(value.parent_object_id??value.base_object_id??value.source_object_id??''))){
   const qualified=await journalCall('image_info',{object_id:value.object_id,include_frame_ancestry:true});if(qualified.data.object_id!==value.object_id)fail('Source ancestry returned another root object',409);ancestry=readImageFrameAncestry(qualified.data.frame_ancestry,value);
  }
  let result=await resolvePanelFrame(value,async id=>{const object=(await journalCall('image_info',{object_id:id})).data;pathObjects.push(object);return object;},ancestry);
  // New ordinary revisions can reach an exactly proven member along the
  // unchanged bounded path. This resolves frame_path only, not new proof scope.
  if(result.status==='ancestry_budget_exhausted'){for(const member of ancestry??pathObjects){const frame=provenFrame(member);if(frame){result={...result,status:'found',frame,reason_code:'explicit_source_proof_path_verified'};break;}}}lastFrameDiagnostic=frameDiagnostic(value,result);
  if(result.status==='corrupt'||result.status==='cycle')fail('Source ancestry rejected: '+result.reason_code,409);
  if(result.terminal&&(result.status==='found'||result.status==='source_without_frame'||result.reason_code==='frame_index_unavailable'))sources.set(value.object_id,describeSource(result.terminal,(value.user_context as Metadata|undefined)?.data_meaning));return result;};
 const findFrameIdentity=async(value:Metadata,ancestry:Metadata[]|null=null,bundleAttempted=false):Promise<PanelFrameIdentity|null>=>(await resolveFrame(value,ancestry,bundleAttempted)).frame;
 const qualifySpatialReturn=async(raw:unknown)=>{
  const reference=readSpatialReturnReference(raw),view=await journalCall('image_info',{object_id:reference.view_object_id}),fft=await journalCall('image_info',{object_id:reference.fft_object_id});
  validateSpatialReturn(reference,view.data,view.png,await findFrameIdentity(view.data),fft.data,await findFrameIdentity(fft.data));
  windowInputCalibrations.set(reference.view_object_id,structuredClone(view.data.xy_calibration??null));
  return {reference,view};
 };
 const syncWindows=(inputViewContext?:PanelWindowViewContext|null)=>windowStore.admit(current,frameIdentity,!spatialReturnReason?spatialReturnReference:null,spatialReturnReference?windowInputCalibrations.get(spatialReturnReference.view_object_id):undefined,inputViewContext);
 const readWindowSaved=async(id:string,{includeFrameAncestry=false,includeCleanRender=false}={})=>{
  const schema=tools.find(tool=>tool.name==='image_info')?.inputSchema as Metadata|undefined,properties=schema?.properties as Metadata|undefined,ancestrySchema=properties?.include_frame_ancestry as Metadata|undefined;
  const bundled=includeFrameAncestry&&ancestrySchema?.type==='boolean',reply=await journalCall('image_info',{object_id:id,...(bundled?{include_frame_ancestry:true}:{})});
  const ancestry=bundled?readImageFrameAncestry(reply.data.frame_ancestry,reply.data):null;
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
  let cleanRender:Metadata|null=null;
  if(includeCleanRender){const {clean,digest,base}=await readCleanRender(reply);
   // An old object may lack enough evidence for a separate vector layer. Keep
   // its exact baked PNG in that case; do not replace it with a guessed base.
   const gridMatches=reply.data.scientific_grid_identity===undefined||sameRecord(reply.data.scientific_grid_identity,base.scientific_grid_identity??null),displayMatches=reply.data.display===undefined||sameRecord(reply.data.display,base.display??null);
   if(typeof clean==='string'&&clean&&digest&&gridMatches&&displayMatches){const cleanBytes=Buffer.from(clean,'base64');if(bytes.length>=24&&cleanBytes.length>=24&&bytes.subarray(16,24).equals(cleanBytes.subarray(16,24)))cleanRender={object_id:id,render_base_object_id:base.object_id,panel_mapping_fingerprint:panelWindowMappingFingerprint(reply.data),png_sha256:digest,png_base64:clean};}
  }
  // A provider may omit the optional projection. Do not request it twice before
  // following the original qualified parent-read path; malformed bundles throw.
  return {object:reply.data,frame:await findFrameIdentity(reply.data,ancestry,bundled),png:reply.png,cleanRender};
 };
 const returnFailure=(error:unknown)=>error instanceof SpatialReturnError?error.code:'target_unavailable';
 try{
  const initial=await journalCall('image_info',{object_id});if(checkpoint&&!initial.png)fail('Owned resume requires the exact saved PNG view; no new preview is computed');
  await setCurrent(checkpoint?initial:await displayObject(initial));const resolved=await resolveFrame(current);frameIdentity=resolved.frame;
  const prior=checkpoint??explicitRestore;if(prior&&deferredNull(prior,current,resolved)){legacyNullSource={object_id:String(current.object_id),frame:resolved.frame!,records_checked:resolved.records_checked};frameIdentity=null;}
  syncWindows();
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
 const state=():PanelState&{source_proofs:ReturnType<typeof sourceProofState>}=>{const value:PanelState={schema_version:1,...(jointOwner?{joint_research:jointOwner.snapshot()}:{}),panel_id,research_lead_session_id:session,...(researchOffline?{research_offline:structuredClone(researchOffline)}:{}),...(helper_session_id?{helper_session_id,panel_generation}:{}),sequence_evidence:sequenceEvidence,domain_evidence:domainEvidence,domain_png_base64:domainPng,numeric_results:numericResults,numeric_result_recovery:numericRecovery,backend:'external-image-workspace',state_revision:stateRevision,...(researchQuestion?{research_question:structuredClone(researchQuestion)}:{}),...(researchLeads?{research_leads:structuredClone(researchLeads),research_leads_reference_status:'not_revalidated_by_state_read' as const,research_leads_semantics:'caller_proposals_not_authenticated_or_scientifically_validated; next_step_is_unexecuted_plan; same_source_entries_are_not_independent_experiments; no_automatic_weighting_or_hypothesis_test' as const}:{}),object:publicImageObject(current),source_identity:sourceIdentity(),effective_display:effectiveDisplay,display_source_object_id:displaySourceObjectId,render_base_id:renderBaseId,clean_png_base64:cleanPng,clean_png_sha256:cleanHash,frame_identity:frameIdentity,...(frameIdentity===null&&lastFrameDiagnostic?.object_id===current.object_id?{frame_resolution:{...lastFrameDiagnostic!,...(sourceRecheckState()?{status:'recheck_required'}:{})}}:{}),...(sourceRecheckState()?{source_recheck:sourceRecheckState()!}:{}),png_base64:png,tools:tools.map(t=>({name:t.name,inputSchema:t.inputSchema})),selection,last_operation:lastOperation,research_observation:observationState(),draft_persistence:draftPersistence(),edit_state:structuredClone(editState),spatial_return:spatialReturnState(spatialReturnReference,current,frameIdentity,spatialReturnReason),window_collection:windowStore.snapshot(),panel_mapping_fingerprint:panelWindowMappingFingerprint(current),multi_roi_handoff_schema_version:1,...(analysis?{workspace_analysis:analysis.status(unresolvedRequest())}:{}),pending_result:pendingResult?{object_id:pendingResult.prepared.object.object_id,request_id:pendingResult.request_id,reason:pendingResult.reason??'unsaved_draft',scientific_operation_complete:true}:null};return {...value,source_proofs:sourceProofState(),crystal_evidence:crystalEvidenceForState(crystalEvidence,value)};};
 const sourceCheckPending=()=>lastOperation?.action==='recheck-source'&&lastOperation.state==='source_recheck_pending';
 const unresolvedRequest=()=>lastOperation?.state==='submitted'||sourceCheckPending()?String(lastOperation?.request_id??'unknown'):null;
 const sourceRecheckState=():PanelState['source_recheck']=>legacyNullSource&&legacyNullSource.object_id===current.object_id&&frameIdentity===null?{status:sourceCheckPending()?'pending':'available',reason_code:'legacy_terminal_not_evaluated',records_checked:legacyNullSource.records_checked,...(lastOperation?.action==='recheck-source'?{request_id:lastOperation.request_id}:{} )}:undefined;
 const checkpointSnapshot=():AnalysisSnapshot=>{
  const evidence=crystalEvidenceForState(crystalEvidence,state());
  const evidenceSnapshot=evidence?(()=>{const {image_png_base64,...payload}=evidence.payload;void image_png_base64;return {...evidence,payload};})():null;
  return {schema_version:1,object_id:current.object_id,state_revision:stateRevision,frame_identity:frameIdentity,selection,edit_state:editState,spatial_return_reference:spatialReturnReference,window_collection:windowStore.checkpoint(),pending_result:pendingResult?{object_id:pendingResult.prepared.object.object_id,request_id:pendingResult.request_id,...(pendingResult.reason==='window_capacity'?{reason:'window_capacity'}:{}),...(pendingResult.inputViewContext!==undefined?{input_view_context:pendingResult.inputViewContext}:{}),...(pendingResult.viewContextRestore!==undefined?{view_context_restore:pendingResult.viewContextRestore}:{}),...(pendingResult.navigationLease?{navigation_lease:true}:{}),...(pendingResult.spatialReturnReference!==undefined?{spatial_return_reference:pendingResult.spatialReturnReference}:{} )}:null,last_operation:lastOperation,numeric_result_refs:numericResultRefs(),crystal_evidence:evidenceSnapshot,research_observation:observationState(),updated_utc:new Date().toISOString(),window_drafts:structuredClone(workspaceDrafts),working_selections:{...workingSelections,...(windowStore.snapshot().active_window_id?{[windowStore.snapshot().active_window_id!]:workingSelection()}:{})},adopted_results:structuredClone(adoptedResults),...(researchQuestion?{research_question:structuredClone(researchQuestion)}:{}),...(researchLeads?{research_leads:structuredClone(researchLeads)}:{}),...(researchOffline?{research_offline:structuredClone(researchOffline)}:{})} as AnalysisSnapshot;
 };
 const workingSelectionFor=(picked:PanelSelection|null,value:Metadata=current)=>{
  if(!picked||picked.kind!=='rectangle')return null;
  const saved=((value.annotations??[]) as Metadata[]).some(mark=>mark.status!=='retracted'&&mark.kind===picked.kind&&mark.anchor&&sameRecord(mark.anchor,{source_object_id:picked.source_object_id,coordinate_space:picked.coordinate_space,coordinates:picked.coordinates}));
  return saved?null:structuredClone(picked);
 };
 const workingSelection=()=>workingSelectionFor(selection);
 const assertInteractionAllowed=(picked:PanelSelection|null,edit:PanelEditState,{object=current,frame=frameIdentity,window_id=windowStore.snapshot().active_window_id,drafts=workspaceDrafts}:{object?:Metadata;frame?:PanelFrameIdentity|null;window_id?:string|null;drafts?:Metadata}={})=>{
  if(!analysis?.status().recovery_available)return;const candidate=checkpointSnapshot();candidate.object_id=String(object.object_id);candidate.frame_identity=frame;candidate.selection=picked;candidate.edit_state=edit;candidate.window_drafts=drafts;candidate.working_selections={...(candidate.working_selections as Metadata),...(window_id?{[window_id]:workingSelectionFor(picked,object)}:{})};analysis.assertUpdateAllowed(candidate);
 };
 function writeSelection(){if(!current)return;const value=checkpointSnapshot();analysis?.update(value);const temp=path.join(journal,`.selection-${randomBytes(6).toString('hex')}.json`);writeJournal(temp,{...value,panel_id,...(helper_session_id?{helper_session_id,panel_generation}:{}),...(analysis?{analysis_workspace:analysis.status(unresolvedRequest())}:{})});renameSync(temp,path.join(journal,'current-selection.json'));selectionPersistenceError=null;}

 // Only the replaceable gesture handoff snapshot is coalesced. Scientific
 // request/response journals keep their original before-dispatch fsync path.
 function saveSelection({coalesce=false}={}){
  if(selectionTimer!==null){clearTimeout(selectionTimer);selectionTimer=null;}
  if(coalesce){selectionTimer=setTimeout(()=>{selectionTimer=null;try{writeSelection();}catch(caught){const error=caught as Error&{status?:number};selectionPersistenceError=error.message;}},100);selectionTimer.unref?.();}
  else {try{writeSelection();}catch(caught){selectionPersistenceError=(caught as Error).message;throw caught;}}
 }
 const validateAnalysisSnapshot=async(value:AnalysisSnapshot,{allowDeferredNull=false}={})=>{
  const refs=new Set<string>();const visit=(raw:unknown)=>{if(Array.isArray(raw))raw.forEach(visit);else if(raw&&typeof raw==='object')for(const [key,item]of Object.entries(raw)){if((key==='object_id'||key.endsWith('_object_id')||key==='calibration_id')&&objectId.test(String(item)))refs.add(String(item));else visit(item);}};visit(value);
  for(const id of refs){const saved=await journalCall('image_info',{object_id:id});if(saved.data.object_id!==id)fail('Analysis reference changed during qualification',409);}
  const questions=[readResearchQuestion(value.research_question),...(readResearchLeads(value.research_leads)?.entries.map(e=>e.question)??[]),...(readOfflineResearch(value.research_offline)?.entries.map(e=>e.binding.question)??[])],seenQuestions=new Set<string>();for(const question of questions){if(!question)continue;const key=question.context_object_id+':'+question.frame_object_id;if(seenQuestions.has(key))continue;seenQuestions.add(key);const context=await readWindowSaved(question.context_object_id,{includeFrameAncestry:true});if(context.frame?.frame_object_id!==question.frame_object_id)fail('Research question context differs from its exact saved source frame',409);}
  if(value.adopted_results!==undefined&&!Array.isArray(value.adopted_results))fail('Saved adopted-result references are invalid',409);
  for(const proof of readImageSourceProofs(workspace!,readSourceProofReferences(value.adopted_results??[]))){rememberSourceProof(proof);if(proof.status!=='verified'||!proof.eligible_for_exact_scope)fail('Adopted source proof is unavailable: '+String(proof.reason??proof.status),409);}
  for(const raw of (value.adopted_results??[]) as Metadata[]){if(raw.kind==='source_proof_reference_v1')continue;if(raw.kind!=='roi_lattice_comparison'||typeof raw.comparison_id!=='string'||typeof raw.report_sha256!=='string')fail('Unknown adopted-result reference',409);const module=await comparisonReports(),report=module.readRoiComparisonReport(workspace!,raw.comparison_id);if(createHash('sha256').update(JSON.stringify(report)).digest('hex')!==raw.report_sha256||report.source_save_id!==raw.source_save_id||report.source_revision!==raw.source_revision)fail('Adopted comparison no longer matches the exact saved reference',409);}
  const saved=await readWindowSaved(value.object_id,{includeFrameAncestry:true}),expected=value.frame_identity as PanelFrameIdentity|null;
  if(!sameRecord(saved.frame,expected)&&!(allowDeferredNull&&legacyNullSource?.object_id===value.object_id&&emptyLegacyWindows(value.window_collection)&&expected===null&&sameRecord(saved.frame,legacyNullSource.frame)))fail('Analysis source frame differs from its saved provider object',409);
 };
 const prepareAnalysisRestore=async(value:AnalysisSnapshot,{allowDeferredNull=false}={})=>{
  const restoredQuestion=readResearchQuestion(value.research_question),restoredLeads=readResearchLeads(value.research_leads);
  if(restoreReadScope.getStore())fail('Analysis restore qualification is already active',409);
  const reads=new PanelRestoreReads<NativeImageReply>(async id=>(await client.tool('image_info',{object_id:id})) as NativeImageReply,sameRecord);
  return sourceProofScope.run(readSourceProofReferences(value.adopted_results??[]),()=>restoreReadScope.run(reads,async()=>{
  await validateAnalysisSnapshot(value,{allowDeferredNull});const reply=await journalCall('image_info',{object_id:value.object_id}),prepared=await prepareCurrent(reply),resolved=await findFrameIdentity(reply.data),frame=allowDeferredNull&&legacyNullSource?.object_id===value.object_id&&value.frame_identity===null?null:resolved,candidate=new PanelWindowStore();candidate.admit(prepared.object,frame);
  await candidate.restore(value.window_collection,prepared.object,frame,readWindowSaved,checkSelection,windowStore.snapshot().revision);
  const stored=value.edit_state as Metadata;if(!stored||typeof stored.dirty!=='boolean'||stored.gesture_active===true)fail('Saved analysis contains an unfinished gesture',409);
  const selected=value.selection==null?null:checkSelection(value.selection,prepared.object),draftSelection=stored.selection==null?null:checkSelection(stored.selection,prepared.object);
  if(stored.annotation_edit){const edit=stored.annotation_edit as Metadata,mark=((prepared.object.annotations??[]) as Metadata[]).find(m=>m.annotation_id===edit.annotation_id&&m.status!=='retracted');if(!mark?.anchor)fail('Saved annotation draft no longer has its exact provider anchor',409);checkSelection({...(mark.anchor as Metadata),kind:mark.kind,coordinates:edit.coordinates??(mark.anchor as Metadata).coordinates,panel:edit.panel},prepared.object);}
  const restoredNumeric:Record<'statistics'|'profile',Metadata|null>={statistics:null,profile:null};
  for(const kind of ['statistics','profile'] as const){const ref=(value.numeric_result_refs as Metadata|undefined)?.[kind] as Metadata|undefined;if(ref){const data=(await journalCall('image_info',{object_id:ref.object_id})).data;if(data.kind!==kind||data.object_id!==ref.object_id||data.request_id!==ref.request_id||data.state!=='completed')fail('Saved numeric result differs from its provider reference',409);restoredNumeric[kind]=data;}}
  const restoredReference=value.spatial_return_reference?(await qualifySpatialReturn(value.spatial_return_reference)).reference:null;
  const restoredEvidence=restoreCrystalEvidenceSnapshot(value.crystal_evidence??null),restoredObservation=value.research_observation?structuredClone(value.research_observation) as Metadata:null;
  const nextRevision=editState.draft_revision+1;if(!Number.isSafeInteger(nextRevision))fail('Draft revision exhausted',409);
  await reads.verify();
  // No asynchronous reads remain after this synchronous commit boundary.
  return ()=>{commitCurrent(prepared);frameIdentity=frame;windowStore=candidate;selection=selected;editState={draft_revision:nextRevision,dirty:stored.dirty===true,gesture_active:false,selection:draftSelection,annotation_edit:structuredClone(stored.annotation_edit??null) as Metadata|null,base_object_id:current.object_id};workspaceDrafts=structuredClone(value.window_drafts??{}) as Metadata;workingSelections=structuredClone(value.working_selections??{}) as Metadata;adoptedResults=structuredClone(value.adopted_results??[]) as unknown[];researchQuestion=restoredQuestion;researchLeads=restoredLeads;researchOffline=readOfflineResearch(value.research_offline);researchObservation=restoredObservation;crystalEvidence=restoredEvidence;pendingResult=null;lastOperation=value.last_operation?structuredClone(value.last_operation) as Metadata:null;numericResults.statistics=restoredNumeric.statistics;numericResults.profile=restoredNumeric.profile;spatialReturnReference=restoredReference;spatialReturnReason=restoredReference?'':'no_saved_return';stateRevision++;};
  }));
 };
 const restoreAnalysisSnapshot=async(value:AnalysisSnapshot,options?:{allowDeferredNull?:boolean})=>{const commit=await prepareAnalysisRestore(value,options);commit();};

 const sourceCheckFile=(operation:Metadata,suffix:'request'|'response')=>{
  const relative=operation.original_journal_relative_path;
  if(operation.action!=='recheck-source'||!safeId.test(String(operation.request_id))||typeof relative!=='string'||!/^panel-journals\/[A-Za-z0-9_-]{1,128}$/.test(relative))fail('Source recheck has no exact original local journal',409);
  const directory=path.join(workspace!,...relative.split('/'));if(panelJournalRelativePath(workspace!,directory)!==relative)fail('Source recheck journal escaped the workspace',409);
  return path.join(directory,String(operation.request_id)+'.source-check.'+suffix+'.json');
 };
 const readSourceCheck=(operation:Metadata,suffix:'request'|'response')=>{
  const file=sourceCheckFile(operation,suffix),entry=lstatSync(file);if(entry.isSymbolicLink()||!entry.isFile()||entry.size>64*1024)fail('Source recheck journal is not a bounded ordinary file',409);
  const value=JSON.parse(readFileSync(file,'utf8')) as Metadata;if(value.schema_version!==1||value.action!=='recheck-source'||value.request_id!==operation.request_id||value.object_id!==operation.object_id||value.original_journal_relative_path!==operation.original_journal_relative_path||!sameRecord(value.frame_identity,operation.frame_identity))fail('Source recheck journal identity mismatch',409);return value;
 };
 const querySourceCheck=(request_id:unknown)=>{
  const operation=lastOperation;if(!operation||operation.action!=='recheck-source'||request_id!==operation.request_id){
   if(safeId.test(String(request_id))&&!existsSync(path.join(journal,String(request_id)+'.source-check.request.json')))return {...state(),source_recheck_query:{state:'not_journaled_here',request_id,automatic_retry:false,scope:'current_helper_only'}};
   fail('Query the exact original source recheck request',409);
  }
  readSourceCheck(operation,'request');const response=sourceCheckFile(operation,'response');
  if(!existsSync(response))return {...state(),source_recheck_query:{state:'unknown',request_id,automatic_retry:false,reason:'Original source recheck has no confirmed local completion; keep the current saved and working references.'}};
  const receipt=readSourceCheck(operation,'response');if(!['completed','failed','unknown'].includes(String(receipt.state)))fail('Invalid original source recheck outcome',409);
  if(receipt.state!=='unknown'){lastOperation={...operation,state:receipt.state==='completed'?'source_recheck_completed':'source_recheck_failed'};stateRevision++;saveSelection();}
  return {...state(),source_recheck_query:{...receipt,automatic_retry:false,applied_to_current_working:receipt.state==='completed'&&sameRecord(receipt.frame_identity,frameIdentity)&&current.object_id===receipt.object_id}};
 };
 const recheckSource=async(parameters:Metadata)=>{
  fields(parameters,['request_id','expected_state_revision','collection_revision','expected_working_revision']);if(!analysis||!analysisOwner||!legacyNullSource||legacyNullSource.object_id!==current.object_id||frameIdentity!==null)fail('No exact legacy saved-null source is waiting for qualification',409);
  if(!safeId.test(String(parameters.request_id)))fail('Source recheck needs an explicit original request ID',409);
  const candidateFrame=structuredClone(legacyNullSource.frame),object_id=String(current.object_id),beforeSelection=structuredClone(selection),draft=editState.draft_revision,collection=windowStore.snapshot().revision,working=parameters.expected_working_revision,save=analysis.status().save_id;
  const check=(revision:unknown)=>{analysisOwner!.assertOwned();analysis!.requireRevision(working);const status=analysis!.status(unresolvedRequest());
   if(current.object_id!==object_id||frameIdentity!==null||stateRevision!==revision||editState.draft_revision!==draft||editState.dirty||editState.gesture_active||editState.annotation_edit||pendingResult||selectionTimer!==null||selectionPersistenceError||!sameRecord(selection,beforeSelection)||!emptyLegacyWindows(windowStore.checkpoint())||status.dirty||status.recovery_available||status.unresolved_save_id||status.save_id!==save)fail('Source recheck input, draft, ownership or saved references changed; existing work is retained',409);windowStore.requireRevision(collection);};
  const nextDraft=draft+1;if(!Number.isSafeInteger(nextDraft))fail('Draft revision exhausted',409);
  analysis.requireRevision(working);if(unresolvedRequest())fail('Query the original pending request before source recheck',409);
  if(parameters.expected_state_revision!==stateRevision||parameters.collection_revision!==collection)fail('Source recheck needs the exact current state and window revision',409);check(stateRevision);
  const operation:Metadata={schema_version:1,action:'recheck-source',request_id:parameters.request_id,object_id,frame_identity:candidateFrame,original_journal_relative_path:panelJournalRelativePath(workspace!,journal)};
  const requestFile=sourceCheckFile(operation,'request');if(existsSync(requestFile)||existsSync(sourceCheckFile(operation,'response')))fail('Source recheck identity already exists; query the original operation',409);
  writeJournal(requestFile,{...operation,expected_state_revision:stateRevision,collection_revision:collection,expected_working_revision:working,source_save_id:save});
  lastOperation={...operation,state:'source_recheck_pending'};stateRevision++;let published=false;
  try{saveSelection();const expectedRevision=stateRevision,reads=new PanelRestoreReads<NativeImageReply>(async id=>(await client.tool('image_info',{object_id:id})) as NativeImageReply,sameRecord);
   await restoreReadScope.run(reads,async()=>{
    const raw=await journalCall('image_info',{object_id}),prepared=await prepareCurrent(raw),saved=await readWindowSaved(object_id,{includeFrameAncestry:true,includeCleanRender:true});check(expectedRevision);
    if(!sameRecord(prepared.object,current)||!sameRecord(saved.frame,candidateFrame))fail('The exact saved source or frame no longer matches the legacy boundary',409);
    const candidate=new PanelWindowStore();candidate.admit(prepared.object,saved.frame);const snapshot=candidate.snapshot(),active=snapshot.windows.find(entry=>entry.window_id===snapshot.active_window_id);
    if(active?.object_id!==object_id||active.role!=='source'||snapshot.frame_object_id!==candidateFrame.frame_object_id)fail('Source recheck cannot qualify an exact spatial working window',409);
    await reads.verify();const verified=await readWindowSaved(object_id,{includeFrameAncestry:true,includeCleanRender:true});if(!sameRecord(verified,saved))fail('Source references changed during recheck',409);check(expectedRevision);
    // No await remains. This changes only the new working reference, not any
    // provider object, scientific request, origin or explicit saved point.
    published=true;windowStore.admit(prepared.object,candidateFrame);frameIdentity=structuredClone(candidateFrame);editState={...editState,draft_revision:nextDraft};stateRevision++;saveSelection();
    writeJournal(sourceCheckFile(operation,'response'),{...operation,state:'completed',working_revision:analysis!.status().working_revision});lastOperation={...operation,state:'source_recheck_completed'};saveSelection();
   });return state();
  }catch(error){const state=published?'unknown':'failed';if(!existsSync(sourceCheckFile(operation,'response')))writeJournal(sourceCheckFile(operation,'response'),{...operation,state,reason:(error as Error).message});lastOperation={...operation,state:published?'source_recheck_pending':'source_recheck_failed'};try{saveSelection();}catch{/* Keep the original request and persistence error queryable. */}throw error;}
 };

 const freshSourceProof=async(proofId:string,expected?:string)=>{
  const delivered=await journalCall('image_source_proof_info',{proof_object_id:proofId,...(expected?{expected_sha256:expected}:{})}),proof=rememberSourceProof(readImageSourceProof(workspace!,proofId,expected));
  if(delivered.data.proof_object_id!==proofId||(delivered.data.manifest_sha256??null)!==proof.manifest_sha256||delivered.data.status!==proof.status)fail('Provider and local source-proof verification differ: '+String(proof.reason??delivered.data.reason??'exact reference mismatch')+'; nothing was adopted',409);return proof;
 };
 const finishSourceProof=async(reply:NativeImageReply,operation:Metadata)=>{
  if(reply.data.kind!=='source_proof'||reply.data.state!=='completed'||reply.data.request_id!==operation.request_id||!objectId.test(String(reply.data.object_id)))fail('Original proof request has not returned its exact completed proof',409);
  const proofId=String(reply.data.object_id);try{const proof=await freshSourceProof(proofId);if(proof.proof_request_id!==operation.request_id||proof.root_object_id!==operation.proof_root_object_id||proof.purpose!==operation.proof_purpose)fail('Recorded proof scope differs from the exact original request',409);}catch(error){sourceProofRecords.set(proofId,{schema_version:1,proof_object_id:proofId,status:'unavailable',eligible_for_exact_scope:false,eligible_for_strict_reuse:false,reason:(error as Error).message,last_checked_utc:new Date().toISOString()});}
  if(!unresolvedRequest()||unresolvedRequest()===operation.request_id){lastOperation={...operation,state:'completed',object_id:proofId,result_not_adopted:true};stateRevision++;saveSelection();}return {...state(),source_proof_query:{schema_version:1,action:'source-proof',request_id:operation.request_id,state:'completed',proof_object_id:proofId,automatic_retry:false}};
 };
 const proofGuard=(parameters:Metadata,keepLocalDraft=false)=>{
  if(!analysis||!analysisOwner)fail('Proof operation requires an owned analysis workspace',409);analysisOwner.assertOwned();analysis.requireRevision(parameters.expected_working_revision);analysis.assertSemanticEditingAllowed();
  const status=analysis.status(unresolvedRequest());if(parameters.expected_state_revision!==stateRevision||parameters.collection_revision!==windowStore.snapshot().revision||!keepLocalDraft&&(editState.dirty||editState.annotation_edit||status.dirty)||editState.gesture_active||pendingResult||unresolvedRequest()||selectionTimer!==null||selectionPersistenceError||status.recovery_available||status.unresolved_save_id)fail('Proof input, current draft or saved analysis changed; local work is retained',409);
 };
 const offlineReadGuard=()=>{
  if(!analysis||!researchQuestion)fail('Apply a question in an analysis workspace first',409);
  analysisOwner!.assertOwned();analysis.assertSemanticEditingAllowed();const gate=panelRoiHandoff(state() as unknown as PanelRoiSnapshot);
  if(gate.interaction_gate.status!=='ready'||!gate.scientific_input.usable||!frameIdentity||selectionTimer!==null||selectionPersistenceError||unresolvedRequest()||analysis.status().unresolved_save_id||sourceProofState().records.some(p=>p.adopted&&p.status!=='verified'))fail('Offline review requires settled, qualified context; existing input retained',409);
 };
 const workspaceAction=async(input:unknown)=>{jointOwner?.assertMutable();
  if(!analysis)fail('Analysis workspace has not been initialized',409);const body=input as Metadata;fields(body,['action','expected_working_revision','save_id','working_draft','comparison_id','proof_object_id','manifest_sha256','expected_object_id','expected_state_revision','draft_revision','collection_revision','replace_proof_id','question_text','lead_draft','lead_id','withdrawal_note','expected_panel_id','expected_lead_session_id','lead_attempt_id','original_update','offline_binding','offline_response','offline_review']);
  if(body.action==='resolve-research-lead-update'){
   // This command shares the serial workspace queue with the original POST.
   // Absence alone is not terminal: fence its exact helper-scoped CAS first.
   const original=body.original_update as Metadata;fields(original,['action','expected_panel_id','expected_lead_session_id','lead_attempt_id','expected_object_id','expected_state_revision','draft_revision','collection_revision','expected_working_revision','lead_draft','lead_id','withdrawal_note','offline_binding','offline_response','offline_review']);
   if(!['create-research-lead','withdraw-research-lead',...offlineActions].includes(String(original.action))||original.expected_panel_id!==panel_id||original.expected_lead_session_id!==session||!objectId.test(String(original.lead_attempt_id))||!objectId.test(String(original.expected_object_id))||!['expected_state_revision','draft_revision','collection_revision','expected_working_revision'].every(k=>Number.isSafeInteger(original[k])&&(original[k] as number)>=0))fail('Exact original same-helper research update required',409);
   analysisOwner!.assertOwned();if(analysisCloseConfirmed||workspaceTransition||selectionTimer!==null||selectionPersistenceError)fail('Original working persistence is unsettled; retain the original update',409);
   const attempt=String(original.lead_attempt_id),known=leadUpdateReceipts.get(attempt);if(known&&known.key!==leadCommandKey(original))fail('Original research attempt ID has a different envelope; retained receipt cannot be replaced',409);
   let leadId:string,matched=false;
   if(offlineActions.includes(String(original.action))){if(!objectId.test(String(original.lead_id)))fail('Exact offline candidate ID required');leadId=String(original.lead_id);matched=matchesLeadUpdate(original);
    }else if(original.action==='create-research-lead'){
    if(original.lead_id!==undefined||original.withdrawal_note!==undefined)fail('Unexpected original creation fields');const draft=readLeadDraft(original.lead_draft);leadId=draft.lead_id;
    const found=researchLeads?.entries.find(e=>e.lead_id===leadId);if(found){const {created_utc,withdrawn_utc,withdrawal_note,...saved}=found;void created_utc;void withdrawn_utc;void withdrawal_note;matched=sameResearchValue(saved,draft);}
   }else{
    if(original.lead_draft!==undefined||!objectId.test(String(original.lead_id))||typeof original.withdrawal_note!=='string'||!original.withdrawal_note.trim()||original.withdrawal_note.length>1000)fail('Exact original withdrawal required');leadId=original.lead_id as string;
    const found=researchLeads?.entries.find(e=>e.lead_id===leadId);matched=Boolean(found?.withdrawn_utc&&found.withdrawal_note===original.withdrawal_note);
   }
   if(!Number.isSafeInteger(stateRevision)||(original.expected_state_revision as number)>stateRevision)fail('Original update has a future or invalid CAS; no terminal conclusion',409);
   if(original.expected_state_revision===stateRevision){if(!Number.isSafeInteger(stateRevision+1))fail('State revision exhausted',409);stateRevision++;saveSelection();}
   if((!known||known.receipt.state==='unknown')&&leadUpdateReceipts.size<256)leadUpdateReceipts.set(attempt,{key:leadCommandKey(original),receipt:{action:original.action,lead_id:leadId,attempt_id:attempt,state:'fenced'}});
   // stateRevision never decreases in this helper. A request arriving after
   // this receipt must fail its old CAS; a new helper has another research_lead_session_id.
   return {...state(),research_lead_update:{schema_version:1,action:original.action,lead_id:leadId,state:matched?'applied':'not_present_fenced',terminal:true,basis:matched?'matching_record_and_original_cas_fenced':'original_cas_fenced_without_matching_record',fenced_state_revision:stateRevision,original_update:structuredClone(original)}};
  }
  if(body.action==='create-research-lead'||body.action==='withdraw-research-lead'||offlineActions.includes(String(body.action))){
   let candidate=researchLeads,offlineCandidate=researchOffline,leadId=String(body.lead_id??(body.lead_draft as Metadata|undefined)?.lead_id??'');
   if(!objectId.test(String(body.lead_attempt_id)))fail('Exact research attempt ID required',409);
   const key=leadCommandKey(body),attempt=body.lead_attempt_id as string,previous=leadUpdateReceipts.get(attempt);
   if(previous){
    analysisOwner!.assertOwned();if(previous.key!==key)fail('Original research attempt ID has a different envelope; retained receipt cannot be replaced',409);
    if(['unknown','fenced'].includes(String(previous.receipt.state))||previous.receipt.state==='applied'&&!matchesLeadUpdate(body))fail('Original update ran, was fenced or has unconfirmed persistence; reconcile its exact current record without replay',409);
    return {...state(),research_lead_update:{...previous.receipt,duplicate_transport_receipt:true}};
   }
   // No eviction can turn an old terminal command into a newly admitted write.
   // A fresh helper is required at the bounded receipt limit, with no pending input.
   if(leadUpdateReceipts.size>=256)return {...state(),research_lead_update:{action:body.action,lead_id:leadId,attempt_id:body.lead_attempt_id,state:'not_applied',reason:'Research transport receipt limit reached; settle input and reopen the workspace'}};
   leadUpdateReceipts.set(attempt,{key,receipt:{action:body.action,lead_id:leadId,attempt_id:body.lead_attempt_id,state:'unknown'}});
   try{
    if(body.expected_panel_id!==panel_id||body.expected_lead_session_id!==session||!objectId.test(String(body.lead_attempt_id)))fail('Research update belongs to a different helper or has no exact attempt ID',409);
    analysis.requireRevision(body.expected_working_revision);analysis.assertSemanticEditingAllowed();analysisOwner!.assertOwned();
    const gate=panelRoiHandoff(state() as unknown as PanelRoiSnapshot),proofs=sourceProofState().records;
    if(body.expected_object_id!==current.object_id||body.expected_state_revision!==stateRevision||body.draft_revision!==editState.draft_revision||body.collection_revision!==windowStore.snapshot().revision||
       gate.interaction_gate.status!=='ready'||!gate.scientific_input.usable||!frameIdentity||selectionTimer!==null||selectionPersistenceError||unresolvedRequest()||analysis.status().unresolved_save_id||proofs.some(p=>p.adopted&&p.status!=='verified'))
     fail('Research metadata needs the exact settled and qualified current context',409);
    if(offlineActions.includes(String(body.action))){
     if(!objectId.test(String(body.lead_id))||body.lead_draft!==undefined)fail('Exact offline candidate ID required');
     const existing=researchOffline?.entries.find(c=>c.response.candidate_id===body.lead_id);
     if(body.action==='stage-offline-candidate'){
      if(existing||(researchOffline?.entries.length??0)>=8)fail('Offline candidate already exists or history is full; retain the original record',409);
      const binding=readOfflineBinding(body.offline_binding),response=readOfflineResponse(body.offline_response,binding);
      if(response.candidate_id!==body.lead_id||!sameResearchValue(binding.lease,offlineLease(state())))fail('Offline response arrived for an old context version; explicitly prepare a new context',409);
      offlineContext(workspace!,state(),binding.context_id,binding);
      offlineCandidate={version:1,entries:[...(researchOffline?.entries??[]),{binding,response,status:'pending',accepted_draft:null,rejection_note:null}]};
     }else{
      if(!existing||existing.status!=='pending')fail('Offline candidate is missing or already settled; no duplicate acceptance',409);
      if(body.action==='reject-offline-candidate'){
       if(typeof body.withdrawal_note!=='string'||!body.withdrawal_note.trim()||body.withdrawal_note.length>1000)fail('Explicit offline rejection note required');
       offlineCandidate={version:1,entries:researchOffline!.entries.map(c=>c===existing?{...c,status:'rejected',rejection_note:body.withdrawal_note as string}:c)};
      }else{
       const packet=offlineContext(workspace!,state(),existing.binding.context_id,existing.binding);
       if(!sameResearchValue(body.offline_review,{scope_sha256:existing.binding.scope_sha256,lease:packet.binding.lease}))fail('Offline source review lease changed; retain candidate and recheck',409);
       const response=readOfflineResponse(body.offline_response,existing.binding),draft=offlineLead(response,existing.binding);
       if(response.candidate_id!==body.lead_id||(researchLeads?.entries.length??0)>=16||researchLeads?.entries.some(e=>e.lead_id===draft.lead_id))fail('Offline acceptance conflicts with existing lead identity/history',409);
       validateLeadEvidence(workspace!,draft);candidate={version:1,entries:[...(researchLeads?.entries??[]),{...draft,created_utc:new Date().toISOString()}]};
       offlineCandidate={version:1,entries:researchOffline!.entries.map(c=>c===existing?{...c,status:'accepted',accepted_draft:draft}:c)};
      }
     }
    }else if(body.action==='create-research-lead'){
     const draft=readLeadDraft(body.lead_draft);leadId=draft.lead_id;
     if(!sameResearchValue(draft.question,researchQuestion)||draft.question.frame_object_id!==frameIdentity.frame_object_id)fail('Question changed or belongs to another frame; input retained',409);
     if((researchLeads?.entries.length??0)>=16||researchLeads?.entries.some(e=>e.lead_id===leadId))fail('Lead identity already exists or bounded history is full; read original records',409);
     validateLeadEvidence(workspace!,draft);candidate={version:1,entries:[...(researchLeads?.entries??[]),{...draft,created_utc:new Date().toISOString()}]};
    }else{
     if(!objectId.test(leadId)||typeof body.withdrawal_note!=='string'||!body.withdrawal_note.trim()||body.withdrawal_note.length>1000)fail('Exact lead and explicit withdrawal reason required');
     const found=researchLeads?.entries.find(e=>e.lead_id===leadId);if(!found||found.withdrawn_utc)fail('Lead is missing or already withdrawn; read the original state',409);
     candidate={version:1,entries:researchLeads!.entries.map(e=>e.lead_id===leadId?{...e,withdrawn_utc:new Date().toISOString(),withdrawal_note:body.withdrawal_note as string}:e)};
    }
   }catch(error){const receipt={action:body.action,lead_id:leadId,attempt_id:body.lead_attempt_id,state:'not_applied',reason:(error as Error).message};leadUpdateReceipts.set(attempt,{key,receipt});return {...state(),research_lead_update:receipt};}
   // Only validation failures above are known not-applied. Any persistence
   // failure below remains uncertain and must be read by the original lead ID.
   researchLeads=readResearchLeads(candidate);researchOffline=readOfflineResearch(offlineCandidate);stateRevision++;saveSelection();
   const receipt={action:body.action,lead_id:leadId,attempt_id:body.lead_attempt_id,state:'applied'};leadUpdateReceipts.set(attempt,{key,receipt});return {...state(),research_lead_update:receipt};
  }
  analysis.requireRevision(body.expected_working_revision);
  if(body.action==='set-research-question'){
   analysis.assertSemanticEditingAllowed();analysisOwner!.assertOwned();
   const handoff=panelRoiHandoff(state() as unknown as PanelRoiSnapshot);
   if(body.expected_object_id!==current.object_id||body.expected_state_revision!==stateRevision||body.draft_revision!==editState.draft_revision||body.collection_revision!==windowStore.snapshot().revision||
      handoff.interaction_gate.status!=='ready'||unresolvedRequest()||['unknown','source_recheck_pending'].includes(String(lastOperation?.state))||!handoff.scientific_input.usable||!frameIdentity||selectionTimer!==null||selectionPersistenceError||analysis.status().unresolved_save_id)
    fail('Research question needs the exact qualified context and settled draft; no question was applied',409);
   if(typeof body.question_text!=='string'||body.question_text.length>2000)fail('Research question must be text of at most 2000 characters');
   const candidate=body.question_text.trim()?readResearchQuestion({version:1,text:body.question_text,context_object_id:current.object_id,frame_object_id:frameIdentity.frame_object_id,recorded_utc:new Date().toISOString()}):undefined;
   researchQuestion=candidate;stateRevision++;saveSelection();return state();
  }
  if(body.action==='adopt-source-proof'){
   if(!objectId.test(String(body.proof_object_id))||typeof body.manifest_sha256!=='string'||!/^[a-f0-9]{64}$/.test(body.manifest_sha256))fail('Exact source-proof reference required');const replacing=body.replace_proof_id!==undefined,refs=sourceProofRefs();if(replacing&&(typeof body.replace_proof_id!=='string'||!objectId.test(body.replace_proof_id)||!refs.some(ref=>ref.object_id===body.replace_proof_id)))fail('Explicit replaced proof must be an exact adopted reference',409);proofGuard(body,replacing);
   const object=String(current.object_id),mapping=panelWindowMappingFingerprint(current),draft=editState.draft_revision,revision=stateRevision,collection=windowStore.snapshot().revision,working=body.expected_working_revision,save=analysis.status().save_id,beforeSelection=structuredClone(selection),beforeEdit=structuredClone(editState),beforeDirty=analysis.status().dirty;
   if(body.expected_object_id!==object||body.draft_revision!==draft)fail('Source-proof adoption needs the exact current object and draft lease',409);
   const check=()=>{analysisOwner!.assertOwned();analysis!.requireRevision(working);if(current.object_id!==object||panelWindowMappingFingerprint(current)!==mapping||!sameRecord(editState,beforeEdit)||stateRevision!==revision||editState.gesture_active||pendingResult||unresolvedRequest()||selectionTimer!==null||selectionPersistenceError||!sameRecord(selection,beforeSelection)||analysis!.status().save_id!==save||analysis!.status().dirty!==beforeDirty||analysis!.status().recovery_available)fail('Proof adoption conditions changed; proof remains recorded but was not adopted',409);windowStore.requireRevision(collection);};
   const proof=await freshSourceProof(String(body.proof_object_id),body.manifest_sha256);check();if(proof.status!=='verified'||!proof.eligible_for_exact_scope||proof.purpose==='saved_source'&&proof.root_object_id!==object||!proof.frame_identity)fail('Proof does not qualify this exact saved source/input: '+String(proof.reason??proof.status),409);
   if(replacing&&proof.purpose==='fft_input'&&proof.root_object_id!==object)fail('FFT input proof binds the original raw FFT, not this display object; it cannot replace this exact current-root reference. A spatial saved-source adoption does not repair the old FFT input proof.',409);
   if(replacing&&frameIdentity===null||(frameIdentity===null?proof.root_object_id!==object:!sameRecord(frameIdentity,proof.frame_identity)||replacing&&proof.root_object_id!==object))fail('New proof must name the same working frame and exact replacement root, or the exact original null-frame root',409);
   const ref:SourceProofReference={kind:'source_proof_reference_v1',object_id:String(body.proof_object_id),manifest_sha256:body.manifest_sha256},candidate=[...refs.filter(value=>value.object_id!==ref.object_id&&value.object_id!==body.replace_proof_id),ref],saved=await sourceProofScope.run(candidate,()=>readWindowSaved(object,{includeFrameAncestry:false}));check();
   if(panelWindowMappingFingerprint(saved.object)!==mapping||!sameRecord(saved.frame,proof.frame_identity))fail('Proof frame or exact saved asset changed before adoption',409);const nextDraft=draft+1;if(!replacing&&!Number.isSafeInteger(nextDraft))fail('Draft revision exhausted',409);
   adoptedResults=[...adoptedResults.filter(raw=>(raw as Metadata).kind!=='source_proof_reference_v1'||(raw as Metadata).object_id!==ref.object_id&&(raw as Metadata).object_id!==body.replace_proof_id),ref];if(!replacing){frameIdentity=structuredClone(proof.frame_identity) as PanelFrameIdentity;windowStore.admit(current,frameIdentity);editState={...editState,draft_revision:nextDraft};}stateRevision++;saveSelection();return {...state(),source_proof_adoption:{state:replacing?'replaced':'adopted',preserved_local_draft:replacing}};
  }
  if(body.action==='query-save'){let query:ReturnType<AnalysisWorkspace['querySave']>;try{query=analysis.querySave(body.save_id);}finally{stateRevision++;}return {...state(),save_query:query};}
  if(body.action==='park-window'){
   if(editState.gesture_active||pendingResult||unresolvedRequest()||selectionPersistenceError)fail('Finish the gesture and query the original request before changing windows',409);
   const draft=body.working_draft as Metadata;fields(draft,['version','object_id','panel_mapping_fingerprint','selection','annotation_edit','display','reason','reason_dirty','content_dirty','selected_id','fields']);
   const active=windowStore.snapshot().active_window_id;if(!active||draft.version!==1||draft.object_id!==current.object_id||draft.panel_mapping_fingerprint!==panelWindowMappingFingerprint(current)||typeof draft.reason!=='string'||draft.reason.length>1000||draft.reason_dirty!==undefined&&typeof draft.reason_dirty!=='boolean'||draft.content_dirty!==undefined&&typeof draft.content_dirty!=='boolean'||Buffer.byteLength(JSON.stringify(draft))>32768)fail('Working draft must name the exact active view and render mapping',409);
   if(draft.selection!==null)checkSelection(draft.selection);
   if(draft.annotation_edit!==null){const update=draft.annotation_edit as Metadata;fields(update,['annotation_id','coordinates','text','color','status','presentation']);const mark=((current.annotations??[]) as Metadata[]).find(m=>m.annotation_id===update.annotation_id&&m.status!=='retracted');if(!mark?.anchor)fail('Parked annotation draft needs its exact current mark',409);if(update.coordinates!==undefined){const anchor=mark.anchor as Metadata,panels=((current.panels??[]) as Metadata[]).filter(p=>p.source_object_id===anchor.source_object_id);if(panels.length!==1)fail('Parked annotation draft needs one exact scientific panel',409);checkSelection({...anchor,kind:mark.kind,coordinates:update.coordinates,panel:panels[0]});}if(update.presentation!==undefined)validate(update.presentation,annotationPresentation,'presentation');if(update.text!==undefined&&(typeof update.text!=='string'||update.text.length>256)||update.status!==undefined&&!['hypothesized','user_confirmed','retracted'].includes(String(update.status))||update.color!==undefined&&!['cyan','orange','white','amber','green'].includes(String(update.color)))fail('Invalid parked annotation fields',409);}
   if(analysis.status().recovery_available&&(draft.content_dirty===true||draft.reason_dirty===true||draft.annotation_edit!=null))analysis.assertSemanticEditingAllowed();
   assertInteractionAllowed(selection,{...editState,dirty:false,gesture_active:false,annotation_edit:null},{drafts:{...workspaceDrafts,[active]:structuredClone(draft)}});
   workspaceDrafts[active]=structuredClone(draft);workingSelections[active]=workingSelection();
   const successor=editState.draft_revision+1;if(!Number.isSafeInteger(successor))fail('Draft revision exhausted',409);editState={draft_revision:successor,dirty:false,gesture_active:false,selection:structuredClone(selection),annotation_edit:null,base_object_id:current.object_id};stateRevision++;saveSelection();return state();
  }
  if(body.action==='save'){
   const unsettled=Object.entries(workspaceDrafts).find(([,raw])=>{const draft=raw as Metadata;return draft.content_dirty===true||draft.reason_dirty===true||draft.annotation_edit!=null;});if(unsettled)fail('Apply the parked scientific edits in window '+unsettled[0]+' before publishing a whole-workspace save',409);
   if(editState.gesture_active||selectionTimer!==null||selectionPersistenceError||unresolvedRequest())fail('Finish edits and resolve the original scientific request before saving',409);
   saveSelection();analysis.requireRevision(body.expected_working_revision);stateRevision++;try{await analysis.save(body.save_id,body.expected_working_revision,validateAnalysisSnapshot);}finally{stateRevision++;}return state();
  }
  if(body.action==='adopt-comparison'){
   analysis.assertSemanticEditingAllowed();
   if(editState.gesture_active||editState.dirty||pendingResult||unresolvedRequest()||analysis.status().dirty)fail('Save the exact current analysis or resolve its pending state before adopting a comparison',409);
   const module=await comparisonReports(),report=module.readRoiComparisonReport(workspace!,String(body.comparison_id)),status=analysis.status();
   if(!Array.isArray(report.rows)||(report.rows as Metadata[]).some(row=>row.fft!=null&&(row.fft as Metadata).input_snapshot_verified!==true))fail('Comparison FFT input association is unresolved; view it as historical or uncertain evidence rather than adopting it',409);
   if(report.source_save_id!==status.save_id||report.source_revision!==status.saved_revision||report.frame_object_id!==frameIdentity?.frame_object_id)fail('Comparison belongs to another saved analysis version; it remains available as historical evidence',409);
   if(!adoptedResults.some(raw=>(raw as Metadata).comparison_id===body.comparison_id))adoptedResults.push({kind:'roi_lattice_comparison',comparison_id:report.comparison_id,source_save_id:report.source_save_id,source_revision:report.source_revision,report_sha256:createHash('sha256').update(JSON.stringify(report)).digest('hex')});
   stateRevision++;saveSelection();return state();
  }
  if(body.action==='discard'||body.action==='recover'){
   if(editState.gesture_active||unresolvedRequest())fail('Resolve the original scientific request before discarding or recovering edits',409);
   if(body.action==='recover'&&analysis.status().dirty)fail('The current workspace has newer unsaved edits; save or discard them before restoring a separate crash draft',409);
   // Qualify before changing either runtime or durable working references.
   const candidate=body.action==='discard'?analysis.initialSnapshot():analysis.recoverySnapshot();
   const allowDeferredNull=Boolean(body.action==='discard'&&legacyNullSource?.object_id===candidate.object_id&&candidate.frame_identity===null&&emptyLegacyWindows(candidate.window_collection)&&sameRecord(candidate,analysis.initialSnapshot()));
   workspaceTransition=true;try{const commit=await prepareAnalysisRestore(candidate,{allowDeferredNull});if(body.action==='discard')analysis.discard(body.expected_working_revision);else analysis.recover(body.expected_working_revision);commit();saveSelection();}finally{workspaceTransition=false;}return state();
  }
  if(body.action==='close'){if(editState.gesture_active||pendingResult||unresolvedRequest()||selectionPersistenceError||selectionTimer!==null)fail('Resolve the original task or pending result before closing',409);analysis.close();analysisCloseConfirmed=true;return state();}
  fail('Unknown analysis workspace action');
 };
 const comparisonReports=async():Promise<{listRoiComparisonReports:(workspace:string)=>Metadata[];readRoiComparisonReport:(workspace:string,id:string)=>Metadata}>=>{
  const moduleURL=new URL('../lib/roi_comparison_reports.mjs',import.meta.url);if(!existsSync(moduleURL))fail('Comparison reports are unavailable in this runtime build',404);
  return await import(moduleURL.href) as {listRoiComparisonReports:(workspace:string)=>Metadata[];readRoiComparisonReport:(workspace:string,id:string)=>Metadata};
 };
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
 const checkSelection=(input:unknown,targetObject:Metadata=current):PanelSelection=>{const value=input as Metadata;fields(value,['kind','coordinate_space','source_object_id','coordinates','panel']);const lengths={point:2,line:4,arrow:4,rectangle:4,polygon:null},c=value.coordinates;if(!(((value as Metadata).kind as string) in lengths)||!Array.isArray(c)||!c.every(Number.isFinite)||!objectId.test(((value.source_object_id??'' as string) as string))||(value.kind==='polygon'?(c.length<6||c.length>64||c.length%2):c.length!==lengths[value.kind as keyof typeof lengths]))fail('Invalid scientific selection');const p=(targetObject.panels as Metadata[]|undefined)?.find(p=>p.source_object_id===value.source_object_id&&sameRecord(p,value.panel));if(!p)fail('Selection must use an exact current panel');const space=({frequency:'frequency_cycles_per_pixel',spatial_pixels:'source_pixels',source_array_indices:'source_array_indices'} as Metadata)[p.domain as string];if(value.coordinate_space!==space)fail('Selection coordinate domain mismatch');const edges=(['rectangle','polygon'] as readonly unknown[]).includes(value.kind);let bounds;if(p.domain==='frequency'){const [h,w]=p.fft_shape_yx as number[],[x0,y0,x1,y1]=(p.fft_rect_xyxy??[0,0,w,h]) as number[],margin=edges?.5:0;bounds=[(x0-Math.floor(w/2)-margin)/w,(y0-Math.floor(h/2)-margin)/h,(x1-1-Math.floor(w/2)+margin)/w,(y1-1-Math.floor(h/2)+margin)/h];}else{const [x0,y0,x1,y1]=p.source_rect_xyxy as number[];bounds=[x0,y0,edges?x1:x1-1,edges?y1:y1-1];}for(let i=0;i<c.length;i++)if(c[i]<bounds[i%2]-1e-12||c[i]>bounds[i%2+2]+1e-12)fail('Selection lies outside current source window');if(value.kind==='rectangle'&&(c[0]>=c[2]||c[1]>=c[3]))fail('Rectangle needs increasing nonempty edges');if((['line','arrow'] as readonly unknown[]).includes(value.kind)&&c[0]===c[2]&&c[1]===c[3])fail('Line needs distinct endpoints');return structuredClone(value) as PanelSelection;};
 const act=async(input:unknown)=>{jointOwner?.assertMutable();const body=input as Metadata;
  if(workspaceTransition||analysisCloseConfirmed)fail('Workspace restore or close is in progress; existing edits are retained',409);
  fields(body,['expected_object_id','draft_revision','action','params','lightweight','client_batch_id']);if(body.client_batch_id!==undefined&&(!['mark','edit','edit-layout'].includes(String(body.action))||!panelBatchId(body.client_batch_id)))fail('Invalid Panel edit batch identity');if(body.lightweight!==undefined&&(body.action!=='draft'||typeof body.lightweight!=='boolean'))fail('lightweight is an explicit boolean for draft acknowledgments only');if(body.expected_object_id!==current.object_id)fail('Stale object revision; reload before editing',409);const p=body.params??{},startedRevision=body.draft_revision??editState.draft_revision;let r:NativeImageReply,figureRestore:Metadata|null=null,calibrationInput:Metadata|null=null;
  if(!Number.isSafeInteger(startedRevision)||(startedRevision as number)<0)fail('Invalid draft_revision');
  if(body.action==='source-proof'){
   fields(p,['request_id','object_id','purpose','input_relative_path','input_sha256','parent_proof_id','expected_state_revision','collection_revision','expected_working_revision']);
   const scope=p as Metadata;if(typeof scope.request_id!=='string'||!safeId.test(scope.request_id)||typeof scope.object_id!=='string'||!objectId.test(scope.object_id)||typeof scope.purpose!=='string'||!['saved_source','fft_input'].includes(scope.purpose))fail('Exact proof request and purpose required');if(scope.purpose==='saved_source'&&scope.object_id!==current.object_id)fail('Saved-source proof requires the exact current object',409);
   if(scope.parent_proof_id!==undefined&&(typeof scope.parent_proof_id!=='string'||!objectId.test(scope.parent_proof_id))||scope.input_relative_path!==undefined&&(typeof scope.input_relative_path!=='string'||scope.input_relative_path.length>2048)||scope.input_sha256!==undefined&&(typeof scope.input_sha256!=='string'||!/^[a-f0-9]{64}$/.test(scope.input_sha256))||scope.purpose==='fft_input'&&(typeof scope.input_relative_path!=='string'||typeof scope.input_sha256!=='string'))fail('Exact bounded FFT input/proof reference required');
   const requestId=String((p as Metadata).request_id),intentFile=path.join(journal,requestId+'.source-proof.request.json');if(existsSync(intentFile)||existsSync(path.join(journal,requestId+'.request.json')))fail('Original proof request is already journaled; query request_id='+requestId+' without resubmitting',409);
   const intent={schema_version:1,action:'source-proof',request_id:requestId,expected_object_id:body.expected_object_id,draft_revision:startedRevision,params:p};writeJournal(intentFile,intent);let dispatchStarted=false;
   try{proofGuard(p as Metadata,true);if(startedRevision!==editState.draft_revision)fail('Proof draft lease changed',409);
   const args=Object.fromEntries(['object_id','purpose','input_relative_path','input_sha256','parent_proof_id'].filter(key=>(p as Metadata)[key]!==undefined).map(key=>[key,(p as Metadata)[key]])),operation={action:'source-proof',request_id:requestId,proof_root_object_id:(p as Metadata).object_id,proof_purpose:(p as Metadata).purpose};
   writeJournal(path.join(journal,requestId+'.source-proof.dispatch.json'),{...intent,state:'dispatch_started',automatic_retry:false});dispatchStarted=true;
   const reply=await journalCall('image_source_proof',args,undefined,operation);return finishSourceProof(reply,operation);
   }catch(error){if(!dispatchStarted)writeJournal(path.join(journal,requestId+'.source-proof.response.json'),{...intent,scope:'current_helper_only',state:'not_submitted',phase:'before_provider_dispatch',provider_request_id:null,automatic_retry:false,reason:(error as Error).message});throw error;}
  }
  if(body.action==='query-source-proof'){
   fields(p,['request_id']);const requestId=String((p as Metadata).request_id);if(!safeId.test(requestId))fail('Exact original proof request required');const file=path.join(journal,requestId+'.source-proof.request.json');if(!existsSync(file)&&inheritedOperation?.request_id===requestId&&inheritedJournal&&existsSync(path.join(inheritedJournal,requestId+'.request.json')))return act({...body,action:'recover',params:{request_id:requestId}});if(!existsSync(file))return {...state(),source_proof_query:{schema_version:1,action:'source-proof',request_id:requestId,state:'not_observed',scope:'current_helper_only',automatic_retry:false}};
   const readLocal=(target:string)=>{const entry=lstatSync(target);if(entry.isSymbolicLink()||!entry.isFile()||entry.size>64*1024)fail('Proof intent is not a bounded ordinary local record',409);const value=JSON.parse(readFileSync(target,'utf8')) as Metadata;if(value.schema_version!==1||value.action!=='source-proof'||value.request_id!==requestId)fail('Proof intent identity differs',409);return value;},intent=readLocal(file),response=path.join(journal,requestId+'.source-proof.response.json');
   if(!existsSync(path.join(journal,requestId+'.source-proof.dispatch.json'))&&existsSync(response)){const receipt=readLocal(response);if(receipt.state!=='not_submitted'||receipt.phase!=='before_provider_dispatch'||receipt.provider_request_id!==null||receipt.automatic_retry!==false||receipt.scope!=='current_helper_only'||!sameRecord(receipt.params,intent.params)||receipt.expected_object_id!==intent.expected_object_id||receipt.draft_revision!==intent.draft_revision)fail('Original proof non-dispatch receipt differs',409);return {...state(),source_proof_query:receipt};}
   const marker=readLocal(path.join(journal,requestId+'.source-proof.dispatch.json'));if(marker.state!=='dispatch_started'||marker.automatic_retry!==false||!sameRecord(marker.params,intent.params)||marker.expected_object_id!==intent.expected_object_id||marker.draft_revision!==intent.draft_revision)fail('Original proof dispatch marker differs',409);const args=intent.params as Metadata,providerReceipt=path.join(journal,requestId+'.response.json'),providerRequest=path.join(journal,requestId+'.request.json');
   if(existsSync(providerReceipt)&&existsSync(providerRequest)){
    const bounded=(target:string)=>{const entry=lstatSync(target);if(entry.isSymbolicLink()||!entry.isFile()||entry.size>64*1024)fail('Original provider proof journal is not an ordinary bounded file',409);return JSON.parse(readFileSync(target,'utf8')) as Metadata;},request=bounded(providerRequest),receipt=bounded(providerReceipt),expected=Object.fromEntries(['object_id','purpose','input_relative_path','input_sha256','parent_proof_id'].filter(key=>args[key]!==undefined).map(key=>[key,args[key]])),admission=readImageAdmissionFailure(receipt.admission_failure,'image_source_proof',requestId);
    if(request.name==='image_source_proof'&&sameRecord(request.arguments,{...expected,request_id:requestId})&&receipt.state==='not_submitted'&&receipt.request_id===requestId&&admission)return {...state(),source_proof_query:{schema_version:1,action:'source-proof',request_id:requestId,expected_object_id:intent.expected_object_id,draft_revision:intent.draft_revision,params:args,state:'not_submitted',phase:'provider_admission',scope:'exact_original_provider_request',provider_request_id:requestId,automatic_retry:false,admission_failure:admission}};
   }
   const reply=await journalCall('image_result',{request_id:requestId});return finishSourceProof(reply,{action:'source-proof',request_id:requestId,proof_root_object_id:args.object_id,proof_purpose:args.purpose});
  }
  if(body.action==='read-source-proofs'){
   fields(p,[]);const refs=new Map<string,string|undefined>(sourceProofRefs().map(ref=>[ref.object_id,ref.manifest_sha256]));for(const record of sourceProofRecords.values())if(objectId.test(String(record.proof_object_id))&&!refs.has(String(record.proof_object_id)))refs.set(String(record.proof_object_id),typeof record.manifest_sha256==='string'?record.manifest_sha256:undefined);
   if(lastOperation?.action==='source-proof'&&lastOperation.state==='completed'&&objectId.test(String(lastOperation.object_id)))refs.set(String(lastOperation.object_id),refs.get(String(lastOperation.object_id))!);
   for(const [id,hash]of refs){try{await freshSourceProof(id,hash);}catch(error){sourceProofRecords.set(id,{proof_object_id:id,manifest_sha256:hash,status:'unavailable',eligible_for_exact_scope:false,eligible_for_strict_reuse:false,reason:(error as Error).message,last_checked_utc:new Date().toISOString()});}}return state();
  }
  if(body.action==='query-source-recheck'){fields(p,['request_id']);return querySourceCheck(p.request_id);}
  if(body.action==='recheck-source'){fields(p,['request_id','expected_state_revision','collection_revision','expected_working_revision']);if(startedRevision!==editState.draft_revision)fail('Source recheck draft lease changed',409);return recheckSource(p);}
  if(sourceCheckPending()&&!['draft','select','window-camera','window-context','window-layout','recover'].includes(String(body.action)))fail('Query the original source recheck before another operation',409);
  if(sourceRecheckState()&&!['draft','select','window-camera','window-context','window-layout','recover'].includes(String(body.action)))fail('This legacy source needs explicit source recheck before scientific editing',409);
  if(!['draft','select','window-camera','window-context','window-layout','activate-window','close-window','recover'].includes(String(body.action)))analysis?.assertSemanticEditingAllowed();
  let returnedInputContext:PanelWindowViewContext|null=null;
  const checkWindowTransition=()=>{
   if(body.expected_object_id!==current.object_id||body.draft_revision!==editState.draft_revision||editState.dirty||editState.gesture_active||editState.annotation_edit||pendingResult||selectionTimer!==null||selectionPersistenceError||lastOperation?.state==='submitted')fail('Save and confirm the exact current draft, finish gestures, and resolve the pending/original request before switching image windows',409);
  };
  const beginNavigation=()=>{checkWindowTransition();return {selection:structuredClone(selection),operation:structuredClone(lastOperation),collection_revision:windowStore.snapshot().revision};};
  const confirmNavigation=(before:ReturnType<typeof beginNavigation>,operation:Metadata|null=before.operation)=>{
   checkWindowTransition();windowStore.requireRevision(before.collection_revision);
   if(!sameRecord(selection,before.selection)||!sameRecord(lastOperation,operation))fail('Current interaction changed during saved navigation; existing edits and requests are retained',409);
  };
  const navigationTargetContext=async(entry:PanelWindowEntry|undefined,prepared:PreparedView,frame:PanelFrameIdentity|null)=>{
   const context=entry&&entry.object_id===prepared.object.object_id?qualifyPanelWindowContext(entry.view_context,prepared.object,checkSelection):null;
   let reference:SpatialReturnReference|null=null,reason='no_saved_return';
   if(entry?.role==='fft'&&entry.source_reference){
    const source=entry.source_reference;
    try{reference=readSpatialReturnReference({version:1,view_object_id:source.input_view_object_id,frame_object_id:source.frame_object_id,fft_object_id:source.raw_fft_object_id,source_rect_xyxy:source.processing_rect_xyxy});}
    catch{reason='invalid_reference';}
    if(reference){try{await qualifySpatialReturn(reference);const offered=spatialReturnState(reference,prepared.object,frame);reason=offered.status==='ready'?'':offered.reason_code??'different_fft';}catch(error){reason=returnFailure(error);}}
   }
   return {context,reference,reason};
  };
  if(body.action==='window-camera'){
   fields(p,['collection_revision','window_id','object_id','camera','ui_panels']);windowStore.updateCamera(p.collection_revision,p.window_id,p.object_id,p.camera,p.ui_panels);stateRevision++;saveSelection();return state();
  }
  if(body.action==='window-context'){
   fields(p,['collection_revision','camera','selected_annotation_id','ui_panels']);checkWindowTransition();windowStore.requireRevision(p.collection_revision);
   const active=windowStore.snapshot().active_window_id;if(!active)fail('Current image has no registered editing window',409);
   const selected=p.selected_annotation_id;
   if(selected!==null&&(typeof selected!=='string'||!selected.length||selected.length>64||((current.annotations??[]) as Metadata[]).filter(mark=>mark.annotation_id===selected&&mark.status!=='retracted').length!==1))fail('Selected annotation must belong to the exact current image',409);
   const context:PanelWindowViewContext={version:1,object_id:current.object_id as string,panel_mapping_fingerprint:panelWindowMappingFingerprint(current),camera:readPanelWindowCamera(p.camera),...(p.ui_panels===undefined?{}:{ui_panels:readPanelWindowUiPanels(p.ui_panels)}),selection_candidate:selection===null?null:checkSelection(selection,current),selected_annotation_id:selected as string|null};
   windowStore.setContext(p.collection_revision,active,current,context);stateRevision++;saveSelection();return state();
  }
  if(body.action==='activate-window'||body.action==='show'){
   const activation=body.action==='activate-window';fields(p,activation?['collection_revision','window_id']:['object_id','source_view','input_reference']);
   const before=beginNavigation(),collection=windowStore.snapshot();let entry:PanelWindowEntry|undefined,reply:NativeImageReply,frame:PanelFrameIdentity|null;
   if(activation)entry=windowStore.lookup(p.window_id,p.collection_revision);
   else{
    if(!objectId.test(String(p.object_id)))fail('Explicit existing object_id required');if(p.source_view!==undefined&&p.source_view!==true)fail('source_view must be true when provided');
    if(p.input_reference!==undefined&&p.source_view)fail('Source previews cannot carry an FFT input reference');if(p.source_view&&p.object_id!==frameIdentity?.frame_object_id)fail('Source view must name this exact frame',409);
    if(!p.source_view)entry=collection.windows.find(window=>window.object_id===p.object_id);
   }
   if(entry){
    const saved=await readWindowSaved(entry.object_id);frame=saved.frame;
    if(frame?.frame_object_id!==collection.frame_object_id||!windowStore.assetMatches(entry.window_id,saved.object,frame))fail('Saved navigation target no longer matches its admitted frame, grid or asset',409);
    reply={data:saved.object,png:saved.png};
   }else if(p.source_view){const target=await withCurrentContext(p.object_id);reply=await journalCall('image_preview',{object_id:target});frame=await findFrameIdentity(reply.data);}
   else{reply=await displayObject(await journalCall('image_info',{object_id:p.object_id}));frame=await findFrameIdentity(reply.data);}
   const prepared=await prepareCurrent(reply),ownOperation=p.source_view?structuredClone(lastOperation):before.operation;
   // An explicitly shown new rendering may revise a retained FFT on its exact
   // raw FFT identity. Its own relation is usable; another FFT's global P3 is not.
   const panels=prepared.object.panels as Metadata[]|undefined,rawFFT=panels?.length===1&&panels[0].domain==='frequency'?panels[0].source_object_id:null;
   const related=entry??collection.windows.find(window=>{const source=window.source_reference;return window.role==='fft'&&source!==undefined&&source.raw_fft_object_id===rawFFT&&source.frame_object_id===frame?.frame_object_id;});
   let {context,reference,reason}=await navigationTargetContext(related,prepared,frame);let verifiedInputContext:PanelWindowViewContext|null=null,verifiedCameraOrigin:string|null=null;
   if(!activation&&p.input_reference!==undefined){
    if(!objectId.test(String(rawFFT)))fail('Input reference requires one exact saved frequency grid',409);
    const moduleURL=new URL('../lib/panel_saved_input_reference.mjs',import.meta.url);if(!existsSync(moduleURL))fail('This runtime cannot resolve qualified saved input references',409);
    const module=await import(moduleURL.href) as {resolvePanelSavedInputReference:(workspace:string,target:string,value:unknown)=>{source_view_object_id:string;frame_object_id:string;raw_fft_object_id:string;processing_rect_xyxy:number[];float_roi_xyxy:number[];annotation_id:string|null;spatial_return_reference:SpatialReturnReference}},input=module.resolvePanelSavedInputReference(workspace!,String(rawFFT),p.input_reference),qualified=await qualifySpatialReturn(input.spatial_return_reference),source=await readWindowSaved(input.source_view_object_id);
    if(frame?.frame_object_id!==input.frame_object_id||qualified.reference.fft_object_id!==rawFFT||source.frame?.frame_object_id!==input.frame_object_id)fail('Saved input source does not match the target FFT frame',409);
    const retained=related?.source_reference;if(retained&&(retained.input_view_object_id!==input.source_view_object_id||retained.raw_fft_object_id!==rawFFT||retained.frame_object_id!==input.frame_object_id||!sameRecord(retained.processing_rect_xyxy,input.processing_rect_xyxy)))fail('Retained FFT relation conflicts with its independently verified original input',409);
    const sourcePanel=(source.object.panels as Metadata[])[0]!,picked=checkSelection({kind:'rectangle',coordinate_space:'source_pixels',source_object_id:input.frame_object_id,coordinates:input.float_roi_xyxy,panel:sourcePanel},source.object);
    if(!sameRecord(selectionRectangle(picked as unknown as Selection),input.processing_rect_xyxy))fail('Original float input and processing support differ',409);
    const sourceEntry=[...collection.windows,...collection.closed_windows??[]].find(window=>window.object_id===input.source_view_object_id),known=qualifyPanelWindowContext(retained?.input_view_context??sourceEntry?.view_context,source.object,checkSelection),rect=sourcePanel.image_rect_xyxy as number[],camera=known?.camera??readPanelWindowCamera({scale:1,center_image_xy:[(rect[0]!+rect[2]!)/2,(rect[1]!+rect[3]!)/2]});
    if(retained?.input_view_context?.selection_candidate&&!sameRecord(retained.input_view_context.selection_candidate,picked))fail('Retained original float selection differs from the verified execution input',409);
    const selected=input.annotation_id&&((source.object.annotations??[]) as Metadata[]).some(mark=>mark.annotation_id===input.annotation_id&&mark.kind==='rectangle'&&mark.status!=='retracted'&&sameRecord((mark.anchor as Metadata|undefined)?.coordinates,input.float_roi_xyxy))?input.annotation_id:null;
    verifiedCameraOrigin=known&&!known.camera_origin?'existing_verified_context':'new_fit_preference';verifiedInputContext={version:1,object_id:input.source_view_object_id,panel_mapping_fingerprint:panelWindowMappingFingerprint(source.object),camera,selection_candidate:picked,selected_annotation_id:selected,...(verifiedCameraOrigin==='new_fit_preference'?{camera_origin:'new_fit_preference'}:{})};reference=qualified.reference;reason='';
   }

   // Both entry points consume the same global lease. Direct draft publication
   // during any read must abort navigation, never become a replacement pending.
   confirmNavigation(before,ownOperation);
   if(entry){const latest=windowStore.lookup(entry.window_id,before.collection_revision);if(latest.object_id!==entry.object_id||!windowStore.assetMatches(entry.window_id,reply.data,frame))fail('Saved navigation target changed during readback',409);}
   if(!windowStore.canAdmit(prepared.object,frame)){
    if(!safeId.test(String(reply.data.request_id??'')))fail('Close a read-only window before opening this saved view; its original request identity cannot be queued',409);
    pendingResult={prepared,frameIdentity:frame,request_id:reply.data.request_id,reason:'window_capacity',spatialReturnReference:reference,spatialReturnReason:reason,viewContextRestore:context,navigationLease:true,...(verifiedInputContext?{inputViewContext:verifiedInputContext}:{})};
    lastOperation={action:'show',object_id:prepared.object.object_id,request_id:reply.data.request_id,state:'completed_pending_view'};saveSelection();return state();
   }
   assertInteractionAllowed(context?.selection_candidate??null,{...editState,annotation_edit:null},{object:prepared.object,frame,window_id:entry?.window_id??null});
   const successor=editState.draft_revision+1;if(!Number.isSafeInteger(successor))fail('Draft revision exhausted',409);
   editState={...editState,draft_revision:successor};commitCurrent(prepared);frameIdentity=frame;adoptSpatialReturn(reference,reason);syncWindows(verifiedInputContext);
   selection=context?.selection_candidate??null;editState={...editState,selection:structuredClone(selection),base_object_id:current.object_id};
   const active=windowStore.snapshot();if(entry&&active.active_window_id)windowStore.setContext(active.revision,active.active_window_id,current,context);
   lastOperation={action:body.action,object_id:current.object_id,...(verifiedCameraOrigin?{input_reference_camera:verifiedCameraOrigin}:{}),...(entry?{window_id:entry.window_id}:{}),...(prepared.object.request_id?{request_id:prepared.object.request_id}:{}),state:'completed'};saveSelection();return state();
  }
  // Display-only operations share the exact current identity but never consume
  // its draft lease, pending result, original request, or scientific selection.
  if(body.action==='window-layout'||body.action==='close-window'){
   if(body.action==='window-layout'){fields(p,['collection_revision','windows']);windowStore.updateLayouts(p.collection_revision,p.windows);}
   else{
    fields(p,['collection_revision','window_id']);const collection=windowStore.snapshot();windowStore.lookup(p.window_id,p.collection_revision);
    if(p.window_id===collection.active_window_id){
     const before=beginNavigation(),next=collection.windows.filter(window=>window.window_id!==p.window_id).sort((a,b)=>b.layout.z-a.layout.z)[0];
     if(next){const saved=await readWindowSaved(next.object_id),prepared=await prepareCurrent({data:saved.object,png:saved.png}),context=await navigationTargetContext(next,prepared,saved.frame);confirmNavigation(before);assertInteractionAllowed(context.context?.selection_candidate??null,{...editState,annotation_edit:null},{object:prepared.object,frame:saved.frame,window_id:next.window_id});const revision=editState.draft_revision+1;if(!Number.isSafeInteger(revision))fail('Draft revision exhausted',409);commitCurrent(prepared);frameIdentity=saved.frame;adoptSpatialReturn(context.reference,context.reason);syncWindows();selection=context.context?.selection_candidate??null;editState={...editState,draft_revision:revision,selection:structuredClone(selection),base_object_id:current.object_id};}
     else confirmNavigation(before);
    }
    windowStore.close(windowStore.snapshot().revision,p.window_id);
   }
   stateRevision++;saveSelection();return state();
  }
  if(unresolvedRequest()&&!['draft','select','recover'].includes(String(body.action)))fail('Original scientific request remains unresolved; query original request_id='+unresolvedRequest()+' before another write',409);
  const inactive=windowStore.snapshot();
  if(!inactive.active_window_id&&(inactive.windows.length||(inactive.closed_windows?.length??0))&&!['show','activate-window','latest-observations','recover'].includes(String(body.action)))fail('No image editor is active; reopen an existing image window before editing or computing',409);
  // A pending result must not prevent saving the current observation. Such a
  // save can only adopt on the exact current grid, through the same guarded
  // path as an automatic annotation revision; the old pending entry survives.
  const pendingAnnotationSave=Boolean(pendingResult)&&(body.action==='mark'||body.action==='edit');
  if(pendingAnnotationSave&&lastOperation?.state==='submitted')fail('Original request is unresolved; query its original request_id before saving an annotation',409);
  const writeParams=p as Metadata,currentPanels=current.panels as Metadata[]|undefined;
  const spatialRoiWrite=currentPanels?.length===1&&currentPanels[0].domain==='spatial_pixels'&&(body.action==='mark'&&(writeParams.selection as Metadata|undefined)?.kind==='rectangle'||body.action==='edit'&&Array.isArray(writeParams.updates)&&writeParams.updates.some((update:Metadata)=>((current.annotations??[]) as Metadata[]).some(mark=>mark.annotation_id===update?.annotation_id&&mark.kind==='rectangle')));
  if(spatialRoiWrite){const collection=windowStore.snapshot(),active=collection.windows.find(window=>window.window_id===collection.active_window_id);if(active?.latest_observation_view_object_id&&active.latest_observation_view_object_id!==current.object_id){const message='This is a historical ROI source; explicitly open the retained latest observation view before changing its ROIs',proof=startedRevision===editState.draft_revision?makePanelActionPreflight(body):null;if(proof){const error=Object.assign(new Error(message),{status:409});panelPreflightErrors.set(error,proof);throw error;}fail(message,409);}}
  const opensImage=(['frame','roi','fft','show','return-spatial','preview','calibrate','restore-figure-display','measurement-jump'] as readonly unknown[]).includes(body.action)||body.action==='edit-layout'&&(p as Metadata).auto_commit===false;
  if(pendingResult&&opensImage)fail('Resolve the pending saved result before opening another scientific view; close a read-only window if capacity is full',409);
  const scientificBefore=state();
  const fftReturnSource=body.action==='fft'?{object:current,png,frame:frameIdentity,inputViewContext:null as PanelWindowViewContext|null}:null;
  const returnSelection=body.action==='return-spatial'?structuredClone(selection):null;
  if(body.action==='draft'){const previousDraft=editState;fields(p,['draft_revision','dirty','gesture_active','selection','annotation_edit','confirm_persistence']);if(p.confirm_persistence!==undefined&&typeof p.confirm_persistence!=='boolean')fail('confirm_persistence must be an explicit boolean');if(!Number.isSafeInteger(p.draft_revision)||((p as Metadata).draft_revision as number)<editState.draft_revision||typeof p.dirty!=='boolean'||typeof p.gesture_active!=='boolean')fail('Invalid or stale draft revision',409);const picked=p.selection==null?null:checkSelection(p.selection);let annotationEdit=editState.annotation_edit??null;if(p.annotation_edit!==undefined){annotationEdit=null;if(p.annotation_edit!==null){const u=p.annotation_edit;fields(u,['annotation_id','coordinates','text','color','status','presentation']);if(u.presentation!==undefined)validate(u.presentation,annotationPresentation,'presentation');const mark=((current.annotations??[]) as Metadata[]).find(m=>m.annotation_id===u.annotation_id);if(!mark?.anchor)fail('Draft annotation must name an existing anchored mark');if(u.text!==undefined&&(typeof u.text!=='string'||u.text.length>256)||u.color!==undefined&&!(['cyan','orange','white','amber','green'] as readonly unknown[]).includes(u.color)||u.status!==undefined&&!(['hypothesized','user_confirmed','retracted'] as readonly unknown[]).includes(u.status))fail('Invalid annotation draft fields');const panels=((current.panels??[]) as Metadata[]).filter(p=>p.source_object_id===((mark as Metadata).anchor as Metadata).source_object_id&&(({frequency:'frequency_cycles_per_pixel',spatial_pixels:'source_pixels',source_array_indices:'source_array_indices'} as Metadata)[p.domain as string])===((mark as Metadata).anchor as Metadata).coordinate_space);if(panels.length!==1)fail('Draft annotation requires one exact current panel');const anchor=checkSelection({...(mark!.anchor as Metadata),kind:mark!.kind,coordinates:u.coordinates??(mark.anchor as Metadata).coordinates,panel:panels[0]});annotationEdit={...structuredClone(u),kind:mark.kind,coordinate_space:anchor.coordinate_space,source_object_id:anchor.source_object_id,panel:anchor.panel};}}const candidateEdit:PanelEditState={draft_revision:p.draft_revision as number,dirty:p.dirty,gesture_active:p.gesture_active,selection:p.selection===undefined?editState.selection:picked,annotation_edit:annotationEdit,base_object_id:current.object_id};assertInteractionAllowed(p.selection===undefined?selection:picked,candidateEdit);editState=candidateEdit;if(p.selection!==undefined)selection=picked;saveSelection({coalesce:p.confirm_persistence!==true&&previousDraft.gesture_active===editState.gesture_active&&previousDraft.dirty===editState.dirty});return body.lightweight?draftAck():state();}
  if(body.action==='accept-result'){
   fields(p,[]);if(startedRevision!==editState.draft_revision)fail('Stale draft revision; inspect current state before accepting a result',409);if(editState.dirty||editState.gesture_active)fail('Save or explicitly discard draft before viewing pending result',409);
   if(pendingResult){
    if(!windowStore.canAdmit(pendingResult.prepared.object,pendingResult.frameIdentity))fail('Five image windows are open; close a read-only window before accepting the saved result',409);
    const restoredContext=pendingResult.navigationLease?qualifyPanelWindowContext(pendingResult.viewContextRestore,pendingResult.prepared.object,checkSelection):null;
    if(pendingResult.navigationLease){if(selectionTimer!==null||selectionPersistenceError||lastOperation?.state==='submitted')fail('Confirm the draft and resolve the original request before accepting saved navigation',409);const successor=editState.draft_revision+1;if(!Number.isSafeInteger(successor))fail('Draft revision exhausted',409);editState={...editState,draft_revision:successor};}
    const selected=selection;commitCurrent(pendingResult.prepared,{annotationIds:pendingResult.annotationIds});adoptSpatialReturn(pendingResult.spatialReturnReference,pendingResult.spatialReturnReason);if(pendingResult.preserve_selection)selection=selected;frameIdentity=pendingResult.frameIdentity;syncWindows(pendingResult.inputViewContext);
    if(pendingResult.navigationLease){
     selection=restoredContext?.selection_candidate??null;editState={...editState,selection:structuredClone(selection),base_object_id:current.object_id};const active=windowStore.snapshot();if(active.active_window_id)windowStore.setContext(active.revision,active.active_window_id,current,restoredContext);
    }
    lastOperation={action:'accept-result',object_id:current.object_id,request_id:pendingResult.request_id,...(pendingResult.annotationIds?.length?{annotation_ids:pendingResult.annotationIds}:{})};pendingResult=null;saveSelection();
   }
   return state();
  }
  if(body.action==='select'){fields(p,['selection']);const candidate=checkSelection(p.selection);assertInteractionAllowed(candidate,editState);selection=candidate;saveSelection();return state();}
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
  else if(body.action==='roi'||body.action==='fft'){
   fields(p,body.action==='fft'?['selection','window','subtract_mean']:['selection']);if(body.action==='fft'&&(p.window!==undefined&&!(['hann','none'] as readonly unknown[]).includes(p.window)||p.subtract_mean!==undefined&&typeof p.subtract_mean!=='boolean'))fail('Invalid explicit FFT preprocessing');
   const selected=checkSelection(p.selection),rect=selectionRectangle(selected as unknown as Selection);
   if(body.action==='fft'&&fftReturnSource){
    const collection=windowStore.snapshot(),entry=collection.windows.find(w=>w.window_id===collection.active_window_id&&w.object_id===current.object_id),context=qualifyPanelWindowContext(entry?.view_context,current,checkSelection);
    if(context&&sameRecord(context.selection_candidate,selected))fftReturnSource.inputViewContext=structuredClone(context);
   }
   if(selected.panel.domain==='frequency'){if(body.action==='fft')fail('FFT needs a spatial ROI, not a frequency crop');r=await journalCall('image_preview',{object_id:current.object_id,frequency_rect:rect});}
   else{if(selected.panel.domain!=='spatial_pixels')fail('Imported frequency arrays have no spatial ROI mapping');const target=await withCurrentContext(selected.source_object_id),recipe:Metadata=Object.fromEntries(['gamma','display_range','max_size','upscale','interpolation','component'].filter(key=>(effectiveDisplay as Metadata)?.[key]!==undefined).map(key=>[key,(effectiveDisplay as Metadata)[key]]));const marks=((current.annotations??[]) as Metadata[]).filter(mark=>mark.kind==='rectangle'&&mark.status!=='retracted'&&mark.anchor&&sameRecord((mark.anchor as Metadata).coordinates,selected.coordinates)&&(mark.anchor as Metadata).source_object_id===selected.source_object_id&&(mark.anchor as Metadata).coordinate_space===selected.coordinate_space);const frozen=body.action==='fft'?{source_view_object_id:String(current.object_id),frame_object_id:String(frameIdentity?.frame_object_id),selection:structuredClone(selected),annotation_id:marks.length===1?String(marks[0]!.annotation_id):null,calibration:structuredClone(current.xy_calibration??null)}:undefined;r=await journalCall(body.action==='fft'?'image_fft':'image_preview',{object_id:target,rect,...(body.action==='fft'?{window:p.window??'hann',subtract_mean:p.subtract_mean??true}:recipe)},frozen);}
  }
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
  else if(body.action==='calibrate'){fields(p,['scope','xy_scale','source_text','coordinate_domain']);calibrationInput={source_view_object_id:current.object_id,draft_revision:startedRevision,parameters:structuredClone(p)};const context={calibration_input:calibrationInput};const calibrated=await journalCall('image_calibrate',{object_id:current.object_id,...p},undefined,context);r=await journalCall('image_preview',{object_id:calibrated.data.object_id},undefined,context);}
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
   if(body.draft_revision!==editState.draft_revision||editState.dirty||editState.gesture_active||editState.annotation_edit||pendingResult||selectionTimer!==null||selectionPersistenceError)fail('Save and confirm the exact current draft and pending result before returning to the spatial observation',409);
   const offered=spatialReturnState(spatialReturnReference,current,frameIdentity,spatialReturnReason);
   if(offered.status!=='ready')fail('Spatial return unavailable: '+offered.reason_code,409);
   try{
    const qualified=await qualifySpatialReturn(spatialReturnReference);r=qualified.view;
    const collection=windowStore.snapshot(),entry=collection.windows.find(w=>w.window_id===collection.active_window_id&&w.object_id===current.object_id),source=entry?.source_reference;
    if(source?.input_view_object_id===qualified.reference.view_object_id&&source.raw_fft_object_id===qualified.reference.fft_object_id&&source.frame_object_id===qualified.reference.frame_object_id){
     const context=qualifyPanelWindowContext(source.input_view_context,qualified.view.data,checkSelection);
     if(context?.selection_candidate&&sameRecord(selectionRectangle(context.selection_candidate as unknown as Selection),qualified.reference.source_rect_xyxy))returnedInputContext=context;
    }
   }
   catch(error){spatialReturnReason=returnFailure(error);try{spatialReturnReference=readSpatialReturnReference(spatialReturnReference);}catch{spatialReturnReference=null;}stateRevision++;saveSelection();fail('Spatial return unavailable: '+spatialReturnReason,409);}
  }
  else if(body.action==='recover'){fields(p,['request_id']);if(p.request_id!==undefined&&(typeof p.request_id!=='string'||!safeId.test(p.request_id)))fail('Valid original request_id required');let operation=lastOperation;const original=p.request_id??operation?.request_id;if(operation?.action==='recheck-source'&&original===operation.request_id)return querySourceCheck(original);if(!safeId.test(((original??'' as string) as string)))fail('No valid saved request to query');if(inheritedOperation&&original!==inheritedOperation.request_id)fail('Query the exact inherited unresolved scientific request before another request',409);if(p.request_id!==undefined){if(!existsSync(path.join(journal,`${original}.request.json`))&&!(inheritedOperation?.request_id===original&&inheritedJournal&&existsSync(path.join(inheritedJournal,`${original}.request.json`))))fail('Original request is not journaled by this panel',404);if(operation?.request_id!==original)operation={request_id:original};}const localReceipt=path.join(journal,`${original}.response.json`);if(existsSync(localReceipt)){const receipt=JSON.parse(readFileSync(localReceipt,'utf8')) as Metadata,admission=readImageAdmissionFailure(receipt.admission_failure,undefined,original);if(receipt.state==='not_submitted'&&admission){lastOperation={...operation,state:'not_submitted',admission_failure:admission};saveSelection();return {...state(),execution_recovery:{state:'not_submitted',request_id:original,automatic_retry:false}};}}r=await journalCall('image_result',{request_id:original});if(!r.data.object_id)fail('Original request has not returned an image object');if(r.data.kind==='source_proof'){const directory=inheritedOperation?.request_id===original&&inheritedJournal?inheritedJournal:journal,file=path.join(directory,String(original)+'.request.json'),request=JSON.parse(readFileSync(file,'utf8')) as Metadata,args=request.arguments as Metadata;if(request.name!=='image_source_proof'||args?.request_id!==original)fail('Original proof request identity is not journaled here',409);if(inheritedOperation?.request_id===original)inheritedOperation=null;return finishSourceProof(r,{action:'source-proof',request_id:original,proof_root_object_id:args.object_id,proof_purpose:args.purpose});}if(analysis?.status().recovery_available&&inheritedOperation?.request_id!==original){lastOperation={...operation,state:'completed',object_id:r.data.object_id,result_not_adopted:true};saveSelection();return state();}if(inheritedOperation?.request_id===original){const inherited=inheritedOperation;if(['measure','statistics','profile','export','context'].includes(String(r.data.kind))){lastOperation={...inherited,state:'completed',object_id:r.data.object_id,result_not_adopted:true};inheritedOperation=null;saveSelection();return state();}const display=await displayObject(r),prepared=await prepareCurrent(display),frame=await findFrameIdentity(display.data);pendingResult={prepared,frameIdentity:frame,request_id:original,reason:'unsaved_draft'};try{const input=readPanelExecutionInput(workspace!,String(original));if(input.qualification==='validated'&&input.status==='completed'&&input.fft_object_id===r.data.object_id&&input.input_snapshot){const frozen=input.input_snapshot,reference:SpatialReturnReference={version:1,view_object_id:frozen.source_view_object_id,frame_object_id:frozen.frame_object_id,fft_object_id:input.fft_object_id,source_rect_xyxy:frozen.processing_rect_xyxy};await qualifySpatialReturn(reference);pendingResult.spatialReturnReference=reference;pendingResult.spatialReturnReason='';}}catch{/* Old/unqualified execution has no invented spatial return identity. */}lastOperation={...inherited,state:'completed_pending_view',object_id:r.data.object_id,result_not_adopted:true};inheritedOperation=null;saveSelection();return state();}if(operation!.action==='figure-base'){if(operation!.figure_step==='scale'){figureBars.set(current.object_id,r.data.scale_bar??null);return {...state(),figure_base_recovery:{state:'scale_render_saved_clean_render_not_submitted',request_id:original,object_id:r.data.object_id}};}return figureAsset(r);}if(operation!.action==='restore-figure-display')figureRestore=operation!.figure_restore as Metadata|null;if(r.data.kind==='context'&&(r.data.user_context as Metadata|undefined)?.research_observation)return saveResearchObservation(r.data);if((['statistics','profile'] as readonly unknown[]).includes(r.data.kind)){numericResults[r.data.kind as 'statistics'|'profile']=r.data;lastOperation=r.data;saveSelection();return state();}if((['measure','export'] as readonly unknown[]).includes(r.data.kind)){if(r.data.kind==='measure')crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'measure',scientificBefore,r.data,{annotation_id:operation?.annotation_id});lastOperation=publicImageObject(r.data);saveSelection();return state();}if(r.data.kind==='annotate')crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'edit',scientificBefore,r.data);if(r.data.kind==='calibration')crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,'calibrate',scientificBefore,r.data);r=await displayObject(r);}
  else fail('Unknown panel action');
  if((['edit','mark','calibrate'] as readonly unknown[]).includes(body.action))crystalEvidence=rememberCrystalScienceEvent(crystalEvidence,body.action as string,scientificBefore,r.data);
  const prepared=await prepareCurrent(r),nextFrame=await findFrameIdentity(r.data);
  if(body.action==='return-spatial'&&(body.expected_object_id!==current.object_id||editState.draft_revision!==startedRevision||editState.dirty||editState.gesture_active||editState.annotation_edit||pendingResult||selectionTimer!==null||selectionPersistenceError||lastOperation?.state==='submitted'||!sameRecord(selection,returnSelection)))fail('Draft changed while reading the saved spatial view; current view and edits are retained',409);
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
  const affected={...(calibrationInput?{calibration_input:calibrationInput}:{}),...(annotationIds.length?{annotation_ids:annotationIds}:{}),...(figureRestore?{figure_restore:figureRestore}:{})};
  const layoutEdit=body.action==='edit-layout',autoEdit=body.action==='edit'&&p.auto_commit===true||layoutEdit&&p.auto_commit!==false||pendingAnnotationSave;
  if(layoutEdit||autoEdit){
   if(!sameRecord(prepared.object.panels??[],current.panels??[])||!sameRecord(prepared.object.scientific_grid_identity??null,current.scientific_grid_identity??null))fail('Automatic annotation adoption requires the exact same scientific grid and render mapping',409);
  }
  if((body.action==='mark'||body.action==='edit')&&annotationIds.some(id=>((prepared.object.annotations??[]) as Metadata[]).some(mark=>mark.annotation_id===id&&mark.kind==='rectangle'))){
   if(!sameRecord(prepared.object.panels??[],current.panels??[])||!sameRecord(prepared.object.scientific_grid_identity??null,current.scientific_grid_identity??null))fail('Saved ROI observations require the exact current scientific grid and render mapping',409);
   windowStore.rememberObservations(prepared.object,nextFrame);
  }
  if(['preview','calibrate','restore-figure-display'].includes(body.action as string))windowStore.continueObservations(current,prepared.object,nextFrame);
  if(autoEdit){
   const newerDraft=editState.draft_revision!==startedRevision||editState.gesture_active,latestEdit=structuredClone(editState),latestSelection=selection;
   commitCurrent(prepared,{annotationIds});frameIdentity=nextFrame;syncWindows();
   if(layoutEdit)selection=latestSelection;
   if(newerDraft){editState={...latestEdit,base_object_id:current.object_id};selection=latestSelection;}
   lastOperation={action:body.action,object_id:current.object_id,request_id:current.request_id,...affected};
   saveSelection();return {...state(),auto_edit_committed:true};
  }
  const capacityBlocked=!windowStore.canAdmit(prepared.object,nextFrame);
  if(editState.draft_revision!==startedRevision||editState.gesture_active||capacityBlocked){
   pendingResult={prepared,frameIdentity:nextFrame,request_id:r.data.request_id,annotationIds,reason:capacityBlocked?'window_capacity':'unsaved_draft',...(layoutEdit?{preserve_selection:true}:{}),...(fftReturnSource?{inputViewContext:fftReturnSource.inputViewContext}:{}),...(body.action==='return-spatial'?{viewContextRestore:returnedInputContext,navigationLease:true}:{}),...(nextSpatialReturn!==undefined?{spatialReturnReference:nextSpatialReturn,spatialReturnReason:nextSpatialReason}:{})};
   lastOperation={action:body.action,object_id:r.data.object_id,request_id:r.data.request_id,state:'completed_pending_view',...affected};
  }else{
   const selected=selection;
   if(body.action==='return-spatial'){const successor=editState.draft_revision+1;if(!Number.isSafeInteger(successor))fail('Draft revision exhausted',409);editState={...editState,draft_revision:successor};}
   commitCurrent(prepared,{annotationIds});adoptSpatialReturn(nextSpatialReturn,nextSpatialReason);if(layoutEdit)selection=selected;frameIdentity=nextFrame;syncWindows(fftReturnSource?.inputViewContext);
   if(body.action==='return-spatial'){
    selection=returnedInputContext?.selection_candidate??null;editState={...editState,selection:structuredClone(selection),base_object_id:current.object_id};const active=windowStore.snapshot();if(active.active_window_id)windowStore.setContext(active.revision,active.active_window_id,current,returnedInputContext);
   }
   lastOperation={action:body.action,object_id:current.object_id,request_id:current.request_id,...affected};
  }
  saveSelection();return state();
 };
 const presentationDirectory=path.join(journal,'presentations');mkdirSync(presentationDirectory,{recursive:true});
 const presentationReceipt=(id:unknown):unknown=>{if(!safeId.test(((id??'' as string) as string)))fail('Valid original request_id required');const response=path.join(presentationDirectory,`${id}.response.json`);if(existsSync(response))return JSON.parse(readFileSync(response,'utf8'));if(existsSync(path.join(presentationDirectory,`${id}.request.json`)))return {presentation:{request_id:id,status:'pending',limitation:'query original ID; never automatically resubmit'}};fail('Presentation request not found',404);};
 const present=async(input:unknown)=>{jointOwner?.assertMutable();const body=input as Metadata;
  fields(body,['object_id','expected_object_id','draft_revision','request_id']);
  if(!objectId.test(((body.object_id??'' as string) as string))||!objectId.test(((body.expected_object_id??'' as string) as string))||!safeId.test(((body.request_id??'' as string) as string))||!Number.isSafeInteger(body.draft_revision)||((body as Metadata).draft_revision as number)<0)fail('Explicit object, expected view, draft revision and original request ID required');
  const file=path.join(presentationDirectory,`${body.request_id}.request.json`);
  if(existsSync(file)){const decoded:unknown=JSON.parse(readFileSync(file,'utf8'));const prior=decoded as Metadata;if(['object_id','expected_object_id','draft_revision','request_id'].some(key=>prior[key]!==body[key]))fail('Presentation request ID parameter conflict',409);return presentationReceipt(body.request_id);}
  analysis?.assertSemanticEditingAllowed();
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
 const presentEvidence=async(input:unknown)=>{jointOwner?.assertMutable();const body=input as Metadata;
  fields(body,['expected_object_id','draft_revision','request_id','evidence']);
  if(!objectId.test((body.expected_object_id??'') as string)||!safeId.test((body.request_id??'') as string)||!Number.isSafeInteger(body.draft_revision)||(body.draft_revision as number)<0)fail('Explicit evidence view, draft revision and original request identity required');
  const file=path.join(evidenceDirectory,`${body.request_id}.request.json`);
  if(existsSync(file)){if(!sameRecord(JSON.parse(readFileSync(file,'utf8')),body))fail('Evidence request ID parameter conflict',409);return evidenceReceipt(body.request_id);}
  analysis?.assertSemanticEditingAllowed();
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
 const inspectRoiHandoff=async(snapshot:PanelState):Promise<PanelMultiRoiHandoff>=>{
  // A saved-source read is not another active selection. Freeze the full
  // operational snapshot and reject any lease/layout/edit change during reads.
  const before=JSON.stringify(snapshot),active=panelRoiHandoff(snapshot as unknown as PanelRoiSnapshot),collection=snapshot.window_collection!;
  const frameId=objectId.test(String(snapshot.frame_identity?.frame_object_id))?snapshot.frame_identity!.frame_object_id as string:null;
  const packet:PanelMultiRoiHandoff={schema_version:1,read_only:true,validation_status:'unavailable',panel_id:snapshot.panel_id,
   ...(snapshot.helper_session_id?{helper_session_id:snapshot.helper_session_id,panel_generation:snapshot.panel_generation}:{}),
   active_view_object_id:snapshot.object.object_id as string,state_revision:snapshot.state_revision,draft_revision:snapshot.edit_state.draft_revision,collection_revision:collection.revision,frame_object_id:frameId,
   interaction_gate:structuredClone(active.interaction_gate),active_handoff:active,source_observations:[],fft_relations:[],
   semantics:'Read-only saved references, not permission, scientific confirmation, or a second active input. Current selections and drafts belong only to active_handoff. Later observations never rewrite an FFT input; equal integer processing support does not establish original floating ROI identity.'};
  type Saved=Awaited<ReturnType<typeof readWindowSaved>>;
  const reads=new Map<string,Promise<Saved>>(),read=(id:string):Promise<Saved>=>{
   let value=reads.get(id);if(!value){if(reads.size>=20)fail('ROI handoff immutable read budget exceeded',409);value=readWindowSaved(id);reads.set(id,value);}return value;
  };
  const candidates=new Map<string,Set<PanelSourceObservations['roles'][number]>>();
  const add=(id:unknown,role:PanelSourceObservations['roles'][number])=>{if(!objectId.test(String(id)))return;const roles=candidates.get(id as string)??new Set<PanelSourceObservations['roles'][number]>();roles.add(role);candidates.set(id as string,roles);};
  const spatial=(value:Metadata,frame:PanelFrameIdentity|null)=>{
   const panels=value.panels;return Boolean(frameId&&frame?.frame_object_id===frameId&&value.array_domain!=='frequency'&&Array.isArray(panels)&&panels.length===1&&(panels[0] as Metadata)?.domain==='spatial_pixels'&&(panels[0] as Metadata).source_object_id===frameId);
  };
  if(spatial(snapshot.object,snapshot.frame_identity))add(snapshot.object.object_id,'active_spatial');
  const currentSourceIds=new Set<string>();
  for(const entry of collection.windows){
   if(entry.role==='source'||entry.role==='roi'){add(entry.object_id,'retained_spatial');currentSourceIds.add(entry.latest_observation_view_object_id??entry.object_id);}
   if(entry.latest_observation_view_object_id){add(entry.latest_observation_view_object_id,'latest_observation');currentSourceIds.add(entry.latest_observation_view_object_id);}
   if(entry.role==='fft'&&entry.source_reference)add(entry.source_reference.input_view_object_id,'fft_input');
  }
  if(candidates.size>10)fail('ROI handoff source-reference budget exceeded',409);
  for(const [id,roles]of candidates){
   const source:PanelSourceObservations={object_id:id,roles:[...roles],status:'unavailable',reason_code:'saved_source_unavailable',frame_object_id:frameId,handoff:null,observations:[]};
   try{
    const saved=await read(id);if(!spatial(saved.object,saved.frame))throw new Error('source_frame_or_domain_mismatch');
    const retained=collection.windows.find(entry=>entry.object_id===id&&(entry.role==='source'||entry.role==='roi'));
    if(retained&&!windowStore.assetMatches(retained.window_id,saved.object,saved.frame))throw new Error('retained_source_asset_changed');
    const latestEntries=collection.windows.filter(entry=>entry.latest_observation_view_object_id===id);
    if(latestEntries.some(entry=>!windowStore.observationMatches(entry.window_id,saved.object,saved.frame)))throw new Error('latest_source_asset_changed');
    const savedSnapshot={...snapshot,object:saved.object,frame_identity:saved.frame,selection:null,
     edit_state:{...snapshot.edit_state,dirty:false,gesture_active:false,selection:null,annotation_edit:null},pending_result:null,last_operation:null,draft_persistence:{pending:false,error:null}} as unknown as PanelRoiSnapshot;
    const model=roiObservationModel(savedSnapshot),handoff=model.packet;
    if(handoff.inspection_status!=='bounded_snapshot'||handoff.pair_inspection.status==='ambiguous_annotation_identity')throw new Error(handoff.inspection_status!=='bounded_snapshot'?handoff.inspection_status:'ambiguous_annotation_identity');
    // The rows describe immutable saved geometry; the global active gate is
    // retained so no historical source packet can authorize a dirty handoff.
    source.handoff={...handoff,interaction_gate:structuredClone(active.interaction_gate),draft_state:structuredClone(active.draft_state),current_selection:null};
    const marks=Array.isArray(saved.object.annotations)?saved.object.annotations as Metadata[]:[];
    source.observations=model.rows.map<PanelSourceRoiObservation>(row=>{
     const matches=marks.filter(mark=>mark.annotation_id===row.annotation_id),note=matches.length===1?matches[0].note:null;
     const reason=typeof note==='string'&&note.length<=1000&&note.trim()?note.trim():null;
     return {...row,label:row.label.length<=256?row.label:'ROI（原标签超预算）',reason,reason_status:reason?'recorded':'unknown',selected:false};
    });
    source.status='validated';source.reason_code=null;
   }catch(error){const reason=(error as Error).message;source.reason_code=['source_frame_or_domain_mismatch','retained_source_asset_changed','latest_source_asset_changed','annotation_budget_exceeded','panel_budget_exceeded','ambiguous_annotation_identity'].includes(reason)?reason:'saved_source_unavailable';}
   packet.source_observations.push(source);
  }
  for(const entry of collection.windows.filter(window=>window.role==='fft')){
   const source=entry.source_reference,relation:PanelFftRoiRelation={window_id:entry.window_id,display_object_id:entry.object_id,raw_fft_object_id:source?.raw_fft_object_id??null,input_view_object_id:source?.input_view_object_id??null,status:'unknown',reason_code:'no_saved_input_reference',processing_rect_xyxy:source?[...source.processing_rect_xyxy]:null,input_float_coordinates:null,input_annotation_id:null,calibration_relation:'unknown',current_observation_matches:[]};
   try{
    const display=await read(entry.object_id);if(display.frame?.frame_object_id!==frameId||!windowStore.assetMatches(entry.window_id,display.object,display.frame))throw new Error('fft_display_asset_changed');
    if(!source){const panels=display.object.panels as Metadata[]|undefined;if(panels?.length===1&&panels[0].domain==='frequency'&&objectId.test(String(panels[0].source_object_id)))relation.raw_fft_object_id=panels[0].source_object_id as string;packet.fft_relations.push(relation);continue;}
    const reference=readSpatialReturnReference({version:1,view_object_id:source.input_view_object_id,frame_object_id:source.frame_object_id,fft_object_id:source.raw_fft_object_id,source_rect_xyxy:source.processing_rect_xyxy});
    const input=await read(source.input_view_object_id),raw=await read(source.raw_fft_object_id);
    if(reference.frame_object_id!==frameId||!spatial(input.object,input.frame))throw new Error('fft_input_frame_mismatch');
    validateSpatialReturn(reference,input.object,input.png,input.frame,raw.object,raw.frame);
    if(spatialReturnState(reference,display.object,display.frame).status!=='ready')throw new Error('fft_display_root_mismatch');
    const inputPacket=packet.source_observations.find(saved=>saved.object_id===source.input_view_object_id&&saved.status==='validated');
    if(!inputPacket)throw new Error('fft_input_observation_unavailable');
    const context=qualifyPanelWindowContext(source.input_view_context,input.object,checkSelection),selection=context?.selection_candidate;
    if(selection?.kind==='rectangle'&&selection.coordinate_space==='source_pixels'&&sameRecord(selectionRectangle(selection as unknown as Selection),source.processing_rect_xyxy)){
     relation.input_float_coordinates=[...selection.coordinates];
     const marks=inputPacket.observations.filter(mark=>mark.annotation_id===context!.selected_annotation_id&&mark.usable&&sameRecord(mark.original_anchor.coordinates,selection.coordinates));
     if(marks.length===1)relation.input_annotation_id=marks[0].annotation_id;
    }
    const inputCalibration=input.object.xy_calibration??null,currentCalibration=display.object.xy_calibration??null;
    relation.calibration_relation=inputCalibration===null||currentCalibration===null?'unknown':sameRecord(inputCalibration,currentCalibration)?'same':'different';
    for(const currentSource of packet.source_observations.filter(saved=>saved.status==='validated'&&currentSourceIds.has(saved.object_id))){
     for(const mark of currentSource.observations){
      let compared:PanelFftObservationMatch['relation']='unknown';
      if(mark.usable&&mark.annotation_id!==null&&relation.input_annotation_id!==null&&mark.annotation_id===relation.input_annotation_id&&relation.input_float_coordinates)compared=sameRecord(mark.original_anchor.coordinates,relation.input_float_coordinates)?'exact_original_geometry':'changed_geometry';
      else if(mark.usable&&mark.annotation_id!==null&&sameRecord(mark.rect_xyxy,source.processing_rect_xyxy))compared='same_processing_window';
      relation.current_observation_matches.push({source_view_object_id:currentSource.object_id,annotation_id:mark.annotation_id,relation:compared});
     }
    }
    relation.status='validated';relation.reason_code=relation.input_float_coordinates?null:'original_float_context_unknown';
   }catch{relation.status='unavailable';relation.reason_code='saved_fft_input_unavailable';}
   packet.fft_relations.push(relation);
  }
  for(const source of packet.source_observations){
   if(source.roles.includes('fft_input')&&!packet.fft_relations.some(relation=>relation.status==='validated'&&relation.input_view_object_id===source.object_id)){
    const independentRoles=source.roles.filter(role=>role!=='fft_input');
    if(independentRoles.length)source.roles=independentRoles;
    else{source.status='unavailable';source.reason_code='unqualified_fft_input_reference';source.handoff=null;source.observations=[];}
   }
  }
  if(JSON.stringify(state())!==before)fail('Panel changed while reading ROI handoff; read the current state again without replaying science',409);
  const validated=packet.source_observations.some(source=>source.status==='validated')||packet.fft_relations.some(relation=>relation.status==='validated'),incomplete=packet.source_observations.some(source=>source.status!=='validated')||packet.fft_relations.some(relation=>relation.status!=='validated');
  packet.validation_status=validated?incomplete?'partial':'validated':'unavailable';return packet;
 };
 const staticFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/coordinates.mjs',['coordinates.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/viewer-state.mjs',['viewer-state.mjs','text/javascript; charset=utf-8']],['/viewer-render.mjs',['viewer-render.mjs','text/javascript; charset=utf-8']],['/annotation-presentation.mjs',['annotation-presentation.mjs','text/javascript; charset=utf-8']],['/figure-export.mjs',['figure-export.mjs','text/javascript; charset=utf-8']],['/measurement-workspace.mjs',['measurement-workspace.mjs','text/javascript; charset=utf-8']],['/data-probes.mjs',['data-probes.mjs','text/javascript; charset=utf-8']],['/user-workflow.mjs',['user-workflow.mjs','text/javascript; charset=utf-8']]]);
 staticFiles.set('/figure-composer.mjs',['figure-composer.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/sequence-evidence.mjs',['sequence-evidence.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/domain-evidence.mjs',['domain-evidence.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/evidence-contracts.mjs',['evidence-contracts.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/roi-observations.mjs',['roi-observations.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/observation-contract.mjs',['observation-contract.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/research-workspace.mjs',['research-workspace.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/public-research.mjs',['public-research.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/research-question.mjs',['research-question.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/research-leads.mjs',['research-leads.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/offline-research.mjs',['offline-research.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/research-leads-ui.mjs',['research-leads-ui.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/result-semantics.mjs',['result-semantics.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/gpa-evidence.mjs',['gpa-evidence.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/window-workspace.mjs',['window-workspace.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/workspace-controls.mjs',['workspace-controls.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/settle-workspace.mjs',['settle-workspace.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/execution-history.mjs',['execution-history.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/roi-comparison.mjs',['roi-comparison.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/window-source-overlay.mjs',['window-source-overlay.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/roi-editing.mjs',['roi-editing.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/multi-roi-handoff.mjs',['multi-roi-handoff.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/known-length-calibration.mjs',['known-length-calibration.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/selection-fft-relations.mjs',['selection-fft-relations.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/panel-preflight.mjs',['panel-preflight.mjs','text/javascript; charset=utf-8']);
 staticFiles.set('/source-proofs.mjs',['source-proofs.mjs','text/javascript; charset=utf-8']);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  try{
   const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;if(req.headers.host!==`127.0.0.1:${(server.address() as AddressInfo).port}`)fail('Invalid Host',403);const url=new URL(req.url!,origin);
   const reviewResource=/^\/joint-review\/([a-f0-9]{48})(\/image\.png)?$/.exec(url.pathname);
   if(req.method==='GET'&&reviewResource){const resource=jointOwner?.resource(reviewResource[1],Boolean(reviewResource[2]));if(!resource)fail('Review resource unavailable',404);res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");res.setHeader('Content-Type',resource.type);res.end(resource.body);return;}
   if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
   if(req.method==='GET'&&staticFiles.has(url.pathname)){const [file,type]=staticFiles.get(url.pathname)!;res.setHeader('Content-Type',type);res.end(readFileSync(path.join(root,'ui','image-panel',file)));return;}
   const supplied=req.headers['x-panel-token'];if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))fail('Panel token required',403);
   if(req.headers.origin&&req.headers.origin!==origin)fail('Cross-origin requests refused',403);
   res.setHeader('Content-Type','application/json');
   if(req.method==='GET'&&url.pathname==='/api/public-research'){res.end(JSON.stringify(publicResearch?.snapshot()??{enabled:false}));return;}
   if(req.method==='GET'&&['/api/offline-context','/api/offline-review','/api/offline-source'].includes(url.pathname)){
    offlineReadGuard();const query=[...url.searchParams.keys()];
    if(url.pathname==='/api/offline-context'){
     if(query.length!==1||query[0]!=='context_id'||!objectId.test(String(url.searchParams.get('context_id'))))fail('Exact offline context ID required');
     res.end(JSON.stringify(offlineContext(workspace!,state(),url.searchParams.get('context_id')!)));return;
    }
    if(query.some(k=>!['lead_id','result_id'].includes(k))||url.searchParams.getAll('lead_id').length!==1)fail('Exact offline candidate query required');
    const entry=researchOffline?.entries.find(c=>c.response.candidate_id===url.searchParams.get('lead_id'));if(!entry)fail('Offline candidate not found',404);
    if(url.pathname==='/api/offline-source'){
     if(query.length!==2||url.searchParams.getAll('result_id').length!==1)fail('Exact offline result ID required');
     const ref=entry.binding.references.find(r=>r.result_id===url.searchParams.get('result_id'));if(!ref)fail('Result not in original offline context',409);
     const history=readImageStatisticsHistory({workspace:workspace!,objectId:entry.binding.view_id,limit:512}),observation=history.entries.find(e=>sameResearchValue(referenceFromStatisticsOffline(e),ref));
     if(!observation)fail('Exact offline source reference unavailable',409);
     const saved=await readWindowSaved(ref.input_view_id,{includeFrameAncestry:true});
     if(typeof saved.png!=='string'||saved.png.length>4*1024*1024)fail('Bounded saved source PNG unavailable',409);
     res.end(JSON.stringify({version:1,local_only:true,reference:ref,source_rect_xyxy:observation.source_rect_xyxy,statistics:observation.statistics,png_base64:saved.png,notice:'Explicit local saved input preview; no model delivery; active view and candidate binding unchanged'}));return;
    }
    if(query.length!==1||entry.status!=='pending')fail('Only exact pending candidate can be reviewed',409);
    const packet=offlineContext(workspace!,state(),entry.binding.context_id,entry.binding);
    res.end(JSON.stringify({version:1,original_binding:entry.binding,review:{scope_sha256:entry.binding.scope_sha256,lease:packet.binding.lease},observations:packet.observations}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/research-leads'){
    const names=[...url.searchParams.keys()];if(names.length!==1||names[0]!=='object_id'||url.searchParams.get('object_id')!==current.object_id)fail('Research lead read needs the exact current object',409);
    res.end(JSON.stringify({schema_version:1,read_only:true,object_id:current.object_id,question:researchQuestion??null,leads:resolveResearchLeads(workspace!,researchLeads,researchQuestion)}));return;
   }
   if(req.method==='GET'&&(url.pathname==='/api/state'||url.pathname==='/api/workspace')){res.end(JSON.stringify(state()));return;}
   if(req.method==='GET'&&url.pathname==='/api/execution-history'){
    if([...url.searchParams.keys()].some(key=>key!=='request_id')||url.searchParams.getAll('request_id').length>1)fail('Only one optional original execution request_id is allowed');const request=url.searchParams.get('request_id'),records=request?[readPanelExecutionInput(workspace!,request)]:listPanelExecutionInputs(workspace!);res.end(JSON.stringify({schema_version:1,read_only:true,records}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/comparisons'){
    if([...url.searchParams.keys()].length)fail('Unexpected comparison list parameters');const module=await comparisonReports(),reports=module.listRoiComparisonReports(workspace!);res.end(JSON.stringify({schema_version:1,reports:reports.map(report=>({comparison_id:report.comparison_id,source_save_id:report.source_save_id,source_revision:report.source_revision,source_view_object_id:report.source_view_object_id,frame_object_id:report.frame_object_id,adopted:adoptedResults.some(raw=>(raw as Metadata).comparison_id===report.comparison_id&&(raw as Metadata).report_sha256===createHash('sha256').update(JSON.stringify(report)).digest('hex'))}))}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/comparison'){
    if([...url.searchParams.keys()].some(key=>key!=='comparison_id')||url.searchParams.getAll('comparison_id').length!==1)fail('One explicit comparison_id required');const module=await comparisonReports();res.end(JSON.stringify(module.readRoiComparisonReport(workspace!,url.searchParams.get('comparison_id')!)));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/roi-handoff'){
    const keys=['expected_object_id','state_revision','draft_revision','collection_revision'];
    if([...url.searchParams.keys()].some(key=>!keys.includes(key))||keys.some(key=>url.searchParams.getAll(key).length!==1))fail('Exact current ROI-handoff identity and revisions required');
    const snapshot=state(),revision=(key:string)=>{const value=url.searchParams.get(key);if(!/^\d{1,16}$/.test(value??'')||!Number.isSafeInteger(Number(value)))fail('Invalid ROI-handoff revision');return Number(value);};
    if(url.searchParams.get('expected_object_id')!==snapshot.object.object_id||revision('state_revision')!==snapshot.state_revision||revision('draft_revision')!==snapshot.edit_state.draft_revision||revision('collection_revision')!==snapshot.window_collection!.revision)fail('Stale ROI-handoff inspection; read the current state again',409);
    const packet=await inspectRoiHandoff(snapshot),body=JSON.stringify(packet);if(Buffer.byteLength(body)>8*1024*1024)fail('ROI-handoff packet exceeds its bounded metadata budget',409);res.end(body);return;
   }
   if(req.method==='GET'&&url.pathname==='/api/window-asset'){
    if([...url.searchParams.keys()].some(key=>!['window_id','revision'].includes(key))||url.searchParams.getAll('window_id').length!==1||url.searchParams.getAll('revision').length!==1||!/^\d{1,16}$/.test(url.searchParams.get('revision')??''))fail('Explicit saved window identity and collection revision required');
    const revision=Number(url.searchParams.get('revision')),entry=windowStore.lookup(url.searchParams.get('window_id'),revision),saved=await readWindowSaved(entry.object_id,{includeFrameAncestry:true,includeCleanRender:true});
    // Immutable reads can overlap a new adoption or layout publication. Never
    // bind the completed bitmap to a newer object/window collection by recency.
    const latest=windowStore.lookup(entry.window_id,revision);
    if(latest.object_id!==entry.object_id||saved.frame?.frame_object_id!==windowStore.snapshot().frame_object_id||!windowStore.assetMatches(entry.window_id,saved.object,saved.frame))fail('Saved window asset changed while reading; inspect the current collection',409);
    res.end(JSON.stringify({schema_version:1,collection_revision:revision,window_id:entry.window_id,object_id:entry.object_id,object:publicImageObject(saved.object),panel_mapping_fingerprint:panelWindowMappingFingerprint(saved.object),png_base64:saved.png,...(saved.cleanRender?{clean_render:saved.cleanRender}:{})}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/statistics-history'){
    if([...url.searchParams.keys()].some(key=>key!=='object_id')||url.searchParams.getAll('object_id').length!==1||url.searchParams.get('object_id')!==current.object_id)fail('Statistics history requires the exact current object',409);
    res.end(JSON.stringify(readImageStatisticsHistory({workspace:workspace!,objectId:current.object_id as string})));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/measurements'){
    if([...url.searchParams.keys()].some(key=>key!=='object_id')||url.searchParams.get('object_id')!==current.object_id)fail('Measurement inspection requires the exact current object',409);
    const inspected=current.object_id,revision=stateRevision;
    const records=readImageMeasurements({workspace,objectId:inspected as string});
    res.end(JSON.stringify({...records,object_id:inspected,state_revision:revision}));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/revision'){jointOwner?.query();res.end(JSON.stringify({joint_research:jointOwner?.snapshot(),state_revision:stateRevision,object_id:current.object_id,pending_result:pendingResult?{object_id:pendingResult.prepared.object.object_id,request_id:pendingResult.request_id}:null,edit_state:{draft_revision:editState.draft_revision,dirty:editState.dirty,gesture_active:editState.gesture_active}}));return;}
   if(req.method==='GET'&&url.pathname==='/api/present'){res.end(JSON.stringify(presentationReceipt(url.searchParams.get('request_id'))));return;}
   if(req.method==='GET'&&url.pathname==='/api/evidence'){res.end(JSON.stringify(evidenceReceipt(url.searchParams.get('request_id'))));return;}
   if(req.method!=='POST'||!(['/api/public-research','/api/action','/api/present','/api/evidence','/api/probe','/api/composition/resolve','/api/workspace'] as readonly unknown[]).includes(url.pathname))fail('Not found',404);if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))fail('Same-origin JSON required',403);
   if(url.pathname==='/api/evidence'){const supplied=req.headers['x-panel-evidence-key'];if(typeof supplied!=='string'||supplied.length!==evidenceToken.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(evidenceToken)))fail('Parent-only admitted evidence capability required',403);}
   const requestLimit=url.pathname==='/api/evidence'?4*1024*1024:url.pathname==='/api/composition/resolve'?512*1024:64*1024;
   let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>requestLimit)fail('Request exceeds bounded JSON limit',413);raw+=chunk;}let decodedBody:unknown;try{decodedBody=JSON.parse(raw);}catch{fail('Invalid JSON');}const body=decodedBody as Metadata;
   if(url.pathname==='/api/public-research'){
    jointOwner?.assertMutable();if(!publicResearch)fail('仅专用公开合成样例可连接 Codex；普通图像入口未启用。',403);
    fields(body,['action','id','question','approved','context_sha256']);
    if(body.action==='interrupt'){fields(body,['action']);res.end(JSON.stringify(await publicResearch.interrupt()));return;}
    if(body.action!=='question')fail('Unknown public research action');const {action,...question}=body;
    try{res.end(JSON.stringify(publicResearch.submit(question)));}catch(error){if(!(error instanceof PublicResearchRefused))throw error;res.end(JSON.stringify({...publicResearch.snapshot(),public_research_refusal:error.receipt()}));}return;
   }
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
   const run=busy.then(()=>url.pathname==='/api/workspace'?workspaceAction(body):url.pathname==='/api/present'?present(body):url.pathname==='/api/evidence'?presentEvidence(body):panelActionScope.run(body,()=>act(body)));busy=run.catch(()=>{});res.end(JSON.stringify(await run));
  }catch(caught){const error=caught as Error&{status?:number};res.statusCode=error.status??400;res.setHeader('Content-Type','application/json');const preflight=panelPreflightErrors.get(error);res.end(JSON.stringify({error:error.message,...(preflight?{panel_preflight:preflight}:{}),...(()=>{const admission=readImageAdmissionFailure(error);return admission?{admission_failure:admission}:{};})()}));}
 });
 try{if(checkpoint){
  if(!sameRecord(checkpoint.frame_identity??null,frameIdentity))fail('Saved owned checkpoint frame no longer matches the admitted object');
  const saved=checkpoint.edit_state as Metadata;fields(saved,['draft_revision','dirty','gesture_active','selection','annotation_edit','base_object_id']);
  if(typeof saved.dirty!=='boolean'||typeof saved.gesture_active!=='boolean'||saved.annotation_edit!==null&&(!saved.annotation_edit||typeof saved.annotation_edit!=='object'||Array.isArray(saved.annotation_edit)))fail('Invalid saved owned draft state');
  selection=checkpoint.selection==null?null:checkSelection(checkpoint.selection);
  editState={draft_revision:(saved.draft_revision as number)+1,dirty:saved.dirty,gesture_active:false,selection:saved.selection==null?null:checkSelection(saved.selection),annotation_edit:structuredClone(saved.annotation_edit) as Metadata|null,base_object_id:saved.base_object_id};
  if(!Number.isSafeInteger(editState.draft_revision))fail('Owned draft revision exhausted');
  stateRevision=(checkpoint.state_revision as number)+1;lastOperation=checkpoint.last_operation&&typeof checkpoint.last_operation==='object'?structuredClone(checkpoint.last_operation) as Metadata:null;
  for(const key of ['window_drafts','working_selections'])if(checkpoint[key]!==undefined&&(!checkpoint[key]||typeof checkpoint[key]!=='object'||Array.isArray(checkpoint[key])))fail('Invalid owned working metadata map');
  if(checkpoint.adopted_results!==undefined&&!Array.isArray(checkpoint.adopted_results))fail('Invalid owned adopted-result references');
  workspaceDrafts=structuredClone(checkpoint.window_drafts??{}) as Metadata;workingSelections=structuredClone(checkpoint.working_selections??{}) as Metadata;adoptedResults=structuredClone(checkpoint.adopted_results??[]) as unknown[];researchQuestion=readResearchQuestion(checkpoint.research_question);researchLeads=readResearchLeads(checkpoint.research_leads);
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
  if(checkpoint.window_collection!==undefined)await windowStore.restore(checkpoint.window_collection,current,frameIdentity,readWindowSaved,checkSelection);
  if(checkpoint.pending_result){const pending=checkpoint.pending_result as Metadata;fields(pending,['object_id','request_id','spatial_return_reference','reason','input_view_context','view_context_restore','navigation_lease']);if(!objectId.test(String(pending.object_id))||!safeId.test(String(pending.request_id))||pending.reason!==undefined&&!['window_capacity','unsaved_draft'].includes(String(pending.reason)))fail('Invalid saved pending result');const reply=await journalCall('image_info',{object_id:pending.object_id});if(!reply.png)fail('Saved pending view is not a saved PNG; no render was recomputed');pendingResult={prepared:await prepareCurrent(reply),frameIdentity:await findFrameIdentity(reply.data),request_id:pending.request_id,...(pending.reason?{reason:pending.reason as 'window_capacity'|'unsaved_draft'}:{})};
   if(Object.hasOwn(pending,'spatial_return_reference')){pendingResult.spatialReturnReference=null;try{if(pending.spatial_return_reference!==null){pendingResult.spatialReturnReference=readSpatialReturnReference(pending.spatial_return_reference);await qualifySpatialReturn(pendingResult.spatialReturnReference);pendingResult.spatialReturnReason='';}}catch(error){pendingResult.spatialReturnReason=returnFailure(error);}}
   if(pending.input_view_context!==undefined&&pendingResult.spatialReturnReference){try{const input=await readWindowSaved(pendingResult.spatialReturnReference.view_object_id),context=qualifyPanelWindowContext(pending.input_view_context,input.object,checkSelection);if(context?.selection_candidate&&sameRecord(selectionRectangle(context.selection_candidate as unknown as Selection),pendingResult.spatialReturnReference.source_rect_xyxy))pendingResult.inputViewContext=context;}catch{/* Keep the saved pending image; its unknown input context stays absent. */}}
   if(pending.navigation_lease===true){pendingResult.navigationLease=true;pendingResult.viewContextRestore=qualifyPanelWindowContext(pending.view_context_restore,pendingResult.prepared.object,checkSelection);}
  }
 }}catch(error){await client.close();throw error;}
 try{
  if(explicitRestore)await restoreAnalysisSnapshot(explicitRestore,{allowDeferredNull:Boolean(legacyNullSource)});if(inheritedOperation)lastOperation=structuredClone(inheritedOperation);
  analysisOwner=acquireAnalysisWorkspaceOwner(workspace!,{role:'gui',owner_id:helper_session_id??session});
  analysis=new AnalysisWorkspace(workspace!,checkpointSnapshot(),analysisOwner,{legacy:analysis_legacy});
  if(checkpoint&&!explicitRestore)analysis.resumeQualifiedWorkingCheckpoint(checkpoint);
  jointOwner=new JointResearchOwner({workspace:workspace!,python:python!,getState:()=>{analysisOwner!.assertOwned();return state();}});
  const publicRun=process.env.MWB_PUBLIC_RESEARCH_RUN;
  if(publicRun&&path.resolve(workspace!)===path.join(path.resolve(publicRun),'workspace'))publicResearch=new DesktopPublicResearch(publicRun,workspace!,python!,String(frameIdentity?.frame_object_id),String(current.object_id));
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});saveSelection();
 }catch(caught){
  if(selectionTimer!==null){clearTimeout(selectionTimer);selectionTimer=null;}const cleanupErrors:unknown[]=[];
  try{if(server.listening)await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeIdleConnections?.();});}catch(error){cleanupErrors.push(error);}
  try{await jointOwner?.close();await publicResearch?.close();await client.close();}catch(error){cleanupErrors.push(error);}try{analysisOwner?.release();}catch(error){cleanupErrors.push(error);}
  if(cleanupErrors.length)throw new AggregateError([caught,...cleanupErrors],'Panel initialization failed; resource cleanup also failed');throw caught;
 }
 const jointCommand=async(action:'begin'|'query'|'cancel'|'record-review'|'send-public'|'interrupt',value:Metadata={})=>{if(!jointOwner)fail('Owner not ready',409);if(action==='query')return jointOwner.query();if(action==='interrupt')return jointOwner.interrupt();const run=busy.then(()=>{if(action==='begin'){if(publicResearch?.snapshot().active)fail('Existing public turn remains active',409);return jointOwner!.begin(value.expected_working_revision as number);}if(action==='cancel')return jointOwner!.cancel(value.review_id as string|undefined);if(action==='send-public')return jointOwner!.sendPublic(String(value.review_id),String(value.context_sha256));return jointOwner!.recordNativeReview(String(value.review_id),String(value.context_sha256));});busy=run.catch(()=>{});return run;};
 return {jointCommand,server,client,url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/#${token}`,token,evidenceToken,journal,state,async close({abnormal=true}:{abnormal?:boolean}={}){try{await new Promise<void>(resolve=>{server.close(resolve as (error?:Error)=>void);server.closeIdleConnections?.();});if(!analysisCloseConfirmed)saveSelection();if(!abnormal&&!analysisCloseConfirmed){analysis?.close(unresolvedRequest());analysisCloseConfirmed=true;}}finally{if(selectionTimer!==null){clearTimeout(selectionTimer);selectionTimer=null;}await jointOwner?.close();await publicResearch?.close();await client.close();analysisOwner?.release();}}};
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
