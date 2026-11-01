# Pre-Mac source baseline and platform qualification gate

Status snapshot: 2026-11-01. This is a **release gate/checklist**, not an execution report or a claim of macOS compatibility.

## Exact source and merge ancestry

- Reviewed GUI-first source: PR #49 `c02736f2f512be6fa6d102b3e27f5542cc35e9a4`.
- GitHub merge commits: #48 `cc41d4606f8097cb0b776bfd805801587c21258c`, #49 `14613c4f5fba5af941568d5c71413928c627bd9d`.
- Main at this audit: `14613c4f5fba5af941568d5c71413928c627bd9d`. Its Git tree matches merged #49's head tree `53da8b68e07b531326e2d7b8eb720a602f00e937`. **Refresh HEAD on every subsequent decision.**
- #44, #46 and #47 scientific implementation commits are ancestors of the merged integration tree. The obsolete stacked #46 PR was closed administratively on 2026-11-01 as superseded, **without a separate merge**. #45 is independent private data intake, **not part of this baseline**.
- No release tag is implied by an accepted PR or this document.

## What is qualified, and what is not

| Gate | Evidence/status | Consequence |
| --- | --- | --- |
| Final #49 PR-head Linux/Windows automated suite | 13 normal checks + 1 actual scattering/MCP check success at the reviewed PR HEAD; historical record in [GUI-first acceptance](GUI_FIRST_ROUND1_ACCEPTANCE.md) | Useful candidate evidence, **not a check on GitHub's later merge SHA** |
| Exact merged main checks | The merge SHA had no check-run or push-workflow result when audited on 2026-11-01. The accompanying maintenance PR adds `push: main` for portable CI and conditional optional scattering CI | Require fresh green checks on the **actual final main SHA**, or explicitly pin and run the existing manual workflows before freezing |
| Codex-operated browser, two ROIs, evidence attachment, revised peak, separate Agent and saved-record recovery | PASS, **public synthetic**; see [GUI-first round 1](GUI_FIRST_ROUND1_ACCEPTANCE.md) | Not proof of human usability, real-material interpretation or automatic Skill discovery |
| Public API Panel helper cold close/reopen | PASS for two distinct normal exits, saved hashes, `restored_unvalidated` snapshot and read-only Chrome view; see [integration closeout](GUI_FIRST_INTEGRATION_CLOSEOUT.md) | **Registered MCP Panel helper restart + same-window qualified reattachment remains HOLD** |
| Previously hosted macOS R3 arm64 smoke | PASS for pinned post-TypeScript R3 source, [historical Mac record](MACOS_R3_LIGHT_QUALIFICATION.md) | Does **not** qualify current #49 GUI, optional diffsims or the user's Mac |
| Actual macOS development checkout | NOT_TESTED for this mainline version | Required to accept migration on the target machine |
| Independent real-specimen physical correctness | HOLD under [Issue #43](https://github.com/wuchqwq/microscopy-workbench/issues/43) | Not a prerequisite for **moving development environments**, but do not claim specimen accuracy |

The automatic F4b visual feature proposals remain EXPERIMENTAL, with the original preregistered misses retained. A compatible finite projection is not a unique phase, twin or three-dimensional structure.

## Recommended freeze/migration sequence

1. Verify the actual GitHub `main` commit, its ancestry, merge commits, no unintended file loss and exact-HEAD automated results. The tests on #49's reviewed PR head must not be silently relabeled tests of a different SHA.
2. Keep production scientific object schemas, numeric tolerances, source arrays, old journals and frozen historical acceptance unchanged. No large GUI/science development before the migration checkpoint.
3. Finish a *separate local* registered-MCP Panel cold-process/reattachment test if the goal is to claim **full recovery qualification**. Do not forge an Inspector registration or treat its `panel_id=null` as a registered Panel. Missing this gate can remain a clearly documented limitation of the source checkpoint; it must not be marked PASS.
4. Pin the exact accepted source SHA and qualification matrix in a short closeout note. Ask the owner before creating a release Git tag. A source checkpoint can be designated for migration without claiming full scientific/desktop validation.
5. On macOS, do a **fresh clone and clean environment**, then qualify the current GUI and optional crystal tools. If a platform defect appears, fix it on a separate PR, preserving the source checkpoint and failure record.

## Mac local verification (Codex/operator; not executed here)

Use the **actual approved main SHA** rather than the historical hash above after any new merges. Protect existing worktrees, data, account settings and client MCP configurations.

```sh
git clone https://github.com/wuchqwq/microscopy-workbench.git microscopy-workbench-mac
cd microscopy-workbench-mac
git rev-parse HEAD
git status --short
uname -m
sw_vers
node --version
python3 --version
npm ci
npm run typecheck
npm test

python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-images.txt
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:science
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:compiled:compat
```

`npm test` invokes the build through `pretest`. `test:compiled:compat` may need full Git history; do not fabricate the frozen source if the checkout is shallow.

To qualify **optional explicit crystal evidence** (separate from the image-only Mac smoke), use the *same independent scientific Python environment* only after an isolated dependency install:

```sh
.venv/bin/python -m pip install -r requirements-structure-tools.txt
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:general-crystal
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:manual-crystal
```

For the GUI, generate a **new public synthetic fixture** through the existing `tools/qualify_manual_crystal_agent.py --prepare-fixture ABS_NEW_DIRECTORY` and launch the existing `npm run inspect -- --source ABS_TIFF --workspace ABS_NEW_WORKSPACE --python ABS_VENV_PYTHON`. Verify saved ROI reasons, correct/unknown XY scale, old FFT reuse, peak revision, comparison `needs_review`, original request recovery, actual browser refresh, and the cold-helper scope separately. Do not use unpublished material or upload private workspaces to public CI.

For a connected-Agent run, inspect the client's existing configuration and approvals first; connect the compiled standalone MCP and, when needed, the optional structure workspace without replacing unrelated entries. No GMS, Windows native bridge or mcp-dm dependency belongs in this core. Do not auto-install a plugin or change global authorizations to manufacture a test pass.

## Acceptance record to capture

Pin: commit SHA and Git tree, macOS build and architecture, Node/Python/resolved scientific versions, each test command/outcome, qualified GUI and Agent operations, source/FFT/recovery hashes, known failures, and `NOT_TESTED`/HOLD scopes. Treat failed or timed-out attempts as separate records, never as later successes. Human usability and Issue #43 material validity remain separate gates.
