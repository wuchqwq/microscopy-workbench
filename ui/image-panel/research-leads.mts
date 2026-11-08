// Advisory research metadata. No observation values or scientific state are
// stored here. Every numeric display must resolve these exact references.
import {readResearchQuestion} from './research-question.mjs';
import type {ResearchQuestion} from './research-question.mjs';
export interface StatisticsReference {result_id:string;request_id:string;input_view_id:string;frame_id:string;manifest_sha256:string;input_manifest_sha256:string;statistics_sha256:string;}
export interface LeadEvidence {relation:'supports'|'opposes'|'unknown';note:string;reference:StatisticsReference;}
export interface LeadDraft {lead_id:string;question:ResearchQuestion;proposed_by:'researcher'|'agent';hypothesis:string;evidence:LeadEvidence[];unknowns:string;next_step:string;}
export interface ResearchLead extends LeadDraft {created_utc:string;withdrawn_utc?:string;withdrawal_note?:string;}
export interface ResearchLeads {version:1;entries:ResearchLead[];}
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid research lead record');return v as Row;};
const keys=(v:Row,allowed:string[],required=allowed)=>{if(Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))throw Error('Unexpected research lead fields');};
const text=(v:unknown,max:number,empty=false):string=>{if(typeof v!=='string'||v.length>max||!empty&&!v.trim())throw Error('Missing or oversized research lead text');return v;};
const id=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{32}$/.test(v))throw Error('Exact research reference ID required');return v;};
const hash=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw Error('Exact research reference SHA-256 required');return v;};
const utc=(v:unknown):string=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)throw Error('Exact research timestamp required');return v;};
export function sameResearchValue(a:unknown,b:unknown):boolean {
 const sorted=(_k:string,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,(v as Row)[k]])):v;
 return JSON.stringify(a,sorted)===JSON.stringify(b,sorted);
}
export function statisticsReference(value:unknown):StatisticsReference {
 const v=row(value);keys(v,['result_id','request_id','input_view_id','frame_id','manifest_sha256','input_manifest_sha256','statistics_sha256']);
 const request=text(v.request_id,64);if(!/^[A-Za-z0-9_-]+$/.test(request))throw Error('Exact original statistics request required');
 return {result_id:id(v.result_id),request_id:request,input_view_id:id(v.input_view_id),frame_id:id(v.frame_id),manifest_sha256:hash(v.manifest_sha256),input_manifest_sha256:hash(v.input_manifest_sha256),statistics_sha256:hash(v.statistics_sha256)};
}
export function referenceFromStatistics(raw:unknown):StatisticsReference {
 const e=row(raw);return statisticsReference({result_id:e.object_id,request_id:e.request_id,input_view_id:e.input_object_id,frame_id:e.frame_object_id,manifest_sha256:e.manifest_sha256,input_manifest_sha256:e.input_manifest_sha256,statistics_sha256:e.statistics_sha256});
}
const draftFields=['lead_id','question','proposed_by','hypothesis','evidence','unknowns','next_step'];
export function readLeadDraft(value:unknown):LeadDraft {
 const v=row(value);keys(v,draftFields);const question=readResearchQuestion(v.question);if(!question)throw Error('An explicitly applied research question is required');
 if(!['researcher','agent'].includes(String(v.proposed_by))||!Array.isArray(v.evidence)||v.evidence.length<1||v.evidence.length>8)throw Error('Declare proposer and select 1..8 saved statistics');
 const seen=new Set<string>(),evidence=v.evidence.map(raw=>{const e=row(raw);keys(e,['relation','note','reference']);if(!['supports','opposes','unknown'].includes(String(e.relation)))throw Error('Choose an explicit evidence relation');const reference=statisticsReference(e.reference);if(reference.frame_id!==question.frame_object_id||seen.has(reference.result_id))throw Error('Cross-frame or duplicate evidence is not admissible');seen.add(reference.result_id);return {relation:e.relation as LeadEvidence['relation'],note:text(e.note,1000),reference};});
 return {lead_id:id(v.lead_id),question,proposed_by:v.proposed_by as LeadDraft['proposed_by'],hypothesis:text(v.hypothesis,2000),evidence,unknowns:text(v.unknowns,2000,true),next_step:text(v.next_step,2000)};
}
export function readResearchLeads(value:unknown):ResearchLeads|undefined {
 if(value===undefined)return undefined;const v=row(value);keys(v,['version','entries']);if(v.version!==1||!Array.isArray(v.entries)||v.entries.length>16)throw Error('Invalid bounded research lead history');
 const seen=new Set<string>(),entries=v.entries.map(raw=>{const e=row(raw);keys(e,[...draftFields,'created_utc','withdrawn_utc','withdrawal_note'],[...draftFields,'created_utc']);const draft=readLeadDraft(Object.fromEntries(draftFields.map(k=>[k,e[k]])));if(seen.has(draft.lead_id))throw Error('Duplicate research lead identity');seen.add(draft.lead_id);const created_utc=utc(e.created_utc);
  if((e.withdrawn_utc===undefined)!==(e.withdrawal_note===undefined))throw Error('Incomplete lead withdrawal');
  return {...draft,created_utc,...(e.withdrawn_utc===undefined?{}:{withdrawn_utc:utc(e.withdrawn_utc),withdrawal_note:text(e.withdrawal_note,1000)})};
 });return {version:1,entries};
}
