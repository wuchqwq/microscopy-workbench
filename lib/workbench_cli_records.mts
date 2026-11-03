// Bounded verified metadata projection, never a replacement science journal.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {outwardSourceRectangle} from '../ui/image-panel/coordinates.mjs';

export type Row=Record<string,unknown>;
export const isRow=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
export const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>isRow(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const same=(a:unknown,b:unknown)=>canonical(a??null)===canonical(b??null);
const objectId=/^[a-f0-9]{32}$/,requestId=/^[A-Za-z0-9_-]{1,64}$/;
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Object.assign(new Error(message),{code:'CORRUPT_OBJECT'});}
export interface VerifiedObject {value:Row;parameters:Row;manifest_sha256:string;}
export class CliObjectReader {
 readonly root:string;private bytes=0;private cache=new Map<string,VerifiedObject>();private checkedArrays=new Set<string>();
 constructor(workspace:string){need(path.isAbsolute(workspace)&&lstatSync(workspace).isDirectory()&&!lstatSync(workspace).isSymbolicLink(),'Ordinary absolute workspace required');this.root=realpathSync.native(workspace);}
 json(file:string){
  const info=lstatSync(file),relative=path.relative(this.root,realpathSync.native(file));need(info.isFile()&&!info.isSymbolicLink()&&info.size<=2*1024*1024&&relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Linked, escaping or oversized metadata');this.bytes+=info.size;need(this.bytes<=64*1024*1024,'CLI metadata read budget exceeded');
  const raw=readFileSync(file),value:unknown=JSON.parse(raw.toString('utf8'));need(isRow(value),'Metadata must be an object');return {raw,value};
 }
 object(id:unknown):VerifiedObject {
  need(typeof id==='string'&&objectId.test(id),'Exact saved object ID required');const cached=this.cache.get(id);if(cached)return cached;need(this.cache.size<2048,'CLI object read budget exceeded');
  const dir=path.join(this.root,'objects',id);need(lstatSync(dir).isDirectory()&&!lstatSync(dir).isSymbolicLink(),'Linked or missing object directory');const {raw,value}=this.json(path.join(dir,'object.json')),sha=createHash('sha256').update(raw).digest('hex');
  need(value.object_id===id&&value.backend==='external-image-workspace'&&typeof value.request_id==='string'&&requestId.test(value.request_id),'Provider object identity mismatch');
  const journal=this.json(path.join(this.root,'requests',value.request_id+'.json')).value;
  need(journal.state==='completed'&&journal.request_id===value.request_id&&journal.object_manifest_sha256===sha&&isRow(journal.parameters)&&journal.parameters.request_id===value.request_id&&typeof journal.parameters.workspace==='string'&&realpathSync.native(journal.parameters.workspace)===this.root&&same(journal.response,{ok:true,state:'completed',backend:'external-image-workspace',request_id:value.request_id,...value}),'Provider object does not match its committed original journal');
  const record={value,parameters:journal.parameters,manifest_sha256:sha};this.cache.set(id,record);return record;
 }
 objects():VerifiedObject[]{const dir=path.join(this.root,'objects');need(lstatSync(dir).isDirectory()&&!lstatSync(dir).isSymbolicLink(),'Missing ordinary object directory');const ids=readdirSync(dir).filter(name=>objectId.test(name));need(ids.length<=2048,'Workspace exceeds CLI listing budget; select exact immutable objects');return ids.sort().map(id=>this.object(id));}
 verifyArray(id:unknown):void {
  const object=this.object(id).value;if(this.checkedArrays.has(String(id)))return;need(isRow(object.files_sha256)&&typeof object.files_sha256['data.npy']==='string','Scientific array hash is absent');
  const file=path.join(this.root,'objects',String(id),'data.npy'),s=lstatSync(file),relative=path.relative(this.root,realpathSync.native(file));need(s.isFile()&&!s.isSymbolicLink()&&s.size<=128*1024*1024&&relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Scientific array exceeds read budget or escapes workspace');
  need(createHash('sha256').update(readFileSync(file)).digest('hex')===object.files_sha256['data.npy'],'Scientific array hash differs from original committed record');this.checkedArrays.add(String(id));
 }
 frame(id:unknown):VerifiedObject {
  const seen=new Set<unknown>();for(let n=0;n<64;n++){need(!seen.has(id),'Cyclic source ancestry');seen.add(id);const result=this.object(id);if(result.value.kind==='frame')return result;id=result.value.parent_object_id??result.value.base_object_id??result.value.source_object_id;}
  throw new Error('Source ancestry exceeds 64 records');
 }
}
export interface SavedRoi {annotation_id:string;source_view_object_id:string;frame_object_id:string;float_roi_xyxy:number[];processing_rect_xyxy:number[];source_object_id:string;note:string;status:string;}
export function savedRois(reader:CliObjectReader,snapshot:Row):SavedRoi[]{
 const ids=new Set<unknown>([snapshot.object_id]);const collection=isRow(snapshot.window_collection)?snapshot.window_collection:{};
 for(const item of Array.isArray(collection.records)?collection.records:[]){if(!isRow(item)||!isRow(item.entry))continue;const e=item.entry;if(e.role!=='fft'){ids.add(e.latest_observation_view_object_id??e.object_id);}}
 const result=new Map<string,SavedRoi>();
 for(const id of ids){const view=reader.object(id).value;if(view.array_domain==='frequency'||view.kind==='fft'||view.kind==='fft_view')continue;const frame=reader.frame(id).value;
  for(const mark of Array.isArray(view.annotations)?view.annotations:[]){if(!isRow(mark)||mark.kind!=='rectangle'||mark.status==='retracted'||typeof mark.annotation_id!=='string'||!requestId.test(mark.annotation_id)||!isRow(mark.anchor)||mark.anchor.coordinate_space!=='source_pixels'||typeof mark.anchor.source_object_id!=='string'||!Array.isArray(mark.anchor.coordinates)||mark.anchor.coordinates.length!==4||mark.anchor.coordinates.some(n=>typeof n!=='number'||!Number.isFinite(n)))continue;
   const f=mark.anchor.coordinates as number[];if(f[0]>=f[2]||f[1]>=f[3])continue;if(mark.anchor.source_object_id!==frame.object_id)throw new Error('ROI anchor does not name its exact original frame');const support=outwardSourceRectangle(f),shape=frame.shape_yx;if(!Array.isArray(shape)||shape.length!==2||support[0]<0||support[1]<0||support[2]>Number(shape[1])||support[3]>Number(shape[0])||support[0]>=support[2]||support[1]>=support[3])throw new Error('ROI support exceeds its exact source frame');const prior=result.get(mark.annotation_id),row={annotation_id:mark.annotation_id,source_view_object_id:String(id),frame_object_id:String(frame.object_id),float_roi_xyxy:f,processing_rect_xyxy:support,source_object_id:mark.anchor.source_object_id,note:typeof mark.note==='string'?mark.note:'',status:String(mark.status)};
   // The savepoint must identify one current version; never choose by mtime.
   if(prior&&!same({...prior,source_view_object_id:null},{...row,source_view_object_id:null}))throw Object.assign(new Error('ROI identity has conflicting saved versions; select an explicit immutable view'),{code:'VERSION_CONFLICT'});result.set(mark.annotation_id,row);
  }
 }
 return [...result.values()];
}
