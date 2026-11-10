import {spawn} from 'node:child_process';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isRow,panelAddress,readWorkspaceStatus,researcherArguments,readDesktopStartupError,DESKTOP_RESTORE_WAIT_MS,readDesktopDiscardOperation,readDesktopCloseOperation} from './desktop_contracts.mjs';
import type {DesktopOptions,DesktopWorkspaceStatus,DesktopDiscardQuery,DesktopDiscardOperation,DesktopCloseOperation} from './desktop_contracts.mjs';

export class DesktopBackendClient {
 readonly child:ChildProcessWithoutNullStreams;readonly ready:Promise<{url:string;node:string}>;
 private closeIntent:{command_id:number;revision:number}|null=null;private closeReceipt:DesktopCloseOperation|null=null;private lastDiscardQuery:DesktopDiscardOperation|null=null;
 private discardIntent:{command_id:number;revision:number}|null=null;
 private pending=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;action:string}>();private next=0;private buffer='';private stopped=false;
 constructor(options:DesktopOptions&{workspace:string;python:string}){
  this.child=spawn(options.node,[fileURLToPath(new URL('../tools/desktop_backend.mjs',import.meta.url)),...researcherArguments(options)],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  let readyResolve!:(v:{url:string;node:string})=>void,readyReject!:(e:Error)=>void;
  this.ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const readyTimer=setTimeout(()=>readyReject(new Error('Desktop backend startup is still unresolved. Preserve this workspace; reopening queries original startup requests.')),150000);
  const failure=(error:Error)=>{clearTimeout(readyTimer);readyReject(error);for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();};
  this.child.stdout.on('data',(chunk:Buffer)=>{
   this.buffer+=chunk.toString();if(Buffer.byteLength(this.buffer)>1024*1024){failure(new Error('Desktop backend response exceeds bound'));return;}
   let newline;while((newline=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,newline);this.buffer=this.buffer.slice(newline+1);try{
    const message:unknown=JSON.parse(line);if(!isRow(message))throw new Error('Invalid backend reply');
    if(message.type==='ready'){if(message.schema_version!==1||typeof message.node!=='string')throw new Error('Invalid backend readiness');const address=panelAddress(message.url);clearTimeout(readyTimer);readyResolve({url:address.url,node:message.node});}
    else if(message.type==='startup_error'){const error=readDesktopStartupError(message);failure(Object.assign(new Error(error.message),{code:error.code}));}
    else{if(typeof message.id!=='number'||!Number.isSafeInteger(message.id)||message.id<1||typeof message.ok!=='boolean')throw new Error('Invalid backend operation reply; original command remains unresolved');if(this.closeIntent?.command_id===message.id)this.closeReceipt={command_id:message.id,expected_working_revision:this.closeIntent.revision,state:message.ok?'completed':message.code==='DESKTOP_WORKSPACE_REFUSED'?'failed':'unknown'};const pending=this.pending.get(message.id);if(!pending)continue;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.ok===true)pending.resolve(message.state);else{if(pending.action==='close'&&message.code==='DESKTOP_WORKSPACE_REFUSED')this.closeIntent=null;pending.reject(Object.assign(new Error(typeof message.error==='string'?message.error:'Desktop backend operation failed'),{code:message.code}));}}
   }catch(error){failure(error instanceof Error?error:new Error(String(error)));}}
  });
  // Progress and bounded provider diagnostics stay on stderr, not JSON stdout.
  this.child.stderr.on('data',(chunk:Buffer)=>process.stderr.write(chunk));
  this.child.once('error',failure);this.child.once('exit',(code,signal)=>{this.stopped=true;failure(new Error('Desktop backend exited ('+String(code??signal)+'); query original scientific requests before retrying.'));});
  this.child.stdin.on('error',failure);
 }
 private async command(action:'status'|'discard'|'close'|'query-discard'|'query-close'|'joint-begin'|'joint-begin-correction'|'joint-query-original'|'joint-query'|'joint-cancel'|'joint-record-review'|'joint-send-public'|'joint-interrupt',revision?:number,originalId?:number,joint?:{request_id?:string;review_id?:string;context_sha256?:string;selection?:{measurement_ids?:string[];statistics_ids?:string[]};text?:string;original_thread_id?:string;original_turn_id?:string}):Promise<unknown>{
  await this.ready;if(['discard','close'].includes(action)&&this.closeIntent!==null)throw new Error('Original close command_id='+this.closeIntent.command_id+' remains unresolved or draining; it will not be submitted again.');if(this.stopped)throw new Error('Desktop backend has stopped');if(['discard','close'].includes(action)&&this.discardIntent)throw new Error('Original discard command_id='+this.discardIntent.command_id+' remains unresolved; query it before any new discard or close.');
  return await new Promise((resolve,reject)=>{const id=++this.next;if(action==='close')this.closeIntent={command_id:id,revision:revision!};if(action==='discard')this.discardIntent={command_id:id,revision:revision!};const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(action==='close'||action==='query-close'?'本次退出仍在等待后台确认。已写入保存点和原请求保留；关闭此提示后，可选“查看本次退出进度”核对同一次退出，不会重复保存或计算。':'Stopped waiting for workspace '+action+' command_id='+id+'; query the original operation without replay.'));},action==='discard'?DESKTOP_RESTORE_WAIT_MS:15000);this.pending.set(id,{resolve,reject,timer,action});this.child.stdin.write(JSON.stringify({id,action,...(revision!==undefined?{expected_working_revision:revision}:{}),...(originalId!==undefined?{original_id:originalId}:{}),...joint})+'\n');});
 }
 private reviewReceipt(value:unknown){if(!isRow(value)||typeof value.review_id!=='string'||!/^[a-f0-9]{32}$/.test(value.review_id)||typeof value.context_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.context_sha256)||typeof value.review_path!=='string'||!/^\/joint-review\/[a-f0-9]{48}$/.test(value.review_path)||value.public_send_available!==undefined&&typeof value.public_send_available!=='boolean')throw Error('Invalid owner review receipt; do not repeat preparation');return value as {review_id:string;context_sha256:string;review_path:string;public_send_available?:boolean};}
 async beginJointReview(revision:number,selection?:{measurement_ids?:string[];statistics_ids?:string[]}){return this.reviewReceipt(await this.command('joint-begin',revision,undefined,selection?{selection}:undefined));}
 async beginJointCorrection(revision:number,text:string,thread:string,turn:string,selection?:{measurement_ids?:string[];statistics_ids?:string[]}){return this.reviewReceipt(await this.command('joint-begin-correction',revision,undefined,{text,original_thread_id:thread,original_turn_id:turn,...(selection?{selection}:{})}));}
 async recordJointReview(id:string,context:string){return this.command('joint-record-review',undefined,undefined,{review_id:id,context_sha256:context});}
 async sendPublicJoint(id:string,context:string){return this.command('joint-send-public',undefined,undefined,{review_id:id,context_sha256:context});}
 async cancelJointReview(id:string){return this.command('joint-cancel',undefined,undefined,{review_id:id});}
 async queryJointOriginal(requestId:string){return this.command('joint-query-original',undefined,undefined,{request_id:requestId});}
 async queryJointReview(){return this.command('joint-query');}
 async interruptJointReview(){return this.command('joint-interrupt');}
 async status():Promise<DesktopWorkspaceStatus>{return readWorkspaceStatus(await this.command('status'));}
 async discard(revision:number):Promise<DesktopWorkspaceStatus>{const result=readWorkspaceStatus(await this.command('discard',revision));this.discardIntent=null;return result;}
 async queryDiscard():Promise<DesktopDiscardQuery|null>{
  const original=this.discardIntent;if(!original)return null;const reply=await this.command('query-discard',original.revision,original.command_id);if(!isRow(reply))throw new Error('Original discard query is malformed');const operation=readDesktopDiscardOperation(reply.discard_operation,original.command_id,original.revision),status=readWorkspaceStatus(reply);this.lastDiscardQuery=operation;return {operation,status};
 }
 acknowledgeDiscard(commandId:number,revision:number):void {
  const original=this.discardIntent,receipt=this.lastDiscardQuery;if(!original||original.command_id!==commandId||original.revision!==revision||receipt?.command_id!==commandId||receipt.expected_working_revision!==revision||!['completed','failed'].includes(receipt.state))throw new Error('Original discard has no verified terminal readback; retain its fence');this.discardIntent=null;this.lastDiscardQuery=null;
 }
 hasCloseIntent():boolean{return this.closeIntent!==null;}
 async queryClose():Promise<DesktopCloseOperation|null>{
  const original=this.closeIntent;if(!original)return null;
  if(this.stopped||this.child.exitCode!==null)return this.closeReceipt??{command_id:original.command_id,expected_working_revision:original.revision,state:'unknown'};
  const value=await this.command('query-close',original.revision,original.command_id);if(!isRow(value))throw Error('原退出进度未读回；保留窗口，不重新提交。');
  return this.closeReceipt=readDesktopCloseOperation(value.close_operation,original.command_id,original.revision);
 }
 private async waitForExit():Promise<void>{
  if(!this.stopped&&this.child.exitCode===null)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('工作区已确认关闭，仍在等待本应用后台释放连接。可关闭提示后查看同一次退出进度；没有强制结束进程。')),15000);this.child.once('exit',()=>{clearTimeout(timer);resolve();});});
  if(this.child.exitCode!==0)throw Error('后台已异常结束；保存点与原请求保留，需先核对恢复记录，不将其称为保存成功。');
 }
 async resumeClose():Promise<boolean|null>{
  const original=await this.queryClose();if(!original)return null;
  if(original.state==='failed'){this.closeIntent=null;throw Error('上一次退出已明确被拒绝；窗口与内容保留。请核对当前保存状态后再明确退出，不会重放原命令。');}
  if(!['workspace_closed','completed'].includes(original.state))throw Error('本次退出'+(original.state==='running'?'尚在核对工作区':'结果仍未知')+'。关闭提示会保留窗口；可查看同一次退出进度，不会重放保存、丢弃或科学操作。');
  await this.waitForExit();return true;
 }
 async close(revision:number):Promise<void>{
  if(this.closeIntent)throw Error('Original close command_id='+this.closeIntent.command_id+' remains unresolved or draining; query it without replay.');
  await this.command('close',revision);await this.waitForExit();
 }
 // Parent loss is abnormal recovery, never an implicit Save or Don't Save.
 abnormalDetach():void{if(!this.child.stdin.destroyed&&!this.child.stdin.writableEnded)this.child.stdin.end();}
 async abnormalDrain(timeoutMs=15000):Promise<void>{
  this.abnormalDetach();if(this.stopped||this.child.exitCode!==null)return;
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned backend remains draining after abnormal startup; original requests and drafts are retained, and no process was force-killed.')),timeoutMs);this.child.once('exit',()=>{clearTimeout(timer);resolve();});});
 }
}
