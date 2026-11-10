"""Append-only candidate marks on the existing immutable annotation pathway."""
import copy
import json
import math

if __package__:
    from . import image_column_candidates as detector
    from . import image_numeric as numeric
else:
    import image_column_candidates as detector
    import image_numeric as numeric

FIELDS = {"column_candidates": {"object_id", "rect", "min_distance", "threshold_rel", "smooth_sigma", "prominence_rel", "modality", "source_text"}}
NOTE_PREFIX = "HAADF candidate v1: "


def append(workspace, request, ident, parent, api):
    api.need(request.get("modality") == "haadf", "Explicit haadf declaration required; this detector does not infer image modality")
    source_text = request.get("source_text")
    api.need(type(source_text) is str and 1 <= len(source_text.strip()) <= 2000,
             "Provide the source of the clear HAADF channel declaration")
    operand = numeric.NumericReader().operand(workspace, {"object_id": request["object_id"]})
    api.need(not operand["spectral"] and operand["coordinate_space"] == "source_pixels" and operand["values"].dtype.kind != "c",
             "Column candidates require one real spatial scalar plane, not FFT/reciprocal/complex data")
    rect = request.get("rect")
    bounds = operand["bounds"]
    api.need(type(rect) is list and len(rect) == 4 and all(api.number(v) for v in rect), "Explicit finite ROI required")
    api.need(bounds[0] <= rect[0] < rect[2] <= bounds[2] and bounds[1] <= rect[1] < rect[3] <= bounds[3],
             "ROI must be inside the exact visible source support; no clipping")
    parameters = {key: request[key] for key in ("min_distance", "threshold_rel", "smooth_sigma", "prominence_rel") if key in request}
    # Saved cropped views carry array-local NPY pixels but absolute source bounds.
    origin = bounds[:2]
    local_rect = [rect[i] - origin[i % 2] for i in range(4)]
    result = detector.detect(operand["values"], local_rect, **parameters)
    for candidate in result["candidates"]:
        candidate["x"] += origin[0]
        candidate["y"] += origin[1]
    provenance = result["provenance"]
    provenance["array_origin_source_xy"] = list(origin)
    provenance["detector_array_rect_xyxy"] = provenance["source_rect_xyxy"]
    provenance["requested_rect_xyxy"] = list(rect)
    provenance["source_rect_xyxy"] = [value + origin[i % 2] for i, value in enumerate(provenance["source_rect_xyxy"])]
    provenance["coordinate_convention"] = "source_pixel_centers_xy; saved array origin explicitly restored"

    source = operand["scientific_grid_identity"]["source_grid_object_id"]
    originals = parent.get("annotations", [])
    annotations, protected = [], []
    # Reproject only established source anchors; never copy rendered pixels.
    for mark in originals:
        copied = {key: copy.deepcopy(mark[key]) for key in ("kind", "text", "status", "note", "annotation_id", "line_width", "arrowhead_size", "arrow_length", "color", "presentation", "purpose", "selection_origin") if key in mark}
        api.need(mark.get("anchor") is not None, "Existing mark has no source anchor; retain it and resolve its mapping before detection")
        copied.update(copy.deepcopy(mark["anchor"]))
        annotations.append(copied)
        if copied["kind"] == "point" and copied.get("source_object_id") == source and copied.get("coordinate_space") == "source_pixels":
            protected.append(copied["coordinates"])
            note = copied.get("note", "")
            if note.startswith(NOTE_PREFIX):
                try:
                    initial = json.loads(note[len(NOTE_PREFIX):])["original_xy"]
                    if type(initial) is list and len(initial) == 2 and all(api.number(v) for v in initial):
                        protected.append(initial)
                except (ValueError, KeyError, TypeError):
                    pass
    distance = float(request.get("min_distance", 3.0))
    added, suppressed = [], []
    for index, candidate in enumerate(result["candidates"]):
        xy = [candidate["x"], candidate["y"]]
        if any(math.dist(xy, previous) <= distance for previous in protected):
            suppressed.append(candidate["id"])
            continue
        annotation_id = "cc_" + ident + "_" + str(index)
        annotation = dict(kind="point", coordinates=xy, coordinate_space="source_pixels", source_object_id=source,
            annotation_id=annotation_id, text="", color="amber", status="hypothesized",
            note=NOTE_PREFIX + json.dumps({"detection_object_id": ident, "candidate_id": candidate["id"], "original_xy": xy}, separators=(",", ":")))
        annotations.append(annotation)
        added.append(annotation_id)
    api.need(len(annotations) <= 128,
             "Candidate marks exceed the existing 128-mark workspace budget. Use a smaller ROI or higher threshold; nothing was truncated or replaced.", "BUDGET_EXCEEDED")
    result.update(scientific_grid_identity=operand["scientific_grid_identity"], input_object_id=request["object_id"],
        modality_declaration=dict(modality="haadf", source_text=source_text, independently_verified=False),
        annotation_application=dict(policy="append_only_preserve_all_prior_marks_v1", new_annotation_ids=added,
            retained_annotation_count=len(originals), suppressed_candidate_ids=suppressed,
            reason="Existing point positions, original detected positions and retractions protect manual corrections within min_distance; no replacement or resurrection",
            mark_budget=128),
        scientific_data_changed=False, physical_column_count_established=False)
    return annotations, result
