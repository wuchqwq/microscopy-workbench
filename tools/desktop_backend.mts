// This entry always runs under ordinary Node. Electron never launches an
// Inspector directly, so all existing process.execPath spawns retain Node.
import {createInterface} from 'node:readline';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {parseResearcherArgs,startResearcherInspector} from './researcher_inspector.mjs';
import {isRow,panelAddress,readWorkspaceStatus} from '../lib/desktop_contracts.mjs';

export async function runDesktopBackend(argv:readonly string[]):Promise<void>{
 if(process.versions.electron)throw new Error('Desktop backend requires ordinary Node.');
 const instance=await startResearcherInspector(parseResearcherArgs(argv)),address=panelAddress(instance.panel.url);
 let finished=false;
 const reply=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
 const request=async(action:'status'|'discard'|'close',revision?:number):Promise<unknown>=>{
  const response=await fetch(address.origin+'/api/workspace',{method:action==='status'?'GET':'POST',headers:{'x-panel-token':address.token,...(action!=='status'?{'content-type':'application/json',origin:address.origin}:{})},...(action!=='status'?{body:JSON.stringify({action,expected_working_revision:revision})}:{})});
  const body:unknown=await response.json();if(!response.ok)throw new Error(isRow(body)&&typeof body.error==='string'?body.error:'Workspace operation refused ('+response.status+')');readWorkspaceStatus(body);return body;
 };
 reply({type:'ready',schema_version:1,url:address.url,pid:process.pid,node:process.version});
 const input=createInterface({input:process.stdin,crlfDelay:Infinity});let queue:Promise<void>=Promise.resolve();
 input.on('line',line=>{
  queue=queue.then(async()=>{
   let id:unknown=null;
   try{
    if(finished)throw new Error('Backend already closed');if(Buffer.byteLength(line)>8192)throw new Error('Desktop command exceeds bound');
    const value:unknown=JSON.parse(line);if(!isRow(value)||Object.keys(value).some(k=>!['id','action','expected_working_revision'].includes(k))||!Number.isSafeInteger(value.id)||(value.id as number)<1||!['status','discard','close'].includes(String(value.action)))throw new Error('Invalid desktop command');
    id=value.id;if(value.action!=='status'&&(!Number.isSafeInteger(value.expected_working_revision)||(value.expected_working_revision as number)<0))throw new Error('Exact working revision required');
    // The native main process needs only authoritative lifecycle fields. Do not
    // forward scientific arrays, image base64 or private metadata through IPC.
    const state={workspace_analysis:readWorkspaceStatus(await request(value.action as 'status'|'discard'|'close',value.expected_working_revision as number|undefined))};
    if(value.action==='close'){finished=true;await instance.close();reply({id,ok:true,state});input.close();process.stdin.pause();}
    else reply({id,ok:true,state});
   }catch(error){reply({id,ok:false,error:error instanceof Error?error.message:String(error)});}
  });
 });
 input.once('close',()=>{void queue.then(async()=>{
  if(!finished){finished=true;await (instance.close as (options?:{abnormal?:boolean})=>Promise<void>)({abnormal:true});}
 }).catch(error=>{process.stderr.write('Desktop backend shutdown: '+(error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});});
}
if(isDirectInvocation(import.meta.url))runDesktopBackend(process.argv.slice(2)).catch(error=>{process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});
