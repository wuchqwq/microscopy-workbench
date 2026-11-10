"""Small real-provider context/provenance checks; no simulation or model."""
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import image_workspace as worker


class InputConditions(unittest.TestCase):
    def test_declarations_are_versioned_and_do_not_calibrate_or_change_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'input.tiff'
            values = np.arange(64, dtype=np.float32).reshape(8, 8)
            tifffile.imwrite(source, values, photometric='minisblack')
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            base = {'workspace': str(root / 'workspace')}
            def call(action, request_id, **args):
                reply = worker.execute({**base, 'action': action, 'request_id': request_id, **args})
                self.assertTrue(reply['ok'], reply)
                return reply['result']
            opened = call('open', 'open', source_path=str(source))
            frame = call('frame', 'frame', object_id=opened['object_id'], frame_index=0)
            metadata = {'input_origin': 'simulation', 'modality': 'hrtem', 'source_text': 'Known simulated fixture; thickness and microscope uncertainty not qualified.'}
            context = call('context', 'context', object_id=frame['object_id'], metadata=metadata)
            self.assertEqual(context['user_context'], metadata)
            self.assertEqual(context['context_source'], 'user_provided_not_independently_verified')
            self.assertFalse(context['calibration_applied'])
            fft = call('fft', 'fft', object_id=context['object_id'], rect=[0, 0, 8, 8], window='hann', subtract_mean=True)
            self.assertEqual(fft['user_context'], metadata)
            self.assertIsNone(fft.get('xy_calibration'))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
            restored = call('context', 'unknown', object_id=context['object_id'], metadata={'input_origin': 'unknown', 'modality': 'unknown'})
            self.assertEqual(restored['user_context']['source_text'], metadata['source_text'])
            for index, bad in enumerate([{'input_origin': 'filename_guess'}, {'modality': 'autodetected'}, {'input_origin': ['simulation']}]):
                result = worker.execute({**base, 'action': 'context', 'request_id': 'bad'+str(index), 'object_id': context['object_id'], 'metadata': bad})
                self.assertFalse(result['ok'])

    def test_all_existing_finite_scalar_tiff_dtypes_keep_precision(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for index, dtype in enumerate(['uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32', 'float32', 'float64']):
                values = np.array([[0, 1, 2], [3, 4, 5]], dtype=dtype)
                source = root / (dtype + '.tif')
                tifffile.imwrite(source, values, photometric='minisblack')
                base = {'workspace': str(root / ('workspace-' + dtype))}
                opened = worker.execute({**base, 'action': 'open', 'request_id': 'open'+str(index), 'source_path': str(source)})
                self.assertTrue(opened['ok'], opened)
                frame = worker.execute({**base, 'action': 'frame', 'request_id': 'frame'+str(index), 'object_id': opened['result']['object_id'], 'frame_index': 0})
                self.assertTrue(frame['ok'], frame)
                obj = frame['result']
                stored = np.load(Path(base['workspace']) / 'objects' / obj['object_id'] / 'data.npy')
                self.assertEqual(stored.dtype, values.dtype)
                np.testing.assert_array_equal(stored, values)
                self.assertEqual(obj['calibration']['status'], 'unknown')

if __name__ == '__main__':
    unittest.main()
