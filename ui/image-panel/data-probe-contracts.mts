import type {WorkflowState,CalibrationView} from './presentation-contracts.mjs';
export interface ProbeSample {readonly array_index_xy?:readonly unknown[];readonly value?:unknown;readonly point?:readonly unknown[];}
export interface ProfileSamples {
 readonly value:readonly unknown[];readonly distance:readonly unknown[];readonly coordinates_xy:readonly (readonly unknown[])[];
 readonly indices_xy:readonly (readonly unknown[])[];readonly sampled_coordinates_xy?:readonly (readonly unknown[])[];
 readonly physical_distance?:readonly unknown[]|null;
}
export interface NumericResult {
 readonly kind?:string;readonly component?:string;readonly coordinate_space?:string;readonly source_rect_xyxy?:readonly number[];readonly frequency_rect?:readonly number[];
 readonly object_id?:string;readonly request_id?:string;readonly parent_object_id?:string;readonly source_object_id?:string;readonly dtype?:string;
 readonly physical_distance_unit?:string;readonly distance_unit?:string;readonly scientific_grid_identity?:unknown;readonly xy_calibration?:CalibrationView;
 readonly sampling?:{readonly interpolation?:string;readonly line_width?:unknown};
 readonly statistics?:{readonly sample_count?:unknown;readonly mean?:unknown;readonly stddev?:unknown;readonly minimum?:unknown;readonly maximum?:unknown};
}
export interface ProbeResult extends NumericResult {readonly samples?:readonly ProbeSample[];}
export interface ProfileResult extends NumericResult {readonly samples?:Partial<ProfileSamples>;}
export interface NumericReply extends ProfileResult {readonly last_operation?:ProfileResult;}
export interface ProbeState extends WorkflowState {readonly numeric_result_recovery?:{readonly state?:string;readonly results?:Readonly<Record<string,{readonly state?:string}>>};}
export interface ProbeSelection {readonly coordinates:readonly number[];readonly source_object_id?:string;readonly coordinate_space?:string;}
export interface ProbeBinding {object_id:string|undefined;state_revision:number|undefined;}
export interface PendingProbe {binding:ProbeBinding;sequence:number;component:string;selection:ProbeSelection;}
