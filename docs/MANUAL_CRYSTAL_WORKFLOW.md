# Two selected regions → conditional crystal evidence

This integration candidate joins reviewed #44/#46 and #47 without merging them
or main. Use `integration/manual-crystal-evidence` to try the combined route;
the separate PRs and their qualification histories remain intact. No DM/GMS or
private ABI is involved. Automatic feature proposals remain EXPERIMENTAL.

## Researcher and Agent

1. Open an explicit image/frame in the existing Panel. Supply a sourced scale
   if physical measurements are needed; unknown scale still permits pixel work.
2. Draw and save two neighboring rectangles, with an observation reason for each.
   Say “compare these two regions against these candidate structures”. The
   Agent retains internal IDs; the researcher need not copy them or JSON.
3. The Agent reads `image_panel_current`, attaches the exact current calibration
   if required, records manual attention, and calls one two-window
   `image_spatial_atlas`. Its existing FFT/peak/measurement children feed both
   `image_discovery_review` and `structure_general_compare`.
4. Inspect the returned comparison PNG and numerical matches/unmatched evidence.
   The same Panel can show the saved source, atlas overview or FFT. A structure
   comparison is a structure-provider object, not an image-provider Panel ID.
5. Move a saved peak and measure it, then ask to update the comparison. Existing
   `image_remeasure`, atlas measurement overrides and immutable review/comparison
   revisions retain old results and both original complex FFTs. Gamma and
   label layout are display edits, not scientific recalculation.

The Agent still needs finite structure sources, scientific orientations,
simulation conditions and a registration/tolerance basis. A geometric fit does
not identify a unique material, twin or 3D interface. FFT contrast and SAED
intensities are not interchangeable. Keep hypotheses, user statements and
independent evidence separate. Generic ordered FCC/BCC/HCP/multi-element support
retains the existing [qualification matrix](GENERAL_CRYSTALLOGRAPHIC_EVIDENCE.md);
F3b's specific Sigma3{111} contract is unchanged.

## Additive Panel handoff

`image_panel_current/open/show` retain the original `view`, tool schemas and PNG
content, and add a read-only `roi_handoff` snapshot:

- `saved_rectangles`: bounded IDs, text/status, original fractional source
  anchors, eligibility/reason and canonical integer `rect_xyxy`.
- `current_selection`: a separate unsaved candidate, never silently a saved ROI.
- `scientific_input`: exact source-frame/calibration references. Its optional
  `prepare_call` describes an existing `image_calibrate` attachment; it does not
  perform it. Save a new request ID before that explicit write.
- `draft_state`: pending edits/gestures. Respect `image_panel_show`'s observed
  view/draft-revision guard and queued-result semantics.

Edges use the Panel's existing `selectionRectangle`, not LLM rounding or PNG
coordinates. No clipping or latest-frame guessing. Frequency marks, wrong
sources, ambiguous mappings, retracted rectangles and out-of-bounds inputs are
explicitly unusable for this spatial handoff. Inspection is bounded to 100
marks/32 panels. It creates no science, changes no anchors and verifies no scale.

Save request IDs before dispatch; use `image_result`/`structure_result` for
original scientific outcomes. A Panel presentation is recovered with its
original Panel tool/arguments, not `image_result`; current Panel state is
different from an original receipt. Never replay unknown side effects.

Atlas override reuse requires the **same exact source/calibration wrapper**.
A changed scale is rejected by the old-atlas guard; cross-calibration atlas
continuation is not implemented here. Existing standalone FFT batches cannot
be imported into a new atlas. Report these boundaries instead of silently
recomputing. Tools remain directly callable; no full-field workflow is required.
The client does not automatically wake a model after a drag: the researcher says
continue, then the Agent reads the selection.

## Reproduce

With the existing separate image/structure Python requirements installed:

```powershell
npm ci
npm run build
$env:MICROSCOPY_PYTHON='F:/microscopy-workbench-env/Scripts/python.exe'
$env:MICROSCOPY_SMOKE_OUTPUT='F:/new-acceptance/manual-crystal'
npm run test:manual-crystal
```

Use a new absolute output directory. The runner creates public analytic TIFF/CIF
fixtures, calls real compiled MCP/Python/ASE/diffsims, exports science, and
independently checks DFT/q/periods, revision, refusal and fresh-client recovery.
It is an acceptance runner, not a new scientific tool.

For an opt-in fresh Codex test, `tools/qualify_manual_crystal_agent.py` creates a
changed fixture with `--prepare-fixture <new-directory>`. Use its operator input
and dedicated plugin configuration/workspace with `--config ... --input ...
--output <new-directory>`; `--panel-id` makes the model read saved Panel marks.
Recovery uses `--config ... --handoff <prior-final.txt> --output <another-new-directory>`.
The separate analytic truth is never supplied. Authorization is command-scoped
to named tools; global config/auth/model are not changed. Public Skill text is
supplied explicitly: automatic plugin discovery is separately NOT_TESTED. Exit
code/image counts alone are not acceptance. See the [executed record](MANUAL_CRYSTAL_ACCEPTANCE.md).
