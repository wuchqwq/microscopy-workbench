"""Versioned spatial grouping over unchanged rectangular winding mathematics.

New analyses use v2 geometry-scoped inference. The frozen v1 kernel supplies
path sampling, guards and per-group numerical inference; it is also retained so
historical v1 manifests remain readable without reinterpretation.
"""
import copy
from math import pi

try:
    from . import image_topology_legacy_v1 as legacy
except ImportError:
    import image_topology_legacy_v1 as legacy

ALGORITHM_VERSION = "saved-wrapped-phase-rectangular-topology-v2"
LEGACY_ALGORITHM_VERSION = legacy.ALGORITHM_VERSION
SUPPORTED_ALGORITHMS = (LEGACY_ALGORITHM_VERSION, ALGORITHM_VERSION)
TopologyError = legacy.TopologyError
MAX_CONDITION = legacy.MAX_CONDITION
MAX_PATH_SAMPLES = legacy.MAX_PATH_SAMPLES
INTEGER_RESIDUAL_TOLERANCE = legacy.INTEGER_RESIDUAL_TOLERANCE
VECTOR_RESIDUAL_TOLERANCE_CYCLES = legacy.VECTOR_RESIDUAL_TOLERANCE_CYCLES


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
