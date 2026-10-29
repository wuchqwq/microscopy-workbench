import type {FigureState,FigureObject,FigureMark,ScientificAnchor,FigurePreferences,FigureBase,FigureRecipe,CompositionPanel,CompositionRecipe,CompositionSlot,ShallowCompositionSlot} from './figure-contracts.mjs';
import type {AnnotationPresentation,AnnotationLabel,MeasurementRecord,CalibrationView,ViewTransform,DisplayPanel} from './presentation-contracts.mjs';
import type {NumericReply,ProfileResult,ProbeResult} from './data-probe-contracts.mjs';
import type {SequenceEvidence,DomainEvidence} from './evidence-contracts.mjs';
import type {WirePanel,WireSelection,XY,SelectionKind,ScientificCoordinateSpace,CoordinateArray,ObjectId} from './coordinates.mjs';
export interface AppAnchor extends ScientificAnchor {readonly coordinate_space:ScientificCoordinateSpace;readonly coordinates:readonly number[];}
export interface AppMark extends FigureMark {readonly kind:SelectionKind;readonly anchor?:AppAnchor;}
export interface AppDisplay extends Readonly<Record<string,unknown>> {readonly gamma?:number;readonly display_range?:readonly number[];readonly spectrum_axes?:boolean;readonly scale_bar?:boolean;readonly component?:string;}
export interface AppCalibration extends CalibrationView {readonly scope?:string;readonly source_type?:string;readonly x?:unknown;readonly y?:unknown;readonly unit?:unknown;}
export interface AppObject extends FigureObject {readonly annotations:readonly AppMark[];readonly panels:readonly DisplayPanel[];readonly display?:AppDisplay;readonly scale_bar?:import('./figure-contracts.mjs').ScaleBarRecord;readonly xy_calibration?:AppCalibration;readonly calibration_record?:AppCalibration;readonly calibration?:AppCalibration;}
export interface AppOperation extends NumericReply,Omit<MeasurementRecord,'scientific_grid_identity'> {readonly annotation_id?:string;readonly annotation_ids?:readonly string[];readonly action?:string;readonly output_dir?:string;}
export interface AppState extends Omit<FigureState,'object'|'effective_display'> {
 [key:string]:unknown;
 object:AppObject;state_revision:number;effective_display?:AppDisplay|null;selection?:AppSelection|null;last_operation?:AppOperation|null;
 source_identity?:{readonly label?:string;readonly filename?:string};tools:readonly {readonly name:string}[];
 numeric_results?:Partial<Record<'statistics'|'profile',ProfileResult|null>>;numeric_result_recovery?:{readonly state?:string;readonly results?:Readonly<Record<string,{readonly state?:string}>>};
 png_base64?:string|null;clean_png_base64?:string|null;domain_png_base64?:string|null;clean_png_sha256?:string|null;
 sequence_evidence?:SequenceEvidence|null;domain_evidence?:DomainEvidence|null;render_base_id?:string;display_source_object_id?:string;
 pending_result?:{readonly object_id?:string;readonly request_id?:string}|null;research_observation?:{readonly authority?:string;readonly source_text?:string;readonly current_view_relation?:string}|null;
 edit_state?:{readonly dirty?:boolean;readonly draft_revision?:number;readonly annotation_edit?:Readonly<Record<string,unknown>>|null};auto_edit_committed?:boolean;
 figure_base?:FigureBase;
}
type EditableSelection<S extends WireSelection> = S extends WireSelection ? Omit<S,'coordinates'>&{coordinates:readonly number[];rendered?:readonly number[]}:never;
export type AppSelection=EditableSelection<WireSelection>;
export interface DisplayDraft {gamma:number;low:string;high:string;axes:boolean;scale:boolean;}
export interface AnnotationEdit {annotation_id:string|undefined;coordinates?:readonly number[];text?:unknown;color?:string;status?:string;presentation?:AnnotationPresentation;presentation_replace?:boolean;note?:string;[key:string]:unknown;}
export interface CompleteAnnotationEdit extends AnnotationEdit {coordinates:readonly number[];presentation:AnnotationPresentation;text:unknown;}
export interface QueuedEdit {update:CompleteAnnotationEdit;sequence:number;geometryRevision:number;geometryChanged:boolean;numericLabel:AnnotationLabel|null|undefined;}
export interface SelectionSnapshot {draft:AppSelection|null;selectedId:string;}
export interface LocalSnapshot extends SelectionSnapshot {editCoordinates:readonly number[]|null;labelDraft:AnnotationPresentation|null;fieldDirty:boolean;display:DisplayDraft;fields:{id:string;text:string;color:string;status:string};}
export type AppHistoryEntry=({kind:'annotation';before:AnnotationEdit;after:AnnotationEdit}|{kind:'display';before:DisplayDraft;after:DisplayDraft}|{kind:'selection';before:SelectionSnapshot;after:SelectionSnapshot})&{label:string;scope:string|undefined};
export interface MeasurementTarget {previousMeasurement?:string;id:string|undefined;submittedObject:string;savedObject:string;sequence:number;geometryRevision:number;anchor:AppAnchor;kind:SelectionKind;status?:string;panel:WirePanel;calibration:CalibrationView|null;numericLabel:AnnotationLabel|null|undefined;request_id?:string|null;}
export interface DraftPublication extends Readonly<Record<string,unknown>> {expected_object_id:string;action:'draft';lightweight:true;params:Readonly<Record<string,unknown>>;urgent?:boolean;}
interface GestureSlots {pointerId?:number;start?:XY;end?:XY;originalStart?:XY;startClient?:XY;originalView?:ViewTransform;mark?:AppMark;p?:WirePanel;edges?:boolean;handle?:number;original?:readonly number[];before?:CompleteAnnotationEdit|null;previousEdit?:readonly number[]|null;originalOffset?:readonly number[];labelSize?:readonly number[];anchor?:readonly number[];selectionBefore?:SelectionSnapshot;blankSelect?:boolean;}
export type DragState=(GestureSlots&{kind:'pan';pointerId:number;startClient:XY;originalView:ViewTransform})|(GestureSlots&{kind:'label';pointerId:number;start:XY;end:XY;originalOffset:readonly number[];labelSize:readonly number[];anchor:readonly number[]})|(GestureSlots&{kind:'edit';start:XY;end:XY;mark:AppMark;p:WirePanel;edges:boolean;handle:number;original:readonly number[];previousEdit:readonly number[]|null})|(GestureSlots&{kind:SelectionKind;start:XY;end:XY;originalStart:XY;p:WirePanel;selectionBefore:SelectionSnapshot;blankSelect:boolean});
export interface ActionParams extends Readonly<Record<string,unknown>> {source_view?:boolean;}
export type CompositionDraft=Omit<CompositionRecipe,'slots'>&{slots:(CompositionSlot|ShallowCompositionSlot)[]};
export interface StatefulActionRequest extends Readonly<Record<string,unknown>> {action:string;lightweight?:false;}
export interface AppDraftAck {object_id?:string;state_revision?:number;edit_state?:AppState['edit_state'];selection?:AppSelection|null;}
export interface AppRevision {state_revision:number;object_id:string;pending_result?:AppState['pending_result'];}
// The same-server remote port describes UI metadata only; numerical/calibration
// fields remain opaque and the existing runtime identity/grid guards still run.
export interface PanelBrowserAPI {
 (url:'/api/probe',body:Readonly<Record<string,unknown>>):Promise<ProbeResult>;
 (url:'/api/composition/resolve',body:Readonly<Record<string,unknown>>):Promise<{panels:CompositionPanel[]}>;
 (url:`/api/measurements${string}`,body?:Readonly<Record<string,unknown>>):Promise<import('./presentation-contracts.mjs').MeasurementResponse>;
 (url:'/api/action',body:DraftPublication):Promise<AppDraftAck>;
 (url:'/api/action',body:StatefulActionRequest):Promise<AppState>;
 (url:'/api/state'):Promise<AppState>;
 (url:'/api/revision'):Promise<AppRevision>;
 (url:string,body?:Readonly<Record<string,unknown>>):Promise<unknown>;
}
