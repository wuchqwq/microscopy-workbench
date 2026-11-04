# Dual ROI closeout and manual scale calibration — 2026-11-03

This is a scoped engineering candidate, not a new stable main baseline, complete
GUI acceptance, experimental sample qualification, or physical interpretation.
All runtime fixtures in this round are public synthetic TIFFs in isolated local
workspaces. No user trial window, private sample, or global setting was changed.

## Version and dependency evidence

Start-of-round main: `c8e95c38c552995cc24efa5dc9d5459ec80b02c6`.
Open parent stack checked live: #100 → #102 (`88566a8`) → #103 (`c2cdda8`)
→ #104 (`8f6f087`). Exact successful parent CI was reused. Work started from
#104, preserving desktop, explicit-save, CLI, ancestry and restoration parents.
No old PR was reapplied or merged. Main protection's two required scope checks
were not changed.

New PRs: #105 bounded history evidence (independent from #106/#107); #106 saved
annotation rendering and explicit tile/Fit; #107 selection/results/wording,
depending on #106. Known-length calibration is a separate small descendant PR.
Functional candidate SHA and final CI are recorded below after integration.

Exact-head hosted CI snapshots (both workflows and both required scope gates
successful, no manual reruns):

| PR | Exact head | Provider run | F3b run |
| --- | --- | --- | --- |
| #105 | `c05c2a815597d62a667181b5826cad509eda8029` | [41634656661](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41634656661) | [41634656725](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41634656725) |
| #106 | `42942ed32e97d410776b09c50b961f0fc94cabe9` | [41635096668](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41635096668) | [41635096574](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41635096574) |
| #107 | `6ce0fcbcf88412bdde3894d70c94744dec0cee2b` | [41635268049](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41635268049) | [41635268200](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41635268200) |
| #109 | `86b758e3ea422a83a7c5bb0bce8f4d922f3d1ece` | [41641098972](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41641098972) | [41641098866](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41641098866) |
| #110 production fix | `e6d3b3a45b20fce4a9e4502228cb714514146632` | [41654932895](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41654932895) | [41654932822](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41654932822) |

## Source annotation diagnosis and paired rendering

The same saved source object `61dceec822a241f1849b661eb9a371b9` was inspected
in a real 1280×900 browser page at Fit (0.548945) and 100% (1.0). Both saved
ROI identities and anchors existed; no switch to another history version was
involved. Original PNG hash:
`3a8adb955d033065dbd09f18fabb2dfed6fe96ae41be4eb84ecf469cbd18b282`.

Before: baked text shrank with the bitmap at Fit; ROI A's title also collided
with the gold FFT title at 100%. Shared layout's chosen placement was overwritten
by an anchor-bearing extent spread. An earlier informal observation that both
labels were discernible at 100% is retained and explicitly corrected.

After: exact-object qualified clean PNG plus its own vector annotations, using
the existing transform and placement machinery. Fit labels remain 12 screen px;
ordinary and auxiliary FFT titles are separate at both scales. The annotated
PNG and original TIFF hashes are unchanged. Failed/legacy clean qualification
keeps one baked rendering; no duplicate saved annotation overlay. The calculation
outline is noninteractive and does not replace editable ROI geometry.

Local evidence: `dual-roi-evidence-20261103/before-source-fit.png`,
`before-source-100percent.png`, `before-readability-qualified-findings.json`,
`after-source-fit.png`, `after-source-fit-dom.json`,
`after-source-100percent-loaded.png`, `after-readability-findings.json`.
The after runtime build was `a618444` (source plus initial companion UI); final
candidate native coverage is recorded separately. 100% camera placement used an
explicit metadata protocol, not a native gesture.

The first after-100% capture caught transient loading and remains retained as
`after-source-100percent.png`; it is not presented as the completed outcome.
Original indefinitely blank Windows scene remains NOT_REPRODUCED.

## First failures and scoped validation

Implementation reports retain original context-menu, stale table, modal,
annotation-title collision, TS narrowing, old-wording and camera-hook failures.
Source smoke's wrong source-vs-dist invocation failed before provider startup.
The visual controller's closed stdin and raw-savepoint resume attempts are
separate infrastructure failures. The corrected controller uses the official
resume projection and stopped-owner recovery, then closes the existing fixture
normally. No unknown scientific operation was replayed.

Source implementation: formal build, 122 directly affected consumer checks,
5 final camera-intent checks, clean-base corruption negative and one real
MCP/HTTP seam. Saved historical A is not replaced by later B, two NPY files and
source are unchanged, and asset reads create no scientific requests or FFT.

Selection implementation: the recorded 221 intermediate passes are reused;
late camera-hook 2 and measurement 13 checks pass on the integrated typed API.
CSV/TSV still reads the original saved fields, including legacy aliases and
precision, even when the UI hides obsolete current values while remeasurement
is pending. Independent review found no blocking protection or provenance change;
it did not perform native gestures or certify scientific accuracy.

No discretionary unrelated FFT/GPA/topology/scattering/noise suite was run.
Hosted CI follows its existing triggers independently; no exact green SHA is
manually rerun for another reviewer.

## Long history remains a separate contract issue

Real formal tools generated 13/64/65 source records, not fabricated metadata.
13 and64 pass saved asset, one FFT each, exact-source return, explicit save and
normal reopen. At65 provider knows the frame but Panel exhausts its traversal:
frame=null, no eligible source window, FFT400, actual FFT requests/objects0.
Save/normal reopen complete but preserve null frame. The extra receipt is the
original preview acknowledgement, not a new FFT or context.

Original source and28/130/132 object files remain byte-identical. This workflow
uses11/62/63 annotation revisions plus view/frame records; it is not a universal
edit threshold or a confirmed #103 regression. #108 proposes explicit ancestry
exhaustion and a compatible saved-null recovery path. No production depth,
constant, ancestor check or cross-request cache is changed. See #105 report.

## Final native candidate and remaining scope

The first native preflight used functional `47635c5`, with the user's explicitly
requested GPT-6.1 Terra as the sole UI actor. Actual native gestures established:
known-length dialog cancellation and later application, two overlapping ROI
creations, each ROI's movement and resize, and Delete inside a text field without
retracting either ROI. It was deliberately stopped before FFT when independent
tail review found one missing admission-error correlation branch. This is
preflight evidence, not the final frozen-version workflow.

It then explicitly saved and closed normally (launcher exit0), preserving the
workspace. Saved ID: `save-ddfdb398-d15f-4c77-91f7-69d4affc8031`, revision1.
Read-only pairing of `native-cancel-calibration.json` and
`native-preflight-closed.json` confirms all six earlier object files and source
TIFF unchanged. There are zero FFT/measurement requests. The17 requests include
the original open/frame/view, one calibration, ten annotation revisions, another
view and two preview acknowledgements. No completed FFT was rerun in restarting
the final workflow. The first during-save snapshot is kept; the post-close
savepoint, not that transient display snapshot, establishes the saved result.

The combined native run then froze `86b758e` after the admission fix. A plugin
update removed the old Computer Use namespace; both Terra sessions lacked the
replacement Node tool, while the root session exposed it. GPT-6.1 Terra chose
each action and independently inspected the saved actual screenshots/AX. Root
relayed each action using only the official `@oai/sky` native input API, with
one action then a fresh capture. This is a transparent relay, not a claim that
the child directly possessed the input tool. No DOM or scientific write API
substituted for these gestures. The root's filesystem/API checks are separately
labelled read-only evidence, not additional mouse acceptance.

The isolated workspace is `native-final-v2-workspace` under the local evidence
directory; action records are `v2-relay-actions.jsonl`, captures are
`v2-relay-NNN-region0.jpg` with matching AX/meta. The actual ordinary desktop
window was 1429x907 logical pixels. Scope established so far:

- A real source line of 348.99457075697376 px was declared 10 nm, explicitly a
  synthetic assumption, giving positive isotropic XY 0.028653740882873535 nm/px.
  Open/cancel leaves all six earlier files and request count unchanged. Apply
  creates one versioned calibration; original TIFF and earlier files unchanged.
- Two partially overlapping ROIs created, each moved/resized. Delete inside an
  actual text field changes text without deleting either ROI. Canvas Delete
  retracts only the selected ROI; one Ctrl+Z restores exact identity, geometry,
  label and status. Right-click overlap list selects the covered ROI without a
  scientific write or new object.
- One FFT for each ROI, exactly two FFT requests. Clicking the comparison source
  activates through the protected switching path, without drawing on that first
  click. Explicit tile-and-Fit displays source and both FFTs with distinct labels.
- Moving ROI2 afterwards creates a new source revision. All 38 earlier files,
  including both original FFT inputs and arrays, remain unchanged. Gold historic
  calculation regions stay distinct from current cyan editable ROIs.
- A demonstration FFT2 point measured once: g1, conditional geometric period
  0.313181089988792 nm, with sourced scale and unknown uncertainty. This is not a
  true-peak localization, crystallographic assignment or physical calibration
  accuracy test.
- Ctrl+S, visible saved/readback confirmation, normal Alt+F4 and launcher exit0.
  Save ID `save-cebbc4bd-db8b-48a8-a432-4a0418136c40`. Same workspace/profile
  reopened without `--source`: all 43 scientific files unchanged, zero new
  objects/FFT/measurements. Both FFT windows and saved analysis remain.
- From restored FFT1, native Return Spatial opens its exact historical ROI
  version. Explicit View Latest ROI opens the later moved ROI2. No new requests,
  arrays, measurements or FFTs were produced by these navigation operations.

First actual failure retained: captures063/064 show sidebar g1=0.3131811nm but
the result table says no measurements. A separate real read-only HTTP query200
returns one current, same-grid, visible, annotation-matching entry bound to the
exact current object. This is presentation synchronization failure, not missing
scientific data. A controlled in-memory replay with that real response confirms
that a same-object metadata revision causes `MeasurementWorkspace.refresh` to
reject the read; the actual app handler also reproduces the race across camera
CAS. A minimal independent fix is being validated separately. No remeasurement
was used to hide this first failure.

The first peak-revision drag used the point's earlier pre-results-layout screen
position and instead made a temporary selection. A second attempt failed to
deliver a confirmed refreshed observation; re-observation and read-only requests
show no additional saved operation. These are retained as missed/unknown gesture
scope, not a successful peak revision or an invented product peak error.

At 755x907 actual native size (not exactly760x800), the property drawer closes
and returns the image to full width. Save/close/help remain reachable; Chinese
help opens/closes, native File menu shows open/save/exit, and the results area
opens with a clear history-filter message on the spatial view. Size gestures
that selected page text, then the successful native system Size interaction,
are retained separately. Exact760x800 remains NOT_TESTED in this run.

The race fix is #110, production `e6d3b3a`; both hosted workflows and both scope
gates pass. Independent actual-app delayed-read reproduction changes FAIL→PASS,
with16 measurement checks and10 directly affected app checks. An additional
initial-read disclosure concern was investigated, not blindly patched: existing
initial load already clears the layout flag before the first GET. Two delayed
initial-GET consumers pass while retaining the user's expansion, camera, draft
and Undo, with zero scientific writes. Test/report-only `b57e0d0` has identical
production source to e6 and adds these checks.

After normal closing86, a formal build froze `b57e0d0` and reopened the same
saved workspace/profile without a source argument. Native protected activation
of existing FFT2 yields the old g1 in the table: 1/1,0.3131811nm,FFT2,current
(capture092). All43 scientific files,24 request records,2 FFTs and1 measurement
remain unchanged. This is a targeted retest using existing saved data, not a
new blind test and not a remeasurement to conceal the original empty table.
Computer Use model capacity interruptions were retried with the same user-
specified6.1 Terra; no other model was substituted for the Windows decisions.

The new explicit peak gesture094 moves the selected saved g1 to
`[0.11474643501820203,-0.11981883063409275]`. Pending geometry correctly hides
the old value. Exactly one annotate request `panel-1ecac89e0790c8e7-1` and one
automatic remeasure `panel-1ecac89e0790c8e7-2` complete. The latter explicitly
references old measurement `429ce7c89a534a31a0c32cddd2eeb768`, yielding new
`5c20180cd58d42bdbd61df9ac9e11eed`, period0.1727154166876368nm. Capture097
shows current0.1727154 and historical0.3131811 as distinct FFT2 rows. All43 old
files and source remain unchanged; FFT count stays2. The evidence script's
`measure:1` summary counts the original `action=measure`; the additional
`action=remeasure:1` is explicitly recorded, and there are2 measurement objects.

Ctrl+S099 confirms saved/readback, save
`save-4e0425c8-3b3d-4f76-81f5-2e60dd20882f`, then normal Alt+F4 and launcher
exit0. Same workspace/profile reopened without `--source`: captures100/101 show
the new g1 and both correct result statuses. All46 saved scientific files are
unchanged; requests stay26, FFT2, measure1 plus remeasure1. See local
`v2-peak-revision-pairing.json` and `v2-revised-save-reopen-pairing.json`.

A suspected extra peak outline in095 was boundedly investigated. An initial
PNG visual interpretation was wrong and is explicitly corrected: raw clean
FFT has zero cyan markers; old annotated PNG has52 cyan pixels at the old point
and0 at the new point; new annotated PNG has0 at the old point and52 at the new.
Current clean bytes/hash match the unannotated raw FFT, and canonical annotation
and selection are both the single new point. No producer baking defect is
established. The exact transient UI outline layer was NOT_CONFIRMED; no code,
historical PNG, scientific object or protection was changed to fit that guess.

The final source return103 on b57 also succeeds after revised save/reopen:
ROI2's old source geometry is restored, the latest-ROI entry stays separate,
both FFTs and both measurement objects remain available, and no new requests
are created. This is not a new FFT or a substitution of the later moved ROI.

Final narrow supplement107/115 reaches native capture760x907. It does not
establish an exact760x800 CSS page or native window. The official API refused a
drag endpoint outside the current window. A user-model-authored bounded keyboard
policy presses one Down then observes; it stopped at the first no-growth result.
Escape cancels the temporary sizing and restores760x907. These tool limitations
and transient smaller captures are retained, not counted as a product failure
or a successful800px test. The earlier755x907 help/menu/results/drawer checks
remain the actual scoped evidence. With properties open, this existing layout
still reserves sidebar width; closing it restores image width. That tradeoff
remains subject to the researcher's experience review, not a whole-layout PASS.

Subsequent user review correctly rejects the reserved-column narrow layout:
the upper/lower empty column and wrapped tools waste image space. The separate
`narrow-layout-20261104.md` follow-up restores the existing bounded overlay
drawers. The earlier reachability evidence is not approval of that layout.

After115, the next requested Ctrl+S was rejected by the official tool because
user input was detected. Root made only an AX-only read: still the public TIFF,
workspace showing unsaved changes. No save retry, further mouse/keyboard input,
new screenshot or forced close followed. The window is left open for the user.
That last save is NOT_CONFIRMED and is not evidence of a new savepoint; the
earlier explicit revision2 save/normal close/reopen above remains verified.

Original persistent all-blank scene is still NOT_REPRODUCED; real samples,
scientific peak/ruler accuracy, exact760x800 and full GUI/human usability remain
unqualified. The86→b57 work is a preserved first run plus targeted correction/
retest; it is not presented as a fresh blind end-to-end trial of every gesture
on the final SHA. Report/test-only commits do not change the frozen production
code. Final report-head hosted checks are recorded in the PR, independently
from the already-successful exact production-fix runs above.

## Start, inspect and recover

The current user-controlled window runs the formal build of
`b57e0d0cf91727ed73830638b2a7d5bed09a1670`, production-identical to e6d3b3a.
Source checkout: `F:/mircograph-workbench/dual-roi-presentation-20261103`.
Evidence root: `F:/mircograph-workbench/dual-roi-evidence-20261103`.
No source rebuild or checkout is needed in the user's running window.

After the user closes that window normally, resume the same analysis without
`--source`, new preview, repeated FFT or a new scientific workspace:

```powershell
Set-Location F:/mircograph-workbench/dual-roi-presentation-20261103
$env:MWB_DESKTOP_PROFILE = 'F:/mircograph-workbench/dual-roi-evidence-20261103/native-final-v2-profile'
npm run desktop -- --workspace F:/mircograph-workbench/dual-roi-evidence-20261103/native-final-v2-workspace --python F:/mircograph-workbench/windows-validation/.venv/Scripts/python.exe
```

For a fresh development checkout, the ordinary preparation remains `npm ci`,
`npm run build`, `npm run desktop:install`. Both locked installations were
already completed in this candidate checkout. This is a development-machine
desktop prototype, not stage-three clean-Windows installation qualification.
The formal launcher and CLI `--help` commands were checked again successfully.

For Agent read-only handoff, select the explicit saved version rather than
guessing the GUI's current unsaved geometry:

```powershell
npm run mwb -- inspect --workspace F:/mircograph-workbench/dual-roi-evidence-20261103/native-final-v2-workspace --python F:/mircograph-workbench/windows-validation/.venv/Scripts/python.exe --save-id save-4e0425c8-3b3d-4f76-81f5-2e60dd20882f
```

After an unknown scientific operation, use existing `query --request-id ID`
with the original ID. Do not replay the request or generate replacement FFTs.
For a paused GUI switch, use its existing readback/recovery entry; a failed
asset read rereads the saved asset, without a new preview. The original blank
scene was not reproduced or closed merely because bounded reads were faster.

In-panel help is `使用说明` (also F1). For manual TIFF scale calibration:
use `测量线 (L)` on the source image, select that line, open `用已知长度定标`,
enter the known length/unit, confirm the positive isotropic XY assumption, then
`应用新标定`. Ctrl+S separately saves the analysis workspace. The measured bar
and physical length remain researcher-supplied evidence with unknown uncertainty.

## Review order and residual scope

Existing unmerged parents remain #100→#102→#103→#104. Review #106→#107→#109→#110
on that stack; #105 is independent history evidence based on #104. #108 is the
unimplemented ancestry-contract issue. No merge or main-baseline move occurred.
End-of-round main is still `c8e95c38c552995cc24efa5dc9d5459ec80b02c6`.
The live branch endpoint confirms protected=true and required `CI scope gate`
and `F3b scope gate`, enforcement=everyone. The full administration-protection
endpoint returns403 for the connector, so additional settings are not freshly
asserted from that endpoint. No protection rule was changed.

Outstanding: the65-record source limit (#108), the original indefinite blank
scene, exact760x800/recovery-fault native reachability, the unconfirmed transient
outline layer, and the researcher's experience review. Native scientific peak/
ruler accuracy, real specimens and clean-machine installation/upgrade remain
outside acceptance. DM feature gaps are not automatically made future tasks.
Raw first failures, capture sequences and all public workspaces remain local;
no private specimen data, screenshots or metadata were uploaded.
