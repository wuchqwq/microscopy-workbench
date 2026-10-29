import {zoomAt,hitMark,DraftHistory} from '../../ui/image-panel/viewer-state.mjs';
import {layoutAnnotations} from '../../ui/image-panel/annotation-presentation.mjs';
import {measurementValues,MeasurementWorkspace} from '../../ui/image-panel/measurement-workspace.mjs';
import type {CalibrationView,MeasurementEntry,RenderedMark,ViewportSnapshot} from '../../ui/image-panel/presentation-contracts.mjs';
import type {ObjectId} from '../../ui/image-panel/coordinates.mjs';

declare const id: ObjectId;
const snapshot: ViewportSnapshot = {object:{object_id:id,panels:[{domain:'frequency',source_object_id:id,image_rect_xyxy:[0,0,64,64],fft_shape_yx:[32,32]}]}};
void snapshot;
// @ts-expect-error frequency panels still need the original FFT grid
const missingGrid: ViewportSnapshot = {panels:[{domain:'frequency',source_object_id:id,image_rect_xyxy:[0,0,64,64]}]};
// @ts-expect-error the viewport transform requires numeric scale
zoomAt({scale:'1',x:0,y:0},[0,0],2);

const mark = {kind:'line',coordinates:[0,0,1,1],annotation_id:'saved-line',binding:'immutable-result'} as const;
const hit=hitMark([mark],[0,0]);
const binding: 'immutable-result' | undefined=hit?.mark.binding;
const layout=layoutAnnotations([mark]);
const width: number | undefined=layout.items[0]?.label.width;
// @ts-expect-error layout and hit tests cannot mutate saved scientific geometry
layout.items[0].mark.coordinates[0]=4;
declare const opaque: unknown;
// @ts-expect-error an unchecked JSON payload is not a rendered annotation
const invalidMark: RenderedMark=opaque;

// Legacy descriptive fields remain readable without treating them as numeric
// calibration proof. Existing runtime finite checks qualify table values.
const calibration: CalibrationView={revision:'legacy',xy_scale:{x:'unknown',y:null,unit:'nm'}};
const entry: MeasurementEntry={xy_calibration:calibration,distance_pixels:'unknown',physical_distance:opaque};
const values=measurementValues(entry);
const projected: number | undefined=values[0]?.value;
// @ts-expect-error a display calibration cannot bypass scientific boundary validation
const calibratedX: number=calibration.xy_scale!.x;
// @ts-expect-error a measurement's unvalidated physical field is opaque
const physicalDistance: number=entry.physical_distance;
// @ts-expect-error the Panel response must be checked before becoming entries
new MeasurementWorkspace({api:async()=>({entries:'unchecked payload'})});

const history=new DraftHistory({selection:{kind:'point'}});
// @ts-expect-error JSON history is not proof of the current scientific snapshot
const assumedSnapshot: ViewportSnapshot=history.current;
void [missingGrid,binding,width,invalidMark,projected,calibratedX,physicalDistance,assumedSnapshot];
