# Resume the selected evidence without restarting the science

Read this reference when the researcher continues a saved task, requests mouse
input, changes an existing result, or a request stopped waiting. A simple tool
call does not require this infrastructure.

## Direct input and optional panel

For an accessible supported TIFF, use the present image provider to open the
explicit original and select an explicit zero-based frame (`image_open`,
`image_frame`); retain source/frame IDs yourself. The first human frame is index
0. Check the tool's actual format/axis/budget support rather than assuming every
attachment can be opened. If only an exported raster is available, keep its
limited display provenance; request the scientific original when the requested
numerical interpretation depends on it.

## Open or focus the workbench when interaction matters

Use a Panel when the researcher needs to place, revise or compare an ROI or
peak, or when an interactive comparison would materially affect the next
scientific check. Use ordinary image tools for direct queries that can be
answered from the available evidence.

1. Inspect the tool catalog of the **same image provider** that owns the
   scientific objects. For a task with an existing Panel, read
   `image_panel_current` with the retained `panel_id`. When an existing Panel
   is expected and its ID was lost, an ID-free read can identify exactly one
   live registered Panel. Reuse it only if its saved view, source/frame and
   applicable ROI match the task's retained references. Keep a mismatched
   Panel intact and ask which analysis to continue if the choice matters.
   For a new Panel, select the exact saved view with its saved ROI annotations,
   then call `image_panel_open({object_id, request_id})`. A confirmed
   `PREVIEW_REQUIRED`
   calls for an explicit saved preview only after checking any prior preview
   request. Reuse saved source, frame, view and result objects. Retain the
   returned Panel ID, owned helper generation, active view, exact source/frame
   and ROI identity, and the pre-interaction GUI save ID/revision. If the
   provider lacks Panel tools, report the gap and continue applicable direct
   analysis with its ordinary tools.
2. When the same provider advertises `image_panel_activate`, proactively call
   it with the retained `panel_id` and a recorded activation `request_id`.
   This requests a local Windows viewer for that Panel. Read the activation
   result for window readiness and observed focus. An intentional later focus
   may use a new request ID once the earlier outcome is known. After a timeout
   or cancellation, repeat the exact original activation arguments to query
   the receipt. If activation is unavailable, use the host's permitted
   same-Panel browser opener if available, or explain the exact capability gap.
   Keep the private loopback capability and internal IDs out of ordinary
   researcher instructions. Each provider/workspace has its own identities;
   a different provider's Panel is outside this task's scope.
3. Ask the researcher to save the intended edit in the workbench and then say
   “继续” or “continue” in the same chat. That message initiates the next turn.
   Read the same Panel with `image_panel_current({panel_id})`. Check its helper
   generation, active view and exact source/frame, the GUI workspace
   `save_id`/saved revision, current edit state and the available
   `roi_handoff.interaction_gate`. When the workspace is clean and the gate
   is ready, call `image_panel_saved({panel_id, save_id})` if advertised,
   using the exact save ID just read. It verifies the persisted savepoint.
   The savepoint's active view and ROI can differ from the current live
   selection. Confirm the intended annotation or result in the immutable
   saved view with `image_info` and the original provider receipt as needed.
   A newer save is a reason to recheck the evidence and bindings. For an
   unsaved edit, blocked or unknown handoff, or unresolved save or scientific
   request, read the appropriate original state and let the researcher
   settle the pending choice. If exact savepoint readback is unavailable,
   describe which live or provider records you can verify.

When the owned helper is confirmed stopped, use the exact registered Panel's
advertised `image_panel_resume` path before reading again. Compare the returned
generation and saved identity after recovery. A closed viewer can be activated
again against its live helper. Keep the original source and observations if
the active source, frame or ROI changes.

Before offering a computed immutable result, reread the same live Panel and
compare its source/frame, view, ROI and draft revision against the inputs used
for the result. Retain a result from changed inputs as historical evidence.
For applicable results, call `image_panel_show` with the freshly inspected
`expected_object_id` and `draft_revision`. If a later edit causes queuing, the
researcher decides whether to accept the pending result. The
[observation skill](../../microscopy-observe-revise/SKILL.md) holds the
source-ROI/FFT association and sparse annotation contracts. User-drawn or
Agent-proposed ROIs retain that origin; neither implies physical confirmation.

An explicitly selected live/native backend, when actually available and
qualified, may supply a new capture. A saved `image_info` result or original
request query is not a fresh live observation. A failed native operation does
not authorize an external replacement or qualify another build/dtype.

## Current references are a separate decision

Bind source/frame/ROI, scientific grid, calibration and any structure/orientation.
Reuse selected saved FFT/measurements/results that remain applicable. Historical
review stays attached to its old immutable evidence. A new source or ROI must
not acquire old scientific anchors merely because the PNG looks similar.

For a task to continue later, retain a short human-readable task name. When the
optional AnalysisContext tools exist, `analysis_create` names a new task and
`analysis_read` selects current or explicit historical references. On reconnect,
read that named task and any retained panel before submitting new work; do not
recreate TIFF/FFT objects to reconstruct chat memory.

Retain the AnalysisContext ID and revision separately from the GUI workspace
save ID and revision. Read the named context again after a GUI save and compare
the immutable references against the exact saved source, frame, ROI and
calibration before proposing a promotion. The GUI save and the context update
have their own recorded outcomes.

Providers persist scientific results first. Advancing current references through
`analysis_update` is a separate compare-and-swap against the revision read before
work. If it conflicts, inspect `analysis_proposal` and the new current dependencies.
Do not merely increment the expected revision, overwrite user corrections or
roll back another result to force an old proposal into the current task.

## Recover exactly one original operation

Retain the request ID and provider/workspace/session scope before every write.
After a timeout, cancellation or lost reply, query the same original via
`image_result` or `structure_result`; do not issue a replacement while its outcome
is unknown. An exact context mutation is recovered with its original request ID
via `analysis_read`, separately from its scientific provider result.

A confirmed failed request remains failed. A corrected, permitted operation may
be submitted explicitly with a new identity only after its changed input is
understood; it does not overwrite or replay the failed record. Optional
`execution_list`/`execution_info` explain waiting and worker state, but their
observations are not durable scientific receipts. No status query authorizes a
previously refused model/data send, a different route around it or a restart of
an unresolved request.

When conditions change, classify display-only changes separately from scientific
changes. Calibration/centre/point correction calls for explicit remeasurement and
review of downstream comparisons, not automatic recomputation of unchanged FFT
bytes. Source/frame/ROI changes require a new correct input binding. Keep both
old and revised evidence and say which is current.
