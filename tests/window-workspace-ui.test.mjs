// Actual window-manager handlers with a bounded DOM/transport substitute.
// These checks qualify presentation state, not native browser gestures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WindowWorkspace,readWindowCollection,tiledWindowLayouts} from '../ui/image-panel/window-workspace.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const id=n=>n.toString(16).padStart(32,'0');
function collection(){return {schema_version:1,revision:1,frame_object_id:id(1),active_window_id:id(2),windows:[
 {window_id:id(1),object_id:id(11),role:'source',title:'来源图像',layout:{x:0,y:0,width:.5,height:1,z:1}},
 {window_id:id(2),object_id:id(12),role:'fft',title:'FFT A',layout:{x:.5,y:0,width:.5,height:1,z:2},source_reference:{input_view_object_id:id(11),frame_object_id:id(1),raw_fft_object_id:id(22),processing_rect_xyxy:[8,9,40,41],calibration_relation:'same'}}
]};}
async function harness(initial=collection()){
 const ids=new Map(),requests=[],errors=[],mirrors=[],observers=[];let metadataWait=null,assetWait=null,assetReadWait=null,imageMounted=null,scientificGesture=false,fitCount=0,bounds=0;
 const state={object:{object_id:id(12)},state_revision:4,selection:{kind:'point',coordinates:[.125,0]},edit_state:{dirty:true,draft_revision:18},last_operation:{state:'submitted',request_id:'original-request'},reason:'未保存的观察理由',window_collection:copy(initial)};
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
  if(!body){const query=new URL(url,'http://panel.test').searchParams,window=state.window_collection.windows.find(value=>value.window_id===query.get('window_id')),reply={schema_version:1,collection_revision:Number(query.get('revision')),window_id:window.window_id,object_id:window.object_id,object:{object_id:window.object_id},png_base64:'public-synthetic-placeholder'};if(assetReadWait)await assetReadWait;if(reply.collection_revision!==state.window_collection.revision)throw new Error('Asset read belongs to an older collection revision');return reply;}
  // Model transport serialization: server mutation cannot alter the client's
  // currently captured collection object before the response is adopted.
  const original=copy(state),response=copy(state);if(metadataWait)await metadataWait;
  if(body.expected_object_id!==state.object.object_id)return {...original,window_collection:{...original.window_collection,revision:original.window_collection.revision+1}};
  assert.equal(body.params.collection_revision,state.window_collection.revision);
  if(body.action==='window-layout'){for(const value of body.params.windows)response.window_collection.windows.find(w=>w.window_id===value.window_id).layout=copy(value.layout);}
  else if(body.action==='close-window'){assert.notEqual(body.params.window_id,state.window_collection.active_window_id);response.window_collection.windows=response.window_collection.windows.filter(value=>value.window_id!==body.params.window_id);}
  else assert.fail('No scientific action belongs to window layout');
  response.window_collection.revision++;response.state_revision++;
  assert.deepEqual(state.selection,original.selection);assert.deepEqual(state.edit_state,original.edit_state);assert.deepEqual(state.last_operation,original.last_operation);assert.equal(state.reason,original.reason);
  return response;
 };
 const workspace=new WindowWorkspace({document,viewport,getState:()=>state,api,isScientificGesture:()=>scientificGesture,onCollection:(value,revision)=>{mirrors.push(copy(value));state.window_collection=copy(value);state.state_revision=revision;},onError:message=>errors.push(message),onActiveFit:()=>fitCount++,onBoundsChange:()=>bounds++,observe:(_el,callback)=>observers.push(callback)});
 workspace.sync(state);await settle();
 const frame=windowId=>desktop.children.find(value=>value.attributes['data-window-id']===windowId),header=windowId=>frame(windowId).children[0],body=windowId=>frame(windowId).children[1];
 const event=(target,x,y,extra={})=>({target,clientX:x,clientY:y,pointerId:1,button:0,deltaY:0,preventDefault(){},...extra});
 return {workspace,state,requests,errors,mirrors,viewport,desktop,get,frame,header,body,event,Element,settle,nextImageMount:()=>new Promise(resolve=>{imageMounted=resolve;}),setScientificGesture:value=>{scientificGesture=value;},resize:(width,height=600)=>{desktop.rect.width=width;desktop.rect.height=height;for(const callback of observers)callback();},delayMetadata:value=>{metadataWait=value;},delayAsset:value=>{assetWait=value;},delayAssetRead:value=>{assetReadWait=value;},fits:()=>fitCount,bounds:()=>bounds};
}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}

test('clicking image content or the window border raises only its display layer',async()=>{
 const h=await harness(),readonly=id(1),active=id(2),before=copy(h.state),positions=h.state.window_collection.windows.map(win=>({...win.layout,z:0}));
 h.frame(readonly).onpointerdown?.(h.event(h.body(readonly),200,200));await h.workspace.settled();
 let windows=h.state.window_collection.windows;assert.ok(windows.find(win=>win.window_id===readonly).layout.z>windows.find(win=>win.window_id===active).layout.z,'Clicking readonly content must bring its window to the front');
 assert.equal(h.state.window_collection.active_window_id,active);assert.deepEqual(h.state.selection,before.selection);assert.deepEqual(h.state.edit_state,before.edit_state);assert.deepEqual(h.state.last_operation,before.last_operation);assert.equal(h.state.reason,before.reason);
 h.setScientificGesture(true);h.frame(active).onpointerdown?.(h.event(h.frame(active),300,220));assert.ok(Number(h.frame(active).style.zIndex)>Number(h.frame(readonly).style.zIndex),'Stacking must update immediately without moving a live scientific gesture');await h.workspace.settled();
 windows=h.state.window_collection.windows;assert.deepEqual(windows.map(win=>({...win.layout,z:0})),positions);assert.equal(h.state.window_collection.active_window_id,active);assert.ok(h.requests.filter(request=>request.body).every(request=>request.body.action==='window-layout'));assert.equal(h.fits(),0);assert.deepEqual(h.errors,[]);
});

test('title dragging and its bubbled click publish only one display update',async()=>{
 const h=await harness(),window=id(1),header=h.header(window),down=h.event(header,100,100);header.onpointerdown(down);h.frame(window).onpointerdown(down);header.onpointermove(h.event(header,130,120));header.onpointerup(h.event(header,130,120));await h.workspace.settled();
 const writes=h.requests.filter(request=>request.body);assert.equal(writes.length,1);assert.equal(writes[0].body.action,'window-layout');assert.equal(h.state.window_collection.active_window_id,id(2));assert.equal(h.state.edit_state.draft_revision,18);assert.deepEqual(h.errors,[]);
});

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
 const h=await harness(),active=h.frame(id(2)),before=copy(active.style),science=copy({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation});h.setScientificGesture(true);
 const next=copy(h.state.window_collection);next.revision++;next.windows[0].layout={x:0,y:0,width:.4,height:.8,z:3};next.windows[1].layout={x:.4,y:.1,width:.6,height:.8,z:4};h.state.window_collection=next;h.workspace.sync(h.state);
 const geometry=style=>({left:style.left,top:style.top,width:style.width,height:style.height});assert.deepEqual(geometry(active.style),geometry(before));assert.equal(active.style.zIndex,'4');assert.equal(h.frame(id(1)).style.width,'calc(40% - 8px)');h.workspace.flushDeferredLayout();assert.deepEqual(geometry(active.style),geometry(before));
 h.setScientificGesture(false);h.workspace.flushDeferredLayout();assert.equal(active.style.left,'calc(40% + 4px)');assert.equal(active.style.top,'calc(10% + 4px)');assert.equal(active.style.width,'calc(60% - 8px)');assert.equal(h.viewport.parentNode,h.body(id(2)));
 assert.deepEqual({object:h.state.object,selection:h.state.selection,edit_state:h.state.edit_state,last_operation:h.state.last_operation},science);assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('gesture end does not apply an unacknowledged local tile candidate',async()=>{
 const initial=collection();initial.windows[1].layout={x:.3,y:0,width:.7,height:1,z:2};const h=await harness(initial),active=h.frame(id(2)),before=copy(active.style);let release;h.delayMetadata(new Promise(resolve=>{release=resolve;}));h.setScientificGesture(true);h.workspace.tile();await settle();
 h.setScientificGesture(false);h.workspace.flushDeferredLayout();assert.deepEqual(active.style,before);release();await h.workspace.settled();assert.equal(active.style.left,'calc(50% + 4px)');assert.equal(active.style.width,'calc(50% - 8px)');assert.equal(h.state.window_collection.active_window_id,id(2));
});
test('a deferred geometry cannot be applied after the current scientific object changes',async()=>{
 const h=await harness(),active=h.frame(id(2)),before=copy(active.style);h.setScientificGesture(true);const next=copy(h.state.window_collection);next.revision++;next.windows[1].layout={x:0,y:0,width:1,height:1,z:3};h.state.window_collection=next;h.workspace.sync(h.state);h.state.object.object_id=id(99);h.setScientificGesture(false);h.workspace.flushDeferredLayout();const geometry=style=>({left:style.left,top:style.top,width:style.width,height:style.height});assert.deepEqual(geometry(active.style),geometry(before));assert.equal(active.style.zIndex,'3');assert.equal(h.state.object.object_id,id(99));assert.equal(h.requests.filter(request=>request.body).length,0);
});
test('passive pan and zoom change only display layers without scientific selection or measurement',async()=>{
 const h=await harness(),body=h.body(id(1)),img=body.children[0],before=copy(h.state.selection),count=h.requests.length;
 body.onpointerdown(h.event(body,10,20));h.frame(id(1)).onpointerdown(h.event(body,10,20));body.onpointermove(h.event(body,45,55));body.onpointerup(h.event(body,45,55));const pan=img.style.transform;body.onwheel(h.event(body,40,40,{deltaY:-100}));await h.workspace.settled();assert.notEqual(img.style.transform,pan);assert.ok(h.requests.slice(count).every(request=>request.body?.action==='window-layout'));assert.deepEqual(h.state.selection,before);assert.equal(h.state.window_collection.active_window_id,id(2));
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
