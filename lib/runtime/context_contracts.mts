// Scoped, reference-only context contracts. Scientific arrays remain provider-owned.
import type {ANALYSIS_ROLES} from './analysis_context.mjs';
export type AnalysisRole = (typeof ANALYSIS_ROLES)[number];
declare const contextIdentity: unique symbol;
export type AnalysisId = string & {readonly [contextIdentity]: 'analysis'};
export type ContextRequestId = string & {readonly [contextIdentity]: 'context-original-request'};
export type ScopedObjectId = string & {readonly [contextIdentity]: 'provider-scoped-object'};
export interface ScopedReferenceInput {provider: string; workspace: string; session: string; objectId: string;}
export interface ScopedReference extends ScopedReferenceInput {objectId: ScopedObjectId;}
export interface ReferenceProof {manifestHash: string; kind: string; roles: AnalysisRole[]; scientific?: unknown;}
export interface ContextEntry {ref: ScopedReference; proof: ReferenceProof; dependsOn: Partial<Record<AnalysisRole, string>>; status: 'active' | 'stale'; staleBecause: AnalysisRole[];}
export type ContextSlots = Partial<Record<AnalysisRole, ContextEntry | ContextEntry[] | null>>;
export interface ContextFingerprintEntry {ref: ScopedReferenceInput;proof: unknown;}
export type ContextFingerprintSlots = Partial<Record<AnalysisRole, ContextFingerprintEntry | readonly ContextFingerprintEntry[] | null>>;
export type ContextSelectionView = Partial<Record<AnalysisRole, unknown>>;
export type ContextFingerprints = Record<AnalysisRole, string | null>;
export interface ContextSelectionInput {ref: ScopedReferenceInput; dependsOn?: Partial<Record<AnalysisRole, string>>;}
export type ContextChanges = Partial<{[Role in AnalysisRole]: Role extends 'points' | 'measurements' ? readonly ContextSelectionInput[] | null : ContextSelectionInput | null}>;
export interface StoredContextValue {contextVersion: 1; reason: string; slots: ContextSlots; changedSlots: AnalysisRole[]; requestId?: ContextRequestId; mutationSha256?: string;}
export interface ContextSnapshot extends StoredContextValue {analysisId: AnalysisId; revision: number; revisionHash: string; parentHash: string | null; fingerprints: ContextFingerprints;}
export interface ContextRevisionRecord<Value = unknown> {schemaVersion: 1; analysisId: AnalysisId; revision: number; parentHash: string | null; hash: string; value: Value;}
export interface ContextProposalRecord<Value = unknown> {schemaVersion: 1; analysisId: AnalysisId; proposalId: string; hash: string; value: Value;}
export type ContextRequestRecord = {kind: 'revision'; record: ContextRevisionRecord} | {kind: 'proposal'; record: ContextProposalRecord};
export type ContextCASResult = {committed: true; record: ContextRevisionRecord} | {committed: false; record: ContextRevisionRecord | null};
export interface ContextCASInput {analysisId: string; expectedRevision: number; parentHash: string | null; value: unknown;}
export type Awaitable<T> = T | PromiseLike<T>;
export interface ContextStorePort {
  read(analysisId: string, atRevision?: number): Awaitable<ContextRevisionRecord>;
  compareAndSet(input: ContextCASInput): Awaitable<ContextCASResult>;
  saveProposal(analysisId: string, value: unknown): Awaitable<ContextProposalRecord>;
  readProposal(analysisId: string, proposalId: string): Awaitable<ContextProposalRecord>;
  findRequest(analysisId: string, requestId: string): Awaitable<ContextRequestRecord | null>;
}
export interface BindingValidation {slot: AnalysisRole; entry: ContextEntry; slots: ContextSlots; changedSlots?: AnalysisRole[]; fingerprints?: ContextFingerprints;}
export type ResolveReference = (reference: ScopedReference) => Awaitable<unknown>;
export type ValidateBindings = (binding: BindingValidation) => Awaitable<unknown>;
export interface AnalysisContextOptions {store: ContextStorePort; resolveReference: ResolveReference; validateBindings: ValidateBindings;}
export type ContextMutationResult = {state: 'advanced'; context: ContextSnapshot} | {state: 'historical'; context: ContextSnapshot; proposal: ContextProposalRecord};
export interface CreateContextOptions {analysisId?: string; initialRefs?: ContextChanges; reason?: string; requestId?: string;}
export interface CommitContextOptions {analysisId: string; expectedRevision: number; changes: ContextChanges; reason: string; requestId?: string;}
