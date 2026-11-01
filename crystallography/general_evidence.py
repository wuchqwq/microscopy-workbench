"""Bounded adjacent-ROI comparisons for explicitly supplied crystal models.

Composition only: the existing observation adapter and reflection matcher own
scientific admission and geometry. No twin law, structure/orientation search,
FFT, scattering calculation or second request journal is implemented here.
"""
from copy import deepcopy
import csv
import hashlib
import io
from pathlib import Path

from crystallography.reflection_compare import compare, registration
from crystallography.twin_geometry import _independence


VERSION = "general_crystallographic_evidence_v1"
CONDITION_KEYS = ("voltage_kv", "reciprocal_radius_inv_angstrom", "max_excitation_error_inv_angstrom",
                  "scattering_params", "shape_factor", "shape_factor_width", "minimum_intensity_relative",
                  "debye_waller_factors", "with_direct_beam")
LIMITS = [
    "Conditional projected reciprocal geometry only; no unique phase or three-dimensional orientation relationship is established.",
    "Candidate structures, orientations and shared screen registration are supplied hypotheses, not automatic search results.",
    "Matched points are comparison/search evidence, not independent held-out validation.",
    "Missing simulated peaks remain unmatched: a real-space image FFT is not a kinematic intensity measurement.",
    "No twin law, CSL relation, atomic interface coherence, chemistry or phase fraction is inferred.",
    "Each child request is independently committed; a failed or unknown child is retained and never automatically retried.",
]


def _text(value, label, limit=2000):
    from crystallography.structure_tools import need
    need(type(value) is str and 1 <= len(value.strip()) <= limit, "Supply bounded explicit " + label)
    return value


def _candidate_specs(request):
    from crystallography.structure_tools import ID, canonical, need
    specs = request.get("candidates")
    need(type(specs) is list and 1 <= len(specs) <= 3, "Supply1..3 explicit pairs of saved simulation candidates")
    labels, pairs = set(), set()
    for item in specs:
        need(type(item) is dict and set(item) == {"label", "simulation_a_object_id", "simulation_b_object_id", "basis"},
             "Each candidate pair needs label, simulation_a_object_id, simulation_b_object_id and basis")
        label = _text(item["label"], "candidate label", 100)
        _text(item["basis"], "candidate selection basis")
        need(label not in labels, "Candidate labels must be distinct")
        labels.add(label)
        for key in ("simulation_a_object_id", "simulation_b_object_id"):
            need(type(item[key]) is str and ID.fullmatch(item[key]), "Use exact saved simulation IDs")
        pair = canonical([item["simulation_a_object_id"], item["simulation_b_object_id"]])
        need(pair not in pairs, "Duplicate candidate pairs are not additional evidence")
        pairs.add(pair)
    return specs


def _simulation(workspace, ident):
    from crystallography.structure_tools import ID, atoms_data, canonical, json_file, need, read_bytes, sha
    from tools.crystal_qualification import qualify_structure
    # Check kind before recursive admission, so a coherent forged aggregate
    # reference cannot turn a simulator input into an aggregate/self cycle.
    need(json_file(workspace.root / "objects" / ident / "object.json").get("kind") == "simulate",
         "Each candidate must be an actual saved structure_simulate result")
    saved, directory = workspace.object(ident)
    need(saved.get("kind") == "simulate", "Each candidate must be an actual saved structure_simulate result")
    need(type(saved.get("structure_object_id")) is str and ID.fullmatch(saved["structure_object_id"]) and
         json_file(workspace.root / "objects" / saved["structure_object_id"] / "object.json").get("kind") == "structure",
         "Simulation source is not an atomic structure", "CORRUPT_OBJECT")
    _, atoms, source_id = workspace.structure(ident)
    orientation = saved.get("orientation")
    need(type(orientation) is dict and type(orientation.get("orientation_id")) is str,
         "General evidence first scope requires a saved shared orientation; legacy Euler simulations remain available to structure_compare",
         "UNQUALIFIED_ORIENTATION")
    need(ID.fullmatch(orientation["orientation_id"]) and
         json_file(workspace.root / "objects" / orientation["orientation_id"] / "object.json").get("kind") == "orient",
         "Simulation orientation is not a saved orientation record", "CORRUPT_OBJECT")
    expected = workspace.orientation(orientation["orientation_id"], source_id, atoms)
    need(orientation == expected, "Simulation uses a different source structure/orientation", "CORRUPT_OBJECT")
    original = json_file(workspace.root / "requests" / (saved["request_id"] + ".json"))["parameters"]
    need(original.get("action") == "simulate" and original.get("orientation_id") == orientation["orientation_id"] and
         original.get("object_id") == saved.get("parent_object_id") and
         all(original.get(key) == saved.get("parameters", {}).get(key) for key in
             ("voltage_kv", "reciprocal_radius_inv_angstrom", "max_excitation_error_inv_angstrom")) and
         json_file(directory / "reflections.json") == saved.get("reflections"),
         "Simulation differs from its original settings or committed reflection table", "CORRUPT_OBJECT")
    input_metadata = json_file(directory / "input.json")["external_provenance"]
    need(input_metadata.get("structure_object_id") == source_id and input_metadata.get("orientation") == orientation and
         input_metadata.get("structure_snapshot_sha256") == sha(canonical(atoms_data(atoms))) and
         input_metadata.get("structure_snapshot") == atoms_data(atoms),
         "Simulation capture uses different atoms/orientation", "CORRUPT_OBJECT")
    provenance = workspace.source_provenance(source_id)
    origin = provenance["source_object_id"]
    _, source_directory = workspace.object(origin)
    need(provenance["source"]["format"] in ("cif", "xyz"), "Unsupported original structure source format", "CORRUPT_OBJECT")
    source_bytes = read_bytes(source_directory / ("source." + provenance["source"]["format"]))
    qualification = qualify_structure(atoms, source_provenance=provenance, source_bytes=source_bytes, simulation=saved)
    need(qualification["kinematic_simulation"]["status"] == "qualified_saved_kinematic_model",
         "Saved candidate does not meet the declared source/site/occupancy/cell/kinematic qualification",
         "UNQUALIFIED_CRYSTAL_MODEL")
    source_record, source_dir = workspace.object(source_id)
    orientation_record, orientation_dir = workspace.object(orientation["orientation_id"])
    return saved, {"simulation_object_id": ident, "simulation_manifest_sha256": sha(read_bytes(directory / "object.json")),
                   "simulation_reflections_sha256": saved["files_sha256"]["reflections.json"],
                   "structure_object_id": source_id, "structure_manifest_sha256": sha(read_bytes(source_dir / "object.json")),
                   "source_atoms_sha256": sha(canonical(atoms_data(atoms))),
                   "orientation_object_id": orientation_record["object_id"],
                   "orientation_manifest_sha256": sha(read_bytes(orientation_dir / "object.json")),
                   "orientation_matrix_cartesian": orientation["rotation_matrix_cartesian"],
                   "qualification": qualification}


def simulation_conditions(simulations):
    """Freeze shared scientific conditions; raster size/sigma are display only."""
    from crystallography.structure_tools import need
    conditions = [{key: saved.get("parameters", {}).get(key) for key in CONDITION_KEYS} for saved in simulations.values()]
    need(conditions and all(item == conditions[0] for item in conditions[1:]),
         "All same-experiment candidates require identical scientific simulation voltage, cutoff, excitation and scattering conditions",
         "SIMULATION_CONDITIONS_MISMATCH")
    return conditions[0]


def assess_side(comparison, measurements, tolerance, quality_ready=True, physical_ready=True):
    """Finite conditional admission, reusing the unchanged F3b direction policy."""
    if not physical_ready:
        return {"status": "insufficient_evidence", "reason": "No current sourced physical reciprocal calibration or no measurements",
                "direction_evidence": None, "independent_validation": "NOT_VALIDATED"}
    direction = _independence(measurements, tolerance)
    if not quality_ready:
        status, reason = "insufficient_evidence", "Saved observation is truncated, masked, ambiguous or below its own admission requirements"
    elif not direction["adequate"]:
        status, reason = "insufficient_evidence", "At least two resolved noncollinear reciprocal direction families are required"
    elif comparison is None:
        status, reason = "insufficient_evidence", "No completed authoritative comparison is available"
    elif any(row.get("ambiguous_within_tolerance") for row in comparison["ambiguity"]):
        status, reason = "insufficient_evidence", "Several HKL or projected reflection assignments remain within the declared tolerance"
    elif comparison["all_experimental_reflections_matched_within_tolerance"]:
        status, reason = "compatible", "All selected observations match this explicit projected candidate within the declared tolerance"
    else:
        status, reason = "incompatible", "The selected observations do not all match this explicit projected candidate within the declared tolerance"
    return {"status": status, "reason": reason, "direction_evidence": direction,
            "independent_validation": "NOT_VALIDATED", "intensity_comparison_performed": False}


def _pair_status(sides):
    statuses = [row["status"] for row in sides]
    if "insufficient_evidence" in statuses:
        return "insufficient_evidence"
    return "compatible" if all(value == "compatible" for value in statuses) else "incompatible"


def _overall(rows):
    passed = [row["label"] for row in rows if row["status"] == "compatible"]
    unresolved = [row["label"] for row in rows if row["status"] == "insufficient_evidence"]
    if len(passed) == 1 and not unresolved:
        return {"status": "compatible", "reason": "One explicit pair is conditionally compatible within the finite tested set; no unique phase is established",
                "compatible_candidate_labels": passed, "unresolved_candidate_labels": unresolved}
    if not passed and not unresolved:
        return {"status": "incompatible", "reason": "None of the finite explicit pairs fits both saved observations under the same declared registration/tolerance",
                "compatible_candidate_labels": [], "unresolved_candidate_labels": []}
    return {"status": "insufficient_evidence", "reason": "Multiple compatible projections or unresolved alternatives remain",
            "compatible_candidate_labels": passed, "unresolved_candidate_labels": unresolved}


def _compact_domain(domain):
    return {key: value for key, value in domain.items() if key not in ("measurements", "sources", "measurement_paths")}


def _child_parameters(workspace, request, spec, side, domain):
    return {"workspace": str(workspace.root), "action": "compare",
            "request_id": "crystal-" + hashlib.sha256((request["request_id"] + ":" + spec["label"] + ":" + str(side)).encode()).hexdigest()[:40],
            "object_id": spec["simulation_a_object_id" if side == 0 else "simulation_b_object_id"],
            "measurement_paths": domain["measurement_paths"], "experimental_kind": request["experimental_kind"],
            "registration": request["registration"], "max_residual_inv_angstrom": request["max_residual_inv_angstrom"],
            "current_image_object_id": domain["current_image_object_id"], "analysis_mode": "continue_current"}


def _receipt_journal(workspace, directory, receipt):
    """Unknown is an observation snapshot, never a promise of a frozen worker.

    Its original journal remains the only current request authority. A late
    completion is queried explicitly by that original child ID; it cannot
    rewrite this historical aggregate or make its old unknown snapshot unreadable.
    """
    from crystallography.structure_tools import json_file, need, read_bytes, sha, strict_json
    if receipt["state"] == "unknown":
        name = receipt.get("unknown_journal_snapshot_file")
        if name is None:
            need(receipt["journal_sha256"] is None and receipt["journal_state"] == "unreadable_or_absent",
                 "Unknown receipt lost its observed journal snapshot", "CORRUPT_OBJECT")
            return None
        need(type(name) is str and Path(name).name == name and name.startswith("unknown-child-"),
             "Unsafe unknown journal snapshot", "CORRUPT_OBJECT")
        raw = read_bytes(directory / name, 8 * 1024 * 1024)
        need(sha(raw) == receipt["journal_sha256"], "Unknown journal observation changed", "CORRUPT_OBJECT")
        try:
            journal = strict_json(raw.decode("utf-8"))
        except (UnicodeError, ValueError):
            need(receipt["journal_state"] == "unreadable_or_absent", "Unknown journal decoding status changed", "CORRUPT_OBJECT")
            return None
        need(journal.get("parameters") == receipt["original_parameters"] and journal.get("state") == receipt["journal_state"] and
             journal.get("state") not in ("completed", "failed"),
             "Unknown snapshot does not describe its original pending request", "CORRUPT_OBJECT")
        return journal
    path = workspace.root / "requests" / (receipt["request_id"] + ".json")
    need(path.is_file() and sha(read_bytes(path)) == receipt["journal_sha256"], "Original final child journal changed", "CORRUPT_OBJECT")
    journal = json_file(path)
    need(journal.get("parameters") == receipt["original_parameters"] and journal.get("state") == receipt["journal_state"],
         "Original final child parameters/state changed", "CORRUPT_OBJECT")
    return journal


def _freeze_inputs(workspace, request, directory, evidence, simulation_rows):
    from crystallography.structure_tools import ID, json_file, need, read_bytes, sha, write_new
    paths = []
    image_root = Path(request["image_workspace"]).resolve()
    image_ids = {request["current_spatial_image_object_id"], evidence["source_binding"]["frame_object_id"]}
    for domain in evidence["domains"]:
        image_ids.update(domain[key] for key in ("field_object_id", "resolved_field_object_id", "current_image_object_id", "fft_object_id"))
        paths.extend(Path(value) for value in domain["measurement_paths"])
        paths.extend(Path(value["journal_path"]) for value in domain["sources"])
    # Preserve the small immutable metadata ancestry needed to check effective
    # calibration and original remeasurement requests after the image provider
    # is closed. Scientific arrays are never copied into this result.
    image_ids.update(ident for domain in evidence["domains"] for ident in domain["measurement_object_ids"])
    pending, visited = list(image_ids), set()
    while pending:
        ident = pending.pop()
        if ident in visited:
            continue
        visited.add(ident)
        need(len(visited) <= 256, "Frozen image metadata ancestry exceeds256 objects", "BUDGET_EXCEEDED")
        need(ID.fullmatch(ident), "Unexpected source identity", "CORRUPT_OBJECT")
        file = image_root / "objects" / ident / "object.json"
        original = json_file(file)
        journal_path = image_root / "requests" / (original["request_id"] + ".json")
        journal = json_file(journal_path)
        paths.extend((file, journal_path))
        for ancestor in (original.get("parent_object_id"), original.get("render_base_object_id"),
                         journal.get("parameters", {}).get("measurement_object_id")):
            if ancestor is not None:
                need(type(ancestor) is str and ID.fullmatch(ancestor), "Invalid frozen image ancestor", "CORRUPT_OBJECT")
                pending.append(ancestor)
    for item in simulation_rows.values():
        for key in ("simulation_object_id", "structure_object_id", "orientation_object_id"):
            original, saved_dir = workspace.object(item[key])
            paths.extend((saved_dir / "object.json", workspace.root / "requests" / (original["request_id"] + ".json")))
        paths.append(workspace.root / "objects" / item["simulation_object_id"] / "reflections.json")
    receipts, total = [], 0
    for index, original in enumerate(dict.fromkeys(paths)):
        raw = read_bytes(original, 8 * 1024 * 1024)
        total += len(raw)
        need(total <= 16 * 1024 * 1024, "Frozen general evidence exceeds16MiB", "BUDGET_EXCEEDED")
        name = "input-{:03d}.json".format(index)
        write_new(directory / name, raw)
        receipts.append({"file": name, "original_path": str(original), "sha256": sha(raw)})
    return receipts


def _validate_frozen_observations(request, evidence, frozen, raw_copies):
    """Reconcile the compact aggregate with exact saved input metadata/journals.

    This checks metadata only, not another image backend or scientific array
    store. Calibration/quality policies are reused from their existing owners.
    """
    from crystallography.structure_tools import canonical, need, sha
    from crystallography.reflection_compare import measurement_vector
    from crystallography.twin_observations import _quality
    from tools import image_calibration as calibration
    from tools.image_spatial_domains import _contact_geometry
    root = Path(request["image_workspace"]).resolve()

    def record(ident):
        path = str(root / "objects" / ident / "object.json")
        saved = frozen.get(path)
        need(type(saved) is dict and saved.get("object_id") == ident, "Frozen input object is missing or redirected", "CORRUPT_OBJECT")
        journal_path = str(root / "requests" / (saved["request_id"] + ".json"))
        journal = frozen.get(journal_path)
        need(type(journal) is dict and journal.get("state") == "completed" and
             journal.get("request_id") == saved["request_id"] and journal.get("parameters", {}).get("request_id") == saved["request_id"] and
             journal.get("parameters", {}).get("workspace") == str(root) and
             journal.get("parameters_sha256") == sha(canonical(journal["parameters"])) and
             journal.get("object_manifest_sha256") == sha(raw_copies[path]) and
             journal.get("response") == {"ok": True, "state": "completed", "backend": "external-image-workspace", **saved},
             "Frozen input object differs from its original request", "CORRUPT_OBJECT")
        return saved, journal, path, journal_path

    def resolved(ident):
        visited, xy = set(), None
        while True:
            need(ident not in visited and len(visited) < 32, "Invalid frozen metadata context ancestry", "CORRUPT_OBJECT")
            visited.add(ident)
            saved, _, _, _ = record(ident)
            if xy is None:
                xy = saved.get("xy_calibration")
            kind = saved["kind"]
            if kind not in ("context", "calibration", "measure", "annotate"):
                return {**saved, **({"xy_calibration": xy} if xy is not None else {})}
            ident = saved["render_base_object_id"] if kind == "annotate" else saved["parent_object_id"]

    current = resolved(request["current_spatial_image_object_id"])
    source = evidence["source_binding"]
    need(current["kind"] == "frame" and current["object_id"] == source["frame_object_id"] and
         all(current.get(key) == source.get(key) for key in ("source_object_id", "source_identity", "frame_index", "shape_yx", "dtype", "xy_calibration")) and
         current["files_sha256"]["data.npy"] == source["source_array_sha256"] and
         source["calibration_dependency"] == calibration.dependency(current.get("xy_calibration")),
         "Frozen current frame/calibration differs from aggregate source", "CORRUPT_OBJECT")
    for domain in evidence["domains"]:
        selected, _, _, _ = record(domain["field_object_id"])
        field, _, _, _ = record(domain["resolved_field_object_id"])
        need((selected["kind"] == "domain_map" and selected["parent_object_id"] == field["object_id"]) or selected["object_id"] == field["object_id"],
             "Frozen field selection changed its scientific parent", "CORRUPT_OBJECT")
        field_frame = resolved(field["parent_object_id"])
        need(field_frame["object_id"] == current["object_id"] and field.get("xy_calibration") == current.get("xy_calibration"),
             "Frozen field belongs to a different source/calibration", "CORRUPT_OBJECT")
        samples = field["regions"] if field["kind"] == "spatial_atlas" else field["samples"]
        key = "rect" if field["kind"] == "spatial_atlas" else "rect_xyxy"
        matching = [row for row in samples if row.get(key) == domain["rect_xyxy"]]
        need(len(matching) == 1, "Frozen field has no unique selected scientific rectangle", "CORRUPT_OBJECT")
        sample = matching[0]
        need(sample["fft_object_id"] == domain["fft_object_id"] and set(domain["measurement_object_ids"]) <= set(sample["measurement_object_ids"]),
             "Frozen observation changed its saved FFT/measurement membership", "CORRUPT_OBJECT")
        quality = _quality(selected, sample, domain["rect_xyxy"])
        need(all(domain.get(key) == value for key, value in quality.items()), "Frozen observation quality was promoted or changed", "CORRUPT_OBJECT")
        fft, _, _, _ = record(domain["fft_object_id"])
        active_fft = resolved(domain["current_image_object_id"])
        need(fft["kind"] == "fft" and fft["source_rect_xyxy"] == domain["rect_xyxy"] and
             fft["files_sha256"]["data.npy"] == domain["fft_array_sha256"] and
             active_fft["kind"] in ("fft", "fft_view") and active_fft.get("xy_calibration") == current.get("xy_calibration") and
             fft.get("xy_calibration") == current.get("xy_calibration"),
             "Frozen Fourier ROI/array/calibration changed", "CORRUPT_OBJECT")
        grid = {"source_grid_object_id": fft["object_id"], "shape_yx": fft["shape_yx"], "dtype": fft["dtype"],
                "array_sha256": fft["files_sha256"]["data.npy"], "source_rect_xyxy": None, "coordinate_space": "frequency_cycles_per_pixel"}
        need(domain["analysis_binding"]["scientific_grid_identity"] == grid and domain["analysis_binding"]["current_image_object_id"] == domain["current_image_object_id"],
             "Frozen current Fourier grid differs from original measurement binding", "CORRUPT_OBJECT")
        measured, sources, pixels = [], [], []
        for ident in domain["measurement_object_ids"]:
            saved, journal, path, journal_path = record(ident)
            parameters = journal["parameters"]
            need(saved["kind"] == "measure" and parameters["action"] in ("measure", "remeasure") and
                 saved["parent_object_id"] == parameters["object_id"] and
                 saved.get("xy_calibration") == current.get("xy_calibration") and
                 saved.get("calibration_dependency") == calibration.dependency(current.get("xy_calibration")) and
                 saved.get("scientific_grid_identity", grid) == grid,
                 "Frozen measurement source/grid/calibration differs", "CORRUPT_OBJECT")
            if "points" in parameters:
                need(parameters["points"] == saved["points"], "Frozen measurement points differ from the original request", "CORRUPT_OBJECT")
            elif parameters["action"] == "remeasure":
                previous, _, _, _ = record(parameters["measurement_object_id"])
                need(saved["points"] == previous["points"], "Frozen FFT remeasurement changed saved points without a correction", "CORRUPT_OBJECT")
            dc = saved.get("dc_reference_point_index")
            need(dc in (0, 1) and saved["points"][dc] == [0, 0] and saved["coordinate_space"] == "frequency_cycles_per_pixel",
                 "Frozen measurement lost mathematical FFT DC", "CORRUPT_OBJECT")
            measured.append(saved)
            sources.append({"path": path, "sha256": sha(raw_copies[path]), "bytes": len(raw_copies[path]),
                            "journal_path": journal_path, "journal_sha256": sha(raw_copies[journal_path])})
            pixels.append({"measurement_object_id": ident, "measurement_request_id": saved["request_id"],
                           "frequency_cycles_per_pixel": saved["points"][1-dc], "pixel_period": saved.get("pixel_period"),
                           "d_spacing": saved.get("d_spacing"), "d_spacing_unit": saved.get("d_spacing_unit"),
                           "calibration_dependency": calibration.dependency(saved.get("xy_calibration")), "scientific_grid_identity": grid,
                           "interpretation_status": "hypothesized"})
        physical_ready = calibration.active_scale(current.get("xy_calibration")) is not None and bool(measured)
        need(domain["measurements"] == measured and domain["sources"] == sources and domain["measurement_paths"] == [row["path"] for row in sources] and
             domain["pixel_observations"] == pixels and domain["physical_ready"] == physical_ready and
             domain["physical_observations"] == ([measurement_vector(row) for row in measured] if physical_ready else []),
             "Aggregate observations differ from their frozen original measurements", "CORRUPT_OBJECT")
    need(evidence["adjacency"] == _contact_geometry(*evidence["domains"]) and
         evidence["adjacency"]["support_relation"] in ("overlap", "shared_edge") and
         evidence["physical_ready"] == all(row["physical_ready"] for row in evidence["domains"]) and
         evidence["evidence_quality_ready"] == all(row["evidence_quality_ready"] for row in evidence["domains"]),
         "Frozen adjacency/physical/quality admission changed", "CORRUPT_OBJECT")


def run(workspace, request, directory, execute):
    from crystallography.structure_tools import canonical, finite, json_file, need, read_bytes, sha, strict_json, write_new
    from crystallography.twin_observations import load_domains
    specs = _candidate_specs(request)
    transform = request.get("registration")
    registration(transform)
    need(transform["scale"] == 1 and transform["translation_inv_angstrom"] == [0, 0],
         "General evidence fixes independent experimental scale=1 and DC translation=[0,0]")
    tolerance = request.get("max_residual_inv_angstrom")
    need(finite(tolerance) and 1e-12 <= tolerance <= 1, "Declare a bounded reciprocal residual tolerance")
    need(request.get("experimental_kind") == "real_space_fft",
         "Adjacent saved real-space ROI evidence requires experimental_kind=real_space_fft; use structure_compare for SAED")
    evidence = load_domains(request.get("image_workspace"), request.get("domains"), request.get("current_spatial_image_object_id"))
    simulations, qualification = {}, {}
    for item in specs:
        for key in ("simulation_a_object_id", "simulation_b_object_id"):
            ident = item[key]
            if ident not in simulations:
                simulations[ident], qualification[ident] = _simulation(workspace, ident)
    conditions = simulation_conditions(simulations)
    revision = {"revision": 1, "previous_evidence_id": None, "historical_parent_reinterpreted": False}
    if "previous_evidence_id" in request:
        old, _ = workspace.object(request["previous_evidence_id"])
        _text(request.get("revision_note"), "revision note")
        need(old.get("kind") == "crystal_evidence", "Previous evidence must be a saved general comparison")
        need(all(old["source_binding"].get(key) == evidence["source_binding"].get(key) for key in
                 ("frame_object_id", "source_object_id", "source_array_sha256")) and
             [row["rect_xyxy"] for row in old["domains"]] == [row["rect_xyxy"] for row in evidence["domains"]],
             "A revision must retain the same source/frame/array and exact two scientific ROI rectangles")
        depth = old["revision_history"]["revision"] + 1
        need(depth <= 16, "General evidence revision limit16 reached; retain history and start a separate result", "BUDGET_EXCEEDED")
        revision.update(revision=depth, previous_evidence_id=old["object_id"], revision_note=request["revision_note"],
                        previous_manifest_sha256=sha(read_bytes(old["manifest_path"])))
    else:
        need("revision_note" not in request, "revision_note requires previous_evidence_id")
    fixed = _freeze_inputs(workspace, request, directory, evidence, qualification)
    rows, receipts, full, stopped_unknown = [], [], {}, False
    for spec in specs:
        sides = []
        for index, domain in enumerate(evidence["domains"]):
            ident = spec["simulation_a_object_id" if index == 0 else "simulation_b_object_id"]
            parameters = _child_parameters(workspace, request, spec, index, domain)
            result = None
            if domain["physical_ready"] and not stopped_unknown:
                reply = execute(parameters)
                original_path = workspace.root / "requests" / (parameters["request_id"] + ".json")
                journal_raw = read_bytes(original_path, 8 * 1024 * 1024) if original_path.is_file() else None
                receipt = {"request_id": parameters["request_id"], "candidate_label": spec["label"], "side": index,
                           "state": "completed" if reply.get("ok") else "failed" if reply.get("state") == "failed" else "unknown",
                           "original_parameters": parameters, "automatic_retry": False,
                           "journal_sha256": sha(journal_raw) if journal_raw is not None else None}
                try:
                    receipt["journal_state"] = strict_json(journal_raw.decode("utf-8")).get("state")
                except (AttributeError, UnicodeError, ValueError):
                    receipt["journal_state"] = "unreadable_or_absent"
                if reply.get("ok"):
                    result = reply["result"]
                    receipt.update(object_id=result["object_id"], object_manifest_sha256=sha(read_bytes(result["manifest_path"])))
                    full[spec["label"] + ":" + str(index)] = {key: value for key, value in result.items() if key in compare(
                        domain["measurements"], simulations[ident], transform, tolerance, request["experimental_kind"])}
                else:
                    receipt["error"] = reply.get("error")
                    stopped_unknown = receipt["state"] != "failed"
                    if stopped_unknown:
                        receipt["unknown_journal_snapshot_file"] = None
                        if journal_raw is not None:
                            name = "unknown-child-{:02d}.json".format(len(receipts))
                            write_new(directory / name, journal_raw)
                            receipt["unknown_journal_snapshot_file"] = name
                receipts.append(receipt)
            assessment = assess_side(result, domain["measurements"], tolerance,
                                     domain["evidence_quality_ready"], domain["physical_ready"])
            sides.append({**assessment, "side": index, "rect_xyxy": domain["rect_xyxy"],
                          "simulation_object_id": ident, "structure_object_id": qualification[ident]["structure_object_id"],
                          "orientation_object_id": qualification[ident]["orientation_object_id"],
                          "comparison_object_id": result["object_id"] if result else None,
                          "comparison_request_id": parameters["request_id"] if result else None,
                          "matched": result["matched"] if result else [],
                          "unmatched_experimental": result["unmatched_experimental"] if result else [],
                          "unmatched_simulated_count": len(result["unmatched_simulated"]) if result else None,
                          "full_unmatched_reference": {"tool": "structure_info", "object_id": result["object_id"], "field": "unmatched_simulated"} if result else None})
        rows.append({"label": spec["label"], "basis": spec["basis"], "status": _pair_status(sides), "sides": sides,
                     "interpretation_status": "hypothesized", "independent_validation": "NOT_VALIDATED"})
    summary = _overall(rows)
    write_new(directory / "comparisons.json", canonical(full) + b"\n")
    write_new(directory / "observation-bindings.json", canonical(evidence) + b"\n")
    write_new(directory / "qualification.json", canonical(qualification) + b"\n")
    _write_csv(directory / "reflections.csv", full)
    _render(directory, rows, full, simulations, transform)
    return {**summary, "kind": "crystal_evidence", "policy_version": VERSION,
            "source_binding": evidence["source_binding"], "domains": [_compact_domain(row) for row in evidence["domains"]],
            "adjacency": evidence["adjacency"], "candidate_pairs": rows, "candidate_qualification": qualification,
            "registration": transform, "experimental_kind": request["experimental_kind"], "max_residual_inv_angstrom": tolerance,
            "shared_simulation_conditions": conditions,
            "child_receipts": receipts, "stopped_on_unknown_child": stopped_unknown,
            "revision_history": revision, "fixed_input_receipts": fixed,
            "full_numerical_evidence": {"comparisons": str(directory / "comparisons.json"),
                                        "observations": str(directory / "observation-bindings.json"),
                                        "qualification": str(directory / "qualification.json"),
                                        "reflections_csv": str(directory / "reflections.csv")},
            "interpretation_status": "hypothesized", "phase_identified": False, "twin_law_tested": False,
            "intensity_comparison_performed": False, "source_arrays_modified": False,
            "fft_recomputed": False, "simulation_recomputed": False, "scientific_limits": LIMITS}


def validate_references(workspace, metadata):
    """Admit saved evidence without dispatching child work or reopening images."""
    from crystallography.structure_tools import canonical, json_file, need, read_bytes, sha
    directory = workspace.root / "objects" / metadata["object_id"]
    original = json_file(workspace.root / "requests" / (metadata["request_id"] + ".json"))["parameters"]
    need(original.get("action") == "general_compare" and metadata.get("policy_version") == VERSION and
         metadata["parameters"] == {key: value for key, value in original.items() if key not in ("workspace", "action", "request_id")},
         "General evidence differs from its original request", "CORRUPT_OBJECT")
    specs = _candidate_specs(original)
    evidence = json_file(directory / "observation-bindings.json")
    qualification = json_file(directory / "qualification.json")
    full = json_file(directory / "comparisons.json")
    need(metadata["source_binding"] == evidence["source_binding"] and metadata["domains"] == [_compact_domain(row) for row in evidence["domains"]]
         and metadata["adjacency"] == evidence["adjacency"] and metadata["candidate_qualification"] == qualification,
         "General evidence has different saved source/observation bindings", "CORRUPT_OBJECT")
    need(len(evidence["domains"]) == 2 and metadata["registration"] == original["registration"] and
         metadata["experimental_kind"] == original["experimental_kind"] and metadata["max_residual_inv_angstrom"] == original["max_residual_inv_angstrom"],
         "General evidence changed experiment coordinates or comparison policy", "CORRUPT_OBJECT")
    for requested, domain in zip(original["domains"], evidence["domains"]):
        need(all(requested[key] == domain[key] for key in ("field_object_id", "rect_xyxy", "current_image_object_id")) and
             ("measurement_object_ids" not in requested or requested["measurement_object_ids"] == domain["measurement_object_ids"]),
             "General evidence redirected a saved scientific ROI", "CORRUPT_OBJECT")
    need(evidence["source_binding"]["current_spatial_image_object_id"] == original["current_spatial_image_object_id"],
         "General evidence changed its original spatial frame", "CORRUPT_OBJECT")
    frozen, raw_copies = {}, {}
    for receipt in metadata["fixed_input_receipts"]:
        need(Path(receipt["file"]).name == receipt["file"] and receipt["file"].startswith("input-") and
             sha(read_bytes(directory / receipt["file"])) == receipt["sha256"], "Frozen evidence copy changed", "CORRUPT_OBJECT")
        frozen[receipt["original_path"]] = json_file(directory / receipt["file"])
        raw_copies[receipt["original_path"]] = read_bytes(directory / receipt["file"])
    frame_path = str(Path(original["image_workspace"]).resolve() / "objects" / evidence["source_binding"]["frame_object_id"] / "object.json")
    frame = frozen.get(frame_path)
    need(type(frame) is dict and frame["files_sha256"]["data.npy"] == evidence["source_binding"]["source_array_sha256"] and
         frame["shape_yx"] == evidence["source_binding"]["shape_yx"] and frame["dtype"] == evidence["source_binding"]["dtype"],
         "Frozen source array identity differs from the saved evidence", "CORRUPT_OBJECT")
    _validate_frozen_observations(original, evidence, frozen, raw_copies)
    receipts = {(row["candidate_label"], row["side"]): row for row in metadata["child_receipts"]}
    need(len(receipts) == len(metadata["child_receipts"]) <= 6, "Duplicate or unbounded comparison receipts", "CORRUPT_OBJECT")
    rebuilt, simulations, observed_unknown = [], {}, False
    for spec in specs:
        sides = []
        for index, domain in enumerate(evidence["domains"]):
            ident = spec["simulation_a_object_id" if index == 0 else "simulation_b_object_id"]
            saved, ref = _simulation(workspace, ident)
            simulations[ident] = saved
            need(ref == qualification.get(ident), "Candidate source, orientation or qualification changed", "CORRUPT_OBJECT")
            receipt = receipts.get((spec["label"], index))
            need((receipt is not None) == (domain["physical_ready"] and not observed_unknown),
                 "Comparison attempts were removed, added or continued after unknown work", "CORRUPT_OBJECT")
            child = None
            parameters = _child_parameters(workspace, original, spec, index, domain)
            if receipt is not None:
                need(receipt["original_parameters"] == parameters and receipt["request_id"] == parameters["request_id"] and receipt["automatic_retry"] is False,
                     "Comparison receipt differs from the original candidate/ROI request", "CORRUPT_OBJECT")
                journal = _receipt_journal(workspace, directory, receipt)
                if journal is not None:
                    need(journal["parameters"] == parameters and journal.get("state") == receipt["journal_state"],
                         "Original child parameters/state changed", "CORRUPT_OBJECT")
                if receipt["state"] == "completed":
                    need(json_file(workspace.root / "objects" / receipt["object_id"] / "object.json").get("kind") == "compare",
                         "General evidence child is not a saved comparison", "CORRUPT_OBJECT")
                    child, child_dir = workspace.object(receipt["object_id"])
                    need(child["kind"] == "compare" and child["request_id"] == parameters["request_id"] and
                         sha(read_bytes(child_dir / "object.json")) == receipt["object_manifest_sha256"],
                         "Saved child comparison identity changed", "CORRUPT_OBJECT")
                    expected = compare(domain["measurements"], saved, original["registration"], original["max_residual_inv_angstrom"], original["experimental_kind"])
                    child_sources = child.get("experimental_sources", [])
                    need(len(child_sources) == len(domain["sources"]), "Child comparison changed source count", "CORRUPT_OBJECT")
                    for child_source, frozen_source, measured in zip(child_sources, domain["sources"], domain["measurements"]):
                        need(all(child_source.get(key) == value for key, value in frozen_source.items()) and
                             child_source.get("measurement_object_id") == measured["object_id"] and
                             child_source.get("measurement_request_id") == measured["request_id"],
                             "Child comparison uses different original measurement bytes", "CORRUPT_OBJECT")
                        for field, original_path in (("fixed_manifest_file", frozen_source["path"]),
                                                     ("fixed_journal_file", frozen_source["journal_path"])):
                            name = child_source.get(field)
                            need(type(name) is str and Path(name).name == name and
                                 read_bytes(child_dir / name) == raw_copies[original_path],
                                 "Child comparison fixed measurement copy changed", "CORRUPT_OBJECT")
                    need(all(child.get(key) == value for key, value in expected.items()) and full.get(spec["label"] + ":" + str(index)) == expected and
                         child.get("analysis_binding") == domain["analysis_binding"],
                         "Saved geometric comparison differs from its exact frozen observations", "CORRUPT_OBJECT")
                elif receipt["state"] == "failed":
                    need(journal is not None and journal.get("state") == "failed" and journal.get("response", {}).get("error") == receipt.get("error"),
                         "Failed/unknown child receipt changed", "CORRUPT_OBJECT")
                else:
                    need(receipt["state"] == "unknown" and (journal is None or journal.get("state") not in ("completed", "failed")),
                         "Unknown receipt cannot conceal a final child result", "CORRUPT_OBJECT")
                    observed_unknown = True
            assessment = assess_side(child, domain["measurements"], original["max_residual_inv_angstrom"], domain["evidence_quality_ready"], domain["physical_ready"])
            sides.append({**assessment, "side": index, "rect_xyxy": domain["rect_xyxy"],
                          "simulation_object_id": ident, "structure_object_id": ref["structure_object_id"],
                          "orientation_object_id": ref["orientation_object_id"], "comparison_object_id": child["object_id"] if child else None,
                          "comparison_request_id": parameters["request_id"] if child else None,
                          "matched": child["matched"] if child else [], "unmatched_experimental": child["unmatched_experimental"] if child else [],
                          "unmatched_simulated_count": len(child["unmatched_simulated"]) if child else None,
                          "full_unmatched_reference": {"tool": "structure_info", "object_id": child["object_id"], "field": "unmatched_simulated"} if child else None})
        rebuilt.append({"label": spec["label"], "basis": spec["basis"], "status": _pair_status(sides), "sides": sides,
                        "interpretation_status": "hypothesized", "independent_validation": "NOT_VALIDATED"})
    need(metadata["shared_simulation_conditions"] == simulation_conditions(simulations),
         "Shared scientific simulation conditions changed", "CORRUPT_OBJECT")
    need(metadata["stopped_on_unknown_child"] == observed_unknown and
         set(full) == {row["candidate_label"] + ":" + str(row["side"]) for row in metadata["child_receipts"] if row["state"] == "completed"},
         "Unknown-stop status or complete numerical evidence changed", "CORRUPT_OBJECT")
    need(metadata["candidate_pairs"] == rebuilt and all(metadata.get(key) == value for key, value in _overall(rebuilt).items()),
         "General candidate assessment differs from its immutable numerical evidence", "CORRUPT_OBJECT")
    history = metadata["revision_history"]
    previous = original.get("previous_evidence_id")
    if previous is None:
        need(history == {"revision": 1, "previous_evidence_id": None, "historical_parent_reinterpreted": False},
             "Unexpected general evidence history", "CORRUPT_OBJECT")
    else:
        need(previous != metadata["object_id"], "Cyclic general evidence history", "CORRUPT_OBJECT")
        previous_path = workspace.root / "objects" / previous / "object.json"
        previous_raw = json_file(previous_path)
        need(previous_raw.get("kind") == "crystal_evidence" and 1 <= history.get("revision", 0) <= 16 and
             previous_raw.get("revision_history", {}).get("revision") == history["revision"] - 1,
             "Invalid general evidence history kind/depth", "CORRUPT_OBJECT")
        old, _ = workspace.object(previous)
        need(history == {"revision": old["revision_history"]["revision"] + 1, "previous_evidence_id": previous,
                         "historical_parent_reinterpreted": False, "revision_note": original["revision_note"],
                         "previous_manifest_sha256": sha(read_bytes(previous_path))} and
             all(old["source_binding"].get(key) == metadata["source_binding"].get(key) for key in
                 ("frame_object_id", "source_object_id", "source_array_sha256")) and
             [row["rect_xyxy"] for row in old["domains"]] == [row["rect_xyxy"] for row in metadata["domains"]],
             "Historical general evidence changed source or exact ROI", "CORRUPT_OBJECT")
    need(metadata["interpretation_status"] == "hypothesized" and metadata["phase_identified"] is False and
         metadata["twin_law_tested"] is False and metadata["source_arrays_modified"] is False and
         metadata["fft_recomputed"] is False and metadata["simulation_recomputed"] is False and
         metadata["intensity_comparison_performed"] is False and metadata["scientific_limits"] == LIMITS,
         "General evidence acquired unsupported physical claims", "CORRUPT_OBJECT")


def _write_csv(file, comparisons):
    from crystallography.structure_tools import write_new
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["candidate_side", "measurement_object_id", "h", "k", "l", "residual_inv_angstrom", "state"])
    for name, result in comparisons.items():
        # A caller-supplied label is text, not a spreadsheet formula.
        safe_name = "'" + name if name.lstrip()[:1] in ("=", "+", "-", "@") or name[:1] in ("\t", "\r") else name
        for row in result.get("matched", []):
            writer.writerow([safe_name, row["measurement_object_id"], *row["hkl"], row["position_residual_inv_angstrom"], "matched_hypothesis"])
        for row in result.get("unmatched_experimental", []):
            writer.writerow([safe_name, row["measurement_object_id"], "", "", "", "", "unmatched"])
    write_new(file, stream.getvalue().encode("utf-8"))


def _render(directory, candidates, comparisons, simulations, transform):
    import textwrap
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    fig, axes = plt.subplots(len(candidates), 2, figsize=(8, 3.2 * len(candidates)), squeeze=False, layout="constrained")
    matrix = np.asarray(registration(transform)["matrix_xy"])
    for row_index, candidate in enumerate(candidates):
        for side in candidate["sides"]:
            ax = axes[row_index, side["side"]]
            prediction = simulations[side["simulation_object_id"]]
            xy = np.asarray(prediction["reflections"]["coordinates_inv_angstrom"])
            ax.scatter(xy[:, 0], xy[:, 1], s=18, facecolors="none", edgecolors="#ed8b33", label="candidate geometry")
            measured = comparisons.get(candidate["label"] + ":" + str(side["side"]), {}).get("observations", [])
            if measured:
                q = np.asarray([record["q_xy_inv_angstrom"] for record in measured]) @ matrix.T
                ax.scatter(q[:, 0], q[:, 1], s=12, c="#00adbf", label="saved FFT evidence")
            ax.axhline(0, c=".8", lw=.5); ax.axvline(0, c=".8", lw=.5)
            ax.set(xlabel="qx (cycles / angstrom)", ylabel="qy (cycles / angstrom)", aspect="equal")
            label = textwrap.fill(candidate["label"], width=31, max_lines=2, placeholder="...")
            ax.set_title(label + "\nROI " + ("A" if side["side"] == 0 else "B") + " | " + side["status"],
                         fontsize=9, parse_math=False)
            ax.legend(fontsize=7, loc="upper right")
    fig.suptitle("Conditional projected evidence | no phase or twin confirmation", fontsize=10)
    fig.savefig(directory / "preview.png", dpi=110)
    plt.close(fig)
