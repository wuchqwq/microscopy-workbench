"""Source-bound projected phase topology over existing GPA records.

Only wrapped geometric phase and band amplitude are sampled. The saved GPA
unwrapped displacement/strain support is deliberately not a contour mask:
an enclosed core or unwrap cut need not invalidate a usable surrounding path.
"""
import csv
import hashlib
import io
import math
import re

import numpy as np
from PIL import Image, ImageDraw

try:
    from . import image_topology_core as core
except ImportError:
    import image_topology_core as core

FIELDS = {"topology": {"object_ids", "loops", "model_assumption_text", "amplitude_floor_relative",
                       "burgers_candidates", "previous_topology_id", "max_size"}}
LABEL = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,39}\Z")


def _parameters(request, api):
    ids, loops = request.get("object_ids"), request.get("loops")
    api.need(type(ids) is list and 1 <= len(ids) <= 3 and
             all(type(value) is str and api.OBJECT_ID.fullmatch(value) for value in ids) and len(set(ids)) == len(ids),
             "object_ids requires1..3 distinct immutable GPA identities")
    api.need(type(loops) is list and 2 <= len(loops) <= 8, "Supply2..8 explicit local spatial circuits")
    labels = set()
    for loop in loops:
        api.need(type(loop) is dict and set(loop) <= {"rect", "orientation", "loop_id"} and
                 "rect" in loop and loop.get("orientation") in ("positive_image_xy", "negative_image_xy"),
                 "Each circuit requires rect and explicit positive_image_xy or negative_image_xy orientation")
        name = loop.get("loop_id")
        if name is not None:
            api.need(type(name) is str and LABEL.fullmatch(name) and name not in labels,
                     "loop_id must be a distinct safe label, not a scientific identity")
            labels.add(name)
    text = request.get("model_assumption_text")
    api.need(type(text) is str and bool(text.strip()) and len(text) <= 2000,
             "Actual source or working model_assumption_text required; topology is not a confirmed material defect")
    floor = request.get("amplitude_floor_relative", .05)
    api.need(api.number(floor) and .01 <= floor <= .5, "amplitude_floor_relative requires .01..5")
    candidates = request.get("burgers_candidates")
    if candidates is not None:
        api.need(type(candidates) is list and 1 <= len(candidates) <= 16, "At most16 explicit projected closure candidates")
        names = set()
        for row in candidates:
            api.need(type(row) is dict and set(row) == {"label", "b_pixel_xy"} and
                     type(row["label"]) is str and LABEL.fullmatch(row["label"]) and row["label"] not in names and
                     type(row["b_pixel_xy"]) is list and len(row["b_pixel_xy"]) == 2 and all(api.number(v) for v in row["b_pixel_xy"]),
                     "Candidates require distinct safe label and finite b_pixel_xy in the supplied reference pixel basis")
            names.add(row["label"])
    size = request.get("max_size", 768)
    api.need(api.integer(size, 256, 1024), "max_size requires256..1024")
    return {"object_ids": ids, "loops": loops, "model_assumption_text": text,
            "amplitude_floor_relative": floor, "burgers_candidates": candidates}, size


def _dependency(metadata, directory, api):
    return {"object_id": metadata["object_id"], "request_id": metadata["request_id"],
            "manifest_sha256": api.sha_file(directory / "object.json")}


def _load(metadata, directory, name, api):
    spec = metadata["array_manifest"].get(name)
    path = directory / (name+".npy")
    api.need(type(spec) is dict and path.stat().st_size <= 5*1024*1024,
             "Missing or oversized saved GPA band", "CORRUPT_OBJECT")
    value = np.load(path, allow_pickle=False)
    expected_shape = metadata["shape_yx"] if name == "edge_invalid" else [2, *metadata["shape_yx"]]
    expected_dtype = "bool" if name == "edge_invalid" else "float64"
    api.need(list(value.shape) == expected_shape == spec["shape"] and str(value.dtype) == expected_dtype == spec["dtype"],
             "Saved GPA phase/amplitude/edge layout changed", "CORRUPT_OBJECT")
    return value


def _source_bundle(workspace, ids, api, *, load=False):
    sources, first, phases, amplitudes, vectors, bands = [], None, [], [], [], []
    edge, first_record = None, None
    for ident in ids:
        metadata, directory = workspace.object(ident)
        api.need(metadata.get("kind") == "gpa" and metadata["parameters"]["reference_mode"] == "fixed_g",
                 "First topology scope requires exact fixed_g GPA records; views, fitted references and ordinary image phase are not accepted", "UNSUPPORTED_OPERATION")
        dependency = metadata["input_dependency"]
        common = {key: dependency[key] for key in ("fft", "fft_array_sha256", "shape_yx", "source", "source_array_sha256", "source_mapping", "xy_calibration", "calibration_dependency", "calibration_nm_xy")}
        common["mask_sigma"] = metadata["parameters"]["mask_sigma"]
        if first is None:
            first, first_record = common, metadata
        api.need(common == first, "Topology GPA records must share the exact FFT, spatial grid/mapping, calibration and Gaussian bandwidth", "TOPOLOGY_SCOPE_MISMATCH")
        sources.append({**_dependency(metadata, directory, api), "band_files_sha256": {name: metadata["files_sha256"][name] for name in ("phase_demodulated_wrapped.npy", "amplitude.npy", "edge_invalid.npy")},
                        "g_vectors_cycles_per_pixel": metadata["parameters"]["g_vectors"]})
        if not load:
            continue
        phase, amplitude, current_edge = (_load(metadata, directory, name, api) for name in ("phase_demodulated_wrapped", "amplitude", "edge_invalid"))
        api.need(edge is None or np.array_equal(edge, current_edge), "Contradictory GPA edge guards on one sampling grid", "CORRUPT_OBJECT")
        edge = current_edge
        for index, g in enumerate(metadata["parameters"]["g_vectors"]):
            g = np.asarray(g, dtype=float)
            duplicate = next(((j, sign) for j, old in enumerate(vectors) for sign in (1, -1) if np.array_equal(g, sign*old)), None)
            alias = {"gpa_object_id": ident, "reflection_index": index, "g_vector_cycles_per_pixel": g.tolist()}
            if duplicate:
                j, sign = duplicate
                good = ((amplitude[index] > .01*float(amplitude[index].max())) &
                        (amplitudes[j] > .01*float(amplitudes[j].max())) & ~edge)
                delta = (sign*phase[index]-phases[j]+np.pi) % (2*np.pi)-np.pi
                api.need(np.allclose(amplitude[index], amplitudes[j], rtol=1e-10, atol=1e-12) and
                         np.all(np.abs(delta[good]) <= 1e-8), "Repeated/conjugate reflection has contradictory saved bands", "CORRUPT_OBJECT")
                bands[j]["aliases"].append({**alias, "phase_sign_to_retained": sign})
                continue
            vectors.append(g)
            phases.append(phase[index])
            amplitudes.append(amplitude[index])
            bands.append({**alias, "aliases": [], "phase_sign_to_retained": 1})
    plan = []
    for source in sources:
        for index, g in enumerate(source["g_vectors_cycles_per_pixel"]):
            duplicate = next(((j, sign) for j, old in enumerate(plan) for sign in (1, -1)
                              if np.array_equal(np.asarray(g), sign*np.asarray(old["g_vector_cycles_per_pixel"]))), None)
            item = {"gpa_object_id": source["object_id"], "reflection_index": index, "g_vector_cycles_per_pixel": g}
            if duplicate:
                j, sign = duplicate
                plan[j]["aliases"].append({**item, "phase_sign_to_retained": sign})
            else:
                plan.append({**item, "aliases": [], "phase_sign_to_retained": 1})
    if load:
        api.need(bands == plan, "Loaded topology band plan differs from its immutable sources", "CORRUPT_OBJECT")
    result = {"gpa_records": sources, "common": first, "retained_reflections": plan,
              "phase_basis": "original fixed_g requested reciprocal vectors; no fitted-reference basis substitution"}
    arrays = (np.asarray(phases), np.asarray(amplitudes), np.asarray(vectors), edge, bands) if load else None
    return result, arrays, first_record


def _csv(report):
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["group_index", "group_status", "loop", "orientation", "rect_local_xyxy", "reflection", "gx_cycles_per_pixel", "gy_cycles_per_pixel", "valid", "raw_winding", "canonical_winding", "max_phase_step_rad", "minimum_amplitude", "failures"])
    groups = {group["group_index"]: group for group in report.get("loop_groups", [])}
    for loop in report["loops"]:
        group_index = loop.get("group_index")
        group_status = groups[group_index]["status"] if group_index is not None else "legacy_v1_global_summary"
        for row in loop["reflections"]:
            index = row["reflection_index"]
            writer.writerow([group_index, group_status, loop.get("loop_id", str(loop["loop_index"])), loop["orientation"], ":".join(map(str, loop["rect_xyxy"])),
                             index, *report["g_vectors_cycles_per_pixel"][index], row["valid"], row["winding_integer"],
                             row["canonical_winding_integer"], row["maximum_abs_wrapped_step_radians"], row["minimum_path_amplitude"], ";".join(row["failures"])])
    return buffer.getvalue().encode("utf-8")


def _preview(directory, metadata, phase, arrays, size, api):
    # This phase image is presentation only. Coordinates remain the source grid.
    valid = arrays["eligible_phase"][0]
    colors = np.zeros((*phase.shape, 3), dtype=np.uint8)
    colors[..., 0] = np.asarray((phase+np.pi)/(2*np.pi)*255, dtype=np.uint8)
    colors[..., 1:] = 210
    image = Image.fromarray(colors, "HSV").convert("RGB")
    pixels = np.asarray(image).copy()
    pixels[~valid] = [68, 68, 72]
    image = Image.fromarray(pixels)
    available = max(128, size-108)
    ratio = min((size-24)/image.width, available/image.height)
    width, height = max(1, round(image.width*ratio)), max(1, round(image.height*ratio))
    image = image.resize((width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (width+24, height+108), "white")
    canvas.paste(image, (12, 48))
    draw = ImageDraw.Draw(canvas)
    for index, loop in enumerate(metadata["report"]["loops"]):
        x0, y0, x1, y1 = loop["rect_xyxy"]
        color = (0, 230, 255) if index % 2 == 0 else (255, 190, 40)
        coords = [12+(x0+.5)*ratio, 48+(y0+.5)*ratio, 12+(x1-.5)*ratio, 48+(y1-.5)*ratio]
        draw.rectangle(coords, outline=color, width=2)
        draw.text((coords[0]+3, coords[1]+3), "G"+str(loop.get("group_index", 0))+":"+loop.get("loop_id", "L"+str(index)), fill=color, stroke_width=1, stroke_fill="black")
    draw.text((12, 8), "Wrapped geometric phase + explicit circuits", fill="black")
    draw.text((12, 25), "Conditional projected evidence | reflection 0", fill="black")
    status = metadata["report"]["status"]
    draw.text((12, height+54), status, fill="black")
    draw.text((12, height+71), "Gray invalid | not a confirmed material defect", fill="black")
    api.save_png(directory / "preview.png", canvas)
    return {"representation": "wrapped geometric phase of retained reflection0", "phase_range_radians": [-math.pi, math.pi],
            "invalid_color": "gray", "max_size": size, "scientific_values_changed": False}, [
                {"domain": "source_array_indices", "source_object_id": metadata["object_id"],
                 "source_rect_xyxy": [0, 0, phase.shape[1], phase.shape[0]], "image_rect_xyxy": [12, 48, 12+width, 48+height],
                 "limitation": "local spatial FFT-grid circuit coordinates; this display is not raw intensity"}]


def action(workspace, request, metadata, directory, api):
    parameters, size = _parameters(request, api)
    dependency, loaded, first_record = _source_bundle(workspace, parameters["object_ids"], api, load=True)
    history = []
    if request.get("previous_topology_id"):
        old, old_dir = workspace.object(request["previous_topology_id"])
        api.need(old["kind"] == "topology" and old["input_dependency"]["common"]["fft"] == dependency["common"]["fft"],
                 "A topology revision must retain the exact saved source FFT", "TOPOLOGY_SCOPE_MISMATCH")
        history = [*old.get("history", []), _dependency(old, old_dir, api)]
        api.need(len(history) <= 8, "Topology revision history budget is8", "BUDGET_EXCEEDED")
    phase, amplitude, vectors, edge, bands = loaded
    output = core.analyze(phase, amplitude, vectors, parameters["loops"], edge_invalid=edge,
                          amplitude_floor_relative=parameters["amplitude_floor_relative"],
                          calibration_nm_xy=dependency["common"]["calibration_nm_xy"],
                          burgers_candidates=parameters["burgers_candidates"])
    report, arrays = output["report"], output["arrays"]
    for name, array in arrays.items():
        api.save_array(directory, name+".npy", array)
    specs = {}
    for name, array in arrays.items():
        axes = "reflection,y,x" if name == "eligible_phase" else "path_sample,xy" if name == "path_xy" else "loop_boundary" if name == "path_offsets" else "reflection,path_sample" if name.startswith("path_") or name == "wrapped_phase_step_radians" else "loop,reflection"
        specs[name] = {"shape": list(array.shape), "dtype": str(array.dtype), "axes": axes,
                       "unit": "radian" if "phase" in name and array.dtype.kind != "b" else "source band amplitude" if name == "path_amplitude" else "local pixel index" if name == "path_xy" else "concatenated path-sample offset" if name == "path_offsets" else "boolean" if array.dtype.kind == "b" else "cycles; NaN unavailable"}
    metadata.update(object_ids=parameters["object_ids"], parent_object_id=parameters["object_ids"][0],
                    parameters=parameters, input_dependency=dependency, retained_reflections=bands, report=report,
                    dependency_sha256=hashlib.sha256(api.canonical({"input": dependency, "parameters": parameters})).hexdigest(),
                    history=history, array_manifest=specs, shape_yx=report["shape_yx"], axes=["y", "x"],
                    dtype="projected topology path arrays; see array_manifest", array_domain="projected_topology_evidence",
                    xy_calibration=first_record.get("xy_calibration"), calibration_dependency=first_record.get("calibration_dependency"),
                    display_calibration_id=first_record.get("display_calibration_id"),
                    interpretation_status="hypothesized", material_dislocation_confirmed=False, burgers_3d_unique=False,
                    fft_recomputed=False, gpa_recomputed=False, uncertainty=None, source_arrays_modified=False)
    api.write_new(directory / "topology-report.json", api.canonical(report)+b"\n")
    api.write_new(directory / "topology-circuits.csv", _csv(report))
    metadata["display"], metadata["panels"] = _preview(directory, metadata, phase[0], arrays, size, api)
    return metadata


def validate_references(workspace, metadata, api):
    journal = api.read_json(workspace.root / "requests" / (metadata["request_id"]+".json"))
    original = journal.get("parameters", {})
    api.need(original.get("action") == "topology" and original.get("request_id") == metadata["request_id"] and
             original.get("workspace") == str(workspace.root) and set(original) <= FIELDS["topology"] | {"action", "workspace", "request_id"} and
             journal.get("parameters_sha256") == hashlib.sha256(api.canonical(original)).hexdigest(),
             "Topology original request identity or parameters changed", "CORRUPT_OBJECT")
    parameters, _ = _parameters(original, api)
    dependency, _, _ = _source_bundle(workspace, parameters["object_ids"], api)
    api.need(metadata["parameters"] == parameters and metadata["input_dependency"] == dependency and
             metadata["dependency_sha256"] == hashlib.sha256(api.canonical({"input": dependency, "parameters": parameters})).hexdigest(),
             "Topology source/parameters no longer agree with the original request", "CORRUPT_OBJECT")
    api.need(metadata["report"]["algorithm"] in core.SUPPORTED_ALGORITHMS and metadata["report"]["shape_yx"] == dependency["common"]["shape_yx"] and
             metadata["report"]["calibration_nm_xy"] == dependency["common"]["calibration_nm_xy"] and
             metadata["report"]["loop_count"] == len(parameters["loops"]) and
             metadata["report"]["amplitude_floor_relative"] == parameters["amplitude_floor_relative"] and
             metadata["retained_reflections"] == dependency["retained_reflections"] and
             metadata["report"]["g_vectors_cycles_per_pixel"] == [row["g_vector_cycles_per_pixel"] for row in dependency["retained_reflections"]],
             "Topology scientific contract changed", "CORRUPT_OBJECT")
    if metadata["report"]["algorithm"] == core.ALGORITHM_VERSION:
        expected_groups, expected_relations = core.spatial_groups(parameters["loops"], metadata["shape_yx"])
        actual_groups = metadata["report"].get("loop_groups")
        api.need(type(actual_groups) is list and len(actual_groups) == len(expected_groups) and
                 all({key: actual.get(key) for key in ("group_index", "loop_indices", "strictly_nested_loop_pairs")} == expected
                     for actual, expected in zip(actual_groups, expected_groups)),
                 "Topology spatial groups differ from the original circuit geometry", "CORRUPT_OBJECT")
        grouping = metadata["report"].get("grouping", {})
        api.need(grouping.get("policy") == "strict_nesting_components_v1" and
                 grouping.get("group_count") == len(expected_groups) and
                 grouping.get("inter_group_relations") == expected_relations and
                 all(metadata["report"]["loops"][index].get("group_index") == group["group_index"]
                     for group in expected_groups for index in group["loop_indices"]),
                 "Topology grouping/loop assignments changed", "CORRUPT_OBJECT")
        for group in actual_groups:
            members = group["loop_indices"]
            reflections = group.get("reflections", [])
            api.need(len(reflections) == len(metadata["retained_reflections"]),
                     "Topology group has wrong reflection coverage", "CORRUPT_OBJECT")
            for i, reflection in enumerate(reflections):
                valid = [index for index in members if metadata["report"]["loops"][index]["reflections"][i]["valid"]]
                charges = [metadata["report"]["loops"][index]["reflections"][i]["canonical_winding_integer"] for index in valid]
                pairs = [pair for pair in group["strictly_nested_loop_pairs"] if all(index in valid for index in pair)]
                api.need(reflection.get("reflection_index") == i and reflection.get("valid_loop_indices") == valid and
                         reflection.get("canonical_winding_integers") == charges and
                         reflection.get("strictly_nested_valid_loop_pairs") == pairs,
                         "Topology group summaries refer to other circuits", "CORRUPT_OBJECT")
        if len(expected_groups) > 1:
            api.need(metadata["report"].get("projected_burgers") is None and
                     metadata["report"].get("reflections") == [] and metadata["report"].get("burgers_candidates") == [] and
                     metadata["report"].get("status") == "spatially_grouped_evidence",
                     "Separate topology groups cannot share a global closure fit", "CORRUPT_OBJECT")
    api.need(len(metadata.get("history", [])) <= 8, "Topology history budget exceeded", "CORRUPT_OBJECT")
    expected_history = []
    if original.get("previous_topology_id"):
        old, old_dir = workspace.object(original["previous_topology_id"])
        api.need(old["kind"] == "topology" and old["input_dependency"]["common"]["fft"] == dependency["common"]["fft"],
                 "Original topology revision changed its FFT", "CORRUPT_OBJECT")
        expected_history = [*old.get("history", []), _dependency(old, old_dir, api)]
    api.need(metadata.get("history", []) == expected_history, "Topology revision ancestry differs from original request", "CORRUPT_OBJECT")
    for old in metadata.get("history", []):
        api.need(type(old.get("object_id")) is str and api.OBJECT_ID.fullmatch(old["object_id"]), "Invalid historical topology identity", "CORRUPT_OBJECT")
        file = workspace.root / "objects" / old["object_id"] / "object.json"
        api.need(file.is_file() and not file.is_symlink() and api.sha_file(file) == old["manifest_sha256"], "Historical topology manifest changed", "CORRUPT_OBJECT")
