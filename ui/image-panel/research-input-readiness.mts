// Pure inspection of already available metadata. No file, image, host, approval
// or transport capability belongs here. Even metadata_ready is not permission.
import {readResearchQuestion} from './research-question.mjs';

export interface LocalVisualInputState {
 readonly view_id:string;readonly state_revision:number;readonly draft_revision:number;
 // The caller must include unpublished inputs and outstanding UI operations.
 readonly settled:boolean;
}
export interface SavedVisualDisplayMetadata {readonly view_id:string;readonly png_sha256:string;}
export type VisualMetadataBlocker='metadata_input_invalid'|'snapshot_missing'|'view_missing'|'frame_missing'|'array_domain_conflict'|'display_reference_differs'|
 'unsupported_view'|'annotations_present_or_unknown'|'source_mapping_invalid'|
 'array_metadata_invalid'|'display_reference_missing'|'question_missing_or_invalid'|
 'question_source_differs'|'revisions_unknown'|'local_inputs_unsettled'|
 'local_snapshot_differs'|'draft_unsettled'|'draft_persistence_unsettled'|
 'selection_requires_saved_view'|'pending_result_or_unknown'|'operation_unresolved'|
 'source_recheck_pending'|'workspace_unsettled';
export interface VisualMetadataReadiness {
 readonly schema_version:1;readonly mode:'inspection_only';readonly read_only:true;
 readonly status:'metadata_ready'|'blocked';readonly blockers:readonly VisualMetadataBlocker[];
 readonly approved:false;readonly model_can_view:false;readonly owner_verified:false;
 readonly image_bytes_checked:false;readonly provider_records_checked:false;
 readonly requires_fresh_check:true;
 readonly view_id:string|null;readonly frame_id:string|null;
 readonly scope:'complete_saved_spatial_view';readonly coordinate_space:'source_pixels';
 readonly source_rect_xyxy:readonly number[]|null;readonly image_rect_xyxy:readonly number[]|null;
 readonly dtype:string|null;readonly shape_yx:readonly number[]|null;
 readonly declared_png_sha256:string|null;
 readonly question_binding:{readonly status:'exact_view'|'different_source'|'missing_or_invalid';readonly view_id:string|null;readonly frame_id:string|null};
 readonly revisions:{readonly state:number|null;readonly draft:number|null;readonly collection:number|null;readonly working:number|null};
}
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const revision=(v:unknown):number|null=>Number.isSafeInteger(v)&&(v as number)>=0?v as number:null;
function numbers(v:unknown,length:number):number[]|null{
 if(!Array.isArray(v)||v.length!==length)return null;
 const result:number[]=[];for(let i=0;i<length;i++){const n:unknown=v[i];if(!Number.isSafeInteger(n)||(n as number)<0)return null;result[i]=n as number;}return result;
}
const rect=(v:unknown):number[]|null=>{const r=numbers(v,4);return r&&r[2]>r[0]&&r[3]>r[1]?r:null;};
const shape=(v:unknown):number[]|null=>{const r=numbers(v,2);return r&&r[0]>0&&r[1]>0&&r[0]*r[1]<=128*1024*1024?r:null;};
const dtype=(v:unknown):string|null=>typeof v==='string'&&/^(?:bool|u?int(?:8|16|32|64)|float(?:16|32|64)|[<>=|]?[uifb][1248])$/.test(v)?v:null;
function metadata(text:unknown,limit:number):{valid:boolean;value:unknown}{
 // Reject all objects, including Proxy/accessor wrappers, without inspecting
 // properties, descriptors, prototypes, iterators or coercion methods.
 if(typeof text!=='string'||text.length===0||text.length>limit)return {valid:false,value:undefined};
 try{return {valid:true,value:JSON.parse(text) as unknown};}catch{return {valid:false,value:undefined};}
}

// A local snapshot can be stale or caller-supplied. This function does not
// establish committed provenance, live owner identity, consent or PNG contents.
// Accept primitive JSON texts only. Never stringify an arbitrary caller object
// here: JSON.stringify itself can execute getters and toJSON callbacks.
export function inspectVisualReadiness(snapshotJson:unknown,localJson:unknown,savedDisplayJson?:unknown):VisualMetadataReadiness {
 const parsed=metadata(snapshotJson,64*1024),localParsed=metadata(localJson,4096),displayParsed=metadata(savedDisplayJson,1024);
 const snapshot=parsed.value,local=localParsed.value,display=row(displayParsed.value);
 const s=row(snapshot),view=row(s.object),frame=row(s.frame_identity),edit=row(s.edit_state),persistence=row(s.draft_persistence),collection=row(s.window_collection),analysis=row(s.workspace_analysis),ui=row(local);
 const blockers:VisualMetadataBlocker[]=[];const block=(code:VisualMetadataBlocker)=>{if(!blockers.includes(code))blockers.push(code);};
 if(!parsed.valid||!localParsed.valid||savedDisplayJson!==undefined&&!displayParsed.valid)block('metadata_input_invalid');
 const viewId=id(view.object_id)?view.object_id:null,frameId=id(frame.frame_object_id)?frame.frame_object_id:null;
 if(snapshot===null||typeof snapshot!=='object'||Array.isArray(snapshot))block('snapshot_missing');
 if(!viewId)block('view_missing');if(!frameId)block('frame_missing');
 const panels=Array.isArray(view.panels)?view.panels:[],panel=panels.length===1?row(panels[0]):{};
 if(view.kind!=='view'||panels.length!==1||panel.domain!=='spatial_pixels')block('unsupported_view');
 const spatialDomain=view.array_domain===undefined||view.array_domain==='spatial';if(!spatialDomain)block('array_domain_conflict');
 if(!(view.annotations===undefined||Array.isArray(view.annotations)&&view.annotations.length===0)||!(view.annotation_reprojection===undefined||view.annotation_reprojection===false))block('annotations_present_or_unknown');
 const source=spatialDomain&&panel.domain==='spatial_pixels'?rect(panel.source_rect_xyxy):null,image=rect(panel.image_rect_xyxy),dimensions=shape(view.shape_yx),scalar=dtype(view.dtype);
 if(!source||!image||!frameId||panel.source_object_id!==frameId)block('source_mapping_invalid');
 if(!dimensions||!scalar||!source||source[2]-source[0]!==dimensions[1]||source[3]-source[1]!==dimensions[0])block('array_metadata_invalid');
 // Public Panel object intentionally omits files_sha256. Require an explicit
 // saved-view metadata reference; clean_png_sha256 may refer to another render.
 const declared=display.png_sha256,referenceValid=id(display.view_id)&&Object.keys(display).sort().join() ==='png_sha256,view_id'&&typeof declared==='string'&&/^[a-f0-9]{64}$/.test(declared);
 if(referenceValid&&display.view_id!==viewId)block('display_reference_differs');
 const pngHash=referenceValid&&display.view_id===viewId?declared as string:null;
 if(!pngHash)block('display_reference_missing');
 let question;try{question=readResearchQuestion(s.research_question);}catch{/* Invalid metadata is a blocker, never a transport error. */}
 let binding:VisualMetadataReadiness['question_binding'];
 if(!question){block('question_missing_or_invalid');binding={status:'missing_or_invalid',view_id:null,frame_id:null};}
 else{const matches=question.context_object_id===viewId&&question.frame_object_id===frameId;if(!matches)block('question_source_differs');binding={status:matches?'exact_view':'different_source',view_id:question.context_object_id,frame_id:question.frame_object_id};}
 const revisions={state:revision(s.state_revision),draft:revision(edit.draft_revision),collection:revision(collection.revision),working:revision(analysis.working_revision)};
 if(Object.values(revisions).some(v=>v===null))block('revisions_unknown');
 if(ui.settled!==true)block('local_inputs_unsettled');
 if(!viewId||ui.view_id!==viewId||revisions.state===null||ui.state_revision!==revisions.state||revisions.draft===null||ui.draft_revision!==revisions.draft)block('local_snapshot_differs');
 if(edit.dirty!==false||edit.gesture_active!==false||edit.annotation_edit!==null)block('draft_unsettled');
 if(persistence.pending!==false||persistence.error!==null)block('draft_persistence_unsettled');
 if(s.selection!==null||edit.selection!==null)block('selection_requires_saved_view');
 if(s.pending_result!==null)block('pending_result_or_unknown');
 // Only an absent operation or an explicitly terminal observation can pass.
 const operation=row(s.last_operation);
 if(s.last_operation!==null&&(typeof operation.state!=='string'||!['completed','failed','interrupted','source_recheck_completed','source_recheck_failed'].includes(operation.state)))block('operation_unresolved');
 if(s.source_recheck!==undefined&&s.source_recheck!==null)block('source_recheck_pending');
 if(typeof analysis.status!=='string'||!['new','dirty','clean'].includes(analysis.status)||analysis.unresolved_request_id!==null||analysis.unresolved_save_id!==null||analysis.recovery_available!==false)block('workspace_unsettled');
 return {schema_version:1,mode:'inspection_only',read_only:true,status:blockers.length?'blocked':'metadata_ready',blockers,approved:false,model_can_view:false,owner_verified:false,image_bytes_checked:false,provider_records_checked:false,requires_fresh_check:true,view_id:viewId,frame_id:frameId,scope:'complete_saved_spatial_view',coordinate_space:'source_pixels',source_rect_xyxy:source,image_rect_xyxy:image,dtype:scalar,shape_yx:dimensions,declared_png_sha256:pngHash,question_binding:binding,revisions};
}
