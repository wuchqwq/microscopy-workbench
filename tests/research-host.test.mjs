import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {readFileSync,mkdtempSync,readdirSync,rmdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CodexStdioHost} from '../lib/codex_stdio_host.mjs';
import {createSyntheticHost,runSyntheticHostDemo,awaitHostState,syntheticHostEnvironment} from '../lib/research_host_demo.mjs';
import {parseCliArgs,runCli} from '../lib/workbench_cli.mjs';
import {SYNTHETIC_HOST_NOTICE} from '../lib/research_host.mjs';
const task={task_id:'synthetic-test',context_sha256:'a'.repeat(64)};

for(const scenario of ['early-text-bound','early-invalid-phase'])test('early replay failure fences late completion without replay: '+scenario,async t=>{
 const wire=[],states=[],host=createSyntheticHost(process.execPath,scenario,{onWire:(direction,message)=>wire.push({direction,id:message.id,method:message.method,turn_id:message.params?.turnId})});
 host.subscribe(e=>{if(e.kind==='host_state')states.push({connection:e.snapshot.connection,turn_state:e.snapshot.turn_state});});
 const summary=()=>{const s=host.snapshot();return {...s,agent_messages:s.agent_messages.map(m=>({...m,text:undefined,text_bytes:Buffer.byteLength(m.text),text_sha256:createHash('sha256').update(m.text).digest('hex')}))};};
 try{await host.connect();const handle=await host.startSession(task);
  await assert.rejects(host.startTurn('Synthetic early replay failure'),scenario==='early-text-bound'?/text bound/:/Invalid completed agent message/);
  const afterReject=summary();await awaitHostState(host,s=>s.connection==='closed',2000);const afterLate=summary();
  t.diagnostic(JSON.stringify({scope:scenario,after_reject:afterReject,after_late_completion:afterLate,bounds:host.inputDiagnostics(),states,wire}));
  assert.ok(['failed','closed'].includes(afterReject.connection));assert.equal(afterReject.turn_state,'unknown');assert.equal(afterLate.turn_state,'unknown');
  assert.equal(afterLate.thread_id,handle.thread_id);assert.equal(afterLate.turn_id,'synthetic-turn-1');assert.deepEqual(afterLate.transport_close,{exit_code:0,signal:null});
  assert.equal(states.some(s=>s.turn_state==='completed'),false,'late host terminal must not conceal replay failure');
  assert.equal(afterLate.agent_messages.length,scenario==='early-text-bound'?1:0);
  if(scenario==='early-text-bound'){assert.equal(host.snapshot().agent_messages[0].text,'x'.repeat(600000));assert.equal(afterLate.agent_messages[0].phase,'partial_answer');}
  assert.equal(host.inputDiagnostics().buffer_capacity_bytes,0);assert.equal(host.inputDiagnostics().pending_requests,0);
  assert.equal(wire.filter(w=>w.direction==='send'&&w.method==='turn/start').length,1);await assert.rejects(host.startTurn('No retry after unknown'));
 }finally{assert.equal(await host.close(),true);}
});

test('early replay preserves ordered multi-item finals and all documented phases',async t=>{
 const events=[],host=createSyntheticHost(process.execPath,'early-multi-final');host.subscribe(e=>{if(e.kind==='host_message_completed')events.push(e);});
 try{await host.connect();const handle=await host.startSession(task);const turnId=await host.startTurn('Synthetic legal early phases');await awaitHostState(host,s=>s.turn_state==='completed');
  const phases=['commentary','partial_answer','final_answer'];assert.deepEqual(events.map(e=>e.phase),phases);assert.deepEqual(host.snapshot().agent_messages,events.map(({kind,...m})=>m));
  assert.ok(events.every(e=>e.turn_id===turnId&&e.thread_id===handle.thread_id));assert.deepEqual(events.map(e=>e.text),phases.map(p=>'Synthetic '+p));
  assert.deepEqual(host.snapshot().unfinished_agent_message_ids,[]);t.diagnostic(JSON.stringify({scope:'synthetic_early_legal_phases',snapshot:host.snapshot(),events}));
 }finally{assert.equal(await host.close(),true);}
});

test('authoritative completed items replace no previews, keep exact identities and handle duplicates/late finals',async t=>{
 const events=[],wire=[],host=createSyntheticHost(process.execPath,'final-items',{onWire:(direction,message)=>wire.push({direction,message})});host.subscribe(e=>events.push(e));
 try{await host.connect();const handle=await host.startSession(task);
  for(let n=1;n<=2;n++){
   if(n===2)await host.resumeSession(handle);
   const turnId=await host.startTurn('Synthetic authoritative items');await awaitHostState(host,s=>s.turn_state==='completed');await awaitHostState(host,s=>s.agent_messages.length===2);
   const snapshot=host.snapshot();assert.deepEqual(snapshot.agent_messages.map(m=>[m.item_id,m.text,m.phase]),[['message-a','Authoritative final','final_answer'],['message-b','No delta final',null]]);
   assert.deepEqual(snapshot.unfinished_agent_message_ids,[]);assert.ok(snapshot.agent_messages.every(m=>m.turn_id===turnId&&m.thread_id===handle.thread_id));
   const finals=events.filter(e=>e.kind==='host_message_completed'&&e.turn_id===turnId);assert.equal(finals.length,2);
   assert.equal(finals.some(e=>e.text.includes('WRONG')),false,'foreign turnId cannot be shadowed by an extra turn object');
   const deltas=events.filter(e=>e.kind==='host_text'&&e.turn_id===turnId);assert.deepEqual(deltas.map(e=>[e.item_id,e.text,e.text_kind]),[['message-a','Partial','delta']]);
   assert.ok(events.some(e=>e.kind==='host_state'&&e.snapshot.turn_id===turnId&&e.snapshot.turn_state==='completed'&&e.snapshot.unfinished_agent_message_ids.includes('message-b')));
  }
  assert.ok(events.some(e=>e.kind==='host_warning'&&e.reason==='duplicate_message_completion'));
  assert.ok(events.some(e=>e.kind==='host_warning'&&e.reason==='delta_after_message_completion'));
  assert.ok(events.some(e=>e.kind==='host_warning'&&e.reason==='item_completed_after_turn_terminal'));
  assert.ok(events.some(e=>e.kind==='host_warning'&&e.reason==='stale_or_unbound_notification'));
  t.diagnostic(JSON.stringify({scope:'synthetic_authoritative_items',snapshot:host.snapshot(),events,wire}));
 }finally{assert.equal(await host.close(),true);}
});

test('early authoritative item is bound only after the original turn/start response',async()=>{
 const host=createSyntheticHost(process.execPath,'early-final');
 try{await host.connect();await host.startSession(task);const turnId=await host.startTurn('Synthetic early final');await awaitHostState(host,s=>s.turn_state==='completed');
  assert.equal(host.snapshot().agent_messages[0].turn_id,turnId);assert.equal(host.snapshot().agent_messages[0].text,'Final before start reply');
 }finally{assert.equal(await host.close(),true);}
});

test('turn terminal never promotes unfinished deltas into a final item',async()=>{
 const host=createSyntheticHost(process.execPath,'unfinished-item');
 try{await host.connect();await host.startSession(task);await host.startTurn('Synthetic unfinished text');await awaitHostState(host,s=>s.turn_state==='completed');
  assert.deepEqual(host.snapshot().agent_messages,[]);assert.deepEqual(host.snapshot().unfinished_agent_message_ids,['unfinished']);
 }finally{assert.equal(await host.close(),true);}
});

test('conflicting authoritative completion fails unknown without silently replacing the first observation',async t=>{
 const events=[],host=createSyntheticHost(process.execPath,'conflicting-final');host.subscribe(e=>events.push(e));
 try{await host.connect();await host.startSession(task);await host.startTurn('Synthetic conflicting final').catch(()=>{});
  await awaitHostState(host,s=>s.connection==='failed',1000);assert.equal(host.snapshot().turn_state,'unknown');
  assert.equal(host.snapshot().agent_messages[0].text,'Authoritative final');assert.equal(events.filter(e=>e.kind==='host_message_completed').length,1);
  assert.ok(events.some(e=>e.kind==='host_state'&&e.snapshot.turn_state==='completed'),'even a previous turn terminal cannot conceal the conflict');
  await assert.rejects(host.startTurn('Do not replay conflicting work'));t.diagnostic(JSON.stringify({scope:'synthetic_conflicting_final',snapshot:host.snapshot(),events}));
 }finally{assert.equal(await host.close(),true);}
});

for(const scenario of ['message-count-bound','message-text-bound'])test('completed message retention is bounded: '+scenario,async()=>{
 const host=createSyntheticHost(process.execPath,scenario);
 try{await host.connect();await host.startSession(task);await host.startTurn('Synthetic retention bound').catch(()=>{});await awaitHostState(host,s=>s.connection==='failed');
  const s=host.snapshot();assert.equal(s.turn_state,'unknown');assert.equal(s.agent_messages.length,scenario==='message-count-bound'?64:1);assert.ok(s.agent_messages.reduce((n,m)=>n+Buffer.byteLength(m.text),0)<=1048576);
 }finally{assert.equal(await host.close(),true);}
});

test('invalid UTF-8 cannot become accepted replacement text; pending call rejects and real child closes unknown',async t=>{
 const events=[],wire=[],host=createSyntheticHost(process.execPath,'invalid-utf8',{onWire:(direction,message)=>wire.push({direction,message})});host.subscribe(e=>events.push(e));
 try{await host.connect();const handle=await host.startSession(task);const turnId=await host.startTurn('Synthetic invalid UTF-8');await awaitHostState(host,s=>s.turn_state==='awaiting_user');
  await assert.rejects(host.interrupt(),/UTF-8/);await awaitHostState(host,s=>s.connection==='closed');
  assert.equal(host.snapshot().turn_state,'unknown');assert.equal(host.snapshot().thread_id,handle.thread_id);assert.equal(host.snapshot().turn_id,turnId);
  assert.equal(events.some(e=>e.kind==='host_text'&&(e.item_id==='invalid-item'||e.text.includes('\ufffd'))),false);
  assert.equal(host.inputDiagnostics().buffer_capacity_bytes,0);assert.equal(host.inputDiagnostics().pending_requests,0);
  assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='turn/start').length,1);
  t.diagnostic(JSON.stringify({scope:'synthetic_invalid_utf8',snapshot:host.snapshot(),bounds:host.inputDiagnostics(),events}));
 }finally{assert.equal(await host.close(),true);}
});

test('close timeout is historical, actual late exit updates queryable receipt and repeated close',async t=>{
 const events=[],host=createSyntheticHost(process.execPath,'delayed-close');host.subscribe(e=>events.push(e));
 try{await host.connect();await host.startSession(task);await host.startTurn('Synthetic delayed EOF');await awaitHostState(host,s=>s.turn_state==='completed');
  const first=await host.close();assert.equal(first,false);assert.equal(host.snapshot().connection,'closing');assert.equal(host.snapshot().transport_close,null);
  await awaitHostState(host,s=>s.connection==='closed',2000);assert.deepEqual(host.snapshot().transport_close,{exit_code:0,signal:null});
  assert.equal(await host.close(),true);assert.equal(events.filter(e=>e.kind==='host_transport_closed').length,1);
  t.diagnostic(JSON.stringify({scope:'synthetic_late_close',first_close:first,snapshot:host.snapshot(),events}));
 }finally{await host.close();}
});

test('oversized continuous input stays bounded, rejects pending RPC, closes its real child and never resends',async t=>{
 const wire=[],host=createSyntheticHost(process.execPath,'flood',{onWire:(direction,message)=>wire.push({direction,message})});
 let observeClose;const physicallyClosed=new Promise(resolve=>{observeClose=resolve;});host.subscribe(e=>{if(e.kind==='host_transport_closed')observeClose(e);});
 try{
  await host.connect();const handle=await host.startSession(task);const turnId=await host.startTurn('Synthetic bounded-input negative');await awaitHostState(host,s=>s.turn_state==='awaiting_user');
  await assert.rejects(host.interrupt(),/bound|limit/i);
  let timer;const close=await Promise.race([physicallyClosed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Overflow did not close its owned child before explicit caller cleanup')),1500);})]).finally(()=>clearTimeout(timer));
  const bounds=host.inputDiagnostics();assert.equal(bounds.limit_bytes,1048576);assert.ok(bounds.peak_buffered_bytes<=bounds.limit_bytes);assert.ok(bounds.received_bytes>bounds.limit_bytes);
  assert.equal(bounds.buffered_bytes,0);assert.equal(bounds.buffer_capacity_bytes,0);assert.equal(bounds.stopped,true);assert.equal(bounds.pending_requests,0);assert.equal(bounds.termination_requested,true);
  const snapshot=host.snapshot();assert.equal(snapshot.connection,'closed');assert.equal(snapshot.turn_state,'unknown');assert.equal(snapshot.thread_id,handle.thread_id);assert.equal(snapshot.turn_id,turnId);
  assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='turn/start').length,1);assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='turn/interrupt').length,1);
  await assert.rejects(host.startTurn('Must not resend after overflow'));
  t.diagnostic(JSON.stringify({scope:'actual_local_synthetic_child',bounds,close,snapshot}));
 }finally{assert.equal(await host.close(),true);}
});

test('interleaved item text preserves exact item identity in each turn',async t=>{
 const host=createSyntheticHost(process.execPath,'multi-item'),text=[];host.subscribe(e=>{if(e.kind==='host_text')text.push(e);});
 try{await host.connect();const handle=await host.startSession(task);
  const first=await host.startTurn('Synthetic multi-item first');await awaitHostState(host,s=>s.turn_state==='completed');await host.resumeSession(handle);
  const second=await host.startTurn('Synthetic multi-item second');await awaitHostState(host,s=>s.turn_state==='completed');
  for(const turnId of [first,second]){const pieces=text.filter(e=>e.turn_id===turnId);assert.deepEqual(pieces.map(e=>[e.item_id,e.text]),[['item-a','甲1'],['item-b','乙1'],['item-a','甲2'],['item-b','乙2']]);assert.equal(pieces.every(e=>e.thread_id===handle.thread_id),true);}
  t.diagnostic(JSON.stringify({scope:'synthetic_item_deltas_not_model_output',text}));
 }finally{assert.equal(await host.close(),true);}
});

test('many individually bounded frames above1MiB aggregate continue the same session normally',async t=>{
 const host=createSyntheticHost(process.execPath,'many-frames');let characters=0;host.subscribe(e=>{if(e.kind==='host_text')characters+=e.text.length;});
 try{await host.connect();const handle=await host.startSession(task);await host.startTurn('Synthetic legal frame stream');await awaitHostState(host,s=>s.turn_state==='completed');
  assert.equal(characters,1280000);const bounds=host.inputDiagnostics();assert.ok(bounds.received_bytes>bounds.limit_bytes);assert.ok(bounds.peak_buffered_bytes<65536);assert.equal(bounds.termination_requested,false);
  await host.resumeSession(handle);await host.startTurn('Synthetic normal continuation');await awaitHostState(host,s=>s.turn_state==='awaiting_user');await host.interrupt();await awaitHostState(host,s=>s.turn_state==='interrupted');
  t.diagnostic(JSON.stringify({scope:'valid_frames_same_session',bounds,final:host.snapshot()}));
 }finally{assert.equal(await host.close(),true);}
});

test('synthetic peer receives only platform/temp environment, no host authentication or profile',()=>{
 const environment=syntheticHostEnvironment();assert.ok(Object.keys(environment).every(key=>['SystemRoot','WINDIR','TEMP','TMP'].includes(key)));
 for(const key of ['OPENAI_API_KEY','ACCESS_TOKEN','CODEX_HOME','HOME','USERPROFILE','PATH'])assert.equal(Object.hasOwn(environment,key),false);
});

test('shared synthetic session handshakes, completes, resumes, blocks approval, interrupts and physically closes',async()=>{
 const result=await runSyntheticHostDemo(process.execPath);
 assert.equal(result.notice,SYNTHETIC_HOST_NOTICE);assert.equal(result.real_codex_connected,false);assert.equal(result.workspace_read,false);assert.equal(result.scientific_execution,false);
 assert.equal(result.final.connection,'closed');assert.equal(result.final.turn_state,'interrupted');assert.equal(result.final.verification,'synthetic');
 const sent=result.wire.filter(e=>e.direction==='send').map(e=>e.message);
 assert.deepEqual(sent.map(m=>m.method),['initialize','initialized','thread/start','turn/start','thread/resume','turn/start','turn/interrupt']);
 assert.deepEqual(Object.keys(sent[0].params),['clientInfo']);assert.deepEqual(sent[2].params,{});
 assert.deepEqual(sent[4].params,{threadId:result.handle.thread_id,excludeTurns:true});
 assert.equal(sent.filter(m=>m.method==='turn/start').every(m=>Object.keys(m.params).sort().join(',')==='input,threadId'),true);
 assert.ok(result.events.some(e=>e.kind==='host_request_blocked'&&e.disposition==='awaiting_user'));
 assert.ok(result.events.some(e=>e.kind==='host_transport_closed'&&e.exit_code===0&&e.signal===null));
 assert.equal(sent.some(m=>Object.hasOwn(m,'result')||Object.hasOwn(m,'error')),false,'no automatic approval response');
 assert.equal(JSON.stringify(sent).includes('approvalPolicy'),false);assert.equal(JSON.stringify(sent).includes('sandboxPolicy'),false);
});

for(const scenario of ['duplicate','out-of-order'])test('valid '+scenario+' responses do not replay or lose terminal events',async()=>{
 const wire=[],host=createSyntheticHost(process.execPath,scenario,{onWire:(direction,message)=>wire.push({direction,message})});
 try{await host.connect();await host.startSession(task);const turnId=await host.startTurn('Only synthetic public text');await awaitHostState(host,s=>s.turn_state==='completed');
  assert.equal(host.snapshot().turn_id,turnId);assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='turn/start').length,1);
 }finally{assert.equal(await host.close(),true);}
});

test('late old-turn text/completion/reply cannot overwrite the new pending turn; repeated interrupt has one original RPC',async()=>{
 const wire=[],events=[],host=createSyntheticHost(process.execPath,'late',{onWire:(direction,message)=>wire.push({direction,message})});host.subscribe(e=>events.push(e));
 try{await host.connect();const handle=await host.startSession(task);await host.startTurn('First synthetic turn');await awaitHostState(host,s=>s.turn_state==='completed');
  await host.resumeSession(handle);const next=await host.startTurn('Second synthetic turn');await awaitHostState(host,s=>s.turn_state==='awaiting_user');
  assert.equal(host.snapshot().turn_id,next);assert.equal(events.some(e=>e.kind==='host_text'&&e.text==='OLD_SYNTHETIC_TEXT'),false);
  // This negative peer deliberately acknowledges but withholds turn/completed.
  await Promise.all([host.interrupt(),host.interrupt()]);assert.equal(host.snapshot().turn_state,'awaiting_user','ack alone is not terminal');
  assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='turn/interrupt').length,1);
  assert.ok(events.some(e=>e.kind==='host_warning'&&e.reason==='duplicate_or_late_response'));
 }finally{assert.equal(await host.close(),true);assert.equal(host.snapshot().turn_state,'unknown');}
});

for(const scenario of ['invalid','invalid-error','hang'])test('invalid or missing '+scenario+' reply fails without automatic reconnection',async()=>{
 const wire=[],host=createSyntheticHost(process.execPath,scenario,{timeoutMs:scenario==='hang'?300:5000,onWire:(direction,message)=>wire.push({direction,message})});
 try{await assert.rejects(host.connect());assert.notEqual(host.snapshot().connection,'ready');assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='initialize').length,1);
 }finally{assert.equal(await host.close(),true);}
});

test('explicit configured missing executable fails startup; no discovery, replacement or retry',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'synthetic-missing-host-')),host=new CodexStdioHost({executable:path.join(dir,'not-installed.exe')});
 try{await assert.rejects(host.connect());assert.notEqual(host.snapshot().connection,'ready');}finally{assert.equal(await host.close(),true);rmdirSync(dir);}
 assert.throws(()=>new CodexStdioHost({executable:'codex'}),/absolute/);
});

test('server tool request is explicitly unsupported and cannot invoke a provider or arbitrary method',async()=>{
 const wire=[],events=[],host=createSyntheticHost(process.execPath,'tool',{onWire:(direction,message)=>wire.push({direction,message})});host.subscribe(e=>events.push(e));
 try{await host.connect();await host.startSession(task);await host.startTurn('Synthetic tool boundary');await awaitHostState(host,s=>s.turn_state==='failed');
  assert.ok(events.some(e=>e.kind==='host_request_blocked'&&e.method==='item/tool/call'&&e.disposition==='unsupported'));
  assert.ok(wire.some(e=>e.direction==='send'&&e.message.id==='synthetic-tool'&&e.message.error?.code===-32601));
  assert.equal(wire.some(e=>e.direction==='send'&&e.message.method==='command/exec'),false);
 }finally{assert.equal(await host.close(),true);}
});

test('explicit RPC rejection and wrong resumed identity remain visible',async()=>{
 const host=createSyntheticHost(process.execPath,'rpc-error');try{await host.connect();await host.startSession(task);await assert.rejects(host.startTurn('Synthetic failure'),/rejected/);assert.equal(host.snapshot().turn_state,'failed');}finally{await host.close();}
 const resumed=createSyntheticHost(process.execPath,'wrong-thread');try{await resumed.connect();const handle=await resumed.startSession(task);await assert.rejects(resumed.resumeSession({...handle,task:{...task,context_sha256:'b'.repeat(64)}}),/rebinding/);await assert.rejects(resumed.resumeSession(handle),/identity/);}finally{await resumed.close();}
});

test('session creation/resume cannot race a new session or start a turn on the previous binding',async()=>{
 const wire=[],host=createSyntheticHost(process.execPath,'normal',{onWire:(direction,message)=>wire.push({direction,message})});
 try{await host.connect();const creating=host.startSession(task);
  await assert.rejects(host.startSession({...task,task_id:'another-task'}),/session operation/);const handle=await creating;
  await assert.rejects(host.resumeSession({...handle,thread_id:'another-thread'}),/session switching/);
  const resuming=host.resumeSession(handle);await assert.rejects(host.startTurn('Must not start on the previous binding'),/idle session/);await resuming;
  assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='thread/start').length,1);
  assert.equal(wire.filter(e=>e.direction==='send'&&e.message.method==='turn/start').length,0);
 }finally{assert.equal(await host.close(),true);}
});

test('close during initialization rejects pending work and never reports a ready connection',async()=>{
 const host=createSyntheticHost(process.execPath,'hang');const connecting=host.connect();const rejected=assert.rejects(connecting);assert.equal(await host.close(),true);await rejected;
 assert.equal(host.snapshot().connection,'closed');assert.equal(await host.close(),true);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(runSyntheticHostDemo(process.execPath,cancelled.signal),/before start/);
});

test('CLI demo has no workspace/provider input and desktop main shares the exact Node service',async()=>{
 assert.deepEqual(parseCliArgs(['host-demo']),{command:'host-demo'});assert.throws(()=>parseCliArgs(['host-demo','--workspace',tmpdir()]));
 const result=await runCli({command:'host-demo'},{provider:{call(){throw new Error('Scientific provider must not be invoked');},close(){}}});assert.equal(result.data.workspace_read,false);
 const dir=mkdtempSync(path.join(tmpdir(),'synthetic-host-cli-'));
 try{const entry=fileURLToPath(new URL('../tools/workbench_cli.mjs',import.meta.url));const p=spawnSync(process.execPath,[entry,'host-demo'],{cwd:dir,encoding:'utf8',windowsHide:true});
  assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).data.real_codex_connected,false);assert.deepEqual(readdirSync(dir),[]);
 }finally{rmdirSync(dir);}
 const main=readFileSync(fileURLToPath(new URL('../tools/desktop_main.mjs',import.meta.url)),'utf8');assert.match(main,/runSyntheticHostDemo\(options.node\)/);assert.match(main,/合成测试；非 AI/);
});
