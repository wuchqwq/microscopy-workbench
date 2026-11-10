// Presentation/request adapter for existing raw-statistics and discovery tools.
// The provider remains authoritative for source/hash/calibration admission.
// No worker, model, numerical detector or request executor is introduced here.
type Row=Record<string,unknown>;
export type StemPoint=[number,number];
export type StemRect=[number,number,number,number];
export interface StemStudyInput {
 object_id:string; frame_object_id:string; shape_yx:[number,number];
 target_rect:StemRect; reference_rects:StemRect[]; reference_source_text:string;
 expected_position_xy:StemPoint; position_source_text:string; question:string;
 modality:'haadf'|'adf'|'abf'|'bf'|'idpc'|'dpc_component'|'ptychography_reconstruction'|'other'|'unknown';
 signal_kind:'raw_counts'|'stored_scalar'|'derived_scalar'|'unknown'; signal_source_text:string;
}
const modalities=['haadf','adf','abf','bf','idpc','dpc_component','ptychography_reconstruction','other','unknown'];
const signals=['raw_counts','stored_scalar','derived_scalar','unknown'];
const row=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('STEM 输入需要明确对象记录');return v as Row;};
const clone=<T,>(v:T):T=>structuredClone(v);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const ident=(v:unknown):string=>{if(typeof v!=='string'||!(/^[a-f0-9]{32}$/).test(v))throw Error('需要准确的已保存科学对象');return v;};
const request=(v:unknown):string=>{if(typeof v!=='string'||!(/^[A-Za-z0-9_-]{1,64}$/).test(v))throw Error('需要保存本次原请求身份');return v;};
const text=(v:unknown,label:string):string=>{if(typeof v!=='string'||!v.trim()||v.length>2000)throw Error('请补充'+label+'（1–2000字）');return v;};
function point(v:unknown):StemPoint {if(!Array.isArray(v)||v.length!==2||!v.every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('预期位置必须是原图的有限XY坐标，不能吸附亮峰');return [...v] as StemPoint;}
function rect(v:unknown):StemRect {if(!Array.isArray(v)||v.length!==4||!v.every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)||v[0]>=v[2]||v[1]>=v[3])throw Error('选区需为源像素半开整数矩形');return [...v] as StemRect;}
export function readStemStudyInput(value:unknown):StemStudyInput {
 const a=row(value),target=rect(a.target_rect),p=point(a.expected_position_xy),shape=a.shape_yx;
 if(!Array.isArray(shape)||shape.length!==2||!shape.every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0))throw Error('先核对原图尺寸与帧');
 if(!Array.isArray(a.reference_rects)||a.reference_rects.length<1||a.reference_rects.length>8)throw Error('明确选择全部1–8个参考；不能静默丢弃参考');
 const refs=a.reference_rects.map(rect),all=[target,...refs];
 if(new Set(all.map(v=>JSON.stringify(v))).size!==all.length)throw Error('目标和每个参考必须是不同选区');
 if(all.some(r=>r[2]>shape[1]||r[3]>shape[0]))throw Error('选区超出原图；不裁切或填充');
 if(refs.some(r=>r[2]-r[0]!==target[2]-target[0]||r[3]-r[1]!==target[3]-target[1]))throw Error('全部参考需与目标同形同尺寸；不能自动修改选区');
 if(p[0]<target[0]||p[0]>=target[2]||p[1]<target[1]||p[1]>=target[3]||p[0]>shape[1]-1||p[1]>shape[0]-1)throw Error('原预期点需在目标及源像素中心范围内；不能移到亮峰');
 if(!modalities.includes(String(a.modality))||!signals.includes(String(a.signal_kind)))throw Error('明确选择模态和信号含义，未知时保留未知');
 return {object_id:ident(a.object_id),frame_object_id:ident(a.frame_object_id),shape_yx:[...shape] as [number,number],target_rect:target,reference_rects:refs,
  reference_source_text:text(a.reference_source_text,'全部参考的选择依据'),expected_position_xy:p,position_source_text:text(a.position_source_text,'预期位置依据'),question:text(a.question,'有限研究问题'),
  modality:a.modality as StemStudyInput['modality'],signal_kind:a.signal_kind as StemStudyInput['signal_kind'],signal_source_text:text(a.signal_source_text,'模态与信号来源（未知时写明缺失）')};
}
/** Unknown acquisition semantics are a saved research state, not a reason to invent facts. */
export function stemStudyMissingConditions(value:unknown):string[] {
 const a=row(value),missing:string[]=[];
 if(a.modality==='unknown'||!modalities.includes(String(a.modality)))missing.push('成像模态／探测通道尚未知');
 if(a.signal_kind==='unknown'||!signals.includes(String(a.signal_kind)))missing.push('原数组信号／处理含义尚未知');
 for(const [key,label]of [['question','有限研究问题'],['position_source_text','预期位置依据'],['reference_source_text','全部参考的可比依据'],['signal_source_text','模态与信号来源']] as const)if(typeof a[key]!=='string'||!(a[key] as string).trim())missing.push(label+'尚未提供');
 return missing;
}
export function stemStatisticsArguments(value:unknown,requestId:string){const a=readStemStudyInput(value);return {object_id:a.object_id,rect:a.target_rect,component:'raw',reference_comparison:{reference_rects:a.reference_rects,source_text:a.reference_source_text},request_id:request(requestId)};}
export function stemDiscoveryArguments(value:unknown,requestId:string){const a=readStemStudyInput(value);return {object_id:a.object_id,entry:'manual',selection_origin:'researcher',regions:[{rect:a.target_rect,reason:a.question}],request_id:request(requestId)};}
export function stemReviewArguments(value:unknown,discoveryValue:unknown,statisticsValue:unknown,requestId:string,profileIds:string[]=[],previousReviewId?:string){
 const a=readStemStudyInput(value),discovery=row(discoveryValue),statistics=row(statisticsValue),comp=row(statistics.reference_comparison);
 if(discovery.kind!=='discovery'||!Array.isArray(discovery.candidates))throw Error('先读取准确的已保存目标观察');
 const dependency=row(discovery.source_dependency),selected=row(dependency.selected),science=row(dependency.science);
 if(selected.object_id!==a.object_id||science.frame_object_id!==a.frame_object_id||!same(science.shape_yx,a.shape_yx))throw Error('保存观察的源图、帧或尺寸已变化；不接入另一来源');
 const candidates=discovery.candidates.map(row).filter(c=>same(c.rect,a.target_rect));
 if(candidates.length!==1)throw Error('已保存观察没有唯一匹配的原目标');
 if(statistics.kind!=='statistics'||statistics.parent_object_id!==a.object_id||statistics.component!=='raw'||!same(statistics.source_rect_xyxy,a.target_rect)||!same(comp.reference_rects,a.reference_rects)||comp.source_text!==a.reference_source_text)throw Error('统计不匹配原目标、全部参考或其依据；先核对原请求');
 const evidence=[ident(statistics.object_id),...profileIds.map(ident)];if(evidence.length>8||new Set(evidence).size!==evidence.length)throw Error('最多8项不同证据，不能静默丢弃旧统计或剖线');
 return {object_id:ident(discovery.object_id),candidate_id:ident(candidates[0].candidate_id),evidence_ids:evidence,
  observation_text:'研究者给定预期位置与全部参考的原数组观察；物理原因仍未知。',site_context:{question:a.question,statistics_id:ident(statistics.object_id),expected_position_xy:a.expected_position_xy,position_source_text:a.position_source_text,modality:a.modality,signal_kind:a.signal_kind,signal_source_text:a.signal_source_text},
  include_site_continuation:true,...(previousReviewId?{previous_review_id:ident(previousReviewId)}:{}),request_id:request(requestId)};
}
/** Displays saved provider facts without recomputing a median or choosing references. */
export function stemReviewPresentation(value:unknown){
 const review=row(value),site=row(review.site_observation),raw=row(site.raw_observation),context=row(site.context),continuation=row(review.site_continuation),comparison=row(site.comparison);
 if(review.kind!=='discovery_review'||!Array.isArray(raw.references)||raw.references.length<1||raw.references.length>8)throw Error('读取完整的已保存预期点证据');
 return clone({review_object_id:ident(review.object_id),review_request_id:request(review.request_id),expected_position_xy:point(context.expected_position_xy),position_status:site.position_status,position_source_text:context.position_source_text,
  target_rect:site.readout_rect_xyxy,target_mean:raw.target_mean,references:raw.references,reference_source_text:raw.reference_source_text,reference_mean_median:raw.reference_mean_median,target_minus_reference_median:raw.target_minus_reference_median,
  reference_conflict:comparison.direction==='references_straddle_target',comparison,profile_ids:site.profile_ids,profile_coverage:site.profile_coverage,context,continuation_status:continuation.status,continuation_reason:continuation.reason,
  explanations:site.explanations,limitations:site.limitations,physical_conclusion:review.physical_conclusion??site.physical_conclusion??null,decision_authority:'saved_provider_observation_not_AI',source_dependency:review.source_dependency});
}
/** Return the already saved request. Caller must query its original outcome before any uncertain retry. */
export function stemProfileCall(value:unknown){
 const review=row(value),saved=row(review.site_continuation),site=row(review.site_observation),context=row(site.context);
 if(saved.version!==2||saved.status!=='tool_proposed'||saved.source_review_id!==review.object_id||saved.source_review_request_id!==review.request_id||!same(saved.expected_position_xy,context.expected_position_xy))throw Error('当前没有可明确执行的原点剖线建议；保留缺失条件或冲突');
 const action=row(saved.action),args=row(action.arguments),after=row(saved.after_success),next=row(after.arguments);
 if(action.tool!=='image_profile'||after.tool!=='image_discovery_review'||after.require_result_kind!=='profile'||next.previous_review_id!==review.object_id||!same(next.site_context,context)||args.request_id!==after.require_result_request_id||args.line_width!==1||args.interpolation!=='nearest'||args.sample_count!==5||!Array.isArray(args.points)||args.points.length!==2)throw Error('已保存剖线建议的身份或采样合同不完整');
 ident(args.object_id);request(args.request_id);args.points.forEach(point);
 return clone({tool:'image_profile',arguments:args});
}
/** Receipt-only adapter, never dispatches profile/review or substitutes a request ID. */
export function stemLinkedReviewCall(value:unknown,profileValue:unknown){
 const review=row(value),profile=row(profileValue),call=stemProfileCall(review),args=call.arguments,saved=row(review.site_continuation),after=row(saved.after_success),next=clone(row(after.arguments)),science=row(saved.source_science),grid=row(profile.scientific_grid_identity),sampling=row(profile.sampling);
 if(profile.state!=='completed'||profile.kind!=='profile'||profile.request_id!==args.request_id||profile.parent_object_id!==args.object_id||profile.component!=='raw'||!same(profile.points,args.points)||sampling.interpolation!==args.interpolation||sampling.line_width!==args.line_width||sampling.sample_count!==args.sample_count||grid.source_grid_object_id!==science.frame_object_id||grid.array_sha256!==science.array_sha256||grid.dtype!==science.dtype||!same(grid.shape_yx,science.shape_yx))throw Error('剖线原请求尚未完成或回执不匹配；查询原请求，不重测、不替换');
 if(!Array.isArray(review.evidence_refs)||!Array.isArray(next.evidence_ids)||!same(next.evidence_ids,review.evidence_refs.map(v=>ident(row(v).object_id)))||next.evidence_ids.length>=8||next.evidence_ids.includes(profile.object_id))throw Error('回接必须完整保留所有原证据，且只能追加一次匹配的新剖线');
 ident(next.object_id);ident(next.candidate_id);request(next.request_id);next.evidence_ids.push(ident(profile.object_id));
 return {tool:'image_discovery_review',arguments:next};
}
