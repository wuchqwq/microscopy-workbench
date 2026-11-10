---
name: crystallography-compare
description: Test explicit crystallographic candidates against microscopy reflection geometry, or explore a clearly model-conditioned scale without circular validation. Use for CIF/XYZ, indexed-reflection or zone-axis questions; image appearance alone does not require phase identification.
---

# Compare the question's crystallographic hypotheses

Start with the researcher's question and selected evidence, not a fixed GUI or
input-to-phase pipeline. Say what the present geometry can test, which premises
are supplied or missing, and why that is the smallest useful check. A few
candidate explanations may remain in discussion before simulations exist.
For image-only exploration or a scale/ROI correction, use
[microscopy-observe-revise](../microscopy-observe-revise/SKILL.md); do not turn an
unknown image into diffraction, HRTEM or STEM by appearance.

Inspect the actual tool catalog and selected provider scope. Reuse an existing
saved structure, orientation, reflection table and current image measurements.
Keep IDs/tool JSON internal. A workbench is an optional way to select points or
review results, not a prerequisite for analysis in Codex.

## Choose the scale question before computing

- **Independent-scale test:** the image scale has a sourced basis independent
  of the candidates. Keep it fixed; compare residuals, unmatched reflections,
  conflicts and competing candidates. Geometry compatibility is not phase proof.
- **Model-conditioned exploration:** the scale is unknown, and the question is
  “what dk, or convergence angle, would follow *if* these structure/indexing
  assumptions were true?” Read [conditional calibration](references/conditional-calibration.md).
  This may yield a conditional estimate, never an independently verified scale.
  Do not fit scale to a candidate and use the same agreement to confirm it.
- **Insufficient inputs:** unknown scale still permits pixel geometry and
  candidate discussion. Missing cell, projection, trustworthy points or domain
  leaves the corresponding physical check unperformed. Preserve “cannot
  distinguish” rather than inventing a default scale, voltage or orientation.

## Use the supplied model and the existing provider

Read explicit CIF/XYZ with `structure_open`. Preserve the snapshot and actual
cell/PBC/site fractions; cell-free XYZ may be viewed but is not periodic
reciprocal geometry. New qualified simulation requires the current supported
snapshot and full ordered occupancy. Apply the relevant
[provider qualification limits](../microscopy-automation/references/automation-scope.md),
not a substitute cell or simulator after a refusal.

Create `structure_orient` from actual three-index [uvw] in that cell, then reuse
its orientation ID for `structure_view` and `structure_simulate`. A **110° scan
rotation is an angle, not the [110] zone axis**. Camera dragging is not a model
rotation; do not guess Euler angles or nonorthogonal Cartesian directions.
Use `structure_measure` for specified atomic/cell metrics. Simulation needs
explicit voltage, reciprocal cutoff, excitation bound and approximation.
Diffsims is kinematic diffraction, not multislice, defect/interface contrast,
experimental counts or a material classifier.

Use un-rasterized reciprocal coordinates/HKL for numeric checks. HRTEM or
ptychography FFT intensity has no general SAED intensity interpretation; PNG
similarity does not identify a phase. Retain the cycles/length versus 2π angular
convention, axis parity, centre and source coordinate frame.

`structure_compare` and, when advertised, `structure_compare_batch` check
committed image measurements against explicit saved simulations. For the
independent-scale route keep scale 1 and translation [0,0], with only an explicit
trial in-plane rotation and declared parity/basis. Do not use a low-level
comparison scale field as a calibration fitting tool. For confirmed
correspondences, `structure_register` estimates only its permitted proper
rotation: independent scale fixed, zero translation, parity fixed. Never claim
`user_confirmed` merely to satisfy a tool gate; demo input uses
`synthetic_fixture`. Agent-selected HKLs/roll/fit points remain search evidence.

Return a compact comparison: candidate and reason; actual input/ROI and scale
basis; executed checks and residuals; unmatched/conflicting evidence; shared
assumptions; and compatible, insufficient or indistinguishable conclusions.
Multiple compatible candidates stay multiple. A missing predicted spot is not a
universal exclusion without a qualified visibility model. Matching tolerances
are deterministic criteria, not probabilities or uncertainty bars.

## Accept corrections without replacing history

After scale/centre/point changes, use sourced `image_remeasure` on valid saved
anchors, then create new registration/comparison evidence. Keep unchanged FFT
bytes, structure and orientation when still applicable; do not rerun FFT just
because units changed. A new source/frame/ROI or changed FFT producer invalidates
old anchors rather than stretching them. Keep old comparisons historical and
link revisions; changed source needs an explicit basis.

Save each request ID before a write; after timeout/cancel, query
`structure_result` in that exact provider/workspace. An unknown outcome is not
permission to resubmit under another ID or replace the route. If AnalysisContext
is selected, read `analysis_read`, persist provider results first, then advance
references with `analysis_update` against the previously read revision. A CAS
conflict leaves a historical proposal; do not force the old result with a new
revision or undo another provider's result.

Read only when relevant:

- [Conditional dk/alpha and a bounded local calculation](references/conditional-calibration.md)
- [Adjacent regions and explicit general candidates](references/general-evidence.md)
- [Projected Sigma3/twin-specific qualification](references/twin-evidence.md)
- [Schema-checked tool call shapes](examples.json), not a required sequence

A researcher statement that twinning is present can be retained as that scoped
statement with `image_context`; it does not confirm a twin law or HKL. A local
script or fixed tool continuation is not AI discovery. Respect actual connection
permissions and prior refusals; missing capability, unsupported science, and an
execution denial are different states, not interchangeable fallback triggers.
