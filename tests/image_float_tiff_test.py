"""Real TIFF admission and precision, not display/PNG qualification."""
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import image_workspace as worker

class FloatTiff(unittest.TestCase):
    def test_signed_float32_is_exact_with_source_and_request_recovery(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); source=root/'signed.tiff'
            values=np.array([[-1.5,0,2.75],[3.125,-5.25,1e-5]], dtype=np.float32)
            tifffile.imwrite(source, values, photometric='minisblack')
            digest=hashlib.sha256(source.read_bytes()).hexdigest()
            base={'workspace':str(root/'workspace')}
            opened=worker.execute({**base,'action':'open','source_path':str(source),'request_id':'open'})
            self.assertTrue(opened['ok'],opened); obj=opened['result']
            self.assertEqual(obj['pages'][0]['dtype'],'float32')
            result=worker.execute({**base,'action':'frame','object_id':obj['object_id'],'frame_index':0,'request_id':'frame'})
            self.assertTrue(result['ok'],result); frame=result['result']
            array=np.load(root/'workspace'/'objects'/frame['object_id']/'data.npy')
            self.assertEqual(array.dtype,values.dtype); np.testing.assert_array_equal(array,values)
            self.assertIsNone(frame.get('xy_calibration')); self.assertEqual(frame['calibration']['status'],'unknown')
            recovered=worker.execute({**base,'action':'result','query_request_id':'frame'})
            self.assertTrue(recovered['ok'],recovered)
            self.assertEqual(recovered['result']['object_id'],frame['object_id'])
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),digest)

    def test_nonfinite_frame_refused_and_unsupported_precision_not_cast(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); base={'workspace':str(root/'workspace')}
            for i,values in enumerate([np.array([[0,np.nan],[1,2]],np.float32),np.array([[0,np.inf],[1,2]],np.float32),np.zeros((2,2),np.float64),np.zeros((2,2),np.complex64)]):
                source=root/f'bad{i}.tiff';tifffile.imwrite(source,values,photometric='minisblack')
                opened=worker.execute({**base,'action':'open','source_path':str(source),'request_id':f'open{i}'})
                if i<2:
                    self.assertTrue(opened['ok'],opened)
                    result=worker.execute({**base,'action':'frame','object_id':opened['result']['object_id'],'frame_index':0,'request_id':f'frame{i}'})
                    self.assertFalse(result['ok']);self.assertEqual(result['error']['code'],'NONFINITE_DATA')
                else:
                    self.assertFalse(opened['ok']);self.assertEqual(opened['error']['code'],'UNSUPPORTED_LAYOUT')

if __name__=='__main__': unittest.main()
