// This entry always runs under ordinary Node. Electron never launches an
// Inspector directly, so all existing process.execPath spawns retain Node.
import {createInterface} from 'node:readline';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {parseResearcherArgs,startResearcherInspector} from './researcher_inspector.mjs';
import type {DesktopDiscardOperation} from '../lib/desktop_contracts.mjs';
import {isRow,panelAddress,readWorkspaceStatus,desktopStartupError} from '../lib/desktop_contracts.mjs';

interface DesktopSessionPorts {request:(action:'status'|'discard'|'close',revision?:number)=>Promise<unknown>;close:()=>Promise<void>;reply:(value:unknown)=>void;joint?:(action:'begin'|'query'|'cancel'|'record-review'|'send-public'|'interrupt',value:Record<string,unknown>)=>Promise<unknown>;}
// A single bounded in-memory lifecycle receipt. It is not a scientific journal
// or a new save database; querying it can only read current workspace status.
export class DesktopBackendSession {
 finished=false;private queue:Promise<void>=Promise.resolve();private discard:DesktopDiscardOperation|null=null;
 constructor(private readonly ports:DesktopSessionPorts){}
 drain():Promise<void>{return this.queue;}
 private state(value:unknown){return {workspace_analysis:readWorkspaceStatus(value)};}
 async dispatch(line:string):Promise<void>{
  let id:unknown=null;
  try{
   if(Buffer.byteLength(line)>8192)throw new Error('Desktop command exceeds bound');const value:unknown=JSON.parse(line);
   if(isRow(value)&&typeof value.action==='string'&&value.action.startsWith('joint-')){
    id=value.id;const name=value.action.slice(6),allowed=name==='begin'?['id','action','expected_working_revision']:['record-review','send-public'].includes(name)?['id','action','review_id','context_sha256']:name==='cancel'?['id','action','review_id']:['id','action'];
    if(!this.ports.joint||this.finished||!Number.isSafeInteger(id)||(id as number)<1||!['begin','query','cancel','record-review','send-public','interrupt'].includes(name)||Object.keys(value).some(k=>!allowed.includes(k))||name==='begin'&&(!Number.isSafeInteger(value.expected_working_revision)||(value.expected_working_revision as number)<0)||['cancel','record-review','send-public'].includes(name)&&(typeof value.review_id!=='string'||!/^[a-f0-9]{32}$/.test(value.review_id))||['record-review','send-public'].includes(name)&&(typeof value.context_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.context_sha256)))throw Error('Invalid private owner review command');
    if(name==='begin'&&this.discard&&['running','unknown'].includes(this.discard.state))throw Error('Original discard remains unresolved');
    const work=this.queue.then(()=>this.ports.joint!(name as 'begin'|'query'|'cancel'|'record-review'|'send-public'|'interrupt',value));this.queue=work.then(()=>{},()=>{});this.ports.reply({id,ok:true,state:await work});return;
   }
   if(!isRow(value)||Object.keys(value).some(k=>!['id','action','expected_working_revision','original_id'].includes(k))||!Number.isSafeInteger(value.id)||(value.id as number)<1||typeof value.action!=='string'||!['status','discard','close','query-discard'].includes(value.action))throw new Error('Invalid desktop command');
   id=value.id;const action=value.action;if(action!=='status'&&(!Number.isSafeInteger(value.expected_working_revision)||(value.expected_working_revision as number)<0))throw new Error('Exact working revision required');if(action!=='query-discard'&&value.original_id!==undefined)throw new Error('Original command ID is only valid for a discard query');
   if(action==='query-discard'||action==='discard'&&this.discard?.command_id===id){
    const originalId=action==='query-discard'?value.original_id:id,record=this.discard;if(!record||record.command_id!==originalId||record.expected_working_revision!==value.expected_working_revision)throw new Error('Original discard command identity/revision does not match the retained receipt');
    // Do not wait behind, cancel, replay or re-enter the write queue.
    const before=record.state;let state=this.state(await this.ports.request('status'));if(record.state!==before)state=this.state(await this.ports.request('status'));this.ports.reply({id,ok:true,state:{...state,discard_operation:{...record}}});return;
   }
   if(this.finished)throw new Error('Backend already closed');
   if(action==='status'){this.ports.reply({id,ok:true,state:this.state(await this.ports.request('status'))});return;}
   if(this.discard&&['running','unknown'].includes(this.discard.state))throw new Error('Original discard command_id='+this.discard.command_id+' remains unresolved; query it before another mutation');
   const record:DesktopDiscardOperation|undefined=action==='discard'?{command_id:id as number,expected_working_revision:value.expected_working_revision as number,state:'running'}:undefined;if(record)this.discard=record;
   const operation=this.queue.then(async()=>{
    try{if(this.finished)throw new Error('Backend already closed');const state=this.state(await this.ports.request(action as 'discard'|'close',value.expected_working_revision as number));if(record)record.state='completed';if(action==='close'){this.finished=true;await this.ports.close();}this.ports.reply({id,ok:true,state});}
    catch(error){if(record)record.state=(error as {code?:string}).code==='DESKTOP_WORKSPACE_REFUSED'?'failed':'unknown';throw error;}
   });this.queue=operation.catch(()=>{});await operation;
  }catch(error){this.ports.reply({id,ok:false,error:error instanceof Error?error.message:String(error),...((error as {code?:string})?.code==='DESKTOP_WORKSPACE_REFUSED'?{code:'DESKTOP_WORKSPACE_REFUSED'}:{})});}
 }
}

export async function runDesktopBackend(argv:readonly string[]):Promise<void>{
 if(process.versions.electron)throw new Error('Desktop backend requires ordinary Node.');
 const instance=await startResearcherInspector(parseResearcherArgs(argv)),address=panelAddress(instance.panel.url);
 const reply=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
 const request=async(action:'status'|'discard'|'close',revision?:number):Promise<unknown>=>{
  const response=await fetch(address.origin+'/api/workspace',{method:action==='status'?'GET':'POST',headers:{'x-panel-token':address.token,...(action!=='status'?{'content-type':'application/json',origin:address.origin}:{})},...(action!=='status'?{body:JSON.stringify({action,expected_working_revision:revision})}:{})});
  const body:unknown=await response.json();if(!response.ok)throw Object.assign(new Error(isRow(body)&&typeof body.error==='string'?body.error:'Workspace operation refused ('+response.status+')'),{code:'DESKTOP_WORKSPACE_REFUSED'});readWorkspaceStatus(body);return body;
 };
 reply({type:'ready',schema_version:1,url:address.url,pid:process.pid,node:process.version});
 const input=createInterface({input:process.stdin,crlfDelay:Infinity});
 const session=new DesktopBackendSession({request,reply,joint:(action,value)=>instance.panel.jointCommand(action,value),close:async()=>{await instance.close();input.close();process.stdin.pause();}});
 input.on('line',line=>{void session.dispatch(line);});
 input.once('close',()=>{void session.drain().then(async()=>{
  if(!session.finished){session.finished=true;await (instance.close as (options?:{abnormal?:boolean})=>Promise<void>)({abnormal:true});}
 }).catch(error=>{process.stderr.write('Desktop backend shutdown: '+(error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});});
}
if(isDirectInvocation(import.meta.url))runDesktopBackend(process.argv.slice(2)).catch(error=>{const failure=desktopStartupError(error);process.stdout.write(JSON.stringify(failure)+'\n');process.stderr.write(failure.code+': '+failure.message+'\n');process.exitCode=1;});
