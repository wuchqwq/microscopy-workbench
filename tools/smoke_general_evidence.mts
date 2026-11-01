// Opt-in real stdio MCP → Python/ASE/diffsims acceptance on public analytic data.
// The cosine oracle is independent reciprocal geometry, not an HRTEM simulation.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient} from './image_panel.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):Row=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const rows=(v:unknown):Row[]=>{assert.ok(Array.isArray(v));return v.map(row);};
const text=(v:unknown):string=>{assert.equal(typeof v,'string');return v as string;};
const vectors=(v:unknown):number[][]=>{assert.ok(Array.isArray(v));return v.map(a=>{assert.ok(Array.isArray(a)&&a.every(n=>typeof n==='number'&&Number.isFinite(n)));return a as number[];});};
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const near=(a:number[],b:number[],tol:number)=>{assert.equal(a.length,b.length);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=tol),JSON.stringify({actual:a,expected:b,tol}));};
const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'general-crystal-evidence-'));
const executable=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const py=(code:string,args:string[]=[])=>{const r=spawnSync(executable,['-B','-X','utf8','-c',code,...args],{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,PYTHONPATH:''}});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const python=py('import sys; print(sys.executable)');
const fixture=row(JSON.parse(py(String.raw`
import sys,json,math,hashlib
from pathlib import Path
import numpy as np,tifffile
p=Path(sys.argv[1]);p.mkdir(parents=True,exist_ok=False)
n=128;a=4.;c=6.;s3=math.sqrt(3)
def cif(name,symbols,positions,hexagonal=False):
 lines=['# Public analytic model, not measured material parameters','data_'+name,'_cell_length_a 4','_cell_length_b 4','_cell_length_c '+('6' if hexagonal else '4'),'_cell_angle_alpha 90','_cell_angle_beta 90','_cell_angle_gamma '+('120' if hexagonal else '90'),"_space_group_name_H-M_alt 'P 1'",'_space_group_IT_number 1','loop_','_atom_site_label','_atom_site_type_symbol','_atom_site_fract_x','_atom_site_fract_y','_atom_site_fract_z','_atom_site_occupancy']
 lines += [f'{s}{i+1} {s} {x:.17g} {y:.17g} {z:.17g} 1' for i,(s,(x,y,z)) in enumerate(zip(symbols,positions))]
 f=p/(name+'.cif');f.write_text('\n'.join(lines)+'\n',encoding='ascii');return str(f)
structures={'bcc':cif('bcc_fe_a4',['Fe','Fe'],[[0,0,0],[.5,.5,.5]]),'b2':cif('ordered_b2_cscl_a4',['Cs','Cl'],[[0,0,0],[.5,.5,.5]]),'hcp':cif('hcp_mg_a4_c6',['Mg','Mg'],[[0,0,0],[2/3,1/3,.5]],True)}
bcc=[[.25,.25],[.5,0]];b2=[[.25,0],[0,.25],[.25,.25]];hcp=[[.25,1/(4*s3)],[0,2/(4*s3)],[.25,3/(4*s3)]]
def image(name,sets,scale):
 y,x=np.indices((n,n));parts=[];bins=[]
 for qs in sets:
  v=np.full((n,n),20000.);bs=[]
  for i,(qx,qy) in enumerate(qs):
   m=qx*scale[0]*n;k=qy*scale[1]*n
   assert abs(m-round(m))<1e-12 and abs(k-round(k))<1e-12
   bs.append([round(m),round(k)]);v+=(3000.-300*i)*np.cos(2*np.pi*(m*x+k*y)/n)
  parts.append(v.astype('float32'));bins.append(bs)
 f=p/(name+'.tiff');tifffile.imwrite(f,np.concatenate(parts),photometric='minisblack',metadata=None)
 return {'source_path':str(f),'shape_yx':[256,128],'dtype':'float32','scale_nm':[scale[0]/10,scale[1]/10],'q_inv_angstrom':sets,'bins':bins}
cases={'heterophase':image('bcc_b2_geometry',[bcc,b2],[.5,-.5]),'hexagonal':image('hcp_geometry',[hcp,hcp],[.5,-s3/2])}
truth={'scope':'Independent hard-coded conventional-cell reciprocal vectors; no production structure solver or simulated reflections generated truth. Cosines do not model HRTEM contrast/intensities.','cases':cases,'structures':structures,'hkls':{'bcc':[[1,1,0],[2,0,0]],'b2':[[1,0,0],[0,1,0],[1,1,0]],'hcp':[[1,0,0],[0,1,0],[1,1,0]]},'q_inv_angstrom':{'bcc':bcc,'b2':b2,'hcp':hcp},'registered_settings':{'reciprocal_radius_inv_angstrom':1.,'max_excitation_error_inv_angstrom':.02,'max_residual_inv_angstrom':.005,'peak_threshold_rel':.2,'window':'none','subtract_mean':True}}
truth['file_sha256']={str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.iterdir() if f.is_file()};(p/'truth.json').write_text(json.dumps(truth,indent=2)+'\n',encoding='utf-8');print(json.dumps(truth))
`,[path.join(directory,'fixture')])));
const workspaceRoot=path.join(directory,'workspace'),images=path.join(workspaceRoot,'images'),structures=path.join(workspaceRoot,'structures');
const config=path.join(directory,'plugin-config.json');writeFileSync(config,JSON.stringify({schema_version:1,python,structure_python:python,workspace_root:workspaceRoot,structures:true},null,2)+'\n');
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace:images,python,serverPath:path.join(repo,'tools/plugin_server.mjs')});
const first=makeClient(),clients=[first],started=performance.now(),calls:Row[]=[],checks:string[]=[],recovery:Row[]=[];
let serial=0;
const call=async(name:string,args:Row={},client=first)=>{
 const readonly=['structure_info','image_info'].includes(name),request_id=typeof args.request_id==='string'?args.request_id:readonly?undefined:`general-smoke-${++serial}`;
 const before=performance.now();console.log('MCP '+name+' '+request_id);
 try{const response=await client.tool(name,request_id===undefined?args:{...args,request_id});const data=row(response.data);assert.equal(data.backend,name.startsWith('structure_')?'external-structure-workspace':'external-image-workspace');return {...response,data};}
 finally{calls.push({tool:name,request_id,elapsed_ms:performance.now()-before});}
};
const data=async(name:string,args:Row={},client=first)=>(await call(name,args,client)).data;
const objects=(w:string)=>existsSync(path.join(w,'objects'))?readdirSync(path.join(w,'objects')).filter(id=>existsSync(path.join(w,'objects',id,'object.json'))):[];
const metadata=(w:string,id:string):Row=>row(JSON.parse(readFileSync(path.join(w,'objects',id,'object.json'),'utf8')));
const science=()=>Object.fromEntries([images,structures].flatMap(w=>objects(w).filter(id=>['frame','fft','structure','simulate','orient'].includes(text(metadata(w,id).kind))).flatMap(id=>readdirSync(path.join(w,'objects',id)).map(n=>{const f=path.join(w,'objects',id,n);return [f,hash(f)];}))));
const immutable=()=>Object.fromEntries([images,structures].flatMap(w=>['objects','requests'].flatMap(namespace=>{const dir=path.join(w,namespace);if(!existsSync(dir))return [];return namespace==='requests'?readdirSync(dir).map(n=>path.join(dir,n)):readdirSync(dir).flatMap(id=>readdirSync(path.join(dir,id)).map(n=>path.join(dir,id,n)));})).map(f=>[f,hash(f)]));
const counts=()=>({fft:objects(images).filter(id=>metadata(images,id).kind==='fft').length,simulate:objects(structures).filter(id=>metadata(structures,id).kind==='simulate').length});
const registration={rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'Independent analytic +X,+Y laboratory reciprocal frame with signed XY calibration. No scale, DC, mirror or domain-specific fit.'};
const report:Row={schema_version:1,scope:'Actual formal MCP/Python/ASE/diffsims public synthetic evidence, not real specimen, twin law, unique phase or physical intensity validation',started_utc:new Date().toISOString(),oracle:fixture,calls,checks,not_tested:['real specimen','human GUI gestures','fresh model session','automatic phase/orientation search','unique 3D orientation or twin relation','dynamical scattering/HRTEM contrast/intensity comparison','worker interruption injection','Mac desktop or DM']};
try{
 await first.rpc('initialize');
 const catalog=rows(row(row(await first.rpc('tools/list')).result).tools);assert.ok(catalog.some(t=>t.name==='structure_general_compare'));
 const sims:Record<string,Row>={},orientations:Record<string,Row>={};
 for(const key of ['bcc','b2','hcp']){
  const opened=await data('structure_open',{source_path:row(fixture.structures)[key]});
  const orientation=await data('structure_orient',{object_id:opened.object_id,zone_axis_uvw:[0,0,1],in_plane_direction_uvw:[1,0,0]});orientations[key]=orientation;
  vectors(row(orientation.orientation).rotation_matrix_cartesian).forEach((r,i)=>near(r,[+(i===0),+(i===1),+(i===2)],2e-12));
  const simulation=await data('structure_simulate',{object_id:opened.object_id,orientation_id:orientation.object_id,voltage_kv:200,reciprocal_radius_inv_angstrom:1,max_excitation_error_inv_angstrom:.02,size:64,sigma_pixels:1,with_direct_beam:false,native_float32:false});sims[key]=simulation;
  const reflected=row(simulation.reflections),hkls=vectors(reflected.hkl),coords=vectors(reflected.coordinates_inv_angstrom),expectedHkls=vectors(row(fixture.hkls)[key]),expectedQ=vectors(row(fixture.q_inv_angstrom)[key]);
  for(let i=0;i<expectedHkls.length;i++){const j=hkls.findIndex(h=>JSON.stringify(h)===JSON.stringify(expectedHkls[i]));assert.ok(j>=0,key+' analytic allowed HKL absent '+expectedHkls[i]);near(coords[j],[...expectedQ[i],0],2e-12);}
  recovery.push({provider:'structure',object_id:simulation.object_id,request_id:simulation.request_id});
 }
 checks.push('Three actual pinned diffsims simulations (BCC, ordered B2 CsCl, HCP) preserve shared UVW orientations; independent analytic HKL and q coordinates agree. Exact source CIF P1 declarations are not falsely promoted to verified crystal symmetry.');
 const contexts:Record<string,Row>={};
 for(const name of ['heterophase','hexagonal']){
  const oracle=row(row(fixture.cases)[name]),opened=await data('image_open',{source_path:oracle.source_path}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0});
  const scale=oracle.scale_nm as number[],calibrated=await data('image_calibrate',{object_id:frame.object_id,scope:'image',xy_scale:{x:scale[0],y:scale[1],unit:'nm'},source_text:'Explicit public analytic signed sampling, not experimentally verified calibration'});
  const field=await data('image_spatial_field',{object_id:calibrated.object_id,window_sizes:[128],stride_xy:[128,128],max_windows:2,coordinate_domain:'physical',window:'none',subtract_mean:true,max_peaks:12,max_size:256,peak_options:{min_separation_bins:1,exclude_dc_radius_bins:1,threshold_rel:.2,refinement:'none'}});
  const samples=rows(field.samples);assert.equal(samples.length,2);
  const qsets=oracle.q_inv_angstrom as number[][][];
  const domains=samples.map((sample,index)=>{
   const ids=sample.measurement_object_ids as string[];assert.equal(ids.length,qsets[index].length*2,'Every real cosine supplies one preserved Friedel pair');
   const expected=qsets[index].flatMap(q=>[q.map(v=>v*10),q.map(v=>-v*10)]),actual=ids.map(id=>metadata(images,id).physical_vector_xy as number[]);
   for(const q of actual)assert.ok(expected.some(v=>Math.hypot(v[0]-q[0],v[1]-q[1])<1e-10),JSON.stringify({name,q,expected}));
   for(const q of expected)assert.ok(actual.some(v=>Math.hypot(v[0]-q[0],v[1]-q[1])<1e-10));
   return {field_object_id:field.object_id,rect_xyxy:sample.rect_xyxy,current_image_object_id:sample.view_object_id??sample.fft_object_id,measurement_object_ids:ids};
  });
  contexts[name]={current_spatial_image_object_id:calibrated.object_id,domains};recovery.push({provider:'image',object_id:field.object_id,request_id:field.request_id});
 }
 const protectedScience=science(),before=counts();assert.deepEqual(before,{fft:4,simulate:3});
 const common:Row={...contexts.heterophase,experimental_kind:'real_space_fft',registration,max_residual_inv_angstrom:.005};
 const pair=(label:string,a:string,b:string)=>({label,simulation_a_object_id:sims[a].object_id,simulation_b_object_id:sims[b].object_id,basis:'Explicit synthetic candidate source/sites and zone[001], not identified material'});
 const reply=await call('structure_general_compare',{...common,candidates:[pair('BCC / ordered B2','bcc','b2'),pair('wrong BCC / BCC','bcc','bcc'),pair('projected alternative ordered B2 / B2','b2','b2')]});
 const main=reply.data;assert.equal(main.kind,'crystal_evidence');assert.equal(main.phase_identified,false);assert.equal(main.twin_law_tested,false);
 assert.equal(typeof reply.png,'string');assert.equal(Buffer.from(reply.png as string,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');writeFileSync(path.join(directory,'general-evidence.png'),Buffer.from(reply.png as string,'base64'));
 const pairs=rows(main.candidate_pairs);assert.equal(pairs.length,3);report.heterophase=main;
 assert.deepEqual(pairs.map(p=>p.status),['compatible','incompatible','compatible']);assert.equal(main.status,'insufficient_evidence','Two geometrically compatible projections cannot identify a unique material pair');
 const hcp=await data('structure_general_compare',{...contexts.hexagonal,experimental_kind:'real_space_fft',registration,max_residual_inv_angstrom:.005,candidates:[pair('HCP / HCP','hcp','hcp')]});report.hexagonal=hcp;
 assert.equal(hcp.status,'compatible');assert.equal(rows(hcp.candidate_pairs)[0].status,'compatible');
 const domainSpecs=(common.domains as Row[]).map(v=>({...v}));const chosen=(domainSpecs[0].measurement_object_ids as string[])[0];
 domainSpecs[0].measurement_object_ids=[chosen];
 const incomplete=await data('structure_general_compare',{...common,domains:domainSpecs,candidates:[pair('incomplete observed directions','bcc','b2')]});report.incomplete=incomplete;
 assert.equal(incomplete.status,'insufficient_evidence');
 const originalFiles=immutable(),revised=await data('structure_general_compare',{...common,candidates:[pair('BCC / ordered B2','bcc','b2')],previous_evidence_id:main.object_id,revision_note:'Explicit candidate subset revision; preserve original competing explanations and all immutable FFT/simulation inputs'});report.revision=revised;
 for(const [f,digest] of Object.entries(originalFiles))assert.equal(hash(f),digest);
 assert.deepEqual(science(),protectedScience);assert.deepEqual(counts(),before);
 await assert.rejects(data('structure_general_compare',{...common,candidates:[pair('BCC / ordered B2','bcc','b2')],request_id:main.request_id,max_residual_inv_angstrom:.006}),/REQUEST_CONFLICT|different|conflict/i);
 const moved=(common.domains as Row[]).map(v=>({...v}));moved[1].rect_xyxy=[1,128,128,256];
 await assert.rejects(data('structure_general_compare',{...common,domains:moved,candidates:[pair('illegal moved ROI','bcc','b2')]}),/ROI|observation|scope|rect|support/i);
 for(const saved of [main,hcp,incomplete,revised])recovery.push({provider:'structure',object_id:saved.object_id,request_id:saved.request_id});
 for(const saved of [main,hcp,incomplete,revised]){
  assert.equal(saved.interpretation_status,'hypothesized');assert.equal(saved.phase_identified,false);assert.equal(saved.twin_law_tested,false);assert.equal(saved.intensity_comparison_performed,false);assert.equal(saved.source_arrays_modified,false);assert.equal(saved.fft_recomputed,false);assert.equal(saved.simulation_recomputed,false);
 }
 const beforeRecovery=immutable(),fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of recovery){const restored=await data(saved.provider==='structure'?'structure_result':'image_result',{request_id:saved.request_id},fresh);assert.equal(restored.object_id,saved.object_id);}
 assert.deepEqual(immutable(),beforeRecovery);assert.deepEqual(science(),protectedScience);assert.deepEqual(counts(),before);
 for(const [file,digest] of Object.entries(row(fixture.file_sha256)))assert.equal(hash(file),digest);
 checks.push('Actual two-ROI source/frame/FFT/signed calibration and numerical observations match independent cosine truth; candidate comparison/revision/query add zero FFT and zero simulations.');
 checks.push('Wrong-ROI input and conflicting original request refuse; a new MCP client recovers original outcomes, preserving all source arrays, old records and authoritative request bytes.');
 checks.push('Correct heterophase BCC/B2 and HCP/HCP geometry is conditional; wrong BCC/BCC fails, shared projected B2/B2 alternative keeps joint verdict insufficient, and one direction cannot establish a two-dimensional relation.');
 const copied:Row[]=[];
 for(const [name,saved] of [['heterophase',main],['hexagonal',hcp],['incomplete',incomplete],['revision',revised]] as const){
  for(const filename of ['comparisons.json','observation-bindings.json','qualification.json','reflections.csv','preview.png','object.json']){
   const source=path.join(structures,'objects',text(saved.object_id),filename),target=path.join(directory,name+'-'+filename);copyFileSync(source,target);assert.equal(hash(source),hash(target));copied.push({scope:'Byte-exact committed scientific/display evidence copy; not a portable scientific workspace',source,target,sha256:hash(target)});
  }
 }
 report.evidence_copies=copied;
 report.integrity={source_sha256:fixture.file_sha256,scientific_files_unchanged:Object.keys(protectedScience).length,recovery_files_unchanged:Object.keys(beforeRecovery).length,counts:counts(),recovery};
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-started;
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);report.runtime_ms=performance.now()-started;throw error;}
finally{writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');for(const c of clients)await c.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;console.log(text(report.result)+': retained at '+path.join(directory,'report.json'));}
