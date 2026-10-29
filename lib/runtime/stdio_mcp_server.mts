// Dependency-free MCP stdio transport; the caller supplies a science or DM runtime.
/** Stdio MCP facade. Trusted tool composition lives in lib/tools; scientific
 * execution, provenance and recovery stay in the existing backend adapters. */
import process from 'node:process';
import {RpcError} from './schema.mjs';
import type {Readable, Writable} from 'node:stream';
import type {RPCRequestId, RuntimePort, ToolResult} from './contracts.mjs';

export interface StdioServerOptions {
  runtime?: RuntimePort;
  input?: Readable;
  output?: Pick<Writable, 'write'>;
  exit?: (code: number) => void;
  serverName?: string;
  serverVersion?: string;
}
interface RequestEnvelope {
  jsonrpc: '2.0'; method: string; id?: RPCRequestId; params?: unknown;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function request(value: unknown): value is RequestEnvelope {
  return record(value) && value.jsonrpc === '2.0' && typeof value.method === 'string'
    && (!Object.hasOwn(value, 'id') || typeof value.id === 'string' || Number.isSafeInteger(value.id));
}
// Preserve native JS property access, including the old error mapping for
// non-Error thrown values. This does not validate or claim the field's type.
function field(value: unknown, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}


export function startStdioMcpServer({runtime,input=process.stdin,output=process.stdout,exit=code=>process.exit(code),serverName='microscopy-core',serverVersion='0.1.0'}: StdioServerOptions={}){
if(!runtime||!runtime.registry||typeof runtime.registry.call!=='function'||typeof runtime.registry.listTools!=='function'||typeof runtime.close!=='function')throw new TypeError('MCP stdio facade requires an explicitly composed runtime');
const activeRuntime=runtime;
const SERVER_NAME=serverName;
const SERVER_VERSION=serverVersion;
const PROTOCOL_VERSION='2024-11-05';
function send(msg: unknown) {
  output.write(JSON.stringify(msg) + "\n");
}

function ok(id: RPCRequestId, result: unknown) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id: unknown, code: number, message: unknown) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

const running = new Map<RPCRequestId, AbortController>();
async function handle(msg: unknown) {
  if (!request(msg)) {
    return fail(null, -32600, "Invalid Request");
  }
  const { id, method, params } = msg;
  if (id === undefined) {
    if (method === "notifications/cancelled") {
      const requestId = params == null ? undefined : field(params, 'requestId');
      if (typeof requestId === 'string' || typeof requestId === 'number') running.get(requestId)?.abort();
    }
    return;
  }
  if (params !== undefined && !record(params)) return fail(id, -32602, "params 必须是对象");
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: activeRuntime.instructions,
    });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: activeRuntime.registry.listTools() });
  if (method === "tools/call") {
    if (!params || typeof params.name !== "string") return fail(id, -32602, "需要工具名称");
    if (running.has(id)) return fail(id, -32600, "Duplicate in-flight request id");
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const result = await activeRuntime.registry.call(params.name, params.arguments, {signal: controller.signal});
      if (!controller.signal.aborted) return ok(id, result);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof RpcError) return fail(id, err.code, err.message);
      const failure: ToolResult = {
        content: [{ type: "text", text: `错误: ${field(err, 'message')}` }],
        isError: true,
      };
      return ok(id, failure);
    } finally {
      running.delete(id);
    }
    // A cancelled waiter may resolve later; do not fall through to Method not found.
    return;
  }
  if (method === "resources/list") return ok(id, { resources: [] });
  if (method === "prompts/list") return ok(id, { prompts: [] });
  return fail(id, -32601, `Method not found: ${method}`);
}

let stdinBuffer = "";
input.setEncoding("utf8");
input.on("data", (chunk: string) => {
  stdinBuffer += chunk;
  if (Buffer.byteLength(stdinBuffer, "utf8") > 2 * 1024 * 1024) {
    stdinBuffer = "";
    fail(null, -32600, "Request exceeds 2 MiB");
    return;
  }
  let idx;
  while ((idx = stdinBuffer.indexOf("\n")) >= 0) {
    const line = stdinBuffer.slice(0, idx).trim();
    stdinBuffer = stdinBuffer.slice(idx + 1);
    if (!line) continue;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, "Parse error");
      continue;
    }
    handle(msg).catch((err: unknown) => {
      if (msg && field(msg, 'id') !== undefined) fail(field(msg, 'id'), -32603, field(err, 'message'));
    });
  }
});

let closed=false;
function close(){if(closed)return;closed=true;activeRuntime.close();process.off('SIGINT',close);exit(0);}
input.on('end',close);
process.on('SIGINT',close);
return {close};
}
