# Frozen R3 baseline before TypeScript migration

Owner-authorized closeout, 2026-10-30. This is a **research/MVP compatibility baseline**, not a public release or real-specimen scientific qualification.

## Pinned identity

- Frozen reference branch: `baseline/r3-pre-ts-20261030`.
- Exact functional baseline / main merge: **`3790b3d57e427010f0a5cbfce8a31143a7883eef`**.
- Functional tree: **`cc65fe4b504466804ddf3bf31690d76251864fe2`**.
- R3 originally reviewed head: `1e6968656fce4abe37fb7c229edb30338d164398`.
- PR #13 merged into the R3 branch: `6240d19006cfc915674dc08763992d04821b98ce`.
- PR #14 merged into the R3 branch: `2b936a503d43ef8b37071920d62aa050d4144fec`.
- PR #12 then merged into main: `3790b3d57e427010f0a5cbfce8a31143a7883eef`.

The CI-tested PR merge commit `4183329f438714674a11585f34b44be8ad679e47`, the combined source head `2b936a5`, and the final main merge `3790b3d` have the **same Git tree** listed above. This documentation-only commit follows the functional baseline; it does not alter tested runtime code.

Do not move or develop on the baseline branch. Use the full commit SHA for comparisons. The branch is a named checkpoint by project convention; this action did **not** configure repository branch protection, create a release, or archive the repository. Main remains open for reviewed incremental engineering work.

## Review and fresh integration evidence

All three PRs were merged using merge commits. Their actual patches, dependencies, recorded acceptance and final source heads were checked before integration. No new blocking defect was found within that review scope.

Fresh combined GitHub Actions run: https://github.com/wuchqwq/microscopy-workbench/actions/runs/40931976256

- `node-smoke`: PASS; actual job log reports **282 PASS, 0 FAIL, 5 existing opt-in SKIP** (287 tests).
- `dm4-reader`: PASS; DM4/DM3/complex reader tests, peak/automation/sequence/joint Python tests and the actual DM4/plane/complex MCP smokes.
- `spatial-evidence`: PASS; float32, atlas, local-signature and feature-field Python checks, plus the separately enabled real Panel/MCP/Python measurement-binding regression.
- The binding test's skip in the general Node suite was not counted as a pass; it was separately executed in `spatial-evidence`.

This closeout read the remote source, diffs, checks and logs and ran the existing combined CI through the PR update. It did not independently re-run the owner's Windows browser or fresh-model sessions. Those are the earlier bounded evidence in [R3 acceptance](R3_ACCEPTANCE.md), not new closeout tests.

## What is frozen

Existing file admission, source/dtype/calibration handling, individual image/structure tools, R1 automation, R2 sequence correspondence, R3 sparse feature records, editable Panel and Figure outputs, journals, AnalysisContext and MCP/Skills packaging are the behavioral reference.

PR #13 preserves an available saved view when an R2-based comparison lacks a reference overview; the original not-comparable evidence is retained. It also rejects a new measurement revision **before** publishing an object when the existing validation depth would be exceeded.

PR #14 defers unused SciPy imports. It does not replace numerical methods, weaken validation or introduce another worker/storage system.

## Known limitations retained, not silently fixed

- R3 is bounded sparse ROI evidence, not dense material segmentation, global indexing, automatic twin/dislocation identification, GPA, or a ptychography reconstruction engine.
- R2 correspondence remains real spatial frames with sourced identity/integer translations or bounded estimation. Complex reconstruction admission and physical sequence meaning remain explicit.
- Measurement chains retain the existing depth limit: the regression admits 15 successive revisions after the initial measurement and rejects the next one. Historical over-limit objects created before the repair are not retroactively rewritten.
- Windows display/revision latency improved in the reported #14 samples, but remains a usability limitation. Historical timing observations are not a controlled platform speed guarantee.
- The existing sparse map/labels may be visually crowded. No GUI redesign is required before language migration.
- Native-plugin-discovery complete R3 model flow, real-specimen accuracy, Mac/device/GMS qualification remain NOT_TESTED. Earlier explicit MCP + packaged Skill tests do not upgrade those scopes.
- Parent Issue #8 and Dataset Navigator #7 remain open. Their new-feature work is paused during the migration; R3 freeze is not completion of every research goal.

## TypeScript phase: compatibility before redesign

Migrate Node/MCP/automation/Panel and browser business code incrementally to strict TypeScript, keeping the Python scientific kernel. The final goal is real checked production code, not only renamed files, unused interfaces or permanent `checkJs` scaffolding. Small compatibility entry shims are allowed.

Preserve tool names/JSON schemas/error semantics, scientific namespaces and immutable bytes, request IDs, source/calibration/measurement bindings, old workspace recovery, Figure recipes, startup configuration and relocatable plugin assets. Type erasure is not runtime input validation; retain scientific/schema checks and parse external data before treating it as typed.

Build a small baseline-created public workspace and schema snapshot for old-JS -> compiled-TS read/recover/continue comparisons. Do not test destructive behavior on private workspaces. Existing historical bytes must remain unchanged; new runs may naturally have different generated IDs and timestamps.

First PR: short audit + pinned toolchain/build + a real migrated production slice and tests using the emitted JavaScript. Continue with core contracts/runtime, Node/plugin/Panel paths, browser logic and final cleanup in independently reviewable PRs. Keep schema/type definitions synchronized rather than creating competing contracts.

Explicitly test `import.meta.url`, Python worker locations, Panel subprocesses/static assets, package relocation, MCP/Skill discovery and compiled browser modules. Do not silently require a newer Node runtime or a development TS loader; respect the current documented runtime support unless the owner approves a change.

No new scientific algorithms, GUI framework replacement, model orchestration platform or major performance redesign is part of this migration. Keep CI bounded, preserve existing regressions and tolerances, and do not merge migration PRs without owner review.
