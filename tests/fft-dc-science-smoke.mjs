// Actual stdio/Python saved chain for the retained analytic DC counterexample.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from '../tools/image_panel.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),selected=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(selected&&(!path.isAbsolute(selected)||existsSync(selected)))throw Error('Use a new absolute output directory');
const out=selected?(mkdirSync(selected,{recursive:true}),selected):mkdtempSync(path.join(tmpdir(),'fft-dc-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const generated=spawnSync(python,['-B','-c',String.raw`
import sys,numpy as np,tifffile
from pathlib import Path
p=Path(sys.argv[1]);n=63;y,x=np.indices((n,2*n))
a=np.full((n,2*n),100,dtype=np.float32);a[20,25]=a[20,88]=101
tifffile.imwrite(p/'delta.tiff',a,photometric='minisblack')
a=(100+.001*np.cos(2*np.pi*6*x/n)+.001*np.cos(2*np.pi*8*y/n)).astype(np.float32)
tifffile.imwrite(p/'periodic.tiff',a,photometric='minisblack')
print(sys.executable)
`,out],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
const absolutePython=generated.stdout.trim(),workspaceRoot=path.join(out,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(out,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,workspace_root:workspaceRoot,structures:false}));
const previous=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const make=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const clients=[make()],calls=[],targets=[];let serial=0;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const call=async(name,args={},client=clients[0])=>{
 const request=['image_info','image_result'].includes(name)?args:{...args,request_id:`dc-stdio-${++serial}`};
 try{const value=await client.tool(name,request);calls.push({name,request,data:value.data});return value.data;}
 catch(error){calls.push({name,request,error:String(error)});throw error;}
 finally{writeFileSync(path.join(out,'calls.json'),JSON.stringify(calls,null,2));}
};
try{
 await clients[0].rpc('initialize');
 for(const name of ['delta','periodic']){
  const source=path.join(out,name+'.tiff'),sourceHash=hash(source);
  const opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});
  for(const subtract of [false,true]){
   const atlas=await call('image_spatial_atlas',{object_id:frame.object_id,rects:[[0,0,63,63],[63,0,126,63]],window:'none',subtract_mean:subtract,max_peaks:16,max_size:256,
    peak_options:{threshold_rel:.05,min_separation_bins:name==='delta'?16:3,refinement:'none'}});
   for(const row of atlas.regions){
    const peaks=await call('image_info',{object_id:row.peaks_object_id});assert.equal(peaks.peak_detection.version,3);
    assert.equal(hash(path.join(workspace,'objects',row.fft_object_id,'data.npy')),hash(path.join(workspace,'objects',row.peaks_object_id,'data.npy')));
    if(name==='delta')assert.deepEqual(peaks.peak_table,[]);
   }
   const field=await call('image_feature_field',{object_id:atlas.object_id,coordinate_domain:'pixel',display_feature:'family_count',max_size:256});
   assert.ok(field.samples.every(s=>s.status===(name==='delta'?'insufficient_evidence':'valid')));
   targets.push(field);
  }
  assert.equal(hash(source),sourceHash);
 }
 const fresh=make();clients.push(fresh);await fresh.rpc('initialize');
 for(const field of targets)assert.deepEqual(await call('image_result',{request_id:field.request_id},fresh),field);
 writeFileSync(path.join(out,'report.json'),JSON.stringify({result:'PASS',calls:calls.length,targets:targets.map(x=>x.object_id),scope:'formal stdio/Python; numerical synthetic evidence only',not_tested:['browser gestures','real material accuracy']},null,2));
 console.log('PASS: DC counterexample and weak-periodic controls through formal stdio, saved atlas/feature, fresh-client original-request recovery.');
}finally{for(const c of clients)await c.close();if(previous===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previous;}
