# F3b: candidate twin relation and projected interface evidence

F3b adds composable scientific tools, not an automatic twin classifier. Start
with two saved neighboring ROI observations from F1/F4, a candidate reference
structure and a parent orientation. Nothing changes the source image, old
measurements, complex FFTs, structure or experimental calibration.

## Qualified first scope

One explicit conventional cubic Sigma3 {111} candidate, full-occupancy
single-species FCC four-site or diamond eight-site model. The actual sites,
cubic metric and occupancy are checked; cubic cell lengths alone do not prove
FCC symmetry. A common fractional-origin shift, atom permutation or Cartesian
rotation is allowed. Primitive, distorted, mixed-species and other motifs are
refused by this candidate tool; ordinary structure tools keep their scope.

`structure_twin_orient` composes the proper active matrix
`U_twin = U_parent @ R_n(+60deg)`, where the {111} reciprocal normal is computed
in the supplied cell. The stored record includes the source hash, matrix,
inverse, engine ZXZ angles and normal in laboratory coordinates. Opposite
signs and cubic-equivalent representations are recorded as equivalents, not
independent evidence. An improper reflection is never passed to a rotation API.

The symmetry qualification matters: a plane reflection and a proper rotation
are related only with the applicable motif/point-group equivalences. Twin
misorientations have multiple symmetry-equivalent axis-angle forms; matching
one apparent angle is insufficient. See [Li, Wan & Chen (2015)](https://doi.org/10.1107/S1600576715004896).
Proper cubic rotations use existing [SciPy Rotation.create_group('O')](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.transform.Rotation.create_group.html),
whose contract excludes reflections.

## Existing numerical engines, new evidence adapter

Run `structure_simulate` separately for parent and twin on the same original
structure with identical settings. F3b uses the actual committed
[diffsims 0.7.0](https://diffsims.readthedocs.io/en/latest/reference/generated/diffsims.generators.diffraction_generator.DiffractionGenerator.calculate_ed_data.html)
reflection tables, HKL and coordinates, not raster spots or a rotated subset of
the excitation-filtered parent table. Existing enumeration qualification remains.
No scatter engine, FFT, peak detector or assignment algorithm is duplicated.

`structure_twin_compare` accepts:

- `object_id`: the saved twin orientation; two saved parent/twin simulation IDs.
- `current_spatial_image_object_id`: current same-frame source/calibration wrapper.
- Exactly two `domains`, each selecting a saved field/extension/domain-map/atlas
  by `field_object_id`, exact `rect_xyxy`, and current FFT/wrapper ID. Optional
  measurement IDs must already belong to that saved observation.
- One explicit shared registration, fixed scale 1 and DC translation [0,0],
  with a source basis for its rotation and screen parity. No independent B fit.
- Predeclared `max_residual_inv_angstrom` and `angular_tolerance_deg`.
- Optionally a saved spatial interface line and `interface_projection_basis`.
- Optionally a previous comparison ID and revision note, with maximum depth 16.

Current source/frame/array, exact ROI, FFT grid, centre and versioned calibration
are validated before comparison. Supports must overlap or share a positive
edge; matching names, equal arrays, corner contact and gaps are insufficient.
Each domain has its own FFT/DC binding. Units use existing signed XY conversion
to cycles/angstrom, with no 2pi. Unknown/withdrawn scales preserve pixel evidence
and return insufficient; stale or contradictory records are refused. Current
physical reflection admission remains the existing user-statement/native-capture
contract; this change does not silently admit another calibration source.

The existing matcher tests A against the parent, B against the twin, and B
against the **untwinned parent control under the same registration**. At least
two noncollinear physical reciprocal direction families per side are required.
Friedel partners and collinear harmonics do not provide another direction.
Alternative HKLs, unmatched observations and absent predicted peaks remain in
the numerical record. A real-space FFT need not show every simulated reflection;
intensities and phase fractions are not compared.

## Meaning of the results

`projected_relation`, `interface` and joint `status` distinguish `compatible`,
`incompatible`, and `insufficient_evidence`. These are conditional geometric
verdicts for the stated model, projection, registration, selected points and
tolerances, not calibrated probabilities or unique 3D twin identification.

An unresolved parent anchor, one direction, ambiguous/truncated/low-quality
window, unknown scale or an equally good untwinned explanation stays
insufficient. Low-quality evidence can retain residuals without acquiring a
positive or negative identification. No detection is not proof of absence.

The optional saved line must meet the ROI contact/overlap neighborhood. Only
an explicitly sourced orthographic +Z projection and a candidate plane edge-on
within the angular bound allow a trace comparison modulo 180 degrees. A wrong
trace rejects the conditional coherent-{111} interface model; it does not
disprove an otherwise compatible Sigma3 orientation. Non-edge-on geometry does
not determine an interface plane. Even a compatible trace does not prove atomic
coherence, stacking sequence, chemistry, thickness or unique three-dimensional
twinning. The [111] sixfold-projection ambiguity is an explicit counterexample.

## Save, revise, inspect

Both tools require a request ID saved before dispatch. The existing structure
provider journal owns deduplication, conflicts and `structure_result` recovery.
A completed comparison includes fixed source/measurement/journal copies,
manifest hashes, observation bindings, full `comparisons.json`, `reflections.csv`
and a PNG returned as actual MCP image content. No arrays are copied or modified
by comparison, and no FFT or simulation runs inside it.

`structure_twin_evidence` is a read-only page over a saved comparison ID and
named numerical section. Supply `comparison` (`parent_domain`, `twin_domain`,
`untwinned_control`), `section` (including `unmatched_simulated`), `offset` and
`limit` (1..128). It validates the original journal and saved file hashes,
returns total/next offset and artifact hash, and accepts no file path. Full
unmatched numerical evidence is therefore available to an MCP-only client.

Saved queries are historical snapshots. To continue after a scale/point/centre
correction, remeasure and revise the atlas/field through existing tools; create
a new comparison request linked to `previous_twin_comparison_id` with a note.
Unchanged FFTs and simulations stay reusable. Never replay an unknown write.
Old field, domain, GPA and topology schemas/validators are unchanged. The
existing Panel can reopen the saved spatial overview and ROI/FFT view IDs;
this first increment adds no twin editor or GUI inference.

Enable the optional structure provider in the existing plugin configuration
(`structures:true`, independent `structure_python` with
`requirements-structure-tools.txt`). A plain image-only installation remains
usable. No DM connection, model API or new environment inside GMS is involved.

## Finite directional resolution after PR42 review

New comparisons identify the direction admission policy as
`finite_reciprocal_direction_support_v2`. Numerical matrix rank alone cannot
make jittered Friedel partners or nearly parallel harmonics independent.
For each nonzero measured q, use the predeclared reciprocal acceptance radius
r to construct an angular guard asin(min(1,r/|q|)). Unoriented directions must
be separated by more than max(1 degree, the sum of both angular guards).
Vectors whose radius reaches DC remain unresolved. Connected ambiguity groups
are order/sign independent and may conservatively undercount directions;
these are not assigned crystallographic reflection identities.

This is an explicit deterministic admission policy, NOT an independently
measured peak uncertainty, calibrated confidence or a change to reflection
matching tolerances. Known larger localisation/calibration errors still need
appropriate experimental bounds; the one-degree floor cannot be removed by
choosing an unrealistically small matching tolerance. The interface angular
criterion remains a separate, unchanged quantity. Every observation and
pairwise direction check remains visible; no artificial averaging is used.

The candidate-law `method_version` remains v1 because its matrix/simulation
model is unchanged. New numerical reports carry the new direction-policy ID.
Old committed reports without it remain historical and are returned byte-for-byte
through original-request recovery, not reclassified. Make an explicit new
comparison/revision to apply the corrected admission. See the exact RED/GREEN
[review evidence](validation/f3b/direction-review.json).

The independent read-only `F3b actual simulation` workflow runs the actual
pinned diffsims provider and compiled MCP smoke on Ubuntu, in addition to the
ordinary lightweight geometry/source tests. It archives its exact public
source, resolved environment and synthetic output for 14 days. Documentation
edits alone do not request this optional integration workflow.
