import type {AppState,AppObject,AppMark,AppSelection,AppOperation,DisplayDraft,AnnotationEdit,CompleteAnnotationEdit,QueuedEdit,SelectionSnapshot,LocalSnapshot,AppHistoryEntry,MeasurementTarget,DraftPublication,DragState,ActionParams,AppRevision,AppDraftAck,CompositionDraft,StatefulActionRequest} from './app-contracts.mjs';
import type {BrowserDocument,BrowserElement,BrowserEvent,BrowserImageConstructor,BrowserURL,BrowserBlobConstructor,ImagePixels,BrowserEnvironment} from './browser-ports.mjs';
import type {AnnotationPresentation,AnnotationLayout,MeasurementEntry,SavedViewEntry,ViewTransform} from './presentation-contracts.mjs';
import type {FigureRecipe,CompositionRecipe,CompositionPanel,FigureBase} from './figure-contracts.mjs';
import type {WireSelection,SelectionKind,WirePanel,XY} from './coordinates.mjs';
import type {ProbeResult} from './data-probe-contracts.mjs';
declare const document:BrowserDocument;declare const Image:BrowserImageConstructor;declare const URL:BrowserURL;declare const Blob:BrowserBlobConstructor;
declare const ImageData:{new(data:Uint8ClampedArray,width:number,height:number):ImagePixels};declare const Option:{new(text:string,value:string):BrowserElement};
declare const location:{hash:string;pathname:string};declare const sessionStorage:{setItem(key:string,value:string):void;getItem(key:string):string|null};declare const history:{replaceState(value:unknown,title:string,url:string):void};
declare const crypto:{randomUUID():string};declare const performance:{now():number};declare const innerHeight:number;
declare function requestAnimationFrame(callback:()=>void):number;declare function cancelAnimationFrame(id:number):void;
declare class ResizeObserver {constructor(callback:()=>void);observe(target:BrowserElement):void;}
declare function setTimeout(callback:(...args:unknown[])=>void,ms:number):unknown;declare function clearTimeout(id:unknown):void;
declare function fetch(url:string,options:{method:string;headers:Readonly<Record<string,string|null>>;body?:string}):Promise<{ok:boolean;json():Promise<unknown>}>;
import {selectionFromDrag,selectionRectangle,transformCoordinates,panelAt,coordinateSpace,constrainSelectionDrag} from './coordinates.mjs';
import {zoomAt,panBy,fitViewport,hitMark,DraftHistory,internalMarkId,relatedViewport,equalRecords} from './viewer-state.mjs';
import {rectangleHitTest,rectangleResizeHandleHitTest,rectangleHandles,editRectangle} from './roi-editing.mjs';
import {tonePixels,drawMark} from './viewer-render.mjs';
import {layoutAnnotations,renderAnnotationsSVG} from './annotation-presentation.mjs';
import {buildFigureBundle,downloadBlob,makeFigureRecipe,readFigureRecipe,figureScaleBar} from './figure-export.mjs';
import {MeasurementWorkspace,requiresMeasurementJump} from './measurement-workspace.mjs';
import {DataProbes} from './data-probes.mjs';
import {UserActionHistory,SavedViewHistory,workflowScope,selectionActionReason,measurementLabel} from './user-workflow.mjs';
import {makeImageSlot,makeProfileSlot,defaultCompositionTitle,validateComposition,renderCompositionSVG,buildCompositionBundle} from './figure-composer.mjs';
import {renderSequenceEvidence} from './sequence-evidence.mjs';
import {renderDomainEvidence} from './domain-evidence.mjs';
import {ResearchWorkspace} from './research-workspace.mjs';
import {WindowWorkspace,readWindowCollection,readWindowCamera,readWindowViewContext} from './window-workspace.mjs';
import {WorkspaceControls} from './workspace-controls.mjs';
import {RoiComparisonPanel} from './roi-comparison.mjs';
import {settleWorkspaceWindows} from './settle-workspace.mjs';
import {ExecutionHistoryPanel} from './execution-history.mjs';
import type {WindowCamera,WindowViewContext,WindowUiPanels} from './window-workspace.mjs';
import {checkObservationNote,observationReadback,observationPurpose} from './observation-contract.mjs';
import type {PanelRoiSnapshot} from './roi-observations.mjs';
const $=(id:string)=>document.getElementById(id)!,canvas=$('canvas'),ctx=canvas.getContext('2d')!,baseCanvas=$('base-canvas'),baseContext=baseCanvas.getContext('2d',{willReadFrequently:true})!,marksCanvas=$('marks-canvas'),marksContext=marksCanvas.getContext('2d')!,stage=$('image-stage'),viewport=$('viewport');
// These two existing details are transient menus, not saved side-panel state.
const transientMenus=[$('research-more'),$('window-index-menu')];
function withinElement(target:BrowserElement|null,root:BrowserElement){for(let node=target;node;node=node.parentNode)if(node===root)return true;return false;}
function dismissMenus(restoreFocus=false){let closed=false;for(const menu of transientMenus)if(menu.open){menu.open=false;closed=true;if(restoreFocus)menu.querySelector('summary')?.focus();}return closed;}
function openResultDialog(){dismissMenus();return $('research-more').querySelector('summary');}
for(const menu of transientMenus)menu.addEventListener('click',event=>{for(let node:BrowserElement|null=event.target;node&&node!==menu;node=node.parentNode)if(node.tagName==='BUTTON'){menu.open=false;break;}});
document.addEventListener('pointerdown',event=>{for(const menu of transientMenus)if(menu.open&&!withinElement(event.target,menu))menu.open=false;});
const cloneWorking=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const key='mcp-dm-panel-token',hash=location.hash.slice(1);if(hash){sessionStorage.setItem(key,hash);history.replaceState(null,'',location.pathname);}const token=sessionStorage.getItem(key);
let loadedWorkingRevision:number|undefined;
let state:AppState,image:BrowserElement|null,basePixels:ImagePixels|null,draft:AppSelection|null=null,drag:DragState|null=null,editCoordinates:readonly number[]|null=null,busy=false,activeAction='',cleanBase=false,selectedId='',spaceDown=false,pending:AppState|null=null,orphanedDraft=false;
let decodedViewSnapshot:{object_id:string;image:BrowserElement;panel_mapping_fingerprint:string;object:unknown}|null=null;
let view={scale:1,x:0,y:0},toneCacheKey:string|null=null,paintFrame:number|null=null,marksDirty=true,loading=0,fieldDirty=false,displayBaseline='',draftPublisher:Promise<void>=Promise.resolve();
let draftPending:DraftPublication|null=null,draftSending=false,draftError:unknown=null,autoFailed=false,explicitEditRetry=false,autoSequence=0,autoTimer:unknown=null,fieldBefore:CompleteAnnotationEdit|null=null,autoSaving:Promise<void>|null=null,measuredMarkId='';
let labelDraft:AnnotationPresentation|null=null,annotationLayout:AnnotationLayout|null=null,hoverId='';
let labelTimer:unknown=null;
let observationSavePhase:''|'submitting'|'verifying'|'handoff'='';
let observationSaveTrace:{outcome:string;elapsed_ms:Record<string,number>}|null=null;
let observationSaveStarted=0;
type RoiCreationReference={annotation_id:string;source_object_id:string;coordinates:readonly number[];note:string;selection_origin:string;xy_calibration:unknown;object_id:string|null;request_id:string|null;};
let roiCreationSave:Promise<unknown>|null=null,roiCreationRecovery:RoiCreationReference|null=null;
type WindowSwitch={phase:'preparing'|'activating'|'decoding'|'recovery';window_id:string;object_id:string;source_object_id:string;source_draft_revision:number;auto_sequence:number;};
let windowSwitch:WindowSwitch|null=null;
let workspaceSettling=false,workspaceRestoring=false;
// Invalidates an in-flight handoff even when an operation fails or the user
// returns to the same selection. Readiness flags alone describe only now.
let interactionEpoch=0;
let figurePrefs={preset:'real-space',mode:'analysis',layers:{experimental:true,simulation_A:false,simulation_B:false},columns:'single',fontPt:8,legend:true,scaleBar:true,letter:''};
const queuedEdits=new Map<string|undefined,QueuedEdit>(),userHistory=new UserActionHistory<AppHistoryEntry>(),savedViews=new SavedViewHistory();
const windowActionHistory=new Map<string,{scope:string|undefined;undo:AppHistoryEntry[];redo:AppHistoryEntry[]}>();
let lastUserDisplay:DisplayDraft|null=null;
let imageFocused=false,focusCamera:{object_id?:string;view:ViewTransform}|null=null;
let initialResultLayout=true,applyingUiPanels=false,panelLayoutUnrecorded=true,lastUiPanels:string|undefined;
const geometryRevisions=new Map<string|undefined,number>(),remeasuringMarks=new Map<string|undefined,MeasurementTarget>();let failedMeasurement:MeasurementTarget|null=null;
const historyDraft=new DraftHistory({}),perf={frames:0,tone_count:0,overlay_count:0,tone_last_ms:0,overlay_last_ms:0,draw_last_ms:0,action_last_ms:0};
const now=()=>performance.now(),message=(text:unknown,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error);};
const recoveryPending=()=>state?.workspace_analysis?.recovery_available===true;
function allowContentEditing(){if(!recoveryPending())return true;message('先恢复或明确放弃未保存恢复副本，再编辑或执行分析；当前仍可缩放、平移和调整窗口。',true);return false;}
const measurementWorkspace=new MeasurementWorkspace({getState:()=>state,api,onSelect:selectMeasurement,onJump:jumpMeasurement,onUpdate:updateMeasurement,onError:e=>message('结果读取未完成：'+(e as {message:string}).message,true)});
const dataProbes=new DataProbes({getState:dataProbeState,api,onError:e=>message('原数组读取未完成：'+(e as {message:string}).message,true)});
const researchWorkspace=new ResearchWorkspace({document,allowEdit:allowContentEditing,onSave:saveRoiObservation,onSelect:selectRoiObservation,onNavigate:async object_id=>{if(dirty()||busy||drag)throw new Error('先保存或撤销草稿，再查看保存证据；不会重算 FFT。');await act('show',{object_id});},onError:text=>message(text,true),onDraftChange:()=>{interactionEpoch++;diagnostics();publishDraft({urgent:true});}});
const windowWorkspace=new WindowWorkspace({document,viewport,activeStage:stage,getActiveImageSize:()=>[canvas.width,canvas.height],getActiveScale:()=>view.scale,getActiveSavedImage:()=>decodedViewSnapshot,getState:()=>state,api,isScientificGesture:()=>Boolean(drag),onActivate:activateWindow,onClose:closeImageWindow,onActiveFit:()=>{if(!windowSwitch)fitView();},onBoundsChange:syncDrawerBounds,onError:text=>message(text,true),onCollection:(collection,revision)=>{if(!state)return;state={...state,window_collection:collection,state_revision:Math.max(state.state_revision??0,revision)};showPending();},schedule:(callback,ms)=>typeof setTimeout==='function'?setTimeout(callback,ms):Promise.resolve().then(callback),cancelSchedule:id=>{if(typeof clearTimeout==='function')clearTimeout(id);},observe:typeof ResizeObserver==='undefined'?undefined:(target,callback)=>{new ResizeObserver(callback).observe(target);}});
const switchDisabledControls=new Map<BrowserElement,boolean>();
const workspaceControls=new WorkspaceControls<AppState>({document,getState:()=>state,read:()=>api('/api/state'),command:async body=>await api('/api/workspace',body) as AppState,
 settle:settleWorkspaceEdits,prepare:prepareWorkspaceClose,install:installWorkspaceState,
 localDirty:()=>dirty(),localActivity:()=>draftError||autoFailed||failedMeasurement||roiCreationRecovery&&!observationSavePhase?'unconfirmed':busy||autoSaving||observationSavePhase||roiCreationSave||draftPending||draftSending?'processing':undefined,blocked:()=>Boolean(busy||drag||windowSwitch||workspaceRestoring||orphanedDraft||autoFailed||roiCreationRecovery||autoSaving||queuedEdits.size&&!explicitEditRetry||remeasuringMarks.size||failedMeasurement||state?.last_operation?.state==='submitted'),
 interactionVersion:()=>interactionEpoch+':'+historyDraft.revision+':'+state.object.object_id,prepareRestore:async()=>{await windowWorkspace.awaitStableMetadata();await draftPublisher;if(draftError)throw draftError;},onRestoreLock:locked=>{workspaceRestoring=locked;windowWorkspace.setSwitchLocked(locked);if(locked&&labelTimer!==null){clearTimeout(labelTimer);labelTimer=null;}diagnostics();},onRestoreConflict:result=>{pending=result;orphanedDraft=true;showPending();},requestId:()=> 'save-'+crypto.randomUUID(),onError:text=>message(text,true),onMessage:text=>message(text)});
const roiComparisonPanel=new RoiComparisonPanel<AppState>({document,api,getState:()=>state,show:showVerifiedHistoryObject,install:next=>{state={...state,workspace_analysis:next.workspace_analysis};diagnostics();},error:text=>message(text,true),onOpen:openResultDialog});
const executionHistoryPanel=new ExecutionHistoryPanel({document,read:()=>api('/api/execution-history'),show:showVerifiedHistoryObject,error:text=>message(text,true),onOpen:openResultDialog});
async function showVerifiedHistoryObject(object_id:string,input_reference?:Readonly<Record<string,unknown>>){if(dirty()||busy||drag||windowSwitch||workspaceRestoring)throw new Error('先完成当前编辑，再查看历史输入；探索记录保持原样。');await act('show',{object_id,...(input_reference?{input_reference}:{})});if(state.object.object_id!==object_id||pending||state.pending_result)throw new Error('结果尚未接纳并显示；请处理待查看状态，历史对话框保持打开。');}
async function settleWorkspaceEdits(){
 if(workspaceSettling)throw new Error('正在核对各窗口工作编辑，请等待。');
 // Only an explicit workspace Save authorizes new writes after a positively
 // rejected submission. Close preparation merely parks the retained draft.
 explicitEditRetry=false;
 workspaceSettling=true;diagnostics();
 try{await settleWorkspaceWindows({
  read:async()=>{const latest=await api('/api/state');mirrorWindowCollection(latest);const collection=latest.window_collection;return {active:collection?.active_window_id??null,visible:collection?.windows.map(w=>w.window_id)??[],retained:[...collection?.windows??[],...collection?.closed_windows??[]].map(w=>w.window_id),dirty:Object.entries(latest.workspace_analysis?.window_drafts??{}).filter(([,v])=>v.content_dirty===true).map(([id])=>id)};},
  settleCurrent:settleCurrentWindowEdits,
  activate:async id=>{if(state.window_collection?.active_window_id===id)return;const target=[...state.window_collection?.windows??[],...state.window_collection?.closed_windows??[]].find(w=>w.window_id===id);if(!target)throw new Error('待保存的工作窗口已无法核对。');await activateWindow(id,target.object_id);if(windowSwitch||state.window_collection?.active_window_id!==id)throw new Error('窗口接续未确认；没有发布保存点。');},
  close:closeImageWindow
 });}finally{workspaceSettling=false;diagnostics();}
}
async function settleCurrentWindowEdits(){
 if(!state.window_collection?.active_window_id)return;
 if(drag||busy||windowSwitch||autoFailed||roiCreationRecovery)throw new Error('先结束手势或核对原请求；修改保持原样。');
 captureSelected();if(labelDraft&&selectedId){const presentation=labelDraft;labelDraft=null;queueEdit({annotation_id:selectedId,presentation});}
 while(autoSaving||queuedEdits.size){await (autoSaving??flushEdits());if(autoFailed)throw new Error('标注提交尚未确认，请查询原请求后再保存工作区。');}
 if(researchWorkspace.reasonDirty&&draft?.kind==='rectangle'&&draft.coordinate_space==='source_pixels')await saveRoiObservation($('roi-reason').value,{allowEmptyReason:true});
 if(JSON.stringify(displayDraft())!==displayBaseline){const frequency=state.object.panels?.some(p=>p.domain==='frequency');await act('preview',{gamma:Number($('gamma').value),display_range:$('low').value===''||$('high').value===''?null:[Number($('low').value),Number($('high').value)],...(frequency?{spectrum_axes:$('axes').checked}:{scale_bar:$('scale').checked})});}
 await prepareWorkspaceClose();
}
function workspaceDraft(){return {version:1,object_id:state.object.object_id,panel_mapping_fingerprint:state.panel_mapping_fingerprint,selection:draft?selection():null,annotation_edit:annotationEditDraft(),display:displayDraft(),reason:$('roi-reason').value,reason_dirty:researchWorkspace.reasonDirty,content_dirty:dirty(),selected_id:selectedId||null,fields:{id:$('mark-id').value,text:$('mark-text').value,color:$('color').value,status:$('status').value}};}
async function parkActiveWindow(){
 if(state.workspace_analysis&&state.window_collection&&!state.window_collection.active_window_id)return;
 if(!state.workspace_analysis||!state.window_collection?.active_window_id||!state.panel_mapping_fingerprint){await publishDraft({includeSelection:true,urgent:true,confirmPersistence:true});if(draftError)throw draftError;return;}
 panelLayoutUnrecorded=false;windowWorkspace.queueActiveCamera(activeWindowCamera(),activeUiPanels());await windowWorkspace.awaitStableMetadata();
 const activeId=state.window_collection?.active_window_id;if(activeId)windowActionHistory.set(activeId,{scope:workflowScope(state),undo:cloneWorking(userHistory.undoItems),redo:cloneWorking(userHistory.redoItems)});
 const revision=historyDraft.revision,epoch=interactionEpoch;
 await publishDraft({includeSelection:true,urgent:true,confirmPersistence:true,allowSwitch:true});if(draftError)throw draftError;
 if(historyDraft.revision!==revision||interactionEpoch!==epoch||drag)throw new Error('停放工作编辑时有新操作；请结束后重试。');
 const latest=await api('/api/state');
 if(latest.object.object_id!==state.object.object_id||latest.edit_state?.draft_revision!==revision)throw new Error('工作区版本已改变；本地编辑仍保留。');
 const parked=await api('/api/workspace',{action:'park-window',expected_working_revision:latest.workspace_analysis!.working_revision,working_draft:workspaceDraft()}) as AppState;
 if(historyDraft.revision!==revision||interactionEpoch!==epoch||parked.object.object_id!==state.object.object_id)throw new Error('停放确认期间出现新编辑；不切换窗口。');
 state={...state,workspace_analysis:parked.workspace_analysis,edit_state:parked.edit_state,state_revision:parked.state_revision};historyDraft.revision=Math.max(historyDraft.revision,parked.edit_state?.draft_revision??0);workspaceControls.sync();
}
async function prepareWorkspaceClose(){
 if(drag||busy||windowSwitch||workspaceRestoring||orphanedDraft||autoFailed||roiCreationRecovery||autoSaving||queuedEdits.size&&!explicitEditRetry||remeasuringMarks.size||failedMeasurement||state.last_operation?.state==='submitted')throw new Error('原编辑或计算仍未结束；请等待或核对原请求，工作区保持打开。');
 if(labelTimer!==null){clearTimeout(labelTimer);labelTimer=null;}
 await parkActiveWindow();
}
async function installWorkspaceState(next:AppState,action:'save'|'query-save'|'discard'|'recover'){
 if(action==='discard'||action==='recover'){
  interactionEpoch++;if(!await load(next,{discardAuthorizedDraft:true,forceWindowContext:true}))throw new Error('工作版本已读回，但图像接续尚未完成。');
  hydrateWorkingDraft(next);
 }else{state={...state,workspace_analysis:next.workspace_analysis};diagnostics();}
 workspaceControls.sync();
}
function hydrateWorkingDraft(next:AppState){
 const history=next.window_collection?.active_window_id?windowActionHistory.get(next.window_collection.active_window_id):null;
 if(history?.scope===workflowScope(next)){userHistory.undoItems=cloneWorking(history.undo);userHistory.redoItems=cloneWorking(history.redo);userHistory.group=null;}
 const raw=next.workspace_analysis?.active_window_draft;if(!raw||raw.object_id!==next.object.object_id||raw.panel_mapping_fingerprint!==next.panel_mapping_fingerprint)return;
 if(labelTimer!==null){clearTimeout(labelTimer);labelTimer=null;}fieldBefore=null;
 if(raw.selection===null)draft=null;else if(raw.selection&&typeof raw.selection==='object')draft=restoredSelection(raw.selection as AppSelection,next.object.panels??[]);
 const id=typeof raw.selected_id==='string'?raw.selected_id:'',mark=next.object.annotations?.find(value=>value.annotation_id===id&&value.status!=='retracted');selectedId=mark?id:'';$('existing').value=selectedId;
 const fields=raw.fields as Record<string,unknown>|undefined;if(fields)for(const [id,key]of [['mark-id','id'],['mark-text','text'],['color','color'],['status','status']])if(typeof fields[key!]==='string')$(id!).value=fields[key!] as string;
 const edit=raw.annotation_edit as Record<string,unknown>|null;if(selectedId&&edit){if(Array.isArray(edit.coordinates))editCoordinates=edit.coordinates as number[];fieldDirty=['text','color','status'].some(key=>Object.hasOwn(edit,key));if(edit.presentation&&typeof edit.presentation==='object')labelDraft=cloneWorking(edit.presentation) as AnnotationPresentation;}
 const display=raw.display as DisplayDraft|undefined;if(display){$('gamma').value=display.gamma;$('gamma-label').textContent=String(display.gamma);$('low').value=display.low;$('high').value=display.high;$('axes').checked=display.axes;$('scale').checked=display.scale;}
 if(typeof raw.reason==='string'){$('roi-reason').value=raw.reason;researchWorkspace.reasonDirty=raw.reason_dirty===true;}
 syncPresentationFields();record();showDraft();paint();diagnostics();
}
function lockScientificControls(){
 const noDisplay=Boolean(state?.workspace_analysis&&state.window_collection&&!state.window_collection.windows.length);
 if(!windowSwitch&&!observationSavePhase&&!roiCreationRecovery&&!noDisplay&&!workspaceSettling&&!workspaceRestoring&&!orphanedDraft&&!recoveryPending())return;
 const names=['add-roi','select-roi','delete-roi','fft','measure','share','apply-roi','full','roi-statistics','line-profile','save-mark','apply-display','apply-complex-component','calibrate','withdraw','submit-observation','save-observation','save-observation-entry','agent-continue','undo','redo','frame','set-frame','previous-frame','next-frame','export','recover','fit','fit-canvas','zoom','mode'];
 const controls=[...names.map(id=>$(id)),...['roi-reason','mark-text','color','status','gamma','low','high','axes','scale'].map(id=>$(id)),...document.querySelectorAll('.properties-panel input, .properties-panel select, .properties-panel textarea, .properties-panel button, [data-mode]')];
 for(const control of controls){if(!control||['discard-local','reload','close-properties','toggle-settings','toggle-properties'].includes(control.id)||recoveryPending()&&!workspaceRestoring&&!windowSwitch&&(['fit','fit-canvas','zoom','mode'].includes(control.id)||control.dataset?.mode==='pan'))continue;if(control.id==='recover'&&(roiCreationRecovery&&!observationSavePhase||recoveryPending()&&!busy&&!workspaceRestoring&&!windowSwitch)){control.disabled=false;continue;}if(!switchDisabledControls.has(control))switchDisabledControls.set(control,Boolean(control.disabled));control.disabled=true;}
}
function restoreScientificControls(){for(const [control,disabled]of switchDisabledControls)control.disabled=disabled;switchDisabledControls.clear();}
function switchState(next:WindowSwitch|null){
 windowSwitch=next;windowWorkspace.setSwitchLocked(Boolean(next));document.body.classList.toggle('window-switching',Boolean(next));$('window-switch-notice').hidden=!next;
 $('window-switch-message').textContent=!next?'':next.phase==='preparing'?'正在核对保存状态与窗口相机；科学输入暂时暂停。':next.phase==='activating'?'正在接纳所选窗口；当前画面暂不接收科学写入。':next.phase==='decoding'?'目标已读回，正在接续图像；尚未确认显示完成。':'切换接续尚未确认；请核对当前已保存视图。不会重新提交切换。';
 $('window-switch-check').hidden=next?.phase!=='recovery';
 if(!next)restoreScientificControls();
 diagnostics();
}
function activeWindowCamera():WindowCamera {
 const box=viewport.getBoundingClientRect(),camera=readWindowCamera({scale:view.scale,center_image_xy:[(box.width/2-view.x)/view.scale,(box.height/2-view.y)/view.scale]});if(!camera)throw new Error('当前相机超出可恢复范围，请适应画布后再继续。');return camera;
}
function resumableWindowContext(next:AppState):WindowViewContext|null {
 const collection=readWindowCollection(next.window_collection),entry=collection?.windows.find(value=>value.window_id===collection.active_window_id&&value.object_id===next.object.object_id);
 return next.panel_mapping_fingerprint&&entry?readWindowViewContext(entry.view_context,next.object,next.panel_mapping_fingerprint):null;
}
async function persistWindowContext(){
 if(!state?.panel_mapping_fingerprint||!state.window_collection?.active_window_id)return;
 await windowWorkspace.awaitStableMetadata();const objectId=state.object.object_id,revision=historyDraft.revision,epoch=interactionEpoch,camera=activeWindowCamera();
 await publishDraft({includeSelection:true,urgent:true,confirmPersistence:true});if(draftError)throw new Error('窗口选择保存尚未确认；当前编辑保留。');
 if(state.object.object_id!==objectId||historyDraft.revision!==revision||interactionEpoch!==epoch||drag||dirty())throw new Error('核对窗口时出现新编辑，原图与草稿保留。');
 const selected=state.object.annotations?.some(mark=>mark.annotation_id===selectedId&&mark.status!=='retracted')?selectedId:null;
 await windowWorkspace.saveActiveContext(camera,selected,revision,activeUiPanels());
 if(state.object.object_id!==objectId||historyDraft.revision!==revision||interactionEpoch!==epoch||drag||dirty())throw new Error('保存窗口状态时出现新编辑，原图与草稿保留。');
}
async function activateWindow(windowId:string,targetObject:string){
 if(windowSwitch)return;if(workspaceRestoring)throw new Error('正在恢复工作区，当前输入暂停。');
 if(!state?.panel_mapping_fingerprint)throw new Error('当前服务未提供可核对的窗口映射，保留单图编辑。');
 if(drag||observationSavePhase||autoFailed||orphanedDraft||pending||state.pending_result||state.last_operation?.state==='submitted')throw new Error('先结束手势、保存或处理待查看结果与原请求，再编辑另一窗口。');
 if(autoSaving||queuedEdits.size||remeasuringMarks.size)throw new Error('正在保存或重新测量当前标记；请等待数值标签保存完成后，再明确点击编辑另一窗口。');
 if(busy)throw new Error('当前操作尚未完成，请等待后再编辑另一窗口。');
 if(labelTimer!==null){clearTimeout(labelTimer);labelTimer=null;}
 const canPark=Boolean(state.workspace_analysis);
 if(!canPark&&(researchWorkspace.reasonDirty||editCoordinates||fieldDirty||labelDraft||JSON.stringify(displayDraft())!==displayBaseline))throw new Error('当前服务尚不支持工作编辑停放，请先处理本地草稿。');
 const transition:WindowSwitch={phase:'preparing',window_id:windowId,object_id:targetObject,source_object_id:state.object.object_id,source_draft_revision:historyDraft.revision,auto_sequence:autoSequence};switchState(transition);
 let sent=false;
 try{
  if((!canPark&&dirty())||drag||pending||state.pending_result||state.last_operation?.state==='submitted')throw new Error('当前工作状态尚未就绪，编辑保留。');
  if(canPark){if(state.window_collection?.active_window_id){await parkActiveWindow();const selected=state.object.annotations?.some(mark=>mark.annotation_id===selectedId&&mark.status!=='retracted')?selectedId:null;await windowWorkspace.saveActiveContext(activeWindowCamera(),selected,historyDraft.revision,activeUiPanels());}}else await persistWindowContext();
  await windowWorkspace.awaitStableMetadata();
  const target=[...state.window_collection?.windows??[],...state.window_collection?.closed_windows??[]].find(entry=>entry.window_id===windowId);if(!target||target.object_id!==targetObject)throw new Error('所选窗口已关闭或其结果版本已改变；请重新核对窗口列表。');
  transition.source_object_id=state.object.object_id;transition.source_draft_revision=historyDraft.revision;transition.phase='activating';switchState(transition);const revision=historyDraft.revision;
  const request=api('/api/action',{expected_object_id:state.object.object_id,draft_revision:revision,action:'activate-window',params:{window_id:windowId,collection_revision:state.window_collection!.revision}});sent=true;const epoch=interactionEpoch,result=await request;
  if(result.object.object_id!==targetObject||result.window_collection?.active_window_id!==windowId)throw new Error('切换目标读回身份不一致；保留当前画面待核对。');
  if(historyDraft.revision!==revision||interactionEpoch!==epoch||(!canPark&&dirty())||drag){pending=result;showPending();throw new Error('目标已读回，但期间出现新编辑；原草稿保留，尚未接续显示。');}
  transition.phase='decoding';switchState(transition);if(!await load(result,{forceWindowContext:true,discardAuthorizedDraft:canPark,publishSelection:!canPark})||draftError)throw new Error('目标已接纳，但图像或交接保存尚未接续；请核对当前视图。');
  if(canPark){hydrateWorkingDraft(result);await publishDraft({includeSelection:true,urgent:true,allowSwitch:true});}
  if(state.object.object_id!==targetObject||state.window_collection?.active_window_id!==windowId)throw new Error('画面接续时活动对象改变，尚未确认切换成功。');
  pending=null;switchState(null);message('已切换编辑窗口；原图、其他结果与历史记录保留。');
 }catch(error){
  transition.phase='recovery';switchState(transition);
  try{const latest=await api('/api/state');if(latest.object.object_id===state.object.object_id){mirrorWindowCollection(latest);state={...state,last_operation:latest.last_operation,pending_result:latest.pending_result};windowWorkspace.reconcileMetadata(state);}else{pending=latest;showPending();}}catch{/* Readback does not resubmit an unknown activation. */}
  message((sent?'切换结果尚未确认。':'切换尚未完成。')+(error as Error).message+' 请核对后继续，不重复点击提交。',true);
 }
}
function clearExplicitLocalDraft(){researchWorkspace.clearReason();drag=null;queuedEdits.clear();explicitEditRetry=false;editCoordinates=null;labelDraft=null;fieldDirty=false;fieldBefore=null;if(labelTimer!==null){clearTimeout(labelTimer);labelTimer=null;}failedMeasurement=null;remeasuringMarks.clear();orphanedDraft=false;roiCreationRecovery=null;}
async function closeImageWindow(windowId:string){
 if(!state.workspace_analysis)throw new Error('当前服务尚未提供保留工作编辑的关闭路径。');
 if(busy||drag||windowSwitch||autoFailed||pending||state.pending_result||state.last_operation?.state==='submitted')throw new Error('先结束手势或核对原执行请求，再关闭此显示。');
 await prepareWorkspaceClose();await windowWorkspace.awaitStableMetadata();
 const epoch=interactionEpoch,revision=historyDraft.revision;
 const result=await api('/api/action',{expected_object_id:state.object.object_id,draft_revision:revision,action:'close-window',params:{window_id:windowId,collection_revision:state.window_collection!.revision}});
 if(interactionEpoch!==epoch||historyDraft.revision!==revision||drag){pending=result;showPending();throw new Error('关闭显示期间出现新编辑；请核对当前窗口，编辑保留。');}
 if(result.object.object_id!==state.object.object_id){if(!await load(result,{discardAuthorizedDraft:true,forceWindowContext:true,publishSelection:false}))throw new Error('显示已关闭；后续窗口图像尚未接续。');hydrateWorkingDraft(result);}
 else{state={...state,window_collection:result.window_collection,workspace_analysis:result.workspace_analysis,state_revision:result.state_revision,edit_state:result.edit_state};windowWorkspace.sync(state);}
 diagnostics();message('已关闭图像显示；工作编辑和科学记录保留，可从窗口列表重新打开。');
}
async function recoverWindowDisplay(discard=false){
 if(!windowSwitch||windowSwitch.phase!=='recovery')return;const epoch=interactionEpoch,visible=state.object.object_id;
 try{
  const latest=await api('/api/state');if(interactionEpoch!==epoch||state.object.object_id!==visible||drag)throw new Error('核对期间出现新编辑；草稿保留。');
  const same=latest.object.object_id===visible&&latest.panel_mapping_fingerprint===state.panel_mapping_fingerprint,reuseLocal=same&&latest.edit_state?.draft_revision===windowSwitch.source_draft_revision;
  if(!reuseLocal&&dirty()&&!discard)throw new Error('当前租约或活动图已更新；原图本地草稿保留，不自动回放旧草稿。请先明确处理后再接续。');
  if(discard&&(autoFailed||latest.last_operation?.state==='submitted'))throw new Error('原科学请求尚未确认；保留草稿与原请求，先查询原请求。');
  const revision=Math.max(historyDraft.revision,latest.edit_state?.draft_revision??0)+1;if(!Number.isSafeInteger(revision))throw new Error('草稿修订号已耗尽');
  // An explicit continuation fences the old in-flight navigation using the
  // existing global lease. A stale-source fence loses with 409; never replay it.
  const selected=reuseLocal&&!discard?(draft?selection():null):latest.selection??null,edit=reuseLocal&&!discard?annotationEditDraft():latest.edit_state?.annotation_edit??null,dirtyState=reuseLocal&&!discard?dirty():Boolean(latest.edit_state?.dirty);
  const ack=await api('/api/action',{expected_object_id:latest.object.object_id,action:'draft',lightweight:true,params:{draft_revision:revision,dirty:reuseLocal&&discard?false:dirtyState,gesture_active:false,selection:selected,annotation_edit:reuseLocal&&discard?null:edit,confirm_persistence:true}});
  if(ack.object_id!==latest.object.object_id||ack.edit_state?.draft_revision!==revision)throw new Error('继续显示的租约未确认；当前画面保持暂停。');
  const confirmed=await api('/api/state');if(interactionEpoch!==epoch||state.object.object_id!==visible||confirmed.object.object_id!==latest.object.object_id||confirmed.edit_state?.draft_revision!==revision)throw new Error('核对后当前对象或草稿又发生变化，继续保持暂停。');
  if(discard){clearExplicitLocalDraft();interactionEpoch++;}
  historyDraft.revision=revision;if(confirmed.object.object_id===state.object.object_id)windowWorkspace.reconcileMetadata(confirmed);
  if(reuseLocal&&!discard){state={...state,edit_state:confirmed.edit_state,last_operation:confirmed.last_operation,pending_result:confirmed.pending_result,state_revision:confirmed.state_revision,window_collection:confirmed.window_collection};windowWorkspace.sync(state);pending=null;switchState(null);message('已核对并继续当前图；本地草稿保留，旧切换不能再覆盖当前租约。');return;}
  windowSwitch.phase='decoding';switchState(windowSwitch);if(confirmed.edit_state?.dirty)orphanedDraft=true;
  if(!await load(confirmed,{forceWindowContext:true,publishSelection:false}))throw new Error('图像接续期间出现新编辑；继续保持暂停。');windowWorkspace.reconcileMetadata(state);pending=null;switchState(null);message('已接续当前已保存视图；未重新提交窗口切换。');
 }catch(error){if(windowSwitch){windowSwitch.phase='recovery';switchState(windowSwitch);}message((error as Error).message,true);try{const latest=await api('/api/state');if(latest.object.object_id!==state.object.object_id)pending=latest;else mirrorWindowCollection(latest);showPending();}catch{/* Keep the frozen display and original operation. */}}
}
function researchSnapshot():PanelRoiSnapshot {const edit=selectedId&&(editCoordinates||queuedEdits.get(selectedId)?.update.coordinates);return {...state,selection:draft,edit_state:{...state.edit_state,dirty:dirty(),gesture_active:Boolean(drag),annotation_edit:edit?{annotation_id:selectedId,coordinates:edit}:state.edit_state?.annotation_edit??null}} as unknown as PanelRoiSnapshot;}
function syncDrawerBounds(){
 const host=$('workbench').getBoundingClientRect(),area=viewport.getBoundingClientRect(),narrow=host.width>0&&host.width<=850&&host.height>0&&area.height>0;
 const content=$('measurement-content'),results=$('measurement-workspace'),contentBox=content.getBoundingClientRect(),resultsBox=results.getBoundingClientRect();
 // Preserve the user's height preference; cap only what can fit beside the
 // current controls and the existing minimum image viewport. Content scrolls.
 const resultLimit=narrow&&results.open?Math.max(0,Math.floor(host.top+host.height-resultsBox.top-resultsBox.height+contentBox.height+area.height-160))+'px':'';
 if(content.style.maxHeight!==resultLimit)content.style.maxHeight=resultLimit;
 const top=narrow?Math.max(0,area.top-host.top)+'px':'',bottom=narrow?Math.max(0,host.top+host.height-area.top-area.height)+'px':'';
 for(const id of ['research-panel','properties-panel']){const style=$(id).style;if(style.top!==top)style.top=top;if(style.bottom!==bottom)style.bottom=bottom;}
}
function syncDrawerPresentation(){
 const research=!imageFocused&&document.body.classList.contains('research-open'),properties=!imageFocused&&document.body.classList.contains('properties-open');
 $('toggle-research').setAttribute('aria-expanded',String(research));$('toggle-properties').setAttribute('aria-expanded',String(properties));$('toggle-settings').setAttribute('aria-expanded',String(properties&&$('settings-panel').open));syncDrawerBounds();const panels=activeUiPanels(),signature=JSON.stringify(panels);if(!applyingUiPanels&&lastUiPanels!==undefined&&signature!==lastUiPanels)panelLayoutUnrecorded=false;lastUiPanels=signature;if(!applyingUiPanels&&image&&state?.panel_mapping_fingerprint)windowWorkspace.queueActiveCamera(activeWindowCamera(),panelLayoutUnrecorded?undefined:panels);
}
function activeUiPanels():WindowUiPanels {
 return {side:imageFocused?'none':document.body.classList.contains('properties-open')?'properties':document.body.classList.contains('research-open')?'research':'none',settings:Boolean($('settings-panel').open),results:!imageFocused&&Boolean($('measurement-workspace').open)};
}
function restoreUiPanels(panels:WindowUiPanels|undefined){
 const known=panels??{side:'none',settings:false,results:false};panelLayoutUnrecorded=panels===undefined;applyingUiPanels=true;
 try{document.body.classList.toggle('properties-open',known.side==='properties');document.body.classList.toggle('research-open',known.side==='research');$('research-panel').hidden=known.side!=='research';$('settings-panel').open=known.settings;$('measurement-workspace').open=known.results;initialResultLayout=false;syncDrawerPresentation();void viewport.getBoundingClientRect().width;}
 finally{applyingUiPanels=false;}
 $('toggle-properties').title=panelLayoutUnrecorded?'此前未记录面板开合；当前使用默认显示。':'打开或关闭此图的属性面板';
}
function openResearch(){if(imageFocused)toggleImageFocus();document.body.classList.remove('properties-open');document.body.classList.add('research-open');$('research-panel').hidden=false;syncDrawerPresentation();diagnostics();}
function closeResearch(){document.body.classList.remove('research-open');$('research-panel').hidden=true;syncDrawerPresentation();}
function latestRoiTarget():SavedViewEntry|null {const collection=state?.window_collection,entry=collection?.windows.find(value=>value.window_id===collection.active_window_id&&value.object_id===state.object.object_id),id=entry?.latest_observation_view_object_id;return state?.object.panels?.some(p=>p.domain==='spatial_pixels')&&typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)&&id!==state.object.object_id?{id,frame:collection?.frame_object_id??null,role:'最新 ROI 图'}:null;}
function requireLatestRoiRevision(){if(latestRoiTarget())throw new Error('当前是 FFT 的历史来源图；请先点“查看最新 ROI”再添加、移动、缩放或保存 ROI 说明。');}
function selectRoiObservation(annotationId:string,{duringSave=false,showResearch=true}={}){if(windowSwitch||!duringSave&&(observationSavePhase||roiCreationRecovery))throw new Error('保存或切换接续中，先核对当前图像。');if(researchWorkspace.reasonDirty)throw new Error('先保存或撤销当前观察说明，再切换观察。');if(!chooseMark(annotationId))return;const mark=state.object.annotations?.find(m=>m.annotation_id===annotationId);if(!mark?.anchor)throw new Error('当前没有这条已保存观察');const panel=markPanel(mark);draft={...mark.anchor,kind:mark.kind,panel,rendered:transformCoordinates(mark.anchor.coordinates,panel,{edges:true,inverse:true})} as AppSelection;document.body.classList.remove('properties-open');if(showResearch)openResearch();else closeResearch();showDraft();record();schedulePaint();publishDraft({includeSelection:true,urgent:true});}
async function verifyRoiObservation(result:AppState,expected:{object_id:string;annotation_id:string;source_object_id:string;coordinates:readonly number[];note:string;selection_origin:string;xy_calibration:unknown},submittedDraft:string,geometryOnly:boolean,stamp:(step:string)=>void,trace:{outcome:string}){
 if(pending||state.object.object_id!==result.object.object_id){message('观察对象已保存，当前显示尚未接续；较新的草稿保留，尚未核对当前观察。');return false;}
 stamp('saved_view_displayed');observationSavePhase='verifying';diagnostics();message('观察对象已保存；正在读回核对身份、位置与理由，尚未完成交接。');
 const epoch=interactionEpoch;let verified:AppState;
 stamp('readback_1_start');try{verified=await api('/api/state');stamp('readback_1_end');}catch{message('观察对象已保存，但当前交接读回失败；草稿保留，请重新读取，勿重放原保存请求。',true);return false;}
 if(interactionEpoch!==epoch||$('roi-reason').value!==submittedDraft||state.object.object_id!==expected.object_id){message('观察对象已保存；读回期间出现新编辑，保留新草稿并重新核对后交接。');return false;}
 const checked=observationReadback(verified as unknown as PanelRoiSnapshot,expected);
 if(!checked.saved){message(`观察对象已保存；${checked.reason}。草稿保留。`,true);return false;}
 observationSavePhase='handoff';researchWorkspace.clearReason();selectRoiObservation(expected.annotation_id,{duringSave:true,showResearch:!geometryOnly});diagnostics();
 stamp('draft_confirmation_start');await publishDraft({includeSelection:true,urgent:true,confirmPersistence:true});stamp('draft_confirmation_end');
 if(draftError){message('观察对象已保存并核对；交接状态持久化失败，请查询原请求，勿重放原保存请求。',true);return false;}
 const finalEpoch=interactionEpoch;let fresh:AppState;
 stamp('readback_2_start');try{fresh=await api('/api/state');stamp('readback_2_end');}catch{message('保存对象已核对，但当前交接状态未知；请查询原请求，勿重放原保存请求。',true);return false;}
 if(interactionEpoch!==finalEpoch){message('保存已核对；新的操作改变了当前交接条件，请重新读取。');return false;}
 const handoff=observationReadback(fresh as unknown as PanelRoiSnapshot,expected);
 if(handoff.saved)state=fresh;trace.outcome=handoff.ready?'ready':'saved_handoff_blocked';
 const waitingOnSavedResult=handoff.saved&&Boolean(fresh.pending_result);
 message(handoff.ready?(geometryOnly?'ROI 位置已保存并读回核对；可继续添加 ROI，观察理由尚未填写。':'ROI 观察已保存并读回可接续；来源为调用者声明，不确认物相。'):waitingOnSavedResult?'ROI 观察已保存并读回核对；仍有待查看结果，处理后才能交给 Agent。':`观察对象已保存；${handoff.reason}。`,!handoff.ready&&!waitingOnSavedResult);
 return handoff.saved;
}
async function saveRoiObservation(reason:string,{geometryOnly=false,allowEmptyReason=false}={}){
 if(!allowContentEditing())return;
 requireLatestRoiRevision();
 if(windowSwitch)throw new Error('切换接续中，先核对当前图像。');if(!geometryOnly&&!allowEmptyReason&&!reason.trim())throw new Error('请填写观察理由；不需要先确认物相或缺陷。');checkObservationNote(reason,'note');if(busy||drag||autoFailed||observationSavePhase)throw new Error('先完成手势或恢复原保存请求。');
 const submittedDraft=$('roi-reason').value,calibration=state.object.xy_calibration??null;
 const picked=selection();if(picked.kind!=='rectangle'||picked.coordinate_space!=='source_pixels')throw new Error('保存观察需要原图上的矩形 ROI');selectionRectangle(picked);
 const saved=geometryOnly?undefined:state.object.annotations?.find(m=>m.annotation_id===selectedId&&m.kind==='rectangle'&&m.anchor?.source_object_id===picked.source_object_id&&m.anchor.coordinate_space===picked.coordinate_space&&equalRecords(m.anchor.coordinates,picked.coordinates));
 const intent={purpose:observationPurpose,selection_origin:'researcher'},markId=saved?.annotation_id??internalMarkId(()=>crypto.randomUUID());
 const started=now(),trace={outcome:'unconfirmed',elapsed_ms:{} as Record<string,number>};observationSaveStarted=started;observationSaveTrace=trace;
 const stamp=(step:string)=>{trace.elapsed_ms[step]=now()-started;};
 if(geometryOnly)roiCreationRecovery={annotation_id:markId,source_object_id:picked.source_object_id,coordinates:[...picked.coordinates],note:'',selection_origin:'researcher',xy_calibration:calibration,object_id:null,request_id:null};
 observationSavePhase='submitting';diagnostics();message('正在提交 ROI 观察；保存与读回校验完成后才能交接。');
 try{
 const result=saved?await act('edit',{updates:[{annotation_id:markId,note:reason,...intent}]}):await act('mark',{selection:picked,annotation_id:markId,...intent,text:`ROI ${((state.object.annotations??[]).filter(m=>m.kind==='rectangle').length)+1}`,note:reason,color:'cyan',status:'hypothesized',presentation:{layer:'experimental'}});
 if(!result){if(geometryOnly)autoFailed=true;return;}
 if(geometryOnly&&roiCreationRecovery){roiCreationRecovery.object_id=result.object.object_id;roiCreationRecovery.request_id=typeof result.object.request_id==='string'?result.object.request_id:null;}
 const expected={object_id:result.object.object_id,annotation_id:markId,source_object_id:picked.source_object_id,coordinates:picked.coordinates,note:reason,selection_origin:'researcher',xy_calibration:calibration};
 if(await verifyRoiObservation(result,expected,submittedDraft,geometryOnly,stamp,trace)&&geometryOnly){roiCreationRecovery=null;autoFailed=false;setMode('select');}
 }finally{observationSavePhase='';stamp('final_ui');diagnostics();}
}
function createRoiGeometry(){
 roiCreationSave=(async()=>{try{await saveRoiObservation('',{geometryOnly:true});}catch(error){message((error as Error).message,true);}finally{roiCreationSave=null;diagnostics();await publishDraft({includeSelection:true,urgent:true});}})();
}
async function recoverRoiCreation(){
 if(!roiCreationRecovery||roiCreationSave||observationSavePhase)return;const original=roiCreationRecovery,submittedDraft=$('roi-reason').value;
 roiCreationSave=(async()=>{observationSavePhase='submitting';diagnostics();try{const result=await act('recover',original.request_id?{request_id:original.request_id}:{});if(!result||!roiCreationRecovery)return;if($('roi-reason').value!==submittedDraft||researchWorkspace.reasonDirty){message('原请求已查询；较新的观察说明保留，未清除新草稿，请处理后再核对。',true);return;}original.object_id=result.object.object_id;const expected={...original,object_id:result.object.object_id};if(await verifyRoiObservation(result,expected,submittedDraft,true,()=>{}, {outcome:'unconfirmed'})){roiCreationRecovery=null;autoFailed=false;}}catch(error){message((error as Error).message,true);}finally{observationSavePhase='';roiCreationSave=null;diagnostics();await publishDraft({includeSelection:true,urgent:true});}})();await roiCreationSave;
}
function dataProbeState(){const current=measurementWorkspace.current;return state&&current?.object_id===state.object.object_id?{...state,object:{...state.object,scientific_grid_identity:current.scientific_grid_identity,dtype:current.dtype,xy_calibration:current.xy_calibration}}:state;}
async function refreshMeasurements(){const ok=await measurementWorkspace.refresh();if(ok){if(initialResultLayout){initialResultLayout=false;$('measurement-workspace').open=false;}renderMeasurement();dataProbes.refreshCurrent();dataProbes.restoreSavedResults(state.numeric_results??{});if(['statistics','profile'].includes(state.last_operation?.kind as string))dataProbes.renderResult(state.last_operation);}return ok;}
function selectMeasurement(entry:MeasurementEntry|null){
 if(windowSwitch||observationSavePhase||roiCreationRecovery){message('保存或窗口切换接续中，先核对当前图像。',true);return;}
 if(!entry)return;
 if(requiresMeasurementJump(entry)){message('这条结果属于另一帧、视野外或旧版峰位；请点“跳到结果原视图”明确查看。');return;}
 const mark=state.object.annotations?.find(value=>value.annotation_id===entry.annotation_id);
 if(mark){chooseMark(mark.annotation_id!);const panel=markPanel(mark);draft={kind:mark.kind,...mark.anchor!,panel,rendered:transformCoordinates(mark.anchor!.coordinates,panel,{inverse:true})} as AppSelection;}
 else{message('当前视图没有这条结果的保存标记；可显式跳到其原视图。');return;}
 measurementWorkspace.select(entry.object_id,{notify:false});marksDirty=true;showDraft();record();schedulePaint();publishDraft({includeSelection:true,urgent:true});
}
async function jumpMeasurement(entry:MeasurementEntry|null){if(windowSwitch)throw new Error('窗口切换接续中，先核对当前图像。');if(!entry)return;const r=await act('measurement-jump',{measurement_object_id:entry.object_id});if(r)measurementWorkspace.select(entry.object_id);}
async function updateMeasurement(entry:MeasurementEntry|null){
 if(windowSwitch)throw new Error('窗口切换接续中，先核对当前图像。');
 if(!entry)return;if(!entry.same_grid||!entry.visible_in_current_view)throw new Error('先显式跳到结果原视图，再更新该测量');
 const mark=state.object.annotations?.find(value=>value.annotation_id===entry.annotation_id);
 if(!mark)throw new Error('当前视图缺少原标记，请先跳到结果原视图');
 const panel=markPanel(mark);return act('measure',{selection:{...mark.anchor,kind:mark.kind,panel},annotation_id:mark.annotation_id,measurement_object_id:entry.object_id});
}
const displayDraft=()=>({gamma:Number($('gamma').value),low:$('low').value,high:$('high').value,axes:$('axes').checked,scale:$('scale').checked});
const complexComponentNames:Partial<Record<string,string>>={real:'实部',imag:'虚部',amplitude:'幅值',power:'功率'};
const importedComplex=()=>!state?.object?.panels?.some(p=>p.domain==='frequency')&&(/^complex(?:64|128)$/.test(state?.object?.dtype??'')||Object.hasOwn(complexComponentNames,(state?.effective_display??state?.object?.display??{}).component as string));
const dirty=()=>Boolean(researchWorkspace.reasonDirty||orphanedDraft||roiCreationRecovery&&!observationSavePhase||queuedEdits.size||editCoordinates||labelDraft||fieldDirty||remeasuringMarks.size||failedMeasurement||JSON.stringify(displayDraft())!==displayBaseline);
function diagnostics(){
 workspaceControls.sync();
 if(!windowSwitch&&!observationSavePhase&&!roiCreationRecovery)restoreScientificControls();
 windowWorkspace.flushDeferredLayout();
 const status=windowSwitch?'窗口切换接续中 · 科学输入暂停':autoFailed?'保存失败 · 草稿保留':observationSavePhase==='submitting'?'正在提交观察':observationSavePhase?'观察已保存 · 正在核对交接':busy?(activeAction==='return-spatial'?'正在读取空间观察':activeAction==='show'?'正在打开保存视图':activeAction==='fft'?'正在计算 FFT':activeAction==='measure'?'正在测量':'正在保存'):state?.last_operation?.state==='not_submitted'?'原请求未提交 · 编辑保留，明确保存才发新请求':queuedEdits.size?'等待保存':dirty()?'本地草稿':draft?'选择已就绪':state?.workspace_analysis?'工作编辑已记录 · 原图只读':'已保存 · 原图只读';
 $('performance-data').textContent=JSON.stringify({...perf,observation_save:observationSaveTrace,dirty:dirty(),gesture_active:Boolean(drag),draft_revision:historyDraft.revision,object_id:state?.object.object_id,scale:view.scale,busy,queued_edits:queuedEdits.size});$('draft-status').textContent=status;$('autosave-status').textContent=state?.workspace_analysis?'工作编辑即时记录':status;
 showPending();
 const undo=userHistory.peek('undo'),redo=userHistory.peek('redo');
 const selectedRoi=state?.object.annotations?.find(mark=>mark.annotation_id===selectedId&&mark.kind==='rectangle'&&mark.status!=='retracted');
 $('delete-roi').hidden=!selectedRoi&&!(draft?.kind==='rectangle'&&!selectedId);
 $('delete-roi').disabled=$('delete-roi').hidden||busy||Boolean(drag)||dirty()||autoFailed||Boolean(pending||state?.pending_result)||state?.last_operation?.state==='submitted';
 $('undo').disabled=!undo&&!labelDraft&&!fieldDirty;$('redo').disabled=!redo;
 $('undo').title=undo?'撤销：'+undo.label:'没有可撤销操作';$('redo').title=redo?'恢复：'+redo.label:'没有可恢复操作';
 for(const [id,action]of [['apply-roi','roi'],['fft','fft'],['measure','measure'],['share','select'],['full','full'],['roi-statistics','statistics'],['line-profile','profile']]){
  const button=$(id);if(!button)continue;if(id==='roi-statistics')button.hidden=draft?.kind!=='rectangle';if(id==='line-profile')button.hidden=!['line','arrow'].includes(draft?.kind as string);const reason=action==='fft'&&importedComplex()?'复数原图暂不支持 FFT；不会丢弃虚部或把显示幅值当作原数组':selectionActionReason(action,draft,state?.object??{}),waiting=Boolean(pending||state?.pending_result)&&['roi','fft','full'].includes(action);button.disabled=Boolean(reason)||busy||Boolean(drag)||waiting;button.title=(waiting?'先处理已经保存的待查看结果；窗口已满时先关闭一个只读显示。':reason||({roi:'查看选定区域',fft:'计算当前实空间 ROI 的 FFT',measure:'保存测量结果',select:'可选：把当前选择交给 Agent',full:'仅恢复完整频谱，不返回原图',statistics:'读取保存科学数组的 ROI 统计',profile:'读取当前线的原数组剖面'} as Partial<Record<string,string>>)[action])!;
 }
 for(const [id,target]of [['view-back',savedViews.target(-1)],['view-forward',savedViews.target(1)],['view-original',savedViews.original(state)]] as const)if($(id))$(id).disabled=!target||busy||Boolean(drag)||Boolean(pending||state?.pending_result)||target.id===state?.object?.object_id;
 const sourceTarget=savedViews.original(state);$('view-original').textContent=sourceTarget?.freshSourceView?'全帧（新显示）':'原图';$('view-original').title=sourceTarget?.freshSourceView?'没有已保存的原图显示配方；使用当前标定新建全帧预览，不重算 FFT':'打开本帧已保存的原图视图';
 const latestRoi=latestRoiTarget();$('view-latest-roi').hidden=!latestRoi;$('view-latest-roi').disabled=!latestRoi||busy||Boolean(drag)||dirty()||Boolean(pending||state?.pending_result)||Boolean(windowSwitch)||Boolean(observationSavePhase);$('view-latest-roi').title='明确打开保留的最新 ROI 保存视图；不改写此 FFT 的历史输入';
 const frequencyView=state?.object?.panels?.some(p=>p.domain==='frequency'),returnReady=state?.spatial_return?.version===1&&state.spatial_return.status==='ready'&&Boolean(state.spatial_return.view_object_id),unresolvedReturn=autoFailed||state?.last_operation?.state==='submitted',returnBlocked=dirty()||busy||Boolean(drag)||Boolean(pending||state?.pending_result)||unresolvedReturn;
 $('return-spatial').hidden=!frequencyView;$('return-spatial').disabled=!returnReady||returnBlocked;
 $('return-spatial').title=!returnReady?spatialReturnReason():unresolvedReturn?'原请求尚未确认；先查询原请求，不通过导航隐藏未知结果。':returnBlocked?'先保存或撤销草稿、结束手势并处理待查看结果，再返回空间观察。':'打开计算此 FFT 前的保存空间观察，恢复该版本的 ROI、说明与标定；不重算 FFT。';
 $('spatial-return-status').hidden=!frequencyView||Boolean(returnReady);$('spatial-return-status').textContent=returnReady?'':spatialReturnReason();
 $('complex-component').disabled=busy||Boolean(drag);$('apply-complex-component').disabled=busy||Boolean(drag)||!importedComplex();
 if($('view-current'))$('view-current').textContent=savedViews.entries[savedViews.index]?.role??'当前视图';
 if(state)researchWorkspace.render(researchSnapshot(),{busy:busy||workspaceSettling||workspaceRestoring||Boolean(windowSwitch)||Boolean(roiCreationRecovery&&!observationSavePhase),gesture:Boolean(drag),observationSavePhase});showDraft();lockScientificControls();
}
function setResultsTab(tab:string,{expand=true}={}){
 if(!['measurements','statistics','profile'].includes(tab))return;
 for(const name of ['measurements','statistics','profile']){const button=$('results-tab-'+name),panel=$('results-'+name);if(button){button.setAttribute('aria-selected',String(name===tab));button.tabIndex=name===tab?0:-1;}if(panel)panel.hidden=name!==tab;}
 if($('numeric-data'))$('numeric-data').open=tab!=='measurements';
 if(expand&&$('measurement-workspace'))$('measurement-workspace').open=true;
}
function rememberSelection(before:SelectionSnapshot,after:SelectionSnapshot){userHistory.push({kind:'selection',label:'更改选区',scope:workflowScope(state),before,after});}
function setDisplayDraft(value:DisplayDraft){$('gamma').value=value.gamma;$('low').value=value.low;$('high').value=value.high;$('axes').checked=value.axes;$('scale').checked=value.scale;$('gamma-label').textContent=String(value.gamma);lastUserDisplay=displayDraft();}
function recordDisplayInput(id:string){
 if(!allowContentEditing()){setDisplayDraft(lastUserDisplay??JSON.parse(displayBaseline));return false;}
 commitLabelDraft();captureSelected();const before:DisplayDraft=lastUserDisplay??JSON.parse(displayBaseline),after=displayDraft();
 userHistory.push({kind:'display',label:id==='gamma'?'调整 Gamma':id==='low'||id==='high'?'调整显示范围':'调整显示辅助',scope:workflowScope(state),before,after},{group:'display:'+id});lastUserDisplay=after;return true;
}
function applyUserHistory(direction:string){
 if(!allowContentEditing())return;
 if(windowSwitch||observationSavePhase||roiCreationRecovery){message('保存或窗口切换接续中，先核对当前图像。',true);return;}
 if(drag||autoFailed){message('先结束手势或恢复未确认的原请求，再撤销。',true);return;}
 commitLabelDraft();captureSelected();userHistory.endGroup();const item=userHistory.peek(direction);if(!item)return;
 if(item.scope!==workflowScope(state)){message('此操作属于另一科学视图；未修改当前数据。',true);return;}
 const undo=direction==='undo',value=undo?item.before:item.after,expected=undo?item.after:item.before;
 if(item.kind==='annotation'){
  const current=effectiveEdit((value as AnnotationEdit).annotation_id);if(!current||Object.entries(expected as AnnotationEdit).some(([k,v])=>k!=='annotation_id'&&!equalRecords(current[k],v))){message('标记已被后续操作修改；没有用旧操作覆盖它。',true);return;}
  const mark=state.object.annotations?.find(candidate=>candidate.annotation_id===(value as AnnotationEdit).annotation_id),coordinates=(value as AnnotationEdit).coordinates;
  if(mark?.anchor&&coordinates&&selectedId===mark.annotation_id&&draft?.kind===mark.kind&&draft.source_object_id===mark.anchor.source_object_id&&draft.coordinate_space===mark.anchor.coordinate_space&&equalRecords(draft.coordinates,current.coordinates)){
   const panel=markPanel(mark);draft={...draft,coordinates:[...coordinates],panel,rendered:transformCoordinates(coordinates,panel,{edges:mark.kind==='rectangle'||mark.kind==='polygon',inverse:true})} as AppSelection;
   record();showDraft();schedulePaint();publishDraft({includeSelection:true,urgent:true});
  }
  queueEdit(value as AnnotationEdit,null,{undo:false});
 }else if(item.kind==='display'){setDisplayDraft(value as DisplayDraft);record();schedulePaint();publishDraft({urgent:true});}
 else if(item.kind==='selection'){
  const restored=(value as SelectionSnapshot)?.draft?restoredSelection((value as SelectionSnapshot).draft,state.object.panels??[]):null;
  if((value as SelectionSnapshot)?.draft&&!restored){message('选区不属于当前科学网格；未恢复旧坐标。',true);return;}
  const selectionId=(value as SelectionSnapshot)?.selectedId;
  if(selectionId&&!(state.object.annotations??[]).some(m=>m.annotation_id===selectionId&&m.status!=='retracted')){message('该选区标记已撤回；未把旧选择当作当前 ROI。请先撤销撤回操作。',true);return;}
  selectedId=selectionId??'';syncMarkFields(false);draft=restored;record();showDraft();schedulePaint();publishDraft({includeSelection:true,urgent:true});
 }
 userHistory.finish(direction,item);diagnostics();message((undo?'已撤销：':'已恢复：')+item.label+(item.kind==='annotation'?'；保存补偿版本，历史记录保留。':item.kind==='display'?'；当前为显示草稿，保存显示后可导出。':''));
}
function spatialReturnReason(){
 const code=state?.spatial_return?.reason_code;
 if(code==='different_calibration')return '保存空间观察与原始 FFT 的标定依赖不匹配；不会把另一标定版本冒充原观察。';
 const reasons:Record<string,string>={no_saved_return:'此 FFT 没有已核对的空间观察引用；已有源帧入口不等于原观察。',legacy_checkpoint_missing:'旧工作区记录没有空间观察返回引用；不会猜测原观察。',invalid_reference:'空间观察返回引用无效；当前视图保留。',target_unavailable:'暂时无法读回保存空间观察；当前视图保留，恢复来源后正常重开工作区以重新核对。',missing_saved_preview:'原空间观察没有可读取的保存预览；不会自动生成替代图。',invalid_saved_preview:'原空间观察预览校验未通过；当前视图保留。',not_spatial:'引用目标不是明确的单一空间视图；当前视图保留。',different_frame:'原空间观察与当前源帧不匹配；不会切换到其他帧。',different_fft:'此 FFT 不属于记录的空间观察转换；不会按同帧或最近记录猜测。',different_fft_support:'FFT 支撑范围与原观察转换记录不匹配；当前视图保留。',already_at_spatial_view:'当前已是对应的保存空间观察。'};
 return reasons[code??'no_saved_return']??'空间观察引用暂不可用；当前视图保留，请检查来源或重新读取状态。';
}
async function returnToSpatialObservation(){
 if(state?.spatial_return?.version!==1||state.spatial_return.status!=='ready'||!state.spatial_return.view_object_id){message(spatialReturnReason(),true);return;}
 if(autoFailed||state.last_operation?.state==='submitted'){message('原请求尚未确认；先查询原请求，不通过导航隐藏未知结果。',true);return;}
 if(dirty()||busy||drag||pending||state.pending_result){message('先保存或撤销草稿、结束手势并处理待查看结果，再返回空间观察。',true);return;}
 await act('return-spatial');
}
async function navigateSavedView(target:SavedViewEntry|null|undefined){
 if(!target||target.id===state.object.object_id)return;
 const window=!target.freshSourceView&&state.window_collection?.windows.find(entry=>entry.object_id===target.id);
 if(window){await activateWindow(window.window_id,window.object_id);return;}
 if(windowSwitch||autoFailed||state.last_operation?.state==='submitted'){message('先核对当前窗口及原请求，再切换保存视图；不会通过导航隐藏未知结果。',true);return;}
 if(dirty()||busy||drag||pending||state.pending_result||observationSavePhase){message('先保存或撤销草稿，并处理待查看结果，再切换保存视图。',true);return;}
 await act('show',{object_id:target.id,...(target.freshSourceView?{source_view:true}:{})});
}
async function api(url:'/api/probe',body:Readonly<Record<string,unknown>>):Promise<ProbeResult>;
async function api(url:'/api/composition/resolve',body:Readonly<Record<string,unknown>>):Promise<{panels:CompositionPanel[]}>;
async function api(url:`/api/measurements${string}`,body?:Readonly<Record<string,unknown>>):Promise<import('./presentation-contracts.mjs').MeasurementResponse>;
async function api(url:'/api/action',body:DraftPublication):Promise<AppDraftAck>;
async function api(url:'/api/action',body:StatefulActionRequest):Promise<AppState>;
async function api(url:'/api/state'):Promise<AppState>;
async function api(url:'/api/revision'):Promise<AppRevision>;
async function api(url:string,body?:Readonly<Record<string,unknown>>):Promise<unknown>;
async function api(url:string,body?:Readonly<Record<string,unknown>>):Promise<unknown>{if(recoveryPending()&&url==='/api/workspace'&&body?.action==='adopt-comparison')throw new Error('先恢复或明确放弃未保存恢复副本，再纳入新的分析结果。');if(url==='/api/action'&&body&&!['draft','window-layout','window-context','window-camera','close-window'].includes(String(body.action)))interactionEpoch++;const response=await fetch(url,{method:body?'POST':'GET',headers:{'X-Panel-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw new Error(((result as {error?:unknown}).error??'本地服务失败') as string);const analysis=(result as AppState).workspace_analysis;if(state&&analysis&&analysis.working_revision>=(state.workspace_analysis?.working_revision??-1)&&(analysis.saved_revision??0)>=(state.workspace_analysis?.saved_revision??0)){state={...state,workspace_analysis:analysis};workspaceControls.sync();}return result;}
function selection(){if(!draft)throw new Error('先在图中选择位置或区域');const {rendered,...s}=draft;return s;}
function annotationEditDraft(){
 if(selectedId&&labelDraft)return {annotation_id:selectedId,presentation:labelDraft,...(editCoordinates?{coordinates:[...editCoordinates]}:{}),...(fieldDirty?{text:$('mark-text').value,color:$('color').value,status:$('status').value}:{})};
 if(selectedId&&queuedEdits.has(selectedId)&&!editCoordinates&&!fieldDirty){const {note,presentation_replace,...edit}=queuedEdits.get(selectedId)!.update;return edit;}
 if(!selectedId||!editCoordinates&&!fieldDirty){
  const prior=orphanedDraft?state.edit_state?.annotation_edit:null;
  return prior?Object.fromEntries(['annotation_id','coordinates','text','color','status'].filter(k=>prior[k]!==undefined).map(k=>[k,prior[k]])):null;
 }
 return {annotation_id:selectedId,...(editCoordinates?{coordinates:[...editCoordinates!]}:{}),...(fieldDirty?{text:$('mark-text').value,color:$('color').value,status:$('status').value}:{})};
}
function publishDraft({gesture_active=Boolean(drag),includeSelection=false,urgent=false,confirmPersistence=false,allowSwitch=false}={}){
 if(!state||windowSwitch&&windowSwitch.phase!=='preparing'&&!allowSwitch)return Promise.resolve();const object_id=state.object.object_id,params={draft_revision:historyDraft.revision,dirty:dirty()||gesture_active,gesture_active,annotation_edit:annotationEditDraft(),...(confirmPersistence?{confirm_persistence:true}:{}),...(includeSelection?{selection:draft?selection():null}:{})};
 draftPending={expected_object_id:object_id,action:'draft',lightweight:true,params,urgent:urgent||gesture_active};
 if(!draftSending){draftSending=true;draftPublisher=(async()=>{try{while(draftPending){if(!draftPending.urgent&&typeof setTimeout==='function')await new Promise(r=>setTimeout(r,70));const body=draftPending;draftPending=null;delete body.urgent;try{await api('/api/action',body);draftError=null;}catch(e){draftError=e;message('草稿交接未确认：'+(e as {message:string}).message,true);}}}finally{draftSending=false;workspaceControls.sync();}})();}
 workspaceControls.sync();
 return draftPublisher;
}
function effectiveEdit(id:string|undefined):CompleteAnnotationEdit|null{const mark=(state.object.annotations??[]).find(m=>m.annotation_id===id);if(!mark?.anchor)return null;return {annotation_id:id,coordinates:[...mark.anchor!.coordinates],text:mark.text??'',color:mark.color,status:mark.status,presentation:JSON.parse(JSON.stringify(mark.presentation??{})),...(queuedEdits.get(id)?.update??{})};}
function clearRetractedSelection(){
 const mark=state.object.annotations?.find(value=>value.annotation_id===selectedId&&value.status==='retracted'),anchor=mark?.anchor;
 if(!mark||!anchor||!draft||drag||fieldDirty||labelDraft||editCoordinates||draft.kind!==mark.kind||draft.source_object_id!==anchor.source_object_id||draft.coordinate_space!==anchor.coordinate_space||!equalRecords(draft.coordinates,anchor.coordinates))return;
 selectedId='';draft=null;syncMarkFields(false);record();showDraft();publishDraft({includeSelection:true,urgent:true});
}
function queueEdit(update:AnnotationEdit,before:AnnotationEdit|null=null,{undo=true}:{undo?:boolean}={}){
 if(!allowContentEditing())return;
 const prior=before??effectiveEdit(update.annotation_id);if(!prior)return;
 const after={...effectiveEdit(update.annotation_id)!,...update} as CompleteAnnotationEdit,changedGeometry=JSON.stringify(prior.coordinates)!==JSON.stringify(after.coordinates),numericLabel=queuedEdits.get(update.annotation_id)?.numericLabel??(changedGeometry&&prior.presentation?.label?.measurement_object_id?remeasuringMarks.get(update.annotation_id)?.numericLabel??prior.presentation.label:null);
 if(update.presentation&&!equalRecords(prior.presentation,after.presentation))after.presentation_replace=true;
 if(changedGeometry&&numericLabel)after.presentation={...after.presentation,label:{...after.presentation.label,visible:false}};
 if(JSON.stringify(prior)===JSON.stringify(after)){if(queuedEdits.has(update.annotation_id))Promise.resolve().then(flushEdits);return;}
 if(undo){const keys=Object.keys(update).filter(k=>!['annotation_id','presentation_replace','note'].includes(k)&&!equalRecords(prior[k],update[k]));if(keys.length){const project=(value:AnnotationEdit)=>({annotation_id:update.annotation_id,...Object.fromEntries(keys.map(k=>[k,value[k]]))});userHistory.push({kind:'annotation',label:changedGeometry?'移动科学标记':'调整标注',scope:workflowScope(state),before:project(prior),after:project(after)});}}
 if(changedGeometry)geometryRevisions.set(update.annotation_id,(geometryRevisions.get(update.annotation_id)??0)+1);
 queuedEdits.set(update.annotation_id,{update:after,sequence:++autoSequence,geometryRevision:geometryRevisions.get(update.annotation_id)??0,geometryChanged:queuedEdits.get(update.annotation_id)?.geometryChanged||changedGeometry,numericLabel});marksDirty=true;record();schedulePaint();publishDraft({urgent:true});Promise.resolve().then(flushEdits);
}
function captureSelected(){if(!selectedId||!editCoordinates&&!fieldDirty)return false;const before=fieldBefore??effectiveEdit(selectedId),update={annotation_id:selectedId,text:$('mark-text').value,color:$('color').value,status:$('status').value,...(editCoordinates?{coordinates:[...editCoordinates!]}:{})};editCoordinates=null;fieldDirty=false;fieldBefore=null;queueEdit(update,before);return true;}
function flushEdits(){
 if(autoSaving)return autoSaving;
 if(busy||drag||autoFailed||explicitEditRetry||roiCreationRecovery||!queuedEdits.size||windowSwitch&&(windowSwitch.phase!=='preparing'||autoSequence!==windowSwitch.auto_sequence))return Promise.resolve();
 autoSaving=saveFirstEdit().finally(()=>{autoSaving=null;workspaceControls.sync();if(!autoFailed&&queuedEdits.size&&!drag)Promise.resolve().then(flushEdits);});return autoSaving;
}
function editWire(id:string|undefined,sent:QueuedEdit){const saved=(state.object.annotations??[]).find(m=>m.annotation_id===id),wire:AnnotationEdit={annotation_id:id};for(const [field,value]of Object.entries(sent.update)){if(field==='annotation_id')continue;const old=field==='coordinates'?saved!.anchor!.coordinates:field==='presentation'?saved!.presentation??{}:saved![field]??(field==='text'?'':undefined);if(!equalRecords(value,old))wire[field]=value;}if(wire.presentation_replace)wire.presentation=sent.update.presentation;if(saved?.purpose===observationPurpose&&(wire.coordinates!==undefined||wire.note!==undefined))wire.selection_origin='researcher';return wire;}
async function saveFirstEdit(){
 const [id,sent]=queuedEdits.entries().next().value!,submittedObject=state.object.object_id;let measurementTarget:MeasurementTarget|null=null;busy=true;diagnostics();
 try{
  await publishDraft({urgent:true});if(draftError)throw draftError;
  const wire=editWire(id,sent),layoutOnly=(w:AnnotationEdit)=>Object.keys(w).every(k=>['annotation_id','presentation','presentation_replace'].includes(k)),batch:[string|undefined,QueuedEdit][]=layoutOnly(wire)?[...queuedEdits].filter(([key,value])=>layoutOnly(editWire(key,value))).slice(0,100):[[id,sent]];
  if(Object.keys(wire).length===1){if(queuedEdits.get(id)===sent)queuedEdits.delete(id);return;}
  const updates=batch.map(([key,value])=>editWire(key,value)).filter(w=>Object.keys(w).length>1);
  const r=await api('/api/action',{expected_object_id:submittedObject,draft_revision:historyDraft.revision,action:batch.length>1?'edit-layout':'edit',params:{updates,auto_commit:true}});
  if(!r.auto_edit_committed)throw new Error('未能安全接续自动保存；草稿保留，请查询原请求');
  for(const [key,value]of batch)if(queuedEdits.get(key)===value){queuedEdits.delete(key);if(selectedId===key&&!drag&&!fieldDirty&&JSON.stringify(editCoordinates)===JSON.stringify(value.update.coordinates))editCoordinates=null;}
  // Annotation-only adoption uses identical provider panel mappings. Keep the
  // current gesture/camera/local edits; no decode or full bitmap work here.
 state=r;clearRetractedSelection();windowWorkspace.sync(state);savedViews.remember(state,{replace:true});for(const [key]of batch){const saved=state.object.annotations!.find(m=>m.annotation_id===key)!,option=[...($('existing').options??$('existing').children)].find(o=>o.value===key);if(option){option.textContent=`${saved.text??''} · ${({hypothesized:'候选',user_confirmed:'用户确认',retracted:'撤回'} as Partial<Record<string,string>>)[saved.status as string]??''}`;option.disabled=saved.status==='retracted';}}if(batch.some(([key])=>key===selectedId)&&!drag&&!fieldDirty&&!labelDraft){const mark=state.object.annotations!.find(m=>m.annotation_id===selectedId)!;$('mark-text').value=mark.text??'';const option=$('existing').selectedOptions?.[0];if(option)option.textContent=`${mark.text??''} · ${({hypothesized:'候选',user_confirmed:'用户确认',retracted:'撤回'} as Partial<Record<string,string>>)[mark.status as string]??''}`;syncPresentationFields();}marksDirty=true;showDraft();showPending();schedulePaint();message(sent.geometryChanged?'科学锚点已修订；旧版本保留。':'标签／样式已保存；科学锚点未改变。');
  if(wire.coordinates!==undefined&&(measurementWorkspace.hasAnnotation(id!)||measuredMarkId===id||sent.numericLabel)){const mark=r.object.annotations!.find(m=>m.annotation_id===id)!,panels=r.object.panels.filter(p=>p.source_object_id===mark.anchor!.source_object_id&&coordinateSpace(p)===mark.anchor!.coordinate_space);if(panels.length===1)measurementTarget={previousMeasurement:measurementWorkspace.latestForAnnotation(id!)?.object_id,id,submittedObject,savedObject:r.object.object_id,sequence:sent.sequence,geometryRevision:sent.geometryRevision,anchor:JSON.parse(JSON.stringify(mark.anchor)),kind:mark.kind,status:mark.status,panel:JSON.parse(JSON.stringify(panels[0])),calibration:r.object.xy_calibration??null,numericLabel:sent.numericLabel};}
 }catch(e){autoFailed=true;message('自动保存失败，编辑仍保留。请查询原请求，勿重复提交：'+(e as {message:string}).message,true);}
 finally{busy=false;diagnostics();await publishDraft({includeSelection:true,urgent:true});if(!autoFailed&&measurementTarget)await remeasureSavedEdit(measurementTarget);}
}
function currentMeasurementTarget(target:MeasurementTarget){const latest=effectiveEdit(target.id),mark=state.object.annotations!.find(m=>m.annotation_id===target.id);return Boolean(latest&&mark?.status===target.status&&(geometryRevisions.get(target.id)??0)===target.geometryRevision&&equalRecords(latest.coordinates,target.anchor.coordinates)&&equalRecords(state.object.xy_calibration??null,target.calibration)&&state.object.panels.some(p=>equalRecords(p,target.panel))&&!(selectedId===target.id&&editCoordinates&&!equalRecords(editCoordinates,target.anchor.coordinates))&&(!target.numericLabel||latest.presentation.label?.measurement_object_id===target.numericLabel.measurement_object_id));}
function applyBoundMeasurement(target:MeasurementTarget,m:AppOperation|null|undefined){
 if(!currentMeasurementTarget(target))return false;
 const points=target.kind==='point'?m?.points?.[1]:m?.points?.flat();
 if(!m?.object_id||m.kind!=='measure'||m.coordinate_space!==target.anchor.coordinate_space||!equalRecords(points,target.anchor.coordinates))throw new Error('测量返回的科学锚点与已保存标注不一致；旧标签保持隐藏');
 state={...state,last_operation:{...m,annotation_id:target.id}};renderMeasurement();
 if(target.numericLabel){const period=target.numericLabel.measurement_kind==='period',value=period?m.d_spacing:m.physical_distance,unit=period?m.d_spacing_unit:m.physical_unit;if(Number.isFinite(value)&&typeof unit==='string'&&unit){const label=`d = ${Number((value as number).toPrecision(4))} ${unit}`,p=effectiveEdit(target.id)!.presentation;queueEdit({annotation_id:target.id,text:label,note:`Measured by image_measure record ${m.object_id}`,presentation:{...p,label:{...p.label,text:label,visible:target.numericLabel.visible!==false,measurement_object_id:m.object_id,measurement_kind:period?'period':'distance'}}},null,{undo:false});}else message('锚点已更新；新测量没有可信物理单位，旧数值标签保持隐藏。',true);}
 return true;
}
async function remeasureSavedEdit(target:MeasurementTarget){
 if(!currentMeasurementTarget(target))return;
 const boundSelection={...target.anchor,kind:target.kind,panel:target.panel};busy=true;remeasuringMarks.set(target.id,target);schedulePaint();diagnostics();
 try{await publishDraft({urgent:true});if(draftError)throw draftError;const r=await api('/api/action',{expected_object_id:target.savedObject,draft_revision:historyDraft.revision,action:'measure',params:{selection:boundSelection,annotation_id:target.id,...(target.previousMeasurement?{measurement_object_id:target.previousMeasurement}:{})}});if(r.object.object_id!==target.savedObject){pending=r;showPending();return;}applyBoundMeasurement(target,r.last_operation);remeasuringMarks.delete(target.id);}
 catch(e){failedMeasurement={...target,request_id:(e as {message:string}).message.match(/Original request_id=([A-Za-z0-9_-]{1,64})/)?.[1]??null};autoFailed=true;message('重新测量未确认；锚点与草稿保留。请查询原请求，勿重复提交：'+(e as {message:string}).message,true);}
 finally{busy=false;marksDirty=true;schedulePaint();diagnostics();await refreshMeasurements();if(selectedId===target.id&&currentMeasurementTarget(target))measurementWorkspace.selectAnnotation(target.id);await publishDraft({includeSelection:true,urgent:true});}
}
function autoFields(){if(!selectedId)return;if(autoTimer!==null&&typeof clearTimeout==='function')clearTimeout(autoTimer);if(typeof setTimeout==='function')autoTimer=setTimeout(()=>{autoTimer=null;captureSelected();},350);}
function snapshot(){return {draft,editCoordinates,labelDraft,selectedId,fieldDirty,display:displayDraft(),fields:{id:$('mark-id').value,text:$('mark-text').value,color:$('color').value,status:$('status').value}};}
function record(){interactionEpoch++;historyDraft.replace(snapshot());diagnostics();}
function restoreSnapshot(value:LocalSnapshot){draft=(value as SelectionSnapshot).draft??null;editCoordinates=value.editCoordinates??null;labelDraft=value.labelDraft??null;selectedId=(value as SelectionSnapshot).selectedId??'';fieldDirty=value.fieldDirty??false;$('existing').value=selectedId;if(value.display){$('gamma').value=value.display.gamma;$('low').value=value.display.low;$('high').value=value.display.high;$('axes').checked=value.display.axes;$('scale').checked=value.display.scale;$('gamma-label').textContent=$('gamma').value;}if(value.fields)for(const [id,field]of [['mark-id','id'],['mark-text','text'],['color','color'],['status','status']])$(id).value=value.fields[field as keyof LocalSnapshot['fields']];syncPresentationFields();marksDirty=true;showDraft();schedulePaint();publishDraft({includeSelection:true});}
function schedulePaint(){if(paintFrame===null)paintFrame=requestAnimationFrame(()=>{paintFrame=null;paint();});}
function restoredSelection(value:AppSelection|null|undefined,panels:readonly WirePanel[]):AppSelection|null{if(!value)return null;const panel=panels.find(p=>p.source_object_id===value.source_object_id&&coordinateSpace(p)===value.coordinate_space&&equalRecords(p,value.panel));if(!panel)return null;try{return {...value,panel,rendered:transformCoordinates(value.coordinates,panel,{edges:['rectangle','polygon'].includes(value.kind),inverse:true})} as AppSelection;}catch{return null;}}
function markPanel(mark:AppMark){const matches=(state.object.panels??[]).filter(p=>p.source_object_id===mark.anchor?.source_object_id&&coordinateSpace(p)===mark.anchor!.coordinate_space);if(matches.length!==1)throw new Error('标注面板映射不唯一；请在明确的单一视图中编辑');return matches[0];}
function showPending(){
 const hasDraft=dirty(),gesturing=Boolean(drag);$('pending-result').hidden=!pending&&!state?.pending_result;
 $('pending-message').textContent=(state?.pending_result?.reason==='window_capacity'?((state.window_collection?.windows.length??5)>=5?'新结果已保存，显示窗口已满。请从“窗口列表”关闭一个只读窗口后查看；关闭显示不会删除科学结果。':'新结果已保存，显示窗口已有空位，可明确查看保存结果。'):'有新结果等待查看。查看会切换到该结果的保存版本，当前已保存版本仍保留。')+(hasDraft?'请先保存、撤销或明确放弃未保存草稿。':gesturing?'请先结束当前手势。':'');
 $('discard-draft').hidden=!hasDraft;$('discard-draft').disabled=busy||gesturing||Boolean(observationSavePhase)||Boolean(windowSwitch&&windowSwitch.phase!=='recovery');
 $('accept-agent-result').textContent='查看保存结果';$('accept-agent-result').disabled=hasDraft||busy||gesturing||Boolean(observationSavePhase)||Boolean(windowSwitch);
}
function positiveUnsubmittedRecovery(reply:AppState,expected?:string):string|null {
 const raw=reply.execution_recovery;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const receipt=raw as Record<string,unknown>;
 if(Object.keys(receipt).some(key=>!['state','request_id','automatic_retry'].includes(key))||receipt.state!=='not_submitted'||receipt.automatic_retry!==false||typeof receipt.request_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(receipt.request_id)||expected!==undefined&&receipt.request_id!==expected||reply.last_operation?.state!=='not_submitted'||reply.last_operation.request_id!==receipt.request_id)return null;
 return receipt.request_id;
}
async function act(action:string,params:ActionParams={}){
 if(recoveryPending()&&!['recover','export'].includes(action)&&!allowContentEditing())return;
 if(windowSwitch){message('窗口切换接续中，当前画面不接收科学写入；先核对当前图像。',true);return;}
 if(roiCreationRecovery&&!observationSavePhase&&action!=='recover'){message('当前 ROI 保存尚未核对；请查询原请求或明确处理草稿，不重复创建。',true);return;}
 if(['frame','roi','fft','export','preview','select'].includes(action)&&selectedId&&(editCoordinates||fieldDirty))captureSelected();
 if(busy){message('上一项保存仍在等待；可继续观察、缩放和平移。');return;}if(pending&&!['research-observation','accept-result','recover'].includes(action)){message('请先处理待查看结果；当前草稿仍保留。',true);return;}
 if(state?.pending_result&&['frame','roi','fft','preview','show','return-spatial','measurement-jump'].includes(action)){message(state.pending_result.reason==='window_capacity'?'新结果已保存但显示窗口已满；先从窗口列表关闭一个只读显示，再查看该结果，不要重复计算。':'先处理已经保存的待查看结果，再切换或生成新图；当前结果与草稿保留。',true);return;}
 if(dirty()&&['frame','roi','fft','calibrate','accept-result','show','return-spatial','measurement-jump'].includes(action)){message('先保存或撤销当前草稿，再切换科学视图；缩放、平移和选择仍可继续。',true);return;}
  const recoveryOriginal=typeof params.request_id==='string'?params.request_id:failedMeasurement?.request_id??roiCreationRecovery?.request_id??(['submitted','not_submitted'].includes(state.last_operation?.state??'')?state.last_operation?.request_id:undefined);
  const sentRevision=historyDraft.revision,start=now(),local=snapshot(),keepDisplay=dirty()&&['edit','mark'].includes(action)&&JSON.stringify(displayDraft())!==displayBaseline,keepMark=action==='preview'&&(editCoordinates||fieldDirty);activeAction=action;busy=true;diagnostics();
 try{await draftPublisher;if(state.panel_mapping_fingerprint&&!dirty()&&['fft','roi','show','return-spatial','frame','measurement-jump','preview'].includes(action)){await persistWindowContext();if(historyDraft.revision!==sentRevision||drag||dirty()||params.selection&&!equalRecords(params.selection,draft?selection():null))throw new Error('保存来源状态时选区或草稿已改变；未提交新的科学视图。');}const r=await api('/api/action',{expected_object_id:state.object.object_id,draft_revision:sentRevision,action,params});
   if(action==='recover'&&(r.execution_recovery!==undefined||r.last_operation?.state==='not_submitted')){
    const original=positiveUnsubmittedRecovery(r,typeof recoveryOriginal==='string'?recoveryOriginal:undefined);
    if(!original||r.object.object_id!==state.object.object_id)throw new Error('原请求的未提交证据尚未匹配；保留编辑并查询原请求，不重放。');
    if(failedMeasurement?.request_id&&failedMeasurement.request_id!==original||roiCreationRecovery?.request_id&&roiCreationRecovery.request_id!==original)throw new Error('较新的原请求仍未核对；保留当前草稿。');
    if(failedMeasurement){remeasuringMarks.delete(failedMeasurement.id);failedMeasurement=null;}
    roiCreationRecovery=null;autoFailed=false;explicitEditRetry=queuedEdits.size>0;
    state={...state,last_operation:r.last_operation,state_revision:Math.max(state.state_revision??0,r.state_revision??0)};
    message('原请求已确认未提交，编辑和临时 ROI 保留；请明确保存标记或测量，才会发起新请求。');return r;
   }
   if(r.pending_result&&r.object.object_id===state.object.object_id&&['frame','roi','fft','preview','show','return-spatial','measurement-jump'].includes(action)){state={...state,pending_result:r.pending_result,last_operation:r.last_operation,state_revision:Math.max(state.state_revision??0,r.state_revision??0)};mirrorWindowCollection(r);showPending();message(r.pending_result.reason==='window_capacity'?'结果已保存，显示窗口已满；关闭一个只读显示后明确查看，当前图与选区保留。':'结果已保存，尚未接纳显示；当前图、选区与较新的编辑保留。');return r;}
  if(observationSavePhase==='submitting'&&observationSaveTrace)observationSaveTrace.elapsed_ms.action_response=now()-observationSaveStarted;
  if(action==='recover'&&failedMeasurement){const target=failedMeasurement,m=r.last_operation;if(m?.kind!=='measure'||target.request_id&&m.request_id!==target.request_id)throw new Error('原测量请求仍未确认；保留隐藏标签与本地草稿');applyBoundMeasurement(target,m);failedMeasurement=null;remeasuringMarks.delete(target.id);autoFailed=false;message('原测量请求已核对；仅接续仍有效的标注版本。');return r;}
  if(action==='research-observation'||action==='recover'&&r.last_operation?.action==='research-observation'){
   state={...state,research_observation:r.research_observation,last_operation:r.last_operation,state_revision:r.state_revision};renderMeasurement();renderObservation();
   message('观察已保存；当前图、选区与未保存草稿保持原样。对 Agent 说“继续”以修订解释。');return r;
  }
  if(r.pending_result&&r.object.object_id===state.object.object_id){state={...state,pending_result:r.pending_result,state_revision:r.state_revision};showPending();message('计算完成；新结果等待查看，期间的新草稿保持原样。');return r;}
  if(historyDraft.revision!==sentRevision||drag){pending=r;showPending();message('保存完成；较新的草稿保持原样，结果等待接续。');return r;}
  if(r.object.object_id===state.object.object_id&&['select','measure','export','statistics','profile'].includes(action)){state={...state,last_operation:r.last_operation,selection:r.selection,state_revision:r.state_revision,crystal_evidence:r.crystal_evidence};renderMeasurement();if(['statistics','profile'].includes(action))dataProbes.renderResult(r.last_operation);}
  else {const adopted=await load(r,{keepDisplay:keepDisplay?local.display:null,keepMark:keepMark?local:null,historyNavigation:action==='show',role:action==='return-spatial'?'空间观察':action==='roi'?'ROI':action==='fft'?'FFT':action==='frame'?'原图':action==='show'&&params.source_view?'全帧（新显示）':null});if(action==='return-spatial'&&!adopted){message(pending?'空间目标已读回；较新的编辑已保留，目标等待明确接纳。':'空间目标已读回；显示接续期间有新编辑，请核对当前视图与草稿。');return r;}}
  if(['measure','statistics','profile'].includes(action))setResultsTab(action==='measure'?'measurements':action);
  message(action==='show'&&params.source_view?'已按当前标定新建全帧显示；未恢复未知的旧显示配方，未重算 FFT。':action==='export'?`科学数据已保存到 ${r.last_operation?.output_dir??'工作区 exports 目录'}（不是浏览器图片下载）`:({select:'选择已交接；可继续使用当前选区。',measure:'测量完成；当前选区已保留。',show:'已打开保存视图；未重算 FFT。','return-spatial':'已返回对应的保存空间观察；原 ROI、说明、标定与历史版本保留，未重算 FFT。'} as Partial<Record<string,string>>)[action]??'已保存新版本；原像素与旧版本保留。');return r;
 }catch(e){if(action==='mark'&&roiCreationRecovery)roiCreationRecovery.request_id=(e as Error).message.match(/Original request_id=([A-Za-z0-9_-]{1,64})/)?.[1]??null;if(action==='return-spatial'){const expected=state.object.object_id;try{const latest=await api('/api/state');if(state.object.object_id===expected){if(latest.object.object_id===expected&&Number.isSafeInteger(latest.state_revision)&&latest.state_revision>=state.state_revision)state={...state,spatial_return:latest.spatial_return,state_revision:latest.state_revision,pending_result:latest.pending_result};else if(latest.object.object_id!==expected){pending=latest;showPending();}}}catch{/* Preserve the original error and all local edits if qualification readback also fails. */}}message((e as {message:string}).message,true);}finally{busy=false;activeAction='';perf.action_last_ms=now()-start;diagnostics();await refreshMeasurements();if(queuedEdits.size&&!explicitEditRetry)Promise.resolve().then(flushEdits);}
}
function mirrorWindowCollection(next:AppState){
 if(!state||next.object.object_id!==state.object.object_id)return;
 const collection=readWindowCollection(next.window_collection),prior=readWindowCollection(state.window_collection);
 if(!collection||prior&&collection.revision<prior.revision||collection.windows.find(entry=>entry.window_id===collection.active_window_id)?.object_id!==state.object.object_id)return;
 state={...state,window_collection:collection,state_revision:Math.max(state.state_revision??0,next.state_revision??0)};windowWorkspace.sync(state);
}
async function refresh(){
 const epoch=interactionEpoch,objectId=state?.object.object_id,next=await api('/api/state');
 if(state&&(interactionEpoch!==epoch||state.object.object_id!==objectId)){if(next.object.object_id!==state.object.object_id){pending=next;showPending();}else mirrorWindowCollection(next);message('读取期间有新操作；当前视图与选择保持原样，请重新读取。');return;}
 if(state&&(dirty()||drag||busy)){if(next.object.object_id!==state.object.object_id)pending=next;else{state={...state,pending_result:next.pending_result,state_revision:Math.max(state.state_revision??0,next.state_revision??0),research_observation:next.research_observation,spatial_return:next.spatial_return};mirrorWindowCollection(next);}renderObservation();diagnostics();message('已检查最新状态；本地草稿保持原样。');return;}
 if(next.pending_result&&state){state.pending_result=next.pending_result;state.research_observation=next.research_observation;if(next.object.object_id===state.object.object_id){state.spatial_return=next.spatial_return;state.state_revision=Math.max(state.state_revision??0,next.state_revision??0);mirrorWindowCollection(next);}renderObservation();diagnostics();return;}
 // A metadata-only readback must not reset history, focus or pointer capture.
 const protectedKeys=['object','effective_display','render_base_id','display_source_object_id','selection','edit_state','last_operation','pending_result','research_observation','spatial_return','numeric_results','crystal_evidence'];
 if(state&&next.object.object_id===state.object.object_id&&next.window_collection&&protectedKeys.every(key=>equalRecords(next[key],state[key]))){mirrorWindowCollection(next);return;}
 await load(next);
}
function renderObservation(){
 const observation=state.research_observation;
 $('research-feedback').hidden=!state.tools.some(t=>t.name==='image_context');
 $('observation-summary').textContent=observation?`${observation.authority==='synthetic_fixture'?'合成演示（非真人确认）':'研究者声明'}：${observation.source_text} · 确认范围仅为存在孪晶；具体孪晶关系、取向和 HKL 仍待检验。${observation.current_view_relation==='different_saved_view_review_scope'?' 当前视图已变化；Agent 必须复核原观察绑定的图像范围。':''}`:'尚未提交孪晶观察。';
}
function humanCalibration(o:AppObject){const c=o.xy_calibration??o.calibration_record??o.calibration;if(!c)return 'XY 物理标尺未知；像素域操作可继续';const xy=c.xy_scale??c;return xy.x!==undefined?`XY：${xy.x} / ${xy.y} ${xy.unit??''}/px · ${c.status??c.source_type??'版本化标定'}`:'XY：已保留标定记录；详情见高级信息';}
// Projection only: keep the one editor and all its mounted draft fields intact.
function propertySelectionContext(){
 const saved=state?.object.annotations?.find(value=>value.annotation_id===selectedId),working=editCoordinates??queuedEdits.get(selectedId)?.update.coordinates??saved?.anchor?.coordinates;
 const associated=Boolean(saved?.anchor&&(!draft||draft.kind===saved.kind&&draft.source_object_id===saved.anchor.source_object_id&&draft.coordinate_space===saved.anchor.coordinate_space&&(equalRecords(draft.coordinates,saved.anchor.coordinates)||equalRecords(draft.coordinates,working))));
 const mark=associated?saved:undefined,anchor=mark?.anchor??draft;
 return {mark,anchor,kind:mark?.kind??draft?.kind,coordinates:mark?working:draft?.coordinates,unboundSaved:Boolean(saved&&draft&&!associated)};
}
function syncPropertiesContext(){
 if(!state)return;
 const {mark,kind,anchor,coordinates,unboundSaved}=propertySelectionContext();
 const context=Boolean(kind||fieldDirty||editCoordinates||labelDraft),roi=kind==='rectangle',point=kind==='point';
 $('properties-title').textContent=roi?'ROI 属性':point&&anchor?.coordinate_space==='frequency_cycles_per_pixel'?'峰位属性':point?'点属性':['line','arrow'].includes(kind as string)?'测量线属性':context?'标注属性':'属性';
 $('properties-empty').hidden=context&&!unboundSaved;$('properties-empty').textContent=unboundSaved?'当前为临时选择，可直接测量；选择已有标注后可编辑其属性。':'在图上选择 ROI、峰或测量线查看属性。';$('selection-properties').hidden=!context;$('mark-property-fields').hidden=unboundSaved;
 $('measurement-properties').hidden=!['point','line','arrow'].includes(kind as string);
 $('marker-shape-field').hidden=!point;
 $('presentation-settings').hidden=unboundSaved;
 $('discard-local').hidden=!(dirty()||autoFailed||orphanedDraft||roiCreationRecovery);
 const format=(value:number)=>Number.isFinite(value)?Number(value.toPrecision(6)).toString():'未知',unit=anchor?.coordinate_space==='source_pixels'?'px':anchor?.coordinate_space==='frequency_cycles_per_pixel'?'cycles/px':anchor?.coordinate_space==='source_array_indices'?'数组索引':'坐标单位待核对';
 $('properties-geometry').textContent=coordinates?.length?roi&&coordinates.length===4?`位置 ${format(coordinates[0])}, ${format(coordinates[1])} · 大小 ${format(coordinates[2]-coordinates[0])} × ${format(coordinates[3]-coordinates[1])} ${unit}`:`位置 [${coordinates.map(format).join(', ')}] ${unit}`:'';
 $('properties-geometry').title=coordinates?.length?'原始浮点坐标：'+JSON.stringify(coordinates):'';
 $('properties-roi-note').hidden=!roi;
 if(roi){const unsaved=researchWorkspace.reasonDirty,note=unsaved?$('roi-reason').value:typeof mark?.note==='string'?mark.note:'';
  $('properties-roi-note').textContent=note?`${unsaved?'说明草稿（未保存）':'已记录说明'}：${note.length>120?note.slice(0,120)+'…':note}`:'说明未填写；可在“观察与证据”中补充。';$('properties-roi-note').title=note;
 }
}
function renderMeasurement(){
 const last=state.last_operation,{mark,anchor,kind,coordinates}=propertySelectionContext(),entry=mark?measurementWorkspace.latestForAnnotation(mark.annotation_id!):null,record=entry?.measurement??entry;
 const pointsMatch=(value:{coordinate_space?:string;points?:readonly (readonly number[])[]}|null|undefined)=>Boolean(value&&anchor&&value.coordinate_space===anchor.coordinate_space&&Array.isArray(value.points)&&value.points.length===2&&value.points.every(point=>Array.isArray(point)&&point.length===2&&point.every(n=>typeof n==='number'&&Number.isFinite(n)))&&equalRecords(kind==='point'?value.points[1]:value.points.flat(),coordinates));
 const pendingGeometry=Boolean(mark&&(editCoordinates&&!equalRecords(editCoordinates,mark.anchor?.coordinates)||queuedEdits.get(mark.annotation_id)?.geometryChanged||remeasuringMarks.has(mark.annotation_id)||failedMeasurement?.id===mark.annotation_id));
 const qualifiedEntry=Boolean(entry&&measurementWorkspace.current?.object_id===state.object.object_id&&entry.same_grid===true&&entry.visible_in_current_view===true&&entry.annotation_matches_current===true&&pointsMatch(record));
 const qualifiedLast=Boolean(mark&&last?.kind==='measure'&&last.annotation_id===mark.annotation_id&&last.parent_object_id===state.object.object_id&&(last.state===undefined||last.state==='completed')&&pointsMatch(last));
 const m=pendingGeometry?null:qualifiedLast?last:qualifiedEntry?record:null,finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
 $('operation').textContent=last?JSON.stringify(last,null,2):'';
 $('measurement-summary').textContent=finite(m?.physical_distance)?`距离 ${m.physical_distance} ${m.physical_unit??''}`:
 finite(m?.distance_physical)?`距离 ${m.distance_physical} ${m.physical_unit??''}`:
 finite(m?.d_spacing)?`晶面间距（几何） ${m.d_spacing} ${m.d_spacing_unit??''}`:
 finite(m?.period)?`倒空间差向量周期 ${m.period} ${m.period_unit??''}`:
 finite(m?.distance_pixels)?`图像坐标距离 ${m.distance_pixels} px`:
 finite(m?.frequency_distance_cycles_per_pixel)?`频率差 ${m.frequency_distance_cycles_per_pixel} cycles/pixel`:
 pendingGeometry?'位置已修改，待重测；先前结果仅保留为历史。':entry?'已有测量未关联当前选择；请在“数据结果”核对原位置。':'当前选择尚未测量。';if(m&&m===record&&entry&&!['current','active'].includes(entry.status as string))$('measurement-summary').textContent='旧版数值（待重测或历史）：'+$('measurement-summary').textContent;syncPropertiesContext();}
async function load(next:AppState,{keepDisplay=null,keepMark=null,role=null,forceWindowContext=false,publishSelection=true,discardAuthorizedDraft=false,historyNavigation=false}:{keepDisplay?:DisplayDraft|null;keepMark?:LocalSnapshot|null;role?:string|null;forceWindowContext?:boolean;publishSelection?:boolean;discardAuthorizedDraft?:boolean;historyNavigation?:boolean}={}){
 const initialLoad=!state,priorScope=state?workflowScope(state):null,intendedAnnotationEdit=!discardAuthorizedDraft&&state?annotationEditDraft():null;
 const ticket=++loading,revision=historyDraft.revision,epoch=interactionEpoch,sameObject=state?.object.object_id===next.object.object_id,rect=viewport.getBoundingClientRect(),continued=relatedViewport(view,state,next,[rect.width,rect.height]),context=resumableWindowContext(next),restoreContext=Boolean(context&&(forceWindowContext||!state||!sameObject&&!continued)),savedSelection=forceWindowContext?(Object.hasOwn(next,'selection')?next.selection:context?.selection_candidate as AppSelection|null):!sameObject&&next.selection?next.selection:(sameObject||continued)&&draft?draft:next.selection;let decoded:BrowserElement|null=null;
 if(next.clean_png_base64||next.png_base64){decoded=new Image();decoded.src='data:image/png;base64,'+(next.clean_png_base64??next.png_base64);await decoded.decode();if(ticket!==loading)return false;if(state&&(historyDraft.revision!==revision||interactionEpoch!==epoch||drag)){pending=next;showPending();return false;}}
 // Discard applies only after this exact saved view has been read and decoded.
 // A failed read/decode or newer interaction must retain the authorized draft.
 if(discardAuthorizedDraft){clearExplicitLocalDraft();autoFailed=false;}
 if(!state&&next.edit_state?.dirty)orphanedDraft=true;
 interactionEpoch++;state=next;loadedWorkingRevision=next.workspace_analysis?.working_revision;draft=restoredSelection(savedSelection,next.object.panels??[]);drag=null;editCoordinates=null;labelDraft=null;fieldDirty=false;toneCacheKey=null;marksDirty=true;const o=state.object,previous=selectedId;
 if(!sameObject&&!continued){figurePrefs.preset=o.annotations?.some(m=>['A','B','shared','unexplained'].includes(m.presentation?.category as string))?'multi-domain':o.panels?.some(p=>p.domain==='frequency')?'diffraction':'real-space';figurePrefs.legend=figurePrefs.preset!=='real-space';figurePrefs.layers={experimental:true,simulation_A:figurePrefs.preset!=='real-space',simulation_B:figurePrefs.preset!=='real-space'};}syncFigureControls();
 $('identity').textContent=`${state.frame_identity?`第 ${state.frame_identity.frame_index!+1} 帧 · `:''}${o.panels?.some(p=>p.domain==='frequency')?'FFT / 倒空间':importedComplex()?'复数图像':'科学图像'} · 原图只读`;$('calibration-summary').textContent=humanCalibration(o);$('source-badge').textContent=state.source_identity?.label??'来源待核对';$('source-name').textContent=state.source_identity?.filename??'';
 $('existing').replaceChildren(new Option('新增标记',''));for(const mark of o.annotations??[])if(mark.annotation_id){const option=new Option(`${mark.text||mark.annotation_id} · ${({hypothesized:'候选',user_confirmed:'用户确认',retracted:'撤回'} as Partial<Record<string,string>>)[mark.status as string]??mark.status}`,mark.annotation_id);option.disabled=mark.status==='retracted';$('existing').append(option);}selectedId=(o.annotations??[]).some(m=>m.annotation_id===previous&&m.status!=='retracted')?previous:'';$('existing').value=selectedId;
 if(restoreContext&&context){const mark=o.annotations?.find(value=>value.annotation_id===context.selected_annotation_id&&value.status!=='retracted');selectedId=mark?.anchor&&draft&&mark.kind===draft.kind&&mark.anchor.source_object_id===draft.source_object_id&&mark.anchor.coordinate_space===draft.coordinate_space&&equalRecords(mark.anchor.coordinates,draft.coordinates)?mark.annotation_id!:'';$('existing').value=selectedId;}
 else if(forceWindowContext)selectedId='';
 if(selectedId&&!keepMark&&!intendedAnnotationEdit){const mark=o.annotations?.find(value=>value.annotation_id===selectedId&&value.status!=='retracted');if(!mark?.anchor||!draft||mark.kind!==draft.kind||mark.anchor.source_object_id!==draft.source_object_id||mark.anchor.coordinate_space!==draft.coordinate_space||!equalRecords(mark.anchor.coordinates,draft.coordinates)){selectedId='';$('existing').value='';}}
 const d=state.effective_display??o.display??{};$('gamma').value=d.gamma??1;$('gamma-label').textContent=$('gamma').value;$('low').value=d.display_range?.[0]??'';$('high').value=d.display_range?.[1]??'';$('axes').checked=d.spectrum_axes??false;$('scale').checked=d.scale_bar??false;displayBaseline=JSON.stringify(displayDraft());if(state.frame_identity)$('frame').value=state.frame_identity.frame_index!+1;
 $('complex-display').hidden=!importedComplex();$('complex-component').value=importedComplex()?d.component??'':'';$('complex-display-current').textContent=importedComplex()?`当前显示：${complexComponentNames[d.component as string]??'未选择'}；原复数数组完整保留。`:'';
 const calibrationRecord=o.xy_calibration;
 if(calibrationRecord?.xy_scale){const xy=calibrationRecord.xy_scale;$('scale-x').value=xy.x;$('scale-y').value=xy.y;
  $('unit').value=({'angstrom':'Å','1/angstrom':'1/Å'} as Partial<Record<string,string>>)[xy.unit as string]??xy.unit;$('scope').value=calibrationRecord.scope;}
 $('calibration').hidden=!state.tools.some(t=>t.name==='image_calibrate');$('metadata').textContent=JSON.stringify({object_id:o.object_id,frame_identity:state.frame_identity,calibration:o.xy_calibration??o.calibration_record??o.calibration,effective_display:d,render_base_id:state.render_base_id,display_source_object_id:state.display_source_object_id},null,2);
 renderDomainEvidence($('domain-evidence'),state.domain_evidence,{png:state.domain_png_base64,show:object_id=>act('show',{object_id}),onError:error=>message((error as {message:string}).message,true)});renderMeasurement();renderObservation();renderSequenceEvidence($('sequence-evidence'),state.sequence_evidence,{show:object_id=>act('show',{object_id}),onError:error=>message((error as {message:string}).message,true)});
 image=decoded;decodedViewSnapshot=decoded&&typeof next.clean_png_base64==='string'&&next.clean_png_base64.length>0&&typeof next.panel_mapping_fingerprint==='string'&&/^[a-f0-9]{64}$/.test(next.panel_mapping_fingerprint)?{object_id:next.object.object_id,image:decoded,panel_mapping_fingerprint:next.panel_mapping_fingerprint,object:next.object}:null;cleanBase=Boolean(next.clean_png_base64);for(const c of [canvas,baseCanvas,marksCanvas]){c.width=image?.width??640;c.height=image?.height??160;}stage.style.width=canvas.width+'px';stage.style.height=canvas.height+'px';if(restoreContext||initialLoad)restoreUiPanels(context?.ui_panels);windowWorkspace.sync(state);
 if(image){baseContext.drawImage(image,0,0);basePixels=baseContext.getImageData(0,0,canvas.width,canvas.height);if(restoreContext&&context?.camera_origin==='new_fit_preference'){fitView();message('已恢复经核对的原输入选区；此前没有保存相机，当前为新的适应画布视野。');}else if(restoreContext&&context){const box=viewport.getBoundingClientRect();view={scale:context.camera.scale,x:box.width/2-context.camera.center_image_xy[0]*context.camera.scale,y:box.height/2-context.camera.center_image_xy[1]*context.camera.scale};resize();}else if(!sameObject&&!continued)fitView();else{if(!sameObject)view=continued!;resize();}}else{basePixels=null;baseContext.clearRect(0,0,640,160);baseContext.fillStyle='#d4e4ef';baseContext.fillText('序列已打开。请选择一个帧。',20,40);}
 syncMarkFields(false);void refreshMeasurements();
 if(keepDisplay){$('gamma').value=keepDisplay.gamma;$('low').value=keepDisplay.low;$('high').value=keepDisplay.high;$('axes').checked=keepDisplay.axes;$('scale').checked=keepDisplay.scale;$('gamma-label').textContent=$('gamma').value;}
 if(keepMark){selectedId=keepMark.selectedId;editCoordinates=keepMark.editCoordinates;fieldDirty=keepMark.fieldDirty;$('existing').value=selectedId;for(const [id,field]of [['mark-id','id'],['mark-text','text'],['color','color'],['status','status']])$(id).value=keepMark.fields[field as keyof LocalSnapshot['fields']];}
 // A reconnect must continue the shared monotonically increasing lease; a
 // fresh browser's local counter must never erase a newer panel draft.
 historyDraft.revision=Math.max(historyDraft.revision,state.edit_state?.draft_revision??0);
 historyDraft.reset(snapshot());lastUserDisplay=displayDraft();if(priorScope!==workflowScope(state))userHistory.reset();savedViews.remember(state,{replace:Boolean(continued)&&!forceWindowContext&&!historyNavigation,role});showDraft();paint();showPending();const adoptedEpoch=interactionEpoch;if(publishSelection)await publishDraft({includeSelection:true,allowSwitch:Boolean(windowSwitch)});return interactionEpoch===adoptedEpoch&&!drag;
}
function resize(){stage.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;$('zoom').value=view.scale;$('zoom-label').textContent=Math.round(view.scale*100)+'%';windowWorkspace.updateActiveSourceOverlay();if(!windowSwitch&&state?.panel_mapping_fingerprint)windowWorkspace.queueActiveCamera(activeWindowCamera(),panelLayoutUnrecorded?undefined:activeUiPanels());schedulePaint();}
function fitView(){if(!image)return;const r=viewport.getBoundingClientRect();view=fitViewport([canvas.width,canvas.height],[r.width,r.height]);resize();}
function toggleImageFocus(){
 imageFocused=!imageFocused;
 if(imageFocused)focusCamera={object_id:state?.object.object_id,view:{...view}};
 document.body?.classList?.toggle('image-focused',imageFocused);
 $('focus-image').setAttribute('aria-pressed',String(imageFocused));$('focus-image').textContent=imageFocused?'退出专注':'专注图像';
 syncDrawerPresentation();
 requestAnimationFrame(()=>{if(!imageFocused&&focusCamera?.object_id===state?.object.object_id){view={...focusCamera.view};resize();}else fitView();});
}
function renderedMarks(){return (state?.object.annotations??[]).map(original=>{const queued=queuedEdits.get(original.annotation_id)?.update,mark={...original,...(queued??{}),...(original.annotation_id===selectedId&&labelDraft?{presentation:labelDraft}:{})};if(!mark.anchor)return mark;let p;try{p=markPanel(mark);}catch{return {...mark,visibility:'outside_view'};}const edges=['rectangle','polygon'].includes(mark.kind),coords=mark.annotation_id===selectedId&&editCoordinates?editCoordinates:queued?.coordinates??mark.anchor!.coordinates,changed=mark.annotation_id===selectedId&&fieldDirty;return {...mark,coordinates:transformCoordinates(coords,p,{edges,inverse:true}),...(queued||mark.annotation_id===selectedId&&editCoordinates?{arrow_render_coordinates:undefined}:{}),...(changed?{text:$('mark-text').value,color:$('color').value,status:$('status').value}:{})};});}
function paint(){
 if(paintFrame!==null){cancelAnimationFrame(paintFrame);paintFrame=null;}if(!basePixels){diagnostics();return;}const start=now(),display=state.effective_display??state.object.display??{},oldGamma=display.gamma??1,gamma=Number($('gamma').value),range=display.display_range,low=$('low').value===''?NaN:Number($('low').value),high=$('high').value===''?NaN:Number($('high').value),cache=JSON.stringify([state.render_base_id,oldGamma,gamma,range,low,high]);
 if(cache!==toneCacheKey){const t=now(),pixels=tonePixels(basePixels.data,{oldGamma,gamma,range,low,high});baseContext.putImageData(new ImageData(pixels,basePixels.width,basePixels.height),0,0);toneCacheKey=cache;perf.tone_last_ms=now()-t;perf.tone_count++;}
 const overlayStart=now(),marks=renderedMarks().map(m=>(remeasuringMarks.has(m.annotation_id)||m.annotation_id===selectedId&&editCoordinates)&&m.presentation?.label?.measurement_object_id?{...m,presentation:{...m.presentation,label:{...m.presentation.label,visible:false}}}:m);if(marksDirty){marksContext.clearRect(0,0,canvas.width,canvas.height);marksDirty=false;}
 annotationLayout=layoutAnnotations(marks,{...figurePrefs,width:canvas.width,height:canvas.height,scale:view.scale,selectedId,hoverId});
 $('annotation-layer').innerHTML=cleanBase?renderAnnotationsSVG(annotationLayout,{width:canvas.width,height:canvas.height,interactive:true,figureLayout:{legend:figurePrefs.legend,letter:figurePrefs.letter,scaleBar:figurePrefs.scaleBar&&display.scale_bar!==true?figureScaleBar(state.object.scale_bar):null}}):'';
 ctx.clearRect(0,0,canvas.width,canvas.height);
 const coords=drag?.kind==='edit'||drag?.kind==='pan'?null:drag?.kind==='selection-edit'?draft?.rendered:drag?(drag!.kind==='point'?drag!.start!:[...drag!.start!,...drag!.end!]):draft?.rendered;
 if(coords&&figurePrefs.mode==='analysis'&&drag?.kind!=='label'){const kind=drag?.kind==='selection-edit'?'rectangle':drag?.kind??draft!.kind,c=kind==='rectangle'?[Math.min(coords[0],coords[2]),Math.min(coords[1],coords[3]),Math.max(coords[0],coords[2]),Math.max(coords[1],coords[3])]:coords;drawMark(ctx,{kind,coordinates:c,color:'cyan',line_width:2/view.scale,arrowhead_size:6/view.scale,status:'hypothesized'},{scale:view.scale,draft:true});if(kind==='rectangle'&&!selectedId){for(const handle of rectangleHandles(c))ctx.strokeRect(handle.point[0]-3/view.scale,handle.point[1]-3/view.scale,6/view.scale,6/view.scale);}}
 perf.frames++;perf.overlay_count++;perf.overlay_last_ms=now()-overlayStart;perf.draw_last_ms=now()-start;diagnostics();
}
function xy(event:BrowserEvent):XY{const rect=canvas.getBoundingClientRect();return [(event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height];}
function showDraft(){renderMeasurement();const mark=propertySelectionContext().mark;$('current-roi').textContent=roiCreationRecovery&&!observationSavePhase?'ROI 保存待核对 · 请查询原请求':mark?.kind==='rectangle'?`当前 ROI：${mark.text||'已保存矩形'} · 拖动内部移动，八个控制点调整大小` :draft?.kind==='rectangle'?'当前：临时 ROI · 可移动或缩放，尚未保存':'当前 ROI：未选择';if(!draft){$('selection').textContent='在图中圈区域、点选峰，或直接拖动已有标注。';return;}let rect;try{if(draft.kind==='rectangle')rect=selectionRectangle(draft);}catch(e){message((e as {message:string}).message,true);}const coords=(rect??draft.coordinates).map(v=>Number(v.toPrecision(6)));$('selection').textContent=`${({point:'点',line:'线段',arrow:'箭头',rectangle:'ROI'} as Partial<Record<string,string>>)[draft.kind]??draft!.kind} · ${coords.join(', ')} · ${draft.coordinate_space==='frequency_cycles_per_pixel'?'cycles/px':'源像素坐标'}${rect?'（向外取整边界）':''}`;}
function syncMarkFields(changeMode=true){const mark=(state.object.annotations??[]).find(m=>m.annotation_id===selectedId);$('existing').value=selectedId;editCoordinates=null;labelDraft=null;fieldDirty=false;if(mark){$('mark-id').value=mark.annotation_id;$('mark-text').value=mark.text??'';$('color').value=mark.color;$('status').value=mark.status;if(changeMode)setMode('select');}else{$('mark-id').value=internalMarkId(()=>crypto.randomUUID());$('mark-text').value='';$('color').value='cyan';$('status').value='hypothesized';if(changeMode)setMode('select');}syncPresentationFields();syncPropertiesContext();marksDirty=true;}
function syncFigureControls(){$('annotation-preset').value=figurePrefs.preset;$('figure-mode').textContent=figurePrefs.mode==='figure'?'出图模式':'分析模式';$('figure-mode').setAttribute?.('aria-pressed',String(figurePrefs.mode==='figure'));document.body?.classList.toggle('figure-mode',figurePrefs.mode==='figure');const l=figurePrefs.layers,v=l.experimental?(l.simulation_A&&l.simulation_B?'all':'experimental'):l.simulation_A&&l.simulation_B?'simulation':l.simulation_A?'A':'B';$('layer-view').value=v;$('layer-summary').textContent=({all:'实验与候选叠加',experimental:'只看实验',simulation:'全部模拟 + 未解释峰',A:'候选 A + 未解释峰',B:'候选 B + 未解释峰'})[v];$('figure-columns').value=figurePrefs.columns;$('figure-font').value=figurePrefs.fontPt;$('figure-legend').checked=figurePrefs.legend;$('figure-scale').checked=figurePrefs.scaleBar;$('figure-letter').value=figurePrefs.letter;}
function syncPresentationFields(){const m=effectiveEdit(selectedId),p=labelDraft??m?.presentation??{},l=p.label??{};$('label-text').value=l.text??m?.text??'';$('label-size').value=l.font_size??12;$('marker-shape').value=p.marker_shape??(p.category==='B'?'square':p.category==='shared'?'double_circle':p.category==='unexplained'?'diamond':'circle');$('label-visible').checked=l.visible!==false;$('geometry-visible').checked=p.geometry_visible!==false;$('label-leader').checked=l.leader!==false;$('label-pinned').checked=l.pinned??false;}
function commitLabelDraft(){if(!selectedId||!labelDraft)return;const update={annotation_id:selectedId,presentation:labelDraft};labelDraft=null;queueEdit(update);}
function editPresentation(event?:BrowserEvent){if(!allowContentEditing()){syncPresentationFields();return;}if(!selectedId)return;const p=labelDraft??effectiveEdit(selectedId)!.presentation;labelDraft={...p,marker_shape:$('marker-shape').value,geometry_visible:$('geometry-visible').checked,label:{...p.label,text:$('label-text').value,font_size:Number($('label-size').value),visible:$('label-visible').checked,leader:$('label-leader').checked,pinned:$('label-pinned').checked}};if(event?.target?.id==='label-text'&&labelDraft!.label!.text!==p.label?.text){delete labelDraft!.label!.measurement_object_id;delete labelDraft!.label!.measurement_kind;}record();schedulePaint();publishDraft();if(labelTimer!==null)clearTimeout(labelTimer);labelTimer=setTimeout(()=>{labelTimer=null;commitLabelDraft();},350);}
function chooseMark(next:string){
 if(next&&(!state.object.annotations?.some(mark=>mark.annotation_id===next&&mark.status!=='retracted')||effectiveEdit(next)?.status==='retracted')){$('existing').value=selectedId;message('该标记已撤回，不能作为当前 ROI；可通过撤销恢复。',true);return false;}
 if(next===selectedId)return true;
 if(researchWorkspace.reasonDirty){message('先保存或撤销当前观察说明，再选择另一处 ROI 或标记。',true);return false;}
 if(labelDraft)commitLabelDraft();
 if(editCoordinates||fieldDirty)captureSelected();
 selectedId=next;syncMarkFields();const saved=effectiveEdit(next);if(saved){$('mark-text').value=saved.text;$('color').value=saved.color;$('status').value=saved.status;editCoordinates=queuedEdits.get(next)?.update.coordinates??null;}
 closeResearch();document.body?.classList.add('properties-open');syncDrawerPresentation();measurementWorkspace.selectAnnotation(next);renderMeasurement();return true;
}
canvas.addEventListener('pointerdown',event=>{
 if(workspaceRestoring||workspaceSettling||orphanedDraft||state?.workspace_analysis&&state.window_collection&&!state.window_collection.active_window_id||windowSwitch||observationSavePhase||roiCreationRecovery||!image||drag||![0,1].includes(event.button))return;canvas.focus();const start=xy(event);if(event.button===1||spaceDown||$('mode').value==='pan'){drag={kind:'pan',pointerId:event.pointerId,startClient:[event.clientX,event.clientY],originalView:{...view}};canvas.setPointerCapture(event.pointerId);return;}
 if(!allowContentEditing())return;
 interactionEpoch++;const tool=$('mode').value,createRoi=tool==='roi';let kind=(tool==='edit'?'select':createRoi?'rectangle':tool) as SelectionKind|'select'|'edit';const selectionBefore={draft:draft?JSON.parse(JSON.stringify(draft)):null,selectedId};let blankSelect=false;try{
   if(['rectangle','point','line','arrow'].includes(kind)&&(researchWorkspace.reasonDirty||fieldDirty||editCoordinates||labelDraft||autoFailed||['submitted','unknown'].includes(state.last_operation?.state??'')))throw new Error(kind==='rectangle'?'先保存或撤销当前说明／标注草稿，并核对原请求，再添加另一处 ROI。':'先保存或撤销当前说明／标注草稿，并核对原请求，再绘制另一处选区。');
   if(createRoi&&(busy||autoSaving||queuedEdits.size||remeasuringMarks.size))throw new Error('等待当前保存或重测完成后，再添加另一处 ROI。');
   if(createRoi&&(state.object.annotations?.length??0)>=100)throw new Error('当前视图已达到 100 条保存标注上限；不会提交或覆盖已有 ROI。');
   if(kind==='select'&&!selectedId&&draft?.kind==='rectangle'&&draft.rendered){const handle=rectangleHitTest(draft.rendered,start,{scale:view.scale});if(handle){drag={kind:'selection-edit',start,end:start,p:draft.panel,original:[...draft.coordinates],rectangle_handle:handle,selectionBefore,pointerId:event.pointerId};canvas.setPointerCapture(event.pointerId);publishDraft({gesture_active:true});schedulePaint();return;}}
  if(kind==='select'&&selectedId){const selectedMark=state.object.annotations?.find(mark=>mark.annotation_id===selectedId);if(selectedMark?.anchor)markPanel(selectedMark);}
  const selectedRectangle=figurePrefs.mode==='analysis'&&kind==='select'?annotationLayout?.items.find(item=>item.id===selectedId&&item.geometryVisible&&item.mark.kind==='rectangle'&&item.mark.status!=='retracted')?.mark:null;
  const selectedHandle=selectedRectangle?rectangleResizeHandleHitTest(selectedRectangle.coordinates,start,{scale:view.scale}):null;
  const handleHit=selectedHandle&&selectedRectangle?{mark:selectedRectangle,handle:0}:figurePrefs.mode==='analysis'?hitMark(annotationLayout?.items.filter(i=>i.geometryVisible).map(i=>i.mark)??[],start,{scale:view.scale,radius:6}):null;
  const label=(!handleHit||handleHit.handle<0)&&(['select','edit'].includes(kind)||figurePrefs.mode==='figure')?(annotationLayout as (Omit<AnnotationLayout,'items'>&{items:AnnotationLayout['items']&{findLast(predicate:(item:AnnotationLayout['items'][number])=>boolean):AnnotationLayout['items'][number]|undefined}})|null)?.items.findLast(item=>item.label?.visible&&start[0]>=item.label.x&&start[0]<=item.label.x+item.label.width&&start[1]>=item.label.y&&start[1]<=item.label.y+item.label.height):null;
  if(label?.id){if(!chooseMark(label.id))return;const current=effectiveEdit(label.id);drag={kind:'label',pointerId:event.pointerId,start,end:start,before:current,originalOffset:[...label.label.offset!],labelSize:[label.label.width,label.label.height],anchor:label.anchor};labelDraft={...current!.presentation,label:{...current!.presentation.label,offset:[...label.label.offset!],pinned:true}};canvas.setPointerCapture(event.pointerId);publishDraft({gesture_active:true});schedulePaint();message('拖动文字仅调整排版；科学锚点与测量保持原样。');return;}
  if(figurePrefs.mode==='figure')return;
   const visible=annotationLayout?.items.filter(item=>item.geometryVisible).map(item=>item.mark)??renderedMarks(),hit=selectedHandle&&selectedRectangle?{mark:selectedRectangle,handle:0}:hitMark(visible,start,{scale:view.scale});if(kind==='select'){if(hit){if(!chooseMark(hit.mark.annotation_id!))return;kind='edit';}else{if(fieldDirty||editCoordinates||labelDraft||autoFailed||state.last_operation?.state==='submitted')throw new Error('先保存或撤销当前标注草稿，并核对原请求，再画另一处选区。');if(!chooseMark(''))return;draft=null;blankSelect=true;kind='rectangle';}}
   const drawingPanel=panelAt(state.object.panels??[],...start,{edges:kind==='rectangle'||kind==='edit'});if(createRoi&&drawingPanel.domain==='spatial_pixels')requireLatestRoiRevision();if(kind==='edit'&&state.object.annotations?.find(mark=>mark.annotation_id===selectedId)?.kind==='rectangle'&&drawingPanel.domain==='spatial_pixels')requireLatestRoiRevision();
   if(kind==='edit'){const mark=(state.object.annotations??[]).find(m=>m.annotation_id===selectedId);if(!mark?.anchor)throw new Error('先点击一条带科学锚点的标注');const p=markPanel(mark),edges=['rectangle','polygon'].includes(mark.kind),original=editCoordinates??effectiveEdit(selectedId)!.coordinates,rendered=transformCoordinates(original,p,{edges,inverse:true}),distances=[];for(let i=0;i<rendered.length;i+=2)distances.push(Math.hypot(start[0]-rendered[i],start[1]-rendered[i+1]));const nearest=Math.min(...distances),handle=nearest<9/view.scale?distances.indexOf(nearest):-1,rectangle_handle=mark.kind==='rectangle'?rectangleHitTest(rendered,start,{scale:view.scale})??'move':undefined;drag={kind,start,end:start,mark,p,edges,handle,rectangle_handle,original,before:effectiveEdit(selectedId),previousEdit:editCoordinates};editCoordinates=[...drag!.original!];draft={kind:mark.kind,...mark.anchor,coordinates:[...original],panel:p,rendered} as AppSelection;marksDirty=true;}
   else{if(!chooseMark(''))return;draft=null;setMode(createRoi?'roi':tool);drag={kind,start,end:start,originalStart:start,p:drawingPanel,selectionBefore,blankSelect,create_roi:createRoi&&drawingPanel.domain==='spatial_pixels'};}drag!.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);publishDraft({gesture_active:true});schedulePaint();
 }catch(e){message((e as {message:string}).message,true);}
});
function editedRoiCoordinates(p:WirePanel,original:readonly number[],from:readonly number[],to:readonly number[],handle:NonNullable<DragState['rectangle_handle']>){const bounds=transformCoordinates(p.image_rect_xyxy,p,{edges:true}),minimum=p.domain==='frequency'?[1/p.fft_shape_yx[1],1/p.fft_shape_yx[0]]:[1,1],result=editRectangle(original,[to[0]-from[0],to[1]-from[1]],handle,bounds,minimum);if(!result)throw new Error('ROI 不属于当前准确面板，或无法保持至少一个源像素；坐标未被替换。');return [...result];}
function updateDrag(event:BrowserEvent){if(drag!.kind==='pan'){view=panBy(drag!.originalView!,event.clientX-drag!.startClient![0],event.clientY-drag!.startClient![1]);resize();return;}drag!.end=xy(event);if(['rectangle','line','arrow'].includes(drag!.kind))Object.assign(drag!,constrainSelectionDrag(drag!.p!,drag!.originalStart!,drag!.end!,{kind:drag!.kind as SelectionKind,constrained:Boolean(event.shiftKey||event.ctrlKey)}));if(drag!.kind==='label'){const offset=drag!.originalOffset!.map((v,i)=>Math.max(-drag!.anchor![i],Math.min((i?canvas.height:canvas.width)-drag!.anchor![i]-drag!.labelSize![i],v+drag!.end![i]-drag!.start![i])));labelDraft={...labelDraft,label:{...labelDraft!.label!,offset,pinned:true}};return;}if(drag!.kind==='edit'||drag!.kind==='selection-edit'){const from=transformCoordinates(drag!.start!,drag!.p!,{edges:drag!.kind==='selection-edit'||drag!.edges}),to=transformCoordinates(drag!.end!,drag!.p!,{edges:drag!.kind==='selection-edit'||drag!.edges}),delta=to.map((v,i)=>v-from[i]);if(drag!.kind==='selection-edit'){const coordinates=editedRoiCoordinates(drag!.p!,drag!.original!,from,to,drag!.rectangle_handle!);draft={...draft!,coordinates,rendered:transformCoordinates(coordinates,drag!.p!,{edges:true,inverse:true})};showDraft();}else editCoordinates=drag!.rectangle_handle?editedRoiCoordinates(drag!.p!,drag!.original!,from,to,drag!.rectangle_handle):drag!.original!.map((v,i)=>drag!.handle!<0||Math.floor(i/2)===drag!.handle?v+delta[i%2]:v);}}
canvas.addEventListener('pointermove',event=>{if(windowSwitch)return;if(!drag){if($('numeric-data').open)try{const p=xy(event);dataProbes.observe(selectionFromDrag(state.object.panels??[],p,p,{kind:'point'}));}catch{dataProbes.clear();}if(figurePrefs.mode==='analysis'){const p=xy(event),hit=hitMark(annotationLayout?.items.filter(i=>i.geometryVisible).map(i=>i.mark)??[],p,{scale:view.scale}),next=hit?.mark.annotation_id??'';if(next!==hoverId){hoverId=next;schedulePaint();}}return;}if(event.pointerId!==drag!.pointerId)return;updateDrag(event);schedulePaint();});
canvas.addEventListener('pointerleave',()=>dataProbes.clear());
function cancelDrag(event:Pick<BrowserEvent,'pointerId'>){
 if(!drag||event.pointerId!==drag.pointerId)return;
 const kind=drag.kind;
 if(kind==='label')labelDraft=null;
 if(kind==='edit')editCoordinates=drag.previousEdit!;
 if(drag.selectionBefore&&['selection-edit','rectangle','point','line','arrow'].includes(kind)){
  draft=drag.selectionBefore.draft;selectedId=drag.selectionBefore.selectedId;syncMarkFields(false);showDraft();
 }
 if(kind==='pan'){view=drag.originalView!;resize();}
 drag=null;marksDirty=true;if(kind!=='pan')record();schedulePaint();publishDraft({includeSelection:kind!=='pan'});message('已取消本次拖动；尚未提交任何修改。');
}
canvas.addEventListener('pointercancel',cancelDrag);canvas.addEventListener('lostpointercapture',cancelDrag);
canvas.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag!.pointerId)return;const kind=drag!.kind,before=drag!.before;let saveGeometry=false;try{
 updateDrag(event);if(kind==='pan')return;
 if(drag!.blankSelect&&Math.hypot(drag!.end![0]-drag!.start![0],drag!.end![1]-drag!.start![1])*view.scale<3){draft=null;rememberSelection(drag!.selectionBefore!,{draft:null,selectedId:''});showDraft();return;}
 if(kind==='label'){const update={annotation_id:selectedId,presentation:labelDraft!};labelDraft=null;queueEdit(update,before);syncPresentationFields();return;}
 if(kind==='selection-edit'){rememberSelection(drag!.selectionBefore!,{draft:draft?JSON.parse(JSON.stringify(draft)):null,selectedId});showDraft();return;}
 if(kind==='edit'){const update={annotation_id:selectedId,coordinates:[...editCoordinates!],text:$('mark-text').value,color:$('color').value,status:$('status').value};draft={...draft!,coordinates:[...editCoordinates!],rendered:transformCoordinates(editCoordinates!,drag!.p!,{edges:drag!.edges,inverse:true})};editCoordinates=null;fieldDirty=false;queueEdit(update,before);return;}
 if(kind==='rectangle'&&(drag!.start![0]===drag!.end![0]||drag!.start![1]===drag!.end![1])){draft=drag!.selectionBefore?.draft??null;selectedId=drag!.selectionBefore?.selectedId??'';syncMarkFields(false);showDraft();return;}
 const selected=selectionFromDrag(state.object.panels??[],drag!.start!,drag!.end!,{kind:kind as SelectionKind});if(kind==='rectangle')selectionRectangle(selected);draft={...selected,rendered:transformCoordinates(selected.coordinates,selected.panel,{edges:kind==='rectangle',inverse:true})};saveGeometry=Boolean(drag!.create_roi);if(kind==='rectangle')setMode('select');rememberSelection(drag!.selectionBefore??{draft:null,selectedId:''},{draft:JSON.parse(JSON.stringify(draft)),selectedId});showDraft();message('选择已定位；可直接测量或交给 Agent。');
 }catch(e){message((e as {message:string}).message,true);}finally{drag=null;if(kind!=='pan')record();paint();publishDraft({includeSelection:true,urgent:true});if(saveGeometry)createRoiGeometry();else Promise.resolve().then(flushEdits);}});
viewport.addEventListener('wheel',event=>{if(windowSwitch||!image)return;event.preventDefault();const r=viewport.getBoundingClientRect();view=zoomAt(view,[event.clientX-r.left,event.clientY-r.top],Math.exp(-event.deltaY*.0015));resize();},{passive:false});
function textEntry(target:(BrowserElement&{readonly isContentEditable?:boolean;readonly contentEditable?:string})|undefined){return /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName??'')||target?.isContentEditable===true||['true','plaintext-only'].includes(target?.contentEditable??'');}
function deleteSelectedRoi(){
 if(!allowContentEditing())return false;
 const mark=state?.object.annotations?.find(value=>value.annotation_id===selectedId&&value.kind==='rectangle'&&value.status!=='retracted');
 const temporary=!selectedId&&draft?.kind==='rectangle';
 if(!mark&&!temporary)return false;
 if(windowSwitch||observationSavePhase||roiCreationRecovery||busy||drag||autoSaving||autoFailed||dirty()||pending||state.pending_result||state.last_operation?.state==='submitted')throw new Error('先完成当前编辑或核对原请求；所选 ROI 保留，未删除。');
 if(mark){
  requireLatestRoiRevision();markPanel(mark);
  const before=effectiveEdit(mark.annotation_id);if(!before)return false;
  interactionEpoch++;queueEdit({annotation_id:mark.annotation_id,status:'retracted'},before);
 }else{
  interactionEpoch++;rememberSelection({draft:draft?JSON.parse(JSON.stringify(draft)):null,selectedId:''},{draft:null,selectedId:''});
 }
 selectedId='';draft=null;syncMarkFields(false);record();showDraft();schedulePaint();publishDraft({includeSelection:true,urgent:true});
 message(mark?'已从当前画面移除所选 ROI；正在保存撤回修订，历史记录保留。':'已清除临时 ROI；可撤销，未删除科学记录。');
 return true;
}
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&dismissMenus(true)){event.preventDefault();return;}
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='s'&&!$('usage-dialog').open){event.preventDefault();void workspaceControls.save().catch(error=>message((error as Error).message,true));return;}
 if(workspaceRestoring||windowSwitch||observationSavePhase||roiCreationRecovery||$('usage-dialog').open||textEntry(event.target))return;
 if(event.key==='Delete'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
  if(document.activeElement!==canvas||event.target!==canvas)return;
  try{if(deleteSelectedRoi())event.preventDefault();}catch(error){message((error as Error).message,true);}
  return;
 }
 if(event.code==='Space'){spaceDown=true;event.preventDefault();}
 if(!event.ctrlKey&&!event.metaKey){const mode={v:'select',r:'roi',p:'point',l:'line',a:'arrow',h:'pan'}[event.key.toLowerCase()];if(mode)setMode(mode);if(event.key.toLowerCase()==='f')fitView();}
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)($('redo').onclick as ()=>unknown)();else ($('undo').onclick as ()=>unknown)();}
 if(event.key==='Escape'&&drag)cancelDrag({pointerId:drag.pointerId!});
});document.addEventListener('keyup',event=>{if(event.code==='Space')spaceDown=false;});
function guarded(fn:()=>unknown,{allowRoiRecovery=false,allowRecoveryRead=false}={}){return async()=>{if(recoveryPending()&&!allowRecoveryRead&&!allowContentEditing())return;if(workspaceRestoring||windowSwitch||observationSavePhase||roiCreationRecovery&&!allowRoiRecovery){message('当前保存或切换尚未核对；请等待完成，失败时查询原请求。',true);return;}try{await fn();}catch(e){message((e as {message:string}).message,true);}};}
for(const [id,action]of [['apply-roi','roi'],['share','select']])$(id).onclick=guarded(()=>{const picked=selection(),reason=selectionActionReason(action,picked,state.object);if(reason)throw new Error(reason);return act(action,{selection:picked});});
$('measure').onclick=guarded(async()=>{
 const picked=selection(),reason=selectionActionReason('measure',picked,state.object);if(reason)throw new Error(reason);let mark=state.object.annotations?.find(m=>m.annotation_id===selectedId&&m.kind===picked.kind&&equalRecords(m.anchor?.coordinates,picked.coordinates));
 if(!mark){
  const r=await act('mark',{selection:picked,annotation_id:internalMarkId(()=>crypto.randomUUID()),text:measurementLabel(picked,(state.object.annotations?.length??0)+1),color:'cyan',status:'hypothesized'});
  if(!r||pending||state.pending_result)return;
  const id=r.last_operation?.annotation_ids?.[0];mark=r.object.annotations?.find(m=>m.annotation_id===id);if(!mark)throw new Error('标记保存未确认；请查询原请求');chooseMark(id!);
 }
 measuredMarkId=mark.annotation_id!;
 const panel=markPanel(mark),previous=measurementWorkspace.latestForAnnotation(mark.annotation_id!);
 return act('measure',{selection:{...mark.anchor,kind:mark.kind,panel},annotation_id:mark.annotation_id,...(previous?{measurement_object_id:previous.object_id}:{})});
});
$('fft').onclick=guarded(()=>{if(importedComplex())throw new Error('复数原图暂不支持 FFT；不会丢弃虚部或把显示幅值当作原数组');const picked=selection(),reason=selectionActionReason('fft',picked,state.object);if(reason)throw new Error(reason);return act('fft',{selection:picked,window:$('fft-window').value,subtract_mean:$('fft-mean').checked});});
$('roi-statistics').onclick=guarded(()=>{const picked=selection(),reason=selectionActionReason('statistics',picked,state.object);if(reason)throw new Error(reason);return act('statistics',{selection:picked,component:$('probe-component').value});});
$('line-profile').onclick=guarded(()=>{const picked=selection(),reason=selectionActionReason('profile',picked,state.object);if(reason)throw new Error(reason);return act('profile',{selection:picked,component:$('probe-component').value,sample_count:Number($('profile-count').value)});});
$('reload').onclick=()=>windowSwitch?recoverWindowDisplay():guarded(refresh,{allowRecoveryRead:true})();$('window-switch-check').onclick=()=>recoverWindowDisplay();$('zoom').oninput=()=>{if(windowSwitch)return;const r=viewport.getBoundingClientRect();view=zoomAt(view,[r.width/2,r.height/2],Number($('zoom').value)/view.scale);resize();};$('fit').onclick=()=>{if(!windowSwitch)fitView();};$('fit-canvas').onclick=()=>{if(!windowSwitch)fitView();};$('focus-image').onclick=()=>{if(!windowSwitch)toggleImageFocus();};
for(const id of ['gamma','low','high','axes','scale']){$(id).oninput=()=>{if(!recordDisplayInput(id))return;$('gamma-label').textContent=$('gamma').value;record();schedulePaint();publishDraft();message('显示草稿即时反馈；保存后从原科学数组重绘，不重算 FFT。');};$(id).onchange=()=>userHistory.endGroup();}
$('apply-display').onclick=guarded(()=>{const frequency=state.object.panels?.some(p=>p.domain==='frequency');return act('preview',{gamma:Number($('gamma').value),display_range:$('low').value===''||$('high').value===''?null:[Number($('low').value),Number($('high').value)],...(frequency?{spectrum_axes:$('axes').checked}:{scale_bar:$('scale').checked})});});
$('apply-complex-component').onclick=guarded(()=>{if(!importedComplex())throw new Error('当前不是可切换分量的原复数图像');if(dirty()||drag||pending||state.pending_result)throw new Error('先保存或撤销当前显示/标注草稿，再切换复数分量；草稿已保留');const component=$('complex-component').value;if(!Object.hasOwn(complexComponentNames,component))throw new Error('请选择实部、虚部、幅值或功率');if(component===(state.effective_display??state.object.display??{}).component){message('已经显示这个分量，没有创建新的结果。');return;}return act('preview',{component,display_range:null});});
$('set-frame').onclick=guarded(()=>act('frame',{frame_index:Number($('frame').value)-1}));$('previous-frame').onclick=guarded(()=>act('frame',{frame_index:Math.max(0,Number($('frame').value)-2)}));$('next-frame').onclick=guarded(()=>act('frame',{frame_index:Number($('frame').value)}));$('full').onclick=guarded(()=>act('preview',{frequency_rect:null}));$('export').onclick=guarded(()=>{if(dirty())throw new Error('请先保存或撤销草稿，再导出已保存视图。');return act('export');});$('recover').onclick=()=>roiCreationRecovery?recoverRoiCreation():guarded(()=>act('recover',failedMeasurement?.request_id?{request_id:failedMeasurement.request_id}:{}),{allowRecoveryRead:true})();
$('existing').onchange=()=>{if(!chooseMark($('existing').value))return;const mark=state.object.annotations?.find(value=>value.annotation_id===selectedId),rectangle=mark?.kind==='rectangle'&&mark.anchor;if(rectangle){const p=markPanel(mark!);draft={kind:'rectangle',...rectangle,panel:p,rendered:transformCoordinates(rectangle.coordinates,p,{edges:true,inverse:true})} as AppSelection;showDraft();}record();paint();publishDraft({includeSelection:Boolean(rectangle)});};
for(const id of ['mark-text','color','status'])$(id).oninput=()=>{if(!allowContentEditing()){const mark=effectiveEdit(selectedId);$('mark-text').value=mark?.text??'';$('color').value=mark?.color??'cyan';$('status').value=mark?.status??'hypothesized';return;}if(!fieldBefore&&selectedId)fieldBefore=effectiveEdit(selectedId);fieldDirty=true;marksDirty=true;record();schedulePaint();publishDraft();autoFields();};
$('save-mark').onclick=guarded(async()=>{explicitEditRetry=false;if(selectedId){commitLabelDraft();captureSelected();return flushEdits();}if(state.last_operation?.state==='not_submitted'&&draft?.kind==='rectangle'&&draft.coordinate_space==='source_pixels')return saveRoiObservation('',{geometryOnly:true});const fields={text:$('mark-text').value,color:$('color').value,status:$('status').value};return act('mark',{selection:selection(),annotation_id:$('mark-id').value,...fields});});
$('undo').onclick=()=>applyUserHistory('undo');$('redo').onclick=()=>applyUserHistory('redo');
// A click authorizes this read only, never edits made while it is in flight.
async function readSavedView({discardAuthorizedDraft=false}={}){
 const epoch=interactionEpoch,objectId=state.object.object_id,next=await api('/api/state');
 if(interactionEpoch!==epoch||state.object.object_id!==objectId||drag)throw new Error('读取期间有新操作；编辑已保留，请重新查看保存版本。');
 if(discardAuthorizedDraft&&next.last_operation?.state==='submitted'){
  if(next.object.object_id===objectId){state={...state,last_operation:next.last_operation,pending_result:next.pending_result,state_revision:Math.max(state.state_revision??0,next.state_revision??0)};mirrorWindowCollection(next);}else{pending=next;showPending();}
  throw new Error('读回发现原请求尚未确认；先查询原请求，草稿与待查看结果保留。');
 }
 if(!await load(next,{discardAuthorizedDraft}))throw new Error('读取期间有新操作；编辑已保留，请重新查看保存版本。');
}
const discardLocalDraft=guarded(async()=>{if(busy||autoFailed||state.last_operation?.state==='submitted')throw new Error('原请求仍未确认，先查询其结果；本地编辑保留。');interactionEpoch++;const previous=pending;await readSavedView({discardAuthorizedDraft:true});if(pending===previous)pending=null;showPending();message('本地草稿已撤回；保存过的科学版本仍保留。');},{allowRoiRecovery:true});$('discard-local').onclick=()=>windowSwitch?recoverWindowDisplay(true):discardLocalDraft();
const discardPendingDraft=guarded(async()=>{
 if(busy||drag||observationSavePhase)throw new Error('先完成当前保存、校验或手势；草稿仍保留。');
 if(autoFailed||state.last_operation?.state==='submitted')throw new Error('原请求尚未确认；先查询原请求，草稿仍保留。');
 interactionEpoch++;
 if(pending){const previous=pending;await readSavedView({discardAuthorizedDraft:true});if(pending===previous)pending=null;showPending();}
 else{
  await readSavedView({discardAuthorizedDraft:true});
  if(!await act('accept-result'))return;
 }
 if(pending||state.pending_result||dirty()||drag){message('保存版本尚未完全接续；较新草稿保留，请核对后继续。');return;}
 message('已查看保存版本；旧科学版本仍保留。');
});
$('discard-draft').onclick=()=>windowSwitch?recoverWindowDisplay(true):discardPendingDraft();
$('accept-agent-result').onclick=guarded(async()=>{if(dirty()||drag)throw new Error('先保存、撤销或明确放弃草稿，再查看保存结果');if(pending){const previous=pending;await readSavedView();if(pending===previous)pending=null;showPending();}return act('accept-result');});
const calibrate=(withdraw:boolean)=>act('calibrate',{coordinate_domain:state.object.xy_calibration?.coordinate_domain??'real_space',scope:$('scope').value,xy_scale:withdraw?null:{x:Number($('scale-x').value),y:Number($('scale-y').value),unit:$('unit').value},source_text:$('source').value});$('calibrate').onclick=guarded(()=>calibrate(false));$('withdraw').onclick=guarded(()=>calibrate(true));
$('submit-observation').onclick=guarded(()=>act('research-observation',{source_text:$('observation-text').value,authority:$('observation-authority').value}));
const revisionKey=(value:{state_revision?:number;object_id?:string;object?:{object_id:string};pending_result?:AppState['pending_result']})=>JSON.stringify([value.state_revision,value.object_id??value.object?.object_id,value.pending_result?.object_id,value.pending_result?.request_id]);
function setMode(mode:string){if(workspaceRestoring||windowSwitch)return;mode=mode==='edit'?'select':mode;if(recoveryPending()&&!['select','pan'].includes(mode)&&!allowContentEditing())return;$('mode').value=mode;canvas.style.cursor=mode==='pan'?'grab':mode==='select'?'default':'crosshair';for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>setMode(button.dataset.mode!);
$('add-roi').onclick=guarded(()=>setMode('roi'));$('select-roi').onclick=guarded(()=>setMode('select'));
$('delete-roi').onclick=guarded(()=>deleteSelectedRoi());
$('view-latest-roi').onclick=guarded(()=>navigateSavedView(latestRoiTarget()));
$('toggle-research').onclick=()=>document.body.classList.contains('research-open')?closeResearch():openResearch();$('close-research').onclick=closeResearch;
$('save-observation-entry').onclick=()=>{openResearch();$('roi-reason').focus();};
$('agent-continue').onclick=guarded(async()=>{
 const checkLocal=()=>{if(busy||drag||dirty())throw new Error('先保存或撤销草稿，再交给 Agent。');if(pending||state.pending_result)throw new Error('有待接纳结果；先处理当前结果，再交给 Agent。');};
 checkLocal();
 const objectId=state.object.object_id,revision=historyDraft.revision,epoch=interactionEpoch;
 const identity=[state.panel_id,state.helper_session_id,state.panel_generation];
 const checkVersion=()=>{checkLocal();if(interactionEpoch!==epoch||state.object.object_id!==objectId||historyDraft.revision!==revision||!equalRecords(identity,[state.panel_id,state.helper_session_id,state.panel_generation]))throw new Error('面板或草稿版本已改变；请重新查看当前状态后再交接。');};
 // Confirm this browser's current draft, not merely the previous publisher.
 // Draft acknowledgement and state reads create no scientific object/request.
 if(state.multi_roi_handoff_schema_version===1&&state.window_collection){await windowWorkspace.awaitStableMetadata();checkVersion();}
 await publishDraft({includeSelection:true,urgent:true,confirmPersistence:true});
 if(draftError)throw new Error('交接状态保存未确认；编辑已保留，请确认连接后重试交接。');
 checkVersion();
 const latest=await api('/api/state');
 checkVersion();
 if(state.object.object_id!==objectId||historyDraft.revision!==revision||latest.object.object_id!==objectId||latest.edit_state?.draft_revision!==revision||
    !equalRecords(identity,[latest.panel_id,latest.helper_session_id,latest.panel_generation]))throw new Error('面板或草稿版本已改变；请重新查看当前状态后再交接。');
 let packet:unknown;
 if(latest.multi_roi_handoff_schema_version===1&&latest.window_collection){const query=`expected_object_id=${encodeURIComponent(latest.object.object_id)}&state_revision=${latest.state_revision}&draft_revision=${latest.edit_state?.draft_revision}&collection_revision=${latest.window_collection.revision}`;packet=await api('/api/roi-handoff?'+query);checkVersion();}
 researchWorkspace.showHandoff(latest as unknown as PanelRoiSnapshot,packet);
});
$('close-agent-handoff').onclick=()=>$('agent-handoff-dialog').close();
let usageReturnFocus:BrowserElement|null=null;
$('open-usage-help').onclick=()=>{const dialog=$('usage-dialog');if(dialog.open)return;const previous=document.activeElement,menu=transientMenus.find(value=>value.open&&previous&&withinElement(previous,value));dismissMenus();usageReturnFocus=menu?.querySelector('summary')??previous??$('open-usage-help');dialog.showModal();$('close-usage-help').focus();};
$('close-usage-help').onclick=()=>$('usage-dialog').close();
$('usage-dialog').addEventListener('cancel',event=>{event.preventDefault();$('usage-dialog').close();});
$('usage-dialog').addEventListener('close',()=>{const target=usageReturnFocus;usageReturnFocus=null;target?.focus();});
$('crystal-short-status').onclick=()=>{openResearch();$('crystal-evidence').scrollIntoView({block:'start'});};
$('close-crystal-image').onclick=()=>$('crystal-image-dialog').close();
$('toggle-properties').onclick=()=>{closeResearch();document.body.classList.toggle('properties-open');syncDrawerPresentation();};$('close-properties').onclick=()=>{document.body.classList.remove('properties-open');syncDrawerPresentation();};
$('toggle-settings').onclick=()=>{closeResearch();document.body.classList.add('properties-open');$('settings-panel').open=true;syncDrawerPresentation();};
$('settings-panel').addEventListener('toggle',syncDrawerPresentation);$('measurement-workspace').addEventListener('toggle',syncDrawerPresentation);
for(const id of ['label-text','label-size','marker-shape','label-visible','geometry-visible','label-leader','label-pinned'])$(id).oninput=editPresentation;
$('annotation-preset').onchange=()=>{figurePrefs.preset=$('annotation-preset').value;syncFigureControls();schedulePaint();message('仅切换标注显示预设；科学坐标与确认状态保持原样。');};
$('figure-mode').onclick=()=>{figurePrefs.mode=figurePrefs.mode==='figure'?'analysis':'figure';syncFigureControls();schedulePaint();message(figurePrefs.mode==='figure'?'出图模式：可继续拖动文字；科学锚点已锁定。':'分析模式：圆圈移动改变科学点位，文字移动只改变排版。');};
$('layer-view').onchange=()=>{const v=$('layer-view').value;figurePrefs.layers={experimental:v==='all'||v==='experimental',simulation_A:['all','A','simulation'].includes(v),simulation_B:['all','B','simulation'].includes(v)};$('layer-summary').textContent=$('layer-view').selectedOptions?.[0]?.textContent??v;schedulePaint();};
$('arrange-labels').onclick=()=>{commitLabelDraft();const arranged=layoutAnnotations(renderedMarks(),{...figurePrefs,width:canvas.width,height:canvas.height,scale:view.scale,arrange:true});for(const update of arranged.suggestedUpdates??[])queueEdit({annotation_id:update.id??(update as {annotation_id?:string}).annotation_id,presentation:update.presentation});schedulePaint();message('已整理未固定标签；手工固定位置与科学锚点保留。');};
$('figure-options').onclick=()=>{$('figure-columns').value=figurePrefs.columns;$('figure-font').value=figurePrefs.fontPt;$('figure-legend').checked=figurePrefs.legend;$('figure-scale').checked=figurePrefs.scaleBar;$('figure-letter').value=figurePrefs.letter;$('figure-dialog').showModal();};
function figureOptions(){return {...figurePrefs,columns:$('figure-columns').value,fontPt:Math.max(7,Math.min(12,Number($('figure-font').value)||8)),legend:$('figure-legend').checked,scaleBar:$('figure-scale').checked,letter:$('figure-letter').value};}
for(const id of ['figure-columns','figure-font','figure-legend','figure-scale','figure-letter'])$(id).oninput=()=>{figurePrefs=figureOptions();schedulePaint();};
$('export-figure').onclick=guarded(async()=>{
 commitLabelDraft();captureSelected();while(queuedEdits.size||autoSaving){if(autoFailed)throw new Error('标签保存失败；本地编辑保留，请先查询原请求');if(busy&&!autoSaving)throw new Error('保存仍在进行，请稍后导出');await flushEdits();}
 if(dirty()||drag||busy)throw new Error('先保存显示草稿并结束手势，再导出图面');const revision=historyDraft.revision,id=state.object.object_id,marks=renderedMarks(),preferences=figureOptions();$('figure-export-status').textContent='正在从保存数组生成干净底图与矢量图层…';busy=true;diagnostics();
 try{await draftPublisher;const base=await api('/api/action',{expected_object_id:id,draft_revision:revision,action:'figure-base',params:{}});if(historyDraft.revision!==revision||state.object.object_id!==id||drag)throw new Error('导出期间图面已变化；新编辑已保留，请结束后重新导出');const bundle=await buildFigureBundle({state:{...state,figure_base:base.figure_base!},marks,preferences,base64:base.figure_base!.clean_png_base64!,scaleBar:base.figure_base!.scale_bar});if(historyDraft.revision!==revision||state.object.object_id!==id||drag)throw new Error('导出期间图面已变化；新编辑已保留，请结束后重新导出');downloadBlob(bundle.blob,'microscopy-figure.zip');$('figure-export-status').textContent='已下载 clean.png、annotations.svg、annotated.png 和 figure.json。保留原工作区后可载入配方继续编辑。';message('图面已导出；科学像素、锚点与旧版本保持原样。');}
 catch(e){$('figure-export-status').textContent='导出未完成：'+(e as {message:string}).message;throw e;}finally{busy=false;diagnostics();}
});
async function importRecipeText(text:string){try{if(text.length>512000)throw new Error('图面配方超过大小上限');if(dirty()||busy||drag)throw new Error('先结束手势并保存草稿，再载入配方');const recipe:unknown=JSON.parse(text),updates=readFigureRecipe(recipe,state);const preferences=(recipe as {readonly preferences:Readonly<Record<string,unknown>>}).preferences,layers=preferences.layers as {readonly experimental?:unknown;readonly simulation_A?:unknown;readonly simulation_B?:unknown}|null|undefined;const restored=await act('restore-figure-display',{recipe});if(!restored||pending||state.pending_result||drag||dirty()||state.object.object_id!==restored.object.object_id)throw new Error('显示恢复尚未安全接续；当前草稿保留，请处理待查看结果后重试');for(const update of updates)queueEdit(update);figurePrefs={...figurePrefs,...preferences,layers:{experimental:layers?.experimental!==false,simulation_A:layers?.simulation_A===true,simulation_B:layers?.simulation_B===true},letter:String(preferences.letter??'').slice(0,8)};syncFigureControls();schedulePaint();$('figure-export-status').textContent='已恢复底图显示、标签与样式；科学锚点和确认状态已逐项校验并保留。';}catch(e){$('figure-export-status').textContent='载入未完成：'+(e as {message:string}).message;throw e;}}
$('import-figure').onchange=guarded(async()=>{const file=$('import-figure').files?.[0];if(!file)return;if(file.size>512000)throw new Error('图面配方超过大小上限');await importRecipeText(await file.text());});
$('load-recipe-text').onclick=guarded(()=>importRecipeText($('recipe-text').value));
$('frame').onkeydown=event=>{if(event.key==='Enter')($('set-frame').onclick as ()=>unknown)();};
$('view-back').onclick=guarded(()=>navigateSavedView(savedViews.target(-1)));
let composition:CompositionDraft={schema:'microscopy-figure-composition-v1',layout:'2x2',font_pt:8,roiOutlines:true,showLegend:true,slots:[]},compositionPanels:CompositionPanel[]=[],compositionRevision=0,compositionPreviewURL:string|null=null,compositionWorking=false;
const compositionCopy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function compositionPreview(){
 if(compositionPreviewURL){URL.revokeObjectURL(compositionPreviewURL);compositionPreviewURL=null;}
 $('composer-preview').hidden=true;const required=composition.layout==='2x2'?4:3;
 $('composer-export').disabled=compositionWorking||composition.slots.length!==required;
 if(composition.slots.length!==required){$('composer-status').textContent=`已加入 ${composition.slots.length} 幅；此布局需要 ${required} 幅，不会静默丢弃多余子图。`;return;}
 try{const result=renderCompositionSVG({recipe:composition,panels:compositionPanels.map((panel,i)=>({...panel,slot:composition.slots[i]}))});compositionPreviewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('composer-preview').src=compositionPreviewURL;$('composer-preview').hidden=false;$('composer-status').textContent='预览使用已保存资产；布局、编号与字号不改变科学数组。'+(composition.roiOutlines?(result.roi_outline_count?` 已按源坐标显示 ${result.roi_outline_count} 个 ROI 框。`:' 当前没有核对通过的原图 / ROI 对应关系，未猜测画框。'):'');}
 catch(error){$('composer-export').disabled=true;$('composer-status').textContent='预览未完成：'+(error as {message:string}).message;}
}
function renderComposition(){
 $('composer-layout').value=composition.layout;$('composer-font').value=composition.font_pt;$('composer-roi-outlines').checked=composition.roiOutlines===true;$('composer-legend').checked=composition.showLegend!==false;for(const id of ['composer-layout','composer-font','composer-roi-outlines','composer-legend'])$(id).disabled=compositionWorking;const list=$('composer-slots');list.replaceChildren();
 composition.slots.forEach((slot,i)=>{const row=document.createElement('li'),label=document.createElement('span'),title=document.createElement('input');label.textContent=String.fromCharCode(97+i)+` · ${slot.kind==='profile'?'保存剖面':'保存图像'}`;title.value=slot.title??'';title.maxLength=80;title.setAttribute('aria-label',`子图 ${String.fromCharCode(97+i)} 标题`);title.oninput=()=>{slot.title=title.value;compositionRevision++;compositionPreview();};row.append(label,title);
  for(const [text,offset]of [['↑',-1],['↓',1],['移除',0]] as const){const button=document.createElement('button');button.textContent=text;button.type='button';button.disabled=compositionWorking||offset!==0&&(i+offset<0||i+offset>=composition.slots.length);button.setAttribute('aria-label',`${text}子图 ${String.fromCharCode(97+i)}`);button.onclick=compositionGuard(async()=>{if(offset){[composition.slots[i],composition.slots[i+offset]]=[composition.slots[i+offset],composition.slots[i]];[compositionPanels[i],compositionPanels[i+offset]]=[compositionPanels[i+offset],compositionPanels[i]];}else{composition.slots.splice(i,1);compositionPanels.splice(i,1);}compositionRevision++;renderComposition();await ensureOutlineEvidence();});row.append(button);}list.append(row);
 });$('composer-add-image').disabled=compositionWorking||composition.slots.length>=4;$('composer-add-profile').disabled=compositionWorking||composition.slots.length>=4||!dataProbes.profile;$('composer-default-titles').disabled=compositionWorking||!composition.slots.length;compositionPreview();
}
function compositionGuard(callback:()=>unknown){return async()=>{if(compositionWorking)return;compositionWorking=true;renderComposition();try{await callback();}catch(error){$('composer-status').textContent='图版未完成：'+(error as {message:string}).message;message((error as {message:string}).message,true);}finally{const finalMessage=$('composer-status').textContent;compositionWorking=false;renderComposition();$('composer-status').textContent=finalMessage;}};}
async function ensureOutlineEvidence(){
 if(!composition.roiOutlines||composition.slots.length!==(composition.layout==='2x2'?4:3)||compositionPanels.every(p=>p.slot.kind==='profile'||!p.state?.object?.panels?.some(m=>m.domain==='spatial_pixels')||p.spatial_source))return;
 const saved=compositionCopy(composition),ticket=compositionRevision;$('composer-status').textContent='正在只读核对 ROI 与原图的科学来源；不重算 FFT…';
 const resolved=await api('/api/composition/resolve',{composition:saved});if(ticket!==compositionRevision)throw new Error('核对期间图版已变化；保留当前编辑');compositionPanels=resolved.panels;compositionPreview();
}
const composerButton=document.createElement('button');composerButton.id='composer-options';composerButton.textContent='组合图版';composerButton.title='复用保存图像和剖面，制作 2×2 或 1×3 图版';$('figure-options').parentNode?.append?.(composerButton);composerButton.onclick=()=>{renderComposition();$('composer-dialog').showModal();};
$('composer-layout').onchange=()=>{const layout=$('composer-layout').value;return compositionGuard(async()=>{composition.layout=layout;$('composer-layout').value=layout;compositionRevision++;await ensureOutlineEvidence();compositionPreview();})();};$('composer-font').oninput=()=>{if(compositionWorking)return;composition.font_pt=Number($('composer-font').value);compositionRevision++;compositionPreview();};
$('composer-default-titles').onclick=()=>{if(compositionWorking)return;composition.slots.forEach((slot,i)=>{const panel=compositionPanels[i];slot.title=defaultCompositionTitle(slot.kind==='profile'?panel.profile:panel.state);});compositionRevision++;renderComposition();};
$('composer-roi-outlines').onchange=()=>{const enabled=$('composer-roi-outlines').checked;return compositionGuard(async()=>{composition.roiOutlines=enabled;$('composer-roi-outlines').checked=enabled;compositionRevision++;await ensureOutlineEvidence();compositionPreview();})();};
$('composer-legend').onchange=()=>{if(compositionWorking)return;composition.showLegend=$('composer-legend').checked;compositionRevision++;compositionPreview();};
$('composer-add-image').onclick=compositionGuard(async()=>{
 if(dirty()||busy||drag||pending||state.pending_result)throw new Error('先保存当前显示和标注、结束手势，再加入保存版本');
 const captured=compositionCopy(state),revision=historyDraft.revision,id=state.object.object_id,ticket=compositionRevision;busy=true;diagnostics();$('composer-status').textContent='正在读取保存版本的干净底图；不重算 FFT 或测量…';
 try{await draftPublisher;const result=await api('/api/action',{expected_object_id:id,draft_revision:revision,action:'figure-base',params:{}});if(id!==state.object.object_id||historyDraft.revision!==revision||drag||ticket!==compositionRevision)throw new Error('捕获期间视图或图版已变化；没有覆盖新草稿，请完成后重试');const slot=makeImageSlot(captured,figureOptions(),result.figure_base!,$('composer-title').value.trim()||defaultCompositionTitle(captured,{role:savedViews.entries[savedViews.index]?.role}));composition.slots.push(slot);compositionPanels.push({slot,state:captured,clean_png_base64:result.figure_base!.clean_png_base64,scale_bar:slot.scale_bar});compositionRevision++;$('composer-title').value='';renderComposition();await ensureOutlineEvidence();}
 finally{busy=false;diagnostics();}
});
$('composer-add-profile').onclick=compositionGuard(async()=>{if(!dataProbes.profile)throw new Error('先在当前图像读取有效剖面；旧标定的曲线不能作为当前剖面加入');const profile=compositionCopy(dataProbes.profile),slot=makeProfileSlot(profile,$('composer-title').value.trim()||defaultCompositionTitle(profile));composition.slots.push(slot);compositionPanels.push({slot,profile});compositionRevision++;$('composer-title').value='';renderComposition();await ensureOutlineEvidence();});
$('composer-export').onclick=compositionGuard(async()=>{const saved=compositionCopy(composition),ticket=compositionRevision;validateComposition(saved);$('composer-status').textContent='正在只读核对全部保存资产并导出…';const resolved=await api('/api/composition/resolve',{composition:saved});if(ticket!==compositionRevision)throw new Error('布局已改变，没有用旧结果覆盖它');const bundle=await buildCompositionBundle({recipe:saved,panels:resolved.panels});if(ticket!==compositionRevision)throw new Error('导出期间布局已改变，请重试当前版本');downloadBlob(bundle.blob,'microscopy-composition.zip');compositionPanels=resolved.panels;$('composer-status').textContent='已下载完整 composition.svg、composition.png 和可恢复 composition.json；未重新计算 FFT 或剖面。';});
$('composer-import').onchange=compositionGuard(async()=>{const file=$('composer-import').files?.[0];if(!file)return;if(file.size>512*1024)throw new Error('布局 JSON 超过 512 KiB');const ticket=compositionRevision;$('composer-status').textContent='正在只读核对布局引用；不切换当前图像或覆盖草稿…';const input:unknown=JSON.parse(await file.text()),saved=validateComposition(input);const resolved=await api('/api/composition/resolve',{composition:saved});if(ticket!==compositionRevision)throw new Error('载入期间图版已变化，没有覆盖新布局');composition=saved;compositionPanels=resolved.panels;compositionRevision++;renderComposition();$('composer-status').textContent='已恢复布局及原保存资产；当前科学图像与未保存草稿保持原样。';});
$('view-forward').onclick=guarded(()=>navigateSavedView(savedViews.target(1)));
$('view-original').onclick=guarded(()=>navigateSavedView(savedViews.original(state)));
$('return-spatial').onclick=guarded(returnToSpatialObservation);
for(const tab of ['measurements','statistics','profile']){
 const button=$('results-tab-'+tab);if(button){button.onclick=()=>setResultsTab(tab);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const names=['measurements','statistics','profile'],i=names.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;setResultsTab(names[next]);$('results-tab-'+names[next])?.focus?.();};}
}
setResultsTab('measurements',{expand:false});

async function pollRevision(){
 try{if(state&&!document.hidden&&!busy&&!drag&&!observationSavePhase&&!windowSwitch&&!workspaceRestoring){const next=await api('/api/revision');if(revisionKey(next)!==revisionKey(state))await refresh();}}
 catch{/* A closed panel is not restarted and no scientific operation is retried. */}
 finally{if(typeof setTimeout==='function')setTimeout(pollRevision,1500);}
}
(globalThis as typeof globalThis & BrowserEnvironment).addEventListener?.('beforeunload',event=>{if(dirty()||drag||windowSwitch||workspaceRestoring||windowWorkspace.hasPendingMetadata()||state?.workspace_analysis&&state.workspace_analysis.status!=='clean'){event.preventDefault();event.returnValue='';}});
interface DesktopActionBridge {onAction(handler:(action:string)=>Promise<{ok:boolean;error?:string;working_revision?:number}>):void;}
const desktopBridge=(globalThis as typeof globalThis & {workbenchDesktop?:DesktopActionBridge}).workbenchDesktop;
desktopBridge?.onAction(async action=>{
 if(action==='inspect-close-state'){
  if(!state||dirty()||drag||busy||windowSwitch||workspaceRestoring||workspaceSettling||orphanedDraft||pending||state.pending_result||state.last_operation?.state==='submitted'||autoSaving||queuedEdits.size||remeasuringMarks.size||draftPending||draftSending||draftError||autoFailed||roiCreationRecovery||observationSavePhase||failedMeasurement||windowWorkspace.hasPendingMetadata()||!Number.isSafeInteger(loadedWorkingRevision)||!equalRecords(draft?selection():null,state.selection??null))return {ok:false,error:'当前图像或本地编辑尚未与已读取的工作状态一致；保留所有本地内容。'};
  return {ok:true,working_revision:loadedWorkingRevision};
 }
 try{
  if($('usage-dialog').open&&!['help','prepare-close'].includes(action))throw new Error('请先关闭使用说明，再操作图像或保存。');
  if(action==='prepare-close')await workspaceControls.prepareClose();
  else if(action==='save')await workspaceControls.save();
  else if(['undo','redo'].includes(action)&&document.activeElement&&textEntry(document.activeElement)){if(!document.execCommand?.(action as 'undo'|'redo'))throw new Error('当前文本没有可撤销或恢复的编辑。');}
  else if(['roi','select','pan'].includes(action))setMode(action);
  else if(action==='delete'){if(document.activeElement!==canvas||textEntry(document.activeElement))throw new Error('先在图像画布中明确选中 ROI，再删除。');deleteSelectedRoi();}
  else{const id=({undo:'undo',redo:'redo',fft:'fft',measure:'measure','return-spatial':'return-spatial',tile:'tile-windows',history:'open-execution-history',help:'open-usage-help'} as Record<string,string>)[action];if(!id||!$(id)||$(id).disabled)throw new Error('当前选择或工作状态不允许此操作。');await ($(id).onclick as ()=>unknown)();}
  return {ok:true};
 }catch(error){message((error as Error).message,true);return {ok:false,error:(error as Error).message};}
});
const resizer=$('results-resizer');
if(resizer){let resizing:{y:number;height:number}|null=null;resizer.onpointerdown=event=>{resizing={y:event.clientY,height:document.querySelector('.measurement-content')!.getBoundingClientRect().height};resizer.setPointerCapture(event.pointerId);};resizer.onpointermove=event=>{if(resizing)document.querySelector('.measurement-content')!.style.height=Math.max(130,Math.min(innerHeight*.55,resizing.height+resizing.y-event.clientY))+'px';};resizer.onpointerup=()=>{resizing=null;};resizer.onpointercancel=()=>{resizing=null;};resizer.onkeydown=event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const content=document.querySelector('.measurement-content');content!.style.height=Math.max(130,content!.getBoundingClientRect().height+(event.key==='ArrowUp'?20:-20))+'px';}};}
const drawerResizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(syncDrawerBounds);
for(const id of ['workbench','viewport','research-strip','figure-toolbar','view-navigation','pending-result','spatial-return-status','canvas-context','canvas-footer','measurement-workspace','measurement-content'])drawerResizeObserver?.observe($(id));
(globalThis as typeof globalThis & BrowserEnvironment).addEventListener?.('resize',syncDrawerBounds);
syncDrawerPresentation();
refresh().then(()=>{syncDrawerPresentation();hydrateWorkingDraft(state);workspaceControls.sync();message(state.workspace_analysis?.recovery_available?'当前打开明确保存版本；可选择恢复未保存编辑。':orphanedDraft?'检测到先前未保存的草稿记录；请明确撤回草稿后继续。':'滚轮缩放 · 空格拖动 · Ctrl+S 保存分析工作区'+(panelLayoutUnrecorded?'；此前未记录面板开合，当前使用默认显示。':''));if(typeof setTimeout==='function')setTimeout(pollRevision,1500);}).catch(e=>message((e as {message:string}).message,true));
