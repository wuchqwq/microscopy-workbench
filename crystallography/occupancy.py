"""Versioned site fractions for supplied candidates, not sample chemistry.

New snapshots retain each site's species fractions. The existing simulator and
twin scope admit only full ordered sites. Legacy snapshots remain readable but
cannot acquire a current occupancy certificate by being loaded again.
"""
from copy import deepcopy
import math

import numpy as np
from ase.data import atomic_numbers


class OccupancyError(ValueError):
    def __init__(self, message, code="INVALID_OCCUPANCY"):
        super().__init__(message)
        self.code = code


def require(condition, message, code="INVALID_OCCUPANCY"):
    if not condition:
        raise OccupancyError(message, code)


def version(atoms):
    return getattr(atoms, "_workbench_atom_model_version", 2)


def require_current(atoms):
    require(version(atoms) == 2,
            "Legacy atom snapshots did not preserve all site occupancy channels. "
            "Read the historical result unchanged, or explicitly reopen its retained original source "
            "and repeat the declared derivations under a new request ID.", "LEGACY_OCCUPANCY_UNQUALIFIED")


def _fraction(value):
    require(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1,
            "Each occupancy must be a finite real fraction in [0,1]; unknown tokens/bools are unsupported")
    return float(value)


def normalize(atoms):
    """Resolve supported ASE channels; never prefer one conflicting channel."""
    symbols = atoms.get_chemical_symbols()
    n = len(symbols)
    arrays = {}
    for name in ("occupancy", "occupancies"):
        if name in atoms.arrays:
            values = np.asarray(atoms.arrays[name])
            require(values.shape == (n,) and values.dtype.kind in "iuf",
                    "Per-site occupancy arrays require one real non-boolean number per atom")
            arrays[name] = [_fraction(v) for v in values.tolist()]
    if len(arrays) == 2:
        require(arrays["occupancy"] == arrays["occupancies"], "Conflicting occupancy array aliases")
    channels = [name + "_array" for name in arrays]
    mapping = "none"
    sites = None
    if "occupancy" in atoms.info:
        info = atoms.info["occupancy"]
        require(type(info) is dict and 0 < len(info) <= 4096 and
                all(type(k) is str and len(k) <= 8 and k.isascii() and k.isdigit() and str(int(k)) == k for k in info),
                "Occupancy info needs a nonempty bounded dictionary of canonical site/kind indices")
        if "spacegroup_kinds" in atoms.arrays:
            kinds = np.asarray(atoms.arrays["spacegroup_kinds"])
            require(kinds.shape == (n,) and kinds.dtype.kind in "iu" and bool(np.all(kinds >= 0)),
                    "CIF occupancy requires one nonnegative integer spacegroup kind per atom")
            indices, mapping = kinds.tolist(), "spacegroup_kinds"
        else:
            indices, mapping = list(range(n)), "site_indices"
        require(set(info) == {str(i) for i in indices},
                "Occupancy info does not exactly cover the declared site/kind mapping")
        sites = []
        for symbol, index in zip(symbols, indices):
            row = info[str(index)]
            require(type(row) is dict and 0 < len(row) <= 118 and
                    all(type(s) is str and s in atomic_numbers and atomic_numbers[s] > 0 for s in row),
                    "Occupancy species must be known chemical elements")
            fractions = {s: _fraction(v) for s, v in row.items()}
            require(symbol in fractions, "Occupancy species conflicts with the displayed atomic species")
            require(math.fsum(fractions.values()) <= 1, "Species fractions at one site exceed one")
            sites.append(fractions)
        channels.append("info_occupancy")
    if arrays:
        values = next(iter(arrays.values()))
        from_array = [{symbol: value} for symbol, value in zip(symbols, values)]
        require(sites is None or sites == from_array,
                "Scalar site occupancy and species occupancy info disagree or have ambiguous mixed-site meaning")
        sites = from_array
    if sites is None:
        sites = [{symbol: 1.} for symbol in symbols]
    return {"sites": sites, "version": 1,
            "basis": "explicit_site_metadata" if channels else "ideal_atom_list_without_disorder_metadata",
            "source_channels": channels, "source_info_mapping": mapping}


def initialize(atoms, *, inherited=None):
    """Canonicalize a fresh parse/explicit derived v2 model, preserving fractions.

    ASE repeats spacegroup_kinds alongside atoms; normalization resolves that
    mapping before replacing it with the expanded site's identity mapping.
    """
    model = normalize(atoms)
    if inherited is not None:
        model.update(deepcopy(inherited))
    sites = model.pop("sites")
    atoms.info["occupancy"] = {str(i): row for i, row in enumerate(sites)}
    for name in ("occupancy", "occupancies"):
        if name in atoms.arrays:
            del atoms.arrays[name]
    atoms.set_array("spacegroup_kinds", np.arange(len(atoms), dtype=int))
    atoms._workbench_atom_model_version = 2
    atoms._workbench_occupancy_model = model
    return atoms


def snapshot_fields(atoms):
    require_current(atoms)
    model = normalize(atoms)
    sites = model.pop("sites")
    metadata = deepcopy(getattr(atoms, "_workbench_occupancy_model", model))
    return {"atom_model_version": 2,
            "occupancy": {str(i): row for i, row in enumerate(sites)}, "occupancy_model": metadata}


def restore(atoms, data):
    policy = data.get("atom_model_version", 1)
    require(type(policy) is int and policy in (1, 2), "Unsupported atom model version", "CORRUPT_OBJECT")
    atoms._workbench_atom_model_version = policy
    if policy == 1:
        require("atom_model_version" not in data, "Historical v1 snapshots have no version field", "CORRUPT_OBJECT")
        require("occupancy_model" not in data, "Unversioned occupancy model", "CORRUPT_OBJECT")
        return atoms
    metadata = data.get("occupancy_model")
    require(type(metadata) is dict and set(metadata) == {"version", "basis", "source_channels", "source_info_mapping"} and
            type(metadata["version"]) is int and metadata["version"] == 1 and
            metadata["basis"] in ("explicit_site_metadata", "ideal_atom_list_without_disorder_metadata") and
            type(metadata["source_channels"]) is list and len(metadata["source_channels"]) <= 3 and
            all(type(s) is str and s in ("occupancy_array", "occupancies_array", "info_occupancy") for s in metadata["source_channels"]) and
            len(set(metadata["source_channels"])) == len(metadata["source_channels"]) and
            metadata["source_info_mapping"] in ("none", "spacegroup_kinds", "site_indices"),
            "Invalid canonical occupancy model metadata", "CORRUPT_OBJECT")
    require((metadata["basis"] == "explicit_site_metadata") == bool(metadata["source_channels"]),
            "Occupancy basis differs from its declared source channels", "CORRUPT_OBJECT")
    require(("info_occupancy" in metadata["source_channels"]) == (metadata["source_info_mapping"] != "none"),
            "Occupancy source mapping differs from its channels", "CORRUPT_OBJECT")
    require(type(data.get("occupancy")) is dict and set(data["occupancy"]) == {str(i) for i in range(len(atoms))},
            "Canonical occupancy must retain every expanded site", "CORRUPT_OBJECT")
    atoms.set_array("spacegroup_kinds", np.arange(len(atoms), dtype=int))
    normalize(atoms)
    if metadata["basis"] == "ideal_atom_list_without_disorder_metadata":
        require(all(data["occupancy"][str(i)] == {s: 1.} for i, s in enumerate(atoms.get_chemical_symbols())),
                "Implicit ideal atom list cannot claim explicit partial/mixed fractions", "CORRUPT_OBJECT")
    atoms._workbench_occupancy_model = deepcopy(metadata)
    return atoms


def assessment(atoms):
    require_current(atoms)
    fields = snapshot_fields(atoms)
    sites = fields["occupancy"]
    full = all(row == {symbol: 1.} for row, symbol in zip(sites.values(), atoms.get_chemical_symbols()))
    return {"policy_version": 2, "atom_model_version": 2,
            "status": "full_ordered_candidate" if full else "partial_or_mixed_candidate",
            "qualified_ordered_model": full, "basis": fields["occupancy_model"]["basis"],
            "source_channels": fields["occupancy_model"]["source_channels"],
            "experimental_occupancy_verified": False}


def require_full(atoms):
    result = assessment(atoms)
    require(result["qualified_ordered_model"],
            "Partial/mixed site fractions are preserved for geometry and viewing, but are outside "
            "the current full ordered simulation/twin scope", "UNQUALIFIED_OCCUPANCY")
    return result
