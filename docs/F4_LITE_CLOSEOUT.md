# F4-lite closeout: integration checkpoint and handoff

This is an integration/review checkpoint, **not a completed scientific closeout**.
It combines PR #31 at `66139080de49e79158da242f51537dcd87258916` with main at
`562416cb56fb76034ebc219101ea86845ed5cea4` on a separate branch. PR #28, PR #31,
main and the frozen R3 baseline are not rewritten or merged by this work.

## Completed here

- Preserve main's exact English and Chinese README blobs, including language
  navigation. Their shipped-main status remains distinct from the open F1a/F4
  implementation; see [F4 tools](ACTIVE_ANALYSIS.md) and [acceptance](F4_LITE_ACCEPTANCE.md).
- Reconcile PR #30's lightweight documentation checks with all F1a/F4 jobs.
  In particular, the new `active-analysis` job has the same change gate as the
  other scientific jobs. Existing commands, matrices and timeouts are retained.
- Extract the classifier into `scripts/ci_scope.sh`. Compare a PR head with its
  merge base, so unrelated base-only commits do not trigger science CI.
  Manual/unknown events, unavailable refs, empty diffs and failed inspections
  still run full CI. Code-to-document renames cannot hide removed source paths.
- Add 15 dependency-free temporary-Git tests in `tests/ci_scope_test.py`.
  They passed locally on Linux, including bilingual READMEs, nested Markdown,
  source/fixture/Skill/AGENTS changes, mixed changes, renames/deletions, paths
  with spaces/newlines, manual runs, bad refs and an advancing base branch.
  Workflow YAML parsing and equality of all pre-existing job commands also passed.

This change does **not** alter scientific algorithms, MCP schemas, saved
workspaces, tolerances, model settings or the prior acceptance reports.
Full repository/science tests were not run locally: this environment could not
clone the repository. The published integration commit must receive its own CI;
PR #31's earlier green run is not substituted for that result. Actual Windows
model/browser checks remain separate from Linux/Windows CI.

## Source-level finding: irregular neighbor coverage

At the pinned PR #31 source, `tools/image_spatial_domains.py::_neighbors`
connects same-scale centers only when they are exactly horizontally or
vertically aligned. For two 32-pixel windows:

| Supports | Existing irregular-neighbor result |
| --- | --- |
| `[0,0,32,32]`, `[32,0,64,32]` | One aligned pair |
| `[0,0,32,32]`, `[32,8,64,40]` | No pair despite a positive shared edge |
| `[0,0,32,32]`, `[16,8,48,40]` | No pair despite overlapping supports |

This is a limitation of the declared cardinal-neighbor policy, not evidence
that every offset pair is a physical boundary or that it alone explains the
published shifted-strip miss. Keep positive support gaps, corner-only contact,
mixed/invalid measurements and different scales distinct when choosing a remedy.

**Compatibility constraint:** `validate_references()` reconstructs old maps via
`_domain_result()` and compares their saved metadata, CSV and support arrays.
Silently replacing the global neighbor rule can invalidate historical objects.
Use an explicit versioned/opt-in policy or another backward-compatible design,
and demonstrate old-map readback with unchanged arrays and hashes. The exact
implementation and graph construction are the developer's decision.

## Remaining work for Codex

Finish F4-lite only; do not start GPA, Encoder or new framework work.
Use this integration branch as the starting point, preserve the existing PR
stack and do not merge main without review.

1. Resolve the irregular-neighbor limitation with focused positive/negative
   examples and old-object compatibility. Do not tune to the published oracle.
2. Reduce repeated evidence delivery/validation on the actual Agent path.
   Keep full authoritative records available; concise views are not replacements
   for provenance, recovery or integrity checks. Measure response bytes,
   validation/total time and model usage separately on the same task.
3. Re-run a small real compiled workflow and fresh Agent continuation on the
   final candidate. Verify source/old FFT hashes, the exact new FFT count,
   original-request recovery, stop reasons and GUI review/revision in a trusted
   local session. Respect the prior URL-safety stop; unsupported interaction
   scopes remain NOT_TESTED rather than being bypassed.

No claim of universal sampling superiority is required to close this increment.
Retain known misses and do not expand this into an unlimited benchmark or
performance rewrite. Report remaining blockers separately from optional work.

## Reproduction of the new CI checks

```sh
bash -n scripts/ci_scope.sh
python3 -B tests/ci_scope_test.py
```

The `changes` job always runs these tests. Documentation-only PRs then run
`git diff --check`; source/configuration changes run the existing full suite.
If required checks are configured later, include the classification check so a
failed classifier cannot be treated as successful merely because dependents skip.
