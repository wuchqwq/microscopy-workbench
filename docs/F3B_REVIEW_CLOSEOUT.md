# F3b review closeout: finite direction admission and actual Linux simulation

2026-10-30. Owner-authorized correction and qualification of PR #42 at original
`05e7270aa895d00f558e98df3e501a562caed171`. The original F3b acceptance remains
historical; this document adds the independent correction evidence. Final PR
checks and merge status are reported on #42, not presumed by this document.

## Corrected scientific admission

The original machine-epsilon direction clustering treated the almost Friedel
pair `[0.4,0.2]`, `[-0.400001,-0.199999]` cycles/angstrom as two independent
directions. Their unoriented separation is only about 0.000171887 degrees.
An end-to-end analytic comparison with only a noisy single family on each side
could consequently report `compatible`.

The corrected policy is `finite_reciprocal_direction_support_v2`. It retains
all observations, uses the predeclared reciprocal acceptance radius to form
conservative angular guards and requires separation greater than both their
combined guard and a fixed one-degree floor. Near Friedel/conjugate/harmonic
jitter cannot by itself create another direction. Connected ambiguity groups
may conservatively undercount directions. Vectors whose guard includes DC are
unresolved. This is a deterministic admission rule, not measured uncertainty,
statistical confidence or a change to the reflection matching tolerance.

The reviewed negative now reports one unresolved direction family and
`insufficient_evidence`; the genuine multiple-direction positive remains
`compatible`. The complete RED/GREEN numeric report is
[direction-review.json](validation/f3b/direction-review.json). Numerical rank
is retained as a diagnostic, not a substitute for finite directional support.

The candidate-law method version remains `f3b_cubic_sigma3_v1`; every new
numerical report records its separate new direction-policy version. Existing
committed comparison reports and original-request responses remain historical,
including their earlier admission semantics. They are not recomputed or silently
reinterpreted. Create an explicit new comparison/revision to use the new policy.

## Actually executed qualification

The isolated [successful review run](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41069482266)
ran actual compiled MCP with the pinned diffsims 0.7.0 on Ubuntu before and after
the correction, and published the qualified code as `b87218fe0716f0c1f7d98db8d1b6f8f26b020b19`.
It did not move main or merge a PR. This closeout removes its temporary assembly
script and write-enabled workflow; only the permanent read-only simulation
workflow remains in the candidate. The final #42 head must pass its own CI.

Executed checks in the independent review environment:

| Check | Scope/result |
| --- | --- |
| Finite-direction and existing twin Python suites | 35 PASS: 15 new direction/JSON regressions, 13 original geometry cases, 7 image-provider source cases |
| TypeScript typecheck/build | PASS |
| Portable Node suite | 319 PASS, 5 explicit skips, 0 FAIL in the retained qualifying run |
| Actual pre-fix and corrected diffsims/MCP workflows | Both PASS; real parent/twin simulations, calibrated observations, wrong-line revision, request conflict, numerical paging and new-client recovery |
| Original pre-fix comparison recovery after correction | Two committed comparisons recovered unchanged; all 380 captured workspace/export/source file hashes unchanged |
| Existing standalone scientific smoke | PASS: real TIFF/calibration/FFT/measurement/export/direct-DFT/recovery |

Each actual simulation smoke constructs a NEW public synthetic workspace. This
is not a repeated unknown side effect on user data. Within each workflow there
are exactly two forward FFTs and two simulations; comparison/revision/recovery
add neither. Before/after runtimes use different warm/cold caches and are not a
performance-improvement claim.

The permanent `.github/workflows/f3b-simulation.yml` runs actual optional
ASE/diffsims and compiled MCP, beyond the original lightweight geometry job.
It retains its exact tested public source, resolved environment and synthetic
artifacts for 14 days. The original-code [Linux qualification](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41065577268)
also passed. Pure documentation edits do not request this optional workflow.

## Retained failed attempts

- [Review attempt 1](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41067363334): original Linux MCP passed; the recovery harness mistakenly visited exported object snapshots as live provider objects. The harness now selects committed `objects/` records and the actual provider result envelope.
- [Review attempt 2](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41068243158): a new NumPy boolean in directional diagnostics was not JSON serializable. The correction explicitly converts it to a Python boolean, and a strict JSON positive/negative regression was added. This failure was not hidden by a permissive serializer.
- [Review attempt 3](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41068967603): all numerical, original-recovery, Node, actual MCP and standalone science checks passed; publishing the isolated commit failed because the Git HTTPS credential header used the wrong transport form. Standard token authentication was corrected in the temporary runner only.
- Attempt 4 reran qualification and published successfully; no scientific tolerance or expected truth was relaxed between attempts.

The temporary workflow had tightly scoped review-branch writes and is removed
before landing. Permanent CI has read-only repository permissions. The Chinese
README now matches the English F3b capability status.

## Remaining scope

Real experimental accuracy, GUI gestures, fresh ordinary-model use of combined
Skills and feature-specific interruption injection remain unqualified as in
Issue #40. F3b still supports only the explicitly admitted ideal conventional
single-species FCC4/diamond8 candidate model and does not establish unique 3D
twinning or atomic coherence. The next development is a small F4-full
cross-method decision loop, not another scattering engine or model training.
