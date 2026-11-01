"""Caller-reported ROI origin and real legacy save/read compatibility.

Legacy acceptance uses an unmodified pre-fix producer via
DISCOVERY_LEGACY_WORKER_ROOT, never edited objects or patched policy constants.
Without that explicit frozen source the legacy group is reported skipped.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker


LEGACY_SHA = "7f0e523ba287de11c0913abd68f553655f008182"
LEGACY_ROOT = os.environ.get("DISCOVERY_LEGACY_WORKER_ROOT")
REGION = {"rect": [8, 8, 40, 40],
          "reason": "Agent proposes an image stripe ROI; the human did not select this rectangle",
          "candidate_explanations": ["Image periodicity is a working interpretation"],
          "unresolved": ["Statistical and physical qualification not established"]}


class WorkerFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="selection-origin-")
        cls.root = Path(cls.temp.name).resolve()
        cls.workspace = cls.root / "workspace"
        cls.source = cls.root / "synthetic-stripes.tiff"
        y, x = np.indices((48, 48))
        tifffile.imwrite(cls.source, (20 + 4 * np.cos(2 * np.pi * x / 8)).astype(np.float32))
        cls.serial = 0

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def request(cls, action, **arguments):
        cls.serial += 1
        identity = {} if action in ("get", "result") else {"request_id": "selection-origin-%03d" % cls.serial}
        return dict(workspace=str(cls.workspace), action=action, **identity, **arguments)

    @classmethod
    def call(cls, action, **arguments):
        response = worker.execute(cls.request(action, **arguments))
        if not response.get("ok"):
            raise AssertionError(response)
        return response["result"]


class SelectionOrigin(WorkerFixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        opened = cls.call("open", source_path=str(cls.source))
        cls.frame = cls.call("frame", object_id=opened["object_id"], frame_index=0)
        cls.propose = dict(object_id=cls.frame["object_id"], entry="manual", regions=[REGION], max_size=64)

    def test_explicit_origins_are_claims_not_identity_authentication(self):
        for origin in ("agent", "researcher", "unspecified"):
            with self.subTest(origin=origin):
                saved = self.call("discovery", **self.propose, selection_origin=origin)
                candidate = saved["candidates"][0]
                self.assertEqual(saved["policy_version"], "image-first-discovery-v2")
                self.assertEqual(saved["parameters"]["selection_origin"], origin)
                self.assertEqual(candidate["entry_basis"], "explicit_caller_supplied_roi")
                self.assertEqual(candidate["selection_origin"], origin)
                self.assertEqual(candidate["selection_origin_basis"], "caller_reported_not_authenticated")
                self.assertEqual(candidate["reasons"], [REGION["reason"]])
                self.assertEqual(candidate["interpretation_status"], "hypothesized")
                self.assertIsNone(candidate["physical_conclusion"])
                report = worker.read_json(Path(saved["manifest_path"]).parent / "discovery-report.json")
                self.assertEqual(report["algorithm"], "explicit-roi-attention-v2")
                self.assertEqual(report["quality"]["status"], "caller_statement_not_numerically_verified")
                self.assertEqual(self.call("get", object_id=saved["object_id"]), saved)
                self.assertEqual(self.call("result", query_request_id=saved["request_id"]), saved)

    def test_omission_does_not_infer_actor_from_reason_text(self):
        for reason in (REGION["reason"], "Researcher chose this rectangle", "No actor is known"):
            saved = self.call("discovery", **{**self.propose, "regions": [{**REGION, "reason": reason}]})
            self.assertEqual(saved["parameters"]["selection_origin"], "unspecified")
            self.assertEqual(saved["candidates"][0]["selection_origin"], "unspecified")
            self.assertNotEqual(saved["candidates"][0]["entry_basis"], "researcher_statement")

    def test_invalid_origin_is_rejected(self):
        for origin in (None, True, 1, [], {}, "human", "authenticated_researcher"):
            with self.subTest(origin=origin):
                response = worker.execute(self.request("discovery", **self.propose, selection_origin=origin))
                self.assertFalse(response["ok"], response)
                self.assertIn("selection_origin", response["error"]["message"])

    def test_feature_route_has_no_claimed_selection_actor(self):
        saved = self.call("discovery", object_id=self.frame["object_id"], entry="feature",
                          window_sizes=[32], max_candidates=1, max_size=64)
        self.assertNotIn("selection_origin", saved["parameters"])
        self.assertTrue(all("selection_origin" not in candidate for candidate in saved["candidates"]))
        self.assertEqual(self.call("get", object_id=saved["object_id"]), saved)
        for entry in ({"entry": "feature"}, {}):
            response = worker.execute(self.request("discovery", object_id=self.frame["object_id"],
                                      window_sizes=[32], selection_origin="agent", **entry))
            self.assertFalse(response["ok"], response)
            self.assertIn("only", response["error"]["message"])

    def test_origin_revision_preserves_prior_records_and_geometry(self):
        first = self.call("discovery", **self.propose, selection_origin="researcher")
        original = Path(first["manifest_path"]).read_bytes()
        changed = self.call("discovery", **self.propose, selection_origin="agent", previous_discovery_id=first["object_id"])
        self.assertEqual(changed["history"][-1]["object_id"], first["object_id"])
        self.assertEqual(changed["candidates"][0]["rect"], first["candidates"][0]["rect"])
        self.assertEqual(Path(first["manifest_path"]).read_bytes(), original)
        self.assertEqual(self.call("result", query_request_id=first["request_id"]), first)
        self.assertEqual(self.call("get", object_id=changed["object_id"]), changed)


@unittest.skipUnless(LEGACY_ROOT, "NOT_TESTED: set DISCOVERY_LEGACY_WORKER_ROOT to the frozen #64 producer")
class LegacySelectionOrigin(WorkerFixture):
    @classmethod
    def legacy_call(cls, action, **arguments):
        process = subprocess.run([sys.executable, str(Path(LEGACY_ROOT) / "tools/image_workspace.py")],
                                 input=json.dumps(cls.request(action, **arguments)), text=True, capture_output=True, check=False)
        response = json.loads(process.stdout)
        if process.returncode or not response.get("ok"):
            raise AssertionError(response)
        return response["result"]

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=LEGACY_ROOT, text=True).strip()
        if actual != LEGACY_SHA:
            raise AssertionError((actual, LEGACY_SHA))
        subprocess.run(["git", "diff", "--exit-code", "HEAD", "--", "tools", "crystallography"],
                       cwd=LEGACY_ROOT, capture_output=True, check=True)
        opened = cls.legacy_call("open", source_path=str(cls.source))
        cls.frame = cls.legacy_call("frame", object_id=opened["object_id"], frame_index=0)
        cls.discovery = cls.legacy_call("discovery", object_id=cls.frame["object_id"], entry="manual", regions=[REGION], max_size=64)
        cls.fft = cls.legacy_call("fft", object_id=cls.frame["object_id"], rect=REGION["rect"], window="none", subtract_mean=True, max_size=64)
        cls.review = cls.legacy_call("discovery_review", object_id=cls.discovery["object_id"],
                                     candidate_id=cls.discovery["candidates"][0]["candidate_id"], evidence_ids=[cls.fft["object_id"]],
                                     observation_text="Legacy review retains an image frequency observation without physical confirmation")
        cls.feature = cls.legacy_call("discovery", object_id=cls.frame["object_id"], entry="feature", window_sizes=[32], max_candidates=1, max_size=64)
        cls.originals = {path: path.read_bytes() for path in cls.root.rglob("*") if path.is_file()}

    def tearDown(self):
        for path, original in self.originals.items():
            self.assertEqual(path.read_bytes(), original, str(path))

    def test_real_old_save_new_read_preserves_original_response_and_hashes(self):
        self.assertEqual(self.discovery["candidates"][0]["entry_basis"], "researcher_statement")
        self.assertNotIn("selection_origin", self.discovery["parameters"])
        for record in (self.discovery, self.review, self.feature):
            with self.subTest(kind=record["kind"]):
                self.assertEqual(record["policy_version"], "image-first-discovery-v1")
                self.assertEqual(self.call("get", object_id=record["object_id"]), record)
                self.assertEqual(self.call("result", query_request_id=record["request_id"]), record)

    def test_new_review_uses_old_candidate_without_reinterpretation(self):
        reviewed = self.call("discovery_review", object_id=self.discovery["object_id"],
                             candidate_id=self.discovery["candidates"][0]["candidate_id"], evidence_ids=[self.fft["object_id"]],
                             observation_text="New review preserves the old supplied candidate interpretation",
                             previous_review_id=self.review["object_id"])
        self.assertEqual(reviewed["policy_version"], "image-first-discovery-v2")
        self.assertEqual(reviewed["candidate"], self.discovery["candidates"][0])
        self.assertNotIn("selection_origin", reviewed["candidate"])
        self.assertEqual(reviewed["history"][-1]["object_id"], self.review["object_id"])
        self.assertEqual(self.call("get", object_id=reviewed["object_id"]), reviewed)

    def test_new_discovery_history_keeps_legacy_manifest_identity(self):
        revised = self.call("discovery", object_id=self.frame["object_id"], entry="manual", regions=[REGION],
                            selection_origin="agent", max_size=64, previous_discovery_id=self.discovery["object_id"])
        self.assertEqual(revised["history"][-1]["object_id"], self.discovery["object_id"])
        expected_hash = hashlib.sha256(self.originals[Path(self.discovery["manifest_path"])]).hexdigest()
        self.assertEqual(revised["history"][-1]["manifest_sha256"], expected_hash)
        self.assertEqual(revised["candidates"][0]["selection_origin"], "agent")
        self.assertNotEqual(revised["candidates"][0]["candidate_id"], self.discovery["candidates"][0]["candidate_id"])
        self.assertEqual(self.call("get", object_id=revised["object_id"]), revised)


if __name__ == "__main__":
    unittest.main()
