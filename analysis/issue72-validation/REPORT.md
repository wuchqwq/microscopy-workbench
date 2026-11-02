# #72 implementation qualification, 2026-11-02

Base SHA `adf8860e852fb3ca447cd3a4c6e6e3e2d7788c19`, Git tree
`59f8bfe66164ea2c63e56c563f56de8797b2b494`.
Dedicated worktree `resumable-observations-fix-20261102`, branch
`fix/resumable-observations-72`. No push, merge, stable-baseline move or historic
scientific record edit was performed by this subtask.

## Original failure preserved before edits

[`../issue72-original/`](../issue72-original/) retains the public float32 TIFF,
actual frozen-worker requests/responses, original arrays/manifests/requests,
SHA-256 inventory, source SHA/tree and failure results. Full immutable originals
are packaged in `../issue72-original/original-evidence.zip`; concise failure,
base and hash manifests remain plain JSON. Extract for inspection without
rewriting the embedded original paths or records.

- Actual old `image_annotate` saves anonymous ROI object
  `bc4eeaf598c74e7883ebffe64d8c70ed`, request `original-3`, source rect
  `[8,8,40,40]`. The old compiled handoff correctly returns `usable:false`:
  `Saved rectangle has no bounded annotation identity.` This is an intent/API
  contract gap, not a numerical error or an argument for admitting anonymous
  handoffs. Original anonymous display behavior remains available.
- The old schema rejects 1001 ASCII units and 501 emoji/1002 UTF-16 units but
  only says `字符串长度或格式错误`. Exact field/length/limit feedback was missing.
- Actual old `original-4` saves a stable annotation with a 2048-codepoint note.
  It is a compatibility fixture, not a new-mode request. Current formal MCP
  info/result/read/reprojection checks preserve it and every original hash.

The original `failure.json`, `calls.json`, `records.json` and `hashes.json` are
observations from the unfixed worker/built boundary, not constructed new-object
records claiming to be history. Source identity includes original file path,
stat and full file hash; scientific array hashes are retained too.

## Executed checks

All scientific Python calls used the already locked environment:
`/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python`.
Node dependencies were installed with `npm ci` from the existing lockfile; no
requirements or dependency locks changed. Node v24.22.2, Python 3.13.18.

| Command / evidence | Actual result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| locked Python `-B tests/test_resumable_observations.py` | 7 tests PASS; actual worker save/read/result/edit/preview, source and originals protected |
| `node --test dist/tests/resumable-observations.test.mjs dist/tests/panel-roi-handoff.test.mjs dist/tests/roi-observations.test.mjs dist/tests/research-workspace-ui.test.mjs dist/tests/runtime-registry.test.mjs dist/tests/image-panel-concurrency.test.mjs dist/tests/image-panel-draft-transport.test.mjs` | 59 PASS at initial targeted checkpoint |
| `node --test dist/tests/image-panel-ui.test.mjs dist/tests/research-workspace-ui.test.mjs` | Final 100 PASS, actual UI handlers with DOM/API-port shim; includes exact raw whitespace budget, Unicode refusal/draft retention, saved readback, late new reason and changed calibration |
| `node --test dist/tests/image-panel-transport.test.mjs dist/tests/image-panel-presentation-transport.test.mjs dist/tests/runtime-transport-parity.test.mjs dist/tests/runtime-stdio.test.mjs` | 14 PASS, 1 opt-in full figure-display MCP test SKIPPED; no display recipe algorithm changed |
| locked Python `-B tests/ci_scope_test.py` | 15 PASS after registering new Node/Python regressions in normal CI |
| `git diff --check` | PASS |
| `MICROSCOPY_PYTHON=<locked python> MICROSCOPY_SMOKE_OUTPUT=<new absolute directory> MICROSCOPY_LEGACY_OBSERVATIONS=<original fixture directory> node dist/tools/smoke_resumable_observations.mjs` | PASS: actual compiled plugin MCP, independent Python, registered Panel helper, save/read/reconnect/current, originalMark replacement, stale show guard, normal helper close/resume, historical recovery |

Do not sum the Node row counts as independent tests: the research workspace
checks deliberately overlap. Repeated build/UI checks followed new changes;
no blanket Node/science or FFT/noise/diffsims suites were run. Such suites are
not the affected layer under the current AGENTS policy.

The formal MCP chain checks that a missing ID/actor and an oversize note are
rejected before Python journal creation. It verifies readback against exact
source/current anchor/contract metadata and pixel-only absence of calibration,
then checks sparse layout, preview, actor-declared anchor revision and an
actor-omitted note revision. A private owned-helper Panel action explicitly
uses `unspecified` plus `test_operator_protocol_simulation` and tests
`originalMark` preservation. It is **not a browser or real researcher action**.

It creates a second MCP client to recover the original request, queries a
never-dispatched ID without replay, and normally closes/resumes only its own
helper. Reopening changes neither scientific objects nor requests. For the
old baseline fixture it reads old IDs and original requests and reprojects
both anonymous and 2048-codepoint records; all 18 originally hashed files stay
byte-for-byte unchanged. No old object is given new fields for acceptance.

## Retained development failure

`development-harness-conflict.json` and its calls preserve one failed expanded
smoke. The script used a fixed request prefix in a historical workspace already
visited by an earlier smoke, so a later operation collided with a previous
request ID and correctly returned `REQUEST_CONFLICT`. All prior checks,
including helper close/resume, had passed. The harness now uses a deterministic
per-output-directory prefix. The failed history remains; no production rule,
old request, object or tolerance was changed. The final clean run is
`mcp-report.json`; transcript is `mcp-calls.jsonl` (private Panel tokens redacted).
Raw execution logs, transcripts and the new public TIFF are preserved in
`execution-artifacts.zip`; both archives have hashes in `archive-sha256.json`.

## Interpretation and remaining qualification

This is an interface/data-integrity fix. It does not resolve measurement noise,
method applicability or physical non-identifiability, and introduces no new
physical qualification. `resumable_observation` is an explicit intended use;
`selection_origin` is a caller statement; neither means scientific truth.

- Real GUI/browser gestures: **NOT_TESTED**, explicitly paused by user.
- Model/Skill blind behavior: **NOT_TESTED** here; root performs a separate frozen
  qualification. In particular, backend acceptance does not prove an Agent
  will always supply stable IDs or honestly declare provenance.
- Full figure-display MCP option, general FFT/noise/GPA/topology/crystallography
  regressions: **NOT_TESTED** in this bounded engineering change.
- No #70 recovery/preview admission implementation belongs to this branch.

The API and GUI preserve old meanings; no migration, new candidate store,
framework, numerical detector or new probability is added.
