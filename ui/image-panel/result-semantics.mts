// Presentation only. The immutable provider record is the authority; no
// statistical or physical judgment is computed by this module.
import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v:Row,k:string)=>Object.hasOwn(v,k);
const string=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=1024;
const states=['satisfied','issues_detected','not_assessed','insufficient_evidence'];
const kinds=new Set(['fft','measure','peak_measurements','spatial_atlas','joint_observations','local_signature_compare','feature_field','spatial_field','field_extend','domain_map','gpa','topology']);
function copyBounded(value:unknown):unknown {
 let nodes=0;
 const visit=(v:unknown,depth:number):unknown=>{
  if(++nodes>1024||depth>8)throw Error('budget');
  if(v===null||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))return v;
  if(typeof v==='string'&&v.length<=1024)return v;
  if(Array.isArray(v)&&v.length<=32)return v.map(x=>visit(x,depth+1));
  if(row(v)&&Object.keys(v).length<=32&&Object.keys(v).every(k=>k.length<=96))return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x,depth+1)]));
  throw Error('nonfinite or unbounded JSON');
 };
 const result=visit(value,0),json=JSON.stringify(result);
 // UTF-8 byte length without a Node/DOM dependency; JSON escapes lone surrogates.
 let bytes=0;for(const c of json){const p=c.codePointAt(0)!;bytes+=p<=127?1:p<=2047?2:p<=65535?3:4;}
 if(bytes>24*1024)throw Error('byte budget');return result;
}
function assessments(v:unknown):boolean {
 return Array.isArray(v)&&v.length<=12&&v.every(x=>row(x)&&string(x.aspect)&&string(x.scope)&&string(x.basis)&&typeof x.status==='string'&&states.includes(x.status)&&Array.isArray(x.source_fields)&&x.source_fields.length<=8&&x.source_fields.every(string));
}
function known(v:unknown):v is Row {
 return row(v)&&v.version===1&&v.scope==='candidate_measurement_and_assisted_interpretation'&&
  row(v.numerical)&&v.numerical.execution==='completed'&&string(v.numerical.scope)&&assessments(v.numerical.checks)&&
  row(v.measurement_reliability)&&string(v.measurement_reliability.scope)&&assessments(v.measurement_reliability.assessments)&&
  row(v.interpretation)&&string(v.interpretation.scope)&&assessments(v.interpretation.assessments);
}
export function projectResultSemantics(object:Row):Row {
 if(!own(object,'result_semantics')){
  // Keep the existing producer discriminator on legacy peak views. This is
  // copied provenance, not an assessment synthesized for the historical record.
  if(object.kind==='fft_view'&&own(object,'peak_detection')){
   try{if(!row(object.peak_detection))throw Error('invalid peak discriminator');return {peak_detection:copyBounded(object.peak_detection)};}
   catch{return {result_semantics_projection:{status:'unavailable',reason:'invalid_legacy_peak_discriminator'}};}
  }
  return {};
 }
 try{
  const copied=copyBounded(object.result_semantics);
  return {result_semantics:copied,...(!known(copied)?{result_semantics_projection:{status:'unavailable',reason:'unrecognized_version_or_shape',instruction:'Read the original immutable object; no assessment was inferred.'}}:{})};
 }catch{return {result_semantics_projection:{status:'unavailable',reason:'invalid_or_over_budget',instruction:'Read the original immutable object; no assessment was truncated.'}};}
}
export function resultSemanticsModel(object:Row):{status:string;headline:string;assessment?:Row}|null {
 const projected=projectResultSemantics(object);
 if(own(object,'result_semantics_projection')||own(projected,'result_semantics_projection'))return {status:'unavailable',headline:'三层结果说明暂不可解释；请读取原对象',...(row(projected.result_semantics)?{assessment:projected.result_semantics}:{})};
 if(!own(object,'result_semantics'))return kinds.has(String(object.kind))||(['compare','register','compare_batch','crystal_evidence','twin_compare'].includes(String(object.kind))&&(object.backend==='external-structure-workspace'||object.provider==='external-structure-workspace'))||(object.kind==='fft_view'&&row(object.peak_detection))?{status:'not_recorded',headline:'此历史对象未记录三层结果说明；原状态保留原义'}:null;
 return {status:'available',headline:'计算检查、测量可靠性与候选解释分别记录',assessment:projected.result_semantics as Row};
}
const labels:Record<string,string>={satisfied:'已评估：满足所述标准',issues_detected:'已评估：发现问题',not_assessed:'尚未评估（不等于失败）',insufficient_evidence:'针对所述判断证据不足'};
export function renderResultSemantics(host:BrowserElement,object:Row,document:BrowserDocument):void {
 const model=resultSemanticsModel(object);host.replaceChildren();host.hidden=model===null;if(!model)return;
 const node=(tag:string,text:unknown)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 host.append(node('h2','科学结果的三层含义'),node('p',`保存对象：${object.object_id??'未知'} · ${String(object.kind??'未知')}`),node('p',model.headline));
 if(model.status==='available'&&model.assessment){
  for(const [key,title,rowsKey] of [['numerical','数值计算与检查','checks'],['measurement_reliability','测量可靠性','assessments'],['interpretation','候选解释与判断','assessments']]){
   const layer=model.assessment[key!] as Row;host.append(node('h3',title),node('p',layer.scope));
   for(const a of layer[rowsKey!] as Row[])host.append(node('p',`${a.aspect} · ${labels[String(a.status)]} · ${a.scope}\n${a.basis}\n依据字段：${(a.source_fields as string[]).join(', ')||'没有已执行的资格检查字段'}`));
  }
 }
 host.append(node('p','旧 valid 等状态按各算法原合同解释；数值有效不等于测量已获资格或物理解释成立。'));
 if(model.assessment){const details=node('details','');details.append(node('summary','原始三层记录（只读）'),node('pre',JSON.stringify(model.assessment,null,2)));host.append(details);}
}
