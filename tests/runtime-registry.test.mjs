import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolRegistry,checkSchema} from '../lib/runtime/tool_registry.mjs';
import {RpcError,tool} from '../lib/runtime/schema.mjs';

const contract=()=>({backend:'fixture',inputs:['ExplicitInput'],outputs:['SavedResult'],
 effects:{kind:'inspect',sourceMutation:false,requestId:'query'},gates:['Existing provider validates science'],
 execution:{resourceKeys:[],serialization:'fixture',budgets:['bounded fixture'],cancellation:'query original request'},
 recovery:{method:'existing journal',scope:'fixture provider',tool:'fixture_result',idField:'request_id'}});
const entry=(name,execute=()=>({content:[]}))=>({definition:tool(name,'Fixture tool',{n:{type:'number'}},['n']),contract:contract(),execute});
const module=(id,tools)=>({id,enabled:true,instructions:'Fixture instructions',tools});

test('registry snapshots metadata and returned descriptions without changing the handler result',async()=>{
 const result={content:[{type:'text',text:'saved fixture'}],original_request_id:'before-submit'},value=entry('fixture_read',()=>result);
 value.definition.extra_metadata={nested:['original']};value.contract.extra_evidence={status:'not_qualified'};
 const registry=new ToolRegistry().register(module('fixture',[value]));
 value.definition.extra_metadata.nested[0]='changed';value.definition.inputSchema.properties.n.maximum=0;value.contract.gates.push('changed');
 const listed=registry.listTools();assert.deepEqual(listed[0].extra_metadata,{nested:['original']});
 listed[0].extra_metadata.nested[0]='caller edit';assert.deepEqual(registry.listTools()[0].extra_metadata,{nested:['original']});
 const description=registry.describe('fixture_read');assert.deepEqual(description.gates,['Existing provider validates science']);
 assert.deepEqual(description.extra_evidence,{status:'not_qualified'});assert.equal(description.availability.runtimeQualification,'not_probed');
 description.gates.push('caller edit');assert.equal(registry.describe('fixture_read').gates.length,1);
 assert.equal(await registry.call('fixture_read',{n:1}),result,'registry does not clone, qualify or reinterpret provider results');
});

test('failed or duplicate registration cannot partially expose or replace tools',()=>{
 const registry=new ToolRegistry().register(module('original',[entry('existing')]));
 const bad=entry('invalid');bad.definition.inputSchema={type:'array',items:{type:'number'}};
 assert.throws(()=>registry.register(module('failed',[entry('would_be_partial'),bad])),/tool input must be an object/);
 assert.deepEqual(registry.listTools().map(row=>row.name),['existing']);
 assert.throws(()=>registry.register(module('duplicate',[entry('new_before_duplicate'),entry('existing')])),/duplicate tool existing/);
 assert.equal(registry.describe('new_before_duplicate'),null);
 registry.register(module('failed',[entry('valid_after_failure')]));
 assert.throws(()=>registry.register(module('failed',[entry('other')])),/duplicate module failed/);
 assert.deepEqual(registry.listTools().map(row=>row.name),['existing','valid_after_failure']);
});

test('input and unknown-name refusals happen before handler invocation; cancellation signal is forwarded',async()=>{
 let calls=0,received;const controller=new AbortController(),registry=new ToolRegistry({unknownTool:name=>'fixture missing: '+name});
 registry.register(module('fixture',[entry('fixture_call',(args,options)=>{calls++;received={args,options};return {unvalidated_provider_outcome:'unchanged'};})]));
 await assert.rejects(registry.call('missing',{}),error=>error instanceof RpcError&&error.code===-32602&&error.message==='fixture missing: missing');
 await assert.rejects(registry.call('fixture_call',undefined),/arguments.n: 缺少必填参数/);
 await assert.rejects(registry.call('fixture_call',{n:NaN}),/arguments.n: 类型应为 number/);
 await assert.rejects(registry.call('fixture_call',{n:1,extra:true}),/arguments.extra: 未知参数/);
 assert.equal(calls,0);
 const args={n:1};assert.deepEqual(await registry.call('fixture_call',args,{signal:controller.signal}),{unvalidated_provider_outcome:'unchanged'});
 assert.equal(received.args,args);assert.equal(received.options.signal,controller.signal);assert.equal(calls,1);
});

test('schema registration retains partial combinator metadata without adding argument-validation semantics',async()=>{
 const definition=tool('fixture_combinators','Fixture combinators',{
  n:{type:'number',oneOf:[{minimum:10},{maximum:0}],not:{enum:[5]}},
  nullable_array:{type:['array','null'],items:{type:'number'}},
  nullable_object:{type:['object','null'],properties:{value:{type:'number'}}},
 },['n']);
 checkSchema(definition.inputSchema);
 const registry=new ToolRegistry().register(module('fixture',[{definition,contract:contract(),execute:args=>args}]));
 assert.deepEqual(registry.listTools()[0],definition);
 assert.deepEqual(await registry.call(definition.name,{n:5}),{n:5},'migration must not start enforcing previously descriptive combinators');
 for(const schema of [{type:'array'},{type:['object','null']},{type:'object',properties:{value:{}}}])assert.throws(()=>checkSchema(schema));
 const partial={minimum:1};checkSchema({type:'object',properties:{n:{type:'number',allOf:[partial]}}});
 assert.throws(()=>checkSchema(partial),/schema requires an explicit type/);
});

test('non-JSON metadata and invalid contracts are refused before module publication',()=>{
 for(const change of [
  value=>value.definition.extra=Infinity,
  value=>value.definition.extra=Array(2),
  value=>{value.definition.extra=value.definition;},
  value=>value.contract.effects.requestId='completed',
  value=>value.contract.recovery.tool=12,
 ]){
  const registry=new ToolRegistry(),value=entry('fixture_bad');change(value);
  assert.throws(()=>registry.register(module('fixture',[value])),TypeError);assert.deepEqual(registry.listTools(),[]);
 }
});

test('module closure and sealing retain their original registration lifecycle',()=>{
 let closed=0;const registry=new ToolRegistry(),value=module('fixture',[entry('fixture_close')]);value.close=()=>closed++;
 registry.register(value);assert.equal(registry.unregister('absent'),false);assert.equal(registry.unregister('fixture'),true);assert.equal(closed,1);
 registry.register(value).seal();assert.throws(()=>registry.unregister('fixture'),/sealed/);assert.throws(()=>registry.register(module('other',[entry('other')])),/sealed/);
 registry.close();assert.equal(closed,2);assert.equal(registry.instructions(),'Fixture instructions');
});

test('trusted accessor-backed entries preserve legacy property reads and handler selection',async()=>{
 const reads=[],value={definition:tool('fixture_accessor','Accessor fixture',{})};
 let handlerRead=0;
 Object.defineProperty(value,'execute',{get(){reads.push('execute');const n=++handlerRead;return ()=>n;}});
 Object.defineProperty(value,'contract',{get(){reads.push('contract');return contract();}});
 const registry=new ToolRegistry().register(module('fixture',[value]));
 assert.deepEqual(reads,['execute','contract','contract','execute']);
 assert.equal(await registry.call('fixture_accessor',{}),2);
});
