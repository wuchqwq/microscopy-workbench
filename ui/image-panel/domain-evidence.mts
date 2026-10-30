import type {BrowserElement} from './browser-ports.mjs';
import type {DomainEvidence,DomainCandidate,EvidenceNavigation} from './evidence-contracts.mjs';
import {validateSpatialDomainEvidence} from './evidence-contracts.mjs';
// Presentation of committed numerical evidence only. Buttons use the Panel's
// existing draft-aware navigation; no FFT, matching or phase inference here.
import {correspondenceEvidenceText} from './sequence-evidence.mjs';
export function renderDomainEvidence(container: BrowserElement|null|undefined,evidence: DomainEvidence|null|undefined,{show,onError,png}: EvidenceNavigation={}) {
 if(!container)return;
 container.hidden=!evidence;
 if(!evidence){container.replaceChildren();return;}
 if(['spatial_field','field_extend','analysis_candidates','domain_map'].includes(evidence.kind))validateSpatialDomainEvidence(evidence);
 const doc=container.ownerDocument,el=(tag:string,text?:unknown)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const fmt=(x:unknown)=>Number.isFinite(x)?Number(x).toPrecision(5):'—';
 const comparison=evidence.kind==='local_signature_compare';
 const domains=evidence.kind==='domain_map';
 const field=['feature_field','spatial_field','field_extend','analysis_candidates'].includes(evidence.kind)||domains;
 const title=el('summary',evidence.kind==='analysis_candidates'?'下一步分析候选 · 启发式':evidence.kind==='field_extend'?'增量结构场 · 保存观测':domains?'空间结构域与边界 · 候选':evidence.kind==='spatial_field'?'多尺度结构特征场 · 保存观测':field?'空间结构特征场 · 稀疏观测':comparison?'局部频谱几何比较 · 候选证据':'空间 ROI 图谱 · 保存观测');
 const note=el('p',domains?'候选域表示相邻窗口在固定取向下的反射几何相容。允许旋转后的晶格几何相容另列，不用于合并取向域。边界带是有限窗口支持范围，不能当作边界定位精度；未采样及证据不足处保持未知。':'这些是指定窗口中的反射证据，不是物相、孪晶或位错确认；未分割完整结构域。峰位修订需保存测量并提交新图谱，旧表保留为历史。相反反射按同一几何族处理，不是独立验证。');note.className='help-text';
 const provenance=el('p',`保存对象 ${evidence.object_id} · ${comparison?`${evidence.coordinate_unit}；容差 ${fmt(evidence.tolerance)}；不确定性未知；无独立留出验证`:'未改变源图；窗口重叠不表示独立证据'}`);provenance.className='help-text';
 const navigation=el('div');navigation.className='sequence-navigation';
 const button=(row:BrowserElement,text:string,id:string|undefined)=>{if(!id)return;const b=el('button',text);b.type='button';b.addEventListener('click',()=>Promise.resolve(show!(id)).catch(onError));row.append(b);};
 button(navigation,'原图 / ROI 框',evidence.overview_object_id);
 const entries=evidence.regions??evidence.source_entries??evidence.samples??[];
 for(const entry of entries){
  const index=entry.region_index??entry.index??entry.sample_index,frame=entry.index_kind==='frame_index';
  const row=el('div'),label=frame?'帧':'ROI';
  row.append(el('span',`${label} ${index!+1}${entry.scale_pixels?` · ${entry.scale_pixels}px 窗口`:''} · ${entry.status??entry.geometry_status}${entry.domain_status?` / 域 ${entry.domain_status}`:''} · ${entry.measurements?.length??entry.measurement_object_ids?.length??0} 条测量 `));
  if(entry.mapping_evidence)row.append(el('span',correspondenceEvidenceText(entry.mapping_evidence,evidence.reference_index)+' '));
  button(row,`${label} ${index!+1} 区域`,entry.roi_object_id);button(row,`${label} ${index!+1} FFT / 测量`,entry.view_object_id);
  row.title=`科学 ROI ${JSON.stringify(entry.rect??entry.rect_xyxy??null)}；FFT ${entry.fft_object_id??'未知'}；定位不确定性未知`;
  navigation.append(row);
 }
 const contents=[title,note,provenance,navigation];
 if(evidence.kind==='analysis_candidates'){
  const stopping=evidence.stopping!,budget=evidence.budget!;
  const messages:Record<string,string>={user_stop:'用户要求停止',budget_exhausted:'预算耗尽',no_legal_actions:'没有合法新动作',data_quality_limited:'当前数据质量与可用方法受限',no_new_evidence:'连续追加未产生新证据',history_limit:'达到迭代或保存历史上限',continue:'可继续选择动作'};
  const status=el('p',`${stopping.stop?'停止建议':'下一步建议'}：${messages[stopping.reason]??stopping.reason}。已用 ${budget.used_windows} 个窗口 / ${budget.used_fft_pixels} FFT 像素；剩余 ${budget.remaining_windows} 个窗口 / ${budget.remaining_fft_pixels} FFT 像素。`);status.className='help-text';contents.push(status);
  const original=el('div');original.className='sequence-navigation';button(original,'来源域图',evidence.source_domain_map_id);button(original,'已有结构场',evidence.field_object_id);contents.push(original);
  const scroll=el('div');scroll.className='results-scroll';const table=el('table');table.setAttribute('aria-label','主动分析候选动作');const head=el('tr');
  for(const text of ['动作 / 来源像素 ROI','窗口','推荐理由','启发式优先级','预计新增计算'])head.append(el('th',text));table.append(head);
  for(const [i,action]of (evidence.actions??[]).entries()){
   const row=el('tr');row.title=`动作 ${action.action_id}；观测 ${action.observation_key}；选择与执行须使用正式工具，未执行 FFT。`;
   for(const text of [`${i+1}${evidence.recommended_action_ids?.includes(action.action_id)?' · 推荐':''} · ${JSON.stringify(action.rect_xyxy)}`,`${action.scale_pixels}px`,`${action.exploration?'保留探索；':''}${action.reason_codes.join(' / ')}`,`${fmt(action.heuristic_score)}（非概率）`,`${action.estimated_cost.new_windows} 窗口 / ${action.estimated_cost.fft_pixels} FFT 像素`])row.append(el('td',text));table.append(row);
  }
  scroll.append(table);contents.push(scroll);
 }
 if(evidence.kind==='field_extend')contents.push(el('p',`本次追加 ${evidence.added_observation_keys?.length??0} 个观测，修订 ${evidence.corrected_observation_keys?.length??0} 个观测；新增 FFT 像素 ${evidence.new_evidence?.added_fft_pixels??'未知'}。旧频谱保持原引用。`));
 const hotspotButtons=new Map<number,BrowserElement>();let mapWrapper:BrowserElement|undefined;
 if(field){
  const map=evidence.field_image;
  if(png&&map?.width!>0&&map?.height!>0){
   const wrapper=el('div');mapWrapper=wrapper;wrapper.className='feature-field-map';wrapper.style.aspectRatio=`${map!.width} / ${map!.height}`;
   const image=el('img');image.src='data:image/png;base64,'+png;image.alt=domains?'已保存的结构域候选、窗口支持边界带和未知区域':'已保存的局部结构特征场；只显示取样窗口，未插值';wrapper.append(image);
   for(const hit of map!.hotspots??[]){
    if(!hit.view_object_id)continue;
    const [x0,y0,x1,y1]=hit.rect_xyxy,b=el('button',String(hit.sample_index+1));b.type='button';b.className='field-hotspot';b.title=`位置 ${hit.sample_index+1}：打开已保存 FFT；重叠窗口可用下方列表分别选择`;b.setAttribute('aria-label',`特征场位置 ${hit.sample_index+1} FFT`);
    Object.assign(b.style,{left:100*x0/map!.width+'%',top:100*y0/map!.height+'%',width:100*(x1-x0)/map!.width+'%',height:100*(y1-y0)/map!.height+'%'});
    b.addEventListener('click',()=>Promise.resolve(show!(hit.view_object_id!)).catch(onError));wrapper.append(b);hotspotButtons.set(hit.sample_index,b);
   }
   contents.splice(3,0,wrapper);
  }
  const scroll=el('div');scroll.className='results-scroll';const table=el('table');table.setAttribute('aria-label','局部结构特征');const header=el('tr');
  for(const text of ['位置 / 源像素中心','有效性','频率族数','最短几何周期','方向 / °'])header.append(el('th',text));table.append(header);
  for(const sample of entries){const row=el('tr');row.title=[...(sample.invalid_reasons??[]),sample.domain_unknown_reason].filter(Boolean).join('；');const f=sample.features??{};
   for(const value of [`${sample.sample_index!+1} · ${(sample.center_xy??[]).map(fmt).join(', ')}`,sample.domain_status?`${sample.status} / 域 ${sample.domain_status}`:sample.status,f.family_count??'—',`${fmt(f.shortest_period)} ${evidence.coordinate_domain==='physical'?'nm':'px'}`,(f.families??[]).map(v=>fmt(v.direction_angle_mod180_degrees)).join(' / ')||'—'])row.append(el('td',String(value)));table.append(row);}
  scroll.append(table);contents.push(scroll);
 }
 if(domains){
  const counts=el('p',`${evidence.domains?.length??0} 个候选连通域 · ${evidence.boundary_bands?.length??0} 条边界候选带 · ${evidence.unknown_sample_indices?.length??0} 个未知窗口。物相、孪晶、位错与统计误差均未确认。`);counts.className='help-text';contents.push(counts);
  const domainScroll=el('div');domainScroll.className='results-scroll';const domainTable=el('table');domainTable.setAttribute('aria-label','空间结构域候选');const head=el('tr');
  for(const text of ['候选域','窗口 / 尺度','状态','原图支持范围'])head.append(el('th',text));domainTable.append(head);
  for(const candidate of evidence.domains??[]){
   const row=el('tr');row.title=`源像素支持 ${JSON.stringify(candidate.support_rects)}；窗口覆盖不是物理边界精度`;
   const sampleRows=entries.filter(sample=>candidate.sample_indices.includes(sample.sample_index!));
   for(const text of [candidate.domain_id,candidate.sample_indices.map(i=>`${i+1}`).join(', ')+' · '+[...new Set(sampleRows.map(s=>s.scale_pixels))].join('/')+' px','候选；非物相确认'])row.append(el('td',text));
   const cell=el('td'),locate=el('button','定位候选覆盖');locate.type='button';locate.title='在保存的原图特征图上突出对应窗口；不重新计算或修改科学结果';locate.addEventListener('click',()=>{
    for(const [index,hit]of hotspotButtons)hit.style.outline=candidate.sample_indices.includes(index)?'3px solid #ffca6a':'';
    mapWrapper?.scrollIntoView?.({block:'nearest'});
   });cell.append(locate);row.append(cell);domainTable.append(row);
  }
  domainScroll.append(domainTable);contents.push(domainScroll);
  const edgeScroll=el('div');edgeScroll.className='results-scroll';const edgeTable=el('table');edgeTable.setAttribute('aria-label','窗口邻接与边界候选');const edgeHead=el('tr');
  for(const text of ['邻接窗口','固定取向几何','允许候选旋转后的几何','空间关系','边界支持带 / 源像素'])edgeHead.append(el('th',text));edgeTable.append(edgeHead);
  for(const edge of evidence.edges??[]){const row=el('tr');for(const value of [edge.sample_indices.map(i=>i+1).join(' ↔ '),edge.orientation.status,edge.lattice_geometry.status+(edge.lattice_geometry.accepted_angles_degrees?.length?' · '+edge.lattice_geometry.accepted_angles_degrees.map(fmt).join('/')+'°':''),edge.status,edge.boundary_band_xyxy?JSON.stringify(edge.boundary_band_xyxy):'—'])row.append(el('td',value));edgeTable.append(row);}
  edgeScroll.append(edgeTable);contents.push(edgeScroll);
 }
 if(comparison){
  const scroll=el('div');scroll.className='results-scroll';const table=el('table');table.setAttribute('aria-label','局部频谱候选关系');
  const head=el('thead'),header=el('tr');for(const t of ['目标','关系状态','试算角度 / °','匹配族','最大残差 / '+evidence.coordinate_unit,'未匹配参考 / 目标','性质'])header.append(el('th',t));head.append(header);table.append(head);
  const body=el('tbody');
  for(const relation of evidence.relations??[])for(const candidate of relation.candidates?.length?relation.candidates:[{} as DomainCandidate]){
   const row=el('tr');row.title=relation.reason??'有限显式角度的描述性几何比较；尺度固定，无镜像拟合。';
   for(const value of [relation.target_index+1,relation.status,fmt(candidate.angle_degrees),candidate.matched_pairs?.length??'—',fmt(candidate.max_residual),`${candidate.unmatched_reference_family_ids?.length??'—'} / ${candidate.unmatched_target_family_ids?.length??'—'}`,candidate.accepted_descriptive_match?'候选几何相容（非确认）':'保留残差 / 限制'])row.append(el('td',String(value)));
   body.append(row);
  }
  table.append(body);scroll.append(table);contents.push(scroll);
 }
 container.replaceChildren(...contents);
}
