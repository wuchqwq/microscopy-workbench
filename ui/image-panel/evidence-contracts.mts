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
 readonly kind:string;readonly object_id?:string;readonly coordinate_unit?:string;readonly coordinate_domain?:string;readonly tolerance?:unknown;readonly reference_index?:number;
 readonly overview_object_id?:string;readonly regions?:readonly DomainEntry[];readonly source_entries?:readonly DomainEntry[];readonly samples?:readonly DomainEntry[];
 readonly field_image?:{readonly width:number;readonly height:number;readonly hotspots?:readonly {readonly view_object_id?:string;readonly rect_xyxy:readonly number[];readonly sample_index:number}[]};
 readonly relations?:readonly {readonly target_index:number;readonly status?:string;readonly reason?:string;readonly candidates?:readonly DomainCandidate[]}[];
 readonly edges?:readonly SpatialDomainEdge[];readonly domains?:readonly SpatialDomainCandidate[];
 readonly boundary_bands?:readonly {readonly edge_index:number;readonly sample_indices:readonly number[];readonly rect_xyxy:readonly number[]}[];
 readonly unknown_sample_indices?:readonly number[];
}
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
 need(value.kind==='spatial_field'||value.kind==='domain_map','kind');
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
