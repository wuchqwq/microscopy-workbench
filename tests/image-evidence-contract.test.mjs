import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import path from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {ImageWorkspace,imageTools} from '../lib/image_workspace.mjs';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';

const id='a'.repeat(32),hash='b'.repeat(64);
test('compact presentation is opt-in on six tools and evidence reads have a bounded inspect contract',async()=>{
 assert.deepEqual(imageTools.filter(tool=>tool.inputSchema.properties.response_detail).map(tool=>tool.name).sort(),['image_analysis_candidates','image_domain_map','image_field_extend','image_info','image_result','image_spatial_field']);
 const calls=[],module=createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}});
 const registry=new ToolRegistry().register(module),entry=module.tools.find(tool=>tool.definition.name==='image_evidence');
 assert.equal(entry.contract.effects.requestId,'none');assert.equal(entry.contract.effects.sourceMutation,false);assert.deepEqual(entry.contract.execution.resourceKeys,[]);
 await registry.call('image_evidence',{object_id:id,manifest_sha256:hash,section:'samples',offset:0,limit:1});
 await registry.call('image_info',{object_id:id,response_detail:'compact'});
 for(const patch of [{manifest_sha256:'bad'},{section:'../../object.json'},{limit:9},{offset:-1},{source_path:'private'}])await assert.rejects(registry.call('image_evidence',{object_id:id,manifest_sha256:hash,section:'samples',...patch}));
 await assert.rejects(registry.call('image_frame',{object_id:id,frame_index:0,request_id:'frame',response_detail:'compact'}));
 assert.equal(calls.length,2);
});

test('transport detail changes neither Coordinator identity nor original worker scientific parameters',async()=>{
 const sent=[],full={backend:'external-image-workspace',state:'completed',request_id:'saved-op',object_id:id,kind:'domain_map',samples:[{unchanged:true}]};
 const spawnProcess=()=>{
  const child=new EventEmitter();child.pid=123;child.kill=()=>true;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();let input='';
  child.stdin.on('data',chunk=>input+=chunk.toString());child.stdin.on('finish',()=>{
   const payload=JSON.parse(input);sent.push(payload);
   const result=payload.response_detail==='compact'?{...full,evidence_format:'image-evidence-summary-v1',authoritative_record:false,inline_image:false,manifest_sha256:hash}:full;
   child.stdout.write(JSON.stringify({ok:true,result}));child.emit('close',0);
  });return child;
 };
 const adapter=new ImageWorkspace({workspace:path.resolve('evidence-fixture'),spawnProcess});
 try{
  const plain=adapter.call('image_info',{object_id:id}),plainResult=await plain;
  const explicit=adapter.call('image_info',{object_id:id,response_detail:'full'});assert.deepEqual(await explicit,plainResult);
  const compact=adapter.call('image_info',{object_id:id,response_detail:'compact'}),compactResult=await compact;
  assert.equal(JSON.parse(compactResult.content[0].text).authoritative_record,false);
  assert.deepEqual(sent[0],sent[1]);assert.equal(sent[2].response_detail,'compact');
  assert.equal(plain.receipt().parametersSha256,compact.receipt().parametersSha256);
  const recovered=adapter.call('image_result',{request_id:'saved-op',response_detail:'compact'});await recovered;
  assert.equal(sent[3].query_request_id,'saved-op');assert.equal(sent[3].request_id,undefined);
  assert.deepEqual(recovered.receipt().resourceKeys,[]);
  assert.throws(()=>adapter.call('image_info',{object_id:id,response_detail:'partial'}),/response_detail/);
 }finally{adapter.close();}
});

test('full delivery inlines the original PNG while compact keeps provenance and an explicit readonly preview ref',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'evidence-png-')),objectDirectory=path.join(directory,'objects',id);
 mkdirSync(objectDirectory,{recursive:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV9sAAAAASUVORK5CYII=','base64'),imagePath=path.join(objectDirectory,'preview.png');writeFileSync(imagePath,png);
 const full={backend:'external-image-workspace',state:'completed',request_id:'saved-op',object_id:id,kind:'domain_map',image_path:imagePath};
 const spawnProcess=()=>{const child=new EventEmitter();child.pid=123;child.kill=()=>true;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();let input='';child.stdin.on('data',chunk=>input+=chunk.toString());child.stdin.on('finish',()=>{
  const payload=JSON.parse(input),result=payload.response_detail==='compact'?{...full,evidence_format:'image-evidence-summary-v1',authoritative_record:false,inline_image:false,manifest_sha256:hash,preview_ref:{tool:'image_info',arguments:{object_id:id,response_detail:'full'}}}:full;
  child.stdout.write(JSON.stringify({ok:true,result}));child.emit('close',0);
 });return child;};
 const adapter=new ImageWorkspace({workspace:directory,spawnProcess});
 try{
  const normal=await adapter.call('image_info',{object_id:id}),compact=await adapter.call('image_info',{object_id:id,response_detail:'compact'});
  assert.equal(normal.content.length,2);assert.equal(normal.content[1].type,'image');assert.equal(normal.content[1].data,png.toString('base64'));
  assert.equal(compact.content.length,1);assert.equal(compact.content[0].type,'text');
  const summary=JSON.parse(compact.content[0].text);assert.equal(summary.image_path,imagePath);assert.equal(summary.inline_image,false);
  assert.deepEqual(summary.preview_ref,{tool:'image_info',arguments:{object_id:id,response_detail:'full'}});
  const requested=await adapter.call(summary.preview_ref.tool,summary.preview_ref.arguments);assert.deepEqual(requested,normal);
  assert.deepEqual(readFileSync(imagePath),png);
 }finally{adapter.close();rmSync(directory,{recursive:true,force:true});}
});

test('a compact budget refusal retains original completion as a bounded MCP error and rejects foreign receipts',async()=>{
 const receipt={ok:false,state:'projection_failed',backend:'external-image-workspace',request_id:'saved-op',object_id:id,
  authoritative_record_state:'completed',automatic_retry:false,projection_error:{code:'EVIDENCE_BUDGET_EXCEEDED',message:'Query the original in full; do not resubmit'},
  original_result:{tool:'image_result',arguments:{request_id:'saved-op'}},full_record:{tool:'image_info',arguments:{object_id:id}}};
 let current=receipt;
 const spawnProcess=()=>{const child=new EventEmitter();child.pid=123;child.kill=()=>true;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('finish',()=>{child.stdout.write(JSON.stringify(current));child.emit('close',1);});return child;};
 const adapter=new ImageWorkspace({workspace:path.resolve('evidence-fixture'),spawnProcess});
 try{
  const reply=await adapter.call('image_result',{request_id:'saved-op',response_detail:'compact'});
  assert.equal(reply.isError,true);assert.equal(reply.content.length,1);assert.deepEqual(JSON.parse(reply.content[0].text),receipt);
  current={...receipt,request_id:'another-op'};
  await assert.rejects(adapter.call('image_result',{request_id:'saved-op',response_detail:'compact'}),/original scientific result identity/);
  current={...receipt,backend:'other-provider'};
  await assert.rejects(adapter.call('image_result',{request_id:'saved-op',response_detail:'compact'}),/original scientific result identity/);
 }finally{adapter.close();}
});
