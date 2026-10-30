import type {ArgumentSchema} from './runtime/schema.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';
const id:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$'};
const label:ArgumentSchema={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,39}$'};
export const topologyTools:ToolDefinition[]=[{
 name:'image_topology',
 description:'Inspect projected topology on saved wrapped GPA phases/amplitudes, never smooth strain hotspots. Supply1..3 fixed_g GPA records on the exact same FFT/grid/metric/mask and2..8 explicit rectangular circuits. Version2 returns oriented winding and geometry-scoped strict-nesting loop_groups with separate validity, consistency and conditional G*b=-w projected closure; unrelated circuits are not forced to agree and multiple groups have no global fitted b; >=3 non-harmonic reflection directions enable redundant checks. Zero winding is not proof of no defect; no unique3D Burgers vector or confirmed material dislocation. No FFT or unwrapping is rerun. Existing image_info/result/export retain and recover evidence.',
 inputSchema:{type:'object',additionalProperties:false,properties:{
  object_ids:{type:'array',minItems:1,maxItems:3,items:id},
  loops:{type:'array',minItems:2,maxItems:8,items:{type:'object',additionalProperties:false,properties:{loop_id:label,rect:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0},description:'LOCAL spatial FFT-grid half-open XYXY. Circuit visits perimeter pixel CENTERS x0..x1-1,y0..y1-1; each axis>=3. Not PNG/frequency coordinates.'},orientation:{type:'string',enum:['positive_image_xy','negative_image_xy'],description:'Positive traverses east,south,west,north: positive XY area, clockwise on a downward-Y image. Reversing flips raw winding; inversion normalizes to positive_image_xy.'}},required:['rect','orientation']}},
  model_assumption_text:{type:'string',minLength:1,maxLength:2000,description:'Actual source/working assumption for the simple complete projected-dislocation model. A numerical match never confirms that material model.'},
  amplitude_floor_relative:{type:'number',minimum:.01,maximum:.5,description:'Path amplitude floor relative to each band global maximum inside the edge guard, not a calibrated SNR.'},
  burgers_candidates:{type:'array',minItems:1,maxItems:16,items:{type:'object',additionalProperties:false,properties:{label,b_pixel_xy:{type:'array',minItems:2,maxItems:2,items:{type:'number'},description:'Projected closure in the supplied reference/image pixel basis for the positive_image_xy circuit; not an assumed3D crystal index.'}},required:['label','b_pixel_xy']}},
  previous_topology_id:id,max_size:{type:'integer',minimum:256,maximum:1024},
  request_id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',description:'Save before submission. After cancellation/timeout query image_result with this original ID; never replay unknown scientific work.'},
 },required:['object_ids','loops','model_assumption_text','request_id']},
}];
export const topologyActions={image_topology:'topology'};
export const topologyRecipes:Readonly<Record<string,CompositionRecipe>>={image_topology:{
 inputs:['Immutable saved fixed_g GPA bands on one exact FFT/source/grid/calibration/mask','Explicit oriented local spatial circuits and sourced model assumption; optional pixel-basis closure candidates'],
 outputs:['Saved per-circuit/reflection winding and path samples, amplitude/edge/phase-step validity and redundant projected-closure checks','Conditional hypothesized evidence, NPY/JSON/CSV/PNG, original-request recovery; no source FFT or smooth-field differentiation'],
 kind:'bounded-projected-topology-evidence-write',
 gates:['Provider journals and transitive source manifests/payload hashes remain authoritative','Raw wrapped geometric phase only; enclosed core can be masked but every path sample must be usable','>=3 non-harmonic directions and nested loops provide consistency, never unique3D b, core count or confirmed material defect'],
 budgets:['1..3 GPA records,2..6 unique bands,2..8 circuits,total<=16384 path samples,<=8 historical revisions','64..512 saved spatial grid,display<=1024px; no new FFT/unwrapping; original image_result recovery'],
}};
