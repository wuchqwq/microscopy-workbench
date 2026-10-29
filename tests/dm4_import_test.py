"""Real optional-reader/worker tests on independently encoded public DM4 files."""
import cmath
import hashlib
import json
import math
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
from dm4_fixture import create_fixtures
from image_workspace import execute
import image_dm


class DirectDM4(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dm4-reader-")
        self.root = Path(self.tmp.name)
        self.fixture = create_fixtures(self.root / "input")
        self.workspace = self.root / "workspace"
        self.sequence = 0

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, action, *, success=True, request_id=None, **parameters):
        self.sequence += 1
        request = {"workspace": str(self.workspace), "action": action,
                   "request_id": request_id or "test-" + str(self.sequence), **parameters}
        # Match the actual one-request worker lifetime. RosettaSciIO/Dask can
        # retain read-only source mappings until that worker exits on Windows.
        worker = subprocess.run([sys.executable, "-B", str(ROOT / "tools" / "image_workspace.py")],
                                input=json.dumps(request), text=True, capture_output=True, timeout=30)
        value = json.loads(worker.stdout)
        self.assertEqual(value.get("ok"), success, value)
        return value["result"] if success else value

    def opened(self, name="signed-uint32.dm4"):
        return self.call("open_dm", source_path=str(self.fixture / name))

    def array(self, result):
        return np.load(self.workspace / "objects" / result["object_id"] / "data.npy", allow_pickle=False)

    def test_real_reader_retains_uint32_signed_axes_origin_roi_and_exact_export(self):
        source = self.fixture / "signed-uint32.dm4"
        before = source.read_bytes()
        opened = self.opened()
        self.assertEqual(len(opened["dm_catalog"]["datasets"]), 1, "explicit thumbnail is excluded by reader tags")
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        actual = self.array(frame)
        known = np.load(self.fixture / "known.npy", allow_pickle=False)
        np.testing.assert_array_equal(actual, known)
        self.assertEqual(actual.dtype, np.dtype("uint32"))
        self.assertEqual(int(actual[1, 2]), 4294967295)
        cal = frame["xy_calibration"]
        self.assertEqual(cal["source"], "dm_file_metadata")
        self.assertEqual([cal["xy_scale"][k] for k in ("x", "y")], [.02, -.03])
        self.assertEqual([a["raw_origin"] for a in cal["dm_file_axes"]], [1.25, -2.5])
        self.assertEqual(cal["physical_zero_xy"], [-.025, -.075])
        self.assertFalse(frame["intensity_calibration_applied"])
        self.assertNotIn("native", cal["source"])
        view = self.call("view", object_id=frame["object_id"], rect=[1, 1, 6, 5])
        np.testing.assert_array_equal(self.array(view), known[1:5, 1:6])
        self.assertEqual(view["panels"][0]["source_rect_xyxy"], [1, 1, 6, 5])
        distance = self.call("measure", object_id=frame["object_id"], points=[[0, 0], [1, 1]], coordinate_space="source_pixels")
        self.assertAlmostEqual(distance["physical_distance"], math.hypot(.02, -.03), places=14)
        np.testing.assert_allclose(distance["physical_points_xy"], [[-.025, -.075], [-.005, -.105]], rtol=0, atol=1e-16)
        output = self.root / "export"
        self.call("export", object_id=frame["object_id"], output_dir=str(output))
        self.assertEqual((output / "data.npy").read_bytes(), (self.workspace / "objects" / frame["object_id"] / "data.npy").read_bytes())
        self.assertEqual(source.read_bytes(), before)

    def test_fft_uses_existing_float64_engine_and_saved_scale_without_recomputing_on_recovery(self):
        opened = self.opened()
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        fft = self.call("fft", object_id=frame["object_id"], rect=[0, 0, 7, 5], window="none", subtract_mean=False)
        values, actual = self.array(frame), self.array(fft)
        self.assertEqual(actual.dtype, np.dtype("complex128"))
        expected = np.array([[sum(int(values[y, x]) * cmath.exp(-2j * math.pi * (u*y/5 + v*x/7))
                                for y in range(5) for x in range(7)) for v in range(7)] for u in range(5)])
        expected = np.roll(np.roll(expected, 2, axis=0), 3, axis=1)
        self.assertLess(np.max(np.abs(actual-expected)) / np.sum(values.astype(np.float64)), 2e-14)
        measurement = self.call("measure", object_id=fft["object_id"], points=[[0, 0], [1/7, 0]], coordinate_space="frequency_cycles_per_pixel")
        self.assertAlmostEqual(measurement["d_spacing"], .14, places=14)
        self.assertEqual(measurement["d_spacing_unit"], "nm")
        files = {str(p.relative_to(self.workspace)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in self.workspace.rglob("*") if p.is_file()}
        recovered = execute({"workspace": str(self.workspace), "action": "result", "query_request_id": fft["request_id"]})
        self.assertEqual(recovered["result"]["object_id"], fft["object_id"])
        self.assertEqual(files, {str(p.relative_to(self.workspace)): hashlib.sha256(p.read_bytes()).hexdigest()
                                 for p in self.workspace.rglob("*") if p.is_file()})

    def test_multiple_scientific_datasets_require_an_explicit_selection_and_never_become_depth_frames(self):
        opened = self.opened("two-science.dm4")
        self.assertEqual(len(opened["dm_catalog"]["datasets"]), 2)
        refused = self.call("frame", success=False, object_id=opened["object_id"], frame_index=0)
        self.assertEqual(refused["error"]["code"], "DATASET_SELECTION_REQUIRED")
        self.assertIn("--dataset 2", refused["error"]["message"])
        self.assertIn("second-science", refused["error"]["message"])
        second = self.call("frame", object_id=opened["object_id"], frame_index=0, dataset_index=1)
        np.testing.assert_array_equal(self.array(second), [[4, 3], [2, 1]])
        self.assertEqual(second["dtype"], "uint16")
        self.assertEqual(second["dm_dataset_index"], 1)
        self.call("frame", success=False, object_id=opened["object_id"], frame_index=1, dataset_index=1)
        self.call("frame", success=False, object_id=opened["object_id"], frame_index=0, dataset_index=2)
        self.call("frame", success=False, object_id=opened["object_id"], frame_index=0, dataset_index=None)

    def test_missing_units_or_raw_origin_do_not_admit_reader_defaults_and_unicode_is_preserved(self):
        for name in ("uncalibrated.dm4",):
            opened = self.opened(name)
            frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
            self.assertIsNone(frame["xy_calibration"])
            fft = self.call("fft", object_id=frame["object_id"])
            measure = self.call("measure", object_id=fft["object_id"], points=[[0, 0], [1/7, 0]], coordinate_space="frequency_cycles_per_pixel")
            self.assertIsNone(measure["d_spacing"])
            self.assertAlmostEqual(measure["pixel_period"], 7.)
        # This reader version requires an Origin tag to parse axes. Preserve a
        # clear parse rejection; never inject Origin=0 to force a false PASS.
        raw = (self.fixture / "signed-uint32.dm4").read_bytes().replace(b"Origin", b"Other_")
        (self.fixture / "missing-origin.dm4").write_bytes(raw)
        refused = self.call("open_dm", success=False, source_path=str(self.fixture / "missing-origin.dm4"))
        self.assertEqual(refused["error"]["code"], "DM4_READ_ERROR")
        row = {"axes": [{"index_in_array": 1, "size": 7, "scale": 1., "offset": 0., "units": "nm"}],
               "original_metadata": {"ImageList": {"TagGroup0": {"ImageData": {"Calibrations": {"Dimension": {}}}}}}}
        self.assertFalse(image_dm._axis(row, [5, 7], 0)["usable"], "a reader's default axis cannot replace missing raw tags")
        opened = self.opened("angstrom.dm4")
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        self.assertEqual(frame["dm_dataset"]["calibration_xy"][0]["unit"], "Å")
        self.assertEqual(frame["xy_calibration"]["xy_scale"]["unit"], "angstrom")

    def test_missing_optional_reader_does_not_block_tiff_and_source_changes_are_refused(self):
        with patch.object(image_dm, "import_module", side_effect=ModuleNotFoundError("simulated missing optional package")) as importer:
            refused = execute({"workspace": str(self.workspace), "action": "open_dm", "request_id": "missing-reader", "source_path": str(self.fixture / "signed-uint32.dm4")})
            self.assertFalse(refused["ok"])
            self.assertEqual(refused["error"]["code"], "MISSING_DEPENDENCY")
            tiff = self.root / "old.tiff"
            tifffile.imwrite(tiff, np.arange(24, dtype=np.uint16).reshape(4, 6))
            request = {"workspace": str(self.workspace), "action": "open", "source_path": str(tiff), "request_id": "legacy-tiff"}
            opened, repeated = execute(request), execute(request)
            self.assertTrue(opened["ok"])
            self.assertEqual(repeated["result"]["object_id"], opened["result"]["object_id"])
            importer.assert_called_once()
        opened = self.opened()
        changed = self.fixture / "signed-uint32.dm4"
        changed.write_bytes(changed.read_bytes() + b"changed-synthetic-source")
        refused = self.call("frame", success=False, object_id=opened["object_id"], frame_index=0)
        self.assertEqual(refused["error"]["code"], "SOURCE_CHANGED")


if __name__ == "__main__":
    unittest.main()
