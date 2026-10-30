# Independent F3b geometry fixtures

`create_fixture.py` writes a public, two-ROI cosine TIFF, explicit conventional
FCC/diamond CIF references, and `truth.json` to a fresh supplied directory.
Run `python tests/fixtures/twin_f3b/create_fixture.py <fresh-output-directory>`.
No production twin solver, ASE orientation builder, or diffsims simulation is
used to calculate expected geometry. The CIFs deliberately use P1 with every
basis site listed; the declared 4 Å cell is synthetic, not a measured constant.

The parent is viewed down `[1 -1 0]`, the child down `[0 -1 1]`. The hard-coded
proper twin rotation is `[[2,-1,2],[2,2,-1],[-1,2,2]]/3`, a +60° rotation about
`[111]`. The shared `(111)` normal maps to laboratory +Y and the edge-on trace
to laboratory X. The image has signed, unequal source XY scales. Its four cosine
families land on exact integer FFT bins in each 128 × 128 ROI and contain both
Friedel partners. The geometry applies to the selected allowed reflections in
both FCC and diamond references; the image does not model atomic structure.

The 40° ordinary boundary and `[111]` beam projection ambiguity are analytic
controls in JSON. A 40° rotated pattern is not integer-bin periodic under the
positive TIFF's metric; do not claim the exact-bin error bound for detected
maxima of a separately sampled 40° image. Along `[111]`, the complete six-point
`{220}` ring is identical for identity and the Σ3 relation. The coherent `(111)`
normal has zero transverse projection, so no trace direction can resolve it.

Preregistered vector/trace admission bounds are chosen numerical criteria,
not measured uncertainty or confidence intervals. A wrong vertical trace only
contradicts the projected coherent `{111}` interface model; it does not erase
the compatible Σ3 reflection relation. Missing calibration stays insufficient;
invalid source/journal links must be refused by the saved-provider layer.

These fixtures establish bounded analytic synthetic geometry. They do not
establish a unique 3D twin, chemical phase, specimen coherence, intensities,
physical contrast, browser interaction, model comprehension, or instruments.

Primary background sources: [Cayron (2007), cubic twin equivalence](https://journals.iucr.org/a/issues/2007/01/00/au5046/index.html)
and [Cayron et al. (2009), projected silicon microtwin ambiguities](https://journals.iucr.org/j/issues/2009/02/00/hx5080/index.html).
