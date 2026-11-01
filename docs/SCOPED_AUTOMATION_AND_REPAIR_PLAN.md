# Bounded automation and scientific repair handoff

This increment is based on unmerged PR #57 @ `4141225653b41b134a76c5b2119888c01c481f54`,
Git tree `d53fa691181d6d2ae348dffe10f3c76b148e17f0`. It does not merge #54/#57,
move main/baseline, or certify real materials. PR #54's human-edit protection
remains an independent integration dependency for the broader product workflow.

## Decision: narrow autonomous interpretation, keep useful automation

Retain both GUI-first and Agent-first entry, optional on-demand Agent activation,
saved immutable scientific evidence and human intervention. The first complete
workflow is explicit ROI -> FFT/quality inspection -> projected measurements ->
finite sourced hypothesis comparison -> inspectable evidence and revision.
No mandatory full-image field or new Agent runtime is introduced.

The current goal is joint proposal, checking, comparison and revision of finite
scientific explanations of existing images. Agent-proposed candidates may use
observed image features, measurements and supplied material context; the user
does not have to enumerate every candidate. Complete simulations are not a
prerequisite for discussion. Formal numerical comparisons retain their existing
input requirements, and unexecuted checks remain explicitly unexecuted.

Record observations/sources, candidate rationale, executed checks and the
compatible/conflicting/insufficient/indistinguishable parts separately, using
existing notes and evidence references. Do not report uncalibrated probabilities.
No automatic choice of next tilt, imaging condition, experimental sequence or
information-value score is in scope. Current-image ambiguity may remain unresolved;
do not introduce a candidate database or general decision framework to remove it.

Full-field discovery, generic defect/twin identification, material-strain
validation and autonomous cross-method scheduling are not default deliverables.
GPA and other advanced tools remain explicit diagnostics within their assumptions.
This is orchestration guidance in the Skills, **not** a new technical access
control layer. Existing tool schemas/default arguments are unchanged so old
requests do not silently change meaning. Physical ambiguity is not resolved by
changing a status label, adding a provenance link, or using another model.

## Implemented here: GPA evidence survives the shared Panel

The #57 provider stores `evidence_assessment`, `material_strain_verified` and
`interpretation_status`, but the Panel whitelist previously discarded them.
This increment forwards bounded finite JSON exactly for direct `gpa` and
`gpa_view` objects and renders numerical, physical and bandwidth interpretation
separately in the shared research sidebar. The same object reaches
`image_panel_current`; no extra scientific state store or calculation is made.

- Historical absent assessment remains absent; the view says it was not recorded.
- Unknown semantic versions or contradictory validation flags are shown as
  unrecognized, not silently promoted to validated material strain.
- Oversized/malformed assessments are explicitly unavailable, not truncated or
  labeled legacy. Users/Agents can inspect the exact saved object with image_info.
- Navigation to another object clears the card. Text is rendered as text, not HTML.
- Known-v1 rendered fields receive shape checks, not scientific recalculation.
  Malformed ancillary flags are explicit rather than silently dropped; bounded
  diagnostic values remain inspectable. Unchanged refresh preserves open details.
- This only projects the current direct GPA/view. It does not invent assessment
  inheritance for arbitrary image wrappers or validate a material model itself.

The new module is a presentation adapter, not a new scientific evidence protocol.
The original masks, arrays, algorithms, tolerances and old objects stay unchanged.

## Not fixed: priority algorithm work

### P1 — preserve or reject occupancy before losing the physical model

Reproduce #53's per-site extXYZ occupancy case through original input ->
structure_open -> saved reload -> orientation/simulation -> twin admission.
Do not rely solely on original file SHA or `atoms.info` when per-site arrays
carry occupancy. Select a canonical, versioned representation that can round-trip
all supported values, or explicitly reject unsupported representations **before**
a full-occupancy certificate/simulation is created. Do not silently coerce to one.

Required controls: explicit full occupancy (positive), partial occupancy,
conflicting site/info metadata, unsupported mixed/disordered sites and unknown
occupancy. Verify representative reflection differences by an independent simple
structure-factor calculation, not by the same conversion function. Exercise actual
ASE/diffsims on the repair branch. Old objects remain historical; corrected new
analyses need explicit IDs/versioning, not edited old manifests.

### P1 — source support/dependence before topology redundancy claims

Reproduce repeated/nudged overlapping bands from one FFT being counted as an
independent third reflection. Record actual original FFT/source and Fourier support
alongside relevant calibration/reference/fit dependencies. Decide which mathematical
consistency checks the additional band supports; do not equate a new object ID or
a changed vector centre with an independent observation.

Do not replace the defect with an arbitrary centre-distance threshold or blanket
claim that every overlap is identical information. Include exact duplicates,
conjugates/harmonics, strongly overlapping counterexamples, a genuinely separated
additional reflection, and unavailable dependency data. Old result recovery must
retain its original version. New independence/validation states need explicit
versioning and must be consumed by downstream topology/method decisions.

### P2 — flat-spectrum roundoff must not become a lattice feature

Reproduce the shifted single-impulse example across positions, scale and dtype.
Use an explicit numerical-error/prominence contract rather than a threshold chosen
just to reject this one sample. Preserve a weak but actual spectral peak positive
control and track the difference between noise, numerical flatness and unresolved
real peaks. Test both peak output and the downstream two-direction feature gate;
version saved computations whose re-derivation depends on the detector behavior.

## Later, one restricted task's validation rather than a universal engine

After these defects are repaired, select one specified image modality and task
(for example two-ROI projected period/direction comparison with sourced scale).
Build positive, negative and should-abstain controls, with source/fit dependencies
and an honest uncertainty budget. General HRTEM visibility, correlated model
error, automatic material-strain validation and a universal observation DAG are
separate research/design tasks, not hidden requirements of this small fix.

Do not request human acceptance before development-side integration works.
Local continuation should independently inspect this patch, run locked-dependency
CI and relevant science checks, then submit scoped PRs. No automatic merge/tag.
