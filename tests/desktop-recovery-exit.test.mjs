import test from 'node:test';
import assert from 'node:assert/strict';
import {exitWithRecovery} from '../lib/desktop_recovery_exit.mjs';

test('recovery exit cancellation does not drain or close the owned task',async()=>{
 const calls=[];assert.equal(await exitWithRecovery({confirm:async()=>false,freeze:x=>calls.push(['freeze',x]),owned:()=>true,drain:async()=>assert.fail('not authorized'),exit:()=>assert.fail('not authorized'),error:async()=>assert.fail('not an error')}),false);
 assert.deepEqual(calls,[['freeze',true],['freeze',false]]);
});
test('recovery exit waits for the exact owned drain before closing without Save or retry',async()=>{
 const trace=[];let resolve;const wait=new Promise(r=>resolve=r);
 const result=exitWithRecovery({confirm:async()=>true,freeze:x=>trace.push('freeze:'+x),owned:()=>true,drain:async()=>{trace.push('drain');await wait;trace.push('drained');},exit:()=>trace.push('exit'),error:async()=>assert.fail('no error')});
 await new Promise(r=>setImmediate(r));assert.deepEqual(trace,['freeze:true','drain']);resolve();assert.equal(await result,true);assert.deepEqual(trace,['freeze:true','drain','drained','exit','freeze:false']);
});
test('a drain timeout retains the window and never escalates to a kill',async()=>{
 const trace=[];assert.equal(await exitWithRecovery({confirm:async()=>true,freeze:x=>trace.push(['freeze',x]),owned:()=>true,drain:async()=>{throw Error('original backend still draining');},exit:()=>assert.fail('unsafe close'),error:async s=>trace.push(['error',s])}),false);
 assert.match(trace[1][1],/original backend still draining/);assert.match(trace[1][1],/没有重发/);assert.deepEqual(trace.at(-1),['freeze',false]);
});
test('ownership change prevents draining an unrelated backend',async()=>{
 let message;assert.equal(await exitWithRecovery({confirm:async()=>true,freeze(){},owned:()=>false,drain:async()=>assert.fail('wrong owner'),exit:()=>assert.fail('wrong owner'),error:async s=>message=s}),false);assert.match(message,/身份已变化/);
});
