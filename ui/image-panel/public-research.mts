import type {BrowserDocument} from './browser-ports.mjs';
import type {StatisticsResultIdentity} from './research-leads-ui.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const phases:Record<string,string>={before_dispatch:'已记录原请求，正在执行',completed:'已核验完成',query_completed:'已查回原结果（未重算）',verified_failed:'原请求明确失败',refused_or_unverified:'未派发或结果待核对'};
const labels:Record<string,string>={idle:'可提问',starting:'正在连接官方 Codex／准备回合',running:'模型分析与工具核查中',completed:'本回合已完成，可在同会话续问',failed:'失败；保留原请求，不自动重发',unknown:'结果未知；保留原会话和请求，不自动重发',interrupted:'已中断；原科学请求结果仍以记录为准',awaiting_user:'等待用户处理；没有自动授权'};
export function publicResearchStatus(s:Row){const label=s.status==='completed'&&Array.isArray(s.operations)&&s.operations.length>=8?'本回合已完成；本会话 8 问额度已用完':labels[String(s.status)]??'状态待核对';return label+' · '+String(s.model??'模型尚未启动');}
const concise=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?String(Number(v.toPrecision(6))):'未知';
const refusals:Record<string,string>={QUESTION_LIMIT:'本会话已达 8 问上限；本问题未派发，输入保留。',BUSY:'原回合仍未结束；本问题未派发，输入保留。',STOPPED:'会话不再接收新问题；本问题未派发，输入保留。',INVALID_QUESTION:'问题或发送范围未通过检查；本问题未派发，输入保留。',ORIGINAL_ID_CONFLICT:'原操作身份不符；本问题未派发，输入保留。'};
export class PublicResearchUI {
 private packet:Row={};private posting=false;private selectingResult=false;private uncertain:{id:string;question:string}|null=null;private refusal:string|null=null;private signature='';private turnCount=0;
 constructor(private document:BrowserDocument,private api:(url:string,body?:Readonly<Row>)=>Promise<unknown>,private returnSource:(id:string,rect?:number[])=>Promise<void>,openResearch:()=>void=()=>{},private useStatistics?:(identity:StatisticsResultIdentity)=>Promise<unknown>){
  this.el('public-research-entry').hidden=true;
  this.el('public-research-entry').onclick=()=>{if(this.packet.enabled!==true)return;openResearch();this.el('public-research-question').focus();};
  this.el('public-research-question').oninput=()=>this.renderPreview();
  this.el('public-research-send').onclick=()=>{void this.submit();};
  this.el('public-research-interrupt').onclick=()=>{void this.stop();};
  this.el('public-research-query').onclick=()=>{void this.poll();};
  this.el('public-research-return').onclick=()=>{void this.showSource();};
 }
 private el(id:string){return this.document.getElementById(id)!;}
 async poll(){try{this.render(row(await this.api('/api/public-research')));}catch{this.el('public-research-status').textContent='无法核对当前状态；输入保留，请勿重复发送。';}}
 private renderPreview(){
  const preview=row(this.packet.send_preview),target=this.el('public-research-send-preview');
  if(typeof preview.question_prefix!=='string'||typeof preview.question_suffix!=='string'||!Array.isArray(preview.tools)||preview.images!==false||preview.pixels!==false||preview.provider_raw_content!==false){target.textContent='当前服务未提供可核对的纯文本发送预览；此处不推测发送文本。';return;}
  target.textContent=JSON.stringify({text:preview.question_prefix+this.el('public-research-question').value+preview.question_suffix,tools:preview.tools.map(raw=>{const t=row(raw);return {name:t.name,description:t.description,inputSchema:t.inputSchema};}),images:false,pixels:false,provider_raw_content:false},null,2);
 }
 private render(s:Row){
  this.packet=s;if(this.uncertain&&Array.isArray(s.operations)&&s.operations.some(raw=>row(raw).id===this.uncertain!.id)){if(this.el('public-research-question').value===this.uncertain.question)this.el('public-research-question').value='';this.el('public-research-approved').checked=false;this.uncertain=null;}this.el('public-research').hidden=s.enabled!==true;this.el('public-research-entry').hidden=s.enabled!==true;if(!s.enabled)return;
  this.el('public-research-notice').textContent=s.notice;
  this.el('public-local-question-notice').hidden=false;
  this.el('public-research-source').textContent=JSON.stringify(s.source,null,2);this.renderPreview();
  const host=row(s.host),terminal=['failed','unknown','interrupted'].includes(String(s.status));
  this.el('public-research-send').disabled=this.posting||this.uncertain!==null||s.active===true||s.session_stopped===true||terminal||Array.isArray(s.operations)&&s.operations.length>=8;
  this.el('public-research-interrupt').disabled=s.can_interrupt!==true;
  const warnings=row(s.protocol_diagnostics);const issueCount=Number(warnings.issues_emitted??0);
  this.el('public-research-status').textContent=(this.uncertain?'发送未确认；输入保留，核对原操作，不重发。':this.refusal??publicResearchStatus(s))+(issueCount?' · 有协议诊断，请核对本地会话记录':'')+(s.session_stopped?' · 不再接收新问题':'')+(s.active&&['failed','closed','closing'].includes(String(host.connection))?' · 宿主控制不可用，原回合结果未知；仅保留已有记录核对':s.active&&s.can_interrupt!==true&&!s.session_stopped?' · 当前无法控制宿主；保留原记录核对':s.active&&s.session_stopped?' · 停止请求后等待原回合终态，尚未确认结束':'')+(host.turn_state==='awaiting_user'?' · 等待处理，没有自动授权':'');
  const signature=JSON.stringify([s.operations,s.tool_calls,this.useStatistics?[s.active,host.thread_id,row(s.source).frame_id]:null]);if(signature===this.signature)return;this.signature=signature;
  const turns=this.el('public-research-turns'),operations=Array.isArray(s.operations)?s.operations.map(row):[];
  const openness=operations.length===this.turnCount?new Map(Array.from(turns.children).map(e=>[e.dataset.operationId,e.open])):new Map<string|undefined,boolean>();this.turnCount=operations.length;turns.replaceChildren();
  for(const [index,op] of operations.entries()){
   const section=this.document.createElement('details'),title=this.document.createElement('summary'),question=this.document.createElement('p');section.dataset.operationId=String(op.id);section.open=openness.get(String(op.id))??index===operations.length-1;
   title.textContent='第 '+(index+1)+' 问 · '+(labels[String(op.state)]??'状态待核对');question.textContent=op.question;section.append(title,question);
   const messages=Array.isArray(op.messages)?op.messages.map(row):[],finals=messages.filter(m=>m.phase==='final_answer'),answers=finals.length?finals:messages.slice(-1);
   for(const m of answers){const answer=this.document.createElement('pre');answer.tabIndex=0;answer.textContent='模型回答：'+m.text;section.append(answer);}
   const process=this.document.createElement('details'),processTitle=this.document.createElement('summary');processTitle.textContent='过程说明与会话引用';process.append(processTitle);
   for(const m of messages.filter(m=>!answers.includes(m))){const note=this.document.createElement('pre');note.textContent=m.text;process.append(note);}
   const identity=this.document.createElement('p');identity.textContent='会话 '+host.thread_id+' · 操作 '+op.id+' · 回合 '+String(op.turn_id??'尚未确认');process.append(identity);section.append(process);
   if(op.error){const error=this.document.createElement('p');error.textContent=op.error;section.append(error);}turns.append(section);
  }
  const results=this.el('public-research-results'),trace=this.el('public-research-trace-entries');results.replaceChildren();trace.replaceChildren();
  const outcomes=new Map<string,unknown>(),verified=new Map<string,Row>();let refused=0;
  for(const entry of Array.isArray(s.tool_calls)?s.tool_calls.map(row):[]){const output=row(entry.output),note=this.document.createElement('details'),label=this.document.createElement('summary'),identity=this.document.createElement('pre');
   label.textContent=String(entry.tool)+' · '+(phases[String(entry.phase)]??'状态待核对');identity.textContent=JSON.stringify({thread_id:entry.threadId,turn_id:entry.turnId,call_id:entry.callId,request_id:entry.request_id,original_request_id:entry.original_request_id,status:entry.status,output:entry.output},null,2);note.append(label,identity);trace.append(note);
   if(entry.status==='not_dispatched')refused++;
   if(typeof entry.request_id==='string')outcomes.set(entry.request_id,output.status??entry.status??(entry.phase==='before_dispatch'?'running':'unknown'));
   if(output.status==='completed'&&typeof entry.request_id==='string'&&!verified.has(entry.request_id))verified.set(entry.request_id,entry);
  }
  const statuses=[...outcomes.values()];this.el('public-research-tool-summary').textContent=verified.size+' 个已核验结果 · '+statuses.filter(s=>s==='running').length+' 个执行中 · '+statuses.filter(s=>s==='failed').length+' 个明确失败 · '+statuses.filter(s=>!['completed','failed','running'].includes(String(s))).length+' 个原结果未知'+(refused?' · '+refused+' 次未派发（详见执行记录）':'');
  for(const entry of verified.values()){const output=row(entry.output),stats=row(output.statistics),item=this.document.createElement('section');item.className='public-stat-result';
   if(output.status==='completed'){
    const roi=this.document.createElement('p'),values=this.document.createElement('p');roi.textContent='ROI '+JSON.stringify(output.source_rect_xyxy)+'（像素半开区间）';values.textContent='均值 '+concise(stats.mean)+' · 标准差 '+concise(stats.stddev)+' · '+concise(stats.sample_count)+' 个像素';item.append(roi,values);
    const inspect=this.document.createElement('button');inspect.textContent='原始数值与引用';inspect.onclick=()=>{this.el('public-research-result-detail').textContent=JSON.stringify({thread_id:entry.threadId,turn_id:entry.turnId,call_id:entry.callId,...output},null,2);};
    const back=this.document.createElement('button');back.textContent='定位原图 ROI';back.onclick=()=>{void this.showSource(output.source_rect_xyxy as number[]);};item.append(inspect,back);
    if(this.useStatistics){const use=this.document.createElement('button');use.textContent='用这条原统计整理线索';use.title='仅带入准确统计引用；须先应用同帧的本地问题。假设、关系、理由仍需明确填写，不自动采纳模型回答。';use.disabled=!this.resultIdentity(entry);use.onclick=()=>this.useResult(entry);item.append(use);}
   }
   results.append(item);
  }
 }
 private resultIdentity(entry:Row):StatisticsResultIdentity|null {
  const output=row(entry.output),s=this.packet,host=row(s.host),ops=Array.isArray(s.operations)?s.operations.map(row).filter(op=>op.thread_id===entry.threadId&&op.turn_id===entry.turnId&&op.state==='completed'):[];
  if(![entry.threadId,entry.turnId,entry.callId].every(id=>typeof id==='string'&&id.length>0&&id.length<=128)||s.enabled!==true||s.active===true||ops.length!==1||entry.threadId!==host.thread_id||!['completed','query_completed'].includes(String(entry.phase))||output.status!=='completed'||output.request_id!==entry.request_id||output.frame_id!==row(s.source).frame_id)return null;
  const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v),hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(output.input_object_id!==undefined&&(!id(output.input_object_id)||output.input_object_id!==s.source_view_id))return null;
  if(!id(output.object_id)||!id(output.frame_id)||typeof output.request_id!=='string'||!/^text_tool_[a-f0-9]{32}$/.test(output.request_id)||!hash(output.manifest_sha256)||!hash(output.input_manifest_sha256)||!hash(output.statistics_sha256))return null;
  return {result_id:output.object_id,request_id:output.request_id,...(output.input_object_id!==undefined?{input_view_id:output.input_object_id as string}:{}),frame_id:output.frame_id,manifest_sha256:output.manifest_sha256,input_manifest_sha256:output.input_manifest_sha256,statistics_sha256:output.statistics_sha256};
 }
 private async useResult(entry:Row){
  if(this.selectingResult||!this.useStatistics)return;
  const rows=Array.isArray(this.packet.tool_calls)?this.packet.tool_calls.map(row):[],current=rows.find(r=>r.threadId===entry.threadId&&r.turnId===entry.turnId&&r.callId===entry.callId&&r.request_id===entry.request_id&&r.phase===entry.phase),identity=current&&this.resultIdentity(current);
  if(!identity){this.el('public-research-source-status').textContent='原回合或准确结果尚未核对；未整理线索。';return;}
  this.selectingResult=true;
  try{if(await this.useStatistics(identity)===false)throw Error('来源已改变，请重新核对。');this.el('public-research-source-status').textContent='原统计已带入本地线索草稿；假设、关系和理由仍需人工填写并应用，模型回答未采纳。';}
  catch(error){this.el('public-research-source-status').textContent='未整理线索：'+(error as Error).message;}
  finally{this.selectingResult=false;}
 }
 private async submit(){
  if(this.posting||this.uncertain||this.packet.active)return;
  if(Array.isArray(this.packet.operations)&&this.packet.operations.length>=8){this.refusal=refusals.QUESTION_LIMIT;this.render(this.packet);return;}
  if(!this.el('public-research-approved').checked){this.el('public-research-status').textContent='请先核对并确认发送范围。';return;}
  const question=this.el('public-research-question').value;if(!question.trim())return;
  this.posting=true;this.refusal=null;this.el('public-research-send').disabled=true;
  // This identity is retained by the backend; a repeated click cannot replay it.
  const id='ui-'+(globalThis as unknown as {crypto:{randomUUID():string}}).crypto.randomUUID();
  try{const next=row(await this.api('/api/public-research',{action:'question',id,question,approved:true,context_sha256:this.packet.context_sha256})),refusal=row(next.public_research_refusal);
   if(next.enabled!==true||!Array.isArray(next.operations))throw Error('Unverified submission receipt');
   if(refusal.id===id&&refusal.disposition==='not_dispatched'&&typeof refusal.code==='string'&&Object.hasOwn(refusals,refusal.code)){this.refusal=refusals[refusal.code];this.render(next);return;}
   if(!next.operations.some(raw=>row(raw).id===id&&row(raw).question===question))throw Error('Original operation not confirmed');
   this.el('public-research-question').value='';this.el('public-research-approved').checked=false;this.render(next);}
  catch{this.uncertain={id,question};this.el('public-research-status').textContent='发送未确认；输入保留，正在核对原操作。不会自动重发。';await this.poll();}
  finally{this.posting=false;this.render(this.packet);}
 }
 private async stop(){try{this.render(row(await this.api('/api/public-research',{action:'interrupt'})));}catch{this.el('public-research-status').textContent='中断结果未知；核对原会话，不重复提交。';}}
 private async showSource(rect?:number[]){try{await this.returnSource(String(this.packet.source_view_id),rect);this.el('public-research-source-status').textContent='已定位原图 ROI '+JSON.stringify(rect??[0,0,64,64])+'（像素半开区间）；仅本地定位，不计算或发送图片。';}catch{this.el('public-research-status').textContent='原图定位未完成；请先处理现有编辑，原结果保留。';}}
}
