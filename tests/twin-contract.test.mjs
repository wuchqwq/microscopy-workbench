import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createStructureModule} from '../lib/tools/structure_module.mjs';
import {StructureWorkspace} from '../lib/structure_workspace.mjs';

const id=n=>String(n).repeat(32);
const orient=()=>({object_id:id(1),orientation_id:id(2),plane_hkl:[1,1,1],candidate_basis:'hypothesized conventional FCC Sigma3 trial',request_id:'twin-orient'});
const compare=()=>({object_id:id(3),parent_simulation_object_id:id(4),twin_simulation_object_id:id(5),current_spatial_image_object_id:id(6),
  domains:[{field_object_id:id(7),rect_xyxy:[0,0,64,64],current_image_object_id:id(8)},
           {field_object_id:id(7),rect_xyxy:[64,0,128,64],current_image_object_id:id(9)}],
  registration:{rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'explicit shared image and simulator axes; no B refit'},
  max_residual_inv_angstrom:.005,angular_tolerance_deg:1,request_id:'twin-evidence'});

test('F3b registered schema rejects accidental mirror/scale/source widening before dispatch',async()=>{
  const calls=[];
  const registry=new ToolRegistry().register(createStructureModule({structureWorkspace:{workspace:path.resolve('structures'),call(name,args){calls.push({name,args});return {content:[]};}}}));
  assert.ok(registry.listTools().some(t=>t.name==='structure_twin_orient'));
  assert.ok(registry.listTools().some(t=>t.name==='structure_twin_compare'));
  for(const mutate of [p=>{delete p.request_id;},p=>{p.registration.scale=1.1;},p=>{p.registration.translation_inv_angstrom=[.1,0];},
    p=>{p.image_workspace='outside';},p=>{p.domains[0].sample_index=1;},p=>{p.domains[0].rect_xyxy=[0,0,64];},p=>{p.twin_confirmed=true;}]){
    const args=compare();mutate(args);await assert.rejects(registry.call('structure_twin_compare',args));
  }
  const invalid=orient();invalid.plane_hkl=[1,1,0];await assert.rejects(registry.call('structure_twin_orient',invalid));
  assert.equal(calls.length,0);
  await registry.call('structure_twin_orient',orient());await registry.call('structure_twin_compare',compare());
  assert.deepEqual(calls.map(c=>c.name),['structure_twin_orient','structure_twin_compare']);
});

test('F3b adapter uses configured image provider, scoped request and existing original-ID query',async()=>{
  const workspace=path.resolve('structures'),imageWorkspacePath=path.resolve('images');
  const adapter=new StructureWorkspace({workspace,imageWorkspacePath});const accepted=[];
  adapter.run=payload=>{accepted.push(payload);const done=Promise.resolve({content:[]});done.workerDone=Promise.resolve();return done;};
  await adapter.call('structure_twin_orient',orient());await adapter.call('structure_twin_compare',compare());
  await adapter.call('structure_result',{request_id:'twin-evidence'});
  await adapter.call('structure_twin_evidence',{object_id:id(3),comparison:'twin_domain',section:'unmatched_simulated',offset:0,limit:32});
  assert.equal(accepted[0].action,'twin_orient');assert.equal(accepted[1].action,'twin_compare');
  assert.equal(accepted[1].image_workspace,imageWorkspacePath);assert.equal(accepted[1].request_id,'twin-evidence');
  assert.equal(accepted[2].query_request_id,'twin-evidence');assert.equal(accepted[2].action,'result');
  assert.equal(accepted[3].action,'twin_evidence');assert.equal(accepted[3].request_id,undefined);
  assert.throws(()=>new StructureWorkspace({workspace}).call('structure_twin_compare',compare()),/configured image provider/);
  const standalone=new ToolRegistry().register(createStructureModule({structureWorkspace:adapter}));
  await standalone.call('structure_info',{object_id:id(1)}); // old tools remain direct
  await assert.rejects(standalone.call('structure_twin_evidence',{object_id:id(3),comparison:'twin_domain',section:'../../raw.npy',offset:0,limit:32}));
  await assert.rejects(standalone.call('structure_twin_evidence',{object_id:id(3),comparison:'twin_domain',section:'unmatched_simulated',offset:0,limit:129}));
});
