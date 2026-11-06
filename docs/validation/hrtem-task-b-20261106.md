# HRTEM Task B local acceptance, 2026-11-06

Scope: explicitly specified synthetic candidates, supplied real-space construction
truth, existing qualified GPA/v3 topology/method-loop records, material-user
four-way feedback. No true material dislocation or GUI human usability claim.

Repository: `C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-baseline-local-20261106`

Branch: `research/hrtem-baseline-local-20261106`

Base: `4e5201bbfbab26c0420ac9dd0195a64ab44d9e0f`.
The final committed HEAD and exact diff are recorded in the external review
receipt; a document cannot contain its own final commit hash.

Evidence root: sibling `hrtem-task-b-evidence-20261106`.
Authoritative final cases: **`cases-final`**, with source TIFF, truth JSON,
supplied displacement NPY, full provider workspace, original request journals,
`receipt.json`, pre-review hash inventory, readable report and saved preview.
`cases-run1/2/3` are development runs, not the final acceptance fixtures.

## Final records

| Case | Original review ID | Existing topology result | Existing initial method decision |
| --- | --- | --- | --- |
| positive | `ed139b9b0667445e9d39a0a53512b976` | `projected_topological_evidence` | inspect conditional wrapped-phase winding |
| negative | `9b9a7bf484584ee18c8573661e807867` | `no_net_winding_detected` | `clean_finite_saved_phase_roi` |
| low_amplitude | `155e5afba68f4034862f3dd57893062f` | `insufficient_loop_stability` | `phase_quality_limited` |
| contrast_vortex | `729b1975dd5f45d593022e3451ad62e7` | `projected_topological_evidence` | inspect conditional wrapped-phase winding |

Each `receipt.json` gives exact discovery/candidate/frame/GPA/topology/method
IDs, original request ID and arguments, immutable-input checks, exact read
receipts and readable file path. The positive and contrast images are exactly
equal as float32 arrays; the latter's supplied material displacement is exactly
zero. Both retain winding `[-1,0,-1]` on both loops and conditional closure
`(8,0)` pixels within the pre-existing fixture tolerance. This is the explicit
counterexample to physical identification from image-phase topology alone.

`cases-final/mcp-review-receipts.json` records four additional actual compiled
MCP review writes, request ID `task-b-mcp-review` in each distinct case workspace,
client restart, exact compact info/result and unchanged prior files. The
`mcp-*-dispatch.json` files save requests before submission; the smoke refuses
replay if these markers exist. `mcp-*-review.png` are delivered MCP bytes.

## Commands and outcomes

PowerShell setup (all temporary writes remain under the authorized local root):

```powershell
$repo='C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-baseline-local-20261106'
$evidence='C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-task-b-evidence-20261106'
$python='C:\Users\13471\AppData\Local\Programs\Python\Python313\python.exe'
Set-Location -LiteralPath $repo
$env:TMP=Join-Path $evidence 'temp'
$env:TEMP=$env:TMP
$env:PYTHONIOENCODING='utf-8'
$env:HRTEM_HANDOFF_ROOT='C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-handoff-drive-20261106\payload\hrtem-baseline-integration'
```

**PASS**, 5 new end-to-end worker tests, 68.977 seconds, no skips:

```powershell
$env:HRTEM_TASK_B_OUTPUT=Join-Path $evidence 'cases-final' # NEW directory at run time
& $python -m unittest discover -s tests -p test_hrtem_candidate_chain.py -v
```

Log `chain-final.log`: four independent constructions, nonzero/zero/refusal
oracles, exact positive/contrast pixels, unchanged prior files and read-only
reopens, missing source/nonfinite/out-of-ROI anchor refusal, foreign identical-pixel
frame refusal, method/path mismatch, coherent own-hash/report/journal physical-label
tamper refusal, direct readable/preview wording/units checks, export dependencies
and new helper software hash. No old numerical tolerance was changed.

**PASS**, 54 relevant regression tests, 80.331 seconds, no skips:

```powershell
& $python -c "import unittest; patterns=['test_image_discovery_workspace.py','test_image_topology_workspace.py','test_method_read_reuse.py','test_method_loop_accounting.py','test_peak_comparison_feedback.py','test_gpa_assessment_compatibility.py','test_peak_summary_read_compatibility.py']; suite=unittest.TestSuite(unittest.TestLoader().discover('tests',pattern=p) for p in patterns); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"
```

Log `final-python-regressions.log`. Original transferred GPA/Task A positive and
rejection plans are read, without regenerated substitute fixtures. Original
packet manifest entries retain all expected hashes. Existing analytic/reduction
compatibility, threshold/cancellation/nonfinite/tampering rejection, old discovery
history/source/calibration bindings and topology workspace tests pass.

**PASS**, build and 13 Node contract/transport tests, no skips:

```powershell
npm run build
node --test dist/tests/discovery-contract.test.mjs dist/tests/method-loop-contract.test.mjs dist/tests/topology-contract.test.mjs dist/tests/image-evidence-contract.test.mjs
```

Logs `build-mcp-final.log`, `node-contracts-final.log`. The final build includes
the smoke entry correction to use the portable server's explicit workspace
environment, rather than plugin settings' separate `workspace_root/images`.
No failed or uncertain MCP write preceded this correction.

**PASS**, four actual compiled MCP writes and client restart reads:

```powershell
$env:MICROSCOPY_PYTHON=$python
$env:HRTEM_TASK_B_CASES=Join-Path $evidence 'cases-final'
node dist/tools/smoke_hrtem_candidate_review.mjs
```

Log `mcp-final.log`. This writes new reviews from the same retained evidence,
receives actual PNG image content, starts fresh clients, checks exact compact
info/result against the original assessment and hashes every prior case file.
No new FFT/GPA/topology dispatch occurs in this review operation.

**PASS**, final `git diff --check`. Original positive/low-amplitude/contrast
review preview pixels and the delivered MCP negative preview were actually
inspected locally. The four-way footer is legible; the existing contact-sheet
GPA thumbnails crop full legends, which remain available in original GPA records.
This limited pixel check does not certify human GUI usability.

## Development failure and limits

**FAIL, superseded:** `chain-run3.log` has one helper hash failure because the
v3 admission gate was added while that process was running. The saved helper
hash and later source hash therefore differ. That run is retained and excluded
from final acceptance. Production Python code was then held fixed, all five
tests regenerated in the new `cases-final` directory and passed. Earlier build
and passing development runs are retained but do not replace the final evidence.

**NOT RUN / NOT QUALIFIED:** real specimen tests; real dislocation confirmation;
automatic discovery, lattice/fringe tracing or atomic-position measurement;
multislice/atomistic forward-model validation; statistical uncertainty or 3D
uniqueness; human browser/GUI workflows; cross-platform relocation of these new
Task B workspaces. Records retain their original absolute save paths; this round
verifies exact native Windows-root reopens and does not rewrite them for transfer.
Old transferred Task A compatibility remains separately regression-tested.

The supplied real-space statement remains caller-reported. External source hashes
are preserved as provenance text and in the retained artifact inventory, rather
than certified by the review adapter. Unknown is mandatory even for the synthetic
positive. Zero winding is local net closure only; low amplitude is a refusal;
pure contrast and displacement can be observationally identical. No outstanding
failure remains in the declared final local scope. Independent parent review is
still required before considering a push. No push/merge, F: access or STEM work
was performed.
