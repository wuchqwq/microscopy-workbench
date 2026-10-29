import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
const a='a'.repeat(32),b='b'.repeat(32);
const sequence=()=>({request_id:'sequence-contract',frames:[{object_id:a},{object_id:b}],axis:{meaning:'reconstruction_depth',source_text:'Synthetic slice order; physical depth unknown'}});
test('sequence tools register without central name dispatch changes and reject invalid input before worker',async()=>{
  const calls=[];
  const registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'sequence-fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
  for(const tool of ['image_sequence_create','image_region_correspondence','image_joint_observations'])assert.ok(registry.listTools().some(t=>t.name===tool));
  for(const mutate of [p=>delete p.request_id,p=>p.frames.push({object_id:'latest'}),p=>p.axis.meaning='z_nm',p=>p.frames[0].path='arbitrary.npy',p=>p.workspace='other']){
    const args=sequence();mutate(args);await assert.rejects(registry.call('image_sequence_create',args));
  }
  await assert.rejects(registry.call('image_region_correspondence',{request_id:'bad-shift',sequence_object_id:a,reference_index:0,rect:[0,0,8,8],mode:'estimate',max_shift:99}));
  await assert.rejects(registry.call('image_joint_observations',{request_id:'bad-limit',correspondence_object_id:a,max_peaks:40}));
  assert.equal(calls.length,0);
  await registry.call('image_sequence_create',sequence());assert.equal(calls.length,1);
});
test('sequence adapter uses the existing image provider scope, action and recovery identity',async()=>{
  const adapter=new ImageWorkspace({workspace:path.resolve('sequence-contract-workspace')});let seen;
  adapter.run=payload=>{seen=payload;const result=Promise.resolve({content:[]});result.workerDone=Promise.resolve();return result;};
  for(const [tool,action,args] of [
    ['image_sequence_create','sequence_create',sequence()],
    ['image_region_correspondence','region_correspondence',{request_id:'correspondence',sequence_object_id:a,reference_index:0,rect:[0,0,8,8],mode:'identity',source_text:'Declared common scene grid'}],
    ['image_joint_observations','joint_observations',{request_id:'joint',correspondence_object_id:b}],
  ]) {await adapter.call(tool,args);assert.equal(seen.action,action);assert.equal(seen.request_id,args.request_id);assert.equal(seen.workspace,adapter.workspace);}
});

test('partial recovery crosses the MCP adapter as structured error evidence, never successful science or another parent',async()=>{
  const response={ok:false,state:'unknown',request_id:'interrupted-parent',error:{code:'INCOMPLETE_REQUEST',message:'Original operation incomplete'},partial_results:{parent_request_id:'interrupted-parent',automatic_retry:false,children:[{request_id:'saved-child',state:'completed',object_id:a}]}};
  const spawnProcess=()=>{const child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('finish',()=>{child.stdout.write(JSON.stringify(response));child.emit('close',0);});return child;};
  const adapter=new ImageWorkspace({workspace:path.resolve('partial-fixture'),spawnProcess});
  const result=await adapter.call('image_result',{request_id:'interrupted-parent'});
  assert.equal(result.isError,true);assert.deepEqual(JSON.parse(result.content[0].text).partial_results,response.partial_results);
  response.partial_results.parent_request_id='another-parent';
  await assert.rejects(adapter.call('image_result',{request_id:'interrupted-parent'}),/different original request/);
});
