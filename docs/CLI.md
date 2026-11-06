# Headless analysis CLI

The CLI is a TypeScript entry over the existing image provider, schemas, numerical worker and original journals. It does not create a Panel, browser, Electron window or MCP server. Development use requires the repository's locked `npm ci`, `npm run build`, and an explicitly selected scientific Python environment. This is not a clean-Windows installer or phase-three distribution claim.

```powershell
node dist/tools/workbench_cli.mjs --help
node dist/tools/workbench_cli.mjs version
node dist/tools/workbench_cli.mjs doctor --workspace "F:\Research\分析 工作区" --python "F:\Scientific Python\python.exe"
```

Except help, stdout contains one versioned JSON response. Diagnostics belong on stderr; PNG/base64 is not printed. `version` and help need no Python/workspace. `doctor` checks basic NumPy/Pillow/tifffile imports without creating image objects; it does not qualify every declared dependency or optional method. Optional peak detection needs the existing SciPy dependency and is never substituted silently.

| Exit | Status | Meaning |
| --- | --- | --- |
| 0 | completed | Requested command completed; this does not certify physical interpretation |
| 2 | invalid_arguments | Invalid command/JSON/schema; fix input before a new request |
| 3 | conflict | Exact version/request/ownership conflict; inspect the bound version |
| 4 | failed | Known failure |
| 5 | outcome_unknown | Original operation may have executed; query its ID |
| 6 | unavailable | Environment or exact source evidence unavailable; existing/unresolved FFT is not missing |

## Explicit provider commands

Use an absolute JSON file, keeping Windows spaces/Chinese text in quoted arguments. Parameters are the existing provider schema; frame indexes are zero-based. Writes require an explicit `request_id`. A first-release allowlist includes import, frame, preview, FFT, peak candidates, measurement, calibration, annotation, context and export plus read/query. No arbitrary JavaScript or Python is evaluated.

`F:\Research\fft-input.json`:

```json
{
  "object_id": "EXACT_32_HEX_FRAME_OR_CALIBRATION_ID",
  "rect": [12, 20, 76, 84],
  "window": "hann",
  "subtract_mean": true,
  "request_id": "experiment-region-2-fft-001"
}
```

The placeholder must be replaced by a real returned frame/calibration ID; an annotation image is not a scalar FFT input.

```powershell
node dist/tools/workbench_cli.mjs tool --workspace "F:\Research\analysis" --python "F:\Python\python.exe" --name image_fft --input "F:\Research\fft-input.json"
node dist/tools/workbench_cli.mjs query --workspace "F:\Research\analysis" --python "F:\Python\python.exe" --request-id experiment-region-2-fft-001
```

The CLI fsyncs its request intent before provider submission. Repeating the same command with the same request/parameters queries `image_result`; it does not submit another computation. Different parameters with the same ID are rejected. Ctrl+C stops waiting using the existing coordinator and retains original IDs. Worker cancellation is not proof that nothing executed. Unknown, missing or incomplete original outcomes are not automatically replayed.

## Local STEM expected-site continuation

The unmerged STEM candidate additionally allows the existing `image_statistics`,
`image_profile`, `image_discovery` and `image_discovery_review` tools.
See the [baseline, inputs and minimal Agent route](STEM_BASELINE.zh-CN.md).
S2 is not in this CLI allowlist. This path does not require an FFT.

```text
node dist/tools/workbench_cli.mjs site-followup --workspace ABS_IMAGE_WORKSPACE --python ABS_PYTHON --request-id ORIGINAL_REVIEW_REQUEST_ID
```

This command only reads the original review and prescribed original profile
outcome. After matching the completed receipt to source identity, geometry and
sampling, it prepares `data.next_tool_call` for the existing review tool.
It never dispatches that call. Preserve all original evidence and inspect the
reported phase when the original outcome is unknown, failed or mismatched.
`review_arguments_prepared` does not prove that the proposed review has never
been attempted; query its original linked-review ID before any retry.

For a plugin configured with `workspace_root`, its `images` subdirectory is the
actual image workspace. Use that same directory for `--workspace`. Reopening a
CLI/MCP client there and querying original IDs reads saved provider records;
this is separate from a GUI savepoint or GUI acceptance.

## Three-ROI comparison

First explicitly save the analysis workspace in GUI, then inspect that exact version:

```powershell
node dist/tools/workbench_cli.mjs inspect --workspace "F:\Research\analysis"
```

The JSON reports `save_id`, `revision`, stable `annotation_id`, original float ROI coordinates, integer processing support and source/frame references. It does not read a guessed live GUI selection or implicitly save a GUI draft. An old checkpoint without an explicit savepoint is rejected as a saved analysis. An authorized immutable view can instead be named with `--snapshot-object EXACT_32_HEX_ID`; only stable ROI marks actually present in that view are used.

```powershell
node dist/tools/workbench_cli.mjs compare-rois --workspace "F:\Research\analysis" --python "F:\Python\python.exe" --roi roi-1,roi-2,roi-3 --request-id comparison-001 --compute-missing
```

`--compute-missing` explicitly authorizes missing FFT computations. Without it the report identifies `needs_fft`. Default preprocessing is explicit in the report: Hann plus mean subtraction. Override with `--window none --subtract-mean false` when scientifically appropriate. Reuse requires exact source-frame identity/hash, float-ROI association, integer support, preprocessing and calibration. Matching bounds alone are insufficient. Old FFT arrays without a provable float association remain readable, but are not called an exact reuse. Source/FFT arrays are checked against their committed hashes.

GUI and CLI use the same pure source-edge conversion, including the existing near-integer floating-point handling. The original float rectangle stays exact; conversion does not relax input-association comparisons. Source/window bounds remain independently checked. Importing this pure coordinate contract creates no DOM, window or GUI runtime.

Each verified FFT row carries an independently checked `input_association`. A GUI-origin association refers to a specific saved workspace manifest, FFT window and frozen input context with the original float rectangle. A new CLI computation binds the complete frozen input and original comparison/index into its provider request ID, then checks that ID against the durable CLI plan and original provider journal. A later comparison copies and rechecks this proof; a report's own `input_snapshot_verified` flag never certifies its provenance. Historical reports lacking proof remain readable with `input_association_unknown` and are not eligible for exact reuse or adoption. They are not rewritten or deleted.

For newly executed GUI FFTs, an additional before-dispatch input record in the existing Panel journal preserves the exact float selection even after the researcher discards working changes. The original provider request ID is bound to this record. `gui_panel_execution_input_v1` references revalidate its path/hash, source/frame, calibration, preprocessing and original provider outcome. A temporary ROI retains `annotation_id: null`; no saved ROI identity is invented. Old executions without this record are not retroactively assigned a float input.

Existing numerical peak tables and current committed measurements are read. If no corresponding peaks have been selected/measured, the report says `needs_point_selection`; it does not invent a lattice spacing or material orientation. `--detect-missing-peaks` explicitly requests the existing numerical candidate detector. This produces `candidate_peaks_only` when no committed measure exists. Numerical contrast, conjugacy and interpolation are not true-reflection certification. The CLI does not automatically pair reflections across ROIs.

For an explicit DC-to-candidate measurement, call `image_measure` with the exact saved FFT ID, `coordinate_space: "frequency_cycles_per_pixel"`, `points: [[0,0],[fx,fy]]` and a fresh pre-saved request ID. Read the existing `peak_table` for candidate coordinates or use researcher-specified points. Re-running a comparison with a **new comparison ID** can then include that saved measurement; the old report remains immutable.

The output preserves:

- `source_save_id`/`source_revision`, source view/frame and each stable ROI/float rectangle;
- FFT ID, original manifest/array hash, reuse flag and preprocessing;
- numerical candidate source views and exact committed measurement IDs/values;
- pixel period versus calibrated d-spacing, image-coordinate vector angle versus physical angle;
- provider result semantics, unknown localization/calibration uncertainty and unassessed interpretation.

An image-coordinate reciprocal-vector direction is not a complete crystal orientation. Unknown calibration permits pixel observations, not invented nm/angstrom values. The report does not establish phase, defect type, strain or peak correspondence.

## Saved reports and GUI handoff

```powershell
node dist/tools/workbench_cli.mjs reports --workspace "F:\Research\analysis"
node dist/tools/workbench_cli.mjs reports --workspace "F:\Research\analysis" --report-id comparison-001
node dist/tools/workbench_cli.mjs history --workspace "F:\Research\analysis"
node dist/tools/workbench_cli.mjs history --workspace "F:\Research\analysis" --request-id ORIGINAL_GUI_FFT_REQUEST_ID
```

Reports are append-only reference metadata in the original workspace's `cli-comparisons` directory. Their envelope hash, source/savepoint identities, original committed provider manifests, array hashes, peak tables and measurement values are verified on read. Provider objects and journals remain scientific authority. The report creates no alternate numerical database, does not move a savepoint and does not adopt or switch the GUI. GUI lists reports for explicit viewing/adoption through its protected workspace action; an old version can remain historical rather than overwrite new edits. An explicitly viewed saved FFT still uses the existing Panel pending/grid protections.

`history` only reads bounded original GUI execution-input records and does not open a Panel, create scientific objects or restore a discarded draft. Each entry separately reports its qualification and completed/unknown/not-submitted/unavailable outcome. It is the way to inspect FFT(B)'s true input after Save A → edit B → FFT(B) → Don't Save → reopen A; its presence in execution history does not adopt B into saved A. `query` remains the provider outcome query using the original request ID.

The command writes a frozen comparison plan before its child requests. A repeated comparison ID returns its existing immutable report; a changed ROI/recipe/version under the same ID is rejected. Missing partial reports recover each original child request by ID, never manufacture replacement request IDs. New work intentionally uses a new comparison ID.

Reads are bounded: at most 2,048 objects, 64 MiB cumulative JSON, 128 MiB per checked array, 512 reports per listing and 100 selected ROIs. A budget refusal is not permission to skip provenance checks. Select a narrower immutable snapshot or explicit report when appropriate.

## Explicit source proofs

Source proofs append metadata to the existing provider objects and request journal. They create no FFT, preview, calibration or measurement. `proof-create` and `proof-revoke` need an explicit Python and pre-saved request ID; an unknown response is recovered with `query --request-id ORIGINAL_ID`. `proof-info` is a fresh read and needs no Python or new request ID.

```powershell
node dist/tools/workbench_cli.mjs proof-create --workspace "F:\Research\analysis" --python "F:\Python\python.exe" --object-id EXACT_EXISTING_SOURCE_VIEW_ID --purpose saved_source --request-id source-check-001
node dist/tools/workbench_cli.mjs proof-info --workspace "F:\Research\analysis" --proof-id EXACT_RETURNED_PROOF_ID --proof-sha256 EXACT_MANIFEST_SHA256
```

For `--purpose fft_input`, `--object-id` names the original raw FFT and both `--input-relative-path` and `--input-sha256` name its exact original GUI sidecar. An old `unavailable` input stays unavailable; a new retrospective proof is separately reported and never becomes strict pre-execution evidence. A known existing or unresolved FFT stops `compare-rois --compute-missing` before computation, rather than creating a replacement.

`inspect` / `compare-rois` accept explicit `--proof-id` / `--proof-sha256`, or use exact references already saved in that analysis. No filesystem proof is automatically adopted. Proof coverage includes only its verified dependency members: a later annotation needs an explicit new proof even when its grid is unchanged. Missing, changed, withdrawn or unsupported evidence abstains; hashes are not signatures and current payload checks remain necessary.

To repair a **closed, clean** saved workspace, `proof-adopt --proof-id ID --proof-sha256 SHA --new-save-id NEW_ID` explicitly adopts a verified saved-source proof and publishes a new savepoint through existing ownership/CAS. `--replace-proof-id OLD_ID` replaces only that chosen reference. Open GUI ownership, drafts, recovery and unresolved requests/saves block this command. The old savepoint is unchanged; a repeated new-save ID queries that original save and does not repeat adoption. A now-withdrawn proof is reported separately from whether its save completed.

In GUI use “显示与高级设置 → 诊断与原请求恢复 → 持久来源证明” and “探索执行历史” to explicitly record, query and adopt proofs. Recording is not adoption, and adoption is an unsaved work edit until “保存工作区” / Ctrl+S. No proof action silently applies ROI drafts or repeats rejected scientific edits. See the [approved B contract](design/persistent-source-proof-121-20261104.md) for scope and withdrawal behavior.

## Validation scope

Scoped tests cover intent-before-submit, query-only repeats/unknowns, literal Unicode paths, exact reuse negatives, report tampering, explicit save versus legacy state and GUI-free entry. Public synthetic Windows CLI/provider evidence separately checks three ROIs, one reused plus two new FFTs, a second comparison with zero new FFTs, an explicit 8-pixel vector measure and unchanged source/frame/FFT hashes. This verifies transport, provenance and reuse, not automatic peak accuracy or physical interpretation. Browser gestures, installed clean-Windows use and private specimens are separate acceptance scopes.
