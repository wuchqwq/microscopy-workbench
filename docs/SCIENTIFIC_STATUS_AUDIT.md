# Scientific state and downstream consumer audit

2026-11-02. Source SHA `7f0e523ba287de11c0913abd68f553655f008182`, tree
`ade267286535291a42f0992fe34d8726318cfdb9`; production matches #63
`3d59c2b5cc4d90e9cbbb7d5475d5b0b42617880a`. Actual main remains
`b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`. All #54/#57–#65 are open and
unmerged; their actual HEAD/base records are in the [baseline](scientific_status_evidence/pr-baseline.json).
No shared worktree, GUI, launcher, historical object or stable baseline was modified.

## What the existing states mean

| Producer | Actual judgment | Downstream use and risk |
|---|---|---|
| FFT / peak detector v3 | Completed transform; global amplitude variation under an uncertified roundoff proxy; selected local maxima and optional interpolation | Peak measurements, atlas and feature construction. No per-peak statistical significance, localization interval or physical-reflection qualification. |
| Ordinary measurements | Coordinate/DC geometry, signed calibration where supplied; uncertainty often unknown | Candidate geometry and UI. Pixel measurement remains meaningful when physical scale is absent. |
| ROI signature comparison | Finite stated angles/tolerance and source/geometry admission | Domain graph and explicit crystal comparisons. Incompatible is scoped to this check; historical v1 also used it for missing scale and must retain that historical meaning. |
| Feature field | `valid` means admitted saved numerical descriptors, two non-collinear families, finite periods, no selected quality limitations | Domain candidate membership, active `_usable`, `new_valid_windows` and crystal `evidence_quality_ready`. None of these proves noise reliability or material structure. Single-direction insufficiency does not invalidate its ordinary period measurement. |
| Domain map | Connectivity of compatible numerical signatures under chosen graph/angle rules | Candidate domains/boundary support, optional exploration. Window width/stride is not boundary localization precision or a phase map. |
| GPA | Conditional displacement/strain calculation plus an existing separate evidence assessment | Tensor validity and topology inputs. Material strain remains insufficient/unknown; legacy absence is preserved. |
| Topology | Loop admissibility, wrapped phase closure, projected consistency, actual direct/conjugate Fourier-support dependency | Conditional projected defect evidence. More directions and even disjoint bands are not independent experiments or a 3D Burgers vector. |
| Crystal candidates | Supplied finite models, fixed registration/geometry, unmatched reflections and stated tolerance | Conditional compatibility/conflict; not unique phase, statistical detection or independent holdout validation. |
| Discovery / annotations | Explicit or heuristic ROI observations, hypothesized labels and caller-controlled text/status | A concrete attribution error exists: explicit `entry=manual` is automatically called a researcher statement, although an Agent can submit the same formal tool. |

Detailed source locations, producer predicates, consumers and version boundaries:
[Python science map](scientific_status_evidence/science-map.md) and
[MCP / Panel / crystal / Skills map](scientific_status_evidence/consumer-map.md).
These are static audits, not newly executed scientific acceptance tests.

## Findings separated by type

1. **Implementation / provenance error:** manual-entry API hard-codes researcher
   authorship. Preserve an original Agent-submitted counterexample, then use a
   versioned optional caller-reported selection origin. Old candidate hash and
   reconstruction must remain v1; an input-mode flag is not authenticated identity.
2. **Measurement uncertainty:** noise significance, localization uncertainty and
   separability are largely unassessed. The reproducible #65 noisy `valid`
   counterexamples disprove physical certification by this status; they do not
   by themselves violate the documented numerical descriptor contract.
3. **Method limitations:** single-domain GPA, finite FFT support, dependency of
   reused Fourier evidence and limited projection comparisons need explicit
   scope. Optional field/active methods remain available, without becoming the
   default path or providing calibrated information gain.
4. **Non-identifiability:** finite image geometry cannot uniquely determine a
   phase, scanner versus material distortion, twin or 3D defect. A consistent
   but physically wrong user scale is not generally detectable from one image.

The compact MCP and Panel allowlists currently omit any new common assessment
unless explicitly extended. This is a propagation design requirement, not proof
that an unimplemented field was already corrupted. The existing GPA exact bounded
projection supplies a compatible pattern. Domain UI wording should say image
frequency candidates / numerical descriptors instead of suggesting reliable
reflections merely from `valid`.

## Bounded implementation and independent integration

Adopt the [three-layer v1 contract](SCIENTIFIC_RESULT_CONTRACT.md) as additive
metadata on new results, with no change to existing scientific thresholds or
states. Share one contract and bounded presentation adapter across consumers;
show missing historical assessments as not recorded. Use existing hypotheses,
notes and immutable references for Agent choices, not a new candidate store.

#54 has been read as a separate diff, not silently assumed present. Its
interaction gate protects committed/draft/revision state, not scientific truth.
The [integration plan](scientific_status_evidence/dual-entry-plan.md) identifies
six protection cases and existing tests. Earlier #54 human-first/AI-first runs
used different workspaces; this round must exercise both in one isolated science
workspace. The existing real-Agent launcher supplies useful isolation/journal
infrastructure but hard-codes an analysis chain, so it cannot itself establish
this round's autonomous choice capability.

This audit/contract commit performs no production modification. Runtime checks,
blind actual-model MCP trials and browser gestures remain **NOT_TESTED here**
and will be delivered separately with their actual scope. Broad runtime/schema
replacement or Route B statistical detection is outside the accepted change.
