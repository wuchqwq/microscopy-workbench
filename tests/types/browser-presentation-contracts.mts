import {profilePlot,profileReadout} from '../../ui/image-panel/data-probes.mjs';
import {validateComposition} from '../../ui/image-panel/figure-composer.mjs';
import {figureDisplayParameters,readFigureRecipe} from '../../ui/image-panel/figure-export.mjs';
import type {ProfileResult} from '../../ui/image-panel/data-probe-contracts.mjs';
import type {CompositionRecipe,CompositionSlot} from '../../ui/image-panel/figure-contracts.mjs';
declare const result:ProfileResult;
const readout=profileReadout(result,0);
// @ts-expect-error a saved sample is opaque until the finite-value check
const unverified:number=readout!.value;
const plot=profilePlot(result);
const ordinate:number|undefined=plot.range?.ymin;
// @ts-expect-error profile slots cannot substitute an image object for its result
const wrongSlot:CompositionSlot={kind:'profile',title:'Profile',source_object_id:'source'};
// @ts-expect-error composition layout requires every explicit slot and font
const incompleteRecipe:CompositionRecipe={schema:'microscopy-figure-composition-v1',layout:'2x2'};
const checkedDisplay=figureDisplayParameters({gamma:'unchecked'},[]);
// @ts-expect-error validated display controls cannot claim a text gamma
const invalidGamma:string=checkedDisplay.gamma;
void [unverified,ordinate,wrongSlot];

const shallow=validateComposition({});
const shallowSlot=shallow.slots[0];
if(shallowSlot.kind==='image'){
 // @ts-expect-error shallow legacy admission does not validate scientific anchors
 const scientificAnchor:import('../../ui/image-panel/figure-contracts.mjs').ScientificAnchor=shallowSlot.recipe.source.anchors[0];
 // @ts-expect-error the old guard does not validate every annotation presentation
 const annotation:import('../../ui/image-panel/figure-contracts.mjs').FigureMark=shallowSlot.recipe.annotations[0];
 // @ts-expect-error shallow admission does not attest a calibration object
 const calibration:import('../../ui/image-panel/presentation-contracts.mjs').CalibrationView=shallowSlot.recipe.source.calibration;
}

declare const figureState:import('../../ui/image-panel/figure-contracts.mjs').FigureState;
const patches=readFigureRecipe({},figureState);
// @ts-expect-error recipe recovery validates a style record, not its marker values
const markerShape:string=patches[0].presentation.marker_shape;
