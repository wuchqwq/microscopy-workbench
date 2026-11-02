// Presentation only; existing providers remain the numerical authority.
import {roiObservationModel} from './roi-observations.mjs';
import {renderResultSemantics} from './result-semantics.mjs';
import {renderGpaEvidence} from './gpa-evidence.mjs';
import type {PanelRoiSnapshot,RoiDependencySnapshot,RoiObservationModel,PanelInteractionGate} from './roi-observations.mjs';
import type {BrowserDocument} from './browser-ports.mjs';
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
export function agentContinuationText(model:RoiObservationModel,panelId:unknown,evidence?:unknown){
 const saved=model.rows.filter(r=>r.usable&&r.status==='saved');
 const retained=retainedObservationContext(evidence);
 if(model.packet.interaction_gate.status!=='ready')throw new Error(handoffNotice(model.packet.interaction_gate));
 if((!saved.length&&!retained)||model.packet.draft_state.requires_user_commit)throw new Error('先保存观察并结束草稿；未保存选区不是正式科学 ROI。');
 const context=saved.length?saved.map((r,i)=>`${i+1}. ${r.label}：${r.reason??'观察理由未知，请先核对'}；annotation_id=${r.annotation_id}；${observationOriginLabel(r)}；源像素处理边界 [${r.rect_xyxy?.join(', ')}]。`):['当前是 FFT 或另一保存视图；以下是原观察引用，不是当前图上的新 ROI。',...retained!.observations.map((r,i)=>`${i+1}. ${value(r.text)}：${value(r.reason)}；原处理边界 [${(r.rect_xyxy as number[]).join(', ')}]。`)];
 return ['继续当前显微分析。先读取此面板的当前状态，只使用已保存且来源明确的观察：',...context,...model.warnings,...(retained?[`已保存比较 ${retained.comparison_id}；状态 ${crystalCurrentnessLabel(retained.currentness)}。请复核原观察视图 ${retained.view_id}，不要把旧比较当作更新后的结果。`,...retained.latest.map(r=>`当前修订测量 object_id=${r.object_id}，原 request_id=${value(r.request_id)}；先查询并核对科学坐标/源 FFT。`)]:[]),'根据问题选择已有科学工具，复用合法 FFT；比较结构前核对候选来源、取向、标定与必要条件。修改过的尺度或 ROI 不可冒充旧输入。返回证据到同一面板，保留未匹配与未判，不确认唯一物相或孪晶。','当前界面不会自动唤醒模型。请调用 image_panel_current'+(id(panelId)?`，panel_id="${panelId}"`:'（多个面板时先明确连接）')+'，重新检查草稿和当前引用后再处理。'].join('\n');
}
interface Options {document:BrowserDocument;onSave:(reason:string)=>unknown;onSelect:(annotationId:string)=>unknown;onNavigate:(objectId:string)=>unknown;onError:(message:string)=>void;onDraftChange:()=>void;}
export class ResearchWorkspace {
 readonly doc:BrowserDocument;readonly options:Options;reasonDirty=false;model:RoiObservationModel|null=null;
 private previous:RoiDependencySnapshot|null=null;private selected:string|null=null;private scienceSignature='';private rowSignature='';
 constructor(options:Options){this.options=options;this.doc=options.document;
  this.el('roi-reason').oninput=()=>{this.reasonDirty=true;options.onDraftChange();};
  this.el('save-observation').onclick=()=>this.run(()=>options.onSave(this.el('roi-reason').value));
  this.el('copy-agent-prompt').onclick=()=>this.run(async()=>{const clipboard=(globalThis as {navigator?:{clipboard?:{writeText(text:string):PromiseLike<void>}}}).navigator?.clipboard;if(!clipboard)throw new Error('浏览器无法复制；请手动复制下面的提示。');await clipboard.writeText(this.el('agent-prompt').value);this.el('agent-copy-status').textContent='已复制；粘贴给已连接的 Agent 并说继续。尚未自动执行。';});
 }
 private el(name:string){return this.doc.getElementById(name)!;}
 private node(tag:string,text?:unknown){const n=this.doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 private async run(fn:()=>unknown){try{await fn();}catch(e){this.options.onError((e as Error).message);}}
 clearReason(){this.reasonDirty=false;this.selected=null;this.el('roi-reason').value='';}
 render(state:PanelRoiSnapshot,{busy=false,gesture=false}={}){
  const model=roiObservationModel(state,this.previous);this.model=model;if(!this.previous||this.previous.source_frame_object_id!==model.source.frame_object_id)this.previous=model.dependency_snapshot;
  const usable=model.rows.filter(r=>r.usable&&r.status==='saved'),selected=model.rows.find(r=>r.selected),current=model.current_selection;
  const retained=retainedObservationContext(state.crystal_evidence);this.el('research-count').textContent=model.rows.length?`${usable.length} 处已保存观察`:retained?`${retained.observations.length} 处原观察 · 另一保存视图`:'0 处已保存观察';this.el('research-source').textContent=`${model.source.filename??'来源未知'} · ${model.source.frame_index===null?'帧未知':`第 ${model.source.frame_index+1} 帧`}`;
  const scale=model.calibration.xy_scale;this.el('research-calibration').textContent=scale?`XY ${scale.x} / ${scale.y} ${scale.unit}/px · 标定版本 ${model.calibration.revision} · ${model.calibration.source==='user_statement_not_independently_verified'?'用户声明，未独立验证':value(model.calibration.source)}`:'物理标尺未知或已撤回 · 像素域观察仍可继续';
  this.el('roi-current').textContent=current?.usable?`${selected?'已保存观察的当前选择':'未保存选区'} · 实际处理边界 [${current.rect_xyxy?.join(', ')}]（源像素，向外取整）`:'在原图框选 ROI 后保存观察理由。频域峰位使用测量。';
  if(!this.reasonDirty&&this.selected!==(selected?.annotation_id??null)){this.selected=selected?.annotation_id??null;this.el('roi-reason').value=selected?.reason??'';}
  this.el('roi-reason').disabled=busy||gesture;
  this.el('save-observation').disabled=busy||gesture||!current?.usable;this.el('save-observation').textContent=selected?'更新这条观察说明':'保存 ROI 观察';
  this.el('observation-draft-state').textContent=this.reasonDirty?'说明尚未保存；Agent 不会把它当作正式观察。':model.packet.interaction_gate.status!=='ready'?handoffNotice(model.packet.interaction_gate):'保存仅记录位置与理由，不确认物相。';
  this.el('agent-continue').disabled=busy||gesture||this.reasonDirty||model.packet.interaction_gate.status!=='ready'||(!usable.length&&!retained);this.el('save-observation-entry').disabled=busy||gesture||!current?.usable;
  const signature=JSON.stringify([model.rows,retained?.view_id]);if(signature!==this.rowSignature){this.rowSignature=signature;const list=this.el('roi-observations');list.replaceChildren();for(const r of model.rows){const li=this.node('li');li.className=r.selected?'selected-observation':'';const b=this.node('button',r.label);b.disabled=!r.usable;b.title=r.eligibility_reason;b.onclick=()=>this.run(()=>r.annotation_id&&this.options.onSelect(r.annotation_id));li.append(b,this.node('small',({saved:'已保存',saved_with_draft:'保存版＋未提交草稿',retracted:'已撤回',unusable:'当前网格不可用'} as Row)[r.status]),this.node('p',r.reason??'观察理由未知'),this.node('small',observationOriginLabel(r)),this.node('small',r.rect_xyxy?`处理窗口 [${r.rect_xyxy.join(', ')}]`:'未选择可用处理窗口'));list.append(li);}if(!model.rows.length){if(retained){for(const r of retained.observations){const li=this.node('li'),b=this.node('button',value(r.text)+'（原保存视图）');b.onclick=()=>this.run(async()=>{await this.options.onNavigate(retained.view_id);await this.options.onSelect(String(r.annotation_id));});li.append(b,this.node('p',value(r.reason)),this.node('small','历史观察引用，不会投到当前 FFT 上'));list.append(li);}}else list.append(this.node('li','暂无保存观察；当前选区与保存记录相互独立。'));}}
  this.el('roi-warnings').replaceChildren(...model.warnings.map(w=>this.node('p',w)));renderGpaEvidence(this.el('gpa-evidence'),state.object,this.doc);renderResultSemantics(this.el('result-semantics'),state.object,this.doc);this.renderEvidence(state.crystal_evidence,busy||gesture);
 }
 showHandoff(state:PanelRoiSnapshot){if(this.reasonDirty)throw new Error('请先保存观察说明。');this.el('agent-prompt').value=agentContinuationText(roiObservationModel(state),state.panel_id,state.crystal_evidence);this.el('agent-copy-status').textContent='只交接已保存观察；复制后粘贴给已连接的 Agent。没有内嵌对话，也不会自动运行。';this.el('agent-handoff-dialog').showModal();}
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
