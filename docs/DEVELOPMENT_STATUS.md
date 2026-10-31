# Mainline consolidation and next scientific stage

Updated 2026-10-31. This document is the current implementation index; individual
acceptance ledgers remain historical records of the exact versions they tested.
Mainline admission is not a new real-specimen, GUI, model or instrument qualification.

## General crystallographic evidence review increment

An independent branch from main `9fbc769` adds
[`structure_general_compare`](GENERAL_CRYSTALLOGRAPHIC_EVIDENCE.md): two adjacent
saved ROI observations, explicit possibly different structures/orientations,
unchanged ASE/diffsims and reflection comparison, with separate model
qualifications and conditional evidence. It does not inherit unmerged
#44/#45/#46, alter F3b Sigma3 semantics, identify phases or name generic relations
twins. [Executed acceptance](GENERAL_CRYSTALLOGRAPHIC_ACCEPTANCE.md) distinguishes
analytic checks, actual simulations/MCP, preserved history and NOT_TESTED scopes.

## Reviewed implementation ancestry

| Scope | Source PR | Exact reviewed source commit |
| --- | --- | --- |
| F1a bounded multiscale fields/domains | #28 | `44495088968132b7286856097027f2233f73976c` |
| F4-lite incremental active analysis | #31 | `66139080de49e79158da242f51537dcd87258916` |
| Main/README/documentation CI integration | #32 | `f1ffbe82523e9d890974ce6e2354a7b4eb1f7136` |
| F4 adjacency/evidence/integrity closeout | #35 | `3678c54a0b8c57ec027fcfd03fd856489d26184c` |
| F2a classical GPA | #36 | `fc3a207fceeeab9f0285ab02596859d90b84d80c` |
| Independent F4/GPA integration | #37 | `ea09c091af503b342bba86cb86a427da9c0efed5` |
| F3a projected topology, v2 group correction | #38 | `8a3a05321afceed25a076c12edfa2edb7a4dac70` |

The final F3a branch contains the reviewed integrated histories, including #36
through #37. Consolidation retains those commit identities rather than replaying
GPA twice, squashing away ancestry, or separately landing an older conflicting
F1a tree. The previous main is `562416cb56fb76034ebc219101ea86845ed5cea4`.
Original source branches and the R3 frozen baseline are retained.

The closeout changes synchronize the two README languages, expose optional GPA
installation and current method links, and preserve explicit outstanding scopes.
Scientific kernels, thresholds, historical arrays, journals and acceptance ledgers
are not rewritten for this landing. The landing PR must run the complete existing
CI on its own candidate and be merged with its checked head SHA.

## Scientific capability and limits

F1a/F4-lite provide bounded local structure evidence and incremental follow-up;
F2a provides conditional single-domain phase/displacement/finite-tensor fields;
F3a provides conditional projected winding/closure evidence from saved bands.
These modules are composable, not a mandatory analysis pipeline.

F3a v2 groups circuits by strict geometric nesting before checking phase validity.
Several groups have separate fits and no shared top-level Burgers vector. Geometric
groups are not identified defect cores. Historical v1 objects retain their original
reports, including the known mixed-loop limitation; use an explicit new request
and previous-result link to make a v2 revision.

Use [F4 closeout](F4_LITE_CLOSEOUT_ACCEPTANCE.md),
[F2a acceptance](F2A_ACCEPTANCE.md), [F4/GPA integration](F4_F2A_INTEGRATION.md)
and [F3a acceptance](F3A_ACCEPTANCE.md) for numerical and protocol evidence.
Green CI means the declared automated checks passed; it is not experimental
accuracy, independent physical confirmation or a claim of universal speedup.

## Deferred qualification, not hidden completion

- Actual Panel mouse/keyboard gestures, saved peak movement and refresh remain
  NOT_TESTED where recorded. A human-led prepare/resume session can qualify them;
  scripted MCP revision and returned PNGs are different scopes. Preserve the
  prior browser safety stop; do not bypass it.
- Fresh-model comprehension of combined GPA/topology Skills, native plugin
  auto-discovery, real specimens and the unqualified platform/instrument scopes
  retain their recorded NOT_TESTED states.
- Feature-specific cancellation/lost-response/interrupted-worker injection remains
  separate from successful original-request and new-client recovery.

These are follow-up qualification tasks, not prerequisites for F3b algorithm
work. No release tag or broader validation claim follows from merging the stack.

## F3b first increment (review branch, Issue #41)

The new `feature/f3b-twin-interface` branch starts at consolidated main
`f0acf9e`, with no old-stack merges. It adds source-bound Sigma3 {111}
candidate orientations and projected reflection/interface comparisons for
ideal conventional monospecies FCC4/diamond8 references. It reuses actual
saved diffsims simulations and current F1/F4 observations, with an untwinned
control and no independent target-domain refit. Full unmatched evidence has
a bounded read-only MCP endpoint. See [method and API](PROJECTED_TWIN_EVIDENCE.md)
and [qualification scope](F3B_ACCEPTANCE.md). This is conditional evidence,
not automatic twin identification; GUI gestures remain a separate deferred task.

The original admission guidance for this increment remains:

Start a new branch from the consolidated main, not from an old stacked feature
branch. Read AGENTS.md and roadmap #16. Reuse saved domain/FFT observations and
existing crystallographic tools to test explicitly sourced candidate twin
operations and projected interface relations. Separate compatibility,
incompatibility and insufficient evidence; do not upgrade a 2D angle or mirrored
appearance into a unique 3D twin identification.

Choose a small supported crystallographic scope and independent positive,
ordinary-nontwin and projection-ambiguous controls. Keep source/calibration
identity, reproducible revisions, export/recovery and old-object compatibility.
The developer chooses the algorithm and PR split. Do not expand this increment
into automatic phase identification, all twin systems, F4-full, model training
or a new framework. New feature PRs remain subject to review and separate merge
authorization.
