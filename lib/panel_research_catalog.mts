// Rebuildable, read-only menu over original provider journals. A menu entry
// is not new science, an AnalysisWorkspace adoption, or an interpretation.
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {readImageProviderRecords} from './image_measurement_records.mjs';

type Row=Record<string,unknown>;
export const PANEL_RESEARCH_CATALOG_KINDS=['gpa','method_plan','discovery','discovery_review','statistics','profile'] as const;
export type PanelResearchCatalogKind=typeof PANEL_RESEARCH_CATALOG_KINDS[number];
export interface PanelResearchCatalogRecord {
 object_id:string;request_id:string;kind:PanelResearchCatalogKind;manifest_sha256:string;label:string;record:Row;
}
export interface PanelResearchCatalogUnavailable {request_id?:string;object_id?:string;reason:string;code:string;}
export interface PanelResearchCatalog {
 schema_version:1;read_only:true;science_dispatched:false;records:PanelResearchCatalogRecord[];
 unavailable:PanelResearchCatalogUnavailable[];request_count:number;candidate_count:number;
 limits:{requests:8192;candidates:256};complete:boolean;
}
const OBJECT=/^[a-f0-9]{32}$/,REQUEST=/^[A-Za-z0-9_-]{1,64}$/;
const row=(value:unknown):value is Row=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=(value:unknown)=>JSON.stringify(value,(_key,v:unknown)=>row(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const kind=(value:unknown):value is PanelResearchCatalogKind=>PANEL_RESEARCH_CATALOG_KINDS.includes(value as PanelResearchCatalogKind);
function failure(message:string,code='RESEARCH_CATALOG_UNAVAILABLE'):never{throw Object.assign(new Error(message),{code});}
const labels:Record<PanelResearchCatalogKind,string>={gpa:'保存频带（需核对适用条件）',method_plan:'保存频带比较／方法记录',discovery:'保存观察候选',discovery_review:'保存预期位置／候选复核',statistics:'保存原数组统计',profile:'保存原数组剖线'};
function qualifiedProviderValue(value:unknown):Row {
 if(!row(value))failure('Provider read did not return a complete object record');
 if(value.ok!==undefined&&value.ok!==true||value.state!=='completed')failure('Provider read is not a completed successful original object');
 const {ok,state,gpa_analytic_read_validation,peak_summary_read_validation,...record}=value;
 void ok;void state;
 for(const receipt of [gpa_analytic_read_validation,peak_summary_read_validation])if(receipt!==undefined&&(!row(receipt)||receipt.saved_records_modified!==false||receipt.science_recomputed!==false&&receipt.science_dispatched!==false))failure('Provider read compatibility receipt is not explicitly read-only');
 return record;
}

/** readObject must call only existing image_info and return its unprojected data (state completed; ok is omitted by the formal adapter).
 * No tool writes, journal creation, arrays or independent numerical validation.
 * Every available entry binds the original journal, original manifest hash and
 * a fresh provider read. Missing/corrupt/unsupported entries remain unavailable.
 */
export async function listPanelResearchCatalog(workspace:string,readObject:(objectId:string)=>Promise<unknown>|unknown):Promise<PanelResearchCatalog>{
 const result:PanelResearchCatalog={schema_version:1,read_only:true,science_dispatched:false,records:[],unavailable:[],request_count:0,candidate_count:0,limits:{requests:8192,candidates:256},complete:true};
 const unavailable=(error:unknown,identity:{request_id?:string;object_id?:string}={})=>{const e=error as {message?:unknown;code?:unknown};result.unavailable.push({...identity,reason:String(e?.message??error).slice(0,512),code:typeof e?.code==='string'?e.code:'RESEARCH_CATALOG_UNAVAILABLE'});result.complete=false;};
 let reader:ReturnType<typeof readImageProviderRecords>,entries:string[];
 try{
  reader=readImageProviderRecords(workspace);
  const files=readdirSync(path.join(reader.root,'requests'),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
  result.request_count=files.length;
  if(files.length>8192)failure('Research catalog exceeds 8192 request entries; no partial menu was qualified','BUDGET_EXCEEDED');
  // Keep ordinary filenames only. The provider reader performs size, path,
  // symlink, byte-budget, journal and manifest validation before admission.
  entries=files.map(file=>file.name);
  for(const file of files)if(!file.isFile()||file.isSymbolicLink()||!file.name.endsWith('.json')||!REQUEST.test(file.name.slice(0,-5)))failure('Unexpected linked or invalid request entry in research catalog');
 }catch(error){unavailable(error);return result;}
 const seen=new Set<string>();
 for(const filename of entries){
  const request_id=filename.slice(0,-5);let object_id:string|undefined;
  try{
   const journal=reader.json(path.join(reader.root,'requests',filename)).value;
   if(journal.state!=='completed'&&row(journal.parameters)&&kind(journal.parameters.action))failure('Original research request is '+String(journal.state??'unknown')+'; query its original request before any retry','ORIGINAL_REQUEST_NOT_COMPLETED');
   if(journal.state!=='completed'||!row(journal.response)||!kind(journal.response.kind))continue;
   object_id=typeof journal.response.object_id==='string'?journal.response.object_id:undefined;
   if(!object_id||!OBJECT.test(object_id))failure('Completed candidate has no exact object identity');
   if(seen.has(object_id))failure('Multiple original requests claim the same research object');
   seen.add(object_id);result.candidate_count++;
   if(result.candidate_count>256)failure('Research catalog exceeds 256 candidates; remaining entries are not qualified','BUDGET_EXCEEDED');
   const saved=reader.object(object_id);
   if(saved.value.request_id!==request_id||!kind(saved.value.kind))failure('Candidate request, kind and original object disagree');
   if('gpa_analytic_read_validation' in saved.value||'peak_summary_read_validation' in saved.value)failure('A persisted read receipt cannot qualify a catalog entry');
   const admitted=qualifiedProviderValue(await readObject(object_id));
   if(!same(admitted,saved.value))failure('Provider read differs from the exact original saved manifest');
   const after=readImageProviderRecords(workspace).object(object_id);
   if(after.manifest_sha256!==saved.manifest_sha256||!same(after.value,saved.value))failure('Original research record changed during provider read');
   const valueKind=saved.value.kind as PanelResearchCatalogKind,created=typeof saved.value.created_utc==='string'?saved.value.created_utc:'';
   result.records.push({object_id,request_id,kind:valueKind,manifest_sha256:saved.manifest_sha256,label:labels[valueKind]+(created?' · '+created:'')+' · '+String(result.records.length+1),record:structuredClone(saved.value)});
  }catch(error){unavailable(error,{request_id,...(object_id?{object_id}:{})});if(result.candidate_count>256)break;}
 }
 return result;
}
