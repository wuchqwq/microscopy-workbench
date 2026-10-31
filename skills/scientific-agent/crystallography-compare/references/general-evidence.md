# Compare explicit structures across adjacent ROIs

When the question concerns two neighboring regions and possibly different
structures, use `structure_general_compare` if advertised. It is separate from
`structure_twin_compare`; do not enter a generic BCC/HCP/multielement task through
the old Sigma3 motif gate or call a generic rotation a twin law.

Read the current schema. Obtain two exact saved spatial-field/atlas/domain-map
observations, current FFT wrappers and committed reflection measurements from
the same original source/frame/calibration. They must overlap or share an edge.
Use original ROI coordinates, not preview pixels, sample numbers or peak labels.

Open explicit CIF/XYZ candidates, reuse actual-cell `structure_orient` records,
then run `structure_simulate` with explicit comparable scientific conditions.
Supply a finite list of paired simulation IDs, a reason for each candidate,
one shared registration (scale1, DC translation0), and a predeclared residual
tolerance. No per-ROI refit or exhaustive phase/orientation search is implicit.

Inspect each qualification section: source, sites, cell, occupancy, group and
actual simulation are distinct. CIF group declarations are not independently
verified symmetry. Refused enumeration/occupancy stays refused; unknown scale
permits pixel observation but not invented physical spacings.

Keep per-side matches, unmatched and ambiguous HKLs and all candidate pairs.
Multiple compatible projections, only one direction, low quality or unknown
scale stay insufficient. Search points do not become held-out validation.
Kinematic intensities are not HRTEM/ptychography FFT intensity predictions.

Save the request ID before submission. Read `structure_result` after timeout;
do not replay unknown children. For changed current evidence use an immutable
revision with `previous_evidence_id`/`revision_note` and retain old comparisons.
Return the actual PNG and existing image Panel references for review; a PNG is
not the scientific array or proof of phase/twinning.

See the bundled `docs/GENERAL_CRYSTALLOGRAPHIC_EVIDENCE.md` for the first-version
support matrix. Tool availability and scientific applicability remain explicit.
