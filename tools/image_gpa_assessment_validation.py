"""Versioned read validation of 37 analytic v1 GPA assessment floats only.

See docs/GPA_ANALYTIC_READ_COMPATIBILITY.md. No arrays, measurement summaries,
statuses, parameters or saved records are approximately compared or modified.
"""
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import math

POLICY = 'gpa-analytic-binary64-read-v1'
ALGORITHM = 'classical-two-g-gpa-finite-v1'
RECEIPT_KEY = 'gpa_analytic_read_validation'
PERIODS = (8, 16, 32, 64, 128, 256, 512)


def _same(a, b):
    if type(a) is not type(b):
        return False
    if type(a) is dict:
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    if type(a) is list:
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    return (type(a) is not float or math.isfinite(a)) and a == b


def _atan(x):
    term, total = x, x
    for n in range(1, 200):
        term *= -x*x
        add = term / (2*n+1)
        total += add
        if abs(add) < Decimal('1e-90'):
            return total
    raise ValueError('Decimal arctangent reference did not converge')


def _sin(x):
    term, total = x, x
    for n in range(1, 100):
        term *= -x*x / ((2*n)*(2*n+1))
        total += term
        if abs(term) < Decimal('1e-90'):
            return total
    raise ValueError('Decimal sine reference did not converge')


def _oracle(sigmas):
    """80-digit references; exact binary64 sigma, no local libm oracle."""
    with localcontext() as ctx:
        ctx.prec = 80
        ctx.rounding = ROUND_HALF_EVEN
        pi = 16*_atan(Decimal(1)/5) - 4*_atan(Decimal(1)/239)
        sigma = [Decimal.from_float(v) for v in sigmas]
        result = {}
        root = ('spatial_transfer',)
        for j, s in enumerate(sigma):
            result[root+('nominal_untruncated_gaussian_real_space_fwhm_pixels', j)] = ((2*Decimal(2).ln()).sqrt()/(pi*s), 12)
        for i, period in enumerate(PERIODS):
            k = Decimal(1)/period
            x = 2*pi*k
            derivative = _sin(x)/x
            prefix = root+('response_samples', i)
            result[prefix+('central_difference_gain_1d',)] = (derivative, 8)
            for j, s in enumerate(sigma):
                # Branch admission stays exactly the current binary64 cutoff.
                gain = (-(k/s)**2/2).exp() if 1./period <= 3.*sigmas[j] else Decimal(0)
                result[prefix+('phase_gain_per_reflection', j)] = (gain, 20)
                result[prefix+('first_order_strain_gain_1d_per_reflection', j)] = (gain*derivative, 30)
        return result


def validate(saved, duplicate, expected, report):
    """Return a receipt or reject; inputs are never changed."""
    if report.get('algorithm') != ALGORITHM:
        raise ValueError('Unknown GPA analytic validation algorithm version')
    if not _same(saved, duplicate):
        raise ValueError('GPA assessment copies disagree')
    if type(saved) is not dict or type(saved.get('semantics_version')) is not int or saved['semantics_version'] != 1:
        raise ValueError('Unknown GPA assessment semantics version')
    if _same(saved, expected):
        return dict(policy_version=POLICY, route='exact', changed_fields=[])
    references = _oracle(report['mask']['sigma_cycles_per_pixel'])
    changed = []
    with localcontext() as ctx:
        ctx.prec = 80
        ctx.rounding = ROUND_HALF_EVEN
        u = Decimal(2)**-53

        def compare(a, b, path=()):
            if type(a) is not type(b):
                raise ValueError('GPA assessment type changed: '+str(path))
            if type(b) is dict:
                if a.keys() != b.keys():
                    raise ValueError('GPA assessment fields changed: '+str(path))
                for key in b:
                    compare(a[key], b[key], path+(key,))
            elif type(b) is list:
                if len(a) != len(b):
                    raise ValueError('GPA assessment layout changed: '+str(path))
                for i, (x, y) in enumerate(zip(a, b)):
                    compare(x, y, path+(i,))
            elif path in references:
                reference, operations = references[path]
                if type(a) is not float or not math.isfinite(a) or not math.isfinite(b):
                    raise ValueError('Nonfinite/non-float GPA analytic value: '+str(path))
                if reference == 0:
                    if a != 0. or b != 0.:
                        raise ValueError('GPA zero transfer changed: '+str(path))
                    return
                bound = abs(reference) * (operations*u/(1-operations*u) + Decimal('1e-70'))
                if any(abs(Decimal.from_float(v)-reference) > bound for v in (a, b)):
                    raise ValueError('GPA analytic roundoff envelope exceeded: '+str(path))
                if a != b:
                    changed.append(dict(field='/'.join(map(str, path)), saved_value=a, local_value=b,
                                        reference_decimal=str(reference), absolute_bound_decimal=str(bound),
                                        operation_budget=operations))
            elif not _same(a, b):
                raise ValueError('Non-allowlisted GPA assessment field changed: '+str(path))

        compare(saved, expected)
    return dict(policy_version=POLICY, route='analytic_compatibility', changed_fields=changed,
                reference_precision_digits=80, binary64_unit_roundoff='2^-53')


def feedback(workspace, response):
    """Fresh read receipt, never a replacement for a saved response/manifest."""
    result = dict(response)
    result.pop(RECEIPT_KEY, None)  # A persisted field cannot impersonate this read.
    records = list(getattr(workspace, 'gpa_read_validations', {}).values())
    if any(row['route'] == 'analytic_compatibility' for row in records):
        result[RECEIPT_KEY] = dict(policy_version=POLICY, records=sorted(records, key=lambda r: r['object_id']),
                                 saved_records_modified=False, science_recomputed=False)
    return result
