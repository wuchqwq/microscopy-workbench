import type {ArgumentSchema} from './runtime/schema.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';

const id:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$'};
const text:ArgumentSchema={type:'string',minLength:1,maxLength:2000};
const observations:ArgumentSchema={type:'array',minItems:0,maxItems:8,items:text};
const rect:ArgumentSchema={type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0}};
const displaySize:ArgumentSchema={type:'integer',minimum:32,maximum:1024};
const region:ArgumentSchema={type:'object',additionalProperties:false,required:['rect','reason'],properties:{
  rect,reason:text,candidate_explanations:observations,unresolved:observations,
}};
const write=(name:string,description:string,properties:Record<string,ArgumentSchema>,required:string[]):ToolDefinition=>({
  name,description,inputSchema:{type:'object',additionalProperties:false,properties:{...properties,
    request_id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',description:'Save before submission; recover through image_result using this original ID after cancellation or timeout. Unknown operations are never automatically replayed.'},
  },required:[...required,'request_id']},
});

export const discoveryTools:ToolDefinition[]=[
  write('image_discovery','Start image-first observations on an exact real-space scalar frame, without first creating a full structure field. entry=feature proposes at most4 bounded ROIs from lightweight original-array spatial features; these scores are heuristic priorities, not physical defects or calibrated probabilities. entry=manual requires1..4 explicit source-pixel regions with researcher reasons; records explanations and unknowns as supplied observations. Retains source/frame/grid/calibration and previous revision references, an overview and ready existing-tool actions. Does not compute FFT/GPA, identify a phase, or invoke a model.',{
    object_id:id,
    entry:{type:'string',enum:['feature','manual'],description:'Default feature. manual requires regions; the worker validates this conditional requirement and exact source bounds.'},
    window_sizes:{type:'array',minItems:1,maxItems:2,items:{type:'integer',minimum:32,maximum:256},description:'Feature-only window edge lengths in original source pixels; default[64]. Manual attention uses explicit rectangles. Window scale is not physical resolution.'},
    max_candidates:{type:'integer',minimum:1,maximum:4},
    regions:{type:'array',minItems:1,maxItems:4,items:region},
    previous_discovery_id:id,
    max_size:displaySize,
  },['object_id']),
  write('image_discovery_review','Bind saved numerical evidence to one exact saved image-first candidate. The worker checks source/frame/ROI/calibration identities, original journals and payloads; region/peak numbering and display labels are not identity. Saves observations, candidate explanations and unresolved information without promoting them to confirmed dislocations, twins or phases. Existing FFT/peaks/measurement/GPA tools perform science explicitly; an applicable saved GPA can hand off to the existing F4 method-plan tools. This review creates no new FFT, GPA, numerical measurement or hidden model call.',{
    object_id:id,candidate_id:id,
    evidence_ids:{type:'array',minItems:1,maxItems:8,items:id},
    observation_text:text,
    candidate_explanations:observations,
    unresolved:observations,
    previous_review_id:id,
  },['object_id','candidate_id','evidence_ids','observation_text']),
];

export const discoveryActions={image_discovery:'discovery',image_discovery_review:'discovery_review'};
export const discoveryRecipes:Readonly<Record<string,CompositionRecipe>>=Object.fromEntries(discoveryTools.map(tool=>[tool.name,{
  inputs:['Exact immutable real-space scientific frame/grid/calibration reference, not PNG pixels','Bounded spatial-feature settings or explicit researcher source-pixel ROIs and reasons','For review: source-bound candidate and immutable saved numerical evidence references'],
  outputs:['Immutable image-first observation/revision with coordinate anchors, sourced reasons, heuristic scores and unknowns','Existing-tool/Panel references for explicit scientific verification and optional applicable F4 handoff; no confirmed material conclusion'],
  kind:'image-first-observation-record-write',
  gates:['Existing image provider, immutable object/journal/payload admission and original request recovery','Real-space finite scalar data only; manual observations and numerical validation retain separate provenance','Review must bind exact source/frame/ROI/calibration; no ID-order inference, hidden model, alternate backend or physical label inference'],
  budgets:['Admitted bounded plane; <=2 feature scales32..256, <=512 sampled windows and <=4 returned candidates','Manual regions<=4; review evidence<=8; candidate explanations/unknowns<=8 bounded texts; preview<=1024','No FFT/GPA is dispatched by discovery/review; existing scientific tools retain their own explicit requests and budgets'],
} satisfies CompositionRecipe]));
