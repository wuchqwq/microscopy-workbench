# Conditional S2 increment: scientific contract

This increment follows the accepted selection recorded at research commit
`c9fc6bd267d67144a85a3dbb42f2049d3cdfc245`. It keeps current HRTEM peak and STEM
fixed-ROI methods as defaults and adds S2 only through explicit optional input.
It does not promote a new automatic phase/defect classifier.

## Fixed model and scope

For each supplied target/reference site, fit the saved scalar count pixels of a
fixed 9x9 support using nonnegative coefficients of pixel-integrated isotropic
Gaussian columns and four bilinear corner-background functions. The central
column centre and common sigma are supplied, never optimized or moved to a bright
maximum. Retain every supplied neighbouring column whose Gaussian integral in
the support is at least 0.005. This preserves the corrected research support
rule. Read out the fitted full mean on the fixed central 5x5 ROI separately from
the central-column integral. "Joint" means joint column amplitudes within each
patch; separate target/reference patches do not form a global independent
joint likelihood, and overlapping supports can reuse the same pixels.

The research model is `vendor/poisson_models.py` from the preceding comparison,
SHA256 `87c0cf265e2b663e01aea622ec4b7b032930d765ea7b45697f50bb5d9088d210`.
Keep its optimization budget and convergence thresholds; any port changes must
be enumerated. Production guards may reject unsupported shapes, excessive
geometry, duplicate columns or an underdetermined design before fitting. These
guards are operational/model-admission boundaries, not new physical accuracy
thresholds. Do not import its separate two-Poisson confidence diagnostic into
this feature.

For fixed templates the Poisson objective is convex in nonnegative amplitudes.
That does not validate the templates, classify a site, or give a calibrated
uncertainty interval. The observed failure/coverage and width-mismatch evidence
are reasons for keeping the model conditional. A supplied centre/sigma is a
scientific assumption, not automatically a verified observation.

## Admission and provenance

- No fit unless the caller explicitly requests S2. Old requests retain their
  baseline behaviour and saved identities.
- Require explicit source-frame geometry and sigma, linked to the exact primary
  and 1..8 reference ROIs. Preserve selection/source text and original array,
  request and scientific-grid identities. Coordinates are X,Y; arrays are Y,X.
  ROI edges remain half-open, and source boundaries are never silently clipped.
- The minimum version accepts only an explicit caller interpretation of the
  pixels as independent Poisson counts, with the actual source/calibration
  explanation. Integer dtype alone proves nothing. Do not turn arbitrary image
  brightness, a normalization, denoised data or background-subtracted values into
  counts. Require finite nonnegative integer-valued pixels for this narrow
  admitted path; do not add gain/exposure conversion or an approximate Gaussian
  noise path in this increment.
- Record Gaussian shape, fixed geometry/width and same-class-reference
  assumptions as caller supplied and unverified. Do not invent a validation
  checkbox that converts an assertion into a verified scientific fact.
- Missing/unsupported scientific prerequisites yield a saved UNKNOWN reason
  alongside baseline raw measurements. Malformed API requests may be rejected
  by ordinary schema validation. Do not fabricate a fitted value to satisfy a
  complete-output shape.
- Keep a bounded maximum of supplied columns and fits. Verify design dimensions
  before SVD; rectangular SVD alone must not admit more unknown coefficients than
  pixel observations. Reject duplicate geometry rather than silently making two
  physical labels appear as one identifiable column.

## Output contract

Keep these distinct, with their units and eligibility:

1. Baseline raw 5x5 mean and target-minus-reference-median, unchanged.
2. S2 full fitted 5x5 mean, including background and neighbours, plus the same
   total-intensity contrast when all required fits qualify.
3. S2 central-column integral and its target-minus-reference-median only when
   target and every requested reference component qualify.

The Gaussian basis has unit integral over the whole plane. Its coefficient is
therefore a model-extrapolated whole-plane column integral, not the directly
observed sum in the finite 5x5 or 9x9 support. Dividing by the captured Gaussian
mass is one reason width/shape assumptions matter. State this meaning explicitly
with the component output; do not label it an observed atom count or ROI sum.

Per-site results and whole-comparison availability are separate. A usable target
fit cannot mask a failed reference. Expose zero-count, rank, budget and optimizer
failures as UNKNOWN, including diagnostic numeric evidence where appropriate,
but do not expose failed coefficient estimates as accepted measurements. Record
selected columns, omitted-by-support columns, support rectangles, solver limits,
gradient/rank diagnostics, model/version hashes and the reason for abstention.

No calibrated confidence, chi-square p-value, significance, vacancy probability,
occupancy, Z, chemical identity or phase claim is returned. Residual/deviance
diagnostics are descriptive. Same-image and overlapping references need not be
independent. Reference equivalence remains an assumption even after convergence.

## Compatibility and human revision

Use the existing provider/MCP request journal and export/evidence chain. Do not
add a second agent framework or a new implicit AnalysisContext registry. Preserve
baseline observations and history. Reading, recovery, review and export must
verify the stored input/result identities without re-running the optimizer.
Human/agent corrections to geometry, width, references or noise interpretation
create new explicitly linked evidence; they do not overwrite the old fit.

The Skill keeps baseline measurements first. It may propose S2 when overlap
matters and the required count interpretation and geometry are available. When
those premises are unavailable, report the unknown or seek a scientifically
meaningful correction; never fill them with an assumed default. A research
synthetic example is not a recommended specimen configuration.

## Bounded validation plan

Run directly affected Python and Node/TypeScript contracts and a bounded actual
provider/MCP handoff; follow AGENTS.md rather than repeat unrelated full suites.
Include these representative cases:

- unchanged legacy statistics and reference results, and historical readback;
- a supplied-geometry, independent-truth positive count fixture with overlap;
- zero target versus missing target signal, low counts and all-zero support;
- rank/duplicate/oversized geometry and fitting-support source-boundary cases;
- non-count/negative/nonfinite input and absent scientific prerequisites;
- wrong-shape/width cases retaining conditional/unknown physical interpretation,
  without expecting the code to infer a hidden true shape from one image;
- a failed reference versus an accepted individual target, preserving whole-row
  UNKNOWN and no silent dropping of references;
- original request recovery, saved-fit readback/export and review/source identity,
  including a check that these operations do not call the optimizer;
- no regression of default HRTEM or no-opt-in STEM output contracts.

Use a small number of deterministic/seeded analytic fixtures, not another broad
noise matrix or physical simulation. New integration checks demonstrate software
behaviour under stated model assumptions, not real-specimen accuracy.

## Historical and Git boundaries

The original physical gate remains **10.034456% > 10%, FAIL**. Formal physical
blind acceptance remains **NOT_TESTED**. All prior routes, missing results,
failure records and the selection evidence remain unchanged.

The engineering baseline was `a0258f7cb3d108fb106da6cc929af6e769c0cebf` (production
code equal to `db2d71383bb1d3b50e8dba4701553550d016e46e`). Remote main was read
through GitHub's branch API for this increment and was still
`c69424ac25a35efd816d68cacd5904f5381c7485`. Sol must verify local state, implement
in an isolated checkout/branch, commit the decision and test trail locally and
provide a reviewable handoff. No push or merge is authorized in this increment.
