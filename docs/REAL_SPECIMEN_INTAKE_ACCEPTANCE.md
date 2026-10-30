# Issue #43 stage-one preparation evidence

2026-10-31. Base: current `main` at
`9fbc769f95fc54c334d553d6ec2824d2dd2feb65` (reviewed F3b #42).
The branch is independent of algorithm development and does not move main or
the frozen R3 baseline. Instructions: [private intake](REAL_SPECIMEN_INTAKE.md).

Stage-one status: **DATA_INTAKE_READY**. All inputs used here are public synthetic
fixtures generated into ignored private directories. No actual specimen was
loaded or uploaded. This is not REAL_SPECIMEN_PASS.

| Executed check | Result / scope |
| --- | --- |
| `python -B tests/specimen_intake_test.py -v` in the independent environment | 22 PASS, 1 explicit SKIP, 0 FAIL. Includes actual pinned optional DM file decoding, signed/origin metadata comparison, TIFF page selection, truncation, bad hashes/axes/calibration, nonfinite values, read authorization, source invariance, report no-overwrite, path boundaries and retained unknowns. Actual link creation requires an unavailable Windows privilege; that one test is not counted as passed. |
| Source CLI `dry-run` | PASS using the existing public F3b cosine generator, synthetic declaration, negative-Y anisotropic scale, private reports and unchanged input hashes. No scientific analysis or private input. |
| Built-package CLI `dry-run` | PASS from `dist/tools/specimen_intake.py`; bundled templates and generator resolve after the final build. |
| `npm test` | 318 PASS, 6 existing conditional SKIP, 0 FAIL. Includes fresh TypeScript build; existing runtime/contracts/Panel checks are synthetic, not GUI gestures. |
| `npm run typecheck` and final `npm run build` | PASS. No scientific TypeScript or kernels changed. |
| `npm run test:science` | PASS for the existing actual stdio/Python TIFF→signed calibration→ROI FFT→measurement→NPY/direct DFT→display revision→restart recovery→Panel HTTP smoke. Public synthetic input only; HTTP is not gesture acceptance. |
| Private directory ignore checks and `git diff --check` | PASS. Dry-run images, source hashes, filled manifests, reports and logs remain ignored. Only blank templates, source/tests and generic documentation are proposed for publication. |

The first targeted suite had one FAIL because its new test declared the wrong
shape for the existing public DM fixture. The preflight correctly rejected it.
The test declaration was corrected to the generator's actual shape; no reader,
scientific tolerance or expected physical result was changed to hide the failure.
Subsequent checks and the final expanded suite pass within the scope above.

These commands were executed locally on Windows; hosted checks are reported on
the PR separately. They do not establish macOS/Linux execution, exact peak-memory
residency, atomic source snapshots, genuine acquisition origin, CIF/reference
correctness, full scientific-protocol execution or independent physical truth.

Actual specimen availability/admission, real-data numerical comparison,
independent crystallographic interpretation, real material strain/twin accuracy,
GUI gestures, fresh-model combined-Skill use and feature-specific interruption
injection remain **NOT_TESTED**. Scientific journals, historical reports and
arrays retain their original semantics. Issue #43's second stage remains open.
