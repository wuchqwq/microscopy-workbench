"""Explicit-page TIFF acceptance, no decoder installs or guessed physical axes."""
import unittest,tempfile,sys,hashlib
from pathlib import Path
from unittest.mock import patch
import numpy as np
import tifffile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import image_workspace as w
class ExtendedTIFF(unittest.TestCase):
 def test_all_scalar_dtypes_single_and_two_explicit_pages_non_square_cjk(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);serial=0
   for dtype in ['uint8','uint16','uint32','int8','int16','int32','float32','float64']:
    typ=np.dtype(dtype);a=np.arange(35).reshape(5,7)
    if dtype=='uint32':a=a+2**32-100
    elif dtype.startswith('int'):a=a-20
    elif dtype.startswith('float'):a=a/13-1.25
    a=a.astype(typ)
    for pages in [1,2]:
     p=root/f'中文 {dtype} {pages}.tiff'
     with tifffile.TiffWriter(p) as t:
      for i in range(pages):t.write(a+i,metadata=None,photometric='minisblack')
     old=p.read_bytes()
     def call(action,**kw):
      nonlocal serial
      serial+=1;r=w.execute({'workspace':str(root/'work'),'action':action,'request_id':f'tif-{serial}',**kw});self.assertTrue(r['ok'],r);return r['result']
     s=call('open',source_path=str(p));self.assertEqual(s['page_count'],pages)
     for i in range(pages):
      f=call('frame',object_id=s['object_id'],frame_index=i);v=np.load(root/'work'/'objects'/f['object_id']/'data.npy');self.assertEqual(v.dtype,typ);self.assertEqual(v.tobytes(),(a+i).tobytes());self.assertIsNone(f.get('xy_calibration'))
      view=call('view',object_id=f['object_id'],tone={'brightness':.1,'contrast':1.5,'colormap':'magma'},gamma=2,max_size=32,interpolation='nearest');colored=np.load(root/'work'/'objects'/view['object_id']/'data.npy');self.assertEqual(colored.dtype,typ);self.assertEqual(colored.tobytes(),(a+i).tobytes())
     self.assertEqual(old,p.read_bytes())
 def test_tiled_deflate_big_endian_and_constant(self):
  with tempfile.TemporaryDirectory() as td:
   r=Path(td)
   for index,(compression,order,constant) in enumerate([(None,'<',False),('deflate','>',False),('deflate','<',True)]):
    a=np.full((17,33),-3.125,np.float64) if constant else np.arange(17*33,dtype=np.uint32).reshape(17,33)+2**31
    p=r/f'tile{index}.tif';tifffile.imwrite(p,a,tile=(16,16),compression=compression,byteorder=order,photometric='minisblack',metadata=None)
    s=w.execute({'workspace':str(r/'work'),'action':'open','request_id':f'open-{index}','source_path':str(p)});self.assertTrue(s['ok'],s)
    f=w.execute({'workspace':str(r/'work'),'action':'frame','request_id':f'frame-{index}','object_id':s['result']['object_id'],'frame_index':0});self.assertTrue(f['ok'],f);np.testing.assert_array_equal(np.load(r/'work'/'objects'/f['result']['object_id']/'data.npy'),a)
 def test_incomplete_and_file_budget_reject(self):
  with tempfile.TemporaryDirectory() as td:
   r=Path(td);p=r/'broken.tif';p.write_bytes(b'II*\x00\xff\xff\xff\x7f')
   q={'workspace':str(r/'work'),'action':'open','request_id':'broken','source_path':str(p)};bad=w.execute(q);self.assertFalse(bad['ok'])
   tifffile.imwrite(p,np.ones((2,3),np.uint8),metadata=None)
   with patch.object(w,'MAX_SOURCE_BYTES',8):
    q['request_id']='too-large';bad=w.execute(q);self.assertFalse(bad['ok']);self.assertEqual(bad['error']['code'],'BUDGET_EXCEEDED')

class CodecAdmission(unittest.TestCase):
 def test_independent_lzw_fixture_verified_by_pillow_is_not_silently_cast_or_downloaded(self):
  import struct,importlib.util
  from PIL import Image
  with tempfile.TemporaryDirectory() as td:
   r=Path(td);p=r/'one-pixel-lzw.tif';codes=[256,7,257];bits=''.join(f'{c:09b}' for c in codes);payload=int(bits+'0'*((-len(bits))%8),2).to_bytes((len(bits)+7)//8,'big')
   tags=[(256,4,1),(257,4,1),(258,3,8),(259,3,5),(262,3,1),(273,4,122),(278,4,1),(279,4,len(payload)),(339,3,1)]
   p.write_bytes(b'II*\x00'+struct.pack('<I',8)+struct.pack('<H',len(tags))+b''.join(struct.pack('<HHII',tag,kind,1,v) for tag,kind,v in tags)+b'\0'*4+payload)
   self.assertEqual(Image.open(p).getpixel((0,0)),7)
   src=w.execute({'workspace':str(r/'work'),'action':'open','request_id':'lzw-open','source_path':str(p)});self.assertTrue(src['ok'],src)
   frame=w.execute({'workspace':str(r/'work'),'action':'frame','request_id':'lzw-frame','object_id':src['result']['object_id'],'frame_index':0})
   if importlib.util.find_spec('imagecodecs') is None:
    self.assertFalse(frame['ok'],frame);self.assertIn('imagecodecs',frame['error']['message'])
   else:
    self.assertTrue(frame['ok'],frame);np.testing.assert_array_equal(np.load(r/'work'/'objects'/frame['result']['object_id']/'data.npy'),[[7]])

class LayoutSemantics(unittest.TestCase):
 def test_nd_tiff_is_only_explicit_scalar_page_sequence_and_constant_view_is_finite(self):
  with tempfile.TemporaryDirectory() as td:
   r=Path(td);a=np.arange(2*3*5*7,dtype=np.int16).reshape(2,3,5,7);p=r/'nD.tif';tifffile.imwrite(p,a,photometric='minisblack',metadata={'axes':'TZYX'})
   s=w.execute({'workspace':str(r/'work'),'action':'open','request_id':'nd-open','source_path':str(p)});self.assertTrue(s['ok'],s);self.assertEqual(s['result']['page_count'],6)
   f=w.execute({'workspace':str(r/'work'),'action':'frame','request_id':'nd-frame','object_id':s['result']['object_id'],'frame_index':4});self.assertTrue(f['ok'],f);self.assertEqual(f['result']['frame_axis_role'],'unspecified_sequence');np.testing.assert_array_equal(np.load(r/'work'/'objects'/f['result']['object_id']/'data.npy'),a.reshape(6,5,7)[4])
   constant=np.full((3,5),-7.125,np.float64);settings=w.display_options({'gamma':2,'tone':{'colormap':'viridis'}},[constant]);pixels=np.asarray(w.render(constant,settings,(5,3)));self.assertEqual(pixels.shape,(3,5,3));self.assertTrue(np.isfinite(pixels).all());np.testing.assert_array_equal(constant,np.full((3,5),-7.125))
if __name__=='__main__':unittest.main(verbosity=2)
