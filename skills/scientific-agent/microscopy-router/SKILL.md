---
name: microscopy-router
description: Choose a minimal, evidence-grounded route for a microscopy image and research question, or continue after a scientific correction. Use when input conditions or competing analysis routes need resolving; a simple known tool call needs no workflow session.
---

# Start from the research question

Work from an image and a question in Codex; the workbench is optional. Choose the
smallest useful check, explain its premises, execute only available and permitted
operations, then return evidence and what it cannot decide. Do not turn every
image into a HRTEM/STEM, GPA, reconstruction or phase-identification workflow.

## Establish what can answer the question

- Identify the requested quantity or decision: a period/direction, a difference
  between regions, a supplied site's contrast, a structure hypothesis, or a
  correction to an existing result. Reuse the selected saved half-product.
- Distinguish an accessible scientific original/array from an exported raster or
  screenshot and from a transported preview. Retain the supplied source,
  frame/page, ROI and relevant existing results. A preview's file path does not
  prove that the actual model inspected it; do not make visual claims without
  inspection. Rendered pixels are not the original intensity array.
- Read available metadata and the actual tool catalog/schemas. Separate source
  origin (experimental, simulated, unknown), modality, array/coordinate domain,
  signed XY sampling and known acquisition/model conditions. Appearance, a file
  name or a reconstruction label does not establish any of them. A 110° scan
  rotation is an instrument/image angle, not the crystallographic zone axis
  [110]; a zone-axis interpretation needs the actual cell and a stated basis.
- Distinguish an advertised operation, its present dependencies, and a result
  actually obtained. A missing tool, unsupported scientific premises, a denied
  operation and an unknown original request require different responses.

Before calculation, briefly state **what can be measured now, which missing
condition limits the requested interpretation, and why this check is useful**.
Ask only for conditions that change that answer; continue authorized pixel-domain
work when it remains useful. No scale means pixels/cycles per source pixel,
not a guessed nm/Å value. Image-coordinate angles do not establish physical
angles when XY aspect or axis geometry is unknown. Record sourced corrections
rather than adopting a convenient example calibration.

## Choose one useful route

| Researcher's task | Minimal route | Stop or qualify when |
| --- | --- | --- |
| View an image, compare local contrast or inspect a supplied site | Use [observe and revise](../microscopy-observe-revise/SKILL.md): inspect the exact input, choose a small explicit ROI/reference and obtain original-array statistics or a profile as needed. | A display stretch is not an intensity change; unknown detector units are not atom counts, occupancy or a defect. A supplied point is not an autonomous detection. |
| Compare local periods or directions | Use the same observation loop; save a bounded ROI FFT only if needed, with window/mean/DC and coordinates explicit, then measure the relevant peaks. | No physical sampling means no physical spacing. One peak or PNG similarity cannot identify a phase or establish strain/resolution. |
| Compare a few explicit structures or reflection/orientation hypotheses | Use [crystallography compare](../crystallography-compare/SKILL.md). Keep competing explanations and ask for only the missing premises of this check. | Separate independent-scale testing from model-conditioned scale exploration; fitting a candidate's scale cannot validate that candidate or an absolute scale. |
| Revise scale, a point/centre, ROI, source or conditions | Use the observation loop's dependency review, retaining old evidence and explicitly remeasuring only affected geometry. | A scale correction does not require another FFT. A changed source/frame/ROI cannot inherit old anchors silently. |
| Compare already saved fixed-g GPA bands | Read [cross-method continuation](../microscopy-automation/references/method-loop.md) only for this requested saved-result route; report amplitude, wrapped phase, support and unknowns separately. | This is not raw HRTEM ingress, automatic strain validation or a reason to force every image through GPA. |

A supplied STEM expected site/reference or column-pair question may use
[shared STEM objects](../microscopy-observe-revise/references/stem-shared-objects.md)
when the corresponding tools and data conditions are present. Ordinary contrast
or pixel geometry remains useful when atom localization/count interpretation is
unsupported. A request about a reconstruction does not itself authorize running
or changing that reconstruction; route from the accessible supplied result and
its documented meaning.

For a relevant, explicitly requested multiscale/field/topology/twin route, read
[microscopy automation](../microscopy-automation/SKILL.md) and its
[bounded scope](../microscopy-automation/references/automation-scope.md) rather
than silently adding those computations. These specialized routes do not make
same-source outputs independent observations.

## Capability gaps and continuation

Prefer the present provider and its scientific journals. If the required
operation is genuinely unavailable, state the exact gap and consider a small
permitted local script with declared inputs, dependencies, hashes and output
limits; read the [narrow fallback contract](../microscopy-observe-revise/references/local-fallback.md)
only for that gap. A script result is
not a provider receipt. Never substitute a script, endpoint, model, case or
session for a denied action, or use fallback to replay an unknown request.

Keep internal IDs, schema JSON and dependency bookkeeping out of the researcher's
input burden. Retain them in the record yourself. When placing, revising or
comparing an ROI or peak interactively would affect the answer, use
[resume and interact](references/continuation.md) to open or focus the same
workbench through the host's available tools. Use that reference for saved tasks
and interrupted requests as well. For questions that can be answered directly,
use the selected immutable objects with ordinary tools.
The [call shapes](examples.json) are composable schema examples, not a mandatory
sequence, actual execution evidence or scientific answers.

Return the measured/image evidence, algorithm output, proposed explanation and
remaining scientific premises distinctly. State the checks actually run and
what supports, conflicts with, or cannot distinguish the candidates. A transport
success, immutable receipt or deterministic residual is not independent material
validation; leave insufficient and indistinguishable conclusions available.
