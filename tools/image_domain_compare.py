"""Finite, descriptive SO(2) relations between saved local reciprocal signatures.

No detector, FFT, optimizer, fitted scale, reflection or phase identification.
All observations remain ordinary committed image measurements.  Antipodal
families remove duplicate real-image evidence without averaging coordinates.
"""
import csv
import io
import math
from pathlib import Path
import sys

import numpy as np

try:
    from . import image_automation as automation
    from . import image_joint as joint
    from . import image_calibration as calibration
except ImportError:
    import image_automation as automation
    import image_joint as joint
    import image_calibration as calibration

# The numerical matcher is imported only when a comparison is evaluated; it
# requires NumPy/SciPy and calibration, not ASE/diffsims or structure tools.
ROOT = str(Path(__file__).resolve().parents[1])
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


FIELDS = {"local_signature_compare": {
    "object_id", "reference_index", "target_indices", "angles_degrees",
    "coordinate_domain", "tolerance",
}}
ROUND_OFF = 64 * np.finfo(float).eps
LIMITATIONS = [
    "Finite caller-supplied angles only; absence of a match is not exhaustive orientation exclusion",
    "Descriptive selected-peak geometry only; no independent held-out validation or statistical confidence",
    "Antipodal/conjugate observations are one family; real-image signatures retain a 180 degree equivalence",
    "Extra peaks, non-detection and mixed-window signatures do not identify phases, twins, defects or boundaries",
    "Peak amplitude thresholds are not signal-to-noise or detection confidence; localization uncertainty is unknown",
    "FFT sampling interval and window width are not localization error or a physical domain boundary resolution",
    "No fitted scale, mirror, translation, strain, intensity model or three-dimensional crystal orientation",
]


def settings(request, api):
    reference = request.get("reference_index")
    api.need(api.integer(reference, 0, 7), "reference_index requires an explicit source-row index in0..7")
    targets = request.get("target_indices")
    if targets is not None:
        api.need(type(targets) is list and 1 <= len(targets) <= 7 and
                 all(api.integer(v, 0, 7) for v in targets) and len(set(targets)) == len(targets) and reference not in targets,
                 "target_indices requires1..7 distinct source-row indices excluding the reference")
    angles = request.get("angles_degrees")
    api.need(type(angles) is list and 1 <= len(angles) <= 64 and
             all(api.number(v) and -180 <= v <= 180 for v in angles) and len(set(angles)) == len(angles),
             "angles_degrees requires1..64 distinct finite explicit angles in[-180,180]")
    domain, tolerance = request.get("coordinate_domain"), request.get("tolerance")
    api.need(domain in ("pixel", "physical"), "coordinate_domain requires explicit pixel or physical")
    api.need(api.number(tolerance) and tolerance > 0, "tolerance requires a finite positive value in the selected reciprocal unit")
    return reference, targets, [float(v) for v in angles], domain, float(tolerance)


def vectors_in_domain(measurements, record, domain, api):
    """Convert signed physical XY axes before rotating, never after rotation."""
    scale = calibration.active_scale(record)
    if domain == "physical" and not scale:
        return None, "Active sourced real-space XY calibration is required for physical comparison"
    conversion = None
    if domain == "physical":
        unit = calibration.unit_kind(scale.get("unit"))
        if unit is None or unit[0] != "real_space":
            return None, "Physical source calibration has no supported real-space length unit"
        conversion = calibration.UNITS[unit[1]] / calibration.UNITS["nm"]
    result = []
    for measured in measurements:
        raw = measured.get("frequency_cycles_per_pixel")
        api.need(type(raw) is list and len(raw) == 2 and all(api.number(v) for v in raw) and any(v != 0 for v in raw),
                 "Saved signature requires finite nonzero DC-to-peak vectors", "CORRUPT_OBJECT")
        vector = [float(v) for v in raw]
        if domain == "physical":
            vector = [(v / scale[axis]) / conversion for v, axis in zip(raw, ("x", "y"))]
            api.need(all(math.isfinite(v) for v in vector) and all(a == 0 or b != 0 for a, b in zip(raw, vector)),
                     "Physical reciprocal conversion overflows or underflows a nonzero component", "UNRESOLVED_GEOMETRY")
        result.append({"measurement_object_id": measured["measurement_object_id"],
                       "frequency_cycles_per_pixel": list(raw), "vector_xy": vector})
    return result, None


def _canonical(vector):
    sign = -1 if vector[0] < 0 or vector[0] == 0 and vector[1] < 0 else 1
    return [0. if v == 0 else sign*v for v in vector], sign


def fold_families(observations):
    """Only numerical equality of signed/antipodal vectors is collapsed.

    The comparison tolerance never merges separate peaks. The representative
    is an actual observation; all original coordinates and identities survive.
    """
    ordered = []
    for row in observations:
        vector, sign = _canonical(row["vector_xy"])
        ordered.append((vector, row["measurement_object_id"], sign, row))
    ordered.sort(key=lambda item: (item[0], item[1]))
    families = []
    for vector, ident, sign, row in ordered:
        selected = None
        for family in families:
            largest = max(abs(v) for v in vector+family["vector_xy"])
            if all(abs(a/largest-b/largest) <= ROUND_OFF for a, b in zip(vector, family["vector_xy"])):
                selected = family
                break
        if selected is None:
            selected = {"family_id": "family-%d" % (len(families)+1), "vector_xy": vector,
                        "measurement_object_ids": [], "members": []}
            families.append(selected)
        selected["measurement_object_ids"].append(ident)
        selected["members"].append({**row, "sign_to_family_representative": sign})
    return families


def noncollinear(families):
    if len(families) < 2:
        return False
    vectors = np.asarray([row["vector_xy"] for row in families], dtype=float)
    maximum = float(np.max(np.abs(vectors)))
    normalized = vectors / maximum
    singular = np.linalg.svd(normalized, compute_uv=False)
    return bool(singular[1] > ROUND_OFF * max(normalized.shape) * singular[0])


def _angle_class(angle):
    value = angle % 180.
    return 0. if value == 180. or value == 0. else value


def compare_families(reference, target, angles, tolerance):
    """Exhaustive declared angles, bounded assignment and no selected winner."""
    from crystallography.reflection_compare import assign_within_tolerance
    refs, targets = reference["families"], target["families"]
    adequate = noncollinear(refs) and noncollinear(targets)
    truncated = reference["quality"]["detection_truncated"] or target["quality"]["detection_truncated"]
    candidates = []
    for angle in angles:
        radians = math.radians(angle)
        cosine, sine = math.cos(radians), math.sin(radians)
        matrix = [[cosine, -sine], [sine, cosine]]
        transformed = [[cosine*r["vector_xy"][0]-sine*r["vector_xy"][1],
                        sine*r["vector_xy"][0]+cosine*r["vector_xy"][1]] for r in refs]
        distance = np.zeros((len(refs), len(targets)))
        signs = {}
        for i, vector in enumerate(transformed):
            for j, row in enumerate(targets):
                other = row["vector_xy"]
                direct = math.hypot(vector[0]-other[0], vector[1]-other[1])
                opposite = math.hypot(vector[0]+other[0], vector[1]+other[1])
                distance[i, j] = min(direct, opposite)
                signs[i, j] = 1 if direct <= opposite else -1
        if not np.isfinite(distance).all():
            raise ValueError("Rotated reciprocal residual exceeds finite binary64")
        allowed = distance <= tolerance
        # Reuse the existing cardinality/dummy engine at unit tolerance. Only
        # in-tolerance distances are divided, preventing overflow for tiny
        # caller tolerances while preserving the original residual ordering.
        normalized = np.full(distance.shape, 2.)
        normalized[allowed] = distance[allowed] / tolerance
        assignments = assign_within_tolerance(normalized, 1.) if refs and targets else []
        matched = []
        for i, j in assignments:
            matched.append({"reference_family_id": refs[i]["family_id"], "target_family_id": targets[j]["family_id"],
                            "reference_measurement_object_ids": refs[i]["measurement_object_ids"],
                            "target_measurement_object_ids": targets[j]["measurement_object_ids"],
                            "residual": float(distance[i, j]), "target_antipodal_sign": signs[i, j],
                            "rotated_reference_vector_xy": transformed[i], "target_vector_xy": targets[j]["vector_xy"]})
        all_edges = [{"reference_family_id": refs[i]["family_id"], "target_family_id": targets[j]["family_id"],
                      "residual": float(distance[i, j]), "target_antipodal_sign": signs[i, j]}
                     for i in range(len(refs)) for j in range(len(targets)) if allowed[i, j]]
        ambiguous = bool(np.any(allowed.sum(axis=0) > 1) or np.any(allowed.sum(axis=1) > 1))
        used_reference, used_target = {i for i, _ in assignments}, {j for _, j in assignments}
        full = bool(refs and len(assignments) == len(refs) == len(targets))
        candidates.append({"angle_degrees": angle, "antipodal_angle_class_degrees": _angle_class(angle),
                           "rotation_matrix_xy": matrix, "proper_rotation_determinant": 1.,
                           "matched_pairs": matched, "admissible_pairs": all_edges,
                           "unmatched_reference_family_ids": [r["family_id"] for i, r in enumerate(refs) if i not in used_reference],
                           "unmatched_target_family_ids": [r["family_id"] for j, r in enumerate(targets) if j not in used_target],
                           "all_selected_families_matched": full, "assignment_ambiguous": ambiguous,
                           "accepted_descriptive_match": full and adequate and not truncated,
                           "max_residual": max((p["residual"] for p in matched), default=None),
                           "independent_validation": "not_tested_no_held_out_observations"})
    accepted = [candidate for candidate in candidates if candidate["accepted_descriptive_match"]]
    classes = []
    for candidate in accepted:
        angle = candidate["antipodal_angle_class_degrees"]
        # Only the represented 180-degree equivalence is collapsed. An
        # arbitrary angular tolerance would hide two distinct supplied trials.
        match = next((row for row in classes if
                      (candidate["angle_degrees"]-row["submitted_angles_degrees"][0]) % 180. == 0.), None)
        if match is None:
            match = {"representative": angle, "submitted_angles_degrees": []}
            classes.append(match)
        match["submitted_angles_degrees"].append(candidate["angle_degrees"])
    if not adequate:
        status = "insufficient_geometry"
    elif truncated:
        status = "incomplete_detection"
    elif accepted:
        status = "ambiguous" if len(classes) > 1 or any(c["assignment_ambiguous"] for c in accepted) else "compatible_signature"
    elif any(c["matched_pairs"] for c in candidates):
        status = "partial_match"
    else:
        status = "incompatible"
    return {"status": status, "candidates": candidates, "accepted_angles_degrees": [c["angle_degrees"] for c in accepted],
            "accepted_antipodal_angle_classes": classes, "antipodal_equivalence_degrees": 180,
            "angle_equivalence_policy": "Submitted angle differences exactly equal represented multiples of180 degrees; no fitted angular tolerance",
            "has_two_noncollinear_families": adequate, "detection_truncated": truncated,
            "interpretation_status": "hypothesized", "uncertainty": None,
            "independent_validation": "not_tested_no_held_out_observations"}


def _entries(workspace, parent, domain, api):
    is_joint = parent["kind"] == "joint_observations"
    rows = parent.get("frame_observations" if is_joint else "regions")
    index_key = "frame_index" if is_joint else "region_index"
    api.need(type(rows) is list and 1 <= len(rows) <= 8 and
             all(api.integer(row.get(index_key), 0, 7) for row in rows) and
             len({row[index_key] for row in rows}) == len(rows), "Invalid source signature row table", "CORRUPT_OBJECT")
    mappings = {}
    if is_joint:
        corr, _ = workspace.object(parent["correspondence_object_id"])
        mappings = {row["frame_index"]: row for row in corr["rows"]}
    entries = []
    for row in rows:
        index = row[index_key]
        entry = {"index": index, "index_kind": index_key, "source_status": row.get("status"),
                 "source_context": row.get("source_context", parent.get("source_context")),
                 "mapping_evidence": mappings.get(index),
                 "rect": row.get("target_rect", row.get("rect")),
                 "overview_object_id": row.get("overview_object_id", parent.get("overview_object_id")),
                 "roi_object_id": row.get("roi_object_id"), "view_object_id": row.get("view_object_id"),
                 "fft_object_id": row.get("fft_object_id"), "peaks_object_id": row.get("peaks_object_id"),
                 "measurements": [], "families": [], "geometry_status": "admitted",
                 "quality": {"detection_truncated": False, "has_two_noncollinear_families": False,
                             "localization_uncertainty": None, "statistical_confidence": None}}
        if is_joint and row.get("status") != "VERIFIED":
            entry.update(geometry_status="not_comparable", reason="R2 coordinate mapping is not VERIFIED; no automatic science on this row")
            entries.append(entry)
            continue
        fft, _ = workspace.object(row["fft_object_id"])
        peaks, _ = workspace.object(row["peaks_object_id"])
        parameters = automation._saved_parameters(workspace, peaks, api)
        api.need(parameters.get("action") == "peaks" and parameters.get("object_id") == fft["object_id"],
                 "Signature peak table belongs to another FFT", "CORRUPT_OBJECT")
        selected = row.get("measurements")
        api.need(type(selected) is list and len(selected) <= 16 and len({m["measurement_object_id"] for m in selected}) == len(selected),
                 "Signature requires at most16 distinct saved measurements", "CORRUPT_OBJECT")
        measured = [joint.measurement_row(workspace, item["measurement_object_id"], fft, api) for item in selected]
        api.need(measured == selected and row.get("xy_calibration", parent.get("xy_calibration")) == fft.get("xy_calibration"),
                 "Signature source differs from committed measurements/calibration", "CORRUPT_OBJECT")
        quality = peaks.get("peak_quality")
        api.need(type(quality) is dict and type(quality.get("selection_limit_reached")) is bool,
                 "Signature detector quality is missing", "CORRUPT_OBJECT")
        observations, reason = vectors_in_domain(measured, fft.get("xy_calibration"), domain, api)
        entry.update(measurements=measured, xy_calibration=fft.get("xy_calibration"), shape_yx=fft["shape_yx"],
                     fft_array_sha256=fft["files_sha256"]["data.npy"], scientific_grid_identity=workspace.measurement_grid(fft["object_id"]),
                     detection_quality=quality, override_measurement_object_ids=row.get("override_measurement_object_ids"),
                     override_source=row.get("override_source"), frequency_sampling_step_cycles_per_pixel=[1/fft["shape_yx"][1], 1/fft["shape_yx"][0]])
        entry["quality"]["detection_truncated"] = quality["selection_limit_reached"]
        if reason:
            entry.update(geometry_status="incompatible", reason=reason)
        else:
            entry["families"] = fold_families(observations)
            entry["quality"]["has_two_noncollinear_families"] = noncollinear(entry["families"])
        entries.append(entry)
    return entries


def check_report_budget(result, api):
    # Workspace read_json admits <=2 MiB per saved JSON. Reserve room for the
    # ordinary provider envelope, paths, file hashes and runtime provenance.
    # Never publish a result that cannot subsequently be reopened, or truncate
    # candidate edges to force a scientifically misleading partial success.
    api.need(len(api.canonical(result)) <= api.MAX_JSON_BYTES-65536,
             "Signature report exceeds bounded JSON budget; reduce target/angle/peak selections or tolerance; no candidates were truncated",
             "BUDGET_EXCEEDED")


def derive(workspace, request, api):
    reference, targets, angles, domain, tolerance = settings(request, api)
    parent, parent_directory = workspace.object(request["object_id"])
    api.need(parent.get("kind") in ("spatial_atlas", "joint_observations"),
             "Select a saved spatial_atlas or R2 joint_observations object")
    entries = _entries(workspace, parent, domain, api)
    lookup = {entry["index"]: entry for entry in entries}
    api.need(reference in lookup, "reference_index is absent from the selected source")
    targets = targets if targets is not None else [entry["index"] for entry in entries if entry["index"] != reference]
    api.need(targets and all(index in lookup for index in targets), "Select at least one existing target row distinct from the reference")
    relations = []
    for target in targets:
        first, second = lookup[reference], lookup[target]
        if first["geometry_status"] != "admitted" or second["geometry_status"] != "admitted":
            status = "not_comparable" if any(row["geometry_status"] == "not_comparable" for row in (first, second)) else "incompatible"
            result = {"status": status, "candidates": [], "accepted_angles_degrees": [],
                      "reason": "; ".join(row["reason"] for row in (first, second) if row.get("reason")),
                      "interpretation_status": "hypothesized", "uncertainty": None,
                      "independent_validation": "not_tested_no_held_out_observations"}
        else:
            result = compare_families(first, second, angles, tolerance)
        relations.append({"target_index": target, **result})
    result = {"kind": "local_signature_compare", "parent_object_id": parent["object_id"], "source_kind": parent["kind"],
            "input_manifest_sha256": api.sha_file(parent_directory / "object.json"),
            "reference_index": reference, "target_indices": targets, "angles_degrees": angles,
            "coordinate_domain": domain, "coordinate_unit": "cycles/nm" if domain == "physical" else "cycles/pixel",
            "tolerance": tolerance, "source_entries": entries, "relations": relations,
            "overview_object_id": lookup[reference].get("overview_object_id"),
            "sequence_object_id": parent.get("sequence_object_id"), "correspondence_object_id": parent.get("correspondence_object_id"),
            "sequence_axis": parent.get("sequence_axis"),
            "rotation_convention": "q_target = Rccw(angle) @ q_reference, with antipodal equivalence; fixed scale1, translation0, no reflection",
            "angle_scope": "projected physical reciprocal-coordinate relation, not 3D crystal misorientation" if domain == "physical" else
                           "image-coordinate angle only; pixel aspect and physical misorientation are not inferred",
            "family_policy": "Actual representative, no averaging; signed/antipodal equality within64 binary64 eps of component scale only; never the matching tolerance",
            "matching": "Existing SciPy maximum in-tolerance cardinality then minimum reciprocal residual, bounded dummy assignments; all admissible edges retained",
            "interpretation_status": "hypothesized", "uncertainty": None,
            "independent_validation": "not_tested_no_held_out_observations", "limitations": LIMITATIONS,
            "fft_recomputed": False, "scientific_data_changed": False, "contact_sheet_is_display_only": True}
    check_report_budget(result, api)
    return result


def report_csv(result):
    stream = io.StringIO(newline="")
    columns = ["source_kind", "reference_index", "target_index", "status", "angle_degrees", "coordinate_unit", "tolerance",
               "accepted_descriptive_match", "reference_family_id", "target_family_id", "reference_measurement_object_ids",
               "target_measurement_object_ids", "residual", "target_antipodal_sign", "unmatched_reference_family_ids",
               "unmatched_target_family_ids", "independent_validation"]
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for relation in result["relations"]:
        for candidate in relation["candidates"] or [{}]:
            for pair in candidate.get("matched_pairs") or [{}]:
                row = {key: result[key] for key in ("source_kind", "reference_index", "coordinate_unit", "tolerance")}
                row.update(target_index=relation["target_index"], status=relation["status"],
                           angle_degrees=candidate.get("angle_degrees"), accepted_descriptive_match=candidate.get("accepted_descriptive_match"),
                           independent_validation=relation["independent_validation"])
                row.update({key: pair.get(key) for key in ("reference_family_id", "target_family_id", "residual", "target_antipodal_sign")})
                for key in ("reference_measurement_object_ids", "target_measurement_object_ids"):
                    row[key] = "|".join(pair.get(key, []))
                for key in ("unmatched_reference_family_ids", "unmatched_target_family_ids"):
                    row[key] = "|".join(candidate.get(key, []))
                writer.writerow(row)
    return stream.getvalue().encode("utf-8")


def action(workspace, name, request, metadata, directory, api):
    import scipy
    api.need(name == "local_signature_compare", "Unknown local signature operation")
    result = derive(workspace, request, api)
    pictures = []
    if result["overview_object_id"]:
        overview, _ = workspace.object(result["overview_object_id"])
        pictures.append(("Reference original / ROI", overview))
    for entry in result["source_entries"]:
        if entry["index"] in [result["reference_index"], *result["target_indices"]] and entry.get("view_object_id"):
            view, _ = workspace.object(entry["view_object_id"])
            pictures.append(("%s %d saved FFT" % (entry["index_kind"], entry["index"]), view))
    api.need(pictures, "Source has no saved display for a comparison contact sheet", "CORRUPT_OBJECT")
    automation.contact_sheet(directory, pictures, api)
    api.write_new(directory / "relations.json", api.canonical(result)+b"\n")
    api.write_new(directory / "relations.csv", report_csv(result))
    metadata.update(result, table_path=str(directory / "relations.csv"), relations_path=str(directory / "relations.json"),
                    runtime_versions={"numpy": np.__version__, "scipy": scipy.__version__},
                    matching_engine_sha256=api.sha_file(Path(ROOT) / "crystallography" / "reflection_compare.py"))
    return metadata


def validate_references(workspace, metadata, api):
    active = getattr(workspace, "_domain_comparison_validation_active", set())
    api.need(metadata["object_id"] not in active and len(active) < 16,
             "Signature comparison dependency cycle/depth exceeded", "CORRUPT_OBJECT")
    workspace._domain_comparison_validation_active = active
    active.add(metadata["object_id"])
    try:
        params = automation._saved_parameters(workspace, metadata, api)
        api.need(params.get("action") == "local_signature_compare" and params.get("object_id") == metadata.get("parent_object_id"),
                 "Signature comparison differs from original request", "CORRUPT_OBJECT")
        expected = derive(workspace, params, api)
        api.need(all(metadata.get(key) == value for key, value in expected.items()),
                 "Signature comparison differs from committed measurements or declared comparison", "CORRUPT_OBJECT")
        directory = workspace.root / "objects" / metadata["object_id"]
        api.need(metadata.get("table_path") == str(directory / "relations.csv") and
                 metadata.get("relations_path") == str(directory / "relations.json") and
                 api.read_json(directory / "relations.json") == expected and
                 (directory / "relations.csv").read_bytes() == report_csv(expected),
                 "Signature comparison report differs from authoritative measurements", "CORRUPT_OBJECT")
    finally:
        active.remove(metadata["object_id"])
