// Bounded text projection of existing science tools. Never forwards provider
// content, paths, pixel samples, PNGs, data URLs or arbitrary metadata.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import {readImageStatisticsHistory} from './image_statistics_history.mjs';
import {readStatisticsDisplays} from './image_statistics_display.mjs';
import {ImageWorkerDiagnosticError} from './image_workspace.mjs';
import type {ToolRegistryPort,ToolDefinition} from './runtime/contracts.mjs';
export interface TextToolCall {threadId:string;turnId:string;callId:string;tool:string;arguments:unknown;}
export interface TextToolReply {success:boolean;text:string;}
export interface TextToolPort {definitions:readonly ToolDefinition[];call(input:TextToolCall,signal:AbortSignal):Promise<TextToolReply>;}
type Row=Record<string,unknown>;
export interface SavedResearchToolBinding {readonly port:TextToolPort;readonly source:Readonly<Row>;readonly scope:Readonly<Row>;readonly context_sha256:string;readonly assertCurrent:()=>void;}
const savedBindings=new WeakMap<object,SavedResearchToolBinding>();
export function readSavedResearchToolBinding(value:unknown):SavedResearchToolBinding {
 const binding=typeof value==='object'&&value!==null?savedBindings.get(value):undefined;
 if(!binding)throw Error('Original saved-view tool identity required');return binding;
}
const row=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const canonical=(v:unknown)=>JSON.stringify(v,(_key,value)=>row(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
interface ResearchToolOptions {registry:ToolRegistryPort;workspace:string;frameId:string;viewId?:string;journalDirectory:string;}
export function createResearchTextTools(options:ResearchToolOptions){return createBoundResearchTools(options,false);}
// Local scientific port only. No host, image preparation, disclosure approval or
// product entry is created. Existing public text admission stays full-frame.
export function createSavedViewResearchTools(options:ResearchToolOptions&{viewId:string}){
 need(typeof options.viewId==='string','Explicit saved view required; no raw-frame fallback');
 return createBoundResearchTools(options,true);
}
function createBoundResearchTools({registry,workspace,frameId,viewId,journalDirectory}:ResearchToolOptions,savedSpatial:boolean){
 need(path.isAbsolute(journalDirectory),'Explicit local tool-audit directory required');
 const reader=readImageProviderRecords(workspace),frame=reader.object(frameId);reader.verifyArray(frameId);
 need(frame.value.kind==='frame'&&frame.value.array_domain!=='frequency'&&typeof frame.value.dtype==='string'&&['uint16','float32'].includes(frame.value.dtype)&&Array.isArray(frame.value.shape_yx)&&frame.value.shape_yx.length===2&&frame.value.shape_yx.every(n=>Number.isSafeInteger(n)&&n>0),'Explicit scalar spatial frame required');
 if(savedSpatial)need(frame.value.array_domain===undefined||frame.value.array_domain==='spatial'||frame.value.array_domain==='unspecified_image','Source frame declares a non-spatial or unknown domain');
 // A desktop session supplies its explicit saved display. Standalone text-only
 // sessions retain frame-only provenance rather than inventing a display.
 function savedView(r:ReturnType<typeof readImageProviderRecords>){
  const saved=r.object(viewId!),v=saved.value,operand=r.operand(viewId!),panels=v.panels as Row[]|undefined,p=panels?.length===1?panels[0]:null;
  need(v.kind==='view'&&operand.value.object_id===viewId&&operand.lineage.frames.length===1&&operand.lineage.frames[0]!.object_id===frameId,'Exact saved single-frame view required');
  // Provider previews of an undeclared image use unspecified_image even
  // when source-pixel mapping and a user-stated scale are explicit. Admit
  // only that exact label; do not reinterpret it as a physical-domain claim.
  need((v.array_domain===undefined||v.array_domain==='spatial'||v.array_domain==='unspecified_image')&&p?.domain==='spatial_pixels'&&p.source_object_id===frameId&&operand.grid?.coordinate_space==='source_pixels'&&operand.grid.source_grid_object_id===frameId,'Saved view is not the selected spatial source grid');
  need((v.annotations===undefined||Array.isArray(v.annotations)&&v.annotations.length===0)&&(v.annotation_reprojection===undefined||v.annotation_reprojection===false),'Saved view contains annotations or reprojection; no implicit clean render');
  const bounds=p.source_rect_xyxy,shape=v.shape_yx,full=frame.value.shape_yx as number[];
  need(Array.isArray(bounds)&&bounds.length===4&&bounds.every(n=>Number.isSafeInteger(n)&&n>=0)&&bounds[0]<bounds[2]&&bounds[1]<bounds[3]&&bounds[2]<=full[1]&&bounds[3]<=full[0]&&Array.isArray(shape)&&shape.length===2&&shape[0]===bounds[3]-bounds[1]&&shape[1]===bounds[2]-bounds[0]&&v.dtype===frame.value.dtype,'Saved view source bounds/shape/dtype differ from the frame');
  r.verifyArray(viewId!);return {saved,bounds:[...bounds] as number[]};
 }
 const local=savedSpatial?savedView(reader):null;
 const inputId=viewId??frameId,input=local?.saved??(viewId?readStatisticsDisplays(reader).fullFramePreview(frameId,viewId):frame);
 const bounds=local?Object.freeze(local.bounds):null;
 const within=(rect:unknown):rect is number[]=>Array.isArray(rect)&&rect.length===4&&rect.every(Number.isSafeInteger)&&Boolean(bounds)&&rect[0]>=bounds![0]&&rect[1]>=bounds![1]&&rect[0]<rect[2]&&rect[1]<rect[3]&&rect[2]<=bounds![2]&&rect[3]<=bounds![3];
 const source={frame_id:frameId,manifest_sha256:frame.manifest_sha256,array_sha256:(frame.value.files_sha256 as Row)['data.npy'],shape_yx:frame.value.shape_yx,dtype:frame.value.dtype};
 if(savedSpatial){Object.freeze(source.shape_yx);Object.freeze(source);}
 const catalog=registry.listTools(),stats=catalog.find(t=>t.name==='image_statistics'),result=catalog.find(t=>t.name==='image_result');need(stats&&result,'Existing statistics/result tools required');
 const inputSchema:ToolDefinition['inputSchema']={...structuredClone(stats.inputSchema),properties:{...Object.fromEntries(Object.entries(stats.inputSchema.properties).filter(([k])=>k==='rect')),object_id:{type:'string',enum:[inputId]}},required:['object_id']};
 const description=bounds?`Local saved-view original-array statistics only. Source-pixel half-open rect must stay inside ${JSON.stringify(bounds)}; omit rect for that complete saved support. These are source coordinates, never PNG or crop-relative coordinates. This tool returns numbers, never images. Visual observations use any separately approved PNG attached to the turn; creating this local port does not approve image disclosure.`:'Compute saved original-array ROI statistics on the selected public synthetic frame. Choose a half-open pixel rect to check the question; no image is returned. Request IDs are assigned before execution.';
 const definitions:ToolDefinition[]=[{name:stats.name,description,inputSchema},{name:result.name,description:'Query only a text_tool_ request ID returned by this research session; never reruns science. The attachment original_request_id predates this session and cannot be queried here. A refused query says nothing about whether that earlier request completed.',inputSchema:{type:'object',properties:{request_id:{type:'string',pattern:'^text_tool_[a-f0-9]{32}$'}},required:['request_id'],additionalProperties:false}}];
 if(savedSpatial){const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};freeze(definitions);}
 // Immutable canonical request bytes are captured before handing any argument
 // arrays to a provider. A callback cannot mutate the expected identity.
 const seen=new Map<string,{signature:string;promise:Promise<TextToolReply>}>(),requests=new Map<string,string>(),unresolved=new Set<string>(),audit:Row[]=[];
 const reply=(value:unknown,success=true)=>({success,text:JSON.stringify(value)});
 function persist(entry:Row){audit.push(structuredClone(entry));writeFileSync(path.join(journalDirectory,'tool-audit.json'),JSON.stringify(audit,null,2)+'\n');}
 function current(){const r=readImageProviderRecords(workspace),f=r.object(frameId);need(f.manifest_sha256===source.manifest_sha256,'Source changed');r.verifyArray(frameId);if(viewId){const v=savedSpatial?savedView(r).saved:readStatisticsDisplays(r).fullFramePreview(frameId,viewId);need(v.manifest_sha256===input.manifest_sha256,'Saved display changed');}}
 function failedProjection(request_id:string,error:unknown){
  need(error instanceof ImageWorkerDiagnosticError,'Provider original-result receipt required');const d=error.diagnostic,j=d.original_failure,expected=requests.get(request_id);
  need(d.provider==='external-image-workspace'&&d.request_id===request_id&&d.provider_reported_state==='failed'&&d.submission_state==='provider_reported_failure'&&row(j)&&expected&&j.schema_version===1&&j.request_id===request_id&&typeof j.journal_sha256==='string'&&/^[a-f0-9]{64}$/.test(j.journal_sha256),'Original failed request is not verified');
  need(canonical(j.parameters)===expected&&j.parameters_sha256===createHash('sha256').update(expected).digest('hex'),'Original failed parameters differ');
  const code=j.error_code==='INVALID_ARGUMENT'?'INVALID_ARGUMENT':j.error_code==='BUDGET_EXCEEDED'?'BUDGET_EXCEEDED':'PROVIDER_FAILURE';
  return {status:'failed',request_id,frame_id:frameId,error:{code,message:code==='INVALID_ARGUMENT'?'Provider rejected the original arguments; check pixel ROI bounds and ordering.':code==='BUDGET_EXCEEDED'?'Provider rejected the original request budget.':'Provider recorded a terminal failure of the original request.'},journal_sha256:j.journal_sha256,automatic_retry:false,meaning:'Original request definitively failed. A corrected request may use a new identity; the failed request is never replayed.'};
 }
 function projection(request_id:string){
  const history=readImageStatisticsHistory({workspace,objectId:frameId,limit:512}),saved=history.entries.find(e=>e.request_id===request_id);need(saved,'Saved statistics unavailable');need(saved.input_object_id===inputId&&saved.input_manifest_sha256===input.manifest_sha256,'Saved statistics input differs from the frozen display/frame');
  const expected=requests.get(request_id),original=readImageProviderRecords(workspace).object(saved.object_id);
  need(expected!==undefined&&original.value.request_id===request_id&&original.manifest_sha256===saved.manifest_sha256&&canonical(original.parameters)===expected,'Original successful parameters differ from the frozen request');
  if(bounds)need(within(saved.source_rect_xyxy),'Saved statistics fall outside the bound source support');
  const s=saved.statistics as Row;need(['sample_count','mean','stddev','minimum','maximum'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k])),'Invalid statistics projection');
  return {status:'completed',request_id,object_id:saved.object_id,input_object_id:saved.input_object_id,frame_id:frameId,manifest_sha256:saved.manifest_sha256,input_manifest_sha256:saved.input_manifest_sha256,statistics_sha256:saved.statistics_sha256,source_rect_xyxy:saved.source_rect_xyxy,statistics:Object.fromEntries(['sample_count','mean','stddev','minimum','maximum'].map(k=>[k,s[k]])),meaning:'Original-array statistics; pixel coordinates; intensity unit and material interpretation unknown. Same-frame ROIs are not independent experiments.'};
 }
 async function execute(call:TextToolCall,signal:AbortSignal):Promise<TextToolReply>{
  let request_id:string|undefined;
  try{
   need(!signal.aborted,'Cancelled');current();need(row(call.arguments),'Object arguments required');const a=call.arguments;
   if(call.tool==='image_result'){
    if(Object.keys(a).join()==='request_id'&&typeof a.request_id==='string'&&!requests.has(a.request_id)){
     const output={status:'not_dispatched',code:'QUERY_OUTSIDE_SESSION',queried_request_outcome:'not_checked',automatic_retry:false,meaning:'This query was not dispatched because its request ID is outside this research session. This does NOT mean the original request failed, was not dispatched, or is missing; its state was not checked. Query only text_tool_ IDs returned by this session; use the workbench source/history view for earlier records.'};
     persist({phase:'refused_or_unverified',threadId:call.threadId,turnId:call.turnId,callId:call.callId,tool:call.tool,...output});return reply(output,false);
    }
    need(Object.keys(a).join() ==='request_id'&&typeof a.request_id==='string'&&requests.has(a.request_id),'Own original request required');request_id=a.request_id;
    await registry.call('image_result',{request_id},{signal});const output=projection(request_id);unresolved.delete(request_id);persist({phase:'query_completed',...call,request_id,output});return reply(output);
   }
   need(call.tool==='image_statistics'&&Object.keys(a).every(k=>['object_id','rect'].includes(k))&&a.object_id===inputId,'Only the selected saved input statistics are supported');
   if(a.rect!==undefined)need(Array.isArray(a.rect)&&a.rect.length===4&&a.rect.every(Number.isSafeInteger),'Integer pixel rect required');
   if(bounds&&a.rect!==undefined)need(within(a.rect),'Requested ROI is outside the bound saved view; no clipping or coordinate translation');
   need(unresolved.size===0&&requests.size<16,'Resolve original outcome before another write');request_id='text_tool_'+sha([call.threadId,call.turnId,call.callId]).slice(0,32);need(!requests.has(request_id),'Original request cannot be resubmitted');requests.set(request_id,canonical({...a,request_id,action:'statistics',workspace:reader.root}));unresolved.add(request_id);
   // Local identity record precedes scientific submission. Errors never trigger a
   // replacement request; query the original request instead.
   persist({phase:'before_dispatch',...call,request_id});
   await registry.call(call.tool,structuredClone({...a,request_id}),{signal});current();const output=projection(request_id);unresolved.delete(request_id);persist({phase:'completed',...call,request_id,output});return reply(output);
  }catch(error){
   if(request_id){
    // A later query can discover that a previously accepted record no longer
    // matches. Re-establish the fence; only exact success/verified failure clears it.
    unresolved.add(request_id);
    let checked=error;if(call.tool!=='image_result')try{await registry.call('image_result',{request_id},{signal});checked=undefined;}catch(original){checked=original;}
    let failed:ReturnType<typeof failedProjection>|undefined;try{failed=failedProjection(request_id,checked);}catch{/* Missing, pending, mismatched or unreadable originals stay unresolved. */}
    if(failed){unresolved.delete(request_id);persist({phase:'verified_failed',threadId:call.threadId,turnId:call.turnId,callId:call.callId,tool:call.tool,request_id,output:failed});return reply(failed,false);}
   }
   const output={status:request_id?'unverified_outcome':'not_dispatched',...(request_id?{request_id}:{}),...(!request_id&&unresolved.size?{original_request_id:[...unresolved][0]}:{}),automatic_retry:false,meaning:'Use the original request query; no replacement scientific request is submitted.'};
   persist({phase:'refused_or_unverified',threadId:call.threadId,turnId:call.turnId,callId:call.callId,tool:call.tool,...output});return reply(output,false);
  }
 }
 const port:TextToolPort={definitions,call(call,signal){
  const key=JSON.stringify([call.threadId,call.turnId,call.callId]),signature=JSON.stringify([call.tool,call.arguments]),prior=seen.get(key);
  if(prior)return prior.signature===signature?prior.promise:Promise.resolve(reply({status:'conflicting_call_identity',automatic_retry:false},false));
  if(seen.size>=32)return Promise.resolve(reply({status:'call_budget_exhausted'},false));
  const copy=structuredClone(call),promise=Promise.resolve().then(()=>execute(copy,signal));seen.set(key,{signature,promise});return promise;
 }};
 if(savedSpatial)Object.freeze(port);
 const inputScope=bounds?Object.freeze({mode:'local_saved_view_tools' as const,input_view_id:inputId,input_manifest_sha256:input.manifest_sha256,frame_id:frameId,coordinate_space:'source_pixels' as const,source_rect_xyxy:bounds,disclosure_approved:false as const}):undefined;
 const bindingResult={port,source,...(inputScope?{input_scope:inputScope}:{}),context_sha256:sha(inputScope?{source,input_scope:inputScope,tools:definitions}:viewId?{source,input_view_id:viewId,input_manifest_sha256:input.manifest_sha256}:source),audit:()=>structuredClone(audit)};
 if(inputScope){Object.freeze(bindingResult);savedBindings.set(bindingResult,Object.freeze({port,source,scope:inputScope,context_sha256:bindingResult.context_sha256,assertCurrent:current}));}return bindingResult;
}
