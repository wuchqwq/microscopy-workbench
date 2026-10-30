"""Independent cubic Sigma3 geometry, controls and exact-bin image fixtures.

Expected matrices, indices and q are hand-defined in a fixture with no imports
from the production solver or diffraction simulator. Simulation-shaped tables
below are analytic numerical inputs, not claims of a real diffsims execution.
Saved-journal/source integrity belongs to separate provider integration tests.
"""
import copy
import itertools
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile
from ase import Atoms
from ase.io import read as ase_read

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT/"tests"/"fixtures"/"twin_f3b"))
import create_fixture as fixture
from crystallography import twin_geometry as twin
from crystallography.orientation import from_zone_axis


TOL = fixture.TOLERANCES["chosen_vector_admission_inv_angstrom"]
ATOL = fixture.TOLERANCES["matrix_absolute"]
REGISTRATION = {"rotation_deg": 0., "scale": 1., "translation_inv_angstrom": [0., 0.],
                "flip_y": False, "basis": "Declared synthetic common laboratory frame; no fitting"}
INTERFACE = {"physical_vector_xy": [10., 0.], "unit": "angstrom",
             "projection": "orthographic_beam_plus_z",
             "source_basis": "Same public synthetic source frame and its signed XY calibration"}


def atoms(model="FCC"):
    basis = fixture.FCC_BASIS if model == "FCC" else fixture.DIAMOND_BASIS
    return Atoms(["Cu" if model == "FCC" else "C"]*len(basis),
                 scaled_positions=basis, cell=np.eye(3)*fixture.A_ANGSTROM, pbc=True)


def orientation(beam111=False):
    if beam111:
        return from_zone_axis(np.eye(3)*4, [1, 1, 1], [1, -1, 0])
    return from_zone_axis(np.eye(3)*4, [1, -1, 0], [1, 1, -2])


def antipodal(vectors):
    return np.concatenate([np.asarray(vectors, dtype=float), -np.asarray(vectors, dtype=float)])


def measurement_rows(q, prefix=1, friedel=True):
    """Satisfy the existing physical measurement contract without journal claims."""
    record = {"calibration_id": "a"*32, "revision": 1, "status": "active",
              "source": "user_statement_not_independently_verified", "coordinate_domain": "real_space",
              "xy_scale": {"x": 4*math.sqrt(6)/128, "y": -4*math.sqrt(3)/128, "unit": "angstrom"}}
    dep = {key: record[key] for key in ("calibration_id", "revision", "status", "source", "coordinate_domain")}
    values = antipodal(q) if friedel else np.asarray(q)
    rows = []
    for i, value in enumerate(values):
        frequency = [float(value[j]*record["xy_scale"][axis]) for j, axis in enumerate(("x", "y"))]
        vector = [frequency[j]/record["xy_scale"][axis] for j, axis in enumerate(("x", "y"))]
        rows.append({"object_id": f"{prefix*100+i:032x}", "request_id": f"analytic-{prefix}-{i}",
                     "source_object_id": f"{prefix:032x}", "measurement_domain": "reciprocal_space",
                     "coordinate_space": "frequency_cycles_per_pixel", "points": [[0, 0], frequency],
                     "dc_reference_point_index": 0, "physical_vector_xy": vector,
                     "physical_frequency_unit": "cycles/angstrom", "xy_calibration": copy.deepcopy(record),
                     "calibration_dependency": copy.deepcopy(dep)})
    return rows


def simulation(q, hkls, orient, relation=None):
    """Analytic reflection-table input; no diffraction/intensity validation."""
    vectors = antipodal(q)
    indices = list(hkls)+[[-v for v in row] for row in hkls]
    result = {"orientation": orient, "reflections": {
        "coordinates_inv_angstrom": [[float(x), float(y), 0.] for x, y in vectors],
        "hkl": indices, "kinematic_intensity": [float(i+1) for i in range(len(vectors))],
        "coordinates_frame": "rotated laboratory xyz; beam +z; raster columns +x, rows +y",
        "reciprocal_convention": "cycles_per_angstrom_no_2pi"}}
    if relation is not None:
        result["twin_relation"] = relation
    return result


def cases(beam111=False):
    parent = orientation(beam111)
    candidate = twin.orient_candidate(atoms(), parent, [1, 1, 1])
    if beam111:
        # Complete hexagonal {220} ring, with a different indexing permutation
        # under the child. Its unordered 2D set also equals the identity set.
        q = np.array([[2*math.sqrt(2), 0.], [math.sqrt(2), math.sqrt(6)],
                      [-math.sqrt(2), math.sqrt(6)]])/4
        hkls = [[2, -2, 0], [2, 0, -2], [0, 2, -2]]
        child_hkls = [[0, -2, 2], [2, -2, 0], [2, 0, -2]]
        return (measurement_rows(q, 1), measurement_rows(q, 2),
                simulation(q, hkls, parent),
                simulation(q, child_hkls, candidate["orientation"], candidate["twin_relation"]))
    qa, qb = fixture.PARENT_QA/4, fixture.CHILD_QA/4
    return (measurement_rows(qa, 1), measurement_rows(qb, 2),
            simulation(qa, fixture.PARENT_HKLS, parent),
            simulation(qb, fixture.CHILD_HKLS, candidate["orientation"], candidate["twin_relation"]))


class IndependentCubicTwinGeometry(unittest.TestCase):
    def evaluate(self, *args, **kwargs):
        return twin.evaluate(*args, registration=REGISTRATION, tolerance=TOL,
                             interface=kwargs.pop("interface", INTERFACE), angular_tolerance=1., **kwargs)

    def test_hardcoded_proper_matrices_and_allowed_reflection_truth(self):
        np.testing.assert_allclose(orientation()["rotation_matrix_cartesian"], fixture.PARENT_MATRIX,
                                   atol=ATOL, rtol=0)
        for matrix in (fixture.PARENT_MATRIX, fixture.CHILD_MATRIX, fixture.TWIN_MATRIX):
            np.testing.assert_allclose(matrix@matrix.T, np.eye(3), atol=ATOL, rtol=0)
            self.assertAlmostEqual(np.linalg.det(matrix), 1., places=12)
        np.testing.assert_allclose(fixture.PARENT_MATRIX@fixture.TWIN_MATRIX, fixture.CHILD_MATRIX,
                                   atol=ATOL, rtol=0)
        for matrix, indices, expected in ((fixture.PARENT_MATRIX, fixture.PARENT_HKLS, fixture.PARENT_QA),
                                           (fixture.CHILD_MATRIX, fixture.CHILD_HKLS, fixture.CHILD_QA)):
            projected = np.asarray(indices)@matrix.T
            np.testing.assert_allclose(projected[:, :2], expected, atol=ATOL, rtol=0)
            np.testing.assert_allclose(projected[:, 2], 0, atol=ATOL, rtol=0)
            # FCC parity plus diamond's all-even h+k+l=4n rule; odd allowed.
            for h, k, l in indices:
                self.assertTrue((h % 2 == k % 2 == l % 2 == 1) or
                                (h % 2 == k % 2 == l % 2 == 0 and (h+k+l) % 4 == 0))

    def test_explicit_fcc_and_diamond_qualification_and_orientation(self):
        for model in ("FCC", "diamond_cubic"):
            with self.subTest(model=model):
                reference = atoms("FCC" if model == "FCC" else "diamond")
                source = reference.positions.copy(), reference.cell.array.copy()
                qualified = twin.qualify(reference)
                self.assertEqual(qualified["model"], model)
                self.assertTrue(qualified["basis_qualified"])
                self.assertTrue(qualified["inversion_qualified"])
                candidate = twin.orient_candidate(reference, orientation(), [1, 1, 1])
                np.testing.assert_allclose(candidate["orientation"]["rotation_matrix_cartesian"],
                                           fixture.CHILD_MATRIX, atol=ATOL, rtol=0)
                np.testing.assert_array_equal(reference.positions, source[0])
                np.testing.assert_array_equal(reference.cell.array, source[1])

    def test_exact_positive_coherent111_keeps_relation_hypothesized(self):
        values = cases()
        result = self.evaluate(*values)
        self.assertEqual(result["projected_relation"]["status"], "compatible")
        self.assertEqual(result["interface"]["status"], "compatible")
        self.assertEqual(result["status"], "compatible")
        self.assertNotEqual(result.get("interpretation_status"), "confirmed")
        self.assertFalse(result.get("phase_identified", False))

    def test_ordinary_40deg_grain_boundary_is_incompatible(self):
        a, _, parent, child = cases()
        angle = math.radians(40)
        rotation = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]])
        b = measurement_rows(fixture.PARENT_QA@rotation.T/4, 2)
        result = self.evaluate(a, b, parent, child)
        self.assertEqual(result["projected_relation"]["status"], "incompatible")
        self.assertEqual(result["status"], "incompatible")

    def test_40deg_negative_far_from_all_cubic_sigma3_equivalents(self):
        # A fully independent 24-element proper signed-permutation calculation.
        rotations = []
        for permutation in itertools.permutations(range(3)):
            for signs in itertools.product((-1, 1), repeat=3):
                matrix = np.zeros((3, 3))
                for row in range(3):
                    matrix[row, permutation[row]] = signs[row]
                if round(np.linalg.det(matrix)) == 1:
                    rotations.append(matrix)
        self.assertEqual(len(rotations), 24)
        angle = math.radians(40)
        rz = np.array([[math.cos(angle), -math.sin(angle), 0.],
                       [math.sin(angle), math.cos(angle), 0.], [0., 0., 1.]])
        ordinary = fixture.PARENT_MATRIX.T@rz@fixture.PARENT_MATRIX
        distances = [math.degrees(math.acos(float(np.clip((np.trace((left@fixture.TWIN_MATRIX@right).T@ordinary)-1)/2, -1, 1))))
                     for left in rotations for right in rotations]
        self.assertAlmostEqual(min(distances), 30.528779365509298, places=10)

    def test_beam111_hexagon_is_identical_for_identity_and_twin(self):
        a, b, parent, child = cases(True)
        angle = math.pi/3
        rotation = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]])
        ring = np.array(parent["reflections"]["coordinates_inv_angstrom"])[:, :2]
        self.assertLess(np.max(np.min(np.linalg.norm(ring[:, None, :]@rotation.T-ring[None, :, :], axis=2), axis=1)), 2e-12)
        result = self.evaluate(a, b, parent, child, interface=None)
        self.assertEqual(result["projected_relation"]["status"], "insufficient_evidence")
        self.assertEqual(result["status"], "insufficient_evidence")
        # An arbitrary drawn line cannot restore a trace when n_parallel=0.
        with_trace = self.evaluate(a, b, parent, child)
        self.assertEqual(with_trace["interface"]["status"], "insufficient_evidence")
        self.assertEqual(with_trace["status"], "insufficient_evidence")

    def test_wrong_trace_does_not_erase_compatible_reflection_relation(self):
        wrong = {**INTERFACE, "physical_vector_xy": [0., -10.]}
        result = self.evaluate(*cases(), interface=wrong)
        self.assertEqual(result["projected_relation"]["status"], "compatible")
        self.assertEqual(result["interface"]["status"], "incompatible")
        self.assertEqual(result["status"], "incompatible")
        no_trace = self.evaluate(*cases(), interface=None)
        self.assertEqual(no_trace["projected_relation"]["status"], "compatible")
        self.assertEqual(no_trace["interface"]["status"], "insufficient_evidence")

    def test_symmetry_equivalent_child_hkl_labels_preserve_same_relation(self):
        a, b, parent, child = cases()
        c120 = np.array([[0, 0, 1], [1, 0, 0], [0, 1, 0]])
        equivalent = copy.deepcopy(child)
        equivalent["orientation"]["rotation_matrix_cartesian"] = (fixture.CHILD_MATRIX@c120).tolist()
        equivalent["reflections"]["hkl"] = (np.asarray(child["reflections"]["hkl"])@c120).tolist()
        # q is unchanged because O_B C C^T h_B=O_B h_B, no extra evidence.
        expected = np.asarray(equivalent["reflections"]["hkl"])@(fixture.CHILD_MATRIX@c120).T/4
        np.testing.assert_allclose(expected, child["reflections"]["coordinates_inv_angstrom"], atol=ATOL, rtol=0)
        result = self.evaluate(a, b, parent, equivalent)
        self.assertEqual(result["projected_relation"]["status"], "compatible")

    def test_friedel_partners_do_not_make_one_direction_sufficient(self):
        a, b, parent, child = cases()
        one_a = [a[0], a[4]]
        one_b = [b[0], b[4]]
        result = self.evaluate(one_a, one_b, parent, child)
        self.assertEqual(result["projected_relation"]["status"], "insufficient_evidence")
        self.assertEqual(result["status"], "insufficient_evidence")
        # Reversing every selected sign must preserve full valid evidence.
        reversed_signs = self.evaluate(a[4:]+a[:4], b[4:]+b[:4], parent, child)
        self.assertEqual(reversed_signs["status"], "compatible")

    def test_missing_calibration_and_fixed_registration_refusals(self):
        a, b, parent, child = cases()
        missing = copy.deepcopy(a)
        for row in missing:
            row.pop("xy_calibration")
        # No inferred scale, cell fitting or conversion of absent evidence.
        try:
            result = self.evaluate(missing, b, parent, child)
        except ValueError:
            pass  # A typed input refusal is also evidence-preserving.
        else:
            self.assertEqual(result["status"], "insufficient_evidence")
        for change in ({"scale": 1.01}, {"translation_inv_angstrom": [.01, 0.]}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                twin.evaluate(a, b, parent, child, {**REGISTRATION, **change}, TOL, INTERFACE)

    def test_declared_shared_screen_parity_is_applied_to_both_domains(self):
        a, b, parent, child = cases()
        qa = fixture.PARENT_QA/4*np.array([1., -1.])
        qb = fixture.CHILD_QA/4*np.array([1., -1.])
        parity = {**REGISTRATION, "flip_y": True,
                  "basis": "Explicit common screen +Y down maps to laboratory +Y up"}
        result = twin.evaluate(measurement_rows(qa, 1), measurement_rows(qb, 2), parent, child,
                               parity, TOL, INTERFACE)
        self.assertEqual(result["status"], "compatible")

    def test_unsupported_basis_cell_and_plane_are_refused(self):
        bad = [Atoms("Cu2", scaled_positions=[[0, 0, 0], [.5, .5, .5]], cell=np.eye(3)*4, pbc=True),
               Atoms("Cu", scaled_positions=[[0, 0, 0]], cell=np.eye(3)*4, pbc=True),
               Atoms("Cu4", scaled_positions=fixture.FCC_BASIS, cell=np.diag([4., 4., 4.1]), pbc=True),
               Atoms("Cu4", scaled_positions=fixture.FCC_BASIS, cell=np.eye(3)*4, pbc=[True, True, False])]
        zincblende = atoms("diamond")
        zincblende.numbers[4:] = 14
        bad.append(zincblende)
        for reference in bad:
            with self.subTest(symbols=str(reference.symbols)), self.assertRaises(ValueError):
                twin.qualify(reference)
        with self.assertRaises(ValueError):
            twin.orient_candidate(atoms(), orientation(), [1, 0, 0])


class PublicExactBinImageFixture(unittest.TestCase):
    def test_fixture_files_signed_metric_and_fft_peaks(self):
        with tempfile.TemporaryDirectory(prefix="f3b-public-fixture-") as directory:
            generated = fixture.create_fixture(directory)
            truth = json.loads(Path(generated["truth"]).read_text(encoding="utf-8"))
            image = tifffile.imread(generated["image"])
            self.assertEqual(image.shape, (256, 128))
            self.assertEqual(image.dtype, np.dtype("float32"))
            scale = np.array(truth["source_xy_scale_nm"])
            self.assertLess(scale[1], 0)
            self.assertNotEqual(abs(scale[0]), abs(scale[1]))
            for region, bins, expected in ((image[:128], fixture.PARENT_BINS, fixture.PARENT_QA/.4),
                                            (image[128:], fixture.CHILD_BINS, fixture.CHILD_QA/.4)):
                spectrum = np.fft.fftshift(np.fft.fft2(region.astype(float)-region.mean()))
                observed = []
                for bx, by in bins:
                    self.assertGreater(abs(spectrum[64+by, 64+bx]), 1e6)
                    np.testing.assert_allclose(spectrum[64-by, 64-bx], spectrum[64+by, 64+bx].conjugate(), atol=1e-7, rtol=0)
                    observed.append([bx/128/scale[0], by/128/scale[1]])
                np.testing.assert_allclose(observed, expected, atol=1e-10, rtol=0)
            for key, count in (("fcc_cif", 4), ("diamond_cif", 8)):
                reference = ase_read(generated[key])
                self.assertEqual(len(reference), count)
                np.testing.assert_allclose(reference.cell.array, np.eye(3)*4, atol=ATOL, rtol=0)
            with self.assertRaises(FileExistsError):
                fixture.create_fixture(directory)


if __name__ == "__main__":
    unittest.main()
