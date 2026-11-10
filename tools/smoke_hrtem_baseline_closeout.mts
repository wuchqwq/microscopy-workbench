// Real MCP export and fresh-client reopen of bounded A/B acceptance fixtures.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const root=process.env.HRTEM_CLOSEOUT_OUTPUT;
assert.ok(root&&path.isAbsolute(root),'HRTEM_CLOSEOUT_OUTPUT must point to the retained acceptance directory');
const repo=fileURLToPath(new URL('../',import.meta.url));
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const snapshot=(directory:string):Record<string,string>=>Object.fromEntries(readdirSync(directory,{withFileTypes:true}).flatMap(item=>{
 const file=path.join(directory,item.name);return item.isDirectory()?Object.entries(snapshot(file)):[[file,sha(file)]];
}));
const inputs=row(JSON.parse(readFileSync(path.join(root,'closeout-inputs.json'),'utf8'))),receipts:Row[]=[];
for(const [name,value] of Object.entries(inputs)){
 const input=row(value),workspace=text(input.workspace),output=path.join(root,name,'export-mcp');
 const original=row(JSON.parse(readFileSync(path.join(workspace,'objects',text(input.object_id),'object.json'),'utf8')));
 const prior=snapshot(workspace),marker=path.join(root,`mcp-${name}-dispatch.json`);
 assert.ok(!existsSync(marker),'Read the original request outcome; never automatically replay this smoke');
 const args={object_id:input.object_id,output_dir:output,request_id:'hrtem-closeout-export'};
 writeFileSync(marker,JSON.stringify({workspace,tool:'image_export',arguments:args})+'\n');
 const client=()=>new StdioImageClient({workspace,python:process.env.MICROSCOPY_PYTHON??'python',serverPath:path.join(repo,'server.mjs')});
 const first=client();let exported:Row;
 try{
  await first.rpc('initialize');
  const info=row((await first.tool('image_info',{object_id:input.object_id,response_detail:'compact'})).data);
  assert.equal(info.object_id,input.object_id);
  const reply=await first.tool('image_export',args);exported=row(reply.data);
  for(const [file,digest] of Object.entries(row(exported.exported_files_sha256)))assert.equal(sha(path.join(output,file)),digest);
  for(const file of [text(input.readable_file),text(input.report_file),'preview.png'])assert.deepEqual(readFileSync(path.join(output,file)),readFileSync(path.join(workspace,'objects',text(input.object_id),file)));
  const manifest=row(JSON.parse(readFileSync(path.join(output,'manifest.json'),'utf8')));
  assert.equal(row(manifest.scientific_object).object_id,input.object_id);
  assert.ok(!existsSync(path.join(output,'amplitude.npy')),'Report export does not export parent GPA data');
  const recovered=row((await first.tool('image_result',{request_id:input.request_id,response_detail:'compact'})).data);
  assert.deepEqual(recovered,info);
 }finally{first.close();}
 const second=client();
 try{
  await second.rpc('initialize');
  const reopened=row((await second.tool('image_info',{object_id:input.object_id,response_detail:'compact'})).data);
  if(name.startsWith('a_'))assert.deepEqual(reopened.decision,original.decision);
  else assert.deepEqual(reopened.candidate_result,original.candidate_result);
  const restored=row((await second.tool('image_result',{request_id:exported.request_id,response_detail:'compact'})).data);
  assert.equal(restored.object_id,exported.object_id);assert.deepEqual(restored.exported_files_sha256,exported.exported_files_sha256);
  for(const [file,digest] of Object.entries(prior))assert.equal(sha(file),digest,'Prior saved file changed: '+file);
  receipts.push({case:name,object_id:input.object_id,export_id:exported.object_id,output_dir:output,
    exact_report_and_readable:true,exact_saved_png:true,export_sha256:exported.exported_files_sha256,
    original_files_unchanged:true,reopen_after_client_restart:true});
 }finally{second.close();}
}
writeFileSync(path.join(root,'mcp-closeout-receipts.json'),JSON.stringify({status:'PASS',receipts,
 qualification:'Synthetic provider/MCP/serialization/exports only; no real specimen or human GUI qualification'},null,2)+'\n');
console.log('PASS: 6 A/B real MCP exports, exact readable/JSON/PNG, provenance hashes, unchanged sources and fresh-client reopens.');
