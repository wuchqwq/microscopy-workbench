# Fixed-site real-space observations

Use the existing tools according to the question; a full structure field is
not mandatory. Inspect `image_info` and the actual original-image preview first.
Keep the frame, source pixels, calibration and display range explicit. This
workflow does not infer depth, chemical identity or an image-formation model.

An absent atom may provide no bright maximum. From neighboring regular sites
in the **same image and same putative sublattice**, propose the expected site
and explain how its coordinates were inferred. Do not automatically center it
on the nearest bright column. If the lattice/site assignment is not stable,
stop with an unknown or request a researcher correction. Do not mix different
column types (for example Mo and S) as equivalent intensity references. The
tools do not verify that equivalence; record it as a sourced assumption.

Save a bounded ROI around the fixed expected position with
`image_discovery(entry:"manual",selection_origin:"agent"|"researcher",regions:...)`.
Manual means explicit coordinates, not mandatory human selection. Use
`image_probe` only for quick ephemeral reads. To retain evidence, call
`image_statistics` on that exact primary `rect`, optionally with:

```json
{"reference_comparison":{"reference_rects":[[32,32,40,40],[48,32,56,40]],"source_text":"Caller inferred equivalent same-sublattice sites from the current image; equivalence remains unverified"}}
```

These coordinates illustrate the schema, not a recommended specimen/site.
Each reference must have the primary ROI shape, lie in the same saved plane,
and be distinct. Overlap is reported; same-image observations are correlated.
Read individual reference means, not just their median difference. Inconsistent
references, scan gradients, mixed columns, noise, overlap or poorly registered
sites require an explicit unknown or a bounded revised observation. A new ROI
requires new evidence; no silent reuse or fitting drift to a neighboring peak.

`image_profile` can save a width-one raw line through the expected site and
neighboring positions. Bind a profile only when **all its sampled pixels lie
inside the discovery ROI**; otherwise make an appropriately larger separate
observation. `image_discovery_review` accepts saved statistics whose primary ROI
equals the candidate, and profiles supported inside it. Contextual references
are not measurements of that same ROI; a line does not cover the whole ROI.
The review reconstructs numbers from original request/array, retains object
references and unknowns, and never confirms the physical explanation. Probe
outputs are not saved evidence IDs. `image_export` retains comparison JSON and
profile numerical files. Recover uncertain writes by their original request ID.

Use an existing FFT for periodicity/orientation context if useful. Read
`selection_limit_reached` as equality to cap. The optional
`candidate_pool_truncation` diagnostic distinguishes an actual remaining
thresholded maximum outside returned-peak suppression from no such maximum.
Neither status establishes physical completeness. Returned peaks remain useful
conditional evidence; do not discard the whole FFT or simply raise its cap as
a point-defect solution. Positive/negative conjugate peaks are not independent
structural observations, and unchanged peak positions cannot exclude a vacancy.

Report signed raw mean differences and fixed support, not occupancy, electron
counts, calibrated confidence or vacancy probabilities. A weak projected column
can arise from composition, thickness, channeling, tilt, scan/background,
projection or image formation. A pristine paired image is useful offline truth
but is **not** required production input. Missing-column proxies do not qualify
physical STEM, real specimens or blind defect identification. No model training
or new dependency is involved. Human revision uses the same chain; a Panel does
not automatically awaken a model. Existing AnalysisContext slots remain
reference-only: do not invent a new statistics slot or bypass CAS revisions.

Primary references supporting the methodological scope (not a validation of
this implementation): [Nord et al., Atomap](https://doi.org/10.1186/s40679-017-0042-5)
for atom-column position/intensity analysis, and
[Hong et al., MoS2 defects](https://doi.org/10.1038/ncomms7293) for ADF contrast
interpreted with structural/simulation context. This increment does not install
or reproduce either method.
