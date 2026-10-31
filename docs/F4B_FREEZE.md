# F4b first-version freeze

Date: 2026-10-31. This report qualifies the manual workflow, not automatic
visual discovery. PR #46 remains stacked on the unmerged PR #44 at `9ca6b44`.
The final commit and its own CI conclusions are recorded in PR #46; this document
does not reuse the historical `6dede0a` CI as final-HEAD evidence.

## Supported workflow and retained experimental entrance

**Manual image-first: PASS within limited public synthetic software/numerical
scope.** A researcher supplies an original-pixel ROI and observation reason;
the runtime Agent chooses existing FFT, peaks, measurement or GPA tools, binds
their saved evidence, and revises or recovers the record. This is not a claim
of physical interpretation accuracy on specimens or a fixed analysis pipeline.

**Automatic feature proposal: EXPERIMENTAL, not scientifically qualified for
reliable anomaly detection.** The registered 64px scan missed both positive
attention anomalies. Those failures remain in the original acceptance and
benchmark artifacts. The 32px diagnostic was post-hoc with known truth, not an
independent blind success. No proposals never means a normal image.

No detector thresholds, scoring weights, window settings, truth, feature
algorithm, FFT, peak, measurement or GPA algorithms changed in this freeze.
The old omitted-entry behavior remains `feature` for request compatibility;
the formal workflow must specify `entry="manual"` and actual researcher reasons.
This preserves historical request meaning rather than silently promoting an
automatic proposal into a researcher statement.

New discovery/review metadata and reports carry `support_status`:
`MANUAL_SUPPORTED_LIMITED` or `EXPERIMENTAL`, derived from the original entrance.
Neither is a physical conclusion. Existing records without this optional field
remain readable as saved; recovery does not backfill or rewrite their metadata.

## Necessary recovery repair

Creation already refused a review revision whose previous review belonged to
another scientific ROI. Recovery omitted the equivalent invariant. An isolated
public synthetic counterexample coherently rehashed the original request and
history: the current ROI `[24,24,88,88]` incorrectly accepted the previous ROI
`[32,32,96,96]` on recovery. The original accepted counterexample is retained in
[history counterexample](examples/discovery/freeze-history-counterexample.json).
It is fault injection into saved records, not a real interrupted-worker claim.

Recovery now enforces exact ROI equality as creation does. An independent test
still admits the coherent record at the shallow own-hash layer, then requires
both full `get` and original-ID `result` to reject it with `CORRUPT_OBJECT`.
Legal same-ROI revision/recovery remains valid without a second FFT. Separate
tests reject a contradictory qualification label even with coherent manifest
and report hashes, and admit legacy records without optional labels.

## Actual manual MCP acceptance

Environment: Windows x64, Node 24.16.0, independent Python 3.13.2, NumPy 2.5.4,
SciPy 1.18.1. No GMS, private specimen, browser gestures, or global client
configuration was used or changed. The opt-in runner launches the actual compiled
MCP stdio server and Python worker; it does not replace them with mocks.

Run, after `npm run build`, using an independent Python environment:

```powershell
$env:MICROSCOPY_PYTHON='F:/microscopy-workbench-env/Scripts/python.exe'
# Optional: a new absolute directory that does not already exist.
$env:MICROSCOPY_SMOKE_OUTPUT='F:/microscopy-workbench-f4b/analysis/my-manual-freeze'
npm run test:manual-discovery
```

The runner creates public synthetic data locally and retains pre-submission
request IDs, calls, actual MCP PNG content, hashes, export and report. The
[saved run](examples/discovery/manual-freeze.json) used a float32 256×256 frame,
ROI `[56,56,120,120]`, and explicit synthetic signed XY scales
`+0.02/-0.03 nm/px` with unknown uncertainty. These are test parameters, not
experimental calibration.

- Manual attention → one 64×64 FFT → peaks → four committed measurements →
  review → same-ROI observation/review revision: PASS.
- Independent TIFF/array equality and all-bin finite DFT: PASS; maximum complex
  error `1.7716904380295302e-12`, below the unchanged `1e-7` test tolerance.
- Pixel periods and signed anisotropic physical reciprocal metric: PASS at the
  unchanged `1e-9` tolerance. No phase/defect interpretation is confirmed.
- Changed-ROI binding refusal and original failed-request recovery: PASS.
- Review export equals saved science JSON; source, original FFT and old files
  remain unchanged: PASS.
- A fresh MCP client recovers eight original requests, with all 89 immutable
  files unchanged, zero new requests and zero new FFT: PASS.
- Actual MCP PNG returned: PASS. That does not imply human browser gesture or
  fresh model acceptance. Runtime for this run: 39.287 seconds, not a comparative
  speedup benchmark.

## Validation and evidence boundaries

The exact final-commit CI is attached to PR #46. Current local checks:

| Scope | Result |
| --- | --- |
| Frozen detector core numerical/negative tests | PASS, 7 tests |
| Discovery workspace, source/calibration, GPA handoff, original-ID recovery and coherent fault tests | PASS, 15 tests |
| Lightweight `npm test` (includes discovery schema/dispatch) | PASS, 325 passed / 6 conditional skips / 331 total |
| Strict typecheck and compiled build | PASS |
| Copied compiled package with frozen legacy schema/workspace | PASS, 2 tests |
| Actual standalone scientific TIFF/DFT/export/recovery/Panel HTTP | PASS |
| Actual manual MCP stdio/Python chain above | PASS, limited synthetic scope |
| Legacy no-label MCP and historical Agent workspaces reopened with current code | PASS, 11 saved objects; 1,075 files unchanged, no new requests/FFT |

The [legacy read-only report](examples/discovery/freeze-legacy-readonly.json)
and [preservation manifest](examples/discovery/freeze-preservation.json) retain
the separate compatibility evidence. Platform skips are not counted as passes.
A development `npm test` run caught a missing local link to this report (324 pass,
one failure, six conditional skips); adding the report fixes the packaging
defect without deleting the assertion. The original run is not relabeled PASS.

Historical performance failures, initial harness failures, source hashes and
the prior fresh-model run remain in [historical acceptance](F4B_ACCEPTANCE.md).
This freeze adds new reports rather than replacing those artifacts.

Real specimens and independent material interpretation, human GUI gestures,
new runtime-model execution on this freeze, actual worker interruption and Mac
desktop acceptance are **NOT_TESTED**. The retained earlier model session is
historical evidence, not a new model test at this HEAD. CI platform automation
is also not a human usability or real-specimen scientific qualification.

## Next real-specimen validation

Use [Issue #43](https://github.com/wuchqwq/microscopy-workbench/issues/43), starting
with one authorized local original and an explicit ROI/reason. Record file/hash,
dataset/plane/frame, original dtype/shape/axes, signed XY scale and its source
and uncertainty, relevant prior processing, and independent references for any
physical claim. Unknowns stay unknown; pixel-domain observation can proceed.
Keep private originals and derived evidence outside public exports. The separate
unmerged PR #45 intake is not assumed installed or silently included here.

The entry is `image_open` → explicit frame →
`image_discovery(entry="manual", regions=[...])` → chosen existing science →
`image_discovery_review` → `image_result` recovery. See
[API and limits](IMAGE_FIRST_DISCOVERY.md) and the
[runtime Skill](../skills/scientific-agent/microscopy-automation/references/image-first.md).
Successful software binding must be reported separately from physical agreement.
