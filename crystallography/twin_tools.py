"""F3b adapters: immutable existing structures, simulations and image evidence.

No scattering, FFT, new matcher or global current-state store lives here.
Saved comparisons are historical snapshots; continuing always names current
image revisions and creates a new request, optionally linked to a prior result.
"""
import csv
import io
from pathlib import Path

import numpy as np

from crystallography.structure_tools import (ID, atoms_data, canonical, finite,
                                           need, read_bytes, sha, write_new)
from crystallography.twin_geometry import orient_candidate, evaluate


def sourced_text(value, name):
    need(type(value) is str and 1 <= len(value.strip()) <= 2000, name + " needs an explicit bounded source/basis")
    return value


def line_meets_support(points, rectangles):
    """A saved interface segment must reach the two selected window supports.

    This closed-contact check binds a line to the observed neighborhood. It
    does not find a boundary or identify its atomic plane.
    """
    box = [max(r[0] for r in rectangles), max(r[1] for r in rectangles),
           min(r[2] for r in rectangles), min(r[3] for r in rectangles)]
    lower, upper = 0., 1.
    for axis in (0, 1):
        start, delta = points[0][axis], points[1][axis] - points[0][axis]
        if delta == 0:
            if not box[axis] <= start <= box[axis+2]:
                return False
        else:
            a, b = sorted(((box[axis]-start)/delta, (box[axis+2]-start)/delta))
            lower, upper = max(lower, a), min(upper, b)
            if lower > upper:
                return False
    return True


def orient(workspace, request, ident):
    previous, atoms, source_id = workspace.structure(request.get("object_id"))
    parent = workspace.orientation(request.get("orientation_id"), source_id, atoms)
    basis = sourced_text(request.get("candidate_basis"), "candidate_basis")
    result = orient_candidate(atoms, parent, request.get("plane_hkl"))
    relation = {**result["twin_relation"], "parent_orientation_id": request["orientation_id"],
                "structure_object_id": source_id, "candidate_basis": basis,
                "interpretation_status": "hypothesized", "twin_confirmed": False,
                "method_version": "f3b_cubic_sigma3_v1"}
    record = {**result["orientation"], "orientation_id": ident, "structure_object_id": source_id,
              "source_atoms_sha256": sha(canonical(atoms_data(atoms))), "twin_relation": relation}
    return {"kind": "orient", "orientation": record, "twin_relation": relation,
            "parent_object_id": previous["object_id"], "structure_object_id": source_id,
            "source_provenance": workspace.source_provenance(source_id),
            "interpretation_status": "hypothesized", "phase_identified": False, "twin_confirmed": False,
            "source_coordinates_modified": False}


def simulation(workspace, ident, structure_id, orientation_id):
    saved, directory = workspace.object(ident)
    need(saved.get("kind") == "simulate" and saved.get("structure_object_id") == structure_id and
         saved.get("software_provenance", {}).get("diffsims") == "0.7.0" and
         saved.get("reciprocal_enumeration", {}).get("completeness_certified") is True,
         "Use an actual qualified pinned diffsims simulation of the exact original structure")
    need(saved.get("orientation", {}).get("orientation_id") == orientation_id,
         "Simulation orientation differs from the saved parent/twin relation")
    from crystallography.structure_tools import json_file
    need(json_file(directory / "reflections.json") == saved.get("reflections"),
         "Simulation reflection table differs from committed evidence", "CORRUPT_OBJECT")
    return saved, directory


def page(workspace, request):
    """Existing journal/hash validation, then a named numerical section only."""
    saved, directory = workspace.object(request.get("object_id"))
    need(saved.get("kind") == "twin_compare" and saved.get("method_version") == "f3b_cubic_sigma3_v1",
         "Read a saved F3b comparison object")
    name, section = request.get("comparison"), request.get("section")
    need(name in ("parent_domain", "twin_domain", "untwinned_control") and section in
         ("observations", "matched", "unmatched_experimental", "unmatched_simulated", "ambiguity", "pairwise_angles"),
         "Choose an advertised F3b comparison/section")
    offset, limit = request.get("offset"), request.get("limit")
    need(type(offset) is int and 0 <= offset <= 100000 and type(limit) is int and 1 <= limit <= 128,
         "Declare bounded evidence offset and limit1..128")
    from crystallography.structure_tools import strict_json
    full = strict_json(read_bytes(directory / "comparisons.json", 16 * 1024 * 1024))
    rows = full["comparisons"].get(name, {}).get(section, [])
    need(type(rows) is list, "Saved F3b numerical section is malformed", "CORRUPT_OBJECT")
    need(offset <= len(rows), "Evidence offset exceeds this saved section")
    end = min(len(rows), offset + limit)
    return {"object_id": saved["object_id"], "request_id": saved["request_id"], "kind": "twin_evidence_page",
            "comparison": name, "section": section, "offset": offset, "limit": limit, "total": len(rows),
            "rows": rows[offset:end], "next_offset": end if end < len(rows) else None,
            "artifact_sha256": saved["files_sha256"]["comparisons.json"],
            "interpretation_status": "hypothesized", "historical_snapshot": True, "recomputed": False}


def run(workspace, request, directory):
    from crystallography.twin_observations import load_domains
    from crystallography.reflection_compare import registration

    relation_object, atoms, structure_id = workspace.structure(request.get("object_id"))
    relation = relation_object.get("twin_relation")
    need(relation_object.get("kind") == "orient" and type(relation) is dict and
         relation.get("method_version") == "f3b_cubic_sigma3_v1",
         "object_id must be a saved structure_twin_orient candidate")
    parent = workspace.orientation(relation["parent_orientation_id"], structure_id, atoms)
    twin = workspace.orientation(relation_object["object_id"], structure_id, atoms)
    a, a_dir = simulation(workspace, request.get("parent_simulation_object_id"), structure_id,
                          relation["parent_orientation_id"])
    b, b_dir = simulation(workspace, request.get("twin_simulation_object_id"), structure_id,
                          relation_object["object_id"])
    for saved, expected in ((a, parent), (b, twin)):
        need(saved.get("orientation") == expected, "Saved simulation does not use the exact committed orientation", "CORRUPT_OBJECT")
    keys = ("object_id", "voltage_kv", "reciprocal_radius_inv_angstrom", "max_excitation_error_inv_angstrom",
            "size", "sigma_pixels", "with_direct_beam", "native_float32")
    # Absence and an explicit default need not be conflated: first scope is exact settings.
    need({k: a["parameters"].get(k) for k in keys} == {k: b["parameters"].get(k) for k in keys},
         "Parent/twin simulations must share the same original structure and all simulation settings")
    # Simulation.parameters is the engine's normalized settings, not the
    # original MCP payload. The original journal remains the request authority.
    from crystallography.structure_tools import json_file
    a_request = json_file(workspace.root / "requests" / (a["request_id"] + ".json"))["parameters"]
    b_request = json_file(workspace.root / "requests" / (b["request_id"] + ".json"))["parameters"]
    need(a_request.get("object_id") == b_request.get("object_id") == structure_id,
         "Simulate the original structure twice with different orientation IDs; do not reapply orientations to derived atoms")
    transform = request.get("registration")
    registration(transform)
    need(transform["scale"] == 1 and transform["translation_inv_angstrom"] == [0, 0],
         "F3b fixes independent experimental scale=1 and DC translation=[0,0]")
    tolerance, angle = request.get("max_residual_inv_angstrom"), request.get("angular_tolerance_deg")
    need(finite(tolerance) and 1e-12 <= tolerance <= 1 and finite(angle) and .01 <= angle <= 5,
         "Declare reciprocal residual and interface angular bounds before comparison")
    has_interface = "interface_measurement_object_id" in request
    need(has_interface == ("interface_projection_basis" in request),
         "A saved interface line and its explicit orthographic projection/source basis are supplied together")
    if has_interface:
        sourced_text(request["interface_projection_basis"], "interface_projection_basis")
    evidence = load_domains(request.get("image_workspace"), request.get("domains"),
                            request.get("current_spatial_image_object_id"), request.get("interface_measurement_object_id"))
    if has_interface:
        need(line_meets_support(evidence["interface"]["points"], [side["rect_xyxy"] for side in evidence["domains"]]),
             "Saved interface segment does not meet the selected ROI contact/overlap neighborhood",
             "MEASUREMENT_SCOPE_MISMATCH")
    revision = {"revision": 1, "previous_twin_comparison_id": None, "historical_parent_reinterpreted": False}
    if "previous_twin_comparison_id" in request:
        old, _ = workspace.object(request["previous_twin_comparison_id"])
        note = sourced_text(request.get("revision_note"), "revision_note")
        need(old.get("kind") == "twin_compare" and old.get("structure_object_id") == structure_id,
             "Previous result must be an F3b comparison of this exact structure")
        old_source, new_source = old["source_binding"], evidence["source_binding"]
        need(all(old_source.get(k) == new_source.get(k) for k in
                 ("frame_object_id", "source_object_id", "source_array_sha256")),
             "F3b revision cannot silently switch source/frame/array; start a separate comparison")
        depth = old["revision_history"]["revision"] + 1
        need(depth <= 16, "F3b immutable revision limit16 reached; retain history and start a new comparison", "BUDGET_EXCEEDED")
        revision.update(revision=depth, previous_twin_comparison_id=old["object_id"], revision_note=note,
                        previous_manifest_sha256=sha(read_bytes(old["manifest_path"])))
    else:
        need("revision_note" not in request, "revision_note requires a previous result")

    # Fixed input records, not a second array store or a mutable provider index.
    input_paths = [Path(relation_object["manifest_path"]), Path(a["manifest_path"]), Path(b["manifest_path"]),
                   a_dir / "reflections.json", b_dir / "reflections.json"]
    for domain in evidence["domains"]:
        input_paths.extend(Path(p) for p in domain["measurement_paths"])
        input_paths.extend(Path(s["journal_path"]) for s in domain["sources"])
    # Snapshot authoritative field/current wrapper records, without array copies.
    image_root = Path(request["image_workspace"]).resolve()
    image_ids = {request["current_spatial_image_object_id"], evidence["source_binding"]["frame_object_id"]}
    for domain in evidence["domains"]:
        image_ids.update((domain["field_object_id"], domain["resolved_field_object_id"], domain["current_image_object_id"], domain["fft_object_id"]))
    from crystallography.structure_tools import json_file
    for image_id in sorted(image_ids):
        need(ID.fullmatch(image_id), "Unexpected saved image identity", "CORRUPT_OBJECT")
        file = image_root / "objects" / image_id / "object.json"
        saved = json_file(file)
        input_paths.extend((file, image_root / "requests" / (saved["request_id"] + ".json")))
    if evidence.get("interface"):
        line = evidence["interface"]
        input_paths.append(Path(line["measurement_path"]))
        input_paths.append(Path(line["source"]["journal_path"]))
    receipts, total = [], 0
    for index, file in enumerate(dict.fromkeys(input_paths)):
        raw = read_bytes(file, 8 * 1024 * 1024)
        total += len(raw)
        need(total <= 16 * 1024 * 1024, "Fixed F3b evidence exceeds16MiB", "BUDGET_EXCEEDED")
        name = "input-{:02d}.json".format(index)
        write_new(directory / name, raw)
        receipts.append({"file": name, "original_path": str(file), "sha256": sha(raw)})
    if evidence["physical_ready"]:
        interface = None
        if has_interface and evidence["interface"].get("physical_ready"):
            interface = {"physical_vector_xy": evidence["interface"]["physical_vector_xy"], "unit": evidence["interface"]["physical_unit"],
                         "projection": "orthographic_beam_plus_z", "source_basis": request["interface_projection_basis"]}
        result = evaluate(evidence["domains"][0]["measurements"], evidence["domains"][1]["measurements"],
                          a, b, transform, tolerance, interface=interface, angular_tolerance=angle)
        if not evidence["evidence_quality_ready"]:
            result["projected_relation"].update(status="insufficient_evidence",
                reason="Saved source observation is incomplete, ambiguous, masked or below its own admission requirements",
                source_observation_quality_reasons=[side["evidence_quality_reasons"] for side in evidence["domains"]])
            result["status"] = "insufficient_evidence"
    else:
        result = {"status": "insufficient_evidence",
                  "projected_relation": {"status": "insufficient_evidence", "reason": "Missing or withdrawn sourced physical calibration; pixel observations retained"},
                  "interface": {"status": "insufficient_evidence", "reason": "No valid joint physical reciprocal geometry"},
                  "comparisons": {}}
    write_new(directory / "comparisons.json", canonical(result) + b"\n")
    write_csv(directory / "reflections.csv", result.get("comparisons", {}))
    compact = {k: v for k, v in result.items() if k != "comparisons"}
    compact["comparisons"] = {key: {k: value[k] for k in ("comparison_status", "matched", "unmatched_experimental", "ambiguity") if k in value}
                              | {"unmatched_simulated_count": len(value.get("unmatched_simulated", []))}
                              for key, value in result.get("comparisons", {}).items()}
    compact_domains = [{k: v for k, v in domain.items() if k not in ("measurements", "sources", "measurement_paths")}
                      for domain in evidence["domains"]]
    write_new(directory / "observation-bindings.json", canonical(evidence) + b"\n")
    render(directory, result, a, b, transform)
    return {**compact, "kind": "twin_compare", "method_version": "f3b_cubic_sigma3_v1",
            "structure_object_id": structure_id, "parent_object_id": relation_object["object_id"],
            "twin_relation": relation, "source_binding": evidence["source_binding"],
            "domains": compact_domains, "adjacency": evidence["adjacency"],
            "interface_measurement_object_id": request.get("interface_measurement_object_id"),
            "revision_history": revision, "fixed_input_receipts": receipts,
            "simulation_object_ids": [a["object_id"], b["object_id"]],
            "registration": transform, "max_residual_inv_angstrom": tolerance, "angular_tolerance_deg": angle,
            "full_numerical_evidence": {"comparisons": str(directory / "comparisons.json"),
                                        "observations": str(directory / "observation-bindings.json"),
                                        "reflections_csv": str(directory / "reflections.csv")},
            "interpretation_status": "hypothesized", "phase_identified": False, "twin_confirmed": False,
            "unique_3d_twin": False, "atomic_coherence_verified": False, "intensity_comparison_performed": False,
            "source_arrays_modified": False, "fft_recomputed": False, "simulation_recomputed": False,
            "scientific_limits": ["One conditional projected candidate and a no-twin control, not unique three-dimensional twinning or phase identification.",
                                  "A compatible interface trace does not prove atomic registry, stacking or boundary coherence.",
                                  "Absent predicted peaks remain unmatched; real-space FFT intensity is not kinematic diffraction intensity.",
                                  "Caller-supplied parent orientation and shared registration are hypotheses; these same points are not held-out validation.",
                                  "Saved result queries inspect fixed historical evidence, not a new observation or a global latest calibration."]}


def write_csv(file, comparisons):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["comparison", "measurement_object_id", "h", "k", "l", "residual_inv_angstrom", "state"])
    for name, result in comparisons.items():
        for row in result.get("matched", []):
            writer.writerow([name, row.get("measurement_object_id"), *row.get("hkl", [None]*3),
                             row.get("position_residual_inv_angstrom"), "matched_hypothesis"])
        for row in result.get("unmatched_experimental", []):
            writer.writerow([name, row.get("measurement_object_id"), "", "", "", "", "unmatched"])
    write_new(file, stream.getvalue().encode("utf-8"))


def render(directory, result, parent, twin, transform):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.8), layout="constrained")
    for ax, key, prediction, title in ((axes[0], "parent_domain", parent, "Domain A / parent"),
                                       (axes[1], "twin_domain", twin, "Domain B / Sigma3 candidate")):
        xy = np.asarray(prediction["reflections"]["coordinates_inv_angstrom"])
        ax.scatter(xy[:, 0], xy[:, 1], s=18, facecolors="none", edgecolors="#ed8b33", label="predicted geometry")
        measured = result.get("comparisons", {}).get(key, {}).get("observations", [])
        if measured:
            q = np.asarray([row["q_xy_inv_angstrom"] for row in measured])
            from crystallography.reflection_compare import registration
            q = q @ np.asarray(registration(transform)["matrix_xy"]).T
            ax.scatter(q[:, 0], q[:, 1], s=12, c="#00adbf", label="saved FFT measurements")
        ax.axhline(0, c=".8", lw=.5); ax.axvline(0, c=".8", lw=.5)
        ax.set(xlabel="qx (cycles / angstrom)", ylabel="qy (cycles / angstrom)", title=title, aspect="equal")
        ax.legend(fontsize=7, loc="upper right")
    fig.suptitle(str(result["status"]) + " | projected hypothesis; no 3D twin confirmation", fontsize=10)
    fig.savefig(directory / "preview.png", dpi=120)
    plt.close(fig)
