# HRTEM/STEM engineering baseline

This local review baseline starts from main `c69424ac25a35efd816d68cacd5904f5381c7485`
(PR131). It collects existing observation tools, their MCP/Skill composition and
bounded operational fixes before comparing alternative algorithms. It is not a
new detector, a scientific accuracy release, or a trained model. No automatic
installation, remote publication or change to the user's existing workspaces is
part of this baseline. Record the exact candidate SHA with each comparison.

## Included working paths

- Shared input: explicit supported source and zero-based frame; immutable original
  arrays and signed axes; sourced calibration or pixel-only results; preview and
  explicit receipt, original-request recovery, export and saved-object readback.
  Main's Node 22/24 support and existing CI policies remain in place.
- HRTEM observations: ROI FFT, existing v3 peak candidates and measurements,
  rectangular spatial atlas, local signatures and square-window field follow-up.
  Optional GPA/topology/structure comparison retain their original prerequisites;
  this integration does not newly qualify those optional methods.
- A supplied core can produce core/horizontal/vertical FFT observations through
  the existing `image_spatial_atlas.cross_window`. Exact core evidence is separate
  from long-window context. Arm stability is `not_assessed`; boundaries are
  explicitly rejected or deliberately configured, never silently padded/clipped.
  See [core cross windows](CORE_CROSS_WINDOWS.md).
- STEM point observations: fixed raw ROI statistics, same-shape same-image
  reference ROI means and signed differences, and width-one nearest profiles.
  Saved statistics/profile can be bound to an exact discovery candidate in
  `image_discovery_review`; a probe remains ephemeral. See the project Skill
  [point-observation reference](../skills/scientific-agent/microscopy-automation/references/point-observations.md).
- Peak reporting distinguishes merely reaching a cap from omitted thresholded
  candidate maxima. Returned peaks and the v3 detector remain unchanged; the
  report is not physical reflection completeness or a calibrated false-positive
  probability. A full FFT is not discarded solely for reaching its cap.
- Ordinary scalar TIFF keeps supported integer/float precision, including finite
  float64; extreme finite display normalization is safe and display-only. Existing
  uint16/float32 descriptors remain compatible. Calibration is not inferred from
  arbitrary TIFF metadata. See [exact import limits](TIFF_IMPORT.md).
- Owned Panel helper startup exit/error is observed promptly. Its failed startup
  remains the original submitted request with a saved launch error; no automatic
  restart, ownership bypass or scientific success is fabricated.

The Agent chooses and explains analysis through the existing
`microscopy-router`, `microscopy-observe-revise`, `microscopy-automation` and
`crystallography-compare` Skills as appropriate. A researcher can supply or revise
a core through the same evidence path. Panel interaction does not itself wake a
model; a delivered preview or ACK does not prove the model inspected its pixels.
After a compound render, follow the actual saved view's `preview_execution` to
record its receipt before the next render. Unknown original operations are never
replayed or acknowledged.

## Scope carried into future comparisons

This baseline includes the seven reviewed local changes rooted at 7a1d3e0:
Panel `a56018d`, TIFF `12a57ef`, cross `9e8c2c1` plus CI `a83bf8a`, point
`03ea953`, and receipt guidance `7b938ad`/`680bf94`. Original commits and evidence
remain available; integration commit IDs are different. Main history is retained.
TIFF and Panel tests are registered in the existing runners, rather than adding
new broad CI jobs. No new runtime or numerical dependency is introduced.

No S1/S2 prototype, complexity score, PCA/NMF strategy, automatic stable-arm
selection, automatic expected-site/sublattice inference, neural training or
z-depth reconstruction is added. Algorithm choice and comparison protocols are
separate work. Compare candidates on the same inputs, visible information,
budgets, noise seeds and readout rules; preserve failures and unknowns.

Current forward-simulated single-layer MoS2 evidence is quality-limited:
**10.034456% exceeds the frozen 10% grid-stability limit.** That gate remains FAIL.
The 18-position GridScan/CustomScan diagnostic did not replace the 225-point gate.
Formal physical blind detection remains NOT_TESTED and strict historical blind
isolation NOT_VERIFIED. Fixed-site intensity depression is not vacancy chemistry,
occupancy, depth, calibrated uncertainty or proof of phase. Pristine pairs are
offline controls, not a required future single-image input. Real specimens and
human GUI gestures have not been qualified by synthetic or software checks.

The integration record and local targeted validation accompany the exact SHA;
local Node 24 evidence does not imply local Node 22/macOS/DM/browser qualification
or hosted CI success. Builds must finish before starting a provider/model run;
never rebuild or replace its `dist` while it is in use.
