# Method routing validation record

Base: `8bff842bd084be2986f0bf99613da7b947fe0bae`.
Scope: packaged Skill guidance, frozen evidence index, explicit decision-record
authoring check and directly related tests. Solver/provider/gates are unchanged.

The isolated checkout is `conditional-methods-physical-v1`, branch
`feat/conditional-method-evidence-routing-20261105`. Existing TypeScript 5.9.3,
Node types 22.20.5 and undici-types 6.21.0 were physically copied from the already
validated checkout; no dependency was installed or linked. Build output stayed
inside this checkout. Node was v24.16.0 and Python was 3.13.

| Check | Actual outcome |
| --- | --- |
| `npm run build` | PASS, exit 0; all three TypeScript configurations and standalone asset packaging |
| Node new route + existing point/column-fit contracts | PASS, 9/9, no skipped tests; actual registry input/recovery shapes and unchanged baseline contract |
| Final route index/catalog/resource contract | PASS, 3/3 after locator/reference refinements; no skipped tests |
| Independent locator-only forward case E | PASS, checker exit 0; source=null and original locator/request retained; no provider calls or fits |
| Packaged Skill references/catalog single test | PASS, 1/1; no other plugin tests rerun |
| Final stdlib decision-record tests | PASS, 17/17 against packaged assets, including new locator-only recovery/stop and cross-scope refusal cases |
| Skill Creator `quick_validate.py` for router and automation | PASS for both with `python -X utf8`; invocation/discoverability metadata unchanged |
| Existing lightweight CI discovery | All 17 new record tests discovered by `ci_*_test.py`; discovery inspected without repeating tests |
| Production engine/source boundary | `git diff --exit-code BASE -- lib tools ui server.mjs science-server.mjs` exit 0 |
| Frozen selection/spec/P2 evidence | Worktree bytes equal original Git blobs; the index's SHA256 checks pass |
| `git diff --check` | PASS |

Static reference/checker/fixture edits after the first build were copied byte
exactly into its corresponding `dist` assets and rechecked. The final route
index/catalog/resource contract is rerun after these edits; prior unchanged
point/column-fit contracts are not repeated. The new Node contract is in the
ordinary npm test manifest. The stdlib regression uses the existing lightweight
CI entry, with no new test/runtime dependency or workflow change.

## Preserved first failures and refinements

The first source record test run had 13 passes and one error: Windows sandbox
AC Temp refused creation of the CLI test's decision file and its cleanup.
The same command under normal Windows Temp passed 14/14 before the later
locator refinement; the final affected set passed 17/17. This is an environment
permission review, not a skipped software failure. Both runs remain saved.

Skill Creator's initial invocation used the host's GBK default and could not
decode pre-existing UTF-8 Skill text. Both validators passed with Python UTF-8
mode; the original errors are retained. No Skill text or dependency was changed
to mask the decoder issue.

Self-review distinguished required reference fields from optional worker
prerequisites: reference schema refusal is not saved raw + UNKNOWN, and reference
equivalence is not an automatically checked numerical gate. Explicit numerical
UNKNOWN with supplied premises remains legal, including failed-reference whole
comparison status. Only supported missing optional prerequisites are described
as the durable UNKNOWN request route.

A separate fresh Skill evaluation by another Sol executor used the actual
entrypoints/references without the authored examples/tests. Its initial four
software scenarios chose sensible routes and produced four checker-accepted
records without scientific tool calls. That review found that a recovery record
needed explicit provider/workspace/session scope and must not require invented
source/ROI placeholders. The contract/checker now retain the original locator,
allow explicit unknown source/ROI for recovery or a stopped unresolved write,
and require complete source/frame/ROI for new measurements. Width/shape source
text can explicitly retain shape adequacy NOT_ASSESSED. The original four
pre-refinement forward records are preserved separately, not rewritten to pass
the amended contract. An additional locator-only independent case E passed with source=null and its retained locator/request, separately from the synthetic CLI/unit check; no provider call, fit or successful scientific recovery is claimed.

## Evidence and limits

Full stdout, stderr, command/exit metadata and first failures are retained in
the task7 `conditional-methods-evidence-v1` directory. The committed
[machine-readable record](validation/method-routing-v1.json) lists their hashes
and the exact scope. Raw traces may contain local temporary paths and are not
copied unredacted into Git. Independent forward evidence is a separate subfolder.

The exact base's already passing ordinary suite (1137 pass / 8 skipped), 41
bounded Python tests and actual MCP stdio evidence are reused for unchanged
layers, not claimed as a run of this new commit. No full ordinary suite,
research matrix, optimizer experiment or physical simulation was repeated for
this route integration. The record checker cannot verify acquisition truth,
shape adequacy, reference equivalence, source closure or authenticated scope.
Provider/P2 qualification remains authoritative. Physical blind execution and
any new physical conclusion are outside this engineering record.
