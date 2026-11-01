# Continue from two researcher-selected regions

Use this route when the researcher has selected two neighboring regions and
wants to compare a finite set of explicit structures. It composes existing
tools; a complete spatial field or automatic anomaly detector is not required.

Read `image_panel_current` after the researcher says continue. Its actual saved
PNG and draft state are different. Use the read-only `roi_handoff` when present:
choose two usable `saved_rectangles`, retain their annotation IDs/reasons and
original fractional anchors, and use their canonical source-pixel `rect_xyxy`
for processing. This uses the same outward rounding as the Panel's ROI/FFT
operation; do not round preview pixels or invent a different rectangle.
`current_selection` is a separate unsaved candidate, not another saved mark.
Dirty gestures require completion; a queued Agent result must not erase them.

The displayed object may be an annotation, not an FFT input. Follow
`scientific_input` to the exact original frame/current calibration. If it
provides `prepare_call`, execute the existing `image_calibrate` attachment with
a request ID saved first. This attaches the existing record; do not create a
different scale or reopen the file and call it the same frame. Missing scale
still permits pixel analysis. Wrong source, frequency-domain marks or
unavailable frame identity require clarification rather than guessing.

For a new analysis, record the two explicit regions/reasons using
`image_discovery(entry="manual")`. Run `image_spatial_atlas` on exactly those
two rectangles once. Each region gives the original FFT, peak and measurement
references. Bind each discovery candidate to its own existing FFT/measurement
children with `image_discovery_review`. Do not generate a second FFT for review
or construct a full-grid field just to satisfy a type name.

Open the supplied finite CIF/XYZ candidates, inspect their actual cell/sites,
create shared scientific orientation records and run the admitted simulations
with explicit comparable conditions. `structure_general_compare` takes the two
atlas region references and candidate simulation pairs. Retain the independent
experiment scale, common registration, unmatched and ambiguous reflections.
Unknown groups are not verified symmetry; several matching projections remain
insufficient. This does not name a twin or identify a unique phase.

Return the comparison's actual MCP PNG/numerical evidence. The image Panel can
show the atlas overview, source or saved FFT by its image-provider ID; do not
pass a structure-provider comparison ID to `image_panel_show` as an image.
Offer results against the observed view/draft revision and respect queued
presentation. The client does not automatically wake a model after every drag.

When a saved peak changes, use `image_remeasure` on its exact current FFT and
then atlas `measurement_overrides` plus `previous_atlas_id`. Keep the other
region's original measurements. Revise only the affected review and comparison;
both original FFT IDs/bytes stay unchanged. Display gamma or text placement is
not a new scientific measurement.

This atlas reuse path requires the same exact source/calibration wrapper. A new
scale wrapper currently fails that previous-atlas guard; do not claim automatic
cross-calibration atlas continuation or silently recompute FFT. Existing
`image_calibrate`/`image_remeasure` tools may remain useful separately. Likewise,
an already completed standalone FFT batch is not directly importable into an
atlas in this first integration; report the actual boundary rather than
replaying it under a new request.

Save all request IDs before dispatch and recover original outcomes through
`image_result`/`structure_result`. A fresh session must inspect saved evidence,
not trust the previous explanation, and must distinguish historical results
from a new capture or changed calibration. No unknown operation is auto-retried.
