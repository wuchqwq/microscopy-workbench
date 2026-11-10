"""Conservative local bright-peak candidates on a finite spatial scalar plane.

No lattice inference, atom identification, subpixel fitting, or uncertainty model.
The caller must establish the spatial/HAADF context; it cannot be inferred here.
"""
import hashlib
import math
from pathlib import Path

import numpy as np
import scipy
from scipy.ndimage import gaussian_filter, label, maximum_filter, minimum_filter

VERSION = 3
MAX_PIXELS = 4194304
MAX_MAXIMA = 4096


class CandidateError(ValueError):
    code = 'INVALID_ARGUMENT'


def _need(condition, message):
    if not condition:
        raise CandidateError(message)


def _finite(value):
    return isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, (bool, np.bool_)) and math.isfinite(value)


def detect(array, rect, *, min_distance=3.0, threshold_rel=0.1,
           smooth_sigma=0.0, prominence_rel=0.05, noise_floor_sigma=6.0,
           array_domain='spatial'):
    """Return JSON-safe observations; preserve array byte-for-byte.

    rect: in-bounds half-open [x0,y0,x1,y1], rounded outward, never clipped.
    min_distance: Euclidean pixels, equality allowed. threshold_rel: fraction
    of filtered ROI range above its minimum. prominence_rel: minimum drop to
    the minimum in a square of radius ceil(min_distance), in the same range
    units. This is local contrast, NOT topographic prominence or significance.
    Smoothing is ROI-only Gaussian, sigma in pixels, reflect mode, truncate=4.
    noise_floor_sigma: minimum filtered height above the filtered ROI median,
    in units of raw ROI adjacent-difference MAD / (0.67449 * sqrt(2)). This
    If MAD is exactly zero on a nonconstant ROI, use the median of positive
    absolute difference deviations as a conservative fallback scale. This
    conditions on observed variation and can reject genuine sparse peaks. The
    contrast gate is a heuristic, not a probability or inferred count model. Keeping the raw estimate after smoothing is deliberately conservative.
    Maxima are 3x3, strictly interior, with multi-pixel plateaus rejected.
    """
    _need(array_domain == 'spatial', 'Only explicitly spatial scalar arrays are supported')
    _need(isinstance(array, np.ndarray) and array.ndim == 2 and array.dtype.kind in 'iuf' and array.dtype.itemsize <= 8,
          'A two-dimensional real numeric scalar NumPy array is required')
    _need(array.size <= MAX_PIXELS and min(array.shape) >= 3,
          'Array requires at least 3x3 pixels and at most 4194304 pixels')
    _need(np.isfinite(array).all(), 'All source values must be finite')
    if array.dtype.kind in 'iu':
        _need(int(array.min()) >= -(2**53) and int(array.max()) <= 2**53,
              'Integer values must be exactly representable in float64 (absolute value <= 2**53)')
    _need(isinstance(rect, (list, tuple)) and len(rect) == 4 and all(_finite(v) for v in rect),
          'rect requires four finite XYXY coordinates')
    h, w = array.shape
    _need(0 <= rect[0] < rect[2] <= w and 0 <= rect[1] < rect[3] <= h,
          'rect must be nonempty and inside the source; no clipping')
    x0, y0, x1, y1 = math.floor(rect[0]), math.floor(rect[1]), math.ceil(rect[2]), math.ceil(rect[3])
    _need(x1-x0 >= 3 and y1-y0 >= 3, 'Rounded ROI requires at least 3x3 pixels')
    for name, value, low, high in (
            ('min_distance', min_distance, 1, 128), ('threshold_rel', threshold_rel, 0, 1),
            ('smooth_sigma', smooth_sigma, 0, 32), ('prominence_rel', prominence_rel, 0, 1),
            ('noise_floor_sigma', noise_floor_sigma, 0, 100)):
        _need(_finite(value) and low <= value <= high, f'{name} requires a finite value in [{low},{high}]')
    _need(threshold_rel > 0, 'threshold_rel must be positive')
    roi = array[y0:y1, x0:x1].astype(np.float64, copy=True)
    _need(np.isfinite(roi).all(), 'Source values must be representable in float64')
    # Scale before subtraction so opposite-sign finite extremes never overflow.
    scale = float(np.max(np.abs(roi)))
    scaled = roi / scale if scale else roi.copy()
    low, high = float(scaled.min()), float(scaled.max())
    span = high - low
    normalized = (scaled - low) / span if span else np.zeros_like(scaled)
    filtered = gaussian_filter(normalized, sigma=float(smooth_sigma), mode='reflect', truncate=4.0) if smooth_sigma else normalized
    floor, ceiling = float(filtered.min()), float(filtered.max())
    filtered_span = ceiling-floor
    cutoff = floor + float(threshold_rel)*filtered_span
    differences = np.concatenate((np.diff(normalized, axis=0).ravel(),
                                  np.diff(normalized, axis=1).ravel()))
    difference_median = float(np.median(differences))
    difference_mad = float(np.median(np.abs(differences-difference_median)))
    # Quantized sparse data can have a majority of identical adjacent values:
    # MAD=0 then means the robust scale is unresolved, not noise-free. Keep the
    # existing gate but use observed nonzero variation conservatively instead
    # of silently letting every relative maximum through. No count model is
    # inferred, and genuine isolated/sparse signal may also be rejected.
    absolute_deviations = np.abs(differences-difference_median)
    positive_deviations = absolute_deviations[absolute_deviations > 0]
    fallback_used = difference_mad == 0 and positive_deviations.size > 0
    fallback_scale = float(np.median(positive_deviations)) if fallback_used else None
    effective_difference_scale = fallback_scale if fallback_used else difference_mad
    noise_estimate = effective_difference_scale / (0.6744897501960817 * math.sqrt(2))
    background = float(np.median(filtered))
    noise_cutoff = background + float(noise_floor_sigma)*noise_estimate
    radius = math.ceil(min_distance)
    local_max = maximum_filter(filtered, size=3, mode='nearest')
    # Build plateaus before threshold/boundary masking so a boundary plateau
    # cannot turn into an apparent singleton after exclusion.
    peak_mask = (filtered == local_max)
    regions, count = label(peak_mask, structure=np.ones((3, 3), dtype=np.uint8))
    sizes = np.bincount(regions.ravel())
    singleton = peak_mask & (sizes[regions] == 1)
    local_floor = minimum_filter(filtered, size=2*radius+1, mode='nearest')
    contrast = filtered-local_floor
    eligible = singleton & (filtered >= cutoff) & (contrast > 0) & (contrast >= float(prominence_rel)*filtered_span)
    noise_rejected_count = int(np.count_nonzero(eligible & (filtered < noise_cutoff)))
    eligible &= (filtered >= noise_cutoff)
    boundary_count = int(np.count_nonzero(eligible[0])) + int(np.count_nonzero(eligible[-1])) + int(np.count_nonzero(eligible[1:-1,0])) + int(np.count_nonzero(eligible[1:-1,-1]))
    eligible[[0, -1], :] = False
    eligible[:, [0, -1]] = False
    indices = np.flatnonzero(eligible)
    _need(indices.size <= MAX_MAXIMA, 'More than 4096 maxima; increase threshold or reduce ROI')
    rw = x1-x0
    ordered = sorted(indices.tolist(), key=lambda index: (-float(filtered.flat[index]), index))
    selected = []
    for index in ordered:
        y, x = divmod(index, rw)
        if all((x-px)**2+(y-py)**2 >= float(min_distance)**2 for py, px in selected):
            selected.append((y, x))
    selected.sort()
    candidates = [dict(id=f'candidate-{i+1:06d}', x=int(x+x0), y=int(y+y0),
                       intensity=array[y+y0, x+x0].item(),
                       normalized_filtered_intensity=float(filtered[y,x]),
                       local_prominence=float(contrast[y,x]))
                  for i, (y,x) in enumerate(selected)]
    return dict(
        candidates=candidates,
        parameters=dict(min_distance=float(min_distance), threshold_rel=float(threshold_rel),
                        smooth_sigma=float(smooth_sigma), prominence_rel=float(prominence_rel),
                        noise_floor_sigma=float(noise_floor_sigma)),
        provenance=dict(method='scipy.ndimage_local_bright_maximum', version=VERSION,
                        module_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                        numpy_version=np.__version__, scipy_version=scipy.__version__,
                        source_shape_yx=[h,w], source_dtype=str(array.dtype), array_domain=array_domain,
                        source_array_sha256=hashlib.sha256(array.tobytes(order='C')).hexdigest(),
                        coordinate_space='source_pixels', coordinate_convention='integer_pixel_centers_xy',
                        requested_rect_xyxy=[float(v) for v in rect], source_rect_xyxy=[x0,y0,x1,y1],
                        roi_policy='half_open_outward_rounded_no_clipping',
                        smoothing_scope='ROI_only', gaussian_mode='reflect', gaussian_truncate=4.0,
                        local_maximum_window_yx=[3,3], prominence_radius_pixels=radius,
                        prominence_definition='peak_minus_square_neighborhood_minimum_in_normalized_ROI_units',
                        threshold_definition='filtered_ROI_min_plus_threshold_rel_times_filtered_ROI_range',
                        noise_floor=dict(method='raw_ROI_adjacent_difference_MAD',
                                         units='normalized_ROI_intensity',
                                         difference_median=difference_median, difference_mad=difference_mad,
                                         effective_difference_scale=effective_difference_scale,
                                         degenerate_mad_fallback=dict(
                                             used=bool(fallback_used),
                                             method='median_positive_absolute_difference_deviation',
                                             scale=fallback_scale,
                                             positive_difference_count=int(positive_deviations.size),
                                             difference_count=int(differences.size),
                                             interpretation='conservative_contrast_scale_not_noise_variance'),
                                         estimate=noise_estimate, background_median=background,
                                         cutoff=noise_cutoff, gaussian_consistency_factor=0.6744897501960817,
                                         smoothing_adjustment='none_conservative_raw_estimate',
                                         inferred_noise_model=False, statistical_significance=False),
                        normalization=dict(source_abs_scale=scale, scaled_min=low, scaled_span=span,
                                           filtered_min=floor, filtered_range=filtered_span, cutoff=cutoff),
                        plateau_policy='reject_multi_pixel_8_connected_local_maxima',
                        boundary_policy='exclude_outermost_ROI_pixel_centers',
                        separation_policy='greedy_descending_filtered_intensity_then_yx_Euclidean',
                        id_scope='deterministic_within_this_detection_result'),
        quality=dict(status='candidates_for_manual_review' if candidates else 'no_candidates',
                     candidate_count=len(candidates), eligible_maxima_count=int(indices.size),
                     separation_suppressed_count=int(indices.size)-len(candidates),
                     plateau_component_count=int(np.count_nonzero(sizes[1:] > 1)),
                     boundary_maxima_excluded=boundary_count,
                     noise_floor_rejected_count=noise_rejected_count,
                     flat_roi=span == 0, degenerate_noise_scale=bool(fallback_used), requires_manual_review=True,
                     atomic_identity_established=False, statistical_significance_established=False),
        limitations=[
            'Bright local maxima are candidate observations, not confirmed atoms or columns.',
            'Caller must establish spatial HAADF suitability; intensity alone does not identify modality.',
            'No lattice completion, forced splitting, subpixel refinement, or physical uncertainty estimate.',
            'Weak peaks may be missed; noise or contamination may produce false candidates.',
            'ROI-only reflected smoothing and truncated edge contrast may affect near-edge candidates.',
            'Flat plateaus and outermost ROI centers are excluded; unresolved overlaps may remain one peak.',
            'Threshold and local prominence are contrast heuristics, not statistical confidence.',
            'Calculations use float64; contrasts near machine precision may be lost.',
            'The robust noise floor is a contrast heuristic, not a probability or electron-count model.',
            'Zero MAD uses a conservative nonzero-difference fallback, which can reject genuine sparse or quantized signal.',
            'Correlated noise, sparse impulses, quantization, texture or nonuniform background can still defeat the contrast gate.',
            'Dense features may raise the median/noise floor and hide weak peaks; smoothing retains the conservative raw noise floor.',
        ])
