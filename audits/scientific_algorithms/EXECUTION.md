# Actual execution record

Date: 2026-11-01 (Asia/Shanghai). Exact audited source `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`, tree `82facfce75c5909c510cb5014e228918904f5de4`. All operations below took place in the isolated audit worktree. No production file was edited. The separate reviewer was actually spawned with `model=gpt-6-astra`, not inferred from a display label.

## Environment and commands

macOS arm64, Python3.13.18, Node24.22.2, npm11.19.1. Created `.venv` with `uv venv .venv`; installed `requirements-gpa.txt` and `requirements-structure-tools.txt` using `uv pip install --python .venv/bin/python`. See the exact [package freeze](evidence/python-freeze.txt). `npm ci` completed successfully.

| Command | Actual result | Interpretation |
| --- | --- | --- |
| `npm test` | exit0;400 tests,395 pass,5 conditional skips,0 fail; build also ran | Existing engineering tests only; no scientific correctness inference from aggregate green |
| `npm run typecheck` | exit0 | Strict TypeScript checks; no production implementation was changed |
| `MICROSCOPY_PYTHON="$PWD/.venv/bin/python" DM_IMAGE_PYTHON="$PWD/.venv/bin/python" DM_ANALYSIS_PYTHON="$PWD/.venv/bin/python" npm run test:science` | exit0; signed calibration→ROI FFT→.8nm→export/direct DFT→display revision→restart→Panel HTTP | This disposable smoke server is separate from the user's running GUI/workspace; no browser gesture claim |
| `.venv/bin/python -B audits/scientific_algorithms/main_probes.py --output analysis/scientific-algorithms-main-r2` | exit0;9 probe groups,59 explicit calls,9 source files unchanged | Numerical controls and documented defects/limits reproduced. PASS in this program means the stated audit observation reproduced, not that every observed behavior is desirable |
| `.venv/bin/python -B audits/scientific_algorithms/edge_probes.py --output analysis/scientific-algorithms-edge-r2` | exit0;3 probe groups,34 explicit calls,8 source files unchanged | Includes the full-worker shifted-impulse failure; test expects and preserves current bad behavior |
| `.venv/bin/python audits/scientific_algorithms/astra_probes.py` | final run `astra_evidence_20261101T231903`, exit0;25 outcomes:18 PASS,4 FAIL,3 METHOD_LIMIT,0 PROBE_ERROR | FAIL entries are scientific findings covering D-01/E-01. Exit0 means audit completed; exit2 is reserved for a harness exception. **This is not a passing regression suite for the defects.** |

Compact results: [main summary](evidence/main-probes-r2-summary.json), [edge summary](evidence/edge-probes-r2-summary.json), [astra results](evidence/astra/results.json). Exact submitted main/edge requests and authoritative returned IDs/file hashes: [main receipts](evidence/main-request-receipts.json), [edge receipts](evidence/edge-request-receipts.json). Astra includes selected complete failure responses, source XYZ files, both two-site reflection tables, exact executed probe source and raw-file manifest.

Final packaging checks passed: Python probe syntax, all local audit Markdown file links, JSON decoding, original main/edge raw-file hashes, and `git diff --check`. The scientific production-file diff remains empty. Hash manifests and request-receipt indexes use compact one-record-per-line JSON formatting; their referenced original source/results are unchanged.

Raw npm/science stdout is retained locally as `evidence/npm-test.log` and `evidence/science-smoke.log`; their SHA256 and final summaries are also in [execution-record.json](evidence/execution-record.json). Raw logs, TIFF/NPY/PNG and workspace object stores are excluded from the PR to keep it focused; they remain in this worktree and can be regenerated with the supplied code. Compact evidence records source hashes and original request/object IDs; it does not pretend to be a substitute provider workspace capable of original-ID replay.

## Failures retained before harness corrections

1. Main r1 used float64 TIFF, outside the ordinary importer's explicit float32/uint16 scope. Six groups were correctly refused before algorithms ran. Changed the **probe input serialization** to float32 and evaluated DFT truth on those actual quantized samples. No algorithm/tolerance changed. [Original r1 summary](evidence/main-probes-r1-harness-failure.json) and [requests](evidence/main-probes-r1-requests.json) retained. Exact executed r1 script remains in its local raw directory and is in the hash manifest.
2. Edge r1 expected the more-specific reciprocal-parent rejection text, but the worker correctly rejected earlier at the real-image FFT domain guard. Only the harness accepted both legitimate guard messages; numeric and scope requirements stayed identical. [Original r1 summary](evidence/edge-probes-r1-summary.json) retained, including the successful A03 and rotation observations. Full original requests/script remain local and hashed.
3. Astra earlier harness-development runs included response-envelope unpacking and TIFF dtype mistakes. All raw runs and result files remain; the final25-outcome run has no harness errors. Earlier exact script snapshots were not captured, so no claim of source-complete replay of those preliminary runs is made. Final exact script/hash are [recorded](evidence/astra/execution.json).

No failure was repaired by loosening a scientific threshold, changing a truth formula to match output, or overwriting an existing result. A future regression must invert the appropriate bad-behavior assertions after a separately reviewed fix; this audit's recorded failures stay unchanged.

## Raw local retention and fresh reproduction

Under `/Volumes/External SSD/mircograph/algorithm-audit-20261101/`:

- `analysis/scientific-algorithms-main-r1/` and `...main-r2/`: complete requests/responses, source TIFFs and provider stores.
- `analysis/scientific-algorithms-edge-r1/` and `...edge-r2/`: complete failure/control outputs and provider stores.
- `audits/scientific_algorithms/astra_evidence_*/`: all independent reviewer runs, with final source/worker arrays in `...231903/`.

All sources are newly generated public synthetic formulas or tiny supplied-in-code structure models. No real sample, private image, vendor binary, credential or user GUI input was used. The committed [main raw manifest](evidence/raw-main-manifest.json) and [astra raw manifest](evidence/astra/raw_evidence_manifest.json) support byte-level checks without adding large arrays to Git.

For a fresh checkout, install the dependencies above and select **new** output paths. Do not reuse an existing output path or an unknown original request. Main/edge use `exist_ok=False`; astra creates a timestamped directory. Run the ordinary tests with the isolated interpreter as shown. Source SHA and tree are recorded by the main harness; never relabel a later branch run as this baseline.

NOT_TESTED scopes and scientific limits are in the main report. Old complete v1 archive replay, true specimen accuracy and comprehensive candidate-pipeline qualification are not implied by current synthetic and smoke execution.
