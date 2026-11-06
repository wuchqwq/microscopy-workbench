# Scoped desktop evidence notices

Base: `979a741b16a767fae0fee8f54283add3e99af653`.
This is a presentation-only follow-up to saved-statistics retrieval. It does not
define a question-driven research workflow or change provider records/statuses.

| Before | After / existing entry |
| --- | --- |
| Results badge: `尚无测量` | `峰位/测量线：0 条`, explicitly the count of that table |
| Empty table prompted a new peak/line measurement | States that this does not mean ROI statistics or FFTs are empty; a button opens the existing same-frame statistics history, and names the existing Window menu for saved FFTs |
| FFT observation list: `当前图没有空间 ROI` | Names the current FFT/reciprocal domain and explains that spatial observations belong to the source image, not spectral selection |
| General `尚未评估` could look like no analysis | Names the saved object and each unassessed aspect's original scope; does not empty or reclassify other evidence |

Qualified `spatial_return.status=ready` describes only the verified return
relationship. Return to Spatial Observation remains conditional on its actual
button state; it does not imply Original/FFT Comparison is available. Without that qualified return,
the notice explicitly says a verified return is unavailable; it does not invent
an association from ROI bounds. These are explanatory labels over existing
controls; no navigation policy, scientific question, algorithm, write format or
result identity changes. The same existing statistics dialog is reused from the
measurement tab, statistics tab and Analysis History menu.

The original assessment scope/basis/status and its source fields remain intact.
The new scope prefix is presentation only. Unknown/legacy/unavailable assessments
retain their existing handling. Next steps are left to the user's research
question; period measurement is not automatically proposed as a contrast answer.

Validation commands:

```text
npm run build
node --test dist/tests/measurement-workspace-ui.test.mjs dist/tests/research-workspace-ui.test.mjs dist/tests/result-semantics-panel.test.mjs dist/tests/image-panel-statistics-history.test.mjs dist/tests/image-panel-ui.test.mjs
git diff --check
```

Build PASS; targeted checks 319/319 PASS, zero skips. Direct checks cover scoped
empty counts, all statistics entry bindings, qualified/unavailable FFT returns,
non-FFT presentation, exact unassessed scope and unchanged source state. No
unrelated algorithm or full compiled compatibility suite was rerun for labels.
Private Electron operation/hash receipts remain local, outside the repository.
Hosted CI, Mac, human usability and new material/physical validation are not
claimed by this unpushed patch.

Actual local Electron follow-up passed: the measurement-empty button displayed
both previously saved statistics, qualified Return to Spatial Observation
restored the original source observations, and the same saved FFT was activated
again. Native Save completed before audit, native Exit returned zero, and a
second desktop process showed the scoped notices and opened the same statistics
again. Read-only receipts verified the original hash and all 67 existing provider
object/request files unchanged, exactly two statistics and two FFT requests, zero
new scientific requests, and identical completed savepoint/manifest after reopen.
Screenshots and AX observations in this turn are new evidence, not replacements
for missing earlier screenshots. Private receipts distinguish tool-return images
from any locally saved files. Whole research-workflow design remains deferred.

## Follow-up: separate persistent return evidence from operation availability

Review base: `02a97f587f6ffffff6583b49ce45eb44d040aba9`.
The earlier notice incorrectly recommended both controls from `ready` alone.
The narrowed text says the return relationship is verified, asks the user to use
Return only when its button is available, and explicitly states that verified
evidence does not mean an operation is currently clickable. No comparison
availability is promised. No actual button/handler, identity check or async gate
is changed.

Direct cross-checks cover an active FFT with ready return but no optional
`source_reference`: Return remains enabled, Comparison remains disabled, and the
notice makes no comparison promise. Presentation checks additionally exercise
dirty, busy, gesture, unavailable, unknown and absent-relation cases without
mutating their source state. The earlier ready-only expectation was replaced by
these assertions, not deleted. Follow-up build PASS and
`node --test dist/tests/research-workspace-ui.test.mjs dist/tests/image-panel-ui.test.mjs`
PASS 285/285, zero skips. Other unchanged suites are not repeated.
The normal Electron workspace was reopened and the narrowed notice inspected
visually and through AX. Unavailable/blocked cases remained controlled fixtures,
not edits to the private specimen workspace. Its original file, all 67 provider
files and completed savepoint set remained unchanged. Local audit JSON and a
manually transcribed AX excerpt are explicitly not complete raw GUI receipts;
the new screenshot exists only in the conversation tool return, not a local PNG.
