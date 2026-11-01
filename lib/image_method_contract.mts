import type {ArgumentSchema} from './runtime/schema.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';
const id:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$'};
const text:ArgumentSchema={type:'string',minLength:1,maxLength:2000};
const point:ArgumentSchema={type:'array',minItems:2,maxItems:2,items:{type:'number'}};
const circuit:ArgumentSchema={type:'object',additionalProperties:false,required:['rect','orientation'],properties:{
  loop_id:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,39}$'},
  rect:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}},
  orientation:{type:'string',enum:['positive_image_xy','negative_image_xy']},
}};
const information:ArgumentSchema={type:'object',additionalProperties:false,properties:{
  goal:{type:'string',enum:['projected_topology']},followup_basis:text,model_assumption_text:text,
  followup_g_vectors:{type:'array',minItems:2,maxItems:2,items:point},
  loops:{type:'array',minItems:2,maxItems:8,items:circuit},
}};
const write=(name:string,description:string,properties:Record<string,ArgumentSchema>,required:string[]):ToolDefinition=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties:{...properties,request_id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',description:'Save before submission; query image_result after cancellation/timeout. method_step requires the exact proposed next_request_id; unknown work is not replayed.'}},required:[...required,'request_id']}});
export const methodTools=[
  write('image_method_plan','Start a finite cross-method budget from 1..3 saved fixed_g GPA records. First scope: review wrapped phase/amplitude diagnostics, propose one sourced GPA reflection follow-up, switch to conditional topology circuits, request missing model/circuits, or stop. No source FFT/model call/automatic defect identification. Returns explicit actions, reasons, prerequisites, costs and deterministic step request ID. Existing domain/twin and other methods remain directly callable; they are not auto-routed by this increment.',{object_ids:{type:'array',minItems:1,maxItems:3,items:id},budget:{type:'object',additionalProperties:false,required:['method_calls','fft_pixels','gpa_band_pixels','topology_path_samples'],properties:{method_calls:{type:'integer',minimum:0,maximum:8},fft_pixels:{type:'integer',enum:[0]},gpa_band_pixels:{type:'integer',minimum:0,maximum:4194304},topology_path_samples:{type:'integer',minimum:0,maximum:131072}}},information:{...information,required:['goal']}},['object_ids','budget','information']),
  write('image_method_next','Reassess a saved cross-method plan/step using all eight scoped journal slots, including failed and unknown attempts. Optionally revise explicit information without resetting the original budget. Old proposals remain historical; changed attempt snapshots cannot execute. Unknown work blocks new science and exposes original query IDs. No automatic method execution or FFT.',{object_id:id,information_patch:information,user_stop:{type:'boolean'}},['object_id']),
  write('image_method_step','Execute ONE explicitly selected saved method action under its immutable budget root, recording the Agent selection reason. request_id MUST be the plan next_request_id; exclusive original journal creation prevents client budget forks. Child identity and full reservation are fsynced BEFORE invoking existing image_gpa/image_topology. Failed/unknown work remains charged; no automatic replay. A completed step record is not proof its child science succeeded: inspect child_receipt.',{object_id:id,root_plan_id:id,action_id:id,selection_reason:text},['object_id','root_plan_id','action_id','selection_reason']),
];
export const methodActions={image_method_plan:'method_plan',image_method_next:'method_next',image_method_step:'method_step'};
export const methodRecipes=Object.fromEntries(methodTools.map(tool=>[tool.name,{
  inputs:['Saved GPA/grid/calibration references, sourced phase-model/circuit information','Immutable budget root and pre-saved original operation identity'],
  outputs:['Finite inspectable method candidates or one child receipt; all-attempt cost ledger and source-bound historical decisions','Conditional projected evidence, never unique material defect/3D confirmation'],
  kind:'bounded-cross-method-decision-write',gates:['Existing GPA/topology kernels and provider journals; no model invocation or fallback','Same fixed_g FFT/grid/metric/mask; every failed/unknown slot retained and deterministic successor identity required','Finite-resolution reflection diversity and raw wrapped phase diagnostics; smooth strain hotspots do not identify topology'],
  budgets:['At most8 submitted step slots; <=16 proposal revisions; first scope creates no source FFT','Explicit total GPA band-pixel and topology path-sample reservations, elapsed monotonic times; unknown cost not zero'],
} satisfies CompositionRecipe]));
