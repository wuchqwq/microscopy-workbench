"""Bounded numerical peak observations on an already committed complex FFT.

No image recognition, phase assignment, PNG sampling or new FFT occurs here.
The workspace owns publication, calibration semantics and request recovery.
"""
import math

import numpy as np
import scipy
from scipy.ndimage import maximum_filter, minimum_filter


def detect(values, parameters, need):
    """3x3 local maxima, explicit DC mask and deterministic nonmaximum suppression."""
    maximum = parameters.get("max_peaks", 12)
    separation = parameters.get("min_separation_bins", 3)
    dc_radius = parameters.get("exclude_dc_radius_bins", 3)
    threshold = parameters.get("threshold_rel", .05)
    refinement = parameters.get("refinement", "quadratic")
    need(type(maximum) is int and 1 <= maximum <= 32, "max_peaks requires 1..32")
    need(type(separation) is int and 1 <= separation <= 32, "min_separation_bins requires 1..32")
    need(type(dc_radius) is int and 0 <= dc_radius <= 64, "exclude_dc_radius_bins requires 0..64")
    need(type(threshold) in (int, float) and math.isfinite(threshold) and 0 < threshold <= 1,
         "threshold_rel requires a finite value in (0,1]")
    need(refinement in ("none", "quadratic"), "refinement requires none or quadratic")
    need(values.ndim == 2 and values.dtype == np.dtype("complex128") and min(values.shape) >= 3,
         "Peak detection requires a saved complex128 FFT of at least 3x3", "UNSUPPORTED_OPERATION")
    need(np.isfinite(values).all(), "Nonfinite FFT values cannot be measured")
    amplitude = np.abs(values)
    need(np.isfinite(amplitude).all(), "FFT amplitude exceeds finite binary64")
    height, width = values.shape
    yy, xx = np.ogrid[:height, :width]
    eligible = (xx-width//2)**2 + (yy-height//2)**2 > dc_radius**2
    admitted = amplitude[eligible]
    strongest = float(admitted.max()) if admitted.size else 0.
    absolute_threshold = strongest * threshold
    # Constant magnitude has no localized maximum, including an impulse FFT.
    local_maximum = maximum_filter(amplitude, size=3, mode="nearest")
    local_minimum = minimum_filter(amplitude, size=3, mode="nearest")
    mask = eligible & (amplitude >= absolute_threshold) & (amplitude > 0) & (amplitude == local_maximum) & (amplitude > local_minimum)
    indices = np.flatnonzero(mask)
    need(len(indices) <= 4096, "More than 4096 local maxima; raise threshold_rel or use a smaller FFT ROI", "BUDGET_EXCEEDED")
    ordered = sorted(indices.tolist(), key=lambda index: (-float(amplitude.flat[index]), index))
    selected = []
    for index in ordered:
        y, x = divmod(index, width)
        if all((x-row[0])**2+(y-row[1])**2 >= separation**2 for row in selected):
            selected.append((x, y))
            if len(selected) == maximum:
                break
    rows = []
    for ordinal, (x, y) in enumerate(selected, 1):
        dx = dy = 0.
        reason = "explicit integer-bin observation"
        refined = False
        if refinement == "quadratic":
            reason = "edge, plateau or unresolved curvature; retained integer bin"
            if 0 < x < width-1 and 0 < y < height-1:
                # Three-point parabolic interpolation of log amplitude. It is
                # a local estimator, not a calibrated localization uncertainty.
                a = amplitude[y, x-1:x+2]
                b = amplitude[y-1:y+2, x]
                if np.all(a > 0) and np.all(b > 0):
                    ax, ay = np.log(a), np.log(b)
                    cx, cy = ax[0]-2*ax[1]+ax[2], ay[0]-2*ay[1]+ay[2]
                    if cx < -1e-12 and cy < -1e-12 and ax[1] > max(ax[0], ax[2]) and ay[1] > max(ay[0], ay[2]):
                        tx = .5*(ax[0]-ax[2])/cx
                        ty = .5*(ay[0]-ay[2])/cy
                        if abs(tx) <= .5 and abs(ty) <= .5:
                            dx, dy, refined = float(tx), float(ty), True
                            reason = "separable three-point quadratic log-amplitude estimate"
        fx, fy = (x+dx-width//2)/width, (y+dy-height//2)/height
        magnitude = math.hypot(fx, fy)
        median = float(np.median(amplitude[max(0,y-2):y+3, max(0,x-2):x+3]))
        ratio = float(amplitude[y, x])/median if median > 0 else None
        if ratio is not None and not math.isfinite(ratio):
            ratio = None
        rows.append({"peak_id": "peak-"+str(ordinal), "bin_xy": [x, y], "refined_bin_xy": [x+dx, y+dy],
                     "frequency_cycles_per_pixel": [fx, fy], "frequency_magnitude_cycles_per_pixel": magnitude,
                     "pixel_period": 1/magnitude if magnitude else None,
                     "sampled_amplitude": float(amplitude[y, x]), "local_median_amplitude": median,
                     "local_peak_to_median_ratio": ratio, "refined": refined, "refinement_note": reason,
                     "localization_uncertainty_bins": None, "status": "hypothesized"})
    for row in rows:
        target = [-v for v in row["frequency_cycles_per_pixel"]]
        pairs = [other["peak_id"] for other in rows if other is not row and
                 math.hypot((other["frequency_cycles_per_pixel"][0]-target[0])*width,
                            (other["frequency_cycles_per_pixel"][1]-target[1])*height) <= 1.]
        row["conjugate_peak_ids"] = pairs
    normalized = {"max_peaks": maximum, "min_separation_bins": separation, "exclude_dc_radius_bins": dc_radius,
                  "threshold_rel": threshold, "refinement": refinement}
    quality = {"local_maxima_above_threshold": len(indices), "returned_count": len(rows),
               "selection_limit_reached": len(rows) == maximum,
               "detection_rect_xyxy": [0, 0, width, height],
               "display_selection_used": False,
               "threshold_amplitude": absolute_threshold, "strongest_outside_dc_amplitude": strongest,
               "empty_reason": None if rows else "No localized maximum passes the explicit DC/relative-amplitude filters",
               "limitations": ["Geometric peak candidates, not indexed reflections or phase identification",
                               "Relative amplitude and local contrast are not signal-to-noise or detection confidence",
                               "Conjugate peaks from a real image are not independent crystallographic evidence",
                               "Sub-bin interpolation does not increase FFT resolution; localization uncertainty remains unknown",
                               "The complete saved FFT grid is searched; preview zoom, filtering and gamma are not numerical detection inputs"]}
    return rows, normalized, quality


def run(workspace, request, ident, directory, metadata, api):
    parent, parent_directory, context = workspace.measurement_operand(request["object_id"])
    api.need(parent["kind"] in ("fft", "fft_view") and parent.get("array_domain") == "frequency",
             "image_peaks requires a saved external FFT; scalar diffraction and imported complex arrays are not supported", "UNSUPPORTED_OPERATION")
    values = api.load_array(parent_directory / "data.npy", allow_complex=True)
    rows, parameters, quality = detect(values, request, api.need)
    record = parent.get("xy_calibration")
    spectrum_id = parent.get("spectrum_object_id", parent["object_id"])
    annotations = []
    for row in rows:
        fx, fy = row["frequency_cycles_per_pixel"]
        measured = api.calibration.geometry(fx, fy, record, frequency=True)
        row.update(measured, d_spacing=measured.get("period"), d_spacing_unit=measured.get("period_unit"),
                   dc_reference=[0, 0], coordinate_space="frequency_cycles_per_pixel")
        annotations.append({"kind": "point", "annotation_id": row["peak_id"], "coordinates": [fx, fy],
                            "coordinate_space": "frequency_cycles_per_pixel", "source_object_id": spectrum_id,
                            "text": "P" + row["peak_id"].split("-")[-1], "color": "cyan", "status": "hypothesized",
                            "note": "Numerical FFT peak candidate; no HKL or phase has been assigned"})
    shown, expression = api.spectrum_display(values, "log_amplitude")
    settings = api.display_options({"max_size": request.get("max_size", 512), "gamma": .8, "upscale": True}, [shown])
    settings.update(representation="log_amplitude", spectrum_axes=False, spectrum_filter=None)
    image, panel = api.spectrum_canvas(shown, settings, spectrum_id, record)
    api.save_png(directory / "unannotated.png", image)
    image, marks = api.overlay(image, annotations, [panel])
    api.save_png(directory / "preview.png", image)
    api.save_array(directory, "data.npy", values)
    api.write_new(directory / "peaks.json", api.canonical({"parameters": parameters, "quality": quality, "peaks": rows})+b"\n")
    metadata.update(kind="fft_view", parent_object_id=request["object_id"], source_object_id=spectrum_id,
                    spectrum_object_id=spectrum_id, dtype=str(values.dtype), shape_yx=list(values.shape), axes=["fy", "fx"],
                    array_domain="frequency", frequency_unit=parent["frequency_unit"], frequency_axes=parent["frequency_axes"],
                    physical_frequency_axes=api.calibration.frequency_axes(values.shape, record),
                    physical_frequency_unit=("cycles/"+record["xy_scale"]["unit"]) if api.calibration.active_scale(record) else None,
                    xy_calibration=record, user_context=context, scientific_grid_identity=workspace.measurement_grid(request["object_id"]),
                    display=settings, display_representation=expression, display_calibration_id=record["calibration_id"] if record else None,
                    panels=[panel], annotations=marks, peak_table=rows, peak_parameters=parameters, peak_quality=quality,
                    peak_detection={"algorithm": "SciPy ndimage 3x3 amplitude maxima; deterministic Euclidean nonmaximum suppression; optional three-point log-quadratic interpolation",
                                    "scipy_version": scipy.__version__, "uses_display_pixels": False, "input_complex_array_sha256": api.sha_file(parent_directory / "data.npy"),
                                    "measurement_records_created": False, "next_measurement_tool": "image_measure"},
                    fft_recomputed=False, scientific_data_changed=False)
    return metadata
