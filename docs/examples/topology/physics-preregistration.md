# F3a independent physics preregistration

The generator and truth manifest were written before the first physics test
execution. Numerical tolerances are fixed in
`tools/create_topology_fixtures.py:TOLERANCES` and
`tests/fixtures/topology_truth.json`; failures must be retained, not repaired by
widening those bounds. They are numerical regression gates, not experimental
uncertainty or confidence estimates.

The independent continuum oracle prescribes
`u=sum b*atan2(y-cy,x-cx)/(2*pi)+u_regular`. Its multitone real image is
`I=sum A*cos(2*pi*g dot (x-u))`, with three carriers
`g=.125*[1,0], .125*[0,1], .125*[1,1]`. Positive image XY loops travel east,
south, west, north, clockwise on a y-down display. The analytical continuum
closure is `w=-G*sum(enclosed b)`, so `b=[8,0]` gives `[-1,0,-1]`.
The expected answer uses prescribed core inclusion and analytical geometry,
not a copied discrete wrapped-phase circulation algorithm.

Every charged carrier uses the explicitly declared amplitude taper
`tanh(r/2)**abs(g dot b)`. This changes core contrast, not phase on enclosing
paths. The optional Gaussian single-valued regular field has an analytical
displacement gradient exceeding 0.10, while retaining zero circulation by
construction. Affine and smooth nulls test that a strain hotspot is not a
topological oracle.

The real-image path computes an unwindowed existing FFT and calls the unchanged
classical GPA kernel twice, for `(g0,g1)` and `(g0,g2)`. Topology consumes its
raw `phase_demodulated_wrapped`, amplitude, original reciprocal vectors and
edge guard. GPA unwrap/tensor masks are not imported as path masks: a branch
cut needed for unwrapped displacement is not missing wrapped phase evidence.
Any GPA hard refusal is a recorded failure; this suite does not loosen the
existing GPA qualification to obtain a topology pass.

The suite covers both signs, reversed traversal, nested radius and shifted
loops, exterior zero loops, an invisible reflection, two opposite cores with
zero net winding, individual-core loops, masked core interiors, invalid path
samples, near-pi jumps, and one deliberately undersampled high-charge case.
The fixed seed random-phase fixture must be rejected on the prescribed paths.
This is not a general noise discriminator; coherent noise or undetected
subsample aliasing may share the same discrete phase observations.

The contrast-only counterexample uses fixed lattice carriers and spatially
varying complex contrast coefficients. Its real intensities are exactly
identical to the Volterra texture, although its specified material displacement
is zero. Therefore even compatible redundant winding can establish only
conditional projected image-phase evidence, never a confirmed material
dislocation. Zero net winding likewise does not establish defect absence.

Unknown signed metric permits pixel Burgers components only. The explicit
signed XY metric `[0.02,-0.035]` nm/pixel transforms `[8,8]` pixels to
`[0.16,-0.28]` nm without inventing a 3D Burgers vector or material identity.

Reproduce fixture truth with:

```text
python tools/create_topology_fixtures.py --output tests/fixtures --truth-only
python tools/create_topology_fixtures.py --output docs/examples/topology --evidence
```

The evidence runner preserves failed commands and their raw output in
`physics-results.json:failure_history` and appends machine-specific execution
evidence under ignored `analysis/2026-10-30-f3a-physics/`.
