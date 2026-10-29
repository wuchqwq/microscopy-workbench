// Actual mature reader -> stdio MCP -> worker -> raw complex arrays and GUI ports.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
import {startResearcherInspector} from '../tools/researcher_inspector.mjs';
import {makeFigureRecipe,figureDisplayParameters} from '../ui/image-panel/figure-export.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),directory=mkdtempSync(path.join(tmpdir(),'complex-stdio-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
function py(code,args=[]){const result=spawnSync(candidate,['-B','-c',code,...args],{encoding:'utf8'});if(result.error)throw result.error;assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
const python=py('import sys;print(sys.executable)'),workspace=path.join(directory,'workspace'),source=path.join(directory,'complex.dm4');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');let client,panel,inspector;
try{
 py("import numpy as np,sys;sys.path.insert(0,sys.argv[1]);from dm4_fixture import write_dm4;a=np.array([[3+4j,-5+12j,-2j],[8-15j,-7-24j,-1+.5j]],np.complex64);write_dm4(sys.argv[2],[{'data':a,'scales':(.2,-.3),'origins':(1.25,-2.5),'units':('nm','nm')}])",[path.join(root,'tests','fixtures'),source]);
 const original=hash(source);client=new StdioImageClient({workspace,python});await client.rpc('initialize');let n=0;
 const call=async(name,args)=>(await client.tool(name,{...args,request_id:'complex-smoke-'+(++n)}));
 const opened=(await call('image_open',{source_path:source})).data;
 const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:0})).data;
 assert.equal(frame.dtype,'complex64');assert.equal(frame.kind,'frame');assert.equal(frame.complex_semantics.not_assumed_to_be_fft,true);
 await assert.rejects(call('image_preview',{object_id:frame.object_id}),/explicit.*component/);
 const view=(await call('image_preview',{object_id:frame.object_id,component:'amplitude',max_size:128,upscale:true})).data;
 assert.equal(view.display.component,'amplitude');assert.equal(view.dtype,'complex64');assert.equal(view.panels[0].domain,'spatial_pixels');
 const probe=(await client.tool('image_probe',{object_id:view.object_id,points:[[1,0],[0,1]],component:'imag'})).data;
 assert.deepEqual(probe.samples.map(v=>v.value),[12,-15]);assert.equal(probe.value_dtype,'float32');assert.match(probe.intensity_semantics,/complex array imag/);
 const profile=(await call('image_profile',{object_id:view.object_id,points:[[0,0],[2,1]],sample_count:4,component:'imag'})).data;
 assert.deepEqual(profile.samples.value,[4,12,-24,.5]);assert.equal(profile.dtype,'complex64');assert.equal(profile.value_dtype,'float32');
 await assert.rejects(call('image_fft',{object_id:view.object_id}),/imaginary part/);
 await assert.rejects(call('image_compare',{object_ids:[frame.object_id,view.object_id]}),/no implicit real cast/);
 const output=path.join(directory,'export');await call('image_export',{object_id:view.object_id,output_dir:output});
 py("import numpy as np,sys;v=np.load(sys.argv[1],allow_pickle=False);assert v.dtype==np.complex64;assert np.array_equal(v,np.array([[3+4j,-5+12j,-2j],[8-15j,-7-24j,-1+.5j]],np.complex64))",[path.join(output,'data.npy')]);
 const count=readdirSync(path.join(workspace,'objects')).length;await client.close();client=new StdioImageClient({workspace,python});
 const recovered=(await client.tool('image_result',{request_id:view.request_id})).data;assert.equal(recovered.object_id,view.object_id);assert.equal(readdirSync(path.join(workspace,'objects')).length,count);
 panel=await createImagePanel({workspace,python,object_id:view.object_id});const origin=panel.url.split('/#')[0],state=panel.state();
 const response=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,action:'preview',params:{component:'imag',display_range:null}})});
 assert.equal(response.status,200);const shown=await response.json();assert.equal(shown.effective_display.component,'imag');assert.equal(shown.object.dtype,'complex64');
 const recipe=makeFigureRecipe(shown,{preset:'real-space',mode:'figure'});assert.equal(figureDisplayParameters(recipe.display_recipe,recipe.source.panels).component,'imag');
 await panel.close();panel=null;
 const inspectorWorkspace=path.join(directory,'inspector');inspector=await startResearcherInspector({source,workspace:inspectorWorkspace,python,component:'real'});
 const selected=inspector.panel.state().object.object_id;assert.equal(inspector.panel.state().effective_display.component,'real');await inspector.close();inspector=null;
 inspector=await startResearcherInspector({workspace:inspectorWorkspace,python});assert.equal(inspector.resumed,true);assert.equal(inspector.panel.state().object.object_id,selected);assert.equal(inspector.panel.state().effective_display.component,'real');
 assert.equal(hash(source),original);console.log('PASS: ordinary complex DM4 -> exact complex64 -> explicit components/probe/profile -> guarded FFT/compare -> exact NPY -> original-ID reconnect -> Panel component revision -> Figure recipe -> CLI component/reopen; source unchanged.');
}finally{await inspector?.close();await panel?.close();await client?.close();rmSync(directory,{recursive:true,force:true});}
