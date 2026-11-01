# Round-two independent crystal / registration review

Reviewer: explicitly requested **gpt-6-astra**, delegated independent scientific review. Audited source: remote-main commit `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`, tree `82facfce75c5909c510cb5014e228918904f5de4`. This review does not use the open first-audit, intake, or GUI PRs as implemented behavior. No production edits, GUI, shared production workspace, private specimen, global configuration, launcher changes, or commits were made.

## Result and evidence boundary

The new analytic FCC example completes **actual saved-worker** structure open → orientation → two independent simulations → calibrated image/FFT observations → constrained registration → saved-registration comparison → general comparison and twin comparison. Correct and wrong alternatives produce the expected conditional statuses. The rotation fit uses only fit correspondences, and passing a saved registration to another simulation is rejected. This is a successful finite synthetic geometry test, not experimental crystallographic validation.

The new concern is **R2-C1: finite-resolution pseudo-holdout admission**. A point only 0.02 Fourier bins from a fitted source peak, asserted as another projected HKL, produces `held_out_validation_passed=true`. The same occurs near a conjugate peak. This is a method/status limitation requiring a scientifically specified observation-group policy; it is **not a demonstrated SVD arithmetic error**, and existing prose explicitly disclaims proof of resolving power. No minimal production numerical fix is proposed in this audit.

Raw originals are retained in:

- `analysis/algorithm-audit-round2-crystal-20261101-234148/`: completed 32-call main probe, all original worker requests/stdout/stderr, TIFF/CIF truth, saved objects/journals, and report.
- `analysis/algorithm-audit-round2-crystal-controls-20261101-234332/`: completed 18-call controls, using fresh request IDs against the previous saved workspace.
- `analysis/algorithm-audit-round2-crystal-20261101-234021/`: original failed fixture attempt (float64 TIFF); originals and original script retained.
- `analysis/algorithm-audit-round2-crystal-20261101-234124/`: original attempt including successful complete general/twin routes, followed by an out-of-contract UVW100 fixture; originals and original script retained.

The two failed attempts are **harness admission mistakes, not product findings**: TIFF admission explicitly supports uint16/float32, and orientation indices are bounded at 32. Corrections changed only the audit fixture in fresh output directories. No failed result was replaced. All **617** files recorded in the completed main report were hash-verified unchanged after controls appended new requests/objects. `evidence_summary.json` contains compact numeric outcomes, IDs, raw-report SHA256 values, runtime versions, and control outcomes; no large scientific arrays are committed.

## Independent truth and conventions

The main fixture uses a declared ideal conventional FCC lattice with `a=5 Å`, four full Cu sites, and a hand-written P1 CIF. This is a geometric model, not a claimed experimental material. Reciprocal coordinates are cycles/Å, without `2π`. The right-handed parent basis has rows `[1,1,-2]/sqrt(6)`, `[1,1,1]/sqrt(3)`, `[1,-1,0]/sqrt(2)`. The Sigma3 source operation is the explicit matrix `[[2,-1,2],[2,2,-1],[-1,2,2]]/3`. Simulations use `U_parent=Rz(23°) M` and `U_twin=Rz(23°) M T`.

Source images are independently calculated real cosines at `(M hkl/a)_xy` and `(M T hkl/a)_xy`, in adjacent 128×128 ROIs with signed anisotropic sampling `[5 sqrt(6)/128, -5 sqrt(3)/128] Å/pixel`. The selected source HKLs are `[111,11-1,220,113]`; the twin HKLs are `[111,-111,022,311]`. They give exact integer Fourier bins. The oracle uses elementary matrix arithmetic and cosine construction, **never a tested production orientation, simulation, registration, comparison, or peak function**. Every expected positive and negative Fourier location is checked against saved peak measurements, and both simulated unrastered reflection tables are checked against the independent 3D coordinates to `2e-12 Å⁻¹`.

The runtime is Python 3.13, NumPy 2.5.4, SciPy 1.18.1, ASE 3.29.0, diffsims 0.7.0, tifffile version recorded in JSON. Worker calls invoke `tools/image_workspace.py` and `tools/structure_worker.py` as fresh subprocesses with JSON stdin. Therefore this review validates public worker entrypoints, committed object loaders, journals, and analysis routes; it does **not** separately qualify the MCP transport, GUI, or agent comprehension.

The positive simulation settings are 200 kV, reciprocal cutoff `0.8 Å⁻¹`, excitation bound `0.015 Å⁻¹`, no direct beam. Registration fixes scale=1, translation=0, and known screen parity; the declared residual tolerance is `0.003 Å⁻¹`. These values define deterministic acceptance tests, not confidence levels. Display raster settings are not used for scientific comparisons.

## Actual saved routes and controls

| Test | Expected and actual result | Interpretation |
|---|---|---|
| Fit `[111,11-1]`, hold out `[220,113]` | Fit returns 23° to <1e-10°, held geometry passes | Fit/hold partition works for this fixed caller-supplied indexing |
| Saved-registration `compare` | All 8 selected parent reflections match; unmatched simulation reflections retained | No new independent validation; explicit flag is true |
| Change held-out correspondence to `[222]` | Held validation fails; fit angle remains 23° | No held-out-to-fit arithmetic leakage observed |
| Use saved parent registration against twin simulation | Rejected as different saved simulation | Candidate binding enforced in `structure_compare` |
| General candidates parent/twin and parent/parent | `compatible`, `incompatible`; overall `compatible` | Same explicit transform/tolerance for both candidates; wrong alternative is falsified |
| Twin + correct horizontal interface trace | Projected relation and interface both `compatible`; overall `compatible` | Untwinned parent control does not explain B |
| Twin + vertical trace | Projected relation still `compatible`, trace/overall `incompatible`; residual 90° | Trace inconsistency does not rewrite reflection relation |
| Conflicting original request ID | Rejected; original journal SHA unchanged; `result` recovers original object | Original authority preserved |
| Missing physical calibration | General and twin `insufficient_evidence` | Pixel evidence does not become a physical conclusion |
| 10% wrong physical sampling | General `incompatible`; twin `insufficient_evidence` because parent anchor fails | Correctly different scopes: twin cannot establish an anchor; no scale repair |
| Old measurements/proposal against new calibrated FFT | Rejected | Stale geometry not silently migrated |
| Domain A consists of one Friedel pair | General and twin `insufficient_evidence`; one direction family | Partners do not create noncollinear direction support |
| Exact held-out `[-100]` after fitting `[100]` | Rejected | Exact Friedel/HKL protection works |
| Two collinear harmonic fit vectors | Rejected for numerical noncollinearity | Degenerate fit not silently accepted |
| No held-out correspondences | `not_tested_no_held_out`, pass flag null | No manufactured validation |

General/twin take an explicit transform, not a `registration_object_id`. The probe copies the saved parent transform into that input and records the original ID in the basis string. **This is a caller-visible transfer, not an authenticated register→general/twin linkage.** General/twin do not consume the saved proposal's pass flag; they label comparisons `NOT_VALIDATED`/`not_established_by_this_comparison`. A candidate-dependent registration selected using these data therefore remains a conditional hypothesis. I did not find automatic candidate-dependent refitting in either aggregate.

Absent predictions are retained, with counts in the compact result and complete unmatched rows in the saved numerical evidence. They are not used as missing-intensity rejection evidence. This is appropriate to the declared real-space FFT geometry scope: the selected cosines are not a kinematic HRTEM intensity oracle. The resulting compatibility must not be described as exhaustive phase identification or agreement with all theoretically visible peaks.

## R2-C1 — finite-resolution pseudo-holdout admits a duplicate/conjugate source observation

**Classification:** scientifically consequential method/status limitation; proposal required. **Owning code:** `crystallography/registration_proposal.py:222-265` (exact/one-ULP anchor, projection and Friedel tests), `:288-310` (pass/status calculation), and `crystallography/structure_tools.py:708-711` (propagation into saved comparison).

**Trigger:** a tetragonal single-site model with `a=b=4 Å,c=20 Å`, source zone `[0,1,32]`, in-plane rotation 17°, cutoff `0.6 Å⁻¹`, excitation allowance `0.12 Å⁻¹`. The input image has only the real cosine families `q=(0.25,0)` and `(0,0.25) Å⁻¹` on 128×128 pixels at 0.5 Å/pixel. The experimental and simulated vectors supplied for the fit are `[100]` and `[010]`. A new saved measurement anchor close to the first source peak is asserted as `[101]` for validation. Distinct projected coordinates follow analytically from the small beam tilt `atan(4/640)`; no tested solver generated the supposed truth.

The fitted and pseudo-held-out anchors differ by `0.00031249389666318316 Å⁻¹`, or **0.019999609386443722 Fourier bins** at bin spacing `0.015625 Å⁻¹`. In this constructed source there is no independently generated third cosine peak. Changing the coordinate by this amount creates neither a new source observation nor a resolved Fourier spot.

**Actual:** main calls 031/032 succeed. Rotation is exactly 17°, held residual `1.3877787807814457e-17 Å⁻¹`, `validation_status='held_out_geometry_consistent'`, `held_out_validation_passed=true`, `unresolved_binary64_aliases=[]`. The complete comparison retains **five** in-tolerance simulated candidates for each of the three measurements, all marked ambiguous. The saved comparison nevertheless propagates the true validation flag. A supplementary `[-101]` pseudo-holdout near the conjugate of `[100]` also passes, whereas exact `[-100]` is rejected.

**Expected for independent experimental validation:** these anchors must not establish an independent observed peak. At minimum, resolving power/observation-group identity remains unresolved; conditional numerical correspondence agreement can still be reported. The precise existing scope matters: the code already says its anchor/HKL disjointness is not proof of statistical independence or experimental resolving power. Accordingly this finding is not a claim that the arithmetic violates its documented narrow predicate. It shows that the prominent `held_out_validation_passed` name is stronger than the observation support, and that exact/ULP exclusions leave a realistic gap between exact aliases and physically unresolved aliases.

The caller assertion in this probe is deliberately scientifically false and openly identified as a counterexample. These counterexample anchors are supplied coordinates, not detector-localized peaks: the second fit anchor is also set to `q_y=0.25 cos(atan(4/640))`, about `4.88e-6 Å⁻¹` from the actual second cosine frequency `0.25 Å⁻¹`, well inside the declared tolerance. Thus the zero numerical correspondence residual is not independently measured peak truth. In contrast, the positive +23° route independently checks the actual detected source peaks. The endpoint does not claim to authenticate user assertions or to detect intensity peaks. This is not evidence of automatic data fabrication or automatic held-out selection by the software. It demonstrates the consequence of treating separate saved anchor coordinates as distinct observations without an observation-resolution contract.

**Suggested method work, not an unreviewed threshold patch:** distinguish conditional correspondence-residual agreement, resolved source-peak independence, angular-family novelty, and external/statistical validation. Retain source peak/group identities, candidate-independent observation selection, and an explicit resolution/uncertainty basis before promoting independent validation. Consider grouping unresolved fit/validation projections and conjugates, and retaining ambiguous assignments as unresolved. Do not use one ULP as experimental resolution, replace it blindly with the residual acceptance radius, or infer a universal Rayleigh threshold from FFT bin spacing. The bin spacing here demonstrates a constructed absence of a third source signal; it is not a universal precision bound for fitted peaks.

A separate `[200]` harmonic correspondence also passes the existing held-geometry test. A resolved harmonic can legitimately test radial consistency, while adding no new angular family; this alone is **not** a bug. The deliberately two-cosine input lacks that harmonic, underscoring that manually asserted anchors are not verified intensity detections. General/twin already have a different finite direction policy (`twin_geometry.py:214-281`), using line-family components before candidate assessment; their one-family control correctly stays insufficient. That policy is a deterministic admission rule, not a substitute for the missing registration observation contract.

## Uncertainty and literature grounding

`registration_proposal.py:137-171` is equal-weight, uncentred, determinant-constrained 2D Procrustes. Its single scale normalization does not fit physical scale. The +23° truth and unchanged angle under a wrong held-out HKL corroborate this implementation on a nontrivial case. [Kabsch (1976), Acta Cryst. A32, 922–923](https://doi.org/10.1107/S0567739476001873) provides the rotation least-squares foundation. [SciPy's official orthogonal Procrustes documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.orthogonal_procrustes.html) explicitly allows both rotations and reflections; the production SVD determinant correction is therefore relevant to restricting this fit to SO(2). The inspected live documentation identifies SciPy 1.18.0; the actual installed tested runtime is 1.18.1.

The [diffsims 0.7.0 `calculate_ed_data` reference](https://diffsims.readthedocs.io/en/stable/reference/generated/diffsims.generators.diffraction_generator.DiffractionGenerator.calculate_ed_data.html) specifies the kinematic simulation with reciprocal cutoff, rotation and excitation-error settings. This audit checks coordinate conventions and analytic geometry, not diffsims absolute intensities or dynamical scattering. [NumPy 2.5 `fftfreq`](https://numpy.org/doc/stable/reference/generated/numpy.fft.fftfreq.html) gives the cycles-per-sampling-unit bin coordinates and `1/(n d)` spacing used above. The [IUCr Friedel-law reference](https://dictionary.iucr.org/Friedel%27s_law) describes conjugate-index intensity equivalence under its stated scattering assumptions; the real-cosine fixtures have Fourier conjugacy directly by construction. No blanket Friedel-intensity claim is extended to arbitrary dynamical electron scattering.

Measurement uncertainty is **not propagated** through these routes. `measurement_vector` retains an uncertainty-status field; assignment compares deterministic residuals with the declared tolerance. The fit declares statistical uncertainty not estimated, and general/twin direction admission explicitly says its radius is not measured uncertainty or confidence. This is a known scope boundary, not an inferred calibrated probability. Correlated shared-DC/calibration error, weighted fits, covariance propagation and empirical coverage are **NOT_TESTED** here and are handled separately by the parent audit.

## NOT_TESTED and reproducibility

NOT_TESTED: real specimen or instrument calibration; unique phase/chemical assignment; general 3D orientation uniqueness; atomic coherence; scattering/HRTEM intensity fidelity; unknown mirror convention; automatic structure/orientation search; rare skew-cell completeness beyond the supplied certified simulations; robust/noisy registration statistics; universal sub-bin resolvability; full adversarial candidate graph limits; interruption/lost-response injection; MCP transport, GUI, or real model-operating-session comprehension. Prior-round partial occupancy, GPA-band topology, numerical-flat-spectrum, and missing-scale observation-status findings are not claimed as new discoveries here.

Reproduce from this repository using its isolated environment:

```sh
.venv/bin/python audits/scientific_algorithms_round2/crystal/probe_saved_crystal.py
.venv/bin/python audits/scientific_algorithms_round2/crystal/probe_admission_controls.py /absolute/path/printed/by/the/first/probe
```

Each run chooses a fresh output directory; controls use fresh request IDs but must only be applied once to a given main workspace. All public endpoints retain their original requests and errors. No production tests were changed; full repository suites are the parent audit's responsibility.

## Proposed versioned follow-up (not implemented)

Treat R2-C1 as **P2 semantic/method gap**, not an arithmetic defect. Any change to observation grouping, independence admission, or meaning of `held_out_validation_passed` should introduce a method/status version, retain old raw outcomes and original version semantics, and make re-analysis an explicit new request. Do not retroactively relabel historical proposals or modify existing worker tolerances. A new result can expose conditional residual agreement separately from independent-observation admission. Before choosing a resolution rule, preregister positive resolved peaks, close unresolved projections, conjugates, harmonic radial checks, shared-DC/scale covariance, and noisy localization counterexamples, and inspect both false admission and excessive abstention. No scientific threshold was changed by this audit.

Byte-exact original alias requests/responses, authoritative worker request journals, and the <1MB original main/control reports are included in `evidence/`; `COPY_MANIFEST.json` records original paths and SHA256 values. These copies preserve actual execution results but are not a portable replacement for the complete local scientific workspace.

## Fixed-source predeclared tolerance sweep

The additional saved-worker sweep in `analysis/algorithm-audit-round2-crystal-sweep-20261101-234741/` changes **only** the reciprocal tolerance on the same already saved 10%-wrong-scale source, wrappers, FFTs, measurements, candidate simulations and fixed 23° registration. The five values were declared to the parent reviewer before execution and written to `preregistration.json`: `[0.003,0.03,0.06,0.061,0.08] Å⁻¹`. No bound was tuned after seeing its result.

The independently calculated largest true-correspondence residual is `max(|q|)/11 = 0.06030226891555273 Å⁻¹`: a sampling value multiplied by1.1 divides the inferred reciprocal vector by1.1. The actual categorical transition agrees with this deterministic residual boundary.

| Tolerance Å⁻¹ | General correct pair | General wrong untwinned pair | Twin projected relation | Twin overall |
|---:|---|---|---|---|
|0.003|incompatible|incompatible|insufficient_evidence|insufficient_evidence|
|0.03|incompatible|incompatible|insufficient_evidence|insufficient_evidence|
|0.06|incompatible|incompatible|insufficient_evidence|insufficient_evidence|
|0.061|compatible|incompatible|compatible|insufficient_evidence|
|0.08|compatible|incompatible|compatible|insufficient_evidence|

Each general domain still has four admitted direction families throughout, so that transition is not caused by a changed family count. The twin control intentionally omits an interface measurement, making its **joint** verdict insufficient even when its projected relation passes. At lower tolerances the wrong-scale parent anchor fails, so the twin relation itself also stays insufficient. This cleanly separates a measured residual crossing from lack of an anchor or missing interface evidence. It does not make 0.061 a scientifically justified calibration-error allowance, and no such recommendation is made. Widening a declared acceptance radius can accommodate a known wrong calibration without correcting it; the outputs are conditional geometric statements, not probabilities or verified calibration.

The new reproducible sweep is:

```sh
.venv/bin/python audits/scientific_algorithms_round2/crystal/probe_tolerance_sweep.py /absolute/main/raw /absolute/controls/raw
```

Its original report and per-request raw hashes are copied to `evidence/sweep-original-report.json.gz`.


## Reading compressed original reports

The three copied reports are losslessly packaged with deterministic gzip `mtime=0`:
`evidence/main-original-report.json.gz`, `evidence/controls-original-report.json.gz`,
and `evidence/sweep-original-report.json.gz`. Read them with `gzip -dc PATH.json.gz`
or Python `gzip.decompress(Path(PATH).read_bytes())`. The manifest records both
compressed-file SHA256 and uncompressed-original SHA256/byte counts. Decompressed
bytes were verified against the original manifest hashes and the unchanged files
under `analysis/`. Key alias requests, responses, worker journals, and
`evidence_summary.json` remain directly readable JSON.
