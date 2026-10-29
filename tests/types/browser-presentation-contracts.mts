import {profilePlot,profileReadout} from '../../ui/image-panel/data-probes.mjs';
import {validateComposition} from '../../ui/image-panel/figure-composer.mjs';
import {figureDisplayParameters} from '../../ui/image-panel/figure-export.mjs';
import type {ProfileResult} from '../../ui/image-panel/data-probe-contracts.mjs';
import type {CompositionSlot} from '../../ui/image-panel/figure-contracts.mjs';
declare const result:ProfileResult;
const readout=profileReadout(result,0);
// @ts-expect-error a saved sample is opaque until the finite-value check
const unverified:number=readout!.value;
const plot=profilePlot(result);
const ordinate:number|undefined=plot.range?.ymin;
// @ts-expect-error profile slots cannot substitute an image object for its result
const wrongSlot:CompositionSlot={kind:'profile',title:'Profile',source_object_id:'source'};
// @ts-expect-error composition layout requires every explicit slot and font
validateComposition({schema:'microscopy-figure-composition-v1',layout:'2x2'});
// @ts-expect-error display processing controls cannot claim a text gamma
figureDisplayParameters({gamma:'unchecked'},[]);
void [unverified,ordinate,wrongSlot];
