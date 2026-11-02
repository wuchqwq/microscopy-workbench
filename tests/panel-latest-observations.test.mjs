// Reference-store tests, not provider numerics or browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PanelWindowStore,panelWindowFingerprint} from '../lib/panel_window_collection.mjs';
const bytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=bytes.toString('base64');
const id=n=>n.toString(16).padStart(32,'0'),F=id(1),V1=id(2),V3=id(3),R=id(4),digest=createHash('sha256').update(bytes).digest('hex'),frame={frame_object_id:F,frame_index:0,source_object_id:id(9)};
const panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,64,64],image_rect_xyxy:[0,0,64,64]};
const roi=n=>({annotation_id:'roi-'+n,kind:'rectangle',anchor:{source_object_id:F,coordinate_space:'source_pixels',coordinates:[n*10,1,n*10+8,9]}});
const spatial=(object_id,annotations)=>({object_id,kind:'view',parent_object_id:F,array_domain:'spatial',panels:[panel],shape_yx:[64,64],files_sha256:{'preview.png':digest},annotations});
const first=()=>spatial(V1,[roi(1)]),latest=()=>spatial(V3,[roi(1),roi(2),roi(3)]);
const fft=()=>({object_id:R,kind:'fft',parent_object_id:F,array_domain:'frequency',shape_yx:[8,8],source_rect_xyxy:[10,1,18,9],files_sha256:{'preview.png':digest},panels:[{domain:'frequency',source_object_id:R,fft_shape_yx:[8,8],image_rect_xyxy:[0,0,8,8]}]});
const reference={version:1,view_object_id:V1,frame_object_id:F,fft_object_id:R,source_rect_xyxy:[10,1,18,9]};
function completed(){const store=new PanelWindowStore();store.admit(first(),frame);store.admit(fft(),frame,reference);store.admit(first(),frame);store.rememberObservations(latest(),frame);store.admit(latest(),frame);return store;}

test('returning to an original FFT input preserves the separately saved three-ROI working revision',()=>{
 const store=completed(),before=store.snapshot().windows.find(w=>w.role==='fft').source_reference;store.admit(first(),frame);
 const current=store.snapshot().windows.find(w=>w.role==='source');assert.equal(current.object_id,V1);assert.equal(current.latest_observation_view_object_id,V3);assert.equal(store.observationMatches(current.window_id,latest(),frame),true);
 assert.deepEqual(store.snapshot().windows.find(w=>w.role==='fft').source_reference,before);assert.equal(before.input_view_object_id,V1);assert.equal(first().annotations.length,1);assert.equal(latest().annotations.length,3);
});
test('closing the source display retains its working revision through the FFT and a recreated source window',()=>{
 const store=completed();store.admit(fft(),frame,reference);const source=store.snapshot().windows.find(w=>w.role==='source');store.close(store.snapshot().revision,source.window_id);
 let snapshot=store.snapshot();assert.equal(snapshot.windows.length,1);assert.equal(snapshot.windows[0].latest_observation_view_object_id,V3);assert.equal(snapshot.windows[0].source_reference.input_view_object_id,V1);
 store.admit(first(),frame);snapshot=store.snapshot();assert.equal(snapshot.windows.find(w=>w.role==='source').latest_observation_view_object_id,V3);
});
test('owned restoration revalidates a working source reference while preserving the original FFT input',async()=>{
 const store=completed();store.admit(fft(),frame,reference);store.close(store.snapshot().revision,store.snapshot().windows.find(w=>w.role==='source').window_id);const checkpoint=store.checkpoint(),saved=new Map([[V1,first()],[V3,latest()],[R,fft()]]),reads=[];
 const restored=new PanelWindowStore();restored.admit(fft(),frame);await restored.restore(checkpoint,fft(),frame,async object_id=>{reads.push(object_id);return {object:saved.get(object_id),frame,png};});
 const current=restored.snapshot().windows[0];assert.equal(current.object_id,R);assert.equal(current.latest_observation_view_object_id,V3);assert.equal(current.source_reference.input_view_object_id,V1);assert.ok(reads.includes(V3));
 restored.admit(first(),frame);assert.equal(restored.snapshot().windows.find(w=>w.role==='source').latest_observation_view_object_id,V3);
});
test('a forged or unavailable optional latest reference is omitted without losing a qualified active FFT',async()=>{
 for(const mode of ['different-frame','different-grid','self-consistent-crop','changed-fingerprint','unavailable']){
  const store=completed();store.admit(fft(),frame,reference);store.close(store.snapshot().revision,store.snapshot().windows.find(w=>w.role==='source').window_id);const checkpoint=store.checkpoint();if(mode==='different-grid')checkpoint.records[0].latest_observation_grid_key='spatial:forged';
  const crop={...latest(),panels:[{...panel,source_rect_xyxy:[0,0,32,32]}]};if(mode==='self-consistent-crop'){checkpoint.records[0].latest_observation_grid_key='spatial:'+F+':'+JSON.stringify([0,0,32,32]);checkpoint.records[0].latest_observation_asset_fingerprint=panelWindowFingerprint(crop);}
  const restored=new PanelWindowStore();restored.admit(fft(),frame);await restored.restore(checkpoint,fft(),frame,async object_id=>{
   if(object_id===V3&&mode==='unavailable')throw Error('Controlled unavailable saved view');const object=object_id===V3?latest():object_id===V1?first():fft();if(object_id===V3&&mode==='changed-fingerprint')object.files_sha256={'preview.png':'b'.repeat(64)};
   return {object:object_id===V3&&mode==='self-consistent-crop'?crop:object,frame:object_id===V3&&mode==='different-frame'?{...frame,frame_object_id:id(8)}:frame,png};
  });
  assert.equal(restored.snapshot().windows[0].object_id,R);assert.equal(restored.snapshot().windows[0].latest_observation_view_object_id,undefined);assert.equal(restored.snapshot().windows[0].source_reference.input_view_object_id,V1);
 }
});
test('an explicitly verified display or calibration successor keeps all ROIs editable and propagates later edits',()=>{
 for(const decoration of [{display:{gamma:2}},{xy_calibration:{calibration_id:id(30),revision:2,status:'active',xy_scale:{x:.02,y:.02,unit:'nm'}}}]){
  const store=completed(),display={...latest(),object_id:id(5),...decoration};store.continueObservations(latest(),display,frame);store.admit(display,frame);
  assert.ok(store.snapshot().windows.every(w=>w.latest_observation_view_object_id===id(5)));
  const revised={...display,object_id:id(6),annotations:[...display.annotations,roi(4)]};store.rememberObservations(revised,frame);store.admit(revised,frame);assert.ok(store.snapshot().windows.every(w=>w.latest_observation_view_object_id===id(6)));
  const historical=first();store.admit(historical,frame);store.continueObservations(historical,{...historical,object_id:id(7)},frame);assert.ok(store.snapshot().windows.every(w=>w.latest_observation_view_object_id===id(6)),'rendering an old branch cannot replace the working ROI revision');
 }
});
test('navigation, camera, display-only admission and an unrelated frame cannot advance latest observations',()=>{
 const store=completed();store.admit(first(),frame);const before=store.snapshot().windows.find(w=>w.role==='source').latest_observation_view_object_id;
 store.rememberObservations({...latest(),object_id:id(7)},{...frame,frame_object_id:id(8)});assert.equal(store.snapshot().windows.find(w=>w.role==='source').latest_observation_view_object_id,before);
 store.admit({...first(),object_id:id(6),display:{gamma:2}},frame);assert.equal(store.snapshot().windows.find(w=>w.role==='source').latest_observation_view_object_id,V3);
});
