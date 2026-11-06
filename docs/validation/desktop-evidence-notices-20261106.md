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

Qualified `spatial_return.status=ready` names the existing Return to Spatial
Observation and Original/FFT Comparison controls. Without that qualified return,
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
