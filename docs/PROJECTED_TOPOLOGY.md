# Projected phase-winding evidence (F3a)

F3a measures wrapped geometric-phase winding on explicitly selected closed
paths in saved single-domain GPA results. It reports conditional two-dimensional
closure evidence and optional comparisons to caller-supplied projected closure
candidates. It does not identify a material, label a real defect automatically,
recover a unique conventional three-dimensional Burgers vector, segment domains,
or reconstruct a wave field. Source images, FFTs and GPA arrays remain unchanged.

The qualified model is a simple **complete projected dislocation**. Partial
dislocations, stacking faults and strongly overlapping domains are outside this
first scope. Integer image-phase circulation must not be forced into that
material model when its assumptions are unsupported.

Read [the GPA convention](CLASSICAL_GPA.md) and
[the validated F4/F2a integration-candidate boundary](F4_F2A_INTEGRATION.md) first. A complex
reconstruction phase, diffraction intensity, rendered PNG or smooth strain map
is not silently substituted for a saved GPA geometric phase.

## Primary sources and algorithm choice

[Hÿtch, Snoeck and Kilaas (1998), *Quantitative measurement of displacement and
strain fields from HREM micrographs*](https://doi.org/10.1016/S0304-3991(98)00035-7)
describe Fourier-aperture phase extraction and two non-collinear components for
two-dimensional displacement. The publisher preview and displacement section
snippets explicitly give the negative phase/displacement sign. The full
subscription paper was not accessed; F3a's discrete path policy and finite
Eulerian convention are declared here rather than attributed to unseen text.

The [official pyGPA source](https://github.com/TAdeJong/pyGPA/blob/main/pyGPA/geometric_phase_analysis.py)
was inspected on 2026-10-30. It offers spatial lock-in, reference-wave search,
wrapped phase differences, weighted least-squares reconstruction and weighted
unwrapping. The inspected module does not implement F3a's explicit rectangle
winding/candidate-evidence contract. Its carrier sign and array-axis convention
also require conversion before comparing results. Its
[MIT license](https://github.com/TAdeJong/pyGPA/blob/main/LICENSE) allows reuse
subject to retaining the notice; no license fee is stated. F3a does not install
or vendor pyGPA or use it as an independent oracle. This small contour sum uses
the existing saved GPA arrays and NumPy, with the same optional science
environment as GPA; it adds no FFT backend or phase-unwrapping engine.

[Peters et al. (2015), *Artefacts in geometric phase analysis of compound
materials*](https://arxiv.org/html/1504.06089v1), Eq. 3, independently states the
same negative sign. Their Eq. 9 includes an additional basis-image phase, and
their strain-free controls demonstrate how a changing multi-atom basis can
produce apparent strain. F3a does not remove or diagnose that ambiguity. A
stable winding or a good projected fit cannot establish that all measured phase
arose from lattice displacement.

## Coordinates, orientation and sign

Use local spatial pixel-center coordinates `[x,y]` on the source FFT ROI, with
array indexing `[y,x]`. The image's x coordinate increases rightward and its y
coordinate downward. Rectangles are half-open `[x0,y0,x1,y1]`; the perimeter
visits pixel centers from `(x0,y0)` east to `(x1-1,y0)`, south to
`(x1-1,y1-1)`, west, then north to close. Each corner is counted once. This is a
**positive image-coordinate** loop, visually clockwise in a y-down image. It
is not silently called a positive Cartesian, beam-oriented or right-hand-rule
crystallographic circuit. The explicit `negative_image_xy` orientation reverses
the path and raw winding. Inversion and candidate comparisons normalize back
to the positive-image path; their reported `b_closure` retains that canonical
orientation.

The inherited convention is

\[
 \phi_j(r)=-2\pi g_j\cdot u_E(r),\qquad u_E(r)=r-X(r).
\]

Reciprocal rows `g_j=[gx,gy]` are in cycles per local spatial pixel. Define the
reported projected closure by continuation around the declared path `C`:

\[
 b_{\mathrm{closure}}=\oint_C d u_E,\qquad
 w_j=\frac{1}{2\pi}\oint_C d\phi_j=-g_j\cdot b_{\mathrm{closure}}.
\]

This definition fixes the sign without assuming a conventional Burgers-circuit
closure direction, dislocation-line orientation, material basis or depth. A
caller-supplied candidate must use this same image-coordinate sign convention.
It remains a **projected closure candidate**, not a unique conventional 3D
Burgers vector or independently identified dislocation.

For ordered wrapped samples `phi[k]`, F3a sums

\[
 \delta_k=\operatorname{Arg}\exp\{i(\phi_{k+1}-\phi_k)\},\qquad
 \widetilde w=\frac{\sum_k\delta_k}{2\pi},
\]

including the last-to-first edge. It retains the raw arithmetic diagnostics,
integer residual, path quality and unavailable reasons. Accepted winding fields
are null when required path checks fail; raw diagnostic integers do not override
that unavailability. This uses wrapped phase
edges, not differences of one globally unwrapped displacement array. A
single-valued smooth displacement summed around a closed path telescopes to
zero; branch cuts/unwrapping can otherwise hide or relocate the closure.

Constant reference-phase offsets and a smooth reference plane have zero exact
closed-loop winding. F3a MVP nevertheless admits only `fixed_g` results, with
the original requested reciprocal vectors; fitted effective waves are not
pooled. Every exact saved GPA input and its settings remain traceable.

## Admission and unavailable evidence

`image_topology` takes `object_ids` containing one to three exact saved GPA
objects sharing the same saved FFT, source/calibration identity, local spatial
grid and Gaussian aperture width. Each must use `fixed_g`. Their phases provide
two to six unique reciprocal bands. Identical/conjugate bands are deduplicated
using exact g values, retained source identities and explicit saved-band
amplitude/phase agreement checks; conflicting copies are refused. Repeating a
reflection, its conjugate or a parallel harmonic is
not extra directional redundancy. A g sign reversal requires reversing its
phase sign as well. GPA inputs with different FFTs, calibration bindings or
widths cannot be pooled by matching their displayed appearance.

Supply `loops` containing two to eight explicit local integer rectangles, each
with `rect` and `orientation` (`positive_image_xy` or `negative_image_xy`), and
an optional `loop_id` matching `[A-Za-z][A-Za-z0-9_-]{0,39}`. Do not choose
loops automatically around bright colors or report a defect from one selected
pixel. Compare distinct nested loops that are intended to enclose the same
candidate support, and retain that geometric relationship in the report.
The current algorithm groups loops by the connected components of strict
rectangle containment: one rectangle must lie strictly inside the other on all
four sides, keeping their sampled boundaries disjoint. Group membership uses
the requested geometry only, independently of validity or winding. An invalid
path therefore cannot silently split a group or remove contrary observations.

Each group is a geometric comparison support, not an automatically localized
core. A containing rectangle can connect several inner rectangles around
different cores. Distinct nested windings can reflect additional net phase
charge in the intervening annulus; they are inconsistent with one stable
closure for that group, not an unphysical observation. Preserve every winding
and unavailable reason.

Non-nested loops have no containment edge. Disjoint remote loops retain their
own evidence and do not invalidate a nested group's agreement merely by
measuring a different winding. A single remote zero loop still lacks nested
stability evidence and does not establish defect absence. Overlapping
non-nested loops can also be separate groups; their supports are ambiguous for
this comparison and must not be described as physically disjoint. Geometric
grouping neither segments domains nor establishes distinct physical defects.

Validity is determined from raw `phase_demodulated_wrapped`, amplitude and edge
support, independently of GPA unwrapping masks, strain stencils or globally
unwrapped displacement. The explicit `amplitude_floor_relative` is in
`[0.01,0.5]`, default `0.05`; its choice is retained. A masked/low-amplitude core **inside** an otherwise valid
path is permitted: the singular interior is the reason for using a contour.
An invalid sample or edge **on** the path makes that reflection/loop unavailable;
do not bridge the gap, fill it with zero, interpolate across it or shrink the
path without an explicit new request. Keep path and interior masks distinct.

Principal increments near `+pi` or `-pi` have ambiguous branch choice. F3a uses
a fixed strict `0.8*pi` phase-step guard; callers cannot loosen it. The
saved sampling margin and quality thresholds are numerical policies, not
experimental uncertainty. A safe measured margin cannot exclude an unseen
greater-than-pi intersample variation. Low amplitude, noise, filtering and
undersampling can create, destroy or move apparent vortices. Even random
closed sampled phases sum close to an integer; a small integer residual checks
numerical closure and does not measure confidence in a real lattice defect.

## Directional fit, candidates and redundancy

For an accepted winding vector, solve `G b_closure = -w` in the image-coordinate
pixel metric separately within each loop group. Two independent directions
determine two unknown closure components algebraically. An exact two-direction
fit is therefore expected and is **not independent validation**. Rank deficiency or poor conditioning must
remain visible, with no unique vector inferred from one effective direction.

At least three nonharmonic direction families are required for the report's
redundant-direction designation. Parallel multiples, including conjugates and
higher-order reflections, belong to one direction family. A third distinct
family can provide a redundant equation.
Report its residual and the agreement or disagreement of distinct nested loops.
These are consistency checks on the same image-derived phases, not independent
experimental replication or proof of a real defect. Shared image-formation and
filtering errors can affect every direction and loop together. Changing the
aperture/reference creates new GPA objects before a new topology revision;
F3a never adjusts upstream science to force agreement.

Read `loop_groups[]`: each entry retains its `group_index`, global
`loop_indices`, strictly nested loop pairs, reflection summaries, fit, status
and candidate comparisons. Loop rows retain their `group_index`; valid-loop and
nested-pair indices remain indices into the original requested loop list.
With more than one geometric group, the overall status is
`spatially_grouped_evidence`; it is a container for the separate outcomes, not a
claim that every group passes or that one closure describes all support. The
top-level `projected_burgers` is null and its `reflections` and
`burgers_candidates` are empty in that case. Inspect the corresponding fields
inside every group. A single group also retains these flat summary fields for
convenience. Do not select only a favorable
group, pool different groups' winding constraints into one vector, or treat the
overall status as a substitute for a group's unavailable, partial or
inconsistent evidence.

Optional `burgers_candidates` contains one to sixteen explicit caller-supplied
`{label,b_pixel_xy:[bx,by]}` projected values in local spatial pixels. Required
`model_assumption_text` states the actual lattice-displacement working
assumption and candidate source where applicable. Compare their predictions
`w_pred=-G b_candidate` to available observed windings and retain residuals,
ties, missing constraints and source statements separately for each group. A
preferred candidate is only compatible with the supplied evidence and declared
tolerances. Do not infer an unprovided lattice basis, Miller indices, chemical phase, beam direction,
out-of-plane component or a unique 3D Burgers vector. If no candidate is supplied,
return measured evidence without manufacturing one.

A sourced signed calibration `S=diag(sx,sy)` may convert the image-coordinate
closure to `b_nm=S b_pixel`; reciprocal coordinates transform contragrediently,
so `g·b` is unchanged. Unknown calibration leaves closure in pixels and prevents
physical-length claims. A negative scale changes the physical coordinate
orientation; the report's declared image-path sign remains unchanged.

## Interpretation limits

| Observation | What it does and does not establish |
| --- | --- |
| Nonzero accepted winding | Phase circulation on that sampled path, conditional on phase quality and the GPA lattice-displacement assumption; noise or contrast singularities can mimic it. |
| Zero winding for a reflection | No measured net winding for that g/path; a closure with `g·b=0` is invisible to that reflection. |
| Zero winding for several directions | No measured net projected closure on those paths; opposite-sign defects/dipoles can cancel, and unresolved depth or out-of-plane components remain unavailable. |
| Agreement across at least three directions and nested loops | Redundant phase consistency within the selected data and policies; it cannot alone prove a real defect or unique conventional 3D b. |
| Different windings in separate geometric groups | Different sampled enclosed support; this alone is not a contradiction, and overlapping non-nested supports remain ambiguous. |
| Different windings within a nested group | No single stable closure for the group; added or cancelling annular phase charge remains a possible observation. |
| Disagreement or unavailable path | An explicit limitation requiring interpretation or a deliberate new measurement; not a reason to delete contrary evidence. |

Scan/projector distortion, phase contrast, compound-basis changes, overlapping
domains, filtering, limited sampling and path selection all remain relevant.
Smooth GPA strain is not a topology classifier. F3a adds no domain segmentation,
defect census, automatic core localization, multi-frame tracking, conventional
3D identification, ptychography or native/DM execution.

## Persistence, presentation and recovery

Inspect the installed `image_topology` schema before use and retain an explicit
request ID before each write. A parameter/loop/input/candidate change creates a
new topology object via `previous_topology_id`; at most eight historical entries
are retained in its flat history, on the same FFT. Prior topology, GPA,
FFT and source objects stay immutable. No new AnalysisContext role is invented.
Original provider IDs and exact dependency/revision bindings remain authoritative.

The current report algorithm is
`saved-wrapped-phase-rectangular-topology-v2`, with grouping policy
`strict_nesting_components_v1` and explicit inter-group `disjoint_support` or
`overlap_non_nested` relationships. The report's explicit algorithm version
determines its semantics. Historical
`saved-wrapped-phase-rectangular-topology-v1` records used one global
all-valid-loop consistency comparison, even for unrelated support. They remain
readable and verifiable under that original algorithm, with their original
reports, identities, hashes and query outcomes. A current grouped revision is a
new immutable object; it must not reinterpret, rewrite or relabel a saved v1
record as grouped evidence. In particular, the original v1 synthetic acceptance
reports do not qualify mixed-loop grouping semantics.

After a timeout or cancellation, query the original request with `image_result`;
do not replay an unknown write or run another FFT. A fresh client can reopen
saved results with their original identities. `image_panel_open` may present the
saved preview read-only. Preview colors and overlaid loops are presentation,
never scientific replacement arrays or evidence of browser gesture acceptance.

`image_export` writes to a new child directory under an existing parent and
refuses overwrite. Retain scientific masks/arrays, loop and direction tables,
report and provenance separately from the preview PNG. Export and recovery
must preserve exact input GPA/FFT references. See
[F3a acceptance](F3A_ACCEPTANCE.md) for executed checks and NOT_TESTED scopes.
