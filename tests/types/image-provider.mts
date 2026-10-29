import type {ImageWorkspace,ImageWorkspaceProvider} from '../../lib/image_workspace.mjs';
import {validateProbeResponse} from '../../lib/image_probe_client.mjs';
import type {ProbeRequest,ProbeResult} from '../../lib/image_probe_client.mjs';
import type {ImageWorkerPromise} from '../../lib/image_process_contracts.mjs';
import type {ToolResult} from '../../lib/runtime/contracts.mjs';

const request: ProbeRequest={object_id:'saved-object',points:[[1,2]],coordinate_space:'source_pixels',component:'raw'};
declare const boundaryJSON: unknown;
const sampled: ProbeResult=validateProbeResponse(boundaryJSON,request);
const numeric: number=sampled.samples[0].value;
// @ts-expect-error probe coordinates have an explicit supported coordinate domain
const wrongDomain: ProbeRequest={...request,coordinate_space:'physical_reciprocal'};
// @ts-expect-error an XY point contains exactly two coordinates
const wrongShape: ProbeRequest={...request,points:[[1,2,3]]};
// @ts-expect-error probe sampling never supplies an unsupported phase component
const wrongComponent: ProbeRequest={...request,component:'phase'};
// @ts-expect-error unrelated scientific metadata remains unknown after the bounded probe checks
const guessedUnit: string=sampled.physical_unit;
// @ts-expect-error the regex check does not claim the unqualified hash field is a string
const claimedHash: string=sampled.scientific_grid_identity.array_sha256;
declare const workspace: ImageWorkspace;
const waiting=workspace.call('image_info',{object_id:'saved-object'});
const receipt=waiting.receipt();
// @ts-expect-error stopping a waiter is not a completed scientific result
const completed: 'completed'=receipt.waitState;
declare const operation: ImageWorkerPromise;
// @ts-expect-error worker closure is not reassigned by a consumer
operation.workerDone=Promise.resolve();
declare const provider: ImageWorkspaceProvider;
const outcome: ToolResult | PromiseLike<ToolResult>=provider.call('image_result',{request_id:'original'});
declare const toolResult: ToolResult;
// @ts-expect-error MCP content does not qualify the encoded scientific state
const encodedState: 'completed'=toolResult.state;
void [numeric,wrongDomain,wrongShape,wrongComponent,guessedUnit,claimedHash,completed,outcome,encodedState];
