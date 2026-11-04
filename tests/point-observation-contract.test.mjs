import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';

test('existing statistics tool accepts bounded sourced contextual references, without physical labels',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 const args={request_id:'point-contract',object_id:'a'.repeat(32),rect:[16,16,24,24],reference_comparison:{reference_rects:[[32,32,40,40]],source_text:'Expected same-type sites, caller assumption'}};
 for(const reference_comparison of [{reference_rects:[],source_text:'x'},{reference_rects:Array(9).fill([0,0,8,8]),source_text:'x'},{reference_rects:[[0,0,8,8]]},{...args.reference_comparison,source_text:''},{...args.reference_comparison,vacancy_confirmed:true}])await assert.rejects(registry.call('image_statistics',{...args,reference_comparison}));
 assert.equal(calls.length,0);
 await registry.call('image_statistics',args);
 assert.deepEqual(calls,[{name:'image_statistics',args}]);
 assert.match(registry.listTools().find(t=>t.name==='image_discovery_review').description,/line subset/);
});
