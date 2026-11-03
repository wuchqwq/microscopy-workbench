# Dual ROI selection and result readability — 2026-11-03

Base: `8f6f08789fd7c6ae41639c1f8957170fd2d8dbff` (#104, containing the
desktop/save and #103 ancestry parents). This change is TypeScript GUI
presentation and selection behavior; no provider calculation or save lifecycle
is replaced.

## Behavior

- Ordinary ROI picking retains reverse paint order and selected resize-handle
  priority. A right-click lists the exact displayed object's overlapping ROI
  identities in that order. Hover/focus highlights the existing mark; choosing
  an item reuses the current selection path and monotonic draft revision.
  Selection adds no scientific write or user Undo item. It may publish existing
  selection/camera metadata. Pending field/geometry edits are retained rather
  than silently applied by choosing another ROI. Escape, external focus and an
  outside click dismiss the menu. Opening help dismisses it and modal Escape
  keeps priority.
- Measurement rows show names, saved quantities/units, source FFT names when
  available, and current/historical/pending status. Details keep the original
  endpoints, exact precision, IDs, calibration, scientific grid and qualification
  JSON. Saved `pixel_period` and frequency can be shown together without filling
  unknown physical scales. CSV retains all previous column positions and adds
  the saved pixel-period field at the end.
- Local geometry edits hide current old values while awaiting remeasurement.
  A table still bound to a previous input view is projected as historical until
  fresh provider readback. This does not compare the immutable measurement's
  parent ID to a display wrapper: a freshly qualified current table remains
  authoritative even when that old parent differs. Records are not rewritten,
  and rendering never initiates measurement or FFT.
- Empty results distinguish no measurements from history hidden by filtering.
  The latter retains the history checkbox. Compact content does not close a
  disclosure the researcher explicitly opened. Existing per-view panel
  preferences remain the only restored disclosure authority.
- Mark/display actions are named “应用标注修改” and “应用显示”; workspace
  save remains “保存工作区 / Ctrl+S”. Existing annotation auto-application and
  the display's local-preview/apply distinction are explicitly described.
  Observation UI says “已记录 / 应用 ROI 观察” while retaining the actual
  immutable record/readback and handoff schema. Export remains a separate action.
- The left ROI/selection tools remain accessible; duplicate bottom entries are
  hidden without removing their existing handlers. Plain tiling is in the
  existing window list. The single “平铺并适应全部” button is intended to bind
  the separately reviewed `WindowWorkspace` implementation at integration;
  this isolated tree does not claim that new method is already present.

## Evidence and limits

Local evidence is outside Git under `F:/mircograph-workbench/dual-roi-selection-*`.
Original failures are retained rather than overwritten:

| Check | Result and scope |
| --- | --- |
| Two new context-menu checks against the original built app | 0 PASS / 2 FAIL; original handler absent |
| Original table binding after input revision, before fresh readback | FAIL: old row still presented current |
| Initial TypeScript union narrowing | First build FAIL retained, corrected |
| Main app, measurement workspace and static entrypoint checks | 221 PASS / 0 FAIL at that intermediate tree; not a final whole-product count |
| Final context/disclosure/help and existing ROI consumer subset | 17 PASS / 0 FAIL |
| Observation presentation/handoff checks | 18 PASS / 0 FAIL; an intermediate old-wording assertion FAIL is retained separately |
| Measurement projections/export/precision and stale binding | 12 PASS / 0 FAIL; fresh-wrapper qualification positive case additionally checked |
| Context picker → native-help modal priority | First controlled 1 FAIL retained; final focused picker/help subset 5 PASS / 0 FAIL |
| Late observation success-message consumers | Original two old-wording assertions FAIL retained; updated consumers 2 PASS / 0 FAIL |
| Native Windows gestures, narrow actual-page layout, combined tile/Fit and save/reopen | NOT_TESTED by this isolated task; required after integration |

No FFT/GPA/topology/scattering/noise matrix was run. DOM/canvas/API substitutes
are not native gestures, protocol admission evidence or scientific accuracy
qualification. Original source objects, scientific coordinates, calibration,
measurement precision and immutable execution records are not changed here.
