import type {ArgumentSchema,ToolInputSchema} from './runtime/schema.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';
// Composition of existing scientific operations; no independent analysis engine.
const id: ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$'};
const object=(properties: Readonly<Record<string,ArgumentSchema>>): ToolInputSchema=>({type:'object',additionalProperties:false,properties});
const make=(name: string,description: string,properties: Readonly<Record<string,ArgumentSchema>>,required: readonly string[]): ToolDefinition=>({name,description,inputSchema:{...object({...properties,request_id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',description:'Save before submission; query image_result with the same ID after a timeout. Never automatically resubmit an unknown operation.'}}),required:[...required,'request_id']}});
const index: ArgumentSchema={type:'integer',minimum:0,maximum:7};
export const domainTools: ToolDefinition[]=[
 make('image_feature_field','Build a versioned sparse structural feature field from a saved spatial atlas, R2 joint observations or local signature comparison; no FFT is recomputed. Variable local reciprocal families, geometric periods and projected direction relations retain source-pixel windows, calibration, quality/ambiguity masks and original measurements. A heatmap shows sampled windows only, never phase labels, dense interpolation or learned embeddings. image_export saves JSON/CSV/PNG with provenance.',{
  object_id:id,coordinate_domain:{type:'string',enum:['pixel','physical']},display_feature:{type:'string',enum:['family_count','shortest_period']},max_size:{type:'integer',minimum:256,maximum:1024},
 },['object_id','coordinate_domain','display_feature']),
 make('image_spatial_atlas','Observe 1..8 explicit half-open source-pixel ROIs on one real spatial frame using existing FFT batches, peaks and ordinary measurements. Returns saved source overview, ROI/FFT views and quantitative local observations. Previous atlas reuses unchanged spectra; measurement_overrides incorporate committed GUI corrections. These are window observations, not segmented material domains or phase/defect labels.',{
  object_id:id,rects:{type:'array',minItems:1,maxItems:8,items:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}}},
  window:{type:'string',enum:['none','hann']},subtract_mean:{type:'boolean'},max_size:{type:'integer',minimum:32,maximum:1024},max_peaks:{type:'integer',minimum:1,maximum:16},
  peak_options:object({min_separation_bins:{type:'integer',minimum:1,maximum:32},exclude_dc_radius_bins:{type:'integer',minimum:0,maximum:64},threshold_rel:{type:'number',exclusiveMinimum:0,maximum:1},refinement:{type:'string',enum:['none','quadratic']}}),previous_atlas_id:id,
  measurement_overrides:{type:'array',minItems:1,maxItems:8,items:{...object({region_index:index,measurement_object_ids:{type:'array',minItems:1,maxItems:16,items:id}}),required:['region_index','measurement_object_ids']}},
 },['object_id','rects']),
 make('image_local_signature_compare','Compare saved spatial-atlas or R2 joint-observation reflection vectors for explicit in-plane rotation hypotheses. Uses signed calibration before rotation in physical mode; pixel mode describes image-coordinate geometry only. Fixed scale, no reflection/mirror/strain fit or phase identification. Keeps all hypotheses, residuals, unmatched vectors, insufficient/ambiguous/incomplete evidence; results are descriptive comparisons, never independent validation.',{
  object_id:id,reference_index:index,target_indices:{type:'array',minItems:1,maxItems:7,items:index},angles_degrees:{type:'array',minItems:1,maxItems:64,items:{type:'number',minimum:-180,maximum:180}},coordinate_domain:{type:'string',enum:['pixel','physical']},tolerance:{type:'number',exclusiveMinimum:0,description:'Explicit distance tolerance in cycles/pixel for pixel mode or cycles/nm for physical mode; not uncertainty or a fitted scale.'},
 },['object_id','reference_index','angles_degrees','coordinate_domain','tolerance']),
];
export const domainActions={image_spatial_atlas:'spatial_atlas',image_local_signature_compare:'local_signature_compare',image_feature_field:'feature_field'};
export const domainRecipes=Object.fromEntries(domainTools.map((tool): readonly [string,CompositionRecipe]=>[tool.name,{
 inputs:['Immutable frame/atlas/joint-evidence references with authoritative source/array/calibration hashes','Explicit ROI or finite rotation hypotheses and tolerance; pre-saved request identity'],
 outputs:['Immutable local reflection evidence and descriptive comparison; saved GUI views and numeric CSV/JSON','Unchanged source arrays and FFT identities; original-request recovery'],
 kind:'bounded-scientific-composition-write',
 gates:['Existing image-provider journal/dependency hashes remain authoritative','Physical comparison requires valid sourced signed XY calibration; no inferred units or material identity','A shared FFT conjugate pair or neighboring frame is not independent validation'],
 budgets:['1..8 ROIs; aggregate FFT <=4194304 pixels; <=16 peaks per ROI; <=64 explicit rotation hypotheses','No unknown-operation replay; partial child receipts remain queryable'],
}]));
