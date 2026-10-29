# Direct read-only DM3/DM4 plane import

Open a supported `.dm3` or `.dm4` directly in Microscopy Workbench. DigitalMicrograph,
the mcp-dm checkout and a model session are not required. This is **external file
decoding with RosettaSciIO**, followed by the existing external image tools;
it is not a DM native operation, DM SaveAs or a fallback after a native failure.

## Install and open

In the separate image Python environment (never GMS Python):

```powershell
& 'C:\analysis\image-env\Scripts\python.exe' -m pip install -r requirements-images.txt -r requirements-dm4.txt
node tools/researcher_inspector.mjs `
  --source 'C:\data\adf.dm4' `
  --workspace 'C:\analysis\adf-workspace' `
  --python 'C:\analysis\image-env\Scripts\python.exe'
```

Open the printed private loopback URL. ROI, FFT, measurement, statistics,
profile, annotations and exports use the same tools and saved scientific
records as TIFF. Keep the terminal running; stop normally with Ctrl+C.
Reopen using the same workspace and Python without `--source`; this reads the
saved view and does not repeat FFT. The optional reader is imported only for
DM3/DM4. If absent, `MISSING_DEPENDENCY` identifies `requirements-dm4.txt`; TIFF and
saved-capture tools remain available.

The real-data path supports a **real scalar 2D plane**. A source can contain rank
2–6 arrays, but the tools do not process a whole volume as an image:

- Admitted storage types: uint8/16/32, int8/16/32, float32/64, subject to the
  reader and existing finite-value checks. Arrays keep their original dtype.
  Synthetic end-to-end qualification covers uint16/uint32 and selected float32 planes; the local ADF case
  additionally checks real uint32. Other listed dtypes are reader-admitted,
  not separately real-specimen-qualified.
- Existing capture bounds remain 4,194,304 pixels and 64 MiB per plane; no
  implicit resize, 8-bit quantization, float32 conversion or stack slicing.
  Existing downstream operation limits also remain in force.
- RosettaSciIO excludes thumbnail entries identified by the file's explicit
  `Thumbnails` tags. This adapter does not assume the first image is science.
  RGB without explicit thumbnail identification, packed complex arrays and
  ranks outside 2–6 are rejected before pixel decoding; navigation data require an explicit
  bounded plane selection, described below.
  Ordinary stored 2D complex64/complex128 has a separate explicit
  [component path](DM_COMPLEX_IMAGES.md), with raw complex NPY preserved;
  complex navigation volumes remain refused.
- Exactly one eligible scientific dataset is selected automatically. For
  multiple datasets inspect the catalog and start a new workspace with
  `--dataset 1`, `--dataset 2`, etc. Names/shapes/dtypes are included in the
  selection error. A failed startup is retained, not silently rebound to a
  different request. `--dataset` is human one-based; MCP `dataset_index` is
  zero-based in the non-thumbnail catalog. It is not a raw ImageList index.
- `--frame` must be 1 (MCP `frame_index:0`). This compatibility field does not
  choose a navigation/depth axis. Multiple ImageList datasets are not depth
  slices. Rank >2 needs explicit plane selectors; no hidden default picks the
  first plane or the final two axes.
- DM3 and DM4 headers must agree with their file extension. Only little-endian
  pixel payloads are qualified: the pinned reader maps native NumPy pixel dtypes,
  so big-endian inputs are explicitly refused before any data array is created,
  rather than guessed or silently byte-swapped. A malformed file
  missing required tags may be rejected by the reader; no guessed tags or
  encoding repair are inserted to make it load.

## MCP and identity

`image_open` detects `.dm3` / `.dm4` only when `source_kind` is omitted; explicit
`source_kind:"dm3"` / `"dm4"` is also supported, matching the extension. Explicit `"tiff"` keeps the TIFF reader
and never switches. Existing TIFF/capture request payloads, IDs and recovery
records remain unchanged. Save each `request_id` before submitting writes;
after cancellation/timeout query `image_result` with that ID.

`image_open` creates a hashed, lazy `dm_source` catalog. `image_frame` selects
the bounded plane and writes a fixed read-only scientific snapshot into the
workspace. It rechecks file identity and catalog before/after reading. The
one-request Python worker owns any lazy reader mappings and closes them on
exit; no persistent reader is held by the browser. Changes to the source
file are rejected, rather than splicing two states together. This is not an
atomic capture of a file being edited elsewhere; do not edit it during import.

## Calibration and scientific provenance

Actual selected X/Y `Scale`, `Origin` and `Units` tags are retained in `dm-metadata.json`.
Recognized, compatible signed axes activate the existing versioned calibration
mechanism with source **`dm_file_metadata`**, separately from `native_dm_capture`
and user statements. Reader defaults are never evidence of missing raw tags.
The DM convention is:

`physical(index) = (index - raw_origin) * signed_scale`

Thus the physical value at original pixel zero is `-raw_origin * signed_scale`.
XY can be unequal or negative; crops retain original source coordinates.
Known real-space units support lengths, scale bars and signed cycles/pixel →
cycles/length FFT conversion without recomputing complex data. Recognized
inverse-length axes remain reciprocal; domains are not interchanged. Unknown,
inconsistent or unsupported calibration stays pixel-only. Reader-identified
spectroscopic axes (including Wavelength in nm) retain their raw tags but cannot
activate spatial XY distances merely because their units look like length. Valid empty-unit
files still support preview/ROI/FFT and pixel-period measurements.

File calibration is stored evidence, **not independent metrological
verification**. Unit aliases are explicit, including Å; no guessed byte
encoding is used. Brightness calibration is retained but not applied to stored
values. Raw intensity is not automatically electrons, counts, phase radians,
depth or proof of a material. Source SHA-256, reader/version, dataset, dtype,
axis order and calibration ancestry accompany normal NPY/provenance exports.
PNG remains display only. User scale corrections create new records and keep
the original file tags and old results.

## Explicit multidimensional planes

First inspect `dm_catalog.datasets`: shape and axes use original NumPy order.
`plane_axes_options` lists ordered pairs `[output_Y_axis, output_X_axis]` that
fit the present budget. Choose the two axes intentionally and fix **every**
other axis. For a synthetic shape `[2,3,4]`, this example returns `data[:,1,:].T`
with output shape `[4,2]`:

```powershell
node tools/researcher_inspector.mjs `
  --source 'C:\data\volume.dm3' --workspace 'C:\analysis\plane-workspace' `
  --python 'C:\analysis\image-env\Scripts\python.exe' `
  --plane-axes '2,0' --plane-indices '*,1,*'
```

Equivalent MCP parameters are `plane_axes:[2,0]` and
`plane_indices:[null,1,null]` on `image_frame`. Axes and fixed indices are
zero-based; CLI `*` is the same as MCP null. These nulls designate plane axes,
not unknown fixed indices. Both selectors must be supplied together. Optional
`--dataset` / `dataset_index` still selects a distinct scientific ImageList
entry. Array axes, dataset identity and frame compatibility number are separate.

The immutable frame saves `dm_plane_selection`: original shape, ordered axes,
all fixed indices, output shape and lazy chunk budget. Signed scales and raw
origins follow the chosen axes and explicit transpose. The source catalog and
raw calibration of all dimensions remain in provenance. Existing ROI, FFT,
profile, measurements, annotations and exports operate in this selected plane's
source-pixel coordinates; they do not silently mix indices from another plane.
The full nD mapping remains available in the saved parent frame/sidecar.

The pinned reader constructs one-index chunks along fixed axes and full chosen
plane dimensions along the two output axes. Selection and transpose happen
before `compute`; a full navigation volume is never used as fallback. Limits
remain 4,194,304 pixels / 64 MiB per decoded plane and 4 GiB per source file;
the selected orientation must also fit a 4096-chunk graph budget. Missing,
invalid or oversized selections are explicitly refused. A valid large source
is not a promise of unrestricted 4D-STEM or volume processing.

Missing XY units remain pixel-only. Metadata on fixed dimensions is retained,
but an index or a nominal slice step is not a demonstrated physical depth or
axial resolution. User corrections remain image-scoped to this fixed plane;
there is no new automatic volume-wide calibration scope. The GUI reselecting
frame 1 preserves the current explicit plane instead of reverting to a default.
The model-free launcher stores selectors and resumes saved results without
recomputing; changing selectors requires a new workspace or explicit new tool
request. Old 2D DM4/TIFF requests add no new default selector fields, and prior
DM4 catalogs and original request records continue to work.

<a id="why-direct-complex-data-remain-refused"></a>

## Ordinary complex data and remaining packed limits

Ordinary 2D complex64/complex128 DM types 3/13 now have an explicit component
path; see [ordinary complex images](DM_COMPLEX_IMAGES.md). Raw dtype/real/imag
values and NPY remain intact; first preview/numeric observation requires
`real`, `imag`, `amplitude` or `power`. Complex storage does not make a frame a
provider-generated FFT or physical wavefunction. Ordinary complex nD, packed
types 5/27/28, phase display and imported-complex FFT/compare remain refused.
The real-input float64 processing path is guarded before any cast. The pinned
vendor packed-spectrum unpackers still need independent format/axis/budget
qualification.

## Reader choice and license

The optional dependency is pinned to **RosettaSciIO 0.15.0**, Python >=3.10.
Its [official DM reader documentation](https://rosettasciio.readthedocs.io/en/v0.15.0/supported_formats/digitalmicrograph.html)
documents lazy reading and incomplete format coverage. The adapter uses its
reader plus pinned metadata shape/type helpers for preflight, not a local DM
parser. The [pinned implementation](https://github.com/hyperspy/rosettasciio/blob/v0.15.0/rsciio/digitalmicrograph/_api.py)
is the basis for the explicit endian and complex-layout restrictions. Upstream API changes require adapter review and requalification.

[PyPI metadata](https://pypi.org/project/rosettasciio/0.15.0/) declares
**GPL-3.0-or-later**; see the upstream
[COPYING file](https://github.com/hyperspy/rosettasciio/blob/main/COPYING.txt).
It is installed optionally and is not vendored in this repository. Bundlers
must assess their own license obligations; this document does not assert that
optional loading removes them. Its base dependency set includes Dask, NumPy,
Pint, python-box, python-dateutil and PyYAML; no HDF/GPU extras are needed here.

[openNCEM/ncempy](https://github.com/ercius/openNCEM) was also evaluated. Its DM
reader was used only as an isolated independent local numerical check, never
a runtime fallback. Its broader package dependency set and first-dataset
selection behavior were unnecessary for this adapter. Its repository
[license](https://github.com/ercius/openNCEM/blob/main/LICENSE) is GPLv3; inspect
file/package notices rather than assuming the whole package is MIT.

## Bounded validation

Run targeted tests after installing the optional dependency:

```sh
python -B tests/dm4_import_test.py
python -B tests/dm_planes_test.py
npm run test:dm4
npm run test:dm-planes
```

The fixture writer is a small **test-only independent encoder**; it is not a
runtime parser/writer or an experimental-data fixture. Tests cover an explicit
RGB thumbnail, high/max uint32, anisotropic signed scale/nonzero origin,
multiple dataset refusal/selection, empty units, Å, source changes, no silent
defaults, missing optional dependency, unchanged TIFF request routing and
original-ID recovery. The real stdio test runs preview → FFT → calibrated
geometry → exact NPY → reconnect, plus Panel HTTP.

The Windows local specimen check is recorded separately in
[DM4 acceptance](DM4_DIRECT_IMPORT_ACCEPTANCE.md). A parser pass does not
qualify all DM4 files, all library-supported types, a native DM operation,
Mac behavior, a model's image understanding or phase identification.

The [DM3 / selected-plane follow-up acceptance](DM_FILE_PLANES_ACCEPTANCE.md)
separates synthetic numerical/stdio/HTTP checks from untested real DM3/volume
and browser scopes. The earlier DM4/ADF report remains historical evidence.
