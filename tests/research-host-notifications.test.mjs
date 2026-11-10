// Scripted in-memory protocol only. No auth/profile/provider/model/image gate.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {CodexStdioHost} from '../lib/codex_stdio_host.mjs';import {notificationMetadata,notificationObservation,protocolHash} from '../lib/research_host_notifications.mjs';
const definition={name:'image_statistics',description:'Local protocol fixture only',inputSchema:{type:'object',properties:{},additionalProperties:false}},tick=()=>new Promise(r=>setImmediate(r));
function fixture(t){const child=new EventEmitter(),received=[],events=[];let calls=0,turn=0;child.stdout=new PassThrough();child.stderr=new PassThrough();const send=m=>child.stdout.write(JSON.stringify(m)+'\n');child.stdin=new Writable({write(bytes,_e,done){const m=JSON.parse(bytes);received.push(m);queueMicrotask(()=>{if(m.method==='initialize')send({id:m.id,result:{}});if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'thread'}}});if(m.method==='turn/start'){turn++;send({id:m.id,result:{turn:{id:turn===1?'turn':'turn-'+turn}}});}});done();}});child.stdin.once('finish',()=>queueMicrotask(()=>child.emit('close',0,null)));
 const host=new CodexStdioHost({executable:process.execPath,verification:'synthetic',spawnProcess:()=>child,textTools:{port:{definitions:[definition],call:async()=>{calls++;return {success:true,text:'local numeric result'};}}}});host.subscribe(e=>events.push(e));t.after(()=>host.close());return {host,received,events,send,calls:()=>calls,notify:(method,params={})=>send({method,params:{threadId:'thread',turnId:'turn',...params}}),item:(method,item)=>send({method,params:{threadId:'thread',turnId:'turn',item}})};
}
async function start(f){await f.host.connect();await f.host.startSession({task_id:'notification-test',context_sha256:'a'.repeat(64)});await f.host.startTurn('Public synthetic protocol question');}
const diagnostics=f=>f.events.filter(e=>e.kind==='host_protocol_diagnostic'),warnings=f=>f.events.filter(e=>e.kind==='host_warning').map(e=>e.reason);
test('thread-only status is visible without inventing turn completion or granting waiting flags',async t=>{
 const f=fixture(t);await start(f);f.notify('thread/status/changed',{turnId:undefined,status:{type:'active',activeFlags:['waitingOnApproval']}});f.notify('thread/status/changed',{turnId:undefined,status:{type:'idle'}});
 assert.equal(f.host.snapshot().turn_state,'running');assert.equal(f.received.length,3+1);assert.deepEqual(diagnostics(f).map(e=>[e.method,e.association,e.status,e.active_flags]),[['thread/status/changed','thread','active',['waitingOnApproval']],['thread/status/changed','thread','idle',undefined]]);assert.ok(!warnings(f).includes('stale_or_unbound_notification'));
});
test('global account metadata is classified without retaining identity or auth fields',async t=>{
 const f=fixture(t);await f.host.connect();f.send({method:'account/updated',params:{authMode:'chatgpt',email:'PRIVATE_SENTINEL',token:'PRIVATE_SENTINEL',path:'/Users/private'}});f.send({method:'account/rateLimits/updated',params:{secret:'PRIVATE_SENTINEL'}});
 const text=JSON.stringify(diagnostics(f));assert.equal(diagnostics(f).length,2);assert.ok(diagnostics(f).every(e=>e.classification==='metadata'&&e.association==='global'));assert.ok(!text.includes('PRIVATE_SENTINEL')&&!text.includes('/Users/private')&&!text.includes('chatgpt'));assert.equal(f.calls(),0);
});
test('reasoning/plan metadata never becomes agent output or stores arbitrary content',async t=>{
 const f=fixture(t);await start(f);for(const type of ['reasoning','plan','contextCompaction','userMessage']){f.item('item/started',{id:'id-'+type,type,text:'PRIVATE_SENTINEL',content:['PRIVATE_SENTINEL']});f.item('item/completed',{id:'id-'+type,type,text:'PRIVATE_SENTINEL',content:['PRIVATE_SENTINEL']});}
 f.notify('item/reasoning/textDelta',{itemId:'reasoning-1',delta:'PRIVATE_SENTINEL',contentIndex:0});f.notify('turn/plan/updated',{plan:[{step:'PRIVATE_SENTINEL',status:'pending'}]});
 assert.deepEqual(f.host.snapshot().agent_messages,[]);assert.equal(diagnostics(f).length,10);assert.ok(!JSON.stringify(diagnostics(f)).includes('PRIVATE_SENTINEL'));assert.ok(!warnings(f).includes('unsupported_completed_item_type'));
});
test('dynamic lifecycle is host status only and never dispatches science from a notification',async t=>{
 const f=fixture(t);await start(f);const item={id:'tool-item',type:'dynamicToolCall',tool:'image_statistics',arguments:{opaque:'PRIVATE_SENTINEL'},status:'inProgress'};f.item('item/started',item);f.item('item/started',item);f.item('item/completed',{...item,status:'completed',success:false,contentItems:[{type:'inputText',text:'PRIVATE_SENTINEL'}]});f.item('item/completed',{...item,status:'completed',success:false});
 const statuses=f.events.filter(e=>e.kind==='host_tool_status');assert.deepEqual(statuses.map(e=>[e.status,e.success,e.authority]),[['inProgress',null,'host_lifecycle_only'],['completed',false,'host_lifecycle_only']]);assert.equal(statuses[0].item_id_sha256,protocolHash('tool-item'));assert.equal(f.calls(),0);assert.ok(!JSON.stringify([...statuses,...diagnostics(f)]).includes('PRIVATE_SENTINEL'));
});
test('unfinished tool is unknown at turn terminal, late completion remains explicitly late',async t=>{
 const f=fixture(t);await start(f);const item={id:'inflight',type:'dynamicToolCall',tool:'image_statistics',arguments:{},status:'inProgress'};f.item('item/started',item);f.notify('turn/completed',{turn:{id:'turn',status:'completed'}});assert.ok(warnings(f).includes('unfinished_tool_at_turn_terminal'));assert.equal(f.events.filter(e=>e.kind==='host_tool_status').at(-1).status,'unknown');const observation=notificationObservation(f.host.notificationDiagnostics(),f.events);assert.equal(observation.issues_observed,true);assert.equal(observation.unfinished_tool_observed,true);
 f.item('item/completed',{...item,status:'completed',success:true});assert.equal(f.host.snapshot().turn_state,'completed');assert.ok(warnings(f).includes('tool_completed_after_turn_terminal'));assert.equal(f.calls(),0);
});
test('conflicting dynamic completion fails honestly without replay',async t=>{
 const f=fixture(t);await start(f);const item={id:'tool',type:'dynamicToolCall',tool:'image_statistics',arguments:{},status:'completed',success:true};f.item('item/completed',item);f.item('item/completed',{...item,status:'failed',success:false});assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');assert.ok(diagnostics(f).some(e=>e.classification==='invalid'));assert.equal(f.calls(),0);
});
test('retryable error is visible; only terminal turn event determines failure',async t=>{
 const f=fixture(t);await start(f);f.notify('error',{willRetry:true,error:{message:'PRIVATE_SENTINEL',additionalDetails:'/Users/private',codexErrorInfo:'usageLimitExceeded'}});assert.equal(f.host.snapshot().turn_state,'running');assert.equal(diagnostics(f).at(-1).will_retry,true);assert.equal(diagnostics(f).at(-1).error_code,'usageLimitExceeded');
 f.notify('error',{willRetry:false,error:{message:'PRIVATE_SENTINEL',codexErrorInfo:{opaque:'PRIVATE_SENTINEL'}}});assert.equal(f.host.snapshot().turn_state,'running');assert.equal(diagnostics(f).at(-1).error_code,'unclassified');f.notify('turn/completed',{turn:{id:'turn',status:'failed'}});assert.equal(f.host.snapshot().turn_state,'failed');assert.ok(!JSON.stringify(diagnostics(f)).includes('PRIVATE_SENTINEL'));assert.equal(f.calls(),0);
});
test('foreign notifications preserve hashed diagnostics and cannot mutate the active result',async t=>{
 const f=fixture(t);await start(f);f.notify('item/completed',{threadId:'/Users/private/PRIVATE_SENTINEL',item:{id:'PRIVATE_SENTINEL',type:'agentMessage',text:'PRIVATE_SENTINEL'}});f.notify('error',{turnId:'other',willRetry:false,error:{message:'PRIVATE_SENTINEL'}});f.notify('/Users/private/PRIVATE_SENTINEL',{opaque:'PRIVATE_SENTINEL'});
 assert.equal(f.host.snapshot().turn_state,'running');assert.deepEqual(f.host.snapshot().agent_messages,[]);const text=JSON.stringify(diagnostics(f));assert.ok(!text.includes('PRIVATE_SENTINEL')&&!text.includes('/Users/private'));assert.equal(diagnostics(f).at(-1).method,'unrecognized');assert.ok(diagnostics(f).at(-1).method_sha256);assert.ok(diagnostics(f).some(e=>e.classification==='identity_mismatch'));
});
test('unexpected execution item in text scope is a risk signal and fences future callbacks',async t=>{
 const f=fixture(t);await start(f);f.item('item/started',{id:'exec',type:'commandExecution',status:'inProgress',command:'PRIVATE_SENTINEL',cwd:'/Users/private'});f.send({id:'later',method:'item/tool/call',params:{threadId:'thread',turnId:'turn',callId:'after-risk',tool:'image_statistics',arguments:{}}});await tick();assert.equal(f.calls(),0);assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');assert.equal(diagnostics(f).at(-1).classification,'risk');assert.ok(!JSON.stringify(diagnostics(f)).includes('PRIVATE_SENTINEL'));
});
test('thread closure and malformed active status are explicit uncertainty, not successful completion',async t=>{
 for(const method of ['thread/closed','thread/status/changed']){const f=fixture(t);await start(f);f.notify(method,{turnId:undefined,status:{type:'active',activeFlags:['PRIVATE_SENTINEL']}});assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');assert.equal(f.calls(),0);}
});
test('closed idle thread cannot silently accept a new turn',async t=>{
 const f=fixture(t);await f.host.connect();await f.host.startSession({task_id:'idle-closure',context_sha256:'a'.repeat(64)});f.notify('thread/closed',{turnId:undefined});assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'idle');await assert.rejects(f.host.startTurn('must not send'),/not ready/);assert.equal(f.received.some(e=>e.method==='turn/start'),false);
});
test('request resolution clears only its matching wait and never sends an approval',async t=>{
 const f=fixture(t);await start(f);f.send({id:'approval',method:'item/tool/requestUserInput',params:{threadId:'thread',turnId:'turn',text:'PRIVATE_SENTINEL'}});assert.equal(f.host.snapshot().turn_state,'awaiting_user');f.notify('serverRequest/resolved',{turnId:undefined,requestId:'foreign'});assert.equal(f.host.snapshot().turn_state,'awaiting_user');f.notify('serverRequest/resolved',{turnId:undefined,requestId:'approval'});assert.equal(f.host.snapshot().turn_state,'running');assert.equal(f.received.some(e=>e.id==='approval'),false);assert.equal(f.calls(),0);
});
test('metadata saturation cannot consume the issue budget; issue overflow stops capture honestly',async t=>{
 const f=fixture(t);await start(f);for(let i=0;i<150;i++)f.send({method:'account/updated',params:{ignored:'PRIVATE_SENTINEL'}});assert.equal(f.host.snapshot().connection,'ready');f.notify('unknown/newMethod',{opaque:'PRIVATE_SENTINEL'});assert.equal(diagnostics(f).at(-1).classification,'unknown');for(let i=0;i<130;i++)f.notify('unknown/newMethod',{opaque:'PRIVATE_SENTINEL'});
 const counts=f.host.notificationDiagnostics();assert.equal(counts.informational_emitted,128);assert.equal(counts.informational_dropped,22);assert.equal(counts.issues_emitted,128);assert.equal(counts.issues_dropped,1);assert.equal(f.host.snapshot().connection,'failed');assert.ok(diagnostics(f).length<=256);assert.equal(f.calls(),0);assert.equal(notificationObservation(counts,f.events).diagnostic_capture_truncated,true);
});
test('projection hashes unknown labels/IDs and retains only fixed error/status fields',()=>{
 const d=notificationMetadata(1,'PRIVATE_SENTINEL',{threadId:'PRIVATE_SENTINEL',item:{id:'PRIVATE_SENTINEL',type:'PRIVATE_SENTINEL',text:'PRIVATE_SENTINEL'},status:'PRIVATE_SENTINEL',error:{codexErrorInfo:'PRIVATE_SENTINEL'},opaque:'PRIVATE_SENTINEL'},'unknown','unbound');assert.ok(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));assert.equal(d.method,'unrecognized');assert.equal(d.item_type,'unrecognized');assert.ok(d.thread_id_sha256);assert.equal(d.status,undefined);
});
test('known structured upstream error retains bounded category/status without diagnostic text',()=>{
 const d=notificationMetadata(1,'error',{willRetry:true,error:{message:'PRIVATE_SENTINEL',codexErrorInfo:{responseStreamDisconnected:{httpStatusCode:503,opaque:'PRIVATE_SENTINEL'}}}},'error','turn');assert.equal(d.error_code,'responseStreamDisconnected');assert.equal(d.http_status,503);assert.equal(d.will_retry,true);assert.ok(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
});
test('late unknown notification is auditable without reopening the terminal turn',async t=>{
 const f=fixture(t);await start(f);f.notify('turn/completed',{turn:{id:'turn',status:'completed'}});f.notify('unknown/newMethod',{opaque:'PRIVATE_SENTINEL'});assert.equal(diagnostics(f).at(-1).classification,'late');assert.equal(f.host.snapshot().turn_state,'completed');assert.equal(f.calls(),0);
 const d=notificationMetadata(1,'warning',{status:'completed',willRetry:true,message:'PRIVATE_SENTINEL'},'warning','global');assert.equal(d.status,undefined);assert.equal(d.will_retry,undefined);
});

const executionChannels=['item/commandExecution/outputDelta','item/commandExecution/terminalInteraction','item/mcpToolCall/progress','item/fileChange/outputDelta','item/fileChange/patchUpdated','turn/diff/updated'];
const callback=(f,turnId='turn')=>f.send({id:'scientific-rpc',method:'item/tool/call',params:{threadId:'thread',turnId,callId:'scientific-call',tool:'image_statistics',arguments:{}}});
function privateExecutionFields(){return {itemId:'execution-item',processId:'process',processHandle:'process',delta:'PRIVATE_SENTINEL',stdin:'PRIVATE_SENTINEL',message:'PRIVATE_SENTINEL',diff:'PRIVATE_SENTINEL',changes:[{path:'/Users/private/PRIVATE_SENTINEL'}],deltaBase64:'PRIVATE_SENTINEL',stream:'stdout',capReached:false,exitCode:0,stdout:'PRIVATE_SENTINEL',stderr:'PRIVATE_SENTINEL',stdoutCapReached:false,stderrCapReached:false};}
function auditCase(t,f,scenario,expectedCalls){
 const snapshot=f.host.snapshot(),diagnosticText=JSON.stringify(diagnostics(f));assert.equal(f.calls(),expectedCalls);assert.ok(!snapshot.agent_messages.some(m=>m.text.includes('PRIVATE_SENTINEL')));assert.ok(!diagnosticText.includes('PRIVATE_SENTINEL')&&!diagnosticText.includes('/Users/private'));
 t.diagnostic(JSON.stringify({scenario,synthetic:true,real_model:false,real_provider:false,connection:snapshot.connection,turn_state:snapshot.turn_state,callback_dispatches:f.calls(),final_count:snapshot.agent_messages.filter(m=>m.phase==='final_answer').length,final_polluted:false,sensitive_diagnostic_present:false}));
}
test('execution-channel risk binding does not depend on item/started',async t=>{
 for(const method of executionChannels)for(const scope of ['current','foreign_thread','old_turn','terminal'])await t.test(method+' / '+scope,async sub=>{
  const f=fixture(sub);await start(f);if(scope==='terminal')f.notify('turn/completed',{turn:{id:'turn',status:'completed'}});
  f.notify(method,{...privateExecutionFields(),...(scope==='foreign_thread'?{threadId:'foreign'}:{}),...(scope==='old_turn'?{turnId:'old-turn'}:{})});if(scope==='current'){assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');}callback(f);
  if(scope==='current'){f.item('item/completed',{id:'injected',type:'agentMessage',phase:'final_answer',text:'PRIVATE_SENTINEL'});await tick();assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');assert.equal(diagnostics(f).at(-1).classification,'risk');auditCase(sub,f,method+' / '+scope,0);}
  else{await tick();assert.equal(f.host.snapshot().connection,'ready');assert.equal(f.host.snapshot().turn_state,scope==='terminal'?'completed':'running');assert.ok(diagnostics(f).some(e=>e.classification===(scope==='terminal'?'late':'identity_mismatch')));if(scope!=='terminal')f.item('item/completed',{id:'safe-final',type:'agentMessage',phase:'final_answer',text:'Public legitimate final'});auditCase(sub,f,method+' / '+scope,scope==='terminal'?0:1);}
 });
});
const toolItem=status=>({id:'shared-item',type:'dynamicToolCall',tool:'image_statistics',arguments:{},status});
const typeClaims=[
 ['dynamic started -> agent completed',f=>f.item('item/started',toolItem('inProgress')),f=>f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'PRIVATE_SENTINEL',phase:'final_answer'})],
 ['dynamic completed -> agent completed',f=>f.item('item/completed',{...toolItem('completed'),success:true}),f=>f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'PRIVATE_SENTINEL',phase:'final_answer'})],
 ['reasoning started -> agent completed',f=>f.item('item/started',{id:'shared-item',type:'reasoning'}),f=>f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'PRIVATE_SENTINEL',phase:'final_answer'})],
 ['reasoning completed -> agent completed',f=>f.item('item/completed',{id:'shared-item',type:'reasoning'}),f=>f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'PRIVATE_SENTINEL',phase:'final_answer'})],
 ['reasoning started -> agent delta',f=>f.item('item/started',{id:'shared-item',type:'reasoning'}),f=>f.notify('item/agentMessage/delta',{itemId:'shared-item',delta:'PRIVATE_SENTINEL'})],
 ['reasoning delta -> agent completed',f=>f.notify('item/reasoning/textDelta',{itemId:'shared-item',contentIndex:0,delta:'PRIVATE_SENTINEL'}),f=>f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'PRIVATE_SENTINEL',phase:'final_answer'})],
 ['plan delta -> agent delta',f=>f.notify('item/plan/delta',{itemId:'shared-item',delta:'PRIVATE_SENTINEL'}),f=>f.notify('item/agentMessage/delta',{itemId:'shared-item',delta:'PRIVATE_SENTINEL'})],
 ['agent delta -> reasoning completed',f=>f.notify('item/agentMessage/delta',{itemId:'shared-item',delta:'Public preview'}),f=>f.item('item/completed',{id:'shared-item',type:'reasoning',text:'PRIVATE_SENTINEL'})],
 ['agent completed -> dynamic started',f=>f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'Public legitimate final',phase:'final_answer'}),f=>f.item('item/started',toolItem('inProgress'))],
 ['dynamic started -> reasoning delta',f=>f.item('item/started',toolItem('inProgress')),f=>f.notify('item/reasoning/summaryTextDelta',{itemId:'shared-item',summaryIndex:0,delta:'PRIVATE_SENTINEL'})],
];
test('an observed item identity cannot change type through lifecycle or deltas',async t=>{
 for(const [name,first,conflict]of typeClaims)await t.test(name,async sub=>{
  const f=fixture(sub);await start(f);first(f);conflict(f);assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');callback(f);f.item('item/completed',{id:'shared-item',type:'agentMessage',text:'PRIVATE_SENTINEL',phase:'final_answer'});await tick();assert.equal(f.host.snapshot().connection,'failed');assert.equal(f.host.snapshot().turn_state,'unknown');assert.ok(diagnostics(f).some(e=>e.classification==='invalid'));assert.ok(!f.events.some(e=>e.kind==='host_text'&&e.text.includes('PRIVATE_SENTINEL')));auditCase(sub,f,name,0);
 });
});
test('normal identities remain usable, foreign type claims are ignored and a new turn starts a new scope',async t=>{
 const f=fixture(t);await start(f);f.notify('item/started',{threadId:'foreign',item:{id:'answer',type:'reasoning'}});f.item('item/started',{id:'answer',type:'agentMessage'});f.notify('item/agentMessage/delta',{itemId:'answer',delta:'Public preview'});f.item('item/completed',{id:'answer',type:'agentMessage',phase:'final_answer',text:'Public legitimate final'});
 f.item('item/started',toolItem('inProgress'));callback(f);await tick();f.item('item/completed',{...toolItem('completed'),success:true});assert.equal(f.host.snapshot().connection,'ready');assert.equal(f.calls(),1);assert.equal(f.host.snapshot().agent_messages[0].text,'Public legitimate final');f.notify('turn/completed',{turn:{id:'turn',status:'completed'}});
 assert.equal(await f.host.startTurn('Public second turn'),'turn-2');f.notify('item/started',{turnId:'turn',item:{id:'shared-item',type:'reasoning'}});f.send({method:'item/completed',params:{threadId:'thread',turnId:'turn-2',item:{id:'shared-item',type:'agentMessage',phase:'final_answer',text:'Public second final'}}});assert.equal(f.host.snapshot().connection,'ready');assert.equal(f.host.snapshot().agent_messages[0].text,'Public second final');auditCase(t,f,'normal/foreign/new-turn identity scope',1);
});
