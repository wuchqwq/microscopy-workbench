// Synthetic actual stdio/worker/HTTP, not browser or GMS qualification.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
import {startResearcherInspector} from '../tools/researcher_inspector.mjs';
import {readImageMeasurements} from '../lib/image_measurement_records.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),directory=mkdtempSync(path.join(tmpdir(),'dm-plane-stdio-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
function py(code,args=[]){const result=spawnSync(candidate,['-B','-c',code,...args],{encoding:'utf8'});if(result.error)throw result.error;assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
const python=py('import sys;print(sys.executable)'),workspace=path.join(directory,'workspace'),fixture=path.join(directory,'fixture');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');let client,panel,inspector;
try{
 py('import sys;sys.path.insert(0,sys.argv[1]);from dm4_fixture import create_plane_fixtures;create_plane_fixtures(sys.argv[2])',[path.join(root,'tests','fixtures'),fixture]);
 const source=path.join(fixture,'volume.dm3'),original=hash(source);client=new StdioImageClient({workspace,python});await client.rpc('initialize');let n=0;
 const call=async(name,args)=>(await client.tool(name,{...args,request_id:'dm-plane-smoke-'+(++n)}));
 const opened=(await call('image_open',{source_path:source})).data;assert.equal(opened.source_file_format,'dm3');
 await assert.rejects(call('image_frame',{object_id:opened.object_id,frame_index:0}),/plane_axes/);
 const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:0,plane_axes:[2,0],plane_indices:[null,1,null]})).data;
 assert.deepEqual(frame.shape_yx,[4,2]);assert.equal(frame.dtype,'uint16');assert.deepEqual(Object.fromEntries(['x','y','unit'].map(k=>[k,frame.xy_calibration.xy_scale[k]])),{x:.4,y:.02,unit:'nm'});assert.equal(frame.xy_calibration.xy_scale.uncertainty_x,null);assert.equal(frame.xy_calibration.xy_scale.uncertainty_y,null);
 const view=await call('image_preview',{object_id:frame.object_id,upscale:true,max_size:128});assert.ok(view.png);
 const profile=(await call('image_profile',{object_id:frame.object_id,points:[[0,0],[1,3]],sample_count:4,line_width:1,interpolation:'nearest'})).data;
 assert.deepEqual(profile.samples.value,[104,105,118,119]);assert.equal(profile.physical_distance_unit,'nm');
 const fft=(await call('image_fft',{object_id:frame.object_id,window:'none',subtract_mean:false})).data;
 const measured=(await call('image_measure',{object_id:fft.object_id,points:[[0,0],[-.5,0]],coordinate_space:'frequency_cycles_per_pixel'})).data;
 assert.ok(Math.abs(measured.d_spacing-.8)<1e-14);assert.equal(measured.d_spacing_unit,'nm');
 // The 2-column FFT's mathematical positive boundary is exclusive. The
 // smallest actual valid nonzero bin is -0.5, which has the same period.
 const records=readImageMeasurements({workspace,objectId:frame.object_id});assert.equal(records.current.source_kind,'dm3');
 const output=path.join(directory,'export');await call('image_export',{object_id:frame.object_id,output_dir:output});
 py("import sys,numpy as np,cmath;v=np.load(sys.argv[1],allow_pickle=False);e=np.array([[104,116],[105,117],[106,118],[107,119]],dtype=np.uint16);assert v.dtype==np.uint16 and np.array_equal(v,e);f=np.load(sys.argv[2],allow_pickle=False);expected=np.array([[sum(int(e[y,x])*cmath.exp(-2j*cmath.pi*(u*y/4+w*x/2)) for y in range(4) for x in range(2)) for w in range(2)] for u in range(4)]);expected=np.roll(np.roll(expected,2,axis=0),1,axis=1);assert np.max(np.abs(f-expected))<2e-12",[path.join(output,'data.npy'),path.join(workspace,'objects',fft.object_id,'data.npy')]);
 const count=readdirSync(path.join(workspace,'objects')).length;await client.close();client=new StdioImageClient({workspace,python});
 const recovered=(await client.tool('image_result',{request_id:fft.request_id})).data;assert.equal(recovered.object_id,fft.object_id);assert.equal(readdirSync(path.join(workspace,'objects')).length,count);
 panel=await createImagePanel({workspace,python,object_id:view.data.object_id});assert.equal(panel.state().source_identity.kind,'dm3');assert.deepEqual(panel.state().frame_identity.plane_selection.plane_axes_yx,[2,0]);
 const origin=panel.url.split('/#')[0],state=panel.state();const response=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,action:'frame',params:{frame_index:0}})});
 const changed=await response.json();assert.equal(response.status,200,JSON.stringify(changed));assert.deepEqual(panel.state().frame_identity.plane_selection.indices_by_source_axis,[null,1,null]);assert.equal(panel.state().source_identity.kind,'dm3');
 await panel.close();panel=null;
 // Model-free launcher binds the same explicit source plane, then resumes
 // its saved object without adding defaults to old two-dimensional requests.
 const inspectorWorkspace=path.join(directory,'inspector');
 inspector=await startResearcherInspector({source,workspace:inspectorWorkspace,python,plane_axes:[2,0],plane_indices:[null,1,null]});
 const selected=inspector.panel.state().object.object_id;await inspector.close();inspector=null;
 inspector=await startResearcherInspector({workspace:inspectorWorkspace,python});assert.equal(inspector.resumed,true);assert.equal(inspector.panel.state().object.object_id,selected);
 assert.equal(hash(source),original);
 console.log('PASS: actual DM3 -> explicit nD/transposed scientific plane -> sourced XY -> preview/profile/FFT/0.8nm geometry -> exact NPY/direct DFT -> original-ID reconnect -> Panel frame reselection -> model-free launcher/reopen; source unchanged.');
}finally{await inspector?.close();await panel?.close();await client?.close();rmSync(directory,{recursive:true,force:true});}
