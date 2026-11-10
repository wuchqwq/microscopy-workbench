# Conditional dk is a hypothesis, not an independent calibration

Use this reference only when the research question actually concerns an unknown
reciprocal sampling or convergence angle under a supplied structural/indexing
hypothesis. The ordinary independent-scale comparison route remains preferable
when a sourced independent scale exists. No workbench is required.

## Decide what can be claimed

| Available evidence | Useful result | Limit |
| --- | --- | --- |
| Independently sourced scale, actual-cell candidate and explicit orientation | Fixed-scale geometric residuals and competing candidates | Compatible projection is not unique phase identification |
| Unknown scale, explicit candidate/HKL/projection and measured array geometry | Model-conditioned dk estimate | Candidate used to obtain dk cannot use that same agreement to self-confirm |
| Separate reflections not used to choose indices/roll/fit | Held-out model prediction consistency | Not an external independent absolute scale; observations from one image are not independent experiments |
| No held-out reflection | Fit with `NOT_VALIDATED_NO_HELDOUT` | A fitted match is not validation |
| dk derived conditionally, disk radius plus wavelength/geometry supplied | Conditional paraxial alpha estimate, if its approximation is appropriate | Same conditioning and uncertainty remain; no invented voltage, wavelength or camera length |
| Unknown domain, DC, indices/projection or unusable support | Pixel observations and explicit missing premises | Do not supply a made-up calibration to unlock a comparison |

Freeze candidate, actual cell, shared orientation, chosen HKLs, fit/held-out roles,
DC, screen axes, source/frame/ROI and tolerance **before** calculating. Reflect on
how each choice was made: points used to select a model or roll remain search
evidence even if later labeled held-out. Keep all competitive models and their
own conditional scales. If two models each fit after their own scale adjustment,
that is a non-identifiability result, not a reason to rank the one with a prettier
PNG. State what evidence could refute a candidate within this data and what the
present data cannot distinguish. Do not create new experiments automatically.

A scan rotation of 110° is not `[1,1,0]`. Keep `scan_rotation_deg` separate from
three-index `zone_axis_uvw`, and obtain the source-to-laboratory orientation from
the actual cell with the existing provider. For projected reflections use
transverse `hypot(qx,qy)` from the un-rasterized table, not 1/d from a nonzero qz
plane normal. Retain the explicit cycles/length versus angular 2π convention.

## Provider first; a narrow local calculation only if needed

Inspect the current catalog/schema and installed environment. This provider has
structure opening, actual-cell metrics, orientation, kinematic simulation and
fixed-scale registration/comparison. It currently does **not** advertise a
model-conditioned dk/alpha fitting tool. Do not relabel `structure_register` or
the low-level comparison `scale` field as one. `structure_register` keeps an
independent scale fixed, translation zero and parity declared; do not falsify
`user_confirmed` to enter it. `structure_compare_batch` also keeps scale1/zero
translation. Missing capability does not include a refused or unknown request,
unsupported occupancy, unsafe source, broken provenance or a permission denial.
Those states keep their own stop/query requirements; a script is not a bypass.

For a permitted, genuinely missing scalar calculation, the bundled
[`conditional_dk.py`](../scripts/conditional_dk.py) uses only Python's standard
library. It reads explicit correspondences and an existing reflection table;
it does not read PNG pixels, index peaks, simulate structures, fit cell/rotation,
search candidates, modify arrays, write provider journals or apply a calibration.
Use the current qualified provider for the model/reflection table when available.
A hand-written theory table is permitted only as a declared hypothetical software
input, not as a fabricated provider result.

The Agent assembles the JSON from actual saved metadata and chosen points; the
researcher should not copy internal IDs or calculate hashes. Save the actual
capability catalog/basis locally, bind its file hash and report why the formal
route cannot perform this particular calculation. Do not send any input through
an external model or endpoint as part of this helper.

```bash
python3 /absolute/path/crystallography-compare/scripts/conditional_dk.py \
  --input /absolute/path/new-conditional-input.json \
  --output /absolute/path/new-conditional-result.json
```

The output parent must exist and the filename must be new. Existing output is
refused; no “overwrite” flag or provider request recovery is implemented here.
A stopped script may leave its local result unknown: inspect the exact requested
output before deciding what ran, rather than launching it repeatedly. Atomic
write-new publication keeps successful results separate from partial writes.

### Input contract

This compact contract is for Agent-generated internal input. Each `*_ref` or
`source.file` is `{ "path": "/absolute/ordinary/file", "sha256": "64 hex digits" }`.
Source, structure and orientation files may be scientific arrays, original CIF
or exact provider manifests as appropriate; retain the corresponding IDs and
request records separately. The helper verifies hash/geometry consistency, not
provider authenticity or experimental meaning. Verify source/structure/orientation
pairing upstream through the actual provider and preserve the original records.

Required keys:

- `schema_version: 1`.
- `capability_basis`: actual missing-capability reason; `capability_ref`: saved
  catalog/preflight file. A refusal is not a capability gap.
- `source`: `file`, zero-based `frame_index`, half-open original-array
  `roi_xyxy`, exact `dc_xy`, `coordinate_domain` of `diffraction_array_indices`
  or `fftshift_bin_indices`, and `isotropic_grid_basis`. The scalar dk assumes an
  isotropic grid; unequal X/Y sampling needs the appropriate full geometry,
  not this fit. These are array coordinates, never zoomed display pixels or
  cycles/original-pixel FFT tool coordinates disguised as bins.
- `hypothesis`: descriptive `label`, `structure_ref`, `orientation_ref`, nonzero
  integer triplet `zone_axis_uvw`, and actual `index_basis`. Optional
  `scan_rotation_deg` is a separate supplied angle and is not fitted.
- `theory_ref`: a bounded JSON table containing exact `hkl` triplets,
  `coordinates_inv_angstrom` xyz rows, `coordinates_frame` equal to
  `rotated laboratory xyz; beam +z; raster columns +x, rows +y`, and
  `reciprocal_convention` equal to `cycles_per_angstrom_no_2pi` or explicitly
  `radians_per_angstrom_2pi`. The current provider emits the first. The script
  accepts the provider's finite integer-valued numeric HKLs (for example `2.0`)
  and normalizes them to integers; fractional values, booleans and non-finite
  numbers remain invalid. Researcher zone/correspondence triplets remain explicit
  JSON integers. It converts an explicitly angular table by 1/(2π), and records
  that factor; it
  never guesses a convention from values. No intensity field is compared.
- `correspondences`: 1–32 distinct `{id, role, hkl, point_xy}` rows. Roles are
  `fit` or `heldout`; at least one fit row is required. The same point/HKL cannot
  be reused between roles; direct beam and zero transverse g are refused.
- `tolerance_inv_angstrom`: positive declared geometric tolerance in cycles/Å;
  `uncertainty_note`: sourced uncertainty information or an explicit unknown.
- Optional `alpha`: positive `disk_radius_px`, supplied `wavelength_angstrom`
  and actual `basis`. It reports only paraxial
  `alpha_rad ≈ wavelength_A × radius_px × dk`, within a ≤0.1 rad calculation
  budget. This is not an electron-wavelength/voltage solver, a general camera
  calibration or a propagated uncertainty calculation. If wavelength or disk
  geometry is missing/inapplicable, omit alpha and state why.

The fit is unweighted zero-intercept radial least squares,
`dk = sum(r*g)/sum(r*r)`, with supplied DC and model fixed. Report individual fit
and held-out residuals; a fit residual RMS is not a confidence interval. With one
fit reflection the estimate merely satisfies that one correspondence. The helper
reports uncertainty as `NOT_QUANTIFIED`, retains the supplied note and does not
invent error bars. More detailed justified uncertainty propagation requires an
appropriate separately qualified method, not a lower displayed precision.

### Read the result without promoting it

The result retains all inputs, source hashes, Python/script versions, original
reciprocal convention and conversion, roles, residuals and assumptions. It always
sets `independent_absolute_scale_validation=NOT_VALIDATED` and
`phase_identified=false`. Held-out status is either model-prediction consistent,
model-prediction conflict, or no held-out validation. These statuses concern radial
reciprocal magnitudes only; they do not test vector directions, intensities or a
complete projected pattern. The optional alpha is always
`MODEL_CONDITIONED_NOT_INDEPENDENTLY_VALIDATED`.

Keep the result as a sidecar under the hypothesis. Do not call `image_calibrate`
and label it independently sourced. If the user explicitly wants to explore a
conditional scale in another tool, preserve that conditioning everywhere; do
not enter the independent-scale proof route with it. If a formal route cannot
represent this distinction, keep the conditional sidecar outside it.

A corrected source/frame/ROI/DC, changed HKL/projection, or revised independent
scale creates a new input/result and invalidates the relevant old comparison.
Reuse only still-valid FFT bytes and model snapshots. Never edit an old sidecar
or force AnalysisContext CAS. The old result remains historical evidence of the
old assumptions, not proof of the new ones.
