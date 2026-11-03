// Actual window-manager handlers with a bounded DOM/transport substitute.
// These checks qualify presentation state, not native browser gestures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WindowWorkspace,readWindowCollection,tiledWindowLayouts,readWindowCamera,readWindowViewContext} from '../ui/image-panel/window-workspace.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const id=n=>n.toString(16).padStart(32,'0');
const boundsStyle=element=>Object.fromEntries(['left','top','width','height'].map(key=>[key,element.style[key]]));
function collection(){return {schema_version:1,revision:1,frame_object_id:id(1),active_window_id:id(2),windows:[
 {window_id:id(1),object_id:id(11),role:'source',title:'来源图像',layout:{x:0,y:0,width:.5,height:1,z:1}},
 {window_id:id(2),object_id:id(12),role:'fft',title:'FFT A',layout:{x:.5,y:0,width:.5,height:1,z:2},source_reference:{input_view_object_id:id(11),frame_object_id:id(1),raw_fft_object_id:id(22),processing_rect_xyxy:[8,9,40,41],calibration_relation:'same'}}
]};}
async function harness(initial=collection(),{camera=false,onActivate,assetTimeoutMs=1000,activeBase=false}={}){
 const ids=new Map(),requests=[],errors=[],mirrors=[],observers=[],timers=new Map();let timerId=0,metadataWait=null,assetWait=null,assetReadWait=null,imageMounted=null,scientificGesture=false,cameraFailure=false,fitCount=0,bounds=0;
 const state={object:{object_id:initial.windows.find(entry=>entry.window_id===initial.active_window_id)?.object_id??id(12)},state_revision:4,selection:{kind:'point',coordinates:[.125,0]},edit_state:{dirty:true,draft_revision:18},last_operation:{state:'submitted',request_id:'original-request'},reason:'未保存的观察理由',window_collection:copy(initial)};
 if(camera)state.panel_mapping_fingerprint='f'.repeat(64);
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.replaceCount=0;this.style={};this.attributes={};this.hidden=false;this.width=128;this.height=96;this.naturalWidth=128;this.naturalHeight=96;this.rect={left:0,top:0,width:600,height:280};this.classes=new Set();this.classList={toggle:(name,on)=>{const next=on??!this.classes.has(name);if(next)this.classes.add(name);else this.classes.delete(name);return next;},contains:name=>this.classes.has(name)};}
  set textContent(value){this.text=String(value);this.replaceChildren();}get textContent(){return this.text??'';}
  setAttribute(name,value){this.attributes[name]=String(value);}
  append(...children){for(const child of children){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(c=>c!==child);this.children.push(child);child.parentNode=this;if(child.tagName==='img'&&imageMounted){const resolve=imageMounted;imageMounted=null;resolve();}}}
  replaceChildren(...children){this.replaceCount++;for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
  getBoundingClientRect(){return this.rect;}setPointerCapture(){}async decode(){if(assetWait)await assetWait;}
 }
 const get=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
 const viewport=get('viewport'),desktop=get('window-desktop');desktop.rect={left:0,top:0,width:1200,height:600};desktop.append(viewport);
 const document={getElementById:get,createElement:tag=>new Element(tag)};
 const api=async(url,body)=>{
  requests.push({url,body:body?copy(body):undefined});
  if(!body){const query=new URL(url,'http://panel.test').searchParams,window=state.window_collection.windows.find(value=>value.window_id===query.get('window_id')),reply={schema_version:1,collection_revision:Number(query.get('revision')),window_id:window.window_id,object_id:window.object_id,object:{object_id:window.object_id},panel_mapping_fingerprint:camera?'f'.repeat(64):undefined,png_base64:'public-synthetic-placeholder'};if(assetReadWait)await assetReadWait;if(reply.collection_revision!==state.window_collection.revision)throw new Error('Asset read belongs to an older collection revision');return reply;}
  // Model transport serialization: server mutation cannot alter the client's
  // currently captured collection object before the response is adopted.
  const original=copy(state),response=copy(state);if(metadataWait)await metadataWait;
  if(body.expected_object_id!==state.object.object_id)return {...original,window_collection:{...original.window_collection,revision:original.window_collection.revision+1}};
  assert.equal(body.params.collection_revision,state.window_collection.revision);
  if(body.action==='window-layout'){for(const value of body.params.windows)response.window_collection.windows.find(w=>w.window_id===value.window_id).layout=copy(value.layout);}
  else if(body.action==='close-window'){assert.notEqual(body.params.window_id,state.window_collection.active_window_id);response.window_collection.windows=response.window_collection.windows.filter(value=>value.window_id!==body.params.window_id);}
  else if(['window-context','window-camera'].includes(body.action)){if(cameraFailure){cameraFailure=false;throw new Error('Controlled camera acknowledgement failure');}const entry=response.window_collection.windows.find(value=>value.window_id===(body.params.window_id??response.window_collection.active_window_id));assert.ok(entry);if(body.action==='window-context'){assert.equal(body.draft_revision,state.edit_state.draft_revision);assert.equal(state.edit_state.dirty,false);}else assert.equal(body.params.object_id,entry.object_id);entry.view_context={version:1,object_id:entry.object_id,panel_mapping_fingerprint:'f'.repeat(64),camera:copy(body.params.camera),selection_candidate:body.action==='window-context'?copy(state.selection):copy(entry.view_context?.selection_candidate??null),selected_annotation_id:body.action==='window-context'?body.params.selected_annotation_id:entry.view_context?.selected_annotation_id??null};}
  else assert.fail('No scientific action belongs to window layout');
  response.window_collection.revision++;response.state_revision++;
  assert.deepEqual(state.selection,original.selection);assert.deepEqual(state.edit_state,original.edit_state);assert.deepEqual(state.last_operation,original.last_operation);assert.equal(state.reason,original.reason);
  return response;
 };
 const base=activeBase?{object_id:state.object.object_id,image:new Element('img'),panel_mapping_fingerprint:'f'.repeat(64),object:{object_id:state.object.object_id}}:null;if(base)base.image.src='data:image/png;base64,qualified-clean-base';
 const workspace=new WindowWorkspace({document,viewport,getState:()=>state,api,getActiveSavedImage:()=>base,isScientificGesture:()=>scientificGesture,onActivate,assetTimeoutMs,assetTimer:{set:(callback,ms)=>{timers.set(++timerId,{callback,ms});return timerId;},clear:id=>timers.delete(id)},schedule:(callback,ms)=>{timers.set(++timerId,{callback,ms});return timerId;},cancelSchedule:id=>timers.delete(id),onCollection:(value,revision)=>{mirrors.push(copy(value));state.window_collection=copy(value);state.state_revision=revision;},onError:message=>errors.push(message),onActiveFit:()=>fitCount++,onBoundsChange:()=>bounds++,observe:(_el,callback)=>observers.push(callback)});
 workspace.sync(state);await settle();
 const frame=windowId=>desktop.children.find(value=>value.attributes['data-window-id']===windowId),header=windowId=>frame(windowId).children[0],body=windowId=>frame(windowId).children[1];
 const event=(target,x,y,extra={})=>({target,clientX:x,clientY:y,pointerId:1,button:0,deltaY:0,preventDefault(){},...extra});
 return {workspace,state,requests,errors,mirrors,viewport,desktop,get,frame,header,body,event,Element,settle,base,expireAssetLoads:async()=>{for(const [id,timer]of [...timers])if(timer.ms===assetTimeoutMs){timers.delete(id);timer.callback();}await settle();},nextImageMount:()=>new Promise(resolve=>{imageMounted=resolve;}),setScientificGesture:value=>{scientificGesture=value;},resize:(width,height=600)=>{desktop.rect.width=width;desktop.rect.height=height;for(const callback of observers)callback();},delayMetadata:value=>{metadataWait=value;},delayAsset:value=>{assetWait=value;},delayAssetRead:value=>{assetReadWait=value;},failCamera:()=>{cameraFailure=true;},fits:()=>fitCount,bounds:()=>bounds};
}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}

test('bounded collection rejects ambiguous membership and malformed geometry',()=>{
 assert.ok(readWindowCollection(collection()));const duplicate=collection();duplicate.windows.push(copy(duplicate.windows[0]));assert.equal(readWindowCollection(duplicate),null);
 const wrong=collection();wrong.active_window_id=id(99);assert.equal(readWindowCollection(wrong),null);
 const bad=collection();bad.windows[0].layout.width=Infinity;assert.equal(readWindowCollection(bad),null);
 const many=collection();many.windows=Array.from({length:6},(_,i)=>({...copy(many.windows[0]),window_id:id(10+i)}));assert.equal(readWindowCollection(many),null);
});
test('one existing viewport is mounted only inside the active window',async()=>{
 const h=await harness();assert.equal(h.viewport.parentNode,h.body(id(2)));assert.equal(h.frame(id(2)).children[0].children[1].textContent,'当前编辑');assert.equal(h.header(id(1)).children[1].textContent,'只读对照');
 assert.equal(h.body(id(1)).children[0].tagName,'img');assert.equal(h.requests.filter(request=>request.url.startsWith('/api/window-asset')).length,1);assert.equal(h.requests.filter(request=>request.body).length,0);
 assert.equal(h.header(id(2)).children[2].children[1].disabled,true);
});
test('drag and resize persist layout only after pointer release and preserve science drafts',async()=>{
 const h=await harness(),before=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation,reason:h.state.reason}),title=h.header(id(1));
 title.onpointerdown(h.event(title,10,10));title.onpointermove(h.event(title,130,70));assert.equal(h.requests.filter(r=>r.body).length,0);title.onpointerup(h.event(title,130,70));await h.workspace.settled();
 let layouts=h.requests.filter(r=>r.body).at(-1).body;assert.equal(layouts.action,'window-layout');assert.equal(layouts.params.windows[0].layout.x,.1);assert.equal(layouts.params.windows[0].layout.y,0);
 const handle=h.frame(id(1)).children[3];handle.onpointerdown(h.event(handle,0,0));handle.onpointermove(h.event(handle,120,-120));handle.onpointerup(h.event(handle,120,-120));await h.workspace.settled();layouts=h.requests.filter(r=>r.body).at(-1).body;assert.equal(layouts.params.windows[0].layout.width,.6);assert.equal(layouts.params.windows[0].layout.height,.8);
 assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation,reason:h.state.reason},before);assert.equal(h.viewport.parentNode,h.body(id(2)));
});
test('tiling is bounded, nonoverlapping and does not fit or alter the active camera',async()=>{
 const items=Array.from({length:5},(_,i)=>({window_id:id(i+1)})),layouts=tiledWindowLayouts(items);assert.equal(layouts.length,5);for(const {layout:r}of layouts){assert.ok(r.x+r.width<=1);assert.ok(r.y+r.height<=1);}
 const h=await harness();await h.get('tile-windows').onclick();await h.workspace.settled();assert.equal(h.fits(),0);assert.equal(h.state.window_collection.active_window_id,id(2));assert.equal(h.requests.filter(r=>r.body).at(-1).body.action,'window-layout');
});
test('metadata synchronization never detaches or replaces the mounted editor tree',async()=>{
 const h=await harness(),editorRoot=h.frame(id(2)),editorBody=h.body(id(2)),replacements={desktop:h.desktop.replaceCount,root:editorRoot.replaceCount,body:editorBody.replaceCount};
 h.workspace.tile();await h.workspace.settled();assert.equal(h.frame(id(2)),editorRoot);assert.equal(h.viewport.parentNode,editorBody);assert.equal(h.desktop.replaceCount,replacements.desktop);assert.equal(editorRoot.replaceCount,replacements.root);assert.equal(editorBody.replaceCount,replacements.body);
 await h.workspace.closeWindow(id(1));assert.equal(h.viewport.parentNode,editorBody);assert.equal(h.desktop.replaceCount,replacements.desktop);assert.equal(editorBody.replaceCount,replacements.body);
});
test('scientific gesture defers active geometry while passive layouts update, then flushes the qualified layout',async()=>{
 const h=await harness(),active=h.frame(id(2)),before=boundsStyle(active),science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});h.setScientificGesture(true);
 const next=copy(h.state.window_collection);next.revision++;next.windows[0].layout={x:0,y:0,width:.4,height:.8,z:3};next.windows[1].layout={x:.4,y:.1,width:.6,height:.8,z:4};h.state.window_collection=next;h.workspace.sync(h.state);
 assert.deepEqual(boundsStyle(active),before);assert.equal(active.style.zIndex,'4');assert.equal(h.frame(id(1)).style.width,'calc(40% - 8px)');h.workspace.flushDeferredLayout();assert.deepEqual(boundsStyle(active),before);
 h.setScientificGesture(false);h.workspace.flushDeferredLayout();assert.equal(active.style.left,'calc(40% + 4px)');assert.equal(active.style.top,'calc(10% + 4px)');assert.equal(active.style.width,'calc(60% - 8px)');assert.equal(h.viewport.parentNode,h.body(id(2)));
 assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('gesture end does not apply an unacknowledged local tile candidate',async()=>{
 const initial=collection();initial.windows[1].layout={x:.3,y:0,width:.7,height:1,z:2};const h=await harness(initial),active=h.frame(id(2)),before=copy(active.style);let release;h.delayMetadata(new Promise(resolve=>{release=resolve;}));h.setScientificGesture(true);h.workspace.tile();await settle();
 h.setScientificGesture(false);h.workspace.flushDeferredLayout();assert.deepEqual(active.style,before);release();await h.workspace.settled();assert.equal(active.style.left,'calc(50% + 4px)');assert.equal(active.style.width,'calc(50% - 8px)');assert.equal(h.state.window_collection.active_window_id,id(2));
});
test('a deferred geometry cannot be applied after the current scientific object changes',async()=>{
 const h=await harness(),active=h.frame(id(2)),before=boundsStyle(active);h.setScientificGesture(true);const next=copy(h.state.window_collection);next.revision++;next.windows[1].layout={x:0,y:0,width:1,height:1,z:3};h.state.window_collection=next;h.workspace.sync(h.state);h.state.object.object_id=id(99);h.setScientificGesture(false);h.workspace.flushDeferredLayout();assert.deepEqual(boundsStyle(active),before);assert.equal(h.state.object.object_id,id(99));assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('content click brings a passive window to front without activating or moving its image',async()=>{
 const h=await harness(),before=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation,reason:h.state.reason}),source=h.frame(id(1)),position=boundsStyle(source),camera=h.body(id(1)).children[0].style.transform;
 source.onpointerdown(h.event(h.body(id(1)),10,10));assert.equal(source.style.zIndex,'2');assert.deepEqual(boundsStyle(source),position);await h.workspace.settled();assert.equal(h.state.window_collection.active_window_id,id(2));assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation,reason:h.state.reason},before);assert.equal(h.body(id(1)).children[0].style.transform,camera);assert.equal(h.requests.filter(request=>request.body).length,1);assert.equal(h.requests.find(request=>request.body).body.action,'window-layout');
});
test('active canvas click raises z immediately during a scientific gesture while xy and size stay fixed',async()=>{
 const h=await harness();h.frame(id(1)).onpointerdown(h.event(h.body(id(1)),10,10));await h.workspace.settled();const active=h.frame(id(2)),before=boundsStyle(active),selection=copy(h.state.selection);h.setScientificGesture(true);active.onpointerdown(h.event(h.viewport,10,10));assert.equal(active.style.zIndex,'2');assert.deepEqual(boundsStyle(active),before);await h.workspace.settled();assert.deepEqual(boundsStyle(active),before);assert.deepEqual(h.state.selection,selection);assert.equal(h.state.window_collection.active_window_id,id(2));assert.ok(h.state.window_collection.windows.every(entry=>entry.layout.z<=2));
});
test('header drag and its bubbling pointer event persist once, while action buttons do not raise',async()=>{
 const h=await harness(),header=h.header(id(1)),root=h.frame(id(1)),event=h.event(header,10,10);header.onpointerdown(event);root.onpointerdown(event);assert.equal(h.requests.filter(request=>request.body).length,0);header.onpointerup(h.event(header,10,10));await h.workspace.settled();assert.equal(h.requests.filter(request=>request.body).length,1);const count=h.requests.length;root.onpointerdown(h.event(header.children[2].children[0],10,10));root.onpointerdown(h.event(header.children[2].children[1],10,10));assert.equal(h.requests.length,count);
});
test('passive pan and zoom issue no selection, measurement or write action',async()=>{
 const h=await harness(),body=h.body(id(1)),img=body.children[0],before=copy(h.state.selection),count=h.requests.length;
 body.onpointerdown(h.event(body,10,20));body.onpointermove(h.event(body,45,55));body.onpointerup(h.event(body,45,55));const pan=img.style.transform;body.onwheel(h.event(body,40,40,{deltaY:-100}));assert.notEqual(img.style.transform,pan);assert.equal(h.requests.length,count);assert.deepEqual(h.state.selection,before);assert.equal(h.state.window_collection.active_window_id,id(2));
});
test('narrow mode preserves every window and allows closing a passive view through the list',async()=>{
 const h=await harness();h.resize(704);assert.equal(h.frame(id(1)).hidden,true);assert.equal(h.frame(id(2)).hidden,false);assert.match(h.get('window-count').textContent,/其余窗口保留/);assert.equal(h.get('tile-windows').disabled,true);
 const passiveRow=h.get('window-list').children[0];await passiveRow.children[1].onclick();assert.equal(h.state.window_collection.windows.length,1);assert.equal(h.state.window_collection.active_window_id,id(2));assert.equal(h.state.last_operation.request_id,'original-request');assert.equal(h.state.reason,'未保存的观察理由');
});
test('closing the active view is blocked without a backend call',async()=>{
 const h=await harness(),count=h.requests.length;await h.workspace.closeWindow(id(2));assert.equal(h.requests.length,count);assert.match(h.errors[0],/当前编辑/);assert.equal(h.viewport.parentNode,h.body(id(2)));
});
test('single view presentation toggle and width changes do not fit or change the active object',async()=>{
 const h=await harness();h.get('single-window').onclick();assert.equal(h.frame(id(1)).hidden,true);h.resize(704);h.resize(1400);assert.equal(h.frame(id(1)).hidden,true);h.get('single-window').onclick();assert.equal(h.frame(id(1)).hidden,false);assert.equal(h.fits(),0);assert.equal(h.requests.filter(r=>r.body).length,0);assert.equal(h.state.object.object_id,id(12));
});
test('metadata readback never adopts a changed current object',async()=>{
 const h=await harness();let release;const wait=new Promise(resolve=>{release=resolve;});h.delayMetadata(wait);h.workspace.tile();await settle();h.state.object.object_id=id(98);release();await h.workspace.settled();assert.match(h.errors[0],/窗口操作读回时当前图已变化/);assert.equal(h.mirrors.length,0);assert.equal(h.state.object.object_id,id(98));
});
test('legacy or missing collection falls back to the original viewport without scientific actions',async()=>{
 const h=await harness();delete h.state.window_collection;h.workspace.sync(h.state);assert.deepEqual(h.desktop.children,[h.viewport]);assert.equal(h.get('window-controls').hidden,true);assert.equal(h.requests.filter(r=>r.body).length,0);
});
test('a collection naming another object active falls back to the actual current editor',async()=>{
 const h=await harness();h.state.window_collection.active_window_id=id(1);h.workspace.sync(h.state);assert.deepEqual(h.desktop.children,[h.viewport]);assert.equal(h.get('window-controls').hidden,true);assert.equal(h.state.object.object_id,id(12));assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('layout revision change retries only the still-matching readonly asset once',async()=>{
 const h=await harness();let release;h.delayAssetRead(new Promise(resolve=>{release=resolve;}));h.state.window_collection.windows[0].object_id=id(13);h.state.window_collection.revision++;const count=h.requests.filter(request=>!request.body).length,mounted=h.nextImageMount();h.workspace.sync(h.state);h.workspace.tile();await h.workspace.settled();release();await mounted;
 assert.equal(h.requests.filter(request=>!request.body).length-count,2);assert.equal(h.body(id(1)).children[0].tagName,'img');assert.equal(h.state.window_collection.windows[0].object_id,id(13));assert.equal(h.requests.filter(request=>request.body).length,1);assert.equal(h.requests.filter(request=>request.body)[0].body.action,'window-layout');assert.equal(h.state.last_operation.request_id,'original-request');
});
test('readonly source keeps its last valid bitmap while an exact replacement read is pending',async()=>{
 const h=await harness(),previous=h.body(id(1)).children[0],science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});h.delayAssetRead(new Promise(()=>{}));h.state.window_collection.windows[0].object_id=id(13);h.state.window_collection.revision++;const reads=h.requests.filter(request=>!request.body).length;h.workspace.sync(h.state);await settle();for(let i=0;i<4;i++)h.workspace.sync(h.state);
 assert.equal(h.body(id(1)).children.includes(previous),true,'a pending readonly GET must not replace a previously qualified bitmap with an empty loading body');assert.equal(h.requests.filter(request=>!request.body).length-reads,1);assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);
});
test('first active source to FFT keeps the exact earlier clean base visible until its annotated saved asset is qualified',async()=>{
 const initial=collection();initial.active_window_id=id(1);const h=await harness(initial,{camera:true,activeBase:true}),base=h.base.image;assert.equal(h.viewport.parentNode,h.body(id(1)));h.state.object.object_id=id(13);h.state.window_collection.windows[0].object_id=id(13);h.state.window_collection.revision++;h.workspace.sync(h.state);
 let release;h.delayAssetRead(new Promise(resolve=>{release=resolve;}));h.state.object.object_id=id(12);h.state.window_collection.active_window_id=id(2);h.state.window_collection.revision++;const science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});h.workspace.sync(h.state);await settle();assert.equal(h.body(id(1)).children.includes(base),true,'the first passive source must keep its decoded earlier clean base even before any readonly asset has mounted');assert.match(h.header(id(1)).children[1].textContent,/上一已核对底图.*标注待加载/);assert.equal(h.state.window_collection.windows[0].object_id,id(13));assert.equal(h.base.object_id,id(11),'a new annotation object must not relabel the earlier decoded image');
 const fit=h.header(id(1)).children[2].children[0];assert.equal(fit.disabled,true);fit.onclick();h.body(id(1)).onwheel(h.event(h.body(id(1)),20,20,{deltaY:-80}));await h.workspace.awaitStableMetadata();assert.equal(h.requests.filter(request=>request.body).length,0);assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);
 const mounted=h.nextImageMount();release();await mounted;await settle();assert.notEqual(h.body(id(1)).children[0],base);assert.equal(h.header(id(1)).children[1].textContent,'只读对照');assert.equal(fit.disabled,false);assert.equal(h.requests.filter(request=>request.body).length,0);
});
for(const phase of ['read','decode'])test(`readonly source ${phase} has a finite loading deadline and explicit readonly retry`,async()=>{
 const h=await harness(),science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});let release;const blocked=new Promise(resolve=>{release=resolve;});if(phase==='read')h.delayAssetRead(blocked);else h.delayAsset(blocked);h.state.window_collection.windows[0].object_id=id(13);h.state.window_collection.revision++;h.workspace.sync(h.state);await settle();await h.expireAssetLoads();
 const retry=h.header(id(1)).children[2].children.find(child=>child.textContent==='重试只读图像');assert.ok(retry,'an unsettled read/decode must leave loading with a reviewable retry, not remain permanently pending');assert.equal(retry.hidden,false);assert.match(h.header(id(1)).children[1].textContent,/读取超时/);assert.equal(h.requests.filter(request=>request.body).length,0);const count=h.requests.length;for(let i=0;i<4;i++)h.workspace.sync(h.state);await settle();assert.equal(h.requests.length,count,'rendering the same failed object must not replay its GET automatically');
 h.resize(704);const listRetry=h.get('window-list').children[0].children.find(child=>child.textContent==='重试只读图像');assert.ok(listRetry);assert.equal(listRetry.hidden,false,'readonly retry remains reachable through the narrow window list');release();if(phase==='read')h.delayAssetRead(null);else h.delayAsset(null);await(phase==='read'?listRetry:retry).onclick();await settle();assert.equal(h.body(id(1)).children[0].tagName,'img');assert.equal(retry.hidden,true);assert.equal(h.get('window-list').children[0].children.find(child=>child.textContent==='重试只读图像').hidden,true);assert.equal(h.header(id(1)).children[1].textContent,'只读对照');assert.equal(h.requests.filter(request=>request.body).length,0);assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);
});
test('late cancelled source decoding cannot replace a newer exact readonly asset',async()=>{
 const h=await harness(),science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});let release;h.delayAsset(new Promise(resolve=>{release=resolve;}));h.state.window_collection.windows[0].object_id=id(13);h.state.window_collection.revision++;h.workspace.sync(h.state);await settle();
 h.delayAsset(null);h.state.window_collection.windows[0].object_id=id(14);h.state.window_collection.revision++;h.workspace.sync(h.state);await settle();const exact=h.body(id(1)).children[0];assert.equal(exact.tagName,'img');release();await settle();await h.expireAssetLoads();assert.equal(h.body(id(1)).children[0],exact);assert.equal(h.header(id(1)).children[1].textContent,'只读对照');assert.equal(h.state.window_collection.windows[0].object_id,id(14));assert.equal(h.requests.filter(request=>request.body).length,0);assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);
});
test('a source becoming active cancels pending readonly work without replacing the mounted editor',async()=>{
 const h=await harness(),selection=copy(h.state.selection),lease=copy(h.state.edit_state);let release;h.delayAsset(new Promise(resolve=>{release=resolve;}));h.state.window_collection.windows[0].object_id=id(13);h.state.window_collection.revision++;h.workspace.sync(h.state);await settle();h.state.object.object_id=id(13);h.state.window_collection.active_window_id=id(1);h.state.window_collection.revision++;h.workspace.sync(h.state);release();await settle();await h.expireAssetLoads();assert.equal(h.viewport.parentNode,h.body(id(1)));assert.equal(h.body(id(1)).children.includes(h.viewport),true);assert.equal(h.header(id(1)).children[1].textContent,'当前编辑');assert.equal(h.header(id(1)).children[2].children.find(child=>child.textContent==='重试只读图像').hidden,true);assert.deepEqual(h.state.selection,selection);assert.deepEqual(h.state.edit_state,lease);assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('window camera uses one bounded canonical camera and rejects mismatched restoration identities',()=>{
 assert.deepEqual(readWindowCamera({scale:2,center_image_xy:[24.5,-4]}),{scale:2,center_image_xy:[24.5,-4]});for(const raw of [{scale:0,center_image_xy:[0,0]},{scale:2,center_image_xy:[Infinity,0]},{scale:2,center_image_xy:[1e8,0]}])assert.equal(readWindowCamera(raw),null);
 const context={version:1,object_id:id(11),panel_mapping_fingerprint:'f'.repeat(64),camera:{scale:2,center_image_xy:[20,30]},selection_candidate:null,selected_annotation_id:null};assert.ok(readWindowViewContext(context,{object_id:id(11)},'f'.repeat(64)));assert.equal(readWindowViewContext(context,{object_id:id(12)},'f'.repeat(64)),null);assert.equal(readWindowViewContext(context,{object_id:id(11)},'e'.repeat(64)),null);
});

test('verified historical inputs without a saved camera receive an explicitly new fit preference',async()=>{
 const initial=collection(),entry=initial.windows[0];entry.view_context={version:1,object_id:entry.object_id,panel_mapping_fingerprint:'f'.repeat(64),camera:{scale:1,center_image_xy:[0,0]},camera_origin:'new_fit_preference',selection_candidate:null,selected_annotation_id:null};
 assert.equal(readWindowViewContext(entry.view_context).camera_origin,'new_fit_preference');assert.equal(readWindowViewContext({...entry.view_context,camera_origin:'invented_historical_camera'}),null);
 const h=await harness(initial,{camera:true}),transform=h.body(id(1)).children[0].style.transform;
 assert.notEqual(transform,'translate(300px,140px) scale(1)');assert.match(h.header(id(1)).children[1].textContent,/新适应视野/);assert.equal(h.requests.filter(request=>request.body).length,0,'readonly fitting must not execute science or invent an acknowledgement');
});
test('window camera wheel bursts merge the last view without changing scientific drafts or request identity',async()=>{
 const h=await harness(collection(),{camera:true}),body=h.body(id(1)),before=copy({selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation,reason:h.state.reason});for(let i=0;i<6;i++)body.onwheel(h.event(body,120,90,{deltaY:-20}));const transform=body.children[0].style.transform;await h.workspace.awaitStableMetadata();const writes=h.requests.filter(request=>request.body);assert.equal(writes.length,1);assert.equal(writes[0].body.action,'window-camera');assert.equal(writes[0].body.params.object_id,id(11));assert.equal(body.children[0].style.transform,transform);assert.deepEqual({selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation,reason:h.state.reason},before);assert.equal(h.workspace.hasPendingMetadata(),false);
});
test('window camera persists the last passive look before the explicit edit callback, including narrow list access',async()=>{
 let h;const intents=[];h=await harness(collection(),{camera:true,onActivate:async(windowId,objectId)=>{h.workspace.setSwitchLocked(true);await h.workspace.awaitStableMetadata();intents.push({windowId,objectId,camera:copy(h.state.window_collection.windows[0].view_context.camera)});h.workspace.setSwitchLocked(false);}});const body=h.body(id(1));body.onwheel(h.event(body,100,100,{deltaY:-90}));h.resize(704);await h.get('window-list').children[0].children[2].onclick();assert.equal(intents.length,1);assert.equal(intents[0].windowId,id(1));assert.equal(intents[0].objectId,id(11));assert.deepEqual(intents[0].camera,h.requests.find(request=>request.body?.action==='window-camera').body.params.camera);assert.equal(h.state.window_collection.active_window_id,id(2));assert.equal(h.requests.filter(request=>request.body&&request.body.action!=='window-camera').length,0);
});
test('a resized passive viewport reapplies its saved center before explicit activation without refitting or writing',async()=>{
 const initial=collection(),camera={scale:2,center_image_xy:[80,50]};initial.windows[0].view_context={version:1,object_id:id(11),panel_mapping_fingerprint:'f'.repeat(64),camera:copy(camera),selection_candidate:null,selected_annotation_id:null};
 let h;const intents=[];h=await harness(initial,{camera:true,onActivate:async(windowId,objectId)=>{await h.workspace.awaitStableMetadata();intents.push({windowId,objectId,camera:copy(h.state.window_collection.windows[0].view_context.camera),transform:h.body(windowId).children[0].style.transform});}});
 const body=h.body(id(1)),science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});assert.equal(body.children[0].style.transform,'translate(140px,40px) scale(2)');
 body.rect.width=800;body.rect.height=360;h.resize(1400);assert.equal(body.children[0].style.transform,'translate(240px,80px) scale(2)');
 await h.workspace.requestActivation(id(1));assert.deepEqual(intents,[{windowId:id(1),objectId:id(11),camera,transform:'translate(240px,80px) scale(2)'}]);assert.equal(h.requests.filter(request=>request.body).length,0);assert.equal(h.fits(),0);assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);
});
test('fit cannot save a previous passive asset camera while the new exact object is still decoding',async()=>{
 const h=await harness(collection(),{camera:true}),science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});let release;h.delayAsset(new Promise(resolve=>{release=resolve;}));
 const camera={scale:3,center_image_xy:[80,60]},entry=h.state.window_collection.windows[0];entry.object_id=id(13);entry.view_context={version:1,object_id:id(13),panel_mapping_fingerprint:'f'.repeat(64),camera:copy(camera),selection_candidate:null,selected_annotation_id:null};h.state.window_collection.revision++;h.workspace.sync(h.state);await settle();
 const fit=h.header(id(1)).children[2].children[0];assert.equal(fit.disabled,true);fit.onclick();await h.workspace.awaitStableMetadata();assert.equal(h.requests.filter(request=>request.body?.action==='window-camera').length,0);assert.deepEqual(h.state.window_collection.windows[0].view_context.camera,camera);
 const mounted=h.nextImageMount();release();await mounted;await settle();assert.equal(fit.disabled,false);assert.equal(h.body(id(1)).children[0].style.transform,'translate(60px,-40px) scale(3)');assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('window context metadata includes the exact active draft lease and preserves the active selection',async()=>{
 const h=await harness(collection(),{camera:true});h.state.edit_state.dirty=false;h.state.last_operation={state:'completed',request_id:'previous-science'};const before=copy(h.state.selection);await h.workspace.saveActiveContext({scale:2,center_image_xy:[50.25,30.5]},null,18);const action=h.requests.find(request=>request.body).body;assert.equal(action.action,'window-context');assert.equal(action.draft_revision,18);assert.deepEqual(h.state.selection,before);assert.equal(h.state.last_operation.request_id,'previous-science');assert.deepEqual(h.state.window_collection.windows[1].view_context.selection_candidate,before);
});
test('window camera failure is not silently replayed by another request to flush metadata',async()=>{
 const h=await harness(collection(),{camera:true});h.failCamera();h.body(id(1)).onwheel(h.event(h.body(id(1)),80,60,{deltaY:-30}));await assert.rejects(h.workspace.awaitStableMetadata(),/Controlled camera/);const count=h.requests.length;await assert.rejects(h.workspace.awaitStableMetadata(),/Controlled camera/);assert.equal(h.requests.length,count);assert.equal(h.state.last_operation.request_id,'original-request');assert.equal(h.state.edit_state.dirty,true);
});
