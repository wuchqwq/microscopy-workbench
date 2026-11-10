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
    def dispatched(self):
        saved = self.record(1, "prepared")
        saved["parameters"]["selection_reason"] = "Controlled local synthetic selection"
        saved["parameters_sha256"] = hashlib.sha256(worker.canonical(saved["parameters"])).hexdigest()
        ident = worker.automation.child_request_id(saved["request_id"], "method")
        child = {"workspace": str(self.workspace.root), "action": "gpa", "request_id": ident,
                 "object_id": "e"*32, "reference_text": "Full original source"}
        saved["method_attempt"].update(kind="gpa", parameters={k: v for k, v in child.items()
                 if k not in ("workspace", "action", "request_id")}, child_request_id=ident, child_request=child)
        attempt = saved["method_attempt"]
        attempt.update(plan_object_id=saved["parameters"]["object_id"], action_id=saved["parameters"]["action_id"],
                       selection_reason=saved["parameters"].get("selection_reason"),
                       action_key=hashlib.sha256(worker.canonical(["gpa", attempt["parameters"]])).hexdigest())
        self.plan = {"object_id": saved["parameters"]["object_id"], "kind": "method_plan", "root_plan_id": self.root_id,
                     "actions": [{"action_id": attempt["action_id"], "kind": "gpa",
                                  "parameters": attempt["parameters"], "cost": self.cost}]}
        self.child_object = {"object_id": "d"*32, "request_id": ident, "kind": "gpa"}
        self.save(saved)
        return saved, child

    def object_proof(self, ident):
        if ident == self.plan["object_id"]:
            return self.plan, self.workspace.root
        if ident == self.root_id:
            return self.root_proof()
        self.assertEqual(ident, self.child_object["object_id"])
        return self.child_object, self.workspace.root

    def test_completed_child_requires_its_own_creator_and_kind(self):
        parent, child = self.dispatched()
        response = {"ok": True, "state": "completed", "backend": worker.BACKEND,
                    "request_id": child["request_id"], "object_id": self.child_object["object_id"]}
        self.save({"request_id": child["request_id"], "parameters": child,
                   "parameters_sha256": hashlib.sha256(worker.canonical(child)).hexdigest(),
                   "state": "completed", "response": response})
        for field, value in (("request_id", "another-valid-creator"), ("kind", "topology")):
            with self.subTest(field=field), patch.object(worker.Workspace, "object", side_effect=self.object_proof):
                original = self.child_object[field]
                self.child_object[field] = value
                with self.assertRaisesRegex(worker.WorkspaceError, "creator|kind"):
                    worker._execute({"workspace": str(self.workspace.root), "action": "result",
                                     "query_request_id": parent["request_id"]})
                self.child_object[field] = original

    def test_legitimate_foreign_gpa_object_is_not_this_childs_completion(self):
        # Real public synthetic object/creator/dependency validation; the plan
        # proof is controlled unit input, not a simulated killed process.
        import numpy as np
        import tifffile
        source = Path(self.temp.name) / "public-analytic.tiff"
        y, x = np.indices((128, 128))
        tifffile.imwrite(source, (np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8)).astype("float32"))
        def call(action, ident, **args):
            value = worker._execute({"workspace": str(self.workspace.root), "action": action, "request_id": ident, **args})
            self.assertTrue(value["ok"], value)
            return value
        opened = call("open", "foreign-open", source_path=str(source))
        frame = call("frame", "foreign-frame", object_id=opened["object_id"], frame_index=0)
        fft = call("fft", "foreign-fft", object_id=frame["object_id"], rect=[0, 0, 128, 128], window="none", subtract_mean=True)
        foreign = call("gpa", "foreign-gpa", object_id=fft["object_id"], g_vectors=[[.125, 0], [0, .125]],
                       mask_sigma=.025, reference_rect=[24, 24, 40, 40], reference_mode="fixed_g",
                       reference_text="Prescribed analytic phase gauge", source_domain="real_space_lattice",
                       source_domain_text="Public constructed periodic image")
        actual_read = self.workspace.object
        self.assertEqual(actual_read(foreign["object_id"])[0]["request_id"], "foreign-gpa")
        parent, child = self.dispatched()
        response = {"ok": True, "state": "completed", "backend": worker.BACKEND,
                    "request_id": child["request_id"], "object_id": foreign["object_id"]}
        self.save({"request_id": child["request_id"], "parameters": child,
                   "parameters_sha256": hashlib.sha256(worker.canonical(child)).hexdigest(),
                   "state": "completed", "response": response})
        def proof(ident):
            return self.object_proof(ident) if ident in (self.root_id, self.plan["object_id"]) else actual_read(ident)
        before = {p: p.read_bytes() for p in self.workspace.root.rglob("*") if p.is_file()}
        with patch.object(self.workspace, "object", side_effect=proof), patch.object(worker.Workspace, "action") as action:
            with self.assertRaisesRegex(worker.WorkspaceError, "creator|kind"):
                journal.recovery(self.workspace, parent, worker)
        action.assert_not_called()
        self.assertEqual({p: p.read_bytes() for p in before}, before)

    def test_no_child_checks_plan_identity_and_both_real_preflight_reservations(self):
        parent, _ = self.dispatched()
        attempt = parent["method_attempt"]
        attempt.pop("child_request_id")
        attempt.pop("child_request")
        attempt["phase"] = "preflight"
        initial = {"phase": "preflight", "reserved_cost": {"method_calls": 1, "fft_pixels": 0,
                                                           "gpa_band_pixels": 0, "topology_path_samples": 0}}
        for value in (initial, attempt):
            parent["method_attempt"] = copy.deepcopy(value)
            self.save(parent)
            with patch.object(worker.Workspace, "object", side_effect=self.object_proof):
                result = journal.recovery(self.workspace, parent, worker)
            self.assertEqual(result["children"], [])
            self.assertEqual(result["reserved_cost"], value["reserved_cost"])
            self.assertFalse(result["release_authorized"])
        mutations = (
            lambda row: row["method_attempt"]["reserved_cost"].update(gpa_band_pixels=1),
            lambda row: row["method_attempt"].update(plan_object_id="f"*32),
            lambda row: row["method_attempt"].update(phase="dispatching"),
            lambda row: row["method_attempt"].update(action_key="0"*64),
        )
        for mutate in mutations:
            forged = copy.deepcopy(parent)
            mutate(forged)
            self.save(forged)
            with patch.object(worker.Workspace, "object", side_effect=self.object_proof):
                with self.assertRaises(worker.WorkspaceError):
                    journal.recovery(self.workspace, forged, worker)
        parent["method_attempt"] = copy.deepcopy(initial)
        parent["method_attempt"]["reserved_cost"]["gpa_band_pixels"] = 1
        self.save(parent)
        with patch.object(worker.Workspace, "object", side_effect=self.object_proof):
            with self.assertRaises(worker.WorkspaceError):
                journal.recovery(self.workspace, parent, worker)
        parent["method_attempt"] = copy.deepcopy(initial)
        # Keep the original request fingerprint valid: only the target plan's
        # independently qualified identity is wrong in this controlled proof.
        self.save(parent)
        self.plan["object_id"] = "f"*32
        with patch.object(worker.Workspace, "object", return_value=(self.plan, self.workspace.root)):
            with self.assertRaises(worker.WorkspaceError):
                journal.recovery(self.workspace, parent, worker)

    def test_non_object_claim_is_invalid_without_losing_missing_child_diagnosis(self):
        parent, child = self.dispatched()
        claim = self.workspace.root / "provider-execution.lock"
        for value in ([], None, 42, "not-a-claim"):
            claim.write_bytes(worker.canonical(value))
            before = {p: p.read_bytes() for p in self.workspace.root.rglob("*") if p.is_file()}
            with self.subTest(value=value), patch.object(worker.Workspace, "object", side_effect=self.object_proof), \
                 patch.object(worker.Workspace, "action") as action:
                result = journal.recovery(self.workspace, parent, worker)
                action.assert_not_called()
                self.assertEqual(result["claim"]["state"], "unreadable_or_invalid")
                self.assertEqual(result["children"], [{"request_id": child["request_id"], "state": "missing", "automatic_retry": False}])
                self.assertFalse(result["release_authorized"])
                self.assertEqual({p: p.read_bytes() for p in before}, before)

    def test_prepared_parent_query_exposes_verified_completed_child_without_mutating_or_dispatch(self):
        parent, child = self.dispatched()
        response = {"ok": True, "state": "completed", "backend": worker.BACKEND,
                    "request_id": child["request_id"], "object_id": "d"*32}
        self.save({"request_id": child["request_id"], "parameters": child,
                   "parameters_sha256": hashlib.sha256(worker.canonical(child)).hexdigest(),
                   "state": "completed", "response": response})
        claim = self.workspace.root / "provider-execution.lock"
        claim.write_bytes(worker.canonical({"schema_version": 1, "request_id": parent["request_id"],
                                           "pid": 123, "nonce": "f"*32}))
        before = {p: p.read_bytes() for p in self.workspace.root.rglob("*") if p.is_file()}
        with patch.object(worker.Workspace, "object", side_effect=self.object_proof), \
             patch.object(worker.Workspace, "action") as action:
            result = worker._execute({"workspace": str(self.workspace.root), "action": "result",
                                      "query_request_id": parent["request_id"]})
        action.assert_not_called()
        self.assertEqual(result["state"], "unknown")
        partial = result["partial_results"]
        self.assertEqual(partial["children"][0]["request_id"], child["request_id"])
        self.assertEqual(partial["children"][0]["state"], "completed")
        self.assertEqual(partial["reserved_cost"], self.cost)
        self.assertFalse(partial["release_authorized"])
        self.assertEqual(partial["claim"]["owner_liveness"], "not_established")
        self.assertEqual({p: p.read_bytes() for p in before}, before)

    def test_missing_or_prepared_child_remains_unknown_and_forged_child_is_refused(self):
        parent, child = self.dispatched()
        proof = patch.object(worker.Workspace, "object", side_effect=self.object_proof)
        proof.start()
        self.addCleanup(proof.stop)
        query = {"workspace": str(self.workspace.root), "action": "result", "query_request_id": parent["request_id"]}
        missing = worker._execute(query)["partial_results"]
        self.assertEqual(missing["children"][0]["state"], "missing")
        self.assertFalse(missing["release_authorized"])
        saved = {"request_id": child["request_id"], "state": "prepared", "parameters": child,
                 "parameters_sha256": hashlib.sha256(worker.canonical(child)).hexdigest()}
        self.save(saved)
        self.assertEqual(worker._execute(query)["partial_results"]["children"][0]["state"], "unknown")
        for mutate in (lambda row: row["parameters"].update(reference_text="Changed source"),
                       lambda row: row.update(parameters_sha256="0"*64)):
            changed = copy.deepcopy(saved)
            mutate(changed)
            self.save(changed)
            with self.assertRaises(worker.WorkspaceError):
                worker._execute(query)

    def test_legacy_oversized_child_is_durable_preflight_failure_without_dispatch(self):
        request = self.record(1)["parameters"]
        params = {"source_domain": "real_space_lattice", "source_domain_text": "Public constructed image",
                  "reference_mode": "fixed_g", "reference_text": "x"*2001, "mask_sigma": .012}
        plan = {"actions": [{"action_id": request["action_id"], "kind": "gpa", "parameters": params}]}
        with patch.object(worker.Workspace, "object", side_effect=[self.root_proof(), (plan, self.workspace.root)]), \
             patch.object(worker.Workspace, "action") as action:
            result = worker._execute(request)
            repeated = worker._execute(request)
        action.assert_not_called()
        self.assertEqual(result, repeated)
        self.assertEqual(result["state"], "failed")
        self.assertEqual(result["error"]["code"], "INVALID_ARGUMENT")
        row = journal.read_attempts(self.workspace, self.root_id, worker)[0]
        self.assertEqual(row["costs"], {"method_calls": 1, "fft_pixels": 0,
                                      "gpa_band_pixels": 0, "topology_path_samples": 0})
        self.assertEqual(row["method_attempt"]["phase"], "preflight")

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
                 "budget": {"method_calls": 8, "fft_pixels": 0, "gpa_band_pixels": 262144,
                            "topology_path_samples": 10000}},
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
