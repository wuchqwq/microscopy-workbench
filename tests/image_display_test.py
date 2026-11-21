"""Independent display formulas and raw/scientific invariants on bounded arrays."""
import sys,json,tempfile,unittest,hashlib,math,itertools
from pathlib import Path
import numpy as np
import tifffile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import image_workspace as w
import image_display as display

class DisplayOnly(unittest.TestCase):
 def test_package_import_matches_standalone_worker_import(self):
  import subprocess,os
  proc=subprocess.run([sys.executable,'-B','-c','from tools import image_workspace as w; assert w.image_display.tone_options()["colormap"]=="gray"'],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True,env={**os.environ,'PYTHONPATH':''})
  self.assertEqual(proc.returncode,0,proc.stderr)
 def test_independent_crossed_gradient(self):
  a=np.arange(256,dtype=np.float64).reshape(16,16)/255
  for b,c,g in itertools.product([-.2,0,.2],[0,.5,1,2],[.5,1,2]):
   settings={'display_range':[0,1],'gamma':g,'tone':{'brightness':b,'contrast':c},'max_size':16,'interpolation':'nearest','upscale':False}
   actual=np.asarray(w.render(a,settings,(16,16)))
   expected=np.array([round(min(1,max(0,(float(x)-.5)*c+.5+b))**(1/g)*255) for x in a.flat]).reshape(a.shape)
   self.assertLessEqual(int(np.max(np.abs(actual.astype(int)-expected))),1)
  np.testing.assert_array_equal(a,np.arange(256).reshape(16,16)/255)
 def test_colors_reversal_custom_interpolation_and_invalid_input(self):
  a=np.array([[0,.25,.5,.75,1.]])
  for name in ['viridis','cividis','magma']:
   tone=display.tone_options({'colormap':name})
   actual=display.colorize(a,1,tone)
   for i,z in enumerate(a[0]):
    stops=display.PALETTES[name];q=z*255;j=int(q);k=min(255,j+1)
    expected=[round(int(stops[j][c:c+2],16)*(1-q+j)+int(stops[k][c:c+2],16)*(q-j)) for c in [1,3,5]]
    self.assertLessEqual(max(abs(int(v)-e) for v,e in zip(actual[0,i],expected)),1)
  custom={'colormap':'custom','colors':['#000000','#ff0000','#ffffff'],'reverse':True}
  np.testing.assert_array_equal(display.colorize(a,1,custom)[0,[0,2,4]],[[255,255,255],[255,0,0],[0,0,0]])
  for bad in [{'brightness':float('nan')},{'contrast':-1},{'contrast':5},{'colors':['#fff','#ffffff']},{'colormap':'rainbow'},{'reverse':1},{'extra':1}]:
   with self.assertRaises(ValueError):display.tone_options(bad)
 def test_three_point_position_and_reversal_independent_truth(self):
  t={'colormap':'custom','colors':['#000000','#ff0000','#ffffff'],'positions':[0,.25,1]}
  a=np.array([[0,.125,.25,.625,1.]])
  np.testing.assert_array_equal(display.colorize(a,1,t)[0],[[0,0,0],[128,0,0],[255,0,0],[255,128,128],[255,255,255]])
  np.testing.assert_array_equal(display.colorize(np.array([[.75]]),1,{**t,'reverse':True})[0,0],[255,0,0])
  for positions in [[0,1],[0,0,1],[0,1,1],[.1,.5,1],[0,.5,.9],[0,float('nan'),1],None]:
   with self.assertRaises(ValueError):display.tone_options({**t,'positions':positions})
 def test_view_science_before_after_original_bytes_statistics_fft_calibration_geometry(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);workspace=root/'work';a=(np.arange(35).reshape(5,7)*3.125-21).astype(np.float64);p=root/'中文 有空格.tiff';tifffile.imwrite(p,a,metadata=None)
   serial=0
   def call(action,**kw):
    nonlocal serial
    serial+=1;r=w.execute({'workspace':str(workspace),'action':action,'request_id':f'display-{serial}',**kw});self.assertTrue(r['ok'],r);return r['result']
   original=hashlib.sha256(p.read_bytes()).hexdigest();src=call('open',source_path=str(p));frame=call('frame',object_id=src['object_id'],frame_index=0)
   fpath=workspace/'objects'/frame['object_id']/'data.npy';fb=fpath.read_bytes();before=call('statistics',object_id=frame['object_id'],rect=[1,1,6,4]);fft=call('fft',object_id=frame['object_id'],window='none',subtract_mean=False);fftpath=workspace/'objects'/fft['object_id']/'data.npy';fftbytes=fftpath.read_bytes()
   view=call('view',object_id=frame['object_id'],tone={'brightness':.2,'contrast':1.5,'colormap':'custom','colors':['#112233','#ff0000','#fedcba'],'positions':[0,.27,1]},gamma=2,interpolation='nearest',max_size=32)
   result=call('statistics',object_id=view['object_id'],rect=[1,1,6,4])
   vals=a[1:4,1:6].ravel().tolist();mean=sum(vals)/len(vals);pop=math.sqrt(sum((x-mean)**2 for x in vals)/len(vals))
   for r in [before,result]:
    # Statistics result nests raw measurements under statistics in current provider.
    d=r.get('statistics',r)
    self.assertAlmostEqual(d['mean'],mean);self.assertAlmostEqual(d['stddev'],pop);self.assertEqual(d['minimum'],min(vals));self.assertEqual(d['maximum'],max(vals))
   saved=np.load(workspace/'objects'/view['object_id']/'data.npy');self.assertEqual(saved.dtype,a.dtype);self.assertEqual(saved.tobytes(),a.tobytes())
   self.assertEqual(fpath.read_bytes(),fb);self.assertEqual(fftpath.read_bytes(),fftbytes);self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),original)
   self.assertEqual(view.get('xy_calibration'),frame.get('xy_calibration'));self.assertEqual(view['panels'][0]['source_rect_xyxy'],[0,0,7,5]);self.assertTrue(view['display']['display_only']);self.assertFalse(view['display']['quantitative'])
   # Recover the exact completed display, rather than re-rendering or repeating science.
   recovered=w.execute({'workspace':str(workspace),'action':'result','query_request_id':view['request_id']});self.assertTrue(recovered['ok']);self.assertEqual(recovered['result']['object_id'],view['object_id'])
if __name__=='__main__':unittest.main(verbosity=2)
