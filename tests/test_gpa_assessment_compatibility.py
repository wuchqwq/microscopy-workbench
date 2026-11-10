"""Analytic-only compatibility and genuine transferred-object integration."""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_gpa_assessment_validation as validation
from tools import image_gpa_core as core
from tools import image_workspace as worker

FIXTURE = json.loads((Path(__file__).parent/'fixtures'/'gpa-assessment-v1-crossplatform.json').read_text(encoding='utf-8'))


class AssessmentCompatibility(unittest.TestCase):
    def setUp(self):
        self.report = copy.deepcopy(FIXTURE['report'])
        self.saved = copy.deepcopy(FIXTURE['assessment'])
        self.expected = core.evidence_assessment(self.report)

    def check(self, value):
        return validation.validate(value, copy.deepcopy(value), self.expected, self.report)

    def test_real_archived_assessment_and_exact_path(self):
        before = copy.deepcopy(self.saved)
        receipt = self.check(self.saved)
        self.assertIn(receipt['route'], ('exact', 'analytic_compatibility'))
        if self.saved != self.expected:
            self.assertEqual(receipt['route'], 'analytic_compatibility')
            self.assertGreater(len(receipt['changed_fields']), 0)
        self.assertEqual(self.saved, before)
        self.assertEqual(self.check(self.expected)['route'], 'exact')

    def test_whitelist_does_not_admit_status_shape_units_or_input_changes(self):
        for change in ('status', 'version', 'extra', 'unit', 'sigma', 'period', 'type'):
            with self.subTest(change=change):
                v = copy.deepcopy(self.expected)
                if change == 'status': v['material_strain_status'] = 'satisfied'
                if change == 'version': v['semantics_version'] = 2
                if change == 'extra': v['unexpected'] = 0.
                if change == 'unit': v['spatial_transfer']['frequency_unit'] = 'cycles/nm'
                if change == 'sigma': v['spatial_transfer']['aperture_sigma_cycles_per_pixel'][0] = math.nextafter(.025, 1.)
                if change == 'period': v['spatial_transfer']['response_samples'][0]['modulation_period_pixels'] = 8.000000000001
                if change == 'type': v['material_strain_validated'] = False
                with self.assertRaises(ValueError): self.check(v)

    def test_only_finite_small_analytic_roundoff_is_admitted(self):
        fields = [('nominal_untruncated_gaussian_real_space_fwhm_pixels', None),
                  ('central_difference_gain_1d', 0), ('phase_gain_per_reflection', 1),
                  ('first_order_strain_gain_1d_per_reflection', 1)]
        for field, index in fields:
            for bad in (float('nan'), float('inf'), -float('inf'), 'large', 'near_excess'):
                with self.subTest(field=field, bad=bad):
                    v = copy.deepcopy(self.expected)
                    row = v['spatial_transfer'] if index is None else v['spatial_transfer']['response_samples'][index]
                    original = row[field] if field == 'central_difference_gain_1d' else row[field][0]
                    value = (original*(1+1e-10) if bad == 'large' else
                             original*(1+64*2.**-53) if bad == 'near_excess' else bad)
                    if field == 'central_difference_gain_1d': row[field] = value
                    else: row[field][0] = value
                    with self.assertRaises(ValueError): self.check(v)
        # The local recomputation is checked against the oracle too.
        v = copy.deepcopy(self.expected)
        v['spatial_transfer']['response_samples'][1]['phase_gain_per_reflection'][0] *= 1.001
        with self.assertRaises(ValueError):
            validation.validate(self.saved, self.saved, v, self.report)

    def test_zero_transfer_and_disagreeing_copies_are_exact(self):
        v = copy.deepcopy(self.expected)
        self.assertEqual(v['spatial_transfer']['response_samples'][0]['phase_gain_per_reflection'][0], 0.)
        v['spatial_transfer']['response_samples'][0]['phase_gain_per_reflection'][0] = math.nextafter(0., 1.)
        with self.assertRaises(ValueError): self.check(v)
        v = copy.deepcopy(self.saved)
        v['reason_codes'].append('forged')
        with self.assertRaises(ValueError): validation.validate(self.saved, v, self.expected, self.report)
        self.report['algorithm'] = 'future-algorithm-v2'
        with self.assertRaises(ValueError): self.check(self.expected)

    def test_envelope_across_supported_sigma_and_cutoff_branches(self):
        for sigma in (.002, .008, 1/24, .05):
            report = copy.deepcopy(self.report)
            report['mask']['sigma_cycles_per_pixel'] = [sigma, sigma]
            expected = core.evidence_assessment(report)
            value = copy.deepcopy(expected)
            value['spatial_transfer']['nominal_untruncated_gaussian_real_space_fwhm_pixels'][0] = math.nextafter(value['spatial_transfer']['nominal_untruncated_gaussian_real_space_fwhm_pixels'][0], math.inf)
            receipt = validation.validate(value, copy.deepcopy(value), expected, report)
            self.assertEqual(receipt['route'], 'analytic_compatibility')


HANDOFF = Path(os.environ.get('HRTEM_HANDOFF_ROOT', '__handoff_not_configured__'))


@unittest.skipUnless((HANDOFF/'positive'/'workspace').is_dir(), 'Set HRTEM_HANDOFF_ROOT to the verified original Task A payload; no synthetic substitute')
class OriginalHandoff(unittest.TestCase):
    def test_original_gpas_get_result_and_all_package_hashes_unchanged(self):
        manifest = json.loads((HANDOFF.parent/'MANIFEST.json').read_text(encoding='utf-8'))
        def hashes():
            return {name: worker.sha_file(HANDOFF.parent/name) for name in manifest['files']}
        before = hashes()
        for label, ident in [('positive', '7d5e0f3f49524593a05a9850f053e1eb'), ('abstention', '89e86e9ae4d44cefbbdb7592539607a5')]:
            root = HANDOFF/label/'workspace'
            original = worker.read_json(root/'objects'/ident/'object.json')
            if label == 'positive':
                self.assertEqual(FIXTURE['assessment'], original['evidence_assessment'])
                self.assertEqual(FIXTURE['object_manifest_sha256'], worker.sha_file(root/'objects'/ident/'object.json'))
            ws = worker.Workspace(str(root), False)
            self.assertEqual(ws.object(ident)[0], original)
            receipt = ws.gpa_read_validations[ident]
            self.assertEqual(receipt['manifest_sha256'], worker.sha_file(root/'objects'/ident/'object.json'))
            for args in (dict(action='get', object_id=ident), dict(action='result', query_request_id='case-4')):
                response = worker.execute(dict(workspace=str(root), **args))
                self.assertTrue(response['ok'], response)
                saved = response['result']
                for key, value in original.items(): self.assertEqual(saved[key], value, key)
                if receipt['route'] == 'analytic_compatibility':
                    feedback = saved[validation.RECEIPT_KEY]
                    self.assertEqual(feedback['records'][0]['object_id'], ident)
                    self.assertFalse(feedback['saved_records_modified'])
                    self.assertFalse(feedback['science_recomputed'])
            compact = worker.execute(dict(workspace=str(root), action='get', object_id=ident, response_detail='compact'))
            self.assertTrue(compact['ok'], compact)
            self.assertEqual(compact['result']['manifest_sha256'], receipt['manifest_sha256'])
            if receipt['route'] == 'analytic_compatibility':
                self.assertIn(validation.RECEIPT_KEY, compact['result'])
        self.assertEqual(hashes(), before)
        self.assertEqual(before, {k: v['sha256'] for k, v in manifest['files'].items()})

    def test_tampered_state_parameters_arrays_and_coherent_mask_rejected(self):
        ident = '7d5e0f3f49524593a05a9850f053e1eb'
        for mode in ('state', 'parameters', 'array', 'coherent_mask', 'coherent_status', 'analytic_excess'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)/'workspace'
                shutil.copytree(HANDOFF/'positive'/'workspace', root)
                path = root/'objects'/ident/'object.json'
                journal_path = root/'requests'/'case-4.json'
                metadata = worker.read_json(path)
                journal = worker.read_json(journal_path)
                if mode == 'state':
                    journal['state'] = 'failed'
                    journal_path.write_bytes(worker.canonical(journal))
                elif mode == 'array':
                    array = root/'objects'/ident/'amplitude.npy'
                    array.write_bytes(array.read_bytes()+b'tamper')
                else:
                    if mode == 'parameters': metadata['parameters']['mask_sigma'] = .024
                    elif mode == 'coherent_mask':
                        metadata['report']['mask']['sigma_cycles_per_pixel'] = [.024, .024]
                        metadata['evidence_assessment'] = core.evidence_assessment(metadata['report'])
                        metadata['report']['evidence_assessment'] = metadata['evidence_assessment']
                    else:
                        assessment = copy.deepcopy(metadata['evidence_assessment'])
                        if mode == 'coherent_status': assessment['material_strain_status'] = 'satisfied'
                        else: assessment['spatial_transfer']['response_samples'][1]['phase_gain_per_reflection'][0] *= 1.001
                        metadata['evidence_assessment'] = assessment
                        metadata['report']['evidence_assessment'] = assessment
                    path.write_bytes(worker.canonical(metadata)+b'\n')
                    journal['object_manifest_sha256'] = worker.sha_file(path)
                    journal['response'] = {'ok': True, 'state': 'completed', 'backend': worker.BACKEND, 'request_id': 'case-4', **metadata}
                    journal_path.write_bytes(worker.canonical(journal))
                response = worker.execute(dict(workspace=str(root), action='get', object_id=ident))
                self.assertFalse(response['ok'], response)
                self.assertEqual(response['error']['code'], 'CORRUPT_OBJECT')
                if mode == 'analytic_excess': self.assertIn('roundoff envelope exceeded', response['error']['message'])


if __name__ == '__main__':
    unittest.main()
