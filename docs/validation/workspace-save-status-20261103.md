# Workspace save status during GUI handoff — 2026-11-03

Base: `d4b48a975710c991c026fd7324fff9c58c835644`. This is a presentation
correction, not a save lifecycle or scientific-provider change.

The independent native review observed saved analysis A followed by ROI label
and geometry edits B while the top status still said `分析工作区已保存` and the
lower status reported an operation in progress. Original native evidence remains
in the separate isolated public-synthetic review directory; it is not replaced
by this controlled regression.

The code did already report local fields, geometry, and queued edits through
`dirty()`. The missing input was processing state: after an annotation response
cleared the local queue, final draft publication could still be pending while
the last analysis-state response remained clean A. The top control read only
local dirty and server analysis status. A separate nearby display defect also
showed the previous clean savepoint after a save acknowledgement was lost,
although the original save ID was correctly retained for query.

The control now accepts a display-only activity signal. Active processing shows
`操作处理中 · 保存状态待核对`, or retains the unsaved-modification indication
when edits are dirty. Failed or unconfirmed handoff shows that editing remains
preserved. An original unresolved save ID shows `原保存结果待核对 · 请查询原保存`.
Original scientific/save unknown-state messages take priority over ordinary
processing. Completion edges for automatic annotation publication and draft
publication refresh the status, avoiding a persistent processing message.

The save/readback commands, savepoint identity, dirty ownership, button admission
guards, scientific records, and no-replay recovery behavior are unchanged.
Camera-only preferences do not mark analysis content dirty. Status rendering
does not submit, retry, save, or discard anything.

Evidence retained outside the repository in `save-status-evidence-20261103`:

| Check | Result |
| --- | --- |
| Locked `npm ci` and formal TypeScript build | PASS |
| First four new controlled regressions, before production fix | 3 FAIL, 1 PASS (`first-failures.log`) |
| Actual app handler: B accepted, dirty/busy false, final draft held, server still clean A | Original falsely saved; repaired pending status PASS |
| Final draft release then dirty server readback | Unsaved status, no persistent processing: PASS |
| Workspace controls and existing save/query/restore protections | 16 PASS (`workspace-controls.log`) |
| Seven selected app handoff, readonly-camera, unknown-result and save-status consumers | 7 PASS (`affected-app-handlers.log`) |
| Native mouse verification of this repaired build | NOT_TESTED by this repair task |

The controlled app test runs the actual built TypeScript handlers with bounded
DOM/canvas/HTTP substitutes. It is not a native timing measurement. Its final
server dirty readback is deliberately injected to test the rendering transition;
it does not establish when the real native workspace becomes dirty.

Commands after `npm ci` and `npm run build`:

```text
node --test dist/tests/workspace-controls-ui.test.mjs
node --test --test-name-pattern='save status:|panel-only changes|pending recovery copy permits camera|Delete and Undo retire|an unknown ROI save|lost.*response|failed draft' dist/tests/image-panel-ui.test.mjs
```

No 289-test rerun, numerical algorithm suite, real specimen operation, or new
provider smoke was needed for this display-only diff. The live review app,
its `dist`, its workspace, and global settings were not changed by this repair.
