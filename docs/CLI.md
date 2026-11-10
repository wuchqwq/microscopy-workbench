# Headless analysis CLI

The CLI is a TypeScript entry over the existing image provider, schemas, numerical worker and original journals. It does not create a Panel, browser, Electron window or MCP server. Development use requires the repository's locked `npm ci`, `npm run build`, and an explicitly selected scientific Python environment. This is not a clean-Windows installer or phase-three distribution claim.

```powershell
node dist/tools/workbench_cli.mjs --help
node dist/tools/workbench_cli.mjs version
node dist/tools/workbench_cli.mjs doctor --workspace "F:\Research\分析 工作区" --python "F:\Scientific Python\python.exe"
```

Except help, stdout contains one versioned JSON response. Diagnostics belong on stderr; PNG/base64 is not printed. `version` and help need no Python/workspace. `doctor` checks required environment imports without creating image objects. Optional peak detection needs the existing SciPy dependency and is never substituted silently.

| Exit | Status | Meaning |
| --- | --- | --- |
| 0 | completed | Requested command completed; this does not certify physical interpretation |
| 2 | invalid_arguments | Invalid command/JSON/schema; fix input before a new request |
| 3 | conflict | Exact version/request/ownership conflict; inspect the bound version |
| 4 | failed | Known failure |
| 5 | outcome_unknown | Original operation may have executed; query its ID |
| 6 | unavailable | Environment or exact source evidence unavailable; existing/unresolved FFT is not missing |

## Explicit provider commands

Use an absolute JSON file, keeping Windows spaces/Chinese text in quoted arguments. Parameters are the existing provider schema; frame indexes are zero-based. Writes require an explicit `request_id`. The explicit allowlist includes import, frame, preview, FFT, peak candidates, measurement, calibration, annotation, context, export, ROI statistics/profiles, GPA/read and finite method plan/next/step plus info/evidence/read/query. No arbitrary JavaScript or Python is evaluated.

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

### ROI statistics, profiles and bounded evidence

| Tool via `tool --name` | Effect | Identity and input |
| --- | --- | --- |
| `image_statistics` | **Write:** saves scientific ROI statistics and its original request journal | Original `request_id`, exact input `object_id`, optional `rect` or FFT `frequency_rect`, explicit complex `component` when needed |
| `image_profile` | **Write:** saves straight width-one nearest-neighbor profile, coordinates, NPY/CSV and original journal | Original `request_id`, exact input, two `points`, coordinate space and component; `sample_count` 2–4096 |
| `image_evidence` | **Read:** bounded text projection, no new scientific object or request/CLI intent | Exact existing `object_id`, its `manifest_sha256`, `section`; optional bounded page. No new `request_id` is accepted; output may retain the original object's request ID |

For example, prepare separate ordinary JSON files using actual returned IDs:

```json
{"object_id":"EXACT_SAVED_INPUT_ID","rect":[0,0,64,64],"component":"raw","request_id":"region-A-statistics-001"}
```

```json
{"object_id":"EXACT_SAVED_INPUT_ID","points":[[0,0],[63,63]],"coordinate_space":"source_pixels","component":"raw","sample_count":64,"line_width":1,"interpolation":"nearest","request_id":"diagonal-profile-001"}
```

```json
{"object_id":"EXACT_RESULT_ID","manifest_sha256":"EXACT_64_HEX_MANIFEST_SHA256","section":"summary"}
```

```powershell
npm run mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_statistics --input "C:\Research\statistics.json"
npm run mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_profile --input "C:\Research\profile.json"
npm run mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_evidence --input "C:\Research\evidence.json"
```

Obtain the exact manifest hash from the existing `image_info` / `image_result`
compact response, or verify the original manifest bytes. A changed manifest
cannot be silently rebound. Evidence `summary` is an explicitly non-authoritative
projection; collection sections retain the existing 1–8-row page and offset
limits. These are the provider's existing algorithms, units and source/ROI/grid
contracts, with no display-gamma calculation or inferred intensity calibration.
Writing statistics/profile does not automatically adopt them into GUI research
metadata or publish an analysis savepoint. Explicit GUI save or an authorized
existing workspace preparation flow is still required. Query unknown writes
with their original IDs; do not create substitute requests to recover them.

A validated provider refusal of a requestless inspection (`image_evidence`,
`image_info`, or `image_source_proof_info`) is `status:"failed"` / exit **4**,
with its original machine-readable provider error code and
`error.submission_state:"read_only"`. For example a well-formed but mismatched
manifest hash preserves `EVIDENCE_MANIFEST_MISMATCH`. No scientific request or
intent is created, `request_id` is null, and no nonexistent recovery query is
recommended. This classification uses the inspection's effect and a validated
failure envelope, not that one error code. Unconfirmed/malformed transport is
not promoted to a definite provider refusal. `image_result` is deliberately
different: it queries an original write, so pending/unknown/lost write outcomes
retain exit **5**, the exact original ID and existing query-only recovery.

The coordinator's structured `executionCategory:"deadline"` also maps to
`outcome_unknown` / exit **5**: the wait budget expired while the operation may
still be running. For a write, keep its exact original request ID and query it;
do not repeat computation under a new ID. This uses the category, not words in
the error message. A definitive `read_only` refusal still returns exit4, and an
explicit `not_submitted` outcome is not promoted to uncertain execution. A
deadline alone proves neither successful mutation nor definite failure; a
requestless read has no scientific write ID to invent or recover.

### Inspect saved research state

`inspect` now includes exact optional `research_question`, `research_leads` and
`research_offline` metadata from the selected saved analysis. The three fields
are `null` for old savepoints where absent; no migration or writeback occurs.
The `--snapshot-object` route is object-only and returns no research metadata,
even when a saved/active analysis exists; it never borrows another context's
question. `research_state_scope` makes this distinction explicit.

Saved original responses/bindings and accepted researcher drafts/rejections
remain distinct, including offline-synthetic labels. Exact original questions,
result/request/input/frame IDs, hashes, proposal relations/reasons, unknowns and
planned next steps are returned without rewriting. This is saved metadata, not
fresh qualification of every advisory evidence reference, scientific verification,
model authentication, or execution of the next step. Use exact provider reads to
check referenced results. Same-frame A/B and same-source FFT/phase views are not
independent repeats and are not automatically weighted.

Inspect needs no Python, ownership lock or provider/model request. It validates
the existing saved content/reference contract, reads without publishing a save,
and does not query/restore/merge live GUI inputs. `working_gui_edits_read:false`
and `working_gui_state:"not_queried_may_differ_from_saved"` explicitly warn that
an active GUI or unsaved question/lead draft may differ. Output free text and
source references can contain private content; inspect does not sanitize them
or transmit them to an external model. This increment adds no CLI research
question/lead editor or automatic AI workflow.

## Explicit GPA and finite method path

The following five names are available through the existing `tool --name` command.
**All five are writes requiring an original request ID**, including read/plan/next.
They reuse provider schemas, algorithms and journals; there is no AI/model call.

| Tool | Actual effect and prerequisite |
| --- | --- |
| `image_gpa` | Scientific GPA record/arrays on an existing unwindowed external FFT, 64–512 pixels per axis; two explicit noncollinear g vectors, local reference, source-domain declaration and mask required |
| `image_gpa_read` | Scientific exact-sample table record from saved GPA arrays/masks; 1–64 integer local-grid points, invalid values null with reasons. Not a pointer probe or an amplitude/mask-array exporter |
| `image_method_plan` | Saved deterministic decision/report, references, diagnostics and finite budget root. Starts from 1–3 compatible saved `fixed_g` GPA records; does not dispatch science |
| `image_method_next` | New saved decision/report assessing all original attempt slots, including failed/unknown ones; optional justified information patch or explicit stop, never a budget reset or automatic execution |
| `image_method_step` | One selected saved action: reserves the original journal slot and cost before dispatching existing GPA or topology, then saves a parent/child receipt. Must use the plan's exact `next_request_id` |

For GPA, select `source_domain:"real_space_lattice"` only with an actual source or
explicit working assumption in `source_domain_text`. Unknown calibration permits
image-coordinate fields, not invented physical strain/angles. `fixed_g` and
`fit_reference` have different gauge/reference meanings; the finite method path
requires `fixed_g`. The reference is not thereby certified strain-free. GPA masks
and successful sampling do not verify material strain or defects. Use existing
`image_export` on GPA for the full scientific arrays/masks and provenance.

A bounded workflow uses ordinary JSON input files whose identities come from
actual preceding responses:

```powershell
npm run --silent mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_gpa --input "C:\Research\gpa.json"
npm run --silent mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_gpa_read --input "C:\Research\gpa-samples.json"
npm run --silent mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_method_plan --input "C:\Research\method-plan.json"
npm run --silent mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_method_step --input "C:\Research\method-step.json"
npm run --silent mwb -- tool --workspace "C:\Research\analysis" --python "C:\Python\python.exe" --name image_method_next --input "C:\Research\method-next.json"
```

1. Prepare the exact FFT with existing `image_fft`, `window:"none"` and explicit
   support/preprocessing. A Hann FFT or arbitrary raw image is not a GPA input.
   The selected independent Python needs `requirements-gpa.txt` (including
   scikit-image >=0.25,<0.27); CLI does not install a missing backend. `doctor`
   checks the base image stack, so its success does not qualify optional GPA
   dependencies.
2. GPA input retains that FFT ID, actual g source, mask and local half-open
   `reference_rect`. Sample input uses its returned GPA ID, explicit `points`
   and its own request ID. Do not read values from PNG colors.
3. A method plan declares all four budget caps: `method_calls`, `fft_pixels`
   (currently0), `gpa_band_pixels`, `topology_path_samples`. Existing seed FFT/GPA
   reuse is listed separately; this does not erase its historical cost. Under
   `information.goal:"projected_topology"`, executable proposals require explicit
   model assumptions and local nested oriented circuits; a GPA reflection
   follow-up additionally needs sourced follow-up g information. Missing
   information, quality limits or budget can correctly
   produce request-information/stop. Do not manufacture an action to force a step.
4. Inspect the saved proposal's action kind, `action_id`, root ID, cost and
   prerequisites. Fill step input with that exact plan `object_id`,
   `root_plan_id`, `action_id`, an actual `selection_reason`, and **the returned
   `next_request_id` as request_id**. CLI does not invent a substitute slot.
5. A completed parent step is not proof of child success: inspect
   `child_receipt.state/request_id/object_id/error`. Query an unknown original
   parent and its recorded child IDs; do not replay with new IDs. Failed/unknown
   reservations remain charged. `next` writes a new decision from the ledger,
   not a new FFT/GPA or automatic AI choice. Old proposals remain historical and
   stale snapshots cannot be forced through. A repeat of the identical CLI
   envelope only queries its original outcome, including after deadline.

The existing separate `peak_roi_comparison` goal compares saved GPA bands under
explicit ROI/reference assumptions without dispatch; it has **no scientific
method_step action**. This is not general raw-HRTEM entry. See the
[finite method contract](../skills/scientific-agent/microscopy-automation/references/method-loop.md).

Provider objects/journals are persisted across CLI processes; this does **not**
save an analysis workspace, adopt results into research leads or change active
GUI state. Explicit adoption and workspace saving remain separate existing
operations. Proposed relationships and multiple same-source views are not
independent experiments or material verification. The CLI qualification for this
increment uses a public contrast-only synthetic lattice, one GPA follow-up and
a subsequent bounded stop. It does not validate real materials, direct topology,
topology-child execution, every plan branch or GUI usability. `image_gpa_view`
and direct `image_topology` remain outside this CLI allowlist; no broader method
engine, domain/twin routing or model capability is implied.

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

`node dist/tools/workbench_cli.mjs host-demo` runs only the fixed local synthetic
host adapter diagnostic, without a workspace or provider. It accepts no extra
options or user data. Output explicitly says real Codex is not connected;
completed means the synthetic test finished, not AI analysis. The Electron help
menu shares this Node service. See [host boundary and limits](CODEX_HOST_ADAPTER.md).

Method recovery: Python's original method-result reader reads the original
journals/objects without updating them or removing the Node provider claim.
The full Node/CLI `query` has a narrower metadata side effect: after validating
an external **completed original request** with the exact queried request ID,
it attempts to remove a current provider claim with that same request ID, under
the existing metadata gate. This cleanup does not check owner close or compare
the claim nonce; it is the existing completed-result rule, not a general unlock
operation. It cannot remove a different request's claim. Cleanup may fail closed
while the completed result remains readable, so exit0 alone does not prove the
workspace is unlocked. Querying a completed child does not clear its parent's
differently identified claim. The owner's normal worker-close cleanup is a
separate path and does compare its original nonce.

`query --request-id ORIGINAL_STEP_ID` returns bounded `partial_results` for a
prepared method parent, including verified original child identity/outcome,
reservation and readable claim ownership. This diagnosis remains
`outcome_unknown` (exit5), does not finalize the parent, and does not clear its
claim. A completed child does **not** make the parent completed. Query only these
original IDs; never submit a replacement child.

If the original worker actually closes and the existing owner mechanism releases
its claim, `image_method_next` may create a new proposal from the original saved
plan/root using a verified terminal child. This is a metadata write with its own
explicit request ID, not a pure query or a replacement for the original IDs.
The original parent stays historical/prepared, its full reservation remains
charged, and the same root/budget is retained. A proposed next action is not an
executed computation. Unresolved children/reservations or a retained claim still
block continuation. There is no automatic cross-process parent reconciliation;
PID disappearance alone supplies no permission to clear a claim. Preserve the
journals and claim for diagnosis; do not delete locks, reset budgets or create a
new root to evade this state.

The opt-in `method-normal-close-qualification.test.mjs` uses new public synthetic
data, a real GPA child and real worker exit/close. A test-only hook omits parent
finalization, then returns normally with the unknown-result exit code1; Node's
existing close handler releases its own claim. Subsequent actual CLI queries and
same-root planning are checked without editing historical records or replaying
the child. This controlled omission is not hard-kill, host-death, concurrent
recovery, power-loss or cross-platform recovery qualification. It does not test
the completed-result cleanup of a retained claim; that rule above is described
from source. Set explicit `MICROSCOPY_PYTHON` and a fresh absolute
`MICROSCOPY_METHOD_CLOSE_EVIDENCE` directory to run this one qualification and
retain its raw outputs, lifecycle, IDs, costs and hashes.

New method plans record `reference_text_revision:2`. An inherited GPA reference
plus the full follow-up source must fit the existing GPA 2000-character limit.
Otherwise the plan saves all input unchanged and requests an explicit revision,
with no executable child. No source text is automatically truncated. Historical
plans without the field use revision1 for exact read validation; an oversized
legacy child is refused before dispatch, with a durable failed parent consuming
one method call and no child compute reservation, as for other preflight refusals.
Existing failed attempts and their charges are unchanged. A revised plan retains its original
root, information history and budget.

Scoped tests cover intent-before-submit, query-only repeats/unknowns, literal Unicode paths, exact reuse negatives, report tampering, explicit save versus legacy state and GUI-free entry. Public synthetic Windows CLI/provider evidence separately checks three ROIs, one reused plus two new FFTs, a second comparison with zero new FFTs, an explicit 8-pixel vector measure and unchanged source/frame/FFT hashes. This verifies transport, provenance and reuse, not automatic peak accuracy or physical interpretation. Browser gestures, installed clean-Windows use and private specimens are separate acceptance scopes.
