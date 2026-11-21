# Display recipes (Mac incremental candidate, 2026-11-13)

Brightness (default 0, −1…1), contrast (default 1, 0…4), gamma
(default 1, legacy `n ** (1/gamma)`), grayscale/Viridis/Cividis/Magma/custom
and reverse change presentation only. Slider step=any preserves full saved precision;
labels round presentation only and expose exact values on hover. Gamma covers the
formal 0.05…20 interval. Reset returns automatic source range,
brightness 0, contrast 1, gamma 1, grayscale and no reversal. Scale/axis aids
are independent. Custom editing shows a live gradient and approximate image preview. Click native color swatches for low/high (and optional middle) colors; drag the middle stop along the gradient (strictly between 0 and 100%). The native range spans the full 0…1 interval so all provider-valid saved positions, including 0.001/0.999, load unchanged. Coincident endpoint values are explicitly refused by the existing strict-stop validator; opening/confirming never clamps a valid saved value. Two-color mode remains available. HEX is optional under details. Reset inside the dialog is staged; cancel/Escape changes nothing.

Order: clip original scalar/component values to the saved raw display interval,
normalize to [0,1] (a constant interval maps to zero),
`clamp((n - 0.5) * contrast + 0.5 + brightness, 0, 1)`,
`n ** (1/gamma)`, reverse the resulting color coordinate if requested,
then interpolate the palette/custom stops, round each channel to 8-bit and
resize for display. Palette interpolation is RGB, not physical intensity.

Sliders coalesce local redraws without issuing scientific requests. This is an
explicitly **approximate draft preview** from the existing 8-bit PNG; clipped
information cannot be recovered there. Apply or workspace Save invokes the
provider's original-array render once using the frozen source/view and original
request identity. After timeout query that original request; do not click again
to get a second computation. Applied PNGs are not inverse-transformed/recolored
when the recipe is unchanged. No color choice implies material/element identity.

Tone is an optional version-compatible `display.tone` record, separate from
source hash, original NPY dtype, calibration and ROI coordinates. Old views/drafts
without tone retain grayscale defaults. Per-window draft/history and normal
workspace save/restore retain it. Frame/ROI continuations explicitly inherit
display settings as before; they do not infer new physical axes. Numeric tools,
FFT and fits read original arrays, never colored PNGs. Figure recipe restore
retains validated tone; scientific NPY export remains original data.

Named palettes: 256 RGB samples from already installed Matplotlib 3.11.2, rounded
to 8-bit, no new runtime dependency. JS/Python tables are checked for equality.
See [the palette license](third-party/display-colormaps-LICENSE.txt). The sampled
RGB tables are stored in `tools/display_colormaps.json`. Custom palettes permit 2–8 stops via the provider. Optional `positions` must match the colors, strictly increasing from 0 to 1; omission retains historical even spacing. The UI offers two colors or three with a movable middle position. The full recipe is preserved by save/restore and export.
