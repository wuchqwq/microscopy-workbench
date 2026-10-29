// Descriptive projections of saved evidence; these do not qualify any physical
// conclusion, grid, mapping, calibration, or numerical tolerance.
export interface CorrespondenceFrame {
 readonly frame_index?:number;readonly method?:string;readonly status?:string;readonly reason?:string;
 readonly basis?:{readonly source?:string;readonly source_text?:string};
 readonly overview_object_id?:string;readonly roi_object_id?:string;readonly view_object_id?:string;
}
export interface SequenceFrame extends CorrespondenceFrame {readonly frame_index:number;}
export interface SequenceEvidence {
 readonly reference_index?:number;readonly frame_observations?:readonly SequenceFrame[];
 readonly observations?:readonly {readonly frame_index:number;readonly status:string;readonly measurement_object_id?:string;readonly reference_measurement_object_id?:string;readonly frequency_cycles_per_pixel?:readonly unknown[];readonly residual_cycles_per_pixel?:unknown;readonly d_spacing?:unknown;readonly d_spacing_unit?:unknown}[];
}
export interface DomainEntry {
 readonly region_index?:number;readonly index?:number;readonly sample_index?:number;readonly index_kind?:string;readonly status?:string;readonly geometry_status?:string;
 readonly measurements?:readonly unknown[];readonly measurement_object_ids?:readonly unknown[];readonly mapping_evidence?:CorrespondenceFrame;
 readonly roi_object_id?:string;readonly view_object_id?:string;readonly fft_object_id?:string;readonly rect?:unknown;readonly rect_xyxy?:unknown;
 readonly invalid_reasons?:readonly string[];readonly center_xy?:readonly unknown[];
 readonly features?:{readonly family_count?:unknown;readonly shortest_period?:unknown;readonly families?:readonly {readonly direction_angle_mod180_degrees?:unknown}[]};
}
export interface DomainCandidate {readonly angle_degrees?:unknown;readonly matched_pairs?:readonly unknown[];readonly max_residual?:unknown;readonly unmatched_reference_family_ids?:readonly unknown[];readonly unmatched_target_family_ids?:readonly unknown[];readonly accepted_descriptive_match?:boolean;}
export interface DomainEvidence {
 readonly kind:string;readonly object_id?:string;readonly coordinate_unit?:string;readonly coordinate_domain?:string;readonly tolerance?:unknown;readonly reference_index?:number;
 readonly overview_object_id?:string;readonly regions?:readonly DomainEntry[];readonly source_entries?:readonly DomainEntry[];readonly samples?:readonly DomainEntry[];
 readonly field_image?:{readonly width:number;readonly height:number;readonly hotspots?:readonly {readonly view_object_id?:string;readonly rect_xyxy:readonly number[];readonly sample_index:number}[]};
 readonly relations?:readonly {readonly target_index:number;readonly status?:string;readonly reason?:string;readonly candidates?:readonly DomainCandidate[]}[];
}
export interface EvidenceNavigation {show?:(objectId:string)=>unknown;onError?:(error:unknown)=>unknown;png?:string|null;}
