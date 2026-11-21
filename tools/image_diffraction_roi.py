"""Register a bounded scan ROI mean as a reciprocal scalar image."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace

import numpy as np

FIELDS = {"source_path", "layout", "scan_shape_yx", "scan_roi_y0_y1_x0_x1",
          "dataset_key", "dataset_index", "source_text", "disk_radius_range_px"}
MAX_SELECTED_BYTES = 512 * 1024 * 1024


def _reader():
    path = (Path(__file__).resolve().parents[1] / "skills" / "scientific-agent" /
            "ptyrad-reconstruction" / "scripts" / "diffraction_check.py")
    spec = spec_from_file_location("workbench_diffraction_reader", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def register(request, metadata, directory, api):
    path = api.absolute(request.get("source_path"), "source_path")
    layout = request.get("layout")
    roi = request.get("scan_roi_y0_y1_x0_x1")
    scan = request.get("scan_shape_yx")
    key, index = request.get("dataset_key"), request.get("dataset_index")
    source_text = request.get("source_text")
    radii = request.get("disk_radius_range_px")
    api.need(type(roi) is list and len(roi) == 4 and all(api.integer(n, 0, 2**31-1) for n in roi),
             "Supply the half-open scan ROI [y0,y1,x0,x1] in integer scan indices")
    api.need(scan is None or type(scan) is list and len(scan) == 2 and all(api.integer(n, 1, 2**31-1) for n in scan),
             "scan_shape_yx must be two positive integer scan dimensions")
    api.need(key is None or type(key) is str and 1 <= len(key) <= 1024 and key == key.strip() and "\x00" not in key,
             "dataset_key must name an exact HDF5 dataset")
    api.need(index is None or api.integer(index, 0, 2**31-1), "dataset_index must be a nonnegative DM dataset index")
    api.need(source_text is None or type(source_text) is str and 1 <= len(source_text) <= 2000 and source_text.strip(),
             "source_text must be a bounded source description when supplied")
    api.need(radii is None or type(radii) is list and len(radii) == 2 and all(api.number(n) for n in radii),
             "disk_radius_range_px must be two finite detector-pixel radii")

    identity = api.source_identity(path)
    reader = _reader()
    args = SimpleNamespace(source=path, dset=index, key=key, inventory=False)
    with reader.open_source(args, np, self_contained=True) as data:
        scan_shape = reader.validate_roi(data, layout, scan, roi)
        detector_shape = tuple(int(n) for n in data.shape[-2:])
        api.scalar_shape(detector_shape, np.float64)
        y0, y1, x0, x1 = roi
        pattern_count = (y1-y0) * (x1-x0)
        api.need(pattern_count * data.dtype.itemsize * detector_shape[0] * detector_shape[1] <= MAX_SELECTED_BYTES,
                 "Scan ROI exceeds the 512 MiB decoded input budget", "BUDGET_EXCEEDED")
        mean, _, counts, _ = reader.average_roi(np, data, layout, scan_shape, roi)
        source_dtype = data.dtype.str
    api.need(sum(counts) == pattern_count, "The reader returned an incomplete scan ROI")
    api.check_source(identity)

    disk = None
    if radii is not None:
        h, w = detector_shape
        low, high = radii
        api.need(1 <= low < high <= min(h, w) / 2 and high-low >= 2 and min(h, w) >= 8,
                 "Disk search requires a radius interval of at least 2 px within half the shorter detector axis")
        seed = (w // 2, h // 2)
        candidate, fit = reader.disk_fit(np, mean, seed, radii, None, 1.0)
        center, radius = candidate if candidate is not None else (None, None)
        disk = {"status": "candidate" if candidate is not None else "not_identifiable",
                "source": "radial bright-field edge fit on the saved ROI mean",
                "coordinate_space": "source_array_indices", "unit": "detector_px",
                "center_xy_px": center.tolist() if center is not None else None, "radius_px": radius,
                "search_radius_px": radii, "seed_xy_px": list(seed), "smoothing_sigma_px": 1.0, "fit": fit}

    # A standard reciprocal frame can be displayed, exported and measured by
    # the existing image tools. Its pixels are detector samples of an ROI mean.
    api.save_array(directory, "data.npy", mean)
    display = api.display_options({}, [mean])
    preview = api.render(mean, display, (display["max_size"], display["max_size"]))
    api.save_png(directory / "preview.png", preview)
    h, w = detector_shape
    ident = metadata["object_id"]
    mapping = api.panel(ident, [0, 0, w, h], [0, 0, preview.width, preview.height], "reciprocal")
    mapping["limitation"] = "Detector pixel centres of the scan ROI mean; scan indices are recorded separately."
    metadata.update(
        kind="frame", origin="scan_roi_mean_diffraction", source_identity=identity,
        dtype="float64", axes=["y", "x"], shape_yx=list(detector_shape), array_domain="reciprocal",
        intensity_semantics="Arithmetic mean of stored detector samples; intensity unit was not inferred",
        panels=[mapping], display=display,
        calibration_admission={"status": "pixel_only", "source": "unknown",
                               "reason": "Supply sourced inverse-length XY scale and an explicit detector centre separately"},
        diffraction_roi={
            "mean_object_id": ident, "layout": layout, "source_dtype": source_dtype,
            "source_sha256": identity["sha256"],
            "input_axes": ["scan_y", "scan_x", "detector_y", "detector_x"] if layout == "scan4d"
                          else ["scan_y*scan_width+scan_x", "detector_y", "detector_x"],
            "scan_shape_yx": list(scan_shape), "scan_roi_y0_y1_x0_x1_exclusive": roi,
            "detector_shape_yx": list(detector_shape), "pattern_count": pattern_count,
            "dataset_key": key, "dataset_index": index, "source_text": source_text,
            "reduction": "unweighted_arithmetic_mean_float64",
            "beam_center_status": "unconfirmed", "disk_fit": disk,
        })
    return metadata
