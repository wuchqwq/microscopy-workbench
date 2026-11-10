// Bounded, read-only disclosure projection over original provider records.
// A caller cannot manufacture evidence by passing JSON or approved flags.
import {createHash} from 'node:crypto';
import {readImageProviderRecords,readImageMeasurements} from './image_measurement_records.mjs';
import {readImageStatisticsHistory} from './image_statistics_history.mjs';
import {prepareResearchHostImage} from './research_host_input.mjs';
import type {HostImageReference} from './research_host.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const json=(v:unknown)=>JSON.stringify(v,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const sha=(v:unknown)=>createHash('sha256').update(json(v)).digest('hex');
const pick=(v:unknown,keys:string[])=>Object.fromEntries(keys.filter(k=>row(v)[k]!==undefined).map(k=>[k,structuredClone(row(v)[k])]));
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
export interface JointResearchSelection {measurement_ids?:readonly string[];statistics_ids?:readonly string[];}
export interface JointResearchEvidence {readonly projection:Readonly<Row>;readonly sha256:string;}
const originals=new WeakMap<object,{workspace:string;source:HostImageReference;selection:JointResearchSelection}>();
function ids(value:unknown):string[]{need(value===undefined||Array.isArray(value)&&value.length<=32&&value.every(v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v)),'Explicit bounded saved evidence IDs required');const list=(value??[]) as string[];need(new Set(list).size===list.length,'Duplicate selected evidence');return [...list].sort();}
const calKeys=['calibration_id','revision','status','source','source_text','coordinate_domain','xy_scale','scale','unit','dc_index_xy','uncertainty_status','centre_revision_id'];
function projection(workspace:string,source:HostImageReference,selection:JointResearchSelection):Row{
 const verified=prepareResearchHostImage({workspace,view_id:source.view_id,view_sha256:source.view_manifest_sha256,frame_id:source.frame_id,text:'Verify exact saved image identity without dispatch.'});need(json(verified.source)===json(source),'Evidence image/source/range differs from the original saved preparation');
 const r=readImageProviderRecords(workspace),view=r.object(source.view_id),frame=r.object(source.frame_id),operand=r.operand(source.view_id);
 need(view.manifest_sha256===source.view_manifest_sha256&&frame.manifest_sha256===source.frame_manifest_sha256,'Selected evidence source manifest differs');
 need(operand.lineage.frames.length===1&&operand.lineage.frames[0].object_id===source.frame_id,'Selected evidence belongs to another frame');r.verifyArray(source.frame_id);r.verifyArray(source.view_id);
 const rect=source.source_rect_xyxy as number[],inside=(bounds:unknown)=>Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)&&bounds[0]>=rect[0]&&bounds[1]>=rect[1]&&bounds[2]<=rect[2]&&bounds[3]<=rect[3];
 const measurementIds=ids(selection.measurement_ids),statisticsIds=ids(selection.statistics_ids),measurementRecords=measurementIds.length?readImageMeasurements({workspace,objectId:source.view_id,limit:512}).entries:[],statisticsRecords=statisticsIds.length?readImageStatisticsHistory({workspace,objectId:source.frame_id,limit:512}).entries:[];
 const measurements=measurementIds.map(id=>{const e=measurementRecords.find(e=>e.measurement_object_id===id);need(e&&e.status==='current'&&e.same_grid&&e.same_frame&&(e.annotation_id===null||e.annotation_matches_current)&&e.coordinate_space==='source_pixels'&&Array.isArray(e.points)&&e.points.every(p=>Array.isArray(p)&&p.length===2&&p[0]>=rect[0]&&p[0]<=rect[2]&&p[1]>=rect[1]&&p[1]<=rect[3]),'Selected measurement is not inside the exact saved image/frame');return {...pick(e,['object_id','request_id','measurement_manifest_sha256','input_object_id','measurement_kind','measurement_type','status','previous_measurement_object_id','coordinate_space','points','scientific_grid_identity','distance_pixels','physical_distance','physical_unit','angle_image_degrees','angle_physical_degrees','source_text','angle_input_measurements']),xy_calibration:e.xy_calibration?pick(e.xy_calibration,calKeys):null,input_manifest_sha256:r.object(e.input_object_id).manifest_sha256};});
 const statistics=statisticsIds.map(id=>{const e=statisticsRecords.find(e=>e.object_id===id);need(e&&e.frame_object_id===source.frame_id&&e.component==='raw'&&inside(e.source_rect_xyxy),'Selected raw statistics are not inside the exact saved image/frame');return {...pick(e,['object_id','request_id','manifest_sha256','statistics_sha256','input_object_id','input_manifest_sha256','frame_object_id','source_rect_xyxy','coordinate_space','component','dtype','scientific_grid_identity']),statistics:pick(e.statistics,['sample_count','mean','stddev','minimum','maximum']),intensity_unit:null};});
 const result={version:1,source:structuredClone(source),frame_index:frame.value.frame_index??null,scientific_grid_identity:operand.grid,calibration:operand.record?pick(operand.record,calKeys):null,calibration_record_sha256:operand.record?sha(operand.record):null,measurements,statistics,interpretation:'Original scalar-array records; display PNG is not scientific data. Missing physical scale, acquisition conditions and material identity remain unknown. Only explicitly selected current same-grid measurements are admitted; historical or invalidated measurements require explicit remeasurement.'};
 need(Buffer.byteLength(json(result))<=128*1024,'Selected evidence exceeds bounded disclosure budget');return result;
}
export function bindJointResearchEvidence({workspace,source,selection={}}:{workspace:string;source:HostImageReference;selection?:JointResearchSelection}):JointResearchEvidence{
 need(selection&&typeof selection==='object'&&!Array.isArray(selection)&&Object.keys(selection).every(k=>['measurement_ids','statistics_ids'].includes(k)),'Only explicit measurement/statistics selections are supported');
 const chosen={measurement_ids:ids(selection.measurement_ids),statistics_ids:ids(selection.statistics_ids)},value=projection(workspace,source,chosen),result=Object.freeze({projection:structuredClone(value),sha256:sha(value)});originals.set(result,{workspace,source:structuredClone(source),selection:chosen});return result;
}
export function recheckJointResearchEvidence(value:unknown):JointResearchEvidence{
 const original=value&&typeof value==='object'?originals.get(value):undefined;need(original,'Original provider-bound evidence required');const current=projection(original.workspace,original.source,original.selection),record=value as JointResearchEvidence;need(sha(current)===record.sha256&&sha(record.projection)===record.sha256,'Reviewed measurement/calibration evidence changed');return record;
}
