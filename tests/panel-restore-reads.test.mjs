import test from 'node:test';import assert from 'node:assert/strict';
import {PanelRestoreReads} from '../lib/panel_restore_reads.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
test('restore read set coalesces repeated immutable reads and requires a fresh identical provider reply',async()=>{
 let calls=0,value={data:{object_id:'A',hash:'original'},png:'saved PNG'};
 const reads=new PanelRestoreReads(async()=>{calls++;return structuredClone(value);},same);
 const [first,parallel]=await Promise.all([reads.read('A'),reads.read('A')]);assert.equal(calls,1);
 first.data.hash='caller mutation';parallel.png='caller mutation';assert.equal((await reads.read('A')).data.hash,'original');
 await reads.verify();assert.equal(calls,2,'verification must call the original provider, not the memo');
 value={...value,png:'changed PNG'};await assert.rejects(reads.verify(),/changed during restore qualification/);assert.equal(calls,3);
});
test('provider/hash failures are not cached or converted into success',async()=>{
 let calls=0;const reads=new PanelRestoreReads(async()=>{calls++;if(calls===1||calls===3)throw Error('Original provider hash validation failed');return {data:{object_id:'A'}};},same);
 await assert.rejects(reads.read('A'),/hash validation failed/);await reads.read('A');assert.equal(calls,2);
 await assert.rejects(reads.verify(),/hash validation failed/);assert.equal(calls,3);
});
test('restore read bounds fall back to original provider calls without dropping qualification',async()=>{
 let calls=0;const reads=new PanelRestoreReads(async id=>{calls++;return {data:{object_id:id}};},same,{records:1,bytes:1024});
 await reads.read('A');await reads.read('B');await reads.read('B');assert.equal(calls,3);await reads.verify();assert.equal(calls,4);
 const noBytes=new PanelRestoreReads(async id=>{calls++;return {data:{object_id:id}};},same,{records:128,bytes:0});
 await noBytes.read('A');await noBytes.read('A');await noBytes.verify();assert.equal(calls,6);
});
