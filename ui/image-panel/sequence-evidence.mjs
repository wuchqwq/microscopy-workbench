// Read-only projection of authoritative saved joint observations. Navigation uses
// existing draft-aware show, never triggers FFT or computes science in the UI.
export function renderSequenceEvidence(container,evidence,{show,onError}={}) {
  if(!container)return;
  container.hidden=!evidence;
  if(!evidence){container.replaceChildren();return;}
  const doc=container.ownerDocument,make=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const summary=make('summary','跨帧联合观测 · 保存证据');
  const note=make('p','历史证据表不会随当前拖动自动改写。修订峰位后，由工具提交新测量并更新联合观测；相邻帧不等于独立置信样本。');
  note.className='help-text';
  const navigation=make('div');navigation.className='sequence-navigation';
  for(const frame of evidence.frame_observations??[]) {
    const row=make('div'),label=make('span',`序列位置 ${frame.frame_index+1} · ${frame.status} `);row.append(label);
    for(const [title,key] of [['原图 / ROI 框','overview_object_id'],['ROI','roi_object_id'],['FFT / 测量','view_object_id']]) {
      if(!frame[key])continue;
      const button=make('button',title);button.type='button';button.setAttribute('aria-label',`序列位置 ${frame.frame_index+1} ${title}`);
      button.addEventListener('click',()=>Promise.resolve(show(frame[key])).catch(onError));row.append(button);
    }
    navigation.append(row);
  }
  const scroll=make('div');scroll.className='results-scroll';const table=make('table');table.setAttribute('aria-label','跨帧反射证据');
  const head=make('thead'),header=make('tr');for(const name of ['序列位置','状态','fx / fy (cycles/px)','残差 (cycles/px)','周期 / 单位'])header.append(make('th',name));head.append(header);table.append(head);
  const body=make('tbody'),format=value=>Number.isFinite(value)?Number(value).toPrecision(5):'—';
  for(const row of evidence.observations??[]) {
    const tr=make('tr');tr.title=`保存测量：${row.measurement_object_id??'未匹配'}；参考：${row.reference_measurement_object_id??'无'}`;
    for(const text of [String(row.frame_index+1),row.status,row.frequency_cycles_per_pixel?.map(format).join(' / ')??'—',format(row.residual_cycles_per_pixel),Number.isFinite(row.d_spacing)?`${format(row.d_spacing)} ${row.d_spacing_unit}`:'—'])tr.append(make('td',text));body.append(tr);
  }
  table.append(body);scroll.append(table);container.replaceChildren(summary,note,navigation,scroll);
}
