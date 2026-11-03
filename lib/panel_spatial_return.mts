// A single bounded reference in the existing Panel checkpoint. No pixels,
// journal rewriting, discovery of recent objects, or numerical operations.
import {createHash} from 'node:crypto';
import type {PanelFrameIdentity,PanelMetadata,PanelSpatialReturnState} from './image_panel_contracts.mjs';
type Row=PanelMetadata;
export interface SpatialReturnReference {version:1;view_object_id:string;frame_object_id:string;fft_object_id:string;source_rect_xyxy:readonly number[];}
export class SpatialReturnError extends Error {constructor(readonly code:string){super(code);}}
function fail(code:string):never{throw new SpatialReturnError(code);}
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const rect=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===4&&v.every(n=>Number.isSafeInteger(n)&&n>=0)&&v[0]<v[2]&&v[1]<v[3];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// Mirrors the provider's image_calibration.dependency projection. The raw FFT
// keeps its original dependency even if a later display selects another one.
function calibrationDependency(value:unknown):Row|null {
 if(value==null)return null;
 if(!row(value)||!id(value.calibration_id)||!Number.isSafeInteger(value.revision)||(value.revision as number)<1||typeof value.status!=='string')fail('different_calibration');
 return {calibration_id:value.calibration_id,revision:value.revision,status:value.status,source:value.source??'user_statement_not_independently_verified',...(Object.hasOwn(value,'coordinate_domain')?{coordinate_domain:value.coordinate_domain}:{}),...(Object.hasOwn(value,'centre_revision_id')?{centre_revision_id:value.centre_revision_id}:{})};
}
function sameDependency(a:unknown,b:unknown):boolean {
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):row(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
function validateCalibration(view:Row,fft:Row,fftPanel:Row):void {
 const original=calibrationDependency(fft.xy_calibration),target=calibrationDependency(view.xy_calibration);
 if(!sameDependency(original,target))fail('different_calibration');
 for(const value of [view,fft]){
  if(Object.hasOwn(value,'display_calibration_id')&&value.display_calibration_id!==(original?.calibration_id??null))fail('different_calibration');
  if(Object.hasOwn(value,'calibration_dependency')&&!sameDependency(value.calibration_dependency,original))fail('different_calibration');
 }
 if(Object.hasOwn(fftPanel,'calibration_dependency')&&!sameDependency(fftPanel.calibration_dependency,original))fail('different_calibration');
}
export function readSpatialReturnReference(raw:unknown):SpatialReturnReference {
 if(!row(raw)||Object.keys(raw).some(k=>!['version','view_object_id','frame_object_id','fft_object_id','source_rect_xyxy'].includes(k))||raw.version!==1||!id(raw.view_object_id)||!id(raw.frame_object_id)||!id(raw.fft_object_id)||!rect(raw.source_rect_xyxy))fail('invalid_reference');
 return {version:1,view_object_id:raw.view_object_id as string,frame_object_id:raw.frame_object_id as string,fft_object_id:raw.fft_object_id as string,source_rect_xyxy:[...(raw.source_rect_xyxy as number[])]};
}
export function validateSpatialReturn(reference:SpatialReturnReference,view:Row,png:unknown,viewFrame:PanelFrameIdentity|null,fft:Row,fftFrame:PanelFrameIdentity|null):void {
 if(view.object_id!==reference.view_object_id||fft.object_id!==reference.fft_object_id)fail('invalid_reference');
 if(viewFrame?.frame_object_id!==reference.frame_object_id||fftFrame?.frame_object_id!==reference.frame_object_id)fail('different_frame');
 const panels=view.panels;
 if(!Array.isArray(panels)||panels.length!==1||!row(panels[0])||panels[0].domain!=='spatial_pixels'||panels[0].source_object_id!==reference.frame_object_id||view.array_domain==='frequency')fail('not_spatial');
 const support=panels[0].source_rect_xyxy,r=reference.source_rect_xyxy;
 if(!rect(support)||support[0]>r[0]||support[1]>r[1]||support[2]<r[2]||support[3]<r[3])fail('different_fft_support');
 const fp=fft.panels,shape=fft.shape_yx;
 if(fft.kind!=='fft'||fft.array_domain!=='frequency'||!equal(fft.source_rect_xyxy,r)||!Array.isArray(shape)||shape.length!==2||shape[0]!==r[3]-r[1]||shape[1]!==r[2]-r[0]||!Array.isArray(fp)||fp.length!==1||!row(fp[0])||fp[0].domain!=='frequency'||fp[0].source_object_id!==reference.fft_object_id)fail('different_fft_support');
 validateCalibration(view,fft,fp[0] as Row);
 const digest=row(view.files_sha256)?view.files_sha256['preview.png']:null;
 if(typeof png!=='string'||!png||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))fail('missing_saved_preview');
 const bytes=Buffer.from(png,'base64');
 if(bytes.length>2*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||createHash('sha256').update(bytes).digest('hex')!==digest)fail('invalid_saved_preview');
}
export function spatialReturnState(reference:SpatialReturnReference|null,current:Row,frame:PanelFrameIdentity|null,reason=''):PanelSpatialReturnState {
 const unavailable=(reason_code:string):PanelSpatialReturnState=>({version:1,status:'unavailable',reason_code});
 if(!reference)return unavailable(reason||'no_saved_return');
 // A retained candidate is not usable until provider validation succeeds.
 if(reason)return unavailable(reason);
 if(frame?.frame_object_id!==reference.frame_object_id)return unavailable('different_frame');
 if(current.object_id===reference.view_object_id)return unavailable('already_at_spatial_view');
 const panels=current.panels;
 if(!Array.isArray(panels)||panels.length!==1||!row(panels[0])||panels[0].domain!=='frequency'||panels[0].source_object_id!==reference.fft_object_id)return unavailable('different_fft');
 return {version:1,status:'ready',view_object_id:reference.view_object_id,frame_object_id:reference.frame_object_id};
}
