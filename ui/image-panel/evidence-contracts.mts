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
 readonly scale_pixels?:number;readonly grid_xy?:readonly number[];readonly atlas_object_id?:string;readonly atlas_region_index?:number;
 readonly domain_status?:string;readonly domain_unknown_reason?:string|null;
 readonly features?:{readonly family_count?:unknown;readonly shortest_period?:unknown;readonly families?:readonly {readonly direction_angle_mod180_degrees?:unknown}[]};
}
export interface DomainCandidate {readonly angle_degrees?:unknown;readonly matched_pairs?:readonly unknown[];readonly max_residual?:unknown;readonly unmatched_reference_family_ids?:readonly unknown[];readonly unmatched_target_family_ids?:readonly unknown[];readonly accepted_descriptive_match?:boolean;}
export interface DomainEvidence {
 readonly actions?:readonly ActiveAnalysisAction[];readonly recommended_action_ids?:readonly string[];readonly source_domain_map_id?:string;readonly field_object_id?:string;
 readonly budget?:{readonly used_windows:number;readonly used_fft_pixels:number;readonly remaining_windows:number;readonly remaining_fft_pixels:number};
 readonly stopping?:{readonly stop:boolean;readonly reason:string};
 readonly new_evidence?:{readonly added_fft_pixels?:number};readonly added_observation_keys?:readonly string[];readonly corrected_observation_keys?:readonly string[];
 readonly kind:string;readonly object_id?:string;readonly coordinate_unit?:string;readonly coordinate_domain?:string;readonly tolerance?:unknown;readonly reference_index?:number;
 readonly overview_object_id?:string;readonly regions?:readonly DomainEntry[];readonly source_entries?:readonly DomainEntry[];readonly samples?:readonly DomainEntry[];
 readonly field_image?:{readonly width:number;readonly height:number;readonly hotspots?:readonly {readonly view_object_id?:string;readonly rect_xyxy:readonly number[];readonly sample_index:number}[]};
 readonly relations?:readonly {readonly target_index:number;readonly status?:string;readonly reason?:string;readonly candidates?:readonly DomainCandidate[]}[];
 readonly edges?:readonly SpatialDomainEdge[];readonly domains?:readonly SpatialDomainCandidate[];
 readonly boundary_bands?:readonly {readonly edge_index:number;readonly sample_indices:readonly number[];readonly rect_xyxy:readonly number[]}[];
 readonly unknown_sample_indices?:readonly number[];
}
export interface ActiveAnalysisAction {readonly action_id:string;readonly observation_key:string;readonly rect_xyxy:readonly number[];readonly scale_pixels:number;readonly heuristic_score:number;readonly exploration:boolean;readonly reason_codes:readonly string[];readonly estimated_cost:{readonly new_windows:number;readonly fft_pixels:number};}
export interface SpatialDomainRelation {readonly status:string;readonly accepted_angles_degrees?:readonly number[];readonly candidates?:readonly DomainCandidate[];}
export interface SpatialDomainEdge {
 readonly edge_index:number;readonly sample_indices:readonly number[];readonly status:'compatible'|'different'|'unknown';
 readonly orientation:SpatialDomainRelation;readonly lattice_geometry:SpatialDomainRelation;readonly boundary_band_xyxy?:readonly number[]|null;
}
export interface SpatialDomainCandidate {readonly domain_id:string;readonly sample_indices:readonly number[];readonly status:'candidate';readonly support_rects:readonly (readonly number[])[];}

// Validate the bounded F1a projection at the Node/Panel boundary as well as in
// Python. The browser never derives geometry from a display image or unchecked
// field coordinates. Existing R3 evidence retains its established contract.
export function validateSpatialDomainEvidence(value:unknown):asserts value is DomainEvidence {
 const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const need:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new Error('Invalid spatial domain evidence: '+message);};
 const integer=(x:unknown,min:number,max:number):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
 const tuple=(x:unknown,length:number):x is number[]=>Array.isArray(x)&&x.length===length&&x.every(n=>typeof n==='number'&&Number.isFinite(n));
 const rect=(x:unknown):x is number[]=>tuple(x,4)&&x.every(n=>integer(n,0,4194304))&&x[2]!>x[0]!&&x[3]!>x[1]!;
 const id=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 need(record(value),'record required');
 need(['spatial_field','field_extend','analysis_candidates','domain_map'].includes(String(value.kind)),'kind');
 need(id(value.object_id)&&id(value.overview_object_id),'saved object/overview identity');
 need(value.coordinate_domain==='pixel'||value.coordinate_domain==='physical','coordinate domain');
 const samples=value.samples;need(Array.isArray(samples)&&samples.length>=1&&samples.length<=32,'1..32 samples');
 const indices=new Set<number>();
 for(const row of samples){
  need(record(row)&&integer(row.sample_index,0,31)&&!indices.has(row.sample_index),'unique sample index');indices.add(row.sample_index);
  need(integer(row.scale_pixels,4,1024)&&tuple(row.grid_xy,2)&&row.grid_xy.every(n=>integer(n,0,4194304)),'sampling scale/grid');
  need(rect(row.rect_xyxy)&&tuple(row.center_xy,2),'source rectangle/centre');
  for(const name of ['fft_object_id','roi_object_id','view_object_id','atlas_object_id'])need(id(row[name]),'saved '+name);
  need(integer(row.atlas_region_index,0,7),'atlas region');
 }
 const pair=(x:unknown):x is number[]=>tuple(x,2)&&x.every(n=>indices.has(n))&&x[0]!==x[1];
 const members=(x:unknown):x is number[]=>Array.isArray(x)&&x.length>=1&&x.length<=32&&x.every(n=>typeof n==='number'&&indices.has(n))&&new Set(x).size===x.length;
 const map=value.field_image;need(record(map)&&integer(map.width,1,4096)&&integer(map.height,1,4096),'image dimensions');
 need(Array.isArray(map.hotspots)&&map.hotspots.length<=32,'bounded hotspots');
 for(const hit of map.hotspots){need(record(hit)&&integer(hit.sample_index,0,31)&&indices.has(hit.sample_index)&&id(hit.view_object_id)&&tuple(hit.rect_xyxy,4),'hotspot');const r=hit.rect_xyxy;need(r[0]!>=0&&r[1]!>=0&&r[2]!>r[0]!&&r[3]!>r[1]!&&r[2]!<=map.width&&r[3]!<=map.height,'hotspot bounds');}
 if(value.kind==='analysis_candidates'){
  need(id(value.field_object_id)&&id(value.source_domain_map_id),'proposal source identities');
  need(record(value.stopping)&&typeof value.stopping.stop==='boolean'&&typeof value.stopping.reason==='string'&&value.stopping.reason.length<=2000,'stop evidence');
  need(record(value.budget)&&integer(value.budget.used_windows,0,32)&&integer(value.budget.remaining_windows,0,32)&&integer(value.budget.used_fft_pixels,0,4194304)&&integer(value.budget.remaining_fft_pixels,0,4194304),'bounded proposal budget');
  need(Array.isArray(value.actions)&&value.actions.length<=8,'bounded proposed actions');const actionIds=new Set<string>();
  for(const action of value.actions){
   need(record(action)&&id(action.action_id)&&!actionIds.has(action.action_id),'unique action');actionIds.add(action.action_id);
   need(typeof action.observation_key==='string'&&/^[a-f0-9]{64}$/.test(action.observation_key)&&rect(action.rect_xyxy)&&integer(action.scale_pixels,4,1024),'action source geometry');
   need(action.rect_xyxy[2]!-action.rect_xyxy[0]===action.scale_pixels&&action.rect_xyxy[3]!-action.rect_xyxy[1]===action.scale_pixels,'square action scale');
   need(typeof action.heuristic_score==='number'&&Number.isFinite(action.heuristic_score)&&typeof action.exploration==='boolean','finite heuristic');
   need(Array.isArray(action.reason_codes)&&action.reason_codes.length<=32&&action.reason_codes.every(code=>typeof code==='string'&&code.length<=2000),'action reasons');
   need(record(action.estimated_cost)&&action.estimated_cost.new_windows===1&&action.estimated_cost.fft_pixels===action.scale_pixels**2,'actual estimated work');
  }
  need(Array.isArray(value.recommended_action_ids)&&value.recommended_action_ids.length<=4&&new Set(value.recommended_action_ids).size===value.recommended_action_ids.length&&value.recommended_action_ids.every(id=>typeof id==='string'&&actionIds.has(id)),'recommended action references');
  if(value.stopping.stop)need(value.actions.length===0&&value.recommended_action_ids.length===0,'stopped proposal cannot submit actions');
 }
 if(value.kind==='field_extend'){
  need(record(value.new_evidence)&&integer(value.new_evidence.added_fft_pixels,0,4194304),'increment work');
  for(const name of ['added_observation_keys','corrected_observation_keys'])need(Array.isArray(value[name])&&(value[name] as unknown[]).length<=32&&(value[name] as unknown[]).every(key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key)),'increment observation keys');
 }
 if(value.kind!=='domain_map')return;
 need(typeof value.tolerance==='number'&&Number.isFinite(value.tolerance)&&value.tolerance>0,'finite positive tolerance');
 const edges=value.edges;need(Array.isArray(edges)&&edges.length<=512,'bounded edges');
 const edgeIndices=new Set<number>();
 for(const edge of edges){
  need(record(edge)&&integer(edge.edge_index,0,511)&&!edgeIndices.has(edge.edge_index)&&pair(edge.sample_indices),'edge identity');edgeIndices.add(edge.edge_index);
  need(['compatible','different','unknown'].includes(String(edge.status)),'edge status');
  for(const name of ['orientation','lattice_geometry']){
   const relation=edge[name];need(record(relation)&&typeof relation.status==='string','saved '+name+' relation');
   if(relation.accepted_angles_degrees!==undefined)need(Array.isArray(relation.accepted_angles_degrees)&&relation.accepted_angles_degrees.length<=64&&relation.accepted_angles_degrees.every(x=>typeof x==='number'&&Number.isFinite(x)),'finite accepted angles');
  }
  if(edge.boundary_band_xyxy!==undefined&&edge.boundary_band_xyxy!==null)need(rect(edge.boundary_band_xyxy),'edge support band');
 }
 const domains=value.domains;need(Array.isArray(domains)&&domains.length<=32,'bounded candidate domains');
 for(const domain of domains){need(record(domain)&&typeof domain.domain_id==='string'&&domain.domain_id.length<=64&&domain.status==='candidate'&&members(domain.sample_indices),'candidate domain');need(Array.isArray(domain.support_rects)&&domain.support_rects.length<=32&&domain.support_rects.every(rect),'candidate support');}
 need(Array.isArray(value.unknown_sample_indices)&&value.unknown_sample_indices.length<=32&&value.unknown_sample_indices.every(x=>typeof x==='number'&&indices.has(x)),'unknown sample mask');
 const bands=value.boundary_bands;need(Array.isArray(bands)&&bands.length<=512,'bounded boundary bands');
 for(const band of bands)need(record(band)&&integer(band.edge_index,0,511)&&edgeIndices.has(band.edge_index)&&pair(band.sample_indices)&&rect(band.rect_xyxy),'boundary support');
}
export interface EvidenceNavigation {show?:(objectId:string)=>unknown;onError?:(error:unknown)=>unknown;png?:string|null;}
