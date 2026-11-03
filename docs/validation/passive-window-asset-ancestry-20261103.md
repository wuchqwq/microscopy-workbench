# Passive saved-image ancestry read — 2026-11-03

Base: `88566a81324205bc6de9d2975cda1b4d1d9830ef`. This is a bounded
read-contract/transport correction; no FFT, measurement, save lifecycle, or
navigation relation is recomputed or replaced.

## Original failure retained

The independent native review reopened saved analysis A, activated its existing
FFT, and twice saw the passive source image time out: initial load and one
explicit read-only retry. Its previously qualified clean bitmap remained visible
with annotations pending. This is a real bounded-load failure, not proof of the
same cause as the owner's earlier indefinitely blank scene.

The source had thirteen ancestry records: eleven annotation versions, their
original view, and the source frame. `readWindowSaved` followed the original
parent/base/source chain using thirteen separate `image_info` calls. Each call
started Python and the query lane was serialized. Root's separate original real
HTTP trace returned 200 after **11186.7277 ms**, already exceeding the unchanged
GUI's 10000 ms GET/decode deadline. The saved PNG was 251497 bytes. This trace is
protocol timing, not a mouse-task or general performance benchmark.

## Bounded correction and guards

The existing `image_info` advertises optional boolean `include_frame_ancestry`.
Default/false replies remain unchanged. The explicit option qualifies the same
records with the existing `Workspace.object` in one Python process, then supplies
a compact non-persistent `frame_ancestry` projection. Thirteen records still
receive thirteen original object/journal/manifest/payload checks; only repeated
Python startup and ancestor PNG base64 encoding are removed.

Only the saved-window asset route requests it, and only when `tools/list`
advertises the option. Missing optional output retains the old fresh-parent path.
Present malformed roots/links/statuses/projections are refused. The projection
is bounded to 65 records/512 KiB, retains the original nullish parent then base
then source order, terminal/cycle/depth semantics, and the formerly checked
65th record. An oversized projection omits the optimization; a persisted field
of the same name cannot masquerade as this read's qualification.

The existing Node adapter still checks every ancestor's completed external
response, native realpath containment, 2 MiB PNG limit and PNG signature. It
encodes only the requested image. The current window's separate exact PNG/path/
hash checks, frequency render-grid check, final collection revision/object and
asset/frame binding remain. No render-base shortcut skips historical parents;
no cache crosses HTTP requests, no query capacity increases, and the GUI timeout
does not change. Source descriptions, dataset/plane identities and root-declared
meaning retain their original semantics without guessing missing fields.

## Verification

External logs remain under `passive-asset-ancestry-*-20261103.log`:

| Check | Result and scope |
| --- | --- |
| Six new controlled HTTP contract checks on original implementation | 5 FAIL / 1 PASS retained; thirteen RPCs rather than one and unimplemented optional-contract refusals |
| Initial TypeScript narrowing error | First build failure retained; corrected without changing the contract |
| Locked `npm ci` and final formal TypeScript build | PASS |
| Four affected Node/Panel HTTP consumer files | 77 PASS / 0 FAIL, including legacy fallback, malformed identity, cross-frame mapping, actual PNG bytes and racing collection revision |
| Real adapter fake-worker negatives | Ancestor path escape, non-PNG, oversized PNG, incomplete status, malformed truthy path and the 65th PNG refusal all PASS |
| Python bounded ancestry and original object qualification tests | 17 PASS; includes nullish/cycle/depth, original creator/payload/backend refusal and budget/old-field fallback |
| One real existing MCP boundary check on a public 16×24 TIFF | PASS: 13 qualified records, ordinary metadata/PNG unchanged, corrupt ancestor payload refused, source and two NPY files unchanged, no read journal entries or FFT calculations |
| Fixed real HTTP timing, hosted CI and repaired native retry | NOT_TESTED by this isolated implementation task; separately required after integration |
| Real specimens, complete GUI or scientific accuracy | NOT_TESTED |

Commands after `npm ci` and `npm run build`:

```text
node --test dist/tests/image-panel-windows.test.mjs dist/tests/image-panel-window-activation.test.mjs dist/tests/analysis-workspace-panel.test.mjs dist/tests/panel-restore-reads.test.mjs
python -B -m unittest discover -s tests -p image_frame_ancestry_test.py
node dist/tests/image-info-ancestry-mcp-smoke.mjs
```

The MCP smoke uses `MICROSCOPY_PYTHON` to select the explicit scientific Python.
Its deliberate payload corruption and byte restoration are confined to its own
temporary public test fixture. Independent review was read-only and did not
repeat tests. No unrelated FFT/GPA/topology/scattering/noise matrix was run.
