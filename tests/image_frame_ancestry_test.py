"""Read-only ancestry contract; no FFT, GPA, simulation or numerical oracle."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker


def ident(number):
    return format(number, "032x")


class Records:
    def __init__(self, records):
        self.records, self.calls = records, []

    def object(self, key):
        self.calls.append(key)
        record = self.records[key]
        if isinstance(record, Exception):
            raise record
        return copy.deepcopy(record), None


def record(number, kind="annotate", **values):
    return {"object_id": ident(number), "kind": kind, "backend": worker.BACKEND, **values}


class AncestryProjectionTests(unittest.TestCase):
    def test_thirteen_nodes_preserve_every_original_object_qualification(self):
        records = {ident(n): record(n, parent_object_id=ident(n+1)) for n in range(1, 13)}
        records[ident(13)] = record(13, "frame", frame_index=2, source_object_id=ident(99), dm_dataset_index=1,
                                   dm_plane_selection={"axis_indices": [0, 2]})
        records[ident(1)].update(annotations=[{"note": "not in ancestry"}], png_base64="not in ancestry")
        source = Records(records)
        before = copy.deepcopy(records)
        result = worker.frame_ancestry(source, records[ident(1)])
        self.assertEqual(source.calls, [ident(n) for n in range(2, 14)])
        self.assertEqual(len(result["records"]), 13)
        self.assertEqual(result["records"][-1]["dm_plane_selection"], {"axis_indices": [0, 2]})
        self.assertNotIn("annotations", result["records"][0])
        self.assertNotIn("png_base64", result["records"][0])
        self.assertEqual(records, before)

    def test_nullish_choice_does_not_skip_a_false_or_empty_parent(self):
        for value in (False, 0, ""):
            with self.subTest(value=value):
                source = Records({ident(2): record(2, "frame", frame_index=0)})
                result = worker.frame_ancestry(source, record(1, parent_object_id=value, base_object_id=ident(2)))
                self.assertEqual(len(result["records"]), 1)
                self.assertEqual(source.calls, [])

    def test_null_parent_uses_base_before_source(self):
        source = Records({ident(2): record(2, "frame", frame_index=0), ident(3): record(3, "frame", frame_index=1)})
        result = worker.frame_ancestry(source, record(1, parent_object_id=None, base_object_id=ident(2), source_object_id=ident(3)))
        self.assertEqual(result["records"][-1]["object_id"], ident(2))
        self.assertEqual(source.calls, [ident(2)])

    def test_parent_is_not_replaced_by_a_short_render_base(self):
        source = Records({ident(2): record(2, "frame", frame_index=4), ident(3): record(3, "frame", frame_index=9)})
        result = worker.frame_ancestry(source, record(1, parent_object_id=ident(2), render_base_object_id=ident(3)))
        self.assertEqual(result["records"][-1]["frame_index"], 4)
        self.assertEqual(source.calls, [ident(2)])

    def test_frame_source_and_compare_are_terminals(self):
        for kind in ("frame", "tiff_source", "dm_source", "compare"):
            with self.subTest(kind=kind):
                source = Records({})
                result = worker.frame_ancestry(source, record(1, kind, parent_object_id=ident(2)))
                self.assertEqual(len(result["records"]), 1)
                self.assertEqual(source.calls, [])

    def test_cycle_is_qualified_until_the_original_repeated_record(self):
        first, second = record(1, parent_object_id=ident(2)), record(2, parent_object_id=ident(1))
        source = Records({ident(1): first, ident(2): second})
        result = worker.frame_ancestry(source, first)
        self.assertEqual([r["object_id"] for r in result["records"]], [ident(1), ident(2), ident(1)])
        self.assertEqual(source.calls, [ident(2), ident(1)])

    def test_depth_retains_the_65th_fresh_read_and_its_failure(self):
        records = {ident(n): record(n, parent_object_id=ident(n+1)) for n in range(1, 65)}
        records[ident(65)] = record(65, "frame", frame_index=0)
        source = Records(records)
        self.assertEqual(len(worker.frame_ancestry(source, records[ident(1)])["records"]), 65)
        self.assertEqual(source.calls, [ident(n) for n in range(2, 66)])
        records[ident(65)] = worker.WorkspaceError("CORRUPT_OBJECT", "controlled 65th refusal")
        with self.assertRaisesRegex(worker.WorkspaceError, "65th refusal"):
            worker.frame_ancestry(Records(records), records[ident(1)])

    def test_ancestor_ok_and_state_are_not_normalized_to_success(self):
        source = Records({ident(2): record(2, "frame", frame_index=0, ok=False)})
        with self.assertRaisesRegex(worker.WorkspaceError, "successful"):
            worker.frame_ancestry(source, record(1, parent_object_id=ident(2)))
        source = Records({ident(2): record(2, "frame", frame_index=0, state="unknown")})
        result = worker.frame_ancestry(source, record(1, parent_object_id=ident(2)))
        self.assertEqual(result["records"][-1]["state"], "unknown")  # Adapter must reject it.

    def test_invalid_namespace_link_is_not_read(self):
        source = Records({})
        self.assertEqual(len(worker.frame_ancestry(source, record(1, parent_object_id="../outside"))["records"]), 1)
        self.assertEqual(source.calls, [])

    def test_original_source_description_fields_are_preserved_without_guessing(self):
        frame = record(2, "frame", frame_index=1, source_object_id=ident(3), source_identity={"path": "synthetic.dm4"},
                       source_file_format="dm4", source_reader="explicit-reader", upstream_backend="declared-backend")
        result = worker.frame_ancestry(Records({ident(2): frame}), record(1, parent_object_id=ident(2)))
        for key in ("source_identity", "source_file_format", "source_reader", "upstream_backend", "frame_index"):
            self.assertEqual(result["records"][-1][key], frame[key])
        self.assertNotIn("data_meaning", result["records"][-1])

    def test_budget_fallback_does_not_release_a_forged_persisted_projection(self):
        initial = record(1, "frame", frame_index=0, frame_ancestry={"forged": True}, source_identity={"path": "x" * (512*1024)})
        source = Records({ident(1): initial})
        with patch.object(worker, "Workspace", return_value=source):
            response = worker._execute_core({"action": "get", "workspace": "unused", "object_id": ident(1), "include_frame_ancestry": True})
        self.assertNotIn("frame_ancestry", response)
        self.assertEqual(initial["frame_ancestry"], {"forged": True})

    def test_false_and_default_leave_the_original_metadata_reply_unchanged(self):
        source = Records({ident(1): record(1, "frame", frame_index=0, frame_ancestry={"legacy": True})})
        with patch.object(worker, "Workspace", return_value=source):
            default = worker._execute_core({"action": "get", "workspace": "unused", "object_id": ident(1)})
            explicit = worker._execute_core({"action": "get", "workspace": "unused", "object_id": ident(1), "include_frame_ancestry": False})
        self.assertEqual(default, explicit)
        self.assertEqual(default["frame_ancestry"], {"legacy": True})

    def test_non_boolean_flags_reject_before_workspace_access(self):
        for flag in (None, 0, 1, "true", [], {}):
            with self.subTest(flag=flag), patch.object(worker, "Workspace", side_effect=AssertionError("must not access")):
                with self.assertRaisesRegex(worker.WorkspaceError, "boolean"):
                    worker._execute_core({"action": "get", "workspace": "unused", "object_id": ident(1), "include_frame_ancestry": flag})


class RealQualificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="public-ancestry-contract-")
        self.root = Path(self.temporary.name)
        (self.root / "objects").mkdir()
        (self.root / "requests").mkdir()
        self.frame = self.commit(record(3, "frame", frame_index=0, source_object_id=ident(4)))
        self.parent = self.commit(record(2, parent_object_id=ident(3)))
        self.initial = self.commit(record(1, parent_object_id=ident(2)))
        self.workspace = worker.Workspace(str(self.root), False)

    def tearDown(self):
        self.temporary.cleanup()

    def commit(self, value):
        value = copy.deepcopy(value)
        value["request_id"] = "create-" + value["object_id"]
        directory = self.root / "objects" / value["object_id"]
        directory.mkdir(exist_ok=True)
        payload = b"public bounded payload"
        (directory / "payload.bin").write_bytes(payload)
        value["files_sha256"] = {"payload.bin": hashlib.sha256(payload).hexdigest()}
        (directory / "object.json").write_bytes(worker.canonical(value))
        response = {"ok": True, "state": "completed", "backend": worker.BACKEND, "request_id": value["request_id"], **value}
        journal = {"state": "completed", "object_manifest_sha256": worker.sha_file(directory / "object.json"), "response": response}
        (self.root / "requests" / (value["request_id"] + ".json")).write_bytes(worker.canonical(journal))
        return value

    def test_real_objects_and_creator_journals_are_freshly_qualified(self):
        initial, _ = self.workspace.object(ident(1))
        result = worker.frame_ancestry(self.workspace, initial)
        self.assertEqual([entry["object_id"] for entry in result["records"]], [ident(1), ident(2), ident(3)])

    def test_corrupt_ancestor_payload_is_not_hidden_by_optional_projection(self):
        initial, _ = self.workspace.object(ident(1))
        (self.root / "objects" / ident(2) / "payload.bin").write_bytes(b"changed")
        with self.assertRaisesRegex(worker.WorkspaceError, "Immutable object file"):
            worker.frame_ancestry(self.workspace, initial)

    def test_corrupt_ancestor_creator_is_not_hidden_by_optional_projection(self):
        initial, _ = self.workspace.object(ident(1))
        creator = self.root / "requests" / (self.parent["request_id"] + ".json")
        value = json.loads(creator.read_bytes())
        value["object_manifest_sha256"] = "0" * 64
        creator.write_bytes(worker.canonical(value))
        with self.assertRaisesRegex(worker.WorkspaceError, "manifest changed"):
            worker.frame_ancestry(self.workspace, initial)

    def test_wrong_ancestor_backend_is_not_hidden_by_optional_projection(self):
        initial, _ = self.workspace.object(ident(1))
        self.commit({**self.parent, "backend": "different-provider"})
        with self.assertRaisesRegex(worker.WorkspaceError, "Object identity mismatch"):
            worker.frame_ancestry(self.workspace, initial)


if __name__ == "__main__":
    unittest.main()
