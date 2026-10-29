import type {AppSelection,DragState,PanelBrowserAPI} from '../../ui/image-panel/app-contracts.mjs';
import {selectionFromDrag} from '../../ui/image-panel/coordinates.mjs';
import type {ObjectId,SpatialPanel,WirePanel,Selection} from '../../ui/image-panel/coordinates.mjs';
declare const id:ObjectId;
declare const spatial:SpatialPanel;
// @ts-expect-error a frequency selection cannot claim a spatial panel mapping
const mixed:AppSelection={kind:'point',source_object_id:id,coordinate_space:'frequency_cycles_per_pixel',coordinates:[0,0],panel:spatial};
// @ts-expect-error a pan gesture needs its captured original camera and cursor
const missingCamera:DragState={kind:'pan',pointerId:1};
declare const api:PanelBrowserAPI;
const incompleteProbe=await api('/api/probe');
// @ts-expect-error an incomplete request cannot promise a probe's numeric reply
incompleteProbe.samples;
const unknownReply=await api('/api/not-a-panel-route');
// @ts-expect-error unknown endpoint names cannot silently acquire a full state type
unknownReply.object;
const revision=await api('/api/revision');
// @ts-expect-error lightweight revision metadata is not an image snapshot
revision.object.panels;
const state=await api('/api/state');
// @ts-expect-error UI metadata does not qualify a physical calibration scale
const physicalScale:number=state.object.xy_calibration!.xy_scale!.x;
declare const wirePanel:WirePanel;
const projected=selectionFromDrag([wirePanel],[0,0],[1,1],{kind:'line'});
// @ts-expect-error remote panel identity is not a qualified object reference
const qualifiedId:ObjectId=projected.source_object_id;
// @ts-expect-error a UI projection cannot qualify a scientific selection
const qualifiedSelection:Selection=projected;
void [mixed,missingCamera,physicalScale,qualifiedId,qualifiedSelection];

const draftAck=await api('/api/action',{expected_object_id:'saved-view',action:'draft',lightweight:true,params:{}});
// @ts-expect-error lightweight acknowledgments never promise a full scientific snapshot
draftAck.object;
declare const unknownAction:Readonly<Record<string,unknown>>;
const unqualifiedAction=await api('/api/action',unknownAction);
// @ts-expect-error an unchecked action body cannot promise the state response
unqualifiedAction.object;
