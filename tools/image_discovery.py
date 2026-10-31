"""Image-first attention and source-bound review over the existing provider.

Observations propose where to inspect. Existing FFT/measure/GPA tools perform
science; this adapter neither runs a hidden model nor labels a physical defect.
"""
import copy
import hashlib
from pathlib import Path
import shutil

FIELDS = {
    "discovery": {"object_id", "entry", "window_sizes", "max_candidates", "regions", "previous_discovery_id", "max_size"},
    "discovery_review": {"object_id", "candidate_id", "evidence_ids", "observation_text", "candidate_explanations", "unresolved", "previous_review_id"},
}
VERSION = "image-first-discovery-v1"
LIMITS = ["Visual/spatial observations are not confirmed phase, twin, dislocation or material strain",
          "Scores are heuristic priorities, not calibrated probabilities or physical curvature",
          "A missed candidate does not establish absence; noise and contrast can imitate anomalies",
          "Physical scale and uncertainty are unknown unless explicitly sourced; no depth is inferred"]


def _support_status(entry):
    # Qualification of a workflow is separate from its physical interpretation.
    return "MANUAL_SUPPORTED_LIMITED" if entry == "manual" else "EXPERIMENTAL"


def _text(value, api):
    api.need(type(value) is str and 1 <= len(value.strip()) <= 2000, "Provide bounded actual observation/source text")
    return value


def _texts(value, api):
    api.need(type(value) is list and len(value) <= 8, "Supply at most8 bounded explanations/unknowns")
    return [_text(item, api) for item in value]


def _dep(metadata, directory, api):
    return {"object_id": metadata["object_id"], "request_id": metadata["request_id"],
            "manifest_sha256": api.sha_file(directory / "object.json")}


def _source(workspace, ident, api):
    selected, selected_dir = workspace.object(ident)
    frame, context, values = api.automation.source_frame(workspace, {"object_id": ident}, api)
    api.need(values.size <= api.MAX_PIXELS, "Image-first input exceeds bounded frame pixel budget", "BUDGET_EXCEEDED")
    science = {"frame_object_id": frame["object_id"], "array_sha256": frame["files_sha256"]["data.npy"],
               "shape_yx": frame["shape_yx"], "dtype": frame["dtype"],
               "calibration_dependency": api.calibration.dependency(frame.get("xy_calibration"))}
    return {"selected": _dep(selected, selected_dir, api), "science": science,
            "source_context": api.automation.context_record(frame, context)}, values


def _parameters(request, shape, api):
    entry = request.get("entry", "feature")
    api.need(entry in ("feature", "manual"), "entry must explicitly be feature or manual")
    sizes, count, size = request.get("window_sizes", [64] if entry == "feature" else []), request.get("max_candidates", 4), request.get("max_size", 512)
    if entry == "feature":
        api.need(type(sizes) is list and 1 <= len(sizes) <= 2 and len(set(sizes)) == len(sizes) and
                 all(api.integer(v, 32, 256) and v <= min(shape) for v in sizes), "Supply1..2 distinct window sizes32..256 fitting this frame")
    else:
        api.need("window_sizes" not in request, "Manual attention uses explicit rectangles; window_sizes applies only to feature entry")
    api.need(api.integer(count, 1, 4) and api.integer(size, 32, 1024), "Candidate count1..4 and preview32..1024 required")
    regions = request.get("regions", [])
    api.need(entry == "manual" or not regions, "Manual attention regions require entry=manual")
    if entry == "manual":
        api.need(type(regions) is list and 1 <= len(regions) <= count, "Manual entry requires1..max_candidates explicit regions")
    else:
        api.need(type(regions) is list, "regions must be a list")
    prepared = []
    for region in regions:
        api.need(type(region) is dict and set(region) <= {"rect", "reason", "candidate_explanations", "unresolved"}, "Unknown manual region field")
        rect = api.rectangle(region.get("rect"), shape)
        api.need(min(rect[2]-rect[0], rect[3]-rect[1]) >= 4, "Manual ROI must be at least4 by4 pixels")
        prepared.append({"rect": rect, "reason": _text(region.get("reason"), api),
                         "candidate_explanations": _texts(region.get("candidate_explanations", []), api),
                         "unresolved": _texts(region.get("unresolved", []), api)})
    api.need(len({tuple(r["rect"]) for r in prepared}) == len(prepared), "Duplicate attention ROI is not a new observation")
    return {"entry": entry, "window_sizes": sizes, "max_candidates": count, "regions": prepared, "max_size": size}


def _candidate(value, entry, science, api):
    value = copy.deepcopy(value)
    value.setdefault("candidate_explanations", ["Image contrast/texture variation; physical cause is not distinguished"])
    key = {"science": science, "rect": value["rect"], "entry": entry, "algorithm": VERSION}
    value.update(candidate_id=hashlib.sha256(api.canonical(key)).hexdigest()[:32],
                 coordinate_space="source_pixels", entry_basis="researcher_statement" if entry == "manual" else "numerical_spatial_observation",
                 interpretation_status="hypothesized", physical_conclusion=None)
    return value


def _manual(parameters, science, api):
    return [_candidate({"rect": r["rect"], "score": None, "metrics": {}, "score_components": {},
                        "reasons": [r["reason"]], "candidate_explanations": r["candidate_explanations"],
                        "unknowns": [*r["unresolved"], "Researcher attention is not numerical verification"]}, "manual", science, api)
            for r in parameters["regions"]]


def _history(workspace, request, key, kind, science, api):
    if not request.get(key):
        return []
    old, directory = workspace.object(request[key])
    api.need(old["kind"] == kind and old["source_dependency"]["science"] == science,
             "A revision must retain the exact frame/grid/calibration; old evidence remains historical", "DISCOVERY_SCOPE_MISMATCH")
    history = [*old.get("history", []), _dep(old, directory, api)]
    api.need(len(history) <= 8 and len({r["object_id"] for r in history}) == len(history), "Discovery history budget8 exceeded", "BUDGET_EXCEEDED")
    return history


def _actions(candidates, selected):
    return [{"candidate_id": c["candidate_id"], "tool": "image_fft_batch",
             "arguments": {"object_id": selected, "rects": [c["rect"]], "window": "hann", "subtract_mean": True},
             "requires": ["Save a new request_id before submission; Agent may revise window/mean explicitly"],
             "cost": {"new_fft_windows": 1, "fft_pixels": (c["rect"][2]-c["rect"][0])*(c["rect"][3]-c["rect"][1])}}
            for c in candidates]


def _handoff(gpas):
    return ({"tool":"image_method_plan", "arguments":{"object_ids":gpas,"information":{"goal":"projected_topology"}},
             "requires":["Explicit finite budget", "Sourced carrier/model/circuit information; no defect inference from this image observation"]}
            if 1 <= len(gpas) <= 3 else None)


def _propose(workspace, request, metadata, directory, api):
    source, values = _source(workspace, request["object_id"], api)
    parameters = _parameters(request, values.shape, api)
    history = _history(workspace, request, "previous_discovery_id", "discovery", source["science"], api)
    if parameters["entry"] == "feature":
        if __package__:
            from . import image_discovery_core as core
        else:
            import image_discovery_core as core
        report = core.propose(values, window_sizes=parameters["window_sizes"], max_candidates=parameters["max_candidates"])
        candidates = [_candidate(v, "feature", source["science"], api) for v in report["candidates"]]
    else:
        candidates = _manual(parameters, source["science"], api)
        report = {"algorithm": "researcher-attention-v1", "quality": {"status": "researcher_statement_not_numerically_verified"},
                  "cost": {"source_read_pixels": int(values.size), "feature_pixels": 0, "fft_pixels": 0}, "observations": [],
                  "stop_reason": None}
    report = {**report, "candidates": candidates, "source_science": source["science"], "parameters": parameters,
              "support_status": _support_status(parameters["entry"])}
    api.write_new(directory/"discovery-report.json", api.canonical(report)+b"\n")
    overview = (api.automation.overview(workspace, request, [c["rect"] for c in candidates], api) if candidates else
                api.automation.run_child(workspace, request, "context-view", "view", object_id=request["object_id"], max_size=parameters["max_size"]))
    shutil.copyfile(overview["image_path"], directory/"preview.png")
    next_actions = _actions(candidates, request["object_id"])
    metadata.update(policy_version=VERSION, parent_object_id=request["object_id"], parameters=parameters,
                    support_status=_support_status(parameters["entry"]),
                    source_dependency=source, source_context=source["source_context"], history=history, candidates=candidates,
                    quality=report["quality"], observation_cost=report["cost"], stop_reason=report.get("stop_reason"),
                    overview_object_id=overview["object_id"], overview_dependency=_dep(overview, Path(overview["manifest_path"]).parent, api),
                    panels=overview["panels"], next_actions=next_actions, feature_report_file="discovery-report.json",
                    annotation_map=[{"candidate_id": c["candidate_id"], "annotation_id": "region-%d"%(i+1)} for i,c in enumerate(candidates)],
                    scientific_data_changed=False, fft_recomputed=False, full_structure_field_required=False,
                    interpretation_status="hypothesized", physical_conclusion=None, limitations=LIMITS)
    return metadata


def _fft_scope(workspace, ident, source, rect, api):
    operand, _, _ = workspace.measurement_operand(ident)
    api.need(operand["kind"] in ("fft", "fft_view"), "Review evidence must resolve to an existing saved ROI FFT", "DISCOVERY_SCOPE_MISMATCH")
    fft, directory = workspace.object(operand.get("spectrum_object_id", operand["object_id"]))
    origin, _ = _source(workspace, fft["parent_object_id"], api)
    # FFT samples are scale-independent. A deliberately attached current scale
    # can update interpretation without rerunning the unchanged complex array;
    # bare historical physical measurements still fail the effective-scale test.
    array_scope = lambda value: {k:v for k,v in value.items() if k != "calibration_dependency"}
    api.need(array_scope(origin["science"]) == array_scope(source["science"]) and fft["source_rect_xyxy"] == rect and
             api.calibration.dependency(operand.get("xy_calibration")) == source["science"]["calibration_dependency"],
             "Evidence has a different frame, ROI or calibration revision", "DISCOVERY_SCOPE_MISMATCH")
    return fft, directory


def _evidence(workspace, ids, source, rect, api):
    api.need(type(ids) is list and 1 <= len(ids) <= 8 and len(set(ids)) == len(ids), "Select1..8 distinct saved evidence IDs")
    refs, observations, ffts, gpas, gpa_scopes = [], [], {}, [], set()
    for ident in ids:
        record, directory = workspace.object(ident)
        kind = record["kind"]
        if kind == "measure":
            record, directory = workspace.committed_measurement(ident)
        targets = [ident]
        if kind == "fft_batch":
            api.need(any(r["rect"] == rect for r in record["regions"]), "FFT batch does not contain this exact candidate ROI", "DISCOVERY_SCOPE_MISMATCH")
            targets = [r["fft_object_id"] for r in record["regions"] if r["rect"] == rect]
        elif kind == "peak_measurements":
            targets = [record["parent_object_id"]]
        elif kind == "gpa":
            targets = [record["input_dependency"]["selected"]["object_id"]]
            api.need(record.get("calibration_dependency") == source["science"]["calibration_dependency"], "GPA calibration is stale for this attention record", "DISCOVERY_SCOPE_MISMATCH")
            if record["parameters"]["reference_mode"] == "fixed_g":
                gpas.append(ident)
                gpa_scopes.add(api.canonical({"fft":record["input_dependency"]["fft"], "mask_sigma":record["parameters"]["mask_sigma"]}))
        else:
            api.need(kind in ("fft", "fft_view", "measure", "annotate", "calibration"), "Unsupported discovery evidence; use explicit saved FFT/peaks/measure/GPA", "UNSUPPORTED_OPERATION")
        for target in targets:
            fft, fft_dir = _fft_scope(workspace, target, source, rect, api)
            ffts[fft["object_id"]] = {**_dep(fft, fft_dir, api), "shape_yx": fft["shape_yx"], "window": fft["window"], "subtract_mean": fft["subtract_mean"]}
        refs.append(_dep(record, directory, api))
        measurement = ({key:copy.deepcopy(record[key]) for key in (
            "points", "dx", "dy", "coordinate_space", "measurement_domain", "scientific_grid_identity",
            "frequency_distance_cycles_per_pixel", "pixel_period", "d_spacing", "d_spacing_unit", "dc_reference_point_index",
            "physical_frequency_magnitude", "physical_frequency_unit", "period", "period_unit", "image_coordinate_angle_degrees",
            "xy_calibration", "calibration_dependency", "reciprocal_interpretation") if key in record} if kind == "measure" else None)
        observations.append({"object_id": ident, "kind": kind, "peak_table": record.get("peak_table"),
                             "measurement": measurement, "measurements": record.get("measurements"),
                             "interpretation_status": "hypothesized"})
    # Existing F4 admits a shared exact fixed-g FFT/grid/aperture, not an
    # arbitrary collection of otherwise valid sensitivity/reference studies.
    return refs, observations, list(ffts.values()), gpas if len(gpa_scopes) <= 1 else []


def _review(workspace, request, metadata, directory, api):
    discovery, discovery_dir = workspace.object(request["object_id"])
    api.need(discovery["kind"] == "discovery", "Select the exact saved image-first discovery record")
    matches = [r for r in discovery["candidates"] if r["candidate_id"] == request.get("candidate_id")]
    api.need(len(matches) == 1, "Select an actual source-bound candidate, not a region/peak number")
    candidate = matches[0]
    refs, observations, ffts, gpas = _evidence(workspace, request.get("evidence_ids"), discovery["source_dependency"], candidate["rect"], api)
    text = _text(request.get("observation_text"), api)
    explanations, unresolved = _texts(request.get("candidate_explanations", []), api), _texts(request.get("unresolved", []), api)
    history = _history(workspace, request, "previous_review_id", "discovery_review", discovery["source_dependency"]["science"], api)
    if history:
        old, _ = workspace.object(history[-1]["object_id"])
        api.need(old["candidate"]["rect"] == candidate["rect"], "Review revision must retain its exact scientific ROI", "DISCOVERY_SCOPE_MISMATCH")
    overview, _ = workspace.object(discovery["overview_object_id"])
    visible = [overview]
    for ref in refs[:2]:
        value, _ = workspace.object(ref["object_id"])
        if value.get("image_path"):
            visible.append(value)
    api.automation.contact_sheet(directory, [("Observation / saved evidence", r) for r in visible], api)
    metadata.update(policy_version=VERSION, parent_object_id=request["object_id"], discovery_dependency=_dep(discovery, discovery_dir, api),
                    support_status=_support_status(discovery["parameters"]["entry"]),
                    source_dependency=discovery["source_dependency"], source_context=discovery["source_context"], candidate=candidate,
                    evidence_refs=refs, numerical_observations=observations, fft_refs=ffts, history=history,
                    observation_text=text, candidate_explanations=explanations, unresolved=unresolved,
                    interpretation_status="hypothesized", physical_conclusion=None,
                    gui_view_object_id=next((r["object_id"] for r in reversed(refs) if workspace.object(r["object_id"])[0]["kind"] in ("fft_view", "annotate")), overview["object_id"]),
                    overview_object_id=overview["object_id"], panels=[], review_is_scientific_verification=False,
                    cost={"new_fft_pixels":0,"new_scientific_method_calls":0},
                    method_handoff=_handoff(gpas),
                    scientific_data_changed=False, fft_recomputed=False, limitations=LIMITS)
    api.write_new(directory/"discovery-review.json", api.canonical({k:v for k,v in metadata.items() if k not in ("created_utc",)})+b"\n")
    return metadata


def action(workspace, name, request, metadata, directory, api):
    return _propose(workspace, request, metadata, directory, api) if name == "discovery" else _review(workspace, request, metadata, directory, api)


def validate_references(workspace, metadata, api):
    original = api.automation._saved_parameters(workspace, metadata, api)
    api.need(original["action"] == metadata["kind"] and metadata.get("policy_version") == VERSION, "Discovery action/version changed", "CORRUPT_OBJECT")
    if metadata["kind"] == "discovery":
        source, values = _source(workspace, original["object_id"], api)
        parameters = _parameters(original, values.shape, api)
        report = api.read_json(Path(metadata["manifest_path"]).parent/"discovery-report.json")
        if "support_status" in metadata:
            api.need(metadata["support_status"] == report.get("support_status") == _support_status(parameters["entry"]),
                     "Discovery support label contradicts its original entry", "CORRUPT_OBJECT")
        api.need(metadata["source_dependency"] == source and metadata["parameters"] == parameters and report["parameters"] == parameters and
                 report["source_science"] == source["science"] and report["candidates"] == metadata["candidates"] and
                 metadata["source_context"] == source["source_context"] and metadata["quality"] == report["quality"] and
                 metadata["observation_cost"] == report["cost"] and metadata["stop_reason"] == report.get("stop_reason"),
                 "Discovery source/parameters/report changed", "CORRUPT_OBJECT")
        api.need(len(metadata["candidates"]) <= parameters["max_candidates"], "Discovery candidate budget changed", "CORRUPT_OBJECT")
        for candidate in metadata["candidates"]:
            api.rectangle(candidate["rect"], values.shape)
            api.need(candidate == _candidate(candidate, parameters["entry"], source["science"], api), "Candidate scientific identity changed", "CORRUPT_OBJECT")
        if parameters["entry"] == "manual":
            api.need(metadata["candidates"] == _manual(parameters, source["science"], api), "Manual attention differs from original researcher statement", "CORRUPT_OBJECT")
        overview, directory = workspace.object(metadata["overview_object_id"])
        child = api.automation._saved_parameters(workspace, overview, api)
        has_candidates = bool(metadata["candidates"])
        label = "context-regions" if has_candidates else "context-view"
        api.need(_dep(overview, directory, api) == metadata["overview_dependency"] and
                 overview["request_id"] == api.automation.child_request_id(metadata["request_id"], label) and
                 metadata["panels"] == overview["panels"] and metadata["next_actions"] == _actions(metadata["candidates"], original["object_id"]),
                 "Discovery GUI/action source changed", "CORRUPT_OBJECT")
        api.need(metadata["annotation_map"] == [{"candidate_id": c["candidate_id"], "annotation_id":"region-%d"%(i+1)} for i,c in enumerate(metadata["candidates"])] and
                 metadata["full_structure_field_required"] is False, "Discovery UI/scientific route changed", "CORRUPT_OBJECT")
        if has_candidates:
            view, _ = workspace.object(child.get("object_id"))
            view_parameters = api.automation._saved_parameters(workspace, view, api)
            expected_marks = [{"annotation_id":"region-%d"%(i+1),"kind":"rectangle","source_object_id":view["panels"][0]["source_object_id"],
                               "coordinate_space":"source_pixels","coordinates":c["rect"],"text":"R%d"%(i+1),"status":"hypothesized","color":"cyan"}
                              for i,c in enumerate(metadata["candidates"])]
            api.need(child.get("action") == "annotate" and child.get("annotations") == expected_marks and
                     view["request_id"] == api.automation.child_request_id(metadata["request_id"], "context-view"), "Discovery overlay anchors changed", "CORRUPT_OBJECT")
        else:
            view_parameters = child
        api.need(view_parameters.get("action") == "view" and view_parameters.get("object_id") == original["object_id"],
                 "Discovery overview belongs to a different original image", "CORRUPT_OBJECT")
    else:
        discovery, directory = workspace.object(original["object_id"])
        if "support_status" in metadata:
            report = api.read_json(Path(metadata["manifest_path"]).parent/"discovery-review.json")
            api.need(metadata["support_status"] == report.get("support_status") == _support_status(discovery["parameters"]["entry"]),
                     "Review support label contradicts its original observation entry", "CORRUPT_OBJECT")
        candidate = next((r for r in discovery["candidates"] if r["candidate_id"] == original["candidate_id"]), None)
        api.need(candidate is not None and metadata["candidate"] == candidate and metadata["discovery_dependency"] == _dep(discovery,directory,api) and
                 metadata["source_dependency"] == discovery["source_dependency"], "Review has a different original discovery/ROI", "CORRUPT_OBJECT")
        refs, observations, ffts, gpas = _evidence(workspace, original["evidence_ids"], discovery["source_dependency"], candidate["rect"], api)
        api.need(metadata["evidence_refs"] == refs and metadata["numerical_observations"] == observations and metadata["fft_refs"] == ffts and
                 metadata["observation_text"] == original["observation_text"] and metadata["candidate_explanations"] == original.get("candidate_explanations",[]) and
                 metadata["unresolved"] == original.get("unresolved",[]) and metadata["physical_conclusion"] is None,
                 "Review differs from actual saved science or original interpretation", "CORRUPT_OBJECT")
        gui = next((r["object_id"] for r in reversed(refs) if workspace.object(r["object_id"])[0]["kind"] in ("fft_view", "annotate")), discovery["overview_object_id"])
        api.need(metadata["source_context"] == discovery["source_context"] and metadata["overview_object_id"] == discovery["overview_object_id"] and
                 metadata["gui_view_object_id"] == gui and metadata["method_handoff"] == _handoff(gpas) and
                 metadata["review_is_scientific_verification"] is False and metadata["cost"] == {"new_fft_pixels":0,"new_scientific_method_calls":0},
                 "Review handoff/display/cost changed", "CORRUPT_OBJECT")
    api.need(len(metadata.get("history",[])) <= 8 and metadata["interpretation_status"] == "hypothesized" and metadata["physical_conclusion"] is None,
             "Discovery history/interpretation changed", "CORRUPT_OBJECT")
    for ref in metadata.get("history",[]):
        old, directory = workspace._object_record(ref["object_id"])
        api.need(_dep(old,directory,api) == ref, "Historical discovery record changed", "CORRUPT_OBJECT")
    previous_key = "previous_discovery_id" if metadata["kind"] == "discovery" else "previous_review_id"
    history = []
    if original.get(previous_key):
        api.need(original[previous_key] != metadata["object_id"], "Self-referencing discovery history", "CORRUPT_OBJECT")
        old, directory = workspace._object_record(original[previous_key])
        api.need(old["kind"] == metadata["kind"] and old["source_dependency"]["science"] == metadata["source_dependency"]["science"],
                 "Historical discovery frame/calibration changed", "CORRUPT_OBJECT")
        if metadata["kind"] == "discovery_review":
            api.need(old["candidate"]["rect"] == metadata["candidate"]["rect"],
                     "Historical review belongs to a different scientific ROI", "CORRUPT_OBJECT")
        history = [*old.get("history",[]), _dep(old,directory,api)]
    api.need(metadata.get("history",[]) == history and metadata["scientific_data_changed"] is False and metadata["fft_recomputed"] is False,
             "Discovery revision differs from original history/zero-science operation", "CORRUPT_OBJECT")
