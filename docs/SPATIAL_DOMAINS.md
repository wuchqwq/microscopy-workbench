# Spatial windows and local signature hypotheses

R3 composes ordinary ROI, FFT, peak and measurement objects into a saved spatial
atlas, then compares the local reciprocal geometry over explicit candidate
rotations. It does not segment phases or identify crystal domains, twins,
defects or dislocations. A synthetic or user-chosen window remains a selected
region; a geometrically compatible signature remains a hypothesis.

## Formal tools

Save each write's `request_id` before submitting. The installed `tools/list`
defines the exact bounds; ordinary tools remain available for a single ROI.

| Tool | Use and saved evidence |
| --- | --- |
| `image_spatial_atlas` | Select one full spatial frame `object_id` and 1–8 explicit half-open source-pixel `rects`. Set `window`, `subtract_mean`, `peak_options` and `max_peaks` (at most 16). Returns an original-image overview and per-region ROI, immutable FFT, peak, ordinary measurement and annotated-view references. |
| `image_local_signature_compare` | Select a saved atlas or R2 joint-observation `object_id`, a `reference_index`, optional `target_indices`, and an explicit finite `angles_degrees` list (at most 64 values in −180…180). Set `coordinate_domain` to `pixel` or `physical` and a matching `tolerance`. Returns every tested rotation's geometric matches, residuals, unmatched families and relation status. |
| `image_feature_field` | Select a saved atlas, R2 joint observation, or comparison; choose `coordinate_domain` and `display_feature:family_count` or `shortest_period`. Saves a versioned sparse sample table and image without a new FFT. `max_size` is 256–1024 display pixels. |

Atlas indices identify the submitted rectangles in order. Joint indices identify
positions in the saved selected sequence, not the source file's frame numbers.
Rectangles, source provenance and measurement IDs remain available for inspection.
No numerical comparison is derived from the contact PNG or screen coordinates.

Pixel comparison uses cycles/pixel. Physical comparison uses cycles/nm and needs
explicit, compatible signed XY calibration; unknown or inconsistent scale does
not become a guessed conversion. Select the domain appropriate to the source
and research question. A rotation in pixel coordinates can differ from a rotation
in physical coordinates when axes have unequal scales or opposite signs.

## Sparse feature field

Each `field_schema_version:1` sample retains its actual source frame, immutable
array identity, half-open ROI, calibration, FFT and ordinary measurement IDs.
The center is the mean of included pixel centers:
`((x0+x1-1)/2, (y0+y1-1)/2)`. R2 samples retain target-frame coordinates and
their declared/estimated mapping basis; no silent reference-frame regridding is
performed. An unverified mapped position remains missing.

The variable-length features are family count, each family's reciprocal vector,
period `1/|q|`, direction modulo 180 degrees, acute pairwise line angles and the
shortest selected period. These summarize saved observations; they are not
learned embeddings, strain tensors or unique crystal orientations. Periods use
pixels or nm according to the chosen coordinate domain. Missing physical
calibration produces null features, not a zero-valued measurement.

Samples carry `valid`, `ambiguous` or `insufficient_evidence` status, validity
masks, quality, reasons and unknown uncertainty. `valid` means usable saved
numerical observations. Peak-limited detection and competing/partial comparison
hypotheses remain masked for a definitive display value. A comparison input
retains candidate angles and residuals as hypotheses, not phase labels.

Colored ROI outlines stay on the original source overview. The image shows
sampled window support with no interpolation, inferred stride, unobserved-pixel
labels or boundary-resolution claim. Overlapping rectangles remain distinct
observations. Panel returns the field image as actual MCP image content and
navigates back to saved ROI/FFT observations. `image_export` writes versioned
JSON, per-family CSV, PNG and provenance; CSV retains source coordinates, units,
statuses and measurement IDs while JSON retains the full family lists.

## Interpret the evidence

Only proper 2D rotations from the supplied list are tested. There is no hidden
angle fitting, mirroring, scaling or deformation. Reciprocal vectors use both
signed components; equal radius or matching peak rank is not correspondence.
Conjugate observations are grouped into one geometric family and do not count
as independent confirmations. Candidate rotations separated by 180 degrees and
other symmetries may be indistinguishable; alternatives remain visible.

Read residuals, unmatched reference and target families, detector truncation and
geometry quality together. A mixed window may contain extra families, and a
constant or weak window may supply too little geometry. Partial, ambiguous,
incompatible and not-comparable outcomes are useful evidence. Do not enlarge
tolerance or discard extra peaks to obtain a preferred label. A low geometric
residual is neither phase probability nor calibrated uncertainty. The comparison
records uncertainty as unknown; absent peaks do not
prove the absence of structure. Adjacent and overlapping windows are correlated.

| Relation status | Meaning within the selected observations and angles |
| --- | --- |
| `compatible_signature` | All selected families agree under at least one tested rotation, within one antipodal angle class; no physical identification follows. |
| `ambiguous` | Several angle classes or admissible assignments remain. |
| `partial_match` | Some families agree while unmatched evidence remains. |
| `insufficient_geometry` | Fewer than two noncollinear families support the relation. |
| `incomplete_detection` | The detector reached its peak limit; complete-signature acceptance is withheld. |
| `incompatible` | Tested selected signatures do not agree, or required calibration is unavailable/incompatible. |
| `not_comparable` | The R2 source has no accepted coordinate mapping for this row. |

Windowing, DC exclusion, threshold, separation and refinement change what is
measured. Hann reduces boundary leakage and broadens peaks. Larger windows give
finer frequency sampling while potentially mixing local patterns. Keep these
choices explicit and inspect source ROI, spectrum and saved measurements together.
R3 supplies no automatic phase map, material assignment, global indexing,
interface localization, GPA, strain map or reconstruction algorithm.

## Correct and recover

Open the saved atlas or comparison in Image Panel for overview, per-region
navigation and saved evidence. The displayed arrays and markers are references
to ordinary provider objects. Save a manual peak correction as an ordinary
`image_remeasure` record, then pass `previous_atlas_id` and
`measurement_overrides:[{region_index,measurement_object_ids}]` to a new atlas.
Each override replaces the selected region's complete measurement list; include
unchanged IDs that should remain. Exact unchanged source/rectangle/FFT settings
reuse the saved spectrum. A moved marker does not rewrite a historical detector
table. Recompare the revised atlas to make the new hypotheses traceable.

For an R2 joint input use its existing `previous_observations_id` and
frame-indexed `measurement_overrides` workflow before comparing it again.
Cross-frame coordinate correspondence is a separate prerequisite: neither a
user-declared mapping nor numerical template agreement proves physical identity
or continuity through reconstruction depth.

Persist the atlas and comparison in a named AnalysisContext using roles `atlas`
and `domain_hypotheses`, with provider alias `image` and the revision just read.
Use role `field` for a saved feature field; its dependency fingerprint binds the
actual selected atlas, joint observations or comparison that supplied its data.
A fresh client can `analysis_read`, resolve those references with `image_info`,
and reopen the saved result without recomputing science. `image_result` queries
the original write; incomplete batch receipts are not successful completion and
an unknown request must not be automatically replayed.

## Reproduce the public acceptance example

Use the independent image Python environment with NumPy, SciPy, Pillow and
tifffile, never GMS Python. The generator requires a new output directory:

```sh
python examples/make_domain_trial.py /absolute/new-public-domain-fixture
MICROSCOPY_PYTHON=/absolute/venv/bin/python node tools/smoke_domain_plugin.mjs
```

On PowerShell set `$env:MICROSCOPY_PYTHON` first. Set `MICROSCOPY_SMOKE_OUTPUT`
to a new absolute directory to retain the generated source, report and Panel
connection. Every input is public synthetic data. The source is signed float32,
including negative values; it is not converted to uint16 or a display PNG.

The mosaic contains six 128×128 windows: A, B, an analytic A+B superposition,
a constant, and two square-symmetry controls. A has frequency-bin vectors
(10,0), (0,15); B has (8,6), (−9,12), an exact proper rotation with cosine 4/5
and sine 3/5 (about 36.86989765 degrees). The oracle comes from these formulas,
not the tested FFT. The smoke independently evaluates a direct DFT matrix,
checks signed source samples, exercises atlas/compare, manual measurement
revision with unchanged FFTs, R2 joint comparison, named fresh-client recovery
and Panel HTTP. Passing this protocol test does not establish browser gestures,
a fresh model's use of the skill, real-specimen accuracy or phase identification.

Finite grayscale float32 TIFF pages are now admitted without quantization; uint16 remains supported. Pixel finiteness is checked when selecting a bounded frame. TIFF float64/complex/RGB remain outside this increment. Unknown intensity units and physical scale remain unknown.

Calibration, centre or point/measurement corrections stale the current atlas and its dependent comparison. An old atlas cannot be re-promoted against different selected calibration or corrected measurement references. Historical records remain readable. Display changes do not invalidate scientific evidence.

The generator also writes a separate true A|B boundary at source X=128, eight
shifted/multiscale windows of 128, 96 and 64 pixels, and negative uniform /
seeded-noise controls. The earlier mosaic and sequence files remain unchanged.
Run its separate feature acceptance with:

```sh
MICROSCOPY_PYTHON=/absolute/venv/bin/python node tools/smoke_feature_field.mjs
```

Optionally set `MICROSCOPY_FEATURE_BASE_REPORT` to a completed public domain-smoke
report to reuse its saved R2 joint objects in the same workspace. New boundary
inputs and logs use a fresh output directory. The report checks the existing
primitive FFT/detector baseline, independent all-bin direct DFT, field creation
without FFT, JSON/CSV geometry/provenance roundtrips, unknown-scale and uniform /
noise controls, context recovery and Panel HTTP. It records per-tool and total
runtimes, sample valid/undetermined fractions, ROI-support coverage and window
size/shift contrasts. These metrics describe the finite fixture; they are not
dense segmentation accuracy, phase identification rates or physical boundary
resolution. Analytic boundary truth and sampled support remain separate.
