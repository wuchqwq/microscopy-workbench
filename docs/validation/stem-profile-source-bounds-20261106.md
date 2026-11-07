# STEM profile source-centre boundary regression

Baseline: `60439db70439e482ca1abda19b9e2f1773cb5efe`. Isolated worktree:
`C:\Users\13471\Documents\ChatGPT\mircograph-workbench\stem-tool-continuation-local-20261106`;
branch `feat/stem-tool-continuation-20261106`. Local commit only; no HRTEM changes,
push or merge. This record supersedes the earlier continuation validation only
for the source-boundary defect; it does not replace historical results.

## Reproduced defect and correction

On the baseline, a 64x64 source, ROI `[59,20,64,25]`, expected point
`[61.25,22.25]` produced horizontal endpoints
`[[59.25,22.25],[63.25,22.25]]`. Dispatching that exact saved proposal with its
original request ID failed with `INVALID_ARGUMENT`:
`Coordinates must be inside saved array centres; no clipping`.
The explicit vertical line `[[61.25,20.25],[61.25,24.25]]` succeeded.
`reproduction/reproduction.json` retains both complete responses and old journals.

`image_numeric.sample` checks requested centre coordinates against inclusive
`[0,width-1] x [0,height-1]` **before** nearest rounding. Passing a half-open ROI
test on `floor(coordinate+0.5)` alone did not establish executable coordinates.
New continuation version 2 checks both conditions, using the already verified
source dependency's exact frame shape. It records attempted axes and the two
separate predicates in `profile_support`. Horizontal remains first, then vertical.
Endpoint checks cover the full fixed axis-aligned straight line: requested
coordinates and nearest indices are monotone between endpoints. Actual saved
five-sample coverage remains independently checked after `image_profile` executes.
No sampling engine or profile acceptance rule was modified.

If neither axis fits, `needs_supported_profile` has no action or follow-up call.
Its reason requests an explicitly supported through-site line, appropriate
ROI/measurement revision or additional image support. Changing the ROI alone
cannot necessarily repair a source boundary. No coordinate is moved, clipped or
padded, and no old evidence is removed.

## Bounded regression results

| Check | Result |
|---|---|
| Continuation Python tests | 9 PASS, including all previous six tests |
| Four source edges | Actual profile + linked review + original-ID recovery PASS: left/right use vertical; top/bottom use horizontal |
| Exact source-centre limits | Actual profiles ending at x=0 and x=63 accepted; linked coverage PASS |
| Four corners | Both axes fail source centres even though nearest ROI support fits; no action, original position/references retained |
| Expected point `[63.25,22.25]` | No axis can satisfy source centres; no proposed measurement |
| Narrow interior ROI | No supported axis; no action; explicit support reason |
| Existing coverage regressions | 11 PASS, including off-site, finite segment, actual sampling, endpoint and pixel-boundary cases |
| Build | PASS |
| Actual compiled MCP right-edge case | PASS: saved version-2 proposal -> exact vertical profile -> linked review/stop -> export -> closed/restarted client -> original-request recovery |
| Actual compiled MCP corner case | PASS: `needs_supported_profile`, no proposed profile, export/reopen retains exact result |
| CI execution registration | First run failed due to default sandbox temp permissions; corrected workspace TEMP/TMP run 1 PASS |
| Historical compatibility | Actual baseline version-1 proposal read/recovery unchanged; original failed request queried, not replayed; new linked version-2 review accepts the explicit vertical evidence; 34 old files byte-identical |

The MCP positive case includes an older off-site profile and two raw reference
regions. Final evidence retains the original statistics (including both
references), the old off-site profile and the new profile;
coverage assessments are `[not_verified,covered]`. Expected XY remains
`[61.25,22.25]`, target mean 4, reference means 10 and 10, both differences -6.
Physical conclusion remains null. The action's saved request ID and matching
profile receipt are retained in `mcp-bounds/results.json`, along with full calls,
inputs, objects, requests, TIFFs and exported reports.

The original baseline version-1 semantics are frozen by explicit reconstruction,
not silently repaired. Reading a historical invalid proposal does not qualify
it for dispatch. The Skill now requires a linked current review before acting
on an old version-1 proposal. A new review has new explicit original request IDs;
an unknown or failed old measurement is never retried as a new ID.

## Commands and recorded evidence

From the worktree, use `PYTHONUTF8=1`, `TEMP` and `TMP` pointing to the evidence
root's `tmp` directory. `PYTHONPATH=tests` is needed for the focused unittest
command. Entry output directories must be fresh absolute paths.
The reproduction command was run on the baseline before editing; its baseline
assertions are deliberately not expected to pass on the fixed HEAD.

```text
python -B -X utf8 ABS_EVIDENCE/reproduce.py ABS_EVIDENCE/reproduction
python -B -X utf8 tests/image_site_continuation_test.py -v
python -B -X utf8 tests/image_site_observation_test.py -v
npm run build
node dist/tests/site-continuation-entry-smoke.mjs ABS_EVIDENCE/mcp-bounds --mcp --source-bounds
python -B -X utf8 -m unittest ci_scope_test.ScopeTests.test_point_observation_checks_are_in_actual_execution_lists -v
python -B -X utf8 ABS_EVIDENCE/check-historical.py ABS_EVIDENCE
git diff --check
```

Evidence root: adjacent `stem-profile-source-bounds-evidence-20261106`.
Logs: `python-continuation.log`, `coverage.log`, `build.log`, `mcp-bounds.log`,
`ci-registration.log` (initial failure), `ci-registration-workspace-tmp.log`
(PASS), `historical-compatibility.log`. Full compatibility calls are in
`historical-compatibility.json`; `entry-freeze.json` records the implementation,
tests and unchanged coverage module hashes before compiled MCP checks. Only
documentation was completed afterwards. The CI spatial MCP smoke now includes
these source-boundary cases; the CLI smoke remains registered.

The failed auxiliary test attempted `git init` under
`C:\Users\13471\AppData\Local\Packages\sandbox.{a9c89f20-8f23-454d-b850-1595a46a2e16}\AC\Temp\microscopy-ci-scope-pm53zcnp`;
initialization and cleanup reported access denied, and `.git/HEAD` was absent.
That target was not retried or cleaned up by this task. The test was run with a
different, explicitly writable workspace temp target and passed. No remaining
implementation/test blocker or pending approval; no access restriction bypass.

## Unverified scope

The driver is scripted. Deterministic suggestions and actual existing-tool
execution passed; real AI autonomous choice is NOT_TESTED. The fixture is an
analytic scalar array, not a physical STEM specimen or forward simulation.
No GUI workspace gesture, new live CLI run, unchanged Node contract rerun,
remote CI or cross-platform qualification was performed in this fix. Existing
prior CLI/contract evidence is separate. No full suites, S2, R64, NL-PCA or
large numerical experiments ran. The conservative 8-ULP coverage policy and
site-observation versions 1/2 remain unchanged. Five samples still provide
minimum one-dimensional context, not defect, occupancy or element recognition.
