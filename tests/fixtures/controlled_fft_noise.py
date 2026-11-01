"""Controlled intensity fixtures; no FFT/detector is used.

Run: python tests/fixtures/controlled_fft_noise.py OUTPUT_DIR [--smoke]
OUTPUT_DIR must not exist. Requires numpy and tifffile from requirements-images.txt.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import tifffile

SEEDS = tuple(range(100, 116))
SHAPE = (128, 128)
Q1 = (8 / 128, 5 / 128)
Q2 = (-4 / 128, 10 / 128)
CASES = {
    'uniform': dict(waves=[]),
    'one': dict(waves=[(Q1, .25)]),
    'two': dict(waves=[(Q1, .20), (Q2, .20)]),
    'weak': dict(waves=[(Q1, .02)]),
    'near_doublet': dict(waves=[(Q1, .16), ((8.6/128, 5/128), .16)]),
    'resolvable_doublet': dict(waves=[(Q1, .16), ((12/128, 5/128), .16)]),
    'off_bin': dict(waves=[((8.35/128, 5.30/128), .25)]),
    'adjacent': dict(adjacent=True),
    'background_slope': dict(waves=[(Q1, .25)], slope=.3),
    'local_contrast': dict(waves=[(Q1, .25)], local_contrast=True),
    'gaussian_blur': dict(waves=[(Q1, .25)], blur_sigma=1.5),
    'affine': dict(waves=[(Q1, .25)], affine=[[1.08, .06], [-.03, .94]], shift=[3., -2.]),
    'mixture': dict(waves=[(Q1, .16), (Q2, .16)]),
}
MULTI_DOSE = ('uniform', 'one', 'two', 'weak', 'near_doublet', 'resolvable_doublet', 'off_bin', 'adjacent')


def build(case: str, model: str, dose: float | None, seed: int | None) -> tuple[np.ndarray, dict]:
    """Generate an image and independent analytical truth without any FFT."""
    if case == 'delta_control':
        if (model, dose, seed) != ('none', None, None):
            raise ValueError('delta_control is deterministic and has no dose or seed')
        image = np.full((63, 63), 100., dtype=np.float32)
        image[20, 25] = 101.
        return image, {'case': case, 'seed': None, 'noise_model': 'none', 'dose': None,
                       'model': 'B + delta', 'background': 100., 'delta_xy': [25, 20],
                       'delta_amplitude': 1., 'shape_yx': [63, 63], 'dtype': 'float32',
                       'truth': {'non_dc_modulus': 1., 'periodic_components': [],
                                 'note': 'Constant non-DC DFT modulus analytically; DC contains B.'}}
    if case not in CASES or model not in ('none', 'poisson', 'poisson_read', 'gaussian_read_only'):
        raise ValueError('unknown scene or noise model')
    if dose not in (50., 500., 2000.) or ((seed is None) != (model == 'none')):
        raise ValueError('invalid dose/seed for model')
    if seed is not None and seed not in SEEDS:
        raise ValueError('seed outside preregistered set')
    cfg = CASES[case]
    yy, xx = np.indices(SHAPE, dtype=np.float64)
    mat = np.asarray(cfg.get('affine', [[1., 0.], [0., 1.]]), dtype=float)
    shift = np.asarray(cfg.get('shift', [0., 0.]), dtype=float)
    u = mat[0, 0] * xx + mat[0, 1] * yy + shift[0]
    v = mat[1, 0] * xx + mat[1, 1] * yy + shift[1]
    ideal = 1. + cfg.get('slope', 0.) * (xx - 63.5) / 63.5
    truths = []

    def add_wave(q, amplitude, mask, region):
        nonlocal ideal
        q = np.asarray(q, dtype=float)
        effective = mat.T @ q
        attenuation = np.exp(-2 * np.pi**2 * cfg.get('blur_sigma', 0.)**2 * np.dot(q, q))
        envelope = np.where(xx < 64, 1., .25) if cfg.get('local_contrast') else 1.
        ideal = ideal + mask * envelope * amplitude * attenuation * np.cos(2*np.pi*(q[0]*u + q[1]*v))
        norm = float(np.linalg.norm(effective))
        truths.append({'q_xy_cycles_per_pixel': effective.tolist(), 'period_pixels': 1/norm,
                       'direction_degrees_mod_180': float(np.degrees(np.arctan2(effective[1], effective[0])) % 180),
                       'amplitude_before_envelope': amplitude * float(attenuation), 'region_xyxy': region})

    if cfg.get('adjacent'):
        for q in ((6/64, 4/64), (-3/64, 8/64)):
            add_wave(q, .20, xx < 64, [0, 0, 64, 128])
        for q in ((5/64, -5/64), (9/64, 3/64)):
            add_wave(q, .20, xx >= 64, [64, 0, 128, 128])
    else:
        for q, amp in cfg.get('waves', []):
            add_wave(q, amp, 1., [0, 0, 128, 128])
    if np.min(ideal) <= 0:
        raise ValueError('ideal intensity must be strictly positive')
    mean_ideal = float(ideal.mean())
    expected = dose * ideal / mean_ideal
    read_sigma = 5. if model in ('poisson_read', 'gaussian_read_only') else 0.
    if model == 'none':
        values = expected
    else:
        rng = np.random.default_rng(seed)
        values = rng.poisson(expected) if model in ('poisson', 'poisson_read') else expected.copy()
        if read_sigma:
            values = values + rng.normal(0., read_sigma, SHAPE)
    image = np.asarray(values, dtype=np.float32)
    meta = {'case': case, 'seed': seed, 'shape_yx': list(SHAPE), 'dtype': 'float32',
            'noise_model': model, 'dose_expected_e_per_pixel': dose,
            'read_sigma_e_per_pixel': read_sigma, 'ideal_mean_before_normalization': mean_ideal,
            'expected_total_e': float(expected.sum()), 'scene_parameters': cfg,
            'truth': {'periodic_components': truths, 'q_sign_equivalence': 'q and -q represent the same real cosine',
                      'note': 'ROI/envelope edges and finite windows can spread or add spectral features.'}}
    return image, meta


def jobs(smoke: bool = False):
    seeds = SEEDS[:2] if smoke else SEEDS
    yield ('delta_control', 'none', None, None)
    for case in CASES:
        yield (case, 'none', 500., None)
        for dose in ((50., 500., 2000.) if case in MULTI_DOSE else (500.,)):
            for seed in seeds:
                yield (case, 'poisson', dose, seed)
    for case, model in (('one', 'poisson_read'), ('uniform', 'gaussian_read_only')):
        for seed in seeds:
            yield (case, model, 500., seed)


def write_dataset(output: Path, smoke: bool = False) -> None:
    output.mkdir(parents=True, exist_ok=False)
    records = []
    for case, model, dose, seed in jobs(smoke):
        image, meta = build(case, model, dose, seed)
        stem = f'{case}_{model}' + ('' if dose is None else f'_d{int(dose)}') + ('' if seed is None else f'_seed{seed}')
        path = output / f'{stem}.tiff'
        tifffile.imwrite(path, image, photometric='minisblack', metadata=None)
        meta['file'] = path.name
        meta['sha256_tiff'] = hashlib.sha256(path.read_bytes()).hexdigest()
        meta['sha256_array_float32_le_c'] = hashlib.sha256(image.astype('<f4').tobytes(order='C')).hexdigest()
        records.append(meta)
    manifest = {'schema': 'controlled-fft-noise-v2', 'mode': 'smoke' if smoke else 'full',
                'seeds': list(SEEDS[:2] if smoke else SEEDS), 'records': records,
                'note': 'Model-generated electron counts, not a complete microscope noise simulation.'}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True, allow_nan=False) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--smoke', action='store_true')
    args = parser.parse_args()
    write_dataset(args.output, args.smoke)
