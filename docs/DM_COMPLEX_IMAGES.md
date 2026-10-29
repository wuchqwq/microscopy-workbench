# Ordinary complex DM images

This increment reads bounded, **ordinary two-dimensional complex64/complex128**
DM3/DM4 datasets (DM storage types 3 and 13). The original dtype and every real
and imaginary value are preserved in scientific `data.npy`. Reading uses the
existing optional RosettaSciIO 0.15.0 environment, never GMS Python or a native
DM fallback. Existing little-endian, source-hash and array-budget checks remain.

A complex array is not automatically a Fourier spectrum, wavefunction or phase
map. It is a `frame`/`view` with its stored coordinate calibration and explicit
complex semantics. It does not acquire mathematical FFT/DC/frequency axes just
because its dtype is complex. Unknown calibration remains unknown; stored
axis calibration has the same file-source and metrology limits as real DM
images. No counts, radians, physical wave meaning or phase identification is
inferred from complex storage.

## Open, view and continue

```powershell
node tools/researcher_inspector.mjs `
  --source 'C:\data\ordinary-complex.dm4' `
  --workspace 'C:\analysis\complex-workspace' `
  --python 'C:\analysis\image-env\Scripts\python.exe' `
  --component amplitude
```

The initial component must be chosen explicitly: `real`, `imag`, `amplitude`
or `power`. A saved view inherits its component when omitted. The GUI has a
separate complex-display selector; numerical observation has its own explicit
component. Changing the PNG display does not change the scientific array or
numerical component requested for a probe/profile/statistic.

The equivalent MCP sequence is existing `image_open` → `image_frame` →
`image_preview` with `component`. A first raw complex frame without `component`
is refused with `COMPONENT_REQUIRED`, rather than defaulting silently to its
real part or amplitude. A raw frame must be previewed explicitly before opening
it in a panel. Model-free `--component` handles this initial choice. Reopening
the same Inspector workspace restores the saved view and component.

Preview and ROI `data.npy` retain the selected original complex samples; only
the PNG uses the projected scalar component. Component switches reset display
limits unless the caller supplies explicit limits, while gamma/size retain
their existing inheritance. The saved display, publication recipe and source
metadata record the actual component. An unrelated scalar/FFT display cannot
accept this new parameter: saved FFTs retain their existing `representation`
contract.

## Numeric values and exports

`image_probe`, `image_statistics` and `image_profile` require an explicit
`real` / `imag` / `amplitude` / `power` for complex inputs. `raw` is refused;
there is no single scalar value for a complex sample. Coordinates, nearest
sampling, signed scales and source-frame/ROI identity use the existing paths.
Geometric `image_measure` does not need an intensity component because it
measures coordinates, not complex values.

Real/imaginary components preserve their stored float32/float64 values.
Amplitude/power use explicit NumPy complex128 arithmetic and binary64 output,
without changing the stored complex64 input. Finite-value checks reject
overflow rather than clipping or replacing it. Statistics retain binary64
reductions. The existing top-level `dtype`/scientific grid describe the source
array; complex probes/profiles additionally record **`value_dtype`** for their
real numerical output. Thus a complex64 imaginary profile can have a float32
`profile.npy` while retaining a complex64 source identity. CSV and NPY contain
actual selected-component values, not Canvas brightness.

`image_export` of a raw complex frame writes its exact NPY and provenance,
with no silently chosen PNG (`display_mapping:null`). Export a saved explicit
view to include its component PNG alongside the unchanged complex NPY. Source
hash, calibration, dtype, axis order, ROI and display component remain distinct.
Targets still refuse overwrite. Save request IDs before submission and query
the original ID after a stopped wait; component changes never authorize
replaying an unknown operation under a new ID.

## Explicit remaining limits

- Only stored ordinary 2D complex images are qualified. Complex navigation
  volumes and explicit axis reinterpretation remain refused. Real nD plane
  selection remains available through the preceding increment.
- Packed complex formats 5/27/28 retain their pre-decode rejection and need
  separate unpacking/axis/budget qualification.
- `image_fft` and `image_compare` on these imported complex images are
  explicitly refused **before** any float64 cast or reduction. A displayed
  amplitude PNG is not a replacement input for either operation. Existing
  provider-generated complex128 FFTs and their display/numeric/export paths
  remain available.
- Phase display is not added. It needs its own handling of zero amplitude and
  scientific interpretation; complex storage alone does not declare phase
  units or make a stored image a physical wavefunction.
- This is external file/scientific computation; it does not expand live DM
  ABI, writing or native qualification.

## Bounded validation

```sh
python -B tests/dm_complex_test.py
# MICROSCOPY_PYTHON selects the independent environment.
npm run test:complex
```

Windows Python 3.13.2 / RosettaSciIO 0.15.0 / NumPy 2.5.4 and Node 24.16.0:

- Four full worker cases PASS: complex64/complex128 × DM3/DM4, nonzero and
  negative imaginary values, exact raw NPY/export, explicit component/crop,
  component numerics/geometry, recovery/conflict and unsupported operations.
- Actual stdio MCP → reader/worker → complex64 → explicit PNG/component
  probes/profile → exact complex export → new-client original-ID recovery →
  Panel component update → Figure recipe → CLI component/reopen PASS.
- Independent second audit: 26 checks PASS with separately created values,
  signed axes/origins, direct payload/NPY comparison and operation refusals.
- Light `npm test`: 238 PASS, 4 existing opt-in SKIP, zero failures. Targeted
  recipe/contract checks additionally include complex64 component profiles.
- Existing TIFF, DM4 and real nD stdio smokes are checked separately; CI runs
  the retained reader cases and the new complex cases on the final commit.

An initial test exposed float32 rounding in amplitude/power before binary64
reductions; component arithmetic was promoted explicitly, preserving raw
storage and the numerical assertion. A negative fixture initially changed the
thumbnail's type; it now changes the actual scientific entry so packed rejection
is tested directly. Earlier local failures are retained, not relabelled PASS.

Actual browser evidence is reported separately by the PR. Real complex
experimental files, Mac device use, live DM and physical wave/phase conclusions
remain **NOT_TESTED**. Synthetic format support is not universal DM coverage.
