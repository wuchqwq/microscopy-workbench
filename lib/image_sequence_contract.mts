import type {ArgumentSchema,ToolInputSchema} from './runtime/schema.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';
// Bounded cross-frame composition; authoritative science stays in the image worker.
const id: ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$'};
const requestId: ArgumentSchema={type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$'};
const source: ArgumentSchema={type:'string',minLength:1,maxLength:2000};
const object=(properties: Readonly<Record<string,ArgumentSchema>>): ToolInputSchema=>({type:'object',additionalProperties:false,properties});
const make=(name: string,description: string,properties: Readonly<Record<string,ArgumentSchema>>,required: readonly string[]): ToolDefinition=>({name,description,inputSchema:{...object({...properties,request_id:requestId}),required:[...required,'request_id']}});
const frame: ArgumentSchema={...object({object_id:id,label:{type:'string',minLength:1,maxLength:120}}),required:['object_id']};
const peakOptions: ArgumentSchema=object({min_separation_bins:{type:'integer',minimum:1,maximum:32},exclude_dc_radius_bins:{type:'integer',minimum:0,maximum:64},threshold_rel:{type:'number',exclusiveMinimum:0,maximum:1},refinement:{type:'string',enum:['none','quadratic']}});
export const sequenceTools: ToolDefinition[]=[
  make('image_sequence_create','Save an explicit ordered sequence of 2..8 existing real spatial frames and their source, array, calibration and grid identities. References only, no array copies. Axis meaning must be sourced; frame order/step does not establish physical depth or axial resolution. Read the immutable record using image_info and recover by original image_result request ID.',{
    frames:{type:'array',minItems:2,maxItems:8,items:frame},
    axis:{...object({meaning:{type:'string',enum:['time','reconstruction_depth','defocus','tilt','iteration','repeat','unknown']},source_text:source,step:{type:'number'},unit:{type:'string',minLength:1,maxLength:32}}),required:['meaning','source_text']},
  },['frames','axis']),
  make('image_region_correspondence','Relate one source-pixel half-open ROI to explicitly ordered sequence frames. Sourced identity/translation or bounded integer translation estimation only; no image warping. Same shape or numbering never establishes correspondence. Returns explicit ambiguity, mismatch, out-of-view or incompatible geometry without silently cropping. Pixel correspondence does not prove structural continuity.',{
    sequence_object_id:id,reference_index:{type:'integer',minimum:0,maximum:7},rect:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}},
    mode:{type:'string',enum:['identity','translation','estimate']},source_text:source,
    translations:{type:'array',minItems:1,maxItems:7,items:{...object({frame_index:{type:'integer',minimum:0,maximum:7},shift_xy:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:-4096,maximum:4096}}}),required:['frame_index','shift_xy']}},
    max_shift:{type:'integer',minimum:1,maximum:32},min_correlation:{type:'number',exclusiveMinimum:0,maximum:1},min_margin:{type:'number',exclusiveMinimum:0,maximum:1},
  },['sequence_object_id','reference_index','rect','mode']),
  make('image_joint_observations','Compose existing FFT batches, numerical peaks and ordinary measurements on verified corresponding ROIs. Match actual signed frequency vectors, never peak IDs/order. Retain unmatched/ambiguous evidence and GUI-openable original/ROI/FFT views. previous_observations_id reuses unchanged spectra; saved measurement_overrides incorporate explicit GUI corrections without reusing old detector anchors. No automatic phase/defect conclusions.',{
    correspondence_object_id:id,window:{type:'string',enum:['none','hann']},subtract_mean:{type:'boolean'},peak_options:peakOptions,max_peaks:{type:'integer',minimum:1,maximum:16},
    frequency_tolerance_cycles_per_pixel:{type:'number',exclusiveMinimum:0,maximum:.25},previous_observations_id:id,
    measurement_overrides:{type:'array',minItems:1,maxItems:8,items:{...object({frame_index:{type:'integer',minimum:0,maximum:7},measurement_object_ids:{type:'array',minItems:1,maxItems:16,items:id}}),required:['frame_index','measurement_object_ids']}},
  },['correspondence_object_id']),
];
export const sequenceActions={image_sequence_create:'sequence_create',image_region_correspondence:'region_correspondence',image_joint_observations:'joint_observations'};
export const sequenceRecipes=Object.fromEntries(sequenceTools.map((tool): readonly [string,CompositionRecipe]=>[tool.name,{
  inputs:['Explicit immutable real-space frame/sequence/correspondence references','Sourced sequence meaning and coordinate mapping; pre-saved request ID'],
  outputs:['Immutable sequence/correspondence/joint-evidence object and original request receipts','Per-frame scientific source/grid/calibration and GUI-openable views; PNG is display only'],
  kind:'bounded-sequence-composition-write',
  gates:['Existing image provider journal, dependency and payload hashes remain authoritative','Correspondence requires declared grid evidence or bounded numerical estimation with ambiguity checks','No phase, physical depth, independent confidence samples or hidden resampling inferred'],
  budgets:['2..8 frames; bounded integer translation; aggregate FFT <=4194304 pixels; <=16 peaks per frame','Partial child receipts remain queryable; unknown operations are never replayed'],
}]));
