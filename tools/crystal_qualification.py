"""Qualification evidence for a supplied atomistic candidate, not phase inference.

Caller must pass already admitted immutable Workspace atoms/provenance/simulation
records. This helper neither opens arbitrary files nor calls a simulator. It does
not alter the historical F3b motif gate or broaden existing simulation admission.
"""
from copy import deepcopy
import hashlib
import io
import math

import numpy as np


VERSION = "general-crystal-qualification-v1"
LIMITS = [
    "Qualification describes the supplied candidate model, not an identified experimental phase.",
    "Space-group declarations are not numerical point-group or motif verification.",
    "No automatic structure/CSL search or twin naming is performed.",
    "Kinematic positions/approximate intensities exclude dynamical scattering and image formation.",
]


def _source(provenance):
    supplied = deepcopy(provenance) if type(provenance) is dict else None
    source = supplied.get("source", supplied) if supplied else {}
    source = source if type(source) is dict else {}
    digest = source.get("sha256")
    hashed = type(digest) is str and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest)
    return {"status": "hash_bound_candidate" if hashed else "insufficient_evidence",
            "source_sha256": digest if hashed else None,
            "format": source.get("format"), "provenance": supplied,
            "experimental_phase_verified": False}


def _symmetry(source, source_bytes):
    result = {"space_group_status": "unknown", "point_group_status": "not_verified",
              "declared_space_group": {}, "space_group_verified": False, "point_group_verified": False,
              "source": "No retained CIF declarations or numerical symmetry verification",
              "cell_standardized": False, "symmetry_search_performed": False}
    if source.get("format") != "cif" or source_bytes is None:
        return result
    # This is original source evidence only, not symmetry of a derived repeat or
    # active Cartesian basis and not an independently verified space group.
    if type(source_bytes) is not bytes or hashlib.sha256(source_bytes).hexdigest() != source["source_sha256"]:
        result.update(space_group_status="source_hash_mismatch", source="CIF declarations not admitted")
        return result
    try:
        from ase.io.cif import parse_cif
        blocks = list(parse_cif(io.BytesIO(source_bytes), reader="ase"))
        if len(blocks) != 1 or not blocks[0].has_structure():
            result.update(space_group_status="insufficient_evidence", source="CIF block contract not admitted")
            return result
        keys = ("_space_group_it_number", "_symmetry_int_tables_number", "_space_group_name_h-m_alt",
                "_symmetry_space_group_name_h-m", "_space_group_name_hall", "_symmetry_space_group_name_hall")
        declared = {key: blocks[0].get(key) for key in keys if blocks[0].get(key) is not None}
        # ASE's parsed tags are scalar str/int in this scope; retaining a strange
        # tag as a verified group would be stronger than the parser establishes.
        if not all(type(value) in (str, int) and not isinstance(value, bool) for value in declared.values()):
            result.update(space_group_status="insufficient_evidence", source="Unqualified declaration type")
            return result
        result.update(declared_space_group=declared, space_group_status="declared_not_verified" if declared else "unknown",
                      source="Hash-bound original CIF tags parsed by ASE; not a point-group/motif test")
    except (ValueError, TypeError, KeyError, IndexError, StopIteration):
        result.update(space_group_status="insufficient_evidence", source="Original CIF declarations not recoverable")
    return result


def _occupancy(atoms):
    occupancy = atoms.info.get("occupancy")
    if occupancy is None or (type(occupancy) is dict and not occupancy):
        return {"status": "full_sites_as_supplied", "qualified_ordered_model": True,
                "source": "Explicit atom list; no disorder metadata retained. Not independent occupancy measurement.",
                "metadata": deepcopy(occupancy)}
    qualified = type(occupancy) is dict and bool(occupancy) and all(
        type(row) is dict and len(row) == 1 and all(type(v) in (int, float) and math.isfinite(v) and v == 1.
                                                 for v in row.values()) for row in occupancy.values())
    return {"status": "explicit_full_occupancy" if qualified else "mixed_partial_or_invalid",
            "qualified_ordered_model": qualified,
            "source": "ASE occupancy metadata; mixed sites are not reduced to their dominant displayed symbol",
            "metadata": deepcopy(occupancy)}


def _certificate(simulation):
    if type(simulation) is not dict:
        return False
    certificate = simulation.get("reciprocal_enumeration", {})
    if type(certificate) is not dict or certificate.get("completeness_certified") is not True:
        return False
    observed, required = certificate.get("library_integer_extents_hkl"), certificate.get("required_integer_extents_hkl")
    return (type(observed) is list and type(required) is list and len(observed) == len(required) == 3 and
            all(type(a) is int and type(b) is int and a >= b >= 0 for a, b in zip(observed, required)))


def qualify_structure(atoms, *, source_provenance=None, source_bytes=None, simulation=None):
    """Return stable, JSON-ready, separate source/site/cell/symmetry qualifications.

    ``source_bytes`` is optional hash-bound original CIF evidence; it is never
    fetched here. ``simulation`` must be an actual admitted saved simulation,
    not a hypothetical dict produced by a caller. Its existing certificate is
    necessary; this helper cannot qualify an unexecuted numerical engine.
    Full ordered multi-element models need no FCC/diamond motif assumption.
    """
    source = _source(source_provenance)
    positions, cell, numbers = np.asarray(atoms.positions), np.asarray(atoms.cell.array), np.asarray(atoms.numbers)
    finite_positions = bool(positions.ndim == 2 and positions.shape[1:] == (3,) and np.isfinite(positions).all())
    finite_cell = bool(cell.shape == (3, 3) and np.isfinite(cell).all())
    rank = int(np.linalg.matrix_rank(cell)) if finite_cell else None
    condition = float(np.linalg.cond(cell)) if rank == 3 else None
    if condition is not None and not math.isfinite(condition):
        condition = None
    periodic = bool(np.all(atoms.pbc))
    valid_sites = 1 <= len(atoms) <= 4096 and finite_positions and bool(np.all(numbers > 0))
    geometry = finite_cell and rank == 3 and condition is not None and condition <= 1e6
    occupancy = _occupancy(atoms)
    reasons = []
    for admitted, reason in ((source["status"] == "hash_bound_candidate", "missing_hash_bound_structure_source"),
                             (valid_sites, "invalid_or_unknown_atomic_sites"),
                             (geometry, "missing_singular_or_ill_conditioned_3d_cell"),
                             (periodic, "three_dimensional_periodicity_not_explicit"),
                             (occupancy["qualified_ordered_model"], "mixed_partial_or_invalid_occupancy")):
        if not admitted:
            reasons.append(reason)
    if simulation is None:
        status = "not_executed" if not reasons else "unsupported_or_insufficient"
    else:
        if simulation.get("kind") != "simulate" or simulation.get("software_provenance", {}).get("diffsims") != "0.7.0":
            reasons.append("not_an_admitted_pinned_diffsim_simulation")
        if not _certificate(simulation):
            reasons.append("missing_or_invalid_existing_enumeration_certificate")
        status = "qualified_saved_kinematic_model" if not reasons else "unsupported_or_insufficient"
    return {"qualification_version": VERSION, "source": source,
            "sites": {"status": "valid_candidate_sites" if valid_sites else "insufficient_evidence",
                      "atom_count": len(atoms), "elements": sorted(set(atoms.get_chemical_symbols())),
                      "finite_positions": finite_positions, "all_elements_known": bool(np.all(numbers > 0)),
                      "basis_chemistry_verified": False},
            "cell": {"status": "qualified_reciprocal_geometry" if geometry else "insufficient_evidence",
                     "rank": rank, "condition_number": condition, "pbc": [bool(v) for v in atoms.pbc],
                     "full_3d_periodic": periodic, "cell_angstrom": cell.tolist() if finite_cell else None,
                     "reciprocal_convention": "cycles_per_angstrom_no_2pi", "standardized": False},
            "occupancy": occupancy, "symmetry": _symmetry(source, source_bytes),
            "kinematic_simulation": {"status": status, "reasons": reasons,
                                     "executed_saved_simulation": simulation is not None,
                                     "simulation_object_id": simulation.get("object_id") if simulation else None,
                                     "enumeration": deepcopy(simulation.get("reciprocal_enumeration")) if simulation else None,
                                     "does_not_broaden_existing_engine_gates": True},
            "limits": list(LIMITS), "phase_identified": False, "twin_law_tested": False}
