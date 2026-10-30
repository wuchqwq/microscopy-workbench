"""Finite Sigma3 candidate geometry over existing immutable structure evidence.

This module performs no IO, reciprocal-point enumeration or scattering.  The
caller supplies separately saved parent/twin simulations produced by the
existing pinned engine, and owns their source/frame/ROI/revision validation.
"""
import copy
import math
import warnings

import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.spatial.transform import Rotation

from crystallography.reflection_compare import (
    compare, measurement_vector, registration as validate_registration,
)


class TwinGeometryError(ValueError):
    def __init__(self, message, code="INVALID_TWIN_GEOMETRY"):
        super().__init__(message)
        self.code = code


def _need(condition, message, code="INVALID_TWIN_GEOMETRY"):
    if not condition:
        raise TwinGeometryError(message, code)


def _finite(value):
    return type(value) in (int, float) and math.isfinite(value)


_F = np.asarray([[0., 0., 0.], [0., .5, .5], [.5, 0., .5], [.5, .5, 0.]])
_MOTIF_TOLERANCE = 1e-7
_METRIC_TOLERANCE = 1e-8
_ROUND_OFF = 64 * np.finfo(float).eps


def _periodic_residual(a, b):
    delta = a[:, None, :] - b[None, :, :]
    delta -= np.rint(delta)
    return np.max(np.abs(delta), axis=2)


def qualify(atoms):
    """Qualify only conventional, fully occupied monospecies FCC4/diamond8.

    A global fractional origin shift and atom permutation are allowed.  The
    supplied row cell must already be cubic: no primitive conversion, basis
    standardization, chemical inference or space-group discovery is attempted.
    Numerical tolerances below are admission tolerances, not error estimates.
    """
    cell = np.asarray(atoms.cell.array, dtype=float)
    positions = np.asarray(atoms.positions, dtype=float)
    _need(cell.shape == (3, 3) and np.isfinite(cell).all() and
          np.max(np.abs(cell)) <= 1e7 and positions.shape == (len(atoms), 3) and
          np.isfinite(positions).all() and np.max(np.abs(positions), initial=0) <= 1e7,
          "A finite bounded atomic structure and row-vector cell are required", "UNSUPPORTED_TWIN_SCOPE")
    _need(len(atoms) in (4, 8) and bool(np.all(atoms.pbc)),
          "Sigma3 scope requires a supplied periodic conventional FCC4 or diamond8 cell", "UNSUPPORTED_TWIN_SCOPE")
    lengths = np.linalg.norm(cell, axis=1)
    _need(bool(np.all(lengths > 0)) and np.linalg.matrix_rank(cell) == 3,
          "A full-rank nonzero cubic cell is required", "UNSUPPORTED_TWIN_SCOPE")
    axes = cell / lengths[:, None]
    _need(np.max(np.abs(lengths / lengths[0] - 1.)) <= _METRIC_TOLERANCE and
          np.max(np.abs(axes @ axes.T - np.eye(3))) <= _METRIC_TOLERANCE,
          "The supplied cell must already have equal orthogonal conventional cubic row axes", "UNSUPPORTED_TWIN_SCOPE")
    numbers = np.asarray(atoms.numbers)
    symbols = atoms.get_chemical_symbols()
    _need(len(set(symbols)) == 1 and bool(np.all(numbers > 0)),
          "Only a single known species FCC4/diamond8 motif is qualified", "UNSUPPORTED_TWIN_SCOPE")
    occupancy = atoms.info.get("occupancy")
    _need(occupancy is None or type(occupancy) is dict and all(
        type(row) is dict and set(row) == {symbols[0]} and
        _finite(row[symbols[0]]) and row[symbols[0]] == 1.
        for row in occupancy.values()),
        "Mixed, partial or ambiguous occupancy is outside the twin scope", "UNSUPPORTED_TWIN_SCOPE")
    for name in ("occupancy", "occupancies"):
        if name in atoms.arrays:
            values = np.asarray(atoms.arrays[name])
            _need(values.shape == (len(atoms),) and bool(np.all(values == 1.)),
                  "Every atomic site must have full occupancy", "UNSUPPORTED_TWIN_SCOPE")
    fractional = np.asarray(atoms.get_scaled_positions(wrap=False), dtype=float)
    _need(fractional.shape == positions.shape and np.isfinite(fractional).all() and
          np.max(np.abs(fractional)) <= 1e9,
          "Finite bounded fractional coordinates are required", "UNSUPPORTED_TWIN_SCOPE")
    motif = _F if len(atoms) == 4 else np.concatenate((_F, _F + .25))
    best = None
    for origin in fractional:
        distance = _periodic_residual(fractional - origin, motif)
        rows, columns = linear_sum_assignment(distance)
        residual = float(distance[rows, columns].max())
        if best is None or residual < best[0]:
            best = residual, origin.copy(), columns.tolist()
    _need(best[0] <= _MOTIF_TOLERANCE,
          "Cubic metric/F centering alone is insufficient: the actual sites must match the complete FCC4 or diamond8 motif", "UNSUPPORTED_TWIN_SCOPE")
    # Both admitted motifs have inversion, allowing a translation of the
    # inversion centre.  For diamond F + (F+d), x -> d-x swaps the two sets.
    inversion_translation = np.zeros(3) if len(atoms) == 4 else np.full(3, .25)
    return {
        "scope_version": 1, "model": "FCC" if len(atoms) == 4 else "diamond_cubic",
        "centering": "F", "point_group": "m-3m", "proper_point_group": "432",
        "atom_count": len(atoms), "species": symbols[0],
        "cell_kind": "supplied_conventional_orthogonal_cubic",
        "cell_angstrom": cell.tolist(), "a_angstrom": float(lengths.mean()),
        "basis_qualified": True, "symmetry_qualified_for_supported_motif": True,
        "inversion_qualified": True, "full_occupancy": True,
        "fractional_origin_shift": best[1].tolist(),
        "atom_to_template_permutation": best[2], "maximum_fractional_motif_residual": best[0],
        "inversion_translation_fractional_about_template_origin": inversion_translation.tolist(),
        "numerical_admission": {"fractional_motif_max_component_tolerance": _MOTIF_TOLERANCE,
                                "cubic_relative_metric_tolerance": _METRIC_TOLERANCE,
                                "experimental_uncertainty": "not estimated"},
        "cell_standardized": False,
        "qualification_scope": "The supplied ideal motif supports this finite geometric model; no experimental phase identification",
    }


def _proper_matrix(value, label):
    matrix = np.asarray(value, dtype=float)
    _need(matrix.shape == (3, 3) and np.isfinite(matrix).all() and
          np.allclose(matrix @ matrix.T, np.eye(3), atol=2e-12, rtol=0) and
          abs(float(np.linalg.det(matrix)) - 1.) <= 2e-12,
          label + " must be a proper active source-to-laboratory rotation")
    return matrix


def orient_candidate(atoms, parent_orientation, plane_hkl):
    """Compose one +60 degree Sigma3 candidate in the parent's source frame.

    The caller assigns the resulting orientation/structure IDs and immutable
    source hash.  The returned matrix/Euler pair is usable by existing simulate.
    """
    scope = qualify(atoms)
    _need(type(parent_orientation) is dict, "A saved parent orientation record is required")
    parent = _proper_matrix(parent_orientation.get("rotation_matrix_cartesian"), "Parent orientation")
    if "source_cell_angstrom" in parent_orientation:
        _need(np.array_equal(np.asarray(parent_orientation["source_cell_angstrom"]), atoms.cell.array),
              "Parent orientation belongs to a different supplied cell")
    _need(type(plane_hkl) is list and len(plane_hkl) == 3 and
          all(type(v) is int and abs(v) == 1 for v in plane_hkl),
          "The bounded Sigma3 law requires an explicit {111} plane")
    canonical_hkl = [v * plane_hkl[0] for v in plane_hkl]
    normal = np.asarray(canonical_hkl) @ np.asarray(atoms.cell.reciprocal().array)
    normal /= np.linalg.norm(normal)
    operation = Rotation.from_rotvec(math.pi / 3. * normal).as_matrix()
    twin = parent @ operation
    _proper_matrix(twin, "Composed twin orientation")
    mirror = np.eye(3) - 2 * np.outer(normal, normal)
    # SciPy supplies proper O rotations in cubic axes. Conjugation maps them
    # to the actual Cartesian row-cell frame without assuming cell==a*I.
    axes = np.asarray(atoms.cell.array) / np.linalg.norm(atoms.cell.array, axis=1)[:, None]
    cubic = axes.T @ Rotation.create_group("O").as_matrix() @ axes
    mirror_residual = min(float(np.linalg.norm(-mirror - operation @ symmetry)) for symmetry in cubic)
    sign_residual = min(float(np.linalg.norm(operation.T - operation @ symmetry)) for symmetry in cubic)
    _need(mirror_residual <= 1e-10 and sign_residual <= 1e-10,
          "The admitted cell/motif did not preserve the supported cubic equivalences")
    normal_lab = parent @ normal
    relation = {
        "relation_version": 1, "candidate_law": "cubic_Sigma3_60deg_about_111",
        "candidate_status": "hypothesized", "scope": scope,
        "requested_plane_hkl": list(plane_hkl), "plane_hkl": canonical_hkl,
        "plane_sign_convention": "first HKL positive; opposite normals describe one undirected plane",
        "axis_source_cartesian_unit": normal.tolist(), "angle_degrees": 60.,
        "operation_matrix_source_cartesian": operation.tolist(),
        "proper_determinant": float(np.linalg.det(operation)),
        "parent_rotation_matrix_cartesian": parent.tolist(),
        "twin_rotation_matrix_cartesian": twin.tolist(),
        "composition_rule": "U_twin = U_parent @ T; g_lab = U @ g_source",
        "interface_normal_lab_unit": normal_lab.tolist(),
        "equivalences": {
            "proper_group_engine": "scipy.spatial.transform.Rotation.create_group('O')",
            "proper_group_order": len(cubic), "plus_minus_60_equivalent_modulo_cubic_symmetry": True,
            "plus_minus_60_equivalence_residual": sign_residual,
            "mirror_equivalent_only_after_inversion_and_cubic_symmetry": True,
            "mirror_matrix_source_cartesian": mirror.tolist(), "mirror_determinant": float(np.linalg.det(mirror)),
            "inversion_times_mirror_is_proper_180_degree_rotation": True,
            "inversion_mirror_to_60_equivalence_residual": mirror_residual,
            "scope": "Supported full-occupancy centrosymmetric FCC4/diamond8 motif; reflection is never supplied as a proper rotation",
        },
        "limitations": ["This is a candidate crystallographic operation, not evidence that the specimen contains a twin",
                        "The interface normal is a coherent {111} candidate; orientation agreement alone does not prove the physical interface plane or atomic registry"],
    }
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        euler = Rotation.from_matrix(twin).as_euler("ZXZ", degrees=True)
    _need(np.allclose(Rotation.from_euler("ZXZ", euler, degrees=True).as_matrix(), twin, atol=2e-12, rtol=0),
          "Candidate Euler angles do not reproduce the authoritative proper matrix")
    beam_source = twin.T @ np.asarray([0., 0., 1.])
    orientation = {
        "record_version": 1, "orientation_kind": "bounded_Sigma3_candidate",
        "zone_axis_uvw": None, "index_convention": "Cartesian composition from supplied conventional cubic {111} reciprocal normal",
        "source_cell_angstrom": atoms.cell.array.tolist(),
        "beam_direction_cartesian_source_unit": beam_source.tolist(), "beam_direction_lab_unit": [0., 0., 1.],
        "rotation_matrix_cartesian": twin.tolist(), "inverse_rotation_matrix_cartesian": twin.T.tolist(),
        "row_vector_rule": "v_lab = v_source @ R.T; column_vector_rule: v_lab = R @ v_source",
        "matrix_semantics": "active Cartesian source-to-laboratory rotation; source positions/cell are never overwritten",
        "handedness": "right", "determinant": float(np.linalg.det(twin)),
        "euler_rzxz_deg": euler.tolist(),
        "euler_convention": "SciPy intrinsic ZXZ in degrees; same active matrix as diffsims0.7.0 transforms3d.euler.euler2mat(axes='rzxz')",
        "euler_gimbal_lock": any("Gimbal lock" in str(item.message) for item in caught),
        "euler_nonuniqueness": "At gimbal lock the matrix remains unique; SciPy sets the third angle to zero",
        "quaternion_xyzw": Rotation.from_matrix(twin).as_quat().tolist(),
        "laboratory_axes": copy.deepcopy(parent_orientation.get("laboratory_axes", {"x": "transverse +X", "y": "right-handed transverse +Y; raster rows +Y", "z": "beam +Z"})),
        "display_raster_relation": parent_orientation.get("display_raster_relation", "laboratory +X maps to raster columns; +Y maps to raster rows"),
        "view_direction": parent_orientation.get("view_direction", "beam propagation +laboratory Z; exit-side observer at +Z looking toward origin"),
        "source_coordinates_modified": False, "phase_identified": False, "twin_relation": relation,
    }
    return {"orientation": orientation, "twin_relation": relation}


def _independence(measurements):
    observations = [measurement_vector(row) for row in measurements]
    vectors = np.asarray([row["q_xy_inv_angstrom"] for row in observations], dtype=float)
    directions, families = [], []
    for row, vector in zip(observations, vectors):
        direction = vector / math.hypot(*vector)
        if direction[0] < 0 or direction[0] == 0 and direction[1] < 0:
            direction = -direction
        selected = next((i for i, old in enumerate(directions)
                         if abs(float(old[0]*direction[1]-old[1]*direction[0])) <= _ROUND_OFF), None)
        if selected is None:
            directions.append(direction)
            families.append({"direction_xy_unit": direction.tolist(), "measurement_object_ids": []})
            selected = len(families)-1
        families[selected]["measurement_object_ids"].append(row["measurement_object_id"])
    singular = np.linalg.svd(vectors / np.max(np.abs(vectors)), compute_uv=False) if len(vectors) else []
    rank_two = bool(len(singular) == 2 and singular[1] > _ROUND_OFF * max(vectors.shape) * singular[0])
    return {"adequate": len(families) >= 2 and rank_two,
            "noncollinear_direction_family_count": len(families), "direction_families": families,
            "normalized_singular_values": list(map(float, singular)),
            "independence_scope": "Noncollinear physical reciprocal directions only; conjugate/Friedel and collinear harmonics do not add independent directions; no held-out validation"}


def _ambiguous(comparison):
    return any(row["ambiguous_within_tolerance"] for row in comparison["ambiguity"])


def _interface(twin_simulation, transform, interface, angular_tolerance):
    result = {"status": "insufficient_evidence", "reason": "No saved physically calibrated interface line was supplied",
              "projection_scope": "Unoriented edge-on trace in orthographic beam +Z projection only",
              "angular_tolerance_degrees": angular_tolerance,
              "atomic_coherence_or_registry_established": False}
    orientation = twin_simulation.get("orientation")
    relation = twin_simulation.get("twin_relation")
    if relation is None and type(orientation) is dict:
        relation = orientation.get("twin_relation")
    if type(relation) is not dict:
        result["reason"] = "The saved twin candidate does not carry its explicit plane-normal relation"
        return result
    normal = np.asarray(relation.get("interface_normal_lab_unit"), dtype=float)
    _need(normal.shape == (3,) and np.isfinite(normal).all() and
          abs(float(np.linalg.norm(normal)) - 1.) <= 2e-12,
          "Twin relation must retain a finite unit laboratory plane normal")
    normal = normal / np.linalg.norm(normal)
    edge_error = math.degrees(math.asin(min(1., abs(float(normal[2])))))
    result.update(candidate_normal_lab_unit=normal.tolist(), edge_on_error_degrees=edge_error,
                  candidate_is_edge_on=edge_error <= angular_tolerance)
    if interface is None:
        return result
    _need(type(interface) is dict, "Interface evidence must be an explicit physical-vector record")
    vector = interface.get("vector_xy_angstrom", interface.get("physical_vector_xy"))
    _need(type(vector) is list and len(vector) == 2 and all(_finite(v) for v in vector) and math.hypot(*vector) > 0,
          "Interface evidence requires a finite nonzero physical XY vector")
    unit = "angstrom" if "vector_xy_angstrom" in interface else interface.get("unit")
    if unit not in ("angstrom", "Å", "A", "nm", "pm", "um", "µm", "μm", "m"):
        result["reason"] = "The interface vector has no explicit supported physical length unit"
        return result
    if interface.get("projection") != "orthographic_beam_plus_z" or not (
            type(interface.get("source_basis")) is str and interface["source_basis"].strip()):
        result["reason"] = "The interface source/projection basis is not explicitly supplied"
        return result
    result["input_interface"] = copy.deepcopy(interface)
    if edge_error > angular_tolerance:
        result["reason"] = "The candidate plane is not edge-on within the declared angular tolerance; a projected line does not resolve its 3D plane"
        return result
    expected = np.asarray([-normal[1], normal[0]])
    if math.hypot(*expected) <= _ROUND_OFF:
        result["reason"] = "The candidate normal is parallel to the beam and has no resolved unoriented trace"
        return result
    expected /= math.hypot(*expected)
    actual = np.asarray(transform["matrix_xy"]) @ np.asarray(vector, dtype=float)
    _need(np.isfinite(actual).all() and math.hypot(*actual) > 0,
          "Shared registration produces no finite interface direction")
    actual /= math.hypot(*actual)
    residual = math.degrees(math.atan2(abs(float(expected[0]*actual[1]-expected[1]*actual[0])),
                                    abs(float(np.dot(expected, actual)))))
    passed = residual <= angular_tolerance
    result.update(status="compatible" if passed else "incompatible",
                  reason="Saved projected line agrees with the conditional edge-on {111} trace" if passed else "Saved projected line disagrees with the conditional edge-on {111} trace",
                  candidate_trace_xy_lab_unit=expected.tolist(), registered_interface_xy_lab_unit=actual.tolist(),
                  unoriented_trace_residual_degrees=residual,
                  registration_scope="Same fixed orthogonal screen mapping as reciprocal evidence; direct-vector map is inverse-transpose, equal to this orthogonal matrix")
    return result


def evaluate(measurements_a, measurements_b, parent_simulation, twin_simulation,
             registration, tolerance, interface=None, angular_tolerance=1.,
             experimental_kind="real_space_fft"):
    """Compare a finite twin candidate with one shared fixed registration.

    Measurements/simulations follow reflection_compare.compare's contracts.
    ``twin_simulation.twin_relation`` or ``orientation.twin_relation`` retains
    orient_candidate's relation. Optional interface is
    {physical_vector_xy: [x,y], unit: 'angstrom',
     projection: 'orthographic_beam_plus_z', source_basis: '...'};
    vector_xy_angstrom may replace physical_vector_xy/unit. The caller validates
    saved line provenance and its common originating source/frame/axis mapping.
    """
    _need(type(measurements_a) is list and type(measurements_b) is list and
          1 <= len(measurements_a) <= 32 and 1 <= len(measurements_b) <= 32,
          "Use one to 32 saved physical reciprocal measurements per domain")
    _need(type(parent_simulation) is dict and type(twin_simulation) is dict,
          "Two separately saved parent/twin simulation records are required")
    transform = validate_registration(registration)
    _need(registration["scale"] == 1 and registration["translation_inv_angstrom"] == [0, 0],
          "Twin comparison fixes independent scale to one and DC translation to zero; domain B is never independently fitted")
    _need(_finite(angular_tolerance) and 0 <= angular_tolerance <= 10,
          "angular_tolerance must be explicit finite degrees in [0,10]")
    parent = compare(measurements_a, parent_simulation, registration, tolerance, experimental_kind)
    twin = compare(measurements_b, twin_simulation, registration, tolerance, experimental_kind)
    control = compare(measurements_b, parent_simulation, registration, tolerance, experimental_kind)
    geometry_a, geometry_b = _independence(measurements_a), _independence(measurements_b)
    distinct_domains = not ({row["object_id"] for row in measurements_a} & {row["object_id"] for row in measurements_b})
    parent_pass = parent["all_experimental_reflections_matched_within_tolerance"]
    twin_pass = twin["all_experimental_reflections_matched_within_tolerance"]
    control_pass = control["all_experimental_reflections_matched_within_tolerance"]
    ambiguous = _ambiguous(parent) or _ambiguous(twin)
    status, reason = "insufficient_evidence", "The selected observations do not establish this bounded candidate relation"
    if not geometry_a["adequate"] or not geometry_b["adequate"]:
        reason = "Each domain requires at least two independent noncollinear physical reciprocal direction families"
    elif not distinct_domains:
        reason = "The same measurement identity cannot establish observations from two domains"
    elif not parent_pass:
        reason = "The supplied parent model/registration does not explain domain A; the twin test lacks its parent anchor"
    elif ambiguous:
        reason = "Multiple in-tolerance reflection assignments remain; no unique correspondence is inferred"
    elif control_pass:
        reason = "The untwinned parent control also explains domain B in this projection; twin and untwinned alternatives are unresolved"
    elif not twin_pass:
        status, reason = "incompatible", "Qualified parent evidence and noncollinear domain B observations disagree with this explicit candidate within the declared reciprocal tolerance"
    else:
        status, reason = "compatible", "Both domains agree with the explicit candidate and domain B is not explained by the fixed untwinned parent control"
    projected = {
        "status": status, "reason": reason, "candidate_status": "hypothesized",
        "domain_a_geometry": geometry_a, "domain_b_geometry": geometry_b,
        "distinct_measurement_identities": distinct_domains,
        "parent_domain_all_selected_reflections_match": parent_pass,
        "twin_domain_all_selected_reflections_match": twin_pass,
        "untwinned_control_all_selected_reflections_match": control_pass,
        "parent_or_twin_assignment_ambiguous": ambiguous,
        "shared_registration": copy.deepcopy(registration),
        "independent_validation": "not_established_by_this_comparison",
        "unique_3d_twin_identification": False,
    }
    interface_result = _interface(twin_simulation, transform, interface, float(angular_tolerance))
    # A conditional trace cannot supply a missing/ambiguous parent anchor. Keep
    # its own result visible, but do not promote unresolved diffraction into a
    # definitive joint incompatibility through that line alone.
    overall = ("insufficient_evidence" if status == "insufficient_evidence" else
               "incompatible" if "incompatible" in (status, interface_result["status"]) else
               "compatible" if status == interface_result["status"] == "compatible" else "insufficient_evidence")
    return {
        "method": "bounded_Sigma3_projected_geometry_with_fixed_untwinned_control",
        "status": overall, "projected_relation": projected, "interface": interface_result,
        "comparisons": {"parent_domain": parent, "twin_domain": twin, "untwinned_control": control},
        "scientific_limits": [
            "Compatibility is conditional on the supplied structure, parent orientation, candidate law, calibration, centre, screen mapping and finite measured scope",
            "A single projection and a 2D angle cannot identify a unique three-dimensional twin relation",
            "An incompatible interface trace does not disprove an otherwise compatible Sigma3 orientation relation",
            "Unselected or missing simulated peaks are retained, not used as a visibility or intensity rejection criterion",
            "No scale, mirror, translation, strain or independent domain-B rotation is fitted",
            "The caller must bind each local FFT ROI and interface line to the same immutable originating source/frame and declared projection",
            "No dynamical scattering, interface scattering, phase fraction, atomic coherence or statistical confidence is inferred",
        ],
        "phase_identified": False, "unique_3d_twin_identification": False,
    }
