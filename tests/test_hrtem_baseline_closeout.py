"""Bounded A/B source -> saved result -> real export -> reopen acceptance.

Existing public analytic fixtures only. No new science kernel or GUI assertion.
HRTEM_CLOSEOUT_OUTPUT retains evidence in a NEW absolute directory.
"""
import os
from pathlib import Path
import tempfile
import unittest

from test_hrtem_candidate_chain import build_case, CandidateClient, hashes, write_json
import test_peak_comparison as comparison_fixture
from tools import image_workspace as worker


class BaselineCloseout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        retained = os.environ.get("HRTEM_CLOSEOUT_OUTPUT")
        cls.temp = None if retained else tempfile.TemporaryDirectory(prefix="hrtem-closeout-")
        cls.root = Path(retained or cls.temp.name).resolve()
        if retained:
            if not Path(retained).is_absolute() or cls.root.exists():
                raise ValueError("HRTEM_CLOSEOUT_OUTPUT must name a new absolute directory")
            cls.root.mkdir(parents=True)
        cls.cases = {}
        for name, dark in (("a_observed", False), ("a_unavailable", True)):
            directory = cls.root / name; directory.mkdir()
            fixture = comparison_fixture.SavedComparison()
            fixture.root, fixture.workspace, fixture.counter = directory, directory / "workspace", 0
            seed = fixture.seed(changed=not dark, dark=dark)
            source_inventory = hashes(directory)
            plan = fixture.plan(seed)
            assert all(worker.sha_file(directory / name) == digest for name, digest in source_inventory.items())
            write_json(directory / "input-provenance.json", {
                "generator": "tests/test_peak_comparison.py:SavedComparison.seed(changed=%s,dark=%s)" % (not dark, dark),
                "generator_sha256": worker.sha_file(Path(__file__).with_name("test_peak_comparison.py")),
                "source_sha256": worker.sha_file(directory / "source.tiff"),
                "construction": "256x256 prescribed x/y carriers period8 pixels; right half amplitude1.6, phase +/-0.4 rad, or zero amplitude for refusal",
                "not_real_material": True})
            cls.cases[name] = (CandidateClient(directory), plan, seed["object_id"])
        for name in ("positive", "negative", "low_amplitude", "contrast_vortex"):
            client, review, _, receipt = build_case(cls.root / ("b_" + name), name)
            cls.cases["b_" + name] = (client, review, receipt["gpa_ids"][0])
        write_json(cls.root / "closeout-inputs.json", {name: {
            "workspace": str(client.workspace), "object_id": record["object_id"], "request_id": record["request_id"],
            "readable_file": "peak-comparison.txt" if name.startswith("a_") else "candidate-review.txt",
            "report_file": "method-decision.json" if name.startswith("a_") else "discovery-review.json",
            "gpa_object_id": seed} for name, (client, record, seed) in cls.cases.items()})

    @classmethod
    def tearDownClass(cls):
        if cls.temp: cls.temp.cleanup()

    def test_six_saved_results_export_exact_readable_reports_previews_and_reopen(self):
        receipts = []
        for name, (client, record, seed) in self.cases.items():
            with self.subTest(case=name):
                before = hashes(client.workspace)
                directory = client.root / "export-worker"
                exported = client.call("export", object_id=record["object_id"], output_dir=str(directory))
                readable = "peak-comparison.txt" if name.startswith("a_") else "candidate-review.txt"
                report_name = "method-decision.json" if name.startswith("a_") else "discovery-review.json"
                for file in (readable, report_name, "preview.png"):
                    self.assertEqual((directory / file).read_bytes(), (client.workspace / "objects" / record["object_id"] / file).read_bytes())
                for file, digest in exported["exported_files_sha256"].items():
                    self.assertEqual(worker.sha_file(directory / file), digest)
                manifest = worker.read_json(directory / "manifest.json")
                provenance = worker.read_json(directory / "provenance.json")
                self.assertEqual(manifest["scientific_object"]["object_id"], record["object_id"])
                self.assertIn(seed, provenance["objects"])
                self.assertFalse((directory / "amplitude.npy").exists(), "Report export must not pretend to export parent GPA arrays")
                reopened = client.call("get", object_id=record["object_id"])
                recovered = client.call("result", query_request_id=record["request_id"])
                self.assertEqual(reopened, record); self.assertEqual(recovered, record)
                self.assertEqual(client.call("get", object_id=exported["object_id"]), exported)
                self.assertEqual(client.call("result", query_request_id=exported["request_id"]), exported)
                self.assertTrue(all(worker.sha_file(client.workspace / path) == digest for path, digest in before.items()))
                receipts.append({"case": name, "report_id": record["object_id"], "export_id": exported["object_id"],
                                 "export_directory": str(directory), "original_files_unchanged": True, "exact_reopen": True})
        write_json(self.root / "worker-export-receipts.json", receipts)

    def test_task_a_observation_refusal_and_no_dispatch_are_preserved(self):
        for name in ("a_observed", "a_unavailable"):
            _, plan, _ = self.cases[name]
            report = plan["decision"]["peak_comparison"]
            self.assertEqual(report["status"], "observed" if name == "a_observed" else "insufficient_evidence")
            self.assertEqual(plan["actions"], [])
            self.assertEqual(plan["ledger"]["spent"]["method_calls"], 0)
            self.assertFalse(report["material_dislocation_confirmed"])
            for index, peak in enumerate(report["peaks"]):
                if name == "a_observed":
                    self.assertAlmostEqual(peak["amplitude_ratio"], 1.6, delta=.003)
                    self.assertAlmostEqual(peak["phase_difference_wrapped_rad"], .4 if index == 0 else -.4, delta=.003)
                else:
                    self.assertIsNone(peak["amplitude_ratio"])
                    self.assertIsNone(peak["phase_difference_wrapped_rad"])

    def test_export_overwrite_and_unrelated_method_plan_remain_refused(self):
        client, review, _ = self.cases["b_positive"]
        existing = client.root / "already-exists"; existing.mkdir()
        for ident, output in ((review["object_id"], existing),
                              (review["candidate_result"]["method_plan_object_id"], client.root / "not-a-comparison")):
            response = worker.execute(client.request("export", object_id=ident, output_dir=str(output)))
            self.assertFalse(response["ok"], response)
        self.assertFalse((client.root / "not-a-comparison").exists())


if __name__ == "__main__": unittest.main()
