# Expected-site observation validation — 2026-11-06

Baseline: `b5888c6b2cfcca2c14961ba0cf7863efa56072ad`, an unpublished S2 integration
candidate on canonical main `31f4f014`. This increment is isolated on local branch
`feat/stem-expected-site-loop-20261106`; no push/merge or HRTEM edit is included.

This is a small engineering/numerical-observation check, not physical STEM,
automatic column detection, calibrated significance or model/Agent qualification.
The numerical statistics/profile and S2 solvers/gates are unchanged.

## First failure retained

The initial seven-case Python run had six passes and one export error: the new
site report was saved and read correctly, but the existing export allowlist did
not include its JSON/text files. The allowlist was extended only for the existing
`discovery_review` kind. The original failure log remains in the local evidence
directory as `python-site-development.log`. No threshold or expected answer was
changed. The first build passed.

## Final results

Local runtime: Windows, Node `v24.16.0`, Python `3.13`, NumPy `2.2.6`, Pillow
`11.2.1`, tifffile `2026.3.3`. Existing TypeScript/Node type packages were copied
into the isolated checkout; no dependency installation or shared-runtime edit.

| Check | Result |
|---|---|
| `python -B -m unittest discover -s tests -p image_site_observation_test.py -v` | 7 PASS, no skip; final log `python-site-final.log` |
| `python -B -m unittest discover -s tests -p image_point_observation_test.py -v` | 11 PASS; original source/ROI/calibration, legacy, forged-value and reference contracts |
| `npm run build` | PASS; three TypeScript configurations and standalone assets; final `build-final.log` |
| `node --test dist/tests/discovery-contract.test.mjs dist/tests/point-observation-contract.test.mjs` | 6 PASS, no skip; actual schema and forwarding including unsupported declarations |
| `python -B -m unittest ci_scope_test.ScopeTests.test_point_observation_checks_are_in_actual_execution_lists -v` with `PYTHONPATH=tests` | 1 PASS; new Python check registered in existing spatial CI scope |
| `node dist/tests/site-observation-stdio-smoke.mjs <fresh absolute directory>` | 5/5 cases PASS; actual compiled MCP, exact report export, new-process info/original-ID recovery and immutable object/request bytes |
| Exact-baseline legacy object check | PASS; one plain review generated using Python sources archived from exact `b5888c6`, reopened by current compiled provider with no new site field or changed numerical evidence |
| Preview inspection | Reference-conflict and zero-target returned PNGs actually inspected; every reference, fixed coordinate, interpretation boundary and next step readable |
| Source/runtime mirror and diff check | Changed Python source bytes equal compiled assets; implementation unchanged after pre-integration freeze; `git diff --check` PASS |

Temp directories were explicitly placed inside the authorized evidence directory.
The full suite was not repeated: no solver/FFT/GPA modification or broad
scientific qualification was proposed. Existing old-object source checks and
current numerical gates were not relaxed. CI itself has not been run remotely.

## Separate fixed cases

After the development checks, `pre-integration-freeze.json` sealed implementation
and harness hashes. The MCP cases used a different 72x80 array, 7x7 supports,
three references and fractional expected XY `[26.75,28.25]`; the brighter
neighbour at `[33,28]` was not adopted. No rule or parameter was changed after
these outcomes. These are independent scalar answers from distinct development
fixtures, not an independent scientist, physical blind study or population sample.

| Case | Target | References | Every signed difference | Result / suggested continuation |
|---|---:|---|---|---|
| brighter | 7 | 5,5,5 | +2,+2,+2 | Raw above/equal; inspect raw profile |
| conflicting | 7 | 2,7,11 | +5,0,-4 | Median difference 0 does not hide reference sign disagreement; inspect reference comparability |
| empty expected support | 0 | 6,6,6 | -6,-6,-6 | Raw below/equal; coordinate remains expected, not detected; inspect profile |
| signed derived iDPC declaration | -4 | -2,-2,-2 | -2,-2,-2 | Raw comparison available, no independent-Poisson inference |
| unknown channel | 1 | 1,1,1 | 0,0,0 | Equal raw means; request acquisition meaning, no normal-material claim |

All physical conclusions are null. Every supplied reference remains present.
No FFT, GPA, column fit, noise draw, physical forward or AI/model service call
was made by this integration run. Only explicitly requested raw statistics were
computed. Development also checks attaching a saved profile and history revision.
The new helper and its two new check sources have explicit LF checkout rules;
this packaging-only addition preserves their tested bytes without normalizing
existing helpers or historical evidence.

Complete case input specifications, TIFFs, before/after MCP call responses,
provider workspace/journals, delivered PNGs, exported files and results are in
the sibling local evidence directory `stem-site-loop-evidence-20261106`, under
`independent-cases-v1/`. The exact-baseline compatibility creation script,
archive, old responses and new read responses are in `legacy-baseline-check/`.
The final handoff index identifies the source HEAD, patch/bundle and all hashes.

## Remaining limits

- Real STEM specimens, scientific noise significance, localization, reference
  equivalence, ABF/iDPC image formation and defect/occupancy/element inference:
  NOT_TESTED or insufficient evidence.
- The next step is a finite inspectable suggestion, not calibrated information
  gain or proof that an autonomous Agent will choose the optimal action.
- No live model-driven workflow or human GUI gesture/usability acceptance.
- One same-runtime legacy case does not qualify all old archives or solve the
  separate HRTEM cross-environment floating-point compatibility issue.
- New context is explicit and optional. Legacy records without it remain legacy;
  unsupported counts never cause an implicit S2 call.
- Node 22, macOS/Linux local execution and hosted CI were not run here. The CI
  registration schedules these existing checks without changing their policies.
