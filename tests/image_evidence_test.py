"""Bounded evidence uses real scientific records; display projections are not journals."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import image_workspace as worker


class Evidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="public-evidence-")
        cls.root = Path(cls.temp.name)
        cls.workspace = cls.root / "workspace"
        y, x = np.indices((64, 64))
        cls.values = (np.cos(2*np.pi*x/8+.2) + .8*np.cos(2*np.pi*y/16-.1)).astype(np.float32)
        cls.source = cls.root / "public-cosines.tiff"
        tifffile.imwrite(cls.source, cls.values, photometric="minisblack")
        cls.frame = cls.call("frame", request_id="frame", object_id=cls.call("open", request_id="open", source_path=str(cls.source))["object_id"], frame_index=0)
        cls.field = cls.call("spatial_field", request_id="field", object_id=cls.frame["object_id"], window_sizes=[32], stride_xy=[32,32], max_windows=4,
                             coordinate_domain="pixel", max_size=256, max_peaks=4, window="none", subtract_mean=True,
                             peak_options={"threshold_rel":.18,"refinement":"quadratic"})
        cls.map_request = {"action":"domain_map", "workspace":str(cls.workspace), "object_id":cls.field["object_id"],
                           "tolerance":.02, "angles_degrees":[0,90], "max_size":256, "request_id":"map-compact-first"}
        cls.compact = worker.execute({**cls.map_request, "response_detail":"compact"})
        assert cls.compact["ok"], cls.compact
        cls.compact = cls.compact["result"]
        cls.mapped = worker.execute(cls.map_request)["result"]

    @classmethod
    def tearDownClass(cls):
        np.testing.assert_array_equal(tifffile.imread(cls.source), cls.values)
        cls.temp.cleanup()

    @classmethod
    def call(cls, action, **args):
        reply = worker.execute({"action":action, "workspace":str(cls.workspace), **args})
        if not reply.get("ok"):
            raise AssertionError(reply)
        return reply["result"]

    def test_compact_first_write_full_replay_original_recovery_and_stable_keys(self):
        compact, full = self.compact, self.mapped
        self.assertEqual(compact["evidence_format"], "image-evidence-summary-v1")
        self.assertFalse(compact["authoritative_record"])
        self.assertFalse(compact["inline_image"])
        self.assertEqual(compact["image_path"], full["image_path"])
        self.assertEqual(compact["preview_ref"], {"tool":"image_info","arguments":{"object_id":full["object_id"],"response_detail":"full"}})
        self.assertEqual(compact["object_id"], full["object_id"])
        self.assertNotIn("edges", compact)
        self.assertEqual(compact["collection_counts"]["neighbors"], len(full["edges"]))
        for left, right in zip(compact["samples"], full["samples"]):
            self.assertEqual(left["observation_key"], worker.active_analysis.observation_key(self.field, right["rect_xyxy"], worker))
            self.assertEqual(left["fft_object_id"], right["fft_object_id"])
            self.assertEqual(left["source_array"], right["source_array"])
        original = json.loads((self.workspace / "requests" / "map-compact-first.json").read_text())
        self.assertNotIn("response_detail", original["parameters"])
        self.assertNotIn("evidence_format", original["response"])
        self.assertEqual(original["response"]["object_id"], full["object_id"])
        self.assertEqual(self.call("result", query_request_id="map-compact-first"), full)
        self.assertEqual(self.call("result", query_request_id="map-compact-first", response_detail="compact"), compact)
        self.assertEqual(self.call("get", object_id=full["object_id"], response_detail="full"), full)

    def test_compact_budget_refusal_preserves_completed_operation_and_original_recovery(self):
        before = sum(json.loads(p.read_text())["kind"] == "fft" for p in self.workspace.glob("objects/*/object.json"))
        parameters = {**self.map_request, "request_id":"map-projection-budget"}
        with patch.object(worker.evidence, "MAX_DETAIL_BYTES", 100):
            refused = worker.execute({**parameters, "response_detail":"compact"})
        self.assertFalse(refused["ok"])
        self.assertEqual(refused["state"], "projection_failed")
        self.assertEqual(refused["authoritative_record_state"], "completed")
        self.assertFalse(refused["automatic_retry"])
        self.assertEqual(refused["projection_error"]["code"], "EVIDENCE_BUDGET_EXCEEDED")
        self.assertEqual(refused["original_result"]["arguments"]["request_id"], parameters["request_id"])
        self.assertEqual(refused["bounded_evidence"]["arguments"]["section"], "samples")
        page = self.call("evidence", **refused["bounded_evidence"]["arguments"])
        self.assertEqual(len(page["rows"]), 1)
        journal = json.loads((self.workspace/"requests"/(parameters["request_id"]+".json")).read_text())
        self.assertEqual(journal["state"], "completed")
        self.assertNotIn("projection_error", journal["response"])
        recovered = self.call("result", query_request_id=parameters["request_id"])
        self.assertEqual(recovered["object_id"], refused["object_id"])
        self.assertEqual(worker.execute(parameters)["result"], recovered)
        after = sum(json.loads(p.read_text())["kind"] == "fft" for p in self.workspace.glob("objects/*/object.json"))
        self.assertEqual(before, after)

    def test_bounded_detail_exact_rows_no_records_and_wrong_manifest_refused(self):
        before = sorted(str(p.relative_to(self.workspace)) for p in self.workspace.rglob("*"))
        request = {"object_id":self.mapped["object_id"], "manifest_sha256":self.compact["manifest_sha256"], "section":"samples", "offset":1, "limit":1}
        detail = self.call("evidence", **request)
        self.assertEqual(detail["rows"], self.mapped["samples"][1:2])
        self.assertEqual(detail["next_offset"], 2)
        self.assertEqual(detail["request_id"], "map-compact-first")
        self.assertEqual(detail["provider_scope"]["session"], "workspace-journal-v1")
        self.assertEqual(self.call("evidence", **{**request,"section":"summary","offset":0}), self.compact)
        for updates in ({"manifest_sha256":"0"*64}, {"section":"../../object.json"}, {"offset":99}, {"limit":9}, {"source_path":str(self.source)}):
            denied = worker.execute({"action":"evidence","workspace":str(self.workspace),**request,**updates})
            self.assertFalse(denied["ok"], denied)
        self.assertEqual(sorted(str(p.relative_to(self.workspace)) for p in self.workspace.rglob("*")), before)

    def test_small_ordinary_measurements_keep_every_semantic_field(self):
        ident = self.field["samples"][0]["measurement_object_ids"][0]
        full = self.call("get", object_id=ident)
        compact = self.call("get", object_id=ident, response_detail="compact")
        for key, value in full.items():
            self.assertEqual(compact[key], value)
        self.assertEqual(compact["calibration_status"], "unknown")
        # Pure projection compatibility: an ordinary provider may already carry
        # an explicit status outside xy_calibration; a display header cannot
        # replace it. Integrity qualification is covered by the real paths above.
        ordinary = copy.deepcopy(full)
        ordinary["calibration_status"] = "explicit_unverified_source"
        with patch.object(worker.evidence, "_binding", return_value=(ordinary, "b"*64)):
            projected = worker.evidence.summary(worker.Workspace(str(self.workspace), False), ordinary, worker)
        for key, value in ordinary.items():
            self.assertEqual(projected[key], value)

    def test_compact_and_detail_cannot_bypass_consistent_journal_tamper(self):
        directory = self.workspace / "objects" / self.mapped["object_id"]
        manifest = directory / "object.json"
        journal = self.workspace / "requests" / "map-compact-first.json"
        old_manifest, old_journal = manifest.read_bytes(), journal.read_bytes()
        try:
            data = json.loads(old_manifest)
            data["tolerance"] = .04
            manifest.write_bytes(worker.canonical(data)+b"\n")
            record = json.loads(old_journal)
            record["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,"request_id":data["request_id"],**data}
            record["object_manifest_sha256"] = worker.sha_file(manifest)
            journal.write_bytes(worker.canonical(record)+b"\n")
            for args in ({"action":"get","object_id":data["object_id"],"response_detail":"compact"},
                         {"action":"evidence","object_id":data["object_id"],"manifest_sha256":record["object_manifest_sha256"],"section":"summary"}):
                denied = worker.execute({"workspace":str(self.workspace),**args})
                self.assertFalse(denied["ok"])
                self.assertEqual(denied["error"]["code"], "CORRUPT_OBJECT")
        finally:
            manifest.write_bytes(old_manifest)
            journal.write_bytes(old_journal)

    def test_qualification_memo_clears_between_top_calls_and_after_error(self):
        workspace = worker.Workspace(str(self.workspace), False)
        workspace.object(self.field["object_id"])
        journal = self.workspace / "requests" / "frame.json"
        original_journal = journal.read_bytes()
        try:
            record = json.loads(original_journal)
            record["state"] = "failed"
            journal.write_bytes(worker.canonical(record)+b"\n")
            with self.assertRaises(worker.WorkspaceError):
                workspace.object(self.field["object_id"])
        finally:
            journal.write_bytes(original_journal)
        self.assertFalse(hasattr(workspace, "_qualification_snapshots"))
        payload = self.workspace / "objects" / self.frame["object_id"] / "data.npy"
        original = payload.read_bytes()
        try:
            payload.write_bytes(original[:-1]+bytes([original[-1]^1]))
            with self.assertRaises(worker.WorkspaceError):
                workspace.object(self.field["object_id"])
            self.assertFalse(hasattr(workspace, "_qualification_snapshots"))
            self.assertEqual(workspace._qualification_depth, 0)
        finally:
            payload.write_bytes(original)
        workspace.object(self.field["object_id"])

    def test_repeated_descendant_still_rereads_own_payload(self):
        workspace = worker.Workspace(str(self.workspace), False)
        ident = self.field["samples"][0]["fft_object_id"]
        payload = self.workspace / "objects" / ident / "data.npy"
        original, record, seen = payload.read_bytes(), workspace._object_record, []
        def intercepted(value):
            if value == ident:
                seen.append(value)
                if len(seen) == 2:
                    payload.write_bytes(original[:-1]+bytes([original[-1]^1]))
            return record(value)
        try:
            with patch.object(workspace, "_object_record", side_effect=intercepted):
                with self.assertRaises(worker.WorkspaceError):
                    workspace.object(self.field["object_id"])
            self.assertGreaterEqual(len(seen), 2)
            self.assertFalse(hasattr(workspace, "_qualification_snapshots"))
        finally:
            payload.write_bytes(original)

    def test_memo_reuse_rejects_coherently_changed_own_manifest(self):
        workspace = worker.Workspace(str(self.workspace), False)
        ident = self.field["samples"][0]["fft_object_id"]
        manifest = self.workspace / "objects" / ident / "object.json"
        original_manifest = manifest.read_bytes()
        old = json.loads(original_manifest)
        journal = self.workspace / "requests" / (old["request_id"]+".json")
        original_journal, record, seen = journal.read_bytes(), workspace._object_record, []
        def intercepted(value):
            if value == ident:
                seen.append(value)
                if len(seen) == 2:
                    changed = json.loads(original_manifest)
                    changed["created_utc"] = "changed-during-qualification"
                    manifest.write_bytes(worker.canonical(changed)+b"\n")
                    original = json.loads(original_journal)
                    original["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,"request_id":changed["request_id"],**changed}
                    original["object_manifest_sha256"] = worker.sha_file(manifest)
                    journal.write_bytes(worker.canonical(original)+b"\n")
            return record(value)
        try:
            with patch.object(workspace, "_object_record", side_effect=intercepted):
                with self.assertRaisesRegex(worker.WorkspaceError, "Qualified descendant changed"):
                    workspace.object(self.field["object_id"])
            self.assertGreaterEqual(len(seen), 2)
            self.assertFalse(hasattr(workspace, "_qualification_snapshots"))
        finally:
            manifest.write_bytes(original_manifest)
            journal.write_bytes(original_journal)

    def test_indirect_cached_field_hit_rechecks_its_fft_child_payload(self):
        workspace = worker.Workspace(str(self.workspace), False)
        payload = self.workspace / "objects" / self.field["samples"][0]["fft_object_id"] / "data.npy"
        original, validate = payload.read_bytes(), worker.spatial_domains.validate_references
        visited = []
        def then_revisit(current, metadata, api):
            validate(current, metadata, api)
            if metadata["object_id"] == self.mapped["object_id"]:
                visited.append(metadata["object_id"])
                payload.write_bytes(original[:-1]+bytes([original[-1]^1]))
                # A genuine second aggregate access within the same map
                # qualification; no direct FFT visit is added by the test.
                current.object(self.field["object_id"])
        try:
            with patch.object(worker.spatial_domains, "validate_references", side_effect=then_revisit):
                with self.assertRaises(worker.WorkspaceError):
                    workspace.object(self.mapped["object_id"])
            self.assertEqual(len(visited), 1)
        finally:
            payload.write_bytes(original)

    def test_indirect_cached_field_hit_rechecks_creator_journal_parameters(self):
        workspace = worker.Workspace(str(self.workspace), False)
        atlas_id = self.field["samples"][0]["atlas_object_id"]
        atlas = json.loads((self.workspace / "objects" / atlas_id / "object.json").read_text())
        journal = self.workspace / "requests" / (atlas["request_id"]+".json")
        original, validate = journal.read_bytes(), worker.spatial_domains.validate_references
        visited = []
        def then_revisit(current, metadata, api):
            validate(current, metadata, api)
            if metadata["object_id"] == self.mapped["object_id"]:
                visited.append(metadata["object_id"])
                changed = json.loads(original)
                changed["parameters"]["max_size"] = 257
                changed["parameters_sha256"] = worker.hashlib.sha256(worker.canonical(changed["parameters"])).hexdigest()
                journal.write_bytes(worker.canonical(changed)+b"\n")
                current.object(self.field["object_id"])
        try:
            with patch.object(worker.spatial_domains, "validate_references", side_effect=then_revisit):
                with self.assertRaises(worker.WorkspaceError):
                    workspace.object(self.mapped["object_id"])
            self.assertEqual(len(visited), 1)
        finally:
            journal.write_bytes(original)

    def test_direct_record_helper_rechecks_qualified_aggregate_child_closure(self):
        workspace = worker.Workspace(str(self.workspace), False)
        payload = self.workspace / "objects" / self.field["samples"][0]["fft_object_id"] / "data.npy"
        original, validate = payload.read_bytes(), worker.spatial_domains.validate_references
        visited = []
        def then_revisit(current, metadata, api):
            validate(current, metadata, api)
            if metadata["object_id"] == self.mapped["object_id"]:
                visited.append(metadata["object_id"])
                payload.write_bytes(original[:-1]+bytes([original[-1]^1]))
                # qualified_field-style helpers use this own-record path rather
                # than object(); they must not escape closure rechecks either.
                current._object_record(self.field["object_id"])
        try:
            with patch.object(worker.spatial_domains, "validate_references", side_effect=then_revisit):
                with self.assertRaises(worker.WorkspaceError):
                    workspace.object(self.mapped["object_id"])
            self.assertEqual(len(visited), 1)
        finally:
            payload.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
