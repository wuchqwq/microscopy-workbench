import type {BrowserDocument,BrowserElement,BrowserEvent} from './browser-ports.mjs';

export interface WindowLayout {x:number;y:number;width:number;height:number;z:number;}
export interface WindowSourceReference {input_view_object_id:string;frame_object_id:string;raw_fft_object_id:string;processing_rect_xyxy:readonly number[];calibration_relation:'same'|'different'|'unknown';}
export interface WindowEntry {window_id:string;object_id:string;role:'source'|'roi'|'fft';title:string;layout:WindowLayout;source_reference?:WindowSourceReference;}
export interface WindowCollection {schema_version:1;revision:number;frame_object_id:string|null;active_window_id:string|null;windows:readonly WindowEntry[];unavailable_reason?:string;}
interface HostState {object:{object_id:string};state_revision?:number;window_collection?:WindowCollection;}
interface WindowOptions {
 document:BrowserDocument;viewport:BrowserElement;getState:()=>HostState|undefined;
 api:(url:string,body?:Readonly<Record<string,unknown>>)=>Promise<unknown>;
 onCollection:(collection:WindowCollection,stateRevision:number)=>void;onError:(message:string)=>void;
 onActiveFit:()=>void;onBoundsChange:()=>void;observe?:(target:BrowserElement,callback:()=>void)=>void;
 isScientificGesture?:()=>boolean;
}
interface Frame {root:BrowserElement;header:BrowserElement;body:BrowserElement;title:BrowserElement;status:BrowserElement;source:BrowserElement;close:BrowserElement;fit:BrowserElement;image:BrowserElement|null;assetObject:string|null;loadingObject:string|null;assetTicket:number;camera:{x:number;y:number;scale:number};imageSize:readonly number[];}
type LayoutGesture={kind:'move'|'resize';window_id:string;pointer_id:number;start:readonly number[];before:WindowLayout;capture:BrowserElement};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const boundedId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
export function readWindowCollection(raw:unknown):WindowCollection|null {
 if(!record(raw)||raw.schema_version!==1||!Number.isSafeInteger(raw.revision)||(raw.revision as number)<0||!Array.isArray(raw.windows)||raw.windows.length>5||raw.frame_object_id!==null&&!objectId(raw.frame_object_id)||raw.active_window_id!==null&&!boundedId(raw.active_window_id))return null;
 const seen=new Set<string>();
 for(const value of raw.windows){
  if(!record(value)||!boundedId(value.window_id)||seen.has(value.window_id)||!objectId(value.object_id)||!['source','roi','fft'].includes(String(value.role))||typeof value.title!=='string'||value.title.length>120||!record(value.layout))return null;
  seen.add(value.window_id);const r=value.layout;
  if(![r.x,r.y,r.width,r.height,r.z].every(finite)||[r.x,r.y].some(v=>(v as number)<0||(v as number)>1)||[r.width,r.height].some(v=>(v as number)<=0||(v as number)>1)||(r.x as number)+(r.width as number)>1.000001||(r.y as number)+(r.height as number)>1.000001||(r.z as number)<0||(r.z as number)>1000000)return null;
  if(value.source_reference!==undefined){const s=value.source_reference;if(!record(s)||![s.input_view_object_id,s.frame_object_id,s.raw_fft_object_id].every(objectId)||s.frame_object_id!==raw.frame_object_id||!Array.isArray(s.processing_rect_xyxy)||s.processing_rect_xyxy.length!==4||!s.processing_rect_xyxy.every(v=>Number.isSafeInteger(v)&&v>=0)||s.processing_rect_xyxy[0]>=s.processing_rect_xyxy[2]||s.processing_rect_xyxy[1]>=s.processing_rect_xyxy[3]||!['same','different','unknown'].includes(String(s.calibration_relation)))return null;}
 }
 if(raw.active_window_id!==null&&!seen.has(raw.active_window_id as string))return null;
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
 constructor(private readonly options:WindowOptions){
  const d=options.document;this.desktop=d.getElementById('window-desktop');this.controls=d.getElementById('window-controls');
  if(!this.desktop||!this.controls)return;
  const tile=d.getElementById('tile-windows');if(tile)tile.onclick=()=>this.tile();
  const single=d.getElementById('single-window');if(single)single.onclick=()=>{this.single=!this.single;this.resize();};
  options.observe?.(this.desktop,()=>this.resize());
 }
 sync(state:HostState):void {
  if(!this.desktop||!this.controls)return;
  const parsed=readWindowCollection(state.window_collection),collection=parsed&&parsed.windows.find(entry=>entry.window_id===parsed.active_window_id)?.object_id===state.object.object_id?parsed:null;
  if(!collection||!collection.windows.length||!collection.active_window_id){
   this.controls.hidden=true;this.desktop.classList.toggle('has-image-windows',false);
   this.desktop.replaceChildren(this.options.viewport);
   this.collection=null;this.frames.clear();this.deferredGeometry=null;return;
  }
  if(this.collection&&collection.revision<this.collection.revision)return;
  this.collection=collection;this.controls.hidden=false;this.desktop.classList.toggle('has-image-windows',true);
  const alive=new Set(collection.windows.map(entry=>entry.window_id));
  for(const [id,frame]of this.frames)if(!alive.has(id)){frame.assetTicket++;frame.root.remove?.();this.frames.delete(id);this.localLayouts.delete(id);}
  for(const entry of collection.windows){const frame=this.frames.get(entry.window_id)??this.makeFrame(entry.window_id);this.frames.set(entry.window_id,frame);this.updateFrame(frame,entry,entry.window_id===collection.active_window_id);}
  // Never detach the mounted editor for a layout/asset response: reparenting
  // the same DOM tree can lose an ongoing scientific pointer capture or focus.
  for(const entry of collection.windows){const frame=this.frames.get(entry.window_id)!;if(frame.root.parentNode!==this.desktop)this.desktop.append(frame.root);}
  this.resize();
 }
 private element(tag:string,className?:string,text?:string):BrowserElement{const el=this.options.document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 private makeFrame(id:string):Frame {
  const root=this.element('section','image-window'),header=this.element('div','image-window-titlebar'),title=this.element('strong'),status=this.element('span','image-window-status'),actions=this.element('div','image-window-actions');
  root.setAttribute('data-window-id',id);root.setAttribute('aria-label','图像窗口');
  const fit=this.element('button',undefined,'适应'),close=this.element('button',undefined,'关闭');fit.setAttribute('type','button');close.setAttribute('type','button');
  actions.append(fit,close);header.append(title,status,actions);const body=this.element('div','image-window-body'),source=this.element('div','image-window-source'),resize=this.element('button','image-window-resize','↘');
  resize.setAttribute('type','button');resize.setAttribute('aria-label','调整图像窗口大小');resize.title='拖动调整窗口大小；不改变图像缩放';root.append(header,body,source,resize);
  const frame:Frame={root,header,body,title,status,source,close,fit,image:null,assetObject:null,loadingObject:null,assetTicket:0,camera:{x:0,y:0,scale:1},imageSize:[1,1]};
  header.onpointerdown=event=>{if(event.target===fit||event.target===close)return;this.startLayout(event,id,'move',header);};
  resize.onpointerdown=event=>this.startLayout(event,id,'resize',resize);
  for(const target of [header,resize]){target.onpointermove=event=>this.moveLayout(event);target.onpointerup=event=>this.finishLayout(event);target.onpointercancel=event=>this.cancelLayout(event);}
  close.onclick=()=>this.closeWindow(id);fit.onclick=()=>{if(this.collection?.active_window_id===id)this.options.onActiveFit();else this.fitPassive(frame);};
  let pan:{pointer:number;x:number;y:number;before:{x:number;y:number;scale:number}}|null=null;
  body.onpointerdown=event=>{if(event.button!==0||this.collection?.active_window_id===id||!frame.image)return;event.preventDefault();pan={pointer:event.pointerId,x:event.clientX,y:event.clientY,before:{...frame.camera}};body.setPointerCapture(event.pointerId);};
  body.onpointermove=event=>{if(!pan||pan.pointer!==event.pointerId)return;frame.camera={...pan.before,x:pan.before.x+event.clientX-pan.x,y:pan.before.y+event.clientY-pan.y};this.paintPassive(frame);};
  body.onpointerup=event=>{if(pan?.pointer===event.pointerId)pan=null;};body.onpointercancel=()=>{pan=null;};
  body.onwheel=event=>{if(this.collection?.active_window_id===id||!frame.image)return;event.preventDefault();const r=body.getBoundingClientRect(),factor=Math.exp(-event.deltaY*.0015),scale=clamp(frame.camera.scale*factor,.02,100),ratio=scale/frame.camera.scale;frame.camera={scale,x:event.clientX-r.left-(event.clientX-r.left-frame.camera.x)*ratio,y:event.clientY-r.top-(event.clientY-r.top-frame.camera.y)*ratio};this.paintPassive(frame);};
  return frame;
 }
 private updateFrame(frame:Frame,entry:WindowEntry,active:boolean){
  frame.title.textContent=entry.title;frame.status.textContent=active?'当前编辑':'只读对照';frame.root.setAttribute('aria-label',entry.title+' · '+(active?'当前编辑':'只读对照'));frame.root.classList.toggle('active-image-window',active);frame.close.disabled=active;frame.close.title=active?'先返回空间观察或切换当前编辑图，再关闭此显示窗口':'只关闭此窗口；科学对象与历史仍保留';
  const source=entry.source_reference;frame.source.textContent=source?`FFT 计算窗口 [${source.processing_rect_xyxy.join(', ')}]${source.calibration_relation==='different'?' · 当前标定不同，保留历史来源':source.calibration_relation==='unknown'?' · 标定关系待核对':''}`:active?'工具与测量作用于此窗口':'只读显示；关闭不删除保存结果';
  frame.source.title=source?`不可变输入 ${source.input_view_object_id}；原 FFT ${source.raw_fft_object_id}；处理窗口不是原浮点选区`:'';
  this.geometry(frame,entry);
  if(active){frame.assetTicket++;frame.loadingObject=null;if(this.options.viewport.parentNode!==frame.body)frame.body.replaceChildren(this.options.viewport);frame.image=null;}
  else if((frame.assetObject!==entry.object_id||!frame.image)&&frame.loadingObject!==entry.object_id){void this.loadAsset(frame,entry);}
 }
 private geometry(frame:Frame,entry:WindowEntry,validatedOnly=false){const r=validatedOnly?entry.layout:this.localLayouts.get(entry.window_id)??entry.layout;if(entry.window_id===this.collection?.active_window_id&&this.options.isScientificGesture?.()){this.deferredGeometry={window_id:entry.window_id,object_id:entry.object_id};return;}Object.assign(frame.root.style,{left:`calc(${r.x*100}% + 4px)`,top:`calc(${r.y*100}% + 4px)`,width:`calc(${r.width*100}% - 8px)`,height:`calc(${r.height*100}% - 8px)`,zIndex:String(r.z)});}
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
  for(const [id,frame]of this.frames)frame.root.hidden=one&&id!==this.collection.active_window_id;
  const count=this.options.document.getElementById('window-count');if(count)count.textContent=`${this.collection.windows.length} / 5 个窗口${one?' · 仅显示当前编辑图，其余窗口保留':''}`;
  const list=this.options.document.getElementById('window-list');if(list){list.replaceChildren(...this.collection.windows.map(entry=>{const row=this.element('div','window-index-row'),label=this.element('span',undefined,entry.title+(entry.window_id===this.collection!.active_window_id?' · 当前编辑':' · 只读')),close=this.element('button',undefined,'关闭显示');close.setAttribute('type','button');close.disabled=entry.window_id===this.collection!.active_window_id;close.title='仅关闭显示，保存结果仍在工作区';close.onclick=()=>this.closeWindow(entry.window_id);row.append(label,close);return row;}));}
  const tile=this.options.document.getElementById('tile-windows');if(tile)tile.disabled=one||this.collection.windows.length<2;const single=this.options.document.getElementById('single-window');if(single){single.disabled=this.narrow;single.textContent=this.single?'多窗口比较':'单图编辑';single.setAttribute('aria-pressed',String(one));}this.options.onBoundsChange();
 }
 private startLayout(event:BrowserEvent,id:string,kind:'move'|'resize',capture:BrowserElement){
  if(event.button!==0||this.narrow||this.single||!this.collection||id===this.collection.active_window_id&&this.options.isScientificGesture?.())return;const entry=this.collection.windows.find(value=>value.window_id===id);if(!entry)return;event.preventDefault();const before={...(this.localLayouts.get(id)??entry.layout)},z=Math.max(...this.collection.windows.map(value=>(this.localLayouts.get(value.window_id)??value.layout).z))+1;
  this.localLayouts.set(id,{...before,z});this.layoutEpochs.set(id,++this.layoutEpoch);this.gesture={kind,window_id:id,pointer_id:event.pointerId,start:[event.clientX,event.clientY],before:{...before,z},capture};capture.setPointerCapture(event.pointerId);this.geometry(this.frames.get(id)!,entry);
 }
 private moveLayout(event:BrowserEvent){
  const g=this.gesture;if(!g||g.pointer_id!==event.pointerId||!this.collection||!this.desktop)return;const area=this.desktop.getBoundingClientRect();if(area.width<=0||area.height<=0)return;event.preventDefault();const dx=(event.clientX-g.start[0]!)/area.width,dy=(event.clientY-g.start[1]!)/area.height,r={...g.before};
  if(g.kind==='move'){r.x=clamp(r.x+dx,0,Math.max(0,1-r.width));r.y=clamp(r.y+dy,0,Math.max(0,1-r.height));}
  else{r.width=clamp(r.width+dx,Math.min(280/area.width,1-r.x),1-r.x);r.height=clamp(r.height+dy,Math.min(180/area.height,1-r.y),1-r.y);}
  this.localLayouts.set(g.window_id,r);this.layoutEpochs.set(g.window_id,++this.layoutEpoch);const entry=this.collection.windows.find(value=>value.window_id===g.window_id);if(entry)this.geometry(this.frames.get(g.window_id)!,entry);this.options.onBoundsChange();
 }
 private finishLayout(event:BrowserEvent){if(!this.gesture||this.gesture.pointer_id!==event.pointerId)return;this.gesture=null;this.persistLayouts();}
 private cancelLayout(event:BrowserEvent){const g=this.gesture;if(!g||g.pointer_id!==event.pointerId)return;this.localLayouts.set(g.window_id,g.before);this.gesture=null;const entry=this.collection?.windows.find(value=>value.window_id===g.window_id);if(entry)this.geometry(this.frames.get(g.window_id)!,entry);}
 tile():void {if(!this.collection||this.narrow||this.single)return;for(const item of tiledWindowLayouts(this.collection.windows)){this.localLayouts.set(item.window_id,item.layout);this.layoutEpochs.set(item.window_id,++this.layoutEpoch);}for(const entry of this.collection.windows)this.geometry(this.frames.get(entry.window_id)!,entry);this.persistLayouts();this.options.onBoundsChange();}
 private persistLayouts(){this.writes=this.writes.then(async()=>{const collection=this.collection;if(!collection)return;const windows=collection.windows.map(entry=>({window_id:entry.window_id,layout:{...(this.localLayouts.get(entry.window_id)??entry.layout)}})),epochs=new Map(this.layoutEpochs);await this.metadata('window-layout',{collection_revision:collection.revision,windows},epochs);}).catch(error=>this.options.onError((error as Error).message));}
 async closeWindow(id:string):Promise<void>{this.writes=this.writes.then(async()=>{const collection=this.collection;if(!collection)return;if(id===collection.active_window_id)throw new Error('当前编辑窗口须先返回空间观察，再关闭。');await this.metadata('close-window',{collection_revision:collection.revision,window_id:id});}).catch(error=>this.options.onError((error as Error).message));return this.writes;}
 settled():Promise<void>{return this.writes;}
 private async metadata(action:string,params:Readonly<Record<string,unknown>>,epochs?:ReadonlyMap<string,number>){
  const state=this.options.getState();if(!state)return;const expected=state.object.object_id,raw=await this.options.api('/api/action',{expected_object_id:expected,action,params});
  if(!record(raw)||!record(raw.object)||raw.object.object_id!==expected||this.options.getState()?.object.object_id!==expected)throw new Error('窗口操作读回时当前图已变化；科学编辑保持原样，请重新读取窗口状态。');
  const collection=readWindowCollection(raw.window_collection);if(!collection||this.collection&&collection.revision<this.collection.revision)throw new Error('窗口状态读回版本不匹配；没有覆盖当前编辑。');
  for(const entry of collection.windows)if(epochs&&this.layoutEpochs.get(entry.window_id)===epochs.get(entry.window_id))this.localLayouts.delete(entry.window_id);this.options.onCollection(collection,typeof raw.state_revision==='number'?raw.state_revision:state.state_revision??0);this.sync({...state,window_collection:collection});
 }
 private async loadAsset(frame:Frame,entry:WindowEntry,retries=1){
  const collection=this.collection;if(!collection)return;const ticket=++frame.assetTicket;frame.loadingObject=entry.object_id;frame.body.textContent='正在读取保存图像…';
  try{const raw=await this.options.api(`/api/window-asset?window_id=${encodeURIComponent(entry.window_id)}&revision=${collection.revision}`);if(ticket!==frame.assetTicket||!this.frames.has(entry.window_id)||this.collection?.active_window_id===entry.window_id)return;
   if(!record(raw)||raw.schema_version!==1||raw.collection_revision!==collection.revision||raw.window_id!==entry.window_id||raw.object_id!==entry.object_id||!record(raw.object)||raw.object.object_id!==entry.object_id||typeof raw.png_base64!=='string'||raw.png_base64.length>3*1024*1024)throw new Error('只读窗口保存资产身份或大小不匹配');
   const img=this.element('img','window-passive-image');img.alt=entry.title+' · 只读保存图像';img.src='data:image/png;base64,'+raw.png_base64;if(typeof img.decode==='function')await img.decode();
   if(ticket!==frame.assetTicket||this.collection?.windows.find(value=>value.window_id===entry.window_id)?.object_id!==entry.object_id||this.collection.active_window_id===entry.window_id)return;
   const size=[img.naturalWidth||img.width||128,img.naturalHeight||img.height||96],sameSize=frame.imageSize[0]===size[0]&&frame.imageSize[1]===size[1];frame.imageSize=size;frame.image=img;frame.assetObject=entry.object_id;frame.loadingObject=null;frame.body.replaceChildren(img);if(!sameSize)this.fitPassive(frame);else this.paintPassive(frame);
  }catch(error){if(ticket!==frame.assetTicket)return;frame.assetObject=null;frame.loadingObject=null;const latest=this.collection?.windows.find(value=>value.window_id===entry.window_id);if(retries>0&&latest?.object_id===entry.object_id&&this.collection?.revision!==collection.revision&&this.collection?.active_window_id!==entry.window_id){void this.loadAsset(frame,latest,retries-1);return;}frame.image=null;frame.body.textContent='只读图像暂不可用；保存对象保留。';frame.body.title=(error as Error).message;}
 }
 private fitPassive(frame:Frame){if(!frame.image)return;const area=frame.body.getBoundingClientRect(),scale=Math.max(.02,Math.min(area.width/frame.imageSize[0]!,area.height/frame.imageSize[1]!)*.94);frame.camera={scale,x:(area.width-frame.imageSize[0]!*scale)/2,y:(area.height-frame.imageSize[1]!*scale)/2};this.paintPassive(frame);}
 private paintPassive(frame:Frame){if(!frame.image)return;frame.image.style.transform=`translate(${frame.camera.x}px,${frame.camera.y}px) scale(${frame.camera.scale})`;}
}
