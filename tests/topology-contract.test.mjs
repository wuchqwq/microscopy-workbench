import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
const id='a'.repeat(32);
const input={object_ids:[id],loops:[{loop_id:'inner',rect:[80,80,176,176],orientation:'positive_image_xy'},
 {loop_id:'outer',rect:[64,64,192,192],orientation:'positive_image_xy'}],model_assumption_text:'Public synthetic simple complete projected circuit model',request_id:'topology-saved'};
test('topology registers formally and rejects unbounded/unsourced calls before execution',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 assert.ok(registry.listTools().some(tool=>tool.name==='image_topology'));
 for(const patch of [{request_id:undefined},{object_ids:[]},{object_ids:Array(4).fill(id)},{model_assumption_text:''},{loops:[]},{loops:[input.loops[0]]},{loops:Array(9).fill(input.loops[0])},{max_size:1025},{phase_step_limit:Math.PI},{backend:'native'},
  {loops:[{rect:[80,80,176,176],orientation:'auto'},input.loops[1]]},
  {burgers_candidates:[{label:'=SUM(A1)',b_pixel_xy:[8,0]}]},
  {burgers_candidates:[{label:'candidate',b_pixel_xy:[8,0,1]}]}])await assert.rejects(registry.call('image_topology',{...input,...patch}));
 assert.equal(calls.length,0);
 await registry.call('image_topology',input);assert.equal(calls.length,1);
});
test('topology uses the original provider scope and recovery port, with no backend fallback',async()=>{
 const workspace=new ImageWorkspace({workspace:path.resolve('topology-contract')});let seen;
 workspace.run=payload=>{seen=payload;const p=Promise.resolve({content:[]});p.workerDone=Promise.resolve();p.requestStop=()=>{};return p;};
 await workspace.call('image_topology',input);assert.equal(seen.action,'topology');assert.equal(seen.workspace,workspace.workspace);assert.equal(seen.request_id,input.request_id);
 await workspace.call('image_result',{request_id:input.request_id});assert.equal(seen.action,'result');assert.equal(seen.query_request_id,input.request_id);
 workspace.close();
});
