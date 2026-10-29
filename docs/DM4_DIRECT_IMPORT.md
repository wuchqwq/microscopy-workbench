# Direct read-only DM4 import

Open a supported `.dm4` directly in Microscopy Workbench. DigitalMicrograph,
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
DM4. If absent, `MISSING_DEPENDENCY` identifies `requirements-dm4.txt`; TIFF and
saved-capture tools remain available.

The initial range is one **scalar 2D dataset**, not an arbitrary DM volume:

- Admitted storage types: uint8/16/32, int8/16/32, float32/64, subject to the
  reader and existing finite-value checks. Arrays keep their original dtype.
  Synthetic end-to-end qualification covers uint16/uint32; the local ADF case
  additionally checks real uint32. Other listed dtypes are reader-admitted,
  not separately real-specimen-qualified.
- Existing capture bounds remain 4,194,304 pixels and 64 MiB per plane; no
  implicit resize, 8-bit quantization, float32 conversion or stack slicing.
  Existing downstream operation limits also remain in force.
- RosettaSciIO excludes thumbnail entries identified by the file's explicit
  `Thumbnails` tags. This adapter does not assume the first image is science.
  RGB without explicit thumbnail identification, complex/packed arrays and
  navigation volumes are rejected before pixel decoding.
- Exactly one eligible scientific dataset is selected automatically. For
  multiple datasets inspect the catalog and start a new workspace with
  `--dataset 1`, `--dataset 2`, etc. Names/shapes/dtypes are included in the
  selection error. A failed startup is retained, not silently rebound to a
  different request. `--dataset` is human one-based; MCP `dataset_index` is
  zero-based in the non-thumbnail catalog. It is not a raw ImageList index.
- `--frame` must be 1 (MCP `frame_index:0`). Multiple ImageList datasets are
  not interpreted as depth slices. A different frame is explicitly refused.
- DM3 is not enabled in this first adapter. A malformed file missing required
  tags may be rejected by the reader; no guessed tags or encoding repair are
  inserted to make it load.

## MCP and identity

`image_open` detects `.dm4` only when `source_kind` is omitted; explicit
`source_kind:"dm4"` is also supported. Explicit `"tiff"` keeps the TIFF reader
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

Actual X/Y `Scale`, `Origin` and `Units` tags are retained in `dm-metadata.json`.
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
inconsistent or unsupported calibration stays pixel-only. Valid empty-unit
files still support preview/ROI/FFT and pixel-period measurements.

File calibration is stored evidence, **not independent metrological
verification**. Unit aliases are explicit, including Å; no guessed byte
encoding is used. Brightness calibration is retained but not applied to stored
values. Raw intensity is not automatically electrons, counts, phase radians,
depth or proof of a material. Source SHA-256, reader/version, dataset, dtype,
axis order and calibration ancestry accompany normal NPY/provenance exports.
PNG remains display only. User scale corrections create new records and keep
the original file tags and old results.

## Reader choice and license

The optional dependency is pinned to **RosettaSciIO 0.15.0**, Python >=3.10.
Its [official DM reader documentation](https://rosettasciio.readthedocs.io/en/v0.15.0/supported_formats/digitalmicrograph.html)
documents lazy reading and incomplete format coverage. The adapter uses its
reader plus pinned metadata shape/type helpers for preflight, not a local DM
parser. Upstream API changes require adapter review and requalification.

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
npm run test:dm4
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
