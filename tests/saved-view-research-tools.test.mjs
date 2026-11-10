// Compiled local scientific port only; synthetic hash/journal metadata, no PNG,
// numerical decoding, host, model, approval or image preparation.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {createResearchTextTools,createSavedViewResearchTools} from '../lib/research_text_tools.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
function fixture(t,{changeView=()=>{},changeFrame=()=>{}}={}){
 const workspace=mkdtempSync(path.join(tmpdir(),'saved-view-tools-'));t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 for(const d of ['objects','requests','audit'])mkdirSync(path.join(workspace,d));
 const frameId='1'.repeat(32),viewId='2'.repeat(32),frameBytes=Buffer.from('hash fixture frame, not decoded NPY'),cropBytes=Buffer.from('different crop hash, not decoded NPY');
 const frame={backend:'external-image-workspace',object_id:frameId,request_id:'fixture-frame',kind:'frame',array_domain:'spatial',shape_yx:[20,30],dtype:'uint16',files_sha256:{'data.npy':hash(frameBytes)}};
 const view={backend:'external-image-workspace',object_id:viewId,request_id:'fixture-view',kind:'view',array_domain:'spatial',parent_object_id:frameId,shape_yx:[8,10],dtype:'uint16',annotations:[],files_sha256:{'data.npy':hash(cropBytes)},panels:[{domain:'spatial_pixels',source_object_id:frameId,source_rect_xyxy:[5,6,15,14],image_rect_xyxy:[0,0,200,160]}]};
 const put=(value,bytes)=>{const dir=path.join(workspace,'objects',value.object_id);mkdirSync(dir,{recursive:true});const raw=JSON.stringify(value);writeFileSync(path.join(dir,'object.json'),raw);writeFileSync(path.join(dir,'data.npy'),bytes);writeFileSync(path.join(workspace,'requests',value.request_id+'.json'),JSON.stringify({state:'completed',request_id:value.request_id,object_manifest_sha256:hash(raw),parameters:{workspace,request_id:value.request_id},response:{ok:true,state:'completed',...value}}));};
 changeFrame(frame);changeView(view);put(frame,frameBytes);put(view,cropBytes);
 const calls=[],registry={listTools:()=>[{name:'image_statistics',description:'Existing provider',inputSchema:{type:'object',properties:{object_id:{type:'string'},rect:{type:'array'}},additionalProperties:false}},{name:'image_result',description:'Existing query',inputSchema:{type:'object',properties:{},additionalProperties:false}}],async call(name,args){calls.push({name,args});throw Error('Synthetic unavailable original; PRIVATE /path');}};
 const options={registry,workspace,frameId,viewId,journalDirectory:path.join(workspace,'audit')};
 const call=(callId,object_id=viewId,rect)=>({threadId:'local-thread',turnId:'local-turn',callId,tool:'image_statistics',arguments:{object_id,...(rect?{rect}:{})}});
 return {workspace,frameId,viewId,options,calls,call,view,put,cropBytes};
}
test('a crop binds exact source support, view manifest and tool catalog without requiring a PNG',t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),scope=tools.input_scope;
 assert.deepEqual(scope.source_rect_xyxy,[5,6,15,14]);assert.equal(scope.input_view_id,f.viewId);assert.equal(scope.coordinate_space,'source_pixels');assert.equal(scope.disclosure_approved,false);
 assert.deepEqual(tools.port.definitions[0].inputSchema.properties.object_id.enum,[f.viewId]);assert.match(tools.port.definitions[0].description,/source coordinates, never PNG or crop-relative/);
 assert.ok(Object.isFrozen(scope));assert.ok(Object.isFrozen(scope.source_rect_xyxy));assert.throws(()=>{scope.source_rect_xyxy[0]=0;});
 assert.ok(Object.isFrozen(tools.source));assert.ok(Object.isFrozen(tools.port));assert.ok(Object.isFrozen(tools.port.definitions));assert.throws(()=>{tools.port.definitions[0].inputSchema.properties.object_id.enum[0]=f.frameId;});assert.throws(()=>{tools.port.definitions[0].description='Another tool catalog';});
 assert.throws(()=>createResearchTextTools(f.options),/完整空间映射/,'legacy public text factory still refuses a crop');
 assert.equal(f.calls.length,0);assert.throws(()=>createSavedViewResearchTools({...f.options,viewId:undefined}),/Explicit saved view/);
});
test('crop-relative, full-frame, foreign-input and malformed requests refuse before provider dispatch',async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),signal=new AbortController().signal;
 for(const [i,rect] of [[0,[0,0,10,8]],[1,[0,0,30,20]],[2,[5,6,16,14]],[3,[5,6,15,15]],[4,[5,6,5,14]],[5,[5.5,6,15,14]]]){
  const r=JSON.parse((await tools.port.call(f.call('invalid-'+i,f.viewId,rect),signal)).text);assert.equal(r.status,'not_dispatched');assert.equal(r.request_id,undefined);
 }
 assert.equal(JSON.parse((await tools.port.call(f.call('frame-input',f.frameId),signal)).text).status,'not_dispatched');assert.equal(f.calls.length,0);
});
test('unknown completion preserves one original request, fences later writes and permits only its query',async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),signal=new AbortController().signal,original=f.call('original',f.viewId,[7,8,10,11]);
 const first=await tools.port.call(original,signal),out=JSON.parse(first.text);assert.equal(out.status,'unverified_outcome');assert.match(out.request_id,/^text_tool_/);assert.equal(first.text.includes('PRIVATE'),false);
 assert.deepEqual(await tools.port.call(original,signal),first);assert.equal(f.calls.filter(c=>c.name==='image_statistics').length,1);
 assert.equal(JSON.parse((await tools.port.call(f.call('new'),signal)).text).status,'not_dispatched');
 const query=callId=>({threadId:'local-thread',turnId:'local-turn',callId,tool:'image_result',arguments:{request_id:out.request_id}});
 const queried=JSON.parse((await tools.port.call(query('query-original'),signal)).text);assert.equal(queried.request_id,out.request_id);assert.equal(queried.status,'unverified_outcome');
 await tools.port.call({...query('foreign-query'),arguments:{request_id:'text_tool_'+'9'.repeat(32)}},signal);
 assert.equal(f.calls.filter(c=>c.name==='image_statistics').length,1);assert.equal(f.calls.filter(c=>c.name==='image_result').length,2);
});
test('cancellation or changed saved scientific bytes cannot dispatch',async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),abort=new AbortController();abort.abort();assert.equal(JSON.parse((await tools.port.call(f.call('cancelled'),abort.signal)).text).status,'not_dispatched');
 writeFileSync(path.join(f.workspace,'objects',f.viewId,'data.npy'),'changed');assert.equal(JSON.parse((await tools.port.call(f.call('changed'),new AbortController().signal)).text).status,'not_dispatched');assert.equal(f.calls.length,0);
});
test('a refused query outside this turn says the original outcome was not checked',async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),reply=JSON.parse((await tools.port.call({threadId:'local-thread',turnId:'local-turn',callId:'old-display',tool:'image_result',arguments:{request_id:'public-joint-readable-display'}},new AbortController().signal)).text);
 assert.equal(reply.status,'not_dispatched');assert.equal(reply.code,'QUERY_OUTSIDE_SESSION');assert.equal(reply.queried_request_outcome,'not_checked');assert.match(reply.meaning,/does NOT mean the original request failed/);assert.equal(reply.request_id,undefined);assert.equal(f.calls.length,0);
});
for(const [name,changeView,changeFrame] of [
 ['frequency view',v=>{v.array_domain='frequency';}],['reciprocal view',v=>{v.array_domain='reciprocal';}],['reciprocal frame',()=>{},v=>{v.array_domain='reciprocal';}],
 ['overlay',v=>{v.annotations=[{kind:'rectangle'}];}],['reprojection',v=>{v.annotation_reprojection=true;}],['wrong frame',v=>{v.panels[0].source_object_id='3'.repeat(32);}],
 ['composite',v=>{v.panels.push({...v.panels[0]});}],['wrong shape',v=>{v.shape_yx=[160,200];}],['out-of-frame support',v=>{v.panels[0].source_rect_xyxy=[25,6,35,14];}],['wrong dtype',v=>{v.dtype='float32';}]
])test('saved scientific scope abstains: '+name,t=>{const f=fixture(t,{changeView,changeFrame});assert.throws(()=>createSavedViewResearchTools(f.options));assert.equal(f.calls.length,0);});
test('another committed crop produces another immutable tool-context identity',t=>{
 const f=fixture(t),one=createSavedViewResearchTools(f.options),v={...f.view,object_id:'4'.repeat(32),request_id:'fixture-other-view',panels:[{...f.view.panels[0],source_rect_xyxy:[15,6,25,14]}]};f.put(v,f.cropBytes);
 const two=createSavedViewResearchTools({...f.options,viewId:v.object_id});assert.notEqual(one.context_sha256,two.context_sha256);assert.deepEqual(one.input_scope.source_rect_xyxy,[5,6,15,14]);
});

function saveStatistics(f,args,rect,{explicitRect=true,reverseKeys=false}={}){
 const id=args.request_id.slice(-32),statistics={sample_count:(rect[2]-rect[0])*(rect[3]-rect[1]),mean:1,stddev:0,minimum:1,maximum:1},payload=JSON.stringify(statistics),directory=path.join(f.workspace,'objects',id);mkdirSync(directory,{recursive:true});
 const value={backend:'external-image-workspace',object_id:id,request_id:args.request_id,kind:'statistics',parent_object_id:f.viewId,coordinate_space:'source_pixels',component:'raw',dtype:'uint16',source_rect_xyxy:rect,statistics,scientific_grid_identity:{source_grid_object_id:f.frameId,shape_yx:f.view.shape_yx,dtype:'uint16',array_sha256:f.view.files_sha256['data.npy'],source_rect_xyxy:[5,6,15,14],coordinate_space:'source_pixels'},files_sha256:{'statistics.json':hash(payload)}};
 const raw=JSON.stringify(value),parameters={action:'statistics',object_id:f.viewId,request_id:args.request_id,workspace:f.workspace,...(explicitRect?{rect}:{})};
 const committed=reverseKeys?Object.fromEntries(Object.entries(parameters).reverse()):parameters;
 writeFileSync(path.join(directory,'object.json'),raw);writeFileSync(path.join(directory,'statistics.json'),payload);writeFileSync(path.join(f.workspace,'requests',args.request_id+'.json'),JSON.stringify({schema_version:1,state:'completed',request_id:args.request_id,parameters:committed,parameters_sha256:hash(canonical(committed)),object_manifest_sha256:hash(raw),response:{ok:true,state:'completed',...value}}));
}
for(const scenario of ['first-explicit','first-default','lost-explicit','lost-default','mutated-dispatch-arguments','query-after-completed'])test('successful journal cannot replace frozen original parameters: '+scenario,async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),signal=new AbortController().signal,wrong=[10,10,13,13],requested=[7,8,10,11],useDefault=scenario.endsWith('default');let writes=0,originalArgs;
 f.options.registry.call=async(name,args)=>{f.calls.push({name,args});if(name==='image_result')return {};writes++;originalArgs=structuredClone(args);
  if(scenario==='mutated-dispatch-arguments')args.rect.splice(0,4,...wrong);
  saveStatistics(f,args,scenario==='query-after-completed'?requested:wrong);
  if(scenario.startsWith('lost-'))throw Error('Synthetic reply loss');return {};
 };
 const call=f.call('identity-original',f.viewId,useDefault?undefined:requested),initial=JSON.parse((await tools.port.call(call,signal)).text);
 let unknown=initial;
 if(scenario==='query-after-completed'){assert.equal(initial.status,'completed');saveStatistics(f,originalArgs,wrong);}
 else assert.equal(initial.status,'unverified_outcome');
 if(scenario.startsWith('lost-')||scenario==='query-after-completed')unknown=JSON.parse((await tools.port.call({threadId:'local-thread',turnId:'local-turn',callId:'query-replaced',tool:'image_result',arguments:{request_id:initial.request_id}},signal)).text);
 assert.equal(unknown.status,'unverified_outcome');assert.equal(unknown.request_id,initial.request_id);
 const next=JSON.parse((await tools.port.call(f.call('blocked-after-mismatch'),signal)).text);assert.equal(next.status,'not_dispatched');assert.equal(next.original_request_id,initial.request_id);assert.equal(writes,1);
});
for(const useDefault of [false,true])test('exact canonical success and original query preserve '+(useDefault?'omitted default support':'explicit rect'),async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),signal=new AbortController().signal;let writes=0;
 f.options.registry.call=async(name,args)=>{f.calls.push({name,args});if(name==='image_statistics'){writes++;saveStatistics(f,args,args.rect??[5,6,15,14],{explicitRect:!useDefault,reverseKeys:true});}return {};};
 const first=JSON.parse((await tools.port.call(f.call('exact-original',f.viewId,useDefault?undefined:[7,8,10,11]),signal)).text);assert.equal(first.status,'completed');assert.deepEqual(first.source_rect_xyxy,useDefault?[5,6,15,14]:[7,8,10,11]);
 const query=JSON.parse((await tools.port.call({threadId:'local-thread',turnId:'local-turn',callId:'query-exact',tool:'image_result',arguments:{request_id:first.request_id}},signal)).text);assert.deepEqual(query,first);assert.equal(writes,1);
});
test('explicit full support is not substituted for an omitted rect parameter',async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),signal=new AbortController().signal;let writes=0;
 f.options.registry.call=async(name,args)=>{if(name==='image_statistics'){writes++;saveStatistics(f,args,[5,6,15,14],{explicitRect:true});}return {};};
 const first=JSON.parse((await tools.port.call(f.call('default-original'),signal)).text);assert.equal(first.status,'unverified_outcome');
 assert.equal(JSON.parse((await tools.port.call(f.call('after-default-change'),signal)).text).status,'not_dispatched');assert.equal(writes,1);
});
for(const resultMatches of [false,true])test('audit snapshots survive in-place provider argument mutation: '+(resultMatches?'exact result':'wrong result'),async t=>{
 const f=fixture(t),tools=createSavedViewResearchTools(f.options),signal=new AbortController().signal,requested=[7,8,10,11],changed=[10,10,13,13],original=f.call('audit-original',f.viewId,requested),file=path.join(f.options.journalDirectory,'tool-audit.json');let writes=0,providerArgs;
 const disk=()=>JSON.parse(readFileSync(file));
 f.options.registry.call=async(name,args)=>{if(name==='image_result')return {};writes++;providerArgs=args;
  assert.deepEqual(disk().find(e=>e.phase==='before_dispatch').arguments.rect,requested,'initial durable intent precedes provider dispatch');
  args.rect.splice(0,4,...changed);saveStatistics(f,args,resultMatches?requested:changed);return {};
 };
 const first=JSON.parse((await tools.port.call(original,signal)).text);assert.equal(first.status,resultMatches?'completed':'unverified_outcome');assert.deepEqual(original.arguments.rect,requested);
 const assertOriginalAudit=()=>{for(const entries of [tools.audit(),disk()])for(const entry of entries.filter(e=>e.phase==='before_dispatch'||e.phase==='completed')){assert.deepEqual(entry.arguments.rect,requested);assert.equal(entry.request_id,first.request_id);}};
 assertOriginalAudit();providerArgs.rect.splice(0,4,5,6,6,7);
 const queried=JSON.parse((await tools.port.call({threadId:'local-thread',turnId:'local-turn',callId:'audit-query',tool:'image_result',arguments:{request_id:first.request_id}},signal)).text);assert.equal(queried.status,first.status);assertOriginalAudit();assert.equal(writes,1);
 const copy=tools.audit();copy.find(e=>e.phase==='before_dispatch').arguments.rect[0]=999;assertOriginalAudit();
 if(!resultMatches){const blocked=JSON.parse((await tools.port.call(f.call('after-audit-mismatch'),signal)).text);assert.equal(blocked.status,'not_dispatched');assert.equal(blocked.original_request_id,first.request_id);assert.equal(writes,1);assertOriginalAudit();}
});
