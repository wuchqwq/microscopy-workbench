"""Independent round-2 synthetic GPA/uncertainty probes; preserve every run.

Run: .venv/bin/python audits/scientific_algorithms_round2/probe_gpa_uncertainty.py
PASS describes the stated check, not real-specimen accuracy. Counterexamples
are successful audit observations, not quietly retuned production tests.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools import image_gpa_core as core, image_workspace as worker
from crystallography.geometry import calibration_map, measure_geometry


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Audit:
    def __init__(self, out):
        self.out = out.resolve()
        self.out.mkdir(parents=True, exist_ok=False)
        self.rows, self.calls, self.files = [], [], {}
        self.n = 256
        self.y, self.x = np.indices((self.n, self.n), dtype=float)
        self.g = [[.125, 0.], [0., .125]]
        self.reference = [92, 92, 116, 116]

    def save(self):
        payload = dict(source_sha=subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip(),
                       git_tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'], cwd=ROOT, text=True).strip(),
                       python=platform.python_version(), platform=platform.platform(),
                       packages={x: importlib.metadata.version(x) for x in ('numpy','scipy','scikit-image','tifffile')},
                       probe_sha256=sha(__file__), cases=self.rows, source_hashes=self.files,
                       source_files_unchanged=all(sha(p) == h for p,h in self.files.items()))
        (self.out/'summary.json').write_text(json.dumps(payload, indent=2, allow_nan=False)+'\n')
        (self.out/'requests.json').write_text(json.dumps(self.calls, indent=2, allow_nan=False)+'\n')

    def run(self, name, fn):
        try:
            row = dict(name=name, execution='PASS', **fn())
        except Exception:
            row = dict(name=name, execution='HARNESS_OR_ASSERTION_FAILURE', traceback=traceback.format_exc())
        self.rows.append(row)
        self.save()
        print(json.dumps(row, allow_nan=False), flush=True)

    def call(self, action, **kwargs):
        req = dict(action=action, request_id=f'round2-gpa-{len(self.calls)+1}', workspace=str(self.out/'workspace'), **kwargs)
        response = worker.execute(req)
        self.calls.append(dict(request=req, response=response))
        if not response['ok']:
            self.save()
            raise RuntimeError(response)
        return response['result']

    def source(self, name, data):
        file = self.out/(name+'.tiff')
        tifffile.imwrite(file, np.asarray(data, dtype=np.float32), photometric='minisblack')
        self.files[str(file)] = sha(file)
        opened = self.call('open', source_path=str(file))
        return self.call('frame', object_id=opened['object_id'], frame_index=0)

    def saved_gpa(self, name, data, calibrated=False):
        frame = self.source(name, data)
        if calibrated:
            frame = self.call('calibrate', object_id=frame['object_id'], scope='image',
                              xy_scale={'x': .02, 'y': -.03, 'unit':'nm'}, source_text='Synthetic signed sampling; no instrument claim')
        fft = self.call('fft', object_id=frame['object_id'], window='none', subtract_mean=True)
        result = self.call('gpa', object_id=fft['object_id'], source_domain='real_space_lattice',
                           source_domain_text='Synthetic audit: intentionally test this working assumption, not independent proof',
                           g_vectors=self.g, mask_sigma=.018, reference_rect=self.reference, reference_mode='fixed_g',
                           reference_text='Synthetic carrier reference at 1/8 cycles/pixel')
        arrays = {name:np.load(Path(result['manifest_path']).parent/(name+'.npy'))
                  for name in ('valid_tensor','valid_displacement','strain_green_lagrange_xy','displacement_pixel_xy')}
        return result, arrays

    def analyze(self, image, sigma=.018, **kwargs):
        # FFT only creates the observed input. Ground truth below is analytic.
        spectrum = np.fft.fftshift(np.fft.fft2(image)).astype(np.complex128)
        return core.analyze(spectrum, self.g, sigma, self.reference, **kwargs)

    def spatial_transfer(self):
        rows = []
        amplitude = .1
        for periods in (1, 4, 8):
            k = periods/self.n
            u = amplitude*np.sin(2*np.pi*k*self.x)
            image = np.cos(2*np.pi*.125*(self.x-u))+np.cos(2*np.pi*.125*self.y)
            # X(x)=x-u(x), so Fxx=dx/dX=1/(1-du/dx), not 1+du/dx.
            derivative = amplitude*2*np.pi*k*np.cos(2*np.pi*k*self.x)
            exact_f = 1/(1-derivative)
            exact_e = .5*(exact_f**2-1)
            for sigma in (.008, .018):
                output = self.analyze(image, sigma)
                a = output['arrays']
                mask = a['valid_tensor'].copy()
                mask[:64] = mask[-64:] = False
                mask[:,:64] = mask[:,-64:] = False
                exx = a['strain_green_lagrange_xy'][...,0,0]
                error = float(np.sqrt(np.mean((exx[mask]-exact_e[mask])**2)))
                truth_rms = float(np.sqrt(np.mean(exact_e[mask]**2)))
                ratio = float(np.linalg.norm(exx[mask])/np.linalg.norm(exact_e[mask]))
                rows.append(dict(periods=periods, sigma=sigma, analytic_strain_rms=truth_rms,
                                 measured_to_true_rms_ratio=ratio, rms_error=error,
                                 small_phase_gaussian_transfer=math.exp(-.5*(k/sigma)**2), valid_pixels=int(mask.sum())))
                if periods == 1 and sigma == .018:
                    assert error < .0001
                if periods == 8 and sigma == .008:
                    assert ratio < .01
        return dict(classification='verified_slow_field_and_bandwidth_method_limit', parameters={'u_amplitude_px':amplitude}, results=rows,
                    conclusion='A valid tensor at every pixel does not give pixel-scale strain resolution.')

    def saved_nonuniform(self):
        u = .1*np.sin(2*np.pi*self.x/self.n)
        image = np.cos(2*np.pi*.125*(self.x-u))+np.cos(2*np.pi*.125*self.y)
        obj,a = self.saved_gpa('nonuniform', image, calibrated=True)
        reads = self.call('gpa_read', object_id=obj['object_id'], points=[[96,96],[128,128],[0,0]])
        mask = a['valid_tensor']
        expected = .5*((1/(1-.1*2*np.pi/self.n*np.cos(2*np.pi*self.x/self.n)))**2-1)
        error = float(np.max(abs(a['strain_green_lagrange_xy'][...,0,0][mask]-expected[mask])))
        assert error < .0002
        assert obj['report']['coordinate_domain'] == 'physical_cartesian_nm'
        return dict(classification='verified_saved_route', object_id=obj['object_id'], max_exx_error=error,
                    result_report=obj['report'], reads=reads, files_sha256=obj['files_sha256'])

    def mixed_carriers(self):
        rows=[]
        for weight in (.2,.8,1.2):
            image = (np.cos(2*np.pi*.125*self.x)+weight*np.cos(2*np.pi*(.125+1/self.n)*self.x)
                     + np.cos(2*np.pi*.125*self.y))
            obj,a = self.saved_gpa('mixed-'+str(weight), image)
            exx=a['strain_green_lagrange_xy'][...,0,0][a['valid_tensor']]
            rows.append(dict(weight=weight, object_id=obj['object_id'], valid_fraction=float(a['valid_tensor'].mean()),
                             exx_min=float(exx.min()), exx_max=float(exx.max()),
                             interpretation_status=obj['report']['interpretation_status'],
                             coordinate_domain=obj['report']['coordinate_domain'], files_sha256=obj['files_sha256']))
        return dict(classification='inapplicable_single_domain_assumption', results=rows,
                    truth='Sum of two unstrained, different-period projected layers. There is no unique single-domain displacement field.',
                    conclusion='Beat-phase gradients are calculable but cannot establish strain in either layer.')

    def noise_acceptance(self):
        rows=[]
        for seed in range(20):
            image=np.random.default_rng(seed).normal(size=(self.n,self.n))
            try:
                result=self.analyze(image)
                a=result['arrays']; exx=a['strain_green_lagrange_xy'][...,0,0][a['valid_tensor']]
                rows.append(dict(seed=seed, outcome='computed_hypothesized', valid_fraction=float(a['valid_tensor'].mean()),
                                 absolute_exx_p95=float(np.quantile(abs(exx),.95))))
            except core.GPAError as error:
                rows.append(dict(seed=seed, outcome=error.code, message=str(error)))
        # Fixed seed, not chosen after looking for success; preserve public result/error.
        image=np.random.default_rng(0).normal(size=(self.n,self.n))
        try:
            obj,a=self.saved_gpa('noise-seed0',image)
            public=dict(object_id=obj['object_id'], report=obj['report'], files_sha256=obj['files_sha256'])
        except RuntimeError as error:
            public=dict(error=str(error))
        return dict(classification='numerical_masks_not_signal_or_model_validation', results=rows, saved_seed0=public,
                    computed_count=sum(r['outcome']=='computed_hypothesized' for r in rows),
                    conclusion='Fixed-band noise can satisfy numerical support. This is not evidence for a lattice; no false-positive rate is qualified by 20 toy cases.')

    def reference_components(self):
        envelope=np.ones_like(self.x); envelope[:,96:160]=0
        image=envelope*(np.cos(2*np.pi*.125*self.x)+np.cos(2*np.pi*.125*self.y))
        spectrum=np.fft.fftshift(np.fft.fft2(image)).astype(np.complex128)
        good=core.analyze(spectrum,self.g,.018,[50,80,80,120],amplitude_floor_relative=.4)
        assert not good['arrays']['valid_displacement'][:,180:200].any()
        try:
            core.analyze(spectrum,self.g,.018,[50,80,200,120],amplitude_floor_relative=.4)
            raise AssertionError('multiple reference components accepted')
        except core.GPAError as error:
            assert error.code=='GPA_REFERENCE_INVALID'
            return dict(classification='verified_reference_abstention', failure_code=error.code, quality=good['report']['quality'])

    def uncertainty(self):
        centre=np.array([31.,42.]); points=np.array([[91.,63.],[20.,109.]])
        scale=np.array([.021,-.032]); cs=np.array([.07,.09]); ps=np.array([[.08,.06],[.05,.1]])
        ss=np.array([.00002,.00003])
        spec=dict(mode='explicit',scale_xy=scale.tolist(),scale_sigma_xy=ss.tolist(),unit='1/nm',
                  convention='cycles_per_length',basis='Independent synthetic input SD; XY scale terms uncorrelated')
        mapping=calibration_map(spec)
        spots=[dict(id=str(i),xy=p.tolist(),sigma_px=ps[i].tolist()) for i,p in enumerate(points)]
        measured=measure_geometry(centre.tolist(),spots,mapping,cs.tolist())
        # Independent direct forward sampling: one centre and scale per trial,
        # reused for both points. Never invoke geometry on Monte Carlo samples.
        rng=np.random.default_rng(20261101); count=200000
        c=centre+rng.normal(size=(count,2))*cs
        s=scale+rng.normal(size=(count,2))*ss
        p=points+rng.normal(size=(count,2,2))*ps
        g=(p-c[:,None,:])*s[:,None,:]
        lengths=np.sqrt((g*g).sum(axis=-1)); periods=1/lengths
        arg=np.arctan2(g[...,1],g[...,0])
        angles=np.abs((arg[:,1]-arg[:,0]+np.pi)%(2*np.pi)-np.pi)*180/np.pi
        actual=np.array([periods[:,0].std(ddof=1),periods[:,1].std(ddof=1),angles.std(ddof=1)])
        predicted=np.array([s['d_sigma_nm'] for s in measured['spots']]+[measured['angles'][0]['sigma_deg']])
        relative=abs(actual/predicted-1)
        assert relative.max()<.01
        unknown=measure_geometry(centre.tolist(),spots,mapping)
        assert all(s['d_sigma_nm'] is None and s['uncertainty_status']=='UNKNOWN' for s in unknown['spots'])
        return dict(classification='verified_first_order_declared_model', trials=count, seed=20261101,
                    input=dict(centre=centre.tolist(),spots=spots,calibration=spec,centre_sigma=cs.tolist()),
                    analytic=predicted.tolist(),monte_carlo=actual.tolist(),max_relative_difference=float(relative.max()),
                    missing_centre_uncertainty='UNKNOWN',full_geometry=measured)

    def covariance_and_endpoint(self):
        # A single common camera-length error changes both axes by one factor.
        # Every angle is EXACTLY invariant, not merely invariant to first order.
        spec=dict(mode='explicit',scale_xy=[1.,1.],scale_sigma_xy=[.01,.01],unit='1/nm',
                  convention='cycles_per_length',basis='Counterexample: a common isotropic scale error cannot be represented by independent XY SD')
        spots=[dict(id='a',xy=[10.,10.],sigma_px=[0.,0.]),dict(id='b',xy=[10.,-10.],sigma_px=[0.,0.])]
        result=measure_geometry([0.,0.],spots,calibration_map(spec),[0.,0.])
        sigma=result['angles'][0]['sigma_deg']
        assert sigma>.8
        # Folded near-parallel angle: linearized unwrapped SD is not the SD
        # of the nonnegative measurement, exactly as the output warning says.
        spec['scale_sigma_xy']=[0.,0.]
        spots=[dict(id='a',xy=[100.,0.],sigma_px=[0.,.1]),dict(id='b',xy=[200.,0.],sigma_px=[0.,.1])]
        end=measure_geometry([0.,0.],spots,calibration_map(spec),[0.,0.])
        rng=np.random.default_rng(71); n=200000
        angle=np.abs(np.arctan(rng.normal(0,.1,n)/100)-np.arctan(rng.normal(0,.1,n)/200))*180/np.pi
        return dict(classification='unsupported_covariance_and_documented_nonlinearity',
                    shared_isotropic_scale_exact_angle_sigma=0.,independent_xy_model_sigma=sigma,
                    endpoint_linearized_sigma=end['angles'][0]['sigma_deg'],endpoint_mc_sigma=float(angle.std(ddof=1)),
                    endpoint_mc_mean=float(angle.mean()),warning=end['angles'][0]['uncertainty_method'],
                    conclusion='No bug in the declared independent-XY linearized model; correlated scale and folded endpoints require a different input/output uncertainty model.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,
        default=ROOT/'analysis'/('algorithm-audit-round2-gpa-'+str(time.time_ns())))
    args=parser.parse_args(); a=Audit(args.output)
    for name in ('spatial_transfer','saved_nonuniform','mixed_carriers','noise_acceptance','reference_components','uncertainty','covariance_and_endpoint'):
        a.run(name,getattr(a,name))
    print('EVIDENCE_DIR='+str(a.out))
    sys.exit(any(r['execution']!='PASS' for r in a.rows))
