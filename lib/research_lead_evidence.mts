import {readImageStatisticsHistory} from './image_statistics_history.mjs';
import {referenceFromStatistics,sameResearchValue} from '../ui/image-panel/research-leads.mjs';
import type {LeadDraft,ResearchLeads} from '../ui/image-panel/research-leads.mjs';
import type {ResearchQuestion} from '../ui/image-panel/research-question.mjs';
export function validateLeadEvidence(workspace:string,draft:LeadDraft){
 const history=readImageStatisticsHistory({workspace,objectId:draft.question.context_object_id,limit:512});
 if(history.frame_object_id!==draft.question.frame_object_id)throw Error('Question context no longer qualifies its exact frame');
 for(const evidence of draft.evidence){const entry=history.entries.find(e=>e.object_id===evidence.reference.result_id);if(!entry||!sameResearchValue(referenceFromStatistics(entry),evidence.reference))throw Error('Saved statistics reference is missing, changed or belongs to another exact input');}
}
// Failure is visible advisory state, never a replacement observation. Advisory
// IDs deliberately use result_id/input_view_id: explicit expected hashes below
// qualify them on every read, independently of strict workspace scientific refs.
export function resolveResearchLeads(workspace:string,leads:ResearchLeads|undefined,question:ResearchQuestion|undefined){
 const checked=new Map<string,{entries:Record<string,unknown>[];error:string|null}>();
 return (leads?.entries??[]).map(record=>{
  let entries:Record<string,unknown>[]=[],error:string|null=null;
  const key=record.question.context_object_id+':'+record.question.frame_object_id;const cached=checked.get(key);if(cached){entries=cached.entries;error=cached.error;}else{try{const history=readImageStatisticsHistory({workspace,objectId:record.question.context_object_id,limit:512});if(history.frame_object_id!==record.question.frame_object_id)throw Error('Question context/frame mismatch');entries=history.entries;}catch(e){error=(e as Error).message;}checked.set(key,{entries,error});}
  return {record,currentness:sameResearchValue(record.question,question)?'current_question':'historical_question',meaning:'proposed_relation_not_scientific_validation',next_step_status:'planned_not_executed',evidence:record.evidence.map(e=>{
   const found=entries.find(entry=>entry.object_id===e.reference.result_id);
   let verified=false;try{verified=Boolean(found&&sameResearchValue(referenceFromStatistics(found),e.reference));}catch{/* Never qualify an incomplete reference. */}
   return {...e,validation:verified?'verified_saved_reference':'unavailable',reason:verified?null:error??'Exact saved result/input/request/hash reference cannot be verified',observation:verified?found:null};
  })};
 });
}
