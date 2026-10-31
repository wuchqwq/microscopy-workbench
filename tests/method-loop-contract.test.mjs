import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
const id='a'.repeat(32);
test('cross-method registration exposes bounded explicit actions without central dispatch edits',async()=>{
 const calls=[];
 const registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:path.resolve('images'),call(name,args){calls.push({name,args});return {content:[]};}}}));
 for(const name of ['image_method_plan','image_method_next','image_method_step','image_gpa','image_topology'])assert.ok(registry.listTools().some(t=>t.name===name));
 const plan=()=>({object_ids:[id],budget:{method_calls:2,fft_pixels:0,gpa_band_pixels:131072,topology_path_samples:5328},information:{goal:'projected_topology'},request_id:'saved-plan'});
 for(const mutate of [p=>{delete p.request_id;},p=>{p.budget.fft_pixels=65536;},p=>{p.budget.method_calls=9;},p=>{delete p.information.goal;},p=>{p.information.script='unsafe';},p=>{p.workspace='other';}]){
  const input=plan();mutate(input);await assert.rejects(registry.call('image_method_plan',input));
 }
 assert.equal(calls.length,0);await registry.call('image_method_plan',plan());
 await registry.call('image_method_next',{object_id:id,information_patch:{model_assumption_text:'An explicit trial model, not material confirmation'},request_id:'next-plan'});
 await registry.call('image_method_step',{object_id:id,root_plan_id:id,action_id:id,selection_reason:'Inspect explicit saved phase evidence first',request_id:'method-'+id+'-1'});
 assert.deepEqual(calls.map(x=>x.name),['image_method_plan','image_method_next','image_method_step']);
});
