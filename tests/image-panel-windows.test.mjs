// Bounded display windows over controlled immutable objects; no numerics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createImagePanel} from '../tools/image_panel.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {PanelWindowStore,readPanelWindowLayout,readPanelWindowUiPanels} from '../lib/panel_window_collection.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';

const id=n=>n.toString(16).padStart(32,'0'),T=id(1),F=id(2),V=id(3),P=id(4);
const pngBytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=pngBytes.toString('base64'),digest=createHash('sha256').update(pngBytes).digest('hex');
const frame={frame_object_id:F,frame_index:0,source_object_id:T};
const spatial=(ident=V,rect=[0,0,64,64])=>({object_id:ident,kind:'view',parent_object_id:F,array_domain:'spatial',panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:rect,image_rect_xyxy:[0,0,rect[2]-rect[0],rect[3]-rect[1]]}],shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],display:{gamma:1},files_sha256:{'preview.png':digest}});
const spectrum=(ident,rect=[0,0,16,16])=>({object_id:ident,kind:'fft',parent_object_id:F,array_domain:'frequency',source_rect_xyxy:rect,shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],panels:[{domain:'frequency',source_object_id:ident,fft_shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],image_rect_xyxy:[0,0,rect[2]-rect[0],rect[3]-rect[1]]}],display:{gamma:1},files_sha256:{'preview.png':digest},annotations:[{annotation_id:'peak',kind:'point',anchor:{source_object_id:ident,coordinate_space:'frequency_cycles_per_pixel',coordinates:[.1,0]}}]});
const select=(rect,panel)=>({kind:'rectangle',source_object_id:F,coordinate_space:'source_pixels',coordinates:rect,panel});
const cal=n=>({calibration_id:id(900+n),revision:n,status:'active',source:'user_statement_not_independently_verified',xy_scale:{x:n*.02,y:n*.02,unit:'nm'}});

test('visible window titles remain distinct after closing and opening an FFT',()=>{
 const store=new PanelWindowStore();store.admit(spatial(),frame);store.admit(spectrum(id(10)),frame);store.admit(spectrum(id(11)),frame);
 const first=store.snapshot().windows.find(win=>win.object_id===id(10));store.close(store.snapshot().revision,first.window_id);store.admit(spectrum(id(12)),frame);
 const titles=store.snapshot().windows.map(win=>win.title);assert.equal(new Set(titles).size,titles.length,'Open FFT windows need distinct human-readable titles');
});

test('newly active windows are raised without resetting their display geometry',()=>{
 const store=new PanelWindowStore();store.admit(spatial(),frame);store.admit(spectrum(id(10)),frame);
 const before=store.snapshot();store.updateLayouts(before.revision,before.windows.map(win=>({window_id:win.window_id,layout:{...win.layout,z:win.role==='fft'?100:20}})));
 store.admit(spatial(),frame);let after=store.snapshot(),active=after.windows.find(win=>win.window_id===after.active_window_id);
 assert.equal(active.role,'source');assert.ok(active.layout.z>Math.max(...after.windows.filter(win=>win!==active).map(win=>win.layout.z)),'Returning source must be visible above readonly windows');assert.deepEqual({...active.layout,z:0},{...before.windows[0].layout,z:0});
 store.admit(spectrum(id(11)),frame);after=store.snapshot();active=after.windows.find(win=>win.window_id===after.active_window_id);assert.ok(active.layout.z>Math.max(...after.windows.filter(win=>win!==active).map(win=>win.layout.z)),'New FFT must not open behind an older raised window');
 store.updateLayouts(after.revision,after.windows.map(win=>({window_id:win.window_id,layout:{...win.layout,z:10000}})));store.admit(spatial(),frame);after=store.snapshot();active=after.windows.find(win=>win.window_id===after.active_window_id);
 assert.ok(after.windows.every(win=>win.layout.z<=10000),'A long session must still publish a bounded stacking order');assert.ok(active.layout.z>Math.max(...after.windows.filter(win=>win!==active).map(win=>win.layout.z)));
});

test('same-frame source, two ROI views and two FFTs retain five identities without numerical comparison claims',()=>{
 const store=new PanelWindowStore();store.admit(spatial(),frame);store.admit(spatial(id(10),[2,2,20,20]),frame);store.admit(spectrum(id(11),[2,2,20,20]),frame);store.admit(spatial(id(12),[30,30,50,50]),frame);store.admit(spectrum(id(13),[30,30,50,50]),frame);
 const value=store.snapshot();assert.equal(value.windows.length,5);assert.deepEqual(value.windows.map(w=>w.role),['source','roi','fft','roi','fft']);assert.equal(value.windows.at(-1).window_id,value.active_window_id);assert.equal(value.windows.some(w=>w.source_reference),false);assert.equal(JSON.stringify(value).includes('png_base64'),false);
 assert.equal(store.canAdmit(spectrum(id(14)),frame),false);assert.throws(()=>store.admit(spectrum(id(14)),frame),/Five image windows/);assert.deepEqual(store.snapshot(),value);
});

test('FFT annotation and calibration revisions update one display window while retaining original input identity',()=>{
 const store=new PanelWindowStore(),raw=spectrum(id(10)),input=spatial(),a=cal(1),b=cal(2),reference={version:1,view_object_id:V,frame_object_id:F,fft_object_id:raw.object_id,source_rect_xyxy:raw.source_rect_xyxy};
 input.xy_calibration=a;raw.xy_calibration=a;store.admit(input,frame);store.admit(raw,frame,reference,a);const original=store.snapshot().windows[1];
 const revised={...raw,object_id:id(11),kind:'annotate',parent_object_id:raw.object_id,render_base_object_id:raw.object_id};delete revised.array_domain;store.admit(revised,frame,reference,a);assert.equal(store.snapshot().windows[1].source_reference.calibration_relation,'same');
 const calibrated={...raw,object_id:id(12),kind:'fft_view',parent_object_id:revised.object_id,spectrum_object_id:raw.object_id,xy_calibration:b};store.admit(calibrated,frame,reference,a);const latest=store.snapshot();assert.equal(latest.windows.length,2);assert.equal(latest.windows[1].window_id,original.window_id);assert.equal(latest.windows[1].object_id,calibrated.object_id);assert.equal(latest.windows[1].source_reference.input_view_object_id,V);assert.equal(latest.windows[1].source_reference.raw_fft_object_id,raw.object_id);assert.equal(latest.windows[1].source_reference.calibration_relation,'different');
 assert.deepEqual(raw.xy_calibration,a);assert.deepEqual(input.xy_calibration,a);
});

test('layout updates are atomic; closing displays retains their exact working references',()=>{
 const store=new PanelWindowStore();store.admit(spatial(),frame);store.admit(spectrum(id(10)),frame);const value=store.snapshot(),source=value.windows[0];
 assert.throws(()=>readPanelWindowLayout({x:0,y:0,width:1,height:1,z:0,dirty:false}),/fields/);assert.throws(()=>readPanelWindowLayout({x:.8,y:0,width:.5,height:1,z:0}),/outside/);
 assert.throws(()=>store.updateLayouts(value.revision,[{window_id:source.window_id,layout:{x:0,y:0,width:.5,height:1,z:1}},{window_id:id(888),layout:{x:0,y:0,width:.5,height:1,z:2}}]),/no longer/);assert.deepEqual(store.snapshot(),value);
 store.close(value.revision,source.window_id);assert.equal(store.snapshot().active_window_id,value.active_window_id);assert.equal(store.snapshot().windows.length,1);assert.equal(store.snapshot().closed_windows[0].object_id,source.object_id);
 store.close(store.snapshot().revision,value.active_window_id);assert.equal(store.snapshot().active_window_id,null);assert.equal(store.snapshot().windows.length,0);assert.equal(store.snapshot().closed_windows.length,2);
 store.admit(spatial(),frame);assert.equal(store.snapshot().active_window_id,source.window_id);assert.equal(store.snapshot().windows[0].object_id,source.object_id);
});

test('closed display history does not consume the five visible slots and cold restore retains hidden IDs',async()=>{
 const store=new PanelWindowStore(),objects=new Map([[V,spatial()]]);store.admit(objects.get(V),frame);
 for(let n=10;n<14;n++){const object=spectrum(id(n));objects.set(object.object_id,object);store.admit(object,frame);}
 const before=store.snapshot(),first=before.windows[1];store.close(before.revision,first.window_id);
 const fresh=spectrum(id(20));objects.set(fresh.object_id,fresh);assert.equal(store.canAdmit(fresh,frame),true);store.admit(fresh,frame);
 assert.equal(store.snapshot().windows.length,5);assert.equal(store.snapshot().closed_windows[0].window_id,first.window_id);
 const cold=new PanelWindowStore();cold.admit(fresh,frame);await cold.restore(store.checkpoint(),fresh,frame,async key=>({object:objects.get(key),frame,png}));
 assert.deepEqual(cold.snapshot().closed_windows,store.snapshot().closed_windows);assert.equal(cold.snapshot().windows.length,5);
});
test('retained display capacity is rejected before installing another active identity',()=>{
 const store=new PanelWindowStore();store.admit(spatial(),frame);
 for(let n=10;n<41;n++){store.admit(spectrum(id(n)),frame);store.close(store.snapshot().revision,store.snapshot().active_window_id);}
 const before=store.checkpoint(),next=spectrum(id(99));assert.equal(store.canAdmit(next,frame),false);assert.throws(()=>store.admit(next,frame),/Retained display limit/);assert.deepEqual(store.checkpoint(),before);
 const source=store.snapshot().windows[0];assert.equal(store.canAdmit(spatial(),frame),true);store.admit(spatial(),frame);assert.equal(store.snapshot().active_window_id,source.window_id);
});

test('different frame and unsupported frequency mapping cannot inherit the previous window set',()=>{
 const store=new PanelWindowStore();store.admit(spatial(),frame);store.admit(spectrum(id(10)),frame);const other={...frame,frame_object_id:id(22)},view=spatial(id(23));view.panels[0].source_object_id=other.frame_object_id;store.admit(view,other);assert.equal(store.snapshot().windows.length,1);assert.equal(store.snapshot().frame_object_id,other.frame_object_id);
 const forged=spectrum(id(30));delete forged.array_domain;store.admit(forged,other);assert.equal(store.snapshot().unavailable_reason,'unsupported_view');assert.equal(store.snapshot().active_window_id,null);
 assert.equal(store.snapshot().windows.length,1);assert.equal(store.snapshot().windows[0].object_id,view.object_id);
});

test('unsupported active views retain same-frame saved windows without pretending one is the active editor',()=>{
 const store=new PanelWindowStore(),source=spatial(),raw=spectrum(id(10));store.admit(source,frame);store.admit(raw,frame);const before=store.snapshot();
 store.admit({...source,object_id:id(11),kind:'compare',panels:[source.panels[0],source.panels[0]]},frame);assert.deepEqual(store.snapshot().windows,before.windows);assert.equal(store.snapshot().active_window_id,null);assert.equal(store.snapshot().unavailable_reason,'unsupported_view');
 store.admit({object_id:id(12),kind:'sequence'},null);assert.deepEqual(store.snapshot().windows,before.windows);assert.equal(store.snapshot().active_window_id,null);assert.equal(store.snapshot().unavailable_reason,'unverified_frame');
 store.admit(raw,frame);assert.equal(store.snapshot().active_window_id,before.active_window_id);assert.deepEqual(store.snapshot().windows,before.windows);
});

async function fixture(run,{initialAnnotations=[],deepSource=false,ancestry=false,ancestryTransform=value=>value}={}){
 const workspace=mkdtempSync(path.join(tmpdir(),'image-panel-windows-')),records=new Map([[T,{object_id:T,kind:'tiff_source'}],[F,{object_id:F,kind:'frame',source_object_id:T,frame_index:0}]]),calls=[],live=[];
 let sequence=100,panel,owned,holdInfo=null,failFFT=false,changeAnnotationGrid=false;
 const save=value=>{records.set(value.object_id,structuredClone(value));if(value.files_sha256){const dir=path.join(workspace,'objects',value.object_id);mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'preview.png'),pngBytes);}return value;};save({...spatial(),annotations:structuredClone(initialAnnotations)});
 if(deepSource){let parent=save(spatial(id(49)));for(let n=50;n<60;n++)parent=save({...spatial(id(n)),kind:'annotate',parent_object_id:parent.object_id,render_base_object_id:id(49)});save({...spatial(),kind:'annotate',parent_object_id:parent.object_id,render_base_object_id:id(49),annotations:structuredClone(initialAnnotations)});}
 const ancestryFields=['object_id','kind','parent_object_id','base_object_id','source_object_id','frame_index','dm_dataset_index','dm_plane_selection','source_identity','source_file_format','source_reader','upstream_backend','backend','state','image_path','evidence_format'];
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_fft','image_preview','image_annotate'].map(name=>({name,inputSchema:name==='image_info'&&ancestry?{properties:{include_frame_ancestry:{type:'boolean'}}}:{}}))}:{}};},async tool(name,args){
  calls.push({name,args:structuredClone(args)});
  if(name==='image_info'&&holdInfo?.object_id===args.object_id){const hold=holdInfo;holdInfo=null;hold.entered();await hold.wait;}
  let value;
  if(name==='image_info')value=records.get(args.object_id);
  else if(name==='image_fft'){if(failFFT)throw new Error('Controlled unknown FFT');value=save({...spectrum(id(++sequence),args.rect),request_id:args.request_id,state:'completed'});}
  else if(name==='image_preview')value=save({...spatial(id(++sequence),args.rect??[0,0,64,64]),request_id:args.request_id,state:'completed'});
  else if(name==='image_annotate'){
   const previous=records.get(args.object_id);value=structuredClone(previous);value.object_id=id(++sequence);value.kind='annotate';value.parent_object_id=args.object_id;value.render_base_object_id=previous.render_base_object_id??previous.object_id;value.request_id=args.request_id;value.state='completed';delete value.array_domain;
   if(args.annotations)value.annotations=args.annotations.map(mark=>{const {coordinate_space,source_object_id,coordinates,...fields}=mark;return {...fields,anchor:{coordinate_space,source_object_id,coordinates},...(mark.purpose==='resumable_observation'?{observation_contract_version:1,selection_origin_basis:'caller_reported_not_authenticated'}:{})};});
   else for(const update of args.updates){const target=value.annotations.find(a=>a.annotation_id===update.annotation_id);for(const [key,field] of Object.entries(update))if(key==='coordinates')target.anchor.coordinates=structuredClone(field);else if(key!=='annotation_id')target[key]=structuredClone(field);}
   if(changeAnnotationGrid){changeAnnotationGrid=false;value.scientific_grid_identity={version:1,source_grid_object_id:id(999),domain:'spatial_pixels'};}
   save(value);
  }
  assert.ok(value,'Controlled provider missing object '+args.object_id);let data=structuredClone(value);
  if(name==='image_info'&&args.include_frame_ancestry===true&&ancestry!=='missing'){
   data={state:'completed',backend:'external-image-workspace',...data};const chain=[];let entry=value;const visited=new Set();for(let step=0;step<=64;step++){const reply={state:'completed',backend:'external-image-workspace',...entry};chain.push(Object.fromEntries(ancestryFields.filter(key=>reply[key]!==undefined).map(key=>[key,structuredClone(reply[key])])));if(step===64||['frame','tiff_source','dm_source','compare'].includes(entry.kind)||visited.has(entry.object_id))break;visited.add(entry.object_id);const next=entry.parent_object_id??entry.base_object_id??entry.source_object_id;if(typeof next!=='string'||!records.has(next))break;entry=records.get(next);}
   data.frame_ancestry=ancestryTransform({schema_version:1,root_object_id:value.object_id,records:chain});
  }
  return {data,png:value.files_sha256?png:null};
 },async close(){}});
 const start=async()=>{owned=prepareOwnedPanelRegistration({workspace,panel_id:P});panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:owned.checkpoint?.object_id??V,client:client(),panel_id:P,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory,...(owned.checkpoint?{resume_checkpoint:owned.checkpoint}:{})});owned.publish(panel);live.push({owned,panel});};
 const post=async(route,body)=>{const origin=panel.url.split('/#')[0],r=await fetch(origin+route,{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const act=(action,params={},extra={})=>post('/api/action',{expected_object_id:panel.state().object.object_id,draft_revision:panel.state().edit_state.draft_revision,action,params,...extra});
 const get=async(route)=>{const r=await fetch(panel.url.split('/#')[0]+route,{headers:{'X-Panel-Token':panel.token}});return {status:r.status,data:await r.json()};};
 const cold=async()=>{await owned.close(panel);await start();};
 const hold=object_id=>{let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);holdInfo={object_id,wait,entered};return {release,started};};
 try{await start();await run({workspace,records,calls,save,act,post,get,cold,hold,state:()=>panel.state(),unknownFFT:()=>{failFFT=true;},changeNextAnnotationGrid:()=>{changeAnnotationGrid=true;}});}finally{for(const entry of live.reverse()){try{await entry.owned.close(entry.panel);}catch{}}rmSync(workspace,{recursive:true,force:true});}
}

test('two GUI FFTs retain source and immutable A/B windows; saved assets are bounded read-only and cold restore retains IDs',()=>fixture(async h=>{
 const source=h.state().object,first=await h.act('fft',{selection:select([2,3,20,25],source.panels[0])});assert.equal(first.status,200,first.data.error);const a=h.state().object.object_id;
 assert.equal((await h.act('return-spatial')).status,200);assert.equal(h.state().object.object_id,V);
 assert.equal((await h.act('roi',{selection:select([30,30,50,50],source.panels[0])})).status,200);
 const roi=h.state().object;assert.equal((await h.act('fft',{selection:select([31,31,48,48],roi.panels[0])})).status,200);const b=h.state().object.object_id;
 const before=h.state(),collection=before.window_collection;assert.equal(collection.windows.length,4);assert.ok(collection.windows.some(w=>w.object_id===a));assert.ok(collection.windows.some(w=>w.object_id===b));assert.equal(h.calls.filter(c=>c.name==='image_fft').length,2);
 const sourceWindow=collection.windows.find(w=>w.object_id===V),calls=h.calls.length,asset=await h.get(`/api/window-asset?window_id=${sourceWindow.window_id}&revision=${collection.revision}`);assert.equal(asset.status,200,asset.data.error);assert.equal(asset.data.object_id,V);assert.equal(asset.data.png_base64,png);assert.ok(h.calls.slice(calls).every(c=>c.name==='image_info'));assert.deepEqual(h.state(),before);
 assert.equal((await h.get(`/api/window-asset?window_id=${sourceWindow.window_id}&revision=${collection.revision-1}`)).status,409);
 await h.cold();assert.deepEqual(h.state().window_collection.windows.map(w=>[w.window_id,w.object_id,w.source_reference]),collection.windows.map(w=>[w.window_id,w.object_id,w.source_reference]));assert.equal(h.state().object.object_id,b);assert.equal(h.calls.filter(c=>c.name==='image_fft').length,2);
}));

test('saved asset ancestry: a thirteen-node source uses one explicit qualified read without changing the workspace',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V),start=h.calls.length;
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,200,response.data.error);assert.equal(response.data.object.object_id,V);assert.deepEqual(response.data.object.panels,h.records.get(V).panels);assert.deepEqual(response.data.object.annotations,h.records.get(V).annotations);assert.equal('frame_ancestry' in response.data.object,false);assert.equal(response.data.png_base64,png);assert.deepEqual(h.state(),before);
 const reads=h.calls.slice(start);assert.equal(reads.length,2,'one ancestry call plus one exact clean-render base read; never one RPC per parent');assert.deepEqual(reads[0],{name:'image_info',args:{object_id:V,include_frame_ancestry:true}});assert.deepEqual(reads[1],{name:'image_info',args:{object_id:id(49)}});
},{deepSource:true,ancestry:true}));

test('saved asset ancestry: an advertised provider omitting the optional projection keeps the legacy fresh-parent path',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V),start=h.calls.length;
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,200,response.data.error);assert.equal(h.calls.slice(start).length,14);assert.deepEqual(h.state(),before);
},{deepSource:true,ancestry:'missing'}));

test('saved asset ancestry: a legacy catalog is never sent a new optional argument',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V),start=h.calls.length;
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,200,response.data.error);assert.equal(h.calls.slice(start).length,14);assert.ok(h.calls.slice(start).every(call=>!('include_frame_ancestry' in call.args)));assert.deepEqual(h.state(),before);
},{deepSource:true}));

test('saved clean render: a corrupted existing base is refused without creating a replacement preview',()=>fixture(async h=>{
 const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V),base=h.records.get(V).render_base_object_id,target=path.join(h.workspace,'objects',base,'preview.png');writeFileSync(target,Buffer.from('changed saved base'));const calls=h.calls.length;
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,400);assert.match(response.data.error,/Clean PNG hash or format mismatch/);assert.deepEqual(h.state(),before);assert.ok(h.calls.slice(calls).every(call=>call.name==='image_info'));
},{deepSource:true,ancestry:true}));

for(const [name,mutate]of [
 ['wrong root',value=>({...value,root_object_id:id(999)})],
 ['broken next identity',value=>({...value,records:value.records.map((record,index)=>index===1?{...record,object_id:id(999)}:record)})],
 ['truncated chain',value=>({...value,records:value.records.slice(0,-1)})],
 ['unknown projection field',value=>({...value,records:value.records.map((record,index)=>index===0?{...record,png_base64:png}:record)})],
])test('saved asset ancestry: rejects '+name+' without changing state or submitting a scientific write',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V),start=h.calls.length;
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,409,response.data.error);assert.match(response.data.error,/ancestry|Ancestry/);assert.deepEqual(h.state(),before);assert.ok(h.calls.slice(start).every(call=>call.name==='image_info'));
},{deepSource:true,ancestry:true,ancestryTransform:mutate}));

test('saved asset ancestry: a qualified but different frame still fails the saved window mapping guard',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V);
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,409);assert.match(response.data.error,/asset changed/);assert.deepEqual(h.state(),before);
},{deepSource:true,ancestry:true,ancestryTransform:value=>({...value,records:value.records.map((entry,index)=>index===value.records.length-2?{...entry,parent_object_id:id(999)}:index===value.records.length-1?{...entry,object_id:id(999)}:entry)})}));

test('saved asset ancestry: the qualified fast path still checks the actual current PNG bytes',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V);writeFileSync(path.join(h.workspace,'objects',V,'preview.png'),'corrupt');
 const response=await h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);assert.equal(response.status,409);assert.match(response.data.error,/PNG hash/);assert.deepEqual(h.state(),before);
},{deepSource:true,ancestry:true}));

test('saved asset ancestry: a collection revision changed during qualification refuses the old response',()=>fixture(async h=>{
 await h.act('fft',{selection:select([2,3,20,25],h.state().object.panels[0])});const before=h.state(),source=before.window_collection.windows.find(win=>win.object_id===V),hold=h.hold(V),reading=h.get(`/api/window-asset?window_id=${source.window_id}&revision=${before.window_collection.revision}`);
 await hold.started;try{const changed=await h.act('window-layout',{collection_revision:before.window_collection.revision,windows:[{window_id:source.window_id,layout:{...source.layout,width:.8}}]});assert.equal(changed.status,200,changed.data.error);}finally{hold.release();}
 const latest=h.state(),response=await reading;assert.equal(response.status,409);assert.deepEqual(h.state(),latest);assert.equal(latest.object.object_id,before.object.object_id);
},{deepSource:true,ancestry:true}));

test('saved asset ancestry: the optional boolean is advertised and invalid flags are refused before dispatch',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'controlled-ancestry',call(name,args){calls.push({name,args});return {content:[]};}}}));
 assert.equal(registry.listTools().find(tool=>tool.name==='image_info').inputSchema.properties.include_frame_ancestry.type,'boolean');
 for(const value of [null,0,1,'true',[],{}])await assert.rejects(registry.call('image_info',{object_id:V,include_frame_ancestry:value}));assert.equal(calls.length,0);
 for(const value of [false,true])await registry.call('image_info',{object_id:V,include_frame_ancestry:value});assert.equal(calls.length,2);
});

async function ancestryAdapter(run,{alter=value=>value,depth=2}={}){
 const directory=mkdtempSync(path.join(tmpdir(),'asset-ancestry-adapter-')),workspace=path.join(directory,'workspace');mkdirSync(workspace);const primary=path.join(workspace,'primary.png'),ancestor=path.join(workspace,'ancestor.png');writeFileSync(primary,pngBytes);writeFileSync(ancestor,pngBytes);
 const chain=Array.from({length:depth},(_,index)=>({object_id:id(500+index),kind:index===depth-1?'frame':'annotate',...(index<depth-1?{parent_object_id:id(501+index)}:{frame_index:0,source_object_id:T}),backend:'external-image-workspace',state:'completed',image_path:index===0?primary:ancestor}));
 const result={...chain[0],frame_ancestry:{schema_version:1,root_object_id:chain[0].object_id,records:chain}};alter({result,chain,directory,workspace,primary,ancestor});
 const spawnProcess=()=>{const child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('finish',()=>{child.stdout.write(JSON.stringify({ok:true,result}));child.emit('close',0);});return child;};
 const adapter=new ImageWorkspace({workspace,python:'never-executed',spawnProcess});try{await run({adapter,result,chain});}finally{adapter.close();rmSync(directory,{recursive:true,force:true});}
}

test('saved asset ancestry: the real adapter keeps one inline image while validating all ancestor PNGs',()=>ancestryAdapter(async({adapter,result})=>{
 const reply=await adapter.call('image_info',{object_id:result.object_id,include_frame_ancestry:true});assert.equal(reply.content.filter(block=>block.type==='image').length,1);assert.equal(reply.content.find(block=>block.type==='image').data,png);
}));

for(const [name,alter,pattern]of [
 ['outside workspace',({chain,directory})=>{const outside=path.join(directory,'outside.png');writeFileSync(outside,pngBytes);chain[1].image_path=outside;},/escapes workspace/],
 ['non-PNG payload',({ancestor})=>writeFileSync(ancestor,'not-a-PNG'),/not PNG/],
 ['oversized PNG',({ancestor})=>{const bytes=Buffer.alloc(2*1024*1024+1);pngBytes.copy(bytes);writeFileSync(ancestor,bytes);},/2 MiB/],
 ['uncompleted ancestor',({chain})=>{chain[1].state='unknown';},/ancestry/],
 ['truthy malformed image path',({chain})=>{chain[1].image_path=[];},/path|argument/i],
])test('saved asset ancestry: the real adapter rejects '+name,()=>ancestryAdapter(async({adapter,result})=>{
 await assert.rejects(adapter.call('image_info',{object_id:result.object_id,include_frame_ancestry:true}),pattern);
},{alter}));

test('saved asset ancestry: even the unused 65th record keeps its original PNG refusal',()=>ancestryAdapter(async({adapter,result})=>{
 await assert.rejects(adapter.call('image_info',{object_id:result.object_id,include_frame_ancestry:true}),/escapes workspace/);
},{depth:65,alter:({chain,directory})=>{const outside=path.join(directory,'outside.png');writeFileSync(outside,pngBytes);chain[64].image_path=outside;}}));

test('layout and closing passive view preserve dirty selection and original unknown request',()=>fixture(async h=>{
 const source=h.state().object;await h.act('fft',{selection:select([1,1,10,10],source.panels[0])});await h.act('return-spatial');h.unknownFFT();const failure=await h.act('fft',{selection:select([2,2,12,12],source.panels[0])});assert.equal(failure.status,400);assert.equal(h.state().last_operation.state,'submitted');
 await h.act('draft',{draft_revision:7,dirty:true,gesture_active:false,selection:select([3,3,13,13],source.panels[0])});const before=h.state(),passive=before.window_collection.windows.find(w=>w.window_id!==before.window_collection.active_window_id);
 const moved=await h.act('window-layout',{collection_revision:before.window_collection.revision,windows:[{window_id:passive.window_id,layout:{x:.1,y:.1,width:.6,height:.7,z:3}}]});assert.equal(moved.status,200,moved.data.error);assert.deepEqual(h.state().edit_state,before.edit_state);assert.deepEqual(h.state().selection,before.selection);assert.deepEqual(h.state().last_operation,before.last_operation);
 const closed=await h.act('close-window',{collection_revision:h.state().window_collection.revision,window_id:passive.window_id});assert.equal(closed.status,200,closed.data.error);assert.deepEqual(h.state().last_operation,before.last_operation);assert.deepEqual(h.state().edit_state,before.edit_state);assert.equal(h.state().object.object_id,V);assert.ok(h.records.has(passive.object_id));
 assert.equal((await h.act('close-window',{collection_revision:h.state().window_collection.revision,window_id:h.state().window_collection.active_window_id})).status,409);
}));

test('saved-result capacity is pending until an explicit passive close, never an automatic eviction',()=>fixture(async h=>{
 for(let n=0;n<4;n++){const value=h.save(spectrum(id(200+n),[n,n,n+10,n+10])),state=h.state();const r=await h.post('/api/present',{object_id:value.object_id,expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,request_id:'present-'+n});assert.equal(r.status,200,r.data.error);}
 const full=h.state(),saved=h.save(spectrum(id(210))),r=await h.post('/api/present',{object_id:saved.object_id,expected_object_id:full.object.object_id,draft_revision:full.edit_state.draft_revision,request_id:'present-overflow'});assert.equal(r.status,200,r.data.error);assert.equal(r.data.presentation.status,'queued');assert.equal(h.state().pending_result.reason,'window_capacity');assert.equal(h.state().object.object_id,full.object.object_id);assert.deepEqual(h.state().window_collection,full.window_collection);
 assert.equal((await h.act('accept-result')).status,409);const passive=full.window_collection.windows.find(w=>w.window_id!==full.window_collection.active_window_id);await h.act('close-window',{collection_revision:full.window_collection.revision,window_id:passive.window_id});assert.equal((await h.act('accept-result')).status,200);assert.equal(h.state().object.object_id,saved.object_id);assert.equal(h.state().window_collection.windows.length,5);assert.equal(h.state().pending_result,null);assert.ok(h.records.has(passive.object_id));
}));

test('capacity pending blocks a second GUI FFT before dispatch and preserves the original saved result',()=>fixture(async h=>{
 for(let n=0;n<4;n++){const value=h.save(spectrum(id(300+n),[n,n,n+10,n+10])),state=h.state();assert.equal((await h.post('/api/present',{object_id:value.object_id,expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,request_id:'fill-'+n})).status,200);}
 assert.equal((await h.act('show',{object_id:V})).status,200);const selected=select([2,2,14,14],h.state().object.panels[0]);
 assert.equal((await h.act('fft',{selection:selected})).status,200);const first=h.state();assert.equal(first.pending_result.reason,'window_capacity');assert.equal(first.object.object_id,V);const count=h.calls.filter(c=>c.name==='image_fft').length;
 const second=await h.act('fft',{selection:selected});assert.equal(second.status,409,second.data.error??'second FFT was incorrectly dispatched');assert.equal(h.calls.filter(c=>c.name==='image_fft').length,count);assert.deepEqual(h.state().pending_result,first.pending_result);assert.deepEqual(h.state().last_operation,first.last_operation);assert.deepEqual(h.state().window_collection,first.window_collection);
}));

const observationMark=(picked,annotation_id='roi-new',note='New observation reason')=>({selection:picked,annotation_id,text:'ROI',note,purpose:'resumable_observation',selection_origin:'researcher',status:'hypothesized'});
async function queueObservationPending(h){
 const value=h.state(),picked=select([2,3,20,25],value.object.panels[0]);
 assert.equal((await h.act('draft',{draft_revision:value.edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:picked})).status,200);
 const saved=h.save(spectrum(id(700))),current=h.state(),reply=await h.post('/api/present',{object_id:saved.object_id,expected_object_id:current.object.object_id,draft_revision:current.edit_state.draft_revision,request_id:'observation-pending'});
 assert.equal(reply.status,200,reply.data.error);assert.equal(reply.data.presentation.status,'queued');return {picked,pending:structuredClone(h.state().pending_result)};
}

test('pending observation mark saves on the exact current grid while preserving the original pending result',()=>fixture(async h=>{
 const original=structuredClone(h.records.get(V)),{picked,pending}=await queueObservationPending(h),saved=await h.act('mark',observationMark(picked));
 assert.equal(saved.status,200,saved.data.error);assert.equal(saved.data.auto_edit_committed,true);assert.notEqual(h.state().object.object_id,V);assert.deepEqual(h.state().pending_result,pending);assert.equal(h.state().edit_state.dirty,false);assert.equal(h.state().window_collection.windows.length,1);
 const mark=h.state().object.annotations.find(a=>a.annotation_id==='roi-new');assert.equal(mark.note,'New observation reason');assert.equal(mark.purpose,'resumable_observation');assert.equal(mark.observation_contract_version,1);assert.deepEqual(mark.anchor.coordinates,picked.coordinates);assert.deepEqual(h.records.get(V),original);assert.ok(h.records.has(h.state().object.object_id));assert.equal(h.calls.filter(c=>c.name==='image_annotate').length,1);
}));

test('pending observation reason edit saves a revision and retains the queued object and request',()=>fixture(async h=>{
 const {pending}=await queueObservationPending(h),before=structuredClone(h.records.get(V)),saved=await h.act('edit',{updates:[{annotation_id:'roi-existing',note:'Revised observation reason'}]});
 assert.equal(saved.status,200,saved.data.error);assert.equal(saved.data.auto_edit_committed,true);assert.deepEqual(h.state().pending_result,pending);assert.equal(h.state().object.annotations.find(a=>a.annotation_id==='roi-existing').note,'Revised observation reason');assert.deepEqual(h.records.get(V),before);assert.equal(h.state().edit_state.dirty,false);
}, {initialAnnotations:[{annotation_id:'roi-existing',kind:'rectangle',text:'ROI 1',note:'Original reason',purpose:'resumable_observation',selection_origin:'researcher',observation_contract_version:1,selection_origin_basis:'caller_reported_not_authenticated',status:'hypothesized',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:[2,3,20,25]}}]}));

test('pending observation readback preserves a newer draft without replacing the old pending result',()=>fixture(async h=>{
 const {picked,pending}=await queueObservationPending(h),before=h.state(),wait=h.hold(V),save=h.act('mark',observationMark(picked));
 const newer=select([25,25,40,40],before.object.panels[0]);
 try{
  await Promise.race([wait.started,save.then(response=>assert.fail(`Observation save did not reach the held readback (HTTP ${response.status}): ${response.data.error??'request completed before the readback gate'}`))]);
  assert.equal((await h.act('draft',{draft_revision:before.edit_state.draft_revision+1,dirty:true,gesture_active:false,selection:newer})).status,200);
 }finally{wait.release();}
 const saved=await save;
 assert.equal(saved.status,200,saved.data.error);assert.equal(saved.data.auto_edit_committed,true);assert.notEqual(h.state().object.object_id,V);assert.deepEqual(h.state().pending_result,pending);assert.equal(h.state().edit_state.dirty,true);assert.equal(h.state().edit_state.draft_revision,before.edit_state.draft_revision+1);assert.deepEqual(h.state().selection.coordinates,newer.coordinates);assert.deepEqual(h.state().edit_state.selection.coordinates,newer.coordinates);assert.equal(h.state().edit_state.base_object_id,h.state().object.object_id);
}));

test('pending observation wrong-grid readback preserves current and pending even though its new object was saved',()=>fixture(async h=>{
 const {picked,pending}=await queueObservationPending(h),before=h.state();h.changeNextAnnotationGrid();const rejected=await h.act('mark',observationMark(picked));
 assert.equal(rejected.status,409,rejected.data.error);assert.match(rejected.data.error,/exact same scientific grid/);assert.doesNotMatch(rejected.data.error,/no saved object|not saved/i);
 const saved=[...h.records.values()].find(value=>value.kind==='annotate'&&value.annotations?.some(a=>a.annotation_id==='roi-new'));assert.ok(saved,'The immutable backend object was saved before Panel rejected adoption');assert.notEqual(saved.object_id,before.object.object_id);assert.equal(h.state().object.object_id,before.object.object_id);assert.deepEqual(h.state().pending_result,pending);assert.deepEqual(h.state().window_collection,before.window_collection);assert.deepEqual(h.state().edit_state,before.edit_state);
 const active=before.window_collection.windows.find(w=>w.window_id===before.window_collection.active_window_id),read=await h.get(`/api/window-asset?window_id=${active.window_id}&revision=${before.window_collection.revision}`);assert.equal(read.status,200,read.data.error);assert.equal(read.data.object_id,before.object.object_id);assert.notEqual(read.data.object_id,saved.object_id);
}));

test('asset read rejects tampering and a layout revision racing the read without altering active state',()=>fixture(async h=>{
 const source=h.state().object;await h.act('fft',{selection:select([1,1,10,10],source.panels[0])});let value=h.state(),passive=value.window_collection.windows[0];
 writeFileSync(path.join(h.workspace,'objects',V,'preview.png'),Buffer.from('bad'));assert.equal((await h.get(`/api/window-asset?window_id=${passive.window_id}&revision=${value.window_collection.revision}`)).status,409);writeFileSync(path.join(h.workspace,'objects',V,'preview.png'),pngBytes);
 const wait=h.hold(V),read=h.get(`/api/window-asset?window_id=${passive.window_id}&revision=${value.window_collection.revision}`);await wait.started;
 await h.act('window-layout',{collection_revision:value.window_collection.revision,windows:[{window_id:passive.window_id,layout:{x:0,y:0,width:.5,height:1,z:2}}]});wait.release();assert.equal((await read).status,409);assert.equal(h.state().object.object_id,value.object.object_id);assert.deepEqual(h.state().edit_state,value.edit_state);assert.deepEqual(h.state().last_operation,value.last_operation);
}));

test('restore drops a forged source relation but keeps the independently qualified active asset',async()=>{
 const store=new PanelWindowStore(),input=spatial(),raw=spectrum(id(10)),ref={version:1,view_object_id:V,frame_object_id:F,fft_object_id:raw.object_id,source_rect_xyxy:raw.source_rect_xyxy};store.admit(input,frame);store.admit(raw,frame,ref,null);const checkpoint=store.checkpoint();checkpoint.records[1].entry.source_reference.processing_rect_xyxy=[1,1,4,4];
 const restored=new PanelWindowStore();restored.admit(raw,frame);await restored.restore(checkpoint,raw,frame,async ident=>({object:ident===V?input:raw,frame,png}));assert.equal(restored.snapshot().windows.length,2);assert.equal(restored.snapshot().windows[1].object_id,raw.object_id);assert.equal(restored.snapshot().windows[1].source_reference,undefined);
});

test('bounded backend panel preferences reject coerced nonstring sides before metadata mutation',()=>{
 const good={side:'research',settings:false,results:true};assert.deepEqual(readPanelWindowUiPanels(good),good);for(const side of [['research'],null,{value:'research'}])assert.throws(()=>readPanelWindowUiPanels({...good,side}),/bounded UI panel/);
});
