// Local mock stdin is counted at the actual Writable boundary, not onWire.
// No model, external process, network, decoded array or Panel UI is invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {CodexStdioHost} from '../lib/codex_stdio_host.mjs';
import {awaitHostState} from '../lib/research_host_demo.mjs';
import {prepareResearchHostImage,hostTurnWireInput} from '../lib/research_host_input.mjs';
import {fixture,ownerFor,approvedFor} from './research-host-input-fixture.mjs';
function countedHost(t,onWire){
 const child=new EventEmitter(),received=[],held=[];let sequence=0;
 child.stdout=new PassThrough();child.stderr=new PassThrough();
 const port={holdSessions:false,onTurn:null};
 const send=message=>child.stdout.write(JSON.stringify(message)+'\n');
 child.stdin=new Writable({write(chunk,_encoding,done){
  const message=JSON.parse(chunk.toString());received.push(message);
  queueMicrotask(()=>{
   if(message.method==='initialize')send({id:message.id,result:{}});
   if(['thread/start','thread/resume'].includes(message.method)){
    const reply={id:message.id,result:{thread:{id:message.params.threadId??'thread-'+(++sequence)}}};
    if(port.holdSessions)held.push(reply);else send(reply);
   }
   if(message.method==='turn/start'){
    port.onTurn?.();const turn={id:'turn-'+(++sequence),status:'completed'};
    send({id:message.id,result:{turn}});send({method:'turn/completed',params:{threadId:message.params.threadId,turn}});
   }
  });done();
 }});
 child.stdin.once('finish',()=>queueMicrotask(()=>child.emit('close',0,null)));
 const host=new CodexStdioHost({executable:process.execPath,spawnProcess:()=>child,onWire});
 port.host=host;port.received=received;port.turns=()=>received.filter(m=>m.method==='turn/start');port.release=()=>{for(const r of held.splice(0))send(r);};
 t.after(async()=>{port.release();assert.equal(await host.close(),true);});return port;
}
async function setup(t,options={}){
 const f=fixture(t),owner=ownerFor(f),port=countedHost(t,options.onWire),host=port.host;
 await host.connect();const prepared=prepareResearchHostImage(f.options),approved=await approvedFor(owner,prepared,host,options.ttlMs??300000);
 return {f,owner,port,host,prepared,approved};
}
async function refusesZero(h,input=h.approved){await assert.rejects(h.host.startTurn(input));assert.equal(h.port.turns().length,0);}

async function unbound(t,onWire){const port=countedHost(t,onWire);await port.host.connect();await port.host.startSession({task_id:'text-diagnostic',context_sha256:'a'.repeat(64)});return port;}

test('unapproved changing image getter has zero actual dispatch',async t=>{
 const f=fixture(t),port=await unbound(t);let reads=0,error;
 const input={text:'Public synthetic accessor bypass control',get images(){return ++reads===1?undefined:[f.image];}};
 try{await port.host.startTurn(input);}catch(e){error=e;}
 t.diagnostic(JSON.stringify({case:'changing_images_accessor',images_reads:reads,actual_turn_start_count:port.turns().length}));
 assert.equal(port.turns().length,0);assert.ok(error);assert.equal(reads,0);
});

test('unapproved raw-object accessors cannot reenter transport during classification',async t=>{
 const f=fixture(t),port=await unbound(t),nested=[];let reads=0;
 const reenter=()=>{reads++;nested.push(port.host.startTurn('Attempted accessor reentry').catch(()=>{}));};
 const input={get text(){reenter();return 'unapproved';},get source(){reenter();return undefined;},get images(){reenter();return [f.image];}};
 await assert.rejects(port.host.startTurn(input));await Promise.all(nested);
 assert.equal(reads,0);assert.equal(port.turns().length,0);
});

test('unapproved Proxy input invokes no get/ownKeys traps and writes no image',async t=>{
 const f=fixture(t),port=await unbound(t),nested=[];let traps=0;
 const input=new Proxy({text:'Proxy image',images:[f.image]},{get(target,key){traps++;nested.push(port.host.startTurn('Proxy reentry').catch(()=>{}));return Reflect.get(target,key);},ownKeys(target){traps++;return Reflect.ownKeys(target);}});
 await assert.rejects(port.host.startTurn(input));await Promise.all(nested);
 assert.equal(traps,0);assert.equal(port.turns().length,0);
});

test('revoked Proxy and boxed or frozen text objects cannot enter the string fallback',async t=>{
 const port=await unbound(t),revocable=Proxy.revocable({},{});revocable.revoke();
 for(const input of [revocable.proxy,new String('boxed text'),Object.freeze({text:'object text'}),()=>({text:'function input'})])await assert.rejects(port.host.startTurn(input));
 assert.equal(port.turns().length,0);
});

test('plain-string diagnostic remains one text-only dispatch across observer reentry',async t=>{
 let port,reads=0,nested;
 port=await unbound(t,(direction,message)=>{if(direction==='send'&&message.method==='turn/start')nested=port.host.startTurn({get text(){reads++;return 'nested';},get images(){reads++;return [];}}).catch(()=>{});});
 await port.host.startTurn('Exact immutable diagnostic text');await nested;
 assert.equal(reads,0);assert.equal(port.turns().length,1);assert.deepEqual(port.turns()[0].params.input,[{type:'text',text:'Exact immutable diagnostic text'}]);
});

test('a Proxy wrapping a real grant cannot impersonate its original identity',async t=>{
 const h=await setup(t);let traps=0;const wrapped=new Proxy(h.approved,{get(target,key){traps++;return Reflect.get(target,key);}});
 await refusesZero(h,wrapped);assert.equal(traps,0);
 await h.host.startTurn(h.approved);assert.equal(h.port.turns().length,1);
});

test('normal exact scope dispatches reviewed bytes once; approval is not replayable',async t=>{
 const h=await setup(t),reviewed=hostTurnWireInput(h.prepared);
 await h.host.startTurn(h.approved);await awaitHostState(h.host,s=>s.turn_state==='completed');
 assert.equal(h.port.turns().length,1);assert.deepEqual(h.port.turns()[0].params.input,reviewed);
 await assert.rejects(h.host.startTurn(h.approved),/consumed/);assert.equal(h.port.turns().length,1);
 await assert.rejects(h.host.startTurn('Unapproved research follow-up'));assert.equal(h.port.turns().length,1);
});

test('proven preparation is frozen; valid-format forged frame is unverified and cannot dispatch',async t=>{
 const h=await setup(t);
 assert.throws(()=>{h.prepared.source.frame_id='9'.repeat(32);},TypeError);
 assert.throws(()=>{h.prepared.text='Different question';},TypeError);
 const forged=structuredClone(h.prepared);forged.source.frame_id='9'.repeat(32);
 const wire=hostTurnWireInput(forged);assert.match(wire[1].text,/Caller-supplied.*unverified/);assert.doesNotMatch(wire[1].text,/Verified saved/);
 assert.throws(()=>h.owner.gate.review(forged),/Original prepared/);
 await refusesZero(h,forged);await refusesZero(h,h.prepared);
});

test('mutable option accessors are captured once before provenance checks',t=>{
 const f=fixture(t);let reads=0;
 const prepared=prepareResearchHostImage({...f.options,get frame_id(){return ++reads===1?f.options.frame_id:'9'.repeat(32);}});
 assert.equal(reads,1);assert.equal(prepared.source.frame_id,f.options.frame_id);assert.match(hostTurnWireInput(prepared)[1].text,/Verified saved/);
});

test('JSON copies, forged approval markers and copied reviews cannot grant disclosure',async t=>{
 const h=await setup(t),review=h.owner.gate.review(h.prepared);
 for(const fake of [{},{...h.approved},{approved:true,verified:true},JSON.parse(JSON.stringify(h.approved)),{...h.prepared,text:'another question'}])await refusesZero(h,fake);
 assert.throws(()=>h.owner.gate.approve(structuredClone(review),h.host,{ttlMs:1000}),/Original unapproved review/);
});

test('one review cannot mint duplicate grants; a new approval supersedes the old one',async t=>{
 const h=await setup(t),review=h.owner.gate.review(h.prepared),newGrant=h.owner.gate.approve(review,h.host,{ttlMs:300000});
 assert.throws(()=>h.owner.gate.approve(review,h.host,{ttlMs:300000}),/unapproved review/);await refusesZero(h);
 await h.host.startTurn(newGrant);assert.equal(h.port.turns().length,1);
});

test('another authority cannot withdraw a grant and expiry cannot be disabled',async t=>{
 const h=await setup(t),other=ownerFor(h.f);assert.throws(()=>other.gate.revoke(h.approved),/another authority/);
 const review=h.owner.gate.review(h.prepared);
 for(const ttlMs of [0,-1,NaN,Infinity,300001])assert.throws(()=>h.owner.gate.approve(review,h.host,{ttlMs}),/lifetime/);
 assert.equal(h.port.turns().length,0);
});

const changes={
 question:h=>{h.owner.state.panel.research_question.text='Unrelated new question';},
 'same text but new question record':h=>{h.owner.state.panel.research_question.recorded_utc='2026-11-07T00:00:01.000Z';},
 'question context':h=>{h.owner.state.panel.research_question.context_object_id='6'.repeat(32);},
 view:h=>{h.owner.state.panel.object.object_id='6'.repeat(32);},
 frame:h=>{h.owner.state.panel.frame_identity.frame_object_id='6'.repeat(32);},
 'Panel owner session':h=>{h.owner.state.panel.research_lead_session_id='6'.repeat(32);},
 'Panel id':h=>{h.owner.state.panel.panel_id='6'.repeat(32);},
 generation:h=>{h.owner.state.panel.panel_generation++;},
 'state revision':h=>{h.owner.state.panel.state_revision++;},
 'draft revision':h=>{h.owner.state.panel.edit_state.draft_revision++;},
 'collection revision':h=>{h.owner.state.panel.window_collection.revision++;},
 'workspace revision':h=>{h.owner.state.panel.workspace_analysis.working_revision++;},
 selection:h=>{h.owner.state.panel.selection={kind:'rectangle',coordinates:[0,0,1,1]};},
 'dirty draft':h=>{h.owner.state.panel.edit_state.dirty=true;},
 gesture:h=>{h.owner.state.panel.edit_state.gesture_active=true;},
 'pending result':h=>{h.owner.state.panel.pending_result={request_id:'unknown-result'};},
 'unknown scientific operation':h=>{h.owner.state.panel.last_operation={state:'unknown',request_id:'original-unknown'};},
 workspace:h=>{h.owner.state.workspace=path.dirname(h.f.workspace);},
 'provider manifest':h=>{h.f.put({...h.f.view,private_revision:'changed despite unchanged owner lease'});},
 'provider array':h=>{writeFileSync(path.join(h.f.workspace,'objects',h.f.options.frame_id,'data.npy'),'different array');},
 PNG:h=>{writeFileSync(h.f.file,'different PNG');},
 revoked:h=>{h.owner.gate.revoke(h.approved);},
};
for(const [name,change] of Object.entries(changes))test('zero actual dispatch after '+name+' changes',async t=>{
 const h=await setup(t);change(h);await refusesZero(h);assert.equal(h.host.snapshot().turn_state,'idle');
});

test('expired monotonic approval refuses with zero dispatch',async t=>{
 const h=await setup(t,{ttlMs:1});await new Promise(resolve=>setTimeout(resolve,10));await refusesZero(h);
});

test('a refused grant stays revoked even if visible state is changed back',async t=>{
 const h=await setup(t),old=h.owner.state.panel.research_question.text;
 h.owner.state.panel.research_question.text='changed';await refusesZero(h);
 h.owner.state.panel.research_question.text=old;await refusesZero(h);
});

test('same thread resumed after an await invalidates the old approval',async t=>{
 const h=await setup(t),before=h.host.snapshot(),handle={host_kind:'codex',thread_id:before.thread_id,task:before.task};
 await h.host.resumeSession(handle);assert.ok(h.host.snapshot().session_revision>before.session_revision);await refusesZero(h);
});

test('a pending session await cannot send on the old session',async t=>{
 const h=await setup(t),s=h.host.snapshot();h.port.holdSessions=true;
 const pending=h.host.resumeSession({host_kind:'codex',thread_id:s.thread_id,task:s.task});
 await new Promise(resolve=>setImmediate(resolve));await refusesZero(h);h.port.release();await pending;await refusesZero(h);
});

test('another host with matching visible thread/task fields cannot use the grant',async t=>{
 const h=await setup(t),other=countedHost(t);await other.host.connect();await other.host.startSession(h.host.snapshot().task);
 await assert.rejects(other.host.startTurn(h.approved));assert.equal(other.turns().length,0);assert.equal(h.port.turns().length,0);
});

test('session task context must equal reviewed question/source/revision digest',async t=>{
 const f=fixture(t),owner=ownerFor(f),port=countedHost(t);await port.host.connect();await port.host.startSession({task_id:'unrelated',context_sha256:'a'.repeat(64)});
 const review=owner.gate.review(prepareResearchHostImage(f.options));assert.throws(()=>owner.gate.approve(review,port.host,{ttlMs:1000}),/exact reviewed/);assert.equal(port.turns().length,0);
});

test('question/state change while human review awaits cannot be approved afterwards',async t=>{
 const f=fixture(t),owner=ownerFor(f),port=countedHost(t),prepared=prepareResearchHostImage(f.options),review=owner.gate.review(prepared);
 await port.host.connect();await port.host.startSession({task_id:'awaited-review',context_sha256:review.context_sha256});
 await Promise.resolve();owner.state.panel.state_revision++;
 assert.throws(()=>owner.gate.approve(review,port.host,{ttlMs:1000}),/changed/);assert.equal(port.turns().length,0);
});

for(const boundary of ['starting listener','wire observer','last owner read'])test('recheck after '+boundary+' prevents actual stdin dispatch',async t=>{
 let h;h=await setup(t,{onWire:(direction,message)=>{if(boundary==='wire observer'&&direction==='send'&&message.method==='turn/start')h.owner.gate.revoke(h.approved);}});
 if(boundary==='starting listener')h.host.subscribe(e=>{if(e.kind==='host_state'&&e.snapshot.turn_state==='starting')h.owner.state.panel.state_revision++;});
 if(boundary==='last owner read'){let calls=0;h.owner.readHook=()=>{if(++calls===2)h.owner.gate.revoke(h.approved);};}
 await refusesZero(h);assert.equal(h.host.snapshot().turn_state,'idle');assert.equal(h.host.inputDiagnostics().pending_requests,0);
});

test('source replacement in wire observer refuses rather than sending stale approved bytes',async t=>{
 let h;h=await setup(t,{onWire:(direction,message)=>{if(direction==='send'&&message.method==='turn/start')writeFileSync(h.f.file,'changed after initial validation');}});
 await refusesZero(h);assert.equal(h.host.snapshot().turn_state,'idle');
});

test('async/stale external owner read is not accepted as an atomic current-state check',async t=>{
 const h=await setup(t);h.owner.readHook=()=>{};
 const {createResearchSendGate}=await import('../lib/research_host_dispatch.mjs');
 const gate=createResearchSendGate({readCurrent:async()=>structuredClone(h.owner.state)});
 assert.throws(()=>gate.review(h.prepared),/Synchronous/);assert.equal(h.port.turns().length,0);
});

test('change after stdin acceptance cannot unsend, and the consumed grant never retries',async t=>{
 const h=await setup(t);h.port.onTurn=()=>{h.owner.state.panel.state_revision++;h.owner.gate.revoke(h.approved);};
 await h.host.startTurn(h.approved);await awaitHostState(h.host,s=>s.turn_state==='completed');assert.equal(h.port.turns().length,1);
 await assert.rejects(h.host.startTurn(h.approved));assert.equal(h.port.turns().length,1);
});
