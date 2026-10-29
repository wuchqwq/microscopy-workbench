# DM3 and explicit DM-plane follow-up

This follows PR #3 at `5926f68`. The original DM4/ADF acceptance is retained;
it is not retroactively relabelled as DM3 or volume qualification. No main
merge, GMS operation, native ABI change or private specimen upload is involved.

## Researcher-visible increment

- Open a supported real scalar DM3 with the same Inspector and image tools.
- Select a bounded two-dimensional plane of a rank 3–6 real scalar DM3/DM4
  source, fixing every other index and explicitly choosing output Y/X axes.
  The selection can transpose axes, and follows their actual signed scales,
  origins and units. It does not turn navigation indices into depth or turn a
  complete volume into an image stack.
- Continue through existing preview, ROI, FFT, measurement, profile and NPY
  export. The model-free Inspector records the selection and reopens its saved
  result; its frame-1 action preserves the same chosen plane.
- Prior two-dimensional DM4/TIFF requests and saved objects remain usable;
  no empty/default selection fields are inserted into historical payloads.

Complex and packed data remain refused before pixel decoding. The reader can
represent ordinary complex types, but the current scientific object/preview
contract cannot treat a complex spatial wave as a produced FFT or silently drop
the imaginary part. The exact gap and next required scope are described in
[the reader guide](DM4_DIRECT_IMPORT.md#why-direct-complex-data-remain-refused).

## Actual Windows acceptance, 2026-10-29

Independent Python 3.13.2, RosettaSciIO 0.15.0, NumPy 2.5.4, SciPy 1.18.1 and
Node 24.16.0; no dependencies were installed into GMS Python.

| Scope | Result | Meaning |
| --- | --- | --- |
| Five existing DM4 worker cases | PASS | Prior scalar dtype/axis/origin/refusal/recovery checks still pass |
| New DM3/plane worker checks | PASS | Whole five-case run, followed by both added/changed endian and spectral-role cases; real decoder and fresh worker processes, not a mock parser |
| Light `npm test` | PASS: 232 passed, 4 existing opt-in skips, 0 failures | Routing/CLI plus existing lightweight provider/UI checks |
| Actual synthetic MCP / Python / Panel HTTP | PASS | Explicit transposed DM3 plane → profile → FFT → calibrated geometry → exact NPY → new-client recovery → frame reselection |
| Model-free Inspector start/close/reopen | PASS | Explicit plane is restored as the same saved object, with no FFT replay |
| Prior TIFF and DM4 real stdio smoke | PASS | Existing source formats retain their old numerical and recovery behavior |
| Prior PR #3 disk journal and catalog | PASS | Original source/frame IDs recovered unchanged; new no-selector frame admitted from old catalog with the same NPY bytes and XY calibration |
| Independent second audit | PASS: 8 checks | Separately created 4D fixture, hand-computed values/axes, identity conflict/recovery and cross-plane calibration rejection |
| Real DM3 / real volume data | NOT_TESTED | Only independent synthetic fixtures qualify this new range |
| Actual browser gestures on DM3/nD | NOT_TESTED | HTTP/launcher checks do not substitute for a browser interaction |
| Direct complex or packed scientific import | UNSUPPORTED | Remains a clear pre-decode refusal, not a successful computation |
| Real GMS/native, Mac device, phase identification | NOT_TESTED / not claimed | No host, client interpretation or material conclusion follows from these tests |

The synthetic 3D source has `value(z,y,x)=100+12z+4y+x`, shape `[2,3,4]`.
Selecting axes `[2,0]` and indices `[null,1,null]` gives exactly
`[[104,116],[105,117],[106,118],[107,119]]`, shape `[4,2]`. Output X uses original
axis 0 (`0.4 nm/px`, raw origin 3), output Y uses original axis 2 (`0.02 nm/px`,
raw origin 1.25). Physical pixel-zero coordinates are `[-1.2,-0.025] nm` within
binary64 rounding. Calibration uncertainty stays unknown, not zero.

The four-sample nearest profile is exactly `[104,105,118,119]`, and its physical
path follows the signed XY scales. A direct mathematical DFT checks the saved
complex FFT. Its explicitly chosen DC-to-`fx=-0.5 cycles/pixel` geometry is
`0.8 nm`; this is a coordinate/scale test, not a fitted reflection or phase.

A separate rank-4 hand-computable fixture uses
`1000*a + 100*b + 10*c + d`, shape `[2,3,5,7]`. Axes `[0,2]` and fixed indices
`[null,1,null,6]` produce `[106,116,126,136,146]` and
`[1106,1116,1126,1136,1146]`. This catches non-default axis selection as well as
transpose. Different fixed indices produce a distinct immutable frame; the
old request rejects changed parameters and its original result remains
queryable. A calibration bound to one plane cannot be attached to another.

Missing/duplicate axes, null fixed indices, out-of-bounds or Boolean indices,
the 4096-chunk graph limit, header/extension disagreement, unqualified endian flags and complex layouts
are explicit negative cases. A separately tagged CL wavelength axis in nm
retains its real array/calibration tags but cannot activate spatial length; its
measurement remains pixel-only. Original arrays/files remain unchanged. The
decoded-plane limits remain 4,194,304 pixels / 64 MiB and source files remain
bounded at 4 GiB; there is no new whole-volume fallback.

One early direct in-process diagnostic retained upstream lazy mappings until
process exit on Windows. The production model and final tests use one-request
workers, whose exit releases the mappings. Initial test-harness assumptions
about error exit status and existing unknown-uncertainty fields were corrected;
scientific tolerances and negative assertions were not weakened. Their earlier
local logs are retained separately from the final passing runs.

## Reproduce

Install the existing image requirements and optional `requirements-dm4.txt`
into an independent environment, then run:

```sh
python -B tests/dm4_import_test.py
python -B tests/dm_planes_test.py
npm test
# Set MICROSCOPY_PYTHON to the absolute independent interpreter.
npm run test:science
npm run test:dm4
npm run test:dm-planes
```

The fixture encoder is test-only, independent of the runtime reader and free of
experimental data. The small GitHub reader job includes these format-specific
checks; its final-commit result is reported separately by the PR. There is no
full GMS/C++ regression or broad format qualification claim.
