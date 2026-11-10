// Journal/hash fixtures test a read-only menu, never scientific qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {listPanelResearchCatalog,PANEL_RESEARCH_CATALOG_KINDS} from '../lib/panel_research_catalog.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
function fixture(t){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-research-catalog-'));t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 for(const dir of ['objects','requests'])mkdirSync(path.join(workspace,dir));
 const values=new Map();let sequence=0;
 function put(kind,extra={}){const object_id=(++sequence).toString(16).padStart(32,'0'),request_id='catalog-'+sequence,value={backend:'external-image-workspace',object_id,request_id,kind,created_utc:'2026-11-10T08:00:00Z',...extra},directory=path.join(workspace,'objects',object_id);mkdirSync(directory);publish(value);return value;}
 function publish(value){const bytes=JSON.stringify(value),request={state:'completed',request_id:value.request_id,object_manifest_sha256:digest(bytes),parameters:{workspace,request_id:value.request_id},response:{ok:true,state:'completed',...value}};writeFileSync(path.join(workspace,'objects',value.object_id,'object.json'),bytes);writeFileSync(path.join(workspace,'requests',value.request_id+'.json'),JSON.stringify(request));values.set(value.object_id,value);}
 const reads=[];const read=id=>{reads.push(id);return {ok:true,state:'completed',...structuredClone(values.get(id))};};
 const inventory=()=>{const result={};for(const dir of ['requests','objects'])for(const entry of readdirSync(path.join(workspace,dir))){if(dir==='requests')result[dir+'/'+entry]=digest(readFileSync(path.join(workspace,dir,entry)));else result[dir+'/'+entry+'/object.json']=digest(readFileSync(path.join(workspace,dir,entry,'object.json')));}return result;};
 return {workspace,put,publish,values,reads,read,inventory};
}
test('menu rebuilds all six supported saved kinds, preserves source/reference evidence and creates nothing',async t=>{
 const f=fixture(t),rows=PANEL_RESEARCH_CATALOG_KINDS.map(kind=>f.put(kind,{reference_rects:[[1,2,6,7],[9,2,14,7]],expected_position_xy:[4.5,4.5]}));f.put('frame');
 const before=f.inventory(),first=await listPanelResearchCatalog(f.workspace,f.read),second=await listPanelResearchCatalog(f.workspace,f.read);
 assert.equal(first.read_only,true);assert.equal(first.science_dispatched,false);assert.equal(first.complete,true);assert.equal(first.unavailable.length,0);assert.equal(first.records.length,6);assert.equal(first.request_count,7);
 assert.deepEqual(first.records.map(x=>x.kind),[...PANEL_RESEARCH_CATALOG_KINDS]);assert.deepEqual(first.records,second.records);
 for(const row of rows){const found=first.records.find(r=>r.object_id===row.object_id);assert.deepEqual(found.record,row);assert.equal(found.request_id,row.request_id);assert.equal(found.manifest_sha256,digest(JSON.stringify(row)));assert.ok(found.label&&!found.label.startsWith(row.object_id));}
 assert.deepEqual(f.inventory(),before);assert.equal(f.reads.length,12);
 first.records[0].record.reference_rects[0][0]=999;assert.equal(f.values.get(rows[0].object_id).reference_rects[0][0],1);
});
test('provider denial, unknown result and a mismatched original remain unavailable, never a successful menu item',async t=>{
 const f=fixture(t),a=f.put('gpa'),b=f.put('discovery_review'),c=f.put('profile');
 const result=await listPanelResearchCatalog(f.workspace,id=>{if(id===a.object_id)throw Object.assign(new Error('provider validation rejected source array'),{code:'CORRUPT_OBJECT'});if(id===b.object_id)return {...f.read(id),state:'unknown'};return {...f.read(id),samples:{value:[123]}};});
 assert.equal(result.records.length,0);assert.equal(result.complete,false);assert.equal(result.unavailable.length,3);assert.ok(result.unavailable.some(r=>r.object_id===a.object_id&&r.code==='CORRUPT_OBJECT'));assert.ok(result.unavailable.some(r=>r.object_id===b.object_id));assert.ok(result.unavailable.some(r=>r.object_id===c.object_id));
});
test('tampered manifest/journal and a record changed during the provider read cannot qualify',async t=>{
 const f=fixture(t),a=f.put('statistics'),b=f.put('method_plan');
 writeFileSync(path.join(f.workspace,'objects',a.object_id,'object.json'),JSON.stringify({...a,changed:true}));
 const result=await listPanelResearchCatalog(f.workspace,id=>{const value=f.read(id);if(id===b.object_id)f.publish({...b,changed_during_read:true});return value;});
 assert.equal(result.records.length,0);assert.equal(result.unavailable.length,2);assert.deepEqual(f.reads,[b.object_id]);assert.match(result.unavailable.find(r=>r.object_id===b.object_id).reason,/changed during/);
});
test('fresh read-only compatibility receipts do not replace original bytes; persisted or writing receipts are refused',async t=>{
 const f=fixture(t),a=f.put('gpa'),b=f.put('method_plan',{peak_summary_read_validation:{saved_records_modified:false,science_dispatched:false}}),c=f.put('discovery');
 const result=await listPanelResearchCatalog(f.workspace,id=>({...f.read(id),gpa_analytic_read_validation:{saved_records_modified:id===c.object_id,science_recomputed:false}}));
 assert.deepEqual(result.records.map(r=>r.object_id),[a.object_id]);assert.equal(result.records[0].record.gpa_analytic_read_validation,undefined);assert.equal(result.unavailable.length,2);assert.ok(result.unavailable.some(r=>r.object_id===b.object_id&&/persisted/.test(r.reason)));
});
test('linked request metadata is refused without following it or dispatching a provider read',async t=>{
 const f=fixture(t),a=f.put('profile');symlinkSync(path.join(f.workspace,'requests',a.request_id+'.json'),path.join(f.workspace,'requests','linked.json'));
 const result=await listPanelResearchCatalog(f.workspace,f.read);assert.equal(result.records.length,0);assert.equal(result.complete,false);assert.equal(result.unavailable.length,1);assert.match(result.unavailable[0].reason,/linked/);assert.equal(f.reads.length,0);
});
test('unfinished research requests remain explicitly unavailable and are never replayed',async t=>{
 const f=fixture(t);writeFileSync(path.join(f.workspace,'requests','original-unknown.json'),JSON.stringify({state:'submitted',request_id:'original-unknown',parameters:{action:'discovery_review',workspace:f.workspace,request_id:'original-unknown'}}));
 const result=await listPanelResearchCatalog(f.workspace,f.read);assert.equal(result.records.length,0);assert.equal(result.complete,false);assert.equal(result.unavailable[0].request_id,'original-unknown');assert.equal(result.unavailable[0].code,'ORIGINAL_REQUEST_NOT_COMPLETED');assert.equal(f.reads.length,0);
});
test('candidate budget is explicit, no hidden truncation or provider reads beyond 256',async t=>{
 const f=fixture(t);for(let i=0;i<257;i++)f.put('statistics');
 const result=await listPanelResearchCatalog(f.workspace,f.read);assert.equal(result.records.length,256);assert.equal(result.candidate_count,257);assert.equal(result.complete,false);assert.equal(f.reads.length,256);assert.ok(result.unavailable.some(r=>r.code==='BUDGET_EXCEEDED'));assert.deepEqual(result.limits,{requests:8192,candidates:256});
});

test('formal provider data omits inner ok but retains the actual completed state and exact original manifest',async t=>{const f=fixture(t),saved=f.put('gpa',{parameters:{reference_mode:'fixed_g'}}),before=f.inventory();const result=await listPanelResearchCatalog(f.workspace,id=>{const reply=f.read(id);delete reply.ok;return reply;});assert.equal(result.complete,true);assert.deepEqual(result.unavailable,[]);assert.equal(result.records[0].object_id,saved.object_id);assert.deepEqual(f.inventory(),before);});
test('missing completion state or explicit unsuccessful ok is never guessed from the creator journal',async t=>{const f=fixture(t);f.put('gpa');for(const mutate of [reply=>{delete reply.state;delete reply.ok;},reply=>{reply.ok=false;}]){const result=await listPanelResearchCatalog(f.workspace,id=>{const reply=f.read(id);mutate(reply);return reply;});assert.equal(result.records.length,0);assert.equal(result.complete,false);assert.match(result.unavailable[0].reason,/not a completed successful/);}});
