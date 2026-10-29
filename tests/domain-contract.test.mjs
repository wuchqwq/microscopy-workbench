import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
import {requiredContextDependencies} from '../lib/runtime/analysis_context.mjs';
import {createScientificContextBindings} from '../lib/analysis_context_bindings.mjs';
const id='a'.repeat(32);
test('domain tools register optionally and invalid scopes/budgets never dispatch',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 for(const name of ['image_spatial_atlas','image_local_signature_compare','image_feature_field'])assert.ok(registry.listTools().some(t=>t.name===name));
 const atlas={object_id:id,rects:[[0,0,32,32]],request_id:'atlas'};
 for(const patch of [{request_id:undefined},{rects:[]},{object_id:'frontmost'},{rects:Array(9).fill([0,0,8,8])},{max_peaks:50},{workspace:'other'}])await assert.rejects(registry.call('image_spatial_atlas',{...atlas,...patch}));
 const compare={object_id:id,reference_index:0,angles_degrees:[0,30],coordinate_domain:'pixel',tolerance:.001,request_id:'compare'};
 for(const patch of [{angles_degrees:[]},{angles_degrees:Array(65).fill(0)},{tolerance:0},{coordinate_domain:'nm'},{fit_scale:true},{mirror:true}])await assert.rejects(registry.call('image_local_signature_compare',{...compare,...patch}));
 const field={object_id:id,coordinate_domain:'pixel',display_feature:'family_count',request_id:'field'};
 for(const patch of [{request_id:undefined},{coordinate_domain:'auto'},{display_feature:'phase'},{max_size:255},{max_size:1025},{interpolate:true}])await assert.rejects(registry.call('image_feature_field',{...field,...patch}));
 assert.equal(calls.length,0);await registry.call('image_spatial_atlas',atlas);await registry.call('image_local_signature_compare',compare);assert.equal(calls.length,2);
});
test('old atlas cannot be reselected as current after corrected calibration or point records',async()=>{
 const binding=createScientificContextBindings({providers:{}});
 const calibration={calibration_id:'a',revision:1},entry={ref:{provider:'external-image-workspace'},proof:{scientific:{sourceId:id,calibrations:[calibration],measurementIds:['saved-measure']}},dependsOn:{}};
 const active=(ref,scientific={})=>({status:'active',ref:{objectId:ref},proof:{scientific}});
 await binding.validateBindings({slot:'atlas',entry,slots:{calibration:active('old',{calibration}),measurements:[active('saved-measure')]}});
 await assert.rejects(binding.validateBindings({slot:'atlas',entry,slots:{calibration:active('new',{calibration:{...calibration,revision:2}})}}),/different selected calibration/);
 await assert.rejects(binding.validateBindings({slot:'atlas',entry,slots:{points:[active('corrected-measure')]}}),/selected corrected point/);
 await assert.rejects(binding.validateBindings({slot:'atlas',entry,slots:{measurements:[active('corrected-measure')]}}),/selected corrected point/);
 assert.deepEqual(requiredContextDependencies('atlas',{calibration:active('scale'),points:[active('point')]}).required,['calibration','points']);
});
test('new tools preserve provider request scope and original query mechanism',async()=>{
 const workspace=new ImageWorkspace({workspace:path.resolve('domain-contract')});let seen;
 workspace.run=payload=>{seen=payload;const p=Promise.resolve({content:[]});p.workerDone=Promise.resolve();return p;};
 for(const [tool,action] of [['image_spatial_atlas','spatial_atlas'],['image_local_signature_compare','local_signature_compare'],['image_feature_field','feature_field']]){
  await workspace.call(tool,{object_id:id,request_id:tool});assert.equal(seen.action,action);assert.equal(seen.workspace,workspace.workspace);assert.equal(seen.request_id,tool);
 }
 assert.deepEqual(requiredContextDependencies('atlas',{experiment:{ref:{objectId:id}}}),{required:['experiment'],parents:[]});
});
