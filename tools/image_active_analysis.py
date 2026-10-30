"""Bounded deterministic next-observation proposals over saved spatial evidence.

Scores rank explicit calculations. They are not probabilities, information gain,
material labels or microscope acquisition instructions. No FFT is computed here.
"""
import copy
import csv
import hashlib
import io
import math
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from . import image_automation as automation
    from . import image_domain_compare as comparison
    from . import image_spatial_domains as spatial
except ImportError:
    import image_automation as automation
    import image_domain_compare as comparison
    import image_spatial_domains as spatial

FIELDS = {"analysis_candidates": {"object_id", "budget_windows", "budget_fft_pixels", "max_candidates", "user_stop", "candidate_scales"}}
ALGORITHM = "bounded-geometric-priorities-v1"
MAX_ROUNDS = 4
LIMITATIONS = [
    "Heuristic priorities are not calibrated probabilities, information gain or scientific confidence",
    "Exploration checks apparently ordinary regions; finite observations cannot exclude arbitrary narrow structure",
    "Quality-limited means insufficient usable geometry under this budget/settings, not physically irrecoverable information",
    "No new FFT, detector, phase label, GPA, defect model or microscope control is performed by this proposal",
    "Overlapping windows and scales are correlated observations, not independent validation",
]


def action_parameters(field):
    return {"fft_parameters": copy.deepcopy(field["fft_parameters"]),
            "peak_parameters": copy.deepcopy(field["peak_parameters"]),
            "coordinate_domain": field["coordinate_domain"]}


def observation_key(field, rect, api):
    """Immutable scientific identity, independent of row numbers and text IDs."""
    descriptor = {"source_selected_id": field["parent_object_id"],
                  "source_array_sha256": field["samples"][0]["source_array"]["array_sha256"],
                  "rect": list(rect), "fft_parameters": field["fft_parameters"],
                  "peak_parameters": field["peak_parameters"],
                  "calibration_dependency": api.calibration.dependency(field.get("xy_calibration"))}
    return hashlib.sha256(api.canonical(descriptor)).hexdigest()


def _settings(request, api):
    windows, pixels = request.get("budget_windows"), request.get("budget_fft_pixels")
    maximum, stopped = request.get("max_candidates", 8), request.get("user_stop", False)
    api.need(api.integer(windows, 0, 32), "budget_windows requires an explicit total window cap in0..32")
    api.need(api.integer(pixels, 0, api.MAX_PIXELS), "budget_fft_pixels requires an explicit total FFT-pixel cap in0..4194304")
    api.need(api.integer(maximum, 1, 8) and type(stopped) is bool, "max_candidates requires1..8 and user_stop must be boolean")
    scales=request.get("candidate_scales")
    api.need(scales is None or type(scales)is list and 1<=len(scales)<=4 and all(api.integer(s,4,1024) for s in scales)
             and len(set(scales))==len(scales),"candidate_scales requires1..4 distinct integer widths in4..1024")
    return windows, pixels, maximum, stopped, scales


def _depth(workspace, field, api):
    if field.get("kind") == "field_extend":
        depth = field.get("history_depth")
        api.need(api.integer(depth, 1, 7), "Invalid incremental history depth", "CORRUPT_OBJECT")
        return depth
    cursor, seen = field, set()
    while cursor:
        api.need(cursor["object_id"] not in seen and len(seen) < 7, "Spatial history is cyclic or exceeds readable bound", "CORRUPT_OBJECT")
        seen.add(cursor["object_id"])
        previous = cursor.get("previous_field_id")
        cursor = workspace._object_record(previous)[0] if previous else None
    return len(seen)


def _rect_intersection(a, b):
    return max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))


def _covered_fraction(rect, supports):
    clipped = [[max(rect[0], r[0]), max(rect[1], r[1]), min(rect[2], r[2]), min(rect[3], r[3])]
               for r in supports if _rect_intersection(rect, r)]
    xs = sorted({x for r in clipped for x in (r[0], r[2])})
    area = 0
    for a, b in zip(xs, xs[1:]):
        spans = sorted((r[1], r[3]) for r in clipped if r[0] <= a and r[2] >= b)
        end, height = None, 0
        for bottom, top in spans:
            height += max(0, top-max(bottom, end if end is not None else bottom))
            end = max(end if end is not None else top, top)
        area += (b-a)*height
    return area/((rect[2]-rect[0])*(rect[3]-rect[1]))


def _usable(sample):
    return sample.get("status") == "valid" and bool(sample.get("features", {}).get("families"))


def _entry(sample):
    return {"families": sample["features"]["families"], "quality": sample["quality"]}


def _progress(field, mapped, api):
    """Read executed evidence, never a caller's assertion of improvement."""
    samples = field["samples"]
    by_key = {observation_key(field, s["rect_xyxy"], api): s for s in samples}
    history = field.get("increment_history", [])
    api.need(type(history) is list and len(history) <= 6, "Increment history exceeds bounded field contract", "CORRUPT_OBJECT")
    all_added = []
    sampling_history = []
    for step in history:
        keys = step.get("added_observation_keys")
        api.need(type(keys) is list and len(keys) <= 4 and all(k in by_key for k in keys)
                 and len(keys) == len(set(keys)), "Increment history does not refer to actual observations", "CORRUPT_OBJECT")
        if not keys:
            api.need(step.get("history_role") == "measurement_revision", "Only committed measurement revisions may omit added observations", "CORRUPT_OBJECT")
            continue
        sampling_history.append(step)
        all_added.append(keys)
    api.need(len({key for group in all_added for key in group}) == sum(len(group) for group in all_added),
             "A sampled observation cannot be acquired twice across increment history", "CORRUPT_OBJECT")
    initial = {key: s for key, s in by_key.items() if key not in {k for group in all_added for k in group}}
    reports = []
    for step, keys in zip(sampling_history, all_added):
        previous = list(initial.values())
        valid, geometric_new, resolution_new, coverage_new = 0, 0, 0, 0
        old_scales = {s["scale_pixels"] for s in previous}
        shape = samples[0]["source_array"]["shape_yx"]
        covered = np.zeros(shape, dtype=np.uint8)
        for old in previous:
            r = old["rect_xyxy"]; covered[r[1]:r[3], r[0]:r[2]] = 1
        for key in keys:
            sample = by_key[key]; r = sample["rect_xyxy"]
            coverage_new += int((covered[r[1]:r[3], r[0]:r[2]] == 0).sum())
            covered[r[1]:r[3], r[0]:r[2]] = 1
            if not _usable(sample):
                continue
            valid += 1
            resolution_new += int(sample["scale_pixels"] not in old_scales)
            overlapping = [s for s in previous if _usable(s) and _rect_intersection(r, s["rect_xyxy"]) > 0]
            if not overlapping or not any(comparison.compare_families(_entry(s), _entry(sample), [0.], mapped["tolerance"])["status"] == "compatible_signature" for s in overlapping):
                geometric_new += 1
        informative = bool(valid and (geometric_new or resolution_new or coverage_new))
        reports.append({"field_object_id": step.get("field_object_id"), "observation_keys": keys,
                        "new_valid_observations": valid, "new_geometric_signatures": geometric_new,
                        "new_resolution_checks": resolution_new, "new_support_pixels": coverage_new,
                        "informative_within_policy": informative,
                        "meaning": "Descriptive novelty/coverage at the saved tolerance, not significance or independent phase evidence"})
        initial.update((key, by_key[key]) for key in keys)
    stagnant = 0
    for report in reversed(reports):
        if report["informative_within_policy"]:
            break
        stagnant += 1
    return {"completed_increment_steps": len(sampling_history), "round_limit": MAX_ROUNDS,
            "recent_no_new_evidence_steps": stagnant, "steps": reports,
            "measurement_revision_steps": len(history)-len(sampling_history),
            "progress_scope": "Descriptive novelty re-evaluated using current committed measurement revisions; earlier proposal records remain unchanged",
            "executed_observation_keys": list(by_key),
            "quality_limited_samples": sum(not _usable(s) for s in samples),
            "usable_observations": sum(_usable(s) for s in samples)}


def _candidate_pool(field, mapped, budget, api, scales=None):
    samples = field["samples"]
    scope = field["sampling_plan"]["rect_xyxy"]
    x0, y0, x1, y1 = scope
    observed = {observation_key(field, s["rect_xyxy"], api) for s in samples}
    parameters = action_parameters(field)
    existing_keys = set(observed)
    pool = {}

    def add(cx, cy, size, code, evidence, weight, explore=False):
        size = int(size)
        if scales is not None and size not in scales:
            return
        if not 4 <= size <= 1024 or size > min(x1-x0, y1-y0):
            return
        # Deterministic integer-source edges, no padding or synthetic pixel data.
        left, top = int(math.floor(cx-size/2)), int(math.floor(cy-size/2))
        r = [left, top, left+size, top+size]
        if left < x0 or top < y0 or r[2] > x1 or r[3] > y1 or size*size > budget["remaining_fft_pixels"]:
            return
        key = observation_key(field, r, api)
        if key in existing_keys:
            return
        if key not in pool:
            finer = [s for s in samples if s["scale_pixels"] <= size]
            overlap = _covered_fraction(r, [s["rect_xyxy"] for s in finer])
            coarse_centers = [((s["rect_xyxy"][0]+s["rect_xyxy"][2])/2, (s["rect_xyxy"][1]+s["rect_xyxy"][3])/2)
                              for s in samples if s["scale_pixels"] > size]
            offset = min((math.hypot(cx-x, cy-y) for x,y in coarse_centers), default=0.)/max(size, 1)
            pool[key] = {"action_id": key[:32], "observation_key": key, "source_selected_object_id": field["parent_object_id"],
                         "rect_xyxy": r, "scale_pixels": size, "method": "spatial_atlas", "parameters": copy.deepcopy(parameters),
                         "reason_codes": [], "evidence": [], "exploration": explore,
                         "score_components": {"evidence_priority": 0., "fine_scale_coverage_priority": 1.-overlap,
                                              "offset_sampling_priority": min(1., offset),
                                              "cost_penalty": size*size/max(1, budget["remaining_fft_pixels"])},
                         "estimated_cost": {"new_windows": 1, "fft_pixels": size*size, "worker_startup_seconds": None},
                         "interpretation_status": "hypothesized"}
        value = pool[key]
        value["exploration"] = value["exploration"] or explore
        if code not in value["reason_codes"]:
            value["reason_codes"].append(code)
        if evidence not in value["evidence"]:
            value["evidence"].append(evidence)
        value["score_components"]["evidence_priority"] = max(value["score_components"]["evidence_priority"], weight)

    by_index = {s["sample_index"]: s for s in samples}
    for edge in mapped["edges"]:
        if edge["status"] not in ("different", "unknown"):
            continue
        a, b = (by_index[i] for i in edge["sample_indices"])
        r, s = a["rect_xyxy"], b["rect_xyxy"]
        cx, cy = ((r[0]+r[2]+s[0]+s[2])/4, (r[1]+r[3]+s[1]+s[3])/4)
        size = max(4, min(a["scale_pixels"], b["scale_pixels"])//2)
        add(cx, cy, size, "neighbor_difference" if edge["status"] == "different" else "unresolved_neighbor",
            {"edge_index": edge["edge_index"], "source_rects": [r, s], "status": edge["status"]},
            8. if edge["status"] == "different" else 4.)
    for sample in mapped["samples"]:
        if sample.get("domain_status") == "unknown" and sample.get("status") == "valid":
            r = sample["rect_xyxy"]
            add((r[0]+r[2])/2, (r[1]+r[3])/2, max(4, sample["scale_pixels"]//2), "mixed_or_cross_scale_support",
                {"observation_key": observation_key(field, r, api), "rect_xyxy": r,
                 "reason": sample.get("domain_unknown_reason")}, 7.)
    # Exploration is derived from every existing window's source support, not
    # an expected defect location. Seam-midpoint and quarter-shift checks cover
    # apparently ordinary signatures as well as existing anomaly supports.
    for sample in samples:
        r = sample["rect_xyxy"]; width = sample["scale_pixels"]
        cx, cy = (r[0]+r[2])/2, (r[1]+r[3])/2
        for smaller in scales or [max(4,width//2)]:
            for px, py in ((cx, cy), (r[2], cy), (cx, r[3]), (cx+width/4, cy-width/4), (cx-width/4, cy+width/4)):
                add(px, py, smaller, "reserved_scale_or_offset_exploration",
                    {"observation_key": observation_key(field, r, api), "rect_xyxy": r,
                     "reason": "Ordinary coarse geometry cannot exclude unresolved finer or shifted structure"}, 2., True)
    # Include interior uncovered supports on an explicit coarse stratification.
    # It only proposes calculations; it never assigns labels between samples.
    for smaller in scales or [max(4,min(s["scale_pixels"] for s in samples)//2)]:
        for fy in (.25, .5, .75):
            for fx in (.25, .5, .75):
                add(x0+(x1-x0)*fx, y0+(y1-y0)*fy, smaller, "stratified_coverage_exploration",
                    {"source_scope_xyxy": scope, "fraction_xy": [fx, fy]}, 2., True)
    if not any(_usable(s) for s in samples):
        # One affordable larger support is a qualitative quality check; repeated
        # noise is not allowed to attract an unlimited sequence of smaller ROIs.
        pool = {}
        minimum=min(s["scale_pixels"] for s in samples)
        larger=min(1024,min(x1-x0,y1-y0),2*minimum)
        choices=[s for s in scales if s>minimum] if scales is not None else [larger]
        for width in choices:
            add((x0+x1)/2, (y0+y1)/2, width, "single_larger_support_quality_check",
                {"reason": "No usable local signatures; a larger support may help but no physical recoverability is assumed"}, 1., True)
    for value in pool.values():
        score = value["score_components"]
        value["heuristic_score"] = score["evidence_priority"] + score["fine_scale_coverage_priority"] + score["offset_sampling_priority"] - score["cost_penalty"]
        value["priority_semantics"] = "transparent ranking only; not probability or information gain"
    return list(pool.values())


def _pick(pool, maximum, budget):
    ordered = sorted(pool, key=lambda a: (-a["heuristic_score"], a["rect_xyxy"], a["observation_key"]))
    targeted = {"neighbor_difference", "unresolved_neighbor", "mixed_or_cross_scale_support"}
    exploration = [a for a in ordered if a["exploration"] and not targeted.intersection(a["reason_codes"])]
    exploration = exploration or [a for a in ordered if a["exploration"]]
    # Preserve an exploration slot even if all high scores concern one anomaly.
    reserve = exploration[0] if exploration else None
    chosen = ([reserve] if reserve else [])
    def center(action):
        r=action["rect_xyxy"];return ((r[0]+r[2])/2,(r[1]+r[3])/2)
    while len(chosen) < min(maximum,len(ordered)):
        candidates=[a for a in ordered if a not in chosen]
        def diversified(action):
            p=center(action)
            distance=min((math.dist(p,center(other))/max(action["scale_pixels"],other["scale_pixels"]) for other in chosen),default=0.)
            return action["heuristic_score"]+min(2.,distance)
        selected=sorted(candidates,key=lambda a:(-diversified(a),a["rect_xyxy"],a["observation_key"]))[0]
        chosen.append(selected)
    # Candidate table preserves this transparent spatial-diversity order.
    recommended, pixels = [], 0
    if reserve:
        recommended.append(reserve["action_id"]); pixels += reserve["estimated_cost"]["fft_pixels"]
    for action in chosen:
        if action["action_id"] in recommended:
            continue
        if len(recommended) < min(4, budget["remaining_windows"]) and pixels+action["estimated_cost"]["fft_pixels"] <= budget["remaining_fft_pixels"]:
            recommended.append(action["action_id"]); pixels += action["estimated_cost"]["fft_pixels"]
    return chosen, recommended


def result(workspace, request, api):
    windows, pixels, maximum, user_stop, scales = _settings(request, api)
    mapped, map_directory = spatial.qualified_field(workspace,request.get("object_id"),api)
    api.need(mapped.get("kind") == "domain_map", "Candidate proposal requires a saved domain_map; create it with explicit tolerance/angles first")
    field, field_directory = spatial.qualified_field(workspace,mapped["parent_object_id"],api)
    api.need(field.get("kind") in ("spatial_field", "field_extend"), "Candidate source is not a spatial observation field", "CORRUPT_OBJECT")
    samples = field["samples"]
    scope=field["sampling_plan"]["rect_xyxy"]
    api.need(scales is None or all(s<=min(scope[2]-scope[0],scope[3]-scope[1]) for s in scales),"Every candidate scale must fit the existing field sampling scope")
    used_windows, used_pixels = len(samples), field["sampling_plan"]["fft_pixels"]
    budget = {"windows": windows, "fft_pixels": pixels, "used_windows": used_windows, "used_fft_pixels": used_pixels,
              "remaining_windows": max(0, windows-used_windows), "remaining_fft_pixels": max(0, pixels-used_pixels)}
    progress = _progress(field, mapped, api)
    depth = _depth(workspace, field, api)
    progress["history_depth"] = depth
    pool = _candidate_pool(field, mapped, budget, api,scales) if budget["remaining_windows"] and not user_stop else []
    stop_reason = None
    if user_stop:
        stop_reason = "user_stop"
    elif depth >= 7 or progress["completed_increment_steps"] >= MAX_ROUNDS:
        stop_reason = "history_limit"
    elif budget["remaining_windows"] < 1 or budget["remaining_fft_pixels"] < 16:
        stop_reason = "budget_exhausted"
    elif not progress["usable_observations"] and (progress["completed_increment_steps"] or not pool):
        stop_reason = "data_quality_limited"
    elif progress["recent_no_new_evidence_steps"] >= 2:
        stop_reason = "no_new_evidence"
    elif not pool:
        stop_reason = "no_legal_actions"
    actions, recommended = _pick(pool, maximum, budget) if stop_reason is None else ([], [])
    value = {"kind": "analysis_candidates", "proposal_schema_version": 1, "algorithm_version": ALGORITHM,
             "parent_object_id": mapped["object_id"], "source_domain_map_id": mapped["object_id"],
             "source_domain_map_manifest_sha256": api.sha_file(map_directory/"object.json"),
             "field_object_id": field["object_id"], "field_manifest_sha256": api.sha_file(field_directory/"object.json"),
             "source_selected_object_id": field["parent_object_id"], "source_context": field["source_context"],
             "coordinate_domain": field["coordinate_domain"], "coordinate_unit": field["coordinate_unit"],
             "xy_calibration": field.get("xy_calibration"), "overview_object_id": field["overview_object_id"],
             "samples": copy.deepcopy(mapped["samples"]), "field_image": copy.deepcopy(mapped["field_image"]),
             "actions": actions, "recommended_action_ids": recommended,
             "reserved_exploration_action_ids": [a["action_id"] for a in actions if a["exploration"] and a["action_id"] in recommended],
             "budget": budget, "progress": progress, "candidate_scales":scales,
             "selection_policy":"Transparent evidence priorities and greedy spatial diversity, with one reserved non-targeted exploration slot when legal",
             "stopping": {"stop": stop_reason is not None, "reason": stop_reason or "continue",
                          "meaning": "Bounded policy decision under current observations/settings; no absence or physical recoverability conclusion"},
             "executed_scientific_operations": 0, "new_fft_count": 0, "scientific_data_changed": False,
             "interpretation_status": "hypothesized", "limitations": LIMITATIONS}
    comparison.check_report_budget(value, api)
    return value, mapped, map_directory


def _csv(value):
    stream = io.StringIO(newline=""); writer = csv.writer(stream)
    writer.writerow(["action_id", "observation_key", "x0", "y0", "x1", "y1", "scale_pixels", "heuristic_score", "reason_codes", "exploration", "new_windows", "fft_pixels", "recommended"])
    for action in value["actions"]:
        writer.writerow([action["action_id"], action["observation_key"], *action["rect_xyxy"], action["scale_pixels"], action["heuristic_score"],
                         "|".join(action["reason_codes"]), action["exploration"], 1, action["estimated_cost"]["fft_pixels"], action["action_id"] in value["recommended_action_ids"]])
    return stream.getvalue().encode("utf-8")


def _render(value, mapped, map_directory, directory, api):
    with Image.open(map_directory/"preview.png") as original:
        canvas = original.convert("RGB")
    draw = ImageDraw.Draw(canvas); font = ImageFont.load_default(size=12)
    draw.rectangle((0, 0, canvas.width, 48), fill="#181c22")
    draw.text((12, 9), "Proposed calculations / heuristic priorities, not confidence", fill="white", font=font)
    draw.text((12, 29), "Stop: "+value["stopping"]["reason"] if value["stopping"]["stop"] else "Cyan: reserved exploration / orange: targeted review", fill="#dddddd", font=font)
    for panel in mapped["field_image"]["panels"]:
        base = panel.get("base")
        if not base:
            continue
        x0, y0, x1, y1 = panel["image_rect_xyxy"]
        for i, action in enumerate(value["actions"]):
            r = api.coordinate_transform(action["rect_xyxy"], base["source_panel"], True, inverse=True)
            sx, sy = (x1-x0)/base["original_size"][0], (y1-y0)/base["original_size"][1]
            box = [x0+r[0]*sx, y0+r[1]*sy, x0+r[2]*sx, y0+r[3]*sy]
            color = "#6ce5ed" if action["exploration"] else "#ff9f36"
            draw.rectangle(box, outline=color, width=2)
            draw.text((box[0]+2, box[1]+2), "Next%d" % (i+1), fill=color, font=font, stroke_width=1, stroke_fill="#111111")
    api.save_png(directory/"preview.png", canvas)


def action(workspace, name, request, metadata, directory, api):
    started = time.monotonic()
    value, mapped, map_directory = result(workspace, request, api)
    computed = time.monotonic()
    api.write_new(directory/"analysis-candidates.json", api.canonical(value)+b"\n")
    api.write_new(directory/"analysis-candidates.csv", _csv(value))
    _render(value, mapped, map_directory, directory, api)
    ended = time.monotonic()
    metadata.update(value, proposal_path=str(directory/"analysis-candidates.json"), table_path=str(directory/"analysis-candidates.csv"),
                    costs={"worker_processes": 1, "startup_seconds": None, "compute_seconds": computed-started,
                           "render_and_write_seconds": ended-computed, "total_worker_seconds": ended-started,
                           "new_fft_count": 0, "proposed_action_count": len(value["actions"])})
    return metadata


def validate_references(workspace, metadata, api):
    active = getattr(workspace, "_active_analysis_validation", set())
    api.need(metadata["object_id"] not in active and len(active) < 8, "Active-analysis dependency cycle/depth exceeded", "CORRUPT_OBJECT")
    workspace._active_analysis_validation = active; active.add(metadata["object_id"])
    try:
        request = automation._saved_parameters(workspace, metadata, api)
        api.need(request.get("action") == "analysis_candidates" and request.get("object_id") == metadata.get("parent_object_id"), "Candidate original source/request changed", "CORRUPT_OBJECT")
        expected, _, _ = result(workspace, request, api)
        directory = workspace.root/"objects"/metadata["object_id"]
        api.need(all(metadata.get(k) == v for k, v in expected.items())
                 and api.read_json(directory/"analysis-candidates.json") == expected
                 and (directory/"analysis-candidates.csv").read_bytes() == _csv(expected), "Candidate evidence differs from authoritative saved observations", "CORRUPT_OBJECT")
        with Image.open(directory/"preview.png") as image:
            api.need(list(image.size) == [expected["field_image"]["width"], expected["field_image"]["height"]], "Candidate preview coordinate mapping changed", "CORRUPT_OBJECT")
        costs = metadata.get("costs")
        api.need(type(costs) is dict and costs.get("worker_processes") == 1 and costs.get("new_fft_count") == 0
                 and costs.get("proposed_action_count") == len(expected["actions"])
                 and all(api.number(costs.get(k)) and costs[k] >= 0 for k in ("compute_seconds", "render_and_write_seconds", "total_worker_seconds")), "Invalid candidate execution costs", "CORRUPT_OBJECT")
    finally:
        active.remove(metadata["object_id"])
