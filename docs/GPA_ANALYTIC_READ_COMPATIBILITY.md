# GPA analytic assessment read compatibility, policy v1

This is a new, narrowly scoped reader contract, not a change to old science
tolerances or saved evidence. Exact reconstruction remains the first path.
Historical files, IDs, parameters, arrays, assessment semantics and creator
responses are never migrated or rewritten by a read.

## Eligible version and exact bindings

Only `semantics_version: 1` assessments of
`classical-two-g-gpa-finite-v1` use `gpa-analytic-binary64-read-v1`.
Absent historical assessments stay absent; unknown versions are refused.
The original creator journal, manifest, every payload hash, dependency identity,
calibration and request parameters are still verified by the existing reader.
The assessment copies in metadata and report must agree exactly. Report mask
sigma must equal the submitted scalar sigma twice, with exact mask kind,
truncation and support radius. No caller selects a more permissive tolerance.

Dictionary keys, list lengths, types, statuses, flags, reasons, units, model
text, sigma, cutoff and fixed modulation periods remain exact. Only these
37 positive derived floats may use compatibility:

| `spatial_transfer` field | Entries | Relative envelope |
| --- | --- | --- |
| `nominal_untruncated_gaussian_real_space_fwhm_pixels[j]` | 2 | gamma(12) |
| `response_samples[i].central_difference_gain_1d` | 7 | gamma(8) |
| `response_samples[i].phase_gain_per_reflection[j]` | 14 | gamma(20) |
| `response_samples[i].first_order_strain_gain_1d_per_reflection[j]` | 14 | gamma(30) |

Here `i=0..6`, `j=0..1`, periods are exactly 8,16,32,64,128,256,512 pixels,
`u=2^-53`, and `gamma(n)=n*u/(1-n*u)`. Outside the exact aperture cutoff,
gain is exactly zero: zero never receives an absolute tolerance floor.
Nonfinite values, extra fields, type changes and larger errors are refused.

## Numerical basis and independent check

For the supported sigma range .002..05 and nonzero cutoff branch, let
`k=1/period`, `t=(k/sigma)^2/2`, and `x=2*pi*k <= pi/4`.
The rounded cutoff permits at most `t <= 4.5*(1+u)^2`, including the
one-rounding boundary case of `3*sigma`; the branch itself remains exact.
The period and k are exact powers of two. With round-to-nearest binary64 basic
arithmetic, division then squaring gives at most gamma(3) relative error in t.
Its propagation through exp is bounded by `exp(4.5*(1+u)^2*gamma(3))-1`.
Allowing up to 2u relative error for an elementary function evaluation leaves
this below gamma(20), including rounding cross terms. For sin(x)/x, pi/input
rounding, sine evaluation, denominator and division fit gamma(8); on this
interval the relative sine argument condition is at most one. The ln, sqrt,
pi, product and division chain in `sqrt(2*ln(2))/(pi*sigma)` fits gamma(12).
The phase/derivative product adds one rounding operation, fitting gamma(30).

These are an explicitly enforced compatibility envelope, **not** a claim that
every vendor libm/NumPy implementation satisfies a universal 2u guarantee.
On the compatibility path both saved and local floats must independently lie
within the envelope of an 80-digit Decimal reference. The reference uses exact
binary64 sigma (`Decimal.from_float`), Machin's arctangent identity for pi,
and the alternating sine series on x<=pi/4. Series stop below 1e-90; a 1e-70
relative oracle allowance exceeds decimal rounding/truncation accumulated by
these bounded (<1000-operation) calculations. It is negligible beside gamma(n)
and is not an absolute allowance near zero. No image data are reprocessed.

Python documents Decimal's correctly rounded elementary operations in its
[Decimal reference](https://docs.python.org/3/library/decimal.html).
The bounded sine/arctangent series are described by
[NIST DLMF computation methods](https://dlmf.nist.gov/4.45).
The operation budgets above are this reader's derived policy, not a tolerance
quoted from those sources and not calibrated experimental uncertainty.

## Read receipts and scope

The in-memory Workspace keeps per-GPA validation receipts with policy version,
route (`exact` or `analytic_compatibility`), manifest hash and changed-field
diagnostics. A successful get/result read that used compatibility exposes
`gpa_analytic_read_validation`; it is a fresh read receipt outside the immutable
stored record, never a field saved back into that record. Exact-only reads keep
their existing public response shape. A failed dependency yields no success
receipt. Reopening an unchanged record does not dispatch or replay science.

This policy does not authorize approximate comparisons of measured fields,
ROI reductions, method decisions, status dictionaries, FFTs, masks, parameters
or calibrations. It does not fix unrelated saved absolute display paths or
qualify material strain, phase identity or dislocations.

The separate [saved-band coherence contract](SAVED_BAND_SUMMARY_READ_COMPATIBILITY.md)
handles the observed ROI reduction issue with its own data-dependent reference
and bounds. This analytic policy is not reused as a reduction tolerance.
