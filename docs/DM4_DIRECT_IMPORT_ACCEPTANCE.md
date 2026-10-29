# Direct DM4 import: bounded acceptance

This is the original PR #3 acceptance; [the DM3/selected-plane follow-up](DM_FILE_PLANES_ACCEPTANCE.md) is recorded separately.

Date: 2026-10-29. Base: `main@0fcbdcb`; this feature does not depend on the
separate GUI/Figure polish PR. No GMS process, native plugin or DM ABI is used.

Environment: Windows 11 x64 build 26300, Node 24.16.0, independent Python
3.13.2, RosettaSciIO 0.15.0, NumPy 2.5.4, SciPy 1.18.1, Pillow 12.3.0 and
tifffile 2026.10.15. Existing NumPy/SciPy were not upgraded for this adapter.

| Scope | Result | Evidence |
| --- | --- | --- |
| Light `npm test` | PASS, 230 passed / 4 pre-existing skips / 0 failed | Includes two DM4 routing/CLI checks; skips remain skips |
| Existing `npm run test:science` | PASS | Actual TIFF → signed calibration → ROI FFT → 0.8 nm geometry → NPY/direct DFT → recovery → Panel HTTP |
| `python -B tests/dm4_import_test.py` | PASS, 5 cases | Actual optional reader and one-request workers; synthetic high/max uint32, axes, origin, thumbnail, ambiguity, pixel-only, Å, rejection and recovery |
| Final selection-error check | PASS | Catalog lists dataset title/shape/dtype and human `--dataset` choice |
| `npm run test:dm4` | PASS | Actual MCP stdio → Python → synthetic DM4 → preview → FFT → 0.14 nm geometry → exact NPY → original-ID reconnect → Panel HTTP and inspector source |
| Legacy TIFF journal compatibility | PASS | A TIFF `image_open` saved by original `0fcbdcb` worker returns the exact original object through this worker with unchanged request payload and journal/files |
| Authorized real ADF, external file path | PASS, limited | Actual DM4 decode → 2048² uint32 → bounded ROI → FFT/geometry → NPY export → original-ID query; source unchanged |
| Real Chrome no-model DM4 opening/ROI/FFT/export | PASS, limited | Browser → Panel HTTP → MCP → Python; separate private browser workspace and screenshots |
| Native DigitalMicrograph | NOT_TESTED / not required | This adapter makes no live host calls and grants no native qualification |
| Mac/Linux execution | NOT_TESTED locally | Small synthetic Linux CI is configured; its result is separate from this Windows report |
| Model-client interpretation, phase/HKL identification | NOT_TESTED | No material conclusion is inferred from this import acceptance |

## Synthetic scientific checks

The public fixture generator is an independent small DM4 **test encoder**.
It writes known 5×7 uint32 values, including values above 2²⁴ and UINT32_MAX,
alongside an explicitly tagged RGB thumbnail. The saved uint32 and NPY export
match every input exactly. Signed scales `(0.02,-0.03) nm/px`, raw origins
`(1.25,-2.5)` and physical pixel-zero coordinates `(-0.025,-0.075) nm` are
checked separately. A direct DFT, rather than the worker's FFT implementation,
checks transform sign/shift and the complex output with a preset error bound.

Empty spatial units retain pixel-domain FFT/periods and no physical d-spacing.
Å survives as an actual Unicode unit; a raw missing Origin layout is explicitly
rejected by this reader version, rather than being repaired to zero. Multiple
science datasets require a choice and never become frame/depth slices. Source
changes, invalid frame/index, missing reader and unsupported layouts refuse
instead of quantizing, changing backend or guessing a thumbnail.

Earlier fixture-format and Windows cleanup failures were kept in the local
evidence history. The former corrected the independent test encoder's anonymous
dimension tags; the latter aligned tests with actual one-request worker
lifetime, because upstream lazy mappings may remain open until worker exit.

## Authorized ADF read-only scope

The already-authorized `ADF_10MX_12078.dm4` contains a 384² RGB thumbnail and a
2048² scientific uint32 image. The scientific array is selected using the
reader's explicit thumbnail metadata, not image order. Its stored XY scales are
both `0.009441631846129894 nm/px`, raw origins are zero, and physical pixel zero
is zero. This stored calibration is not the scale of a different TIFF sequence.

An independent second reader (isolated ncempy DM module) and direct raw-payload
read both match all 4,194,304 imported values. This specimen's range is
2,876,702–3,681,094, below 2²⁴: high uint32 precision is proved by the separate
synthetic maximum case, not by overstating this specimen's values.

The formal numerical path uses source ROI `[768,768,1024,1024)` (256²), subtracts
its raw mean and applies separable Hann before external NumPy FFT. Independent
analytic-Hann/NumPy and five explicit DFT bins (positive/negative/Nyquist)
agree: maximum complex difference `3.332e-8`, relative to the spectral maximum
`1.875e-16`. The preset DC vector `(16/256,8/256)` gives
`0.13511763600942897 nm`. It is a geometry contract check, **not a fitted peak,
reflection index or phase assignment**.

Frame, ROI and complex FFT NPY exports are independently reopened and matched
to saved arrays/manifests, including source identity, calibration and processing
parameters. Two new MCP clients each query eight original IDs (16 queries),
returning the same objects with no new request or object. This is reconnection
recovery evidence; no cancellation injection was executed in this round.

The original SHA-256 is unchanged:

`57d584b68baf13cee95cdad69c681352a7b32849faa0438d3cb5d215d4db37d2`

File size and modification time also remain unchanged. Source pixels, private
previews, exported specimen arrays and loopback access tokens stay local and
are not committed or uploaded. Independent reports live in the operator's
private `dm4-import-r1` evidence directory.

## Browser path and retained refusals

Real Chrome opened the actual file without DM or a model, showing scientific
2048² uint32 and automatically admitted file calibration. Mouse ROI selection
then a GUI FFT completed through the real scientific backend; science export
completed. Independent verification of these browser-created records passed
ten checks: the 257² ROI is source `[767,767,1024,1024)`, and its 255² FFT uses
source `[768,768,1023,1023)` (ROI-local `[1,1,256,256)`). Direct DFT bins,
analytic Hann, odd-size fftshift centre 127, physical axes and exported complex
NPY all agree. These are distinct from the prescribed 256² numerical case.
Screenshots of
the original, ROI and FFT are local because they contain private specimen data.

The initial browser inspector showed an unknown source despite a correct DM4
badge. The source lineage and inspector mapping now name external DM4, rather
than TIFF or native DM. The no-model helper reopens the saved FFT after this
repair; real Chrome confirms the source label, original file calibration and
saved 255² FFT. No second FFT is created on reopening.

Three mistakes in the private acceptance driver were correctly refused and
their failed IDs remain: source-space rect supplied to an already-cropped FFT
operand; an export whose parent directory did not exist; and exporting a
measurement-only record as though it contained a scientific array. Only known
failed operations used corrected new IDs; unknown writes were not replayed.
Measurement metadata/table and array export remain distinct.

## Reproduce without private data

1. Install `requirements-images.txt` and optional `requirements-dm4.txt` in an
   independent environment; run the two targeted commands in the reader guide.
2. Generate a new public synthetic input:
   `python tests/fixtures/dm4_fixture.py /absolute/new-fixture-directory`.
3. Open `signed-uint32.dm4` with `tools/researcher_inspector.mjs` as described
   in [the direct import guide](DM4_DIRECT_IMPORT.md).
4. Use ROI/FFT/measurement/export normally; reopen the same workspace to
   inspect saved results. No older checkout or DM installation is required.
