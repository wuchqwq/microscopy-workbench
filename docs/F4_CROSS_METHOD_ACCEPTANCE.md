# F4-full first cross-method slice — acceptance

Base: latest main `9fbc769f95fc54c334d553d6ec2824d2dd2feb65`, after reviewed
F3b #42. Independent `feature/f4-cross-method-loop` branch; no stacked branch
was resumed. [API and scientific limits](CROSS_METHOD_ANALYSIS.md).

## What actually works

Actual public stdio MCP → independent Python → existing GPA/topology tools:
read saved phase evidence, choose a sourced additional phase direction when
needed, perform a conditional circuit test, reassess and stop. Smooth hotspot
and noise controls stop before those additional method calls. Missing model/
circuits produce an information request, and a new immutable plan can supply
that information without resetting its budget. No source FFT is recreated.

It is a reusable three-tool interface plus Skill, not the developer's sample
analysis script. The smoke driver calls public MCP tools only. Starting from
domain/twin evidence or multiple frames is outside this first slice.

## Environment and results

Windows x64; Node24.16.0; independent Python3.13.2, NumPy2.5.4, SciPy1.18.1,
scikit-image0.26.0. No private image, browser, DM/GMS or user client configuration
was modified. Tests ran from this independent worktree.

| Scope | Actual result |
| --- | --- |
| Policy math/admission/negative controls | PASS, 12 tests. Raw phase diagnostics, finite-resolution direction families, inherited GPA aperture/reference, nested-loop scope, absent information, duplicate/unknown attempts, budget and three-GPA limit. |
| Journal and reservation guards | PASS, 11 tests. Failed/unknown reservations, elapsed/null semantics, original hashes/scope, exact successor slots, future-slot/malformed-root/exhausted-call-cap refusal before journal creation, existing-ID dedup. |
| Unknown/late child accounting | PASS,2 focused unit faults. Unquantified total spend is null (known subtotal separate), never zero/free budget. A later child is queried by its original ID only, while historical parent unknown stays recorded. Not real interruption injection. |
| Real Python exit1 recovery transport | PASS. Nonzero failed/unknown partial receipts survive the TS adapter with original identity/backend/no-retry checks; untrusted responses refuse. This is a transport fixture, not real worker-interruption injection. |
| New formal schema/module checks | PASS. New tools register without server dispatch changes; request IDs, goal, budgets and no arbitrary paths/scripts enforced. Old tools remain directly callable. |
| Lightweight Node list | PASS: 321 passed,6 conditional skips,327 total,0 failures. Fresh build followed by the compiled package test list, without deleting dist during a running MCP session. |
| Frozen legacy continuation | PASS,2 tests. Actual copied package/old workspace, original requests/context/export/remeasure/Panel assets, strict retained schemas/bytes and one original FFT. Only the three explicitly enumerated new tools extend the additive catalog allowlist; legacy assertions remain exact. |
| Existing standalone scientific smoke | PASS. Actual calibrated TIFF→ROI FFT→0.8nm→NPY/direct DFT→display-only revision→restart recovery→Panel HTTP. Not browser gestures. |
| Actual four-control cross-method MCP smoke | PASS,288.7s. Positive, smooth hotspot, fixed-seed noise and contrast-only vortex; all attempts/caps/timings recorded. |
| Original requests and fresh protocol client | PASS.12 saved plan/step objects recovered; original failed requests matched their existing errors/journal identities; no science or FFT created by recovery. |
| Final compiled runtime supplement | PASS. Reopened r1 historical plan/step objects, then verified an exhausted budget refuses before creating a step journal or scientific child. No extra source FFT. |
| Source protection | PASS. Every source TIFF, saved FFT and initial GPA unchanged; four original source FFTs total. Additional GPA/topology reuse them. |
| New ordinary model session | PASS in the authorized 2026-10-31 isolated configuration: actual new model chose GPA→topology→stop; another new model recovered original requests without new science. Earlier blocked attempts remain historical. [Closeout](F4_CROSS_METHOD_CLOSEOUT.md). |
| GUI gestures, real specimens, Mac-specific execution | NOT_TESTED. Deferred independently; no prior browser stop was bypassed. |
| Real cancellation/lost-response/interrupted-worker injection | NOT_TESTED. Unit journal unknown-state coverage and successful recovery are separate scopes. |

## Same-cap comparison, including an unfavorable result

Each strategy starts from the same saved FFT/initial GPA and has the same
additional cap:2 method calls,0 new source FFT pixels,131072 GPA band-pixels,
5328 reserved topology band-path samples. The actual three retained reflections
sample2664 band-path positions. Initial input cost is shared and reported
separately, not silently counted as free total acquisition/analysis.

| Analytic case | Active extra science calls | Fixed extra calls | Evidence |
| --- | ---: | ---: | --- |
| Positive continuum closure | 2 | 2 | Same conditional projected topology evidence. |
| Smooth single-valued displacement hotspot | 0 | 2 | Active stops on finite clean phase evidence; fixed finds zero net winding. Neither proves all defects absent. |
| Fixed-seed noise | 0 | 2 | Active stops quality-limited; fixed circuits have insufficient stability. Not a general noise classifier. |
| Contrast-only vortex | 2 | 2 | Both yield the same image-phase evidence as the positive image. Material displacement in its independent generating model is zero; neither may confirm a material dislocation. |

**The active positive path was slower:**54.4s versus7.4s fixed; contrast30.7s
versus6.3s. Planning, original-request auditing and repeated dependency checks
add round trips. No latency speedup, calibrated information gain or universal
scientific advantage is claimed. Smooth/noise avoided scientific calls, which
is a different metric. This small sequential run is not a randomized performance
benchmark. [Exact CSV/JSON and plot](examples/method-loop/README.md).

All refused submissions retain their call reservations and elapsed time. Two
actual preflight failures exhausted a two-call root without launching science.
Dispatched failures retain scientific reservations; unknown/unreadable costs
block continuation. Helper unit faults cover that logic, not a killed real worker.

## Historical new model attempts: recorded blockers, not a pass

Two fresh `codex exec --ignore-user-config --ephemeral --json --sandbox read-only`
sessions used isolated task context and explicit local MCP configuration while
leaving real user config/auth untouched. No model was embedded in the plugin.

1. Attempt01 tried to read the public Skill file via a read-only shell command;
   execution policy rejected it. The model stopped before MCP use.
2. Attempt02 kept identical permissions and received the exact public Skill
   texts as input context, requiring no file/shell action. The model selected
   `image_info`, but the client refused it:
   `MCP tool call requires approval, but approval policy is never`.

No scientific root/step/child was created by either model. These are real model
attempts but **not successful scientific comprehension/decision qualification**.
No permission was widened or alternate execution used after the MCP rejection.
The direct stdio clients above are independently PASS and did not replace that
client-level gate. See the unchanged [historical status](examples/method-loop/new-agent-status.json).
The owner subsequently authorized an independent test-tool policy. New actual
model runs now pass that gate, without editing global configuration; see the
[separate closeout](F4_CROSS_METHOD_CLOSEOUT.md) and
[new original IDs](examples/method-loop/new-agent-closeout.json).

## Retained failure and reproducibility

The full scientific r1 report remains unchanged under ignored
`analysis/2026-10-30-f4-full-mcp-01/report.json`; its SHA and small public JSON/CSV/
PNG are linked above. A late extra failed-request query assertion incorrectly
assumed every MCP error was JSON; its supplement failed and is retained.
The corrected read-only supplement matched the existing standard error text
and original journal identity/hash, creating no objects/requests. No scientific
threshold or numerical assertion changed. The final smoke includes this gate.
The scientific kernels and decision policy in r1 match the final runtime. A final
unknown-cost presentation correction (null total, separate known subtotal), a
pre-submission exhausted-call-cap guard, the
corrected harness/read-only supplement and additive schema/Skill checks were
validated separately with focused tests, without repeating unrelated scientific
calculations. Original r1 results/failures were not rewritten.

Terminal information/stop decisions are not scientific step dispatches; the
final handler explicitly directs them to the next-plan patch/user-stop path.

```powershell
npm ci
npm run build
$env:MICROSCOPY_PYTHON = 'F:\microscopy-workbench-env\Scripts\python.exe'
& $env:MICROSCOPY_PYTHON -B tests/test_method_policy.py
& $env:MICROSCOPY_PYTHON -B tests/image_method_journal_test.py
node --test dist/tests/method-loop-contract.test.mjs dist/tests/method-journal-contract.test.mjs
$env:MICROSCOPY_SMOKE_OUTPUT = 'C:\scratch\method-loop-new' # new directory
npm run test:method-loop
```

Use `requirements-gpa.txt` in an independent environment. The smoke records
request IDs, all costs including failures, old/new evidence and recovery; it
never edits experimental inputs. Ordinary model execution needs a compatible
client's explicit tool policy; the original r1 acceptance did not change it.
The opt-in closeout driver scopes explicit approvals to named local test tools.
