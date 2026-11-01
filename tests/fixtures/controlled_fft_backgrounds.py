"""Preregistered holdout generator; does not import or run a detector.

python tests/fixtures/controlled_fft_backgrounds.py OUTPUT_DIRECTORY
Creates fresh immutable inputs compatible with evaluate_fft_noise.py. No automatic
analysis is performed. The adjacent JSON parameter file is independently hashable.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import tifffile

SPEC = {
    'schema': 'controlled-backgrounds-parameters-v1',
    'shape_yx': [128,128], 'seeds': list(range(1000,1016)),
    'signal_mean_e_per_pixel': 500., 'signal_relative_cosine_amplitude': .02,
    'source_q_xy_cycles_per_pixel': [8/128,5/128],
    'affine_xy': [[1.08,.06],[-.03,.94]], 'affine_shift_xy': [3.,-2.],
    'physical_background_e_per_pixel': 100., 'digital_offset_counts': 100.,
    'read_sigma_e_per_pixel': 5.,
    'cases': ['signal','digital_offset','physical_background','read_noise','affine'],
    'rng': 'numpy.random.default_rng(seed): signal Poisson first; independent physical Poisson or Gaussian read noise second',
    'baseline': 'one deterministic expected-count float32 image per case',
    'observation': 'float32 signal Poisson + independent physical Poisson + independent Gaussian read noise + deterministic digital offset',
    'paired_seed': 'shared signal draws across signal, digital_offset, physical_background and read_noise; affine has a different signal expectation',
}


def canonical(obj): return (json.dumps(obj,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def sha(data): return hashlib.sha256(data).hexdigest()
def parameters_sha256(): return sha(canonical(SPEC))


def expected(case):
    if case not in SPEC['cases']: raise ValueError('unknown case')
    y,x=np.indices(SPEC['shape_yx'],dtype=np.float64)
    matrix=np.asarray(SPEC['affine_xy'] if case=='affine' else [[1.,0.],[0.,1.]])
    shift=np.asarray(SPEC['affine_shift_xy'] if case=='affine' else [0.,0.])
    q=np.asarray(SPEC['source_q_xy_cycles_per_pixel'])
    u=matrix[0,0]*x+matrix[0,1]*y+shift[0]
    v=matrix[1,0]*x+matrix[1,1]*y+shift[1]
    intensity=1+SPEC['signal_relative_cosine_amplitude']*np.cos(2*np.pi*(q[0]*u+q[1]*v))
    signal=SPEC['signal_mean_e_per_pixel']*intensity/intensity.mean()
    physical=SPEC['physical_background_e_per_pixel'] if case=='physical_background' else 0.
    offset=SPEC['digital_offset_counts'] if case=='digital_offset' else 0.
    read_sigma=SPEC['read_sigma_e_per_pixel'] if case=='read_noise' else 0.
    qeff=matrix.T@q; norm=float(np.linalg.norm(qeff))
    truth={'q_xy_cycles_per_pixel':qeff.tolist(),'period_pixels':1/norm,
           'direction_degrees_mod_180':float(np.degrees(np.arctan2(qeff[1],qeff[0]))%180),
           'region_xyxy':[0,0,128,128],'source_q_xy_cycles_per_pixel':q.tolist(),
           'affine_matrix_xy':matrix.tolist(),'affine_shift_xy':shift.tolist(),
           'coordinate_convention':'u = A @ [x,y] + shift; effective q = A.T @ source_q'}
    return signal,physical,offset,read_sigma,truth


def observe(case, seed, rng_factory=np.random.default_rng):
    signal,physical,offset,read_sigma,truth=expected(case)
    if seed is None:
        observed=signal+physical+offset
    else:
        if seed not in SPEC['seeds']: raise ValueError('seed outside preregistered holdout')
        rng=rng_factory(seed)
        observed=rng.poisson(signal).astype(np.float64)
        if physical: observed+=rng.poisson(physical,size=signal.shape)
        if read_sigma: observed+=rng.normal(0.,read_sigma,size=signal.shape)
        observed+=offset
    return np.asarray(observed,dtype=np.float32), truth


def write(output):
    parambytes=canonical(SPEC)
    frozen=Path(__file__).with_name('controlled_fft_backgrounds.parameters.json')
    if frozen.read_bytes()!=parambytes: raise ValueError('frozen parameter file differs from generator')
    output.mkdir(parents=True,exist_ok=False)
    (output/'parameters.json').write_bytes(parambytes)
    records=[]
    for case in SPEC['cases']:
        signal,physical,offset,read_sigma,truth=expected(case)
        # Full-precision expected array is saved independently of float32 source storage.
        ideal=(signal+physical+offset).astype('<f8')
        ideal_path=output/f'{case}_expected.npy'
        np.save(ideal_path,ideal,allow_pickle=False)
        for seed in (None,*SPEC['seeds']):
            image,_=observe(case,seed)
            model='none' if seed is None else ('poisson_read' if read_sigma else 'poisson')
            stem=f'{case}_{"expected" if seed is None else "seed"+str(seed)}'
            path=output/f'{stem}.tiff'
            tifffile.imwrite(path,image,photometric='minisblack',metadata=None)
            records.append({'case':case,'noise_model':model,'seed':seed,'file':path.name,
                'shape_yx':SPEC['shape_yx'],'dtype':'float32','dose_expected_e_per_pixel':500.,
                'signal_mean_expected_e_per_pixel':500.,'physical_background_expected_e_per_pixel':physical,
                'digital_offset_counts':offset,'read_sigma_e_per_pixel':read_sigma,
                'pre_offset_variance_e2_per_pixel':'signal_expected + physical_background + read_sigma^2',
                'parameters_sha256':parameters_sha256(),'ideal_expected_npy':ideal_path.name,
                'ideal_expected_npy_sha256':sha(ideal_path.read_bytes()),
                'ideal_expected_float64_le_c_sha256':sha(ideal.tobytes(order='C')),
                'sha256_tiff':sha(path.read_bytes()),
                'sha256_array_float32_le_c':sha(image.astype('<f4').tobytes(order='C')),
                'truth':{'periodic_components':[truth],'q_sign_equivalence':'q and -q are equivalent'}})
    manifest={'schema':'controlled-fft-noise-v2','fixture':'controlled-backgrounds-holdout-v1',
              'parameters_sha256':parameters_sha256(),'generator_sha256':sha(Path(__file__).read_bytes()),'records':records,
              'note':'Dose denotes expected signal only. Physical background has separate Poisson counts; digital offset adds no shot noise.'}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True,allow_nan=False)+'\n')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);args=p.parse_args();write(args.output)
