"""Immutable GPA composition over the existing image provider and its journal.

No FFT producer, alternate calibration registry or mutable scientific database.
All spatial indices here refer to the LOCAL FFT input grid, not the PNG.
"""
import csv
import hashlib
import io
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

try:
    from . import image_gpa_core as core
except ImportError:
    import image_gpa_core as core

FIELDS = {
    "gpa": {"object_id", "source_domain", "source_domain_text", "g_vectors", "mask_sigma", "reference_rect", "reference_mode", "reference_text", "amplitude_floor_relative", "previous_gpa_id", "max_size"},
    "gpa_view": {"object_id", "component", "display_range", "max_size"},
    "gpa_read": {"object_id", "points"},
}
COMPONENTS = ("phase_1", "phase_2", "ux", "uy", "exx", "eyy", "exy", "rotation")
LIMITATIONS = [
    "Conditional single-domain projected image-lattice fields, not independently verified material strain, phase or defect identification",
    "Geometric phase is extracted from selected Fourier bands; stored image or ptychography reconstruction phase is NOT geometric phase",
    "Reference lattice and reference region are sourced assumptions; constant displacement gauge is unobservable",
    "Sublattice contrast, imaging transfer, scan distortions and overlapping domains can produce pseudo-strain even with valid masks",
    "Validity excludes known numerical failures, not unknown model errors; scientific uncertainty is unknown",
    "No through-thickness, 3D strain, dislocation, twin or topological conclusion; reference/mask sensitivity needs separate revisions",
]


def _dependency(metadata, directory, api):
    return {"object_id": metadata["object_id"], "request_id": metadata["request_id"],
            "manifest_sha256": api.sha_file(directory / "object.json")}


def _input(workspace, ident, api):
    selected, selected_dir = workspace.object(ident)
    parent, directory, context = workspace.measurement_operand(ident)
    api.need(parent["kind"] in ("fft", "fft_view") and parent.get("array_domain") == "frequency",
             "GPA requires an existing real-image external FFT, not an image phase array or imported complex field", "UNSUPPORTED_OPERATION")
    fft, fft_dir = workspace.object(parent.get("spectrum_object_id", parent["object_id"]))
    api.need(fft["kind"] == "fft" and fft.get("window") == "none" and fft.get("dtype") == "complex128",
             "First GPA qualification requires the original unwindowed (window=none) external complex128 FFT", "UNSUPPORTED_OPERATION")
    api.need(parent["files_sha256"]["data.npy"] == fft["files_sha256"]["data.npy"],
             "Selected spectrum differs from its declared FFT producer", "CORRUPT_OBJECT")
    source, source_dir, _ = workspace.resolved(fft["parent_object_id"])
    api.need(source["kind"] in ("frame", "view") and source.get("array_domain") in (None, "spatial", "real_space", "unspecified_image"),
             "GPA input must be a real spatial image; diffraction-intensity images are not a spatial lattice", "UNSUPPORTED_OPERATION")
    api.need(not str(source["dtype"]).startswith("complex"), "Complex image fields require an explicit separate interpretation", "UNSUPPORTED_OPERATION")
    mapping = api.spatial_panel(source, fft["source_rect_xyxy"], [0, 0, fft["shape_yx"][1], fft["shape_yx"][0]])
    record = parent.get("xy_calibration")
    scale = api.calibration.active_scale(record)
    metric = None
    if scale:
        factor = api.calibration.UNITS[scale["unit"]] / api.calibration.UNITS["nm"]
        metric = [scale[axis] * factor for axis in ("x", "y")]
        api.need(all(api.number(v) and v != 0 for v in metric), "XY metric cannot be represented safely in nm")
    return {"selected": _dependency(selected, selected_dir, api), "fft": _dependency(fft, fft_dir, api),
            "source": _dependency(source, source_dir, api), "source_mapping": mapping,
            "fft_array_sha256": fft["files_sha256"]["data.npy"], "source_array_sha256": source["files_sha256"]["data.npy"],
            "shape_yx": fft["shape_yx"], "xy_calibration": record, "calibration_dependency": api.calibration.dependency(record),
            "calibration_nm_xy": metric, "source_context": context,
            "fft_processing": {key: fft.get(key) for key in ("algorithm", "window", "subtract_mean", "removed_mean", "preprocessing_order")}}, fft_dir


def _parameters(request, api):
    api.need(request.get("source_domain") == "real_space_lattice", "Explicit source_domain=real_space_lattice declaration/working assumption required; unknown domains are not inferred")
    domain_text = request.get("source_domain_text")
    api.need(type(domain_text) is str and bool(domain_text.strip()) and len(domain_text) <= 2000, "source_domain_text requires the actual source or explicit working assumption")
    api.need(request.get("reference_mode") in ("fixed_g", "fit_reference"), "Explicit reference_mode fixed_g or fit_reference required")
    text = request.get("reference_text")
    api.need(type(text) is str and bool(text.strip()) and len(text) <= 2000, "Actual sourced reference_text/assumption required")
    sigma, floor = request.get("mask_sigma"), request.get("amplitude_floor_relative", .05)
    api.need(api.number(sigma) and .002 <= sigma <= .05, "mask_sigma requires .002..05 cycles/pixel")
    api.need(api.number(floor) and .01 <= floor <= .5, "amplitude_floor_relative requires .01..5")
    size = request.get("max_size", 640)
    api.need(api.integer(size, 256, 1024), "max_size requires256..1024")
    return {"source_domain": request["source_domain"], "source_domain_text": domain_text, "source_domain_status": "caller_statement_or_assumption_not_independently_verified", "g_vectors": request.get("g_vectors"), "mask_sigma": sigma, "reference_rect": request.get("reference_rect"),
            "reference_mode": request["reference_mode"], "reference_text": text,
            "amplitude_floor_relative": floor}, size


def _arrays(directory, metadata, api):
    result = {}
    shape = tuple(metadata["shape_yx"])
    for name, spec in metadata["array_manifest"].items():
        file = directory / (name + ".npy")
        api.need(file.stat().st_size <= 20 * 1024 * 1024, "GPA array exceeds bounded component budget", "CORRUPT_OBJECT")
        # Unlike ordinary scalar image arrays these scientific fields may have
        # vector/tensor axes and NaNs ONLY outside their explicit masks.
        array = np.load(file, allow_pickle=False)
        api.need(list(array.shape) == spec["shape"] and str(array.dtype) == spec["dtype"] and not array.dtype.hasobject,
                 "GPA component layout changed", "CORRUPT_OBJECT")
        result[name] = array
    api.need(result["valid_displacement"].shape == shape and result["valid_displacement"].dtype == np.bool_ and
             result["valid_tensor"].shape == shape and result["valid_tensor"].dtype == np.bool_, "GPA validity layout changed", "CORRUPT_OBJECT")
    api.need(np.all(~result["valid_tensor"] | result["valid_displacement"]), "GPA tensor mask exceeds phase support", "CORRUPT_OBJECT")
    for name in ("displacement_pixel_xy", "phase_unwrapped", "deformation_gradient_xy", "strain_green_lagrange_xy", "rotation_radians"):
        a = result[name]
        valid = result["valid_displacement"] if name in ("displacement_pixel_xy", "phase_unwrapped") else result["valid_tensor"]
        values = a[:, valid] if name == "phase_unwrapped" else a[valid]
        api.need(np.isfinite(values).all(), "GPA nonfinite values inside valid support", "CORRUPT_OBJECT")
    return result


def _gpa(workspace, ident, api):
    metadata, directory = workspace.object(ident)
    if metadata["kind"] in ("gpa_view", "gpa_read"):
        metadata, directory = workspace.object(metadata["gpa_object_id"])
    api.need(metadata["kind"] == "gpa", "Select an immutable GPA result or its GPA view/read result")
    return metadata, directory


def _component(arrays, metadata, name, api):
    api.need(name in COMPONENTS, "Unknown GPA display component")
    physical = metadata["report"]["coordinate_domain"] == "physical_cartesian_nm"
    if name.startswith("phase_"):
        return arrays["phase_unwrapped"][int(name[-1])-1], arrays["valid_displacement"], "rad (geometric)", name
    if name in ("ux", "uy"):
        values = arrays["displacement_nm_xy"] if physical else arrays["displacement_pixel_xy"]
        return values[..., 0 if name == "ux" else 1], arrays["valid_displacement"], "nm" if physical else "pixel", name + " Eulerian backdisplacement"
    if name == "rotation":
        return arrays["rotation_radians"] * (180 / math.pi), arrays["valid_tensor"], "degree" if physical else "image-coordinate degree", "polar rotation"
    row, col = {"exx": (0, 0), "eyy": (1, 1), "exy": (0, 1)}[name]
    return arrays["strain_green_lagrange_xy"][..., row, col], arrays["valid_tensor"], "dimensionless" if physical else "image-coordinate only", name + " Green-Lagrange"


def _preview(directory, arrays, metadata, component, request, api):
    values, valid, unit, label = _component(arrays, metadata, component, api)
    size = request.get("max_size", 640)
    api.need(api.integer(size, 256, 1024), "max_size requires256..1024")
    limits = request.get("display_range")
    if limits is None:
        maximum = max(float(np.percentile(np.abs(values[valid]), 98)), 1e-12)
        limits = [-maximum, maximum]
    api.need(type(limits) is list and len(limits) == 2 and all(api.number(v) for v in limits) and limits[0] < limits[1],
             "display_range requires two finite increasing values")
    normalized = np.zeros(values.shape)
    normalized[valid] = np.clip((values[valid]-limits[0])/(limits[1]-limits[0]), 0, 1)
    low, mid, high = np.array([35, 96, 187]), np.array([246, 246, 239]), np.array([189, 49, 50])
    colors = np.where((normalized < .5)[..., None], low+(mid-low)*normalized[..., None]*2,
                      mid+(high-mid)*(normalized[..., None]-.5)*2)
    colors[~valid] = [65, 65, 70]
    image = Image.fromarray(colors.astype(np.uint8))
    factor = min((size-24)/image.width, (size-112)/image.height)
    width, height = max(1, round(image.width*factor)), max(1, round(image.height*factor))
    image = image.resize((width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (width+24, height+112), "white")
    canvas.paste(image, (12, 48))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 8), label + " [" + unit + "]", fill="black")
    draw.text((12, 25), "Conditional GPA | " + metadata["report"]["reference_mode"], fill="black")
    draw.text((12, height+55), "range %.5g .. %.5g | gray = invalid" % tuple(limits), fill="black")
    draw.text((12, height+72), "Not independently verified material strain", fill="black")
    api.save_png(directory / "preview.png", canvas)
    return {"component": component, "display_range": limits, "unit": unit, "palette": "diverging blue-white-red; invalid gray",
            "max_size": size, "scientific_values_changed": False,
            "render_only": True}, [{"domain": "source_array_indices", "source_object_id": metadata["object_id"],
                                   "source_rect_xyxy": [0, 0, values.shape[1], values.shape[0]], "image_rect_xyxy": [12, 48, width+12, height+48],
                                   "limitation": "Local GPA spatial-grid indices, not raw intensity or reciprocal coordinates"}]


def _csv(rows):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    fields = list(rows[0])
    writer.writerow(fields)
    writer.writerows([[row[key] for key in fields] for row in rows])
    return stream.getvalue().encode("utf-8")


def action(workspace, action_name, request, metadata, directory, api):
    if action_name == "gpa":
        parameters, _ = _parameters(request, api)
        dependency, fft_dir = _input(workspace, request["object_id"], api)
        history = []
        if request.get("previous_gpa_id"):
            previous, previous_dir = _gpa(workspace, request["previous_gpa_id"], api)
            api.need(previous["input_dependency"]["fft"] == dependency["fft"], "GPA revision must retain the exact FFT producer and immutable input")
            history = [*previous.get("history", []), _dependency(previous, previous_dir, api)]
            api.need(len(history) <= 8, "GPA revision history budget is8; start a separately sourced analysis", "BUDGET_EXCEEDED")
        values = api.load_array(fft_dir / "data.npy", allow_complex=True)
        output = core.analyze(values, parameters["g_vectors"], parameters["mask_sigma"], parameters["reference_rect"],
                              reference_mode=parameters["reference_mode"], amplitude_floor_relative=parameters["amplitude_floor_relative"],
                              calibration_nm_xy=dependency["calibration_nm_xy"], unwrap_seed=0)
        arrays, report = output["arrays"], output["report"]
        import skimage
        import scipy
        report["software"] = {"scikit_image": skimage.__version__, "scipy": scipy.__version__, "numpy": np.__version__}
        report["limitations"] = list(dict.fromkeys([*report["limitations"], *LIMITATIONS]))
        for name, array in arrays.items():
            api.save_array(directory, name+".npy", array)
        manifest = {name: {"shape": list(a.shape), "dtype": str(a.dtype), "axes": ("reflection,y,x" if name in ("complex_band", "amplitude", "mask_frequency", "phase_wrapped", "phase_demodulated_wrapped", "phase_unwrapped", "valid_phase", "low_amplitude", "phase_residue", "phase_unwrap_discontinuity") else "y,x,component_xy,derivative_xy" if a.ndim == 4 else "y,x,component_xy" if a.ndim == 3 else "y,x")} for name, a in arrays.items()}
        for name, spec in manifest.items():
            spec["coordinate_domain"] = "fft_frequency_grid" if name == "mask_frequency" else "local_spatial_fft_input_grid"
            if name == "mask_frequency":
                spec["axes"] = "reflection,fy,fx"
                spec["unit"] = "dimensionless Fourier aperture weight"
            elif name.startswith("phase_") and arrays[name].dtype != np.bool_:
                spec["unit"] = "radian (geometric band phase, never stored image phase)"
            elif name == "displacement_pixel_xy":
                spec["unit"] = "pixel"
            elif name == "displacement_nm_xy":
                spec["unit"] = "nm"
            elif name == "rotation_radians":
                spec["unit"] = "radian; physical" if dependency["calibration_nm_xy"] else "radian; image-coordinate only"
            elif arrays[name].dtype == np.bool_:
                spec["unit"] = "boolean validity/diagnostic mask"
            elif name in ("complex_band", "amplitude"):
                spec["unit"] = "source stored-sample band units; no intensity calibration applied"
            else:
                spec["unit"] = "dimensionless; physical metric" if dependency["calibration_nm_xy"] else "dimensionless; image-coordinate metric only"
        metadata.update(parent_object_id=request["object_id"], input_dependency=dependency, parameters=parameters,
                        dependency_sha256=hashlib.sha256(api.canonical({"input": dependency, "parameters": parameters})).hexdigest(),
                        report=report, array_manifest=manifest, shape_yx=report["shape_yx"], axes=["y", "x"], array_domain="projected_gpa_fields",
                        dtype="float64; complex128 bands; boolean masks", history=history, fft_recomputed=False,
                        scientific_source_modified=False, material_strain_verified=False, uncertainty=None,
                        calibration_dependency=dependency["calibration_dependency"], xy_calibration=dependency["xy_calibration"],
                        interpretation_status="hypothesized", display_calibration_id=(dependency["xy_calibration"] or {}).get("calibration_id"))
        api.write_new(directory / "gpa-report.json", api.canonical(report)+b"\n")
        rows = [{"component": c, "unit": _component(arrays, metadata, c, api)[2],
                 "valid_pixels": int(_component(arrays, metadata, c, api)[1].sum()),
                 "median": float(np.median(_component(arrays, metadata, c, api)[0][_component(arrays, metadata, c, api)[1]]))} for c in COMPONENTS]
        api.write_new(directory / "gpa-summary.csv", _csv(rows))
        metadata["display"], metadata["panels"] = _preview(directory, arrays, metadata, "exx", request, api)
        return metadata
    parent, parent_dir = _gpa(workspace, request["object_id"], api)
    arrays = _arrays(parent_dir, parent, api)
    metadata.update(parent_object_id=request["object_id"], gpa_object_id=parent["object_id"],
                    gpa_dependency=_dependency(parent, parent_dir, api), shape_yx=parent["shape_yx"],
                    array_domain="projected_gpa_fields", fft_recomputed=False, gpa_recomputed=False,
                    coordinate_domain=parent["report"]["coordinate_domain"], material_strain_verified=False,
                    calibration_dependency=parent["calibration_dependency"], interpretation_status="hypothesized",
                    display_calibration_id=parent.get("display_calibration_id"))
    if action_name == "gpa_view":
        metadata["display"], metadata["panels"] = _preview(directory, arrays, parent, request.get("component"), request, api)
        metadata["dtype"] = "float64 field (see GPA component)"
    else:
        points = request.get("points")
        h, w = parent["shape_yx"]
        api.need(type(points) is list and 1 <= len(points) <= 64 and all(type(p) is list and len(p) == 2 and api.integer(p[0], 0, w-1) and api.integer(p[1], 0, h-1) for p in points),
                 "GPA samples require1..64 exact integer [x,y] points inside the local spatial FFT grid")
        rows = []
        for x, y in points:
            row = {"x_local": x, "y_local": y, "phase_valid": bool(arrays["valid_displacement"][y, x]), "tensor_valid": bool(arrays["valid_tensor"][y, x]), "invalid_reason": None if arrays["valid_tensor"][y, x] else "outside reference-connected phase/derivative support; inspect saved masks"}
            for name in COMPONENTS:
                a, valid, unit, _ = _component(arrays, parent, name, api)
                row[name] = float(a[y, x]) if valid[y, x] else None
                row[name+"_unit"] = unit
            rows.append(row)
        metadata.update(samples=rows, sampling="exact integer grid; no interpolation; null invalid values are not zero")
        api.write_new(directory / "gpa-samples.json", api.canonical(rows)+b"\n")
        api.write_new(directory / "gpa-samples.csv", _csv(rows))
    return metadata


def validate_references(workspace, metadata, api):
    if metadata["kind"] != "gpa":
        parent, directory = workspace.object(metadata["gpa_object_id"])
        api.need(parent["kind"] == "gpa" and _dependency(parent, directory, api) == metadata["gpa_dependency"],
                 "GPA view/sample belongs to a different science result", "CORRUPT_OBJECT")
        return
    original = api.read_json(workspace.root / "requests" / (metadata["request_id"]+".json"))["parameters"]
    parameters, _ = _parameters(original, api)
    dependency, _ = _input(workspace, original["object_id"], api)
    api.need(metadata["parameters"] == parameters and metadata["input_dependency"] == dependency and
             metadata["dependency_sha256"] == hashlib.sha256(api.canonical({"input": dependency, "parameters": parameters})).hexdigest(),
             "GPA parameters/source/calibration no longer bind to the original request", "CORRUPT_OBJECT")
    api.need(metadata["report"]["algorithm"] == core.ALGORITHM_VERSION and metadata["report"]["shape_yx"] == dependency["shape_yx"] and
             metadata["report"]["calibration_nm_xy"] == dependency["calibration_nm_xy"] and
             metadata["report"]["reference_mode"] == parameters["reference_mode"] and
             metadata["report"]["reference_rect_xyxy"] == parameters["reference_rect"] and
             metadata["report"]["g_vectors_cycles_per_pixel"] == parameters["g_vectors"],
             "GPA scientific contract differs from submitted parameters", "CORRUPT_OBJECT")
    api.need(len(metadata.get("history", [])) <= 8, "GPA history exceeds budget", "CORRUPT_OBJECT")
    for old in metadata.get("history", []):
        api.need(type(old.get("object_id")) is str and api.OBJECT_ID.fullmatch(old["object_id"]), "Invalid GPA historical identity", "CORRUPT_OBJECT")
        file = workspace.root / "objects" / old["object_id"] / "object.json"
        api.need(file.is_file() and not file.is_symlink() and api.sha_file(file) == old["manifest_sha256"], "Historical GPA manifest changed", "CORRUPT_OBJECT")
