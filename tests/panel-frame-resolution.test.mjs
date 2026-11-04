// Pure read/identity contract checks. No fabricated on-disk science history,
// worker, FFT calculation, private data or native GUI qualification is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePanelFrame,PANEL_FRAME_ANCESTOR_READ_BUDGET} from '../lib/panel_frame_resolution.mjs';
import {readImageFrameAncestry,frameAncestryProjection} from '../lib/image_frame_ancestry.mjs';
const id=n=>n.toString(16).padStart(32,'0'),copy=value=>structuredClone(value);
const record=(n,kind='annotate',extra={})=>({object_id:id(n),kind,backend:'external-image-workspace',state:'completed',...extra});
function chain(length){const records=Array.from({length},(_,index)=>record(index+1,index+1===length?'frame':'annotate',index+1===length?{frame_index:2,source_object_id:id(900),dm_dataset_index:1,dm_plane_selection:{axis_indices:[0,2]}}:{parent_object_id:id(index+2)}));const map=new Map(records.map(value=>[value.object_id,value]));return {root:records[0],records,map};}
function bundled(records,root=records[0]){return readImageFrameAncestry({schema_version:1,root_object_id:root.object_id,records:records.map(frameAncestryProjection)},root);}
async function resolve(fixture,{bundle=false}={}){const calls=[],before=copy(fixture.records);const result=await resolvePanelFrame(fixture.root,async key=>{calls.push(key);assert.ok(fixture.map.has(key),'unknown fixture read');return copy(fixture.map.get(key));},bundle?bundled(fixture.records.slice(0,65)):null);assert.deepEqual(fixture.records,before,'resolution never edits qualified objects');return {result,calls};}

for(const length of [13,64,65])for(const bundle of [false,true])test(`${length} records ${bundle?'bundled':'ordinary'}: evaluate the already-read terminal without increasing I/O`,async()=>{
 const fixture=chain(length),{result,calls}=await resolve(fixture,{bundle});
 assert.equal(result.status,'found');assert.equal(result.reason_code,'frame_found');assert.deepEqual(result.frame,{frame_object_id:id(length),frame_index:2,source_object_id:id(900),dataset_index:1,plane_selection:{axis_indices:[0,2]}});
 assert.equal(result.records_checked,length);assert.equal(result.ancestor_reads,length-1);assert.equal(result.callback_reads,bundle?0:length-1);assert.equal(result.bundled,bundle);assert.equal(calls.length,bundle?0:length-1);assert.ok(result.ancestor_reads<=PANEL_FRAME_ANCESTOR_READ_BUDGET);
});
for(const length of [66,80])for(const bundle of [false,true])test(`${length} records ${bundle?'bundled':'ordinary'}: a longer legal chain explicitly exhausts the original budget`,async()=>{
 const fixture=chain(length),{result,calls}=await resolve(fixture,{bundle});assert.equal(result.status,'ancestry_budget_exhausted');assert.equal(result.frame,null);assert.equal(result.records_checked,65);assert.equal(result.ancestor_reads,64);assert.equal(result.callback_reads,bundle?0:64);assert.equal(result.terminal.object_id,id(65));assert.equal(calls.includes(id(66)),false);
});
test('terminal frame metadata is not manufactured from display or source hints',async()=>{
 for(const frame_index of [undefined,null]){const root=record(1,'frame',{frame_index,source_object_id:id(2),panels:[{frame_index:0}],frame_identity:{frame_index:0}}),r=await resolvePanelFrame(root,async()=>assert.fail('terminal has no ancestor read'));assert.equal(r.status,'unsupported');assert.equal(r.reason_code,'frame_index_unavailable');assert.equal(r.frame,null);assert.equal(r.ancestor_reads,0);}
 for(const frame_index of [-1,1.25,'0',false,NaN,Infinity]){const r=await resolvePanelFrame(record(1,'frame',{frame_index}),async()=>assert.fail());assert.equal(r.status,'corrupt');assert.equal(r.reason_code,'invalid_frame_index');assert.equal(r.frame,null);}
 const r=await resolvePanelFrame(record(1,'frame',{frame_index:0}),async()=>assert.fail());assert.equal(r.status,'found');assert.equal(r.frame.source_object_id,undefined,'unknown source metadata stays unknown');
});
test('ordinary and bundled cycles stop on the already-qualified repeated record',async()=>{
 const a=record(1,'annotate',{parent_object_id:id(2)}),b=record(2,'view',{parent_object_id:id(1)}),fixture={root:a,records:[a,b,a],map:new Map([[id(1),a],[id(2),b]])};
 for(const bundle of [false,true]){const {result,calls}=await resolve(fixture,{bundle});assert.equal(result.status,'cycle');assert.equal(result.records_checked,3);assert.equal(result.ancestor_reads,2);assert.equal(result.frame,null);assert.deepEqual(calls,bundle?[]:[id(2),id(1)]);}
});
test('missing and unsupported terminal states remain distinct from a budget failure',async()=>{
 const cases=[[record(1,'view'),'missing'],[record(1,'future_kind'),'unsupported'],[record(1,'compare',{parent_object_id:id(2)}),'unsupported'],[record(1,'tiff_source',{parent_object_id:id(2)}),'source_without_frame'],[record(1,'dm_source'),'source_without_frame']];
 for(const [root,status]of cases)for(const ancestry of [null,bundled([root])]){const r=await resolvePanelFrame(root,async()=>assert.fail('terminal may not guess a source'),ancestry);assert.equal(r.status,status);assert.equal(r.frame,null);assert.equal(r.ancestor_reads,0);}
});
test('unknown qualified wrapper kinds keep the existing nullish traversal contract',async()=>{
 const root=record(1,'future_wrapper',{parent_object_id:id(2)}),frame=record(2,'frame',{frame_index:0});const r=await resolvePanelFrame(root,async()=>frame);assert.equal(r.status,'found');assert.equal(r.frame.frame_object_id,id(2));
});
test('malformed parent is not bypassed with a valid base/source/render base',async()=>{
 for(const parent_object_id of ['',false,0,'../outside']){const root=record(1,'view',{parent_object_id,base_object_id:id(2),source_object_id:id(3),render_base_object_id:id(4)}),r=await resolvePanelFrame(root,async()=>assert.fail('invalid edge may not be read'));assert.equal(r.status,'corrupt');assert.equal(r.reason_code,'invalid_ancestor_link');assert.equal(r.ancestor_reads,0);}
 const root=record(1,'view',{parent_object_id:null,base_object_id:id(2),source_object_id:id(3)}),seen=[];const r=await resolvePanelFrame(root,async key=>{seen.push(key);return record(2,'frame',{frame_index:0});});assert.equal(r.status,'found');assert.deepEqual(seen,[id(2)]);
});
for(const [code,status]of [['OBJECT_NOT_FOUND','missing'],['CORRUPT_OBJECT','corrupt'],['UNSPECIFIED','read_failed']])test(`provider ${code} still throws its exact original error and exposes a diagnostic`,async()=>{
 const original=Object.assign(new Error('controlled payload/path/PNG qualification refusal'),{code,status:code==='OBJECT_NOT_FOUND'?404:409,cause:new Error('original cause')});const root=record(1,'view',{parent_object_id:id(2)});let caught;try{await resolvePanelFrame(root,async()=>{throw original;});}catch(error){caught=error;}
 assert.equal(caught,original);assert.equal(caught.message,'controlled payload/path/PNG qualification refusal');assert.equal(caught.frame_resolution.status,status);assert.equal(caught.frame_resolution.frame,null);assert.equal(caught.frame_resolution.ancestor_reads,1);assert.equal(caught.frame_resolution.records_checked,1);assert.equal(caught.cause,original.cause);
});
test('frozen errors and primitive unknown failures are not replaced by diagnostic errors',async()=>{
 const root=record(1,'view',{parent_object_id:id(2)});for(const original of [Object.freeze(new Error('immutable refusal')),'opaque original error'])await assert.rejects(resolvePanelFrame(root,async()=>{throw original;}),error=>error===original);
});
test('mismatching next object, backend or completion state cannot produce a frame',async()=>{
 const root=record(1,'view',{parent_object_id:id(2)});for(const value of [record(3,'frame',{frame_index:0}),record(2,'frame',{frame_index:0,backend:'different-provider'}),record(2,'frame',{frame_index:0,state:'unknown'})]){const r=await resolvePanelFrame(root,async()=>value);assert.equal(r.status,'corrupt');assert.equal(r.frame,null);}
});
test('an incomplete/misbound bundle cannot fall back to a second read or invent an identity',async()=>{
 const fixture=chain(3);for(const ancestry of [[],[record(9)],fixture.records.slice(0,1),[fixture.root,record(9,'frame',{frame_index:0})]]){const r=await resolvePanelFrame(fixture.root,async()=>assert.fail('bad projection must not trigger fallback reads'),ancestry);assert.equal(r.status,'corrupt');assert.equal(r.frame,null);assert.equal(r.callback_reads,0);}
});
test('existing bundle schema still refuses root metadata drift, extra fields and oversize',()=>{
 const fixture=chain(3),packet={schema_version:1,root_object_id:fixture.root.object_id,records:fixture.records.map(frameAncestryProjection)};
 for(const value of [{...packet,records:[{...packet.records[0],parent_object_id:id(99)},...packet.records.slice(1)]},{...packet,records:packet.records.map((r,i)=>i===1?{...r,annotations:[]}:r)},{...packet,records:Array.from({length:66},()=>packet.records[0])}])assert.throws(()=>readImageFrameAncestry(value,fixture.root),/Invalid qualified/);
});
