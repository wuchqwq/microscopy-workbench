# Independent scientific review: GPA, projected topology, crystallography

Reviewer: delegated GPT-6 astra, independently reading implementation and deriving synthetic truth. Review date: 2026-11-01 (Asia/Shanghai). Baseline independently checked: `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`, tree `82facfce75c5909c510cb5014e228918904f5de4`. Only audit files were written. No production edits, GUI, launcher, real specimen, or external shared workspace operations occurred.

**Two scientific implementation defects are reproduced through public saved-worker paths.** One promotes repeatedly filtered evidence to redundant topological support; the other drops explicit partial occupancy and changes simulated extinctions/twin qualification. No sign, finite-deformation, direct/reciprocal basis, or assignment arithmetic defect was found in the positive probes below. Those passes are bounded synthetic results, not general qualification.

The final complete run is [`evidence/astra/results.json`](evidence/astra/results.json): 25 outcomes, 18 `PASS`, 4 `FAIL` covering two root causes, 3 `METHOD_LIMIT`, and no harness errors. Raw run: `astra_evidence_20261101T231903/`. Earlier runs remain untouched, including initial harness mistakes (float64 TIFF rejected, and a response envelope unpacking error); they are not production defects. Reproduce with:

```sh
.venv/bin/python audits/scientific_algorithms/astra_probes.py
```

Each run creates a new timestamped audit directory. Exit 0 means execution completed, including known scientific `FAIL` findings as data; a harness `PROBE_ERROR` gives exit 2. The final exact executed script and hash are saved in [`execution.json`](evidence/astra/execution.json) and [`executed_astra_probes.py`](evidence/astra/executed_astra_probes.py). Earlier harness-development runs did not capture exact script snapshots and are not the final evidence. [`raw_evidence_manifest.json`](evidence/astra/raw_evidence_manifest.json) hashes all retained raw runs. Compact stable evidence contains selected responses and small source XYZs; scientific arrays/PNG/raw object directories remain local and are reproducible, not included in the compact evidence.

The independent environment used Python 3.13, NumPy 2.5.4, SciPy 1.18.1, scikit-image 0.26.0, ASE 3.29.0, and diffsims 0.7.0. Python generates the truth from analytic carriers, inverse coordinate maps, angle fields, explicit atomic positions, or exhaustive assignment enumeration; no repository fixture or output under test generates expected values.

## D-01 — P1: same Fourier reflection counted as redundant topology evidence

Classification: **code/evidence-admission error**, not a failure of the winding sum. The conditional `hypothesized` label does not cure an incorrect `redundancy_validated=true` claim.

Owning implementation:

- `tools/image_topology.py:110-126`, `_source_bundle_records`: only exact/conjugate-equal `g` vectors are merged. Different centers with heavily overlapping apertures are retained as separate reflections. The metadata-only plan repeats this policy at lines 127 onward.
- `tools/image_topology_legacy_v1.py:97-110`, `_direction_families`: numerical non-collinearity determines families without Fourier-support identity.
- `tools/image_topology_legacy_v1.py:294-313`, `analyze`: three direction families plus compatible leave-one-out fits set `redundant=True`; lines 330-333 promote the status. The current v2 grouping kernel calls these unchanged numerical routines.

Trigger and public reproduction:

1. Create a 256×256 float32 TIFF with exactly two intended carriers:
   `I = cos(2π·0.125·x − θ) + cos(2π·0.125·y)`, `θ=atan2(y−127.5,x−127.5)`.
2. Public image worker `open → frame → fft(window="none")`.
3. Save a fixed-g GPA using `[(.125,0),(0,.125)]` and another using `[(.125,.004),(0,.125)]`; both have `mask_sigma=.014`, reference `[50,50,75,75]`, and the same FFT.
4. Public topology over both saved GPA IDs, positive-image-XY loops `[75,75,182,182]` and `[60,60,197,197]`.

Actual final evidence is [`overlapping_band_topology_response.json`](evidence/astra/overlapping_band_topology_response.json), with complete immutable worker records under `phase_vortex_workspace/` in the raw run. The source TIFF hash is `61b6797a11a54b05f509b475baed59623ab04a9454b65ddddc566a093e41f955`.

| Quantity | Actual |
|---|---:|
| True intended carrier count | 2 |
| Shift of repeated aperture center | 0.004 cycles/pixel = 1.024 Fourier bins |
| Repeated aperture angular separation | 1.8328395° |
| Sum of support radii | 0.084 cycles/pixel |
| Intersection / smaller sampled support | 0.94117647 |
| Normalized inner product of aperture weights | 0.97969331 |
| Claimed direction families | 3 |
| Canonical winding per retained reflection | −1, 0, −1 |
| Inferred projected closure | `[8, ~0]` pixels |
| Worst leave-one-out condition | 62.5160, admitted below 100 |
| Claimed redundancy | `true` |
| Reported status | `projected_topological_evidence` |

Expected: these overlapping filters must not establish a third independent reflection. Retain diagnostic observations, but the evidence should remain at most a two-reflection constrained candidate without redundancy, or reject unsupported overlapping-band input before inference.

Why the counterexample is scientific, not an arbitrary adversarial vector list: changing the demodulation carrier adds the smooth phase ramp `−2π δg·x`. Its closed-loop circulation is zero. A second aperture over the same band therefore reproduces the same vortex winding. Here the slight Y shift also leaves `g·b` unchanged for `b=[8,0]`, so leave-one-out algebra cannot detect that it is reusing the same source signal. The full saved image→FFT→GPA→topology path confirms reachability with ordinary accepted requests.

Physical impact: apparent cross-reflection support can be manufactured by slightly changing a mask center, without acquiring a new independent reflection. This strengthens a projected-defect hypothesis beyond the actual evidence. It does not establish a wrong Burgers sign in this example; it establishes a false redundancy claim.

Proposed fix: add a versioned cross-record Fourier-support admission policy before redundancy inference, accounting for direct and conjugate supports and the actual saved bandwidths. A conservative first policy can reject overlap among distinct retained bands, while keeping exact aliases merged. A less restrictive policy would need an independently justified resolved-reflection identity. Do not change the frozen v1 kernel or reinterpret existing v1/v2 manifests; new analyses should declare the new evidence-policy/algorithm version. Test this nonzero counterexample, a genuine separated third reflection, exact conjugates, harmonics, and historical replay.

Reference basis: [Hÿtch, Snoeck & Kilaas (1998)](https://www.sciencedirect.com/science/article/pii/S0304399198000357) defines GPA using selected Fourier components and their phases. The false redundancy result itself follows from the analytic closed-loop ramp invariance and the reproduced implementation behavior; no claim is made that the paper specifies this repository's redundancy threshold.

## E-01 — P1: extXYZ partial occupancy discarded before simulation and twin admission

Classification: **scientific data-loss and model-substitution error**. Three independent failures demonstrate one root cause.

Owning implementation:

- `crystallography/structure_tools.py:145-185`, `load_structure`, accepts `.xyz` via ASE `extxyz`; ASE preserves an explicit per-site `occupancy` column in `atoms.arrays`.
- `crystallography/structure_tools.py:129-142`, `atoms_data/from_data`, serialize only `atoms.info["occupancy"]`; per-site occupancy arrays are dropped.
- `crystallography/structure_tools.py:334-337`, `simulate`, checks only the retained info dictionary; lines 381-383 construct every diffpy atom with `occupancy=1.`.
- `crystallography/twin_geometry.py:74-84`, `qualify`, correctly rejects partial per-site arrays when directly present, but the public saved-object path has already erased them.

Public counterexamples:

1. **Single partial site.** `Properties=species:S:1:pos:R:3:occupancy:R:1`, Cu at origin with occupancy 0.5, periodic 3.6 Å cubic cell. ASE returns `[0.5]`; public `open` stores `"occupancy": null`; public `simulate` succeeds using full occupancy. Raw requests/responses: [`occupancy_open_response.json`](evidence/astra/occupancy_open_response.json), [`occupancy_simulate_response.json`](evidence/astra/occupancy_simulate_response.json).
2. **Changed extinction, not merely absolute normalization.** Two Cu sites `(0,0,0)` and `(1/2,0,0)` in fractional coordinates, occupations `[1,0.5]` versus `[1,1]`. Both public simulations produce *identical complete reflection tables*. The partial structure's ±100 reflections are missing. Independently, the unit-scatterer basis amplitude at 100 is `1−0.5=0.5`, hence squared factor 0.25; the full structure gives `1−1=0`. With positive Cu scattering and finite positive Lorentzian excitation weight this difference cannot disappear. No synthetic truth is derived from diffsims. Source hashes: partial `2d85beccf534dd2a1467f2ba158a60ae81e58c0a9cb36064d2d23baa24b5a102`; full `0672e1ea40ff5b20851fa5d2d1c00b11ebbf85e80c37b2490b2ba130deb16f0d`.
3. **Wrong twin scope.** Four conventional FCC Cu positions with one site occupancy 0.5. Direct `twin_geometry.qualify` rejects this input. Public `open → orient → twin_orient` accepts it as the supported fully occupied FCC candidate. Raw result: [`partial_fcc_twin_response.json`](evidence/astra/partial_fcc_twin_response.json); source hash `2f8392b84573af500e78464cb4c81058e06e72f8defce59256c59bfbbf7de8a6`.

All simulations use 200 kV, radius 0.8 Å⁻¹, excitation tolerance 0.02 Å⁻¹, and 64×64 rasters. The scientific reflection tables, not normalized PNGs, are compared.

The compact evidence includes the actual saved [partial two-site simulation](evidence/astra/two_site_partial_simulation.json) and [full two-site control](evidence/astra/two_site_full_simulation.json), in addition to the analytic truth and source XYZs.

Expected: retain the scientific per-site occupancy and reject partial/ambiguous occupation in the currently qualified full-occupancy simulation/twin scope. The present implementation does not need to add a partial-occupancy simulator to meet that contract. It must not silently replace 0.5 by 1.

Physical impact: wrong structure factors, false absences, incorrect simulated reflection availability, and improper admission to a full-occupancy centrosymmetric FCC/diamond twin model. Raw source bytes/hashes alone do not protect downstream science when the parsed representation has lost the relevant property.

Proposed fix: introduce explicit normalized site-occupancy serialization/schema, preserving `occupancy` and `occupancies` arrays and rejecting ambiguous contradictions with info-based metadata; ensure simulation and twin qualification share the same admission. Alternatively, fail closed at new ingestion for unsupported explicit per-site occupation rather than discard it. Cover public open→reload→derive→simulate and twin paths. Historical objects/results remain historical, with a new versioned result for corrected interpretation; do not rewrite their arrays, hashes, or past conclusions. A repair policy for old saved objects requires inspecting their retained original source, not assuming absent stored occupancy meant full occupancy.

Reference basis: [extXYZ specification and parser project](https://github.com/libAtoms/extxyz) describes additional per-atom properties and their mapping to ASE arrays. [IUCr occupancy definition](https://www.iucr.org/__data/iucr/cifdic_html/3/CORE_DIC/Iatom_site.occupancy.html) defines occupation as a site fraction. [IUCr's structure-factor treatment](https://onlinelibrary.wiley.com/iucr/itc/Cb/ch6o1v0001/sec6o1o1o7/) supplies the atomic phase-sum basis; the two-site extinction calculation above is independently evaluated.

## C — GPA findings and bounded validation

Read: `image_gpa_core.analyze`, filtering, residual/branch masking, reference fitting, and `image_gpa._input/action` saved-worker admission. The convention is internally coherent: with Eulerian backdisplacement `u_E=x−X(x)`, `grad(X)=I−grad(u_E)` and `F=[I−grad(u_E)]⁻¹`; physical signed anisotropic metric changes coordinates as `S F S⁻¹`. Green–Lagrange strain uses `.5(FᵀF−I)`. This derivation is independent of the code under test. It is not the infinitesimal strain formula from the original GPA paper.

Analytic affine input: `G=.125 I`, observed carrier rows `[(31/256,1/256),(0,33/256)]`; prescribed `F⁻¹=[[31/32,1/32],[0,33/32]]`. On 40,000 tensor-valid pixels, maximum errors are <4.6×10⁻¹⁴ for F, <3.9×10⁻¹⁴ for E, and <2.4×10⁻¹⁴ rad for polar rotation, including signed metric `[.02,−.05]` nm/pixel. `fit_reference` removes this uniform affine deformation as its documented relative-reference semantics require; `fixed_g` retains it. A missing second carrier is rejected rather than producing a valid tensor field.

Pure rigid rotation is independently tested with the Pythagorean pair `cos α=63/65`, `sin α=16/65`, using exact DFT-bin carriers on a 512² grid and analytic `E=0`. F, zero Green–Lagrange strain, and α all pass the predeclared absolute tolerance 10⁻¹⁰. This detects confusing infinitesimal strain with finite objective strain at a finite rotation.

**Method limit, independently demonstrated:** mix two fixed quadrature contrast components with spatial weights `cos ψ(x)` and `sin ψ(x)`, `ψ=.35 sin(2πx/128)`, without moving their carrier lattice. GPA reports apparent Exx from −0.0193503 to +0.0205428. This is the expected phase/contrast nonidentifiability of the input model, not a numerical sign error. The result already disclaims contrast/sublattice apparent strain and `material_strain_verified=false`; those limits must remain visible downstream. Neither a valid tensor mask nor a physical calibration validates a specimen deformation model.

Known reciprocal-space sources are explicitly rejected by `image_gpa._input` at lines 52-53. Unknown/unspecified image domains rely on the explicit caller assumption and remain hypotheses. Pure mathematical FFT admission is not sufficient for physical GPA admission.

References: [Hÿtch et al. (1998)](https://www.sciencedirect.com/science/article/pii/S0304399198000357), accessed publisher abstract/introduction/equation snippets, not a claim of unrestricted full-text access; [Herráez et al. (2002)](https://opg.optica.org/ao/abstract.cfm?uri=ao-41-35-7437), the original noncontinuous reliability-based phase-unwrapping method. These support method provenance, not quantitative real-specimen accuracy for this implementation.

## D — topology mathematics and limits outside D-01

Analytic `θ=atan2(y−63.5,x−63.5)`, phases `[-θ,0,−θ]`, g rows `[(.125,0),(0,.125),(.125,.125)]` give canonical winding `[-1,0,−1]` and b `[8,0]` under the documented positive image-XY circuit convention `G b=−w`. Reverse-path inputs flip raw winding and preserve the canonical inferred b. An amplitude-zero pixel on a contour invalidates that path and prevents stable-loop promotion. A ± vortex dipole enclosed by both loops gives `no_net_winding_detected`, correctly describing net closure rather than absence of defects.

An independent three-carrier float32 image also passes the full public image→FFT→two GPAs→saved topology path, with three genuinely separated frequency masks and b `[8,0]`. This positive control distinguishes D-01 from a generic inability to analyze saved phases.

Versioned spatial grouping is independently tested using two separated opposite-sign analytic cores: v2 retains local b `[8,0]` and `[−8,0]` with `spatially_grouped_evidence` and no global fitted b; the frozen v1 kernel retains its original `inconsistent_or_partial_evidence` semantics. Another test expands a nested loop to include an opposite core, changing winding −1→0 and rejecting one stable net-closure hypothesis. Saved historical v1/v2 manifest replay is **NOT_TESTED** independently here; only both current kernels' explicit versioned behavior is probed.

**Method limits:** a contrast vortex can reproduce exactly the same phase winding as a projected displacement defect; the test cannot identify a material dislocation. Sampled wrapped increments cannot rule out unsampled high phase gradients or subpixel aliasing. Integer circulation residual is an arithmetic closure diagnostic, not a confidence level. These are accurately described in existing reports. Geometric v2 nesting components are scopes for one net-closure hypothesis, not resolved-core identities. This review did not alter or relabel historical v1/v2 output.

## E — crystal geometry, matching, simulation, and twin scope outside E-01

- **Orientation:** explicit oblique direct cell with zone `[1,2,1]` and direct reference `[1,0,0]` matches an independently computed orthonormal basis. Zone directions must use direct `uvw @ cell`; plane normals use reciprocal hkl. No direct/reciprocal confusion found in the inspected functions.
- **Cubic candidates:** exact independently specified F[001] reflections `(200),(020),(220)`, `a=.4 nm`, produce an accepted fixed-a candidate. P/I/F parity rules match [IUCr integral reflection conditions](https://dictionary.iucr.org/Integral_reflection_conditions). These are lattice-centering rules, not a chemical-basis or dynamical-scattering phase proof.
- **Wrong-alternative counterexample (method limit):** the same selected observations generated from F cubic `a=.4 nm` also accept P cubic `a=.2 nm`, whose `(100),(010),(110)` have identical observed geometry. Both alternatives pass the actual candidate search with negligible residual, and all candidates retain `chemical_phase_identified=false`. Missing/unselected reflections were not supplied as evidence. This is finite-data nonidentifiability, not a false phase-identification bug. See [`alternative_cubic_candidates.json`](evidence/astra/alternative_cubic_candidates.json).
- **Matching:** 100 deterministic random 3×4 residual matrices are checked against exhaustive one-to-one/dummy assignment enumeration; all match the maximum feasible cardinality, then minimum residual objective. This validates `assign_within_tolerance`, not all measurement-provenance routes or statistical matching uncertainty.
- **HCP basis diagnostic:** every h,k,l in −2…2 matches an independent complex two-site structure-factor sum to <10⁻¹². Hard basis-cancellation rejection is correctly disabled. The complete noisy HCP candidate search is **NOT_TESTED** by this independent probe set.
- **Simulation orientation:** full public structure `open → orient → simulate` on a cubic cell rotated 27° in its source Cartesian basis gives retained reciprocal coordinates matching independent `hkl/3.6` laboratory truth to <10⁻¹². This checks preservation of the source basis and shared orientation; it does not validate a detector intensity model. The inspected simulation records explicitly retain cycles/Å, normalized raster limits, unquantized reflection coordinates, and kinematic assumptions. The [diffsims generator documentation](https://diffsims.readthedocs.io/en/latest/reference/generated/diffsims.generators.diffraction_generator.DiffractionGenerator.html) is a moving `latest` URL used for method/API context. Executable evidence uses installed **0.7.0**, whose `diffraction_generator.py` SHA-256 is `a0023f6bfdb775e995afa9e1a657db3652f54c92529cad05648ed9164cdb3dbb`; see [`installed_dependency_source.json`](evidence/astra/installed_dependency_source.json).
- **Twin operation:** FCC `[111]` +60° candidate equals the independently symbolic matrix `[[2,−1,2],[2,2,−1],[−1,2,2]]/3`. Proper versus mirror operations and projected interface restrictions are explicit. [IUCr twin law](https://dictionary.iucr.org/Twin_law) and [Cayron (2007)](https://journals.iucr.org/a/issues/2007/01/00/au5046/index.html) support the symmetry-equivalent operation framing. Full twin_compare behavior with saved experimental domain/interface records is **NOT_TESTED** independently here; the main code's fixed parent control and nonidentifiability labels were inspected but not promoted to a pass by inspection alone.

## Remaining evidence gaps and decision boundary

**NOT_TESTED:** real specimen data; microscope transfer functions; thickness/dynamical scattering; uncertainty propagation and calibrated confidence; broad noisy/reflection-crowding sweeps; spatially varying large GPA deformations; quantitative unwrapping failure rates; all odd/rectangular-grid GPA combinations; exhaustive HCP/cubic noisy-search completeness; all saved-registration/general-compare/twin_compare routes; skew-cell enumeration boundary floating-point corner cases; hardware/GUI/browser/Windows qualification. No independent universal accuracy or completeness claim follows from this audit.

Cross-method rule: FFT features, GPA phase, topology winding, and reciprocal geometry often reuse the same source pixels and selected peaks. Agreement between them is conditional consistency and may be correlated evidence. Separate artifacts, different algorithm labels, extra mask-center choices, or saved request IDs do not by themselves add independent physical support. D-01 is a concrete instance where the implementation currently violates that distinction; the contrast counterexamples are method limits even after D-01 is fixed.

Recommended disposition: fix D-01 and E-01 under explicit versioned scientific policies before strengthening physical-evidence claims. Keep positive analytic checks as regression oracles, preserve all existing immutable results, and retain unresolved scopes as `NOT_TESTED`. No production fix or commit was made by this reviewer.
