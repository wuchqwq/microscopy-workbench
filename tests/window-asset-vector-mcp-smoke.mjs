// One bounded real provider/HTTP seam check. No FFT or numerical algorithm suite.
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';

const python=process.env.MICROSCOPY_PYTHON;if(!python)throw Error('Explicit MICROSCOPY_PYTHON required');
const temporary=fs.realpathSync.native(tmpdir()),root=fs.mkdtempSync(path.join(temporary,'mwb-vector-asset-')),workspace=path.join(root,'workspace'),source=path.join(root,'public.tiff');
fs.mkdirSync(workspace);const make=spawnSync(python,['-c','import numpy as np,tifffile,sys; tifffile.imwrite(sys.argv[1],np.arange(384,dtype=np.uint16).reshape(16,24))',source],{encoding:'utf8',windowsHide:true});assert.equal(make.status,0,make.stderr);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),arrays=()=>Object.fromEntries(fs.readdirSync(path.join(workspace,'objects')).flatMap(id=>{const dir=path.join(workspace,'objects',id);return fs.statSync(dir).isDirectory()?fs.readdirSync(dir).filter(f=>f.endsWith('.npy')).map(f=>[id+'/'+f,hash(path.join(dir,f))]):[];})),requests=()=>fs.readdirSync(path.join(workspace,'requests')).sort();
const client=new StdioImageClient({workspace,python});let panel,passed=false;
try{
 await client.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'saved-vector-asset-boundary',version:'1'}});await client.rpc('tools/list');
 const opened=await client.tool('image_open',{source_path:source,request_id:'vector-source'}),frame=await client.tool('image_frame',{object_id:opened.data.object_id,frame_index:0,request_id:'vector-frame'}),view=await client.tool('image_preview',{object_id:frame.data.object_id,request_id:'vector-view'});
 const marks=[{annotation_id:'roi-a',kind:'rectangle',text:'ROI A',color:'cyan',status:'hypothesized',coordinate_space:'source_pixels',source_object_id:frame.data.object_id,coordinates:[1.25,1.5,15.25,11.5]},{annotation_id:'roi-b',kind:'rectangle',text:'ROI B',color:'cyan',status:'hypothesized',coordinate_space:'source_pixels',source_object_id:frame.data.object_id,coordinates:[8.5,4,22.5,15]}];
 const a=await client.tool('image_annotate',{object_id:view.data.object_id,annotations:marks,request_id:'vector-A'}),b=await client.tool('image_annotate',{object_id:a.data.object_id,updates:[{annotation_id:'roi-a',coordinates:[2.25,2.5,16.25,12.5]}],request_id:'vector-B'});
 const before=arrays(),beforeRequests=requests(),sourceHash=hash(source);panel=await createImagePanel({workspace,python,object_id:a.data.object_id,client});
 const state=panel.state(),windows=state.window_collection,entry=windows.windows.find(w=>w.object_id===a.data.object_id),url=new URL(panel.url);url.hash='';url.pathname='/api/window-asset';url.search=new URLSearchParams({window_id:entry.window_id,revision:String(windows.revision)}).toString();
 const response=await fetch(url,{headers:{'X-Panel-Token':panel.token}}),asset=await response.json();assert.equal(response.status,200,asset.error);assert.equal(asset.object_id,a.data.object_id);assert.deepEqual(asset.object.annotations,a.data.annotations);assert.notDeepEqual(asset.object.annotations,b.data.annotations);
 const clean=asset.clean_render;assert.equal(clean.object_id,a.data.object_id);assert.equal(clean.render_base_object_id,view.data.object_id);assert.equal(clean.panel_mapping_fingerprint,asset.panel_mapping_fingerprint);const bytes=Buffer.from(clean.png_base64,'base64'),baseFile=view.data.files_sha256?.['unannotated.png']?'unannotated.png':'preview.png';assert.equal(createHash('sha256').update(bytes).digest('hex'),clean.png_sha256);assert.deepEqual(bytes,fs.readFileSync(path.join(workspace,'objects',view.data.object_id,baseFile)));assert.notEqual(clean.png_base64,asset.png_base64);
 assert.deepEqual(arrays(),before);assert.deepEqual(requests(),beforeRequests);assert.equal(hash(source),sourceHash);await panel.close({abnormal:false});panel=null;passed=true;console.log(JSON.stringify({scope:'actual MCP plus saved-asset HTTP only',historical_A_not_latest_B:true,clean_png_qualified:true,arrays_unchanged:Object.keys(before).length,read_created_requests:0,FFT_calculations:0}));
}finally{
 if(panel)await panel.close();else await client.close();
 if(passed){const resolved=fs.realpathSync.native(root);assert.equal(path.dirname(resolved),temporary);assert.match(path.basename(resolved),/^mwb-vector-asset-/);fs.rmSync(resolved,{recursive:true});}else console.error('Original public failure fixture retained: '+root);
}
