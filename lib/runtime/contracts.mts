// Runtime-facing contracts only. Provider scientific records remain validated
// by their existing adapters; these types never qualify a scientific result.
import type {ToolInputSchema} from './schema.mjs';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonRecord;
export interface JsonRecord {readonly [key: string]: JsonValue;}

// JSON-RPC transport IDs are not persisted provider request identities. The
// latter remain inside unknown tool arguments until their adapters validate them.
export type RPCRequestId = string | number;

export interface ToolCallOptions {readonly signal?: AbortSignal;}
export interface TextContent {readonly type: 'text'; readonly text: string;}
export interface ImageContent {readonly type: 'image'; readonly data: string; readonly mimeType: string;}
export type ToolContent = TextContent | ImageContent;
export interface ToolResult {
  readonly content: readonly ToolContent[];
  readonly isError?: boolean;
  readonly [extension: string]: unknown;
}
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
}
export type RequestIdentityPolicy = 'required' | 'optional' | 'query' | 'none';
export interface ToolContract {
  readonly backend: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly effects: {readonly kind: string; readonly sourceMutation: boolean; readonly requestId: RequestIdentityPolicy;};
  readonly gates: readonly string[];
  readonly execution: {readonly resourceKeys: readonly string[]; readonly serialization: string; readonly budgets: readonly string[]; readonly cancellation: string;};
  readonly recovery: {readonly method: string; readonly scope: string; readonly tool: string | null; readonly idField: string | null;};
}

// The current JS handlers are not runtime-result validators. Their outputs
// therefore stay unknown at the registry/transport port. A migrated handler may
// explicitly promise ToolResult without making that claim for every old adapter.
export type ToolHandler<Result = unknown> = (args: unknown, options: ToolCallOptions) => Result | PromiseLike<Result>;
export interface RegistryTool<Result = unknown> {
  readonly definition: ToolDefinition;
  readonly contract: ToolContract;
  readonly execute: ToolHandler<Result>;
}
export interface RegistryModule {
  readonly id: string;
  readonly enabled: true;
  readonly instructions: string;
  readonly tools: readonly RegistryTool[];
  readonly close?: () => void;
}
export interface ToolRegistryPort {
  listTools(): ToolDefinition[];
  call(name: string, args?: unknown, options?: ToolCallOptions): Promise<unknown>;
}
export interface RuntimePort {
  // The stdio facade has always accepted synchronous custom registries too.
  // The concrete ToolRegistry port above remains explicitly asynchronous.
  readonly registry: {
    listTools: ToolRegistryPort['listTools'];
    call(name: string, args?: unknown, options?: ToolCallOptions): unknown;
  };
  readonly instructions?: string;
  close(): void;
}
