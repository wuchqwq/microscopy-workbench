import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';
import {createScientificContextBindings} from '../lib/analysis_context_bindings.mjs';
import {requiredContextDependencies,AnalysisContext} from '../lib/runtime/analysis_context.mjs';
import {FileContextStore} from '../lib/runtime/file_context_store.mjs';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const id='a'.repeat(32);
test('bounded multiscale tools register and reject invalid contracts before provider dispatch',async()=>{
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 for(const name of ['image_spatial_field','image_domain_map'])assert.ok(registry.listTools().some(tool=>tool.name===name));
 const field={object_id:id,window_sizes:[32,64],stride_xy:[32,32],max_windows:32,coordinate_domain:'pixel',request_id:'spatial-field'};
 for(const patch of [{request_id:undefined},{window_sizes:[]},{window_sizes:[3]},{window_sizes:[1025]},{window_sizes:[4,8,16,32,64]},{stride_xy:[0,32]},{stride_xy:[32]},{max_windows:33},{coordinate_domain:'auto'},{measurement_overrides:[{sample_index:32,measurement_object_ids:[id]}]},{workspace:'other'}])await assert.rejects(registry.call('image_spatial_field',{...field,...patch}));
 const map={object_id:id,tolerance:.005,angles_degrees:[0,30],request_id:'map'};
 for(const patch of [{request_id:undefined},{tolerance:0},{tolerance:Infinity},{angles_degrees:[]},{angles_degrees:Array(65).fill(0)},{mirror:true},{phase:'diamond'}])await assert.rejects(registry.call('image_domain_map',{...map,...patch}));
 assert.equal(calls.length,0);await registry.call('image_spatial_field',field);await registry.call('image_domain_map',map);assert.equal(calls.length,2);
});
test('spatial field/domain context bindings reject source substitution and obsolete correction records',async()=>{
 const binding=createScientificContextBindings({providers:{}}),calibration={calibration_id:'scale',revision:1};
 const active=(objectId,scientific={})=>({status:'active',ref:{objectId},proof:{scientific}});
 const entry={ref:{provider:'external-image-workspace'},proof:{scientific:{sourceId:id,calibrations:[calibration],measurementIds:['measure-new']}},dependsOn:{experiment:'fingerprint'}};
 await binding.validateBindings({slot:'spatial_field',entry,slots:{experiment:active(id),calibration:active('cal',{calibration}),measurements:[active('measure-new')]}});
 await assert.rejects(binding.validateBindings({slot:'spatial_field',entry,slots:{experiment:active('other')}}),/different immutable source/);
 await assert.rejects(binding.validateBindings({slot:'spatial_field',entry,slots:{calibration:active('cal',{calibration:{...calibration,revision:2}})}}),/different selected calibration/);
 await assert.rejects(binding.validateBindings({slot:'spatial_field',entry,slots:{points:[active('unincorporated-correction')]}}),/selected corrected measurement/);
 await binding.validateBindings({slot:'domains',entry:{...entry,dependsOn:{spatial_field:'hash'}},slots:{spatial_field:active(id)}});
 await assert.rejects(binding.validateBindings({slot:'domains',entry,slots:{spatial_field:active(id)}}),/bind the selected source/);
 assert.deepEqual(requiredContextDependencies('domains',{spatial_field:active(id)}).required,['spatial_field']);
});
test('display revisions preserve spatial fields; point correction stales field and domains without staling FFT',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'spatial-context-'));
 try {
  const provider='fixture',scope={provider,workspace:'bounded',session:'stable'};
  const context=new AnalysisContext({store:new FileContextStore({directory}),resolveReference:async ref=>({manifestHash:(ref.objectId==='new'?'b':'a').repeat(64),kind:'fixture',roles:['fft','display','points','spatial_field','domains']}),validateBindings:async()=>{}});
  const ref=objectId=>({...scope,objectId});
  await context.create({analysisId:'field-correction',requestId:'create',reason:'independent contract fixture'});
  await context.commit({analysisId:'field-correction',expectedRevision:1,reason:'select saved evidence',changes:{fft:{ref:ref('fft')},spatial_field:{ref:ref('field')}}});
  const selected=await context.read('field-correction');
  await context.commit({analysisId:'field-correction',expectedRevision:2,reason:'bind derived candidates',changes:{domains:{ref:ref('domains'),dependsOn:{spatial_field:selected.fingerprints.spatial_field}}}});
  await context.commit({analysisId:'field-correction',expectedRevision:3,reason:'display only',changes:{display:{ref:ref('display'),dependsOn:{fft:selected.fingerprints.fft}}}});
  let saved=await context.read('field-correction');assert.equal(saved.slots.spatial_field.status,'active');assert.equal(saved.slots.domains.status,'active');
  await context.commit({analysisId:'field-correction',expectedRevision:4,reason:'new committed point',changes:{points:[{ref:ref('new'),dependsOn:{fft:selected.fingerprints.fft}}]}});
  saved=await context.read('field-correction');assert.equal(saved.slots.spatial_field.status,'stale');assert.equal(saved.slots.domains.status,'stale');assert.equal(saved.slots.fft.status,'active');
 }finally {assert.equal(path.dirname(directory),path.resolve(tmpdir()));rmSync(directory,{recursive:true,force:true});}
});
test('maximum32-window512-measurement proof fits the existing context budget and retains exact membership',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'spatial-proof-'));
 try {
  const scope={provider:'external-image-workspace',workspace:directory,session:'fixture'},ref={...scope,objectId:id};
  const ids=Array.from({length:512},(_,i)=>(i+1).toString(16).padStart(32,'0'));
  const saved={backend:scope.provider,kind:'spatial_field',object_id:id,parent_object_id:'b'.repeat(32),samples:Array.from({length:32},(_,i)=>({measurement_object_ids:ids.slice(i*16,i*16+16),xy_calibration:{calibration_id:'c'.repeat(32),revision:1,status:'active',source:'user_statement'}}))};
  const file=path.join(directory,'object.json');writeFileSync(file,JSON.stringify(saved));
  const binding=createScientificContextBindings({providers:{image:{workspace:directory,requestScope:scope,call(){return {content:[{type:'text',text:JSON.stringify({...saved,manifest_path:file})}]};}}}});
  const proof=await binding.resolveReference(ref);assert.ok(Buffer.byteLength(JSON.stringify(proof))<16384);assert.equal(proof.scientific.calibrations.length,1);
  const entry={ref,proof,dependsOn:{},status:'active',staleBecause:[]};
  const selected=objectId=>({ref:{...scope,objectId},status:'active',proof:{scientific:{}}});
  for(const measurement of [ids[0],ids[255],ids[511]])await binding.validateBindings({slot:'spatial_field',entry,slots:{measurements:[selected(measurement)]}});
  await assert.rejects(binding.validateBindings({slot:'spatial_field',entry,slots:{measurements:[selected('f'.repeat(32))]}}),/selected corrected measurement/);
  const malformed={...entry,proof:{...proof,scientific:{...proof.scientific,measurementIdsBase64:'not base64'}}};
  await assert.rejects(binding.validateBindings({slot:'spatial_field',entry:malformed,slots:{measurements:[selected(ids[0])]}}),/identity encoding/);
  const context=new AnalysisContext({store:new FileContextStore({directory:path.join(directory,'contexts')}),...binding});
  await context.create({analysisId:'maximum-field',reason:'bounded proof fixture',initialRefs:{spatial_field:{ref}}});
  assert.equal((await context.read('maximum-field')).slots.spatial_field.status,'active');
 }finally {assert.equal(path.dirname(directory),path.resolve(tmpdir()));rmSync(directory,{recursive:true,force:true});}
});
