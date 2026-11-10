// Registration and transport contracts only: no Python, optimization or new science matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';

const primary=[18,18,23,23], reference=[38,18,43,23];
const minimal=()=>({request_id:'conditional-s2',object_id:'a'.repeat(32),rect:primary,
 reference_comparison:{reference_rects:[reference],source_text:'Caller-selected same-class reference, not verified'}});
const geometry=()=>({site_centers_xy:[[20,20],[40,20]],supplied_columns_xy:[[20,20],[40,20]],sigma_pixels:1,
 source_text:'Caller supplies fixed centres and width on the original source grid'});
const counts=()=>({model:'independent_poisson_counts',source_text:'Caller reports original count pixels and their acquisition meaning'});
function recordingRegistry(){
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 return {calls,registry};
}

test('S2 is a separate opt-in tool; absent or unsupported prerequisites reach the worker unchanged',async()=>{
 const {calls,registry}=recordingRegistry();
 const absent=minimal(),unsupported={...minimal(),geometry:geometry(),count_interpretation:{model:'normalized_image_brightness',source_text:'Explicit unsupported source, not count pixels'}};
 await registry.call('image_column_fit',absent);
 await registry.call('image_column_fit',unsupported);
 assert.deepEqual(calls,[{name:'image_column_fit',args:absent},{name:'image_column_fit',args:unsupported}]);
 const schema=registry.listTools().find(tool=>tool.name==='image_column_fit').inputSchema;
 assert.deepEqual(schema.required,['object_id','rect','reference_comparison','request_id']);
 assert.equal(schema.properties.count_interpretation.properties.model.enum,undefined,'Unknown noise models must be saved UNKNOWN by the worker, not silently replaced or rejected by an enum');
});

test('S2 schema bounds sourced geometry, references and count interpretation before dispatch',async()=>{
 const {calls,registry}=recordingRegistry(),base={...minimal(),geometry:geometry(),count_interpretation:counts(),acquisition_context:{modality:'haadf',source_text:'Declared synthetic channel'}};
 const invalid=[
  {...base,request_id:undefined},
  {...base,rect:undefined},
  {...base,reference_comparison:undefined},
  {...base,reference_comparison:{...base.reference_comparison,reference_rects:[]}},
  {...base,reference_comparison:{...base.reference_comparison,reference_rects:Array(9).fill(reference)}},
  {...base,geometry:{...geometry(),site_centers_xy:[[20,20]]}},
  {...base,geometry:{...geometry(),site_centers_xy:Array(10).fill([20,20])}},
  {...base,geometry:{...geometry(),supplied_columns_xy:[]}},
  {...base,geometry:{...geometry(),supplied_columns_xy:Array(257).fill([20,20])}},
  {...base,geometry:{...geometry(),site_centers_xy:[[20,20],[40,NaN]]}},
  {...base,geometry:{...geometry(),sigma_pixels:0}},
  {...base,geometry:{...geometry(),sigma_pixels:Infinity}},
  {...base,geometry:{...geometry(),source_text:''}},
  {...base,geometry:{...geometry(),fit_centres:true}},
  {...base,count_interpretation:{...counts(),source_text:''}},
  {...base,count_interpretation:{...counts(),model:'x'.repeat(129)}},
  {...base,count_interpretation:{...counts(),counts_verified:true}},
  {...base,acquisition_context:{modality:'haadf'}},
  {...base,acquisition_context:{modality:'haadf',source_text:''}},
  {...base,acquisition_context:{modality:'invented',source_text:'x'}},
  {...base,occupancy:0}
 ];
 for(const args of invalid)await assert.rejects(registry.call('image_column_fit',args));
 assert.equal(calls.length,0);
 await registry.call('image_column_fit',base);
 const max={...base,reference_comparison:{...base.reference_comparison,reference_rects:Array.from({length:8},(_,i)=>[i*6,30,i*6+5,35])},
  geometry:{...geometry(),site_centers_xy:Array.from({length:9},(_,i)=>[i*6,32]),supplied_columns_xy:Array.from({length:256},(_,i)=>[i,0])}};
 await registry.call('image_column_fit',max);
 assert.equal(calls.length,2,'Cross-field shape, matching, duplicates and rank admission remain authoritative worker checks');
});

test('legacy statistics accepts its original fields and cannot accidentally opt in to S2',async()=>{
 const {calls,registry}=recordingRegistry(),args=minimal();
 await registry.call('image_statistics',args);
 await assert.rejects(registry.call('image_statistics',{...args,geometry:geometry()}));
 await assert.rejects(registry.call('image_statistics',{...args,count_interpretation:counts()}));
 assert.deepEqual(calls,[{name:'image_statistics',args}]);
 assert.deepEqual(registry.listTools().find(tool=>tool.name==='image_statistics').inputSchema.required,['object_id','request_id']);
});

test('S2 recipe declares bounded conditional measurements and original-request recovery',()=>{
 const {registry}=recordingRegistry(),contract=registry.describe('image_column_fit');
 assert.deepEqual(contract.effects,{kind:'measurement-record-write',sourceMutation:false,requestId:'required'});
 assert.equal(contract.recovery.tool,'image_result');
 assert.equal(contract.recovery.idField,'request_id');
 assert.match(contract.execution.budgets.join(' '),/at most9 patch fits/i);
 assert.match(contract.execution.budgets.join(' '),/strictly fewer than81 pixels before SVD/);
 assert.match(contract.gates.join(' '),/dtype alone does not establish counts/);
 assert.match(contract.gates.join(' '),/no optimizer replay/);
 assert.match(contract.outputs.join(' '),/whole-plane integrals extrapolated/);
});

test('S2 action mapping preserves inputs; saved-result recovery remains a query, not a new fit action',async()=>{
 const payloads=[],adapter=new ImageWorkspace({workspace:path.resolve('column-fit-contract-fixture'),python:'never-executed'});
 adapter.run=(payload)=>{
  payloads.push(payload);
  const result=Promise.resolve({content:[{type:'text',text:JSON.stringify({state:'completed',kind:'column_fit',object_id:'b'.repeat(32)})}]});
  result.workerDone=Promise.resolve();result.requestStop=()=>{};
  return result;
 };
 try{
  const args={...minimal(),geometry:geometry(),count_interpretation:counts()};
  const write=adapter.call('image_column_fit',args);await write;await write.workerDone;
  const query=adapter.call('image_result',{request_id:args.request_id});await query;await query.workerDone;
  assert.deepEqual(payloads,[{...args,action:'column_fit',workspace:adapter.workspace},
   {action:'result',workspace:adapter.workspace,query_request_id:args.request_id}]);
 }finally{adapter.close();}
});
