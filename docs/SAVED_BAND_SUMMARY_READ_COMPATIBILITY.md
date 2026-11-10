# Saved-band coherence reduction read contract v1

Policy: `saved-band-coherence-reduction-read-v1`, separate from GPA analytic
assessment compatibility. Only `peak_roi_comparison` plans under existing
`gpa-topology-decisions-v1` are eligible. Exact decision comparison stays first.
No original files, values, identities, journals or savepoints are rewritten.

## Closed scope and invariants

Only four numeric slots can differ: for each of two saved bands, ROI/reference
`amplitude_weighted_phase_coherence`. The rest of the complete decision remains
exact, including types, keys, status, nulls, amplitude/phase values, reference
text, source dependencies, parameters, counts, guards and costs. The existing
reader still verifies creator/manifest/payload hashes, IDs, frozen journals,
ROI/reference against submitted information, input refs, actions and budget.
The actual saved amplitude, demodulated wrapped phase and both masks are read
through the qualified GPA record. No image, FFT, GPA or historical summary is
regenerated or saved. Unknown versions/guards are refused.

## Independent reference and sample-dependent enclosure

For each region, let n be the exact number of valid, not-low-amplitude samples,
`S=sum(a_i)`, `Z=sum(a_i*(cos(phi_i)+i*sin(phi_i)))`, and `R=abs(Z)`.
Amplitude and phase inputs are exact stored binary64 values, not PNG values.
An independent 80-digit Decimal sine/cosine series on [-pi,pi] computes S/Z/R.
It groups identical stored samples only to accelerate the reference: **n is the
original sample count**, never the group count. A relative reference allowance
`n*1e-70` exceeds accumulated decimal rounding/series error. Positive weights
avoid cancellation in S; cancellation in Z is explicitly retained.

At 80 digits, decimal unit roundoff is below 1e-79. Each bounded series uses
fewer than 1000 arithmetic operations; the sum of absolute terms is below
exp(pi)<24. Its rounding contribution is below roughly 2.4e4*1e-79 per unit
weight, with an alternating tail below 1e-90. Weighted accumulation and norm
rounding add O(n*1e-79)*S. The n*1e-70*S allowance conservatively covers both,
including cancellation, and remains far below the binary64 reduction bound.

Define `u=2^-53`, `eta=2^-1074`, `g(k)=k*u/(1-k*u)`, and:

```
E = g(n+4)*S + 2*n*eta/(1-(n+4)*u)
D = g(n-1)*S + n*eta/(1-(n-1)*u) + n*1e-70*S
H = sqrt(2)*E + 2*u*(R+sqrt(2)*E) + eta + n*1e-70*S
L = max(0, (R-H)/(S+D)*(1-u)-eta)
U = (R+H)/(S-D)*(1+u)+eta
```

E bounds each complex sum component: at most 2u absolute unit-function error,
one rounded amplitude product, and a conservative n-1 addition chain fit
g(n+4); absolute eta terms cover product/addition underflow. This bounds any
ordinary reduction tree without assuming NumPy's chosen pairwise layout.
D bounds the positive weight reduction. The norm is 1-Lipschitz, giving
sqrt(2)*E, followed by a 2u norm-evaluation envelope and final division rounding.
Both saved and local coherence values must independently lie in [L,U]. This is
an **enforced numerical envelope**, not a universal guarantee for every libm.

The use of S rather than R in E is essential: near cancellation, relative error
in Z can be arbitrarily large while the absolute coherence interval remains
meaningful. Bounds grow with n and report R/S and D/S; no fixed tolerance is
chosen from the observed fixtures. If S-D<=0, the denominator is unresolved and
compatibility is refused. Empty/zero-weight regions retain exact zero coherence.
Valid amplitudes must be finite/nonnegative and phase finite in the wrapped
range. Compatibility reference work is capped at 65536 sampled entries per
plan as an explicit read-resource limit, not a scientific threshold.

The sine/cosine series and alternating remainder are described by
[NIST DLMF](https://dlmf.nist.gov/4.19). NumPy documents reduction precision and
possible partial pairwise summation in its [sum reference](https://numpy.org/doc/stable/reference/generated/numpy.sum.html).
These sources do not supply this policy's error budget or a material confidence
level; the enclosure above is derived for the stated arithmetic model and
independently enforced on returned scalars.

## The 0.9 boundary cannot be rejudged

On any compatibility read, every nonempty participating region is checked.
If [L,U] contains the exact binary64 value of the existing 0.9 guard, the read is
refused even if both platforms happened to emit the same status. Status/nulls
must additionally match the saved decision exactly. The reader never changes
historical admission or actions, and does not treat a threshold ambiguity as a
new measurement result. Exact-only historical reads keep their existing path.

## Traceability

An ephemeral `peak_summary_read_validation` receipt exposes the policy, exact
or compatibility route, original plan manifest hash, bound source array hashes,
changed fields, n, S/Z reference diagnostics and the independent intervals.
Full get/result and compact reads retain compatibility receipts. Exact-only
public response shapes remain unchanged. Failed validation returns no success
receipt. GPA analytic receipts remain separate. Neither policy changes physical
interpretation, summary precision or the contents of a saved historical record.
