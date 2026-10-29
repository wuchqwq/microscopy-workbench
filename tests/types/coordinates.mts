import {coordinateSpace, transformCoordinates, selectionRectangle} from '../../ui/image-panel/coordinates.mjs';
import type {ObjectId, CoordinateArray, FrequencyPanel, SpatialPanel, Selection} from '../../ui/image-panel/coordinates.mjs';

declare const id: ObjectId;
const frequency: FrequencyPanel = {domain: 'frequency', source_object_id: id, image_rect_xyxy: [0, 0, 100, 100], fft_shape_yx: [32, 32]};
const spatial: SpatialPanel = {domain: 'spatial_pixels', source_object_id: id, image_rect_xyxy: [0, 0, 100, 100], source_rect_xyxy: [0, 0, 32, 32]};
const cycles = transformCoordinates([10, 20], frequency);
const pixelCentres = transformCoordinates([10, 20], spatial);
const pixelEdges = transformCoordinates([10, 20], spatial, {edges: true});
const display = transformCoordinates(cycles, frequency, {inverse: true});
const allowed: CoordinateArray<'display_pixels'> = display;
void allowed;
// @ts-expect-error source-pixel centres cannot be used as reciprocal cycles/pixel
const wrongSpace: typeof cycles = pixelCentres;
// @ts-expect-error ROI pixel edges cannot be used as pixel centres
const wrongSampling: typeof pixelCentres = pixelEdges;
// @ts-expect-error a display-domain tag is distinct from the scientific array
const wrongDirection: typeof cycles = display;
// @ts-expect-error object references require the boundary's object-ID type
const wrongIdentity: ObjectId = 'request-1';
// @ts-expect-error a spatial panel cannot claim the frequency coordinate space
const wrongSelection: Selection = {kind: 'point', coordinate_space: 'frequency_cycles_per_pixel', source_object_id: id, coordinates: cycles, panel: spatial};
// @ts-expect-error a frequency panel needs its original FFT grid
const missingGrid: FrequencyPanel = {domain: 'frequency', source_object_id: id, image_rect_xyxy: [0, 0, 100, 100]};
const selected = {kind: 'rectangle' as const, coordinate_space: coordinateSpace(frequency), source_object_id: id, coordinates: cycles, panel: frequency};
const binEdges = selectionRectangle(selected);
// @ts-expect-error snapped processing-bin edges are not reciprocal sample centres
const wrongBins: typeof cycles = binEdges;
void [wrongSpace, wrongSampling, wrongDirection, wrongIdentity, wrongSelection, missingGrid, wrongBins];
