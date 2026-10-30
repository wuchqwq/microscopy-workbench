"""Bounded classical two-reflection geometric phase analysis (GPA).

This numerical kernel accepts an existing, unwindowed, fftshift-ordered FFT of a
real spatial image. It never computes a source FFT or identifies a material.
Pixel centres are (x, y), reciprocal-vector rows are (gx, gy) in cycles/pixel,
and the phase convention is phi = -2*pi*G*u_E, u_E(x) = x - X(x).

Finite deformation is F = inverse(I - grad_x(u_E)); Green--Lagrange strain and
the proper polar rotation are reported. Without an explicit signed XY metric,
these tensors describe image coordinates and are not physical strain tensors.
"""

import inspect
import math
from importlib.metadata import version

import numpy as np
from scipy import ndimage


ALGORITHM_VERSION = "classical-two-g-gpa-finite-v1"
MASK_TRUNCATION_SIGMA = 3.0
MAX_CONDITION = 100.0


class GPAError(ValueError):
    def __init__(self, message, code="GPA_INVALID_ARGUMENT"):
        super().__init__(message)
        self.code = code


def _need(condition, message, code="GPA_INVALID_ARGUMENT"):
    if not condition:
        raise GPAError(message, code)


def _wrap(phase):
    return (phase + np.pi) % (2 * np.pi) - np.pi


def _pair(values, name):
    try:
        result = np.asarray(values)
        _need(result.dtype.kind in "iuf" and result.shape == (2,), name + " requires two finite numbers")
        result = result.astype(np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise GPAError(name + " requires two finite numbers") from error
    _need(np.isfinite(result).all(), name + " requires two finite numbers")
    return result


def _g_vectors(values, name):
    try:
        result = np.asarray(values)
        _need(result.dtype.kind in "iuf" and result.shape == (2, 2), name + " requires exactly two XY vectors")
        result = result.astype(np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise GPAError(name + " requires exactly two finite XY vectors") from error
    _need(np.isfinite(result).all(), name + " requires finite XY vectors")
    condition = float(np.linalg.cond(result))
    _need(math.isfinite(condition) and condition <= MAX_CONDITION,
          name + " must contain two noncollinear, well-conditioned vectors (condition <= 100)")
    return result, condition


def _mask_geometry(g_vectors, sigma, shape):
    h, w = shape
    radius = MASK_TRUNCATION_SIGMA * sigma
    for index, (g, r) in enumerate(zip(g_vectors, radius)):
        _need(float(np.linalg.norm(g)) > r,
              "Reflection %d mask includes DC or overlaps its conjugate" % index)
        # Stay inside the half-open Nyquist cell, including a half-bin guard.
        _need(abs(float(g[0])) + r < .5 - .5 / w and abs(float(g[1])) + r < .5 - .5 / h,
              "Reflection %d mask reaches a Nyquist boundary" % index)
    _need(float(np.linalg.norm(g_vectors[0] - g_vectors[1])) > float(radius.sum()),
          "The two reflection masks overlap")
    _need(float(np.linalg.norm(g_vectors[0] + g_vectors[1])) > float(radius.sum()),
          "A reflection mask overlaps the other reflection's conjugate")


def _residues(phase, eligible):
    """Flag plaquette winding for masking, without interpreting defects."""
    dx = _wrap(np.diff(phase, axis=1))
    dy = _wrap(np.diff(phase, axis=0))
    circulation = dx[:-1, :] + dy[:, 1:] - dx[1:, :] - dy[:, :-1]
    squares = (eligible[:-1, :-1] & eligible[:-1, 1:] &
               eligible[1:, :-1] & eligible[1:, 1:])
    winding = np.rint(circulation / (2 * np.pi)).astype(np.int8)
    bad = (winding != 0) & squares
    corners = np.zeros_like(eligible)
    corners[:-1, :-1] |= bad
    corners[:-1, 1:] |= bad
    corners[1:, :-1] |= bad
    corners[1:, 1:] |= bad
    # Exclude neighbours too, so no numerical derivative crosses a residue.
    invalid = ndimage.binary_dilation(corners, structure=np.ones((3, 3), dtype=bool))
    return invalid, {"positive": int(((winding > 0) & squares).sum()),
                     "negative": int(((winding < 0) & squares).sum())}


def _unwrap(phase, valid, seed):
    try:
        from skimage.restoration import unwrap_phase
    except ImportError as error:
        raise GPAError("Classical GPA requires optional scikit-image in the independent image environment",
                       "GPA_DEPENDENCY_UNAVAILABLE") from error
    # scikit-image renamed seed to rng; use its public API in either supported
    # release family. Each reflection gets a fresh deterministic initialization.
    keyword = "rng" if "rng" in inspect.signature(unwrap_phase).parameters else "seed"
    result = unwrap_phase(np.ma.array(phase, mask=~valid), wrap_around=False, **{keyword: seed})
    return np.asarray(np.ma.filled(result, np.nan), dtype=np.float64)


def _unwrap_discontinuities(unwrapped, wrapped, valid):
    """Exclude unavoidable branch jumps across masked holes or residues."""
    invalid = np.zeros_like(valid)
    for axis in (0, 1):
        left = (slice(None, -1), slice(None)) if axis == 0 else (slice(None), slice(None, -1))
        right = (slice(1, None), slice(None)) if axis == 0 else (slice(None), slice(1, None))
        mismatch = np.diff(unwrapped, axis=axis) - _wrap(np.diff(wrapped, axis=axis))
        bad = (np.abs(mismatch) > np.pi) & valid[left] & valid[right]
        invalid[left] |= bad
        invalid[right] |= bad
    return ndimage.binary_dilation(invalid, structure=np.ones((3, 3), dtype=bool))


def analyze(spectrum, g_vectors, mask_sigma, reference_rect, *,
            reference_mode="fixed_g", amplitude_floor_relative=0.05,
            edge_margin=None, calibration_nm_xy=None, unwrap_seed=0):
    """Return ``{'arrays': ndarray mapping, 'report': JSON-safe mapping}``.

    ``spectrum`` is a finite complex128 [y,x] array with 64..512 samples on each
    axis. The caller must verify a real spatial source and FFT window ``none``.
    ``mask_sigma`` is one isotropic frequency sigma or one per reflection.
    Gaussian masks are zero outside 3 sigma; no masks wrap across Nyquist.
    ``reference_rect`` is local half-open [x0,y0,x1,y1]. ``fixed_g`` removes only
    constant phase gauges; ``fit_reference`` removes fitted planes and changes
    the reciprocal basis, explicitly measuring deformation relative to that ROI.
    Optional ``calibration_nm_xy`` supplies signed nanometres per pixel.

    Phase arrays have shape [reflection,y,x]; vectors [y,x,component_xy]; tensors
    [y,x,row_component_xy,column_coordinate_xy]. Scientific displacement/tensor
    outputs contain NaN outside their saved masks. Complex bands, amplitudes,
    filter masks and wrapped phases are retained as unmasked diagnostics.
    """
    values = np.asarray(spectrum)
    _need(values.ndim == 2 and values.dtype == np.dtype("complex128") and
          all(64 <= n <= 512 for n in values.shape),
          "GPA requires an existing complex128 2D spectrum, 64..512 samples per axis")
    _need(np.isfinite(values).all(), "GPA spectrum must be finite")
    g, condition = _g_vectors(g_vectors, "g_vectors")
    if np.isscalar(mask_sigma):
        _need(not isinstance(mask_sigma, (bool, np.bool_)), "mask_sigma requires a frequency standard deviation")
        try:
            sigma = np.full(2, float(mask_sigma), dtype=np.float64)
        except (TypeError, ValueError, OverflowError) as error:
            raise GPAError("mask_sigma requires a finite frequency standard deviation") from error
    else:
        sigma = _pair(mask_sigma, "mask_sigma")
    _need(np.isfinite(sigma).all() and np.all(sigma > 0), "mask_sigma must be positive and finite")
    _mask_geometry(g, sigma, values.shape)
    _need(reference_mode in ("fixed_g", "fit_reference"), "reference_mode requires fixed_g or fit_reference")
    _need(type(amplitude_floor_relative) in (int, float) and math.isfinite(amplitude_floor_relative)
          and 0 < amplitude_floor_relative < 1,
          "amplitude_floor_relative requires a finite fraction strictly between zero and one")
    _need(type(unwrap_seed) is int and 0 <= unwrap_seed < 2 ** 32, "unwrap_seed requires a uint32 integer")
    h, w = values.shape
    try:
        rect = list(reference_rect)
    except TypeError as error:
        raise GPAError("reference_rect requires local half-open XYXY integers") from error
    _need(len(rect) == 4 and all(type(n) is int for n in rect),
          "reference_rect requires local half-open XYXY integers")
    x0, y0, x1, y1 = rect
    _need(0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h and (x1 - x0) * (y1 - y0) >= 9,
          "reference_rect must contain at least nine in-bounds pixel centres")
    default_margin = max(2, math.ceil(3.0 / (2 * np.pi * float(sigma.min()))))
    margin = default_margin if edge_margin is None else edge_margin
    _need(type(margin) is int and margin >= default_margin and 2 * margin + 2 < min(h, w),
          "edge_margin must be at least the bandwidth-derived guard (%d pixels) and leave an interior" % default_margin)
    metric = None if calibration_nm_xy is None else _pair(calibration_nm_xy, "calibration_nm_xy")
    if metric is not None:
        _need(np.all(metric != 0) and float(np.max(np.abs(metric)) / np.min(np.abs(metric))) <= 1e6,
              "calibration_nm_xy requires nonzero signed scales with a bounded XY ratio")

    yy, xx = np.indices((h, w), dtype=np.float64)
    fy = np.fft.fftshift(np.fft.fftfreq(h))[:, None]
    fx = np.fft.fftshift(np.fft.fftfreq(w))[None, :]
    masks, bands, amplitudes, carrier_phases, demodulated = [], [], [], [], []
    for vector, width in zip(g, sigma):
        radius2 = ((fx - vector[0]) ** 2 + (fy - vector[1]) ** 2) / width ** 2
        mask = np.where(radius2 <= MASK_TRUNCATION_SIGMA ** 2, np.exp(-.5 * radius2), 0.0)
        _need(int(np.count_nonzero(mask)) >= 9, "A GPA frequency mask has fewer than nine sampled coefficients")
        band = np.fft.ifft2(np.fft.ifftshift(values * mask))
        phase = np.angle(band)
        carrier = 2 * np.pi * (vector[0] * xx + vector[1] * yy)
        masks.append(mask)
        bands.append(band)
        amplitudes.append(np.abs(band))
        carrier_phases.append(phase)
        demodulated.append(_wrap(phase - carrier))
    amplitude = np.asarray(amplitudes)
    phase_demodulated = np.asarray(demodulated)
    edge_invalid = np.ones((h, w), dtype=bool)
    edge_invalid[margin:h - margin, margin:w - margin] = False
    low_amplitude = np.zeros((2, h, w), dtype=bool)
    residue_invalid = np.zeros_like(low_amplitude)
    amplitude_thresholds, residue_counts = [], []
    numerical_band_floor = (np.finfo(np.float64).eps * 128 *
                            max(float(np.max(np.abs(values))) / (h * w), float(amplitude.max())))
    for index in range(2):
        peak = float(np.max(amplitude[index]))
        _need(math.isfinite(peak) and peak > max(numerical_band_floor, np.finfo(np.float64).tiny),
              "A selected reflection has no band amplitude above the input numerical roundoff floor", "GPA_INSUFFICIENT_EVIDENCE")
        threshold = max(amplitude_floor_relative * peak, np.finfo(np.float64).eps * peak * 32)
        amplitude_thresholds.append(threshold)
        low_amplitude[index] = amplitude[index] <= threshold
        eligible = ~low_amplitude[index] & ~edge_invalid
        residue_invalid[index], counts = _residues(phase_demodulated[index], eligible)
        residue_counts.append(counts)
    initial_valid = (~low_amplitude & ~residue_invalid & ~edge_invalid[None]).all(axis=0)
    labels, component_count = ndimage.label(initial_valid)
    ref_mask = np.zeros((h, w), dtype=bool)
    ref_mask[y0:y1, x0:x1] = True
    ref_labels = np.unique(labels[ref_mask & initial_valid])
    _need(len(ref_labels) == 1, "Reference must lie in one usable connected phase component",
          "GPA_REFERENCE_INVALID")
    valid = initial_valid & (labels == ref_labels[0])
    ref_valid = ref_mask & valid
    ref_count = int(ref_valid.sum())
    ref_fraction = ref_count / ((x1 - x0) * (y1 - y0))
    _need(ref_count >= 9 and ref_fraction >= .5,
          "Reference requires at least nine usable pixels and 50 percent usable coverage", "GPA_REFERENCE_INVALID")
    disconnected_invalid = initial_valid & ~valid
    unwrapped = np.stack([_unwrap(phase_demodulated[i], valid, unwrap_seed) for i in range(2)])
    _need(np.isfinite(unwrapped[:, valid]).all(), "Phase unwrapping returned nonfinite usable values",
          "GPA_INSUFFICIENT_EVIDENCE")
    discontinuities = np.stack([_unwrap_discontinuities(unwrapped[i], phase_demodulated[i], valid) for i in range(2)])
    if discontinuities.any():
        candidate = valid & ~discontinuities.any(axis=0)
        labels_after_cuts, _ = ndimage.label(candidate)
        ref_labels_after_cuts = np.unique(labels_after_cuts[ref_mask & candidate])
        _need(len(ref_labels_after_cuts) == 1,
              "Unwrapping discontinuities disconnect the usable reference", "GPA_REFERENCE_INVALID")
        valid = candidate & (labels_after_cuts == ref_labels_after_cuts[0])
        disconnected_invalid |= candidate & ~valid
        ref_valid = ref_mask & valid
        ref_count = int(ref_valid.sum())
        ref_fraction = ref_count / ((x1 - x0) * (y1 - y0))
        _need(ref_count >= 9 and ref_fraction >= .5,
              "Unwrapping discontinuities leave insufficient usable reference", "GPA_REFERENCE_INVALID")
        unwrapped[:, ~valid] = np.nan
    effective_g = g.copy()
    phase_constants = np.zeros(2, dtype=np.float64)
    phase_slopes = np.zeros((2, 2), dtype=np.float64)
    ref_center = [float(xx[ref_valid].mean()), float(yy[ref_valid].mean())]
    centered_x, centered_y = xx - ref_center[0], yy - ref_center[1]
    design = np.column_stack((centered_x[ref_valid], centered_y[ref_valid], np.ones(ref_count)))
    if reference_mode == "fit_reference":
        for index in range(2):
            coefficients, _, rank, _ = np.linalg.lstsq(design, unwrapped[index, ref_valid], rcond=None)
            _need(rank == 3 and np.isfinite(coefficients).all(),
                  "Reference phase-plane fit is singular", "GPA_REFERENCE_INVALID")
            phase_slopes[index] = coefficients[:2]
            phase_constants[index] = coefficients[2]
            unwrapped[index] -= coefficients[0] * centered_x + coefficients[1] * centered_y + coefficients[2]
        effective_g += phase_slopes / (2 * np.pi)
        effective_g, effective_condition = _g_vectors(effective_g, "effective reference g_vectors")
        _mask_geometry(effective_g, sigma, values.shape)
    else:
        effective_condition = condition
        for index in range(2):
            phase_constants[index] = float(unwrapped[index, ref_valid].mean())
            unwrapped[index] -= phase_constants[index]

    displacement = -np.einsum("ij,jyx->yxi", np.linalg.inv(effective_g), unwrapped) / (2 * np.pi)
    displacement[~valid] = np.nan
    derivative_y, derivative_x = np.gradient(displacement, axis=(0, 1), edge_order=2)
    gradient = np.stack((derivative_x, derivative_y), axis=-1)
    inverse_f = np.eye(2) - gradient
    # Only central differences whose complete stencil lies in the reference-
    # connected component may contribute scientific tensors.
    tensor_valid = ndimage.binary_erosion(valid, structure=ndimage.generate_binary_structure(2, 1))
    candidates = np.flatnonzero(tensor_valid)
    flat_inverse = inverse_f.reshape(-1, 2, 2)
    det = np.linalg.det(flat_inverse[candidates])
    singular = np.linalg.svd(flat_inverse[candidates], compute_uv=False)
    stable = np.isfinite(det) & (det > 1e-8) & (singular[:, -1] > 0)
    stable &= singular[:, 0] <= MAX_CONDITION * singular[:, -1]
    tensor_valid.ravel()[candidates[~stable]] = False
    f_pixel = np.full((h, w, 2, 2), np.nan, dtype=np.float64)
    f_pixel[tensor_valid] = np.linalg.inv(inverse_f[tensor_valid])
    _need(int(tensor_valid.sum()) >= 9, "Fewer than nine stable finite-deformation pixels remain",
          "GPA_INSUFFICIENT_EVIDENCE")
    deformation = f_pixel.copy()
    if metric is not None:
        deformation *= metric[None, None, :, None] / metric[None, None, None, :]
    strain = .5 * (np.einsum("...ki,...kj->...ij", deformation, deformation) - np.eye(2))
    rotation = np.arctan2(deformation[..., 1, 0] - deformation[..., 0, 1],
                          deformation[..., 0, 0] + deformation[..., 1, 1])
    arrays = {"complex_band": np.asarray(bands), "amplitude": amplitude, "mask_frequency": np.asarray(masks),
              "phase_wrapped": np.asarray(carrier_phases), "phase_demodulated_wrapped": phase_demodulated,
              "phase_unwrapped": unwrapped, "displacement_pixel_xy": displacement,
              "deformation_gradient_pixel_xy": f_pixel, "deformation_gradient_xy": deformation,
              "strain_green_lagrange_xy": strain, "rotation_radians": rotation,
              "valid_phase": np.broadcast_to(valid, (2, h, w)).copy(), "valid_displacement": valid,
              "valid_tensor": tensor_valid, "low_amplitude": low_amplitude, "phase_residue": residue_invalid,
              "phase_unwrap_discontinuity": discontinuities,
              "edge_invalid": edge_invalid, "disconnected_invalid": disconnected_invalid}
    if metric is not None:
        arrays["displacement_nm_xy"] = displacement * metric
    report = {"algorithm": ALGORITHM_VERSION, "shape_yx": [h, w],
              "libraries": {"numpy": np.__version__, "scipy": version("scipy"), "scikit_image": version("scikit-image")},
              "g_vectors_cycles_per_pixel": g.tolist(), "g_condition_number": condition,
              "effective_g_vectors_cycles_per_pixel": effective_g.tolist(), "effective_g_condition_number": effective_condition,
              "mask": {"kind": "isotropic_gaussian_truncated", "sigma_cycles_per_pixel": sigma.tolist(),
                       "truncation_sigma": MASK_TRUNCATION_SIGMA, "support_radius_cycles_per_pixel": (3 * sigma).tolist()},
              "reference_mode": reference_mode, "reference_rect_xyxy": rect,
              "reference_valid_pixels": ref_count, "reference_valid_fraction": ref_fraction,
              "reference_center_xy": ref_center, "reference_phase_constants_radians": phase_constants.tolist(),
              "reference_phase_slopes_radians_per_pixel_xy": phase_slopes.tolist(),
              "reference_semantics": ("constant_phase_gauge_only_preserves_uniform_deformation" if reference_mode == "fixed_g"
                                      else "relative_to_fitted_reference_basis_uniform_reference_deformation_removed"),
              "coordinate_domain": "physical_cartesian_nm" if metric is not None else "image_coordinate",
              "calibration_nm_xy": None if metric is None else metric.tolist(),
              "displacement_convention": "Eulerian backdisplacement u_E(x)=x-X(x); phi=-2*pi*G*u_E",
              "tensor_convention": "F_pixel=inverse(I-grad_x(u_E)); F=S*F_pixel*inverse(S); E=.5*(transpose(F)*F-I)",
              "tensor_axes": "row component xy, column coordinate xy; arrays [y,x,2,2]",
              "rotation_convention": "proper polar rotation atan2(F_yx-F_xy,F_xx+F_yy), radians; positive x toward y",
              "edge_margin_pixels": margin, "bandwidth_default_edge_margin_pixels": default_margin,
              "edge_margin_semantics": "3 Gaussian real-space standard deviations, rounded up; finite-window guard, not an error bound",
              "amplitude_floor_relative": float(amplitude_floor_relative), "amplitude_thresholds": amplitude_thresholds,
              "numerical_band_floor": numerical_band_floor,
              "unwrap": {"implementation": "skimage.restoration.unwrap_phase", "seed": unwrap_seed, "wrap_around": False},
              "quality": {"phase_valid_pixels": int(valid.sum()), "tensor_valid_pixels": int(tensor_valid.sum()),
                          "phase_valid_fraction": float(valid.mean()), "tensor_valid_fraction": float(tensor_valid.mean()),
                          "low_amplitude_pixels_per_reflection": [int(m.sum()) for m in low_amplitude],
                          "phase_residue_plaquettes_per_reflection": residue_counts,
                          "unwrap_discontinuity_pixels_per_reflection": [int(m.sum()) for m in discontinuities],
                          "initial_connected_components": int(component_count), "disconnected_pixels_excluded": int(disconnected_invalid.sum()),
                          "unstable_deformation_pixels_excluded": int((~stable).sum())},
              "interpretation_status": "hypothesized",
              "limitations": ["Single-domain two-dimensional image GPA; no phase, composition, 3D strain, defect or topology identification",
                              "Filtered geometric phase is an image-lattice measurement; image contrast and sublattice weighting can create apparent strain",
                              "Unknown phase aliasing, model error and scientific uncertainty are not quantified by these validity masks",
                              "No physical strain or rotation claim is available without explicit signed XY calibration",
                              "Bandpass masks and finite image boundaries limit spatial resolution; no independent specimen validation"]}
    return {"arrays": arrays, "report": report}
