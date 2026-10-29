"""Sourced sequence references and bounded, non-deforming region correspondence.

These records use the image provider's existing journals. Arrays remain in their
original immutable frame objects; a correspondence is evidence, not a resample.
"""
import math

import numpy as np
from scipy.ndimage import maximum_filter

try:
    from . import image_automation as automation
    from . import image_calibration as calibration
except ImportError:
    import image_automation as automation
    import image_calibration as calibration


FIELDS = {
    "sequence_create": {"frames", "axis"},
    "region_correspondence": {"sequence_object_id", "reference_index", "rect", "mode",
                              "source_text", "translations", "max_shift", "min_correlation", "min_margin"},
}
MEANINGS = {"time", "reconstruction_depth", "defocus", "tilt", "iteration", "repeat", "unknown"}
STATUSES = {"VERIFIED", "UNVERIFIED", "AMBIGUOUS", "OUT_OF_VIEW", "INCOMPATIBLE", "UNMATCHED"}
MAX_ESTIMATION_PIXELS = 262144


def _text(value, name, api, required=True):
    if value is None and not required:
        return None
    api.need(type(value) is str and 1 <= len(value.strip()) <= 2000,
             name + " requires an explicit nonempty source statement (maximum2000 characters)")
    return value.strip()


def _axis(value, api):
    api.need(type(value) is dict and set(value) <= {"meaning", "source_text", "step", "unit"},
             "axis requires meaning, source_text and optional paired step/unit")
    api.need(value.get("meaning") in MEANINGS, "Unsupported explicit sequence axis meaning")
    result = {"meaning": value["meaning"], "source_text": _text(value.get("source_text"), "axis.source_text", api),
              "source": "user_statement_not_independently_verified", "step": None, "unit": None,
              "absolute_origin": None, "axial_resolution": None,
              "interpretation": "ordered observations; step is supplied nominal separation, not verified resolution or continuity"}
    api.need(("step" in value) == ("unit" in value), "axis.step and axis.unit must be supplied together")
    if "step" in value:
        api.need(api.number(value["step"]) and value["step"] != 0, "axis.step must be finite and nonzero")
        api.need(type(value["unit"]) is str and 1 <= len(value["unit"].strip()) <= 32, "axis.unit must be explicit")
        result.update(step=value["step"], unit=value["unit"].strip())
    return result


def frame_record(workspace, selected, index, label, api):
    parent, context, values = automation.source_frame(workspace, {"object_id": selected}, api)
    selected_metadata, selected_directory = workspace.object(selected)
    frame_metadata, frame_directory = workspace.object(parent["object_id"])
    # Selected calibration wrappers may differ, but cannot create a second frame
    # identity for the same immutable array in one sequence.
    record = {"frame_index": index, "selected_object_id": selected,
              "frame_object_id": parent["object_id"], "label": label,
              "source_frame_index": parent.get("frame_index"),
              "source_object_id": parent.get("source_object_id"),
              "source_identity": parent.get("source_identity"),
              "source_capture_path": parent.get("source_capture_path"),
              "source_capture_files_sha256": parent.get("source_capture_files_sha256"),
              "dm_dataset_index": parent.get("dm_dataset_index"), "dm_plane_selection": parent.get("dm_plane_selection"),
              "shape_yx": list(values.shape), "dtype": str(values.dtype),
              "array_sha256": frame_metadata["files_sha256"]["data.npy"],
              "selected_manifest_sha256": api.sha_file(selected_directory / "object.json"),
              "frame_manifest_sha256": api.sha_file(frame_directory / "object.json"),
              "selected_request_id": selected_metadata["request_id"],
              "xy_calibration": parent.get("xy_calibration"),
              "calibration_dependency": calibration.dependency(parent.get("xy_calibration")),
              "array_domain": parent.get("array_domain"), "user_context": context,
              "grid": {"axis_order": ["y", "x"], "coordinate_space": "selected_frame_pixels",
                       "rectangle_convention": "half-open [x0,y0,x1,y1]",
                       "signed_xy_scale": (parent.get("xy_calibration") or {}).get("xy_scale"),
                       "physical_pixel_zero_xy": (parent.get("xy_calibration") or {}).get("physical_zero_xy"),
                       "raw_native_calibration": (parent.get("xy_calibration") or {}).get("raw_native_calibration"),
                       "native_axes": (parent.get("xy_calibration") or {}).get("native_axes"),
                       "dm_file_axes": (parent.get("xy_calibration") or {}).get("dm_file_axes")}}
    return record, values


def _sequence_rows(workspace, frames, api):
    api.need(type(frames) is list and 2 <= len(frames) <= 8, "Supply2..8 explicitly ordered real frame references")
    rows, seen = [], set()
    for index, entry in enumerate(frames):
        api.need(type(entry) is dict and set(entry) <= {"object_id", "label"} and "object_id" in entry,
                 "Each sequence frame requires object_id and optional label")
        label = entry.get("label", "Frame %d" % (index + 1))
        api.need(type(label) is str and 1 <= len(label.strip()) <= 120, "Frame labels require1..120 characters")
        row, _ = frame_record(workspace, entry["object_id"], index, label.strip(), api)
        api.need(row["frame_object_id"] not in seen, "A sequence cannot repeat the same scientific frame under different wrappers")
        seen.add(row["frame_object_id"])
        rows.append(row)
    return rows


def calibration_comparability(reference, target):
    left = calibration.active_scale(reference.get("xy_calibration"))
    right = calibration.active_scale(target.get("xy_calibration"))
    if left is None and right is None:
        return {"compatible": True, "domain": "pixel_only", "reason": "No active physical scales; only pixel-grid geometry is comparable"}
    if left is None or right is None:
        return {"compatible": False, "domain": "mixed", "reason": "Only one frame has an active physical XY scale"}
    normalized = []
    for scale in (left, right):
        parsed = calibration.unit_kind(scale.get("unit"))
        if parsed is None or parsed[0] != "real_space":
            return {"compatible": False, "domain": "unknown", "reason": "Unsupported or non-spatial calibration"}
        normalized.append([scale[axis] * calibration.UNITS[parsed[1]] for axis in ("x", "y")])
    equal = all(math.isclose(a, b, rel_tol=1e-12, abs_tol=0) for a, b in zip(*normalized))
    origins = []
    for frame, scale in ((reference, left), (target, right)):
        zero = (frame.get("xy_calibration") or {}).get("physical_zero_xy")
        origins.append([v * calibration.UNITS[calibration.unit_kind(scale["unit"])[1]] for v in zero]
                       if type(zero) is list and len(zero) == 2 and all(calibration.finite(v) for v in zero) else None)
    origin_relation = ("same" if all(math.isclose(a, b, rel_tol=1e-12, abs_tol=0) for a, b in zip(*origins)) else "different") if all(v is not None for v in origins) else "unknown"
    return {"compatible": equal, "domain": "real_space", "signed_xy_metres_per_pixel": normalized,
            "physical_pixel_zero_metres": origins, "origin_relation": origin_relation,
            "comparison_scope": "sampling scale; registered features do not establish the same absolute physical coordinate",
            "reason": "Signed XY scales agree after explicit unit conversion" if equal else "Signed XY scale or aspect ratio differs; no rescaling/mirroring is inferred"}


def _inside(rect, shape):
    x0, y0, x1, y1 = rect
    return 0 <= x0 < x1 <= shape[1] and 0 <= y0 < y1 <= shape[0]


def estimate_translation(reference_values, target_values, rect, max_shift, minimum, margin, api):
    """Bounded integer normalized cross-correlation via SciPy, no interpolation.

    Multiple separated local maxima are retained. Equal periodic matches do not
    become a unique displacement merely because one occurs first in an array.
    """
    # Most worker calls only inspect saved data. Do not import the signal stack
    # afresh for every Panel ancestry lookup; estimation alone requires it.
    from scipy import signal

    x0, y0, x1, y1 = rect
    height, width = y1-y0, x1-x0
    api.need(height * width <= MAX_ESTIMATION_PIXELS,
             "Translation estimation template exceeds262144 pixels; select a bounded reference ROI", "BUDGET_EXCEEDED")
    tx0, ty0 = max(0, x0-max_shift), max(0, y0-max_shift)
    tx1 = min(target_values.shape[1]-width, x0+max_shift)
    ty1 = min(target_values.shape[0]-height, y0+max_shift)
    if tx1 < tx0 or ty1 < ty0:
        return {"status": "OUT_OF_VIEW", "reason": "No complete target ROI fits within the bounded search", "candidates": []}
    template = reference_values[y0:y1, x0:x1].astype(np.float64)
    # NCC is invariant to a positive scalar factor. Normalize before summing so
    # finite float64 science near its range limit does not overflow reductions.
    template_scale = float(np.max(np.abs(template)))
    if template_scale:
        template /= template_scale
    template -= template.mean()
    template_power = float(np.sum(template * template))
    if not math.isfinite(template_power) or template_power <= 0:
        return {"status": "AMBIGUOUS", "reason": "Constant/zero-contrast reference has no unique translation evidence", "candidates": []}
    region = target_values[ty0:ty1+height, tx0:tx1+width].astype(np.float64)
    region_scale = float(np.max(np.abs(region)))
    if region_scale:
        region /= region_scale
    region -= region.mean()
    kernel = np.ones((height, width), dtype=np.float64)
    sums = signal.correlate(region, kernel, mode="valid", method="auto")
    powers = signal.correlate(region * region, kernel, mode="valid", method="auto") - sums*sums/template.size
    cross = signal.correlate(region, template, mode="valid", method="auto")
    denominator = np.sqrt(np.maximum(powers, 0) * template_power)
    scores = np.full(cross.shape, -np.inf)
    np.divide(cross, denominator, out=scores, where=denominator > 0)
    finite = np.isfinite(scores)
    if not finite.any():
        return {"status": "UNMATCHED", "reason": "Target search has no finite nonconstant match", "candidates": []}
    scores[finite] = np.clip(scores[finite], -1, 1)
    maxima = finite & (scores == maximum_filter(scores, size=3, mode="constant", cval=-np.inf))
    candidates = sorted([(float(scores[y,x]), int(x), int(y)) for y, x in np.argwhere(maxima)],
                        key=lambda row: (-row[0], row[2], row[1]))
    separated = []
    for score, x, y in candidates:
        if all(max(abs(x-old[1]), abs(y-old[2])) > 1 for old in separated):
            separated.append((score, x, y))
        if len(separated) >= 8:
            break
    top = separated[0]
    result = {"candidates": [{"shift_xy": [x+tx0-x0, y+ty0-y0], "correlation": score}
                             for score, x, y in separated],
              "score": top[0], "runner_up_score": separated[1][0] if len(separated) > 1 else None,
              "score_margin": top[0]-separated[1][0] if len(separated) > 1 else None,
              "minimum_correlation": minimum, "minimum_margin": margin,
              "search_displacement_xy": [[tx0-x0, tx1-x0], [ty0-y0, ty1-y0]],
              "sampling": "integer pixel translation only; no interpolation, warping or source mutation"}
    if top[0] < minimum:
        result.update(status="UNMATCHED", reason="No bounded candidate meets the declared correlation threshold")
    elif len(separated) > 1 and top[0]-separated[1][0] < margin:
        result.update(status="AMBIGUOUS", reason="Competing separated correlation maxima; periodic texture is not unique registration evidence")
    else:
        shift = [top[1]+tx0-x0, top[2]+ty0-y0]
        result.update(status="VERIFIED", shift_xy=shift,
                      reason="Unique bounded numerical translation under declared thresholds; this is not proof of physical continuity",
                      at_search_boundary=any(abs(v) == max_shift for v in shift))
    return result


def _correspondence(workspace, request, api):
    sequence, _ = workspace.object(request.get("sequence_object_id"))
    api.need(sequence["kind"] == "sequence_create", "Select a saved image_sequence_create reference")
    count = len(sequence["frames"])
    index = request.get("reference_index")
    api.need(api.integer(index, 0, count-1), "reference_index must select the explicit sequence order (zero-based)")
    reference = sequence["frames"][index]
    ref_meta, ref_values = frame_record(workspace, reference["selected_object_id"], index, reference["label"], api)
    rect = api.rectangle(request.get("rect"), ref_values.shape)
    mode = request.get("mode")
    api.need(mode in ("identity", "translation", "estimate"), "Explicit identity, translation or estimate mode required")
    source = _text(request.get("source_text"), "source_text", api, required=False)
    maximum, minimum, margin = request.get("max_shift", 8), request.get("min_correlation", .9), request.get("min_margin", .03)
    api.need(api.integer(maximum, 1, 32), "max_shift must be an integer1..32")
    api.need(api.number(minimum) and 0 < minimum <= 1 and api.number(margin) and 0 < margin <= 1,
             "min_correlation and min_margin must be explicit finite values in(0,1]")
    translations = request.get("translations", [])
    api.need(type(translations) is list and len(translations) <= count-1, "translations must contain at most one entry per non-reference frame")
    api.need(mode == "translation" or not translations, "translations are only valid in translation mode")
    shifts = {}
    for row in translations:
        api.need(type(row) is dict and set(row) == {"frame_index", "shift_xy"}, "Translation entries require frame_index and shift_xy")
        target_index, shift = row["frame_index"], row["shift_xy"]
        api.need(api.integer(target_index, 0, count-1) and target_index != index and target_index not in shifts,
                 "Translation indices must be distinct non-reference sequence frames")
        api.need(type(shift) is list and len(shift) == 2 and all(api.integer(v, -4096, 4096) for v in shift),
                 "shift_xy requires two integer pixel displacements within4096; fractional mapping needs a separately qualified resampling operation")
        shifts[target_index] = shift
    rows = []
    for target in sequence["frames"]:
        target_index = target["frame_index"]
        row = {"frame_index": target_index, "selected_object_id": target["selected_object_id"],
               "frame_object_id": target["frame_object_id"], "label": target["label"],
               "reference_rect": rect, "target_rect": None, "shift_xy": None, "method": mode,
               "basis": {"source": "user_statement_not_independently_verified" if mode != "estimate" else "bounded_numerical_estimate",
                         "source_text": source}, "calibration_comparability": calibration_comparability(reference, target)}
        if target_index == index:
            row.update(status="VERIFIED", target_rect=rect, shift_xy=[0,0], method="reference_identity",
                       reason="Exact saved reference frame; no cross-frame inference")
        elif not row["calibration_comparability"]["compatible"]:
            row.update(status="INCOMPATIBLE", reason=row["calibration_comparability"]["reason"])
        elif mode == "identity" and row["calibration_comparability"].get("origin_relation") == "different":
            row.update(status="INCOMPATIBLE", reason="Known physical pixel-zero coordinates differ; an identity-grid statement cannot override that evidence")
        elif mode in ("identity", "translation") and not source:
            row.update(status="UNVERIFIED", reason="An explicit shared-grid/translation source is required; same shape or coordinates do not establish correspondence")
        elif mode == "translation" and target_index not in shifts:
            row.update(status="UNVERIFIED", reason="No explicitly sourced translation for this frame")
        else:
            if mode == "estimate":
                _, values = frame_record(workspace, target["selected_object_id"], target_index, target["label"], api)
                row.update(estimate_translation(ref_values, values, rect, maximum, minimum, margin, api))
            else:
                row.update(status="VERIFIED", shift_xy=shifts[target_index] if mode == "translation" else [0,0],
                           reason="Coordinate correspondence under explicit supplied grid/translation statement; not independent physical verification")
            if row["status"] == "VERIFIED":
                dx, dy = row["shift_xy"]
                mapped = [rect[0]+dx, rect[1]+dy, rect[2]+dx, rect[3]+dy]
                if _inside(mapped, target["shape_yx"]):
                    row["target_rect"] = mapped
                else:
                    row.update(status="OUT_OF_VIEW", requested_target_rect=mapped,
                               reason="Mapped full ROI leaves the target frame; no clipping or successful crop is reported")
        rows.append(row)
    return sequence, rect, rows


def validate_references(workspace, metadata, api):
    active = getattr(workspace, "_sequence_validation_active", set())
    api.need(metadata["object_id"] not in active and len(active) < 16,
             "Sequence dependency cycle or depth exceeded", "CORRUPT_OBJECT")
    workspace._sequence_validation_active = active
    active.add(metadata["object_id"])
    try:
        request = automation._saved_parameters(workspace, metadata, api)
        api.need(request.get("action") == metadata["kind"], "Sequence request action changed", "CORRUPT_OBJECT")
        if metadata["kind"] == "sequence_create":
            api.need(metadata.get("axis") == _axis(request.get("axis"), api) and
                     metadata.get("frames") == _sequence_rows(workspace, request.get("frames"), api),
                     "Sequence frame identity, source, array, grid or calibration no longer matches its original records", "CORRUPT_OBJECT")
        else:
            sequence, directory = workspace.object(request["sequence_object_id"])
            api.need(sequence["kind"] == "sequence_create" and metadata.get("sequence_object_id") == sequence["object_id"] and
                     metadata.get("sequence_manifest_sha256") == api.sha_file(directory / "object.json") and
                     metadata.get("reference_index") == request.get("reference_index") and
                     metadata.get("reference_rect") == request.get("rect") and metadata.get("mode") == request.get("mode") and
                     metadata.get("sequence_axis") == sequence["axis"],
                     "Correspondence sequence/parameters changed", "CORRUPT_OBJECT")
            rows = metadata.get("rows")
            api.need(type(rows) is list and len(rows) == len(sequence["frames"]), "Invalid correspondence row set", "CORRUPT_OBJECT")
            for index, (row, source) in enumerate(zip(rows, sequence["frames"])):
                api.need(row.get("frame_index") == index and row.get("selected_object_id") == source["selected_object_id"] and
                         row.get("frame_object_id") == source["frame_object_id"] and row.get("status") in STATUSES and
                         row.get("reference_rect") == metadata["reference_rect"] and
                         row.get("calibration_comparability") == calibration_comparability(sequence["frames"][request["reference_index"]], source),
                         "Correspondence row identity/calibration changed", "CORRUPT_OBJECT")
                if row["status"] == "VERIFIED":
                    dx, dy = row["shift_xy"]
                    r = metadata["reference_rect"]
                    api.need(row["target_rect"] == [r[0]+dx,r[1]+dy,r[2]+dx,r[3]+dy] and _inside(row["target_rect"],source["shape_yx"]),
                             "Verified correspondence has an invalid source-coordinate mapping", "CORRUPT_OBJECT")
                else:
                    api.need(row.get("target_rect") is None, "Unverified correspondence cannot publish a successful target ROI", "CORRUPT_OBJECT")
    finally:
        active.remove(metadata["object_id"])


def action(workspace, name, request, metadata, directory, api):
    if name == "sequence_create":
        axis = _axis(request.get("axis"), api)
        rows = _sequence_rows(workspace, request.get("frames"), api)
        metadata.update(frames=rows, axis=axis, frame_count=len(rows),
                        source_data_changed=False, scientific_arrays_copied=False,
                        shared_grid_assumed=False,
                        limitations=["Sequence order is explicit, not inferred from filenames or image labels",
                                     "Reconstruction depth step is not independently established axial resolution",
                                     "Adjacent observations are not independent confidence samples"])
    elif name == "region_correspondence":
        sequence, rect, rows = _correspondence(workspace, request, api)
        _, sequence_directory = workspace.object(sequence["object_id"])
        metadata.update(sequence_object_id=sequence["object_id"], sequence_manifest_sha256=api.sha_file(sequence_directory / "object.json"),
                        reference_index=request["reference_index"], reference_rect=rect, mode=request["mode"],
                        sequence_axis=sequence["axis"], rows=rows,
                        source_data_changed=False, resampling_performed=False,
                        correspondence_scope="integer coordinate mapping under explicit supplied or bounded numerical evidence; no phase/continuity claim",
                        limitations=["A supplied identity/translation is user-stated, not independently verified physical registration",
                                     "NCC is bounded template agreement; local true changes can make a region unmatched",
                                     "Competing maxima remain ambiguous; no arbitrary lattice-period choice",
                                     "No deformation, scale fitting, averaging or physical depth inference"])
    else:
        api.need(False, "Unsupported sequence action")
    api.write_new(directory / "sequence-evidence.json", api.canonical(metadata) + b"\n")
    return metadata
