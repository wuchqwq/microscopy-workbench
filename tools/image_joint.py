"""Cross-frame observations composed from existing immutable scientific tools.

No FFT, peak detection, registration or scientific measurement is implemented here.
Matching uses the saved DC-to-peak vectors, never per-frame peak labels/ranks.
"""
import csv
import hashlib
import io
import math

try:
    from . import image_automation as automation
except ImportError:
    import image_automation as automation


FIELDS = {"joint_observations": {
    "correspondence_object_id", "window", "subtract_mean", "peak_options",
    "frequency_tolerance_cycles_per_pixel", "max_peaks", "previous_observations_id",
    "measurement_overrides", "max_size",
}}


def settings(request, api):
    window, subtract = request.get("window", "hann"), request.get("subtract_mean", True)
    maximum, size = request.get("max_peaks", 8), request.get("max_size", 512)
    tolerance = request.get("frequency_tolerance_cycles_per_pixel", .02)
    api.need(window in ("none", "hann") and type(subtract) is bool, "Supported FFT window and boolean subtract_mean required")
    api.need(api.integer(maximum, 1, 16) and api.integer(size, 32, 1024), "max_peaks requires1..16 and max_size32..1024")
    api.need(api.number(tolerance) and 0 < tolerance <= .25, "Frequency tolerance requires finite cycles/pixel in (0,.25]")
    options = request.get("peak_options", {})
    api.need(type(options) is dict and set(options) <= {"min_separation_bins", "exclude_dc_radius_bins", "threshold_rel", "refinement"},
             "peak_options only accepts existing detector parameters; max_peaks is a separate joint bound")
    peaks = {"max_peaks": maximum, "min_separation_bins": options.get("min_separation_bins", 3),
             "exclude_dc_radius_bins": options.get("exclude_dc_radius_bins", 3),
             "threshold_rel": options.get("threshold_rel", .05), "refinement": options.get("refinement", "quadratic")}
    api.need(api.integer(peaks["min_separation_bins"], 1, 32) and api.integer(peaks["exclude_dc_radius_bins"], 0, 64) and
             api.number(peaks["threshold_rel"]) and 0 < peaks["threshold_rel"] <= 1 and peaks["refinement"] in ("none", "quadratic"),
             "Invalid existing peak detector parameters")
    return {"window": window, "subtract_mean": subtract}, peaks, tolerance, size


def correspondence(workspace, ident, api):
    current, _ = workspace.object(ident)
    api.need(current.get("kind") == "region_correspondence", "Select an explicit saved region correspondence")
    rows = current.get("rows")
    api.need(type(rows) is list and 2 <= len(rows) <= 8 and
             len({r["frame_index"] for r in rows}) == len(rows), "Invalid saved correspondence table", "CORRUPT_OBJECT")
    api.need(any(r["frame_index"] == current.get("reference_index") and r["status"] == "VERIFIED" for r in rows),
             "Saved correspondence has no verified reference", "CORRUPT_OBJECT")
    return current


def overrides(request, valid_indices, api):
    entries = request.get("measurement_overrides", [])
    api.need(type(entries) is list and len(entries) <= 8, "measurement_overrides must contain at most8 frame selections")
    result = {}
    for entry in entries:
        api.need(type(entry) is dict and set(entry) == {"frame_index", "measurement_object_ids"} and
                 type(entry["frame_index"]) is int and entry["frame_index"] in valid_indices and entry["frame_index"] not in result,
                 "Each override must select a distinct verified frame_index")
        ids = entry["measurement_object_ids"]
        api.need(type(ids) is list and 1 <= len(ids) <= 16 and all(type(v) is str for v in ids) and len(set(ids)) == len(ids),
                 "Override measurement_object_ids must be1..16 distinct committed measurements")
        result[entry["frame_index"]] = ids
    return result


def measurement_row(workspace, ident, fft, api):
    measured, _ = workspace.committed_measurement(ident)
    api.need(measured.get("coordinate_space") == "frequency_cycles_per_pixel" and
             workspace.measurement_grid(measured["parent_object_id"]) == workspace.measurement_grid(fft["object_id"]) and
             measured.get("xy_calibration") == fft.get("xy_calibration"),
             "Cross-frame measurement belongs to another FFT grid or calibration revision", "MEASUREMENT_SCOPE_MISMATCH")
    dc = measured.get("dc_reference_point_index")
    points = measured.get("points")
    api.need(type(dc) is int and dc in (0, 1) and points[dc] == [0, 0],
             "Joint reflections require an explicit DC-to-peak measurement, not an arbitrary two-peak difference", "MEASUREMENT_SCOPE_MISMATCH")
    vector = points[1-dc]
    api.need(any(v != 0 for v in vector), "DC itself is not a nonzero reflection")
    return {"measurement_object_id": ident, "measurement_request_id": measured["request_id"],
            "frequency_cycles_per_pixel": vector, "pixel_period": measured.get("pixel_period"),
            "d_spacing": measured.get("d_spacing"), "d_spacing_unit": measured.get("d_spacing_unit"),
            "calibration_dependency": api.calibration.dependency(measured.get("xy_calibration")),
            "scientific_grid_identity": workspace.measurement_grid(fft["object_id"]),
            "interpretation_status": "hypothesized"}


def match_observations(frames, reference_index, tolerance):
    """Conservative mutual uniqueness within an explicit Euclidean tolerance.

    No nearest-wins tie breaking or fitting is hidden here. A competing endpoint
    on either side remains ambiguous. A missing peak means not detected under
    the declared detector/selection settings, never proven structural absence.
    """
    reference = next(row for row in frames if row["frame_index"] == reference_index)
    refs = reference["measurements"]
    table = []
    for frame in frames:
        observed = frame.get("measurements", [])
        if frame["status"] != "VERIFIED":
            table.append({"frame_index": frame["frame_index"], "status": "not_comparable",
                          "correspondence_status": frame["status"], "reference_measurement_object_id": None,
                          "measurement_object_id": None, "candidate_measurement_object_ids": [],
                          "frequency_cycles_per_pixel": None, "reference_frequency_cycles_per_pixel": None,
                          "residual_cycles_per_pixel": None})
            continue
        if frame["frame_index"] == reference_index:
            for ref in refs:
                table.append({"frame_index": reference_index, "status": "observed", "correspondence_status": "VERIFIED",
                              "reference_measurement_object_id": ref["measurement_object_id"],
                              "measurement_object_id": ref["measurement_object_id"],
                              "candidate_measurement_object_ids": [ref["measurement_object_id"]],
                              "frequency_cycles_per_pixel": ref["frequency_cycles_per_pixel"],
                              "reference_frequency_cycles_per_pixel": ref["frequency_cycles_per_pixel"],
                              "residual_cycles_per_pixel": 0., "d_spacing": ref["d_spacing"], "d_spacing_unit": ref["d_spacing_unit"]})
            if not refs:
                table.append({"frame_index": reference_index, "status": "not_detected", "correspondence_status": "VERIFIED",
                              "reference_measurement_object_id": None, "measurement_object_id": None,
                              "candidate_measurement_object_ids": [], "frequency_cycles_per_pixel": None,
                              "reference_frequency_cycles_per_pixel": None, "residual_cycles_per_pixel": None})
            continue
        distances = [[math.hypot(*(v-w for v, w in zip(ref["frequency_cycles_per_pixel"], peak["frequency_cycles_per_pixel"])))
                      for peak in observed] for ref in refs]
        candidates = [[j for j, d in enumerate(row) if d <= tolerance] for row in distances]
        incoming = [sum(j in row for row in candidates) for j in range(len(observed))]
        for i, ref in enumerate(refs):
            admissible = candidates[i]
            unique = len(admissible) == 1 and incoming[admissible[0]] == 1
            matched = observed[admissible[0]] if unique else None
            table.append({"frame_index": frame["frame_index"], "status": "observed" if unique else "ambiguous" if admissible else "not_detected",
                          "correspondence_status": "VERIFIED", "reference_measurement_object_id": ref["measurement_object_id"],
                          "measurement_object_id": matched["measurement_object_id"] if matched else None,
                          "candidate_measurement_object_ids": [observed[j]["measurement_object_id"] for j in admissible],
                          "frequency_cycles_per_pixel": matched["frequency_cycles_per_pixel"] if matched else None,
                          "reference_frequency_cycles_per_pixel": ref["frequency_cycles_per_pixel"],
                          "residual_cycles_per_pixel": distances[i][admissible[0]] if unique else None,
                          "d_spacing": matched["d_spacing"] if matched else None, "d_spacing_unit": matched["d_spacing_unit"] if matched else None})
        for j, peak in enumerate(observed):
            if incoming[j] == 0:
                table.append({"frame_index": frame["frame_index"], "status": "unmatched", "correspondence_status": "VERIFIED",
                              "reference_measurement_object_id": None, "measurement_object_id": peak["measurement_object_id"],
                              "candidate_measurement_object_ids": [], "frequency_cycles_per_pixel": peak["frequency_cycles_per_pixel"],
                              "reference_frequency_cycles_per_pixel": None, "residual_cycles_per_pixel": None,
                              "d_spacing": peak["d_spacing"], "d_spacing_unit": peak["d_spacing_unit"]})
        if not refs and not observed:
            table.append({"frame_index": frame["frame_index"], "status": "not_detected", "correspondence_status": "VERIFIED",
                          "reference_measurement_object_id": None, "measurement_object_id": None,
                          "candidate_measurement_object_ids": [], "frequency_cycles_per_pixel": None,
                          "reference_frequency_cycles_per_pixel": None, "residual_cycles_per_pixel": None})
    return table


def _parameters(workspace, ident, action, expected, api):
    record, _ = workspace.object(ident)
    params = automation._saved_parameters(workspace, record, api)
    api.need(params.get("action") == action and all(params.get(k) == v for k, v in expected.items()),
             "Joint child identity or original parameters changed", "CORRUPT_OBJECT")
    return record


def _frame_records(workspace, row, fft_parameters, peak_parameters, api):
    """Re-derive observable data from authoritative children, not saved labels."""
    batch = _parameters(workspace, row["fft_batch_object_id"], "fft_batch",
                        {"object_id": row["selected_object_id"], "rects": [row["target_rect"]], **fft_parameters}, api)
    region = batch["regions"][0]
    api.need(row["fft_object_id"] == region["fft_object_id"] and row["roi_object_id"] == region["roi_object_id"] and
             row["overview_object_id"] == batch["overview_object_id"], "Joint region references differ from FFT batch", "CORRUPT_OBJECT")
    fft, _ = workspace.object(region["fft_object_id"])
    peaks = _parameters(workspace, row["peaks_object_id"], "peaks", {"object_id": fft["object_id"], **peak_parameters}, api)
    measured = _parameters(workspace, row["peak_measurements_object_id"], "peak_measurements",
                           {"object_id": peaks["object_id"], "max_peaks": peak_parameters["max_peaks"]}, api)
    ids = row.get("override_measurement_object_ids")
    if ids is None:
        ids = [r["measurement_object_id"] for r in measured["measurements"]]
        api.need(row["view_object_id"] == measured["view_object_id"], "Joint saved view differs from selected measurements", "CORRUPT_OBJECT")
    records = [measurement_row(workspace, ident, fft, api) for ident in ids]
    return batch, fft, peaks, measured, records


def validate_references(workspace, metadata, api):
    active = getattr(workspace, "_joint_validation_active", set())
    api.need(metadata["object_id"] not in active and len(active) < 16, "Joint dependency cycle/depth exceeded", "CORRUPT_OBJECT")
    workspace._joint_validation_active = active
    active.add(metadata["object_id"])
    try:
        params = automation._saved_parameters(workspace, metadata, api)
        api.need(params.get("action") == "joint_observations" and params.get("correspondence_object_id") == metadata.get("correspondence_object_id"),
                 "Joint input differs from original request", "CORRUPT_OBJECT")
        corr = correspondence(workspace, params["correspondence_object_id"], api)
        fft_settings, peak_settings, tolerance, _ = settings(params, api)
        api.need(metadata.get("fft_parameters") == fft_settings and metadata.get("peak_parameters") == peak_settings and
                 metadata.get("frequency_tolerance_cycles_per_pixel") == tolerance and metadata.get("reference_index") == corr["reference_index"] and
                 metadata.get("sequence_object_id") == corr["sequence_object_id"] and metadata.get("sequence_axis") == corr["sequence_axis"],
                 "Joint settings/context changed", "CORRUPT_OBJECT")
        rows = metadata.get("frame_observations")
        api.need(type(rows) is list and len(rows) == len(corr["rows"]), "Joint frame list changed", "CORRUPT_OBJECT")
        selected_overrides = overrides(params, {r["frame_index"] for r in corr["rows"] if r["status"] == "VERIFIED"}, api)
        for row, mapping in zip(rows, corr["rows"]):
            api.need(all(row.get(k) == mapping.get(k) for k in ("frame_index", "selected_object_id", "target_rect", "status")),
                     "Joint row differs from saved correspondence", "CORRUPT_OBJECT")
            if row["status"] != "VERIFIED":
                api.need(row.get("measurements") == [], "Incomparable row contains scientific observations", "CORRUPT_OBJECT")
                continue
            submitted = selected_overrides.get(row["frame_index"])
            saved_override = row.get("override_measurement_object_ids")
            source = row.get("override_source")
            if submitted is not None:
                api.need(saved_override == submitted and source == {"request_id": metadata["request_id"], "frame_index": row["frame_index"]},
                         "Joint override differs from submitted selection", "CORRUPT_OBJECT")
            elif saved_override is not None:
                api.need(params.get("previous_observations_id") is not None and type(source) is dict,
                         "Inherited corrected observations lack original provenance", "CORRUPT_OBJECT")
                original = automation._saved_parameters(workspace, {"request_id": source.get("request_id")}, api)
                api.need(original.get("action") == "joint_observations" and any(
                    entry.get("frame_index") == source.get("frame_index") and entry.get("measurement_object_ids") == saved_override
                    for entry in original.get("measurement_overrides", [])),
                    "Inherited corrected observations differ from original explicit selection", "CORRUPT_OBJECT")
                origin_corr = correspondence(workspace, original["correspondence_object_id"], api)
                api.need(any(r["frame_index"] == source["frame_index"] and r["selected_object_id"] == row["selected_object_id"] and
                             r["target_rect"] == row["target_rect"] for r in origin_corr["rows"]),
                         "Inherited corrected observations belong to a different frame or ROI", "CORRUPT_OBJECT")
            else:
                api.need(source is None, "Unexpected override provenance", "CORRUPT_OBJECT")
            batch, fft, peaks, measured, records = _frame_records(workspace, row, fft_settings, peak_settings, api)
            api.need(row.get("measurements") == records and row.get("source_context") == batch.get("source_context") and
                     row.get("fft_request_id") == fft["request_id"] and row.get("fft_batch_request_id") == batch["request_id"] and
                     row.get("peaks_request_id") == peaks["request_id"] and row.get("peak_measurements_request_id") == measured["request_id"] and
                     row.get("array_sha256") == fft["files_sha256"]["data.npy"] and row.get("shape_yx") == fft["shape_yx"] and
                     row.get("frequency_axes") == fft["frequency_axes"] and row.get("xy_calibration") == fft.get("xy_calibration"),
                     "Joint science/receipt differs from committed children", "CORRUPT_OBJECT")
            if not row.get("fft_reused"):
                api.need(batch["request_id"] == automation.child_request_id(metadata["request_id"], "frame-%d-fft-batch" % row["frame_index"]),
                         "Fresh joint FFT batch is not the original child request", "CORRUPT_OBJECT")
            else:
                api.need(params.get("previous_observations_id") is not None,
                         "FFT reuse requires an explicit saved previous observation", "CORRUPT_OBJECT")
            if row.get("override_measurement_object_ids") is not None:
                marks = _override_marks(records, fft["object_id"])
                _parameters(workspace, row["view_object_id"], "annotate", {"object_id": peaks["object_id"], "annotations": marks}, api)
        api.need(metadata.get("observations") == match_observations(rows, corr["reference_index"], tolerance),
                 "Joint evidence table differs from committed numerical vectors", "CORRUPT_OBJECT")
    finally:
        active.remove(metadata["object_id"])


def _override_marks(records, fft_id):
    return [{"annotation_id": "joint-reflection-%d" % (i+1), "kind": "point", "source_object_id": fft_id,
             "coordinate_space": "frequency_cycles_per_pixel", "coordinates": row["frequency_cycles_per_pixel"],
             "text": "R%d" % (i+1), "color": "cyan", "status": "hypothesized",
             "presentation": {"label": {"measurement_object_id": row["measurement_object_id"], "measurement_kind": "period"}}}
            for i, row in enumerate(records)]


def _csv(table, frames, sequence_id):
    stream = io.StringIO(newline="")
    columns = ["frame_index", "status", "correspondence_status", "reference_measurement_object_id", "measurement_object_id",
               "reference_fx_cycles_per_pixel", "reference_fy_cycles_per_pixel", "fx_cycles_per_pixel", "fy_cycles_per_pixel",
               "residual_cycles_per_pixel", "d_spacing", "d_spacing_unit", "candidate_measurement_object_ids",
               "sequence_object_id", "selected_frame_object_id", "source_frame_index", "source_sha256", "roi_xyxy", "original_dtype",
               "fft_object_id", "fft_request_id", "calibration_id", "calibration_revision"]
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for row in table:
        frame = next(item for item in frames if item["frame_index"] == row["frame_index"])
        context = frame.get("source_context") or {}
        record = frame.get("xy_calibration") or {}
        reference = row.get("reference_frequency_cycles_per_pixel") or [None, None]
        observed = row.get("frequency_cycles_per_pixel") or [None, None]
        writer.writerow({**{k: row.get(k) for k in columns}, "reference_fx_cycles_per_pixel": reference[0],
                         "reference_fy_cycles_per_pixel": reference[1], "fx_cycles_per_pixel": observed[0], "fy_cycles_per_pixel": observed[1],
                         "candidate_measurement_object_ids": "|".join(row["candidate_measurement_object_ids"]),
                         "sequence_object_id": sequence_id, "selected_frame_object_id": frame["selected_object_id"],
                         "source_frame_index": context.get("frame_index"), "source_sha256": (context.get("source_identity") or {}).get("sha256"),
                         "roi_xyxy": " ".join(str(v) for v in frame["target_rect"]) if frame.get("target_rect") is not None else None,
                         "original_dtype": context.get("dtype"), "fft_object_id": frame.get("fft_object_id"),
                         "fft_request_id": frame.get("fft_request_id"), "calibration_id": record.get("calibration_id"),
                         "calibration_revision": record.get("revision")})
    return stream.getvalue().encode("utf8")


def recovery(workspace, saved, api):
    """Inspect bounded possible child journals after an interrupted parent.

    This is not a second journal or a resume operation. All identities come from
    the original parent parameters and the same deterministic child convention
    used during execution. A missing child is reported as not submitted; damaged
    or unreadable evidence is unknown/corrupt, never completed or retried.
    """
    parameters, parent_id = saved.get("parameters"), saved.get("request_id")
    api.need(type(parameters) is dict and type(parent_id) is str and api.REQUEST_ID.fullmatch(parent_id) and
             parameters.get("action") == "joint_observations" and parameters.get("request_id") == parent_id and
             parameters.get("workspace") == str(workspace.root) and
             saved.get("parameters_sha256") == hashlib.sha256(api.canonical(parameters)).hexdigest(),
             "Partial joint recovery original request identity or parameters changed", "CORRUPT_OBJECT")
    result = {"parent_request_id": parent_id, "parent_state": saved.get("state"), "children": [],
              "automatic_retry": False, "scientific_operations_submitted": False,
              "scope": "Original request and possible child IDs in this configured workspace; read-only journal inspection"}
    try:
        corr = correspondence(workspace, parameters.get("correspondence_object_id"), api)
        fft_settings, peak_settings, _, size = settings(parameters, api)
    except Exception as error:
        result["inspection_error"] = {"code": getattr(error, "code", "INSPECTION_FAILED"), "message": str(error)}
        return result

    def inspect(ident, operation, role, frame_index, expected, origin="original_child"):
        entry = {"request_id": ident, "action": operation, "role": role, "frame_index": frame_index, "origin": origin}
        path = workspace.root / "requests" / (ident+".json")
        if not path.exists():
            entry["state"] = "not_submitted"
        else:
            try:
                record = api.read_json(path)
                original = record.get("parameters")
                api.need(type(original) is dict and record.get("request_id") == ident and original.get("request_id") == ident and
                         original.get("action") == operation and original.get("workspace") == str(workspace.root) and
                         record.get("parameters_sha256") == hashlib.sha256(api.canonical(original)).hexdigest(),
                         "Child original request identity or parameters changed", "CORRUPT_OBJECT")
                if expected is None or not all(original.get(k) == value for k, value in expected.items()):
                    entry.update(state="unverified_relationship" if expected is None else "unrelated",
                                 validated=False, original_state=record.get("state"),
                                 inspection_error={"code": "CHILD_SCOPE_UNVERIFIED" if expected is None else "CHILD_SCOPE_MISMATCH",
                                                   "message": "This journal is not proven to match the original parent's exact scientific input/parameters; do not treat it as a completed parent child"})
                    result["children"].append(entry)
                    return None
                state = record.get("state")
                api.need(state in ("prepared", "completed", "failed"), "Unknown child journal state", "CORRUPT_OBJECT")
                entry["state"] = state
                if state in ("completed", "failed"):
                    response = record.get("response")
                    api.need(type(response) is dict and response.get("request_id") == ident,
                             "Child result identity changed", "CORRUPT_OBJECT")
                    if state == "completed":
                        child, _ = workspace.object(response.get("object_id"))
                        api.need(child.get("request_id") == ident, "Child scientific object belongs to another request", "CORRUPT_OBJECT")
                        entry.update(object_id=child["object_id"], kind=child["kind"], validated=True)
                        result["children"].append(entry)
                        return child
                    else:
                        entry["error"] = response.get("error")
            except Exception as error:
                entry["state"] = "corrupt" if getattr(error, "code", None) == "CORRUPT_OBJECT" else "unknown"
                entry["inspection_error"] = {"code": getattr(error, "code", "INSPECTION_FAILED"), "message": str(error)}
        result["children"].append(entry)
        return None

    for row in corr["rows"]:
        if row["status"] != "VERIFIED":
            continue
        index = row["frame_index"]
        batch_id = automation.child_request_id(parent_id, "frame-%d-fft-batch" % index)
        inspect(batch_id, "fft_batch", "fft-batch", index,
                {"object_id": row["selected_object_id"], "rects": [row["target_rect"]], "max_size": size, **fft_settings})
        view = inspect(automation.child_request_id(batch_id, "context-view"), "view", "fft-batch/context-view", index,
                       {"object_id": row["selected_object_id"], "max_size": size})
        context_marks = [{"annotation_id": "region-1", "kind": "rectangle", "source_object_id": view["panels"][0]["source_object_id"],
                          "coordinate_space": "source_pixels", "coordinates": row["target_rect"], "text": "R1", "status": "hypothesized", "color": "cyan"}] if view else None
        inspect(automation.child_request_id(batch_id, "context-regions"), "annotate", "fft-batch/context-regions", index,
                {"object_id": view["object_id"], "annotations": context_marks} if view else None)
        inspect(automation.child_request_id(batch_id, "roi-0"), "view", "fft-batch/roi-0", index,
                {"object_id": row["selected_object_id"], "rect": row["target_rect"], "max_size": size})
        fft = inspect(automation.child_request_id(batch_id, "fft-0"), "fft", "fft-batch/fft-0", index,
                      {"object_id": row["selected_object_id"], "rect": row["target_rect"], "max_size": size, **fft_settings})
        peak_id = automation.child_request_id(parent_id, "frame-%d-peaks" % index)
        peaks = inspect(peak_id, "peaks", "peaks", index, {"object_id": fft["object_id"], "max_size": size, **peak_settings} if fft else None)
        measure_id = automation.child_request_id(parent_id, "frame-%d-measurements" % index)
        inspect(measure_id, "peak_measurements", "measurements", index,
                {"object_id": peaks["object_id"], "max_peaks": peak_settings["max_peaks"]} if peaks else None)
        updates = []
        for ordinal in range(peak_settings["max_peaks"]):
            label = "measure-%d" % ordinal
            peak = peaks["peak_table"][ordinal] if peaks and ordinal < len(peaks["peak_table"]) else None
            point = inspect(automation.child_request_id(measure_id, label), "measure", "measurements/"+label, index,
                            {"object_id": peaks["object_id"], "coordinate_space": "frequency_cycles_per_pixel",
                             "points": [[0, 0], peak["frequency_cycles_per_pixel"]]} if peak else None)
            if point:
                updates.append({"annotation_id": peak["peak_id"], "presentation": {"label": {"measurement_object_id": point["object_id"], "measurement_kind": "period"}}})
        inspect(automation.child_request_id(measure_id, "measured-view"), "annotate", "measurements/measured-view", index,
                {"object_id": peaks["object_id"], "updates": updates} if peaks and len(updates) == min(len(peaks["peak_table"]), peak_settings["max_peaks"]) else None)
        # A correction may have been inherited from a previous joint record.
        # Without validated predecessor context do not claim its child belongs
        # here merely because the deterministic ID and action happen to match.
        inspect(automation.child_request_id(parent_id, "frame-%d-corrected-view" % index), "annotate", "corrected-view", index, None)
    if parameters.get("previous_observations_id"):
        try:
            previous, _ = workspace.object(parameters["previous_observations_id"])
            api.need(previous.get("kind") == "joint_observations", "Previous observation is not a joint record")
            if previous["fft_parameters"] == fft_settings:
                for row in corr["rows"]:
                    prior = next((p for p in previous["frame_observations"] if p["status"] == "VERIFIED" and
                                  p["selected_object_id"] == row["selected_object_id"] and p["target_rect"] == row["target_rect"]), None)
                    if not prior:
                        continue
                    inspect(prior["fft_batch_request_id"], "fft_batch", "fft-batch", row["frame_index"],
                            {"object_id": row["selected_object_id"], "rects": [row["target_rect"]], **fft_settings}, "available_previous_result")
                    inspect(prior["fft_request_id"], "fft", "fft", row["frame_index"],
                            {"object_id": row["selected_object_id"], "rect": row["target_rect"], **fft_settings}, "available_previous_result")
                    if previous["peak_parameters"] == peak_settings:
                        inspect(prior["peaks_request_id"], "peaks", "peaks", row["frame_index"],
                                {"object_id": prior["fft_object_id"], **peak_settings}, "available_previous_result")
                        inspect(prior["peak_measurements_request_id"], "peak_measurements", "measurements", row["frame_index"],
                                {"object_id": prior["peaks_object_id"], "max_peaks": peak_settings["max_peaks"]}, "available_previous_result")
        except Exception as error:
            result["previous_result_inspection_error"] = {"code": getattr(error, "code", "INSPECTION_FAILED"), "message": str(error)}
    api.need(len(result["children"]) <= 256, "Partial joint recovery exceeds bounded child count", "BUDGET_EXCEEDED")
    return result


def action(workspace, name, request, metadata, directory, api):
    corr = correspondence(workspace, request.get("correspondence_object_id"), api)
    fft_settings, peak_settings, tolerance, size = settings(request, api)
    verified = [r for r in corr["rows"] if r["status"] == "VERIFIED"]
    api.need(sum((r["target_rect"][2]-r["target_rect"][0])*(r["target_rect"][3]-r["target_rect"][1]) for r in verified) <= api.MAX_PIXELS,
             "Joint total FFT pixels exceed4194304", "BUDGET_EXCEEDED")
    api.need(all(min(r["target_rect"][2]-r["target_rect"][0], r["target_rect"][3]-r["target_rect"][1]) >= 4 for r in verified),
             "Every verified FFT ROI requires at least4 by4 pixels")
    selected_overrides = overrides(request, {r["frame_index"] for r in verified}, api)
    previous_rows = []
    if request.get("previous_observations_id"):
        previous, _ = workspace.object(request["previous_observations_id"])
        api.need(previous.get("kind") == "joint_observations", "previous_observations_id must select saved joint observations")
        if previous["fft_parameters"] == fft_settings:
            previous_rows = [r for r in previous["frame_observations"] if r["status"] == "VERIFIED"]
    # Validate every explicit corrected measurement before creating any child.
    reuse = {}
    for row in verified:
        prior = next((r for r in previous_rows if r["selected_object_id"] == row["selected_object_id"] and r["target_rect"] == row["target_rect"]), None)
        reuse[row["frame_index"]] = prior
        if row["frame_index"] in selected_overrides:
            api.need(prior is not None, "Measurement overrides require previous observations with the unchanged exact frame/ROI/FFT settings")
            fft, _ = workspace.object(prior["fft_object_id"])
            for ident in selected_overrides[row["frame_index"]]:
                measurement_row(workspace, ident, fft, api)
    child_plan = [{"frame_index": row["frame_index"], "label": "frame-%d-%s" % (row["frame_index"], suffix),
                   "request_id": automation.child_request_id(request["request_id"], "frame-%d-%s" % (row["frame_index"], suffix))}
                  for row in verified for suffix in ("fft-batch", "peaks", "measurements", "corrected-view")]
    api.write_new(directory / "child-plan.json", api.canonical({"parent_request_id": request["request_id"], "possible_children": child_plan,
                  "note": "Possible original IDs, including skipped reused children; missing IDs mean not submitted. Query only; do not replay an unknown parent."})+b"\n")
    frames, pictures = [], []
    for row in corr["rows"]:
        item = {key: row.get(key) for key in ("frame_index", "selected_object_id", "target_rect", "status")}
        item["measurements"] = []
        if row["status"] != "VERIFIED":
            item.update(not_comparable_reason=row["status"], fft_reused=False)
            frames.append(item)
            continue
        index, prior = row["frame_index"], reuse[row["frame_index"]]
        prefix = "frame-%d-" % index
        if prior:
            batch, _ = workspace.object(prior["fft_batch_object_id"])
        else:
            batch = automation.run_child(workspace, request, prefix+"fft-batch", "fft_batch", object_id=row["selected_object_id"],
                                         rects=[row["target_rect"]], max_size=size, **fft_settings)
        region = batch["regions"][0]
        fft, _ = workspace.object(region["fft_object_id"])
        if prior and previous["peak_parameters"] == peak_settings:
            peaks, _ = workspace.object(prior["peaks_object_id"])
            measured, _ = workspace.object(prior["peak_measurements_object_id"])
        else:
            peaks = automation.run_child(workspace, request, prefix+"peaks", "peaks", object_id=fft["object_id"], max_size=size, **peak_settings)
            measured = automation.run_child(workspace, request, prefix+"measurements", "peak_measurements", object_id=peaks["object_id"], max_peaks=peak_settings["max_peaks"])
        override_ids = selected_overrides.get(index)
        override_source = {"request_id": request["request_id"], "frame_index": index} if override_ids is not None else None
        if override_ids is None and prior and prior.get("override_measurement_object_ids") is not None:
            # A later tolerance/display/detector revision must not silently
            # resurrect old detector locations after a saved human correction.
            override_ids, override_source = prior["override_measurement_object_ids"], prior["override_source"]
        ids = override_ids if override_ids is not None else [r["measurement_object_id"] for r in measured["measurements"]]
        records = [measurement_row(workspace, ident, fft, api) for ident in ids]
        if override_ids is not None:
            shown = automation.run_child(workspace, request, prefix+"corrected-view", "annotate", object_id=peaks["object_id"],
                                         annotations=_override_marks(records, fft["object_id"]))
        else:
            shown, _ = workspace.object(measured["view_object_id"])
        item.update(fft_batch_object_id=batch["object_id"], fft_batch_request_id=batch["request_id"],
                    overview_object_id=batch["overview_object_id"], roi_object_id=region["roi_object_id"],
                    fft_object_id=fft["object_id"], fft_request_id=fft["request_id"], fft_reused=prior is not None,
                    peaks_object_id=peaks["object_id"], peaks_request_id=peaks["request_id"],
                    peak_measurements_object_id=measured["object_id"], peak_measurements_request_id=measured["request_id"],
                    view_object_id=shown["object_id"], source_context=batch["source_context"], shape_yx=fft["shape_yx"],
                    frequency_axes=fft["frequency_axes"], xy_calibration=fft.get("xy_calibration"), measurements=records,
                    override_measurement_object_ids=override_ids, override_source=override_source,
                    array_sha256=fft["files_sha256"]["data.npy"], computation=fft["computation"])
        frames.append(item)
        overview, _ = workspace.object(batch["overview_object_id"])
        roi, _ = workspace.object(region["roi_object_id"])
        pictures.extend([("Frame%d original / ROI" % index, overview), ("Frame%d scientific ROI" % index, roi), ("Frame%d FFT reflections" % index, shown)])
    table = match_observations(frames, corr["reference_index"], tolerance)
    automation.contact_sheet(directory, pictures, api)
    api.write_new(directory / "observations.json", api.canonical({"coordinate_space": "frequency_cycles_per_pixel", "rows": table})+b"\n")
    api.write_new(directory / "observations.csv", _csv(table, frames, corr["sequence_object_id"]))
    metadata.update(correspondence_object_id=corr["object_id"], sequence_object_id=corr["sequence_object_id"], reference_index=corr["reference_index"],
                    sequence_axis=corr["sequence_axis"], frame_observations=frames, observations=table, fft_parameters=fft_settings, peak_parameters=peak_settings,
                    frequency_tolerance_cycles_per_pixel=tolerance, previous_observations_id=request.get("previous_observations_id"),
                    table_path=str(directory / "observations.csv"), observations_path=str(directory / "observations.json"),
                    child_plan_path=str(directory / "child-plan.json"), scientific_data_changed=False,
                    matching="Mutual unique actual DC-to-peak vectors within explicit Euclidean cycles/pixel tolerance; no rank/ID matching, fitting, rotation or normalization",
                    child_recovery="Query original IDs in child-plan.json and frame_observations with image_result; never replay unknown work. Reused children retain their original IDs.",
                    limitations=["Observed means geometrically corresponding under explicit tolerance, not proof of unchanged structure or phase",
                                 "Not detected means absent from the bounded selected peak set, not proven physical disappearance",
                                 "Ambiguous matches are retained without forced assignment; unmatched target observations are retained",
                                 "Coordinate correspondence across reconstruction slices does not prove continuous structure or axial resolution",
                                 "Neighbor frames and conjugate FFT peaks are not independent confidence samples",
                                 "No averaging, phase identification, twin/dislocation conclusion or FFT-versus-SAED intensity equivalence"],
                    interpretation_status="hypothesized", contact_sheet_is_display_only=True)
    return metadata
