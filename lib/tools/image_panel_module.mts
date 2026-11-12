// Panel presentation is an explicit optional module, not a science fallback or
// another image state database. Existing manager/HTTP guards remain in place.
import {ImagePanelManager,imagePanelTools,imagePanelEvidenceTool,imagePanelResumeTool,imagePanelActivateTool,imagePanelSavedTool,IMAGE_PANEL_INSTRUCTIONS} from '../image_panel_mcp.mjs';
import {buildCrystalEvidencePayload,addCrystalInteractionViews} from '../panel_crystal_evidence.mjs';

import type {PanelImageWorkspacePort,PanelStructureWorkspacePort,PanelManagerOptions,PanelManagerPort} from '../panel_manager_contracts.mjs';
import type {RegistryModule,RequestIdentityPolicy,ToolContract,ToolCallOptions} from '../runtime/contracts.mjs';
interface PanelRecipe {inputs:readonly string[];outputs:readonly string[];kind:string;requestId:RequestIdentityPolicy;gates:readonly string[];serialization:string;recovery:ToolContract['recovery'];}
interface ImagePanelModuleOptions {imageWorkspace?:PanelImageWorkspacePort;structureWorkspace?:PanelStructureWorkspacePort;manager?:PanelManagerPort;managerOptions?:PanelManagerOptions;}

const recipes:Readonly<Record<string,PanelRecipe>> = {
  image_panel_activate:{
    inputs:['PanelRef:explicit owned live helper generation','OperationReceipt:pre-saved activation request_id'],
    outputs:['NativeViewerReceipt:original show and observed focus outcome for the same owned Panel'],
    kind:'owned-panel-native-activation',requestId:'required',
    gates:['Explicit Windows desktop opt-in, local Electron runtime and exact owned connection','Attach only, with no provider launch or view mutation'],
    serialization:'Exclusive Panel request intent and native singleton scoped to the logical Panel',
    recovery:{method:'Call with exact original arguments to read its original activation receipt. No viewer is relaunched.',tool:'image_panel_activate',idField:'request_id',scope:'Exact workspace Panel registry and original helper generation'},
  },
  image_panel_saved:{
    inputs:['PanelRef:explicit owned live helper','AnalysisWorkspaceSaveRef:exact save_id observed in image_panel_current'],
    outputs:['VerifiedSavepointReference:saved view, frame and selection plus content hash'],
    kind:'read-panel-savepoint',requestId:'none',
    gates:['Exact settled GUI save and verified provider references; independent of live active tab and AnalysisContext CAS'],
    serialization:'Read only, with exact live save_id and saved revision comparison',
    recovery:{method:'Read current state again and select the matching explicit save after resolving any draft or pending save.',tool:'image_panel_current',idField:'panel_id',scope:'Exact live owned Panel and its provider workspace'},
  },
  image_panel_resume:{inputs:['PanelRef:explicit stopped owned registered helper','OperationReceipt:pre-saved explicit resume request_id'],outputs:['PanelRef:same logical ID, fresh helper session/generation/capability','CheckpointSnapshot:unvalidated evidence until provider admission'],kind:'owned-panel-resume',requestId:'required',gates:['Exact owned connection and checkpoint generation inside workspace; stopped PID or normal-close marker','Durable submitted intent and exclusive per-panel claim; failed/unknown request never launches again','No scientific operation or original tool replay; saved evidence requires full provider readmission'],serialization:'Exclusive owned Panel registration claim, independent of provider scientific queues',recovery:{method:'Repeat image_panel_resume with exact original panel_id/request_id; query its original receipt only, never repeat a launch',tool:'image_panel_resume',idField:'request_id',scope:'Exact workspace Panel registry and owned helper generation; legacy unregistered helpers cannot resume'}},
  image_panel_evidence: {
    inputs: ['GeneralCrystalEvidenceRef:existing fully admitted structure comparison','PanelRef:owned exact current view and draft revision','Optional ObservationViewRef:two exact saved original ROI observations','OperationReceipt:pre-saved presentation request_id'],
    outputs: ['CrystalEvidencePresentation:bounded provider references, qualified counts/details and comparison PNG; never a scientific image input','PresentationReceipt:original attach outcome'],
    kind:'panel-evidence-attachment',requestId:'required',
    gates:['Explicit structure workspace structure_info full admission; exact hash-checked saved comparison file','Exact source/frame/calibration/ROI and owned Panel/draft guards; no fitting or scientific write'],
    serialization:'Existing Panel receipt authority and owned HTTP serialized presentation; no scientific journal duplication',
    recovery:{method:'Repeat image_panel_evidence with exactly the original arguments; original immutable attachment receipt only. Read image_panel_current separately for latest currentness.',tool:'image_panel_evidence',idField:'request_id',scope:'Configured image Panel registry, explicit structure provider, owned live helper; unknown/stopped attachment is not automatically replayed'},
  },
  image_panel_open: {
    inputs: ['ImageViewRef or ScientificObjectRef:existing exact image object', 'OperationReceipt:pre-saved panel request_id'],
    outputs: ['PanelRef:owned token-protected loopback URL and panel_id', 'DisplayPNG:saved immutable view; not unsaved gesture/tone drafts'],
    kind: 'owned-panel-launch', requestId: 'required',
    gates: ['Existing image_info inspection before durable launch intent; no arbitrary path/script/URL parameter', 'Absolute independent Python required for actual panel launch; same request/arguments recovers rather than relaunches'],
    serialization: 'ImagePanelManager deduplicates each original request ID and durable panel intent; no new global queue',
    recovery: {method: 'Repeat image_panel_open with the exact original request_id and object_id; inspect its original live panel without launching another', tool: 'image_panel_open', idField: 'request_id', scope: 'Configured image workspace panel registry; an absent/stopped helper is not automatically restarted'},
  },
  image_panel_current: {
    inputs: ['PanelRef:explicit panel_id, or exactly one live registered panel'],
    outputs: ['PanelSelectionRef:exact current object, source/frequency coordinates, draft revision and dirty status', 'DisplayPNG:saved view only; not a fresh screenshot or unsaved local display'],
    kind: 'inspect-panel-state', requestId: 'none',
    gates: ['Owned connection token and returned panel/object identity; no recency-based selection if zero/multiple live panels', 'No automatic model wake; image selection remains independent from scientific interpretation'],
    serialization: 'Live state GETs use existing manager; no scientific write queue. Manager may initialize its auxiliary registry directories',
    recovery: {method: 'Read current state again using the retained panel_id; this is not recovery of a scientific operation', tool: 'image_panel_current', idField: 'panel_id', scope: 'Currently live registered owned panel; exact one-panel omission rule'},
  },
  image_panel_show: {
    inputs: ['PanelRef:explicit retained panel_id', 'ImageViewRef:existing result object', 'PanelSelectionRef:expected_object_id and draft_revision', 'OperationReceipt:pre-saved presentation request_id'],
    outputs: ['PresentationReceipt:shown or queued, with original immutable presentation snapshot', 'DisplayPNG:saved immutable view, not scientific array'],
    kind: 'panel-presentation', requestId: 'required',
    gates: ['Existing image_info inspection, owned panel identity and exact presentation request arguments', 'Existing HTTP compare/draft checks queue dirty or newer drafts instead of overwriting them; queued is not shown'],
    serialization: 'Existing request-ID deduplication plus panel compare/draft guard; unrelated observation is not locked by this adapter',
    recovery: {method: 'Repeat image_panel_show with exactly the original arguments; query its original receipt, then image_panel_current for latest state', tool: 'image_panel_show', idField: 'request_id', scope: 'Configured image workspace panel request registry and owned helper; no automatic resubmission'},
  },
};

function contract(name:string, manager:PanelManagerPort):ToolContract {
  const recipe = recipes[name];
  if (!recipe) throw new Error(`Missing image panel module contract for ${name}`);
  return {
    backend: 'external-image-tools', inputs: [...recipe.inputs], outputs: [...recipe.outputs],
    effects: {kind: recipe.kind, sourceMutation: false, requestId: recipe.requestId},
    gates: ['Delegated per-call ImagePanelManager and owned helper guards; metadata does not certify a running viewer or model vision', ...recipe.gates],
    execution: {
      resourceKeys: [`image-panel-registry:${manager.workspace}`], serialization: recipe.serialization,
      budgets: ['Existing manager: response/private record <=20 MiB; saved PNG base64 <=6 MiB; connection record <=4096 bytes', 'Panel omission inspects <=100 registry entries; GET deadline <=3s; launch/presentation waits use configured manager deadlines'],
      cancellation: 'Abort before submission refuses. After start only stop waiting; durable open/show may finish. Recover with the same tool and original arguments, never a new-ID retry',
    },
    recovery: {...recipe.recovery},
  };
}

export function createImagePanelModule({imageWorkspace,structureWorkspace, manager, managerOptions}:ImagePanelModuleOptions = {}):RegistryModule&{manager:PanelManagerPort} {
  let runtime = manager;
  if (!runtime) {
    if (!imageWorkspace || typeof imageWorkspace.call !== 'function') throw new TypeError('Image panel module requires its existing image workspace');
    runtime = new ImagePanelManager({
      ...managerOptions, workspace: imageWorkspace.workspace, python: imageWorkspace.python,
      inspect: async object_id => {
        const result = await imageWorkspace.call('image_info', {object_id});
        if (result.isError) throw new Error('Image object inspection failed');
        return result;
      },
      ...(structureWorkspace?{inspectEvidence:async(object_id:string)=>addCrystalInteractionViews(buildCrystalEvidencePayload(await structureWorkspace.call('structure_info',{object_id}),structureWorkspace.workspace,object_id),id=>imageWorkspace.call('image_info',{object_id:id}))}:{}),
    });
  }
  if (typeof runtime.call !== 'function') throw new TypeError('Image panel module requires an ImagePanelManager-compatible call method');
  const desktop=Boolean(managerOptions?.desktopActivation);
  return {
    id: 'image-panel', enabled: true, manager: runtime,
    instructions: (desktop?'When hands-on spatial interaction would change the research answer, use image_panel_open for the saved view, then image_panel_activate on that exact Panel to show or focus the native workbench. Keep its identity internally and use the same provider for readback. After the researcher saves and says continue, check image_panel_current, then verify the exact save_id with image_panel_saved. For simple reads or direct calculations omit the Panel. ':'')+
      IMAGE_PANEL_INSTRUCTIONS+(structureWorkspace?' To return an existing general crystallographic comparison to this same GUI, use image_panel_evidence against the inspected exact object/draft revision; optionally retain the saved original observation_view_object_id. It attaches provider-qualified evidence beside the image, not a new scientific image. A reloaded process snapshot is unvalidated until explicit provider reattachment; do not replay unknown scientific requests.':''),
    tools: [...imagePanelTools,imagePanelResumeTool,...(structureWorkspace?[imagePanelEvidenceTool]:[]),...(desktop?[imagePanelActivateTool,imagePanelSavedTool]:[])].map(definition => ({definition, contract: contract(definition.name, runtime), execute: (args:unknown, {signal}:ToolCallOptions = {}) => runtime.call(definition.name, args, signal)})),
  };
}
