// Public synthetic text/tool trial. Images never enter the host input or replies.
import path from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {createResearchTextTools} from '../lib/research_text_tools.mjs';
import {CodexStdioHost} from '../lib/codex_stdio_host.mjs';
import {awaitHostState} from '../lib/research_host_demo.mjs';
import {textHostProcess} from '../lib/research_text_runtime.mjs';
import {notificationObservation} from '../lib/research_host_notifications.mjs';
import type {HostEvent} from '../lib/research_host.mjs';
const [mode,directory,executable]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
const real=mode==='--real'||mode==='--real-existing';
if(!['--local','--real','--real-existing','--prepare'].includes(mode)||!directory||!path.isAbsolute(directory)||!python||!path.isAbsolute(python)||real&&(!executable||!path.isAbsolute(executable)))throw Error('Usage: MICROSCOPY_PYTHON=ABS node research_text_loop.mjs --local|--real|--real-existing|--prepare NEW_ABS_DIR [OFFICIAL_CODEX_ABS]');
const settings=textHostProcess(directory,mode==='--real-existing',process.env.MICROSCOPY_CODEX_HOME,process.env);
mkdirSync(directory);for(const d of ['workspace','audit','model-cwd','codex-home','tmp','cache'])mkdirSync(path.join(directory,d));
const workspace=path.join(directory,'workspace'),source=path.join(directory,'public-synthetic.tiff'),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const generated=spawnSync(python,['-B','-c',"import numpy as np,tifffile,sys; y,x=np.mgrid[:64,:64]; a=(np.where(x<32,100,300)+(y%2)*20).astype(np.uint16); tifffile.imwrite(sys.argv[1],a,metadata=None,photometric='minisblack')",source],{encoding:'utf8'});if(generated.status!==0)throw Error('Public fixture creation failed');
const sourceHash=hash(readFileSync(source)),runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}}),events:HostEvent[]=[],turns:unknown[]=[];
const report:Record<string,unknown>={mode,images_sent:false,real_model:false,model_turns_attempted:0,source_sha256:sourceHash,workspace,codex_home:settings.codex_home,auth_source:settings.auth_source,runtime_state_notice:settings.runtime_state_notice,events,turns,model:'NOT_STARTED'};let host:CodexStdioHost|undefined;
try{
 const toolData=async(name:string,args:Record<string,unknown>)=>{const r=await runtime.registry.call(name,args) as {isError?:boolean;content:{type:string;text?:string}[]};if(r.isError)throw Error('Synthetic setup provider refused');return JSON.parse(r.content.find(c=>c.type==='text')!.text!) as Record<string,unknown>;};
 const opened=await toolData('image_open',{source_path:source,request_id:'public-text-open'}),frame=await toolData('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'public-text-frame'});
 const tools=createResearchTextTools({registry:runtime.registry,workspace,frameId:String(frame.object_id),journalDirectory:path.join(directory,'audit')});report.source=tools.source;
 const questions=['Public synthetic scalar array only; no microscopy image is attached or available to you. Source: '+JSON.stringify(tools.source)+'. Question: how does intensity vary across parts of this array? Choose existing statistics tools and pixel ROIs to investigate. Use returned results to choose a follow-up check, retain original request/object IDs, and state support, conflicts, unknown physical meaning and next analysis. Do not use shell, images, files or web. No material identity or calibration is supplied.','Continue the same question using the actual saved results above. Choose a useful additional check or explain why the existing results suffice; distinguish dependent same-frame checks from independent evidence. Keep uncertainty and source references.'];
 const plan={source:tools.source,questions,tools:tools.port.definitions,images:false,pixels:false,provider_raw_content:false,client_environment_metadata:'Official thread/start uses local cwd. Client-generated model context has not been audited by this application.'},planBytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');writeFileSync(path.join(directory,'public-send-plan.json'),planBytes);report.public_send_plan_sha256=hash(planBytes);
 if(mode==='--prepare')report.result='PREPARED_NO_HOST';
 if(mode!=='--prepare'){
 const peer=fileURLToPath(new URL('./synthetic_text_tool_peer.mjs',import.meta.url));
 host=new CodexStdioHost({executable:real?executable:process.execPath,timeoutMs:30000,textTools:{port:tools.port},process:settings.process,...(mode==='--local'?{verification:'synthetic' as const,spawnProcess:(node:string,_args:string[],settings:Parameters<typeof spawn>[2])=>spawn(node,[peer],{...settings,stdio:['pipe','pipe','pipe']})}:{}),onWire:(direction,message)=>{
  if(direction==='send'&&message.method==='turn/start'){const input=(message.params as {input:{type:string}[]}).input;if(input.some(i=>i.type!=='text'))throw Error('Non-text input prohibited');}
  if(direction==='receive'&&typeof (message.result as Record<string,unknown>|undefined)?.model==='string')report.model=(message.result as Record<string,unknown>).model;
 }});host.subscribe(event=>{if(event.kind!=='host_text')events.push(event);});await host.connect();
 if(real){const auth=await host.authenticationStatus();report.authentication=auth;if(!auth.authenticated){report.result='BLOCKED_AUTHENTICATION';report.blocker='Official account/read(refreshToken=false) reports no authenticated account in the selected runtime. No login, credential copy or alternate auth route attempted.';console.log('BLOCKED_AUTHENTICATION: no authenticated account in selected official runtime; no model turn sent.');}}
 async function run(text:string){if(real)report.model_turns_attempted=Number(report.model_turns_attempted)+1;const turnId=await host!.startTurn(text);await awaitHostState(host!,s=>['completed','failed','interrupted','unknown'].includes(s.turn_state),120000);const s=host!.snapshot();turns.push({turn_id:turnId,state:s.turn_state,messages:s.agent_messages});if(s.turn_state!=='completed')throw Error('Model turn not completed; no replay');if(real)report.real_model=true;}
 if(!report.result){
  const handle=await host.startSession({task_id:'public-text-science',context_sha256:tools.context_sha256});report.handle=handle;
  for(const question of questions)await run(question);
  report.result=real?'REAL_TEXT_TOOL_RUN_COMPLETED':'LOCAL_SCRIPTED_PROVIDER_LOOP_PASS';report.tool_calls=tools.audit();report.real_tool_execution_verified=tools.audit().some(e=>e.phase==='completed');
  if(!report.real_tool_execution_verified)throw Error('No verified provider tool result was observed');
 }
 }
 if(hash(readFileSync(source))!==sourceHash)throw Error('Original public source changed');
 console.log(String(report.result));
}catch(error){report.result='FAIL_OR_UNKNOWN';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;}
finally{if(host){report.host_closed=await host.close();const d=host.notificationDiagnostics();report.protocol_diagnostics=d;report.protocol_observation=notificationObservation(d,events);}runtime.close();writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');}
