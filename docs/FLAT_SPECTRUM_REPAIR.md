# Numerical contrast admission for FFT peak candidates

Repairs audit #53 A03 after separate occupancy (#59) and topology (#60) fixes.
Base is #60 `7b48520a92fb086dbf29572a49c580bdb7292b64`; original counterexample
was reproduced on frozen #59 `f05b32f…` before editing. Unmerged dependencies
are explicit; main and the running shared workspace are not changed.

## Original error and counterexamples

`tools/image_peaks.py::detect` required amplitude strictly greater than its
3×3 minimum. For a single off-origin impulse, the mathematical DFT modulus is
constant, but floating-point ripples could satisfy that inequality. The original
63² float32 image has one unit pixel at (25,20), window none, no mean subtraction,
threshold_rel=1, integer-bin refinement. NumPy 2.5.4 independently reproduced
false peaks and a saved `spatial_field` marked valid with four families. The
earlier audit's prose said two families, but its preserved raw response also
records four under NumPy 2.5.4/SciPy 1.18.1. That was a reporting error, not
evidence of environment-dependent family counts; the original raw record is
unchanged. Any such detected family contradicts the known flat spectrum.

The oracle is the analytic DFT of a translated delta, not a round trip. Its
modulus is |A| for every frequency. Multiplying that delta by a Hann window
changes only A; mean subtraction with no window changes only DC. Scale, flip,
rotation, translation, odd/even/prime/rectangular grids and float32/64 source
storage are tested. The worker explicitly computes FFT from float64 input.

## Narrow numerical policy, with an explicit limitation

Detector version 2 adds only a numerical contrast admission before the existing
relative threshold, 3×3 maxima, separation and refinement rules. User scientific
thresholds and saved arrays are unchanged. There is no new detector engine.

For shape (h,w), use binary64 u=2^-53, nominal depth
`k=8*(ceil(log2(h))+ceil(log2(w)))`, gamma=k*u/(1-k*u). Normalize compared
amplitudes by their maximum, then require span>2*gamma. The comparison support
is the union of eligible candidates' 3×3 neighborhoods, excluding exact DC.
Unresolved span produces no peaks, with explicit `insufficient_evidence` and
`unresolved_numerical_contrast`. New fields become insufficient; local comparison
uses its existing `insufficient_geometry` state and accepts no candidate angle.

**This is a versioned conservative resolution policy, not a certified PocketFFT
forward-error bound.** Eight is a nominal allowance for complex arithmetic per
stage, not a count of the selected mixed-radix/Bluestein codelet. It is not fitted
to an individual image and is not a user-adjustable SNR threshold. True contrast
near machine resolution can be withheld: a prescribed relative 1e-14 peak is
explicitly unresolved, while 1e-12 and 1e-9 controls survive. No absence of
periodicity/material follows. Passing the guard does not validate each local
maximum, noise significance, lattice structure or crystallinity.

External sources checked 2026-11-02:
[Higham, Accuracy and Stability, 2nd ed. (2002), §24.1/Theorem 24.2](https://epubs.siam.org/doi/10.1137/1.9780898718027.ch24)
analyzes radix-2 FFT stability with assumptions on twiddle accuracy;
[FFTW accuracy discussion](https://fftw.org/accuracy/comments.html) explains why
accuracy depends on algorithm and twiddle generation. These motivate depth and
precision scaling, but do **not** prove our coefficient or an infinity-norm
bound for arbitrary PocketFFT. Actual NumPy 2.5.4/SciPy 1.18.1 are locked.

Independent review found a strong positive that defeated the first draft:
on a 7² image, exclude_dc_radius_bins=4 leaves four equal-height corner peaks of
two real cosines; the eligible-only span is zero despite clear lower neighbors.
The corrected support above matches the detector's comparison neighborhoods.
Actual 7/9/11 cases now return all four true peaks. Original draft failure,
legacy success, identical source hash, and corrected public calls are retained.
This changes the support definition, not a tolerance to rescue the example.

## Historical records and cached observations

- Missing detector version remains historical. Original requests, peak tables,
  fields, comparisons, interpretation and hashes are not rewritten or re-run
  during get/result/retry. Existing historical derivation validators stay intact.
- New automatic peak measurements, features/comparisons and field/domain/active
  continuations refuse legacy unassessed peak evidence with
  `LEGACY_PEAK_DETECTION`. They do not turn it into new qualified evidence merely
  by deriving another object. Explicit manual measurement overrides retain their
  caller-defined meaning and provenance; they are not automatic detection.
- Explicit new atlas/joint revisions reuse exact FFTs but redetect old peaks,
  preserving original request settings. Current v2 caches may still be reused.
  Single FFT users can explicitly run `image_peaks` with a new request ID.
- Independent review found an interrupted joint-upgrade recovery gap: the new
  child used an old FFT, while inspection searched only a nonexistent new FFT
  child. Recovery now qualifies the exact predecessor frame/ROI/settings first,
  then reports the committed new children. Same failed original request was
  queried before/after, with every workspace byte unchanged; no replay/resume.

## Actual execution

Exact 50-package inherited Python environment and npm ci/package-lock were used.
`flat_spectrum_evidence/` packages raw original failures, proposals, executed
requests/results/logs, independent review and source/array hashes. Scientific
binary arrays remain in isolated local analysis directories; synthetic generators
and all hashes are retained. No private specimen was used.

| Check | Actual outcome |
| --- | --- |
| Numeric suite | 6 PASS, including delta transformations, weak true peaks and equal true corners |
| Existing peak/atlas/joint/feature/domain/increment/active/spatial/automation suites | 77 PASS, including new interruption regression |
| Fresh saved atlas→feature→comparison and spatial→domain chain | 14 calls; impulse insufficient, two-period positive valid |
| Genuine #59 old saved chain + explicit revisions | 106 completed records, 228 reads/recoveries/new calls; 367 original files unchanged, eight original FFTs reused |
| Public stdio MCP feature/Panel HTTP + science smoke | PASS |
| Node full suite / typecheck / build | 409 PASS, 5 optional SKIP; typecheck/build PASS |
| GPT-6-astra independent checks | 52 numerical + 10 saved calls, 24 mean/scale impulse controls, 18 contrast-boundary cases, 12 corner public calls, legacy gate/joint recovery probes |

Failed harness attempts are preserved: a missing display_feature in an independent
probe, a worker result-query key, expected `insufficient_evidence` versus the
existing comparison enum `insufficient_geometry`, and direct NumPy float32 FFT
versus the worker's required complex128/float64 path. None changed scientific
acceptance rules. An existing spatial-test path-string assertion fails under
macOS /var→/private/var aliases on both frozen #59 and current code; all 13 pass
using an explicit canonical TMPDIR. No object path/hash was edited. Sandbox Panel
startup failed in the initial field smoke; a separately approved fresh synthetic
workspace passed. Browser visual/gesture acceptance remains **NOT_TESTED**.

Reproduce: `python -B tests/test_flat_spectrum.py -v`; then
`python -B tests/fixtures/flat_spectrum_saved.py create FRESH_OUTPUT`.
Set MICROSCOPY_TEST_REPOSITORY to a frozen pre-fix checkout to produce genuine
legacy records, then unset it and run `... history OLD_OUTPUT FRESH_REPORT`.
Keep the original workspace paths and files intact.

Real-material accuracy, statistical detection thresholds, full mixed-radix FFT
error certification and weak-signal completeness are **NOT_TESTED**. Noise and
imaging transfer can still produce numerically resolved peaks; supplied
candidate compatibility remains conditional and may be ambiguous.
