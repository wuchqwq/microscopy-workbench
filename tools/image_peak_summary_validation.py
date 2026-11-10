"""Read compatibility for four saved coherence diagnostics, not decisions."""
from collections import Counter
import copy
from decimal import Decimal as D, ROUND_HALF_EVEN, localcontext
import math
import numpy as np

POLICY = 'saved-band-coherence-reduction-read-v1'
RECEIPT_KEY = 'peak_summary_read_validation'
FIELD = 'amplitude_weighted_phase_coherence'
REGIONS = ('roi_rect', 'reference_rect')
ARRAYS = ('amplitude', 'phase_demodulated_wrapped', 'valid_phase', 'low_amplitude')
MAX_SAMPLES = 65536
GUARDS = dict(minimum_valid_pixels=9, minimum_valid_fraction=.9,
              minimum_phase_coherence=.9, statistical_confidence=False)


def _sincos(value):
    x = D.from_float(value)
    sine = st = x
    cosine = ct = D(1)
    for k in range(1, 160):
        st *= -x*x / ((2*k)*(2*k+1))
        ct *= -x*x / ((2*k-1)*(2*k))
        sine += st; cosine += ct
        if abs(st) < D('1e-90') and abs(ct) < D('1e-90'):
            return sine, cosine
    raise ValueError('Saved-band Decimal reference did not converge')


def coherence_interval(amplitude, phase):
    """Independent weighted reference, absolute cancellation/underflow bounds."""
    a, p = np.asarray(amplitude).ravel(), np.asarray(phase).ravel()
    n = len(a)
    if len(p) != n or n > MAX_SAMPLES:
        raise ValueError('Saved-band reference sample resource limit/layout')
    if not np.isfinite(a).all() or not np.isfinite(p).all() or np.any(a < 0) or np.any(np.abs(p) > math.pi):
        raise ValueError('Invalid saved amplitude or wrapped phase in reference')
    with localcontext() as context:
        context.prec = 80; context.rounding = ROUND_HALF_EVEN
        total = real = imag = D(0)
        units = {}
        # Grouping accelerates only this oracle; roundoff uses original n.
        for (weight, angle), count in sorted(Counter(zip(map(float, a), map(float, p))).items()):
            if angle not in units: units[angle] = _sincos(angle)
            sine, cosine = units[angle]
            weighted = D.from_float(weight)*count
            total += weighted; real += weighted*cosine; imag += weighted*sine
        if total == 0:
            return dict(n=n, lower='0', upper='0', reference='0', weight_sum='0',
                        magnitude='0', relative_weight_error='0', zero_weight=True)
        u, eta = D(2)**-53, D(2)**-1074
        gamma = lambda k: k*u/(1-k*u)
        magnitude = (real*real+imag*imag).sqrt()
        oracle = n*D('1e-70')*total
        component = gamma(n+4)*total + 2*n*eta/(1-(n+4)*u)
        denominator = gamma(n-1)*total + n*eta/(1-(n-1)*u) + oracle
        if denominator >= total:
            raise ValueError('Saved-band denominator unresolved under underflow bound')
        vector = D(2).sqrt()*component
        norm = vector + 2*u*(magnitude+vector) + eta + oracle
        lower = max(D(0), (magnitude-norm)/(total+denominator)*(1-u)-eta)
        upper = (magnitude+norm)/(total-denominator)*(1+u)+eta
        return dict(n=n, lower=str(lower), upper=str(upper), reference=str(magnitude/total),
                    weight_sum=str(total), magnitude=str(magnitude),
                    relative_weight_error=str(denominator/total), zero_weight=False)


def validate_diagnostics(saved, expected, arrays, seed, info, api):
    """No tolerance outside coherence slots; no status/null/action rejudgment."""
    if api.canonical(expected['peak_comparison']['summary_guards']) != api.canonical(GUARDS):
        raise ValueError('Unknown saved-band summary guard version')
    if api.canonical(saved) == api.canonical(expected):
        return dict(policy_version=POLICY, route='exact', changed_fields=[])
    left, right = copy.deepcopy(saved), copy.deepcopy(expected)
    if len(left['peak_comparison']['peaks']) != 2 or len(right['peak_comparison']['peaks']) != 2:
        raise ValueError('Saved-band comparison layout changed')
    changed = []
    for i in range(2):
        for name in REGIONS:
            a = left['peak_comparison']['peaks'][i]['regions'][name]
            b = right['peak_comparison']['peaks'][i]['regions'][name]
            for row in (a, b):
                if type(row[FIELD]) is not float or not math.isfinite(row[FIELD]):
                    raise ValueError('Nonfinite/non-float saved coherence')
            if a[FIELD] != b[FIELD]:
                changed.append(dict(band_index=i, region=name, field=FIELD,
                                    saved_value=a[FIELD], local_value=b[FIELD]))
            a[FIELD] = b[FIELD] = None
    if api.canonical(left) != api.canonical(right):
        raise ValueError('Non-allowlisted saved-band decision field changed')
    if any(arrays[k].dtype != np.float64 for k in ARRAYS[:2]) or any(arrays[k].dtype != np.bool_ for k in ARRAYS[2:]):
        raise ValueError('Unsupported saved-band reference array types')
    samples = sum(p['regions'][k]['valid_count'] for p in right['peak_comparison']['peaks'] for k in REGIONS)
    if samples > MAX_SAMPLES:
        raise ValueError('Saved-band reference sample resource limit')
    intervals = []
    for i in range(2):
        for name in REGIONS:
            x0, y0, x1, y1 = info[name]
            region = (i, slice(y0,y1), slice(x0,x1))
            valid = arrays['valid_phase'][region] & ~arrays['low_amplitude'][region]
            bounds = coherence_interval(arrays['amplitude'][region][valid], arrays['phase_demodulated_wrapped'][region][valid])
            if bounds['n'] != expected['peak_comparison']['peaks'][i]['regions'][name]['valid_count']:
                raise ValueError('Saved-band mask/count binding changed')
            low, high = D(bounds['lower']), D(bounds['upper'])
            if low <= D.from_float(.9) <= high:
                raise ValueError('Saved-band coherence interval crosses the 0.9 guard; compatibility refused')
            for decision in (saved, expected):
                point = decision['peak_comparison']['peaks'][i]['regions'][name][FIELD]
                if not low <= D.from_float(point) <= high:
                    raise ValueError('Saved-band coherence reduction envelope exceeded')
            intervals.append(dict(band_index=i, region=name, **bounds))
    return dict(policy_version=POLICY, route='coherence_reduction_compatibility',
                changed_fields=changed, intervals=intervals, original_sample_count=samples,
                source_gpa_object_id=seed['object_id'],
                source_arrays_sha256={k+'.npy': seed['files_sha256'][k+'.npy'] for k in ARRAYS},
                reference_precision_digits=80)


def validate(workspace, seed, info, saved, expected, api):
    if api.canonical(saved) == api.canonical(expected):
        return validate_diagnostics(saved, expected, None, seed, info, api)
    directory = workspace.root/'objects'/seed['object_id']
    hashes = {k+'.npy':seed['files_sha256'][k+'.npy'] for k in ARRAYS}
    api.need(all(api.sha_file(directory/k)==v for k,v in hashes.items()),
             'Saved-band source array hash changed', 'CORRUPT_OBJECT')
    arrays = api.gpa._arrays(directory, seed, api)
    receipt = validate_diagnostics(saved, expected, arrays, seed, info, api)
    api.need(all(api.sha_file(directory/k)==v for k,v in hashes.items()),
             'Saved-band source array hash changed during validation', 'CORRUPT_OBJECT')
    return receipt


def feedback(workspace, response):
    result = dict(response)
    result.pop(RECEIPT_KEY, None)
    records = list(getattr(workspace, 'peak_summary_read_validations', {}).values())
    if any(row['route'] == 'coherence_reduction_compatibility' for row in records):
        result[RECEIPT_KEY] = dict(policy_version=POLICY, records=sorted(records, key=lambda r:r['object_id']),
                                 saved_records_modified=False, science_dispatched=False)
    return result
