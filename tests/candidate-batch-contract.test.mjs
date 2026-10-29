import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createStructureModule} from '../lib/tools/structure_module.mjs';
import {StructureWorkspace} from '../lib/structure_workspace.mjs';

const ident='a'.repeat(32),image='b'.repeat(32),measure='c'.repeat(32);
const parameters=()=>({request_id:'candidate-trial',measurement_object_ids:[measure],current_image_object_id:image,
  candidates:[{label:'unconfirmed reference',simulation_object_id:ident,registration:{rotation_deg:30,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'explicit proposed in-plane rotation'}}],
  experimental_kind:'real_space_fft',max_residual_inv_angstrom:.005});

test('candidate batch schema prevents accidental calibration fitting and arbitrary workspace selection before dispatch',async()=>{
  const calls=[];
  const registry=new ToolRegistry().register(createStructureModule({structureWorkspace:{workspace:path.resolve('structure-output'),call(name,args){calls.push({name,args});return {content:[]};}}}));
  assert.ok(registry.listTools().some(t=>t.name==='structure_compare_batch'));
  for(const change of [p=>{p.candidates[0].registration.scale=1.2;},p=>{p.candidates[0].registration.translation_inv_angstrom=[0,.01];},p=>{p.image_workspace='outside';},p=>{delete p.request_id;},p=>{p.candidates[0].status='user_confirmed';}]){
    const args=parameters();change(args);
    await assert.rejects(registry.call('structure_compare_batch',args));
  }
  assert.equal(calls.length,0);
  await registry.call('structure_compare_batch',parameters());
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'structure_compare_batch');
});

test('candidate adapter injects configured image root and preserves exact original operation identity',async()=>{
  const workspace=path.resolve('structure-output'),imageWorkspacePath=path.resolve('image-output');
  const adapter=new StructureWorkspace({workspace,imageWorkspacePath});
  let accepted;
  adapter.run=payload=>{accepted=payload;const result=Promise.resolve({content:[]});result.workerDone=Promise.resolve();return result;};
  await adapter.call('structure_compare_batch',parameters());
  assert.equal(accepted.action,'compare_batch');
  assert.equal(accepted.image_workspace,imageWorkspacePath);
  assert.equal(accepted.workspace,workspace);
  assert.equal(accepted.request_id,'candidate-trial');
  assert.deepEqual(accepted.measurement_object_ids,[measure]);
  const disabled=new StructureWorkspace({workspace});
  assert.throws(()=>disabled.call('structure_compare_batch',parameters()),/configured image provider/);
});
