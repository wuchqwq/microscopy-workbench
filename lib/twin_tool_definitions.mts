// F3b registration only. All numerical work stays in the scientific worker.
import type {ArgumentSchema,ToolInputSchema} from './runtime/schema.mjs';

const id:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$',minLength:32,maxLength:32};
const request:ArgumentSchema={type:'string',pattern:'^[A-Za-z0-9_-]+$',minLength:1,maxLength:64};
const text:ArgumentSchema={type:'string',minLength:1,maxLength:2000};
const registration:ArgumentSchema={type:'object',additionalProperties:false,
  required:['rotation_deg','scale','translation_inv_angstrom','flip_y','basis'],properties:{
    rotation_deg:{type:'number',minimum:-360,maximum:360},scale:{type:'number',enum:[1]},
    translation_inv_angstrom:{type:'array',minItems:2,maxItems:2,items:{type:'number',enum:[0]}},
    flip_y:{type:'boolean'},basis:text}};
const domain:ArgumentSchema={type:'object',additionalProperties:false,
  required:['field_object_id','rect_xyxy','current_image_object_id'],properties:{
    field_object_id:id,current_image_object_id:id,
    rect_xyxy:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}},
    measurement_object_ids:{type:'array',minItems:1,maxItems:16,items:id}}};
const write=(name:string,description:string,properties:Record<string,ArgumentSchema>,required:string[])=>({
  name,description,inputSchema:{type:'object',additionalProperties:false,
    properties:{...properties,request_id:request},required:[...required,'request_id']} as ToolInputSchema & {oneOf?:ToolInputSchema['oneOf']}});

export const twinTools=[
  {name:'structure_twin_evidence',description:'Read a bounded page of the committed F3b numerical evidence, including full unmatched simulated reflections. Read-only within the configured structure workspace: validates original journal and all saved file hashes; no file paths, recomputation or implicit current-state update. Historical snapshots remain historical.',
    inputSchema:{type:'object',additionalProperties:false,properties:{object_id:id,
      comparison:{type:'string',enum:['parent_domain','twin_domain','untwinned_control']},
      section:{type:'string',enum:['observations','matched','unmatched_experimental','unmatched_simulated','ambiguity','pairwise_angles']},
      offset:{type:'integer',minimum:0,maximum:100000},limit:{type:'integer',minimum:1,maximum:128}},
      required:['object_id','comparison','section','offset','limit']} as ToolInputSchema & {oneOf?:ToolInputSchema['oneOf']}},
  write('structure_twin_orient',
    'Save one hypothesized cubic Sigma3 {111} twin orientation from a saved parent orientation. First scope: full-occupancy single-species conventional FCC4 or diamond8 motifs only; no primitive-cell conversion or phase identification. Returns the proper active source-to-lab matrix U_parent @ R_111(60deg), plane normal and symmetry equivalence. Reuse its orientation_id in existing structure_view/structure_simulate; simulate parent and twin separately on the SAME original structure and parameters. Save request_id and recover via structure_result.',
    {object_id:id,orientation_id:id,plane_hkl:{type:'array',minItems:3,maxItems:3,items:{type:'integer',enum:[-1,1]}},candidate_basis:text},
    ['object_id','orientation_id','plane_hkl','candidate_basis']),
  write('structure_twin_compare',
    'Test a saved Sigma3 candidate against TWO adjacent saved spatial-field ROI observations and their current FFT measurements. object_id is the structure_twin_orient result. Supply actual saved parent/twin diffsims simulations with identical settings. Reuses existing physical/DC matching with ONE explicit registration, fixed scale1 and translation0, plus an untwinned control. Optional same-source saved spatial line constrains an explicitly sourced edge-on interface projection. Returns compatible/incompatible/insufficient_evidence separately for projected reflection relation and interface; never unique 3D twin/coherence or phase confirmation. Missing scale remains insufficient, contradictory/stale sources are refused. Immutable revisions link via previous_twin_comparison_id and revision_note. No new FFT, automatic refit, mirror search, or hidden backend.',
    {object_id:id,parent_simulation_object_id:id,twin_simulation_object_id:id,
      current_spatial_image_object_id:id,domains:{type:'array',minItems:2,maxItems:2,items:domain},
      registration,max_residual_inv_angstrom:{type:'number',minimum:1e-12,maximum:1},
      angular_tolerance_deg:{type:'number',minimum:.01,maximum:5},
      interface_measurement_object_id:id,interface_projection_basis:text,
      previous_twin_comparison_id:id,revision_note:text},
    ['object_id','parent_simulation_object_id','twin_simulation_object_id','current_spatial_image_object_id','domains','registration','max_residual_inv_angstrom','angular_tolerance_deg']),
];
