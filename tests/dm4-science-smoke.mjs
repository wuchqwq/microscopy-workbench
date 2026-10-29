// Real DM4 -> stdio -> independent scientific worker -> arrays/panel HTTP.
// Public synthetic input only; real specimen evidence stays local and separate.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
import {readImageMeasurements} from '../lib/image_measurement_records.mjs';
import {inspectorDetails} from '../ui/image-panel/measurement-workspace.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),directory=mkdtempSync(path.join(tmpdir(),'dm4-stdio-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
function py(code,args=[]){const result=spawnSync(candidate,['-B','-c',code,...args],{encoding:'utf8'});if(result.error)throw result.error;assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
const python=py('import sys;print(sys.executable)'),workspace=path.join(directory,'workspace');
const source=path.join(directory,'fixture','signed-uint32.dm4'),output=path.join(directory,'export'),hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
let client,panel;
try{
 py("import sys;sys.path.insert(0,sys.argv[1]);from dm4_fixture import create_fixtures;create_fixtures(sys.argv[2])",[path.join(root,'tests','fixtures'),path.join(directory,'fixture')]);
 const original=hash(source);client=new StdioImageClient({workspace,python});await client.rpc('initialize');let n=0;
 const call=async(name,args)=>(await client.tool(name,{...args,request_id:'dm4-smoke-'+(++n)}));
 const opened=(await call('image_open',{source_path:source})).data;
 assert.equal(opened.kind,'dm_source');assert.equal(opened.dm_catalog.datasets.length,1);
 const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:0})).data;
 assert.equal(frame.dtype,'uint32');assert.deepEqual(frame.shape_yx,[5,7]);assert.equal(frame.xy_calibration.source,'dm_file_metadata');
 assert.deepEqual(frame.xy_calibration.physical_zero_xy,[-.025,-.075]);
 const view=await call('image_preview',{object_id:frame.object_id,upscale:true,max_size:128});assert.ok(view.png);assert.equal(view.data.dtype,'uint32');
 const fft=(await call('image_fft',{object_id:frame.object_id,rect:[0,0,7,5],window:'none',subtract_mean:false})).data;
 const measured=(await call('image_measure',{object_id:fft.object_id,coordinate_space:'frequency_cycles_per_pixel',points:[[0,0],[1/7,0]]})).data;
 assert.ok(Math.abs(measured.d_spacing-.14)<1e-14);assert.equal(measured.d_spacing_unit,'nm');
 const records=readImageMeasurements({workspace,objectId:fft.object_id});assert.equal(records.current.source_kind,'dm4');assert.equal(records.entries.length,1);assert.match(inspectorDetails(records.current).find(row=>row[0]==='来源')[1],/DM4.*外部/);
 await call('image_export',{object_id:frame.object_id,output_dir:output});
 py("import numpy as np,sys;known=np.load(sys.argv[1],allow_pickle=False);v=np.load(sys.argv[2],allow_pickle=False);assert v.dtype==np.uint32;assert v.shape==(5,7);assert np.array_equal(v,known);assert int(v[1,2])==4294967295",[path.join(directory,'fixture','known.npy'),path.join(output,'data.npy')]);
 const count=readdirSync(path.join(workspace,'objects')).length;await client.close();client=new StdioImageClient({workspace,python});
 const recovered=(await client.tool('image_result',{request_id:fft.request_id})).data;assert.equal(recovered.object_id,fft.object_id);assert.equal(readdirSync(path.join(workspace,'objects')).length,count);
 panel=await createImagePanel({workspace,python,object_id:view.data.object_id});assert.equal(panel.state().source_identity.kind,'dm4');assert.equal(panel.state().frame_identity.dataset_index,0);
 const response=await fetch(panel.url);assert.equal(response.status,200);assert.match(await response.text(),/Microscopy Workbench/);
 assert.equal(hash(source),original);
 console.log('PASS: synthetic DM4 -> explicit science dataset -> exact uint32/max -> stored signed XY/origin -> preview/FFT/0.14nm -> NPY -> original-ID reconnect -> DM4 panel HTTP; source unchanged.');
}finally{await panel?.close();await client?.close();rmSync(directory,{recursive:true,force:true});}
