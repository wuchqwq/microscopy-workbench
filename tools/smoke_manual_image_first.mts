// Actual MCP/Python acceptance of the supported manual image-first workflow.
// No automatic feature proposal, detector tuning, browser/model or specimen claim.
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
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const rows=(v:unknown):Row[]=>{assert.ok(Array.isArray(v));return v.map(row);};
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const number=(v:unknown):number=>{assert.equal(typeof v,'number');assert.ok(Number.isFinite(v));return v as number;};
const hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
const repo=fileURLToPath(new URL('../',import.meta.url));
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must name a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'manual-image-first-'));
const executable=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const pythonRun=(args:string[]):string=>{const r=spawnSync(executable,['-B','-X','utf8',...args],{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const python=pythonRun(['-c','import sys;print(sys.executable)']);
const fixture=path.join(directory,'fixture');
pythonRun([path.join(repo,'tools/create_discovery_fixtures.py'),fixture]);
const oracle=row(JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8'))),input=row(row(oracle.cases).amplitude_dip);
const source=path.join(fixture,text(input.path)),sourceHash=hash(source);
assert.equal(sourceHash,input.source_sha256);
const workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workspaceRoot,structures:false},null,2)+'\n');
const priorConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python,serverPath:path.join(repo,'tools/plugin_server.mjs')});
const first=makeClient(),clients=[first],tag=hash(config).slice(0,10),timings:Row[]=[],checks:string[]=[],restore:Row[]=[];
const started=performance.now();let serial=0;
const report:Row={schema:'manual-image-first-freeze-qualification-v1',started_utc:new Date().toISOString(),
 scope:'Actual compiled MCP stdio/Python; explicitly supplied public synthetic researcher ROI and observation reason. Manual workflow software/numerical qualification only.',
 automatic_proposals_run:0,structure_fields_created:0,timings,checks,
 not_tested:['human browser gestures','real specimens/independent material interpretation','new runtime model','real worker interruption']};
const metadata=(id:string):Row=>row(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')));
const objects=():Row[]=>existsSync(path.join(workspace,'objects'))?readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json'))).map(metadata):[];
const fftState=()=>Object.fromEntries(objects().filter(m=>m.kind==='fft').map(m=>[text(m.object_id),hash(path.join(workspace,'objects',text(m.object_id),'data.npy'))]));
const immutable=()=>Object.fromEntries([
 ...objects().flatMap(m=>{const dir=path.join(workspace,'objects',text(m.object_id));return readdirSync(dir).map(file=>path.join(dir,file));}),
 ...readdirSync(path.join(workspace,'requests')).filter(f=>f.endsWith('.json')).map(f=>path.join(workspace,'requests',f)),
].map(file=>[path.relative(workspace,file),hash(file)]));
const unchanged=(before:Record<string,string>)=>{for(const [file,digest] of Object.entries(before))assert.equal(hash(path.join(workspace,file)),digest,`Existing record changed: ${file}`);};
const call=async(name:string,args:Row={},client=first):Promise<Row>=>{
 const readonly=['image_info','image_result'].includes(name),requestId=readonly?args.request_id:args.request_id??`manual-freeze-${tag}-${++serial}`;
 const parameters=readonly?args:{...args,request_id:requestId},t=performance.now();let state='unknown';
 appendFileSync(path.join(directory,'calls.jsonl'),JSON.stringify({phase:'before_dispatch',tool:name,request_id:requestId??null,arguments:parameters})+'\n');
 try{const reply=await client.tool(name,parameters);state='completed';
  if(['image_discovery','image_discovery_review'].includes(name)){
   assert.ok(reply.png,'Manual observation/review must return actual MCP image content');
   const bytes=Buffer.from(text(reply.png),'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   writeFileSync(path.join(directory,String(requestId)+'.png'),bytes);
  }
  const result=row(reply.data);assert.equal(result.backend,'external-image-workspace');return result;
 }catch(error){state='failed_or_unknown';throw error;}
 finally{timings.push({tool:name,request_id:requestId??null,state,elapsed_ms:performance.now()-t});}
};
const boundedManual=(saved:Row)=>{assert.equal(saved.support_status,'MANUAL_SUPPORTED_LIMITED');assert.equal(saved.interpretation_status,'hypothesized');assert.equal(saved.physical_conclusion,null);assert.equal(saved.fft_recomputed,false);};

try{
 await first.rpc('initialize');
 const opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});
 assert.equal(frame.dtype,'float32');assert.deepEqual(frame.shape_yx,[256,256]);
 const frameHash=hash(text(frame.array_path));
 const calibration=await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.02,y:-.03,unit:'nm'},source_text:'Public synthetic signed XY sampling for manual workflow qualification; not experimental calibration.'});
 const metric=row(calibration.xy_calibration);assert.equal(metric.source,'user_statement_not_independently_verified');
 assert.equal(row(metric.xy_scale).x,.02);assert.equal(row(metric.xy_scale).y,-.03);
 const rect=[56,56,120,120],reason='Synthetic researcher selects a visible contrast depression for checking; material cause remains unknown.';
 const manual=await call('image_discovery',{object_id:calibration.object_id,entry:'manual',regions:[{rect,reason,candidate_explanations:['Image contrast variation is a candidate, not a confirmed material defect.'],unresolved:['Imaging/transfer contribution is unknown.']}]});
 boundedManual(manual);assert.equal(row(manual.parameters).entry,'manual');assert.equal(manual.full_structure_field_required,false);
 const candidate=rows(manual.candidates)[0]!;assert.deepEqual(candidate.rect,rect);assert.deepEqual(candidate.reasons,[reason]);
 assert.equal(candidate.entry_basis,'researcher_statement');assert.equal(candidate.score,null);
 const context=row(manual.source_context);assert.equal(context.dtype,'float32');assert.deepEqual(context.shape_yx,[256,256]);
 assert.equal(row(context.xy_calibration).calibration_id,metric.calibration_id);
 assert.equal(row(row(manual.source_dependency).science).array_sha256,frameHash);
 assert.deepEqual(fftState(),{});
 restore.push({object_id:manual.object_id,request_id:manual.request_id});

 const batch=await call('image_fft_batch',{object_id:calibration.object_id,rects:[rect],window:'hann',subtract_mean:true,max_size:512});
 const region=rows(batch.regions)[0]!,fftId=text(region.fft_object_id),fft=metadata(fftId);
 assert.deepEqual(region.rect,rect);assert.equal(fft.dtype,'complex128');assert.deepEqual(fft.shape_yx,[64,64]);assert.deepEqual(fft.source_rect_xyxy,rect);
 const peaks=await call('image_peaks',{object_id:fftId,max_peaks:4,min_separation_bins:2,exclude_dc_radius_bins:3,threshold_rel:.18,refinement:'none',max_size:512});
 const measured=await call('image_peak_measurements',{object_id:peaks.object_id,max_peaks:4});
 const numerical=rows(measured.measurements);assert.ok(numerical.length>0&&numerical.length<=4);
 for(const m of numerical){const [fx,fy]=m.frequency_cycles_per_pixel as number[];assert.ok(Math.abs(number(m.pixel_period)-1/Math.hypot(fx!,fy!))<1e-9);assert.equal(m.d_spacing_unit,'nm');assert.ok(Math.abs(number(m.d_spacing)-1/Math.hypot(fx!/.02,fy!/-.03))<1e-9);assert.equal(m.status,'hypothesized');}
 const evidence=[batch.object_id,peaks.object_id,measured.object_id],observation='Existing FFT peaks and sourced geometric periods are bound to this exact researcher ROI; physical interpretation remains unconfirmed.';
 const review=await call('image_discovery_review',{object_id:manual.object_id,candidate_id:candidate.candidate_id,evidence_ids:evidence,observation_text:observation,unresolved:['Independent specimen interpretation is unavailable.']});
 boundedManual(review);assert.equal(review.review_is_scientific_verification,false);assert.deepEqual(row(review.candidate).rect,rect);
 assert.deepEqual(rows(review.evidence_refs).map(r=>r.object_id),evidence);assert.deepEqual(row(review.source_dependency).science,row(manual.source_dependency).science);
 restore.push({object_id:batch.object_id,request_id:batch.request_id},{object_id:fftId,request_id:region.fft_request_id},
  {object_id:peaks.object_id,request_id:peaks.request_id},{object_id:measured.object_id,request_id:measured.request_id},{object_id:review.object_id,request_id:review.request_id});
 const originalFFT=fftState();assert.equal(Object.keys(originalFFT).length,1);
 const protectedFiles=immutable();
 writeFileSync(path.join(directory,'initial-science-hashes.json'),JSON.stringify(protectedFiles,null,2)+'\n');

 const revisedReason='Synthetic researcher clarifies attention is a contrast observation, with no asserted displacement or phase change.';
 const revised=await call('image_discovery',{object_id:calibration.object_id,entry:'manual',regions:[{rect,reason:revisedReason,unresolved:['Physical origin remains unknown.']}],previous_discovery_id:manual.object_id});
 boundedManual(revised);assert.equal(rows(revised.candidates)[0]!.candidate_id,candidate.candidate_id);assert.deepEqual(rows(revised.candidates)[0]!.reasons,[revisedReason]);
 assert.equal(rows(revised.history).at(-1)!.object_id,manual.object_id);
 const rereview=await call('image_discovery_review',{object_id:revised.object_id,candidate_id:candidate.candidate_id,evidence_ids:evidence,
  observation_text:'Only researcher wording/interpretation changed; reuse the exact saved numerical evidence.',previous_review_id:review.object_id,unresolved:['No independent material conclusion.']});
 boundedManual(rereview);assert.equal(rows(rereview.history).at(-1)!.object_id,review.object_id);
 assert.deepEqual(rows(rereview.evidence_refs),rows(review.evidence_refs));assert.deepEqual(fftState(),originalFFT);unchanged(protectedFiles);
 restore.push({object_id:revised.object_id,request_id:revised.request_id},{object_id:rereview.object_id,request_id:rereview.request_id});
 checks.push('Same-ROI researcher rationale/review revision reuses the identical FFT and numerical evidence, retaining old records and explicit history.');

 const moved=await call('image_discovery',{object_id:calibration.object_id,entry:'manual',regions:[{rect:[60,56,124,120],reason:'Explicit synthetic researcher ROI displacement; old spectrum is historical.'}],previous_discovery_id:revised.object_id});
 let refusal='';try{await call('image_discovery_review',{object_id:moved.object_id,candidate_id:rows(moved.candidates)[0]!.candidate_id,evidence_ids:evidence,observation_text:'Deliberate mismatched old-ROI evidence control.'});}catch(error){refusal=error instanceof Error?error.message:String(error);}
 assert.match(refusal,/DISCOVERY_SCOPE_MISMATCH/);const failedId=text(timings.at(-1)!.request_id);
 assert.deepEqual(fftState(),originalFFT);unchanged(protectedFiles);

 const exported=await call('image_export',{object_id:rereview.object_id,output_dir:path.join(directory,'review-export')});
 for(const [name,digest] of Object.entries(row(exported.exported_files_sha256)))assert.equal(hash(path.join(text(exported.output_dir),name)),digest);
 assert.deepEqual(readFileSync(path.join(text(exported.output_dir),'discovery-review.json')),readFileSync(path.join(workspace,'objects',text(rereview.object_id),'discovery-review.json')));
 assert.ok(existsSync(path.join(text(exported.output_dir),'provenance.json')));
 assert.deepEqual(fftState(),originalFFT);unchanged(protectedFiles);
 report.export={object_id:exported.object_id,files_sha256:exported.exported_files_sha256,byte_exact:true};

 const beforeRecovery=immutable();writeFileSync(path.join(directory,'recovery-science-hashes.json'),JSON.stringify(beforeRecovery,null,2)+'\n');
 const fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of restore){const outcome=await call('image_result',{request_id:saved.request_id},fresh);assert.equal(outcome.object_id,saved.object_id);assert.equal(outcome.request_id,saved.request_id);}
 let recoveredFailure='';try{await call('image_result',{request_id:failedId},fresh);}catch(error){recoveredFailure=error instanceof Error?error.message:String(error);}assert.equal(recoveredFailure,refusal);
 assert.deepEqual(immutable(),beforeRecovery);assert.deepEqual(fftState(),originalFFT);assert.equal(hash(source),sourceHash);assert.equal(hash(text(frame.array_path)),frameHash);
 assert.equal(objects().filter(m=>['spatial_field','field_extend','domain_map'].includes(text(m.kind))).length,0);
 report.source={backend:frame.backend,source_sha256:sourceHash,frame_array_sha256:frameHash,dtype:frame.dtype,shape_yx:frame.shape_yx,calibration:metric};
 report.manual={object_id:manual.object_id,request_id:manual.request_id,candidate_id:candidate.candidate_id,rect,reason,support_status:manual.support_status};
 report.science={fft_id:fftId,fft_sha256:originalFFT[fftId],fft_pixels:4096,measurements:numerical,evidence_refs:review.evidence_refs};
 report.revision={discovery_id:revised.object_id,review_id:rereview.object_id,fft_unchanged:true,old_files_unchanged:Object.keys(protectedFiles).length};
 report.stale_roi={failed_request_id:failedId,original_error:refusal,recovered_error_identical:true};
 report.recovery={fresh_client:true,original_requests:restore,unchanged_files:Object.keys(beforeRecovery).length,new_requests:0,new_fft:0};
 checks.push('Explicit source/frame/ROI/dtype/signed metric and numerical periods match actual provider records; no physical interpretation confirmed.');
 checks.push('Fresh client original-ID recovery, failed-request recovery and exact exported scientific JSON preserve all authoritative bytes without repeating science.');
 const numericInput=path.join(directory,'independent-input.json');
 writeFileSync(numericInput,JSON.stringify({source,array_path:frame.array_path,rect,fft_path:path.join(workspace,'objects',fftId,'data.npy'),measurements:numerical},null,2)+'\n');
 report.independent_numeric=JSON.parse(pythonRun(['-c',String.raw`
import json,sys,numpy as np,tifffile
p=json.load(open(sys.argv[1],encoding='utf-8'));a=tifffile.imread(p['source']);saved=np.load(p['array_path'],allow_pickle=False)
assert a.dtype==saved.dtype==np.dtype('float32') and a.shape==saved.shape and np.array_equal(a,saved)
x0,y0,x1,y1=p['rect'];v=a[y0:y1,x0:x1].astype(float);v-=v.mean();h,w=v.shape
wx=.5-.5*np.cos(2*np.pi*np.arange(w)/(w-1));wy=.5-.5*np.cos(2*np.pi*np.arange(h)/(h-1));v*=wy[:,None]*wx[None,:]
ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
expected=np.roll(np.roll(ey@v@ex.T,h//2,0),w//2,1);actual=np.load(p['fft_path'],allow_pickle=False)
error=float(np.max(np.abs(actual-expected)));assert error<1e-7,error
for m in p['measurements']:
 fx,fy=m['frequency_cycles_per_pixel'];assert abs(m['pixel_period']-1/np.hypot(fx,fy))<1e-9
 assert m['d_spacing_unit']=='nm' and abs(m['d_spacing']-1/np.hypot(fx/.02,fy/-.03))<1e-9
print(json.dumps({'result':'PASS','source_arrays_equal':True,'all_bin_direct_dft_max_error':error,'measurements_checked':len(p['measurements']),
 'scope':'Direct finite DFT and signed synthetic XY metric; not physical interpretation or detector performance'}))
`,numericInput]));
 checks.push('Original float32 array equals TIFF exactly; every complex FFT bin matches independent finite DFT, with analytic signed metric periods.');
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.runtime_ms=performance.now()-started;throw error;}
finally{
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 for(const client of clients)await client.close();
 if(priorConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=priorConfig;
 console.log(text(report.result)+': manual image-first actual MCP qualification retained at '+path.join(directory,'report.json'));
}
