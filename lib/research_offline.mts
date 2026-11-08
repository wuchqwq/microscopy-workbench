// Bounded whitelist over existing immutable readers; never a model client.
import {createHash} from 'node:crypto';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import {readImageStatisticsHistory} from './image_statistics_history.mjs';
import {readResearchQuestion} from '../ui/image-panel/research-question.mjs';
import {referenceFromStatistics,sameResearchValue} from '../ui/image-panel/research-leads.mjs';
import {readOfflineBinding,readOfflineLease,OFFLINE_WARNING} from '../ui/image-panel/offline-research.mjs';
import type {OfflineBinding} from '../ui/image-panel/offline-research.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).digest('hex');
export function offlineLease(raw:unknown){const s=row(raw);return readOfflineLease({panel_id:s.panel_id,session_id:s.research_lead_session_id,helper_id:s.helper_session_id??null,generation:s.panel_generation??0,state:s.state_revision,draft:row(s.edit_state).draft_revision,collection:row(s.window_collection).revision,working:row(s.workspace_analysis).working_revision});}
export function offlineContext(workspace:string,raw:unknown,contextId:string,original?:OfflineBinding){
 const s=row(raw);
 const q=readResearchQuestion(s.research_question),view=row(s.object),frame=row(s.frame_identity).frame_object_id;if(!q||q.frame_object_id!==frame)throw Error('Apply a same-frame question before offline review');
 // Limited refusal patterns only; other free text is preserved verbatim.
 // This is not a complete path/secret detector or an external-send approval.
 if(/(?:https?:\/\/|[A-Za-z]:[\\/]|\\\\|(?:^|\s)\/(?:Users|home|tmp|mnt|workspace)\/)/i.test(q.text))throw Error('Question matches a limited URL or local path pattern; explicitly review/edit the retained input. Checks are incomplete; no external delivery');
 const r=readImageProviderRecords(workspace),saved=r.object(view.object_id),source=r.object(frame),history=readImageStatisticsHistory({workspace,objectId:String(view.object_id),limit:512});r.verifyArray(String(r.operand(view.object_id).value.object_id));
 const refs=original?original.references:history.entries.slice(-8).map(referenceFromStatistics),entries=refs.map(ref=>{const e=history.entries.find(e=>sameResearchValue(referenceFromStatistics(e),ref));if(!e)throw Error('Original offline evidence reference is unavailable');return e;});
 const selected=row(s.selection),scope={question:q,view_id:view.object_id,view_sha256:saved.manifest_sha256,frame_id:frame,frame_sha256:source.manifest_sha256,question_context_sha256:r.object(q.context_object_id).manifest_sha256,selection:s.selection?{source_object_id:selected.source_object_id,coordinate_space:selected.coordinate_space,kind:selected.kind,coordinates:selected.coordinates}:null,proofs:row(s.source_proofs).references??[],windows:(Array.isArray(row(s.window_collection).windows)?row(s.window_collection).windows as Row[]:[]).map(w=>({window_id:w.window_id,object_id:w.object_id,source_reference:w.source_reference??null,latest_observation_view_object_id:w.latest_observation_view_object_id??null}))};
 const binding=readOfflineBinding({context_id:contextId,question:q,view_id:view.object_id,view_sha256:saved.manifest_sha256,question_context_sha256:r.object(q.context_object_id).manifest_sha256,frame_id:frame,frame_sha256:source.manifest_sha256,scope_sha256:digest(scope),references:refs,lease:offlineLease(s)});
 if(original&&!sameResearchValue({...original,lease:binding.lease},binding))throw Error('Original question/source/ROI/processing context changed; no automatic rebinding');
 const processing=(id:string)=>{const o=r.object(id);return {view_id:id,manifest_sha256:o.manifest_sha256,kind:o.value.kind,request_id:o.value.request_id,parent_id:o.value.parent_object_id??null};};
 const packet={version:1,kind:'offline_research_context',notice:OFFLINE_WARNING,delivery:'local_only_no_model_call',binding,processing:processing(String(view.object_id)),observations:entries.map(e=>({reference:referenceFromStatistics(e),source_rect_xyxy:e.source_rect_xyxy,coordinate_space:'source_pixels',component:typeof e.component==='string'&&/^(raw|real|imag|amplitude|power)$/.test(e.component)?e.component:'undeclared',dtype:typeof e.dtype==='string'&&/^[a-zA-Z0-9<>|]{1,20}$/.test(e.dtype)?e.dtype:'undeclared',intensity_unit:null,statistics:Object.fromEntries(['sample_count','mean','stddev','minimum','maximum'].map(k=>[k,row(e.statistics)[k]])),input:processing(String(e.input_object_id))}))};
 if(Buffer.byteLength(JSON.stringify(packet))>48*1024)throw Error('Offline context exceeds 48 KiB budget');return packet;
}
