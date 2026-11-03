import {spawn} from 'node:child_process';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isRow,panelAddress,readWorkspaceStatus,researcherArguments,readDesktopStartupError,DESKTOP_RESTORE_WAIT_MS,readDesktopDiscardOperation} from './desktop_contracts.mjs';
import type {DesktopOptions,DesktopWorkspaceStatus,DesktopDiscardQuery,DesktopDiscardOperation} from './desktop_contracts.mjs';

export class DesktopBackendClient {
 readonly child:ChildProcessWithoutNullStreams;readonly ready:Promise<{url:string;node:string}>;
 private closeIntent:number|null=null;private lastDiscardQuery:DesktopDiscardOperation|null=null;
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
    else{if(typeof message.id!=='number'||!Number.isSafeInteger(message.id)||message.id<1||typeof message.ok!=='boolean')throw new Error('Invalid backend operation reply; original command remains unresolved');const pending=this.pending.get(message.id);if(!pending)continue;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.ok===true)pending.resolve(message.state);else{if(pending.action==='close'&&message.code==='DESKTOP_WORKSPACE_REFUSED')this.closeIntent=null;pending.reject(Object.assign(new Error(typeof message.error==='string'?message.error:'Desktop backend operation failed'),{code:message.code}));}}
   }catch(error){failure(error instanceof Error?error:new Error(String(error)));}}
  });
  // Progress and bounded provider diagnostics stay on stderr, not JSON stdout.
  this.child.stderr.on('data',(chunk:Buffer)=>process.stderr.write(chunk));
  this.child.once('error',failure);this.child.once('exit',(code,signal)=>{this.stopped=true;failure(new Error('Desktop backend exited ('+String(code??signal)+'); query original scientific requests before retrying.'));});
  this.child.stdin.on('error',failure);
 }
 private async command(action:'status'|'discard'|'close'|'query-discard',revision?:number,originalId?:number):Promise<unknown>{
  await this.ready;if(['discard','close'].includes(action)&&this.closeIntent!==null)throw new Error('Original close command_id='+this.closeIntent+' remains unresolved or draining; it will not be submitted again.');if(this.stopped)throw new Error('Desktop backend has stopped');if(['discard','close'].includes(action)&&this.discardIntent)throw new Error('Original discard command_id='+this.discardIntent.command_id+' remains unresolved; query it before any new discard or close.');
  return await new Promise((resolve,reject)=>{const id=++this.next;if(action==='close')this.closeIntent=id;if(action==='discard')this.discardIntent={command_id:id,revision:revision!};const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Stopped waiting for workspace '+action+' command_id='+id+'; keep the window open. The original operation may still complete; query it without replay.'));},action==='discard'?DESKTOP_RESTORE_WAIT_MS:15000);this.pending.set(id,{resolve,reject,timer,action});this.child.stdin.write(JSON.stringify({id,action,...(revision!==undefined?{expected_working_revision:revision}:{}),...(originalId!==undefined?{original_id:originalId}:{})})+'\n');});
 }
 async status():Promise<DesktopWorkspaceStatus>{return readWorkspaceStatus(await this.command('status'));}
 async discard(revision:number):Promise<DesktopWorkspaceStatus>{const result=readWorkspaceStatus(await this.command('discard',revision));this.discardIntent=null;return result;}
 async queryDiscard():Promise<DesktopDiscardQuery|null>{
  const original=this.discardIntent;if(!original)return null;const reply=await this.command('query-discard',original.revision,original.command_id);if(!isRow(reply))throw new Error('Original discard query is malformed');const operation=readDesktopDiscardOperation(reply.discard_operation,original.command_id,original.revision),status=readWorkspaceStatus(reply);this.lastDiscardQuery=operation;return {operation,status};
 }
 acknowledgeDiscard(commandId:number,revision:number):void {
  const original=this.discardIntent,receipt=this.lastDiscardQuery;if(!original||original.command_id!==commandId||original.revision!==revision||receipt?.command_id!==commandId||receipt.expected_working_revision!==revision||!['completed','failed'].includes(receipt.state))throw new Error('Original discard has no verified terminal readback; retain its fence');this.discardIntent=null;this.lastDiscardQuery=null;
 }
 async close(revision:number):Promise<void>{
  await this.command('close',revision);
  if(this.child.exitCode===null&&!this.stopped)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Workspace closed but owned backend is still draining; no process was killed.')),15000);this.child.once('exit',()=>{clearTimeout(timer);resolve();});});
 }
 // Parent loss is abnormal recovery, never an implicit Save or Don't Save.
 abnormalDetach():void{if(!this.child.stdin.destroyed&&!this.child.stdin.writableEnded)this.child.stdin.end();}
 async abnormalDrain(timeoutMs=15000):Promise<void>{
  this.abnormalDetach();if(this.stopped||this.child.exitCode!==null)return;
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned backend remains draining after abnormal startup; original requests and drafts are retained, and no process was force-killed.')),timeoutMs);this.child.once('exit',()=>{clearTimeout(timer);resolve();});});
 }
}
