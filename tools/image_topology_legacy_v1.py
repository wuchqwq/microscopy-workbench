"""Bounded projected topology from saved wrapped geometric phase only.

No FFT, phase unwrapping, displacement differentiation, core finding, or material
identification occurs here.  Pixel-centre XY rectangles are explicit inputs.
Positive image XY circulation is east, south, west, north (positive shoelace
area, clockwise on a screen with downward Y).  For phi=-2*pi*G*u, the canonical
integer winding w constrains a projected circuit closure by G*b=-w.
"""

import math

import numpy as np


ALGORITHM_VERSION = "saved-wrapped-phase-rectangular-topology-v1"
MAX_CONDITION = 100.0
MAX_PATH_SAMPLES = 16384
INTEGER_RESIDUAL_TOLERANCE = 1e-6
VECTOR_RESIDUAL_TOLERANCE_CYCLES = 0.05


class TopologyError(ValueError):
    def __init__(self, message, code="TOPOLOGY_INVALID_ARGUMENT"):
        super().__init__(message)
        self.code = code


def _need(condition, message):
    if not condition:
        raise TopologyError(message)


def _numbers(values, name, shape=None):
    try:
        result = np.asarray(values)
        _need(result.dtype.kind in "iuf", name + " requires real numbers")
        result = result.astype(np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise TopologyError(name + " requires real numbers") from error
    if shape is not None:
        _need(result.shape == shape, name + " has the wrong shape")
    return result


def _wrap(values):
    return (values + np.pi) % (2 * np.pi) - np.pi


def _rectangle(loop, shape):
    if isinstance(loop, dict):
        _need(set(loop) <= {"rect", "orientation", "loop_id"}, "Loop supports rect, orientation and loop_id only")
        if "loop_id" in loop:
            _need(isinstance(loop["loop_id"], str) and 0 < len(loop["loop_id"]) <= 160,
                  "loop_id requires one to 160 characters")
        rect = loop.get("rect")
        orientation = loop.get("orientation", "positive_image_xy")
    else:
        rect, orientation = loop, "positive_image_xy"
    _need(orientation in ("positive_image_xy", "negative_image_xy"),
          "Loop orientation requires positive_image_xy or negative_image_xy")
    try:
        rect = list(rect)
    except TypeError as error:
        raise TopologyError("Loop rect requires four half-open XYXY integers") from error
    _need(len(rect) == 4 and all(type(v) is int for v in rect),
          "Loop rect requires four half-open XYXY integers")
    x0, y0, x1, y1 = rect
    h, w = shape
    _need(0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h and x1 - x0 >= 3 and y1 - y0 >= 3,
          "Loop must be in bounds with at least three pixel centres along each axis")
    # Each vertex occurs once.  Closing from the last to first sample is implicit.
    path = ([(x, y0) for x in range(x0, x1)] +
            [(x1 - 1, y) for y in range(y0 + 1, y1)] +
            [(x, y1 - 1) for x in range(x1 - 2, x0 - 1, -1)] +
            [(x0, y) for y in range(y1 - 2, y0, -1)])
    if orientation == "negative_image_xy":
        # Preserve the first vertex while reversing the closed path.
        path = path[:1] + path[:0:-1]
    return rect, orientation, np.asarray(path, dtype=np.int64)


def _nested(a, b):
    """Strict nesting keeps the two sampled boundaries disjoint."""
    return ((a[0] < b[0] and a[1] < b[1] and a[2] > b[2] and a[3] > b[3]) or
            (b[0] < a[0] and b[1] < a[1] and b[2] > a[2] and b[3] > a[3]))


def _matrix_quality(matrix):
    if len(matrix) < 2:
        return min(len(matrix), 1), None
    singular = np.linalg.svd(matrix, compute_uv=False)
    rank = int(np.linalg.matrix_rank(matrix))
    condition = float(singular[0] / singular[-1]) if rank == 2 else None
    return rank, condition


def _direction_families(matrix):
    """Conjugates and harmonics cannot supply another direction family."""
    families = []
    for index, vector in enumerate(matrix):
        unit = vector / np.linalg.norm(vector)
        for family in families:
            representative = matrix[family[0]]
            representative = representative / np.linalg.norm(representative)
            if abs(float(unit[0] * representative[1] - unit[1] * representative[0])) <= 1e-10:
                family.append(index)
                break
        else:
            families.append([index])
    return families


def _candidate_inputs(values):
    if values is None:
        return []
    _need(isinstance(values, (list, tuple)) and 1 <= len(values) <= 32,
          "burgers_candidates requires one to 32 explicit pixel XY candidates")
    candidates = []
    for index, value in enumerate(values):
        if isinstance(value, dict):
            _need(set(value) <= {"label", "b_pixel_xy"}, "Candidate supports label and b_pixel_xy only")
            label = value.get("label", "candidate_%d" % index)
            vector = value.get("b_pixel_xy")
        else:
            label, vector = "candidate_%d" % index, value
        _need(isinstance(label, str) and 0 < len(label) <= 160, "Candidate label requires one to 160 characters")
        vector = _numbers(vector, "Candidate b_pixel_xy", (2,))
        _need(np.isfinite(vector).all(), "Candidate b_pixel_xy must be finite")
        candidates.append((label, vector))
    return candidates


def analyze(phases, amplitudes, g_vectors, loops, *, edge_invalid=None,
            amplitude_floor_relative=0.05, calibration_nm_xy=None,
            burgers_candidates=None, phase_step_limit=0.8 * np.pi):
    """Return JSON-safe ``report`` and scientific numeric ``arrays``.

    ``phases`` and ``amplitudes`` are saved [reflection,y,x] arrays for one to
    six unique, nonconjugate reflections of the SAME local spatial FFT.  Supply
    the original demodulating G, not a fitted-reference effective G.  Nonfinite
    pixels are permitted and invalidate only paths that touch them.  The edge
    mask is [y,x] or per reflection.  Residue, unwrap-branch and displacement
    masks must NOT be passed as edge masks: a masked interior core is permitted.

    The relative amplitude floor uses a per-band global maximum among finite,
    non-edge pixels, fixed for all supplied loops.  It is not a reference-ROI
    median and is not renormalized on each path.  ``loops`` has one to eight
    half-open XYXY rectangles, optionally dicts with rect and orientation.
    Candidates and inferred b are in local image pixels; optional signed XY
    nanometres/pixel converts components without changing the image convention.
    """
    phase = _numbers(phases, "phases")
    amplitude = _numbers(amplitudes, "amplitudes")
    _need(phase.ndim == 3 and amplitude.shape == phase.shape and
          1 <= phase.shape[0] <= 6 and all(4 <= n <= 512 for n in phase.shape[1:]),
          "Saved phase/amplitude require matching [1..6,4..512,4..512] arrays")
    m, h, w = phase.shape
    _need(np.all(amplitude[np.isfinite(amplitude)] >= 0), "Finite amplitudes must be nonnegative")
    finite_phase = np.isfinite(phase)
    _need(np.all(np.abs(phase[finite_phase]) <= np.pi + 1e-12), "phases must be wrapped radians in [-pi,pi]")
    g = _numbers(g_vectors, "g_vectors", (m, 2))
    _need(np.isfinite(g).all() and np.all(np.linalg.norm(g, axis=1) > 0) and np.all(np.abs(g) < 0.5),
          "g_vectors require finite nonzero vectors inside the cycles/pixel Nyquist cell")
    for i in range(m):
        for j in range(i):
            _need(not np.allclose(g[i], g[j], rtol=0, atol=1e-12) and
                  not np.allclose(g[i], -g[j], rtol=0, atol=1e-12),
                  "Duplicate or conjugate vectors cannot be independent topology constraints")
    _need(type(amplitude_floor_relative) in (int, float) and math.isfinite(amplitude_floor_relative) and
          0 < amplitude_floor_relative < 1, "amplitude_floor_relative must be strictly between zero and one")
    _need(type(phase_step_limit) in (int, float) and math.isfinite(phase_step_limit) and
          0 < phase_step_limit < np.pi, "phase_step_limit must be strictly between zero and pi")
    if edge_invalid is None:
        edge = np.zeros(phase.shape, dtype=bool)
    else:
        edge_values = np.asarray(edge_invalid)
        _need(edge_values.dtype.kind == "b" and edge_values.shape in ((h, w), phase.shape),
              "edge_invalid requires a boolean [y,x] or [reflection,y,x] mask")
        edge = np.broadcast_to(edge_values, phase.shape)
    metric = None if calibration_nm_xy is None else _numbers(calibration_nm_xy, "calibration_nm_xy", (2,))
    if metric is not None:
        _need(np.isfinite(metric).all() and np.all(metric != 0) and
              float(np.max(np.abs(metric)) / np.min(np.abs(metric))) <= 1e6,
              "calibration_nm_xy requires finite nonzero signed scales and a bounded XY ratio")
    candidates = _candidate_inputs(burgers_candidates)
    _need(isinstance(loops, (list, tuple)) and 1 <= len(loops) <= 8, "Supply one to eight explicit rectangular loops")
    parsed = [_rectangle(loop, (h, w)) for loop in loops]
    total_samples = sum(len(entry[2]) for entry in parsed)
    _need(total_samples <= MAX_PATH_SAMPLES, "Loop paths exceed the 16384 sample budget")

    peaks, thresholds = [], []
    eligible = np.zeros_like(phase, dtype=bool)
    for i in range(m):
        available = np.isfinite(amplitude[i]) & ~edge[i]
        peak = float(np.max(amplitude[i][available])) if available.any() else 0.0
        threshold = max(float(amplitude_floor_relative) * peak, np.finfo(np.float64).eps * peak * 32)
        peaks.append(peak)
        thresholds.append(threshold)
        eligible[i] = finite_phase[i] & np.isfinite(amplitude[i]) & ~edge[i] & (amplitude[i] > threshold)

    count = len(parsed)
    winding = np.full((count, m), np.nan, dtype=np.float64)
    integer = np.full_like(winding, np.nan)
    residual = np.full_like(winding, np.nan)
    maximum_step = np.full_like(winding, np.nan)
    valid = np.zeros((count, m), dtype=bool)
    paths, offsets, step_arrays, phase_samples, amplitude_samples = [], [0], [], [], []
    path_eligible_arrays, loop_reports = [], []
    for loop_index, (rect, orientation, path) in enumerate(parsed):
        x, y = path.T
        sampled = phase[:, y, x]
        sampled_amplitude = amplitude[:, y, x]
        path_eligible = eligible[:, y, x]
        with np.errstate(invalid="ignore"):
            steps = _wrap(np.roll(sampled, -1, axis=1) - sampled)
        step_arrays.append(steps)
        phase_samples.append(sampled)
        amplitude_samples.append(sampled_amplitude)
        path_eligible_arrays.append(path_eligible)
        paths.append(path)
        offsets.append(offsets[-1] + len(path))
        reflection_reports = []
        sign = 1 if orientation == "positive_image_xy" else -1
        for i in range(m):
            all_finite = bool(np.isfinite(sampled[i]).all())
            if all_finite:
                winding[loop_index, i] = float(np.sum(steps[i], dtype=np.float64) / (2 * np.pi))
                integer[loop_index, i] = float(np.rint(winding[loop_index, i]))
                residual[loop_index, i] = abs(winding[loop_index, i] - integer[loop_index, i])
                maximum_step[loop_index, i] = float(np.max(np.abs(steps[i])))
            failures = []
            if not bool(path_eligible[i].all()):
                failures.append("ineligible_path_pixel")
            if all_finite and maximum_step[loop_index, i] >= phase_step_limit:
                failures.append("ambiguous_phase_step")
            if all_finite and residual[loop_index, i] > INTEGER_RESIDUAL_TOLERANCE:
                failures.append("noninteger_numerical_circulation")
            valid[loop_index, i] = not failures
            finite_amp = sampled_amplitude[i][np.isfinite(sampled_amplitude[i])]
            reflection_reports.append({
                "reflection_index": i, "valid": bool(valid[loop_index, i]), "failures": failures,
                "winding_cycles": float(winding[loop_index, i]) if valid[loop_index, i] else None,
                "winding_integer": int(integer[loop_index, i]) if valid[loop_index, i] else None,
                "canonical_winding_integer": sign * int(integer[loop_index, i]) if valid[loop_index, i] else None,
                "diagnostic_winding_cycles": float(winding[loop_index, i]) if all_finite else None,
                "diagnostic_winding_integer": int(integer[loop_index, i]) if all_finite else None,
                "diagnostic_canonical_winding_integer": sign * int(integer[loop_index, i]) if all_finite else None,
                "integer_residual_cycles": float(residual[loop_index, i]) if all_finite else None,
                "maximum_abs_wrapped_step_radians": float(maximum_step[loop_index, i]) if all_finite else None,
                "minimum_path_amplitude": float(finite_amp.min()) if len(finite_amp) else None,
                "ineligible_path_pixels": int((~path_eligible[i]).sum()),
                "edge_invalid_path_pixels": int(edge[i, y, x].sum()),
                "nonfinite_path_pixels": int((~np.isfinite(sampled[i]) | ~np.isfinite(sampled_amplitude[i])).sum()),
                "low_amplitude_path_pixels": int((np.isfinite(sampled_amplitude[i]) &
                                                   (sampled_amplitude[i] <= thresholds[i])).sum())})
        loop_reports.append({"loop_index": loop_index, "rect_xyxy": rect, "orientation": orientation,
                             "sample_count": len(path), "reflections": reflection_reports})
        if isinstance(loops[loop_index], dict) and "loop_id" in loops[loop_index]:
            loop_reports[-1]["loop_id"] = loops[loop_index]["loop_id"]

    summaries, stable_indices, stable_winding = [], [], []
    for i in range(m):
        indices = np.flatnonzero(valid[:, i]).tolist()
        charges = [loop_reports[j]["reflections"][i]["canonical_winding_integer"] for j in indices]
        pairs = [[a, b] for position, a in enumerate(indices) for b in indices[position + 1:]
                 if _nested(parsed[a][0], parsed[b][0])]
        consistent = bool(charges) and len(set(charges)) == 1
        stable = consistent and bool(pairs)
        if not indices:
            status = "no_valid_loops"
        elif not consistent:
            status = "inconsistent_winding"
        elif not pairs:
            status = "insufficient_nested_loops"
        else:
            status = "stable_nonzero" if charges[0] else "stable_zero"
        if stable:
            stable_indices.append(i)
            stable_winding.append(charges[0])
        summaries.append({"reflection_index": i, "status": status, "valid_loop_indices": indices,
                          "strictly_nested_valid_loop_pairs": pairs, "consistent": consistent,
                          "stable": stable, "canonical_winding_integers": charges,
                          "representative_winding_integer": charges[0] if consistent else None,
                          "invalid_loop_count": count - len(indices)})

    matrix = g[stable_indices]
    charges = np.asarray(stable_winding, dtype=np.float64)
    rank, condition = _matrix_quality(matrix)
    solution = None
    vector_residuals = None
    loo_reports = []
    compatible = False
    redundant = False
    direction_families = _direction_families(matrix)
    if rank == 2 and condition <= MAX_CONDITION:
        solution = np.linalg.lstsq(matrix, -charges, rcond=None)[0]
        _need(np.isfinite(solution).all(), "Projected solution exceeds finite numeric range")
        vector_residuals = matrix @ solution + charges
        compatible = bool(np.max(np.abs(vector_residuals)) <= VECTOR_RESIDUAL_TOLERANCE_CYCLES)
        if len(matrix) >= 3:
            for j, reflection_index in enumerate(stable_indices):
                keep = np.arange(len(matrix)) != j
                loo_rank, loo_condition = _matrix_quality(matrix[keep])
                held_out_residual = None
                if loo_rank == 2 and loo_condition <= MAX_CONDITION:
                    loo_b = np.linalg.lstsq(matrix[keep], -charges[keep], rcond=None)[0]
                    held_out_residual = float(matrix[j] @ loo_b + charges[j])
                loo_reports.append({"held_out_reflection_index": reflection_index, "fit_rank": loo_rank,
                                    "fit_condition_number": loo_condition,
                                    "held_out_residual_cycles": held_out_residual,
                                    "compatible": held_out_residual is not None and
                                    abs(held_out_residual) <= VECTOR_RESIDUAL_TOLERANCE_CYCLES})
            redundant = len(direction_families) >= 3 and all(entry["compatible"] for entry in loo_reports)

    incomplete = any(not entry["stable"] or entry["invalid_loop_count"] > 0 for entry in summaries)
    inconsistent = any(entry["status"] == "inconsistent_winding" for entry in summaries)
    any_nonzero = any(charge != 0 for charge in stable_winding)
    if inconsistent:
        status = "inconsistent_or_partial_evidence"
    elif not stable_indices:
        status = "insufficient_loop_stability"
    elif not any_nonzero:
        status = "partial_zero_net_winding" if incomplete else "no_net_winding_detected"
    elif rank < 2 or condition is None or condition > MAX_CONDITION:
        status = "insufficient_vector_constraints"
    elif not compatible:
        status = "inconsistent_vector_constraints"
    elif incomplete:
        status = "partial_projected_constraints"
    elif not redundant:
        status = "constrained_candidate_without_redundancy"
    else:
        status = "projected_topological_evidence"

    candidate_reports = []
    for label, vector in candidates:
        with np.errstate(over="ignore", invalid="ignore"):
            candidate_residuals = matrix @ vector + charges
            predicted = -g @ vector
        _need(np.isfinite(candidate_residuals).all() and np.isfinite(predicted).all(),
              "Candidate constraints exceed finite numeric range")
        match = bool(len(matrix) and np.max(np.abs(candidate_residuals)) <= VECTOR_RESIDUAL_TOLERANCE_CYCLES)
        entry = {"label": label, "b_pixel_xy": vector.tolist(), "predicted_winding_cycles": predicted.tolist(),
                 "stable_constraint_residuals_cycles": candidate_residuals.tolist(),
                 "matches_saved_constraints": match,
                 "uniqueness_status": "not_established_by_finite_projected_candidates"}
        if metric is not None:
            with np.errstate(over="ignore", invalid="ignore"):
                vector_nm = vector * metric
            _need(np.isfinite(vector_nm).all(), "Calibrated candidate exceeds finite numeric range")
            entry["b_nm_xy"] = vector_nm.tolist()
        candidate_reports.append(entry)
    inference = {"stable_reflection_indices": stable_indices, "rank": rank,
                 "condition_number": condition, "condition_number_limit": MAX_CONDITION,
                 "b_pixel_xy": None if solution is None else solution.tolist(),
                 "constraint_residuals_cycles": None if vector_residuals is None else vector_residuals.tolist(),
                 "residual_tolerance_cycles": VECTOR_RESIDUAL_TOLERANCE_CYCLES,
                 "compatible": compatible, "redundancy_validated": redundant,
                 "direction_family_count": len(direction_families),
                 "direction_families_reflection_indices": [[stable_indices[j] for j in family]
                                                           for family in direction_families],
                 "leave_one_reflection_out": loo_reports,
                 "two_reflection_exact_fit_is_independent_validation": False,
                 "uniqueness_status": "projected_2d_conditional_candidate_no_3d_uniqueness"}
    if metric is not None:
        with np.errstate(over="ignore", invalid="ignore"):
            solution_nm = None if solution is None else solution * metric
        _need(solution_nm is None or np.isfinite(solution_nm).all(), "Calibrated solution exceeds finite numeric range")
        inference["b_nm_xy"] = None if solution_nm is None else solution_nm.tolist()
        with np.errstate(over="ignore", invalid="ignore", under="ignore"):
            metric_determinant = float(metric[0] * metric[1])
        metric_determinant_sign = 1 if np.signbit(metric[0]) == np.signbit(metric[1]) else -1
    report = {
        "algorithm": ALGORITHM_VERSION, "status": status, "interpretation_status": "hypothesized",
        "libraries": {"numpy": np.__version__},
        "shape_yx": [h, w], "reflection_count": m, "loop_count": count,
        "g_vectors_cycles_per_pixel": g.tolist(), "calibration_nm_xy": None if metric is None else metric.tolist(),
        "coordinate_domain": "local_spatial_fft_pixel_centres",
        "phase_source": "saved_phase_demodulated_wrapped_no_unwrap_or_fft",
        "phase_convention": "phi=-2*pi*G*u; canonical positive_image_xy winding w gives G*b=-w",
        "positive_loop_convention": "east_south_west_north_positive_shoelace_clockwise_on_y_down_image",
        "physical_orientation_mapping": (None if metric is None else
            {"signed_metric_determinant": metric_determinant if math.isfinite(metric_determinant) and metric_determinant != 0 else None,
             "signed_metric_determinant_sign": metric_determinant_sign,
             "positive_image_xy_has_positive_physical_xy_area": metric_determinant_sign > 0,
             "b_nm_convention": "S_times_b_pixel_for_same_positive_image_xy_circuit_no_orientation_renormalization"}),
        "rect_convention": "half_open_xyxy_boundary_pixel_centres_closure_implicit",
        "phase_step_limit_radians": float(phase_step_limit),
        "integer_residual_tolerance_cycles": INTEGER_RESIDUAL_TOLERANCE,
        "integer_residual_semantics": "arithmetic_closure_check_not_confidence_or_uncertainty",
        "amplitude_floor_relative": float(amplitude_floor_relative),
        "amplitude_normalization": "per_reflection_global_finite_non_edge_maximum_fixed_across_loops",
        "amplitude_reference_maxima": peaks, "amplitude_thresholds": thresholds,
        "eligibility_semantics": "finite_phase_and_amplitude_above_floor_and_not_edge_invalid_on_path_only",
        "total_path_samples": total_samples, "maximum_path_samples": MAX_PATH_SAMPLES,
        "loops": loop_reports, "reflections": summaries, "projected_burgers": inference,
        "burgers_candidates": candidate_reports,
        "limitations": [
            "Conditional image-phase topology does not confirm a material dislocation; contrast/noise vortices can produce the same winding",
            "Wrapped sampled steps cannot rule out unsampled aliasing or guarantee detection of subpixel defects; near-pi rejection is only a conservative diagnostic",
            "Zero net winding on these loops is not defect absence: g dot b invisibility and opposite-sign enclosed charges can cancel",
            "Different nested-loop charges may indicate added or cancelling enclosed cores and are inconsistent for a single stable closure",
            "Only net projected 2D circuit closure is constrained; no 3D Burgers uniqueness, resolved core location, slip system or material identification",
            "Bandpass and finite-window effects, image contrast, calibration uncertainty and specimen/model validity are not quantified",
            "Loop locations, sizes and vector choices are explicit user inputs; no adaptive loop or reflection selection is performed"]}
    arrays = {"path_xy": np.concatenate(paths), "path_offsets": np.asarray(offsets, dtype=np.int64),
              "path_eligible": np.concatenate(path_eligible_arrays, axis=1),
              "path_phase_radians": np.concatenate(phase_samples, axis=1),
              "path_amplitude": np.concatenate(amplitude_samples, axis=1),
              "wrapped_phase_step_radians": np.concatenate(step_arrays, axis=1),
              "eligible_phase": eligible, "loop_valid": valid,
              "loop_winding_cycles": np.where(valid, winding, np.nan),
              "loop_winding_integer": np.where(valid, integer, np.nan),
              "loop_diagnostic_winding_cycles": winding, "loop_diagnostic_winding_integer": integer,
              "loop_integer_residual_cycles": residual,
              "loop_maximum_abs_phase_step_radians": maximum_step}
    return {"report": report, "arrays": arrays}
