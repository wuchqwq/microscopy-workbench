import {createScientificContextBindings, sameScientificGrid} from '../../lib/analysis_context_bindings.mjs';
import type {ScientificProviderPort, ScientificProviders, ProviderReferenceProof} from '../../lib/analysis_context_bindings.mjs';
import type {ScopedReferenceInput, ReferenceProof, ContextEntry} from '../../lib/runtime/context_contracts.mjs';

const provider: ScientificProviderPort={workspace:'/public/workspace',requestScope:{provider:'external-image-workspace',workspace:'/public/workspace',session:'fixture'},
  call:async()=>({content:[{type:'text',text:'{}'}]})};
const providers: ScientificProviders={image:provider};
const bindings=createScientificContextBindings({providers});
const raw: ScopedReferenceInput={...provider.requestScope,objectId:'a'.repeat(32)};
const proof: Promise<ProviderReferenceProof>=bindings.resolveReference(raw);
// @ts-expect-error the core has not yet checked provider-reported kind/roles
const qualifiedProof: Promise<ReferenceProof>=proof;
void [proof,qualifiedProof];
sameScientificGrid({grid:'opaque fixture'},null);
// @ts-expect-error a provider adapter must return the MCP content shape, not raw JSON text
const rawProvider: ScientificProviderPort={...provider,call:()=>'{"object_id":"unverified"}'};
// @ts-expect-error raw scoped reference IDs are still strings, never a frame index
const wrongIdentity: ScopedReferenceInput={...raw,objectId:2};
declare const saved: ReferenceProof;
// @ts-expect-error scientific JSON keys are opaque; bindings do not claim a physical scale by declaration
const qualifiedScale: number=saved.scientific!.xyScale;
declare const checkedEntry: ContextEntry;
// @ts-expect-error only named AnalysisContext roles may be validated
bindings.validateBindings({slot:'identified_phase',entry:checkedEntry,slots:{}});
void [rawProvider,wrongIdentity,qualifiedScale];
