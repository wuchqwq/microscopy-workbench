---
name: microscopy-automation
description: Choose and revise microscopy ROI atlases and FFT windows, measure Fourier peaks, build sparse structural feature fields or explicit single-domain classical GPA, establish sourced cross-frame correspondence, compare local signatures or explicit structural candidates, and return recoverable results to the shared panel. Does not identify phases or defects by assertion.
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

## Single-domain classical GPA

When the researcher requests lattice displacement/strain from one selected
domain, inspect the actual `image_gpa`, `image_gpa_view` and `image_gpa_read`
schemas. Use two explicit non-collinear reciprocal vectors in cycles/pixel on
the exact saved FFT. Declare `source_domain: "real_space_lattice"` with an actual
`source_domain_text` source or working assumption; unknown image metadata alone
does not establish a lattice, and known reciprocal images remain refused.
Supply a Gaussian `mask_sigma`, a half-open reference
rectangle in that FFT's local spatial grid, `reference_mode` and a sourced
`reference_text`. `fixed_g` preserves affine deformation relative to supplied
waves; `fit_reference` zeroes the fitted reference lattice and cannot measure
its absolute strain. Never silently choose a strain-free region.

Inspect amplitude, validity masks and reference diagnostics with the resulting
maps. `ux`/`uy` remain pixels unless calibration is sourced; unknown metric leaves
tensors and rotation labeled image-coordinate. Finite strain is Green–Lagrange,
`exy` is tensor shear, and polar rotation is stored in radians, displayed/read in
explicitly labeled degrees. Read
[classical GPA details](../../../docs/CLASSICAL_GPA.md) before interpreting the
finite Eulerian displacement convention. A geometric phase may include
sublattice/basis-image changes and pseudo-strain; it is not a ptychographic wave
phase or material identification.

Revise vectors/mask/reference/calibration with `previous_gpa_id`, preserving the
old GPA and saved FFT. Use `image_gpa_view` for display-only range/component
changes and `image_gpa_read` for bounded explicit local integer samples. Retain
the provider result/request IDs; F2a adds no AnalysisContext GPA role, so do not
put it in an unrelated slot. Reconnect via saved objects and original
`image_result` requests, without a new FFT. Export to a fresh directory and retain
NPY components, masks, report/table and provenance separately from the PNG.

Before each write choose and retain `request_id`. Query the tool's advertised
recovery endpoint after timeout or cancellation; never resubmit an unknown
side effect. Batch receipts retain child request IDs and outcomes. An incomplete
batch is not a complete analysis.

## Actual scope

This package supplies composable local and bounded cross-frame observations
and explicit candidate comparisons. It does not implement automatic global
indexing, multi-phase segmentation, twin-interface determination, automatic
dislocation analysis or ptychography reconstruction. Classical GPA is limited to
one explicit domain and a qualified saved FFT of real scalar spatial data.
Sequence FFT currently requires real spatial
scientific arrays; do not silently take the real part of complex reconstruction
data or quantize a float array to PNG/uint16. Report the specific unsupported
entry instead. Existing `image_compare` can show explicitly selected frames
without asserting alignment, physical depth or unchanged structure.
