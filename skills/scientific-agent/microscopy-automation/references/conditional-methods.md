# Choose a method from the evidence

Use this reference when deciding whether existing HRTEM/STEM observations answer
the question, whether to propose S2, or what remains UNKNOWN. Read the packaged
[method evidence index](method-evidence-index-v1.json)
and its linked evidence for the relevant route. This is guidance for the host
Agent, not an automatic classifier or a mandatory sequence.

## Start with the observable that answers the question

| Question and evidence | Useful choice | Limit or stopping condition |
| --- | --- | --- |
| HRTEM periodicity/orientation on a selected support | H0, the existing FFT/peak/measurement path; use core and directional context when useful | Keep each support's identity. An arm-only frequency is not established in the core. Peak fitting or convergence does not establish physical periodicity. |
| STEM raw target/reference intensity on fixed same-image sites | S0, the existing fixed-ROI statistics and optional profile | Sufficient for reporting signed observed contrast and reference disagreement. An unexplained weak column is still a useful observation; S2 is not required to make it reportable. |
| Estimating a latent expected total ROI mean under detector noise | S0 remains an available estimator; consider conditional S2 fitted total mean only with explicit premises and the estimation goal | Raw observed mean is exact for the observed array; latent expected mean is a different estimation goal. New unseen evidence below favoured S0; no automatic denoising benefit follows from CPE. |
| Separating a central-column component from overlapping neighbours/background | Consider explicit conditional S2 alongside S0 | A different estimand, not a more accurate replacement for raw ROI intensity. Require sourced count interpretation, fixed geometry, width/shape and reference assumptions before describing a fit as available. |
| Missing or conflicting acquisition, geometry, width/shape or reference information | Retain the raw observation and scoped UNKNOWN; ask for the missing scientific information when it changes the answer | Do not turn integer pixels into an acquisition claim, guess a sigma, drop a disagreeing reference, or move the expected site to a bright maximum. |
| H1 continuous-frequency refinement or S1 isolated-column fitting | Cite the research history if relevant | Neither is a production default or an additional tool in this increment. A new research comparison needs separate scope; do not silently implement or dispatch it. |

Baseline is enough when its actual observable answers the present question and
its limitations can be reported. It is also enough to establish that the current
evidence cannot distinguish explanations. Do not escalate merely to obtain a
positive defect label, to hide noise, or because an optimizer is available.

## S2 has two valid explicit entry outcomes

For a useful decomposition proposal, explain the observed overlap/background
question and retain the fixed source/frame/ROI plus raw target/reference evidence.
Read [point observations](point-observations.md) for the exact tool shapes,
5x5 readouts, untrimmed 9x9 supports, site order, bounds and output meanings.

The following remain caller-supplied premises, not facts verified by fitting:

- **Counts:** an actual acquisition/count explanation supporting
  `independent_poisson_counts`; finite integer pixels alone are insufficient.
  No conversion of normalized, denoised or background-subtracted brightness is
  performed by this route.
- **Geometry:** fixed expected sites and the supplied neighbour set on the
  original saved spatial grid, with their source. Do not infer the missing site
  from the nearest maximum or change the ROI to obtain a successful fit.
- **Width/shape:** a sourced positive isotropic Gaussian width and an explicit
  account of why that supplied shape is a useful conditional model. If shape
  adequacy is unknown, state it; numerical acceptance cannot verify it.
  In a decision record, `width_shape.status=supplied` means the declaration was
  supplied, not verified; its `source_text` can say shape adequacy NOT_ASSESSED.
- **References:** actual identities/rectangles and a sourced same-class
  equivalence assumption. Review individual references and overlapping supports;
  same-image sites are not independent replicas.

With those premises supplied, propose `image_column_fit` as **conditional S2**.
Without them, stop with raw evidence and UNKNOWN or request a scientific
correction. A missing/unsupported optional count interpretation or geometry/width
may also be deliberately left absent or explicit in a legal `image_column_fit`
request to save **raw + UNKNOWN**. Required object/ROI/reference fields and their
actual selection source text must still satisfy the tool schema. Missing required
reference rectangles/text is a pre-dispatch refusal, not a saved UNKNOWN.
Reference equivalence and shape adequacy are not automatically checked by the
worker: their uncertainty alone does not promise a numerical UNKNOWN result.
Do not suppress known inputs to manufacture an abstention reason. A legal saved
abstention is useful evidence, not an available fit; the Skill does not require
inventing prerequisites to make the request pass. The worker remains authoritative
for admission, accepted values and UNKNOWN reasons.

After execution, read target **and every requested reference**, the whole
comparison status and saved diagnostics. A qualified target cannot rescue a
failed reference. Preserve S0, fitted total-ROI intensity and the extrapolated
whole-plane central integral as separate quantities. A successful fit may remain
physically UNKNOWN; it establishes neither occupancy, vacancy, chemistry, phase,
calibrated confidence nor a unique image-formation explanation. Reference
disagreement or wrong shape/width can matter even when all numerical gates pass.

## Record the choice without creating another scientific authority

Keep the decision in the analysis answer and existing source-bound ROI/annotation
notes. For a reusable handoff, use the
[decision record contract](method-decision-contract-v1.json)
and [synthetic examples](method-decision-examples-v1.json). Keep a short note with
the decision/evidence references within the existing note limit; a longer record
may be an explicitly saved sidecar. Do not add a provider journal, candidate
store, Panel result slot or AnalysisContext role. The record describes the
Agent's choice; provider receipts remain authoritative scientific evidence.

Record actor, question/reason, selected method and estimand, provider/workspace
locator and session if known, exact saved source/frame/ROI and calibration
reference (null is allowed for unknown calibration), baseline and conditional
object/request references, premise sources/unknowns and numerical versus physical
status. New/saved measurements need their complete source/frame/ROI. Recovery or
a stopped unresolved write may instead retain source/ROI as explicit nulls when
only the original locator and request are known; never invent placeholder IDs or
coordinates. Use `selection_origin=researcher` only for an actual
researcher choice. Include the method-index version and evidence used, not a
claim that an analytic benchmark proves this image is physically accurate.

The optional stdlib-only checker
`python scripts/check_method_decision.py RECORD.json` (from this Skill directory)
checks the explicit record's shape and permitted state transitions, without
choosing a method, reading image arrays, submitting tools or writing files. It is
a record-specific check, not a general JSON Schema implementation or a verifier
of the truth/authorship of source text. It cannot authenticate source dependencies
or replace the provider's saved-result verification.

Save a write's original ID and provider/workspace/session locator before dispatch.
For an unknown/pending outcome, stop the affected write or query `image_result`
on that original ID in that retained locator; neither a different ID, workspace
nor another tool is recovery. The locator declares scope and is not authenticated
by this authoring checker. After a known outcome, a deliberate change of geometry, width,
reference or count interpretation uses a new request ID linked to the old one;
preserve the old evidence. Read/info/export/review must use the existing P2
source/design qualification without optimizer replay. See the
[readback boundary](READBACK-P2-BOUNDARY.md) for the
local consistency threat model; unkeyed hashes are not authentication.

## Read the separate physical evidence before proposing an improvement

The [safe physical records](science-records-v1/manifest.json) supplement the
analytic selection comparison. They tested scientific revision `2ed81e1`, not a
physical retest of this integration candidate. Read the relevant study and
[interpretation](science-records-v1/interpretation.json):

- [Original blind](science-records-v1/studies/01-original-blind.json), 8 queries:
  AI used S0 throughout. S2 was NOT_REQUESTED, not a solver UNKNOWN or evidence
  that S2 was worse. Observed-intensity wording did not clearly specify latent
  denoising; this possible confound does not establish why the Agent chose S0.
- [Revealed same-frame exploration](science-records-v1/studies/02-revealed-same-frame.json),
  8 queries: fixed S2 totalmean error improved on 6 and worsened on 2. Two whole
  comparisons remained UNKNOWN because references failed, while query-local
  CPEs were available. This was nonblind, not blind validation or routing gain.
- [New unseen blind](science-records-v1/studies/03-new-unseen.json), 4 related
  queries on 2 frames with an explicit latent expected-totalmean goal: S0 had
  the lowest MAE and RMSE. AI requested S2 for 2/4 queries; fixed S2 qualified
  4/4, but both routes had worse aggregate errors than S0. Numerical acceptance
  therefore does not establish accurate physical estimation.

Keep these studies separate; neither the earlier exploratory gain nor the new
negative result establishes general superiority or a new default. Preserve H0/S0,
explicit conditional S2 and scoped UNKNOWN. The historical run03 grid FAIL and
then-NOT_TESTED blind record remain unchanged in the frozen analytic evidence.
Per-site accepted total means/central integrals require that site's qualification;
target-minus-reference comparison requires every requested reference too. None
of these quantities or numerical gates establishes occupancy or atom counts.

From this Skill's `references` directory,
`python -B science-records-v1/verify_package.py` checks bundled hashes and safe
error arithmetic. The small package is not self-contained physical reproduction:
external Git/local-only arrays and journals are not bundled. It contains no
hidden truth, seeds, credentials or raw account stderr.
