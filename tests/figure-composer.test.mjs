// Presentation and identity contracts. Actual browser SVG/PNG rendering is a
// separate acceptance scope; these tests never claim a scientific recompute.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {makeImageSlot,makeProfileSlot,validateComposition,compositionDimensions,compositionLegendLayout,renderCompositionSVG,buildCompositionBundle} from '../ui/image-panel/figure-composer.mjs';
import {makeFigureRecipe} from '../ui/image-panel/figure-export.mjs';
const clone=value=>JSON.parse(JSON.stringify(value)),id=value=>value.toString(16).padStart(32,'0');
function png(width,height){
 const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=value>>>1^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc((1+width*4)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*(1+width*4)+1+x*4;raw[at]=x;raw[at+1]=y;raw[at+2]=120;raw[at+3]=255;}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const preferences={preset:'real-space',mode:'figure',columns:'double',fontPt:8,legend:false,scaleBar:true,layers:{experimental:true,simulation_A:false,simulation_B:false},letter:''};
function image(index=0){
 const bytes=png(32,24),source=id(index+20),state={effective_display:{gamma:1.2,display_range:[0,1023],max_size:512,upscale:false,interpolation:'nearest',scale_bar:false},frame_identity:{frame_object_id:id(index+40),frame_index:0,source_object_id:id(index+50)},object:{object_id:id(index+1),scientific_grid_identity:{array_sha256:'d'.repeat(64),source_object_id:source},panels:[{domain:'spatial_pixels',source_object_id:source,source_rect_xyxy:[10,20,42,44],image_rect_xyxy:[0,0,32,24]}],xy_calibration:null,annotations:[{annotation_id:'saved-A',kind:'point',anchor:{coordinate_space:'source_pixels',source_object_id:source,coordinates:[19,29]},status:'hypothesized',text:'candidate g1',presentation:{label:{text:'g1',offset:[2,1],pinned:true}}}]}};
 const base={object_id:id(index+60),clean_png_sha256:createHash('sha256').update(bytes).digest('hex'),panels:clone(state.object.panels),scale_bar:null},slot=makeImageSlot(state,preferences,base,'Saved '+index);
 return {slot,state,clean_png_base64:bytes.toString('base64'),scale_bar:null};
}
function profile(){
 const value={kind:'profile',object_id:id(100),request_id:'original-profile-request',parent_object_id:id(1),scientific_grid_identity:{array_sha256:'e'.repeat(64),source_object_id:id(20)},xy_calibration:null,component:'raw',dtype:'uint16',distance_unit:'pixel',physical_distance_unit:null,sampling:{interpolation:'nearest',line_width:1,sample_count:4},samples:{coordinates_xy:[[10,20],[11,20],[12,20],[13,20]],indices_xy:[[0,0],[1,0],[2,0],[3,0]],distance:[0,1,2,3],physical_distance:null,value:[10,20,null,40]}};
 return {slot:makeProfileSlot(value,'Saved profile'),profile:value};
}
function composition(layout='2x2'){
 const panels=layout==='2x2'?[image(0),image(1),image(2),profile()]:[image(0),image(1),profile()];
 return {recipe:{schema:'microscopy-figure-composition-v1',layout,font_pt:8,slots:panels.map(panel=>panel.slot)},panels};
}
test('composition recipes keep only explicit bounded saved references and require every slot',()=>{
 const input=composition(),before=clone(input),recipe=validateComposition(input.recipe);assert.deepEqual(recipe,input.recipe);assert.notEqual(recipe,input.recipe);
 assert.equal(recipe.slots[0].asset.object_id,id(60));assert.equal(recipe.slots[3].object_id,id(100));assert.doesNotMatch(JSON.stringify(recipe),/clean_png_base64|"samples"|"value":\[/);
 for(const mutate of [r=>r.slots.pop(),r=>r.slots.push(clone(r.slots[0])),r=>r.layout='3x3',r=>r.font_pt=6,r=>r.font_pt=13,r=>r.font_pt='8',r=>r.extra='hidden',r=>r.slots[0].asset.clean_png_sha256='bad',r=>r.slots[0].source_object_id='not-an-id',r=>r.slots[0].title='a'.repeat(81),r=>r.slots[0].recipe.source_object_id=id(999),r=>r.slots[3].samples=[1,2,3],r=>r.slots[3].scientific_grid_identity=null]){const changed=clone(input.recipe);mutate(changed);assert.throws(()=>validateComposition(changed));}
 assert.deepEqual(input,before);assert.throws(()=>makeImageSlot(input.panels[0].state,preferences,{...input.panels[0].slot.asset,panels:[]},''),/坐标映射/);
 const item=input.panels[0],base={...item.slot.asset,panels:clone(item.state.object.panels),scale_bar:{visible:false,reason:'small ROI has no eligible physical bar',calibration_id:id(70)}};
 assert.equal(makeImageSlot(item.state,preferences,base,'ROI without bar').scale_bar,null,'nonvisible diagnostic records are not physical bars');
});
test('both layouts produce every full embedded image/profile panel at bounded 180mm 300dpi dimensions',()=>{
 for(const layout of ['2x2','1x3']){
  const input=composition(layout),before=clone(input),rendered=renderCompositionSVG(input),count=layout==='2x2'?4:3;
  assert.equal((rendered.svg.match(/data-composition-slot="/g)??[]).length,count);assert.equal((rendered.svg.match(/<image\b/g)??[]).length,count-1);assert.equal((rendered.svg.match(/data-part="saved-profile"/g)??[]).length,1);
  assert.match(rendered.svg,/width="180mm"/);assert.match(rendered.svg,new RegExp(`viewBox="0 0 ${rendered.width} ${rendered.height}"`));assert.match(rendered.svg,/href="data:image\/png;base64,/);assert.doesNotMatch(rendered.svg,/href="https?:/);
  assert.match(rendered.svg,/距离 \(pixel\)/);assert.doesNotMatch(rendered.svg,/距离 \(nm\)/);assert.match(rendered.svg,/单位未标定/);
  const headers=[...rendered.svg.matchAll(/<text data-part="panel-heading"[^>]*font-size="([^"]+)"[^>]*>([^<]*)<\/text>/g)];assert.equal(headers.length,count);assert.ok(headers.every(([,font])=>font==='33.333'));assert.deepEqual(headers.map(([,_,text])=>text[0]),count===4?['a','b','c','d']:['a','b','c']);
  assert.equal(rendered.width,2126);assert.equal(rendered.dpi,300);assert.ok(rendered.width*rendered.height<6000000);assert.deepEqual(input,before);
 }
 assert.equal(compositionDimensions('2x2',12).font,50);assert.throws(()=>compositionDimensions('bad'),/布局/);
});
test('composition preserves source anchors/status and editable vector geometry while escaping titles',()=>{
 const input=composition();input.recipe.slots[0].title='<script> & "title"';input.panels[0].slot=clone(input.recipe.slots[0]);const before=clone(input);
 const {svg}=renderCompositionSVG(input);assert.match(svg,/&lt;script&gt; &amp; &quot;title&quot;/);assert.doesNotMatch(svg,/<script|<foreignObject|<iframe/);
 assert.match(svg,/<circle cx="9" cy="9"/);assert.match(svg,/hypothesized/);assert.match(svg,/data-source-object-id=/);assert.match(svg,/data-result-object-id=/);assert.match(svg,/data-part="label"/);
 assert.deepEqual(input,before);assert.deepEqual(input.panels[0].state.object.annotations[0].anchor.coordinates,[19,29]);
});
test('narrow 1x3 legends wrap complete candidate wording at the same 9pt font instead of clipping or shrinking',()=>{
 const input=composition('1x3');input.recipe.font_pt=9;input.recipe.slots[0].recipe.preferences.legend=true;input.panels[0].slot=clone(input.recipe.slots[0]);const before=clone(input);
 const narrow=compositionDimensions('1x3',9),wide=compositionDimensions('2x2',9),entry={label:'Experimental observation · candidate',shape:'circle',color:'#79d9ee'};
 const wrapped=compositionLegendLayout([entry],{width:narrow.cellWidth,fontSize:narrow.font}),unwrapped=compositionLegendLayout([entry],{width:wide.cellWidth,fontSize:wide.font});
 assert.ok(wrapped.rows[0].lines.length>1);assert.equal(wrapped.rows[0].lines.join(' '),entry.label);assert.deepEqual(unwrapped.rows[0].lines,[entry.label]);assert.equal(wrapped.fontSize,37.5);assert.ok(wrapped.height<narrow.bodyHeight*.65);
 const {svg}=renderCompositionSVG(input),labels=[...svg.matchAll(/<text data-part="legend-label"[^>]*font-size="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)];assert.equal(labels.length,1);assert.equal(labels[0][1],'37.5');assert.ok((labels[0][2].match(/<tspan/g)??[]).length>1);assert.match(labels[0][2],/candidate/);assert.match(labels[0][2],/Experimental observation/);assert.deepEqual(input,before);
});
test('hydration rejects source/calibration/anchor/asset mapping mismatch rather than substituting another view',()=>{
 const original=composition();
 for(const mutate of [
  v=>v.panels.pop(),v=>v.panels.reverse(),v=>v.panels[0].state.object.object_id=id(999),v=>v.panels[0].state.object.annotations[0].anchor.coordinates[0]++,v=>v.panels[0].state.object.xy_calibration={calibration_id:id(70),revision:2,status:'active'},v=>v.panels[0].state.object.panels[0].image_rect_xyxy[2]=999,v=>v.panels[0].clean_png_base64='data:image/png;base64,invalid',v=>v.panels[0].scale_bar={visible:true,length:5,unit:'nm'},v=>v.panels[3].profile.object_id=id(999),v=>v.panels[3].profile.scientific_grid_identity.array_sha256='wrong',v=>v.panels[3].profile.xy_calibration={calibration_id:id(999)},
 ]){const changed=clone(original);mutate(changed);assert.throws(()=>renderCompositionSVG(changed));}
 assert.equal(original.panels[0].state.object.object_id,id(1));
});
test('constant and missing profile samples remain saved data and never become interpolated zeros',()=>{
 const input=composition(),p=input.panels[3].profile;p.samples.value=[7,7,7,7];const before=clone(p);const {svg}=renderCompositionSVG(input);assert.match(svg,/data-part="profile-values"/);assert.doesNotMatch(svg,/NaN|Infinity/);assert.deepEqual(p,before);
 p.samples.value=[10,20,null,40];const rendered=renderCompositionSVG(input);assert.equal((rendered.svg.match(/data-part="profile-values"/g)??[]).length,2,'missing sample splits the curve instead of being replaced');assert.equal(p.samples.value[2],null);
 p.samples.physical_distance=[0,.2,.4,.6];p.physical_distance_unit='nm';assert.match(renderCompositionSVG(input).svg,/距离 \(nm\)/);assert.deepEqual(p.samples.physical_distance,[0,.2,.4,.6]);
});
test('profile endpoint ticks align inward at 9pt without moving the actual 2.24nm axis or saved samples',()=>{
 const input=composition();input.recipe.font_pt=9;const p=input.panels[3].profile;p.samples.physical_distance=[0,.7466666666666667,1.4933333333333334,2.24];p.physical_distance_unit='nm';const before=clone(input);
 const {svg}=renderCompositionSVG(input),ticks=[...svg.matchAll(/<path d="M [^"]+ v 6" stroke="#273849"\/><text x="([^"]+)"[^>]*text-anchor="([^"]+)" font-size="([^"]+)">([^<]*)<\/text>/g)];
 assert.equal(ticks.length,4);assert.deepEqual(ticks.map(([,_,anchor])=>anchor),['start','middle','middle','end']);assert.ok(ticks.every(([,_,__,font])=>font==='37.5'));assert.equal(ticks.at(-1)[4],'2.24');
 const d=compositionDimensions('2x2',9),profileLeft=d.margin+d.cellWidth+d.gap;
 assert.equal(Number(ticks[0][1]),Math.round((profileLeft+d.font*3.6)*1000)/1000);assert.equal(Number(ticks.at(-1)[1]),Math.round((profileLeft+d.cellWidth-d.font*.6)*1000)/1000,'text anchoring cannot change the endpoint position');
 assert.deepEqual(input,before);
});
test('saved recipe is restorable without embedding arrays and duplicate explicit views are not silently dropped',()=>{
 const input=composition();input.panels[1]=clone(input.panels[0]);input.recipe.slots[1]=clone(input.recipe.slots[0]);const before=clone(input),result=renderCompositionSVG(input),restored=renderCompositionSVG({recipe:JSON.parse(JSON.stringify(result.recipe)),panels:input.panels});assert.equal(restored.svg,result.svg);assert.equal((result.svg.match(/data-composition-slot="/g)??[]).length,4);assert.deepEqual(input,before);
 const known=makeFigureRecipe(input.panels[0].state,preferences);assert.deepEqual(result.recipe.slots[0].recipe,known);
});
test('bundle verifies image hashes and rasterizes exactly the full SVG into a 300dpi PNG and three-file ZIP',async()=>{
 const input=composition(),before=clone(input),saved={Image:globalThis.Image,document:globalThis.document,crypto:Object.getOwnPropertyDescriptor(globalThis,'crypto')};let svgRead='',drawn=0,canvasWidth=0,canvasHeight=0;
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 globalThis.Image=class{async decode(){svgRead=await(await fetch(this.src)).text();}};
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {set width(value){canvasWidth=value;},get width(){return canvasWidth;},set height(value){canvasHeight=value;},get height(){return canvasHeight;},getContext(){return {drawImage(image,x,y,w,h){assert.ok(image.src.startsWith('blob:'));assert.deepEqual([x,y,w,h],[0,0,canvasWidth,canvasHeight]);drawn++;}};},toBlob(callback){callback(new Blob([png(2,2)],{type:'image/png'}));}};}};
 try{
  const result=await buildCompositionBundle(input),rendered=renderCompositionSVG(input);assert.equal(svgRead,rendered.svg);assert.equal(result.files['composition.svg'],svgRead);assert.deepEqual(Object.keys(result.files),['composition.svg','composition.png','composition.json']);assert.deepEqual(JSON.parse(result.files['composition.json']),input.recipe);assert.equal(drawn,1);assert.deepEqual([canvasWidth,canvasHeight],[rendered.width,rendered.height]);
  const bytes=Buffer.from(result.files['composition.png']),at=bytes.indexOf('pHYs');assert.ok(at>0);assert.equal(bytes.readUInt32BE(at+4),11811);assert.equal(result.blob.type,'application/zip');assert.deepEqual(input,before);
  const changed=clone(input);changed.recipe.slots[0].asset.clean_png_sha256='f'.repeat(64);changed.panels[0].slot=clone(changed.recipe.slots[0]);await assert.rejects(buildCompositionBundle(changed),/SHA-256/);assert.equal(drawn,1,'bad bytes are rejected before rasterization');
 }finally{if(saved.Image===undefined)delete globalThis.Image;else globalThis.Image=saved.Image;if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;if(saved.crypto)Object.defineProperty(globalThis,'crypto',saved.crypto);else delete globalThis.crypto;}
});
