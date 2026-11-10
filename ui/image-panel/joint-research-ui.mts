/** Local-only UI over the existing Panel contracts; not a send/host adapter.
 * readState(): AppState — object.object_id, frame_identity.frame_object_id,
 * state_revision, research_question, object.panels/calibration/user_context,
 * joint_research.{status,host,history,unresolved_request_ids}.
 * readMeasurements(viewId): GET /api/measurements?object_id=<exact current view>
 * => {object_id,state_revision,current:{object_id,...},entries:[{object_id,
 * measurement_object_id,status,same_frame,same_grid,coordinate_space,points,...}]}.
 * readStatistics(viewId): GET /api/statistics-history?object_id=<same exact view>
 * => {read_only:true,object_id,frame_object_id,scope:'same_frame_source_pixels',
 * entries:[{object_id,frame_object_id,component,source_rect_xyxy,statistics,...}]}.
 * Provider/backend guards remain authoritative. This helper sends only explicit
 * selected IDs to onReview; it never edits a question or creates/resumes a host.
 * A correction callback must explicitly apply its text as the current question
 * before owner.beginCorrection. No backend mutation is performed by this module.
 * BrowserElement is the repository's ES2022-only structural HTMLElement port.
 */
import type {BrowserElement} from './browser-ports.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(row):[];
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const text=(v:unknown)=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):'未知';
const coordinateText=(v:unknown)=>Array.isArray(v)?'['+v.map(text).join(', ')+']':'未知';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function need(v:unknown,message:string):asserts v{if(!v)throw Error(message);}
export interface JointResearchDialogRequest {
 selection:{measurement_ids:string[];statistics_ids:string[]};
 correction?:{text:string;original_thread_id:string;original_turn_id:string};
}
export interface JointResearchDialogOptions {
 root:BrowserElement;readState:()=>unknown;
 readMeasurements:(objectId:string)=>Promise<unknown>;
 readStatistics:(objectId:string)=>Promise<unknown>;
 onReview:(request:JointResearchDialogRequest)=>unknown|Promise<unknown>;
 onError:(error:Error)=>void;
}
interface Binding {view:string;frame:string;revision:number;rect:number[];question:unknown;}
function binding(value:unknown):Binding {
 const s=row(value),o=row(s.object),f=row(s.frame_identity),panels=list(o.panels),p=panels[0];
 need(id(o.object_id)&&id(f.frame_object_id)&&Number.isSafeInteger(s.state_revision),'当前图像、帧或修订尚未明确；未开始核对。');
 need(panels.length===1&&p.domain==='spatial_pixels'&&p.source_object_id===f.frame_object_id,'本次只核对准确的单幅保存空间图，不自动换图。');
 const r=p.source_rect_xyxy;
 need(Array.isArray(r)&&r.length===4&&r.every(n=>typeof n==='number'&&Number.isFinite(n))&&r[2]>r[0]&&r[3]>r[1],'当前图的源像素范围尚未明确。');
 return {view:o.object_id,frame:f.frame_object_id,revision:s.state_revision as number,rect:[...r] as number[],question:s.research_question===undefined?null:JSON.parse(JSON.stringify(s.research_question))};
}
function matching(current:Binding,captured:Binding){return current.view===captured.view&&current.frame===captured.frame&&current.revision===captured.revision&&same(current.rect,captured.rect)&&same(current.question,captured.question);}
function completedHost(value:unknown){
 const j=row(row(value).joint_research),h=row(j.host);
 if(j.status!=='completed'||h.connection!=='ready'||h.turn_state!=='completed'||typeof h.thread_id!=='string'||!h.thread_id||typeof h.turn_id!=='string'||!h.turn_id||Array.isArray(j.unresolved_request_ids)&&j.unresolved_request_ids.length)return null;
 return {thread:h.thread_id,turn:h.turn_id};
}
function blocked(value:unknown):string|null {
 const j=row(row(value).joint_research);
 if(Array.isArray(j.unresolved_request_ids)&&j.unresolved_request_ids.length)return '原科学请求尚未核对；只查询原请求，不另开任务。';
 if(['starting','running','stopping','unknown'].includes(String(j.status)))return '原回合尚未明确结束；不能开始替代回合。';
 if(j.locked===true)return '当前原输入正在核对；先处理原核对窗口，不开始第二次核对。';
 if(j.host&&!completedHost(value))return '当前宿主不是可纠正的已完成原回合；保留原记录，不创建替代会话。';
 return null;
}
const inside=(rect:unknown,bounds:number[])=>Array.isArray(rect)&&rect.length===4&&rect.every(n=>typeof n==='number'&&Number.isFinite(n))&&rect[0]>=bounds[0]&&rect[1]>=bounds[1]&&rect[2]<=bounds[2]&&rect[3]<=bounds[3]&&rect[2]>rect[0]&&rect[3]>rect[1];
export function createJointResearchDialog(options:JointResearchDialogOptions){
 const doc=options.root.ownerDocument,make=(tag:string,value?:string)=>{const e=doc.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
 const dialog=make('dialog');dialog.className='joint-research-dialog';dialog.setAttribute('aria-label','核对本次图像与已保存证据（不发送）');
 const title=make('h2','本次图像、已存证据与纠正（仅本地）'),notice=make('p','本地预览与核对可用；真实模型发送在此候选停用、未验收。');
 const context=make('section'),measurements=make('section'),statistics=make('section'),previous=make('section'),correctionSection=make('section');
 const correctionLabel=make('label','明确纠正原问题（先应用，再核对；不发送）'),correction=make('textarea');correction.maxLength=2000;correction.setAttribute('aria-label','明确纠正原回合的问题');correctionLabel.append(correction);correctionSection.append(correctionLabel,make('p','原回答保留；填写纠正后沿同一原回合核对，不创建替代会话。'));
 const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const review=make('button','核对本次图像与证据（不发送）'),cancel=make('button','取消，保留原图与记录');review.type=cancel.type='button';
 dialog.append(title,notice,context,measurements,statistics,previous,correctionSection,status,review,cancel);options.root.append(dialog);
 let captured:Binding|null=null,capturedHost:ReturnType<typeof completedHost>=null,epoch=0,busy=false,ready=false;
 const measurementChoices=new Map<string,BrowserElement>(),statisticsChoices=new Map<string,BrowserElement>();
 function fail(error:unknown){const e=error instanceof Error?error:Error(String(error));status.textContent='本地核对未完成：'+e.message;options.onError(e);}
 function details(parent:BrowserElement,label:string,value:unknown){const d=make('details'),summary=make('summary',label);d.append(summary,make('pre',JSON.stringify(value,null,2)));parent.append(d);}
 function selection(){return {measurement_ids:[...measurementChoices].filter(([,e])=>e.checked).map(([k])=>k),statistics_ids:[...statisticsChoices].filter(([,e])=>e.checked).map(([k])=>k)};}
 function update(){const picked=selection();review.disabled=busy||!ready||Boolean(capturedHost&&!correction.value.trim());cancel.disabled=busy;if(ready&&!busy)status.textContent='已选测量 '+picked.measurement_ids.length+'/32，统计 '+picked.statistics_ids.length+'/32。仅进入本地范围核对，不派发模型或科学计算。'+(capturedHost&&!correction.value.trim()?' 如需接续原回合，请明确填写纠正问题。':'');}
 function choice(parent:BrowserElement,choices:Map<string,BrowserElement>,objectId:string,label:string,value:unknown){const wrapper=make('div'),l=make('label'),input=make('input');input.type='checkbox';input.checked=false;input.setAttribute('aria-label',label);input.onchange=update;choices.set(objectId,input);l.append(input,make('span',label));wrapper.append(l);details(wrapper,'查看原记录身份、数值与条件',value);parent.append(wrapper);}
 function showContext(s:Row,b:Binding){
  context.replaceChildren();context.append(make('h3','当前保存图与研究问题'));
  const o=row(s.object),q=row(s.research_question),c=row(o.user_context),panels=list(o.panels),cal=o.xy_calibration??o.calibration_record??o.calibration;
  context.append(make('p','源像素范围 '+coordinateText(b.rect)+'；显示形状 '+coordinateText(o.shape_yx)+'；dtype '+text(o.dtype)+'。PNG仅供显示，数值来自原科学数组。'));
  context.append(make('p','当前选区：'+(s.selection?text(row(s.selection).kind)+' '+coordinateText(row(s.selection).coordinates):'无临时选区；本次范围是上述保存图。')));
  context.append(make('p','已应用问题：'+(typeof q.text==='string'?q.text:'尚无已应用问题')));
  context.append(make('p','来源（用户声明）：'+text(c.input_origin)+'；模态 '+text(c.modality)+'；'+text(c.source_text)));
  const cr=row(cal),scale=row(cr.xy_scale),hasScale=cr.status==='active'&&typeof scale.x==='number'&&Number.isFinite(scale.x)&&scale.x!==0&&typeof scale.y==='number'&&Number.isFinite(scale.y)&&scale.y!==0;
  context.append(make('p',hasScale?'每像素距离：X='+text(scale.x)+'，Y='+text(scale.y)+' '+text(scale.unit)+'/px；原标定来源、人工修订与不确定性见详情，缺失条件仍未知。':'物理标尺未在此摘要确认；保持像素域，不补尺度。原标定可在详情核对。'));
  const png=s.png_base64??s.clean_png_base64;
  if(typeof png==='string'&&png.startsWith('iVBORw0KGgo')){const image=make('img');image.className='joint-research-image';image.alt='当前保存图的本地显示预览，不是科学数组';image.src='data:image/png;base64,'+png;context.append(image);}
  details(context,'查看原图、帧、源范围、标定和修订身份',{view_object_id:b.view,frame_object_id:b.frame,state_revision:b.revision,panels,calibration:cal??null,source_identity:s.source_identity??null,user_context:o.user_context??null,question:s.research_question??null});
 }
 function showPrevious(s:Row){
  previous.replaceChildren();previous.append(make('h3','原回合记录（只读保留，不是本次新回答）'));
  const j=row(s.joint_research),h=row(j.host),currentMessages=list(h.agent_messages);
  if(j.host){previous.append(make('p','当前原回合状态：'+text(j.status)+'。'+text(j.notice)));for(const m of currentMessages.slice(0,16))if(typeof m.text==='string')previous.append(make('p',m.text));details(previous,'查看当前原会话与回合身份',{thread_id:h.thread_id??null,turn_id:h.turn_id??null,turn_state:h.turn_state??null,confirmation:j.confirmation??null});}
  const history=list(j.history).slice(0,16);
  for(const item of history){const d=make('details');d.append(make('summary',(typeof item.question==='string'?item.question:'历史问题')+' · '+text(item.status)),make('p',text(item.notice)));for(const m of list(item.agent_messages).slice(0,16))if(typeof m.text==='string')d.append(make('p',m.text));details(d,'查看此历史记录的原身份',{review_id:item.review_id??null,source_view_id:item.source_view_id??null,frame_id:item.frame_id??null,thread_id:item.thread_id??null,turn_id:item.turn_id??null});previous.append(d);}
  if(!j.host&&!history.length)previous.append(make('p','没有原已完成宿主回合；本次只核对当前保存输入，不创建会话。'));
 }
 async function open(){
  const ticket=++epoch;ready=false;busy=false;captured=null;capturedHost=null;measurementChoices.clear();statisticsChoices.clear();correction.value='';correctionSection.hidden=true;review.disabled=true;cancel.disabled=false;status.textContent='正在只读核对当前保存图与可选证据；不派发计算或模型。';measurements.replaceChildren();statistics.replaceChildren();previous.replaceChildren();context.replaceChildren();
  try{
   const s=row(options.readState()),b=binding(s);captured=b;capturedHost=completedHost(s);showContext(s,b);showPrevious(s);correctionSection.hidden=!capturedHost;dialog.showModal();
   const [mraw,traw]=await Promise.all([options.readMeasurements(b.view),options.readStatistics(b.view)]);
   if(ticket!==epoch||!dialog.open)return;
   need(matching(binding(options.readState()),b),'当前图像、帧、范围、问题或修订已变化；请关闭后重新核对。');
   const m=row(mraw),t=row(traw);
   need(m.object_id===b.view&&m.state_revision===b.revision&&row(m.current).object_id===b.view&&Array.isArray(m.entries),'测量列表没有绑定打开时的准确图像与修订。');
   need(t.read_only===true&&t.object_id===b.view&&t.frame_object_id===b.frame&&t.scope==='same_frame_source_pixels'&&Array.isArray(t.entries),'统计历史没有绑定当前同一源帧。');
   const ms=list(m.entries).filter(e=>id(e.measurement_object_id??e.object_id)&&e.status==='current'&&e.same_frame===true&&e.same_grid===true&&(e.annotation_id==null||e.annotation_matches_current===true)&&e.coordinate_space==='source_pixels'&&Array.isArray(e.points)&&e.points.length>=2&&e.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n))&&p[0]>=b.rect[0]&&p[0]<=b.rect[2]&&p[1]>=b.rect[1]&&p[1]<=b.rect[3]));
   const ts=list(t.entries).filter(e=>id(e.object_id)&&e.frame_object_id===b.frame&&e.component==='raw'&&e.coordinate_space==='source_pixels'&&inside(e.source_rect_xyxy,b.rect));
   need(new Set(ms.map(e=>e.measurement_object_id??e.object_id)).size===ms.length&&new Set(ts.map(e=>e.object_id)).size===ts.length,'证据列表含重复身份；未自动选择。');
   measurements.append(make('h3','选择已保存的当前测量（可不选）'),make('p','只列同源同网格、当前有效且在本图范围内的记录；旧/失效测量仍保留在原历史。最多显示并选择32条。'));
   for(const e of ms.slice(0,32)){const label=(typeof e.name==='string'&&e.name?e.name:'已保存测量')+' · '+text(e.measurement_kind??e.measurement_type)+' · '+(typeof e.distance_pixels==='number'?text(e.distance_pixels)+' px':typeof e.angle_image_degrees==='number'?text(e.angle_image_degrees)+'°':'数值见原记录');choice(measurements,measurementChoices,String(e.measurement_object_id??e.object_id),label,e);}
   if(!ms.length)measurements.append(make('p','没有可选的当前测量；不自动重测。'));if(ms.length>32||m.truncated===true)measurements.append(make('p','列表已按展示预算截断；未列记录不能在此选择，可返回原测量历史核对。'));
   statistics.append(make('h3','选择已保存同帧原数组统计（可不选）'),make('p','只列当前保存图范围内的 raw 统计；ROI与来源以各原请求为准，统计不会随当前选区自动更新。最多显示并选择32条。'));
   for(const e of ts.slice(0,32)){const v=row(e.statistics),label='已保存统计 · ROI '+coordinateText(e.source_rect_xyxy)+' · n='+text(v.sample_count)+'，均值 '+text(v.mean)+'，标准差 '+text(v.stddev)+'（数值单位未独立确认）';choice(statistics,statisticsChoices,String(e.object_id),label,e);}
   if(!ts.length)statistics.append(make('p','没有可选的同帧原数组统计；不自动计算。'));if(ts.length>32||t.truncated===true)statistics.append(make('p','列表已按展示预算截断；未列记录不能在此选择，可返回原统计历史核对。'));
   const reason=blocked(options.readState()),q=row(b.question);need(!reason,reason??'原回合尚未稳定。');need(capturedHost||typeof q.text==='string'&&q.text.trim()&&q.context_object_id===b.view&&q.frame_object_id===b.frame,'先明确应用绑定当前保存图的研究问题。');ready=true;update();
  }catch(error){if(ticket!==epoch)return;fail(error);}
 }
 function close(){if(busy)return;epoch++;ready=false;captured=null;capturedHost=null;dialog.close();}
 cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});correction.oninput=update;
 review.onclick=async()=>{
  if(busy||!ready||!captured)return;
  try{
   const now=options.readState();need(matching(binding(now),captured),'当前图像、帧、范围、问题或修订已变化；未开始核对，请重新打开。');const reason=blocked(now);need(!reason,reason??'原回合尚未稳定。');
   const selected=selection();need(selected.measurement_ids.length<=32&&selected.statistics_ids.length<=32,'每类最多选择32条保存证据。');
   const request:JointResearchDialogRequest={selection:selected};
   if(capturedHost){const h=completedHost(now);need(h&&h.thread===capturedHost.thread&&h.turn===capturedHost.turn,'原已完成thread/turn已变化；不创建替代会话。');need(correction.value.trim()&&correction.value.length<=2000,'请明确填写不超过2000字的纠正问题。');request.correction={text:correction.value,original_thread_id:h.thread,original_turn_id:h.turn};}
   busy=true;update();status.textContent='正在核对本次原输入；不要重复提交。没有模型发送入口。';await options.onReview(request);busy=false;close();
  }catch(error){if(busy)ready=false;busy=false;update();fail(error);}
 };
 return {open,close};
}
