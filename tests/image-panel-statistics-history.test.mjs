// Public metadata fixtures and actual UI handlers; no private microscopy pixels.
import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {readImageStatisticsHistory} from '../lib/image_statistics_history.mjs';
import {DataProbes} from '../ui/image-panel/data-probes.mjs';
import {createImagePanel} from '../tools/image_panel.mjs';
import {referenceFromStatistics,readLeadDraft} from '../ui/image-panel/research-leads.mjs';
import {readAnalysisWorkspace,readAnalysisWorkspaceResumeSnapshot} from '../lib/analysis_workspace.mjs';
const id=n=>n.toString(16).padStart(32,'0'),F=id(1),V=id(2),A=id(3),B=id(4),OTHER=id(5),C=id(6);
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'statistics-history-')),objects=new Map();
 mkdirSync(path.join(root,'requests'));mkdirSync(path.join(root,'objects'));
 const put=(object,params={})=>{
  objects.set(object.object_id,structuredClone(object));const directory=path.join(root,'objects',object.object_id);mkdirSync(directory,{recursive:true});
  const raw=JSON.stringify(object);writeFileSync(path.join(directory,'object.json'),raw);
  writeFileSync(path.join(root,'requests',object.request_id+'.json'),JSON.stringify({state:'completed',request_id:object.request_id,object_manifest_sha256:sha(raw),parameters:{workspace:root,request_id:object.request_id,...params},response:{ok:true,state:'completed',backend:'external-image-workspace',request_id:object.request_id,...object}}));
 };
 const array=Buffer.from('public synthetic array hash placeholder; this test does not decode or calculate'),grid={source_grid_object_id:F,shape_yx:[4,6],dtype:'uint16',array_sha256:sha(array),source_rect_xyxy:[0,0,6,4],coordinate_space:'source_pixels'};
 const frame={object_id:F,request_id:'frame',backend:'external-image-workspace',kind:'frame',shape_yx:[4,6],dtype:'uint16',files_sha256:{'data.npy':sha(array)},frame_index:0,source_identity:{path:'public-example.tiff',sha256:'a'.repeat(64)}};put(frame);writeFileSync(path.join(root,'objects',F,'data.npy'),array);
 const mark=(name,coords)=>({kind:'rectangle',annotation_id:name,status:'hypothesized',text:name,anchor:{coordinate_space:'source_pixels',source_object_id:F,coordinates:coords}});
 put({object_id:V,request_id:'view',backend:'external-image-workspace',kind:'annotate',parent_object_id:F,render_base_object_id:F,scientific_grid_identity:grid,dtype:'uint16',display:{gamma:1,display_range:[0,100],scale_bar:false},panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,6,4],image_rect_xyxy:[0,0,6,4]}],annotations:[mark('A original',[.1,.1,1.9,1.9]),mark('B original',[2,0,4,2])]});
 const stats=(ident,rect,mean)=>({object_id:ident,request_id:'stats-'+ident,backend:'external-image-workspace',kind:'statistics',parent_object_id:V,created_utc:'2026-01-01T00:00:00Z',coordinate_space:'source_pixels',source_rect_xyxy:rect,component:'raw',dtype:'uint16',scientific_grid_identity:grid,statistics:{sample_count:4,mean,stddev:1,minimum:mean-1,maximum:mean+1},standard_deviation:'population; NumPy ddof=0; binary64 reductions',intensity_semantics:'raw stored values'});
 const saveStats=(s,params={})=>{const raw=JSON.stringify(s.statistics);s={...s,files_sha256:{'statistics.json':sha(raw)}};put(s,{action:'statistics',object_id:s.parent_object_id,component:'raw',rect:s.source_rect_xyxy,...params});writeFileSync(path.join(root,'objects',s.object_id,'statistics.json'),raw);};
 saveStats(stats(A,[0,0,2,2],5));saveStats(stats(B,[2,0,4,2],8));
 const read=(limit=256)=>readImageStatisticsHistory({workspace:root,objectId:V,limit});
 return {root,objects,put,frame,grid,stats,saveStats,read,close:()=>rmSync(root,{recursive:true,force:true})};
}
function savedPreview(f,ident=C,patch={}){
 const array=readFileSync(path.join(f.root,'objects',F,'data.npy')),png=Buffer.from('iVBORw0KGgo=','base64');
 const value={object_id:ident,request_id:'preview-'+ident,backend:'external-image-workspace',kind:'view',parent_object_id:F,shape_yx:[4,6],dtype:'uint16',files_sha256:{'data.npy':sha(array),'preview.png':sha(png)},panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,6,4],image_rect_xyxy:[0,0,6,4]}],display:{gamma:1,display_range:[0,100]},...patch};
 f.put(value,{action:'view',object_id:value.parent_object_id});writeFileSync(path.join(f.root,'objects',ident,'data.npy'),array);writeFileSync(path.join(f.root,'objects',ident,'preview.png'),png);return value;
}
test('raw statistics expose only a verified same-source current preview, never retrofit its historical input',()=>{
 const f=fixture();try{
  const preview=savedPreview(f);for(const [ident,rect,mean]of [[A,[0,0,2,2],5],[B,[2,0,4,2],8]])f.saveStats({...f.stats(ident,rect,mean),parent_object_id:F});
  const before=[F,A,B,C].map(id=>readFileSync(path.join(f.root,'objects',id,'object.json'))),history=readImageStatisticsHistory({workspace:f.root,objectId:C});
  assert.deepEqual(history.entries.map(e=>e.input_object_id),[F,F]);for(const entry of history.entries){assert.equal(entry.input_display.kind,'same_source_current_preview');assert.equal(entry.input_display.object_id,C);assert.equal(entry.input_display.manifest_sha256,sha(before[3]));assert.match(entry.input_display.reason,/不是统计时/);}
  assert.equal(readImageStatisticsHistory({workspace:f.root,objectId:F}).entries[0].input_display.kind,'unavailable','no search for any convenient saved preview');
  for(const [index,id]of [F,A,B,C].entries())assert.deepEqual(readFileSync(path.join(f.root,'objects',id,'object.json')),before[index]);
 }finally{f.close();}
});
test('same-source display requires exact array, full mapping and verified PNG; exact missing input is never substituted',()=>{
 for(const change of ['array-hash','crop','dtype','png','exact-missing']){
  const f=fixture();try{
   let preview=savedPreview(f);f.saveStats({...f.stats(A,[0,0,2,2],5),parent_object_id:change==='exact-missing'?C:F});
   if(change==='array-hash'){preview.files_sha256['data.npy']='0'.repeat(64);f.put(preview,{action:'view',object_id:F});}
   if(change==='crop'){preview.panels[0].source_rect_xyxy=[0,0,3,4];f.put(preview,{action:'view',object_id:F});}
   if(change==='dtype'){preview.dtype='float32';f.put(preview,{action:'view',object_id:F});}
   if(change==='png'||change==='exact-missing')writeFileSync(path.join(f.root,'objects',C,'preview.png'),'changed PNG');
   const entry=readImageStatisticsHistory({workspace:f.root,objectId:C}).entries.find(e=>e.object_id===A);assert.equal(entry.input_display.kind,'unavailable',change);assert.equal(entry.input_object_id,change==='exact-missing'?C:F);assert.equal(entry.statistics.mean,5);
  }finally{f.close();}
 }
});
test('statistics explicitly submitted from a saved display retain that exact input across another current preview',()=>{
 const f=fixture();try{
  savedPreview(f);savedPreview(f,OTHER,{display:{gamma:2,display_range:[0,50]}});f.saveStats({...f.stats(A,[0,0,2,2],5),parent_object_id:C});
  const entry=readImageStatisticsHistory({workspace:f.root,objectId:OTHER}).entries.find(e=>e.object_id===A);assert.equal(entry.input_object_id,C);assert.equal(entry.input_display.kind,'exact_saved_input');assert.equal(entry.input_display.object_id,C);assert.notEqual(entry.input_display.object_id,OTHER);assert.match(entry.input_display.reason,/准确绑定/);
 }finally{f.close();}
});
test('same-frame history returns complete immutable A/B values with original labels and real truncation',()=>{
 const f=fixture();try{
  const before=readdirSync(path.join(f.root,'requests')),bytes=before.map(n=>readFileSync(path.join(f.root,'requests',n)));
  const result=f.read();assert.equal(result.read_only,true);assert.equal(result.entries.length,2);assert.equal(result.scope,'same_frame_source_pixels');
  assert.deepEqual(result.entries.map(e=>e.matching_input_annotations[0].name),['A original','B original']);assert.equal(result.entries[0].statistics.mean,5);assert.equal(result.entries[1].statistics.maximum,9);assert.equal(result.entries[0].intensity_unit,null);assert.equal(result.entries[0].created_utc,'2026-01-01T00:00:00Z');
  // Another frame, even from the same filename, cannot borrow these records.
  f.put({...f.frame,object_id:OTHER,request_id:'other-frame'});f.put({...f.objects.get(V),object_id:C,request_id:'other-view',parent_object_id:OTHER,render_base_object_id:OTHER});
  assert.equal(readImageStatisticsHistory({workspace:f.root,objectId:C}).entries.length,0);
  assert.equal(f.read(1).total,2);assert.equal(f.read(1).truncated,true);assert.equal(f.read(1).entries.length,1);
  for(let i=0;i<before.length;i++)assert.deepEqual(readFileSync(path.join(f.root,'requests',before[i])),bytes[i]);
 }finally{f.close();}
});
test('history does not rename old regions from moved or ambiguous current observations',()=>{
 const f=fixture();try{
  const current={...f.objects.get(V),object_id:C,request_id:'renamed-view',parent_object_id:V,annotations:[]};f.put(current);
  const r=readImageStatisticsHistory({workspace:f.root,objectId:C});assert.equal(r.entries[0].matching_input_annotations[0].name,'A original');
  const s=f.stats(A,[1,1,3,3],5);f.saveStats(s);assert.deepEqual(f.read().entries.find(e=>e.object_id===A).matching_input_annotations,[]);
 }finally{f.close();}
});
test('changed payload, original parameters, nonfinite/count diagnostics and source array are refused',()=>{
 for(const change of ['payload','parameters','nonfinite','count','array']){
  const f=fixture();try{
   if(change==='payload')writeFileSync(path.join(f.root,'objects',A,'statistics.json'),'{}');
   if(change==='parameters')f.saveStats(f.stats(A,[0,0,2,2],5),{rect:[1,0,3,2]});
   if(change==='nonfinite'){const s=f.stats(A,[0,0,2,2],5);s.statistics.mean=null;f.saveStats(s);}
   if(change==='count'){const s=f.stats(A,[0,0,2,2],5);s.statistics.sample_count=3;f.saveStats(s);}
   if(change==='array')writeFileSync(path.join(f.root,'objects',F,'data.npy'),'changed');
   assert.throws(()=>f.read(),/statistics|array/i,change);
  }finally{f.close();}
 }
});
test('actual read-only Panel route requires token and exact current identity without submitting science',async()=>{
 const f=fixture(),calls=[];let panel;
 try{
  panel=await createImagePanel({workspace:f.root,python:process.execPath,object_id:V,client:{async rpc(){return {result:{tools:[{name:'image_info',inputSchema:{}}]}};},async tool(name,args){calls.push(name);assert.equal(name,'image_info');return {data:{...f.objects.get(args.object_id),ok:true,state:'completed'},png:'iVBORw0KGgo='};},async close(){}}});
  const origin=panel.url.split('/#')[0],before=JSON.stringify(panel.state()),files=readdirSync(path.join(f.root,'requests')),count=calls.length;
  for(const [query,status,token]of [['object_id='+V,200,true],['object_id='+C,409,true],['object_id='+V+'&object_id='+V,409,true],['object_id='+V+'&workspace=elsewhere',409,true],['object_id='+V,403,false]]){
   const response=await fetch(origin+'/api/statistics-history?'+query,{headers:token?{'X-Panel-Token':panel.token}:{}});assert.equal(response.status,status);const result=await response.json();if(status===200)assert.equal(result.entries.length,2);
  }
  assert.equal(JSON.stringify(panel.state()),before);assert.equal(calls.length,count);assert.deepEqual(readdirSync(path.join(f.root,'requests')),files);
 }finally{await panel?.close();f.close();}
});
test('raw-frame statistics preserve the exact input and refuse display without substituting an existing same-frame preview',async()=>{
 const f=fixture(),calls=[];let panel;
 try{
  for(const [ident,rect,mean]of [[A,[0,0,2,2],5],[B,[2,0,4,2],8]])f.saveStats({...f.stats(ident,rect,mean),parent_object_id:F});
  const entries=f.read().entries;assert.deepEqual(entries.map(entry=>entry.input_object_id),[F,F]);
  panel=await createImagePanel({workspace:f.root,python:process.execPath,object_id:V,client:{async rpc(){return {result:{tools:[{name:'image_info',inputSchema:{}}]}};},async tool(name,args){calls.push({name,args});assert.equal(name,'image_info','navigation may only read, never create a preview');return {data:{...f.objects.get(args.object_id),ok:true,state:'completed'},png:args.object_id===V?'iVBORw0KGgo=':null};},async close(){}}});
  const origin=panel.url.split('/#')[0],before=JSON.stringify(panel.state()),files=readdirSync(path.join(f.root,'requests')),bytes=files.map(n=>readFileSync(path.join(f.root,'requests',n)));
  for(let attempt=0;attempt<2;attempt++){
   const state=panel.state(),count=calls.length,response=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,action:'show',params:{object_id:entries[0].input_object_id}})});
   assert.equal(response.status,400);assert.match((await response.json()).error,/^PREVIEW_REQUIRED:/);assert.equal(JSON.stringify(panel.state()),before);assert.deepEqual(calls.slice(count),[{name:'image_info',args:{object_id:F}}]);
  }
  assert.deepEqual(readdirSync(path.join(f.root,'requests')),files);for(let i=0;i<files.length;i++)assert.deepEqual(readFileSync(path.join(f.root,'requests',files[i])),bytes[i]);
 }finally{await panel?.close();f.close();}
});
function ui(response,showStatisticsInput,useStatistics){
 let active=null,objectId=V,reads=0;const elements=new Map();
 class Element {children=[];textContent='';open=false;listeners={};append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}focus(){active=this;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}addEventListener(n,fn){this.listeners[n]=fn;}}
 const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},errors=[];
 const doc={getElementById:el,createElement:()=>new Element(),get activeElement(){return active;}};el('origin').focus();
 new DataProbes({document:doc,showStatisticsInput,useStatistics,getState:()=>({object:{object_id:objectId}}),readStatisticsHistory:async()=>{reads++;return typeof response==='function'?response():response;},onOpenStatisticsHistory:()=>el('origin'),onError:e=>errors.push(e.message)});
 return {el,errors,reads:()=>reads,setObject:v=>objectId=v,active:()=>active};
}
const history={schema_version:1,read_only:true,scope:'same_frame_source_pixels',object_id:V,frame_object_id:F,total:1,truncated:false,entries:[{object_id:A,input_object_id:V,request_id:'saved-A',source_rect_xyxy:[0,0,2,2],matching_input_annotations:[{annotation_id:'old-A',name:'Saved A'}],component:'raw',statistics:{sample_count:4,mean:5,stddev:1,minimum:4,maximum:6},source_identity:{path:'public.tiff'}}]};
const allText=e=>[e.textContent,...e.children.map(allText)].join('\n');

test('statistics handoff sends exact reference and current source without computation; stale source/refusal keeps history',async()=>{
 const f=fixture();try{const response=f.read(),calls=[],h=ui(response,undefined,async(...args)=>calls.push(args));
  const find=(e,text)=>e.textContent===text?e:e.children.map(c=>find(c,text)).find(Boolean);
  await h.el('open-statistics-history').onclick();let b=find(h.el('statistics-history-rows'),'进一步整理解释（可选）');await b.onclick();
  assert.deepEqual(calls,[[referenceFromStatistics(response.entries[0]),V]]);assert.equal(h.el('statistics-history-dialog').open,false);
  await h.el('open-statistics-history').onclick();b=find(h.el('statistics-history-rows'),'进一步整理解释（可选）');h.setObject(OTHER);await b.onclick();assert.equal(calls.length,1);assert.equal(h.el('statistics-history-dialog').open,true);assert.match(h.el('statistics-history-status').textContent,/图像已切换/);
  const refused=ui(response,undefined,async()=>{throw Error('Source proof invalid');});await refused.el('open-statistics-history').onclick();await find(refused.el('statistics-history-rows'),'进一步整理解释（可选）').onclick();assert.equal(refused.el('statistics-history-dialog').open,true);assert.match(refused.el('statistics-history-status').textContent,/Source proof invalid/);
 }finally{f.close();}
});

async function researchPanel(run){
 const f=fixture();let panel;const preview=Buffer.from('iVBORw0KGgo=','base64');f.put({...f.objects.get(V),files_sha256:{'preview.png':sha(preview)}});writeFileSync(path.join(f.root,'objects',V,'preview.png'),preview);
 const start=async()=>{const saved=readAnalysisWorkspaceResumeSnapshot(f.root);panel=await createImagePanel({workspace:f.root,python:process.execPath,panel_id:id(90),object_id:saved?.object_id??V,...(saved?{analysis_restore:saved}:{}),client:{async rpc(){return {result:{tools:[{name:'image_info',inputSchema:{}}]}};},async tool(name,args){assert.equal(name,'image_info','metadata workflow must never calculate');return {data:{...f.objects.get(args.object_id),ok:true,state:'completed'},png:'iVBORw0KGgo='};},async close(){}}});};
 await start();
 const work=async(action,params={})=>{const s=panel.state(),origin=panel.url.split('/#')[0],r=await fetch(origin+'/api/workspace',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({action,lead_attempt_id:randomBytes(16).toString('hex'),expected_panel_id:s.panel_id,expected_lead_session_id:s.research_lead_session_id,expected_object_id:s.object.object_id,expected_state_revision:s.state_revision,draft_revision:s.edit_state.draft_revision,collection_revision:s.window_collection.revision,expected_working_revision:s.workspace_analysis.working_revision,...params})});return {status:r.status,data:await r.json()};};
 const read=async(token=true)=>{const r=await fetch(panel.url.split('/#')[0]+'/api/research-leads?object_id='+V,{headers:token?{'X-Panel-Token':panel.token,Connection:'close'}:{Connection:'close'}});return {status:r.status,data:await r.json()};};
 try{await run({f,get panel(){return panel;},work,read,async reopen(){await panel.close();panel=null;await start();}});}finally{await panel?.close();f.close();}
}
const lead=(q,entries)=>({lead_id:'7'.repeat(32),question:q,proposed_by:'agent',hypothesis:'Descriptive spread comparison, not a contrast mechanism',evidence:entries.map(e=>({relation:'supports',note:'Use both original windows together; proposal only',reference:referenceFromStatistics(e)})),unknowns:'Image formation and reference comparability remain unknown',next_step:'Check comparable windows; planned, not executed'});

test('research lead vertical transport saves and reopens exact metadata, marks changed question historical and preserves withdrawal',()=>researchPanel(async h=>{
 const unauth=await h.read(false);assert.equal(unauth.status,403);
 const q=await h.work('set-research-question',{question_text:'What observed spread difference remains unexplained?'});assert.equal(q.status,200,q.data.error);const draft=lead(q.data.research_question,h.f.read().entries),originals=new Map([...h.f.objects.keys()].map(id=>[id,readFileSync(path.join(h.f.root,'objects',id,'object.json'))]));
 const staleLease=await h.work('create-research-lead',{lead_draft:draft,expected_working_revision:-1});assert.equal(staleLease.data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_leads,undefined);
 const applied=await h.work('create-research-lead',{lead_draft:draft});assert.equal(applied.data.research_lead_update.state,'applied',JSON.stringify(applied.data));
 assert.equal(applied.data.research_leads_reference_status,'not_revalidated_by_state_read');assert.match(applied.data.research_leads_semantics,/same_source_entries_are_not_independent_experiments/);assert.match(applied.data.research_leads_semantics,/no_automatic_weighting_or_hypothesis_test/);let read=await h.read();assert.equal(read.data.leads[0].currentness,'current_question');assert.ok(read.data.leads[0].evidence.every(e=>e.validation==='verified_saved_reference'));assert.equal(read.data.leads[0].next_step_status,'planned_not_executed');
 const saved=await h.work('save',{save_id:'lead-first'});assert.equal(saved.status,200,saved.data.error);const bytes=readFileSync(path.join(h.f.root,'analysis-workspace/savepoints/lead-first.json'));await h.work('close');await h.reopen();assert.deepEqual(h.panel.state().research_leads.entries[0].evidence,draft.evidence);
 await h.work('set-research-question',{question_text:'A revised, different question'});read=await h.read();assert.equal(read.data.leads[0].currentness,'historical_question');assert.deepEqual(read.data.leads[0].record.question,draft.question);
 const stale=await h.work('create-research-lead',{lead_draft:{...draft,lead_id:'8'.repeat(32)}});assert.equal(stale.data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_leads.entries.length,1);
 const withdrawn=await h.work('withdraw-research-lead',{lead_id:draft.lead_id,withdrawal_note:'Interpretation proposal withdrawn, original data retained'});assert.equal(withdrawn.data.research_lead_update.state,'applied');assert.deepEqual(withdrawn.data.research_leads.entries[0].evidence,draft.evidence);assert.ok(withdrawn.data.research_leads.entries[0].withdrawn_utc);
 const saved2=await h.work('save',{save_id:'lead-withdrawn'});assert.equal(saved2.status,200,saved2.data.error);await h.work('close');await h.reopen();assert.ok(h.panel.state().research_leads.entries[0].withdrawn_utc);
 assert.deepEqual(readFileSync(path.join(h.f.root,'analysis-workspace/savepoints/lead-first.json')),bytes);for(const [id,raw]of originals)assert.deepEqual(readFileSync(path.join(h.f.root,'objects',id,'object.json')),raw);
}));

test('research lead rejects forged hashes, question ownership, request and frame; missing advisory result reopens as unavailable',()=>researchPanel(async h=>{
 const q=(await h.work('set-research-question',{question_text:'Bound question'})).data.research_question,draft=lead(q,h.f.read().entries);
 for(const patch of [
  d=>{d.evidence[0].reference.frame_id=OTHER;},d=>{d.evidence[0].reference.manifest_sha256='0'.repeat(64);},
  d=>{d.evidence[0].reference.request_id='forged';},d=>{d.evidence[0].reference.input_view_id=C;},
  d=>{d.question.text='Unapplied question';},d=>{d.evidence[0].relation='verified';}
 ]){const bad=structuredClone(draft);patch(bad);const response=await h.work('create-research-lead',{lead_draft:bad});assert.equal(response.data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_leads,undefined);}
 assert.throws(()=>readLeadDraft({...draft,evidence:[draft.evidence[0],draft.evidence[0]]}),/duplicate/);
 await h.work('create-research-lead',{lead_draft:draft});await h.work('save',{save_id:'before-advisory-loss'});await h.work('close');
 // This optional result is not a core workspace dependency. Its expected
 // hashes remain stored; reopening must expose unavailable, never new numbers.
 writeFileSync(path.join(h.f.root,'objects',A,'statistics.json'),'{}');await h.reopen();const read=await h.read();assert.ok(read.data.leads[0].evidence.every(e=>e.validation==='unavailable'&&e.observation===null));assert.deepEqual(h.panel.state().research_leads.entries[0].evidence,draft.evidence);
 const withdrawn=await h.work('withdraw-research-lead',{lead_id:draft.lead_id,withdrawal_note:'Cannot currently verify the referenced observations'});assert.equal(withdrawn.data.research_lead_update.state,'applied');
}));
const originalLeadCommand=(panel,draft)=>{const s=panel.state();return {action:'create-research-lead',lead_attempt_id:randomBytes(16).toString('hex'),lead_draft:draft,expected_panel_id:s.panel_id,expected_lead_session_id:s.research_lead_session_id,expected_object_id:s.object.object_id,expected_state_revision:s.state_revision,draft_revision:s.edit_state.draft_revision,collection_revision:s.window_collection.revision,expected_working_revision:s.workspace_analysis.working_revision};};
test('serialized lead settlement acknowledges applied lost response without duplicate and fences a not-yet-delivered original POST',()=>researchPanel(async h=>{
 const q=(await h.work('set-research-question',{question_text:'Recover original metadata attempt'})).data.research_question,first=originalLeadCommand(h.panel,lead(q,h.f.read().entries));
 // Application response is deliberately ignored; recovery uses the exact envelope.
 await h.work(first.action,first);const applied=await h.work('resolve-research-lead-update',{original_update:first});assert.equal(applied.data.research_lead_update.state,'applied');assert.equal(applied.data.research_lead_update.terminal,true);assert.deepEqual(applied.data.research_lead_update.original_update,first);assert.equal(h.panel.state().research_leads.entries.length,1);
 const duplicateRevision=h.panel.state().state_revision;const duplicate=await h.work(first.action,first);assert.equal(duplicate.data.research_lead_update.state,'applied');assert.equal(duplicate.data.research_lead_update.duplicate_transport_receipt,true);assert.equal(h.panel.state().state_revision,duplicateRevision,'duplicate acknowledgement must not mutate');const altered=await h.work(first.action,{...first,lead_draft:{...first.lead_draft,hypothesis:'Different payload cannot reuse success'}});assert.equal(altered.status,409);assert.match(altered.data.error,/different envelope/);const newScopeConflict={...first,expected_state_revision:h.panel.state().state_revision,lead_draft:{...first.lead_draft,lead_id:'f'.repeat(32)}};assert.equal((await h.work(first.action,newScopeConflict)).status,409);assert.equal((await h.work('resolve-research-lead-update',{original_update:newScopeConflict})).status,409);const freshPayloadConflict=await h.work(first.action,{lead_draft:{...first.lead_draft,hypothesis:'Same lead ID, different content'}});assert.equal(freshPayloadConflict.data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_leads.entries.length,1);
 const delayed=originalLeadCommand(h.panel,{...lead(q,h.f.read().entries),lead_id:'8'.repeat(32)}),origin=h.panel.url.split('/#')[0],raw=JSON.stringify(delayed),middle=Math.floor(raw.length/2);
 let finish;const pending=new Promise((resolve,reject)=>{const request=http.request(origin+'/api/workspace',{method:'POST',headers:{'X-Panel-Token':h.panel.token,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),Connection:'close'}},response=>{let text='';response.setEncoding('utf8');response.on('data',v=>text+=v);response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(text)}));});request.on('error',reject);request.write(raw.slice(0,middle));finish=()=>request.end(raw.slice(middle));});
 try{
  const before=h.panel.state().state_revision;assert.equal((await h.read()).data.leads.length,1);assert.equal(h.panel.state().state_revision,before,'plain read is not a terminal fence');
  const fenced=await h.work('resolve-research-lead-update',{original_update:delayed});assert.equal(fenced.data.research_lead_update.state,'not_present_fenced');assert.equal(fenced.data.research_lead_update.terminal,true);assert.ok(fenced.data.research_lead_update.fenced_state_revision>delayed.expected_state_revision);assert.equal(h.panel.state().research_leads.entries.length,1);
 }finally{finish();}
 const late=await pending;assert.equal(late.status,409);assert.match(late.data.error,/fenced/);assert.equal(h.panel.state().research_leads.entries.length,1);
 const revised={...delayed.lead_draft,lead_id:'9'.repeat(32),hypothesis:'An explicitly revised proposal'};assert.equal((await h.work('create-research-lead',{lead_draft:revised})).data.research_lead_update.state,'applied');await h.work(delayed.action,delayed);assert.equal(h.panel.state().research_leads.entries.length,2);
 // Withdrawing has the same fencing path and never retries a late old request.
 const state=h.panel.state(),withdraw={action:'withdraw-research-lead',lead_attempt_id:randomBytes(16).toString('hex'),lead_id:revised.lead_id,withdrawal_note:'Explicitly withdrawn proposal',expected_panel_id:state.panel_id,expected_lead_session_id:state.research_lead_session_id,expected_object_id:state.object.object_id,expected_state_revision:state.state_revision,draft_revision:state.edit_state.draft_revision,collection_revision:state.window_collection.revision,expected_working_revision:state.workspace_analysis.working_revision};
 assert.equal((await h.work('resolve-research-lead-update',{original_update:withdraw})).data.research_lead_update.state,'not_present_fenced');assert.equal((await h.work(withdraw.action,withdraw)).status,409);assert.equal(h.panel.state().research_leads.entries[1].withdrawn_utc,undefined);
 assert.equal((await h.work('withdraw-research-lead',{lead_id:revised.lead_id,withdrawal_note:withdraw.withdrawal_note})).data.research_lead_update.state,'applied');
 const revokedBefore=h.panel.state().research_leads.entries[1].withdrawn_utc;
 const replayedFirst=await h.work(first.action,{...first});assert.equal(replayedFirst.data.research_lead_update.state,'applied');assert.equal(h.panel.state().research_leads.entries[1].withdrawn_utc,revokedBefore);
 const saved=await h.work('save',{save_id:'fenced-leads'});assert.equal(saved.status,200,saved.data.error);const oldSession=h.panel.state().research_lead_session_id;await h.work('close');await h.reopen();assert.notEqual(h.panel.state().research_lead_session_id,oldSession);assert.equal((await h.work('resolve-research-lead-update',{original_update:delayed})).status,409);assert.equal((await h.work(delayed.action,delayed)).data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_leads.entries.length,2);assert.ok(h.panel.state().research_leads.entries[1].withdrawn_utc);
}));

test('known refusal stays refused for its exact attempt while a new explicit attempt can use the restored evidence',()=>researchPanel(async h=>{
 const q=(await h.work('set-research-question',{question_text:'Explicit new attempt after a known refusal'})).data.research_question,original=originalLeadCommand(h.panel,lead(q,h.f.read().entries)),file=path.join(h.f.root,'objects',A,'statistics.json'),bytes=readFileSync(file);
 writeFileSync(file,'{}');const refused=await h.work(original.action,original);assert.equal(refused.data.research_lead_update.state,'not_applied');writeFileSync(file,bytes);const again=await h.work(original.action,original);assert.equal(again.data.research_lead_update.state,'not_applied');assert.equal(again.data.research_lead_update.duplicate_transport_receipt,true);assert.equal(h.panel.state().research_leads,undefined);
 const newAttempt=await h.work(original.action,{...original,lead_attempt_id:randomBytes(16).toString('hex')});assert.equal(newAttempt.data.research_lead_update.state,'applied');assert.equal(h.panel.state().research_leads.entries.length,1);assert.deepEqual(readFileSync(file),bytes);
}));

test('cached applied receipt is not reported not-applied or replayed after explicit discard removed the record',()=>researchPanel(async h=>{
 const q=(await h.work('set-research-question',{question_text:'Original receipt history'})).data.research_question;await h.work('save',{save_id:'question-without-lead'});const original=originalLeadCommand(h.panel,lead(q,h.f.read().entries));assert.equal((await h.work(original.action,original)).data.research_lead_update.state,'applied');await h.work('discard');assert.equal(h.panel.state().research_leads,undefined);
 const duplicate=await h.work(original.action,original);assert.equal(duplicate.status,409);assert.match(duplicate.data.error,/Original update ran/);assert.equal(h.panel.state().research_leads,undefined);const resolution=await h.work('resolve-research-lead-update',{original_update:original});assert.equal(resolution.data.research_lead_update.state,'not_present_fenced');assert.equal(h.panel.state().research_leads,undefined);
}));

test('actual history UI opens from both entries, shows full identity and unknowns, and closes with focus',async()=>{
 const h=ui(history);await h.el('open-statistics-history').onclick();const text=allText(h.el('statistics-history-rows'));
 for(const value of ['Saved A','均值 5','标准差 1','最小 4','最大 6','n=4','强度单位未声明','保存时间（UTC）：未知',A,'saved-A'])assert.ok(text.includes(value),value);
 assert.match(h.el('statistics-history-status').textContent,/不代表当前选区、周期、方向、应变或物理解释/);
 h.el('close-statistics-history').onclick();assert.equal(h.el('statistics-history-dialog').open,false);assert.equal(h.active(),h.el('origin'));
 await h.el('open-statistics-history-inline').onclick();assert.equal(h.reads(),2);h.el('close-statistics-history').onclick();await h.el('open-statistics-history-measurements').onclick();assert.equal(h.reads(),3);assert.deepEqual(h.errors,[]);
});
test('history UI refuses stale sources, shows true empty state and does not reuse old rows',async()=>{
 const stale=ui({...history,object_id:C});await stale.el('open-statistics-history').onclick();assert.equal(stale.el('statistics-history-rows').children.length,0);assert.equal(stale.errors.length,1);
 const empty=ui({...history,entries:[],total:0});await empty.el('open-statistics-history').onclick();assert.match(empty.el('statistics-history-status').textContent,/不自动计算或借用其他帧/);
});

test('statistics source jump uses exact historical input, closes after confirmation, and retains dialog on refusal',async()=>{
 const find=(e,text)=>e.textContent===text?e:e.children.map(c=>find(c,text)).find(Boolean);
 const opened=[],h=ui(history,async id=>{opened.push(id);});await h.el('open-statistics-history').onclick();
 const button=find(h.el('statistics-history-rows'),'查看统计时的原图输入');
 assert.equal(button.textContent,'查看统计时的原图输入');await button.onclick();assert.deepEqual(opened,[V]);assert.equal(h.el('statistics-history-dialog').open,false);
 const failed=ui(history,async()=>{throw Error('Controlled dirty/capacity/identity refusal');});await failed.el('open-statistics-history').onclick();
 await find(failed.el('statistics-history-rows'),'查看统计时的原图输入').onclick();assert.equal(failed.el('statistics-history-dialog').open,true);assert.match(failed.el('statistics-history-status').textContent,/未打开.*refusal/);
 const unknown=ui({...history,entries:[{...history.entries[0],input_object_id:null}]},async()=>{throw Error('must not navigate');});await unknown.el('open-statistics-history').onclick();assert.equal(unknown.el('statistics-history-rows').children[0].children.at(-1).children.length,1);
});

// Offline-only vertical slice: actual HTTP, saved synthetic metadata, no model.
async function offlineRead(h,route){const r=await fetch(h.panel.url.split('/#')[0]+route,{headers:{'X-Panel-Token':h.panel.token,Connection:'close'}});return {status:r.status,data:await r.json()};}
async function offlineFixture(h,noEvidence=false){
 await h.work('set-research-question',{question_text:'Synthetic A/B spread: what remains unknown?'});
 const packet=await offlineRead(h,'/api/offline-context?context_id='+id(91));assert.equal(packet.status,200,JSON.stringify(packet.data));
 const {syntheticOfflineResponse}=await import('../ui/image-panel/offline-research.mjs');
 const response=syntheticOfflineResponse(packet.data.binding,id(92),!noEvidence);return {packet:packet.data,response};
}
test('offline whitelist omits automatic source-path/capability/image/array fields for the tested text; no independent weight',()=>researchPanel(async h=>{
 const {packet,response}=await offlineFixture(h),text=JSON.stringify(packet);
 assert.equal(packet.delivery,'local_only_no_model_call');assert.equal(packet.observations.length,2);assert.equal(packet.observations[0].statistics.mean,5);
 for(const banned of ['public-example.tiff',h.f.root,'png_base64','panel_url','token','data.npy'])assert.ok(!text.includes(banned),banned);
 assert.match(packet.notice,/未调用 AI/);assert.match(packet.notice,/不是独立重复实验/);
 const staged=await h.work('stage-offline-candidate',{lead_id:response.candidate_id,offline_binding:packet.binding,offline_response:response});assert.equal(staged.data.research_lead_update.state,'applied',JSON.stringify(staged.data));assert.equal(h.panel.state().research_leads,undefined);
 const before=JSON.stringify(h.panel.state());const source=await offlineRead(h,'/api/offline-source?lead_id='+response.candidate_id+'&result_id='+A);assert.equal(source.status,200,JSON.stringify(source.data));assert.equal(source.data.local_only,true);assert.equal(source.data.reference.input_view_id,V);assert.deepEqual(source.data.source_rect_xyxy,[0,0,2,2]);assert.equal(source.data.statistics.mean,5);assert.equal(typeof source.data.png_base64,'string');assert.equal(JSON.stringify(h.panel.state()),before,'source inspection does not navigate or mutate');
}));
test('offline pending survives save/reopen; explicit same-source review accepts edited proposal once and preserves original response',()=>researchPanel(async h=>{
 const {packet,response}=await offlineFixture(h),originals=new Map([...h.f.objects.keys()].map(k=>[k,readFileSync(path.join(h.f.root,'objects',k,'object.json'))]));
 await h.work('stage-offline-candidate',{lead_id:response.candidate_id,offline_binding:packet.binding,offline_response:response});await h.work('save',{save_id:'pending-offline'});await h.work('close');await h.reopen();
 const check=await offlineRead(h,'/api/offline-review?lead_id='+response.candidate_id);assert.equal(check.status,200,JSON.stringify(check.data));assert.notEqual(check.data.review.lease.session_id,packet.binding.lease.session_id);assert.deepEqual(check.data.original_binding,packet.binding);
 const edited={...response,hypothesis:'Synthetic windows differ in saved mean; mechanism still unknown.'},command=originalLeadCommand(h.panel,{lead_id:response.candidate_id});delete command.lead_draft;Object.assign(command,{action:'accept-offline-candidate',lead_id:response.candidate_id,offline_response:edited,offline_review:check.data.review});
 const accepted=await h.work(command.action,command);assert.equal(accepted.data.research_lead_update.state,'applied',JSON.stringify(accepted.data));assert.equal(h.panel.state().research_offline.entries[0].status,'accepted');assert.deepEqual(h.panel.state().research_offline.entries[0].response,response);assert.match(h.panel.state().research_leads.entries[0].hypothesis,/离线合成演示/);assert.match(h.panel.state().research_leads.entries[0].hypothesis,/Synthetic windows/);
 const rev=h.panel.state().state_revision,duplicate=await h.work(command.action,command);assert.equal(duplicate.data.research_lead_update.state,'applied');assert.equal(h.panel.state().state_revision,rev);assert.equal(h.panel.state().research_leads.entries.length,1);
 assert.equal((await h.work(command.action,{...command,offline_response:{...edited,hypothesis:'Altered duplicate'}})).status,409);
 await h.work('save',{save_id:'accepted-offline'});await h.work('close');await h.reopen();assert.equal(h.panel.state().research_offline.entries[0].status,'accepted');assert.equal(h.panel.state().research_leads.entries.length,1);
 for(const [k,bytes] of originals)assert.deepEqual(readFileSync(path.join(h.f.root,'objects',k,'object.json')),bytes);
}));
test('offline no-evidence suggestions remain pending and can be rejected without manufacturing a lead',()=>researchPanel(async h=>{
 const {packet,response}=await offlineFixture(h,true);await h.work('stage-offline-candidate',{lead_id:response.candidate_id,offline_binding:packet.binding,offline_response:response});const check=await offlineRead(h,'/api/offline-review?lead_id='+response.candidate_id);
 const denied=await h.work('accept-offline-candidate',{lead_id:response.candidate_id,offline_response:response,offline_review:check.data.review});assert.equal(denied.data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_offline.entries[0].status,'pending');assert.equal(h.panel.state().research_leads,undefined);
 const rejected=await h.work('reject-offline-candidate',{lead_id:response.candidate_id,withdrawal_note:'Only a synthetic suggestion; no evidence'});assert.equal(rejected.data.research_lead_update.state,'applied');assert.equal(h.panel.state().research_offline.entries[0].status,'rejected');assert.equal(h.panel.state().research_leads,undefined);await h.work('save',{save_id:'rejected-offline'});await h.work('close');await h.reopen();assert.equal(h.panel.state().research_offline.entries[0].status,'rejected');
}));
test('offline late responses, forged references and changed questions cannot silently rebind',()=>researchPanel(async h=>{
 const {packet,response}=await offlineFixture(h);await h.work('set-research-question',{question_text:'Changed synthetic question'});
 const late=await h.work('stage-offline-candidate',{lead_id:response.candidate_id,offline_binding:packet.binding,offline_response:response});assert.equal(late.data.research_lead_update.state,'not_applied');assert.equal(h.panel.state().research_offline,undefined);
 const next=await offlineRead(h,'/api/offline-context?context_id='+id(93)),{syntheticOfflineResponse}=await import('../ui/image-panel/offline-research.mjs'),fresh=syntheticOfflineResponse(next.data.binding,id(94));
 const forged={...fresh,evidence:[{...fresh.evidence[0],reference:{...fresh.evidence[0].reference,statistics_sha256:'0'.repeat(64)}}]};assert.equal((await h.work('stage-offline-candidate',{lead_id:fresh.candidate_id,offline_binding:next.data.binding,offline_response:forged})).data.research_lead_update.state,'not_applied');
 await h.work('stage-offline-candidate',{lead_id:fresh.candidate_id,offline_binding:next.data.binding,offline_response:fresh});await h.work('set-research-question',{question_text:'Another question'});assert.equal((await offlineRead(h,'/api/offline-review?lead_id='+fresh.candidate_id)).status,400);assert.equal(h.panel.state().research_offline.entries[0].status,'pending');
}));

// No HTTP: inspect the actual whitelist/immutable reader separately from transport.
test('offline pure context whitelist preserves free text with incomplete path checks and rejects spoofed bindings or changed scope',async()=>{
 const f=fixture();try{
  const {offlineContext}=await import('../lib/research_offline.mjs'),s={object:f.objects.get(V),panel_id:id(80),research_lead_session_id:'f'.repeat(16),state_revision:1,frame_identity:{frame_object_id:F},edit_state:{draft_revision:0},window_collection:{revision:0,windows:[]},workspace_analysis:{working_revision:1},selection:null,research_question:{version:1,text:'Synthetic question',context_object_id:V,frame_object_id:F,recorded_utc:'2026-11-06T20:00:00.000Z'}};
  const packet=offlineContext(f.root,s,id(81));assert.equal(packet.observations.length,2);assert.equal(packet.observations[0].statistics.mean,5);assert.ok(!JSON.stringify(packet).includes('public-example.tiff'));assert.ok(!JSON.stringify(packet).includes(f.root));assert.deepEqual(Object.keys(packet.observations[0].statistics).sort(),['maximum','mean','minimum','sample_count','stddev']);
  for(const [field,value]of [['view_id',C],['view_sha256','0'.repeat(64)],['frame_sha256','0'.repeat(64)],['question_context_sha256','0'.repeat(64)]])assert.throws(()=>offlineContext(f.root,s,id(81),{...packet.binding,[field]:value}),/changed/);
  const changed={...s,selection:{kind:'rectangle',source_object_id:F,coordinate_space:'source_pixels',coordinates:[0,0,2,2]}};assert.throws(()=>offlineContext(f.root,changed,id(81),packet.binding),/changed/);
  const pathQuestion={...s,research_question:{...s.research_question,text:'/var/tmp/private/sample.tif'}},originalQuestion=structuredClone(pathQuestion.research_question);
  const preserved=offlineContext(f.root,pathQuestion,id(82));assert.equal(preserved.binding.question.text,'/var/tmp/private/sample.tif');assert.deepEqual(pathQuestion.research_question,originalQuestion,'free text must not be silently rewritten');assert.ok(JSON.stringify(preserved).includes('/var/tmp/private/sample.tif'));
  for(const text of ['https://private.example/path','file:///var/tmp/private/sample.tif']){const input={...s,research_question:{...s.research_question,text}},before=structuredClone(input.research_question);assert.throws(()=>offlineContext(f.root,input,id(83)),/limited URL or local path pattern/);assert.deepEqual(input.research_question,before,'refused text must also be retained verbatim');}

 }finally{f.close();}
});

test('offline original envelopes recover lost staging/acceptance replies and a fenced late response cannot stage later',()=>researchPanel(async h=>{
 const {packet,response}=await offlineFixture(h),base=originalLeadCommand(h.panel,{});delete base.lead_draft;Object.assign(base,{action:'stage-offline-candidate',lead_id:response.candidate_id,offline_binding:packet.binding,offline_response:response});
 await h.work(base.action,base);const revision=h.panel.state().state_revision;
 const dup=await h.work(base.action,base);assert.equal(dup.data.research_lead_update.state,'applied');assert.equal(dup.data.research_lead_update.duplicate_transport_receipt,true);assert.equal(h.panel.state().state_revision,revision);assert.equal((await h.work('resolve-research-lead-update',{original_update:base})).data.research_lead_update.state,'applied');
 const check=await offlineRead(h,'/api/offline-review?lead_id='+response.candidate_id),accept=originalLeadCommand(h.panel,{});delete accept.lead_draft;Object.assign(accept,{action:'accept-offline-candidate',lead_id:response.candidate_id,offline_response:response,offline_review:check.data.review});await h.work(accept.action,accept);assert.equal((await h.work('resolve-research-lead-update',{original_update:accept})).data.research_lead_update.state,'applied');assert.equal(h.panel.state().research_leads.entries.length,1);
 const next=await offlineRead(h,'/api/offline-context?context_id='+id(95)),{syntheticOfflineResponse}=await import('../ui/image-panel/offline-research.mjs'),second=syntheticOfflineResponse(next.data.binding,id(96)),late=originalLeadCommand(h.panel,{});delete late.lead_draft;Object.assign(late,{action:'stage-offline-candidate',lead_id:second.candidate_id,offline_binding:next.data.binding,offline_response:second});
 const origin=h.panel.url.split('/#')[0],raw=JSON.stringify(late),cut=Math.floor(raw.length/2);let finish;
 const pending=new Promise((resolve,reject)=>{const req=http.request(origin+'/api/workspace',{method:'POST',headers:{'X-Panel-Token':h.panel.token,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),Connection:'close'}},res=>{let text='';res.setEncoding('utf8');res.on('data',v=>text+=v);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});req.on('error',reject);req.write(raw.slice(0,cut));finish=()=>req.end(raw.slice(cut));});
 try{assert.equal((await h.work('resolve-research-lead-update',{original_update:late})).data.research_lead_update.state,'not_present_fenced');}finally{finish();}
 assert.equal((await pending).status,409);assert.equal(h.panel.state().research_offline.entries.length,1);assert.equal(h.panel.state().research_leads.entries.length,1);
}));
