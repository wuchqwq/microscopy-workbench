"""Read a 4D-STEM ROI and estimate a candidate bright-field disk in detector pixels."""

from contextlib import contextmanager
from pathlib import Path


def add_parser(subparsers):
    parser = subparsers.add_parser("disk", help="Inspect an input or fit a bright-field disk")
    parser.add_argument("source", type=Path, help="DM4, HDF5, or NPY")
    parser.add_argument("--list", dest="inventory", action="store_true", help="List array shapes without reading pixel values")
    parser.add_argument("--dset", type=int, help="Public zero-based ncempy dataset index for DM4")
    parser.add_argument("--key", help="Dataset key for HDF5")
    parser.add_argument("--layout", choices=("scan4d", "flat3d"), help="Array axes [sy,sx,ky,kx] or [sy*sx,ky,kx]")
    parser.add_argument("--scan-shape", nargs=2, type=int, metavar=("SY", "SX"), help="Required for flat3d")
    parser.add_argument("--roi", nargs=4, type=int, metavar=("Y0", "Y1", "X0", "X1"), help="Zero-based scan ROI, end exclusive")
    parser.add_argument("--center-xy", nargs=2, type=float, metavar=("X", "Y"), help="Center seed; default is the integer FFT origin")
    parser.add_argument("--radius-range", nargs=2, type=float, metavar=("MIN", "MAX"), help="Candidate radii in detector pixels")
    parser.add_argument("--radius-hint", type=float, help="Approximate radius for separating competing edges")
    parser.add_argument("--sigma", type=float, default=1.0, help="Edge detection smoothing in detector pixels")
    parser.add_argument("--arrays", type=Path, help="Optional new NPZ with raw mean, virtual images, and pixel axes")
    parser.add_argument("--virtual-annulus", nargs=2, type=float, metavar=("INNER", "OUTER"),
                        help="Add an annular virtual image; centered on --center-xy or the fitted center")
    parser.set_defaults(handler=run)
    return parser


@contextmanager
def open_source(args, np):
    suffix = args.source.suffix.lower()
    dm_file = suffix in (".dm3", ".dm4")
    hdf_file = suffix in (".h5", ".hdf5", ".hdf")
    if not dm_file and args.dset is not None:
        raise ValueError("--dset applies only to DM inputs")
    if not hdf_file and args.key is not None:
        raise ValueError("--key applies only to HDF5 inputs")
    if dm_file:
        try:
            from ncempy.io.dm import fileDM
        except ImportError as error:
            raise RuntimeError("DM inputs require ncempy; use an environment with ncempy installed") from error
        with fileDM(str(args.source), on_memory=False) as source:
            if args.inventory:
                entries = []
                for index in range(source.numObjects):
                    try:
                        array = source.getMemmap(index)
                    except IndexError:
                        # ncempy may reserve the first stored object as a thumbnail.
                        continue
                    except (KeyError, ValueError, TypeError, NotImplementedError) as error:
                        entries.append({"dset": index, "unavailable": str(error)})
                    else:
                        entries.append({"dset": index, "shape": list(array.shape), "dtype": str(array.dtype)})
                        del array
                yield entries
            else:
                if args.dset is None or not 0 <= args.dset < source.numObjects:
                    raise ValueError("Select a valid DM dataset with --dset; use --list to see public indices")
                try:
                    array = source.getMemmap(args.dset)
                except IndexError as error:
                    raise ValueError("DM dataset index is unavailable; use --list to see public indices") from error
                yield array
    elif hdf_file:
        try:
            import h5py
        except ImportError as error:
            raise RuntimeError("HDF5 inputs require h5py; use an environment with h5py installed") from error
        with h5py.File(args.source, "r") as source:
            if args.inventory:
                entries = []

                def record(name, item):
                    if isinstance(item, h5py.Dataset):
                        entries.append({"key": f"/{name}", "shape": list(item.shape), "dtype": str(item.dtype)})

                source.visititems(record)
                yield entries
            else:
                if args.key is None or not isinstance(source.get(args.key), h5py.Dataset):
                    raise ValueError("Select an existing HDF5 dataset with --key; use --list to see keys")
                yield source[args.key]
    elif suffix == ".npy":
        array = np.load(args.source, mmap_mode="r", allow_pickle=False)
        yield [{"shape": list(array.shape), "dtype": str(array.dtype)}] if args.inventory else array
    else:
        raise ValueError("Expected a DM3/DM4, HDF5, or NPY input")


def roi_blocks(array, layout, scan_width, roi):
    y0, y1, x0, x1 = roi
    ky, kx = array.shape[-2:]
    chunk = max(1, (8 * 1024**2) // (ky * kx * array.dtype.itemsize))
    for y in range(y0, y1):
        for start in range(x0, x1, chunk):
            stop = min(start + chunk, x1)
            if layout == "scan4d":
                block = array[y, start:stop]
            else:
                block = array[y * scan_width + start:y * scan_width + stop]
            yield y - y0, start - x0, stop - x0, block


def disk_fit(np, image, seed, bounds, hint, sigma):
    try:
        from scipy.ndimage import gaussian_filter, map_coordinates
        from scipy.optimize import least_squares
        from scipy.signal import find_peaks
    except ImportError as error:
        raise RuntimeError("Fitting a disk requires SciPy") from error

    low, high = bounds
    angle = np.linspace(0, 2 * np.pi, 240, endpoint=False)
    unit = np.column_stack((np.cos(angle), np.sin(angle)))
    samples = np.linspace(low, high, max(9, int(np.ceil((high - low) * 4)) + 1))
    smooth = gaussian_filter(image, sigma)

    def profiles(center, radii):
        xy = center + unit[:, None, :] * radii[None, :, None]
        return map_coordinates(smooth, (xy[..., 1], xy[..., 0]), order=1, cval=np.nan)

    values = profiles(seed, samples)
    visible = np.sum(np.isfinite(values), axis=0) >= len(angle) // 2
    if visible.sum() < 5:
        return None, {"reason": "Too little visible angular coverage in the radial search"}
    search = samples[visible]
    slope = -np.gradient(np.nanmedian(values[:, visible], axis=0), search)
    peaks, _ = find_peaks(slope, distance=max(1, int(2 / (samples[1] - samples[0]))))
    peaks = sorted((index for index in peaks if slope[index] > 0), key=lambda i: slope[i], reverse=True)
    candidates = [{"radius_px": float(search[index]), "negative_slope": float(slope[index])} for index in peaks[:5]]
    if not peaks and hint is None:
        return None, {"reason": "No interior outward drop in the radial search", "radial_edge_peaks": candidates}

    radius = float(search[peaks[0]]) if hint is None else hint
    center = np.asarray(seed, dtype=float)
    width = max(3.0, 0.10 * radius, 3.0 * sigma)
    center_lo = np.maximum([0, 0], center - width)
    center_hi = np.minimum(np.asarray(image.shape[::-1]) - 1, center + width)
    for _ in range(2):
        ring = samples[(samples >= radius - width) & (samples <= radius + width)]
        if len(ring) < 5:
            return None, {"reason": "Too few radii near the edge seed", "radial_edge_peaks": candidates}
        drop = -np.gradient(profiles(center, ring), ring, axis=1)
        peaks_by_ray = np.argmax(np.where(np.isfinite(drop[:, 1:-1]), drop[:, 1:-1], -np.inf), axis=1) + 1
        strength = drop[np.arange(len(angle)), peaks_by_ray]
        good = np.isfinite(strength) & (strength > 0) & (peaks_by_ray > 1) & (peaks_by_ray < len(ring) - 2)
        if good.sum() < len(angle) // 2:
            return None, {"reason": "Outward edge could not be traced around at least half the disk", "radial_edge_peaks": candidates}
        points = center + unit[good] * ring[peaks_by_ray[good], None]

        def residual(params):
            return np.linalg.norm(points - params[:2], axis=1) - params[2]

        fit = least_squares(residual, [*center, radius], bounds=([*center_lo, low], [*center_hi, high]),
                            loss="soft_l1", f_scale=max(0.5, sigma))
        if not fit.success:
            return None, {"reason": "Robust circle fit did not converge", "radial_edge_peaks": candidates}
        center, radius = fit.x[:2], float(fit.x[2])

    tolerance = max(1.0, 1.5 * sigma)
    inlier = np.abs(fit.fun) <= tolerance
    inlier_angles = np.flatnonzero(good)[inlier]
    inliers_per_quadrant = np.bincount(inlier_angles // (len(angle) // 4), minlength=4)
    offset = min(max(2.0, 2.0 * sigma), radius / 3)
    cross_edge = profiles(center, np.array([radius - offset, radius + offset]))
    contrast = cross_edge[:, 0] - cross_edge[:, 1]
    contrast = contrast[np.isfinite(contrast)]
    positive_fraction = float(np.mean(contrast > 0)) if len(contrast) else 0.0
    contrast_median = float(np.median(contrast)) if len(contrast) else 0.0
    contrast_mad = float(1.4826 * np.median(np.abs(contrast - contrast_median))) if len(contrast) else 0.0
    radius_at_bound = min(radius - low, high - radius) < (samples[1] - samples[0])
    center_at_bound = bool(np.min(np.minimum(center - center_lo, center_hi - center)) < 0.01)
    report = {
        "candidate_center_xy_px": center.tolist(),
        "candidate_radius_px": radius,
        "radial_edge_peaks": candidates,
        "rays_with_edge": int(good.sum()),
        "rays_total": len(angle),
        "inlier_tolerance_px": tolerance,
        "inliers_per_quadrant": inliers_per_quadrant.tolist(),
        "median_abs_radial_residual_px": float(np.median(np.abs(fit.fun))),
        "positive_cross_edge_fraction": positive_fraction,
        "median_inside_minus_outside": contrast_median,
        "inside_minus_outside_angular_mad_scaled": contrast_mad,
        "radius_at_search_bound": bool(radius_at_bound),
        "center_at_search_bound": center_at_bound,
    }
    if (inlier.sum() < len(angle) // 2 or np.any(inliers_per_quadrant < 5) or positive_fraction < 0.65
            or contrast_median <= contrast_mad or radius_at_bound or center_at_bound):
        report["reason"] = "Insufficient coherent circular edge or outward step, or fitted center/radius at a bound"
        return None, report
    return (center, radius), report


def run(args):
    try:
        import numpy as np
    except ImportError as error:
        raise RuntimeError("The disk command requires NumPy") from error

    if args.inventory:
        with open_source(args, np) as entries:
            return {"source": str(args.source.resolve()), "datasets": entries, "scope": "Array inventory only"}
    if args.layout is None or args.roi is None:
        raise ValueError("Select --layout and --roi, or use --list to inspect the source")
    if args.arrays is not None and args.arrays.suffix.lower() != ".npz":
        raise ValueError("--arrays requires a .npz output path")
    annulus = args.virtual_annulus
    if annulus is not None and (args.arrays is None or not np.isfinite(annulus).all()
                                or not 0 <= annulus[0] < annulus[1]):
        raise ValueError("--virtual-annulus requires --arrays and finite 0 <= INNER < OUTER")
    with open_source(args, np) as array:
        if array.ndim != (4 if args.layout == "scan4d" else 3) or array.dtype.kind not in "biuf":
            raise ValueError("Array rank or real-valued dtype does not match the declared layout")
        scan_shape = tuple(array.shape[:2]) if args.layout == "scan4d" else tuple(args.scan_shape or ())
        if len(scan_shape) != 2 or min(scan_shape) < 1 or (
            args.layout == "flat3d" and scan_shape[0] * scan_shape[1] != array.shape[0]
        ) or (args.scan_shape and tuple(args.scan_shape) != scan_shape):
            raise ValueError("--scan-shape must agree with scan4d axes or the flat3d pattern count")
        y0, y1, x0, x1 = args.roi
        if not (0 <= y0 < y1 <= scan_shape[0] and 0 <= x0 < x1 <= scan_shape[1]):
            raise ValueError("ROI must be nonempty and inside the scan")

        ky, kx = array.shape[-2:]
        seed = tuple(args.center_xy or (kx // 2, ky // 2))
        bounds = tuple(args.radius_range or (max(2.0, 0.05 * min(ky, kx)), min(ky, kx) / 2 - 1))
        low, high = bounds
        if not np.isfinite([*seed, *bounds, args.sigma]).all() or not (
            0 <= seed[0] <= kx - 1 and 0 <= seed[1] <= ky - 1 and 1 <= low < high <= max(ky, kx)
            and high - low >= 2 and 0 <= args.sigma <= min(ky, kx) / 8
            and (args.radius_hint is None or low < args.radius_hint < high)
        ):
            raise ValueError("Invalid center seed, radius range, radius hint, or smoothing for this detector")

        sums = np.zeros((2, ky, kx), dtype=np.float64)
        counts = [0, 0]
        virtual_total = np.empty((y1 - y0, x1 - x0), dtype=np.float64) if args.arrays else None
        for y, x_start, x_stop, block in roi_blocks(array, args.layout, scan_shape[1], args.roi):
            if block.dtype.kind == "f" and not np.isfinite(block).all():
                raise ValueError("ROI contains nonfinite measured pixels")
            sums[y % 2] += block.sum(axis=0, dtype=np.float64)
            counts[y % 2] += len(block)
            if virtual_total is not None:
                virtual_total[y, x_start:x_stop] = block.sum(axis=(-2, -1), dtype=np.float64)

        mean = sums.sum(axis=0) / sum(counts)
        if not np.isfinite(mean).all():
            raise ValueError("Averaged intensity is outside the finite float64 range")
        candidate, fit = disk_fit(np, mean, seed, bounds, args.radius_hint, args.sigma)
        center, radius = candidate if candidate is not None else (None, None)
        split = {"pattern_counts": counts, "scope": "Relative even/odd scan rows; internal repeatability only"}
        if candidate is not None and all(counts):
            halves = [disk_fit(np, total / count, center, bounds, radius, args.sigma)[0]
                      for total, count in zip(sums, counts)]
            split["candidates"] = [None if item is None else {"center_xy_px": item[0].tolist(), "radius_px": item[1]}
                                   for item in halves]
            if all(item is not None for item in halves):
                split["center_separation_px"] = float(np.linalg.norm(halves[0][0] - halves[1][0]))
                split["absolute_radius_difference_px"] = abs(halves[0][1] - halves[1][1])

        aperture = annulus_center = None
        if args.arrays:
            fields = dict(mean_dp=mean, virtual_total=virtual_total, scan_y=np.arange(y0, y1), scan_x=np.arange(x0, x1),
                          detector_y=np.arange(ky), detector_x=np.arange(kx))
            apertures = {}
            yy, xx = np.ogrid[:ky, :kx]
            if candidate is not None:
                aperture = radius * 0.8
                apertures["virtual_bf"] = (xx - center[0]) ** 2 + (yy - center[1]) ** 2 <= aperture ** 2
            if annulus is not None:
                if args.center_xy is None and candidate is None:
                    raise ValueError("No fitted center for the annulus; provide --center-xy")
                annulus_center = list(seed) if args.center_xy is not None else center.tolist()
                distance = np.hypot(xx - annulus_center[0], yy - annulus_center[1])
                apertures["virtual_annulus"] = (annulus[0] <= distance) & (distance < annulus[1])
                if not apertures["virtual_annulus"].any():
                    raise ValueError("The requested annulus contains no detector pixels")
            if apertures:
                fields.update({name: np.empty_like(virtual_total) for name in apertures})
                for y, x_start, x_stop, block in roi_blocks(array, args.layout, scan_shape[1], args.roi):
                    for name, mask in apertures.items():
                        fields[name][y, x_start:x_stop] = block[:, mask].sum(axis=1, dtype=np.float64)
            with args.arrays.open("xb") as file:
                np.savez_compressed(file, **fields)

        return {
            "source": str(args.source.resolve()), "dset": args.dset, "key": args.key,
            "layout": args.layout, "dtype": str(array.dtype), "scan_shape": list(scan_shape), "detector_shape_yx": [ky, kx],
            "roi_y0_y1_x0_x1_exclusive": args.roi, "pattern_count": sum(counts),
            "center_seed_xy_px": list(seed), "radius_search_px": list(bounds), "radius_hint_px": args.radius_hint,
            "smoothing_sigma_px": args.sigma, "fit_status": "CANDIDATE" if candidate is not None else "NOT_IDENTIFIABLE",
            "center_xy_px": center.tolist() if center is not None else None, "radius_px": radius, "fit": fit, "split_rows": split,
            "arrays": str(args.arrays.resolve()) if args.arrays else None, "virtual_bf_radius_px": aperture,
            "virtual_annulus_radii_px": annulus, "virtual_annulus_center_xy_px": annulus_center,
            "scope": "Detector-pixel diagnostic. No physical scale, semiangle, or scan-to-detector transform is inferred.",
        }
