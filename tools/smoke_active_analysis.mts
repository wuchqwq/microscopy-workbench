// Actual compiled MCP/Python acceptance. Only fixture generation and independent
// evaluation use local code; runtime analysis uses advertised provider tools.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const rows=(v:unknown):Row[]=>{assert.ok(Array.isArray(v));return v.map(row);};
const list=(v:unknown):unknown[]=>{assert.ok(Array.isArray(v));return v;};
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const number=(v:unknown):number=>{assert.ok(typeof v==='number'&&Number.isFinite(v));return v as number;};
const root=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT needs a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'f4-active-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(args:string[])=>{const p=spawnSync(python,['-B',...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});assert.equal(p.status,0,p.stderr||p.error?.message);return p.stdout.trim();};
const absolutePython=execute(['-c','import sys;print(sys.executable)']);
const fixture=path.join(directory,'fixture');execute([path.join(root,'examples','make_active_analysis_trial.py'),fixture]);
const oracle=row(JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8'))),files=row(oracle.files);
const workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,workspace_root:workspaceRoot,structures:false}));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(root,'tools','plugin_server.mjs')});
const first=makeClient(),clients=[first],tag=createHash('sha256').update(directory).digest('hex').slice(0,10);
let sequence=0;const timings:Row[]=[],checks:string[]=[],panels:Row[]=[],started=performance.now();
const report:Row={scope:'Public analytic F4-lite, actual compiled MCP/Python; no oracle in runtime tools',started_utc:new Date().toISOString(),timings,checks,panels,
 not_tested:['actual browser gestures','real specimen accuracy','fresh Agent until separately recorded','physical boundary uncertainty','GPA/twin/dislocation identification']};
const digest=(filename:string)=>createHash('sha256').update(readFileSync(filename)).digest('hex');
const call=async(name:string,args:Row={},client=first):Promise<Row>=>{
 const readonly=['image_info','image_panel_current','analysis_read'].includes(name),requestId=readonly?null:args.request_id??`f4-${tag}-${++sequence}`,t=performance.now();
 try{const reply=await client.tool(name,readonly?args:{...args,request_id:requestId});if(reply.png!==undefined)assert.equal(Buffer.from(text(reply.png),'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');return row(reply.data);}
 finally{timings.push({tool:name,request_id:requestId,elapsed_ms:performance.now()-t});}
};
const objects=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json'))).map(id=>row(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8'))));
const fftCount=()=>objects().filter(o=>o.kind==='fft').length;
const fftHash=(id:string)=>digest(path.join(workspace,'objects',id,'data.npy'));
const peakOptions={min_separation_bins:2,exclude_dc_radius_bins:3,threshold_rel:.18,refinement:'quadratic'};
const initial={rect:[0,0,128,128],window_sizes:[64],stride_xy:[64,64],max_windows:4,coordinate_domain:'pixel',window:'none',subtract_mean:true,max_peaks:16,peak_options:peakOptions,max_size:384};
const map=async(field:Row)=>call('image_domain_map',{object_id:field.object_id,tolerance:.01,angles_degrees:[0,30,45,60,90],max_size:384});
const propose=(mapped:Row,windowBudget=8,pixelBudget=20480,stop=false)=>call('image_analysis_candidates',{object_id:mapped.object_id,budget_windows:windowBudget,budget_fft_pixels:pixelBudget,max_candidates:8,candidate_scales:[32],user_stop:stop});
const sourcePath=(name:string)=>path.join(fixture,text(row(files[name]).path));
const csvCell=(value:unknown)=>{
 if(value===null||value===undefined)return '';
 if(typeof value==='number')return String(value);
 const rendered=typeof value==='object'?JSON.stringify(value):String(value);
 return '"'+rendered.replaceAll('"','""')+'"';
};
function saveTables(benchmark:Row[]):void{
 const columns=['case','strategy','total_windows','total_fft_pixels','B_vector_evidence_count','B_vector_false_positive_count','boundary_count','boundary_bands_intersecting_truth','unknown_fraction','domain_count','elapsed_ms','acceptance_only_negative_ms','stop_reason'];
 const values:unknown[][]=[],observations:unknown[][]=[];
 for(const trial of benchmark)for(const strategy of rows(trial.strategies)){
  const evaluation=row(strategy.evaluation);
  values.push([trial.case,strategy.strategy,strategy.total_windows,strategy.total_fft_pixels,...columns.slice(4,10).map(key=>evaluation[key]),strategy.elapsed_ms,strategy.acceptance_only_negative_ms,strategy.stop?row(strategy.stop).reason:null]);
  for(const sample of rows(evaluation.samples))observations.push([trial.case,strategy.strategy,sample.observation_key,sample.rect_xyxy,sample.scale_pixels,sample.status,sample.B_vector_evidence,sample.true_B_support_fraction]);
 }
 const write=(filename:string,header:string[],body:unknown[][])=>writeFileSync(path.join(directory,filename),[header,...body].map(cells=>cells.map(csvCell).join(',')).join('\n')+'\n');
 write('benchmark.csv',columns,values);
 write('observations.csv',['case','strategy','observation_key','rect_xyxy','scale_pixels','status','B_vector_evidence','true_B_support_fraction'],observations);
}
const open=async(name:string)=>{const source=sourcePath(name),opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});assert.equal(frame.dtype,'float32');return {source,sourceHash:digest(source),frame};};
const uniform=[[16,16,48,48],[80,16,112,48],[16,80,48,112],[80,80,112,112]];
const stratified=()=>{let seed=20261030;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};return [[0,0],[64,0],[0,64],[64,64]].map(([x,y])=>{const a=x!+next()%33,b=y!+next()%33;return [a,b,a+32,b+32];});};
function chooseFine(plan:Row,limit:number):Row[]{
 const actions=rows(plan.actions).filter(a=>a.scale_pixels===32),recommended=list(plan.recommended_action_ids).map(text),ordered=[...actions.filter(a=>recommended.includes(text(a.action_id))),...actions.filter(a=>!recommended.includes(text(a.action_id)))],selected=ordered.slice(0,limit);
 const exploration=actions.find(a=>list(a.reason_codes).some(v=>String(v).toLowerCase().includes('explor')));
 if(exploration&&!selected.some(a=>a.action_id===exploration.action_id)&&selected.length)selected[selected.length-1]=exploration;
 return selected;
}
function evaluate(name:string,field:Row,mapped:Row):Row {
 const expected=list(row(oracle.positive_vectors_cycles_per_pixel).B).map(v=>list(v).map(number));
 const tolerance=number(row(oracle.benchmark).evaluation_vector_tolerance_cycles_per_pixel);
 const observations=rows(field.samples).map(sample=>{
  const families=rows(row(sample.features).families),actual=families.map(f=>list(f.vector_xy).map(number));
  const detected=sample.status==='valid'&&expected.every(q=>actual.some(p=>Math.min(Math.hypot(p[0]!-q[0]!,p[1]!-q[1]!),Math.hypot(p[0]!+q[0]!,p[1]!+q[1]!))<=tolerance));
  const rect=list(sample.rect_xyxy).map(number),truth=list(row(oracle.bounds_B)[name]??[]).map(number);
  const fraction=truth.length?Math.max(0,Math.min(rect[2]!,truth[1]!)-Math.max(rect[0]!,truth[0]!))/(rect[2]!-rect[0]!):0;
  return {observation_key:sample.observation_key??null,rect_xyxy:rect,scale_pixels:sample.scale_pixels,status:sample.status,B_vector_evidence:detected,true_B_support_fraction:fraction};
 });
 const interfaces=list(row(oracle.interfaces_x)[name]??[]).map(number),bands=rows(mapped.boundary_bands);
 return {samples:observations,B_vector_evidence_count:observations.filter(s=>s.B_vector_evidence).length,
  B_vector_false_positive_count:observations.filter(s=>s.B_vector_evidence&&s.true_B_support_fraction===0).length,
  boundary_count:bands.length,boundary_supports:bands.map(b=>b.rect_xyxy),
  boundary_bands_intersecting_truth:bands.filter(b=>{const r=list(b.rect_xyxy).map(number);return interfaces.some(x=>r[0]!<=x&&r[2]!>=x);}).length,
  unknown_fraction:list(mapped.unknown_sample_indices).length/observations.length,domain_count:rows(mapped.domains).length,
  interpretation:'Synthetic reciprocal-vector evidence and finite window supports only, never phase or boundary-precision validation'};
}
async function runStrategy(name:string,frame:Row,strategy:string,rectangles:number[][],matchedCount?:number):Promise<Row>{
 const t=performance.now(),before=fftCount(),field=await call('image_spatial_field',{...initial,object_id:frame.object_id});let current=field,mapped=await map(field),plan:Row|null=null;
 const old=rows(field.samples).map(s=>text(s.fft_object_id)),hashes=old.map(fftHash),steps:Row[]=[];let added=0,protocolNegativeMs=0;
 for(let round=0;round<4&&added<4;round++){
  let picked:Row[]=[],rects:number[][]=[];
  if(strategy==='active'){
   plan=await propose(mapped);if(row(plan.stopping).stop===true)break;
   picked=chooseFine(plan,Math.min(2,4-added));if(!picked.length)break;
  }else{const count=matchedCount??4;rects=rectangles.slice(added,Math.min(added+2,count));if(!rects.length)break;}
  const count=strategy==='active'?picked.length:rects.length,previous=current,priorCount=fftCount();
  current=await call('image_field_extend',strategy==='active'?{object_id:current.object_id,candidate_set_id:plan!.object_id,action_ids:picked.map(a=>a.action_id),max_size:384}:{object_id:current.object_id,rects,source_text:'Preregistered '+strategy+' fixed-budget comparison',max_size:384});
  assert.equal(fftCount()-priorCount,count);assert.equal(rows(current.samples).length,rows(previous.samples).length+count);
  const currentSamples=rows(current.samples),currentIds=currentSamples.map(s=>text(s.fft_object_id));for(const id of old)assert.ok(currentIds.includes(id));assert.deepEqual(old.map(fftHash),hashes);
  for(const saved of rows(previous.samples)){const kept=currentSamples.find(s=>s.fft_object_id===saved.fft_object_id);assert.ok(kept);for(const key of ['rect_xyxy','peaks_object_id','measurement_object_ids','xy_calibration'])assert.deepEqual(kept[key],saved[key]);}
  if(strategy==='active'&&round===0){const checkStart=performance.now(),countBefore=fftCount();await assert.rejects(call('image_field_extend',{object_id:current.object_id,candidate_set_id:plan!.object_id,action_ids:picked.map(a=>a.action_id),max_size:384}));assert.equal(fftCount(),countBefore,'A stale proposal cannot submit new FFTs');protocolNegativeMs+=performance.now()-checkStart;}
  added+=count;mapped=await map(current);
  steps.push({field:current.object_id,map:mapped.object_id,proposal:plan?.object_id??null,added_rects:strategy==='active'?picked.map(a=>a.rect_xyxy):rects,added_windows:count});
 }
 if(strategy==='active')plan=await propose(mapped);
 if(strategy==='active')assert.equal(row(plan!.stopping).stop,true,'The finite active loop must return an explicit stop instead of silently ending');
 const actual=rows(current.samples).reduce((sum,s)=>{const r=list(s.rect_xyxy).map(number);return sum+(r[2]!-r[0]!)*(r[3]!-r[1]!);},0);
 assert.equal(fftCount()-before,4+added);assert.equal(actual,16384+1024*added);
 return {strategy,field:current.object_id,map:mapped.object_id,initial_field:field.object_id,initial_fft_ids:old,initial_fft_hashes:hashes,added_windows:added,total_windows:4+added,total_fft_pixels:actual,
  elapsed_ms:performance.now()-t,acceptance_only_negative_ms:protocolNegativeMs,steps,stop:plan?.stopping??null,proposal:plan?.object_id??null,evaluation:evaluate(name,current,mapped)};
}
async function present(objectId:unknown):Promise<void>{
 let panel:Row;
 if(!panels.length){
  panel=await call('image_panel_open',{object_id:objectId});const connection=row(JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',text(panel.panel_id)+'.json'),'utf8')));
  panels.push({panel_id:panel.panel_id,url:panel.panel_url,pid:connection.pid});assert.equal((await fetch(text(panel.panel_url))).status,200);
 }else{
  panel=panels[0]!;const current=row((await call('image_panel_current',{panel_id:panel.panel_id})).view);
  await call('image_panel_show',{panel_id:panel.panel_id,object_id:objectId,expected_object_id:row(current.object).object_id,draft_revision:row(current.edit_state).draft_revision});
 }
 const raw=row(await first.rpc('tools/call',{name:'image_panel_current',arguments:{panel_id:panel.panel_id}})),contents=rows(row(raw.result).content),images=contents.filter(p=>p.type==='image');assert.ok(images.length>=1);for(const image of images)assert.equal(Buffer.from(text(image.data),'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const state=row(JSON.parse(text(contents.find(c=>c.type==='text')!.text))),view=row(state.view);assert.equal(row(view.domain_evidence).object_id,objectId);
}

try{
 await first.rpc('initialize');const catalog=rows(row(row(await first.rpc('tools/list')).result).tools).map(t=>t.name);
 for(const name of ['image_analysis_candidates','image_field_extend','image_domain_map','analysis_read'])assert.ok(catalog.includes(name));
 const benchmark:Row[]=[];report.benchmark=benchmark;
 for(const name of ['boundary','narrow-f1-crop','narrow-offset-right']){
  const input=await open(name),active=await runStrategy(name,input.frame,'active',[]),count=number(active.added_windows);
  if(name==='boundary'){await present(rows(active.steps)[0]?.proposal??active.proposal);await present(active.field);}
  assert.ok(name!=='boundary'||count>0,'A usable differing-domain input must permit at least one actual follow-up');
  const even=await runStrategy(name,input.frame,'uniform',uniform,count),random=await runStrategy(name,input.frame,'seeded_stratified',stratified(),count);
  for(const result of [even,random]){assert.equal(result.total_windows,active.total_windows);assert.equal(result.total_fft_pixels,active.total_fft_pixels);}
  assert.equal(digest(input.source),input.sourceHash);
  benchmark.push({case:name,source_sha256:input.sourceHash,budget_cap:{windows:8,fft_pixels:20480},actual_matched_budget:{windows:active.total_windows,fft_pixels:active.total_fft_pixels},strategies:[active,even,random],
   interpretation:'Initial and every added FFT charged; if active stops early baselines match its actual spend. No claim of universal detection or speedup.'});
  saveTables(benchmark);
 }
 const controls:Row[]=[];report.controls=controls;
 for(const name of ['single','noise','square']){
  const input=await open(name),field=await call('image_spatial_field',{...initial,object_id:input.frame.object_id,max_peaks:name==='noise'?4:16}),mapped=await map(field),before=fftCount();
  const plan=await propose(mapped,8,20480);assert.equal(fftCount(),before,'Proposal is not scientific FFT execution');
  if(name==='single'||name==='noise')assert.equal(rows(mapped.boundary_bands).length,0);
  const stopped=await propose(mapped,4,16384);assert.equal(row(stopped.stopping).stop,true);
  const userStop=await propose(mapped,8,20480,true);assert.equal(row(userStop.stopping).stop,true);assert.equal(fftCount(),before);
  controls.push({case:name,field:field.object_id,map:mapped.object_id,proposal:plan.object_id,stopping:plan.stopping,window_budget_stop:stopped.stopping,user_stop:userStop.stopping,evaluation:evaluate(name,field,mapped)});
 }
 const active=rows(row(benchmark[0]).strategies)[0]!;let savedField=await call('image_info',{object_id:active.field}),savedMap=await call('image_info',{object_id:active.map});
 const correctionSample=rows(savedField.samples)[0]!,oldMeasurements=list(correctionSample.measurement_object_ids).map(text);assert.ok(oldMeasurements.length);
 const oldMeasurement=await call('image_info',{object_id:oldMeasurements[0]}),points=list(oldMeasurement.points).map(p=>list(p).map(number));
 const oldMeasurementManifest=path.join(workspace,'objects',text(oldMeasurement.object_id),'object.json'),oldMeasurementHash=digest(oldMeasurementManifest),beforeCorrection=fftCount();
 points[1]=[points[1]![0]!+.003,points[1]![1]!];
 const corrected=await call('image_remeasure',{object_id:correctionSample.view_object_id,measurement_object_id:oldMeasurement.object_id,points,source_text:'Explicit public synthetic measurement correction, not a physical interpretation'});
 const correctedField=await call('image_field_extend',{object_id:savedField.object_id,rects:[],measurement_overrides:[{observation_key:correctionSample.observation_key,measurement_object_ids:[corrected.object_id,...oldMeasurements.slice(1)]}],max_size:384});
 assert.equal(fftCount(),beforeCorrection);assert.equal(digest(oldMeasurementManifest),oldMeasurementHash);
 const revisedSample=rows(correctedField.samples).find(s=>s.observation_key===correctionSample.observation_key);assert.ok(revisedSample);assert.equal(list(revisedSample.measurement_object_ids)[0],corrected.object_id);assert.equal(revisedSample.fft_object_id,correctionSample.fft_object_id);assert.equal(revisedSample.peaks_object_id,correctionSample.peaks_object_id);
 savedField=correctedField;savedMap=await map(savedField);const savedPlan=await propose(savedMap);
 report.measurement_revision={corrected_measurement:corrected.object_id,field:savedField.object_id,map:savedMap.object_id,old_measurement_manifest_unchanged:true,new_fft_count:0};
 const sourceHashes=rows(savedField.samples).map(s=>({id:text(s.fft_object_id),hash:fftHash(text(s.fft_object_id))})),beforeRecovery=fftCount();
 const duplicate=list(rows(savedField.samples)[0]!.rect_xyxy);
 await assert.rejects(call('image_field_extend',{object_id:savedField.object_id,rects:[duplicate],source_text:'Duplicate refusal acceptance'}));assert.equal(fftCount(),beforeRecovery);
 const exports:Row[]=[];
 for(const [role,value]of [['field',savedField],['domains',savedMap]] as const){const exported=await call('image_export',{object_id:value.object_id,output_dir:path.join(directory,role+'-export')});for(const [name,digestValue]of Object.entries(row(exported.exported_files_sha256)))assert.equal(digest(path.join(text(exported.output_dir),name)),digestValue);exports.push({...exported,source_role:role});}
 report.exports=exports;
 const analysisId=`public-f4-${tag}`,created=await call('analysis_create',{analysis_id:analysisId,reason:'Public synthetic active-analysis acceptance'});let revision=number(row(created.context).revision);
 const frameId=row(rows(savedField.samples)[0]!.frame_identity).frame_object_id;
 for(const selections of [{experiment:{provider:'image',object_id:frameId},spatial_field:{provider:'image',object_id:savedField.object_id}},{domains:{provider:'image',object_id:savedMap.object_id}},{active_plan:{provider:'image',object_id:savedPlan.object_id}}]){
  const updated=await call('analysis_update',{analysis_id:analysisId,expected_revision:revision,selections,reason:'Keep the exact active-analysis references'});revision=number(row(updated.context).revision);
 }
 await present(savedPlan.object_id);
 const fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');const restored=await call('analysis_read',{analysis_id:analysisId},fresh);assert.equal(row(restored.context).revision,revision);
 const recovered=await call('image_result',{request_id:savedField.request_id},fresh);assert.equal(recovered.object_id,savedField.object_id);
 assert.equal(fftCount(),beforeRecovery);for(const source of sourceHashes)assert.equal(fftHash(source.id),source.hash);
 checks.push('Formal proposals execute explicit additions; matched scientific budgets and source/FFT identity are audited; original request and named context recover without new FFTs; exports and actual MCP PNGs returned');
 report.references={field:savedField.object_id,domains:savedMap.object_id,proposal:savedPlan.object_id,analysis_id:analysisId};
 report.actual_cost={fft_objects:fftCount(),fft_pixels_all_operations:objects().filter(o=>o.kind==='fft').reduce((sum,o)=>sum+list(o.shape_yx).map(number).reduce((a,b)=>a*b,1),0),formal_calls:timings.length,
  decision_ms:timings.filter(t=>t.tool==='image_analysis_candidates').reduce((sum,t)=>sum+number(t.elapsed_ms),0),elapsed_ms:performance.now()-started,
  worker_startup:'Not separated by this client; inclusive tool times are not additive provider phases'};
 report.result='PASS';report.completed_utc=new Date().toISOString();writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('PASS: compiled F4-lite candidates -> explicit additions -> domain updates -> bounded stop, matched-budget comparisons, export and new-session recovery.');
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.elapsed_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw error;}
finally{for(const client of clients)await client.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;if(!retained)for(const panel of panels){try{process.kill(number(panel.pid));}catch{}}console.log('Public evidence: '+path.join(directory,'report.json'));}
