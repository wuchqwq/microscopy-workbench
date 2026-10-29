// Actual composer event handlers with a minimal DOM/API shim. Deferred File.text
// and resolver Promises exercise UI ordering; this is not browser/backend QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as composer from '../ui/image-panel/figure-composer.mjs';
const copy=value=>JSON.parse(JSON.stringify(value)),id=n=>n.toString(16).padStart(32,'0');
const source=readFileSync(new URL('../ui/image-panel/app.mjs',import.meta.url),'utf8'),start=source.indexOf('let composition='),end=source.indexOf("$('view-forward').onclick",start);
assert.ok(start>=0&&end>start,'test must execute the actual composer handlers');
function profile(n){return {kind:'profile',object_id:id(n),scientific_grid_identity:{source_object_id:id(99),array_sha256:'a'.repeat(64)},xy_calibration:null,component:'raw',distance_unit:'pixel',physical_distance_unit:null,samples:{coordinates_xy:[[0,0],[1,0]],indices_xy:[[0,0],[1,0]],distance:[0,1],physical_distance:null,value:[7,9]}};}
function harness(count=3,layout='1x3',{initialRecipe,initialPanels,resolvePanels}={}){
 class E{constructor(){this.children=[];this.value='';this.textContent='';this.files=[];this.attributes={};this.parentNode={append(){}};}replaceChildren(){this.children=[];}append(...values){this.children.push(...values);}setAttribute(key,value){this.attributes[key]=value;}}
 const elements=new Map(),$=key=>{if(!elements.has(key))elements.set(key,new E());return elements.get(key);},catalog=new Map(Array.from({length:4},(_,i)=>{const p=profile(i+1);return [p.object_id,p];}));let resolverGate=null;const calls=[],messages=[];
 const recipe=initialRecipe??{schema:'microscopy-figure-composition-v1',layout,font_pt:8,slots:[...catalog.values()].slice(0,count).map((p,i)=>composer.makeProfileSlot(p,'current '+i))};
 const panels=value=>value.slots.map(slot=>({slot:copy(slot),profile:copy(catalog.get(slot.object_id))}));
 const previews=[],sandbox={...composer,renderCompositionSVG:input=>{const result=composer.renderCompositionSVG(input);previews.push(result);return result;},$,console,URL,Blob,JSON,document:{createElement:()=>new E()},dataProbes:{profile:profile(4)},message:value=>messages.push(value),api:async(route,body)=>{assert.equal(route,'/api/composition/resolve');calls.push(copy(body));if(resolverGate)await resolverGate;return {panels:resolvePanels?resolvePanels(body.composition):panels(body.composition)};}};
 vm.runInNewContext(source.slice(start,end)+"\nglobalThis.prepare=(recipe,panels)=>{composition=recipe;compositionPanels=panels;compositionRevision++;renderComposition();};globalThis.inspect=()=>({composition,compositionRevision,compositionWorking});globalThis.cleanup=()=>{if(compositionPreviewURL)URL.revokeObjectURL(compositionPreviewURL);};",sandbox,{filename:'ui/image-panel/app.mjs#composer'});
 sandbox.prepare(copy(recipe),copy(initialPanels??panels(recipe)));
 return {$,calls,messages,preview:()=>previews.at(-1),recipe:()=>copy(sandbox.inspect().composition),working:()=>sandbox.inspect().compositionWorking,close:()=>sandbox.cleanup(),setResolverGate:value=>{resolverGate=value;},async importFile(file){$('composer-import').files=file?[file]:[];await $('composer-import').onchange();},editTitle(index,text){const input=$('composer-slots').children[index].children[1];input.value=text;input.oninput();}};
}

function originalROIFFT(){
 // A valid 1x1 PNG keeps this event-ordering fixture small. Scientific source
 // edges remain on the independently declared 64x48 grid, not PNG pixels.
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',hash=createHash('sha256').update(Buffer.from(png,'base64')).digest('hex'),frame={frame_object_id:id(20),frame_index:0,source_object_id:id(50)},sourceProof={object_id:id(20),shape_yx:[48,64],dtype:'uint16',array_sha256:'f'.repeat(64),frame_identity:frame};
 const preferences={preset:'real-space',mode:'figure',columns:'double',fontPt:8,legend:false,scaleBar:false,layers:{experimental:true,simulation_A:false,simulation_B:false},letter:''};
 const panels=[[0,0,64,48],[16,12,48,36],null].map((rect,index)=>{
  const mapping=rect?{domain:'spatial_pixels',source_object_id:id(20),source_rect_xyxy:rect,image_rect_xyxy:[0,0,1,1]}:{domain:'frequency',source_object_id:id(30),fft_shape_yx:[24,32],image_rect_xyxy:[0,0,1,1]};
  const display={gamma:1,display_range:[0,255],max_size:512,upscale:false,interpolation:'nearest',...(rect?{scale_bar:false}:{representation:'log_amplitude',spectrum_axes:false})};
  const state={effective_display:display,frame_identity:copy(frame),object:{object_id:id(index+1),kind:rect?'view':'fft',source_shape_yx:[48,64],dtype:'uint16',panels:[mapping],xy_calibration:null,annotations:[],scientific_grid_identity:{array_sha256:'d'.repeat(64),source_object_id:mapping.source_object_id}}};
  const slot=composer.makeImageSlot(state,preferences,{object_id:id(index+60),clean_png_sha256:hash,panels:copy(state.object.panels),scale_bar:null});
  return {slot,state,clean_png_base64:png,scale_bar:null};
 });
 return {recipe:{schema:'microscopy-figure-composition-v1',layout:'2x2',font_pt:8,roiOutlines:true,showLegend:true,slots:panels.map(panel=>panel.slot)},panels,sourceProof};
}
test('a title edited while File.text is pending survives the older imported layout',async()=>{
 const h=harness();let release;const incoming=h.recipe();incoming.slots[0].title='old import';const text=new Promise(resolve=>{release=resolve;});
 try{const waiting=h.importFile({size:100,text:()=>text});assert.equal(h.working(),true);h.editTitle(0,'newer user edit');release(JSON.stringify(incoming));await waiting;
  assert.equal(h.recipe().slots[0].title,'newer user edit');assert.match(h.$('composer-status').textContent,/载入期间图版已变化/);assert.equal(h.working(),false);
 }finally{h.close();}
});
test('a title edited while the resolver is pending survives the older imported response',async()=>{
 const h=harness();let release;h.setResolverGate(new Promise(resolve=>{release=resolve;}));const incoming=h.recipe();incoming.slots[0].title='old response';
 try{const waiting=h.importFile({size:100,text:async()=>JSON.stringify(incoming)});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(h.calls.length,1);h.editTitle(1,'newer response-time edit');release();await waiting;
  assert.equal(h.recipe().slots[1].title,'newer response-time edit');assert.match(h.$('composer-status').textContent,/载入期间图版已变化/);assert.equal(h.working(),false);
 }finally{h.close();}
});
test('profile capacity and changed layout never silently truncate a fourth saved slot',()=>{
 for(const layout of ['2x2','1x3']){const h=harness(4,layout);try{assert.equal(h.$('composer-add-profile').disabled,true);assert.equal(h.$('composer-add-image').disabled,true);assert.equal(h.recipe().slots.length,4);assert.equal(h.$('composer-export').disabled,layout==='1x3');if(layout==='1x3')assert.match(h.$('composer-status').textContent,/已加入 4 幅.*需要 3 幅/);}finally{h.close();}}
 const h=harness(3);try{assert.equal(h.$('composer-add-profile').disabled,false);assert.equal(h.$('composer-export').disabled,false);}finally{h.close();}
});

test('ROI and legend switches preserve explicit user values and all saved scientific references',async()=>{
 const h=harness(),before=h.recipe().slots;
 try{
  h.$('composer-roi-outlines').checked=true;await h.$('composer-roi-outlines').onchange();assert.equal(h.recipe().roiOutlines,true);
  h.$('composer-roi-outlines').checked=false;await h.$('composer-roi-outlines').onchange();assert.equal(h.recipe().roiOutlines,false);
  h.$('composer-legend').checked=false;h.$('composer-legend').onchange();assert.equal(h.recipe().showLegend,false);
  assert.deepEqual(h.recipe().slots,before);assert.equal(h.calls.length,0,'profile-only layout switches need no scientific or provider operations');
 }finally{h.close();}
});

test('restoring default titles is explicit and retains the original scientific references',()=>{
 const h=harness();try{const before=h.recipe().slots.map(({title,...reference})=>reference);h.editTitle(0,'old [16,16,112,80]');h.$('composer-default-titles').onclick();
  assert.ok(h.recipe().slots.every(slot=>slot.title==='Intensity profile'));assert.deepEqual(h.recipe().slots.map(({title,...reference})=>reference),before);assert.equal(h.calls.length,0);
 }finally{h.close();}
});

test('changing an incomplete 2x2 with three image slots to 1x3 resolves source evidence before showing ROI outlines',async()=>{
 const input=originalROIFFT(),before=copy(input),h=harness(3,'2x2',{initialRecipe:input.recipe,initialPanels:input.panels,resolvePanels:recipe=>input.panels.map((panel,index)=>({...copy(panel),slot:copy(recipe.slots[index]),...(index<2?{spatial_source:copy(input.sourceProof)}:{})}))});
 let release;h.setResolverGate(new Promise(resolve=>{release=resolve;}));
 try{
  assert.equal(h.$('composer-export').disabled,true);assert.equal(h.calls.length,0);assert.equal(h.preview(),undefined,'an incomplete layout cannot preview or infer a source relation');
  h.$('composer-layout').value='1x3';const waiting=h.$('composer-layout').onchange();
  assert.equal(h.working(),true);assert.equal(h.$('composer-layout').value,'1x3','the pending resolver must not visually restore the previous layout');assert.equal(h.$('composer-layout').disabled,true);assert.equal(h.$('composer-export').disabled,true);
  release();await waiting;
  assert.equal(h.calls.length,1,'making the layout complete must read saved source evidence through the resolver');assert.equal(h.calls[0].composition.layout,'1x3');assert.equal(h.calls[0].composition.roiOutlines,true);
  assert.equal(h.$('composer-layout').disabled,false);assert.equal(h.$('composer-export').disabled,false);assert.equal(h.$('composer-preview').hidden,false);assert.equal(h.preview().roi_outline_count,1);assert.match(h.preview().svg,/data-part="source-roi-outline" data-roi-slot="1"/);assert.match(h.preview().svg,/<rect x="0.25" y="0.25" width="0.5" height="0.5" fill="none" stroke="#79d9ee"/);
  assert.match(h.$('composer-status').textContent,/显示 1 个 ROI 框/);assert.deepEqual(h.recipe().slots,before.recipe.slots);assert.deepEqual(input,before,'hydration and layout changes cannot edit scientific source records');
 }finally{release();h.close();}
});

test('enabling source ROI outlines keeps the new checkbox visibly checked while readonly evidence is pending',async()=>{
 const input=originalROIFFT();input.recipe.layout='1x3';input.recipe.roiOutlines=false;
 const before=copy(input),h=harness(3,'1x3',{initialRecipe:input.recipe,initialPanels:input.panels,resolvePanels:recipe=>input.panels.map((panel,index)=>({...copy(panel),slot:copy(recipe.slots[index]),...(index<2?{spatial_source:copy(input.sourceProof)}:{})}))});
 let release;h.setResolverGate(new Promise(resolve=>{release=resolve;}));
 try{
  assert.equal(h.$('composer-roi-outlines').checked,false);assert.equal(h.preview().roi_outline_count,0);
  h.$('composer-roi-outlines').checked=true;const waiting=h.$('composer-roi-outlines').onchange();
  assert.equal(h.working(),true);assert.equal(h.calls.length,1);assert.equal(h.$('composer-roi-outlines').checked,true,'the pending resolver must not visually undo the user click');assert.equal(h.$('composer-roi-outlines').disabled,true);assert.equal(h.$('composer-export').disabled,true);
  release();await waiting;
  assert.equal(h.$('composer-roi-outlines').checked,true);assert.equal(h.$('composer-roi-outlines').disabled,false);assert.equal(h.$('composer-export').disabled,false);assert.equal(h.preview().roi_outline_count,1);assert.match(h.preview().svg,/data-part="source-roi-outline"/);
  assert.deepEqual(h.recipe().slots,before.recipe.slots);assert.deepEqual(input,before);
 }finally{release();h.close();}
});
