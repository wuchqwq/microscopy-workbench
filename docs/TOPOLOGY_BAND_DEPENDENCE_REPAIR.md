# Cross-record Fourier support and topology v3

Repairs audit #53 D01 on fixed base #59
`f05b32f5ee659ce0fbab97998f6048364e56a454`, after separate GPA-boundary and occupancy
increments. No branch is merged and main/stable baseline is unchanged. Original
failure was independently reproduced on #58 `b238f972…` before the correction.

## Failure, cause and scientific interpretation

For a 256² synthetic image `cos(2π*.125*x-theta)+cos(2π*.125*y)`,
`theta=atan2(y-127.5,x-127.5)`, two fixed-g GPA objects use respectively
[(.125,0),(0,.125)] and [(.125,.004),(0,.125)], sigma .014, reference
[50,50,75,75]. Two loops [75,75,182,182] and [60,60,197,197] close around the
analytic winding. Old topology reports three direction families, b≈[8,0] and
`redundancy_validated=true`, despite only two distinct carrier observations.

The actual saved masks reuse 336/357 coefficients (94.1176%); normalized weight
inner product is about .9796933. A new counterexample at (-.125,.004) has **zero
direct overlap**, yet the same 336 shared conjugate coefficients and false old
redundancy. Object IDs and centre distance are therefore insufficient. The
original arrays/requests/reports/hashes and producer SHAs are preserved.

`image_topology._source_bundle_records` previously removed exact/conjugate g
aliases, while `image_topology_legacy_v1._direction_families` counted remaining
nonparallel vectors. An affine carrier change has zero closed-loop circulation;
nearly the same filtered phase can satisfy a slightly changed projected g row.
Leaving that row out checks algebraic consistency, not new observed information.

Fit dependence was checked explicitly: current topology accepts only fixed_g,
uses saved `phase_demodulated_wrapped` **before** reference constant/plane fitting,
and does not consume unwrapped displacement or strain. Shared reference fitting
is not the reproduced cause; raw overlapping Fourier support is.

External convention check: [NumPy 2.4 DFT reference](https://numpy.org/doc/2.4/reference/routines.fft.html),
retrieved 2026-11-02, specifies the negative forward exponent, shifted frequency
ordering and real-input conjugacy; tested NumPy is locked 2.5.4, whose actual
odd/even index behavior was independently checked. For filters M_i,M_j, shared
nonzero coefficients reuse the same linear observations, including their
conjugates. Disjoint support is only a necessary admission condition here:
windowing, correlated noise, image transfer and common model error can correlate
even disjoint bands. No physical independence theorem is claimed.

## Bounded repair

New public topology actions always use v3. They read hash-qualified saved
`mask_frequency.npy`, check shape/dtype/range, bind its file hash, and compare
actual nonzero supports modulo conjugacy after exact aliases are removed. The
existing within-GPA disjoint-support requirement now also applies across GPA
records. There is no overlap-percentage cutoff, centre-distance heuristic,
new scientific tolerance or object-ID independence rule.

If any retained pair shares support, every loop-group/global redundancy flag is
false and promoted `projected_topological_evidence` becomes
`constrained_candidate_without_redundancy`. Winding, fitted b, raw residuals and
arrays stay unchanged as dependent-channel diagnostics; all rows may reweight b.
LOO is explicitly algebraic consistency. Geometric direction count is retained
as geometry, never renamed an independent observation count. Other invalid,
partial, conflicting and zero-winding outcomes keep their narrower meanings.

Only integer counts and hashes enter the exactly reconstructed dependency.
Independent review identified possible BLAS reduction-order sensitivity in an
initial floating similarity diagnostic; it was removed before publication.
Original numeric diagnostics remain in the audit, without tolerance adjustment.

Frozen v1/v2 calculations and dependency serialization remain available for
historical reads. Existing method-plan v1 admission retains its old dependency
shape; any newly executed topology child nevertheless calls v3. A new explicit
`previous_topology_id` revision reevaluates existing saved phases; it does not
rewrite old interpretations or recompute FFT/GPA. Unknown algorithms fail.

## Executed evidence

Locked npm ci and the exact 50-package inherited Python environment were used.
See `topology_band_evidence/` for original baseline/proposal, exact execution
logs/requests, source/array hashes and GPT-6-astra independent review.

| Check | Actual outcome |
| --- | --- |
| Saved analytic source→FFT→GPA→topology | 5 cases; 22 creation + 10 recovery/read calls PASS |
| Direct and conjugate shifted overlap | Both downgraded; b/closure diagnostics retained |
| Three separated carriers / exact aliases / harmonic third | Positive / no extra redundancy / no extra direction PASS |
| Python topology suite including v1 export/revision | 67 PASS |
| Existing method policy/accounting/read-reuse | 19 PASS |
| Genuine historical v1/v2 + method-plan v1 | 9 targets, 18 reads; original files unchanged |
| Actual stdio MCP topology and method-loop | PASS; topology includes export, fresh recovery and Panel HTTP |
| Node full suite / typecheck / build / science smoke | 409 PASS, 5 optional SKIP; remaining checks PASS |
| Independent review | Six check groups: five odd/even grids, multi-group downgrade, exact unchanged v2 arrays/fits, forged promotion refusal |

The original topology smoke could not verify Panel launch in the sandbox. Its
request remains retained; no unknown launch was replayed. A separately approved
fresh synthetic test workspace completed the full smoke. Initial probe used
the nonexistent worker action `info`; corrected to public `get`, preserving
the failed run. One old test expected identical new/old dependency shape; it now
checks the explicit new mask dependency and unchanged historical subfields.
Neither correction changes scientific input or acceptance thresholds.

Run `python -B tests/fixtures/topology_band_dependence.py FRESH_DIRECTORY` and
`python -B -m unittest discover -s tests -p 'test_*topology*.py' -v`.
Old v1 fixtures were generated by genuine producer commit
`482565c88fe14ec0583c06f8bf34b239501eb032`, tree
`1169c9dfa5f8efb1fce705970296d04f8ba7a315`; v2/method fixtures by #58. Their original
paths stay bound and unchanged. No new threshold or edited historical object is
used to obtain passing results.

Actual browser visual/gesture behavior, real material dislocations, noise
independence, defect census and unique 3D Burgers interpretation are **NOT_TESTED**.
The remaining flat-spectrum pseudo-peak defect is the next separate repair.
