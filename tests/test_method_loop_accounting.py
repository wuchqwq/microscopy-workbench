"""Unknown cost and late child projection; unit fault inputs, not a killed worker."""
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_method_loop as loop


class LedgerAccounting(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workspace = SimpleNamespace(root=Path(self.temp.name))
        (self.workspace.root / "requests").mkdir()
        self.root = {"object_id": "a"*32, "budget": {"method_calls": 2, "fft_pixels": 0,
                        "gpa_band_pixels": 131072, "topology_path_samples": 5328}}
        self.api = SimpleNamespace(canonical=lambda x: json.dumps(x, sort_keys=True).encode(),
                                   read_json=lambda p: json.loads(p.read_text()),
                                   need=lambda ok,*args: self.assertTrue(ok, args))

    def test_unreadable_reservation_is_null_not_zero_and_prevents_free_budget(self):
        row = {"request_id": "unreadable-original", "state": "unknown", "method_attempt": None, "reserved_cost": None}
        with patch.object(loop.journal, "read_attempts", return_value=[row]):
            result = loop._ledger(self.workspace, self.root, self.api)
        self.assertTrue(result["has_unknown"])
        self.assertEqual(set(result["spent"].values()), {None})
        self.assertEqual(set(result["remaining"].values()), {0})
        self.assertEqual(result["unquantified_reservations"], ["unreadable-original"])

    def test_late_child_is_queried_not_reexecuted_and_old_state_remains_unknown(self):
        child = {"request_id": "original-child", "action": "gpa", "workspace": str(self.workspace.root)}
        (self.workspace.root / "requests/original-child.json").write_text(json.dumps({"parameters": child}))
        observed = []
        def query(request):
            observed.append(request)
            self.assertEqual(request["action"], "result")
            return {"ok": True, "object_id": "b"*32, "request_id": "original-child"}
        self.api._execute = query
        row = {"request_id": "original-step", "state": "unknown", "method_attempt": {
            "child_request_id": "original-child", "child_request": child}, "reserved_cost": {
                "method_calls": 1, "fft_pixels": 0, "gpa_band_pixels": 131072, "topology_path_samples": 0}}
        with patch.object(loop.journal, "read_attempts", return_value=[row]):
            result = loop._ledger(self.workspace, self.root, self.api)
        self.assertEqual(len(observed), 1)
        self.assertFalse(result["has_unknown"])
        self.assertEqual(result["attempts"][0]["state"], "unknown")
        self.assertEqual(result["attempts"][0]["effective_state"], "completed")
        self.assertEqual(result["spent"]["gpa_band_pixels"], 131072)


if __name__ == "__main__":
    unittest.main()
