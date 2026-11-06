// Actual compiled MCP/Python composition and restart reads of retained synthetic
// evidence. No tracing, automatic discovery, real specimen or GUI qualification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const root=process.env.HRTEM_TASK_B_CASES;
assert.ok(root&&path.isAbsolute(root),'HRTEM_TASK_B_CASES must be the retained four-case directory');
const repo=fileURLToPath(new URL('../',import.meta.url));
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const snapshot=(directory:string):Record<string,string>=>Object.fromEntries(readdirSync(directory,{withFileTypes:true}).flatMap(item=>{
 const file=path.join(directory,item.name);return item.isDirectory()?Object.entries(snapshot(file)):[[file,hash(file)]];
}));
const results:Row[]=[];
for(const name of ['positive','negative','low_amplitude','contrast_vortex']){
 const directory=path.join(root,name),workspace=path.join(directory,'workspace');
 const receipt=row(JSON.parse(readFileSync(path.join(directory,'receipt.json'),'utf8')));
 const original=row(JSON.parse(readFileSync(path.join(workspace,'objects',text(receipt.review),'object.json'),'utf8')));
 const protectedFiles=snapshot(directory);
 const marker=path.join(root,`mcp-${name}-dispatch.json`);
 assert.ok(!existsSync(marker),'Query the original request after an uncertain write; this smoke never replays');
 const args={...row(receipt.review_args),request_id:'task-b-mcp-review'};
 writeFileSync(marker,JSON.stringify({workspace,tool:'image_discovery_review',arguments:args})+'\n');
 // Portable server consumes this client's explicit workspace/Python environment;
 // the plugin settings entry instead owns a separate workspace_root/images path.
 const createClient=()=>new StdioImageClient({workspace,python:process.env.MICROSCOPY_PYTHON??'python',serverPath:path.join(repo,'server.mjs')});
 const first=createClient();let saved:Row;
 try{
  await first.rpc('initialize');
  const reply=await first.tool('image_discovery_review',args);
  saved=row(reply.data);
  assert.deepEqual(saved.candidate_result,original.candidate_result);
  assert.ok(reply.png,'Default review returns real PNG content');
  const png=Buffer.from(text(reply.png),'base64');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  writeFileSync(path.join(root,`mcp-${name}-review.png`),png);
 }finally{first.close();}
 const second=createClient();
 try{
  await second.rpc('initialize');
  const info=row((await second.tool('image_info',{object_id:saved.object_id,response_detail:'compact'})).data);
  const recovered=row((await second.tool('image_result',{request_id:saved.request_id,response_detail:'compact'})).data);
  assert.deepEqual(info,recovered);
  assert.deepEqual(info.candidate_result,original.candidate_result);
  assert.equal(info.physical_conclusion,null);
  assert.equal(row(info.candidate_result).material_dislocation_confirmed,false);
  for(const [file,digest] of Object.entries(protectedFiles))assert.equal(hash(file),digest,`Prior evidence changed: ${file}`);
  results.push({case:name,review:saved.object_id,request_id:saved.request_id,read_after_restart:true,prior_files_unchanged:true,
   candidate_result:info.candidate_result});
 }finally{second.close();}
}
writeFileSync(path.join(root,'mcp-review-receipts.json'),JSON.stringify({status:'PASS',results,not_tested:['human GUI usability','real material defect identification']},null,2)+'\n');
console.log('PASS: 4 actual MCP writes, PNG delivery, client restart, exact compact info/result and unchanged prior evidence.');
