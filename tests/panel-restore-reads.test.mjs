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

test('qualified restore variants do not share an ordinary key and freshly verify their original readers',async()=>{
 let ordinary=0,bundled=0,secondVariant=0;const reads=new PanelRestoreReads(async id=>{ordinary++;return {data:{object_id:id},png:'ordinary root'};},same);
 const bundle=async()=>{bundled++;return {data:{object_id:'A',frame_ancestry:{records:[{object_id:'A'},{object_id:'frame'}]}},png:'qualified root'};};
 const [plain,first,parallel]=await Promise.all([reads.read('A'),reads.readQualified('A',bundle),reads.readQualified('A',bundle)]);assert.equal(ordinary,1);assert.equal(bundled,1);assert.equal(plain.png,'ordinary root');assert.equal(first.png,'qualified root');first.data.frame_ancestry.records[1].object_id='caller mutation';parallel.png='caller mutation';
 assert.equal((await reads.readQualified('A',async()=>assert.fail('the same complete qualified key reuses the first reader'))).data.frame_ancestry.records[1].object_id,'frame');
 await reads.readQualified('A:other-complete-variant',async()=>{secondVariant++;return {data:{object_id:'A'},png:'another variant'};});await reads.verify();assert.equal(ordinary,2);assert.equal(bundled,2,'fresh verification must invoke the bundled reader rather than ordinary object reading');assert.equal(secondVariant,2);
 const anotherAttempt=new PanelRestoreReads(async()=>assert.fail('qualified-only attempt cannot use ordinary reader'),same);await anotherAttempt.readQualified('A',bundle);assert.equal(bundled,3,'no result or permission survives another restore attempt');
});

test('qualified restore preserves original provider failures during coalesced reads and fresh verification',async()=>{
 const failure=Object.assign(new Error('Original bundled ancestor PNG/hash validation failed'),{status:409,code:'CORRUPT_PAYLOAD'});let calls=0,release;const waiting=new Promise(resolve=>release=resolve),reads=new PanelRestoreReads(async()=>assert.fail('a bundled error must not fall back to ordinary root'),same),provider=async()=>{calls++;if(calls===1){await waiting;throw failure;}if(calls===3)throw failure;return {data:{object_id:'A',frame_ancestry:{records:[{hash:'checked'}]}}};};
 const first=reads.readQualified('bundle:A',provider),parallel=reads.readQualified('bundle:A',provider);release();await assert.rejects(first,error=>error===failure);await assert.rejects(parallel,error=>error===failure);assert.equal(calls,1);
 await reads.readQualified('bundle:A',provider);assert.equal(calls,2,'a rejected read cannot enter the memo');await assert.rejects(reads.verify(),error=>error===failure);assert.equal(calls,3);
});

test('qualified restore rejects a changed ancestor reply even if the ordinary root and PNG remain identical',async()=>{
 let calls=0,hash='original-ancestor';const reads=new PanelRestoreReads(async()=>assert.fail('fresh bundle verification must not read only the root'),same),provider=async()=>{calls++;return {data:{object_id:'A',frame_ancestry:{records:[{object_id:'A'},{object_id:'frame',hash}]}},png:'unchanged root PNG'};};
 await reads.readQualified('bundle:A',provider);hash='changed-ancestor';await assert.rejects(reads.verify(),error=>error.status===409&&/changed during restore qualification/.test(error.message));assert.equal(calls,2);
});

test('qualified restore record and byte limits retain the uncached qualified provider path',async()=>{
 let ordinary=0,bundled=0;const provider=async()=>{bundled++;return {data:{object_id:'A',frame_ancestry:{records:[{object_id:'A'}]}},png:'checked bundle'};},reads=new PanelRestoreReads(async id=>{ordinary++;return {data:{object_id:id}};},same,{records:1,bytes:1024});
 await reads.read('A');await reads.readQualified('A',provider);await reads.readQualified('A',provider);assert.equal(bundled,2);await reads.verify();assert.equal(ordinary,2);assert.equal(bundled,2,'uncached variants do not add entries beyond the original record bound');
 const noBytes=new PanelRestoreReads(async()=>assert.fail('byte fallback cannot change the requested variant'),same,{records:128,bytes:0});await noBytes.readQualified('bundle:A',provider);await noBytes.readQualified('bundle:A',provider);await noBytes.verify();assert.equal(bundled,4);
 const failure=new Error('Uncached bundle still checks every ancestor');await assert.rejects(noBytes.readQualified('bundle:failure',async()=>{throw failure;}),error=>error===failure);
});
