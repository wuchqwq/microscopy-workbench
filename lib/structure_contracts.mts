// Production contracts for the existing independent structure adapter and its
// presentation-only display copy. They do not qualify phases or simulations.
import type {ToolResult} from './runtime/contracts.mjs';
import type {ExecutionCoordinator,ProviderScope} from './runtime/execution_coordinator.mjs';
import type {ChildProcessWithoutNullStreams,SpawnOptionsWithoutStdio} from 'node:child_process';

export type * from './structure_snapshot_contracts.mjs';
import type {StructureObjectId} from './structure_snapshot_contracts.mjs';
export interface StructureArguments {
 readonly [parameter: string]: unknown;
 readonly request_id?: string; readonly object_id?: string;
 readonly orientation_id?: string; readonly euler_rzxz_deg?: readonly number[];
 readonly interactive?: boolean;
}
export type StructureAction = 'open'|'get'|'view'|'measure'|'derive'|'simulate'|'result'|'orient'|'compare'|'register'|'compare_batch'|'twin_orient'|'twin_compare'|'twin_evidence';
export interface StructureWorkerPayload extends Record<string,unknown> {workspace:string;action:StructureAction;}
// Only these two provenance fields are checked for every successful Python
// reply. All other scientific fields remain unknown until their existing guard.
export interface StructureWorkerProvenance extends Record<string,unknown> {
 backend:'external-structure-workspace';state:'completed';
}
export interface StructureWorkerWait extends Promise<ToolResult> {workerDone:Promise<void>;}
export type SpawnStructureWorker = (command:string,args:readonly string[],options:SpawnOptionsWithoutStdio)=>ChildProcessWithoutNullStreams;
export interface StructureWorkspaceOptions {
 workspace:string; imageWorkspacePath?:string|null; python?:string; timeoutMs?:number;
 workerPath?:string; spawnProcess?:SpawnStructureWorker; coordinator?:ExecutionCoordinator;
}
export interface StructureWorkspacePort {
 readonly workspace:string; readonly requestScope?:ProviderScope;
 call(name:string,args?:StructureArguments,signal?:AbortSignal):ToolResult|PromiseLike<ToolResult>;
}
export interface ViewerClosureRecord {
 schema_version:1;state:'closed';object_id:StructureObjectId;snapshot_sha256:string;
 // Legacy HTTP RegExp checks intentionally preserve coercion; a receipt does
 // not claim that arbitrary authenticated HTTP request IDs were strings.
 pid:number;request_id:unknown;closed_utc:string;
}
export interface ViewerAttachment extends Record<string,unknown> {
 interactive_3d:'AVAILABLE_NOT_OBSERVED'|'NOT_STARTED'; viewer_state:'ready'|'cancelled_before_launch';
 viewer_url:string|null; viewer_owner_view_object_id?:unknown;
}
export interface StructureViewerOptions {
 workspace?:string;assetPath?:string|null;inspect?:(objectId:string)=>unknown|PromiseLike<unknown>;signal?:AbortSignal;
}
export interface ViewerCloseOptions {workspace?:string;signal?:AbortSignal;}
export interface ViewerCloseArguments {object_id:string;request_id:string;}
