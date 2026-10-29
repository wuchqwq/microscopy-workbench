import type {PanelState,PanelClient,PanelSelection,PanelDraftAcknowledgment} from '../../lib/image_panel_contracts.mjs';
import {readImageMeasurements} from '../../lib/image_measurement_records.mjs';
import {resolveComposition} from '../../lib/figure_composer_assets.mjs';
declare const state:PanelState;
const revision:number=state.state_revision;
const dirty:boolean=state.edit_state.dirty;
// @ts-expect-error Provider identity/publication does not validate arbitrary scientific units.
const unit:string=state.object.physical_unit;
// @ts-expect-error Saved evidence metadata is not an accepted scientific conclusion.
const phase:string=state.domain_evidence.phase;
// @ts-expect-error Source mapping is native metadata until coordinates validate it.
const domain:'source_pixels'=state.selection!.coordinate_space;
declare const client:PanelClient;
const result=await client.rpc('tools/call');
// @ts-expect-error RPC JSON must be checked at its consuming boundary.
const completed:'completed'=result.state;
const measurements=readImageMeasurements({workspace:'C:\\public',objectId:'0'.repeat(32)});
const status:'historical'|'needs_remeasurement'|'current'=measurements.entries[0].status;
// @ts-expect-error Journal hash/identity agreement does not qualify numerical scientific fields.
const distance:number=measurements.entries[0].distance_pixels;
const assets=await resolveComposition({});
if('profile' in assets[0]){
 // @ts-expect-error Hydration does not qualify additional, unvalidated provider profile fields.
 const assumption:string=assets[0].profile.unrecorded_assumption;
}
declare const ack:PanelDraftAcknowledgment;
const draftRevision:number=ack.edit_state.draft_revision;
const selection:PanelSelection|null=ack.selection;
void [revision,dirty,unit,phase,domain,completed,status,distance,draftRevision,selection];
