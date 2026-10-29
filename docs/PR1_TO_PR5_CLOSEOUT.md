# PR #1–#5 integrated closeout

Issue [#6](https://github.com/wuchqwq/microscopy-workbench/issues/6), Windows,
2026-10-29. **PASS within the bounded synthetic scope below.**

Researchers can use the model-free Inspector to open TIFF or supported DM
files, select an ROI, compute a real-input FFT, retain and revise multiple
measurements, inspect original-value profiles/statistics, and export/reopen
scientific data and paper figures. Ordinary complex DM files retain both
components and have explicit display/numeric components. DM/GMS is not needed.

## Commits and merge gates

The feature integration main is **`b0b40c0d88f6adcaa4213f70a2ddd672f40ab0a0`**,
tree **`940fc6bd13955933d9bc69efa3d922b91514abe4`**. The report and public
synthetic evidence are a subsequent documentation-only commit; they do not
change this qualified scientific/UI implementation. The repository tip that
publishes this report is available with `git rev-parse origin/main`.

| PR | Reviewed head | Merge commit on main |
| --- | --- | --- |
| #1, already merged before this task | `5c3b3e92d6e0850accbadef810bea692388ba21a` | `0fcbdcb845742c80d3e080fc054f4c3dac8fa8e8` |
| #2, including the closeout P1 fix | `3dc8dbc19ce9d5fb34ccaf95b564101eb3884255` | `a803c538900eb778c434f46673085871f6b8dfe2` |
| #3 | `5926f6896c19419e1f8712d3c68f27a88c36729d` | `1bee773e7cdbcca74f999e3da96aedf7595cc5dd` |
| #4 | `186f3b19723ef52f8925e77957e260726638f34d` | `3c63109769963c1d764900b03ceb2e6bc46c84dd` |
| #5 | `d5dbd0efe39138925c7765c0e984836edbe0d681` | `b0b40c0d88f6adcaa4213f70a2ddd672f40ab0a0` |

All four merges used merge commits, in #2 → #3 → #4 → #5 order. #1 was not
remerged. Before each merge, remote refs, head, base, remaining three-dot diff,
merge-tree and CI were checked. #4 and #5 were retargeted to main only after
their upstream merged; their remaining diffs stayed 20 files/one commit and
29 files/four commits. No branch was deleted or force-pushed.

The original disposable combination was `43db471` / tree `c083f65a`. After
the P1 fix it was `ae2ac9a1d277ea1fa8a80101a70a8431f16e612c` / tree
`940fc6bd13955933d9bc69efa3d922b91514abe4`. Final feature main has exactly
that latter tree (`git diff --exit-code`), including all four increments.
Six pre-existing worktrees were clean at entry and were preserved. #2 received
only the reviewed fix below; the old mcp-dm checkout was not changed.

Pinned source-head CI: [#2](https://github.com/wuchqwq/microscopy-workbench/actions/runs/40870420435),
[#3](https://github.com/wuchqwq/microscopy-workbench/actions/runs/40828286591),
[#4](https://github.com/wuchqwq/microscopy-workbench/actions/runs/40834840367),
[#5](https://github.com/wuchqwq/microscopy-workbench/actions/runs/40845286591)
all PASS. These are the actual PR-head runs, not invented CI runs of later
merge commits. Final-main Windows execution is reported separately below.

## Actual final-main execution

Windows 11, Node 24.16.0, independent Python 3.13.2, NumPy 2.5.4,
SciPy 1.18.1, Pillow 12.3.0, RosettaSciIO 0.15.0. No dependency was installed
in GMS Python. RosettaSciIO remains the optional external GPL reader, not a
vendored decoder or a native-DM fallback.

| Complete command on feature main | Actual result |
| --- | --- |
| `npm test` | PASS: 257 passed, 4 pre-existing opt-in skips, 0 failed; PowerShell fake-client entrypoint tests actually ran |
| `python -B tests/dm4_import_test.py` | PASS: all 5 cases, 54.881 s, exit 0 |
| `python -B tests/dm_planes_test.py` | PASS: all 6 cases, 88.565 s, exit 0 |
| `python -B tests/dm_complex_test.py` | PASS: all 4 cases, 79.007 s, exit 0 |
| `npm run test:science` | PASS: actual TIFF stdio/Python, signed calibration, direct DFT, recovery and HTTP |
| `npm run test:dm4` | PASS: actual uint32/max, file calibration, exact NPY and original-ID recovery |
| `npm run test:dm-planes` | PASS: actual DM3, explicit transposed plane, profile/FFT, direct DFT, NPY and recovery |
| `npm run test:complex` | PASS: raw complex values, explicit component numerics, refusals, export, new-client recovery, Panel/Figure/CLI |

The four opt-in skips are additional provider table, uncalibrated table,
numeric-probe and clean-PNG fixtures. They remain SKIP; the real backend
smokes and Chrome trials in this report were executed independently.

The initial combined tree also passed all three reader files and all four
MCP smokes. After the P1 fix, 37 affected checks and the combined lightweight
suite passed. The table above is the fresh final-main run, not copied earlier
counts. No full GMS/C++ regression, native compilation or TypeScript migration
was performed.

## Actual Chrome → Panel HTTP → MCP stdio → Python

These actions used real Chrome with the independent scientific backend,
without a model session in the product. DOM shims are separate unit tests.

### TIFF: select, measure, revise, export and restore

- Opened the public three-frame uint16 fixture; explicitly saved the synthetic
  user statement X/Y = 0.02 nm per source pixel, entire sequence.
- Mouse-selected ROI `[16,16,112,80)` and created exactly **one** FFT, Hann
  window and mean subtraction. An earlier `[16,15,112,81)` mouse selection
  remains as an unused historical ROI; it was not substituted silently.
- Saved three candidate DC-to-peak measurements. They sample two known tones
  and a conjugate, not three independent crystallographic observations.
  Mouse coordinates, rather than ideal peak coordinates, determine the values.
- Dragged only g1. Its period changed from `0.15500933997845837` to
  `0.1850009040648249 nm`; the latter point is deliberately off the ideal
  0.16 nm peak and is not a newly discovered reflection. g2/g3 retained their
  original IDs, anchors, values and object/request hashes. Old g1 remains.
- Gamma 1 → 1.05 → undo → redo → undo left measurement rows unchanged.
  At 960×800, focus/fit retained the line selection and unsaved Gamma=1.05.
  Actual 1280×800 and 960×800 screenshots are linked below.
- Read a 128-sample nearest-neighbour, one-pixel-wide source profile and ROI
  statistics: n=6144, mean=24000, population std=4743.470749356425,
  min/max=15000/33000. No PNG brightness was read as a scientific value.
- Exported real measurement/profile CSV, scientific NPY, 2×2 and 1×3 figures.
  Original/ROI/FFT/profile captions, the source-coordinate ROI outline,
  scale bars and optional outside-image legend were checked. Hiding the legend
  did not change candidate status. Restoring the 2×2 JSON preserved Gamma=1.05
  and current science; no additional FFT was submitted.
- Selected historical g1, explicitly clicked “跳到结果原视图”, then explicitly
  returned to the new g1 view. The three current values and old history stayed
  intact; neither jump recomputed or overwrote a measurement.

An independent NumPy/direct-DFT/geometry/nearest-sample oracle passed **172**
checks, including actual CSV and all saved arrays. Separate figure checks
verified the source ROI maps to SVG `[16,16,96,64]`, not a guessed screen box.

### Scalar DM4, explicit multidimensional DM3, and complex DM

- A public 96×128 **uint32** DM4 was opened in Chrome. UINT32_MAX and 16777217
  sentinels outside the ROI survived exactly. File calibration remained
  `X=0.02, Y=-0.03 nm/px`, raw origins `[1.25,-2.5]`, physical pixel zero
  `[-0.025,-0.075] nm`, source `dm_file_metadata`; TIFF calibration was not reused.
  GUI ROI → one FFT → measurement → CSV/NPY → profile/statistics → 2×2 passed.
  ROI mean=20000000 and population std=4743.470749356425. Independent science
  checks: **47 PASS**, plus actual measurement and 128-row profile CSV checks.
- DM3 and rank 3–6 scalar planes were exercised through the formal CLI/MCP,
  including non-default Y/X axes, fixed indices, transpose, signed calibration,
  cross-plane refusal, profile/FFT/NPY and recovery. **There is no GUI nD selector**;
  this is not reported as mouse-driven volume navigation.
- A public complex64 DM4 retained all real/imaginary values. Chrome displayed
  amplitude, imaginary, power and real explicitly. An attempted component
  switch with dirty Gamma was refused and the draft survived. Real statistics
  on an imaginary display gave mean `-3.5` over ROI `[19,19,103,73)`.
  The separately requested imaginary profile had 128 actual values of `-20`.
  A real-component hover probe at saved array index `[40,39]` returned `-24`.
  Raw NPY export retained both parts; the 1×3 figure records imag/power/real
  display components, spatial coordinates and no implied FFT semantics.
  Independent checks: **46 PASS** plus actual CSV/export/figure checks; FFT count=0.
  The complete worker tests separately cover complex128 and both DM3/DM4.
- Missing units remain pixel/cycles-per-pixel; no physical spacing is invented.
  The initial TIFF GUI explicitly reported unknown XY scale, and the reader/MCP
  controls tested uncalibrated scientific measurements and null physical fields.

### Helper close/reopen

All three owned Node helpers were stopped with Ctrl+C and reopened using only
their existing workspace and Python paths. The terminal reported exit **1**
for Ctrl+C; this is not relabelled as exit 0 or a normal GMS shutdown.

The same saved objects returned: TIFF `ee9662ce35d04968a1fb453a2ad20713`,
DM4 `0bd3207589dd49d5ac4d654ed778b05a`, complex
`bd86dd85ab6944adabbde34cf1046906` with component `real`. Chrome actually
showed three current TIFF measurements, the DM4 file calibration and separately
restored statistics/profile, and the complex real display plus imaginary profile.
Original completed-request and numeric-result references were verified.

Strict before/after comparison found **95 TIFF + 55 DM4 + 43 complex = 193**
authoritative object/request files unchanged in hash and size, with no new
science object/request/FFT. Source hashes also stayed identical. This excludes
replaceable connection-state files; no retroactive byte-level claim about old
auxiliary snapshots is made. Recovery uses saved scientific workspaces, not
just the exported JSON or a newly captured input.

## P1 found, retained and fixed

The original high-baseline DM4 Figure rounded distinct Y ticks to
`19990000 / 20000000 / 20000000 / 20000000`. Arrays and CSV were correct, but
the paper axis was misleading. [Original failing SVG](examples/pr1-pr5-closeout/before-fix-not-for-use/dm4-duplicate-ticks.svg)
is retained and must not be used as the final figure.

Commit `3dc8dbc19ce9d5fb34ccaf95b564101eb3884255` adds one shared display
formatter: increase precision only when distinct tick labels collide, and retain
the actual constant value. Composer and the ordinary profile use it. Two new
pre-fix assertions failed; three new regressions and the related tests passed
after repair. Scientific tolerances, tick values/positions, data and CSV did not change.

Reimporting the **same** DM4 layout in fresh Chrome modules and exporting again
produced distinct labels `19991000 / 19995000 / 19999000 / 20003000`.
These are compact five-significant-digit labels; exact tick positions remain
`19991228 / 19995228 / 19999228 / 20003228`, and full data precision remains in
the table/CSV/NPY. The two composition JSON files are identical. Except for the
four label strings, SVG structure is identical, including all 128 curve points,
images, ROI, scale bars, units and scientific references. No FFT was recomputed.
There is no remaining observed P0/P1 blocker in this tested scope.

One browser-control connection timed out and needed a fresh tab; a screenshot
timed out once and succeeded after checking the unchanged responsive page.
Those are retained harness events, not discarded scientific failures. Invalid
selection/mode attempts were correctly refused before scientific submission.

## Public artifacts and local evidence

Only public synthetic data are shown. **No experimental pixels, tokens or
exported NPY files are committed.** Figures and CSV reference immutable local
science; their JSON layouts require the original scientific workspace.

- [Actual workbench with three results](examples/pr1-pr5-closeout/tiff-three-measurements-1280.png)
- [Actual 2×2 browser view](examples/pr1-pr5-closeout/tiff-2x2-browser-1280.png),
  [960×800 1×3 view](examples/pr1-pr5-closeout/tiff-1x3-browser-960.png),
  [focus/fit with draft](examples/pr1-pr5-closeout/tiff-focus-draft-960.png)
- TIFF [2×2 PNG](examples/pr1-pr5-closeout/tiff-2x2/composition.png),
  [SVG](examples/pr1-pr5-closeout/tiff-2x2/composition.svg),
  [layout](examples/pr1-pr5-closeout/tiff-2x2/composition.json),
  [1×3 PNG](examples/pr1-pr5-closeout/tiff-1x3/composition.png)
- Corrected DM4 [browser](examples/pr1-pr5-closeout/dm4-corrected-2x2-browser-1280.png),
  [PNG](examples/pr1-pr5-closeout/dm4-2x2-corrected/composition.png),
  [SVG](examples/pr1-pr5-closeout/dm4-2x2-corrected/composition.svg),
  [layout](examples/pr1-pr5-closeout/dm4-2x2-corrected/composition.json)
- Complex [browser](examples/pr1-pr5-closeout/complex-real-display-imag-profile.png),
  [1×3 PNG](examples/pr1-pr5-closeout/complex-1x3/composition.png)
- Actual [TIFF measurement CSV](examples/pr1-pr5-closeout/tiff-measurements.csv),
  [TIFF profile CSV](examples/pr1-pr5-closeout/tiff-profile.csv),
  [DM4 measurement CSV](examples/pr1-pr5-closeout/dm4-measurements.csv),
  [DM4 profile CSV](examples/pr1-pr5-closeout/dm4-profile.csv),
  [complex imaginary profile CSV](examples/pr1-pr5-closeout/complex-imag-profile.csv)
- [Public artifact hashes and validation summary](examples/pr1-pr5-closeout/validation.json)

Full local logs, independent oracles, raw NPY, old failures and provider journals:
`F:/microscopy-workbench-evidence/pr1-pr5-closeout-r1/`. Final-main logs are in
`final-main/readers/` and `final-main/mcp/`; independent reports in `audit/`.
No earlier acceptance receipt was overwritten or upgraded to a different scope.

## Reproduce

Use Node >=18 and an independent environment with `requirements-images.txt` and
optional `requirements-dm4.txt`; never GMS Python. Set `MICROSCOPY_PYTHON` to its
absolute interpreter for the npm science commands above.

```sh
python examples/make_microscopy_trial.py /absolute/new-tiff-input
node tools/researcher_inspector.mjs --source /absolute/new-tiff-input/periodic-sequence.tiff --workspace /absolute/new-tiff-analysis --python /absolute/venv/python
# In the GUI record SYNTHETIC X/Y=0.02 nm/px, entire sequence.

python docs/examples/pr1-pr5-closeout/make_dm4_inputs.py /absolute/new-dm-input
node tools/researcher_inspector.mjs --source /absolute/new-dm-input/signed-uint32-pattern.dm4 --workspace /absolute/new-dm-analysis --python /absolute/venv/python
# Set display limits to 19991000 / 20009000; precision sentinels remain untouched.

python examples/make_complex_trial.py /absolute/new-complex-input
node tools/researcher_inspector.mjs --source /absolute/new-complex-input/complex-field.dm4 --workspace /absolute/new-complex-analysis --python /absolute/venv/python --component amplitude
```

On Windows use the independent `Scripts/python.exe`, quote paths with spaces,
and use fresh destination directories. Later omit `--source`/`--component` and
reopen the same workspace. The new DM generator is fixture-only, using the
existing test encoder, not a runtime DM writer. See [plane selectors](DM4_DIRECT_IMPORT.md)
and [complex limits](DM_COMPLEX_IMAGES.md) for formal CLI/MCP usage.

## Not covered and remaining usability work

- **NOT_TESTED this round:** real ADF, real DM3/volume specimens, real complex
  experimental files, Mac device use, live GMS/native plugins and a separate
  ordinary model client's image reception/interpretation. Earlier ADF receipts
  remain historical limited read/geometry evidence, not phase/HKL identification.
- Packed complex 5/27/28, nD complex, phase display and imported-complex FFT/compare
  remain refused. Rank 3–6 scalar selection, little-endian guards, finite values,
  source hashes, 4MP/64MiB plane bounds and existing downstream limits remain.
  Missing metrology, resolved depth or intensity units are never invented.
- No raw data, compound source identity, calibration or candidate status was
  changed by fit/focus, layout, Gamma or export. Source-head CI and final-main
  local runs do not grant universal format, device or scientific qualification.

At most three next P2 priorities:

1. A small dataset/explicit-plane GUI selector; today those choices use CLI/MCP.
2. Reduce repeated read-only asset/reference validation latency in Composer and
   reopen, while retaining the present identity and hash checks.
3. Researcher feedback on navigation/recovery and an actual Mac/real-specimen
   acceptance round. Reopening currently restores the last saved science and
   numeric references, not the entire transient navigation/gesture history.
