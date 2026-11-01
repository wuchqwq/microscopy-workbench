# Scientific and implementation sources inspected

Accessed 2026-11-01. These are methodological sources, not evidence of actual execution; execution evidence is in `evidence/` and the local immutable worker workspaces.

| Source | Version / convention used | Role and limits |
|---|---|---|
| [Kabsch, W. (1976), A solution for the best rotation to relate two sets of vectors, Acta Cryst. A32, 922–923](https://doi.org/10.1107/S0567739476001873) | Primary publication; weighted squared-deviation rotation problem | Basis for assessing proper Procrustes; the audit tested the code's fixed, equal-weight 2D specialization, not general statistical inference |
| [SciPy official `orthogonal_procrustes`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.orthogonal_procrustes.html) | Web page identifies1.18.0; runtime1.18.1; row-vector `A@R≈B` | Orthogonal transformation may reflect; production determinant correction restricts to SO(2). No fitted translation/physical scale |
| [diffsims official `DiffractionGenerator.calculate_ed_data`](https://diffsims.readthedocs.io/en/stable/reference/generated/diffsims.generators.diffraction_generator.DiffractionGenerator.calculate_ed_data.html) | Documentation0.7.0; runtime0.7.0; reciprocal coordinates inverse Å, Euler rotation and excitation cutoff | Actual saved simulations compared with independent cubic/tetragonal reciprocal truth. Intensity/dynamical accuracy not established |
| [NumPy official `fftfreq`](https://numpy.org/doc/stable/reference/generated/numpy.fft.fftfreq.html) | Documentation2.5; runtime2.5.4; cycles/sample-unit, bins1/(n d) | Used for analytic finite-grid scale; bin spacing is not a universal subpixel localization uncertainty |
| [IUCr Online Dictionary: Friedel's law](https://dictionary.iucr.org/Friedel%27s_law) | Page revision2026-10-24; kinematic structure-factor and stated scattering conditions | Distinguishes conjugate-index redundancy and conditions; actual real-cosine Fourier conjugacy follows directly from construction |

Owning implementation source inspected at `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`:

- `crystallography/registration_proposal.py`: proper2D SVD; fixed scale/DC; exact+ULP peak/projection/HKL independence; conditional validation flags.
- `crystallography/reflection_compare.py`: physical signed calibration and DC admission, cycles/Å conversion, cardinality-then-residual assignment, ambiguity, unmatched retention.
- `crystallography/structure_tools.py`: worker schemas, actual saved simulation requirements, current-geometry binding, saved registration consumption and validation-status propagation.
- `crystallography/general_evidence.py`: one shared transform, candidate conditions, two-domain quality/physical admission, explicit NOT_VALIDATED status.
- `crystallography/twin_geometry.py`: FCC/diamond motif scope, proper Sigma3 candidate operation, finite direction-family policy, fixed untwinned control, interface projection.
- `crystallography/twin_observations.py` and `twin_tools.py`: saved scientific grid/ROI/frame/calibration binding and insufficient physical evidence handling.
- `tools/image_workspace.py`: actual saved source/frame/calibration/FFT/measurement worker route.

Existing smoke scripts were read to learn request contracts. Their passing reports were not used as audit evidence, and their fixture generators were not invoked. New fixtures use independent analytic equations and hard-coded matrices.
