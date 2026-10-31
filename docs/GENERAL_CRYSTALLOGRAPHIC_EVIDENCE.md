# General crystallographic evidence — first scope

This independent increment starts from main `9fbc769`, not the unmerged #44,
#45 or #46 stack. It composes existing ASE, shared orientations, diffsims and
`structure_compare`. It neither changes nor reinterprets the versioned F3b
conventional FCC/diamond Sigma3 {111} contract or its historical objects.

## What an Agent can do

Open explicit CIF/XYZ candidates, inspect the exact cell/sites, supply a zone
axis and in-plane convention, run the existing qualified kinematic simulations,
and compare an adjacent pair of real-space image ROI observations against up
to three explicit candidate pairs. A and B may use different structures and
orientations. One shared experimental coordinate system, independent scale,
screen parity and DC are retained. No separate B-side fit is introduced.

`structure_general_compare` returns per-side and per-pair conditional
`compatible`, `incompatible` or `insufficient_evidence`. Compatible means only
the selected measured reciprocal vectors agree with the supplied projection
and tolerance. Several compatible pairs remain globally insufficient. It does
not identify a unique phase, general 3D orientation relationship, twin law,
CSL, interface coherency, defect, composition or phase fraction.

At least two finite resolved noncollinear direction families are required per
side, using the unchanged versioned F3b finite-direction policy. Friedel
partners, collinear harmonics, unresolved HKL alternatives, low-quality or
truncated observations cannot acquire a positive verdict merely by matching.
Missing scale retains pixel evidence and returns insufficient physical evidence.

## Explicit input and output

The formal MCP tool requires:

- `current_spatial_image_object_id`: the selected current spatial frame/wrapper.
- Exactly two `domains`, each containing `field_object_id`, `rect_xyxy` in
  original source pixels, `current_image_object_id` for its saved FFT/wrapper,
  and optionally 1–16 committed `measurement_object_ids` belonging to that
  observation. The first version reuses the existing atlas/field/extension/
  domain-map adapter; an arbitrary unrelated FFT is not an admitted domain.
- 1–3 `candidates`, each with a distinct `label`, `simulation_a_object_id`,
  `simulation_b_object_id` and explicit unconfirmed selection `basis`.
- One `registration`: `rotation_deg`, `scale:1`,
  `translation_inv_angstrom:[0,0]`, explicit `flip_y` and source `basis`.
- `experimental_kind:"real_space_fft"`, a predeclared
  `max_residual_inv_angstrom`, and a request ID saved **before** submission.
- Optionally `previous_evidence_id` and `revision_note`. Revision retains the
  same source/frame/array and the same ordered pair of scientific ROI rectangles.

The source/frame/array/current calibration, FFT grid, centre and actual
measurements must agree. Rectangles must overlap or share a positive-length
edge; equal rectangles, gaps and corner-only contact are refused. Units are
cycles/angstrom without a `2pi` factor, using existing signed anisotropic XY
conversion. No experimental scale is fitted or silently amended.

Simulations must be actual saved `structure_simulate` results with a saved
`structure_orient` record. Legacy explicit-Euler simulations remain supported
by the old comparison tool, not this new first scope. Scientific simulation
conditions must be comparable across the finite candidate set; display raster
size and spot width are not reciprocal geometry.

Results use the original structure workspace and journals, with immutable
child comparisons, their complete matched/unmatched and alternative HKL
records, source/calibration and structure/orientation hashes, qualification
sections, bounded frozen input copies, JSON, CSV and a display-only PNG.
`structure_info` reads the result and its referenced child comparisons.
`structure_result` recovers the original request; it never reruns FFT or
simulation. Query the original child ID for unknown work instead of replaying.
Partial cross-tool work is not claimed to be an atomic rollback.

## Structure and operation support matrix

| Candidate / operation | First-version scope |
| --- | --- |
| Ordered full-occupancy FCC, BCC, HCP | Exact supplied atoms/cell and saved qualified simulation; no motif inferred from cell lengths |
| Ordered multi-element crystal | Same geometry/occupancy/element/engine gates; supplied chemistry remains a hypothesis |
| CIF space-group declaration | Retained from hash-bound source as `declared_not_verified`; not numerical group verification |
| Point group / missing group | Explicitly unverified/unknown; no guessed symmetry, no new spglib requirement |
| Plain XYZ without full cell | Viewing/nonperiodic geometry remain usable; reciprocal simulation and this physical comparison not qualified |
| Partial/mixed/invalid occupancy | Not admitted for the existing simulation path; displayed dominant species is not a resolved ordered model |
| Invalid/singular/ill-conditioned cell, unknown elements, missing periodicity | Existing simulation refusal retained |
| Skew/HCP cell at an uncertified cutoff | Existing analytic enumeration refusal retained; no cell rebasing to evade it |
| SAED / direct reciprocal observations | Existing `structure_compare` remains available; new adjacent-field adapter is real-space FFT only |
| Specific Sigma3 {111} twin test | Existing `structure_twin_*` only, with its unchanged FCC4/diamond8 scope |
| General twin/CSL/phase/orientation search | Not implemented or inferred |

Actual kinematic simulation qualification is separate from source, cell,
occupancy and group status. Unknown symmetry does not prevent using a supplied
complete atomic basis, but cannot establish a symmetry-dependent physical law.
The existing engine/certificate and work budgets remain mandatory.

## Interpretation and revision

Real-space HRTEM/ptychography FFT is not the same intensity formation model as
SAED or kinematic diffraction. This tool compares geometry only; neither PNG
similarity nor missing predicted peaks is unique phase evidence. Search points
are not independently held-out validation. Use the existing registration tool
with separate confirmed fit/validation correspondences when that is the task.

After changing points, centre or calibration, obtain valid current observations
and create a new comparison; never call a historical result current merely
because it still opens. Old requests/hashes and unmodified complex FFT arrays
remain authoritative. No original image or structure is changed. Revision depth
is bounded at 16. Recovering saved evidence checks references and history without
dispatching new scientific work.

## Method and reproducibility references

- [ASE CIF reader](https://docs.ase-lib.org/_modules/ase/io/cif.html): fractional
  and mixed occupancy need explicit retained metadata; dominant displayed atoms
  cannot silently substitute for an ordered physical model.
- [diffsims generator source](https://github.com/pyxem/diffsims/blob/v0.7.0/diffsims/generators/diffraction_generator.py):
  pinned kinematic reciprocal reflections and orientation convention. The
  provider's pre-existing enumeration certificate is kept unchanged.
- [Existing reflection comparison](REFLECTION_COMPARISON.md),
  [orientation](STRUCTURE_ORIENTATION.md),
  [F3b history and scope](PROJECTED_TWIN_EVIDENCE.md).

Acceptance and exact reproducible commands are in
[GENERAL_CRYSTALLOGRAPHIC_ACCEPTANCE.md](GENERAL_CRYSTALLOGRAPHIC_ACCEPTANCE.md).
