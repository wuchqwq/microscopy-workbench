# Current question / evidence / Codex connections

This map describes code paths, not a new model or native GUI qualification.
Ordinary/private workspace sources have no Codex sending admission here.

```text
Local spatial selection -> saved ROI view -> local question -> explicit Apply
                                                     |  workspace savepoint remains explicit
Same-frame saved statistics -> explicitly select exact reference + relation/reason
                           -> manual lead -> validate original refs / navigate source
                                                     |  NO automatic Codex attachment
Local question / source / leads -> Prepare Agent continuation
                               -> local copyable summary -> user-controlled copy only

Dedicated public synthetic sample -> separate Codex question input + confirmation
 -> POST /api/public-research (question + id + approved + exact context hash)
 -> official app-server thread/turn -> model chooses bounded statistics/result tools
 -> real provider + verified whitelist projection -> same model thread -> answer
 -> exact request/result/ROI details -> guarded local return to public source
 -> explicit result selection -> re-read original saved statistic -> manual lead draft
                            (local applied same-frame question; no model text adoption)

Offline candidate demo -> local bounded context -> synthetic response -> manual review
                       -> explicit apply/reject; NO model connection
```

## Existing entry points and limits

- `app.mts` `askFromSelectedRoi` / `questionSourceStatistics` and
  `research-workspace.mts`: local `ResearchQuestion` v1 binds text, saved context
  object, frame and time. It is not the public Codex question field. Selecting a
  temporary ROI does not retag a recorded question.
- `data-probes.mts` -> `ResearchLeadsUI.open(reference, contextObjectId)`:
  a chosen saved statistic is matched by result/request/input/frame IDs and three
  hashes. Relation/reason and Apply are explicit. Same-frame history is not
  automatically evidence; a saved lead is not an automatic model attachment.
- `continueResearchWithAgent` -> `ResearchWorkspace.showHandoff`: fresh complete
  state/ROI/execution checks produce local text. Only the explicit Copy button
  writes the clipboard. This path neither starts a Codex thread nor sends a turn.
  Relationship validation, execution and strict reuse remain separate; unknown
  references do not license replay/recalculation. Copying is not model receipt.
- `PublicResearchUI.submit` -> `DesktopPublicResearch.submit/runTurn`: only the
  dedicated external public workspace and exact admitted 64x64 uint16 array/hash
  enable this route. Each question needs existing range confirmation and exact
  context hash; unknown/busy/stopped/duplicate/limit controls remain in force.
  There is no selected-statistics attachment field in this request.
- `createResearchTextTools`: only `image_statistics` on the admitted frame and
  `image_result` for this session's own original requests. The model can receive
  verified result/request/frame IDs, hashes, pixel ROI and finite
  sample_count/mean/stddev/minimum/maximum, or bounded failure/unknown status.
  Arbitrary historical manual results cannot be queried through this own-request
  map. Complete provider journals, pixels, PNGs and source paths stay local.
- `CodexStdioHost.session`: registers those dynamic tools and disables shell,
  view_image and web search in this mode. Official default existing auth is used
  by the supported runtime. This is not an audit of all upstream client context;
  empty external cwd may appear as standard runtime metadata. No credentials are
  read or displayed by this workbench map/preview.
- `tools/research_text_loop.mts` is a separate CLI verification runner with its
  own send-plan and thread. It does not import local manual questions/leads into
  the desktop conversation. Scripted peer evidence is not a real model run.
- Offline candidate generation (`offline-research.mts`, local offline endpoints)
  remains synthetic. Image input code is not an enabled visual product path;
  image sending/review restrictions remain unchanged.

## Small preview gap and local-only change

Previously the public UI exposed the source JSON, editable question and range
notice, while the exact wrapped prompt/tool send-plan was written only after
submission. The existing scope/source disclosure now contains an expandable
**本次问题的发送文本与工具（本地预览）**. It updates from the separate public
question field without API calls or sending. The backend exposes the fixed
prefix/suffix and actual tool definitions from the same helper used for the
existing send-plan and `startTurn` text, so UI and runtime do not duplicate the
prompt template. The old prompt bytes and approved/context/request body remain
unchanged; unknown source/tool object fields are not newly forwarded.

It shows this turn's application-built text and tool definitions, not a complete
upstream request capture. Earlier same-thread messages/results remain context;
future tool choices/results are unknown before execution. Local manual questions,
selected statistics and leads are explicitly not automatically attached. Missing
preview data is labeled unavailable, never reconstructed as a verified plan.
There is no new attachment, endpoint, admission, approval or private-source path.

## Evidence boundary

This change is verified with pure plan parity/whitelist checks and offline UI
fixtures. No new real model turn, provider calculation, clipboard transfer or
image sending is used to prove the preview. Prior real public-text runs are
historical evidence, not proof of this new UI layout. Native Electron layout and
close/save remain unaccepted; denied listener/control/image-review actions are
not retried. Physical units/material identity and independent evidence weight
remain unknown unless separately established by existing science contracts.

## Verified public model result → explicit local lead draft

A completed public result now has **用这条原统计整理线索**. It admits only a
completed operation in the current public thread/turn, with a bound tool call,
original request, frame and three result/input/statistics hashes. Running,
unknown, foreign or malformed records cannot use this action. This is reverse
flow into local work; it adds nothing to the model request or sending preview.

The existing history reader resolves the exact input object; the UI never
invents an input-view identity from a frame ID. The resolved input must actually
be the public frame permitted by the existing model tool definition. A unique
exact record, settled current source and explicitly applied same-frame local
question are required. Context/question/selection/draft revision changes during
the read refuse; duplicate clicks do not repeat the lookup/editor action.

The existing lead composer selects only this verified reference and leaves
hypothesis, relation/reason, unknowns and next step empty. The user explicitly
fills/applies them, then explicitly saves the workspace. The local question and
model conversation remain separate; the model question/answer is not copied or
accepted. The original statistics contract, source navigation, read-only trace,
provider journals and existing CAS/adoption checks remain unchanged. No new
statistics, source images, model turn, external field or scientific conclusion
is created by opening this editor. A missing/changed/duplicate result is not
replaced or recomputed.
