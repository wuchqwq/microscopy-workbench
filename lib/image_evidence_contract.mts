import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';

export const compactEvidenceTools=new Set(['image_spatial_field','image_domain_map','image_field_extend','image_analysis_candidates','image_info','image_result']);
export const withCompactEvidence=(definition: ToolDefinition): ToolDefinition=>compactEvidenceTools.has(definition.name)?{
  ...definition,inputSchema:{...definition.inputSchema,properties:{...definition.inputSchema.properties,
    response_detail:{type:'string',enum:['full','compact'],description:'Presentation only; default full preserves the complete original record and inline PNG. Compact returns an explicitly tagged text-only bounded projection, exact manifest hash, image_evidence detail references and a readonly preview_ref for requesting the image on demand. It does not change the scientific request, original ID or journal.'}}}
}:definition;
export const evidenceTools: ToolDefinition[]=[{name:'image_evidence',description:'Read a bounded, explicitly tagged text-only projection of one fully validated immutable object. Bind manifest_sha256 from a compact result; summary or exact collection rows are available. No arbitrary file paths, scientific work or new request record. Original full evidence and inline PNG remain available through image_info/image_result or the returned readonly preview_ref.',inputSchema:{type:'object',additionalProperties:false,required:['object_id','manifest_sha256','section'],properties:{
  object_id:{type:'string',pattern:'^[a-f0-9]{32}$'},manifest_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
  section:{type:'string',enum:['summary','samples','actions','neighbors','domains','boundary_bands','increment_history']},
  offset:{type:'integer',minimum:0,maximum:4096},limit:{type:'integer',minimum:1,maximum:8}
}}}];
export const evidenceActions={image_evidence:'evidence'};
export const evidenceRecipes: Readonly<Record<string,CompositionRecipe>>={image_evidence:{
  inputs:['Exact immutable object identity and manifest SHA-256','Allowlisted evidence section and bounded page'],
  outputs:['Explicit summary/detail projection, original request reference and unchanged scientific records'],kind:'inspect',requestId:'none',
  gates:['Full provider object/dependency/journal/payload validation before projection; no integrity bypass','Digest binds exact manifest bytes; projection is not an authoritative record'],
  budgets:['1..8 exact rows/page; <=128 KiB or explicit refusal; no arbitrary path or JSON-pointer reads'],
}};
