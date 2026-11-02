// Hand-solvable spatial edge mapping. No scientific tools or browser gestures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceWindowOutlines,createSourceOverlay} from '../ui/image-panel/window-source-overlay.mjs';

const copy=value=>JSON.parse(JSON.stringify(value)),id=n=>n.toString(16).padStart(32,'0');
const object={object_id:id(1),array_domain:'spatial',panels:[{domain:'spatial_pixels',source_object_id:id(10),source_rect_xyxy:[20,10,120,60],image_rect_xyxy:[10,20,210,120]}],annotations:[{annotation_id:'retained-original'}]};
const source=(rect,raw)=>({frame_object_id:id(10),input_view_object_id:id(1),raw_fft_object_id:id(raw),processing_rect_xyxy:rect,calibration_relation:'same'});
const collection={schema_version:1,revision:8,frame_object_id:id(10),active_window_id:'source',windows:[
 {window_id:'source',object_id:id(1),role:'source',title:'来源图像'},
 {window_id:'fft-a',object_id:id(2),role:'fft',title:'FFT A',source_reference:source([30,20,70,40],20)},
 {window_id:'fft-b',object_id:id(3),role:'fft',title:'FFT B',source_reference:source([70,30,110,50],21)}
]};
function document(){
 class Element{constructor(tag){this.tagName=tag;this.attributes={};this.children=[];this.textContent='';}setAttribute(key,value){this.attributes[key]=String(value);}append(...children){this.children.push(...children);}}
 return {createElement:tag=>new Element(tag),createElementNS:(_namespace,tag)=>new Element(tag)};
}

test('two FFT processing windows map source-pixel edges independently with distinct line forms',()=>{
 const before=copy({object,collection}),outlines=sourceWindowOutlines(object,collection);
 assert.deepEqual(outlines,[{window_id:'fft-a',label:'FFT A 计算区域',coordinates:[30,40,110,80],line_style:'solid'},{window_id:'fft-b',label:'FFT B 计算区域',coordinates:[110,60,190,100],line_style:'dashed'}]);
 assert.deepEqual({object,collection},before);assert.equal(Object.hasOwn(object,'selection'),false);assert.equal(object.annotations.length,1);
});
test('wrong-frame, outside-support, noninteger and missing references are omitted without clipping',()=>{
 for(const change of [c=>{c.windows[1].source_reference.frame_object_id=id(99);},c=>{c.windows[1].source_reference.processing_rect_xyxy=[0,20,70,40];},c=>{c.windows[1].source_reference.processing_rect_xyxy=[30.25,20,70,40];},c=>{delete c.windows[1].source_reference;},c=>{c.windows[1].source_reference.raw_fft_object_id='invalid';}]){
  const c=copy(collection);change(c);assert.deepEqual(sourceWindowOutlines(object,c).map(value=>value.window_id),['fft-b']);
 }
 const c=copy(collection);c.frame_object_id=id(99);assert.deepEqual(sourceWindowOutlines(object,c),[]);
});
test('frequency, array-index, ambiguous and malformed panel mappings do not receive a spatial overlay',()=>{
 for(const change of [o=>{o.array_domain='frequency';},o=>{o.panels[0].domain='frequency';},o=>{o.panels[0].domain='source_array_indices';},o=>{o.panels.push(copy(o.panels[0]));},o=>{o.panels[0].source_object_id=id(99);},o=>{o.panels[0].image_rect_xyxy=[10,20,10,120];},o=>{o.panels[0].source_rect_xyxy=[20,10,NaN,60];},o=>{o.panels[0].image_rect_xyxy=[-1,20,210,120];}]){
  const o=copy(object);change(o);assert.deepEqual(sourceWindowOutlines(o,collection),[]);
 }
});
test('a cropped spatial window draws only complete FFT support contained in its own panel',()=>{
 const crop=copy(object);crop.panels[0].source_rect_xyxy=[30,20,70,40];crop.panels[0].image_rect_xyxy=[0,0,200,100];
 assert.deepEqual(sourceWindowOutlines(crop,collection),[{window_id:'fft-a',label:'FFT A 计算区域',coordinates:[0,0,200,100],line_style:'solid'}]);
});
test('duplicate identities and excessive collections abstain instead of claiming complete comparison',()=>{
 const duplicate=copy(collection);duplicate.windows.push(copy(duplicate.windows[1]));assert.deepEqual(sourceWindowOutlines(object,duplicate),[]);
 const excessive=copy(collection);excessive.windows.push({window_id:'4'},{window_id:'5'},{window_id:'6'});assert.deepEqual(sourceWindowOutlines(object,excessive),[]);
});
test('SVG labels explicitly identify calculation areas and preserve readable scale and line shapes',()=>{
 const before=copy({object,collection}),layer=createSourceOverlay(document(),object,collection,[220,140],2);assert.equal(layer.className,'window-source-overlay');
 const svg=layer.children[0];assert.equal(svg.attributes['viewBox'],'0 0 220 140');assert.match(svg.attributes['aria-label'],/整数计算区域.*不是当前选区或原始浮点/);assert.equal(svg.children.length,2);
 const first=svg.children[0],second=svg.children[1];assert.equal(first.children[0].attributes['vector-effect'],'non-scaling-stroke');assert.equal(first.children[0].attributes['stroke-dasharray'],undefined);assert.equal(second.children[0].attributes['stroke-dasharray'],'7 4');assert.equal(first.children[1].attributes['font-size'],'5.5');assert.equal(first.children[1].textContent,'FFT A 计算区域');assert.notEqual(first.children[1].attributes.y,second.children[1].attributes.y);
 assert.deepEqual({object,collection},before);assert.equal(layer.onpointerdown,undefined);assert.equal(layer.onclick,undefined);
});
test('rendering refuses panel/image mismatch, invalid camera or absent qualified outlines',()=>{
 assert.equal(createSourceOverlay(document(),object,collection,[100,100],1),null);
 for(const size of [[0,140],[220,Infinity],[220]])assert.equal(createSourceOverlay(document(),object,collection,size,1),null);
 for(const scale of [0,NaN,Infinity,1e5])assert.equal(createSourceOverlay(document(),object,collection,[220,140],scale),null);
 const empty=copy(collection);empty.windows=[empty.windows[0]];assert.equal(createSourceOverlay(document(),object,empty,[220,140],1),null);
});
test('window text is rendered literally and never injected as SVG markup',()=>{
 const c=copy(collection);c.windows[1].title='<script>not markup</script>';const layer=createSourceOverlay(document(),object,c,[220,140],1),text=layer.children[0].children[0].children[1];assert.equal(text.textContent,'<script>not markup</script> 计算区域');assert.equal(text.children.length,0);
});
