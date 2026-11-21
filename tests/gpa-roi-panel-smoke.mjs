// Real Panel controller, packaged science workers, existing public affine TIFF.
import assert from 'node:assert/strict';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {readAnalysisWorkspaceResumeSnapshot} from '../lib/analysis_workspace.mjs';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';

const [fixture,workspace]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
assert.ok([fixture,workspace,python].every(value=>value&&path.isAbsolute(value)));
mkdirSync(workspace);
const client=new StdioImageClient({workspace,python});
const call=async(name,args)=>(await client.tool(name,args)).data;
let panel;

try {
 const image=await call('image_open',{source_path:fixture,request_id:'public-affine'});
 const frame=await call('image_frame',{object_id:image.object_id,frame_index:0,request_id:'public-frame'});
 const view=await call('image_preview',{object_id:frame.object_id,request_id:'public-view'});
 const start=options=>createImagePanel({workspace,python,object_id:view.object_id,...options});
 const post=async (action,params,status=200,route='/api/action')=>{
  const state=panel.state(),origin=new URL(panel.url).origin;
  const body=route==='/api/action'?{action,params}:{action,...params};
  const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Panel-Token':panel.token,'Content-Type':'application/json',Connection:'close'},
   body:JSON.stringify({expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,...body})});
  const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
 };
 panel=await start();
 const select=coordinates=>({kind:'rectangle',coordinates,coordinate_space:'source_pixels',source_object_id:frame.object_id,panel:panel.state().object.panels[0]});
 const read=async saved=>call('image_info',{object_id:saved});
 const a=[16,16,240,240], b=[24,24,232,232];
 // An existing exact unwindowed FFT is preferred over another computation.
 const first=(await post('live-fft',{selection:select(a),window:'none',subtract_mean:true})).live_fft;
 const sourcePrepared=await post('gpa-prepare',{selection:select(a),subtract_mean:true});
 assert.equal(sourcePrepared.object.object_id,first.object_id);
 await post('return-spatial',{});
 const hann=await post('fft',{selection:select(a),window:'hann',subtract_mean:true});
 assert.equal(hann.object.window,'hann');
 const refused=await post('gpa',{},409);assert.match(refused.error,/无窗/);
 const fromHann=await post('gpa-prepare',{subtract_mean:true});
 assert.equal(fromHann.object.object_id,first.object_id);
 await post('return-spatial',{});
 const onlyHann=await post('fft',{selection:select(b),window:'hann',subtract_mean:true});
 const prepared=await post('gpa-prepare',{subtract_mean:true});
 assert.notEqual(prepared.object.object_id,onlyHann.object.object_id);
 assert.equal(prepared.object.dtype,'complex128');
 assert.equal(prepared.object.window,'none');
 assert.deepEqual(prepared.object.source_rect_xyxy,b);
 const point=coordinates=>({kind:'point',coordinates,coordinate_space:'frequency_cycles_per_pixel',source_object_id:prepared.object.object_id,panel:prepared.object.panels[0]});
 const chosen=[[.125,.03125],[-.03125,.125]].map(point), reference_rect=[50,50,154,154];
 const gpa=await post('gpa',{reflections:chosen,reference_rect,mask_sigma:.012,
  source_domain_text:'Public analytic lattice',reference_text:'Selected central local reference; uniformity is assumed.'});
 assert.equal(gpa.object.kind,'gpa');
 assert.equal(gpa.object.material_strain_verified,false);
 const full=await read(gpa.object.object_id);
 assert.deepEqual(full.input_dependency.source_mapping.source_rect_xyxy,b);
 assert.equal(full.input_dependency.source_mapping.source_object_id,frame.object_id);
 assert.equal(full.input_dependency.fft.object_id,prepared.object.object_id);
 assert.equal(full.input_dependency.fft_processing.window,'none');
 assert.deepEqual(full.parameters.reference_rect,reference_rect);
 assert.deepEqual(full.parameters.g_vectors,chosen.map(point=>point.coordinates));
 assert.equal(full.fft_recomputed,false);
 assert.ok(full.array_manifest.valid_tensor);
 await post('save',{save_id:'gpa-savepoint',expected_working_revision:panel.state().workspace_analysis.working_revision},200,'/api/workspace');
 await panel.close();panel=null;
 panel=await start({object_id:gpa.object.object_id,analysis_restore:readAnalysisWorkspaceResumeSnapshot(workspace)});
 assert.equal(panel.state().object.object_id,gpa.object.object_id);
 const result=await call('image_result',{request_id:full.request_id});
 assert.deepEqual(result.parameters,full.parameters);
 assert.deepEqual(result.input_dependency,full.input_dependency);
 const count=readdirSync(path.join(workspace,'objects')).filter(id=>
  JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'))).kind==='fft').length;
 assert.equal(count,4);
 console.log(JSON.stringify({result:'PASS',roi:b,reference_rect,gpa:full.object_id,original_request:full.request_id,
  reused_fft:first.object_id,prepared_fft:prepared.object.object_id,total_ffts:count,native_gestures:'NOT_TESTED'}));
} finally {
 if(panel)await panel.close();
 await client.close();
}
