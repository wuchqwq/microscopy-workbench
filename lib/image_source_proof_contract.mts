import type {ArgumentSchema} from './runtime/schema.mjs';
import type {ToolDefinition} from './runtime/contracts.mjs';
import type {CompositionRecipe} from './image_provider_contracts.mjs';
const id:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$'};
const hash:ArgumentSchema={type:'string',pattern:'^[a-f0-9]{64}$'};
const request:ArgumentSchema={type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',description:'Save this ID before submitting. After an unknown response query image_result with the original ID; never automatically replay.'};
const tool=(name:string,description:string,properties:Record<string,ArgumentSchema>,required:string[]):ToolDefinition=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required}});
export const sourceProofTools:ToolDefinition[]=[
 tool('image_source_proof','Explicitly append a current source verification receipt using existing immutable provider objects and journals. No FFT, preview, measurement or source edit. Every required ancestor/payload is checked again; a hash is not a digital signature. Old unavailable GUI input remains unavailable and retrospective proof never becomes strict pre-execution evidence.',{object_id:id,purpose:{type:'string',enum:['saved_source','fft_input']},input_relative_path:{type:'string',minLength:1,maxLength:512},input_sha256:hash,parent_proof_id:id,request_id:request},['object_id','purpose','request_id']),
 tool('image_source_proof_info','Read and freshly verify one exact provider proof, its input/dependencies and bounded revocation status. No new proof, adoption, preview or FFT. Return verified/revoked/unavailable independently of the original execution and qualification.',{proof_object_id:id,expected_sha256:hash},['proof_object_id']),
 tool('image_source_proof_revoke','Append an immutable withdrawal event for one exact existing proof. Original proof, arrays, measurements, requests and savepoints remain unchanged. Query image_result using the original request ID after a lost response.',{proof_object_id:id,reason:{type:'string',minLength:1,maxLength:2000},request_id:request},['proof_object_id','reason','request_id']),
];
export const sourceProofActions={image_source_proof:'source_proof',image_source_proof_info:'source_proof_info',image_source_proof_revoke:'source_proof_revoke'};
export const sourceProofRecipes:Readonly<Record<string,CompositionRecipe>>=Object.fromEntries(sourceProofTools.map(t=>[t.name,{
 inputs:['Exact existing immutable provider object/proof; fft_input also requires the original GUI sidecar path and SHA256'],outputs:['Versioned source verification receipt/status; original execution and qualification remain separate'],
 kind:t.name==='image_source_proof_info'?'inspect':'source-proof-metadata-write',...(t.name==='image_source_proof_info'?{requestId:'none' as const}:{}),
 gates:['Original provider creator/manifest/payload verification and exact source/frame/grid/calibration/input binding','Complete bounded DAG and fresh verification; unknown/corrupt/withdrawn/unsupported evidence abstains','Existing provider request admission and original-ID recovery; no scientific recomputation or source mutation'],
 budgets:['2048 unique objects /64 MiB metadata including final verification; existing payload/NPY bounds','Complete bounded withdrawal-state scan; no cross-request proof cache or secondary database'],
} satisfies CompositionRecipe]));
