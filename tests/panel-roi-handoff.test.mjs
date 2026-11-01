// Read-only state/transport tests; not browser gestures or science qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {panelRoiHandoff} from '../lib/panel_roi_handoff.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';

const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),P='d'.repeat(32);
const panel=()=>({domain:'spatial_pixels',source_object_id:A,source_rect_xyxy:[0,0,128,64],image_rect_xyxy:[18,15,818,415]});
const mark=(annotation_id,coordinates,extra={})=>({annotation_id,kind:'rectangle',text:annotation_id,status:'hypothesized',
 anchor:{source_object_id:A,coordinate_space:'source_pixels',coordinates},...extra});
const state=()=>({panel_id:P,state_revision:7,object:{object_id:B,kind:'annotate',panels:[panel()],
 annotations:[mark('roi-a',[2.2,3.9,63.1,62.2]),mark('roi-b',[63.2,3.9,124,60.1],{text:'Operator-selected comparison; no phase claim',status:'user_confirmed'})],
 xy_calibration:{calibration_id:C,revision:2,status:'active',coordinate_domain:'real_space'}},
 frame_identity:{frame_object_id:A,frame_index:0,source_object_id:'e'.repeat(32)},selection:null,
 edit_state:{dirty:false,gesture_active:false,selection:null,annotation_edit:null,draft_revision:4}});

test('saved fractional source rectangles use the existing outward edge conversion without changing anchors',()=>{
 const source=state(),before=structuredClone(source),handoff=panelRoiHandoff(source);
 assert.deepEqual(handoff.saved_rectangles.map(row=>row.rect_xyxy),[[2,3,64,63],[63,3,124,61]]);
 assert.ok(handoff.saved_rectangles.every(row=>row.usable&&row.origin==='saved_annotation'));
 assert.deepEqual(handoff.saved_rectangles.map(row=>row.original_anchor.coordinates),[[2.2,3.9,63.1,62.2],[63.2,3.9,124,60.1]]);
 assert.equal(handoff.saved_rectangles[1].status,'user_confirmed');
 assert.equal(handoff.saved_rectangles[1].text,source.object.annotations[1].text);
 assert.deepEqual(source,before,'Handoff must not mutate the scientific/display snapshot');
 assert.equal(handoff.read_only,true);
});

test('scientific recipe names the exact frame and current calibration, never the annotation object',()=>{
 const handoff=panelRoiHandoff(state()),input=handoff.scientific_input;
 assert.equal(input.frame_object_id,A);assert.notEqual(input.frame_object_id,B);
 assert.equal(input.status,'attach_current_calibration');assert.equal(input.calibration_revision,2);
 assert.deepEqual(input.prepare_call,{tool:'image_calibrate',arguments:{object_id:A,calibration_object_id:C},request_id_required:true});
 assert.equal(input.direct_input_object_id,null,'An unwrapped old frame cannot silently replace the selected scale');
 assert.equal(handoff.source_view_object_id,B);assert.equal(handoff.state_revision,7);
});

test('unknown scale stays pixel-only and missing or malformed identities never infer a replacement',()=>{
 const raw=state();delete raw.object.xy_calibration;
 const unknown=panelRoiHandoff(raw).scientific_input;
 assert.equal(unknown.status,'pixel_only');assert.equal(unknown.calibration_object_id,null);
 assert.equal(unknown.direct_input_object_id,A);assert.equal(unknown.prepare_call,null);
 const missing=state();missing.frame_identity=null;
 const absent=panelRoiHandoff(missing);assert.equal(absent.scientific_input.usable,false);
 assert.ok(absent.saved_rectangles.every(row=>!row.usable));
 for(const patch of [{calibration_id:'latest'},{revision:0},{coordinate_domain:'reciprocal_space'},{status:'unknown'}]){
  const broken=state();Object.assign(broken.object.xy_calibration,patch);
  const input=panelRoiHandoff(broken).scientific_input;
  assert.equal(input.usable,false);assert.equal(input.direct_input_object_id,null);assert.equal(input.prepare_call,null);
 }
 const withdrawn=state();withdrawn.object.xy_calibration.status='withdrawn';
 const input=panelRoiHandoff(withdrawn).scientific_input;
 assert.equal(input.status,'pixel_only_withdrawn');assert.equal(input.calibration_status,'withdrawn');
 assert.equal(input.prepare_call.arguments.calibration_object_id,C,'Explicit withdrawal must not resurrect an old scale');
});

test('frequency, wrong-source, out-of-bounds and ambiguous panels are explicitly unusable without clipping',()=>{
 const frequency=state();frequency.object.annotations[0].anchor.coordinate_space='frequency_cycles_per_pixel';
 const f=panelRoiHandoff(frequency).saved_rectangles[0];assert.equal(f.usable,false);assert.equal(f.rect_xyxy,undefined);
 const wrong=state();wrong.object.annotations[0].anchor.source_object_id=C;
 assert.equal(panelRoiHandoff(wrong).saved_rectangles[0].usable,false);
 const outside=state();outside.object.annotations[0].anchor.coordinates=[-.3,2,40,30];
 const o=panelRoiHandoff(outside).saved_rectangles[0];assert.equal(o.usable,false);assert.equal(o.rect_xyxy,undefined);
 assert.deepEqual(o.original_anchor.coordinates,[-.3,2,40,30]);
 const ambiguous=state();ambiguous.object.panels.push(panel());
 assert.ok(panelRoiHandoff(ambiguous).saved_rectangles.every(row=>!row.usable));
 const retracted=state();retracted.object.annotations[0].status='retracted';
 assert.equal(panelRoiHandoff(retracted).saved_rectangles[0].usable,false);
});

test('current draft selection stays separate from committed saved rectangles and requires exact panel mapping',()=>{
 const source=state();source.selection={kind:'rectangle',source_object_id:A,coordinate_space:'source_pixels',coordinates:[9.2,8.4,30.1,31.5],panel:panel()};
 source.edit_state={...source.edit_state,dirty:true,gesture_active:true,selection:structuredClone(source.selection),annotation_edit:{annotation_id:'roi-a',coordinates:[10,10,20,20]}};
 const before=structuredClone(source),handoff=panelRoiHandoff(source);
 assert.deepEqual(handoff.current_selection.rect_xyxy,[9,8,31,32]);
 assert.equal(handoff.current_selection.origin,'current_selection');assert.equal(handoff.current_selection.annotation_id,null);
 assert.equal(handoff.saved_rectangles.length,2);assert.deepEqual(handoff.saved_rectangles[0].rect_xyxy,[2,3,64,63]);
 assert.equal(handoff.draft_state.requires_user_commit,true);assert.deepEqual(source,before);
 source.selection.panel.image_rect_xyxy=[0,0,128,64];
 assert.equal(panelRoiHandoff(source).current_selection.usable,false,'Forged or stale render mapping cannot be guessed');
});

test('malformed geometry and inspection budgets cannot become a partly truncated valid ROI set',()=>{
 const invalid=state();invalid.object.annotations[0].anchor.coordinates=[NaN,0,10,10];
 assert.equal(panelRoiHandoff(invalid).saved_rectangles[0].usable,false);
 const tooMany=state();tooMany.object.annotations=Array.from({length:101},(_,i)=>mark(`roi-${i}`,[0,0,10,10]));
 const packet=panelRoiHandoff(tooMany);assert.equal(packet.inspection_status,'annotation_budget_exceeded');assert.deepEqual(packet.saved_rectangles,[]);
 const panels=state();panels.object.panels=Array.from({length:33},panel);
 assert.equal(panelRoiHandoff(panels).inspection_status,'panel_budget_exceeded');
 assert.ok(panelRoiHandoff(panels).saved_rectangles.every(row=>!row.usable));
});

test('Panel MCP response adds handoff while preserving old view and actual image content fields',()=>{
 const source=state(),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 source.png_base64=png;source.clean_png_base64=png;source.domain_png_base64=null;source.tools=[];
 const manager=new ImagePanelManager({workspace:path.resolve('unused-readonly-panel-handoff'),python:'unused',inspect(){throw Error('No scientific inspection should run');}});
 manager.getConnection=()=>({schema_version:1,panel_id:P,port:12345,token:'unit-token',pid:1});
 const before=structuredClone(source),result=manager.response(P,source),data=JSON.parse(result.content[0].text);
 const {png_base64,clean_png_base64,domain_png_base64,tools,...expectedView}=source;
 assert.deepEqual(data.view,expectedView);assert.deepEqual(data.roi_handoff,panelRoiHandoff(source));
 assert.equal(result.content[1].type,'image');assert.equal(result.content[1].data,png);
 assert.deepEqual(source,before,'Adding readonly handoff does not rewrite the old view');
});
