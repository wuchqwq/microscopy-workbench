// Contracts for the owned loopback bridge. They do not qualify scientific JSON.
import type {ToolResult} from './runtime/contracts.mjs';

export interface OwnedPanelConnection {
  schema_version: 1; panel_id: string; port: number; token: string; pid: number;
}
// Only response()'s existing panel/object identity checks establish this view.
// Every other field, including presentation, calibration and selection, is raw.
export interface IdentityCheckedPanelState extends Record<string, unknown> {
  panel_id: string;
  object: Record<string, unknown> & {object_id: string};
}
export interface PanelLaunch {
  panel_id: string; connection_file: string; object_id: string;
}
export interface PanelHttpResponse {
  readonly ok: boolean; readonly status: number;
  text(): PromiseLike<string>;
}
export type PanelFetch = (url: string, options: {
  method: string; headers: Record<string, string>; body?: string; signal: AbortSignal;
}) => PromiseLike<PanelHttpResponse>;
export interface PanelManagerOptions {
  workspace?: string; python?: string;
  inspect?: (objectId: string) => unknown | PromiseLike<unknown>;
  launch?: (request: PanelLaunch) => unknown | PromiseLike<unknown>;
  fetchImpl?: PanelFetch; readyTimeoutMs?: number; requestTimeoutMs?: number;
}
export interface PanelManagerPort {
  readonly workspace: string;
  call(name: string, args?: unknown, signal?: AbortSignal): ToolResult | PromiseLike<ToolResult>;
}
export interface PanelImageWorkspacePort {
  readonly workspace: string; readonly python?: string;
  call(name: string, args: unknown): ToolResult | PromiseLike<ToolResult>;
}
