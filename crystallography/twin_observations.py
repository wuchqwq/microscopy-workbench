"""Read-only bindings from saved spatial observations to twin hypotheses.

This adapter selects exact scientific rectangles, never sample ranks or labels.
It reuses the image provider's full immutable-object validators and existing
reciprocal conversion. It does not find peaks, compute FFTs, fit orientations,
match reflections or maintain a second source/current-state database.
"""
from crystallography.analysis_revision import bind_geometry
from crystallography.reflection_compare import load_measurement, measurement_vector
from crystallography.registration_proposal import geometry_binding
from tools import image_workspace as api
from tools import image_active_analysis as decisions
from tools import image_calibration as calibration
from tools import image_joint as joint
from tools import image_spatial_domains as spatial


SUPPORTED_FIELDS = ("spatial_field", "field_extend", "domain_map", "spatial_atlas")
MAX_EVIDENCE_BYTES = 2 * 1024 * 1024


def _same(left, right):
    return api.canonical(left) == api.canonical(right)


def _id(value, label):
    api.need(type(value) is str and api.OBJECT_ID.fullmatch(value),
             label + " must be an explicit saved object ID")
    return value


def _source_frame(images, selected_id):
    frame, directory, _ = images.measurement_operand(selected_id)
    api.need(frame.get("kind") == "frame" and
             frame.get("array_domain") not in ("frequency", "reciprocal"),
             "Select one immutable spatial frame/calibration wrapper")
    return frame, directory


def _source_matches(frame, directory, expected, expected_directory):
    api.need(frame["object_id"] == expected["object_id"] and
             frame.get("source_object_id") == expected.get("source_object_id") and
             _same(frame.get("source_identity"), expected.get("source_identity")) and
             frame.get("frame_index") == expected.get("frame_index") and
             frame.get("shape_yx") == expected.get("shape_yx") and
             frame.get("dtype") == expected.get("dtype") and
             frame["files_sha256"]["data.npy"] == expected["files_sha256"]["data.npy"] and
             api.sha_file(directory / "data.npy") == api.sha_file(expected_directory / "data.npy"),
             "Observations belong to a different spatial source/frame/array",
             "MEASUREMENT_SCOPE_MISMATCH")


def _select_observation(images, specification, current, current_directory):
    selected, selected_directory = images.object(specification["field_object_id"])
    api.need(selected.get("kind") in SUPPORTED_FIELDS,
             "Domain references require spatial_field, field_extend, domain_map or spatial_atlas")
    field, field_directory = selected, selected_directory
    if selected["kind"] == "domain_map":
        field, field_directory = images.object(selected["parent_object_id"])
        api.need(field.get("kind") in ("spatial_field", "field_extend"),
                 "Domain map does not reference a saved spatial field", "CORRUPT_OBJECT")
    frame, frame_directory = _source_frame(images, field["parent_object_id"])
    _source_matches(frame, frame_directory, current, current_directory)
    api.need(_same(field.get("xy_calibration"), current.get("xy_calibration")),
             "Saved observation uses a different current spatial calibration; revise the observations first",
             "MEASUREMENT_SCOPE_MISMATCH")
    rect = api.rectangle(specification["rect_xyxy"], current["shape_yx"])
    rows = field["regions"] if field["kind"] == "spatial_atlas" else field["samples"]
    rect_key = "rect" if field["kind"] == "spatial_atlas" else "rect_xyxy"
    matches = [row for row in rows if row.get(rect_key) == rect]
    api.need(len(matches) == 1, "Select exactly one saved observation by its exact source-pixel rectangle")
    row = matches[0]
    if field["kind"] != "spatial_atlas":
        api.need(row.get("frame_identity", {}).get("frame_object_id") == current["object_id"] and
                 row.get("source_array", {}).get("array_sha256") == current["files_sha256"]["data.npy"],
                 "Saved sample has a different frame/source array", "MEASUREMENT_SCOPE_MISMATCH")
    # Use the existing scientific key descriptor also for an atlas. A domain-map
    # wrapper is deliberately unwrapped: its parent is a field, not the source.
    key_field = field if field["kind"] != "spatial_atlas" else {
        "parent_object_id": field["parent_object_id"],
        "samples": [{"source_array": {"array_sha256": current["files_sha256"]["data.npy"]}}],
        "fft_parameters": field["fft_parameters"], "peak_parameters": field["peak_parameters"],
        "xy_calibration": field.get("xy_calibration"),
    }
    key = decisions.observation_key(key_field, rect, api)
    api.need(row.get("observation_key", key) == key,
             "Saved scientific observation key differs from its source/settings", "CORRUPT_OBJECT")
    return selected, selected_directory, field, field_directory, row, rect, key


def _load_measurement(images, ident):
    committed, directory = images.committed_measurement(ident)
    measured, source, raw, journal = load_measurement(directory / "object.json")
    api.need(_same(committed, measured), "Measurement changed during immutable evidence loading", "CORRUPT_OBJECT")
    return measured, source, raw, journal


def _quality(selected, row, rect):
    """Keep metric availability separate from scientific evidence admission."""
    reasons = []
    status = row.get("status")
    quality = row.get("quality", row.get("detection_quality"))
    if selected["kind"] == "spatial_atlas":
        if status != "observed":
            reasons.append("Saved atlas observation is not observed")
        detector = row.get("detection_quality") or {}
    else:
        if status != "valid":
            reasons.append("Saved field observation status is not valid: " + str(status))
        detector = (quality or {}).get("detector") or {}
        if (quality or {}).get("detection_truncated") is not False:
            reasons.append("Saved field signature completeness is truncated or unresolved")
    if row.get("invalid_reasons"):
        reasons.extend(str(reason) for reason in row["invalid_reasons"])
    if detector.get("selection_limit_reached") is not False:
        reasons.append("Saved peak detector reached its selection limit or completeness is unresolved")
    map_status, map_reason = None, None
    if selected["kind"] == "domain_map":
        mapped = [sample for sample in selected["samples"] if sample.get("rect_xyxy") == rect]
        api.need(len(mapped) == 1, "Domain map has no unique selected source rectangle", "CORRUPT_OBJECT")
        map_status = mapped[0].get("domain_status")
        map_reason = mapped[0].get("domain_unknown_reason")
        if map_status != "candidate":
            reasons.append("Saved domain-map support is unknown or masked: " + str(map_status))
        if map_reason:
            reasons.append(str(map_reason))
    return {"evidence_quality_ready": not reasons,
            "evidence_quality_reasons": list(dict.fromkeys(reasons)),
            "observation_status": status, "invalid_reasons": row.get("invalid_reasons", []),
            "quality": quality, "domain_status": map_status, "domain_unknown_reason": map_reason}


def _domain(images, specification, current, current_directory):
    selected, selected_directory, field, field_directory, row, rect, key = _select_observation(
        images, specification, current, current_directory)
    fft, fft_directory = images.object(row["fft_object_id"])
    api.need(fft.get("kind") == "fft" and fft.get("source_rect_xyxy") == rect,
             "Saved observation FFT has another source ROI", "MEASUREMENT_SCOPE_MISMATCH")
    fft_frame, fft_frame_directory = _source_frame(images, fft["parent_object_id"])
    _source_matches(fft_frame, fft_frame_directory, current, current_directory)
    selected_fft, _, _ = images.measurement_operand(specification["current_image_object_id"])
    api.need(selected_fft.get("kind") in ("fft", "fft_view"),
             "Each current_image_object_id must select that observation's saved FFT")
    grid = images.measurement_grid_identity(fft["object_id"])
    api.need(images.measurement_grid_identity(specification["current_image_object_id"]) == grid and
             _same(selected_fft.get("xy_calibration"), current.get("xy_calibration")) and
             _same(fft.get("xy_calibration"), current.get("xy_calibration")),
             "Current FFT uses a different source/ROI/grid or calibration revision",
             "MEASUREMENT_SCOPE_MISMATCH")
    available = row.get("measurement_object_ids")
    api.need(type(available) is list and len(set(available)) == len(available),
             "Saved observation has invalid measurement references", "CORRUPT_OBJECT")
    identities = specification.get("measurement_object_ids", available)
    api.need(type(identities) is list and len(identities) <= 16 and
             all(type(ident) is str and api.OBJECT_ID.fullmatch(ident) for ident in identities) and
             len(set(identities)) == len(identities) and set(identities) <= set(available),
             "Select at most16 distinct measurements from this exact saved observation")
    measurements, sources, paths, pixels, physical, evidence_bytes = [], [], [], [], [], 0
    record = current.get("xy_calibration")
    active = calibration.active_scale(record) is not None
    for ident in identities:
        measured, source, raw, journal = _load_measurement(images, ident)
        api.need(_same(measured.get("xy_calibration"), record) and
                 measured.get("calibration_dependency") == calibration.dependency(record),
                 "Measurement uses a different current calibration revision", "MEASUREMENT_SCOPE_MISMATCH")
        pixels.append(joint.measurement_row(images, ident, fft, api))
        if active:
            physical.append(measurement_vector(measured))
        measurements.append(measured)
        sources.append(source)
        paths.append(source["path"])
        evidence_bytes += len(raw) + len(journal)
    binding = {
        "analysis_mode": "continue_current", "current_geometry_checked": True,
        "current_image_object_id": specification["current_image_object_id"],
        "resolved_image_object_id": selected_fft["object_id"], "scientific_grid_identity": grid,
        "calibration_dependency": calibration.dependency(record),
        "semantics": "Explicit selected immutable FFT revision; no global latest/front-state lookup",
    }
    if active and measurements:
        binding = bind_geometry(measurements, sources, specification["current_image_object_id"], "continue_current")
    reasons = []
    if not active:
        reasons.append("No active operational real-space XY calibration; saved pixel/frequency geometry remains available")
    if not measurements:
        reasons.append("No saved DC-to-peak measurements were selected for this observation")
    quality = _quality(selected, row, rect)
    reasons.extend(quality["evidence_quality_reasons"])
    return {
        "field_object_id": selected["object_id"], "field_kind": selected["kind"],
        "field_manifest_sha256": api.sha_file(selected_directory / "object.json"),
        "resolved_field_object_id": field["object_id"],
        "resolved_field_manifest_sha256": api.sha_file(field_directory / "object.json"),
        "rect_xyxy": rect, "observation_key": key,
        "fft_object_id": fft["object_id"], "fft_manifest_sha256": api.sha_file(fft_directory / "object.json"),
        "fft_array_sha256": fft["files_sha256"]["data.npy"],
        "current_image_object_id": specification["current_image_object_id"],
        "measurement_object_ids": list(identities), "measurements": measurements,
        "sources": sources, "measurement_paths": paths,
        "pixel_observations": pixels, "physical_observations": physical,
        "physical_ready": active and bool(measurements), "insufficient_reasons": reasons,
        "analysis_binding": binding,
        "experimental_geometry_binding": geometry_binding(measurements) if active and measurements else None,
        **quality,
        "fft_recomputed": False,
    }, evidence_bytes


def _interface(images, ident, current):
    measured, source, raw, journal = _load_measurement(images, _id(ident, "interface_measurement_object_id"))
    api.need(measured.get("coordinate_space") == "source_pixels",
             "Interface evidence requires a saved spatial source_pixels two-point measurement")
    parent, _, _ = images.measurement_operand(measured["parent_object_id"])
    grid = images.measurement_grid_identity(measured["parent_object_id"])
    record = current.get("xy_calibration")
    api.need(parent.get("kind") in ("frame", "view") and
             grid.get("coordinate_space") == "source_pixels" and
             grid.get("source_grid_object_id") == current["object_id"] and
             _same(parent.get("xy_calibration"), record) and
             _same(measured.get("xy_calibration"), record) and
             measured.get("calibration_dependency") == calibration.dependency(record),
             "Interface measurement belongs to another spatial source or current calibration revision",
             "MEASUREMENT_SCOPE_MISMATCH")
    points = measured.get("points")
    bounds = api.rectangle(grid["source_rect_xyxy"], current["shape_yx"])
    api.need(type(points) is list and len(points) == 2 and
             all(type(point) is list and len(point) == 2 and all(api.number(v) for v in point) and
                 bounds[0] <= point[0] <= bounds[2]-1 and bounds[1] <= point[1] <= bounds[3]-1 for point in points),
             "Interface measurement has invalid source-pixel anchors", "MEASUREMENT_SCOPE_MISMATCH")
    delta = [points[1][axis] - points[0][axis] for axis in (0, 1)]
    api.need(any(v != 0 for v in delta), "Interface line requires two distinct saved spatial points")
    geometry = calibration.geometry(*delta, record)
    api.need(all(measured.get(name) == value for name, value in geometry.items()),
             "Saved interface geometry contradicts its signed calibration", "MEASUREMENT_SCOPE_MISMATCH")
    ready = calibration.active_scale(record) is not None
    return {
        "measurement": measured, "source": source, "measurement_path": source["path"],
        "manifest_text": raw.decode("utf-8"), "journal_text": journal.decode("utf-8"),
        "points": points, "source_rect_xyxy": bounds, "scientific_grid_identity": grid,
        "pixel_vector_xy": delta, "physical_vector_xy": geometry.get("physical_vector_xy"),
        "physical_unit": geometry.get("physical_unit"), "calibration_dependency": calibration.dependency(record),
        "physical_ready": ready,
        "insufficient_reasons": [] if ready else ["No active operational XY calibration; interface line remains pixel geometry"],
        "interpretation": "Saved projected line evidence; not an independently located or identified interface plane",
    }, len(raw) + len(journal)


def load_domains(image_root, domains, current_spatial_image_object_id,
                 interface_measurement_object_id=None):
    """Return serializable authoritative bindings for exactly two adjacent ROIs.

    Each domain is {field_object_id, rect_xyxy, current_image_object_id,
    measurement_object_ids?}. Missing/withdrawn calibration is insufficient
    physical evidence; source, ROI, grid and current-revision contradictions
    are refusals. File paths and hashes identify bytes the caller may freeze.
    """
    api.need(type(domains) is list and len(domains) == 2,
             "Supply exactly two explicit saved domain references")
    required = {"field_object_id", "rect_xyxy", "current_image_object_id"}
    for specification in domains:
        api.need(type(specification) is dict and required <= set(specification) <= required | {"measurement_object_ids"},
                 "Each domain needs field_object_id, rect_xyxy and current_image_object_id")
        _id(specification["field_object_id"], "field_object_id")
        _id(specification["current_image_object_id"], "current_image_object_id")
    images = api.Workspace(image_root, writable=False)
    spatial_id = _id(current_spatial_image_object_id, "current_spatial_image_object_id")
    current, current_directory = _source_frame(images, spatial_id)
    _, selected_directory = images.object(spatial_id)
    loaded, evidence_bytes = [], 0
    for specification in domains:
        result, count = _domain(images, specification, current, current_directory)
        loaded.append(result)
        evidence_bytes += count
    api.need(loaded[0]["rect_xyxy"] != loaded[1]["rect_xyxy"],
             "Two domain references cannot select the same source-pixel observation")
    adjacency = spatial._contact_geometry(loaded[0], loaded[1])
    api.need(adjacency["support_relation"] in ("overlap", "shared_edge"),
             "Domain supports must overlap or share a positive edge; gaps and corner-only contact do not establish adjacency",
             "MEASUREMENT_SCOPE_MISMATCH")
    interface, interface_bytes = (_interface(images, interface_measurement_object_id, current)
                                  if interface_measurement_object_id is not None else (None, 0))
    evidence_bytes += interface_bytes
    api.need(evidence_bytes <= MAX_EVIDENCE_BYTES,
             "Fixed domain/interface measurement evidence exceeds2MiB", "BUDGET_EXCEEDED")
    record = current.get("xy_calibration")
    reasons = [reason for side in loaded for reason in side["insufficient_reasons"]]
    if interface:
        reasons.extend(interface["insufficient_reasons"])
    return {
        "source_binding": {
            "current_spatial_image_object_id": spatial_id,
            "current_spatial_manifest_sha256": api.sha_file(selected_directory / "object.json"),
            "frame_object_id": current["object_id"], "source_object_id": current.get("source_object_id"),
            "source_identity": current.get("source_identity"), "frame_index": current.get("frame_index"),
            "source_array_sha256": current["files_sha256"]["data.npy"],
            "shape_yx": current["shape_yx"], "dtype": current["dtype"],
            "xy_calibration": record, "calibration_dependency": calibration.dependency(record),
            "source_capture_files_sha256": current.get("source_capture_files_sha256"),
        },
        "domains": loaded, "adjacency": adjacency, "interface": interface,
        "physical_ready": all(side["physical_ready"] for side in loaded),
        "evidence_quality_ready": all(side["evidence_quality_ready"] for side in loaded),
        "insufficient_reasons": list(dict.fromkeys(reasons)),
        "evidence_bytes": evidence_bytes, "supported_field_kinds": list(SUPPORTED_FIELDS),
        "scientific_arrays_changed": False, "fft_recomputed": False,
    }
