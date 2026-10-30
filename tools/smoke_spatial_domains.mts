// Real compiled MCP -> Python acceptance. Public source generation and the
// independent oracle are not production analysis paths or runtime dependencies.
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
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const number=(v:unknown):number=>{assert.ok(typeof v==='number'&&Number.isFinite(v));return v as number;};
const list=(v:unknown):unknown[]=>{assert.ok(Array.isArray(v));return v;};
const ids=(samples:Row[])=>samples.map(s=>text(s.fft_object_id));
const root=fileURLToPath(new URL('../',import.meta.url));
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT requires a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'f1a-spatial-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(args:string[])=>{const result=spawnSync(python,['-B',...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const absolutePython=execute(['-c','import sys;print(sys.executable)']);
const fixture=path.join(directory,'fixture');execute([path.join(root,'examples','make_spatial_domains_trial.py'),fixture]);
const oracle=row(JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8')));
const files=row(oracle.files),workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,workspace_root:workspaceRoot,structures:false}));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(root,'tools','plugin_server.mjs')});
const clients=[makeClient()],first=clients[0]!;
const digest=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
// Failed/preflight-rejected writes may leave an unpublished reservation folder.
// Only immutable manifests are scientific objects; never count a directory as
// successful publication or parse a nonexistent manifest after a rejected call.
const objectFiles=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json')));
const objects=()=>objectFiles().map(id=>row(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8'))));
const fftCount=()=>objects().filter(r=>r.kind==='fft').length;
const fftHash=(id:string)=>digest(path.join(workspace,'objects',id,'data.npy'));
const tag=createHash('sha256').update(directory).digest('hex').slice(0,10);
let serial=0;
const timings:Row[]=[],checks:string[]=[],panels:Row[]=[];
const report:Row={scope:'F1a public synthetic, actual compiled MCP/Python/Panel HTTP',started_utc:new Date().toISOString(),timings,checks,panels,
 not_tested:['real specimen accuracy','fresh model/plugin-discovery session','browser gestures until independently recorded','GPA/twin/dislocation labels','statistical confidence']};
const started=performance.now();
const call=async(name:string,args:Row={},client=first):Promise<Row>=>{
 const readOnly=['image_info','image_panel_current','analysis_read'].includes(name),requestId=readOnly?null:args.request_id??`f1a-${tag}-${++serial}`,t=performance.now();
 try{const reply=await client.tool(name,readOnly?args:{...args,request_id:requestId});if(reply.png!==undefined){const png=text(reply.png);assert.equal(Buffer.from(png,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');}return row(reply.data);}
 finally{timings.push({tool:name,request_id:requestId,elapsed_ms:performance.now()-t});}
};
const read=async(id:string,client=first)=>call('image_info',{object_id:id},client);
const theta=number(row(oracle.rotation).degrees);
const peakOptions={min_separation_bins:2,exclude_dc_radius_bins:3,threshold_rel:.18,refinement:'none'};
const grid={rect:[0,0,256,192],window_sizes:[64,128],stride_xy:[64,64],max_windows:24,coordinate_domain:'pixel',window:'none',subtract_mean:true,max_peaks:16,peak_options:peakOptions,max_size:640};
const maps=(objectId:string,tolerance=.003)=>call('image_domain_map',{object_id:objectId,tolerance,angles_degrees:[0,theta,-theta,90],max_size:640});
const sourcePath=(name:string)=>path.join(fixture,text(row(files[name]).path));
const openFrame=async(name:string,calibrated=false)=>{
 const opened=await call('image_open',{source_path:sourcePath(name)}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});assert.equal(frame.dtype,'float32');
 return calibrated?{frame,selected:await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.02,y:.02,unit:'nm'},source_text:'Public synthetic X/Y .02nm/pixel; not experimental calibration.'})}:{frame,selected:frame};
};
try{
 await first.rpc('initialize');const catalog=rows(row(row(await first.rpc('tools/list')).result).tools).map(r=>r.name);
 for(const name of ['image_spatial_field','image_domain_map','image_remeasure','analysis_read'])assert.ok(catalog.includes(name));
 const {frame,selected}=await openFrame('two-orientations',true),source=sourcePath('two-orientations'),sourceHash=digest(source),arrayHash=digest(text(frame.array_path));
 const field=await call('image_spatial_field',{object_id:selected.object_id,...grid,request_id:`field-${tag}`});
 const samples=rows(field.samples);assert.equal(samples.length,18);assert.ok(rows(field.batches).length>=3);
 assert.equal(row(field.costs).worker_processes,1);assert.equal(row(field.costs).new_fft_count,18);assert.equal(row(field.costs).fft_pixels,147456);assert.equal(row(field.costs).startup_seconds,null);
 assert.equal(fftCount(),18,'Each distinct sampled window has one ordinary FFT');
 const initialIds=ids(samples),hashes=initialIds.map(fftHash);
 for(const s of samples){assert.equal(row(s.source_array).dtype,'float32');assert.equal(row(s.frame_identity).frame_object_id,frame.object_id);assert.equal(s.uncertainty,null);const r=list(s.rect_xyxy).map(number);assert.deepEqual(s.center_xy,[(r[0]!+r[2]!-1)/2,(r[1]!+r[3]!-1)/2]);}
 const mapped=await maps(text(field.object_id));assert.equal(fftCount(),18);
 report.provider_reported_costs={field:field.costs,domain_map:mapped.costs,interpretation:'Provider measures compute and render/write; startup_seconds remains unknown, not zero'};
 const edges=rows(mapped.edges);assert.ok(edges.length>0);assert.ok(rows(mapped.domains).length>=2,'Two explicit orientations yield separate local candidate supports');
 const different=edges.filter(e=>e.status==='different');assert.ok(different.length>0,'Orientation-sensitive edges must not be merged by allowed rotation');
 assert.ok(different.some(e=>rows(row(e.lattice_geometry).candidates).some(c=>c.accepted_descriptive_match===true)),'Some distinct orientations share full geometry after an explicit rotation');
 assert.ok(rows(mapped.boundary_bands).length>0);assert.ok(list(mapped.unknown_sample_indices).length>0,'Mixed windows remain unknown rather than being forced into a pure domain');
 const bands=rows(mapped.boundary_bands);assert.ok(bands.some(b=>{const r=list(b.rect_xyxy).map(number);return r[0]!<=128&&r[2]!>=128;}));report.boundary_truth_relation={analytic_x:128,candidate_bands:bands,interpretation:'Support bands around sampled differences; not boundary localization uncertainty'};
 checks.push('18 multiscale windows in ordinary bounded batches, explicit provenance and null uncertainty; fixed-angle orientation differences stay distinct from rotated lattice compatibility');

 // Check all saved bins against direct finite DFT, independent of numpy.fft.
 const numerical=path.join(directory,'numerical-input.json');writeFileSync(numerical,JSON.stringify({source,frame,field,oracle}));
 report.independent_oracle=JSON.parse(execute(['-c',String.raw`import json,sys,numpy as np,tifffile
p=json.load(open(sys.argv[1],encoding='utf8'));a=tifffile.imread(p['source']);saved=np.load(p['frame']['array_path'],allow_pickle=False)
assert a.dtype==np.float32 and np.array_equal(a,saved) and a.min()<0;out=[]
for s in p['field']['samples']:
 x0,y0,x1,y1=s['rect_xyxy'];v=a[y0:y1,x0:x1].astype(np.float64);v-=v.mean();h,w=v.shape
 ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
 expected=ey@v@ex.T;expected=np.roll(np.roll(expected,h//2,0),w//2,1)
 actual=np.load(sys.argv[2]+'/'+s['fft_object_id']+'/data.npy',allow_pickle=False);error=float(np.max(np.abs(expected-actual)));assert error<1e-7,error
 out.append({'sample_index':s['sample_index'],'direct_dft_max_error':error})
print(json.dumps({'signed_float32_unchanged':True,'windows':out,'independent_source_truth':'analytic cosines and exact piecewise masks'}))`,numerical,path.join(workspace,'objects')]));

 // Equal scientific budget baseline is the existing uniform sliding-window
 // composition itself, not a competing detector or independent accuracy oracle.
 const baselineStart=performance.now(),baselineAtlases:Row[]=[];
 for(let offset=0;offset<samples.length;offset+=8){const group=samples.slice(offset,offset+8);baselineAtlases.push(await call('image_spatial_atlas',{object_id:selected.object_id,rects:group.map(s=>s.rect_xyxy),window:grid.window,subtract_mean:true,max_peaks:grid.max_peaks,peak_options:peakOptions,max_size:640}));}
 const baselineRegions=baselineAtlases.flatMap(a=>rows(a.regions));assert.equal(baselineRegions.length,samples.length);
 const baselineCheck=path.join(directory,'baseline-input.json');writeFileSync(baselineCheck,JSON.stringify({samples,regions:baselineRegions}));
 report.baseline=JSON.parse(execute(['-c',String.raw`import json,sys,numpy as np
p=json.load(open(sys.argv[1],encoding='utf8'));pixels=0
for s,r in zip(p['samples'],p['regions']):
 assert s['rect_xyxy']==r['rect'];a=np.load(sys.argv[2]+'/'+s['fft_object_id']+'/data.npy',allow_pickle=False);b=np.load(sys.argv[2]+'/'+r['fft_object_id']+'/data.npy',allow_pickle=False)
 assert np.array_equal(a,b);pixels+=a.size
 def vs(rows): return sorted(tuple(row['frequency_cycles_per_pixel']) for row in rows)
 assert vs(s['measurements'])==vs(r['measurements'])
print(json.dumps({'scope':'same existing uniform sliding-window FFT/detector composition; equality baseline, not independent method','windows':len(p['samples']),'fft_pixels_each_path':pixels,'all_arrays_and_vectors_equal':True}))`,baselineCheck,path.join(workspace,'objects')]));
 row(report.baseline).elapsed_ms=performance.now()-baselineStart;assert.equal(row(report.baseline).fft_pixels_each_path,147456);

 // Explicit bounds must fail before a child FFT is submitted.
 const beforeBudget=fftCount();await assert.rejects(()=>call('image_spatial_field',{...grid,object_id:selected.object_id,max_windows:8}));assert.equal(fftCount(),beforeBudget);
 const beforeRevision=fftCount(),sample=samples[0]!,oldIds=list(sample.measurement_object_ids).map(text);assert.ok(oldIds.length>=4);
 const old=await read(oldIds[0]!),points=list(old.points).map(p=>list(p).map(number));points[1]=[points[1]![0]!+.01,points[1]![1]!];
 const moved=await call('image_remeasure',{object_id:sample.view_object_id,measurement_object_id:oldIds[0],points,source_text:'Explicit public synthetic point correction; test immutable revision, not crystal interpretation.'});
 const revised=await call('image_spatial_field',{...grid,object_id:selected.object_id,previous_field_id:field.object_id,measurement_overrides:[{sample_index:0,measurement_object_ids:[moved.object_id,...oldIds.slice(1)]}]});
 assert.deepEqual(ids(rows(revised.samples)),initialIds);assert.deepEqual(initialIds.map(fftHash),hashes);assert.equal(fftCount(),beforeRevision);
 assert.equal(row(revised.costs).new_fft_count,0);assert.equal(row(revised.costs).reused_fft_count,18);
 assert.equal(list(rows(revised.samples)[0]!.measurement_object_ids)[0],moved.object_id);
 for(let i=1;i<samples.length;i++)assert.deepEqual(rows(revised.samples)[i]!.measurement_object_ids,samples[i]!.measurement_object_ids);
 const revisedMap=await maps(text(revised.object_id));assert.equal(fftCount(),beforeRevision);
 report.revision={field:revised.object_id,domains:revisedMap.object_id,corrected_measurement:moved.object_id,all_fft_ids_hashes_unchanged:true,other_measurement_lists_unchanged:true};
 checks.push('Independent direct DFT checks every sampled bin; equal-budget old uniform atlas baseline agrees; budget rejection submits no FFT; committed correction revises field/map while all spectra and unaffected measurements remain unchanged');

 const controls:Row[]=[];
 for(const name of ['single-A','single-A-shifted','single-B-rotated','constant-negative','seeded-noise','square-symmetry','narrow-B-strip']){
  const input=await openFrame(name),controlField=await call('image_spatial_field',{object_id:input.selected.object_id,...grid,rect:[64,0,192,128],window_sizes:[64],max_windows:8,max_peaks:name==='seeded-noise'?4:16});
  const controlMap=await maps(text(controlField.object_id));const boundaryCount=rows(controlMap.boundary_bands).length;
  if(['single-A','single-A-shifted','single-B-rotated','constant-negative'].includes(name))assert.equal(boundaryCount,0,`${name} must not generate false boundary candidates`);
  if(['constant-negative','seeded-noise'].includes(name))assert.equal(list(controlMap.unknown_sample_indices).length,rows(controlField.samples).length);
  if(name==='square-symmetry')assert.ok(rows(controlMap.edges).some(e=>row(e.lattice_geometry).status==='ambiguous'),'Unknown square symmetry retains both zero and ninety-degree alternatives');
  assert.ok(rows(controlField.samples).every(s=>row(s.source_array).dtype==='float32'));
  // Pixel-only controls must not acquire a physical scale or period unit.
  assert.equal(controlField.coordinate_domain,'pixel');assert.equal(controlField.period_unit,'pixel');assert.ok(!JSON.stringify(controlField).includes('"period_unit":"nm"'));
  controls.push({case:name,field:controlField.object_id,map:controlMap.object_id,boundary_count:boundaryCount,domain_count:rows(controlMap.domains).length,unknown_count:list(controlMap.unknown_sample_indices).length,sample_count:rows(controlField.samples).length});
 }
 report.controls=controls;
 const sensitivity=await maps(text(field.object_id),.001);report.parameter_sensitivity={original_tolerance:.003,alternative_tolerance:.001,original_boundaries:bands.length,alternative_boundaries:rows(sensitivity.boundary_bands).length,
  scales:rows(field.samples).map(s=>({sample_index:s.sample_index,size:s.scale_pixels,status:s.status,families:row(s.features).family_count})),interpretation:'Threshold and window support affect candidate evidence, not calibrated confidence'};

 const exports:Row[]=[];
 for(const [label,value]of [['field',revised],['domains',revisedMap]] as const){const e=await call('image_export',{object_id:value.object_id,output_dir:path.join(directory,label+'-export')});for(const [name,sha]of Object.entries(row(e.exported_files_sha256)))assert.equal(digest(path.join(text(e.output_dir),name)),sha);assert.ok(Object.keys(row(e.exported_files_sha256)).some(n=>n.endsWith('.csv')));exports.push({...e,source_role:label});}
 report.exports=exports;
 const exportInput=path.join(directory,'export-input.json');writeFileSync(exportInput,JSON.stringify({field:revised,domains:revisedMap,exports}));
 report.export_readback=JSON.parse(execute(['-c',String.raw`import json,sys,csv,pathlib,numpy as np
p=json.load(open(sys.argv[1],encoding='utf8'));out=[]
for item in p['exports']:
 key=item['source_role'];obj=p[key];directory=pathlib.Path(item['output_dir']);prefix='spatial-field' if key=='field' else 'domain-map'
 saved=json.load(open(directory/(prefix+'.json'),encoding='utf8'));assert saved['samples']==obj['samples']
 table=list(csv.DictReader(open(directory/(prefix+'.csv'),encoding='utf-8-sig',newline='')));assert len(table)==len(obj['samples'])
 for r,s in zip(table,obj['samples']):
  assert int(r['sample_index'])==s['sample_index'] and int(r['scale_pixels'])==s['scale_pixels']
  assert [int(r[k]) for k in ['x0','y0','x1','y1']]==s['rect_xyxy']
  assert r['fft_object_id']==s['fft_object_id'] and r['measurement_object_ids'].split('|')==s['measurement_object_ids']
  if s.get('domain_status')=='unknown': assert not r['candidate_domain']
 shape=obj['samples'][0]['source_array']['shape_yx'];coverage=np.zeros(shape,dtype=np.uint8);unknown=np.ones(shape,dtype=np.uint8)
 for s in obj['samples']:
  x0,y0,x1,y1=s['rect_xyxy'];coverage[y0:y1,x0:x1]=1
  if s.get('domain_status',s['status']) in ('valid','candidate'): unknown[y0:y1,x0:x1]=0
 for s in obj['samples']:
  if s.get('domain_status',s['status']) not in ('valid','candidate'):
   x0,y0,x1,y1=s['rect_xyxy'];unknown[y0:y1,x0:x1]=1
 for name,expected in [('sampled-support.npy',coverage),('unknown-support.npy',unknown)]:
  actual=np.load(directory/name,allow_pickle=False);assert actual.dtype==np.uint8 and np.array_equal(actual,expected)
 out.append({'kind':key,'csv_rows':len(table),'source_rectangles_fft_measurement_ids_exact':True,'support_masks_exact':True})
print(json.dumps(out))`,exportInput]));
 const contextId=`public-f1a-${tag}`,created=await call('analysis_create',{analysis_id:contextId,reason:'Public F1a evidence, not a phase map'});
 const updated=await call('analysis_update',{analysis_id:contextId,expected_revision:row(created.context).revision,selections:{experiment:{provider:'image',object_id:selected.object_id},spatial_field:{provider:'image',object_id:revised.object_id},domains:{provider:'image',object_id:revisedMap.object_id}},reason:'Retain corrected multiscale observations and candidate domains'});
 const panel=await call('image_panel_open',{object_id:revisedMap.object_id});const connection=row(JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',text(panel.panel_id)+'.json'),'utf8')));panels.push({panel_id:panel.panel_id,url:panel.panel_url,pid:connection.pid});assert.equal((await fetch(text(panel.panel_url))).status,200);
 const current=await call('image_panel_current',{panel_id:panel.panel_id});assert.equal(row(row(current.view).domain_evidence).object_id,revisedMap.object_id);
 const imageStarted=performance.now(),rawImages=rows(row(row(await first.rpc('tools/call',{name:'image_panel_current',arguments:{panel_id:panel.panel_id}})).result).content).filter(c=>c.type==='image');
 timings.push({tool:'image_panel_current',request_id:null,raw_image_content_audit:true,elapsed_ms:performance.now()-imageStarted});
 assert.equal(rawImages.length,2,'Panel returns source overview and domain map as separate actual image blocks');
 const imageHashes=rawImages.map(c=>{assert.equal(c.mimeType,'image/png');const bytes=Buffer.from(text(c.data),'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return createHash('sha256').update(bytes).digest('hex');});
 const providerMapHash=digest(path.join(workspace,'objects',text(revisedMap.object_id),'preview.png'));assert.ok(imageHashes.includes(providerMapHash));
 report.panel_image_content={image_blocks:rawImages.length,png_sha256:imageHashes,provider_map_png_sha256:providerMapHash,scientific_objects_created:false};
 const beforeRecovery={objects:objectFiles().length,ffts:fftCount()},fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 const context=await call('analysis_read',{analysis_id:contextId},fresh);assert.equal(row(context.context).revision,row(updated.context).revision);
 assert.equal((await call('image_result',{request_id:`field-${tag}`},fresh)).object_id,field.object_id);assert.equal((await read(text(revisedMap.object_id),fresh)).object_id,revisedMap.object_id);
 assert.deepEqual({objects:objectFiles().length,ffts:fftCount()},beforeRecovery);assert.equal(digest(source),sourceHash);assert.equal(digest(text(frame.array_path)),arrayHash);assert.deepEqual(initialIds.map(fftHash),hashes);
 const requests=readdirSync(path.join(workspace,'requests')).map(f=>row(JSON.parse(readFileSync(path.join(workspace,'requests',f),'utf8'))));
 report.actual_cost={provider_request_records:requests.length,fft_object_count:fftCount(),fft_pixels_all_operations:objects().filter(r=>r.kind==='fft').reduce((sum,r)=>sum+list(r.shape_yx).map(number).reduce((a,b)=>a*b,1),0),formal_tool_calls:timings.length,
  elapsed_ms:performance.now()-started,worker_process_count:null,worker_process_note:'Not inferred from provider records; an operation receipt is not a process invocation. Tool timings include startup, validation, compute and render unless separately reported by provider.'};
 report.references={frame:frame.object_id,selected:selected.object_id,field:field.object_id,domains:mapped.object_id,revised_field:revised.object_id,revised_domains:revisedMap.object_id,context:contextId};
 checks.push('Uncalibrated controls retain pixel geometry; exports read back exact hashes; actual Panel HTTP exposes saved candidates; a new MCP session restores named context and original requests without creating science');
 report.result='PASS';report.completed_utc=new Date().toISOString();writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('PASS: F1a compiled MCP/Python, independent DFT, equal-budget baseline, controls, correction/FFT reuse, export, context recovery and Panel HTTP.');
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.elapsed_ms=performance.now()-started;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw error;}
finally{for(const client of clients)await client.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;if(!retained)for(const p of panels){try{process.kill(number(p.pid));}catch{}}console.log('Public evidence: '+path.join(directory,'report.json'));}
