"""Opt-in discovery review of supplied real-space and existing topology evidence.

Composition only: no image tracing, numerical inference or physical classifier.
Caller statements and saved numerical observations retain separate authority.
"""
import copy
import textwrap

from PIL import Image, ImageDraw

LEGACY_VERSION = "source-bound-candidate-assessment-v1"
VERSION = "source-bound-candidate-assessment-v2"


def parameters(value, rect, api):
    api.need(type(value) is dict and set(value) == {"hypothesis", "real_space_evidence"},
             "candidate_assessment requires hypothesis and real_space_evidence")
    def text(item):
        api.need(type(item) is str and 1 <= len(item.strip()) <= 2000, "Provide bounded actual evidence/source text")
    text(value["hypothesis"])
    evidence = value["real_space_evidence"]
    api.need(type(evidence) is dict and set(evidence) == {"origin", "source_text", "observation_text", "relation", "anchors_xy"},
             "Real-space evidence requires explicit origin, source, observation, relation and source-pixel anchors")
    api.need(evidence["origin"] in ("manual_review", "specified_points", "synthetic_construction") and
             evidence["relation"] in ("supports", "opposes", "unknown"), "Unknown real-space origin/relation")
    text(evidence["source_text"]); text(evidence["observation_text"])
    points = evidence["anchors_xy"]
    api.need(type(points) is list and 1 <= len(points) <= 16 and all(
        type(p) is list and len(p) == 2 and all(api.number(v) for v in p) and
        rect[0] <= p[0] < rect[2] and rect[1] <= p[1] < rect[3] for p in points),
        "Supply1..16 finite real-space anchors inside this exact candidate, in source pixels")
    return copy.deepcopy(value)


def gpa_ids(record, api):
    if record["kind"] == "topology":
        return record["parameters"]["object_ids"]
    api.need(record["kind"] == "method_plan" and record["information"]["goal"] == "projected_topology",
             "Candidate assessment uses an existing projected_topology method plan", "DISCOVERY_SCOPE_MISMATCH")
    return [ref["object_id"] for ref in record["input_refs"]]


def _result_v1(workspace, supplied, ids, rect, api):
    # Frozen saved-v1 reconstruction, including its inaccurate tool advice.
    # Historical bytes are not repaired/reinterpreted on read. New writes use v2.
    supplied = parameters(supplied, rect, api)
    records = [workspace.object(ident)[0] for ident in ids]
    topologies = [r for r in records if r["kind"] == "topology"]
    plans = [r for r in records if r["kind"] == "method_plan"]
    api.need(len(topologies) == len(plans) == 1,
             "Candidate assessment requires exactly one saved topology and one projected_topology method plan")
    topology, plan = topologies[0], plans[0]
    api.need(topology["report"]["algorithm"] == api.topology.core.DEPENDENCY_ALGORITHM_VERSION,
             "Candidate assessment requires v3 saved-mask topology dependency qualification; historical topology remains separately readable",
             "UNSUPPORTED_OPERATION")
    api.need(set(gpa_ids(topology, api)) == set(gpa_ids(plan, api)) and
             plan["latest_topology_object_id"] in (None, topology["object_id"]),
             "Method plan and topology must bind the same exact saved GPA records and outcome", "DISCOVERY_SCOPE_MISMATCH")
    api.need(plan["information"].get("loops") == topology["parameters"]["loops"] and
             plan["information"].get("model_assumption_text") == topology["parameters"]["model_assumption_text"],
             "Method and topology require identical explicit paths and model assumptions", "DISCOVERY_SCOPE_MISMATCH")
    supplied_evidence = supplied["real_space_evidence"]
    support, oppose = [], []
    unknown = ["Image contrast and phase topology alone do not identify a material dislocation or a unique 3D Burgers vector.",
               "The image-formation/displacement model is supplied, not independently validated by this review."]
    statement = ("Caller-supplied real-space statement (" + supplied_evidence["origin"] + "; not authenticated or automatically measured): " +
                 supplied_evidence["observation_text"])
    {"supports": support, "opposes": oppose, "unknown": unknown}[supplied_evidence["relation"]].append(statement)
    if supplied_evidence["origin"] == "synthetic_construction":
        unknown.append("Construction truth is supplied input for synthetic acceptance, not an independent observation of atoms or lattice planes.")
    groups = []
    for group in topology["report"]["loop_groups"]:
        status = group["status"]
        groups.append({key: copy.deepcopy(group[key]) for key in (
            "group_index", "loop_indices", "strictly_nested_loop_pairs", "status", "projected_burgers")})
        if status == "projected_topological_evidence":
            support.append("Saved nested circuits in group %s support a conditional nonzero image-phase closure; disjoint Fourier supports do not establish independent physical evidence." % group["group_index"])
        elif status == "no_net_winding_detected":
            oppose.append("Saved valid nested circuits in group %s show zero net winding, opposing a nonzero net closure on these paths; cancelling cores and defects elsewhere remain possible." % group["group_index"])
        else:
            unknown.append("Group %s cannot establish qualified nonzero closure: %s. Invalid/partial paths are not physical negative evidence." % (group["group_index"], status))
    next_tools = [
        {"tool": "image_gpa_read", "purpose": "Inspect saved amplitude/validity and reference support before interpreting each path; retain unavailable values."},
        {"tool": "image_profile", "purpose": "Inspect explicit source-pixel real-space lines at the supplied anchors; manual lattice/fringe interpretation is still required, no automatic tracing."},
        {"tool": None, "purpose": "Obtain independent lattice-position/structure evidence and an appropriate image-formation model or additional imaging data to distinguish displacement from contrast-only modulation."},
    ]
    return {"version": LEGACY_VERSION, "hypothesis": supplied["hypothesis"],
            "real_space_evidence": supplied_evidence, "origin_basis": "caller_reported_not_authenticated",
            "supports": support, "opposes": oppose, "unknown": unknown, "next_tools": next_tools,
            "topology_object_id": topology["object_id"], "method_plan_object_id": plan["object_id"],
            "method_decision": copy.deepcopy(plan["decision"]),
            "topology_participation": "method_child" if plan["latest_topology_object_id"] else "explicit_direct_tool_outside_method_budget",
            "conditions": {"model_assumption_text": topology["parameters"]["model_assumption_text"],
                "loops": copy.deepcopy(topology["parameters"]["loops"]), "loop_groups": groups,
                "gpa_references": [{"object_id": r["object_id"], "reference_rect": r["parameters"]["reference_rect"],
                    "reference_mode": r["parameters"]["reference_mode"], "reference_text": r["parameters"]["reference_text"],
                    "mask_sigma": r["parameters"]["mask_sigma"]} for r in
                    [workspace.object(ident)[0] for ident in gpa_ids(topology, api)]],
                "coordinate_unit": "source pixels; loops local to exact FFT ROI", "physical_unit": "unknown unless separately calibrated",
                "source_dependency": copy.deepcopy(topology["input_dependency"])},
            "material_dislocation_confirmed": False, "automatic_real_space_tracing": False,
            "new_scientific_method_calls": 0}


def result(workspace, supplied, ids, rect, api, *, version=VERSION):
    api.need(version in (LEGACY_VERSION, VERSION), "Unknown candidate assessment version", "CORRUPT_OBJECT")
    value = _result_v1(workspace, supplied, ids, rect, api)
    if version == LEGACY_VERSION:
        return value
    value.update(version=VERSION, hypothesis_evaluation="free_text_not_parsed_or_tested",
                 numerical_scope="net_image_phase_closure_on_specified_circuits_only")
    value["unknown"].insert(0, "The free-text hypothesis is recorded, not parsed or tested. Numerical support/opposition concerns only net image-phase closure on the specified circuits, not arbitrary hypotheses, material displacement or real dislocations.")
    value["next_tools"] = [{"tool": "image_info", "object_id": value["topology_object_id"],
        "purpose": "Read the saved topology report.loops[].reflections[] failures, low_amplitude_path_pixels, ineligible_path_pixels and edge_invalid_path_pixels for each specified path; invalid paths are not zero winding."}]
    for ident in gpa_ids(workspace.object(value["topology_object_id"])[0], api):
        gpa, _ = workspace.object(ident)
        names = ("amplitude.npy", "low_amplitude.npy", "valid_phase.npy", "valid_displacement.npy", "valid_tensor.npy", "edge_invalid.npy")
        value["next_tools"].append({"tool": "image_export", "object_id": ident,
            "files_sha256": {name: gpa["files_sha256"][name] for name in names},
            "purpose": "Export this GPA object to a new output_dir with a new request_id for amplitude.npy and saved mask NPYs (low_amplitude, valid_phase, valid_displacement, valid_tensor, edge_invalid). Verify manifest.json/files_sha256 and provenance.json against this GPA object. Exporting a review or gpa_read object does not export these GPA arrays."})
    value["next_tools"].extend([
        {"tool": "image_gpa_read", "purpose": "Optional 1..64 explicitly selected integer local [x,y] samples of phase_1/phase_2, displacement ux/uy and tensors exx/eyy/exy/rotation, with phase_valid/tensor_valid and invalid_reason. It does not return amplitude or per-band low-amplitude masks; do not round supplied fractional anchors silently."},
        {"tool": "image_profile", "purpose": "Inspect explicit source-pixel real-space lines at the supplied anchors; manual lattice/fringe interpretation is still required, no automatic tracing."},
        {"tool": None, "purpose": "Obtain independent lattice-position/structure evidence and an appropriate image-formation model or additional imaging data to distinguish displacement from contrast-only modulation."}])
    return value


def readable(value):
    lines = ["Candidate: " + value["hypothesis"], "Conditional image evidence; material dislocation NOT confirmed."]
    if value["version"] == VERSION:
        lines[0] = "Caller hypothesis (free text, not parsed or tested): " + value["hypothesis"]
        lines.append("Numerical scope: net image-phase closure on specified circuits only; no test of arbitrary hypotheses or material displacement.")
    for title, key in (("Supports", "supports"), ("Opposes", "opposes"), ("Unknown", "unknown")):
        lines.append(title + ":")
        lines.extend("- " + item for item in value[key])
        if not value[key]:
            lines.append("- No evidence in this category was established.")
    lines.append("Next tools/data:")
    lines.extend("- " + (item["tool"] or "Independent data/model") +
                 (" [object_id=" + item["object_id"] + "]" if "object_id" in item else "") + ": " + item["purpose"] for item in value["next_tools"])
    lines.extend(["Real-space source: " + value["real_space_evidence"]["source_text"],
                  "Anchors (source pixels): " + str(value["real_space_evidence"]["anchors_xy"]),
                  "Model assumption: " + value["conditions"]["model_assumption_text"],
                  "Paths (local FFT pixels, half-open rectangles): " + str(value["conditions"]["loops"]),
                  "GPA references: " + str(value["conditions"]["gpa_references"]),
                  "Method participation: " + value["topology_participation"],
                  "Method decision: " + value["method_decision"]["reason"]])
    return "\n".join(lines) + "\n"


def preview_lines(value):
    statuses = [g["status"] for g in value["conditions"]["loop_groups"]]
    lines = ["Candidate review | conditional image evidence; material dislocation NOT confirmed",
        "Saved path status: " + ", ".join(statuses) + "; method: " + value["method_decision"]["reason"],
        "Supports: " + ("qualified nonzero image-phase closure on saved nested paths" if "projected_topological_evidence" in statuses else "no qualified nonzero closure established"),
        "Opposes: " + ("zero net winding on saved valid paths; not universal defect absence" if "no_net_winding_detected" in statuses else "see separately attributed real-space statement; no numerical physical rejection"),
        "Real-space input: " + value["real_space_evidence"]["origin"] + "; caller relation=" + value["real_space_evidence"]["relation"] + "; not authenticated/traced",
        "Unknown: displacement versus contrast-only origin; physical model, 3D interpretation and independent real-space validation",
        "Next: image_gpa_read for path amplitude/reference validity; image_profile at explicit real-space anchors; independent structure/imaging evidence",
        "Units: source pixels; physical scale unknown unless separately calibrated. Full sources, paths and references: candidate-review.txt"]
    if value["version"] == VERSION:
        lines.insert(1, "Hypothesis: free text recorded only, not parsed or tested. Numerical support/opposition: specified-circuit net image-phase closure only.")
        lines[-2:-1] = [
            "Next: image_info on topology for path failures/low-amplitude counts; image_export on each GPA for amplitude.npy and masks with manifest/provenance.",
            "Optional image_gpa_read: integer phase/displacement/tensor samples and validity flags only; no amplitude or per-band mask output.",
            "Then image_profile on explicit real-space lines and independent structure/imaging evidence; no automatic lattice tracing."]
    return lines


def append_preview(directory, value):
    lines = [part for line in preview_lines(value) for part in textwrap.wrap(line, width=112)]
    with Image.open(directory / "preview.png") as image:
        output = Image.new("RGB", (max(800, image.width), image.height + 24 + 18*len(lines)), "white")
        output.paste(image, (0, 0))
        draw = ImageDraw.Draw(output)
        for i, line in enumerate(lines):
            draw.text((12, image.height + 12 + i*18), line, fill="black")
        output.save(directory / "preview.png")
