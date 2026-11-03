// Hand-solvable spatial edge mapping. No scientific tools or browser gestures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceWindowOutlines,createSourceOverlay,savedWindowAnnotationLayout,createSavedAnnotationOverlay,sourceWindowLabelLayout} from '../ui/image-panel/window-source-overlay.mjs';

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

test('historical ROI vectors reuse source-edge mapping and constant screen dimensions at 100 percent and fit',()=>{
 const saved={...copy(object),annotations:[{annotation_id:'old-roi',kind:'rectangle',text:'历史区域',status:'hypothesized',color:'cyan',anchor:{source_object_id:id(10),coordinate_space:'source_pixels',coordinates:[30.25,20.5,70.75,40.5]}}]},before=copy(saved);
 const full=savedWindowAnnotationLayout(saved,[220,140],1),fit=savedWindowAnnotationLayout(saved,[220,140],.2);assert.deepEqual(full.items[0].coordinates,[30.5,41,111.5,81]);assert.deepEqual(fit.items[0].coordinates,full.items[0].coordinates);assert.equal(full.items[0].label.fontSize,fit.items[0].label.fontSize*.2);assert.equal(full.items[0].lineWidth,fit.items[0].lineWidth*.2);assert.equal(fit.items[0].label.text,'历史区域');assert.equal(fit.items[0].selected,false);assert.deepEqual(saved,before);
 const layer=createSavedAnnotationOverlay(document(),saved,[220,140],.2);assert.equal(layer.className,'window-annotation-overlay');assert.match(layer.innerHTML,/历史区域/);assert.doesNotMatch(layer.innerHTML,/annotation-label-draggable|data-annotation-id=|data-part="handles"/);
});
test('legacy, foreign and ambiguous saved anchors cannot replace the baked annotation image',()=>{
 assert.equal(savedWindowAnnotationLayout(object,[220,140],.2),null);
 const mark={annotation_id:'r',kind:'rectangle',anchor:{source_object_id:id(99),coordinate_space:'source_pixels',coordinates:[30,20,70,40]}};assert.equal(savedWindowAnnotationLayout({...object,annotations:[mark]},[220,140],1),null);
 const anchored={...mark,anchor:{...mark.anchor,source_object_id:id(10)}};assert.equal(savedWindowAnnotationLayout({...object,panels:[object.panels[0],object.panels[0]],annotations:[anchored]},[220,140],1),null);
});
test('frequency saved points use the existing diffraction presentation preset without physical inference',()=>{
 const saved={object_id:id(4),panels:[{domain:'frequency',source_object_id:id(5),fft_shape_yx:[96,128],fft_rect_xyxy:[0,0,128,96],image_rect_xyxy:[0,0,128,96]}],annotations:[{annotation_id:'g',kind:'point',text:'',anchor:{source_object_id:id(5),coordinate_space:'frequency_cycles_per_pixel',coordinates:[.125,0]}}]};
 const layout=savedWindowAnnotationLayout(saved,[128,96],.5);assert.equal(layout.preset,'diffraction');assert.equal(layout.items[0].label.text,'g₁');assert.deepEqual(layout.items[0].coordinates,[80,48]);assert.equal(layout.items[0].selected,false);
});
test('auxiliary FFT labels use the shared placement routine to avoid the saved ROI label at 100 percent and fit',()=>{
 const saved={object_id:id(1),panels:[{domain:'spatial_pixels',source_object_id:id(10),source_rect_xyxy:[0,0,600,400],image_rect_xyxy:[0,0,600,400]}],annotations:[{annotation_id:'a',kind:'rectangle',text:'ROI A',color:'cyan',anchor:{source_object_id:id(10),coordinate_space:'source_pixels',coordinates:[40,60,200,200]}}]},set={...copy(collection),windows:[{window_id:'fft-a',object_id:id(2),role:'fft',title:'FFT A',source_reference:source([40,60,200,200],20)}]};
 for(const scale of [1,.2]){const ordinary=savedWindowAnnotationLayout(saved,[600,400],scale).items[0].label,overlay=createSourceOverlay(document(),saved,set,[600,400],scale),label=sourceWindowLabelLayout(saved,set,[600,400],scale)[0],x=label.x,y=label.y;assert.ok(x>=ordinary.x+ordinary.width||x+label.width<=ordinary.x||y>=ordinary.y+ordinary.height||y+label.height<=ordinary.y,'FFT title must avoid ordinary saved ROI label');}
});

test('two FFT processing windows map source-pixel edges independently with distinct line forms',()=>{
 const before=copy({object,collection}),outlines=sourceWindowOutlines(object,collection);
 assert.deepEqual(outlines,[{window_id:'fft-a',label:'FFT A 计算区域',coordinates:[30,40,110,80],line_style:'dashed'},{window_id:'fft-b',label:'FFT B 计算区域',coordinates:[110,60,190,100],line_style:'dotted'}]);
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
 assert.deepEqual(sourceWindowOutlines(crop,collection),[{window_id:'fft-a',label:'FFT A 计算区域',coordinates:[0,0,200,100],line_style:'dashed'}]);
});
test('duplicate identities and excessive collections abstain instead of claiming complete comparison',()=>{
 const duplicate=copy(collection);duplicate.windows.push(copy(duplicate.windows[1]));assert.deepEqual(sourceWindowOutlines(object,duplicate),[]);
 const excessive=copy(collection);excessive.windows.push({window_id:'4'},{window_id:'5'},{window_id:'6'});assert.deepEqual(sourceWindowOutlines(object,excessive),[]);
});
test('SVG labels explicitly identify calculation areas and preserve readable scale and line shapes',()=>{
 const before=copy({object,collection}),layer=createSourceOverlay(document(),object,collection,[220,140],2);assert.equal(layer.className,'window-source-overlay');
 const svg=layer.children[0];assert.equal(svg.attributes['viewBox'],'0 0 220 140');assert.match(svg.attributes['aria-label'],/整数计算区域.*不是当前选区或原始浮点/);assert.equal(svg.children.length,2);
 const first=svg.children[0],second=svg.children[1];assert.equal(first.children[0].attributes['vector-effect'],'non-scaling-stroke');assert.equal(first.children[0].attributes['stroke-dasharray'],'7 4');assert.equal(second.children[0].attributes['stroke-dasharray'],'2 3');assert.equal(first.children[1].attributes['font-size'],'5.5');assert.equal(first.children[1].textContent,'FFT A 计算区域');assert.notEqual(first.children[1].attributes.y,second.children[1].attributes.y);
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
