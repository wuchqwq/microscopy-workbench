"""Bounded existing-tool execution from saved site feedback, not AI qualification."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import image_site_observation_test as fixtures
from tools import image_workspace as worker, image_site_continuation
from preview_test_support import acknowledge_received_previews


class SiteContinuation(unittest.TestCase):
    def setUp(self):
        self.case = fixtures.ExpectedSiteReview()
        self.case.setUp()

    def tearDown(self):
        self.case.tearDown()

    def direct(self, action, args):
        response = worker.execute(dict(action=action, workspace=str(self.case.workspace), **args))
        self.assertTrue(response["ok"], response)
        acknowledge_received_previews(worker, self.case.workspace, response["result"])
        return response["result"]

    def follow(self, continuation):
        action = continuation["action"]
        profile = self.direct("profile", action["arguments"])
        after = continuation["after_success"]
        self.assertEqual(profile["request_id"], after["require_result_request_id"])
        self.assertEqual(profile["kind"], after["require_result_kind"])
        args = copy.deepcopy(after["arguments"])
        args["evidence_ids"].append(profile["object_id"])
        return profile, self.direct("discovery_review", args)

    def test_explicit_handoff_executes_existing_profile_then_revises_and_stops(self):
        _, discovery, stats, context = self.case.fixture(target=4)
        legacy = self.case.review(discovery, stats, context)
        self.assertNotIn("site_continuation", legacy)
        initial = self.case.review(discovery, stats, context, include_site_continuation=True)
        continuation = initial["site_continuation"]
        self.assertEqual(continuation["status"], "tool_proposed")
        self.assertEqual(continuation["action"]["tool"], "image_profile")
        self.assertEqual(continuation["action"]["arguments"]["points"], [[20.25,22.5],[24.25,22.5]])
        with patch.object(worker.column_fit, "run", side_effect=AssertionError("No S2")), patch.object(worker.np.fft, "fft2", side_effect=AssertionError("No FFT")):
            profile, final = self.follow(continuation)
        self.assertEqual(final["site_continuation"]["status"], "stop_at_observation")
        self.assertIsNone(final["site_continuation"]["action"])
        self.assertEqual(final["site_observation"]["profile_coverage"]["status"], "covered")
        self.assertEqual(final["site_observation"]["raw_observation"], initial["site_observation"]["raw_observation"])
        self.assertEqual(final["evidence_refs"][0]["object_id"], stats["object_id"])
        self.assertEqual(final["history"][-1]["object_id"], initial["object_id"])
        self.assertIsNone(final["physical_conclusion"])

    def test_off_site_profile_is_retained_when_the_generated_through_site_line_is_added(self):
        frame, discovery, stats, context = self.case.fixture(target=0)
        off = self.case.call("profile", object_id=frame["object_id"], points=[[20,20],[24,20]])
        initial = self.case.review(discovery, stats, context, evidence=[stats["object_id"],off["object_id"]], include_site_continuation=True)
        new, final = self.follow(initial["site_continuation"])
        self.assertEqual(final["site_observation"]["profile_ids"], [off["object_id"],new["object_id"]])
        self.assertEqual([a["status"] for a in final["site_observation"]["profile_coverage"]["assessments"]], ["not_verified","covered"])

    def test_reference_conflict_and_unknown_input_do_not_dispatch_a_profile_or_s2(self):
        for target, refs, modality, expected in [(5,(2,8),"haadf","needs_reference_review"), (4,(10,10),"unknown","needs_information")]:
            _, discovery, stats, context = self.case.fixture(target=target,references=refs)
            context["modality"] = modality
            result = self.case.review(discovery, stats, context, include_site_continuation=True)
            self.assertEqual(result["site_continuation"]["status"], expected)
            self.assertIsNone(result["site_continuation"]["action"])
            self.assertEqual(len(result["site_observation"]["raw_observation"]["references"]), 2)

    def test_edge_and_evidence_budget_block_without_moving_or_dropping_inputs(self):
        _, discovery, stats, context = self.case.fixture()
        context["expected_position_xy"] = [20.25,20.25]
        result = self.case.review(discovery, stats, context, include_site_continuation=True)
        self.assertEqual(result["site_continuation"]["status"], "needs_explicit_roi_revision")
        self.assertEqual(result["site_continuation"]["expected_position_xy"], [20.25,20.25])
        context["expected_position_xy"] = [20.25,22.25]
        vertical = self.case.review(discovery, stats, context, include_site_continuation=True)
        self.assertEqual(vertical["site_continuation"]["axis"], "vertical")
        _, completed = self.follow(vertical["site_continuation"])
        self.assertEqual(completed["site_observation"]["profile_coverage"]["status"], "covered")
        # Budget predicate over an already verified review; no fake evidence is
        # submitted or admitted to a provider. Check that the planner never drops.
        context["expected_position_xy"] = [22.25,22.5]
        result = self.case.review(discovery, stats, context)
        request = dict(request_id="budget-check", evidence_ids=[str(i) for i in range(8)])
        blocked = image_site_continuation.derive(result, request, worker)
        self.assertEqual(blocked["status"], "needs_evidence_budget")
        self.assertIsNone(blocked["action"])
        at_limit = copy.deepcopy(result)
        at_limit["history"] = [{} for _ in range(8)]
        blocked = image_site_continuation.derive(at_limit, dict(request_id="history-check",evidence_ids=[stats["object_id"]]), worker)
        self.assertEqual(blocked["status"], "needs_history_budget")
        self.assertIsNone(blocked["action"])

    def test_recovery_export_and_original_feedback_remain_immutable(self):
        _, discovery, stats, context = self.case.fixture(target=4)
        result = self.case.review(discovery, stats, context, include_site_continuation=True)
        directory = Path(result["manifest_path"]).parent
        before = {p:p.read_bytes() for p in directory.iterdir() if p.is_file()}
        self.assertEqual(self.case.call("get",object_id=result["object_id"])["site_continuation"],result["site_continuation"])
        self.assertEqual(self.case.call("result",query_request_id=result["request_id"])["site_continuation"],result["site_continuation"])
        self.case.call("export",object_id=result["object_id"],output_dir=str(self.case.root/"continuation-export"))
        for name in ["site-continuation.json","site-continuation.txt"]:
            self.assertEqual((self.case.root/"continuation-export"/name).read_bytes(),(directory/name).read_bytes())
        self.assertEqual({p:p.read_bytes() for p in before},before)

    def test_include_requires_context_and_saved_action_cannot_be_coherently_rewritten(self):
        _, discovery, stats, context = self.case.fixture()
        self.case.review(discovery, stats, include_site_continuation=True, ok=False)
        self.case.review(discovery, stats, context, include_site_continuation="yes", ok=False)
        result = self.case.review(discovery, stats, context, include_site_continuation=True)
        directory=Path(result["manifest_path"]).parent
        paths=[directory/"object.json",directory/"site-continuation.json",directory/"site-continuation.txt",directory/"discovery-review.json",
               self.case.workspace/"requests"/(result["request_id"]+".json")]
        original={p:p.read_bytes() for p in paths}
        try:
            forged=copy.deepcopy(result)
            forged["site_continuation"]["action"]["arguments"]["points"][0][1]=20
            (directory/"site-continuation.json").write_bytes(worker.canonical(forged["site_continuation"])+b"\n")
            (directory/"site-continuation.txt").write_text(image_site_continuation.report_text(forged["site_continuation"]),encoding="utf-8")
            (directory/"discovery-review.json").write_bytes(worker.canonical({k:v for k,v in forged.items() if k!="created_utc"})+b"\n")
            for name in ["site-continuation.json","site-continuation.txt","discovery-review.json"]:
                forged["files_sha256"][name]=worker.sha_file(directory/name)
            (directory/"object.json").write_bytes(worker.canonical(forged)+b"\n")
            journal=json.loads(original[paths[-1]])
            journal["object_manifest_sha256"]=worker.sha_file(directory/"object.json")
            journal["response"]={"ok":True,"state":"completed","backend":worker.BACKEND,**forged}
            paths[-1].write_bytes(worker.canonical(journal)+b"\n")
            self.assertEqual(self.case.call("get",object_id=result["object_id"],ok=False)["error"]["code"],"CORRUPT_OBJECT")
        finally:
            for p,raw in original.items():p.write_bytes(raw)


if __name__ == "__main__":
    unittest.main()
