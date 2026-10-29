# R3 local structural field: method baseline

Literature/code checked 2026-10-30 for Issue #8. This is a bounded local
observation field, not automatic phase segmentation, a trained embedding or GPA.

## What we reuse

| Reference | Useful method or organization | This implementation |
|---|---|---|
| [Jany, Janas & Krok, Micron 130 (2020) 102800](https://doi.org/10.1016/j.micron.2019.102800), [author full text](https://arxiv.org/pdf/1907.10929) | Moving windows with explicit size/steps, a local Fourier spectrum at each position; window size sets sensitivity and step affects coverage/cost. Their subsequent PCA/NMF creates spatial loadings and spectral factors. | Existing batch FFT supplies immutable local spectra. Explicit rectangular samples retain their actual positions and window settings. We expose a sparse field of measured reciprocal families, periods and projected directions. We do not implement their PCA/NMF decomposition or claim equivalent phase maps. |
| [Jany notebook/data v2](https://data.mendeley.com/datasets/25x46xjyr5/2) | Public method reference and example data, CC BY 4.0. | Link as reference; do not bundle their example specimen images or imply they are this project's acceptance fixture. |
| [HRTEM2](https://github.com/rememberBr/HRTEM2), [NMF.py](https://github.com/rememberBr/HRTEM2/blob/main/NMF.py), [test.py](https://github.com/rememberBr/HRTEM2/blob/main/test.py) | Keeps window/step parameters, spatial loadings and local factors associated with an experiment. Inspected code rebins width to 2048, uses square-root outer Hann, log power with an added offset, decomposition and a separate trained prediction pipeline. | Adopt the need for explicit spatial/spectral provenance. Do not copy code, depend on its trained model, resize scientific input, add a power offset or silently change our FFT window. Its GPL-3.0 code is not vendored. |
| [py4DSTEM BraggVectors](https://github.com/py4dstem/py4DSTEM/blob/dev/py4DSTEM/braggvectors/braggvectors.py) | Scan positions associate variable-length reciprocal vectors/intensities; raw and calibrated access and applied calibration state are separate. | Keep each source-pixel window/frame, its variable-length reflection family list, raw measurement references and applied calibration record. No mandatory dense four-dimensional array or py4DSTEM dependency; no GPL-3.0 code is vendored. A real 4D-STEM diffraction scan is not an HRTEM image's sliding FFT. |

The inspected upstream branches can change; links identify the exact inspected
files, not a claim of qualification of every upstream revision. No new runtime
library or model weights are required by this increment.

## Baseline and scientific conventions

Production uses the existing `image_fft` implementation: an explicit `none` or
separable outer-product `hann` window, optional mean subtraction, unnormalized
complex FFT and shifted frequency coordinates. This is **not** HRTEM2's square-root
Hann/log-offset preprocessing. All original complex arrays remain immutable.

`image_spatial_atlas` composes 1–8 supplied windows and saves ordinary peak and
measurement records. `image_feature_field` derives F(x,y) from those records, an
R2 joint observation, or a saved local comparison. It never recalculates an FFT.
Irregular/multiscale windows have no invented global stride. Source coordinates
are half-open rectangle edges; centers are means of included pixel centers.

For physical vectors, signed X/Y scale is applied before direction or rotation
comparison. Missing scale remains unknown. Opposite Fourier reflections form
one antipodal geometric family; they are not two independent validations.
In-plane family directions are modulo 180 degrees and pairwise line angles are
acute projected angles, not a three-dimensional crystal misorientation.

Each field sample retains source dtype/hash, frame/window, FFT and measurement
IDs, calibration, detector settings/quality and correction origin. Missing,
ambiguous and truncated observations have masks/reasons; non-detection is not
zero crystallinity. Statistical/localization uncertainty is unknown, not the
FFT bin spacing. Unsampled areas stay unsampled. Colors and interpolation used
only to resize a display image do not create scientific samples or domain labels.

R2 correspondence carries its original user-declared or numerical-match basis,
reference/target ROI and displacement. Shared sequence indices alone do not
prove corresponding structure, temporal continuity or physical depth.

## Reproducible comparison, not a trained-model benchmark

Public synthetic fixtures include signed float32 lattices, a known in-plane
rotation, overlapping structures, a real piecewise boundary, multiple window
sizes/offsets, a constant negative image, seeded isotropic noise and an R2 sequence.
The independent oracle uses analytic reciprocal vectors and direct DFT sums
(all bins for the finite fixtures), or NumPy on precisely the recorded window.
No oracle answers are exposed to the fresh Agent runtime.

Acceptance reports separate geometric error, sampled coverage, usable/ambiguous/
undetermined sample fractions, window-size sensitivity and wall time. Coverage
means the union of supplied rectangles, not classification accuracy. The classical
comparison is local FFT with identical recorded preprocessing; it is not a new
production FFT engine, a full reproduction of Jany's NMF, or a comparison of
learned models. Boundary mixtures and noise retain their evidence and limitations.

A later dense sampler or decomposition method can consume these versioned
records. Neither is needed to use or revise this first sparse field.
