// Presentation of an immutable FFT against an explicitly available source ROI.
// Missing identity/geometry is unknown, never treated as a match.
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function fftWindowStatus(reference:unknown,source:unknown,local?:{annotation_id?:string|null;selection?:unknown}|null):{state:'current'|'stale'|'unknown';label:string;detail:string}{
 const unknown={state:'unknown' as const,label:'来源待核对',detail:'原始 ROI 身份或当前空间输入不可核对；不会从最近选区推断。'};
 if(!row(reference)||!row(reference.input_view_context)||!row(reference.input_view_context.selection_candidate))return unknown;
 const context=reference.input_view_context,original=context.selection_candidate as Row,id=context.selected_annotation_id;
 if(original.coordinate_space!=='source_pixels'||original.source_object_id!==reference.frame_object_id||!Array.isArray(original.coordinates)||typeof id!=='string'||!row(source)||!Array.isArray(source.annotations))return unknown;
 const marks=source.annotations.filter(m=>row(m)&&m.annotation_id===id);if(marks.length!==1)return unknown;const mark=marks[0];if(!row(mark)||mark.status==='retracted'||!row(mark.anchor))return {state:'stale',label:'旧选区 · 未重算',detail:'原 ROI 已撤回；此频谱保留其历史输入。'};
 let anchor=mark.anchor;if(local?.annotation_id===id&&row(local.selection))anchor=local.selection;
 if(anchor.source_object_id!==reference.frame_object_id||anchor.coordinate_space!=='source_pixels'||!Array.isArray(anchor.coordinates))return unknown;
 if(!same(anchor.coordinates,original.coordinates))return {state:'stale',label:'旧选区 · 未重算',detail:'同一 ROI 已移动或缩放，此 FFT 仍对应原始浮点输入；可查看来源，或在当前 ROI 明确重算。'};
 if(local?.annotation_id&&local.annotation_id!==id)return {state:'stale',label:'其他选区的结果',detail:'当前选择不是此 FFT 的原 ROI，原频谱未改变。'};
 return {state:'current',label:'原选区结果',detail:'原 ROI 身份与现有几何一致；这不是自动重算或新的科学结论。'};
}
