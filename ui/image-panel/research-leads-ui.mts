import {readOfflineResearch,readOfflineBinding,readOfflineResponse,syntheticOfflineResponse,offlineLead,OFFLINE_WARNING} from './offline-research.mjs';
import type {OfflineBinding,OfflineCandidate,OfflineResponse} from './offline-research.mjs';
import {readLeadDraft,readResearchLeads,referenceFromStatistics,statisticsReference,sameResearchValue} from './research-leads.mjs';
import {readResearchQuestion} from './research-question.mjs';
import type {LeadDraft,ResearchLead,StatisticsReference} from './research-leads.mjs';
import type {PanelRoiSnapshot} from './roi-observations.mjs';
import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
export type StatisticsResultIdentity=Omit<StatisticsReference,'input_view_id'>&{input_view_id?:string};
// Resolve the actual saved input from history; a frame ID is never guessed to
// be an input-view ID. No result or model interpretation is created/adopted.
export function matchStatisticsResult(entries:unknown,identity:StatisticsResultIdentity):StatisticsReference {
 if(!Array.isArray(entries)||entries.length>512)throw Error('原统计清单不可核对。');
 const {input_view_id:expectedInput,...expectedResult}=identity;
 const matches=entries.map(referenceFromStatistics).filter(reference=>{const {input_view_id,...result}=reference;return (expectedInput===undefined||input_view_id===expectedInput)&&sameResearchValue(result,expectedResult);});
 if(matches.length!==1)throw Error('准确原统计缺失、变化或不唯一；不替代、不重算。');
 return matches[0];
}
interface Options {
 document:BrowserDocument;getState:()=>PanelRoiSnapshot;allowEdit:()=>boolean;requestId:()=>string;
 offlineRead?:(route:string)=>Promise<unknown>;history:()=>Promise<unknown>;read:()=>Promise<unknown>;resolve:()=>Promise<{state:string;lead_id:string;snapshot:PanelRoiSnapshot}>;
 commit:(action:string,payload:Row)=>Promise<{state:string;reason?:string;lead_id:string}>;
 statistics?:(reference:StatisticsReference)=>Promise<void>;
 navigate:(id:string)=>Promise<void>;changed:()=>void;paint:()=>void;error:(text:string)=>void;
}
export class ResearchLeadsUI {
 dirty=false;phase:''|'saving'|'unknown'='';private context:PanelRoiSnapshot|null=null;private mode:'create'|'withdraw'|'offline-stage'|'offline-accept'|'offline-reject'='create';private withdrawalId='';private draftId='';
 private attempted:LeadDraft|null=null;private attemptedWithdrawal='';private choices:{entry:Row;check:BrowserElement;relation:BrowserElement;note:BrowserElement}[]=[];
 private offlineRebuild=false;private offlineBinding:OfflineBinding|null=null;private offlineId='';private sourceGeneration=0;private offlineReviewGeneration=0;
 private offlineOriginal:OfflineResponse|null=null;
 private offlineChoices:{reference:StatisticsReference;check:BrowserElement;relation:BrowserElement;note:BrowserElement;summary:BrowserElement}[]=[];
 private traceDetails=new Map<string,BrowserElement>();
 private signature='';private cardSignature='';private resolved=new Map<string,Row>();private refreshGeneration=0;private openGeneration=0;private opened=false;private checking=false;
 constructor(private readonly options:Options){
  this.el('offline-research-entry').onclick=()=>this.run(()=>this.openOffline());
  this.el('offline-generate').onclick=()=>this.run(()=>{if(!this.opened||!this.options.allowEdit()||!this.offlineBinding||this.mode!=='offline-stage'||this.phase||this.offlineRebuild)return;this.fillOfflineForm(syntheticOfflineResponse(this.offlineBinding,this.offlineId,!this.el('offline-without-evidence').checked));this.dirty=true;options.changed();});
  for(const id of ['offline-hypothesis','offline-unknowns','offline-next-step'])this.el(id).oninput=()=>this.editOfflineForm();
  this.el('offline-source-close').onclick=()=>this.el('offline-source-dialog').close();
  this.el('open-research-lead').onclick=()=>this.run(()=>this.open());
  this.el('refresh-research-leads').onclick=()=>this.run(()=>this.refresh());
  for(const id of ['lead-hypothesis','lead-proposer','lead-unknowns','lead-next-step','lead-withdrawal-note'])this.el(id).oninput=()=>{if(this.phase)return;this.dirty=true;options.changed();};
  this.el('cancel-research-lead').onclick=()=>{if(this.phase)return;this.reset();};
  this.el('research-lead-dialog').addEventListener('cancel',event=>{event.preventDefault();if(!this.phase)this.reset();});
  this.el('apply-research-lead').onclick=()=>this.run(()=>this.apply());
  this.el('check-research-lead').onclick=()=>this.run(()=>this.check());
 }
 get unsettled(){return this.opened||this.dirty||Boolean(this.phase);}
 private el(id:string){return this.options.document.getElementById(id)!;}
 private node(tag:string,text?:unknown){const n=this.options.document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;}
 private async run(fn:()=>unknown){try{await fn();}catch(e){this.options.error((e as Error).message);}}
 private status(text:string){this.el('lead-editor-status').textContent=text;}
 private reset(){this.dirty=false;this.phase='';this.opened=false;this.context=null;this.attempted=null;this.offlineBinding=null;this.offlineOriginal=null;this.offlineChoices=[];this.offlineRebuild=false;this.sourceGeneration++;this.offlineReviewGeneration++;this.openGeneration++;this.el('apply-research-lead').hidden=false;this.el('research-lead-dialog').close();this.options.changed();}
 async openPublicResult(identity:StatisticsResultIdentity){
  identity={...identity};
  if(this.unsettled||!this.options.allowEdit())throw Error('先处理研究输入、来源或原请求，再整理原统计。');
  const state=this.options.getState(),question=readResearchQuestion(state.research_question);
  if(!question||question.frame_object_id!==identity.frame_id||row(state.frame_identity).frame_object_id!==identity.frame_id)throw Error('先应用同一公开源帧的本地研究问题；不会自动采用模型问题。');
  const binding=(s:PanelRoiSnapshot)=>[s.object.object_id,s.frame_identity,s.panel_id,s.helper_session_id,s.panel_generation,s.state_revision,s.edit_state,s.selection,s.research_question],expected=JSON.parse(JSON.stringify(binding(state)));
  const history=row(await this.options.history());
  if(this.unsettled||!this.options.allowEdit()||!sameResearchValue(expected,binding(this.options.getState()))||history.schema_version!==1||history.read_only!==true||history.scope!=='same_frame_source_pixels'||history.object_id!==state.object.object_id||history.frame_object_id!==identity.frame_id)throw Error('问题或来源在核对期间改变；原输入保留。');
  const reference=matchStatisticsResult(history.entries,identity);if(reference.input_view_id!==(identity.input_view_id??identity.frame_id))throw Error('原统计输入不符合公开会话明确绑定的输入；旧结果仅接受原 raw 帧，不推测显示身份。');
  // Keep the original public handoff binding through the editor's second read.
  return this.open(reference,state.object.object_id,current=>sameResearchValue(expected,binding(current)));
 }
 async open(selected?:StatisticsReference,contextObjectId?:string,bindingCurrent?:(state:PanelRoiSnapshot)=>boolean){
  if(this.unsettled||!this.options.allowEdit())throw Error('先处理当前研究输入、恢复或来源状态，再整理线索。');
  const state=this.options.getState(),question=readResearchQuestion(state.research_question);
  if(!question||question.frame_object_id!==row(state.frame_identity).frame_object_id)throw Error('先应用同一源帧的研究问题；不要求先画 ROI。');
  if(selected){selected=statisticsReference(selected);if(contextObjectId!==state.object.object_id||selected.frame_id!==question.frame_object_id)throw Error('统计来源或当前图像已改变；不自动改绑到当前问题。');}
  this.el('offline-fields').hidden=true;this.el('apply-research-lead').textContent='应用解释提议';
  this.context=state;this.mode='create';this.draftId=this.options.requestId();this.choices=[];this.opened=true;
  const generation=++this.openGeneration,currentEditor=()=>this.opened&&this.mode==='create'&&this.context===state&&this.openGeneration===generation&&!this.phase;
  this.el('lead-create-fields').hidden=Boolean(selected);this.el('apply-research-lead').hidden=Boolean(selected);this.el('lead-withdraw-fields').hidden=true;this.el('lead-question-binding').textContent='绑定问题：'+question.text+' · 提问图 '+question.context_object_id;
  for(const id of ['lead-hypothesis','lead-unknowns','lead-next-step'])this.el(id).value='';
  this.el('lead-proposer').value='researcher';this.el('lead-evidence-choices').replaceChildren();this.el('research-lead-dialog').showModal();this.status('只读核对同帧已有统计；不计算。');this.options.changed();
  try{
  const history=row(await this.options.history());
  if(!currentEditor())return false;
  const current=this.options.getState();
  if(!this.options.allowEdit()||bindingCurrent&&!bindingCurrent(current)||current.object.object_id!==state.object.object_id||!sameResearchValue(this.context?.research_question,current.research_question)||history.object_id!==state.object.object_id||history.frame_object_id!==question.frame_object_id||!Array.isArray(history.entries))throw Error('问题或历史上下文已改变；未开始整理，可取消后重开。');
  let available=history.entries.slice(-32);
  if(selected){const chosen=history.entries.find(raw=>sameResearchValue(referenceFromStatistics(raw),selected));if(!chosen)throw Error('原统计引用缺失或内容已改变；不能用另一条结果替代。');available=[chosen,...available.filter(raw=>row(raw).object_id!==selected!.result_id)].slice(0,32);}
  for(const raw of available){
   const entry=row(raw),reference=referenceFromStatistics(entry);const box=this.node('section'),check=this.node('input');check.setAttribute('type','checkbox');check.checked=Boolean(selected&&sameResearchValue(selected,reference));const stats=row(entry.statistics),names=Array.isArray(entry.matching_input_annotations)?entry.matching_input_annotations.map(v=>row(v).name).join(' / '):'';
   const label=this.node('label');label.append(check,this.node('span',String(names||entry.object_id)+' · ROI '+JSON.stringify(entry.source_rect_xyxy)+' · n='+stats.sample_count+' · 均值 '+stats.mean+' · 标准差 '+stats.stddev+' · 强度单位未声明'));
   const relation=this.node('select');relation.setAttribute('aria-label','提议关系（必填）：'+String(names||entry.object_id));for(const [v,t]of [['','请选择提议关系'],['supports','支持此假设（提议）'],['opposes','反对此假设（提议）'],['unknown','与假设关系未知（提议）']]){const o=this.node('option',t);o.value=v;relation.append(o);}
   const note=this.node('textarea');note.setAttribute('aria-label','关系理由（必填）：'+String(names||entry.object_id));note.maxLength=1000;note.setAttribute('placeholder','说明这条结果怎样参与判断；单条统计不独立证明成因。');
   for(const n of [check,relation,note]){n.oninput=()=>{if(this.phase)return;this.dirty=true;this.options.changed();};}
   box.append(label,relation,note,this.node('small','结果 '+entry.object_id+' · 原请求 '+entry.request_id+' · 原图输入 '+entry.input_object_id));this.el('lead-evidence-choices').append(box);this.choices.push({entry,check,relation,note});
  }
  this.el('lead-create-fields').hidden=false;this.el('apply-research-lead').hidden=false;
  if(selected)this.dirty=true;
  this.status(this.choices.length?(selected?'已核对并预选指定统计；仍需填写假设、关系与理由，不自动解释。展示指定结果及最近记录 ':'展示最近 ')+this.choices.length+' 条 / 历史共 '+String(history.total??'未知')+' 条（候选最多 32 条；未显示不代表不存在）。选择 1–8 条，明确关系与理由；都是提议，不是自动验证。':'没有可核对的统计；不能编造证据。可取消并继续其它工具。');this.options.paint();
  return true;
  }catch(error){
   if(!currentEditor())return false;
   if(selected)this.reset();else{this.status('统计读取未完成：'+(error as Error).message+'；输入保留，请取消后重新打开核查。');this.options.paint();}
   throw error;
  }
 }
 private async apply(){
  if(!this.opened||this.phase)return;if(!this.options.allowEdit())throw Error('当前编辑、恢复或来源状态不允许应用；输入保留。');
  let payload:Row;
  if(this.mode.startsWith('offline-')){
   if(this.offlineRebuild)throw Error('原离线上下文版本已封存；取消后重新准备，不重发旧上下文。');
   if(!this.offlineBinding)throw Error('缺少原离线上下文；输入保留。');
   if(this.mode==='offline-reject'){const note=this.el('lead-withdrawal-note').value;if(!note.trim()||note.length>1000)throw Error('请填写拒绝理由。');payload={lead_id:this.offlineId,withdrawal_note:note};}
   else{if(!this.offlineOriginal)throw Error('请先生成离线演示响应。');const response=this.mode==='offline-stage'?readOfflineResponse(this.offlineOriginal,this.offlineBinding):this.offlineFormResponse();if(response.candidate_id!==this.offlineId)throw Error('候选身份不能编辑；请重新准备上下文。');if(this.mode==='offline-accept')offlineLead(response,this.offlineBinding);payload={lead_id:this.offlineId,offline_response:response,...(this.mode==='offline-stage'?{offline_binding:this.offlineBinding}:{})};}
  }else if(this.mode==='create'){
   this.attempted=readLeadDraft({lead_id:this.draftId,question:this.context?.research_question,proposed_by:this.el('lead-proposer').value,hypothesis:this.el('lead-hypothesis').value,evidence:this.choices.filter(c=>c.check.checked).map(c=>({relation:c.relation.value,note:c.note.value,reference:referenceFromStatistics(c.entry)})),unknowns:this.el('lead-unknowns').value,next_step:this.el('lead-next-step').value});
   if(!sameResearchValue(this.attempted.question,this.options.getState().research_question)||this.attempted.question.frame_object_id!==row(this.options.getState().frame_identity).frame_object_id)throw Error('研究问题已修改；不能把此草稿自动改绑，取消后重新整理。');
   payload={lead_draft:this.attempted};
  }else{this.attemptedWithdrawal=this.el('lead-withdrawal-note').value;if(!this.attemptedWithdrawal.trim()||this.attemptedWithdrawal.length>1000)throw Error('请填写撤回理由（1–1000 字符）。');payload={lead_id:this.withdrawalId,withdrawal_note:this.attemptedWithdrawal};}
  this.offlineReviewGeneration++;this.phase='saving';this.status('正在提交提议；保留输入与原线索 ID，请等待原提交结果，不重复提交。');this.options.changed();
  try{const reply=await this.options.commit(this.mode==='offline-stage'?'stage-offline-candidate':this.mode==='offline-accept'?'accept-offline-candidate':this.mode==='offline-reject'?'reject-offline-candidate':this.mode==='create'?'create-research-lead':'withdraw-research-lead',payload);if(reply.lead_id!==(this.mode.startsWith('offline-')?this.offlineId:this.mode==='create'?this.draftId:this.withdrawalId))throw Error('线索回复身份不匹配；只核对原 ID，不重发。');if(reply.state==='not_applied'){this.phase='';this.status('未应用：'+reply.reason+'；输入保留。');this.options.changed();return;}if(reply.state!=='applied')throw Error('线索应用尚未确认');this.reset();}catch(e){this.phase='unknown';this.status('应用结果未知；保留输入与原线索 ID。核对并封存原提交，不重发写入。');this.options.changed();throw e;}
 }
 private async check(){
  if(this.phase!=='unknown'||this.checking)return;this.checking=true;this.options.paint();
  try{const expected=this.mode.startsWith('offline-')?this.offlineId:this.mode==='create'?this.draftId:this.withdrawalId,reply=await this.options.resolve();
  if(reply.lead_id!==expected)throw Error('原提交身份不匹配；输入保留。');
  if(reply.state==='not_present_fenced'){this.phase='';this.attempted=null;if(this.mode==='create')this.draftId=this.options.requestId();if(this.mode==='offline-stage')this.offlineRebuild=true;this.status(this.offlineRebuild?'原提交已封存；取消后重新准备离线上下文，不重发旧版本。':'原版本已封存，当前无匹配的应用记录；迟到的原请求不能再应用。输入保留，可重新编辑后明确应用，或取消输入。');this.options.changed();return;}
  if(reply.state!=='applied')throw Error('原提交仍未裁定；输入保留，不重发。');
  if(this.mode.startsWith('offline-')){this.reset();return;}
  const records=readResearchLeads(reply.snapshot.research_leads),found=records?.entries.find(e=>e.lead_id===expected);
  if(this.mode==='create'&&found&&this.attempted){const {created_utc,withdrawn_utc,withdrawal_note,...draft}=found;void created_utc;void withdrawn_utc;void withdrawal_note;if(sameResearchValue(draft,this.attempted)){this.reset();return;}}
  if(this.mode==='withdraw'&&found?.withdrawn_utc&&found.withdrawal_note===this.attemptedWithdrawal){this.reset();return;}
  this.status('仍没有与原 ID 和内容一致的确认记录；输入保留，不自动重发。');
  }finally{this.checking=false;this.options.paint();}
 }
 private offlineEditor(mode:'offline-stage'|'offline-accept'|'offline-reject',binding:OfflineBinding|null,ident:string){
  this.offlineReviewGeneration++;this.context=this.options.getState();this.mode=mode;this.offlineRebuild=false;this.offlineBinding=binding;this.offlineId=ident;this.opened=true;this.dirty=false;
  this.offlineOriginal=null;this.offlineChoices=[];this.el('offline-form').hidden=true;this.el('offline-evidence-cards').replaceChildren();
  this.el('lead-create-fields').hidden=true;this.el('lead-withdraw-fields').hidden=mode!=='offline-reject';this.el('offline-fields').hidden=mode==='offline-reject';this.el('offline-generate').hidden=mode!=='offline-stage';this.el('offline-template-choice').hidden=mode!=='offline-stage';this.el('offline-response').value='';this.el('offline-editor-sources').replaceChildren();this.el('offline-context').textContent='正在读取…';this.el('lead-withdrawal-note').value='';
  this.el('lead-question-binding').textContent=OFFLINE_WARNING;this.el('apply-research-lead').textContent=mode==='offline-stage'?'保存为待审候选':mode==='offline-accept'?'接受为演示线索（仍需 Ctrl+S）':'拒绝候选（不改科学结果）';this.el('research-lead-dialog').showModal();this.options.changed();
 }
 private editOfflineForm(){if(!this.opened||this.mode!=='offline-accept'||this.phase||this.offlineRebuild||!this.options.allowEdit())return;this.dirty=true;this.options.changed();}
 private fillOfflineForm(response:OfflineResponse){
  if(!this.offlineBinding)throw Error('缺少原绑定');
  this.offlineOriginal=readOfflineResponse(response,this.offlineBinding);this.el('offline-response').value=JSON.stringify(this.offlineOriginal,null,2);
  this.el('offline-form').hidden=false;this.el('offline-form-heading').textContent=this.mode==='offline-stage'?'原始离线响应预览（只读）':'研究者编辑稿（接受后另存，原始响应不变）';
  this.el('offline-form-instruction').textContent=this.mode==='offline-stage'?'先保存为待审候选，再核查准确来源并编辑研究者稿。此处只预览，不改原始演示响应。':'逐条说明支持、反对或未知的理由；关系是研究者提议，不是自动验证。未勾选的引用不进入接纳稿。取消将放弃本次编辑，保留原待审候选。';
  this.el('offline-hypothesis').value=response.hypothesis;this.el('offline-unknowns').value=response.unknowns;this.el('offline-next-step').value=response.next_step;
  this.offlineChoices=[];const host=this.el('offline-evidence-cards');host.replaceChildren();
  for(const [i,reference]of this.offlineBinding.references.entries()){
   const original=response.evidence.find(e=>sameResearchValue(e.reference,reference)),card=this.node('section'),check=this.node('input');check.setAttribute('type','checkbox');check.checked=Boolean(original);check.setAttribute('aria-label','将引用 '+(i+1)+' 纳入提议');
   const label=this.node('label');label.append(check,this.node('span','引用 '+(i+1)+' · 同帧保存的 ROI 统计'));
   const summary=this.node('p','准确窗口与统计待读回核对；可通过下方来源入口查看原保存输入。');
   const relation=this.node('select');relation.setAttribute('aria-label','引用 '+(i+1)+' 的提议关系');for(const [v,t]of [['unknown','未知（提议）'],['supports','支持此解释（提议）'],['opposes','反对此解释（提议）']]){const o=this.node('option',t);o.value=v;relation.append(o);}relation.value=original?.relation??'unknown';
   const note=this.node('textarea');note.maxLength=1000;note.setAttribute('aria-label','引用 '+(i+1)+' 的关系理由');note.setAttribute('placeholder','填写此保存观察与假设的关系；统计结果不等于物理解释已被验证。');note.value=original?.note??'';
   for(const n of [check,relation,note])n.oninput=()=>this.editOfflineForm();
   const trace=this.node('details');trace.append(this.node('summary','准确结果 / 原请求 / 原图与哈希（只读）'),this.node('pre',JSON.stringify(reference,null,2)));
   card.append(label,summary,relation,note,trace);host.append(card);this.offlineChoices.push({reference,check,relation,note,summary});
  }
  if(!this.offlineChoices.length)host.append(this.node('p','原上下文没有合格统计引用：只能保留待审或拒绝，不能接纳为正式线索。'));
 }
 private offlineFormResponse(){
  if(!this.offlineBinding||!this.offlineOriginal)throw Error('缺少原响应与绑定');
  return readOfflineResponse({...this.offlineOriginal,hypothesis:this.el('offline-hypothesis').value,evidence:this.offlineChoices.filter(c=>c.check.checked).map(c=>({reference:c.reference,relation:c.relation.value,note:c.note.value})),unknowns:this.el('offline-unknowns').value,next_step:this.el('offline-next-step').value},this.offlineBinding);
 }
 private describeOfflineSources(observations:unknown){
  if(!Array.isArray(observations))return;
  for(const c of this.offlineChoices){const observation=observations.map(row).find(o=>sameResearchValue(o.reference,c.reference));if(!observation)continue;const stats=row(observation.statistics);c.summary.textContent='保存窗口 '+JSON.stringify(observation.source_rect_xyxy)+'（原图像素） · n='+stats.sample_count+' · 均值 '+stats.mean+' · 标准差 '+stats.stddev+' · 最小 '+stats.minimum+' · 最大 '+stats.maximum+'；强度单位未声明。只读历史统计，非独立重复实验。';}
 }
 private async openOffline(){
  if(this.unsettled||!this.options.allowEdit()||!this.options.offlineRead)throw Error('先处理输入、恢复或来源状态，再准备离线上下文。');
  this.offlineEditor('offline-stage',null,this.options.requestId());const ident=this.offlineId,context=this.context;
  const packet=row(await this.options.offlineRead('/api/offline-context?context_id='+this.options.requestId()));
  if(!this.opened||this.offlineId!==ident||this.context!==context)return;
  this.offlineBinding=readOfflineBinding(packet.binding);this.el('offline-context').textContent=JSON.stringify(packet,null,2);this.status('仅本机字段白名单：未自动附带源文件路径字段或 PNG。自由问题或其他自由文本仍可能含路径或敏感内容，简单模式检查不全面。当前不发送且不接真实模型；未来外发前须展示准确发送预览并审查自由文本。');this.options.paint();
 }
 private async reviewOffline(candidate:OfflineCandidate){
  if(this.unsettled||!this.options.allowEdit()||!this.options.offlineRead)throw Error('先处理当前输入或来源状态。');
  this.offlineEditor('offline-accept',candidate.binding,candidate.response.candidate_id);
  this.fillOfflineForm(candidate.response);
  for(const [i,ref] of candidate.binding.references.entries()){const b=this.node('button','核查引用 '+(i+1)+' 的原图与 ROI 统计（保留编辑）');b.onclick=()=>this.run(()=>this.sourceOffline(candidate,ref.result_id));this.el('offline-editor-sources').append(b);}
  await this.recheckOfflineBinding();
 }
 private async recheckOfflineBinding(){
  if(!this.opened||this.mode!=='offline-accept'||this.phase||!this.options.offlineRead)return;
  const generation=++this.offlineReviewGeneration,ident=this.offlineId,context=this.context;
  // Reads belong to one editing phase; submission permanently supersedes them.
  const current=()=>this.opened&&this.mode==='offline-accept'&&!this.phase&&this.offlineReviewGeneration===generation&&this.offlineId===ident&&this.context===context;
  try{const checked=await this.options.offlineRead('/api/offline-review?lead_id='+ident);if(!current())return;this.el('offline-context').textContent=JSON.stringify(checked,null,2);this.describeOfflineSources(row(checked).observations);this.status('已明确重新核对原绑定（不是改绑）。可编辑提议；接受会再次核对来源。查看引用图像不会切换活动图或丢失候选。');}catch(e){if(!current())return;this.el('offline-context').textContent='原绑定未通过当前性核对。保留候选；取消本次编辑，返回原保存上下文再核对；若确已修改问题/ROI/处理，请重新准备新上下文。';throw e;}
 }
 private async sourceOffline(candidate:OfflineCandidate,resultId:string){
  if(!this.options.offlineRead)throw Error('来源读取不可用');const generation=++this.sourceGeneration;
  const response=row(await this.options.offlineRead('/api/offline-source?lead_id='+candidate.response.candidate_id+'&result_id='+resultId));
  if(generation!==this.sourceGeneration)return;const ref=candidate.binding.references.find(r=>r.result_id===resultId);
  if(response.local_only!==true||!sameResearchValue(response.reference,ref)||typeof response.png_base64!=='string'||response.png_base64.length>4*1024*1024)throw Error('离线原图引用回复不一致');
  const stats=row(response.statistics);this.el('offline-source-summary').textContent='引用 '+(candidate.binding.references.indexOf(ref!)+1)+' · 原保存窗口 '+JSON.stringify(response.source_rect_xyxy)+'（原图像素） · n='+stats.sample_count+' · 均值 '+stats.mean+' · 标准差 '+stats.stddev+' · 最小 '+stats.minimum+' · 最大 '+stats.maximum+'；强度单位未声明。';
  this.el('offline-source-image').src='data:image/png;base64,'+response.png_base64;this.el('offline-source-info').textContent=JSON.stringify({reference:ref,ROI:response.source_rect_xyxy,statistics:response.statistics,intensity_unit:null,meaning:'准确保存输入及原窗口；仅本机显示，非新测量，活动图和候选原绑定不变'},null,2);this.el('offline-source-dialog').showModal();
 }
 private renderOffline(state:PanelRoiSnapshot,blocked:boolean){
  const history=readOfflineResearch(state.research_offline),host=this.el('offline-candidates');host.replaceChildren();
  for(const c of [...(history?.entries??[])].reverse()){
   const card=this.node('section');card.append(this.node('h4','离线合成演示 · 未调用 AI · '+({pending:'待审',accepted:'已接受为演示线索',rejected:'已拒绝'}[c.status])),this.node('p','原问题：'+c.binding.question.text));
   const proposal=(label:string,value:OfflineResponse|LeadDraft)=>{const box=this.node('section');box.append(this.node('h5',label),this.node('p','假设 / 解释提议：'+value.hypothesis));for(const e of value.evidence){const i=c.binding.references.findIndex(r=>sameResearchValue(e.reference,r));box.append(this.node('p','引用 '+(i+1)+' · '+({supports:'支持',opposes:'反对',unknown:'未知'}[e.relation])+'（提议）：'+e.note));}box.append(this.node('p','待确认 / 仍未知：'+value.unknowns),this.node('p','下一步计划（未执行）：'+value.next_step));return box;};
   if(c.accepted_draft)card.append(proposal('研究者已接纳稿（非科学验证）',c.accepted_draft));
   const original=this.node('details');original.open=c.status==='pending';original.append(this.node('summary','原始离线响应（保留未改）'),proposal('原始合成提议',c.response));card.append(original);
   if(!c.response.evidence.length)card.append(this.node('p',c.accepted_draft?'原始响应未列证据；接纳稿中的引用和关系由研究者明确提出。':'原始响应未列证据：可保留待审或拒绝；接纳前须明确选用原绑定中 1–8 个合格统计并说明关系，不能编造引用。'));
   if(c.rejection_note)card.append(this.node('p','拒绝理由：'+c.rejection_note));
   for(const [i,ref] of c.binding.references.entries()){const b=this.node('button','查看准确保存输入与 ROI 统计 · 引用 '+(i+1)+'（本机）');b.disabled=blocked;b.onclick=()=>this.run(()=>this.sourceOffline(c,ref.result_id));card.append(b);}
   if(c.status==='pending'){const review=this.node('button','核对来源并编辑 / 接受');review.disabled=blocked||this.unsettled;review.onclick=()=>this.run(()=>this.reviewOffline(c));const reject=this.node('button','拒绝此离线候选');reject.disabled=blocked||this.unsettled;reject.onclick=()=>this.run(()=>{if(this.unsettled||!this.options.allowEdit())throw Error('当前状态不允许处理候选');this.offlineEditor('offline-reject',c.binding,c.response.candidate_id);this.status('拒绝仅记录处理结果；原候选、原绑定与科学结果保留。');});card.append(review,reject);}
   host.append(card);
  }
 }
 private async inspectEvidence(record:ResearchLead,index:number){
  if(this.unsettled||!this.options.allowEdit()||!this.options.statistics)throw Error('先处理研究输入或来源状态，再核查原统计。');
  const state=this.options.getState(),reference=record.evidence[index].reference;
  const current=()=>{const now=this.options.getState();return !this.unsettled&&this.options.allowEdit()&&now.object.object_id===state.object.object_id&&row(now.frame_identity).frame_object_id===reference.frame_id&&sameResearchValue(now.research_question,state.research_question)&&sameResearchValue(readResearchLeads(now.research_leads)?.entries.find(r=>r.lead_id===record.lead_id),record);};
  if(!current())throw Error('线索或来源已改变；请重新打开原记录。');
  await this.refresh();
  const resolved=this.resolved.get(record.lead_id),item=row(Array.isArray(resolved?.evidence)?resolved.evidence[index]:null);
  if(!current()||item.validation!=='verified_saved_reference'||!sameResearchValue(item.reference,reference))throw Error('准确原统计引用未通过核对；未打开替代结果。');
  await this.options.statistics(statisticsReference(reference));
 }
 private withdraw(record:ResearchLead){
  if(this.unsettled||!this.options.allowEdit())throw Error('先处理当前研究输入与来源状态。');this.el('offline-fields').hidden=true;this.el('apply-research-lead').textContent='应用线索 / 撤回提议';this.mode='withdraw';this.withdrawalId=record.lead_id;this.opened=true;this.dirty=true;
  this.el('lead-create-fields').hidden=true;this.el('lead-withdraw-fields').hidden=false;this.el('lead-withdrawal-note').value='';this.el('lead-question-binding').textContent='撤回提议 '+record.lead_id+'；保留原记录、问题与科学结果。';this.el('research-lead-dialog').showModal();this.status('填写理由后明确撤回；取消不会改变记录。');this.options.changed();
 }
 async refresh(){
  const generation=++this.refreshGeneration,state=this.options.getState();this.resolved.clear();this.options.paint();const response=row(await this.options.read());
  if(generation!==this.refreshGeneration||response.schema_version!==1||response.read_only!==true||response.object_id!==state.object.object_id||this.options.getState().object.object_id!==state.object.object_id||!sameResearchValue(response.question??undefined,this.options.getState().research_question)||!Array.isArray(response.leads))return;
  const expected=readResearchLeads(state.research_leads)?.entries??[];
  if(response.leads.length!==expected.length||response.leads.some(raw=>{const e=row(raw);return !expected.some(record=>sameResearchValue(record,e.record));}))throw Error('线索核对投影与原记录不一致');
  for(const raw of response.leads){const e=row(raw),record=expected.find(r=>r.lead_id===row(e.record).lead_id)!;if(!Array.isArray(e.evidence)||e.evidence.length!==record.evidence.length)throw Error('线索证据投影数量不一致');for(const [i,rawEvidence]of e.evidence.entries()){const item=row(rawEvidence),reference=record.evidence[i].reference;if(!sameResearchValue(item.reference,reference)||item.validation==='verified_saved_reference'&&!sameResearchValue(referenceFromStatistics(item.observation),reference))throw Error('线索证据投影不是准确的原结果引用');}}
  this.resolved=new Map(response.leads.map(raw=>{const e=row(raw);return [String(row(e.record).lead_id),e];}));this.options.paint();
 }
 render(state:PanelRoiSnapshot,blocked:boolean){
  const raw=readResearchLeads(state.research_leads),q=readResearchQuestion(state.research_question),signature=JSON.stringify([state.object.object_id,q,raw]);
  if(signature!==this.signature){this.signature=signature;this.resolved.clear();this.refreshGeneration++;if(raw?.entries.length)void this.refresh().catch(e=>this.options.error('线索引用核对失败：'+(e as Error).message));}
  this.el('offline-research-entry').disabled=blocked||this.unsettled||!q||q.frame_object_id!==row(state.frame_identity).frame_object_id;
  this.el('offline-generate').disabled=blocked||Boolean(this.phase)||this.offlineRebuild||!this.offlineBinding||this.mode!=='offline-stage';
  this.el('offline-without-evidence').disabled=this.el('offline-generate').disabled;
  const formBlocked=blocked||Boolean(this.phase)||this.offlineRebuild||this.mode!=='offline-accept';
  for(const id of ['offline-hypothesis','offline-unknowns','offline-next-step'])this.el(id).disabled=formBlocked;
  for(const c of this.offlineChoices)for(const n of [c.check,c.relation,c.note])n.disabled=formBlocked;
  this.renderOffline(state,blocked);
  this.el('open-research-lead').disabled=blocked||this.unsettled||!q||q.frame_object_id!==row(state.frame_identity).frame_object_id;
  for(const id of ['lead-hypothesis','lead-proposer','lead-unknowns','lead-next-step','lead-withdrawal-note'])this.el(id).disabled=blocked||Boolean(this.phase);
  for(const c of this.choices)for(const n of [c.check,c.relation,c.note])n.disabled=blocked||Boolean(this.phase);
  this.el('apply-research-lead').disabled=blocked||Boolean(this.phase)||this.offlineRebuild;this.el('cancel-research-lead').disabled=Boolean(this.phase);this.el('check-research-lead').hidden=this.phase!=='unknown';this.el('check-research-lead').disabled=this.checking;
  const cardSignature=JSON.stringify([raw,q,[...this.resolved],blocked,this.unsettled]);if(cardSignature===this.cardSignature)return;this.cardSignature=cardSignature;
  const expanded=new Set([...this.traceDetails].filter(([,node])=>node.open).map(([key])=>key));this.traceDetails.clear();
  const host=this.el('research-lead-list');host.replaceChildren();
  for(const record of [...(raw?.entries??[])].reverse()){
   const card=this.node('section'),resolved=this.resolved.get(record.lead_id),current=sameResearchValue(record.question,q);
   card.append(this.node('h3',record.withdrawn_utc?'已撤回的提议':current?'当前问题的分析线索':'旧问题的历史线索'),this.node('p','假设/解释提议：'+record.hypothesis),this.node('small','提议者：'+record.proposed_by+'（调用方自述，未认证） · '+record.created_utc+' · '+record.lead_id),this.node('p','绑定问题：'+record.question.text));
   if(!current)card.append(this.node('p','问题已改变；这条线索未自动转为当前问题的证据。'));
   if(record.withdrawn_utc)card.append(this.node('p','撤回于 '+record.withdrawn_utc+'：'+record.withdrawal_note));
   for(const [i,e]of record.evidence.entries()){
    const details=Array.isArray(resolved?.evidence)?row(resolved!.evidence[i]):{},observation=row(details.observation),stats=row(observation.statistics);
    card.append(this.node('p','提议关系：'+({supports:'支持',opposes:'反对',unknown:'未知'}[e.relation])+'；'+e.note),this.node('small','结果 '+e.reference.result_id+' · 原请求 '+e.reference.request_id));
    card.append(this.node('p',details.validation==='verified_saved_reference'?'已核对保存引用；ROI '+JSON.stringify(observation.source_rect_xyxy)+' · n='+stats.sample_count+' · 均值 '+stats.mean+' · 标准差 '+stats.stddev+' · 强度单位未声明':'引用尚未核对或不可用：'+String(details.reason??'正在读取；不能作为已核对观察使用')));
    const display=row(row(details.observation).input_display),reviewDisplay=display.kind!==undefined&&display.kind!=='exact_saved_input';const source=this.node('button',reviewDisplay?'核查原数组与显示':'返回准确原图输入');source.disabled=blocked||this.unsettled||details.validation!=='verified_saved_reference';source.onclick=()=>this.run(async()=>{if(this.unsettled)throw Error('先处理线索草稿。');await this.refresh();const fresh=this.resolved.get(record.lead_id),items=Array.isArray(fresh?.evidence)?fresh.evidence:[],verified=row(items[i]);if(verified.validation!=='verified_saved_reference'||!sameResearchValue(verified.reference,e.reference))throw Error('准确引用已失效或未核对；未打开替代来源。');if(reviewDisplay&&this.options.statistics)await this.options.statistics(e.reference);else await this.options.navigate(e.reference.input_view_id);});card.append(source);
    if(this.options.statistics){const inspect=this.node('button','核查这条原统计');inspect.disabled=blocked||this.unsettled||details.validation!=='verified_saved_reference';inspect.onclick=()=>this.run(()=>this.inspectEvidence(record,i));card.append(inspect);}
    const key=JSON.stringify([state.object.object_id,record.lead_id,e.reference]),trace=this.node('details');trace.open=expanded.has(key);this.traceDetails.set(key,trace);trace.append(this.node('summary','原结果、请求与哈希（只读）'),this.node('pre',JSON.stringify({reference:e.reference,validation:details.validation??'not_checked',observation:details.observation??null},null,2)));card.append(trace);
   }
   card.append(this.node('p','仍未知：'+(record.unknowns||'尚未记录，不表示没有未知')),this.node('p','下一步计划（未执行）：'+record.next_step),this.node('small','关系只是提议；引用可读不等于假设或材料解释已验证。'));
   const withdraw=this.node('button','撤回此提议');withdraw.disabled=blocked||this.unsettled||Boolean(record.withdrawn_utc);withdraw.onclick=()=>this.run(()=>this.withdraw(record));card.append(withdraw);host.append(card);
  }
  if(!raw?.entries.length)host.append(this.node('p','尚无线索。围绕已应用问题整理已有统计；不自动生成解释或支持关系。'));
 }
}
