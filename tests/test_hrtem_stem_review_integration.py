"""Shared review integration: preserve independent opt-ins, real evidence and recovery."""
import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_hrtem_candidate_chain import build_case, hashes, write_json
from tools import image_workspace as worker


class SharedReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        retained = os.environ.get("MICROSCOPY_INTEGRATION_OUTPUT")
        cls.temp = None if retained else tempfile.TemporaryDirectory(prefix="shared-review-")
        cls.root = Path(retained or cls.temp.name).resolve()
        if retained:
            if not Path(retained).is_absolute() or cls.root.exists():
                raise ValueError("MICROSCOPY_INTEGRATION_OUTPUT must name a new absolute directory")
            cls.root.mkdir()
        cls.client, cls.original, _, cls.receipt = build_case(cls.root / "positive", "positive", reference_tiles=True)
        cls.original_inventory = hashes(cls.client.workspace)

    @classmethod
    def tearDownClass(cls):
        if cls.temp:
            cls.temp.cleanup()

    def combined(self):
        if hasattr(type(self), "_combined"):
            statistics, args, initial = type(self)._combined
            return statistics, copy.deepcopy(args), initial
        statistics = self.client.call("statistics", object_id=self.receipt["frame"], rect=[0, 0, 256, 256],
            reference_comparison={"reference_rects": [[256, 0, 512, 256], [0, 256, 256, 512]],
                "source_text": "Exact repeated synthetic tiles for interface validation; correlated and not physical same-class validation"})
        context = {"question": "Keep raw reference observations separate from supplied candidate closure evidence",
            "statistics_id": statistics["object_id"], "expected_position_xy": [128.5, 128.5],
            "position_source_text": "Explicit original fixture centre, not a detected maximum",
            "modality": "other", "signal_kind": "stored_scalar",
            "signal_source_text": "Synthetic multitone scalar texture; not HAADF image-formation or independent counts"}
        args = copy.deepcopy(self.receipt["review_args"])
        args.update(request_id="integrated-review", evidence_ids=[*args["evidence_ids"], statistics["object_id"]],
            site_context=context, include_site_continuation=True, previous_review_id=self.original["object_id"])
        initial = self.client.call("discovery_review", **args)
        type(self)._combined = statistics, copy.deepcopy(args), initial
        return statistics, args, initial

    def test_combined_reports_survive_profile_followup_export_and_original_id_reopen(self):
        statistics, args, initial = self.combined()
        self.assertEqual(initial["candidate_result"], self.original["candidate_result"])
        self.assertEqual([r["target_minus_reference"] for r in initial["site_observation"]["raw_observation"]["references"]], [0, 0])
        self.assertEqual(initial["site_observation"]["context"]["expected_position_xy"], [128.5, 128.5])
        continuation = initial["site_continuation"]
        self.assertEqual(continuation["status"], "tool_proposed")
        self.assertEqual(continuation["after_success"]["arguments"]["candidate_assessment"], args["candidate_assessment"])
        self.assertEqual(initial["physical_conclusion"], None)
        with patch.object(worker.column_fit, "run", side_effect=AssertionError("No S2")), patch.object(worker.np.fft, "fft2", side_effect=AssertionError("No FFT/GPA during linked review")):
            profile = self.client.call("profile", **continuation["action"]["arguments"])
            linked = copy.deepcopy(continuation["after_success"]["arguments"])
            linked["evidence_ids"].append(profile["object_id"])
            final = self.client.call("discovery_review", **linked)
        self.assertEqual(final["candidate_result"], initial["candidate_result"])
        self.assertEqual(final["site_observation"]["profile_coverage"]["status"], "covered")
        self.assertEqual(final["site_continuation"]["status"], "stop_at_observation")
        self.assertEqual([r["object_id"] for r in final["evidence_refs"]], linked["evidence_ids"])
        self.assertEqual(final["site_observation"]["raw_observation"], initial["site_observation"]["raw_observation"])
        self.assertEqual(final["history"][-1]["object_id"], initial["object_id"])
        before = hashes(self.client.workspace)
        exported = self.client.call("export", object_id=final["object_id"], output_dir=str(self.root / "combined-export"))
        output = self.root / "combined-export"
        for name in ["discovery-review.json", "candidate-review.txt", "site-observation.json", "site-observation.txt",
                     "site-continuation.json", "site-continuation.txt", "preview.png"]:
            self.assertEqual((output / name).read_bytes(), (Path(final["manifest_path"]).parent / name).read_bytes())
        self.assertFalse((output / "amplitude.npy").exists())
        self.assertEqual(self.client.call("get", object_id=final["object_id"]), final)
        self.assertEqual(self.client.call("result", query_request_id=final["request_id"]), final)
        self.assertEqual(self.client.call("result", query_request_id=exported["request_id"]), exported)
        self.assertEqual(self.client.call("get", object_id=self.original["object_id"]), self.original)
        self.assertTrue(all(worker.sha_file(self.client.workspace / p) == digest for p, digest in before.items()))
        self.assertTrue(all(worker.sha_file(self.client.workspace / p) == digest for p, digest in self.original_inventory.items()))
        write_json(self.root / "combined-receipt.json", {"workspace": str(self.client.workspace), "initial": initial,
            "final": final, "export": exported, "original": self.original, "statistics": statistics,
            "initial_arguments": args, "linked_arguments": linked, "profile": profile, "source_sha256": self.receipt["source_sha256"]})

    def test_bad_candidate_or_site_input_is_not_hidden_by_the_other_optin(self):
        original = copy.deepcopy(self.receipt["review_args"])
        original["candidate_assessment"]["real_space_evidence"]["anchors_xy"] = [[999, 999]]
        original.update(site_context={"invalid": True}, include_site_continuation=True)
        result = worker.execute(dict(workspace=str(self.client.workspace), action="discovery_review",
                                     request_id="invalid-both", **original))
        self.assertFalse(result["ok"])
        # Independently invalid site input must still fail when candidate assessment is valid.
        original["candidate_assessment"] = copy.deepcopy(self.receipt["review_args"]["candidate_assessment"])
        result = worker.execute(dict(workspace=str(self.client.workspace), action="discovery_review",
                                     request_id="invalid-site", **original))
        self.assertFalse(result["ok"])
        # Independently invalid candidate cannot be masked by a valid raw report.
        statistics, args, _ = self.combined()
        args["candidate_assessment"]["real_space_evidence"]["anchors_xy"] = [[999, 999]]
        args["request_id"] = "invalid-candidate"
        result = worker.execute(dict(workspace=str(self.client.workspace), action="discovery_review", **args))
        self.assertFalse(result["ok"])
        recovered = worker.execute(dict(workspace=str(self.client.workspace), action="result",
                                        query_request_id="invalid-candidate"))
        self.assertFalse(recovered["ok"])
        self.assertEqual(recovered["state"], "failed")
        self.assertEqual(recovered["request_id"], "invalid-candidate")
        self.assertEqual(recovered["error"], result["error"])


if __name__ == "__main__":
    unittest.main()
