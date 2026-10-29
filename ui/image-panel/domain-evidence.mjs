// Presentation of committed numerical evidence only. Buttons use the Panel's
// existing draft-aware navigation; no FFT, matching or phase inference here.
import {correspondenceEvidenceText} from './sequence-evidence.mjs';
export function renderDomainEvidence(container,evidence,{show,onError,png}={}) {
 if(!container)return;
 container.hidden=!evidence;
 if(!evidence){container.replaceChildren();return;}
 const doc=container.ownerDocument,el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const fmt=x=>Number.isFinite(x)?Number(x).toPrecision(5):'—';
 const comparison=evidence.kind==='local_signature_compare';
 const field=evidence.kind==='feature_field';
 const title=el('summary',field?'空间结构特征场 · 稀疏观测':comparison?'局部频谱几何比较 · 候选证据':'空间 ROI 图谱 · 保存观测');
 const note=el('p','这些是指定窗口中的反射证据，不是物相、孪晶或位错确认；未分割完整结构域。峰位修订需保存测量并提交新图谱，旧表保留为历史。相反反射按同一几何族处理，不是独立验证。');note.className='help-text';
 const provenance=el('p',`保存对象 ${evidence.object_id} · ${comparison?`${evidence.coordinate_unit}；容差 ${fmt(evidence.tolerance)}；不确定性未知；无独立留出验证`:'未改变源图；窗口重叠不表示独立证据'}`);provenance.className='help-text';
 const navigation=el('div');navigation.className='sequence-navigation';
 const button=(row,text,id)=>{if(!id)return;const b=el('button',text);b.type='button';b.addEventListener('click',()=>Promise.resolve(show(id)).catch(onError));row.append(b);};
 button(navigation,'原图 / ROI 框',evidence.overview_object_id);
 const entries=evidence.regions??evidence.source_entries??evidence.samples??[];
 for(const entry of entries){
  const index=entry.region_index??entry.index??entry.sample_index,frame=entry.index_kind==='frame_index';
  const row=el('div'),label=frame?'帧':'ROI';
  row.append(el('span',`${label} ${index+1} · ${entry.status??entry.geometry_status} · ${entry.measurements?.length??entry.measurement_object_ids?.length??0} 条测量 `));
  if(entry.mapping_evidence)row.append(el('span',correspondenceEvidenceText(entry.mapping_evidence,evidence.reference_index)+' '));
  button(row,`${label} ${index+1} 区域`,entry.roi_object_id);button(row,`${label} ${index+1} FFT / 测量`,entry.view_object_id);
  row.title=`科学 ROI ${JSON.stringify(entry.rect??entry.rect_xyxy??null)}；FFT ${entry.fft_object_id??'未知'}；定位不确定性未知`;
  navigation.append(row);
 }
 const contents=[title,note,provenance,navigation];
 if(field){
  const map=evidence.field_image;
  if(png&&map?.width>0&&map?.height>0){
   const wrapper=el('div');wrapper.className='feature-field-map';wrapper.style.aspectRatio=`${map.width} / ${map.height}`;
   const image=el('img');image.src='data:image/png;base64,'+png;image.alt='已保存的局部结构特征场；只显示取样窗口，未插值';wrapper.append(image);
   for(const hit of map.hotspots??[]){
    if(!hit.view_object_id)continue;
    const [x0,y0,x1,y1]=hit.rect_xyxy,b=el('button',String(hit.sample_index+1));b.type='button';b.className='field-hotspot';b.title=`位置 ${hit.sample_index+1}：打开已保存 FFT；重叠窗口可用下方列表分别选择`;b.setAttribute('aria-label',`特征场位置 ${hit.sample_index+1} FFT`);
    Object.assign(b.style,{left:100*x0/map.width+'%',top:100*y0/map.height+'%',width:100*(x1-x0)/map.width+'%',height:100*(y1-y0)/map.height+'%'});
    b.addEventListener('click',()=>Promise.resolve(show(hit.view_object_id)).catch(onError));wrapper.append(b);
   }
   contents.splice(3,0,wrapper);
  }
  const scroll=el('div');scroll.className='results-scroll';const table=el('table');table.setAttribute('aria-label','局部结构特征');const header=el('tr');
  for(const text of ['位置 / 源像素中心','有效性','频率族数','最短几何周期','方向 / °'])header.append(el('th',text));table.append(header);
  for(const sample of entries){const row=el('tr');row.title=(sample.invalid_reasons??[]).join('；');const f=sample.features??{};
   for(const value of [`${sample.sample_index+1} · ${(sample.center_xy??[]).map(fmt).join(', ')}`,sample.status,f.family_count??'—',`${fmt(f.shortest_period)} ${evidence.coordinate_domain==='physical'?'nm':'px'}`,(f.families??[]).map(v=>fmt(v.direction_angle_mod180_degrees)).join(' / ')||'—'])row.append(el('td',String(value)));table.append(row);}
  scroll.append(table);contents.push(scroll);
 }
 if(comparison){
  const scroll=el('div');scroll.className='results-scroll';const table=el('table');table.setAttribute('aria-label','局部频谱候选关系');
  const head=el('thead'),header=el('tr');for(const t of ['目标','关系状态','试算角度 / °','匹配族','最大残差 / '+evidence.coordinate_unit,'未匹配参考 / 目标','性质'])header.append(el('th',t));head.append(header);table.append(head);
  const body=el('tbody');
  for(const relation of evidence.relations??[])for(const candidate of relation.candidates?.length?relation.candidates:[{}]){
   const row=el('tr');row.title=relation.reason??'有限显式角度的描述性几何比较；尺度固定，无镜像拟合。';
   for(const value of [relation.target_index+1,relation.status,fmt(candidate.angle_degrees),candidate.matched_pairs?.length??'—',fmt(candidate.max_residual),`${candidate.unmatched_reference_family_ids?.length??'—'} / ${candidate.unmatched_target_family_ids?.length??'—'}`,candidate.accepted_descriptive_match?'候选几何相容（非确认）':'保留残差 / 限制'])row.append(el('td',String(value)));
   body.append(row);
  }
  table.append(body);scroll.append(table);contents.push(scroll);
 }
 container.replaceChildren(...contents);
}
