// Same-process Panel owner for one saved image/question. Production can review
// the exact local scope. Only the fixed public synthetic full image can use the
// separate native send confirmation; other images remain local review only.
import path from 'node:path';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import {prepareResearchHostImage} from './research_host_input.mjs';
import {createResearchSendGate} from './research_host_dispatch.mjs';
import type {JointResearchReview} from './research_host_dispatch.mjs';
import {createSavedViewResearchTools} from './research_text_tools.mjs';
import {createScienceRuntime} from './science/create_science_runtime.mjs';
import {readResearchQuestion} from '../ui/image-panel/research-question.mjs';
import type {HostImageReference} from './research_host.mjs';
import {assertJointMemoryHost,createPublicSyntheticJointHost} from './codex_stdio_host.mjs';
import {PUBLIC_JOINT_ARRAY_SHA} from './public_joint_runtime.mjs';
import {readSavedResearchToolBinding} from './research_text_tools.mjs';
import {readJointResearchHistory} from './research_joint_history.mjs';
import type {CodexStdioHost} from './codex_stdio_host.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const JOINT_DELIVERY_BLOCKER='真实发送仅限另行原生确认的公开合成64×64原图；其他输入只在本地核对，不发送。';
export type JointOwnerStatus='idle'|'reviewing'|'reviewed_not_dispatched'|'cancelled'|'expired'|'invalidated'|'starting'|'running'|'stopping'|'completed'|'failed'|'unknown';
export interface JointOwnerSnapshot {revision:number;status:JointOwnerStatus;locked:boolean;review_id:string|null;context_sha256:string|null;delivery:'blocked_pending_independent_review'|'synthetic_only'|'official_public_synthetic';public_send_available:boolean;notice:string;confirmation:'none'|'native_scope_review_only'|'synthetic_not_user'|'native_public_send';unresolved_request_ids:string[];review:{question:string;source:HostImageReference;tool_scope:Readonly<Row>;tool_scope_sha256:string;payload_sha256:string}|null;host:unknown;results:unknown[];history:Row[];error:string|null;}
// A host terminal event cannot resolve a still-unverified provider write.
export function jointUnresolvedRequests(audit:readonly Row[]):string[]{
 const pending=new Set<string>();for(const entry of audit){if(typeof entry.request_id!=='string')continue;if(['before_dispatch','refused_or_unverified'].includes(String(entry.phase)))pending.add(entry.request_id);else if(['completed','query_completed','verified_failed'].includes(String(entry.phase)))pending.delete(entry.request_id);}return [...pending];
}
export class JointResearchOwner {
 private auditRevision=0;
 private scientificWait:{thread:string|null;turn:string|null;session:number;terminal:'completed'|'failed'|'interrupted'}|null=null;
 private status:JointOwnerStatus='idle';private revision=0;private token='';private id:string|null=null;private deadline=0;private directory='';
 private source:HostImageReference|null=null;private review:JointResearchReview|null=null;private question='';private image:Buffer|null=null;private confirmation:JointOwnerSnapshot['confirmation']='none';
 private runtime:ReturnType<typeof createScienceRuntime>|null=null;private tools:ReturnType<typeof createSavedViewResearchTools>|null=null;
 private host:CodexStdioHost|null=null;private unsubscribe:(()=>void)|null=null;
 private publicSendAvailable=false;private official=false;private stopRequested=false;private task:Promise<void>|null=null;private error:string|null=null;private readonly historical:Row[];
 private readonly gate:ReturnType<typeof createResearchSendGate>;
 constructor(private readonly options:{workspace:string;python:string;getState:()=>object;ttlMs?:number}){this.gate=createResearchSendGate({readCurrent:()=>({workspace:options.workspace,panel:options.getState()})});this.historical=readJointResearchHistory(options.workspace);if(this.historical.some(h=>['unknown','unverified_history'].includes(String(h.status))||Array.isArray(h.unresolved_request_ids)&&h.unresolved_request_ids.length)){this.status='unknown';this.error='此前原回合或科学请求尚未确认；仅保留查看，不自动重连或重发。';}}
 locked():boolean{return ['reviewing','starting','running','stopping','unknown'].includes(this.status);}
 assertMutable():void{if(this.locked())throw Error('本次图像和问题已锁定；可查看已有结果，或先取消范围预览/请求中断。');}
 private update(status:JointOwnerStatus){this.status=status;this.revision++;if(this.directory)writeFileSync(path.join(this.directory,'owner.json'),JSON.stringify(this.snapshot(),null,2)+'\n');}
 snapshot():JointOwnerSnapshot{return {revision:this.revision,status:this.status,locked:this.locked(),review_id:this.id,context_sha256:this.review?.context_sha256??null,delivery:this.official?'official_public_synthetic':this.host?'synthetic_only':'blocked_pending_independent_review',public_send_available:this.publicSendAvailable&&!this.host&&this.status==='reviewing',notice:this.official?'公开合成图 · OpenAI gpt-6.1-sol 图像与工具任务。科学结果以原请求记录为准；同帧区域不是独立实验。运行记录已写入本地，Ctrl+S 另存工作区图像与问题。':this.host?'本地合成联合协议测试；非模型、非真实用户授权，无外发。':JOINT_DELIVERY_BLOCKER,confirmation:this.confirmation,unresolved_request_ids:jointUnresolvedRequests(this.tools?.audit()??[]),review:this.review&&this.source?{question:this.question,source:structuredClone(this.source),tool_scope:structuredClone(this.review.tool_scope),tool_scope_sha256:this.review.tool_scope_sha256,payload_sha256:this.review.payload_sha256}:null,host:this.host?.snapshot()??null,results:this.tools?.audit().filter(r=>r.phase!=='before_dispatch').map(r=>structuredClone(r.output??Object.fromEntries(['phase','status','request_id','original_request_id','automatic_retry','meaning'].filter(k=>k in r).map(k=>[k,r[k]]))))??[],history:structuredClone(this.historical),error:this.error};}
 private settleTerminal(state:ReturnType<CodexStdioHost['snapshot']>){
  if(state.connection==='failed'||state.turn_state==='unknown'){this.scientificWait=null;this.update('unknown');return;}
  if(!['completed','failed','interrupted'].includes(state.turn_state))return;
  const prior=this.scientificWait;
  if(this.status==='unknown'&&!prior||prior&&(prior.thread!==state.thread_id||prior.turn!==state.turn_id||prior.session!==state.session_revision||prior.terminal!==state.turn_state)){this.scientificWait=null;this.update('unknown');return;}
  const pending=jointUnresolvedRequests(this.tools?.audit()??[]).length;this.scientificWait=pending?{thread:state.thread_id,turn:state.turn_id,session:state.session_revision,terminal:state.turn_state as 'completed'|'failed'|'interrupted'}:null;this.update(pending?'unknown':state.turn_state==='completed'?'completed':'failed');
 }
 query(){const count=this.tools?.audit().length??0;if(count!==this.auditRevision){this.auditRevision=count;const host=this.host?.snapshot();if(host&&['completed','failed','interrupted','unknown'].includes(host.turn_state))this.settleTerminal(host);else this.update(this.status);}if(this.status==='reviewing'&&performance.now()>=this.deadline){this.token='';this.update('expired');}return this.snapshot();}
 begin(expectedWorkingRevision:number){
  this.assertMutable();if(this.host)throw Error('原合成回合仍需保留；不重开宿主。');
  const s=row(this.options.getState()),analysis=row(s.workspace_analysis),edit=row(s.edit_state),persistence=row(s.draft_persistence),question=readResearchQuestion(s.research_question),view=row(s.object),frame=row(s.frame_identity);
  if(!question||question.context_object_id!==view.object_id||question.frame_object_id!==frame.frame_object_id)throw Error('先应用绑定当前保存图的一个问题；不自动改绑或采用其它问题。');
  if(analysis.working_revision!==expectedWorkingRevision||!['new','clean','dirty'].includes(String(analysis.status))||analysis.unresolved_request_id!==null||analysis.unresolved_save_id!==null||analysis.recovery_available!==false||edit.dirty!==false||edit.gesture_active!==false||edit.annotation_edit!==null||edit.selection!==null||s.selection!==null||s.pending_result!==null||persistence.pending!==false||persistence.error!==null)throw Error('当前工作编辑、选区、保存或原请求尚未稳定；原内容保留。');
  const ttl=this.options.ttlMs??300000;if(!Number.isSafeInteger(ttl)||ttl<1||ttl>300000)throw Error('Invalid bounded review lifetime');
  this.runtime?.close();this.runtime=null;this.tools=null;this.review=null;this.source=null;this.question='';this.image=null;this.publicSendAvailable=false;this.error=null;
  this.id=randomBytes(16).toString('hex');this.token=randomBytes(24).toString('hex');this.confirmation='none';this.directory=path.join(this.options.workspace,'research-runs','joint-'+this.id);mkdirSync(this.directory,{recursive:true});
  this.deadline=performance.now()+ttl;this.update('reviewing');
  try{
   const saved=readImageProviderRecords(this.options.workspace).object(view.object_id),prepared=prepareResearchHostImage({workspace:this.options.workspace,view_id:String(view.object_id),view_sha256:saved.manifest_sha256,frame_id:String(frame.frame_object_id),text:question.text});
   this.runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:this.options.workspace,MICROSCOPY_PYTHON:this.options.python,MICROSCOPY_PANEL:'0'}});
   this.tools=createSavedViewResearchTools({registry:this.runtime.registry,workspace:this.options.workspace,frameId:String(frame.frame_object_id),viewId:String(view.object_id),journalDirectory:this.directory});
   const binding=readSavedResearchToolBinding(this.tools);this.publicSendAvailable=binding.source.array_sha256===PUBLIC_JOINT_ARRAY_SHA&&binding.source.dtype==='uint16'&&JSON.stringify(binding.source.shape_yx)==='[64,64]'&&JSON.stringify(binding.scope.source_rect_xyxy)==='[0,0,64,64]';
   this.review=this.gate.reviewJoint(prepared,this.tools);this.question=question.text;this.source=structuredClone(prepared.source!);
   const wire=this.review.wire.find(r=>r.type==='image');if(wire?.type!=='image'||!wire.url.startsWith('data:image/png;base64,'))throw Error('Exact reviewed PNG is unavailable');
   this.image=Buffer.from(wire.url.slice('data:image/png;base64,'.length),'base64');if(createHash('sha256').update(this.image).digest('hex')!==prepared.source!.display_png_sha256)throw Error('Review preview differs from the bound PNG');
   this.update('reviewing');return {review_id:this.id,context_sha256:this.review.context_sha256,review_path:'/joint-review/'+this.token,public_send_available:this.publicSendAvailable,notice:JOINT_DELIVERY_BLOCKER};
  }catch(error){this.token='';this.update('invalidated');this.runtime?.close();this.runtime=null;throw error;}
 }
 private valid(id:string,context:string){
  if(this.status!=='reviewing'||!this.review||id!==this.id||context!==this.review.context_sha256)throw Error('Original pending native review required');
  if(performance.now()>=this.deadline){this.token='';this.update('expired');throw Error('范围预览已过期；未派发，需要重新核对。');}
  // Rebuild locally over the original immutable preparation and exact scope.
  // The gate keeps preparation provenance private; use the same saved identity.
  const s=row(this.options.getState()),q=readResearchQuestion(s.research_question),view=row(s.object),frame=row(s.frame_identity);
  try{const saved=readImageProviderRecords(this.options.workspace).object(view.object_id),prepared=prepareResearchHostImage({workspace:this.options.workspace,view_id:String(view.object_id),view_sha256:saved.manifest_sha256,frame_id:String(frame.frame_object_id),text:q?.text??''});const current=this.gate.reviewJoint(prepared,this.tools);if(current.context_sha256!==context)throw Error('范围、问题或修订已改变；未确认其它内容。');}
  catch(error){this.token='';this.update('invalidated');throw error;}
 }
 recordNativeReview(id:string,context:string){this.valid(id,context);this.confirmation='native_scope_review_only';this.token='';this.update('reviewed_not_dispatched');return this.snapshot();}
 sendPublic(id:string,context:string){
  this.valid(id,context);if(!this.publicSendAvailable||this.host)throw Error('仅当前准确的公开合成64×64原图支持真实模型发送；没有派发。');
  for(const name of ['model-cwd','tmp','cache'])mkdirSync(path.join(this.directory,name),{recursive:true});
  const host=createPublicSyntheticJointHost({tools:this.tools,directory:this.directory});this.host=host;this.official=true;this.confirmation='native_public_send';this.token='';this.update('starting');
  this.unsubscribe=host.subscribe(event=>{if(event.kind==='host_state'){const s=event.snapshot;if(s.connection==='failed'||['completed','failed','interrupted','unknown'].includes(s.turn_state))this.settleTerminal(s);else if(s.turn_state==='running')this.update(this.stopRequested?'stopping':'running');}});
  this.task=(async()=>{try{await host.connect();if(this.stopRequested)throw Error('发送前已取消；未启动模型回合。');const auth=await host.authenticationStatus();if(!auth.authenticated)throw Error('官方既有登录不可用；未发送模型问题。');if(this.stopRequested)throw Error('发送前已取消；未启动模型回合。');await host.startSession({task_id:'native-public-joint',context_sha256:this.review!.context_sha256});if(this.stopRequested)throw Error('发送前已取消；未启动模型回合。');const approved=this.gate.approveJoint(this.review!,host,{ttlMs:Math.max(1,Math.floor(this.deadline-performance.now()))});await host.startTurn(approved);if(this.stopRequested&&['running','awaiting_user'].includes(host.snapshot().turn_state))await host.interrupt();}catch(error){this.error=(error as Error).message.slice(0,1024);const s=host.snapshot();this.update(this.status==='unknown'||s.connection==='failed'&&s.turn_id!==null||s.turn_state==='unknown'||jointUnresolvedRequests(this.tools?.audit()??[]).length?'unknown':this.stopRequested&&s.turn_state==='idle'?'cancelled':'failed');}})();
  return this.snapshot();
 }
 cancel(id?:string){if(id!==undefined&&id!==this.id)throw Error('Original review identity required');if(this.host)throw Error('运行中的回合需请求中断；不能用取消预览声称撤回发送。');this.token='';this.image=null;this.update('cancelled');return this.snapshot();}
 resource(token:string,image=false):{type:string;body:Buffer|string}|null{
  if(!this.token||token.length!==this.token.length||!timingSafeEqual(Buffer.from(token),Buffer.from(this.token)))return null;
  this.valid(this.id!,this.review!.context_sha256);if(image)return {type:'image/png',body:this.image!};
  const summary={question:this.question,recipient:this.publicSendAvailable?'OpenAI · gpt-6.1-sol · official existing authentication':'No send entry for this input',source:this.review!.wire.filter(r=>r.type==='text').slice(1),tools:this.review!.catalog,scientific_scope:this.review!.tool_scope,context_sha256:this.review!.context_sha256,payload_sha256:this.review!.payload_sha256,tool_scope_sha256:this.review!.tool_scope_sha256};
  const instruction=this.publicSendAvailable?'这张公开合成原图可在核对后，通过系统菜单“分析 → 发送本次公开合成图并分析…”发送一张PNG和本问题给OpenAI gpt-6.1-sol。下一步还有原生确认；关闭预览即取消。也可只记录范围而不发送。':'当前图没有真实发送入口。请核对内容后，通过系统菜单“分析 → 记录已核对本次范围（不发送）”记录；关闭即取消。';
  return {type:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh"><meta charset="utf-8"><title>本次图像与工具范围 · 仅本地</title><h1>本次保存图、问题与受限工具</h1><p>'+escape(instruction)+'</p><p>PNG 是显示，不是科学数组。发送内容是这张准确PNG、本问题、来源ID/哈希/坐标以及下列工具定义和后续白名单数值；不发送源文件或NPY。未推断物理单位或材料。</p><h2>本次问题</h2><p>'+escape(this.question)+'</p><h2>本次受限范围</h2><p>保存图 ID：'+escape(String(this.review!.tool_scope.input_view_id))+'</p><p>源像素半开边界 [x0,y0,x1,y1]：'+escape(JSON.stringify(this.review!.tool_scope.source_rect_xyxy))+'。统计只能在这个范围内；省略 rect 时统计整个保存范围，不使用 PNG 像素或局部相对坐标。</p><ul><li>image_statistics：仅本图原科学数组的原始标量统计，返回 n、均值、标准差、最小和最大值。</li><li>image_result：只查询本回合原请求，不重新计算。</li></ul><p>本回合最多16个科学请求、32个科学工具调用；未知结果先查询原请求。工作台只提供上述科学回调。官方客户端采用只读配置，关闭命令、浏览器和外部MCP；客户端可能仍提供内部编排工具，这不是完整官方工具目录证明。物理单位和材料解释未知。</p><h2>本次准确保存图</h2><img alt="本次准确保存 PNG" src="/joint-review/'+token+'/image.png"><details><summary>完整发送字段、工具定义与哈希（仅本地预览）</summary><pre>'+escape(JSON.stringify(summary,null,2))+'</pre></details></html>'};
 }
 // Explicit local test entry only; production native commands never expose it.
 async runSynthetic(createHost:(tools:unknown)=>CodexStdioHost){
  this.valid(this.id!,this.review!.context_sha256);const host=createHost(this.tools);assertJointMemoryHost(host,this.tools);
  this.host=host;this.confirmation='synthetic_not_user';this.token='';this.update('starting');this.unsubscribe=host.subscribe(event=>{if(event.kind==='host_state'){const state=event.snapshot;if(state.connection==='failed'||['completed','failed','interrupted','unknown'].includes(state.turn_state))this.settleTerminal(state);else if(state.turn_state==='running')this.update('running');}});
  try{await host.connect();await host.startSession({task_id:'synthetic-joint-owner',context_sha256:this.review!.context_sha256});const approved=this.gate.approveJoint(this.review!,host,{ttlMs:Math.max(1,Math.floor(this.deadline-performance.now()))});await host.startTurn(approved);return this.snapshot();}catch(error){this.update(host.snapshot().turn_state==='unknown'?'unknown':'failed');throw error;}
 }
 async interrupt(){if(!this.host)throw Error('尚未发送图像或启动模型回合；可取消本地预览。');this.stopRequested=true;this.update('stopping');if(this.official&&!this.host.snapshot().turn_id)return this.snapshot();try{await this.host.interrupt();}catch(error){this.update('unknown');throw error;}return this.snapshot();}
 async close(){this.token='';this.unsubscribe?.();if(this.host)await this.host.close();await this.task;this.runtime?.close();this.image=null;}
}
