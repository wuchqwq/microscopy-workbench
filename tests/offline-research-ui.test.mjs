// Actual UI handlers with controlled local responses; not model/GUI qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ResearchLeadsUI} from '../ui/image-panel/research-leads-ui.mjs';
import {DataProbes} from '../ui/image-panel/data-probes.mjs';
import {syntheticOfflineResponse,readOfflineResearch,readOfflineResponse,offlineLead} from '../ui/image-panel/offline-research.mjs';
const id=n=>n.toString(16).padStart(32,'0'),q={version:1,text:'Synthetic spread question',context_object_id:id(1),frame_object_id:id(2),recorded_utc:'2026-11-06T20:00:00.000Z'};
const ref={result_id:id(3),request_id:'saved-statistic',input_view_id:id(1),frame_id:id(2),manifest_sha256:'a'.repeat(64),input_manifest_sha256:'b'.repeat(64),statistics_sha256:'c'.repeat(64)};
const binding={context_id:id(4),question:q,view_id:id(1),view_sha256:'b'.repeat(64),question_context_sha256:'b'.repeat(64),frame_id:id(2),frame_sha256:'d'.repeat(64),scope_sha256:'e'.repeat(64),references:[ref],lease:{panel_id:id(5),session_id:'f'.repeat(16),helper_id:null,generation:0,state:1,draft:0,collection:0,working:1}};
class Element {children=[];value='';textContent='';listeners={};open=false;checked=false;focus(){}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=[...n];}setAttribute(){}addEventListener(n,f){this.listeners[n]=f;}showModal(){this.open=true;}close(){this.open=false;}}
function setup(){
 const nodes=new Map(),el=n=>{if(!nodes.has(n))nodes.set(n,new Element());return nodes.get(n);};let state={object:{object_id:id(1)},research_question:q,frame_identity:{frame_object_id:id(2)}},allowed=true,counter=20,commitMode='normal',deferred=null,commits=[];const errors=[];
 const paint=()=>ui.render(state,!allowed),options={document:{getElementById:el,createElement:()=>new Element()},getState:()=>structuredClone(state),allowEdit:()=>allowed,requestId:()=>id(counter++),history:async()=>({entries:[]}),read:async()=>({schema_version:1,read_only:true,object_id:id(1),question:q,leads:(state.research_leads?.entries??[]).map(record=>({record,evidence:record.evidence.map(e=>({...e,validation:'unavailable',observation:null}))}))}),resolve:async()=>({state:'applied',lead_id:commits.at(-1).payload.lead_id,snapshot:state}),navigate:async()=>{throw Error('Offline source inspection must not navigate');},changed:paint,paint,error:e=>errors.push(e),offlineRead:async route=>{
  if(route.startsWith('/api/offline-context'))return deferred?await deferred:{binding};
  if(route.startsWith('/api/offline-source'))return {local_only:true,reference:ref,source_rect_xyxy:[0,0,2,2],statistics:{mean:5},png_base64:'iVBORw0KGgo='};
  if(route.startsWith('/api/offline-review')){if(state.research_question.text!==q.text)throw Error('Original context changed');return {original_binding:binding,review:{scope_sha256:binding.scope_sha256,lease:binding.lease},observations:[]};}
 },commit:async(action,payload)=>{commits.push({action,payload});if(commitMode==='lost')throw Error('Controlled lost reply');if(commitMode==='refused')return {state:'not_applied',lead_id:payload.lead_id,reason:'Controlled stale context'};
  if(action==='stage-offline-candidate')state={...state,research_offline:{version:1,entries:[{binding:payload.offline_binding,response:payload.offline_response,status:'pending',accepted_draft:null,rejection_note:null}]}};
  if(action==='accept-offline-candidate'){const draft=offlineLead(payload.offline_response,binding);state.research_leads={version:1,entries:[{...draft,created_utc:q.recorded_utc}]};state.research_offline.entries[0]={...state.research_offline.entries[0],status:'accepted',accepted_draft:draft};}
  if(action==='reject-offline-candidate')state.research_offline.entries[0]={...state.research_offline.entries[0],status:'rejected',rejection_note:payload.withdrawal_note};
  return {state:'applied',lead_id:payload.lead_id??payload.lead_draft?.lead_id};}};
 const ui=new ResearchLeadsUI(options);paint();return {ui,el,errors,commits,paint,state:()=>state,setAllowed:v=>{allowed=v;paint();},setMode:v=>commitMode=v,setDeferred:v=>deferred=v,seed:response=>{state.research_offline={version:1,entries:[{binding,response,status:'pending',accepted_draft:null,rejection_note:null}]};paint();},reviseQuestion:()=>{state.research_question={...q,text:'Changed question'};paint();}};
}
const button=(host,text)=>host.children.flatMap(c=>c.children).find(b=>b.textContent===text);

const statisticsEntry=(reference=ref)=>({object_id:reference.result_id,request_id:reference.request_id,input_object_id:reference.input_view_id,frame_object_id:reference.frame_id,manifest_sha256:reference.manifest_sha256,input_manifest_sha256:reference.input_manifest_sha256,statistics_sha256:reference.statistics_sha256,source_rect_xyxy:[0,0,2,2],statistics:{sample_count:4,mean:5,stddev:1}});
const statisticsHistory=entries=>({object_id:id(1),frame_object_id:id(2),entries,total:entries.length});

function statisticsHandoff(h){
 new DataProbes({document:h.ui.options.document,getState:()=>h.state(),readStatisticsHistory:async()=>({schema_version:1,read_only:true,scope:'same_frame_source_pixels',...statisticsHistory([statisticsEntry()])}),useStatistics:(reference,objectId)=>h.ui.open(reference,objectId),onError:e=>h.errors.push(e.message)});
 const find=(e,text)=>e.textContent===text?e:e.children.map(c=>find(c,text)).find(Boolean);
 return async()=>{await h.el('open-statistics-history').onclick();return find(h.el('statistics-history-rows'),'用于当前研究问题整理线索');};
}

test('handoff failure returns to visible history with its cause and reselect action, never a blank editor',async()=>{
 for(const kind of ['reference','read']){const h=setup(),open=statisticsHandoff(h);h.ui.options.history=async()=>{if(kind==='read')throw Error('Stored statistics cannot be read');return statisticsHistory([statisticsEntry({...ref,manifest_sha256:'0'.repeat(64)})]);};
  const action=await open();await action.onclick();assert.equal(h.el('research-lead-dialog').open,false,kind);assert.equal(h.el('statistics-history-dialog').open,true,kind);assert.equal(h.ui.unsettled,false,kind);assert.equal(action.disabled,false);
  assert.match(h.el('statistics-history-status').textContent,kind==='read'?/Stored statistics cannot be read/:/原统计引用缺失或内容已改变/);assert.match(h.el('statistics-history-status').textContent,/重新选择/);assert.equal(h.errors.length,1);assert.equal(h.commits.length,0);
 }
});

test('handoff keeps loading distinct from editing and opens the exact valid draft only after qualification',async()=>{
 const h=setup(),open=statisticsHandoff(h);let finish;h.ui.options.history=()=>new Promise(r=>finish=r);const action=await open(),pending=action.onclick();
 assert.equal(h.el('lead-create-fields').hidden,true);assert.equal(h.el('apply-research-lead').hidden,true);finish(statisticsHistory([statisticsEntry()]));await pending;
 assert.equal(h.el('statistics-history-dialog').open,false);assert.equal(h.el('research-lead-dialog').open,true);assert.equal(h.el('lead-create-fields').hidden,false);assert.equal(h.el('apply-research-lead').hidden,false);assert.equal(h.el('lead-evidence-choices').children[0].children[0].children[0].checked,true);assert.equal(h.commits.length,0);
});

test('late failed handoff cannot close or overwrite a cancelled-and-reopened editor or its history',async()=>{
 const h=setup(),open=statisticsHandoff(h);let rejectOld;h.ui.options.history=()=>new Promise((_,reject)=>rejectOld=reject);const action=await open(),pending=action.onclick();
 await h.el('cancel-research-lead').onclick();h.ui.options.history=async()=>statisticsHistory([statisticsEntry()]);await h.ui.open(ref,id(1));h.el('lead-hypothesis').value='New draft must survive';const status=h.el('lead-editor-status').textContent;
 rejectOld(Error('OLD read failure'));await pending;assert.equal(h.el('research-lead-dialog').open,true);assert.equal(h.el('lead-hypothesis').value,'New draft must survive');assert.equal(h.el('lead-editor-status').textContent,status);assert.equal(h.el('statistics-history-dialog').open,true);assert.equal(h.errors.length,0);assert.equal(h.commits.length,0);await h.el('cancel-research-lead').onclick();
});

test('manual history failure is visible inside its editor and preserves typed input until explicit cancel',async()=>{
 const h=setup();let rejectRead;h.ui.options.history=()=>new Promise((_,reject)=>rejectRead=reject);const pending=h.ui.open();h.el('lead-hypothesis').value='Keep manually typed hypothesis';rejectRead(Error('Current history read failed'));
 await assert.rejects(pending,/Current history read failed/);assert.equal(h.el('research-lead-dialog').open,true);assert.match(h.el('lead-editor-status').textContent,/Current history read failed/);assert.equal(h.el('lead-hypothesis').value,'Keep manually typed hypothesis');assert.equal(h.commits.length,0);await h.el('cancel-research-lead').onclick();assert.equal(h.ui.unsettled,false);
});

test('specified statistics becomes a researcher draft with exact old reference even outside the latest32',async()=>{
 const h=setup(),entries=[statisticsEntry(),...Array.from({length:34},(_,n)=>statisticsEntry({...ref,result_id:id(100+n),request_id:'later-'+n}))],before=JSON.stringify(entries);h.ui.options.history=async()=>statisticsHistory(entries);
 await h.ui.open(ref,id(1));const cards=h.el('lead-evidence-choices').children;assert.equal(cards.length,32);assert.equal(cards[0].children[0].children[0].checked,true);assert.ok(cards.slice(1).every(c=>!c.children[0].children[0].checked));assert.equal(h.el('lead-proposer').value,'researcher');assert.match(h.el('lead-editor-status').textContent,/预选指定统计/);
 h.el('lead-hypothesis').value='Description to examine, not a model result';h.el('lead-unknowns').value='Image formation remains unknown';h.el('lead-next-step').value='Inspect comparable windows';cards[0].children[1].value='unknown';cards[0].children[2].value='Use this exact original window; relation is not yet established';
 await h.el('apply-research-lead').onclick();assert.equal(h.errors.length,0,h.errors.join());assert.equal(h.commits.length,1);assert.equal(h.commits[0].action,'create-research-lead');assert.deepEqual(h.commits[0].payload.lead_draft.evidence[0].reference,ref);assert.equal(h.commits[0].payload.lead_draft.proposed_by,'researcher');assert.equal(JSON.stringify(entries),before);
});

test('specified statistics refuses changed hashes, cross-frame and stale source; existing guards and cancel remain',async()=>{
 for(const kind of ['hash','frame','source','blocked','unknown']){const h=setup();h.ui.options.history=async()=>statisticsHistory([statisticsEntry()]);
  if(kind==='blocked')h.setAllowed(false);if(kind==='unknown')h.ui.phase='unknown';
  await assert.rejects(h.ui.open(kind==='hash'?{...ref,manifest_sha256:'0'.repeat(64)}:kind==='frame'?{...ref,frame_id:id(99)}:ref,kind==='source'?id(99):id(1)));
  assert.equal(h.commits.length,0,kind);assert.equal(h.el('lead-evidence-choices').children.some(c=>c.children[0].children[0].checked),false,kind);
 }
 const h=setup();let finish;h.ui.options.history=()=>new Promise(r=>finish=r);const reading=h.ui.open(ref,id(1));await h.el('cancel-research-lead').onclick();finish(statisticsHistory([statisticsEntry()]));await reading;assert.equal(h.ui.unsettled,false);assert.equal(h.commits.length,0);
 const changed=setup();let release;changed.ui.options.history=()=>new Promise(r=>release=r);const pending=changed.ui.open(ref,id(1));changed.reviseQuestion();release(statisticsHistory([statisticsEntry()]));await assert.rejects(pending,/问题或历史上下文/);assert.equal(changed.commits.length,0);
});
test('offline forms preserve the original response and exact references while editing relationships and inspecting source',async()=>{
 const h=setup();await h.el('offline-research-entry').onclick();assert.equal(h.ui.unsettled,true);assert.match(h.el('lead-question-binding').textContent,/未调用 AI/);assert.match(h.el('lead-editor-status').textContent,/未自动附带源文件路径字段/);assert.match(h.el('lead-editor-status').textContent,/自由问题或其他自由文本仍可能含路径或敏感内容/);assert.match(h.el('lead-editor-status').textContent,/简单模式检查不全面/);assert.match(h.el('lead-editor-status').textContent,/当前不发送且不接真实模型/);assert.match(h.el('lead-editor-status').textContent,/准确发送预览并审查自由文本/);await h.el('offline-generate').onclick();const response=JSON.parse(h.el('offline-response').value);assert.equal(response.origin,'offline_synthetic_demo_not_model_output');await h.el('apply-research-lead').onclick();assert.equal(h.ui.unsettled,false);assert.equal(h.state().research_leads,undefined);
 await button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.el('offline-hypothesis').value='Researcher-edited synthetic suggestion';h.el('offline-hypothesis').oninput();h.el('offline-unknowns').value='Contrast mechanism remains unknown';h.el('offline-next-step').value='Plan to inspect the saved window';const card=h.el('offline-evidence-cards').children[0];card.children[2].value='opposes';card.children[2].oninput();card.children[3].value='The existing spread opposes this tentative description';card.children[3].oninput();const input=h.el('offline-hypothesis').value;
 await h.el('offline-editor-sources').children[0].onclick();assert.equal(h.el('offline-source-dialog').open,true);assert.match(h.el('offline-source-info').textContent,/"mean": 5/);assert.equal(h.el('offline-hypothesis').value,input);assert.equal(card.children[2].value,'opposes');assert.equal(h.ui.unsettled,true);await h.el('offline-source-close').onclick();assert.equal(h.el('research-lead-dialog').open,true);
 await h.el('apply-research-lead').onclick();assert.equal(h.errors.length,0,h.errors.join());assert.equal(h.state().research_offline.entries[0].status,'accepted');assert.deepEqual(h.state().research_offline.entries[0].response,response);const accepted=h.state().research_leads.entries[0];assert.match(accepted.hypothesis,/离线合成演示/);assert.match(accepted.hypothesis,/Researcher-edited/);assert.deepEqual(accepted.evidence,[{reference:ref,relation:'opposes',note:'The existing spread opposes this tentative description'}]);assert.equal(accepted.unknowns,'Contrast mechanism remains unknown');assert.equal(accepted.next_step,'Plan to inspect the saved window');
});
test('offline UI cancel and late context do not create candidates; guards block direct entry; lost write cannot be retried or cancelled',async()=>{
 const h=setup();h.setAllowed(false);await h.el('offline-research-entry').onclick();assert.equal(h.ui.unsettled,false);h.setAllowed(true);let finish;h.setDeferred(new Promise(r=>finish=r));const pending=h.el('offline-research-entry').onclick();await h.el('cancel-research-lead').onclick();finish({binding});await pending;assert.equal(h.ui.unsettled,false);assert.equal(h.commits.length,0);h.setDeferred(null);
 await h.el('offline-research-entry').onclick();await h.el('offline-generate').onclick();h.setMode('lost');await h.el('apply-research-lead').onclick();assert.equal(h.ui.phase,'unknown');await h.el('apply-research-lead').onclick();await h.el('cancel-research-lead').onclick();assert.equal(h.ui.unsettled,true);assert.equal(h.commits.length,1);assert.equal(h.el('check-research-lead').hidden,false);
});
test('offline no-evidence suggestions stay pending, cannot bypass the formal lead contract, and can be rejected',async()=>{
 const h=setup(),response=syntheticOfflineResponse(binding,id(40),false);h.seed(response);await button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();await h.el('apply-research-lead').onclick();assert.equal(h.commits.length,0);assert.equal(h.state().research_offline.entries[0].status,'pending');await h.el('cancel-research-lead').onclick();await button(h.el('offline-candidates'),'拒绝此离线候选').onclick();h.el('lead-withdrawal-note').value='No evidence; reject demo';await h.el('apply-research-lead').onclick();assert.equal(h.state().research_offline.entries[0].status,'rejected');assert.equal(h.state().research_leads,undefined);
});
test('offline format rejects impersonation, changed identity, forged/cross-frame references and oversized text',()=>{
 const response=syntheticOfflineResponse(binding,id(41));for(const bad of [{...response,origin:'authenticated_model'},{...response,context_id:id(99)},{...response,hypothesis:'x'.repeat(1801)},{...response,evidence:[{...response.evidence[0],reference:{...ref,statistics_sha256:'0'.repeat(64)}}]},{...response,evidence:[{...response.evidence[0],reference:{...ref,frame_id:id(99)}}]}])assert.throws(()=>readOfflineResponse(bad,binding));
 assert.throws(()=>readOfflineResearch({version:1,entries:[{binding,response,status:'accepted',accepted_draft:null,rejection_note:null}]}));
});

test('offline pending metadata is hashed without changing legacy content and preserves advisory references',async()=>{
 const {analysisContent}=await import('../lib/analysis_workspace.mjs'),legacy={object_id:id(1),frame_identity:{frame_object_id:id(2)},edit_state:{},window_collection:{}};
 assert.equal(Object.hasOwn(analysisContent(legacy),'research_offline'),false);
 const response=syntheticOfflineResponse(binding,id(60),false),metadata={version:1,entries:[{binding,response,status:'pending',accepted_draft:null,rejection_note:null}]};
 const content=analysisContent({...legacy,research_offline:metadata});assert.deepEqual(content.research_offline,metadata);assert.equal(content.research_offline.entries[0].response.evidence.length,0);
 assert.throws(()=>analysisContent({...legacy,research_offline:{...metadata,entries:[{...metadata.entries[0],status:'accepted'}]}}));
});

test('fenced offline staging keeps the rebuild-only notice and blocks even direct apply until cancel and fresh preparation',async()=>{
 const h=setup();await h.el('offline-research-entry').onclick();await h.el('offline-generate').onclick();const originalId=JSON.parse(h.el('offline-response').value).candidate_id;h.setMode('lost');await h.el('apply-research-lead').onclick();
 h.ui.options.resolve=async()=>({state:'not_present_fenced',lead_id:originalId,snapshot:h.state()});await h.el('check-research-lead').onclick();
 assert.equal(h.ui.phase,'');assert.equal(h.el('apply-research-lead').disabled,true);assert.match(h.el('lead-editor-status').textContent,/取消后重新准备离线上下文/);assert.doesNotMatch(h.el('lead-editor-status').textContent,/可重新编辑后明确应用/);
 await h.el('apply-research-lead').onclick();assert.equal(h.commits.length,1);await h.el('cancel-research-lead').onclick();assert.equal(h.ui.unsettled,false);h.setMode('normal');await h.el('offline-research-entry').onclick();await h.el('offline-generate').onclick();assert.notEqual(JSON.parse(h.el('offline-response').value).candidate_id,originalId);assert.equal(h.el('apply-research-lead').disabled,false);assert.equal(h.commits.length,1);
});

test('offline review text accurately discloses free-text scope without promising a path-free packet',()=>{
 const html=readFileSync(new URL('../ui/image-panel/index.html',import.meta.url),'utf8');assert.match(html,/自由问题或其他自由文本可能含路径或敏感内容/);assert.match(html,/简单模式检查并不全面/);assert.match(html,/当前不发送且不接真实模型/);assert.match(html,/未来外发前必须展示准确发送预览并审查自由文本/);
 const response=syntheticOfflineResponse(binding,id(61));const proposed={...response,hypothesis:'/var/tmp/private/sample.tif'};assert.equal(readOfflineResponse(proposed,binding).hypothesis,proposed.hypothesis);
});

test('original response preview is not an editing channel; form validation stays strict and cancel preserves pending content',async()=>{
 const h=setup();await h.el('offline-research-entry').onclick();await h.el('offline-generate').onclick();const original=JSON.parse(h.el('offline-response').value);assert.equal(h.el('offline-hypothesis').disabled,true);h.el('offline-hypothesis').value='Not an edit before staging';h.el('offline-response').value='{"origin":"forged"}';await h.el('apply-research-lead').onclick();assert.deepEqual(h.state().research_offline.entries[0].response,original);
 await button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.el('offline-hypothesis').value='x'.repeat(1801);await h.el('apply-research-lead').onclick();assert.equal(h.commits.length,1);assert.match(h.errors.at(-1),/oversized/);
 h.el('offline-hypothesis').value='Valid explanation';const card=h.el('offline-evidence-cards').children[0];card.children[3].value='';await h.el('apply-research-lead').onclick();assert.equal(h.commits.length,1);card.children[3].value='Reason';card.children[2].value='confirmed';await h.el('apply-research-lead').onclick();assert.equal(h.commits.length,1);
 await h.el('cancel-research-lead').onclick();assert.deepEqual(h.state().research_offline.entries[0].response,original);assert.equal(h.state().research_offline.entries[0].status,'pending');
 const html=readFileSync(new URL('../ui/image-panel/index.html',import.meta.url),'utf8');assert.match(html,/<textarea id="offline-response"[^>]*readonly/);assert.match(html,/id="offline-hypothesis" maxlength="1800"/);assert.match(html,/同源 A\/B、FFT、相位等不构成独立重复实验/);
});

test('late source review updates readonly summaries without overwriting edited form or surviving cancel',async()=>{
 const h=setup(),original=syntheticOfflineResponse(binding,id(62));h.seed(original);let finish;const read=h.ui.options.offlineRead;h.ui.options.offlineRead=route=>route.startsWith('/api/offline-review')?new Promise(r=>finish=r):read(route);
 const review=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.el('offline-hypothesis').value='Typed while source check pending';h.el('offline-hypothesis').oninput();finish({observations:[{reference:ref,source_rect_xyxy:[1,2,3,4],statistics:{sample_count:4,mean:5,stddev:1,minimum:3,maximum:7}}]});await review;assert.equal(h.el('offline-hypothesis').value,'Typed while source check pending');assert.match(h.el('offline-evidence-cards').children[0].children[1].textContent,/保存窗口 \[1,2,3,4\]/);assert.match(h.el('offline-evidence-cards').children[0].children[1].textContent,/强度单位未声明/);
 await h.el('cancel-research-lead').onclick();const again=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();await h.el('cancel-research-lead').onclick();finish({observations:[]});await again;assert.equal(h.ui.unsettled,false);assert.equal(h.commits.length,0);
});

test('stale offline review failure after cancel and reopen cannot replace the current successful review or report an old error',async()=>{
 const h=setup();h.seed(syntheticOfflineResponse(binding,id(65)));const requests=[],sharedState=h.state();h.ui.options.getState=()=>sharedState;
 h.ui.options.offlineRead=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
 const old=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();await h.el('cancel-research-lead').onclick();
 const current=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();requests[1].resolve({review:'current-success',observations:[]});await current;
 h.el('offline-hypothesis').value='Keep current researcher edits';h.el('offline-hypothesis').oninput();const status=h.el('lead-editor-status').textContent,context=h.el('offline-context').textContent;
 requests[0].reject(Error('Old cancelled review failed'));await old;
 assert.equal(h.el('offline-context').textContent,context);assert.equal(h.el('lead-editor-status').textContent,status);assert.deepEqual(h.errors,[]);assert.equal(h.el('offline-hypothesis').value,'Keep current researcher edits');assert.equal(h.ui.unsettled,true);assert.equal(h.commits.length,0);
});

test('only the latest binding check in an editor may report success or failure, while a current failure remains visible',async()=>{
 // Exercise the read coordinator directly to interleave two checks without
 // inventing a new UI action, retrying a write, or changing the editor binding.
 for(const currentFails of [false,true]){
  const h=setup();h.seed(syntheticOfflineResponse(binding,id(66)));const requests=[];
  h.ui.options.offlineRead=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
  const old=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick(),latest=h.ui.run(()=>h.ui.recheckOfflineBinding());
  h.el('offline-hypothesis').value='Retain this draft';h.el('offline-hypothesis').oninput();
  if(currentFails)requests[1].reject(Error('Current binding check failed'));else requests[1].resolve({review:'latest-success',observations:[]});await latest;
  const context=h.el('offline-context').textContent,status=h.el('lead-editor-status').textContent;
  if(currentFails){assert.match(context,/原绑定未通过当前性核对/);assert.deepEqual(h.errors,['Current binding check failed']);requests[0].resolve({review:'obsolete-success',observations:[]});}
  else{assert.match(context,/latest-success/);assert.match(status,/已明确重新核对原绑定/);requests[0].reject(Error('Obsolete check failed'));}
  await old;assert.equal(h.el('offline-context').textContent,context);assert.equal(h.el('lead-editor-status').textContent,status);assert.deepEqual(h.errors,currentFails?['Current binding check failed']:[]);assert.equal(h.el('offline-hypothesis').value,'Retain this draft');assert.equal(h.commits.length,0);assert.equal(h.state().research_offline.entries[0].status,'pending');
 }
});

test('a pending binding read cannot replace the unknown submission notice with an editable-success notice',async()=>{
 const h=setup();h.seed(syntheticOfflineResponse(binding,id(67)));let finishRead;
 h.ui.options.offlineRead=()=>new Promise(resolve=>finishRead=resolve);
 const reading=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.setMode('lost');await h.el('apply-research-lead').onclick();assert.equal(h.ui.phase,'unknown');const status=h.el('lead-editor-status').textContent;assert.match(status,/应用结果未知/);
 finishRead({review:'pre-submit-success',observations:[]});await reading;
 assert.equal(h.el('lead-editor-status').textContent,status);assert.equal(h.ui.phase,'unknown');assert.equal(h.el('apply-research-lead').disabled,true);assert.equal(h.el('cancel-research-lead').disabled,true);assert.deepEqual(h.errors,['Controlled lost reply']);assert.equal(h.commits.length,1);
});

test('saving and unknown submission states supersede late binding-read success and failure without allowing a retry',async()=>{
 for(const phase of ['saving','unknown'])for(const readFails of [false,true]){
  const h=setup();h.seed(syntheticOfflineResponse(binding,id(68)));const reads=[];let failWrite;
  h.ui.options.offlineRead=()=>new Promise((resolve,reject)=>reads.push({resolve,reject}));
  h.ui.options.commit=(action,payload)=>{h.commits.push({action,payload});return new Promise((_resolve,reject)=>failWrite=reject);};
  const reading=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.el('offline-hypothesis').value='Keep draft while submitting';h.el('offline-hypothesis').oninput();
  const applying=h.el('apply-research-lead').onclick();assert.equal(h.ui.phase,'saving');assert.match(h.el('lead-editor-status').textContent,/正在提交提议/);
  if(phase==='unknown'){failWrite(Error('Controlled write timeout'));await applying;assert.match(h.el('lead-editor-status').textContent,/应用结果未知/);}
  const status=h.el('lead-editor-status').textContent,context=h.el('offline-context').textContent,errors=[...h.errors];
  await h.ui.recheckOfflineBinding();assert.equal(reads.length,1,'submission must not start another binding read');
  if(readFails)reads[0].reject(Error('Late readonly failure'));else reads[0].resolve({review:'late-read-success',observations:[]});await reading;
  assert.equal(h.ui.phase,phase);assert.equal(h.el('lead-editor-status').textContent,status);assert.equal(h.el('offline-context').textContent,context);assert.deepEqual(h.errors,errors);assert.equal(h.el('offline-hypothesis').value,'Keep draft while submitting');assert.equal(h.el('offline-hypothesis').disabled,true);assert.equal(h.el('check-research-lead').hidden,phase!=='unknown');
  await h.el('apply-research-lead').onclick();await h.el('cancel-research-lead').onclick();assert.equal(h.commits.length,1);assert.equal(h.ui.unsettled,true);
  if(phase==='saving'){failWrite(Error('Controlled write timeout'));await applying;assert.equal(h.ui.phase,'unknown');assert.match(h.el('lead-editor-status').textContent,/应用结果未知/);}
  assert.deepEqual(h.errors,['Controlled write timeout']);assert.equal(h.state().research_offline.entries[0].status,'pending');
 }
});

test('a known not-applied write does not revive pre-submit binding reads; a fresh editing check still reports normally',async()=>{
 for(const readFails of [false,true]){
  const h=setup();h.seed(syntheticOfflineResponse(binding,id(69)));const reads=[];
  h.ui.options.offlineRead=()=>new Promise((resolve,reject)=>reads.push({resolve,reject}));
  const reading=button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.setMode('refused');await h.el('apply-research-lead').onclick();assert.equal(h.ui.phase,'');const status=h.el('lead-editor-status').textContent;assert.match(status,/未应用/);
  if(readFails)reads[0].reject(Error('Pre-submit failure'));else reads[0].resolve({review:'pre-submit-success',observations:[]});await reading;assert.equal(h.el('lead-editor-status').textContent,status);assert.deepEqual(h.errors,[]);assert.equal(h.el('offline-hypothesis').disabled,false);
  const fresh=h.ui.run(()=>h.ui.recheckOfflineBinding());reads[1].resolve({review:'fresh-after-not-applied',observations:[]});await fresh;assert.match(h.el('offline-context').textContent,/fresh-after-not-applied/);assert.match(h.el('lead-editor-status').textContent,/已明确重新核对原绑定/);assert.equal(h.commits.length,1);
 }
});

test('form changes cannot bypass busy/unknown guards or rebind an old candidate after question revision',async()=>{
 const h=setup(),original=syntheticOfflineResponse(binding,id(63));h.seed(original);await button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.setAllowed(false);assert.equal(h.el('offline-hypothesis').disabled,true);assert.equal(h.el('offline-evidence-cards').children[0].children[2].disabled,true);await h.el('apply-research-lead').onclick();assert.equal(h.commits.length,0);h.setAllowed(true);h.setMode('lost');await h.el('apply-research-lead').onclick();assert.equal(h.ui.phase,'unknown');assert.equal(h.el('offline-next-step').disabled,true);await h.el('apply-research-lead').onclick();await h.el('cancel-research-lead').onclick();assert.equal(h.commits.length,1);assert.equal(h.ui.unsettled,true);
 const stale=setup();stale.seed(original);stale.reviseQuestion();await button(stale.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();assert.match(stale.el('offline-context').textContent,/原绑定未通过当前性核对/);assert.deepEqual(stale.state().research_offline.entries[0].binding,binding);await stale.el('cancel-research-lead').onclick();assert.equal(stale.state().research_offline.entries[0].status,'pending');
});

test('a researcher can explicitly include an originally omitted bound observation without rewriting the original response',async()=>{
 const h=setup(),original=syntheticOfflineResponse(binding,id(64),false);h.seed(original);const reject=button(h.el('offline-candidates'),'拒绝此离线候选');await button(h.el('offline-candidates'),'核对来源并编辑 / 接受').onclick();h.el('offline-hypothesis').value='Explicit researcher interpretation';await reject.onclick();assert.equal(h.el('offline-hypothesis').value,'Explicit researcher interpretation');assert.equal(h.el('lead-withdraw-fields').hidden,true);
 const card=h.el('offline-evidence-cards').children[0];assert.equal(card.children[0].children[0].checked,false);card.children[0].children[0].checked=true;card.children[3].value='Explicitly include this saved observation as an unknown relationship';await h.el('apply-research-lead').onclick();assert.equal(h.state().research_offline.entries[0].status,'accepted');assert.deepEqual(h.state().research_offline.entries[0].response,original);assert.deepEqual(h.state().research_leads.entries[0].evidence[0].reference,ref);
 const text=n=>String(n.textContent??'')+' '+n.children.map(text).join(' '),visible=text(h.el('offline-candidates'));assert.match(visible,/研究者已接纳稿/);assert.match(visible,/原始响应未列证据；接纳稿中的引用和关系由研究者明确提出/);assert.doesNotMatch(visible,/不能接受为正式线索/);
});
