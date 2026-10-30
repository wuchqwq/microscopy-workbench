"""All submitted method attempts remain in their original image journal."""
import copy
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import image_workspace as worker
import image_method_journal as journal


class MethodJournal(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="public-method-journal-")
        self.workspace = worker.Workspace(str(Path(self.temp.name) / "images"), True)
        self.root_id = "a" * 32
        self.cost = {"method_calls": 1, "fft_pixels": 0, "gpa_band_pixels": 32768,
                     "topology_path_samples": 0}

    def tearDown(self):
        self.temp.cleanup()

    def record(self, slot, state="failed"):
        ident = journal.method_request_id(self.root_id, slot, worker)
        parameters = {"workspace": str(self.workspace.root), "action": "method_step", "request_id": ident,
                      "root_plan_id": self.root_id, "object_id": "b" * 32, "action_id": "c" * 32}
        saved = {"schema_version": 1, "request_id": ident, "state": state, "parameters": parameters,
                 "parameters_sha256": hashlib.sha256(worker.canonical(parameters)).hexdigest(),
                 "method_attempt": {"phase": "dispatching", "reserved_cost": copy.deepcopy(self.cost),
                                    "child_request_id": "saved-original-child"}}
        if state != "prepared":
            saved.update(response={"ok": state == "completed", "state": state, "backend": worker.BACKEND,
                                   "request_id": ident, "object_id": "d" * 32}, elapsed_ms=12.5)
        return saved

    def save(self, saved):
        path = self.workspace.root / "requests" / (saved["request_id"] + ".json")
        path.write_bytes(worker.canonical(saved))
        return path

    def root_proof(self):
        return ({"object_id": self.root_id, "kind": "method_plan", "root_plan_id": self.root_id,
                 "budget": {"method_calls": 8}},
                self.workspace.root)

    def test_failed_and_unknown_attempts_preserve_reservations_and_scope(self):
        self.save(self.record(1))
        self.save(self.record(2, "prepared"))
        rows = journal.read_attempts(self.workspace, self.root_id, worker)
        self.assertEqual([row["state"] for row in rows], ["failed", "unknown"])
        self.assertEqual(sum(row["costs"]["method_calls"] for row in rows), 2)
        self.assertEqual(sum(row["costs"]["gpa_band_pixels"] for row in rows), 65536)
        self.assertEqual(rows[1]["elapsed_ms"], None)
        self.assertEqual(rows[0]["request_ref"]["workspace"], str(self.workspace.root))
        self.assertEqual(rows[0]["method_attempt"]["child_request_id"], "saved-original-child")
        self.assertTrue(all(row["verified"] and not row["automatic_retry"] for row in rows))
        prior = journal.read_attempts(self.workspace, self.root_id, worker,
                                      exclude_request_id=rows[1]["request_id"])
        self.assertEqual(len(prior), 1)

    def test_unreadable_occupied_attempt_is_unknown_not_free(self):
        self.save(self.record(1)).write_text('{"partial":', encoding="utf-8")
        row = journal.read_attempts(self.workspace, self.root_id, worker)[0]
        self.assertEqual(row["state"], "unknown")
        self.assertFalse(row["verified"])
        self.assertIsNone(row["costs"])
        self.assertIsNone(row["elapsed_ms"])

    def test_all_eight_bounded_slots_include_completed_and_failed_attempts(self):
        for slot in range(1, 9):
            self.save(self.record(slot, "completed" if slot % 2 else "failed"))
        rows = journal.read_attempts(self.workspace, self.root_id, worker)
        self.assertEqual([row["slot"] for row in rows], list(range(1, 9)))
        self.assertEqual(sum(row["costs"]["method_calls"] for row in rows), 8)
        self.assertEqual(rows[0]["object_id"], "d"*32)
        with self.assertRaises(worker.WorkspaceError):
            journal.method_request_id(self.root_id, 9, worker)
        with self.assertRaises(worker.WorkspaceError):
            journal.method_request_id("../foreign", 1, worker)

    def test_holes_forged_scope_hash_and_costs_are_refused(self):
        self.save(self.record(2))
        with self.assertRaisesRegex(worker.WorkspaceError, "missing earlier slot"):
            journal.read_attempts(self.workspace, self.root_id, worker)
        self.save(self.record(1))
        for mutate in (
            lambda row: row["parameters"].update(workspace="unrelated-workspace"),
            lambda row: row["parameters"].update(root_plan_id="f"*32),
            lambda row: row.update(parameters_sha256="0"*64),
            lambda row: row["response"].update(request_id="unrelated-request"),
            lambda row: row["method_attempt"]["reserved_cost"].update(method_calls=0),
        ):
            value = self.record(1)
            mutate(value)
            self.save(value)
            with self.assertRaises(worker.WorkspaceError):
                journal.read_attempts(self.workspace, self.root_id, worker)

    def test_preflight_refusal_charges_one_attempt_without_dispatch(self):
        request = self.record(1)["parameters"]
        with patch.dict(worker.FIELDS, {"method_step": {"root_plan_id", "object_id", "action_id"}}), \
             patch.object(worker.Workspace, "object", return_value=self.root_proof()), \
             patch.object(worker.Workspace, "action", side_effect=worker.WorkspaceError("REFUSED", "preflight refusal")) as action:
            result = worker._execute(request)
            repeated = worker._execute(request)
        self.assertEqual(action.call_count, 1)
        self.assertEqual(result, repeated)
        self.assertEqual(result["state"], "failed")
        row = journal.read_attempts(self.workspace, self.root_id, worker)[0]
        self.assertEqual(row["method_attempt"]["phase"], "preflight")
        self.assertEqual(row["costs"], {"method_calls": 1, "fft_pixels": 0,
                                      "gpa_band_pixels": 0, "topology_path_samples": 0})
        self.assertGreaterEqual(row["elapsed_ms"], 0)

    def test_arbitrary_request_identity_is_refused_before_journal_or_dispatch(self):
        request = {**self.record(1)["parameters"], "request_id": "untracked-refusal"}
        with patch.dict(worker.FIELDS, {"method_step": {"root_plan_id", "object_id", "action_id"}}), \
             patch.object(worker.Workspace, "action") as action:
            with self.assertRaisesRegex(worker.WorkspaceError, "deterministic slot"):
                worker._execute(request)
        action.assert_not_called()
        self.assertEqual(list((self.workspace.root / "requests").iterdir()), [])

    def test_future_slot_cannot_create_a_hole_or_dispatch(self):
        request = self.record(8)["parameters"]
        with patch.dict(worker.FIELDS, {"method_step": {"root_plan_id", "object_id", "action_id"}}), \
             patch.object(worker.Workspace, "object", return_value=self.root_proof()), \
             patch.object(worker.Workspace, "action") as action:
            with self.assertRaisesRegex(worker.WorkspaceError, "next consecutive"):
                worker._execute(request)
        action.assert_not_called()
        self.assertEqual(list((self.workspace.root / "requests").iterdir()), [])

    def test_invalid_budget_root_is_refused_without_occupying_slot(self):
        request = self.record(1)["parameters"]
        with patch.dict(worker.FIELDS, {"method_step": {"root_plan_id", "object_id", "action_id"}}), \
             patch.object(worker.Workspace, "action") as action:
            with self.assertRaises(worker.WorkspaceError):
                worker._execute(request)
        action.assert_not_called()
        self.assertEqual(list((self.workspace.root / "requests").iterdir()), [])

    def test_exhausted_call_cap_refuses_before_new_journal_or_science(self):
        request = self.record(1)["parameters"]
        root, directory = self.root_proof()
        root = {**root, "budget": {"method_calls": 0}}
        with patch.object(worker.Workspace, "object", return_value=(root, directory)), \
             patch.object(worker.Workspace, "action") as action:
            with self.assertRaisesRegex(worker.WorkspaceError, "budget exhausted before submission"):
                worker._execute(request)
        action.assert_not_called()
        self.assertEqual(list((self.workspace.root / "requests").iterdir()), [])

    def test_existing_failed_request_dedup_does_not_revalidate_root_or_dispatch(self):
        saved = self.record(1)
        self.save(saved)
        with patch.dict(worker.FIELDS, {"method_step": {"root_plan_id", "object_id", "action_id"}}), \
             patch.object(worker.Workspace, "object", side_effect=AssertionError("existing result must not replay root admission")), \
             patch.object(worker.Workspace, "action") as action:
            result = worker._execute(saved["parameters"])
        action.assert_not_called()
        self.assertEqual(result, saved["response"])

    def test_dispatch_reservation_is_durable_before_child_failure(self):
        request = self.record(1)["parameters"]
        observed = []

        def dispatch(workspace, *_):
            workspace.method_attempt_update({"phase": "dispatching", "kind": "gpa",
                "child_request_id": "exact-gpa-original", "child_request": {"action": "gpa"},
                "reserved_cost": self.cost})
            saved = worker.read_json(workspace.root / "requests" / (request["request_id"] + ".json"))
            observed.append(saved)
            raise worker.WorkspaceError("BATCH_CHILD_FAILED", "saved child did not complete")

        with patch.dict(worker.FIELDS, {"method_step": {"root_plan_id", "object_id", "action_id"}}), \
             patch.object(worker.Workspace, "object", return_value=self.root_proof()), \
             patch.object(worker.Workspace, "action", new=dispatch):
            result = worker._execute(request)
        self.assertFalse(result["ok"])
        self.assertEqual(observed[0]["state"], "prepared")
        self.assertEqual(observed[0]["method_attempt"]["reserved_cost"], self.cost)
        row = journal.read_attempts(self.workspace, self.root_id, worker)[0]
        self.assertEqual(row["costs"], self.cost)
        self.assertEqual(row["method_attempt"]["child_request_id"], "exact-gpa-original")
        self.assertGreaterEqual(row["elapsed_ms"], 0)


if __name__ == "__main__":
    unittest.main()
