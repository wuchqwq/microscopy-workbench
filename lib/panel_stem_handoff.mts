// Small read-only projection of the existing Panel source/selection contract.
// Roles, modality, column geometry and scientific interpretation are not inferred.
import {panelRoiHandoff} from './panel_roi_handoff.mjs';
import type {PanelRoiSnapshot} from '../ui/image-panel/roi-observations.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):Row|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:null;
export function panelStemHandoff(state:PanelRoiSnapshot,handoff=panelRoiHandoff(state)){
 const selected=row(state.selection),panels=Array.isArray(state.object.panels)?state.object.panels:[];
 const frame=handoff.scientific_input.frame_object_id;
 const base={schema_version:1,read_only:true,source_view_object_id:state.object.object_id,
  state_revision:handoff.state_revision,draft_revision:row(state.edit_state)?.draft_revision??null,
  scientific_input_reference:'roi_handoff.scientific_input',interaction_gate_reference:'roi_handoff.interaction_gate',
  region_roles:'unassigned: host must retain the user-selected target and explicitly chosen references',
  region_catalog_reference:'roi_handoff.saved_rectangles',current_region_reference:'roi_handoff.current_selection',
  expected_position_proposal:null as null|{position_xy:number[];source_object_id:string;coordinate_space:'source_pixels'},
  profile_proposal:null as null|{points:number[][];source_object_id:string;coordinate_space:'source_pixels'},
  selection_status:'no_point_or_line',
  semantics:'Original source coordinates only; a selected point is a supplied prior, never a localized atom. Rectangles are unassigned supports, never automatically equivalent references. This snapshot dispatches nothing. Re-read exact view/draft before presentation.',
  s2:{execution:'not_dispatched',requires:['explicit HAADF/ADF acquisition_context with source','independent Poisson count meaning with source; normalized abTEM intensities are not counts','fixed 5x5 target and every reference, supplied column centres/common sigma and 9x9 support'],
   limits:'Conditional amplitudes only; no automatic atom/element/defect finding, dumbbell resolution test or confidence interval.'}};
 if(!selected||!['point','line'].includes(String(selected.kind)))return base;
 const coordinates=selected.coordinates,selectedPanel=row(selected.panel);
 const matches=panels.map(row).filter(p=>p?.domain==='spatial_pixels'&&p.source_object_id===frame&&
  JSON.stringify(p.source_rect_xyxy)===JSON.stringify(selectedPanel?.source_rect_xyxy)&&
  JSON.stringify(p.image_rect_xyxy)===JSON.stringify(selectedPanel?.image_rect_xyxy));
 const support=matches[0]?.source_rect_xyxy;
 if(!frame||!handoff.scientific_input.usable||selected.coordinate_space!=='source_pixels'||selected.source_object_id!==frame||
    selectedPanel?.domain!=='spatial_pixels'||selectedPanel?.source_object_id!==frame||matches.length!==1||
    !Array.isArray(support)||support.length!==4||!support.every(n=>typeof n==='number'&&Number.isFinite(n))||
    !Array.isArray(coordinates)||coordinates.length!==(selected.kind==='point'?2:4)||!coordinates.every(n=>typeof n==='number'&&Number.isFinite(n)))
  return {...base,selection_status:'unusable_source_or_mapping'};
 const values=coordinates as number[],bounds=support as number[];
 const points=Array.from({length:values.length/2},(_,i)=>values.slice(i*2,i*2+2));
 if(!points.every(([x,y])=>bounds[0]<=x&&x<=bounds[2]-1&&bounds[1]<=y&&y<=bounds[3]-1))
  return {...base,selection_status:'outside_source_centres_no_clipping'};
 if(handoff.interaction_gate.status!=='ready')return {...base,selection_status:'blocked_or_unknown_draft'};
 if(selected.kind==='point')return {...base,selection_status:'supplied_expected_position',
  expected_position_proposal:{position_xy:[...values],source_object_id:frame,coordinate_space:'source_pixels' as const}};
 return {...base,selection_status:'supplied_profile_line',
  profile_proposal:{points,source_object_id:frame,coordinate_space:'source_pixels' as const}};
}
