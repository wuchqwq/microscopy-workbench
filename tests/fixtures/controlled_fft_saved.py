"""Public saved-worker parity tiers for the controlled FFT protocol.

Default: fixed 27-source subset (124 ROI evaluations, eight comparisons).
--full-primary: all 510 sources, primary Hann/mean/quadratic only, plus the
unwindowed delta stopping control (609 ROI evaluations, 49 comparisons).
No data are generated and no diagnostic status is substituted for a public one.
Run only after freezing the selected producer and producing its full raw tier:
  python controlled_fft_saved.py --repository CHECKOUT --dataset DATASET \
      --raw RAW_OUTPUT/raw.jsonl --output NEW_DIRECTORY
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import importlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback

sys.dont_write_bytecode = True
SCENES = ('uniform', 'one', 'two', 'weak', 'near_doublet',
          'resolvable_doublet', 'off_bin', 'adjacent', 'background_slope',
          'local_contrast', 'gaussian_blur', 'affine', 'mixture')
PEAK_OPTIONS = {'threshold_rel': .05, 'min_separation_bins': 3,
                'exclude_dc_radius_bins': 3}
ID_KEYS = {'family_id', 'family_ids', 'measurement_object_id',
           'measurement_object_ids'}


def digest(path):
    with Path(path).open('rb') as stream:
        value = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
        return value.hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, allow_nan=False, separators=(',', ':'))


def without_ids(value):
    """Ignore only generated family/measurement identities and member ordering.

    Members with equal canonical vectors may be ordered by random measurement
    UUIDs in the public path. All numerical member fields remain compared.
    Other arrays retain their prescribed order.
    """
    if isinstance(value, dict):
        result = {key: without_ids(item) for key, item in value.items()
                  if key not in ID_KEYS}
        if isinstance(result.get('members'), list):
            result['members'] = sorted(result['members'], key=canonical)
        return result
    if isinstance(value, list):
        return [without_ids(item) for item in value]
    return value


def identity(record):
    return (record['case'], record['noise_model'],
            record.get('dose_expected_e_per_pixel'), record['seed'])


def select_records(manifest, full_primary=False):
    if manifest.get('schema') != 'controlled-fft-noise-v2':
        raise ValueError('Expected controlled-fft-noise-v2 dataset manifest')
    wanted = {('delta_control', 'none', None, None)}
    wanted.update((case, model, 500., seed) for case in SCENES
                  for model, seed in (('none', None), ('poisson', 100)))
    if full_primary:
        wanted.update((case, 'poisson', dose, seed)
                      for case in SCENES
                      for dose in ((50., 500., 2000.) if case in SCENES[:8] else (500.,))
                      for seed in range(100, 116))
        wanted.update((case, model, 500., seed)
                      for case, model in (('one', 'poisson_read'),
                                          ('uniform', 'gaussian_read_only'))
                      for seed in range(100, 116))
        if manifest.get('mode') != 'full' or len(manifest['records']) != 510:
            raise ValueError('--full-primary requires the full immutable 510-source dataset')
    selected = {}
    for record in manifest['records']:
        key = identity(record)
        if key in wanted:
            if key in selected:
                raise ValueError('Duplicate selected dataset identity: '+repr(key))
            selected[key] = record
    if set(selected) != wanted:
        raise ValueError('Requested fixed dataset identities missing: '+repr(wanted-set(selected)))
    ordered = [selected[('delta_control', 'none', None, None)]]
    if full_primary:
        ordered += [record for record in manifest['records'] if record['case'] != 'delta_control']
    else:
        ordered += [selected[(case, model, 500., seed)] for case in SCENES
                    for model, seed in (('none', None), ('poisson', 100))]
    if len(ordered) != (510 if full_primary else 27):
        raise ValueError('Selected source count differs from fixed mode count')
    if len({record['file'] for record in ordered}) != len(ordered):
        raise ValueError('Selected source filenames must be distinct')
    return ordered


def rois(record):
    height, width = record['shape_yx']
    result = [[0, 0, width, height]]
    if record['case'] == 'adjacent':
        if [height, width] != [128, 128]:
            raise ValueError('Adjacent scene must be 128x128')
        result += [[0, 0, 64, 128], [64, 0, 128, 128]]
    return result


def configurations(record, full_primary=False):
    """Only the preregistered schedules; delta's no-window control is first."""
    if full_primary:
        return ([('none', 'quadratic'), ('hann', 'quadratic')]
                if record['case'] == 'delta_control' else [('hann', 'quadratic')])
    windows = ('none', 'hann') if record['case'] == 'delta_control' else ('hann', 'none')
    return [(window, refinement) for window in windows
            for refinement in ('none', 'quadratic')]


def raw_key(filename, window, refinement, roi=None):
    return (filename, window, refinement, None if roi is None else tuple(roi))


def load_raw(path, records, full_primary=False):
    """Read saved outputs only: never re-execute the raw evaluator here."""
    filenames = {record['file'] for record in records}
    expected_eval = {raw_key(record['file'], window, refinement, roi)
                     for record in records
                     for window, refinement in configurations(record, full_primary)
                     for roi in rois(record)}
    expected_compare = {raw_key(record['file'], window, refinement)
                        for record in records if record['case'] == 'adjacent'
                        for window, refinement in configurations(record, full_primary)}
    expected_counts = (609, 49) if full_primary else (124, 8)
    if (len(expected_eval), len(expected_compare)) != expected_counts:
        raise ValueError('Internal fixed mode coverage differs from expected ROI/comparison counts')
    evaluations, comparisons = {}, {}
    with path.open() as stream:
        for number, line in enumerate(stream, 1):
            if not line.strip():
                raise ValueError(f'Blank raw JSONL record at line {number}')
            row = json.loads(line)
            if row.get('source_file') not in filenames:
                continue
            comparison = row.get('record_type') == 'diagnostic_adjacent_comparison'
            key = raw_key(row['source_file'], row['window'], row['refinement'],
                          None if comparison else row['roi_xyxy'])
            wanted_keys = expected_compare if comparison else expected_eval
            if key not in wanted_keys:
                continue
            target = comparisons if comparison else evaluations
            if key in target:
                raise ValueError(f'Duplicate raw subset key at line {number}: {key}')
            target[key] = row
    if set(evaluations) != expected_eval or set(comparisons) != expected_compare:
        raise ValueError('Raw key coverage differs from requested fixed mode')
    # Even raw failures are retained and processed as explicit parity failures.
    return evaluations, comparisons


class Harness:
    def __init__(self, output, worker):
        self.output, self.worker = output, worker
        self.workspace_path = output / 'workspace'
        self.workspace = worker.Workspace(self.workspace_path, writable=True)
        self.calls = (output / 'calls.jsonl').open('w', buffering=1)
        self.results = (output / 'results.jsonl').open('w', buffering=1)
        self.csv_stream = (output / 'summary.csv').open('w', newline='', buffering=1)
        columns = ['record_type', 'source_file', 'case', 'noise_model', 'dose',
                   'seed', 'window', 'subtract_mean', 'refinement', 'roi_xyxy',
                   'execution', 'parity', 'public_status', 'candidate_count',
                   'family_count', 'accepted_angles_degrees', 'request_id',
                   'object_id', 'source_sha256_tiff', 'source_sha256_array',
                   'fft_array_sha256', 'error']
        self.csv = csv.DictWriter(self.csv_stream, fieldnames=columns)
        self.csv.writeheader()
        self.request_count = 0
        self.object_seen, self.journal_seen = set(), set()
        self.failures, self.counts = [], Counter()

    def log(self, value):
        self.calls.write(canonical(value)+'\n')

    def failure(self, stage, **details):
        row = {'stage': stage, **details}
        self.failures.append(row)
        self.log({'record_type': 'failure', **row})

    def capture_committed(self):
        """Capture real child journals and validated metadata once per object.

        These records were produced by actual worker calls, not synthesized by
        copying a previous request. Partial/failed child journals survive too.
        """
        for path in sorted((self.workspace_path / 'requests').glob('*.json')):
            if path.name in self.journal_seen:
                continue
            try:
                journal = self.worker.read_json(path)
                self.log({'record_type': 'actual_workspace_journal',
                          'path': str(path), 'sha256': digest(path), 'journal': journal})
                if journal.get('state') in ('completed', 'failed'):
                    self.journal_seen.add(path.name)
            except Exception:
                self.failure('capture_journal', path=str(path), error=traceback.format_exc())
        for path in sorted((self.workspace_path / 'objects').glob('*/object.json')):
            ident = path.parent.name
            if ident in self.object_seen:
                continue
            try:
                metadata, directory = self.workspace.object(ident)
                self.log({'record_type': 'validated_workspace_object',
                          'object_id': ident, 'directory': str(directory),
                          'manifest_sha256': digest(path), 'metadata': metadata})
                self.object_seen.add(ident)
            except Exception:
                self.failure('capture_object', object_id=ident, error=traceback.format_exc())

    def call(self, action, **parameters):
        request = {'action': action, 'workspace': str(self.workspace_path), **parameters}
        if action not in ('get', 'result'):
            request['request_id'] = 'controlled-saved-'+str(self.request_count)
        self.request_count += 1
        start = time.monotonic()
        try:
            response = self.worker.execute(request)
        except Exception:
            self.log({'record_type': 'worker_execute', 'request': request,
                      'execution': 'exception', 'exception': traceback.format_exc(),
                      'elapsed_seconds': time.monotonic()-start})
            self.capture_committed()
            raise
        self.log({'record_type': 'worker_execute', 'request': request,
                  'execution': 'ok' if response.get('ok') else 'error',
                  'response': response, 'elapsed_seconds': time.monotonic()-start})
        self.capture_committed()
        if not response.get('ok'):
            raise RuntimeError('Worker returned failure: '+canonical(response))
        ident = response['result']['object_id']
        metadata, _ = self.workspace.object(ident)
        return metadata

    def result(self, row):
        self.results.write(canonical(row)+'\n')
        self.counts[row['record_type']+'_attempted'] += 1
        self.counts[row['record_type']+'_'+row['execution']] += 1
        if row.get('parity') is True:
            self.counts[row['record_type']+'_parity_pass'] += 1
        csvrow = {key: row.get(key) for key in self.csv.fieldnames}
        for key in ('roi_xyxy', 'accepted_angles_degrees'):
            if csvrow[key] is not None:
                csvrow[key] = canonical(csvrow[key])
        self.csv.writerow(csvrow)

    def close(self):
        self.calls.close()
        self.results.close()
        self.csv_stream.close()


def exact_check(checks, name, actual, expected):
    # canonical equality also distinguishes booleans from numbers. No tolerance.
    equal = canonical(actual) == canonical(expected)
    checks[name] = {'equal': equal}
    if not equal:
        checks[name].update(actual=actual, expected=expected)


def check_roi(harness, record, roi, window, refinement, region, sample, raw, calibration):
    peaks, peak_dir = harness.workspace.object(region['peaks_object_id'])
    fft, fft_dir = harness.workspace.object(region['fft_object_id'])
    measurements, _ = harness.workspace.object(region['peak_measurements_object_id'])
    checks = {}
    exact_check(checks, 'raw_execution', raw.get('execution'), 'ok')
    if raw.get('execution') == 'ok':
        exact_check(checks, 'source_sha256_tiff', record['sha256_tiff'], raw['source_sha256_tiff'])
        exact_check(checks, 'source_sha256_array', record['sha256_array_float32_le_c'], raw['source_sha256_array'])
        exact_check(checks, 'peak_count', len(peaks['peak_table']), len(raw['diagnostic_peaks']))
        projected = []
        extra = []
        for saved, expected in zip(peaks['peak_table'], raw['diagnostic_peaks']):
            projected.append({key: saved.get(key) for key in expected})
            geometry = calibration.geometry(*saved['frequency_cycles_per_pixel'],
                                             fft.get('xy_calibration'), frequency=True)
            extra.append({'peak_id': saved['peak_id'],
                          'fields': {key: value for key, value in saved.items() if key not in expected}})
            exact_check(checks, 'geometry_'+saved['peak_id'],
                        {key: saved.get(key) for key in geometry}, geometry)
            exact_check(checks, 'extra_peak_fields_'+saved['peak_id'],
                        {key: value for key, value in saved.items() if key not in expected},
                        {**geometry, 'd_spacing': geometry.get('period'),
                         'd_spacing_unit': geometry.get('period_unit'),
                         'dc_reference': [0, 0],
                         'coordinate_space': 'frequency_cycles_per_pixel'})
        exact_check(checks, 'all_raw_peak_keys', projected, raw['diagnostic_peaks'])
        exact_check(checks, 'parameters', peaks['peak_parameters'], raw['parameters'])
        exact_check(checks, 'quality', peaks['peak_quality'], raw['diagnostic_quality'])
        exact_check(checks, 'removed_mean', fft['removed_mean'], raw['removed_mean'])
        exact_check(checks, 'features_without_generated_ids', without_ids(sample['features']),
                    without_ids(raw['diagnostic_features']))
        exact_check(checks, 'noncollinear', sample['quality']['has_two_noncollinear_families'],
                    raw['diagnostic_noncollinear'])
        exact_check(checks, 'measurements_count', len(measurements['measurements']),
                    len(raw['diagnostic_peaks']))
        for measured, peak in zip(measurements['measurements'], raw['diagnostic_peaks']):
            exact_check(checks, 'measurement_q_'+peak['peak_id'],
                        measured['frequency_cycles_per_pixel'], peak['frequency_cycles_per_pixel'])
            exact_check(checks, 'measurement_period_'+peak['peak_id'],
                        measured['pixel_period'], peak['pixel_period'])
        for i, (saved, expected_geometry) in enumerate(zip(peaks['peak_table'], raw['diagnostic_geometry'])):
            exact_check(checks, 'raw_geometry_'+str(i),
                        {key: saved.get(key) for key in expected_geometry}, expected_geometry)
    else:
        extra = []
        checks['raw_error'] = {'equal': False, 'expected_raw_error': raw.get('error')}
    exact_check(checks, 'saved_fft_file_hash', digest(fft_dir/'data.npy'), fft['files_sha256']['data.npy'])
    exact_check(checks, 'saved_peaks_array_same_fft', digest(peak_dir/'data.npy'), fft['files_sha256']['data.npy'])
    exact_check(checks, 'detector_input_array_hash', peaks['peak_detection']['input_complex_array_sha256'], fft['files_sha256']['data.npy'])
    parity = all(check['equal'] for check in checks.values())
    row = {**base_row(record, window, refinement), 'record_type': 'roi',
           'roi_xyxy': roi, 'execution': 'ok', 'parity': parity,
           'public_status': sample['status'], 'public_invalid_reasons': sample['invalid_reasons'],
           'public_features': sample['features'], 'public_measurements': sample['measurements'],
           'candidate_count': len(peaks['peak_table']), 'family_count': sample['features']['family_count'],
           'request_id': peaks['request_id'], 'object_id': peaks['object_id'],
           'fft_array_sha256': fft['files_sha256']['data.npy'], 'checks': checks,
           'extra_saved_peak_fields': extra, 'raw_diagnostic_status_used_as_public_status': False}
    harness.result(row)
    if not parity:
        harness.failure('roi_parity', source_file=record['file'], roi_xyxy=roi,
                        window=window, refinement=refinement,
                        failed_checks=[key for key, value in checks.items() if not value['equal']])
    return row


def base_row(record, window, refinement):
    return {'source_file': record['file'], 'case': record['case'],
            'noise_model': record['noise_model'],
            'dose': record.get('dose_expected_e_per_pixel'), 'seed': record['seed'],
            'window': window, 'subtract_mean': window == 'hann', 'refinement': refinement,
            'source_sha256_tiff': record['sha256_tiff'],
            'source_sha256_array': record['sha256_array_float32_le_c']}


def run(repository, dataset, raw_path, output, full_primary=False):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    mode = 'full-primary' if full_primary else 'fixed-subset'
    expected_sources, expected_roi, expected_comparisons = ((510, 609, 49)
        if full_primary else (27, 124, 8))
    harness, protected, summary = None, {}, {'scope': 'public saved-chain raw parity',
        'mode': mode, 'expected_sources': expected_sources,
        'expected_roi_evaluations': expected_roi, 'expected_comparisons': expected_comparisons,

        'statistical_significance': 'not_assessed', 'physical_lattice': 'not_assessed'}
    failure = None
    try:
        import numpy as np
        import scipy
        import tifffile
        repository = repository.resolve(strict=True)
        dataset = dataset.resolve(strict=True)
        raw_path = raw_path.resolve(strict=True)
        manifest_path = dataset/'manifest.json'
        protected[manifest_path] = digest(manifest_path)
        protected[raw_path] = digest(raw_path)
        manifest = json.loads(manifest_path.read_text())
        records = select_records(manifest, full_primary)
        evaluations, comparisons = load_raw(raw_path, records, full_primary)
        for record in records:
            path = dataset/record['file']
            if path.parent.resolve() != dataset or path.is_symlink():
                raise ValueError('Source must be an ordinary direct child of dataset')
            protected[path] = digest(path)
            if protected[path] != record['sha256_tiff']:
                raise ValueError('Source TIFF hash mismatch: '+record['file'])
            image = tifffile.imread(path)
            if image.dtype != np.float32 or list(image.shape) != record['shape_yx']:
                raise ValueError('Source dtype/shape mismatch: '+record['file'])
            array_hash = hashlib.sha256(image.astype('<f4').tobytes(order='C')).hexdigest()
            if array_hash != record['sha256_array_float32_le_c']:
                raise ValueError('Source pixel array hash mismatch: '+record['file'])
        # Import only the explicitly selected producer, never this fixture's checkout.
        sys.path.insert(0, str(repository))
        worker = importlib.import_module('tools.image_workspace')
        calibration = importlib.import_module('tools.image_calibration')
        if Path(worker.__file__).resolve() != repository/'tools/image_workspace.py':
            raise ValueError('Loaded worker escaped --repository')
        modules = {name: importlib.import_module('tools.'+name) for name in
                   ('image_peaks', 'image_calibration', 'image_domain_compare', 'image_feature_field')}
        for name, module in modules.items():
            path = Path(module.__file__).resolve()
            if path != repository/'tools'/(name+'.py'):
                raise ValueError('Loaded helper escaped --repository: '+name)
        raw_run_path = raw_path.parent/'run.json'
        raw_run = json.loads(raw_run_path.read_text()) if raw_run_path.exists() else None
        if raw_run is not None:
            protected[raw_run_path] = digest(raw_run_path)
            if raw_run.get('manifest_sha256') != protected[manifest_path]:
                raise ValueError('Raw run used a different dataset manifest')
            for name, module in modules.items():
                if raw_run.get('module_hashes', {}).get('tools.'+name, {}).get('sha256') != digest(Path(module.__file__)):
                    raise ValueError('Raw run/selected producer module mismatch: '+name)
        source_hashes = {str(path): digest(path) for path in (repository/'tools').glob('*.py')}
        summary['run'] = {'mode': mode, 'repository': str(repository), 'dataset': str(dataset), 'raw': str(raw_path),
            'git_head': subprocess.check_output(['git', '-C', str(repository), 'rev-parse', 'HEAD'], text=True).strip(),
            'git_status': subprocess.check_output(['git', '-C', str(repository), 'status', '--short'], text=True),
            'producer_module_sha256': source_hashes, 'manifest_sha256': protected[manifest_path],
            'raw_sha256': protected[raw_path], 'raw_run': raw_run,
            'script_sha256': digest(Path(__file__)), 'python': platform.python_version(),
            'numpy': np.__version__, 'scipy': scipy.__version__, 'tifffile': tifffile.__version__}
        protected.update({Path(path): value for path, value in source_hashes.items()})
        harness = Harness(output, worker)
        harness.log({'record_type': 'run', **summary['run'], 'selected_records': records})
        stopped = False
        for record in records:
            harness.counts['source_attempted'] += 1
            try:
                opened = harness.call('open', source_path=str(dataset/record['file']))
                frame = harness.call('frame', object_id=opened['object_id'], frame_index=0)
                frame_array = np.load(harness.workspace_path/'objects'/frame['object_id']/'data.npy', allow_pickle=False)
                frame_hash = hashlib.sha256(frame_array.astype('<f4').tobytes(order='C')).hexdigest()
                if frame_hash != record['sha256_array_float32_le_c']:
                    raise ValueError('Saved frame differs from source pixel hash')
                harness.log({'record_type': 'source_array', 'source_file': record['file'],
                             'source_identity': opened['source_identity'], 'frame_object_id': frame['object_id'],
                             'frame_npy_sha256': frame['files_sha256']['data.npy'],
                             'canonical_float32_le_c_sha256': frame_hash})
                harness.counts['source_ok'] += 1
            except Exception:
                harness.counts['source_errors'] += 1
                error = traceback.format_exc()
                harness.failure('source_setup', source_file=record['file'], error=error)
                for window, refine in configurations(record, full_primary):
                    for roi in rois(record):
                        harness.result({**base_row(record, window, refine), 'record_type': 'roi',
                                        'roi_xyxy': roi, 'execution': 'error', 'parity': False, 'error': error})
                    if record['case'] == 'adjacent':
                        harness.result({**base_row(record, window, refine), 'record_type': 'comparison',
                                        'execution': 'error', 'parity': False, 'error': error})
                if record['case'] == 'delta_control':
                    stopped = True
                    break
                continue
            for window, refine in configurations(record, full_primary):
                options = {**PEAK_OPTIONS, 'refinement': refine}
                configured_rois = rois(record)
                try:
                    atlas = harness.call('spatial_atlas', object_id=frame['object_id'],
                        rects=configured_rois, window=window, subtract_mean=window == 'hann',
                        max_peaks=16, max_size=256, peak_options=options)
                    field = harness.call('feature_field', object_id=atlas['object_id'],
                        coordinate_domain='pixel', display_feature='family_count', max_size=256)
                    if len(atlas['regions']) != len(configured_rois) or len(field['samples']) != len(configured_rois):
                        raise ValueError('Saved atlas/field ROI count mismatch')
                except Exception:
                    error = traceback.format_exc()
                    harness.failure('saved_configuration', **base_row(record, window, refine), error=error)
                    for roi in configured_rois:
                        harness.result({**base_row(record, window, refine), 'record_type': 'roi',
                                        'roi_xyxy': roi, 'execution': 'error', 'parity': False, 'error': error})
                    if record['case'] == 'adjacent':
                        harness.result({**base_row(record, window, refine), 'record_type': 'comparison',
                                        'execution': 'error', 'parity': False, 'error': error})
                    if record['case'] == 'delta_control':
                        stopped = True
                        break
                    continue
                for roi, region, sample in zip(configured_rois, atlas['regions'], field['samples']):
                    try:
                        if region['rect'] != roi or sample['rect_xyxy'] != roi:
                            raise ValueError('Saved region/sample ROI order mismatch')
                        row = check_roi(harness, record, roi, window, refine, region, sample,
                                        evaluations[raw_key(record['file'], window, refine, roi)], calibration)
                        if record['case'] == 'delta_control' and window == 'none' and (row['candidate_count'] != 0 or not row['parity']):
                            harness.failure('delta_control_stopping_rule', **base_row(record, window, refine),
                                            reason='Unwindowed analytic constant modulus must produce no localized peaks and agree with raw')
                            stopped = True
                    except Exception:
                        error = traceback.format_exc()
                        harness.failure('roi_exception', **base_row(record, window, refine), roi_xyxy=roi, error=error)
                        harness.result({**base_row(record, window, refine), 'record_type': 'roi',
                                        'roi_xyxy': roi, 'execution': 'error', 'parity': False, 'error': error})
                        if record['case'] == 'delta_control':
                            stopped = True
                if record['case'] == 'adjacent':
                    try:
                        compared = harness.call('local_signature_compare', object_id=atlas['object_id'],
                            reference_index=1, target_indices=[2], angles_degrees=[0, 90],
                            coordinate_domain='pixel', tolerance=.01)
                        relation = compared['relations'][0]
                        raw_comparison = comparisons[raw_key(record['file'], window, refine)]
                        checks = {}
                        exact_check(checks, 'raw_execution', raw_comparison.get('execution'), 'ok')
                        for key in ('status', 'accepted_angles_degrees'):
                            exact_check(checks, key, relation.get(key),
                                raw_comparison.get('diagnostic_comparison', {}).get(key))
                        parity = all(check['equal'] for check in checks.values())
                        harness.result({**base_row(record, window, refine), 'record_type': 'comparison',
                            'execution': 'ok', 'parity': parity, 'public_status': relation['status'],
                            'accepted_angles_degrees': relation['accepted_angles_degrees'], 'checks': checks,
                            'public_relation': relation, 'request_id': compared['request_id'],
                            'object_id': compared['object_id']})
                        if not parity:
                            harness.failure('comparison_parity', **base_row(record, window, refine), checks=checks)
                    except Exception:
                        error = traceback.format_exc()
                        harness.failure('comparison_exception', **base_row(record, window, refine), error=error)
                        harness.result({**base_row(record, window, refine), 'record_type': 'comparison',
                                        'execution': 'error', 'parity': False, 'error': error})
                if stopped:
                    break
            if stopped:
                break
        summary['stopped_by_delta_rule'] = stopped
        if (harness.counts['source_attempted'] != expected_sources or
                harness.counts['roi_attempted'] != expected_roi or
                harness.counts['comparison_attempted'] != expected_comparisons):
            harness.failure('coverage', actual_sources=harness.counts['source_attempted'],
                            expected_sources=expected_sources, actual_roi=harness.counts['roi_attempted'],
                            actual_comparison=harness.counts['comparison_attempted'],
                            expected_roi=expected_roi, expected_comparison=expected_comparisons)
    except Exception:
        failure = traceback.format_exc()
        if harness is not None:
            harness.failure('fatal', error=failure)
    finally:
        changed = []
        for path, before in protected.items():
            try:
                if digest(path) != before:
                    changed.append(str(path))
            except Exception:
                changed.append(str(path))
        summary.update(source_and_input_hashes_unchanged=not changed,
                       changed_sources_or_inputs=changed,
                       protected_files_sha256={str(path): value for path, value in protected.items()})
        if harness is not None:
            if changed:
                harness.failure('final_source_hash_check', paths=changed)
            summary.update(counts=dict(harness.counts), failures=harness.failures,
                           worker_execute_calls=harness.request_count,
                           captured_validated_objects=len(harness.object_seen),
                           captured_terminal_journals=len(harness.journal_seen))
            harness.close()
        else:
            # Setup failures also produce every advertised report artifact.
            for name in ('calls.jsonl', 'results.jsonl'):
                (output/name).write_text(canonical({'record_type': 'fatal', 'error': failure})+'\n')
            with (output/'summary.csv').open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['execution', 'error'])
                writer.writeheader(); writer.writerow({'execution': 'error', 'error': failure})
            summary.update(counts={}, failures=[{'stage': 'setup', 'error': failure}])
        summary['ok'] = not summary['failures'] and failure is None and not changed
        if failure is not None:
            summary['fatal_error'] = failure
        (output/'summary.json').write_text(json.dumps(summary, indent=2, sort_keys=True, allow_nan=False)+'\n')
        file_hashes = {str(path.relative_to(output)): digest(path) for path in output.rglob('*')
                       if path.is_file() and path.name != 'filehash-manifest.json'}
        (output/'filehash-manifest.json').write_text(json.dumps({'files_sha256': file_hashes}, indent=2, sort_keys=True)+'\n')
    print(canonical({'ok': summary['ok'], 'counts': summary.get('counts', {}),
                     'failures': len(summary['failures']), 'output': str(output)}))
    return 0 if summary['ok'] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True, type=Path)
    parser.add_argument('--dataset', required=True, type=Path)
    parser.add_argument('--raw', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--full-primary', action='store_true',
                        help='All 510 sources: primary Hann/mean/quadratic plus initial no-window delta stop control; 609 ROI / 49 comparisons')
    args = parser.parse_args()
    return run(args.repository, args.dataset, args.raw, args.output, args.full_primary)


if __name__ == '__main__':
    raise SystemExit(main())
