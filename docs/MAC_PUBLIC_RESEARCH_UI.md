# Mac public synthetic research entry

This opens the existing Electron workbench with a new, explicitly public 64×64
uint16 synthetic array. It uses the reviewed text-only Codex adapter and existing
science runtime. It is not visual analysis: Codex receives no image or pixels;
material identity, physical calibration and intensity units remain unknown.

From the source checkout, after building:

```sh
MICROSCOPY_PYTHON='/absolute/science-venv/bin/python' \
npm run desktop:public-research -- '/absolute/NEW-public-research-run'
```

Use a **new** absolute local directory. Existing files and session reports
are never replaced by this entry. Electron is the pinned separate dependency in
`desktop-runtime`; its profile/session data, crash dumps and logs are placed in
the new run directory. The launcher sets process-local temporary/cache paths.
It uses the installed official Codex binary and the existing default official
login. It never reads/copies credentials or starts login. The official default
runtime may write small state outside the project; its full upstream-generated
context has not been audited. Empty external model cwd is ordinary metadata.

1. Open **研究问题与证据**, or **Agent → 公开合成样例 · Codex 统计问答**. Read **Codex · 公开合成样例** and its send-scope disclosure.
2. Enter a non-sensitive question about this public array and approve this
   question's visible send scope. Sending starts an actual model turn.
3. Watch the real tool status and verified numeric results. Each result carries
   original request/result/frame identities, hashes and half-open pixel ROI.
4. Ask a follow-up in the same session. Approval resets after each submission.
5. Open **统计与原图定位**, use **原始数值与引用**, then **定位原图 ROI** to select the actual source
   ROI locally. This navigation never calculates or sends an image.
6. **请求中断** requests an official interrupt. It closes admission to new
   questions; acknowledgement alone is not scientific completion. Failed or
   unknown outcomes retain original identities and are never replayed.

The public entry admits only its dedicated workspace and exact known public
array hash/shape/dtype. Ordinary workspaces have no enabled Codex send route.
Switching display views does not change the admitted source. The only model
tools are the existing bounded `image_statistics` and original `image_result`
query. Tool/provider raw content, paths, arbitrary metadata and image data do
not enter model replies. A question cannot grant additional tools or execution.

`ui-research-report.json`, per-operation send plans, `audit/tool-audit.json` and
provider journals stay in the run directory. Reports are local trace/evidence,
not crash-resumable model sessions or accepted scientific leads. A restarted
application does not silently replay or resume them. This UI does not yet adopt
model answers as Panel CAS research leads. Protocol diagnostics remain visible;
their bounded metadata is not a complete payload audit. Model Markdown is shown
as literal safe text. Maximum eight questions, existing science budgets apply.

Focused checks: build, `test:desktop-public-research` with the explicit Python,
desktop contracts/lifecycle, and an actual Electron/real-model public workflow.
Synthetic protocol tests are labeled separately from actual model evidence.
This legacy entry remains text-only. The separate native public-image trial is described in [the joint connection contract](RESEARCH_VISUAL_TOOL_CONNECTION.md); it does not broaden this entry.

The latest question is expanded; earlier questions and model process/identity
records are folded. Statistics show one card per original request; querying
that result does not duplicate its card. Full precision and references remain
under the inspect action, and every dispatch/query/refusal remains in the local
execution trace. Summary values use six significant figures. Long model replies
scroll within their card. The local saved-question editor is explicitly separate
from the Codex conversation; answers have not been adopted as research leads.
These layout refinements require an actual Electron check after the pending
permission card is resolved; source/mock checks do not qualify native rendering.

The 180-second UI wait budget is not a task deadline. Expiry retains the original
operation/thread/turn binding, blocks new questions, keeps state reads and an
available original-turn interrupt, and continues receiving authoritative events.
`active` denotes an unsettled original operation, not proof of remote execution;
`can_interrupt` separately describes whether this session can request stopping.
An interrupt acknowledgement is not a terminal state. Rejection or loss of host
control remains unknown; the UI does not claim interruption or completion and
cannot issue a control RPC without a usable original identity/connection.
**核对原回合状态** reads the state already received by this service; it neither
starts a model request nor remotely replays/query-executes science. Late messages
accepted by the adapter fill the matching saved operation, even after its turn
terminal event. They cannot be copied into another question.

Before registration, explicit question refusals carry an operation-bound
`public_research_refusal` receipt with `disposition:not_dispatched`. The ninth
question is a quota refusal and retains its input. Missing/ambiguous receipts
still keep the unknown-send fence; arbitrary errors are not recast as refusals.
