// Public reusable plugin acceptance: actual launcher -> MCP stdio -> Python.
// This is protocol/science/Panel HTTP evidence, not a real model or browser trial.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from '../tools/image_panel.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw new Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'automation-plugin-'));
const python=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const structurePython=process.env.MICROSCOPY_STRUCTURE_PYTHON??python;
const workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const config=path.join(directory,'plugin-config.json');
const run=(executable,code,args=[])=>{
  const process=spawnSync(executable,['-B','-c',code,...args],{encoding:'utf8',timeout:120000,env:{...globalThis.process.env,PYTHONPATH:'',MPLBACKEND:'Agg'}});
  assert.equal(process.status,0,process.stderr||process.error?.message);return process.stdout.trim();
};
const absolutePython=run(python,'import sys;print(sys.executable)'),absoluteStructurePython=run(structurePython,'import sys;print(sys.executable)');
writeFileSync(config,JSON.stringify({schema_version:1,python:absolutePython,structure_python:absoluteStructurePython,workspace_root:workspaceRoot,structures:true},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;
process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python:absolutePython,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const counts=()=>readdirSync(path.join(workspace,'objects')).length;
const scientificHash=id=>hash(path.join(workspace,'objects',id,'data.npy'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const png=reply=>{assert.ok(reply.png,'Actual MCP PNG content missing');assert.equal(Buffer.from(reply.png,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const report={scope:'actual plugin launcher, MCP stdio, independent Python, Panel HTTP; model/browser gestures NOT_TESTED',inputs:[],panels:[],assertions:[],software:{node:process.version},started_utc:new Date().toISOString()};
const clients=[];
let sequence=0;
const client=makeClient();clients.push(client);
const call=async(name,args={},target=client)=>target.tool(name,{...args,request_id:args.request_id??'plugin-smoke-'+(++sequence)});
try{
  const initialized=await client.rpc('initialize');assert.equal(initialized.result.serverInfo.name,'microscopy-core');
  const catalog=(await client.rpc('tools/list')).result.tools.map(row=>row.name);
  for(const name of ['image_roi_propose','image_fft_batch','image_peaks','image_peak_measurements','structure_compare_batch','image_panel_open','analysis_read'])assert.ok(catalog.includes(name),name);
  report.software.structure=JSON.parse(run(absoluteStructurePython,"import json,importlib.metadata as m;print(json.dumps({n:m.version(n) for n in ['ase','diffsims','numpy','scipy']}))"));
  const cif=path.join(directory,'reference-fcc.cif');
  run(absoluteStructurePython,"from ase.build import bulk;from ase.io import write;import sys;write(sys.argv[1],bulk('Cu','fcc',a=4,cubic=True))",[cif]);
  const reference=(await call('structure_open',{source_path:cif})).data;
  const orientation=(await call('structure_orient',{object_id:reference.object_id,zone_axis_uvw:[0,0,1]})).data;
  const simulation=(await call('structure_simulate',{object_id:reference.object_id,orientation_id:orientation.object_id,voltage_kv:200,reciprocal_radius_inv_angstrom:.8,max_excitation_error_inv_angstrom:.02,size:64,sigma_pixels:1,with_direct_beam:false})).data;
  for(const [index,[height,width,period]] of [[96,128,8],[80,120,10]].entries()){
    console.log(`Plugin fixture${index+1}: ${width}x${height}, period${period} pixels`);
    const source=path.join(directory,`public-pattern-${index}.tiff`);
    run(absolutePython,"import numpy as np,tifffile,sys;y,x=np.indices((int(sys.argv[2]),int(sys.argv[3])));p=int(sys.argv[4]);a=np.rint(18000+5000*np.cos(2*np.pi*x/p)+3000*np.cos(2*np.pi*y/p)).astype(np.uint16);tifffile.imwrite(sys.argv[1],a,photometric='minisblack',metadata=None)",[source,String(height),String(width),String(period)]);
    const originalHash=hash(source);
    const opened=(await call('image_open',{source_path:source})).data;
    const frame=(await call('image_frame',{object_id:opened.object_id,frame_index:0})).data;
    assert.deepEqual(frame.shape_yx,[height,width]);assert.equal(frame.dtype,'uint16');
    const scale=.2/period;
    const calibrated=(await call('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:scale,y:scale,unit:'nm'},source_text:`Public synthetic fixture: known XY=${scale} nm/pixel; theoretical period0.2nm; not experimental calibration.`})).data;
    const proposed=await call('image_roi_propose',{object_id:calibrated.object_id,window_sizes:[height/2,height],max_regions:2,max_size:256});png(proposed);
    assert.equal(proposed.data.source_context.dtype,'uint16');
    const rects=proposed.data.regions.map(row=>row.rect);
    assert.equal(rects.length,2);assert.equal(new Set(rects.map(r=>r[2]-r[0])).size,2);
    const batchRequest=`batch-input-${index}`;
    let batchReply;
    if(index===0){
      // Wait until durable acceptance before sending actual MCP cancellation.
      const rpcId=client.next;
      const awaiting=client.rpc('tools/call',{name:'image_fft_batch',arguments:{request_id:batchRequest,object_id:calibrated.object_id,rects,window:'none',subtract_mean:true,max_size:256}});
      const journal=path.join(workspace,'requests',batchRequest+'.json');
      const end=Date.now()+30000;let state;
      while(Date.now()<end){try{state=JSON.parse(readFileSync(journal,'utf8')).state;}catch{}if(state)break;await delay(20);}
      assert.equal(state,'prepared','Cancellation must occur after acceptance and before completion');
      client.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:rpcId,reason:'Client stopped waiting after durable acceptance'}})+'\n');
      // This test client drops its cancelled await; the server may suppress it.
      const pending=client.pending.get(rpcId);if(pending){clearTimeout(pending.timer);client.pending.delete(rpcId);pending.resolve({client_cancelled:true});}
      await awaiting;
      const newcomer=makeClient();clients.push(newcomer);
      await newcomer.rpc('initialize');
      let lastError;
      for(let attempt=0;attempt<80;attempt++){
        try{batchReply=await newcomer.tool('image_result',{request_id:batchRequest});break;}
        catch(error){lastError=error;await delay(100);}
      }
      assert.ok(batchReply,lastError?.message);report.assertions.push('accepted FFT batch -> cancelled waiting -> different plugin client recovers original completed parent');
    }else batchReply=await call('image_fft_batch',{request_id:batchRequest,object_id:calibrated.object_id,rects,window:'none',subtract_mean:true,max_size:256});
    png(batchReply);const batch=batchReply.data;
    const fftId=batch.regions[0].fft_object_id,fftBefore=scientificHash(fftId);
    const fft=(await client.tool('image_info',{object_id:fftId})).data;
    const detected=await call('image_peaks',{object_id:fftId,max_peaks:8,refinement:'none',threshold_rel:.2,max_size:256});png(detected);
    assert.equal(detected.data.peak_table.length,4);
    for(const peak of detected.data.peak_table){assert.equal(peak.status,'hypothesized');assert.ok(Math.abs(peak.frequency_magnitude_cycles_per_pixel-1/period)<1e-12);assert.ok(Math.abs(peak.d_spacing-.2)<1e-12);}
    const measured=await call('image_peak_measurements',{object_id:detected.data.object_id});png(measured);
    assert.equal(measured.data.measurements.length,4);
    const requestId=`comparison-input-${index}`;
    const compared=(await call('structure_compare_batch',{request_id:requestId,current_image_object_id:detected.data.object_id,
      measurement_object_ids:measured.data.measurements.map(row=>row.measurement_object_id),experimental_kind:'real_space_fft',max_residual_inv_angstrom:1e-6,
      candidates:[0,45].map((angle,n)=>({label:`candidate-${n}`,simulation_object_id:simulation.object_id,
        registration:{rotation_deg:angle,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'Explicit synthetic trial rotation in the calibrated image coordinate frame'}}))})).data;
    assert.equal(compared.batch_status,'completed');assert.equal(compared.candidates[0].matched.length,4);assert.equal(compared.candidates[1].unmatched_experimental.length,4);
    for(const candidate of compared.candidates){assert.equal(candidate.status,'hypothesized');assert.equal(candidate.independent_validation,'NOT_VALIDATED');assert.equal(candidate.phase_identified,false);}
    // A public mathematical oracle uses the DFT definition at one peak, not a second FFT library call.
    const maxErr=Number(run(absolutePython,"import numpy as np,tifffile,sys,cmath,json;a=tifffile.imread(sys.argv[1]);r=json.loads(sys.argv[3]);a=a[r[1]:r[3],r[0]:r[2]].astype(float);a-=a.mean();h,w=a.shape;p=int(sys.argv[4]);expected=sum(a[y,x]*cmath.exp(-2j*cmath.pi*x/p) for y in range(h) for x in range(w));actual=np.load(sys.argv[2],allow_pickle=False)[h//2,w//2+w//p];err=abs(actual-expected);assert err<1e-5,err;print(err)",[source,fft.array_path,JSON.stringify(rects[0]),String(period)]));
    const panelOpened=await call('image_panel_open',{object_id:batch.overview_object_id});png(panelOpened);
    const panelId=panelOpened.data.panel_id;
    const ownedConnection=JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',panelId+'.json'),'utf8'));
    assert.equal(ownedConnection.panel_id,panelId);
    report.panels.push({panel_id:panelId,url:panelOpened.data.panel_url,pid:ownedConnection.pid,ownership:'Fresh helper created by this smoke through image_panel_open'});
    const current=await client.tool('image_panel_current',{panel_id:panelId});png(current);
    const presented=await call('image_panel_show',{panel_id:panelId,object_id:measured.data.view_object_id,expected_object_id:current.data.view.object.object_id,draft_revision:current.data.view.edit_state.draft_revision});png(presented);
    assert.equal(presented.data.view.presentation.status,'shown');
    const response=await fetch(panelOpened.data.panel_url);assert.equal(response.status,200);assert.match(await response.text(),/<html/i);
    const marker=measured.data.measurements[0],oldMeasure=(await client.tool('image_info',{object_id:marker.measurement_object_id})).data;
    const first=marker.frequency_cycles_per_pixel;
    const revised=(await call('image_remeasure',{object_id:detected.data.object_id,measurement_object_id:marker.measurement_object_id,
      points:[[0,0],[first[0]+.25/fft.shape_yx[1],first[1]]],source_text:'Synthetic correction to a single measured peak; other measurements and spectrum are retained'})).data;
    assert.notEqual(revised.object_id,oldMeasure.object_id);
    for(const other of measured.data.measurements.slice(1)){const saved=(await client.tool('image_info',{object_id:other.measurement_object_id})).data;assert.equal(saved.d_spacing,other.d_spacing);}
    const tone=await call('image_preview',{object_id:measured.data.view_object_id,gamma:1.2,max_size:256});png(tone);
    assert.equal(scientificHash(fftId),fftBefore);assert.equal(hash(source),originalHash);
    const recoveredClient=makeClient();clients.push(recoveredClient);await recoveredClient.rpc('initialize');
    const objectsBefore=counts();
    assert.equal((await recoveredClient.tool('image_result',{request_id:batchRequest})).data.object_id,batch.object_id);
    assert.equal((await recoveredClient.tool('structure_result',{request_id:requestId})).data.object_id,compared.object_id);
    assert.equal((await recoveredClient.tool('image_panel_current',{panel_id:panelId})).data.view.object.object_id,measured.data.view_object_id);
    assert.equal(counts(),objectsBefore,'Recovery must not create scientific objects');
    report.inputs.push({source,source_sha256:originalHash,shape_yx:[height,width],dtype:'uint16',period_pixels:period,synthetic_scale_nm:scale,
      source_object_id:opened.object_id,frame_object_id:frame.object_id,calibration_object_id:calibrated.object_id,proposal_object_id:proposed.data.object_id,
      rects,batch_object_id:batch.object_id,batch_request_id:batchRequest,fft_object_id:fftId,fft_sha256:fftBefore,direct_dft_absolute_error:maxErr,
      peaks_object_id:detected.data.object_id,measurements:measured.data.measurements,measured_view_object_id:measured.data.view_object_id,
      comparison_object_id:compared.object_id,candidates:compared.candidates,revised_measurement_id:revised.object_id,tone_view_object_id:tone.data.object_id});
    console.log(`Plugin fixture${index+1}: science, candidate comparisons, Panel and fresh-client recovery PASS`);
  }
  report.result='PASS';report.completed_utc=new Date().toISOString();
  writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS: two different synthetic inputs through real plugin/MCP -> proposed multiscale ROIs -> FFT -> detected/measured peaks -> existing CIF orientation/diffsims candidate comparisons -> Panel HTTP -> single-peak revision -> new-client original-ID recovery; source and FFT hashes unchanged.');
  if(retained)console.log('Retained local evidence: '+path.join(directory,'report.json'));
}catch(error){report.result='FAIL';report.error=error.stack;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw error;}
finally{
  for(const target of clients)await target.close();
  if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
  if(!retained){
    // Only this test's freshly created Node helpers, never existing user processes.
    for(const row of report.panels){try{const connection=JSON.parse(readFileSync(path.join(workspace,'panel-registry','panels',row.panel_id+'.json'),'utf8'));process.kill(connection.pid);}catch{}}
    rmSync(directory,{recursive:true,force:true});
  }
}
