# Route A: additive scientific-result semantics v1

Status: implementation contract, frozen before production edits. Decision: candidate
measurement and assisted interpretation. This is not a statistical detector or
physical certification layer. The owning numerical algorithms, thresholds and
legacy statuses remain unchanged.

## Three layers, one common field

New supported scientific objects carry optional `result_semantics` in their
immutable manifest and original response. It uses `version:1`, scope
`candidate_measurement_and_assisted_interpretation`, and three named sections:

- `numerical`: `execution:"completed"`, the actual computation scope, and scoped
  `checks`. Completion is separate from each check; a calculated insufficient
  result remains a completed calculation.
- `measurement_reliability`: scoped `assessments` of noise significance,
  localization uncertainty, separability/resolution, parameter sensitivity and
  any actually recorded method-specific qualification. There is no aggregate
  reliable/unreliable score or inferred SNR.
- `interpretation`: the conditional inference scope, scoped `assessments` and
  references to existing candidate/comparison/annotation records. It never
  automatically certifies a material, twin, strain or three-dimensional defect.

Every check/assessment has a stable `aspect`, explicit `scope`, `status`,
`basis`, and bounded `source_fields` identifying the owning saved evidence.
The shared status vocabulary is:

| status | Meaning |
|---|---|
| `satisfied` | An actually executed check meets its stated criterion, only within its scope. |
| `issues_detected` | An executed check identifies a problem within that scope. |
| `not_assessed` | This qualification was not performed; not a failure or a zero uncertainty. |
| `insufficient_evidence` | The information needed for this particular judgment is missing or does not suffice. |

No conversion of old enum strings is valid without their module-specific scope.
For example: feature `valid` means admitted saved geometrical descriptors;
noise significance stays not_assessed. One correctly measured direction can
coexist with insufficient_evidence for a two-direction signature. A finite
comparison's incompatible means conflict under its stated candidates, angles,
units and tolerance, not impossibility of a material explanation. Missing
physical calibration limits physical units; it does not invalidate pixel geometry.

`source_fields` point into the same original manifest; `object_id` and request
identity remain the envelope's authority. Dependent numerical objects already
carry their immutable source/calibration/measurement references. Do not create
another provenance database or copy recursive scientific objects into this field.
For aggregate rows the field explicitly scopes checks to the stored rows and
preserves those rows' individual statuses; no all-valid implication follows.

## Producer and consumer boundary

Use one small Python semantics helper with explicit kind adapters. Add it at the
existing image and structure publication boundaries after their own calculation,
without rerunning FFT/fits or touching input arrays. Record helper source hash in
software provenance. Only recognized scientific kinds receive v1; unrelated data
import/display records need no fictitious scientific evaluation. Derived display
views must refer to the original assessment or explicitly state their display
scope; copying a parent assessment must not imply fresh validation.

Numerical criteria map only to checks the owning code actually made (e.g. the
saved detector's overall contrast policy, a conditional geometry check or a GPA
validity diagnostic). A generic completed operation is not proof of all numeric
invariants. Existing GPA transfer and topology Fourier-support diagnostics can
be referenced with their actual scope; neither establishes material validity or
independent experiments.

Full MCP responses preserve the saved field verbatim. Add it to existing
allowlisted compact/Panel projections using one bounded exact copier. It must
not truncate an assessment into an apparently complete one. Unrecognized
versions or malformed/oversized fields show `unavailable`; absent fields show
`not_recorded`. These are delivery states, not scientific judgments. Existing
full `image_info`/`structure_info` and original request recovery remain available.
The GUI should label old row `valid` as numerical/descriptor admission, retaining
its raw value and limitations, and show the three layers for new saved results.
No consumer may translate `satisfied` in one scope into another scope's success.

## Authorship and autonomous choices

Use existing saved annotations/notes and evidence references for a short record:
choice → reason → observations/IDs → actual actions/request IDs → result → unknowns.
State whether an observation/ROI/peak was researcher-selected or Agent-proposed.
An Agent may state a preference as a working hypothesis without waiting for
approval at every step. A proposed method is not an executed check.

Use `hypothesized` for Agent candidate annotations; labels/notes must identify
Agent authorship. Preserve human marks and their reasons; after an edit reread
the current saved state and measurements. The existing twinning-specific
`research_observation.authority` is not a generic Agent-note channel. Its current
caller-reported authority is not authentication or scientific proof. This scope
does not add a candidate database, scheduler, probability or experiment planner.

## Historical compatibility and recovery

Never backfill old manifests, request responses, payloads, hashes or meanings.
Full reads/replays of historical requests must remain byte/JSON-equivalent;
new fields only appear on new writes. Existing v1/v2/v3 algorithm versions keep
their validation rules. The object schema stays version1 with optional added
metadata; `result_semantics.version` versions this contract independently.

A legacy object's missing field cannot be interpreted as passed or failed. A
new explicit calculation/revision may record v1, retaining its parent/reference
and original request. It must not silently rerun an unknown operation. Display
projections never write a migration. Old/new read/recovery and scientific payload
hashes are separately tested using a frozen pre-change producer.

## Integration and acceptance

Start at actual #64 `7f0e523ba287de11c0913abd68f553655f008182` (production #63
`3d59c2b5cc4d90e9cbbb7d5475d5b0b42617880a`). The reviewed #65 fixtures can be
reused as independent public data without merging its entire branch. Main is
`b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`; #54 is a separate, unmerged branch.
#54 integration happens only in another isolated worktree after reviewing its
diff and interaction guards. Do not assume its protection exists here.

Test legacy/new scientific records, full/compact/evidence/Panel bounded delivery,
single-direction and noise/close/mixed candidates, unknown qualification and
physical ambiguity. Run locked Node/Python checks and formal MCP save/recovery.
Use fresh model sessions that receive actual images/observations/Skills and
bounded tasks, not hidden truth or grading rules. Record real calls and responses,
including optional choices, stops and failures. Distinguish model reasoning,
MCP transport, HTTP integration and actual browser gestures. No user participation
is required; programmatically simulated human edits must be labelled as such.

Known wrong calibration means a source/domain/revision conflict we can detect.
An internally consistent but physically incorrect supplied scale is not generally
identifiable from one image. This remains an assumption, not a promise of detection.

## Architecture stop

If this requires replacing journals, broad schema/runtime rewriting or changing
scientific admission, stop that change and report alternatives. The preferred
bounded path is additive saved semantics plus existing notes and protection.
A future stronger reliability service would require a new model/qualification
study and versioned consumer contract; Route B and new scientific thresholds
are outside this implementation.
