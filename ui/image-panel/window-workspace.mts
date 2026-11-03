import type {BrowserDocument,BrowserElement,BrowserEvent,BrowserEnvironment} from './browser-ports.mjs';
import {createSourceOverlay} from './window-source-overlay.mjs';

export interface WindowLayout {x:number;y:number;width:number;height:number;z:number;}
export interface WindowSourceReference {input_view_object_id:string;frame_object_id:string;raw_fft_object_id:string;processing_rect_xyxy:readonly number[];calibration_relation:'same'|'different'|'unknown';input_view_context?:WindowViewContext;}
export interface WindowCamera {scale:number;center_image_xy:readonly [number,number];}
export interface WindowViewContext {version:1;object_id:string;panel_mapping_fingerprint:string;camera:WindowCamera;selection_candidate:unknown;selected_annotation_id:string|null;camera_origin?:'new_fit_preference';}
// A decoded, qualified clean base supplied by the single editor. It contains
// no saved annotation layer and never qualifies a passive saved-object asset.
export interface ActiveSavedImage {object_id:string;image:BrowserElement;panel_mapping_fingerprint:string;object:unknown;}
export interface WindowEntry {window_id:string;object_id:string;role:'source'|'roi'|'fft';title:string;layout:WindowLayout;source_reference?:WindowSourceReference;view_context?:WindowViewContext;latest_observation_view_object_id?:string;}
export interface WindowCollection {schema_version:1;revision:number;frame_object_id:string|null;active_window_id:string|null;windows:readonly WindowEntry[];closed_windows?:readonly WindowEntry[];unavailable_reason?:string;}
interface HostState {object:{object_id:string};state_revision?:number;window_collection?:WindowCollection;panel_mapping_fingerprint?:string;}
interface WindowOptions {
 document:BrowserDocument;viewport:BrowserElement;getState:()=>HostState|undefined;
 api:(url:string,body?:Readonly<Record<string,unknown>>)=>Promise<unknown>;
 onCollection:(collection:WindowCollection,stateRevision:number)=>void;onError:(message:string)=>void;
 onActiveFit:()=>void;onBoundsChange:()=>void;observe?:(target:BrowserElement,callback:()=>void)=>void;
 isScientificGesture?:()=>boolean;
 onActivate?:(windowId:string,objectId:string)=>Promise<void>;
 onClose?:(windowId:string)=>Promise<void>;
 schedule?:(callback:()=>void,milliseconds:number)=>unknown;cancelSchedule?:(id:unknown)=>void;
 activeStage?:BrowserElement;getActiveImageSize?:()=>readonly number[];getActiveScale?:()=>number;
 getActiveSavedImage?:()=>ActiveSavedImage|null;
 assetTimeoutMs?:number;assetTimer?:{set:(callback:()=>void,milliseconds:number)=>unknown;clear:(id:unknown)=>void};
}
interface Frame {root:BrowserElement;header:BrowserElement;body:BrowserElement;title:BrowserElement;status:BrowserElement;source:BrowserElement;close:BrowserElement;fit:BrowserElement;edit:BrowserElement;retry:BrowserElement;image:BrowserElement|null;savedBase:(ActiveSavedImage&{frame_object_id:string|null})|null;assetObject:string|null;loadingObject:string|null;assetTicket:number;assetFailedObject:string|null;cancelAsset:(()=>void)|null;camera:{x:number;y:number;scale:number};imageSize:readonly number[];mappingFingerprint:string|null;appliedCamera:string|null;objectMetadata:unknown;overlay:BrowserElement|null;}
interface PendingCamera {window_id:string;object_id:string;camera:WindowCamera;epoch:number;}
type LayoutGesture={kind:'move'|'resize';window_id:string;pointer_id:number;start:readonly number[];before:WindowLayout;capture:BrowserElement};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const boundedId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
class AssetLoadTimeout extends Error {constructor(){super('只读保存图像读取超时；可明确重试，不创建新预览或重放科学请求。');}}
class AssetLoadCancelled extends Error {}
export function readWindowCamera(raw:unknown):WindowCamera|null {
 if(!record(raw)||!finite(raw.scale)||raw.scale<1e-6||raw.scale>1e4||!Array.isArray(raw.center_image_xy)||raw.center_image_xy.length!==2||!raw.center_image_xy.every(v=>finite(v)&&Math.abs(v)<=1e7))return null;
 return {scale:raw.scale,center_image_xy:[raw.center_image_xy[0] as number,raw.center_image_xy[1] as number]};
}
export function readWindowViewContext(raw:unknown,object?:{object_id:string},fingerprint?:string):WindowViewContext|null {
 if(!record(raw)||raw.version!==1||!objectId(raw.object_id)||typeof raw.panel_mapping_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(raw.panel_mapping_fingerprint)||object&&raw.object_id!==object.object_id||fingerprint!==undefined&&raw.panel_mapping_fingerprint!==fingerprint||raw.selected_annotation_id!==null&&(typeof raw.selected_annotation_id!=='string'||raw.selected_annotation_id.length<1||raw.selected_annotation_id.length>64)||raw.selection_candidate!==null&&!record(raw.selection_candidate))return null;
 if(raw.camera_origin!==undefined&&raw.camera_origin!=='new_fit_preference')return null;
 const camera=readWindowCamera(raw.camera);return camera?{version:1,object_id:raw.object_id,panel_mapping_fingerprint:raw.panel_mapping_fingerprint,camera,selection_candidate:raw.selection_candidate,selected_annotation_id:raw.selected_annotation_id as string|null,...(raw.camera_origin==='new_fit_preference'?{camera_origin:'new_fit_preference' as const}:{})}:null;
}
export function readWindowCollection(raw:unknown):WindowCollection|null {
 if(!record(raw)||raw.schema_version!==1||!Number.isSafeInteger(raw.revision)||(raw.revision as number)<0||!Array.isArray(raw.windows)||raw.windows.length>5||raw.frame_object_id!==null&&!objectId(raw.frame_object_id)||raw.active_window_id!==null&&!boundedId(raw.active_window_id))return null;
 const seen=new Set<string>();
 for(const value of raw.windows){
  if(!record(value)||!boundedId(value.window_id)||seen.has(value.window_id)||!objectId(value.object_id)||!['source','roi','fft'].includes(String(value.role))||typeof value.title!=='string'||value.title.length>120||!record(value.layout))return null;
  seen.add(value.window_id);const r=value.layout;
  if(value.latest_observation_view_object_id!==undefined&&!objectId(value.latest_observation_view_object_id))return null;
  if(![r.x,r.y,r.width,r.height,r.z].every(finite)||[r.x,r.y].some(v=>(v as number)<0||(v as number)>1)||[r.width,r.height].some(v=>(v as number)<=0||(v as number)>1)||(r.x as number)+(r.width as number)>1.000001||(r.y as number)+(r.height as number)>1.000001||(r.z as number)<0||(r.z as number)>1000000)return null;
  if(value.source_reference!==undefined){const s=value.source_reference;if(!record(s)||![s.input_view_object_id,s.frame_object_id,s.raw_fft_object_id].every(objectId)||s.frame_object_id!==raw.frame_object_id||!Array.isArray(s.processing_rect_xyxy)||s.processing_rect_xyxy.length!==4||!s.processing_rect_xyxy.every(v=>Number.isSafeInteger(v)&&v>=0)||s.processing_rect_xyxy[0]>=s.processing_rect_xyxy[2]||s.processing_rect_xyxy[1]>=s.processing_rect_xyxy[3]||!['same','different','unknown'].includes(String(s.calibration_relation)))return null;}
 }
 if(raw.active_window_id!==null&&!seen.has(raw.active_window_id as string))return null;
 if(raw.closed_windows!==undefined){if(!Array.isArray(raw.closed_windows)||raw.closed_windows.length>32)return null;for(const entry of raw.closed_windows){const checked=readWindowCollection({schema_version:1,revision:raw.revision,frame_object_id:raw.frame_object_id,active_window_id:null,windows:[entry]});if(!checked||seen.has((entry as WindowEntry).window_id))return null;seen.add((entry as WindowEntry).window_id);}}
 return raw as unknown as WindowCollection;
}
export function tiledWindowLayouts(entries:readonly Pick<WindowEntry,'window_id'>[]):{window_id:string;layout:WindowLayout}[] {
 const count=entries.length,columns=count===1?1:count<=4?2:3,rows=Math.ceil(count/columns);
 return entries.map((entry,i)=>({window_id:entry.window_id,layout:{x:(i%columns)/columns,y:Math.floor(i/columns)/rows,width:1/columns,height:1/rows,z:i+1}}));
}

// This owns presentation only. All scientific tools still use the one existing
// viewport/current/edit lease. Passive images never publish scientific selection.
export class WindowWorkspace {
 private readonly desktop:BrowserElement|null;private readonly controls:BrowserElement|null;private readonly frames=new Map<string,Frame>();
 private collection:WindowCollection|null=null;private gesture:LayoutGesture|null=null;private readonly localLayouts=new Map<string,WindowLayout>();
 private writes:Promise<void>=Promise.resolve();private width=0;private narrow=true;private single=false;private layoutEpoch=0;private readonly layoutEpochs=new Map<string,number>();private deferredGeometry:{window_id:string;object_id:string}|null=null;
 private switchLocked=false;private metadataError:Error|null=null;private cameraEpoch=0;private readonly pendingCameras=new Map<string,PendingCamera>();private readonly cameraTimers=new Map<string,unknown>();private readonly failedCameras=new Set<string>();private pendingWrites=0;
 private activeOverlay:BrowserElement|null=null;
 constructor(private readonly options:WindowOptions){
  const d=options.document;this.desktop=d.getElementById('window-desktop');this.controls=d.getElementById('window-controls');
  if(!this.desktop||!this.controls)return;
  const tile=d.getElementById('tile-windows');if(tile)tile.onclick=()=>this.tile();
  const single=d.getElementById('single-window');if(single)single.onclick=()=>{this.single=!this.single;this.resize();};
  options.observe?.(this.desktop,()=>this.resize());
 }
 sync(state:HostState):void {
  if(!this.desktop||!this.controls)return;
  const parsed=readWindowCollection(state.window_collection),collection=parsed&&(!parsed.windows.length&&parsed.active_window_id===null||parsed.windows.find(entry=>entry.window_id===parsed.active_window_id)?.object_id===state.object.object_id)?parsed:null;
  if(collection&&!collection.windows.length&&collection.closed_windows?.length){
   this.collection=collection;this.controls.hidden=false;this.options.viewport.hidden=true;this.desktop.classList.toggle('has-image-windows',false);
   for(const frame of this.frames.values())this.cancelAssetLoad(frame);this.frames.clear();
   const empty=this.element('div','empty-workbench','图像显示已关闭，工作编辑与科学记录仍保留。可在窗口列表重新打开。');this.desktop.replaceChildren(this.options.viewport,empty);this.resize();return;
  }
  this.options.viewport.hidden=false;
  if(!collection||!collection.windows.length||!collection.active_window_id){
   this.controls.hidden=true;this.desktop.classList.toggle('has-image-windows',false);
   this.desktop.replaceChildren(this.options.viewport);
   for(const frame of this.frames.values())this.cancelAssetLoad(frame);this.collection=null;this.frames.clear();this.deferredGeometry=null;return;
  }
  if(this.collection&&collection.revision<this.collection.revision)return;
  this.collection=collection;this.controls.hidden=false;this.desktop.classList.toggle('has-image-windows',true);
  const alive=new Set(collection.windows.map(entry=>entry.window_id));
  for(const [id,frame]of this.frames)if(!alive.has(id)){this.cancelAssetLoad(frame);frame.root.remove?.();this.frames.delete(id);this.localLayouts.delete(id);}
  for(const entry of collection.windows){const frame=this.frames.get(entry.window_id)??this.makeFrame(entry.window_id);this.frames.set(entry.window_id,frame);this.updateFrame(frame,entry,entry.window_id===collection.active_window_id);}
  // Never detach the mounted editor for a layout/asset response: reparenting
  // the same DOM tree can lose an ongoing scientific pointer capture or focus.
  for(const entry of collection.windows){const frame=this.frames.get(entry.window_id)!;if(frame.root.parentNode!==this.desktop)this.desktop.append(frame.root);}
  this.resize();this.updateActiveSourceOverlay();
 }
 private element(tag:string,className?:string,text?:string):BrowserElement{const el=this.options.document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 private makeFrame(id:string):Frame {
  const root=this.element('section','image-window'),header=this.element('div','image-window-titlebar'),title=this.element('strong'),status=this.element('span','image-window-status'),actions=this.element('div','image-window-actions');
  root.setAttribute('data-window-id',id);root.setAttribute('aria-label','图像窗口');
  const fit=this.element('button',undefined,'适应'),close=this.element('button',undefined,'关闭'),edit=this.element('button',undefined,'编辑此图'),retry=this.element('button',undefined,'重试只读图像');for(const button of [fit,close,edit,retry])button.setAttribute('type','button');retry.hidden=true;retry.setAttribute('aria-label','重试读取此窗口的已保存图像');
  actions.append(fit,close,edit,retry);header.append(title,status,actions);const body=this.element('div','image-window-body'),source=this.element('div','image-window-source'),resize=this.element('button','image-window-resize','↘');
  resize.setAttribute('type','button');resize.setAttribute('aria-label','调整图像窗口大小');resize.title='拖动调整窗口大小；不改变图像缩放';root.append(header,body,source,resize);
  const frame:Frame={root,header,body,title,status,source,close,fit,edit,retry,image:null,savedBase:null,assetObject:null,loadingObject:null,assetTicket:0,assetFailedObject:null,cancelAsset:null,camera:{x:0,y:0,scale:1},imageSize:[1,1],mappingFingerprint:null,appliedCamera:null,objectMetadata:null,overlay:null};
  header.onpointerdown=event=>{if(event.target===fit||event.target===close||event.target===edit||event.target===retry)return;this.startLayout(event,id,'move',header);};
  resize.onpointerdown=event=>this.startLayout(event,id,'resize',resize);
  for(const target of [header,resize]){target.onpointermove=event=>this.moveLayout(event);target.onpointerup=event=>this.finishLayout(event);target.onpointercancel=event=>this.cancelLayout(event);}
  close.onclick=()=>this.closeWindow(id);edit.onclick=()=>this.requestActivation(id);fit.onclick=()=>{if(this.switchLocked)return;if(this.collection?.active_window_id===id)this.options.onActiveFit();else{this.fitPassive(frame);this.savePassiveCamera(id,frame);}};
  retry.onclick=()=>this.retryAsset(id);
  root.onpointerdown=event=>{if(![0,1].includes(event.button)||event.target===fit||event.target===close||event.target===edit||event.target===retry||this.gesture?.window_id===id&&this.gesture.pointer_id===event.pointerId)return;this.raiseWindow(id);};
  let pan:{pointer:number;x:number;y:number;before:{x:number;y:number;scale:number}}|null=null;
  body.onpointerdown=event=>{if(this.switchLocked||event.button!==0||this.collection?.active_window_id===id||!frame.image)return;event.preventDefault();if(this.options.onActivate){void this.requestActivation(id);return;}pan={pointer:event.pointerId,x:event.clientX,y:event.clientY,before:{...frame.camera}};body.setPointerCapture(event.pointerId);};
  body.onpointermove=event=>{if(!pan||pan.pointer!==event.pointerId)return;frame.camera={...pan.before,x:pan.before.x+event.clientX-pan.x,y:pan.before.y+event.clientY-pan.y};this.paintPassive(frame);};
  body.onpointerup=event=>{if(pan?.pointer===event.pointerId){pan=null;this.savePassiveCamera(id,frame);}};body.onpointercancel=()=>{if(pan){pan=null;this.savePassiveCamera(id,frame);}};
  body.onwheel=event=>{if(this.switchLocked||this.collection?.active_window_id===id||!frame.image)return;event.preventDefault();const r=body.getBoundingClientRect(),factor=Math.exp(-event.deltaY*.0015),scale=clamp(frame.camera.scale*factor,.02,100),ratio=scale/frame.camera.scale;frame.camera={scale,x:event.clientX-r.left-(event.clientX-r.left-frame.camera.x)*ratio,y:event.clientY-r.top-(event.clientY-r.top-frame.camera.y)*ratio};this.paintPassive(frame);this.savePassiveCamera(id,frame);};
  this.options.observe?.(body,()=>{const entry=this.collection?.windows.find(value=>value.window_id===id);if(entry&&id!==this.collection?.active_window_id)this.applyPassiveContext(frame,entry);});
  return frame;
 }
 private updateFrame(frame:Frame,entry:WindowEntry,active:boolean){
  frame.title.textContent=entry.title;if(active||frame.loadingObject!==entry.object_id&&frame.assetFailedObject!==entry.object_id)frame.status.textContent=active?'当前编辑':'对照 · 点击编辑';frame.root.setAttribute('aria-label',entry.title+' · '+(active?'当前编辑':'对照'));frame.root.classList.toggle('active-image-window',active);frame.close.disabled=active&&!this.options.onClose;frame.close.title='只关闭此显示；工作编辑、科学对象与历史仍保留';
  frame.edit.hidden=active;frame.edit.disabled=this.switchLocked||!this.options.onActivate;frame.edit.setAttribute('aria-label',entry.title+'：编辑此图');frame.fit.disabled=this.switchLocked||!active&&(!frame.image||frame.assetObject!==entry.object_id);if(this.switchLocked)frame.close.disabled=true;
  const source=entry.source_reference;frame.source.textContent=source?`FFT 计算窗口 [${source.processing_rect_xyxy.join(', ')}]${source.calibration_relation==='different'?' · 当前标定不同，保留历史来源':source.calibration_relation==='unknown'?' · 标定关系待核对':''}`:active?'工具与测量作用于此窗口':'只读显示；关闭不删除保存结果';
  frame.source.title=source?`不可变输入 ${source.input_view_object_id}；原 FFT ${source.raw_fft_object_id}；处理窗口不是原浮点选区`:'';
  this.geometry(frame,entry);
  frame.retry.disabled=this.switchLocked;
  if(active){const candidate=this.options.getActiveSavedImage?.();if(candidate?.object_id===entry.object_id&&record(candidate.object)&&candidate.object.object_id===entry.object_id&&/^[a-f0-9]{64}$/.test(candidate.panel_mapping_fingerprint)&&candidate.image.naturalWidth>0&&candidate.image.naturalHeight>0)frame.savedBase={...candidate,frame_object_id:this.collection?.frame_object_id??null};this.cancelAssetLoad(frame);frame.assetFailedObject=null;frame.retry.hidden=true;if(this.options.viewport.parentNode!==frame.body)frame.body.replaceChildren(this.options.viewport);}
  else if((frame.assetObject!==entry.object_id||!frame.image)&&frame.loadingObject!==entry.object_id&&frame.assetFailedObject!==entry.object_id){void this.loadAsset(frame,entry);}
  else if(frame.image&&frame.assetObject===entry.object_id){if(frame.image.parentNode!==frame.body)frame.body.replaceChildren(frame.image);this.applyPassiveContext(frame,entry);this.paintPassive(frame);}
 }
 private geometry(frame:Frame,entry:WindowEntry,validatedOnly=false){const r=validatedOnly?entry.layout:this.localLayouts.get(entry.window_id)??entry.layout;frame.root.style.zIndex=String(r.z);if(entry.window_id===this.collection?.active_window_id&&this.options.isScientificGesture?.()){this.deferredGeometry={window_id:entry.window_id,object_id:entry.object_id};return;}Object.assign(frame.root.style,{left:`calc(${r.x*100}% + 4px)`,top:`calc(${r.y*100}% + 4px)`,width:`calc(${r.width*100}% - 8px)`,height:`calc(${r.height*100}% - 8px)`});if(entry.window_id!==this.collection?.active_window_id)this.applyPassiveContext(frame,entry);}
 private raiseWindow(id:string,persist=true):void {
  if(this.switchLocked||this.narrow||this.single||!this.collection||!this.frames.has(id))return;
  const ordered=[...this.collection.windows].sort((a,b)=>(this.localLayouts.get(a.window_id)??a.layout).z-(this.localLayouts.get(b.window_id)??b.layout).z);
  if(ordered.at(-1)?.window_id===id&&ordered.every(entry=>(this.localLayouts.get(entry.window_id)??entry.layout).z<=ordered.length))return;
  const entries=ordered.filter(entry=>entry.window_id!==id);entries.push(ordered.find(entry=>entry.window_id===id)!);
  for(const [index,entry]of entries.entries()){const layout={...(this.localLayouts.get(entry.window_id)??entry.layout),z:index+1};this.localLayouts.set(entry.window_id,layout);this.layoutEpochs.set(entry.window_id,++this.layoutEpoch);this.frames.get(entry.window_id)!.root.style.zIndex=String(layout.z);}
  if(persist)this.persistLayouts();
 }
 flushDeferredLayout():void {
  if(!this.deferredGeometry||this.options.isScientificGesture?.()||this.gesture)return;
  const pending=this.deferredGeometry;this.deferredGeometry=null;const entry=this.collection?.windows.find(value=>value.window_id===pending.window_id),frame=this.frames.get(pending.window_id);
  // Flush the latest qualified server layout, never an old or unacknowledged
  // candidate, and only while this remains the same scientific editor.
  if(!entry||!frame||entry.object_id!==pending.object_id||this.collection?.active_window_id!==entry.window_id||this.options.getState()?.object.object_id!==entry.object_id)return;
  this.geometry(frame,entry,true);this.options.onBoundsChange();
 }
 resize():void {
  if(!this.desktop||!this.collection)return;this.width=this.desktop.getBoundingClientRect().width;this.narrow=this.width<960;const one=this.narrow||this.single;this.desktop.classList.toggle('single-image-window',one);
  for(const [id,frame]of this.frames){frame.root.hidden=one&&id!==this.collection.active_window_id;const entry=this.collection.windows.find(value=>value.window_id===id);if(entry&&id!==this.collection.active_window_id)this.applyPassiveContext(frame,entry);}
  const count=this.options.document.getElementById('window-count');if(count)count.textContent=`${this.collection.windows.length} / 5 个窗口${one?' · 仅显示当前编辑图，其余窗口保留':''}`;
  const list=this.options.document.getElementById('window-list');
  if(list){list.replaceChildren(...[...this.collection.windows,...this.collection.closed_windows??[]].map(entry=>{
   const closed=Boolean(this.collection!.closed_windows?.some(value=>value.window_id===entry.window_id));
   const row=this.element('div','window-index-row'),label=this.element('span',undefined,entry.title+(closed?' · 显示已关闭':entry.window_id===this.collection!.active_window_id?' · 当前编辑':' · 点击编辑'));
   const close=this.element('button',undefined,'关闭显示'),edit=this.element('button',undefined,closed?'重新打开':'编辑此图'),retry=this.element('button',undefined,'重试只读图像');
   for(const button of [close,edit,retry])button.setAttribute('type','button');
   close.hidden=closed;close.disabled=this.switchLocked||entry.window_id===this.collection!.active_window_id&&!this.options.onClose;close.title='仅关闭显示，工作编辑与科学记录仍保留';close.onclick=()=>this.closeWindow(entry.window_id);
   edit.disabled=this.switchLocked||entry.window_id===this.collection!.active_window_id||!this.options.onActivate;edit.setAttribute('aria-label',entry.title+'：'+(closed?'重新打开':'编辑此图'));edit.onclick=()=>this.requestActivation(entry.window_id);
   retry.hidden=closed||this.frames.get(entry.window_id)?.assetFailedObject!==entry.object_id;retry.disabled=this.switchLocked;retry.setAttribute('aria-label',entry.title+'：重试只读图像');retry.onclick=()=>this.retryAsset(entry.window_id);
   row.append(label,close,edit,retry);return row;
  }));}
  const tile=this.options.document.getElementById('tile-windows');if(tile)tile.disabled=this.switchLocked||one||this.collection.windows.length<2;const single=this.options.document.getElementById('single-window');if(single){single.disabled=this.switchLocked||this.narrow;single.textContent=this.single?'多窗口比较':'单图编辑';single.setAttribute('aria-pressed',String(one));}this.options.onBoundsChange();
 }
 private startLayout(event:BrowserEvent,id:string,kind:'move'|'resize',capture:BrowserElement){
  if(this.switchLocked||event.button!==0||this.narrow||this.single||!this.collection||id===this.collection.active_window_id&&this.options.isScientificGesture?.())return;const entry=this.collection.windows.find(value=>value.window_id===id);if(!entry)return;event.preventDefault();this.raiseWindow(id,false);const before={...(this.localLayouts.get(id)??entry.layout)};
  this.localLayouts.set(id,before);this.layoutEpochs.set(id,++this.layoutEpoch);this.gesture={kind,window_id:id,pointer_id:event.pointerId,start:[event.clientX,event.clientY],before,capture};capture.setPointerCapture(event.pointerId);this.geometry(this.frames.get(id)!,entry);
 }
 private moveLayout(event:BrowserEvent){
  const g=this.gesture;if(!g||g.pointer_id!==event.pointerId||!this.collection||!this.desktop)return;const area=this.desktop.getBoundingClientRect();if(area.width<=0||area.height<=0)return;event.preventDefault();const dx=(event.clientX-g.start[0]!)/area.width,dy=(event.clientY-g.start[1]!)/area.height,r={...g.before};
  if(g.kind==='move'){r.x=clamp(r.x+dx,0,Math.max(0,1-r.width));r.y=clamp(r.y+dy,0,Math.max(0,1-r.height));}
  else{r.width=clamp(r.width+dx,Math.min(280/area.width,1-r.x),1-r.x);r.height=clamp(r.height+dy,Math.min(180/area.height,1-r.y),1-r.y);}
  this.localLayouts.set(g.window_id,r);this.layoutEpochs.set(g.window_id,++this.layoutEpoch);const entry=this.collection.windows.find(value=>value.window_id===g.window_id);if(entry)this.geometry(this.frames.get(g.window_id)!,entry);this.options.onBoundsChange();
 }
 private finishLayout(event:BrowserEvent){if(!this.gesture||this.gesture.pointer_id!==event.pointerId)return;const g=this.gesture;this.gesture=null;this.persistLayouts();if(g.kind==='move'&&Math.hypot(event.clientX-g.start[0]!,event.clientY-g.start[1]!)<3)void this.requestActivation(g.window_id);}
 private cancelLayout(event:BrowserEvent){const g=this.gesture;if(!g||g.pointer_id!==event.pointerId)return;this.localLayouts.set(g.window_id,g.before);this.gesture=null;const entry=this.collection?.windows.find(value=>value.window_id===g.window_id);if(entry)this.geometry(this.frames.get(g.window_id)!,entry);}
 tile():void {if(this.switchLocked||!this.collection||this.narrow||this.single)return;for(const item of tiledWindowLayouts(this.collection.windows)){this.localLayouts.set(item.window_id,item.layout);this.layoutEpochs.set(item.window_id,++this.layoutEpoch);}for(const entry of this.collection.windows)this.geometry(this.frames.get(entry.window_id)!,entry);this.persistLayouts();this.options.onBoundsChange();}
 private enqueue(task:()=>Promise<void>):Promise<void>{this.pendingWrites++;const operation=this.writes.then(task);this.writes=operation.catch(error=>{this.metadataError=error instanceof Error?error:new Error(String(error));this.options.onError(this.metadataError.message);}).finally(()=>{this.pendingWrites--;});return operation;}
 private persistLayouts(){void this.enqueue(async()=>{const collection=this.collection;if(!collection)return;const windows=collection.windows.map(entry=>({window_id:entry.window_id,layout:{...(this.localLayouts.get(entry.window_id)??entry.layout)}})),epochs=new Map(this.layoutEpochs);await this.metadata('window-layout',{collection_revision:collection.revision,windows},epochs);});}
 async closeWindow(id:string):Promise<void>{if(this.switchLocked)return;if(this.options.onClose){try{await this.options.onClose(id);}catch(error){this.options.onError((error as Error).message);}return;}void this.enqueue(async()=>{const collection=this.collection;if(!collection)return;if(id===collection.active_window_id)throw new Error('当前编辑窗口须先返回空间观察，再关闭。');await this.metadata('close-window',{collection_revision:collection.revision,window_id:id});});return this.writes;}
 settled():Promise<void>{return this.writes;}
 hasPendingMetadata():boolean{return this.pendingWrites>0||this.pendingCameras.size>0||Boolean(this.gesture);}
 setSwitchLocked(locked:boolean):void {if(this.switchLocked===locked)return;this.switchLocked=locked;for(const entry of this.collection?.windows??[]){const frame=this.frames.get(entry.window_id);if(frame)this.updateFrame(frame,entry,entry.window_id===this.collection?.active_window_id);}this.resize();}
 async requestActivation(id:string):Promise<void>{if(this.switchLocked)return;const entry=[...this.collection?.windows??[],...this.collection?.closed_windows??[]].find(value=>value.window_id===id);if(!entry||id===this.collection?.active_window_id||!this.options.onActivate)return;try{await this.options.onActivate(id,entry.object_id);}catch(error){this.options.onError((error as Error).message);}}
 async awaitStableMetadata():Promise<void>{if(this.gesture)throw new Error('先结束窗口拖动或调整大小，再切换编辑图。');for(;;){if(this.metadataError)throw this.metadataError;this.flushCameras();const pending=this.writes;await pending;if(this.metadataError)throw this.metadataError;if(this.writes===pending&&!this.pendingCameras.size)break;}if(this.gesture)throw new Error('先结束窗口拖动或调整大小，再切换编辑图。');}
 async saveActiveContext(camera:WindowCamera,annotationId:string|null,draftRevision:number):Promise<void>{
  await this.awaitStableMetadata();await this.enqueue(async()=>{const collection=this.collection;if(!collection)throw new Error('当前窗口集合不可用');await this.metadata('window-context',{collection_revision:collection.revision,camera,selected_annotation_id:annotationId},undefined,{draft_revision:draftRevision});});
 }
 reconcileMetadata(state:HostState):void {
  this.sync(state);for(const [key,pending]of this.pendingCameras){const entry=this.collection?.windows.find(value=>value.window_id===pending.window_id&&value.object_id===pending.object_id);if(!entry){this.pendingCameras.delete(key);this.failedCameras.delete(key);continue;}const context=readWindowViewContext(entry.view_context,{object_id:entry.object_id});if(context&&JSON.stringify(context.camera)===JSON.stringify(pending.camera)){this.pendingCameras.delete(key);this.failedCameras.delete(key);}}
  this.metadataError=this.failedCameras.size?new Error('相机保存尚未确认；请在该窗口重新调整或适应图像后再切换，不重放旧保存。'):null;
 }
 queueActiveCamera(camera:WindowCamera):void {const state=this.options.getState(),id=this.collection?.active_window_id;if(this.switchLocked||!state?.panel_mapping_fingerprint||!id)return;this.queueCamera(id,state.object.object_id,camera);}
 private savePassiveCamera(id:string,frame:Frame){const entry=this.collection?.windows.find(value=>value.window_id===id);if(!entry||this.collection?.active_window_id===id||!frame.image||frame.assetObject!==entry.object_id||!frame.mappingFingerprint)return;const box=frame.body.getBoundingClientRect(),camera=readWindowCamera({scale:frame.camera.scale,center_image_xy:[(box.width/2-frame.camera.x)/frame.camera.scale,(box.height/2-frame.camera.y)/frame.camera.scale]});if(!camera)return;frame.appliedCamera=JSON.stringify([camera,box.width,box.height]);this.queueCamera(id,entry.object_id,camera);}
 private queueCamera(windowId:string,object:string,raw:WindowCamera){
  const camera=readWindowCamera(raw),entry=this.collection?.windows.find(value=>value.window_id===windowId&&value.object_id===object);if(!camera||!entry)return;const key=windowId+':'+object,context=readWindowViewContext(entry.view_context,{object_id:object});
  this.failedCameras.delete(key);if(!this.failedCameras.size)this.metadataError=null;
  if(context&&JSON.stringify(context.camera)===JSON.stringify(camera)){this.pendingCameras.delete(key);return;}
  this.pendingCameras.set(key,{window_id:windowId,object_id:object,camera,epoch:++this.cameraEpoch});const timer=this.cameraTimers.get(key);if(timer!==undefined)this.options.cancelSchedule?.(timer);
  if(this.options.schedule)this.cameraTimers.set(key,this.options.schedule(()=>{this.cameraTimers.delete(key);this.flushCameras();},180));else void Promise.resolve().then(()=>this.flushCameras());
 }
 private flushCameras(){
  for(const timer of this.cameraTimers.values())this.options.cancelSchedule?.(timer);this.cameraTimers.clear();
  for(const [key]of this.pendingCameras){if(this.failedCameras.has(key))continue;void this.enqueue(async()=>{if(this.failedCameras.has(key))return;const pending=this.pendingCameras.get(key),collection=this.collection;if(!pending||!collection)return;const entry=collection.windows.find(value=>value.window_id===pending.window_id&&value.object_id===pending.object_id);if(!entry){this.pendingCameras.delete(key);return;}
    try{await this.metadata('window-camera',{collection_revision:collection.revision,window_id:pending.window_id,object_id:pending.object_id,camera:pending.camera});if(this.pendingCameras.get(key)?.epoch===pending.epoch){this.pendingCameras.delete(key);const frame=this.frames.get(pending.window_id),latest=this.collection?.windows.find(value=>value.window_id===pending.window_id&&value.object_id===pending.object_id);if(frame&&latest)this.applyPassiveContext(frame,latest);}}
    catch(error){this.failedCameras.add(key);throw error;}
   });}
 }
 private async metadata(action:string,params:Readonly<Record<string,unknown>>,epochs?:ReadonlyMap<string,number>,extra:Readonly<Record<string,unknown>>={}){
  const state=this.options.getState();if(!state)return;const expected=state.object.object_id,raw=await this.options.api('/api/action',{expected_object_id:expected,action,params,...extra});
  if(!record(raw)||!record(raw.object)||raw.object.object_id!==expected||this.options.getState()?.object.object_id!==expected)throw new Error('窗口操作读回时当前图已变化；科学编辑保持原样，请重新读取窗口状态。');
  const collection=readWindowCollection(raw.window_collection);if(!collection||this.collection&&collection.revision<this.collection.revision)throw new Error('窗口状态读回版本不匹配；没有覆盖当前编辑。');
  for(const entry of collection.windows)if(epochs&&this.layoutEpochs.get(entry.window_id)===epochs.get(entry.window_id))this.localLayouts.delete(entry.window_id);this.options.onCollection(collection,typeof raw.state_revision==='number'?raw.state_revision:state.state_revision??0);this.sync({...state,window_collection:collection});
 }
 private cancelAssetLoad(frame:Frame):void {frame.assetTicket++;const cancel=frame.cancelAsset;frame.cancelAsset=null;frame.loadingObject=null;cancel?.();}
 private async retryAsset(windowId:string):Promise<void>{const entry=this.collection?.windows.find(value=>value.window_id===windowId),frame=this.frames.get(windowId);if(this.switchLocked||!entry||!frame||windowId===this.collection?.active_window_id||frame.loadingObject===entry.object_id)return;await this.loadAsset(frame,entry);}
 private async loadAsset(frame:Frame,entry:WindowEntry,retries=1){
  const collection=this.collection;if(!collection)return;this.cancelAssetLoad(frame);const ticket=frame.assetTicket;frame.loadingObject=entry.object_id;frame.assetFailedObject=null;frame.retry.hidden=true;frame.fit.disabled=true;
  const base=frame.savedBase?.frame_object_id===collection.frame_object_id?frame.savedBase:null,previous=frame.image??base?.image;frame.status.textContent=frame.image?'正在读取 · 显示上一保存图像':base?'上一已核对底图，标注待加载':'正在读取保存图像…';
  if(previous){if(previous.parentNode!==frame.body)frame.body.replaceChildren(previous);if(!frame.image&&base){base.image.className='window-passive-image';base.image.alt=entry.title+' · 上一已核对底图，标注待加载';const area=frame.body.getBoundingClientRect(),width=base.image.naturalWidth,height=base.image.naturalHeight,scale=Math.max(.02,Math.min(area.width/width,area.height/height)*.94);base.image.style.transform=`translate(${(area.width-width*scale)/2}px,${(area.height-height*scale)/2}px) scale(${scale})`;}}else frame.body.textContent='正在读取保存图像…';
  const environment=globalThis as typeof globalThis&BrowserEnvironment,timerPort=this.options.assetTimer??{set:(callback:()=>void,ms:number)=>{if(!environment.setTimeout)throw new Error('只读图像加载缺少可用的超时计时器');return environment.setTimeout(callback,ms);},clear:(id:unknown)=>environment.clearTimeout?.(id)},timeout=this.options.assetTimeoutMs??10000;
  let timer:unknown,cancel:()=>void=()=>{};
  const current=()=>ticket===frame.assetTicket&&this.frames.get(entry.window_id)===frame&&this.collection?.active_window_id!==entry.window_id&&this.collection?.windows.find(value=>value.window_id===entry.window_id)?.object_id===entry.object_id;
  try{
   if(!Number.isFinite(timeout)||timeout<1||timeout>120000)throw new Error('只读图像超时范围无效');
   const deadline=new Promise<never>((_resolve,reject)=>{cancel=()=>reject(new AssetLoadCancelled());frame.cancelAsset=cancel;timer=timerPort.set(()=>reject(new AssetLoadTimeout()),timeout);});
   const raw=await Promise.race([this.options.api(`/api/window-asset?window_id=${encodeURIComponent(entry.window_id)}&revision=${collection.revision}`),deadline]);if(!current())return;
   if(!record(raw)||raw.schema_version!==1||raw.collection_revision!==collection.revision||raw.window_id!==entry.window_id||raw.object_id!==entry.object_id||!record(raw.object)||raw.object.object_id!==entry.object_id||typeof raw.png_base64!=='string'||raw.png_base64.length>3*1024*1024)throw new Error('只读窗口保存资产身份或大小不匹配');
   const img=this.element('img','window-passive-image');img.alt=entry.title+' · 只读保存图像';img.src='data:image/png;base64,'+raw.png_base64;if(typeof img.decode==='function')await Promise.race([img.decode(),deadline]);
   if(!current())return;
   const size=[img.naturalWidth||img.width||128,img.naturalHeight||img.height||96],sameSize=frame.imageSize[0]===size[0]&&frame.imageSize[1]===size[1];frame.imageSize=size;frame.image=img;frame.assetObject=entry.object_id;frame.loadingObject=null;frame.assetFailedObject=null;frame.objectMetadata=raw.object;frame.mappingFingerprint=typeof raw.panel_mapping_fingerprint==='string'&&/^[a-f0-9]{64}$/.test(raw.panel_mapping_fingerprint)?raw.panel_mapping_fingerprint:null;frame.appliedCamera=null;frame.body.replaceChildren(img);frame.overlay=null;frame.fit.disabled=this.switchLocked;frame.retry.hidden=true;frame.status.textContent='只读对照';frame.body.title='';if(!this.applyPassiveContext(frame,this.collection!.windows.find(value=>value.window_id===entry.window_id)??entry)){if(!sameSize)this.fitPassive(frame);else this.paintPassive(frame);}this.resize();
  }catch(error){
   if(!current()||error instanceof AssetLoadCancelled)return;frame.loadingObject=null;const latest=this.collection?.windows.find(value=>value.window_id===entry.window_id);
   if(!(error instanceof AssetLoadTimeout)&&retries>0&&latest?.object_id===entry.object_id&&this.collection?.revision!==collection.revision){void this.loadAsset(frame,latest,retries-1);return;}
   frame.assetFailedObject=entry.object_id;frame.retry.hidden=false;frame.status.textContent=(error instanceof AssetLoadTimeout?'读取超时':'只读图像不可用')+(frame.image?' · 显示上一保存图像':base?' · 上一已核对底图，标注待加载':'');if(!previous)frame.body.textContent='只读图像暂不可用；保存对象保留。';frame.body.title=(error as Error).message;this.resize();
  }finally{if(timer!==undefined)timerPort.clear(timer);if(frame.cancelAsset===cancel)frame.cancelAsset=null;if(ticket===frame.assetTicket)frame.loadingObject=null;}
 }
 private applyPassiveContext(frame:Frame,entry:WindowEntry):boolean {
  if(!frame.image||frame.assetObject!==entry.object_id||!frame.mappingFingerprint||this.pendingCameras.has(entry.window_id+':'+entry.object_id))return false;const context=readWindowViewContext(entry.view_context,{object_id:entry.object_id},frame.mappingFingerprint);if(!context)return false;
  const box=frame.body.getBoundingClientRect();if(!Number.isFinite(box.width)||!Number.isFinite(box.height)||box.width<=0||box.height<=0)return false;const key=JSON.stringify(context.camera_origin?[context.camera,context.camera_origin,box.width,box.height]:[context.camera,box.width,box.height]);if(key===frame.appliedCamera)return false;
  if(context.camera_origin==='new_fit_preference'){frame.appliedCamera=key;this.fitPassive(frame);frame.status.textContent='只读对照 · 新适应视野';return true;}
  frame.camera={scale:context.camera.scale,x:box.width/2-context.camera.center_image_xy[0]*context.camera.scale,y:box.height/2-context.camera.center_image_xy[1]*context.camera.scale};frame.appliedCamera=key;this.paintPassive(frame);return true;
 }
 private fitPassive(frame:Frame){if(!frame.image)return;const area=frame.body.getBoundingClientRect(),scale=Math.max(.02,Math.min(area.width/frame.imageSize[0]!,area.height/frame.imageSize[1]!)*.94);frame.camera={scale,x:(area.width-frame.imageSize[0]!*scale)/2,y:(area.height-frame.imageSize[1]!*scale)/2};this.paintPassive(frame);}
 private paintPassive(frame:Frame){if(!frame.image)return;const transform=`translate(${frame.camera.x}px,${frame.camera.y}px) scale(${frame.camera.scale})`;frame.image.style.transform=transform;frame.overlay?.remove?.();const exact=this.collection?.windows.some(entry=>this.frames.get(entry.window_id)===frame&&entry.object_id===frame.assetObject);frame.overlay=exact?createSourceOverlay(this.options.document,frame.objectMetadata,this.collection,frame.imageSize,frame.camera.scale):null;if(frame.overlay){Object.assign(frame.overlay.style,{width:frame.imageSize[0]+'px',height:frame.imageSize[1]+'px',transform});frame.body.append(frame.overlay);}}
 updateActiveSourceOverlay():void {this.activeOverlay?.remove?.();this.activeOverlay=null;if(!this.options.activeStage||!this.options.getActiveImageSize)return;this.activeOverlay=createSourceOverlay(this.options.document,this.options.getState()?.object,this.collection,this.options.getActiveImageSize(),this.options.getActiveScale?.()??1);if(this.activeOverlay)this.options.activeStage.append(this.activeOverlay);}
}
