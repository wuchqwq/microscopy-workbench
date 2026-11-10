import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createImagePanel} from '../tools/image_panel.mjs';
import {readImageOriginalFailure,imageOriginalFailureFromError} from '../lib/runtime/image_admission_failure.mjs';
const id=n=>n.toString(16).padStart(32,'0'),A=id(1),B=id(2),F=id(3),T=id(4),png=Buffer.from('89504e470d0a1a0a','hex'),digest=createHash('sha256').update(png).digest('hex');
const view=(object_id,request_id='source')=>({object_id,request_id,state:'completed',kind:'view',parent_object_id:F,array_domain:'spatial',shape_yx:[32,32],panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,32,32],image_rect_xyxy:[0,0,32,32]}],annotations:[],display:{gamma:1},files_sha256:{'preview.png':digest}});
async function fixture(run,mode='failed'){
 const workspace=mkdtempSync(path.join(tmpdir(),'calibration-terminal-'));let original,failed=true,calibrations=0,queries=0,panel;const originals=new Map();
 for(const object_id of [A,B]){const p=path.join(workspace,'objects',object_id);mkdirSync(p,{recursive:true});writeFileSync(path.join(p,'preview.png'),png);}
 const client={async rpc(){return {result:{tools:['image_info','image_calibrate','image_preview','image_result'].map(name=>({name,inputSchema:{}}))}};},async close(){},async tool(name,args){
  if(name==='image_info')return {data:args.object_id===F?{object_id:F,kind:'frame',source_object_id:T,frame_index:0}:args.object_id===T?{object_id:T,kind:'tiff_source'}:view(args.object_id),png:png.toString('base64')};
  if(name==='image_calibrate'){calibrations++;if(failed){original=structuredClone(args);originals.set(args.request_id,original);if(mode==='admission-first'&&calibrations===1)throw Object.assign(new Error('known admission rejection'),{code:'WORKSPACE_WRITE_CONFLICT',submission_state:'not_submitted'});throw new Error('original calibration failed; query original');}return {data:{...view(B,args.request_id),kind:'calibration'}};}
  if(name==='image_preview')return {data:view(B,args.request_id),png:png.toString('base64')};
  if(name==='image_result'){queries++;if(mode==='unknown')throw new Error('transport outcome unknown');const receipt={schema_version:1,kind:'image_original_failure',provider:'external-image-workspace',request_id:args.request_id,state:'failed',automatic_retry:false,original_failure:{schema_version:1,request_id:args.request_id,parameters:{action:'calibrate',workspace,...originals.get(args.request_id)},parameters_sha256:'a'.repeat(64),journal_sha256:'b'.repeat(64),error_code:'INVALID_ARGUMENT'}};if(mode==='wrong-parameters')receipt.original_failure.parameters.xy_scale={x:99,y:99,unit:'nm'};if(mode==='wrong-request')receipt.request_id='foreign';throw Object.assign(new Error('failed original'),{original_failure_receipt:receipt});}
  assert.fail(name);
 }};
 try{panel=await createImagePanel({workspace,python:process.execPath,object_id:A,client});const origin=panel.url.split('/#')[0];
 const post=async(action,params={})=>{const s=panel.state();const r=await fetch(origin+'/api/action',{method:'POST',headers:{'x-panel-token':panel.token,origin,'content-type':'application/json'},body:JSON.stringify({action,params,expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision})});return {status:r.status,data:await r.json()};};
 await run({panel,post,workspace,counts:()=>({calibrations,queries}),allowCorrection(){failed=false;}});
 }finally{await panel?.close();rmSync(workspace,{recursive:true,force:true});}
}
const args={coordinate_domain:'real_space',scope:'image',xy_scale:{x:.02,y:0,unit:'nm'},source_text:'simulation-only invalid calibration test'};
test('failed original calibration is read back without replay, then explicit correction can continue',()=>fixture(async h=>{
 assert.equal((await h.post('calibrate',args)).status,400);const original=h.panel.state().last_operation.request_id;assert.equal(h.panel.state().last_operation.state,'submitted');assert.equal((await h.post('calibrate',args)).status,409);
 const r=await h.post('recover',{request_id:original});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.last_operation.state,'failed');assert.equal(r.data.object.object_id,A);assert.equal(r.data.execution_recovery.automatic_retry,false);assert.equal(r.data.workspace_analysis.unresolved_request_id,null);assert.deepEqual(h.counts(),{calibrations:1,queries:1});
 h.allowCorrection();const corrected=await h.post('calibrate',{...args,xy_scale:{x:.02,y:.03,unit:'nm'}});assert.equal(corrected.status,200,JSON.stringify(corrected.data));assert.equal(corrected.data.object.object_id,B);assert.deepEqual(h.counts(),{calibrations:2,queries:1});
}));
for(const mode of ['unknown','wrong-parameters','wrong-request'])test('failed query keeps the original fence when '+mode,()=>fixture(async h=>{await h.post('calibrate',args);const original=h.panel.state().last_operation.request_id;assert.notEqual((await h.post('recover',{request_id:original})).status,200);assert.equal(h.panel.state().last_operation.state,'submitted');assert.equal((await h.post('calibrate',args)).status,409);assert.equal(h.counts().calibrations,1);},mode));
test('only structured original-result failure proof can cross stdio, never text or an unknown worker outcome',()=>{
 const request_id='original-calibration',receipt={schema_version:1,request_id,parameters:{action:'calibrate',request_id},parameters_sha256:'a'.repeat(64),journal_sha256:'b'.repeat(64),error_code:'INVALID_ARGUMENT'};
 const error={diagnostic:{phase:'response_validation',provider:'external-image-workspace',request_id,provider_reported_state:'failed',submission_state:'provider_reported_failure',original_failure:receipt}};
 assert.ok(imageOriginalFailureFromError(error,'image_result',request_id));for(const tool of ['image_calibrate','image_info'])assert.equal(imageOriginalFailureFromError(error,tool,request_id),null);
 assert.equal(imageOriginalFailureFromError(new Error(JSON.stringify(error)),'image_result',request_id),null);assert.equal(imageOriginalFailureFromError({...error,diagnostic:{...error.diagnostic,submission_state:'outcome_unknown'}},'image_result',request_id),null);assert.equal(readImageOriginalFailure({...imageOriginalFailureFromError(error,'image_result',request_id),request_id:'different'},request_id),null);
});

for(const mode of ['failed','admission-first'])test('recovering an older '+mode+' request cannot clear a newer unknown request fence',()=>fixture(async h=>{
 await h.post('calibrate',args);const old=h.panel.state().last_operation.request_id;
 const recovered=await h.post('recover',{request_id:old});assert.equal(recovered.status,200,JSON.stringify(recovered.data));
 assert.ok(['failed','not_submitted'].includes(h.panel.state().last_operation.state));
 await h.post('calibrate',{...args,source_text:'newer request with an unknown transport outcome'});const newer=h.panel.state().last_operation.request_id;assert.notEqual(newer,old);assert.equal(h.panel.state().last_operation.state,'submitted');
 const before=structuredClone(h.panel.state().last_operation),counts=h.counts();const stale=await h.post('recover',{request_id:old});assert.equal(stale.status,409,JSON.stringify(stale.data));assert.deepEqual(h.panel.state().last_operation,before);assert.equal(h.panel.state().workspace_analysis.unresolved_request_id,newer);assert.deepEqual(h.counts(),counts,'wrong original is rejected before any provider query');
 assert.equal((await h.post('calibrate',args)).status,409);assert.equal(h.counts().calibrations,2);
 const exact=await h.post('recover',{request_id:newer});assert.equal(exact.status,200,JSON.stringify(exact.data));assert.equal(h.panel.state().last_operation.request_id,newer);assert.equal(h.panel.state().last_operation.state,'failed');assert.equal(h.panel.state().workspace_analysis.unresolved_request_id,null);assert.equal(h.counts().calibrations,2);
},mode));
