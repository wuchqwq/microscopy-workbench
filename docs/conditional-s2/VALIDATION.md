# Bounded engineering validation

This increment implements the accepted default-baseline plus optional S2 route.
It did not repeat the research matrix, train a model or run a physical simulation.
The five numerical function ASTs match the frozen research source. The separate
two-Poisson confidence diagnostic is excluded. New guards sit outside that core.

Environment: Python 3.13.2, NumPy 2.2.6, SciPy 1.15.3, Pillow 11.2.1,
tifffile 2026.3.3, Node 24.16.0. These satisfy `requirements-images.txt`;
the research environment with Pillow13 was not used. Existing TypeScript 5.9.3
was reused without installing dependencies. Build completed successfully.

| Evidence | Outcome |
| --- | --- |
| Python attempt1 | Sandbox temporary TIFF write denied; 0 fits/0 optimizers; original trace retained |
| Python attempt2 | 17 tests: 14 passed, 3 failed; 16 fit calls/13 optimizers, 11.29s |
| Legacy point-observation subset in attempt2 | All 8 passed; not rerun afterwards |
| New+legacy Node contracts | All 6 passed; not rerun afterwards |
| Diagnostic reproduction + affected assertions | All 3 passed, reusing exactly one newly saved two-site result; 2 fits/2 optimizers, 2.70s |
| Actual compiled MCP stdio smoke | PASS, 2 fits/2 optimizers, 26.09s; restart recovery, export and review |
| Post-amendment admission/read guards | PASS, 0 fits/0 optimizers |

The three original failed assertions incorrectly demanded whole-row convergence
on a noisy high-count integration fixture. Original logs, source snapshots and
seeds are retained. The first harness deleted its temporary provider objects at
teardown, so original attempt2 per-site PG/reason remains
`UNKNOWN_NO_SAVED_DIAGNOSTIC`. It is not filled from a later result.

An explicit evidence amendment authorized one new diagnostic reproduction with
the same input recipe and seed, before any correction to those assertions ran.
The new provider workspace preserves the full input/request/object/patch files.
The target is CPE (PG 3.799687267e-7); the reference remains
`UNKNOWN_NOT_CONVERGED` (PG 6.617733236e-6 >5e-6), even though both optimizer
success flags are true. Whole contrast remains UNKNOWN. The target's independent
erf truth integral is 40000; accepted integral39726.184 has error -273.816.
Its true total ROI mean is1707.227675; fitted mean1694.524878 has error -12.702796.
The failed reference has no accepted-error score. These are one software fixture,
not a specimen accuracy rate or a calibrated uncertainty estimate.

Readback, original-ID recovery/reuse, export, review and source/coefficient tamper
checks all reuse that saved result with both fitter and optimizer mocked to
raise if called. The independent truth/raw-equality assertions were preserved;
only the erroneous whole-row success prerequisite was removed. The actual stdio
smoke uses the already accepted target9x9 copied by translation to the reference.
Its two identical patches are a transport positive, not independent observations
or new accuracy evidence. Default raw S0 matches the saved baseline throughout.

The adapter also corrected its center check from an unintended last-pixel-center
bound to the agreed half-open ROI bound, and strengthened stored physical/CI
meaning validation. A separate zero-fit check accepts22.75 inside[18,23), rejects
23, and rejects forged physical/model-verification/CI labels on read. SciPy
version provenance and fit-support overlap metadata were added. None changes
the numerical objective, solver, gradient/rank gates or support mass threshold.

Commands, from the checkout root with the stated existing environment:

```text
node scripts/build.mjs
python -B scripts/validate_conditional_s2.py --attempt 1
python -B scripts/validate_conditional_s2.py --attempt 2
node --test --test-concurrency=2 dist/tests/column-fit-contract.test.mjs dist/tests/point-observation-contract.test.mjs
python -B scripts/validate_conditional_s2.py --attempt 3 --followup
node dist/tests/column-fit-stdio-smoke.mjs 1
python -B scripts/check_conditional_s2_read_guards.py
```

Attempts use exclusive output names; do not rerun those same IDs. The temporary
path refusal was followed by a checked, approved elevated execution of the same
test operation, with a new evidence filename preserving the first failure. No
ACL change or alternate-path workaround was performed. The diagnostic followup
and MCP smoke had separate explicit authorization and preserved identities.

Original host-path traces remain controlled under `outputs/`; portable redacted
copies and original hashes are in `validation/`. A local history-redaction record
maps the unpublished original amendment commit to its portable replacement.
Raw controlled workspaces are referenced by relative IDs/hashes, not committed.

The default `image_statistics`, FFT and peak numerical sources are unchanged;
affected legacy raw/review tests include a saved FFT path. No unrelated full
suite, GUI/Panel editor test, browser/model trial or physical acceptance ran.
CI now registers the new Node contract and bounded Python file. Full CI is
**NOT_TESTED locally**. The original physical gate remains **FAIL** at
10.034456% >10%; formal physical blind acceptance remains **NOT_TESTED**.
