# F4-lite: explicit, budgeted next observations

The active-analysis tools let an Agent decide what to inspect next while the
provider supplies deterministic candidate actions and scientific records.
There is no hidden model call, calibrated probability or information-gain claim.
Existing image tools remain directly callable.
This increment ships in the `microscopy-workbench` 0.6.0 plugin candidate. It
uses the explicit independent image provider; it neither calls a DM private ABI
nor switches to another backend after a failed operation.

## One inspectable loop

1. Open a supported real spatial input, select its frame and make a bounded
   `image_spatial_field`. Compute `image_domain_map` with explicit reciprocal
   tolerance and finite rotation hypotheses.
2. Call `image_analysis_candidates` on that saved domain map with a total
   window/FFT-pixel budget. Read the reasons, source coordinates, proposed
   scale, estimated cost, exploration reservation and stopping decision.
3. Choose 1–4 explicit action IDs from the saved proposal. Call
   `image_field_extend` on the exact field using that proposal and those IDs.
   A direct explicit ROI list is also available for a deliberate correction;
   record why it differs from the recommendation.
4. Compute the new domain map and ask for candidates again. Stop when the
   recorded rule says budget exhausted, no meaningful legal action, repeated
   lack of new usable evidence, data-quality limitation, or user stop.

Save every write request ID before submitting it. A timeout or cancellation is
not permission to replay a side effect. Query `image_result` with the original
ID; partial receipts and incomplete requests are not successful field updates.

## Scientific boundaries

New windows reuse the selected source, calibration, FFT and detector settings.
Old observations retain their exact FFT/peak/measurement identities and hashes.
Equality is based on scientific source/ROI/settings identities, not sample
order, peak rank or a display label. Duplicate or stale actions are rejected
before new scientific children are submitted. Bounds remain 32 cumulative
windows and 4,194,304 cumulative FFT pixels, with the existing depth limits.
The combined field revision/extension depth is at most seven, leaving room for
its domain-map dependency. An exhausted depth is a refusal, not permission to
flatten away history. Total budgets include the initial observations.

For a saved measurement correction, `image_field_extend` accepts an empty
`rects` list and explicit `measurement_overrides` keyed by the saved scientific
`observation_key`. Supply the complete revised measurement list for each changed
observation. This changes the feature/measurement evidence, not its source ROI,
FFT or peak detector output, and creates no new spectrum. A presentation sample
index is not a cross-version key. Recompute the dependent map and proposal after
the correction; old records remain readable.

Candidate priority combines existing differences, finite boundary support,
mixed or scale-sensitive evidence, incomplete coverage and explicit cost.
Exploration is retained even when the initial field appears uniform: no detected
change is not evidence that a narrow structure is absent. Lower signal does
not justify unlimited refinement. The status separates quality-limited evidence
from a position/scale that has not yet been adequately observed; neither is a
physical confidence estimate.

Zero-angle orientation differences and compatibility after explicit candidate
rotations remain distinct. Added observations may revise a geometric candidate;
they do not confirm a phase, twin, dislocation, physical boundary resolution or
absence of an unresolved component. Missing XY scale remains pixel geometry.

## Review and recovery

Open the saved proposal, extended field or updated map through the existing
Panel tools. Use their exact source-bound views and FFT references. Do not use
the display PNG as numerical input. Save the current experiment, field, domain
map and active proposal in the named AnalysisContext. On reconnect, read that
context and resolve original provider records rather than recomputing spectra.
The current reference roles are `spatial_field`, `domains` and `active_plan`.
Promote a changed field before its dependent map and proposal, using observed
CAS revisions; a late result cannot overwrite a newer current selection.

The public acceptance generator has a separate oracle used only after tool
execution. Fixed-budget comparisons charge every initial/new FFT and report
decision, validation, I/O and rendering costs as actually measured. Uniform,
seeded stratified and active sampling use the same scientific engine; identical
FFT output is not a demonstration that an active strategy is better.

See [F4-lite acceptance](F4_LITE_ACCEPTANCE.md) for executed scopes, misses and
remaining limitations. F1a's historical failures remain in its own record.

## Bounded delivery and opt-in support graphs

`image_spatial_field`, `image_field_extend`, `image_domain_map`,
`image_analysis_candidates`, `image_info` and `image_result` accept optional
`response_detail:"compact"`. Default/`"full"` retains the existing complete
response. Compact delivery is explicitly tagged
`evidence_format:"image-evidence-summary-v1"`, `authoritative_record:false`, and
binds its original object/request with `manifest_sha256`; scientific settings,
references, quality, budgets, stops and executable proposal actions remain
inspectable. This delivery choice does not change a scientific request's
journal parameters, identity, source arrays or original full receipt.
Compact responses are text evidence and retain `preview_ref` instead of repeatedly inlining the PNG.
Request an explicit full read-only image or inspect the Panel when a picture is needed; default full/Panel image content is unchanged.

Read selected exact evidence with `image_evidence` using that `object_id` and
`manifest_sha256`. Allowed `section` values are `summary`, `samples`, `actions`,
`neighbors`, `domains`, `boundary_bands` and `increment_history`; `offset` is
0–4096 and `limit` is 1–8. Detail delivery is bounded to 128 KiB and refuses
excess instead of silently truncating it. It validates the original scientific
record and dependencies; the projection is not a replacement authority. Expand
only the rows needed for a decision rather than repeatedly requesting every
full recursive field. Full original evidence remains available.

If optional compact delivery reports `authoritative_record_state:"completed"`
after a write, that scientific operation is already saved. Query its returned
original request ID with full delivery or read bounded evidence; do not repeat
the write to obtain a summary.

For a new irregular domain map explicitly set
`neighbor_policy:"support_contact_v1"`. It adds same-scale overlap and positive
shared-edge support relations while retaining distinct gaps, corner contacts,
scales and unknown measurements. Omitted/default `legacy_cardinal_v1` preserves
historical maps. The explicit policy versions the graph interpretation; it does
not improve the physical precision of a window-support band. See
[bounded closeout acceptance](F4_LITE_CLOSEOUT_ACCEPTANCE.md) for actual scopes
and the small GUI-to-science revision path.

## Reproduce the finite public acceptance

Use an independent Python environment with the project's science dependencies;
DigitalMicrograph is not involved. In PowerShell, select that interpreter and a
new, empty evidence directory, then run the compiled package:

```powershell
$env:MICROSCOPY_PYTHON = 'C:/path/to/science-env/Scripts/python.exe'
npm run build
$env:MICROSCOPY_SMOKE_OUTPUT = 'C:/path/to/new-f4-evidence'
node dist/tools/smoke_active_analysis.mjs
```

The output contains the separate analytic oracle, authoritative workspace
journals, `report.json`, `benchmark.csv`, `observations.csv`, field/domain
scientific exports and provider preview PNGs. It intentionally recomputes each
baseline's initial observations so equal-budget accounting includes them.
This is a scientific protocol acceptance client, not proof of browser gestures
or a model choosing an action; those scopes require their own recorded runs.
