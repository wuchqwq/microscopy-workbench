"""Version compatibility against an archived, hash-pinned v1 provider adapter.

Only public analytic textures are generated.  The JSON receipt additionally
records a real workspace made before the fix; its absolute paths are evidence,
not paths followed by this portable test.  The archived adapter is used only to
create v1 records.  All recovery, retry, export and revision assertions then use
the current unpatched provider, without running v1 science again.
"""

import copy
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import create_topology_fixtures as fixture
from tools import image_topology_core as current_core
from tools import image_topology_legacy_v1 as legacy_core
from tools import image_workspace as worker

FIXTURES = ROOT / "tests" / "fixtures"
GOLDEN = json.loads((FIXTURES / "topology_v1_compat.json").read_text(encoding="utf-8"))


def archived_adapter():
    """Load the exact pre-fix adapter, resolving its core to frozen v1 only."""
    source = FIXTURES / GOLDEN["legacy_provider_fixture"]
    if worker.sha_file(source) != GOLDEN["legacy_provider_sha256"]:
        raise AssertionError("The historical v1 adapter fixture changed")
    loader = importlib.machinery.SourceFileLoader("topology_adapter_v1_fixture", str(source))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"image_topology_core": legacy_core}):
        loader.exec_module(module)
    return module


class TopologyVersionCompatibility(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="topology-version-compat-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.workspace = self.root / "workspace"
        self.counter = 0
        self.source = self.root / "public-analytic-core-96.tiff"
        generation = GOLDEN["generation"]
        case = fixture.volterra_fixture(center_xy=generation["center_xy"],
                                        shape_yx=generation["shape_yx"])
        tifffile.imwrite(self.source, case["image"].astype(np.float32))
        self.source_hash = worker.sha_file(self.source)
        self.opened = self.call("open", request_id="v1-open", source_path=str(self.source))
        frame = self.call("frame", request_id="v1-frame", object_id=self.opened["object_id"], frame_index=0)
        calibration = self.call("calibrate", request_id="v1-calibration", object_id=frame["object_id"],
                                scope="image", xy_scale={"x": .02, "y": -.03, "unit": "nm"},
                                source_text="Public synthetic signed metric; not specimen calibration")
        self.fft = self.call("fft", request_id="v1-fft", object_id=calibration["object_id"],
                             rect=[0, 0, 256, 256], window="none", subtract_mean=True, max_size=256)
        gpa_parameters = dict(object_id=self.fft["object_id"], mask_sigma=fixture.MASK_SIGMA,
                              reference_rect=generation["reference_rect"], reference_mode="fixed_g",
                              source_domain="real_space_lattice", max_size=256,
                              source_domain_text="Known public synthetic real-space multitone texture",
                              reference_text="Public analytic fixture fixed-g reciprocal basis")
        first = self.call("gpa", request_id="v1-gpa-first", **gpa_parameters,
                          g_vectors=fixture.G_VECTORS[[0, 1]].tolist())
        second = self.call("gpa", request_id="v1-gpa-second", **gpa_parameters,
                           g_vectors=fixture.G_VECTORS[[0, 2]].tolist())
        self.parameters = {key: copy.deepcopy(value) for key, value in GOLDEN["pre_fix_receipt"]["request"].items()
                           if key not in ("action", "workspace", "request_id")}
        self.parameters["object_ids"] = [first["object_id"], second["object_id"]]
        self.old_request_id = GOLDEN["pre_fix_receipt"]["request"]["request_id"]
        # The historical adapter creates the historical layout; no v2 metadata
        # is generated and then relabelled to look like a v1 result.
        with patch.object(worker, "topology", archived_adapter()):
            self.old = self.call("topology", request_id=self.old_request_id, **self.parameters)
            self.old_export = self.call("export", request_id="v1-export-misgrouped",
                                        object_id=self.old["object_id"], output_dir=str(self.root / "v1-export"))
        self.protected = self.hashes()
        self.science_before = self.science_identities()

    def request(self, action, request_id=None, **kwargs):
        self.counter += 1
        return {"workspace": str(self.workspace), "action": action, **kwargs,
                **({"request_id": request_id or "compat-%d" % self.counter}
                   if action not in ("get", "result") else {})}

    def call(self, action, **kwargs):
        result = worker.execute(self.request(action, **kwargs))
        self.assertTrue(result["ok"], result)
        json.dumps(result, allow_nan=False)
        return result["result"]

    def refuse(self, action, code, **kwargs):
        response = worker.execute(self.request(action, **kwargs))
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["error"]["code"], code, response)
        return response

    def hashes(self):
        return {str(path.relative_to(self.root)): worker.sha_file(path)
                for path in self.root.rglob("*") if path.is_file()}

    def assert_protected_unchanged(self):
        for relative, digest in self.protected.items():
            self.assertEqual(worker.sha_file(self.root / relative), digest, relative)

    def science_identities(self):
        return {record["object_id"]: record["kind"]
                for path in (self.workspace / "objects").glob("*/object.json")
                if (record := worker.read_json(path))["kind"] in ("fft", "gpa")}

    def test_archived_v1_misgrouping_recovery_retry_export_and_v2_revision(self):
        self.assertEqual(worker.sha_file(Path(legacy_core.__file__)), GOLDEN["legacy_core_sha256"])
        self.assertEqual(self.old["report"]["algorithm"], GOLDEN["pre_fix_receipt"]["algorithm"])
        self.assertEqual(self.old["report"]["status"], "inconsistent_or_partial_evidence")
        self.assertNotIn("loop_groups", self.old["report"])
        self.assertEqual(self.old["report"]["reflections"][0]["canonical_winding_integers"], [-1, -1, 0])
        self.assertEqual(self.old["report"]["reflections"][0]["strictly_nested_valid_loop_pairs"], [[0, 1]])
        expected = GOLDEN["pre_fix_receipt"]["response"]
        # Historical report and payload layout stay version-specific.  Numeric
        # library versions are provenance and need not match on another host.
        self.assertEqual(self.old["array_manifest"], expected["array_manifest"])
        self.assertEqual(self.old["report"]["reflections"], expected["report"]["reflections"])
        directory = self.workspace / "objects" / self.old["object_id"]
        np.testing.assert_array_equal(np.load(directory / "loop_winding_integer.npy", allow_pickle=False),
                                      [[-1, 0, -1], [-1, 0, -1], [0, 0, 0]])
        # Reading old bytes must not silently recalculate them with either core.
        with patch.object(current_core, "analyze", side_effect=AssertionError("read reran v2 science")), \
             patch.object(legacy_core, "analyze", side_effect=AssertionError("read reran v1 science")):
            self.assertEqual(self.call("get", object_id=self.old["object_id"]), self.old)
            self.assertEqual(self.call("result", query_request_id=self.old_request_id), self.old)
            self.assertEqual(self.call("topology", request_id=self.old_request_id, **self.parameters), self.old)
            self.assertEqual(self.hashes(), self.protected)
            exported = self.call("export", object_id=self.old["object_id"],
                                 output_dir=str(self.root / "reopened-v1-export"))
        output = Path(exported["output_dir"])
        for name, digest in self.old["files_sha256"].items():
            if name.endswith(".npy") or name in ("topology-report.json", "topology-circuits.csv", "preview.png"):
                self.assertEqual(worker.sha_file(output / name), digest, name)
        self.assertEqual(worker.read_json(output / "manifest.json")["scientific_object"],
                         worker.read_json(directory / "object.json"))
        with patch.object(current_core, "analyze", wraps=current_core.analyze) as current_analysis:
            revised = self.call("topology", request_id="v2-revise-v1", previous_topology_id=self.old["object_id"],
                                **self.parameters)
        self.assertEqual(current_analysis.call_count, 1)
        self.assertNotEqual(revised["report"]["algorithm"], self.old["report"]["algorithm"])
        self.assertEqual(revised["report"]["algorithm"], current_core.ALGORITHM_VERSION)
        self.assertEqual(revised["input_dependency"], self.old["input_dependency"])
        self.assertEqual(revised["object_ids"], self.old["object_ids"])
        self.assertEqual(revised["input_dependency"]["common"]["fft"]["object_id"], self.fft["object_id"])
        self.assertEqual(revised["history"], [{"object_id": self.old["object_id"], "request_id": self.old_request_id,
                                               "manifest_sha256": worker.sha_file(directory / "object.json")}])
        groups = {frozenset(group["loop_indices"]): group for group in revised["report"]["loop_groups"]}
        self.assertEqual(set(groups), {frozenset([0, 1]), frozenset([2])})
        self.assertEqual(groups[frozenset([0, 1])]["status"], "projected_topological_evidence")
        np.testing.assert_allclose(groups[frozenset([0, 1])]["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-6)
        self.assertEqual(groups[frozenset([2])]["status"], "insufficient_loop_stability")
        self.assertFalse(revised["fft_recomputed"])
        self.assertFalse(revised["gpa_recomputed"])
        self.assertEqual(self.call("result", query_request_id=self.old_request_id), self.old)
        self.assertEqual(self.call("result", query_request_id="v2-revise-v1"), revised)
        revision_export = self.call("export", object_id=revised["object_id"],
                                    output_dir=str(self.root / "v2-revision-export"))
        provenance = worker.read_json(Path(revision_export["output_dir"]) / "provenance.json")
        self.assertEqual(provenance["objects"][self.old["object_id"]]["report"], self.old["report"])
        self.assertEqual(provenance["objects"][revised["object_id"]]["report"], revised["report"])
        self.assertEqual(self.science_identities(), self.science_before)
        self.assert_protected_unchanged()

    def test_v1_original_request_conflicts_and_live_source_guard_keep_their_meaning(self):
        self.refuse("topology", "REQUEST_CONFLICT", request_id=self.old_request_id,
                    **{**self.parameters, "amplitude_floor_relative": .06})
        self.assertEqual(self.call("result", query_request_id=self.old_request_id), self.old)
        self.assertEqual(self.hashes(), self.protected)
        original = self.source.read_bytes()
        try:
            # A fresh frame read still guards the live original TIFF.  Saved
            # topology recovery reads immutable arrays rather than this TIFF.
            with self.source.open("r+b") as stream:
                stream.seek(-1, 2)
                stream.write(bytes([original[-1] ^ 1]))
            self.refuse("frame", "SOURCE_CHANGED", object_id=self.opened["object_id"], frame_index=0)
            self.assertEqual(self.call("get", object_id=self.old["object_id"]), self.old)
            self.assertEqual(self.call("result", query_request_id=self.old_request_id), self.old)
        finally:
            self.source.write_bytes(original)
        self.assertEqual(worker.sha_file(self.source), self.source_hash)
        self.assertEqual(self.science_identities(), self.science_before)
        self.assert_protected_unchanged()

    def test_saved_v1_still_refuses_changed_source_record_and_unsupported_algorithm(self):
        ident = self.parameters["object_ids"][1]
        source_directory = self.workspace / "objects" / ident
        source_metadata = worker.read_json(source_directory / "object.json")
        source_metadata["display"]["compatibility_tamper"] = "deliberate public test fixture"
        source_journal_path = self.workspace / "requests" / (source_metadata["request_id"] + ".json")
        source_journal = worker.read_json(source_journal_path)
        old_source_bytes = (source_directory / "object.json").read_bytes()
        old_journal_bytes = source_journal_path.read_bytes()
        try:
            (source_directory / "object.json").write_bytes(worker.canonical(source_metadata) + b"\n")
            source_journal["response"] = {"ok": True, "state": "completed", "backend": worker.BACKEND, **source_metadata}
            source_journal["object_manifest_sha256"] = worker.sha_file(source_directory / "object.json")
            source_journal_path.write_bytes(worker.canonical(source_journal) + b"\n")
            self.call("get", object_id=ident)
            self.refuse("get", "CORRUPT_OBJECT", object_id=self.old["object_id"])
            self.refuse("result", "CORRUPT_OBJECT", query_request_id=self.old_request_id)
            self.refuse("export", "CORRUPT_OBJECT", object_id=self.old["object_id"],
                        output_dir=str(self.root / "refused-source-export"))
            self.assertFalse((self.root / "refused-source-export").exists())
        finally:
            (source_directory / "object.json").write_bytes(old_source_bytes)
            source_journal_path.write_bytes(old_journal_bytes)
        # Version routing is an allowlist, never permission to accept a forged
        # algorithm string while retaining an otherwise coherent own journal.
        metadata = copy.deepcopy(self.old)
        metadata.pop("state")
        metadata["report"]["algorithm"] = "saved-wrapped-phase-rectangular-topology-v999"
        directory = self.workspace / "objects" / self.old["object_id"]
        (directory / "object.json").write_bytes(worker.canonical(metadata) + b"\n")
        journal_path = self.workspace / "requests" / (self.old_request_id + ".json")
        journal = worker.read_json(journal_path)
        journal["response"] = {"ok": True, "state": "completed", "backend": worker.BACKEND, **metadata}
        journal["object_manifest_sha256"] = worker.sha_file(directory / "object.json")
        journal_path.write_bytes(worker.canonical(journal) + b"\n")
        self.refuse("get", "CORRUPT_OBJECT", object_id=self.old["object_id"])
        self.refuse("result", "CORRUPT_OBJECT", query_request_id=self.old_request_id)
        self.assertEqual(self.science_identities(), self.science_before)


if __name__ == "__main__":
    unittest.main()
