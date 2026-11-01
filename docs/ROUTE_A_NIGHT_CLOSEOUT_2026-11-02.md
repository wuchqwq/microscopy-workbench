# Route A nightly integration and next-session handoff

Date: 2026-11-02. The owner authorized consolidating the reviewed evening PRs, fixing small issues, and leaving larger work in issues. This document records **integration scope**, not a new physical-science or browser qualification. The final merge SHA and exact-HEAD check results belong in the integration PR receipt; do not infer a pass from this file.

## Source and strategy

Unchanged starting main / Mac core checkpoint: `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`. Existing baseline refs/tags must not be moved.

The integration branch starts at reviewed #69 `b831714eb1b375929745fc30edb934a2de54803a`, which already contains #54 and the #57→#58→#59→#60→#61→#63→#64→#66→#67→#68 chain. Independent #65 and historical audit/proposal PRs #53/#55/#56/#62 are merged with merge commits, preserving ancestry rather than replaying the same patches. #45 private-specimen intake is older, independent and deliberately excluded.

| PR | Original reviewed HEAD | Role |
| --- | --- | --- |
| #53 | `79e19f488e6ef5f514ab47c4772660d840aceb9e` | First audit and original counterexamples |
| #54 | `a6233f48dffbceea64d337fb8c4028ab489249cb` | Human edit and durable handoff protection, already in #69 |
| #55 | `6c24dd7385cef2ca79b59460767e7fe8278c7732` | Second independent scientific audit |
| #56 | `868640709956f22e961bced773dd90a2d769c723` | Historical versioned-evidence proposal |
| #57 | `4141225653b41b134a76c5b2119888c01c481f54` | Scientific interpretation and correlated error semantics |
| #58 | `b238f9722b31c2959c871bba210c87977d94c2a8` | Bounded GPA evidence delivery |
| #59 | `f05b32f5ee659ce0fbab97998f6048364e56a454` | Site occupancy persistence/admission |
| #60 | `7b48520a92fb086dbf29572a49c580bdb7292b64` | Fourier support dependency checks |
| #61 | `31e0edeca7a9e07b8ec575e0781dfea5dec1ab0a` | Versioned numerical peak admission |
| #62 | `37bba352ab9e2849a048cefda010842c04f657db` | Scoped repair audit |
| #63 | `3d59c2b5cc4d90e9cbbb7d5475d5b0b42617880a` | Full-FFT/DC roundoff accounting |
| #64 | `7f0e523ba287de11c0913abd68f553655f008182` | Peak-quality literature and Skill |
| #65 | `bb8e5066dea7a4f7cd99a588cf880ad918050604` | Independent controlled-noise tests and preserved evidence |
| #66 | `4b16ea6a719ad11d001905144a9b3b1c9b621217` | Status audit and additive three-layer contract |
| #67 | `0cb13263bf03e31592295d821fe663166d4cec8b` | Declared ROI selector origin |
| #68 | `221c87a2b8ed7cbd98202debfbe49f4569507902` | Saved result semantics / MCP / Panel |
| #69 | `b831714eb1b375929745fc30edb934a2de54803a` | Shared-workspace integration and bounded real Agent evidence |

The preserved reports are source-pinned **historical** records. Statements that a PR was unmerged, a later bug was unresolved, or an operation was not tested describe those specific snapshots. Never rewrite those original failures or turn them into later passes. #61's additional DC counterexample was addressed by #63; #65's open state-separation design was subsequently addressed by #66–#68. Per-peak statistical certification remains out of scope.

## Small closeout correction

Clarify the peak-quality Skill's window/mean wording. Without mean subtraction, a constant background contributes the window spectrum. With arithmetic-mean subtraction before Hann, the original constant background cancels, but a mean-subtracted impulse times the window generally still has non-flat non-DC amplitude. The #65 oracle already handles these cases; no numerical algorithm, scientific threshold, schema or saved result is changed by this wording correction.

## Accepted product scope

Route A is a **supervised, on-demand analysis assistant**: GUI-first or Agent-first, explicit original images/ROIs, sourced calibration, conditional period/direction measurements and a finite set of explanations. Tools retain numerical results and assessed/unassessed reliability; Agent or researcher preferences remain declared interpretations, not physical certification. No mandatory whole-image field, autonomous experiment planning, general Agent framework or Route B detector is introduced.

New metadata does not reinterpret old `valid` states or fill absent historical fields. Partial/mixed occupancy remains representable but unsupported qualified simulations refuse it; refusal does not eliminate the physical candidate. Different saved objects/filter centers do not establish independent evidence. The roundoff policy is not a certified FFT error bound, SNR or per-peak significance test.

## Next-session priorities

1. [#70 — unknown-write indirect preview replay](https://github.com/wuchqwq/microscopy-workbench/issues/70): diagnose the r63 parse/submission boundary; inject not-submitted, submitted-no-receipt and completed-response-lost cases. Do not treat NOT_FOUND as proof nothing ran, or use `image_panel_open` as a hidden retry. A general cross-entry deduplication/state-machine redesign requires discussion before implementation.
2. [#71 — authorized real browser qualification](https://github.com/wuchqwq/microscopy-workbench/issues/71): finish actual dual-entry gestures and late-result/user-edit interactions on integrated main. Previous origin denial is not a proven GUI defect. Do not bypass denied access; DOM/HTTP/protocol controls do not replace browser evidence.
3. [#72 — resumable selections, bounded notes and fresh tasks](https://github.com/wuchqwq/microscopy-workbench/issues/72): make new continuation-intended annotations reliably identifiable, preserve anonymous history, avoid overlong unsaved notes, then run small fresh tasks on a fixed final version without leaking truth or outcome prompts.

These issues remain OPEN after integration. The original 15 model sessions / 191 MCP events include failures and development followups; they do not establish unattended reliability. No new model/browser/human/real-specimen qualification is implied by merge or CI. Issue #40 retains broader interruption/platform scope and #43 remains the separate real-specimen track.

## Integration gate and local continuation

Require final integration-HEAD CI, then the **actual main merge SHA's own push checks**. Keep both #65 noise/oracle jobs and #69 result-semantics/selection/Agent-launcher regressions in `.github/workflows/quick.yml`; never resolve integration by choosing one side's test catalog. Production science code must match the reviewed #69 tree except a separately documented, tested fix.

Local continuation: read AGENTS.md and the three issues, fetch the final main, record SHA/tree, preserve existing worktrees and private data, and develop in separate small branches. Use normal Codex approvals and on-demand MCP; do not alter global keys/settings or specify a mandatory model. Reproduce before fixing, keep failures, and distinguish implementation bugs, uncertainty, method limits and non-identifiability. Architectural changes are discussed first.

This checkpoint is not a new release/tag and does not modify the older Mac core baseline. #45 remains open for a separately authorized intake/conflict review rather than being silently included in tonight's algorithm/GUI consolidation.
