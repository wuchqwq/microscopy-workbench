import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectVisualReadiness} from '../ui/image-panel/research-input-readiness.mjs';
const view='a'.repeat(32),frame='b'.repeat(32),marker='PRIVATE_FROM_ACCESSOR_OR_ITERATOR';
const fixture=()=>({object:{object_id:view,kind:'view',dtype:'uint16',shape_yx:[2,2],annotations:[],files_sha256:{'preview.png':'c'.repeat(64)},panels:[{domain:'spatial_pixels',source_object_id:frame,source_rect_xyxy:[5,6,7,8],image_rect_xyxy:[0,0,20,20]}]},frame_identity:{frame_object_id:frame},state_revision:1,edit_state:{draft_revision:2,dirty:false,gesture_active:false,annotation_edit:null,selection:null},draft_persistence:{pending:false,error:null},selection:null,pending_result:null,last_operation:null,window_collection:{revision:3},workspace_analysis:{status:'clean',working_revision:4,unresolved_request_id:null,unresolved_save_id:null,recovery_available:false},research_question:{version:1,text:'Metadata only',context_object_id:view,frame_object_id:frame,recorded_utc:'2026-11-08T00:00:00.000Z'}});
const local=()=>({view_id:view,state_revision:1,draft_revision:2,settled:true});
function refused(snapshot,ui){let result;assert.doesNotThrow(()=>{result=inspectVisualReadiness(snapshot,ui);});assert.equal(result.status,'blocked');assert.equal(result.approved,false);assert.equal(result.model_can_view,false);assert.doesNotMatch(JSON.stringify(result),new RegExp(marker));return result;}
test('changing object_id accessor is never executed or echoed',()=>{
 const s=fixture();let reads=0;Object.defineProperty(s.object,'object_id',{enumerable:true,get(){return ++reads===1?view:marker;}});
 refused(s,local());assert.equal(reads,0);
});
for(const field of ['source_rect_xyxy','image_rect_xyxy','shape_yx'])test('custom '+field+' iterator cannot run or add output data',()=>{
 const s=fixture(),array=field==='shape_yx'?s.object.shape_yx:s.object.panels[0][field];let iterations=0;
 array[Symbol.iterator]=function*(){iterations++;yield marker;};refused(s,local());assert.equal(iterations,0);
});
test('throwing required getter cannot escape inspection',()=>{
 const s=fixture();let reads=0;Object.defineProperty(s,'object',{get(){reads++;throw Error(marker);}});refused(s,local());assert.equal(reads,0);
});
for(const slot of ['snapshot','local','display'])test('raw '+slot+' Proxy and revoked Proxy cannot run traps',()=>{
 let traps=0;const handler={get(){traps++;throw Error(marker);},ownKeys(){traps++;throw Error(marker);},getOwnPropertyDescriptor(){traps++;throw Error(marker);},getPrototypeOf(){traps++;throw Error(marker);}};
 const args=()=>[JSON.stringify(fixture()),JSON.stringify(local()),JSON.stringify({view_id:view,png_sha256:'c'.repeat(64)})],index={snapshot:0,local:1,display:2}[slot];
 for(const value of [new Proxy({},handler),(()=>{const p=Proxy.revocable({},handler);p.revoke();return p.proxy;})()]){const input=args();input[index]=value;const r=inspectVisualReadiness(...input);assert.equal(r.status,'blocked');assert.ok(r.blockers.includes('metadata_input_invalid'));assert.equal(traps,0);}
});
test('boxed text and coercible/toJSON wrappers are rejected without any callback',()=>{
 let calls=0;const callback=()=>{calls++;throw Error(marker);};
 for(const raw of [new String(JSON.stringify(fixture())),{toJSON:callback,toString:callback,valueOf:callback},()=>marker])refused(raw,JSON.stringify(local()));
 assert.equal(calls,0);
});
test('bounded primitive JSON is copied and validated without admitting extra numeric output',()=>{
 const s=fixture(),u=local(),reference={view_id:view,png_sha256:'c'.repeat(64)};
 const run=(snapshotText=JSON.stringify(s),localText=JSON.stringify(u),displayText=JSON.stringify(reference))=>inspectVisualReadiness(snapshotText,localText,displayText);
 const valid=run();assert.equal(valid.status,'metadata_ready');assert.deepEqual(valid.source_rect_xyxy,[5,6,7,8]);
 for(const bad of ['',marker,'{','x'.repeat(65537),JSON.stringify({object:{object_id:marker}})]){const r=run(bad);assert.equal(r.status,'blocked');assert.doesNotMatch(JSON.stringify(r),new RegExp(marker));}
 for(const field of ['source_rect_xyxy','image_rect_xyxy','shape_yx']){
  const modified=fixture(),target=field==='shape_yx'?modified.object:modified.object.panels[0];target[field]=[5,6,7,8,marker];
  const r=run(JSON.stringify(modified));assert.equal(r.status,'blocked');assert.equal(r[field],null);assert.doesNotMatch(JSON.stringify(r),new RegExp(marker));
 }
});
for(const domain of ['frequency','reciprocal','unspecified_image',null,{}])test('contradictory or unknown array_domain refuses source pixel readiness: '+JSON.stringify(domain),()=>{
 const s=fixture();s.object.array_domain=domain;
 const r=inspectVisualReadiness(JSON.stringify(s),JSON.stringify(local()),JSON.stringify({view_id:view,png_sha256:'c'.repeat(64)}));
 assert.equal(r.status,'blocked');assert.ok(r.blockers.includes('array_domain_conflict'));assert.equal(r.source_rect_xyxy,null);
});
test('public Panel metadata needs a separate exact saved display reference; clean PNG is never substituted',()=>{
 const s=fixture();delete s.object.files_sha256;s.clean_png_sha256='e'.repeat(64);s.render_base_id='f'.repeat(32);
 const run=reference=>inspectVisualReadiness(JSON.stringify(s),JSON.stringify(local()),reference===undefined?undefined:JSON.stringify(reference));
 const missing=run();assert.equal(missing.status,'blocked');assert.ok(missing.blockers.includes('display_reference_missing'));assert.equal(missing.declared_png_sha256,null);
 const wrong=run({view_id:'f'.repeat(32),png_sha256:s.clean_png_sha256});assert.equal(wrong.status,'blocked');assert.ok(wrong.blockers.includes('display_reference_differs'));assert.equal(wrong.declared_png_sha256,null);
 const supplied=run({view_id:view,png_sha256:'c'.repeat(64)});assert.equal(supplied.status,'metadata_ready');assert.equal(supplied.declared_png_sha256,'c'.repeat(64));assert.equal(supplied.image_bytes_checked,false);
 const extra=run({view_id:view,png_sha256:'c'.repeat(64),path:marker});assert.equal(extra.status,'blocked');assert.equal(extra.declared_png_sha256,null);assert.doesNotMatch(JSON.stringify(extra),new RegExp(marker));
});
test('explicit spatial array metadata and missing legacy declaration both remain metadata-only',()=>{
 for(const domain of [undefined,'spatial']){const s=fixture();if(domain!==undefined)s.object.array_domain=domain;
  const r=inspectVisualReadiness(JSON.stringify(s),JSON.stringify(local()),JSON.stringify({view_id:view,png_sha256:'c'.repeat(64)}));
  assert.equal(r.status,'metadata_ready');assert.equal(r.provider_records_checked,false);assert.equal(r.approved,false);
 }
});
