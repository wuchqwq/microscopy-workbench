# Measurement-table read rejected by viewing metadata

Base: `86b758e3ea422a83a7c5bb0bce8f4d922f3d1ece`. Independent worktree;
the frozen native window, its source objects and requests were not modified.

## Evidence and cause

The parent's retained Windows snapshots `v2-relay-063` / `064` show a saved
measurement in the property panel while the table says no measurements. The
separate read-only `v2-measurement-table-read-001.json` is HTTP 200 for that exact
current view (`2d127b7debc04050ad78c8884d57468d`). Its entry
`429ce7c89a534a31a0c32cddd2eeb768` is current, same-grid, visible, and matches the
saved annotation. The scientific record exists; this is not a missing execution
or merely a history filter.

The original table reader rejected every response if the Panel's global
`state_revision` changed while waiting. That revision also advances for camera,
selection and panel preferences. The app can publish camera metadata when the
result panel opens. A rejected read leaves the old empty table; once that
metadata has been mirrored, revision polling need not load the table again.

The retained native scene has no instrumented trace of the original promise
guard. Its exact timing is therefore not asserted. A controlled actual-app
handler test independently confirms the mechanism: delay the measurement GET,
perform the existing wheel handler, wait for its camera CAS acknowledgment, then
deliver the valid table response. On the old runtime the table remains empty.

## Minimal fix

`MeasurementWorkspace` retains its default global-revision guard for existing
callers and adds an optional read-context getter. The Panel explicitly supplies
the immutable saved object (including calibration, mapping and annotations),
frame identity, and last operation. Camera/selection/disclosure preferences do
not change that context. A new measurement on the same object changes the last
operation and invalidates the older read. Exact current-object and response
identities and newest-request tickets remain mandatory.

This uses one GET, without repeated retries or a timer that can starve under
continuous camera updates. Local pending-geometry projection still hides old
values. No scientific coordinate, provider admission, record, saved precision,
explicit save behavior or scientific computation changes.

## Retained checks and limits

Local logs remain outside Git under `F:/mircograph-workbench/measurement-read-race-*`.

| Check | Outcome |
| --- | --- |
| First two fixture attempts and diagnostic | FAIL at the fixture's camera-crossing assertion: the temporary line first created a mark and changed the mock window identity; these are setup failures, not product evidence |
| `confirmed-original-failure-20261103.log` | Original product FAIL: confirmed camera acknowledgment crossed the delayed read, then table row count was 0 instead of 1 |
| Locked install and final formal build | PASS |
| Measurement presentation/export/read guards | 16 PASS: metadata churn accepts one GET; same-object new measurement, changed calibration/annotations, foreign object/response and overlapping read guards retained; legacy default revision guard retained |
| Actual app handler plus affected stale-value/disclosure consumers | 10 PASS after the fix, including the previously failing delayed GET and camera acknowledgment |
| Frozen-combination Windows retest | NOT_TESTED by this task; parent owns the native retest |

The Node tests use controlled DOM/canvas/transport substitutes. They are not
native mouse evidence or a new scientific-accuracy claim. No live API write,
FFT rerun, private data access or unrelated algorithm suite was used here.

## Follow-up: expansion during the initial read

The remaining `initialResultLayout` fallback superficially looks capable of
closing a panel the researcher opened during the first GET. The actual initial
`load()` calls `restoreUiPanels()` before starting that read, including when no
saved panel preference exists. That synchronously clears the initial-layout
flag. The toggle handler need not clear it again, and the fallback was not
reproduced as a live path in this review.

Two additional actual-app tests delay the very first measurement GET, then
either expand the disclosure or choose a result tab. They verify one pending
initial GET, delivery of a saved row, retained expansion, unchanged camera/draft/
Undo, and no scientific write. Both pass on the unchanged production fix;
together with the existing disclosure consumer, the focused result is 3 PASS.
The formal build and logs `measurement-first-disclosure-{build,tests}-20261103.log`
are retained. This follow-up changes only the test fixture and report; no
production correction or new product failure is claimed.
