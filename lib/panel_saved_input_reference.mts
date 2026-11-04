// A qualified bridge into the existing spatial-return mechanism. This module
// reads original input records only; it owns no navigation, editor or science.
import {readPanelExecutionInput,verifyPanelExecutionInput} from './panel_execution_inputs.mjs';
import {readRoiComparisonReport} from './roi_comparison_reports.mjs';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import type {SpatialReturnReference} from './panel_spatial_return.mjs';
import {createHash} from 'node:crypto';
import {readSourceProofReferences} from './image_source_proofs.mjs';
import type {SourceProofReference} from './image_source_proofs.mjs';

type Row=Record<string,unknown>;
export type PanelSavedInputReference={kind:'execution';request_id:string}|{kind:'comparison';comparison_id:string;annotation_id:string};
export interface QualifiedPanelSavedInput {
 source_view_object_id:string;frame_object_id:string;raw_fft_object_id:string;
 processing_rect_xyxy:number[];float_roi_xyxy:number[];annotation_id:string|null;
 calibration_snapshot:unknown;requested_annotation_id?:string;
 spatial_return_reference:SpatialReturnReference;
}
const id=/^[A-Za-z0-9_-]{1,64}$/,objectId=/^[a-f0-9]{32}$/;
const isRow=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const canonical=(v:unknown):string=>JSON.stringify(v,(_key,value)=>isRow(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const same=(a:unknown,b:unknown)=>canonical(a??null)===canonical(b??null);
function invalid(message:string):never{throw Object.assign(new Error('Saved input reference: '+message),{code:'INVALID_INPUT_REFERENCE',status:400});}
function unavailable(message:string):never{throw Object.assign(new Error('Saved input reference: '+message),{code:'INPUT_REFERENCE_UNAVAILABLE',status:409});}
export function parsePanelSavedInputReference(value:unknown):PanelSavedInputReference {
 if(!isRow(value))invalid('an explicit execution or comparison reference is required');
 if(value.kind==='execution'){
  if(Object.keys(value).some(key=>!['kind','request_id'].includes(key))||typeof value.request_id!=='string'||!id.test(value.request_id))invalid('execution requires only its original request_id');
  return {kind:'execution',request_id:value.request_id};
 }
 if(value.kind==='comparison'){
  if(Object.keys(value).some(key=>!['kind','comparison_id','annotation_id'].includes(key))||typeof value.comparison_id!=='string'||!id.test(value.comparison_id)||typeof value.annotation_id!=='string'||!id.test(value.annotation_id))invalid('comparison requires only its report and stable ROI identities');
  return {kind:'comparison',comparison_id:value.comparison_id,annotation_id:value.annotation_id};
 }
 return invalid('unknown reference kind');
}
export function resolvePanelSavedInputReference(workspace:string,targetObjectId:string,value:unknown):QualifiedPanelSavedInput {
 const reference=parsePanelSavedInputReference(value);if(!objectId.test(targetObjectId))invalid('an exact raw FFT object identity is required');
 let input:Row,rawFft:string,requestedAnnotation:string|undefined,sourceProofRefs:SourceProofReference[]=[];
 if(reference.kind==='execution'){
  const execution=readPanelExecutionInput(workspace,reference.request_id);
  if(execution.qualification!=='validated'||execution.status!=='completed'||!execution.input_snapshot||!execution.fft_object_id)unavailable('original execution is not a qualified completed FFT');
  input=execution.input_snapshot;rawFft=execution.fft_object_id;
  sourceProofRefs=execution.source_proof_refs??[];
 }else{
  const report=readRoiComparisonReport(workspace,reference.comparison_id),matches=report.rows.filter(row=>row.annotation_id===reference.annotation_id);
  sourceProofRefs=readSourceProofReferences(report.source_proof_refs);
  if(matches.length!==1)unavailable('the exact ROI is absent or ambiguous in the comparison');
  const fft=matches[0]!.fft;if(!isRow(fft)||fft.input_snapshot_verified!==true||!isRow(fft.input_association)||!objectId.test(String(fft.object_id)))unavailable('comparison has no verified original floating input');
  const proof=fft.input_association;rawFft=String(fft.object_id);requestedAnnotation=reference.annotation_id;
  if(proof.kind==='gui_panel_execution_input_v1'){
   if(typeof proof.input_relative_path!=='string'||typeof proof.input_sha256!=='string')unavailable('original GUI execution proof is incomplete');
   const execution=verifyPanelExecutionInput(workspace,proof.input_relative_path,proof.input_sha256);
   if(execution.qualification!=='validated'||execution.status!=='completed'||execution.fft_object_id!==rawFft||!execution.input_snapshot)unavailable('original GUI FFT input is no longer qualified');
   input=execution.input_snapshot;sourceProofRefs=execution.source_proof_refs??[];
  }else if((proof.kind==='cli_request_v1'||proof.kind==='gui_savepoint_v1')&&isRow(proof.input_snapshot))input=proof.input_snapshot;
  else return unavailable('unknown or legacy comparison input proof');
 }
 if(rawFft!==targetObjectId)unavailable('reference belongs to a different raw FFT');
 if(!objectId.test(String(input.source_view_object_id))||!objectId.test(String(input.frame_object_id))||input.annotation_id!==null&&(typeof input.annotation_id!=='string'||!id.test(input.annotation_id))||!Array.isArray(input.float_roi_xyxy)||input.float_roi_xyxy.length!==4||input.float_roi_xyxy.some(v=>typeof v!=='number'||!Number.isFinite(v))||!Array.isArray(input.processing_rect_xyxy)||input.processing_rect_xyxy.length!==4||input.processing_rect_xyxy.some(v=>!Number.isSafeInteger(v)))unavailable('original input identities or coordinates are incomplete');
 const reader=readImageProviderRecords(workspace,{source_proof_refs:sourceProofRefs}),source=reader.object(input.source_view_object_id),frame=reader.object(input.frame_object_id),fft=reader.object(rawFft),sourceLineage=reader.lineage(source.value.object_id),fftLineage=reader.lineage(rawFft),calibration=reader.operand(source.value.object_id).record;
 if(frame.value.kind!=='frame'||fft.value.kind!=='fft'||sourceLineage.frames.length!==1||sourceLineage.frames[0]!.object_id!==frame.value.object_id||fftLineage.frames.length!==1||fftLineage.frames[0]!.object_id!==frame.value.object_id||!same(fft.value.source_rect_xyxy,input.processing_rect_xyxy)||!same(fft.value.xy_calibration??null,calibration))unavailable('provider source, FFT support or original calibration differs');
 if(input.source_view_manifest_sha256!==source.manifest_sha256||input.frame_manifest_sha256!==frame.manifest_sha256||!isRow(frame.value.files_sha256)||input.frame_array_sha256!==frame.value.files_sha256['data.npy']||input.calibration_sha256!==createHash('sha256').update(canonical(calibration??null)).digest('hex')||Object.hasOwn(input,'calibration_snapshot')&&!same(input.calibration_snapshot,calibration))unavailable('original source/frame/calibration hash changed during readback');
 // The referenced reader already checks the float-to-integer association and
 // producer binding. Recheck arrays without deriving floats from integer bins.
 reader.verifyArray(frame.value.object_id);reader.verifyArray(rawFft);
 reader.verifyProofContext();
 return {source_view_object_id:String(input.source_view_object_id),frame_object_id:String(input.frame_object_id),raw_fft_object_id:rawFft,processing_rect_xyxy:structuredClone(input.processing_rect_xyxy) as number[],float_roi_xyxy:structuredClone(input.float_roi_xyxy) as number[],annotation_id:input.annotation_id as string|null,calibration_snapshot:structuredClone(calibration??null),...(requestedAnnotation?{requested_annotation_id:requestedAnnotation}:{}),spatial_return_reference:{version:1,view_object_id:String(input.source_view_object_id),frame_object_id:String(input.frame_object_id),fft_object_id:rawFft,source_rect_xyxy:structuredClone(input.processing_rect_xyxy) as number[]}};
}
