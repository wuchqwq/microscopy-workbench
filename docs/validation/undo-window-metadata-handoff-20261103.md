# Undo and window-camera handoff regression — 2026-11-03

Scope: GUI presentation metadata after an annotation revision. No numerical
algorithm, scientific identity check, server admission rule, savepoint lifecycle,
or request recovery rule changes.

## Original failure retained

An independent Windows computer-use review of source
`a11c2fd0dbf40e02b469ff9269fc5eb4ff53c15b` created three ROIs, moved/resized
one ROI, deleted it, and restored it with Undo. A subsequent ROI FFT was refused
with `Stale object revision; reload before editing`; another ROI and workspace
Save also failed. The original screenshot/report remain outside the repository
under the isolated public-synthetic review evidence directory. They have not
been replaced by later passes.

The captured frontend performance diagnostic and backend both named the same
current annotation object. The frontend reported no active gesture, queued edit,
or busy action; its Panel draft was clean, while the analysis workspace still
contained unsaved work. These are different state layers. Read-only journal and
object inspection found seven completed annotation requests, an original source
and view, and no FFT request/object in that particular captured workspace.
That absence was checked in the records, not inferred from a GUI refusal.

## Defect and bounded repair

`WindowWorkspace` retained a camera write failure after the exact window/object
target had been replaced by an accepted annotation revision. Later FFT/Save
preparation encountered that old failure before submitting its action. A late
response for the old target could also restore the failure after replacement.

Camera failures now retain their exact window/object scope. Only a validated,
non-older accepted window collection can retire a replaced or closed camera
target. Failed camera writes are not replayed. Failure of an unchanged passive
or active target remains blocking. Equal-value rendering cannot silently retry
a failed camera write; an explicit different camera intent or qualified readback
can resolve it. Independent layout/context errors remain separate and blocking.
Invalid, mismatched, and older reconciliation snapshots do not clear failures.

Multiple camera failures are retained independently, so retiring the latest
failure cannot lose another window's failure or leave a hot metadata wait loop.
A newer camera intent for the same target which predates the old failure's
arrival remains conservatively blocked until a further explicit adjustment or
reliable readback. No unknown scientific action is retried.

The ordinary `sync(invalid)` display fallback retains its previous behavior of
hiding the collection and clearing its current revision baseline. This patch
does not add a cross-state revision high-water mechanism; the new invalid-input
guard applies specifically to explicit metadata reconciliation.

## Verification and remaining limits

Local evidence is retained separately in `undo-handoff-evidence-20261103`:

| Check | Result | Evidence |
| --- | --- | --- |
| Locked dependency installation and formal TypeScript build, isolated worktree | PASS | `npm-ci.log`, `reconcile-qualified-build.log` |
| First controlled camera handoff regressions on the original implementation | 3 FAIL, 1 PASS | `retired-camera-first-failures.log` |
| Independent review's multiple-failure, old-empty-snapshot, and layout-error negative cases before refinement | 3 FAIL | `reviewer-first-failures.log` |
| Actual app handlers with delayed fake HTTP: camera request → Delete → late old refusal → Undo → FFT with the restored current object → explicit workspace Save | Original module FAIL; repaired module PASS | `app-and-reconcile-original-first-failures.log`, `reconcile-qualified-regression.log` |
| Invalid/mismatched readback negative case | Original module FAIL; repaired module PASS | same logs |
| Final directly affected UI/Node/Panel HTTP consumer tests | 289 PASS, 0 FAIL, 0 SKIP | `final-affected-consumers.log` |
| Native mouse/keyboard retry of the repaired build at the original Windows scene | NOT_TESTED by this repair task | Requires separate computer-use retry |
| Real specimen scientific accuracy, full GUI acceptance, other OSes | NOT_TESTED | Outside this change |

The intermediate `scoped-map-regression.log` contains one test assertion failure
which counted a required read-only asset GET as a write replay. That count was
corrected to count only POSTs; the original log remains retained.

Final scoped command, after `npm ci` and `npm run build`:

```text
node --test dist/tests/window-workspace-ui.test.mjs dist/tests/image-panel-ui.test.mjs dist/tests/image-panel-windows.test.mjs dist/tests/image-panel-window-activation.test.mjs
```

The app test executes the actual TypeScript-built app and window manager handlers
with deterministic DOM/canvas/HTTP substitutes. The Panel tests exercise the
existing real HTTP protocol against a bounded fake scientific client. Neither is
native mouse evidence or numerical-provider validation. No scientific serialization
or numerical interface was changed, so no new numerical/provider smoke or
unrelated FFT/GPA/topology/scattering/noise suites were run.

The live review app, its `dist`, and its workspace were not modified by this
isolated repair. No private image, screenshot, or specimen metadata is included.
