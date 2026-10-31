"""Independent metric cases and explicit model-admission negatives.

Saved-simulation-shaped dictionaries below test admission logic only; they are
not substitutes for the separate actual diffsims/MCP acceptance.
"""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import sys
import unittest

import numpy as np
from ase import Atoms

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.crystal_qualification import qualify_structure
from crystallography.structure_tools import measure


def source(raw=b"public analytic supplied atomistic candidate", fmt="xyz"):
    return {"status": "fixed_source_and_verified_derivations", "source": {
        "sha256": hashlib.sha256(raw).hexdigest(), "format": fmt, "fixed_input_copy": True},
        "derivation_chain": []}


def simulation_fixture():
    return {"object_id": "a"*32, "kind": "simulate", "software_provenance": {"diffsims": "0.7.0"},
            "reciprocal_enumeration": {"completeness_certified": True,
                                      "library_integer_extents_hkl": [2, 2, 2],
                                      "required_integer_extents_hkl": [1, 1, 1]}}


def bcc():
    return Atoms("Fe2", scaled_positions=[[0,0,0], [.5,.5,.5]], cell=np.eye(3)*3.0, pbc=True)


def hcp():
    a, c = 3., 5.
    return Atoms("Mg2", scaled_positions=[[0,0,0], [2/3,1/3,.5]],
                 cell=[[a,0,0],[-a/2,math.sqrt(3)*a/2,0],[0,0,c]],pbc=True)


class Qualification(unittest.TestCase):
    def qualify(self, atoms, **kwargs):
        result = qualify_structure(atoms, source_provenance=source(), **kwargs)
        json.dumps(result, allow_nan=False)
        return result

    def test_explicit_fcc_model_has_geometry_without_claiming_new_scattering_execution(self):
        atoms = Atoms("Cu4", scaled_positions=[[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]],
                      cell=np.eye(3)*4.,pbc=True)
        self.assertAlmostEqual(measure(atoms,{"kind":"d_spacing","hkls":[[1,1,1]]})["value"],4/math.sqrt(3),places=12)
        result = self.qualify(atoms)
        self.assertEqual(result["cell"]["status"],"qualified_reciprocal_geometry")
        self.assertEqual(result["kinematic_simulation"]["status"],"not_executed")
        self.assertFalse(result["symmetry"]["space_group_verified"])

    def test_bcc_metric_and_unverified_symmetry_are_separate(self):
        atoms = bcc()
        self.assertAlmostEqual(measure(atoms, {"kind":"d_spacing", "hkls":[[1,1,0]]})["value"], 3/math.sqrt(2), places=12)
        result = self.qualify(atoms, simulation=simulation_fixture())
        self.assertEqual(result["cell"]["status"], "qualified_reciprocal_geometry")
        self.assertEqual(result["kinematic_simulation"]["status"], "qualified_saved_kinematic_model")
        self.assertEqual(result["symmetry"]["space_group_status"], "unknown")
        self.assertFalse(result["symmetry"]["space_group_verified"])
        self.assertFalse(result["twin_law_tested"])

    def test_hcp_nonorthogonal_metric_matches_independent_formula(self):
        atoms = hcp()
        for hkl, expected in (([1,0,0],math.sqrt(3)*3/2),([0,0,2],2.5),([1,1,0],1.5)):
            with self.subTest(hkl=hkl):
                actual = measure(atoms, {"kind":"d_spacing", "hkls":[hkl]})["value"]
                self.assertAlmostEqual(actual, expected, places=12)
        result = self.qualify(atoms, simulation=simulation_fixture())
        self.assertEqual(result["cell"]["rank"], 3)
        self.assertEqual(result["kinematic_simulation"]["status"], "qualified_saved_kinematic_model")
        self.assertFalse(result["symmetry"]["point_group_verified"])

    def test_ordered_multielement_model_is_not_forced_through_fcc_motif(self):
        atoms = Atoms("NiAl", scaled_positions=[[0,0,0],[.5,.5,.5]],cell=np.eye(3)*2.9,pbc=True)
        atoms.info["occupancy"] = {"0":{"Ni":1.},"1":{"Al":1.}}
        result = self.qualify(atoms, simulation=simulation_fixture())
        self.assertEqual(result["sites"]["elements"], ["Al", "Ni"])
        self.assertEqual(result["occupancy"]["status"], "explicit_full_occupancy")
        self.assertEqual(result["kinematic_simulation"]["status"], "qualified_saved_kinematic_model")
        self.assertAlmostEqual(measure(atoms,{"kind":"d_spacing","hkls":[[1,0,0]]})["value"],2.9,places=12)
        self.assertFalse(result["phase_identified"])

    def test_simulation_is_not_claimed_from_geometry_or_symbols_only(self):
        result = self.qualify(bcc())
        self.assertEqual(result["kinematic_simulation"]["status"],"not_executed")
        self.assertFalse(result["kinematic_simulation"]["executed_saved_simulation"])
        self.assertFalse(result["sites"]["basis_chemistry_verified"])

    def test_mixed_partial_and_invalid_occupancy_refuse_simulation_not_viewing(self):
        for occupancy in ({"0":{"Ni":.5,"Al":.5}}, {"0":{"Fe":.9}}, {"0":{"Fe":True}}, [1.], [], 0, ""):
            with self.subTest(occupancy=occupancy):
                atoms = bcc();atoms.info["occupancy"] = occupancy
                result = self.qualify(atoms, simulation=simulation_fixture())
                self.assertEqual(result["kinematic_simulation"]["status"], "unsupported_or_insufficient")
                self.assertIn("mixed_partial_or_invalid_occupancy",result["kinematic_simulation"]["reasons"])
                self.assertEqual(result["cell"]["status"], "qualified_reciprocal_geometry")
                self.assertEqual(result["sites"]["status"], "valid_candidate_sites")

    def test_no_cell_or_partial_pbc_does_not_invent_periodicity(self):
        for atoms in (Atoms("C2",positions=[[0,0,0],[1,0,0]]),
                      Atoms("C2",positions=[[0,0,0],[1,0,0]],cell=np.eye(3),pbc=[True,True,False])):
            with self.subTest(cell=atoms.cell.array.tolist()):
                result = self.qualify(atoms, simulation=simulation_fixture())
                self.assertEqual(result["kinematic_simulation"]["status"], "unsupported_or_insufficient")
                self.assertEqual(result["sites"]["status"], "valid_candidate_sites")
                self.assertFalse(result["cell"]["full_3d_periodic"])

    def test_singular_and_ill_conditioned_cells_do_not_qualify_metric(self):
        for cell in ([[1,0,0],[2,0,0],[0,0,1]], np.diag([1,1,1e-8])):
            atoms = Atoms("Fe",positions=[[0,0,0]],cell=cell,pbc=True)
            result = self.qualify(atoms, simulation=simulation_fixture())
            self.assertEqual(result["cell"]["status"], "insufficient_evidence")
            self.assertIn("missing_singular_or_ill_conditioned_3d_cell",result["kinematic_simulation"]["reasons"])

    def test_unknown_element_cannot_supply_atomic_scattering(self):
        atoms = Atoms("X", positions=[[0,0,0]],cell=np.eye(3)*3,pbc=True)
        result = self.qualify(atoms,simulation=simulation_fixture())
        self.assertFalse(result["sites"]["all_elements_known"])
        self.assertIn("invalid_or_unknown_atomic_sites",result["kinematic_simulation"]["reasons"])

    def test_source_and_enumeration_must_be_supplied_not_guessed(self):
        result = qualify_structure(bcc(), simulation=simulation_fixture())
        self.assertEqual(result["source"]["status"], "insufficient_evidence")
        self.assertIn("missing_hash_bound_structure_source",result["kinematic_simulation"]["reasons"])
        for mutate in (lambda v:v.pop("reciprocal_enumeration"),
                       lambda v:v["reciprocal_enumeration"].update(completeness_certified=False),
                       lambda v:v["reciprocal_enumeration"].update(library_integer_extents_hkl=[0,2,2]),
                       lambda v:v["software_provenance"].update(diffsims="unknown")):
            saved = simulation_fixture();mutate(saved)
            denied = self.qualify(bcc(),simulation=saved)
            self.assertEqual(denied["kinematic_simulation"]["status"], "unsupported_or_insufficient")

    def test_declared_cif_group_is_not_verified_point_symmetry(self):
        raw = b'''data_reference
_cell_length_a 3
_cell_length_b 3
_cell_length_c 3
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_symmetry_Int_Tables_number 229
loop_
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Fe 0 0 0
'''
        result = qualify_structure(bcc(),source_provenance=source(raw,"cif"),source_bytes=raw)
        self.assertEqual(result["symmetry"]["space_group_status"], "declared_not_verified")
        self.assertEqual(result["symmetry"]["declared_space_group"]["_symmetry_int_tables_number"],229)
        self.assertFalse(result["symmetry"]["space_group_verified"])
        self.assertFalse(result["symmetry"]["point_group_verified"])
        tampered = qualify_structure(bcc(),source_provenance=source(raw,"cif"),source_bytes=raw+b"\n")
        self.assertEqual(tampered["symmetry"]["space_group_status"], "source_hash_mismatch")
        absent = qualify_structure(bcc(),source_provenance=source(raw,"cif"))
        self.assertEqual(absent["symmetry"]["space_group_status"], "unknown")


if __name__ == "__main__":
    unittest.main()
