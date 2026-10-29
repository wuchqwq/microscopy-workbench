// Process transport contracts only; none of these types qualify scientific JSON.
import type {ToolResult} from './runtime/contracts.mjs';
export interface ImageReadable {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  ref?(): unknown; unref?(): unknown;
}
export interface ImageWritable {
  on(event: 'error', listener: (error: Error) => void): unknown;
  end(data?: string): unknown; write(data: string): unknown;
  ref?(): unknown; unref?(): unknown;
}
export interface ImageProcess {
  readonly stdout: ImageReadable; readonly stderr: ImageReadable; readonly stdin: ImageWritable;
  readonly pid?: number;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'close', listener: (code: number | null) => void): unknown;
  kill(): unknown; unref?(): unknown;
}
export type SpawnImageProcess=(python: string,args: readonly string[],options: {stdio: ['pipe','pipe','pipe'];windowsHide: boolean})=>ImageProcess;
export interface ImageRequest extends Readonly<Record<string,unknown>> {
  action: string; workspace: string; request_id?: unknown; query_request_id?: unknown;
  object_id?: unknown; source_kind?: unknown; source_path?: unknown;
}
export interface ImageWorkerPromise extends Promise<ToolResult> {readonly workerDone: Promise<void>;readonly requestStop: () => unknown;}
export interface MutableImageWorkerPromise extends Promise<ToolResult> {workerDone: Promise<void>;requestStop: () => unknown;}
