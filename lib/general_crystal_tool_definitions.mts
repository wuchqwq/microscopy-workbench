// General candidate evidence is distinct from the frozen F3b twin-law contract.
import type {ArgumentSchema,ToolInputSchema} from './runtime/schema.mjs';
const id:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$',minLength:32,maxLength:32};
const text:ArgumentSchema={type:'string',minLength:1,maxLength:2000};
const domain:ArgumentSchema={type:'object',additionalProperties:false,
 required:['field_object_id','rect_xyxy','current_image_object_id'],properties:{
  field_object_id:id,current_image_object_id:id,
  rect_xyxy:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}},
  measurement_object_ids:{type:'array',minItems:1,maxItems:16,items:id}}};
const registration:ArgumentSchema={type:'object',additionalProperties:false,
 required:['rotation_deg','scale','translation_inv_angstrom','flip_y','basis'],properties:{
  rotation_deg:{type:'number',minimum:-360,maximum:360},scale:{type:'number',enum:[1]},
  translation_inv_angstrom:{type:'array',minItems:2,maxItems:2,items:{type:'number',enum:[0]}},
  flip_y:{type:'boolean'},basis:text}};
export const generalCrystalTools=[{
 name:'structure_general_compare',
 description:'Compare two adjacent saved ROI observations against1..3 explicit pairs of actual ASE/diffsims candidate structures and orientations. No FCC/diamond motif prerequisite: ordered full-occupancy supported cells may differ between sides. Uses one shared experimental registration, fixed independent scale1 and DC translation0. Qualifies source/sites/cell/occupancy/symmetry status and existing simulation certificate separately; unknown group is not verified symmetry. Requires existing spatial-field/atlas/domain-map observations with exact source/frame/ROI/calibration and committed measurements, plus saved structure_orient simulations. Returns conditional compatible/incompatible/insufficient geometric evidence, full child comparisons and unmatched reflections. Never identifies a unique phase, twin, CSL, intensity model or3D relationship; no search or new FFT/simulation. Save request ID before dispatch and recover with structure_result.',
 inputSchema:{type:'object',additionalProperties:false,required:['domains','current_spatial_image_object_id','registration','experimental_kind','max_residual_inv_angstrom','candidates','request_id'],properties:{
  domains:{type:'array',minItems:2,maxItems:2,items:domain},current_spatial_image_object_id:id,registration,
  experimental_kind:{type:'string',enum:['real_space_fft']},
  max_residual_inv_angstrom:{type:'number',minimum:1e-12,maximum:1},
  candidates:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,
   required:['label','simulation_a_object_id','simulation_b_object_id','basis'],properties:{
    label:{type:'string',minLength:1,maxLength:100},simulation_a_object_id:id,simulation_b_object_id:id,basis:text}}},
  previous_evidence_id:id,revision_note:text,
  request_id:{type:'string',pattern:'^[A-Za-z0-9_-]+$',minLength:1,maxLength:64,
   description:'Save before submission; query structure_result using this original ID after timeout/cancellation. Unknown child operations are not automatically replayed.'},
 }} as ToolInputSchema & {oneOf?:ToolInputSchema['oneOf']},
}];
