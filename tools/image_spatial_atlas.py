"""Local reflection observations on explicit ROIs of one immutable spatial frame.

Composition only: FFTs, peaks, calibrated measurements and annotation revisions
remain ordinary image-provider objects. No segmentation or phase assignment.
"""
import hashlib

try:
    from . import image_automation as automation
    from . import image_joint as joint
except ImportError:
    import image_automation as automation
    import image_joint as joint


FIELDS = {"spatial_atlas": {"object_id", "rects", "window", "subtract_mean", "peak_options",
                            "max_peaks", "max_size", "previous_atlas_id", "measurement_overrides"}}


def _settings(request, api):
    fft, peaks, _, size = joint.settings(request, api)
    return fft, peaks, size


def _rects(request, shape, api):
    entries = request.get("rects")
    api.need(type(entries) is list and 1 <= len(entries) <= 8, "Supply 1..8 explicit source-pixel half-open ROIs")
    rects = [api.rectangle(rect, shape) for rect in entries]
    api.need(len({tuple(rect) for rect in rects}) == len(rects), "Duplicate ROI in spatial atlas")
    api.need(all(min(r[2]-r[0], r[3]-r[1]) >= 4 for r in rects), "Each atlas ROI must be at least 4 by 4 pixels")
    api.need(sum((r[2]-r[0])*(r[3]-r[1]) for r in rects) <= api.MAX_PIXELS,
             "Atlas total FFT pixels exceed 4194304", "BUDGET_EXCEEDED")
    return rects


def _overrides(request, count, api):
    entries = request.get("measurement_overrides", [])
    api.need(type(entries) is list and len(entries) <= count, "Overrides require at most one selection per atlas ROI")
    selected = {}
    for entry in entries:
        api.need(type(entry) is dict and set(entry) == {"region_index", "measurement_object_ids"},
                 "Each override requires region_index and measurement_object_ids")
        index, ids = entry["region_index"], entry["measurement_object_ids"]
        api.need(api.integer(index, 0, count-1) and index not in selected, "Override indices must select distinct atlas ROIs")
        api.need(type(ids) is list and 1 <= len(ids) <= 16 and all(type(ident) is str for ident in ids)
                 and len(set(ids)) == len(ids), "Override measurements require 1..16 distinct committed object IDs")
        selected[index] = ids
    return selected


def _marks(records, fft_id):
    return [{"annotation_id": "atlas-reflection-%d" % (i+1), "kind": "point", "source_object_id": fft_id,
             "coordinate_space": "frequency_cycles_per_pixel", "coordinates": row["frequency_cycles_per_pixel"],
             "text": "R%d" % (i+1), "color": "cyan", "status": "hypothesized",
             "presentation": {"label": {"measurement_object_id": row["measurement_object_id"], "measurement_kind": "period"}}}
            for i, row in enumerate(records)]


def _previous(workspace, request, fft_settings, api):
    if not request.get("previous_atlas_id"):
        return None, []
    previous, _ = workspace.object(request["previous_atlas_id"])
    api.need(previous.get("kind") == "spatial_atlas" and previous.get("parent_object_id") == request["object_id"],
             "Previous atlas must use the exact same selected frame/calibration revision")
    return previous, previous["regions"] if previous["fft_parameters"] == fft_settings else []


def _checked(workspace, ident, operation, expected, api, request_id=None):
    record = joint._parameters(workspace, ident, operation, expected, api)
    api.need(request_id is None or record["request_id"] == request_id,
             "Atlas child does not belong to its original request", "CORRUPT_OBJECT")
    return record


def validate_references(workspace, metadata, api):
    active = getattr(workspace, "_atlas_validation_active", set())
    api.need(metadata["object_id"] not in active and len(active) < 16,
             "Atlas dependency cycle/depth exceeded", "CORRUPT_OBJECT")
    workspace._atlas_validation_active = active
    active.add(metadata["object_id"])
    try:
        request = automation._saved_parameters(workspace, metadata, api)
        api.need(request.get("action") == "spatial_atlas" and request.get("object_id") == metadata.get("parent_object_id"),
                 "Atlas differs from original operation/source", "CORRUPT_OBJECT")
        parent, _, context = workspace.resolved(request["object_id"])
        rects = _rects(request, parent["shape_yx"], api)
        fft_settings, peak_settings, size = _settings(request, api)
        api.need(parent["kind"] == "frame" and metadata.get("source_context") == automation.context_record(parent, context)
                 and metadata.get("xy_calibration") == parent.get("xy_calibration")
                 and metadata.get("fft_parameters") == fft_settings and metadata.get("peak_parameters") == peak_settings
                 and metadata.get("previous_atlas_id") == request.get("previous_atlas_id"),
                 "Atlas source/context/settings changed", "CORRUPT_OBJECT")
        batch = _checked(workspace, metadata["fft_batch_object_id"], "fft_batch",
                         {"object_id": request["object_id"], "rects": rects, "max_size": size, **fft_settings}, api,
                         automation.child_request_id(metadata["request_id"], "fft-batch"))
        api.need(metadata.get("fft_batch_request_id") == batch["request_id"]
                 and metadata.get("overview_object_id") == batch["overview_object_id"],
                 "Atlas batch/overview identity changed", "CORRUPT_OBJECT")
        rows = metadata.get("regions")
        api.need(type(rows) is list and len(rows) == len(rects), "Atlas ROI list changed", "CORRUPT_OBJECT")
        submitted = _overrides(request, len(rects), api)
        for index, (row, region) in enumerate(zip(rows, batch["regions"])):
            api.need(row.get("region_index") == index and row.get("rect") == rects[index]
                     and all(row.get(key) == region.get(key) for key in ("roi_object_id", "fft_object_id", "fft_request_id", "fft_reused")),
                     "Atlas region differs from its batch", "CORRUPT_OBJECT")
            fft, _ = workspace.object(region["fft_object_id"])
            peaks = _checked(workspace, row["peaks_object_id"], "peaks", {"object_id": fft["object_id"], **peak_settings}, api)
            measured = _checked(workspace, row["peak_measurements_object_id"], "peak_measurements",
                                {"object_id": peaks["object_id"], "max_peaks": peak_settings["max_peaks"]}, api)
            ids, origin = row.get("override_measurement_object_ids"), row.get("override_source")
            if index in submitted:
                api.need(ids == submitted[index] and origin == {"request_id": metadata["request_id"], "region_index": index},
                         "Atlas override differs from submitted measurement selection", "CORRUPT_OBJECT")
            elif ids is not None:
                api.need(request.get("previous_atlas_id") is not None and type(origin) is dict,
                         "Inherited atlas correction lacks original provenance", "CORRUPT_OBJECT")
                original = automation._saved_parameters(workspace, {"request_id": origin.get("request_id")}, api)
                origin_index = origin.get("region_index")
                api.need(original.get("action") == "spatial_atlas" and original.get("object_id") == request["object_id"]
                         and type(origin_index) is int and 0 <= origin_index < len(original.get("rects", []))
                         and original["rects"][origin_index] == row["rect"] and any(
                             item.get("region_index") == origin_index and item.get("measurement_object_ids") == ids
                             for item in original.get("measurement_overrides", [])),
                         "Inherited atlas correction differs from its original exact source/ROI selection", "CORRUPT_OBJECT")
            else:
                api.need(origin is None, "Unexpected atlas override provenance", "CORRUPT_OBJECT")
                ids = [item["measurement_object_id"] for item in measured["measurements"]]
            records = [joint.measurement_row(workspace, ident, fft, api) for ident in ids]
            api.need(row.get("measurements") == records and row.get("measurement_object_ids") == ids
                     and row.get("status") == ("observed" if records else "not_detected")
                     and row.get("array_sha256") == fft["files_sha256"]["data.npy"]
                     and row.get("shape_yx") == fft["shape_yx"] and row.get("frequency_axes") == fft["frequency_axes"]
                     and row.get("xy_calibration") == fft.get("xy_calibration")
                     and row.get("detection_quality") == peaks.get("peak_quality")
                     and row.get("peaks_request_id") == peaks["request_id"]
                     and row.get("peak_measurements_request_id") == measured["request_id"],
                     "Atlas science/receipt differs from committed children", "CORRUPT_OBJECT")
            if row.get("override_measurement_object_ids") is None:
                api.need(row.get("view_object_id") == measured["view_object_id"], "Atlas measurement view changed", "CORRUPT_OBJECT")
            else:
                _checked(workspace, row["view_object_id"], "annotate",
                         {"object_id": peaks["object_id"], "annotations": _marks(records, fft["object_id"])}, api,
                         automation.child_request_id(metadata["request_id"], "region-%d-corrected-view" % index))
    finally:
        active.remove(metadata["object_id"])


def action(workspace, name, request, metadata, directory, api):
    parent, context, values = automation.source_frame(workspace, request, api)
    rects = _rects(request, values.shape, api)
    fft_settings, peak_settings, size = _settings(request, api)
    selected = _overrides(request, len(rects), api)
    previous, prior_rows = _previous(workspace, request, fft_settings, api)
    prior_by_rect = {tuple(row["rect"]): row for row in prior_rows}
    # Reject every bad manual correction before creating any batch children.
    for index, ids in selected.items():
        prior = prior_by_rect.get(tuple(rects[index]))
        api.need(prior is not None, "Atlas overrides require previous observations with unchanged exact source/ROI/FFT settings")
        fft, _ = workspace.object(prior["fft_object_id"])
        for ident in ids:
            joint.measurement_row(workspace, ident, fft, api)
    batch_parameters = {"object_id": request["object_id"], "rects": rects, "max_size": size, **fft_settings}
    if previous:
        batch_parameters["previous_batch_id"] = previous["fft_batch_object_id"]
    batch = automation.run_child(workspace, request, "fft-batch", "fft_batch", **batch_parameters)
    overview, _ = workspace.object(batch["overview_object_id"])
    pictures, regions = [("Original: explicit ROI observations", overview)], []
    for index, region in enumerate(batch["regions"]):
        prior = prior_by_rect.get(tuple(region["rect"]))
        fft, _ = workspace.object(region["fft_object_id"])
        prefix = "region-%d-" % index
        if prior and previous["peak_parameters"] == peak_settings:
            peaks, _ = workspace.object(prior["peaks_object_id"])
            measured, _ = workspace.object(prior["peak_measurements_object_id"])
        else:
            peaks = automation.run_child(workspace, request, prefix+"peaks", "peaks", object_id=fft["object_id"], max_size=size, **peak_settings)
            measured = automation.run_child(workspace, request, prefix+"measurements", "peak_measurements",
                                            object_id=peaks["object_id"], max_peaks=peak_settings["max_peaks"])
        override_ids = selected.get(index)
        origin = {"request_id": request["request_id"], "region_index": index} if override_ids is not None else None
        if override_ids is None and prior and prior.get("override_measurement_object_ids") is not None:
            override_ids, origin = prior["override_measurement_object_ids"], prior["override_source"]
        ids = override_ids if override_ids is not None else [row["measurement_object_id"] for row in measured["measurements"]]
        records = [joint.measurement_row(workspace, ident, fft, api) for ident in ids]
        if override_ids is not None:
            shown = automation.run_child(workspace, request, prefix+"corrected-view", "annotate",
                                          object_id=peaks["object_id"], annotations=_marks(records, fft["object_id"]))
        else:
            shown, _ = workspace.object(measured["view_object_id"])
        regions.append({"region_index": index, "rect": region["rect"], "status": "observed" if records else "not_detected",
                        "roi_object_id": region["roi_object_id"], "fft_object_id": fft["object_id"], "fft_request_id": fft["request_id"],
                        "array_sha256": fft["files_sha256"]["data.npy"], "fft_reused": region["fft_reused"],
                        "shape_yx": fft["shape_yx"], "frequency_axes": fft["frequency_axes"], "xy_calibration": fft.get("xy_calibration"),
                        "peaks_object_id": peaks["object_id"], "peaks_request_id": peaks["request_id"],
                        "peak_measurements_object_id": measured["object_id"], "peak_measurements_request_id": measured["request_id"],
                        "view_object_id": shown["object_id"], "measurement_object_ids": ids, "measurements": records,
                        "detection_quality": peaks.get("peak_quality"), "override_measurement_object_ids": override_ids,
                        "override_source": origin, "interpretation_status": "hypothesized"})
        roi, _ = workspace.object(region["roi_object_id"])
        pictures.extend([("R%d spatial ROI" % (index+1), roi), ("R%d observed reflections" % (index+1), shown)])
    automation.contact_sheet(directory, pictures, api)
    api.write_new(directory / "atlas-observations.json", api.canonical({"coordinate_space": "frequency_cycles_per_pixel", "regions": regions})+b"\n")
    metadata.update(parent_object_id=request["object_id"], source_context=automation.context_record(parent, context),
                    xy_calibration=parent.get("xy_calibration"), fft_batch_object_id=batch["object_id"], fft_batch_request_id=batch["request_id"],
                    overview_object_id=batch["overview_object_id"], regions=regions, fft_parameters=fft_settings, peak_parameters=peak_settings,
                    previous_atlas_id=request.get("previous_atlas_id"), scientific_data_changed=False, interpretation_status="hypothesized",
                    contact_sheet_is_display_only=True, observations_path=str(directory / "atlas-observations.json"),
                    child_recovery="Query the original atlas request with image_result for bounded child receipts; unknown operations are never replayed",
                    limitations=["Observations cover only explicitly selected ROIs; no segmentation, area fraction or claim about unobserved pixels",
                                 "Local reflection geometry is not a unique phase, orientation domain or defect identification",
                                 "Not detected means no selected numerical peak under explicit settings, not absence of crystalline material",
                                 "Detector amplitude and conjugate peaks are not independent confidence estimates",
                                 "Manual overrides preserve saved scientific anchors; detector quality remains historical detector evidence"])
    return metadata


def recovery(workspace, saved, api):
    """Read bounded original child journals; never resume or recompute an atlas."""
    request, parent_id = saved.get("parameters"), saved.get("request_id")
    api.need(type(request) is dict and type(parent_id) is str and api.REQUEST_ID.fullmatch(parent_id)
             and request.get("action") == "spatial_atlas" and request.get("request_id") == parent_id
             and request.get("workspace") == str(workspace.root)
             and saved.get("parameters_sha256") == hashlib.sha256(api.canonical(request)).hexdigest(),
             "Partial atlas recovery original request identity/parameters changed", "CORRUPT_OBJECT")
    result = {"parent_request_id": parent_id, "parent_state": saved.get("state"), "children": [], "automatic_retry": False,
              "scientific_operations_submitted": False, "scope": "Read-only inspection of original atlas child journals"}
    try:
        parent, _, _ = workspace.resolved(request["object_id"])
        rects = _rects(request, parent["shape_yx"], api)
        fft_settings, peak_settings, size = _settings(request, api)
        selected = _overrides(request, len(rects), api)
        previous, prior_rows = _previous(workspace, request, fft_settings, api)
    except Exception as error:
        result["inspection_error"] = {"code": getattr(error, "code", "INSPECTION_FAILED"), "message": str(error)}
        return result

    def inspect(ident, operation, role, index, expected, origin="original_child"):
        entry = {"request_id": ident, "action": operation, "role": role, "region_index": index, "origin": origin}
        filename = workspace.root / "requests" / (ident+".json")
        if not filename.exists():
            entry["state"] = "not_submitted"
        else:
            try:
                record = api.read_json(filename)
                original = record.get("parameters")
                api.need(type(original) is dict and record.get("request_id") == ident and original.get("request_id") == ident
                         and original.get("workspace") == str(workspace.root) and original.get("action") == operation
                         and record.get("parameters_sha256") == hashlib.sha256(api.canonical(original)).hexdigest(),
                         "Atlas child original identity/parameters changed", "CORRUPT_OBJECT")
                if expected is None or not all(original.get(k) == v for k, v in expected.items()):
                    entry.update(state="unverified_relationship" if expected is None else "unrelated", validated=False,
                                 original_state=record.get("state"))
                else:
                    state = record.get("state")
                    api.need(state in ("prepared", "completed", "failed"), "Invalid atlas child state", "CORRUPT_OBJECT")
                    entry["state"] = state
                    if state in ("completed", "failed"):
                        response = record.get("response")
                        api.need(type(response) is dict and response.get("request_id") == ident,
                                 "Atlas child result identity changed", "CORRUPT_OBJECT")
                        if state == "completed":
                            child, _ = workspace.object(response.get("object_id"))
                            api.need(child.get("request_id") == ident, "Atlas child object belongs to another request", "CORRUPT_OBJECT")
                            entry.update(object_id=child["object_id"], kind=child["kind"], validated=True)
                            result["children"].append(entry)
                            return child
                        entry["error"] = response.get("error")
            except Exception as error:
                entry.update(state="corrupt" if getattr(error, "code", None) == "CORRUPT_OBJECT" else "unknown",
                             inspection_error={"code": getattr(error, "code", "INSPECTION_FAILED"), "message": str(error)})
        result["children"].append(entry)
        return None

    batch_id = automation.child_request_id(parent_id, "fft-batch")
    expected = {"object_id": request["object_id"], "rects": rects, "max_size": size, **fft_settings,
                "previous_batch_id": previous["fft_batch_object_id"] if previous else None}
    inspect(batch_id, "fft_batch", "fft-batch", None, expected)
    view = inspect(automation.child_request_id(batch_id, "context-view"), "view", "fft-batch/context-view", None,
                   {"object_id": request["object_id"], "max_size": size})
    marks = [{"annotation_id": "region-%d" % (i+1), "kind": "rectangle", "source_object_id": view["panels"][0]["source_object_id"],
              "coordinate_space": "source_pixels", "coordinates": rect, "text": "R%d" % (i+1), "status": "hypothesized", "color": "cyan"}
             for i, rect in enumerate(rects)] if view else None
    inspect(automation.child_request_id(batch_id, "context-regions"), "annotate", "fft-batch/context-regions", None,
            {"object_id": view["object_id"], "annotations": marks} if view else None)
    for index, rect in enumerate(rects):
        prior = next((row for row in prior_rows if row["rect"] == rect), None)
        inspect(automation.child_request_id(batch_id, "roi-%d" % index), "view", "fft-batch/roi", index,
                {"object_id": request["object_id"], "rect": rect, "max_size": size})
        fft = inspect(automation.child_request_id(batch_id, "fft-%d" % index), "fft", "fft-batch/fft", index,
                      {"object_id": request["object_id"], "rect": rect, "max_size": size, **fft_settings})
        if prior:
            fft = inspect(prior["fft_request_id"], "fft", "fft", index,
                          {"object_id": request["object_id"], "rect": rect, **fft_settings}, "available_previous_result") or fft
        peak_expected = {"object_id": fft["object_id"], "max_size": size, **peak_settings} if fft else None
        peaks = inspect(automation.child_request_id(parent_id, "region-%d-peaks" % index), "peaks", "peaks", index, peak_expected)
        if prior and previous["peak_parameters"] == peak_settings:
            peaks = inspect(prior["peaks_request_id"], "peaks", "peaks", index,
                            {"object_id": fft["object_id"], **peak_settings} if fft else None, "available_previous_result") or peaks
        measure_id = automation.child_request_id(parent_id, "region-%d-measurements" % index)
        expected_measure = {"object_id": peaks["object_id"], "max_peaks": peak_settings["max_peaks"]} if peaks else None
        measured = inspect(measure_id, "peak_measurements", "measurements", index, expected_measure)
        if prior and previous["peak_parameters"] == peak_settings:
            measured = inspect(prior["peak_measurements_request_id"], "peak_measurements", "measurements", index,
                               expected_measure, "available_previous_result") or measured
        updates = []
        for ordinal in range(peak_settings["max_peaks"]):
            peak = peaks["peak_table"][ordinal] if peaks and ordinal < len(peaks["peak_table"]) else None
            point = inspect(automation.child_request_id(measure_id, "measure-%d" % ordinal), "measure", "measurements/measure", index,
                            {"object_id": peaks["object_id"], "coordinate_space": "frequency_cycles_per_pixel",
                             "points": [[0, 0], peak["frequency_cycles_per_pixel"]]} if peak else None)
            if point:
                updates.append({"annotation_id": peak["peak_id"], "presentation": {"label": {"measurement_object_id": point["object_id"], "measurement_kind": "period"}}})
        inspect(automation.child_request_id(measure_id, "measured-view"), "annotate", "measurements/measured-view", index,
                {"object_id": peaks["object_id"], "updates": updates} if peaks and updates
                and len(updates) == min(len(peaks["peak_table"]), peak_settings["max_peaks"]) else None)
        ids = selected.get(index, prior.get("override_measurement_object_ids") if prior else None)
        correction = None
        if ids is not None and fft and peaks:
            try:
                correction = {"object_id": peaks["object_id"], "annotations": _marks(
                    [joint.measurement_row(workspace, ident, fft, api) for ident in ids], fft["object_id"])}
            except Exception:
                pass  # Unvalidated correction remains explicitly unverified, never adopted.
        inspect(automation.child_request_id(parent_id, "region-%d-corrected-view" % index), "annotate", "corrected-view", index, correction)
    api.need(len(result["children"]) <= 256, "Atlas recovery child budget exceeded", "BUDGET_EXCEEDED")
    return result
