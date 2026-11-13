---
name: microscopy-observe-revise
description: Turn a microscopy image and a limited question into source-bound observations, measurements and revisable explanations. Use for local period/direction, intensity or supplied-site questions, including pixel-only input and corrections to scale, ROI, points or conditions.
---

# Observe, test and revise

Start with the research question and the image already supplied to Codex. A
workbench is an optional way to select or correct a region, not a prerequisite.
Choose the smallest check that could support or contradict the explanation;
ordinary inspection does not require GPA, a structure model or an analysis session.

## Establish the input and the next useful check

Inspect the actual tool catalog and input access. Distinguish an accessible
original scalar array from a rendered attachment or screenshot. Visually inspect
an image only through an available, permitted image-reading tool; a returned path
does not prove the model saw it. If only a rendering is available, describe
visible features provisionally and ask for the original only when the requested
numerical claim needs it. Do not sample a rendered/exported PNG as if it were the original scientific array.

### Choose the provider for a new original TIFF

In the current session's actual tool catalog, prefer `microscopy-core` over
`microscopy-images` when core supports the original TIFF layout and offers
`image_open`, `image_frame`, `image_info` and the requested readout (for example,
`image_statistics`). If the required core tools are absent, name the gap and
report that a new session exposing those tools is needed. Keep ongoing work
running with its existing approval settings.

Use the original TIFF and retain its signed `float32` values, including negative
samples, without quantizing to `uint16`. Select an explicit zero-based frame.
Keep source, frame, ROI and statistics in the same provider and workspace. An
existing object stays with its originating provider and workspace. Never pass
its `object_id` to a different provider.

A format refusal such as `UNSUPPORTED_LAYOUT` does not establish a missing tool.
Keep the original request ID and receipt. After a refusal, import the original
file in a different provider only when the original request is verifiably
terminal `failed` and the new provider supports the original layout. Use new
request IDs and obtain new source and frame identities there. If the original
outcome is unknown, query it in the original provider/workspace and preserve
that state until resolved. Do not replay it or switch providers while it is unknown.

Bind source hash/object, frame, dtype/axes, saved source-pixel ROI, scientific
grid, calibration revision and conditions. Preserve unknown origin, modality,
physical scale and uncertainty rather than guessing them from appearance or TIFF
resolution tags. An unspecified image domain still permits qualified pixel-array
exploration; it does not establish HRTEM, HAADF, reciprocal space or physical
slice depth.

State what this input can measure, the missing premise that affects the answer,
and the reason for the chosen next check. Missing scale permits pixel lengths and
cycles/pixel, not nm/Å spacings or physical angles needing unknown axis aspect.
Keep Agent-proposed ROIs, peak choices, references and interpretations explicitly
proposed; do not convert them into researcher selections or `user_confirmed`.

## Close one evidence loop

- Form a limited explanation and a plausible alternative. Say what measurement
  would support or conflict with each; do not require a fully simulated candidate
  just to discuss it. Stop at insufficient or indistinguishable when appropriate.
- Use the existing provider needed for that question: `image_statistics` for raw
  ROI readouts and explicit same-shape references, `image_profile` for supplied
  source-coordinate lines, `image_fft` for a justified saved region, and
  `image_measure` for explicit points. Read each actual schema first. Preserve
  all requested references, differences and overlap; ROI order is not target role.
- Compare original-array numbers, algorithm output and visual observations
  separately. Fixed display limits aid comparison; auto-stretch, zoom, smoothing
  and logarithmic PNG similarity do not establish structural change or resolution.
  For a period/orientation claim inspect support and conflicting peaks, retaining
  window, mean subtraction, point choice and cycles/pixel versus cycles/length.
- Return the measured values and source/range, supported and conflicting aspects,
  candidate assumptions, missing conditions and checks actually run. Same-frame
  ROIs or several transforms of one FFT are not independent experiments. No
  calibrated probabilities or material/defect confirmation follow from completion.

For supplied STEM expected positions and target/reference regions, read
[shared STEM objects](references/stem-shared-objects.md). Keep the original point
unsnapped, all references and reference conflicts. A width-one profile, bright
maximum or conditional fit is not an independently located atom, occupancy,
element, resolved dumbbell or confirmed defect. For supplied structures or indexed
reflections, continue with [crystallography-compare](../crystallography-compare/SKILL.md)
without inventing a registration.

## Accept a correction without rewriting history

Read the researcher's correction as new evidence, not an invitation to defend the
old candidate. Preserve old records and explain which claims now need revision.

| Correction | What remains reusable | What must be checked or replaced |
| --- | --- | --- |
| Display range/gamma/zoom only | Original arrays and valid measurements | Appearance-based comparison; do not recompute science merely to redraw |
| Sourced X/Y scale or axis aspect | Same source/ROI FFT bytes and valid saved points | Apply `image_calibrate`, preview its wrapper, explicitly `image_remeasure`; physical geometry and dependent registration/comparison become stale |
| Corrected points or valid reciprocal centre | Same source/grid arrays | Sourced point/centre revision and affected measurements; `image_center` cannot move an external complex FFT's mathematical DC |
| Different source/frame/ROI/FFT producer | Historical results on their original input | New binding and applicable measurements; never stretch, translate or relabel old anchors onto the new input |
| Modality/count/structure premise changes | Raw observations with their old conditions | Reassess model eligibility and conclusions; do not automatically rerun unrelated numbers |

Save each write's request ID before submission. After a stopped wait or unknown
outcome, query `image_result` in the original provider/workspace; do not rerun under
a new ID to make a result appear successful. Definitive failed, not-submitted,
computed-not-accepted and saved are different states. A corrected new request
needs an explicit reason and must not impersonate the old request.

When AnalysisContext is used, read `analysis_read` before work, persist provider
results first, then advance applicable references with `analysis_update` against
that revision. A CAS conflict preserves the historical result: review current
dependencies; do not change only `expected_revision` to force promotion. Source
changes leave old claims historical even when their files remain valid.

For optional Panel selection, late-result acceptance, exact FFT observation links
and export/recovery details, read [provider continuation](references/provider-continuation.md).
Keep IDs and JSON internal rather than asking a researcher to copy them.

## If an operation is unavailable

Distinguish a genuinely absent capability from missing scientific inputs,
permission denial, budget refusal, source conflict and unknown request outcome.
Only the first can justify a permitted, explicit local fallback. Read
[local fallback](references/local-fallback.md) for the narrow raw TIFF statistics
or axis-profile script and its provenance. It does not replace an available
provider, grant execution permission, recover an unknown request or bypass a
refusal. Do not install missing software or change model/MCP/security settings
as an implicit consequence of this skill.

[Schema-checked call shapes](examples.json) are synthetic examples, not a fixed
pipeline or an experimental calibration. Report deterministic software checks,
actual provider execution and genuine model/skill usage as separate evidence.
