"""Explicit bounded projections of fully qualified immutable image evidence.

These transport views never replace an object manifest or its original journal.
They perform no scientific work and never write a provider request or object.
"""
import copy
import hashlib

FIELDS = {"evidence": {"object_id", "manifest_sha256", "section", "offset", "limit"}}
COMPACT_ACTIONS = {"get", "result", "spatial_field", "domain_map", "field_extend", "analysis_candidates"}
SECTIONS = {"samples": "samples", "actions": "actions", "neighbors": "edges", "domains": "domains",
            "boundary_bands": "boundary_bands", "increment_history": "increment_history"}
MAX_DETAIL_BYTES = 128 * 1024


def _binding(workspace, metadata, api):
    ident = metadata.get("object_id")
    api.need(type(ident) is str and api.OBJECT_ID.fullmatch(ident), "Committed evidence object identity required", "CORRUPT_OBJECT")
    own, directory = workspace._object_record(ident)
    api.need(all(metadata.get(key) == value for key, value in own.items()), "Evidence return differs from its qualified manifest", "CORRUPT_OBJECT")
    # Bind the digest to these exact decoded bytes, not a later blind path hash.
    raw = (directory / "object.json").read_bytes()
    api.need(api.strict_json(raw.decode("utf-8")) == own, "Evidence manifest changed after qualification", "CORRUPT_OBJECT")
    digest = hashlib.sha256(raw).hexdigest()
    journal = api.read_json(workspace.root / "requests" / (own["request_id"] + ".json"))
    api.need(journal.get("object_manifest_sha256") == digest and journal.get("response") ==
             {"ok": True, "state": "completed", "backend": api.BACKEND, "request_id": own["request_id"], **own},
             "Evidence digest does not bind the original committed response", "CORRUPT_OBJECT")
    return own, digest


def _take(record, names):
    return {name: copy.deepcopy(record[name]) for name in names if name in record}


def summary(workspace, metadata, api):
    own, digest = _binding(workspace, metadata, api)
    structural = own.get("kind") in ("spatial_field", "field_extend", "domain_map", "analysis_candidates")
    selected = _take(own, (
        "object_id", "kind", "backend", "request_id", "manifest_path", "image_path", "parent_object_id", "base_field_object_id",
        "base_field_manifest_sha256", "base_manifest_sha256", "field_object_id", "field_manifest_sha256", "source_selected_object_id", "source_domain_map_id",
        "source_domain_map_manifest_sha256", "overview_object_id", "source_manifest_sha256", "source_kind", "source_context",
        "coordinate_domain", "coordinate_unit", "period_unit", "xy_calibration", "shape_yx", "dtype", "frame_index", "rect_xyxy",
        "fft_parameters", "peak_parameters", "algorithm_version", "neighbor_policy", "neighbor_policy_version", "angles_degrees",
        "orientation_angles_degrees", "tolerance", "interpretation_status", "uncertainty", "limitations", "budget", "progress",
        "stopping", "candidate_scales", "selection_policy", "actions", "recommended_action_ids", "reserved_exploration_action_ids",
        "costs", "new_fft_count", "reused_fft_count", "executed_scientific_operations", "scientific_data_changed", "sampling_rounds"))
    # Do not invent projections for unrelated scientific schemas. Usually-small
    # ordinary image/measurement records retain every original semantic field.
    if not structural:
        selected = copy.deepcopy(own)
    selected.update(state="completed", evidence_format="image-evidence-summary-v1", authoritative_record=False,
                    inline_image=False,
                    manifest_sha256=digest,
                    provider_scope={"provider": api.BACKEND, "workspace": str(workspace.root), "session": "workspace-journal-v1"},
                    full_record={"tool": "image_info", "arguments": {"object_id": own["object_id"]}},
                    original_request={"tool": "image_result", "arguments": {"request_id": own["request_id"]}},
                    detail_tool="image_evidence")
    if own.get("image_path"):
        selected["preview_ref"] = {"tool": "image_info", "arguments": {"object_id": own["object_id"], "response_detail": "full"}}
    selected.setdefault("calibration_status", (own.get("xy_calibration") or {}).get("status", "unknown"))
    if structural and "sampling_plan" in own:
        selected["sampling_plan"] = {key: copy.deepcopy(value) for key, value in own["sampling_plan"].items() if key != "samples"}
    selected["collection_counts"] = {section: len(own[key]) for section, key in SECTIONS.items() if type(own.get(key)) is list}
    if structural and type(own.get("samples")) is list:
        field = own
        if own["kind"] == "domain_map":
            field, _ = workspace._object_record(own["parent_object_id"])
        elif own["kind"] == "analysis_candidates":
            field, _ = workspace._object_record(own["field_object_id"])
        rows = []
        for sample in own["samples"]:
            row = _take(sample, ("observation_key", "sample_index", "scale_pixels", "rect_xyxy", "center_xy", "fft_object_id", "fft_array_sha256",
                                 "roi_object_id", "peaks_object_id", "measurement_object_ids", "view_object_id", "status", "quality",
                                 "validity_mask", "domain_status", "domain_unknown_reason", "invalid_reasons", "uncertainty", "source_status",
                                 "source_array", "scientific_grid_identity", "selected_object_id", "source_identity", "frame_identity", "xy_calibration"))
            if field.get("kind") in ("spatial_field", "field_extend"):
                row["observation_key"] = api.active_analysis.observation_key(field, sample["rect_xyxy"], api)
            rows.append(row)
        selected["samples"] = rows
    if structural and type(own.get("domains")) is list:
        selected["domains"] = _take_domains(own["domains"])
    if len(api.canonical(selected)) > MAX_DETAIL_BYTES:
        error = api.WorkspaceError("EVIDENCE_BUDGET_EXCEEDED", "Compact evidence exceeds128 KiB; query the original ID in full or request a bounded detail page; do not resubmit scientific work")
        error.manifest_sha256 = digest
        error.detail_section = next((section for section, key in SECTIONS.items() if type(own.get(key)) is list), None)
        raise error
    return selected


def _take_domains(rows):
    return [_take(row, ("domain_id", "status", "scale_pixels", "sample_indices", "support_rects", "interpretation")) for row in rows]


def detail(workspace, request, api):
    metadata, _ = workspace.object(request.get("object_id"))
    own, digest = _binding(workspace, metadata, api)
    expected = request.get("manifest_sha256")
    api.need(type(expected) is str and len(expected) == 64 and all(v in "0123456789abcdef" for v in expected), "Explicit64hex manifest_sha256 required")
    api.need(expected == digest, "Evidence request refers to another immutable manifest", "EVIDENCE_MANIFEST_MISMATCH")
    section, offset, limit = request.get("section"), request.get("offset", 0), request.get("limit", 4)
    api.need(section == "summary" or section in SECTIONS, "Unsupported bounded evidence section")
    api.need(api.integer(offset, 0, 4096) and api.integer(limit, 1, 8), "Evidence offset0..4096 and limit1..8 required")
    if section == "summary":
        api.need(offset == 0, "Summary does not support a nonzero offset")
        return summary(workspace, metadata, api)
    collection = own.get(SECTIONS[section])
    api.need(type(collection) is list, "This object has no requested evidence collection", "EVIDENCE_SECTION_UNAVAILABLE")
    api.need(offset <= len(collection), "Evidence offset exceeds the exact collection length")
    stop = min(len(collection), offset + limit)
    result = {"state": "completed", "backend": api.BACKEND, "object_id": own["object_id"], "kind": own["kind"], "request_id": own["request_id"],
              "evidence_format": "image-evidence-detail-v1", "authoritative_record": False, "manifest_sha256": digest,
              "provider_scope": {"provider": api.BACKEND, "workspace": str(workspace.root), "session": "workspace-journal-v1"},
              "section": section, "collection": SECTIONS[section], "offset": offset, "limit": limit, "total_count": len(collection),
              "rows": copy.deepcopy(collection[offset:stop]), "next_offset": stop if stop < len(collection) else None,
              "scientific_data_changed": False, "new_fft_count": 0,
              "full_record": {"tool": "image_info", "arguments": {"object_id": own["object_id"]}}}
    api.need(len(api.canonical(result)) <= MAX_DETAIL_BYTES, "Evidence page exceeds128 KiB; request fewer rows or the full original record", "EVIDENCE_BUDGET_EXCEEDED")
    return result
