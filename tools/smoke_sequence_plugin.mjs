// Reusable R2 acceptance: installed-style launcher -> MCP stdio -> Python.
// This is protocol/numerical/Panel HTTP evidence, not a model or browser trial.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw new Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'sequence-plugin-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(args)=>{const result=spawnSync(python,['-B',...args],{encoding:'utf8',timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const absolutePython=execute(['-c','import sys;print(sys.executable)']);
const fixture=path.join(directory,'fixture');
execute([path.join(repo,'examples','make_sequence_trial.py'),fixture]);
const oracle=JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8'));
const workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,workspace_root:workspaceRoot,structures:false},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const objectDir=id=>path.join(workspace,'objects',id);
const arrayHash=id=>hash(path.join(objectDir(id),'data.npy'));
const objectCount=()=>readdirSync(path.join(workspace,'objects')).length;
const fftCount=()=>readdirSync(path.join(workspace,'objects')).filter(id=>JSON.parse(readFileSync(path.join(objectDir(id),'object.json'),'utf8')).kind==='fft').length;
const png=reply=>{assert.ok(reply.png,'Actual MCP image content missing');assert.equal(Buffer.from(reply.png,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const clients=[],client=makeClient();clients.push(client);let serial=0;
const call=(name,args={},target=client)=>target.tool(name,{...args,request_id:args.request_id??'sequence-smoke-'+(++serial)});
const report={scope:'actual plugin MCP stdio, independent Python, Panel HTTP; model/browser gestures separate',started_utc:new Date().toISOString(),panels:[],checks:[],software:{node:process.version}};

try{
  await client.rpc('initialize');
  const catalog=(await client.rpc('tools/list')).result.tools.map(row=>row.name);
  for(const name of ['image_sequence_create','image_region_correspondence','image_joint_observations','analysis_read','image_panel_show'])assert.ok(catalog.includes(name),name);
  report.software.python=JSON.parse(execute(['-c',"import json,sys,importlib.metadata as m;print(json.dumps({'python':sys.version,**{n:m.version(n) for n in ['numpy','scipy','Pillow','tifffile']}}))"]));
  const source=path.join(fixture,'synthetic-reconstructed-sequence.tiff'),sourceHash=hash(source);
  const opened=(await call('image_open',{source_path:source})).data;
  const frames=[],calibrated=[];
  for(let i=0;i<3;i++){
    const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:i})).data;
    assert.equal(frame.dtype,'uint16');assert.deepEqual(frame.shape_yx,[96,96]);frames.push(frame);
    calibrated.push((await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.025,y:-.03,unit:'nm'},source_text:'Public synthetic R2 fixture scale: X +0.025 and Y -0.03 nm per original pixel; not experiment.'})).data);
  }
  const selections=calibrated.map((row,i)=>({object_id:row.object_id,label:`Synthetic frame ${i+1}`}));
  const sequenceArgs={frames:selections,axis:{meaning:'time',source_text:'Synthetic ordered observation example, no physical time step supplied.'}};
  const sequence=(await call('image_sequence_create',{...sequenceArgs,request_id:'three-frame-sequence'})).data;
  assert.equal(sequence.frame_count,3);assert.equal(sequence.axis.meaning,'time');assert.equal(sequence.axis.step,null);assert.equal(sequence.axis.unit,null);
  for(let i=0;i<3;i++){assert.equal(sequence.frames[i].source_frame_index,i);assert.equal(sequence.frames[i].array_sha256,arrayHash(frames[i].object_id));}
  const sourceFrameHashes=frames.map(f=>arrayHash(f.object_id));
  const estimated=(await call('image_region_correspondence',{sequence_object_id:sequence.object_id,reference_index:1,rect:oracle.reference_rect,mode:'estimate',max_shift:8,min_correlation:.9,min_margin:.03,request_id:'estimated-regions'})).data;
  assert.deepEqual(estimated.rows.map(row=>row.status),['VERIFIED','VERIFIED','VERIFIED']);
  assert.deepEqual(estimated.rows.map(row=>row.shift_xy),oracle.target_shift_xy);
  assert.deepEqual(estimated.rows.map(row=>row.target_rect),oracle.target_rects);
  report.checks.push('Bounded numerical correspondence agrees exactly with independently generated integer shifts and full ROI coordinates');
  const options={correspondence_object_id:estimated.object_id,window:'none',subtract_mean:true,max_peaks:12,peak_options:{min_separation_bins:1,exclude_dc_radius_bins:3,threshold_rel:.12,refinement:'none'},frequency_tolerance_cycles_per_pixel:.012};
  const joinedReply=await call('image_joint_observations',{...options,request_id:'three-frame-joint'});png(joinedReply);const joined=joinedReply.data;
  assert.equal(joined.frame_observations.length,3);
  const frameObservations=joined.frame_observations;
  assert.ok(frameObservations.every(row=>row.status==='VERIFIED'&&row.fft_object_id&&row.measurements.length>=4));
  const fftHashes=frameObservations.map(row=>arrayHash(row.fft_object_id));
  // An independent direct DFT matrix verifies every saved complex bin and the
  // raw array; it does not call the provider FFT or np.fft.
  const verificationInput=path.join(directory,'verification-input.json');
  writeFileSync(verificationInput,JSON.stringify({source,frames,frameObservations,oracle},null,2));
  const numerical=JSON.parse(execute(['-c',String.raw`
import json,sys,numpy as np,tifffile
p=json.load(open(sys.argv[1],encoding='utf8'));s=tifffile.imread(p['source']);checks=[]
for i,(frame,row) in enumerate(zip(p['frames'],p['frameObservations'])):
 a=np.load(frame['array_path'],allow_pickle=False);assert a.dtype==np.uint16 and np.array_equal(a,s[i])
 r=row['target_rect'];v=a[r[1]:r[3],r[0]:r[2]].astype(np.float64);v-=v.mean();h,w=v.shape
 ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
 expected=ey@v@ex.T;expected=np.roll(np.roll(expected,h//2,axis=0),w//2,axis=1)
 actual=np.load(sys.argv[2]+'/'+row['fft_object_id']+'/data.npy',allow_pickle=False)
 error=float(np.max(np.abs(actual-expected)));assert actual.dtype==np.complex128 and error<1e-6,error
 for m in row['measurements']:
  fx,fy=m['frequency_cycles_per_pixel'];d=1/np.hypot(fx/.025,fy/-.03)
  assert abs(m['d_spacing']-d)<1e-10 and m['d_spacing_unit']=='nm'
 checks.append({'frame_index':i,'raw_dtype_preserved':True,'raw_values_equal':True,'all_bin_direct_dft_max_absolute_error':error,'signed_anisotropic_spacing_checked':len(row['measurements'])})
r0=p['oracle']['target_rects'][0];r1=p['oracle']['reference_rect'];r2=p['oracle']['target_rects'][2]
assert np.array_equal(s[0,r0[1]:r0[3],r0[0]:r0[2]],s[1,r1[1]:r1[3],r1[0]:r1[2]])
assert not np.array_equal(s[2,r2[1]:r2[3],r2[0]:r2[2]],s[1,r1[1]:r1[3],r1[0]:r1[2]])
print(json.dumps(checks))`,verificationInput,path.join(workspace,'objects')]));
  report.numerical=numerical;
  assert.ok(joined.observations.some(row=>row.status==='observed'));
  assert.ok(joined.observations.some(row=>row.frame_index===2&&row.status==='unmatched'),'True extra local tone must remain an unmatched target observation');
  report.checks.push('Every FFT bin matches direct DFT; dtype/source samples, signed anisotropic d-spacings and real local change independently checked');
  const beforeReuse=fftCount();
  const repeated=(await call('image_joint_observations',{...options,previous_observations_id:joined.object_id,request_id:'reuse-joint'})).data;
  assert.equal(fftCount(),beforeReuse);assert.deepEqual(repeated.frame_observations.map(row=>row.fft_object_id),frameObservations.map(row=>row.fft_object_id));
  assert.ok(repeated.frame_observations.every(row=>row.fft_reused));
  const first=frameObservations[0].measurements[0];
  const moved=(await call('image_remeasure',{object_id:frameObservations[0].peaks_object_id,measurement_object_id:first.measurement_object_id,points:[[0,0],[first.frequency_cycles_per_pixel[0]+.002,first.frequency_cycles_per_pixel[1]]],source_text:'Synthetic test of one explicitly corrected peak, not phase confirmation.'})).data;
  const revised=(await call('image_joint_observations',{...options,previous_observations_id:joined.object_id,measurement_overrides:[{frame_index:0,measurement_object_ids:[moved.object_id,...frameObservations[0].measurements.slice(1).map(row=>row.measurement_object_id)]}],request_id:'corrected-joint'})).data;
  assert.equal(fftCount(),beforeReuse);assert.deepEqual(revised.frame_observations.map(row=>row.fft_object_id),frameObservations.map(row=>row.fft_object_id));
  assert.equal(revised.frame_observations[0].measurements[0].measurement_object_id,moved.object_id);
  for(const i of [1,2])assert.deepEqual(revised.frame_observations[i].measurements.map(row=>row.measurement_object_id),frameObservations[i].measurements.map(row=>row.measurement_object_id));
  report.checks.push('Changed observation uses a committed measurement revision; other frames and all complex FFTs are reused without recomputation');

  const unsourced=(await call('image_region_correspondence',{sequence_object_id:sequence.object_id,reference_index:1,rect:oracle.reference_rect,mode:'identity'})).data;
  assert.deepEqual(unsourced.rows.map(row=>row.status),['UNVERIFIED','VERIFIED','UNVERIFIED']);
  const offscreen=(await call('image_region_correspondence',{sequence_object_id:sequence.object_id,reference_index:1,rect:oracle.reference_rect,mode:'translation',source_text:'Synthetic explicit out-of-view negative control.',translations:[{frame_index:0,shift_xy:[80,0]},{frame_index:2,shift_xy:[4,-2]}]})).data;
  assert.equal(offscreen.rows[0].status,'OUT_OF_VIEW');assert.equal(offscreen.rows[0].target_rect,null);
  const wrongScale=(await call('image_calibrate',{object_id:frames[0].object_id,scope:'image',xy_scale:{x:.05,y:-.03,unit:'nm'},source_text:'Synthetic deliberately incompatible X scale.'})).data;
  const mismatchSequence=(await call('image_sequence_create',{...sequenceArgs,frames:[{object_id:wrongScale.object_id},...selections.slice(1)]})).data;
  const mismatch=(await call('image_region_correspondence',{sequence_object_id:mismatchSequence.object_id,reference_index:1,rect:oracle.reference_rect,mode:'identity',source_text:'Synthetic identity declaration cannot override inconsistent calibration.'})).data;
  assert.equal(mismatch.rows[0].status,'INCOMPATIBLE');assert.equal(mismatch.rows[0].target_rect,null);
  const depth=(await call('image_sequence_create',{...sequenceArgs,axis:{meaning:'reconstruction_depth',source_text:'Synthetic nominal reconstruction slice ordering; spacing/resolution not known.'}})).data;
  assert.equal(depth.axis.meaning,'reconstruction_depth');assert.equal(depth.axis.step,null);assert.equal(depth.axis.unit,null);assert.equal(depth.axis.axial_resolution,null);
  const periodicSource=path.join(fixture,'synthetic-periodic-ambiguity.tiff');
  const periodicOpen=(await call('image_open',{source_path:periodicSource})).data;
  const periodicFrames=[];
  for(let i=0;i<3;i++)periodicFrames.push((await call('image_frame',{object_id:periodicOpen.object_id,frame_index:i})).data);
  const periodicSequence=(await call('image_sequence_create',{frames:periodicFrames.map(row=>({object_id:row.object_id})),axis:{meaning:'unknown',source_text:'Synthetic repeating lattice ambiguity control; no claimed frame-axis meaning.'}})).data;
  const ambiguity=(await call('image_region_correspondence',{sequence_object_id:periodicSequence.object_id,reference_index:1,rect:oracle.reference_rect,mode:'estimate',max_shift:8,min_correlation:.9,min_margin:.03})).data;
  assert.deepEqual(ambiguity.rows.map(row=>row.status),['AMBIGUOUS','VERIFIED','AMBIGUOUS']);
  assert.ok(ambiguity.rows.filter(row=>row.status==='AMBIGUOUS').every(row=>row.target_rect===null&&row.candidates.length>1));
  const ambiguityJoint=(await call('image_joint_observations',{...options,correspondence_object_id:ambiguity.object_id,request_id:'ambiguous-joint'})).data;
  assert.ok(ambiguityJoint.observations.filter(row=>[0,2].includes(row.frame_index)).every(row=>row.status==='not_comparable'));
  assert.ok(ambiguityJoint.frame_observations.filter(row=>[0,2].includes(row.frame_index)).every(row=>!row.fft_object_id));
  assert.ok(ambiguityJoint.frame_observations[1].measurements.every(row=>row.d_spacing===null&&row.d_spacing_unit===null),'Unknown XY scale must not generate physical d-spacings');
  report.checks.push('Unsourced identity, calibration mismatch, out-of-view and periodic ambiguity remain explicit; incomparable rows produce no FFT');

  const created=(await call('analysis_create',{analysis_id:'synthetic-sequence-trial',reason:'Public synthetic reusable cross-frame analysis.'})).data;
  const current=(await call('analysis_update',{analysis_id:'synthetic-sequence-trial',expected_revision:created.context.revision,selections:{sequence:{provider:'image',object_id:sequence.object_id},correspondence:{provider:'image',object_id:estimated.object_id},observations:{provider:'image',object_id:revised.object_id}},reason:'Bind exact source sequence, accepted integer mapping and revised joint evidence.'})).data;
  const panel=await call('image_panel_open',{object_id:revised.object_id});png(panel);
  const connection=JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',panel.data.panel_id+'.json'),'utf8'));
  report.panels.push({panel_id:panel.data.panel_id,url:panel.data.panel_url,pid:connection.pid});
  const panelCurrent=await client.tool('image_panel_current',{panel_id:panel.data.panel_id});png(panelCurrent);
  assert.ok(panelCurrent.data.view.sequence_evidence,'Panel must expose the saved cross-frame table');
  const shown=await call('image_panel_show',{panel_id:panel.data.panel_id,object_id:frameObservations[2].view_object_id,expected_object_id:panelCurrent.data.view.object.object_id,draft_revision:panelCurrent.data.view.edit_state.draft_revision});png(shown);
  assert.equal(shown.data.view.presentation.status,'shown');
  assert.equal((await fetch(panel.data.panel_url)).status,200);
  const newcomer=makeClient();clients.push(newcomer);await newcomer.rpc('initialize');
  const beforeRecovery={objects:objectCount(),ffts:fftCount()};
  const recovered=(await newcomer.tool('analysis_read',{analysis_id:'synthetic-sequence-trial'})).data;
  assert.equal(recovered.context.revision,current.context.revision);
  for(const [role,id] of [['sequence',sequence.object_id],['correspondence',estimated.object_id],['observations',revised.object_id]]){
    assert.equal(recovered.context.slots[role].ref.objectId,id);
    assert.equal((await newcomer.tool('image_info',{object_id:id})).data.object_id,id);
  }
  assert.equal((await newcomer.tool('image_result',{request_id:'three-frame-joint'})).data.object_id,joined.object_id);
  assert.deepEqual({objects:objectCount(),ffts:fftCount()},beforeRecovery);
  await assert.rejects(()=>call('image_sequence_create',{...sequenceArgs,axis:{meaning:'repeat',source_text:'Conflicting original request.'},request_id:'three-frame-sequence'}),/conflict|different|REQUEST/i);
  assert.equal(hash(source),sourceHash);assert.deepEqual(frames.map(row=>arrayHash(row.object_id)),sourceFrameHashes);assert.deepEqual(frameObservations.map(row=>arrayHash(row.fft_object_id)),fftHashes);
  assert.equal(hash(periodicSource),oracle.files_sha256['synthetic-periodic-ambiguity.tiff']);
  report.checks.push('Fresh client recovers by task name and original request; zero new science objects/FFTs, original source and spectrum hashes unchanged');
  copyFileSync(joined.table_path,path.join(directory,'joint-observations.csv'));
  writeFileSync(path.join(directory,'joint-observations.json'),JSON.stringify(joined.observations,null,2));
  report.source={path:source,sha256:sourceHash,frames:frames.map(row=>({object_id:row.object_id,frame_index:row.frame_index,array_sha256:arrayHash(row.object_id)}))};
  report.references={sequence:sequence.object_id,correspondence:estimated.object_id,observations:joined.object_id,revised_observations:revised.object_id,context:'synthetic-sequence-trial',context_revision:current.context.revision};
  report.frame_observations=frameObservations;report.observation_counts=Object.fromEntries([...new Set(joined.observations.map(row=>row.status))].map(status=>[status,joined.observations.filter(row=>row.status===status).length]));
  report.controls={unsourced:unsourced.rows,offscreen:offscreen.rows,mismatched_scale:mismatch.rows,periodic:ambiguity.rows,depth_axis:depth.axis};
  report.result='PASS';report.completed_utc=new Date().toISOString();
  writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS: real plugin/MCP/Python three-frame correspondence, existing FFT/peak measurements, independent DFT, scientific controls, revised joint evidence, named recovery and Panel HTTP.');
  if(retained)console.log('Retained evidence: '+path.join(directory,'report.json'));
}catch(error){report.result='FAIL';report.error=error.stack;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw error;}
finally{
  for(const target of clients)await target.close();
  if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
  if(!retained){
    for(const row of report.panels){try{process.kill(row.pid);}catch{}}
    rmSync(directory,{recursive:true,force:true});
  }
}
