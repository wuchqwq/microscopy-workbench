# F4 cross-method closeout — 2026-10-31

Independent branch `feature/f4-cross-method-loop`, starting at `558073e` on
main `9fbc769`. No main merge, new methods, numerical thresholds, private images,
global client configuration or scientific schemas were changed.

## Actual new runtime Agents

The owner authorized a **separate test configuration**. The previous two blocked
attempts and their [original status](examples/method-loop/new-agent-status.json)
remain unchanged. This run uses installed Codex CLI, not a simulated model or
the developer dispatching a predetermined tool list.

`tools/qualify_method_agent.py` uses `codex exec --ignore-user-config --ephemeral
--json --sandbox read-only`, command-line MCP overrides, and the explicit public
synthetic plugin configuration. Approval policy remains `never`; the local MCP
server has a five-tool allowlist with explicit **per-tool** `approval_mode=approve`:
`image_info`, `image_result`, `image_method_plan`, `image_method_step`,
`image_method_next`. Recovery exposes only the first two. Default tool approval
remains `prompt`. It neither copies nor edits auth/config files. This uses the
[documented MCP tool approval configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
It does not grant approvals to the user's other services.

The prompt supplies the exact public automation Skill and method-loop reference
text, whose hashes are recorded. It supplies a saved synthetic GPA, sourced
candidate carriers, working image model, permitted circuits and finite budget,
but no fixture truth, expected winding or expected action order. The Agent must
choose, reassess or stop through MCP, without inspecting source/oracle files.
This qualifies direct MCP plus provided Skill context, **not automatic plugin
discovery or visual/GUI operation**.

- Analysis: actual fresh model selected extra GPA, then topology after reading
  the new evidence, then stop. Two scientific children; no source FFT. Supplied
  working assumptions remain `hypothesized`, not a material-dislocation claim.
- Recovery: another actual new model queried ten distinct original request IDs
  and the topology object. The first compact root query was followed by full
  original outcomes; all calls completed. It submitted no new science/root.
- Independent verification matched returned identities to creator journals,
  manifests and every own payload hash, checked reservations and child IDs,
  and confirmed all **531 object/request files** unchanged by recovery. Source
  TIFF hashes and the four pre-existing FFT identities were retained.
- Global config SHA before/after all sessions was identical. The raw prompts,
  policy overrides, events and summaries remain under ignored
  `analysis/2026-10-31-f4-closeout/`; the curated
  [actual tool trace](examples/method-loop/new-agent-closeout.json) is public.
- After the performance changes, a third actual new model repeated recovery on
  the final compiled runtime: the same ten request IDs and full topology were
  recovered; all531 files were still identical. It chose to look up the ten IDs
  twice (21 read calls total), which is retained in the trace, not presented as
  an optimal Agent strategy. No write tool was exposed to either recovery.

## Measured overhead and bounded correction

The historical 54.4s active versus 7.4s fixed positive result remains unchanged.
Profiling an actual saved terminal plan found **no FFT/GPA recomputation** in
the decision query. The overhead was repeated immutable graph admission and
fresh-process dependency import, rather than a different scientific algorithm.

1. `_seed` admitted each GPA graph, then the topology source helper admitted
   those same records again. It now passes freshly qualified records into the
   same internal grid/calibration/band admission routine. There is no persistent
   cache, stat-only trust, user-supplied proof or new validation bypass.
2. Initial planning and historical-plan validation repeated seed admission
   before the already-required frozen-evidence reconstruction. The latter still
   re-derives the complete input refs, source relationships, policy and costs,
   and compares them exactly with the saved record.
3. Loading the GPA core also loaded SciPy `ndimage` on every read/decision.
   That measured about1.17s in the import profile. The same dependency is now
   imported inside the existing computation functions; their mathematics,
   masks, sampling, seed and numerical tolerances are unchanged.

Exact same saved terminal object, same Windows environment, three separate
unprofiled processes per version (small sequential sample, no general benchmark):

| Stage | Before median | Final median |
| --- | ---: | ---: |
| Worker-module import | 1.775s | 0.839s |
| Complete record qualification | 1.584s | 0.837s |
| Import + qualification (paired-run median) | 3.311s | 1.637s |
| JSON encoding | <0.001s | <0.001s |

Separate instrumented reads counted964→534 full SHA calls and
541,427,016→280,662,884 bytes hashed. This removes duplicated traversals; each
remaining qualification still reads full own payloads and exact original
journals, with semantic reconstruction and transitive proof checks. Those
profiles add overhead and are not mixed with unprofiled timing medians. OS
process creation/MCP transit are included only in the separate end-to-end smoke;
they are not falsely assigned to a worker-internal stage.

Actual before/final MCP runs both passed all four unchanged analytic controls,
budget/information/refusal guards and fresh protocol recovery. Same input and
additional caps; each timing is one run in the same Windows environment:

| Case | Active before | Active final | Fixed before | Fixed final |
| --- | ---: | ---: | ---: | ---: |
| Positive closure | 26.427s | 15.716s | 6.291s | 5.040s |
| Smooth hotspot | 2.797s | 1.662s | 5.927s | 4.757s |
| Fixed-seed noise | 2.773s | 1.819s | 5.985s | 5.224s |
| Contrast-only vortex | 26.348s | 16.453s | 5.781s | 5.077s |

The positive active path includes seven MCP calls (plan, two steps, two child
reads and two reassessments); fixed has two. Active still costs more for the
same two scientific calls, while smooth/noise avoid those calls. These are
protocol-driver timings, not model inference latency. The original 54.4/7.4s
result was not replaced by the faster current baseline. All **278 corresponding
NPY payload comparisons** across the new before/final runs matched exactly,
including FFT, seed/follow-up GPA and topology arrays. That establishes no
different science introduced by this optimization, not strategy superiority.
See [JSON](examples/method-loop/performance-closeout.json) and
[CSV](examples/method-loop/performance-closeout.csv), including raw-report hashes.

The new focused tests reject a modified payload, changed/malformed creator
journal and a coherently rehashed but incorrect frozen input reference. They
also check unchanged cross-source mask admission and the restricted analysis/
recovery tool lists. Two test-harness revisions initially compared saved records
with transport-only display fields or assumed one exception class for malformed
JSON; failures were retained, fixtures/assertions corrected, no runtime guard or
scientific tolerance relaxed.

## Reproduce without changing global config

Build once and use an independent Python environment with `requirements-gpa.txt`.
First create a **new** public synthetic workspace:

```powershell
npm run build
$env:MICROSCOPY_PYTHON = 'C:\independent-env\Scripts\python.exe'
$env:MICROSCOPY_SMOKE_OUTPUT = 'C:\scratch\method-loop-new'
npm run test:method-loop
```

Its `plugin-config.json` names only that test workspace. Select the first case's
saved seed GPA from `report.json` (never an experimental image). Run the installed
Codex CLI with its existing login:

```powershell
python -B tools/qualify_method_agent.py --config C:\scratch\method-loop-new\plugin-config.json --seed <saved-GPA-ID> --output C:\scratch\fresh-model-new
python -B tools/qualify_method_agent.py --config C:\scratch\method-loop-new\plugin-config.json --handoff C:\scratch\fresh-model-new\final.txt --output C:\scratch\recovery-model-new
```

Outputs must be new directories; a random prefix is recorded before each new
analysis, while step IDs still come from the saved plan. `final.txt` must be
valid JSON containing actual original references before using it as the handoff.
Inspect real events and journals: CLI exit0 is explicitly **not** acceptance.
No analysis permission is exposed to the recovery model. These are opt-in
developer qualification utilities, not model calls inside the plugin.

For a read-only local profile of an existing plan:

```powershell
python -B tools/profile_method_read.py --workspace C:\scratch\method-loop-new\workspace\images --object-id <saved-plan-ID> --output C:\scratch\profile-new --profile
```

Remove `--profile` for ordinary timing. Counters are not measured in that mode;
it still runs the same complete scientific object admission. The command cannot
dispatch a scientific method or modify a record.

## Scope

Executed on Windows x64, Node24.16.0 and independent Python3.13.2 with the
existing NumPy2.5.4/SciPy1.18.1/scikit-image0.26.0 environment:

| Qualification | Result |
| --- | --- |
| Actual fresh model decisions + separate new-model recovery | PASS; final optimized-runtime new-model recovery also PASS. |
| Same-cap four-control MCP before/final | PASS both runs; all failed attempts, stops, costs, original recovery and source protection retained. |
| Exact before/final scientific NPY files | PASS,278 comparisons; four source FFTs per workspace, none added by the loop. |
| Policy/accounting/isolated approval + read corruption tests | PASS,19 tests including5 new focused cases. |
| Original request journal tests | PASS,11. |
| GPA mathematics, physical truth/false-strain cases and workspace | PASS,28. |
| Existing topology workspace/admission/recovery | PASS,14. |
| Targeted Node contracts, Coordinator and frozen package continuation | PASS,42. |
| Lightweight `npm test` | PASS,321 passed/6 existing conditional skips/327 total. |
| Strict TypeScript typecheck and runtime build | PASS. |
| Standalone scientific smoke | PASS, actual signed calibration→ROI FFT→0.8nm→NPY/direct DFT→display revision→restart/Panel HTTP; no browser gesture claim. |

Initial harness failures are retained separately from the final passing checks;
they are not successful scientific fault injection. No complete GMS/C++ or
unrelated native regression was run. Raw scoped logs are retained in the
ignored closeout analysis directory; final GitHub CI is reported on the PR.

GUI gestures, automatic plugin discovery, real specimen/DM/macOS qualification,
and a truly interrupted worker remain **NOT_TESTED** here. The original
contrast-only-vortex non-identifiability remains unresolved scientifically, as
expected: matching image-phase winding is not unique material defect evidence.
No known unfavorable result or old receipt was rewritten. PR #44 is for review;
main is not merged.
