import type {BrowserDocument,BrowserElement,BrowserEnvironment,BrowserBlobConstructor,BrowserURL} from './browser-ports.mjs';
import type {ProbeResult,ProfileResult,ProfileSamples,NumericReply,ProbeState,ProbeSelection,ProbeBinding,PendingProbe} from './data-probe-contracts.mjs';
export type {ProbeResult,ProfileResult,ProfileSamples,ProbeState} from './data-probe-contracts.mjs';
declare const Blob:BrowserBlobConstructor;declare const URL:BrowserURL;declare const performance:{now():number};
type Environment=typeof globalThis & BrowserEnvironment;
export interface StatisticsInputNavigation {isCurrent?:()=>boolean;reference:StatisticsReference;context_object_id:string;display:{kind:'exact_saved_input'|'same_source_current_preview';object_id:string;manifest_sha256:string;};}
export interface DataProbesOptions {getState?:()=>ProbeState|null|undefined;api?:(url:'/api/probe',body:Readonly<Record<string,unknown>>)=>Promise<ProbeResult>;readStatisticsHistory?:()=>Promise<unknown>;onOpenStatisticsHistory?:()=>BrowserElement|null;showStatisticsInput?:(objectId:string,navigation?:StatisticsInputNavigation)=>Promise<void>;useStatistics?:(reference:StatisticsReference,contextObjectId:string)=>Promise<void|boolean>;onError?:(error:unknown)=>unknown;document?:BrowserDocument|null;interval?:number;setTimer?:(callback:()=>void,ms:number)=>unknown;clearTimer?:(id:unknown)=>void;now?:()=>number;}
// Scientific readouts from the same saved provider arrays used by MCP. Canvas
// colors are never sampled and pointer motion creates no scientific records.
import {tabularCell} from './measurement-workspace.mjs';
import {referenceFromStatistics,statisticsReference,sameResearchValue} from './research-leads.mjs';
import type {StatisticsReference} from './research-leads.mjs';
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const componentNames:Partial<Record<string,string>>={raw:'原始数值',real:'实部',imag:'虚部',amplitude:'幅值',power:'功率 |z|²'};
const componentName=(value:NumericReply|ProbeResult|null|undefined)=>{const name=componentNames[value?.component as string]??'未知分量';return value?.coordinate_space==='frequency_cycles_per_pixel'&&value.component!=='raw'?'FFT '+name.replace('|z|','|F|'):name;};
const numberText=(value:unknown)=>finite(value)?String(value):'未知';
const canonical=(value:unknown)=>JSON.stringify(value??null,(_key:string,item:unknown)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,(item as Record<string,unknown>)[key]])):item);
const same=(left:unknown,right:unknown)=>canonical(left)===canonical(right);
function objectBinding(state:ProbeState|null|undefined){return {object_id:state?.object?.object_id,state_revision:state?.state_revision};}
function sameBinding(state:ProbeState|null|undefined,binding:ProbeBinding){const now=objectBinding(state);return now.object_id===binding.object_id&&now.state_revision===binding.state_revision;}
export function probeText(result:ProbeResult|null|undefined){
 const component=componentName(result),sample=result?.samples?.[0];
 if(!sample)return '尚未读取光标点数值；统计与剖面见各自结果';
 const index=Array.isArray(sample.array_index_xy)?` · 原数组 [${sample.array_index_xy.join(', ')}]`:'';
 return `${component} ${numberText(sample.value)} · 坐标 [${(sample.point??[]).map(numberText).join(', ')}] ${result.coordinate_space==='frequency_cycles_per_pixel'?'cycles/pixel':'源数组坐标'}${index} · 最近邻；数值单位未声明`;
}
export function statisticsText(result:ProfileResult|null|undefined){
 const stats=result?.statistics;if(!stats)return '选择 ROI 后读取原数组统计';
 const roi=result.source_rect_xyxy??result.frequency_rect;
 return `${componentName(result)}${roi?' · 保存 ROI '+JSON.stringify(roi):''} · n=${numberText(stats.sample_count)} · 均值 ${numberText(stats.mean)} · 标准差 ${numberText(stats.stddev)} · 最小 ${numberText(stats.minimum)} · 最大 ${numberText(stats.maximum)} · 数值单位未声明`;
}
function profileData(result:ProfileResult|null|undefined):ProfileSamples{
 const samples=result?.samples;
 if(result?.kind!=='profile'||!samples||!Array.isArray(samples.value)||samples.value.length<2||samples.value.length>4096||!Array.isArray(samples.distance)||samples.distance.length!==samples.value.length)throw new Error('剖面数值或采样数量不完整（允许 2–4096 点）');
 for(const key of ['coordinates_xy','indices_xy'])if(!Array.isArray(samples[key as keyof ProfileSamples])||samples[key as keyof ProfileSamples]!.length!==samples.value.length)throw new Error('剖面科学坐标与数值数量不一致');
 if(samples.physical_distance!==null&&samples.physical_distance!==undefined&&(!Array.isArray(samples.physical_distance)||samples.physical_distance.length!==samples.value.length||typeof result.physical_distance_unit!=='string'||!result.physical_distance_unit))throw new Error('物理剖面轴缺少完整标定或单位');
 return samples as ProfileSamples;
}
export function exportProfileCSV(result:ProfileResult){
 const samples=profileData(result),columns=['sample','source_x','source_y','array_index_x','array_index_y','distance','distance_unit','physical_distance','physical_distance_unit','value','component','dtype','source_object_id','result_object_id','request_id','interpolation','line_width'];
 const rows=samples.value.map((value,index)=>[index,samples.coordinates_xy[index]?.[0],samples.coordinates_xy[index]?.[1],samples.indices_xy[index]?.[0],samples.indices_xy[index]?.[1],samples.distance![index],result.distance_unit,samples.physical_distance?.[index],result.physical_distance_unit,value,result.component,result.dtype,result.parent_object_id??result.source_object_id,result.object_id,result.request_id,result.sampling?.interpolation,result.sampling?.line_width]);
 return [columns,...rows].map(row=>row.map(value=>tabularCell(value)).join(',')).join('\r\n')+'\r\n';
}
// Plot positions are only presentation. Missing values split segments rather
// than being converted to zero or joined across an unmeasured interval.
export function profilePlot(result:ProfileResult,{width=560,height=200}:{width?:number;height?:number}={}){
 const samples=profileData(result),physical=Array.isArray(samples.physical_distance),distance:readonly unknown[]=(physical?samples.physical_distance:samples.distance)!;
 const finitePairs=samples.value.map((value,index)=>[distance![index],value]).filter(([x,y])=>finite(x)&&finite(y)) as [number,number][];
 if(!finitePairs.length)return {segments:[],xLabel:physical?result.physical_distance_unit:result.distance_unit,yLabel:componentName(result),range:null};
 const xs=finitePairs.map(pair=>pair[0]),ys=finitePairs.map(pair=>pair[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),left=64,right=20,top=22,bottom=42;
 let segment:number[][]=[],segments:number[][][]=[];for(let index=0;index<samples.value.length;index++){const x=distance![index],y=samples.value[index];if(!finite(x)||!finite(y)){if(segment.length)segments.push(segment);segment=[];continue;}segment.push([left+(x-xmin)/(xmax-xmin||1)*(width-left-right),height-bottom-(y-ymin)/(ymax-ymin||1)*(height-top-bottom)]);}if(segment.length)segments.push(segment);
 return {segments,xLabel:physical?result.physical_distance_unit:result.distance_unit,yLabel:componentName(result),range:{xmin,xmax,ymin,ymax}};
}
export function profileTicks(min:unknown,max:unknown,count=5){
 if(!finite(min)||!finite(max)||!Number.isInteger(count)||count<2||count>9)return [];
 if(min===max)return [min];return Array.from({length:count},(_,i)=>min+(max-min)*i/(count-1));
}
// Formatting alone must not collapse different ticks on a high-baseline axis.
// Keep the usual compact labels, increasing precision only when it is needed.
export function profileTickLabels(values:readonly unknown[],minimumPrecision=4){
 const distinct=new Set(values.filter(finite)).size;
 if(distinct<=1)return values.map(numberText);
 for(let precision=minimumPrecision;precision<=17;precision++){
  const labels=values.map(value=>finite(value)?String(Number(value.toPrecision(precision))):'未知');
  if(new Set(labels.filter((_label,index)=>finite(values[index]))).size===distinct)return labels;
 }
 return values.map(numberText);
}
export function profileReadout(result:ProfileResult,index:number){
 const samples=profileData(result);if(!Number.isInteger(index)||index<0||index>=samples.value.length)return null;
 return {index,x:samples.physical_distance?.[index]??samples.distance![index],unit:result.physical_distance_unit??result.distance_unit,
  value:samples.value[index],requested:samples.coordinates_xy[index],sampled:samples.sampled_coordinates_xy?.[index]??null,arrayIndex:samples.indices_xy[index],component:result.component};
}
export function nearestProfileSample(result:ProfileResult,x:unknown){
 const s=profileData(result),xs=s.physical_distance??s.distance;if(!finite(x))return null;let best=null,delta=Infinity;
 for(let i=0;i<xs.length;i++){if(!finite(xs[i])||!finite(s.value[i]))continue;const d=Math.abs((xs[i] as number)-x);if(d<delta){best=i;delta=d;}}return best;
}
export class DataProbes {
 declare getState:DataProbesOptions['getState'];declare api:DataProbesOptions['api'];declare onError:NonNullable<DataProbesOptions['onError']>;declare document:BrowserDocument|null|undefined;declare interval:number;declare setTimer:DataProbesOptions['setTimer'];declare clearTimer:DataProbesOptions['clearTimer'];declare now:()=>number;declare el:(id:string)=>BrowserElement|null|undefined;
 declare pending:PendingProbe|null;declare inflight:boolean;declare timer:unknown;declare sequence:number;declare lastStart:number;declare lastSelection:ProbeSelection|null;declare currentBinding:ProbeBinding|null;declare statistics:ProfileResult|null;declare profile:ProfileResult|null;declare lastResult:ProbeResult;
 openStatisticsHistory:(reference?:StatisticsReference)=>Promise<void>=async()=>{throw Error('统计历史读取不可用');};
 constructor({getState,api,readStatisticsHistory,onOpenStatisticsHistory,showStatisticsInput,useStatistics,onError=()=>{},document:doc=(globalThis as Environment).document,interval=125,setTimer=(globalThis as Environment).setTimeout?.bind(globalThis),clearTimer=(globalThis as Environment).clearTimeout?.bind(globalThis),now=()=>performance.now()}:DataProbesOptions={}){
  if(!finite(interval)||interval<100||interval>1000)throw new Error('Scientific probe throttle must be 100–1000 ms');
  Object.assign(this,{getState,api,onError,document:doc,interval,setTimer,clearTimer,now});this.el=(id:string)=>doc?.getElementById(id);this.pending=null;this.inflight=false;this.timer=null;this.sequence=0;this.lastStart=-Infinity;this.lastSelection=null;this.currentBinding=null;this.statistics=null;this.profile=null;
  if(this.el('probe-component'))this.el('probe-component')!.onchange=()=>{this.sequence++;this.pending=null;this.setProbeText('分量已切换；等待原数组采样');if(this.lastSelection)this.observe(this.lastSelection);};
  if(this.el('profile-csv')){this.el('profile-csv')!.disabled=true;this.el('profile-csv')!.onclick=()=>{try{if(!this.profile)throw new Error('先保存一条剖面');const url=URL.createObjectURL(new Blob(['\uFEFF',exportProfileCSV(this.profile)],{type:'text/csv;charset=utf-8'})),anchor=this.document!.createElement('a');anchor.href=url;anchor.download='mcp-dm-profile.csv';anchor.click();this.setTimer!(()=>URL.revokeObjectURL(url),1000);}catch(error){this.onError(error);}};}
  if(readStatisticsHistory&&doc){
   const dialog=this.el('statistics-history-dialog')!,status=this.el('statistics-history-status')!,host=this.el('statistics-history-rows')!;
   let returnFocus:BrowserElement|null=null,reading=false,historyGeneration=0;
   const element=(tag:string,text:unknown)=>{const e=doc.createElement(tag);e.textContent=text;return e;};
   const row=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
   const text=(value:unknown)=>value===null||value===undefined?'未知':String(value);
   const open=async(reference?:StatisticsReference)=>{
    const selected=reference?statisticsReference(reference):undefined,binding=objectBinding(getState?.());
    if(reading)return;reading=true;historyGeneration++;returnFocus=onOpenStatisticsHistory?.()??doc.activeElement??null;host.replaceChildren();status.textContent='正在只读核对已保存统计；不重新计算。';dialog.showModal();this.el('close-statistics-history')?.focus();
    try{
     const response=row(await readStatisticsHistory());
     if(response.schema_version!==1||response.read_only!==true||response.scope!=='same_frame_source_pixels'||response.object_id!==getState?.()?.object?.object_id||!Array.isArray(response.entries))throw new Error('统计历史来源无法核对；请从当前图像重新打开。');
     let entries=response.entries;
     if(selected){
      if(!sameBinding(getState?.(),binding)||response.frame_object_id!==selected.frame_id)throw Error('统计核查上下文已改变；未打开其他来源。');
      entries=entries.filter(value=>sameResearchValue(referenceFromStatistics(value),selected));
      if(entries.length!==1)throw Error('原统计引用未在本次历史清单中唯一核对，可能缺失、变化或清单截断；未使用另一条结果替代。');
     }
     status.textContent=`同一帧的已保存实空间统计 ${response.entries.length} 条 / 共 ${text(response.total)} 条${response.truncated?'；仅显示最近记录，清单已截断':''}。帧 ID：${text(response.frame_object_id)}。只作历史数值对照，不代表当前选区、周期、方向、应变或物理解释。`;
     if(selected)status.textContent='正在核查线索的准确原统计：结果 '+selected.result_id+' · 原请求 '+selected.request_id+'。仅显示这一条已核对引用；关系仍是研究者的提议，不代表当前问题已获证实。';
     if(!response.entries.length)status.textContent+=' 暂无可核对记录；不自动计算或借用其他帧。如需新统计，关闭此窗口，在空间图中选中 ROI 后点击“统计当前 ROI”。';
     for(const value of entries){
      const entry=row(value),stats=row(entry.statistics),matches=Array.isArray(entry.matching_input_annotations)?entry.matching_input_annotations.map(row):[],tr=element('tr','');
      const name=matches.length===1?text(matches[0].name):matches.length?'多个同边界标注；身份不唯一':'无可匹配的保存标注名';
      tr.append(element('td',`${name}\n保存 ROI：${JSON.stringify(entry.source_rect_xyxy)}\n源像素半开边界；名称仅按统计时输入中的同处理边界匹配，不绑定当前标注。`),
       element('td',`n=${numberText(stats.sample_count)}\n分量：${text(entry.component)}\ndtype：${text(entry.dtype)}\n强度单位未声明；不使用 XY 长度单位代替。`),
       element('td',`均值 ${numberText(stats.mean)}\n标准差 ${numberText(stats.stddev)}\n最小 ${numberText(stats.minimum)}\n最大 ${numberText(stats.maximum)}\n标准差约定：${text(entry.standard_deviation)}`),
       element('td',`保存时间（UTC）：${text(entry.created_utc)}\n来源：${text(row(entry.source_identity).path)}\n原始强度语义：${text(entry.intensity_semantics)}`));
      const details=element('details','');details.append(element('summary','对象、请求与来源证据'),element('pre',JSON.stringify(entry,null,2)));const cell=element('td',''),explanationActions:BrowserElement[]=[];
      if(useStatistics){
       const contextObjectId=String(response.object_id),button=element('button','进一步整理解释（可选）');button.title='仅核对数值无需填写解释；先主动记录并应用同帧研究问题，再带入准确原统计。不会自动生成假设、关系或下一步。';
       button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{if(getState?.()?.object?.object_id!==contextObjectId)throw Error('当前图像已切换；请从当前来源重新打开统计历史。');if(await useStatistics(referenceFromStatistics(entry),contextObjectId)===false)return;dialog.close();}catch(error){status.textContent='未带入线索：'+(error as Error).message+'；请重新选择统计。需要刷新时，关闭后重新打开统计历史。';onError(error);}finally{button.disabled=false;}};explanationActions.push(button);
      }
      if(showStatisticsInput&&typeof entry.input_object_id==='string'&&/^[a-f0-9]{32}$/.test(entry.input_object_id)){
       const display=row(entry.input_display),qualified=['exact_saved_input','same_source_current_preview'].includes(String(display.kind))&&typeof display.object_id==='string'&&/^[a-f0-9]{32}$/.test(display.object_id)&&typeof display.manifest_sha256==='string'&&/^[a-f0-9]{64}$/.test(display.manifest_sha256),sameSource=qualified&&display.kind==='same_source_current_preview';
       const navigation:StatisticsInputNavigation|undefined=qualified?{reference:referenceFromStatistics(entry),context_object_id:String(response.object_id),display:{kind:display.kind as StatisticsInputNavigation['display']['kind'],object_id:display.object_id as string,manifest_sha256:display.manifest_sha256 as string}}:undefined;
       const inputId=navigation?.display.object_id??entry.input_object_id,button=element('button',sameSource?'查看同源当前预览（非历史显示）':'查看统计时的原图输入');button.title='打开准确绑定的保存显示；旧 raw 输入只能核对同源当前预览。统计区域见本行边界，不替换当前选区，不重新计算。';
       if(entry.input_display!==undefined)cell.append(element('small',text(display.reason)));
       if(entry.input_display!==undefined&&!qualified){button.disabled=true;button.title=text(display.reason);}
       button.onclick=async()=>{if(button.disabled)return;button.disabled=true;const generation=historyGeneration,isCurrent=()=>dialog.open===true&&historyGeneration===generation;try{await showStatisticsInput(inputId,navigation?{...navigation,isCurrent}:undefined);if(isCurrent())dialog.close();}catch(error){if(isCurrent()){status.textContent='历史输入未打开：'+(error as Error).message;onError(error);}}finally{button.disabled=false;}};cell.append(button);
      }
      cell.append(details,...explanationActions);tr.append(cell);host.append(tr);
     }
    }catch(error){host.replaceChildren();status.textContent=(error as Error).message;onError(error);}finally{reading=false;}
   };
   this.openStatisticsHistory=open;
   for(const id of ['open-statistics-history','open-statistics-history-inline','open-statistics-history-measurements'])if(this.el(id))this.el(id)!.onclick=()=>open();
   this.el('close-statistics-history')!.onclick=()=>dialog.close();
   dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
   dialog.addEventListener('close',()=>{historyGeneration++;returnFocus?.focus();returnFocus=null;});
  }
 }
 component():string{return this.el('probe-component')?.value||'raw';}
 setProbeText(text:string){if(this.el('probe-value'))this.el('probe-value')!.textContent=text;}
 clear(){this.sequence++;this.pending=null;this.lastSelection=null;if(this.timer!==null){this.clearTimer!(this.timer);this.timer=null;}this.setProbeText('尚未读取光标点数值；统计与剖面见各自结果');}
 clearProfile(summary:string){
  this.profile=null;const plot=this.el('profile-plot');plot?.replaceChildren();
  // The plot handlers close over the saved samples. Remove them as well as
  // the visible curve so a key press cannot resurrect an old physical axis.
  if(plot){plot.onpointermove=null;plot.onkeydown=null;}
  this.el('profile-values')?.replaceChildren();if(this.el('profile-readout'))this.el('profile-readout')!.textContent='';
  if(this.el('profile-csv'))this.el('profile-csv')!.disabled=true;
  if(this.el('profile-summary'))this.el('profile-summary')!.textContent=summary;
 }
 refreshCurrent(){
  const state=this.getState!(),binding=objectBinding(state);if(this.currentBinding&&sameBinding(state,this.currentBinding))return false;
  this.clear();this.currentBinding=binding;
  const component=this.el('probe-component'),dtype=state?.object?.dtype,complex=typeof dtype==='string'&&dtype.startsWith('complex')||state?.object?.panels?.some(panel=>panel.domain==='frequency');
  if(component&&(typeof dtype==='string'||state?.object?.panels?.length)){if(complex&&component.value==='raw')component.value='amplitude';else if(!complex)component.value='raw';for(const option of component.options??[])option.disabled=complex?option.value==='raw':option.value!=='raw';}
  const grid=state?.object?.scientific_grid_identity;
  if(this.profile?.samples?.physical_distance&&!same(this.profile.xy_calibration,state?.object?.xy_calibration))this.clearProfile('标定已修订；旧剖面物理轴待重测，历史科学记录仍保留');
  for(const kind of (['statistics','profile'] as const))if(this[kind]&&(!grid||!same(this[kind].scientific_grid_identity,grid))){if(kind==='statistics'){this.statistics=null;if(this.el('statistics-summary'))this.el('statistics-summary')!.textContent='当前对象已变化；之前的统计记录仍保存，请重新选择 ROI';}else this.clearProfile('当前对象已变化；之前的剖面记录仍保存');}
  return true;
 }
 observe(selection:ProbeSelection|null|undefined){
  const binding=objectBinding(this.getState!());if(!binding.object_id||!selection||!Array.isArray(selection.coordinates)||selection.coordinates.length!==2||!selection.coordinates.every(finite)||typeof selection.source_object_id!=='string'||!['source_pixels','source_array_indices','frequency_cycles_per_pixel'].includes(selection.coordinate_space as string))return false;
  const component=this.component();if(!(component in componentNames))return false;
  this.lastSelection={...selection,coordinates:[...selection.coordinates]};this.setProbeText(`${componentNames[component]} · 坐标 [${selection.coordinates.map(numberText).join(', ')}] · 等待原数组采样`);this.pending={binding,sequence:++this.sequence,component,selection:this.lastSelection};this.schedule();return true;
 }
 schedule(){if(this.inflight||this.timer!==null||!this.pending)return;const delay=Math.max(0,this.interval-(this.now()-this.lastStart));this.timer=this.setTimer!(()=>{this.timer=null;void this.submit();},delay);}
 async submit(){
  if(this.inflight||!this.pending)return;const query=this.pending;this.pending=null;if(!sameBinding(this.getState!(),query.binding))return;
  this.inflight=true;this.lastStart=this.now();
  try{const result=await this.api!('/api/probe',{expected_object_id:query.binding.object_id,source_object_id:query.selection.source_object_id,coordinate_space:query.selection.coordinate_space,coordinates:query.selection.coordinates,component:query.component});
   if(query.sequence!==this.sequence||!sameBinding(this.getState!(),query.binding)||this.component()!==query.component||result.object_id!==query.binding.object_id||result.component!==query.component||result.coordinate_space!==query.selection.coordinate_space||!same(result.samples?.[0]?.point,query.selection.coordinates))return;
   this.setProbeText(probeText(result));this.lastResult=result;
  }catch(error){if(query.sequence===this.sequence&&sameBinding(this.getState!(),query.binding)){this.setProbeText('原数组读取未完成；未使用显示灰度替代');this.onError(error);}}
  finally{this.inflight=false;this.schedule();}
 }
 restoreSavedResults(results:Partial<Record<'statistics'|'profile',ProfileResult|null>>|null|undefined){
  const state=this.getState!(),grid=state?.object?.scientific_grid_identity;
  for(const kind of (['statistics','profile'] as const)){const value=results?.[kind];if(!value)continue;
   const compatible=grid&&same(grid,value.scientific_grid_identity)||!grid&&value.parent_object_id===state?.object?.object_id;
   if(!compatible)continue;
   if(kind==='profile'&&value.samples?.physical_distance&&!same(value.xy_calibration,state?.object?.xy_calibration))continue;
   if(this[kind]?.object_id!==value.object_id)this.renderResult(value);
  }
  const recovery=state?.numeric_result_recovery;
  for(const kind of (['statistics','profile'] as const)){
   if(this[kind])continue;const label=kind==='profile'?'剖面':'统计',target=this.el(kind+'-summary');if(!target)continue;
   if(recovery?.state==='legacy_missing_refs')target.textContent=`旧会话未保存${label}引用；原科学记录仍保留，未自动重算。`;
   else if(recovery?.results?.[kind]?.state==='unavailable')target.textContent=`已保存${label}引用未能核对；图像仍可继续使用，未自动重算。`;
  }
 }
 renderResult(result:NumericReply|null|undefined){
  const value=result?.last_operation??result;if(!value||!['statistics','profile'].includes(value.kind as string))return false;
  const state=this.getState!(),grid=state?.object?.scientific_grid_identity;
  if(grid&&value.scientific_grid_identity&&!same(grid,value.scientific_grid_identity)){this.onError(new Error('数值结果属于另一科学网格；未投到当前图上'));return false;}
  if(!grid&&value.parent_object_id!==state?.object?.object_id&&value.source_object_id!==state?.object?.object_id){this.onError(new Error('缺少同一科学网格的结果绑定；请在当前对象重新读取'));return false;}
  if(value.kind==='statistics'){this.statistics=value;if(this.el('statistics-summary'))this.el('statistics-summary')!.textContent=statisticsText(value);return true;}
  try{profileData(value);if(value.samples!.physical_distance&&!same(value.xy_calibration,state?.object?.xy_calibration))throw new Error('剖面物理轴属于旧标定版本；需在当前标定重新读取');this.profile=value;this.renderProfile();return true;}catch(error){this.onError(error);return false;}
 }
 renderProfile(){
  if(!this.profile)return;const result=this.profile,samples=profileData(result),body=this.el('profile-values'),plot=this.el('profile-plot');
  if(this.el('profile-csv'))this.el('profile-csv')!.disabled=false;
  if(this.el('profile-summary'))this.el('profile-summary')!.textContent=`${samples.value.length} 点 · ${componentNames[result.component as string]??'未知分量'} · 最近邻 · 线宽 ${result.sampling?.line_width??'未知'} px · 距离 ${result.physical_distance_unit??result.distance_unit??'未知'} · 数值单位未声明${samples.value.length>200?'；表格显示前 200 点，CSV 包含全部采样':''}`;
  const rows:BrowserElement[]=[];if(body&&this.document){body.replaceChildren();for(let i=0;i<Math.min(200,samples.value.length);i++){const row=this.document!.createElement('tr');row.tabIndex=0;row.dataset.sampleIndex=String(i);for(const v of [i,...samples.coordinates_xy[i],samples.physical_distance?.[i]??samples.distance[i],samples.value[i]]){const cell=this.document!.createElement('td');cell.textContent=numberText(v);row.append(cell);}body.append(row);rows.push(row);}}
  if(!plot||!this.document)return;plot.replaceChildren();plot.setAttribute('viewBox','0 0 560 200');plot.setAttribute('tabindex','0');plot.setAttribute('aria-label','已保存剖面；左右方向键读取原始采样值');
  const model=profilePlot(result),range=model.range;
  const create=(tag:string,attributes:Readonly<Record<string,string|number>>,text?:unknown)=>{const e=this.document!.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attributes))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;plot.append(e);return e;};
  create('path',{d:'M64 22V158H540',fill:'none',stroke:'#6c8496','stroke-width':1});
  const labelX=`距离 (${model.xLabel??'未知单位'})`,labelY=`${model.yLabel??'数值'}（单位未标定）`;
  create('text',{x:300,y:192,'text-anchor':'middle',fill:'#afc4ce','font-size':10},labelX);
  create('text',{x:64,y:12,fill:'#afc4ce','font-size':10},labelY);
  if(!range)return;
  const px=(x:number)=>64+(x-range.xmin)/(range.xmax-range.xmin||1)*476,py=(y:number)=>158-(y-range.ymin)/(range.ymax-range.ymin||1)*136;
  const xTicks=profileTicks(range.xmin,range.xmax),yTicks=profileTicks(range.ymin,range.ymax,4),xLabels=profileTickLabels(xTicks,5),yLabels=profileTickLabels(yTicks,5);
  for(const [index,x]of xTicks.entries()){const p=px(x);create('line',{x1:p,x2:p,y1:158,y2:162,stroke:'#7894a3'});create('text',{x:p,y:176,'text-anchor':'middle',fill:'#afc4ce','font-size':10},xLabels[index]);}
  for(const [index,y]of yTicks.entries()){const p=py(y);create('line',{x1:60,x2:64,y1:p,y2:p,stroke:'#7894a3'});create('text',{x:57,y:p+3,'text-anchor':'end',fill:'#afc4ce','font-size':10},yLabels[index]);}
  for(const segment of model.segments)create('polyline',{points:segment.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#6bd6df','stroke-width':1.5});
  const cross=create('line',{x1:0,x2:0,y1:22,y2:158,stroke:'#c7d9df','stroke-dasharray':'3 3',visibility:'hidden'}),dot=create('circle',{r:3,fill:'#e8f5f7',visibility:'hidden'});let selected=0;
  const highlight=(index:number)=>{const r=profileReadout(result,index);if(!r)return;selected=index;for(let i=0;i<rows.length;i++)rows[i].setAttribute('aria-selected',String(i===index));
   if(finite(r.x)&&finite(r.value)){cross.setAttribute('x1',px(r.x));cross.setAttribute('x2',px(r.x));cross.setAttribute('visibility','visible');dot.setAttribute('cx',px(r.x));dot.setAttribute('cy',py(r.value));dot.setAttribute('visibility','visible');}else{cross.setAttribute('visibility','hidden');dot.setAttribute('visibility','hidden');}
   if(this.el('profile-readout'))this.el('profile-readout')!.textContent=`采样 ${index} · 距离 ${numberText(r.x)} ${r.unit??''} · ${componentNames[r.component as string]??'数值'} ${numberText(r.value)} · 请求坐标 [${r.requested.join(', ')}] · 原数组索引 [${r.arrayIndex.join(', ')}]`;
  };
  plot.onpointermove=event=>{const box=plot.getBoundingClientRect();if(!box.width||!box.height)return;const scale=Math.min(box.width/560,box.height/200),offset=(box.width-560*scale)/2,x=(event.clientX-box.left-offset)/scale;if(x<64||x>540)return;const index=nearestProfileSample(result,range.xmin+(x-64)/476*(range.xmax-range.xmin));if(index!==null)highlight(index);};
  plot.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();highlight(event.key==='Home'?0:event.key==='End'?samples.value.length-1:Math.max(0,Math.min(samples.value.length-1,selected+(event.key==='ArrowRight'?1:-1))));}};
  rows.forEach((row,i)=>{row.onclick=()=>highlight(i);row.onfocus=()=>highlight(i);});highlight(0);
 }
}
