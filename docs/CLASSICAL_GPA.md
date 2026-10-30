# Classical single-domain geometric phase analysis (F2a)

F2a extracts two geometric phases from an existing, saved complex FFT of one
real scalar spatial image/ROI, 64–512 pixels on each axis, with `window=none`.
Hann-windowed FFTs and imported complex fields are not qualified inputs.
It produces a displacement field and explicitly
defined finite strain/rotation fields on that ROI's spatial grid. Results are
relative to chosen reference waves and a sourced reference-region assumption.
This is a local image analysis method, not phase identification, an automatic
domain classifier, a dislocation detector or a reconstruction algorithm.

## Method choice and external sources

Hÿtch, Snoeck and Kilaas, *Quantitative measurement of displacement and strain
fields from HREM micrographs*, Ultramicroscopy 74 (1998), 131–146,
[doi:10.1016/S0304-3991(98)00035-7](https://doi.org/10.1016/S0304-3991(98)00035-7),
describe isolating a reflection by a Fourier aperture and inverse transforming;
two non-collinear components provide two-dimensional displacement. The publisher
abstract/preview was checked; no claim of reproducing every detail of the full
paper follows from that access.

The [official pyGPA implementation](https://github.com/TAdeJong/pyGPA) is a useful
comparison: it supplies reference-wave and larger-distortion specializations,
distortion correction and unit-cell averaging. Its
[MIT license](https://github.com/TAdeJong/pyGPA/blob/main/LICENSE) permits reuse
subject to retaining its notice; there is no license fee stated. Its
[requirements](https://github.com/TAdeJong/pyGPA/blob/main/requirements.txt) include
Dask, Numba, scikit-image, Matplotlib and latticegen in addition to NumPy/SciPy.
The README also requires a separate non-packaged moisan2011 dependency; GPU
acceleration needs CuPy/CUDA. F2a does not vendor or install pyGPA. Those broader
dependencies and algorithms add integration/qualification cost beyond this
single-domain scope.

F2a instead reuses the existing FFT identity/array and NumPy inverse transform,
adds explicit Gaussian Fourier apertures, and calls mature masked
[`skimage.restoration.unwrap_phase`](https://scikit-image.org/docs/stable/api/skimage.restoration.html#skimage.restoration.unwrap_phase).
The stable documentation checked on 2026-10-30 identifies version 0.26.0 and the
signature `unwrap_phase(image, wrap_around=False, rng=None)`. Masked samples do
not guide adjacent unwrapping, the mask is retained, and a fixed RNG seed gives
deterministic initialization. This avoids writing a new phase-unwrapping engine.
The project [license page](https://scikit-image.org/docs/stable/license.html)
states BSD-3-Clause as its default and lists file-level exceptions. The optional
dependency is isolated in `requirements-gpa.txt`; record the installed version
with every validation run. API compatibility and this project's tests, rather
than dependency reputation, determine the supported behavior.

## Coordinates, apertures and phase sign

`g_vectors` contains two row vectors `[gx, gy]` in **cycles per spatial pixel**.
The spatial array order is `[y,x]`; vectors and integer sample coordinates use
`[x,y]`. These are the coordinates of the FFT's local source ROI, not PNG pixels
or full-frame coordinates. A local half-open rectangle `[x0,y0,x1,y1]` selects
pixel centers `x0..x1-1`, `y0..y1-1`. The FFT source rectangle supplies the mapping
back to full-frame coordinates. Do not add a full-frame origin twice.

The stored forward FFT has a negative exponential, with `fftshift`. A Gaussian
aperture centered on each requested `g` has standard deviation `mask_sigma` in
cycles/pixel and is zero outside three sigma. The MVP uses the same isotropic
width for both reflections. Inverse
transform each masked spectrum and demodulate by `exp(-2πi g·r)` before taking
the wrapped phase. For the chosen convention:

\[
 P_j(r)=-2\pi g_j\cdot u_E(r),\qquad
 u_E(r)=-\frac{1}{2\pi}G^{-1}P(r).
\]

Here `G` has the two reciprocal vectors as rows. Vectors must be finite,
nonzero, non-collinear and separated sufficiently for the declared aperture;
DC, the conjugate reflection and other peaks must not contaminate that support.
Conjugate peaks are not two independent directions. Changing the sign of one
selected reflection changes its phase sign as well; it must not reverse the
recovered displacement.

Narrower apertures smooth over a wider real-space support and may suppress
nearby peaks; broader apertures improve spatial detail while mixing Fourier
components/noise. The amplitude floor, boundary exclusion and stencil validity
are numerical quality choices, not uncertainty estimates. A small valid region
or a visually smooth map does not establish a reliable experiment.

## What the displacement and finite tensors mean

The image is sampled on the deformed spatial grid `r`. For material/reference
coordinate `X`, define `u_E(r)=r-X(r)`. This is an Eulerian displacement field:

\[
 H=\nabla_r u_E=I-F^{-1},\qquad F=(I-H)^{-1}.
\]

For a synthetic finite affine deformation `r=F X+t`, the expected phase slope
therefore tests `I-F^-1`, **not** `F-I`. Translation changes the displacement
constant; reference zeroing removes that unobservable constant. This relation
is the implementation's explicit kinematic convention and an algebraic
derivation, not a claim that the 1998 preview specifies this finite formulation.

When a sourced signed calibration is known, `S=diag(sx,sy)` in nm/pixel converts
the coordinate metric: `u_nm=S u_pixel` and `F_nm=S F_pixel S^-1`. The reported
finite Green–Lagrange tensor is `E=(F^T F-I)/2`; `exy` is its tensor shear
component, not engineering shear `2E_xy`. Finite rotation is the proper polar
rotation `atan2(F_yx-F_xy,F_xx+F_yy)`; the scientific array is stored in radians
and view/read outputs convert it to explicitly labeled degrees. A rigid proper rotation must
produce zero finite strain within declared numerical tolerance. Tensor fields
are stored on the original image sampling grid although `E` refers to the
reference/material basis.

With unknown calibration, displacement remains pixels, physical displacement
is unavailable, and tensors/rotation are labeled **image-coordinate** quantities.
Unitless does not mean independent of metric: unknown anisotropy or axis signs
preclude treating image-coordinate shear/rotation as physical Cartesian
components. A sourced anisotropic/signed calibration is applied before physical
tensor interpretation. No scale, unit, axis sign or uncertainty is inferred.

## Reference modes

Both modes require an explicit `reference_rect` and `reference_text` explaining
why it is used. The rectangle is not automatically detected as strain-free.

| Mode | Meaning | Consequence |
| --- | --- | --- |
| `fixed_g` | Keep the supplied reciprocal basis; remove only the reference-region phase constants. | Preserves a uniform phase gradient/affine deformation relative to the supplied basis. Displacement zero is reference-dependent. |
| `fit_reference` | Fit phase planes within the valid reference region, remove them and use the corresponding effective reference waves. | Measures deformation relative to that fitted local lattice. An affine region chosen as reference becomes zero by construction; its absolute strain is not measured. |

The saved report retains requested and effective `g`, reference mode/rectangle,
source statement, fit diagnostics, validity masks, parameter choices and exact
source/FFT/calibration identities. A fitted lattice is a chosen reference, not
an independent validation or corrected experimental calibration.

## Tools, revision and recovery

Inspect the installed tool schema first. `image_gpa` takes the exact saved FFT
or qualified wrapper plus the two vectors, aperture width and reference settings.
It also requires `source_domain: "real_space_lattice"` and `source_domain_text`
stating the actual source or working assumption. An unknown image domain is not
silently promoted to a spatial lattice; the declaration remains a caller-sourced
assumption, not independent verification. A known reciprocal/diffraction image
is refused even if a contrary declaration is supplied.
It never recomputes the forward FFT. `image_gpa_view` makes a presentation of one
saved component (`phase_1`, `phase_2`, `ux`, `uy`, `exx`, `eyy`, `exy`, `rotation`)
with optional display range. It creates no new GPA field or FFT.
`image_gpa_read` persists a bounded receipt for explicitly requested integer
local sample coordinates; it is not a pointer-move journal.

A changed mask, reference, vectors or calibration creates a new scientific GPA
revision via `previous_gpa_id`; the prior GPA, saved FFT and original image stay
immutable. A display-range change uses a view. F2a does not add an
AnalysisContext GPA role: retain the provider result/request IDs, rather than
putting a GPA object into an unrelated context slot. Any existing supported
context update still requires its normal CAS guards. An unknown original request is queried with
`image_result`; do not replay it or reconstruct it by running a new FFT. Reopen
saved results and views with their original identities after reconnecting.

`image_export` writes to a new child directory under an existing parent and
refuses overwrite. GPA exports retain the scientific NPY components, validity
masks, report, table and provenance; a selected view adds its PNG. PNG colors,
display limits and annotations are presentation, never the numerical tensor.

## Scientific limits and stage boundary

[Peters et al., *Artefacts in geometric phase analysis of compound materials*
(2015)](https://arxiv.org/html/1504.06089v1) show that a changing multi-atom basis
can add Fourier phase unrelated to lattice displacement. Thus composition,
sublattice intensity and internal-coordinate changes can produce pseudo-strain
even in a strain-free lattice; selecting appropriate reflections requires
additional structural knowledge. F2a does not diagnose or remove this ambiguity.
Noise, low amplitude, phase singularities, discontinuities, mixed domains,
scan/projector distortion and image-formation contrast also limit interpretation.
Masked/disconnected areas must remain unavailable rather than filled with zero.

F2a is one explicitly selected domain and one real scalar image/ROI. It does not
add F3 segmentation/domain tracking, Burgers circuits, automatic defect labels,
multi-frame alignment, phase/material identification or ptychography. A complex
reconstruction's wave phase is not a GPA geometric phase; its real part or
display amplitude is not silently substituted as this workflow's input. GUI
gesture acceptance, new native/DM/GMS work and private-specimen qualification are
outside this stage. See [F2a acceptance](F2A_ACCEPTANCE.md) for observed evidence
and untested scopes.
