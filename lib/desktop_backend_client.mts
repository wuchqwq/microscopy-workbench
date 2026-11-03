import {spawn} from 'node:child_process';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isRow,panelAddress,readWorkspaceStatus,researcherArguments} from './desktop_contracts.mjs';
import type {DesktopOptions,DesktopWorkspaceStatus} from './desktop_contracts.mjs';

export class DesktopBackendClient {
 readonly child:ChildProcessWithoutNullStreams;readonly ready:Promise<{url:string;node:string}>;
 private pending=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();private next=0;private buffer='';private stopped=false;
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
    else{const pending=this.pending.get(Number(message.id));if(!pending)continue;this.pending.delete(Number(message.id));clearTimeout(pending.timer);if(message.ok===true)pending.resolve(message.state);else pending.reject(new Error(typeof message.error==='string'?message.error:'Desktop backend operation failed'));}
   }catch(error){failure(error instanceof Error?error:new Error(String(error)));}}
  });
  // Progress and bounded provider diagnostics stay on stderr, not JSON stdout.
  this.child.stderr.on('data',(chunk:Buffer)=>process.stderr.write(chunk));
  this.child.once('error',failure);this.child.once('exit',(code,signal)=>{this.stopped=true;failure(new Error('Desktop backend exited ('+String(code??signal)+'); query original scientific requests before retrying.'));});
  this.child.stdin.on('error',failure);
 }
 private async command(action:'status'|'discard'|'close',revision?:number):Promise<unknown>{
  await this.ready;if(this.stopped)throw new Error('Desktop backend has stopped');
  return await new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Stopped waiting for workspace '+action+'; keep the window open and query the original state.'));},15000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,action,...(revision!==undefined?{expected_working_revision:revision}:{})})+'\n');});
 }
 async status():Promise<DesktopWorkspaceStatus>{return readWorkspaceStatus(await this.command('status'));}
 async discard(revision:number):Promise<DesktopWorkspaceStatus>{return readWorkspaceStatus(await this.command('discard',revision));}
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
