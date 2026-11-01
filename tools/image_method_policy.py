"""Finite method proposals over saved GPA metadata; no scientific execution.

First scope starts from saved GPA, never creates a source FFT, and does not
infer a GPA-ready domain from a domain map. The provider validates all saved
objects and proposed parameters again before execution. This policy inspects
raw wrapped-phase residue diagnostics, never smooth strain magnitude.

``propose`` returns ``{"actions": [...], "decision": {...}}``. Remaining
budget keys are ``method_calls``, ``gpa_band_pixels`` and
``topology_path_samples``; all are explicit nonnegative integer allowances.
Attempts have ``kind``, ``parameters`` and ``state`` (or ``status``/``outcome``),
plus their original ``request_id`` when submitted. Every attempted parameter
set is excluded, irrespective of success. Unknown outcomes stop for recovery.
"""
import copy
import math

try:
    from . import image_gpa_core as gpa
    from . import image_topology_core as topology
except ImportError:
    import image_gpa_core as gpa
    import image_topology_core as topology


ALGORITHM = "saved-gpa-method-followup-v1"
MIN_PHASE_VALID_FRACTION = .10
MAX_RESIDUE_DENSITY = .01
MAX_LOW_AMPLITUDE_FRACTION = .01
WARNINGS = [
    "Heuristic method selection and numerical quality guards are not confidence or scientific uncertainty",
    "All material interpretations remain hypothesized; no material defect is confirmed",
    "Contrast-only vortices can reproduce the same image and phase winding with zero material displacement",
    "A clean finite ROI or zero net winding does not establish defect absence",
    "First scope starts from saved GPA; domain-to-GPA selection and new source FFTs are excluded",
]
_COMMON = ("fft", "fft_array_sha256", "shape_yx", "source", "source_array_sha256",
           "source_mapping", "xy_calibration", "calibration_dependency", "calibration_nm_xy")


def _finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _vectors(value):
    return (isinstance(value, list) and len(value) == 2 and
            all(isinstance(row, list) and len(row) == 2 and all(_finite(v) for v in row)
                and math.hypot(*row) > 0 for row in value))


def _directions(vectors, shape):
    """Conservative FFT-bin line support, following F3b finite admission.

    Like crystallography/twin_geometry._independence, ambiguity is transitive,
    Friedel/harmonic signs are ignored, and separation must exceed both angular
    radii and a one-degree floor. The half-diagonal FFT-bin radius is a fixed
    deterministic guard in cycles/pixel, NOT measured localization uncertainty.
    """
    h, w = shape
    radius = .5 * math.hypot(1 / w, 1 / h)
    lengths = [math.hypot(*v) for v in vectors]
    resolved = [i for i, length in enumerate(lengths) if length > radius]
    adjacent = {i: set() for i in resolved}
    for position, i in enumerate(resolved):
        a = [v / lengths[i] for v in vectors[i]]
        for j in resolved[position + 1:]:
            b = [v / lengths[j] for v in vectors[j]]
            angle = math.atan2(abs(a[0] * b[1] - a[1] * b[0]), abs(a[0] * b[0] + a[1] * b[1]))
            threshold = max(math.radians(1), math.asin(radius / lengths[i]) + math.asin(radius / lengths[j]))
            if angle <= min(math.pi / 2, threshold) + 1e-12:
                adjacent[i].add(j)
                adjacent[j].add(i)
    unseen, families = set(resolved), []
    while unseen:
        pending, members = [min(unseen)], set()
        while pending:
            i = pending.pop()
            if i not in members:
                members.add(i)
                pending.extend(adjacent[i] - members)
        unseen -= members
        families.append(sorted(members))
    return {"policy": "finite-fft-bin-line-support-v1", "family_count": len(families),
            "families_vector_indices": families, "unresolved_vector_indices": sorted(set(range(len(vectors))) - set(resolved)),
            "reciprocal_radius_cycles_per_pixel": radius, "minimum_line_separation_degrees": 1.,
            "semantics": "Conservative policy admission, not uncertainty; floating-point rank is insufficient"}


def _cost(kind, shape=None, loops=None):
    value = {"method_calls": int(kind in ("gpa", "topology")), "gpa_band_pixels": 0,
             "topology_path_samples": 0, "fft_pixels": 0}
    if kind == "gpa":
        value["gpa_band_pixels"] = 2 * shape[0] * shape[1]
    if kind == "topology":
        # Charge all six possible retained bands, including every circuit.
        value["topology_path_samples"] = 6 * sum(2 * ((r["rect"][2] - r["rect"][0]) +
                                                       (r["rect"][3] - r["rect"][1])) - 4 for r in loops)
    return value


def propose(seed_gpas, topology_result, information, budget_remaining, attempted_actions):
    """Propose at most one finite next action; inputs are never mutated."""
    info = information if isinstance(information, dict) else {}
    attempts = attempted_actions if isinstance(attempted_actions, list) else []
    decision = {"algorithm": ALGORITHM, "status": None, "reason": None,
                "interpretation_status": "hypothesized", "material_defect_confirmed": False,
                "heuristic": True, "diagnostics": {}, "limitations": list(WARNINGS)}

    def finish(kind, reason, parameters=None, preconditions=None, cost=None):
        action = {"kind": kind, "reason": reason, "preconditions": preconditions or [],
                  "parameters": parameters or {}, "cost": cost or _cost(kind)}
        if kind in ("gpa", "topology"):
            if any(row.get("kind") == kind and row.get("parameters") == action["parameters"] for row in attempts):
                return finish("stop", "identical_parameters_already_attempted", preconditions=["Query the original request; no automatic replay"])
            missing = [key for key in ("method_calls", "gpa_band_pixels", "topology_path_samples")
                       if type(budget_remaining.get(key)) is not int or budget_remaining[key] < 0]
            if missing:
                return finish("request_information", "explicit_remaining_budget_required", {"required_fields": missing})
            exceeded = [key for key, value in action["cost"].items() if key != "fft_pixels" and value > budget_remaining[key]]
            if exceeded:
                decision["diagnostics"]["blocked_cost"] = action["cost"]
                return finish("stop", "budget_exhausted", {"blocked_budget_components": exceeded})
        decision.update(status="proposed" if kind in ("gpa", "topology") else kind, reason=reason)
        return {"actions": [copy.deepcopy(action)], "decision": decision}

    if not isinstance(budget_remaining, dict):
        budget_remaining = {}
    unknown = [row.get("request_id") for row in attempts
               if row.get("state", row.get("status", row.get("outcome"))) in ("unknown", "prepared", "incomplete", "pending", "running")]
    if unknown:
        return finish("stop", "original_request_outcome_unresolved", {"original_request_ids": unknown},
                      ["Recover original requests with image_result before any dependent method call"])
    if topology_result is not None:
        report = topology_result.get("report", {})
        decision["diagnostics"]["topology_status"] = report.get("status")
        decision["diagnostics"]["topology_loop_group_statuses"] = [g.get("status") for g in report.get("loop_groups", [])]
        return finish("stop", "topology_evidence_retained", preconditions=["Inspect every group, unavailable path and contrary observation; no automatic fit repair"])
    if not isinstance(seed_gpas, list) or not 1 <= len(seed_gpas) <= 3:
        return finish("request_information", "saved_gpa_required", {"required_fields": ["1..3 exact saved GPA records"]})
    if info.get("goal") != "projected_topology":
        return finish("request_information", "explicit_question_required", {"required_fields": ["goal=projected_topology"]})

    vectors, summaries, common = [], [], None
    for seed in seed_gpas:
        params, report, dependency = (seed.get(key, {}) for key in ("parameters", "report", "input_dependency"))
        shape = seed.get("shape_yx", report.get("shape_yx"))
        if (seed.get("kind") != "gpa" or params.get("reference_mode") != "fixed_g" or
                not _vectors(params.get("g_vectors")) or not isinstance(shape, list) or len(shape) != 2 or
                any(type(n) is not int or not 64 <= n <= 512 for n in shape)):
            return finish("request_information", "qualified_fixed_g_seed_required", {"required_fields": ["exact fixed_g GPA metadata on a 64..512 grid"]})
        scope = {key: dependency.get(key) for key in _COMMON}
        scope["mask_sigma"] = params.get("mask_sigma")
        if common is None:
            common = scope
        if common != scope:
            return finish("stop", "gpa_scope_mismatch", preconditions=["Inputs must retain exact FFT/source/grid/metric/bandwidth; matching PNGs do not qualify"])
        quality = report.get("quality", {})
        residues = quality.get("phase_residue_plaquettes_per_reflection")
        low_amplitude = quality.get("low_amplitude_pixels_per_reflection")
        discontinuities = quality.get("unwrap_discontinuity_pixels_per_reflection")
        if (not isinstance(residues, list) or len(residues) != 2 or
                any(not isinstance(row, dict) or any(type(row.get(key)) is not int or row[key] < 0 for key in ("positive", "negative")) for row in residues) or
                any(not isinstance(rows, list) or len(rows) != 2 or any(type(n) is not int or n < 0 for n in rows)
                    for rows in (low_amplitude, discontinuities)) or
                not _finite(quality.get("phase_valid_fraction")) or not 0 <= quality["phase_valid_fraction"] <= 1):
            return finish("request_information", "raw_phase_diagnostics_required", {"required_fields": ["full saved GPA report.quality residue, low-amplitude, unwrap-discontinuity counts and phase_valid_fraction"]})
        total = sum(row[sign] for row in residues for sign in ("positive", "negative"))
        summaries.append({"object_id": seed.get("object_id"), "raw_residue_plaquettes": total,
                          "residue_density_per_band_pixel": total / (2 * shape[0] * shape[1]),
                          "low_amplitude_pixels": sum(low_amplitude),
                          "low_amplitude_fraction_per_band_pixel": sum(low_amplitude) / (2 * shape[0] * shape[1]),
                          "unwrap_discontinuity_pixels": sum(discontinuities),
                          "phase_valid_fraction": quality["phase_valid_fraction"]})
        vectors.extend(params["g_vectors"])
    decision["diagnostics"].update(gpa_quality=summaries, quality_policy={
        "minimum_phase_valid_fraction": MIN_PHASE_VALID_FRACTION, "maximum_residue_density_per_band_pixel": MAX_RESIDUE_DENSITY,
        "maximum_low_amplitude_fraction_per_band_pixel": MAX_LOW_AMPLITUDE_FRACTION,
        "semantics": "Fixed heuristic stop guards; neither measures material validity nor uncertainty"})
    if any(row["phase_valid_fraction"] < MIN_PHASE_VALID_FRACTION or row["residue_density_per_band_pixel"] > MAX_RESIDUE_DENSITY or
           row["low_amplitude_fraction_per_band_pixel"] > MAX_LOW_AMPLITUDE_FRACTION for row in summaries):
        return finish("stop", "phase_quality_limited", preconditions=["Retain unavailable evidence; no automatic aperture/reference relaxation or repeated search"])
    if not any(row["raw_residue_plaquettes"] or row["low_amplitude_pixels"] or row["unwrap_discontinuity_pixels"] for row in summaries):
        return finish("stop", "clean_finite_saved_phase_roi", preconditions=["No saved phase/amplitude limitation trigger in this finite ROI; defect absence is not established"])

    missing = [key for key in ("model_assumption_text", "loops") if not info.get(key)]
    if not _text(info.get("model_assumption_text")) and "model_assumption_text" not in missing:
        missing.append("model_assumption_text")
    if missing:
        return finish("request_information", "explicit_model_and_circuits_required", {"required_fields": missing})
    loops = info["loops"]
    try:
        if not isinstance(loops, list) or not 2 <= len(loops) <= 8 or any(
                not isinstance(loop, dict) or loop.get("orientation") not in ("positive_image_xy", "negative_image_xy") for loop in loops):
            raise ValueError("Two to eight explicitly oriented circuits required")
        groups, _ = topology.spatial_groups(loops, shape)
        if not any(group["strictly_nested_loop_pairs"] for group in groups):
            raise ValueError("At least two distinct strictly nested circuits are required")
    except (ValueError, TypeError, KeyError) as error:
        return finish("request_information", "nested_circuits_required", {"required_fields": ["2..8 in-bounds oriented local rectangles including a strict nesting pair"], "detail": str(error)})
    decision["diagnostics"]["requested_loop_groups"] = groups
    directions = _directions(vectors, shape)
    decision["diagnostics"]["directions"] = directions
    if directions["family_count"] < 3:
        if len(seed_gpas) >= 3:
            return finish("stop", "gpa_record_limit_without_redundancy", preconditions=[
                "Topology supports at most three exact GPA records; this policy cannot append a fourth",
                "Retain the existing evidence; any differently scoped experiment requires an explicit new plan"])
        if any(row.get("kind") == "gpa" for row in attempts):
            return finish("stop", "followup_did_not_resolve_redundancy", preconditions=["Only one optional GPA follow-up is in scope"])
        followup = info.get("followup_g_vectors")
        if not _vectors(followup) or not _text(info.get("followup_basis")):
            return finish("request_information", "sourced_third_direction_required", {"required_fields": ["followup_g_vectors", "followup_basis"]})
        extended = _directions(vectors + followup, shape)
        decision["diagnostics"]["followup_directions"] = extended
        if extended["family_count"] < 3 or extended["family_count"] <= directions["family_count"]:
            return finish("request_information", "followup_direction_unresolved", {"required_fields": ["a genuinely separated nonharmonic third direction; Friedel/harmonic jitter is insufficient"]})
        if _directions(followup, shape)["family_count"] != 2:
            return finish("request_information", "followup_pair_unresolved", {"required_fields": ["two independently resolved directions within the follow-up GPA pair"]})
        first = seed_gpas[0]
        inherited = first["parameters"]
        parameters = {key: copy.deepcopy(inherited[key]) for key in (
            "source_domain", "source_domain_text", "mask_sigma", "reference_rect", "reference_mode", "reference_text") if key in inherited}
        required = ("source_domain", "source_domain_text", "mask_sigma", "reference_rect", "reference_text")
        if any(key not in parameters for key in required):
            return finish("request_information", "complete_saved_gpa_parameters_required", {"required_fields": list(required)})
        try:
            basis, _ = gpa._g_vectors(followup, "followup_g_vectors")
            gpa._mask_geometry(basis, gpa.np.full(2, parameters["mask_sigma"]), shape)
        except (ValueError, TypeError) as error:
            return finish("request_information", "followup_gpa_geometry_invalid", {"required_fields": ["followup pair satisfying the unchanged GPA condition/DC/conjugate/Nyquist/mask guards"], "detail": str(error)})
        parameters.update(object_id=first["input_dependency"].get("selected", {}).get("object_id", first.get("parent_object_id")),
                          g_vectors=copy.deepcopy(followup), amplitude_floor_relative=inherited.get("amplitude_floor_relative", .05))
        if not _text(parameters["object_id"]):
            return finish("request_information", "exact_fft_selection_required", {"required_fields": ["saved GPA input_dependency.selected.object_id"]})
        parameters["reference_text"] += "\nFollow-up reciprocal-basis source/assumption: " + info["followup_basis"]
        return finish("gpa", "add_sourced_redundant_phase_direction", parameters,
                      ["Provider must validate unchanged exact FFT/metric, Fourier mask geometry and reference", "No source FFT or fitted-reference substitution"], _cost("gpa", shape))
    parameters = {"object_ids": [seed["object_id"] for seed in seed_gpas], "loops": copy.deepcopy(loops),
                  "model_assumption_text": info["model_assumption_text"]}
    if "amplitude_floor_relative" in info:
        parameters["amplitude_floor_relative"] = info["amplitude_floor_relative"]
    if "burgers_candidates" in info:
        parameters["burgers_candidates"] = copy.deepcopy(info["burgers_candidates"])
    return finish("topology", "inspect_conditional_wrapped_phase_winding", parameters,
                  ["Provider validates exact saved bands and every sampled path", "At least three finite-resolution direction families and nested comparison loops", "Consistency remains conditional; contrast-only vortices can mimic it"],
                  _cost("topology", shape, loops))
