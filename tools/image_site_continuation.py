"""One inspectable existing-tool handoff; no executor, model or new science engine."""
import copy
import json
import math


def derive(review, request, api, version=2):
    api.need(type(version) is int and version in (1, 2), "Unsupported saved site-continuation version", "CORRUPT_OBJECT")
    site = review["site_observation"]
    api.need(site["version"] == 2, "Executable site continuation requires current profile-coverage semantics")
    kind = site["next_step"]["kind"]
    result = dict(version=version, source_review_id=review["object_id"], source_review_request_id=review["request_id"],
                  source_science=copy.deepcopy(review["source_dependency"]["science"]),
                  expected_position_xy=copy.deepcopy(site["context"]["expected_position_xy"]),
                  status="unavailable", reason=site["next_step"]["reason"], action=None, after_success=None,
                  execution="not_dispatched", decision_authority="deterministic_bounded_suggestion_not_AI",
                  physical_conclusion=None, limits=["One optional five-sample raw profile; no S2/FFT/GPA or physical classification",
                    "Host chooses whether to act; inspect the exact current source and original outcome before dispatch",
                    "Unknown write: query the proposed original request ID, never create a retry ID",
                    "No claim of optimal direction, global information gain or automatic model invocation"])
    if kind == "inspect_reference_comparability":
        result["status"] = "needs_reference_review"
        return result
    if kind == "request_acquisition_context":
        result["status"] = "needs_information"
        return result
    if kind == "review_alternative_causes_or_stop":
        result["status"] = "stop_at_observation"
        return result
    if kind not in ("inspect_local_profile", "inspect_profile_coverage"):
        return result
    if len(review.get("history", [])) >= 8:
        result.update(status="needs_history_budget", reason="The existing eight-revision history limit would reject the linked review. Stop before measuring; do not reset history or discard evidence automatically.")
        return result
    if len(request["evidence_ids"]) >= 8:
        result.update(status="needs_evidence_budget", reason="Appending a new profile would exceed the existing eight-evidence limit. Keep all evidence; no silent dropping or new store.")
        return result
    point, rect = result["expected_position_xy"], review["candidate"]["rect"]
    height, width = review["source_dependency"]["science"]["shape_yx"]
    if version == 2:
        result["profile_support"] = dict(source_centres_xyxy_inclusive=[0, 0, width-1, height-1],
                                         roi_nearest_rect_xyxy=copy.deepcopy(rect), axes=[])
    points, axis = None, None
    # A short exact through-point line removes manual aiming error without
    # loosening 8-ULP qualification. Actual saved sampling is checked AFTER use.
    for coordinate, name in [(0, "horizontal"), (1, "vertical")]:
        a, b = list(point), list(point)
        a[coordinate] -= 2
        b[coordinate] += 2
        roi_ok = all(rect[0] <= math.floor(p[0]+.5) < rect[2] and rect[1] <= math.floor(p[1]+.5) < rect[3] for p in (a, b))
        # image_numeric.sample rejects centres outside [0,w-1] x [0,h-1]
        # BEFORE nearest rounding. Endpoint checks suffice for this straight,
        # axis-aligned line: centres and nearest indices are monotone between
        # endpoints. Saved five-sample coverage is still verified after use.
        centres_ok = all(0 <= p[0] <= width-1 and 0 <= p[1] <= height-1 for p in (a, b))
        if version == 2:
            result["profile_support"]["axes"].append(dict(axis=name, points=[a,b],
                inside_source_centres=centres_ok, inside_roi_nearest_support=roi_ok))
        # Version 1 preserves the original historical proposal, including its
        # missing source-centre check. Never rewrite it to appear repaired.
        if roi_ok and (version == 1 or centres_ok):
            points, axis = [a, b], name
            break
    if points is None:
        if version == 1:
            result.update(status="needs_explicit_roi_revision", reason="Neither five-sample axis fits the original ROI's nearest-sample support. Explicitly revise the ROI and measurements; do not move the point, clip or pad.")
        else:
            result.update(status="needs_supported_profile", reason="Neither five-sample axis satisfies both source-array centre bounds and the original ROI's nearest-sample support. Inspect profile_support; explicitly supply a supported through-site line, revise ROI/measurements where appropriate, or acquire additional image support. No point movement, clipping or padding.")
        return result
    profile_request = api.automation.child_request_id(request["request_id"], "site-profile")
    review_request = api.automation.child_request_id(request["request_id"], "site-review")
    arguments = dict(object_id=review["source_dependency"]["selected"]["object_id"], points=points,
                     line_width=1, interpolation="nearest", sample_count=5, request_id=profile_request)
    after = dict(object_id=request["object_id"], candidate_id=request["candidate_id"],
                 evidence_ids=copy.deepcopy(request["evidence_ids"]), site_context=copy.deepcopy(request["site_context"]),
                 observation_text="Retain the original expected position and every reference/profile; inspect the new raw profile. Physical cause remains unresolved.",
                 candidate_explanations=copy.deepcopy(request.get("candidate_explanations", [])),
                 unresolved=copy.deepcopy(request.get("unresolved", [])), previous_review_id=review["object_id"],
                 include_site_continuation=True, request_id=review_request)
    # Both reports are explicit opt-ins on the shared review. Retain the
    # caller's other report input through this linked review; old requests
    # without it keep exactly their historical derived template.
    if "candidate_assessment" in request:
        after["candidate_assessment"] = copy.deepcopy(request["candidate_assessment"])
    result.update(status="tool_proposed", axis=axis,
        reason="Propose one five-sample line through the unchanged point, horizontal first if supported, otherwise vertical. This is minimum context, not an optimal physical direction.",
        action=dict(tool="image_profile", arguments=arguments, expected_result_kind="profile"),
        after_success=dict(tool="image_discovery_review", arguments=after,
            require_result_request_id=profile_request, require_result_kind="profile", append_result_object_id_to="evidence_ids",
            rule="Only after a known completed matching profile receipt, append its object_id to retained evidence_ids. Then submit this linked review; inspect its ACTUAL profile_coverage. Stop if still unverified."))
    return result


def report_text(value):
    lines = ["Expected-site tool continuation", "Status: " + value["status"], value["reason"],
             "Expected XY unchanged: " + str(value["expected_position_xy"]),
             "Deterministic suggestion; no tool or AI dispatched by this report."]
    if value["action"]:
        lines.extend(["Existing tool call (original request ID already saved):", json.dumps(value["action"], ensure_ascii=False, sort_keys=True, indent=2),
                      "After known success, append that profile object to ALL retained evidence and execute the linked review:",
                      json.dumps(value["after_success"], ensure_ascii=False, sort_keys=True, indent=2)])
    return "\n".join([*lines, *value["limits"]]) + "\n"


def save(directory, value, api):
    api.write_new(directory / "site-continuation.json", api.canonical(value) + b"\n")
    api.write_new(directory / "site-continuation.txt", report_text(value).encode("utf-8"))
