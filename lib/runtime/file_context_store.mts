// Generic local immutable context storage. This is not a scientific request
// journal, does not contain arrays, and knows no provider or host configuration.
import {createHash, randomUUID} from 'node:crypto';
import {closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import type {AnalysisId,ContextRevisionRecord,ContextProposalRecord,ContextRequestRecord,ContextCASInput,ContextCASResult,ContextStorePort} from './context_contracts.mjs';

export interface FileContextStoreOptions {directory: string; maxHistoryBytes?: number;}
const object=(value: unknown): value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Native field/RegExp coercion preserves the generic store's legacy JSON seams.
const field=(value: unknown,key: string): unknown=>value==null?undefined:(value as Record<string,unknown>)[key];
const code=(error: unknown): unknown=>(error as {code?: unknown}).code;
const test=(pattern: RegExp,value: unknown)=>pattern.test(value as string);


const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^([0-9]{8})\.json$/;
const MAX_BYTES = 128 * 1024, MAX_REVISIONS = 1024, MAX_HISTORY_BYTES = 16 * 1024 * 1024;
function canonical(value: unknown, seen = new Set<object>(), depth = 0): string {
  need(depth <= 40, 'CONTEXT_BUDGET', 'Context record nesting exceeds budget');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  const array = Array.isArray(value);
  need(value && typeof value === 'object' && (array || [Object.prototype, null].includes(Object.getPrototypeOf(value))) && !seen.has(value), 'INVALID_CONTEXT', 'Context record must be finite plain JSON');
  const container=value as object;
  const keys = Reflect.ownKeys(container);
  need(keys.length === (array ? (value as unknown[]).length + 1 : Object.keys(container).length), 'INVALID_CONTEXT', 'Context record has sparse or hidden fields');
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(container, key)!;
    need(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'INVALID_CONTEXT', 'Context record contains an accessor');
  }
  seen.add(container);
  const result = array ? '[' + Array.from({length: (value as unknown[]).length}, (_, index) => canonical((value as unknown[])[index], seen, depth + 1)).join(',') + ']'
    : '{' + Object.keys(container).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string,unknown>)[key], seen, depth + 1)).join(',') + '}';
  seen.delete(container); return result;
}
const sha = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const clone = <T,>(value: T): T => JSON.parse(canonical(value)) as T;

export class ContextStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {super(message); this.code = code;}
}
function need(condition: unknown, code: string, message: string): asserts condition {if (!condition) throw new ContextStoreError(code, message);}
function id(value: unknown): AnalysisId {need(typeof value === 'string' && ID.test(value), 'INVALID_ANALYSIS_ID', 'Analysis identity must be 1..64 safe characters'); return value as AnalysisId;}
function revision(value: unknown): number {need(Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_REVISIONS, 'INVALID_REVISION', 'Context revision is outside the bounded history'); return value as number;}

export class FileContextStore implements ContextStorePort {
  readonly directory: string;
  readonly maxHistoryBytes: number;
  constructor(options: FileContextStoreOptions);
  constructor({directory, maxHistoryBytes = MAX_HISTORY_BYTES}: {directory?: unknown;maxHistoryBytes?: unknown} = {}) {
    need(typeof directory === 'string' && path.isAbsolute(directory), 'INVALID_CONTEXT_DIRECTORY', 'Context directory must be explicit and absolute');
    need(Number.isSafeInteger(maxHistoryBytes) && (maxHistoryBytes as number) >= 1024 && (maxHistoryBytes as number) <= MAX_HISTORY_BYTES, 'INVALID_CONTEXT_BUDGET', 'History byte budget may only reduce the 16 MiB bound');
    this.directory = path.resolve(directory);
    this.maxHistoryBytes = maxHistoryBytes as number;
  }

  #directory(analysisId: string, create = false): string {
    id(analysisId);
    if (create) mkdirSync(this.directory, {recursive: true});
    need(existsSync(this.directory), 'ANALYSIS_NOT_FOUND', 'Context store does not exist');
    const root = realpathSync.native(this.directory), target = path.join(root, analysisId);
    if (create) mkdirSync(target, {recursive: true});
    need(existsSync(target), 'ANALYSIS_NOT_FOUND', 'Analysis context not found');
    need(lstatSync(target).isDirectory() && !lstatSync(target).isSymbolicLink(), 'CORRUPT_CONTEXT', 'Context directory is not an owned regular directory');
    need(path.dirname(realpathSync.native(target)) === root, 'CORRUPT_CONTEXT', 'Context directory escapes the explicit store');
    return target;
  }

  #readFile(filename: string): {record: unknown;size: number} {
    const stat = lstatSync(filename);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= MAX_BYTES, 'CORRUPT_CONTEXT', 'Context file is not a bounded complete regular record');
    try {return {record: JSON.parse(readFileSync(filename, 'utf8')), size: stat.size};}
    catch {throw new ContextStoreError('CORRUPT_CONTEXT', 'Context record is incomplete or invalid JSON; no automatic repair');}
  }

  #history(analysisId: string) {
    const directory = this.#directory(analysisId), names = readdirSync(directory).filter(name => REVISION.test(name)).sort();
    need(names.length > 0, 'ANALYSIS_NOT_FOUND', 'Analysis context has no committed revisions');
    need(names.length <= MAX_REVISIONS, 'CONTEXT_BUDGET', 'Context history exceeds revision budget');
    const records: ContextRevisionRecord[] = []; let previousHash: string|null = null, total = 0;
    for (let index = 0; index < names.length; index++) {
      need(names[index] === String(index + 1).padStart(8, '0') + '.json', 'CORRUPT_CONTEXT', 'Context history has a missing or invalid revision');
      const loaded = this.#readFile(path.join(directory, names[index])); total += loaded.size;
      need(total <= this.maxHistoryBytes, 'CONTEXT_BUDGET', 'Context history exceeds verification byte budget');
      const record = loaded.record;
      need(object(record), 'CORRUPT_CONTEXT', 'Context record is not an object');
      const {hash, ...payload} = record;
      need(record.schemaVersion === 1 && record.analysisId === analysisId && record.revision === index + 1 &&
        record.parentHash === previousHash && test(HASH,hash ?? '') && sha(payload) === hash,
      'CORRUPT_CONTEXT', 'Context identity/hash/parent chain mismatch; no current state accepted');
      previousHash = hash as string;
      // Identity, parent chain and canonical hash were checked above; value stays unknown.
      records.push(record as unknown as ContextRevisionRecord);
    }
    return {records, totalBytes: total};
  }

  read(analysisId: string, atRevision?: number): ContextRevisionRecord {
    const {records} = this.#history(id(analysisId));
    if (atRevision !== undefined) revision(atRevision);
    const record = atRevision === undefined ? records.at(-1) : records[atRevision - 1];
    need(record, 'REVISION_NOT_FOUND', 'Requested historical context revision does not exist');
    return clone(record);
  }

  #publish<Payload extends Record<string,unknown>>(directory: string, name: string, payload: Payload, remainingBytes = MAX_BYTES): (Payload & {hash: string}) | null {
    const record = {...payload, hash: sha(payload)}, raw = canonical(record) + '\n';
    need(Buffer.byteLength(raw) <= MAX_BYTES, 'CONTEXT_BUDGET', 'Context record exceeds 128 KiB');
    need(Buffer.byteLength(raw) <= remainingBytes, 'CONTEXT_BUDGET', 'Appending this context record would exceed the readable history budget');
    const temporary = path.join(directory, 'pending-' + randomUUID() + '.tmp'), destination = path.join(directory, name);
    let descriptor: number|undefined;
    try {
      descriptor = openSync(temporary, 'wx');
      writeFileSync(descriptor, raw, 'utf8'); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      // Hard-link publication is exclusive and atomic on the configured local
      // filesystem. A partial temporary file is never a committed revision.
      try {linkSync(temporary, destination);} catch (error) {if (code(error) === 'EEXIST') return null; throw error;}
      return record;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  compareAndSet({analysisId, expectedRevision, parentHash, value}: ContextCASInput): ContextCASResult {
    const acceptedId=id(analysisId);
    need(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0 && expectedRevision < MAX_REVISIONS, 'INVALID_REVISION', 'Expected context revision is outside the bounded history');
    need((expectedRevision === 0 && parentHash === null) || (expectedRevision > 0 && HASH.test(parentHash ?? '')), 'INVALID_PARENT_HASH', 'CAS requires the exact previous context hash');
    const directory = this.#directory(analysisId, true);
    let current: ContextRevisionRecord|null, totalBytes = 0;
    try {const history = this.#history(analysisId); current = history.records.at(-1)!; totalBytes = history.totalBytes;}
    catch (error) {if (code(error) !== 'ANALYSIS_NOT_FOUND') throw error; current = null;}
    if ((current?.revision ?? 0) !== expectedRevision || (current?.hash ?? null) !== parentHash) return {committed: false, record: current};
    const next = expectedRevision + 1;
    const record = this.#publish(directory, String(next).padStart(8, '0') + '.json', {schemaVersion: 1 as const, analysisId: acceptedId, revision: next, parentHash, value: clone(value)}, this.maxHistoryBytes - totalBytes);
    if (!record) return {committed: false, record: this.read(analysisId)};
    return {committed: true, record: clone(record)};
  }

  saveProposal(analysisId: string, value: unknown): ContextProposalRecord {
    const acceptedId=id(analysisId), directory = this.#directory(acceptedId);
    const requestId = field(value,'requestId');
    if (requestId !== undefined) need(typeof requestId === 'string' && ID.test(requestId) && test(HASH,field(value,'mutationSha256') ?? ''), 'INVALID_CONTEXT_REQUEST', 'Historical mutation needs a valid original request identity/hash');
    const proposalId = requestId === undefined ? randomUUID().replaceAll('-', '') : sha({analysisId, requestId}).slice(0, 32);
    const proposals = path.join(directory, 'proposals'); mkdirSync(proposals, {recursive: true});
    need(!lstatSync(proposals).isSymbolicLink() && path.dirname(realpathSync.native(proposals)) === directory, 'CORRUPT_CONTEXT', 'Proposal directory escapes analysis');
    if (existsSync(path.join(proposals, proposalId + '.json'))) {
      const existing = this.readProposal(analysisId, proposalId);
      need(requestId !== undefined && field(existing.value,'requestId') === requestId && field(existing.value,'mutationSha256') === field(value,'mutationSha256'), 'REQUEST_CONFLICT', 'Same context request_id has different mutation parameters');
      return existing;
    }
    need(readdirSync(proposals).length < MAX_REVISIONS, 'CONTEXT_BUDGET', 'Historical proposal budget exceeded');
    const record = this.#publish(proposals, proposalId + '.json', {schemaVersion: 1 as const, analysisId: acceptedId, proposalId, value: clone(value)});
    if (!record) {
      const existing = this.readProposal(analysisId, proposalId);
      need(requestId !== undefined && field(existing.value,'requestId') === requestId && field(existing.value,'mutationSha256') === field(value,'mutationSha256'), 'REQUEST_CONFLICT', 'Same context request_id has different mutation parameters');
      return existing;
    }
    return clone(record);
  }

  findRequest(analysisId: string, requestId: string): ContextRequestRecord|null {
    id(analysisId); need(typeof requestId === 'string' && ID.test(requestId), 'INVALID_CONTEXT_REQUEST', 'Invalid original context request identity');
    let history: {records: ContextRevisionRecord[];totalBytes: number};
    try {history = this.#history(analysisId);} catch (error) {if (code(error) === 'ANALYSIS_NOT_FOUND') return null; throw error;}
    const matches = history.records.filter(record => field(record.value,'requestId') === requestId);
    need(matches.length <= 1, 'CORRUPT_CONTEXT', 'A context mutation identity belongs to more than one revision');
    const proposalId = sha({analysisId, requestId}).slice(0, 32), directory = this.#directory(analysisId);
    const proposal = existsSync(path.join(directory, 'proposals', proposalId + '.json')) ? this.readProposal(analysisId, proposalId) : null;
    need(!(matches.length && proposal), 'CORRUPT_CONTEXT', 'A context mutation identity belongs to both current history and a historical proposal');
    if (matches.length) return {kind: 'revision', record: clone(matches[0])};
    if (proposal) {
      need(field(proposal.value,'requestId') === requestId && test(HASH,field(proposal.value,'mutationSha256') ?? ''), 'CORRUPT_CONTEXT', 'Historical context mutation identity/hash mismatch');
      return {kind: 'proposal', record: proposal};
    }
    return null;
  }

  readProposal(analysisId: string, proposalId: string): ContextProposalRecord {
    const directory = this.#directory(id(analysisId));
    need(typeof proposalId === 'string' && /^[a-f0-9]{32}$/.test(proposalId), 'INVALID_PROPOSAL_ID', 'Invalid historical proposal identity');
    const proposals = path.join(directory, 'proposals');
    need(existsSync(proposals) && !lstatSync(proposals).isSymbolicLink(), 'PROPOSAL_NOT_FOUND', 'Historical proposal not found');
    const filename = path.join(proposals, proposalId + '.json');
    need(existsSync(filename), 'PROPOSAL_NOT_FOUND', 'Historical proposal not found');
    const {record} = this.#readFile(filename);
    need(object(record), 'CORRUPT_CONTEXT', 'Historical proposal record is not an object');
    const {hash, ...payload} = record;
    need(record.schemaVersion === 1 && record.analysisId === analysisId && record.proposalId === proposalId && test(HASH,hash ?? '') && sha(payload) === hash,
      'CORRUPT_CONTEXT', 'Historical proposal identity/hash mismatch');
    return clone(record as unknown as ContextProposalRecord);
  }
}
