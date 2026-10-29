"""Public synthetic real-worker comparison and journal tests; no phase claim."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import tifffile
from ase.build import bulk
from ase.io import write

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.image_workspace import execute as image_execute
from crystallography.structure_tools import execute as structure_execute


class CandidateBatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="candidate-batch-")
        cls.root = Path(cls.tmp.name)
        cls.images, cls.structures = cls.root / "images", cls.root / "structures"
        cls.serial = 0
        y, x = np.indices((32, 32))
        values = np.rint(10000 + 2000 * np.cos(2*np.pi*x/4) + 1000*np.cos(2*np.pi*y/4)).astype(np.uint16)
        cls.input = cls.root / "periodic.tiff"
        tifffile.imwrite(cls.input, values, photometric="minisblack", metadata=None)
        cls.source_hash = hashlib.sha256(cls.input.read_bytes()).hexdigest()
        opened = cls.image("open", source_path=str(cls.input))
        frame = cls.image("frame", object_id=opened["object_id"], frame_index=0)
        calibrated = cls.image("calibrate", object_id=frame["object_id"], scope="image", xy_scale={"x": .05,"y": .05,"unit":"nm"}, source_text="Synthetic known .05 nm/pixel, not an experimental sample")
        cls.fft = cls.image("fft", object_id=calibrated["object_id"], window="none", subtract_mean=True)
        cls.measurements = [cls.image("measure", object_id=cls.fft["object_id"], coordinate_space="frequency_cycles_per_pixel", points=[[0, 0], p]) for p in [[.25, 0], [0, .25]]]
        cls.unscaled_fft = cls.image("fft", object_id=frame["object_id"], window="none", subtract_mean=True)
        cls.unscaled_measure = cls.image("measure", object_id=cls.unscaled_fft["object_id"], coordinate_space="frequency_cycles_per_pixel", points=[[0, 0], [.25, 0]])
        cif = cls.root / "fcc.cif"
        write(cif, bulk("Cu", "fcc", a=4, cubic=True))
        opened_structure = cls.structure("open", source_path=str(cif))
        orientation = cls.structure("orient", object_id=opened_structure["object_id"], zone_axis_uvw=[0, 0, 1])
        cls.sim = cls.structure("simulate", object_id=opened_structure["object_id"], orientation_id=orientation["object_id"], voltage_kv=200,
                                reciprocal_radius_inv_angstrom=.8, max_excitation_error_inv_angstrom=.02, size=64, sigma_pixels=1, with_direct_beam=False)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @classmethod
    def image(cls, action, **args):
        cls.serial += 1
        result = image_execute({"workspace": str(cls.images), "action": action, "request_id": "image-"+str(cls.serial), **args})
        assert result.get("ok"), result
        return result["result"]

    @classmethod
    def structure(cls, action, **args):
        cls.serial += 1
        result = structure_execute({"workspace": str(cls.structures), "action": action, "request_id": "structure-"+str(cls.serial), **args})
        assert result.get("ok"), result
        return result["result"]

    def request(self, ident):
        return {"workspace": str(self.structures), "action": "compare_batch", "request_id": ident,
                "image_workspace": str(self.images), "current_image_object_id": self.fft["object_id"],
                "measurement_object_ids": [m["object_id"] for m in self.measurements],
                "experimental_kind": "real_space_fft", "max_residual_inv_angstrom": 1e-6,
                "candidates": [{"label": label, "simulation_object_id": self.sim["object_id"],
                                "registration": {"rotation_deg": angle, "scale": 1, "translation_inv_angstrom": [0, 0],
                                                 "flip_y": False, "basis": "Synthetic fixed Cartesian axes and explicit trial roll"}}
                               for label, angle in [("aligned hypothesis", 0), ("rotated hypothesis", 45)]]}

    def test_comparison_reuses_existing_engine_and_new_process_recovers(self):
        request = self.request("compare-synthetic")
        response = structure_execute(request)
        self.assertTrue(response.get("ok"), response)
        result = response["result"]
        self.assertEqual(result["batch_status"], "completed")
        aligned, rotated = result["candidates"]
        self.assertEqual(len(aligned["matched"]), 2)
        self.assertEqual(len(rotated["unmatched_experimental"]), 2)
        for row in result["candidates"]:
            self.assertEqual(row["status"], "hypothesized")
            self.assertEqual(row["independent_validation"], "NOT_VALIDATED")
            self.assertFalse(row["phase_identified"])
        self.assertEqual(sorted(round(m["d_spacing"], 12) for m in self.measurements), [.2, .2])
        before = sorted(p.name for p in (self.structures / "objects").iterdir())
        same = structure_execute(request)
        self.assertEqual(same, response)
        query = {"workspace": str(self.structures), "action": "result", "query_request_id": request["request_id"]}
        process = subprocess.run([sys.executable, "-B", str(ROOT / "tools" / "structure_worker.py")], input=json.dumps(query),
                                 text=True, capture_output=True, timeout=30)
        self.assertEqual(process.returncode, 0, process.stderr + process.stdout)
        self.assertEqual(json.loads(process.stdout), response)
        self.assertEqual(sorted(p.name for p in (self.structures / "objects").iterdir()), before)
        self.assertEqual(hashlib.sha256(self.input.read_bytes()).hexdigest(), self.source_hash)
        changed = copy.deepcopy(request)
        changed["candidates"][0]["registration"]["rotation_deg"] = 10
        conflict = structure_execute(changed)
        self.assertEqual(conflict["error"]["code"], "REQUEST_CONFLICT")

    def test_invalid_candidate_and_stale_geometry_create_no_child_comparisons(self):
        before = sum(json.loads(p.read_text())["kind"] == "compare" for p in (self.structures / "objects").glob("*/object.json"))
        bad = self.request("bad-scale")
        bad["candidates"][1]["registration"]["scale"] = 1.1
        self.assertFalse(structure_execute(bad)["ok"])
        current = self.image("calibrate", object_id=self.fft["object_id"], scope="image", xy_scale={"x": .06,"y": .05,"unit":"nm"}, source_text="Synthetic correction")
        bad = self.request("stale-geometry")
        bad["current_image_object_id"] = current["object_id"]
        stale = structure_execute(bad)
        self.assertFalse(stale["ok"], stale)
        after = sum(json.loads(p.read_text())["kind"] == "compare" for p in (self.structures / "objects").glob("*/object.json"))
        self.assertEqual(before, after)

    def test_missing_calibration_is_explicit_not_invented(self):
        request = self.request("unscaled")
        request["current_image_object_id"] = self.unscaled_fft["object_id"]
        request["measurement_object_ids"] = [self.unscaled_measure["object_id"]]
        failure = structure_execute(request)
        self.assertFalse(failure["ok"], failure)
        self.assertIsNone(self.unscaled_measure["d_spacing"])
        self.assertIsNone(self.unscaled_measure["d_spacing_unit"])
        self.assertEqual(self.unscaled_measure["pixel_period"], 4)

    def test_parent_recovery_checks_child_evidence(self):
        response = structure_execute(self.request("tamper-child"))
        self.assertTrue(response.get("ok"), response)
        result = response["result"]
        child = self.structures / "objects" / result["child_receipts"][0]["object_id"] / "object.json"
        original = child.read_bytes()
        try:
            child.write_bytes(original + b" ")
            failed = structure_execute({"workspace": str(self.structures), "action": "result", "query_request_id": "tamper-child"})
            self.assertFalse(failed["ok"], failed)
            self.assertEqual(failed["error"]["code"], "CORRUPT_OBJECT")
        finally:
            child.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
