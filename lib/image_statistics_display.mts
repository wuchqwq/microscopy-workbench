// Read-only display provenance. A same-array preview is not evidence of the
// display used for an old raw-frame request, and never changes its input ID.
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import type {readImageProviderRecords} from './image_measurement_records.mjs';
type Reader=ReturnType<typeof readImageProviderRecords>;
type Row=Record<string,unknown>;
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
export interface StatisticsInputDisplay {kind:'exact_saved_input'|'same_source_current_preview'|'unavailable';object_id:string|null;manifest_sha256:string|null;reason:string;}
export function readStatisticsDisplays(reader:Reader){
 const pngs=new Set<string>();let bytes=0;
 function verifyPng(objectId:string){
  if(pngs.has(objectId))return;const saved=reader.object(objectId),expected=row(saved.value.files_sha256)['preview.png'];
  need(typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected),'输入没有已保存的显示 PNG');
  const file=path.join(reader.root,'objects',objectId,'preview.png'),info=lstatSync(file),relative=path.relative(reader.root,realpathSync.native(file));
  need(info.isFile()&&!info.isSymbolicLink()&&info.size<=2*1024*1024&&relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'保存预览不是工作区内的有界普通文件');
  bytes+=info.size;need(bytes<=64*1024*1024,'保存预览核对超出读取预算');const raw=readFileSync(file);
  need(createHash('sha256').update(raw).digest('hex')===expected&&raw.subarray(0,8).toString('hex')==='89504e470d0a1a0a','保存预览哈希或 PNG 格式不符');pngs.add(objectId);
 }
 function fullFramePreview(frameId:string,viewId:string){
  const frame=reader.object(frameId),saved=reader.object(viewId),input=reader.operand(viewId),panels=saved.value.panels as Row[]|undefined,shape=frame.value.shape_yx as number[]|undefined;
  need(frame.value.kind==='frame'&&Array.isArray(shape)&&shape.length===2&&shape.every(n=>Number.isSafeInteger(n)&&n>0),'需要准确的二维原数组帧');
  const full=[0,0,shape[1],shape[0]],panel=panels?.length===1?panels[0]:null;
  need(['view','annotate'].includes(String(saved.value.kind))&&input.value.kind==='view'&&input.lineage.frames.length===1&&input.lineage.frames[0]!.object_id===frameId,'当前显示没有唯一的同源空间预览绑定');
  need(panel?.domain==='spatial_pixels'&&panel.source_object_id===frameId&&same(panel.source_rect_xyxy,full)&&Array.isArray(panel.image_rect_xyxy)&&panel.image_rect_xyxy.length===4&&panel.image_rect_xyxy.every(n=>typeof n==='number'&&Number.isFinite(n))&&panel.image_rect_xyxy[2]>panel.image_rect_xyxy[0]&&panel.image_rect_xyxy[3]>panel.image_rect_xyxy[1],'当前显示不是该原数组的完整空间映射');
  need(input.grid?.source_grid_object_id===frameId&&input.grid.coordinate_space==='source_pixels'&&same(input.grid.source_rect_xyxy,full)&&same(input.value.shape_yx,shape)&&input.value.dtype===frame.value.dtype&&row(input.value.files_sha256)['data.npy']===row(frame.value.files_sha256)['data.npy'],'当前预览的原数组、dtype、形状或坐标不匹配');
  reader.verifyArray(frameId);reader.verifyArray(input.value.object_id);verifyPng(viewId);return saved;
 }
 function inputDisplay(inputId:string,currentId:string):StatisticsInputDisplay {
  try{
   const input=reader.object(inputId);
   if(row(input.value.files_sha256)['preview.png']&&input.value.kind!=='calibration'){
    verifyPng(inputId);return {kind:'exact_saved_input',object_id:inputId,manifest_sha256:input.manifest_sha256,reason:'统计原请求准确绑定的已保存显示；不恢复未记录的相机或临时选区。'};
   }
   need(input.value.kind==='frame','准确输入没有可直接打开的已保存显示预览');
   const current=fullFramePreview(inputId,currentId);
   return {kind:'same_source_current_preview',object_id:currentId,manifest_sha256:current.manifest_sha256,reason:'仅核对为同一原数组的当前完整预览；旧统计未记录显示身份，不是统计时的历史显示。'};
  }catch(error){return {kind:'unavailable',object_id:null,manifest_sha256:null,reason:(error as Error).message+'；保留原统计输入，不猜选其他预览。'};}
 }
 return {fullFramePreview,inputDisplay};
}
