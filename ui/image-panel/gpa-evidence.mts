// Presentation of saved provider evidence only. No GPA calculation or new
// material-validity decision lives here. Historical absent fields stay absent.
import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';

type Row=Record<string,unknown>;
const row=(value:unknown):value is Row=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const isGpa=(value:Row)=>value.kind==='gpa'||value.kind==='gpa_view';
const own=(value:Row,key:string)=>Object.hasOwn(value,key);
const text=(value:unknown,max=2048):value is string=>typeof value==='string'&&value.length<=max;

/** Exact bounded copy, not truncation: a partial assessment must not look complete. */
function boundedCopy(value:unknown):unknown {
 let nodes=0,characters=0;
 const copy=(item:unknown,depth:number):unknown=>{
  if(++nodes>512||depth>8)throw Error('GPA assessment exceeds presentation budget');
  if(item===null||typeof item==='boolean')return item;
  if(typeof item==='number'&&Number.isFinite(item))return item;
  if(typeof item==='string'){
   characters+=item.length;
   if(item.length>2048||characters>16384)throw Error('GPA assessment text exceeds presentation budget');
   return item;
  }
  if(Array.isArray(item)&&item.length<=32)return item.map(child=>copy(child,depth+1));
  if(row(item)){
   const keys=Object.keys(item);
   if(keys.length>32||keys.some(key=>key.length>96))throw Error('GPA assessment keys exceed presentation budget');
   characters+=keys.reduce((total,key)=>total+key.length,0);
   if(characters>16384)throw Error('GPA assessment exceeds presentation budget');
   return Object.fromEntries(keys.map(key=>[key,copy(item[key],depth+1)]));
  }
  throw Error('GPA assessment is not bounded finite JSON');
 };
 return copy(value,0);
}

/** Add to a live Panel projection; never mutate or backfill a scientific record. */
export function projectGpaEvidence(object:Row):Row {
 if(!isGpa(object))return {};
 const result:Row={};
 let malformedOuter=false;
 for(const key of ['gpa_object_id','coordinate_domain','interpretation_status']){
  if(text(object[key],128))result[key]=object[key];
  else if(own(object,key))malformedOuter=true;
 }
 if(typeof object.material_strain_verified==='boolean'||object.material_strain_verified===null)
  result.material_strain_verified=object.material_strain_verified;
 else if(own(object,'material_strain_verified'))malformedOuter=true;
 if(malformedOuter)result.evidence_assessment_projection={status:'unavailable',reason:'invalid_outer_evidence_fields',
  instruction:'Read the exact saved object with image_info; invalid ancillary evidence fields were not interpreted.'};
 if(own(object,'evidence_assessment')){
  try{
   if(!row(object.evidence_assessment))throw Error('Assessment is not an object');
   result.evidence_assessment=boundedCopy(object.evidence_assessment);
  }catch{
   // The saved view remains usable, but omitted diagnostics cannot be mistaken
   // for a legacy record or for evidence that the physical model was validated.
   result.evidence_assessment_projection={status:'unavailable',reason:'invalid_or_over_budget',
    instruction:'Read the exact saved object with image_info; no assessment was truncated or invented.'};
  }
 }
 return result;
}

const reasons:Record<string,string>={
 single_domain_displacement_origin_not_independently_established:'相位是否主要来自单域晶格位移，尚未得到独立验证。',
 signal_and_model_uncertainty_not_quantified:'信号与模型误差尚未量化；数值有效掩膜不等于材料应变验证。',
 band_limited_field_cannot_exclude_out_of_band_deformation:'带通后的近零场不能排除带宽之外的形变。',
 physical_xy_calibration_missing:'缺少物理 XY 标定；保留图像坐标结果，不补出物理度量。',
};

// Recognize the shape of the diagnostics we describe, without evaluating their
// scientific values or recomputing the provider's assessment. Bounded unknown
// shapes remain available as exact read-only diagnostics, never as known v1.
function knownDiagnostics(assessment:Row):boolean {
 const transfer=assessment.spatial_transfer;
 const pair=(value:unknown)=>Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='number'&&Number.isFinite(v));
 return Array.isArray(assessment.reason_codes)&&assessment.reason_codes.every(code=>text(code)&&code.length>0)&&
  row(transfer)&&text(transfer.model)&&transfer.model.length>0&&text(transfer.scope)&&transfer.scope.length>0&&
  transfer.frequency_unit==='cycles/pixel'&&pair(transfer.aperture_sigma_cycles_per_pixel)&&
  pair(transfer.aperture_cutoff_cycles_per_pixel)&&pair(transfer.nominal_untruncated_gaussian_real_space_fwhm_pixels)&&
  Array.isArray(transfer.response_samples)&&transfer.response_samples.length>0&&transfer.response_samples.every(sample=>
   row(sample)&&typeof sample.modulation_period_pixels==='number'&&typeof sample.central_difference_gain_1d==='number'&&
   pair(sample.phase_gain_per_reflection)&&pair(sample.first_order_strain_gain_1d_per_reflection));
}

export interface GpaEvidenceModel {
 status:'not_recorded'|'available'|'unavailable';headline:string;messages:string[];assessment?:Row;
}
export function gpaEvidenceModel(object:Row):GpaEvidenceModel|null {
 if(!isGpa(object))return null;
 const fields=projectGpaEvidence(object);
 if(own(object,'evidence_assessment_projection')||own(fields,'evidence_assessment_projection'))
  return {status:'unavailable',headline:'GPA 证据说明暂不可用 · 不代表材料应变已验证',
   messages:['请用 image_info 查询这一确切保存对象；界面没有重算、截断或补写科学判断。'],
   ...(row(fields.evidence_assessment)?{assessment:fields.evidence_assessment}:{})};
 if(!own(object,'evidence_assessment'))
  return {status:'not_recorded',headline:'此保存对象未记录 GPA 证据评估',
   messages:['历史结果按原解释保留；没有补写新评估，也不能从 valid_tensor 推出材料应变已验证。']};
 const assessment=fields.evidence_assessment;
 if(!row(assessment))return {status:'unavailable',headline:'GPA 证据格式未识别',messages:['保留原结果，不能从显示成功推出物理验证。']};
 const known=assessment.semantics_version===1&&assessment.numerical_field_status==='computed_conditional'&&
  assessment.material_strain_status==='insufficient_evidence'&&assessment.material_strain_validated===null&&
  fields.material_strain_verified!==true&&knownDiagnostics(assessment)&&
  (!own(fields,'interpretation_status')||fields.interpretation_status==='hypothesized');
 if(!known)return {status:'unavailable',headline:'GPA 证据语义未识别或不一致 · 不作验证结论',
  messages:['保存的诊断仅供查看；本界面不把未知版本或矛盾字段解释为验证通过。'],assessment};
 const codes=Array.isArray(assessment.reason_codes)?assessment.reason_codes:[];
 const messages=['数值层：已计算条件性场；掩膜描述计算条件，不证明材料模型。',
  '物理层：材料应变证据不足。需要独立依据，不能只凭彩色场或有效像素比例下结论。'];
 for(const code of codes)if(text(code))messages.push(own(reasons,code)?reasons[code]:code);
 const transfer=assessment.spatial_transfer;
 if(row(transfer))messages.push('带宽层：小相位、恒振幅、孤立载波的一维解析响应；不是实测空间分辨率、置信区间或校正后的应变。');
 return {status:'available',headline:'GPA 条件数值结果 · 材料应变未验证',messages,assessment};
}

const rendered=new WeakMap<BrowserElement,string>();
export function renderGpaEvidence(host:BrowserElement,object:Row,document:BrowserDocument):void {
 const model=gpaEvidenceModel(object);
 const signature=JSON.stringify([object.object_id,object.kind,model]);
 if(rendered.get(host)===signature)return;
 rendered.set(host,signature);
 host.replaceChildren();host.hidden=model===null;if(!model)return;
 const node=(tag:string,content:unknown)=>{const element=document.createElement(tag);element.textContent=content;return element;};
 host.append(node('h2','GPA 证据边界'),node('strong',model.headline));
 for(const message of model.messages)host.append(node('p',message));
 if(model.assessment){const detail=document.createElement('details');
  detail.append(node('summary','保存的证据评估与解析带宽响应'),node('pre',JSON.stringify(model.assessment,null,2)));
  host.append(detail);
 }
}
