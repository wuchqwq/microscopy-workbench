"""Bounded composition of existing reflection comparisons, not a search engine."""
import hashlib
from pathlib import Path

from crystallography.analysis_revision import bind_geometry
from crystallography.reflection_compare import load_measurement, measurement_vector, registration


def run(workspace, request, execute):
    # The configured adapter supplies this root; the MCP caller supplies IDs only.
    from tools.image_workspace import Workspace as ImageWorkspace
    from crystallography.structure_tools import ID, canonical, finite, need, sha, read_bytes

    identities = request.get("measurement_object_ids")
    candidates = request.get("candidates")
    need(type(identities) is list and 1 <= len(identities) <= 32 and
         all(type(value) is str and ID.fullmatch(value) for value in identities) and
         len(set(identities)) == len(identities), "Supply 1..32 distinct saved measurement IDs")
    need(type(candidates) is list and 1 <= len(candidates) <= 3,
         "Compare 1..3 explicit saved simulation candidates")
    tolerance = request.get("max_residual_inv_angstrom")
    need(finite(tolerance) and 1e-12 <= tolerance <= 1, "Declare a bounded reciprocal residual tolerance")
    need(request.get("experimental_kind") in ("real_space_fft", "saed", "other_diffraction"),
         "Declare the experimental image-formation kind")
    need(type(request.get("current_image_object_id")) is str and ID.fullmatch(request["current_image_object_id"]),
         "Supply the selected current image revision")
    images = ImageWorkspace(request.get("image_workspace"), False)
    images.object(request["current_image_object_id"])
    paths, measurements, sources, total = [], [], [], 0
    for ident in identities:
        saved, directory = images.object(ident)
        path = directory / "object.json"
        measured, source, raw, journal = load_measurement(path)
        measurement_vector(measured)  # Require sourced physical DC geometry, not PNG or labels.
        total += len(raw) + len(journal)
        need(total <= 2 * 1024 * 1024, "Measurement evidence exceeds2MiB", "BUDGET_EXCEEDED")
        paths.append(str(path))
        measurements.append(measured)
        sources.append(source)
    binding = bind_geometry(measurements, sources, request["current_image_object_id"], "continue_current")

    labels, specifications = set(), set()
    for item in candidates:
        need(type(item) is dict and set(item) == {"label", "simulation_object_id", "registration"},
             "Each candidate needs label, simulation_object_id and explicit registration")
        label = item["label"]
        need(type(label) is str and 1 <= len(label.strip()) <= 100 and label not in labels,
             "Candidate labels must be distinct nonempty strings<=100 characters")
        labels.add(label)
        simulation, _ = workspace.object(item["simulation_object_id"])
        need(simulation.get("kind") == "simulate", "Each candidate must be a saved structure_simulate result")
        transform = item["registration"]
        registration(transform)
        need(transform["scale"] == 1 and transform["translation_inv_angstrom"] == [0, 0],
             "Candidate batch fixes independent scale=1 and translation=[0,0]; correct the image centre explicitly")
        specification = canonical([item["simulation_object_id"], transform])
        need(specification not in specifications, "Duplicate candidate/transform is not additional evidence")
        specifications.add(specification)

    rows, receipts = [], []
    for index, item in enumerate(candidates):
        child_id = "candidate-" + hashlib.sha256((request["request_id"] + ":" + str(index)).encode()).hexdigest()[:40]
        response = execute({"workspace": str(workspace.root), "action": "compare", "request_id": child_id,
                            "object_id": item["simulation_object_id"], "measurement_paths": paths,
                            "experimental_kind": request["experimental_kind"], "registration": item["registration"],
                            "max_residual_inv_angstrom": tolerance,
                            "current_image_object_id": request["current_image_object_id"], "analysis_mode": "continue_current"})
        common = {"label": item["label"], "status": "hypothesized", "simulation_object_id": item["simulation_object_id"],
                  "request_id": child_id, "phase_identified": False, "independent_validation": "NOT_VALIDATED"}
        if not response.get("ok"):
            rows.append({**common, "state": response.get("state", "unknown"), "error": response.get("error"),
                         "automatic_retry": False})
            # Unknown is not a refusal or permission to replay; preserve every receipt.
            if response.get("state") != "failed":
                break
            continue
        result = response["result"]
        object_id = result["object_id"]
        manifest_sha256 = sha(read_bytes(Path(result["manifest_path"]), 16 * 1024 * 1024))
        receipts.append({"object_id": object_id, "request_id": child_id, "object_manifest_sha256": manifest_sha256})
        rows.append({**common, "state": "completed", "comparison_object_id": object_id,
                     "comparison_manifest_sha256": manifest_sha256, "comparison_status": result["comparison_status"],
                     "matched": result["matched"], "unmatched_experimental": result["unmatched_experimental"],
                     "unmatched_simulated_count": len(result["unmatched_simulated"]),
                     "full_unmatched_simulated_reference": {"tool": "structure_info", "object_id": object_id,
                                                            "field": "unmatched_simulated"},
                     "ambiguity": result["ambiguity"], "registration": result["registration"],
                     "all_experimental_reflections_matched_within_tolerance": result["all_experimental_reflections_matched_within_tolerance"]})
    completed = sum(row["state"] == "completed" for row in rows)
    return {"kind": "compare_batch", "batch_status": "completed" if completed == len(candidates) else "partial_or_failed",
            "current_image_object_id": request["current_image_object_id"], "measurement_object_ids": identities,
            "analysis_binding": binding, "experimental_kind": request["experimental_kind"],
            "candidates": rows, "child_receipts": receipts, "requested_candidate_count": len(candidates),
            "completed_candidate_count": completed, "phase_identified": False, "intensity_comparison_performed": False,
            "source_arrays_changed": False, "experimental_calibration_changed": False,
            "scientific_limits": ["All candidate assignments and trial rotations remain hypotheses, not confirmed HKL or phase identification.",
                                  "These comparison points are search evidence, not independent held-out validation.",
                                  "No orientation search, scale fitting, mirror search, twin law, defect evidence or phase fraction is inferred.",
                                  "Full matched/unmatched numerical evidence remains in each authoritative structure_compare object.",
                                  "Each child is independently committed; partial batches are not rolled back or automatically replayed."]}
