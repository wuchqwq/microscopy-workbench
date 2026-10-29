# Figure Composer MVP

Create a paper figure from saved scientific views without recomputing them.
Open **组合图版** in the Image Panel. It uses the same scientific provider and
does not require a model session, DigitalMicrograph or the old repository.

1. Open a saved original, ROI or FFT; finish saving annotation/display edits.
   Enter an optional panel title and choose **加入当前保存视图**.
2. Navigate to another saved result and add it. Reading a clean display asset
   may save a display-only render, using the existing original-request journal;
   it does not compute a new FFT or measurement.
3. Optionally calculate a profile with the existing profile tool, then choose
   **加入最近有效剖面**. This embeds that saved profile's samples and axes as a
   vector plot. It never samples the PNG or interpolates additional values.
4. Choose **2 × 2** (exactly four panels) or **1 × 3** (exactly three), edit
   titles, reorder panels, and set the common 7–12 pt font. Extra panels must
   be removed explicitly. Subfigure letters a–d are assigned automatically.
5. Download the ZIP containing `composition.svg`, `composition.png` and
   `composition.json`. SVG retains vector annotations, axes and curves; PNG
   rasterizes the same complete SVG at 180 mm / 300 dpi.

Restore `composition.json` through the file input in this dialog. Keep the
original scientific workspace: the layout stores immutable object references,
calibration/grid identity, display recipes and clean-PNG hashes, not scientific
arrays or a portable copy of the provider. Missing or changed objects, wrong
hashes, calibration mismatch and unrelated clean assets are refused. Reopening
a layout does not adopt its image as the current view or overwrite a draft.
Layout changes made while a file is being read also take precedence over the
older import.

The first version supports rendered original/ROI/FFT/annotated views and saved
width-one, nearest-sampled profiles with 2–4096 samples. It does not assemble
measurement tables or arbitrary files. Export is bounded to four images,
2 MiB per clean PNG and six million output pixels. Restoring checks saved
records through `image_info`; on the tested Windows environment this takes
noticeably longer than changing layout locally. There is no hidden scientific
recomputation during that wait.

Scientific values, signed scales, calibration versions, candidate/confirmed
annotation status and original requests remain in their provider records.
The composition is a presentation artifact, not a new scientific array or
phase-identification result. Export scientific NPY/data through **科学数据**
separately. Layout JSON/SVG metadata may contain source provenance; review it
before sharing private experimental data.

## Validation

See [migration acceptance](MIGRATION_ACCEPTANCE.md) for the independent runtime,
startup command, actual profile CSV and baseline browser workflow. Composer
acceptance uses that public synthetic TIFF, its saved ROI and the same single
complex FFT, plus a saved 128-point profile. No private specimen data is used.

Executed on Windows Chrome with the real standalone stdio/Python provider:

| Check | Result |
| --- | --- |
| Final lightweight `npm test` | 220 PASS, 0 FAIL, 4 existing opt-in SKIP |
| Composer identity, bounds, recovery/UI ordering and export tests | 23 PASS, 0 FAIL |
| Real synthetic TIFF/FFT/NPY/reconnect science smoke | PASS |
| Actual browser 2×2 and 1×3 PNG/SVG/JSON export | PASS |
| Restore layout after browser reload, without adopting its scientific view | PASS |
| Restore preserves current unsaved Gamma 1.2 draft | PASS |
| Wrong clean-PNG hash is refused; existing layout/draft survive | PASS |
| Independent saved-array, PNG, coordinates, axes and calibration checks | PASS |

The initial 1×3 export clipped a long legend. That visual FAIL was retained;
the final renderer wraps the complete text at the same 9 pt, and a new actual
browser export was independently inspected. The original TIFF and prior science
records remained unchanged; layout restore/export did not create a second FFT.

[Actual browser screenshot](examples/composer/browser.png),
[2×2 PNG](examples/composer/2x2.png), [1×3 PNG](examples/composer/1x3.png),
and the baseline [actual profile CSV](examples/migration/profile.csv) are public
synthetic examples. Raw compositions retain workspace references and therefore
remain with the local acceptance workspace, rather than implying that a JSON
file alone can recreate scientific results in an empty checkout.

Mac, real DM, ordinary MCP-client model vision and optional structure simulation
execution remain **NOT_TESTED** for this feature. No GMS build or full native
regression was run. The remaining practical limitation is that restoring a
layout requires the original scientific workspace and sequentially verifies its
saved references; it is not yet a self-contained portable figure project.
