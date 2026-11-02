# Change-scoped CI: first-stage contract

This increment changes CI selection and removes duplicate checks within a job.
It does not change scientific algorithms, thresholds, runtime timeouts, saved
objects, Node support, Actions major versions, Python dependency constraints,
or the historical `macos-r3-light.yml` qualification.

## Selection

Both regular workflows run on PR, main push, manual dispatch and merge-group
check events; neither has a workflow-level path filter. `scripts/ci_scope.py`
reads a NUL-separated `git diff --no-renames` from the PR merge base to its head.
Both sides of a rename, deletions and mixed changes contribute. Unknown paths,
empty/unreadable diffs and every non-PR event select all groups. Failed script
execution fails classification; it does not produce an empty successful scope.

| PR changes | Default selection |
| --- | --- |
| Root README/AGENTS and `docs/**/*.md` only | CI contract/whitespace/gates; no application suites |
| Skill Markdown | Existing Node package/tool contracts and client-launch tests; no numerical suites |
| UI HTML/CSS | Existing Node engineering suites |
| Audited presentation modules (app/research workspace/annotation presentation/viewer render) | Node plus one small real science/provider boundary smoke |
| Panel/Inspector entry code | Above plus compiled compatibility |
| GPA core | GPA, topology consumers, method integration, Node and provider boundary |
| Topology core | Topology, method integration, Node and provider boundary |
| Spatial features and comparisons | Spatial/active consumers, topology/integration and crystal consumers, Node and boundary |
| Known crystal implementation | Actual simulation, crystal geometry, Node, compatibility and boundary |
| Shared worker, calibration, request/object identity, shared UI evidence contracts, build/root entrypoints/dependencies/CI or unknown | All groups |

The spatial-to-crystal link is intentional: `crystallography/twin_observations.py`
reads spatial-domain output. `crystallography/reflection_compare.py` also serves
image comparisons, and `capture.py` serves image import; both remain full-scope.
`ui/` is not a trust boundary: ROI/evidence/coordinate contracts are also imported
by providers and remain broad. New unclassified modules do not inherit a light
profile merely from a filename prefix. A `.test.mjs` file is Node-only only if
registered in the actual npm test catalog; opt-in tests have explicit owners.

This first stage keeps the existing Node matrix (18/22 on Linux/Windows) rather
than dropping a declared support floor. It does not add browser or model tests.
The small `science-boundary` job runs the existing `test:science`; that invocation
moves out of the GPA integration job instead of being duplicated. All numerical
regressions and actual scattering commands remain available under their groups.

## Gates and rollout

`CI scope gate` and `F3b scope gate` use `always()` and explicit `needs`. They require:
classification success, a complete boolean output contract, every expected job
entry, and success for every selected job. Missing, failed, cancelled or unexpectedly
skipped selected work fails. Only explicitly unselected work may be skipped.
The quick workflow runs the stdlib CI classifier/gate/wiring test suite once;
the F3b workflow reuses the classifier without rerunning that suite.

Existing job names are retained; the new F3b classification and gate names are
unique. **Before deployment an authenticated maintainer must inspect the actual
branch protections/rulesets and ensure both scope gates are required.** An old
required matrix-job name may interact with skipped matrix expansion. Do not
remove a safety requirement just to get a merge, do not label a skipped test as
PASS, and do not claim gates are enforced merely because YAML contains them.
The review connection could not read protection settings (403) and made no
administrative changes. Hosted checks and required-check compatibility remain
rollout prerequisites.

Same-PR superseded runs may be cancelled. Non-PR concurrency groups include the
unique run ID; main/manual/merge-queue validations never cancel each other through
this rule. Main still runs the full suite during this first-stage transition.
No expectation of a particular runner's timing is used to weaken test assertions.

## Deduplication and evidence

`npm test` already has `pretest = npm run build`, and build checks all three TS
projects. Redundant standalone typechecks are removed from that same Node job,
compiled-compatibility and F3b; each still does one strict build. The developer
`typecheck` command remains unchanged. Separate platforms are not interchangeable.

Local checks:

```sh
python3 -B -m unittest discover -s tests -p 'ci_*_test.py' -v
printf '["ui/image-panel/style.css"]' | python3 scripts/ci_scope.py --paths-json
```

The wiring tests use the maintained YAML structure, not a hosted runner emulator.
Keep local, hosted CI, browser gestures, real-model tasks and physical-material
validation separately labelled. CI green does not grant new scientific confidence.

Later independent work: current Node/Actions versions, Python CI constraints,
current-main Mac checks, and a small public-fixture browser smoke. Do not bundle
those environment changes into this routing increment.

Official semantics consulted:
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
