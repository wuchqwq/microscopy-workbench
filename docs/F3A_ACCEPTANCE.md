# F3a projected phase-winding acceptance

Status: **PASS_LIMITED_SYNTHETIC_SCOPE** for the executed physics, provider,
compiled-compatibility and actual MCP checks below. This record does not qualify
a real specimen, GUI gestures, a new model session, native DM/GMS, automatic
defect recognition or unique conventional 3D
Burgers-vector identification.

The branch starts from validated F4/F2a integration candidate PR #37 at
`ea09c091af503b342bba86cb86a427da9c0efed5`, on
`feature/f3a-projected-topology`. Neither `main` nor the source branches are
moved by this work. PR #37 remains Draft/unmerged; validation does not imply a
main merge or public release. The scientific contract and checked primary sources are in
[PROJECTED_TOPOLOGY.md](PROJECTED_TOPOLOGY.md).

| Scope | Status | Evidence / boundary |
| --- | --- | --- |
| Primary source/sign review | PASS | 2026-10-30: Hÿtch 1998 publisher preview/section snippets, Peters 2015 full author text, official pyGPA source and MIT license. No full-paper-access claim for Hÿtch. |
| Independent analytic winding/closure oracle | PASS | `test_image_topology_physics.py`: 17/17, 2.297 s. Prescribed continuum texture and closure targets do not import the production topology solver. |
| Numerical path-quality and negative controls | PASS | Physics suite covers invalid paths, permitted interior core holes, near-pi/undersampling rejection, selected noise, invisible reflection, opposite-pair cancellation and smooth/affine zero-winding controls. This is no universal noise/alias detector. |
| Rank/redundancy/candidate semantics | PASS | Actual MCP two-direction result stays `constrained_candidate_without_redundancy`; three direction families and two nested loops pass conditional redundancy. Explicit correct/wrong candidates match/fail without a 3D-uniqueness claim. |
| Exact saved GPA/FFT/grid/calibration binding | PASS | Fourteen workspace tests and actual MCP: exact FFT identity even with matching bytes, bandwidth/calibration/local-ROI binding, fixed_g/exact-GPA admission, deduplication and contradictory-band refusal, source/request fingerprint and revision ancestry tamper refusal, stale-calibration export refusal. |
| Actual MCP stdio + independent Python | PASS | First actual run, 102.466 s, 37 formal tool calls including recovery/Panel calls; positive lattice -> saved FFT -> two saved GPA pairs -> topology, smooth-null control and upstream no-signal refusal. |
| Revision, scientific export and fresh-client recovery | PASS | Separate reversed-orientation revision; two export read-backs with hashes, NPY/JSON/CSV/masks/path-step checks and overwrite refusal; fresh-client original-request/result/info recovery creates no science/FFT. |
| Final compiled metadata follow-up | PASS | Path-sample offsets and spatial pixel-coordinate units distinguished; unchanged projected closure, old/new original request IDs recover exact saved objects, and the existing three FFT/four GPA counts remain unchanged. |
| Existing GPA scientific regression | PASS | Existing GPA core/physics/workspace suite 28/28, 14.501 s; unchanged independent optional environment. |
| Frozen compiled old-tool/workspace compatibility | PASS | 2/2, 41.264 s; exact frozen JS schema/workspace, original requests/context/export/remeasurement and old bytes/one FFT retained. No replay or schema relaxation. |
| Existing F4/GPA integration | PASS | 1/1, 129.999 s; exact 128px FFT reuse, 32px GPA refusal, budgeted F4 continuation/compact evidence, signed metric, immutable old field/FFT/source, both exports and fresh recovery. Exactly two F4 FFTs remain. |
| Compiled build | PASS | `npm run build` before the first actual MCP run, including the new typed smoke. Final current-tree checks remain a separate regression scope. |
| Final current-tree portable Node tests | PASS | 322 total: 316 passed, 6 explicit skips, 0 failures, 10.311 s. Skips are not counted as executed passes. |
| Final current-tree topology Python tests | PASS | 54/54, 44.326 s: 23 core, 17 independent physics, 14 workspace/provider checks. |
| Final current-tree TypeScript type check | PASS | `npm run typecheck`, 9.40 s. |
| Existing standalone science/direct-DFT smoke | PASS | Existing actual TIFF -> signed calibration -> ROI FFT -> 0.8 nm measurement -> NPY export/direct DFT -> display revision -> restart recovery -> Panel HTTP, with unchanged source. |
| Panel HTTP/read-only saved preview | PASS | Existing formal `image_panel_open`, `image_panel_current` and exact-original-request panel recovery return the same saved topology preview; PNG visually inspected. These checks do not qualify browser gestures. |
| Topology-specific real cancellation/worker-interruption injection | NOT_TESTED | Successful original-request and fresh-client recovery is not a real lost-response, cancelled-wait or interrupted-worker injection. |
| GUI gestures/browser/computer use | NOT_TESTED | Explicitly frozen for this stage. |
| Fresh ordinary model session choosing the Skill | NOT_TESTED | Scripted MCP use does not establish model comprehension. |
| Real specimen/experimental defect or calibration accuracy | NOT_TESTED | Public synthetic inputs only. |
| Native DM/GMS/vendor stack/hardware | NOT_TESTED | No new native connection, dependency or run. |
| F3b segmentation, automatic defect census, unique conventional 3D b, ptychography | NOT_TESTED | Outside F3a's conditional projected-evidence scope. |

Use PASS only for an executed check with inspectable evidence. FAIL records an
executed failure; NOT_TESTED means absent or insufficient evidence. A small
integer residual or an exact two-direction fit is not independent validation.
At least three nonharmonic direction families and distinct nested loops provide
redundancy only; shared contrast/noise artefacts can remain consistent.

## Independent physics evidence

The [public physics report](examples/topology/physics-results.json) records the
17 executed cases and original preregistered tolerances. The targets come from
`u=sum b*atan2(y-cy,x-cx)/(2*pi)+u_regular` and geometric core inclusion, rather
than calling the production contour algorithm to generate expected answers.
The [summary figure](examples/topology/physics-summary.png) labels every panel
as public synthetic evidence.

The positive and negative images produce `[-1,0,-1]` and `[1,0,1]` windings,
respectively, with inferred closures approximately `[8,0]` and `[-8,0]` pixels.
Smooth single-valued and finite-affine displacements produce zero winding.
An enclosing path around opposite cores also has zero net winding, despite
nonzero individually enclosed charges. The g vector `[0,0.125]` is blind to
the prescribed `[8,0]` closure. These zero outcomes do not establish defect
absence.

The contrast-only control has **true material closure `[0,0]`** by its declared
fixed-lattice model, yet its intensity is identical to the Volterra texture and
it produces the same `projected_topological_evidence` status and apparent `[8,0]`
image closure. This directly demonstrates why three directions and nested-loop
agreement cannot confirm a material dislocation. They only test internal phase
consistency under the supplied model assumption. The selected seeded-noise
paths remain unavailable; this does not prove rejection of every noise field.

An invalid path has null accepted winding fields in its JSON report and NaN in
scientific winding arrays. Explicit `diagnostic_winding_*` fields may retain a
finite arithmetic sum for inspection; those diagnostics do not make a rejected
path valid and must not become zero/no-defect evidence. Workspace regression
checks preserve that distinction on an actual saved edge-invalid circuit.

## Actual MCP evidence

The first run used Python 3.13.2, NumPy 2.5.4, SciPy 1.18.1 and scikit-image
0.26.0 from the independent environment. Its 256x256 float32 public image has
three carriers `[[0.125,0],[0,0.125],[0.125,0.125]]` cycles/pixel, sigma `0.012`,
reference rectangle `[56,56,88,88]` and positive nested loops
`[80,80,176,176]`, `[64,64,192,192]`. Two ordinary saved GPA records use pairs
`(g0,g1)` and `(g0,g2)`; repeated g0 is deduplicated, not counted twice.

The signed synthetic metric is `diag(0.02,-0.035)` nm/pixel. The resulting image
closure is `[7.999999999999997,0]` pixels and
`[0.15999999999999995,0]` nm. The rank is two, condition number `1.73205`, and
maximum leave-one-reflection-out residual approximately `5.20e-17` cycles.
These are arithmetic results for a periodic analytic texture, not experimental
precision or uncertainty. A two-direction result explicitly lacks redundancy.
Reversing both paths changes raw winding to `[1,0,1]` and retains the canonical
positive-image closure. Candidate `[8,0]` matches, while `[0,8]` does not.

The smooth Gaussian displacement-hotspot control produces all-zero windings.
The zero-signal source is refused by GPA with `GPA_INSUFFICIENT_EVIDENCE` before
any topology object is created. There are exactly **three forward FFTs**, one
for each explicit source. GPA, topology, revision, export and fresh-client
recovery add none. All positive-source FFT/GPA files and the earlier topology
object remain unchanged. The exported path arrays have 888 total samples,
offsets `[0,380,888]`, valid boolean masks and bounded wrapped increments.

Public sanitized evidence is [the MCP report](examples/topology/mcp-results.json),
[the circuit table](examples/topology/mcp-circuits.csv) and
[the actual saved preview](examples/topology/mcp-preview.png). The preview was
visually checked for the conditional title, explicit inner/outer loops, phase
vortex and gray invalid border. This was local PNG inspection, not computer use
or browser gesture acceptance. Owned Panel HTTP/current/exact-request recovery
was separately exercised through the existing formal tools.

The [final compiled metadata follow-up](examples/topology/final-metadata.json)
reuses those saved public GPA inputs after clarifying the `path_offsets` unit
as a concatenated path-sample offset, distinct from the local pixel-index unit
of `path_xy`. It retains the same projected numerical result, recovers both old
and new original request IDs, and leaves counts at three FFTs and four GPAs.
This is a metadata correction and recovery check, not new FFT/GPA qualification.

## Reproduction and retained attempts

Public text evidence uses LF line endings. Original runtime/export bytes and
their checked hashes remain in the retained local test workspace; normalizing
the public text copies does not change scientific arrays or numerical values.

Use the independent environment at an explicit `MICROSCOPY_PYTHON`, with
`requirements-gpa.txt`. No GMS-managed Python or new topology dependency is
required. Build before running the compiled smoke:

```sh
npm run build
npm run typecheck
npm test
python -B -m unittest discover -s tests -p 'test_image_topology_*.py' -v
python -B -m unittest discover -s tests -p 'test_image_gpa_*.py' -v
npm run test:topology
npm run test:integration:f4-gpa
npm run test:science
npm run test:compiled:compat
```

Set `MICROSCOPY_PYTHON` to the absolute independent interpreter. Optional
`MICROSCOPY_SMOKE_OUTPUT` must be a new absolute directory. The smoke creates a
public synthetic workspace and closes its own Panel helper; it does not touch
a user's analysis, browser or DM process. The first actual MCP run is retained
locally at `analysis/2026-10-30-f3a-live-r1/report.json` and passed without a
fixture, scientific tolerance or implementation change during that run. No
failed actual MCP attempt preceded it. Keep failed future reports rather than
overwriting them or relaxing a scientific tolerance to erase a failure.

The packaged Skill passed `skill-creator`'s `quick_validate.py` with Python UTF-8
mode. The first validator invocation used Windows' default GBK decoder and
failed reading existing UTF-8 text; rerunning with `-X utf8` passed without
changing the Skill encoding. This was a validation-tool encoding issue, not a
scientific test failure.

Final retained regression logs are local `analysis/f3a-final-node-tests.log`,
`analysis/f3a-final-python-tests.log`, `analysis/f3a-gpa-regression.log`,
`analysis/f3a-compiled-compat.log`, `analysis/f3a-f4-gpa-integration.log` and
`analysis/f3a-science-regression.log`. The current F4/GPA handoff again gives
`E_xx=0.06888889013447219` against independent target
`0.06888888888888889`; this is the existing periodic synthetic oracle, not
experimental strain precision. The frozen compiled check retains exact old
tool schemas while allowing only the explicitly named additive topology tool.
