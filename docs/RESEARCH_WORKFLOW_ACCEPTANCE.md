# Research workflow acceptance — PR #1, round 2

Executed on Windows 11 build 26300, actual Chrome, at 1280×800 and 960×800.
Node 24.16.0; independent Python 3.13.2, NumPy 2.5.4, SciPy 1.18.1,
Pillow 12.3.0 and tifffile 2026.10.15. The browser connected to Panel HTTP →
this checkout's MCP stdio server → the independent Python provider.
Computer Use simulated researcher gestures; the GUI launched no model session.
This is functional/browser acceptance, not a human usability score.

Baseline: main `0b70226`, PR #1 `5808d00`; neither was merged during this work.
A new workspace and new public TIFF were created with
`examples/make_microscopy_trial.py`. Historical results were not copied as PASS.

## Actual workflow

| Step | Result and evidence |
| --- | --- |
| Open / inspect | PASS: 3 frames, each 96×128 YX, uint16; fixed TIFF provenance. Actual original-array probe [80,40] = 27000, independently checked against the TIFF and fixture equation. |
| No calibration | PASS: a line measured 49.997517773964205 px; no physical length, angle or nm was invented. The immutable older result stayed uncalibrated after adding a new scale. |
| No-calibration FFT control | PASS in a separate actual MCP/worker workspace: DC→(0.125,0) gave 0.125 cycles/pixel and an 8-pixel period; physical fields stayed null. Querying its original request recovered the same object. This control was not a browser test and did not add another FFT to the main analysis. |
| Explicit calibration / ROI | PASS: synthetic whole-sequence X/Y = 0.02 nm/source pixel, source statement and unknown uncertainty preserved; ROI [16,16,112,80), no window, mean subtraction explicitly selected. |
| FFT / three reflections | PASS: one complex128 FFT [64,96], fy/fx. Two ideal tones are (0.125,0) and (0,0.0625) cycles/pixel. Actual clicked coordinates were retained, rather than silently snapped to ideal bins. DC-to-point periods were approximately 0.16, 0.3200623, 0.16 nm. The negative partner is not an independent structural reflection. |
| Revise one point | PASS: g1 moved to fx = 14/96, giving geometric period 0.1371428567 nm. Only its measurement was revised; g2/g3 kept their original IDs, coordinates and values. This deliberately moved test point is not a newly detected lattice reflection. |
| Display / navigation | PASS: Gamma 1 → 1.35 → undo 1 → redo 1.35; saved Gamma did not change the complex array. Back/forward opened saved original/FFT views with their own Gamma 1 / 1.35, without another FFT. |
| Profile / statistics | PASS: 128 width-one nearest samples, exact requested/sample coordinates and indices, raw unknown-unit values; Home/End, a table row and arrow-key readouts agreed. ROI n=6144, mean=24000, population stddev=4743.470749356425, min/max=15000/33000. |
| Independent numerical oracle | PASS: new TIFF values from the analytic fixture, NumPy FFT plus direct-DFT checks, fsum statistics, nearest samples/NPY/CSV, calibration geometry and source hashes. Scientific tolerances were not changed. |
| Export | PASS: actual measurement/profile CSV downloads; exclusive scientific NPY exports, including byte-identical complex FFT and original uint16 source view; 2×2 / 1×3 SVG, PNG and composition.json. |
| Layout recovery / draft | PASS: reloaded the saved layout against the reopened provider; current Gamma 1.1 draft survived. A corrupted clean-PNG hash was refused without replacing the four slots or the draft. |
| Backend restart / recent results | Initial FAIL, fixed: see below. Final actual restart restored both original references despite the last operation being export. A strict 33-object / 33-request interval had zero additions, deletions or byte changes. |
| Frame isolation | PASS: frame 2 explicitly hid the old statistics/profile as belonging to another object; no old physical curve was shown. Returning to the saved frame-1 view recovered the valid results. Frame switching was an explicit new operation outside the strict zero-write restart interval. |
| Narrow desktop | PASS within tested controls: tools, results tabs, result-area resizing, zoom, pan, table/keyboard readings and exports were operated at 960 px; no horizontal document overflow. Long result content still requires scrolling. |

All three reflection marks remained `hypothesized`; no HKL, phase or physical
resolution was automatically confirmed. A real-space FFT's DC-to-point
geometric period does not by itself establish crystallographic d-spacing.

## Problems and small fixes

| Priority | Observed issue | Final result |
| --- | --- | --- |
| P0 | No new scientific-value, unit, frame-mixing, source mutation or false recovery defect found in the executed scope. | PASS within the stated tests, not a general qualification. |
| P1 | SVG scale bars were white without a dark halo and could disappear on bright regions. | Fixed with dark line/text halos; original endpoints, physical length, unit and font preserved. Actual exported figures inspected. |
| P1 | GUI rendered both a PNG-baked scale bar and a second SVG bar. | Fixed: the saved display's baked bar is used once; clean figure assets retain one vector bar. No extra provider operation. |
| P1 | Last profile X tick (2.24 nm) was clipped at the 2×2 panel edge. | Fixed endpoint text alignment. Actual re-export inspected; all 128 curve coordinates and tick values are unchanged. Original failed PNG kept separately. |
| P1 | Latest statistics/profile disappeared after stopping and reopening the backend; only last_operation survived. | Fixed two bounded saved references in the existing atomic panel snapshot. Reopen verifies object ID, kind, original request and completion using image_info only. Existing grid/calibration gates still apply. |

Fix commits: `dfc32fa` (scale-bar contrast and duplicate overlay), `fdb8632`
(profile endpoint tick), `b782f7d` (bounded recent-result recovery and its
diagnostics). No Python science implementation was changed.

Old snapshots without the two references are explicitly reported as unavailable;
there is no scanning, guessing, retroactive receipt creation or automatic
recomputation. For forward acceptance, two new GUI statistics/profile requests
and a source export were explicitly performed after installing the fix, moving
the inventory from 30 to 33. Those are not claimed as recovery. The subsequent
restart itself recovered the exact saved records with **zero science writes**.
Old scientific records remained unchanged; original journals were retained
without retroactively adding references. Ctrl+C stopped the test
launcher; its terminal exit status was 1, not claimed as a clean exit-code-0 test.

Final lightweight `npm test`: **228 PASS, 0 FAIL, 4 existing opt-in SKIP**.
The relevant scale/presentation/UI/Composer subset passed **86/86**; the
numeric-recovery, draft-transport and recovery-message subset passed **21/21**.
The real independent `npm run test:science` also passed. These are separate
scopes, not additional browser runs. Final figures and the bounded numerical
restart were independently checked against actual files and original requests;
no GMS/C++ regression, native build, backend fallback or Python-kernel rewrite
was performed. Synthetic source SHA256:
`b0683c65ea241866d7a21a9a5fbe125f56b7cdff2cbf9c46f9524608e0a25a83`.

## Artifacts / reproduction

- [Actual workbench](examples/workflow-r2/workbench.png)
- [Actual 960-pixel workbench](examples/workflow-r2/workbench-960.png)
- [Actual browser Figure preview](examples/workflow-r2/figure-browser.png)
- [Actual final 2×2 PNG](examples/workflow-r2/2x2.png)
- [Actual 1×3 PNG](examples/workflow-r2/1x3.png)
- [Actual measurement CSV](examples/workflow-r2/measurements.csv)
- [Actual profile CSV](examples/workflow-r2/profile.csv)

The complete actual SVG/PNG/composition.json ZIPs, scientific NPY exports,
before/after inventories, original FAILs and independent verification reports
remain in the local round-2 acceptance directory. Layout files contain source
provenance and require their original scientific workspace; they do not embed
or recreate the scientific arrays in a clean checkout.

Use the [standalone launch command](RESEARCHER_DATA_INSPECTOR.md), create the
public fixture, and supply its explicit synthetic scale. The GUI buttons carry
out every analysis step; the researcher never supplies an object ID or JSON.
Reopen the same workspace, and choose composition.json in **组合图版** to restore
the paper layout. **科学数据** writes a new directory in workspace/exports;
table **CSV** and **组合图版** download presentation/numerical files in the browser.

## Unverified scope and next improvements

**REAL_DATA_NOT_TESTED**: the previously authorized ADF input is DM4, outside
this standalone TIFF entry. The authorized TIFF is ptychography, not a confirmed
HRTEM sample. No other experimental image was downloaded or relabeled HRTEM.
Minimum additional input: an authorized supported grayscale uint16 HRTEM TIFF
and its XY scale/source, or an explicit statement that scale is unknown.

Mac device acceptance, actual DM, ordinary MCP-client model vision and real
material/phase identification are **NOT_TESTED**. UI gestures were automated;
researcher preference and long-session usability still need human feedback.

At most three remaining P2 priorities:

1. Restore or show the analysis ROI outline on the original image automatically;
   currently source coordinates remain correct but the rectangle must be redrawn.
2. Give per-asset progress during sequential layout-reference verification;
   local layout changes are immediate, but restore/export has a noticeable wait.
3. Make layout transport more self-contained; currently its referenced scientific
   workspace must be retained and scientific exports are a separate directory.
