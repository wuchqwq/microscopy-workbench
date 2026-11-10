"""Behavioral tests over public analytic arrays; not provider/model qualification."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/tiff_raw_probe.py'
spec = importlib.util.spec_from_file_location('raw_probe', SCRIPT)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class RawProbe(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='skill-raw-readout-')
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'analytic.tiff'
        self.values = np.arange(30, dtype=np.uint16).reshape(5, 6)
        tifffile.imwrite(self.source, self.values, metadata=None, photometric='minisblack',
                         resolution=(100000, 200000), resolutionunit='CENTIMETER',
                         description='{"pixel_size":0.001,"unit":"nm"}')
        self.initial = self.source.read_bytes()

    def tearDown(self):
        self.temp.cleanup()

    def args(self, **changes):
        values = dict(source=str(self.source), frame=0, roi=[1, 1, 5, 4], operation='statistics',
                      axis=None, index=None, missing_tool='image_statistics',
                      capability_evidence='Injected missing catalog entry for deterministic software test; real provider availability is not being claimed',
                      origin='simulation', source_notes='Public analytic integer ramp; no physical calibration',
                      output=str(self.root / 'new-report.json'))
        values.update(changes)
        return argparse.Namespace(**values)

    def test_original_array_statistics_and_no_metadata_scale(self):
        result = probe.run(self.args())
        values = [7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 22]
        mean = math.fsum(values) / len(values)
        expected = dict(sample_count=12, mean=mean, stddev=math.sqrt(math.fsum((v-mean)**2 for v in values)/12), minimum=7, maximum=22)
        self.assertEqual(result['statistics'], expected)
        self.assertIsNone(result['physical_calibration'])
        self.assertEqual(result['image_domain'], 'unknown')
        self.assertEqual(result['modality'], 'unknown')
        self.assertEqual(result['intensity_unit'], 'unknown')
        self.assertEqual(result['source']['sha256'], hashlib.sha256(self.initial).hexdigest())
        self.assertEqual(self.source.read_bytes(), self.initial)
        self.assertIsNone(result['provider_request_id'])
        self.assertFalse(result['capability_preflight']['independently_verified_by_script'])
        self.assertEqual(json.loads((self.root/'new-report.json').read_text()), result)

    def test_both_axis_profiles_keep_original_indices_and_raw_values(self):
        for axis, index, points, values in [('x', 2, [[1,2],[2,2],[3,2],[4,2]], [13,14,15,16]),
                                           ('y', 3, [[3,1],[3,2],[3,3]], [9,15,21])]:
            with self.subTest(axis=axis):
                result = probe.run(self.args(operation='axis-profile', missing_tool='image_profile', axis=axis, index=index,
                                              output=str(self.root/f'profile-{axis}.json')))
                self.assertEqual(result['profile']['points_xy'], points)
                self.assertEqual(result['profile']['values'], values)
                self.assertEqual(result['profile']['interpolation'], 'none')
                self.assertNotIn('statistics', result)
        self.assertEqual(self.source.read_bytes(), self.initial)

    def test_explicit_page_selection_and_out_of_range_page(self):
        source = self.root/'pages.tiff'
        with tifffile.TiffWriter(source) as writer:
            writer.write(self.values, metadata=None, photometric='minisblack')
            writer.write(self.values+100, metadata=None, photometric='minisblack')
        result = probe.run(self.args(source=str(source), frame=1))
        self.assertEqual(result['statistics']['mean'], 114.5)
        self.assertEqual(result['source']['page_index'], 1)
        self.assertEqual(result['source']['page_count'], 2)
        with self.assertRaisesRegex(ValueError, 'page does not exist'):
            probe.run(self.args(source=str(source), frame=2, output=str(self.root/'invalid.json')))
        self.assertFalse((self.root/'invalid.json').exists())

    def test_write_new_does_not_replace_existing_evidence(self):
        output = self.root/'new-report.json'
        output.write_bytes(b'keep previous evidence')
        with self.assertRaises(ValueError):
            probe.run(self.args())
        self.assertEqual(output.read_bytes(), b'keep previous evidence')
        self.assertEqual(self.source.read_bytes(), self.initial)
        self.assertFalse(list(self.root.glob('.tiff-probe-*')))

    def test_atomic_publication_collision_preserves_existing_file_and_cleans_own_temp(self):
        output = self.root/'collision.json'
        output.write_bytes(b'earlier writer')
        with self.assertRaises(FileExistsError):
            probe.write_new(output, {'another': 'result'})
        self.assertEqual(output.read_bytes(), b'earlier writer')
        self.assertFalse(list(self.root.glob('.tiff-probe-*')))

    def test_wrong_capability_or_profile_parameters_do_not_dispatch(self):
        for change in [dict(missing_tool='image_profile'), dict(capability_evidence=''),
                       dict(axis='x'), dict(operation='axis-profile', missing_tool='image_profile', axis='x', index=0)]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                probe.run(self.args(**change))
        self.assertFalse((self.root/'new-report.json').exists())

    def test_roi_bounds_and_integer_requirements_no_clipping(self):
        for roi in [[-1,1,5,4], [1,1,7,4], [1,1,1,4], [1,1,5,6], [1.,1,5,4]]:
            with self.subTest(roi=roi), self.assertRaises(ValueError):
                probe.run(self.args(roi=roi))
        self.assertFalse((self.root/'new-report.json').exists())

    def test_nonfinite_complex_rgb_and_unsupported_integer_refused(self):
        cases = [('nonfinite', np.array([[1., np.nan]], dtype=np.float32), 'minisblack'),
                 ('complex', np.array([[1+2j]], dtype=np.complex64), 'minisblack'),
                 ('rgb', np.ones((2,2,3), dtype=np.uint8), 'rgb'),
                 ('uint64', np.array([[2**63]], dtype=np.uint64), 'minisblack')]
        for name, values, photo in cases:
            path = self.root/f'{name}.tiff'
            tifffile.imwrite(path, values, metadata=None, photometric=photo)
            with self.subTest(name=name), self.assertRaises(ValueError):
                probe.run(self.args(source=str(path), roi=[0,0,1,1]))
        self.assertFalse((self.root/'new-report.json').exists())

    def test_source_changed_during_read_publishes_nothing(self):
        original_digest = probe.digest
        calls = 0
        def changing(file):
            nonlocal calls
            if Path(file) == self.source:
                calls += 1
                if calls == 2:
                    self.source.write_bytes(self.source.read_bytes()+b'changed')
            return original_digest(file)
        with patch.object(probe, 'digest', side_effect=changing):
            with self.assertRaisesRegex(ValueError, 'changed during read'):
                probe.run(self.args())
        self.assertFalse((self.root/'new-report.json').exists())

    def test_pixel_budget_checked_before_decode(self):
        path = self.root/'over-budget.tiff'
        tifffile.imwrite(path, np.zeros((2100, 2000), dtype=np.uint8), metadata=None, photometric='minisblack')
        with self.assertRaisesRegex(ValueError, 'pixel budget'):
            probe.run(self.args(source=str(path), roi=[0,0,1,1]))
        self.assertFalse((self.root/'new-report.json').exists())

    def test_real_cli_serialization_has_local_provenance(self):
        output = self.root/'cli.json'
        args = [sys.executable, '-B', str(SCRIPT), '--source', str(self.source), '--frame', '0', '--roi', '1','1','5','4',
                '--operation','statistics','--missing-tool','image_statistics', '--capability-evidence','Injected absence in software test',
                '--source-notes','Synthetic ramp, no physical sampling', '--origin','simulation', '--output',str(output)]
        result = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['producer'], 'local_script_fallback_not_provider')
        self.assertEqual(json.loads(output.read_text())['producer']['script_sha256'], hashlib.sha256(SCRIPT.read_bytes()).hexdigest())
        equals_output = self.root/'cli-equals.json'
        equals_args = args[:-2] + ['--output='+str(equals_output)]
        equals = subprocess.run(equals_args, capture_output=True, text=True)
        self.assertEqual(equals.returncode, 0, equals.stderr)
        self.assertEqual(json.loads(equals.stdout)['output'], str(equals_output))
        self.assertEqual(json.loads(equals_output.read_text())['statistics'], json.loads(output.read_text())['statistics'])
        equals_again = subprocess.run(equals_args, capture_output=True, text=True)
        self.assertEqual(equals_again.returncode, 2)
        self.assertEqual(json.loads(equals_again.stderr)['status'], 'failed')
        again = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(again.returncode, 2)
        self.assertEqual(json.loads(again.stderr)['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
