import {AnalysisContext,contextFingerprints,requiredContextDependencies} from '../../lib/runtime/analysis_context.mjs';
import {FileContextStore} from '../../lib/runtime/file_context_store.mjs';
import type {AnalysisId,ContextRequestId,ScopedObjectId,ScopedReference,ScopedReferenceInput,ContextChanges,ContextMutationResult,ContextStorePort,ContextCASResult,ContextEntry,ReferenceProof} from '../../lib/runtime/context_contracts.mjs';

declare const analysis: AnalysisId;
declare const request: ContextRequestId;
declare const object: ScopedObjectId;
// @ts-expect-error provider objects are not analysis identities
const wrongAnalysis: AnalysisId=object;
// @ts-expect-error original context mutation identity is not an object identity
const wrongObject: ScopedObjectId=request;
// @ts-expect-error analysis identity cannot silently become an original request identity
const wrongRequest: ContextRequestId=analysis;
const raw: ScopedReferenceInput={provider:'fixture',workspace:'fixture-workspace',session:'fixture-journal',objectId:'raw-json-object'};
// @ts-expect-error raw JSON references are not claimed to have passed core scope checks
const notValidated: ScopedReference=raw;
const changes: ContextChanges={experiment:{ref:raw},points:[{ref:raw}],measurements:null};
// @ts-expect-error point selections are an explicit nonempty runtime-checked array, never a scalar slot
const scalarPoints: ContextChanges={points:{ref:raw}};
// @ts-expect-error single FFT selection is not a list
const listFFT: ContextChanges={fft:[{ref:raw}]};

declare const store: ContextStorePort;
const core=new AnalysisContext({store,resolveReference:reference=>({manifestHash:'provider-attested-at-runtime',kind:'fixture',roles:['fft'],scientific:{originalObject:reference.objectId}}),validateBindings:({entry,slots})=>{void [entry.status,slots];}});
void core.create({analysisId:'raw-public-id',initialRefs:changes,requestId:'saved-original-request'});
void core.commit({analysisId:'raw-public-id',expectedRevision:1,changes,reason:'Explicit revision'});
// @ts-expect-error a CAS revision is numeric, not a displayed string
void core.commit({analysisId:'raw-public-id',expectedRevision:'1',changes,reason:'Explicit revision'});
// @ts-expect-error storage is an explicit required port
new AnalysisContext({resolveReference:()=>null,validateBindings:()=>{}});
// @ts-expect-error store creation requires an explicit directory at the TS boundary
new FileContextStore();

declare const result: ContextMutationResult;
if(result.state==='advanced'){
  const accepted: AnalysisId=result.context.analysisId;
  // @ts-expect-error a successful promotion does not carry a historical proposal
  result.proposal;
  void accepted;
}else{void result.proposal.proposalId;}
declare const cas: ContextCASResult;
if(!cas.committed){
  // @ts-expect-error failed CAS can observe no current revision and cannot be blindly treated as committed
  cas.record.revision;
}
declare const entry: ContextEntry;
// @ts-expect-error dependent role status cannot be promoted by assigning a new invented status
entry.status='verified';
const storedProof: ReferenceProof={manifestHash:'unknown',kind:'historical-fixture',roles:['fft'],scientific:3};
// Stored proof scientific metadata remains unknown; old record checks never qualified it.
// @ts-expect-error unknown scientific metadata is not a fresh validated provider grid
storedProof.scientific.grid;
contextFingerprints({fft:entry});requiredContextDependencies('fft',{fft:entry});
void [wrongAnalysis,wrongObject,wrongRequest,notValidated,scalarPoints,listFFT,object,request];
