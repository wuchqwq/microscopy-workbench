"""Finite real-space observation proposals; never a defect/phase classifier.

Gaussian derivatives, their locally averaged structure tensor and texture energy
are image-coordinate observations. Scores are transparent heuristic priorities,
not probabilities, physical curvature or evidence of a material defect.

Primary API references:
https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.gaussian_filter.html
https://scikit-image.org/docs/stable/api/skimage.feature.html#skimage.feature.structure_tensor
"""
import math

import numpy as np


ALGORITHM_VERSION = "real-space-observation-priority-v1"
MAX_PIXELS = 4 * 1024 * 1024
MAX_WINDOWS = 512
GRADIENT_SIGMA = 1.0
SCORE_THRESHOLD = .18
CORRELATION_FLOOR = .15


class DiscoveryError(ValueError):
    def __init__(self, message, code="DISCOVERY_INVALID_ARGUMENT"):
        super().__init__(message)
        self.code = code


def _need(condition, message, code="DISCOVERY_INVALID_ARGUMENT"):
    if not condition:
        raise DiscoveryError(message, code)


def _starts(length, size):
    return sorted(set(range(0, length-size+1, max(1, size//2))) | {length-size})


def _sample_rectangles(shape, sizes):
    """Bound spatial sampling before feature aggregation, including image edges."""
    rectangles = []
    capacity = MAX_WINDOWS//len(sizes)
    for size in sizes:
        ys, xs = _starts(shape[0], size), _starts(shape[1], size)
        if len(xs)*len(ys) > capacity:
            nx = min(len(xs), max(1, int(math.sqrt(capacity*len(xs)/len(ys)))))
            ny = min(len(ys), max(1, capacity//nx))
            xs = [xs[i] for i in np.unique(np.linspace(0, len(xs)-1, nx).round().astype(int))]
            ys = [ys[i] for i in np.unique(np.linspace(0, len(ys)-1, ny).round().astype(int))]
        rectangles.extend([x, y, x+size, y+size] for y in ys for x in xs)
    _need(len(rectangles) <= MAX_WINDOWS, "Spatial observation budget exceeded", "BUDGET_EXCEEDED")
    return rectangles


def _lag_correlation(values):
    # This is a quality diagnostic only: correlated noise, smooth illumination
    # and arbitrary noncrystalline textures can also have high correlation.
    centred = values-float(np.mean(values))
    terms = []
    for axis in (0, 1):
        left = centred[:-1, :] if axis == 0 else centred[:, :-1]
        right = centred[1:, :] if axis == 0 else centred[:, 1:]
        denominator = math.sqrt(float(np.mean(left*left))*float(np.mean(right*right)))
        terms.append(float(np.mean(left*right))/denominator if denominator > 1e-15 else 0.)
    return terms


def _iou(a, b):
    width, height = max(0, min(a[2], b[2])-max(a[0], b[0])), max(0, min(a[3], b[3])-max(a[1], b[1]))
    intersection = width*height
    return intersection/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection)


def propose(values, window_sizes=(64,), max_candidates=4):
    """Return bounded original-array ROI proposals without creating any FFT.

    Rectangles are half-open source-array XYXY pixels. No physical scale or
    interpretation is inferred. Sampling is incomplete; absence of a candidate
    never proves that a narrow feature/defect is absent.
    """
    from scipy.ndimage import gaussian_filter

    raw = np.asarray(values)
    _need(raw.ndim == 2 and raw.dtype.kind in "iuf" and all(n >= 32 for n in raw.shape),
          "Real finite 2D arrays with at least32 pixels per axis are required")
    _need(raw.size <= MAX_PIXELS, "Real-space feature pixels exceed4194304", "BUDGET_EXCEEDED")
    _need(np.isfinite(raw).all(), "Source array contains nonfinite values")
    _need(type(window_sizes) in (list, tuple) and 1 <= len(window_sizes) <= 2 and
          all(type(n) is int and 32 <= n <= 256 and n <= min(raw.shape) for n in window_sizes) and
          len(set(window_sizes)) == len(window_sizes), "Supply1..2 distinct fitting window sizes32..256")
    _need(type(max_candidates) is int and 1 <= max_candidates <= 4, "max_candidates requires1..4")
    sizes = sorted(window_sizes)
    tensor_sigma = max(2., min(sizes)/8.)
    settings = {"window_sizes": sizes, "max_candidates": max_candidates,
                "gradient_sigma_pixels": GRADIENT_SIGMA, "tensor_sigma_pixels": tensor_sigma,
                "gaussian_truncate": 4., "boundary_mode": "reflect",
                "score_threshold": SCORE_THRESHOLD, "lag1_correlation_floor": CORRELATION_FLOOR,
                "nms_iou_max": .35, "sampling": "half-window offset grid; deterministic thinning if over budget",
                "normalization": "Source median and p95-p5, fallback full range; heuristic only, not intensity calibration",
                "energy_reference": "Full-image median gradient energy, floored by0.05 times mean and numerical epsilon",
                "coordinate_space": "source_array_indices", "rect_convention": "half-open XYXY pixels"}
    output = {"algorithm": ALGORITHM_VERSION, "settings": settings,
              "shape_yx": list(raw.shape), "dtype": str(raw.dtype), "coordinate_space": "source_array_indices",
              "score_semantics": "Uncalibrated heuristic priority, not probability/information gain",
              "interpretation_status": "hypothesized", "physical_conclusion": None, "uncertainty": None,
              "candidates": [], "observations": [],
              "cost": {"source_pixels": int(raw.size), "spatial_feature_pixels": int(raw.size),
                       "sampled_windows": 0, "gaussian_filter_passes":0,
                       "spatial_filter_pixel_passes":0, "summed_window_area_pixels":0,
                       "new_fft_pixels": 0},
              "limitations": ["Image contrast/texture/orientation proxies do not establish lattice bending, defects, twins or phase",
                              "Low correlation can be aperiodic signal; high correlation can be correlated noise or illumination",
                              "Finite scales/sampling can miss narrow or low-contrast features; no candidate is not defect absence",
                              "Physical scale, imaging/reconstruction transfer and model uncertainty are not inferred"]}
    data = raw.astype(np.float64)
    centre = float(np.median(data))
    lo, hi = (float(n) for n in np.percentile(data, [5, 95]))
    dynamic = hi-lo
    if dynamic == 0:
        dynamic = float(np.max(data))-float(np.min(data))
    _need(math.isfinite(dynamic), "Source dynamic range cannot be represented safely")
    if dynamic == 0:
        output.update(quality={"status":"no_observable_contrast", "lag1_correlations_yx":[0.,0.]},
                      stop_reason="No observable contrast at this precision; no automatic ROI proposed")
        return output
    data = (data-centre)/dynamic
    _need(np.isfinite(data).all(), "Normalized source dynamic range is not finite")
    _need(float(np.max(np.abs(data))) <= 1e150,
          "Source outlier dynamic range is unsafe for finite gradient-energy features")
    correlations = _lag_correlation(data)
    correlation = float(np.mean(np.abs(correlations)))
    quality_limited = correlation < CORRELATION_FLOOR
    output["quality"] = {"status":"quality_limited" if quality_limited else "spatial_observation_available",
                         "lag1_correlations_yx":correlations, "mean_absolute_lag1_correlation":correlation,
                         "diagnostic_not_noise_classifier":True}
    gx = gaussian_filter(data, GRADIENT_SIGMA, order=(0,1), mode="reflect", truncate=4.)
    gy = gaussian_filter(data, GRADIENT_SIGMA, order=(1,0), mode="reflect", truncate=4.)
    xx = gaussian_filter(gx*gx, tensor_sigma, mode="reflect", truncate=4.)
    yy = gaussian_filter(gy*gy, tensor_sigma, mode="reflect", truncate=4.)
    xy = gaussian_filter(gx*gy, tensor_sigma, mode="reflect", truncate=4.)
    del gx, gy, data
    energy = xx+yy
    orientation_x, orientation_y = xx-yy, 2*xy
    del xx, yy, xy
    magnitude = np.hypot(orientation_x, orientation_y)
    epsilon = max(float(np.max(energy))*1e-12, np.finfo(np.float64).tiny)
    reference_energy = max(float(np.median(energy)), float(np.mean(energy))*.05, epsilon)
    rectangles = _sample_rectangles(raw.shape, sizes)
    output["cost"].update(gaussian_filter_passes=5, spatial_filter_pixel_passes=5*int(raw.size),
                          summed_window_area_pixels=sum((r[2]-r[0])*(r[3]-r[1]) for r in rectangles))
    for rect in rectangles:
        x0,y0,x1,y1 = rect
        # Do not rank the immediate reflected-derivative border as an anomaly.
        margin = 4
        x0,y0,x1,y1 = max(x0,margin),max(y0,margin),min(x1,raw.shape[1]-margin),min(y1,raw.shape[0]-margin)
        sl = np.s_[y0:y1,x0:x1]
        local = energy[sl]
        mean = float(np.mean(local))
        ratio = mean/reference_energy
        variation = float(np.std(local))/(mean+epsilon)
        # Direction is modulo180deg, encoded by the two tensor components. This
        # is not a calibrated physical angle, especially for nonsquare pixels.
        directional_dispersion = max(0., float(np.mean(magnitude[sl]))-
                                     math.hypot(float(np.mean(orientation_x[sl])),float(np.mean(orientation_y[sl]))))/(mean+epsilon)
        components = {"texture_energy_contrast":min(1., abs(math.log2(max(ratio,1e-12)))/3.),
                      "texture_energy_variation":min(1.,variation),
                      "orientation_disagreement_proxy":min(1.,directional_dispersion)}
        score = .5*components["texture_energy_contrast"]+.3*components["texture_energy_variation"]+.2*components["orientation_disagreement_proxy"]
        _need(all(math.isfinite(v) for v in (ratio, variation, directional_dispersion, score, *components.values())),
              "Real-space feature statistics are not finite for this source dynamic range")
        row = {"rect":rect, "window_size":rect[2]-rect[0], "score":float(score),
               "metrics":{"gradient_energy_ratio_to_spatial_reference":ratio,
                          "gradient_energy_coefficient_of_variation":variation,
                          "orientation_disagreement_proxy":directional_dispersion},
               "score_components":components, "reasons":[],
               "unknowns":["Material cause and physical interpretation unverified", "Scale/shape/sampling sensitivity not a statistical uncertainty"]}
        if components["texture_energy_contrast"] >= .15:
            row["reasons"].append("Local image texture energy differs from the image-wide texture-energy reference")
        if components["texture_energy_variation"] >= .15:
            row["reasons"].append("Spatially nonuniform texture energy; inspect interruption/contrast alternatives")
        if components["orientation_disagreement_proxy"] >= .15:
            row["reasons"].append("Locally differing image-gradient directions; not a measured lattice bend")
        output["observations"].append(row)
    output["cost"]["sampled_windows"] = len(rectangles)
    if not quality_limited:
        for row in sorted(output["observations"], key=lambda r:(-r["score"],r["window_size"],r["rect"][1],r["rect"][0])):
            if row["score"] < SCORE_THRESHOLD:
                break
            if all(_iou(row["rect"], old["rect"]) <= .35 for old in output["candidates"]):
                output["candidates"].append(row)
                if len(output["candidates"]) == max_candidates:
                    break
    output["stop_reason"] = ("Quality-limited image correlations: inspect manually or request context; no automatic refinement" if quality_limited else
                             "Candidates require independent scientific checks" if output["candidates"] else
                             "No candidate exceeded this finite heuristic threshold; narrow/weak changes can remain undetected")
    return output
