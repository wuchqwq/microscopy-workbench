"""Small independent scalar-answer cases, not STEM image-formation validation."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker
from preview_test_support import acknowledge_received_previews


class ExpectedSiteReview(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="site-observation-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "images"
        self.serial = 0
        self.rect = [20, 20, 25, 25]
        self.refs = [[4, 4, 9, 9], [40, 40, 45, 45]]

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, ok=True, **args):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), **args)
        if action not in ("get", "result"):
            request["request_id"] = "site-%d" % self.serial
        response = worker.execute(request)
        self.assertEqual(response["ok"], ok, response)
        if ok:
            acknowledge_received_previews(worker, self.workspace, response["result"])
        return response["result"] if ok else response

    def fixture(self, target=10, references=(10, 10)):
        # Each support is constant: independent answer is exactly the supplied value.
        values = np.ones((64, 64), dtype=np.float32)
        for rect, value in zip([self.rect, *self.refs], [target, *references]):
            x0, y0, x1, y1 = rect
            values[y0:y1, x0:x1] = value
        # Brighter neighbour is outside the fixed target; never a replacement site.
        values[22, 27] = 100
        path = self.root / ("case-%d.tiff" % self.serial)
        tifffile.imwrite(path, values)
        opened = self.call("open", source_path=str(path))
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        discovery = self.call("discovery", object_id=frame["object_id"], entry="manual", selection_origin="agent",
                              regions=[dict(rect=self.rect, reason="Question at a supplied expected position, not a detected maximum")])
        stats = self.call("statistics", object_id=frame["object_id"], rect=self.rect,
                          reference_comparison=dict(reference_rects=self.refs, source_text="Analytic same-support controls; physical equivalence unverified"))
        context = dict(question="How does this expected position differ from all references?", statistics_id=stats["object_id"],
                       expected_position_xy=[22.25, 22.5], position_source_text="Supplied expected coordinate; no localization",
                       modality="haadf", signal_kind="stored_scalar", signal_source_text="Analytic scalar fixture, not physical STEM or count validation")
        return frame, discovery, stats, context

    def review(self, discovery, stats, context=None, evidence=None, ok=True, **args):
        return self.call("discovery_review", ok=ok, object_id=discovery["object_id"],
                         candidate_id=discovery["candidates"][0]["candidate_id"],
                         evidence_ids=evidence or [stats["object_id"]], observation_text="Raw evidence only; competing causes remain",
                         **({"site_context": context} if context is not None else {}), **args)

    def test_equal_weak_and_empty_keep_expected_position_and_all_references(self):
        for target in (10, 4, 0):
            with self.subTest(target=target):
                frame, discovery, stats, context = self.fixture(target=target)
                before = worker.sha_file(Path(frame["manifest_path"]).parent / "data.npy")
                result = self.review(discovery, stats, context)["site_observation"]
                self.assertEqual(result["raw_observation"]["target_mean"], target)
                self.assertEqual([r["target_minus_reference"] for r in result["raw_observation"]["references"]], [target-10, target-10])
                self.assertEqual(result["context"]["expected_position_xy"], [22.25, 22.5])
                self.assertIsNone(result["measured_position_xy"])
                self.assertFalse(result["position_changed"])
                self.assertIsNone(result["physical_conclusion"])
                self.assertEqual(result["position_status"], "expected_not_localized")
                self.assertEqual(result["comparison"]["direction"], "equal_to_all_references" if target == 10 else "below_or_equal_to_all_references")
                self.assertEqual(worker.sha_file(Path(frame["manifest_path"]).parent / "data.npy"), before)

    def test_reference_conflict_survives_a_zero_median_difference(self):
        _, discovery, stats, context = self.fixture(target=5, references=(2, 8))
        result = self.review(discovery, stats, context)["site_observation"]
        self.assertEqual(result["raw_observation"]["target_minus_reference_median"], 0)
        self.assertEqual([r["target_minus_reference"] for r in result["raw_observation"]["references"]], [3, -3])
        self.assertEqual(result["comparison"]["direction"], "references_straddle_target")
        self.assertEqual(result["next_step"]["kind"], "inspect_reference_comparability")

    def test_unknown_and_derived_signals_keep_raw_evidence_without_poisson_inference(self):
        _, discovery, stats, context = self.fixture(target=-3, references=(-1, -1))
        for modality, signal in [("idpc", "derived_scalar"), ("unknown", "unknown")]:
            context.update(modality=modality, signal_kind=signal)
            result = self.review(discovery, stats, context)["site_observation"]
            self.assertEqual(result["raw_observation"]["target_mean"], -3)
            self.assertFalse(result["s2_dispatched"])
            self.assertEqual(result["measurement_reliability"]["noise_significance"], "not_assessed")
            self.assertIsNone(result["physical_conclusion"])
            if modality == "unknown":
                self.assertEqual(result["next_step"]["kind"], "request_acquisition_context")

    def test_context_requires_exact_attached_stats_and_fixed_inside_position(self):
        _, discovery, stats, context = self.fixture()
        for changed in [dict(expected_position_xy=[27, 22]), dict(expected_position_xy=[True, 22]),
                        dict(expected_position_xy=[float("nan"), 22]), dict(statistics_id="f"*32),
                        dict(modality="inferred_from_brightness"), dict(signal_source_text="")]:
            self.review(discovery, stats, {**context, **changed}, ok=False)
        self.review(discovery, stats, {**context, "vacancy_confirmed": True}, ok=False)

    def test_profile_changes_next_step_but_not_roi_measurement(self):
        frame, discovery, stats, context = self.fixture(target=4)
        profile = self.call("profile", object_id=frame["object_id"], points=[[20,22],[24,22]])
        first = self.review(discovery, stats, context)
        second = self.review(discovery, stats, context, evidence=[stats["object_id"],profile["object_id"]], previous_review_id=first["object_id"])
        self.assertEqual(first["site_observation"]["next_step"]["tool"], "image_profile")
        self.assertEqual(second["site_observation"]["next_step"]["kind"], "review_alternative_causes_or_stop")
        self.assertEqual(first["site_observation"]["raw_observation"], second["site_observation"]["raw_observation"])
        self.assertEqual(len(second["history"]), 1)

    def test_original_read_recovery_export_and_legacy_review_do_not_dispatch_science(self):
        _, discovery, stats, context = self.fixture(target=0)
        legacy = self.review(discovery, stats)
        result = self.review(discovery, stats, context, previous_review_id=legacy["object_id"])
        directory = Path(result["manifest_path"]).parent
        before = {p: p.read_bytes() for p in directory.iterdir() if p.is_file()}
        with patch.object(worker.column_fit, "run", side_effect=AssertionError("No fit allowed")), patch.object(worker.np.fft, "fft2", side_effect=AssertionError("No FFT allowed")):
            self.assertNotIn("site_observation", self.call("get", object_id=legacy["object_id"]))
            self.assertEqual(self.call("get", object_id=result["object_id"])["site_observation"], result["site_observation"])
            self.assertEqual(self.call("result", query_request_id=result["request_id"])["site_observation"], result["site_observation"])
            self.call("export", object_id=result["object_id"], output_dir=str(self.root/"export"))
        self.assertEqual({p:p.read_bytes() for p in before}, before)
        self.assertEqual((self.root/"export"/"site-observation.json").read_bytes(), (directory/"site-observation.json").read_bytes())

    def test_coherently_rehashed_site_summary_is_rejected_on_read(self):
        _, discovery, stats, context = self.fixture(target=0)
        result = self.review(discovery, stats, context)
        directory = Path(result["manifest_path"]).parent
        manifest, payload = directory/"object.json", directory/"site-observation.json"
        journal_path = self.workspace/"requests"/(result["request_id"]+".json")
        original = {p:p.read_bytes() for p in [manifest,payload,journal_path]}
        try:
            forged = copy.deepcopy(result)
            forged["site_observation"]["position_status"] = "detected"
            payload.write_bytes(worker.canonical(forged["site_observation"])+b"\n")
            forged["files_sha256"][payload.name] = worker.sha_file(payload)
            manifest.write_bytes(worker.canonical(forged)+b"\n")
            journal = json.loads(original[journal_path])
            journal["object_manifest_sha256"] = worker.sha_file(manifest)
            journal["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,**forged}
            journal_path.write_bytes(worker.canonical(journal)+b"\n")
            self.assertEqual(self.call("get", object_id=result["object_id"], ok=False)["error"]["code"], "CORRUPT_OBJECT")
        finally:
            for p, raw in original.items():
                p.write_bytes(raw)


if __name__ == "__main__":
    unittest.main()
