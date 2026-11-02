// Contract + protocol model checks, deliberately not browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ImageWorkspace,imageTools} from '../lib/image_workspace.mjs';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {checkObservationNote,checkResumableInputs,observationReadback} from '../ui/image-panel/observation-contract.mjs';
import {panelRoiHandoff,roiObservationModel} from '../ui/image-panel/roi-observations.mjs';
import {agentContinuationText,observationOriginLabel} from '../ui/image-panel/research-workspace.mjs';
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),P='d'.repeat(32);
const mark=()=>({annotation_id:'operator-roi',kind:'rectangle',status:'hypothesized',note:'Supplied visible support; not material truth',purpose:'resumable_observation',observation_contract_version:1,selection_origin:'unspecified',selection_origin_basis:'caller_reported_not_authenticated',anchor:{coordinate_space:'source_pixels',source_object_id:A,coordinates:[2,3,20,24]}});
const fixture=()=>({panel_id:P,object:{object_id:B,kind:'annotate',annotations:[mark()],panels:[{domain:'spatial_pixels',source_object_id:A,source_rect_xyxy:[0,0,32,32],image_rect_xyxy:[0,0,320,320]}]},frame_identity:{frame_object_id:A,frame_index:0},edit_state:{dirty:false,gesture_active:false,annotation_edit:null},selection:null});
const expectation=()=>({object_id:B,annotation_id:'operator-roi',source_object_id:A,coordinates:[2,3,20,24],note:mark().note,selection_origin:'unspecified',xy_calibration:null});

test('new resumable requests require stable ID and actor before worker invocation',async()=>{
 let dispatches=0;const workspace=new ImageWorkspace({workspace:path.resolve('unused-resumable-test'),spawnProcess(){dispatches++;throw Error('Unexpected worker dispatch');}});
 const registry=new ToolRegistry().register(createImageModule({imageWorkspace:workspace}));
 const input={kind:'rectangle',status:'hypothesized',coordinates:[2,3,20,24],purpose:'resumable_observation',annotation_id:'stable',selection_origin:'agent'};
 try{
  for(const field of ['annotation_id','selection_origin']){const malformed={...input};delete malformed[field];await assert.rejects(registry.call('image_annotate',{object_id:B,request_id:'never-saved',annotations:[malformed]}),new RegExp(field+'.*not_submitted'));}
  for(const [note,length] of [['x'.repeat(1001),1001],['😀'.repeat(501),1002]])await assert.rejects(registry.call('image_annotate',{object_id:B,request_id:'never-saved',annotations:[{...input,note}]}),new RegExp(`arguments.annotations\\[0\\].note: actual_length=${length}; limit=1000.*UTF-16.*not_submitted`));
  assert.equal(dispatches,0);
 }finally{workspace.close();}
 assert.doesNotThrow(()=>checkResumableInputs({annotations:[{...input,note:'😀'.repeat(500)}]}));
 assert.doesNotThrow(()=>checkResumableInputs({updates:[{annotation_id:'stable',coordinates:[3,3,21,24]}]}),'omitted actor on existing scientific revision is handled as unspecified by saved parent');
 assert.doesNotThrow(()=>checkResumableInputs({annotations:[{kind:'rectangle',status:'hypothesized',coordinates:[2,3,20,24]}]}),'legacy anonymous display annotation remains permitted');
 const def=imageTools.find(t=>t.name==='image_annotate');assert.equal(def.inputSchema.properties.annotations.items.properties.purpose.enum[0],'resumable_observation');
});

test('UTF-16 checks never truncate caller text',()=>{
 for(const note of ['x'.repeat(1000),'😀'.repeat(500)])assert.doesNotThrow(()=>checkObservationNote(note));
 for(const note of ['x'.repeat(1001),'😀'.repeat(501)]){const old=note;assert.throws(()=>checkObservationNote(note),/actual_length=.*limit=1000 UTF-16.*no truncation/);assert.equal(note,old);}
});

test('actual readback separates saved record, usable pixel ROI and interaction readiness',()=>{
 const s=fixture(),expected=expectation(),before=structuredClone(s),good=observationReadback(s,expected);
 assert.deepEqual([good.saved,good.usable,good.ready],[true,true,true]);assert.match(good.reason,/不代表科学确认/);
 assert.equal(panelRoiHandoff(s).scientific_input.status,'pixel_only');
 for(const patch of [{edit_state:{dirty:true,gesture_active:false}},{edit_state:{dirty:false,gesture_active:true}},{pending_result:{object_id:C}},{last_operation:{state:'submitted',request_id:'unknown-original'}},{draft_persistence:{pending:true,error:null}}]){
  const result=observationReadback({...s,...patch},expected);assert.equal(result.saved,true);assert.equal(result.ready,false);
 }
 const unknown=observationReadback({...s,edit_state:null},expected);assert.equal(unknown.saved,true);assert.equal(unknown.ready,false);
 assert.deepEqual(s,before);
});

test('mismatched source, object, anchor, calibration, actor and duplicate ID cannot pass readback',()=>{
 const mutations=[s=>s.object.object_id=C,s=>s.object.annotations[0].anchor.source_object_id=C,s=>s.object.annotations[0].anchor.coordinates[0]=3,s=>s.object.annotations[0].note='later scientific edit',s=>s.object.annotations[0].selection_origin='agent',s=>s.object.annotations[0].observation_contract_version=2,s=>s.object.annotations.push(mark()),s=>s.object.xy_calibration={calibration_id:C,revision:1,status:'active',coordinate_domain:'real_space'}];
 for(const mutate of mutations){const s=fixture();mutate(s);const result=observationReadback(s,expectation());assert.equal(result.saved,false);assert.equal(result.ready,false);}
 const wrongFrame=fixture();wrongFrame.frame_identity.frame_object_id=C;const bad=observationReadback(wrongFrame,expectation());assert.equal(bad.saved,true);assert.equal(bad.usable,false);assert.equal(bad.ready,false);
});

test('new metadata reaches MCP/UI continuation; legacy absence is never an invented actor',()=>{
 const s=fixture(),packet=panelRoiHandoff(s),model=roiObservationModel(s);
 for(const field of ['purpose','observation_contract_version','selection_origin','selection_origin_basis']){assert.equal(packet.saved_rectangles[0][field],mark()[field]);assert.equal(model.rows[0][field],mark()[field]);}
 const prompt=agentContinuationText(model,P);assert.match(prompt,/annotation_id=operator-roi/);assert.match(prompt,/选择来源：未指定（调用者声明，非身份认证）/);
 for(const field of ['purpose','observation_contract_version','selection_origin','selection_origin_basis'])delete s.object.annotations[0][field];
 const old=roiObservationModel(s);assert.match(agentContinuationText(old,P),/来源未记录（历史记录不推断）/);assert.equal(old.packet.saved_rectangles[0].usable,true,'legacy stable ROI retains prior handoff semantics');
 s.object.annotations[0].note='😀'.repeat(2048);assert.equal(roiObservationModel(s).rows[0].reason,s.object.annotations[0].note);
 delete s.object.annotations[0].annotation_id;assert.equal(panelRoiHandoff(s).saved_rectangles[0].usable,false);assert.equal(observationOriginLabel({}),'选择来源未记录（历史记录不推断）');
});
