"""Real image-provider provenance compatibility; isolated scalar fixtures only."""
import copy
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.image_workspace import execute
from crystallography.reflection_compare import ComparisonError, canonical, load_measurement


class ReflectionMeasurementContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="reflection-contract-")
        cls.root = Path(cls.temp.name)
        cls.workspace = cls.root / "images"
        source = cls.root / "public-scalar.tiff"
        y, x = np.indices((16, 16))
        tifffile.imwrite(source, (10 + np.cos(2*np.pi*x/4)).astype("float32"), metadata=None)
        cls.sequence = 0
        opened = cls.call("open", source_path=str(source))
        frame = cls.call("frame", object_id=opened["object_id"], frame_index=0)
        fft = cls.call("fft", object_id=frame["object_id"], window="none", subtract_mean=True)
        cls.records = {}
        for label, extra in [("text", {"source_text": "Public analytic fixture; manually supplied point, not material inference"}),
                             ("omitted", {}), ("null", {"source_text": None})]:
            m = cls.call("measure", object_id=fft["object_id"], points=[[0, 0], [.25, 0]],
                         coordinate_space="frequency_cycles_per_pixel", **extra)
            cls.records[label] = cls.workspace / "objects" / m["object_id"] / "object.json"

    @classmethod
    def call(cls, action, **args):
        cls.sequence += 1
        response = execute({"workspace": str(cls.workspace), "action": action,
                            "request_id": "reflection-contract-"+str(cls.sequence), **args})
        if not response.get("ok"):
            raise AssertionError(response)
        return response["result"]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @contextmanager
    def altered(self, edit):
        path = self.records["text"]
        original = path.read_bytes()
        metadata = json.loads(original)
        journal_path = self.workspace / "requests" / (metadata["request_id"]+".json")
        original_journal = journal_path.read_bytes()
        journal = json.loads(original_journal)
        edit(metadata, journal)
        raw = canonical(metadata)
        journal["parameters_sha256"] = hashlib.sha256(canonical(journal["parameters"])).hexdigest()
        journal["object_manifest_sha256"] = hashlib.sha256(raw).hexdigest()
        journal["response"] = {"ok": True, "state": "completed", "backend": "external-image-workspace",
                               "request_id": metadata["request_id"], **metadata}
        try:
            path.write_bytes(raw)
            journal_path.write_bytes(canonical(journal))
            yield path
        finally:
            path.write_bytes(original)
            journal_path.write_bytes(original_journal)

    def test_real_provider_source_text_is_read_without_writes(self):
        before = {str(p): p.read_bytes() for p in self.workspace.rglob("*") if p.is_file()}
        metadata, _, _, _ = load_measurement(self.records["text"])
        self.assertEqual(metadata["source_text"], "Public analytic fixture; manually supplied point, not material inference")
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.workspace.rglob("*") if p.is_file()})

    def test_omitted_and_explicit_null_source_text_remain_compatible(self):
        for name in ["omitted", "null"]:
            with self.subTest(name=name):
                self.assertNotIn("source_text", load_measurement(self.records[name])[0])

    def test_wrong_parent_is_rejected_even_with_rehashed_journal(self):
        with self.altered(lambda m, j: j["parameters"].update(object_id="f"*32)) as path:
            with self.assertRaisesRegex(ComparisonError, "parent"):
                load_measurement(path)

    def test_unknown_parameter_is_rejected_even_with_rehashed_journal(self):
        with self.altered(lambda m, j: j["parameters"].update(unknown_extra=True)) as path:
            with self.assertRaises(ComparisonError):
                load_measurement(path)

    def test_source_text_mismatch_and_invalid_values_are_rejected(self):
        for text in ["Changed provenance", "", 7, "x"*4001]:
            with self.subTest(text_type=type(text).__name__, length=len(text) if isinstance(text, str) else None):
                with self.altered(lambda m, j: j["parameters"].update(source_text=text)) as path:
                    with self.assertRaisesRegex(ComparisonError, "source text"):
                        load_measurement(path)

    def test_invalid_matching_provenance_is_rejected(self):
        def change(m, j):
            m["source_text"] = 7
            j["parameters"]["source_text"] = 7
        with self.altered(change) as path:
            with self.assertRaisesRegex(ComparisonError, "source text"):
                load_measurement(path)

    def test_existing_completed_hash_response_and_points_guards_remain(self):
        path = self.records["text"]
        metadata = json.loads(path.read_text())
        journal_path = self.workspace / "requests" / (metadata["request_id"]+".json")
        raw = journal_path.read_bytes()
        for field, value in [("state", "running"), ("parameters_sha256", "0"*64),
                             ("object_manifest_sha256", "0"*64), ("response", {})]:
            try:
                journal = json.loads(raw)
                journal[field] = value
                journal_path.write_bytes(canonical(journal))
                with self.assertRaisesRegex(ComparisonError, "immutable original request"):
                    load_measurement(path)
            finally:
                journal_path.write_bytes(raw)
        with self.altered(lambda m, j: j["parameters"].update(points=[[0, 0], [0, .25]])) as changed:
            with self.assertRaisesRegex(ComparisonError, "points"):
                load_measurement(changed)


if __name__ == "__main__":
    unittest.main()
