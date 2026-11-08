// Read-only preparation over original provider journals. This is an integrity
// boundary, never a disclosure authorization or scientific interpretation.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {constants,lstatSync,openSync,readSync,closeSync,fstatSync,realpathSync} from 'node:fs';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import type {HostTurnInput,HostImageReference} from './research_host.mjs';
const HASH=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{32}$/,REQUEST=/^[A-Za-z0-9_-]{1,64}$/;
const DTYPE=/^(?:bool|u?int(?:8|16|32|64)|float(?:16|32|64)|[<>=|]?[uifb][1248])$/;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const MEANING='Display PNG, not scientific array or independent experiment; source_pixels mapping only, no physical calibration or material interpretation established by this attachment.';
export const HOST_IMAGE_LIMIT_BYTES=8*1024*1024;
type Row=Record<string,unknown>;
function need(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
function record(v:unknown):v is Row{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function keys(v:Row,allowed:string[]){need(Object.keys(v).every(k=>allowed.includes(k)),'Unexpected host input fields');}
const preparedImages=new WeakMap<object,Readonly<ResearchHostImageOptions>>();
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
function shape(v:unknown):[number,number]{
 need(Array.isArray(v)&&v.length===2&&v.every(n=>Number.isSafeInteger(n)&&n>0)&&v[0]*v[1]<=128*1024*1024,'Invalid bounded scientific shape');
 return [v[0],v[1]];
}
function rect(v:unknown):[number,number,number,number]{
 need(Array.isArray(v)&&v.length===4&&v.every(n=>Number.isSafeInteger(n)&&n>=0)&&v[0]<v[2]&&v[1]<v[3],'Invalid spatial display mapping');
 return [v[0],v[1],v[2],v[3]];
}
// Snapshot the exact bytes that are hashed, then send those bytes. O_NOFOLLOW
// and fstat fence final-component replacement; no pathname is sent to Codex.
// Concurrent edits can cause refusal, never a later reopening of unchecked data.
function snapshotPng(file:string,expected:string){
 need(typeof file==='string'&&path.isAbsolute(file)&&file.length<=4096,'Explicit absolute PNG path required');
 need(typeof expected==='string'&&HASH.test(expected),'Explicit PNG SHA-256 required');
 const before=lstatSync(file);need(before.isFile()&&!before.isSymbolicLink()&&before.size>=24&&before.size<=HOST_IMAGE_LIMIT_BYTES,'Missing, linked or oversized host PNG');
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=fstatSync(fd);need(opened.isFile()&&opened.dev===before.dev&&opened.ino===before.ino&&opened.size===before.size,'Host PNG replaced during opening');
  const bytes=Buffer.alloc(before.size);let total=0;
  while(total<bytes.length){const n=readSync(fd,bytes,total,bytes.length-total,null);if(!n)break;total+=n;}
  const extra=Buffer.alloc(1),grew=readSync(fd,extra,0,1,null),after=fstatSync(fd);
  need(total===bytes.length&&grew===0&&after.size===opened.size&&after.mtimeMs===opened.mtimeMs&&after.ctimeMs===opened.ctimeMs&&createHash('sha256').update(bytes).digest('hex')===expected,'Host PNG changed or differs from its selected SHA-256');
  need(bytes.subarray(0,8).equals(PNG)&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR','Host image must be a PNG display');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);need(width>0&&height>0&&width*height<=16*1024*1024,'Host PNG dimensions exceed display budget');
  return {bytes,width,height};
 }finally{closeSync(fd);}
}
const sourceFields=['view_id','view_manifest_sha256','original_request_id','frame_id','frame_manifest_sha256','frame_array_sha256','view_array_sha256','frame_shape_yx','view_shape_yx','dtype','source_rect_xyxy','image_rect_xyxy','display_png_sha256'];
function sourceReference(raw:unknown):HostImageReference{
 need(record(raw),'Explicit saved display reference required');keys(raw,sourceFields);
 need(typeof raw.view_id==='string'&&ID.test(raw.view_id)&&typeof raw.frame_id==='string'&&ID.test(raw.frame_id),'Invalid saved display identity');
 for(const k of ['view_manifest_sha256','frame_manifest_sha256','frame_array_sha256','view_array_sha256','display_png_sha256'])need(typeof raw[k]==='string'&&HASH.test(raw[k] as string),'Invalid saved display digest');
 need(typeof raw.original_request_id==='string'&&REQUEST.test(raw.original_request_id),'Invalid original display request');
 need(typeof raw.dtype==='string'&&DTYPE.test(raw.dtype),'Only an explicitly typed scalar spatial display is supported');
 const fs=shape(raw.frame_shape_yx),vs=shape(raw.view_shape_yx),sr=rect(raw.source_rect_xyxy),ir=rect(raw.image_rect_xyxy);
 need(sr[2]<=fs[1]&&sr[3]<=fs[0]&&sr[2]-sr[0]===vs[1]&&sr[3]-sr[1]===vs[0],'Spatial mapping differs from its frame or saved array shape');
 return {view_id:raw.view_id,view_manifest_sha256:raw.view_manifest_sha256 as string,original_request_id:raw.original_request_id,frame_id:raw.frame_id,frame_manifest_sha256:raw.frame_manifest_sha256 as string,frame_array_sha256:raw.frame_array_sha256 as string,view_array_sha256:raw.view_array_sha256 as string,frame_shape_yx:fs,view_shape_yx:vs,dtype:raw.dtype,source_rect_xyxy:sr,image_rect_xyxy:ir,display_png_sha256:raw.display_png_sha256 as string};
}
export type HostWireInput={type:'text';text:string}|{type:'image';url:string};
export function hostTurnWireInput(raw:string|HostTurnInput):HostWireInput[]{
 const input:unknown=typeof raw==='string'?{text:raw}:raw;
 need(record(input),'Explicit host turn input required');keys(input,['text','images','source']);
 need(typeof input.text==='string'&&!!input.text.trim()&&Buffer.byteLength(input.text)<=8192,'Explicit bounded text required');
 const images=input.images===undefined?[]:input.images;need(Array.isArray(images)&&images.length<=2,'At most two explicit PNG images per turn');
 const selected=images.map(image=>{need(record(image),'Invalid host image reference');keys(image,['path','sha256']);need(typeof image.path==='string'&&typeof image.sha256==='string','Explicit PNG path and SHA-256 required');return {path:image.path,sha256:image.sha256};});
 const source=input.source===undefined?undefined:sourceReference(input.source);
 need(!source||selected.length===1&&selected[0].sha256===source.display_png_sha256,'Saved display reference must bind its one exact PNG');
 // Complete all checks/copies before any RPC or adapter state change.
 const snapshots=selected.map(image=>snapshotPng(image.path,image.sha256));
 if(source){const image=snapshots[0],r=source.image_rect_xyxy;need(r[2]<=image.width&&r[3]<=image.height,'Panel image mapping exceeds PNG dimensions');}
 const origin=preparedImages.has(input)?'Verified saved display reference (not a disclosure authorization)':'Caller-supplied display reference (unverified; not a disclosure authorization)';
 return [{type:'text',text:input.text},...(source?[{type:'text' as const,text:origin+':\n'+JSON.stringify({...source,coordinate_space:'source_pixels',meaning:MEANING})}]:[]),...snapshots.map(image=>({type:'image' as const,url:'data:image/png;base64,'+image.bytes.toString('base64')}))];
}
export interface ResearchHostImageOptions {workspace:string;view_id:string;view_sha256:string;frame_id:string;text:string;}
export function prepareResearchHostImage(options:ResearchHostImageOptions):HostTurnInput{
 // Capture only the requested primitives once, before any provider reads. A
 // mutable caller object/accessor must not change identity between checks.
 options={workspace:options.workspace,view_id:options.view_id,view_sha256:options.view_sha256,frame_id:options.frame_id,text:options.text};
 hostTurnWireInput(options.text);
 need(ID.test(options.view_id)&&ID.test(options.frame_id)&&HASH.test(options.view_sha256),'Exact saved view/frame IDs and manifest SHA-256 required');
 const reader=readImageProviderRecords(options.workspace),saved=reader.object(options.view_id),view=saved.value;
 need(saved.manifest_sha256===options.view_sha256,'Selected view manifest changed');
 need(view.kind==='view'&&Array.isArray(view.panels)&&view.panels.length===1&&record(view.panels[0])&&view.panels[0].domain==='spatial_pixels','Only an existing single spatial PNG view is supported; annotated/composite/FFT views require separate qualification');
 need((view.annotations===undefined||Array.isArray(view.annotations)&&view.annotations.length===0)&&(view.annotation_reprojection===undefined||view.annotation_reprojection===false),'Annotated or reprojected displays are not qualified host input');
 const operand=reader.operand(options.view_id),frames=operand.lineage.frames,panel=view.panels[0];
 need(frames.length===1&&frames[0].object_id===options.frame_id,'Selected image belongs to another or ambiguous frame');
 need(panel.source_object_id===options.frame_id&&operand.grid?.source_grid_object_id===options.frame_id,'Panel source does not match the verified frame');
 need(operand.grid?.coordinate_space==='source_pixels','Saved spatial coordinate grid is unavailable');
 reader.verifyArray(operand.value.object_id);reader.verifyArray(options.frame_id);
 const frame=reader.object(options.frame_id),file=path.join(reader.root,'objects',options.view_id,'preview.png');
 need(frame.value.kind==='frame'&&view.dtype===frame.value.dtype,'Display dtype differs from its verified scalar frame');
 need(record(view.files_sha256)&&record(frame.value.files_sha256)&&typeof view.files_sha256['preview.png']==='string','Saved display PNG hash is unavailable');
 need(realpathSync.native(file)===file,'Saved display PNG escapes its ordinary object directory');
 const image={path:file,sha256:view.files_sha256['preview.png']};
 // Projection from primitive whitelist only. Never serialize a provider panel,
 // scientific context, unknown field, filename, arbitrary label or local path.
 const source=sourceReference({view_id:options.view_id,view_manifest_sha256:saved.manifest_sha256,original_request_id:view.request_id,frame_id:options.frame_id,frame_manifest_sha256:frame.manifest_sha256,frame_array_sha256:frame.value.files_sha256['data.npy'],view_array_sha256:view.files_sha256['data.npy'],frame_shape_yx:frame.value.shape_yx,view_shape_yx:view.shape_yx,dtype:view.dtype,source_rect_xyxy:panel.source_rect_xyxy,image_rect_xyxy:panel.image_rect_xyxy,display_png_sha256:image.sha256});
 const prepared=freeze({text:options.text,source,images:[image]});
 preparedImages.set(prepared,Object.freeze({...options,workspace:reader.root}));hostTurnWireInput(prepared);return prepared;
}
// An opaque preparation's provenance lives only in this process, not in caller
// fields or a serialized 'verified' flag. Reopen/revalidate original journals
// and arrays on every dispatch check, retaining the originally selected hashes.
export function recheckPreparedResearchHostImage(input:HostTurnInput){
 const selected=preparedImages.get(input);need(selected,'Original prepared image identity required; copied/caller-supplied references are unverified');
 const current=prepareResearchHostImage(selected);
 need(JSON.stringify(current)===JSON.stringify(input),'Prepared question or source changed');
 return {workspace:selected.workspace,input:current,wire:hostTurnWireInput(current)};
}
