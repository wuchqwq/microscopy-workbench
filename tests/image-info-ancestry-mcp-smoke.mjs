// One bounded real MCP read-contract check; no FFT/GPA/simulation calculations.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {StdioImageClient} from '../tools/image_panel.mjs';
const directory=mkdtempSync(path.join(tmpdir(),'public-info-ancestry-')),workspace=path.join(directory,'workspace'),source=path.join(directory,'public-source.tiff');
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3'),sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const generated=spawnSync(python,['-B','-c',"import numpy as np,tifffile,sys;tifffile.imwrite(sys.argv[1],np.arange(16*24,dtype=np.uint16).reshape(16,24),photometric='minisblack',metadata=None)",source],{encoding:'utf8',windowsHide:true});assert.equal(generated.status,0,generated.stderr);
let client;
try{
 const sourceHash=sha(source);client=new StdioImageClient({workspace,python});await client.rpc('initialize');const catalog=(await client.rpc('tools/list')).result.tools,tool=catalog.find(value=>value.name==='image_info');assert.equal(tool.inputSchema.properties.include_frame_ancestry.type,'boolean');
 const opened=(await client.tool('image_open',{source_path:source,request_id:'ancestry-open'})).data,frame=(await client.tool('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'ancestry-frame'})).data;
 let current=(await client.tool('image_preview',{object_id:frame.object_id,max_size:128,request_id:'ancestry-view'})).data;
 for(let step=0;step<11;step++)current=(await client.tool('image_annotate',{object_id:current.object_id,annotations:[],request_id:'ancestry-annotation-'+step})).data;
 const requests=()=>readdirSync(path.join(workspace,'requests')).sort(),beforeRequests=requests(),arrays=[];for(const id of readdirSync(path.join(workspace,'objects')))for(const file of readdirSync(path.join(workspace,'objects',id)))if(file.endsWith('.npy'))arrays.push({file:path.join(workspace,'objects',id,file),sha256:sha(path.join(workspace,'objects',id,file))});
 const ordinary=await client.tool('image_info',{object_id:current.object_id}),qualified=await client.tool('image_info',{object_id:current.object_id,include_frame_ancestry:true}),{frame_ancestry,...unchanged}=qualified.data;
 assert.deepEqual(unchanged,ordinary.data);assert.equal(qualified.png,ordinary.png);assert.equal(frame_ancestry.schema_version,1);assert.equal(frame_ancestry.records.length,13);assert.equal(frame_ancestry.records[0].object_id,current.object_id);assert.equal(frame_ancestry.records.at(-1).object_id,frame.object_id);assert.equal(frame_ancestry.records.at(-1).source_object_id,opened.object_id);
 const ancestor=frame_ancestry.records[1],manifest=JSON.parse(readFileSync(path.join(workspace,'objects',ancestor.object_id,'object.json'),'utf8')),image=manifest.image_path,bytes=readFileSync(image);writeFileSync(image,Buffer.from('controlled corrupt ancestor PNG'));
 try{await assert.rejects(client.tool('image_info',{object_id:current.object_id,include_frame_ancestry:true}),/Immutable object file changed/);}finally{writeFileSync(image,bytes);}
 const recovered=(await client.tool('image_info',{object_id:current.object_id,include_frame_ancestry:true})).data;assert.equal(recovered.frame_ancestry.records.length,13);
 assert.deepEqual(requests(),beforeRequests);assert.equal(sha(source),sourceHash);assert.ok(arrays.every(value=>sha(value.file)===value.sha256));
 console.log(JSON.stringify({scope:'real MCP optional image_info read contract only; public synthetic input',qualified_records:13,ordinary_reply_unchanged:true,ancestor_payload_refusal:true,source_sha256_unchanged:true,arrays_unchanged:arrays.length,scientific_read_requests_created:0,fft_calculations:0}));
}finally{if(client)await client.close();rmSync(directory,{recursive:true,force:true});}
