// Recovery/transport contracts with an explicit provider stub. Actual browser
// and scientific-worker reopen evidence is recorded separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {createImagePanel} from '../tools/image_panel.mjs';
import {startResearcherInspector} from '../tools/researcher_inspector.mjs';
import {DataProbes} from '../ui/image-panel/data-probes.mjs';
const id=n=>n.toString(16).padStart(32,'0'),V=id(1),F=id(2),T=id(3),P=id(4),S=id(5),E=id(6),clone=value=>structuredClone(value);
const grid={source_grid_object_id:F,array_sha256:'a'.repeat(64),shape_yx:[3,4],dtype:'uint16',source_rect_xyxy:[0,0,4,3],coordinate_space:'source_pixels'},cal={calibration_id:id(7),revision:1,status:'active',coordinate_domain:'real_space',xy_scale:{x:.2,y:-.3,unit:'nm'}};
function provider(){
 const calls=[],objects=new Map(),base={ok:true,state:'completed',backend:'external-image-workspace'};
 const view={...base,object_id:V,request_id:'saved-view',kind:'view',parent_object_id:F,scientific_grid_identity:clone(grid),xy_calibration:clone(cal),dtype:'uint16',panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,4,3],image_rect_xyxy:[0,0,4,3]}],display:{gamma:1,display_range:[0,100],scale_bar:false},annotations:[]};
 objects.set(V,view);objects.set(F,{...base,object_id:F,request_id:'saved-frame',kind:'frame',source_object_id:T,frame_index:0});
 const make=(kind,request_id)=>kind==='statistics'?{...base,object_id:S,request_id,kind,parent_object_id:V,scientific_grid_identity:clone(grid),xy_calibration:clone(cal),component:'raw',statistics:{sample_count:4,mean:7,stddev:2,minimum:4,maximum:10}}:{...base,object_id:P,request_id,kind,parent_object_id:V,scientific_grid_identity:clone(grid),xy_calibration:clone(cal),component:'raw',dtype:'uint16',distance_unit:'pixel',physical_distance_unit:'nm',sampling:{sample_count:2,line_width:1,interpolation:'nearest'},samples:{coordinates_xy:[[0,0],[1,0]],indices_xy:[[0,0],[1,0]],distance:[0,1],physical_distance:[0,.2],value:[4,10]}};
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_statistics','image_profile','image_export'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){calls.push({name,args:clone(args)});if(name==='image_info'){if(!objects.has(args.object_id))throw new Error('Saved object unavailable');const value=clone(objects.get(args.object_id));return {data:value,...(value.object_id===V?{png:'iVBORw0KGgo='}:{})};}if(name==='image_statistics'||name==='image_profile'){const value=make(name==='image_profile'?'profile':'statistics',args.request_id);objects.set(value.object_id,clone(value));return {data:value};}if(name==='image_export')return {data:{...base,kind:'export',object_id:E,request_id:args.request_id,output_dir:args.output_dir}};assert.fail('Unexpected write/recovery '+name);},async close(){}});
 return {calls,objects,client,make};
}
const refs=(profileRequest='profile-original',statsRequest='statistics-original')=>({profile:{object_id:P,request_id:profileRequest},statistics:{object_id:S,request_id:statsRequest}});
async function open(directory,f,options={}){return createImagePanel({workspace:directory,python:process.execPath,object_id:V,client:f.client(),...options});}
async function action(panel,action,params){const origin=panel.url.split('/#')[0],response=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expected_object_id:panel.state().object.object_id,draft_revision:panel.state().edit_state.draft_revision,action,params})}),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
test('latest statistics and profile persist as two references and reopen read-only after another last operation',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'numeric-reopen-')),f=provider();let panel,reopened;
 try{
  panel=await open(directory,f);const p=panel.state().object.panels[0],pick=(kind,coordinates)=>({kind,coordinates,panel:p,source_object_id:F,coordinate_space:'source_pixels'});
  const profile=(await action(panel,'profile',{selection:pick('line',[0,0,1,0]),sample_count:2})).last_operation,statistics=(await action(panel,'statistics',{selection:pick('rectangle',[0,0,2,2])})).last_operation;
  await action(panel,'export',{});assert.equal(panel.state().last_operation.kind,'export');const journal=panel.journal;await panel.close();panel=null;
  const file=path.join(journal,'current-selection.json'),before=readFileSync(file),saved=JSON.parse(before);
  assert.deepEqual(saved.numeric_result_refs,{statistics:{object_id:S,request_id:statistics.request_id},profile:{object_id:P,request_id:profile.request_id}});assert.deepEqual(Object.keys(saved.numeric_result_refs).sort(),['profile','statistics']);assert.ok(Object.values(saved.numeric_result_refs).every(value=>Object.keys(value).sort().join(',')==='object_id,request_id'));
  const count=f.calls.length;reopened=await open(directory,f,{numeric_result_refs:saved.numeric_result_refs});const state=reopened.state();assert.equal(state.object.object_id,V);assert.equal(state.last_operation,null);assert.deepEqual(state.numeric_results.profile,profile);assert.deepEqual(state.numeric_results.statistics,statistics);assert.equal(state.numeric_result_recovery.state,'completed');assert.ok(f.calls.slice(count).every(call=>call.name==='image_info'),'reopen cannot resubmit a numeric operation');assert.deepEqual(readFileSync(file),before,'new panel cannot backfill the previous journal');
  assert.deepEqual(JSON.parse(readFileSync(path.join(reopened.journal,'current-selection.json'))).numeric_result_refs,saved.numeric_result_refs);
  for(const changed of ['same','calibration','grid']){const current=clone(state);if(changed==='calibration')current.object.xy_calibration={...cal,calibration_id:id(99),revision:2};if(changed==='grid')current.object.scientific_grid_identity={...grid,array_sha256:'b'.repeat(64)};const probes=new DataProbes({document:null,getState:()=>current,api:()=>assert.fail('Restoring results is not a new read')});probes.refreshCurrent();probes.restoreSavedResults(state.numeric_results);assert.equal(probes.profile?.object_id??null,changed==='same'?P:null,'old physical axes cannot be restored as current');}
 }finally{await panel?.close();await reopened?.close();rmSync(directory,{recursive:true,force:true});}
});
test('numeric recovery rejects wrong object, kind, original request, unfinished state or missing records without retry',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'numeric-refusal-'));
 try{for(const change of ['object','kind','request','state','missing','bad-reference']){const f=provider(),reference=refs();f.objects.set(S,f.make('statistics','statistics-original'));f.objects.set(P,f.make('profile','profile-original'));if(change==='object')f.objects.get(P).object_id=id(98);if(change==='kind')f.objects.get(P).kind='measure';if(change==='request')f.objects.get(P).request_id='different-original';if(change==='state')f.objects.get(P).state='pending';if(change==='missing')f.objects.delete(P);if(change==='bad-reference')reference.profile.object_id='../forbidden';let panel;try{panel=await open(directory,f,{numeric_result_refs:reference});const state=panel.state();assert.equal(state.object.object_id,V);assert.equal(state.numeric_results.profile,null);assert.equal(state.numeric_results.statistics.object_id,S);assert.equal(state.numeric_result_recovery.state,'partial');assert.equal(state.numeric_result_recovery.results.profile.state,'unavailable');assert.ok(f.calls.every(call=>call.name==='image_info'));if(change==='bad-reference')assert.ok(!f.calls.some(call=>call.args.object_id==='../forbidden'));}finally{await panel?.close();}}}
 finally{rmSync(directory,{recursive:true,force:true});}
});
test('a legacy snapshot without separate refs is explicit and never searches for a guessed latest result',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'numeric-legacy-')),f=provider();let panel;
 try{f.objects.set(P,f.make('profile','old-scientific-result'));panel=await open(directory,f,{numeric_result_refs:null});assert.equal(panel.state().numeric_result_recovery.state,'legacy_missing_refs');assert.deepEqual(panel.state().numeric_results,{statistics:null,profile:null});assert.ok(f.calls.every(call=>call.name==='image_info'&&[V,F].includes(call.args.object_id)));}
 finally{await panel?.close();rmSync(directory,{recursive:true,force:true});}
});
test('researcher inspector forwards only previous snapshot refs to its new journal and leaves the old snapshot intact',async()=>{
 for(const legacy of [false,true]){
  const directory=mkdtempSync(path.join(tmpdir(),'inspector-numeric-')),source=path.join(directory,'public-placeholder.tiff'),session=id(50),run=id(51),inspector=path.join(directory,'researcher-inspector'),oldJournal=path.join(inspector,'panels',run,'journal');let instance;
  try{writeFileSync(source,'explicit public fixture placeholder; no decoding in this port test');mkdirSync(oldJournal,{recursive:true});const write=(file,value)=>writeFileSync(file,JSON.stringify(value));write(path.join(inspector,'session.json'),{schema_version:1,workspace:realpathSync(directory),source_path:realpathSync(source),session_id:session,initial_frame:1});write(path.join(inspector,'latest-panel.json'),{schema_version:1,session_id:session,run_id:run});const snapshot={schema_version:1,object_id:V,edit_state:{dirty:false},last_operation:{kind:'profile',object_id:P,request_id:'must-not-infer-from-last-operation'},...(legacy?{}:{numeric_result_refs:refs()})},snapshotPath=path.join(oldJournal,'current-selection.json');write(snapshotPath,snapshot);const before=readFileSync(snapshotPath),calls=[];let received;
   instance=await startResearcherInspector({workspace:directory,python:process.execPath},{createClient:()=>({async rpc(){return {result:{}};},async tool(name,args){calls.push({name,args});assert.equal(name,'image_info');assert.equal(args.object_id,V);return {data:{object_id:V}};},async close(){}}),openPanel:async options=>{received=options;return {state:()=>({numeric_result_recovery:{state:legacy?'legacy_missing_refs':'completed'}}),async close(){}};}});
   assert.equal(instance.resumed,true);assert.deepEqual(received.numeric_result_refs,legacy?null:refs());assert.notEqual(received.journalDirectory,oldJournal);assert.deepEqual(readFileSync(snapshotPath),before);assert.equal(instance.numeric_result_recovery.state,legacy?'legacy_missing_refs':'completed');assert.equal(calls.length,1);
  }finally{await instance?.close();rmSync(directory,{recursive:true,force:true});}
 }
});
