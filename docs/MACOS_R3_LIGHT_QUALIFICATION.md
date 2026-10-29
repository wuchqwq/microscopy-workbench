# macOS lightweight R3 qualification (post-TypeScript, pinned science baseline)

This page records a **platform smoke**, not an in-person MacBook test and not real-specimen phase/defect qualification.

## Source and runner identity

- Baseline: `349f2012b3a00c247f394e682f32b0f87ad64f40`, merged strict-TypeScript main and unmodified Python science.
- CI: `.github/workflows/macos-r3-light.yml`, macOS 15 runner; source code pinned to the baseline for the first trial, subsequent diagnostics derive from it.
- First GitHub Actions run: https://github.com/wuchqwq/microscopy-workbench/actions/runs/40958687844
- The first run used macOS 15.7.9 **arm64**, Node 22.23.2, Python 3.13.15. Typecheck/build succeeded; compiled Node: **294 PASS, 1 FAIL, 5 SKIP**. The failing test was the relocated MCP plugin catalog's **hard-coded 10 s timeout with empty captured stderr**. Python/R3 science steps were not reached in that run. This is not a successful Mac platform qualification.
- Follow-up diagnostic [40959015883](https://github.com/wuchqwq/microscopy-workbench/actions/runs/40959015883): isolated packaged startup and full Node **both reproduced the 10 s empty-stderr catalog timeout**. Independent R3/float32 numerical tests **31 PASS**, and the actual MCP→Python standalone science/FFT/Panel HTTP smoke **PASS**. The old-JS-workspace → relocated compiled-plugin test failed with `MCP exited:` and empty stderr before R3-field smoke could run.
- **Root-cause candidate:** macOS temporary paths commonly enter Node as `/var/folders/...` while ESM module URLs resolve the canonical `/private/var/folders/...`. The previous `path.resolve(process.argv[1])===fileURLToPath(import.meta.url)` guard silently omitted `runPluginCLI()` when the two strings differed, so the subprocess could exit with no stderr/stdout. It also affects the standalone/Panel/other guarded CLI entrypoints under aliased paths.
- **Validated fix:** compare canonical existing paths with `realpathSync.native` through a strict-TS helper, use it for compiled CLI entries and source shims, and add an ordinary Unix symlink regression. The frozen JS baseline remains byte-identical; the compatibility harness launches its old CLI through its canonical name while the candidate continues to exercise the noncanonical path.

## Final independent hosted Mac qualification

- **PASS:** [macOS arm64 run 40960860068](https://github.com/wuchqwq/microscopy-workbench/actions/runs/40960860068), post-fix candidate commit `a67f381f8ef78d56b3fd198c34f4406088529db8`.
- macOS **15.7.9 / arm64**; Node **22.23.2**, Python **3.13.15**; NumPy 2.5.4, SciPy 1.18.1, Pillow 12.3.0, tifffile 2026.10.15.
- Strict TS build; **296 Node PASS / 0 FAIL / 5 opt-in SKIP**; isolated startup 6 PASS; 31 independent Python R3/float32 tests PASS.
- Actual MCP→Python science: signed calibration, original FFT and independent direct DFT, measurement, export, restart recovery and Panel loopback HTTP PASS.
- Frozen JS workspace→copied compiled plugin: tool schema, original request/context, export/revision/Panel PASS; old files preserved, FFT not replayed.
- Actual R3 feature-field composition from public synthetic data: window/scale controls, DFT, source/FFT hashes, R2 mapping, named recovery and Panel PASS.
- Earlier failing runs remain visible and are **not** retroactively marked PASS. This is GitHub-hosted Apple Silicon macOS qualification, **not** an on-device GUI/real-specimen/native-plugin-mode test.


## What this scope validates when passing

1. Strict TS compile and compiled Node tests on the actual GitHub-hosted macOS runner.
2. NumPy/SciPy/tifffile/Pillow on macOS, independent spatial atlas, signature comparison and sparse field tests.
3. Actual MCP stdio → independent Python ROI/FFT/measurement/NPY, independent direct DFT, original-request recovery and Panel loopback HTTP.
4. A compiled plugin relocated to another directory reading a **public synthetic frozen JS workspace** without FFT replay.
5. Actual R3 field MCP/Python composition, numerical controls, signed float32, named context recovery and saved field Panel.
6. No changes to private user workspaces, desktop configuration or the separate Windows DM bridge.

**Not covered**: local machine/OS version, app sandbox/permissions, actual interactive macOS Safari/Chrome gestures, native model plugin-discovery flow, real experimental data, optional GMS/diffsims and material phase/defect conclusions.

## Optional on-device local smoke (not executed by this CI)

On your own Mac, use a **separate clean clone** of the merged fix on `main` (not the pre-fix commit `349f201` and not your active R3 development worktree):

```sh
git fetch origin
git switch main
git pull --ff-only origin main
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-images.txt
npm ci
npm run typecheck
npm test
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:science
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:compiled:compat
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:field
```

These commands create only public synthetic temporary workspaces. `test:compiled:compat` needs the old frozen Git commit in history; the CI checks out full history. If a shallow local checkout cannot find it, fetch the specific Git history rather than manufacturing a replacement baseline.

For **real Mac GUI** qualification, run the existing independent inspector on a public synthetic TIFF, inspect the displayed ROI/FFT, save and revise one measurement, and restart/reopen by task name. Use the existing documentation and actual absolute paths; keep UI tests and local permissions separate from the CI's Panel HTTP checks. Do not add or overwrite existing user MCP/Codex settings during this smoke.

If a Mac-only failure is discovered, keep the exact baseline failure record, fix it on a separate candidate branch, rerun both the affected test and numerical regression, and do not silently weaken scientific assertions, runtime guards or deadlines.
