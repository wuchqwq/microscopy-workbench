// Execute the actual UI event handlers with a deterministic DOM/canvas/API shim.
// No browser timing, DM, private data, or worker/backend qualification is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as coordinates from '../ui/image-panel/coordinates.mjs';
import * as userWorkflow from '../ui/image-panel/user-workflow.mjs';
import * as viewerState from '../ui/image-panel/viewer-state.mjs';
import * as viewerRender from '../ui/image-panel/viewer-render.mjs';
import * as annotationPresentation from '../ui/image-panel/annotation-presentation.mjs';
import * as figureExport from '../ui/image-panel/figure-export.mjs';
import * as observationContract from '../ui/image-panel/observation-contract.mjs';
import * as roiEditing from '../ui/image-panel/roi-editing.mjs';
import {renderSequenceEvidence} from '../ui/image-panel/sequence-evidence.mjs';
import {renderDomainEvidence} from '../ui/image-panel/domain-evidence.mjs';
import {ResearchWorkspace} from '../ui/image-panel/research-workspace.mjs';
import {WindowWorkspace,readWindowCollection,readWindowCamera,readWindowViewContext} from '../ui/image-panel/window-workspace.mjs';
import {WorkspaceControls} from '../ui/image-panel/workspace-controls.mjs';
import {RoiComparisonPanel} from '../ui/image-panel/roi-comparison.mjs';
import {settleWorkspaceWindows} from '../ui/image-panel/settle-workspace.mjs';
import {ExecutionHistoryPanel} from '../ui/image-panel/execution-history.mjs';
import {DataProbes as ProviderDataProbes} from '../ui/image-panel/data-probes.mjs';
import {MeasurementWorkspace as ProviderMeasurementWorkspace,requiresMeasurementJump} from '../ui/image-panel/measurement-workspace.mjs';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';

const source=readFileSync(process.env.PANEL_UI_UNDER_TEST??new URL('../ui/image-panel/app.mjs',import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const sourceId='a'.repeat(32),viewId='b'.repeat(32);
const panel={domain:'spatial_pixels',source_object_id:sourceId,source_rect_xyxy:[20,12,148,108],image_rect_xyxy:[0,0,128,96]};
function fixture(){return {object:{object_id:viewId,kind:'view',panels:[copy(panel)],annotations:[],display:{gamma:1,display_range:[0,255]}},tools:[],png_base64:'synthetic',clean_png_base64:'synthetic-clean',render_base_id:viewId,selection:null,last_operation:null};}
function pixelBytes(w,h){return Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*17+31)%256);}
async function harness(initial=fixture(),{windowStates=[],panelGeometry=false}={}){
 const calls=[],draftCalls=[],getCalls=[],frames=new Map(),stats={pow:0,draws:0,uploads:0};let server=copy(initial),frameId=0,waitAction=null,nextActionResult=null,actionSequence=0,actionFailure=null,draftFailure=null,waitDecode=null,waitState=null,waitDraft=null,waitMeasurement=null,measurementResponse=null,recoveryResponse=null;
 const windowMetadataCalls=[],actionTrace=[],savedWindowStates=new Map([[initial.object.object_id,copy(initial)],...windowStates.map(value=>[value.object.object_id,copy(value)])]),activationListeners=[];let waitActivation=null,lostActivation=false,activationWork=null,decodeFailure=false,stateFailure=false,activationStarted=0;
 const canvasContexts=[],probeCalls=[],probeTimers=new Map(),documentListeners=new Map(),layoutObservers=[];let probeTimerId=0,coalesceDrafts=false,activeElement=null,desktopAction=null;
 class Context{
  constructor(canvas){this.canvas=canvas;this.lastPixels=null;canvasContexts.push(this);}
  drawImage(image){stats.draws++;this.lastPixels=image.context?.lastPixels??null;}
  getImageData(x,y,w,h){return {data:pixelBytes(w,h),width:w,height:h};}
  putImageData(value){stats.uploads++;this.lastPixels={data:new Uint8ClampedArray(value.data),width:value.width,height:value.height};}
  clearRect(){} fillText(){} strokeRect(){} setLineDash(){} beginPath(){} arc(){} stroke(){} moveTo(){} lineTo(){} closePath(){} save(){} restore(){} fill(){}
 }
 class Element{
  constructor(id){this.id=id;this.value='';this.style={};this.dataset={};this.attributes={};this.children=[];this.listeners={};this.classList={toggle(){}};this.textContent='';this.width=128;this.height=96;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  replaceChildren(...children){for(const child of this.children)if(child.parentNode===this)child.parentNode=null;this.children=[];this.append(...children);this.value=children[0]?.value??'';}
  append(...children){for(const child of children){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(value=>value!==child);this.children.push(child);child.parentNode=this;}}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(value=>value!==this);this.parentNode=null;}
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(){return null;}
  getContext(){return this.context??=new Context(this);}
  getBoundingClientRect(){if(panelGeometry&&this.id==='viewport')return {left:0,top:0,width:1000-(bodyClasses.has('properties-open')?304:bodyClasses.has('research-open')?360:0),height:500-($('measurement-workspace').open?180:0)};return {left:0,top:0,width:this.width,height:this.height};}
  setPointerCapture(){}
  showModal(){this.open=true;}
  close(){if(!this.open)return;this.open=false;this.listeners.close?.({target:this});}
  focus(){activeElement=this;}
 }
 const bodyClasses=new Set(),body={classList:{add:(...keys)=>keys.forEach(k=>bodyClasses.add(k)),remove:(...keys)=>keys.forEach(k=>bodyClasses.delete(k)),contains:key=>bodyClasses.has(key),toggle:(key,on)=>{const next=on??!bodyClasses.has(key);if(next)bodyClasses.add(key);else bodyClasses.delete(key);return next;}}};
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 $('zoom').value='1';$('mode').value='line';$('status').value='hypothesized';$('fft-window').value='hann';$('fft-mean').checked=true;
 const math=Object.create(Math);math.pow=(a,b)=>{stats.pow++;return Math.pow(a,b);};
 const sandbox={...userWorkflow,...coordinates,...viewerState,...viewerRender,...annotationPresentation,...figureExport,...observationContract,...roiEditing,renderSequenceEvidence,renderDomainEvidence,ResearchWorkspace,WorkspaceControls,RoiComparisonPanel,settleWorkspaceWindows,ExecutionHistoryPanel,WindowWorkspace,readWindowCollection,readWindowCamera,readWindowViewContext,requiresMeasurementJump,console,Math:math,Uint8ClampedArray,performance,crypto:{randomUUID},
  workbenchDesktop:{onAction(handler){desktopAction=handler;}},
  MeasurementWorkspace:class extends ProviderMeasurementWorkspace{constructor(options){super({...options,document:sandbox.document});}},
  DataProbes:class extends ProviderDataProbes{constructor(options){super({...options,document:sandbox.document,setTimer:(fn,delay)=>{const id=++probeTimerId;probeTimers.set(id,{fn,delay});return id;},clearTimer:id=>probeTimers.delete(id)});}},
  document:{body,get activeElement(){return activeElement;},getElementById:$,createElement:tag=>new Element(tag),createElementNS:(_namespace,tag)=>new Element(tag),querySelector:selector=>selector==='dialog[open]'?[...elements].find(([id,element])=>id.endsWith('-dialog')&&element.open)?.[1]??null:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>documentListeners.set(name,fn)},
  sessionStorage:{getItem:()=> 'synthetic-token',setItem(){}},location:{hash:'',pathname:'/'},history:{replaceState(){}},
  Option:class{constructor(text,value){this.text=text;this.value=value;}},
  Image:class{constructor(){this.width=128;this.height=96;}async decode(){if(waitDecode)await waitDecode;if(decodeFailure){decodeFailure=false;throw new Error('Controlled image decode failure');}}},
  ImageData:class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}},
  ResizeObserver:class{constructor(callback){this.callback=callback;this.observed=[];layoutObservers.push(this);}observe(element){this.observed.push(element.id);}},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  fetch:async(url,options)=>{
   if(!options.body){getCalls.push(url);if(url==='/api/state'&&stateFailure){stateFailure=false;throw new Error('Controlled current-state read failure');}if(url==='/api/state'&&waitState){const snapshot=copy(server);await waitState;return {ok:true,json:async()=>snapshot};}if(url.startsWith('/api/window-asset?')&&windowStates.length){const query=new URL(url,'http://panel.test').searchParams,entry=server.window_collection.windows.find(value=>value.window_id===query.get('window_id')),saved=entry&&savedWindowStates.get(entry.object_id);return {ok:Boolean(saved),json:async()=>saved?{schema_version:1,window_id:entry.window_id,object_id:entry.object_id,collection_revision:Number(query.get('revision')),object:copy(saved.object),panel_mapping_fingerprint:saved.panel_mapping_fingerprint,png_base64:saved.png_base64}:{error:'Window closed or saved asset missing'}};}if(url.startsWith('/api/measurements?'))return {ok:true,json:async()=>({current:{...copy(server.object),object_id:server.object.object_id},entries:copy(server.measurement_entries??[]),truncated:false})};if(url==='/api/revision')return {ok:true,json:async()=>({state_revision:server.state_revision,object_id:server.object.object_id,pending_result:server.pending_result})};}
   if(options.body){const body=JSON.parse(options.body);actionTrace.push(body.action);
    if(url==='/api/workspace'&&body.action==='park-window'){
     assert.equal(body.expected_working_revision,server.workspace_analysis.working_revision);assert.equal(body.working_draft.object_id,server.object.object_id);assert.equal(body.working_draft.panel_mapping_fingerprint,server.panel_mapping_fingerprint);
     const active=server.window_collection.active_window_id;server.workspace_analysis.window_drafts??={};server.workspace_analysis.window_drafts[active]=copy(body.working_draft);server.workspace_analysis.active_window_draft=copy(body.working_draft);if(body.working_draft.content_dirty){server.workspace_analysis.status='dirty';server.workspace_analysis.working_revision++;}
     server.edit_state={...server.edit_state,dirty:false,gesture_active:false,annotation_edit:null,draft_revision:server.edit_state.draft_revision+1};server.state_revision++;return {ok:true,json:async()=>copy(server)};
    }
    if(url==='/api/workspace'&&body.action==='save'){
     assert.equal(body.expected_working_revision,server.workspace_analysis.working_revision);server.workspace_analysis={...server.workspace_analysis,status:'clean',save_id:body.save_id,saved_revision:(server.workspace_analysis.saved_revision??0)+1,dirty:false};return {ok:true,json:async()=>copy(server)};
    }
    if(url==='/api/workspace'&&body.action==='discard'){
     assert.equal(body.expected_working_revision,server.workspace_analysis.working_revision);const restored=copy(initial);restored.workspace_analysis={...restored.workspace_analysis,working_revision:server.workspace_analysis.working_revision+1,status:'clean',recovery_available:false};restored.edit_state={draft_revision:(server.edit_state?.draft_revision??0)+1,dirty:false,gesture_active:false};restored.state_revision=(server.state_revision??0)+1;server=restored;return {ok:true,json:async()=>copy(server)};
    }
    if(url==='/api/probe'){probeCalls.push(body);return {ok:true,json:async()=>({object_id:body.expected_object_id,kind:'probe',component:body.component,coordinate_space:body.coordinate_space,samples:[{point:body.coordinates,array_index_xy:body.coordinates,value:17}]})};}
    if(body.action==='draft'){draftCalls.push(body);if(waitDraft)await waitDraft;if(draftFailure){const error=draftFailure;draftFailure=null;return {ok:false,json:async()=>({error})};}if(windowStates.length&&(body.expected_object_id!==server.object.object_id||body.params.draft_revision<(server.edit_state?.draft_revision??0)))return {ok:false,json:async()=>({error:'Stale draft lease'})};if(Object.hasOwn(body.params,'selection'))server.selection=copy(body.params.selection);if(coalesceDrafts)server.draft_persistence={pending:body.params.confirm_persistence!==true&&server.edit_state?.dirty===body.params.dirty&&server.edit_state?.gesture_active===body.params.gesture_active,error:null};server.edit_state={...copy(body.params),base_object_id:server.object.object_id};return {ok:true,json:async()=>body.lightweight?{object_id:server.object.object_id,edit_state:copy(server.edit_state)}:copy(server)};}
    if(windowStates.length&&['window-context','window-camera'].includes(body.action)){
     windowMetadataCalls.push(copy(body));if(body.expected_object_id!==server.object.object_id||body.params.collection_revision!==server.window_collection.revision)return {ok:false,json:async()=>({error:'Changed window revision'})};const collection=server.window_collection,entry=collection.windows.find(value=>value.window_id===(body.params.window_id??collection.active_window_id)),saved=savedWindowStates.get(entry?.object_id);
     if(!entry||!saved||body.action==='window-context'&&(server.edit_state?.dirty||server.pending_result||body.draft_revision!==server.edit_state?.draft_revision))return {ok:false,json:async()=>({error:'Window context preflight refused'})};
     const previous=entry.view_context;entry.view_context={version:1,object_id:entry.object_id,panel_mapping_fingerprint:saved.panel_mapping_fingerprint,camera:copy(body.params.camera),...(body.params.ui_panels?{ui_panels:copy(body.params.ui_panels)}:previous?.ui_panels?{ui_panels:copy(previous.ui_panels)}:{}),selection_candidate:body.action==='window-context'?copy(server.selection??null):copy(previous?.selection_candidate??null),selected_annotation_id:body.action==='window-context'?body.params.selected_annotation_id:previous?.selected_annotation_id??null};collection.revision++;server.state_revision++;const reply=copy(server);return {ok:true,json:async()=>reply};
    }
    if(windowStates.length&&body.action==='activate-window'){
     calls.push(copy(body));activationStarted++;for(const resolve of activationListeners.splice(0))resolve();const source=server.object.object_id,revision=server.edit_state?.draft_revision??0,collectionRevision=server.window_collection.revision;
     const execute=async()=>{if(waitActivation)await waitActivation;const entry=server.window_collection.windows.find(value=>value.window_id===body.params.window_id);if(!entry||source!==server.object.object_id||revision!==server.edit_state?.draft_revision||collectionRevision!==server.window_collection.revision||body.params.collection_revision!==collectionRevision||server.edit_state?.dirty||server.edit_state?.gesture_active||server.pending_result||server.last_operation?.state==='submitted')return {ok:false,json:async()=>({error:'Activation preflight or postcheck refused'})};const saved=savedWindowStates.get(entry.object_id);if(!saved)return {ok:false,json:async()=>({error:'Saved target missing'})};savedWindowStates.set(source,copy(server));const context=readWindowViewContext(entry.view_context,saved.object,saved.panel_mapping_fingerprint),selected=context?copy(context.selection_candidate):null;server={...server,object:copy(saved.object),png_base64:saved.png_base64,clean_png_base64:saved.clean_png_base64,panel_mapping_fingerprint:saved.panel_mapping_fingerprint,render_base_id:entry.object_id,selection:selected,state_revision:server.state_revision+1,edit_state:{draft_revision:revision+1,dirty:false,gesture_active:false,selection:selected,annotation_edit:null,base_object_id:entry.object_id},last_operation:{action:'activate-window',object_id:entry.object_id,state:'completed'}};server.window_collection.active_window_id=entry.window_id;if(server.workspace_analysis)server.workspace_analysis.active_window_draft=copy(server.workspace_analysis.window_drafts?.[entry.window_id]??null);server.window_collection.revision++;const reply=copy(server);return {ok:true,json:async()=>reply};};
     activationWork=execute();if(lostActivation){lostActivation=false;throw new Error('Controlled activation response lost');}return activationWork;
    }
    calls.push(body);assert.equal(body.expected_object_id,server.object.object_id);if(waitAction)await waitAction;if(body.action==='measure'&&waitMeasurement)await waitMeasurement;
    if(actionFailure){server.last_operation={state:'submitted',request_id:'controlled-lost-request'};const error=actionFailure;actionFailure=null;return {ok:false,json:async()=>({error})};}
    if(['edit','edit-layout'].includes(body.action)&&body.params.auto_commit){
     const previousObject=server.object.object_id;
     const result=nextActionResult?copy(typeof nextActionResult==='function'?nextActionResult(copy(server)):nextActionResult):copy(server);nextActionResult=null;
     for(const update of body.params.updates){const mark=result.object.annotations.find(m=>m.annotation_id===update.annotation_id);assert.ok(mark,'autosave must update an existing stable mark');for(const [field,value]of Object.entries(update)){if(field==='coordinates')mark.anchor.coordinates=copy(value);else if(!['annotation_id','presentation_replace'].includes(field))mark[field]=copy(value);}}
     if(result.object.object_id===server.object.object_id)result.object.object_id=(++actionSequence).toString(16).padStart(32,'0');
     result.state_revision=(server.state_revision??0)+1;result.edit_state=copy(server.edit_state);result.auto_edit_committed=true;server=result;
     if(windowStates.length){const collection=server.window_collection,entry=collection?.windows.find(value=>value.window_id===collection.active_window_id&&value.object_id===previousObject);if(entry){entry.object_id=server.object.object_id;if(entry.view_context)entry.view_context.object_id=server.object.object_id;collection.revision++;savedWindowStates.set(server.object.object_id,copy(server));}}
    }else if(nextActionResult){server=copy(typeof nextActionResult==='function'?nextActionResult(copy(server)):nextActionResult);nextActionResult=null;if(windowStates.length)savedWindowStates.set(server.object.object_id,copy(server));}
    if(body.action==='mark'){const {panel:selectionPanel,...anchor}=body.params.selection;server.object.annotations.push({annotation_id:body.params.annotation_id,kind:anchor.kind,anchor:copy(anchor),text:body.params.text,color:body.params.color,status:body.params.status,note:body.params.note,...(body.params.purpose?{purpose:body.params.purpose,observation_contract_version:1,selection_origin:body.params.selection_origin,selection_origin_basis:'caller_reported_not_authenticated'}:{})});server.object.object_id=(++actionSequence).toString(16).padStart(32,'0');server.state_revision=(server.state_revision??0)+1;server.selection=copy(body.params.selection);}
    if(body.action==='measure'||body.action==='select')server.selection=copy(body.params.selection);
    const measured=body.action==='measure'&&measurementResponse?(typeof measurementResponse==='function'?measurementResponse(body):copy(measurementResponse)):{};
    server.last_operation=body.action==='recover'&&recoveryResponse?copy(recoveryResponse):{...(body.action==='measure'?{kind:'measure',coordinate_space:body.params.selection.coordinate_space,points:[body.params.selection.coordinates.slice(0,2),body.params.selection.coordinates.slice(2)]}:{}),...measured,action:body.action,...(body.action==='mark'?{annotation_ids:[body.params.annotation_id]}:{})};
   }
   return {ok:true,json:async()=>copy(server)};
  }
 };
 const renderSource=readFileSync(new URL('../ui/image-panel/viewer-render.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
 const script=renderSource+'\n'+source.replace(/^import .*from '\.\/[^']+\.mjs';\r?\n/gm,'')
  .replace('refresh().then(','globalThis.ready=refresh().then(')
  +'\nglobalThis.selectMeasurementUI=selectMeasurement;globalThis.pollUI=pollRevision;globalThis.activateWindowUI=activateWindow;globalThis.finishWindowMetadata=()=>windowWorkspace.awaitStableMetadata();globalThis.finishRoiSave=()=>typeof roiCreationSave===\'undefined\'?Promise.resolve():roiCreationSave??Promise.resolve();globalThis.finishSaves=async()=>{do{if(autoSaving)await autoSaving;await Promise.resolve();}while(autoSaving);};globalThis.inspectAnnotationLayout=()=>annotationLayout;globalThis.inspect=()=>({draft,drag,editCoordinates,state,pending,selectedId,undoCount:userHistory.undoItems.length,redoCount:userHistory.redoItems.length,dirty:dirty(),view,draftRevision:historyDraft.revision,queuedEdits:[...queuedEdits],autoFailed,busy,windowSwitch,roiCreationRecovery:typeof roiCreationRecovery===\'undefined\'?null:roiCreationRecovery,observationSavePhase});';
 vm.runInNewContext(script,sandbox,{filename:'ui/image-panel/app.mjs'});await sandbox.ready;
 const flush=()=>{for(const [id,callback] of [...frames]){frames.delete(id);callback();}};
 const event=(type,x=10,y=10,extra={})=>{$('canvas').listeners[type]?.({clientX:x,clientY:y,pointerId:1,button:0,...extra});};
 const click=async id=>{await $(id).onclick();flush();};
 const draw=(kind='line')=>{$('mode').value=kind;event('pointerdown',10,10);event('pointermove',40,35);event('pointerup',40,35);flush();};
 return {$,bodyClasses,calls,draftCalls,getCalls,windowMetadataCalls,actionTrace,probeCalls,stats,frames,flush,event,click,draw,flushProbes:async()=>{const timers=[...probeTimers];probeTimers.clear();for(const [_id,timer]of timers)timer.fn();for(let i=0;i<8;i++)await Promise.resolve();},poll:()=>sandbox.pollUI(),inspect:()=>copy(sandbox.inspect()),contexts:canvasContexts,
  settle:async()=>{for(let i=0;i<80;i++)await Promise.resolve();flush();},finish:async()=>{await sandbox.finishSaves();flush();},finishRoi:async()=>{await sandbox.finishRoiSave();flush();},
  delayAction(promise){waitAction=promise;},delayDecode(promise){waitDecode=promise;},delayState(promise){waitState=promise;},delayDraft(promise){waitDraft=promise;},selectMeasurement(entry){sandbox.selectMeasurementUI(entry);flush();},
  nativeAction:action=>desktopAction(action),documentEvent:(name,target)=>documentListeners.get(name)?.({target}),
  failAction(message='Synthetic save failure; query original request'){actionFailure=message;},
  failDraft(message='Controlled draft delivery failure'){draftFailure=message;},
  actionResult(value){nextActionResult=typeof value==='function'?value:copy(value);},
  measureResponse(value){measurementResponse=typeof value==='function'?value:copy(value);},delayMeasurement(promise){waitMeasurement=promise;},
  recoverResponse(value){recoveryResponse=copy(value);},
  key:(key,extra={})=>documentListeners.get('keydown')?.({key,code:key===' '?'Space':'',target:activeElement??$('canvas'),ctrlKey:false,metaKey:false,preventDefault(){},...extra}),active:()=>activeElement,layout:()=>copy(sandbox.inspectAnnotationLayout()),
  resizeLayout(){for(const observer of layoutObservers)observer.callback();flush();},layoutObserved:()=>layoutObservers.flatMap(o=>o.observed),
  activateWindow(id){const entry=sandbox.inspect().state.window_collection?.windows.find(value=>value.window_id===id);return sandbox.activateWindowUI(id,entry?.object_id);},finishWindows:()=>sandbox.finishWindowMetadata(),delayActivation(value){waitActivation=value;},loseActivationReply(){lostActivation=true;},activationFinished:()=>activationWork,waitActivationStarted:()=>activationStarted?Promise.resolve():new Promise(resolve=>activationListeners.push(resolve)),failImageDecode(){decodeFailure=true;},failStateRead(){stateFailure=true;},
  coalesceDrafts(){coalesceDrafts=true;},setServer(value){server=copy(value);},server:()=>copy(server)};
}

function windowActivationFixture(){
 const source=handoffFixture(),target=fixture(),sourceWindow='1'.repeat(32),targetWindow='2'.repeat(32),rawFft='9'.repeat(32),targetId='e'.repeat(32),sourceFingerprint='f'.repeat(64),targetFingerprint='d'.repeat(64);
 source.object.annotations=[];source.panel_mapping_fingerprint=sourceFingerprint;source.selection={kind:'rectangle',coordinate_space:'source_pixels',source_object_id:sourceId,coordinates:[30.2,20.7,61.8,48.4],panel:copy(panel)};
 target.object.object_id=targetId;target.object.kind='fft_view';target.panel_mapping_fingerprint=targetFingerprint;target.object.panels=[{domain:'frequency',source_object_id:rawFft,fft_shape_yx:[29,32],fft_rect_xyxy:[0,0,32,29],image_rect_xyxy:[0,0,128,96]}];target.object.annotations=[{annotation_id:'peak-A',kind:'point',status:'hypothesized',anchor:{coordinate_space:'frequency_cycles_per_pixel',source_object_id:rawFft,coordinates:[.125,0]}}];
 const peak={kind:'point',...copy(target.object.annotations[0].anchor),panel:copy(target.object.panels[0])};
 source.window_collection={schema_version:1,revision:1,frame_object_id:sourceId,active_window_id:sourceWindow,windows:[{window_id:sourceWindow,object_id:source.object.object_id,role:'source',title:'来源图像',layout:{x:0,y:0,width:.5,height:1,z:1},view_context:{version:1,object_id:source.object.object_id,panel_mapping_fingerprint:sourceFingerprint,camera:{scale:1.75,center_image_xy:[60.5,42.25]},selection_candidate:copy(source.selection),selected_annotation_id:null}},{window_id:targetWindow,object_id:targetId,role:'fft',title:'FFT A',layout:{x:.5,y:0,width:.5,height:1,z:2},source_reference:{input_view_object_id:source.object.object_id,frame_object_id:sourceId,raw_fft_object_id:rawFft,processing_rect_xyxy:[30,20,62,49],calibration_relation:'same'},view_context:{version:1,object_id:targetId,panel_mapping_fingerprint:targetFingerprint,camera:{scale:2.25,center_image_xy:[67.5,45.25]},selection_candidate:peak,selected_annotation_id:'peak-A'}}]};
 return {source,target,sourceWindow,targetWindow,peak};
}

test('window activation confirms source context, restores target camera and uses the advanced global draft lease',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();const previous=h.inspect().draftRevision;await h.activateWindow(f.targetWindow);await h.settle();
 assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);assert.equal(h.windowMetadataCalls.filter(value=>value.action==='window-context').length,1);assert.equal(h.inspect().state.object.object_id,f.target.object.object_id);assert.equal(h.inspect().windowSwitch,null);assert.deepEqual(h.inspect().draft.coordinates,f.peak.coordinates);assert.equal(h.$('existing').value,'peak-A');assert.equal(h.inspect().view.scale,2.25);assert.equal(h.inspect().view.x,64-67.5*2.25);assert.equal(h.inspect().view.y,48-45.25*2.25);assert.ok(h.inspect().draftRevision>previous);assert.ok(h.draftCalls.at(-1).params.draft_revision>previous);
});
test('window activation round trip restores the original fractional ROI without using its integer processing support',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();const oldSelection=h.inspect().draft;await h.activateWindow(f.targetWindow);await h.activateWindow(f.sourceWindow);await h.settle();assert.deepEqual(h.inspect().draft.coordinates,oldSelection.coordinates);assert.notDeepEqual(h.inspect().draft.coordinates,[30,20,62,49]);assert.equal(h.inspect().view.scale,1.75);assert.equal(h.inspect().state.object.object_id,viewId);const revisions=h.calls.filter(value=>value.action==='activate-window').map(value=>value.draft_revision);assert.ok(revisions[1]>revisions[0]);assert.equal(h.inspect().windowSwitch,null);
});
test('saved-view back and forward activate registered windows without branching their existing history',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();await h.activateWindow(f.targetWindow);
 await h.click('view-back');assert.equal(h.inspect().state.object.object_id,f.source.object.object_id);assert.equal(h.inspect().view.scale,1.75);assert.equal(h.$('view-back').disabled,true);assert.equal(h.$('view-forward').disabled,false);
 await h.click('view-forward');assert.equal(h.inspect().state.object.object_id,f.target.object.object_id);assert.equal(h.inspect().view.scale,2.25);assert.equal(h.$('view-back').disabled,false);assert.equal(h.$('view-forward').disabled,true);
 assert.deepEqual(h.calls.map(value=>value.action),['activate-window','activate-window','activate-window']);assert.deepEqual(h.calls.map(value=>value.params.window_id),[f.targetWindow,f.sourceWindow,f.targetWindow]);assert.equal(h.inspect().windowSwitch,null);
});
test('saved-view navigation keeps an unknown activation frozen and never falls back to show or replays it',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();await h.activateWindow(f.targetWindow);h.loseActivationReply();await h.click('view-back');assert.equal(h.inspect().windowSwitch.phase,'recovery');const requests=h.calls.length;
 await h.click('view-back');await h.click('view-forward');assert.equal(h.calls.length,requests);assert.equal(h.calls.some(value=>value.action==='show'),false);assert.equal(h.inspect().windowSwitch.phase,'recovery');
 await h.click('window-switch-check');assert.equal(h.inspect().state.object.object_id,f.source.object.object_id);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.$('view-forward').disabled,false);assert.equal(h.calls.length,requests);
});
test('window activation refuses local reason drafts and pending results without dispatching navigation',async()=>{
 for(const pendingResult of [false,true]){const f=windowActivationFixture();if(pendingResult)f.source.pending_result={object_id:'c'.repeat(32),request_id:'retained-result'};const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();if(!pendingResult){h.$('roi-reason').value='Keep this local reason';h.$('roi-reason').oninput();}await assert.rejects(h.activateWindow(f.targetWindow));assert.equal(h.calls.filter(value=>value.action==='activate-window').length,0);assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.inspect().windowSwitch,null);if(!pendingResult)assert.equal(h.$('roi-reason').value,'Keep this local reason');}
});
test('window activation refuses until delayed autosave, remeasurement and numeric-label saving finish, without freezing or dispatching',async()=>{
 const f=windowActivationFixture();f.source.object.annotations=[copy(twoMeasuredLines().object.annotations[0])];const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();
 let releaseEdit,releaseMeasurement;h.delayAction(new Promise(resolve=>{releaseEdit=resolve;}));h.delayMeasurement(new Promise(resolve=>{releaseMeasurement=resolve;}));h.measureResponse(measuredFromSelection);
 selectLine(h,'A');h.event('pointerdown',55,18);h.event('pointerup',65,18);h.flush();await h.settle();assert.equal(h.calls.filter(value=>value.action==='edit').length,1);assert.equal(h.inspect().busy,true);
 await assert.rejects(h.activateWindow(f.targetWindow),/保存或重新测量/);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,0);
 releaseEdit();await h.settle();assert.equal(h.calls.filter(value=>value.action==='measure').length,1);assert.equal(h.server().object.annotations[0].presentation.label.visible,false);
 await assert.rejects(h.activateWindow(f.targetWindow),/保存或重新测量/);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,0);
 releaseMeasurement();await h.finish();await h.finishWindows();const saved=h.server().object.annotations[0];assert.deepEqual(saved.anchor.coordinates,[25,30,85,30]);assert.equal(saved.presentation.label.text,'d = 1.2 nm');assert.equal(saved.presentation.label.visible,true);assert.deepEqual(h.calls.map(value=>value.action),['edit','measure','edit']);assert.equal(h.inspect().dirty,false);assert.equal(h.inspect().windowSwitch,null);
 await h.activateWindow(f.targetWindow);assert.equal(h.inspect().state.object.object_id,f.target.object.object_id);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);
});
test('window activation keeps scientific inputs frozen after decode failure until a fenced display recovery',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();h.failImageDecode();await h.activateWindow(f.targetWindow);assert.equal(h.inspect().windowSwitch.phase,'recovery');assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.server().object.object_id,f.target.object.object_id);const before=h.inspect(),count=h.calls.length,mode=h.$('mode').value;h.event('pointerdown',10,10);h.event('pointermove',30,30);h.event('pointerup',30,30);h.key('p');await h.click('fft');await h.click('save-observation');assert.deepEqual(h.inspect().draft,before.draft);assert.equal(h.$('mode').value,mode);assert.equal(h.calls.length,count);
 await h.click('window-switch-check');await h.settle();assert.equal(h.inspect().state.object.object_id,f.target.object.object_id);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);assert.ok(h.draftCalls.at(-1).params.draft_revision>0);
});
test('window activation reply loss never unlocks an old-source GET or replays activate; explicit continuation fences it',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();let release;h.delayActivation(new Promise(resolve=>{release=resolve;}));h.loseActivationReply();await h.activateWindow(f.targetWindow);assert.equal(h.inspect().windowSwitch.phase,'recovery');assert.equal(h.server().object.object_id,viewId);const old=h.server().edit_state.draft_revision;await h.click('window-switch-check');assert.equal(h.inspect().windowSwitch,null);assert.ok(h.server().edit_state.draft_revision>old);release();await h.activationFinished();assert.equal(h.server().object.object_id,viewId);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);
});
test('window activation keeps newer local reasons until an explicit discard after successful current-state reads',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();let release;h.delayActivation(new Promise(resolve=>{release=resolve;}));const changing=h.activateWindow(f.targetWindow);await h.waitActivationStarted();h.$('roi-reason').value='New source reason while navigation is pending';h.$('roi-reason').oninput();release();await changing;assert.equal(h.inspect().windowSwitch.phase,'recovery');assert.equal(h.$('roi-reason').value,'New source reason while navigation is pending');assert.equal(h.inspect().dirty,true);h.failStateRead();await h.click('discard-draft');assert.equal(h.$('roi-reason').value,'New source reason while navigation is pending');await h.click('discard-draft');assert.equal(h.inspect().state.object.object_id,f.target.object.object_id);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);
});
test('window activation detects target closure and does not rebuild or silently select a replacement',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();const closed=h.server();closed.window_collection.windows=closed.window_collection.windows.filter(entry=>entry.window_id!==f.targetWindow);closed.window_collection.revision++;h.setServer(closed);await h.activateWindow(f.targetWindow);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,0);assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.server().window_collection.windows.length,1);assert.equal(h.inspect().windowSwitch.phase,'recovery');
});
test('window activation refuses a changed collection revision without retrying the navigation',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();let release;h.delayActivation(new Promise(resolve=>{release=resolve;}));const switching=h.activateWindow(f.targetWindow);await h.waitActivationStarted();const changed=h.server();changed.window_collection.revision++;h.setServer(changed);release();await switching;assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);assert.equal(h.server().object.object_id,viewId);assert.equal(h.inspect().windowSwitch.phase,'recovery');assert.match(h.$('message').textContent,/preflight or postcheck refused/);
});
test('window activation from a legacy target without context never reconstructs a selection from FFT support',async()=>{
 const f=windowActivationFixture();delete f.source.window_collection.windows[1].view_context;const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();await h.activateWindow(f.targetWindow);assert.equal(h.inspect().windowSwitch,null);assert.equal(h.inspect().draft,null);assert.notEqual(h.inspect().view.scale,2.25);assert.equal(h.$('existing').value,'');
});
test('window activation clears a selected mark that does not match the restored candidate anchor',async()=>{
 const f=windowActivationFixture();f.source.window_collection.windows[1].view_context.selection_candidate.coordinates=[.13,0];const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();await h.activateWindow(f.targetWindow);assert.deepEqual(h.inspect().draft.coordinates,[.13,0]);assert.equal(h.$('existing').value,'');assert.equal(h.inspect().windowSwitch,null);
});
test('window activation recovery after an ABA lease change adopts the new server selection instead of replaying the old ROI',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();let release;h.delayActivation(new Promise(resolve=>{release=resolve;}));h.loseActivationReply();await h.activateWindow(f.targetWindow);const changed=h.server(),newCoordinates=[70.1,25.4,100.8,80.6];changed.edit_state.draft_revision+=2;changed.selection.coordinates=newCoordinates;changed.window_collection.windows[0].view_context.selection_candidate=copy(changed.selection);changed.window_collection.windows[0].view_context.camera={scale:3,center_image_xy:[80,60]};changed.window_collection.revision++;h.setServer(changed);const priorDrafts=h.draftCalls.length;await h.click('window-switch-check');assert.deepEqual(h.draftCalls[priorDrafts].params.selection.coordinates,newCoordinates);assert.deepEqual(h.inspect().draft.coordinates,newCoordinates);assert.equal(h.inspect().view.scale,3);assert.equal(h.inspect().windowSwitch,null);release();await h.activationFinished();assert.equal(h.server().object.object_id,viewId);assert.equal(h.calls.filter(value=>value.action==='activate-window').length,1);
});
test('window context captures the exact current fractional ROI before an explicit FFT request',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();h.draw('rectangle');await h.settle();const expected=h.inspect().draft;await h.click('fft');const capture=h.windowMetadataCalls.find(value=>value.action==='window-context'),fft=h.calls.find(value=>value.action==='fft');assert.ok(capture);assert.ok(fft);assert.ok(h.actionTrace.indexOf('window-context')<h.actionTrace.indexOf('fft'));assert.deepEqual(fft.params.selection.coordinates,expected.coordinates);assert.deepEqual(h.server().window_collection.windows[0].view_context.selection_candidate.coordinates,expected.coordinates);assert.equal(h.draftCalls.filter(value=>value.params.confirm_persistence).length>=1,true);
});
test('window context on P3 return uses the FFT historical input A rather than the source latest B working state',async()=>{
 const f=windowActivationFixture(),snapshot=copy(f.source.window_collection.windows[0].view_context),latestB=copy(snapshot);latestB.selection_candidate.coordinates=[70.1,25.4,100.8,80.6];latestB.camera={scale:3.2,center_image_xy:[88,66]};const fft=copy(f.source);fft.object=copy(f.target.object);fft.panel_mapping_fingerprint=f.target.panel_mapping_fingerprint;fft.selection=copy(f.peak);fft.window_collection.active_window_id=f.targetWindow;fft.window_collection.windows[0].view_context=latestB;fft.window_collection.windows[1].source_reference.input_view_context=snapshot;fft.spatial_return={version:1,status:'ready',view_object_id:viewId,frame_object_id:sourceId};const h=await harness(fft,{windowStates:[f.source]});await h.finishWindows();const restored=copy(f.source);restored.window_collection=copy(h.server().window_collection);restored.window_collection.active_window_id=f.sourceWindow;restored.window_collection.revision+=2;restored.state_revision=h.server().state_revision+2;restored.window_collection.windows[0].view_context=snapshot;restored.selection=copy(snapshot.selection_candidate);restored.edit_state.draft_revision=h.server().edit_state.draft_revision+1;h.actionResult(restored);await h.click('return-spatial');assert.deepEqual(h.inspect().draft.coordinates,snapshot.selection_candidate.coordinates);assert.notDeepEqual(h.inspect().draft.coordinates,latestB.selection_candidate.coordinates);assert.equal(h.inspect().view.scale,1.75);assert.equal(h.calls.filter(value=>value.action==='return-spatial').length,1);
});

test('usage help opens and closes without changing drafts, selected ROI, camera, mode or provider calls',async()=>{
 const h=await harness();h.$('viewport').width=512;h.$('viewport').height=512;h.draw('rectangle');
 h.$('roi-reason').value='Keep this unsaved observation';h.$('roi-reason').oninput();h.$('gamma').value='1.8';h.$('gamma').oninput();await h.settle();
 h.$('open-usage-help').focus();const before=h.inspect(),mode=h.$('mode').value,counts=[h.calls.length,h.draftCalls.length,h.getCalls.length,h.probeCalls.length];
 await h.click('open-usage-help');assert.equal(h.$('usage-dialog').open,true);assert.equal(h.active(),h.$('close-usage-help'));
 for(const key of ['f','v','r','p','l','h','Escape'])h.key(key);
 h.key('z',{ctrlKey:true});assert.equal(h.$('mode').value,mode);assert.deepEqual(h.inspect(),before);
 await h.click('close-usage-help');assert.equal(h.$('usage-dialog').open,false);assert.equal(h.active(),h.$('open-usage-help'));
 assert.equal(h.$('roi-reason').value,'Keep this unsaved observation');assert.equal(h.$('gamma').value,'1.8');assert.deepEqual(h.inspect(),before);
 assert.deepEqual([h.calls.length,h.draftCalls.length,h.getCalls.length,h.probeCalls.length],counts);
});

test('same-object window layout readback preserves the ROI reason draft, selection and camera',async()=>{
 const initial=fixture();initial.state_revision=1;initial.window_collection={schema_version:1,revision:1,frame_object_id:sourceId,active_window_id:'1'.repeat(32),windows:[{window_id:'1'.repeat(32),object_id:viewId,role:'source',title:'来源图像',layout:{x:0,y:0,width:1,height:1,z:1}}]};
 const h=await harness(initial);h.draw('rectangle');h.$('roi-reason').value='Keep reason and active selection while windows move';h.$('roi-reason').oninput();await h.settle();const before=h.inspect(),mode=h.$('mode').value,calls=h.calls.length;
 const latest=h.server();latest.state_revision++;latest.window_collection.revision++;latest.window_collection.windows[0].layout={x:.1,y:.1,width:.8,height:.8,z:2};h.setServer(latest);await h.click('reload');
 const after=h.inspect();assert.equal(after.state.window_collection.revision,2);assert.deepEqual(after.draft,before.draft);assert.deepEqual(after.view,before.view);assert.equal(after.draftRevision,before.draftRevision);assert.equal(after.dirty,true);assert.equal(h.$('roi-reason').value,'Keep reason and active selection while windows move');assert.equal(h.$('mode').value,mode);assert.equal(h.calls.length,calls);
});

test('window-capacity pending explains closing a display without demanding nonexistent drafts',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'already-saved-result',reason:'window_capacity'};initial.window_collection={schema_version:1,revision:1,frame_object_id:sourceId,active_window_id:'1'.repeat(32),windows:Array.from({length:5},(_,i)=>({window_id:String(i+1).repeat(32),object_id:i===0?viewId:String(i+2).repeat(32),role:i===0?'source':'fft',title:i===0?'来源图像':'FFT '+i,layout:{x:0,y:0,width:1,height:1,z:i+1}}))};
 const h=await harness(initial);assert.match(h.$('pending-message').textContent,/显示窗口已满/);assert.match(h.$('pending-message').textContent,/不会删除科学结果/);assert.doesNotMatch(h.$('pending-message').textContent,/放弃未保存草稿/);assert.equal(h.$('discard-draft').hidden,true);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,0);
});
test('repeated FFT clicks keep the first capacity-pending identity without dispatching another calculation',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const before=h.inspect().draft,pendingResult=h.server();pendingResult.pending_result={object_id:'c'.repeat(32),request_id:'first-fft-result',reason:'window_capacity'};h.actionResult(pendingResult);await h.click('fft');await h.click('fft');
 assert.equal(h.calls.filter(call=>call.action==='fft').length,1);assert.equal(h.inspect().state.pending_result.request_id,'first-fft-result');assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.inspect().draft,before);assert.equal(h.$('fft').disabled,true);assert.match(h.$('message').textContent,/不要重复计算/);
});

test('usage help Escape cancellation restores its invoking focus without consuming a draft or pending result',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'already-saved-result'};
 const h=await harness(initial);h.$('roi-reason').value='Keep reason';h.$('roi-reason').oninput();await h.settle();
 h.$('roi-reason').focus();const before=h.inspect(),counts=[h.calls.length,h.draftCalls.length,h.getCalls.length];
 await h.click('open-usage-help');let prevented=false;h.$('usage-dialog').listeners.cancel({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(h.$('usage-dialog').open,false);assert.equal(h.active(),h.$('roi-reason'));
 assert.deepEqual(h.inspect(),before);assert.deepEqual([h.calls.length,h.draftCalls.length,h.getCalls.length],counts);
});

test('usage help is a labelled native dialog with a header entry and current navigation/recovery names',()=>{
 const html=readFileSync(new URL('../ui/image-panel/index.html',import.meta.url),'utf8'),header=html.slice(0,html.indexOf('</header>'));
 assert.match(header,/<button id="open-usage-help" aria-haspopup="dialog" aria-controls="usage-dialog">使用说明<\/button>/);
 const start=html.indexOf('<dialog id="usage-dialog"'),help=html.slice(start,html.indexOf('</dialog>',start));
 assert.match(help,/aria-labelledby="usage-title"/);assert.match(help,/aria-label="关闭使用说明"/);
 for(const name of ['保存当前 ROI 观察','保存 ROI 观察','完整频谱','全帧（新显示）','前进 →','查询上次原请求','检查 Agent 结果','复制继续提示'])assert.ok(help.includes(name),name);
 assert.match(help,/刷新或重开后不保证保留这条浏览序列/);assert.match(help,/不会自动唤醒模型/);
 assert.doesNotMatch(help,/<script|\sstyle=|on(?:click|keydown)=/i);
});

test('measure then hand off uses the same anchored selection without redrawing',async()=>{
 const h=await harness();h.draw();const selection=h.inspect().draft;
 await h.click('measure');assert.deepEqual(h.inspect().draft.coordinates,selection.coordinates);
 await h.click('share');assert.equal(h.calls.at(-1).action,'select');assert.deepEqual(h.calls.map(call=>call.action),['mark','measure','select']);
 assert.deepEqual(h.calls[2].params.selection.coordinates,selection.coordinates);
 assert.equal(h.calls[2].params.selection.source_object_id,sourceId);
 assert.equal(h.calls[1].params.annotation_id,h.calls[0].params.annotation_id,'measurement is bound to the newly saved scientific mark');
 assert.match(h.$('message').textContent,/选择已交接/);
});

test('export and same-object refresh retain the current locally drawn selection',async()=>{
 const h=await harness();h.draw('rectangle');const selection=h.inspect().draft;
 await h.click('export');assert.deepEqual(h.inspect().draft,selection);
 await h.click('reload');assert.deepEqual(h.inspect().draft,selection);
 assert.equal(h.calls.length,1);
});

test('fresh load restores an explicitly saved server selection using its panel map',async()=>{
 const s=fixture();s.selection={kind:'point',coordinate_space:'source_pixels',source_object_id:sourceId,coordinates:[40,30],panel:copy(panel)};
 const h=await harness(s);assert.deepEqual(h.inspect().draft.rendered,[20,18]);
 await h.click('share');assert.deepEqual(h.calls[0].params.selection.coordinates,[40,30]);
});

test('an older server selection does not replace a newer unsent local selection on export',async()=>{
 const h=await harness();h.draw();await h.click('share');const first=h.inspect().draft.coordinates;
 h.event('pointerdown',50,40);h.event('pointerup',90,60);h.flush();const current=h.inspect().draft.coordinates;
 assert.notDeepEqual(current,first);await h.click('export');assert.deepEqual(h.inspect().draft.coordinates,current);
 await h.click('share');assert.deepEqual(h.calls.at(-1).params.selection.coordinates,current);
});

test('same scientific grid display revision preserves the exact local selection despite its new object ID',async()=>{
 const initial=fixture();initial.object.scientific_grid_identity={array_sha256:'same-scientific-array',source_rect_xyxy:[20,12,148,108]};
 const h=await harness(initial);h.draw();const selected=h.inspect().draft;
 const next=copy(initial);next.object.object_id='c'.repeat(32);next.object.display.gamma=1.7;h.setServer(next);
 await h.click('reload');assert.deepEqual(h.inspect().draft,selected);
 await h.click('share');assert.equal(h.calls.at(-1).expected_object_id,next.object.object_id);assert.deepEqual(h.calls.at(-1).params.selection.coordinates,selected.coordinates);assert.equal(h.calls.at(-1).params.selection.source_object_id,sourceId);
});

test('unrelated scientific image does not inherit a local selection from the older image',async()=>{
 const h=await harness();h.draw();const next=fixture();next.object.object_id='c'.repeat(32);next.object.panels[0].source_object_id='d'.repeat(32);h.setServer(next);
 await h.click('reload');assert.equal(h.inspect().draft,null);
 await h.click('share');assert.equal(h.calls.length,0);
});

test('foreign source or changed grid cannot restore a stale server selection',async()=>{
 for(const mutate of [s=>{s.selection.source_object_id='f'.repeat(32);},s=>{s.object.panels[0].source_rect_xyxy=[0,0,128,96];}]){
  const s=fixture();s.selection={kind:'point',coordinate_space:'source_pixels',source_object_id:sourceId,coordinates:[40,30],panel:copy(panel)};mutate(s);
  const h=await harness(s);assert.equal(h.inspect().draft,null);await h.click('share');assert.equal(h.calls.length,0);
 }
});

test('odd FFT selection retains its original signed frequencies through measure and share',async()=>{
 const s=fixture(),p={domain:'frequency',source_object_id:sourceId,fft_shape_yx:[55,95],fft_rect_xyxy:[38,22,58,34],image_rect_xyxy:[0,0,128,96]};
 s.object.panels=[p];s.object.kind='fft_view';const h=await harness(s);h.draw('point');const before=h.inspect().draft;
 await h.click('measure');await h.click('share');
 assert.deepEqual(h.calls.map(call=>call.action),['mark','measure','select']);
 assert.deepEqual(h.calls[2].params.selection.coordinates,before.coordinates);
 assert.equal(h.calls[2].params.selection.coordinate_space,'frequency_cycles_per_pixel');
});

test('pointer moves coalesce into one animation frame and reuse the tone bitmap',async()=>{
 const h=await harness();const beforePow=h.stats.pow,beforeUploads=h.stats.uploads,beforeDraws=h.stats.draws;
 h.event('pointerdown');for(let i=0;i<50;i++)h.event('pointermove',20+i,25);
 assert.equal(h.frames.size,1);assert.equal(h.stats.draws,beforeDraws);
 h.flush();assert.equal(h.stats.pow,beforePow);assert.equal(h.stats.uploads,beforeUploads);
 assert.equal(h.stats.draws,beforeDraws);assert.equal(h.calls.length,0); // Separate overlay never copies the full image.
 h.event('pointerup',69,25);assert.equal(h.frames.size,0);
});

test('tone draft lookup keeps former RGB arithmetic and alpha bytes exactly',async()=>{
 const h=await harness();h.$('gamma').value='0.65';h.$('low').value='23';h.$('high').value='190';
 h.$('gamma').oninput();h.flush();
 const expected=pixelBytes(128,96);
 for(let i=0;i<expected.length;i+=4)for(let c=0;c<3;c++){
  const normalized=Math.max(0,Math.min(1,(Math.pow(expected[i+c]/255,1)*255-23)/(190-23)));
  expected[i+c]=255*Math.pow(normalized,1/.65);
 }
 const shown=h.$('base-canvas').context.lastPixels;
 assert.deepEqual(shown.data,expected);
 const before=h.stats.pow;h.event('pointerdown');h.event('pointermove',20,30);h.flush();
 assert.equal(h.stats.pow,before);
});

test('a real tone change invalidates the cache once, not on every overlay move',async()=>{
 const h=await harness(),before=h.stats.pow;h.$('gamma').value='2';h.$('gamma').oninput();h.flush();
 assert.ok(h.stats.pow>before);assert.ok(h.stats.pow-before<=512);
 const adjusted=h.stats.pow;h.draw();assert.equal(h.stats.pow,adjusted);
});

test('Shift and Ctrl constrain a new ROI on the source grid using the final pointerup modifier',async()=>{
 for(const modifier of ['shiftKey','ctrlKey']){
  const f=fixture();f.object.panels[0].source_rect_xyxy=[20,12,276,108];const h=await harness(f);h.$('mode').value='rectangle';
  h.event('pointerdown',10.2,10.3);h.event('pointermove',30,15);h.event('pointerup',40,20,{[modifier]:true});h.flush();
  assert.deepEqual(h.inspect().draft.coordinates,[40,22,100,82]);assert.deepEqual(coordinates.selectionRectangle(h.inspect().draft),[40,22,100,82]);
 }
 const h=await harness();h.$('mode').value='rectangle';h.event('pointerdown',10,10);h.event('pointermove',40,20,{shiftKey:true});
 assert.deepEqual(h.inspect().drag.end,[40,40]);h.event('pointerup',40,20);h.flush();assert.deepEqual(h.inspect().draft.coordinates,[30,22,60,32]);
});

test('new line and arrow constrain their final source coordinates without a final pointermove',async()=>{
 for(const [kind,modifier,end,expected]of [['line','shiftKey',[50,20],[30,22,70,22]],['arrow','ctrlKey',[15,65],[30,22,30,77]]]){
  const h=await harness();h.$('mode').value=kind;h.event('pointerdown',10,10);h.event('pointerup',...end,{[modifier]:true});h.flush();assert.deepEqual(h.inspect().draft.coordinates,expected);
 }
});

function annotated(){const s=fixture();s.object.annotations=[{annotation_id:'line-a',kind:'line',text:'candidate',color:'cyan',status:'hypothesized',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[30,22,60,52]}}];return s;}
async function editHarness(){const h=await harness(annotated());h.$('existing').value='line-a';h.$('existing').onchange();return h;}

test('edit uses pointerup position even with no final pointermove event',async()=>{
 const h=await editHarness();h.event('pointerdown',10,10);h.event('pointermove',12,13);h.event('pointerup',18,19);h.flush();
 await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].params.auto_commit,true);assert.deepEqual(h.calls[0].params.updates[0].coordinates,[38,31,60,52]);
 assert.equal(h.calls[0].params.updates[0].status,undefined,'geometry edit must not resubmit confirmation state');
 assert.equal(h.server().object.annotations[0].status,'hypothesized');
 assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[38,31,60,52]);assert.notEqual(h.inspect().state.object.object_id,viewId);
});

test('Shift and Ctrl do not constrain existing annotation geometry drags',async()=>{
 for(const modifier of ['shiftKey','ctrlKey']){const h=await editHarness();h.event('pointerdown',10,10);h.event('pointerup',18,19,{[modifier]:true});h.flush();await h.finish();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[38,31,60,52]);}
});

test('pointercancel and lost capture roll back the current gesture without saving',async()=>{
 for(const ending of ['pointercancel','lostpointercapture']){
  const h=await editHarness();h.event('pointerdown',10,10);h.event('pointermove',20,20);h.event(ending);h.flush();
  assert.equal(h.inspect().drag,null);assert.equal(h.inspect().editCoordinates,null);assert.equal(h.calls.length,0);
 }
});

test('a second drag starts from the queued edit; cancellation preserves it and the latest edit eventually saves',async()=>{
 const h=await editHarness();let done;h.delayAction(new Promise(resolve=>{done=resolve;}));h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();await h.settle();
 const first=h.inspect().queuedEdits[0][1].update.coordinates;assert.deepEqual(first,[38,31,60,52]);
 h.event('pointerdown',18,19);h.event('pointermove',21,22);h.event('pointercancel');h.flush();
 assert.equal(h.inspect().editCoordinates,null);assert.deepEqual(h.inspect().queuedEdits[0][1].update.coordinates,first);
 h.event('pointerdown',18,19);h.event('pointerup',22,23);h.flush();
 assert.deepEqual(h.inspect().queuedEdits[0][1].update.coordinates,[42,35,60,52]);done();await h.settle();
 assert.equal(h.calls.length,2);assert.deepEqual(h.calls.at(-1).params.updates[0].coordinates,[42,35,60,52]);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[42,35,60,52]);assert.equal(h.inspect().dirty,false);
});

test('another pointer cannot take over an in-progress gesture',async()=>{
 const h=await harness();h.event('pointerdown',10,10);h.event('pointermove',120,80,{pointerId:2});h.event('pointerup',120,80,{pointerId:2});
 assert.equal(h.inspect().drag.pointerId,1);h.event('pointerup',30,25);h.flush();
 assert.deepEqual(h.inspect().draft.coordinates,[30,22,50,37]);
});

test('completed gestures publish the exact scientific selection without a model wake or manual handoff',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const final=h.draftCalls.at(-1);
 assert.equal(final.action,'draft');assert.equal(final.params.gesture_active,false);assert.equal(final.params.dirty,false);
 assert.deepEqual(final.params.selection.coordinates,h.inspect().draft.coordinates);assert.equal(h.calls.length,0);
 assert.equal(final.params.selection.source_object_id,sourceId);
});

test('default select mode directly finds and drags an anchored mark with no ID entry',async()=>{
 const h=await harness(annotated());h.$('mode').value='select';h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();
 assert.equal(h.$('existing').value,'line-a');assert.equal(h.$('mark-id').value,'line-a');
 await h.settle();assert.deepEqual(h.calls.at(-1).params.updates[0].coordinates,[38,31,60,52]);assert.equal(h.inspect().queuedEdits.length,0);
});

test('new marks get safe IDs automatically, independent of user text and scientific status',async()=>{
 const h=await harness();assert.match(h.$('mark-id').value,/^mark-[a-f0-9]{24}$/);h.draw('arrow');
 h.$('mark-text').value='same candidate';h.$('mark-text').oninput();await h.click('save-mark');
 assert.match(h.calls.at(-1).params.annotation_id,/^mark-[a-f0-9]{24}$/);assert.equal(h.calls.at(-1).params.status,'hypothesized');
});

test('undo and redo of an autosaved annotation create compensating versions instead of pretending to delete history',async()=>{
 const h=await editHarness();h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();await h.settle();
 const moved=copy(h.server().object.annotations[0].anchor.coordinates),firstId=h.server().object.object_id;
 await h.click('undo');await h.settle();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[30,22,60,52]);assert.notEqual(h.server().object.object_id,firstId);
 await h.click('redo');await h.settle();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,moved);
 assert.equal(h.calls.length,3);assert.ok(h.calls.every(c=>c.action==='edit'&&c.params.auto_commit));
});

test('refresh and read-only measurement never erase unsaved display or mark drafts',async()=>{
 const h=await editHarness();h.draw('line');h.$('gamma').value='1.5';h.$('gamma').oninput();h.flush();
 const local=h.inspect();await h.click('reload');assert.deepEqual(h.inspect().editCoordinates,local.editCoordinates);assert.equal(h.$('gamma').value,'1.5');
 h.$('mode').value='line';h.event('pointerdown',60,20);h.event('pointerup',90,30);h.flush();await h.click('measure');
 assert.deepEqual(h.inspect().editCoordinates,local.editCoordinates);assert.equal(Number(h.$('gamma').value),1.5);assert.equal(h.inspect().dirty,true);
});

test('a late save cannot erase a newer drag and observation remains enabled while waiting',async()=>{
 const h=await editHarness();let done;h.delayAction(new Promise(resolve=>{done=resolve;}));h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();await h.settle();
 assert.equal(h.inspect().busy,true);h.event('pointerdown',18,19);h.event('pointermove',22,23);h.flush();const newer=h.inspect().editCoordinates;
 assert.deepEqual(newer,[42,35,60,52]);done();await h.settle();assert.deepEqual(h.inspect().editCoordinates,newer);assert.ok(h.inspect().drag);
 h.event('pointerup',22,23);h.flush();await h.settle();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,newer);assert.equal(h.inspect().dirty,false);
});

test('saving one mark preserves a separate unsaved display draft',async()=>{
 const h=await editHarness();h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();h.$('gamma').value='1.7';h.$('gamma').oninput();h.flush();
 await h.click('save-mark');await h.settle();assert.equal(Number(h.$('gamma').value),1.7);assert.equal(h.inspect().editCoordinates,null);assert.equal(h.inspect().dirty,true);
});

test('FFT scientific settings are visible choices and forwarded rather than silently fixed',async()=>{
 const h=await harness();h.draw('rectangle');h.$('fft-window').value='none';h.$('fft-mean').checked=false;await h.click('fft');
 assert.equal(h.calls.at(-1).params.window,'none');assert.equal(h.calls.at(-1).params.subtract_mean,false);
});

test('ambiguous repeated-source comparison panels reject mark edit without choosing the first panel',async()=>{
 const s=annotated();s.object.panels.push({...copy(panel),image_rect_xyxy:[150,0,278,96]});const h=await harness(s);
 h.$('existing').value='line-a';h.$('existing').onchange();h.event('pointerdown',10,10);h.event('pointerup',20,20);h.flush();
 assert.equal(h.inspect().editCoordinates,null);assert.match(h.$('message').textContent,/不唯一/);assert.equal(h.calls.length,0);
});

test('fresh browser draft revision advances the existing shared lease instead of restarting at one',async()=>{
 const s=fixture();s.edit_state={draft_revision:77,dirty:false,gesture_active:false};const h=await harness(s);
 assert.ok(h.draftCalls[0].params.draft_revision>77);h.draw('point');await h.settle();assert.ok(h.draftCalls.at(-1).params.draft_revision>78);
});

test('revision polling uses small metadata and automatically presents a new clean result',async()=>{
 const h=await harness(),before=h.getCalls.length;await h.poll();assert.deepEqual(h.getCalls.slice(before),['/api/revision']);
 const next=fixture();next.object.object_id='c'.repeat(32);next.state_revision=2;h.setServer(next);await h.poll();
 assert.deepEqual(h.getCalls.slice(before),['/api/revision','/api/revision','/api/state','/api/measurements?object_id='+next.object.object_id]);assert.equal(h.inspect().state.object.object_id,next.object.object_id);
});

test('Agent result notice never overwrites an unsaved local display draft',async()=>{
 const h=await harness();h.$('gamma').value='1.9';h.$('gamma').oninput();h.flush();const next=fixture();next.object.object_id='c'.repeat(32);next.state_revision=2;h.setServer(next);
 await h.poll();assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.$('gamma').value,'1.9');assert.equal(h.inspect().pending.object.object_id,next.object.object_id);
});

test('reopening a panel with an outstanding dirty lease requires an explicit discard',async()=>{
 const s=fixture();s.edit_state={draft_revision:18,dirty:true,gesture_active:false};const h=await harness(s);assert.equal(h.inspect().dirty,true);
 assert.equal(h.draftCalls.at(-1).params.dirty,true);assert.match(h.$('message').textContent,/先前未保存.*明确撤回/);await h.click('discard-local');assert.equal(h.inspect().dirty,false);
});

test('gesture start publishes a blocking lease while pointer moves stay local and pointerup commits exact coordinates',async()=>{
 const h=await editHarness();h.event('pointerdown',10,10);h.event('pointermove',18,19);h.flush();await h.settle();
 assert.deepEqual(h.draftCalls.at(-1).params.annotation_edit,{annotation_id:'line-a',coordinates:[30,22,60,52]});
 assert.deepEqual(h.inspect().editCoordinates,[38,31,60,52]);
 assert.equal(h.draftCalls.at(-1).params.gesture_active,true);assert.equal(h.calls.length,0);
 h.event('pointerup',18,19);h.flush();await h.settle();assert.equal(h.draftCalls.at(-1).params.annotation_edit,null);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,1);
});

test('text/color/status are returned as unsaved edits without committing a scientific object',async()=>{
 const h=await editHarness();h.$('mark-text').value='a revised candidate';h.$('color').value='orange';h.$('status').value='retracted';h.$('mark-text').oninput();await h.settle();
 assert.deepEqual(h.draftCalls.at(-1).params.annotation_edit,{annotation_id:'line-a',text:'a revised candidate',color:'orange',status:'retracted'});assert.equal(h.calls.length,0);
});

test('choosing another mark queues the prior edit and preserves both edits while a save waits',async()=>{
 const s=annotated();s.object.annotations.push({...copy(s.object.annotations[0]),annotation_id:'line-b',anchor:{...copy(s.object.annotations[0].anchor),coordinates:[90,22,120,52]}});
 const h=await harness(s);let done;h.delayAction(new Promise(resolve=>{done=resolve;}));h.$('existing').value='line-a';h.$('existing').onchange();h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();await h.settle();
 h.$('existing').value='line-b';h.$('existing').onchange();assert.equal(h.$('existing').value,'line-b');assert.deepEqual(h.inspect().queuedEdits[0][1].update.coordinates,[38,31,60,52]);
 h.$('mode').value='select';h.event('pointerdown',70,10);h.event('pointerup',80,20);h.flush();assert.equal(h.$('existing').value,'line-b');assert.equal(h.inspect().queuedEdits.length,2);
 done();await h.settle();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[38,31,60,52]);assert.deepEqual(h.server().object.annotations[1].anchor.coordinates,[100,32,120,52]);assert.equal(h.inspect().dirty,false);
});

test('failed autosave retains its latest local edit and does not silently replay',async()=>{
 const h=await editHarness();h.failAction();h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();await h.settle();
 assert.equal(h.inspect().autoFailed,true);assert.equal(h.inspect().dirty,true);assert.deepEqual(h.inspect().queuedEdits[0][1].update.coordinates,[38,31,60,52]);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[30,22,60,52]);
 await h.settle();assert.equal(h.calls.length,1);assert.match(h.$('message').textContent,/失败|保留/);
});

function unsubmittedRecoveryReply(h,requestId,change=()=>{}){
 const reply=h.server();reply.execution_recovery={state:'not_submitted',request_id:requestId,automatic_retry:false};reply.last_operation={state:'not_submitted',request_id:requestId};change(reply);h.actionResult(reply);h.recoverResponse(reply.last_operation);
}
test('not-submitted recovery releases the unknown guard but queued edits require a new explicit save',async()=>{
 const h=await editHarness();h.failAction('Original request_id=controlled-lost-request was rejected; query original');h.event('pointerdown',10,10);h.event('pointerup',18,19);await h.settle();assert.equal(h.inspect().autoFailed,true);const pending=copy(h.inspect().queuedEdits),before=h.calls.length;unsubmittedRecoveryReply(h,'controlled-lost-request');await h.click('recover');await h.settle();
 assert.equal(h.inspect().autoFailed,false);assert.deepEqual(h.inspect().queuedEdits,pending);assert.equal(h.calls.length,before+1);assert.match(h.$('draft-status').textContent,/未提交.*编辑保留.*明确保存/);await h.finish();await h.settle();assert.equal(h.calls.filter(c=>c.action==='edit').length,1,'query/finally cannot replay a positively rejected write');
 await h.click('save-mark');await h.finish();await h.settle();assert.equal(h.calls.filter(c=>c.action==='edit').length,2);assert.equal(h.inspect().queuedEdits.length,0);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[38,31,60,52]);
});
test('not-submitted recovery permits metadata-only desktop close preparation and only explicit Save releases editing',async()=>{
 const f=windowActivationFixture();f.source.object.annotations=annotated().object.annotations;f.source.selection=null;f.source.window_collection.windows[0].view_context.selection_candidate=null;f.source.workspace_analysis={schema_version:1,status:'clean',working_revision:1,save_id:'saved-a',saved_revision:1,recovery_available:false,unresolved_request_id:null};
 const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();h.$('existing').value='line-a';h.$('existing').onchange();h.failAction('Original request_id=controlled-lost-request; query original');h.event('pointerdown',10,10);h.event('pointerup',18,19);await h.settle();
 assert.equal((await h.nativeAction('prepare-close')).ok,false,'an unknown write still blocks close');unsubmittedRecoveryReply(h,'controlled-lost-request');await h.click('recover');await h.settle();const queue=copy(h.inspect().queuedEdits),writes=h.calls.length;
 assert.equal((await h.nativeAction('prepare-close')).ok,true);await h.settle();assert.deepEqual(h.inspect().queuedEdits,queue);assert.equal(h.calls.length,writes);assert.equal(h.server().workspace_analysis.active_window_draft.content_dirty,true);
 // Returning from the native Save/NoSave/Cancel question via Cancel performs
 // no renderer command. Reopening it still cannot flush the held write.
 assert.equal((await h.nativeAction('prepare-close')).ok,true);await h.finish();await h.settle();assert.deepEqual(h.inspect().queuedEdits,queue);assert.equal(h.calls.length,writes);assert.equal(h.$('workspace-save').disabled,false);
 const saved=await h.nativeAction('save');assert.equal(saved.ok,true,saved.error);await h.finish();await h.settle();assert.equal(h.calls.filter(c=>c.action==='edit').length,2);assert.equal(h.inspect().queuedEdits.length,0);assert.equal(h.inspect().state.workspace_analysis.status,'clean');assert.equal(h.actionTrace.filter(action=>action==='save').length,1);
});
test('not-submitted recovery permits explicit workspace discard without resubmitting retained edits',async()=>{
 const f=windowActivationFixture();f.source.object.annotations=annotated().object.annotations;f.source.selection=null;f.source.window_collection.windows[0].view_context.selection_candidate=null;f.source.workspace_analysis={schema_version:1,status:'clean',working_revision:1,save_id:'saved-a',saved_revision:1,recovery_available:false,unresolved_request_id:null};
 const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();h.$('existing').value='line-a';h.$('existing').onchange();h.failAction('Original request_id=controlled-lost-request; query original');h.event('pointerdown',10,10);h.event('pointerup',18,19);await h.settle();unsubmittedRecoveryReply(h,'controlled-lost-request');await h.click('recover');await h.settle();assert.equal((await h.nativeAction('prepare-close')).ok,true);
 await h.click('workspace-discard');await h.settle();await h.finish();assert.equal(h.calls.filter(c=>c.action==='edit').length,1);assert.equal(h.actionTrace.filter(action=>action==='discard').length,1);assert.equal(h.inspect().queuedEdits.length,0);assert.equal(h.inspect().dirty,false);assert.deepEqual(h.inspect().state.object.annotations[0].anchor.coordinates,[30,22,60,52]);assert.equal(h.inspect().state.object.object_id,f.source.object.object_id);
});
for(const [name,change] of [
 ['wrong request identity',r=>{r.execution_recovery.request_id='different-original';}],
 ['automatic retry permitted',r=>{r.execution_recovery.automatic_retry=true;}],
 ['unknown outcome',r=>{r.execution_recovery.state='unknown';}],
 ['unknown receipt field',r=>{r.execution_recovery.extra='not authoritative';}],
 ['missing formal receipt',r=>{delete r.execution_recovery;}],
])test('not-submitted recovery rejects '+name+' and keeps original queued editing',async()=>{
 const h=await editHarness();h.failAction('Text says not_submitted. Original request_id=controlled-lost-request; text is not proof');h.event('pointerdown',10,10);h.event('pointerup',18,19);await h.settle();const before=copy(h.inspect().queuedEdits);unsubmittedRecoveryReply(h,'controlled-lost-request',change);await h.click('recover');await h.settle();assert.equal(h.inspect().autoFailed,true);assert.deepEqual(h.inspect().queuedEdits,before);assert.equal(h.calls.filter(c=>c.action==='edit').length,1);assert.equal(h.inspect().state.object.object_id,viewId);
});

test('saving a mark advances the visible identity even when a separate Agent result remains queued',async()=>{
 const initial=annotated();initial.pending_result={object_id:'d'.repeat(32),request_id:'agent-result'};
 const h=await harness(initial);h.$('existing').value='line-a';h.$('existing').onchange();h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();
 const committed=annotated();committed.object.object_id='c'.repeat(32);committed.pending_result=copy(initial.pending_result);committed.object.annotations[0].anchor.coordinates=[38,31,60,52];h.actionResult(committed);await h.click('save-mark');
 assert.equal(h.inspect().state.object.object_id,committed.object.object_id);assert.equal(h.inspect().editCoordinates,null);
 assert.equal(h.inspect().state.pending_result.object_id,'d'.repeat(32));assert.equal(h.$('pending-result').hidden,false);
 assert.equal(h.draftCalls.at(-1).expected_object_id,committed.object.object_id);
});

test('measurement summary prefers valid physical lengths and never prints null as a distance',async()=>{
 const f=fixture();f.last_operation={physical_distance:2.5,physical_unit:'nm',distance_pixels:10};
 const h=await harness(f);assert.match(h.$('measurement-summary').textContent,/2.5 nm/);
 f.last_operation={physical_distance:null,period:null,d_spacing:null,distance_pixels:10};h.setServer(f);await h.click('reload');
 assert.match(h.$('measurement-summary').textContent,/10 px/);assert.doesNotMatch(h.$('measurement-summary').textContent,/null/);
 f.last_operation={physical_distance:null,period:2.5,period_unit:'nm',d_spacing:2.5,d_spacing_unit:'nm',distance_pixels:10};h.setServer(f);await h.click('reload');
 assert.match(h.$('measurement-summary').textContent,/晶面间距.*2.5 nm/);
});

test('reciprocal calibration form uses the current domain and signed scale, not a real-space default',async()=>{
 const f=fixture();f.tools=[{name:'image_calibrate'}];f.object.xy_calibration={status:'active',scope:'image',coordinate_domain:'reciprocal_space',xy_scale:{x:.2,y:-.4,unit:'1/nm'}};
 const h=await harness(f);assert.equal(Number(h.$('scale-x').value),.2);assert.equal(Number(h.$('scale-y').value),-.4);assert.equal(h.$('unit').value,'1/nm');assert.equal(h.$('scope').value,'image');
 h.$('source').value='Explicit synthetic calibration correction';await h.click('calibrate');
 assert.equal(h.calls.at(-1).params.coordinate_domain,'reciprocal_space');assert.deepEqual(h.calls.at(-1).params.xy_scale,{x:.2,y:-.4,unit:'1/nm'});
});

test('dragging an independently positioned label saves presentation only and preserves the confirmed scientific anchor',async()=>{
 const f=fixture();f.object.annotations=[{annotation_id:'indexed-peak',kind:'point',text:'(1 -1 0)',color:'white',status:'user_confirmed',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[60,52]},presentation:{category:'A',label:{text:'g₁',offset:[15,12],pinned:true}}}];
 const h=await harness(f),original=copy(f.object.annotations[0]);h.$('mode').value='select';h.flush();
 h.event('pointerdown',57,54);assert.equal(h.inspect().drag.kind,'label');h.event('pointermove',67,62);h.flush();
 assert.deepEqual(h.inspect().state.object.annotations[0].anchor,original.anchor);assert.equal(h.calls.length,0);
 h.event('pointerup',67,62);h.flush();await h.settle();
 assert.equal(h.calls.length,1);const update=h.calls[0].params.updates[0];assert.deepEqual(Object.keys(update).sort(),['annotation_id','presentation','presentation_replace']);assert.equal(update.presentation_replace,true);
 assert.deepEqual(update.presentation.label.offset,[25,20]);assert.equal(update.presentation.label.pinned,true);
 const saved=h.server().object.annotations[0];assert.deepEqual(saved.anchor,original.anchor);assert.equal(saved.status,'user_confirmed');assert.equal(saved.text,original.text);assert.equal(saved.presentation.label.text,original.presentation.label.text);
});

test('moving a measured endpoint hides its stale numeric label until a new measurement record supplies valid units',async()=>{
 for(const result of [{object_id:'new-distance-record',physical_distance:3.2,physical_unit:'nm'},{object_id:'pixel-only-record',physical_distance:null,physical_unit:null,distance_pixels:30}]){
  const f=annotated();f.object.annotations[0].status='user_confirmed';f.object.annotations[0].text='d = 2.5 nm';f.object.annotations[0].presentation={label:{text:'d = 2.5 nm',offset:[40,5],pinned:true,visible:true,measurement_object_id:'old-distance-record',measurement_kind:'distance'}};
  const h=await harness(f);let measured;h.delayMeasurement(new Promise(resolve=>{measured=resolve;}));h.measureResponse(result);
  h.$('existing').value='line-a';h.$('existing').onchange();h.event('pointerdown',10,10);h.event('pointerup',18,19);h.flush();await h.settle();
  const moved=h.server().object.annotations[0];assert.deepEqual(moved.anchor.coordinates,[38,31,60,52]);assert.equal(moved.status,'user_confirmed');assert.equal(moved.presentation.label.visible,false);assert.equal(moved.presentation.label.measurement_object_id,'old-distance-record');
  assert.doesNotMatch(h.$('annotation-layer').innerHTML,/data-part="label"/);
  assert.equal(h.calls[0].action,'edit');assert.equal(h.calls[0].params.updates[0].status,undefined);assert.equal(h.calls[1].action,'measure');assert.deepEqual(h.calls[1].params.selection.coordinates,[38,31,60,52]);
  measured();await h.settle();const saved=h.server().object.annotations[0];assert.equal(saved.status,'user_confirmed');assert.deepEqual(saved.anchor.coordinates,[38,31,60,52]);
  if(result.physical_unit){assert.equal(h.calls.length,3);assert.equal(saved.presentation.label.visible,true);assert.equal(saved.presentation.label.measurement_object_id,'new-distance-record');assert.equal(saved.presentation.label.text,'d = 3.2 nm');assert.match(saved.note,/new-distance-record/);}
  else {assert.equal(h.calls.length,2);assert.equal(saved.presentation.label.visible,false);assert.equal(saved.presentation.label.measurement_object_id,'old-distance-record');assert.match(h.$('message').textContent,/没有可信物理单位/);}
 }
});

test('figure mode locks scientific geometry and new selections while leaving the original anchor available',async()=>{
 const f=annotated();f.object.annotations[0].presentation={label:{visible:false}};const h=await harness(f);await h.click('figure-mode');assert.equal(h.$('figure-mode').textContent,'出图模式');
 h.$('mode').value='select';h.event('pointerdown',10,10);h.event('pointermove',18,19);h.event('pointerup',18,19);h.flush();await h.settle();
 assert.equal(h.inspect().drag,null);assert.equal(h.inspect().editCoordinates,null);assert.equal(h.calls.length,0);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[30,22,60,52]);
 h.$('mode').value='rectangle';h.event('pointerdown',80,60);h.event('pointermove',110,80);h.event('pointerup',110,80);h.flush();await h.settle();
 assert.equal(h.inspect().draft,null);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,0);assert.doesNotMatch(h.$('annotation-layer').innerHTML,/data-part="handles"/);
});

function twoMeasuredLines(){const f=fixture();f.object.annotations=[['A',[25,30,75,30],'1'],['B',[21,70,146,70],'2.5']].map(([annotation_id,coordinates,value])=>({annotation_id,kind:'line',text:`d = ${value} nm`,color:'white',status:'user_confirmed',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates},presentation:{label:{text:`d = ${value} nm`,offset:[8,20],visible:true,measurement_object_id:annotation_id.toLowerCase().repeat(32),measurement_kind:'distance'}}}));return f;}
function selectLine(h,id){h.$('existing').value=id;h.$('existing').onchange();}
function measuredFromSelection(body){const c=body.params.selection.coordinates;return {object_id:(c[1]===30?'c':'d').repeat(32),physical_distance:Math.hypot(c[2]-c[0],c[3]-c[1])*.02,physical_unit:'nm'};}
test('P0: saving A then selecting B remeasures saved A, never the global B selection',async()=>{
 const f=twoMeasuredLines(),h=await harness(f),originalB=copy(f.object.annotations[1]);let release;h.delayAction(new Promise(r=>{release=r;}));h.measureResponse(measuredFromSelection);
 selectLine(h,'A');h.event('pointerdown',55,18);h.event('pointerup',65,18);h.flush();await h.settle();assert.equal(h.calls[0].action,'edit');
 selectLine(h,'B');h.event('pointerdown',126,58);h.event('pointerup',126,58);h.flush();assert.deepEqual(h.inspect().draft.coordinates,originalB.anchor.coordinates);
 release();await h.settle();const saved=h.server().object.annotations;
 assert.deepEqual(h.calls.find(c=>c.action==='measure').params.selection.coordinates,[25,30,85,30]);
 assert.equal(saved[0].presentation.label.text,'d = 1.2 nm');assert.deepEqual(saved[1],originalB);assert.deepEqual(h.inspect().draft.coordinates,originalB.anchor.coordinates);
});

test('P0: a delayed measurement cannot write an older A revision after A moves again',async()=>{
 const h=await harness(twoMeasuredLines());let release;h.delayMeasurement(new Promise(r=>{release=r;}));h.measureResponse(measuredFromSelection);
 selectLine(h,'A');h.event('pointerdown',55,18);h.event('pointerup',65,18);h.flush();await h.settle();assert.equal(h.calls.filter(c=>c.action==='measure').length,1);
 h.event('pointerdown',65,18);h.event('pointerup',75,18);h.flush();await h.settle();assert.equal(h.server().object.annotations[0].presentation.label.visible,false);
 release();await h.finish();const mark=h.server().object.annotations[0];assert.equal(h.inspect().autoFailed,false,JSON.stringify({calls:h.calls,ui:h.inspect(),message:h.$('message').textContent}));assert.equal(h.inspect().busy,false,JSON.stringify({calls:h.calls,queue:h.inspect().queuedEdits,message:h.$('message').textContent}));assert.deepEqual(mark.anchor.coordinates,[25,30,95,30]);assert.equal(mark.presentation.label.text,'d = 1.4 nm');assert.equal(mark.status,'user_confirmed');
 assert.deepEqual(h.calls.filter(c=>c.action==='measure').map(c=>c.params.selection.coordinates),[[25,30,85,30],[25,30,95,30]]);
 assert.ok(!h.calls.some(c=>c.action==='edit'&&c.params.updates.some(u=>u.text==='d = 1.2 nm')),'stale numeric result must never be persisted');
});

test('P0: consecutive A/B edits each remeasure their own saved anchor; label drag keeps that measurement ID',async()=>{
 const h=await harness(twoMeasuredLines());let release;h.delayMeasurement(new Promise(r=>{release=r;}));h.measureResponse(measuredFromSelection);
 selectLine(h,'A');h.event('pointerdown',55,18);h.event('pointerup',65,18);h.flush();await h.settle();
 selectLine(h,'B');h.event('pointerdown',1,58);h.event('pointerup',11,58);h.flush();release();await h.finish();
 const [a,b]=h.server().object.annotations;assert.equal(a.presentation.label.text,'d = 1.2 nm');assert.equal(b.presentation.label.text,'d = 2.3 nm');assert.deepEqual(b.anchor.coordinates,[31,70,146,70]);
 assert.deepEqual(h.calls.filter(c=>c.action==='measure').map(c=>c.params.selection.coordinates),[[25,30,85,30],[31,70,146,70]]);
 const count=h.calls.filter(c=>c.action==='measure').length,id=a.presentation.label.measurement_object_id,anchor=copy(a.anchor);
 h.$('mode').value='select';h.event('pointerdown',20,45);h.event('pointerup',30,49);h.flush();await h.finish();
 const again=h.server().object.annotations[0];assert.deepEqual(again.anchor,anchor);assert.equal(again.presentation.label.measurement_object_id,id);assert.equal(h.calls.filter(c=>c.action==='measure').length,count);
});

test('P0: unknown measurement response retains drafts and only queries its original request on recovery',async()=>{
 const h=await harness(twoMeasuredLines());let release;h.delayMeasurement(new Promise(r=>{release=r;}));h.measureResponse(measuredFromSelection);
 selectLine(h,'A');h.event('pointerdown',55,18);h.event('pointerup',65,18);h.flush();await h.settle();
 selectLine(h,'B');h.event('pointerdown',1,58);h.event('pointerup',11,58);h.flush();h.failAction('Synthetic response lost. Original request_id=measure-original-42; query it');release();await h.settle();
 assert.equal(h.inspect().autoFailed,true);assert.equal(h.inspect().dirty,true);assert.equal(h.server().object.annotations[0].presentation.label.visible,false);const requests=h.calls.length;
 await h.settle();assert.equal(h.calls.length,requests,'unknown measurement is never automatically replayed');
 h.recoverResponse({kind:'measure',request_id:'measure-original-42',object_id:'e'.repeat(32),coordinate_space:'source_pixels',points:[[25,30],[85,30]],physical_distance:1.2,physical_unit:'nm'});
 await h.click('recover');await h.finish();assert.equal(h.calls.find(c=>c.action==='recover').params.request_id,'measure-original-42');assert.equal(h.inspect().autoFailed,false);
 assert.equal(h.server().object.annotations[0].presentation.label.text,'d = 1.2 nm');assert.equal(h.server().object.annotations[1].presentation.label.text,'d = 2.3 nm');assert.equal(h.calls.filter(c=>c.action==='measure'&&c.params.selection.coordinates[1]===30).length,1);
});
test('not-submitted recovery does not invent a measurement or drain another mark edit',async()=>{
 const h=await harness(twoMeasuredLines());let release;h.delayMeasurement(new Promise(resolve=>{release=resolve;}));h.measureResponse(measuredFromSelection);selectLine(h,'A');h.event('pointerdown',55,18);h.event('pointerup',65,18);h.flush();await h.settle();selectLine(h,'B');h.event('pointerdown',1,58);h.event('pointerup',11,58);h.failAction('Original request_id=measure-original-42; query original');release();await h.settle();assert.equal(h.inspect().autoFailed,true);const queued=copy(h.inspect().queuedEdits),count=h.calls.filter(c=>c.action==='measure').length,draft=copy(h.inspect().draft);unsubmittedRecoveryReply(h,'measure-original-42');await h.click('recover');await h.settle();
 assert.equal(h.inspect().autoFailed,false);assert.deepEqual(h.inspect().queuedEdits,queued);assert.deepEqual(h.inspect().draft,draft);assert.equal(h.calls.filter(c=>c.action==='measure').length,count);assert.equal(h.inspect().state.last_operation.state,'not_submitted');assert.notEqual(h.inspect().state.last_operation.kind,'measure');assert.equal(h.server().object.annotations[0].presentation.label.visible,false);assert.match(h.$('message').textContent,/未提交.*保留/);
});

function figureImportFixture(){
 const saved=annotated();saved.object.display={gamma:1,display_range:[0,255],max_size:128,upscale:false,interpolation:'nearest',scale_bar:false};
 saved.object.annotations[0].status='user_confirmed';saved.object.annotations[0].presentation={marker_shape:'circle',label:{offset:[8,-8],text:'saved label',measurement_object_id:'e'.repeat(32),measurement_kind:'distance'}};
 const recipe=figureExport.makeFigureRecipe(saved,{preset:'real-space',mode:'figure',columns:'single',fontPt:8,layers:{experimental:true,simulation_A:false,simulation_B:false},legend:false,scaleBar:false,letter:'a'}),current=copy(saved);
 current.object.display.gamma=2;current.object.display.display_range=[20,220];current.object.annotations[0].presentation={marker_shape:'diamond',label:{offset:[28,18],text:'later label'}};
 const restored=copy(current);restored.object.object_id='c'.repeat(32);restored.object.display=copy(saved.object.display);restored.render_base_id=restored.object.object_id;
 return {saved,current,restored,recipe};
}

test('P0: paste and file imports await restored display before saving exact presentation replacements',async()=>{
 for(const route of ['paste','file']){
  const {saved,current,restored,recipe}=figureImportFixture(),h=await harness(current);let release;h.delayAction(new Promise(resolve=>{release=resolve;}));h.actionResult(restored);
  const text=JSON.stringify(recipe);let imported;
  if(route==='paste'){h.$('recipe-text').value=text;imported=h.click('load-recipe-text');}
  else{h.$('import-figure').files=[{size:text.length,text:async()=>text}];imported=h.$('import-figure').onchange();}
  await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'restore-figure-display');assert.deepEqual(h.calls[0].params.recipe,recipe);assert.equal(h.inspect().queuedEdits.length,0);assert.deepEqual(h.server().object.annotations[0].presentation,current.object.annotations[0].presentation);
  release();await imported;await h.finish();
  const edit=h.calls.find(c=>c.action==='edit');assert.ok(edit,'presentation saves only after display adoption');assert.equal(edit.expected_object_id,restored.object.object_id);assert.equal(edit.params.updates[0].presentation_replace,true);assert.deepEqual(edit.params.updates[0].presentation,saved.object.annotations[0].presentation);
  assert.equal(h.inspect().state.object.display.gamma,1);assert.deepEqual(h.inspect().state.object.display.display_range,[0,255]);assert.deepEqual(h.server().object.annotations[0].anchor,saved.object.annotations[0].anchor);assert.equal(h.server().object.annotations[0].status,'user_confirmed');assert.equal(h.server().object.annotations[0].presentation.label.measurement_object_id,'e'.repeat(32));assert.equal(h.$('figure-mode').textContent,'出图模式');assert.match(h.$('figure-export-status').textContent,/已恢复底图显示/);
 }
});

test('P0: a local display draft arriving during figure restoration remains intact and blocks label replay',async()=>{
 const {current,restored,recipe}=figureImportFixture(),h=await harness(current);let release;h.delayAction(new Promise(resolve=>{release=resolve;}));h.actionResult(restored);h.$('recipe-text').value=JSON.stringify(recipe);
 const imported=h.click('load-recipe-text');await h.settle();assert.equal(h.calls[0].action,'restore-figure-display');
 h.$('gamma').value='.7';h.$('gamma').oninput();h.flush();const revision=h.inspect().draftRevision;
 release();await imported;await h.finish();
 assert.equal(h.calls.length,1);assert.equal(h.inspect().state.object.object_id,current.object.object_id);assert.equal(h.inspect().pending.object.object_id,restored.object.object_id);assert.equal(h.inspect().draftRevision,revision);assert.equal(Number(h.$('gamma').value),.7);assert.equal(h.inspect().dirty,true);assert.equal(h.inspect().queuedEdits.length,0);assert.deepEqual(h.inspect().state.object.annotations[0].presentation,current.object.annotations[0].presentation);assert.equal(h.$('figure-mode').textContent,'分析模式');assert.match(h.$('figure-export-status').textContent,/尚未安全接续/);
});

test('P0: a provider pending display result cannot apply imported labels or figure preferences',async()=>{
 const {current,restored,recipe}=figureImportFixture(),h=await harness(current),queued=copy(current);queued.pending_result={object_id:restored.object.object_id,request_id:'display-restore-original',reason:'unsaved_draft'};h.actionResult(queued);h.$('recipe-text').value=JSON.stringify(recipe);
 await h.click('load-recipe-text');await h.finish();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'restore-figure-display');assert.equal(h.inspect().state.object.object_id,current.object.object_id);assert.equal(h.inspect().state.pending_result.request_id,'display-restore-original');assert.equal(h.$('pending-result').hidden,false);assert.equal(h.inspect().queuedEdits.length,0);assert.equal(Number(h.$('gamma').value),2);assert.deepEqual(h.inspect().state.object.annotations[0].presentation,current.object.annotations[0].presentation);assert.equal(h.$('figure-mode').textContent,'分析模式');assert.match(h.$('figure-export-status').textContent,/尚未安全接续/);
});


test('P0: recipe layout batch refreshes the selected inspector even when another mark is first',async()=>{
 const {saved,current,restored}=figureImportFixture();
 for(const s of [saved,current,restored])s.object.annotations.push({...copy(s.object.annotations[0]),annotation_id:'line-b'});
 saved.object.annotations[1].presentation.label.font_size=12;current.object.annotations[1].presentation.label.font_size=16;restored.object.annotations[1].presentation.label.font_size=16;
 const recipe=figureExport.makeFigureRecipe(saved,{preset:'real-space',mode:'figure',layers:{experimental:true},fontPt:8}),h=await harness(current);
 h.$('existing').value='line-b';h.$('existing').onchange();assert.equal(h.$('label-size').value,16);
 h.actionResult(restored);h.$('recipe-text').value=JSON.stringify(recipe);await h.click('load-recipe-text');await h.finish();
 assert.ok(h.calls.some(c=>c.action==='edit-layout'));assert.equal(h.$('label-size').value,12);assert.equal(h.$('marker-shape').value,'circle');assert.deepEqual(h.server().object.annotations[1].anchor,saved.object.annotations[1].anchor);
});

test('pointer probe uses the exact source coordinate request and creates no scientific action',async()=>{
 const h=await harness();h.event('pointermove',25,26);await h.flushProbes();assert.equal(h.probeCalls.length,0,'closed numerical inspector performs no backend read');h.$('numeric-data').open=true;h.event('pointermove',25,26);h.event('pointermove',30,28);assert.equal(h.probeCalls.length,0);await h.flushProbes();assert.equal(h.probeCalls.length,1);assert.deepEqual(h.probeCalls[0].coordinates,[50,40]);assert.equal(h.probeCalls[0].source_object_id,sourceId);assert.equal(h.probeCalls[0].component,'raw');assert.equal(h.calls.length,0);assert.match(h.$('probe-value').textContent,/原始数值 17/);h.event('pointermove',40,38);h.event('pointerleave');await h.flushProbes();assert.equal(h.probeCalls.length,1);assert.match(h.$('probe-value').textContent,/尚未读取/);
});

test('historical moved or missing marks expose the same explicit jump requested by selection',async()=>{
 for(const missing of [false,true]){
  const initial=annotated(),saved=copy(initial),oldId='e'.repeat(32),currentId='f'.repeat(32),savedView='d'.repeat(32);
  saved.object.object_id=savedView;saved.object.annotations[0].anchor.coordinates=[30,22,55,50];
  if(missing)initial.object.annotations=[];
  const old={object_id:oldId,kind:'measure',annotation_id:'line-a',name:'old A',status:'historical',points:[[30,22],[55,50]],coordinate_space:'source_pixels',input_object_id:savedView,same_grid:true,visible_in_current_view:true,annotation_matches_current:false};
  const current={...copy(old),object_id:currentId,name:'current A',status:'current',points:[[30,22],[60,52]],input_object_id:viewId,annotation_matches_current:!missing};
  initial.measurement_entries=[old,current];const h=await harness(initial);await h.settle();
  h.$('measurement-history').checked=true;h.$('measurement-history').onchange();
  const row=id=>h.$('measurement-rows').children.find(value=>value.dataset.measurementId===id);
  row(oldId).onclick();await h.settle();
  assert.match(h.$('message').textContent,/跳到结果原视图/);
  assert.equal(h.$('measurement-jump').hidden,false,missing?'missing annotation must allow original-view navigation':'moved annotation must allow original-view navigation');
  assert.equal(h.calls.length,0,'viewing the old result cannot remeasure or switch views');
  assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.inspect().state.object.annotations,initial.object.annotations);
  const restored=copy(saved);restored.measurement_entries=[{...copy(old),annotation_matches_current:true},{...copy(current),annotation_matches_current:false}];
  h.actionResult(restored);await h.click('measurement-jump');await h.settle();
  assert.deepEqual(h.calls.map(value=>value.action),['measurement-jump']);assert.equal(h.calls[0].params.measurement_object_id,oldId);
  assert.equal(h.inspect().state.object.object_id,savedView);assert.deepEqual(h.inspect().state.object.annotations,saved.object.annotations);
  assert.equal(row(oldId).attributes['aria-selected'],'true','the old row remains selected, not the newer measurement of that annotation');
  assert.equal(h.$('measurement-jump').hidden,true,'the exact original mark now matches');
  assert.deepEqual(h.server().measurement_entries.map(value=>({object_id:value.object_id,points:value.points})),initial.measurement_entries.map(value=>({object_id:value.object_id,points:value.points})));
 }
 for(const flags of [{same_grid:true,visible_in_current_view:true,annotation_matches_current:true},{same_grid:false,visible_in_current_view:false,annotation_matches_current:false},{same_grid:true,visible_in_current_view:false,annotation_matches_current:true}]){
  const initial=annotated();initial.measurement_entries=[{object_id:'e'.repeat(32),kind:'measure',annotation_id:'line-a',status:'current',points:[[30,22],[60,52]],coordinate_space:'source_pixels',...flags}];
  const h=await harness(initial);await h.settle();h.$('measurement-rows').children[0].onclick();await h.settle();
  assert.equal(h.$('measurement-jump').hidden,!requiresMeasurementJump(initial.measurement_entries[0]));assert.equal(h.calls.length,0);
 }
 assert.equal(requiresMeasurementJump(null),false);
});


// Human workflow regressions: actual app handlers with this file's existing DOM/API shim.
function humanPointFixture(){const s=fixture();s.object.annotations=[{annotation_id:'human-A',kind:'point',text:'A',color:'cyan',status:'hypothesized',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[60,50]}}];return s;}
test('human workflow: choosing a mark never leaves a sticky edit mode; blank drag cannot move it',async()=>{
 const h=await harness(humanPointFixture());h.$('mode').value='select';h.event('pointerdown',40,38);h.event('pointerup',40,38);await h.finish();
 assert.equal(h.$('mode').value,'select');const before=copy(h.server().object.annotations[0].anchor);
 h.event('pointerdown',90,70);h.event('pointermove',105,85);h.event('pointerup',105,85);await h.finish();
 assert.equal(h.inspect().draft.kind,'rectangle');assert.deepEqual(h.server().object.annotations[0].anchor,before);assert.equal(h.calls.filter(c=>c.action==='edit').length,0);
 const temporary=copy(h.inspect().draft);h.event('pointerdown',100,75);h.event('pointerup',100,75);await h.finish();assert.deepEqual(h.inspect().draft,temporary,'clicking the temporary ROI keeps it available for the new move/resize interaction');assert.deepEqual(h.server().object.annotations[0].anchor,before);assert.equal(h.calls.filter(c=>c.action==='edit'||c.action==='mark').length,0);
 h.event('pointerdown',5,80);h.event('pointerup',5,80);await h.finish();assert.equal(h.inspect().draft,null,'a click on actual blank canvas still clears the temporary selection');assert.deepEqual(h.server().object.annotations[0].anchor,before);assert.equal(h.calls.filter(c=>c.action==='edit'||c.action==='mark').length,0);
});
test('human workflow: undo newer Gamma before older science geometry; redo follows the same chronological order',async()=>{
 const h=await harness(humanPointFixture());h.$('mode').value='select';h.event('pointerdown',40,38);h.event('pointerup',50,38);await h.finish();
 const moved=copy(h.server().object.annotations[0].anchor.coordinates);assert.deepEqual(moved,[70,50]);
 h.$('gamma').value='2';h.$('gamma').oninput();await h.click('undo');await h.finish();
 assert.equal(Number(h.$('gamma').value),1);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,moved);
 await h.click('undo');await h.finish();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[60,50]);
 await h.click('redo');await h.finish();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,moved);
 await h.click('redo');assert.equal(Number(h.$('gamma').value),2);
});
test('human workflow: a newer marker move is undone before an earlier unsaved Gamma change',async()=>{
 const h=await harness(humanPointFixture());h.$('gamma').value='2';h.$('gamma').oninput();h.$('mode').value='select';h.event('pointerdown',40,38);h.event('pointerup',50,38);await h.finish();
 await h.click('undo');await h.finish();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[60,50]);assert.equal(Number(h.$('gamma').value),2);
 await h.click('undo');assert.equal(Number(h.$('gamma').value),1);
});
test('human workflow: a rectangle measurement is refused before creating a scientific mark',async()=>{
 const h=await harness();h.draw('rectangle');await h.click('measure');assert.equal(h.calls.length,0);assert.equal(h.server().object.annotations.length,0);assert.match(h.$('message').textContent,/线段|ROI/);
});
test('human workflow: saved-view back opens the stored object and never resubmits FFT',async()=>{
 const first=fixture(),h=await harness(first);h.draw('rectangle');const fft=copy(first);fft.object.object_id='c'.repeat(32);fft.object.kind='fft';fft.object.panels=[{domain:'frequency',source_object_id:'d'.repeat(32),fft_shape_yx:[96,128],image_rect_xyxy:[0,0,128,96]}];h.actionResult(fft);await h.click('fft');
 assert.equal(h.$('view-back').disabled,false);h.actionResult(first);await h.click('view-back');assert.equal(h.calls.at(-1).action,'show');assert.equal(h.calls.at(-1).params.object_id,viewId);assert.equal(h.calls.filter(c=>c.action==='fft').length,1);assert.equal(h.inspect().state.object.object_id,viewId);
});
test('directly reopened ROI explicitly requests a fresh full-frame display instead of claiming a saved recipe',async()=>{
 const initial=fixture();initial.frame_identity={frame_object_id:sourceId,frame_index:0};const h=await harness(initial);
 assert.equal(h.$('view-current').textContent,'保存视图');assert.equal(h.$('view-original').textContent,'全帧（新显示）');assert.match(h.$('view-original').title,/没有已保存/);
 const full=copy(initial);full.object.object_id='c'.repeat(32);full.object.panels[0].source_rect_xyxy=[0,0,128,96];h.actionResult(full);await h.click('view-original');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'show');assert.deepEqual(h.calls[0].params,{object_id:sourceId,source_view:true});assert.match(h.$('message').textContent,/未恢复未知的旧显示配方/);assert.equal(h.$('view-original').disabled,true);
});

function returnableFft(){
 const value=fixture();value.object.object_id='c'.repeat(32);value.object.kind='fft';value.object.panels=[{domain:'frequency',source_object_id:'d'.repeat(32),fft_shape_yx:[96,128],image_rect_xyxy:[0,0,128,96]}];value.frame_identity={frame_object_id:sourceId,frame_index:0};value.state_revision=6;
 value.spatial_return={version:1,status:'ready',view_object_id:viewId,frame_object_id:sourceId};return value;
}
test('directly reopened FFT returns through the validated server reference without replaying FFT or preview',async()=>{
 const h=await harness(returnableFft());assert.equal(h.$('view-back').disabled,true);assert.equal(h.$('return-spatial').hidden,false);assert.equal(h.$('return-spatial').disabled,false);
 const saved=fixture();saved.object.annotations=[{annotation_id:'saved-roi',kind:'rectangle',purpose:'roi_observation',text:'ROI 1',note:'saved reason',anchor:{kind:'rectangle',coordinate_space:'source_pixels',source_object_id:sourceId,coordinates:[24,16,80,64]}}];h.actionResult(saved);await h.click('return-spatial');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'return-spatial');assert.equal(h.calls[0].expected_object_id,'c'.repeat(32));assert.deepEqual(h.calls[0].params,{});
 assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.inspect().state.object.annotations[0].note,'saved reason');assert.equal(h.$('return-spatial').hidden,true);assert.match(h.$('message').textContent,/已返回对应的保存空间观察/);
 assert.equal(h.$('view-back').disabled,false);assert.equal(h.calls.some(c=>['fft','preview'].includes(c.action)),false);
});
test('legacy or unqualified FFT shows why spatial return is unavailable and never guesses from a frame',async()=>{
 for(const code of ['no_saved_return','legacy_checkpoint_missing','different_fft','different_frame','target_unavailable']){
  const initial=returnableFft();initial.spatial_return={version:1,status:'unavailable',reason_code:code};const h=await harness(initial),before=h.inspect();
  assert.equal(h.$('return-spatial').disabled,true);assert.equal(h.$('spatial-return-status').hidden,false);assert.ok(h.$('spatial-return-status').textContent.length>10);
  await h.click('return-spatial');assert.equal(h.calls.length,0);assert.deepEqual(h.inspect(),before);
 }
});
test('spatial return keeps unsaved display and observation drafts and refuses pending results',async()=>{
 for(const draftKind of ['display','reason','pending']){
  const initial=returnableFft();if(draftKind==='pending')initial.pending_result={object_id:'e'.repeat(32),request_id:'pending-other-roi'};
  const h=await harness(initial);if(draftKind==='display'){h.$('gamma').value='1.8';h.$('gamma').oninput();}if(draftKind==='reason'){h.$('roi-reason').value='unsaved reason';h.$('roi-reason').oninput();}await h.settle();
  const before=h.inspect(),reason=h.$('roi-reason').value;assert.equal(h.$('return-spatial').disabled,true);await h.click('return-spatial');
  assert.equal(h.calls.length,0);assert.deepEqual(h.inspect(),before);assert.equal(h.$('roi-reason').value,reason);assert.match(h.$('message').textContent,/先保存或撤销草稿/);
 }
});
test('spatial return is blocked during a live gesture without consuming its coordinates',async()=>{
 const h=await harness(returnableFft());h.$('mode').value='point';h.event('pointerdown',40,35);h.event('pointermove',44,36);const before=h.inspect();await h.click('return-spatial');
 assert.equal(h.calls.length,0);assert.deepEqual(h.inspect(),before);assert.match(h.$('message').textContent,/结束手势/);
});
test('spatial return keeps an unresolved original request visible instead of replacing its recovery state',async()=>{
 const initial=returnableFft();initial.last_operation={state:'submitted',request_id:'unconfirmed-original'};const h=await harness(initial),before=h.inspect();
 assert.equal(h.$('return-spatial').disabled,true);assert.match(h.$('return-spatial').title,/先查询原请求/);await h.click('return-spatial');
 assert.equal(h.calls.length,0);assert.deepEqual(h.inspect(),before);assert.equal(h.inspect().state.last_operation.request_id,'unconfirmed-original');assert.match(h.$('message').textContent,/原请求尚未确认/);
});
test('spatial return does not claim the GUI switched when a newer selection arrived during PNG decoding',async()=>{
 const h=await harness(returnableFft());let release;h.delayDecode(new Promise(resolve=>release=resolve));h.actionResult(fixture());
 const returning=h.click('return-spatial');await h.settle();assert.equal(h.calls.length,1);h.draw('rectangle');const selection=copy(h.inspect().draft);
 release();await returning;await h.settle();
 assert.equal(h.server().object.object_id,viewId);assert.equal(h.inspect().state.object.object_id,'c'.repeat(32));assert.deepEqual(h.inspect().draft,selection);assert.equal(h.inspect().pending.object.object_id,viewId);
 assert.match(h.$('message').textContent,/空间目标已读回.*较新的编辑已保留.*等待明确接纳/);assert.doesNotMatch(h.$('message').textContent,/已返回对应/);assert.equal(h.calls.length,1);
});
test('spatial return qualification failure updates the button while preserving edits made during the lookup',async()=>{
 const initial=returnableFft(),h=await harness(initial);let release;h.delayAction(new Promise(resolve=>release=resolve));const returning=h.click('return-spatial');await h.settle();
 const unavailable=copy(initial);unavailable.state_revision=7;unavailable.spatial_return={version:1,status:'unavailable',reason_code:'target_unavailable'};h.setServer(unavailable);h.failAction('Spatial return unavailable: target_unavailable');
 h.$('gamma').value='1.8';h.$('gamma').oninput();release();await returning;await h.settle();
 assert.equal(h.inspect().state.object.object_id,initial.object.object_id);assert.equal(h.inspect().state.spatial_return.status,'unavailable');assert.equal(h.inspect().state.state_revision,7);assert.equal(Number(h.$('gamma').value),1.8);assert.equal(h.inspect().dirty,true);
 assert.equal(h.$('return-spatial').disabled,true);assert.match(h.$('spatial-return-status').textContent,/暂时无法读回/);assert.equal(h.calls.length,1);assert.ok(h.getCalls.includes('/api/state'));
});
test('spatial return qualification polling updates same-object navigation without clearing an observation draft',async()=>{
 const initial=returnableFft(),h=await harness(initial);h.$('roi-reason').value='Keep this newer reason';h.$('roi-reason').oninput();await h.settle();
 const unavailable=copy(h.server());unavailable.state_revision=7;unavailable.spatial_return={version:1,status:'unavailable',reason_code:'invalid_saved_preview'};h.setServer(unavailable);await h.poll();
 assert.equal(h.inspect().state.object.object_id,initial.object.object_id);assert.equal(h.inspect().state.spatial_return.status,'unavailable');assert.equal(h.inspect().state.state_revision,7);
 assert.equal(h.$('roi-reason').value,'Keep this newer reason');assert.equal(h.inspect().dirty,true);assert.match(h.$('spatial-return-status').textContent,/预览校验未通过/);assert.equal(h.calls.length,0);
});
test('spatial return labels its read-only wait separately from a scientific save',async()=>{
 const h=await harness(returnableFft());let release;h.delayAction(new Promise(resolve=>release=resolve));h.actionResult(fixture());const returning=h.click('return-spatial');await h.settle();
 assert.equal(h.$('autosave-status').textContent,'正在读取空间观察');assert.equal(h.$('draft-status').textContent,'正在读取空间观察');release();await returning;
 assert.match(h.$('message').textContent,/已返回对应/);assert.equal(h.calls.length,1);
});
test('narrow drawer bounds follow the actual viewport without moving camera, ROI or reason drafts',async()=>{
 const h=await harness();h.draw('rectangle');h.$('roi-reason').value='Keep the unsaved reason';h.$('roi-reason').oninput();h.$('gamma').value='1.8';h.$('gamma').oninput();await h.settle();
 const before=h.inspect(),counts=[h.calls.length,h.draftCalls.length,h.getCalls.length,h.probeCalls.length];for(const id of ['workbench','viewport','pending-result','view-navigation','measurement-content'])assert.ok(h.layoutObserved().includes(id));
 h.$('workbench').getBoundingClientRect=()=>({left:0,top:62,width:760,height:738});h.$('viewport').getBoundingClientRect=()=>({left:56,top:220,width:704,height:310});h.resizeLayout();
 for(const id of ['research-panel','properties-panel']){assert.equal(h.$(id).style.top,'158px');assert.equal(h.$(id).style.bottom,'270px');}
 h.$('viewport').getBoundingClientRect=()=>({left:56,top:260,width:704,height:250});h.resizeLayout();assert.equal(h.$('research-panel').style.top,'198px');assert.equal(h.$('research-panel').style.bottom,'290px');
 h.$('workbench').getBoundingClientRect=()=>({left:0,top:62,width:1200,height:738});h.resizeLayout();assert.equal(h.$('research-panel').style.top,'');assert.equal(h.$('properties-panel').style.bottom,'');
 assert.deepEqual(h.inspect(),before);assert.equal(h.$('roi-reason').value,'Keep the unsaved reason');assert.deepEqual([h.calls.length,h.draftCalls.length,h.getCalls.length,h.probeCalls.length],counts);
});
test('existing drawers stay mutually exclusive and expose their expanded state without discarding drafts',async()=>{
 const h=await harness();h.draw('rectangle');h.$('roi-reason').value='Keep reason across drawers';h.$('roi-reason').oninput();await h.settle();const selected=h.inspect().draft;
 await h.click('toggle-research');assert.equal(h.$('toggle-research').attributes['aria-expanded'],'true');assert.equal(h.$('toggle-properties').attributes['aria-expanded'],'false');
 await h.click('toggle-settings');assert.equal(h.$('research-panel').hidden,true);assert.equal(h.$('toggle-research').attributes['aria-expanded'],'false');assert.equal(h.$('toggle-properties').attributes['aria-expanded'],'true');assert.equal(h.$('toggle-settings').attributes['aria-expanded'],'true');
 h.$('settings-panel').open=false;h.$('settings-panel').listeners.toggle();assert.equal(h.$('toggle-settings').attributes['aria-expanded'],'false');
 await h.click('close-properties');assert.equal(h.$('toggle-properties').attributes['aria-expanded'],'false');await h.click('toggle-research');assert.equal(h.$('toggle-research').attributes['aria-expanded'],'true');
 assert.deepEqual(h.inspect().draft,selected);assert.equal(h.$('roi-reason').value,'Keep reason across drawers');assert.equal(h.inspect().dirty,true);assert.equal(h.calls.length,0);
});
test('expanded narrow results use the remaining height without replacing a manual height or moving the camera',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const before=h.inspect(),counts=[h.calls.length,h.draftCalls.length,h.getCalls.length,h.probeCalls.length];
 h.$('workbench').getBoundingClientRect=()=>({left:0,top:62,width:760,height:738});h.$('viewport').getBoundingClientRect=()=>({left:56,top:282.59375,width:704,height:160});h.$('measurement-workspace').open=true;h.$('measurement-workspace').getBoundingClientRect=()=>({left:56,top:568.59375,width:704,height:315.796875});h.$('measurement-content').getBoundingClientRect=()=>({left:56,top:604.390625,width:704,height:280});h.$('measurement-content').style.height='280px';h.resizeLayout();
 assert.equal(h.$('measurement-content').style.maxHeight,'195px');assert.equal(h.$('measurement-content').style.height,'280px');
 // More status text moves a minimum-height viewport without resizing it.
 h.$('viewport').getBoundingClientRect=()=>({left:56,top:310,width:704,height:160});h.$('measurement-workspace').getBoundingClientRect=()=>({left:56,top:596,width:704,height:315.796875});h.resizeLayout();assert.equal(h.$('research-panel').style.top,'248px');assert.equal(h.$('measurement-content').style.maxHeight,'168px');
 h.$('measurement-workspace').open=false;h.resizeLayout();assert.equal(h.$('measurement-content').style.maxHeight,'');h.$('measurement-workspace').open=true;h.$('workbench').getBoundingClientRect=()=>({left:0,top:62,width:1200,height:738});h.resizeLayout();assert.equal(h.$('measurement-content').style.maxHeight,'');
 assert.deepEqual(h.inspect(),before);assert.deepEqual([h.calls.length,h.draftCalls.length,h.getCalls.length,h.probeCalls.length],counts);
});
test('explicit pending-result discard clears the submitted observation draft intent and actually adopts the saved result',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'saved-pending'};const h=await harness(initial);h.$('roi-reason').value='Draft authorized for discard';h.$('roi-reason').oninput();await h.settle();
 const target=fixture();target.object.object_id='c'.repeat(32);h.actionResult(target);await h.click('discard-draft');
 assert.equal(h.inspect().dirty,false);assert.equal(h.inspect().state.object.object_id,target.object.object_id);assert.equal(h.$('pending-result').hidden,true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'accept-result');assert.match(h.$('message').textContent,/已查看保存版本/);
});
for(const button of ['discard-local','discard-draft'])for(const failure of ['state-read','image-decode'])test(`${button} retains unsaved reason and annotation fields when its ${failure} fails`,async()=>{
 const initial=annotated();if(button==='discard-draft')initial.pending_result={object_id:'c'.repeat(32),request_id:'saved-pending'};
 const h=await harness(initial);h.$('existing').value='line-a';h.$('existing').onchange();h.$('mark-text').value='Keep this unsaved annotation';h.$('mark-text').oninput();h.$('roi-reason').value='Keep this observation reason';h.$('roi-reason').oninput();await h.settle();
 if(failure==='state-read')h.failStateRead();else h.failImageDecode();await h.click(button);
 assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.$('roi-reason').value,'Keep this observation reason');assert.equal(h.$('mark-text').value,'Keep this unsaved annotation');assert.equal(h.inspect().dirty,true);assert.deepEqual(h.calls,[]);assert.match(h.$('message').textContent,failure==='state-read'?/current-state read failure/:/image decode failure/);
 await h.click('save-mark');await h.finish();assert.equal(h.server().object.annotations[0].text,'Keep this unsaved annotation','failed read must preserve the field edit, not just its visible text');assert.equal(h.$('roi-reason').value,'Keep this observation reason');
});
test('discarding a cached pending display keeps its draft and notice when the fresh saved-state read fails',async()=>{
 const h=await harness(annotated());h.$('roi-reason').value='Keep before checking pending';h.$('roi-reason').oninput();await h.settle();const latest=h.server();latest.object.object_id='d'.repeat(32);h.setServer(latest);await h.click('reload');const pending=h.inspect().pending;assert.ok(pending);
 h.failStateRead();await h.click('discard-draft');assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.inspect().pending,pending);assert.equal(h.$('roi-reason').value,'Keep before checking pending');assert.equal(h.inspect().dirty,true);assert.deepEqual(h.calls,[]);
});
test('explicit pending discard never consumes a new observation reason written during its saved-state read',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'saved-pending'};const h=await harness(initial);h.$('roi-reason').value='Old draft';h.$('roi-reason').oninput();await h.settle();let release;h.delayState(new Promise(resolve=>release=resolve));
 const discarding=h.click('discard-draft');await h.settle();h.$('roi-reason').value='New reason during discard read';h.$('roi-reason').oninput();release();await discarding;
 assert.equal(h.$('roi-reason').value,'New reason during discard read');assert.equal(h.inspect().dirty,true);assert.equal(h.calls.length,0);assert.equal(h.inspect().state.object.object_id,viewId);assert.match(h.$('message').textContent,/读取期间有新操作/);
});
test('a rejected pending acceptance is not reported as a successful view switch',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'saved-pending'};const h=await harness(initial);h.$('roi-reason').value='Discard this draft';h.$('roi-reason').oninput();await h.settle();h.failAction('Controlled pending acceptance rejected');await h.click('discard-draft');
 assert.equal(h.inspect().state.object.object_id,viewId);assert.match(h.$('message').textContent,/Controlled pending acceptance rejected/);assert.doesNotMatch(h.$('message').textContent,/已查看保存版本/);
});
test('pending discard preserves an unknown original request and its reason draft until recovery',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'saved-pending'};initial.last_operation={state:'submitted',request_id:'unknown-original'};const h=await harness(initial);h.$('roi-reason').value='Keep until original request resolves';h.$('roi-reason').oninput();await h.settle();await h.click('discard-draft');
 assert.equal(h.$('roi-reason').value,'Keep until original request resolves');assert.equal(h.calls.length,0);assert.equal(h.inspect().state.last_operation.request_id,'unknown-original');assert.match(h.$('message').textContent,/先查询原请求/);
});
test('a newly discovered unknown request stops pending acceptance after the saved-state read',async()=>{
 const initial=fixture();initial.pending_result={object_id:'c'.repeat(32),request_id:'saved-pending'};const h=await harness(initial);h.$('roi-reason').value='Explicitly discarded old draft';h.$('roi-reason').oninput();await h.settle();
 const latest=copy(h.server());latest.last_operation={state:'submitted',request_id:'newly-discovered-original'};h.setServer(latest);await h.click('discard-draft');
 assert.equal(h.calls.length,0);assert.equal(h.inspect().state.last_operation.request_id,'newly-discovered-original');assert.equal(h.inspect().state.object.object_id,viewId);assert.equal(h.$('roi-reason').value,'Explicitly discarded old draft');assert.equal(h.inspect().dirty,true);assert.match(h.$('message').textContent,/读回发现原请求尚未确认/);assert.doesNotMatch(h.$('message').textContent,/已查看保存版本/);
});

test('human workflow: result tabs expose one result type without changing the scientific object',async()=>{
 const h=await harness();await h.click('results-tab-profile');assert.equal(h.$('results-profile').hidden,false);assert.equal(h.$('results-measurements').hidden,true);assert.equal(h.$('numeric-data').open,true);await h.click('results-tab-measurements');assert.equal(h.$('numeric-data').open,false);assert.equal(h.calls.length,0);
});
test('ordinary complex display switches an explicit component and retains the same scientific ROI and marks',async()=>{
 const first=fixture();first.object.dtype='complex64';first.effective_display={...first.object.display,component:'real'};
 const h=await harness(first);assert.equal(h.$('complex-display').hidden,false);assert.match(h.$('identity').textContent,/复数图像/);assert.doesNotMatch(h.$('identity').textContent,/FFT/);assert.match(h.$('complex-display-current').textContent,/实部/);
 h.draw('rectangle');const selected=h.inspect().draft,second=copy(first);second.object.object_id='c'.repeat(32);second.effective_display.component='imag';second.effective_display.display_range=[-5,5];h.actionResult(second);h.$('complex-component').value='imag';await h.click('apply-complex-component');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'preview');assert.deepEqual(h.calls[0].params,{component:'imag',display_range:null});assert.deepEqual(h.inspect().draft.coordinates,selected.coordinates);assert.deepEqual(h.inspect().state.object.annotations,first.object.annotations);assert.match(h.$('complex-display-current').textContent,/虚部/);
 await h.click('apply-complex-component');assert.equal(h.calls.length,1,'selecting the displayed component must not create another result');
 const overlay=copy(first);overlay.object.kind='annotate';delete overlay.object.dtype;const a=await harness(overlay);assert.equal(a.$('complex-display').hidden,false,'saved component provenance keeps the control available on an annotation wrapper without copied dtype');a.draw('rectangle');assert.equal(a.$('fft').disabled,true);assert.match(a.$('fft').title,/不会丢弃虚部/);await a.click('fft');assert.equal(a.calls.length,0,'a wrapper cannot bypass the complex FFT qualification gate');
});
test('complex component switching refuses an unsaved display draft without discarding it or submitting a request',async()=>{
 const first=fixture();first.object.dtype='complex128';first.effective_display={...first.object.display,component:'amplitude'};const h=await harness(first),before=h.inspect().state.object;
 h.$('gamma').value='1.4';h.$('gamma').oninput();h.flush();h.$('complex-component').value='power';await h.click('apply-complex-component');
 assert.equal(h.calls.length,0);assert.equal(h.$('gamma').value,'1.4');assert.equal(h.inspect().dirty,true);assert.deepEqual(h.inspect().state.object,before);assert.match(h.$('message').textContent,/先保存或撤销.*草稿/);
});
test('scalar images and produced FFTs do not acquire ordinary-complex component controls',async()=>{
 const h=await harness();assert.equal(h.$('complex-display').hidden,true);await h.click('apply-complex-component');assert.equal(h.calls.length,0);
 const spectrum=fixture();spectrum.object.dtype='complex128';spectrum.object.kind='fft_view';spectrum.object.panels=[{domain:'frequency',source_object_id:sourceId,fft_shape_yx:[96,128],fft_rect_xyxy:[0,0,128,96],image_rect_xyxy:[0,0,128,96]}];const f=await harness(spectrum);assert.equal(f.$('complex-display').hidden,true);assert.match(f.$('identity').textContent,/FFT/);assert.equal(f.calls.length,0);
});

test('a baked scientific-preview scale bar is not duplicated by the SVG overlay; clean visible bars retain their halo',async()=>{
 for(const [baked,visible]of [[true,true],[false,true],[false,false]]){
  const initial=fixture();initial.effective_display={...initial.object.display,scale_bar:baked};initial.object.scale_bar={visible,length:.5,unit:'nm',image_endpoints_xyxy:[12,80,62,80]};
  const before=copy(initial.object),h=await harness(initial);h.flush();const overlay=h.$('annotation-layer').innerHTML;
  if(!baked&&visible){assert.match(overlay,/data-part="scale-bar-halo"/);assert.match(overlay,/data-part="scale-bar-line"/);assert.match(overlay,/0.5 nm/);}
  else assert.doesNotMatch(overlay,/data-part="scale-bar/,'an existing PNG bar or unavailable physical bar cannot be drawn again');
  assert.equal(h.calls.length,0,'layer selection must not create another render or scientific request');assert.deepEqual(h.inspect().state.object,before);
 }
});

test('focus and fit retain ROI, unsaved display, marks and history without provider calls',async()=>{
 const h=await harness();h.draw('rectangle');h.$('gamma').value='1.4';h.$('gamma').oninput();h.flush();
 const before=h.inspect(),calls=h.calls.length;h.$('viewport').width=1200;h.$('viewport').height=600;
 await h.click('focus-image');assert.equal(h.$('focus-image').attributes['aria-pressed'],'true');assert.ok(h.inspect().view.scale>2);
 await h.click('fit-canvas');assert.deepEqual(h.inspect().draft,before.draft);assert.deepEqual(h.inspect().state.object,before.state.object);assert.equal(h.$('gamma').value,'1.4');assert.equal(h.inspect().dirty,true);
 await h.click('focus-image');assert.equal(h.$('focus-image').attributes['aria-pressed'],'false');assert.deepEqual(h.inspect().view,before.view);assert.equal(h.calls.length,calls);
 await h.click('undo');assert.equal(Number(h.$('gamma').value),1);assert.deepEqual(h.inspect().draft,before.draft);
});

test('first-frame observation with no annotations field still dispatches one bounded save and retains reason on failure',async()=>{
 const initial=fixture();delete initial.object.annotations;
 const h=await harness(initial);h.draw('rectangle');h.$('roi-reason').value='Synthetic operator observation';h.$('roi-reason').oninput();h.failAction('Deliberate save not confirmed; query original request');
 await h.click('save-observation');await h.settle();
 assert.equal(h.calls.length,1,'absent annotation array must not fail before provider dispatch');
 assert.equal(h.calls[0].action,'mark');assert.equal(h.calls[0].params.note,'Synthetic operator observation');
 assert.equal(h.calls[0].params.status,'hypothesized');assert.equal(h.calls[0].params.presentation.layer,'experimental');
 assert.equal(h.$('roi-reason').value,'Synthetic operator observation','an unconfirmed save retains the typed reason');
});

test('display settings replace the evidence sidebar without losing the observation or display draft',async()=>{
 const h=await harness();await h.click('toggle-research');
 h.$('roi-reason').value='Still being written';h.$('roi-reason').oninput();h.$('gamma').value='1.4';h.$('gamma').oninput();
 const before=h.inspect();await h.click('toggle-settings');
 assert.equal(h.bodyClasses.has('research-open'),false);assert.equal(h.bodyClasses.has('properties-open'),true);assert.equal(h.$('research-panel').hidden,true);assert.equal(h.$('settings-panel').open,true);
 await h.click('toggle-research');assert.equal(h.bodyClasses.has('properties-open'),false);assert.equal(h.bodyClasses.has('research-open'),true);
 assert.equal(h.$('roi-reason').value,'Still being written');assert.equal(h.$('gamma').value,'1.4');assert.equal(h.inspect().dirty,true);assert.deepEqual(h.inspect().state.object,before.state.object);assert.equal(h.calls.length,0);
});


function handoffFixture(){
 const s=fixture();s.panel_id='c'.repeat(32);s.state_revision=1;
 s.frame_identity={frame_object_id:sourceId,frame_index:0};
 s.edit_state={draft_revision:0,dirty:false,gesture_active:false,annotation_edit:null};
 s.object.annotations=[{annotation_id:'saved-roi',kind:'rectangle',text:'ROI',note:'look here',status:'hypothesized',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[30,20,50,40]}}];
 return s;
}
function emptyRoiFixture(){const s=handoffFixture();s.object.annotations=[];return s;}
function roiStroke(h,mode,start,end){h.$('mode').value=mode;h.event('pointerdown',...start);h.event('pointermove',...end);h.event('pointerup',...end);h.flush();}
function savedRectangleFixture(){
 const s=handoffFixture();s.object.annotations=[{annotation_id:'roi-stable',kind:'rectangle',text:'ROI saved',note:'',color:'cyan',status:'hypothesized',purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated',presentation:{label:{visible:false}},anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[40,32,120,92]}}];return s;
}

function selectSavedRoi(h,annotationId='roi-stable'){
 h.$('existing').value=annotationId;h.$('existing').onchange();h.$('mode').value='select';h.flush();
}
function overlappingRoiFixture({label=false}={}){
 const initial=savedRectangleFixture(),other=copy(initial.object.annotations[0]);other.annotation_id='overlapping-roi';other.anchor.coordinates=[21,13,147,107];other.text='Other ROI';
 other.presentation={label:label?{text:'B label',visible:true,pinned:true,offset:[19,19],font_size:12}:{visible:false}};initial.object.annotations.push(other);return initial;
}

test('direct ROI: a verified new stroke returns to selection before another canvas click',async()=>{
 const h=await harness(emptyRoiFixture());roiStroke(h,'roi',[10.25,11.75],[44.625,45.125]);await h.finishRoi();await h.settle();
 assert.equal(h.$('mode').value,'select');const saved=h.server().object.annotations[0];assert.equal(h.inspect().selectedId,saved.annotation_id);assert.equal(h.inspect().roiCreationRecovery,null);assert.equal(h.calls.filter(call=>call.action==='mark').length,1);
});

test('direct ROI: canvas Delete retracts one saved ROI and a single undo restores its stable identity',async()=>{
 const h=await harness(savedRectangleFixture()),original=copy(h.server().object.annotations[0]);selectSavedRoi(h);h.$('canvas').focus();const undoBefore=h.inspect().undoCount;let prevented=0;
 h.key('Delete',{target:h.$('canvas'),preventDefault(){prevented++;}});await h.settle();await h.finish();
 assert.equal(prevented,1);assert.equal(h.server().object.annotations[0].status,'retracted');assert.equal(h.inspect().draft,null);assert.equal(h.inspect().selectedId,'');assert.equal(h.inspect().undoCount,undoBefore+1);
 assert.deepEqual(h.calls.map(call=>call.action),['edit']);assert.equal(h.calls[0].params.updates[0].annotation_id,original.annotation_id);
 await h.click('undo');await h.finish();assert.equal(h.server().object.annotations[0].status,original.status);assert.equal(h.server().object.annotations[0].annotation_id,original.annotation_id);assert.deepEqual(h.server().object.annotations[0].anchor,original.anchor);assert.equal(h.inspect().undoCount,undoBefore);assert.equal(h.calls.some(call=>call.action==='mark'||call.action==='fft'),false);
});

test('direct ROI: canvas Delete clears a temporary box locally and undo restores it without provider writes',async()=>{
 const h=await harness(emptyRoiFixture());roiStroke(h,'rectangle',[20,20],[100,80]);h.$('canvas').focus();const before=copy(h.inspect().draft),undoBefore=h.inspect().undoCount;let prevented=0;
 h.key('Delete',{target:h.$('canvas'),preventDefault(){prevented++;}});h.flush();await h.settle();assert.equal(prevented,1);assert.equal(h.inspect().draft,null);assert.equal(h.inspect().selectedId,'');assert.equal(h.inspect().undoCount,undoBefore+1);assert.equal(h.calls.length,0);
 await h.click('undo');assert.deepEqual(h.inspect().draft,before);assert.equal(h.calls.length,0);assert.equal(h.server().object.annotations.length,0);
});

test('direct ROI: Delete leaves text entry, noncanvas focus, modal help and an empty canvas untouched',async()=>{
 for(const target of ['INPUT','TEXTAREA','SELECT','contenteditable','noncanvas','help','empty']){
  const h=await harness(target==='empty'?emptyRoiFixture():savedRectangleFixture());if(target!=='empty')selectSavedRoi(h);
  let element=h.$('canvas');if(['INPUT','TEXTAREA','SELECT'].includes(target)){element=h.$('typing-control');element.tagName=target;element.value='Text stays editable';}
  if(target==='contenteditable'){element=h.$('editable-text');element.tagName='SPAN';element.isContentEditable=true;element.contentEditable='true';element.textContent='Editable body text';}
  if(target==='noncanvas'){element=h.$('fft');element.tagName='BUTTON';}
  if(target==='help')h.$('usage-dialog').open=true;element.focus();const before=h.inspect(),saved=h.server();let prevented=0;
  h.key('Delete',{target:element,preventDefault(){prevented++;}});await h.settle();await h.finish();
  assert.equal(prevented,0,target);assert.deepEqual(h.inspect().draft,before.draft,target);assert.equal(h.inspect().selectedId,before.selectedId,target);assert.deepEqual(h.server().object.annotations,saved.object.annotations,target);assert.equal(h.calls.length,0,target);
  if(['INPUT','TEXTAREA','SELECT'].includes(target))assert.equal(element.value,'Text stays editable');if(target==='contenteditable')assert.equal(element.textContent,'Editable body text');
 }
});

test('direct ROI: selected resize controls outrank overlapping bodies and labels without promoting the whole box',async()=>{
 for(const [handle,point]of [['nw',[20,20]],['n',[60,20]],['ne',[100,20]],['e',[100,50]],['se',[100,80]],['s',[60,80]],['sw',[20,80]],['w',[20,50]]]){
  const h=await harness(overlappingRoiFixture());selectSavedRoi(h);h.event('pointerdown',...point);assert.equal(h.inspect().selectedId,'roi-stable',handle);assert.equal(h.inspect().drag.kind,'edit',handle);assert.equal(h.inspect().drag.rectangle_handle,handle);h.event('pointercancel');h.flush();await h.finish();assert.equal(h.calls.length,0);
 }
 const labelled=await harness(overlappingRoiFixture({label:true}));selectSavedRoi(labelled);const label=labelled.layout().items.find(item=>item.id==='overlapping-roi').label;assert.equal(label.visible,true);assert.ok(20>=label.x&&20<=label.x+label.width&&20>=label.y&&20<=label.y+label.height,'the fixture label actually covers the selected NW handle');labelled.event('pointerdown',20,20);assert.equal(labelled.inspect().selectedId,'roi-stable');assert.equal(labelled.inspect().drag.kind,'edit');labelled.event('pointercancel');labelled.flush();
 const body=await harness(overlappingRoiFixture());selectSavedRoi(body);body.event('pointerdown',60,50);assert.equal(body.inspect().selectedId,'overlapping-roi','ordinary body picking still follows paint order');body.event('pointercancel');body.flush();assert.equal(body.calls.length,0);
});

test('direct ROI: many pointer moves form one undo step and Escape restores the selection preceding a new stroke',async()=>{
 const h=await harness(savedRectangleFixture()),original=copy(h.server().object.annotations[0].anchor.coordinates);selectSavedRoi(h);const undoBefore=h.inspect().undoCount;
 h.event('pointerdown',60,50);for(const point of [[62,52],[65,55],[68,58]])h.event('pointermove',...point);h.event('pointerup',70,60);h.flush();await h.settle();await h.finish();assert.equal(h.inspect().undoCount,undoBefore+1);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[50,42,130,102]);
 await h.click('undo');await h.finish();assert.equal(h.inspect().undoCount,undoBefore);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,original);
 const before=copy(h.inspect().draft),selectedId=h.inspect().selectedId,calls=h.calls.length;h.$('mode').value='rectangle';h.event('pointerdown',5,5);h.event('pointermove',15,15);h.key('Escape',{target:h.$('canvas')});h.flush();await h.finish();assert.equal(h.inspect().drag,null);assert.deepEqual(h.inspect().draft,before);assert.equal(h.inspect().selectedId,selectedId);assert.equal(h.inspect().undoCount,undoBefore);assert.equal(h.calls.length,calls);
});

test('direct ROI: undo keeps a still-bound ROI selection aligned without replacing an independently retained temporary box',async()=>{
 for(const independent of [false,true]){
  const h=await harness(savedRectangleFixture()),original=copy(h.server().object.annotations[0].anchor.coordinates);selectSavedRoi(h);h.event('pointerdown',60,50);h.event('pointerup',70,60);h.flush();await h.settle();await h.finish();const moved=copy(h.inspect().draft.coordinates);assert.deepEqual(moved,[50,42,130,102]);
  if(independent){h.$('existing').value='';h.$('existing').onchange();h.flush();assert.equal(h.inspect().selectedId,'');assert.deepEqual(h.inspect().draft.coordinates,moved);}
  await h.click('undo');await h.finish();assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,original);assert.deepEqual(h.inspect().draft.coordinates,independent?moved:original);
  assert.equal(h.server().object.annotations[0].annotation_id,'roi-stable');assert.equal(h.calls.some(call=>call.action==='mark'||call.action==='fft'),false);
 }
});

test('direct ROI: deletion refuses dirty, pending, unknown, unfinished and historical states without losing their selection',async()=>{
 for(const blocked of ['reason','fields','pending','unknown','gesture','historical']){
  const f=blocked==='historical'?windowActivationFixture():null,initial=f?f.source:savedRectangleFixture();if(f){initial.object.annotations=copy(savedRectangleFixture().object.annotations);initial.window_collection.windows[0].latest_observation_view_object_id='7'.repeat(32);}
  if(blocked==='pending')initial.pending_result={object_id:'c'.repeat(32),request_id:'keep-pending-result'};
  if(blocked==='unknown')initial.last_operation={state:'submitted',request_id:'keep-original-unknown'};
  const h=await harness(initial,f?{windowStates:[f.target]}:{});if(f)await h.finishWindows();selectSavedRoi(h);h.$('canvas').focus();
  if(blocked==='reason'){h.$('roi-reason').value='Keep unsaved observation';h.$('roi-reason').oninput();}
  if(blocked==='fields'){h.$('mark-text').value='Keep unsaved annotation label';h.$('mark-text').oninput();}
  if(blocked==='gesture'){h.event('pointerdown',60,50);h.event('pointermove',65,55);}
  await h.settle();const before=h.inspect(),saved=h.server(),calls=h.calls.length;let prevented=0;h.key('Delete',{target:h.$('canvas'),preventDefault(){prevented++;}});await h.settle();
  assert.equal(prevented,0,blocked);assert.equal(h.calls.length,calls,blocked);assert.equal(h.inspect().selectedId,before.selectedId,blocked);assert.deepEqual(h.inspect().draft,before.draft,blocked);assert.deepEqual(h.server().object.annotations,saved.object.annotations,blocked);assert.deepEqual(h.inspect().state.pending_result,before.state.pending_result,blocked);assert.deepEqual(h.inspect().state.last_operation,before.state.last_operation,blocked);
  if(blocked==='reason')assert.equal(h.$('roi-reason').value,'Keep unsaved observation');if(blocked==='fields')assert.equal(h.$('mark-text').value,'Keep unsaved annotation label');if(blocked==='gesture'){h.event('pointercancel');h.flush();}
 }
});

test('direct ROI: the explicit delete button uses the same saved-ROI gate and never deletes a selected peak',async()=>{
 const h=await harness(savedRectangleFixture());selectSavedRoi(h);h.$('delete-roi').focus();await h.click('delete-roi');await h.finish();assert.equal(h.server().object.annotations[0].status,'retracted');assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'edit');
 const peak=await harness(humanPointFixture());peak.$('existing').value='human-A';peak.$('existing').onchange();peak.$('canvas').focus();let prevented=0;peak.key('Delete',{target:peak.$('canvas'),preventDefault(){prevented++;}});await peak.settle();assert.equal(prevented,0);assert.equal(peak.calls.length,0);assert.equal(peak.server().object.annotations[0].status,'hypothesized');
});

test('direct ROI: a retracted ROI cannot be reselected for FFT and becomes selectable only after undo restores its same identity',async()=>{
 const retired=savedRectangleFixture();retired.object.annotations[0].status='retracted';const legacy=await harness(retired);
 selectSavedRoi(legacy);assert.equal(legacy.inspect().selectedId,'');assert.equal(legacy.inspect().draft,null);await legacy.click('fft');assert.equal(legacy.calls.length,0,'a hidden historical rectangle cannot become an FFT input through a forced dropdown change');
 const h=await harness(savedRectangleFixture()),original=copy(h.server().object.annotations[0]);selectSavedRoi(h);h.$('canvas').focus();h.key('Delete',{target:h.$('canvas')});await h.settle();await h.finish();assert.equal(h.server().object.annotations[0].status,'retracted');
 const option=()=>h.$('existing').children.find(value=>value.value===original.annotation_id);assert.equal(option().disabled,true);const count=h.calls.length;selectSavedRoi(h);assert.equal(h.inspect().selectedId,'');assert.equal(h.inspect().draft,null);await h.click('fft');assert.equal(h.calls.length,count);
 await h.click('undo');await h.finish();assert.equal(h.server().object.annotations[0].annotation_id,original.annotation_id);assert.equal(h.server().object.annotations[0].status,original.status);assert.deepEqual(h.server().object.annotations[0].anchor,original.anchor);assert.equal(option().disabled,false);selectSavedRoi(h);assert.equal(h.inspect().selectedId,original.annotation_id);assert.deepEqual(h.inspect().draft.coordinates,original.anchor.coordinates);assert.equal(h.calls.some(call=>call.action==='mark'||call.action==='fft'),false);
 const mixed=savedRectangleFixture(),active=copy(mixed.object.annotations[0]);mixed.object.annotations[0].status='retracted';active.annotation_id='active-roi';active.anchor.coordinates=[70,40,130,100];mixed.object.annotations.push(active);const preserving=await harness(mixed);selectSavedRoi(preserving,'active-roi');const savedSelection=copy(preserving.inspect().draft);selectSavedRoi(preserving);assert.equal(preserving.inspect().selectedId,'active-roi');assert.deepEqual(preserving.inspect().draft,savedSelection);assert.equal(preserving.calls.length,0,'refusing a withdrawn row must not discard an existing legal selection');
});

test('direct ROI: property retraction clears its still-bound selection but preserves a later independent temporary ROI',async()=>{
 const h=await harness(savedRectangleFixture());selectSavedRoi(h);h.$('status').value='retracted';h.$('status').oninput();await h.click('save-mark');await h.finish();
 assert.equal(h.server().object.annotations[0].status,'retracted');assert.equal(h.inspect().selectedId,'');assert.equal(h.inspect().draft,null);const count=h.calls.length;await h.click('fft');assert.equal(h.calls.length,count,'the retracted saved rectangle cannot remain an implicit FFT selection');assert.equal(h.calls[0].action,'edit');assert.equal(h.calls[0].params.updates[0].annotation_id,'roi-stable');
 const later=await harness(savedRectangleFixture());selectSavedRoi(later);let release;later.delayAction(new Promise(resolve=>{release=resolve;}));later.$('status').value='retracted';later.$('status').oninput();const saving=later.click('save-mark');await later.settle();
 roiStroke(later,'rectangle',[5,5],[15,15]);const temporary=copy(later.inspect().draft);assert.equal(later.inspect().selectedId,'');assert.deepEqual(temporary.coordinates,[25,17,35,27]);release();await saving;await later.finish();
 assert.equal(later.server().object.annotations[0].status,'retracted');assert.equal(later.inspect().selectedId,'');assert.deepEqual(later.inspect().draft,temporary,'a late retraction acknowledgement must preserve a new independent selection');await later.click('fft');const fft=later.calls.find(call=>call.action==='fft');assert.ok(fft);assert.deepEqual(fft.params.selection.coordinates,temporary.coordinates);assert.equal(later.calls.filter(call=>call.action==='edit').length,1);
});

test('ROI tool saves one stable rectangle with an empty reason and verifies it with two real state reads',async()=>{
 const h=await harness(emptyRoiFixture()),reads=h.getCalls.length;roiStroke(h,'roi',[10.25,11.75],[44.625,45.125]);await h.finishRoi();await h.settle();
 assert.equal(h.calls.length,1);const save=h.calls[0];assert.equal(save.action,'mark');assert.equal(save.params.note,'');assert.equal(save.params.purpose,'resumable_observation');assert.equal(save.params.selection_origin,'researcher');assert.match(save.params.annotation_id,/^[A-Za-z0-9_-]{1,64}$/);assert.deepEqual(save.params.selection.coordinates,[30.25,23.75,64.625,57.125]);
 assert.equal(h.getCalls.slice(reads).filter(url=>url==='/api/state').length,2);assert.equal(h.server().object.annotations[0].annotation_id,save.params.annotation_id);assert.deepEqual(h.inspect().draft.coordinates,save.params.selection.coordinates);assert.equal(h.inspect().roiCreationRecovery,null);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.some(call=>call.action==='fft'),false);
});
test('the explicit observation-reason save still refuses blank text for a temporary rectangle',async()=>{
 const h=await harness(emptyRoiFixture());roiStroke(h,'rectangle',[10,10],[40,35]);await h.click('save-observation');assert.equal(h.calls.length,0);assert.equal(h.server().object.annotations.length,0);assert.match(h.$('message').textContent,/填写观察理由/);
});
test('three ROI strokes create independent stable rectangles that remain individually selectable',async()=>{
 const h=await harness(emptyRoiFixture()),strokes=[[[5,5],[25,25]],[[45,8],[65,28]],[[85,45],[110,70]]];
 for(const [start,end]of strokes){roiStroke(h,'roi',start,end);await h.finishRoi();await h.settle();}
 const saved=h.server().object.annotations;assert.equal(saved.length,3);assert.equal(h.calls.filter(call=>call.action==='mark').length,3);assert.equal(new Set(saved.map(mark=>mark.annotation_id)).size,3);assert.deepEqual(saved.map(mark=>mark.anchor.coordinates),[[25,17,45,37],[65,20,85,40],[105,57,130,82]]);
 const count=h.calls.length;for(const mark of saved){h.$('existing').value=mark.annotation_id;h.$('existing').onchange();h.flush();assert.equal(h.$('mark-id').value,mark.annotation_id);assert.deepEqual(h.inspect().draft.coordinates,mark.anchor.coordinates);}assert.equal(h.calls.length,count);assert.equal(h.inspect().roiCreationRecovery,null);
});
test('historical FFT input keeps temporary exploration but refuses ROI creation, geometry edits and reason saves',async()=>{
 const f=windowActivationFixture();f.source.object.annotations=copy(savedRectangleFixture().object.annotations);f.source.window_collection.windows[0].latest_observation_view_object_id='7'.repeat(32);const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();assert.equal(h.$('view-latest-roi').hidden,false);
 roiStroke(h,'roi',[10,10],[40,40]);await h.finishRoi();assert.equal(h.calls.length,0);assert.match(h.$('message').textContent,/查看最新 ROI/);
 h.$('mode').value='select';h.event('pointerdown',60,50);h.event('pointerup',70,60);h.flush();assert.equal(h.calls.length,0);assert.match(h.$('message').textContent,/查看最新 ROI/);
 roiStroke(h,'rectangle',[5,5],[15,15]);assert.deepEqual(h.inspect().draft.coordinates,[25,17,35,27]);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,0);
 h.$('existing').value='roi-stable';h.$('existing').onchange();h.$('roi-reason').value='Do not overwrite a later ROI revision';h.$('roi-reason').oninput();await h.click('save-observation');assert.equal(h.calls.length,0);assert.match(h.$('message').textContent,/查看最新 ROI/);assert.equal(h.$('roi-reason').value,'Do not overwrite a later ROI revision');
});
test('latest-ROI navigation explicitly opens its saved revision through existing history without computing FFT',async()=>{
 const f=windowActivationFixture(),latestId='7'.repeat(32);f.source.window_collection.windows[0].latest_observation_view_object_id=latestId;const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();
 const showSaved=(object)=>current=>{current.object=copy(object);current.window_collection.windows[0].object_id=object.object_id;current.window_collection.revision++;current.state_revision++;current.edit_state={...current.edit_state,draft_revision:current.edit_state.draft_revision+1,base_object_id:object.object_id};delete current.window_collection.windows[0].view_context;return current;};
 h.actionResult(showSaved({...copy(f.source.object),object_id:latestId}));await h.click('view-latest-roi');assert.equal(h.inspect().state.object.object_id,latestId);assert.equal(h.calls.at(-1).action,'show');assert.equal(h.calls.at(-1).params.object_id,latestId);assert.equal(h.calls.some(call=>call.action==='fft'),false);assert.equal(h.$('view-latest-roi').hidden,true);assert.equal(h.$('view-back').disabled,false);
 h.actionResult(showSaved(f.source.object));await h.click('view-back');assert.equal(h.calls.at(-1).params.object_id,f.source.object.object_id);assert.equal(h.inspect().state.object.object_id,f.source.object.object_id);assert.equal(h.$('view-forward').disabled,false);assert.equal(h.$('view-latest-roi').hidden,false);assert.equal(h.calls.some(call=>['fft','preview'].includes(call.action)),false);
});
test('latest ROI with a moved stable annotation keeps an older floating selection explicitly temporary until the researcher changes it',async()=>{
 const f=windowActivationFixture(),latestId='7'.repeat(32),original=copy(f.source.selection.coordinates),moved=[75.2,25.5,100.7,70.1],annotationId='same-roi-1';
 const roi={annotation_id:annotationId,kind:'rectangle',text:'ROI 1',note:'Original region',status:'hypothesized',purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated',anchor:{coordinate_space:'source_pixels',source_object_id:sourceId,coordinates:copy(original)}};
 f.source.object.annotations=[roi];f.source.window_collection.windows[0].view_context.selected_annotation_id=annotationId;f.source.window_collection.windows[0].latest_observation_view_object_id=latestId;const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();assert.equal(h.$('existing').value,annotationId);
 h.actionResult(current=>{current.object={...copy(current.object),object_id:latestId,annotations:[{...copy(roi),anchor:{...copy(roi.anchor),coordinates:copy(moved)}}]};current.selection=null;current.window_collection.windows[0].object_id=latestId;delete current.window_collection.windows[0].view_context;current.window_collection.revision++;current.state_revision++;current.edit_state={...current.edit_state,draft_revision:current.edit_state.draft_revision+1,selection:null,annotation_edit:null,base_object_id:latestId};return current;});
 await h.click('view-latest-roi');assert.equal(h.inspect().state.object.object_id,latestId);assert.deepEqual(h.inspect().draft.coordinates,original);assert.equal(h.$('existing').value,'');assert.match(h.$('current-roi').textContent,/临时 ROI/);assert.doesNotMatch(h.$('current-roi').textContent,/当前 ROI：ROI 1/);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,moved);assert.deepEqual(h.calls.map(call=>call.action),['show']);
 await h.click('fft');const fft=h.calls.find(call=>call.action==='fft');assert.ok(fft,'only an explicit FFT click submits the retained temporary selection');assert.deepEqual(fft.params.selection.coordinates,original);assert.deepEqual(coordinates.selectionRectangle(fft.params.selection),[30,20,62,49]);assert.notDeepEqual(coordinates.selectionRectangle(fft.params.selection),[75,25,101,71]);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,moved);assert.deepEqual(f.source.object.annotations[0].anchor.coordinates,original);
});
test('saved rectangle interior movement clamps the whole ROI to the exact source support',async()=>{
 const h=await harness(savedRectangleFixture());h.$('mode').value='select';h.event('pointerdown',60,50);h.event('pointerup',1000,-1000);h.flush();await h.settle();await h.finish();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'edit');assert.equal(h.calls[0].params.updates[0].annotation_id,'roi-stable');assert.deepEqual(h.calls[0].params.updates[0].coordinates,[68,12,148,72]);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,[68,12,148,72]);assert.equal(h.server().object.annotations[0].annotation_id,'roi-stable');assert.equal(h.calls.some(call=>call.action==='mark'||call.action==='fft'),false);
});
for(const [handle,start,end,expected]of [
 ['nw',[20,20],[-100,-100],[20,12,120,92]],['n',[60,20],[60,-100],[40,12,120,92]],['ne',[100,20],[300,-100],[40,12,148,92]],['e',[100,50],[300,50],[40,32,148,92]],
 ['se',[100,80],[300,300],[40,32,148,108]],['s',[60,80],[60,300],[40,32,120,108]],['sw',[20,80],[-100,300],[20,32,120,108]],['w',[20,50],[-100,50],[20,32,120,92]]
])test(`saved rectangle ${handle} handle resizes only its intended edges and clamps finite coordinates`,async()=>{
 const h=await harness(savedRectangleFixture());h.$('mode').value='select';h.event('pointerdown',...start);h.event('pointerup',...end);h.flush();await h.settle();await h.finish();assert.equal(h.calls.length,1);const update=h.calls[0].params.updates[0];assert.equal(update.annotation_id,'roi-stable');assert.deepEqual(update.coordinates,expected);assert.ok(update.coordinates.every(Number.isFinite));assert.ok(update.coordinates[0]<update.coordinates[2]&&update.coordinates[1]<update.coordinates[3]);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,expected);
});
for(const mode of ['rectangle','select'])test(`legacy ${mode} drawing remains a temporary rectangle that can move and resize without provider writes`,async()=>{
 const h=await harness(emptyRoiFixture());roiStroke(h,mode,[20,20],[100,80]);assert.deepEqual(h.inspect().draft.coordinates,[40,32,120,92]);h.$('mode').value='select';h.event('pointerdown',60,50);h.event('pointerup',65,55);h.flush();assert.deepEqual(h.inspect().draft.coordinates,[45,37,125,97]);
 h.event('pointerdown',105,55);h.event('pointerup',1000,55);h.flush();await h.settle();assert.deepEqual(h.inspect().draft.coordinates,[45,37,148,97]);assert.equal(h.calls.length,0);assert.equal(h.server().object.annotations.length,0);assert.equal(h.inspect().dirty,false);assert.equal(h.inspect().roiCreationRecovery,null);
});
for(const end of [[20.25,20.75],[20.25,60.5]])test(`zero-area ROI ending at ${end.join(',')} does not create a scientific annotation`,async()=>{
 const h=await harness(emptyRoiFixture());roiStroke(h,'roi',[20.25,20.75],end);await h.finishRoi();await h.settle();assert.equal(h.calls.length,0);assert.equal(h.server().object.annotations.length,0);assert.equal(h.inspect().roiCreationRecovery,null);
});
test('new strokes and FFT stay blocked throughout delayed ROI submission and both-readback verification',async()=>{
 const h=await harness(emptyRoiFixture());let submit,read;h.delayAction(new Promise(resolve=>{submit=resolve;}));h.delayState(new Promise(resolve=>{read=resolve;}));const reads=h.getCalls.length;
 roiStroke(h,'roi',[10.25,11.75],[44.625,45.125]);await h.settle();assert.equal(h.calls.length,1);assert.equal(h.server().object.annotations.length,0);const exact=copy(h.inspect().draft.coordinates);
 roiStroke(h,'roi',[70,10],[110,65]);await h.click('fft');assert.equal(h.inspect().drag,null);assert.deepEqual(h.inspect().draft.coordinates,exact);assert.equal(h.calls.length,1);
 submit();await h.settle();assert.equal(h.server().object.annotations.length,1);assert.equal(h.inspect().observationSavePhase,'verifying');roiStroke(h,'roi',[75,12],[115,75]);await h.click('fft');assert.deepEqual(h.inspect().draft.coordinates,exact);assert.equal(h.calls.length,1);
 read();await h.finishRoi();await h.settle();assert.equal(h.getCalls.slice(reads).filter(url=>url==='/api/state').length,2);assert.equal(h.calls.filter(call=>call.action==='mark').length,1);assert.equal(h.calls.some(call=>call.action==='fft'),false);assert.equal(h.inspect().roiCreationRecovery,null);
});
test('ROI readback failure retains the exact rectangle and only an explicit recovery can finish verification',async()=>{
 const h=await harness(emptyRoiFixture());h.failStateRead();roiStroke(h,'roi',[10.25,11.75],[44.625,45.125]);await h.finishRoi();await h.settle();const expected=copy(h.calls[0].params.selection.coordinates),originalId=h.calls[0].params.annotation_id;
 assert.equal(h.calls.length,1);assert.equal(h.server().object.annotations.length,1);assert.deepEqual(h.inspect().draft.coordinates,expected);assert.deepEqual(h.inspect().roiCreationRecovery.coordinates,expected);assert.equal(h.inspect().roiCreationRecovery.annotation_id,originalId);assert.equal(h.inspect().dirty,true);
 roiStroke(h,'roi',[75,12],[115,75]);await h.click('fft');await h.settle();assert.equal(h.calls.length,1);assert.deepEqual(h.inspect().draft.coordinates,expected);
 await h.click('recover');await h.finishRoi();await h.settle();assert.equal(h.calls.filter(call=>call.action==='mark').length,1);assert.equal(h.calls.some(call=>call.action==='fft'),false);assert.equal(h.server().object.annotations[0].annotation_id,originalId);assert.deepEqual(h.inspect().draft.coordinates,expected);assert.equal(h.inspect().roiCreationRecovery,null);assert.equal(h.inspect().dirty,false);
});
test('an unknown ROI save preserves stable intent and queries only its original request instead of replaying mark',async()=>{
 const h=await harness(emptyRoiFixture());h.failAction('Synthetic ROI reply lost. Original request_id=roi-original-request; query it');roiStroke(h,'roi',[10.25,11.75],[44.625,45.125]);await h.finishRoi();await h.settle();const submitted=h.calls[0],recovery=h.inspect().roiCreationRecovery,expected=copy(submitted.params.selection.coordinates);
 assert.equal(h.calls.length,1);assert.equal(recovery.request_id,'roi-original-request');assert.equal(recovery.annotation_id,submitted.params.annotation_id);assert.deepEqual(recovery.coordinates,expected);assert.deepEqual(h.inspect().draft.coordinates,expected);assert.equal(h.inspect().dirty,true);
 roiStroke(h,'roi',[75,12],[115,75]);await h.click('fft');await h.settle();assert.equal(h.calls.length,1);assert.deepEqual(h.inspect().draft.coordinates,expected);
 const saved=h.server(),{panel:unusedPanel,...anchor}=submitted.params.selection;saved.object.object_id='d'.repeat(32);saved.object.request_id='roi-original-request';saved.object.annotations=[{annotation_id:submitted.params.annotation_id,kind:'rectangle',anchor:copy(anchor),text:submitted.params.text,color:submitted.params.color,status:'hypothesized',note:'',purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated'}];saved.selection=copy(submitted.params.selection);saved.edit_state={...saved.edit_state,dirty:false,gesture_active:false,annotation_edit:null};h.actionResult(saved);h.recoverResponse({action:'recover',state:'completed',object_id:saved.object.object_id,request_id:'roi-original-request',annotation_ids:[submitted.params.annotation_id]});
 const reads=h.getCalls.length;await h.click('recover');await h.finishRoi();await h.settle();assert.equal(h.calls.find(call=>call.action==='recover').params.request_id,'roi-original-request');assert.equal(h.calls.filter(call=>call.action==='mark').length,1);assert.equal(h.calls.filter(call=>call.action==='recover').length,1);assert.equal(h.calls.some(call=>call.action==='fft'),false);assert.equal(h.getCalls.slice(reads).filter(url=>url==='/api/state').length,2);assert.equal(h.server().object.annotations[0].annotation_id,submitted.params.annotation_id);assert.deepEqual(h.inspect().draft.coordinates,expected);assert.equal(h.inspect().roiCreationRecovery,null);
});
test('not-submitted recovery leaves ROI temporary and a later explicit save creates the observation',async()=>{
 const h=await harness(emptyRoiFixture());h.failAction('Original request_id=roi-not-submitted; query it');roiStroke(h,'roi',[10.25,11.75],[44.625,45.125]);await h.finishRoi();await h.settle();const geometry=copy(h.inspect().draft.coordinates);assert.ok(h.inspect().roiCreationRecovery);unsubmittedRecoveryReply(h,'roi-not-submitted');const reads=h.getCalls.length;await h.click('recover');await h.finishRoi();await h.settle();
 assert.equal(h.inspect().autoFailed,false);assert.equal(h.inspect().roiCreationRecovery,null);assert.deepEqual(h.inspect().draft.coordinates,geometry);assert.equal(h.server().object.annotations.length,0);assert.equal(h.calls.filter(c=>c.action==='mark').length,1);assert.equal(h.getCalls.slice(reads).filter(url=>url==='/api/state').length,0,'not-submitted is not a saved ROI needing a fabricated readback');assert.match(h.$('current-roi').textContent,/临时/);
 await h.click('save-mark');await h.finishRoi();await h.settle();assert.equal(h.calls.filter(c=>c.action==='mark').length,2);assert.equal(h.server().object.annotations.length,1);assert.deepEqual(h.server().object.annotations[0].anchor.coordinates,geometry);assert.equal(h.server().object.annotations[0].purpose,'resumable_observation');assert.equal(h.calls.some(c=>c.action==='fft'),false);
});

test('Agent handoff confirms its draft delivery and rereads current state without science',async()=>{
 const h=await harness(handoffFixture()),reads=h.getCalls.length,posts=h.draftCalls.length;
 await h.click('agent-continue');
 assert.equal(h.$('agent-handoff-dialog').open,true,String(h.$('message').textContent));
 assert.ok(h.draftCalls.length>posts,'Explicit current handoff acknowledgement is required');
 assert.equal(h.draftCalls.at(-1).params.confirm_persistence,true);
 assert.ok(h.getCalls.slice(reads).includes('/api/state'),'Old browser snapshot is not a fresh handoff');
 assert.deepEqual(h.calls,[]);assert.match(h.$('agent-prompt').value,/image_panel_current/);
});

test('failed draft delivery cannot silently produce a continuation prompt; explicit retry can',async()=>{
 const h=await harness(handoffFixture()),reads=h.getCalls.length;h.failDraft();
 await h.click('agent-continue');
 assert.notEqual(h.$('agent-handoff-dialog').open,true);assert.match(h.$('message').textContent,/交接.*保存|保存.*确认/);
 assert.deepEqual(h.getCalls.slice(reads),[]);assert.deepEqual(h.calls,[]);
 await h.click('agent-continue');assert.equal(h.$('agent-handoff-dialog').open,true,String(h.$('message').textContent));assert.deepEqual(h.calls,[]);
});

test('result queued after last browser load blocks handoff instead of using stale local readiness',async()=>{
 const h=await harness(handoffFixture()),server=h.server();server.pending_result={object_id:'d'.repeat(32),request_id:'already-computed'};h.setServer(server);
 await h.click('agent-continue');assert.notEqual(h.$('agent-handoff-dialog').open,true);
 assert.match(h.$('message').textContent,/待接纳/);assert.equal(h.server().pending_result.request_id,'already-computed');assert.deepEqual(h.calls,[]);
});

test('changed current view is refused during handoff, not silently adopted',async()=>{
 const h=await harness(handoffFixture()),server=h.server();server.object.object_id='d'.repeat(32);h.setServer(server);
 await h.click('agent-continue');assert.notEqual(h.$('agent-handoff-dialog').open,true);
 assert.match(h.$('message').textContent,/改变|变化/);assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.calls,[]);
});


test('measurement selection during a delayed handoff read invalidates the old prompt and publishes new selection',async()=>{
 const s=handoffFixture();s.object.annotations.push({annotation_id:'point-b',kind:'point',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[70,60]}});
 const h=await harness(s);let release;h.delayState(new Promise(resolve=>release=resolve));
 const handing=h.click('agent-continue');await h.settle();
 const revision=h.inspect().draftRevision;
 h.selectMeasurement({object_id:'e'.repeat(32),annotation_id:'point-b',same_grid:true,visible_in_current_view:true,annotation_matches_current:true});
 await h.settle();release();await handing;
 assert.notEqual(h.$('agent-handoff-dialog').open,true);assert.match(h.$('message').textContent,/版本已改变/);
 assert.ok(h.inspect().draftRevision>revision);assert.deepEqual(h.server().selection.coordinates,[70,60]);
 assert.deepEqual(h.calls,[]);
});

test('an action with lost response during a delayed handoff read invalidates its earlier ready snapshot',async()=>{
 const h=await harness(handoffFixture());h.draw('rectangle');await h.settle();
 let release;h.delayState(new Promise(resolve=>release=resolve));
 const handing=h.click('agent-continue');await h.settle();
 h.failAction();await h.click('fft');assert.equal(h.inspect().busy,false);
 release();await handing;
 assert.notEqual(h.$('agent-handoff-dialog').open,true);assert.match(h.$('message').textContent,/版本已改变/);
 assert.equal(h.server().last_operation.request_id,'controlled-lost-request');assert.equal(h.calls.length,1);
});

test('selection changed while draft confirmation is in flight requires a new handoff',async()=>{
 const h=await harness(handoffFixture());let release;h.delayDraft(new Promise(resolve=>release=resolve));
 const handing=h.click('agent-continue');await h.settle();h.draw('rectangle');release();await handing;
 assert.notEqual(h.$('agent-handoff-dialog').open,true);assert.match(h.$('message').textContent,/版本已改变/);assert.deepEqual(h.calls,[]);
});


test('a stale AI view read cannot clear a human ROI drawn while refresh was waiting',async()=>{
 const h=await harness(handoffFixture()),next=h.server();next.object.object_id='d'.repeat(32);
 next.object.panels=[{domain:'frequency',source_object_id:'e'.repeat(32),fft_shape_yx:[32,32],image_rect_xyxy:[0,0,32,32]}];next.selection=null;next.state_revision=2;h.setServer(next);
 let release;h.delayState(new Promise(resolve=>release=resolve));const refreshing=h.click('reload');await h.settle();
 h.draw('rectangle');const human=h.inspect();assert.ok(human.draft);assert.equal(human.dirty,false);
 release();await refreshing;
 assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.inspect().draft,human.draft);
 assert.equal(h.inspect().pending.object.object_id,next.object.object_id,'late view is retained for explicit acceptance');
});


for(const button of ['accept-agent-result','discard-local','discard-draft'])test(`${button} cannot authorize overwriting edits made during its state read`,async()=>{
 const h=await harness(handoffFixture());
 if(button==='accept-agent-result'){
  h.$('gamma').value='1.9';h.$('gamma').oninput();const next=h.server();next.object.object_id='d'.repeat(32);next.state_revision=2;h.setServer(next);
  await h.click('reload');assert.ok(h.inspect().pending);h.$('gamma').value='1';h.$('gamma').oninput();await h.settle();
 }
 let release;h.delayState(new Promise(resolve=>release=resolve));const reading=h.click(button);await h.settle();
 h.draw('rectangle');const human=h.inspect().draft;release();await reading;
 assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.inspect().draft,human);assert.deepEqual(h.calls,[]);
 assert.match(h.$('message').textContent,/读取期间有新操作/);
 if(button==='accept-agent-result')assert.ok(h.inspect().pending,'explicit acceptance must not clear the notice before a successful read');
});

test('discarding toward a cached pending view stops after a newer edit during image decoding',async()=>{
 const h=await harness(handoffFixture());h.$('gamma').value='1.9';h.$('gamma').oninput();
 const next=h.server();next.object.object_id='d'.repeat(32);next.object.panels=[{domain:'frequency',source_object_id:'e'.repeat(32),fft_shape_yx:[32,32],image_rect_xyxy:[0,0,32,32]}];next.selection=null;next.state_revision=2;h.setServer(next);await h.click('reload');
 let release;h.delayDecode(new Promise(resolve=>release=resolve));const reading=h.click('discard-draft');await h.settle();h.draw('rectangle');const human=h.inspect().draft;release();await reading;
 assert.equal(h.inspect().state.object.object_id,viewId);assert.deepEqual(h.inspect().draft,human);assert.ok(h.inspect().pending);assert.deepEqual(h.calls,[]);
});


test('cancelled mark selection invalidates an in-flight handoff and publishes its retained selection',async()=>{
 for(const ending of ['pointercancel','lostpointercapture']){
  const s=handoffFixture();s.object.annotations.push({annotation_id:'point-b',kind:'point',anchor:{source_object_id:sourceId,coordinate_space:'source_pixels',coordinates:[70,60]}});
  const h=await harness(s);let release;h.delayState(new Promise(resolve=>release=resolve));const handing=h.click('agent-continue');await h.settle();
  h.$('mode').value='select';h.event('pointerdown',50,48);h.event(ending,50,48);await h.settle();release();await handing;
  assert.notEqual(h.$('agent-handoff-dialog').open,true);assert.match(h.$('message').textContent,/版本已改变/);
  assert.deepEqual(h.inspect().draft.coordinates,[70,60]);assert.deepEqual(h.server().selection.coordinates,[70,60]);assert.deepEqual(h.calls,[]);
 }
});

test('resumable save declares stable researcher intent and reads actual handoff before readiness',async()=>{
 const s=handoffFixture();s.object.annotations=[];const h=await harness(s);h.draw('rectangle');
 h.$('roi-reason').value='  Inspect supplied texture, physical cause unknown  ';h.$('roi-reason').oninput();const reads=h.getCalls.length;
 await h.click('save-observation');await h.settle();
 assert.equal(h.calls.length,1);const p=h.calls[0].params;
 assert.match(p.annotation_id,/^[A-Za-z0-9_-]{1,64}$/);assert.equal(p.purpose,'resumable_observation');assert.equal(p.selection_origin,'researcher');assert.equal(p.note,'  Inspect supplied texture, physical cause unknown  ');
 assert.ok(h.getCalls.slice(reads).filter(p=>p==='/api/state').length>=2,'Saved annotation and clean current handoff both need real readback');
 assert.match(h.$('message').textContent,/已保存并读回可接续.*调用者声明.*不确认物相/);assert.equal(h.inspect().dirty,false);
});
test('a new ROI observation is verified under an existing pending result without accepting that result',async()=>{
 const s=handoffFixture();s.object.annotations=[];s.pending_result={object_id:'d'.repeat(32),request_id:'older-saved-result'};const h=await harness(s);h.draw('rectangle');h.$('roi-reason').value='Save this observation before dealing with the pending result';h.$('roi-reason').oninput();const reads=h.getCalls.length;
 await h.click('save-observation');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'mark');assert.deepEqual(h.server().pending_result,s.pending_result);assert.deepEqual(h.inspect().state.pending_result,s.pending_result);assert.equal(h.inspect().dirty,false);
 assert.equal(h.getCalls.slice(reads).filter(url=>url==='/api/state').length,2);assert.equal(h.draftCalls.at(-1).params.confirm_persistence,true);assert.equal(h.$('agent-continue').disabled,true);assert.match(h.$('message').textContent,/已保存并读回核对.*待查看结果.*交给 Agent/);assert.equal(JSON.parse(h.$('performance-data').textContent).observation_save.outcome,'saved_handoff_blocked');
});
test('updating a saved observation reason under pending keeps its identity and performs both readbacks',async()=>{
 const s=handoffFixture(),mark=s.object.annotations[0];Object.assign(mark,{purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated'});s.selection={...copy(mark.anchor),kind:'rectangle',panel:copy(panel)};s.pending_result={object_id:'d'.repeat(32),request_id:'older-saved-result'};
 const h=await harness(s);h.$('existing').value=mark.annotation_id;h.$('existing').onchange();h.$('roi-reason').value='Updated reason, original pending still needs review';h.$('roi-reason').oninput();const saved=h.server();saved.object.object_id='e'.repeat(32);saved.object.annotations[0].note=h.$('roi-reason').value;h.actionResult(saved);const reads=h.getCalls.length;
 await h.click('save-observation');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'edit');assert.equal(h.calls[0].params.updates[0].annotation_id,mark.annotation_id);assert.equal(h.inspect().state.object.annotations[0].annotation_id,mark.annotation_id);assert.equal(h.inspect().state.object.annotations[0].note,'Updated reason, original pending still needs review');assert.equal(h.inspect().dirty,false);
 assert.deepEqual(h.inspect().state.pending_result,s.pending_result);assert.equal(h.getCalls.slice(reads).filter(url=>url==='/api/state').length,2);assert.equal(h.$('agent-continue').disabled,true);assert.match(h.$('message').textContent,/已保存并读回核对.*待查看结果/);
});
test('a newer reason during pending observation readback remains a draft without replaying the save',async()=>{
 for(const updateExisting of [false,true]){
  const s=handoffFixture(),mark=s.object.annotations[0];if(updateExisting){Object.assign(mark,{purpose:'resumable_observation',observation_contract_version:1,selection_origin:'researcher',selection_origin_basis:'caller_reported_not_authenticated'});s.selection={...copy(mark.anchor),kind:'rectangle',panel:copy(panel)};}else s.object.annotations=[];s.pending_result={object_id:'d'.repeat(32),request_id:'older-saved-result'};const h=await harness(s);if(updateExisting){h.$('existing').value=mark.annotation_id;h.$('existing').onchange();}else h.draw('rectangle');h.$('roi-reason').value='Submitted while pending';h.$('roi-reason').oninput();if(updateExisting){const saved=h.server();saved.object.object_id='e'.repeat(32);saved.object.annotations[0].note='Submitted while pending';h.actionResult(saved);}let release;h.delayState(new Promise(resolve=>{release=resolve;}));
  const saving=h.click('save-observation');await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,updateExisting?'edit':'mark');h.$('roi-reason').value='Newer reason must remain local';h.$('roi-reason').oninput();release();await saving;await h.settle();assert.equal(h.$('roi-reason').value,'Newer reason must remain local');assert.equal(h.inspect().dirty,true);assert.equal(h.calls.length,1);assert.deepEqual(h.inspect().state.pending_result,s.pending_result);assert.equal(h.server().object.annotations[0].note,'Submitted while pending');assert.match(h.$('message').textContent,/新编辑.*保留新草稿/);
 }
});

test('observation save confirms coalesced handoff persistence and renders the final readback without reload',async()=>{
 const s=handoffFixture();s.object.annotations=[];const h=await harness(s);h.coalesceDrafts();h.draw('rectangle');
 h.$('roi-reason').value='Saved with actual handoff acknowledgement';h.$('roi-reason').oninput();
 await h.click('save-observation');await h.settle();
 assert.equal(h.calls.length,1);assert.equal(h.draftCalls.at(-1).params.confirm_persistence,true);
 assert.equal(h.server().draft_persistence.pending,false);assert.equal(h.inspect().state.draft_persistence.pending,false);
 assert.equal(h.$('agent-continue').disabled,false);assert.match(h.$('message').textContent,/已保存并读回可接续/);
 assert.match(h.$('research-count').textContent,/1 处已保存/);
 const trace=JSON.parse(h.$('performance-data').textContent).observation_save;
 assert.equal(trace.outcome,'ready');assert.ok(trace.elapsed_ms.readback_2_end>=trace.elapsed_ms.readback_2_start);
 assert.ok(trace.elapsed_ms.final_ui>=trace.elapsed_ms.readback_2_end);
});

test('saved object awaiting readback is distinguished from submission and keeps reason locked until verification',async()=>{
 const s=handoffFixture();s.object.annotations=[];const h=await harness(s);h.draw('rectangle');
 h.$('roi-reason').value='Retain until checked';h.$('roi-reason').oninput();let submit,read;
 h.delayAction(new Promise(resolve=>submit=resolve));h.delayState(new Promise(resolve=>read=resolve));
 const saving=h.click('save-observation');await h.settle();
 assert.match(h.$('observation-draft-state').textContent,/正在提交/);assert.equal(h.server().object.annotations.length,0);
 submit();await h.settle();assert.equal(h.server().object.annotations.length,1);
 assert.match(h.$('observation-draft-state').textContent,/对象已保存.*核对交接/);
 assert.equal(h.$('roi-reason').disabled,true);assert.equal(h.$('roi-reason').value,'Retain until checked');assert.equal(h.$('agent-continue').disabled,true);
 read();await saving;assert.equal(h.$('roi-reason').disabled,false);assert.equal(h.$('agent-continue').disabled,false);
});

test('pending saved result with no draft never asks for an imaginary discard or invents Agent provenance',async()=>{
 const s=handoffFixture();s.pending_result={object_id:'d'.repeat(32),request_id:'agent-word-in-id-is-not-provenance'};const h=await harness(s);
 assert.equal(h.$('pending-result').hidden,false);assert.equal(h.$('discard-draft').hidden,true);
 assert.equal(h.$('accept-agent-result').disabled,false);assert.match(h.$('pending-message').textContent,/有新结果等待查看/);
 assert.doesNotMatch(h.$('pending-message').textContent,/草稿|Agent/);assert.equal(h.$('accept-agent-result').textContent,'查看保存结果');
 h.$('gamma').value='1.8';h.$('gamma').oninput();assert.equal(h.$('discard-draft').hidden,false);assert.equal(h.$('accept-agent-result').disabled,true);
 assert.match(h.$('pending-message').textContent,/保存、撤销或明确放弃/);
 h.$('gamma').value='1';h.$('gamma').oninput();assert.equal(h.$('discard-draft').hidden,true);assert.equal(h.$('accept-agent-result').disabled,false);
 assert.deepEqual(h.calls,[]);assert.deepEqual(h.server().pending_result,s.pending_result);
});

test('pending result cannot be accepted during a gesture and an orphaned draft still offers explicit discard',async()=>{
 const s=handoffFixture();s.pending_result={object_id:'d'.repeat(32),request_id:'saved-result'};const h=await harness(s);
 h.$('mode').value='rectangle';h.event('pointerdown',10,10);h.flush();assert.equal(h.$('accept-agent-result').disabled,true);
 assert.equal(h.$('discard-draft').hidden,true);assert.match(h.$('pending-message').textContent,/结束当前手势/);
 h.event('pointercancel',10,10);h.flush();assert.equal(h.$('accept-agent-result').disabled,false);assert.deepEqual(h.calls,[]);
 s.edit_state.dirty=true;const orphan=await harness(s);assert.equal(orphan.$('discard-draft').hidden,false);assert.equal(orphan.$('accept-agent-result').disabled,true);
});

test('resumable oversized Unicode draft is retained verbatim with no provider dispatch',async()=>{
 const h=await harness(handoffFixture());h.draw('rectangle');const note='😀'.repeat(501);
 h.$('roi-reason').value=note;h.$('roi-reason').oninput();await h.click('save-observation');
 assert.equal(h.calls.length,0);assert.equal(h.$('roi-reason').value,note);assert.equal(h.inspect().dirty,true);
 assert.match(h.$('message').textContent,/note: actual_length=1002; limit=1000 UTF-16.*no truncation/);
});

test('a later reason edit during observation readback cannot be cleared by the old save',async()=>{
 const s=handoffFixture();s.object.annotations=[];const h=await harness(s);h.draw('rectangle');
 h.$('roi-reason').value='Submitted reason';h.$('roi-reason').oninput();let release;h.delayState(new Promise(resolve=>release=resolve));
 const saving=h.click('save-observation');await h.settle();assert.equal(h.calls.length,1);
 h.$('roi-reason').value='Newer reason during readback';h.$('roi-reason').oninput();release();await saving;await h.settle();
 assert.equal(h.$('roi-reason').value,'Newer reason during readback');assert.equal(h.inspect().dirty,true);assert.equal(h.calls.length,1);
 assert.match(h.$('message').textContent,/新编辑.*保留新草稿/);
});

test('changed calibration at save acknowledgement preserves the reason and refuses old readiness',async()=>{
 const s=handoffFixture();s.object.annotations=[];const h=await harness(s);h.draw('rectangle');
 const changed=copy(s);changed.object.xy_calibration={calibration_id:'e'.repeat(32),revision:1,status:'active',coordinate_domain:'real_space',xy_scale:{x:.1,y:.1,unit:'nm'}};h.actionResult(changed);
 h.$('roi-reason').value='Retain on changed calibration';h.$('roi-reason').oninput();await h.click('save-observation');await h.settle();
 assert.equal(h.$('roi-reason').value,'Retain on changed calibration');assert.equal(h.inspect().dirty,true);assert.match(h.$('message').textContent,/标定依赖已改变.*草稿保留/);
 assert.equal(h.calls.length,1);
});

test('new workspace parks reason and display edits across window activation without user Save or recomputation',async()=>{
 const f=windowActivationFixture();f.source.workspace_analysis={schema_version:1,status:'clean',working_revision:1,save_id:'saved-a',saved_revision:1,recovery_available:false,unresolved_request_id:null};
 const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();
 h.$('roi-reason').value='Uncommitted source observation';h.$('roi-reason').oninput();h.$('gamma').value='1.4';h.$('gamma').oninput();
 const sourceObject=h.inspect().state.object.object_id;await h.activateWindow(f.targetWindow);assert.equal(h.inspect().state.object.object_id,f.target.object.object_id);assert.equal(h.$('roi-reason').value,'');
 await h.activateWindow(f.sourceWindow);assert.equal(h.inspect().state.object.object_id,sourceObject);assert.equal(h.$('roi-reason').value,'Uncommitted source observation');assert.equal(Number(h.$('gamma').value),1.4);assert.equal(h.inspect().dirty,true);
 assert.ok(h.actionTrace.includes('park-window'));assert.deepEqual(h.calls.map(c=>c.action),['activate-window','activate-window']);assert.equal(h.inspect().state.workspace_analysis.status,'dirty');
});

function recoveryPendingFixture(){const f=windowActivationFixture();f.source.object.annotations=annotated().object.annotations;f.source.workspace_analysis={schema_version:1,status:'recovery_available',working_revision:3,save_id:'saved-a',saved_revision:1,recovery_available:true,dirty:false,unresolved_request_id:null};return f;}
test('pending recovery copy blocks new ROI, field, reason and scientific execution without disabling resolution',async()=>{
 const f=recoveryPendingFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();const original=copy(h.inspect().draft);
 for(const id of ['add-roi','fft','measure','roi-reason','mark-text','gamma'])assert.equal(h.$(id).disabled,true,id);
 for(const id of ['workspace-recover','workspace-discard-recovery','workspace-save'])assert.equal(h.$(id).disabled,false,id);
 h.draw('rectangle');h.$('existing').value='line-a';h.$('existing').onchange();h.$('mark-text').value='new D';h.$('mark-text').oninput();h.$('roi-reason').value='new D reason';h.$('roi-reason').oninput();h.$('gamma').value='1.7';h.$('gamma').oninput();await h.click('fft');await h.click('measure');h.key('Delete');await h.settle();
 assert.deepEqual(h.inspect().draft,original);assert.equal(h.inspect().dirty,false);assert.equal(h.inspect().queuedEdits.length,0);assert.equal(h.$('mark-text').value,'candidate');assert.equal(h.$('roi-reason').value,'');assert.equal(Number(h.$('gamma').value),1);assert.equal(h.calls.length,0);assert.equal(h.inspect().state.workspace_analysis.recovery_available,true);
});
test('pending recovery copy permits camera observation and Save A, then explicit discard enables editing',async()=>{
 const f=recoveryPendingFixture(),h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();const original=copy(h.inspect().draft),before=h.inspect().view;
 assert.equal((await h.nativeAction('pan')).ok,true);h.event('pointerdown',10,10);h.event('pointerup',25,31);await h.settle();assert.notDeepEqual(h.inspect().view,before);h.$('zoom').value='2';h.$('zoom').oninput();await h.settle();assert.equal(h.inspect().view.scale,2);assert.deepEqual(h.inspect().draft,original);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,0);
 const saved=await h.nativeAction('save');assert.equal(saved.ok,true,saved.error);assert.equal(h.inspect().state.workspace_analysis.recovery_available,true);assert.equal(h.$('fft').disabled,true);assert.equal(h.calls.length,0);assert.equal(h.actionTrace.filter(action=>action==='save').length,1);
 await h.click('workspace-discard-recovery');await h.settle();assert.equal(h.inspect().state.workspace_analysis.recovery_available,false);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,0);assert.equal(h.actionTrace.filter(action=>action==='discard').length,1);h.draw('rectangle');assert.notDeepEqual(h.inspect().draft,original);
});


test('qualified UI panels restore before viewport camera calculation and retain the same visible image location',async()=>{
 const f=windowActivationFixture(),panels={side:'properties',settings:true,results:true},camera={scale:4.126139322916667,center_image_xy:[27.1616898741667,48]};Object.assign(f.source.window_collection.windows[0].view_context,{camera,ui_panels:panels});const h=await harness(f.source,{windowStates:[f.target],panelGeometry:true});await h.finishWindows();
 assert.equal(h.bodyClasses.has('properties-open'),true);assert.equal(h.$('settings-panel').open,true);assert.equal(h.$('measurement-workspace').open,true);assert.ok(Math.abs(h.inspect().view.x-(696/2-camera.center_image_xy[0]*camera.scale))<1e-9);assert.ok(Math.abs(h.inspect().view.y-(320/2-camera.center_image_xy[1]*camera.scale))<1e-9);assert.equal(h.inspect().view.scale,camera.scale);assert.equal(h.calls.length,0);
});
test('panel-only changes persist through the existing metadata queue and Save A without dirtying or executing science',async()=>{
 const f=recoveryPendingFixture(),h=await harness(f.source,{windowStates:[f.target],panelGeometry:true});await h.finishWindows();await h.click('toggle-properties');h.$('settings-panel').open=true;h.$('settings-panel').listeners.toggle();h.$('measurement-workspace').open=true;h.$('measurement-workspace').listeners.toggle();await h.finishWindows();
 const expected={side:'properties',settings:true,results:true};assert.deepEqual(h.server().window_collection.windows[0].view_context.ui_panels,expected);assert.equal(h.inspect().dirty,false);assert.equal(h.calls.length,0);const saved=await h.nativeAction('save');assert.equal(saved.ok,true,saved.error);assert.equal(h.inspect().state.workspace_analysis.recovery_available,true);assert.equal(h.calls.length,0);
 const after=await harness(h.server(),{windowStates:[f.target],panelGeometry:true});await after.finishWindows();assert.equal(after.bodyClasses.has('properties-open'),true);assert.equal(after.$('measurement-workspace').open,true);assert.equal(after.$('settings-panel').open,true);assert.deepEqual(after.inspect().view,h.inspect().view);assert.equal(after.calls.length,0);
});
test('legacy view without recorded UI panels uses an explicit default instead of inventing historical preferences',async()=>{
 const f=windowActivationFixture(),h=await harness(f.source,{windowStates:[f.target],panelGeometry:true});await h.finishWindows();assert.equal(h.bodyClasses.has('properties-open'),false);assert.equal(Boolean(h.$('measurement-workspace').open),false);assert.match(h.$('toggle-properties').title,/未记录.*默认/);assert.equal(h.server().window_collection.windows[0].view_context.ui_panels,undefined,'initial paint must not manufacture a historical panel preference');
});

test('readonly native close inspection reports loaded revision and refuses a new local selection without fetching or parking',async()=>{
 const f=recoveryPendingFixture();f.source.workspace_analysis={...f.source.workspace_analysis,status:'clean',recovery_available:false};const h=await harness(f.source,{windowStates:[f.target]});await h.finishWindows();await h.settle();const before={gets:h.getCalls.length,actions:h.actionTrace.length,draft:h.inspect().draft};const inspected=await h.nativeAction('inspect-close-state');assert.equal(inspected.ok,true,inspected.error);assert.equal(inspected.working_revision,3);assert.equal(h.getCalls.length,before.gets);assert.equal(h.actionTrace.length,before.actions);h.draw('rectangle');await h.settle();const local=h.inspect().draft,afterGets=h.getCalls.length,afterActions=h.actionTrace.length;const held=await h.nativeAction('inspect-close-state');assert.equal(held.ok,false);assert.deepEqual(h.inspect().draft,local);assert.equal(h.getCalls.length,afterGets);assert.equal(h.actionTrace.length,afterActions);
});

test('result menu is dismissed before opening a readonly report and focus returns to its visible summary',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const menu=h.$('research-more'),summary=h.$('results-menu-summary');menu.querySelector=selector=>selector==='summary'?summary:null;menu.open=true;h.$('open-roi-comparisons').focus();const before=h.inspect(),writes=h.calls.length;
 await h.click('open-roi-comparisons');assert.equal(menu.open,false,'a dismissed report must not leave its launch menu over Return');assert.equal(h.$('roi-comparison-dialog').open,true);assert.equal(h.calls.length,writes);assert.deepEqual(h.inspect(),before);
 await h.click('close-roi-comparisons');assert.equal(h.$('roi-comparison-dialog').open,false);assert.equal(h.active(),summary);assert.deepEqual(h.inspect(),before);
});

test('Escape dismisses transient menus before clearing a retained ROI draft',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const menu=h.$('research-more'),summary=h.$('results-menu-summary');menu.querySelector=()=>summary;menu.open=true;summary.focus();const before=h.inspect(),writes=h.calls.length,drafts=h.draftCalls.length;h.key('Escape');
 assert.equal(menu.open,false);assert.equal(h.active(),summary);assert.deepEqual(h.inspect(),before);assert.equal(h.calls.length,writes);assert.equal(h.draftCalls.length,drafts);
});

test('outside pointer and nested menu-action clicks dismiss menus without synthesizing scientific actions',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const result=h.$('research-more'),windows=h.$('window-index-menu'),inside=h.$('nested-label'),button=h.$('menu-action');button.tagName='BUTTON';inside.parentNode=button;button.parentNode=windows;const before=h.inspect(),writes=h.calls.length;
 result.open=true;windows.open=true;h.documentEvent('pointerdown',inside);assert.equal(result.open,false);assert.equal(windows.open,true);windows.listeners.click({target:inside});assert.equal(windows.open,false);
 result.open=true;h.documentEvent('pointerdown',h.$('fit-canvas'));assert.equal(result.open,false);assert.deepEqual(h.inspect(),before);assert.equal(h.calls.length,writes);
});

test('sidebar context: no selection keeps the ROI list but hides unrelated editing and measurement sections',async()=>{
 const h=await harness(),before=h.inspect();assert.equal(h.$('properties-empty').hidden,false);assert.equal(h.$('selection-properties').hidden,true);assert.equal(h.$('measurement-properties').hidden,true);assert.equal(h.$('discard-local').hidden,true);assert.equal(h.$('properties-title').textContent,'属性');
 await h.click('toggle-properties');await h.click('toggle-properties');assert.deepEqual(h.inspect().state.object,before.state.object);assert.deepEqual(h.inspect().draft,before.draft);assert.equal(h.calls.length,0);
});

test('sidebar context: ROI shows its own geometry and note without a previous measurement or peak symbol',async()=>{
 const initial=savedRectangleFixture();initial.object.annotations[0].note='Use this area; not a phase assignment.';initial.last_operation={action:'measure',annotation_id:'previous-peak',frequency_distance_cycles_per_pixel:.125};const h=await harness(initial);selectSavedRoi(h);await h.settle();
 assert.equal(h.$('properties-empty').hidden,true);assert.equal(h.$('selection-properties').hidden,false);assert.equal(h.$('measurement-properties').hidden,true);assert.equal(h.$('marker-shape-field').hidden,true);assert.equal(h.$('properties-title').textContent,'ROI 属性');assert.match(h.$('properties-geometry').textContent,/位置 40, 32.*大小 80 × 60 px/);assert.ok(h.$('properties-geometry').title.includes(JSON.stringify(initial.object.annotations[0].anchor.coordinates)));assert.match(h.$('properties-roi-note').textContent,/已记录说明：Use this area/);assert.equal(h.$('existing').value,'roi-stable');assert.equal(h.calls.length,0);
});

test('sidebar context: a selected reciprocal-space point retains its actual measurement and unknown scale',async()=>{
 const initial=fixture();initial.object.panels=[{domain:'frequency',source_object_id:sourceId,fft_shape_yx:[96,128],fft_rect_xyxy:[0,0,128,96],image_rect_xyxy:[0,0,128,96]}];initial.object.annotations=[{annotation_id:'peak-one',kind:'point',color:'cyan',status:'hypothesized',anchor:{source_object_id:sourceId,coordinate_space:'frequency_cycles_per_pixel',coordinates:[.125,0]}}];initial.last_operation={action:'measure',annotation_id:'peak-one',frequency_distance_cycles_per_pixel:.125};const h=await harness(initial);h.$('existing').value='peak-one';h.$('existing').onchange();h.flush();
 assert.equal(h.$('properties-title').textContent,'峰位属性');assert.equal(h.$('measurement-properties').hidden,false);assert.equal(h.$('marker-shape-field').hidden,false);assert.equal(h.$('properties-roi-note').hidden,true);assert.match(h.$('properties-geometry').textContent,/cycles\/px/);assert.match(h.$('measurement-summary').textContent,/0.125 cycles\/pixel/);assert.match(h.$('calibration-summary').textContent,/物理标尺未知/);assert.equal(h.calls.length,0);
});

test('sidebar context: opening advanced settings preserves unsaved ROI reason, fields and selection',async()=>{
 const h=await harness(savedRectangleFixture());selectSavedRoi(h);h.$('roi-reason').value='Still an unsaved observation';h.$('roi-reason').oninput();h.$('mark-text').value='Draft ROI label';h.$('mark-text').oninput();h.flush();await h.settle();const before=h.inspect(),calls=h.calls.length;
 assert.match(h.$('properties-roi-note').textContent,/说明草稿（未保存）：Still an unsaved observation/);assert.equal(h.$('discard-local').hidden,false);await h.click('toggle-settings');await h.click('close-properties');await h.click('toggle-properties');
 assert.equal(h.$('roi-reason').value,'Still an unsaved observation');assert.equal(h.$('mark-text').value,'Draft ROI label');assert.deepEqual(h.inspect().draft,before.draft);assert.equal(h.inspect().selectedId,before.selectedId);assert.deepEqual(h.inspect().state.object,before.state.object);assert.equal(h.inspect().dirty,true);assert.equal(h.calls.length,calls);
});

test('sidebar context: reformatting a selected ROI never resolves or replays an original unknown request',async()=>{
 const initial=savedRectangleFixture();initial.last_operation={action:'edit',state:'submitted',request_id:'original-outcome-unknown'};const h=await harness(initial);selectSavedRoi(h);const before=h.inspect();await h.click('toggle-settings');await h.click('close-properties');
 assert.equal(h.inspect().state.last_operation.request_id,'original-outcome-unknown');assert.equal(h.inspect().state.last_operation.state,'submitted');assert.deepEqual(h.inspect().state.object,before.state.object);assert.deepEqual(h.inspect().draft,before.draft);assert.equal(h.calls.length,0);
});

test('sidebar context: live ROI drag shows working coordinates and cancellation restores the old projection without a write',async()=>{
 const h=await harness(savedRectangleFixture());selectSavedRoi(h);const before=h.inspect();h.event('pointerdown',60,50);h.event('pointermove',65,54);h.flush();const changed=h.inspect().editCoordinates;
 assert.ok(changed);assert.notDeepEqual(changed,before.state.object.annotations[0].anchor.coordinates);assert.ok(h.$('properties-geometry').title.includes(JSON.stringify(changed)));assert.deepEqual(h.inspect().state.object,before.state.object);
 h.event('pointercancel');h.flush();assert.ok(h.$('properties-geometry').title.includes(JSON.stringify(before.state.object.annotations[0].anchor.coordinates)));assert.equal(h.calls.length,0);
});

test('native help dismisses its keyboard-opened menu and Escape belongs to the modal without losing a ROI draft',async()=>{
 const h=await harness();h.draw('rectangle');await h.settle();const menu=h.$('research-more'),summary=h.$('results-menu-summary');menu.querySelector=()=>summary;menu.open=true;summary.focus();const before=h.inspect(),writes=h.calls.length;
 assert.equal((await h.nativeAction('help')).ok,true);assert.equal(menu.open,false);assert.equal(h.$('usage-dialog').open,true);let prevented=false;h.key('Escape',{preventDefault(){prevented=true;}});assert.equal(prevented,false,'background menus must not consume the native modal Escape');h.$('usage-dialog').listeners.cancel({preventDefault(){}});assert.equal(h.$('usage-dialog').open,false);assert.equal(h.active(),summary);assert.deepEqual(h.inspect(),before);assert.equal(h.calls.length,writes);
});
