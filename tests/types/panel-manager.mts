import {ImagePanelManager} from '../../lib/image_panel_mcp.mjs';
import {createImagePanelModule} from '../../lib/tools/image_panel_module.mjs';
import type {IdentityCheckedPanelState,OwnedPanelConnection,PanelManagerPort,PanelImageWorkspacePort,PanelFetch} from '../../lib/panel_manager_contracts.mjs';
import type {PanelState} from '../../lib/image_panel_contracts.mjs';
import type {ToolResult} from '../../lib/runtime/contracts.mjs';

declare const rawHttpJson: unknown;
// @ts-expect-error HTTP JSON must pass the existing identity checks before use
const checked: IdentityCheckedPanelState=rawHttpJson;
declare const identity: IdentityCheckedPanelState;
const objectId:string=identity.object.object_id;
// @ts-expect-error the bridge checks identity, not the producer's entire state
const producerState:PanelState=identity;
// @ts-expect-error calibration is unqualified scientific metadata at this boundary
const physicalScale:number=identity.object.calibration;
// @ts-expect-error presentation status is not qualified by the object identity check
const shown:'shown'=identity.presentation;
// @ts-expect-error owned connections require a numeric port
const invalidConnection:OwnedPanelConnection={schema_version:1,panel_id:'id',port:'1234',token:'token',pid:1};
// @ts-expect-error fetch implementations must provide bounded-read response fields
const invalidFetch:PanelFetch=async()=>({ok:true,status:200});
declare const manager:ImagePanelManager;
const wait:Promise<ToolResult>=manager.call('image_panel_current',{panel_id:'id'});
// @ts-expect-error waiting for an MCP response does not expose a scientific result
const completed:'completed'=wait.state;
const port:PanelManagerPort=manager;
const module=createImagePanelModule({manager:port});
const inspectorOnlyWorkspace:PanelImageWorkspacePort={workspace:'configured',call:()=>({content:[]})};
createImagePanelModule({imageWorkspace:inspectorOnlyWorkspace,manager:port});
void [checked,objectId,producerState,physicalScale,shown,invalidConnection,invalidFetch,completed,module];
