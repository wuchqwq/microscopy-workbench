"""Real reader/one-request workers, hand-computable DM3 and selected nD planes."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
from dm4_fixture import create_plane_fixtures


class DMPlanes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dm-planes-")
        self.root = Path(self.tmp.name)
        self.fixture = create_plane_fixtures(self.root / "input")
        self.workspace = self.root / "workspace"
        self.sequence = 0

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, action, *, success=True, request_id=None, **parameters):
        self.sequence += 1
        request = {"workspace": str(self.workspace), "action": action,
                   "request_id": request_id or "plane-" + str(self.sequence), **parameters}
        worker = subprocess.run([sys.executable, "-B", str(ROOT / "tools" / "image_workspace.py")],
                                input=json.dumps(request), text=True, capture_output=True, timeout=30)
        self.assertEqual(worker.returncode, 0 if success else 1, worker.stderr)
        value = json.loads(worker.stdout)
        self.assertEqual(value.get("ok"), success, value)
        return value["result"] if success else value

    def open(self, name):
        return self.call("open_dm", source_path=str(self.fixture / name))

    def array(self, value):
        return np.load(self.workspace / "objects" / value["object_id"] / "data.npy", allow_pickle=False)

    def test_dm3_scientific_uint32_and_missing_units_preserve_real_data(self):
        source = self.fixture / "signed-uint32.dm3"
        original = source.read_bytes()
        opened = self.open(source.name)
        self.assertEqual(opened["source_file_format"], "dm3")
        self.assertEqual(len(opened["dm_catalog"]["datasets"]), 1)
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        np.testing.assert_array_equal(self.array(frame), np.arange(35, dtype=np.uint32).reshape(5, 7) + 16777217)
        self.assertEqual(frame["dtype"], "uint32")
        self.assertEqual(frame["xy_calibration"]["source"], "dm_file_metadata")
        self.assertIn("DM3", frame["xy_calibration"]["source_text"])
        self.assertEqual(frame["xy_calibration"]["physical_zero_xy"], [-.025, -.075])
        transposed = self.call("frame", object_id=opened["object_id"], frame_index=0,
                               plane_axes=[1, 0], plane_indices=[None, None])
        np.testing.assert_array_equal(self.array(transposed), (np.arange(35, dtype=np.uint32).reshape(5, 7) + 16777217).T)
        self.assertEqual(transposed["shape_yx"], [7, 5])
        self.assertEqual([transposed["xy_calibration"]["xy_scale"][k] for k in ("x", "y")], [-.03, .02])

        plain = self.open("uncalibrated.dm3")
        pixel = self.call("frame", object_id=plain["object_id"], frame_index=0)
        self.assertIsNone(pixel["xy_calibration"])
        self.assertEqual(pixel["array_domain"], "unspecified_image")
        measure = self.call("measure", object_id=pixel["object_id"], points=[[0, 0], [1, 0]])
        self.assertEqual(measure["distance_pixels"], 1.)
        self.assertIsNone(measure.get("physical_distance"))

        self.assertEqual(source.read_bytes(), original)

    def test_explicit_3d_transpose_has_original_axis_geometry_and_exact_values(self):
        expected = np.array([[104, 116], [105, 117], [106, 118], [107, 119]], dtype=np.uint16)
        for suffix in ("dm3", "dm4"):
            opened = self.open("volume." + suffix)
            frame = self.call("frame", object_id=opened["object_id"], frame_index=0,
                              plane_axes=[2, 0], plane_indices=[None, 1, None])
            np.testing.assert_array_equal(self.array(frame), expected)
            selection = frame["dm_plane_selection"]
            self.assertEqual(selection["source_shape"], [2, 3, 4])
            self.assertEqual(selection["lazy_chunk_shape"], [2, 1, 4])
            self.assertEqual(selection["decoded_plane_bytes"], 16)
            self.assertEqual(frame["shape_yx"], [4, 2])
            self.assertEqual({k: frame["xy_calibration"]["xy_scale"][k] for k in ("x", "y", "unit")}, {"x": .4, "y": .02, "unit": "nm"})
            self.assertIsNone(frame["xy_calibration"]["xy_scale"]["uncertainty_x"])
            self.assertIsNone(frame["xy_calibration"]["xy_scale"]["uncertainty_y"])
            np.testing.assert_allclose(frame["xy_calibration"]["physical_zero_xy"], [-1.2, -.025], rtol=0, atol=3e-16)
            self.assertEqual([a["numpy_axis"] for a in frame["calibration"]], [0, 2])
            self.assertEqual([a["output_numpy_axis"] for a in frame["calibration"]], [1, 0])
            self.assertEqual(frame["frame_axis_role"], "explicit_2d_plane_selection_not_depth")

    def test_4d_plane_fixed_axes_are_identity_and_calibration_does_not_cross_planes(self):
        opened = self.open("four-dimensional.dm4")
        parameters = {"object_id": opened["object_id"], "frame_index": 0,
                      "plane_axes": [0, 2], "plane_indices": [None, 1, None, 6]}
        frame = self.call("frame", request_id="chosen-plane", **parameters)
        expected = np.array([[106, 116, 126, 136, 146], [1106, 1116, 1126, 1136, 1146]], dtype=np.float32)
        np.testing.assert_array_equal(self.array(frame), expected)
        self.assertEqual(frame["dm_plane_selection"]["lazy_chunk_shape"], [2, 1, 5, 1])
        self.assertEqual({k: frame["xy_calibration"]["xy_scale"][k] for k in ("x", "y", "unit")}, {"x": -.02, "y": -.4, "unit": "nm"})
        self.assertEqual([a["dm_dimension"] for a in frame["calibration"]], [1, 3])
        self.assertEqual(self.call("frame", request_id="chosen-plane", **parameters)["object_id"], frame["object_id"])
        changed = {**parameters, "plane_indices": [None, 0, None, 6]}
        conflict = self.call("frame", success=False, request_id="chosen-plane", **changed)
        self.assertEqual(conflict["error"]["code"], "REQUEST_CONFLICT")
        other = self.call("frame", **changed)
        self.assertNotEqual(other["object_id"], frame["object_id"])
        np.testing.assert_array_equal(self.array(other), expected - 100)
        refused = self.call("calibrate", success=False, object_id=other["object_id"], calibration_object_id=frame["object_id"])
        self.assertEqual(refused["error"]["code"], "CALIBRATION_SCOPE_MISMATCH")
        recovered = self.call("result", query_request_id="chosen-plane")
        self.assertEqual(recovered["object_id"], frame["object_id"])

    def test_no_implicit_slicing_bad_indices_and_chunk_budget_are_refused(self):
        opened = self.open("volume.dm4")
        base = {"object_id": opened["object_id"], "frame_index": 0}
        for selectors, code in [({}, "PLANE_SELECTION_REQUIRED"),
                                ({"plane_axes": [1, 2]}, "PLANE_SELECTION_REQUIRED"),
                                ({"plane_axes": None, "plane_indices": None}, "INVALID_PLANE_SELECTION"),
                                ({"plane_axes": [1, 1], "plane_indices": [0, None, None]}, "PLANE_SELECTION_REQUIRED"),
                                ({"plane_axes": [1, 2], "plane_indices": [None, None, None]}, "INVALID_PLANE_SELECTION"),
                                ({"plane_axes": [1, 2], "plane_indices": [2, None, None]}, "INVALID_PLANE_SELECTION"),
                                ({"plane_axes": [1, 2], "plane_indices": [True, None, None]}, "INVALID_PLANE_SELECTION")]:
            value = self.call("frame", success=False, **base, **selectors)
            self.assertEqual(value["error"]["code"], code)
        large = self.open("chunk-budget.dm4")
        value = self.call("frame", success=False, object_id=large["object_id"], frame_index=0,
                          plane_axes=[1, 2], plane_indices=[1, None, None])
        self.assertEqual(value["error"]["code"], "BUDGET_EXCEEDED")
        self.assertIn("4096", value["error"]["message"])

    def test_spectral_wavelength_nm_does_not_become_spatial_distance(self):
        opened = self.open("spectral-nm.dm4")
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0,
                          plane_axes=[2, 0], plane_indices=[None, 1, None])
        self.assertIsNone(frame["xy_calibration"])
        self.assertIn("spectroscopic", frame["calibration_admission"]["reason"])
        self.assertEqual(frame["calibration"][0]["unit"], "nm")
        self.assertEqual(frame["calibration"][0]["reader_axis"]["name"], "Wavelength")
        np.testing.assert_array_equal(self.array(frame), [[104, 116], [105, 117], [106, 118], [107, 119]])
        measure = self.call("measure", object_id=frame["object_id"], points=[[0, 0], [1, 1]])
        self.assertIsNone(measure.get("physical_distance"))

    def test_complex_layout_and_suffix_header_conflicts_are_rejected_before_decode(self):
        for suffix, offset in (("dm3", 8), ("dm4", 12)):
            raw = bytearray((self.fixture / ("volume." + suffix)).read_bytes())
            raw[offset:offset + 4] = b"\0" * 4
            path = self.fixture / ("unqualified-endian." + suffix)
            path.write_bytes(raw)
            value = self.call("open_dm", success=False, source_path=str(path))
            self.assertEqual(value["error"]["code"], "UNSUPPORTED_LAYOUT")
            self.assertIn("little-endian", value["error"]["message"])
        for name in ("complex.dm3", "complex.dm4"):
            value = self.call("open_dm", success=False, source_path=str(self.fixture / name))
            self.assertEqual(value["error"]["code"], "UNSUPPORTED_LAYOUT")
            self.assertIn("complex", value["error"]["message"])
        for original, renamed in (("volume.dm3", "wrong.dm4"), ("volume.dm4", "wrong.dm3")):
            shutil.copyfile(self.fixture / original, self.fixture / renamed)
            value = self.call("open_dm", success=False, source_path=str(self.fixture / renamed))
            self.assertEqual(value["error"]["code"], "UNSUPPORTED_FORMAT")


if __name__ == "__main__":
    unittest.main()
