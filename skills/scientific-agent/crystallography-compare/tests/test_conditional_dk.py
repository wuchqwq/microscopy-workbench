"""Independent small geometry/side-effect tests, not model/phase qualification."""
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/conditional_dk.py"
spec = importlib.util.spec_from_file_location("conditional_dk", SCRIPT)
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)


class ConditionalScale(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="conditional-dk-")
        self.root = Path(self.temp.name)
        self.counter = 0
        self.source = self.ref("source.json", {"shape_yx": [128,128], "meaning": "Explicit synthetic coordinate fixture, not experimental pixels"})
        self.structure = self.ref("cell.json", {"hypothetical_cell_angstrom": [4,4,4], "not_real_material": True})
        self.orientation = self.ref("orientation.json", {"zone_axis_uvw": [0,0,1], "matrix": [[1,0,0],[0,1,0],[0,0,1]]})
        self.catalog = self.ref("catalog.json", {"source": "explicit synthetic missing-conditional-calibration capability fixture", "not_actual_catalog": True})
        self.theory = self.ref("theory.json", {"coordinates_frame": helper.FRAME, "reciprocal_convention": "cycles_per_angstrom_no_2pi", "coordinates_inv_angstrom": [[.25,0,0],[.5,0,0],[.25,.5,0]], "hkl": [[1,0,0],[2,0,0],[1,2,0]]})
        self.input = {"schema_version": 1, "capability_basis": "Synthetic injected absence, not an actual provider availability claim or a denied call", "capability_ref": self.catalog,
                      "source": {"file": self.source,"frame_index":0,"roi_xyxy":[0,0,128,128],"coordinate_domain":"diffraction_array_indices","dc_xy":[64,64],"isotropic_grid_basis":"Declared scalar isotropic software premise, not independent physical evidence"},
                      "hypothesis": {"label":"Hypothetical a4","structure_ref":self.structure,"orientation_ref":self.orientation,"zone_axis_uvw":[0,0,1],"index_basis":"Explicit manual software correspondences"},
                      "theory_ref":self.theory,"correspondences":[{"id":"r1","role":"fit","hkl":[1,0,0],"point_xy":[74,64]}, {"id":"r2","role":"fit","hkl":[2,0,0],"point_xy":[84,64]}, {"id":"r3","role":"heldout","hkl":[1,2,0],"point_xy":[74,84]}], "tolerance_inv_angstrom":1e-12,"uncertainty_note":"Unknown point/model uncertainty; deterministic residuals are not error bars"}

    def tearDown(self):
        self.temp.cleanup()

    def ref(self, name, data):
        p = self.root / name; raw = json.dumps(data).encode(); p.write_bytes(raw)
        return {"path": str(p),"sha256": hashlib.sha256(raw).hexdigest()}

    def run_input(self, data=None):
        self.counter += 1
        p = self.root / ("input"+str(self.counter)+".json")
        out = self.root / ("output"+str(self.counter)+".json")
        p.write_text(json.dumps(self.input if data is None else data))
        receipt = helper.run(p, out)
        raw = out.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), receipt["sha256"])
        return json.loads(raw), p, out

    def test_analytic_scale_and_heldout_do_not_become_absolute_validation(self):
        result, _, _ = self.run_input()
        self.assertAlmostEqual(result["dk_cycles_per_angstrom_per_pixel"], .025, places=14)
        self.assertEqual(result["heldout_status"], "MODEL_PREDICTION_CONSISTENT")
        self.assertEqual(result["independent_absolute_scale_validation"], "NOT_VALIDATED")
        self.assertFalse(result["phase_identified"])
        self.assertEqual(result["uncertainty"]["status"], "NOT_QUANTIFIED")
        self.assertLess(max(abs(r["residual_inv_angstrom"]) for r in result["correspondences"]), 1e-15)

    def test_independent_heldout_conflict_and_missing_heldout(self):
        data = copy.deepcopy(self.input); data["correspondences"][2]["point_xy"] = [94,94]
        result, _, _ = self.run_input(data)
        self.assertEqual(result["heldout_status"], "MODEL_PREDICTION_CONFLICT")
        self.assertAlmostEqual(result["dk_cycles_per_angstrom_per_pixel"], .025)
        data["correspondences"].pop()
        result, _, _ = self.run_input(data)
        self.assertEqual(result["heldout_status"], "NOT_VALIDATED_NO_HELDOUT")

    def test_competing_models_can_each_condition_scale_without_phase_identification(self):
        first, _, _ = self.run_input()
        data = copy.deepcopy(self.input); table = json.loads(Path(self.theory["path"]).read_text())
        table["coordinates_inv_angstrom"] = [[.2,0,0],[.4,0,0],[.2,.4,0]]
        data["hypothesis"]["label"] = "Competing hypothetical a5"
        data["hypothesis"]["structure_ref"] = self.ref("cell5.json", {"hypothetical_cell_angstrom":[5,5,5]})
        data["theory_ref"] = self.ref("theory5.json", table)
        second, _, _ = self.run_input(data)
        self.assertAlmostEqual(first["dk_cycles_per_angstrom_per_pixel"], .025)
        self.assertAlmostEqual(second["dk_cycles_per_angstrom_per_pixel"], .020)
        for result in [first, second]:
            self.assertEqual(result["heldout_status"], "MODEL_PREDICTION_CONSISTENT")
            self.assertFalse(result["phase_identified"])
            self.assertEqual(result["independent_absolute_scale_validation"], "NOT_VALIDATED")

    def test_explicit_two_pi_conversion_is_equivalent_unknown_convention_refused(self):
        data = copy.deepcopy(self.input); table = json.loads(Path(self.theory["path"]).read_text())
        table["reciprocal_convention"] = "radians_per_angstrom_2pi"
        table["coordinates_inv_angstrom"] = [[q*2*math.pi for q in v] for v in table["coordinates_inv_angstrom"]]
        data["theory_ref"] = self.ref("angular.json", table)
        result, _, _ = self.run_input(data)
        self.assertAlmostEqual(result["dk_cycles_per_angstrom_per_pixel"], .025, places=14)
        self.assertAlmostEqual(result["input_to_cycles_factor"], 1/(2*math.pi))
        table["reciprocal_convention"] = "unknown"; data["theory_ref"] = self.ref("unknown.json", table)
        with self.assertRaisesRegex(ValueError, "2pi convention"):
            self.run_input(data)

    def test_provider_integer_valued_float_table_is_normalized_but_input_triplets_stay_explicit(self):
        data = copy.deepcopy(self.input); table = json.loads(Path(self.theory["path"]).read_text())
        table["hkl"] = [[float(x) for x in row] for row in table["hkl"]]
        data["theory_ref"] = self.ref("provider-style-hkl.json", table)
        result, _, _ = self.run_input(data)
        self.assertAlmostEqual(result["dk_cycles_per_angstrom_per_pixel"], .025)
        self.assertEqual(result["heldout_status"], "MODEL_PREDICTION_CONSISTENT")
        self.assertTrue(all(type(x) is int for row in result["correspondences"] for x in row["hkl"]))
        for field in ["zone", "correspondence"]:
            invalid = copy.deepcopy(data)
            if field == "zone": invalid["hypothesis"]["zone_axis_uvw"] = [0.0,0.0,1.0]
            else: invalid["correspondences"][0]["hkl"] = [1.0,0.0,0.0]
            with self.assertRaises(ValueError): self.run_input(invalid)

    def test_theory_fraction_boolean_and_nonfinite_hkl_are_refused(self):
        for index, bad in enumerate([1.5, True, float("nan"), float("inf")]):
            data = copy.deepcopy(self.input); table = json.loads(Path(self.theory["path"]).read_text())
            table["hkl"][0][0] = bad
            data["theory_ref"] = self.ref("bad-hkl-"+str(index)+".json", table)
            with self.assertRaises(ValueError): self.run_input(data)

    def test_110_degree_rotation_is_not_110_zone_axis(self):
        data = copy.deepcopy(self.input); data["hypothesis"]["scan_rotation_deg"] = 110
        result, _, _ = self.run_input(data)
        self.assertEqual(result["hypothesis"]["zone_axis_uvw"], [0,0,1])
        self.assertEqual(result["hypothesis"]["scan_rotation_deg"], 110)
        data["hypothesis"]["zone_axis_uvw"] = 110
        with self.assertRaisesRegex(ValueError, "integer triplet"):
            self.run_input(data)

    def test_alpha_retains_conditional_and_unknown_uncertainty_status(self):
        data = copy.deepcopy(self.input); data["alpha"] = {"disk_radius_px":20,"wavelength_angstrom":.025,"basis":"Declared illustrative small-angle geometry; supplied wavelength, not solved from voltage"}
        result, _, _ = self.run_input(data)
        self.assertAlmostEqual(result["alpha"]["conditional_alpha_mrad"], 12.5)
        self.assertEqual(result["alpha"]["status"], "MODEL_CONDITIONED_NOT_INDEPENDENTLY_VALIDATED")
        self.assertEqual(result["alpha"]["uncertainty"], "NOT_PROPAGATED")
        data["alpha"]["disk_radius_px"] = 10000
        with self.assertRaisesRegex(ValueError, "Paraxial"):
            self.run_input(data)

    def test_reused_reflection_zero_dc_or_outside_support_refused(self):
        for change in [lambda d:d["correspondences"][2].update(hkl=[1,0,0]),lambda d:d["correspondences"][0].update(point_xy=[64,64]),lambda d:d["correspondences"][2].update(point_xy=[128,64]),lambda d:d["correspondences"][2].update(id="r1")]:
            data = copy.deepcopy(self.input); change(data)
            with self.assertRaises(ValueError): self.run_input(data)

    def test_changed_source_and_existing_output_refused_without_overwrite(self):
        before = {p.name:p.read_bytes() for p in self.root.iterdir()}
        _, inp, out = self.run_input(); saved = out.read_bytes()
        with self.assertRaisesRegex(ValueError, "New absolute output"):
            helper.run(inp, out)
        self.assertEqual(out.read_bytes(), saved)
        for name, raw in before.items(): self.assertEqual((self.root/name).read_bytes(), raw)
        Path(self.source["path"]).write_text("changed public fixture")
        with self.assertRaisesRegex(ValueError, "hash differs"):
            self.run_input()

    def test_real_cli_writes_sidecar_only_and_nonfinite_json_refused(self):
        p = self.root/"cli.json"; out = self.root/"cli-out.json"; p.write_text(json.dumps(self.input))
        completed = subprocess.run([sys.executable, "-B", str(SCRIPT), "--input", str(p), "--output", str(out)],capture_output=True,text=True)
        self.assertEqual(completed.returncode,0,completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["independent_absolute_scale_validation"], "NOT_VALIDATED")
        self.assertFalse((self.root/"requests").exists())
        bad = self.root/"bad.json"; bad.write_text('{"schema_version":1,"tolerance_inv_angstrom":NaN}')
        failed = subprocess.run([sys.executable,"-B",str(SCRIPT),"--input",str(bad),"--output",str(self.root/"never.json")],capture_output=True,text=True)
        self.assertEqual(failed.returncode,2)
        self.assertEqual(json.loads(failed.stderr)["status"], "REFUSED")
        self.assertFalse((self.root/"never.json").exists())


if __name__ == "__main__":
    unittest.main()
