// Deterministic renderer/contract checks; not native visual or real model proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createJointResearchDialog} from '../ui/image-panel/joint-research-ui.mjs';
const V='1'.repeat(32),F='2'.repeat(32),M='3'.repeat(32),S='4'.repeat(32),OTHER='9'.repeat(32);
class Element {
 constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.textContent='';this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.open=false;this.attributes={};this.listeners={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(key,value){this.listeners[key]=value;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 set innerHTML(_){throw Error('Dynamic HTML is prohibited');}
 get style(){throw Error('Inline style is prohibited');}
}
const walk=e=>[e,...e.children.flatMap(walk)],content=e=>[e.textContent,...e.children.map(content)].join(' ');
const button=(f,label)=>walk(f.root).find(e=>e.tagName==='BUTTON'&&e.textContent===label);
const review=f=>button(f,'核对本次图像与证据（不发送）');
const checkboxes=f=>walk(f.root).filter(e=>e.type==='checkbox');
function fixture(){
 const document={createElement:tag=>new Element(tag,document)},root=document.createElement('div'),calls=[],errors=[];
 const state={object:{object_id:V,shape_yx:[64,64],dtype:'float32',panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[10,10,40,40],image_rect_xyxy:[0,0,30,30]}],user_context:{input_origin:'simulation',modality:'stem_haadf',source_text:'Public software condition only'},xy_calibration:{status:'active',source_text:'Manual reference',xy_scale:{x:.012000927901950438,y:.011314583333333333,unit:'nm'}}},frame_identity:{frame_object_id:F},state_revision:7,research_question:{text:'A finite source-array question',context_object_id:V,frame_object_id:F},selection:null,png_base64:'iVBORw0KGgo=',joint_research:{status:'idle',host:null,history:[],unresolved_request_ids:[]}};
 let measurements={object_id:V,state_revision:7,current:{object_id:V},entries:[{object_id:M,measurement_object_id:M,status:'current',same_frame:true,same_grid:true,coordinate_space:'source_pixels',points:[[12,12],[20,20]],measurement_kind:'two_point',distance_pixels:Math.sqrt(128),name:'Saved distance'}]};
 let statistics={read_only:true,object_id:V,frame_object_id:F,scope:'same_frame_source_pixels',entries:[{object_id:S,frame_object_id:F,coordinate_space:'source_pixels',component:'raw',source_rect_xyxy:[12,12,20,20],statistics:{sample_count:64,mean:4,stddev:0}}]};
 let measurementsRead=async()=>structuredClone(measurements),statisticsRead=async()=>structuredClone(statistics),reviewCall=async request=>{calls.push(request);};
 const ui=createJointResearchDialog({root,readState:()=>state,readMeasurements:objectId=>{assert.equal(objectId,V);return measurementsRead();},readStatistics:objectId=>{assert.equal(objectId,V);return statisticsRead();},onReview:request=>reviewCall(request),onError:error=>errors.push(error)});
 return {root,ui,state,calls,errors,get measurements(){return measurements;},get statistics(){return statistics;},setMeasurements:v=>measurements=v,setStatistics:v=>statistics=v,setMeasurementsRead:f=>measurementsRead=f,setStatisticsRead:f=>statisticsRead=f,setReview:f=>reviewCall=f};
}
test('local dialog uses exact current source, shows full XY and optional saved evidence without sends',async()=>{
 const f=fixture(),before=structuredClone(f.state);await f.ui.open();assert.equal(f.errors.length,0);assert.equal(checkboxes(f).length,2);assert.ok(checkboxes(f).every(e=>!e.checked));assert.match(content(f.root),/本地预览与核对可用；真实模型发送在此候选停用、未验收/);assert.match(content(f.root),/0.012000927901950438/);assert.match(content(f.root),/0.011314583333333333/);assert.match(content(f.root),/10, 10, 40, 40/);assert.equal(walk(f.root).filter(e=>e.tagName==='IMG').length,1);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
 const boxes=checkboxes(f);boxes.forEach(e=>e.checked=true);await review(f).onclick();assert.deepEqual(f.calls,[{selection:{measurement_ids:[M],statistics_ids:[S]}}]);assert.deepEqual(f.state,before);assert.equal(f.root.children[0].open,false);assert.ok(walk(f.root).filter(e=>e.tagName==='BUTTON').every(e=>!/发送(?!）)/.test(e.textContent)||e.textContent.includes('不发送')));
});
test('cancel and Escape discard only dialog selection, never call review',async()=>{
 const f=fixture();await f.ui.open();checkboxes(f)[0].checked=true;button(f,'取消，保留原图与记录').onclick();assert.equal(f.calls.length,0);await f.ui.open();assert.ok(checkboxes(f).every(e=>!e.checked));let prevented=false;f.root.children[0].listeners.cancel({preventDefault:()=>prevented=true});assert.equal(prevented,true);assert.equal(f.root.children[0].open,false);assert.equal(f.calls.length,0);
});
test('only current same-grid in-range measurements and same-frame raw statistics are selectable',async()=>{
 const f=fixture(),m=f.measurements.entries[0],s=f.statistics.entries[0];f.setMeasurements({...f.measurements,entries:[m,{...m,object_id:'5'.repeat(32),measurement_object_id:'5'.repeat(32),status:'needs_remeasurement'},{...m,object_id:'6'.repeat(32),measurement_object_id:'6'.repeat(32),same_frame:false},{...m,object_id:'7'.repeat(32),measurement_object_id:'7'.repeat(32),points:[[0,0],[1,1]]},{...m,object_id:'8'.repeat(32),measurement_object_id:'8'.repeat(32),annotation_id:'line',annotation_matches_current:false}]});f.setStatistics({...f.statistics,entries:[s,{...s,object_id:'5'.repeat(32),frame_object_id:OTHER},{...s,object_id:'6'.repeat(32),component:'amplitude'},{...s,object_id:'7'.repeat(32),source_rect_xyxy:[0,0,12,12]}]});await f.ui.open();assert.equal(checkboxes(f).length,2);assert.match(content(f.root),/旧\/失效测量/);assert.equal(f.errors.length,0);
});
test('each evidence list is bounded at 32 and no unlisted ID is sent',async()=>{
 const f=fixture();const gen=i=>i.toString(16).padStart(32,'0');f.setMeasurements({...f.measurements,entries:Array.from({length:35},(_,i)=>({...f.measurements.entries[0],object_id:gen(i+1),measurement_object_id:gen(i+1)}))});f.setStatistics({...f.statistics,entries:Array.from({length:36},(_,i)=>({...f.statistics.entries[0],object_id:gen(i+101)}))});await f.ui.open();assert.equal(checkboxes(f).length,64);assert.match(content(f.root),/截断/);checkboxes(f).forEach(e=>e.checked=true);await review(f).onclick();assert.equal(f.calls[0].selection.measurement_ids.length,32);assert.equal(f.calls[0].selection.statistics_ids.length,32);assert.ok(!f.calls[0].selection.measurement_ids.includes(gen(35)));
});
test('open rejects stale async view/frame/revision and ignores cancelled read results',async()=>{
 const f=fixture();let finish;f.setMeasurementsRead(()=>new Promise(resolve=>finish=resolve));const pending=f.ui.open();f.state.state_revision++;finish(f.measurements);await pending;assert.equal(f.calls.length,0);assert.equal(review(f).disabled,true);assert.match(f.errors[0].message,/修订已变化/);
 const g=fixture();let complete;g.setMeasurementsRead(()=>new Promise(resolve=>complete=resolve));const reading=g.ui.open();g.ui.close();complete(g.measurements);await reading;assert.equal(g.errors.length,0);assert.equal(g.calls.length,0);assert.equal(g.root.children[0].open,false);
});
test('submit fences changed source and original completed thread/turn',async()=>{
 const f=fixture();await f.ui.open();f.state.frame_identity.frame_object_id=OTHER;await review(f).onclick();assert.equal(f.calls.length,0);assert.match(f.errors[0].message,/源|帧|图像|空间图/);
 const g=fixture();g.state.joint_research={status:'completed',unresolved_request_ids:[],host:{connection:'ready',turn_state:'completed',thread_id:'original-thread',turn_id:'original-turn',agent_messages:[{text:'Original answer <script>not HTML</script>'}]}};await g.ui.open();const area=walk(g.root).find(e=>e.tagName==='TEXTAREA');assert.equal(review(g).disabled,true);area.value='Researcher correction based on the original measurement';area.oninput();g.state.joint_research.host.turn_id='another-turn';await review(g).onclick();assert.equal(g.calls.length,0);assert.match(g.errors[0].message,/thread\/turn已变化/);
});
test('correction is explicit, preserves original answer and exact host IDs, and never edits question',async()=>{
 const f=fixture();f.state.joint_research={status:'completed',notice:'Synthetic protocol only, not a model',unresolved_request_ids:[],host:{connection:'ready',turn_state:'completed',thread_id:'original-thread',turn_id:'original-turn',agent_messages:[{text:'Original answer <b>is plain text</b>'}]},history:[]};const before=structuredClone(f.state);await f.ui.open();assert.match(content(f.root),/Original answer <b>is plain text<\/b>/);const area=walk(f.root).find(e=>e.tagName==='TEXTAREA');area.value='Please correct the earlier interpretation; material remains unknown.';area.oninput();await review(f).onclick();assert.deepEqual(f.calls,[{selection:{measurement_ids:[],statistics_ids:[]},correction:{text:area.value,original_thread_id:'original-thread',original_turn_id:'original-turn'}}]);assert.deepEqual(f.state,before);
});
test('historical completed records alone never become an active correction host; unknown host stays fenced',async()=>{
 const f=fixture();f.state.joint_research.history=[{status:'completed',question:'Past question',thread_id:'past-thread',turn_id:'past-turn',agent_messages:[{text:'Past retained answer'}]}];await f.ui.open();assert.match(content(f.root),/Past retained answer/);const section=walk(f.root).find(e=>e.tagName==='TEXTAREA');const parent=walk(f.root).find(e=>e.children.some(c=>c.children?.includes(section)));assert.equal(parent.hidden,true);await review(f).onclick();assert.deepEqual(f.calls,[{selection:{measurement_ids:[],statistics_ids:[]}}]);
 const g=fixture();g.state.joint_research={status:'unknown',host:{connection:'ready',turn_state:'unknown',thread_id:'t',turn_id:'u'},unresolved_request_ids:['original-scientific-request']};await g.ui.open();assert.equal(review(g).disabled,true);await review(g).onclick();assert.equal(g.calls.length,0);assert.match(g.errors[0].message,/原科学请求/);
});
test('failed review is not automatically replayed and dialog cannot double-submit while pending',async()=>{
 const f=fixture();let reject;f.setReview(request=>{f.calls.push(request);return new Promise((_,no)=>reject=no);});await f.ui.open();const pending=review(f).onclick();await review(f).onclick();assert.equal(f.calls.length,1);assert.equal(button(f,'取消，保留原图与记录').disabled,true);reject(Error('Original local operation is unresolved'));await pending;assert.equal(review(f).disabled,true);await review(f).onclick();assert.equal(f.calls.length,1);assert.match(f.errors[0].message,/unresolved/);assert.equal(button(f,'取消，保留原图与记录').disabled,false);
});
test('provider readback must bind the exact view/revision and no raw ID editor is provided',async()=>{
 const f=fixture();f.setMeasurements({...f.measurements,state_revision:6});await f.ui.open();assert.equal(review(f).disabled,true);assert.match(f.errors[0].message,/准确图像与修订/);assert.equal(walk(f.root).filter(e=>e.tagName==='INPUT'&&e.type!=='checkbox').length,0);
 const g=fixture();g.setStatistics({...g.statistics,frame_object_id:OTHER});await g.ui.open();assert.equal(review(g).disabled,true);assert.match(g.errors[0].message,/同一源帧/);
});
test('captured question is a frozen copy and an existing locked review cannot be replaced',async()=>{
 const f=fixture();await f.ui.open();f.state.research_question.text='Changed in place without revision';await review(f).onclick();assert.equal(f.calls.length,0);assert.match(f.errors[0].message,/问题或修订已变化/);
 const g=fixture();g.state.joint_research={status:'reviewing',locked:true,host:null,unresolved_request_ids:[]};await g.ui.open();assert.equal(review(g).disabled,true);await review(g).onclick();assert.equal(g.calls.length,0);assert.match(g.errors[0].message,/原核对窗口/);
});
