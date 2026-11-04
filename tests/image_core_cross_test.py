"""One core, three source-bound rectangular observations; synthetic software scope."""
from pathlib import Path
import os,sys,tempfile,unittest,hashlib,json
from unittest import mock
import numpy as np,tifffile
sys.path.insert(0,str(Path(os.environ.get('MICROSCOPY_TEST_REPOSITORY',Path(__file__).resolve().parents[1]))/'tools'))
import image_workspace as worker
import image_spatial_atlas as atlas
import image_automation as automation
from preview_test_support import acknowledge_received_previews

class CoreCross(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.workspace=self.root/'workspace';self.serial=0
  y,x=np.indices((128,160));self.values=(np.cos(2*np.pi*x/8)+.6*np.cos(2*np.pi*y/4)).astype(np.float32);self.path=self.root/'synthetic.tiff';tifffile.imwrite(self.path,self.values,metadata=None);self.digest=hashlib.sha256(self.path.read_bytes()).hexdigest()
  opened=self.call('open',source_path=str(self.path));self.frame=self.call('frame',object_id=opened['object_id'],frame_index=0);self.core=[64,56,96,72]
 def tearDown(self):
  self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(),self.digest);self.temp.cleanup()
 def call(self,action,ok=True,**args):
  self.serial+=1;q={'workspace':str(self.workspace),'action':action,**args}
  if action not in ('get','result'):q.setdefault('request_id','cross-test-'+str(self.serial))
  r=worker.execute(q);self.assertEqual(r['ok'],ok,r)
  if ok:acknowledge_received_previews(worker,str(self.workspace),r['result'])
  return r['result'] if ok else r
 def cross(self,**kw):
  args={'object_id':self.frame['object_id'],'rects':[self.core],'cross_window':{'selection_origin':'agent','source_text':'Explicit synthetic core; surrounding arm stability remains unassessed'},'window':'none','subtract_mean':True,'max_peaks':8,'peak_options':{'refinement':'none','exclude_dc_radius_bins':1,'min_separation_bins':1,'threshold_rel':.1},'max_size':256};args.update(kw);return self.call('spatial_atlas',**args)
 def ffts(self):
  return {p.parent.name:hashlib.sha256(p.with_name('data.npy').read_bytes()).hexdigest() for p in self.workspace.glob('objects/*/object.json') if json.loads(p.read_text())['kind']=='fft'}
 def discovery(self,origin='agent',rect=None):return self.call('discovery',object_id=self.frame['object_id'],entry='manual',selection_origin=origin,regions=[{'rect':rect or self.core,'reason':'Source-bound explicit attention; not material confirmation'}],max_size=256)
 def test_geometry_non_square_independent_DFTs_quality_and_signed_scale(self):
  calibrated=self.call('calibrate',object_id=self.frame['object_id'],scope='image',xy_scale={'x':.02,'y':-.03,'unit':'nm'},source_text='Declared synthetic signed metric')
  r=self.cross(object_id=calibrated['object_id']);expected=[self.core,[32,56,128,72],[64,24,96,104]];self.assertEqual([v['rect'] for v in r['regions']],expected);p=r['cross_window_plan'];self.assertEqual(p['intersection_rect_xyxy'],self.core);self.assertEqual(p['arm_stability'],'not_assessed');self.assertFalse(p['independent_validation']);self.assertEqual(len(self.ffts()),3)
  self.assertEqual([x['role'] for x in p['region_roles']],['core','horizontal','vertical'])
  for row in r['regions']:
   x0,y0,x1,y1=row['rect'];a=self.values[y0:y1,x0:x1].astype(float);a-=a.mean();h,w=a.shape;E=np.exp(-2j*np.pi*np.outer(np.arange(h),np.arange(h))/h);D=np.exp(-2j*np.pi*np.outer(np.arange(w),np.arange(w))/w);expected_fft=np.roll(np.roll(E@a@D.T,h//2,axis=0),w//2,axis=1);np.testing.assert_allclose(np.load(self.workspace/'objects'/row['fft_object_id']/'data.npy'),expected_fft,rtol=0,atol=1e-8)
   self.assertEqual(row['shape_yx'],[h,w]);self.assertIsNotNone(row['detection_quality']);self.assertEqual({k:row['xy_calibration']['xy_scale'][k] for k in ['x','y','unit']},{'x':.02,'y':-.03,'unit':'nm'});self.assertIsNone(row['xy_calibration']['xy_scale']['uncertainty_x'])
   for v in row['measurements']:
    fx,fy=v['frequency_cycles_per_pixel'];self.assertAlmostEqual(v['d_spacing'],1/np.hypot(fx/.02,fy/-.03));self.assertEqual(v['interpretation_status'],'hypothesized')
 def test_shared_human_agent_discovery_link_and_core_only_review(self):
  for origin in ['researcher','agent']:
   d=self.discovery(origin);cfg={'selection_origin':origin,'source_text':'Same explicit core workflow','discovery_object_id':d['object_id'],'candidate_id':d['candidates'][0]['candidate_id']};r=self.cross(cross_window=cfg);dep=r['cross_window_plan']['discovery_dependency'];self.assertEqual(dep['object_id'],d['object_id']);self.assertEqual(dep['candidate_id'],d['candidates'][0]['candidate_id'])
   review=self.call('discovery_review',object_id=d['object_id'],candidate_id=dep['candidate_id'],evidence_ids=[r['regions'][0]['fft_object_id']],observation_text='Core-only FFT, no physical conclusion',unresolved=['Unknown material origin']);self.assertEqual(review['interpretation_status'],'hypothesized')
   bad=self.call('discovery_review',ok=False,object_id=d['object_id'],candidate_id=dep['candidate_id'],evidence_ids=[r['regions'][1]['fft_object_id']],observation_text='Wrong long-window scope must refuse');self.assertEqual(bad['error']['code'],'DISCOVERY_SCOPE_MISMATCH')
 def test_bad_core_links_and_geometry_refuse_before_any_FFT_child(self):
  d=self.discovery('researcher');base={'selection_origin':'agent','source_text':'Caller reason'}
  cases=[{'rects':[self.core,self.core]},{'rects':[[0,0,32,16]]},{'cross_window':{**base,'arm_lengths':[0,0,1,1]}},{'cross_window':{**base,'arm_lengths':[1.5,2,3,4]}},{'cross_window':{**base,'source_text':' '}},{'cross_window':{**base,'discovery_object_id':d['object_id']}},{'cross_window':{**base,'discovery_object_id':d['object_id'],'candidate_id':d['candidates'][0]['candidate_id']}}]
  for i,kw in enumerate(cases):
   self.cross(ok=False,request_id='cross-preflight-'+str(i),**kw);self.assertEqual(len(self.ffts()),0);self.assertFalse((self.workspace/'requests'/(automation.child_request_id('cross-preflight-'+str(i),'fft-batch')+'.json')).exists())
 def test_explicit_one_sided_edge_support_and_pixel_units(self):
  r=self.cross(rects=[[0,0,32,16]],cross_window={'selection_origin':'researcher','source_text':'Boundary core; absent left/top support explicit','arm_lengths':[0,32,0,32]});self.assertEqual(r['cross_window_plan']['two_sided_support'],{'horizontal':False,'vertical':False});self.assertEqual([x['rect'] for x in r['regions']],[[0,0,32,16],[0,0,64,16],[0,0,32,48]])
  for row in r['regions']:
   self.assertIsNone(row['xy_calibration']);self.assertTrue(all(x['d_spacing'] is None for x in row['measurements']))
 def test_revision_reuses_exact_FFTs_and_preserves_horizontal_human_peak_correction(self):
  r=self.cross();old=r['regions'][1];m=old['measurements'][0];q=list(m['frequency_cycles_per_pixel']);q[0]+=.001
  revised=self.call('remeasure',object_id=old['view_object_id'],measurement_object_id=m['measurement_object_id'],points=[[0,0],q],source_text='Synthetic human marker correction')
  ids=[revised['object_id'],*old['measurement_object_ids'][1:]];before=self.ffts();r2=self.cross(previous_atlas_id=r['object_id'],measurement_overrides=[{'region_index':1,'measurement_object_ids':ids}]);r3=self.cross(previous_atlas_id=r2['object_id']);self.assertEqual(self.ffts(),before);self.assertEqual(r3['regions'][1]['measurement_object_ids'],ids);self.assertEqual(self.call('get',object_id=r3['object_id'])['object_id'],r3['object_id'])
  r4=self.cross(previous_atlas_id=r3['object_id'],cross_window={'selection_origin':'agent','source_text':'Only horizontal support extended','arm_lengths':[40,32,32,32]});self.assertTrue(r4['regions'][0]['fft_reused']);self.assertFalse(r4['regions'][1]['fft_reused']);self.assertTrue(r4['regions'][2]['fft_reused']);self.assertEqual(len(self.ffts()),4)
 def test_original_request_recovery_and_partial_children_do_not_replay(self):
  r=self.cross(request_id='core-original');before=self.ffts();self.assertEqual(self.call('result',query_request_id='core-original')['object_id'],r['object_id']);self.assertEqual(self.cross(request_id='core-original')['object_id'],r['object_id']);self.assertEqual(self.ffts(),before)
  original=automation.run_child
  def stop(workspace,request,role,action,**parameters):
   if role=='region-0-peaks':raise worker.WorkspaceError('CONTROLLED_STOP','Stop after the three committed FFTs')
   return original(workspace,request,role,action,**parameters)
  with mock.patch.object(automation,'run_child',side_effect=stop):self.cross(ok=False,request_id='core-partial')
  after=self.ffts();bad=self.call('result',ok=False,query_request_id='core-partial');p=bad['partial_results'];self.assertFalse(p['automatic_retry']);self.assertEqual(len([v for v in p['children'] if v['action']=='fft' and v.get('validated')]),3);self.assertEqual(p['cross_window_plan']['intersection_rect_xyxy'],self.core);self.assertEqual(self.ffts(),after)
 def test_constant_and_old_rectangular_atlas_remain_ordinary_observations(self):
  p=self.root/'blank.tiff';tifffile.imwrite(p,np.zeros((128,160),np.float32),metadata=None);s=self.call('open',source_path=str(p));f=self.call('frame',object_id=s['object_id'],frame_index=0);r=self.cross(object_id=f['object_id']);self.assertTrue(all(x['status']=='not_detected' for x in r['regions']));self.assertEqual(r['cross_window_plan']['arm_stability'],'not_assessed')
  old=self.call('spatial_atlas',object_id=self.frame['object_id'],rects=[self.core],window='none',subtract_mean=True,max_size=256);self.assertNotIn('cross_window_plan',old);self.assertEqual(self.call('get',object_id=old['object_id'])['object_id'],old['object_id'])

 def test_budget_and_changed_metric_refuse_before_science(self):
  request={'rects':[self.core],'cross_window':{'selection_origin':'agent','source_text':'Geometry budget control'}}
  with mock.patch.object(worker,'MAX_PIXELS',4000):
   with self.assertRaisesRegex(worker.WorkspaceError,'budget|pixels'):atlas._selection(request,[128,160],worker)
  d=self.discovery('agent');scale=self.call('calibrate',object_id=self.frame['object_id'],scope='image',xy_scale={'x':.02,'y':.02,'unit':'nm'},source_text='A different explicit metric')
  r=self.cross(ok=False,object_id=scale['object_id'],cross_window={'selection_origin':'agent','source_text':'Stale metric must refuse','discovery_object_id':d['object_id'],'candidate_id':d['candidates'][0]['candidate_id']});self.assertEqual(r['error']['code'],'DISCOVERY_SCOPE_MISMATCH');self.assertEqual(len(self.ffts()),0)
 def test_saved_cross_plan_tampering_is_not_admitted(self):
  r=self.cross();p=self.workspace/'objects'/r['object_id']/'object.json';before=p.read_bytes();changed=json.loads(before);changed['cross_window_plan']['intersection_rect_xyxy']=[0,0,4,4];p.write_bytes(worker.canonical(changed)+b'\n')
  try:bad=self.call('get',ok=False,object_id=r['object_id']);self.assertEqual(bad['error']['code'],'CORRUPT_OBJECT')
  finally:p.write_bytes(before)

if __name__=='__main__':unittest.main()
