import type {ViewObject,RenderedMark,CalibrationView,DisplayPanel,AnnotationPresentation,AnnotationLayoutOptions} from './presentation-contracts.mjs';
import type {ProfileResult} from './data-probe-contracts.mjs';
import type {ObjectId} from './coordinates.mjs';
export interface ScientificAnchor {readonly source_object_id:string;readonly coordinate_space:string;readonly coordinates:readonly number[];}
export interface FigureMark extends RenderedMark {readonly anchor?:ScientificAnchor;}
export interface FigureObject extends ViewObject {
 readonly object_id:string;readonly kind?:string;readonly calibration_record?:CalibrationView;readonly calibration?:CalibrationView;
 readonly display?:Readonly<Record<string,unknown>>;readonly annotations?:readonly FigureMark[];readonly source_shape_yx?:readonly number[];
}
export interface FigureFrameIdentity {readonly frame_object_id?:string;readonly source_object_id?:string;readonly frame_index?:number;}
export interface FigureState {readonly object:FigureObject;readonly frame_identity?:FigureFrameIdentity|null;readonly effective_display?:Readonly<Record<string,unknown>>|null;readonly figure_base?:FigureBase;}
export interface FigureBase {readonly object_id:string;readonly clean_png_sha256:string;readonly clean_png_base64?:string;readonly panels?:readonly DisplayPanel[];readonly scale_bar?:ScaleBarRecord|null;}
export interface ScaleBarRecord {readonly calibration_id?:unknown;readonly signed_scale?:unknown;readonly visible?:boolean;readonly image_endpoints_xyxy?:readonly number[];readonly length?:unknown;readonly unit?:unknown;}
export interface FigurePreferences extends AnnotationLayoutOptions {columns?:string;fontPt?:unknown;legend?:boolean;scaleBar?:boolean;letter?:unknown;readonly [key:string]:unknown;}
export interface FigureIdentity {panels:readonly DisplayPanel[];frame:unknown;anchors:readonly {annotation_id?:string;kind:string;anchor:ScientificAnchor|null;status?:string}[];grid:unknown;calibration:Readonly<Record<string,unknown>>|null;}
export interface FigureRecipe {schema:string;source_object_id:string;source:FigureIdentity;display_recipe:Readonly<Record<string,unknown>>;preferences:FigurePreferences;annotations:readonly {annotation_id?:string;presentation:AnnotationPresentation}[];limitation?:string;}
export interface ImageSlot {kind:'image';title:string;source_object_id:string;recipe:FigureRecipe;asset:{object_id:string;clean_png_sha256:string};scale_bar:ScaleBarRecord|null;}
export interface ProfileSlot {kind:'profile';title:string;object_id:string;scientific_grid_identity:unknown;xy_calibration:CalibrationView|null;}
export type CompositionSlot=ImageSlot|ProfileSlot;
export interface CompositionRecipe {schema:string;layout:string;font_pt:number;slots:CompositionSlot[];roiOutlines?:boolean;showLegend?:boolean;}
export interface SpatialSource {object_id:string;shape_yx:readonly number[];dtype:string;array_sha256:string;frame_identity:FigureFrameIdentity;}
export interface CompositionPanel {readonly slot:CompositionSlot|ShallowCompositionSlot;readonly state?:FigureState;readonly profile?:ProfileResult;readonly clean_png_base64?:string;readonly scale_bar?:ScaleBarRecord|null;readonly spatial_source?:SpatialSource;}

// Legacy composition admission checks containers and selected controls only.
// These records are not a validated producer FigureRecipe or scientific proof.
export interface StoredFigureRecipe extends Readonly<Record<string,unknown>> {
 readonly schema:'mcp-dm-figure-v1';readonly source_object_id:string;
 readonly source:Readonly<Record<string,unknown>> & {readonly anchors:readonly unknown[]};
 readonly display_recipe:unknown;readonly annotations:readonly unknown[];
 readonly preferences:Readonly<Record<string,unknown>> & {readonly preset:'real-space'|'diffraction'|'multi-domain';readonly mode:'analysis'|'figure'};
}
export interface ShallowImageSlot extends Omit<ImageSlot,'recipe'|'scale_bar'> {recipe:StoredFigureRecipe;scale_bar:Readonly<Record<string,unknown>>|null;}
export interface ShallowProfileSlot extends Omit<ProfileSlot,'xy_calibration'|'scientific_grid_identity'> {xy_calibration:Readonly<Record<string,unknown>>|null;scientific_grid_identity:Readonly<Record<string,unknown>>;}
export type ShallowCompositionSlot=ShallowImageSlot|ShallowProfileSlot;
export interface ShallowCompositionRecipe extends Omit<CompositionRecipe,'slots'> {slots:ShallowCompositionSlot[];}
