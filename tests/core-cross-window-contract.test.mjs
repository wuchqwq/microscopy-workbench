import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
test('one-core extension uses the existing atlas tool and validates bounded provenance/options',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 const args={request_id:'cross-contract',object_id:'a'.repeat(32),rects:[[32,32,48,48]],cross_window:{selection_origin:'agent',source_text:'Image observation, not physical confirmation'}};
 for(const cross_window of [{source_text:'missing origin'},{selection_origin:'agent',source_text:''},{...args.cross_window,arm_lengths:[1,2,3]},{...args.cross_window,arm_lengths:[-1,2,3,4]},{...args.cross_window,stable_arms_confirmed:true},{...args.cross_window,discovery_object_id:'frontmost'}])await assert.rejects(registry.call('image_spatial_atlas',{...args,cross_window}));
 assert.equal(calls.length,0);await registry.call('image_spatial_atlas',args);assert.deepEqual(calls,[{name:'image_spatial_atlas',args}]);assert.equal(registry.listTools().filter(t=>t.name==='image_spatial_atlas').length,1);
});
