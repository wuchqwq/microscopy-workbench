// Public R3 acceptance: installed-style launcher -> actual MCP stdio -> Python.
// Protocol, numerical and Panel HTTP evidence; browser/model trials are separate.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw new Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'domain-plugin-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=args=>{const result=spawnSync(python,['-B',...args],{encoding:'utf8',timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const absolutePython=execute(['-c','import sys;print(sys.executable)']),fixture=path.join(directory,'fixture');
execute([path.join(repo,'examples','make_domain_trial.py'),fixture]);
const oracle=JSON.parse(readFileSync(path.join(fixture,'oracle.json'),'utf8'));
const workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images'),config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,workspace_root:workspaceRoot,structures:false},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const objectDir=id=>path.join(workspace,'objects',id),arrayHash=id=>hash(path.join(objectDir(id),'data.npy'));
const objectCount=()=>readdirSync(path.join(workspace,'objects')).length;
const fftCount=()=>readdirSync(path.join(workspace,'objects')).filter(id=>JSON.parse(readFileSync(path.join(objectDir(id),'object.json'),'utf8')).kind==='fft').length;
const png=reply=>{assert.ok(reply.png,'Actual MCP image content missing');assert.equal(Buffer.from(reply.png,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const clients=[],client=makeClient();clients.push(client);let serial=0;
const call=(name,args={},target=client)=>target.tool(name,{...args,request_id:args.request_id??'domain-smoke-'+(++serial)});
const report={scope:'actual plugin MCP stdio, independent direct DFT, Panel HTTP; synthetic data only',not_tested:['real browser gestures','fresh model use of Skill','experimental specimen accuracy','phase identification'],started_utc:new Date().toISOString(),panels:[],checks:[],software:{node:process.version}};
const closeAngle=(value,expected)=>Math.abs(value-expected)<1e-7;
const relation=(result,index)=>{const row=result.relations.find(item=>item.target_index===index);assert.ok(row,'Missing target relation '+index);return row;};
const accepted=(row,angle)=>row.accepted_angles_degrees.some(value=>closeAngle(value,angle));

try{
  await client.rpc('initialize');
  const catalog=(await client.rpc('tools/list')).result.tools.map(row=>row.name);
  for(const name of ['image_spatial_atlas','image_local_signature_compare','image_remeasure','analysis_read','image_panel_show'])assert.ok(catalog.includes(name),name);
  report.software.python=JSON.parse(execute(['-c',"import json,sys,importlib.metadata as m;print(json.dumps({'python':sys.version,**{n:m.version(n) for n in ['numpy','scipy','Pillow','tifffile']}}))"]));
  const source=path.join(fixture,oracle.source),sourceHash=hash(source);
  const opened=(await call('image_open',{source_path:source})).data;
  const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:0})).data;
  assert.equal(frame.dtype,'float32');assert.deepEqual(frame.shape_yx,oracle.shape_yx);
  const sourceArrayHash=arrayHash(frame.object_id);
  const calibrated=(await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.025,y:.025,unit:'nm'},source_text:'Public synthetic R3 fixture validation scale: +0.025 nm per original pixel on both axes; not an experiment.'})).data;
  const atlasArgs={object_id:calibrated.object_id,rects:oracle.regions.map(row=>row.rect),window:'none',subtract_mean:true,max_peaks:16,peak_options:{min_separation_bins:2,exclude_dc_radius_bins:3,threshold_rel:.15,refinement:'none'}};
  const atlasReply=await call('image_spatial_atlas',{...atlasArgs,request_id:'public-domain-atlas'});png(atlasReply);const atlas=atlasReply.data;
  assert.equal(atlas.regions.length,6);assert.ok(atlas.overview_object_id);
  for(const row of atlas.regions){assert.deepEqual(row.rect,oracle.regions[row.region_index].rect);assert.ok(row.fft_object_id&&row.roi_object_id&&row.view_object_id);}
  assert.equal(atlas.regions[3].measurements.length,0,'Constant negative window has no nonzero-frequency observations');
  const fftHashes=atlas.regions.map(row=>arrayHash(row.fft_object_id));
  const numericalInput=path.join(directory,'numerical-input.json');
  writeFileSync(numericalInput,JSON.stringify({source,frame,regions:atlas.regions,oracle},null,2));
  // Independent all-bin DFT oracle. No provider FFT or np.fft is used here.
  report.numerical=JSON.parse(execute(['-c',String.raw`
import json,sys,numpy as np,tifffile
p=json.load(open(sys.argv[1],encoding='utf8'));raw=tifffile.imread(p['source']);saved=np.load(p['frame']['array_path'],allow_pickle=False)
assert raw.dtype==saved.dtype==np.float32 and np.array_equal(raw,saved) and raw.min()<0
checks=[]
for row,truth in zip(p['regions'],p['oracle']['regions']):
 r=row['rect'];v=raw[r[1]:r[3],r[0]:r[2]].astype(np.float64);v-=v.mean();h,w=v.shape
 ey=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);ex=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w)
 expected=ey@v@ex.T;expected=np.roll(np.roll(expected,h//2,axis=0),w//2,axis=1)
 actual=np.load(sys.argv[2]+'/'+row['fft_object_id']+'/data.npy',allow_pickle=False)
 error=float(np.max(np.abs(actual-expected)));assert actual.dtype==np.complex128 and error<1e-7,error
 found=[m['frequency_cycles_per_pixel'] for m in row['measurements']];tones=truth['all_tones_cycles_per_pixel']
 assert len(found)==len(tones),(row['region_index'],found,tones)
 for tone in tones:assert any(np.linalg.norm(np.array(v)-tone)<1e-10 for v in found),(tone,found)
 for m in row['measurements']:
  fx,fy=m['frequency_cycles_per_pixel'];assert abs(m['d_spacing']-.025/np.hypot(fx,fy))<1e-10 and m['d_spacing_unit']=='nm'
 checks.append({'region_index':row['region_index'],'direct_dft_max_absolute_error':error,'analytic_signed_tones_checked':len(tones)})
print(json.dumps({'signed_float32_source_preserved':True,'negative_minimum':float(raw.min()),'all_bin_direct_dft':checks}))`,numericalInput,path.join(workspace,'objects')]));
  report.checks.push('Signed float32 source preserved exactly; every saved complex FFT bin independently matches direct DFT and every selected tone matches the analytic source');

  const theta=oracle.rotation.angle_degrees,angles=[0,theta,theta-180,90,-90,180];
  const compareArgs={object_id:atlas.object_id,reference_index:0,target_indices:[1,2,3],angles_degrees:angles,coordinate_domain:'pixel',tolerance:.001};
  const comparedReply=await call('image_local_signature_compare',{...compareArgs,request_id:'public-domain-hypotheses'});png(comparedReply);const compared=comparedReply.data;
  const ab=relation(compared,1),mixed=relation(compared,2),constant=relation(compared,3);
  assert.ok(accepted(ab,theta),'Analytically correct A -> B rotation is retained');
  assert.ok(accepted(ab,theta-180),'Conjugate-equivalent alternative is retained');
  assert.ok(!accepted(ab,0),'Unrotated A is not a full B signature match');
  assert.ok(mixed.candidates.some(row=>row.matched_pairs.length&&row.unmatched_target_family_ids.length),'Mixed window retains matched and extra target families');
  assert.ok(!mixed.candidates.some(row=>row.all_selected_families_matched),'Mixture is not a complete pure-signature match');
  assert.equal(constant.status,'insufficient_geometry');
  const square=(await call('image_local_signature_compare',{object_id:atlas.object_id,reference_index:4,target_indices:[5],angles_degrees:oracle.controls.square.angles_degrees,coordinate_domain:'pixel',tolerance:.001})).data;
  const squareRelation=relation(square,5);for(const angle of [0,90,-90])assert.ok(accepted(squareRelation,angle));
  assert.equal(squareRelation.status,'ambiguous','Square symmetry cannot become one chosen orientation');
  const physical=(await call('image_local_signature_compare',{...compareArgs,coordinate_domain:'physical',tolerance:.04})).data;
  assert.equal(physical.coordinate_unit,'cycles/nm');assert.ok(accepted(relation(physical,1),theta));
  report.controls={rotation:ab,mixture:mixed,constant,square:squareRelation,physical:relation(physical,1)};
  report.checks.push('Analytic proper rotation, conjugate/square ambiguities, mixed extra families, constant insufficient geometry and explicit physical units retained');

  const beforeRevision=fftCount(),first=atlas.regions[1].measurements[0];
  const moved=(await call('image_remeasure',{object_id:atlas.regions[1].view_object_id,measurement_object_id:first.measurement_object_id,points:[[0,0],[first.frequency_cycles_per_pixel[0]+.002,first.frequency_cycles_per_pixel[1]]],source_text:'Synthetic explicit manual measurement revision to test provenance; not a phase or physical interpretation.'})).data;
  const revisedReply=await call('image_spatial_atlas',{...atlasArgs,previous_atlas_id:atlas.object_id,measurement_overrides:[{region_index:1,measurement_object_ids:[moved.object_id,...atlas.regions[1].measurements.slice(1).map(row=>row.measurement_object_id)]}],request_id:'revised-domain-atlas'});png(revisedReply);const revised=revisedReply.data;
  assert.equal(fftCount(),beforeRevision);assert.deepEqual(revised.regions.map(row=>row.fft_object_id),atlas.regions.map(row=>row.fft_object_id));
  assert.ok(revised.regions.every(row=>row.fft_reused));assert.equal(revised.regions[1].measurements[0].measurement_object_id,moved.object_id);
  for(const i of [0,2,3,4,5])assert.deepEqual(revised.regions[i].measurements.map(row=>row.measurement_object_id),atlas.regions[i].measurements.map(row=>row.measurement_object_id));
  const revisedCompare=(await call('image_local_signature_compare',{...compareArgs,object_id:revised.object_id,request_id:'revised-domain-hypotheses'})).data;
  assert.equal(revisedCompare.parent_object_id,revised.object_id);
  assert.ok(JSON.stringify(revisedCompare.source_entries).includes(moved.object_id),'Comparison consumes the committed corrected observation');
  assert.ok(!accepted(relation(revisedCompare,1),theta),'Moving one observation beyond the explicit tolerance changes complete-signature acceptance');
  report.checks.push('Manual ordinary measurement revision changes the atlas/comparison references and preserves all exact source FFT objects and hashes');

  // R2 source compatibility uses the same public A/B/mixed analytic arrays.
  const sequenceSource=path.join(fixture,oracle.sequence_source),sequenceOpen=(await call('image_open',{source_path:sequenceSource})).data,frames=[];
  for(let i=0;i<3;i++)frames.push((await call('image_frame',{object_id:sequenceOpen.object_id,frame_index:i})).data);
  const sequence=(await call('image_sequence_create',{frames:frames.map(row=>({object_id:row.object_id})),axis:{meaning:'unknown',source_text:'Public analytic A/B/mixed ordered test patterns; no time or physical depth.'}})).data;
  const mapping=(await call('image_region_correspondence',{sequence_object_id:sequence.object_id,reference_index:0,rect:oracle.sequence.rect,mode:'identity',source_text:'Public synthetic arrays share the explicitly generated 128x128 coordinate grid; not the same physical atoms.'})).data;
  const joint=(await call('image_joint_observations',{correspondence_object_id:mapping.object_id,window:'none',subtract_mean:true,max_peaks:16,peak_options:atlasArgs.peak_options,frequency_tolerance_cycles_per_pixel:.001})).data;
  const jointCompare=(await call('image_local_signature_compare',{...compareArgs,object_id:joint.object_id,target_indices:[1,2]})).data;
  assert.ok(accepted(relation(jointCompare,1),theta));assert.ok(jointCompare.source_entries.every(row=>row.index_kind==='frame_index'));
  report.r2={sequence_object_id:sequence.object_id,correspondence_object_id:mapping.object_id,joint_object_id:joint.object_id,comparison_object_id:jointCompare.object_id};
  report.checks.push('The same local-signature tool accepts saved R2 joint observations while preserving their frame-index and correspondence provenance');

  const analysisId='public-spatial-domain-trial';
  const created=(await call('analysis_create',{analysis_id:analysisId,reason:'Public synthetic R3 atlas and local signature hypotheses.'})).data;
  const updated=(await call('analysis_update',{analysis_id:analysisId,expected_revision:created.context.revision,selections:{atlas:{provider:'image',object_id:revised.object_id},domain_hypotheses:{provider:'image',object_id:revisedCompare.object_id}},reason:'Retain exact revised atlas and candidate geometry without phase assignment.'})).data;
  assert.equal(updated.context.slots.domain_hypotheses.dependsOn.atlas,updated.context.fingerprints.atlas,'Hypotheses bind the actual selected atlas fingerprint');
  const panel=await call('image_panel_open',{object_id:revisedCompare.object_id});png(panel);
  const connection=JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',panel.data.panel_id+'.json'),'utf8'));
  report.panels.push({panel_id:panel.data.panel_id,url:panel.data.panel_url,pid:connection.pid});
  const current=await client.tool('image_panel_current',{panel_id:panel.data.panel_id});png(current);
  assert.equal(current.data.view.domain_evidence.object_id,revisedCompare.object_id);
  assert.equal(current.data.view.domain_evidence.kind,'local_signature_compare');
  assert.equal((await fetch(panel.data.panel_url)).status,200);
  const shown=await call('image_panel_show',{panel_id:panel.data.panel_id,object_id:revised.object_id,expected_object_id:current.data.view.object.object_id,draft_revision:current.data.view.edit_state.draft_revision});png(shown);assert.equal(shown.data.view.presentation.status,'shown');
  assert.equal(shown.data.view.domain_evidence.object_id,revised.object_id);
  const newcomer=makeClient();clients.push(newcomer);await newcomer.rpc('initialize');
  const beforeRecovery={objects:objectCount(),ffts:fftCount()};
  const recovered=(await newcomer.tool('analysis_read',{analysis_id:analysisId})).data;assert.equal(recovered.context.revision,updated.context.revision);
  assert.equal(recovered.context.slots.domain_hypotheses.dependsOn.atlas,recovered.context.fingerprints.atlas);
  for(const [role,id] of [['atlas',revised.object_id],['domain_hypotheses',revisedCompare.object_id]]){
    assert.equal(recovered.context.slots[role].ref.objectId,id);assert.equal((await newcomer.tool('image_info',{object_id:id})).data.object_id,id);
  }
  assert.equal((await newcomer.tool('image_result',{request_id:'public-domain-atlas'})).data.object_id,atlas.object_id);
  assert.equal((await newcomer.tool('image_result',{request_id:'revised-domain-hypotheses'})).data.object_id,revisedCompare.object_id);
  const live=await newcomer.tool('image_panel_current',{panel_id:panel.data.panel_id});
  const restored=await call('image_panel_show',{panel_id:panel.data.panel_id,object_id:recovered.context.slots.domain_hypotheses.ref.objectId,expected_object_id:live.data.view.object.object_id,draft_revision:live.data.view.edit_state.draft_revision},newcomer);png(restored);
  assert.equal(restored.data.view.domain_evidence.object_id,revisedCompare.object_id);
  assert.equal((await fetch(panel.data.panel_url)).status,200);
  assert.deepEqual({objects:objectCount(),ffts:fftCount()},beforeRecovery);
  assert.equal(hash(source),sourceHash);assert.equal(arrayHash(frame.object_id),sourceArrayHash);assert.deepEqual(atlas.regions.map(row=>arrayHash(row.fft_object_id)),fftHashes);
  assert.equal(hash(sequenceSource),oracle.files_sha256[oracle.sequence_source]);
  report.checks.push('Named fresh-client recovery and original request queries create no science objects; source/FFT hashes unchanged; saved atlas and comparison open through Panel HTTP');
  report.references={source_frame:frame.object_id,atlas:atlas.object_id,hypotheses:compared.object_id,revised_atlas:revised.object_id,revised_hypotheses:revisedCompare.object_id,context:analysisId,context_revision:updated.context.revision};
  report.source={path:source,sha256:sourceHash,dtype:frame.dtype,array_sha256:sourceArrayHash};report.regions=atlas.regions;
  writeFileSync(path.join(directory,'domain-hypotheses.json'),JSON.stringify(compared,null,2));
  writeFileSync(path.join(directory,'revised-domain-hypotheses.json'),JSON.stringify(revisedCompare,null,2));
  report.result='PASS';report.completed_utc=new Date().toISOString();
  writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS: actual MCP/Python signed-float atlas, independent DFT, bounded signature hypotheses, manual revision/FFT reuse, R2 input, named recovery and Panel HTTP.');
}catch(error){report.result='FAIL';report.error=error.stack;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw error;}
finally{
  for(const target of clients)await target.close();
  if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
  if(!retained)for(const row of report.panels){try{process.kill(row.pid);}catch{}}
  console.log('Public evidence: '+path.join(directory,'report.json'));
}
