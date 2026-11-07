"""Ordinary TIFF precision, historical descriptors and display-only safety."""
from pathlib import Path
import sys,tempfile,unittest,hashlib
from unittest.mock import patch
from types import SimpleNamespace
import numpy as np
import tifffile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import image_workspace as worker

class TiffAdmission(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.workspace=self.root/'workspace';self.serial=0
 def tearDown(self):self.temp.cleanup()
 def call(self,action,**kwargs):
  self.serial+=1;return worker.execute({'workspace':str(self.workspace),'action':action,'request_id':'tiff-'+str(self.serial),**kwargs})
 def frame(self,path):
  opened=self.call('open',source_path=str(path));self.assertTrue(opened['ok'],opened);result=self.call('frame',object_id=opened['result']['object_id'],frame_index=0);self.assertTrue(result['ok'],result);return opened['result'],result['result']
 def test_supported_scalar_precisions_are_exact_and_metadata_does_not_infer_units(self):
  for dtype,values in [('uint8',[0,1,255]),('uint16',[0,1,65535]),('uint32',[0,1,2**32-1]),('int8',[-128,0,127]),('int16',[-32768,0,32767]),('int32',[-2**31,0,2**31-1]),('float32',[-1.5,0,3.125]),('float64',[np.nextafter(1.,2.),-np.pi,np.nextafter(0.,1.),-0.,1e200,-1e-200])]:
   with self.subTest(dtype=dtype):
    a=np.array([values,values],dtype=dtype);p=self.root/(dtype+'.tiff');tifffile.imwrite(p,a,photometric='minisblack',resolution=(100,200),resolutionunit='CENTIMETER',description='{"unit":"nm","pixel_size":0.1}')
    before=hashlib.sha256(p.read_bytes()).hexdigest();source,frame=self.frame(p);saved=np.load(self.workspace/'objects'/frame['object_id']/'data.npy');self.assertEqual(saved.dtype,a.dtype);np.testing.assert_array_equal(saved,a);self.assertEqual(saved.tobytes(),a.tobytes());self.assertEqual(source['pages'][0]['dtype'],dtype)
    self.assertIsNone(frame.get('xy_calibration'));self.assertEqual(frame['calibration']['status'],'unknown');self.assertFalse(frame['intensity_calibration_applied']);self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),before)
    recovered=self.call('result',query_request_id=frame['request_id']);self.assertTrue(recovered['ok'],recovered);self.assertEqual(recovered['result']['object_id'],frame['object_id'])
 def test_multipage_bigtiff_endian_and_deflate_preserve_explicit_page_values(self):
  for order in ['<','>']:
   p=self.root/('pages'+order.replace('<','le').replace('>','be')+'.tif');arrays=[np.array([[0,255],[1,2]],np.uint8),np.array([[np.nextafter(1.,2.),-np.pi],[1e200,1e-200]],np.float64)]
   with tifffile.TiffWriter(p,bigtiff=True,byteorder=order) as t:
    for a in arrays:t.write(a,photometric='minisblack',compression='deflate',metadata=None)
   s=self.call('open',source_path=str(p));self.assertTrue(s['ok'],s);self.assertEqual(s['result']['page_count'],2)
   for i,a in enumerate(arrays):
    f=self.call('frame',object_id=s['result']['object_id'],frame_index=i);self.assertTrue(f['ok'],f);saved=np.load(self.workspace/'objects'/f['result']['object_id']/'data.npy');self.assertEqual(saved.dtype,a.dtype);np.testing.assert_array_equal(saved,a);self.assertEqual(f['result']['frame_axis_role'],'unspecified_sequence')
 def test_historical_uint16_float32_page_descriptors_still_select_without_rewriting_source(self):
  for dtype in ['uint16','float32']:
   a=np.arange(6,dtype=dtype).reshape(2,3);p=self.root/(dtype+'-legacy.tiff');tifffile.imwrite(p,a,photometric='minisblack',metadata=None)
   old={'frame_index':0,'shape_yx':[2,3],'dtype':dtype,'axes':['y','x'],'decoded_bytes':a.nbytes,'photometric_code':1,'compression_code':1}
   with patch.object(worker,'page_info',return_value=old):s=self.call('open',source_path=str(p))
   self.assertTrue(s['ok'],s);manifest=self.workspace/'objects'/s['result']['object_id']/'object.json';before=manifest.read_bytes()
   f=self.call('frame',object_id=s['result']['object_id'],frame_index=0);self.assertTrue(f['ok'],f);self.assertEqual(manifest.read_bytes(),before)
   with tifffile.TiffFile(p) as t:self.assertEqual(worker.page_info(t.pages[0],0),old)
 def test_unsupported_layouts_refuse_before_pixel_decode(self):
  for dtype in ['uint64','int64','float16','complex64','complex128','bool']:
   p=self.root/('unsupported-'+dtype+'.tiff');tifffile.imwrite(p,np.zeros((2,3),dtype=dtype),photometric='minisblack',metadata=None)
   with patch.object(tifffile.TiffPage,'asarray',side_effect=AssertionError('Must not decode')):r=self.call('open',source_path=str(p))
   self.assertFalse(r['ok'],r);self.assertEqual(r['error']['code'],'UNSUPPORTED_LAYOUT')
  for name,kwargs,a in [('rgb',{'photometric':'rgb'},np.zeros((2,3,3),np.uint8)),('palette',{'photometric':'palette','colormap':np.zeros((3,256),np.uint16)},np.zeros((2,3),np.uint8))]:
   p=self.root/(name+'.tif');tifffile.imwrite(p,a,metadata=None,**kwargs);r=self.call('open',source_path=str(p));self.assertFalse(r['ok'],r);self.assertEqual(r['error']['code'],'UNSUPPORTED_LAYOUT')
 def test_float64_nonfinite_and_changed_source_are_refused(self):
  for i,value in enumerate([np.nan,np.inf,-np.inf]):
   p=self.root/f'nonfinite-{i}.tif';tifffile.imwrite(p,np.array([[0,value],[1,2]],np.float64),metadata=None);o=self.call('open',source_path=str(p));self.assertTrue(o['ok'],o);r=self.call('frame',object_id=o['result']['object_id'],frame_index=0);self.assertFalse(r['ok']);self.assertEqual(r['error']['code'],'NONFINITE_DATA')
  p=self.root/'changed.tif';tifffile.imwrite(p,np.ones((2,3),np.float64),metadata=None);o=self.call('open',source_path=str(p));self.assertTrue(o['ok'],o);tifffile.imwrite(p,np.zeros((2,3),np.float64),metadata=None);r=self.call('frame',object_id=o['result']['object_id'],frame_index=0);self.assertFalse(r['ok']);self.assertEqual(r['error']['code'],'SOURCE_CHANGED')
 def test_catalog_checks_budget_before_decode(self):
  page=SimpleNamespace(shape=(2049,2048),dtype=np.dtype('float64'),samplesperpixel=1,photometric=1,compression=1)
  with self.assertRaisesRegex(ValueError,'budget'):worker.page_info(page,0)
 def test_miniswhite_orientation_tags_do_not_transform_scientific_pixels(self):
  a=np.array([[0,4,65535],[12,8,2]],np.uint16);p=self.root/'orientation.tif';tifffile.imwrite(p,a,metadata=None,photometric='miniswhite',extratags=[(274,'H',1,3,False)])
  s,f=self.frame(p);self.assertEqual(s['pages'][0]['photometric_code'],0);saved=np.load(self.workspace/'objects'/f['object_id']/'data.npy');self.assertEqual(saved.tobytes(),a.tobytes());self.assertIsNone(f.get('xy_calibration'))
 def test_extreme_finite_display_has_contrast_and_never_changes_scientific_pixels(self):
  for values,limits in [(np.array([[-1e308,0,1e308]]),[-1e308,1e308]),(np.array([[-1e308,0,1e308]]),[-1.,1.]),(np.array([[-np.nextafter(0.,1.),0,np.nextafter(0.,1.)]]),[-np.nextafter(0.,1.),np.nextafter(0.,1.)])]:
   before=values.copy();settings={'display_range':limits,'gamma':1.,'max_size':3,'interpolation':'nearest','upscale':False}
   with np.errstate(over='raise',invalid='raise',divide='raise'):png=worker.render(values,settings,(3,1))
   self.assertEqual(np.asarray(png).tolist(),[[0,128,255]]);np.testing.assert_array_equal(values,before)
 def test_float64_extreme_frame_preview_is_traceable_and_fft_overflow_is_not_hidden(self):
  p=self.root/'extreme.tif';values=np.tile(np.array([-1e308,0,1e308]),(3,1));tifffile.imwrite(p,values,metadata=None);s,f=self.frame(p)
  v=self.call('view',object_id=f['object_id'],max_size=3,interpolation='nearest');self.assertTrue(v['ok'],v);np.testing.assert_array_equal(np.load(self.workspace/'objects'/v['result']['object_id']/'data.npy'),values)
  with np.errstate(over='ignore',invalid='ignore'):bad=self.call('fft',object_id=f['object_id'],window='none',subtract_mean=False)
  self.assertFalse(bad['ok'],bad);self.assertIn('finite',bad['error']['message'].lower())

if __name__=='__main__':unittest.main()
