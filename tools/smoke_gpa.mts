// Actual MCP stdio/Python acceptance on a public analytic finite-affine fixture.
// No private specimen, browser gesture, DM process or alternate GPA engine.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {StdioImageClient,createImagePanel} from './image_panel.mjs';

type Data=Record<string,unknown>;
const record=(value:unknown):Data=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Data;};
const identifier=(value:unknown):string=>{assert.equal(typeof value,'string');assert.match(value as string,/^[a-f0-9]{32}$/);return value as string;};
const repo=fileURLToPath(new URL('../',import.meta.url)),retained=process.env.MICROSCOPY_SMOKE_OUTPUT;
if(retained&&(!path.isAbsolute(retained)||existsSync(retained)))throw Error('MICROSCOPY_SMOKE_OUTPUT must be a new absolute directory');
const directory=retained?(mkdirSync(retained,{recursive:true}),retained):mkdtempSync(path.join(tmpdir(),'classical-gpa-'));
const candidate=process.env.MICROSCOPY_PYTHON??(process.platform==='win32'?'python':'python3');
const execute=(code:string,args:string[]=[]):string=>{
 const reply=spawnSync(candidate,['-B','-c',code,...args],{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,PYTHONPATH:''}});
 if(reply.error)throw reply.error;assert.equal(reply.status,0,reply.stderr);return reply.stdout.trim();
};
const python=execute('import sys; print(sys.executable)'),workspaceRoot=path.join(directory,'workspace'),workspace=path.join(workspaceRoot,'images');
const source=path.join(directory,'public-affine.tiff'),oracle=path.join(directory,'oracle.json');
const versions=JSON.parse(execute('import sys,json,numpy,scipy,skimage; print(json.dumps(dict(python=sys.version,numpy=numpy.__version__,scipy=scipy.__version__,scikit_image=skimage.__version__)))')) as unknown;
execute(String.raw`
import json,sys,numpy as np,tifffile
n=256;y,x=np.mgrid[:n,:n];r=np.stack([x,y],axis=-1)
G=np.array([[32,8],[-8,32]],float)/n;K=np.array([[31,7],[-9,33]],float)/n
F=np.linalg.solve(K,G);H=np.eye(2)-np.linalg.solve(G,K)
phase=2*np.pi*np.einsum('ji,hwi->jhw',K,r)+np.array([.31,-.44])[:,None,None]
a=(1.25+.8*np.cos(phase[0])+.65*np.cos(phase[1])).astype(np.float32)
tifffile.imwrite(sys.argv[1],a,metadata=None)
json.dump(dict(shape=[n,n],g=G.tolist(),observed_g=K.tolist(),F_pixel=F.tolist(),H_pixel=H.tolist(),metric_nm_xy=[.023,-.031],reference_rect=[80,80,176,176],meaning='Public synthetic two-tone affine lattice; no experimental specimen or calibration.'),open(sys.argv[2],'w'),indent=2)
`,[source,oracle]);
const truth=record(JSON.parse(readFileSync(oracle,'utf8'))),config=path.join(directory,'plugin-config.json');
writeFileSync(config,JSON.stringify({schema_version:1,python,workspace_root:workspaceRoot,structures:false},null,2));
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=config;
const makeClient=()=>new StdioImageClient({workspace,python,serverPath:path.join(repo,'tools','plugin_server.mjs')});
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
// Refused writes may retain unpublished staging directories. Only object.json
// marks a published scientific object; a refusal must not become an FFT count.
const objects=()=>readdirSync(path.join(workspace,'objects')).filter(id=>existsSync(path.join(workspace,'objects',id,'object.json')));
const metadata=(id:string)=>record(JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')));
const fftCount=()=>objects().filter(id=>metadata(id).kind==='fft').length;
const gpaCount=()=>objects().filter(id=>metadata(id).kind==='gpa').length;
const allFiles=(id:string)=>Object.fromEntries(readdirSync(path.join(workspace,'objects',id)).map(name=>[name,hash(path.join(workspace,'objects',id,name))]));
const png=(value:unknown)=>{assert.equal(typeof value,'string');assert.equal(Buffer.from(value as string,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');};
const clients=[makeClient()],first=clients[0],start=performance.now();let serial=0,panel:Awaited<ReturnType<typeof createImagePanel>>|null=null;
const timings:Data[]=[],checks:string[]=[],tag=hash(oracle).slice(0,10);
const report:Data={started_utc:new Date().toISOString(),scope:'Actual public MCP stdio/Python single-domain GPA, analytic finite affine fixture and Panel HTTP',versions,checks,timings,not_tested:['browser/GUI gestures','native DM/GMS/vendor/hardware','real specimen strain accuracy','compound-basis pseudo-strain removal','fresh ordinary model session using the Skill','F3 segmentation/defect analysis','ptychography']};
const call=async(name:string,args:Data={},client=first)=>{
 const request_id=typeof args.request_id==='string'?args.request_id:`gpa-${tag}-${++serial}`,t=performance.now();
 try{return await client.tool(name,{...args,request_id});}finally{timings.push({tool:name,request_id,elapsed_ms:performance.now()-t});}
};
const data=async(name:string,args:Data={},client=first)=>record((await call(name,args,client)).data);
const options={source_domain:'real_space_lattice',source_domain_text:'Public synthetic real-space lattice: this script constructs two spatial cosine waves analytically, not a diffraction-intensity image or complex reconstruction phase.',g_vectors:truth.g,mask_sigma:.012,reference_rect:truth.reference_rect,reference_mode:'fixed_g',reference_text:'Analytic public fixture: supplied reference waves are G; the central ROI fixes translation gauge only, not a strain-free assertion.',amplitude_floor_relative:.05,max_size:512};
try{
 await first.rpc('initialize');
 const catalog=record(record(await first.rpc('tools/list')).result).tools;assert.ok(Array.isArray(catalog));
 const names=catalog.map(tool=>record(tool).name);for(const name of ['image_gpa','image_gpa_view','image_gpa_read'])assert.ok(names.includes(name));
 writeFileSync(path.join(directory,'gpa-catalog.json'),JSON.stringify(catalog.filter(tool=>String(record(tool).name).startsWith('image_gpa')),null,2));
 const sourceHash=hash(source),opened=await data('image_open',{source_path:source}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0});
 assert.equal(frame.dtype,'float32');
 const fft=await data('image_fft',{object_id:frame.object_id,rect:[0,0,256,256],window:'none',subtract_mean:true});
 const fftId=identifier(fft.object_id),fftHash=hash(path.join(workspace,'objects',fftId,'data.npy'));
 assert.equal(fftCount(),1);
 const unknownReply=await call('image_gpa',{object_id:fftId,...options}),unknown=record(unknownReply.data);png(unknownReply.png);
 const unknownId=identifier(unknown.object_id);assert.equal(record(unknown.report).coordinate_domain,'image_coordinate');
 assert.equal(record(unknown.array_manifest).displacement_nm_xy,undefined);assert.equal(unknown.fft_recomputed,false);assert.equal(unknown.material_strain_verified,false);
 const originalFiles=allFiles(unknownId);
 const calibrated=await data('image_calibrate',{object_id:fftId,scope:'image',xy_scale:{x:.023,y:-.031,unit:'nm'},source_text:'Public synthetic signed anisotropic metric; prescribed oracle, not an experimental calibration.'});
 const physicalReply=await call('image_gpa',{object_id:calibrated.object_id,...options,previous_gpa_id:unknownId}),physical=record(physicalReply.data);png(physicalReply.png);
 const physicalId=identifier(physical.object_id);assert.equal(record(physical.report).coordinate_domain,'physical_cartesian_nm');assert.notEqual(physicalId,unknownId);
 const fitted=await data('image_gpa',{object_id:calibrated.object_id,...options,reference_mode:'fit_reference',reference_text:'Analytic public fixture: fit the affine central lattice as the relative reference, so its uniform deformation becomes zero by construction.',previous_gpa_id:physicalId});
 const maskRevision=await data('image_gpa',{object_id:calibrated.object_id,...options,mask_sigma:.010,previous_gpa_id:physicalId});
 const referenceRevision=await data('image_gpa',{object_id:calibrated.object_id,...options,reference_rect:[88,88,168,168],previous_gpa_id:maskRevision.object_id});
 assert.equal(fftCount(),1);assert.deepEqual(allFiles(unknownId),originalFiles);
 checks.push('Existing one FFT reused for unknown/known signed metric, fixed/fitted references and separate mask/reference GPA revisions; prior GPA immutable.');
 const countBeforeView=gpaCount(),views:Data[]=[];
 for(const component of ['phase_1','ux','exx','exy','rotation']){
  const viewReply=await call('image_gpa_view',{object_id:physicalId,component,max_size:512,...(component==='exx'?{display_range:[-.1,.1]}:{})});
  const view=record(viewReply.data);png(viewReply.png);assert.equal(view.gpa_recomputed,false);assert.equal(view.gpa_object_id,physicalId);views.push(view);
  writeFileSync(path.join(directory,`${component}-preview.png`),Buffer.from(viewReply.png as string,'base64'));
 }
 assert.equal(gpaCount(),countBeforeView);assert.equal(fftCount(),1);
 const samples=await data('image_gpa_read',{object_id:physicalId,points:[[0,0],[96,96],[128,128],[160,160]]});
 assert.ok(Array.isArray(samples.samples));const rows=samples.samples.map(record);assert.equal(rows[0].tensor_valid,false);assert.equal(rows[0].exx,null);
 assert.ok(rows.slice(1).every(row=>row.tensor_valid===true&&row.ux_unit==='nm'&&row.rotation_unit==='degree'));
 const verificationInput=path.join(directory,'verification-input.json');
 writeFileSync(verificationInput,JSON.stringify({oracle:truth,workspace,unknown,physical,fitted,maskRevision,referenceRevision,samples},null,2));
 report.analytic_oracle=JSON.parse(execute(String.raw`
import json,sys,pathlib,numpy as np
p=json.load(open(sys.argv[1],encoding='utf8'));q=p['oracle'];root=pathlib.Path(p['workspace'])/'objects';G=np.array(q['g']);K=np.array(q['observed_g']);F=np.array(q['F_pixel']);H=np.array(q['H_pixel']);S=np.diag(q['metric_nm_xy'])
Fp=S@F@np.linalg.inv(S);E=.5*(Fp.T@Fp-np.eye(2));rot=np.arctan2(Fp[1,0]-Fp[0,1],Fp[0,0]+Fp[1,1]);errors={}
for key,expected in [('unknown',F),('physical',Fp),('maskRevision',Fp),('referenceRevision',Fp),('fitted',np.eye(2))]:
 d=root/p[key]['object_id'];valid=np.load(d/'valid_tensor.npy');assert valid.dtype==np.bool_ and valid[128,128]
 a=np.load(d/'deformation_gradient_xy.npy');e=float(np.max(np.abs(a[valid]-expected)));assert e<5e-7,(key,e);errors[key+'_F_max_error']=e
 e_expected=.5*(expected.T@expected-np.eye(2));actual=np.load(d/'strain_green_lagrange_xy.npy');err=float(np.max(np.abs(actual[valid]-e_expected)));assert err<5e-7,(key,err);errors[key+'_E_max_error']=err
 if key=='physical':
  angle=np.load(d/'rotation_radians.npy');err=float(np.max(np.abs(angle[valid]-rot)));assert err<5e-7;errors['physical_rotation_radian_max_error']=err
  u=np.load(d/'displacement_nm_xy.npy');v=np.load(d/'valid_displacement.npy');y,x=np.mgrid[:256,:256];center=np.array(p[key]['report']['reference_center_xy']);expected_u=np.einsum('ij,hwj->hwi',S@H,np.stack([x,y],axis=-1)-center)
  err=float(np.max(np.abs(u[v]-expected_u[v])));assert err<5e-7,err;errors['physical_displacement_nm_max_error']=err
 if key=='fitted': assert np.max(np.abs(np.array(p[key]['report']['effective_g_vectors_cycles_per_pixel'])-K))<5e-9
for row in p['samples']['samples'][1:]:
 assert max(abs(row['exx']-E[0,0]),abs(row['eyy']-E[1,1]),abs(row['exy']-E[0,1]))<5e-7
 assert abs(row['rotation']-rot*180/np.pi)<5e-7
print(json.dumps(dict(errors=errors,expected_F_pixel=F.tolist(),expected_F_physical=Fp.tolist(),expected_E_physical=E.tolist(),expected_rotation_radians=float(rot),finite_eulerian_relation='H=I-F^-1',independent_target='matrix algebra from prescribed image wavevectors; production GPA kernel not imported')))
`,[verificationInput]));
 checks.push('Saved arrays and exact MCP samples agree with independent finite-affine matrix algebra, signed anisotropic metric and fitted-reference zero; invalid edge sample is null.');
 for(const [label,id] of [['gpa',physicalId],['gpa-view',identifier(views[2].object_id)]] as const){
  const exported=await data('image_export',{object_id:id,output_dir:path.join(directory,label+'-export')});
  const files=record(exported.exported_files_sha256);for(const [name,digest] of Object.entries(files))assert.equal(hash(path.join(String(exported.output_dir),name)),digest);
  for(const name of ['displacement_pixel_xy.npy','valid_tensor.npy','strain_green_lagrange_xy.npy','gpa-report.json','gpa-summary.csv','provenance.json','manifest.json','preview.png'])assert.ok(name in files,name);
  execute(String.raw`
import csv,json,pathlib,sys,numpy as np
d=pathlib.Path(sys.argv[1]);rows=list(csv.DictReader(open(d/'gpa-summary.csv',encoding='utf8',newline='')));assert len(rows)==8
r=json.load(open(d/'gpa-report.json',encoding='utf8'));a=np.load(d/'strain_green_lagrange_xy.npy');v=np.load(d/'valid_tensor.npy');assert a.shape==(*v.shape,2,2) and v.dtype==np.bool_;assert np.isfinite(a[v]).all();assert np.isnan(a[~v]).all()
assert next(z for z in rows if z['component']=='exx')['unit']=='dimensionless'
`,[String(exported.output_dir)]);
  await assert.rejects(data('image_export',{object_id:id,output_dir:exported.output_dir}),/OUTPUT_EXISTS|already exists/);
 }
 checks.push('GPA and GPA-view exports retain all array/mask/report/CSV/provenance hashes and NaN masks; existing output directory is refused.');
 const beforeRecovery={objects:objects().length,ffts:fftCount()},fresh=makeClient();clients.push(fresh);await fresh.rpc('initialize');
 for(const saved of [unknown,physical,fitted,maskRevision,referenceRevision,views[2],samples]){
  const recovered=record((await fresh.tool('image_result',{request_id:saved.request_id})).data);assert.equal(recovered.object_id,saved.object_id);
  assert.equal(record((await fresh.tool('image_info',{object_id:saved.object_id})).data).object_id,saved.object_id);
 }
 assert.deepEqual({objects:objects().length,ffts:fftCount()},beforeRecovery);
 panel=await createImagePanel({workspace,python,object_id:identifier(views[2].object_id)});
 const origin=panel.url.split('/#')[0];assert.equal((await fetch(origin)).status,200);
 const stateResponse=await fetch(origin+'/api/state',{headers:{'X-Panel-Token':panel.token}});assert.equal(stateResponse.status,200);
 const state=record(await stateResponse.json());assert.equal(record(state.object).object_id,views[2].object_id);png(state.png_base64);
 report.panel={http_status:200,object_id:record(state.object).object_id,scope:'Actual Panel creation, static HTTP and authenticated state/PNG only; no browser or gestures'};
 checks.push('Fresh MCP client recovers original GPA/view/sample request IDs without science objects or FFTs; actual Panel HTTP/state exposes the saved component.');
 assert.equal(hash(source),sourceHash);assert.equal(hash(path.join(workspace,'objects',fftId,'data.npy')),fftHash);assert.deepEqual(allFiles(unknownId),originalFiles);assert.equal(fftCount(),1);
 report.source_integrity={source_sha256:sourceHash,fft_sha256:fftHash,source_unchanged:true,fft_unchanged:true,forward_fft_count:fftCount()};
 report.references={source:opened.object_id,frame:frame.object_id,fft:fftId,unknown_gpa:unknownId,physical_gpa:physicalId,fitted_gpa:fitted.object_id,mask_revision:maskRevision.object_id,reference_revision:referenceRevision.object_id,views:views.map(view=>view.object_id),samples:samples.object_id};
 report.result='PASS';report.completed_utc=new Date().toISOString();report.runtime_ms=performance.now()-start;
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
 console.log('PASS: actual GPA MCP/Python, independent finite-affine oracle, references/metric, immutable revisions, view/read, export, fresh recovery and Panel HTTP.');
}catch(caught){report.result='FAIL';report.error=caught instanceof Error?caught.stack:String(caught);report.runtime_ms=performance.now()-start;writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));throw caught;}
finally{await panel?.close();for(const client of clients)await client.close();if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;console.log('Public evidence: '+path.join(directory,'report.json'));}
