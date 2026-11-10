# Named HRTEM export description evolution, 2026-11-06

Review base: `334fb5b3c0ded6ebf36b86e37b7affc1d4d1f1ac`.
The owner explicitly permits revising obsolete compatibility tests during rapid
iteration, while retaining real calling interfaces and saved evidence integrity.
This is one named prose contract correction, not a general description policy.

## Evidence and actual consumers

- `docs/R3_PRE_TS_BASELINE.md` calls frozen commit `3790b3d57e427010f0a5cbfce8a31143a7883eef`
  a research/MVP compatibility baseline, explicitly not a public release. It
  remains an immutable functional reference, not a promise to freeze all prose.
- `docs/F4_F2A_INTEGRATION.md` and `tests/compiled-baseline-compat.test.mjs`
  did explicitly require exact legacy descriptions. That was a real internal
  regression contract; the earlier restore complied with it. The test already
  has named, validated description evolution for preview, Panel and ancestry.
  There is no need to discard that protection for unrelated tools.
- `lib/runtime/stdio_mcp_server.mts` serves definitions on `tools/list` and calls
  `registry.call(params.name, params.arguments)` on `tools/call`.
  `lib/runtime/tool_registry.mts` indexes names, snapshots definitions and
  validates the input schema before executing the registered handler. It does
  not dispatch by description text. `lib/runtime/schema.mts` returns description
  metadata separately from its argument schema validator.
- `lib/image_workspace.mts` maps `image_export` to the existing `export` action;
  `lib/workbench_cli.mts` selects by name and validates `inputSchema`.
  `lib/tools/image_module.mts` retains the separate no-overwrite export contract.
  None of these inspected consumers compares this description byte for byte.
  This repository inspection cannot rule out unseen external clients. Models
  can use the description to select tools, so accurate capability and refusal
  guidance has practical value even though its bytes are not a request schema.
- `tools/image_workspace.py`, action `export`, already handles a saved
  `peak_roi_comparison` method plan and a discovery review. The existing direct
  `test_hrtem_baseline_closeout.py` checks actual report files, PNG/provenance,
  absence of parent GPA amplitude arrays, export refusal and exact reopen.
  The new wording explains implemented behavior; it changes no behavior.

## Three minimal strategies

| Strategy | Benefit | Cost / judgment |
| --- | --- | --- |
| Keep the frozen export wording, explain reports only on method/review tools | No compatibility-test change; useful advice remains available there | A caller inspecting the export tool alone misses its report support and GPA-array boundary. Valid earlier repair, but now unnecessarily restrictive. |
| Restore direct guidance with a named, exact description extension | Exposes actual report files and limitations at the action where users need them; retains precise regression guards | Requires one explicit test/document contract update. **Recommended and implemented.** |
| Add a versioned tool/schema or runtime negotiation | Appropriate if calling shape, output interpretation, persistence or identity actually diverges | No such divergence here. Adds redundant APIs/negotiation and maintenance for prose alone; not justified. |

No runtime, schema or saved-record version is added. The reviewed prose revision
is explicitly identified by `REPORT_EXPORT_GUIDANCE` in the compatibility test
and its Git commit. Any future non-prose change still needs its own justified
contract and migration review; this exception does not authorize it.

## Implemented narrow contract

`image_export.description` retains its entire frozen text, including existing
parent, no overwrite and non-DM-SaveAs requirements, then appends exactly:

> Saved-band comparison exports also include method-decision.json and available
> peak-comparison.txt; candidate-review exports include discovery-review.json and
> available candidate-review.txt. Report export does not include its parent GPA
> arrays; export each GPA object separately for amplitude/masks.

`normalizeNamedReportExportGuidance` requires exactly one named export tool in
both catalogs, asserts the exact untouched frozen description and the exact new
description, and deeply compares **all remaining export fields** with the
frozen tool. Only then does it normalize a comparison copy of that description.
The final entire retained-catalog comparison remains strict. It does not remove
all descriptions, ignore arbitrary new wording, modify the frozen Git object,
change the registry, accept schema drift or reinterpret historical data.

Direct negative controls reject removed/renamed/duplicate tools, dropped
refusals, false parent-array claims, arbitrary prose, changed required arguments,
argument types, extra properties, permissive schemas, added output metadata,
unrelated-tool description changes and rewritten frozen descriptions. The
actual old workspace/MCP test still verifies original results/IDs/context,
source and archived file hashes, export/continuation and no FFT replay.

The CI coverage additions and genuine fixture skips from the preceding repair
are unchanged. No private data/fixture was added; the original historical
fixture passes from that repair are prior evidence, not newly executed CI.

## Validation scope

Commands and final results are recorded in the external local review receipt.
Run `npm run build`, the **complete** `npm run test:compiled:compat`, affected
registry/method/discovery/evidence Node contracts and the existing direct
`test_hrtem_baseline_closeout.py` report export/reopen regression. No unrelated
science suite is needed for prose and compatibility-test-only changes.

| Executed check | Result |
| --- | --- |
| Build | PASS |
| Complete compiled compatibility entry point | 4/4 PASS, zero skips, 33.319 s; host execution with dedicated temporary directories |
| Registry/method/discovery/evidence Node contracts | 18/18 PASS, zero skips |
| Direct baseline closeout file | 3/3 PASS, zero skips, 100.946 s; six report export/reopen cases |
| Diff formatting and unchanged workflow/provider/runtime checks | PASS |
| Original handoff fixtures / full six-module portable suite | NOT RERUN this increment; preceding repair's 5 original passes and 30 portable passes / 5 genuine skips remain prior evidence |
| New remote CI, GUI, Mac, real material/dislocation evidence | NOT RUN |

No push, remote workflow rerun, PR mutation, E2E scientific analysis or software
installation is part of this increment. Real-user GUI, real material physics,
Mac and new Task B migration are not qualified by these checks.
