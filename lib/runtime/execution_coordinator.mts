// Portable, single-process execution mechanics. Providers own scientific
// validation, durable request identity and recovery; this is not a journal.
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

// Wait completion and worker closure are independent facts. A timed-out waiter
// can still own a live worker/resource, and a result can finish before closure.
declare const providerRequestIdTag: unique symbol;
// A checked provider identity is not proof that its durable outcome exists.
export type ProviderRequestId = string & {readonly [providerRequestIdTag]: 'provider-request'};
export type FrozenParameters<T> = T extends object ? {readonly [Key in keyof T]: FrozenParameters<T[Key]>} : T;
export type ExecutionLane = 'work' | 'query';
export type ExecutionMode = 'invoke' | 'recover';
export type WorkerState = 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'unknown' | 'not_started';
export type WaitState = 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
export interface ProviderScope {readonly provider: string; readonly workspace: string; readonly session: string;}
export interface ExecutionSpec<Parameters = unknown> {
  readonly operation: string; readonly requestId: string | null; readonly parameters: Parameters;
  readonly resourceKeys: readonly string[]; readonly timeoutMs: number;
  readonly requestScope?: ProviderScope; readonly lane?: ExecutionLane;
}
export interface RecoverySpec<Parameters = unknown> extends Omit<ExecutionSpec<Parameters>, 'requestId' | 'resourceKeys'> {
  readonly requestId: string; readonly resourceKeys?: readonly [];
}
export interface ExecutionMessages {queued: string; cancelled: string; timeout: string;}
export interface WorkerLifecycle<Result = unknown> {
  readonly result: PromiseLike<Result>; readonly closed: PromiseLike<unknown>;
  readonly requestStop?: () => unknown;
}
export interface InvokePort<Parameters = unknown, Result = unknown> {
  readonly start: (parameters: FrozenParameters<Parameters>) => WorkerLifecycle<Result>;
  readonly messages?: Partial<ExecutionMessages>;
}
export interface RecoveryPort<Parameters = unknown, Result = unknown> {
  readonly query: (parameters: FrozenParameters<Parameters>) => WorkerLifecycle<Result>;
  readonly messages?: Partial<ExecutionMessages>;
}
type Mutable<T> = {-readonly [Key in keyof T]: T[Key]};
interface RawTiming {
  queuedAtMs: number; startingAtMs: number | null; startedAtMs: number | null;
  waitEndedAtMs: number | null; deadlineAtMs: number | null; closedAtMs: number | null;
}
export interface ExecutionTiming extends Readonly<RawTiming> {
  readonly queueMs: number; readonly startMs: number | null; readonly runMs: number | null;
  readonly waitMs: number; readonly totalMs: number;
}
interface RawReceipt {
  receiptVersion: 1; executionId: number; mode: ExecutionMode; operation: string; requestId: ProviderRequestId | null;
  executionToken: string; requestRef: (ProviderScope & {requestId: ProviderRequestId | null}) | null;
  parametersSha256: string; resourceKeys: string[]; lane: ExecutionLane;
  state: WorkerState; waitState: WaitState; closed: boolean; timing: RawTiming;
  queueReason?: 'resource' | 'capacity' | null; deadlineReached?: boolean; stopRequested?: boolean;
  stopError?: string; error?: {category: unknown; message: string};
}
export interface ExecutionReceipt extends Omit<Readonly<RawReceipt>, 'resourceKeys' | 'timing'> {
  readonly resourceKeys: readonly string[]; readonly timing: ExecutionTiming;
}
export interface ExecutionWait<Result> extends Promise<Result> {
  readonly workerDone: Promise<void>; receipt(): ExecutionReceipt;
}
export interface ExecutionOptions {readonly signal?: AbortSignal;}
export interface ObservationOptions {readonly requestScope?: ProviderScope; readonly requestId?: string; readonly limit?: number;}
export interface CoordinatorOptions {readonly capacity?: Record<ExecutionLane, number>; readonly clock?: () => number; readonly maxObservations?: number;}
interface ExecutionError extends Error {executionCategory: string;}
interface Job {
  resourceKeys: string[]; lane: ExecutionLane; receipt: RawReceipt; workerDone: Promise<void>;
  start: (parameters: unknown) => unknown; parameters: unknown; timeoutMs: number; messages: ExecutionMessages;
  signal?: AbortSignal; resolveClosed: () => void; settled: boolean; started: boolean;
  // Node accepts the original null timer sentinel; non-null assertions at
  // clearTimeout only adapt its narrower declaration, preserving runtime args.
  timer: ReturnType<typeof setTimeout> | null; port: WorkerLifecycle<unknown> | null;
  finishWait: (state: WaitState, value: unknown, failed?: boolean) => void; abort: () => void;
  resultSettled?: boolean; lifecycleFailed?: boolean;
}
// Dynamic adapter/error field access preserves the original JavaScript seam;
// no scientific result or closure qualification follows from reading a field.
const field = (value: unknown, key: string): unknown => (value as Record<string, unknown> | null | undefined)?.[key];


function canonical(value: unknown, seen = new Set<object>(), depth = 0): string {
  if (depth > 64) throw new TypeError('Execution parameters exceed nesting budget');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('Execution parameters must be finite plain JSON');
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError('Execution parameters must be plain JSON');
  if (Reflect.ownKeys(value).length !== (array ? value.length + 1 : Object.keys(value).length)) throw new TypeError('Execution parameters contain hidden or sparse fields');
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor!.enumerable || !Object.hasOwn(descriptor!, 'value') ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) throw new TypeError('Execution parameters contain hidden fields or accessors');
  }
  seen.add(value);
  const encoded = array ? '[' + Array.from(value, item => canonical(item, seen, depth + 1)).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key], seen, depth + 1)).join(',') + '}';
  seen.delete(value);
  return encoded;
}
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function freeze<T>(value: T): T {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;}
const defaults = {
  queued: 'Cancelled while queued; operation was not started',
  cancelled: 'Stopped waiting; operation may still finish. Query the original request; do not automatically resubmit.',
  timeout: 'Execution deadline; state may be incomplete. Query the original request; do not automatically resubmit.',
};
function waitError(message: string, category: string): ExecutionError {
  const error = new Error(message) as ExecutionError; error.executionCategory = category; return error;
}

export class ExecutionCoordinator {
  #pending: Job[] = []; #active = new Set<Job>(); #held = new Set<string>(); #idle = new Set<{busy: () => boolean; resolve: () => void}>(); #sequence = 0; #pumping = false; #pumpAgain = false;
  #capacity: Record<ExecutionLane, number>; #clock: () => number; #origin: number; #session = randomUUID(); #observations = new Map<string, RawReceipt>(); #maxObservations: number;

  constructor({capacity = {work: 2, query: 1}, clock = () => performance.now(), maxObservations = 256}: CoordinatorOptions = {}) {
    if (!capacity || !(['work', 'query'] as const).every(key => Number.isSafeInteger(capacity[key]) && capacity[key] >= 1 && capacity[key] <= 32)) throw new TypeError('Execution capacity needs bounded work and query worker slots');
    if (typeof clock !== 'function' || !Number.isSafeInteger(maxObservations) || maxObservations < 1 || maxObservations > 4096) throw new TypeError('Invalid execution observation configuration');
    this.#capacity = {...capacity}; this.#clock = clock; this.#origin = clock(); this.#maxObservations = maxObservations;
  }

  #now() {return Math.max(0, this.#clock() - this.#origin);}

  #snapshot(receipt: RawReceipt): ExecutionReceipt {
    const value = structuredClone(receipt) as RawReceipt & {timing: RawTiming & Partial<Mutable<ExecutionTiming>>}, time = value.timing, now = this.#now();
    time.queueMs = (time.startingAtMs ?? time.closedAtMs ?? now) - time.queuedAtMs;
    time.startMs = time.startingAtMs === null ? null : (time.startedAtMs ?? time.closedAtMs ?? now) - time.startingAtMs;
    time.runMs = time.startedAtMs === null ? null : (time.closedAtMs ?? now) - time.startedAtMs;
    time.waitMs = (time.waitEndedAtMs ?? now) - time.queuedAtMs;
    time.totalMs = (time.closedAtMs ?? now) - time.queuedAtMs;
    return value as ExecutionReceipt;
  }

  #trim() {
    for (const [token, receipt] of this.#observations) {
      if (this.#observations.size <= this.#maxObservations) break;
      if (receipt.closed) this.#observations.delete(token);
    }
  }

  list({requestScope, requestId, limit = 50}: ObservationOptions = {}) {
    const scope = this.#scope(requestScope);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Observation limit must be 1..100');
    return [...this.#observations.values()].filter(receipt => receipt.requestRef && this.#sameScope(receipt.requestRef, scope) &&
      (requestId === undefined || receipt.requestRef.requestId === requestId)).slice(-limit).map(receipt => this.#snapshot(receipt));
  }

  inspect(executionToken: string, {requestScope}: Pick<ObservationOptions, 'requestScope'> = {}) {
    const scope = this.#scope(requestScope), receipt = this.#observations.get(executionToken);
    if (!receipt || !receipt.requestRef || !this.#sameScope(receipt.requestRef, scope)) throw new Error('Execution observation not found in the selected provider/workspace/session');
    return this.#snapshot(receipt);
  }

  #scope(scope: ProviderScope | undefined): ProviderScope {
    if (!scope || !['provider', 'workspace', 'session'].every(key => text(scope[key as keyof ProviderScope]))) throw new TypeError('Execution identity needs explicit provider/workspace/session scope');
    return {provider: scope.provider, workspace: scope.workspace, session: scope.session};
  }

  #sameScope(a: ProviderScope, b: ProviderScope) {return ['provider', 'workspace', 'session'].every(key => a[key as keyof ProviderScope] === b[key as keyof ProviderScope]);}

  invoke<Parameters, Result>(spec: ExecutionSpec<Parameters>, port: InvokePort<Parameters, Result>, {signal}: ExecutionOptions = {}): ExecutionWait<Result> {
    return this.#submit(spec, port, signal, 'invoke') as ExecutionWait<Result>;
  }

  recover<Parameters, Result>(spec: RecoverySpec<Parameters>, port: RecoveryPort<Parameters, Result>, {signal}: ExecutionOptions = {}): ExecutionWait<Result> {
    if (!text(spec?.requestId)) throw new TypeError('Recovery requires the original saved requestId');
    if (spec.resourceKeys?.length) throw new TypeError('Recovery must not acquire a write resource');
    // No invoke/start port is reachable from recovery, including on failure.
    return this.#submit({...spec, resourceKeys: [], lane: 'query'}, port, signal, 'recover') as ExecutionWait<Result>;
  }

  #submit(spec: ExecutionSpec, port: object, signal: AbortSignal | undefined, mode: ExecutionMode): ExecutionWait<unknown> {
    if (!text(spec?.operation) || !(spec.requestId === null || text(spec.requestId))) throw new TypeError('Execution needs an operation and explicit requestId (or null for an inspection)');
    if (!Array.isArray(spec.resourceKeys) || !spec.resourceKeys.every(text)) throw new TypeError('Execution needs provider-supplied resourceKeys');
    if (!Number.isSafeInteger(spec.timeoutMs) || spec.timeoutMs <= 0 || spec.timeoutMs > 2147483647) throw new TypeError('Execution timeoutMs must be a positive bounded integer');
    const start = mode === 'recover' ? field(port, 'query') : field(port, 'start');
    if (typeof start !== 'function') throw new TypeError('Execution requires an explicit ' + (mode === 'recover' ? 'query' : 'start') + ' port');
    if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new TypeError('Invalid execution abort signal');
    const raw = canonical(spec.parameters), parameters = freeze(JSON.parse(raw));
    const resourceKeys = [...new Set(spec.resourceKeys)].sort();
    const lane = spec.lane ?? 'work';
    if (!['work', 'query'].includes(lane) || (lane === 'query' && resourceKeys.length)) throw new TypeError('Query capacity cannot acquire write resources');
    const requestScope = spec.requestScope === undefined ? null : this.#scope(spec.requestScope);
    const messages = {...defaults, ...(field(port, 'messages') as Partial<ExecutionMessages> | undefined)};
    const receipt: RawReceipt = {receiptVersion: 1, executionId: ++this.#sequence, mode, operation: spec.operation, requestId: spec.requestId as ProviderRequestId | null,
      executionToken: this.#session + ':' + this.#sequence, requestRef: requestScope ? {...requestScope, requestId: spec.requestId as ProviderRequestId | null} : null,
      parametersSha256: createHash('sha256').update(raw).digest('hex'), resourceKeys, lane, state: 'queued', waitState: 'waiting', closed: false,
      timing: {queuedAtMs: this.#now(), startingAtMs: null, startedAtMs: null, waitEndedAtMs: null, deadlineAtMs: null, closedAtMs: null}};
    this.#observations.set(receipt.executionToken, receipt); this.#trim();
    let resolveWait!: (value: unknown) => void, rejectWait!: (value: unknown) => void, resolveClosed!: () => void;
    const waiting = new Promise<unknown>((resolve, reject) => {resolveWait = resolve; rejectWait = reject;});
    const workerDone = new Promise<void>(resolve => {resolveClosed = resolve;});
    const job = {resourceKeys, lane, receipt, workerDone, start: start as (parameters: unknown) => unknown, parameters, timeoutMs: spec.timeoutMs, messages, signal,
      resolveClosed, settled: false, started: false, timer: null, port: null} as Job;
    job.finishWait = (state, value, failed = false) => {
      if (job.settled) return;
      job.settled = true; receipt.waitState = state;
      receipt.timing.waitEndedAtMs = this.#now();
      signal?.removeEventListener('abort', job.abort);
      (failed ? rejectWait : resolveWait)(value);
    };
    job.abort = () => {
      if (!job.started) {
        this.#pending = this.#pending.filter(item => item !== job);
        receipt.state = 'not_started'; receipt.closed = true;
        receipt.timing.closedAtMs = this.#now();
        job.finishWait('cancelled', waitError(messages.queued, 'cancelled_before_start'), true);
        resolveClosed(); this.#pump();
      } else job.finishWait('cancelled', waitError(messages.cancelled, 'cancelled_wait'), true);
    };
    Object.defineProperties(waiting, {
      workerDone: {value: workerDone},
      receipt: {value: () => this.#snapshot(receipt)},
    });
    this.#pending.push(job);
    signal?.addEventListener('abort', job.abort, {once: true});
    if (signal?.aborted) job.abort(); else this.#pump();
    return waiting as ExecutionWait<unknown>;
  }

  #pump() {
    if (this.#pumping) {this.#pumpAgain = true; return;}
    this.#pumping = true;
    try {
      // FIFO for conflicting keys; a blocked task does not stop independent
      // work or resource-free inspection/recovery queries.
      do {
        this.#pumpAgain = false;
        const blocked = new Set();
        for (const job of [...this.#pending]) {
          // Trusted ports can synchronously enqueue or cancel another task.
          // A removed task in this snapshot must never be started.
          if (!this.#pending.includes(job)) continue;
          if (job.resourceKeys.some(key => this.#held.has(key) || blocked.has(key))) {
            job.receipt.queueReason = 'resource';
            job.resourceKeys.forEach(key => blocked.add(key)); continue;
          }
          if ([...this.#active].filter(active => active.lane === job.lane).length >= this.#capacity[job.lane]) {job.receipt.queueReason = 'capacity'; continue;}
          this.#pending.splice(this.#pending.indexOf(job), 1);
          this.#active.add(job); job.resourceKeys.forEach(key => this.#held.add(key));
          this.#start(job);
        }
      } while (this.#pumpAgain);
    } finally {this.#pumping = false;}
    this.#notifyIdle();
  }

  #start(job: Job) {
    job.started = true; job.receipt.state = 'starting'; job.receipt.queueReason = null;
    job.receipt.timing.startingAtMs = this.#now();
    let operation: WorkerLifecycle<unknown>;
    try {
      operation = job.start(job.parameters) as WorkerLifecycle<unknown>;
    } catch (error) {
      job.receipt.state = 'failed'; job.finishWait('failed', error, true); this.#release(job); return;
    }
    if (!operation || typeof operation.result?.then !== 'function' || typeof operation.closed?.then !== 'function' ||
        (operation.requestStop !== undefined && typeof operation.requestStop !== 'function')) {
      // A malformed adapter may already have started work. Fail closed: never
      // infer that work is gone, or release its resources from a bad contract.
      Promise.resolve(operation?.result).catch(() => {});
      Promise.resolve(operation?.closed).catch(() => {});
      job.receipt.state = 'unknown';
      job.finishWait('failed', waitError('Provider returned an invalid execution lifecycle; resource retained', 'lifecycle'), true);
      return;
    }
    job.port = operation;
    job.receipt.state = 'running'; job.receipt.timing.startedAtMs = this.#now();
    job.timer = setTimeout(() => {
      job.receipt.deadlineReached = true;
      job.receipt.timing.deadlineAtMs = this.#now();
      job.finishWait('timed_out', waitError(job.messages.timeout, 'deadline'), true);
      // Cancellation detaches the waiter only. The resource guard remains
      // active until close; a stop request/false/error is never proof of exit.
      job.receipt.stopRequested = !job.receipt.closed && typeof operation.requestStop === 'function';
      try {Promise.resolve(job.receipt.closed ? undefined : operation.requestStop?.()).catch(error => {job.receipt.stopError = String(field(error, 'message') ?? error);});}
      catch (error) {job.receipt.stopError = String(field(error, 'message') ?? error);}
    }, job.timeoutMs);
    Promise.resolve(operation.result).then(value => {
      job.resultSettled = true; if (job.receipt.closed) clearTimeout(job.timer!);
      if (!job.lifecycleFailed) job.receipt.state = 'completed';
      job.finishWait('completed', value);
    }, error => {
      job.resultSettled = true; if (job.receipt.closed) clearTimeout(job.timer!);
      if (!job.lifecycleFailed) job.receipt.state = 'failed';
      job.receipt.error = {category: field(error, 'executionCategory') ?? 'provider_failure', message: String(field(error, 'message') ?? error)};
      job.finishWait('failed', error, true);
    });
    Promise.resolve(operation.closed).then(() => this.#release(job), error => {
      // A rejected close promise is a broken adapter, not proof of closure.
      job.lifecycleFailed = true; job.receipt.state = 'unknown';
      job.finishWait('failed', waitError('Provider closure was not confirmed; resource retained: ' + String(error), 'lifecycle'), true);
    });
  }

  #release(job: Job) {
    job.receipt.closed = true;
    job.receipt.timing.closedAtMs = this.#now(); this.#trim();
    if (job.resultSettled || !job.port) clearTimeout(job.timer!);
    this.#active.delete(job); job.resourceKeys.forEach(key => this.#held.delete(key));
    job.resolveClosed(); this.#pump();
  }

  whenIdle(resourceKey?: string): Promise<void> {
    if (resourceKey !== undefined && !text(resourceKey)) throw new TypeError('Invalid idle resource key');
    const busy = () => [...this.#pending, ...this.#active].some(job => resourceKey === undefined || job.resourceKeys.includes(resourceKey));
    if (!busy()) return Promise.resolve();
    return new Promise<void>(resolve => this.#idle.add({busy, resolve}));
  }

  #notifyIdle() {
    for (const waiter of this.#idle) if (!waiter.busy()) {this.#idle.delete(waiter); waiter.resolve();}
  }
}
