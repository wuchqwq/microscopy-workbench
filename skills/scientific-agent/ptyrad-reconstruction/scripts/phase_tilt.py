"""Estimate apparent lateral displacement across selected phase-stack layers."""

from pathlib import Path


def add_parser(subparsers):
    parser = subparsers.add_parser("tilt", help="Estimate apparent interslice tilt in explicit phase ROIs")
    parser.add_argument("phase", type=Path, help="Real [Z,Y,X] .npy or floating-point multipage TIFF")
    parser.add_argument("--dx-nm", type=float, required=True, help="XY sample spacing in nm/pixel")
    parser.add_argument("--dz-nm", type=float, required=True, help="Spacing between stored planes in nm")
    parser.add_argument("--roi", type=int, nargs=4, action="append", required=True,
                        metavar=("Y0", "Y1", "X0", "X1"), help="Half-open pixel ROI, repeatable")
    parser.add_argument("--z-range", type=int, nargs=2, required=True, metavar=("Z0", "Z1"),
                        help="Half-open range of zero-based planes, at least three")
    parser.add_argument("--max-step-px", type=float, default=3.0,
                        help="Maximum adjacent displacement per axis, default 3 pixels")
    parser.add_argument("--band-nm-inv", type=float, nargs=2, metavar=("LOW", "HIGH"),
                        help="Optional radial frequency band in cycles/nm")
    parser.set_defaults(handler=run)


def validate_selection(args, shape):
    if len(shape) != 3:
        raise ValueError(f"Expected a [Z,Y,X] phase stack, got shape {shape}")
    z0, z1 = args.z_range
    if not 0 <= z0 < z1 <= shape[0] or z1 - z0 < 3:
        raise ValueError("--z-range must select at least three stored planes within the stack")
    for y0, y1, x0, x1 in args.roi:
        if not (0 <= y0 < y1 <= shape[1] and 0 <= x0 < x1 <= shape[2]):
            raise ValueError(f"ROI {[y0, y1, x0, x1]} lies outside the phase stack")
        if min(y1 - y0, x1 - x0) < 5 or args.max_step_px >= min(y1 - y0, x1 - x0) / 2:
            raise ValueError("Use an ROI at least five pixels across and a search less than half its smaller dimension")


def read_regions(args, np):
    path = args.phase
    z0, z1 = args.z_range
    if path.suffix.lower() == ".npy":
        stack = np.load(path, mmap_mode="r", allow_pickle=False)
        if stack.dtype.kind not in "fiu":
            raise ValueError("The .npy phase stack must contain real numeric values")
        validate_selection(args, stack.shape)
        regions = [np.asarray(stack[z0:z1, y0:y1, x0:x1], dtype=np.float64)
                   for y0, y1, x0, x1 in args.roi]
        return stack.shape, str(stack.dtype), regions
    if path.suffix.lower() not in (".tif", ".tiff"):
        raise ValueError("Expected a .npy, .tif, or .tiff phase stack")
    try:
        import tifffile
    except ImportError as error:
        raise ValueError("Reading TIFF phase stacks requires tifffile in the Python environment") from error
    with tifffile.TiffFile(path) as file:
        if len(file.series) != 1:
            raise ValueError("Expected one TIFF stack. Export the quantitative phase series separately")
        series = file.series[0]
        validate_selection(args, series.shape)
        if (series.axes not in ("ZYX", "IYX", "QYX") or series.dtype.kind != "f"
                or len(series.pages) != series.shape[0]):
            raise ValueError("Expected a multipage floating-point grayscale TIFF with one phase plane per page")
        regions = [np.empty((z1 - z0, y1 - y0, x1 - x0), dtype=np.float64)
                   for y0, y1, x0, x1 in args.roi]
        for layer in range(z0, z1):
            plane = series.pages[layer].asarray()
            for region, (y0, y1, x0, x1) in zip(regions, args.roi):
                region[layer - z0] = plane[y0:y1, x0:x1]
        return series.shape, str(series.dtype), regions


def register_pair(first, second, radius, np, ndimage, minimize):
    corr = np.fft.fftshift(np.fft.ifft2(second * first.conj()).real)
    center = np.array(corr.shape) // 2
    offsets = np.arange(-int(radius), int(radius) + 1)
    window = np.ix_(center[0] + offsets, center[1] + offsets)
    grid = corr[window]
    peak = np.unravel_index(grid.argmax(), grid.shape)
    seed = np.array([offsets[index] for index in peak], dtype=float)
    maxima = ndimage.maximum_filter(corr, size=3, mode="wrap")[window]
    distinct = (grid == maxima) & (np.hypot(offsets[:, None] - seed[0], offsets - seed[1]) > 1.5)
    competitor_gap = float(grid[peak] - grid[distinct].max()) if distinct.any() else None
    coefficients = ndimage.spline_filter(corr, order=3, mode="grid-wrap")

    def score(displacement):
        location = (displacement + center).reshape(2, 1)
        return float(ndimage.map_coordinates(coefficients, location, order=3,
                                              mode="grid-wrap", prefilter=False)[0])

    fit = minimize(lambda d: -score(d), seed, method="L-BFGS-B", bounds=[(-radius, radius)] * 2)
    displacement = fit.x if fit.success else seed
    best = score(displacement)
    step_y, step_x = np.eye(2) * 0.25
    dy = (2 * best - score(displacement + step_y) - score(displacement - step_y)) / 0.25**2
    dx = (2 * best - score(displacement + step_x) - score(displacement - step_x)) / 0.25**2
    cross = (score(displacement + step_y - step_x) + score(displacement - step_y + step_x)
             - score(displacement + step_y + step_x) - score(displacement - step_y - step_x)) / (4 * 0.25**2)
    curvature = np.linalg.eigvalsh([[dy, cross], [cross, dx]])
    return {
        "step_yx_px": displacement.tolist(),
        "correlation": best,
        "integer_peak_gap": competitor_gap,
        "peak_curvature_eigenvalues": curvature.tolist(),
        "boundary_hit": bool(np.any(np.abs(displacement) >= radius - 0.05)),
        "subpixel_fit_succeeded": bool(fit.success),
    }


def measure_region(region, roi, args, np, ndimage, minimize):
    z0, z1 = args.z_range
    report = {"roi_y0_y1_x0_x1_exclusive": roi, "estimate": None}
    if not np.isfinite(region).all():
        return {**report, "status": "NO_ESTIMATE", "flags": ["nonfinite_phase"]}
    max_abs = np.abs(region).max(axis=(-2, -1), keepdims=True)
    scaled = region / np.where(max_abs > 0, max_abs, 1.0)
    scaled -= scaled.mean(axis=(-2, -1), keepdims=True)
    centered_rms = np.sqrt(np.mean(scaled**2, axis=(-2, -1)))
    report["centered_phase_rms"] = (centered_rms * max_abs.ravel()).tolist()
    height, width = region.shape[-2:]
    if args.band_nm_inv:
        fy = np.fft.fftfreq(height, d=args.dx_nm)
        fx = np.fft.fftfreq(width, d=args.dx_nm)
        radius = np.hypot(fy[:, None], fx)
        low, high = args.band_nm_inv
        mask = (radius >= low) & (radius <= high)
        scaled = np.fft.ifft2(np.fft.fft2(scaled) * mask).real
    band_rms = np.sqrt(np.mean(scaled**2, axis=(-2, -1)))
    usable = (centered_rms > 0) & (band_rms > 1e-12 * centered_rms)
    if not usable.all():
        return {**report, "status": "NO_ESTIMATE", "flags": ["no_usable_texture_in_selected_plane"],
                "unusable_plane_indices": (np.flatnonzero(~usable) + z0).tolist()}
    texture_rms = band_rms * max_abs.ravel()
    report["filtered_to_centered_rms_ratio"] = (band_rms / centered_rms).tolist()
    taper = np.sqrt(np.outer(np.hanning(height), np.hanning(width)))
    scaled *= taper
    scaled -= scaled.mean(axis=(-2, -1), keepdims=True)
    norms = np.linalg.norm(scaled, axis=(-2, -1), keepdims=True)
    if np.any(norms == 0):
        return {**report, "status": "NO_ESTIMATE", "flags": ["no_texture_after_edge_taper"]}
    spectra = np.fft.fft2(scaled / norms)
    pairs = [register_pair(first, second, args.max_step_px, np, ndimage, minimize)
             for first, second in zip(spectra[:-1], spectra[1:])]
    for layer, pair in enumerate(pairs, start=z0):
        pair["plane_pair"] = [layer, layer + 1]
    displacement = np.vstack((np.zeros((1, 2)), np.cumsum([pair["step_yx_px"] for pair in pairs], axis=0)))
    plane_offsets = np.arange(z1 - z0)
    slope_px_per_plane, intercept = np.polyfit(plane_offsets, displacement, 1)
    fit_rms = np.sqrt(np.mean((displacement - plane_offsets[:, None] * slope_px_per_plane - intercept)**2, axis=0))
    slope = slope_px_per_plane * (args.dx_nm / args.dz_nm)
    net_displacement_nm = displacement[-1] * args.dx_nm
    if not (np.isfinite(slope).all() and np.isfinite(net_displacement_nm).all()):
        raise ValueError("The supplied physical spacings produce a displacement outside float64 range")
    flags = []
    if texture_rms.min() < 0.1 * np.median(texture_rms):
        flags.append("weak_texture_in_some_planes")
    if any(pair["correlation"] < 0.6 for pair in pairs):
        flags.append("low_adjacent_correlation")
    if any(pair["boundary_hit"] for pair in pairs):
        flags.append("adjacent_displacement_at_search_boundary")
    if any(pair["integer_peak_gap"] is not None and pair["integer_peak_gap"] < 0.02 for pair in pairs):
        flags.append("near_tied_integer_peaks")
    if any(lo <= max(1e-5, 0.03 * hi) for lo, hi in
           (pair["peak_curvature_eigenvalues"] for pair in pairs)):
        flags.append("weak_directional_constraint")
    if any(not pair["subpixel_fit_succeeded"] for pair in pairs):
        flags.append("subpixel_fit_used_integer_fallback")
    if fit_rms.max() > 0.35:
        flags.append("large_linear_fit_residual")
    return {
        **report,
        "status": "NEEDS_REVIEW" if flags else "CANDIDATE",
        "flags": flags,
        "adjacent_pairs": pairs,
        "estimate": {
            "displacement_yx_px_from_first_plane": displacement.tolist(),
            "net_displacement_yx_nm": net_displacement_nm.tolist(),
            "linear_fit_rms_yx_px": fit_rms.tolist(),
            "slope_yx_nm_per_nm": slope.tolist(),
            "apparent_tilt_yx_mrad": (np.arctan(slope) * 1000).tolist(),
            "apparent_tilt_magnitude_mrad": float(np.arctan(np.linalg.norm(slope)) * 1000),
        },
    }


def run(args):
    try:
        import numpy as np
        from scipy import ndimage
        from scipy.optimize import minimize
    except ImportError as error:
        raise ValueError("Tilt estimation requires NumPy and SciPy in the Python environment") from error
    for name in ("dx_nm", "dz_nm", "max_step_px"):
        value = getattr(args, name)
        if not np.isfinite(value) or value <= 0:
            raise ValueError(f"--{name.replace('_', '-')} must be positive and finite")
    if args.band_nm_inv and (not np.isfinite(args.band_nm_inv).all()
                             or not 0 <= args.band_nm_inv[0] < args.band_nm_inv[1]):
        raise ValueError("--band-nm-inv must provide two finite bounds with 0 <= LOW < HIGH")
    shape, dtype, data = read_regions(args, np)
    regions = [measure_region(region, roi, args, np, ndimage, minimize)
               for region, roi in zip(data, args.roi)]
    tilts = np.asarray([region["estimate"]["apparent_tilt_yx_mrad"] for region in regions if region["estimate"]])
    return {
        "analysis": "apparent_interslice_displacement",
        "source": str(args.phase.resolve()),
        "source_shape_zyx": list(shape),
        "source_dtype": dtype,
        "dx_nm": args.dx_nm,
        "dz_nm": args.dz_nm,
        "z_range_zero_based_exclusive": args.z_range,
        "band_cycles_per_nm": args.band_nm_inv,
        "max_adjacent_step_per_axis_px": args.max_step_px,
        "axes": "Positive y is down, positive x is right, positive z follows increasing stored plane index",
        "method": "Mean removal, optional frequency band, square-root Hann taper, normalized FFT cross-correlation, "
                  "bounded subpixel refinement, summed adjacent shifts and unweighted linear fit",
        "diagnostic_scope": "Flags use heuristic thresholds. Compare ROIs and frequency bands, and check the "
                            "phase stack's provenance, z order, and supplied calibration before interpretation.",
        "roi_tilt_range_yx_mrad": np.ptp(tilts, axis=0).tolist() if len(tilts) >= 2 else None,
        "scientific_acceptance": "NOT_TESTED",
        "regions": regions,
    }
