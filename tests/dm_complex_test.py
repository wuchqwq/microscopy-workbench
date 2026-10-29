"""Ordinary complex-file/worker checks; independently encoded synthetic values."""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess
import sys
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
from dm4_fixture import write_dm3, write_dm4


class DMComplex(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dm-complex-")
        self.root = Path(self.tmp.name)
        self.workspace = self.root / "workspace"
        self.seq = 0
        self.known = np.array([[3+4j, -5+12j, -2j], [8-15j, -7-24j, -1+.5j]])
        for version, writer in ((3, write_dm3), (4, write_dm4)):
            for dtype in ("complex64", "complex128"):
                writer(self.root / (dtype + ".dm" + str(version)), [{"data": self.known.astype(dtype),
                       "scales": (.2, -.3), "origins": (1.25, -2.5), "units": ("nm", "nm")}])

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, action, *, ok=True, request_id=None, **parameters):
        self.seq += 1
        request = dict(workspace=str(self.workspace), action=action,
                       request_id=request_id or "complex-" + str(self.seq), **parameters)
        worker = subprocess.run([sys.executable, "-B", str(ROOT / "tools" / "image_workspace.py")],
                                input=json.dumps(request), text=True, capture_output=True, timeout=30)
        result = json.loads(worker.stdout)
        self.assertEqual(result["ok"], ok, result)
        return result["result"] if ok else result

    def opened(self, dtype="complex64", version=4):
        file = self.root / (dtype + ".dm" + str(version))
        source = self.call("open_dm", source_path=str(file))
        frame = self.call("frame", object_id=source["object_id"], frame_index=0)
        return file, source, frame

    def array(self, result):
        return np.load(self.workspace / "objects" / result["object_id"] / "data.npy", allow_pickle=False)

    def test_c64_c128_dm3_dm4_capture_and_raw_export_are_exact(self):
        for version in (3, 4):
            for dtype in ("complex64", "complex128"):
                file, source, frame = self.opened(dtype, version)
                before = hashlib.sha256(file.read_bytes()).hexdigest()
                self.assertTrue(source["dm_catalog"]["datasets"][0]["eligible_complex_2d"])
                values = self.array(frame)
                self.assertEqual(str(values.dtype), dtype)
                np.testing.assert_array_equal(values, self.known.astype(dtype))
                self.assertEqual(frame["kind"], "frame")
                self.assertNotIn("frequency_axes", frame)
                self.assertTrue(frame["complex_semantics"]["not_assumed_to_be_fft"])
                self.assertEqual(frame["xy_calibration"]["physical_zero_xy"], [-.25, -.75])
                output = self.root / ("export-" + dtype + str(version))
                self.call("export", object_id=frame["object_id"], output_dir=str(output))
                self.assertEqual((output / "data.npy").read_bytes(), (self.workspace / "objects" / frame["object_id"] / "data.npy").read_bytes())
                self.assertFalse((output / "preview.png").exists(), "raw export must not silently select amplitude")
                self.assertIsNone(json.loads((output / "manifest.json").read_text(encoding="utf8"))["display_mapping"])
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), before)

    def test_preview_requires_component_revisions_crop_keep_both_parts_and_recover(self):
        _, _, frame = self.opened()
        bad = self.call("view", ok=False, object_id=frame["object_id"])
        self.assertEqual(bad["error"]["code"], "COMPONENT_REQUIRED")
        for component in ("real", "imag", "amplitude", "power"):
            view = self.call("view", object_id=frame["object_id"], component=component, max_size=128, upscale=True)
            np.testing.assert_array_equal(self.array(view), self.known.astype(np.complex64))
            self.assertEqual(view["display"]["component"], component)
            self.assertTrue(view["display"]["complex_data_unchanged"])
        inherited = self.call("view", object_id=view["object_id"], gamma=.8)
        self.assertEqual(inherited["display"]["component"], "power")
        changed = self.call("view", object_id=inherited["object_id"], component="imag")
        self.assertEqual(changed["display"]["display_range"], [-24., 12.])
        crop = self.call("view", object_id=changed["object_id"], rect=[1, 0, 3, 2], request_id="complex-crop")
        np.testing.assert_array_equal(self.array(crop), self.known.astype(np.complex64)[:, 1:3])
        self.assertEqual(crop["panels"][0]["source_rect_xyxy"], [1, 0, 3, 2])
        recovered = self.call("result", query_request_id="complex-crop")
        self.assertEqual(recovered["object_id"], crop["object_id"])
        conflict = self.call("view", ok=False, object_id=changed["object_id"], rect=[0, 0, 3, 2], request_id="complex-crop")
        self.assertEqual(conflict["error"]["code"], "REQUEST_CONFLICT")

    def test_component_numbers_and_geometry_use_raw_array_not_preview(self):
        _, _, frame = self.opened()
        for component, expected in (("real", self.known.real), ("imag", self.known.imag),
                                    ("amplitude", np.abs(self.known)), ("power", np.abs(self.known)**2)):
            result = self.call("statistics", object_id=frame["object_id"], component=component)
            self.assertAlmostEqual(result["statistics"]["mean"], float(np.mean(expected)), places=6)
            self.assertIn("complex array", result["intensity_semantics"])
            self.assertNotIn("complex FFT", result["intensity_semantics"])
        self.call("statistics", ok=False, object_id=frame["object_id"])
        profile = self.call("profile", object_id=frame["object_id"], component="imag", points=[[0, 0], [2, 1]], sample_count=4)
        self.assertEqual(profile["value_dtype"], "float32")
        self.assertEqual(profile["samples"]["value"], [4., 12., -24., .5])
        self.assertAlmostEqual(profile["samples"]["physical_distance"][-1], .5, places=14)
        measure = self.call("measure", object_id=frame["object_id"], points=[[0, 0], [2, 1]])
        self.assertAlmostEqual(measure["physical_distance"], .5, places=14)

    def test_fft_compare_phase_packed_and_nd_complex_fail_without_cast(self):
        _, _, frame = self.opened()
        result = self.call("fft", ok=False, object_id=frame["object_id"])
        self.assertEqual(result["error"]["code"], "UNSUPPORTED_OPERATION")
        view = self.call("view", object_id=frame["object_id"], component="amplitude")
        result = self.call("compare", ok=False, object_ids=[frame["object_id"], view["object_id"]])
        self.assertEqual(result["error"]["code"], "UNSUPPORTED_OPERATION")
        self.call("view", ok=False, object_id=frame["object_id"], component="phase")
        nd = self.root / "nd-complex.dm4"
        write_dm4(nd, [{"data": np.ones((2, 3, 4), dtype=np.complex64)*(1-2j)}])
        self.call("open_dm", ok=False, source_path=str(nd))
        packed = bytearray((self.root / "complex64.dm4").read_bytes())
        marker = packed.index(b"%%%%", packed.rindex(b"DataType"))
        packed[marker+20:marker+24] = struct.pack("<i", 5)
        file = self.root / "packed.dm4";file.write_bytes(packed)
        self.call("open_dm", ok=False, source_path=str(file))


if __name__ == "__main__":
    unittest.main()
