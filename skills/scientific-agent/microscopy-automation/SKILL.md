---
name: microscopy-automation
description: Choose and revise microscopy ROIs and FFT windows, detect and measure Fourier peaks, establish sourced cross-frame region correspondence, compare joint observations or explicit structural candidates, and return recoverable results to the shared panel. Does not identify phases or defects by assertion.
---

# Reusable microscopy observations

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
