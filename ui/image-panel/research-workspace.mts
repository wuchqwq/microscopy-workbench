// Presentation only; existing providers remain the numerical authority.
import {readResearchQuestion} from './research-question.mjs';
import {roiObservationModel} from './roi-observations.mjs';
import {renderResultSemantics} from './result-semantics.mjs';
import {renderGpaEvidence} from './gpa-evidence.mjs';
import type {PanelRoiSnapshot,RoiDependencySnapshot,RoiObservationModel,PanelInteractionGate} from './roi-observations.mjs';
import type {BrowserDocument} from './browser-ports.mjs';
import {qualifyMultiRoiHandoff,multiRoiContinuationLines} from './multi-roi-handoff.mjs';
import type {MultiRoiSummary} from './multi-roi-handoff.mjs';
type Row=Record<string,unknown>;
export function observationOriginLabel(mark:{purpose?:string;observation_contract_version?:number;selection_origin?:string;selection_origin_basis?:string}):string {
 if(mark.purpose===undefined)return '选择来源未记录（历史记录不推断）';
 if(mark.purpose!=='resumable_observation'||mark.observation_contract_version!==1||mark.selection_origin_basis!=='caller_reported_not_authenticated')return '选择来源合同未知；请核对原记录';
 const label=({researcher:'研究者',agent:'Agent',unspecified:'未指定'} as Record<string,string>)[mark.selection_origin??''];
 return label?`选择来源：${label}（调用者声明，非身份认证）`:'选择来源声明未知';
}
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown,max=100):Row[]=>Array.isArray(v)?v.slice(0,max).map(row):[];
const value=(v:unknown)=>typeof v==='string'?v:'未知';
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?String(v):'未知';
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
export function retainedObservationContext(raw:unknown){const envelope=row(raw),payload=row(envelope.payload),source=row(payload.source);if(!id(payload.object_id)||!id(source.observation_view_object_id))return null;return {view_id:source.observation_view_object_id,comparison_id:payload.object_id,currentness:envelope.currentness,observations:rows(payload.observations,100).filter(r=>typeof r.annotation_id==='string'&&r.annotation_id.length<=64&&Array.isArray(r.rect_xyxy)&&r.rect_xyxy.length===4&&r.rect_xyxy.every(v=>typeof v==='number'&&Number.isFinite(v))),latest:rows(envelope.latest_measurement_refs,16).filter(r=>id(r.object_id))};}
export function crystalStatusLabel(v:unknown){return ({compatible:'在所给条件下相容',incompatible:'在所给条件下不相容',insufficient_evidence:'证据不足，保留候选'} as Record<string,string>)[String(v)]??'未判';}
export function crystalCurrentnessLabel(v:unknown){return ({current:'已核对的保存证据',needs_review:'相关观察已改变 · 待更新',historical:'另一保存视图的证据',unvalidated_snapshot:'重连快照 · 待工具复核'} as Record<string,string>)[String(v)]??'尚未核对';}
function handoffNotice(gate:PanelInteractionGate):string {
 if(gate.reasons.includes('operation_unresolved'))return '原请求尚未确认；先查询原请求，不要重新提交计算。';
 if(gate.reasons.includes('pending_result'))return '有待接纳结果；先明确查看或处理，不能自动覆盖当前工作。';
 if(gate.reasons.includes('draft_save_failed'))return '草稿状态保存失败；确认保存成功后再交接，不丢弃当前编辑。';
 if(gate.reasons.includes('draft_save_pending'))return '草稿状态正在保存；完成后重新读取面板再交接。';
 if(gate.status==='unknown')return '面板交接状态不完整；重新读取当前状态，不把未知当作已保存。';
 return '有未完成草稿，请先保存或撤销。';
}
export function qualifiedQuestionContext(model:RoiObservationModel){return model.packet.scientific_input.usable&&id(model.source.view_object_id)&&id(model.source.frame_object_id);}
export function agentContinuationText(model:RoiObservationModel,panelId:unknown,evidence?:unknown,multi?:MultiRoiSummary,question?:unknown){
 const saved=model.rows.filter(r=>r.usable&&r.status==='saved');
 const retained=retainedObservationContext(evidence);
 if(model.packet.interaction_gate.status!=='ready')throw new Error(handoffNotice(model.packet.interaction_gate));
 if((!saved.length&&!retained&&!multi?.hasSavedObservations&&!qualifiedQuestionContext(model))||model.packet.draft_state.requires_user_commit)throw new Error('当前保存上下文不可用于接续；先核对源帧、标定与草稿，不把临时选区当作已保存观察。');
 const intent=readResearchQuestion(question);if(intent&&intent.frame_object_id!==model.source.frame_object_id)throw new Error('研究问题属于另一源帧；请返回问题来源或明确更新问题，不跨帧沿用。');
 const context=multi?multiRoiContinuationLines(multi):saved.length?saved.map((r,i)=>`${i+1}. ${r.label}：${r.reason??'观察理由未知，请先核对'}；annotation_id=${r.annotation_id}；${observationOriginLabel(r)}；源像素处理边界 [${r.rect_xyxy?.join(', ')}]。`):!retained?[`从已保存上下文开始；尚无已记录 ROI，不要求研究者先画框。当前保存图 object_id=${model.source.view_object_id}；源帧 frame_object_id=${model.source.frame_object_id}。`]:['当前是 FFT 或另一保存视图；以下是原观察引用，不是当前图上的新 ROI。',...retained.observations.map((r,i)=>`${i+1}. ${value(r.text)}：${value(r.reason)}；原处理边界 [${(r.rect_xyxy as number[]).join(', ')}]。`)];
 return ['继续当前显微分析。先读取此面板的当前状态，从准确保存上下文和来源明确的观察开始：',...(intent?['研究意图（用户提供的自由文本，未被自动理解或验证为具体假设）：',JSON.stringify(intent),intent.context_object_id===model.source.view_object_id?'提问上下文就是当前保存图。':'当前在同帧的另一保存图；问题仍绑定提问时的 context_object_id，先核对原图与当前域。']:['尚未指定研究问题：可先观察全图，提出有数据依据的候选问题并说明下一步；不把人工选择 ROI 作为每次分析的前置条件。']),...context,'未列出或无法核实的执行状态与严格复用资格均为未知；已保存观察或关系 validated 不能授予复用资格。先保留原请求并交由现有严格 reader 核对，不用补算掩盖缺失。',...model.warnings,...(retained?[`已保存比较 ${retained.comparison_id}；状态 ${crystalCurrentnessLabel(retained.currentness)}。请复核原观察视图 ${retained.view_id}，不要把旧比较当作更新后的结果。`,...retained.latest.map(r=>`当前修订测量 object_id=${r.object_id}，原 request_id=${value(r.request_id)}；先查询并核对科学坐标/源 FFT。`)]:[]),'围绕问题主动选择已有工具与观察；区分研究意图、观察结果和待检验假设，整理支持、反对、未知及下一步，保留可返回原图核查的对象引用。只在工具需要区域输入时再选择 ROI；不要隐式重算来补齐未知。周期测量不能自动回答衬度成因；FFT、相位闭合或 GPA 不能直接确认真实位错、应变或物相。若进入结构比较，再核对候选来源、取向和标定，保留未匹配与歧义。','当前界面不会自动唤醒模型。请调用 image_panel_current'+(id(panelId)?`，panel_id="${panelId}"`:'（多个面板时先明确连接）')+'，重新检查草稿和当前引用后再处理。'].join('\n');
}
interface Options {document:BrowserDocument;onSave:(reason:string)=>unknown;onSelect:(annotationId:string)=>unknown;onNavigate:(objectId:string)=>unknown;onError:(message:string)=>void;onDraftChange:()=>void;allowEdit?:()=>boolean;onQuestionSave?:(text:string,contextId:string)=>Promise<void>;onQuestionCheck?:()=>Promise<void>;onQuestionStatistics?:(question:NonNullable<ReturnType<typeof readResearchQuestion>>)=>Promise<void>;onQuestionDraftChange?:()=>void;onAgent?:()=>unknown;handoffBlocked?:()=>boolean;}
function hasRetainedSources(state:PanelRoiSnapshot):boolean {
 if(state.multi_roi_handoff_schema_version!==1)return false;
 const collection=row(state.window_collection);return rows(collection.windows,5).some(window=>
  (window.role==='source'||window.role==='roi')&&id(window.object_id)||id(row(window.source_reference).input_view_object_id));
}
export class ResearchWorkspace {
 readonly doc:BrowserDocument;readonly options:Options;questionDirty=false;questionPhase:''|'saving'|'unknown'='';private questionBaseline='';private questionContext='';private questionState:PanelRoiSnapshot|null=null;reasonDirty=false;model:RoiObservationModel|null=null;
 private previous:RoiDependencySnapshot|null=null;private reasonBaseline:{key:string;value:string}|null=null;private reasonContext:{key:string;value:string}|null=null;private scienceSignature='';private rowSignature='';
 constructor(options:Options){this.options=options;this.doc=options.document;
  this.el('research-question').oninput=()=>{if(options.allowEdit?.()===false||this.questionPhase){this.el('research-question').value=this.questionBaseline;return;}if(!this.questionDirty)this.questionContext=this.questionState?.object.object_id??'';const q=this.questionReference();this.questionDirty=this.el('research-question').value!==this.questionBaseline||Boolean(q&&q.context_object_id!==this.questionContext);options.onQuestionDraftChange?.();};
  this.el('apply-research-question').onclick=()=>this.run(async()=>{if(!this.questionDirty||this.questionPhase)return;this.questionPhase='saving';options.onQuestionDraftChange?.();try{if(!options.onQuestionSave)throw new Error('当前入口不支持保存问题');await options.onQuestionSave(this.el('research-question').value,this.questionContext);this.questionDirty=false;this.questionPhase='';}catch(error){this.questionPhase='unknown';throw error;}finally{options.onQuestionDraftChange?.();}});
  this.el('cancel-research-question').onclick=()=>{if(this.questionPhase)return;this.questionBaseline=readResearchQuestion(this.questionState?.research_question)?.text??'';this.el('research-question').value=this.questionBaseline;this.questionDirty=false;options.onQuestionDraftChange?.();};
  this.el('check-research-question').onclick=()=>this.run(async()=>{if(this.questionPhase!=='unknown')return;await options.onQuestionCheck?.();this.questionPhase='';options.onQuestionDraftChange?.();});
  this.el('research-question-agent').onclick=()=>this.run(()=>options.onAgent?.());
  this.el('research-question-source').onclick=()=>this.run(()=>{const q=readResearchQuestion(this.questionState?.research_question);if(q)return options.onNavigate(q.context_object_id);});
  this.el('research-question-statistics').onclick=()=>this.run(()=>{if(this.questionDirty||this.questionPhase||this.reasonDirty||this.el('research-question-statistics').disabled)return;const q=this.questionReference();if(q)return options.onQuestionStatistics?.(q);});
  this.el('roi-reason').oninput=()=>{if(options.allowEdit?.()===false){this.el('roi-reason').value=this.reasonContext?.value??'';options.onError('先恢复或明确放弃未保存恢复副本，再编辑观察说明。');return;}this.reasonDirty=!this.reasonBaseline||!this.sameReasonContext()||this.el('roi-reason').value!==this.reasonBaseline.value;options.onDraftChange();};
  this.el('save-observation').onclick=()=>this.run(()=>options.onSave(this.el('roi-reason').value));
  this.el('copy-agent-prompt').onclick=()=>this.run(async()=>{const clipboard=(globalThis as {navigator?:{clipboard?:{writeText(text:string):PromiseLike<void>}}}).navigator?.clipboard;if(!clipboard)throw new Error('浏览器无法复制；请手动复制下面的提示。');await clipboard.writeText(this.el('agent-prompt').value);this.el('agent-copy-status').textContent='已复制；粘贴给已连接的 Agent 并说继续。尚未自动执行。';});
 }
 questionReference(){return readResearchQuestion(this.questionState?.research_question);}
 prepareQuestionHere(expectedObjectId:string){
  if(this.questionDirty||this.questionPhase||this.reasonDirty||this.options.allowEdit?.()===false||this.options.handoffBlocked?.()||this.questionState?.object.object_id!==expectedObjectId||!this.model||!qualifiedQuestionContext(this.model)||this.model.packet.interaction_gate.status!=='ready')throw Error('当前来源或研究输入尚未核对；原问题保留，请先处理输入。');
  this.questionContext=expectedObjectId;const q=this.questionReference();this.questionDirty=Boolean(q&&q.context_object_id!==expectedObjectId);this.options.onQuestionDraftChange?.();this.el('research-question').focus();
 }
 reconcileQuestionRead(state:PanelRoiSnapshot){const q=readResearchQuestion(state.research_question);this.questionBaseline=q?.text??'';this.questionDirty=this.el('research-question').value!==this.questionBaseline||Boolean(q&&q.context_object_id!==this.questionContext);}
 private el(name:string){return this.doc.getElementById(name)!;}
 private node(tag:string,text?:unknown){const n=this.doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 private async run(fn:()=>unknown){try{await fn();}catch(e){this.options.onError((e as Error).message);}}
 private savedReasonContext(state:PanelRoiSnapshot,model:RoiObservationModel){
  const selected=model.rows.find(row=>row.selected),matches=selected?.annotation_id?rows(state.object.annotations).filter(mark=>mark.annotation_id===selected.annotation_id):[];
  // The editor baseline uses the exact saved note, not the model's trimmed summary.
  const saved=matches.length===1&&typeof matches[0]!.note==='string'?matches[0]!.note as string:'';
  return {key:JSON.stringify([model.source.view_object_id,model.source.frame_object_id,selected?.annotation_id??null,selected?.original_anchor??model.current_selection?.original_anchor??null]),value:saved};
 }
 private sameReasonContext(){return this.reasonBaseline?.key===this.reasonContext?.key&&this.reasonBaseline?.value===this.reasonContext?.value;}
 clearReason(){this.reasonDirty=false;this.reasonBaseline=null;this.reasonContext=null;this.el('roi-reason').value='';}
 restoreReason(state:PanelRoiSnapshot,reason:string){
  // Called only when installing an explicitly owned window draft. A legacy dirty
  // flag cannot make unchanged text a new scientific edit, or hide different text.
  this.reasonContext=this.savedReasonContext(state,roiObservationModel(state));this.reasonBaseline={...this.reasonContext};this.el('roi-reason').value=reason;this.reasonDirty=reason!==this.reasonBaseline.value;
 }
 render(state:PanelRoiSnapshot,{busy=false,gesture=false,observationSavePhase=''}:{busy?:boolean;gesture?:boolean;observationSavePhase?:''|'submitting'|'verifying'|'handoff'}={}){
  this.questionState=state;const question=readResearchQuestion(state.research_question);if(!this.questionDirty&&!this.questionPhase){this.questionBaseline=question?.text??'';this.el('research-question').value=this.questionBaseline;}
  const questionBlocked=busy||gesture||Boolean(observationSavePhase)||Boolean(this.questionPhase);
  this.el('research-question').disabled=questionBlocked;
  this.el('apply-research-question').disabled=questionBlocked||!this.questionDirty||!this.options.onQuestionSave;
  this.el('cancel-research-question').disabled=questionBlocked||!this.questionDirty;
  this.el('check-research-question').hidden=this.questionPhase!=='unknown';this.el('check-research-question').disabled=busy||gesture;
  this.el('research-question-status').textContent=this.questionPhase==='unknown'?'应用结果待核对；输入保留。先核对当前状态，不重复提交。':this.questionPhase==='saving'?'正在应用问题，不执行科学计算。':this.questionDirty?`问题输入尚未应用，保留于本界面；提问上下文 ${this.questionContext}。应用或撤回后再交接、保存或关闭。`:question?`研究意图已应用；Ctrl+S 保存整个工作区。来源图 ${question.context_object_id} · 源帧 ${question.frame_object_id} · ${question.recorded_utc}。自由文本未被自动具体验证。`:'尚未记录本地研究问题。可直接输入，无需先画 ROI；应用问题不会自动调用模型。';
  this.el('research-question-source').hidden=!question;this.el('research-question-source').disabled=questionBlocked||this.questionDirty||this.reasonDirty;
  const model=roiObservationModel(state,this.previous);this.model=model;if(!this.previous||this.previous.source_frame_object_id!==model.source.frame_object_id)this.previous=model.dependency_snapshot;
  const context=this.questionDirty||this.questionPhase?this.questionContext:question?.context_object_id??state.object.object_id,panels=rows(state.object.panels),p=panels.length===1?panels[0]:null,rect=p?.source_rect_xyxy;
  this.el('research-question-context').textContent=context!==state.object.object_id?'问题或草稿属于另一保存图；当前画面和选区不会自动重绑定问题。返回提问来源核对范围。':p?.domain==='spatial_pixels'&&Array.isArray(rect)&&rect.length===4&&rect.every(n=>typeof n==='number'&&Number.isFinite(n))?`提问上下文显示的源像素范围 [${rect.join(', ')}]（半开区间）。当前临时选区不会自动成为问题范围；可“查看选区并提问”。`:p?.domain==='frequency'?'提问上下文为 FFT／倒空间保存图；空间 ROI 请通过既有历史来源核对。':'提问上下文为当前保存图；坐标或来源范围未明确时保持未知，不从临时选区推断。';
  this.el('research-question-statistics').disabled=!question||questionBlocked||this.questionDirty||this.reasonDirty||!this.options.onQuestionStatistics||model.packet.interaction_gate.status!=='ready';
  const usable=model.rows.filter(r=>r.usable&&r.status==='saved'),selected=model.rows.find(r=>r.selected),current=model.current_selection;
  const frequency=rows(state.object.panels).some(panel=>panel.domain==='frequency')||['fft','fft_view'].includes(String(state.object.kind));
  const sourceNotice=frequency?'当前编辑域：FFT / 倒空间；空间 ROI 属于来源原图，不是当前频谱选框。'+(row(state.spatial_return).status==='ready'?'来源返回关系已核对；请在“返回空间观察”按钮可用时查看对应的生成时来源，不重算 FFT。关系已核对不代表当前操作可点击，仍以按钮状态为准。':'当前没有已核对的来源返回入口；可从“窗口”检查已有来源图，不能据边界匹配认定来源身份。'):'';
  const retained=retainedObservationContext(state.crystal_evidence),retainedSources=hasRetainedSources(state);this.el('research-count').textContent=model.rows.length?`${usable.length} 处已记录观察`:retained?`${retained.observations.length} 处原观察 · 另一保存视图`:retainedSources?'来源 ROI · 交接时核对':'0 处已记录观察';this.el('research-source').textContent=`${model.source.filename??'来源未知'} · ${model.source.frame_index===null?'帧未知':`第 ${model.source.frame_index+1} 帧`}`;
  const scale=model.calibration.xy_scale;this.el('research-calibration').textContent=scale?`XY ${scale.x} / ${scale.y} ${scale.unit}/px · 标定版本 ${model.calibration.revision} · ${model.calibration.source==='user_statement_not_independently_verified'?'用户声明，未独立验证':value(model.calibration.source)}`:'物理标尺未知或已撤回 · 像素域观察仍可继续';
  this.el('roi-current').textContent=current?.usable?`${selected?'已记录观察的当前选择':'临时选区'} · 实际处理边界 [${current.rect_xyxy?.join(', ')}]（源像素，向外取整）`:(frequency?sourceNotice:'在原图框选 ROI 后应用观察理由。此处记录空间观察，不自动选择测量问题。');
  this.reasonContext=this.savedReasonContext(state,model);
  if(!this.reasonBaseline){this.reasonBaseline={...this.reasonContext};if(!this.reasonDirty)this.el('roi-reason').value=this.reasonBaseline.value;else this.reasonDirty=this.el('roi-reason').value!==this.reasonBaseline.value;}
  else if(this.reasonDirty){if(this.sameReasonContext()&&this.el('roi-reason').value===this.reasonBaseline.value)this.reasonDirty=false;}
  else if(!this.sameReasonContext()){this.reasonBaseline={...this.reasonContext};this.el('roi-reason').value=this.reasonBaseline.value;}
  const saving=Boolean(observationSavePhase);
  this.el('roi-reason').disabled=busy||gesture||saving;
  this.el('save-observation').disabled=busy||gesture||saving||!current?.usable;this.el('save-observation').textContent=saving?'正在应用并核对…':selected?'应用这条观察说明':'应用 ROI 观察';
  this.el('observation-draft-state').textContent=observationSavePhase==='submitting'?'正在提交观察；Agent 暂不能接续，请等待保存与读回校验。':saving?'观察对象已保存；正在核对交接，尚未确认可接续。':this.reasonDirty?'说明尚未应用；Agent 不会把它当作正式观察。':model.packet.interaction_gate.status!=='ready'?handoffNotice(model.packet.interaction_gate):selected&&!selected.reason?'ROI 位置已记录；观察理由未填写，交接时保留未知。':'应用记录位置与理由，不确认物相；Ctrl+S 明确保存工作区。';
  this.el('agent-continue').disabled=busy||gesture||saving||this.reasonDirty||model.packet.interaction_gate.status!=='ready'||this.questionDirty||Boolean(this.questionPhase)||Boolean(this.options.handoffBlocked?.())||Boolean(question&&question.frame_object_id!==model.source.frame_object_id)||(!usable.length&&!retained&&!retainedSources&&!qualifiedQuestionContext(model));this.el('research-question-agent').disabled=this.el('agent-continue').disabled;this.el('save-observation-entry').disabled=busy||gesture||saving||!current?.usable;
  const signature=JSON.stringify([model.rows,retained?.view_id,retainedSources,sourceNotice]);if(signature!==this.rowSignature){this.rowSignature=signature;const list=this.el('roi-observations');list.replaceChildren();for(const r of model.rows){const li=this.node('li');li.className=r.selected?'selected-observation':'';const b=this.node('button',r.label);b.disabled=!r.usable;b.title=r.eligibility_reason;b.onclick=()=>this.run(()=>r.annotation_id&&this.options.onSelect(r.annotation_id));li.append(b,this.node('small',({saved:'已记录',saved_with_draft:'记录版＋未应用草稿',retracted:'已撤回',unusable:'当前网格不可用'} as Row)[r.status]),this.node('p',r.reason??'观察理由未知'),this.node('small',observationOriginLabel(r)),this.node('small',r.rect_xyxy?`处理窗口 [${r.rect_xyxy.join(', ')}]`:'未选择可用处理窗口'));list.append(li);}if(!model.rows.length){if(retained){for(const r of retained.observations){const li=this.node('li'),b=this.node('button',value(r.text)+'（原保存视图）');b.onclick=()=>this.run(async()=>{await this.options.onNavigate(retained.view_id);await this.options.onSelect(String(r.annotation_id));});li.append(b,this.node('p',value(r.reason)),this.node('small','历史观察引用，不会投到当前 FFT 上'));list.append(li);}}else list.append(this.node('li',frequency?sourceNotice:retainedSources?'当前编辑图未列出空间 ROI；其它来源图的观察需按保存身份分别查看，不代表整个工作区没有观察。':'暂无已记录观察；临时选区与观察记录相互独立。'));}}
  this.el('roi-warnings').replaceChildren(...model.warnings.map(w=>this.node('p',w)));renderGpaEvidence(this.el('gpa-evidence'),state.object,this.doc);renderResultSemantics(this.el('result-semantics'),state.object,this.doc);this.renderEvidence(state.crystal_evidence,busy||gesture);
 }
 showHandoff(state:PanelRoiSnapshot,packet?:unknown,executionHistory?:unknown){if(this.options.handoffBlocked?.())throw new Error('先应用、核对或取消分析线索草稿。');if(this.questionDirty||this.questionPhase)throw new Error('先应用、核对或撤回研究问题输入。');if(this.reasonDirty)throw new Error('请先应用观察说明。');const multi=packet===undefined?undefined:qualifyMultiRoiHandoff(packet,state,executionHistory);if(hasRetainedSources(state)&&!multi)throw new Error('请先读取多 ROI 来源与 FFT 输入版本，再交给 Agent。');this.el('agent-prompt').value=agentContinuationText(roiObservationModel(state),state.panel_id,state.crystal_evidence,multi,state.research_question)+(state.research_leads?'\n分析线索元数据（提议关系，不是科学验证；当前性、撤回与每个引用须重新核对，计划尚未执行）。同帧 A/B 与同源实空间、FFT、相位等派生视图不是独立重复实验；不得按关联条目数量增加权重。保留原图、窗口、参考与处理来源；此处没有实现证据独立性判断、自动加权或自动假设检验：\n'+JSON.stringify(state.research_leads):'');this.el('agent-copy-status').textContent='包含研究意图和准确保存引用；复制给已连接的 Agent。尚未自动执行。';this.el('agent-handoff-dialog').showModal();}
 private renderEvidence(raw:unknown,disabled:boolean){
  const host=this.el('crystal-evidence'),e=row(raw),p=row(e.payload);host.hidden=!id(p.object_id);if(!id(p.object_id)){this.el('crystal-short-status').textContent='尚无结构比较证据';this.el('crystal-short-status').disabled=true;return;}
  this.el('crystal-short-status').disabled=false;this.el('crystal-short-status').textContent='查看证据 · '+crystalCurrentnessLabel(e.currentness);const signature=JSON.stringify([p.object_id,e.presentation_request_id,e.currentness,e.currentness_reasons,typeof p.image_png_base64==='string']);if(signature===this.scienceSignature){for(const b of host.querySelectorAll('button'))b.disabled=disabled;return;}this.scienceSignature=signature;host.replaceChildren();host.append(this.node('h2','有限候选比较'),this.node('strong',crystalCurrentnessLabel(e.currentness)),this.node('p',crystalStatusLabel(p.status)),this.node('p','这是给定标定、结构和取向下的几何证据，不是唯一物相、三维界面或孪晶确认。'));
  const reasonLabels:Record<string,string>={saved_comparison_predates_local_scientific_revision:'这份比较早于已保存的科学修订，不能作为当前结果。',latest_measurement_not_in_saved_comparison:'新比较尚未包含当前修订测量。',latest_calibration_not_in_saved_comparison:'新比较尚未使用当前要求的标定版本。',edited_anchor_not_in_saved_comparison:'新比较尚未包含已修改的科学锚点。',required_fft_not_in_saved_comparison:'新比较未包含已修订频谱的证据。',edited_fft_not_in_saved_comparison:'新比较未包含已修改峰位所属的频谱。',removed_anchor_binding_unresolved:'已移除标记与原测量的关系尚未明确，不能自动视为更新完成。',different_source_frame:'当前源帧与比较来源不同。',different_saved_fft:'当前 FFT 不属于这份比较的两个保存频谱；请返回对应证据。',different_calibration_revision:'标定版本已改变，旧物理测量不能作为当前结果。',saved_roi_geometry_changed:'ROI 位置已修改，旧比较需要复核。',new_measurement_not_in_saved_comparison:'已有新测量，尚未更新候选比较。',saved_scientific_anchor_changed:'科学峰位已修订，旧比较需要更新。',unsaved_scientific_anchor_draft:'有未保存的科学位置草稿。'};
  for(const why of Array.isArray(e.currentness_reasons)?e.currentness_reasons.slice(0,12):[])host.append(this.node('p',reasonLabels[String(why)]??why));
  const source=row(p.source),nav=this.node('div');nav.className='evidence-navigation';const show=(label:string,objectId:unknown)=>{if(!id(objectId))return;const b=this.node('button',label);b.disabled=disabled;b.onclick=()=>this.run(()=>this.options.onNavigate(objectId));nav.append(b);};show('返回观察原图',source.observation_view_object_id);for(const [i,d]of rows(p.domains,2).entries())show(`查看 ROI ${i+1} 的已保存 FFT`,d.interaction_view_object_id??d.current_image_object_id??d.fft_object_id);host.append(nav);
  if(typeof p.image_png_base64==='string'&&p.image_png_base64.length<=4*1024*1024){const img=this.node('img');img.alt='有限候选与实际测量的保存比较图；不是科学数组';img.src='data:image/png;base64,'+p.image_png_base64;host.append(img);const enlarge=this.node('button','放大比较图（展示副本）');enlarge.onclick=()=>{this.el('crystal-image').src=img.src;this.el('crystal-image-status').textContent=crystalCurrentnessLabel(e.currentness);this.el('crystal-image-dialog').showModal();};host.append(enlarge);}
  for(const c of rows(p.candidates,3)){const section=this.node('section');section.append(this.node('h3',value(c.label)),this.node('p',crystalStatusLabel(c.status)));for(const [i,s]of rows(c.sides,2).entries())section.append(this.node('p',`ROI ${i+1}：匹配 ${count(s.matched_count)}；实验未匹配 ${count(s.unmatched_experimental_count)}；模拟未匹配 ${count(s.unmatched_simulated_count)}；歧义检查记录 ${count(s.ambiguity_count)}`));host.append(section);}
  const semantics=this.node('section');renderResultSemantics(semantics,p,this.doc);host.append(semantics);
  const details=this.node('details');details.append(this.node('summary','参数、残差、未匹配与原记录（只读）'));const pre=this.node('pre');const {image_png_base64,...saved}=p;pre.textContent=JSON.stringify(saved,null,2);details.append(pre);host.append(details);
 }
}
