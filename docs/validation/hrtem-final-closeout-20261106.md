# HRTEM baseline closeout, 2026-11-06

User workflow and limits: [Chinese operating guide](../HRTEM_BASELINE.zh-CN.md),
[Task A](../hrtem-saved-band-task-a.md), [Task B v2](../hrtem-candidate-task-b.md).
These give real tool names, input requirements, source/coordinate/reference/model
boundaries, actual next-tool outputs, save/query behavior and export contents.
Synthetic software qualification does not establish real material physics or
human GUI usability. The free-text hypothesis is not parsed or tested.

Repository: `C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-baseline-local-20261106`.
Branch: `research/hrtem-baseline-local-20261106`.
Reviewed base: `542256d1f8a72b8c4b6bc5134155cb7ccfb5e4b5`.
The final closeout HEAD is recorded externally in `review/REVIEW.json` to avoid
a document referring to its own not-yet-created commit hash.

## Remote main and integration boundary

GitHub connector `fetch_commit(repo_full_name="wuchqwq/microscopy-workbench",
commit_sha="main")`, checked **2026-11-06 13:25:02 UTC**, resolved main to
[`31f4f014a4293d24de72402727b1efd084fc1022`](https://github.com/wuchqwq/microscopy-workbench/commit/31f4f014a4293d24de72402727b1efd084fc1022).
This was also the initial check result at 13:11:16 UTC.

The exact remote commit already exists locally. `git merge-base --is-ancestor`
returns 0; at the reviewed base, `git rev-list --left-right --count
31f4f014a4293d24de72402727b1efd084fc1022...HEAD` returns `0 6` (behind 0, ahead 6).
There are no new remote commits or overlapping remote changes to integrate.
The final receipt records the count including this closeout commit, the exact
local commits, per-commit patches and diff. No rebase/merge/fetch was needed.
Configured origin still points at the original local handoff bundle; it was not
silently changed to GitHub. No remote write, F: access or STEM work occurred.

## Minimal corrections

Before this increment, `image_export` admitted scientific arrays/tables but no
saved Task A method-plan summary, and review export omitted the readable Task B
sidecar. This was a real gap between saved observations and user handoff.

Export now narrowly admits `method-decision.json` and available
`peak-comparison.txt` for a `method_plan` whose explicit goal is
`peak_roi_comparison` and which has a saved comparison decision. Discovery review
exports also include their existing `candidate-review.txt`. Available PNG and
manifest/provenance follow the existing exporter. Unrelated method plans remain
unsupported, overwrites remain refused, and no parent GPA arrays are claimed
to be part of a report export. No numerical engine, tolerance, historical decision,
source array, budget, schema identity or old saved artifact changed.

The Chinese capability page now describes implemented Task B v2 and the actual
operating routes instead of calling Task B unimplemented. Its commit/report table
links each earlier improvement and limitation. Unpushed commit SHAs are given as
local `git show` targets, rather than pretending nonexistent remote links work.

## Bounded acceptance and retained artifacts

Sibling directory: `hrtem-final-evidence-20261106`.

- `cases-final/closeout-inputs.json`: exact workspace, result/request/GPA IDs and
  filenames for six fresh analytic cases. Task A reuses the established
  `SavedComparison.seed` construction: observed amplitude ratio about 1.6 and
  phase +/-0.4 rad, plus low-amplitude null/refusal. Task B reuses the existing
  explicit-candidate generator: nonzero image closure, valid zero-net opposition,
  low-amplitude path refusal and identical-pixel contrast-vortex counterexample.
- `cases-final/*/export-worker` and `export-mcp`: actual saved text/JSON/PNG and
  manifest/provenance. Exact bytes and all export hashes match the qualified
  saved objects. GPA dependencies appear in provenance, while amplitude NPY is
  correctly absent from report exports. Existing source files remain unchanged.
- `worker-export-receipts.json`: native read/result and export read/result use
  the original IDs and match saved results; no new scientific dispatch occurs
  merely to export or reopen. Original source/reference/path/model records remain.
- `mcp-closeout-receipts.json`: six real MCP exports, original info/result and
  fresh-client reopens. Dispatch markers save original export IDs before writes;
  they refuse automatic replay. No model or GUI browser is involved.
- Actual exported pixels inspected: Task A observed and refusal, Task B negative
  and contrast-only MCP PNGs, plus the genuine transferred-GPA new-observation
  PNG. Feedback/units/next tools are legible. Existing GPA thumbnails still crop
  full legends; original GPA views and exported arrays remain the detailed source.

`transferred-band-fresh/receipt.json` is a separate consumer check over an exact
copy of the **original Linux-generated handoff**, not regenerated GPA bands.
It reads original plan `ec1a8c8a062b49eaba3ce4250204ff72`, creates a deliberately
new comparison using the same saved GPA/reference/ROI, exports and reopens it.
It checks all original 87 manifest entries and 38 copied original workspace
files unchanged. The new record/export have native Windows paths; old IDs,
decisions, source arrays and old absolute PNG pointers remain untouched.

## Commands and outcomes

Run in the isolated repository. All output paths below were new at first use.

```powershell
$python='C:\Users\13471\AppData\Local\Programs\Python\Python313\python.exe'
$evidence='C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-final-evidence-20261106'
$env:TMP=Join-Path $evidence 'temp'; $env:TEMP=$env:TMP
$env:PYTHONIOENCODING='utf-8'
$env:HRTEM_CLOSEOUT_OUTPUT=Join-Path $evidence 'cases-final'
& $python -m unittest discover -s tests -p test_hrtem_baseline_closeout.py -v
npm run build
$env:MICROSCOPY_PYTHON=$python
node dist/tools/smoke_hrtem_baseline_closeout.mjs
& $python tools/smoke_hrtem_legacy_band_export.py --payload ..\hrtem-handoff-drive-20261106\payload --output ..\hrtem-final-evidence-20261106\transferred-band-fresh
```

**PASS**: 3 focused tests, six native A/B exports and exact reopen (105.627s);
build; six actual MCP exports/fresh-client reopen; genuine transferred-band
continuation/export/reopen. Logs: `closeout-worker.log`, `build-complete.log`,
`closeout-mcp.log`, `transferred-band-fresh.log`.

```powershell
$env:HRTEM_HANDOFF_ROOT='C:\Users\13471\Documents\ChatGPT\mircograph-workbench\hrtem-handoff-drive-20261106\payload\hrtem-baseline-integration'
& $python -c "import unittest; patterns=['test_peak_comparison.py','test_peak_comparison_feedback.py','test_peak_summary_read_compatibility.py']; suite=unittest.TestSuite(unittest.TestLoader().discover('tests',pattern=p) for p in patterns); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"
node --test dist/tests/discovery-contract.test.mjs dist/tests/method-loop-contract.test.mjs dist/tests/image-evidence-contract.test.mjs
git diff --check
```

**PASS**: 17 affected Task A/feedback/historical-read regressions (12.965s),
including real transferred positive/rejection plans and tampering/threshold
controls; 11 Node contracts/transport tests; diff check. Logs:
`export-consumer-regressions.log`, `node-final.log`. GPA/topology full matrices,
unrelated GUI and model tests were not repeated; prior exact-commit reports stay
linked from the capability guide. This increment does not change those kernels.

**Initial FAIL retained:** `transferred-band.log` compared a returned creation
response with a later read, including operation-specific compatibility receipts.
Inspection showed no changed authoritative field. The check now binds every
saved field exactly and permits only the established delivery/validation additions,
checking `saved_records_modified=false`. `transferred-band-resume.log` queries
the already completed original IDs without replaying writes; the corrected
default workflow also passes in the fresh directory above. Production numerical
behavior was not changed to make the check pass.

## Qualification boundary and final review

The original Linux Task A GPA/positive/refusal metadata and compact reads are
qualified on this Windows machine under narrow versioned analytic/reduction
contracts. Native Windows new A/B results, readable exports, saved images and
reopens are qualified here. Old Linux absolute PNG pointers were not relocated;
old full image delivery, arbitrary backends/versions, new Task B cross-platform
relocation, macOS/Linux native closeout and clean-machine installation remain
unqualified. The transferred-band continuation is an explicit new record, not
a claim that historical full-image migration passed.

**NOT TESTED / NOT CLAIMED:** real specimens, true material dislocations or strain
accuracy, atomic positions/fringe tracing, automatic discovery, independent
uncertainty, unique 3D interpretation and human GUI usability. Positive/contrast
image identity demonstrates why image topology cannot independently establish
physical origin. Final independent parent review is required; no push/merge
until the parent explicitly confirms that gate is satisfied.
