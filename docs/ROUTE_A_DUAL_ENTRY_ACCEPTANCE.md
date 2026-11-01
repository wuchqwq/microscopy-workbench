# Route A: actual Agent analysis and isolated shared-workspace qualification

## Outcome

The executed examples demonstrate that an Agent can select a bounded analysis
from real tool-returned observations, report conditional periods and preferences,
retain unassessed reliability, revise an edited measurement, and leave two
geometrically compatible explicit candidates undecided. They do **not** establish
reliable unattended autonomy. Initial runs also exposed incomplete ROI handoffs,
invalid tool arguments and a potential indirect replay of an unresolved write.
Those failures remain in the evidence; development followups do not erase them.

Actual GUI gestures are **NOT_TESTED**. The browser tool denied the exact isolated
origin on four authorized attempts, including after the user changed permissions.
The user then deferred GUI access. No alternate browser/CDP/HTTP gesture workaround
was used. The protocol simulations below are explicitly not browser acceptance.

## Source and dependencies

This independent worktree integrates the reviewed #54 HEAD
`a6233f48dffbceea64d337fb8c4028ab489249cb` with the #68 semantics implementation
(`221c87a2b8ed7cbd98202debfbe49f4569507902`, based on #67/#66/#64/#63).
The original main remained `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`.
#65 is a separate noise qualification branch and was not blindly merged.
The shared development GUI/worktree and launch scripts were not edited.

The local merge reconciled three conflicts by preserving both the #54 interaction
gates and the new GPA/result-semantics cards/tests. A further local bug was
reproduced before correction: an automatically completed initial preview left
Panel last_operation.state=submitted, permanently blocking handoff. Commit
`53bafbf` settles only a matching, durably recorded completed response; unknown,
failed or newer requests are not cleared. Original real-Agent failure and the
failing regression are retained. This is a local receipt bookkeeping bug, not a
reason to weaken the scientific or workspace gates.

## Fixed test protocol and blinding

`tools/make_route_a_inputs.py` creates nine neutral-name public TIFF/tasks with
independent prescribed carrier geometry, fixed seeds and a separate assessor
truth file. Nonnegative ideal intensity is normalized to mean one and sampled
as independent Poisson electron counts at the stated mean dose where applicable.
This is a controlled synthetic texture/count model, not a complete microscope.

The initial nine-case matrix was fixed before model runs: clear two-direction
texture, weak texture, a close doublet, noise-only, missing calibration, mixed
periodicity, a numerical-valid boundary, revision, and projection-compatible
finite candidates. No seeds or true frequencies/expected answers were provided
to the tested Agent. The public material/calibration/candidate hypotheses were
explicitly supplied assumptions. The assessor inspected outputs before consulting
truth. Same-image processing variants are dependent checks.

`tools/qualify_route_a_agent.py` reuses the existing Codex CLI/MCP launch pattern.
It supplies the actual public Skills and actual MCP catalog, permits bounded
choices rather than a fixed scientific chain, and records requests, responses,
image blocks, final reasoning, task/Skill hashes and provider/source hashes.
There is no new production Agent runtime or candidate database. The original
allowlist omitted direct/batch candidate comparison; the explicit comparison
followup exposes those existing tools. This is documented as a test-scope fix.

All tested sessions used the CLI default model. Its actual model identity is not
reported by these traces; no named model is claimed for them. GPT-6 astra was
actually selected for the separate independent implementation review in #68.
Blinding was enforced through supplied context and audited tool use, not claimed
as an OS-level secret boundary. There were no shell/file/web or unpermitted MCP
operations in the recorded sessions. Public archives include assessor truth only
for retrospective review; it must not be fed to a future tested Agent.

## Actual cases

| Case | Observed behavior | Qualification and limit |
|---|---|---|
| r17, operator-first protocol | Inspector and Agent use the same image-provider workspace and exact Panel. A test operator saves a stable-ID central ROI through formal MCP; Agent reads it, preserves attribution, chooses Hann/none comparisons and two directions. | Conditional pixel periods; original selector is not relabelled as Agent or real human. Real GUI selection remains NOT_TESTED. |
| r29, Agent-first | Agent opens the explicitly supplied source and a Panel, chooses a central ROI and measures about 13.57 px. | No invented physical scale, SNR or error bar; window variants and conjugates are dependent. Initial anonymous ROI could not be handed off. |
| r42, weak texture | Agent favors a persistent ~13.5 px candidate and retains a measured extra ~4.731 px candidate as weaker/unknown; notices return-cap truncation. | The extra maximum is not a certified true signal. No noise significance or false-positive rate was established. |
| r08, close doublet | Agent chooses two supports, reports a changing-contrast carrier and processing sensitivity. | The hidden components are only 0.225 bin apart in each selected 96 px support. Refinement is not called resolution, and apparent frequency differences are not called strain. |
| r63, noise-only | Random maxima are measured as conditional image candidates; no forced lattice/phase claim. | Original preview parse error remains unexplained. Opening the same frame's Panel subsequently caused a near-equivalent preview: the no-replay criterion was not met. |
| r51, mixed periods | Multiple frequency families and physical-source alternatives remain explicit. | A note exceeded the advertised schema length and was not saved. The failed note is not credited as evidence. |
| r74, numerical valid | Initial image analysis did not read a valid feature object; a separate actual MCP staging operation then supplied immutable atlas/feature references. | In fresh continuation, Agent reads actual valid plus v1 layers, calls it numerical descriptor admission, and retains reliability/physical origin unknown. No new FFT in that continuation. |
| r36, correction | A test operator edits an actual saved peak by +0.001 cycles/pixel. Existing reader marks old measurement needs_remeasurement. Fresh Agent rereads, remeasures the edited coordinate, updates its label and preserves old values. | New period ~13.414 px is conditional on the edit; Agent does not claim the edit is more accurate. GUI editing remains NOT_TESTED. |
| r95, finite candidates | Initial generic task stopped after image analysis. Explicit followup executes two ASE/diffsims simulations and a batch comparison using existing three measurements and fixed registration. | Both candidates match the selected positions and each has five unmatched simulated points. Agent preserves ambiguity and refuses to use unmodelled FFT/simulation intensity differences to identify Cu/Ni. |

Detailed actual object/request IDs, numeric errors, payload/journal verification,
failed calls and claim scopes are in
`route_a_integration_evidence/independent-agent-assessment.md`.
The r17 path was additionally checked by the main executor: its actual ten calls
start with image_panel_current, read the stable test-operator ROI, compute two
chosen FFTs/peak tables, save two measurements, and reread before guarded display.
Its final source/calibration and selector claims match the saved records.

## Development followups and remaining negative findings

Five followups are separate from the initial matrix, not held-out tests or causal
proof of Skill improvement: r36 remeasurement, r74 valid-context reading, r95
explicit candidate comparison, r29 resumable ROI, and r63 unknown-request recovery.

The Skills now state actual operational prerequisites: use stable annotation_id
for resumable selections; verify returned handoff usability; keep notes within
the advertised limit; and recognize that image_panel_open can create a preview.
Anonymous historical annotations remain valid display records and are not backfilled.
A new r29 revision preserved the old note/anchor and achieved usable=true without
recomputing FFTs. A fresh r63 recovery performed only five read calls and no
writes, leaving its original request unknown. Neither result erases the original
handoff or indirect-replay failure, and neither establishes general reliability.

Known schema rejections (overlong note) and the r95 comparison's known durable
failure on a spatial current-image binding are distinguishable from the r63
parse/transport error. The former were corrected with changed, valid requests;
the latter does not establish whether a side effect was submitted. No numerical
algorithm bug is inferred from these interface failures. The launcher now records
item.status/result_is_error explicitly: error=null alone is not tool success.
Original earlier summaries are not rewritten; runs.json re-assesses original raw
traces with this corrected reporting rule.

## Executed checks and artifacts

- Locked `npm ci`, typecheck/build; full integrated Node suite **449 PASS / 5
  conditional SKIP**. Nine fixture/launcher tests passed. New intervention unit
  tests and existing dirty/pending/late-result guards remain distinct from GUI.
- Both updated Skills passed skill-creator quick_validate with the locked scientific interpreter (the first system-Python invocation lacked PyYAML; no repository dependency was changed).
- Integrated `npm run test:science` passed actual TIFF/calibration/FFT/measurement,
  direct-DFT/export, saved-display revision, restart recovery and Panel HTTP.
- The #68 qualification separately includes 93 relevant Python tests and its
  80-call formal MCP/ASE/diffsims/frozen-history chain; do not count those again
  as independent physical evidence here.
- **15 actual model sessions, 191 MCP call events, 9 failed events** including
  expected original-ID absence queries and invalid arguments. All sources and
  previously existing provider files retained their hashes. No unfinished MCP
  events or prohibited non-MCP actions were observed. These are engineering
  observations, not a success probability or calibrated scientific error rate.
- Both entry paths and all continuations used the same isolated
  `analysis/science-workspace/images` provider. Scientific records are immutable;
  Panel selection/currentness is separate guarded presentation state.
- `tools/qualify_route_a_intervention.mts` is a test-only protocol controller.
  It names test_operator_protocol_simulation, verifies source and exact Panel,
  tests stale-show rejection and original unknown-ID query, and never claims
  browser or human gestures. Consistently incorrect supplied physical calibration
  cannot be identified from these single images; only binding/revision/domain
  errors are tested by the existing guards.

The `.tar.xz` archives contain complete synthetic scientific object/request files
and capability-redacted trace copies, public inputs, separate assessor truth and
staging records. The manifest binds both private original and published log hashes.
Original raw logs remain under the recorded analysis paths. Archives are for
inspection/hash verification; do not rewrite absolute paths inside old manifests
to fabricate recovery. Rerun the fixture/launcher with new output/workspace paths.
The final runtime inventory is explicitly a final snapshot, not a retroactive
per-model runtime freeze. Per-run task/Skill hashes and owning scientific module
hashes are retained. No confidence is inferred from the model's reported identity.

## Four separate scientific categories and next work

1. **Implementation bugs:** selection-origin attribution, bounded-delivery gaps
   and the initial-preview receipt state were reproduced and fixed. Parse failure
   cause is unresolved; it is not labelled a proven numerical bug.
2. **Measurement uncertainty:** weak/noise maxima, finite-window localization and
   unresolved doublets remain conditional or unassessed. Descriptive synthetic
   errors in the independent report are not experimental uncertainty estimates.
3. **Method limits:** texture is not automatically a material lattice; candidate
   intensity/model assumptions, single-domain strain and topological material
   interpretations were not newly qualified. Advanced tools remain optional.
4. **Non-identifiability:** different atomic candidates can fit the same projected
   positions. The observed compatibility does not resolve chemical identity,
   unique phase, twin, defect or three-dimensional structure.

Highest priorities: (1) finish real GUI gestures when the origin permission works;
(2) test unknown-write recovery and resumable selections on new, independently
specified tasks before treating unattended operation as reliable; (3) preserve
scoped uncertainty/finite-candidate comparison rather than adding an unqualified
universal peak detector or mandatory whole-image pipeline. A broader automatic
replay gate or new evidence definition would need a separate design discussion;
this increment does not introduce that architecture.
