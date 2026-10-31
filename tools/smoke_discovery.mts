// Actual compiled MCP/Python F4b entrance comparison on independent public
// analytic inputs. Truth is used ONLY by this acceptance driver, never supplied
// to the image feature detector or the existing structural-field machinery.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
type Rect=[number,number,number,number];
const row=(value:unknown):Row=>{assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const rows=(value:unknown):Row[]=>{assert.ok(Array.isArray(value));return value.map(row);};
const text=(value:unknown):string=>{assert.equal(typeof value,'string');return value as string;};
const rect=(value:unknown):Rect=>{assert.ok(Array.isArray(value)&&value.length===4&&value.every(v=>typeof v==='number'&&Number.isFinite(v)));return value as Rect;};
const rects=(value:unknown):Rect[]=>{assert.ok(Array.isArray(value));return value.map(rect);};
const digest=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const repo=fileURLToPath(new URL('../',import.meta.url));
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must name a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'discovery-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const pythonRun=(args:string[]):string=>{const result=spawnSync(candidate,['-B','-X','utf8',...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const python=pythonRun(['-c','import sys;print(sys.executable)']);
const fixture=path.join(directory,'fixture');
pythonRun([path.join(repo,'tools/create_discovery_fixtures.py'),fixture]);
const oracle=row(JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8')));
const inputCases=row(oracle.cases),workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workspaceRoot,structures:false},null,2));
const oldConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python,serverPath:path.join(repo,'tools/plugin_server.mjs')});
const clients=[makeClient()],first=clients[0]!;
const started=performance.now(),timings:Row[]=[],results:Row[]=[],checks:string[]=[],recover:Row[]=[];
const tag=createHash('sha256').update(directory).digest('hex').slice(0,10);
const report:Row={schema:'public-f4b-entrance-comparison-v1',started_utc:new Date().toISOString(),
 scope:'Actual compiled stdio MCP/Python, public independent analytic image inputs; image attention candidates are not physical defect or phase conclusions',
 preregistration:'docs/F4B_BENCHMARK_PREREGISTRATION.md',oracle,timings,results,checks,
 not_tested:['actual browser gestures','fresh runtime model session unless separately qualified','real specimens','material-defect accuracy','real cancelled/interrupted worker'],
 comparison_limits:['Field preparation cost is fully charged; this is not an equal-total-cost trial.',
 'Manual ROIs are oracle-assisted attention/control inputs, not an autonomous detection strategy.',
 'Broad field support, numerical observation and physical interpretation remain distinct.']};
let serial=0;
const allObjects=():Row[]=>existsSync(path.join(workspace,'objects'))?readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json'))).map(id=>row(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')))):[];
const fftState=()=>new Map<string,string>(allObjects().filter(r=>r.kind==='fft').map((r):[string,string]=>[text(r.object_id),digest(path.join(workspace,'objects',text(r.object_id),'data.npy'))]));
const immutableFiles=()=>Object.fromEntries([
 ...allObjects().flatMap(r=>{const folder=path.join(workspace,'objects',text(r.object_id));return readdirSync(folder).map(name=>path.join(folder,name));}),
 ...readdirSync(path.join(workspace,'requests')).filter(name=>name.endsWith('.json')).map(name=>path.join(workspace,'requests',name)),
].map(file=>[path.relative(workspace,file),digest(file)]));
const fftDelta=(before:Map<string,string>)=>{const newObjects=allObjects().filter(r=>r.kind==='fft'&&!before.has(text(r.object_id)));return {windows:newObjects.length,pixels:newObjects.reduce((sum,r)=>{const s=r.shape_yx as number[];return sum+s[0]!*s[1]!;},0),object_ids:newObjects.map(r=>r.object_id)};};
const call=async(name:string,args:Row={},client=first):Promise<Row>=>{
 const readOnly=['image_info','image_result','image_panel_current'].includes(name),requestId=readOnly?args.request_id:args.request_id??`discovery-${tag}-${++serial}`;
 const t=performance.now();let status='unknown';
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before_dispatch',tool:name,request_id:requestId??null,arguments:args})+'\n');
 try{const reply=await client.tool(name,readOnly?args:{...args,request_id:requestId});status='completed';if(['image_discovery','image_discovery_review'].includes(name))assert.ok(reply.png,'Formal discovery/review tools must return actual MCP PNG content');if(reply.png){const value=text(reply.png);assert.equal(Buffer.from(value,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');if(name==='image_discovery')writeFileSync(path.join(directory,String(requestId)+'-preview.png'),Buffer.from(value,'base64'));}return row(reply.data);}
 catch(error){status='failed_or_unknown';throw error;}
 finally{timings.push({tool:name,request_id:requestId??null,elapsed_ms:performance.now()-t,state:status});}
};
const intersection=(a:Rect,b:Rect)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
const area=(r:Rect)=>(r[2]-r[0])*(r[3]-r[1]);
const score=(proposed:Rect[],truth:Rect[])=>{
 const values=proposed.map(r=>{const overlaps=truth.map(t=>{const inter=intersection(r,t);return {iou:inter/(area(r)+area(t)-inter),truth_coverage:inter/area(t),any_overlap:inter>0};});return {rect:r,max_iou:overlaps.length?Math.max(...overlaps.map(v=>v.iou)):0,max_truth_coverage:overlaps.length?Math.max(...overlaps.map(v=>v.truth_coverage)):0,hit:overlaps.some(v=>v.iou>=.1)};});
 const hitTruth=truth.filter(t=>proposed.some(r=>{const i=intersection(r,t);return i/(area(r)+area(t)-i)>=.1;})).length;
 return {candidate_count:proposed.length,localized_truth_hits:hitTruth,localized_truth_misses:truth.length-hitTruth,false_attention_count:values.filter(v=>!v.hit).length,proposals:values};
};
const focus=(support:Rect):Rect=>{const x=Math.max(0,Math.min(192,Math.floor((support[0]+support[2])/2-32))),y=Math.max(0,Math.min(192,Math.floor((support[1]+support[3])/2-32)));return [x,y,x+64,y+64];};
const peakOptions={min_separation_bins:2,exclude_dc_radius_bins:3,threshold_rel:.18,refinement:'none'};
const protectedSource:Row[]=[];
const numerical:Row[]=[];

async function verify(name:string,strategy:string,selected:Row,region:Rect,discovery?:Row,candidateId?:string){
 const before=fftState(),t=performance.now();
 const batch=await call('image_fft_batch',{object_id:selected.object_id,rects:[region],window:'hann',subtract_mean:true,max_size:512});
 const fft=row(rows(batch.regions)[0]),fftId=text(fft.fft_object_id);
 const found=await call('image_peaks',{object_id:fftId,max_peaks:8,...peakOptions,max_size:512});
 const measured=await call('image_peak_measurements',{object_id:found.object_id,max_peaks:4});
 assert.equal(found.fft_recomputed??false,false);assert.equal(measured.fft_recomputed,false);
 const measurements=rows(measured.measurements);
 assert.ok(measurements.every(m=>m.status==='hypothesized'),'Numerical peak maxima must remain hypotheses');
 if(name!=='amplitude_dip')assert.ok(measurements.every(m=>m.d_spacing===null&&m.d_spacing_unit===null),'Uncalibrated input must not invent physical spacing');
 numerical.push({case:name,strategy,source_path:text(row(inputCases[name]).path),rect:region,fft_id:fftId,measurements});
 let reviewed:Row|null=null;
 if(discovery&&candidateId){
  const snapshots=fftState();
  reviewed=await call('image_discovery_review',{object_id:discovery.object_id,candidate_id:candidateId,evidence_ids:[batch.object_id,found.object_id,measured.object_id],
   observation_text:'Saved numerical Fourier maxima and geometric periods are available on this exact source ROI. They do not identify the physical origin of an image anomaly.',
   candidate_explanations:['Contrast/amplitude change or local orientation may merit further observation; material cause is unconfirmed.'],
   unresolved:['No uniquely identified material phase, twin, dislocation or three-dimensional model.']});
  assert.equal(reviewed.interpretation_status,'hypothesized');assert.equal(reviewed.physical_conclusion,null);
  assert.equal(reviewed.review_is_scientific_verification,false,'Binding existing evidence must not promote an interpretation to verified physics');
  assert.deepEqual(fftState(),snapshots,'Review must bind saved evidence without recomputing a spectrum');
  recover.push({object_id:reviewed.object_id,request_id:reviewed.request_id,kind:'review'});
 }
 const delta=fftDelta(before);assert.equal(delta.windows,1);assert.equal(delta.pixels,4096);
 return {batch,fft_id:fftId,peaks_id:found.object_id,measurements_id:measured.object_id,review:reviewed,cost:{...delta,elapsed_ms:performance.now()-t},measurement_count:measurements.length};
}

try{
 await first.rpc('initialize');const catalog=rows(row(row(await first.rpc('tools/list')).result).tools).map(t=>t.name);
 for(const tool of ['image_discovery','image_discovery_review','image_fft_batch','image_spatial_field','image_domain_map'])assert.ok(catalog.includes(tool));
 let revisionInput:Row|null=null;
 for(const name of Object.keys(inputCases)){
  const truth=row(inputCases[name]),file=path.join(fixture,text(truth.path)),sourceHash=digest(file);
  assert.equal(sourceHash,truth.source_sha256);
  const opened=await call('image_open',{source_path:file}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});assert.equal(frame.dtype,'float32');
  const frameHash=digest(text(frame.array_path));let selected=frame;
  if(name==='amplitude_dip')selected=await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.02,y:-.03,unit:'nm'},source_text:'Public analytic F4b synthetic signed anisotropic metric, not an experimental specimen scale.'});
  protectedSource.push({source_path:file,source_sha256:sourceHash,array_path:frame.array_path,array_sha256:frameHash});
  const trueRects=rects(truth.truth_rects);

  const imageBefore=fftState(),imageStart=performance.now();
  const discovered=await call('image_discovery',{object_id:selected.object_id,entry:'feature',window_sizes:[64],max_candidates:4,max_size:512});
  assert.deepEqual(fftState(),imageBefore,'Real-space proposal must create no FFT');
  const candidates=rows(discovered.candidates);assert.ok(candidates.length<=4);const imageRects=candidates.map(c=>rect(c.rect));
  const imagePreparation=performance.now()-imageStart;
  const firstCandidate=candidates[0];
  const imageVerification=firstCandidate?await verify(name,'image_first',selected,rect(firstCandidate.rect),discovered,text(firstCandidate.candidate_id)):null;
  results.push({case:name,strategy:'image_first',...score(imageRects,trueRects),initial_fft_windows:0,initial_fft_pixels:0,
   preparation_elapsed_ms:imagePreparation,provider_reported_costs:discovered.observation_cost??discovered.costs??null,discovery_id:discovered.object_id,
   verification:imageVerification,selected_focus_score:firstCandidate?score([rect(firstCandidate.rect)],trueRects):null,
   observation_status:row(discovered.quality).status,observation_quality:discovered.quality});
  recover.push({object_id:discovered.object_id,request_id:discovered.request_id,kind:'discovery'});

  const fieldBefore=fftState(),fieldStart=performance.now();
  const field=await call('image_spatial_field',{object_id:selected.object_id,rect:[0,0,256,256],window_sizes:[128],stride_xy:[128,128],max_windows:4,coordinate_domain:'pixel',window:'none',subtract_mean:true,max_peaks:8,peak_options:peakOptions,max_size:512});
  const mapped=await call('image_domain_map',{object_id:field.object_id,tolerance:.01,angles_degrees:[0,15,-15],neighbor_policy:'support_contact_v1',max_size:512});
  const initialField=fftDelta(fieldBefore);assert.equal(initialField.windows,4);assert.equal(initialField.pixels,65536);
  const bands=rows(mapped.boundary_bands),bandRects=bands.map(b=>rect(b.rect_xyxy));
  const uniqueBands=bandRects.filter((r,i)=>bandRects.findIndex(v=>JSON.stringify(v)===JSON.stringify(r))===i);
  const fieldPreparation=performance.now()-fieldStart,selectedFocus=uniqueBands[0]?focus(uniqueBands[0]):null;
  const fieldVerification=selectedFocus?await verify(name,'structure_field',selected,selectedFocus):null;
  results.push({case:name,strategy:'structure_field',...score(uniqueBands,trueRects),initial_fft_windows:initialField.windows,initial_fft_pixels:initialField.pixels,
   preparation_elapsed_ms:fieldPreparation,provider_reported_costs:field.costs??null,field_id:field.object_id,domain_map_id:mapped.object_id,
   unknown_sample_count:(mapped.unknown_sample_indices as unknown[]).length,field_edge_states:rows(mapped.edges).map(e=>e.status),
   verification:fieldVerification,selected_focus_score:selectedFocus?score([selectedFocus],trueRects):null,
   focus_origin:'64-square centre of first broad saved boundary-support band; not an inferred precisely localized interface'});
  recover.push({object_id:mapped.object_id,request_id:mapped.request_id,kind:'domain_map'});

  const manualBefore=fftState(),manualStart=performance.now();
  const manual=await call('image_discovery',{object_id:selected.object_id,entry:'manual',regions:[{rect:truth.manual_rect,reason:truth.manual_reason,candidate_explanations:['Analyst-supplied synthetic attention/control; not physically confirmed.'],unresolved:['Material cause and interpretation remain unknown.']}],max_size:512});
  assert.deepEqual(fftState(),manualBefore);const manualCandidate=rows(manual.candidates)[0]!;
  const manualPreparation=performance.now()-manualStart;
  const manualVerification=await verify(name,'manual',selected,rect(manualCandidate.rect),manual,text(manualCandidate.candidate_id));
  results.push({case:name,strategy:'manual',...score([rect(manualCandidate.rect)],trueRects),initial_fft_windows:0,initial_fft_pixels:0,
   preparation_elapsed_ms:manualPreparation,discovery_id:manual.object_id,verification:manualVerification,
   manual_origin:'Oracle-assisted analytic attention/control supplied explicitly; not an autonomous detector or verified physical conclusion'});
  if(name==='amplitude_dip')revisionInput={selected,manual,verification:manualVerification};
  assert.equal(digest(file),sourceHash);assert.equal(digest(text(frame.array_path)),frameHash);
  if(name==='amplitude_dip'){
   const panel=await call('image_panel_open',{object_id:manual.overview_object_id});
   assert.ok(['127.0.0.1','localhost'].includes(new URL(text(panel.panel_url)).hostname));assert.equal((await fetch(text(panel.panel_url))).status,200);
   const current=await call('image_panel_current',{panel_id:panel.panel_id});assert.equal(row(row(current.view).object).object_id,manual.overview_object_id);
   const annotations=rows(row(row(current.view).object).annotations);assert.ok(annotations.some(a=>JSON.stringify(a.coordinates)===JSON.stringify(truth.manual_rect)),'Panel must retain actual source-pixel ROI coordinates');
   const imageReply=row(row(await first.rpc('tools/call',{name:'image_panel_current',arguments:{panel_id:panel.panel_id}})).result),images=rows(imageReply.content).filter(i=>i.type==='image');
   assert.ok(images.length>0,'Panel current must return actual MCP image content');writeFileSync(path.join(directory,'panel-source-overview.png'),Buffer.from(text(images[0]!.data),'base64'));
   report.panel_http={panel_id:panel.panel_id,panel_url:panel.panel_url,opened_object_id:manual.overview_object_id,result:'PASS_HTTP_ONLY',browser_gestures:'NOT_TESTED'};
  }
 }

 const ri=row(revisionInput),selected=row(ri.selected),manual=row(ri.manual),verification=row(ri.verification),beforeRevision=fftState();
 const revised=await call('image_discovery',{object_id:selected.object_id,entry:'manual',regions:[{rect:[60,56,124,120],reason:'Synthetic analyst moves the attention ROI by4 source pixels; old FFT remains historical.'}],previous_discovery_id:manual.object_id,max_size:512});
 assert.deepEqual(fftState(),beforeRevision);recover.push({object_id:revised.object_id,request_id:revised.request_id,kind:'discovery_revision'});
 let refused='';try{await call('image_discovery_review',{object_id:revised.object_id,candidate_id:rows(revised.candidates)[0]!.candidate_id,evidence_ids:[row(verification.batch).object_id],observation_text:'Deliberate stale ROI evidence should be refused.'});}catch(error){refused=error instanceof Error?error.message:String(error);}assert.ok(refused,'A moved ROI cannot reuse old-scoped evidence as a current verification');
 assert.deepEqual(fftState(),beforeRevision);const failedRequest=text(timings[timings.length-1]!.request_id);report.stale_roi_refusal={result:'PASS',request_id:failedRequest,error:refused};

 const reviewToExport=row(verification.review),exported=await call('image_export',{object_id:reviewToExport.object_id,output_dir:path.join(directory,'review-export')});
 for(const [name,sha] of Object.entries(row(exported.exported_files_sha256)))assert.equal(digest(path.join(text(exported.output_dir),name)),sha);
 const exportedReviewBytes=readFileSync(path.join(text(exported.output_dir),'discovery-review.json'));
 const originalReviewBytes=readFileSync(path.join(workspace,'objects',text(reviewToExport.object_id),'discovery-review.json'));
 assert.deepEqual(exportedReviewBytes,originalReviewBytes,'Export must preserve exact authoritative JSON bytes, including Python signed zero; MCP JSON.stringify may normalize -0 to0');
 const savedReview=row(JSON.parse(exportedReviewBytes.toString('utf8'))),originalReview=row(JSON.parse(originalReviewBytes.toString('utf8')));
 assert.deepEqual(savedReview.candidate,reviewToExport.candidate);assert.deepEqual(savedReview.evidence_refs,reviewToExport.evidence_refs);
 assert.deepEqual(savedReview.numerical_observations,originalReview.numerical_observations);assert.ok(rows(savedReview.evidence_refs).length>0);
 assert.deepEqual(savedReview.source_dependency,originalReview.source_dependency);assert.ok(existsSync(path.join(text(exported.output_dir),'provenance.json')));
 assert.deepEqual(fftState(),beforeRevision);report.export_readback={result:'PASS',object_id:exported.object_id,output_dir:exported.output_dir,scientific_file:'discovery-review.json',files_sha256:exported.exported_files_sha256};

 const scienceBeforeRecovery=fftState(),countBeforeRecovery=allObjects().length,filesBeforeRecovery=immutableFiles();
 const fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of recover){const original=await call('image_result',{request_id:saved.request_id},fresh);assert.equal(original.object_id,saved.object_id);assert.equal(original.request_id,saved.request_id);}
 let recoveredFailure='';try{await call('image_result',{request_id:failedRequest},fresh);}catch(error){recoveredFailure=error instanceof Error?error.message:String(error);}assert.equal(recoveredFailure,refused,'Failed original request must restore its existing refusal, not retry');
 assert.deepEqual(fftState(),scienceBeforeRecovery);assert.equal(allObjects().length,countBeforeRecovery);
 assert.deepEqual(immutableFiles(),filesBeforeRecovery,'Read-only recovery must preserve every own payload, manifest and original journal');
 for(const saved of protectedSource){assert.equal(digest(text(saved.source_path)),saved.source_sha256);assert.equal(digest(text(saved.array_path)),saved.array_sha256);}
 report.recovery={result:'PASS',fresh_protocol_client:true,original_requests:recover,new_science:0,new_fft:0,immutable_files:Object.keys(filesBeforeRecovery).length,failed_request_recovered:failedRequest};
 checks.push('Feature/manual proposals, evidence review and ROI revision add no FFT; shifted ROI refuses stale saved evidence; fresh protocol recovery creates no new science.');

 const oracleInput=path.join(directory,'independent-input.json');writeFileSync(oracleInput,JSON.stringify({fixture,numerical,protectedSource},null,2));
 report.independent_numeric=JSON.parse(pythonRun(['-c',String.raw`
import json,sys,numpy as np,tifffile
from pathlib import Path
p=json.load(open(sys.argv[1],encoding='utf-8'));base=Path(sys.argv[2]);out=[]
for s in p['protectedSource']:
 a=tifffile.imread(s['source_path']);saved=np.load(s['array_path'],allow_pickle=False)
 assert a.dtype==saved.dtype==np.dtype('float32') and a.shape==saved.shape and np.array_equal(a,saved)
for r in p['numerical']:
 a=tifffile.imread(Path(p['fixture'])/r['source_path']);x0,y0,x1,y1=r['rect'];v=a[y0:y1,x0:x1].astype(float);v-=v.mean();h,w=v.shape
 wx=.5-.5*np.cos(2*np.pi*np.arange(w)/(w-1));wy=.5-.5*np.cos(2*np.pi*np.arange(h)/(h-1));v*=wy[:,None]*wx[None,:]
 ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
 expected=np.roll(np.roll(ey@v@ex.T,h//2,0),w//2,1);actual=np.load(base/r['fft_id']/'data.npy',allow_pickle=False)
 error=float(np.max(np.abs(actual-expected)));assert error<1e-7,error
 for m in r['measurements']:
  fx,fy=m['frequency_cycles_per_pixel'];assert abs(m['pixel_period']-1/np.hypot(fx,fy))<1e-9
  if r['case']=='amplitude_dip':
   assert m['d_spacing_unit']=='nm' and abs(m['d_spacing']-1/np.hypot(fx/.02,fy/-.03))<1e-9
  else:assert m['d_spacing'] is None and m['d_spacing_unit'] is None
 out.append({'case':r['case'],'strategy':r['strategy'],'fft_object_id':r['fft_id'],'all_bin_direct_dft_max_error':error,'measurements_checked':len(r['measurements'])})
print(json.dumps({'result':'PASS','source_arrays_equal':True,'checks':out,'scope':'Direct finite DFT and analytic signed metric; not repeated numpy.fft output or physical interpretation'}))
`,oracleInput,path.join(workspace,'objects')]));
 checks.push('Every verification FFT agrees with direct finite DFT, all stored source pixels/dtypes match TIFF, signed anisotropic physical spacing is correct and absent scales remain unknown.');
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.runtime_ms=performance.now()-started;throw error;}
finally{
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 const columns=['case','strategy','candidate_count','localized_truth_hits','localized_truth_misses','false_attention_count','unknown_sample_count','initial_fft_windows','initial_fft_pixels','verification_fft_windows','verification_fft_pixels','total_fft_pixels','preparation_elapsed_ms','verification_elapsed_ms'];
 const flat:Row[]=results.map((r):Row=>{const v=r.verification?row(row(r.verification).cost):null;return {...r,verification_fft_windows:v?.windows??0,verification_fft_pixels:v?.pixels??0,total_fft_pixels:Number(r.initial_fft_pixels)+Number(v?.pixels??0),verification_elapsed_ms:v?.elapsed_ms??null};});
 writeFileSync(path.join(directory,'comparison.csv'),columns.join(',')+'\n'+flat.map(r=>columns.map(k=>r[k]??'').join(',')).join('\n')+'\n');
 for(const client of clients)await client.close();if(oldConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=oldConfig;
 console.log(text(report.result)+': actual F4b MCP/Python entrance comparison retained at '+path.join(directory,'report.json'));
}
