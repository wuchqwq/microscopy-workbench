// Public analytic MCP/Python acceptance of the first bounded cross-method loop.
// No private specimen, ordinary model, browser, GMS, DM, or material confirmation.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
type Cost={method_calls:number;fft_pixels:number;gpa_band_pixels:number;topology_path_samples:number};
type Attempt={tool:string;request_id:string;reserved:Cost;elapsed_ms:number;state:string;object_id?:unknown;error?:string};
const row=(value:unknown):Row=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const rows=(value:unknown):Row[]=>{assert.ok(Array.isArray(value));return value.map(row);};
const id=(value:unknown):string=>{assert.equal(typeof value,'string');assert.match(value as string,/^[a-f0-9]{32}$/);return value as string;};
const text=(value:unknown):string=>{assert.equal(typeof value,'string');return value as string;};
const ZERO:Cost={method_calls:0,fft_pixels:0,gpa_band_pixels:0,topology_path_samples:0};
const CAP:Cost={method_calls:2,fft_pixels:0,gpa_band_pixels:131072,topology_path_samples:5328};
const GPA_COST:Cost={method_calls:1,fft_pixels:0,gpa_band_pixels:131072,topology_path_samples:0};
const TOPOLOGY_COST:Cost={method_calls:1,fft_pixels:0,gpa_band_pixels:0,topology_path_samples:5328};
const add=(left:Cost,right:Cost):Cost=>Object.fromEntries(Object.keys(ZERO).map(key=>[key,left[key as keyof Cost]+right[key as keyof Cost]])) as Cost;
const cost=(value:unknown):Cost=>{const r=row(value);for(const key of Object.keys(ZERO)){assert.ok(Number.isInteger(r[key])&&Number(r[key])>=0,`Invalid cost ${key}`);}return r as Cost;};
const bounded=(value:Cost)=>{for(const key of Object.keys(CAP))assert.ok(value[key as keyof Cost]<=CAP[key as keyof Cost],`Over cap: ${key}`);};
const repo=fileURLToPath(new URL('../',import.meta.url));
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must name a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'method-loop-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(code:string,args:string[]=[]):string=>{const result=spawnSync(candidate,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});if(result.error)throw result.error;assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
const python=execute('import sys;print(sys.executable)');
const versions=JSON.parse(execute('import sys,json,numpy,scipy,skimage;print(json.dumps(dict(python=sys.version,numpy=numpy.__version__,scipy=scipy.__version__,scikit_image=skimage.__version__)))')) as unknown;
const oracle=row(JSON.parse(execute(String.raw`
import sys,json,pathlib,numpy as np,tifffile
sys.path.insert(0,sys.argv[1]);import create_topology_fixtures as fixture
d=pathlib.Path(sys.argv[2])
cases={'positive':fixture.volterra_fixture(),'smooth_hotspot':fixture.null_fixture(),'noise':fixture.noise_fixture(),'contrast_vortex':fixture.contrast_vortex_fixture()}
assert np.array_equal(cases['positive']['image'],cases['contrast_vortex']['image'])
assert not cases['contrast_vortex']['true_material_displacement_pixel_xy'].any()
for name,case in cases.items():tifffile.imwrite(d/(name+'.tiff'),case['image'].astype(np.float32),metadata=None)
print(json.dumps(dict(g=fixture.G_VECTORS.tolist(),sigma=fixture.MASK_SIGMA,reference_rect=fixture.REFERENCE_RECT,loops=fixture.NESTED_LOOPS,tolerances=fixture.TOLERANCES,truth={'positive':{'winding':[-1,0,-1],'b_pixel_xy':[8,0]},'smooth_hotspot':{'winding':[0,0,0],'single_valued':True},'noise':{'seed':20261030,'no_projected_evidence_on_preregistered_paths':True},'contrast_vortex':{'winding':[-1,0,-1],'material_b_pixel_xy':[0,0],'same_intensities_as_positive':True}},scope='Prescribed analytic image-model truth; no production topology solver imported and no real-specimen material truth')))
`,[path.join(repo,'tools'),directory])));
writeFileSync(path.join(directory,'oracle.json'),JSON.stringify(oracle,null,2));
const workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images'),config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workspaceRoot,structures:false},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const clients=[makeClient()],first=clients[0],started=performance.now(),timings:Row[]=[],checks:string[]=[],benchmark:Row[]=[];
const report:Row={started_utc:new Date().toISOString(),scope:'Actual public Plugin MCP stdio and independent Python; first saved-plan fixed-g GPA to raw wrapped-phase topology loop',versions,oracle,budget_cap:CAP,checks,timings,benchmark,not_tested:['fresh ordinary model/researcher session','browser or GUI gestures','real specimen or material-defect accuracy','GMS/DM/vendor/hardware','lost-response/cancellation injection','general noise discrimination','active-strategy universal superiority','unique conventional 3D Burgers vector']};
let serial=0;
const call=async(name:string,args:Row={},client=first)=>{const request_id=typeof args.request_id==='string'?args.request_id:name==='image_info'?`read-${String(args.object_id)}`:`method-smoke-${++serial}`,t=performance.now();let state='unknown',error:string|undefined;try{const result=await client.tool(name,name==='image_info'?args:{...args,request_id});if(result.png)assert.equal(Buffer.from(text(result.png),'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');state='completed';return result;}catch(caught){state='failed_or_unknown';error=caught instanceof Error?caught.message:String(caught);throw caught;}finally{timings.push({tool:name,request_id,state,elapsed_ms:performance.now()-t,...(error?{error}:{})});}};
const data=async(name:string,args:Row={},client=first)=>row((await call(name,args,client)).data);
const digest=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const objects=()=>existsSync(path.join(workspace,'objects'))?readdirSync(path.join(workspace,'objects')).filter(value=>existsSync(path.join(workspace,'objects',value,'object.json'))):[];
const metadata=(object_id:string)=>row(JSON.parse(readFileSync(path.join(workspace,'objects',object_id,'object.json'),'utf8')));
const fftCount=()=>objects().filter(value=>metadata(value).kind==='fft').length;
const snapshot=(object_id:string)=>Object.fromEntries(readdirSync(path.join(workspace,'objects',object_id)).map(name=>[name,digest(path.join(workspace,'objects',object_id,name))]));
const g=oracle.g as number[][];
const loops=(oracle.loops as number[][]).map((rect,index)=>({rect,orientation:'positive_image_xy',loop_id:index?'outer':'inner'}));
const assumption='Public synthetic prescribed continuum or contrast-coefficient texture. Geometric phase is conditional on the image model; redundant phase winding cannot confirm a material dislocation. Positive image XY closure is an analytic control, not experimental calibration.';
const options={source_domain:'real_space_lattice',source_domain_text:'Public analytic real scalar spatial lattice texture; not diffraction intensity or reconstruction phase.',mask_sigma:oracle.sigma,reference_rect:oracle.reference_rect,reference_mode:'fixed_g',reference_text:'Synthetic prescribed carrier waves and explicit reference patch fix the GPA gauge; not experimental strain-free calibration.',amplitude_floor_relative:.05,max_size:512};
const information={goal:'projected_topology',followup_g_vectors:[g[0],g[2]],followup_basis:'Explicit analytic third nonharmonic reflection from fixture G_VECTORS; no automatic reflection selection or material identification.',loops,model_assumption_text:assumption};
const scientificFlags=(saved:Row)=>{assert.equal(saved.interpretation_status,'hypothesized');assert.equal(saved.material_dislocation_confirmed,false);assert.equal(saved.burgers_3d_unique,false);assert.equal(saved.fft_recomputed,false);assert.equal(saved.gpa_recomputed,false);assert.equal(saved.source_arrays_modified,false);};
const source=async(name:string)=>{const file=path.join(directory,name+'.tiff'),sha256=digest(file),opened=await data('image_open',{source_path:file}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0}),fft=await data('image_fft',{object_id:frame.object_id,rect:[0,0,256,256],window:'none',subtract_mean:true}),seed=await data('image_gpa',{object_id:fft.object_id,...options,g_vectors:[g[0],g[1]]});assert.equal(digest(file),sha256);return {file,sha256,opened,frame,fft,seed};};
type Input=Awaited<ReturnType<typeof source>>;
const verifyTopology=(name:string,saved:Row)=>{scientificFlags(saved);const result=row(saved.report);if(name==='positive'||name==='contrast_vortex'){assert.equal(result.status,'projected_topological_evidence');assert.equal(result.reflection_count,3);assert.equal(row(result.projected_burgers).redundancy_validated,true);const tolerance=Number(row(oracle.tolerances).burgers_pixel_xy_max_abs_error);assert.ok((row(result.projected_burgers).b_pixel_xy as number[]).every((value,index)=>Math.abs(value-[8,0][index])<=tolerance));for(const loop of rows(result.loops))assert.deepEqual(rows(loop.reflections).map(reflection=>reflection.canonical_winding_integer),[-1,0,-1]);}else if(name==='smooth_hotspot'){assert.equal(result.status,'no_net_winding_detected');for(const loop of rows(result.loops))assert.deepEqual(rows(loop.reflections).map(reflection=>reflection.canonical_winding_integer),[0,0,0]);}else assert.notEqual(result.status,'projected_topological_evidence');return result;};
const fixed=async(name:string,input:Input)=>{
 const attempts:Attempt[]=[],t=performance.now();let followup:Row|undefined,topology:Row|undefined;
 report.in_progress={case:name,strategy:'fixed_additional_gpa_then_topology',attempts};
 const attempt=async(tool:string,args:Row,reserved:Cost)=>{const request_id=`method-fixed-${name}-${tool}`,entry:Attempt={tool,request_id,reserved,elapsed_ms:0,state:'unknown'},t0=performance.now();attempts.push(entry);try{const result=await data(tool,{...args,request_id});entry.state='completed';entry.object_id=result.object_id;return result;}catch(caught){entry.state='failed_or_unknown';entry.error=caught instanceof Error?caught.message:String(caught);return undefined;}finally{entry.elapsed_ms=performance.now()-t0;}};
 followup=await attempt('image_gpa',{object_id:input.fft.object_id,...options,g_vectors:[g[0],g[2]]},GPA_COST);
 topology=await attempt('image_topology',{object_ids:[input.seed.object_id,...(followup?[followup.object_id]:[])],loops,model_assumption_text:assumption,max_size:512},TOPOLOGY_COST);
 assert.ok(followup&&topology,'The fixed fixture sequence must return saved GPA and topology outcomes; all failures are retained above');
 const reserved=attempts.reduce((sum,value)=>add(sum,value.reserved),ZERO);bounded(reserved);
 return {strategy:'fixed_additional_gpa_then_topology',attempts,reserved_cost:reserved,actual_retained_band_path_samples:topology?Number(row(topology.report).reflection_count)*888:0,elapsed_ms:performance.now()-t,followup_id:followup?.object_id??null,topology_id:topology?.object_id??null,evidence:topology?verifyTopology(name,topology):null};
};
const terminal=(plan:Row)=>rows(plan.actions).every(action=>action.kind==='stop'||action.kind==='request_information');
const ledgerAudit=(plan:Row)=>{const ledger=row(plan.ledger),spent=cost(ledger.spent),remaining=cost(ledger.remaining);bounded(spent);for(const key of Object.keys(CAP))assert.equal(spent[key as keyof Cost]+remaining[key as keyof Cost],CAP[key as keyof Cost],`Ledger cap mismatch ${key}`);return {spent,remaining,attempts:rows(ledger.attempts)};};
const active=async(name:string,input:Input)=>{
 const t=performance.now(),plans:Row[]=[],steps:Row[]=[],attempts:Attempt[]=[],immutable=new Map<string,ReturnType<typeof snapshot>>();let topology:Row|undefined;
 report.in_progress={case:name,strategy:'active_saved_plan',plans,steps,attempts};
 let plan=await data('image_method_plan',{object_ids:[input.seed.object_id],budget:CAP,information}),rootId=id(plan.root_plan_id);assert.equal(rootId,plan.object_id);plans.push(plan);immutable.set(rootId,snapshot(rootId));ledgerAudit(plan);
 for(let turn=0;turn<4&&!terminal(plan);turn++){
  const action=rows(plan.actions).find(candidate=>candidate.kind==='gpa'||candidate.kind==='topology');assert.ok(action,'No executable or terminal saved action');
  const request_id=text(plan.next_request_id);assert.match(request_id,new RegExp(`^method-${rootId}-[1-8]$`));
  const entry:Attempt={tool:text(action.kind),request_id,reserved:cost(action.cost),elapsed_ms:0,state:'unknown'},t0=performance.now();attempts.push(entry);
  let step:Row;try{step=await data('image_method_step',{root_plan_id:rootId,object_id:plan.object_id,action_id:action.action_id,selection_reason:'Acceptance follows the first executable saved action with explicit analytic information and the shared bounded budget.',request_id});entry.state='receipt_returned';entry.object_id=step.object_id;}catch(caught){entry.error=caught instanceof Error?caught.message:String(caught);entry.state='failed_or_unknown';throw caught;}finally{entry.elapsed_ms=performance.now()-t0;}
  assert.equal(step.kind,'method_step');assert.equal(step.root_plan_id,rootId);assert.equal(step.plan_object_id,plan.object_id);assert.equal(step.request_id,request_id);assert.deepEqual(step.selected_action,action);const receipt=row(step.child_receipt);entry.state=text(receipt.state);assert.ok(typeof receipt.request_id==='string');assert.equal(receipt.automatic_retry,false);
  if(receipt.object_id){const child=await data('image_info',{object_id:receipt.object_id});assert.equal(child.request_id,receipt.request_id);if(action.kind==='gpa'){assert.equal(child.kind,'gpa');assert.deepEqual(row(child.parameters).g_vectors,[g[0],g[2]]);assert.equal(child.fft_recomputed,false);}else{assert.equal(child.kind,'topology');topology=child;verifyTopology(name,child);}}
  steps.push(step);immutable.set(id(step.object_id),snapshot(id(step.object_id)));plan=await data('image_method_next',{object_id:step.object_id});assert.equal(plan.root_plan_id,rootId);plans.push(plan);immutable.set(id(plan.object_id),snapshot(id(plan.object_id)));ledgerAudit(plan);
 }
 assert.ok(terminal(plan),'Loop must stop/request information within bounded actions');
 const ledger=ledgerAudit(plan);assert.equal(ledger.attempts.length,attempts.length);const reserved=attempts.reduce((sum,value)=>add(sum,value.reserved),ZERO);assert.deepEqual(ledger.spent,reserved);
 for(let index=0;index<attempts.length;index++){const saved=ledger.attempts[index],observed=attempts[index];assert.equal(saved.request_id,observed.request_id);assert.deepEqual(cost(saved.reserved_cost),observed.reserved);assert.equal(typeof saved.elapsed_ms,'number');assert.ok(Number(saved.elapsed_ms)>=0);assert.equal(saved.automatic_retry,false);assert.equal(row(row(saved.method_attempt).child_receipt).state,observed.state);}
 for(const [object_id,original] of immutable)assert.deepEqual(snapshot(object_id),original);
 if(name==='positive'||name==='contrast_vortex'){assert.ok(topology,'Charged analytic texture must complete the proposed topology path');assert.deepEqual(attempts.map(value=>value.tool),['gpa','topology']);}
 if(name==='smooth_hotspot'||name==='noise'){assert.equal(attempts.length,0,'Clean/quality controls must stop before extra scientific calls');assert.equal(topology,undefined);}
 return {strategy:'active_saved_plan',root_plan_id:rootId,plans:plans.map(value=>value.object_id),steps:steps.map(value=>value.object_id),attempts,reserved_cost:reserved,actual_retained_band_path_samples:topology?Number(row(topology.report).reflection_count)*888:0,ledger,elapsed_ms:performance.now()-t,terminal_decision:plan.decision,terminal_actions:plan.actions,topology_id:topology?.object_id??null,evidence:topology?row(topology.report):null};
};
try{
 await first.rpc('initialize');const catalog=row(row(await first.rpc('tools/list')).result).tools;assert.ok(Array.isArray(catalog));for(const name of ['image_method_plan','image_method_step','image_method_next'])assert.ok(catalog.some(value=>row(value).name===name),name);writeFileSync(path.join(directory,'method-catalog.json'),JSON.stringify(catalog.filter(value=>text(row(value).name).startsWith('image_method_')),null,2));
 const inputs:Input[]=[];
 for(const name of ['positive','smooth_hotspot','noise','contrast_vortex']){
  const input=await source(name);inputs.push(input);const before={fft:fftCount(),source:digest(input.file),fft_files:snapshot(id(input.fft.object_id)),seed_files:snapshot(id(input.seed.object_id))};
  const selected=await active(name,input),baseline=await fixed(name,input);benchmark.push({case:name,source_sha256:input.sha256,common_inputs:{source_id:input.opened.object_id,frame_id:input.frame.object_id,fft_id:input.fft.object_id,seed_gpa_id:input.seed.object_id,fft_pixels:65536,gpa_band_pixels:131072},budget_cap:CAP,strategies:[selected,baseline],comparison:'Same additional budget caps; all attempts reserved and timed. Unused active budget is reported and no universal superiority is asserted.'});delete report.in_progress;
  assert.equal(fftCount(),before.fft);assert.equal(digest(input.file),before.source);assert.deepEqual(snapshot(id(input.fft.object_id)),before.fft_files);assert.deepEqual(snapshot(id(input.seed.object_id)),before.seed_files);
 }
 assert.equal(inputs[0].sha256,inputs[3].sha256,'Contrast-vortex intensities must be observationally identical to positive');const positive=rows(benchmark[0].strategies)[0],contrast=rows(benchmark[3].strategies)[0];assert.deepEqual(rows(positive.attempts).map(value=>value.tool),rows(contrast.attempts).map(value=>value.tool));assert.equal(row(positive.evidence).status,row(contrast.evidence).status);
 checks.push('Actual MCP public positive/smooth-hotspot/noise/contrast-vortex common input chains and active/fixed same-cap comparisons; all attempts, reserved costs and elapsed times retained; original sources/FFT/GPA unchanged and no loop forward FFT.');
 checks.push('Positive and intensity-identical contrast vortex yield the same hypothesized projected image-phase evidence; no material dislocation confirmation or unique conventional 3D Burgers vector.');
 const positiveInput=inputs[0],beforeInformation=objects().length,missing=await data('image_method_plan',{object_ids:[positiveInput.seed.object_id],budget:CAP,information:{goal:'projected_topology'}});assert.ok(rows(missing.actions).some(action=>action.kind==='request_information'));assert.equal(rows(row(missing.ledger).attempts).length,0);
 const patched=await data('image_method_next',{object_id:missing.object_id,information_patch:information});assert.equal(patched.root_plan_id,missing.root_plan_id);assert.ok(rows(patched.actions).some(action=>action.kind==='gpa'));assert.equal(rows(row(patched.ledger).attempts).length,0);assert.equal(objects().length,beforeInformation+2,'Information-only plan/patch adds no scientific child');
 const noBudget=await data('image_method_plan',{object_ids:[positiveInput.seed.object_id],budget:ZERO,information});assert.ok(terminal(noBudget));assert.equal(rows(row(noBudget.ledger).attempts).length,0);report.controls={missing_information:missing,information_patch:patched,zero_budget:noBudget};
 checks.push('Missing explicit reflection basis/circuits requests information; immutable next-plan patch adds no scientific child; zero additional budget terminates without submitting science.');
 const beforeRefusals={ffts:fftCount(),scientific:objects().filter(value=>['gpa','topology'].includes(text(metadata(value).kind))).length};
 let refused=await data('image_method_plan',{object_ids:[positiveInput.seed.object_id],budget:CAP,information});const refusedRoot=id(refused.root_plan_id),refusals:Row[]=[];
 for(let n=0;n<2;n++){
  const request={root_plan_id:refusedRoot,object_id:refused.object_id,action_id:'0'.repeat(32),selection_reason:'Deliberate public preflight-refusal accounting control; no saved action has this identity.',request_id:refused.next_request_id};
  let error='';try{await data('image_method_step',request);}catch(caught){error=caught instanceof Error?caught.message:String(caught);}assert.ok(error,'An unsaved action must be refused');
  const next=await data('image_method_next',{object_id:refused.object_id}),ledger=ledgerAudit(next),attempt=ledger.attempts[n];assert.equal(ledger.attempts.length,n+1);assert.equal(attempt.state,'failed');assert.equal(attempt.request_id,request.request_id);assert.deepEqual(cost(attempt.reserved_cost),{...ZERO,method_calls:1});assert.equal(typeof attempt.elapsed_ms,'number');assert.ok(Number(attempt.elapsed_ms)>=0);assert.equal(attempt.automatic_retry,false);refusals.push({request,error,ledger_attempt:attempt});refused=next;
 }
 assert.ok(terminal(refused));assert.equal(row(refused.decision).reason,'budget_exhausted');assert.deepEqual(ledgerAudit(refused).spent,{...ZERO,method_calls:2});assert.deepEqual({ffts:fftCount(),scientific:objects().filter(value=>['gpa','topology'].includes(text(metadata(value).kind))).length},beforeRefusals);row(report.controls).failed_preflight={root_plan_id:refusedRoot,refusals,terminal_plan:refused};
 checks.push('Two actual public MCP preflight refusals retain original deterministic request IDs, failed outcomes, one-call reservations and elapsed time; both consume the root call cap and submit no scientific child. Unknown/lost-response injection is separately excluded from this smoke.');
 const beforeRecovery={objects:objects().length,ffts:fftCount()},fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 const recoverIds=benchmark.flatMap(value=>{const selected=rows(value.strategies)[0];return [text(selected.root_plan_id),...(selected.plans as string[]),...(selected.steps as string[])];});
 for(const object_id of [...new Set(recoverIds)]){const original=metadata(object_id),info=await data('image_info',{object_id},fresh),recovered=await data('image_result',{request_id:original.request_id},fresh);assert.equal(info.object_id,object_id);assert.equal(recovered.object_id,object_id);assert.equal(info.root_plan_id,original.root_plan_id);}
 for(const refusal of refusals){const originalRequest=text(row(refusal.request).request_id),journalPath=path.join(workspace,'requests',originalRequest+'.json'),before=digest(journalPath),original=row(JSON.parse(readFileSync(journalPath,'utf8'))),reply=row(row(await fresh.rpc('tools/call',{name:'image_result',arguments:{request_id:originalRequest}})).result);assert.equal(reply.isError,true);assert.equal(text(rows(reply.content).find(value=>value.type==='text')?.text),refusal.error);assert.equal(original.request_id,originalRequest);assert.equal(original.state,'failed');assert.equal(row(original.response).request_id,originalRequest);assert.equal(digest(journalPath),before);}
 assert.deepEqual({objects:objects().length,ffts:fftCount()},beforeRecovery);assert.equal(fftCount(),4);report.recovery={fresh_client:true,plan_step_count:new Set(recoverIds).size,new_scientific_objects:0,new_forward_fft:0};checks.push('Fresh public MCP client recovers immutable original plans/steps by object and original request IDs without new science or replay.');
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('PASS: actual public MCP/Python first bounded saved-plan GPA/topology loop, four analytic controls, same-cap fixed comparison, information/budget stops and fresh recovery.');
}catch(caught){report.result='FAIL';report.error=caught instanceof Error?caught.stack:String(caught);report.runtime_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw caught;}
finally{for(const client of clients)await client.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;console.log('Retained evidence: '+path.join(directory,'report.json'));}
