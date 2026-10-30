# Image-first attention, evidence and revision

Use actual advertised tools and schemas, never runtime scripts or a remembered
developer fixture. Save each request_id before a write. Image pixels, source
frame and calibrated scientific arrays are authoritative; display PNGs and
heuristic scores are observations, not physical proof.

## Choose an entrance

Open the user-selected supported file with image_open and its explicit frame
with image_frame; inspect image_info and an actual preview. Do not invent XY
scale, phase radians, a material type or a known real-space lattice model.

- Researcher attention: read image_panel_current after the user selects a
  rectangle. Use its original source-pixel coordinates, not screenshot pixels.
  Call image_discovery with entry="manual", regions=[{rect,reason}], retaining
  the user's reason, optional candidate_explanations and unresolved questions.
  The returned entry_basis="researcher_statement" is not numerical verification.
- Bounded observation: call image_discovery with entry="feature", 1–2 window_sizes
  fitting the explicit frame (32–256 pixels), and max_candidates<=4. It reads raw
  values and uses spatial texture/tensor proxies, no FFT or full structural field.
  Scores are heuristic priorities, never probabilities, physical curvature or
  defect confidence. Inspect its PNG/source overlay and quality/unknowns.
- Existing field/GPA: use it directly if relevant. These modes do not require
  every image to go through a field, GPA or a phase-identification workflow.

A quality-limited or empty proposal is a bounded stop: request useful context
or explicit researcher attention if needed. It does not prove that no anomaly
exists. Do not repeatedly lower thresholds or resize windows until noise looks
like a defect. A contrast change can mimic a structural interruption.
If window dilution or insufficient sampling is a plausible explanation, one
explicit smaller-scale trial under the remaining budget is reasonable. Keep
the first miss, all costs and the new settings; do not lower the detector's
frozen thresholds or claim a failed nomination proves normal structure.

## Select and verify

Choose an actual candidate_id and retain its exact source and rect. The proposed
next_actions name existing image_fft_batch calls and estimated FFT pixels. Choose
one or a few under the task's total budget; count already attempted windows and
the feature scan/any initial field cost as well. The provider does not secretly
choose actions or invoke a model. It does not claim a global discovery budget
over direct tools; the runtime Agent owns this explicit bounded selection.

Use image_fft_batch with selected rectangles, visible window/subtract_mean
choices, then image_peaks and, if useful, image_peak_measurements/image_measure.
These are the existing algorithms and immutable records. Default proposed Hann
windowing reduces edge leakage, but changes the band shape. GPA requires its
already-qualified window="none" FFT and a sourced lattice/reference assumption;
do not silently reuse a Hann FFT or declare a lattice from the visual candidate.

Call image_discovery_review with object_id=<discovery>, candidate_id,
evidence_ids=<actual saved batch/FFT/peaks/measurements or qualified GPA>,
observation_text, candidate_explanations and unresolved questions. The tool
checks the exact frame, rectangle and calibration; it retains numeric evidence,
not text parsed from arrow labels. A successful review authenticates those
bindings, **not** the physical explanation. It always remains hypothesized.

The review's optional method_handoff points to existing image_method_plan only
when appropriate saved GPA was supplied. Supply its required finite budget and
sourced carriers/model/circuits. Otherwise measure, compare references, inspect
an adjacent region, request missing conditions, or stop. Do not run every method.

## Return to the common view and continue

Open the returned overview_object_id in the existing image_panel_open/show for
source/ROI context; use gui_view_object_id from a review to inspect a selected
FFT/peak view. Candidate annotation_map IDs are UI handles only: never infer
scientific identity from region/peak numbering. Keep the original candidate_id
and source/grid references.

After the user moves a region, read the panel's current scientific coordinates
and create a new manual discovery with previous_discovery_id. A new rectangle
needs a new ROI observation; an old FFT from another rectangle is refused as its
evidence. Unchanged rectangles and settings can reuse an existing FFT batch via
previous_batch_id. Display/label-only changes do not warrant FFT recomputation.
Revise an explanation using previous_review_id and unchanged numerical evidence;
retain old records. Scale changes need explicitly current calibrated evidence,
not silent reuse of old physical measurements.

Export a discovery/review using image_export to a new directory (JSON, preview,
provenance); export its original FFT/scientific arrays separately with the same
existing tool. Retain the source/discovery/review IDs and original request IDs in
the final continuation. On reconnect use image_result/image_info before creating
anything. A failed/unknown operation is not automatically replayed. If using a
named AnalysisContext, use its supported roles and CAS; this increment adds no
new Context roles or second request authority.

Report observations, negative evidence and unresolved interpretations separately.
A morphology, angle, mirrored pattern or FFT alone does not identify a unique
phase, twin, dislocation or three-dimensional structure.
