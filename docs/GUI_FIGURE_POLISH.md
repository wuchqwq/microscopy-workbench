# GUI / Figure polish

This increment keeps the same scientific tools, arrays, object/request IDs and
Figure recipe identity. It changes the camera and paper presentation only.

## Use

- **适应画布** (also F) fits the image into available space, preserving aspect
  ratio. It can enlarge beyond the previous 2× camera cap; enlarged display
  pixels do not add scientific resolution.
- **专注图像** temporarily hides the result area, figure toolbar and inspector.
  Navigation, selection actions and undo remain available. **退出专注** restores
  those panels and the prior camera when viewing the same object. DOM fields,
  selections, marks, numerical results and unsaved drafts are not discarded.
- New Composer panels default to **Original / ROI / FFT / Intensity profile**.
  Existing/custom captions are preserved. **使用默认标题** explicitly replaces
  captions using the saved scientific domain/shape, without putting engineering
  coordinates in a title. Coordinates remain in the recipe and provenance.
- **在原图显示对应 ROI 框** connects an explicit ROI panel to a full original
  panel using validated source-pixel edges, saved frame identity, source array
  hash/shape and matching calibration. The cyan outline is labelled with the
  ROI panel letter. It is a presentation overlay, not a new scientific mark.
  No guessed latest window, screen coordinate or FFT recalculation is used.
- **显示紧凑图例** controls the paper legend. The smaller padded legend remains
  outside the image, at the common figure font; hiding it does not confirm or
  retract a candidate. Scientific annotations and scale bars paint above ROI
  outlines, so a border cannot erase their lettering.

ROI outlines are conservative: unrelated sources/frames, unequal calibration,
missing evidence and non-spatial panels are not paired. The UI reports when no
validated pair is available. The first full layout/source check is read-only;
subsequent display toggles use the already validated assets. Layout switches
that make three/four panels complete perform the same check as export, keeping
preview and exported SVG/PNG consistent.

Recipes keep schema `microscopy-figure-composition-v1`, with optional Boolean
`roiOutlines` and `showLegend`. New layouts enable both. Old layouts without
these fields retain their old appearance (no ROI outline, existing per-panel
legend preferences). All scientific source fields and annotation states remain
unchanged. The public panel metadata now includes its existing saved
`source_shape_yx`, allowing honest full-frame versus cropped-view captions.

## Actual acceptance

The baseline is frozen main `0fcbdcb`; the changed application reopens exactly
the same independent scientific workspace. Actual Chrome, Windows, 1280×800
and 960×800; Panel HTTP → MCP stdio → independent Python. The public TIFF
fixture uses an explicitly synthetic 0.02 nm/source-pixel XY scale.

The baseline workflow performed original → ROI [16,16,112,80) → one 96×64 FFT
→ candidate DC-reflection measurement (~0.16 nm geometric period) → saved
128-point nearest profile → 2×2 / 1×3 export. The changed GUI reuses these exact
saved inputs. It does not claim a material identification or an additional
independent reflection.

Observed focus example: the same 128×96 source image grew from about 191 display
pixels high to 549 pixels at 1280×800. The source-pixel ROI and an unsaved
Gamma=1.2 draft remained identical at both window sizes, and the saved profile
was still available after exiting focus. Fit/focus do not invoke scientific
operations or alter scientific undo history.

Independent acceptance checks compare the before/after object and request
inventory, original source hash, FFT count, clean-image bytes, original ROI
edge mapping, scale-bar endpoints/units, candidate status and profile samples.
The initial changed export exposed an ROI line crossing scale-bar lettering;
that artifact is retained separately. The final layer order paints scientific
annotation/scale text above the unchanged ROI boundary.

| Scope | Result | Evidence |
| --- | --- | --- |
| Real Chrome / Panel HTTP / MCP stdio / Python, synthetic workflow | PASS | Original → ROI → one FFT → measurement → profile; same saved inputs used before/after |
| Fit/focus, ROI and unsaved display draft at both window sizes | PASS | 1280×800 and 960×800 screenshots below |
| Final 2×2, 1×3 and legend-hidden browser exports | PASS | Real SVG/PNG/JSON ZIPs, source-edge and layer-order checks |
| Immutable scientific records / no extra FFT | PASS | 17 objects, 17 completed requests and all 55 scientific files unchanged; exactly one FFT |
| Affected Node tests | PASS | 103 passed, zero failed/skipped |
| Lightweight `npm test` | PASS | 242 passed, zero failed; four pre-existing opt-in skips (final small layer-order change covered by affected tests) |
| Real standalone science smoke | PASS | Signed scale, direct DFT oracle, export, reconnect recovery and panel HTTP |
| Mac / real GMS / model-client vision | NOT_TESTED | Outside this presentation-only change |

The first-pass ROI-over-scale-text artifact is retained in local acceptance
evidence and is **FAIL (fixed)**; the final packages pass the layer-order and
visual checks. Private loopback tokens are not part of the evidence.

Before/after screenshots and final exported figures use the public synthetic
fixture only:

- [Before workbench](examples/gui-polish/before-workbench-1280.png),
  [focused 1280×800](examples/gui-polish/after-focus-1280.png),
  [focused 960×800](examples/gui-polish/after-focus-960.png).
- [Before 2×2](examples/gui-polish/before-2x2.png),
  [final 2×2](examples/gui-polish/after-2x2.png),
  [actual browser](examples/gui-polish/after-figure-browser.png).
- [Final 1×3](examples/gui-polish/after-1x3.png),
  [actual narrow browser](examples/gui-polish/after-1x3-browser-960.png).

Create the public fixture with
`python examples/make_microscopy_trial.py /absolute/new-fixture-directory`.
Reproduce with its periodic TIFF and an independent Python environment:
`node tools/researcher_inspector.mjs --source /absolute/periodic-sequence.tiff
--workspace /absolute/new-workspace --python /absolute/venv/python`.
Set synthetic XY = 0.02 nm/pixel, choose source ROI [16,16,112,80), save Original,
ROI, FFT and a line profile, then add their saved versions to Composer. Toggle
the ROI box/legend, export both layouts and restore their `composition.json`.
This requires no model or DM process. No full GMS/C++ regression is run.

The separate DM4 import PR is independent of this presentation change.
