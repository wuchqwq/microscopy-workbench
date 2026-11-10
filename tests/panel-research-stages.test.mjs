// Local file/orchestration tests with synthetic receipts only. No worker, GUI,
// network or numerical method is executed; provider evidence qualification stays external.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PanelResearchStages} from '../lib/panel_research_stages.mjs';
const id=value=>createHash('sha256').update(value).digest('hex').slice(0,32),FRAME=id('frame');
const input=()=>({object_id:FRAME,frame_object_id:FRAME,target_rect:[20,20,25,25],reference_rects:[[4,4,9,9],[40,40,45,45]],expected_position_xy:[22.25,22.5],source_text:'Public fixture; no localization, physical or AI claim'});
const names=['statistics','discovery','review'];
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'panel-research-stages-'));t.after(()=>{assert.equal(path.dirname(root),path.resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const ledger=new PanelResearchStages(root);return {root,ledger,file:study=>path.join(root,'panel-research-studies',study+'.json')};}
function callbacks(extra={}){
 const dispatches=[],queries=[],resolves=[],receipts=new Map();
 const cb={
  async resolve(name,outputs,frozen){resolves.push({name,outputs:structuredClone(outputs),frozen:structuredClone(frozen)});return {tool:{statistics:'image_statistics',discovery:'image_discovery',review:'image_discovery_review'}[name]??'image_profile',arguments:{object_id:FRAME,...(name==='review'?{evidence_ids:[outputs.statistics.object_id],object_id:outputs.discovery.object_id}:{})}};},
  async dispatch(tool,args,name){dispatches.push({tool,args:structuredClone(args),name});const receipt={ok:true,state:'completed',request_id:args.request_id,object_id:id(name),kind:name};receipts.set(args.request_id,receipt);return receipt;},
  async query(requestId,name){queries.push({requestId,name});if(!receipts.has(requestId))throw Error('REQUEST_NOT_FOUND; absence does not prove non-submission');return receipts.get(requestId);},
  ...extra,
 };
 return {cb,dispatches,queries,resolves,receipts};
}
test('frozen input, order and deterministic original IDs persist and create is idempotent',t=>{
 const {root,ledger}=fixture(t),a=input(),record=ledger.create({study_id:'site-study',input:a,stage_names:names});assert.equal(record.stages.length,3);assert.equal(new Set(record.stages.map(s=>s.request_id)).size,3);assert.ok(record.stages.every(s=>s.state==='not_submitted'&&s.object_id===null&&s.arguments===null));
 a.reference_rects.pop();record.input.expected_position_xy[0]=27;const reopened=new PanelResearchStages(root);assert.deepEqual(reopened.read('site-study').input,input());const bytes=readFileSync(path.join(root,'panel-research-studies/site-study.json'));assert.deepEqual(reopened.create({study_id:'site-study',input:input(),stage_names:names}),ledger.read('site-study'));assert.deepEqual(readFileSync(path.join(root,'panel-research-studies/site-study.json')),bytes);assert.equal(ledger.list().length,1);
 assert.throws(()=>ledger.create({study_id:'site-study',input:{...input(),expected_position_xy:[23,23]},stage_names:names}),/different frozen input/);assert.throws(()=>ledger.create({study_id:'site-study',input:input(),stage_names:[...names].reverse()}),/different frozen input/);
});
test('caller supplied provider proposal IDs are frozen exactly; changes, duplicates and foreign keys refuse',t=>{
 const {ledger}=fixture(t),request_ids={profile:'original-saved-profile',linked_review:'original-saved-review'},options={study_id:'followup',input:input(),stage_names:['profile','linked_review'],request_ids};const record=ledger.create(options);assert.deepEqual(record.stages.map(s=>s.request_id),Object.values(request_ids));assert.deepEqual(ledger.create(options),record);assert.throws(()=>ledger.create({...options,request_ids:{...request_ids,profile:'replacement'}}),/different frozen/);
 assert.throws(()=>ledger.create({...options,study_id:'duplicate',request_ids:{profile:'same',linked_review:'same'}}),/distinct original/);assert.throws(()=>ledger.create({...options,study_id:'foreign',request_ids:{alien:'extra'}}),/known stages/);assert.throws(()=>ledger.create({...options,study_id:'unsafe',request_ids:{profile:'../outside'}}),/known stages/);
});
test('before dispatch submitted intent with exact args is already readable on disk; full run retains dependencies once',async t=>{
 const {ledger}=fixture(t);ledger.create({study_id:'full',input:input(),stage_names:names});const f=callbacks();const dispatch=f.cb.dispatch;f.cb.dispatch=async(tool,args,name)=>{const stage=ledger.read('full').stages.find(s=>s.name===name);assert.equal(stage.state,'submitted');assert.equal(stage.request_id,args.request_id);assert.deepEqual(stage.arguments,args);assert.equal(stage.tool,tool);return dispatch(tool,args,name);};
 const result=await ledger.resume('full',f.cb);assert.equal(result.phase,'complete');assert.deepEqual(f.dispatches.map(v=>v.name),names);assert.deepEqual(f.resolves[2].outputs,{statistics:{object_id:id('statistics'),request_id:result.record.stages[0].request_id},discovery:{object_id:id('discovery'),request_id:result.record.stages[1].request_id}});assert.deepEqual(result.record.input.reference_rects,input().reference_rects);assert.equal(JSON.stringify(result.record).includes('undefined'),false);
 await ledger.resume('full',f.cb);assert.equal(f.dispatches.length,3);assert.equal(f.queries.length,0);
});
for(const stopAfter of ['statistics','discovery'])test('interrupt after completed '+stopAfter+' resumes only the remaining original stages',async t=>{
 const {root,ledger}=fixture(t);ledger.create({study_id:'interrupt',input:input(),stage_names:names});const f=callbacks(),controller=new AbortController(),dispatch=f.cb.dispatch;f.cb.dispatch=async(tool,args,name)=>{const r=await dispatch(tool,args,name);if(name===stopAfter)controller.abort();return r;};
 const first=await ledger.resume('interrupt',f.cb,{signal:controller.signal});assert.equal(first.phase,'paused');const count=names.indexOf(stopAfter)+1;assert.deepEqual(first.record.stages.map(s=>s.state),names.map((_,i)=>i<count?'completed':'not_submitted'));const resumed=await new PanelResearchStages(root).resume('interrupt',f.cb);assert.equal(resumed.phase,'complete');assert.deepEqual(f.dispatches.map(v=>v.name),names);assert.equal(f.queries.length,0);
});
test('lost review reply becomes unknown, queries only original ID, and requires another explicit resume',async t=>{
 const {root,ledger}=fixture(t);ledger.create({study_id:'lost-review',input:input(),stage_names:names});const f=callbacks(),dispatch=f.cb.dispatch;f.cb.dispatch=async(tool,args,name)=>{const receipt=await dispatch(tool,args,name);if(name==='review')throw Error('Controlled reply loss AFTER provider completion');return receipt;};
 let result=await ledger.resume('lost-review',f.cb);assert.equal(result.phase,'stopped_unknown');assert.deepEqual(result.record.stages.map(s=>s.state),['completed','completed','unknown']);const original=result.record.stages[2].request_id;result=await new PanelResearchStages(root).resume('lost-review',f.cb);assert.equal(result.phase,'query_completed_resume_required');assert.deepEqual(f.queries,[{requestId:original,name:'review'}]);assert.equal(f.dispatches.length,3);assert.equal(result.record.stages[2].object_id,id('review'));result=await ledger.resume('lost-review',f.cb);assert.equal(result.phase,'complete');assert.equal(f.dispatches.length,3);
});
test('lost first-stage reply resolves by query and stops BEFORE any later dispatch',async t=>{
 const {ledger}=fixture(t);ledger.create({study_id:'lost-first',input:input(),stage_names:names});const f=callbacks(),dispatch=f.cb.dispatch;f.cb.dispatch=async(tool,args,name)=>{const r=await dispatch(tool,args,name);if(name==='statistics')throw Error('Lost response');return r;};await ledger.resume('lost-first',f.cb);const queried=await ledger.resume('lost-first',f.cb);assert.equal(queried.phase,'query_completed_resume_required');assert.deepEqual(f.dispatches.map(v=>v.name),['statistics']);assert.equal(queried.record.stages[1].state,'not_submitted');const resumed=await ledger.resume('lost-first',f.cb);assert.equal(resumed.phase,'complete');assert.deepEqual(f.dispatches.map(v=>v.name),names);
});
test('intent/provider gap remains unknown even when the provider has NO original request',async t=>{
 const {root,ledger}=fixture(t);ledger.create({study_id:'gap',input:input(),stage_names:names});const f=callbacks();let writes=0;f.cb.dispatch=async()=>{writes++;throw Error('Interrupted before provider admission; local intent exists');};let r=await ledger.resume('gap',f.cb);assert.equal(r.phase,'stopped_unknown');for(let i=0;i<2;i++){r=await new PanelResearchStages(root).resume('gap',f.cb);assert.equal(r.phase,'stopped_unknown');}assert.equal(writes,1);assert.equal(f.queries.length,2);assert.equal(r.record.stages[0].request_id,f.queries[0].requestId);assert.equal(r.record.stages[1].state,'not_submitted');
});
test('an on-disk submitted state after process interruption queries without redispatch',async t=>{
 const {ledger,file}=fixture(t);const r=ledger.create({study_id:'submitted',input:input(),stage_names:names}),s=r.stages[0];s.state='submitted';s.tool='image_statistics';s.arguments={object_id:FRAME,request_id:s.request_id};s.attempts=1;writeFileSync(file('submitted'),JSON.stringify(r));const f=callbacks();f.receipts.set(s.request_id,{state:'completed',request_id:s.request_id,object_id:id('statistics')});const next=await ledger.resume('submitted',f.cb);assert.equal(next.phase,'query_completed_resume_required');assert.equal(f.dispatches.length,0);assert.equal(f.queries[0].requestId,s.request_id);
});
test('known failed stages are terminal and never automatically retry',async t=>{
 const {ledger}=fixture(t);ledger.create({study_id:'failed',input:input(),stage_names:names});let calls=0;const f=callbacks({dispatch:async(_tool,args)=>{calls++;return {state:'failed',ok:false,request_id:args.request_id,error:{message:'Known provider refusal'}};}});const first=await ledger.resume('failed',f.cb);assert.equal(first.phase,'stopped_failed');assert.equal(first.record.stages[0].state,'failed');const second=await ledger.resume('failed',f.cb);assert.equal(second.phase,'stopped_failed');assert.equal(calls,1);assert.equal(f.queries.length,0);
});
test('only accurate exact admission receipt permits a later explicit non-submitted retry',async t=>{
 const {ledger}=fixture(t);ledger.create({study_id:'admission',input:input(),stage_names:['statistics']});let calls=0;const f=callbacks({dispatch:async(tool,args)=>{calls++;if(calls===1)throw {schema_version:1,kind:'image_operation_admission_failure',provider:'external-image-workspace',tool,code:'WORKSPACE_WRITE_CONFLICT',submission_state:'not_submitted',request_id:args.request_id,original_request_id:null,automatic_retry:false};return {state:'completed',request_id:args.request_id,object_id:id('statistics')};}});let result=await ledger.resume('admission',f.cb);assert.equal(result.phase,'admission_not_submitted');assert.equal(result.record.stages[0].state,'not_submitted');const original=result.record.stages[0].request_id;result=await ledger.resume('admission',f.cb);assert.equal(result.phase,'complete');assert.equal(result.record.stages[0].attempts,2);assert.equal(result.record.stages[0].request_id,original);assert.equal(f.resolves.length,1,'the original resolved args stay frozen across exact non-admission');
});
test('wrong ID, plain not_submitted and words claiming non-submission cannot un-fence an unknown',async t=>{
 for(const [name,dispatch]of [
  ['words',async()=>{throw Error('not_submitted; no file found');}],
  ['bare',async(_tool,args)=>({state:'not_submitted',request_id:args.request_id})],
  ['foreign',async(tool)=>({schema_version:1,kind:'image_operation_admission_failure',provider:'external-image-workspace',tool,code:'IMAGE_WORKER_NOT_SUBMITTED',submission_state:'not_submitted',request_id:'some-other-request',original_request_id:null,automatic_retry:false})],
  ['wrong-result',async()=>({state:'completed',request_id:'foreign',object_id:id('statistics')})],
 ]){const {ledger}=fixture(t);ledger.create({study_id:name,input:input(),stage_names:['statistics']});const f=callbacks({dispatch});const r=await ledger.resume(name,f.cb);assert.equal(r.phase,'stopped_unknown',name);assert.equal(r.record.stages[0].state,'unknown');}
});
test('resolver failure and abort before admission leave genuine unsubmitted work safe',async t=>{
 const {ledger}=fixture(t);ledger.create({study_id:'bad-input',input:input(),stage_names:names});const f=callbacks({resolve:async()=>{throw Error('Explicit required reference is missing');}});const r=await ledger.resume('bad-input',f.cb);assert.equal(r.phase,'stopped_not_submitted');assert.equal(r.record.stages[0].state,'not_submitted');assert.equal(r.record.stages[0].arguments,null);assert.equal(f.dispatches.length,0);
 const controller=new AbortController(),a=callbacks({resolve:async()=>{controller.abort();return {tool:'image_statistics',arguments:{object_id:FRAME}};}});const paused=await ledger.resume('bad-input',a.cb,{signal:controller.signal});assert.equal(paused.phase,'paused');assert.equal(paused.record.stages[0].tool,null);assert.equal(ledger.read('bad-input').stages[0].tool,null);assert.equal(a.dispatches.length,0);
});
test('simultaneous resume for same study is rejected before a second resolver or write',async t=>{
 const {root,ledger}=fixture(t);ledger.create({study_id:'exclusive',input:input(),stage_names:['statistics']});let release;const wait=new Promise(resolve=>{release=resolve;}),f=callbacks(),dispatch=f.cb.dispatch;f.cb.dispatch=async(...args)=>{await wait;return dispatch(...args);};const running=ledger.resume('exclusive',f.cb);await Promise.resolve();await assert.rejects(()=>new PanelResearchStages(root).resume('exclusive',callbacks().cb),/already active/);release();assert.equal((await running).phase,'complete');assert.equal(f.dispatches.length,1);
});
test('reject linked/oversized/tampered ledgers and unsafe JSON without touching external files',t=>{
 const {root,ledger,file}=fixture(t);assert.throws(()=>ledger.create({study_id:'../escape',input:input(),stage_names:names}));assert.throws(()=>ledger.create({study_id:'undefined',input:{...input(),lost:undefined},stage_names:names}),/undefined/);assert.throws(()=>ledger.create({study_id:'nonfinite',input:{...input(),bad:NaN},stage_names:names}),/non-finite/);assert.throws(()=>ledger.create({study_id:'prototype',input:input(),stage_names:['__proto__']}));const r=ledger.create({study_id:'tampered',input:input(),stage_names:names});r.input.reference_rects.pop();writeFileSync(file('tampered'),JSON.stringify(r));assert.throws(()=>ledger.read('tampered'),/frozen study/);
 const external=path.join(root,'external.json');writeFileSync(external,'{"untouched":true}');symlinkSync(external,file('linked'));assert.throws(()=>ledger.read('linked'),/linked/);assert.equal(readFileSync(external,'utf8'),'{"untouched":true}');writeFileSync(file('oversized'),' '.repeat(2*1024*1024+1));assert.throws(()=>ledger.read('oversized'),/oversized/);
});
test('a linked study directory is not accepted as an alternate storage route',t=>{
 const {root}=fixture(t),other=path.join(root,'other');mkdirSync(other);const workspace=path.join(root,'second');mkdirSync(workspace);symlinkSync(other,path.join(workspace,'panel-research-studies'),'junction');assert.throws(()=>new PanelResearchStages(workspace),/linked/);assert.deepEqual(readdirSync(other),[]);
});
