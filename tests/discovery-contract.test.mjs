import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';

const id='a'.repeat(32),candidate='b'.repeat(32),evidence='c'.repeat(32);
const proposed=()=>({object_id:id,entry:'manual',regions:[{rect:[16,32,80,96],reason:'Researcher observed an interruption',candidate_explanations:['Contrast or structure change; not confirmed'],unresolved:['Unknown imaging contribution']}],request_id:'saved-discovery'});
const reviewed=()=>({object_id:id,candidate_id:candidate,evidence_ids:[evidence],observation_text:'Saved numerical evidence requires source-bound review',request_id:'saved-review'});
const fixture=()=>{
  const calls=[];
  const module=createImageModule({imageWorkspace:{workspace:path.resolve('discovery-images'),call(name,args){calls.push({name,args});return {content:[]};}}});
  return {calls,registry:new ToolRegistry().register(module)};
};

test('image-first tools register as bounded sourced observations with original-request recovery',async()=>{
  const {registry,calls}=fixture();
  for(const name of ['image_discovery','image_discovery_review','image_fft_batch','image_method_plan'])assert.ok(registry.listTools().some(tool=>tool.name===name));
  for(const name of ['image_discovery','image_discovery_review']){
    const contract=registry.describe(name);
    assert.equal(contract.backend,'external-image-workspace');
    assert.equal(contract.effects.sourceMutation,false);
    assert.equal(contract.effects.requestId,'required');
    assert.equal(contract.recovery.tool,'image_result');
    assert.match(contract.execution.cancellation,/not retried/);
    assert.ok(contract.gates.some(value=>value.includes('physical label inference')));
  }
  for(const mutate of [p=>{delete p.request_id;},p=>{p.object_id='latest';},p=>{p.window_sizes=[16];},p=>{p.window_sizes=[32,64,128];},p=>{p.max_candidates=5;},p=>{delete p.regions[0].reason;},p=>{p.regions[0].rect=[-1,0,64,64];},p=>{p.workspace='outside';},p=>{p.script='arbitrary';},p=>{p.regions[0].material_dislocation_confirmed=true;}]){
    const args=proposed();mutate(args);await assert.rejects(registry.call('image_discovery',args));
  }
  assert.equal(calls.length,0);
  const args=proposed();await registry.call('image_discovery',args);
  assert.deepEqual(calls,[{name:'image_discovery',args}]);
  assert.equal(registry.unregister('images'),true);
  assert.equal(registry.listTools().length,0,'Optional module removal needs no central dispatch edit');
});

test('review cannot accept arbitrary files, unbounded evidence or a confirmed material label',async()=>{
  const {registry,calls}=fixture();
  for(const mutate of [p=>{delete p.request_id;},p=>{p.candidate_id='region-1';},p=>{p.evidence_ids=[];},p=>{p.evidence_ids=Array(9).fill(evidence);},p=>{p.observation_text='';},p=>{p.evidence_path='outside.npy';},p=>{p.material_dislocation_confirmed=true;},p=>{p.candidate_explanations=Array(9).fill('unconfirmed');},p=>{p.previous_review_id='last';}]){
    const args=reviewed();mutate(args);await assert.rejects(registry.call('image_discovery_review',args));
  }
  assert.equal(calls.length,0);
  const args={...reviewed(),previous_review_id:evidence,candidate_explanations:['Alternative remains hypothesized'],unresolved:['Unknown physical cause']};
  await registry.call('image_discovery_review',args);
  assert.deepEqual(calls,[{name:'image_discovery_review',args}]);
});

test('discovery adapter preserves explicit worker action, configured provider and saved request ID',async()=>{
  const workspace=path.resolve('discovery-adapter-images');
  const adapter=new ImageWorkspace({workspace});
  const accepted=[];
  adapter.run=parameters=>{accepted.push(parameters);const result=Promise.resolve({content:[]});result.workerDone=Promise.resolve();return result;};
  try{
    await adapter.call('image_discovery',proposed());
    await adapter.call('image_discovery_review',reviewed());
    assert.equal(accepted.length,2);
    assert.deepEqual(accepted.map(value=>value.action),['discovery','discovery_review']);
    assert.deepEqual(accepted.map(value=>value.request_id),['saved-discovery','saved-review']);
    assert.ok(accepted.every(value=>value.workspace===workspace));
    assert.deepEqual(accepted[0].regions,proposed().regions);
    assert.deepEqual(accepted[1].evidence_ids,[evidence]);
  }finally{adapter.close();}
});
