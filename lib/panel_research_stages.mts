// Durable orchestration receipts over existing tools. These are not science
// objects or evidence qualification. Unknown writes are recovered by original ID.
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {imageAdmissionFailureFromError,readImageAdmissionFailure,readImageOriginalFailure} from './runtime/image_admission_failure.mjs';
import type {ImageAdmissionFailure} from './runtime/image_admission_failure.mjs';
type Row=Record<string,unknown>;
export type ResearchStageState='not_submitted'|'submitted'|'completed'|'failed'|'unknown';
export interface ResearchStage {name:string;request_id:string;state:ResearchStageState;tool:string|null;arguments:Row|null;object_id:string|null;attempts:number;reason:string|null;admission_failure:ImageAdmissionFailure|null;}
export interface ResearchStudy {schema_version:1;kind:'panel_research_stages_v1';study_id:string;input:Row;input_sha256:string;stage_names:string[];request_ids:Record<string,string>;identity_sha256:string;created_utc:string;updated_utc:string;revision:number;stages:ResearchStage[];}
export interface ResearchStageOutput {object_id:string;request_id:string;}
export interface ResearchStageCall {tool:string;arguments:Row;}
export interface ResearchStageCallbacks {
 resolve:(name:string,outputs:Record<string,ResearchStageOutput>,input:Row)=>ResearchStageCall|Promise<ResearchStageCall>;
 dispatch:(tool:string,args:Row,name:string)=>unknown|Promise<unknown>;
 query:(requestId:string,name:string)=>unknown|Promise<unknown>;
}
export type ResearchStagesPhase='complete'|'paused'|'stopped_not_submitted'|'stopped_unknown'|'stopped_failed'|'admission_not_submitted'|'query_completed_resume_required';
export interface ResearchStagesResult {phase:ResearchStagesPhase;record:ResearchStudy;stage_name:string|null;request_id:string|null;reason:string|null;}
const MAX_BYTES=2*1024*1024,MAX_STUDIES=256,active=new Set<string>();
const ID=/^[A-Za-z0-9_-]{1,64}$/,OBJECT=/^[a-f0-9]{32}$/,SHA=/^[a-f0-9]{64}$/;
function fail(message:string):never {throw Object.assign(new Error('Research stages: '+message),{code:'RESEARCH_STAGES_UNAVAILABLE'});}
const isRow=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const row=(v:unknown):Row=>isRow(v)?v:fail('ordinary JSON object required');
function checkJson(value:unknown,depth=0,budget={nodes:0}):void {
 if(++budget.nodes>100000||depth>32)fail('metadata exceeds bounded JSON depth/nodes');
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))fail('non-finite metadata is not retained');return;}
 if(Array.isArray(value)){for(const item of value)checkJson(item,depth+1,budget);return;}
 if(isRow(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){for(const item of Object.values(value))checkJson(item,depth+1,budget);return;}
 fail('metadata cannot contain undefined, functions, classes or implicit values');
}
const canonical=(value:unknown)=>JSON.stringify(value,(_key,v)=>isRow(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const clone=<T,>(v:T):T=>structuredClone(v);
const ident=(id:unknown)=>{if(typeof id!=='string'||!ID.test(id))fail('safe explicit study/request identity required');return id as string;};
const sourceIdentity=(study:Pick<ResearchStudy,'study_id'|'input'|'stage_names'|'request_ids'>)=>({schema_version:1,study_id:study.study_id,input:study.input,stage_names:study.stage_names,request_ids:study.request_ids});
const stageRequest=(identity:string,name:string,index:number)=>'research-'+hash({identity,name,index}).slice(0,48);
const now=()=>new Date().toISOString();
const reason=(value:unknown)=>String(value instanceof Error?value.message:isRow(value)&&isRow(value.error)?value.error.message??value.error.code??'Original request not completed':value).slice(0,1024);
function syncDirectory(directory:string){const fd=openSync(directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function ordinary(directory:string){const entry=lstatSync(directory);if(entry.isSymbolicLink()||!entry.isDirectory())fail('linked or non-directory study location');}
function readBounded(file:string){const entry=lstatSync(file);if(entry.isSymbolicLink()||!entry.isFile()||entry.nlink!==1||entry.size>MAX_BYTES)fail('linked, nonordinary or oversized ledger');const bytes=readFileSync(file);if(bytes.length>MAX_BYTES)fail('ledger exceeds byte budget');const value=JSON.parse(bytes.toString('utf8')) as unknown;checkJson(value);return value;}
function admission(value:unknown,stage:ResearchStage):ImageAdmissionFailure|null {
 if(!stage.tool)return null;
 const a=isRow(value)?value:{};
 const receipt=readImageAdmissionFailure(a.admission_failure,stage.tool,stage.request_id)??readImageAdmissionFailure(value,stage.tool,stage.request_id)??(a.request_id===stage.request_id?imageAdmissionFailureFromError(value,stage.tool,stage.request_id):null);
 if(!receipt)return null;return {schema_version:1,kind:'image_operation_admission_failure',provider:'external-image-workspace',tool:receipt.tool,code:receipt.code,submission_state:'not_submitted',request_id:receipt.request_id,original_request_id:receipt.original_request_id,automatic_retry:false};
}
function validate(value:unknown):ResearchStudy {
 const record=row(value);checkJson(record);
 if(record.schema_version!==1||record.kind!=='panel_research_stages_v1'||typeof record.study_id!=='string'||!ID.test(record.study_id)||!isRow(record.input)||typeof record.input_sha256!=='string'||!SHA.test(record.input_sha256)||record.input_sha256!==hash(record.input)||!Array.isArray(record.stage_names)||record.stage_names.length<1||record.stage_names.length>8||!record.stage_names.every(v=>typeof v==='string'&&ID.test(v))||new Set(record.stage_names).size!==record.stage_names.length||typeof record.revision!=='number'||!Number.isSafeInteger(record.revision)||record.revision<0||typeof record.created_utc!=='string'||!Number.isFinite(Date.parse(record.created_utc))||typeof record.updated_utc!=='string'||!Number.isFinite(Date.parse(record.updated_utc)))fail('invalid frozen study identity/input');
 const study=record as unknown as ResearchStudy;
 if(!isRow(study.request_ids)||!same(Object.keys(study.request_ids).sort(),[...study.stage_names].sort())||!Object.values(study.request_ids).every(id=>typeof id==='string'&&ID.test(id))||new Set(Object.values(study.request_ids)).size!==study.stage_names.length)fail('invalid frozen original request IDs');
 if(study.identity_sha256!==hash(sourceIdentity(study))||!Array.isArray(study.stages)||study.stages.length!==study.stage_names.length)fail('frozen input or stage order was changed');
 let unfinished=false;
 study.stages.forEach((stage,index)=>{
  if(!isRow(stage)||stage.name!==study.stage_names[index]||stage.request_id!==study.request_ids[stage.name]||!['not_submitted','submitted','completed','failed','unknown'].includes(stage.state)||!Number.isSafeInteger(stage.attempts)||stage.attempts<0||stage.attempts>16||!(stage.reason===null||typeof stage.reason==='string'&&stage.reason.length<=1024))fail('invalid stage or original request identity');
  if(stage.tool===null||stage.arguments===null){if(stage.tool!==null||stage.arguments!==null||stage.state!=='not_submitted'||stage.attempts!==0||stage.object_id!==null||stage.admission_failure!==null)fail('unsubmitted stage lost its original state');}
  else{if(typeof stage.tool!=='string'||!/^image_[a-z0-9_]{1,80}$/.test(stage.tool)||['image_info','image_result','image_probe','image_evidence'].includes(stage.tool)||!isRow(stage.arguments)||stage.arguments.request_id!==stage.request_id||stage.attempts<1)fail('stage tool/arguments do not bind original request');
   if(stage.state==='not_submitted'&&!readImageAdmissionFailure(stage.admission_failure,stage.tool,stage.request_id))fail('absence is not proof of non-submission');}
  if(stage.admission_failure!==null&&!readImageAdmissionFailure(stage.admission_failure,stage.tool,stage.request_id))fail('invalid exact non-admission receipt');
  if(stage.state==='completed'){if(unfinished||typeof stage.object_id!=='string'||!OBJECT.test(stage.object_id))fail('completed stages require ordered exact output identity');}
  else{if(stage.object_id!==null)fail('uncompleted stage cannot claim a result object');if(unfinished&&stage.state!=='not_submitted')fail('later stage ran before its dependency completed');unfinished=true;}
 });
 return study;
}
/** Owns only local workflow receipts; caller retains provider/workspace ownership. */
export class PanelResearchStages {
 readonly workspace:string;readonly directory:string;
 constructor(workspace:string){if(!path.isAbsolute(workspace))fail('explicit absolute workspace required');ordinary(workspace);this.workspace=realpathSync.native(workspace);this.directory=path.join(this.workspace,'panel-research-studies');if(!existsSync(this.directory)){mkdirSync(this.directory,{mode:0o700});syncDirectory(this.workspace);}this.checkDirectory();}
 private checkDirectory(){ordinary(this.workspace);ordinary(this.directory);if(realpathSync.native(this.directory)!==this.directory)fail('study directory alias or link');}
 private file(studyId:string){this.checkDirectory();return path.join(this.directory,ident(studyId)+'.json');}
 read(studyId:string):ResearchStudy {const study=validate(readBounded(this.file(studyId)));if(study.study_id!==studyId)fail('ledger filename differs from study identity');return clone(study);}
 list():ResearchStudy[]{this.checkDirectory();const names=readdirSync(this.directory).filter(name=>name.endsWith('.json'));if(names.length>MAX_STUDIES)fail('too many study ledgers');return names.sort().map(name=>this.read(name.slice(0,-5)));}
 private persist(record:ResearchStudy){this.checkDirectory();validate(record);const file=this.file(record.study_id);if(existsSync(file))readBounded(file);const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');if(bytes.length>MAX_BYTES)fail('study metadata exceeds byte budget');const temp=path.join(this.directory,'.'+record.study_id+'-'+randomBytes(12).toString('hex')+'.tmp'),fd=openSync(temp,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}try{renameSync(temp,file);syncDirectory(this.directory);}catch(error){if(existsSync(temp))unlinkSync(temp);throw error;}if(!same(this.read(record.study_id),record))fail('durable ledger readback differs');}
 private acquire(studyId:string){const file=this.file(studyId)+'.lock';if(active.has(file))fail('this study is already active; do not submit it twice');
  if(existsSync(file)){
   const old=row(readBounded(file));if(old.kind!=='panel_research_stages_lock_v1'||typeof old.pid!=='number'||!Number.isSafeInteger(old.pid)||old.pid<=0||typeof old.nonce!=='string'||!/^[a-f0-9]{32}$/.test(old.nonce))fail('unknown lock must be inspected');
   let dead=false;try{process.kill(old.pid,0);}catch(error){dead=(error as NodeJS.ErrnoException).code==='ESRCH';}
   if(!dead)fail('study owner is still present or cannot be inspected');if(!same(readBounded(file),old))fail('study lock changed while inspecting');unlinkSync(file);syncDirectory(this.directory);
  }
  const owner={kind:'panel_research_stages_lock_v1',pid:process.pid,nonce:randomBytes(16).toString('hex')},fd=openSync(file,'wx',0o600);try{writeFileSync(fd,JSON.stringify(owner));fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(this.directory);active.add(file);
  return ()=>{try{if(existsSync(file)&&same(readBounded(file),owner)){unlinkSync(file);syncDirectory(this.directory);}}finally{active.delete(file);}};
 }
 create(options:{study_id:string;input:Row;stage_names:string[];request_ids?:Record<string,string>}):ResearchStudy {
  ident(options.study_id);checkJson(options.input);if(!isRow(options.input)||!Array.isArray(options.stage_names)||options.stage_names.length<1||options.stage_names.length>8||options.stage_names.some(name=>typeof name!=='string'||!ID.test(name)||['__proto__','constructor','prototype'].includes(name))||new Set(options.stage_names).size!==options.stage_names.length)fail('explicit frozen input and one to eight distinct stages required');
  if(Buffer.byteLength(canonical(options.input))>MAX_BYTES/2)fail('frozen input exceeds byte budget');
  const supplied=options.request_ids??{};checkJson(supplied);if(!isRow(supplied)||Object.keys(supplied).some(name=>!options.stage_names.includes(name))||!Object.values(supplied).every(id=>typeof id==='string'&&ID.test(id)))fail('explicit original request IDs must match known stages');
  const seed=hash({study_id:options.study_id,input:options.input,stage_names:options.stage_names,request_ids:supplied}),requestIds=Object.fromEntries(options.stage_names.map((name,index)=>[name,supplied[name]??stageRequest(seed,name,index)]));if(new Set(Object.values(requestIds)).size!==options.stage_names.length)fail('each stage needs a distinct original request ID');const release=this.acquire(options.study_id);
  try{const file=this.file(options.study_id);if(existsSync(file)){const previous=this.read(options.study_id);if(!same(previous.input,options.input)||!same(previous.stage_names,options.stage_names)||!same(previous.request_ids,requestIds))fail('study ID already binds different frozen input/stage order');return previous;}
   if(this.list().length>=MAX_STUDIES)fail('study ledger limit reached');const created=now(),base={schema_version:1 as const,kind:'panel_research_stages_v1' as const,study_id:options.study_id,input:clone(options.input),input_sha256:hash(options.input),stage_names:clone(options.stage_names),request_ids:clone(requestIds),identity_sha256:'',created_utc:created,updated_utc:created,revision:0,stages:[] as ResearchStage[]};base.identity_sha256=hash(sourceIdentity(base));base.stages=base.stage_names.map((name,index)=>({name,request_id:requestIds[name],state:'not_submitted',tool:null,arguments:null,object_id:null,attempts:0,reason:null,admission_failure:null}));this.persist(base);return clone(base);
  }finally{release();}
 }
 async resume(studyId:string,callbacks:ResearchStageCallbacks,options:{signal?:AbortSignal}={}):Promise<ResearchStagesResult> {
  const release=this.acquire(studyId);try{const record=this.read(studyId),save=()=>{record.updated_utc=now();record.revision++;try{this.persist(record);}catch(error){throw Object.assign(error instanceof Error?error:new Error(String(error)),{research_stage_persistence_uncertain:true});}},finish=(phase:ResearchStagesPhase,stage:ResearchStage|null=null):ResearchStagesResult=>({phase,record:clone(record),stage_name:stage?.name??null,request_id:stage?.request_id??null,reason:stage?.reason??null});
   const settle=(stage:ResearchStage,value:unknown)=>{const reply=isRow(value)?value:{};const refused=admission(value,stage);if(refused){stage.state='not_submitted';stage.admission_failure=clone(refused);stage.reason='准确原请求未被接纳；仅允许另一次明确接续，不自动重试。';save();return 'admission_not_submitted' as const;}
    if(reply.request_id!==stage.request_id){stage.state='unknown';stage.reason='回执不匹配原请求；保留原ID并只查询。';save();return 'stopped_unknown' as const;}
    if(reply.state==='completed'&&reply.ok!==false&&typeof reply.object_id==='string'&&OBJECT.test(reply.object_id)){stage.state='completed';stage.object_id=reply.object_id;stage.reason=null;save();return 'completed' as const;}
    if(reply.state==='failed'){stage.state='failed';stage.reason=reason(reply);save();return 'stopped_failed' as const;}
    stage.state='unknown';stage.reason=reason(reply);save();return 'stopped_unknown' as const;
   };
   const caught=(stage:ResearchStage,error:unknown)=>{if(isRow(error)&&error.research_stage_persistence_uncertain===true)throw error;const refused=admission(error,stage);if(refused)return settle(stage,{admission_failure:refused});const original=isRow(error)?readImageOriginalFailure(error.original_failure_receipt,stage.request_id):null;if(original)return settle(stage,{request_id:stage.request_id,state:'failed',error:{message:reason(error)}});stage.state='unknown';stage.reason=reason(error);save();return 'stopped_unknown' as const;};
   for(const stage of record.stages){if(stage.state==='completed')continue;if(options.signal?.aborted)return finish('paused',stage);if(stage.state==='failed')return finish('stopped_failed',stage);
    if(stage.state==='submitted'||stage.state==='unknown'){
     let phase:'completed'|'stopped_unknown'|'stopped_failed'|'admission_not_submitted';try{phase=settle(stage,await callbacks.query(stage.request_id,stage.name));}catch(error){phase=caught(stage,error);}return finish(phase==='completed'?'query_completed_resume_required':phase,stage);
    }
    if(stage.attempts>=16){stage.reason='达到本阶段明确接纳尝试上限；原记录保留。';save();return finish('stopped_not_submitted',stage);}
    if(stage.tool===null||stage.arguments===null){
     const outputs:Record<string,ResearchStageOutput>={};for(const previous of record.stages){if(previous.state==='completed')outputs[previous.name]={object_id:previous.object_id!,request_id:previous.request_id};}
     let call:ResearchStageCall;try{call=await callbacks.resolve(stage.name,clone(outputs),clone(record.input));checkJson(call);if(!isRow(call)||typeof call.tool!=='string'||!/^image_[a-z0-9_]{1,80}$/.test(call.tool)||['image_info','image_result','image_probe','image_evidence'].includes(call.tool)||!isRow(call.arguments)||call.arguments.request_id!==undefined&&call.arguments.request_id!==stage.request_id)fail('resolver did not return the exact original stage tool/arguments');}catch(error){stage.reason=reason(error);save();return finish('stopped_not_submitted',stage);}
     if(options.signal?.aborted)return finish('paused',stage);stage.tool=call.tool;stage.arguments={...clone(call.arguments),request_id:stage.request_id};
    }
    stage.state='submitted';stage.attempts++;stage.reason=null;save();
    let phase:'completed'|'stopped_unknown'|'stopped_failed'|'admission_not_submitted';try{phase=settle(stage,await callbacks.dispatch(stage.tool,clone(stage.arguments),stage.name));}catch(error){phase=caught(stage,error);}if(phase!=='completed')return finish(phase,stage);
   }
   return finish('complete');
  }finally{release();}
 }
}
