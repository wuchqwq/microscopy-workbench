// A qualified bridge into the existing spatial-return mechanism. This module
// reads original input records only; it owns no navigation, editor or science.
import {readPanelExecutionInput,verifyPanelExecutionInput} from './panel_execution_inputs.mjs';
import {readRoiComparisonReport} from './roi_comparison_reports.mjs';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import type {SpatialReturnReference} from './panel_spatial_return.mjs';
import {createHash} from 'node:crypto';
import {readSourceProofReferences} from './image_source_proofs.mjs';
import type {SourceProofReference} from './image_source_proofs.mjs';
import {selectionRectangle} from '../ui/image-panel/coordinates.mjs';
import type {Selection} from '../ui/image-panel/coordinates.mjs';

type Row=Record<string,unknown>;
export type PanelSavedInputReference={kind:'execution';request_id:string}|{kind:'comparison';comparison_id:string;annotation_id:string}|{kind:'provider_fft';request_id:string;source_view_object_id:string;annotation_id:string};
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
 if(value.kind==='provider_fft'){
  if(Object.keys(value).some(key=>!['kind','request_id','source_view_object_id','annotation_id'].includes(key))||typeof value.request_id!=='string'||!id.test(value.request_id)||typeof value.source_view_object_id!=='string'||!objectId.test(value.source_view_object_id)||typeof value.annotation_id!=='string'||!id.test(value.annotation_id))invalid('provider FFT requires its original request, explicit saved view and ROI identities');
  return {kind:'provider_fft',request_id:value.request_id,source_view_object_id:value.source_view_object_id,annotation_id:value.annotation_id};
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
 }else if(reference.kind==='provider_fft'){
  // An explicit post-result association, never a search by recency or geometry.
  // The saved ROI must predate the FFT and reproduce its actual provider input.
  const reader=readImageProviderRecords(workspace),fft=reader.object(targetObjectId),source=reader.object(reference.source_view_object_id),panels=source.value.panels;
  if(fft.value.kind!=='fft'||fft.value.request_id!==reference.request_id||fft.parameters.action!=='fft')unavailable('original provider request is not this completed FFT');
  if(source.value.array_domain==='frequency'||source.value.array_domain==='reciprocal'||!Array.isArray(panels)||panels.length!==1||!isRow(panels[0])||panels[0].domain!=='spatial_pixels'||!objectId.test(String(panels[0].source_object_id)))unavailable('explicit source is not one saved spatial view');
  const frame=reader.object(panels[0].source_object_id),marks=Array.isArray(source.value.annotations)?source.value.annotations.filter(mark=>isRow(mark)&&mark.annotation_id===reference.annotation_id):[];
  if(marks.length!==1||!isRow(marks[0])||marks[0].kind!=='rectangle'||marks[0].status==='retracted'||!isRow(marks[0].anchor))unavailable('explicit saved ROI is absent, retracted or ambiguous');
  const anchor=marks[0].anchor,coordinates=anchor.coordinates;
  if(anchor.coordinate_space!=='source_pixels'||anchor.source_object_id!==frame.value.object_id||!Array.isArray(coordinates)||coordinates.length!==4||coordinates.some(v=>typeof v!=='number'||!Number.isFinite(v))||coordinates[0]>=coordinates[2]||coordinates[1]>=coordinates[3])unavailable('saved ROI has no exact source-pixel anchor');
  const bounds=panels[0].source_rect_xyxy;
  if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(v=>!Number.isSafeInteger(v))||coordinates[0]<bounds[0]||coordinates[1]<bounds[1]||coordinates[2]>bounds[2]||coordinates[3]>bounds[3])unavailable('saved ROI lies outside its source view');
  const rect=selectionRectangle({kind:'rectangle',coordinate_space:'source_pixels',source_object_id:frame.value.object_id,coordinates,panel:panels[0]} as unknown as Selection),operand=reader.operand(fft.parameters.object_id),shape=frame.value.shape_yx;
  const originalViewTime=Date.parse(String(source.value.created_utc)),fftTime=Date.parse(String(fft.value.created_utc));
  if(!Number.isFinite(originalViewTime)||!Number.isFinite(fftTime)||originalViewTime>fftTime)unavailable('saved ROI view must exist before the original FFT');
  if(frame.value.kind!=='frame'||['frequency','reciprocal'].includes(String(frame.value.array_domain))||['frequency','reciprocal'].includes(String(operand.value.array_domain))||!Array.isArray(shape)||shape.length!==2||!isRow(frame.value.files_sha256)||operand.grid?.source_grid_object_id!==frame.value.object_id||!same(operand.grid?.source_rect_xyxy,[0,0,shape[1],shape[0]])||operand.grid?.array_sha256!==frame.value.files_sha256['data.npy']||!same(fft.parameters.rect??[0,0,shape[1],shape[0]],rect)||!same(fft.value.source_rect_xyxy,rect)||fft.value.source_object_id!==operand.value.object_id||fft.value.parent_object_id!==fft.parameters.object_id||fft.value.window!==(fft.parameters.window??'none')||fft.value.subtract_mean!==(fft.parameters.subtract_mean??false))unavailable('provider operand, actual ROI or preprocessing differs from the explicit saved input');
  reader.verifyArray(operand.value.object_id);
  input={source_view_object_id:source.value.object_id,frame_object_id:frame.value.object_id,annotation_id:reference.annotation_id,float_roi_xyxy:[...coordinates],processing_rect_xyxy:rect,source_view_manifest_sha256:source.manifest_sha256,frame_manifest_sha256:frame.manifest_sha256,frame_array_sha256:frame.value.files_sha256['data.npy'],calibration_snapshot:operand.record,calibration_sha256:createHash('sha256').update(canonical(operand.record??null)).digest('hex')};rawFft=targetObjectId;
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
