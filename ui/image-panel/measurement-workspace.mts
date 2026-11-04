import {resultSemanticsModel} from './result-semantics.mjs';
import type {MeasurementEntry,MeasurementRecord,MeasurementCurrent,MeasurementDisplayValue,MeasurementResponse,WorkflowState,DetailRows,PresentationDocument,PresentationElement,PresentationHost,BlobConstructorPort,URLPort} from './presentation-contracts.mjs';
export type {MeasurementEntry,MeasurementCurrent,MeasurementResponse} from './presentation-contracts.mjs';
// Platform declarations describe the existing browser APIs; no global ambient lib
// is introduced into the Node/shared build, and native runtime behavior is kept.
declare const Blob: BlobConstructorPort;
declare const URL: URLPort;
declare function setTimeout(callback: ()=>void, milliseconds: number): unknown;
type PresentationEnvironment=typeof globalThis & PresentationHost;
export interface MeasurementWorkspaceOptions {
 getState?: ()=>WorkflowState | null | undefined;
 api?: (url: `/api/measurements${string}`)=>PromiseLike<MeasurementResponse>;
 onSelect?: (entry: MeasurementEntry)=>unknown;
 onJump?: (entry: MeasurementEntry | null)=>unknown;
 onUpdate?: (entry: MeasurementEntry | null)=>unknown;
 onError?: (error: unknown)=>unknown;
 pendingAnnotations?:()=>readonly string[];
 readContext?:()=>unknown;
 document?: PresentationDocument | null;
}
// The Panel's global revision includes camera, selection and disclosure writes.
// Saved scientific inputs and the last operation distinguish a new measurement
// on the same object without invalidating a read for those viewing preferences.
export function measurementReadContext(state:WorkflowState&{readonly last_operation?:unknown}){
 return {object:state.object??null,frame_identity:state.frame_identity??null,last_operation:state.last_operation??null};
}
// Read-only table projection of the provider's saved measurements. Scientific
// values are never reconstructed from annotation text or preview pixels.
const finite=(value: unknown): value is number=>typeof value==='number'&&Number.isFinite(value);
const asRecord=(entry: MeasurementEntry): MeasurementRecord=>entry.measurement??entry;
const statusNames: Partial<Record<string,string>>={current:'当前',active:'当前',historical:'历史',history:'历史',stale:'待重测',needs_remeasure:'待重测',needs_remeasurement:'待重测',unknown:'未知'};
export function requiresMeasurementJump(entry: MeasurementEntry | null | undefined){return Boolean(entry&&(!entry.same_grid||!entry.visible_in_current_view||!entry.annotation_matches_current));}
const unitText=(value: unknown)=>typeof value==='string'&&value.trim()?value:'未知';
export const measurementNumber=(value: unknown)=>finite(value)?Number(value.toPrecision(7)).toString():'未知';
export function measurementValues(entry: MeasurementEntry){
 const m=asRecord(entry),result: MeasurementDisplayValue[]=[];
 if(['stale','needs_remeasure','needs_remeasurement'].includes(entry.status??''))return result;
 if(finite(m.physical_distance))result.push({kind:'distance',label:'距离',value:m.physical_distance,unit:unitText(m.physical_unit)});
 else if(finite(m.distance_physical))result.push({kind:'distance',label:'距离',value:m.distance_physical,unit:unitText(m.physical_unit)});
 if(finite(m.physical_frequency_magnitude))result.push({kind:'frequency',label:'|g|',value:m.physical_frequency_magnitude,unit:unitText(m.physical_frequency_unit)});
 // Only an explicit DC-to-peak result may be called d. A two-peak difference
 // can have a reciprocal period, but that is not an identified plane spacing.
 if(finite(m.d_spacing))result.push({kind:'d_spacing',label:'DC→峰周期',value:m.d_spacing,unit:unitText(m.d_spacing_unit)});
 else if(finite(m.period))result.push({kind:'period',label:'差矢量周期',value:m.period,unit:unitText(m.period_unit)});
 if(!result.length&&finite(m.distance_pixels))result.push({kind:'pixel_distance',label:'图像坐标距离',value:m.distance_pixels,unit:'px'});
 if(!result.length&&finite(m.pixel_period))result.push({kind:'pixel_period',label:'像素周期',value:m.pixel_period,unit:'px'});
 if((!result.length||result.some(value=>value.kind==='pixel_period'))&&finite(m.frequency_distance_cycles_per_pixel))result.push({kind:'pixel_frequency',label:'频率差',value:m.frequency_distance_cycles_per_pixel,unit:'cycles/pixel'});
 return result;
}
export function measurementType(entry: MeasurementEntry){const m=asRecord(entry);if(m.coordinate_space==='frequency_cycles_per_pixel'||m.measurement_domain==='reciprocal_space')return m.dc_reference_point_index===0||m.dc_reference_point_index===1?'DC→峰':'两点差矢量';return '两点距离';}
export function measurementName(entry: MeasurementEntry){return entry.name??entry.annotation_name??entry.annotation_id??`测量 ${asRecord(entry).object_id?.slice(0,8)??'未知'}`;}
export function measurementStatus(entry: MeasurementEntry){return statusNames[entry.status as string]??'未知';}
export function measurementSummary(entry:MeasurementEntry,sourceName?:string):DetailRows {
 const m=asRecord(entry),scope=entry.source??entry.scope??{},values=measurementValues(entry);
 const fft=(scope as {fft_object_id?:unknown}).fft_object_id??(m.coordinate_space==='frequency_cycles_per_pixel'?m.scientific_grid_identity?.source_grid_object_id:null);
 return [['名称',measurementName(entry)],['测得量',values.map(value=>`${value.label} ${measurementNumber(value.value)} ${value.unit}`).join(' / ')||(['stale','needs_remeasure','needs_remeasurement'].includes(entry.status??'')?'待重测；先前数值在详细证据中':'未知')],['状态',measurementStatus(entry)],['来源 FFT',sourceName??(typeof fft==='string'?'已保存 FFT（详证）':'未记录 / 非 FFT 测量')],['限制',![m.physical_frequency_magnitude,m.physical_distance,m.distance_physical,m.d_spacing,m.period].some(finite)?'未有有效物理标定；保留像素 / 频率单位。':'几何测量不直接确认物相或晶面指数。']];
}
export function measurementDetails(entry: MeasurementEntry): DetailRows{
 const m=asRecord(entry),scope=entry.source??entry.scope??{},cal=m.xy_calibration??m.calibration_record,grid=m.scientific_grid_identity??scope.scientific_grid_identity??{};
 const semantics=resultSemanticsModel(m as unknown as Record<string,unknown>);
 return [
  ...(semantics?[["三层结果说明",semantics.headline],["保存的资格记录",semantics.assessment?JSON.stringify(semantics.assessment):'未记录；不补写评估']] as DetailRows:[]),
  ['类型',measurementType(entry)],['状态',measurementStatus(entry)+(entry.status_reason?' · '+entry.status_reason:'')],
  ['科学端点',Array.isArray(m.points)?JSON.stringify(m.points):'未知'],['坐标域',m.coordinate_space??'未知'],
  ['原精度数值',JSON.stringify({physical_distance:m.physical_distance,distance_physical:m.distance_physical,physical_frequency_magnitude:m.physical_frequency_magnitude,period:m.period,d_spacing:m.d_spacing,distance_pixels:m.distance_pixels,frequency_distance_cycles_per_pixel:m.frequency_distance_cycles_per_pixel,pixel_period:m.pixel_period})],
  ['源帧',Number.isInteger(scope.frame_index)?String((scope.frame_index as number)+1):Number.isInteger(m.frame_index)?String((m.frame_index as number)+1):'未知'],
  ['源 ROI',Array.isArray(scope.source_rect_xyxy??grid.source_rect_xyxy??m.source_rect_xyxy)?JSON.stringify(scope.source_rect_xyxy??grid.source_rect_xyxy??m.source_rect_xyxy):'未知'],
  ['标定版本',cal?.calibration_id?`${cal.calibration_id} · v${cal.revision??'未知'}`:'无有效物理标定'],
  ['标定来源',cal?.source_text??cal?.source??'未知'],['不确定性',m.uncertainty_status??'未知'],
  ['来源 FFT 对象',(scope as {fft_object_id?:unknown}).fft_object_id??(m.coordinate_space==='frequency_cycles_per_pixel'?grid.source_grid_object_id??'未知':'非 FFT')],['科学网格身份',JSON.stringify(grid)],['原始结果',m.object_id??'未知'],['原始请求',m.request_id??'未知'],['输入对象',m.parent_object_id??'未知'],
  ['结果校验',entry.measurement_manifest_sha256??entry.manifest_sha256??'未知']
 ];
}
export function inspectorDetails(current: MeasurementCurrent={}): DetailRows{
 const cal=current.xy_calibration,scale=cal?.xy_scale,source=current.source_identity;
 const sourcePath=typeof source==='string'?source:source?.path??current.source_path;
 const dimensions=Array.isArray(current.shape_yx)?current.shape_yx.join(' × ')+' (Y × X)':'未知';
 const meaning=current.provenance?.data_meaning??current.user_context?.data_meaning??current.data_meaning;
 const sourceKind=['synthetic','synthetic_demo','合成演示'].includes(meaning as string)?'合成数据（显式声明）':({tiff:'独立 TIFF 固定来源',dm4:'独立 DM4 固定来源；外部读取',dm3:'独立 DM3 固定来源；外部读取',native_capture:'DM 原生数值捕获',imported_capture:'导入的受控数值捕获',unknown:'未知'} as Partial<Record<string,string>>)[current.source_kind as string]??current.source_kind??current.provenance_type??(source as {readonly kind?:unknown} | undefined)?.kind??(sourcePath?'文件固定来源；实验/模拟含义未声明':'未知');
 const domain=current.domain??current.array_domain;
 const domainText=({source_pixels:'实空间 / 原图像素坐标',spatial_pixels:'实空间 / 原图像素坐标',frequency_cycles_per_pixel:'倒空间 / cycles/pixel',frequency:'倒空间 / 原 FFT 频率',reciprocal:'倒空间',source_array_indices:'数值数组索引；物理域见标定',real_space:'实空间',reciprocal_space:'倒空间'} as Partial<Record<string,string>>)[domain as string]??domain??'未知';
 return [
  ['源文件',sourcePath??'未知'],['来源',sourceKind],['数据含义',meaning??'未知'],
  ['帧',Number.isInteger(current.frame_index)?String((current.frame_index as number)+1):'未知'],
  ['科学数组',`${dimensions} · ${current.dtype??'未知 dtype'}`],['坐标域',domainText],
  ['源 ROI',Array.isArray(current.source_rect_xyxy)?JSON.stringify(current.source_rect_xyxy):'未知'],
  ['XY 标定',cal?.status==='active'&&scale?`X ${scale.x} / Y ${scale.y} ${scale.unit} / px`:'未知 / 已撤回；保留像素域'],
  ['标定来源',cal?.source_text??cal?.source??'未知'],['标定版本',cal?.calibration_id?`${cal.calibration_id} · v${cal.revision??'未知'}`:'未知'],
  ['标定不确定性',cal?.uncertainty??cal?.xy_scale?.uncertainty??'未知']
 ];
}
// Spreadsheet text is escaped separately from finite numeric fields: -0.12
// remains a useful number, while =CMD(), @..., and leading whitespace formulas
// from labels/source statements cannot execute when opened in a spreadsheet.
export function tabularCell(value: unknown,delimiter=','){
 let text;if(typeof value==='number')text=finite(value)?String(value):'';else if(value===null||value===undefined)text='';else {text=String(value);if(/^[\s\uFEFF]*[=+\-@]/u.test(text))text="'"+text;}
 return text.includes(delimiter)||/["\r\n]/u.test(text)?'"'+text.replaceAll('"','""')+'"':text;
}
export function exportMeasurementTable(entries: readonly MeasurementEntry[],{delimiter=','}: {delimiter?:string}={}){
 if(![',','\t'].includes(delimiter))throw new Error('Only CSV and TSV are supported');
 const columns=['name','type','status','distance','distance_unit','frequency','frequency_unit','period','period_unit','d_spacing','d_spacing_unit','pixel_distance','frequency_cycles_per_pixel','point_0_x','point_0_y','point_1_x','point_1_y','coordinate_space','source_frame','source_roi','calibration_id','calibration_revision','calibration_source','result_object_id','input_object_id','request_id','manifest_sha256','pixel_period'];
 const rows=entries.map(entry=>{const m=asRecord(entry),scope=entry.source??entry.scope??{},cal=m.xy_calibration??m.calibration_record,points=m.points??[];return [measurementName(entry),measurementType(entry),measurementStatus(entry),m.physical_distance??m.distance_physical,m.physical_unit,m.physical_frequency_magnitude,m.physical_frequency_unit,m.period,m.period_unit,m.d_spacing,m.d_spacing_unit,m.distance_pixels,m.frequency_distance_cycles_per_pixel,points[0]?.[0],points[0]?.[1],points[1]?.[0],points[1]?.[1],m.coordinate_space,Number.isInteger(scope.frame_index)?(scope.frame_index as number)+1:null,(Array.isArray(scope.source_rect_xyxy??m.scientific_grid_identity?.source_rect_xyxy??m.source_rect_xyxy)?JSON.stringify(scope.source_rect_xyxy??m.scientific_grid_identity?.source_rect_xyxy??m.source_rect_xyxy):null),cal?.calibration_id,cal?.revision,cal?.source_text??cal?.source,m.object_id,m.parent_object_id,m.request_id,entry.measurement_manifest_sha256??entry.manifest_sha256,m.pixel_period];});
 return [columns,...rows].map(row=>row.map(cell=>tabularCell(cell,delimiter)).join(delimiter)).join('\r\n')+'\r\n';
}
export class MeasurementWorkspace {
 declare pendingAnnotations:NonNullable<MeasurementWorkspaceOptions['pendingAnnotations']>;
 declare readContext:NonNullable<MeasurementWorkspaceOptions['readContext']>;
 declare getState: MeasurementWorkspaceOptions['getState'];declare api: MeasurementWorkspaceOptions['api'];
 declare onSelect: NonNullable<MeasurementWorkspaceOptions['onSelect']>;declare onJump: NonNullable<MeasurementWorkspaceOptions['onJump']>;declare onUpdate: NonNullable<MeasurementWorkspaceOptions['onUpdate']>;declare onError: NonNullable<MeasurementWorkspaceOptions['onError']>;
 declare document: PresentationDocument | null | undefined;declare entries: MeasurementEntry[];declare selectedId: string | null | undefined;declare checked: Set<string | undefined>;declare ticket: number;declare current: MeasurementCurrent | null | undefined;declare truncated?: boolean;
 declare el: (id: string)=>PresentationElement | null | undefined;
 constructor({getState,api,onSelect=()=>{},onJump=()=>{},onUpdate=()=>{},onError=()=>{},pendingAnnotations=()=>[],readContext,document:doc=(globalThis as PresentationEnvironment).document}: MeasurementWorkspaceOptions={}){
  Object.assign(this,{getState,api,onSelect,onJump,onUpdate,onError,pendingAnnotations,document:doc});this.entries=[];this.selectedId=null;this.checked=new Set();this.ticket=0;this.current=null;
  this.readContext=readContext??(()=>this.getState?.()?.state_revision);
  const el=(id: string)=>doc?.getElementById(id);this.el=el;
  if(el('measurement-sort'))el('measurement-sort')!.onchange=()=>this.render();
  if(el('measurement-history'))el('measurement-history')!.onchange=()=>this.render();
  if(el('measurement-show-history'))el('measurement-show-history')!.onclick=event=>{
   event.preventDefault();event.stopPropagation();
   const history=el('measurement-history'),disclosure=el('measurement-workspace') as (PresentationElement&{open:boolean})|null|undefined;
   if(!history||!disclosure||history.checked||!this.entries.length||this.visible().length)return;
   history.checked=true;disclosure.open=true;this.render();
  };
  if(el('measurement-jump'))el('measurement-jump')!.onclick=()=>this.run(()=>this.onJump(this.selected()));
  if(el('measurement-update'))el('measurement-update')!.onclick=()=>this.run(()=>this.onUpdate(this.selected()));
  if(el('measurement-copy'))el('measurement-copy')!.onclick=()=>this.run(async()=>{if(!(globalThis as PresentationEnvironment).navigator?.clipboard?.writeText)throw new Error('当前浏览器不能复制，请下载 TSV');await (globalThis as PresentationEnvironment).navigator!.clipboard!.writeText!(exportMeasurementTable(this.exportSelection({selectedOnly:true}),{delimiter:'\t'}));});
  for(const [id,delimiter,extension]of [['measurement-csv',',','csv'],['measurement-tsv','\t','tsv']])if(el(id))el(id)!.onclick=()=>this.download(delimiter,extension);
 }
 async run(callback: ()=>unknown){try{return await callback();}catch(error){this.onError(error);}}
 selected(){return this.entries.find(entry=>asRecord(entry).object_id===this.selectedId)??null;}
 displayEntry(entry: MeasurementEntry){
  if(this.current?.object_id!==this.getState?.()?.object?.object_id&&['current','active','stale','needs_remeasure','needs_remeasurement'].includes(entry.status??''))return {...entry,status:'historical',status_reason:'来源视图已改变；等待读回当前结果',same_grid:false,visible_in_current_view:false,annotation_matches_current:false,can_remeasure:false};
  if(entry.annotation_id&&this.pendingAnnotations().includes(entry.annotation_id)&&['current','active','stale','needs_remeasure','needs_remeasurement'].includes(entry.status??''))return {...entry,status:'needs_remeasurement',status_reason:'位置已修改，先前结果仅保留为证据',annotation_matches_current:false,can_remeasure:false};
  const state=this.getState!();if(this.current?.object_id!==state?.object?.object_id||!['current','active'].includes(entry.status as string)||entry.same_grid!==true||entry.annotation_matches_current!==true)return entry;
  const mark=state!.object!.annotations?.find(value=>value.annotation_id===entry.annotation_id);
  // A current automatic label can be saved after the immutable measurement.
  // Project its exact bound mark name only; numerical columns stay in the
  // original result and historical names are never rewritten.
  return typeof mark?.text==='string'&&mark.text.trim()?{...entry,name:mark.text}:entry;
 }
 exportSelection({selectedOnly=false}: {selectedOnly?:boolean}={}){const checked=this.entries.filter(entry=>this.checked.has(asRecord(entry).object_id));return (checked.length?checked:selectedOnly&&this.selected()?[this.selected()!]:this.visible()).map(entry=>this.displayEntry(entry));}
 visible(){const history=this.el('measurement-history')?.checked??false;let rows=this.entries.map(entry=>this.displayEntry(entry)).filter(e=>history||!['historical','history'].includes(e.status as string));const sort=this.el('measurement-sort')?.value??'record';if(sort==='name')rows=(rows as MeasurementEntry[] & {toSorted?: (compare: (a: MeasurementEntry,b: MeasurementEntry)=>number)=>MeasurementEntry[]}).toSorted?(rows as MeasurementEntry[] & {toSorted: (compare: (a: MeasurementEntry,b: MeasurementEntry)=>number)=>MeasurementEntry[]}).toSorted((a,b)=>measurementName(a).localeCompare(measurementName(b))):[...rows].sort((a,b)=>measurementName(a).localeCompare(measurementName(b)));if(sort==='value')rows=[...rows].sort((a,b)=>(measurementValues(a)[0]?.value??Infinity)-(measurementValues(b)[0]?.value??Infinity));return rows;}
 hasAnnotation(id: string){return Boolean(this.latestForAnnotation(id));}
 latestForAnnotation(id: string){const entries=this.entries.filter(e=>e.annotation_id===id);return entries.find(e=>['current','active','stale','needs_remeasure','needs_remeasurement'].includes(e.status as string))??entries.at(-1)??null;}
 selectAnnotation(id: string){const entry=this.latestForAnnotation(id);if(!entry)return false;this.select(asRecord(entry).object_id,{notify:false});this.el('measurement-rows')?.querySelector(`[data-measurement-id="${asRecord(entry).object_id}"]`)?.scrollIntoView?.({block:'nearest'});return true;}
 select(id: string | undefined,{notify=true}: {notify?:boolean}={}){const entry=this.entries.find(e=>asRecord(e).object_id===id);if(!entry)return false;this.selectedId=id;if(['historical','history'].includes(entry.status as string)&&this.el('measurement-history'))this.el('measurement-history')!.checked=true;this.render();if(notify)this.run(()=>this.onSelect(entry));return true;}
 async refresh(){
  const state=this.getState!(),objectId=state?.object?.object_id;if(!objectId)return false;const context=JSON.stringify(this.readContext()),ticket=++this.ticket;
  try{const next=await this.api!(('/api/measurements?object_id='+encodeURIComponent(objectId)) as `/api/measurements${string}`);const latest=this.getState!();if(ticket!==this.ticket||latest?.object?.object_id!==objectId||JSON.stringify(this.readContext())!==context||next.current?.object_id!==objectId)return false;
   this.current=next.current;this.entries=next.entries??next.measurements??[];this.truncated=Boolean(next.truncated);if(this.selectedId&&!this.entries.some(e=>asRecord(e).object_id===this.selectedId))this.selectedId=null;this.checked=new Set([...this.checked].filter(id=>this.entries.some(e=>asRecord(e).object_id===id)));this.render();return true;
  }catch(error){if(ticket===this.ticket&&this.getState!()?.object?.object_id===objectId)this.onError(error);return false;}
 }
 renderDetails(target: PresentationElement | null | undefined,details: DetailRows){if(!target||!this.document)return;target.replaceChildren();const dl=this.document!.createElement('dl');for(const [name,value]of details){const dt=this.document!.createElement('dt'),dd=this.document!.createElement('dd');dt.textContent=name;dd.textContent=typeof value==='object'?JSON.stringify(value):String(value);dl.append(dt,dd);}target.append(dl);}
 render(){
  const visible=this.visible();this.el('measurement-workspace')?.classList?.toggle('empty-results',visible.length===0);
  this.el('measurement-workspace')?.classList?.toggle('history-hidden-results',this.entries.length>0&&visible.length===0);
  const showHistory=this.el('measurement-show-history'),history=this.el('measurement-history');if(showHistory)showHistory.hidden=!(history&&!history.checked&&this.entries.length>0&&visible.length===0);
  const empty=this.el('measurement-empty');if(empty){empty.hidden=visible.length>0;empty.textContent=this.entries.length?'当前筛选隐藏了历史结果；点击“显示历史结果”或勾选“包含历史版本”查看。':'尚无保存测量；点选峰或绘制测量线后，使用图下测量操作。';}
  this.renderDetails(this.el('data-inspector'),inspectorDetails(this.current??{}));const body=this.el('measurement-rows');if(!body||!this.document)return;body.replaceChildren();
  if(this.el('measurement-count'))this.el('measurement-count')!.textContent=visible.length?`${visible.length} / ${this.entries.length} 条${this.truncated?' · 达到读取上限':''}`:this.entries.length?`历史 ${this.entries.length} 条 · 已筛选隐藏`:'尚无测量';
  for(const entry of visible){const m=asRecord(entry),row=this.document!.createElement('tr');row.dataset.measurementId=m.object_id;row.setAttribute('aria-selected',String(this.selectedId===m.object_id));row.classList.toggle('selected',this.selectedId===m.object_id);row.classList.toggle('stale',['stale','needs_remeasure','needs_remeasurement'].includes(entry.status as string));row.tabIndex=0;
   const checkbox=this.document!.createElement('input');checkbox.type='checkbox';checkbox.checked=this.checked.has(m.object_id);checkbox.setAttribute('aria-label','选择导出 '+measurementName(entry));checkbox.onchange=()=>{if(checkbox.checked)this.checked.add(m.object_id);else this.checked.delete(m.object_id);};checkbox.onclick=event=>event.stopPropagation();const checkCell=this.document!.createElement('td');checkCell.append(checkbox);row.append(checkCell);
   const values=measurementValues(entry);for(const text of [measurementName(entry)+' · '+measurementType(entry),values.map(v=>`${v.label} ${measurementNumber(v.value)}`).join(' / ')||(['stale','needs_remeasure','needs_remeasurement'].includes(entry.status??'')?'待重测':'未知'),values.map(v=>v.unit).join(' / ')||'—',this.sourceFftName(entry),measurementStatus(entry)]){const cell=this.document!.createElement('td');cell.textContent=text;row.append(cell);}
   row.onclick=()=>this.select(m.object_id);row.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();this.select(m.object_id);}};body.append(row);
  }
  const rawSelected=this.selected(),selected=rawSelected?this.displayEntry(rawSelected):null;this.renderDetails(this.el('measurement-detail'),selected?measurementSummary(selected,this.sourceFftName(selected)):[['结果','选择一行查看摘要；查看不会重算']]);this.renderDetails(this.el('measurement-evidence'),selected?measurementDetails(selected):[['证据','选中结果后可查看原精度、坐标、标定和请求身份']]);
  if(this.el('measurement-jump')){this.el('measurement-jump')!.hidden=!requiresMeasurementJump(selected);this.el('measurement-jump')!.disabled=!selected;}
  if(this.el('measurement-update'))this.el('measurement-update')!.disabled=!selected||selected.can_remeasure===false||['historical','history'].includes(selected.status as string);
 }
 sourceFftName(entry:MeasurementEntry){const m=asRecord(entry),scope=entry.source??entry.scope??{},id=(scope as {fft_object_id?:unknown}).fft_object_id??m.scientific_grid_identity?.source_grid_object_id;if(typeof id!=='string'||m.coordinate_space!=='frequency_cycles_per_pixel')return '非 FFT / 来源未记录';const state=this.getState?.() as {window_collection?:{windows?:{title:string;object_id:string;source_reference?:{raw_fft_object_id?:string}}[]}}|undefined;return state?.window_collection?.windows?.find(window=>window.object_id===id||window.source_reference?.raw_fft_object_id===id)?.title??'已保存 FFT（详证）';}
 download(delimiter: string,extension: string){try{const entries=this.exportSelection();if(!entries.length)throw new Error('当前没有可导出的保存测量');const blob=new Blob(['\uFEFF',exportMeasurementTable(entries,{delimiter})],{type:extension==='csv'?'text/csv;charset=utf-8':'text/tab-separated-values;charset=utf-8'}),url=URL.createObjectURL(blob),a=this.document!.createElement('a');a.href=url;a.download=`mcp-dm-measurements.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){this.onError(error);}}
}
