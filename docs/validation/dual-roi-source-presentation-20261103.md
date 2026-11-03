# Source comparison presentation — 2026-11-03

Base: `8f6f08789fd7c6ae41639c1f8957170fd2d8dbff` (the existing desktop,
explicit-save, source-asset and closeout stack). This change is presentation and
bounded saved-asset transport; it adds no scientific algorithm or navigation store.

## Diagnosis and original evidence

The prior independent Windows review retained a visibility failure: saved ROI
outlines were clear in the editor but difficult to identify in a reduced passive
comparison. The exact saved PNG still contained them. Root's new isolated public
baseline compared the same object at 100% and Fit: reducing raster text made it
small, while even at 100% one ROI title overlapped an FFT calculation-area title.
These observations are separate from the older indefinitely blank scene.

An added joint-label check also exposed a local shared-layout defect:
`place()` chose candidate x/y, then spread the complete label extent over those
coordinates. Since that extent contained anchor x/y, the candidate was discarded.
The one-line spread-order repair preserves manual/pinned offsets and scientific
anchors; automatically positioned labels now use the existing placement result.
The original collision failure remains in the external logs.

## Bounded repair

The existing asset endpoint can additionally return a qualified clean PNG from
the exact saved object's existing render base. It reuses the prior native path,
PNG signature/hash and panel checks, adds matching grid/display and PNG-size
qualification, and retains the final window/object/collection fence. It does not
call `image_preview`, create a clean PNG, skip ancestors, or use a latest-view
substitute. This requires one additional fresh base metadata read where the base
is separate; the complete ancestry still uses its existing bounded read.

The passive window uses clean pixels plus the existing `transformCoordinates`,
`layoutAnnotations` and SVG renderer only when the pair and all visible anchors
qualify. Outline and font sizes remain screen sized. An old object without a
separable qualified layer keeps its single baked PNG; it never receives a second
copy of the annotations. Pending/failing checks retain explicitly labelled old
pixels without claiming the new annotation layer is complete.

Each saved object's own annotations are used. A latest-observation reference is
only a version caption; it does not supply ROI coordinates. Ordinary ROI labels
are placed first, then the same layout routine avoids them for gold/dashed FFT
processing-region titles. These auxiliary layers have no hit targets or handles.

`WindowWorkspace.tileAndFitAll()` explicitly tiles the existing windows, waits
for qualified assets and then invokes the existing active/per-window Fit and
camera metadata path. Ordinary tile, refresh and restoration remain camera
neutral. Scientific gestures, changed targets, failed assets or a later user
camera intent refuse the final Fit rather than overwriting a new view. The app
must call `noteCameraIntent()` for actual wheel/slider/Fit/pan input; integration
of these calls belongs to the companion UI change. No automatic asset retry or
scientific computation is added by tile-and-fit.

## Evidence and limits

External logs are `dual-roi-source-vector-*-20261103.log` in the parent task
directory; no original screenshot or earlier failure was replaced.

| Check | Result and scope |
| --- | --- |
| Locked npm dependencies and formal TypeScript build | PASS; two initial narrowing failures retained |
| Initial affected-consumer run | 88 PASS / 8 FAIL; old status/call-count expectations retained, then precisely updated for the new contract |
| Joint ordinary/FFT title collision test before layout repair | FAIL retained; repaired 100%/Fit cases PASS |
| Five directly affected UI/HTTP/presentation/export files | 122 PASS / 0 FAIL; includes history binding, no duplicate overlay, legacy fallback and shared manual/pinned behaviour |
| Final tile/camera-intent subset after the last intent guard | 5 PASS; completed user zoom during asset waiting is preserved |
| Separate clean-base corruption negative | PASS; existing base hash mismatch refuses without a new preview |
| One actual MCP + HTTP public-fixture seam | PASS; A shown instead of later B, clean PNG/hash/mapping qualified, two NPY files and original source unchanged, zero read-created scientific requests and zero FFT calculations |
| First smoke invocation from source rather than compiled path | Infrastructure module-not-found before provider startup; retained, corrected to `dist/tests/...` |
| Native 100%/Fit after the repair and final two-ROI workflow | NOT_TESTED by this implementation subtask; root performs the combined frozen-version check |

No unrelated GPA/topology/scattering/noise suite was run. The actual MCP seam is
`MICROSCOPY_PYTHON=... node dist/tests/window-asset-vector-mcp-smoke.mjs` after the
formal build. It creates only its own public temporary input and retains that
fixture on failure. Real specimens, scientific accuracy and full GUI acceptance
are not qualified by these checks.
