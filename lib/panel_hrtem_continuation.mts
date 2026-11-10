// Saved-band Task A adapter. This module never calculates FFT/GPA/phase,
// validates files, dispatches requests, or upgrades a provider interpretation.
type Row=Record<string,unknown>;
const isRow=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const row=(v:unknown):Row=>isRow(v)?v:{};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const point=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===2&&v.every(finite);
const copy=<T,>(v:T):T=>structuredClone(v);
function fail(text:string):never {throw Error(text);}

export interface HrtemComparisonReadiness {
 ready:boolean;missing:string[];object_id:string|null;shape_yx:number[]|null;
 source_mapping:Row|null;parameters:Row|null;input_dependency:Row|null;
}
/** UI preflight only. The existing provider remains authoritative for arrays,
 * manifests, fixed-g diversity, masks and historical compatibility. */
export function hrtemComparisonReadiness(value:unknown):HrtemComparisonReadiness {
 const seed=row(value),parameters=row(seed.parameters),dependency=row(seed.input_dependency),missing:string[]=[];
 if(!id(seed.object_id)||seed.kind!=='gpa')missing.push('选择一份已保存且可读取的 GPA 频带结果；原始 HRTEM 或 FFT 不能直接作为频带比较输入。');
 if(parameters.reference_mode!=='fixed_g')missing.push('需要已有 fixed_g 频带；本入口不会自动重算 GPA 或转换参考模式。');
 const shape=seed.shape_yx;
 if(!Array.isArray(shape)||shape.length!==2||!shape.every(v=>Number.isSafeInteger(v)&&v>=64&&v<=512))missing.push('保存频带缺少有效64至512像素局部网格；读取原对象核对，不能从 PNG 推算。');
 if(!Array.isArray(parameters.g_vectors)||parameters.g_vectors.length!==2||!parameters.g_vectors.every(point))missing.push('保存频带缺少明确的两个原始 g 方向。');
 if(!id(row(dependency.fft).object_id)||!id(row(dependency.source).object_id))missing.push('保存频带缺少准确源图与 FFT 引用。');
 if(typeof parameters.reference_text!=='string'||!parameters.reference_text.trim())missing.push('原频带缺少其参考来源说明。');
 return {ready:missing.length===0,missing,object_id:id(seed.object_id)?seed.object_id:null,
  shape_yx:Array.isArray(shape)&&shape.length===2&&shape.every(finite)?copy(shape):null,
  source_mapping:isRow(dependency.source_mapping)?copy(dependency.source_mapping):null,
  parameters:isRow(seed.parameters)?copy(parameters):null,input_dependency:isRow(seed.input_dependency)?copy(dependency):null};
}

function rectangle(value:unknown,label:string):number[]{
 if(!Array.isArray(value)||value.length!==4||!value.every(v=>Number.isSafeInteger(v)&&v>=0)||value[0]>=value[2]||value[1]>=value[3])fail(label+'须为明确的整数半开矩形；未对小数坐标静默取整。');
 return [...value] as number[];
}
export interface HrtemComparisonInput {
 seed:unknown;target_rect:unknown;reference_rect:unknown;reference_text:unknown;
 coordinate_space?:'local_fft_pixels'|'source_pixels';source_object_id?:unknown;
}
/** Convert an explicitly chosen image rectangle into this saved FFT grid.
 * Source-pixel input requires the exact mapping and frame identity. No clipping,
 * snapping, ratio assumption or inference from display pixels is permitted. */
function localRect(value:unknown,label:string,input:HrtemComparisonInput,ready:HrtemComparisonReadiness):number[]{
 let rect=rectangle(value,label);
 if(input.coordinate_space==='source_pixels'){
  const mapping=ready.source_mapping??{},source=rectangle(mapping.source_rect_xyxy,'频带源图映射');
  const image=rectangle(mapping.image_rect_xyxy,'频带局部映射');
  if(!id(input.source_object_id)||mapping.domain!=='spatial_pixels'||mapping.source_object_id!==input.source_object_id)fail('选区不属于该保存频带的准确源帧；请返回对应原窗口选择。');
  if(rect[0]!<source[0]!||rect[1]!<source[1]!||rect[2]!>source[2]!||rect[3]!>source[3]!)fail(label+'超出该保存频带的源图范围；没有裁切或换用其他图像。');
  const sx=(image[2]!-image[0]!)/(source[2]!-source[0]!),sy=(image[3]!-image[1]!)/(source[3]!-source[1]!);
  rect=[image[0]!+(rect[0]!-source[0]!)*sx,image[1]!+(rect[1]!-source[1]!)*sy,image[0]!+(rect[2]!-source[0]!)*sx,image[1]!+(rect[3]!-source[1]!)*sy];
  rect=rectangle(rect,label+'转换后局部矩形');
 }else if(input.coordinate_space!==undefined&&input.coordinate_space!=='local_fft_pixels')fail('明确使用源像素或保存 FFT 局部像素；不接受显示像素。');
 const [height,width]=ready.shape_yx!;
 if(rect[2]!>width!||rect[3]!>height!)fail(label+'超出保存 FFT 局部网格。');
 return rect;
}

/** Provider parameters only; original request identity is assigned and journaled
 * by the shared caller before submission. This never submits or retries. */
export function hrtemComparisonParameters(input:HrtemComparisonInput){
 const ready=hrtemComparisonReadiness(input.seed);
 if(!ready.ready)fail(ready.missing.join('\n'));
 if(typeof input.reference_text!=='string'||!input.reference_text.trim()||input.reference_text.length>2000)fail('请填写真实参考选择依据或明确工作假设（不超过2000字符）；不自动推断参考等价。');
 return {object_ids:[ready.object_id!],budget:{method_calls:0,fft_pixels:0,gpa_band_pixels:0,topology_path_samples:0},
  information:{goal:'peak_roi_comparison' as const,roi_rect:localRect(input.target_rect,'目标区',input,ready),reference_rect:localRect(input.reference_rect,'参考区',input,ready),reference_text:input.reference_text}};
}

/** Identity/provenance for the UI, kept outside provider parameters. */
export function hrtemComparisonContext(input:HrtemComparisonInput){
 const parameters=hrtemComparisonParameters(input),seed=row(input.seed);
 return {kind:'saved_hrtem_band_comparison_input_v1',seed_object_id:seed.object_id,
  seed_request_id:seed.request_id??null,input_dependency:copy(seed.input_dependency),
  saved_band_parameters:copy(seed.parameters),target:{role:'target',coordinate_space:'local_fft_pixels',rect:copy(parameters.information.roi_rect)},
  reference:{role:'explicit_reference',coordinate_space:'local_fft_pixels',rect:copy(parameters.information.reference_rect),source_text:parameters.information.reference_text},
  original_selection:{coordinate_space:input.coordinate_space??'local_fft_pixels',source_object_id:input.source_object_id??null,target_rect:copy(input.target_rect),reference_rect:copy(input.reference_rect)},
  missing_external_conditions:'Reference equivalence, imaging transfer and material interpretation are not independently established.'};
}

/** Read a saved provider decision without dispatch or numerical recomputation.
 * Exact result JSON stays available; rounded strings are presentation only. */
export function hrtemComparisonSummary(value:unknown){
 const saved=row(value),decision=row(saved.decision),report=row(decision.peak_comparison);
 if(saved.kind!=='method_plan'||!id(saved.object_id)||row(saved.information).goal!=='peak_roi_comparison'||!Array.isArray(report.peaks)||report.peaks.length!==2)return {available:false as const,reason:'尚无可读取的保存频带比较结果；不补造数值或重发原请求。'};
 const number=(v:unknown)=>v===null?'不可用':finite(v)?Number(v.toPrecision(6)).toString():'格式未识别';
 const bands=report.peaks.map(raw=>{
  const band=row(raw),regions=row(band.regions),target=row(regions.roi_rect),reference=row(regions.reference_rect);
  return {band_id:band.band_id,band_index:band.band_index,g_cycles_per_pixel:copy(band.g_cycles_per_pixel),status:band.status,
   amplitude_ratio:band.amplitude_ratio,phase_difference_wrapped_rad:band.phase_difference_wrapped_rad,
   target:copy(target),reference:copy(reference),
   text:`频带 ${String(band.band_index)}：幅值比 ${number(band.amplitude_ratio)}；包裹相位差 ${number(band.phase_difference_wrapped_rad)}${band.phase_difference_wrapped_rad===null?'':' rad'}；目标有效支持 ${String(target.valid_count)}/${String(target.pixel_count)}，参考 ${String(reference.valid_count)}/${String(reference.pixel_count)}。${target.reason||reference.reason?' 原因：'+String(target.reason??reference.reason):''}`};
 });
 const limitation='同一保存滤波频带的条件性图像比较；null不是零。幅值可用不保证单一相位差可用；没有新FFT/GPA、局部频率、物相、应变或缺陷确认。';
 const text=[`已保存频带比较 · ${String(report.status)}`,
  `参考依据（调用者提供，未独立验证）：${String(report.reference_text)}`,
  ...bands.map(band=>band.text),
  '仍未知：参考区材料等价、成像传递与物理解释未独立验证；确定性支持门槛不是置信度。',limitation].join('\n');
 return {available:true as const,object_id:saved.object_id,request_id:saved.request_id,root_plan_id:saved.root_plan_id,
  status:report.status,seed_object_ids:copy(saved.seed_object_ids),input_refs:copy(saved.input_refs),
  roi_rect:copy(report.roi_rect),reference_rect:copy(report.reference_rect),reference_text:report.reference_text,
  bands,exact_report:copy(report),text,limitation};
}
