# Shared workspace: researcher-first or Agent-first

This is a host-independent tool-use contract, not a model launcher or a new
workflow engine. Inspect actual advertised tools/schema. The host owns access
and approvals; do not silently enable a global service or override policy.

Keep three observations separate: the local server's advertised schemas, the
host's actual registered/allowed tools, and successful calls from that model.
An absent Codex CLI does not establish that another permitted host cannot act.
If this host permits a local execution bridge to the existing Workbench CLI,
record that route and the actual schemas/results; do not describe it as native
MCP registration. If the model's instructions forbid shell, that bridge is not
available; never override the restriction for a demonstration.

For a read-only local advertisement check, the existing qualification launcher
accepts `--preflight --config ABS_CONFIG --output ABS_FRESH_DIRECTORY` without
Codex CLI. It only initializes the explicitly configured MCP server and lists
tools, including explicit preview-receipt support needed by the manual loop.
It does not invoke a model or scientific tool, register anything, prove host
visibility, authorize a call or qualify a physical method. Keep its summary
separate from actual model/host event records. Current-host developer-context
choices are not independent fresh scientific-Agent acceptance. See
[host surface and evidence scope](../../../../docs/validation/stem-host-surface-20261106.md).

## Choose the actual entry

**An existing GUI/observation:** use the supplied/retained Panel ID with
`image_panel_current` first. Read its saved object, frame, calibration, ROI
anchors, observations, latest measurement references and pending/draft state.
Do not reopen the source or select another window because it is more recent.
With more than one possible Panel and no retained identity, ask which one.

**A user-supplied scientific image with no existing Panel:** require an explicitly
accessible original file and the necessary frame/plane choice. A screenshot or
chat thumbnail alone cannot supply the original array or calibration. Use
`image_open` -> explicit `image_frame` -> `image_preview` -> `image_panel_open`
with preserved new request IDs for new writes. Return the private owned URL and
use the host's permitted browser opener; do not claim a GUI is visible from a
successful tool result alone. Retain the Panel ID for the rest of the task.
Do not fabricate two human observations to be allowed to show the initial image.

The external Agent provider and Inspector must use the same exact image
workspace (the plugin's `workspace_root/images`, not its parent). Structure
workspace configuration is explicit when required. Do not guess a replacement
workspace or copy old registry files to create a connection.

## Read, act, recheck, present

The optional `roi_handoff.interaction_gate` is an advisory read-only snapshot.
If present, do not start another analysis while it is `blocked` or `unknown`.
If absent on an older runtime, inspect the underlying edit/pending/save/operation
state explicitly; missing flags are not proof of readiness. Reading existing
records to resolve uncertainty is allowed; the gate is not an access permission.

- For unsaved edits or an active gesture, let the researcher finish/save/discard.
  Do not discard on their behalf or treat a draft as committed evidence.
- For a queued result, resolve the user's presentation choice before continuing;
  it is already computed and must not be submitted again just to show it.
- For pending/failed draft persistence, confirm the saved state before handoff.
- For a submitted operation with unknown outcome, query its original provider
  request ID. Do not rename and repeat the operation.

`ready` only concerns interaction state. Calibration, candidate qualification,
ROI support geometry and scientific assumptions remain separate tool gates.
Unknown scale is pixel-only; never tune calibration to match a candidate.
Choose the scientific method for the question, not a mandatory full-field chain.

Before any new plan, read the current saved refs. After computation, reread the
same Panel before `image_panel_show`/`image_panel_evidence` and use their actual
expected-object/draft-revision contract. If the researcher has changed the ROI,
scale, frame or peak, old results remain historical; only revise affected saved
evidence with explicit new requests and reuse unchanged legal FFTs. Do not fit
or copy the old result into a newer observation by ignoring a refusal.

A queued presentation is not shown; an original receipt is not current state.
Recover by original tool and arguments, then query `image_panel_current`
separately. A cold-reopened comparison starts unvalidated and needs full provider
readmission. No button automatically starts a model in this initial implementation.


## On-demand local binding

Use the existing Inspector for GUI-first entry. Its `--workspace` must be the
same image directory that the selected host connection actually uses. For a
plugin config, this is `workspace_root/images`. The existing `prepare_plugin`
helper can prepare an explicit connection; registration and tool approval remain
host-owned. Preserve existing configurations and choose one connection route.
See [client setup](../../../../docs/CLIENT_SETUP.md) and
[plugin setup](../../../../docs/AUTOMATION_PLUGIN.md).

Closing/reopening a client is not permission to recompute or choose a newer
Panel. Retain the exact Panel ID, use `image_panel_current`, and, if the owned
helper is closed, the advertised `image_panel_resume` with a new recorded resume
request ID. Inspect the returned generation and current saved objects before any
scientific write. An unresolved write is queried by its original request ID.
The GUI's continuation button prepares context for the host; it does not launch
or authorize a model.
