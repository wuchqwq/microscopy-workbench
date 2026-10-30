# Bounded projected twin hypothesis

Use only when `structure_twin_orient` and `structure_twin_compare` are advertised.
First scope is one specified cubic Sigma3 {111} variant in a supplied conventional,
fully occupied, single-species FCC4 or diamond8 reference. A different structure
can still use ordinary viewing/geometry tools; do not silently convert its cell
or substitute FCC. The reference remains a candidate material.

1. Retain an explicit parent `structure_orient` and source structure snapshot.
   Call `structure_twin_orient` with their IDs, `plane_hkl:[1,1,1]` (or another
   explicit signed {111} variant), `candidate_basis` and a pre-saved request ID.
   Reuse the returned `orientation.orientation_id`; do not guess Euler angles.
2. Call ordinary `structure_simulate` twice on the **same original structure**,
   with parent and candidate orientation IDs and identical voltage, radius,
   excitation error and raster settings. These are actual separate simulations;
   rotating a parent table after excitation filtering can omit twin reflections.
3. Use two adjacent saved `image_spatial_atlas`/`image_spatial_field` observations
   (or compatible field extension/domain map), selected by their exact source
   rectangles, not domain numbers. Each domain input is
   `{field_object_id,rect_xyxy,current_image_object_id}`. The current image is
   that observation's current FFT or calibration wrapper. Optional
   `measurement_object_ids` select committed measurements already in that
   observation; revise the field/atlas before supplying new or corrected points.
4. Call `structure_twin_compare` with `object_id` = candidate orientation,
   both `*_simulation_object_id` values, `current_spatial_image_object_id`,
   two domains, predeclared reciprocal/angular tolerances and ONE registration:
   `{rotation_deg,scale:1,translation_inv_angstrom:[0,0],flip_y,basis}`.
   Independent experimental scale, centre and known screen parity stay fixed.
   A trial parent registration is a hypothesis, not user-confirmed HKL. Never
   fit domain B separately to make a twin agree.
5. An optional saved source-pixel `image_measure` line can constrain the
   projected interface. Supply `interface_measurement_object_id` together with
   `interface_projection_basis` stating why the line and orthographic beam +Z
   mapping are applicable. It must meet the selected ROI contact neighborhood.
   A domain-map support band is not a located atomic interface.

Inspect `projected_relation`, `interface` and joint `status` separately. Missing
scale, incomplete/ambiguous windows, unresolved parent registration, an equally
good untwinned control or a non-edge-on plane leaves evidence insufficient.
Wrong interface trace does not by itself disprove a Sigma3 orientation relation.
Keep unmatched peaks and tied HKLs. Two noncollinear families constrain this
finite geometric comparison; Friedel partners/harmonics are not extra directions,
and points used to choose the candidate are not independent validation.

The result contains a PNG, measured residuals, JSON/CSV paths and exact source,
calibration, observation and simulation references. Read full numerical pages
with `structure_twin_evidence`: saved comparison `object_id`, `comparison`
(`parent_domain`, `twin_domain`, `untwinned_control`), a named `section` such as
`unmatched_simulated`, `offset:0` and `limit:64`. Follow `next_offset` without
creating a new result. Reopen ordinary source/FFT
view IDs in the existing Panel to inspect or correct them; no new GUI is required.
After correction, update the atlas/field using its existing revision mechanism,
then compare with a NEW request and `previous_twin_comparison_id` plus
`revision_note`. Unchanged FFT/simulation IDs remain reusable. Query original
`structure_result` to review a past comparison, not to pretend it follows a new
centre or scale. No automatic replay after cancellation/timeout.

Report compatibility as conditional **projected evidence**, never unique 3D
twinning, coherent atomic stacking or a confirmed phase. A [111] projection can
make a 60-degree twin and untwinned lattice indistinguishable. Suggest a new
discriminating observation when useful; do not silently search mirrors, strain
or scale, compare FFT/SAED intensities or invoke unadvertised tools.
