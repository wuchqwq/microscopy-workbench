// App-server adapter. Optional text-only scientific callback port; no direct
// credential reads or image qualification occurs here.
import path from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {TextDecoder} from 'node:util';
import type {ChildProcessWithoutNullStreams} from 'node:child_process';
import {readHostTaskRef,SYNTHETIC_HOST_NOTICE} from './research_host.mjs';
import {hostTurnWireInput} from './research_host_input.mjs';
import {researchTurnDispatch,ResearchDispatchRefused,assertJointResearchCallback} from './research_host_dispatch.mjs';
import type {ApprovedResearchTurn} from './research_host_dispatch.mjs';
import type {ResearchHost,HostTaskRef,HostHandle,HostSnapshot,HostEvent,HostAgentMessage,HostProtocolDiagnostic,HostToolStatus} from './research_host.mjs';
import {notificationMetadata,protocolHash} from './research_host_notifications.mjs';
import type {TextToolPort,TextToolCall} from './research_text_tools.mjs';
import {readSavedResearchToolBinding} from './research_text_tools.mjs';
import {textHostProcess} from './research_text_runtime.mjs';
import {REAL_JOINT_DELIVERY_ENABLED,PUBLIC_JOINT_EXECUTABLE,PUBLIC_JOINT_ARRAY_SHA,PUBLIC_JOINT_MODEL,publicJointArguments,publicJointConfig,publicJointDirectory,verifyPublicJointRuntime} from './public_joint_runtime.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256;
const terminal=new Set(['completed','interrupted','failed']);
const INPUT_LIMIT_BYTES=1024*1024;
const approvals=new Set(['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval','item/tool/requestUserInput','tool/requestUserInput','mcpServer/elicitation/request']);
const executionNotifications=new Set(['item/commandExecution/outputDelta','item/commandExecution/terminalInteraction','item/mcpToolCall/progress','item/fileChange/outputDelta','item/fileChange/patchUpdated','turn/diff/updated']);
type SpawnPort=(executable:string,args:string[],options:{stdio:['pipe','pipe','pipe'];windowsHide:true;env?:NodeJS.ProcessEnv;cwd?:string})=>ChildProcessWithoutNullStreams;
export interface CodexHostOptions {executable:string;verification?:'synthetic'|'unverified';spawnProcess?:SpawnPort;timeoutMs?:number;onWire?:(direction:'send'|'receive',message:Row)=>void;process?:{env:NodeJS.ProcessEnv;cwd:string};textTools?:{port:TextToolPort;model?:string};jointTools?:{tools:unknown;peer?:JointResearchMemoryPeer;officialRuntime?:object};}
const officialRuntimes=new WeakMap<object,{args:string[];process:{cwd:string;env:NodeJS.ProcessEnv}}>();
// Construction is not disclosure consent. The caller must still obtain the
// original one-shot joint gate grant after reviewing the concrete send plan.
export function createPublicSyntheticJointHost({tools,directory,onWire}:{tools:unknown;directory:string;onWire?:CodexHostOptions['onWire']}){
 const binding=readSavedResearchToolBinding(tools);binding.assertCurrent();
 if(binding.source.array_sha256!==PUBLIC_JOINT_ARRAY_SHA||binding.source.dtype!=='uint16'||JSON.stringify(binding.source.shape_yx)!=='[64,64]'||JSON.stringify(binding.scope.source_rect_xyxy)!=='[0,0,64,64]')throw Error('Only the exact full public synthetic intensity array is admitted');
 if(!REAL_JOINT_DELIVERY_ENABLED)throw Error('Real joint delivery remains blocked by the unresolved system refusal; local review only');
 const runtime=Object.freeze({}),settings=textHostProcess(publicJointDirectory(directory),true,undefined,process.env);
 officialRuntimes.set(runtime,{args:publicJointArguments(),process:settings.process});
 return new CodexStdioHost({executable:PUBLIC_JOINT_EXECUTABLE,verification:'unverified',timeoutMs:30000,jointTools:{tools,officialRuntime:runtime},onWire});
}
// General saved-view production transport. This is not disclosure approval:
// the exact process-local review/grant remains mandatory at startTurn. The
// completion candidate's hard guard stops before process/authentication setup.
export function createReviewedJointHost({tools,directory,onWire}:{tools:unknown;directory:string;onWire?:CodexHostOptions['onWire']}){
 const binding=readSavedResearchToolBinding(tools);binding.assertCurrent();
 if(!REAL_JOINT_DELIVERY_ENABLED)throw Error('Real joint delivery remains blocked by the unresolved system refusal; local review only');
 const runtime=Object.freeze({}),settings=textHostProcess(publicJointDirectory(directory),true,undefined,process.env);
 officialRuntimes.set(runtime,{args:publicJointArguments(),process:settings.process});
 return new CodexStdioHost({executable:PUBLIC_JOINT_EXECUTABLE,verification:'unverified',timeoutMs:30000,jointTools:{tools,officialRuntime:runtime},onWire});
}
// Fixed local protocol peer: no callback can select a process, stream or sink.
// The public value is only a frozen control/inspection handle; its transport
// stays in this module's private identity table and is claimable once.
declare const memoryPeerBrand:unique symbol;
export interface JointResearchMemoryPeer {readonly [memoryPeerBrand]:true;receive(message:unknown):void;received():Row[];waitFor(id:string|number):Promise<Row>;}
const memoryPeers=new WeakMap<object,{child:ChildProcessWithoutNullStreams;claimed:boolean}>();
const jointMemoryHosts=new WeakMap<object,TextToolPort>();
export function createJointResearchMemoryPeer({threadId='joint-thread',turnId='joint-turn'}:{threadId?:string;turnId?:string}={}):JointResearchMemoryPeer {
 if(!id(threadId)||!id(turnId))throw Error('Bounded synthetic identities required');
 const child=new EventEmitter(),stdout=new PassThrough(),stderr=new PassThrough(),messages:Row[]=[],waiting=new Map<string|number,(message:Row)=>void>();let closed=false,bytes=0,turnCount=0;
 const receive=(message:unknown)=>{if(closed)throw Error('Memory peer is closed');const raw=JSON.stringify(message);if(typeof raw!=='string'||Buffer.byteLength(raw)>INPUT_LIMIT_BYTES)throw Error('Bounded synthetic message required');stdout.write(raw+'\n');};
 const stdin=new Writable({write(chunk:Buffer,_encoding,done){try{const raw=chunk.toString('utf8');bytes+=Buffer.byteLength(raw);if(bytes>8*INPUT_LIMIT_BYTES||messages.length>=256)throw Error('Memory transcript bound exceeded');const m:unknown=JSON.parse(raw);if(!row(m))throw Error('Memory protocol object required');messages.push(m);queueMicrotask(()=>{if(closed)return;if(m.method==='initialize')receive({id:m.id,result:{}});if(m.method==='thread/start')receive({id:m.id,result:{thread:{id:threadId}}});if(m.method==='turn/start')receive({id:m.id,result:{turn:{id:++turnCount===1?turnId:turnId.slice(0,252)+'-'+turnCount}}});if(m.method==='turn/interrupt')receive({id:m.id,result:{}});if((typeof m.id==='string'||typeof m.id==='number')&&waiting.has(m.id)){const resolve=waiting.get(m.id)!;waiting.delete(m.id);resolve(structuredClone(m));}});done();}catch(error){done(error as Error);}}});
 const close=(code:number|null,signal:NodeJS.Signals|null)=>{if(closed)return;closed=true;queueMicrotask(()=>child.emit('close',code,signal));};stdin.once('finish',()=>close(0,null));
 Object.assign(child,{stdin,stdout,stderr,kill:()=>{close(null,'SIGTERM');return true;}});
 const peer=Object.freeze({receive,received:()=>structuredClone(messages),waitFor(messageId:string|number){if(!(typeof messageId==='string'&&id(messageId)||typeof messageId==='number'&&Number.isSafeInteger(messageId))||waiting.size>=16||waiting.has(messageId))throw Error('Bounded distinct memory reply identity required');const prior=messages.find(m=>m.id===messageId);if(prior)return Promise.resolve(structuredClone(prior));return new Promise<Row>(resolve=>waiting.set(messageId,resolve));}}) as JointResearchMemoryPeer;
 memoryPeers.set(peer,{child:child as ChildProcessWithoutNullStreams,claimed:false});return peer;
}
export function assertJointMemoryHost(host:unknown,tools:unknown):void {
 const port=typeof host==='object'&&host!==null?jointMemoryHosts.get(host):undefined;if(!port||port!==readSavedResearchToolBinding(tools).port)throw Error('Real visual delivery remains blocked; original fixed-memory joint host required');
}
function wireMetadata(message:Row):Row{return {...(typeof message.method==='string'?{method:message.method}:{}),...(typeof message.id==='string'||typeof message.id==='number'?{id:message.id}:{})};}
class RpcRejected extends Error {constructor(readonly rpcCode:number){super('Host rejected the requested RPC ('+rpcCode+'); no automatic retry');}}
export class CodexStdioHost implements ResearchHost {
 private state:Omit<HostSnapshot,'agent_messages'|'unfinished_agent_message_ids'>;
 private agentMessages=new Map<string,HostAgentMessage|null>();private completedTextBytes=0;
 private decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 #child:ChildProcessWithoutNullStreams|undefined;
 private listeners=new Set<(event:HostEvent)=>void>();
 private sequence=0;private inputBuffer:Buffer|undefined;private inputBytes=0;private inputPeak=0;private receivedBytes=0;private inputStopped=false;
 private terminationRequested=false;private stopSignalSent:boolean|null=null;
 private starting=false;private sessionPending=false;private early:Row[]=[];
 private pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private retired=new Set<number>();private serverRequests=new Map<string,string>();
 private interruptFor:string|null=null;private interruptCall:Promise<void>|undefined;
 private closed!:Promise<void>;private closeObserved=false;private closeCall:Promise<boolean>|undefined;
 private readonly timeout:number;
 readonly #textPort:TextToolPort|undefined;
 readonly #jointChild:ChildProcessWithoutNullStreams|undefined;readonly #observer:CodexHostOptions['onWire'];
 readonly #jointPort:TextToolPort|undefined;private jointInput:ApprovedResearchTurn|undefined;
 readonly #officialRuntime:{args:string[];process:{cwd:string;env:NodeJS.ProcessEnv}}|undefined;private officialIdentity:ReturnType<typeof verifyPublicJointRuntime>|null=null;
 private toolAbort=new AbortController();
 private toolQueue:Promise<void>=Promise.resolve();
 private diagnosticSequence=0;private diagnosticCounts={informational_emitted:0,issues_emitted:0,informational_dropped:0,issues_dropped:0};
 private toolItems=new Map<string,HostToolStatus>();private blockedRequests=new Set<string>();
 private itemTypes=new Map<string,string>();
 constructor(private readonly options:CodexHostOptions){
  if(!path.isAbsolute(options.executable))throw new Error('Configure an explicit absolute executable; no discovery or installation');
  this.timeout=options.timeoutMs??5000;if(!Number.isSafeInteger(this.timeout)||this.timeout<10||this.timeout>60000)throw new Error('Bounded host RPC timeout required');
  this.#observer=options.onWire;
  if(options.textTools){const port=options.textTools.port;this.#textPort={definitions:structuredClone(port.definitions),call:port.call.bind(port)};}
  if(options.jointTools){
   const official=options.jointTools.officialRuntime&&officialRuntimes.get(options.jointTools.officialRuntime);
   if(official){
    if(options.executable!==PUBLIC_JOINT_EXECUTABLE||options.verification!=='unverified'||options.spawnProcess!==undefined||options.process!==undefined||options.textTools||options.jointTools.peer)throw Error('Original restricted official joint runtime required');
    officialRuntimes.delete(options.jointTools.officialRuntime!);this.#officialRuntime=structuredClone(official);const binding=readSavedResearchToolBinding(options.jointTools.tools);this.#jointPort=binding.port;this.#textPort={definitions:structuredClone(binding.port.definitions),call:binding.port.call.bind(binding.port)};
   }else{
   if(options.textTools||options.verification!=='synthetic'||options.spawnProcess!==undefined||options.process!==undefined)throw Error('Real joint visual transport remains blocked pending independent review; only an explicit synthetic peer is available');
   const peer=typeof options.jointTools.peer==='object'&&options.jointTools.peer!==null?memoryPeers.get(options.jointTools.peer):undefined;if(!peer||peer.claimed)throw Error('Real joint visual transport remains blocked pending independent review; original unused fixed-memory peer required');
   const binding=readSavedResearchToolBinding(options.jointTools.tools);peer.claimed=true;this.#jointChild=peer.child;this.#jointPort=binding.port;jointMemoryHosts.set(this,binding.port);this.#textPort={definitions:structuredClone(binding.port.definitions),call:binding.port.call.bind(binding.port)};
   }
  }
  if(options.process&&!path.isAbsolute(options.process.cwd))throw Error('Explicit process cwd required');
  this.state={host_kind:'codex',verification:options.verification??'unverified',connection:'not_started',thread_id:null,turn_id:null,turn_state:'idle',task:null,session_revision:0,transport_close:null,notice:options.verification==='synthetic'?SYNTHETIC_HOST_NOTICE:'Codex 适配尚未联调；真实启动入口、身份和数据发送需另行确认。'};
  if(this.#textPort)this.state.notice=options.verification==='synthetic'?'本地脚本协议 peer，非模型；科学 provider 执行另有日志证据，图像发送关闭。':'Codex 纯文本科学工具会话；图像发送关闭，真实推理以运行证据为准。';
  if(this.#jointPort)this.state.notice='本地合成图像与受限工具协议；非模型、非真实用户授权，无外发。';
  if(this.#officialRuntime)this.state.notice='公开合成强度图的官方真实模型测试；发送需另行核对准确计划，仅统计与原请求查询。';
 }
 officialRuntimeIdentity(){return this.officialIdentity?structuredClone(this.officialIdentity):null;}
 snapshot():HostSnapshot{return structuredClone({...this.state,agent_messages:[...this.agentMessages.values()].filter((m):m is HostAgentMessage=>m!==null),unfinished_agent_message_ids:[...this.agentMessages].filter(([,m])=>m===null).map(([itemId])=>itemId)});}
 // Transport diagnostics, not official wire fields or a total-process RSS bound.
 inputDiagnostics(){return {limit_bytes:INPUT_LIMIT_BYTES,buffered_bytes:this.inputBytes,buffer_capacity_bytes:this.inputBuffer?.length??0,peak_buffered_bytes:this.inputPeak,received_bytes:this.receivedBytes,stopped:this.inputStopped,pending_requests:this.pending.size,termination_requested:this.terminationRequested,stop_signal_sent:this.stopSignalSent};}
 notificationDiagnostics(){return {...this.diagnosticCounts,limit_each:128};}
 private diagnose(method:string,p:Row,classification:HostProtocolDiagnostic['classification'],association?:HostProtocolDiagnostic['association']){
  const turn=row(p.turn)?p.turn:{},threadId=p.threadId,turnId=p.turnId??turn.id;
  association??=threadId===this.state.thread_id&&this.state.thread_id?(turnId===undefined?'thread':turnId===this.state.turn_id&&this.state.turn_id?'turn':'mismatch'):threadId===undefined?'unbound':'mismatch';
  const issue=['error','warning','identity_mismatch','unknown','invalid','risk','late'].includes(classification),emitted=issue?'issues_emitted':'informational_emitted',dropped=issue?'issues_dropped':'informational_dropped';this.diagnosticSequence++;
  if(this.diagnosticCounts[emitted]>=128){this.diagnosticCounts[dropped]++;if(this.diagnosticCounts[dropped]===1)this.warning(issue?'protocol_issue_diagnostic_limit':'protocol_metadata_diagnostic_limit');if(issue)this.fail('Host issue diagnostic bound exceeded; active outcome unknown, no replay');return;}
  this.diagnosticCounts[emitted]++;this.emit({kind:'host_protocol_diagnostic',...notificationMetadata(this.diagnosticSequence,method,p,classification,association)});
 }
 subscribe(listener:(event:HostEvent)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private emit(event:HostEvent){for(const listener of this.listeners)try{listener(structuredClone(event));}catch{/* A display observer cannot change transport state. */}}
 private changed(){this.emit({kind:'host_state',snapshot:this.snapshot()});}
 private warning(reason:string){this.emit({kind:'host_warning',reason});}
 private busy(){return ['starting','running','awaiting_user','unknown'].includes(this.state.turn_state);}
 private requireReady(){if(this.state.connection!=='ready')throw new Error('Host is not ready; do not replay unknown work');}
 #write(message:Row,beforeWrite?:()=>void){
  this.#observer?.('send',this.#jointPort?wireMetadata(message):structuredClone(message));const bytes=JSON.stringify(message)+'\n';
  // Last external observer has returned and bytes are fixed. No await, event
  // listener or other owner callback occurs between this guard and stdin.write.
  if(beforeWrite)try{beforeWrite();}catch(error){throw new ResearchDispatchRefused(error instanceof Error?error.message:'Research dispatch refused');}
  this.#child!.stdin.write(bytes,error=>{if(error)this.fail('Host input failed; outcome may be unknown');});
 }
 private retire(n:number){this.retired.add(n);if(this.retired.size>256)this.retired.delete(this.retired.values().next().value!);}
 private stopInput(){this.inputStopped=true;this.inputBytes=0;this.inputBuffer=undefined;}
 private fail(reason:string){
  if(this.state.connection==='closed'||this.state.connection==='failed')return;
  this.state.connection='failed';if(this.busy())this.state.turn_state='unknown';this.starting=false;this.early=[];this.stopInput();this.serverRequests.clear();
  this.toolAbort.abort();
  for(const [n,p]of this.pending){clearTimeout(p.timer);this.retire(n);p.reject(new Error(reason));}this.pending.clear();this.changed();this.warning(reason);
 }
 private abortInput(reason:string){
  this.terminationRequested=true;this.fail(reason);
  // Own direct child only. A signal request is not proof of exit or tool cancellation.
  this.#child?.stdout.destroy();
  if(this.#child&&!this.closeObserved){
   if(!this.#child.stdin.destroyed&&!this.#child.stdin.writableEnded)this.#child.stdin.end();
   try{this.stopSignalSent=this.#child.kill();}catch{this.stopSignalSent=false;}
   if(!this.stopSignalSent)this.warning('host_termination_unconfirmed');
  }
 }
 private consume(chunk:Buffer){
  if(this.inputStopped)return;this.receivedBytes+=chunk.length;
  let start=0;
  while(start<chunk.length){
   const newline=chunk.indexOf(10,start),end=newline<0?chunk.length:newline,size=end-start;
   // Check raw bytes BEFORE allocating/copying/decoding; never retain the bad tail.
   if(size>INPUT_LIMIT_BYTES-this.inputBytes){this.abortInput('Host input frame bound exceeded; active outcome unknown, no resend');return;}
   if(size){this.inputBuffer??=Buffer.alloc(INPUT_LIMIT_BYTES);chunk.copy(this.inputBuffer,this.inputBytes,start,end);this.inputBytes+=size;this.inputPeak=Math.max(this.inputPeak,this.inputBytes);}
   if(newline<0)return;
   let line:string;try{line=this.inputBuffer?this.decoder.decode(this.inputBuffer.subarray(0,this.inputBytes)):'';}catch{this.abortInput('Invalid UTF-8 host frame; active outcome unknown, no resend');return;}this.inputBytes=0;
   if(line.trim())try{this.receive(JSON.parse(line));}catch{this.fail('Invalid host wire message; no retry');}
   if(this.inputStopped)return;start=end+1;
  }
 }
 private request(method:string,params:Row,beforeWrite?:()=>void):Promise<unknown>{
  if(this.pending.size>=16)throw new Error('Host request bound exceeded');
  const n=++this.sequence;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.fail('Host RPC timed out; original outcome unknown, no resend');},this.timeout);this.pending.set(n,{resolve,reject,timer});
   try{this.#write({id:n,method,params},beforeWrite);}catch(error){clearTimeout(timer);this.pending.delete(n);this.retire(n);reject(error);}
  });
 }
 async connect(){
  if(this.state.connection!=='not_started')throw new Error('One initialization per adapter connection');
  this.state.connection='initializing';this.changed();
  let finish!:()=>void;this.closed=new Promise(resolve=>{finish=resolve;});
  try{this.#child=this.#jointChild??(this.#officialRuntime?spawn(PUBLIC_JOINT_EXECUTABLE,this.#officialRuntime.args,{stdio:['pipe','pipe','pipe'],windowsHide:true,...this.#officialRuntime.process}):(this.options.spawnProcess??spawn)(this.options.executable,['app-server'],{stdio:['pipe','pipe','pipe'],windowsHide:true,...(this.options.process?{cwd:this.options.process.cwd,env:{...this.options.process.env}}:{})}));}
  catch{this.closeObserved=true;finish();this.fail('Host spawn failed; no automatic retry');throw new Error('Host spawn failed');}
  this.#child.stderr.on('data',()=>{/* Drain without collecting possibly sensitive diagnostics. */});
  this.#child.stdout.on('data',(chunk:Buffer)=>this.consume(chunk));
  this.#child.once('error',()=>this.fail('Host process error; no automatic retry'));
  this.#child.stdin.on('error',()=>this.fail('Host input closed; outcome may be unknown'));
  this.#child.once('close',(code,signal)=>{this.closeObserved=true;if(this.inputBytes)this.warning('incomplete_wire_line');this.stopInput();
   this.toolAbort.abort();
   for(const [n,p]of this.pending){clearTimeout(p.timer);this.retire(n);p.reject(new Error('Host closed; outcome may be unknown'));}this.pending.clear();
   if(this.busy())this.state.turn_state='unknown';this.state.connection='closed';this.state.transport_close={exit_code:code,signal};this.emit({kind:'host_transport_closed',exit_code:code,signal});this.changed();finish();});
  try{const initialized=await this.request('initialize',{clientInfo:{name:'microscopy_workbench',title:'Microscopy Workbench',version:'0.1.0'},...(this.#textPort?{capabilities:{experimentalApi:true}}:{})});
   if(this.state.connection!=='initializing'||!row(initialized))throw new Error('Invalid or cancelled initialize response');this.#write({method:'initialized',params:{}});
   if(this.#officialRuntime){const config=await this.request('config/read',{includeLayers:false,cwd:this.#officialRuntime.process.cwd}),mcp=await this.request('mcpServerStatus/list',{});this.officialIdentity=verifyPublicJointRuntime(row(config)?config.config:null,mcp);}
   this.state.connection='ready';this.changed();
  }catch(error){this.fail('Host initialization failed; do not retry automatically');throw error;}
 }
 async authenticationStatus(){this.requireReady();const result=await this.request('account/read',{refreshToken:false});if(!row(result)||typeof result.requiresOpenaiAuth!=='boolean')throw Error('Invalid official account status');return {authenticated:row(result.account),requiresOpenaiAuth:result.requiresOpenaiAuth};}
 private async session(method:'thread/start'|'thread/resume',task:HostTaskRef,threadId?:string){
  this.requireReady();if(this.busy()||this.sessionPending)throw new Error('Resolve the current session operation/turn; unknown is not a retry invitation');
  const ref=readHostTaskRef(task);this.sessionPending=true;this.state.session_revision++;
  const tools=this.#textPort?{...(this.options.textTools?.model?{model:this.options.textTools.model}:{}),cwd:this.options.process?.cwd,config:{features:{shell_tool:false,view_image:false},web_search:'disabled'},...(method==='thread/start'?{ephemeral:true,dynamicTools:this.#textPort.definitions.map(d=>({type:'function',name:d.name,description:d.description,inputSchema:d.inputSchema}))}:{})}:{};
  const official=this.#officialRuntime?{model:PUBLIC_JOINT_MODEL,cwd:this.#officialRuntime.process.cwd,sandbox:'read-only',config:publicJointConfig()}:{};
  try{const result=await this.request(method,threadId?{threadId,excludeTurns:true,...tools,...official}:{...tools,...official});
  if(this.state.connection!=='ready'||!row(result)||!row(result.thread)||!id(result.thread.id)||threadId!==undefined&&result.thread.id!==threadId){this.fail('Host returned a different session identity');throw new Error('Invalid host session identity');}
  if(this.#officialRuntime&&(result.model!==PUBLIC_JOINT_MODEL||result.modelProvider!=='openai'||!row(result.sandbox)||result.sandbox.type!=='readOnly')){this.fail('Official joint session differs from the reviewed model/provider/sandbox');throw Error('Official joint session scope mismatch');}
  this.state.thread_id=result.thread.id;this.state.task=ref;this.state.turn_id=null;this.state.turn_state='idle';this.agentMessages.clear();this.toolItems.clear();this.itemTypes.clear();this.blockedRequests.clear();this.completedTextBytes=0;this.changed();
  return {host_kind:'codex',thread_id:result.thread.id,task:ref};
  }finally{this.sessionPending=false;}
 }
 startSession(task:HostTaskRef){return this.session('thread/start',task);}
 resumeSession(handle:HostHandle){if(!handle||handle.host_kind!=='codex'||!id(handle.thread_id))return Promise.reject(new Error('Exact Codex handle required'));
  if(this.#textPort&&!this.state.thread_id)return Promise.reject(new Error('Text-tool scope cannot attach an external thread'));
  if(this.state.thread_id&&this.state.thread_id!==handle.thread_id)return Promise.reject(new Error('No silent session switching; use a separately confirmed handle/adapter'));
  if(this.state.task&&JSON.stringify(this.state.task)!==JSON.stringify(readHostTaskRef(handle.task)))return Promise.reject(new Error('No silent task rebinding on resume'));
  return this.session('thread/resume',handle.task,handle.thread_id);}
 async startTurn(input:string|ApprovedResearchTurn){
  this.requireReady();if(!this.state.thread_id||!this.state.task||this.busy()||this.sessionPending)throw new Error('Exact idle session required; unknown turns are never resent');
  // Independent text-only entry. Never consults or exercises the image gate.
  if(this.#textPort&&!this.#jointPort&&(typeof input!=='string'||!input.trim()||Buffer.byteLength(input)>8192))throw Error('Text-tool mode accepts bounded primitive text only; images remain closed');
  const dispatch=this.#jointPort?researchTurnDispatch(input,this,this.#jointPort):this.#textPort?null:researchTurnDispatch(input,this),wireInput=dispatch?dispatch.wire:this.#textPort?[{type:'text',text:input as string}]:hostTurnWireInput(input as string);
  this.toolAbort=new AbortController();
  const prior={state:structuredClone(this.state),messages:new Map(this.agentMessages),textBytes:this.completedTextBytes,tools:new Map(this.toolItems),blocked:new Set(this.blockedRequests)};
  this.toolItems.clear();this.blockedRequests.clear();
  this.state.turn_id=null;this.state.turn_state='starting';this.agentMessages.clear();this.completedTextBytes=0;this.interruptFor=null;this.interruptCall=undefined;this.starting=true;this.early=[];this.changed();
  this.jointInput=undefined;
  try{const result=await this.request('turn/start',{threadId:this.state.thread_id,input:wireInput},dispatch?()=>{dispatch.commit();if(this.#jointPort)this.jointInput=input as ApprovedResearchTurn;}:undefined);
   if(this.state.connection!=='ready'||!row(result)||!row(result.turn)||!id(result.turn.id))throw new Error('Invalid turn identity');
   this.state.turn_id=result.turn.id;this.itemTypes.clear();this.state.turn_state='running';this.starting=false;this.changed();
   const early=this.early;this.early=[];for(const message of early){if(this.state.connection!=='ready')break;this.receiveNotification(message);}if(this.state.connection!=='ready')throw new Error('Host failed while binding early turn events; no resend');return result.turn.id;
  }catch(error){this.starting=false;this.early=[];
   if(error instanceof ResearchDispatchRefused&&this.state.connection==='ready'&&this.state.thread_id===prior.state.thread_id&&this.state.session_revision===prior.state.session_revision){this.state=prior.state;this.agentMessages=prior.messages;this.completedTextBytes=prior.textBytes;this.toolItems=prior.tools;this.blockedRequests=prior.blocked;}
   else this.state.turn_state=error instanceof RpcRejected?'failed':'unknown';this.changed();throw error;}
 }
 interrupt():Promise<void>{this.requireReady();if(!this.state.thread_id||!this.state.turn_id||!['running','awaiting_user'].includes(this.state.turn_state))return Promise.reject(new Error('An identified active turn is required'));
  if(this.interruptFor===this.state.turn_id&&this.interruptCall)return this.interruptCall;
  this.toolAbort.abort();this.interruptFor=this.state.turn_id;this.interruptCall=(async()=>{try{await this.request('turn/interrupt',{threadId:this.state.thread_id,turnId:this.state.turn_id});}catch(error){
   // Aborted callbacks cannot safely be resurrected: a scientific write may
   // still finish. Fence this connection instead of claiming it remains usable.
   this.fail(error instanceof RpcRejected?'Interrupt RPC rejected; local tools stopped, remote turn outcome unknown; no replay':'Interrupt outcome unknown; local tools stopped; no replay');throw error;
  }})();
  // Ack is not termination. Only turn/completed can report interrupted.
  return this.interruptCall;
 }
 private receive(raw:unknown){
  if(!row(raw))throw new Error('Object message required');this.#observer?.('receive',this.#jointPort?wireMetadata(raw):structuredClone(raw));
  if(this.state.connection==='failed'||this.state.connection==='closed'||this.state.connection==='closing'){if(typeof raw.method==='string')this.diagnose(raw.method,row(raw.params)?raw.params:{},'late');this.warning('late_message_after_failure');return;}
  if(typeof raw.method==='string'){
   if(this.starting&&row(raw.params)&&raw.params.threadId===this.state.thread_id){if(this.early.length>=32)throw new Error('Early turn event bound');this.early.push(raw);return;}
   this.receiveNotification(raw);return;
  }
  if(!Number.isSafeInteger(raw.id)||typeof raw.id!=='number'||(Object.hasOwn(raw,'result')===Object.hasOwn(raw,'error')))throw new Error('Invalid RPC response');
  if(Object.hasOwn(raw,'error')&&(!row(raw.error)||typeof raw.error.code!=='number'))throw new Error('Invalid RPC error');
  const p=this.pending.get(raw.id);if(!p){if(this.retired.has(raw.id)){this.warning('duplicate_or_late_response');return;}throw new Error('Unmatched RPC response');}
  this.pending.delete(raw.id);clearTimeout(p.timer);this.retire(raw.id);
  if(row(raw.error))p.reject(new RpcRejected(raw.error.code as number));else p.resolve(raw.result);
 }
 private receiveNotification(message:Row){
  // Both live delivery and early-event replay must fence validation failures.
  try{this.processNotification(message);}catch(error){this.diagnose(String(message.method),row(message.params)?message.params:{},'invalid');this.fail('Invalid host wire message; no retry');throw error;}
 }
 private processNotification(message:Row){
  const method=String(message.method),p=row(message.params)?message.params:{};
  if(Object.hasOwn(message,'id')){
   if(typeof message.id!=='string'&&typeof message.id!=='number')throw new Error('Invalid server request identity');
   const key=JSON.stringify([typeof message.id,message.id,p.threadId??null,p.turnId??null]),signature=JSON.stringify([method,p]);const prior=this.serverRequests.get(key);
   if(prior!==undefined){if(prior!==signature)throw new Error('Conflicting server request identity');this.warning('duplicate_server_request');return;}
   if(this.serverRequests.size>=64)throw new Error('Server request bound');this.serverRequests.set(key,signature);
   const own=p.threadId===this.state.thread_id&&p.turnId===this.state.turn_id&&['running','awaiting_user'].includes(this.state.turn_state);
   if(method==='item/tool/call'&&this.#textPort&&own){this.dispatchTextTool(message.id,p);return;}
   const waiting=own&&approvals.has(method);
   if(waiting){this.blockedRequests.add(JSON.stringify(message.id));this.state.turn_state='awaiting_user';this.changed();}
   else this.#write({id:message.id,error:{code:-32601,message:'Workbench does not execute tools, provide credentials or grant permissions through this adapter'}});
   this.emit({kind:'host_request_blocked',request_id:message.id,method,disposition:waiting?'awaiting_user':'unsupported'});return;
  }
  if(method==='thread/started'){if(!row(p.thread)||!id(p.thread.id))throw Error('Invalid thread-started identity');const association=this.state.thread_id?p.thread.id===this.state.thread_id?'thread':'mismatch':'unbound';this.diagnose(method,p,association==='mismatch'?'identity_mismatch':'control',association);return;}
  if(['account/updated','account/rateLimits/updated','deprecationNotice'].includes(method)){this.diagnose(method,p,'metadata','global');return;}
  if(['warning','guardianWarning','configWarning','modelProvider/authRecoveryStarted','modelProvider/authRecoveryCompleted','account/login/completed'].includes(method)){this.diagnose(method,p,'warning','global');this.warning('host_warning_or_auth_signal');return;}
  if(['thread/status/changed','thread/closed','thread/name/updated','serverRequest/resolved'].includes(method)){
   if(!this.state.thread_id||p.threadId!==this.state.thread_id){this.diagnose(method,p,'identity_mismatch');this.warning('stale_or_unbound_notification');return;}
   if(method==='thread/status/changed'){if(!row(p.status)||!['notLoaded','idle','systemError','active'].includes(String(p.status.type))||p.status.type==='active'&&(!Array.isArray(p.status.activeFlags)||p.status.activeFlags.length>2||p.status.activeFlags.some(f=>f!=='waitingOnApproval'&&f!=='waitingOnUserInput')))throw Error('Invalid thread status');this.diagnose(method,p,'control');if(['notLoaded','systemError'].includes(String(p.status.type)))this.fail('Host thread unavailable; active outcome unknown, no replay');return;}
   if(method==='serverRequest/resolved'&&!(id(p.requestId)||typeof p.requestId==='number'&&Number.isSafeInteger(p.requestId)))throw Error('Invalid resolved request identity');
   this.diagnose(method,p,'control');
   if(method==='thread/closed')this.fail('Host thread closed; active outcome unknown, no replay');
   if(method==='serverRequest/resolved'&&this.blockedRequests.delete(JSON.stringify(p.requestId))&&this.blockedRequests.size===0&&this.state.turn_state==='awaiting_user'){this.state.turn_state='running';this.changed();}return;
  }
  const turn=row(p.turn)?p.turn:null,turnId=method==='turn/started'||method==='turn/completed'?turn?.id:p.turnId;
  if(p.threadId!==this.state.thread_id||turnId!==this.state.turn_id||!this.state.turn_id){this.diagnose(method,p,'identity_mismatch');this.warning('stale_or_unbound_notification');return;}
  if(method==='item/completed'){if(this.observeItem(method,p))return;this.completeAgentMessage(p);return;}
  if(terminal.has(this.state.turn_state)){this.diagnose(method,p,'late');this.warning('late_notification_for_terminal_turn');return;}
  if(this.#textPort&&executionNotifications.has(method)){this.diagnose(method,p,'risk');this.warning('unexpected_host_tool_activity');this.fail('Execution notification outside text-only research scope; outcome unknown');return;}
  if(method==='turn/started')return;
  if(method==='item/started'){
   if(!row(p.item)||!id(p.item.id)||typeof p.item.type!=='string')throw new Error('Invalid started item');
   if(this.observeItem(method,p))return;
   if(p.item.type==='agentMessage'){if(!this.agentMessages.has(p.item.id)){this.noteAgentItem(p.item.id);this.changed();}}return;
  }
  if(method==='item/agentMessage/delta'){
   if(!id(p.itemId)||typeof p.delta!=='string'||Buffer.byteLength(p.delta)>65536)throw new Error('Invalid message delta');
   if(this.agentMessages.get(p.itemId)){this.warning('delta_after_message_completion');return;}
   const fresh=!this.agentMessages.has(p.itemId);this.noteAgentItem(p.itemId);if(fresh)this.changed();
   this.emit({kind:'host_text',text_kind:'delta',thread_id:this.state.thread_id!,turn_id:this.state.turn_id,item_id:p.itemId,text:p.delta});return;
  }
  if(method==='turn/completed'){
   if(!turn||typeof turn.status!=='string'||!terminal.has(turn.status))throw new Error('Invalid terminal turn');
   this.state.turn_state=turn.status as 'completed'|'interrupted'|'failed';if(this.#textPort)this.toolAbort.abort();if([...this.agentMessages.values()].includes(null))this.warning('unfinished_agent_messages_at_turn_terminal');for(const [key,t]of this.toolItems)if(t.status==='inProgress'){const unknown={...t,status:'unknown' as const,success:null};this.toolItems.set(key,unknown);this.emit({kind:'host_tool_status',...unknown});this.warning('unfinished_tool_at_turn_terminal');}this.changed();return;
  }
  if(method==='error'){if(typeof p.willRetry!=='boolean'||!row(p.error))throw Error('Invalid error notification');this.diagnose(method,p,'error');this.warning(p.willRetry?'host_error_retrying':'host_error_awaiting_terminal');return;}
  if(method==='model/rerouted'){this.diagnose(method,p,'warning');this.warning('host_model_rerouted_identity_changed');if(this.#officialRuntime)this.fail('Official joint model changed; original input may already be delivered, no further tool replies or replay');return;}
  if(['thread/tokenUsage/updated','turn/plan/updated','thread/compacted'].includes(method)){this.diagnose(method,p,'metadata');return;}
  if(['item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded','item/reasoning/textDelta','item/plan/delta'].includes(method)){if(!id(p.itemId))throw Error('Missing item identity');this.bindItemType(p.itemId,method==='item/plan/delta'?'plan':'reasoning');this.diagnose(method,p,method==='item/plan/delta'?'metadata':'reasoning');return;}
  this.diagnose(method,p,'unknown');
  this.warning('unhandled_notification');
 }
 private observeItem(method:string,p:Row){
  const item=p.item;if(!row(item)||!id(item.id)||typeof item.type!=='string')throw Error('Invalid item identity');this.bindItemType(item.id,item.type);if(item.type==='agentMessage')return false;
  if(item.type==='dynamicToolCall'){
   if(typeof item.tool!=='string'||!['inProgress','completed','failed'].includes(String(item.status))||method==='item/started'&&item.status!=='inProgress'||method==='item/completed'&&item.status==='inProgress'||item.success!==undefined&&item.success!==null&&typeof item.success!=='boolean')throw Error('Invalid dynamic tool status');
   if(!this.#textPort?.definitions.some(d=>d.name===item.tool)||item.namespace!==undefined&&item.namespace!==null){this.diagnose(method,p,'risk');this.warning('unexpected_host_tool_activity');if(this.#textPort)this.fail('Tool lifecycle outside approved text catalog; outcome unknown');return true;}
   const key=protocolHash(item.id),next:HostToolStatus={thread_id:this.state.thread_id!,turn_id:this.state.turn_id!,item_id_sha256:key,tool:item.tool,status:item.status as HostToolStatus['status'],success:typeof item.success==='boolean'?item.success:null,authority:'host_lifecycle_only'},prior=this.toolItems.get(key);this.diagnose(method,p,'tool_lifecycle');
   if(prior){if(prior.status===next.status&&prior.success===next.success&&prior.tool===next.tool)return true;if(prior.tool!==next.tool||prior.status!=='inProgress'&&prior.status!=='unknown')throw Error('Conflicting tool lifecycle');}
   if(this.toolItems.size>=64&&!prior)throw Error('Tool lifecycle count bound');this.toolItems.set(key,next);this.emit({kind:'host_tool_status',...next});if(terminal.has(this.state.turn_state))this.warning('tool_completed_after_turn_terminal');return true;
  }
  if(['userMessage','reasoning','plan','contextCompaction'].includes(item.type)){this.diagnose(method,p,item.type==='reasoning'?'reasoning':'control');return true;}
  if(item.type==='functionCallOutput'&&this.#textPort?.definitions.some(d=>d.name===item.name)&&(item.namespace===undefined||item.namespace===null)){this.diagnose(method,p,'control');return true;}
  if(['commandExecution','fileChange','mcpToolCall','collabAgentToolCall','subAgentActivity','webSearch','imageView','imageGeneration','sleep','functionCallOutput','hookPrompt','enteredReviewMode','exitedReviewMode'].includes(item.type)){this.diagnose(method,p,'risk');this.warning('unexpected_host_tool_activity');if(this.#textPort)this.fail('Unexpected host activity in text-only research scope; outcome unknown');return true;}
  this.diagnose(method,p,'unknown');this.warning(method==='item/started'?'unsupported_started_item_type':'unsupported_completed_item_type');return true;
 }
 private dispatchTextTool(requestId:string|number,p:Row){
  if(!id(p.callId)||!id(p.tool)||p.namespace!==undefined&&p.namespace!==null||!this.#textPort!.definitions.some(d=>d.name===p.tool)){
   this.#write({id:requestId,error:{code:-32602,message:'Tool outside the text-only catalog'}});return;
  }
  const call:TextToolCall={threadId:p.threadId as string,turnId:p.turnId as string,callId:p.callId,tool:p.tool,arguments:structuredClone(p.arguments)},signal=this.toolAbort.signal;
  const beforeReply=()=>{try{if(signal.aborted||this.state.connection!=='ready'||this.state.thread_id!==call.threadId||this.state.turn_id!==call.turnId||!['running','awaiting_user'].includes(this.state.turn_state))throw Error('Joint tool reply is no longer active');assertJointResearchCallback(this.jointInput!,this,this.#jointPort!);}catch(error){this.fail('Joint tool reply refused at final write; original outcome retained');throw error;}};
  // Serialize accepted callbacks before the original-outcome fence; recheck
  // the live owner when each queued call actually starts, never replay a write.
  const pending=this.toolQueue.then(()=>{
   if(signal.aborted||this.state.connection!=='ready'||this.state.thread_id!==call.threadId||this.state.turn_id!==call.turnId||!['running','awaiting_user'].includes(this.state.turn_state))throw Error('Tool call is no longer active');
   if(this.#jointPort){try{assertJointResearchCallback(this.jointInput!,this,this.#jointPort);}catch(error){this.fail('Joint owner scope changed; original outcomes retained');throw error;}}
   return this.#textPort!.call(call,signal);
  });
  this.toolQueue=pending.then(()=>{},()=>{});
  void pending.then(reply=>{
   if(signal.aborted||this.state.connection!=='ready'||this.state.thread_id!==call.threadId||this.state.turn_id!==call.turnId||!['running','awaiting_user'].includes(this.state.turn_state)){this.warning('late_tool_outcome_retained_no_delivery');return;}
   if(this.#jointPort){try{assertJointResearchCallback(this.jointInput!,this,this.#jointPort);}catch(error){this.fail('Joint owner scope changed; late scientific outcome retained');throw error;}}
   if(typeof reply.success!=='boolean'||typeof reply.text!=='string'||Buffer.byteLength(reply.text)>32768)throw Error('Invalid text-tool projection');
   this.#write({id:requestId,result:{success:reply.success,contentItems:[{type:'inputText',text:reply.text}]}},this.#jointPort?beforeReply:undefined);
  }).catch(()=>{if(this.state.connection==='ready'&&!signal.aborted)try{this.#write({id:requestId,result:{success:false,contentItems:[{type:'inputText',text:'Tool outcome unavailable; retain the original request identity, no automatic replay.'}]}},this.#jointPort?beforeReply:undefined);}catch{this.fail('Final tool reply refused; no replay');}});
 }
 private noteAgentItem(itemId:string){
  this.bindItemType(itemId,'agentMessage');
  if(!this.agentMessages.has(itemId)){if(this.agentMessages.size>=64)throw new Error('Agent message count bound');this.agentMessages.set(itemId,null);}
 }
 private bindItemType(itemId:string,type:string){
  const key=protocolHash(itemId),value=protocolHash(type),prior=this.itemTypes.get(key);
  if(prior!==undefined&&prior!==value)throw Error('Conflicting item identity/type');
  if(prior===undefined&&this.itemTypes.size>=256)throw Error('Item identity count bound');
  this.itemTypes.set(key,value);
 }
 private completeAgentMessage(p:Row){
  const item=p.item;if(!row(item)||!id(item.id)||typeof item.type!=='string')throw new Error('Invalid completed item');
  if(item.type!=='agentMessage'){this.warning('unsupported_completed_item_type');return;}
  if(typeof item.text!=='string'||Buffer.byteLength(item.text)>INPUT_LIMIT_BYTES||Object.hasOwn(item,'phase')&&item.phase!==null&&(typeof item.phase!=='string'||!['commentary','partial_answer','final_answer'].includes(item.phase)))throw new Error('Invalid completed agent message');
  const message:HostAgentMessage={thread_id:this.state.thread_id!,turn_id:this.state.turn_id!,item_id:item.id,text:item.text,...(Object.hasOwn(item,'phase')?{phase:item.phase as HostAgentMessage['phase']}:{})};
  const prior=this.agentMessages.get(item.id);
  if(prior){
   if(JSON.stringify(prior)!==JSON.stringify(message)){this.state.turn_state='unknown';this.fail('Conflicting completed agent message; original outcome unknown, no resend');return;}
   this.warning('duplicate_message_completion');return;
  }
  if(this.completedTextBytes+Buffer.byteLength(item.text)>INPUT_LIMIT_BYTES)throw new Error('Completed message text bound');
  this.noteAgentItem(item.id);this.agentMessages.set(item.id,message);this.completedTextBytes+=Buffer.byteLength(item.text);
  if(terminal.has(this.state.turn_state))this.warning('item_completed_after_turn_terminal');
  this.emit({kind:'host_message_completed',...message});this.changed();
 }
 close():Promise<boolean>{
  if(this.closeObserved)return Promise.resolve(true);
  if(this.closeCall)return this.closeCall;
  this.closeCall=(async()=>{if(!this.#child){this.state.connection='closed';this.changed();return true;}
   if(!this.closeObserved){this.state.connection='closing';if(this.busy())this.state.turn_state='unknown';this.starting=false;this.early=[];this.stopInput();
    this.toolAbort.abort();
    for(const [n,p]of this.pending){clearTimeout(p.timer);this.retire(n);p.reject(new Error('Host closing; no request is resent'));}this.pending.clear();
    this.changed();if(!this.#child.stdin.destroyed&&!this.#child.stdin.writableEnded)this.#child.stdin.end();}
   let timer:ReturnType<typeof setTimeout>|undefined;const done=await Promise.race([this.closed.then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),2000);})]);if(timer)clearTimeout(timer);
   if(!done)this.warning('host_close_unconfirmed_no_kill');return done;})();return this.closeCall;
 }
}
