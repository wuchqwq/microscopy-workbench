// Additive input/readback contract. It authenticates neither actors nor science.
import {panelRoiHandoff} from './roi-observations.mjs';
import type {PanelRoiSnapshot} from './roi-observations.mjs';
type Row=Record<string,unknown>;
const row=(value:unknown):value is Row=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const observationPurpose='resumable_observation';
export function checkObservationNote(value:unknown,field='note'):void {
 if(typeof value!=='string')throw Error(`${field}: expected string; not_submitted; draft retained`);
 if(value.length>1000)throw Error(`${field}: actual_length=${value.length}; limit=1000 UTF-16 code units; not_submitted; no truncation; draft retained`);
}
export function checkResumableInputs(input:Row):void {
 for(const field of ['annotations','updates'])if(Array.isArray(input[field]))for(const [index,item] of (input[field] as unknown[]).entries()){
  if(!row(item))continue;
  if(item.note!==undefined)checkObservationNote(item.note,`arguments.${field}[${index}].note`);
  if(item.purpose===observationPurpose){
   const prefix=`arguments.${field}[${index}]`;
   if(typeof item.annotation_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.annotation_id))throw Error(`${prefix}.annotation_id: stable caller ID required for resumable_observation; not_submitted`);
   if(typeof item.selection_origin!=='string'||!['researcher','agent','unspecified'].includes(item.selection_origin))throw Error(`${prefix}.selection_origin: explicit researcher/agent/unspecified declaration required; caller_reported_not_authenticated; not_submitted`);
  }
 }
}
export interface ObservationExpectation {object_id:string;annotation_id:string;source_object_id:string;coordinates:readonly number[];note:string;selection_origin:string;xy_calibration?:unknown;}
export function observationReadback(state:PanelRoiSnapshot,expected:ObservationExpectation):{saved:boolean;usable:boolean;ready:boolean;reason:string} {
 const refused=(reason:string)=>({saved:false,usable:false,ready:false,reason});
 if(state.object.object_id!==expected.object_id)return refused('当前视图已改变；保存结果保留，未把旧结果当作当前观察');
 if(Object.hasOwn(expected,'xy_calibration')&&JSON.stringify(state.object.xy_calibration??null)!==JSON.stringify(expected.xy_calibration))return refused('当前标定依赖已改变；不能沿用旧观察资格');
 const marks=Array.isArray(state.object.annotations)?state.object.annotations.filter(row):[],matches=marks.filter(m=>m.annotation_id===expected.annotation_id);
 if(matches.length!==1)return refused('读回未找到唯一的稳定观察 ID');
 const mark=matches[0]!,anchor=mark.anchor;
 if(!row(anchor)||anchor.source_object_id!==expected.source_object_id||anchor.coordinate_space!=='source_pixels'||
    JSON.stringify(anchor.coordinates)!==JSON.stringify(expected.coordinates)||mark.note!==expected.note||mark.purpose!==observationPurpose||
    mark.observation_contract_version!==1||mark.selection_origin!==expected.selection_origin||mark.selection_origin_basis!=='caller_reported_not_authenticated')return refused('读回的观察身份、锚点、理由或来源声明与提交不一致');
 const packet=panelRoiHandoff(state),found=packet.saved_rectangles.filter(r=>r.annotation_id===expected.annotation_id),gate=packet.interaction_gate;
 const usable=found.length===1&&found[0]!.usable&&packet.scientific_input.usable;
 return {saved:true,usable,ready:usable&&gate.status==='ready',reason:!usable?(!packet.scientific_input.usable?packet.scientific_input.reason:found[0]?.reason??'观察未满足当前 handoff 条件'):gate.status==='ready'?'已读回当前可接续观察；不代表科学确认':`保存对象已核对，当前交接被阻止：${gate.reasons.join(', ')}`};
}
