// Producer DTOs describe the owned panel state, not scientific qualification.
// Provider JSON that has only been inspected for identity remains unknown.
export type PanelMetadata = Record<string,unknown>;
export interface ImageToolReply {data:unknown;png?:unknown;}
export interface PanelClient {
 rpc(method:string,params?:Readonly<Record<string,unknown>>):Promise<unknown>;
 tool(name:string,args:Readonly<Record<string,unknown>>):Promise<ImageToolReply>;
 close():Promise<void>;
}
export type PanelSelectionKind='point'|'line'|'arrow'|'rectangle'|'polygon';
export interface PanelSelection extends PanelMetadata {
 kind:PanelSelectionKind;coordinate_space:unknown;source_object_id:unknown;
 coordinates:number[];panel:PanelMetadata;
}
export interface PanelEditState {draft_revision:number;dirty:boolean;gesture_active:boolean;selection:PanelSelection|null;annotation_edit:PanelMetadata|null;base_object_id:unknown;}
export interface PanelFrameIdentity {frame_object_id:unknown;frame_index:number;source_object_id:unknown;dataset_index?:number;plane_selection?:unknown;}
export interface PanelDraftPersistence {pending:boolean;error:string|null;}
export interface PanelDraftAcknowledgment {schema_version:1;panel_id:string|null;object_id:unknown;state_revision:number;edit_state:PanelEditState;selection:PanelSelection|null;research_observation:PanelMetadata|null;draft_persistence:PanelDraftPersistence;}
export interface PanelPendingResult {object_id:unknown;request_id:unknown;reason:'unsaved_draft';scientific_operation_complete:true;}
export interface PanelState {
 schema_version:1;panel_id:string|null;backend:'external-image-workspace';state_revision:number;
 object:PanelMetadata;source_identity:PanelMetadata;effective_display:unknown;display_source_object_id:unknown;render_base_id:unknown;
 frame_identity:PanelFrameIdentity|null;png_base64:unknown;clean_png_base64:unknown;clean_png_sha256:string|null;domain_png_base64:unknown;
 sequence_evidence:unknown;domain_evidence:unknown;numeric_results:Record<'statistics'|'profile',PanelMetadata|null>;
 numeric_result_recovery:{state:string;results:Record<string,PanelMetadata>};
 tools:{name:unknown;inputSchema:unknown}[];selection:PanelSelection|null;last_operation:PanelMetadata|null;research_observation:PanelMetadata|null;
 draft_persistence:PanelDraftPersistence;edit_state:PanelEditState;pending_result:PanelPendingResult|null;
}
