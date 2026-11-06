# STEM existing-tool continuation validation

Base `4b2ff462dec75902be6215fbb6ba6bf0d6c5d969`; isolated branch
`feat/stem-tool-continuation-20261106`. No HRTEM edits or push/merge.

The material-facing question is the raw difference at a supplied expected site
versus comparable references. This increment connects saved review -> exact
existing profile call -> linked review -> export/original-request reopen.
No new numerical model, detector or autonomous controller is introduced.

## Results and scope

| Layer | Result | Evidence |
|---|---|---|
| Deterministic, evidence-bound suggestions | PASS | Six new Python tests, existing coverage regressions and bounded fixtures |
| Execution through existing CLI and MCP tools | PASS | CLI three cases; MCP positive case; actual profile and linked review receipts, export and original-request reopen |
| Real AI autonomous selection | NOT_TESTED | The entry harness is scripted. The existing fresh-model qualification launcher targets a different FFT route and was not invoked |
| Physical STEM interpretation | NOT_TESTED | These are analytic scalar arrays, not physical forward simulations or specimens |
| GUI workspace/gesture qualification | NOT_TESTED | Save/reopen here refers to persistent provider journals and fresh processes; no GUI form, button or model auto-wake was added |

No final check failed. During development the first relative-path Git clone
failed before creating a repository with `NtCreateDirectoryObject` access
`0xC0000022`; after checking non-execution, one standard reviewed retry with
absolute paths succeeded. It is an environment setup failure, not a science
result. There is no remaining blocker. No global Git settings were changed.

## Frozen cases and observed receipts

The harness declares cases before execution in `cases.json`; full inputs,
responses, saved objects, requests, exports and source TIFF hashes are retained.
It does not adjust expected positions or tolerances after seeing results.

| Case | Complete raw comparison | Outcome |
|---|---|---|
| Weak expected site, including off-site profile | Expected `[22.25,22.5]`; target mean 4; references 10 and 10; both differences -6. Existing line `[[20,20],[24,20]]` remains unverified | Proposes and actually executes `image_profile` at `[[20.25,22.5],[24.25,22.5]]`, nearest, width 1, five samples. Linked review retains statistics, off-site profile and new profile; assessments are `[not_verified,covered]`; stops at observation with null physical conclusion |
| Conflicting references | Target 5; references 2 and 8; differences +3 and -3, despite median difference 0 | `needs_reference_review`; no proposed profile or follow-up tool. Both references retained |
| Unknown input modality | Target 4; references 10 and 10; modality `unknown`, scalar fixture without count interpretation | `needs_information`; no proposed profile, physical conclusion or S2 call |

All three cases passed through the actual CLI tool/query entrypoint. The positive
case also passed through the actual MCP entrypoint, including a closed/restarted
MCP client before querying the original final request. CLI calls each launch a
fresh process. Repeating the exact profile CLI call resolves its existing durable
intent rather than creating another measurement. Original object/request files
and source TIFFs remain byte-identical. Exported continuation JSON equals its
saved source; full continuation and evidence survive reopen. This is a scripted
choice and receipt check, not proof of AI pixel inspection or autonomous reasoning.

Boundary tests additionally cover the vertical fallback, neither axis supported
by the original ROI, evidence/history limits, invalid opt-in and coherent
rewriting of saved actions (rejected as `CORRUPT_OBJECT`). Budget predicates are
unit checks over an already validated review; they do not submit fabricated
evidence to a provider.

## Commands and evidence

Run from the isolated worktree. Python tests use a local evidence `tmp` directory
for `TEMP`/`TMP`, `PYTHONUTF8=1`, and no bytecode. Entry output paths must be fresh
absolute directories. The evidence root is the adjacent
`stem-tool-continuation-evidence-20261106` directory.

```text
python -B -X utf8 tests/image_site_continuation_test.py
python -B -X utf8 tests/image_site_observation_test.py
npm run build
node --test dist/tests/workbench-cli.test.mjs dist/tests/discovery-contract.test.mjs
PYTHONPATH=tests python -B -m unittest ci_scope_test.ScopeTests.test_point_observation_checks_are_in_actual_execution_lists -v
node dist/tests/site-continuation-entry-smoke.mjs ABS_EVIDENCE/cli-entry-v1
node dist/tests/site-continuation-entry-smoke.mjs ABS_EVIDENCE/mcp-entry-v1 --mcp
```

Results: new Python tests **6 PASS**, existing coverage regressions **11 PASS**,
Node contracts **25 PASS / 0 skipped**, CI registration **1 PASS**, build **PASS**,
CLI cases **3 PASS**, MCP case **1 PASS**. Logs are `python-final.log`,
`coverage-regression.log`, `node-contracts.log`, `ci-registration.log`,
`build-final.log`, `cli-entry.log`, `mcp-entry.log`; complete case data is in
`cli-entry-v1/results.json` and `mcp-entry-v1/results.json`.

Boundary review then identified the existing eight-revision history limit: the
planner could propose a measurement whose subsequent linked review would be
rejected. A pre-measurement guard was added, with no changed success geometry or
numerical policy. The affected budget test passed and the build passed; the
compiled MCP positive path was checked independently again and passed:

```text
PYTHONPATH=tests python -B -X utf8 -m unittest image_site_continuation_test.SiteContinuation.test_edge_and_evidence_budget_block_without_moving_or_dropping_inputs -v
npm run build
node dist/tests/site-continuation-entry-smoke.mjs ABS_EVIDENCE/mcp-entry-v2 --mcp
```

Those final logs are `history-budget-regression.log`, `build-history-guard.log`
and `mcp-entry-final.log`. `final-entry-freeze.json` records code/test hashes before
that final MCP check. Only this validation narrative was completed afterwards.
The unchanged CLI cases/contracts were not rerun after the isolated history
guard. Historical compatibility was separately checked by the compiled current
worker reading an original accepted version-2 through-site review from the prior
coverage evidence: original feedback exactly equal, no new opt-in field, old
object/request bytes unchanged (`legacy-v2-compatibility.json`: PASS). Earlier
version-1 compatibility remains the prior increment's evidence, not a new run.

CI's spatial job now registers the new Python test and bounded CLI/MCP checks.
Remote CI, other OS/Node versions, full suites, fresh-model runs, real specimens,
S2, R64, NL-PCA and large simulation/noise experiments were **NOT RUN**.

## Interpretation and operational limits

The 8-ULP exact finite-segment policy and actual nearest-sample qualification
are unchanged. Manual lines can require another coverage inspection or redraw
even when visually close; old lines remain evidence. The generated exact
through-point endpoints reduce manual aiming work without moving the original
point or relaxing the policy. Five samples supply minimum one-dimensional
context, not proof of adequate spatial resolution or the best physical direction.
Reference comparability, noise significance and physical causes remain unknown.

The persisted action is a proposal (`not_dispatched`); the provider's child
receipt and linked review record actual execution. The host must match the saved
request and result kind, append the result to **all** retained evidence, and
inspect actual coverage. An unknown write requires querying the original saved
request ID. The host must stop if coverage is still unverified. Evidence/history
caps stop before measuring rather than dropping evidence or resetting history.

S2 is not proposed or added to the CLI allowlist. Existing explicit MCP S2 still
requires its imaging-modality, count-semantics, fixed-position, width and reference
conditions; a derived iDPC channel is not an independent Poisson count array.
No new detector, numerical model, GUI context role, executor or Agent framework
is introduced. The original HRTEM worktree and unpublished broad candidate were
not modified; this branch starts only from the previously accepted narrow STEM
HEAD, with no push or merge.
