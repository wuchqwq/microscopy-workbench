// Actual compiled MCP/Python handoff from F4 evidence to F2a GPA. Synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from '../tools/image_panel.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');

test('F4 saved FFT -> GPA -> compact/full recovery and unchanged F4 science',{timeout:300000},async t=>{
 const out=mkdtempSync(path.join(tmpdir(),'public-f4-gpa-integration-'));
 const input=path.join(out,'public-cosines.tiff'),workRoot=path.join(out,'workspace'),workspace=path.join(workRoot,'images');
 const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
 const py=(code,args=[])=>{
  const r=spawnSync(candidate,['-B','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});
  assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();
 };
 const python=py('import sys;print(sys.executable)');
 py('import numpy as np,tifffile,sys;y,x=np.indices((192,192));a=(1.2+.8*np.cos(2*np.pi*15*x/128+.2)+.6*np.cos(2*np.pi*y/8-.3)).astype(np.float32);tifffile.imwrite(sys.argv[1],a,metadata=None)',[input]);
 const sourceHash=digest(input),config=path.join(out,'plugin-config.json');
 writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workRoot,structures:false}));
 const previous=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
 const client=()=>new StdioImageClient({workspace,python,serverPath:path.join(root,'tools','plugin_server.mjs')});
 const clients=[client()];let serial=0;const timings=[];
 const data=async(name,args={},c=clients[0])=>{
  const readonly=['image_info','image_result','image_evidence','analysis_read'].includes(name);
  const started=performance.now();
  try{return (await c.tool(name,readonly?args:{...args,request_id:args.request_id??`combined-${++serial}`})).data;}
  finally{timings.push({tool:name,elapsed_ms:performance.now()-started});}
 };
 const allObjects=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json')));
 const countFFTs=()=>allObjects().filter(id=>JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')).kind==='fft').length;
 const hashObject=id=>Object.fromEntries(readdirSync(path.join(workspace,'objects',id)).map(f=>[f,digest(path.join(workspace,'objects',id,f))]));
 const report={scope:'Independent combined F4/F2a compiled MCP, public synthetic input only',result:'RUNNING',checks:[],timings,not_tested:['browser gestures','ordinary model Skill comprehension','real specimens','GPA interrupted-worker injection']};
 try{
  await clients[0].rpc('initialize');
  const catalog=(await clients[0].rpc('tools/list')).result.tools;
  const names=catalog.map(v=>v.name);assert.equal(new Set(names).size,names.length);
  for(const name of ['image_spatial_field','image_domain_map','image_field_extend','image_analysis_candidates','image_evidence','image_gpa','image_gpa_view','image_gpa_read'])assert.ok(names.includes(name),name);
  const opened=await data('image_open',{source_path:input});
  const frame=await data('image_frame',{object_id:opened.object_id,frame_index:0});
  const calibrated=await data('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:.02,y:-.03,unit:'nm'},source_text:'Prescribed signed anisotropic metric for this public analytic integration fixture.'});
  const field=await data('image_spatial_field',{object_id:calibrated.object_id,rect:[16,24,144,152],window_sizes:[128],stride_xy:[128,128],max_windows:1,coordinate_domain:'pixel',window:'none',subtract_mean:true,max_peaks:8,peak_options:{threshold_rel:.15,refinement:'none'},max_size:256});
  assert.equal(countFFTs(),1);assert.equal(field.samples.length,1);
  const originalFFT=field.samples[0].fft_object_id,originalFFTFiles=hashObject(originalFFT),fieldFiles=hashObject(field.object_id);
  const mapped=await data('image_domain_map',{object_id:field.object_id,tolerance:.01,angles_degrees:[0,90],neighbor_policy:'support_contact_v1',response_detail:'compact',max_size:256});
  assert.equal(mapped.evidence_format,'image-evidence-summary-v1');
  const plan=await data('image_analysis_candidates',{object_id:mapped.object_id,budget_windows:2,budget_fft_pixels:17408,candidate_scales:[32],max_candidates:4,response_detail:'compact'});
  assert.ok(plan.recommended_action_ids.length);
  const extended=await data('image_field_extend',{object_id:field.object_id,candidate_set_id:plan.object_id,action_ids:[plan.recommended_action_ids[0]],response_detail:'compact'});
  assert.equal(countFFTs(),2);assert.equal(extended.new_fft_count,1);
  const extFull=await data('image_info',{object_id:extended.object_id});
  assert.equal(extFull.samples[0].fft_object_id,originalFFT);
  const smallFFT=extFull.samples.find(s=>s.scale_pixels===32).fft_object_id;
  const options={source_domain:'real_space_lattice',source_domain_text:'This is the declared analytic cosine lattice, not diffraction intensity or stored reconstruction phase.',g_vectors:[[.125,0],[0,.125]],mask_sigma:.02,reference_rect:[48,48,80,80],reference_mode:'fixed_g',reference_text:'Prescribed G=(1/8,0),(0,1/8); reference region fixes only the displacement constant.',max_size:256};
  await assert.rejects(data('image_gpa',{object_id:smallFFT,...options}),/64|GPA|samples/);
  assert.equal(countFFTs(),2,'Unsupported small F4 window must not generate a replacement FFT');
  const gpa=await data('image_gpa',{object_id:originalFFT,...options,request_id:'combined-gpa-original'});
  assert.equal(gpa.fft_recomputed,false);assert.equal(gpa.report.coordinate_domain,'physical_cartesian_nm');
  assert.deepEqual(gpa.input_dependency.source_mapping.source_rect_xyxy,[16,24,144,152]);
  assert.deepEqual(gpa.report.calibration_nm_xy,[.02,-.03]);
  const gpaFiles=hashObject(gpa.object_id);
  const samples=await data('image_gpa_read',{object_id:gpa.object_id,points:[[64,64],[0,0]]});
  assert.equal(samples.samples[0].tensor_valid,true);assert.equal(samples.samples[1].exx,null);
  const expected=.5*((16/15)**2-1);
  assert.ok(Math.abs(samples.samples[0].exx-expected)<1e-5);
  assert.ok(Math.abs(samples.samples[0].eyy)<1e-5);
  assert.ok(Math.abs(samples.samples[0].exy)<1e-5);
  const changed=await data('image_gpa',{object_id:originalFFT,...options,mask_sigma:.018,previous_gpa_id:gpa.object_id});
  const view=await data('image_gpa_view',{object_id:changed.object_id,component:'exx',display_range:[-.1,.1],max_size:256});
  assert.equal(view.gpa_recomputed,false);assert.deepEqual(hashObject(gpa.object_id),gpaFiles);
  const compactGPA=await data('image_info',{object_id:gpa.object_id,response_detail:'compact'});
  assert.equal(compactGPA.authoritative_record,false);assert.equal(compactGPA.inline_image,false);
  assert.deepEqual(compactGPA.array_manifest,gpa.array_manifest);
  const finalMap=await data('image_domain_map',{object_id:extended.object_id,tolerance:.01,angles_degrees:[0,90],neighbor_policy:'support_contact_v1',response_detail:'compact',max_size:256});
  const stop=await data('image_analysis_candidates',{object_id:finalMap.object_id,budget_windows:2,budget_fft_pixels:17408,candidate_scales:[32],response_detail:'compact'});
  assert.equal(stop.stopping.reason,'budget_exhausted');
  const evidence=await data('image_evidence',{object_id:finalMap.object_id,manifest_sha256:finalMap.manifest_sha256,section:'samples',offset:0,limit:1});
  assert.equal(evidence.rows[0].fft_object_id,originalFFT);
  report.checks.push('Both tool families coexist; F4 increment/compact/proposal stop works; GPA uses the exact old 128px FFT and refuses 32px without replacing it.');
  const contextId='public-combined-f4-gpa';let context=await data('analysis_create',{analysis_id:contextId,reason:'Public combined integration qualification'});
  for(const selections of [{experiment:{provider:'image',object_id:calibrated.object_id},spatial_field:{provider:'image',object_id:extended.object_id}},{domains:{provider:'image',object_id:finalMap.object_id}},{active_plan:{provider:'image',object_id:stop.object_id}}]){
   context=await data('analysis_update',{analysis_id:contextId,expected_revision:context.context.revision,selections,reason:'Promote exact dependency-ordered F4 references; GPA retains its own provider/request IDs.'});
  }
  for(const [label,id] of [['f4',finalMap.object_id],['gpa',view.object_id]]){
   const exported=await data('image_export',{object_id:id,output_dir:path.join(out,label+'-export')});
   for(const [name,sha]of Object.entries(exported.exported_files_sha256))assert.equal(digest(path.join(exported.output_dir,name)),sha);
   assert.ok(Object.keys(exported.exported_files_sha256).some(n=>n.endsWith('.npy')));
  }
  const before={objects:allObjects().length,ffts:countFFTs()};
  const fresh=client();clients.push(fresh);await fresh.rpc('initialize');
  const restored=await data('analysis_read',{analysis_id:contextId},fresh);assert.equal(restored.context.revision,context.context.revision);
  for(const saved of [field,extended,finalMap,gpa,changed,view,samples]){
   const original=await data('image_result',{request_id:saved.request_id},fresh);assert.equal(original.object_id,saved.object_id);
   const found=await data('image_info',{object_id:saved.object_id,response_detail:'compact'},fresh);assert.equal(found.object_id,saved.object_id);
  }
  assert.deepEqual({objects:allObjects().length,ffts:countFFTs()},before);
  assert.deepEqual(hashObject(originalFFT),originalFFTFiles);assert.deepEqual(hashObject(field.object_id),fieldFiles);
  assert.equal(digest(input),sourceHash);assert.equal(countFFTs(),2);
  report.checks.push('Signed anisotropic finite strain agrees with independent F=diag(16/15,1); local-to-source coordinates, masks, revisions, both exports and fresh-client recovery verified.');
  report.result='PASS';report.source_sha256=sourceHash;report.original_fft_sha256=originalFFTFiles['data.npy'];report.forward_fft_count=2;report.old_source_fft_field_unchanged=true;
  report.expected_exx=expected;report.observed_exx=samples.samples[0].exx;report.context_revision=context.context.revision;
 }catch(error){report.result='FAIL';report.error=String(error?.stack??error);throw error;}
 finally{
  writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if(process.env.MICROSCOPY_INTEGRATION_REPORT){mkdirSync(path.dirname(process.env.MICROSCOPY_INTEGRATION_REPORT),{recursive:true});writeFileSync(process.env.MICROSCOPY_INTEGRATION_REPORT,JSON.stringify(report,null,2));}
  for(const c of clients)await c.close();
  if(previous===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previous;
  t.diagnostic(JSON.stringify(report));
 }
});
