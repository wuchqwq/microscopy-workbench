# DC/background numerical repair: execution and boundaries

Source: unmerged #61 `31e0edeca7a9e07b8ec575e0781dfea5dec1ab0a`, tree
`be6b655b96965000a345d0fb99ac674a34d9c790`. Independent worktree/branch
`fft-dc-contrast-fix-20261102` / `fix/fft-dc-roundoff`. Read AGENTS.md first.
Remote main is still `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`; #54 is separate.
The unmerged dependency chain is #57 -> #58 -> #59 -> #60 -> #61. #62 is an
independent audit, not a production dependency. Shared developer worktree was
clean at `a6233f48dffbceea64d337fb8c4028ab489249cb` and was not changed.

## Confirmed implementation bug and minimal correction

`tools/image_peaks.py::numerical_contrast` compared non-DC amplitude variation
using only non-DC magnitude as its roundoff scale. The actual FFT producer
(`tools/image_workspace.py`, FFT action) also processes the retained background.
For exactly representable float32 B100+unit delta at(25,20), the independent
analytic non-DC modulus is1; the DC value is396901. Actual old default-refinement
saved chain returns15 peaks and feature valid/14 families. With explicitly
integer refinement, the separately retained two-ROI fixture yields valid/12
families. These are different specified requests, not an inferred library drift.

New detector v3 uses the complete saved FFT L2 scale, including DC and excluded
coefficients, computed in max-scaled arithmetic. The prior scalar
`2*k*u/(1-k*u)` is unchanged. Neither FFT values nor mean/window settings, user
relative threshold, 3x3 maxima, NMS, refinement or downstream algorithms change.
The conditional normwise derivation and competing options were written before
production changes in [FFT_DC_ROUNDOFF_DESIGN.md](FFT_DC_ROUNDOFF_DESIGN.md).
This remains an explicitly uncertified numerical abstention policy; it is not a
proved PocketFFT error bound, per-peak significance or physical qualification.

The same saved original FFT can now produce a new v3 peak object with0 peaks;
the original v2 result and interpretation remain readable. Automatic new
measurements/features/comparisons reject old v2 detector admission; explicit
atlas/joint revisions use existing cache/version checks to reuse FFTs and create
new peaks. No old arrays, requests, object metadata or tolerances are rewritten.

## Independent truth, original failures and tradeoff

For actual B+A*delta samples, `F(k)=B*N*1[k=0]+A*exp(-2*pi*i*k.r)` is the oracle.
Mean removal changes only DC in exact arithmetic; probes also record the two
actual preprocessed floating values to separate preprocessing from FFT error.
No inverse FFT or tested detector generates this truth. Supported TIFF input
is uint16/float32. Other supported internal scalar types (uint8/uint32/signed
integers/float64) are separately exercised at the numerical layer; float64 TIFF
was correctly refused and that failed harness attempt is preserved.

The new5-test regression file first failed against frozen behavior with212
failing subcases; original stderr and source are retained. After the scale
correction all5 pass, covering zero/nonzero/large backgrounds, pulse location,
odd/even/rectangular dimensions, input quantization to a constant, explicit
subtract_mean true/false, large/small finite scales, and actual weak cosines.

There is a real conservative cost: zero-background delta plus spectral increment
d=1e-12 was admitted by v2 but withheld by v3; d=1e-11/1e-9 controls survive.
The source cosine amplitude is2*d/N, not d. Original v2 expectations/results
and the two pre-existing weak-test failures after correction remain archived;
their new expectations explicitly record the changed versioned policy. No
coefficient was changed to make a weak example pass. Ordinary B100 source
cosine amplitude.001 retains its expected4 peaks/2 families.

## Actual executed acceptance

All50 installed Python package versions match #57's exact package list;
NumPy2.5.4/SciPy1.18.1, Python3.13.18 on macOS arm64. npm ci uses unchanged
package-lock, TypeScript5.9.3; Node24.22.2/npm11.19.1. Logs and version/hash
records are in `fft_dc_roundoff_evidence/`.

| Check | Actual result |
| --- | --- |
| New deterministic matrix + existing peak/atlas/joint/feature/domain/increment/active/spatial/automation | 88 Python tests in11 suites PASS |
| Fresh old-v2 and new-v3 TIFF→atlas→measurement→feature→local-comparison | 24 public worker calls each; uint16/float32 delta and weak periodic controls, both mean settings |
| Genuine v2 histories at original bound paths | 174 completed original requests;384 logged public calls plus174 exact original-request replays;545 original files unchanged;12 FFT IDs reused |
| Actual new stdio/Python DC smoke | 24 formal calls PASS; saved FFT equality, newv3 peaks, field statuses, fresh-client recovery |
| Existing science and field stdio/HTTP smoke | PASS |
| Build/typecheck/full Node suite | PASS;409 PASS/5 conditional SKIP/0 FAIL |
| Independent GPT-6.1 Sol | 288 numerical probes,12 independent Decimal truth controls,24 baseline worker calls; final original-FFT reuse, fresh source chain,48 historical reads/recoveries |

Independent final review protected450 original files before adding4 explicit
new requests to its old workspace; all original bytes unchanged,24 new files
listed separately. Input FFT hashes exactly match old saved arrays. Reviewer
also verified that `detect` and `run` functions are byte-identical to #61; only
version/policy and numerical_contrast changed. This round used Sol for bounded
independent work, not an unperformed Astra review.

Harness failures are preserved, not counted as scientific bugs: unsupported
float64 TIFF import; the new stdio harness first supplied a write request_id to
read-only image_info, then used Python's query_request_id instead of formal MCP's
request_id for image_result. Product contracts correctly refused both. Corrected
fresh smoke succeeds without changing production transport. The existing macOS
temp-path alias issue is avoided with an explicit canonical TMPDIR, not by
editing saved paths. Browser gestures and real-material accuracy are NOT_TESTED.

## Four distinct outcome classes and a design stop

1. **Confirmed implementation bug:** omitted transform energy in numerical
   contrast admission; exact analytic counterexample above. This is the sole
   production correction here.
2. **Measurement uncertainty:** conservative near-roundoff withholding and
   input quantization are explicit. Broader stochastic measurement errors are
   evaluated in the separate preregistered controlled-noise increment, not
   claimed qualified here. insufficient_evidence is a legitimate result.
3. **Method limitation:** one genuine spectral variation can open the global
   gate while other rounding extrema remain. Independent impulse+one tone
   d=1e-9 returns15 candidates despite only two added tone bins. `valid` denotes
   usable numerical observations, not calibrated reliability or lattice truth.
   A per-candidate numerical/statistical admission or semantic split would
   change the evidence contract: **paused pending discussion**, with alternatives
   and costs in the design document. No hidden follow-on threshold tuning.
4. **Non-identifiability:** finite image frequencies cannot uniquely determine
   material identity, defect/3D structure, or distinguish superposed textures
   from one lattice without additional assumptions. This is not a software bug.

## Reproduce and inspect

Run `python -B tests/test_fft_dc_roundoff.py -v` and the affected suites. For a
new synthetic saved chain run `python -B tests/fixtures/fft_dc_saved.py create NEW`.
Set MICROSCOPY_TEST_REPOSITORY to the frozen #61 checkout for genuine v2
production; then unset it and run `... history OLD NEW_REPORT` from new code.
Keep old workspace paths unchanged. Build then run
`node dist/tests/fft-dc-science-smoke.mjs` with MICROSCOPY_PYTHON pointing to the
locked environment and MICROSCOPY_SMOKE_OUTPUT a new absolute directory.

The evidence archives map original relative names to exact text plus SHA-256;
all binary source/array hashes are indexed, synthetic generators retained.
Large arrays and private runtime capability files remain local. Only public
synthetic inputs were used. Reports never claim all remaining peaks are real.
