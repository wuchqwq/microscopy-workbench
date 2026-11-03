# Manual image-ruler calibration — 2026-11-03

Functional commit: `47635c5421d8cbccce37882c430dc95169a5f55f`.
An admission-correlation follow-up below is required before final native freeze;
the final source SHA is recorded in the combined acceptance report.
Base: `6ce0fcbcf88412bdde3894d70c94744dec0cee2b`, containing the complete
desktop/save, comparison-source and dual-ROI UI candidate stack. This is an
additional explicit GUI entry to existing versioned `image_calibrate`.
No numerical engine, scientific database or save lifecycle is replaced.

## Actual entry and limits

On a qualified spatial image, draw or select a **测量线 (L)** along the two
ends of an image's known ruler. The line's context actions expose
**用已知长度定标**. The dialog shows its original floating-point source-pixel
endpoints and length. Supply the known positive length and nm, Å or µm, then
explicitly confirm **我确认按相同、正向的 X/Y 像素尺寸定标** and choose
**应用新标定**. **Ctrl+S / 保存工作区** remains the explicit analysis save.

One line supports only that declared isotropic positive scale. It does not
independently determine separate X/Y scales, axis flips, image distortion,
sample identity or calibration uncertainty. An existing active signed or
anisotropic calibration is refused by this shortcut; the existing advanced XY
form remains available for an explicit two-axis revision. Its action is now
called **应用新标定**, reflecting the unchanged working-edit behavior.

The shortcut needs an exact known frame, one unambiguous spatial mapping and a
finite nonzero line entirely in the displayed source bounds. FFT/frequency,
missing/foreign frame, duplicate mapping and unknown source IDs are refused.
The physical length is the researcher's statement, not OCR or an inferred unit.
The new version stores exact endpoints, source/view identities, known length
and unit, pixel length, isotropic assumption, unknown uncertainty, optional note
and a distinct GUI attempt nonce in its existing `source_text`. Original input
files, old calibration records, FFTs and measurements retain their own history.

Opening/cancelling performs no scientific write, clears no draft and changes
no selection or camera. Dialog keyboard/native-menu actions do not leak into
the canvas. The actual API dispatch revalidates the exact image, frame,
mapping, selection, draft revision and later local dirty state after asynchronous
draft delivery. The pending attempt survives closing the dialog and also blocks
advanced calibration/withdrawal, so changing entry points cannot replay it.

If the response is unknown, the existing **查询上次原请求** uses the exact original
request. When the ID itself was lost, a read of the existing state may bind it
only after the server's `last_operation.calibration_input` matches the complete
frozen source/view, revision, parameters and nonce, and the operation is no
longer submitted. A previous operation, legacy missing field, different input,
different nonce or still-running operation does not qualify. The two existing
calibration/display calls carry that diagnostic association; subsequent unrelated
operations do not inherit it. This adds no route or new execution journal.

## Evidence

Logs are retained outside Git at `F:/mircograph-workbench/manual-scale-*20261103.log`.

| Check | Result and scope |
| --- | --- |
| Locked `npm ci`; formal TypeScript build | PASS |
| Original development subset | 9 PASS / 1 FAIL: the purported changed-line test redrew an identical selection, so it did not create a new lease; retained |
| Revised development subset | 9 PASS / 1 FAIL: a reason edit did not increment the draft revision; retained, and the real dispatch guard now also checks local dirty state |
| Final affected UI/helper/legacy reciprocal-calibration subset | 12 PASS / 0 FAIL; cancellation, invalid values, original endpoints, signed/anisotropic rejection, late edit, modal shortcut protection, unknown result, exact-ID query and no-ID readback discrimination |
| Initial real MCP/HTTP probe | FAIL at test cleanup: all preceding calibration, transport-abort, original-result, measurement and hash assertions reached completion, but the harness requested normal close while the analysis was dirty, then attempted cleanup close twice; the second owner conflict hid the first close refusal. Original log and public fixture retained |
| Corrected real MCP/HTTP probe | PASS: actual aborted response; exact original recovered; one calibration request, zero FFT requests; 20 px maps to 10 nm; all 7 pre-existing object files and source bytes unchanged; old pixel-only measurement unchanged; unrelated measurement has no correlation field; module HTTP 200 with JavaScript MIME; explicit save/close HTTP 200 |
| Independent tail-review admission negative on 47635c5 | FAIL retained: a formal ownership rejection rebuilt `not_submitted` without `calibration_input`; discarding the error reply left no exact state-only request binding |
| Admission-correlation follow-up | Formal build and 2 admission/stdio checks PASS: preserves the internal operation context on rejection, derives only the exact original ID from fresh state, rejects another attempt, recovers without a provider query or worker spawn; no provider request/object is created by the rejected calibration |
| Native mouse gestures, window sizing and real image-ruler localization accuracy | NOT_TESTED by this implementation subtask; parent performs the frozen combined Windows workflow separately |

The pure helper test is registered in the existing explicit Node test list.
No unrelated FFT/GPA/topology/scattering/noise suite was run. Provider and HTTP
tests are not native gestures, human usability acceptance or experimental
calibration validation.

The admission follow-up logs are
`manual-scale-admission-first-failure-20261103.log` and
`manual-scale-admission-fixed-tests-20261103.log` in the parent local evidence
directory. This negative uses formal stdio admission and real Panel HTTP state;
its discarded error body is a controlled substitute for a lost response, not a
second native or actual-network-abort claim. The existing successful actual
abort probe was not repeated after this one-branch correction.

The manual boundary command, after the locked install and formal build in the
source checkout, is:

```powershell
$env:MICROSCOPY_PYTHON = 'F:\Scientific Python\python.exe'
node tests/manual-known-length-mcp-smoke.mjs
```

It creates only a public 16×24 uint16 TIFF in its own temporary workspace. An
explicit synthetic assumption maps a 20 px source line to 10 nm (0.5 nm/px).
The probe aborts only the HTTP response after the original provider calibration
has completed, reads the still-pending diagnostic, waits for the original
operation, queries that exact original saved request, measures the same line and
checks that an unrelated measurement does not inherit the correlation. It also
checks the new module's real HTTP 200/MIME, original file/old object hashes,
one calibration request, zero FFT requests and explicit save followed by close.
On failure its public workspace remains; successful temporary cleanup checks
the resolved directory under the actual temporary root. It does not open any
user window, use private samples or change global configuration.
