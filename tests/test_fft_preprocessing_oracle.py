"""Independent high-precision saved-FFT preprocessing oracle.

Run: .venv/bin/python -m unittest discover -s tests -p test_fft_preprocessing_oracle.py -v
Set FFT_PREPROCESSING_ORACLE_OUTPUT to a fresh directory for durable artifacts.
The reference never calls FFT/IFFT, NumPy hanning or the product detector.
"""
from __future__ import annotations

from decimal import Decimal, localcontext
from functools import lru_cache, wraps
import hashlib
import importlib
import inspect
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import traceback
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
worker = importlib.import_module('tools.image_workspace')
PI = Decimal('3.141592653589793238462643383279502884197169399375105820974944592307816406')
U = 2. ** -53
CASES = [((11, 13), 'float32', 0., 1., (3, 5)),
         ((12, 14), 'float32', 100., 1., (4, 9)),
         ((13, 16), 'float32', 10000., 1., (0, 0)),
         ((17, 19), 'uint16', 100., 1., (8, 9)),
         ((63, 63), 'float32', 100., 1., (20, 25)),
         ((13, 17), 'float32', 1e8, 1., (7, 8))]


def high_precision(function):
    @wraps(function)
    def run(*args, **kwargs):
        with localcontext() as context:
            context.prec = 70
            return function(*args, **kwargs)
    return run


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cmul(a, b):
    return (a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0])


@lru_cache(maxsize=None)
@high_precision
def root_of_unity(n, index):
    """Negative-exponent DFT root; phase reduced before independent Taylor sums."""
    index %= n
    if index > n//2:
        index -= n
    angle = -2*PI*index/n
    cosine = cterm = Decimal(1)
    sine = sterm = angle
    for k in range(1, 100):
        cterm *= -angle*angle/((2*k-1)*(2*k))
        sterm *= -angle*angle/((2*k)*(2*k+1))
        cosine += cterm
        sine += sterm
    return cosine, sine


@lru_cache(maxsize=None)
@high_precision
def symmetric_hann(n):
    if n == 1:
        return (Decimal(1),)
    # cos(+angle) == cos(-angle); do not call the production window function.
    return tuple((1-root_of_unity(n-1, j)[0])/2 for j in range(n))


def decimals(array):
    return [[Decimal.from_float(float(value)) for value in row] for row in array]


@high_precision
def preprocess_reference(source, window, subtract_mean):
    height, width = len(source), len(source[0])
    removed = sum((sum(row) for row in source), Decimal(0))/(height*width) if subtract_mean else Decimal(0)
    hy = symmetric_hann(height) if window == 'hann' else (Decimal(1),)*height
    hx = symmetric_hann(width) if window == 'hann' else (Decimal(1),)*width
    return [[(source[y][x]-removed)*hy[y]*hx[x] for x in range(width)]
            for y in range(height)], removed


@high_precision
def direct_dft(source):
    """Separable direct sums in Decimal; no FFT algorithm or FFT grid helper."""
    height, width = len(source), len(source[0])
    horizontal = []
    for row in source:
        out = []
        for kx in range(width):
            real = imag = Decimal(0)
            for x, value in enumerate(row):
                cr, ci = root_of_unity(width, kx*x)
                real += value*cr
                imag += value*ci
            out.append((real, imag))
        horizontal.append(out)
    output = [[None]*width for _ in range(height)]
    for ky in range(height):
        for kx in range(width):
            real = imag = Decimal(0)
            for y in range(height):
                cr, ci = cmul(horizontal[y][kx], root_of_unity(height, ky*y))
                real += cr
                imag += ci
            output[(ky+height//2) % height][(kx+width//2) % width] = (real, imag)
    return output


@high_precision
def impulse_closed_form(shape, background, delta, position, window, subtract_mean):
    height, width = shape
    removed = background+delta/(height*width) if subtract_mean else Decimal(0)
    hy = symmetric_hann(height) if window == 'hann' else (Decimal(1),)*height
    hx = symmetric_hann(width) if window == 'hann' else (Decimal(1),)*width
    def transform(vector):
        n = len(vector)
        if window == 'none':
            return [(Decimal(n), Decimal(0))]+[(Decimal(0), Decimal(0))]*(n-1)
        return [(sum((v*root_of_unity(n, k*j)[0] for j, v in enumerate(vector)), Decimal(0)),
                 sum((v*root_of_unity(n, k*j)[1] for j, v in enumerate(vector)), Decimal(0)))
                for k in range(n)]
    fy, fx = transform(hy), transform(hx)
    py, px = position
    weighted_delta = delta*hy[py]*hx[px]
    out = [[None]*width for _ in range(height)]
    for ky in range(height):
        for kx in range(width):
            wr, wi = cmul(fy[ky], fx[kx])
            pr, pi = cmul(root_of_unity(height, ky*py), root_of_unity(width, kx*px))
            out[(ky+height//2) % height][(kx+width//2) % width] = (
                (background-removed)*wr+weighted_delta*pr,
                (background-removed)*wi+weighted_delta*pi)
    return out


def complex_array(reference):
    return np.asarray([[complex(float(v[0]), float(v[1])) for v in row]
                       for row in reference], dtype=np.complex128)


@high_precision
def reference_difference_l1(a, b):
    return sum((abs(x-y) for rowa, rowb in zip(a, b) for x, y in zip(rowa, rowb)), Decimal(0))


@high_precision
def complex_reference_max_difference(a, b):
    return max(((x[0]-y[0])**2+(x[1]-y[1])**2).sqrt()
               for rowa, rowb in zip(a, b) for x, y in zip(rowa, rowb))


class FFTPreprocessingOracle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        named = os.environ.get('FFT_PREPROCESSING_ORACLE_OUTPUT')
        cls.out = Path(named).resolve() if named else Path(tempfile.mkdtemp(prefix='fft-preprocessing-oracle-'))/'run'
        cls.out.mkdir(parents=True, exist_ok=False)
        cls.workspace = cls.out/'workspace'
        cls.calls = (cls.out/'calls.jsonl').open('w', buffering=1)
        cls.records = (cls.out/'results.jsonl').open('w', buffering=1)
        cls.sequence, cls.sources, cls.outcomes = 0, {}, []
        cls.producer_before = {str(p): sha(p) for p in (ROOT/'tools').glob('*.py')}
        cls.manifest = {'reviewer': 'GPT-6.1 Sol', 'repository': str(ROOT),
            'commit': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip(),
            'tree': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD^{tree}'], text=True).strip(),
            'script_sha256': sha(Path(__file__)), 'producer_source_sha256': cls.producer_before,
            'numpy': np.__version__, 'tifffile': tifffile.__version__, 'python': platform.python_version(),
            'numpy_hanning_source_sha256': hashlib.sha256(inspect.getsource(np.hanning).encode()).hexdigest(),
            'criteria_sha256': (sha(ROOT/'analysis/preprocessing-oracle/CRITERIA.md')
                if (ROOT/'analysis/preprocessing-oracle/CRITERIA.md').exists() else None),
            'oracle_precision_decimal_digits': 70,
            'criteria': {'pointwise_preprocess_reserve': '64*u*max(1,maxabs_source)',
                         'fft_reserve': '512*u*max(1,L1_actual_work)',
                         'reference_residual': '1e-55*max(1,L1_source)',
                         'reserve_is_certified_fft_bound': False}}
        print('\nIndependent preprocessing artifacts:', cls.out, file=sys.stderr)

    @classmethod
    def tearDownClass(cls):
        unchanged = all(sha(path) == value for path, value in cls.sources.items())
        producer_unchanged = all(sha(path) == value for path, value in cls.producer_before.items())
        cls.manifest.update(source_files_sha256=cls.sources, source_files_unchanged=unchanged,
                            producer_sources_unchanged=producer_unchanged, outcomes=cls.outcomes,
                            worker_calls=cls.sequence)
        cls.calls.close(); cls.records.close()
        (cls.out/'manifest.json').write_text(json.dumps(cls.manifest, indent=2, allow_nan=False)+'\n')
        hashes = {str(p.relative_to(cls.out)): sha(p) for p in cls.out.rglob('*') if p.is_file()}
        (cls.out/'filehash-manifest.json').write_text(json.dumps(hashes, indent=2)+'\n')
        if not unchanged or not producer_unchanged:
            raise AssertionError('Source TIFF or producer source bytes changed during oracle tests')

    def call(self, action, **arguments):
        cls = type(self)
        request = {'action': action, 'workspace': str(self.workspace),
                   'request_id': 'preprocessing-oracle-'+str(cls.sequence), **arguments}
        cls.sequence += 1
        try:
            response = worker.execute(request)
        except Exception:
            cls.calls.write(json.dumps({'request': request, 'exception': traceback.format_exc()})+'\n')
            raise
        cls.calls.write(json.dumps({'request': request, 'response': response}, allow_nan=False)+'\n')
        self.assertTrue(response['ok'], response)
        return response['result']

    def source(self, name, array):
        path = self.out/(name+'.tiff')
        tifffile.imwrite(path, array, photometric='minisblack', metadata=None)
        type(self).sources[str(path)] = sha(path)
        opened = self.call('open', source_path=str(path))
        frame = self.call('frame', object_id=opened['object_id'], frame_index=0)
        loaded = np.load(frame['array_path'], allow_pickle=False)
        np.testing.assert_array_equal(loaded, array)
        self.assertEqual(loaded.dtype, array.dtype)
        return frame

    def assess(self, name, array, frame, window, subtract_mean, impulse=None):
        row = {'name': name, 'window': window, 'subtract_mean': subtract_mean,
               'shape_yx': list(array.shape), 'dtype': str(array.dtype),
               'source_pixel_bytes_sha256': hashlib.sha256(array.tobytes(order='C')).hexdigest()}
        type(self).outcomes.append(row)
        try:
            captured = []
            original = np.fft.fft2
            def observe(values, *args, **kwargs):
                captured.append(values.copy())
                return original(values, *args, **kwargs)
            with patch.object(worker.np.fft, 'fft2', side_effect=observe):
                fft = self.call('fft', object_id=frame['object_id'], window=window,
                                subtract_mean=subtract_mean, max_size=256)
            self.assertEqual(len(captured), 1)
            actual_work = captured[0]
            self.assertEqual(actual_work.dtype, np.dtype('float64'))
            source_decimal = decimals(array)
            ideal_work, ideal_mean = preprocess_reference(source_decimal, window, subtract_mean)
            actual_decimal = decimals(actual_work)
            ideal_dft = direct_dft(ideal_work)
            actual_work_dft = direct_dft(actual_decimal)
            exact_preprocessing_l1_difference = reference_difference_l1(actual_decimal, ideal_work)
            source_l1 = sum(abs(float(v)) for source_row in array for v in source_row)
            work_l1 = sum(abs(float(v)) for source_row in actual_work for v in source_row)
            budget = 512*U*max(1., work_l1)
            reference_budget = Decimal('1e-55')*Decimal.from_float(max(1., source_l1))
            pointwise_error = max(abs(a-b) for ra, rb in zip(actual_decimal, ideal_work) for a, b in zip(ra, rb))
            pointwise_budget = 64*U*max(1., float(np.abs(array.astype(float)).max()))
            saved = np.load(fft['array_path'], allow_pickle=False)
            numerical_error = float(np.max(np.abs(saved-complex_array(actual_work_dft))))
            mathematical_error = float(np.max(np.abs(saved-complex_array(ideal_dft))))
            tag = name+'-'+window+'-mean'+str(subtract_mean)
            directory = self.out/tag; directory.mkdir()
            for file, values in [('actual-work.npy', actual_work),
                                 ('reference-exact-preprocessing.npy', complex_array(ideal_dft)),
                                 ('reference-actual-work.npy', complex_array(actual_work_dft))]:
                np.save(directory/file, values, allow_pickle=False)
            row.update(fft_object_id=fft['object_id'], fft_request_id=fft['request_id'],
                fft_array_file_sha256=sha(fft['array_path']), work_array_bytes_sha256=hashlib.sha256(actual_work.tobytes()).hexdigest(),
                independent_exact_raw_mean_decimal=str(ideal_mean), removed_mean=fft['removed_mean'],
                preprocessing_pointwise_error=float(pointwise_error), preprocessing_pointwise_budget=pointwise_budget,
                preprocessing_l1_error_decimal=str(exact_preprocessing_l1_difference),
                FFT_vs_exact_actual_work_max_complex_error=numerical_error, FFT_regression_reserve=budget,
                FFT_vs_exact_ideal_preprocessing_max_complex_error=mathematical_error,
                ideal_preprocessing_comparison_budget=budget+float(exact_preprocessing_l1_difference)+float(reference_budget),
                reference_files_sha256={p.name: sha(p) for p in directory.iterdir()})
            self.assertLessEqual(float(pointwise_error), pointwise_budget)
            self.assertLessEqual(numerical_error, budget)
            self.assertLessEqual(mathematical_error, row['ideal_preprocessing_comparison_budget'])
            self.assertEqual(fft['preprocessing_order'], 'subtract raw ROI mean, then separable Hann if requested')
            self.assertEqual(fft['window'], window)
            self.assertEqual(fft['subtract_mean'], subtract_mean)
            self.assertEqual(saved.dtype, np.dtype('complex128'))
            self.assertEqual(saved.shape, array.shape)
            self.assertLessEqual(abs(fft['removed_mean']-float(ideal_mean)), pointwise_budget)
            if impulse is not None:
                background, delta, position = impulse
                analytic = impulse_closed_form(array.shape, background, delta, position, window, subtract_mean)
                closed_error = complex_reference_max_difference(analytic, ideal_dft)
                row['analytic_vs_direct_reference_max_error_decimal'] = str(closed_error)
                np.save(directory/'reference-analytic.npy', complex_array(analytic), allow_pickle=False)
                row['reference_files_sha256']['reference-analytic.npy'] = sha(directory/'reference-analytic.npy')
                row['actual_input_background_decimal'] = str(background)
                row['actual_input_delta_decimal'] = str(delta)
                self.assertLessEqual(closed_error, reference_budget)
                mask = np.ones(array.shape, bool);mask[array.shape[0]//2, array.shape[1]//2] = False
                row['analytic_nonDC_amplitude_span'] = float(np.ptp(np.abs(complex_array(analytic))[mask]))
                if window == 'none':
                    modulus_error = max(abs((r*r+i*i).sqrt()-abs(delta))
                        for y, reference_row in enumerate(analytic) for x, (r, i) in enumerate(reference_row)
                        if (y, x) != (array.shape[0]//2, array.shape[1]//2))
                    self.assertLessEqual(modulus_error, reference_budget)
            row['execution'] = 'ok'
            return fft
        except Exception:
            row.update(execution='error', error=traceback.format_exc())
            raise
        finally:
            type(self).records.write(json.dumps(row, allow_nan=False)+'\n')

    def test_impulse_all_four_preprocessing_options(self):
        for number, (shape, dtype, background, amplitude, position) in enumerate(CASES):
            array = np.full(shape, background, dtype=dtype)
            array[position] = background+amplitude
            base = Decimal.from_float(float(array[0, 1]))
            delta = Decimal.from_float(float(array[position]))-base
            name = 'impulse-'+str(number)
            frame = self.source(name, array)
            for window in ('none', 'hann'):
                for subtract_mean in (False, True):
                    with self.subTest(case=number, window=window, subtract_mean=subtract_mean):
                        self.assess(name, array, frame, window, subtract_mean, (base, delta, position))

    def test_symmetric_hann_definition(self):
        for n in (2, 11, 12, 13, 16, 17, 19, 32, 35, 63):
            with self.subTest(length=n):
                reference = np.asarray([float(v) for v in symmetric_hann(n)])
                np.testing.assert_allclose(np.hanning(n), reference, rtol=0, atol=64*U)
                np.testing.assert_allclose(reference, reference[::-1], rtol=0, atol=1e-55)
                self.assertEqual(reference[0], 0.)
                self.assertEqual(reference[-1], 0.)
                if n % 2:
                    self.assertEqual(float(reference.max()), 1.)
                else:
                    self.assertLess(float(reference.max()), 1.)

    @high_precision
    def test_mean_before_window_differs_from_unsupported_mean_after_window(self):
        array = np.full((11, 13), 100., dtype=np.float32);array[3, 5] = 101.
        source = decimals(array)
        before, removed = preprocess_reference(source, 'hann', True)
        windowed, _ = preprocess_reference(source, 'hann', False)
        after_mean = sum((sum(row) for row in windowed), Decimal(0))/array.size
        after = [[v-after_mean for v in row] for row in windowed]
        before_f, after_f = direct_dft(before), direct_dft(after)
        difference = [[(x[0]-y[0], x[1]-y[1]) for x, y in zip(rx, ry)]
                      for rx, ry in zip(before_f, after_f)]
        analytic = impulse_closed_form(array.shape, Decimal(100), Decimal(1), (3, 5), 'hann', True)
        self.assertLessEqual(complex_reference_max_difference(before_f, analytic), Decimal('1e-50'))
        height, width = array.shape
        non_dc = [difference[y][x] for y in range(height) for x in range(width)
                  if (y, x) != (height//2, width//2)]
        maximum = max((r*r+i*i).sqrt() for r, i in non_dc)
        self.assertGreater(maximum, Decimal('0.001'))
        self.assertLess(abs(after_f[height//2][width//2][0]), Decimal('1e-50'))
        self.assertGreater(abs(before_f[height//2][width//2][0]), Decimal('0.001'))
        result = {'name': 'operator-order-counterfactual', 'execution': 'ok',
                  'production_order': 'subtract raw mean then window',
                  'unsupported_counterfactual': 'window then subtract windowed mean',
                  'max_nonDC_operator_difference_decimal': str(maximum),
                  'mean_before_window_DC_decimal': str(before_f[height//2][width//2]),
                  'mean_after_window_DC_decimal': str(after_f[height//2][width//2]),
                  'raw_mean_decimal': str(removed), 'windowed_mean_decimal': str(after_mean)}
        type(self).outcomes.append(result)
        type(self).records.write(json.dumps(result)+'\n')

    @high_precision
    def test_weak_cosines_against_actual_quantized_source(self):
        height, width = 32, 35
        waves = ((6, 4), (-5, 8))
        array = np.asarray([[float(Decimal(100)+Decimal('0.001')*sum(
            (cmul(root_of_unity(width, kx*x), root_of_unity(height, ky*y))[0]
             for kx, ky in waves), Decimal(0))) for x in range(width)] for y in range(height)], dtype=np.float32)
        frame = self.source('weak-cosines', array)
        expected = {((width//2+sign*kx) % width, (height//2+sign*ky) % height)
                    for kx, ky in waves for sign in (-1, 1)}
        for window in ('none', 'hann'):
            for mean in (False, True):
                with self.subTest(window=window, subtract_mean=mean):
                    fft = self.assess('weak-cosines', array, frame, window, mean)
                    if mean:
                        peaks = self.call('peaks', object_id=fft['object_id'], max_peaks=16,
                            threshold_rel=.05, min_separation_bins=3,
                            exclude_dc_radius_bins=3, refinement='none', max_size=256)
                        bins = {tuple(row['bin_xy']) for row in peaks['peak_table']}
                        self.assertTrue(expected <= bins, {'expected': sorted(expected), 'actual': sorted(bins)})
                        row = {'name': 'weak-cosine-positive', 'execution': 'ok', 'window': window,
                               'subtract_mean': mean, 'expected_bins': sorted(expected), 'actual_bins': sorted(bins),
                               'peak_object_id': peaks['object_id'], 'peak_request_id': peaks['request_id'],
                               'all_returned_peaks_certified': False}
                        type(self).outcomes.append(row)
                        type(self).records.write(json.dumps(row)+'\n')


if __name__ == '__main__':
    unittest.main(verbosity=2)
