# Dependency-scoped CI (2026-11-02)

This changes test selection, not scientific algorithms, thresholds or acceptance
claims. #77 and #79 were reviewed and merged before this CI increment; the
integration parent is `dd917e59c7d492361faf2e471af0827f701af526`. Always obtain the
live main SHA and its own checks before using it as an engineering checkpoint.
Old Mac/R3 baseline refs and historical reports are not moved or rewritten.

## PR selection

`scripts/ci_scope.py` is the shared, standard-library-only classifier, invoked by
`ci_scope.sh`. It measures both ends of renames/deletions against the PR merge
base; paths are NUL-delimited. Events other than pull_request, missing/unreadable
refs, empty diffs, unknown paths, shared workers/protocol/schema/calibration,
build scripts, dependency manifests and CI changes run the complete catalog.

| Changed area | Checks selected |
| --- | --- |
| Ordinary docs/README/AGENTS Markdown | Scope/gate tests and changed-file whitespace |
| Skill Markdown | Above plus strict build and existing packaged Skill/tool-reference check |
| Image Panel UI, Panel/Inspector entry, associated UI tests | Node/TypeScript/platform/packaging checks and one actual image-science/Panel smoke; no routine GPA/topology/scattering matrices |
| Known GPA leaf modules/tests | GPA, its F4 integration and consuming topology, including their build/MCP checks |
| Known topology leaf modules/tests | Topology with its build/MCP checks |
| Known spatial-feature leaf modules | Spatial/active, GPA integration and topology consumers with their build/MCP checks |
| Crystal modules and mapped tests | Geometry and actual ASE/diffsims/MCP; the TS structure viewer also selects engineering |
| Mixed changes | Union of affected areas; any unknown/shared path expands to full |

The mapping is deliberately conservative, not a complete automatic dependency
analyzer. Extensions alone do not establish isolation. Add a new narrow rule
only with consumer review and tests. New unmapped files fall back to full.
Known numerical-only changes do not also select the unrelated full Node matrix;
the selected scientific jobs already build and exercise their actual MCP boundary.
`run_full_ci` is retained as a compatibility diagnostic; jobs use domain flags.
Skill link/catalog success is not new-model behavioral qualification. DOM and
HTTP/science smoke success is not real-browser or real-specimen qualification.

## Main and CI gates

Main pushes and manual runs remain **full** during this transition. Existing
scientific counterexamples and test assertions are retained. Both workflows now
start on every PR/main push instead of using an independent broad/incomplete
F3b path filter. Build/root server changes can no longer silently omit F3b.

`Scoped CI gate` and `Simulation CI gate` use `always()` and list every relevant
job in `needs`. `ci_gate.py` rejects failed classification, missing/invalid flags,
missing dependencies, cancellation/failure and a selected job unexpectedly
skipped. Only an explicitly unaffected skipped job is acceptable. A green gate
states the selected scope, not that all scientific tests ran on a GUI-only PR.

Repository reads at implementation time reported main unprotected and no
rulesets. No repository security settings were changed. An owner may separately
require both new gate names; adding workflow jobs alone does not make them
mandatory branch-protection checks. Existing job names remain available.

Only older runs of the same workflow and PR are cancelable. Main/manual runs use
unique run IDs and are not canceled by a newer PR. Canceled evidence is not PASS.

## Removal of duplicate work

- Strict `build` already performs the three TypeScript checks. Removed redundant
  standalone typecheck immediately before build/pretest inside the same jobs.
- `npm test` and its existing pretest build are unchanged for developers.
- The existing representative `test:science` invocation moves from the GPA
  integration job to the common engineering boundary job; it is not duplicated.
- Different platforms/Node versions are still distinct evidence, not deduplicated.

No Node support-floor, Actions major, Python requirements, production timeout,
scientific threshold or old test budget changes are included. Node/Actions
lifecycle, a frozen Python validation environment, current-main Mac coverage and
an actual browser smoke are separate follow-ups, not claimed implemented here.
The current Node 18 support promise is not silently removed.

## Validation and continuation

`tests/ci_scope_test.py` uses real temporary Git histories: docs, Skills, UI,
science domains, mixed paths, rename/deletion, base-only changes, unknown files,
missing refs and full main/dispatch behavior. `tests/ci_gate_test.py` covers
selected/unselected/failed/canceled/skipped/missing jobs and checks workflow
conditions, outputs, dependency lists and absence of workflow path filtering.
No third-party package is needed for these tests.

For this CI change itself the classifier selects full CI. The real CI run must
pass before merge; the merged main push must be inspected separately. No local
repeat of all scientific matrices is necessary. Preserve original failures and
use the exact source SHA, command, environment and scope for every result.

Next user-facing work is in [GUI/help handoff](CODEX_GUI_HELP_HANDOFF.md).
Issue #78 and #71 remain partial; #45 remains independent. A clean engineering
checkpoint is not a declaration that navigation, layout, model autonomy or
real-material accuracy have passed.

## Official semantics used

- [Required checks, skipped workflows/jobs and always/needs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [Workflow conditions and concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
