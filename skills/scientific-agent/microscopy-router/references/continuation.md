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

Use `image_panel_open` only when spatial interaction is useful, then give its
returned loopback URL to the researcher. On “look here” or “continue”, inspect
`image_panel_current`: retain its panel ID, saved view, exact source selection,
domain and draft revision. With multiple panels, use the retained identity, not
globally newest/most recent selection. A panel does not wake Codex automatically.

Offer a computed immutable result through `image_panel_show` using the inspected
view/draft binding. A queued result is not visible or accepted yet; do not erase
newer user edits. The [observation skill](../../microscopy-observe-revise/SKILL.md)
holds the source-ROI/FFT association and sparse annotation contracts. User-drawn
or Agent-proposed ROIs retain that origin; neither implies physical confirmation.

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
