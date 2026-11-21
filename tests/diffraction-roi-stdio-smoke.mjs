// Actual packaged MCP, image and CIF workers, and Panel save/reopen.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient, createImagePanel} from '../tools/image_panel.mjs';
import {readAnalysisWorkspaceResumeSnapshot} from '../lib/analysis_workspace.mjs';

const [fixture, output] = process.argv.slice(2);
const python = process.env.MICROSCOPY_PYTHON;
for (const entry of [fixture, output, python]) assert.ok(entry && path.isAbsolute(entry));
mkdirSync(output);
const repo = fileURLToPath(new URL('../', import.meta.url));
const workspaceRoot = path.join(output, 'workspace');
const workspace = path.join(workspaceRoot, 'images');
const hdf = path.join(output, 'scan.h5');
const flat = path.join(output, 'flat.npy');
const spots = path.join(output, 'spots.npy');
const angles = path.join(output, 'blank.npy');
const cif = path.join(output, 'cu.cif');
const axisScan = path.join(output, 'axis-scan.npy');
const axisCif = path.join(output, 'axis-candidate.cif');
const fixtureSource = String.raw`
import sys,h5py,numpy as np
from ase import Atoms
from ase.build import bulk
from ase.io import write
source,hdf,flat,spots,angles,cif,axis_scan,axis_cif=sys.argv[1:]
scan=np.load(source,allow_pickle=False)
assert scan.shape==(5,6,64,72)
with h5py.File(hdf,'w') as out:
    out['/entry/detector']=scan
    out['/linked']=h5py.ExternalLink('untested-neighbor.h5','/scan')
np.save(flat,scan.reshape(30,64,72))
# Add explicit synthetic reflections with true centre (35,31), at +25 X and -25 Y.
scan[:,:,31,60]+=200
scan[:,:,6,35]+=200
np.save(spots,scan)
np.save(angles,np.zeros((1,1,32,32),dtype=np.float32))
write(cif,bulk('Cu','fcc',a=4,cubic=True))

# Scan values distinguish row, column and averaging. These two detector
# samples distinguish array [row,column] from the image point (column,row).
scan_ids=10*np.arange(2)[:,None]+np.arange(3)[None,:]
axis_data=np.broadcast_to(scan_ids.astype(np.uint16)[:,:,None,None],(2,3,7,9)).copy()
axis_data[:,:,3,4]+=20
axis_data[:,:,2,6]+=10
np.save(axis_scan,axis_data)
# In the [001] projection with [100] along +X, (110) is (.20,.10) cycles/Å.
write(axis_cif,Atoms('Cu',scaled_positions=[[0,0,0]],cell=[5,10,4],pbc=True))
`;
function py(code, ...args) {
 const result = spawnSync(python, ['-B', '-c', code, ...args], {encoding:'utf8', timeout:60_000});
 assert.equal(result.status, 0, result.stderr);
}
py(fixtureSource, fixture, hdf, flat, spots, angles, cif, axisScan, axisCif);
const originalConfig = process.env.MICROSCOPY_PLUGIN_CONFIG;
const config = path.join(output, 'plugin-config.json');
writeFileSync(config, JSON.stringify({schema_version:1, python, workspace_root:workspaceRoot, structures:true}));
process.env.MICROSCOPY_PLUGIN_CONFIG = config;
const makeClient = () => new StdioImageClient({workspace, python, serverPath:path.join(repo,'tools/plugin_server.mjs')});
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceSha = sha(fixture);
const selection = {source_path:fixture, layout:'scan4d', scan_roi_y0_y1_x0_x1:[1,5,2,6], source_text:'Public analytic scan fixture'};
const result = {scope:'Synthetic scan fixtures; real stdio/CIF workers and Panel HTTP; no instrument or native UI gestures'};
let client, panel;

try {
 client = makeClient();
 await client.rpc('initialize');
 const catalog = (await client.rpc('tools/list')).result.tools.map(t => t.name);
 assert.ok(catalog.includes('image_import_diffraction_roi'));
 assert.ok(catalog.includes('structure_compare_batch'));
 const call = async (name, args) => (await client.tool(name, args)).data;
 const ingest = (request_id, args={}) => call('image_import_diffraction_roi', {...selection, ...args, request_id});
 const mean = await ingest('roi-npy', {disk_radius_range_px:[15,25]});
 const h5Mean = await ingest('roi-h5', {source_path:hdf, dataset_key:'/entry/detector'});
 const flatMean = await ingest('roi-flat', {source_path:flat, layout:'flat3d', scan_shape_yx:[5,6]});
 const provenance = mean.diffraction_roi;
 assert.equal(mean.source_identity.sha256, sourceSha);
 assert.equal(mean.array_domain, 'reciprocal');
 assert.equal(mean.panels[0].domain, 'source_array_indices');
 assert.equal(mean.xy_calibration, undefined);
 assert.equal(provenance.beam_center_status, 'unconfirmed');
 assert.deepEqual(provenance.scan_roi_y0_y1_x0_x1_exclusive, [1,5,2,6]);
 assert.equal(provenance.pattern_count, 16);
 assert.equal(provenance.disk_fit.status, 'candidate');
 assert.ok(Math.abs(provenance.disk_fit.radius_px-19.5) < .6);
 assert.ok(Math.hypot(provenance.disk_fit.center_xy_px[0]-35.25,provenance.disk_fit.center_xy_px[1]-30.75) < .5);
 for (const array of [h5Mean, flatMean]) assert.equal(sha(mean.array_path), sha(array.array_path));
 py(`import numpy as np,sys
a,b=map(np.load,sys.argv[1:])
assert b.dtype==np.float64
np.testing.assert_array_equal(a[1:5,2:6].mean(axis=(0,1),dtype=np.float64),b)`, fixture, mean.array_path);
 await assert.rejects(ingest('bad-roi',{scan_roi_y0_y1_x0_x1:[1,6,2,6]}), /inside the scan/);
 await assert.rejects(ingest('bad-order',{layout:'flat3d',scan_shape_yx:[5,6]}), /declared layout/);
 await assert.rejects(ingest('linked-hdf5',{source_path:hdf,dataset_key:'/linked'}), /local hard links/);
 const blank = await ingest('blank-disk', {source_path:angles,scan_roi_y0_y1_x0_x1:[0,1,0,1],disk_radius_range_px:[5,12]});
 assert.equal(blank.diffraction_roi.disk_fit.status,'not_identifiable');
 assert.equal(blank.diffraction_roi.disk_fit.center_xy_px,null);
 const withSpots = await ingest('roi-spots',{source_path:spots});
 const points = [[35,31],[60,31]];
 const unscaled = await call('image_measure',{object_id:withSpots.object_id,points,coordinate_space:'source_array_indices',request_id:'pixel-only'});
 assert.equal(unscaled.measurement_domain,'pixel_geometry');
 assert.equal(unscaled.d_spacing,null);
 const scale = await call('image_calibrate',{object_id:withSpots.object_id,scope:'image',coordinate_domain:'reciprocal_space',
  xy_scale:{x:.02,y:-.02,unit:'1/Å'},source_text:'Prescribed synthetic detector scale',request_id:'scale'});
 assert.equal(scale.xy_calibration.dc_index_xy,undefined);
 const centered = await call('image_center',{object_id:scale.object_id,center_xy:points[0],
  coordinate_space:'source_array_indices',source_text:'Prescribed synthetic beam centre',request_id:'center'});
 assert.deepEqual(centered.xy_calibration.dc_index_xy,points[0]);
 assert.equal(centered.xy_calibration.centre_source.source_text,'Prescribed synthetic beam centre');
 const view = await call('image_preview',{object_id:centered.object_id,request_id:'view'});
 assert.equal(view.diffraction_roi.mean_object_id,withSpots.object_id);
 await assert.rejects(call('image_fft',{object_id:view.object_id,request_id:'wrong-fft'}), /already has detector reciprocal geometry/);
 const reflections = [];
 for (const [i, peak] of [[60,31],[35,6]].entries()) {
  const saved = await call('image_measure',{object_id:view.object_id,points:[points[0],peak],
   coordinate_space:'source_array_indices',request_id:'reflection-'+i});
  assert.equal(saved.diffraction_roi_object_id,withSpots.object_id);
  assert.deepEqual(saved.physical_vector_xy,i===0?[.5,0]:[0,.5]);
  reflections.push(saved.object_id);
 }
 const opened = await call('structure_open',{source_path:cif,request_id:'cif'});
 const orient = await call('structure_orient',{object_id:opened.object_id,zone_axis_uvw:[0,0,1],request_id:'zone'});
 const sim = await call('structure_simulate',{object_id:opened.object_id,orientation_id:orient.object_id,voltage_kv:200,
  reciprocal_radius_inv_angstrom:.8,max_excitation_error_inv_angstrom:.02,size:64,sigma_pixels:1,with_direct_beam:false,request_id:'simulate'});
 const candidates = [0,17].map(rotation_deg=>({label:'candidate '+rotation_deg,simulation_object_id:sim.object_id,
  registration:{rotation_deg,scale:1,translation_inv_angstrom:[0,0],flip_y:false,basis:'Public synthetic axes'}}));
 const batch = {current_image_object_id:view.object_id,measurement_object_ids:reflections,candidates,
  max_residual_inv_angstrom:1e-6,experimental_kind:'other_diffraction'};
 const compared = await call('structure_compare_batch',{...batch,request_id:'compare'});
 assert.equal(compared.batch_status,'completed');
 assert.equal(compared.candidates[0].matched.length,2);
 assert.equal(compared.candidates[1].unmatched_experimental.length,2);
 assert.ok(compared.candidates.every(row=>row.phase_identified===false));
 const wrongKind=await call('structure_compare_batch',{...batch,experimental_kind:'real_space_fft',request_id:'compare-wrong-kind'});
 assert.equal(wrongKind.batch_status,'partial_or_failed');
 assert.ok(wrongKind.candidates.every(row=>row.state==='failed'&&
  JSON.stringify(row.error).includes('requires experimental_kind=other_diffraction')));
 await assert.rejects(call('structure_compare_batch',{...batch,current_image_object_id:withSpots.object_id,
  measurement_object_ids:[unscaled.object_id],request_id:'compare-pixels'}), /active versioned physical calibration/);

 const start = options => createImagePanel({workspace,python,object_id:view.object_id,...options});
 panel = await start();
 const http = async (route, body) => {
  const origin = new URL(panel.url).origin;
  const header = {'X-Panel-Token':panel.token,Connection:'close'};
  const response = await fetch(origin+route,body ? {method:'POST',
   headers:{...header,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)} : {headers:header});
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  return data;
 };
 const state = await http('/api/state');
 assert.deepEqual(state.object.diffraction_roi,view.diffraction_roi);
 const saved = await http('/api/workspace',{action:'save',save_id:'saved-diffraction',
  expected_object_id:view.object_id,expected_working_revision:state.workspace_analysis.working_revision,
  draft_revision:state.edit_state.draft_revision});
 assert.equal(saved.workspace_analysis.saved_revision,1);
 await panel.close();
 panel = null;
 const objectNames = root => readdirSync(path.join(workspaceRoot,root,'objects')).sort();
 const before = ['images','structures'].map(objectNames);
 await client.close();
 client = makeClient();
 await client.rpc('initialize');
 const recovered = await call('image_result',{request_id:'roi-npy'});
 assert.deepEqual(recovered,mean);
 assert.equal((await call('structure_result',{request_id:'compare'})).object_id,compared.object_id);
 panel = await start({analysis_restore:readAnalysisWorkspaceResumeSnapshot(workspace)});
 const reset = await http('/api/state');
 assert.deepEqual(reset.object.diffraction_roi,state.object.diffraction_roi);
 assert.equal(reset.object.xy_calibration.calibration_id,centered.object_id);
 assert.deepEqual(reset.object.xy_calibration.dc_index_xy,[35,31]);
 assert.equal(reset.workspace_analysis.save_id,'saved-diffraction');
 assert.deepEqual(['images','structures'].map(objectNames),before);
 assert.equal(sha(fixture),sourceSha);
 Object.assign(result,{result:'PASS',source_sha256:sourceSha,mean_array_sha256:sha(mean.array_path),provenance,
  reflections,comparison_object_id:compared.object_id,matched:2,rotated_unmatched:2,save_id:reset.workspace_analysis.save_id});

 const axisRoi = [0,1,1,3], axisPoints = [[4,3],[6,2]];
 const detector = await ingest('axis-roi',{source_path:axisScan,scan_roi_y0_y1_x0_x1:axisRoi});
 assert.deepEqual(detector.diffraction_roi.input_axes,['scan_y','scan_x','detector_y','detector_x']);
 assert.deepEqual(detector.diffraction_roi.scan_shape_yx,[2,3]);
 assert.deepEqual(detector.diffraction_roi.scan_roi_y0_y1_x0_x1_exclusive,axisRoi);
 assert.deepEqual(detector.shape_yx,[7,9]);
 assert.equal(detector.diffraction_roi.pattern_count,2);
 py(`import numpy as np,sys
actual=np.load(sys.argv[1],allow_pickle=False)
expected=np.full((7,9),1.5)
expected[3,4]=21.5
expected[2,6]=11.5
np.testing.assert_array_equal(actual,expected)`,detector.array_path);

 const axisScale = await call('image_calibrate',{object_id:detector.object_id,scope:'image',coordinate_domain:'reciprocal_space',
  xy_scale:{x:.10,y:-.10,unit:'1/Å'},source_text:'Synthetic scale: +X right and calibrated +Y up',request_id:'axis-scale'});
 const axisCenter = await call('image_center',{object_id:axisScale.object_id,center_xy:axisPoints[0],
  coordinate_space:'source_array_indices',source_text:'Synthetic beam centre at detector (column=4,row=3)',request_id:'axis-center'});
 const axisView = await call('image_preview',{object_id:axisCenter.object_id,request_id:'axis-view'});
 const act = (state,action,params) => http('/api/action',{action,params,
  expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision});
 const shown = await act(reset,'show',{object_id:axisView.object_id});
 assert.equal(shown.object.object_id,axisView.object_id);
 const [axisPanel] = shown.object.panels;
 assert.deepEqual(axisPanel.source_rect_xyxy,[0,0,9,7]);
 const observation = await act(shown,'measure',{selection:{kind:'line',panel:axisPanel,
  source_object_id:detector.object_id,coordinate_space:'source_array_indices',coordinates:axisPoints.flat()}});
 const measurementRequest = observation.last_operation.request_id;
 const measured = await call('image_result',{request_id:measurementRequest});
 const expectedPeriod = Math.sqrt(20);
 assert.deepEqual(measured.points,axisPoints);
 assert.deepEqual([measured.dx,measured.dy],[2,-1]);
 assert.deepEqual(measured.physical_vector_xy,[.20,.10]);
 assert.equal(measured.physical_frequency_unit,'cycles/angstrom');
 assert.equal(measured.dc_reference_point_index,0);
 assert.equal(measured.d_spacing_unit,'angstrom');
 assert.ok(Math.abs(measured.d_spacing-expectedPeriod)<1e-12);
 const axisSaveId = 'saved-axis-diffraction';
 const axisSaved = await http('/api/workspace',{action:'save',save_id:axisSaveId,expected_object_id:axisView.object_id,
  expected_working_revision:observation.workspace_analysis.working_revision,draft_revision:observation.edit_state.draft_revision});
 assert.equal(axisSaved.workspace_analysis.save_id,axisSaveId);
 const axisBefore = ['images','structures'].map(objectNames);
 await panel.close();
 panel = null;
 await client.close();
 client = makeClient();
 await client.rpc('initialize');
 panel = await start({object_id:axisView.object_id,analysis_restore:readAnalysisWorkspaceResumeSnapshot(workspace)});
 const axisReset = await http('/api/state');
 assert.equal(axisReset.object.object_id,axisView.object_id);
 assert.equal(axisReset.workspace_analysis.save_id,axisSaveId);
 assert.deepEqual(axisReset.object.diffraction_roi,detector.diffraction_roi);
 assert.deepEqual(axisReset.object.xy_calibration,axisCenter.xy_calibration);
 assert.deepEqual(await call('image_result',{request_id:'axis-roi'}),detector);
 assert.deepEqual(await call('image_result',{request_id:measurementRequest}),measured);
 assert.deepEqual(['images','structures'].map(objectNames),axisBefore);

 const axisCrystal = await call('structure_open',{source_path:axisCif,request_id:'axis-cif'});
 const axisOrientation = await call('structure_orient',{object_id:axisCrystal.object_id,zone_axis_uvw:[0,0,1],
  in_plane_direction_uvw:[1,0,0],request_id:'axis-zone'});
 const axisSimulation = await call('structure_simulate',{object_id:axisCrystal.object_id,orientation_id:axisOrientation.object_id,
  voltage_kv:200,reciprocal_radius_inv_angstrom:.35,max_excitation_error_inv_angstrom:.02,size:64,
  sigma_pixels:1,with_direct_beam:false,request_id:'axis-simulation'});
 const axisComparison = await call('structure_compare_batch',{current_image_object_id:axisReset.object.object_id,
  measurement_object_ids:[measured.object_id],experimental_kind:'other_diffraction',max_residual_inv_angstrom:1e-6,
  candidates:[{label:'Synthetic orthorhombic Cu',simulation_object_id:axisSimulation.object_id,
   registration:{rotation_deg:0,scale:1,translation_inv_angstrom:[0,0],flip_y:false,
    basis:'Signed detector calibration in the prescribed [100]/[010] comparison basis'}}],request_id:'axis-compare'});
 assert.equal(axisComparison.batch_status,'completed');
 assert.equal(axisComparison.candidates[0].matched.length,1);
 const [match] = axisComparison.candidates[0].matched;
 assert.deepEqual(match.hkl,[1,1,0]);
 assert.deepEqual(match.experiment_registered_q_xy_inv_angstrom,[.20,.10]);
 assert.ok(Math.abs(match.experiment_original_projected_period_angstrom-expectedPeriod)<1e-12);
 assert.ok(match.position_residual_inv_angstrom<1e-12);
 result.coordinate_acceptance = {scan_shape_yx:[2,3],scan_roi_y0_y1_x0_x1:axisRoi,pattern_count:2,
  detector_shape_yx:[7,9],background_mean:1.5,detector_points_column_row:measured.points,
  raw_delta_column_row:[measured.dx,measured.dy],xy_calibration:axisReset.object.xy_calibration.xy_scale,
  physical_delta_inv_angstrom:measured.physical_vector_xy,d_spacing_angstrom:measured.d_spacing,
  save_id:axisSaveId,exact_original_request:measurementRequest,reopened_without_new_objects:true,
  matched_hkl:match.hkl,residual_inv_angstrom:match.position_residual_inv_angstrom,
  imported_roi_object_id:detector.object_id,measurement_object_id:measured.object_id,
  comparison_object_id:axisComparison.object_id};
}catch(error){
 Object.assign(result,{result:'FAIL',error:error.stack});throw error;
}finally{
 if(panel)await panel.close();
 if(client)await client.close();
 if(originalConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;
 else process.env.MICROSCOPY_PLUGIN_CONFIG=originalConfig;
 writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n');
}
console.log('PASS: NPY/HDF5/flat ROI, source/centre/scale, CIF hits and misses, Panel save/reopen and off-axis signed coordinate recovery and matching.');
