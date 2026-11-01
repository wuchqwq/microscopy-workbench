# GUI-first integration closeout

This is review closeout, not a second GUI development round. The runtime GUI,
scientific algorithms, frozen thresholds and existing qualification limits stay
unchanged. The review of [#49](https://github.com/wuchqwq/microscopy-workbench/pull/49)
at `c02736f` supports the limited public-synthetic workflow, with no blocking
redesign request. Its GitHub state is **COMMENTED**, not a formal APPROVED review.

## Dependency and merge boundary

Refreshed 2026-11-01: origin/main is `9fbc769`; #48 is `95c40b9`; the reviewed
#49 implementation is `c02736f`. All remain separate until explicitly authorized.

| PR | Integration role |
| --- | --- |
| #44 / #46 / #47 | Already included in #48 ancestry; do not merge each again |
| #48 | Integration candidate targeting main |
| #49 | This GUI increment, targeting #48's `integration/manual-crystal-evidence` |
| #45 | Independent private-intake work; excluded |

An independent detached worktree rehearsed normal merge commits from exact main
to #48 and then #49. Both merges were conflict-free; the final tree was exactly
#49's tree `14cada35531c609140101d9fa410bbf34dc54fad`. The local rehearsal merge
commits were `7c3103c55bcf604ae64fbc829652cf0375a7c4cb` and
`476d4ebe31dd66b7f2c71496e3671ab28b24d18a`. They are local evidence, not GitHub
main commits. Both entrypoints passed syntax checks and the diff passed whitespace
checks. No original worktree was reset or overwritten.

Retargeting #49 to main **before #48 is merged** would include the parent feature
changes again (147 files / 11 commits at the reviewed HEAD, versus 42 / 1 against
#48). Therefore the existing base is retained. For an explicitly authorized
future merge: refresh all three refs, merge #48 with a merge commit, retarget #49
to that updated main, inspect the remaining diff/HEAD and CI, then merge #49.
Changed refs require a fresh integration check. No force push, tag or release.

## Frozen evidence and remaining gates

The [round-1 acceptance](GUI_FIRST_ROUND1_ACCEPTANCE.md) and its public JSON/CSV/
screenshots remain immutable historical evidence. Its 106 targeted passes, 371
lightweight passes / 6 conditional skips and 14 final-HEAD CI successes belong
to `c02736f`; they are not relabeled as tests of a later commit.

| Gate | Closeout treatment |
| --- | --- |
| Source/FFT hashes, signed scale, exact ROI/measurement provenance | Retain the executed numerical/MCP checks; no kernel or tolerance changes |
| Chrome gestures and fresh Agent sessions | Existing Codex-operated synthetic scope only; not human usability |
| Browser refresh / new tab | Existing PASS; distinct from helper-process restart |
| Helper-process cold restart | Execute a dedicated normal-close/reopen check; record separate PIDs, saved hashes and unvalidated status. Never infer current qualification from local snapshot JSON |
| Inspector-to-Agent evidence re-admission | Explicit integration boundary: the standalone inspector does not register its helper in the MCP PanelManager. Do not advertise an end-to-end cold-restart/readmission PASS |
| Non-unique ROI / incomplete support-pair inspection UX | Deferred hardening from review; keep warnings and original eligibility rules, no new selection policy in this closeout |
| Automatic plugin/Skill discovery, actual worker interruption, GUI CSV download | Keep their existing NOT_TESTED/unconfirmed scope; no substitute tests |
| Real-sample physical interpretation / human usability | HOLD / NOT_TESTED under #40 and #43 |

## Executed cold-helper check

Windows x64 / Node 24.16.0 / independent Python 3.13.2, using the existing public
synthetic workspace. The added runner is acceptance tooling only; it does not
register a product tool, modify the Inspector or add a GUI feature.

- **PASS, safe restore:** two distinct actual API helper processes, PID 28412
  and 32008. Both close through the existing `panel.close()` via the dedicated
  parent's owned IPC, with exit code 0/no signal; the wrapper also exits 0.
- **PASS, protected data:** all 428 existing scientific-object/request files and
  the original TIFF stay byte-identical. No new scientific object or FFT. Exact
  source/frame/calibration and original comparison request are preserved.
- **PASS, admission/read only:** real MCP/Python `image_info`, full
  `structure_info` and original `structure_result` verify existing records.
  That independent read does not make the reopened card current.
- **PASS, actual Chrome observation:** the separately retained first trial's
  reopened helper displayed the original image, two saved observations and
  **重连快照 · 待工具复核** in both header and evidence card. Codex performed this
  read-only browser check; no new human-operation qualification is claimed.
- **HOLD, formal same-window re-admission:** the public helper/Inspector has null
  `panel_id` and no PanelManager registration. No registry or qualification was
  invented. A new explicitly owned MCP Panel is a different route/window, not
  automatic recovery of the stopped Inspector.

The input was a previously provider-admitted saved snapshot. Each new API helper
already starts `restored_unvalidated`; this does **not** qualify the separate
live-current registered-MCP-helper → restart → current re-admission path.

The first harness trial's non-TTY stdin was closed, so its second helper could
not receive the normal-close command. Its normal second cleanup remains HOLD;
only the verified disposable test processes were forcibly cleaned. That failure
is retained. The final harness refuses non-TTY `--keep-open` before launching,
handles EOF/owned-close cleanup and was rerun in a real TTY with both helper
exits and wrapper exit verified. No forced cleanup is counted as normal PASS.

[Public result/failure scopes](validation/gui-first/cold-helper-closeout.json),
[actual screenshot](validation/gui-first/cold-helper-unvalidated.png) and
[separate artifact hashes](validation/gui-first/closeout-artifact-hashes.json)
are additions; the round-1 artifacts and their original hash manifest are intact.

Reproduce against an explicitly configured **public synthetic** saved workspace
with optional structure dependencies already available:

```text
npm run build
node dist/tools/smoke_panel_evidence_reopen.mjs --config ABS_PLUGIN_CONFIG_JSON
  --snapshot ABS_SAVED_PANEL_JSON --output NEW_ABSOLUTE_DIRECTORY
```

Supply all arguments on one shell command. The output directory must be new.
Default mode closes both dedicated helpers normally. Optional `--keep-open`
requires a real TTY; type `close-owned-helper` to finish normally after viewing.
No global client configuration is changed and no existing Panel is stopped.

Closeout checks: strict types/build PASS; lightweight Node **371 PASS / 6 existing
conditional SKIP / 377 total**; actual independent-environment science smoke PASS.
The exact final closeout HEAD/CI is recorded in #49. Stable-baseline freeze remains
**HOLD** at the missing re-admission/human/platform gates; a bounded Ready-for-review
PR is not a stable release claim.

## macOS migration preparation only

The [existing hosted arm64 R3 record](MACOS_R3_LIGHT_QUALIFICATION.md) is historical
evidence for its pinned source, not current #49 GUI qualification. Do not label
the present workbench, helper restart, optional ASE/diffsims provider or researcher
interaction as tested on a local Mac. No Mac CI was started by this closeout.

Use a separate clean checkout of an explicitly selected integration HEAD and a
separate Python environment. Record macOS/architecture, Node/Python and installed
scientific versions. Then run typecheck/build, affected/light Node tests and the
existing standalone science/compiled-compatibility checks. Only after those pass,
use the public synthetic fixture to exercise the GUI and helper restart.

Image-only requirements and optional structure/simulation requirements are
different environments/scopes. The existing image-only Mac workflow cannot
qualify the optional crystal-evidence path. Preserve user client configuration
and private experiment files; do not install dependencies into GMS Python.

No GUI layout, new button, new algorithm or new workflow framework is part of
this closeout. Further work requires a separately scoped task.
