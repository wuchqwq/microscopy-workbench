# F1a acceptance record

This record covers the bounded multiscale structural-field implementation for
Issue #26, based on TS main `3ac32f84487a7d89706cf670165427875eed40ba`.
Public analytic fixtures are synthetic software-validation data, not experimental
specimen accuracy or calibrated statistical confidence.

## Actual executed scopes

| Scope | Status | Evidence |
| --- | --- | --- |
| Analytic public fixture generator | PASS | Source cosine formulas, exact orientation matrix and piecewise boundary; float32 TIFF generated with no FFT. |
| Strict compiled MCP → Python F1a numerical path | PASS, bounded scope | Windows `r2`: 18 windows, two scales, ordinary batches, field/map and seven controls. The complete smoke later failed at export; this row does not label that entire run successful. |
| Independent DFT / equal-budget uniform-window baseline | PASS | Every saved complex bin agreed within the unchanged `1e-7` absolute tolerance. Old uniform atlas arrays and measured vectors agreed exactly on the same 18 windows / 147,456 FFT pixels. |
| Saved measurement correction / FFT reuse | PASS | A committed correction fed a new field/map; all 18 FFT IDs/hashes and the other 17 measurement lists were unchanged. |
| Full export / named new-session recovery / Panel HTTP | FAIL / NOT_TESTED | Revised-field export completed in 117.314 s; revised-map export hit the unchanged 120 s deadline. Original request stayed incomplete. Later steps were not executed by that run. |
| Actual browser candidate navigation | NOT_TESTED | Computer Use stopped on URL-confidence validation; no alternate browser path was used. HTTP/image returns do not establish pointer gestures. |
| New model/plugin-discovery loading | NOT_TESTED | No claim based on a Node protocol client. |
| Real specimen accuracy / GPA / twin / dislocation / physical boundary uncertainty | NOT_TESTED | Outside this public synthetic F1a scope. |

## Reproduction and evidence boundaries

Follow [multiscale domain instructions](MULTISCALE_DOMAINS.md). The permanent
smoke retains raw request journals, immutable objects, generated inputs,
`report.json`, JSON/CSV/NPY/PNG export files and local Panel connection details.
Keep authentication fragments and private/local paths out of public excerpts.
Failed runs use new output directories; do not relabel or overwrite earlier
failures. Actual Browser, Windows, CI and model scopes are recorded separately.

The analytic matrix is `[[.8,-.6],[.6,.8]]`; source B is an exact proper rotation
of source A in reciprocal coordinates. Pixel-domain `+g/-g` form one family.
Single-domain translations change cosine phase but preserve local wave vectors.
A 32-pixel strip cannot be resolved as a pure B window by 64/128-pixel sampling;
mixed/unknown evidence is valid and no absence claim follows.

The default main plan has 18 windows, 64/128-pixel square sizes, 64-pixel stride
on a 192×256 frame, and 147,456 total FFT pixels. Both the new field and the
ordinary uniform-atlas baseline use exactly those windows and settings. Timings
include the actual work performed, including acceptance-only baseline runs;
window count alone is not a compute/performance measure. Worker startup is
unknown unless explicitly measured; record observed compute/render/tool times
without inventing provider-internal phases.

## Windows numerical results and preserved failures

The actual compiled package used an independent Windows Python environment and
formal MCP tools. The recorded `r2` main field required 39.266 s compute/validation
and 0.044 s render/write in one composition worker; its main map required
20.667 s compute/validation and 0.116 s render/write, with zero additional FFTs.
Startup remains unknown. The ordinary equal-budget three-atlas baseline took
30.893 s; it does not materialize the new domain graph and is not a claimed
speed ratio. These are observed times under this environment's load, not a
universal performance promise.

The two-orientation input produced two candidate components at each scale
(four total, **not four materials**). Its 24 same-scale neighbor edges were
16 compatible, three different and five unknown. Three finite boundary bands
all included the analytic X=128 interface; each extended from X=64 to X=192.
That is finite measurement support, not localization error or a confidence
interval. Coarse cross-boundary samples 13 and 16 were masked. Window-support
coverage was 100%; unknown support was 50%, with overlapping scales correlated.

Single A, phase-shifted A and globally rotated B controls each yielded one
candidate and no boundary. Constant and seeded-noise controls yielded four
unknown samples each, with no domains/boundaries. The square control retained
multiple submitted rotation alternatives. Tightening reciprocal tolerance from
0.003 to 0.001 cycles/pixel retained three boundary bands for the exact analytic
main input.

**Narrow-structure limitation:** the 32-pixel B strip was missed by the selected
64-pixel, 0.18-threshold control: one connected dominant-signature candidate and
no boundary were returned. Four samples were numerically usable; this does not
establish one homogeneous material. The finite sampling/detection failure is
retained, and no threshold was changed afterward to manufacture a success.
The method cannot exclude an unresolved narrow component.

Failure evidence remains in separate local run directories:

- `r1`: after an intentional budget rejection, the harness counted an unpublished
  reservation directory and tried to read its nonexistent manifest. The audit
  now counts committed manifests only. The budget refusal itself was correct
  and created no FFT; the harness failure was not relabeled PASS.
- `r2`: all numerical/control/revision checks above passed, followed by a real
  120.047 s domain-export timeout. Full elapsed time was 707.166 s, including
  acceptance-only baseline/control work. Original request
  `f1a-dd09f2608a-42` remained `prepared`; a new client's read-only original-ID
  query returned `INCOMPLETE_REQUEST` without replay. No replacement operation
  was automatically submitted; the old request and absent target stay preserved.

The complete `r2` smoke is **FAIL**. A focused repair and separately scoped
formal continuation must supply export/recovery/Panel evidence before those
scopes can be marked successful. The compiled `r2` numerical snapshot preceded
the final depth/gap preflight guards; those guards do not change its no-gap,
single-revision numerical path and need separate final qualification.
