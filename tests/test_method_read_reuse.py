"""Real immutable records: fewer redundant admissions, unchanged rejection paths."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker
from tools import image_method_loop as method
from tools.qualify_method_agent import mcp_settings


class QualificationPolicy(unittest.TestCase):
    def test_analysis_approval_is_only_the_five_named_local_tools(self):
        allowed, settings = mcp_settings(Path.cwd(), Path.cwd()/"synthetic.json", sys.executable, False)
        self.assertEqual(set(allowed), {"image_info", "image_result", "image_method_plan", "image_method_step", "image_method_next"})
        self.assertEqual(settings["approval_policy"], "never")
        self.assertEqual(settings["mcp_servers.microscopy_workbench.default_tools_approval_mode"], "prompt")
        approved = {key.split(".tools.")[1].split(".")[0] for key, value in settings.items()
                    if ".tools." in key and value == "approve"}
        self.assertEqual(approved, set(allowed))

    def test_recovery_cannot_dispatch_science_or_create_a_root(self):
        allowed, settings = mcp_settings(Path.cwd(), Path.cwd()/"synthetic.json", sys.executable, True)
        self.assertEqual(allowed, ["image_info", "image_result"])
        self.assertEqual(settings["mcp_servers.microscopy_workbench.enabled_tools"], allowed)


class MethodReads(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="public-method-read-")
        cls.root = Path(cls.temp.name).resolve()
        cls.workspace = cls.root / "workspace"
        cls.source = cls.root / "analytic.tiff"
        y, x = np.indices((128, 128))
        tifffile.imwrite(cls.source, (np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8)).astype("float32"))
        def call(action, **args):
            response = worker.execute(dict(workspace=str(cls.workspace), action=action, request_id=action, **args))
            if not response["ok"]:
                raise AssertionError(response)
            return response["result"]
        opened = call("open", source_path=str(cls.source))
        frame = call("frame", object_id=opened["object_id"], frame_index=0)
        fft = call("fft", object_id=frame["object_id"], rect=[0,0,128,128], window="none", subtract_mean=True)
        cls.seed = call("gpa", object_id=fft["object_id"], g_vectors=[[.125,0],[0,.125]], mask_sigma=.025,
                        reference_rect=[24,24,40,40], reference_mode="fixed_g", reference_text="Analytic test fixed carrier",
                        source_domain="real_space_lattice", source_domain_text="Public synthetic periodic lattice")
        cls.plan = call("method_plan", object_ids=[cls.seed["object_id"]], information={"goal":"projected_topology"},
                        budget={"method_calls":2,"fft_pixels":0,"gpa_band_pixels":32768,"topology_path_samples":4096})
        cls.revised = call("method_next", object_id=cls.plan["object_id"], user_stop=True)
        cls.seed_record = worker.read_json(cls.workspace/"objects"/cls.seed["object_id"]/"object.json")
        cls.revised_record = worker.read_json(cls.workspace/"objects"/cls.revised["object_id"]/"object.json")
        cls.protected = {p: p.read_bytes() for p in cls.workspace.rglob("*") if p.is_file()}

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def tearDown(self):
        for path, raw in self.protected.items():
            self.assertEqual(path.read_bytes(), raw)

    def test_seed_uses_one_fully_qualified_read_per_record_and_same_bundle(self):
        reader = worker.Workspace(str(self.workspace), False)
        with patch.object(reader, "object", wraps=reader.object) as observed:
            values, refs = method._seed(reader, [self.seed["object_id"]], worker)
        self.assertEqual([call.args[0] for call in observed.call_args_list].count(self.seed["object_id"]), 1)
        self.assertEqual(values, [self.seed_record])
        self.assertEqual(refs[0]["manifest_sha256"], worker.sha_file(self.workspace/"objects"/self.seed["object_id"]/"object.json"))
        different = copy.deepcopy(self.seed)
        different["parameters"]["mask_sigma"] *= 2
        with self.assertRaises(worker.WorkspaceError) as caught:
            worker.topology._source_bundle_records([
                (self.seed["object_id"], self.seed, self.workspace/"objects"/self.seed["object_id"]),
                (self.seed["object_id"], different, self.workspace/"objects"/self.seed["object_id"])], worker)
        self.assertEqual(caught.exception.code, "TOPOLOGY_SCOPE_MISMATCH")

    def test_same_workspace_rechecks_payload_and_creator_on_every_read(self):
        reader = worker.Workspace(str(self.workspace), False)
        for target in (self.workspace/"objects"/self.seed["object_id"]/"amplitude.npy",
                       self.workspace/"requests"/"gpa.json"):
            reader.object(self.revised["object_id"])
            original = target.read_bytes()
            try:
                corrupt = (worker.canonical({**worker.strict_json(original.decode()), "state":"failed"})
                           if target.suffix == ".json" else original + b"corruption")
                target.write_bytes(corrupt)
                with self.assertRaises(worker.WorkspaceError):
                    reader.object(self.revised["object_id"])
                if target.suffix == ".json":
                    target.write_bytes(original+b"corruption")
                    denied = worker.execute(dict(workspace=str(self.workspace), action="get", object_id=self.revised["object_id"]))
                    self.assertFalse(denied["ok"], "Malformed creator bytes must never yield saved science")
            finally:
                target.write_bytes(original)
            self.assertEqual(reader.object(self.revised["object_id"])[0], self.revised_record)

    def test_coherent_own_hashes_cannot_hide_changed_frozen_input_ref(self):
        record = copy.deepcopy(self.revised_record)
        record["input_refs"][0]["manifest_sha256"] = "0"*64
        manifest = self.workspace/"objects"/record["object_id"]/"object.json"
        journal = self.workspace/"requests"/record["request_id"]
        journal = journal.with_suffix(".json")
        original_manifest, original_journal = manifest.read_bytes(), journal.read_bytes()
        try:
            manifest.write_bytes(worker.canonical(record)+b"\n")
            receipt = worker.strict_json(original_journal.decode())
            receipt["object_manifest_sha256"] = worker.sha_file(manifest)
            receipt["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND, **record}
            journal.write_bytes(worker.canonical(receipt)+b"\n")
            self.assertEqual(worker.Workspace(str(self.workspace), False)._object_record(record["object_id"])[0], record)
            denied = worker.execute(dict(workspace=str(self.workspace), action="get", object_id=record["object_id"]))
            self.assertFalse(denied["ok"])
            self.assertEqual(denied["error"]["code"], "CORRUPT_OBJECT")
            self.assertIn("frozen original attempts", denied["error"]["message"])
        finally:
            manifest.write_bytes(original_manifest)
            journal.write_bytes(original_journal)


if __name__ == "__main__":
    unittest.main()
