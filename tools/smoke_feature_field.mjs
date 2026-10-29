// Actual public MCP acceptance for sparse feature fields. No experimental data,
// segmentation score or independent confidence is inferred from this fixture.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'feature-field-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=args=>{const r=spawnSync(python,['-B',...args],{encoding:'utf8',timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const absolutePython=execute(['-c','import sys;print(sys.executable)']),fixture=path.join(directory,'fixture');
execute([path.join(repo,'examples','make_domain_trial.py'),fixture]);
const oracle=JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8')),truth=oracle.feature_field;
const basePath=process.env.MICROSCOPY_FEATURE_BASE_REPORT,base=basePath?JSON.parse(readFileSync(basePath,'utf8')):null;
if(base)assert.equal(base.result,'PASS','Only an explicitly selected completed public R3 smoke may supply saved R2 references');
const workspaceRoot=base?path.join(path.dirname(basePath),'workspace'):path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,workspace_root:workspaceRoot,structures:false},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const client=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex'),objects=()=>readdirSync(path.join(workspace,'objects'));
const fftCount=()=>objects().filter(id=>JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')).kind==='fft').length;
const fftHash=id=>hash(path.join(workspace,'objects',id,'data.npy'));
const png=reply=>{assert.ok(reply.png);assert.equal(Buffer.from(reply.png,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const clients=[client()],first=clients[0],start=performance.now();let serial=0;
const runTag=createHash('sha256').update(directory).digest('hex').slice(0,12);
const report={started_utc:new Date().toISOString(),scope:'actual MCP/Python sparse feature-field composition on public synthetic data',base_report:basePath??null,panels:[],checks:[],timings:[],not_tested:['real specimen feature accuracy','segmented phase or boundary accuracy','statistical uncertainty','browser gestures','fresh model Skill use']};
const call=async(name,args={},target=first)=>{const t=performance.now(),request_id=args.request_id??'field-'+runTag+'-'+(++serial);try{return await target.tool(name,{...args,request_id});}finally{report.timings.push({tool:name,request_id,elapsed_ms:performance.now()-t});}};
const field=async(objectId,domain='pixel',display='family_count')=>{const before=fftCount(),r=await call('image_feature_field',{object_id:objectId,coordinate_domain:domain,display_feature:display,max_size:640});png(r);assert.equal(fftCount(),before,'Feature materialization must not create an FFT');return r;};
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);
const vectors=rows=>rows.map(r=>r.frequency_cycles_per_pixel).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);

try{
  await first.rpc('initialize');const catalog=(await first.rpc('tools/list')).result.tools.map(t=>t.name);assert.ok(catalog.includes('image_feature_field'));
  const source=path.join(fixture,truth.boundary_source),sourceHash=hash(source);
  const opened=(await call('image_open',{source_path:source})).data;
  const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:0})).data;assert.equal(frame.dtype,'float32');
  const calibration=(await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.025,y:-.03,unit:'nm'},source_text:'Public synthetic feature test: signed anisotropic X+0.025, Y-0.03 nm/pixel; not experimental calibration.'})).data;
  const peakOptions={min_separation_bins:2,exclude_dc_radius_bins:3,threshold_rel:.15,refinement:'none'};
  const atlas=(await call('image_spatial_atlas',{object_id:calibration.object_id,rects:truth.rects,window:'none',subtract_mean:true,max_peaks:16,peak_options:peakOptions})).data;
  const fftHashes=atlas.regions.map(row=>fftHash(row.fft_object_id));
  const pixelReply=await field(atlas.object_id),pixel=pixelReply.data;assert.equal(pixel.field_schema_version,1);assert.equal(pixel.samples.length,8);
  writeFileSync(path.join(directory,'field-preview.png'),Buffer.from(pixelReply.png,'base64'));
  for(const [i,sample] of pixel.samples.entries()){
    const rect=truth.rects[i];assert.deepEqual(sample.rect_xyxy,rect);assert.deepEqual(sample.center_xy,[(rect[0]+rect[2]-1)/2,(rect[1]+rect[3]-1)/2]);
    assert.equal(sample.coordinate_space,'source_pixels');assert.deepEqual(sample.measurement_object_ids,atlas.regions[i].measurement_object_ids);assert.equal(sample.uncertainty,null);
  }
  for(const i of [0,1]){assert.equal(pixel.samples[i].features.family_count,2);assert.equal(pixel.samples[i].status,'valid');near(pixel.samples[i].features.shortest_period,128/15);}
  const physical=(await field(atlas.object_id,'physical','shortest_period')).data;
  for(const sample of physical.samples)for(const family of sample.features.families){
    const m=atlas.regions[sample.sample_index].measurements.find(row=>family.measurement_object_ids.includes(row.measurement_object_id));assert.ok(m);
    const [fx,fy]=m.frequency_cycles_per_pixel;near(family.period,1/Math.hypot(fx/.025,fy/-.03));
  }
  report.checks.push('Field samples retain exact source rectangles, pixel-centre centroids, ordinary measurement IDs and unknown uncertainty; physical periods use signed anisotropic calibration without2pi');

  // The baseline is the pre-existing primitive tool path, not a new detector.
  const baselineStart=performance.now();
  const baselineFFT=(await call('image_fft',{object_id:calibration.object_id,rect:truth.rects[0],window:'none',subtract_mean:true})).data;
  const baselinePeaks=(await call('image_peaks',{object_id:baselineFFT.object_id,max_peaks:16,...peakOptions})).data;
  const baselineMeasures=(await call('image_peak_measurements',{object_id:baselinePeaks.object_id,max_peaks:16})).data;
  const baselineElapsed=performance.now()-baselineStart;
  assert.deepEqual(vectors(baselineMeasures.measurements),vectors(atlas.regions[0].measurements));
  const numericalInput=path.join(directory,'numerical-input.json');writeFileSync(numericalInput,JSON.stringify({source,frame,atlas,pixel,physical,baselineFFT,oracle},null,2));
  report.independent_oracle=JSON.parse(execute(['-c',String.raw`
import json,sys,numpy as np,tifffile
p=json.load(open(sys.argv[1],encoding='utf8'));a=tifffile.imread(p['source']);saved=np.load(p['frame']['array_path'],allow_pickle=False)
assert a.dtype==np.float32 and np.array_equal(a,saved) and a.min()<0;checks=[]
for r in p['atlas']['regions']:
 x0,y0,x1,y1=r['rect'];v=a[y0:y1,x0:x1].astype(np.float64);v-=v.mean();h,w=v.shape
 ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
 expected=ey@v@ex.T;expected=np.roll(np.roll(expected,h//2,axis=0),w//2,axis=1)
 actual=np.load(sys.argv[2]+'/'+r['fft_object_id']+'/data.npy',allow_pickle=False);e=float(np.max(np.abs(expected-actual)));assert e<1e-7,e
 checks.append({'region_index':r['region_index'],'all_bin_direct_dft_max_error':e})
base=np.load(p['baselineFFT']['array_path'],allow_pickle=False);first=np.load(sys.argv[2]+'/'+p['atlas']['regions'][0]['fft_object_id']+'/data.npy',allow_pickle=False)
assert np.array_equal(base,first)
for i in [0,1]:
 expected=p['oracle']['regions'][i]['all_tones_cycles_per_pixel'];found=[r['frequency_cycles_per_pixel'] for r in p['atlas']['regions'][i]['measurements']]
 assert len(found)==len(expected) and all(any(np.linalg.norm(np.array(q)-e)<1e-10 for q in found) for e in expected)
print(json.dumps({'signed_source_preserved':True,'all_bin_direct_dft':checks,'primitive_fft_array_equal':True,'analytic_pure_window_vectors_equal':True}))`,numericalInput,path.join(workspace,'objects')]));
  report.baseline={scope:'same existing provider NumPy FFT and detector primitives; not independent validation or a speed comparison with the8-region atlas',region_index:0,fft_array_equal:true,selected_measurement_vectors_equal:true,elapsed_ms:baselineElapsed};

  const beforeCompare=fftCount();
  const compared=(await call('image_local_signature_compare',{object_id:atlas.object_id,reference_index:0,target_indices:[1,2],angles_degrees:[0,oracle.rotation.angle_degrees,oracle.rotation.angle_degrees-180,90],coordinate_domain:'pixel',tolerance:.001})).data;
  assert.equal(fftCount(),beforeCompare);
  const comparedField=(await field(compared.object_id)).data;assert.equal(comparedField.parent_object_id,compared.object_id);assert.ok(comparedField.comparison_hypotheses);
  assert.ok(JSON.stringify(comparedField.comparison_hypotheses).includes('36.869897'),'Comparison candidates survive as hypotheses, not categorical labels');
  report.checks.push('Primitive FFT/detection baseline agrees exactly; every multiscale FFT bin agrees with independent direct DFT; atlas and comparison fields add no FFT');

  const controlsOpen=(await call('image_open',{source_path:path.join(fixture,truth.controls_source)})).data;const controls=[];
  for(const index of [0,1]){
    const f=(await call('image_frame',{object_id:controlsOpen.object_id,frame_index:index})).data;
    const a=(await call('image_spatial_atlas',{object_id:f.object_id,rects:[[0,0,128,128]],window:'none',subtract_mean:true,max_peaks:8,peak_options:peakOptions})).data;
    const result=(await field(a.object_id)).data;controls.push(result.samples[0]);
  }
  assert.equal(controls[0].features.family_count,0);assert.equal(controls[0].status,'insufficient_evidence');
  assert.notEqual(controls[1].status,'valid','Peak-limited isotropic noise must remain undetermined');report.controls=controls;
  let jointId=base?.r2?.joint_object_id;
  if(!jointId){
    const openedSequence=(await call('image_open',{source_path:path.join(fixture,oracle.sequence_source)})).data,frames=[];
    for(let i=0;i<3;i++)frames.push((await call('image_frame',{object_id:openedSequence.object_id,frame_index:i})).data);
    const seq=(await call('image_sequence_create',{frames:frames.map(row=>({object_id:row.object_id})),axis:{meaning:'unknown',source_text:'Public synthetic A/B/mixed order, no physical time or depth.'}})).data;
    const corr=(await call('image_region_correspondence',{sequence_object_id:seq.object_id,reference_index:0,rect:oracle.sequence.rect,mode:'identity',source_text:'Explicit synthetic common coordinate grid; no same-atom inference.'})).data;
    jointId=(await call('image_joint_observations',{correspondence_object_id:corr.object_id,window:'none',subtract_mean:true,max_peaks:16,peak_options:peakOptions,frequency_tolerance_cycles_per_pixel:.001})).data.object_id;
  }
  const joint=(await first.tool('image_info',{object_id:jointId})).data;
  const jointField=(await field(jointId)).data;assert.equal(jointField.samples.length,joint.frame_observations.length);
  for(const row of jointField.samples){assert.equal(row.index_kind,'frame_index');assert.deepEqual(row.rect_xyxy,joint.frame_observations[row.sample_index].target_rect);assert.ok(row.mapping_evidence);assert.ok(row.frame_identity);}
  const unknownPhysical=(await field(jointId,'physical','shortest_period')).data;
  assert.ok(unknownPhysical.samples.every(row=>row.features.family_count===null&&row.features.shortest_period===null&&row.status==='insufficient_evidence'));
  report.checks.push('Uniform/noise controls remain undetermined; R2 fields retain actual frame/mapping coordinates; unknown physical calibration remains null rather than zero');

  // Report support coverage and status frequency, not a dense map or accuracy.
  const [height,width]=truth.boundary_source_shape_yx,mask=new Uint8Array(height*width),validMask=new Uint8Array(height*width);
  report.window_sensitivity=pixel.samples.map(row=>{const [x0,y0,x1,y1]=row.rect_xyxy;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){mask[y*width+x]=1;if(row.status==='valid')validMask[y*width+x]=1;}
    return {sample_index:row.sample_index,window_role:truth.window_roles[row.sample_index],width:x1-x0,height:y1-y0,center_xy:row.center_xy,fourier_sampling_cycles_per_pixel:[1/(x1-x0),1/(y1-y0)],analytic_A_support_fraction:Math.max(0,Math.min(x1,128)-x0)/(x1-x0),status:row.status,family_count:row.features.family_count,shortest_period:row.features.shortest_period};});
  const counts=Object.fromEntries(['valid','ambiguous','insufficient_evidence'].map(status=>[status,pixel.samples.filter(row=>row.status===status).length]));
  report.coverage={sample_count:pixel.samples.length,sample_status_counts:counts,valid_sample_fraction:counts.valid/pixel.samples.length,undetermined_sample_fraction:1-counts.valid/pixel.samples.length,selected_roi_union_fraction:mask.reduce((a,b)=>a+b,0)/mask.length,valid_roi_support_union_fraction:validMask.reduce((a,b)=>a+b,0)/validMask.length,interpretation:'ROI support coverage only; overlap is correlated and no unobserved pixel receives an inferred feature or phase label'};
  report.window_sensitivity_contrasts=[['pure_A_128_to64',0,4],['pure_B_128_to64',1,5],['boundary128_shift16',2,3],['boundary128_to64',2,6]].map(([label,a,b])=>({label,sample_indices:[a,b],family_count_change:pixel.samples[b].features.family_count-pixel.samples[a].features.family_count,shortest_period_change:pixel.samples[b].features.shortest_period-pixel.samples[a].features.shortest_period,interpretation:'Observed sampling/window dependence, not localization uncertainty or boundary-position accuracy'}));

  const exported=(await call('image_export',{object_id:comparedField.object_id,output_dir:path.join(directory,'field-export')})).data;
  for(const [name,digest] of Object.entries(exported.exported_files_sha256))assert.equal(hash(path.join(exported.output_dir,name)),digest);
  const savedJSON=JSON.parse(readFileSync(comparedField.field_path,'utf8'));assert.equal(savedJSON.samples.length,comparedField.samples.length);
  report.csv_readback=JSON.parse(execute(['-c',String.raw`
import csv,json,sys
rows=list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig',newline='')));saved=json.load(open(sys.argv[2],encoding='utf-8'));samples={s['sample_index']:s for s in saved['samples']}
assert len(rows)==sum(max(1,len(s['features']['families'])) for s in samples.values())
for row in rows:
 s=samples[int(row['sample_index'])];assert row['status']==s['status'] and row['source_array_sha256']==s['source_array']['array_sha256']
 assert [float(row[k]) for k in ['center_x','center_y']]==s['center_xy']
 if row['family_id']:
  f=next(f for f in s['features']['families'] if f['family_id']==row['family_id']);assert [float(row[k]) for k in ['gx','gy']]==f['vector_xy']
  assert float(row['period'])==f['period'] and row['measurement_object_ids'].split('|')==f['measurement_object_ids']
print(json.dumps({'row_count':len(rows),'sample_count':len(samples),'columns':list(rows[0]),'centers_vectors_periods_provenance_roundtrip':True}))`,comparedField.table_path,comparedField.field_path]));
  assert.ok(Object.keys(exported.exported_files_sha256).some(name=>name.endsWith('.csv')));assert.ok(Object.keys(exported.exported_files_sha256).some(name=>name.endsWith('.json')));
  const analysisId='public-feature-field-'+runTag,created=(await call('analysis_create',{analysis_id:analysisId,reason:'Public boundary/control feature-field acceptance.'})).data;
  const updated=(await call('analysis_update',{analysis_id:analysisId,expected_revision:created.context.revision,selections:{atlas:{provider:'image',object_id:atlas.object_id},domain_hypotheses:{provider:'image',object_id:compared.object_id},field:{provider:'image',object_id:comparedField.object_id}},reason:'Bind sparse field to exact source atlas and explicit comparison hypotheses.'})).data;
  assert.equal(updated.context.slots.field.dependsOn.domain_hypotheses,updated.context.fingerprints.domain_hypotheses);
  const beforeRead={objects:objects().length,ffts:fftCount()},fresh=client();clients.push(fresh);await fresh.rpc('initialize');
  const restored=(await fresh.tool('analysis_read',{analysis_id:analysisId})).data;assert.equal(restored.context.slots.field.ref.objectId,comparedField.object_id);
  assert.equal((await fresh.tool('image_info',{object_id:comparedField.object_id})).data.field_schema_version,1);assert.deepEqual({objects:objects().length,ffts:fftCount()},beforeRead);
  const panel=await call('image_panel_open',{object_id:comparedField.object_id},fresh);png(panel);
  const connection=JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',panel.data.panel_id+'.json'),'utf8'));report.panels.push({panel_id:panel.data.panel_id,url:panel.data.panel_url,pid:connection.pid});
  const panelRaw=await fresh.rpc('tools/call',{name:'image_panel_current',arguments:{panel_id:panel.data.panel_id}});
  assert.ok(!panelRaw.result.isError);const images=panelRaw.result.content.filter(item=>item.type==='image');assert.ok(images.length>=2,'Panel exposes field as a second actual MCP image');
  writeFileSync(path.join(directory,'panel-field-image.png'),Buffer.from(images[1].data,'base64'));
  const text=panelRaw.result.content.find(item=>item.type==='text').text;assert.ok(!text.includes('iVBORw0KGgo'),'Image bytes must not be dumped into text content');
  assert.equal((await fetch(panel.data.panel_url)).status,200);
  assert.equal(hash(source),sourceHash);assert.deepEqual(atlas.regions.map(row=>fftHash(row.fft_object_id)),fftHashes);
  report.references={atlas:atlas.object_id,pixel_field:pixel.object_id,physical_field:physical.object_id,comparison:compared.object_id,comparison_field:comparedField.object_id,r2_joint:jointId,r2_field:jointField.object_id,r2_unknown_physical_field:unknownPhysical.object_id,context:analysisId,context_revision:updated.context.revision};
  report.checks.push('Versioned field JSON/CSV export hashes read back; named context binds exact comparison fingerprint; fresh-client recovery creates no science; Panel supplies field image content plus HTTP');
  report.runtime_ms=performance.now()-start;report.result='PASS';report.completed_utc=new Date().toISOString();writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS: sparse feature MCP, primitive baseline + direct DFT, coverage/window sensitivity/runtime, controls, R2 mapping, no field FFT, export and fresh context/Panel recovery.');
}catch(error){report.runtime_ms=performance.now()-start;report.result='FAIL';report.error=error.stack;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw error;}
finally{for(const c of clients)await c.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;if(!retained)for(const p of report.panels){try{process.kill(p.pid);}catch{}}console.log('Public evidence: '+path.join(directory,'report.json'));}
