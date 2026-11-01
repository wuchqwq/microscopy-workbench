# Shared-workspace handoff: first-slice execution record

Original container record: 2026-11-01. The section below retains the first-slice
author evidence and limitations; the independent Mac continuation is appended at
the end. Do not treat the original author checks as final Mac acceptance.

## Source and scope

The independent container received GitHub workflow artifact 13083072119 from
main push run 41305436279. ZIP SHA-256:
`843b66f6246296fd3bab05732bd45ddd61e02ea1a7bf01c98568238da74559c1`.
Its `tested-commit.txt` names `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`.
After extraction the entire Git tree was independently reconstructed as
`82facfce75c5909c510cb5014e228918904f5de4`, matching GitHub main at inspection.
The local temporary Git commit is only an archive baseline, **not** the original
Git commit/history. Neither main nor any frozen baseline was edited remotely.

Changes: additive, pure `roi_handoff.interaction_gate`; GUI continuation refuses
pending result/save/unresolved-operation states; the button confirms draft
publication and rereads exact Panel/object/draft/helper identity before forming
its prompt. Existing command guards, saved object schemas, scientific arrays,
thresholds and the custom runtime transport were not changed. No dependency was
added. The architecture decision and reusable Skill document both entry routes.

## Executed checks

| Check | Result / scope |
| --- | --- |
| Before-patch source plus completed new regression harness | **88 PASS / 12 FAIL / 0 SKIP** across 100 focused tests. Preserved old source; failures cover handoff readiness and fresh-read/draft acknowledgement, plus the new metadata contract. |
| Patched focused suite | **100 PASS / 0 FAIL / 0 SKIP**: real GUI event handlers in a deterministic DOM/API harness, shared pure metadata and controlled MCP response projection. Not real browser gestures. |
| `npm run typecheck` and build | PASS with supplemental compiler versions below, not a lockfile-install claim. |
| Full `npm test` including pretest build | **407 PASS / 5 conditional SKIP / 0 FAIL**, 412 total. Do not add the focused count to this total. |
| Actual `npm run test:science` | PASS: TIFF -> signed calibration -> ROI FFT -> 0.8 nm measurement -> NPY/direct DFT -> display-only revision -> restart recovery -> actual Panel HTTP; source unchanged. |
| Diff whitespace | PASS. |

The regression matrix includes pending results, pending/failed persistence,
missing draft flags, submitted unknown outcomes, clean Agent-first source preview
without fabricated ROI, failed draft delivery followed by explicit retry,
queued result appearing after last browser load, and changed current view.
No test accepts a queued result or replays scientific work to make handoff pass.

Local environment: Linux, Node 22.16.0, Python 3.13.5, NumPy 2.3.5, SciPy 1.17.0,
Pillow 12.3.0, tifffile 2026.5.15. Network `npm ci` could not finish successfully;
local validation used available TypeScript **5.8.3** / Node types **22.19.7**,
not package-lock's TypeScript 5.9.3 / Node types 18.19.130. The dependency manifests
are unchanged. Local Codex/CI must independently run `npm ci` and the final exact
source tree with locked dependencies before merge.

Retained harness failures: initial extra app tests lacked the DOM stub's native
`showModal` method; the stub was completed and both before/after source rerun.
The first science command named a nonexistent interpreter and failed ENOENT before
any scientific operation; rerunning with the discovered actual absolute Python
path passed. The failed logs remain separate, not retroactively marked PASS.

## Not established by this slice

No real Mac browser/Agent round trip was performed in this container. No
researcher usability test, independent material truth, automatic model launch,
SDK-backed transport, new protocol qualification or concurrent-write engine is
claimed. This is not permission to treat the advisory gate as a durable lock,
approval grant or scientific qualification. Read current state and use existing
expected-object/draft guards at presentation time.

Local Codex should independently review/apply the patch in a new branch, run its
locked environment, then implement and exercise both entry routes according to
[the architecture decision](SHARED_WORKSPACE_ARCHITECTURE.md). No merge or tag is
authorized by this execution record.


## Independent Mac review and continuation (2026-11-01)

The supplied ZIP/patch were treated as review material. The patch hash was
`7de99e890929b7729eb48a2ac5d1e3f8cfc990a38e410fbb7640851251f3247e`;
application in a new branch based exactly on `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`
produced the author's claimed tree `13f6853f90846c186ecc9c3500631d181ea78149`.
The frozen baseline and previous worktrees were retained.

Independent review did **not** accept the initial passing tests as sufficient.
Six reproducible issues were found and fixed:

1. Clean draft acknowledgements still had a 100 ms coalesced persistence timer;
   each handoff retry could schedule it again. Explicit handoff confirmation now
   flushes the existing journal before replying; synchronous failures remain
   visible and the current in-memory draft is retained.
2. Measurement-row selection and cancelled mark gestures could change selection
   without advancing/publishing its draft revision. Both now do so; meaningful
   gesture start also invalidates reads already in flight.
3. An action could start and fail while a handoff GET was suspended, leaving
   `busy=false` again. A monotonic local interaction epoch covers the entire
   action cycle, including lost responses, and is captured before the first await.
4. A delayed refresh could adopt an old AI FFT after a new clean human ROI was
   drawn. It now retains the human view/selection and offers the late view as pending.
5. Accept/discard reads had the same gap, and acceptance cleared its notice too
   early. Request, decode and publication boundaries are checked; a refused load
   cannot continue into acceptance. New editing after a click remains protected.
6. The helper accepted a stale clean draft revision for `accept-result`.
   It now returns 409 without changing the current selection or pending science.

Independent post-fix probes: five deterministic UI race scenarios PASS;
three real localhost HTTP durable confirmations PASS; stale acceptance returns
409 and preserves the newer selection and original queued result. The production
science provider, thresholds and MCP transport are unchanged.

### Locked Mac checks

macOS 26.6 arm64; Node 22.23.4 / npm 10.9.9; independent Python venv 3.13.18.
TypeScript 5.9.3 and `@types/node` 18.19.130 exactly match the unchanged lockfile.

| Actual execution | Result |
| --- | --- |
| Attachment tree: `npm ci`, typecheck, `npm test`, actual `test:science` | PASS; 407 passed / 5 conditional skips / 0 failed |
| Final repaired code: `npm ci`, typecheck, `npm test` including build | PASS; 419 passed / 5 conditional skips / 0 failed (424 total) |
| Final actual `test:science` with the independent venv | PASS |
| Focused UI + actual helper HTTP + handoff regression | 98 passed / 0 failed |
| Frozen compiled workspace/schema compatibility | 2 passed / 0 failed with explicit scientific venv |
| Frozen stdio runtime parity | 1 passed / 0 failed |

An initial extra compiled-compat invocation omitted the scientific venv and
failed before source creation because the default interpreter lacked NumPy. The
failure is retained; the explicit-venv rerun passed. No unknown science request
was replayed. Conditional default-suite skips are not claimed as executed.

### Separate SDK experiment

Official SDK v1.32.2 and v2.4.0 clients interoperated with the existing frozen
server: schemas, original TIFF/frame/PNG, errors and normal disconnect/original-ID
query passed. An isolated SDK adapter reused the same scientific RuntimePort and
passed its bounded scientific chain and cancellation fixture. It is **not** a
production replacement. Direct replacement remains **HOLD**: legacy empty
initialize, duplicate in-flight ID dispatch, malformed-JSON wire errors and
Node floor/dependency behavior differ. No SDK dependency or adapter is added to
this feature branch. Complete transport parity, real worker cancellation and the
entire declared Node >=18 range are NOT_TESTED for that adapter.


### Actual Chrome and formal MCP round trips

Both routes used the repaired compiled code, Chrome 156.0.8078.74 on this Mac,
an explicitly generated public synthetic 2048 x 2048 float32 periodic TIFF and
separate explicitly bound plugin workspaces. No private experimental data or
physical scale was supplied. The current AI selected/dispatched formal MCP tool
calls through a persistent stdio client; Chrome actions were automated by the
GPT-6.1 Terra subagent. This is actual tool/GUI execution, not a new default-host
model session or a scripted mock provider.

- **GUI first — PASS:** existing Inspector -> Chrome ROI and saved reason ->
  explicit continuation prompt -> `image_panel_current` on the same Panel ->
  `image_fft` -> fresh current read -> `image_panel_show` -> FFT actually visible
  in that same Chrome panel. Normal Inspector shutdown/reopen retained the Panel
  identity and recovered the same saved FFT by its original request ID, without
  another FFT calculation. The final r3 build was used for recovery.
- **AI first — PASS:** `image_open` -> explicit frame -> preview -> owned
  `image_panel_open` -> Chrome opens -> saved ROI/reason -> AI reread -> saved FFT
  batch -> human ROI change. Showing the completed older result with its old
  draft revision returned **queued**; the human view/selection stayed current,
  Chrome displayed the pending notice and blocked handoff. The newer ROI/reason
  was saved before explicit acceptance of the historical FFT view.
- **Peak correction and recovery — PASS:** Chrome selected/measured a peak and
  manually dragged its scientific anchor. MCP read the revised anchor; a new
  recorded `image_remeasure` continued from it. The result was approximately
  0.08809894 cycles/pixel, with physical value null (unknown calibration).
  Normal owned-helper close and `image_panel_resume` preserved the same Panel,
  advanced generation 1 -> 2, rotated capabilities and showed the revised peak
  and measurement in Chrome. All 71 previously inventoried science/fixture files
  retained their hashes; saved ROI reasons and original request outcomes remained
  queryable. No recovery FFT or unknown scientific request was replayed.

The actual batch completed in about 0.62 seconds, before the human GUI edit
ended. Therefore **real worker in-flight simultaneous editing is NOT_TESTED**;
only late presentation was exercised in Chrome. Deterministic delayed reads,
failed action cycles and stale acceptance are covered separately by the race
and actual HTTP regressions above. Do not conflate these two claims.

Global Codex configuration was unchanged (before/after SHA-256 equal). The
existing cached chat connection still targets its previous provider. Default
fresh-model activation/reconnection against this feature branch is NOT_TESTED;
no approval override or global registration was used to manufacture that result.
The continuation button prepares host context and does not auto-launch a model.
Human-operated usability, private/real experimental data, Windows UI and the
five conditionally skipped default-suite cases are NOT_TESTED in this Mac run.
These bounded local routes pass; complete default-host product acceptance and
production SDK replacement remain outside this result. No merge or tag was made.
