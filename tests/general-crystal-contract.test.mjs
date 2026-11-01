import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createStructureModule} from '../lib/tools/structure_module.mjs';
import {StructureWorkspace} from '../lib/structure_workspace.mjs';
const id=n=>String(n).repeat(32);
const parameters=()=>({request_id:'general-original',experimental_kind:'real_space_fft',
 current_spatial_image_object_id:id(1),domains:[{field_object_id:id(2),current_image_object_id:id(3),rect_xyxy:[0,0,64,64]},
 {field_object_id:id(2),current_image_object_id:id(4),rect_xyxy:[64,0,128,64]}],
 candidates:[{label:'explicit pair',simulation_a_object_id:id(5),simulation_b_object_id:id(6),basis:'Supplied structures and saved orientations; conditional hypothesis'}],
 registration:{rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'One shared independent experimental coordinate system'},max_residual_inv_angstrom:.005});
test('general crystal registration rejects hidden refits, free paths and twin assertions before dispatch',async()=>{
 const calls=[],registry=new ToolRegistry().register(createStructureModule({structureWorkspace:{workspace:path.resolve('structures'),call(name,args){calls.push({name,args});return {content:[]};}}}));
 for(const mutate of [p=>{delete p.request_id;},p=>{p.domains.pop();},p=>{p.registration.scale=1.1;},p=>{p.registration.translation_inv_angstrom=[.1,0];},p=>{p.candidates[0].rotation_b_deg=15;},p=>{p.image_workspace='outside';},p=>{p.twin_confirmed=true;},p=>{p.experimental_kind='saed';}]){
  const p=parameters();mutate(p);await assert.rejects(registry.call('structure_general_compare',p));
 }
 assert.equal(calls.length,0);
 await registry.call('structure_general_compare',parameters());assert.deepEqual(calls,[{name:'structure_general_compare',args:parameters()}]);
 const contract=registry.describe('structure_general_compare');assert.equal(contract.backend,'external-structure-workspace');assert.equal(contract.effects.sourceMutation,false);assert.equal(contract.recovery.tool,'structure_result');
 assert.ok(registry.listTools().some(t=>t.name==='structure_twin_compare'),'Old F3b remains independently available');
});
test('general crystal adapter shares scoped recovery and only injects the configured image workspace',async()=>{
 const workspace=path.resolve('structures'),images=path.resolve('images'),adapter=new StructureWorkspace({workspace,imageWorkspacePath:images}),accepted=[];
 adapter.run=p=>{accepted.push(p);const r=Promise.resolve({content:[]});r.workerDone=Promise.resolve();return r;};
 await adapter.call('structure_general_compare',parameters());await adapter.call('structure_result',{request_id:'general-original'});
 assert.equal(accepted[0].action,'general_compare');assert.equal(accepted[0].image_workspace,images);
 assert.equal(accepted[1].action,'result');assert.equal(accepted[1].query_request_id,'general-original');
 assert.throws(()=>new StructureWorkspace({workspace}).call('structure_general_compare',parameters()),/configured image provider/);
 adapter.close?.();
});
