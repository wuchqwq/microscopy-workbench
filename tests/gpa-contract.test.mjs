import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
const id='a'.repeat(32);
test('GPA registers as explicit optional image capability with bounded sourced arguments',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 for(const name of ['image_gpa','image_gpa_view','image_gpa_read'])assert.ok(registry.listTools().some(t=>t.name===name));
 const input={object_id:id,source_domain:'real_space_lattice',source_domain_text:'Known analytic synthetic lattice',g_vectors:[[.125,0],[0,.125]],mask_sigma:.012,reference_rect:[64,64,96,96],reference_mode:'fixed_g',reference_text:'Analytic synthetic reference lattice assumption',request_id:'gpa-saved'};
 for(const patch of [{request_id:undefined},{source_domain:undefined},{source_domain_text:undefined},{g_vectors:[[.125,0]]},{mask_sigma:0},{reference_mode:'auto'},{reference_text:''},{backend:'native'},{max_size:1025},{displacement_is_reconstruction_phase:true}])await assert.rejects(registry.call('image_gpa',{...input,...patch}));
 await assert.rejects(registry.call('image_gpa_view',{object_id:id,component:'material_phase',request_id:'view'}));
 await assert.rejects(registry.call('image_gpa_read',{object_id:id,points:Array(65).fill([0,0]),request_id:'read'}));
 await assert.rejects(registry.call('image_gpa_read',{object_id:id,points:[[1.5,3]],request_id:'read'}));
 assert.equal(calls.length,0);
 await registry.call('image_gpa',input);
 await registry.call('image_gpa_view',{object_id:id,component:'rotation',request_id:'view'});
 await registry.call('image_gpa_read',{object_id:id,points:[[0,0]],request_id:'read'});
 assert.equal(calls.length,3);
});
test('GPA dispatch retains existing provider journal and original recovery scope',async()=>{
 const workspace=new ImageWorkspace({workspace:path.resolve('gpa-contract')});let seen;
 workspace.run=payload=>{seen=payload;const p=Promise.resolve({content:[]});p.workerDone=Promise.resolve();p.requestStop=()=>{};return p;};
 for(const [tool,action] of [['image_gpa','gpa'],['image_gpa_view','gpa_view'],['image_gpa_read','gpa_read']]){
  await workspace.call(tool,{object_id:id,request_id:tool});assert.equal(seen.action,action);assert.equal(seen.request_id,tool);assert.equal(seen.workspace,workspace.workspace);
 }
 await workspace.call('image_result',{request_id:'image_gpa'});assert.equal(seen.query_request_id,'image_gpa');assert.equal(seen.action,'result');
 workspace.close();
});
