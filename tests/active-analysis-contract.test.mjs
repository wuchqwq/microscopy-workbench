import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {requiredContextDependencies} from '../lib/runtime/analysis_context.mjs';
import {createScientificContextBindings} from '../lib/analysis_context_bindings.mjs';
import {validateSpatialDomainEvidence} from '../ui/image-panel/evidence-contracts.mjs';
import {renderDomainEvidence} from '../ui/image-panel/domain-evidence.mjs';
const id='a'.repeat(32),key='b'.repeat(64);
test('active interfaces preserve bounded budgets, explicit action identities and optional registration',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 const base={object_id:id,budget_windows:8,budget_fft_pixels:20480,candidate_scales:[32],request_id:'plan'};
 for(const patch of [{request_id:undefined},{budget_windows:33},{budget_fft_pixels:-1},{max_candidates:9},{candidate_scales:[3]},{candidate_scales:[8,16,32,64,128]},{user_stop:'yes'},{information_gain:1}])await assert.rejects(registry.call('image_analysis_candidates',{...base,...patch}));
 const append={object_id:id,candidate_set_id:id,action_ids:[id],request_id:'append'};
 for(const patch of [{request_id:undefined},{action_ids:[key]},{rects:Array(5).fill([0,0,8,8])},{source_text:''},{source_text:'x'.repeat(2001)},{measurement_overrides:Array(5).fill({observation_key:key,measurement_object_ids:[id]})},{measurement_overrides:[{observation_key:'bad',measurement_object_ids:[id]}]},{backend:'native'}])await assert.rejects(registry.call('image_field_extend',{...append,...patch}));
 assert.equal(calls.length,0);await registry.call('image_analysis_candidates',base);await registry.call('image_field_extend',append);assert.equal(calls.length,2);
 await registry.call('image_field_extend',{object_id:id,rects:[],measurement_overrides:[{observation_key:key,measurement_object_ids:[id]}],request_id:'revise'});
});
test('late proposals cannot be promoted against different current fields or maps',async()=>{
 const {validateBindings}=createScientificContextBindings({providers:{}});
 const entry={ref:{provider:'external-image-workspace'},proof:{scientific:{sourceId:'map',fieldId:'field'}},dependsOn:{domains:'hash',spatial_field:'hash'}};
 const current=objectId=>({ref:{objectId},status:'active'});
 await validateBindings({slot:'active_plan',entry,slots:{domains:current('map'),spatial_field:current('field')}});
 await assert.rejects(validateBindings({slot:'active_plan',entry,slots:{domains:current('new-map')}}),/selected domain map/);
 await assert.rejects(validateBindings({slot:'active_plan',entry,slots:{spatial_field:current('new-field')}}),/different current field/);
 assert.deepEqual(requiredContextDependencies('active_plan',{domains:current('map'),spatial_field:current('field')}).required,['spatial_field','domains']);
});
function proposal(){return {kind:'analysis_candidates',object_id:id,overview_object_id:id,coordinate_domain:'pixel',field_object_id:id,source_domain_map_id:id,
 samples:[{sample_index:0,scale_pixels:32,grid_xy:[0,0],rect_xyxy:[0,0,32,32],center_xy:[15.5,15.5],fft_object_id:id,roi_object_id:id,view_object_id:id,atlas_object_id:id,atlas_region_index:0}],
 field_image:{width:64,height:64,hotspots:[]},budget:{used_windows:4,used_fft_pixels:16384,remaining_windows:4,remaining_fft_pixels:4096},stopping:{stop:false,reason:'continue'},
 actions:[{action_id:id,observation_key:key,rect_xyxy:[0,0,16,16],scale_pixels:16,heuristic_score:3.2,exploration:true,reason_codes:['reserved_scale_or_offset_exploration'],estimated_cost:{new_windows:1,fft_pixels:256}}],recommended_action_ids:[id]};}
test('proposal display validates new numbers and shows heuristic exploration/stop without executing science',async()=>{
 const input=proposal();assert.doesNotThrow(()=>validateSpatialDomainEvidence(input));
 for(const corrupt of [p=>p.actions[0].heuristic_score=NaN,p=>p.actions[0].estimated_cost.fft_pixels=257,p=>p.recommended_action_ids=['foreign'],p=>p.budget.remaining_windows=-1,p=>p.stopping.stop=true]){const value=proposal();corrupt(value);assert.throws(()=>validateSpatialDomainEvidence(value),/Invalid spatial domain evidence/);}
 const doc={createElement(tag){return {tag,textContent:'',children:[],listeners:{},style:{},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;}};}};
 const container={...doc.createElement('details'),ownerDocument:doc},before=structuredClone(input),shown=[];
 renderDomainEvidence(container,input,{show:id=>shown.push(id)});
 const nodes=node=>[node,...node.children.flatMap(nodes)],text=nodes(container).map(n=>n.textContent).join(' ');
 assert.match(text,/保留探索/);assert.match(text,/非概率/);assert.match(text,/剩余 4 个窗口/);
 const button=nodes(container).find(n=>n.tag==='button'&&n.textContent==='已有结构场');await button.listeners.click();assert.deepEqual(shown,[id]);assert.deepEqual(input,before);
 const stopped=proposal();stopped.stopping={stop:true,reason:'budget_exhausted'};stopped.actions=[];stopped.recommended_action_ids=[];renderDomainEvidence(container,stopped);assert.match(nodes(container).map(n=>n.textContent).join(' '),/预算耗尽/);
});
