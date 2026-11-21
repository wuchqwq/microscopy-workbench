"""Independent synthetic DM3/DM4 writer vs optional pinned real decoder, not vendor-host evidence."""
import unittest,tempfile,sys,hashlib
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
sys.path.insert(0,str(Path(__file__).resolve().parent/'fixtures'))
from dm4_fixture import write_dm3,write_dm4
import image_workspace as w
class DMDisplayTypes(unittest.TestCase):
 def test_encoded_integer_float_types_both_versions_display_does_not_change_values_axes(self):
  with tempfile.TemporaryDirectory() as td:
   r=Path(td);serial=0
   for version,writer in [(3,write_dm3),(4,write_dm4)]:
    for dtype in ['uint16','uint32','int16','float32','float64']:
     a=np.arange(35).reshape(5,7)
     if dtype=='uint32':a=a+2**32-50
     elif dtype=='int16':a=a-23
     elif dtype.startswith('float'):a=a/13-2.125
     a=a.astype(dtype);p=r/f'合成 {dtype}.dm{version}';writer(p,[{'data':a,'name':'known pixels'}]);before=p.read_bytes()
     def call(action,**kw):
      nonlocal serial
      serial+=1;ans=w.execute({'workspace':str(r/'work'),'action':action,'request_id':f'dm-dtype-{serial}',**kw});self.assertTrue(ans['ok'],ans);return ans['result']
     src=call('open_dm',source_path=str(p));self.assertEqual(len(src['dm_catalog']['datasets']),1)
     frame=call('frame',object_id=src['object_id'],frame_index=0);np.testing.assert_array_equal(np.load(r/'work'/'objects'/frame['object_id']/'data.npy'),a)
     view=call('view',object_id=frame['object_id'],tone={'colormap':'cividis','brightness':.1},gamma=2,max_size=32)
     exact=np.load(r/'work'/'objects'/view['object_id']/'data.npy');self.assertEqual(exact.dtype,a.dtype);self.assertEqual(exact.tobytes(),a.tobytes());self.assertEqual(view['xy_calibration'],frame['xy_calibration']);self.assertEqual(before,p.read_bytes())
if __name__=='__main__':unittest.main(verbosity=2)
