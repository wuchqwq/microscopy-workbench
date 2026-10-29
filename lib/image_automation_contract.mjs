// Composition tools delegate science and persistence to the same image worker.
const id={type:'string',pattern:'^[a-f0-9]{32}$'};
const requestId={type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',description:'Save before submitting. Recover with image_result; incomplete batches are not replayed.'};
const rect={type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}};
const size={type:'integer',minimum:32,maximum:1024};
const make=(name,description,properties,required)=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties:{...properties,request_id:requestId},required:[...required,'request_id']}});
export const automationTools=[
  make('image_roi_propose','Propose bounded multiscale square windows on an explicit spatial frame. Deterministic coverage ranked by raw contrast, not crystal/phase segmentation. Returns source context, exact half-open rectangles, and an overview PNG with editable ROI marks. Agent may choose/adjust rectangles before computing FFT.',{object_id:id,window_sizes:{type:'array',minItems:1,maxItems:4,items:{type:'integer',minimum:8,maximum:2048}},max_regions:{type:'integer',minimum:1,maximum:8},max_size:size},['object_id']),
  make('image_fft_batch','Compute1..8 local FFTs and spatial previews with original-image ROI context. Sum of FFT areas <=4194304 pixels. Explicit parameters, source protected, existing NumPy FFT. To revise windows, pass previous_batch_id on the exact same frame/calibration; unchanged rectangles reuse saved FFTs. Contact sheet is display only; use returned per-region IDs in GUI/tools.',{object_id:id,rects:{type:'array',minItems:1,maxItems:8,items:rect},window:{type:'string',enum:['none','hann']},subtract_mean:{type:'boolean'},max_size:size,previous_batch_id:id},['object_id','rects']),
  make('image_peak_measurements','Measure selected saved image_peaks maxima through existing image_measure, retaining ordinary measurement objects and an editable annotated view. DC-referenced geometry, hypothesized only. After a GUI drag use image_remeasure with current anchors; the old detector table is immutable history. Does not recompute FFT.',{object_id:id,peak_ids:{type:'array',minItems:1,maxItems:32,items:{type:'string',maxLength:64}},max_peaks:{type:'integer',minimum:1,maximum:32}},['object_id']),
];
export const automationActions={image_roi_propose:'roi_propose',image_fft_batch:'fft_batch',image_peak_measurements:'peak_measurements'};
export const automationRecipes=Object.fromEntries(automationTools.map(t=>[t.name,{
  inputs:['Exact immutable image/FFT reference','Explicit scientific parameters and pre-saved request ID'],
  outputs:['Immutable batch/proposal reference with original source/calibration and child object identities','Context PNG and GUI-openable existing views; no science from PNG'],
  kind:'bounded-scientific-composition-write',
  gates:['Uses existing authoritative image journal and child operations; no hidden model or alternate backend','Spatial real frame for ROI/FFT; exact saved detection view for peak measurements','No confirmed phase, defect, depth or calibration inferred'],
  budgets:['<=8 regions; aggregate FFT <=4194304 pixels; <=32 peak measurements; preview<=1024','Interrupted child/parent is queried by original ID, never auto-replayed'],
}]));
