// Checked presentation contracts. Opaque scientific fields are never qualified
// by a label/table projection; provider and HTTP guards remain authoritative.
import type {WirePanel,Rectangle,XY} from './coordinates.mjs';
export type DisplayPanel = WirePanel & {readonly source_rect_xyxy?:Rectangle;readonly fft_shape_yx?:XY;readonly fft_rect_xyxy?:Rectangle};
export interface ViewTransform {scale: number; x: number; y: number;}
export interface CalibrationView {
 readonly calibration_id?: string; readonly revision?: unknown; readonly source_text?: unknown;
 readonly source?: unknown; readonly status?: string; readonly coordinate_domain?: string;
 readonly dc_index_xy?: readonly number[]; readonly uncertainty?: unknown;
 readonly xy_scale?: {readonly x?: unknown;readonly y?: unknown;readonly unit?: unknown;readonly uncertainty?: unknown};
}
export interface ScientificGridView {readonly source_rect_xyxy?: readonly number[];readonly [key: string]: unknown;}
export interface AnnotationLabel {
 measurement_object_id?:string;measurement_kind?:string;readonly text?: unknown; readonly offset?: readonly number[] | null; readonly font_size?: unknown;
 readonly important?: boolean; readonly leader?: boolean;readonly pinned?: boolean;readonly visible?: boolean;readonly figure_visible?: boolean;
}
export interface AnnotationPresentation {
 readonly category?: string;readonly layer?: string;readonly geometry_visible?: boolean;readonly marker_shape?: string;
 readonly marker_radius?: unknown;readonly line_width?: unknown;readonly label?: AnnotationLabel;
}
export interface RenderedMark {
 readonly annotation_id?: string;readonly id?: string;readonly kind: string;readonly coordinates: readonly number[];
 readonly arrow_render_coordinates?: readonly number[];readonly text?: unknown;readonly color?: string;
 readonly status?: string;readonly visibility?: string;readonly presentation?: AnnotationPresentation;
 readonly [key: string]: unknown;
}
export interface ViewObject {
 readonly object_id?: string;readonly panels?: readonly DisplayPanel[];readonly annotations?: readonly RenderedMark[];
 readonly scientific_grid_identity?: unknown;readonly dtype?: string;readonly xy_calibration?: CalibrationView;
 readonly [key: string]: unknown;
}
export interface ViewportSnapshot extends ViewObject {readonly object?: ViewObject;readonly frame_identity?: {readonly frame_object_id?: string}|null;}
export interface WorkflowState {readonly object?: ViewObject;readonly frame_identity?: {readonly frame_object_id?: string}|null;readonly state_revision?: number;}
export interface PickedSelection {readonly panel?: {readonly domain?: string};readonly kind?: string;readonly coordinates?: readonly number[];}
export interface HistoryEntry {kind: string;label: string;scope: string | undefined;before: unknown;after: unknown;}
export interface SavedViewEntry {id: string;frame: string | null;scope?: string;role: string;freshSourceView?: boolean;}
export interface MeasurementScope {
 readonly frame_index?: unknown;readonly source_rect_xyxy?: readonly number[];readonly scientific_grid_identity?: ScientificGridView;
}
export interface MeasurementRecord {
 readonly object_id?: string;readonly parent_object_id?: string;readonly request_id?: string;readonly points?: readonly (readonly number[])[];
 readonly coordinate_space?: string;readonly measurement_domain?: string;readonly dc_reference_point_index?: unknown;
 readonly physical_distance?: unknown;readonly distance_physical?: unknown;readonly physical_unit?: unknown;
 readonly physical_frequency_magnitude?: unknown;readonly physical_frequency_unit?: unknown;
 readonly d_spacing?: unknown;readonly d_spacing_unit?: unknown;readonly period?: unknown;readonly period_unit?: unknown;
 readonly distance_pixels?: unknown;readonly frequency_distance_cycles_per_pixel?: unknown;readonly frame_index?: unknown;
 readonly source_rect_xyxy?: readonly number[];readonly xy_calibration?: CalibrationView;readonly calibration_record?: CalibrationView;
 readonly scientific_grid_identity?: ScientificGridView;readonly uncertainty_status?: unknown;
}
export interface MeasurementEntry extends MeasurementRecord {
 readonly measurement?: MeasurementRecord;readonly name?: string;readonly annotation_name?: string;readonly annotation_id?: string;
 readonly status?: string;readonly status_reason?: unknown;readonly source?: MeasurementScope;readonly scope?: MeasurementScope;
 readonly same_grid?: boolean;readonly visible_in_current_view?: boolean;readonly annotation_matches_current?: boolean;
 readonly can_remeasure?: boolean;readonly measurement_manifest_sha256?: string;readonly manifest_sha256?: string;
}
export interface MeasurementCurrent extends MeasurementScope {
 readonly object_id?: string;readonly xy_calibration?: CalibrationView;readonly shape_yx?: readonly number[];readonly dtype?: string;
 readonly source_identity?: string | {readonly path?: string;readonly kind?: unknown};readonly source_path?: string;
 readonly provenance?: {readonly data_meaning?: unknown};readonly user_context?: {readonly data_meaning?: unknown};
 readonly data_meaning?: unknown;readonly source_kind?: string;readonly provenance_type?: unknown;readonly domain?: string;readonly array_domain?: string;
}
export interface MeasurementResponse {readonly current?: MeasurementCurrent;readonly entries?: MeasurementEntry[];readonly measurements?: MeasurementEntry[];readonly truncated?: unknown;}
export interface MeasurementDisplayValue {kind: string;label: string;value: number;unit: string;}
export type DetailRows = readonly (readonly [string,unknown])[];
// Minimal DOM ports are structural subsets of the actual browser APIs used here.
// They also permit the existing deterministic document fixtures without a DOM lib.
export interface PresentationEvent {readonly key: string;stopPropagation(): void;preventDefault(): void;}
export interface PresentationElement {
 textContent: string | null;checked: boolean;value: string;hidden: boolean;disabled: boolean;tabIndex: number;type: string;href: string;download: string;
 dataset: Record<string,string | undefined>;classList: {toggle(name: string,force?: boolean): unknown};
 onchange: (()=>unknown) | null;onclick: ((event: PresentationEvent)=>unknown) | null;onkeydown: ((event: PresentationEvent)=>unknown) | null;
 replaceChildren(): void;append(...children: PresentationElement[]): void;setAttribute(name: string,value: string): void;
 querySelector(selector: string): PresentationElement | null;scrollIntoView?(options: {block: string}): void;click(): void;
}
export interface PresentationDocument {getElementById(id: string): PresentationElement | null;createElement(tag: string): PresentationElement;}
export interface PresentationHost {readonly document?: PresentationDocument;readonly navigator?: {readonly clipboard?: {writeText?(text: string): PromiseLike<void>}};}
export interface BlobPort {readonly size?: number;}
export interface BlobConstructorPort {new(parts: readonly string[],options: {type: string}): BlobPort;}
export interface URLPort {createObjectURL(blob: BlobPort): string;revokeObjectURL(url: string): void;}

export interface Box {x: number;y: number;width: number;height: number;}
export interface LabelLayout extends Box {text: string;fontSize: number;leader: boolean;pinned: boolean;visible: boolean;offset: number[] | null;important: boolean;}
export interface AnnotationLayoutItem {
 id: string | undefined;mark: RenderedMark;shape: string;color: string;radius: number;lineWidth: number;geometryVisible: boolean;
 selected: boolean;hovered: boolean;layer: string;category: string;anchor: number[];coordinates: number[];dash: number[];label: LabelLayout;
}
export interface AnnotationLegend {key: string;label: string;color: string;shape: string;status: string;layer: string;dash: number[];}
export interface AnnotationLayout {items: AnnotationLayoutItem[];legend: AnnotationLegend[];suggestedUpdates: {id: string | undefined;presentation: AnnotationPresentation}[];mode: string;preset: string;scale: number;width: number;height: number;}
export interface AnnotationLayoutOptions {preset?: string;mode?: string;scale?: unknown;width?: unknown;height?: unknown;layers?: Readonly<Record<string,boolean>>;selectedId?: string;hoverId?: string;arrange?: boolean;}
export interface FigureLayoutOptions {
 fontSize?: unknown;letter?: unknown;legend?: boolean;showLegend?: boolean;legendFontSize?: unknown;legendColumns?: number;legendX?: unknown;legendY?: unknown;
 scaleBar?: {readonly x: number;readonly y: number;readonly length: number;readonly color?: string;readonly font_size?: unknown;readonly label?: unknown} | null;
}
