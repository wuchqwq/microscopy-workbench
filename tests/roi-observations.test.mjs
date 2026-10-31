// Pure display/coordinate view model. Not browser gestures or provider qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {panelRoiHandoff,roiObservationModel} from '../ui/image-panel/roi-observations.mjs';
import {panelRoiHandoff as mcpHandoff} from '../lib/panel_roi_handoff.mjs';

const F='f'.repeat(32),V='a'.repeat(32),C='b'.repeat(32),D='c'.repeat(32);
const mapping={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,64,32],image_rect_xyxy:[0,0,640,320]};
const mark=(id,c,extra={})=>({annotation_id:id,kind:'rectangle',text:'same visible name',note:'Researcher observation, not a material conclusion',status:'hypothesized',
 anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:c},...extra});
const fixture=()=>({object:{object_id:V,kind:'annotate',panels:[structuredClone(mapping)],annotations:[mark('a',[0,0,31.2,32]),mark('b',[31.8,0,64,32])],
 xy_calibration:{calibration_id:C,revision:1,status:'active',coordinate_domain:'real_space',source:'user_statement_not_independently_verified',source_text:'Public synthetic signed sampling',xy_scale:{x:.02,y:-.03,unit:'nm'}},display:{gamma:1}},
 frame_identity:{frame_object_id:F,frame_index:0},source_identity:{label:'用户指定 TIFF',filename:'public.tiff'},state_revision:1,selection:null,
 edit_state:{dirty:false,gesture_active:false,annotation_edit:null,draft_revision:0}});

test('MCP and frontend export exactly one shared pure coordinate implementation',()=>{
 assert.equal(panelRoiHandoff,mcpHandoff);
 const input=fixture(),before=structuredClone(input),model=roiObservationModel(input);
 assert.deepEqual(model.packet,mcpHandoff(input));assert.deepEqual(input,before);
 assert.deepEqual(model.rows.map(row=>row.annotation_id),['a','b']);assert.deepEqual(model.rows.map(row=>row.label),['same visible name','same visible name']);
 assert.ok(model.rows.every(row=>row.reason==='Researcher observation, not a material conclusion'&&row.status==='saved'&&!row.dirty));
 assert.deepEqual(model.rows.map(row=>row.rect_xyxy),[[0,0,32,32],[31,0,64,32]]);
 assert.deepEqual(model.calibration.xy_scale,{x:.02,y:-.03,unit:'nm'});assert.equal(model.calibration.source,'user_statement_not_independently_verified');
 assert.ok(model.warnings.some(w=>w.includes('有间隙')&&w.includes('重叠')&&w.includes('不是物理界面证据')));
 assert.equal(model.changes.status,'uncompared');
});

test('unsaved selection and one-row annotation draft cannot become another saved observation',()=>{
 const input=fixture();input.selection={kind:'rectangle',...input.object.annotations[0].anchor,panel:structuredClone(mapping)};
 input.edit_state={...input.edit_state,dirty:true,gesture_active:true,annotation_edit:{annotation_id:'a',coordinates:[1,0,31.2,32]}};
 const model=roiObservationModel(input);
 assert.equal(model.rows.length,2);assert.equal(model.rows[0].status,'saved_with_draft');assert.equal(model.rows[0].geometry_draft,true);
 assert.equal(model.rows[1].status,'saved');assert.equal(model.rows[1].dirty,false);assert.deepEqual(model.rows[0].original_anchor.coordinates,[0,0,31.2,32]);
 assert.equal(model.current_selection.status,'draft');assert.equal(model.current_selection.annotation_id,null);
 assert.ok(model.warnings.some(w=>w.includes('草稿不是正式科学 ROI')));assert.equal(model.packet.saved_rectangles.length,2);
});

test('retracted and wrong-grid saved marks remain visible as unavailable rather than silently disappearing',()=>{
 const input=fixture();input.object.annotations[0].status='retracted';input.object.annotations[1].anchor.source_object_id=D;
 const model=roiObservationModel(input);assert.equal(model.rows[0].status,'retracted');assert.equal(model.rows[1].status,'unusable');
 assert.ok(model.rows.every(row=>!row.usable));assert.deepEqual(model.packet.support_pairs,[]);assert.deepEqual(model.rows.map(row=>row.annotation_id),['a','b']);
});

test('display and label edits preserve dependency identity; one geometry edit affects only its stable annotation',()=>{
 const initial=fixture(),before=roiObservationModel(initial).dependency_snapshot;
 const display=structuredClone(initial);display.object.object_id=D;display.object.display.gamma=1.7;display.object.annotations[0].text='renamed display only';
 let changes=roiObservationModel(display,before).changes;assert.equal(changes.status,'unchanged_science');assert.deepEqual(changes.changed_annotation_ids,[]);
 const moved=structuredClone(display);moved.object.annotations[0].anchor.coordinates=[1,0,31.2,32];
 changes=roiObservationModel(moved,before).changes;assert.equal(changes.status,'dependencies_changed');assert.deepEqual(changes.changed_annotation_ids,['a']);
 assert.equal(changes.calibration_changed,false);assert.equal(changes.source_changed,false);
 const deleted=structuredClone(initial);deleted.object.annotations=deleted.object.annotations.slice(1);
 assert.deepEqual(roiObservationModel(deleted,before).changes.removed_annotation_ids,['a']);
});

test('changed source/scale are explicit; unknown or withdrawn calibration never invents physical units',()=>{
 const initial=fixture(),before=roiObservationModel(initial).dependency_snapshot;
 const changed=structuredClone(initial);changed.object.xy_calibration={...changed.object.xy_calibration,calibration_id:D,revision:2,xy_scale:{x:.04,y:-.03,unit:'nm'}};
 const revised=roiObservationModel(changed,before);assert.equal(revised.changes.calibration_changed,true);assert.equal(revised.calibration.revision,2);
 assert.equal(revised.packet.scientific_input.prepare_call.arguments.calibration_object_id,D);assert.deepEqual(revised.rows.map(row=>row.rect_xyxy),[[0,0,32,32],[31,0,64,32]]);
 const foreign=structuredClone(initial);foreign.frame_identity.frame_object_id=D;
 const stale=roiObservationModel(foreign,before);assert.equal(stale.changes.status,'source_changed');assert.ok(stale.rows.every(row=>!row.usable));
 const unknown=structuredClone(initial);delete unknown.object.xy_calibration;
 const pixel=roiObservationModel(unknown,before);assert.equal(pixel.calibration.status,'unknown');assert.equal(pixel.calibration.xy_scale,null);assert.ok(pixel.warnings.some(w=>w.includes('像素域')));
 const withdrawn=structuredClone(initial);withdrawn.object.xy_calibration.status='withdrawn';const withdrawnModel=roiObservationModel(withdrawn,before);
 assert.equal(withdrawnModel.calibration.xy_scale,null);assert.equal(withdrawnModel.packet.scientific_input.status,'pixel_only_withdrawn');
 const broken=structuredClone(initial);broken.object.xy_calibration.coordinate_domain='reciprocal_space';
 assert.equal(roiObservationModel(broken,before).calibration.status,'unusable');assert.equal(roiObservationModel(broken,before).calibration.xy_scale,null);
});

test('pair budget and ambiguous saved identity stay explicit; names never provide identity across revisions',()=>{
 const input=fixture();input.object.annotations=Array.from({length:10},(_,i)=>mark(`id-${i}`,[i,0,i+20,20]));
 const model=roiObservationModel(input);assert.equal(model.rows.length,10);assert.equal(model.packet.support_pairs.length,32);
 assert.ok(model.warnings.some(w=>w.includes('32 / 45')&&w.includes('未检查')));
 const duplicate=fixture();duplicate.object.annotations[1].annotation_id='a';const bad=roiObservationModel(duplicate);
 assert.equal(bad.dependency_snapshot.complete,false);assert.ok(bad.warnings.some(w=>w.includes('身份')));
 const first=roiObservationModel(fixture()).dependency_snapshot,next=fixture();next.object.annotations[0].annotation_id='replacement';
 const changes=roiObservationModel(next,first).changes;assert.deepEqual(changes.removed_annotation_ids,['a']);assert.deepEqual(changes.added_annotation_ids,['replacement']);
 assert.deepEqual(changes.changed_annotation_ids,[],'Identical human labels and geometry do not alias separate records');
});
