// These fixtures consume the real production ports and validated view types.
import {StructureWorkspace} from '../../lib/structure_workspace.mjs';
import {validateStructureSnapshot,inspectRendererContacts,createStructureViewer} from '../../tools/structure_viewer.mjs';
import {attachStructureViewer,closeStructureViewer} from '../../lib/structure_viewer_client.mjs';
import {structureViewerBrowser} from '../../ui/structure_viewer.mjs';
import type {CartesianAngstromVector,CartesianRotation,XYZDegrees,StructureObjectId,StructureSnapshot,DisplayOrientation,StructureWorkerProvenance,StructureWorkerWait,ViewerAttachment} from '../../lib/structure_contracts.mjs';
import type {InspectContacts,RendererModel} from '../../lib/structure_browser_contracts.mjs';

declare const input:unknown, snapshot:StructureSnapshot, atom:CartesianAngstromVector,
 degrees:XYZDegrees, rotation:CartesianRotation, objectId:StructureObjectId,
 orientation:DisplayOrientation, provenance:StructureWorkerProvenance, wait:StructureWorkerWait,
 viewer:ViewerAttachment, model:RendererModel;
const checked:StructureSnapshot=validateStructureSnapshot(input);
const position:CartesianAngstromVector=checked.positions_angstrom[0];
const identity:StructureObjectId=checked.object_id;
const inspector:InspectContacts=inspectRendererContacts;
const contacts:number=inspector([],snapshot,{atom_budget:512,undirected_contact_budget:8192});
const workerClosed:Promise<void>=wait.workerDone;
const scientificBackend:'external-structure-workspace'=provenance.backend;
const unqualifiedScientificField:unknown=provenance.reflections;

// @ts-expect-error Raw JSON does not attest a finite checked structure snapshot.
const unchecked:StructureSnapshot=input;
// @ts-expect-error Raw IDs do not carry the existing saved-object validation.
const rawIdentity:StructureObjectId='a'.repeat(32);
// @ts-expect-error Display rotation degrees are not Cartesian angstrom positions.
const degreeAsPosition:CartesianAngstromVector=degrees;
// @ts-expect-error Position coordinates are not an angular display request.
const positionAsDegree:XYZDegrees=atom;
// @ts-expect-error A cell of positions is not a checked proper rotation matrix.
const uncheckedRotation:CartesianRotation=snapshot.cell_angstrom;
// @ts-expect-error Scientific worker provenance does not validate reflection shape.
const reflections:number[]=provenance.reflections;
// @ts-expect-error Closure observation is independent of the MCP result body.
const sameLifetime:Promise<void>=wait;
// @ts-expect-error Optional viewer attachment is not scientific completion.
const scientificState:'completed'=viewer.viewer_state;
if(!orientation.initial_orientation_applied){
 // @ts-expect-error An unapplied legacy direction has no attested rotation matrix.
 const appliedMatrix=orientation.rotation_matrix_cartesian;
}
// @ts-expect-error Display-only orientation never marks scientific coordinates modified.
const scientificEdit:DisplayOrientation={...orientation,scientific_source_coordinates_modified:true};
// @ts-expect-error The owned viewer-close namespace requires its original request ID.
closeStructureViewer({object_id:objectId},{workspace:'structure-output'});
// @ts-expect-error The adapter returns MCP blocks, never a bare metadata object.
attachStructureViewer({content:'not MCP blocks'});
// @ts-expect-error Renderer atoms have explicit coordinates and adjacency fields.
model.addAtoms([{elem:'C'}]);
// @ts-expect-error A configured absolute workspace is required by the provider port.
new StructureWorkspace();
// @ts-expect-error A fixed snapshot and configured local asset are required by the viewer port.
createStructureViewer();
// @ts-expect-error Request identity cannot silently become a number at the typed port.
new StructureWorkspace({workspace:'structure-output'}).call('structure_open',{request_id:3});
// @ts-expect-error Browser initialization requires the real graph inspector port.
structureViewerBrowser({atom_budget:512,undirected_contact_budget:8192},()=>null);
void [position,identity,contacts,workerClosed,scientificBackend,unqualifiedScientificField,rotation,createStructureViewer];
