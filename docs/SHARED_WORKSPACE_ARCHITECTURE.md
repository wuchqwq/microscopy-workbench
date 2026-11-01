# Shared scientific workspace: two entry routes, no new Agent runtime

Decision/proposal, 2026-11-01; source inspected: `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`.
This is the first bounded development slice, **not** completion of both desktop
launch routes. The frozen Mac core source and historical acceptance stay intact.
Local Codex must independently review the patch and complete the real desktop
integration before researcher usability testing is requested.

## Product contract

A researcher may start the Inspector and ask an Agent for help later. Equally,
a researcher may give an Agent an explicitly accessible scientific image; the
Agent may import it through existing tools and open a Panel for the researcher.
Both routes use the **same provider records and an explicitly identified Panel**.
Neither actor owns an exclusive permanent mode. Manual edits and Agent results
must be visible without letting late work overwrite newer human observations.

The external Agent host owns the model, conversation, approvals and tool choice.
Workbench provides scientific tools, provenance and a shared view. No embedded
model loop, new Agent framework, global scheduler, extra journal authority,
collaboration database, CRDT service or always-on daemon is added in this slice.
An internal stdio science process used by the GUI is not an AI model session.
An optional external Agent connection is launched/enabled only on explicit use.

## Mature architecture references and what is actually reused

These are architectural references, not dependencies added by this patch:

| Primary reference (checked 2026-11-01) | Pattern we use | What we do not claim |
| --- | --- | --- |
| [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) | Host manages the Agent/client; server provides tools/context. Keep those responsibilities separate. | MCP alone does not implement scientific provenance or an Agent planner. |
| [Official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/) | Use an official SDK-backed transport adapter as the target for protocol maintenance, with a separate compatibility migration. | This patch has **not** installed/migrated the SDK or qualified a new protocol version. |
| [VS Code custom editors](https://code.visualstudio.com/api/extension-guides/custom-editors) | One document model, multiple views; changes go through the model, not a second copy in each view. | We are not turning Workbench into a VS Code extension or importing its source. |
| [Jupyter Server architecture](https://jupyter-server.readthedocs.io/en/latest/developers/architecture.html) | Separate persistent contents, session identity and execution lifecycle. | We are not deploying a notebook kernel/server or replacing the existing science journals. |

For this project, the provider journals/objects are the authoritative scientific
model. The owned Panel holds live view/draft/presentation state, not another
scientific truth store. An Agent conversation or copied prompt is neither.
Borrowing these boundaries does **not** certify the existing custom implementation.

## Actual runtime audit and bounded SDK migration

`lib/runtime/stdio_mcp_server.mts` hand-implements line framing, JSON-RPC dispatch,
in-flight cancellation and a fixed `2024-11-05` initialize response.
`tools/image_panel.mts::StdioImageClient` also implements request correlation
and child stdio. Those are custom protocol adapters, not an official SDK or an
Agent reasoning runtime. Existing project tests establish their tested behavior,
not general MCP conformance or complete current-client interoperability.

`ToolRegistry`/`ExecutionCoordinator` assemble handlers and coordinate local
execution; they must not become a new reasoning/planning engine. Process-local
coordination is not, by itself, multi-process exclusion. Scientific request
journals, owned Panel registration and existing compare/draft guards retain
responsibility for their actual scopes.

**Decision:** do not extend the custom wire protocol to solve dual entry. Ask
local Codex to evaluate an official SDK adapter behind the existing runtime port
in a separate small change. Pin the chosen SDK and verify supported Node versions
and the legacy protocol before changing dependencies. The current package supports
Node >=18; upgrading that floor is a separate explicit decision, not incidental
cleanup. Current SDK documentation distinguishes release lines; do not blindly
copy an old import path or assume current SDK defaults match this repository.

The migration comparison must cover tools/list and schemas, tool/error payloads,
image content, initialize/version behavior, cancellation (stop waiting is not
proof that a scientific side effect stopped), disconnect and original-ID query.
Use an actual official SDK client as an independent interoperability check. Do
not ship two enabled providers pointing at the same work as a hidden fallback.
No old scientific request ID, file hash, object schema or tolerance may change.

## Two entry routes using existing commands

**Researcher first:** launch the Inspector with an explicit source/workspace;
save observations; explicitly enable an Agent against the same image/structure
workspaces; read `image_panel_current` for the retained Panel ID; use saved ROI
and measurement references. Do not reconstruct them from the PNG or chat text.

**Agent first:** require access to an explicitly authorized original file (a chat
thumbnail is not automatically an original array). Use existing `image_open`,
explicit `image_frame`, `image_preview`, then `image_panel_open`. Return the owned
Panel URL privately and open it through the permitted host/browser mechanism.
Retain the logical Panel ID. Do not make shell execution or arbitrary URL opening
a new science tool. Unknown physical scale stays pixel-only. Do not require the
researcher to draw two ROIs before the Agent can show the initial source image.

After either route, the researcher can edit the same Panel. The Agent reads that
state before new analysis and again before presentation; it does not monopolize
the GUI during computation. Use existing expected-object/draft-revision guards.
If the view changed or a result is queued, retain the completed old result as
history; do not silently adopt it, discard drafts, or recompute to manufacture
agreement. User/model proposals are not physical confirmation.

The Inspector image workspace must equal the Agent's actual configured image
provider workspace. A plugin `workspace_root` resolves an `images` child; do not
mistake the parent directory for that image workspace. With multiple Panels,
use the retained identity or ask for a choice; never select by recency.

## Implemented here: shared handoff readiness, not a lock

The existing read-only `roi_handoff` gains additive `interaction_gate` metadata,
computed by the same pure module in MCP responses and GUI presentation:

- `ready`: no reported interaction blocker in this snapshot.
- `blocked`: an unfinished edit, queued result, pending/failed draft persistence,
  or submitted operation is reported.
- `unknown`: required draft flags or supplied persistence metadata are incomplete.
- `requires_fresh_read: true` always. No permission/lease or physical validity is
  implied; these are not new scientific statuses or a replacement for tool guards.

The old ROI coordinates, calibration preparation and `draft_state` meanings are
unchanged. `ready` does not require a human ROI: the empty Agent-first source view
can be interaction-ready without qualifying any particular scientific method.
The saved-observation GUI button retains its existing need for saved observations
or retained comparison context; this patch does not add a new AI-launch button.

Before producing the GUI's existing continuation prompt, confirm delivery of the
current draft, reread the authoritative Panel state and reject a changed view,
draft revision or helper generation. Do not accept a failed draft publisher as
success. While a result is queued or a scientific outcome is unknown, stop with a
specific message. Query submitted scientific work by its original ID; do not
resubmit it. The copied prompt is still a snapshot, so its recipient rereads too.

## Local Codex continuation and acceptance boundaries

1. Independently inspect this diff, re-run locked dependencies/types/tests, and
   challenge the shared state/race handling. Do not assume author self-tests suffice.
2. Complete on-demand local launch/session binding for both entry routes using
   existing provider and Panel APIs. Preserve existing client settings/approvals;
   no global always-on provider is required. Do not reuse isolated model-acceptance
   CLI overrides as a product launcher or bypass approvals to get a PASS.
3. Exercise actual Mac routes: GUI first -> Agent continuation -> manual peak
   revision; Agent first -> GUI opens -> manual ROI edit -> Agent rereads. Include
   an edit during analysis and a late result that must not overwrite it. Record
   exact source/frame/calibration/FFT/request references and absence of replay.
4. Separately evaluate official SDK transport replacement with parity and actual
   client tests, rather than mixing an unverified runtime rewrite into GUI work.

No researcher-operated acceptance is requested at this stage. Automated/browser
Agent checks do not substitute for eventual human usability or real-specimen
physics; automatic model wake, shared real-time coediting and simultaneous writes
are **not** established by this initial patch.


## Mac continuation: persistence and interaction boundaries

The initial slice's browser acknowledgement was insufficient: an ordinary clean
`draft` receipt can still have a coalesced write pending. The explicit handoff
now uses the additive internal `draft.params.confirm_persistence: true`. The
existing helper flushes its selection timer, writes/renames the existing journal
snapshot before replying, and reports synchronous failures through both HTTP and
`draft_persistence.error`. This does not create a scientific object or request.
Ordinary gesture publications retain their existing coalescing behavior.

A browser-local interaction epoch invalidates reads begun before a selection,
gesture (including cancellation), observation draft, view adoption or dispatched
scientific action. A failed action does not rewind that epoch. Measurement-row
selection and retained selections after cancellation also record/publish the
current draft revision so the existing provider-facing presentation guards can
see them. The epoch is UI bookkeeping, not another scientific state store or lock.

Handoff captures identities before its first await. Refresh, accept and discard
reads also protect the request-to-decode interval. A click to discard/accept does
not authorize erasing edits made after that click. Pending notices are retained
until successful adoption; if decoding/publication is interrupted by newer input,
the caller must not continue into acceptance. The helper independently refuses
`accept-result` with an outdated explicit draft revision (409), preserving the
new selection and original completed pending result.

These checks complement `image_panel_show`/`image_panel_evidence` expected-object
and draft guards. They do not make a copied prompt current, guarantee concurrent
writers, grant tool approval, or validate physical interpretations.
