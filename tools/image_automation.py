"""Bounded composition of existing image operations; no alternate science engine.

All parents and children use image_workspace's authoritative immutable journal.
The deterministic child IDs permit inspection after a partial/interrupted batch;
an incomplete parent is never replayed by query or silently resumed.
"""
import hashlib
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


FIELDS = {
    "roi_propose": {"object_id", "window_sizes", "max_regions", "max_size"},
    "fft_batch": {"object_id", "rects", "window", "subtract_mean", "max_size", "previous_batch_id"},
    "peak_measurements": {"object_id", "peak_ids", "max_peaks"},
}


def child_request_id(parent_id, label):
    return "auto-" + hashlib.sha256((parent_id + ":" + label).encode()).hexdigest()[:48]


def run_child(workspace, request, label, action, **parameters):
    # Import the module already executing the journal (also works for CLI __main__).
    import sys
    module = sys.modules.get("tools.image_workspace") or sys.modules.get("image_workspace")
    if module is None:
        module = sys.modules["__main__"]
    request_id = child_request_id(request["request_id"], label)
    result = module._execute(dict(action=action, workspace=str(workspace.root),
                                  request_id=request_id, **parameters))
    module.need(result.get("ok"), "Batch child %s did not complete: %s. Query original child ID; do not replay unknown work" %
                (request_id, result.get("error")), "BATCH_CHILD_FAILED")
    return result


def source_frame(workspace, request, api):
    parent, _, context, values = workspace.scalar(request["object_id"])
    api.need(parent["kind"] == "frame", "Automation requires an explicit full frame (or its calibration/context wrapper); use image_frame before proposing source-pixel regions")
    api.need(parent.get("array_domain") not in ("frequency", "reciprocal") and values.dtype.kind != "c",
             "ROI/FFT automation accepts spatial real-valued frames only; complex and diffraction-image modes are not substituted", "UNSUPPORTED_OPERATION")
    api.need(np.isfinite(values).all(), "Source contains nonfinite values")
    return parent, context, values


def context_record(parent, context):
    return {"frame_object_id": parent["object_id"], "source_identity": parent.get("source_identity"),
            "source_object_id": parent.get("source_object_id"), "frame_index": parent.get("frame_index"),
            "frame_axis_role": parent.get("frame_axis_role"), "source_capture_path": parent.get("source_capture_path"),
            "source_capture_files_sha256": parent.get("source_capture_files_sha256"),
            "dm_dataset_index": parent.get("dm_dataset_index"), "dm_plane_selection": parent.get("dm_plane_selection"),
            "shape_yx": parent["shape_yx"], "dtype": parent["dtype"],
            "array_domain": parent.get("array_domain"), "xy_calibration": parent.get("xy_calibration"),
            "user_context": context, "coordinate_space": "selected_frame_pixels",
            "rect_convention": "half-open [x0,y0,x1,y1] in the explicitly selected frame"}


def _saved_parameters(workspace, metadata, api):
    journal = api.read_json(workspace.root / "requests" / (metadata["request_id"] + ".json"))
    parameters = journal.get("parameters")
    api.need(type(parameters) is dict and parameters.get("request_id") == metadata["request_id"] and
             parameters.get("workspace") == str(workspace.root) and
             journal.get("parameters_sha256") == hashlib.sha256(api.canonical(parameters)).hexdigest(),
             "Automation dependency original request parameters changed", "CORRUPT_OBJECT")
    return parameters


def validate_references(workspace, metadata, api):
    """Reopen current dependencies, not merely a contact sheet's own PNG hash.

    Called by Workspace.object for aggregate records. History is not recursively
    expanded: a reused FFT is checked directly against its original request.
    """
    active = getattr(workspace, "_automation_validation_active", set())
    api.need(metadata["object_id"] not in active and len(active) < 16,
             "Automation dependency cycle or depth exceeded", "CORRUPT_OBJECT")
    workspace._automation_validation_active = active
    active.add(metadata["object_id"])
    try:
        parameters = _saved_parameters(workspace, metadata, api)
        name = metadata["kind"]
        api.need(parameters.get("action") == name and parameters.get("object_id") == metadata.get("parent_object_id"),
                 "Automation aggregate differs from its original operation/input", "CORRUPT_OBJECT")
        selected = parameters["object_id"]

        def checked(ident, action, expected, label=None):
            child, _ = workspace.object(ident)
            original = _saved_parameters(workspace, child, api)
            api.need(original.get("action") == action and all(original.get(k) == v for k, v in expected.items()) and
                     (label is None or child["request_id"] == child_request_id(metadata["request_id"], label)),
                     "Automation child identity/parameters do not match aggregate", "CORRUPT_OBJECT")
            return child

        if name in ("roi_propose", "fft_batch"):
            parent, _, context = workspace.resolved(selected)
            api.need(parent["kind"] == "frame" and metadata.get("source_context") == context_record(parent, context),
                     "Automation source/frame/calibration context changed", "CORRUPT_OBJECT")
            rows = metadata.get("regions")
            api.need(type(rows) is list and 1 <= len(rows) <= 8, "Invalid aggregate region table", "CORRUPT_OBJECT")
            rects = [row["rect"] for row in rows]
            shown = checked(metadata["overview_object_id"], "annotate", {}, "context-regions")
            view = checked(shown["render_base_object_id"], "view", {"object_id": selected}, "context-view")
            api.need(shown["parent_object_id"] == view["object_id"] and
                     [mark["anchor"]["coordinates"] for mark in shown["annotations"]] == rects and
                     all(mark["anchor"]["source_object_id"] == parent["object_id"] and
                         mark["anchor"]["coordinate_space"] == "source_pixels" for mark in shown["annotations"]),
                     "Automation ROI overview does not represent its saved source coordinates", "CORRUPT_OBJECT")
            if name == "fft_batch":
                fft_parameters = {"window": parameters.get("window", "hann"), "subtract_mean": parameters.get("subtract_mean", True)}
                api.need(rects == parameters.get("rects") and metadata.get("fft_parameters") == fft_parameters,
                         "Aggregate FFT regions/settings differ from submitted parameters", "CORRUPT_OBJECT")
                for i, row in enumerate(rows):
                    roi = checked(row["roi_object_id"], "view", {"object_id": selected, "rect": row["rect"]}, "roi-%d" % i)
                    fft = checked(row["fft_object_id"], "fft", {"object_id": selected, "rect": row["rect"], **fft_parameters},
                                  None if row.get("fft_reused") else "fft-%d" % i)
                    x0, y0, x1, y1 = row["rect"]
                    api.need(row["fft_request_id"] == fft["request_id"] and row["dtype"] == fft["dtype"] == "complex128" and
                             row["shape_yx"] == fft["shape_yx"] == [y1-y0, x1-x0] and
                             roi.get("source_rect_xyxy") == fft.get("source_rect_xyxy") == row["rect"] and
                             fft.get("xy_calibration") == parent.get("xy_calibration"),
                             "Aggregate FFT grid/calibration/receipt differs from child", "CORRUPT_OBJECT")
        elif name == "peak_measurements":
            peaks, _ = workspace.object(selected)
            table = peaks.get("peak_table")
            api.need(type(table) is list, "Peak measurement input is no longer a saved peak table", "CORRUPT_OBJECT")
            selected_ids = parameters.get("peak_ids")
            selected_rows = ([next((row for row in table if row["peak_id"] == ident), None) for ident in selected_ids]
                             if selected_ids is not None else table[:parameters.get("max_peaks", 8)])
            rows = metadata.get("measurements")
            api.need(type(rows) is list and len(rows) == len(selected_rows), "Saved peak measurement selection changed", "CORRUPT_OBJECT")
            for i, (row, peak) in enumerate(zip(rows, selected_rows)):
                api.need(peak is not None and row["peak_id"] == peak["peak_id"], "Saved peak identity changed", "CORRUPT_OBJECT")
                measured = checked(row["measurement_object_id"], "measure",
                                   {"object_id": selected, "coordinate_space": "frequency_cycles_per_pixel",
                                    "points": [[0, 0], peak["frequency_cycles_per_pixel"]]}, "measure-%d" % i)
                workspace.committed_measurement(measured["object_id"])
                api.need(row["measurement_request_id"] == measured["request_id"] and row["manifest_path"] == measured["manifest_path"] and
                         row["frequency_cycles_per_pixel"] == peak["frequency_cycles_per_pixel"] and
                         all(row.get(key) == measured.get(key) for key in ("pixel_period", "d_spacing", "d_spacing_unit")),
                         "Saved peak geometry/receipt differs from committed measurement", "CORRUPT_OBJECT")
            if rows:
                checked(metadata["view_object_id"], "annotate", {"object_id": selected}, "measured-view")
            else:
                api.need(metadata["view_object_id"] == selected, "Empty measurement batch changed its view", "CORRUPT_OBJECT")
    finally:
        active.remove(metadata["object_id"])


def overview(workspace, request, rects, api):
    view = run_child(workspace, request, "context-view", "view", object_id=request["object_id"],
                     max_size=request.get("max_size", 512))
    marks = [{"annotation_id": "region-%d" % (i + 1), "kind": "rectangle",
              "source_object_id": view["panels"][0]["source_object_id"],
              "coordinate_space": "source_pixels", "coordinates": rect,
              "text": "R%d" % (i + 1), "status": "hypothesized", "color": "cyan"}
             for i, rect in enumerate(rects)]
    return run_child(workspace, request, "context-regions", "annotate", object_id=view["object_id"], annotations=marks)


def contact_sheet(directory, records, api):
    width, tile = 768, 256
    canvas = Image.new("RGB", (width, tile * math.ceil(len(records) / 3)), "#181c22")
    draw = ImageDraw.Draw(canvas)
    for i, (title, record) in enumerate(records):
        x, y = (i % 3) * tile, (i // 3) * tile
        with Image.open(record["image_path"]) as original:
            rendered = original.convert("RGB")
            rendered.thumbnail((tile - 8, tile - 26))
            canvas.paste(rendered, (x + (tile-rendered.width)//2, y+23))
        draw.text((x+5, y+5), title, fill="white")
    api.save_png(directory / "preview.png", canvas)


def action(workspace, name, request, metadata, directory, api):
    if name == "roi_propose":
        parent, context, values = source_frame(workspace, request, api)
        h, w = values.shape
        bound = min(h, w)
        api.need(bound >= 8, "ROI proposals require at least an 8 by 8 frame")
        sizes = request.get("window_sizes", sorted(set([max(8, bound//2), max(8, 3*bound//4)])))
        api.need(type(sizes) is list and 1 <= len(sizes) <= 4 and all(api.integer(s, 8, bound) for s in sizes)
                 and len(set(sizes)) == len(sizes), "window_sizes must be 1..4 distinct integer square widths within the selected frame")
        count = request.get("max_regions", 6)
        api.need(api.integer(count, len(sizes), 8), "max_regions must cover each requested scale and be at most8")
        # Nine deterministic coverage positions per scale, ranked only by raw
        # population variance. This is a proposal heuristic, not domain segmentation.
        by_scale = []
        for size in sizes:
            candidates = []
            for y in sorted(set([0, (h-size)//2, h-size])):
                for x in sorted(set([0, (w-size)//2, w-size])):
                    score = float(np.std(values[y:y+size, x:x+size], dtype=np.float64))
                    api.need(math.isfinite(score), "ROI contrast score is nonfinite")
                    candidates.append({"rect": [x, y, x+size, y+size], "window_size": size,
                                       "raw_stddev": score, "status": "proposed"})
            by_scale.append(sorted(candidates, key=lambda r: (-r["raw_stddev"], r["rect"])))
        regions = []
        for rank in range(9):
            for candidates in by_scale:
                if rank < len(candidates) and len(regions) < count:
                    regions.append(candidates[rank])
        for i, row in enumerate(regions):
            row["region_id"] = "region-%d" % (i+1)
        shown = overview(workspace, request, [row["rect"] for row in regions], api)
        contact_sheet(directory, [("Original: proposed regions", shown)], api)
        metadata.update(parent_object_id=request["object_id"], source_context=context_record(parent, context),
                        regions=regions, overview_object_id=shown["object_id"],
                        method="9 coverage positions per square scale, descending raw population stddev, round-robin scales; deterministic tie by rect",
                        limitations=["Contrast ranks are not crystal/domain/phase confidence", "Window changes trade spatial localization for reciprocal sampling; inspect context", "No hidden calibration, segmentation, registration or material assignment"],
                        scientific_data_changed=False)
    elif name == "fft_batch":
        parent, context, values = source_frame(workspace, request, api)
        rects = request.get("rects")
        api.need(type(rects) is list and 1 <= len(rects) <= 8, "Supply1..8 explicit half-open rectangles")
        rects = [api.rectangle(rect, values.shape) for rect in rects]
        api.need(len({tuple(r) for r in rects}) == len(rects), "Duplicate ROI in batch")
        api.need(all(min(r[2]-r[0], r[3]-r[1]) >= 4 for r in rects), "FFT windows must be at least4 by4")
        api.need(sum((r[2]-r[0])*(r[3]-r[1]) for r in rects) <= api.MAX_PIXELS,
                 "Batch total FFT pixels exceed4194304", "BUDGET_EXCEEDED")
        window, subtract = request.get("window", "hann"), request.get("subtract_mean", True)
        api.need(window in ("none", "hann") and type(subtract) is bool, "Explicit supported FFT window/mean setting required")
        previous_rows = []
        if request.get("previous_batch_id"):
            previous, _ = workspace.object(request["previous_batch_id"])
            api.need(previous["kind"] == "fft_batch" and previous["parent_object_id"] == request["object_id"],
                     "Previous batch must use the exact same selected frame/calibration revision")
            if previous["fft_parameters"] == {"window": window, "subtract_mean": subtract}:
                previous_rows = previous["regions"]
        shown = overview(workspace, request, rects, api)
        images, rows = [("Original: ROI context", shown)], []
        for i, rect in enumerate(rects):
            roi = run_child(workspace, request, "roi-%d" % i, "view", object_id=request["object_id"],
                            rect=rect, max_size=request.get("max_size", 512))
            reuse = next((r for r in previous_rows if r["rect"] == rect), None)
            if reuse:
                fft, _ = workspace.object(reuse["fft_object_id"])
            else:
                fft = run_child(workspace, request, "fft-%d" % i, "fft", object_id=request["object_id"],
                                rect=rect, window=window, subtract_mean=subtract, max_size=request.get("max_size", 512))
            rows.append({"region_id": "region-%d" % (i+1), "rect": rect,
                         "roi_object_id": roi["object_id"], "fft_object_id": fft["object_id"],
                         "fft_request_id": fft["request_id"], "fft_reused": reuse is not None,
                         "shape_yx": fft["shape_yx"], "dtype": fft["dtype"]})
            images.extend([("R%d spatial ROI" % (i+1), roi), ("R%d FFT" % (i+1), fft)])
        contact_sheet(directory, images, api)
        metadata.update(parent_object_id=request["object_id"], source_context=context_record(parent, context),
                        regions=rows, overview_object_id=shown["object_id"],
                        fft_parameters={"window": window, "subtract_mean": subtract},
                        previous_batch_id=request.get("previous_batch_id"),
                        source_data_changed=False, contact_sheet_is_display_only=True,
                        child_recovery="Query image_result with child_request_id(parent ID, label), SHA256 first48 prefixed auto-; labels context-view, context-regions, roi-N, fft-N (zero-based). Incomplete parent is not replayed.")
    elif name == "peak_measurements":
        peaks, _ = workspace.object(request["object_id"])
        api.need(type(peaks.get("peak_table")) is list and peaks.get("kind") == "fft_view",
                 "Select the exact saved image_peaks view; moved marks require explicit image_measure/image_remeasure")
        table = peaks["peak_table"]
        selected = request.get("peak_ids")
        if selected is not None:
            api.need(type(selected) is list and 1 <= len(selected) <= 32 and len(set(selected)) == len(selected), "peak_ids must be distinct saved peak IDs")
            api.need(all(any(row["peak_id"] == p for row in table) for p in selected), "Unknown peak ID")
            table = [next(row for row in table if row["peak_id"] == p) for p in selected]
        else:
            count = request.get("max_peaks", 8)
            api.need(api.integer(count, 1, 32), "max_peaks must be1..32")
            table = table[:count]
        rows, updates = [], []
        for i, peak in enumerate(table):
            measured = run_child(workspace, request, "measure-%d" % i, "measure", object_id=request["object_id"],
                                 coordinate_space="frequency_cycles_per_pixel", points=[[0, 0], peak["frequency_cycles_per_pixel"]])
            rows.append({"peak_id": peak["peak_id"], "measurement_object_id": measured["object_id"],
                         "measurement_request_id": measured["request_id"], "manifest_path": measured["manifest_path"],
                         "frequency_cycles_per_pixel": peak["frequency_cycles_per_pixel"],
                         "pixel_period": measured.get("pixel_period"), "d_spacing": measured.get("d_spacing"),
                         "d_spacing_unit": measured.get("d_spacing_unit"), "status": "hypothesized"})
            updates.append({"annotation_id": peak["peak_id"], "presentation": {"label": {
                "measurement_object_id": measured["object_id"], "measurement_kind": "period"}}})
        if updates:
            view = run_child(workspace, request, "measured-view", "annotate", object_id=request["object_id"], updates=updates)
        else:
            view = peaks
        contact_sheet(directory, [("Detected peaks: measured geometry", view)], api)
        metadata.update(parent_object_id=request["object_id"], measurements=rows, view_object_id=view["object_id"],
                        fft_recomputed=False, scientific_data_changed=False,
                        calibration_dependency=api.calibration.dependency(peaks.get("xy_calibration")),
                        interpretation="Detected maxima are hypotheses. DC-to-peak geometric period is not an indexed or confirmed crystal plane.")
    return metadata
