// Resolve only an already-qualified object chain. The reader remains responsible
// for provider journals, payload/hash/PNG checks and workspace containment.
// This is one bounded read, with no index, cross-request cache or new identity.
import type {PanelFrameIdentity,PanelMetadata} from './image_panel_contracts.mjs';

export const PANEL_FRAME_ANCESTOR_READ_BUDGET=64;
export type PanelFrameResolutionStatus='found'|'ancestry_budget_exhausted'|'missing'|'corrupt'|'cycle'|'unsupported'|'source_without_frame'|'read_failed';
export interface PanelFrameResolution {
 status:PanelFrameResolutionStatus;frame:PanelFrameIdentity|null;terminal:PanelMetadata|null;
 records_checked:number;ancestor_reads:number;callback_reads:number;bundled:boolean;reason_code:string;
}
export type QualifiedFrameObjectReader=(object_id:string)=>Promise<PanelMetadata>;
const row=(value:unknown):value is PanelMetadata=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const integers=(value:unknown,length:number,minimum:number):value is number[]=>Array.isArray(value)&&value.length===length&&value.every(n=>Number.isSafeInteger(n)&&n>=minimum);
function scanMeanIdentity(value:PanelMetadata):PanelFrameIdentity|null {
 const roi=value.diffraction_roi,source=value.source_identity;
 if(!objectId(value.object_id)||value.frame_index!=null||value.source_object_id!=null||value.parent_object_id!=null||
    value.array_domain!=='reciprocal'||!row(roi)||roi.mean_object_id!==value.object_id||
    !row(source)||typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256)||roi.source_sha256!==source.sha256||
    !integers(roi.scan_shape_yx,2,1)||!integers(roi.detector_shape_yx,2,1)||!integers(roi.scan_roi_y0_y1_x0_x1_exclusive,4,0))return null;
 const axes=roi.layout==='scan4d'?['scan_y','scan_x','detector_y','detector_x']:
  roi.layout==='flat3d'?['scan_y*scan_width+scan_x','detector_y','detector_x']:null;
 const [y0,y1,x0,x1]=roi.scan_roi_y0_y1_x0_x1_exclusive as [number,number,number,number];
 const count=(y1-y0)*(x1-x0);
 if(!axes||!Array.isArray(roi.input_axes)||roi.input_axes.length!==axes.length||!axes.every((axis,i)=>axis===(roi.input_axes as unknown[])[i])||
    y0>=y1||x0>=x1||y1>roi.scan_shape_yx[0]!||x1>roi.scan_shape_yx[1]!||!Number.isSafeInteger(count)||roi.pattern_count!==count)return null;
 return {frame_object_id:value.object_id,frame_index:null,source_object_id:null,origin:'scan_roi_mean_diffraction'};
}
const needsParent=new Set(['view','annotate','fft','fft_view','calibration','context','measure','statistics','profile','export','peaks','centre','gpa','gpa_read','gpa_view','topology']);
function failedReadStatus(error:unknown):PanelFrameResolutionStatus {
 if(!row(error))return 'read_failed';
 if(error.status===404||error.code==='OBJECT_NOT_FOUND'||error.code==='MISSING_OBJECT'||error.code==='NOT_FOUND')return 'missing';
 if(error.code==='CORRUPT_OBJECT'||error.code==='CORRUPT_PAYLOAD'||error.code==='INVALID_OBJECT')return 'corrupt';
 return 'read_failed';
}

/** `ancestry` must be the projection accepted by readImageFrameAncestry.
 * Its records have already undergone the same provider reads as the callback.
 * ancestor_reads counts those qualified chain steps; callback_reads reports the
 * extra callbacks in this resolver (zero for the bundled path).
 */
export async function resolvePanelFrame(root:PanelMetadata,readObject:QualifiedFrameObjectReader,ancestry:readonly PanelMetadata[]|null=null):Promise<PanelFrameResolution> {
 let value:PanelMetadata=root,checked=0,reads=0,callbacks=0;const visited=new Set<string>();
 const result=(status:PanelFrameResolutionStatus,reason_code:string,frame:PanelFrameIdentity|null=null):PanelFrameResolution=>({status,frame,terminal:row(value)?value:null,records_checked:checked,ancestor_reads:reads,callback_reads:callbacks,bundled:ancestry!==null,reason_code});
 if(ancestry!==null&&(!ancestry.length||ancestry.length>PANEL_FRAME_ANCESTOR_READ_BUDGET+1||ancestry[0]?.object_id!==root.object_id))return result('corrupt','invalid_ancestry_bundle');
 for(;;){
  checked++;
  if(!row(value)||!objectId(value.object_id))return result('corrupt','invalid_object_identity');
  // A supplied state/backend can never contradict the provider qualification.
  // Legacy controlled clients may omit these fields; the qualified reader is
  // still authoritative, exactly as on the original ordinary-read path.
  if(value.backend!==undefined&&value.backend!=='external-image-workspace'||value.state!==undefined&&value.state!=='completed')return result('corrupt','unqualified_object_state');
  if(value.kind==='frame'){
   if(value.origin==='scan_roi_mean_diffraction'){
    const frame=scanMeanIdentity(value);
    return frame?result('found','scan_roi_mean_found',frame):result('corrupt','invalid_scan_roi_mean');
   }
   if(value.frame_index===undefined||value.frame_index===null)return result('unsupported','frame_index_unavailable');
   if(!Number.isInteger(value.frame_index)||Number(value.frame_index)<0)return result('corrupt','invalid_frame_index');
   return result('found','frame_found',{
    frame_object_id:value.object_id,frame_index:value.frame_index as number,source_object_id:value.source_object_id,
    ...(Number.isInteger(value.dm_dataset_index)?{dataset_index:value.dm_dataset_index as number}:{}),
    ...(value.dm_plane_selection?{plane_selection:value.dm_plane_selection}:{})
   });
  }
  if(value.kind==='tiff_source'||value.kind==='dm_source')return result('source_without_frame','source_has_no_selected_frame');
  if(value.kind==='compare')return result('unsupported','composite_has_no_single_frame');
  if(visited.has(value.object_id))return result('cycle','ancestry_cycle');
  if(typeof value.kind!=='string'||!value.kind)return result('unsupported','object_kind_unavailable');
  visited.add(value.object_id);
  // Nullish precedence is part of the existing lineage contract. A malformed
  // parent must not be bypassed using a valid base/source/render-base link.
  const next=value.parent_object_id??value.base_object_id??value.source_object_id;
  if(next===undefined||next===null)return result(needsParent.has(value.kind)?'missing':'unsupported',needsParent.has(value.kind)?'ancestor_link_missing':'unsupported_terminal_kind');
  if(!objectId(next))return result('corrupt','invalid_ancestor_link');
  // Evaluate every object already read, including the 65th terminal frame,
  // before refusing a 65th ancestor read. The I/O budget has not increased.
  if(reads===PANEL_FRAME_ANCESTOR_READ_BUDGET)return result('ancestry_budget_exhausted','ancestor_read_budget_exhausted');
  reads++;
  if(ancestry!==null){
   const qualified=ancestry[reads];
   if(!row(qualified)||qualified.object_id!==next)return result('corrupt','ancestry_bundle_identity_mismatch');
   value=qualified;
  }else{
   callbacks++;
   let qualified:PanelMetadata;
   try{qualified=await readObject(next);}catch(error){
    const diagnostic=result(failedReadStatus(error),'ancestor_read_failed');
    // Do not replace a provider error, status, message, cause or unknown outcome.
    // Frozen/primitive exceptions also propagate unchanged rather than being
    // hidden by a diagnostic-assignment failure.
    if(row(error))try{Object.assign(error,{frame_resolution:diagnostic});}catch{/* Preserve the original error. */}
    throw error;
   }
   if(!row(qualified)||qualified.object_id!==next)return result('corrupt','ancestor_identity_mismatch');
   value=qualified;
  }
 }
}
