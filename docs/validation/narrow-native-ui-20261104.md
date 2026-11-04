# Narrow native follow-up: exact editor baselines

This increment follows native observations on functional source `891beb9` at a reported 761×801 client size. It changes presentation state and tool order only. No application window, private sample, scientific request, historical-edit protection or save engine was operated or changed during this implementation.

## Diagnosis and changes

`ResearchWorkspace` previously set `reasonDirty=true` on every input and keyed text filling only by the selected annotation ID. Restoring the original empty text with native text undo consequently left a phantom dirty reason. The existing historical-ROI edit guard correctly rejected the attempted note write; that guard remains.

The reason editor now binds its baseline to the exact immutable view, source frame and selected ROI anchor. Its baseline text is the original saved annotation note, including whitespace and Unicode, rather than the model's trimmed summary. Input compares exact text. Returning to that value clears only the reason draft. A different ROI, a different view or a late saved readback cannot turn another draft into a clean value or replace its text. Existing explicit observation verification/clear paths remain authoritative.

Installing an owned window draft uses an explicit baseline restoration method. A legacy `reason_dirty=true` flag with text identical to the saved note is reconciled. An initial orphaned flag is cleared only for a completely described owned reason-only draft whose field ID matches the selected annotation, selected mark fields and display recipe are unchanged, with no other edit, recovery copy, pending result or unresolved request/save identity in the authoritative workspace metadata. The existing metadata draft acknowledgment publishes that reconciliation; it does not apply a note or declare the workspace saved. Different reason/field/display drafts and unknown outcomes remain protected.

The existing name/color/status input handlers had the analogous unconditional flag. They now compare against the current effective edit. Reverting an unapplied field clears its field draft, while queued edits, geometry, failed measurements and display drafts remain independent. After immutable version B has actually been applied, entering old value A remains a new edit relative to B.

The left tool order is now selection → pan → ROI → point → measurement → annotation. The existing buttons, V/H shortcuts and handlers remain.

## Bounds investigation

No speculative CSS change was made. A headless page using the production HTML/CSS and exact drawer-bounds function at 761×801 reported the property panel at x=469…761 and the close button at x=713…745, with the button hit-testable. Selected ROI, expanded settings and a focused long name all retained these bounds. The 760×800, 600×801 and 1200×900 checks also kept the button visible. There were zero network/scientific requests, and no application bootstrap or native window was used.

The reported native clipping is therefore **NOT_REPRODUCED in this DOM fixture**, rather than fixed or disproved. The existing hidden performance diagnostics now include only additional viewport/client/DPR/visual-viewport and panel/close bounding numbers. These allow the next native reload to distinguish layout, scale and clipping without adding specimen text or scientific values to this geometry record.

## Bounded evidence

All evidence is retained locally under `F:/mircograph-workbench/narrow-native-ui-evidence-20261104`.

- First component failure: `research-before.log`, 19 PASS / 4 FAIL. The original unconditional dirty flag, trimmed field value and restoration behavior were independently exposed.
- First actual app-handler failure: `app-before.log`, 1 PASS / 3 FAIL. It exposed reason undo, owned hydration and unapplied field reversal.
- Component fix: `research-after.log`, 23 PASS. Includes exact empty/whitespace/Unicode values, independent ROI baselines, real draft preservation, late saved versions, existing handoff and save locks, and legacy dirty-flag reconciliation.
- Actual app consumers: `app-after-consumers.log`, 20 PASS. Includes help/collapse preservation, metadata-only saving of a historical display after unchanged-text reconciliation, negative field/display/unresolved cases, already-applied immutable field behavior, delayed observation readback, historical edit refusal, parked drafts, recovery restrictions and existing drawer bounds. These are deterministic DOM/API-port tests, not native usability evidence.
- Final guard review: `app-authority-pending.log`, 1 PASS covering mismatched field ID, an authoritative pending source-recheck request and a pending save identity. Only this added case was run after the guard tightening; the earlier 23/20 runs were not repeated.
- Static HTML check: existing tool buttons in the requested order and unique IDs; no new suite for the reversible ordering change.
- `boxes-before.json` retains the complete DOM-only geometry observations.

Presentation TypeScript was transpiled only into the separate evidence directory for these focused tests; no repository build or distribution output was changed. Formal build, native reload/Save/close behavior, actual clipping cause and real-data interaction remain **NOT_TESTED** for this increment until the separately coordinated native acceptance.
