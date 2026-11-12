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

    def test_multipage_float32_retains_page_identity_and_signed_roi_values(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'signed-stack.tif'
            values = np.array([[[5, 6, 7], [8, 9, 10]],
                               [[-3.5, -0.0, 1.25], [2.5, -8.0, 4.125]]], dtype=np.float32)
            tifffile.imwrite(source, values, photometric='minisblack', metadata={'axes': 'ZYX'})
            source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            workspace = root / 'images'
            base = {'workspace': str(workspace)}

            opened = worker.execute({**base, 'action': 'open', 'source_path': str(source), 'request_id': 'open'})
            self.assertTrue(opened['ok'], opened)
            tiff = opened['result']
            self.assertEqual(tiff['page_count'], 2)
            self.assertEqual(tiff['frame_axis_role'], 'unspecified_sequence')
            self.assertEqual([page['dtype'] for page in tiff['pages']], ['float32', 'float32'])
            self.assertEqual(tiff['source_identity']['sha256'], source_hash)

            selected = worker.execute({**base, 'action': 'frame', 'object_id': tiff['object_id'],
                                       'frame_index': 1, 'request_id': 'frame-1'})
            self.assertTrue(selected['ok'], selected)
            frame = selected['result']
            self.assertEqual(frame['source_object_id'], tiff['object_id'])
            self.assertEqual(frame['frame_index'], 1)
            self.assertEqual(frame['calibration']['status'], 'unknown')
            stored = np.load(workspace / 'objects' / frame['object_id'] / 'data.npy', allow_pickle=False)
            self.assertEqual(stored.dtype, np.dtype('float32'))
            np.testing.assert_array_equal(stored.view(np.uint32), values[1].view(np.uint32))

            result = worker.execute({**base, 'action': 'statistics', 'object_id': frame['object_id'],
                                     'rect': [1, 0, 3, 2], 'request_id': 'page-1-roi'})
            self.assertTrue(result['ok'], result)
            stats = result['result']['statistics']
            self.assertEqual(stats['dtype'], 'float32')
            self.assertEqual(stats['sample_count'], 4)
            self.assertEqual(stats['minimum'], -8.0)
            self.assertEqual(stats['maximum'], 4.125)
            self.assertEqual(stats['mean'], -0.65625)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), source_hash)

    def test_nonfinite_frame_refused_and_unsupported_precision_not_cast(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); base={'workspace':str(root/'workspace')}
            for i,values in enumerate([np.array([[0,np.nan],[1,2]],np.float32),np.array([[0,np.inf],[1,2]],np.float32),np.zeros((2,2),np.uint64),np.zeros((2,2),np.complex64)]):
                source=root/f'bad{i}.tiff';tifffile.imwrite(source,values,photometric='minisblack')
                opened=worker.execute({**base,'action':'open','source_path':str(source),'request_id':f'open{i}'})
                if i<2:
                    self.assertTrue(opened['ok'],opened)
                    result=worker.execute({**base,'action':'frame','object_id':opened['result']['object_id'],'frame_index':0,'request_id':f'frame{i}'})
                    self.assertFalse(result['ok']);self.assertEqual(result['error']['code'],'NONFINITE_DATA')
                else:
                    self.assertFalse(opened['ok']);self.assertEqual(opened['error']['code'],'UNSUPPORTED_LAYOUT')

if __name__=='__main__': unittest.main()
