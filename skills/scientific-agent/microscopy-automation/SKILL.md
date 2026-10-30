---
name: microscopy-automation
description: Choose and revise microscopy ROI atlases and FFT windows, measure Fourier peaks, build bounded multiscale structural fields and candidate domains, establish sourced cross-frame correspondence, compare local signatures or explicit structural candidates, and return recoverable results to the shared panel. Does not identify phases or defects by assertion.
---

# Reusable microscopy observations

## Budgeted active follow-up

For an existing structural field, use `image_analysis_candidates` on its saved
domain map. Supply explicit total window and FFT-pixel budgets, including work
already done. Inspect the proposed source ROI, scale, inherited settings,
heuristic reasons, exploration reservation and stopping rule. Scores are
priorities, not probabilities or calibrated information gain.

For iterative field/map/proposal calls and `image_info` / `image_result`, request
`response_detail:"compact"` when the schema supports it. The returned summary is
explicitly non-authoritative; retain its object ID and `manifest_sha256`. Use
`image_evidence` with those exact values, a selected `section`, `offset` and
`limit` (at most eight rows) to expand only the observations, neighbors or
history needed for the current decision. Proposal actions remain executable in
the compact result. Do not request every full recursive record merely to find
one measurement. Full original receipts and provenance remain available when
needed; a summary does not replace them or relax source/integrity checks.
Compact delivery is text evidence; it does not repeatedly inline the preview PNG.
To inspect an image, follow `preview_ref` with explicit full read-only delivery or use the Panel; default full images are unchanged.
If compact delivery fails after `authoritative_record_state:"completed"`, the scientific write is already saved.
Query its returned original request ID with full delivery; never resubmit that operation to obtain a summary.

Choose 1–4 actions deliberately and call `image_field_extend` with the exact
base field, saved candidate set and action IDs. Keep request IDs before writes.
Use direct explicit rectangles only for a documented intended modification;
do not silently replay duplicates, stale proposals or unknown operations.
Existing observations must retain their FFT/peak/measurement references. Compute
the updated `image_domain_map`, inspect new evidence and request the next
proposal, or stop. This loop uses formal scientific tools; no runtime scripts,
hidden model calls or developer-session identifiers are required.

For a new irregular support graph, explicitly choose
`neighbor_policy:"support_contact_v1"` to compare same-scale overlapping or
positive-shared-edge windows. Positive gaps, corner-only contact, different
scales and unknown/mixed evidence are distinct. Omitted/default policy preserves
legacy cardinal maps; do not silently reinterpret a saved historical map.

After a researcher moves a saved peak, read the actual saved Panel selection
and measurement. Match its scientific FFT/ROI and stable `observation_key`, not
its display row or peak label. Relay the complete revised measurement list with
`image_field_extend(rects:[], measurement_overrides:...)`, then update the map
and current references. Do not invent a measurement from the drawn PNG, silently
reuse the old result, or recompute an unchanged FFT.

Preserve some exploration when a field appears normal: shifted or smaller
windows can test an unresolved narrow component. Do not spend every action on
the highest anomaly. Quality-limited noise and repeated non-improvement should
lead to a bounded stop, not endless refinement. Record misses and unsampled
support; a uniform-looking candidate does not prove a homogeneous material.

Save the current field/map/proposal under `spatial_field`, `domains` and
`active_plan` in the named AnalysisContext, using the revision you just read.
Promote the field before its dependent map and proposal; an old result is
history until its bindings match the current selection.
After reconnecting, query saved records and original outcomes before deciding
what new work is necessary. A successful geometric comparison is still a
candidate, and missing physical scale remains pixel based. The active tool guide
and acceptance record are shipped in `docs/ACTIVE_ANALYSIS.md` and
`docs/F4_LITE_ACCEPTANCE.md`.

Use the installed plugin's actual MCP tools, not ad-hoc Python scripts. Inspect
the advertised schemas. Keep internal object/request IDs yourself. A new input
or session must work without any developer's sample IDs, temporary scripts or
remembered calibration. Ordinary image tools remain directly callable.

## Start with source context

Use `image_open` for the user-selected supported file and `image_frame` for a
TIFF page; `image_info` reports the scientific dtype, shape, frame and calibration.
Explicit DM3/DM4 plane selection follows the tool schema, not the display PNG.
Retain the source reference and inspect an `image_preview` image. Human frame 1
means index 0. Unknown scale is valid pixel-domain input; never insert example
nm/pixel, assume phase radians, or turn sequence indices into physical depth.

For a continuing task use a named `analysis_create` / `analysis_read` context.
Provider objects are authoritative; `analysis_update` only promotes references
against the revision you read. A failed CAS leaves historical results intact.
Tell the user the task name for later reconnection. Do not rerun an FFT merely
to reconstruct chat history.

## Explore several explicit windows

`image_roi_propose` creates bounded multiscale coverage proposals on the original
pixel grid. They are candidate windows, not segmented phases or detected crystal
domains. Choose window sizes from the image extent and the intended scale of
observation; inspect the overview and adjust the returned rectangles if needed.
Use `image_fft_batch` on a bounded list of rectangles, retaining the returned
original/ROI/FFT references together. Select windowing and mean subtraction
explicitly. Hann reduces window-edge leakage but changes peak shape; a larger
window improves frequency sampling while possibly mixing domains.

Call `image_peaks` on a saved FFT to locate maxima in scientific amplitude,
excluding the specified DC neighborhood. Threshold/separation/refinement are
reported numerical choices, not a phase confidence. Inspect the returned
annotated spectrum and peak table alongside the source region. Weak or merged
maxima can be artifacts; conjugate peaks are not independent evidence. Use
`image_peak_measurements` to persist ordinary `image_measure` records for selected
peak IDs. Their DC-to-peak geometry is distinct from a difference between two
nonzero reflections. Pixel frequency remains cycles/pixel until a sourced scale
supports physical reciprocal units and spacing.

Adjust only the relevant window or detection parameters when the context warrants
it. Do not silently reuse another frame/ROI/calibration; do not repeatedly submit
unknown requests to obtain a preferred result. Existing saved FFT arrays remain
immutable. Display filtering is a separate explicit choice; it never supplies
the numerical peak detector's input.

For a spatial study use `image_spatial_atlas` on one saved full frame and 1–8
explicit rectangles to retain overview, ROI, FFT and ordinary measurements
together. `image_local_signature_compare` compares an atlas or saved R2 joint
observation using an explicit reference, finite angle list, coordinate domain
and tolerance. Pixel units are cycles/pixel; physical comparison requires sourced
signed calibration and uses cycles/nm. Inspect all candidate rotations, unmatched
families and quality limits; conjugates and overlapping windows are not independent
evidence. A local signature is geometric evidence, not a segmented or identified
phase. Keep symmetry alternatives and unknown uncertainty visible.

For atlas corrections supply `previous_atlas_id` and explicit region-indexed
`measurement_overrides` containing the complete revised measurement list; reuse
unchanged spectra and compare the new atlas. Save references under `atlas` and
`domain_hypotheses` in the named AnalysisContext. Read
[spatial atlas details](../../../docs/SPATIAL_DOMAINS.md) for the workflow and
synthetic acceptance scope. Do not turn partial matches into a phase map.

When spatially localized structural descriptors are needed, use
`image_feature_field` on saved atlas, R2 joint evidence or comparison. Choose
pixel/physical coordinates and `family_count` or `shortest_period` for display.
Read the returned image and sample table: they retain source windows, period /
direction families, measurement IDs and validity masks. Missing scale is null;
window width is sampling support, not boundary uncertainty. Keep comparison
angles as hypotheses. Do not interpolate unmeasured pixels or call a feature
field a phase map. Save the `field` context reference, export JSON/CSV/PNG with
ordinary `image_export`, and reopen the saved field without FFT.

## Sample a multiscale field and inspect candidate domains

Use `image_spatial_field` when more than eight isolated windows are needed.
Choose an explicit source-pixel sampling `rect`, square `window_sizes`,
`stride_xy`, `max_windows` and pixel/physical coordinate domain. The bounded
plan uses ordinary atlas batches; it rejects excess work before child FFTs,
never silently clips/truncates the grid. Read the recorded full-window support,
overlap, costs, FFT and measurement references. A larger window improves
frequency sampling but can mix domains. Missing scale remains useful pixel data.

Call `image_domain_map` with that saved field, an explicit positive tolerance
in the field's reciprocal units and finite candidate angles. Read its zero-angle
orientation-sensitive edge separately from the allowed-rotation geometry
comparison. A rotated compatible lattice signature must not merge different
orientations into one domain. Full antipodal vector assignments, unmatched
families, unknown symmetry, mixed/low-signal windows and alternative angles
remain evidence. Do not match by peak rank or region label, fit a hidden mirror
or scale, or turn a connected signature candidate into a phase/twin/defect label.

Open the saved result in Panel, inspect source supports, boundary **bands**,
unknown mask and corresponding saved ROI/FFT. Bands and stride do not establish
boundary localization precision. Unsampled locations remain unclassified;
overlapping scales are correlated sensitivity observations. If a narrow region
has no pure sampling window, report that limitation rather than absence.

For a committed human peak correction, use `image_remeasure`, then
`image_spatial_field` with unchanged sampling/settings, `previous_field_id` and
sample-indexed `measurement_overrides`. Each override supplies the complete
measurement list for that sample. Rebuild only the derived domain result; the
old FFT objects remain unchanged. Save exact `experiment`, `spatial_field` and
`domains` references in the named AnalysisContext, and export JSON/CSV/support
NPY/PNG with `image_export`. Reconnection reads the context and original request;
it does not repeat the sampling. See
[multiscale details](../../../docs/MULTISCALE_DOMAINS.md).

F1a supplies bounded observation and candidate relations. For optional active
next-ROI selection use [budgeted active follow-up](#budgeted-active-follow-up).
GPA and defect/twin inference remain outside these tools; neither sampling mode
is a reason to force every image through the same sequence.

## Compare and return for correction

For a reconstructed sequence, use `image_sequence_create` with 2–8 explicitly
ordered saved real frame references. Keep source frame indices distinct from
positions in this selected sequence. Supply the user's sequence meaning and its
source; when unknown, record `unknown`. Time, nominal reconstruction depth,
defocus and iteration are different axes. Omit step/unit unless sourced; a
nominal depth step never establishes axial resolution.

Choose a reference frame and half-open source-pixel ROI using the original image
context. `image_region_correspondence` admits a sourced shared-grid statement,
explicit integer translations, or bounded numerical translation estimation.
Same image dimensions, labels or peak IDs do not establish correspondence.
Inspect mapped rectangles, correlation candidates and the actual images.
`AMBIGUOUS`, `UNVERIFIED`, `OUT_OF_VIEW`, `INCOMPATIBLE` and `UNMATCHED` are
useful outcomes, not invitations to increase tolerance until a match appears.
Periodic lattices may need a larger, distinctive source feature or an explicit
researcher-supplied mapping. A coordinate mapping does not imply the same atoms
or continuous structure through reconstruction depth.

`image_joint_observations` delegates only comparable regions to the existing
FFT/peak/measurement tools. Select window, mean subtraction, peak controls and
wave-vector matching tolerance explicitly. Read matched, absent, ambiguous and
extra reflections from the saved evidence; never join by `peak-1` or magnitude
rank. Neighboring frames and conjugate peaks are not independent confirmations.
Open the joint object with `image_panel_open` for its saved evidence table and
per-frame original/ROI/FFT navigation, or show one of its exact saved views.
Do not use the contact PNG as scientific input. Persist sequence, correspondence and joint
observation references in the named AnalysisContext using provider alias `image`.

Read those saved references after reconnecting. To revise detection or measured
points, pass `previous_observations_id` to reuse unchanged spectra. A dragged GUI
marker is a new observation: save its actual coordinates and ordinary
`image_remeasure` result, then supply explicit `measurement_overrides`. The old
detector peak table is historical; it does not follow a moved marker. Query the
original joint request with `image_result` for partial child receipts, then query
those child IDs if needed; never replay an unknown parent. Use ordinary tools
for a single frame; a sequence is optional.

For reference structures, use the sibling
[crystallography-compare](../crystallography-compare/SKILL.md) Skill. Reuse existing
`structure_open`, `structure_orient`, `structure_simulate` and the optional
`structure_compare_batch` for explicit candidates. Do not invent a structure,
voltage, known correspondence or fitted rotation as a confirmed experiment.
Keep experimental scale fixed, unmatched peaks and residuals visible. FFT and
SAED intensities are not generally interchangeable. No held-out reflections
means no independent validation. Candidates stay hypothesized.

Open the saved annotated result with `image_panel_open`; after human edits read
`image_panel_current`. Use its exact scientific coordinates, object and draft
revision. Return new results using `image_panel_show` with those guards, accepting
a queued result rather than overwriting newer drafts. Commit point corrections
with `image_annotate`; `image_remeasure` updates only affected measurements.
Calibration corrections remeasure/recompare the same saved FFT, not recompute it.
Save updated context references and export with `image_export` to a new directory
whose parent already exists. Do not assume an `exports` subfolder has been created;
use a new child under a known existing configured workspace/output parent. A
missing parent requires correcting that parent, not trying more filenames.

Before each write choose and retain `request_id`. Query the tool's advertised
recovery endpoint after timeout or cancellation; never resubmit an unknown
side effect. Batch receipts retain child request IDs and outcomes. An incomplete
batch is not a complete analysis.

## Actual scope

This package supplies composable local and bounded cross-frame observations
and explicit candidate comparisons. It does not implement automatic global
indexing, multi-phase segmentation, twin-interface determination, dislocation/GPA
or ptychography reconstruction. Sequence FFT currently requires real spatial
scientific arrays; do not silently take the real part of complex reconstruction
data or quantize a float array to PNG/uint16. Report the specific unsupported
entry instead. Existing `image_compare` can show explicitly selected frames
without asserting alignment, physical depth or unchanged structure.
