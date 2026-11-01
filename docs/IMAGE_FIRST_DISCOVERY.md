# F4b: manual image-first scientific observations

The supported first-version path is: **researcher observes and selects an ROI
→ Agent calls existing scientific tools → bind/review the evidence → save,
revise and recover**. It starts with an explicit original image/frame, not a
complete structural field. Manual image-first is supported within the public
synthetic software/numerical qualification; it is not real-specimen physical
validation or human GUI-gesture acceptance. The runtime Agent still chooses
appropriate tools and stopping conditions. No model is embedded in the provider.

Automatic feature proposal remains available as **EXPERIMENTAL**. Its reliable
anomaly-detection ability is not qualified. No candidate does not mean a normal
image. The [freeze report](F4B_FREEZE.md) records current-HEAD acceptance;
[historical implementation evidence](F4B_ACCEPTANCE.md) retains the original
negative results, sources and hashes.

## Formal tools and limits

`image_discovery` requires `object_id` and a request ID saved before submission.
Select an explicit real-valued spatial frame, including an existing calibration
or descriptive context wrapper. Use `image_frame` first for a file/sequence.
Complex fields, reciprocal images and nonfinite arrays are refused; no silent
component conversion or backend fallback. Full selected input is bounded to
4,194,304 pixels. This increment observes one source frame, not a new cross-frame
association engine; existing R2 tools remain directly callable.

- **Manual image-first — supported limited scope.** `entry:"manual"`: one to
  four half-open source rectangles with an actual
  researcher `reason`, optional `candidate_explanations` and `unresolved` text.
  Origin is `researcher_statement`, not numerically verified physics. It is a
  caller-reported statement, not authentication of the human's identity.
- **Automatic feature proposal — EXPERIMENTAL.** `entry:"feature"`: one or two
  fitting `window_sizes` (32–256 pixels,
  default64), at most512 observation windows and four ranked candidates.
  It returns raw-value texture/tensor proxies, reasons, unknowns, finite costs,
  an overview and explicit existing-tool actions. It computes no FFT or GPA.

Always set `entry:"manual"` explicitly for the formal first-version workflow.
Omitting entry retains the earlier `feature` default solely for request/history
compatibility; it does not make automatic proposals a supported detection path.
New discovery/review records expose `support_status` as
`MANUAL_SUPPORTED_LIMITED` or `EXPERIMENTAL`, following the originating entrance.
A numerical review does not promote experimental proposals into validated
automatic detection. Historical objects keep their original fields and hashes;
interpret their entrance from `parameters.entry` rather than rewriting them.

`image_discovery_review` requires the saved discovery object, its source-bound
32-hex `candidate_id`, one to eight actual `evidence_ids`, `observation_text`
and a new pre-saved request ID. Evidence can be an exact ROI FFT/batch,
peaks/measurement view, committed measurement, peak-measurement batch or qualified
GPA. It must match the exact frame, source array, ROI and calibration revision.
The record retains numerical observations from the provider, not arrow labels.
Direct measurement points are checked against their original request, including
remeasurements. A review binds evidence; it does not confirm an explanation.

The existing `image_fft_batch`, `image_peaks`, `image_peak_measurements`,
`image_measure`, `image_gpa`, structure/comparison and F4 tools remain directly
callable. Nothing requires all of them, a full field or a named workflow session.
The discovery's proposed FFT settings are visible and editable. Its default
Hann FFT is not an admissible fixed-g GPA FFT; choose the existing qualified
unwindowed path only with sourced lattice/reference assumptions.

If review includes one to three compatible fixed-g GPA records on the exact
shared FFT/grid/aperture, `method_handoff` points to the existing
`image_method_plan`. Its finite budget and missing model/carrier/circuit
information must still be supplied. Fitted references or incompatible GPA
sensitivity studies remain valid evidence, but do not advertise that handoff.
No new global scheduler, database, budget authority or AnalysisContext role is
introduced. The Agent keeps total observational and scientific attempts/costs;
the existing tool journals own actual outcomes and recovery.

## Experimental feature method, not a physical classifier

The algorithm uses mature [SciPy Gaussian derivatives](https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.gaussian_filter.html)
and the classical local gradient-product
[structure-tensor construction](https://scikit-image.org/docs/stable/api/skimage.feature.html#skimage.feature.structure_tensor).
This implementation uses SciPy directly, without a new dependency or FFT engine.
Gaussian boundary handling, derivative/tensor scales, truncation, intensity
normalization and finite thresholds are saved in `discovery-report.json`.

It measures image-coordinate gradient energy relative to an image-wide
reference, local energy variation, and directional disagreement of the local
tensor. Their weighted score is a transparent heuristic priority, **not** a
probability, lattice-bending measurement, material strain or information gain.
Signed/anisotropic physical calibration is preserved for later scientific
measurements; it does not turn pixel-gradient directions into physical angles.
An explicit short-range correlation diagnostic can limit automatic proposals.
Correlated noise can pass that guard and aperiodic signal can fail it; it is not
a general signal/noise classifier.
The frozen score is0.5×energy-contrast +0.3×energy-variation
+0.2×directional-disagreement; components are capped at1 and nomination requires
score≥0.18. The saved settings also expose the0.15 correlation guard and0.35
overlap suppression. These constants are method choices, not calibrated error
rates, and are not silently adjusted to produce a preferred candidate.

Candidate identity binds source frame/array/calibration, rectangle and observation
entrance/version. The owning immutable discovery record retains settings and
scores. A displayed `region-N` is only a UI handle; numbering never establishes
cross-record identity. The full bounded observation table is saved as an
immutable report, while ordinary responses contain at most four candidates.
Feature reads do not rerun detection; source/payload/request checks are retained.

## Shared Panel, revision and recovery

Open `overview_object_id` using the existing `image_panel_open/show`. Its actual
source-coordinate overlays remain editable. A review also returns
`gui_view_object_id` for an applicable FFT/peak view. The review contact sheet is
display feedback with no fabricated coordinate mapping; open referenced source
views for scientific selection.

After a changed ROI, submit a new manual discovery with
`previous_discovery_id`. Read actual current Panel coordinates first. An old FFT
from another ROI is refused, even if its size or region number matches. For an
unchanged ROI and science, interpretation revisions can reuse all original
FFT/peak/measurement IDs through `previous_review_id`. History is flat, immutable
and capped at eight; changing frame/calibration is not disguised as continuation.
Display/label edits alone do not require a new FFT.
For a scale correction, explicitly attach the current calibration to the saved
FFT with the existing image_calibrate calibration_object_id mode and remeasure
on that wrapper. Review checks its effective current scale while retaining the
same original FFT array; a bare old-scale measurement is still refused.

Use `image_result` on original IDs after cancellation/timeout; never resubmit
unknown operations. Completed records reopen in a new provider/client. Original
source/FFT hashes, creator journals, explicit parent/child IDs, candidate identity,
history and GUI handoff are admitted before recovery. Observation overview
children reuse the existing deterministic `auto-` request scheme; unknown parent
work is never automatically replayed.

`image_export` saves discovery/review JSON, display PNG and bounded provenance to
a new, non-overwriting directory. Export FFT NPY/scientific arrays through their
own original objects; a discovery PNG is not those values. Old files and records
are not overwritten. See the [automation Skill](../skills/scientific-agent/microscopy-automation/references/image-first.md)
for composable runtime use and [acceptance](F4B_ACCEPTANCE.md) for actual scopes.

## Real-specimen entry and first-version limitations

Real experimental validation follows [Issue #43](https://github.com/wuchqwq/microscopy-workbench/issues/43).
Start with one authorized local original image and explicit ROI/reason; retain
its file/frame/dataset/plane, dtype, coordinates, source hash and known
calibration with its source. Unknown scale still permits pixel-domain manual
analysis. Private data and derived evidence stay outside the public repository.
Independent physical references are needed before testing a physical
interpretation; an FFT or a self-consistent review is not that reference.
The separate intake work in [PR #45](https://github.com/wuchqwq/microscopy-workbench/pull/45)
is not merged into this branch, and its CLI is not assumed to be installed here.
Data-intake readiness, successful operations and physical agreement are separate
acceptance levels; this freeze does not grant `REAL_SPECIMEN_PASS`.

Fixed64-pixel feature scanning missed both registered attention anomalies in the
initial public comparison; the existing structure field also missed the
same-carrier contrast depression. Manual attention still proceeds without a
field. These failures are retained, not corrected by changing truth/thresholds.
The fixed method can miss small, low-contrast or sharply oriented support even
when image differences are visible. Empty proposals never mean defect absence.
Any later scale diagnostic is separately labelled, not a replacement benchmark.
The freeze changes neither threshold, weighting, window settings nor the
registered truth. The32px diagnostic remains post-hoc, not independent blind
success. This release is a traceable **manual attention/evidence MVP**, with an
experimental proposal tool, not reliable automatic visual or defect discovery.
