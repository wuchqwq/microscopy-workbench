# Local Agent handoff: relationship, execution and reuse

The copyable multi-ROI summary now reads the existing read-only
`/api/execution-history` projection alongside the version-checked ROI handoff.
It does not send the summary, query a model, run a tool or create a result.

- `status` / `validation_status` in the original ROI/FFT handoff still describe
  saved relationships. Their provider contract and eligibility gates are unchanged.
- `execution_evidence` is a presentation-only whitelist of the existing
  `PanelExecutionInputHistory`: original request, frozen input path/hash, exact
  FFT/input/frame, float ROI/support, recipe, original execution status, frozen
  input qualification, provider record status and reason. A unique exact FFT
  record must also match the saved input/frame/support and any known float ROI.
- `strict_reuse_eligibility: unknown` deliberately grants no permission. This
  summary does not run `findReusableFft` / `verifyFftInputAssociation` for a requested
  scope. Even a validated frozen input is insufficient to assert strict reuse
  for an arbitrary ROI/calibration/recipe. A frozen input marked unavailable
  remains unavailable on that evidence route; completed execution remains a fact.

Legacy handoffs without a multi-ROI packet also explicitly label unreported
execution/reuse information unknown.

Missing, failed, legacy, ambiguous or unbound history is explicitly unknown;
relation validation is never substituted for execution or input qualification.
An unavailable relation cannot erase independently checked completion. No absence
or unavailable qualification licenses replacement/replay. Exact refs are retained
for the existing readers; same-source results do not gain independent weight.

Fact sources: `tools/image_panel.mts` (`inspectRoiHandoff` and history GET),
`lib/panel_execution_inputs.mts` (`inspect`/`listPanelExecutionInputs`),
`lib/workbench_cli.mts` (`findReusableFft`/`findReusableFftResult`).
Issue context: https://github.com/wuchqwq/microscopy-workbench/issues/121.
Long-history proof-budget unification remains a separate design decision; this
change adds no qualification contract and does not change budgets or old evidence.

Validation is offline synthetic protocol/UI data, not a reconstructed scientific
65/80-record case, real provider calculation, model run or native Electron test.

The final auxiliary history read is followed by a fresh complete `/api/state`
read. Local draft/source gates are checked again, and the full authoritative
snapshot must equal the one used for the ROI packet. Otherwise no new handoff
is displayed; the caller may explicitly prepare a fresh handoff. No new question
is spliced into an old packet. Metadata-only polling synchronizes an applied
question and invalidates in-flight handoffs while the existing editor keeps
local unsubmitted text and unknown/saving phases. The last check and rendering
are synchronous; later server changes still require the normal fresh read by
the receiving Agent. This copyable snapshot is not a server-side lock or grant.
