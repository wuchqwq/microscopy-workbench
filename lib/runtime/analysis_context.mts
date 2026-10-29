// Revision-aware references only. Scientific providers remain authoritative for
// arrays, calibration, calculations and original-operation journals.
import {createHash, randomUUID} from 'node:crypto';
export const ANALYSIS_ROLES = Object.freeze(['experiment', 'fft', 'display', 'calibration', 'center', 'points', 'measurements', 'reference', 'orientation', 'simulation', 'registration', 'comparison', 'sequence', 'correspondence', 'observations', 'atlas', 'domain_hypotheses', 'field'] as const);
import type {AnalysisId,AnalysisRole,ContextRequestId,ScopedReference,ReferenceProof,ContextEntry,ContextSlots,ContextFingerprints,ContextFingerprintSlots,ContextSelectionView,StoredContextValue,ContextSnapshot,ContextRevisionRecord,ContextRequestRecord,ContextStorePort,ResolveReference,ValidateBindings,AnalysisContextOptions,ContextMutationResult,CreateContextOptions,CommitContextOptions} from './context_contracts.mjs';
// Property and RegExp coercion remain native; these helpers assert no data shape.
const field=(value: unknown,key: string): unknown=>value==null?undefined:(value as Record<string,unknown>)[key];
const test=(pattern: RegExp,value: unknown)=>pattern.test(value as string);
const isRole=(value: unknown): value is AnalysisRole=>(ANALYSIS_ROLES as readonly unknown[]).includes(value);


const ARRAY_ROLES = new Set<AnalysisRole>(['points', 'measurements']);
const ID = /^[A-Za-z0-9_-]{1,64}$/, HASH = /^[a-f0-9]{64}$/;
const plain = (value: unknown): value is Record<string,unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
export class AnalysisContextError extends Error {readonly code: string; constructor(code: string, message: string) {super(message); this.code = code;}}
function need(condition: unknown, code: string, message: string): asserts condition {if (!condition) throw new AnalysisContextError(code, message);}
function canonical(value: unknown, seen = new Set<object>(), depth = 0): string {
  need(depth <= 32, 'CONTEXT_BUDGET', 'Context JSON nesting exceeds budget');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  const array = Array.isArray(value);
  need(array || plain(value), 'INVALID_CONTEXT', 'Context data must be finite plain JSON');
  need(!seen.has(value as object), 'INVALID_CONTEXT', 'Context data cannot contain cycles');
  const container=value as object;
  const keys = Reflect.ownKeys(container);
  need(keys.length === (array ? (value as unknown[]).length + 1 : Object.keys(container).length), 'INVALID_CONTEXT', 'Context data contains sparse or hidden fields');
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(container, key)!;
    need(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'INVALID_CONTEXT', 'Context data cannot contain accessors');
  }
  seen.add(container);
  const result = array ? '[' + Array.from({length: (value as unknown[]).length}, (_, index) => canonical((value as unknown[])[index], seen, depth + 1)).join(',') + ']'
    : '{' + Object.keys(container).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string,unknown>)[key], seen, depth + 1)).join(',') + '}';
  seen.delete(container); return result;
}
const copy = <T,>(value: T): T => JSON.parse(canonical(value)) as T;
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function entries(value: ContextSlots[AnalysisRole]): ContextEntry[];
function entries<T>(value: T | readonly T[] | null | undefined): T[];
function entries(value: unknown): unknown[] {return value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];}
const active = (value: ContextSlots[AnalysisRole]) => entries(value).length > 0 && entries(value).every(entry => entry.status === 'active');
export const contextFingerprints = (slots: ContextFingerprintSlots): ContextFingerprints => Object.fromEntries(ANALYSIS_ROLES.map(role => [role, entries(slots[role]).length ? digest(entries(slots[role]).map(({ref, proof}) => ({ref, proof}))) : null])) as ContextFingerprints;
const fingerprints = contextFingerprints;
const invalidates: Record<AnalysisRole,AnalysisRole[]> = {
  experiment: ['atlas', 'domain_hypotheses', 'field', 'fft', 'display', 'calibration', 'center', 'points', 'measurements', 'registration', 'comparison'],
  fft: ['display', 'calibration', 'center', 'points', 'measurements', 'registration', 'comparison'],
  calibration: ['display', 'measurements', 'registration', 'comparison', 'observations', 'atlas', 'domain_hypotheses', 'field'], center: ['display', 'measurements', 'registration', 'comparison', 'observations', 'atlas', 'domain_hypotheses', 'field'],
  points: ['measurements', 'registration', 'comparison', 'observations', 'atlas', 'domain_hypotheses', 'field'], measurements: ['registration', 'comparison', 'observations', 'atlas', 'domain_hypotheses', 'field'],
  reference: ['orientation', 'simulation', 'registration', 'comparison'], orientation: ['simulation', 'registration', 'comparison'],
  simulation: ['registration', 'comparison'], registration: ['comparison'], display: [], comparison: [],
  sequence: ['correspondence', 'observations'], correspondence: ['observations'], observations: ['domain_hypotheses', 'field'], atlas: ['domain_hypotheses', 'field'], domain_hypotheses: ['field'], field: [],
};
const parented = new Set<AnalysisRole>(['display', 'calibration', 'center', 'points', 'measurements']);
const required: Partial<Record<AnalysisRole,AnalysisRole[]>> = {atlas: ['calibration', 'center', 'points', 'measurements'], orientation: ['reference'], simulation: ['reference', 'orientation'], measurements: ['points', 'calibration', 'center'], registration: ['measurements', 'simulation'], comparison: ['measurements', 'simulation', 'registration'], correspondence: ['sequence'], observations: ['sequence', 'correspondence']};

export function requiredContextDependencies(slot: AnalysisRole, slots: ContextSelectionView): {required: AnalysisRole[];parents: AnalysisRole[]} {
  need(isRole(slot) && plain(slots), 'INVALID_CONTEXT', 'Dependency inspection needs a supported role and selections');
  const selected = (required[slot] ?? []).filter(dependency => entries(slots[dependency]).length);
  if (['fft','atlas'].includes(slot) && entries(slots.experiment).length) selected.push('experiment');
  return {required: selected, parents: parented.has(slot) ? (['fft', 'experiment'] as const).filter(dependency => entries(slots[dependency]).length) : []};
}

function reference(value: unknown): ScopedReference {
  need(plain(value) && Object.keys(value).sort().join(',') === 'objectId,provider,session,workspace', 'INVALID_REFERENCE', 'Reference needs exact provider/workspace/session/objectId scope');
  for (const key of ['provider', 'session', 'workspace', 'objectId']) need(typeof value[key] === 'string' && value[key].trim().length > 0 && value[key].length <= (key === 'workspace' ? 4096 : 256), 'INVALID_REFERENCE', 'Invalid scoped reference field ' + key);
  return copy(value) as unknown as ScopedReference;
}
function reason(value: unknown): string {need(typeof value === 'string' && value.trim().length > 0 && value.length <= 4000, 'INVALID_REASON', 'Context revision requires an explicit bounded reason'); return value;}
function analysisId(value: unknown): AnalysisId {need(typeof value === 'string' && ID.test(value), 'INVALID_ANALYSIS_ID', 'Invalid analysis identity'); return value as AnalysisId;}

export class AnalysisContext {
  readonly store: ContextStorePort;
  readonly resolveReference: ResolveReference;
  readonly validateBindings: ValidateBindings;
  constructor(options: AnalysisContextOptions);
  constructor({store, resolveReference, validateBindings}: {store?: unknown;resolveReference?: unknown;validateBindings?: unknown} = {}) {
    need(store && ['read', 'compareAndSet', 'saveProposal', 'readProposal', 'findRequest'].every(method => typeof field(store,method) === 'function'), 'INVALID_CONTEXT_STORE', 'Context needs an explicit immutable CAS storage port');
    need(typeof resolveReference === 'function' && typeof validateBindings === 'function', 'INVALID_REFERENCE_PORT', 'Context needs explicit reference-resolution and binding-validation ports');
    this.store = store as ContextStorePort; this.resolveReference = resolveReference as ResolveReference; this.validateBindings = validateBindings as ValidateBindings;
  }

  #context(record: ContextRevisionRecord): ContextSnapshot {
    // Access unknown fields with native JS semantics; the checks below, not this
    // navigation view, establish the stored context/proof shape.
    const value = copy(record.value) as Record<string,unknown>;
    need(value.contextVersion === 1 && plain(value.slots) && typeof value.reason === 'string' && value.reason.trim().length > 0 && value.reason.length <= 4000 &&
      Array.isArray(value.changedSlots) && value.changedSlots.every((item: unknown) => isRole(item)), 'CORRUPT_CONTEXT', 'Stored context schema is invalid');
    const mutationFields = Object.hasOwn(value, 'requestId') || Object.hasOwn(value, 'mutationSha256');
    need(!mutationFields || (typeof value.requestId === 'string' && ID.test(value.requestId) && test(HASH,value.mutationSha256 ?? '')), 'CORRUPT_CONTEXT', 'Stored context mutation identity/hash is invalid');
    need(Object.keys(value.slots).every(slot => isRole(slot)), 'CORRUPT_CONTEXT', 'Stored context contains unknown roles');
    for (const [slot, selection] of Object.entries(value.slots)) {
      need(selection === null || (ARRAY_ROLES.has(slot as AnalysisRole) ? Array.isArray(selection) && selection.length > 0 && selection.length <= 64 : plain(selection)), 'CORRUPT_CONTEXT', 'Stored role selection shape is invalid');
      for (const entry of entries(selection)) {
      need(plain(entry) && Object.keys(entry).sort().join(',') === 'dependsOn,proof,ref,staleBecause,status' && plain(entry.dependsOn) && Array.isArray(entry.staleBecause) && entry.staleBecause.every((item: unknown) => isRole(item)) &&
        Object.entries(entry.dependsOn).every(([role, hash]) => isRole(role) && role !== slot && test(HASH,hash)), 'CORRUPT_CONTEXT', 'Stored context dependency/status record is invalid');
      reference(entry.ref);
      need((['active', 'stale'] as readonly unknown[]).includes(entry.status) && plain(entry.proof) && test(HASH,entry.proof.manifestHash ?? '') && typeof entry.proof.kind === 'string' && entry.proof.kind.length > 0 &&
        Array.isArray(entry.proof.roles) && entry.proof.roles.every((item: unknown) => isRole(item)) && entry.proof.roles.includes(slot as AnalysisRole), 'CORRUPT_CONTEXT', 'Stored context reference proof/status is invalid');
      }
    }
    // The original schema/proof checks above establish the stored context shape.
    const checked=value as unknown as StoredContextValue;
    return {...checked, analysisId: record.analysisId, revision: record.revision, revisionHash: record.hash, parentHash: record.parentHash, fingerprints: fingerprints(checked.slots)};
  }

  async read(id: string, revision?: number) {return this.#context(await this.store.read(analysisId(id), revision));}
  async readProposal(id: string, proposalId: string) {return copy(await this.store.readProposal(analysisId(id), proposalId));}

  async #mutationResult(found: ContextRequestRecord): Promise<ContextMutationResult> {
    if (found.kind === 'revision') return {state: 'advanced', context: this.#context(found.record)};
    const proposal = found.record, savedRevision = field(proposal.value,'observedCurrentRevision');
    need(Number.isSafeInteger(savedRevision) && (savedRevision as number) >= 1, 'CORRUPT_CONTEXT', 'Historical mutation is missing its original observed context revision');
    const observed = await this.store.read(proposal.analysisId, savedRevision as number);
    need(observed.hash === field(proposal.value,'observedCurrentHash'), 'CORRUPT_CONTEXT', 'Historical mutation observed context hash mismatch');
    return {state: 'historical', context: this.#context(observed), proposal: copy(proposal)};
  }

  async #existingMutation(id: AnalysisId, requestId: unknown, mutationSha256: string): Promise<ContextMutationResult|null> {
    if (requestId === undefined) return null;
    need(typeof requestId === 'string' && ID.test(requestId), 'INVALID_CONTEXT_REQUEST', 'Context mutation requires a pre-saved safe request identity');
    const found = await this.store.findRequest(id, requestId);
    if (!found) return null;
    need(test(HASH,field(found.record.value,'mutationSha256') ?? ''), 'CORRUPT_CONTEXT', 'Stored context mutation hash is invalid');
    need(field(found.record.value,'mutationSha256') === mutationSha256, 'REQUEST_CONFLICT', 'Same context request_id has different mutation parameters');
    return this.#mutationResult(found);
  }

  async readRequest(id: string, requestId: string) {
    analysisId(id); need(typeof requestId === 'string' && ID.test(requestId), 'INVALID_CONTEXT_REQUEST', 'Context query requires the original request identity');
    const found = await this.store.findRequest(id, requestId);
    need(found, 'CONTEXT_REQUEST_NOT_FOUND', 'Original context mutation was not found; do not guess or repeat scientific work');
    return this.#mutationResult(found);
  }

  async #entry(slot: AnalysisRole, value: unknown): Promise<ContextEntry> {
    need(plain(value) && Object.keys(value).every(key => ['ref', 'dependsOn'].includes(key)) && Object.hasOwn(value, 'ref'), 'INVALID_CONTEXT_CHANGE', 'A selection contains only ref and optional dependsOn');
    const ref = reference(value.ref), dependsOn = copy(value.dependsOn ?? {});
    need(plain(dependsOn) && Object.entries(dependsOn).every(([key, hash]) => isRole(key) && key !== slot && test(HASH,hash)), 'INVALID_DEPENDENCY', 'Dependency binding requires another selected role and exact fingerprint');
    const proof = copy(await this.resolveReference(copy(ref)));
    need(plain(proof) && Object.keys(proof).every(key => ['manifestHash', 'kind', 'roles', 'scientific'].includes(key)) && test(HASH,proof.manifestHash ?? '') && typeof proof.kind === 'string' && proof.kind.length > 0 && proof.kind.length <= 128 &&
      Array.isArray(proof.roles) && proof.roles.every((item: unknown) => isRole(item)) && proof.roles.includes(slot) && (proof.scientific === undefined || plain(proof.scientific)), 'INVALID_REFERENCE_PROOF', 'Provider did not return a valid immutable proof for selected role');
    need(Buffer.byteLength(canonical(proof)) <= 16 * 1024, 'CONTEXT_BUDGET', 'Reference proof exceeds 16 KiB; arrays/results do not belong in a context');
    return {ref, proof: proof as unknown as ReferenceProof, dependsOn: dependsOn as ContextEntry['dependsOn'], status: 'active', staleBecause: []};
  }

  async #apply(baseSlots: ContextSlots, changes: unknown): Promise<{slots: ContextSlots;changedSlots: AnalysisRole[]}> {
    need(plain(changes) && Object.keys(changes).length > 0 && Object.keys(changes).every(role => isRole(role)), 'INVALID_CONTEXT_CHANGE', 'Changes need explicit supported context roles');
    const slots = copy(baseSlots), replaced = new Set(Object.keys(changes) as AnalysisRole[]);
    for (const [slot, selection] of Object.entries(changes) as [AnalysisRole,unknown][]) {
      if (selection === null) {slots[slot] = null; continue;}
      if (ARRAY_ROLES.has(slot as AnalysisRole)) {
        need(Array.isArray(selection) && selection.length > 0 && selection.length <= 64, 'INVALID_CONTEXT_CHANGE', slot + ' must contain 1..64 scoped selections');
        slots[slot] = await Promise.all(selection.map(item => this.#entry(slot, item)));
      } else {need(!Array.isArray(selection), 'INVALID_CONTEXT_CHANGE', slot + ' must be one scoped selection'); slots[slot] = await this.#entry(slot, selection);}
    }
    const before = fingerprints(baseSlots), after = fingerprints(slots), changedSlots = new Set(ANALYSIS_ROLES.filter(role => before[role] !== after[role]));
    const pending = [...changedSlots], visited = new Set<AnalysisRole>();
    while (pending.length) {
      const source = pending.shift()!; if (visited.has(source)) continue; visited.add(source);
      for (const target of invalidates[source] ?? []) {
        if (replaced.has(target)) continue;
        for (const entry of entries(slots[target])) {entry.status = 'stale'; if (!entry.staleBecause.includes(source)) entry.staleBecause.push(source);}
        if (entries(slots[target]).length) pending.push(target);
      }
    }
    const visiting = new Set<AnalysisRole>(), checked = new Set<AnalysisRole>();
    const checkAcyclic = (slot: AnalysisRole): void => {
      need(!visiting.has(slot), 'CYCLIC_DEPENDENCY', 'Current context dependencies cannot contain a cycle');
      if (checked.has(slot) || !active(slots[slot])) return;
      visiting.add(slot);
      for (const entry of entries(slots[slot])) for (const dependency of Object.keys(entry.dependsOn) as AnalysisRole[]) checkAcyclic(dependency);
      visiting.delete(slot); checked.add(slot);
    };
    for (const slot of Object.keys(slots) as AnalysisRole[]) checkAcyclic(slot);
    // Old dependencies can never silently become fresh again. Explicit new
    // selections must bind all selected current inputs and pass provider checks.
    for (const [slot, selection] of Object.entries(slots) as [AnalysisRole,ContextSlots[AnalysisRole]][]) for (const entry of entries(selection)) {
      const dependencyIssues = (Object.keys(entry.dependsOn) as AnalysisRole[]).filter(dependency => after[dependency] !== entry.dependsOn[dependency] || !active(slots[dependency]));
      if (!replaced.has(slot)) {
        if (dependencyIssues.length) {entry.status = 'stale'; entry.staleBecause = [...new Set([...entry.staleBecause, ...dependencyIssues])];}
        continue;
      }
      need(dependencyIssues.length === 0, 'STALE_DEPENDENCY', 'New ' + slot + ' refers to a changed, missing or stale dependency: ' + dependencyIssues.join(','));
      const {required: mustBind, parents} = requiredContextDependencies(slot, slots);
      need(mustBind.every(dependency => Object.hasOwn(entry.dependsOn, dependency)), 'MISSING_DEPENDENCY', 'New ' + slot + ' must bind selected current inputs: ' + mustBind.join(','));
      if (parents.length) {
        need(parents.length === 0 || parents.some(dependency => Object.hasOwn(entry.dependsOn, dependency)), 'MISSING_DEPENDENCY', 'New ' + slot + ' must bind its selected scientific parent');
      }
      await this.validateBindings({slot, entry: copy(entry), slots: copy(slots), changedSlots: [...changedSlots], fingerprints: copy(after)});
    }
    need(Buffer.byteLength(canonical(slots)) <= 96 * 1024, 'CONTEXT_BUDGET', 'Context references exceed budget');
    return {slots, changedSlots: [...changedSlots]};
  }

  async create({analysisId: requestedId = randomUUID().replaceAll('-', ''), initialRefs = {}, reason: explanation = 'Create explicit current-analysis references', requestId}: CreateContextOptions = {}): Promise<ContextMutationResult> {
    const id = analysisId(requestedId); reason(explanation);
    const accepted = copy(initialRefs), mutationSha256 = digest({operation: 'create', analysisId: id, initialRefs: accepted, reason: explanation});
    const recovered = await this.#existingMutation(id, requestId, mutationSha256); if (recovered) return recovered;
    const applied = Object.keys(accepted).length ? await this.#apply({}, accepted) : {slots: {}, changedSlots: []};
    const value = {contextVersion: 1, reason: explanation, slots: applied.slots, changedSlots: applied.changedSlots, ...(requestId === undefined ? {} : {requestId, mutationSha256})};
    const result = await this.store.compareAndSet({analysisId: id, expectedRevision: 0, parentHash: null, value});
    if (!result.committed) {const original = await this.#existingMutation(id, requestId, mutationSha256); if (original) return original;}
    need(result.committed, 'ANALYSIS_EXISTS', 'Analysis identity already exists; read it rather than replacing it');
    return {state: 'advanced', context: this.#context(result.record)};
  }

  async commit({analysisId: requestedId, expectedRevision, changes, reason: explanation, requestId}: CommitContextOptions): Promise<ContextMutationResult> {
    const id = analysisId(requestedId); reason(explanation);
    need(Number.isSafeInteger(expectedRevision) && expectedRevision >= 1, 'INVALID_REVISION', 'Context commit requires the revision read before work began');
    const accepted = copy(changes), mutationSha256 = digest({operation: 'commit', analysisId: id, expectedRevision, changes: accepted, reason: explanation});
    const recovered = await this.#existingMutation(id, requestId, mutationSha256); if (recovered) return recovered;
    const base = await this.store.read(id, expectedRevision), baseContext = this.#context(base);
    const applied = await this.#apply(baseContext.slots, accepted);
    const value = {contextVersion: 1, reason: explanation, slots: applied.slots, changedSlots: applied.changedSlots, ...(requestId === undefined ? {} : {requestId, mutationSha256})};
    const afterResolution = await this.#existingMutation(id, requestId, mutationSha256); if (afterResolution) return afterResolution;
    const result = await this.store.compareAndSet({analysisId: id, expectedRevision, parentHash: base.hash, value});
    if (result.committed) return {state: 'advanced', context: this.#context(result.record)};
    const afterConflict = await this.#existingMutation(id, requestId, mutationSha256); if (afterConflict) return afterConflict;
    // Provider outcomes were already persisted independently. A lost CAS only
    // prevents promotion; it does not undo or replay any scientific operation.
    const proposal = await this.store.saveProposal(id, {expectedRevision, baseHash: base.hash, reason: explanation, candidate: value, changes: accepted,
      observedCurrentRevision: result.record!.revision, observedCurrentHash: result.record!.hash, ...(requestId === undefined ? {} : {requestId, mutationSha256})});
    return this.#mutationResult({kind: 'proposal', record: proposal});
  }
}
