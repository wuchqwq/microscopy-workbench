// Producer DTOs describe the owned panel state, not scientific qualification.
// Provider JSON that has only been inspected for identity remains unknown.
import type {PanelRoiHandoff,PanelInteractionGate,RoiObservationRow} from '../ui/image-panel/roi-observations.mjs';
import type {AnalysisWorkspaceStatus} from './analysis_workspace.mjs';
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
export interface PanelPendingResult {object_id:unknown;request_id:unknown;reason:'unsaved_draft'|'window_capacity';scientific_operation_complete:true;}
export interface PanelWindowLayout {x:number;y:number;width:number;height:number;z:number;}
export interface PanelWindowCamera {scale:number;center_image_xy:readonly [number,number];}
export interface PanelWindowUiPanels {side:'none'|'properties'|'research';settings:boolean;results:boolean;}
export interface PanelWindowViewContext {
 version:1;object_id:string;panel_mapping_fingerprint:string;camera:PanelWindowCamera;ui_panels?:PanelWindowUiPanels;
 selection_candidate:PanelSelection|null;selected_annotation_id:string|null;
 camera_origin?:'new_fit_preference';
}
export interface PanelWindowSourceReference {
 input_view_object_id:string;frame_object_id:string;raw_fft_object_id:string;processing_rect_xyxy:readonly number[];
 calibration_relation:'same'|'different'|'unknown';
 input_view_context?:PanelWindowViewContext;
}
export interface PanelWindowEntry {
 window_id:string;object_id:string;role:'source'|'roi'|'fft';title:string;layout:PanelWindowLayout;
 source_reference?:PanelWindowSourceReference;
 view_context?:PanelWindowViewContext;
 latest_observation_view_object_id?:string;
}
export interface PanelWindowCollection {
 schema_version:1;revision:number;frame_object_id:string|null;active_window_id:string|null;windows:PanelWindowEntry[];
 unavailable_reason?:string;
 closed_windows?:PanelWindowEntry[];
}
export interface PanelWindowAsset {
 schema_version:1;collection_revision:number;window_id:string;object_id:string;object:PanelMetadata;png_base64:string;
 panel_mapping_fingerprint?:string;
}
export interface PanelSourceRoiObservation extends RoiObservationRow {reason_status:'recorded'|'unknown';}
export interface PanelSourceObservations {
 object_id:string;roles:('active_spatial'|'retained_spatial'|'latest_observation'|'fft_input')[];status:'validated'|'unavailable';
 reason_code:string|null;frame_object_id:string|null;handoff:PanelRoiHandoff|null;observations:PanelSourceRoiObservation[];
}
export interface PanelFftObservationMatch {
 source_view_object_id:string;annotation_id:string|null;
 relation:'exact_original_geometry'|'same_processing_window'|'changed_geometry'|'unknown';
}
export interface PanelFftRoiRelation {
 window_id:string;display_object_id:string;raw_fft_object_id:string|null;input_view_object_id:string|null;
 status:'validated'|'unavailable'|'unknown';reason_code:string|null;processing_rect_xyxy:readonly number[]|null;
 input_float_coordinates:readonly number[]|null;input_annotation_id:string|null;
 calibration_relation:'same'|'different'|'unknown';current_observation_matches:PanelFftObservationMatch[];
}
export interface PanelMultiRoiHandoff {
 schema_version:1;read_only:true;validation_status:'validated'|'partial'|'unavailable';
 panel_id:string|null;helper_session_id?:string|null;panel_generation?:number|null;
 active_view_object_id:string;state_revision:number;draft_revision:number;collection_revision:number;frame_object_id:string|null;
 interaction_gate:PanelInteractionGate;active_handoff:PanelRoiHandoff;
 source_observations:PanelSourceObservations[];fft_relations:PanelFftRoiRelation[];
 semantics:string;
}
// Navigation availability only, never a scientific/evidence qualification.
export interface PanelSpatialReturnState {version:1;status:'ready'|'unavailable';view_object_id?:string;frame_object_id?:string;reason_code?:string;}
export interface PanelState {
 joint_research?:import('./research_joint_owner.mjs').JointOwnerSnapshot;
 schema_version:1;panel_id:string|null;backend:'external-image-workspace';state_revision:number;
 helper_session_id?:string|null;panel_generation?:number|null;
 object:PanelMetadata;source_identity:PanelMetadata;effective_display:unknown;display_source_object_id:unknown;render_base_id:unknown;
 frame_identity:PanelFrameIdentity|null;png_base64:unknown;clean_png_base64:unknown;clean_png_sha256:string|null;domain_png_base64:unknown;
 frame_resolution?:{object_id:unknown;status:string;reason_code:string;records_checked:number;ancestor_reads:number};
 source_recheck?:{status:'available'|'pending';reason_code:string;records_checked:number;request_id?:unknown};
 sequence_evidence:unknown;domain_evidence:unknown;numeric_results:Record<'statistics'|'profile',PanelMetadata|null>;
 crystal_evidence?:unknown;
 research_question?:import('../ui/image-panel/research-question.mjs').ResearchQuestion;
 research_lead_session_id?:string;
 research_offline?:import('../ui/image-panel/offline-research.mjs').OfflineResearch;
 research_leads?:import('../ui/image-panel/research-leads.mjs').ResearchLeads;
 research_leads_reference_status?:'not_revalidated_by_state_read';
 research_leads_semantics?:'caller_proposals_not_authenticated_or_scientifically_validated; next_step_is_unexecuted_plan; same_source_entries_are_not_independent_experiments; no_automatic_weighting_or_hypothesis_test';
 numeric_result_recovery:{state:string;results:Record<string,PanelMetadata>};
 tools:{name:unknown;inputSchema:unknown}[];selection:PanelSelection|null;last_operation:PanelMetadata|null;research_observation:PanelMetadata|null;
 draft_persistence:PanelDraftPersistence;edit_state:PanelEditState;pending_result:PanelPendingResult|null;
 spatial_return:PanelSpatialReturnState;
 window_collection?:PanelWindowCollection;
 panel_mapping_fingerprint?:string;
 multi_roi_handoff_schema_version?:1;
 workspace_analysis?:AnalysisWorkspaceStatus;
}
