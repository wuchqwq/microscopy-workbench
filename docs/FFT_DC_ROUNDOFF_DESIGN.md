# FFT roundoff: omitted full-transform scale

Base is unmerged #61 at `31e0edeca7a9e07b8ec575e0781dfea5dec1ab0a`,
tree `be6b655b96965000a345d0fb99ac674a34d9c790`. Main remains separately pinned;
#54 is not included. This design is written before modifying production code or
running the subsequent noise matrix. All inputs are new synthetic arrays.

## Reproduced implementation omission

For 63x63 float32 `I=100+delta(25,20)`, none window, no mean removal,
max_peaks16/min_separation_bins16, the actual saved path returns15 peaks and a
valid feature with14 families. Analytically F(0)=396901 and every non-DC modulus
is1. Observed non-DC normalized span9.876099937855543e-12 exceeds the v2 guard
2.1316282072803233e-14. The guard scales only to selected non-DC amplitudes,
discarding the transform energy that causes roundoff. Mean removal changes the
conditioning; it must remain an explicit request, never a silent correction.

## Bounded choice and alternatives

1. **Selected local correction:** keep the existing neighborhood support, 3x3
   maxima, relative threshold, suppression, interpolation and FFT arrays.
   Scale the same nominal roundoff allowance by the complete saved FFT L2 norm,
   including DC and all excluded coefficients. Use max-scaled amplitudes to
   avoid overflow/underflow in norm and span arithmetic. New detector version3
   and policy name make old decisions historical; new requests cannot reuse
   v2 as current numerical admission. The existing explicit atlas/joint revision
   path can reuse the exact FFT and create new peak records.
2. Scaling only to abs(DC) or full-grid maximum is smaller but neglects other
   high-energy components. It has no general normwise justification; DC-only
   does not cover high-energy zero-mean spectra. Not selected.
3. A certified per-plan FFT error bound or a separately computed high-precision
   transform could offer stronger guarantees and fewer conservative rejections.
   This requires additional numerical work/cost and a new contract; not hidden
   inside this correction. No FFT replacement is implemented.

For a **hypothetical** normwise bound ||Fhat-F||2 <= eta ||F||2, reverse triangle
inequality gives ||F||2 <= ||Fhat||2/(1-eta). Each modulus error is bounded by
that vector error, so the error in a fixed support's max-minus-min is at most
`2*eta/(1-eta)*||Fhat||2`. We retain the previous scalar coefficient with nominal
`eta=k*u`, `k=8*(ceil(log2(h))+ceil(log2(w)))`, `u=2^-53`.

**eta is an uncertified engineering proxy, not a proved PocketFFT error bound.**
The conditional derivation explains the scale, not the coefficient or every
FFT plan. [Higham, 2nd edition (2002), Theorem24.2](https://epubs.siam.org/doi/10.1137/1.9780898718027.ch24)
is a normwise radix-2 result under twiddle-factor assumptions; the actual
NumPy2.5.4 PocketFFT includes other factorizations. [FFTW's official discussion](https://fftw.org/accuracy/comments.html)
also makes algorithm/twiddle dependence explicit. Sources checked2026-11-02.

Cost: a63x63 unit impulse has ||F||2=63, not1. A true **spectral** increment
1e-12 formerly admitted by v2 may now remain unresolved, while1e-9 is above this
policy scale. Its source cosine amplitude is2*d/(63*63), so spectral d must not
be confused with source amplitude. Background100 plus true source cosine
amplitude.001 remains readily measurable in independent probes. Near-boundary
rejections do not establish absence of periodicity. Retain old positive records
and report this tradeoff; do not loosen a coefficient to recover them.

## Design stop: global span is not individual peak qualification

Independent new counterexample: shifted unit impulse plus one phase-aligned
cosine with spectral increment1e-9. Its real peak makes the global span pass,
while other roundoff maxima can still be returned and counted as directions.
Pure noise likewise has genuine local maxima. Neither case is fixed by tuning
the global threshold; row status must remain hypothesized, not significance.

Two architecture choices require discussion, not an implementation in this PR:

- Keep detector/feature outputs as exploratory numerical texture observations;
  make a distinct downstream scientific admission explicitly unassessed. Restrict
  any consumer that reads `valid` as lattice confirmation. This is a semantic
  contract/migration task, not a new statistical test.
- Design per-candidate numerical prominence/resolution followed by a separately
  qualified noise/detection model, with defined window correlations, multiplicity,
  weak-signal tradeoffs and versioned outputs. Greater scope and validation cost;
  even a significant image frequency is not material identity.

Do not remove manual ROI/measurement or require whole-image discovery. Automatic
field validity must not become the reliable path's prerequisite. No GPA,
topology, twin, candidate database or experiment planner is rewritten. This
architectural part is paused; controlled-noise validation will describe outcomes
and limitations rather than train/tune a rule until all cases appear green.
