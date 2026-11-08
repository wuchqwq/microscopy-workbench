// Read-only projection of committed provider records, not another numeric engine.
import {readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import {readStatisticsDisplays} from './image_statistics_display.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a,sort)===JSON.stringify(b,sort);
function sort(_key:string,v:unknown):unknown{return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v;}
function need(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
export function readImageStatisticsHistory({workspace,objectId,limit=256}:{workspace:string;objectId:string;limit?:number}){
 need(Number.isSafeInteger(limit)&&limit>=1&&limit<=512,'Statistics history limit must be 1..512');
 const r=readImageProviderRecords(workspace),current=r.operand(objectId),frames=current.lineage.frames,displays=readStatisticsDisplays(r);
 const frame=frames.length===1?frames[0].object_id:null,entries:Row[]=[];
 const requests=readdirSync(path.join(r.root,'requests'),{withFileTypes:true});
 need(requests.length<=8192,'Statistics history exceeds bounded request budget');
 for(const item of requests){
  if(!item.name.endsWith('.json'))continue;
  need(item.isFile()&&!item.isSymbolicLink()&&/^[A-Za-z0-9_-]{1,64}\.json$/.test(item.name),'Invalid statistics request metadata');
  const request=r.json(path.join(r.root,'requests',item.name)).value;
  if(request.state!=='completed'||row(request.response).kind!=='statistics')continue;
  const saved=r.object(row(request.response).object_id),s=saved.value,input=r.operand(s.parent_object_id);
  // Exact frame identity, including when the current display is its FFT. Do
  // not project another frame's numbers by filename, recency or ROI similarity.
  if(!frame||input.lineage.frames.length!==1||input.lineage.frames[0].object_id!==frame||s.coordinate_space!=='source_pixels')continue;
  const rect=s.source_rect_xyxy,stats=row(s.statistics);
  need(saved.parameters.action==='statistics'&&saved.parameters.object_id===s.parent_object_id&&same(saved.parameters.rect??input.grid?.source_rect_xyxy,rect)&&
   (saved.parameters.component??'raw')===s.component&&same(s.scientific_grid_identity,input.grid),'Saved statistics input/parameters/grid disagree');
  need(Array.isArray(rect)&&rect.length===4&&rect.every(Number.isSafeInteger)&&rect[2]>rect[0]&&rect[3]>rect[1]&&
   stats.sample_count===(rect[2]-rect[0])*(rect[3]-rect[1])&&['mean','stddev','minimum','maximum'].every(k=>typeof stats[k]==='number'&&Number.isFinite(stats[k]))&&
   (stats.stddev as number)>=0,'Saved statistics diagnostics are invalid');
  const payload=path.join(r.root,'objects',s.object_id,'statistics.json'),json=r.json(payload);
  need(same(json.value,stats)&&createHash('sha256').update(json.raw).digest('hex')===row(s.files_sha256)['statistics.json'],'Saved statistics payload differs from its committed manifest');
  r.verifyArray(input.value.object_id);
  const original=r.object(s.parent_object_id).value,marks=Array.isArray(original.annotations)?original.annotations:[];
  const matches=marks.map(row).filter(mark=>{
   const anchor=row(mark.anchor),c=anchor.coordinates;
   return mark.kind==='rectangle'&&mark.status!=='retracted'&&anchor.coordinate_space===s.coordinate_space&&anchor.source_object_id===row(s.scientific_grid_identity).source_grid_object_id&&
    Array.isArray(c)&&c.length===4&&c.every(v=>typeof v==='number'&&Number.isFinite(v))&&same([Math.floor(Math.min(c[0],c[2])),Math.floor(Math.min(c[1],c[3])),Math.ceil(Math.max(c[0],c[2])),Math.ceil(Math.max(c[1],c[3]))],rect);
  }).map(mark=>({annotation_id:mark.annotation_id,name:typeof mark.text==='string'?mark.text:null}));
  entries.push({object_id:s.object_id,request_id:s.request_id,input_object_id:s.parent_object_id,frame_object_id:frame,
   input_display:displays.inputDisplay(String(s.parent_object_id),objectId),created_utc:s.created_utc??null,source_identity:input.lineage.source_identity,source_rect_xyxy:rect,coordinate_space:s.coordinate_space,
   component:s.component,dtype:s.dtype,statistics:stats,standard_deviation:s.standard_deviation??null,
   intensity_unit:null,intensity_semantics:s.intensity_semantics??null,intensity_calibration_applied:s.intensity_calibration_applied??null,
   matching_input_annotations:matches,label_basis:'saved_input_outward_roi_bounds_match_only',
   manifest_sha256:saved.manifest_sha256,input_manifest_sha256:r.object(s.parent_object_id).manifest_sha256,statistics_sha256:row(s.files_sha256)['statistics.json'],scientific_grid_identity:s.scientific_grid_identity});
 }
 entries.sort((a,b)=>String(a.created_utc??'').localeCompare(String(b.created_utc??''))||String(a.object_id).localeCompare(String(b.object_id)));
 return {schema_version:1,read_only:true,object_id:objectId,frame_object_id:frame,scope:'same_frame_source_pixels',entries:entries.slice(-limit),total:entries.length,truncated:entries.length>limit};
}
