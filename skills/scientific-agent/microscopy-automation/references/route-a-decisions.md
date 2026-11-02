# Route A: autonomous choices with inspectable evidence

Read the current image/ROI and the research question before choosing a tool.
You may choose ROIs, peak candidates, a bounded processing comparison, or a finite
physical hypothesis without asking for permission at every step. A user may
correct the selection at any time. Do not infer missing experimental facts.

## Read the result in three layers

New supported scientific records may carry `result_semantics.version=1`:
`numerical.checks`, `measurement_reliability.assessments`, and
`interpretation.assessments`. Read each row's **scope, status, basis and
source_fields**, together with the original diagnostics. `satisfied` applies only
to that stated check. `not_assessed` is not failure. `insufficient_evidence` limits
the named judgment, not all observations or candidate discussion. A feature
algorithm requiring multiple directions can be insufficient while a selected
single-direction period is measurable.

Absent means **not recorded** on this historical object; do not backfill or
reinterpret its old `valid`. An unavailable projection or unknown version calls
for reading the exact original object, not guessing the missing qualification.
No numerical status certifies a material, a true reflection, or statistical
significance. Do not invent SNR, uncertainty, probability or false-discovery rates.

## Choose, execute and record

Use existing ROI/annotation notes and object references, not a new candidate
store. Record a compact sequence in a note and the analysis answer:

1. **Choice / actor:** who selected which ROI, peak or working hypothesis.
2. **Reason:** observed pattern and the current research question.
3. **Evidence:** actual image, ROI, FFT, measurement and context references.
4. **Execution:** only tools and parameter comparisons actually completed.
5. **Outcome:** numerical results, agreement and conflicts.
6. **Unknown:** unassessed qualification and indistinguishable explanations.

For explicit manual-entry discovery use `selection_origin=agent` for your choice,
`researcher` only for a genuinely supplied researcher selection, and `unspecified`
when unknown. This is caller-reported provenance, not authenticated identity.
A note may say “I provisionally favor this peak because …”; keep it hypothesized.
Never use the twinning-specific `research_observation.authority=user_confirmed`
to save an AI guess. Do not relabel a manual choice as an AI discovery.

Choose a finite comparison only if it can address a stated uncertainty. Record
its cost and what it cannot resolve; do not vary thresholds until a favored answer
appears. Different windows or processing of one image are dependent checks.
A refined coordinate does not demonstrate resolution of a close doublet.
Pure-noise local maxima allow numerical diagnostics, not forced lattice claims.
Missing calibration permits cycles/pixel and pixels; no invented physical scale.
Several candidates may remain compatible with the same projection.

## Rejoin the shared workspace

Read `image_panel_current` before acting on a retained Panel and again after a
researcher edit or a long-running operation. Respect current source/grid/
calibration bindings, dirty drafts, pending saves, gestures and revision guards.
If the shared-workspace API is available, follow its advertised proposal/accept
contract; never bypass it with a direct replacement of the Panel state.
An old measurement stays history after a corrected anchor; remeasure explicitly
against the new saved state if needed. A timeout or unknown original request is
queried, never automatically replayed. Preserve the old record and interpretation.

Report conditional results and useful next *analysis* actions. Do not plan the
next microscope acquisition, enforce a full structure-field pipeline, or force a
unique phase/twin/defect choice. See [peak quality](peak-quality.md) for available
diagnostics, parameter costs and targeted stopping conditions.


## Keep a chosen ROI resumable

When saving a ROI or peak that will be selected, edited or handed off later,
provide `purpose:resumable_observation`, a distinct stable `annotation_id`, and
`selection_origin:agent` in the existing `image_annotate` request. The saved origin
is caller-reported, not authenticated; use `unspecified` when that declaration is
unknown. Keep the original researcher selection separate from an Agent revision.
Anonymous annotations are allowed for display, but cannot identify a saved ROI
for handoff or an update. Their numerical measurements are not thereby invalid.
After presenting a saved choice, read `image_panel_current` and check the actual
`roi_handoff` row's usability and reason; a successful image_panel_show alone does
not prove that the saved ROI can be continued. If a previous annotation is
anonymous, keep the old object intact and create a new explicitly identified
choice with its actor/reason; do not backfill the historical identity. If showing
an FFT instead of the source ROI, name the saved ROI reference and the reason for
that display, without pretending the spatial ROI is selected on the FFT grid.

Respect the advertised note `maxLength` (1000 UTF-16 code units for new MCP writes;
supplementary characters count twice). Never truncate a draft to obtain acceptance. Keep saved notes concise with stable evidence references; put the longer reasoning in the analysis answer. A schema refusal is not a numerical result. Query the original request if its outcome is unknown, and never claim a rejected note was saved.


## Unknown writes include indirect tool effects

`image_panel_open` opens an explicitly saved preview/view. `PREVIEW_REQUIRED`
means that this open did not dispatch rendering. Recover the original preview
first and open its returned saved object, rather than asking another entry to
render the same input.
Changing request ID, display-size cap or entry point does not make an equivalent
write independent. After REQUEST_NOT_FOUND or a transport parse failure, retain
the original request as unknown; use existing read-only object/result/current
queries, and stop the affected write. Do not use another tool that implicitly
performs the unresolved operation. Other already saved observations can still
be discussed with their own sources and limitations.


Preview admission persists across client reconnects and known aliases of the same
fixed source/frame. `PREVIEW_OUTCOME_UNRESOLVED` names the original request.
`image_result` reads it without replay. A completed result may be shown directly.
For a deliberate new rendering, pass its saved view as `object_id`, or provide
`resolved_preview` with the exact original request/object. When a composed tool
requires the raw frame, first use `image_preview_acknowledge` with those exact
references and a new recorded receipt request ID. This acknowledges a resolved
outcome; it does not certify the image, authorize an unknown preview, or prove a
human saw it. Recover that receipt by its own `image_result` ID. Unknown or
corrupt records remain blocked: do not delete admission files, infer non-dispatch
from NOT_FOUND, wait for a TTL, or choose another ID/size as recovery.
