# Fixed-site real-space observations

Use the existing tools according to the question; a full structure field is
not mandatory. Inspect `image_info` and the actual original-image preview first.
Keep the frame, source pixels, calibration and display range explicit. This
workflow does not infer depth, chemical identity or an image-formation model.

An absent atom may provide no bright maximum. From neighboring regular sites
in the **same image and same putative sublattice**, propose the expected site
and explain how its coordinates were inferred. Do not automatically center it
on the nearest bright column. If the lattice/site assignment is not stable,
stop with an unknown or request a researcher correction. Do not mix different
column types (for example Mo and S) as equivalent intensity references. The
tools do not verify that equivalence; record it as a sourced assumption.

Save a bounded ROI around the fixed expected position with
`image_discovery(entry:"manual",selection_origin:"agent"|"researcher",regions:...)`.
Manual means explicit coordinates, not mandatory human selection. Use
`image_probe` only for quick ephemeral reads. To retain evidence, call
`image_statistics` on that exact primary `rect`, optionally with:

```json
{"reference_comparison":{"reference_rects":[[32,32,40,40],[48,32,56,40]],"source_text":"Caller inferred equivalent same-sublattice sites from the current image; equivalence remains unverified"}}
```

These coordinates illustrate the schema, not a recommended specimen/site.
Each reference must have the primary ROI shape, lie in the same saved plane,
and be distinct. Overlap is reported; same-image observations are correlated.
Read individual reference means, not just their median difference. Inconsistent
references, scan gradients, mixed columns, noise, overlap or poorly registered
sites require an explicit unknown or a bounded revised observation. A new ROI
requires new evidence; no silent reuse or fitting drift to a neighboring peak.

`image_profile` can save a width-one raw line through the expected site and
neighboring positions. Bind a profile only when **all its sampled pixels lie
inside the discovery ROI**; otherwise make an appropriately larger separate
observation. `image_discovery_review` accepts saved statistics whose primary ROI
equals the candidate, and profiles supported inside it. Contextual references
are not measurements of that same ROI; a line does not cover the whole ROI.
The review reconstructs numbers from original request/array, retains object
references and unknowns, and never confirms the physical explanation. Probe
outputs are not saved evidence IDs. `image_export` retains comparison JSON and
profile numerical files. Recover uncertain writes by their original request ID.

Use an existing FFT for periodicity/orientation context if useful. Read
`selection_limit_reached` as equality to cap. The optional
`candidate_pool_truncation` diagnostic distinguishes an actual remaining
thresholded maximum outside returned-peak suppression from no such maximum.
Neither status establishes physical completeness. Returned peaks remain useful
conditional evidence; do not discard the whole FFT or simply raise its cap as
a point-defect solution. Positive/negative conjugate peaks are not independent
structural observations, and unchanged peak positions cannot exclude a vacancy.

## Optional expected-site feedback on the raw evidence

For a question about a supplied expected position, `image_discovery_review` can
optionally take `site_context`: question, an explicitly selected attached
`statistics_id`, fixed `expected_position_xy`, `position_source_text`, declared
`modality`, `signal_kind` and actual `signal_source_text`. The exact-ROI statistics
must include every supplied same-image reference. The coordinate is a prior,
not a detected peak; never move it to make the observation succeed.

Read the saved `site_observation`, preview and exported `site-observation.txt`.
They preserve each signed difference and identify references straddling the
target even when the median difference is zero. Exact signs have no significance
threshold. Agreement of signs does not verify reference equivalence. Explain the
raw observation, unresolved causes and the suggested next step in the user's
language; do not present the feedback as a defect probability or dump a score.

Unknown channel/processing keeps raw comparison available and recommends missing
acquisition information. Declared raw_counts does not verify independent Poisson;
derived iDPC/reconstruction values must not be relabelled as native counts. A raw
profile can be attached within the exact ROI; wider context needs a separate
observation. The review dispatches no S2/FFT/GPA and never localizes a column.
For version2, read each `profile_coverage` assessment: mere ROI containment does
not establish expected-site coverage. The finite requested line must pass the
original point within arithmetic roundoff; its actual nearest samples must
include that point's half-open pixel cell and distinct context samples on both
sides. Off-site, endpoint-only and sparse profiles stay attached but do not
complete this step. When coverage is not_verified, inspect it or add a through-site
profile without moving the point. This is minimal 1D support, not physical
resolution or adequate material evidence. Historical version1 suggestions are
unchanged and do not carry this qualification; deliberately revise with version2.
After a known outcome, revise with a new request linked by `previous_review_id`;
recover an unknown write only by the original ID. Omitting site_context preserves
the old review path. See [the workflow](../../../../docs/STEM_EXPECTED_SITE.zh-CN.md).

## Executable continuation of the raw question

When the user asks to continue the fixed-site question, explicitly request
`include_site_continuation:true` with site_context on `image_discovery_review`.
Read the actual evidence first. `site_continuation` is a deterministic suggestion,
not a fresh AI decision or a dispatched tool. For `tool_proposed`, retain its
source review and saved original IDs; choose whether the five-sample profile is
useful, then call the existing `action.tool` with its exact `action.arguments`.
After a known completed matching kind/request_id, append the result object_id
to ALL `after_success.arguments.evidence_ids` and call its existing review tool.
Never drop the original off-site profile or references, move the expected point,
or treat a proposal as measured coverage. Inspect actual new profile_coverage;
if still unverified stop and inspect, do not loop automatically until it passes.

Reference conflict/information/ROI-support/evidence-budget states have no tool
action. Ask for the specific scientific correction or stop with raw evidence.
Unknown write outcomes require their original image_result query. The existing
CLI `tool` now also admits statistics/profile/discovery/review with schema and
durable original-intent recovery; it does not admit S2 by this extension. There
is no new Panel slot, automatic model wake-up or AnalysisContext role. Save the
provider/workspace locator and exact review/request IDs for continuation.
See [user path and interface inventory](../../../../docs/STEM_TOOL_CONTINUATION.zh-CN.md).

## Optional conditional S2 column decomposition

For deciding whether the present question needs decomposition, use
[conditional method selection](conditional-methods.md) and its evidence index.
Raw S0 may already answer the question; its availability is not a defect claim.
An explicit S2 request with missing prerequisites may legally save raw + UNKNOWN.
Keep that durable abstention separate from an available conditional fit.

Keep the fixed-ROI `image_statistics` result as the default raw observation.
When overlapping columns matter and the required scientific premises are
available, explicitly choose `image_column_fit`. This separate tool does not
change old statistics or HRTEM requests. It is not a substitute for checking the
source image, reference equivalence or the image-formation assumptions.

Supply the exact saved spatial scalar `object_id`, a fixed 5x5 primary `rect`
and `reference_comparison` with 1..8 distinct same-image 5x5 reference rectangles
and actual `source_text`. Rectangles use half-open source-pixel edges, not PNG
coordinates. The worker takes a fixed surrounding 9x9 fit support without
clipping. An edge site without that support is unavailable; do not move its
readout to make fitting succeed.

`geometry.site_centers_xy` contains fixed source-pixel X,Y centres, primary
first and then the references in exactly their rectangle order.
`geometry.supplied_columns_xy` lists the supplied columns on the same grid,
including those sites; its bound is 256. Provide one positive `sigma_pixels`
and actual geometry/width `source_text`. These are caller-supplied assumptions.
The method does not optimize centres or widths, find a missing site's location,
verify a column type or silently replace a site by a nearby bright maximum.
Duplicate, excessive or underdetermined geometry is refused before fitting.

The narrow supported noise declaration is
`count_interpretation.model:"independent_poisson_counts"`, with actual
`source_text` explaining the acquisition/count interpretation. Admitted pixels
must be finite, nonnegative and integer valued. Integer dtype alone does not
establish electron counts or independent Poisson noise. Do not relabel arbitrary
brightness, normalized, denoised or background-subtracted values as counts; this
increment performs no gain, exposure or count-scale conversion. Missing geometry
or an unsupported noise interpretation saves the raw measurements with an
explicit S2 UNKNOWN rather than supplying a guessed model.

S2 fits nonnegative amplitudes of pixel-integrated isotropic Gaussian columns
and four nonnegative bilinear corner-background functions. Every supplied
neighbour whose Gaussian mass in that patch is at least 0.005 is included;
there is no centre-distance prefilter. "Joint" describes the column amplitudes
within each patch. Target and reference patches are separate fits, may reuse
overlapping pixels and do not define a global independent joint likelihood.
The request performs at most nine patch fits with the recorded solver limits
and convergence gates.

Read three different quantities separately:

- Raw 5x5 ROI mean and target-minus-reference-median, preserving the baseline.
- Fitted total 5x5 mean, including background and neighbours, and its contrast.
- Central-column integral, defined by the Gaussian's unit whole-plane integral
  and extrapolated from finite fit support, and its contrast. This is neither
  the directly observed 5x5 sum nor the 9x9 sum.

Inspect individual site status as well as whole-comparison status. A usable
target does not rescue a failed reference: every requested target/reference fit
must qualify before either fitted contrast is available. Keep failures, zero
counts, missing prerequisites and rank/budget reasons visible; do not drop a
reference, relax gates or expose a failed coefficient as an accepted measurement.
Numerical full rank and optimizer convergence establish neither statistical nor
physical identifiability. Wrong widths, geometry or peak shapes can give biased
values even when numerical checks pass. No calibrated CI, p-value, occupancy,
chemical identity, phase, vacancy probability or defect classification follows.

Save the original request ID before fitting. `image_info`, `image_result` and
`image_export` read and verify saved input/result identities without rerunning
the optimizer. An unknown request is not permission to retry it under a new ID.
Changed geometry, width, references or count interpretation needs a deliberate
new request; preserve the earlier evidence. This initial MCP/Skill increment
adds no Panel result editor, automatic Panel savepoint slot or AnalysisContext
role. Keep its provider object/request references explicitly; do not place it
in the old statistics slot. `image_discovery_review` can attach its saved
conditional numerical evidence to the exact primary ROI and declared 9x9
context; it does not qualify the physical model or interpretation. The original
physical convergence gate remains 10.034456% >10%, FAIL, and
formal physical blind acceptance remains NOT_TESTED.

Report signed raw mean differences and fixed support, not occupancy, electron
counts, calibrated confidence or vacancy probabilities. A weak projected column
can arise from composition, thickness, channeling, tilt, scan/background,
projection or image formation. A pristine paired image is useful offline truth
but is **not** required production input. Missing-column proxies do not qualify
physical STEM, real specimens or blind defect identification. No model training
or new dependency is involved. Human revision uses the same chain; a Panel does
not automatically awaken a model. Existing AnalysisContext slots remain
reference-only: do not invent a new statistics slot or bypass CAS revisions.

Primary references supporting the methodological scope (not a validation of
this implementation): [Nord et al., Atomap](https://doi.org/10.1186/s40679-017-0042-5)
for atom-column position/intensity analysis, and
[Hong et al., MoS2 defects](https://doi.org/10.1038/ncomms7293) for ADF contrast
interpreted with structural/simulation context. This increment does not install
or reproduce either method.
