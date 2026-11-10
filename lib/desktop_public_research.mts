// Deliberately restricted public fixture entry, not admission for user files.
import path from 'node:path';
import {mkdirSync,writeFileSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {createScienceRuntime} from './science/create_science_runtime.mjs';
import {createResearchTextTools} from './research_text_tools.mjs';
import {CodexStdioHost} from './codex_stdio_host.mjs';
import {textHostProcess} from './research_text_runtime.mjs';
import type {HostEvent,HostSnapshot} from './research_host.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
interface PublicOperation {id:string;question:string;state:string;thread_id?:string;turn_id?:string;turn_start_attempted?:boolean;wait_expired?:boolean;messages:unknown[];error?:string;}
export class PublicResearchRefused extends Error {
 constructor(readonly id:string|null,readonly code:'INVALID_QUESTION'|'ORIGINAL_ID_CONFLICT'|'BUSY'|'STOPPED'|'QUESTION_LIMIT',message:string){super(message);}
 receipt(){return {id:this.id,code:this.code,disposition:'not_dispatched' as const};}
}

export const PUBLIC_ARRAY_SHA='32605bbed9432e4b1c6fcf4461b884a3ac13ee714932515290f8ca8bf367add3';
export const PUBLIC_RESEARCH_NOTICE='公开合成样例 · Codex 仅接收问题、来源身份与白名单统计；不发送图片或像素。Codex 没有看到图像，不能自动识别材料。强度单位、物理标定与材料含义未知。同帧 ROI 不是独立实验。';
// The UI receives the same fixed text template and tool definitions used below.
// This is a local presentation, not another input/attachment or approval channel.
export function publicResearchSendPreview(source:Record<string,unknown>,tools:readonly ToolDefinition[]){
 const selected={frame_id:source.frame_id,manifest_sha256:source.manifest_sha256,array_sha256:source.array_sha256,shape_yx:source.shape_yx,dtype:source.dtype};
 return {question_prefix:'Public synthetic scalar array; no image is attached or available. Source: '+JSON.stringify(selected)+'. Intensity units, physical calibration and material meaning unknown. User question: ',
  question_suffix:'\nChoose existing statistics tools and pixel ROIs as useful, use actual results for follow-up checks, cite original request/object IDs and ROI coordinates. Distinguish support, conflicts, unknowns and next steps. Same-frame checks are dependent. Do not use images, shell, files or web.',
  tools:tools.map(t=>({name:t.name,description:t.description,inputSchema:structuredClone(t.inputSchema)})),images:false,pixels:false,provider_raw_content:false};
}
export function publicResearchDirectory(run:string,workspace:string){
 if(!path.isAbsolute(run)||!path.isAbsolute(workspace)||path.resolve(workspace)!==path.join(path.resolve(run),'workspace'))throw Error('Public research requires its dedicated absolute workspace');
 for(const directory of [run,workspace]){
  let ancestor=path.resolve(directory);while(!existsSync(ancestor))ancestor=path.dirname(ancestor);
  if(realpathSync.native(ancestor)!==ancestor||existsSync(directory)&&!lstatSync(directory).isDirectory())throw Error('Public workspace must be an ordinary directory without symlink traversal');
 }
 return path.resolve(run);
}
export class DesktopPublicResearch {
 private runtime;private tools;private host:CodexStdioHost;private operations:PublicOperation[]=[];
 private active=false;private stopped=false;private events:HostEvent[]=[];private status='idle';private model:string|null=null;
 private task:Promise<void>|undefined;
 private waitTimer:ReturnType<typeof setTimeout>|undefined;
 constructor(private run:string,workspace:string,python:string,frameId:string,readonly viewId:string,hostOptions:Partial<ConstructorParameters<typeof CodexStdioHost>[0]>={},private readonly waitMs=180000){
  if(!Number.isSafeInteger(waitMs)||waitMs<1||waitMs>180000)throw Error('Invalid bounded UI wait budget');
  publicResearchDirectory(run,workspace);
  if(existsSync(path.join(run,'ui-research-report.json')))throw Error('Existing public session report retained; use a new public sample directory');
  for(const d of ['audit','model-cwd','tmp','cache'])mkdirSync(path.join(run,d),{recursive:true});
  this.runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}});
  try{
   this.tools=createResearchTextTools({registry:this.runtime.registry,workspace,frameId,viewId,journalDirectory:path.join(run,'audit')});
   if(this.tools.source.array_sha256!==PUBLIC_ARRAY_SHA||this.tools.source.dtype!=='uint16'||JSON.stringify(this.tools.source.shape_yx)!=='[64,64]')throw Error('Only the exact public synthetic array is admitted');
   const settings=textHostProcess(run,true,undefined,process.env);
   this.host=new CodexStdioHost({executable:'/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',timeoutMs:30000,process:settings.process,textTools:{port:this.tools.port},...hostOptions,onWire:(direction,message)=>{
    if(direction==='send'&&message.method==='turn/start'&&(message.params as {input:{type:string}[]}).input.some(i=>i.type!=='text'))throw Error('Public UI allows text only');
    if(direction==='receive'&&typeof (message.result as {model?:unknown})?.model==='string')this.model=(message.result as {model:string}).model;
   }});
   this.host.subscribe(event=>{if(event.kind!=='host_text'&&this.events.length<512)this.events.push(event);if(event.kind==='host_state')this.reconcile(event.snapshot);this.persist();});
  }catch(e){this.runtime.close();throw e;}
  this.persist();
 }
 snapshot(){const host=this.host.snapshot(),op=this.operations.at(-1),canInterrupt=this.active&&!this.stopped&&!['failed','closing','closed'].includes(host.connection)&&(op?.state==='starting'||['starting','running','awaiting_user'].includes(host.turn_state));return {enabled:true,notice:PUBLIC_RESEARCH_NOTICE,session_stopped:this.stopped,status:this.status,active:this.active,can_interrupt:canInterrupt,model:this.model,source:structuredClone(this.tools.source),send_preview:publicResearchSendPreview(this.tools.source,this.tools.port.definitions),source_view_id:this.viewId,context_sha256:this.tools.context_sha256,host,operations:structuredClone(this.operations),tool_calls:this.tools.audit(),events:structuredClone(this.events),protocol_diagnostics:this.host.notificationDiagnostics(),auth_source:'official_default_existing',runtime_notice:'官方既有登录；可能写入少量默认运行状态。项目和主要缓存位于外盘；未审计官方客户端全部上游上下文。'};}
 private persist(){writeFileSync(path.join(this.run,'ui-research-report.json'),JSON.stringify(this.snapshot(),null,2)+'\n');}
 private clearWait(){if(this.waitTimer!==undefined){clearTimeout(this.waitTimer);this.waitTimer=undefined;}}
 private reconcile(s:HostSnapshot){
  const op=this.operations.at(-1);if(!op?.turn_id||op.thread_id!==s.thread_id||op.turn_id!==s.turn_id)return;
  op.messages=structuredClone(s.agent_messages);
  if(['completed','failed','interrupted'].includes(s.turn_state)){op.state=this.status=s.turn_state;this.active=false;delete op.error;this.clearWait();return;}
  this.active=true;op.state=this.status=op.wait_expired?'unknown':s.turn_state;
  if(s.turn_state==='unknown'){this.clearWait();op.error='原回合结果未知；保留原记录，不重发。宿主不可控制时无法确认中断或完成。';}
 }
 private armWait(op:PublicOperation){
  if(!this.active)return;this.clearWait();this.waitTimer=setTimeout(()=>{
   this.waitTimer=undefined;if(!this.active||this.operations.at(-1)!==op)return;
   op.wait_expired=true;op.state=this.status='unknown';op.error='界面等候已超时，原回合尚未确认结束；可继续核对状态或请求中断，不会重发问题或科学请求。';this.persist();
  },this.waitMs);
 }
 submit(body:Record<string,unknown>){
  const id=typeof body.id==='string'&&/^ui-[a-f0-9-]{36}$/.test(body.id)?body.id:null;
  if(Object.keys(body).sort().join()!=='approved,context_sha256,id,question'||body.approved!==true||body.context_sha256!==this.tools.context_sha256||id===null||typeof body.question!=='string'||!body.question.trim()||Buffer.byteLength(body.question)>2000)throw new PublicResearchRefused(id,'INVALID_QUESTION','请确认当前公开样例的发送范围，并输入不超过 2000 字节的非敏感问题。');
  const prior=this.operations.find(o=>o.id===id);if(prior){if(prior.question!==body.question)throw new PublicResearchRefused(id,'ORIGINAL_ID_CONFLICT','原操作身份不能更换问题。');return this.snapshot();}
  if(this.active)throw new PublicResearchRefused(id,'BUSY','原回合尚未结束，请核对原请求。');
  if(this.stopped||['failed','unknown','interrupted'].includes(this.status))throw new PublicResearchRefused(id,'STOPPED','会话不再接收新问题，请保留原记录。');
  if(this.operations.length>=8)throw new PublicResearchRefused(id,'QUESTION_LIMIT','本会话已达 8 问上限；本问题未派发，输入保留。');
  const operation={id,question:body.question,state:'starting',messages:[] as unknown[]};this.operations.push(operation);this.active=true;this.status='starting';this.persist();
  this.task=this.runTurn(operation);return this.snapshot();
 }
 private async runTurn(operation:PublicOperation){
  try{
   if(this.host.snapshot().connection==='not_started'){
    await this.host.connect();const auth=await this.host.authenticationStatus();
    if(!auth.authenticated)throw Error('EXISTING_AUTH_UNAVAILABLE');
    if(this.stopped)throw Error('SESSION_STOPPED');
    await this.host.startSession({task_id:'public-desktop-research',context_sha256:this.tools.context_sha256});
   }
   if(this.stopped)throw Error('SESSION_STOPPED');
   // Capture only immutable primitive text. No panel object or source path is sent.
   const {question_prefix,question_suffix,...plan}=publicResearchSendPreview(this.tools.source,this.tools.port.definitions),text=question_prefix+operation.question+question_suffix;
   writeFileSync(path.join(this.run,operation.id+'-send-plan.json'),JSON.stringify({text,...plan},null,2)+'\n');
   operation.thread_id=this.host.snapshot().thread_id!;operation.turn_start_attempted=true;
   operation.turn_id=await this.host.startTurn(text);this.reconcile(this.host.snapshot());this.armWait(operation);this.persist();
   // A stop may arrive while turn/start is awaiting its identity. Once the
   // original identity is known, interrupt that turn exactly once, never resend.
   if(this.stopped&&['starting','running','awaiting_user'].includes(this.host.snapshot().turn_state))await this.host.interrupt();
  }catch(error){
   const current=this.host.snapshot();if(operation.turn_id&&operation.thread_id===current.thread_id&&operation.turn_id===current.turn_id&&['completed','failed','interrupted'].includes(current.turn_state)){this.reconcile(current);return;}
   const authMissing=error instanceof Error&&error.message==='EXISTING_AUTH_UNAVAILABLE';
   const s=this.host.snapshot();operation.state=!operation.turn_start_attempted||authMissing||s.turn_state==='failed'?'failed':'unknown';this.status=operation.state;this.active=operation.state==='unknown';this.clearWait();
   operation.messages=operation.turn_id&&operation.thread_id===s.thread_id&&operation.turn_id===s.turn_id?structuredClone(s.agent_messages):[];operation.error=authMissing?'官方既有登录不可用；未发送模型问题。请在官方客户端核对，应用不会发起登录。':!operation.turn_start_attempted?'问题未派发；准备未完成或已停止，原记录保留。':'本回合未确认完成。请保留原会话与请求，核对结果；不会自动重发。';
  }finally{this.persist();}
 }
 async interrupt(){
  if(!this.snapshot().can_interrupt)return this.snapshot();this.stopped=true;this.persist();
  const s=this.host.snapshot();if(s.turn_id&&['running','awaiting_user'].includes(s.turn_state))try{await this.host.interrupt();}catch{/* Host records failed/unknown; never pretend success. */}
  this.reconcile(this.host.snapshot());this.persist();return this.snapshot();
 }
 async close(){if(this.active)await this.interrupt();this.stopped=true;this.clearWait();await this.host.close();await this.task;this.runtime.close();this.persist();}
}
