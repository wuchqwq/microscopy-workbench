# Multiscale structural observations and candidate domains (F1a)

F1a asks where saved local reciprocal geometry agrees or changes. It composes
the existing FFT, peak, measurement and sparse-field tools into bounded spatial
sampling and a same-scale adjacency graph. A connected candidate is a group of
sampled window observations, not an identified material phase or defect.

## Formal tools

Save `request_id` before either write. Query `image_result` with that original ID
after cancellation or timeout; an incomplete parent or child is not success.
Do not resubmit an unknown operation. Existing single-ROI/R3 tools remain usable.

`image_spatial_field` takes an immutable real spatial frame/calibration
`object_id`, optional half-open source-pixel `rect`, unique square
`window_sizes`, positive `stride_xy`, explicit `max_windows`, and
`coordinate_domain:pixel|physical`. The current bounds are 1–4 sizes in 4–1024
pixels, 1–32 total windows and at most 4,194,304 aggregate FFT pixels. Only
complete windows are admitted; excessive plans are rejected before child FFT
submission, without clipping or silently dropping the last windows. Each
ordinary `image_spatial_atlas` child still has at most eight windows and its
existing budget. FFT window, mean subtraction, detector settings, batch/child
identities and actual observed work remain visible.

The result retains `(x,y,scale,frame)`, integer grid coordinates, each original
half-open window, source dtype/hash, signed calibration and uncertainty status,
complex FFT, peak and ordinary measurement IDs. Window overlap is correlated
support, not independent evidence. The full-frame source overview and clickable
saved ROI/FFT views are reused. Missing calibration preserves pixel analysis;
physical vectors remain unavailable instead of receiving an example scale.

`image_domain_map` consumes a saved spatial field, a positive explicit reciprocal
`tolerance` and a finite `angles_degrees` list. Units follow that field:
cycles/pixel for pixel geometry and cycles/nm for physical geometry. It performs
two distinct comparisons on horizontal/vertical neighbors **at the same scale**:

1. The zero-angle comparison is sensitive to orientation and uses the full
   antipodal reciprocal-vector set. Its compatible edges can connect candidate
   domains.
2. The submitted proper rotations test lattice-signature compatibility. They
   retain alternatives, assignments, residuals and unmatched vectors. A rotated
   match does not turn a different-orientation edge into the same domain.

The assignment reuses existing scientific matching, not peak-amplitude order or
`region-N` strings. Opposite `+g/-g` observations form one geometric family.
There is no fitted mirror, scale, distortion, arbitrary symmetry or point group.
Unknown symmetry and several successful angle hypotheses remain visible.
If stride leaves a gap between neighboring window supports, that graph edge is
unknown: it cannot connect a candidate domain or claim a boundary across an
unobserved strip.
Candidate IDs are local to one saved map. Equal text labels in two revisions,
scales or frames do not establish the same physical domain.

## Boundary bands and unknown support

Candidate boundary bands retain the supports of differing adjacent windows.
Their extent, grid spacing and FFT window width do not constitute measured
boundary location or an uncertainty interval. JSON and the saved uint8 NPY
support masks distinguish observed, unknown and unsampled locations. Nothing
interpolates or assigns a phase to uncovered pixels. Overlapping scales remain
separate sensitivity observations; their connected components are not silently
merged into a global segmentation.

Constant, low-signal, detector-truncated, mixed or otherwise insufficient
observations and ambiguous/partial relations must be inspected alongside the
original ROI and FFT. A null/unknown result is useful evidence. Failure to see a
narrow domain in a wide window does not establish its absence. Neither a domain
count nor a small geometric residual establishes two phases, a twin or a
dislocation. Statistical and localization uncertainty remain unknown unless
independently supplied; bin spacing is not an error bar.

## Revise, recover and export

Open the saved field/map with `image_panel_open`. Its evidence panel navigates
to the exact original frame/window/FFT. Existing draft guards apply when showing
a result; a new Agent result cannot silently consume an unsaved human edit.

Commit a peak correction using ordinary `image_remeasure`, then call
`image_spatial_field` with `previous_field_id`, the unchanged sampling/FFT/
detector settings and `measurement_overrides:[{sample_index,
measurement_object_ids}]`. Each override is the complete replacement list for
that sample; include unchanged measurements to retain. The field delegates to
the old atlas reuse contract, so unchanged FFTs remain the same objects. A
marker label move is not a scientific point correction. Rebuild the domain map
from the revised field to retain the changed evidence and old history.
The exact selected source/calibration and sampling plan are part of reuse.
At most seven successive field revisions are admitted, reserving traversal
capacity for the domain-map wrapper. A further revision is rejected before
children, rather than publishing an object that cannot be safely reread.

Use the named AnalysisContext roles `spatial_field` and `domains` along with
the exact selected `experiment`. `domains` binds the field's current fingerprint.
Scale/point/measurement corrections make dependent selections stale; display
changes do not. Reopen with `analysis_read` and query the original operation
without new science. Journals and provider objects remain authoritative.
For an incomplete field request, recovery exposes original atlas batch journals
and their nested atlas receipts. It does not enumerate every feature/render
child or submit missing work. A completed query validates all saved children.

`image_export` saves JSON, sample CSV, support-mask NPY and preview PNG with
provenance to a new output directory under an existing parent. The numerical
objects/CSV and display PNG serve different purposes. Source and complex arrays
remain read-only.

## Reproduce the public acceptance

Build the strict TypeScript runtime and use a separate Python environment with
`requirements-images.txt`. No DM installation or GMS Python is involved:

```powershell
npm ci
npm run build
$env:MICROSCOPY_PYTHON = 'C:\path\to\env\Scripts\python.exe'
$env:MICROSCOPY_SMOKE_OUTPUT = 'D:\new-public-f1a-run'
node dist/tools/smoke_spatial_domains.mjs
```

The output directory must not already exist. The generator writes signed
float32 analytic cosine textures: a true A|B orientation boundary, phase-shifted
and globally rotated single domains, a narrow strip, square symmetry, constant
negative and seeded-noise controls. Its oracle is independent source geometry;
the production provider never imports that oracle. All saved FFT bins are
checked by direct finite DFT with the original tolerance. The comparison
baseline uses identical uniform sliding windows and the same existing
FFT/detector pipeline at equal FFT-pixel/window budget. It is composition
equality, not an independent algorithm benchmark or an asserted speedup.

See [F1a acceptance](F1A_ACCEPTANCE.md) for actual execution, limitations and
GUI evidence. F4-lite active ROI selection, GPA, twins and dislocations remain
separate follow-up work under Issues #26/#16.
