# F4b small public entrance comparison — preregistration

Written before running the new candidate detector or scoring this fixture.
This is a bounded analytic comparison, not a material defect benchmark.

## Inputs and independent truth

All images are 256×256 float32 arrays with pixel axes `[y,x]`. The generator
`tools/create_discovery_fixtures.py` imports no production detector, FFT, field,
measurement, discovery or physical inference code.

1. **amplitude_dip**: a known real three-carrier cosine texture, multiplied by
   `1 - 0.9 exp(-((x-88)^2+(y-88)^2)/(2*10^2))`. The registered central attention
   support is `[72,72,104,104]`; the Gaussian also has tails outside that box.
   Requested observation: a local contrast/texture interruption. Carrier phase,
   frequency and material displacement are unchanged by construction. This is
   the specific visually salient but possibly weak lattice-geometry case.
2. **orientation_interface**: the same texture, rotated15° in the right half,
   with an explicit interface at source `x=128`. Attention support
   `[112,0,144,256]` is a finite evaluation band, not localization uncertainty.
   It is not a twin model or an atomistic interface.
3. **clean**: the unchanged texture. No registered anomaly; normal edges,
   carrier oscillations or ordinary control ROIs are not defects.
4. **white_noise**: independent standard normal pixels, RNG seed20261031.
   No registered lattice or local material feature. Noise attentions are
   recorded, never quietly discarded from the score table.

The amplitude-dip image receives an explicitly synthetic signed anisotropic
XY scale `(+0.02,-0.03) nm/pixel` through `image_calibrate`. The others remain
uncalibrated; measurements must retain pixels/cycles per pixel without
inventing physical units. No private specimen is used.

## Three entrances, no pre-set winner

- **image_first**: `image_discovery(entry=feature,window_sizes=[64],
  max_candidates=4)`. All returned candidates are recorded, including null or
  quality-limited outcomes. Choose the first returned candidate only for the
  common verification path. No fixture truth is supplied to the detector.
- **structure_field**: existing `image_spatial_field` with a complete2×2 grid
  of128-pixel windows, stride128, then `image_domain_map`. The full image is
  covered, so an amplitude-dip miss cannot be blamed on an unsampled gap.
  Record actual map boundary bands, differences and unknown samples. Unknown
  low-quality observations do not automatically become anomaly nominations.
  If a band is proposed, its centre nominates a bounded64×64 focus; the focus
  is explicitly a follow-up convention, not precision asserted by the map.
- **manual**: an explicit64×64 attention ROI around the known dip, a64×64
  interface ROI, and a fixed control ROI for clean/noise. The reason records
  its synthetic analyst/control origin. This oracle-assisted baseline is not
  an autonomous detector and its lack of searching cost is not a strategy win.

All feature scans, field FFT/peaks/measurements, focus verification, reads and
end-to-end wait are charged and reported. In particular the field entrance
already spends4×128²=65536 FFT pixels. It is **not** represented as a free
precomputed input. The common follow-up is at most one64² FFT per entrance,
then existing peak detection and up to4 ordinary DC-to-peak measurements.
Counts of initial vs follow-up FFTs and actual allocated pixels are separate.
Different entrance budgets are visible; this is not an equal-cost superiority
test or a claim that one strategy is universally faster.

## Scores fixed before observation

For each returned attention rectangle, calculate half-open rectangle
intersection, union and truth support coverage. A **localized nomination hit**
requires IoU≥0.10 with at least one registered support. Also report any-overlap
and intersection/truth-area separately, so a very broad field support is not
confused with exact localization. The first follow-up ROI gets its own score,
separate from the original support band's score.

For anomaly cases, record registered supports hit/missed, each proposal's
hit/false-attention status, candidate count and unknown/unjudged observations.
For clean/noise every attention nomination is a benchmark false attention,
not a claim that a tool asserted a physical defect. The manual control ROI is
intentionally counted that way, with its control origin retained. No threshold,
truth rectangle, noise seed or method setting will be changed after observing
results to manufacture a preferred winner. Failures and omissions stay visible.

## Software acceptance, distinct from performance

Actual compiled MCP stdio→Python must return saved scientific objects and PNG
content; the scientific arrays are not inferred from PNG. Independently check
each verification spectrum against a direct finite DFT, signed calibration
against the saved reciprocal vectors, and source TIFF/NPY hashes throughout.
Existing FFT IDs/hashes survive review/revision and fresh-client queries.
Reject mismatched-source and mismatched-ROI evidence in dedicated adapter tests.
Panel HTTP can be checked here; actual browser gestures, a fresh runtime model,
real specimens and any material diagnosis require separately labelled evidence.
