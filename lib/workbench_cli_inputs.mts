// Independently checkable input associations. No report certifies its own input.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,isRow,same} from './workbench_cli_records.mjs';
import type {CliObjectReader,Row,SavedRoi,VerifiedObject} from './workbench_cli_records.mjs';
import {verifyPanelExecutionInput} from './panel_execution_inputs.mjs';
import {outwardSourceRectangle} from '../ui/image-panel/coordinates.mjs';

export interface FrozenFftInput extends Row {
 schema_version:1;annotation_id:string;source_view_object_id:string;source_view_manifest_sha256:string;
 frame_object_id:string;frame_manifest_sha256:string;frame_array_sha256:string;float_roi_xyxy:number[];
 processing_rect_xyxy:number[];recipe:{window:'none'|'hann';subtract_mean:boolean};calibration_sha256:string;
}
export type FftInputAssociation={kind:'cli_request_v1';comparison_id:string;row_index:number;input_snapshot:FrozenFftInput}|{kind:'gui_savepoint_v1';save_id:string;savepoint_manifest_sha256:string;window_id:string;input_snapshot:FrozenFftInput}|{kind:'gui_panel_execution_input_v1';input_relative_path:string;input_sha256:string};
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const fail=(message:string):never=>{throw new Error('FFT input association: '+message);};
function need(ok:unknown,message:string):asserts ok{if(!ok)fail(message);}
const id=/^[A-Za-z0-9_-]{1,64}$/;
export function frozenFftInput(reader:CliObjectReader,roi:SavedRoi,recipe:{window:'none'|'hann';subtract_mean:boolean}):FrozenFftInput {
 need(same(outwardSourceRectangle(roi.float_roi_xyxy),roi.processing_rect_xyxy),'ROI support differs from the shared source-edge conversion');
 const view=reader.object(roi.source_view_object_id),frame=reader.frame(roi.source_view_object_id);need(isRow(frame.value.files_sha256)&&typeof frame.value.files_sha256['data.npy']==='string','source array hash is absent');
 return {schema_version:1,annotation_id:roi.annotation_id,source_view_object_id:roi.source_view_object_id,source_view_manifest_sha256:view.manifest_sha256,frame_object_id:roi.frame_object_id,frame_manifest_sha256:frame.manifest_sha256,frame_array_sha256:frame.value.files_sha256['data.npy'],float_roi_xyxy:roi.float_roi_xyxy,processing_rect_xyxy:roi.processing_rect_xyxy,recipe,calibration_sha256:digest(view.value.xy_calibration??null)};
}
export function fftRequestSuffix(comparisonId:string,rowIndex:number,input:FrozenFftInput):string{return digest({comparison_id:comparisonId,row_index:rowIndex,input_snapshot:input}).slice(0,32);}
function validateFrozen(reader:CliObjectReader,raw:unknown,roi:SavedRoi,recipe:{window:'none'|'hann';subtract_mean:boolean}):FrozenFftInput {
 need(isRow(raw)&&raw.schema_version===1&&raw.annotation_id===roi.annotation_id&&raw.frame_object_id===roi.frame_object_id&&same(raw.float_roi_xyxy,roi.float_roi_xyxy)&&same(raw.processing_rect_xyxy,roi.processing_rect_xyxy)&&same(raw.recipe,recipe),'frozen ROI/recipe differs');
 need(same(outwardSourceRectangle(roi.float_roi_xyxy),roi.processing_rect_xyxy),'frozen support differs from shared source-edge conversion');
 const input=raw as FrozenFftInput,view=reader.object(input.source_view_object_id),frame=reader.frame(view.value.object_id),current=reader.object(roi.source_view_object_id).value;
 need(view.manifest_sha256===input.source_view_manifest_sha256&&frame.manifest_sha256===input.frame_manifest_sha256&&frame.value.object_id===input.frame_object_id&&isRow(frame.value.files_sha256)&&frame.value.files_sha256['data.npy']===input.frame_array_sha256,'frozen provider identity/hash differs');
 need(input.calibration_sha256===digest(view.value.xy_calibration??null)&&input.calibration_sha256===digest(current.xy_calibration??null),'frozen calibration differs');
 const mark=(Array.isArray(view.value.annotations)?view.value.annotations:[]).find(mark=>isRow(mark)&&mark.annotation_id===input.annotation_id&&mark.kind==='rectangle'&&mark.status!=='retracted');
 need(isRow(mark)&&isRow(mark.anchor)&&mark.anchor.coordinate_space==='source_pixels'&&mark.anchor.source_object_id===input.frame_object_id&&same(mark.anchor.coordinates,input.float_roi_xyxy),'original view does not contain this exact float ROI');reader.verifyArray(frame.value.object_id);return input;
}
export function verifyFftInputAssociation(reader:CliObjectReader,fft:VerifiedObject,roi:SavedRoi,recipe:{window:'none'|'hann';subtract_mean:boolean},raw:unknown):FftInputAssociation {
 need(isRow(raw),'missing independently verifiable input proof');
 if(raw.kind==='gui_panel_execution_input_v1'){
  need(typeof raw.input_relative_path==='string'&&typeof raw.input_sha256==='string'&&/^[a-f0-9]{64}$/.test(raw.input_sha256),'invalid original GUI input sidecar reference');
  const original=verifyPanelExecutionInput(reader.root,raw.input_relative_path,raw.input_sha256),input=original.input_snapshot,frame=reader.frame(roi.source_view_object_id),view=reader.object(roi.source_view_object_id).value;
  need(original.qualification==='validated'&&original.status==='completed'&&original.fft_object_id===fft.value.object_id&&input!==null,'original GUI execution input is not a qualified completed FFT');
  need(input.frame_object_id===roi.frame_object_id&&frame.value.object_id===roi.frame_object_id&&input.frame_manifest_sha256===frame.manifest_sha256&&isRow(frame.value.files_sha256)&&input.frame_array_sha256===frame.value.files_sha256['data.npy']&&same(input.float_roi_xyxy,roi.float_roi_xyxy)&&same(input.processing_rect_xyxy,roi.processing_rect_xyxy)&&same(input.recipe,recipe)&&input.calibration_sha256===digest(view.xy_calibration??null),'original GUI execution input differs from this ROI/frame/calibration/recipe');
  return raw as FftInputAssociation;
 }
 const input=validateFrozen(reader,raw.input_snapshot,roi,recipe);
 need(fft.value.kind==='fft'&&fft.value.window===recipe.window&&fft.value.subtract_mean===recipe.subtract_mean&&same(fft.value.source_rect_xyxy,roi.processing_rect_xyxy)&&reader.frame(fft.value.object_id).value.object_id===roi.frame_object_id,'FFT producer input differs');
 if(raw.kind==='cli_request_v1'){
  need(typeof raw.comparison_id==='string'&&id.test(raw.comparison_id)&&Number.isSafeInteger(raw.row_index)&&(raw.row_index as number)>=0&&(raw.row_index as number)<100,'invalid original CLI plan identity');
  const plan=reader.json(path.join(reader.root,'cli-requests','comparison-'+raw.comparison_id+'.json')).value,index=raw.row_index as number;
  need(plan.schema_version===1&&plan.command==='compare-rois'&&plan.request_id===raw.comparison_id&&Array.isArray(plan.frozen_inputs)&&same(plan.frozen_inputs[index],input),'original durable CLI plan does not bind this frozen input');
  const requestId='cli-fft-'+fftRequestSuffix(raw.comparison_id,index,input),parameters=fft.parameters;
  need(fft.value.request_id===requestId&&parameters.request_id===requestId&&parameters.action==='fft'&&same(parameters.rect,input.processing_rect_xyxy)&&parameters.window===recipe.window&&parameters.subtract_mean===recipe.subtract_mean&&reader.frame(parameters.object_id).value.object_id===input.frame_object_id,'original provider request does not bind the frozen float input');
  return raw as FftInputAssociation;
 }
 need(raw.kind==='gui_savepoint_v1'&&typeof raw.save_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(raw.save_id)&&typeof raw.window_id==='string','unsupported input proof');
 const saved=reader.json(path.join(reader.root,'analysis-workspace','savepoints',raw.save_id+'.json')),point=saved.value;
 need(createHash('sha256').update(saved.raw).digest('hex')===raw.savepoint_manifest_sha256&&point.save_id===raw.save_id&&isRow(point.snapshot)&&isRow(point.snapshot.window_collection)&&Array.isArray(point.snapshot.window_collection.records)&&isRow(point.references),'saved GUI input proof is unavailable or changed');
 need(point.references[String(fft.value.object_id)]===fft.manifest_sha256&&point.references[input.source_view_object_id]===input.source_view_manifest_sha256,'saved GUI input/FFT reference hashes differ');
 const entry=point.snapshot.window_collection.records.find(record=>isRow(record)&&isRow(record.entry)&&record.entry.window_id===raw.window_id),relation=isRow(entry)&&isRow(entry.entry)&&isRow(entry.entry.source_reference)?entry.entry.source_reference:null,context=relation&&isRow(relation.input_view_context)?relation.input_view_context:null,selection=context&&isRow(context.selection_candidate)?context.selection_candidate:null;
 need(relation!==null&&selection!==null,'saved GUI FFT input context is absent');
 need(relation.raw_fft_object_id===fft.value.object_id&&relation.frame_object_id===input.frame_object_id&&relation.input_view_object_id===input.source_view_object_id&&same(relation.processing_rect_xyxy,input.processing_rect_xyxy)&&selection.kind==='rectangle'&&selection.coordinate_space==='source_pixels'&&selection.source_object_id===input.frame_object_id&&same(selection.coordinates,input.float_roi_xyxy),'saved GUI FFT context does not bind this exact float input');
 return raw as FftInputAssociation;
}
export function guiFftInputAssociation(reader:CliObjectReader,saveId:string,fft:VerifiedObject,roi:SavedRoi,recipe:{window:'none'|'hann';subtract_mean:boolean}):FftInputAssociation|null {
 const saved=reader.json(path.join(reader.root,'analysis-workspace','savepoints',saveId+'.json')),point=saved.value;if(!isRow(point.snapshot)||!isRow(point.snapshot.window_collection)||!Array.isArray(point.snapshot.window_collection.records))return null;
 for(const record of point.snapshot.window_collection.records){if(!isRow(record)||!isRow(record.entry)||!isRow(record.entry.source_reference))continue;const relation=record.entry.source_reference;if(relation.raw_fft_object_id!==fft.value.object_id||typeof relation.input_view_object_id!=='string')continue;
  const input=frozenFftInput(reader,{...roi,source_view_object_id:relation.input_view_object_id},recipe),proof:FftInputAssociation={kind:'gui_savepoint_v1',save_id:saveId,savepoint_manifest_sha256:createHash('sha256').update(saved.raw).digest('hex'),window_id:String(record.entry.window_id),input_snapshot:input};
  try{return verifyFftInputAssociation(reader,fft,roi,recipe,proof);}catch{/* Another exact source relation may qualify; the report itself is not proof. */}
 }
 return null;
}
