import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopBackendSession} from '../tools/desktop_backend.mjs';
import {DesktopCloseCoordinator} from '../lib/desktop_lifecycle.mjs';

const clean={status:'clean',dirty:false,working_revision:4,can_close:true,unresolved_request_id:null,recovery_available:false};
function fixture(changes={}){const log=[],errors=[];const ports={action:async action=>{log.push(action);return {ok:true};},status:async()=>{log.push('status');return clean;},choose:async()=>{log.push('choose');return 'cancel';},discard:async revision=>{log.push(['discard',revision]);return clean;},close:async revision=>{log.push(['close',revision]);},error:async message=>{errors.push(message);},...changes};return {ports,log,errors,coordinator:new DesktopCloseCoordinator(ports)};}
test('clean close first flushes renderer metadata then checks authoritative version',async()=>{const f=fixture();assert.equal(await f.coordinator.request(),true);assert.deepEqual(f.log,['prepare-close','status',['close',4]]);});
test('cancel changes no workspace and keeps dirty edits',async()=>{const f=fixture({status:async()=>({...clean,dirty:true,can_close:false})});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['prepare-close','choose']);assert.deepEqual(f.errors,[]);});
test('save uses the same renderer action then requires backend clean readback',async()=>{let reads=0;const f=fixture({status:async()=>++reads===1?{...clean,dirty:true,can_close:false}:clean,choose:async()=>'save'});assert.equal(await f.coordinator.request(),true);assert.deepEqual(f.log,['prepare-close','save',['close',4]]);assert.equal(reads,2);});
test('new edit arriving during Save prevents closing',async()=>{let reads=0;const f=fixture({status:async()=>({...clean,dirty:true,can_close:false,working_revision:++reads+4}),choose:async()=>'save'});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['prepare-close','save']);assert.equal(f.errors.length,1);});
test('known Save failure keeps window and preserves edits',async()=>{const f=fixture({status:async()=>({...clean,dirty:true,can_close:false}),choose:async()=>'save',action:async action=>({ok:action!=='save',error:'disk full'})});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,[]);assert.deepEqual(f.errors,['disk full']);});
test('unknown scientific or Save state cannot be disguised as Dont Save',async()=>{
 for(const status of [{...clean,unresolved_request_id:'original-123'},{...clean,status:'save_unknown'},{...clean,status:'saving'}]){const f=fixture({status:async()=>status});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['prepare-close']);assert.equal(f.errors.length,1);}
});
test('Dont Save uses exact working revision and still checks discard outcome',async()=>{const f=fixture({status:async()=>({...clean,dirty:true,can_close:false,working_revision:17}),choose:async()=>'discard'});assert.equal(await f.coordinator.request(),true);assert.deepEqual(f.log,['prepare-close',['discard',17],['close',4]]);});
test('unconfirmed discard never closes',async()=>{const f=fixture({status:async()=>({...clean,dirty:true,can_close:false}),choose:async()=>'discard',discard:async()=>{throw new Error('discard response unknown');}});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['prepare-close']);assert.match(f.errors[0],/unknown/);});
test('an unsaved crash recovery is offered a deliberate decision',async()=>{const f=fixture({status:async()=>({...clean,recovery_available:true,can_close:false})});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['prepare-close','choose']);});
test('unpublished renderer edit or missing handler blocks native close',async()=>{const f=fixture({action:async()=>({ok:false,error:'local transport incomplete'})});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,[]);assert.deepEqual(f.errors,['local transport incomplete']);});
test('one native close attempt is serialized instead of double dialogs or Save',async()=>{
 let resolve;const waiting=new Promise(r=>{resolve=r;});let actions=0,closes=0;
 const f=fixture({action:async()=>{actions++;await waiting;return {ok:true};},close:async()=>{closes++;}}),first=f.coordinator.request(),second=f.coordinator.request();assert.equal(first,second);resolve();assert.equal(await first,true);assert.equal(actions,1);assert.equal(closes,1);
});
test('server CAS rejection on final close keeps window despite earlier clean status',async()=>{const f=fixture({close:async()=>{throw new Error('working revision changed');}});assert.equal(await f.coordinator.request(),false);assert.match(f.errors[0],/revision changed/);});


const workspace=state=>({workspace_analysis:{schema_version:1,...state}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function backendSession(){const replies=[],calls=[];let finish,reject;const wait=new Promise((resolve,no)=>{finish=resolve;reject=no;});const session=new DesktopBackendSession({request:async(action,revision)=>{calls.push({action,revision});return action==='discard'?await wait:workspace(clean);},close:async()=>{calls.push({action:'drain'});},reply:value=>replies.push(value)});const send=body=>session.dispatch(JSON.stringify(body));return {session,replies,calls,send,finish,reject};}
test('desktop original discard remains queryable outside its write queue and never dispatches a second mutation',async()=>{
 const h=backendSession(),first=h.send({id:1,action:'discard',expected_working_revision:17});await tick();await h.send({id:2,action:'query-discard',original_id:1,expected_working_revision:17});assert.equal(h.replies.at(-1).state.discard_operation.state,'running');
 for(const action of ['discard','close']){await h.send({id:3,action,expected_working_revision:17});assert.equal(h.replies.at(-1).ok,false);}for(const wrong of [{original_id:9,expected_working_revision:17},{original_id:1,expected_working_revision:18}]){await h.send({id:4,action:'query-discard',...wrong});assert.equal(h.replies.at(-1).ok,false);}
 assert.equal(h.calls.filter(c=>c.action==='discard').length,1);h.finish(workspace(clean));await first;await h.send({id:5,action:'query-discard',original_id:1,expected_working_revision:17});assert.equal(h.replies.at(-1).state.discard_operation.state,'completed');await h.send({id:1,action:'discard',expected_working_revision:17});assert.equal(h.replies.at(-1).ok,true);assert.equal(h.calls.filter(c=>c.action==='discard').length,1);
});
test('desktop transport-ambiguous discard stays unknown after query and cannot unlock another write',async()=>{
 const h=backendSession(),first=h.send({id:1,action:'discard',expected_working_revision:17});await tick();h.reject(new Error('transport broke after dispatch'));await first;await h.send({id:2,action:'query-discard',original_id:1,expected_working_revision:17});assert.equal(h.replies.at(-1).state.discard_operation.state,'unknown');await h.send({id:3,action:'discard',expected_working_revision:17});await h.send({id:4,action:'close',expected_working_revision:17});assert.equal(h.replies.at(-1).ok,false);assert.equal(h.calls.filter(c=>c.action==='discard').length,1);assert.equal(h.calls.some(c=>c.action==='close'),false);
});
test('desktop explicit HTTP refusal is a failed original receipt and never a not-submitted claim',async()=>{
 const h=backendSession(),first=h.send({id:1,action:'discard',expected_working_revision:17});await tick();h.reject(Object.assign(new Error('HTTP workspace refusal'),{code:'DESKTOP_WORKSPACE_REFUSED'}));await first;await h.send({id:2,action:'query-discard',original_id:1,expected_working_revision:17});assert.equal(h.replies.at(-1).state.discard_operation.state,'failed');assert.equal(JSON.stringify(h.replies).includes('not_submitted'),false);assert.equal(h.calls.filter(c=>c.action==='discard').length,1);
});
test('native Close queries a retained original before renderer work and never auto-closes a late result',async()=>{
 for(const state of ['running','unknown','completed','failed']){const f=fixture({queryDiscard:async()=>({operation:{command_id:7,expected_working_revision:17,state},status:clean})});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['completed','failed'].includes(state)?['inspect-close-state']:[]);assert.equal(f.errors.length,1);assert.match(f.errors[0],/command_id=7/);}
});

test('native Close freezes input before prepare and releases it after cancel, errors and original queries',async()=>{
 for(const mode of ['cancel','error','query']){const frozen=[];const f=fixture({freezeInput:value=>frozen.push(value),status:async()=>({...clean,dirty:true,can_close:false}),...(mode==='error'?{action:async()=>{throw new Error('prepare failed');}}:{}),...(mode==='query'?{queryDiscard:async()=>({operation:{command_id:8,expected_working_revision:17,state:'running'},status:clean})}:{})});assert.equal(await f.coordinator.request(),false);assert.deepEqual(frozen,[true,false]);}
});

test('terminal original discard stays fenced until readonly loaded revision matches, and its ack never continues Close',async()=>{
 for(const fresh of [false,true]){let acknowledged=0;const f=fixture({queryDiscard:async()=>({operation:{command_id:7,expected_working_revision:17,state:'completed'},status:clean}),action:async action=>{f.log.push(action);return {ok:true,working_revision:fresh?clean.working_revision:clean.working_revision-1};},acknowledgeDiscard:operation=>{assert.equal(operation.command_id,7);acknowledged++;}});assert.equal(await f.coordinator.request(),false);assert.deepEqual(f.log,['inspect-close-state']);assert.equal(acknowledged,fresh?1:0);assert.equal(f.errors.length,1);}
});


test('original close is queryable before workspace confirmation and during drain without HTTP replay',async()=>{
 const replies=[],calls=[];let accept,drain;
 const accepted=new Promise(r=>accept=r),drained=new Promise(r=>drain=r);
 const session=new DesktopBackendSession({request:async(action,revision)=>{calls.push({action,revision});return action==='close'?await accepted:workspace(clean);},close:async()=>{calls.push({action:'drain'});await drained;},reply:value=>replies.push(value)});
 const send=x=>session.dispatch(JSON.stringify(x)),first=send({id:1,action:'close',expected_working_revision:4});await tick();
 await send({id:2,action:'query-close',original_id:1,expected_working_revision:4});assert.equal(replies.at(-1).state.close_operation.state,'running');
 await send({id:3,action:'close',expected_working_revision:4});assert.equal(replies.at(-1).ok,false);assert.equal(calls.filter(x=>x.action==='close').length,1);
 accept(workspace(clean));await tick();await send({id:4,action:'query-close',original_id:1,expected_working_revision:4});assert.equal(replies.at(-1).state.close_operation.state,'workspace_closed');
 for(const other of [{original_id:2,expected_working_revision:4},{original_id:1,expected_working_revision:5}]){await send({id:5,action:'query-close',...other});assert.equal(replies.at(-1).ok,false);}
 drain();await first;await send({id:6,action:'query-close',original_id:1,expected_working_revision:4});assert.equal(replies.at(-1).state.close_operation.state,'completed');assert.deepEqual(calls.map(x=>x.action),['close','drain']);
});
test('ambiguous original close retains its exact unknown receipt and never allows another mutation',async()=>{
 const replies=[],calls=[],session=new DesktopBackendSession({request:async(action)=>{calls.push(action);throw Error('lost after dispatch');},close:async()=>assert.fail('unconfirmed workspace must not drain'),reply:value=>replies.push(value)});
 await session.dispatch(JSON.stringify({id:1,action:'close',expected_working_revision:4}));await session.dispatch(JSON.stringify({id:2,action:'query-close',original_id:1,expected_working_revision:4}));assert.equal(replies.at(-1).state.close_operation.state,'unknown');
 for(const action of ['close','discard'])await session.dispatch(JSON.stringify({id:3,action,expected_working_revision:4}));assert.deepEqual(calls,['close']);
});
test('native close resumes the original exit before any renderer, status, save or discard work',async()=>{
 const f=fixture({resumeClose:async()=>true});assert.equal(await f.coordinator.request(),true);assert.deepEqual(f.log,[]);
 const g=fixture({resumeClose:async()=>{throw Error('original close still unknown');}});assert.equal(await g.coordinator.request(),false);assert.deepEqual(g.log,[]);assert.deepEqual(g.errors,['original close still unknown']);
});
