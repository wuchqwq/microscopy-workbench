"""Versioned spatial grouping over unchanged rectangular winding mathematics.

New analyses use v2 geometry-scoped inference. The frozen v1 kernel supplies
path sampling, guards and per-group numerical inference; it is also retained so
historical v1 manifests remain readable without reinterpretation.
"""
import copy
import hashlib
from math import pi

import numpy as np

try:
    from . import image_topology_legacy_v1 as legacy
except ImportError:
    import image_topology_legacy_v1 as legacy

ALGORITHM_VERSION = "saved-wrapped-phase-rectangular-topology-v2"
LEGACY_ALGORITHM_VERSION = legacy.ALGORITHM_VERSION
DEPENDENCY_ALGORITHM_VERSION = "saved-wrapped-phase-rectangular-topology-v3"
SUPPORTED_ALGORITHMS = (LEGACY_ALGORITHM_VERSION, ALGORITHM_VERSION, DEPENDENCY_ALGORITHM_VERSION)
TopologyError = legacy.TopologyError
MAX_CONDITION = legacy.MAX_CONDITION
MAX_PATH_SAMPLES = legacy.MAX_PATH_SAMPLES
INTEGER_RESIDUAL_TOLERANCE = legacy.INTEGER_RESIDUAL_TOLERANCE
VECTOR_RESIDUAL_TOLERANCE_CYCLES = legacy.VECTOR_RESIDUAL_TOLERANCE_CYCLES


def band_dependency(masks):
    """Necessary support qualification, never statistical/physical independence.

    Consume actual saved truncated masks, not reconstructed centre distances.
    Signed Fourier coefficients of a real image also share their conjugates.
    No tunable overlap cutoff: new cross-record redundancy uses the same
    disjoint-support scope already required within each admitted GPA pair.
    """
    arrays = np.asarray(masks, dtype=np.float64)
    if arrays.ndim != 3 or not 2 <= len(arrays) <= 6 or not np.isfinite(arrays).all() or np.any(arrays < 0):
        raise TopologyError("Invalid Fourier masks for topology dependency assessment")
    supports = arrays > 0
    counts = np.count_nonzero(supports, axis=(1, 2))
    if np.any(counts == 0):
        raise TopologyError("Empty topology Fourier support")
    h, w = arrays.shape[1:]
    iy, ix = (2*(h//2)-np.arange(h)) % h, (2*(w//2)-np.arange(w)) % w
    pairs = []
    for i in range(len(arrays)):
        for j in range(i+1, len(arrays)):
            conjugate = arrays[j][np.ix_(iy, ix)]
            direct = int(np.count_nonzero(supports[i] & supports[j]))
            friedel = int(np.count_nonzero(supports[i] & (conjugate > 0)))
            pairs.append({"reflection_indices": [i, j], "shared_coefficients": direct,
                          "shared_conjugate_coefficients": friedel,
                          "disjoint_modulo_conjugacy": direct == friedel == 0})
    qualified = all(row["disjoint_modulo_conjugacy"] for row in pairs)
    return {"policy": "saved_mask_disjoint_support_modulo_conjugacy_v1",
            "qualified_cross_band_support": qualified,
            "reason_codes": [] if qualified else ["reused_fourier_coefficients"],
            "reflection_supports": [{"reflection_index": i, "shape_yx": [h,w],
                "nonzero_coefficients": int(counts[i]),
                "float64_c_order_sha256": hashlib.sha256(a.tobytes(order="C")).hexdigest()}
                for i,a in enumerate(arrays)], "pairs": pairs,
            "phase_dependency": "fixed_g phase_demodulated_wrapped before constant gauge and plane fitting; no unwrapped displacement/strain used",
            "common_observation": "all bands share one saved source FFT",
            "statistical_independence_established": False,
            "physical_model_validated": False}


def _qualify_inference(inference, dependency):
    inference["cross_band_support_qualified"] = dependency["qualified_cross_band_support"]
    inference["least_squares_scope"] = "conditional fit of all retained rows; overlapping channels can reweight the solution"
    inference["leave_one_out_scope"] = "algebraic channel consistency; not independent experimental validation"
    inference["statistical_independence_established"] = False
    if not dependency["qualified_cross_band_support"]:
        inference["redundancy_validated"] = False


def analyze_with_dependencies(phases, amplitudes, g_vectors, loops, *, band_dependency, **options):
    """v3 adds support admission to unchanged v2 winding/fitting diagnostics."""
    if len(band_dependency.get("reflection_supports", [])) != len(g_vectors):
        raise TopologyError("Fourier dependency coverage differs from retained phase channels")
    output = analyze(phases, amplitudes, g_vectors, loops, **options)
    report = output["report"]
    report["algorithm"] = DEPENDENCY_ALGORITHM_VERSION
    report["band_dependency"] = copy.deepcopy(band_dependency)
    for scope in [report, *report["loop_groups"]]:
        if scope["projected_burgers"] is not None:
            _qualify_inference(scope["projected_burgers"], band_dependency)
        if not band_dependency["qualified_cross_band_support"] and scope["status"] == "projected_topological_evidence":
            scope["status"] = "constrained_candidate_without_redundancy"
    report["limitations"].extend([
        "Disjoint Fourier support is a necessary admission condition, not proof of independent observations, noise or physical interpretation",
        "Overlapping direct or conjugate bands retain conditional winding/least-squares diagnostics but cannot validate redundant topology; all rows can reweight the fitted closure"])
    return output


def validate_dependency_inference(report):
    dependency = report["band_dependency"]
    for scope in [report, *report.get("loop_groups", [])]:
        inference = scope.get("projected_burgers")
        if inference is not None:
            expected = copy.deepcopy(inference)
            _qualify_inference(expected, dependency)
            if expected != inference:
                raise TopologyError("Saved topology fit overstates its Fourier support qualification")
        if not dependency["qualified_cross_band_support"] and scope.get("status") == "projected_topological_evidence":
            raise TopologyError("Reused Fourier support cannot promote projected topology redundancy")


def spatial_groups(loops, shape):
    """Partition ALL supplied circuits by strict geometric nesting, not charge."""
    parsed = [legacy._rectangle(loop, shape) for loop in loops]
    adjacent = [set() for _ in parsed]
    pairs = []
    for i, left in enumerate(parsed):
        for j in range(i + 1, len(parsed)):
            if legacy._nested(left[0], parsed[j][0]):
                adjacent[i].add(j)
                adjacent[j].add(i)
                pairs.append([i, j])
    unseen, groups = set(range(len(parsed))), []
    while unseen:
        start = min(unseen)
        pending, members = [start], set()
        while pending:
            current = pending.pop()
            if current in members:
                continue
            members.add(current)
            pending.extend(adjacent[current] - members)
        unseen -= members
        members = sorted(members)
        groups.append({"group_index": len(groups), "loop_indices": members,
                       "strictly_nested_loop_pairs": [pair for pair in pairs if pair[0] in members and pair[1] in members]})
    relations = []
    for i, left in enumerate(groups):
        for right in groups[i + 1:]:
            overlaps = []
            for a in left["loop_indices"]:
                ax0, ay0, ax1, ay1 = parsed[a][0]
                for b in right["loop_indices"]:
                    bx0, by0, bx1, by1 = parsed[b][0]
                    if max(ax0, bx0) < min(ax1, bx1) and max(ay0, by0) < min(ay1, by1):
                        overlaps.append([a, b])
            relations.append({"group_indices": [left["group_index"], right["group_index"]],
                              "relation": "overlap_non_nested" if overlaps else "disjoint_support",
                              "overlapping_loop_pairs": overlaps})
    return groups, relations


def analyze(phases, amplitudes, g_vectors, loops, *, edge_invalid=None,
            amplitude_floor_relative=.05, calibration_nm_xy=None,
            burgers_candidates=None, phase_step_limit=.8 * pi):
    options = dict(edge_invalid=edge_invalid, amplitude_floor_relative=amplitude_floor_relative,
                   calibration_nm_xy=calibration_nm_xy, burgers_candidates=burgers_candidates,
                   phase_step_limit=phase_step_limit)
    # One unchanged numerical pass preserves the full original per-loop arrays.
    full = legacy.analyze(phases, amplitudes, g_vectors, loops, **options)
    report, arrays = full["report"], full["arrays"]
    geometry, relations = spatial_groups(loops, report["shape_yx"])
    group_reports = []
    for group in geometry:
        members = group["loop_indices"]
        local = report if len(geometry) == 1 else legacy.analyze(
            phases, amplitudes, g_vectors, [loops[index] for index in members], **options)["report"]
        reflections = copy.deepcopy(local["reflections"])
        for reflection in reflections:
            reflection["valid_loop_indices"] = [members[index] for index in reflection["valid_loop_indices"]]
            reflection["strictly_nested_valid_loop_pairs"] = [[members[a], members[b]] for a, b in reflection["strictly_nested_valid_loop_pairs"]]
        group_reports.append({**group, "status": local["status"], "reflections": reflections,
                              "projected_burgers": copy.deepcopy(local["projected_burgers"]),
                              "burgers_candidates": copy.deepcopy(local["burgers_candidates"]),
                              "interpretation_status": "hypothesized",
                              "stability_scope": "one net closure hypothesis across this strictly nested geometry component"})
        for index in members:
            report["loops"][index]["group_index"] = group["group_index"]
    report["algorithm"] = ALGORITHM_VERSION
    report["loop_groups"] = group_reports
    report["grouping"] = {
        "policy": "strict_nesting_components_v1", "group_count": len(group_reports),
        "assignment_basis": "all supplied rectangle geometry before phase validity or winding",
        "cross_group_constraints": "not_compared_or_fitted", "inter_group_relations": relations,
        "group_membership_is_core_identity": False,
        "nested_charge_variation_meaning": "annular net charge may differ; no single stable closure, not a physical contradiction"}
    report["limitations"] = [text for text in report["limitations"] if not text.startswith("Different nested-loop charges")]
    report["limitations"].extend([
        "Strict nesting groups are geometric test scopes, not proof that all paths enclose one core",
        "Nested winding changes can reflect added or cancelling enclosed cores in the annulus; they invalidate only the group's single stable closure hypothesis",
        "Separated groups retain separate observations and fits; overlapping nonnested support remains ambiguous and is not forced into one closure"])
    if len(group_reports) == 1:
        report.update({key: copy.deepcopy(group_reports[0][key]) for key in ("status", "reflections", "projected_burgers", "burgers_candidates")})
    else:
        # This is an evidence container, never a global physical contradiction
        # and never a silently selected/fitted Burgers vector across locations.
        report.update(status="spatially_grouped_evidence", reflections=[],
                      projected_burgers=None, burgers_candidates=[])
    return {"report": report, "arrays": arrays}
