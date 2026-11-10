// Host-neutral session observations only. No provider dispatch or research writes.
import type {ApprovedResearchTurn} from './research_host_dispatch.mjs';
export const SYNTHETIC_HOST_NOTICE='合成宿主测试，真实 Codex 尚未连接；无模型、科学执行或候选接纳。';
export interface HostTaskRef {task_id:string;context_sha256:string;}
// Explicit caller-selected display files. A digest is an integrity check, not
// permission to disclose the file or scientific qualification of its contents.
export interface HostLocalImage {path:string;sha256:string;}
// Only qualified primitive fields may accompany a display. No provider panel,
// context object, local path or arbitrary metadata is forwarded.
export interface HostImageReference {
 view_id:string;view_manifest_sha256:string;original_request_id:string;
 frame_id:string;frame_manifest_sha256:string;frame_array_sha256:string;view_array_sha256:string;
 frame_shape_yx:[number,number];view_shape_yx:[number,number];dtype:string;
 source_rect_xyxy:[number,number,number,number];image_rect_xyxy:[number,number,number,number];display_png_sha256:string;
}
export interface HostTurnInput {text:string;images?:readonly HostLocalImage[];source?:HostImageReference;}
export interface HostHandle {host_kind:string;thread_id:string;task:HostTaskRef;}
export type HostTurnState='idle'|'starting'|'running'|'awaiting_user'|'completed'|'interrupted'|'failed'|'unknown';
export interface HostAgentMessage {thread_id:string;turn_id:string;item_id:string;text:string;phase?:'commentary'|'partial_answer'|'final_answer'|null;}
export interface HostProtocolDiagnostic {
 sequence:number;method:string;classification:'metadata'|'reasoning'|'tool_lifecycle'|'control'|'error'|'warning'|'identity_mismatch'|'unknown'|'invalid'|'risk'|'late';association:'global'|'thread'|'turn'|'unbound'|'mismatch';
 method_sha256?:string;item_type?:string;item_type_sha256?:string;thread_id_sha256?:string;turn_id_sha256?:string;item_id_sha256?:string;call_id_sha256?:string;request_id_sha256?:string;status?:string;active_flags?:string[];will_retry?:boolean;error_code?:string;http_status?:number;
}
export interface HostToolStatus {thread_id:string;turn_id:string;item_id_sha256:string;tool:string;status:'inProgress'|'completed'|'failed'|'unknown';success:boolean|null;authority:'host_lifecycle_only';}
export interface HostSnapshot {host_kind:string;verification:'synthetic'|'unverified';connection:'not_started'|'initializing'|'ready'|'closing'|'closed'|'failed';thread_id:string|null;turn_id:string|null;turn_state:HostTurnState;task:HostTaskRef|null;notice:string;
 session_revision:number;
 // Current turn only: observed authoritative messages, never concatenated deltas.
 agent_messages:HostAgentMessage[];unfinished_agent_message_ids:string[];
 // Only an actual process close supplies this receipt, including after a wait timeout.
 transport_close:{exit_code:number|null;signal:string|null}|null;}
// These are INTERNAL events, not app-server wire methods or scientific receipts.
export type HostEvent={kind:'host_state';snapshot:HostSnapshot}|{kind:'host_text';text_kind:'delta';thread_id:string;turn_id:string;item_id:string;text:string}|({kind:'host_message_completed'}&HostAgentMessage)|{kind:'host_request_blocked';request_id:string|number;method:string;disposition:'awaiting_user'|'unsupported'}|{kind:'host_warning';reason:string}|{kind:'host_transport_closed';exit_code:number|null;signal:string|null}|({kind:'host_protocol_diagnostic'}&HostProtocolDiagnostic)|({kind:'host_tool_status'}&HostToolStatus);
export interface ResearchHost {
 connect():Promise<void>;
 startSession(task:HostTaskRef):Promise<HostHandle>;
 resumeSession(handle:HostHandle):Promise<HostHandle>;
 startTurn(input:string|ApprovedResearchTurn):Promise<string>;
 interrupt():Promise<void>;
 close():Promise<boolean>;
 snapshot():HostSnapshot;
 subscribe(listener:(event:HostEvent)=>void):()=>void;
}
export function readHostTaskRef(value:HostTaskRef):HostTaskRef {
 if(!value||typeof value.task_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value.task_id)||typeof value.context_sha256!=='string'||!/^([a-f0-9]{64})$/.test(value.context_sha256))throw new Error('Explicit opaque task ID and context digest required');
 return Object.freeze({task_id:value.task_id,context_sha256:value.context_sha256});
}
