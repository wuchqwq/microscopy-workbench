// Shared Node service for CLI and Electron main; never reads workspace/context.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CodexStdioHost} from './codex_stdio_host.mjs';
import {SYNTHETIC_HOST_NOTICE} from './research_host.mjs';
import type {ResearchHost,HostEvent,HostSnapshot} from './research_host.mjs';
export type SyntheticHostScenario='normal'|'invalid'|'invalid-error'|'duplicate'|'late'|'rpc-error'|'hang'|'out-of-order'|'tool'|'wrong-thread'|'flood'|'many-frames'|'multi-item'|'final-items'|'conflicting-final'|'unfinished-item'|'invalid-utf8'|'delayed-close'|'early-final'|'message-count-bound'|'message-text-bound'|'early-text-bound'|'early-invalid-phase'|'early-multi-final';
export function syntheticHostEnvironment(){
 const environment:Record<string,string>={};
 // The fake peer needs neither the current host's credentials nor its profile.
 for(const key of ['SystemRoot','WINDIR','TEMP','TMP'])if(typeof process.env[key]==='string')environment[key]=process.env[key]!;
 return environment;
}
export function createSyntheticHost(node:string,scenario:SyntheticHostScenario='normal',options:{timeoutMs?:number;onWire?:(direction:'send'|'receive',message:Record<string,unknown>)=>void}={}){
 const fixture=fileURLToPath(new URL('../tools/synthetic_codex_app_server.mjs',import.meta.url));
 return new CodexStdioHost({executable:node,verification:'synthetic',...options,spawnProcess:(executable,args,settings)=>spawn(executable,[fixture,'--case='+scenario,...args],{...settings,env:syntheticHostEnvironment()})});
}
export function awaitHostState(host:ResearchHost,predicate:(snapshot:HostSnapshot)=>boolean,timeout=5000):Promise<HostSnapshot>{
 if(predicate(host.snapshot()))return Promise.resolve(host.snapshot());
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('Synthetic host state not observed'));},timeout);
  const off=host.subscribe(event=>{if(event.kind!=='host_state')return;if(predicate(event.snapshot)){clearTimeout(timer);off();resolve(event.snapshot);}
   else if(['closed','failed'].includes(event.snapshot.connection)){clearTimeout(timer);off();reject(new Error('Host ended before the required state'));}});});
}
export async function runSyntheticHostDemo(node:string,signal?:AbortSignal){
 if(signal?.aborted)throw new Error('Synthetic host test cancelled before start');
 const wire:{direction:'send'|'receive';message:Record<string,unknown>}[]=[],events:HostEvent[]=[];
 const host=createSyntheticHost(node,'normal',{onWire:(direction,message)=>wire.push({direction,message})});host.subscribe(event=>events.push(event));
 const abort=()=>{void host.close();};signal?.addEventListener('abort',abort,{once:true});
 let closed=false;
 try{
  await host.connect();const handle=await host.startSession({task_id:'synthetic-host-task',context_sha256:'0'.repeat(64)});
  await host.startTurn('Synthetic protocol test only; no image, research data or real model.');await awaitHostState(host,s=>s.turn_state==='completed');
  await host.resumeSession(handle);await host.startTurn('Synthetic continuation; exercise a blocked approval without execution.');
  await awaitHostState(host,s=>s.turn_state==='awaiting_user');await host.interrupt();await awaitHostState(host,s=>s.turn_state==='interrupted');
  closed=await host.close();if(!closed)throw new Error('Synthetic child close was not confirmed');
  return {notice:SYNTHETIC_HOST_NOTICE,real_codex_connected:false,scientific_execution:false,workspace_read:false,handle,final:host.snapshot(),wire,events};
 }finally{signal?.removeEventListener('abort',abort);if(!closed)await host.close();}
}
