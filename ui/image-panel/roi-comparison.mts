import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';
interface State {workspace_analysis?:{working_revision:number;save_id:string|null;dirty?:boolean};}
interface Options<S extends State> {document:BrowserDocument;api:(url:string,body?:Readonly<Record<string,unknown>>)=>Promise<unknown>;getState:()=>S;install:(state:S)=>void;show:(id:string,inputReference?:Readonly<Record<string,unknown>>)=>Promise<unknown>;error:(text:string)=>void;onOpen?:()=>BrowserElement|null;}
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const list=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const id=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const text=(v:unknown)=>v===null||v===undefined?'未知':String(v);
const comparisonGuidance='区域编号按本报告顺序展示，不是原图 ROI 名称。图像坐标方向不等于晶体学取向；峰对应关系、物相和应变均未确认。';
export function comparisonMeasurementText(value:unknown):{period:string;direction:string}{
 const m=row(value),pixel=typeof m.pixel_period==='number'?`${m.pixel_period.toPrecision(7)} px`:'像素周期未知';
 const physical=typeof m.d_spacing==='number'&&typeof m.d_spacing_unit==='string'?`；${m.d_spacing.toPrecision(7)} ${m.d_spacing_unit}`:'';
 const direction=typeof m.image_coordinate_angle_degrees==='number'?`${m.image_coordinate_angle_degrees.toPrecision(7)}°（图像坐标中的倒易矢量）`:'方向未测量';
 return {period:pixel+physical,direction};
}
// A reference report is viewed independently from adopting it into analysis.
// This widget never detects peaks, computes FFT or chooses a scientific claim.
export class RoiComparisonPanel<S extends State>{
 private selected:Row|null=null;private returnFocus:ReturnType<BrowserDocument['getElementById']>=null;
 constructor(private readonly options:Options<S>){
  const d=options.document,open=d.getElementById('open-roi-comparisons'),close=d.getElementById('close-roi-comparisons'),select=d.getElementById('roi-comparison-list'),adopt=d.getElementById('adopt-roi-comparison');
  if(open)open.onclick=()=>this.run(()=>this.open());if(close)close.onclick=()=>d.getElementById('roi-comparison-dialog')?.close();
  if(select)select.onchange=()=>this.run(()=>this.read(select.value));if(adopt)adopt.onclick=()=>this.run(()=>this.adopt());
  d.getElementById('roi-comparison-dialog')?.addEventListener('cancel',event=>{event.preventDefault();d.getElementById('roi-comparison-dialog')?.close();});
  d.getElementById('roi-comparison-dialog')?.addEventListener('close',()=>{this.returnFocus?.focus();this.returnFocus=null;});
 }
 private async run(action:()=>Promise<void>){try{await action();}catch(error){const status=this.options.document.getElementById('roi-comparison-status');if(status)status.textContent=(error as Error).message+' '+comparisonGuidance;this.options.error((error as Error).message);}}
 private element(tag:string,value:string){const e=this.options.document.createElement(tag);e.textContent=value;return e;}
 private details(label:string,value:string){const details=this.element('details','');details.className='comparison-details';details.append(this.element('summary',label),this.element('pre',value));return details;}
 async open(){
  const d=this.options.document;this.returnFocus=this.options.onOpen?.()??d.activeElement??d.getElementById('open-roi-comparisons');
  const response=row(await this.options.api('/api/comparisons')),reports=list(response.reports),select=d.getElementById('roi-comparison-list')!;select.replaceChildren();
  for(const [index,item]of reports.entries()){const report=row(item),option=this.element('option',`比较 ${index+1} · 保存版本 ${text(report.source_revision)}`);option.value=text(report.comparison_id);option.title=option.value;select.append(option);}
  d.getElementById('roi-comparison-dialog')!.showModal();d.getElementById('close-roi-comparisons')!.focus();
  if(reports.length)await this.read(String(row(reports.at(-1)).comparison_id));else{d.getElementById('roi-comparison-status')!.textContent='尚无 ROI 对照报告。CLI 可读取准确保存版本并提交有来源的比较，不会自动覆盖图像。';d.getElementById('roi-comparison-rows')!.replaceChildren();d.getElementById('adopt-roi-comparison')!.disabled=true;}
 }
 async read(comparisonId:string){
  if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(comparisonId))throw new Error('比较报告身份不合法。');
  const raw=row(await this.options.api('/api/comparison?comparison_id='+encodeURIComponent(comparisonId))),report=row(raw.report??raw);if(report.kind!=='roi_lattice_comparison'||report.comparison_id!==comparisonId)throw new Error('比较报告身份不一致。');
  this.selected=report;const d=this.options.document,host=d.getElementById('roi-comparison-rows')!;host.replaceChildren();d.getElementById('roi-comparison-list')!.value=comparisonId;d.getElementById('roi-comparison-list')!.title=comparisonId;
  const current=this.options.getState().workspace_analysis,original=current?.save_id===report.source_save_id,unverified=list(report.rows).some(value=>{const fft=row(value).fft;return fft!==null&&row(fft).input_snapshot_verified!==true;});
  d.getElementById('roi-comparison-status')!.textContent=`来源：明确保存版本 ${text(report.source_revision)}${original?'':' · 历史版本，不能冒充当前编辑'}。${current?.dirty?'当前还有未保存的工作编辑；报告保持原保存版本。':''}${unverified?'存在原输入关联未核对的 FFT，仅供历史查看。':''}${comparisonGuidance}`;
  for(const [index,entry]of list(report.rows).entries()){
   const r=row(entry),tr=this.element('tr',''),measurements=list(r.measurements).map(comparisonMeasurementText),fft=row(r.fft);
   const status=({measured:'已有条件性测量',needs_fft:'缺少输入明确的 FFT',needs_point_selection:'待明确选峰并测量',candidate_peaks_only:'仅有数值候选峰',input_association_unknown:'原始浮点输入关联未知'} as Record<string,string>)[String(r.status)]??text(r.status);
   const region=this.element('td',`区域 ${index+1}`);region.append(this.details('选区与来源',`标注 ID：${text(r.annotation_id)}\n浮点 ROI：[${list(r.float_roi_xyxy).join(', ')}]\n源视图：${text(r.source_view_object_id??report.source_view_object_id)}\n源帧：${text(r.frame_object_id??report.frame_object_id)}`));tr.append(region,this.element('td',measurements.length?measurements.map(m=>m.period).join('\n'):'待明确选峰并测量'),this.element('td',measurements.length?measurements.map(m=>m.direction).join('\n'):'未知'));
   const certainty=this.element('td',status);if(list(r.uncertainties).length)certainty.append(this.details('完整不确定性',list(r.uncertainties).map(text).join('\n\n')));tr.append(certainty);
   const source=this.element('td',id(fft.object_id)?fft.reused===true?'复用已有结果':'本次保存结果':'尚无 FFT');
   if(id(fft.object_id)){const button=this.element('button','查看此 FFT');button.onclick=()=>this.run(async()=>{await this.options.show(fft.object_id as string,{kind:'comparison',comparison_id:report.comparison_id,annotation_id:r.annotation_id});d.getElementById('roi-comparison-dialog')!.close();});source.append(button);}source.append(this.details('计算来源',`比较报告 ID：${text(report.comparison_id)}\nFFT ID：${text(fft.object_id)}`));tr.append(source);host.append(tr);
  }
  d.getElementById('adopt-roi-comparison')!.disabled=!original||unverified||Boolean(current?.dirty);
 }
 async adopt(){
  if(!this.selected)throw new Error('先查看一份有来源的比较。');const state=this.options.getState().workspace_analysis;if(!state||state.save_id!==this.selected.source_save_id)throw new Error('当前保存版本已改变，请重新核对比较来源。');
  if(state.dirty)throw new Error('当前有未保存工作编辑；先核对并保存当前版本，再判断比较是否适用。');
  if(list(this.selected.rows).some(value=>row(value).fft!==null&&row(row(value).fft).input_snapshot_verified!==true))throw new Error('报告仍有未核对的原始浮点输入关联；保留历史查看，不纳入分析。');
  const next=await this.options.api('/api/workspace',{action:'adopt-comparison',comparison_id:this.selected.comparison_id,expected_working_revision:state.working_revision}) as S;
  this.options.install(next);this.options.document.getElementById('roi-comparison-status')!.textContent='已纳入当前工作分析；仍需“保存工作区”才成为明确保存版本。'+comparisonGuidance;
 }
}
