"""Actual scientific worker records; no model, browser or specimen qualification."""
import copy
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker


class DiscoveryWorkspace(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="public-image-first-")
        cls.root = Path(cls.temp.name).resolve()
        cls.workspace = cls.root/"images"
        cls.source = cls.root/"analytic-two-frame.tiff"
        cls.serial = 0
        y, x = np.indices((128,128))
        values = (100 + 12*np.cos(2*np.pi*x/8) + 9*np.cos(2*np.pi*y/8)).astype(np.float32)
        with tifffile.TiffWriter(cls.source) as output:
            output.write(values)
            output.write(values+2)
        cls.source_sha = worker.sha_file(cls.source)
        cls.opened = cls.call("open", source_path=str(cls.source))
        cls.frame = cls.call("frame", object_id=cls.opened["object_id"], frame_index=0)
        cls.calibrated = cls.call("calibrate", object_id=cls.frame["object_id"], scope="image",
                                  xy_scale={"x":.02,"y":-.03,"unit":"nm"},
                                  source_text="Independent public synthetic signed metric, not a specimen scale")
        cls.rect = [24,24,88,88]
        cls.reason = "Researcher selected a visible texture interruption; physical cause not confirmed"
        cls.regions = [{"rect":cls.rect,"reason":cls.reason,
                        "candidate_explanations":["Contrast variation or structure change"],
                        "unresolved":["Image formation contribution is unknown"]}]
        cls.proposal_args = dict(object_id=cls.calibrated["object_id"], entry="manual", regions=cls.regions, max_size=128)
        cls.discovery = cls.call("discovery", **cls.proposal_args)
        cls.candidate_id = cls.discovery["candidates"][0]["candidate_id"]
        cls.fft = cls.call("fft", object_id=cls.calibrated["object_id"], rect=cls.rect, window="none", subtract_mean=True, max_size=128)
        cls.peaks = cls.call("peaks", object_id=cls.fft["object_id"], max_peaks=4, threshold_rel=.2,
                             min_separation_bins=2, exclude_dc_radius_bins=1, refinement="none", max_size=128)
        cls.measurement = cls.call("measure", object_id=cls.fft["object_id"],
                                   coordinate_space="frequency_cycles_per_pixel", points=[[0,0],[.125,0]])
        cls.review_args = dict(object_id=cls.discovery["object_id"], candidate_id=cls.candidate_id,
                               evidence_ids=[cls.fft["object_id"],cls.peaks["object_id"],cls.measurement["object_id"]],
                               observation_text="Saved numerical peaks retain the reference periodicity; material explanation remains unknown",
                               candidate_explanations=["Contrast variation remains a candidate"],
                               unresolved=["No unique phase or defect inference"])
        cls.review = cls.call("discovery_review", **cls.review_args)
        cls.protected = {path:path.read_bytes() for record in (cls.frame,cls.calibrated,cls.fft,cls.peaks,cls.measurement)
                         for path in (cls.workspace/"objects"/record["object_id"]).iterdir() if path.is_file()}

    @classmethod
    def tearDownClass(cls):
        try:
            assert worker.sha_file(cls.source)==cls.source_sha
            for path, raw in cls.protected.items():
                assert path.read_bytes()==raw
        finally:
            cls.temp.cleanup()

    @classmethod
    def request(cls, action, **arguments):
        cls.serial += 1
        identity = {} if action in ("get","result") else {"request_id":"discovery-workspace-%d"%cls.serial}
        return dict(workspace=str(cls.workspace), action=action, **identity, **arguments)

    @classmethod
    def call(cls, action, **arguments):
        response = worker.execute(cls.request(action, **arguments))
        if not response.get("ok"):
            raise AssertionError(response)
        return response["result"]

    def refuse(self, action, **arguments):
        response = worker.execute(self.request(action, **arguments))
        self.assertFalse(response["ok"], response)
        self.assertNotEqual(response["error"]["code"],"IMAGE_WORKSPACE_ERROR", response)
        return response

    def record(self, object_id):
        return worker.read_json(self.workspace/"objects"/object_id/"object.json")

    def count(self, kind=None):
        return sum(kind is None or worker.read_json(path)["kind"]==kind
                   for path in (self.workspace/"objects").glob("*/object.json"))

    def assert_coherent_refusal(self, record, mutate):
        manifest = self.workspace/"objects"/record["object_id"]/"object.json"
        journal_path = self.workspace/"requests"/(record["request_id"]+".json")
        manifest_raw,journal_raw = manifest.read_bytes(),journal_path.read_bytes()
        try:
            changed = copy.deepcopy(record)
            mutate(changed)
            manifest.write_bytes(worker.canonical(changed)+b"\n")
            journal = worker.strict_json(journal_raw.decode("utf-8"))
            journal["object_manifest_sha256"] = worker.sha_file(manifest)
            journal["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,**changed}
            journal_path.write_bytes(worker.canonical(journal)+b"\n")
            self.assertEqual(worker.Workspace(str(self.workspace),False)._object_record(record["object_id"])[0],changed)
            denied = worker.execute(self.request("get",object_id=record["object_id"]))
            self.assertFalse(denied["ok"],denied)
            self.assertEqual(denied["error"]["code"],"CORRUPT_OBJECT",denied)
        finally:
            manifest.write_bytes(manifest_raw)
            journal_path.write_bytes(journal_raw)

    @contextmanager
    def coherent_record(self, record, mutate, *, mutate_parameters=None, report_file=None, mutate_report=None):
        """Fault a committed record without relying on shallow hash failures."""
        directory = self.workspace/"objects"/record["object_id"]
        manifest = directory/"object.json"
        journal_path = self.workspace/"requests"/(record["request_id"]+".json")
        originals = {path:path.read_bytes() for path in (manifest,journal_path)}
        try:
            changed = copy.deepcopy(record)
            mutate(changed)
            if report_file:
                report_path = directory/report_file
                originals[report_path] = report_path.read_bytes()
                report = worker.strict_json(originals[report_path].decode("utf-8"))
                mutate_report(report)
                report_path.write_bytes(worker.canonical(report)+b"\n")
                changed["files_sha256"][report_file] = worker.sha_file(report_path)
            manifest.write_bytes(worker.canonical(changed)+b"\n")
            journal = worker.strict_json(originals[journal_path].decode("utf-8"))
            if mutate_parameters:
                mutate_parameters(journal["parameters"])
                journal["parameters_sha256"] = hashlib.sha256(worker.canonical(journal["parameters"])).hexdigest()
            journal["object_manifest_sha256"] = worker.sha_file(manifest)
            journal["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,**changed}
            journal_path.write_bytes(worker.canonical(journal)+b"\n")
            self.assertEqual(worker.Workspace(str(self.workspace),False)._object_record(record["object_id"])[0],changed)
            yield changed
        finally:
            for path, raw in originals.items():
                path.write_bytes(raw)

    def assert_get_and_original_result_refuse(self, record):
        for action, arguments in (("get",{"object_id":record["object_id"]}),
                                  ("result",{"query_request_id":record["request_id"]})):
            with self.subTest(recovery_action=action):
                denied = worker.execute(self.request(action,**arguments))
                self.assertFalse(denied["ok"],denied)
                self.assertEqual(denied["error"]["code"],"CORRUPT_OBJECT",denied)

    def test_support_labels_follow_entry_even_with_coherent_manifest_and_report_hashes(self):
        feature = self.call("discovery",object_id=self.calibrated["object_id"],entry="feature",
                            window_sizes=[32],max_candidates=1,max_size=128)
        for saved, expected, report_file in ((self.discovery,"MANUAL_SUPPORTED_LIMITED","discovery-report.json"),
                                             (self.review,"MANUAL_SUPPORTED_LIMITED","discovery-review.json"),
                                             (feature,"EXPERIMENTAL","discovery-report.json")):
            with self.subTest(kind=saved["kind"],support_status=expected):
                record = self.record(saved["object_id"])
                self.assertEqual(record["support_status"],expected)
                self.assertEqual(self.call("result",query_request_id=record["request_id"])["support_status"],expected)
                self.assertEqual(record["interpretation_status"],"hypothesized")
                wrong = "EXPERIMENTAL" if expected=="MANUAL_SUPPORTED_LIMITED" else "MANUAL_SUPPORTED_LIMITED"
                with self.coherent_record(record,lambda value:value.update(support_status=wrong),
                                          report_file=report_file,mutate_report=lambda value:value.update(support_status=wrong)):
                    self.assert_get_and_original_result_refuse(record)

    def test_legacy_discovery_and_review_without_optional_support_labels_remain_readable(self):
        # Removing only the new optional label models the earlier record contract;
        # the original arrays, interpretation, request identity and dependencies stay exact.
        for saved, report_file in ((self.discovery,"discovery-report.json"),(self.review,"discovery-review.json")):
            with self.subTest(kind=saved["kind"]):
                record = self.record(saved["object_id"])
                with self.coherent_record(record,lambda value:value.pop("support_status"),
                                          report_file=report_file,mutate_report=lambda value:value.pop("support_status")) as legacy:
                    self.assertEqual(self.call("get",object_id=record["object_id"]),{"state":"completed",**legacy})
                    self.assertEqual(self.call("result",query_request_id=record["request_id"]),{"state":"completed",**legacy})

    def test_cross_roi_review_history_cannot_be_recovered_with_coherent_original_request_and_hashes(self):
        other_rect = [32,32,96,96]
        other = self.call("discovery",**{**self.proposal_args,
                          "regions":[{"rect":other_rect,"reason":"Independent second public synthetic ROI"}]})
        other_fft = self.call("fft",object_id=self.calibrated["object_id"],rect=other_rect,
                              window="none",subtract_mean=True,max_size=128)
        other_review = self.call("discovery_review",object_id=other["object_id"],
                                 candidate_id=other["candidates"][0]["candidate_id"],evidence_ids=[other_fft["object_id"]],
                                 observation_text="Evidence belongs only to the second exact source ROI")
        refused = self.refuse("discovery_review",**{**self.review_args,"previous_review_id":other_review["object_id"]})
        self.assertEqual(refused["error"]["code"],"DISCOVERY_SCOPE_MISMATCH")
        fft_count = self.count("fft")
        revision = self.call("discovery_review",**{**self.review_args,"previous_review_id":self.review["object_id"]})
        record = self.record(revision["object_id"])
        self.assertEqual(self.call("get",object_id=record["object_id"]),{"state":"completed",**record})
        self.assertEqual(self.call("result",query_request_id=record["request_id"]),{"state":"completed",**record})
        other_record = self.record(other_review["object_id"])
        other_dependency = {"object_id":other_record["object_id"],"request_id":other_record["request_id"],
                            "manifest_sha256":worker.sha_file(self.workspace/"objects"/other_record["object_id"]/"object.json")}
        self.assertNotEqual(record["candidate"]["rect"],other_record["candidate"]["rect"])
        # Both the original request and reconstructed history point to the foreign
        # review. Own manifest/journal admission succeeds, so dependency semantics
        # must independently enforce the creation-time exact-ROI invariant.
        with self.coherent_record(record,lambda value:value.update(history=[*other_record["history"],other_dependency]),
                                  mutate_parameters=lambda value:value.update(previous_review_id=other_review["object_id"])):
            self.assert_get_and_original_result_refuse(record)
        self.assertEqual(self.call("get",object_id=record["object_id"]),{"state":"completed",**record})
        self.assertEqual(self.call("result",query_request_id=record["request_id"]),{"state":"completed",**record})
        self.assertEqual(self.count("fft"),fft_count,"Review revision/recovery must reuse existing FFTs")

    def test_manual_observation_retains_source_grid_reason_and_unknown_interpretation(self):
        record = self.record(self.discovery["object_id"])
        self.assertEqual(record["parameters"]["entry"],"manual")
        candidate = record["candidates"][0]
        self.assertEqual(candidate["rect"],self.rect)
        self.assertRegex(candidate["candidate_id"],r"^[a-f0-9]{32}$")
        self.assertIn(self.reason,json.dumps(candidate))
        self.assertIn("Contrast variation or structure change",json.dumps(candidate))
        self.assertIn("Image formation contribution is unknown",json.dumps(candidate))
        self.assertEqual(record["interpretation_status"],"hypothesized")
        self.assertIsNone(record["physical_conclusion"])
        self.assertEqual(candidate["entry_basis"],"researcher_statement")
        self.assertIn("Researcher attention is not numerical verification",candidate["unknowns"])
        self.assertEqual(record["source_context"]["frame_object_id"],self.frame["object_id"])
        self.assertEqual(record["source_context"]["shape_yx"],[128,128])
        self.assertEqual(record["source_context"]["dtype"],"float32")
        self.assertIn("nm",json.dumps(record["source_context"]))
        self.assertTrue(worker.Workspace(str(self.workspace),False).object(record["overview_object_id"])[0])

    def test_fft_peak_and_measurement_evidence_bind_without_creating_more_science(self):
        before = self.count("fft")
        reviewed = self.call("get",object_id=self.review["object_id"])
        self.assertEqual(reviewed["candidate"]["candidate_id"],self.candidate_id)
        self.assertEqual([ref["object_id"] for ref in reviewed["evidence_refs"]],self.review_args["evidence_ids"])
        self.assertEqual(reviewed["interpretation_status"],"hypothesized")
        self.assertIsNone(reviewed["physical_conclusion"])
        self.assertIn("No unique phase or defect inference",json.dumps(reviewed))
        self.assertEqual(self.count("fft"),before)
        self.assertEqual(worker.sha_file(self.source),self.source_sha)

    def test_fixed_g_gpa_review_hands_off_to_existing_f4_without_recreating_fft(self):
        before = self.count("fft")
        fft_files = {path:path.read_bytes() for path in (self.workspace/"objects"/self.fft["object_id"]).iterdir() if path.is_file()}
        # Existing 3-sigma mask admission rejects .03 for these two carriers:
        # separation sqrt(2)*.125 < 6*.03. Use a legal aperture, not a relaxed guard.
        parameters = dict(object_id=self.fft["object_id"],g_vectors=[[.125,0],[0,.125]],mask_sigma=.025,
                          reference_rect=[24,24,40,40],reference_text="Known synthetic central fixed carrier reference, not experimental strain truth",
                          source_domain="real_space_lattice",source_domain_text="Public analytic periodic real-space image",max_size=256)
        gpa = self.call("gpa",reference_mode="fixed_g",**parameters)
        self.assertEqual(gpa["shape_yx"],[64,64])
        self.assertFalse(gpa["fft_recomputed"])
        reviewed = self.call("discovery_review",**{**self.review_args,"evidence_ids":[gpa["object_id"]]})
        handoff = reviewed["method_handoff"]
        self.assertEqual(handoff["tool"],"image_method_plan")
        self.assertEqual(handoff["arguments"]["object_ids"],[gpa["object_id"]])
        self.assertEqual(handoff["arguments"]["information"],{"goal":"projected_topology"})
        plan = self.call("method_plan",**handoff["arguments"],
                         budget={"method_calls":2,"fft_pixels":0,"gpa_band_pixels":8192,"topology_path_samples":4096})
        self.assertEqual(plan["seed_object_ids"],[gpa["object_id"]])
        self.assertEqual(plan["ledger"]["attempts"],[])
        self.assertTrue(all(action["kind"] in ("stop","request_information") for action in plan["actions"]))
        self.assertIn(plan["decision"]["reason"],("clean_finite_saved_phase_roi","explicit_model_and_circuits_required"))
        self.assertEqual(self.call("result",query_request_id=plan["request_id"])["object_id"],plan["object_id"])
        fitted = self.call("gpa",reference_mode="fit_reference",**parameters)
        fitted_review = self.call("discovery_review",**{**self.review_args,"evidence_ids":[fitted["object_id"]]})
        self.assertIsNone(fitted_review["method_handoff"],"F4 currently admits fixed_g only, so fitted references must not advertise that handoff")
        self.assertEqual(self.count("fft"),before)
        for path, raw in fft_files.items():
            self.assertEqual(path.read_bytes(),raw)

    def test_original_id_deduplicates_and_parameter_conflict_never_overwrites(self):
        request = self.request("discovery",**self.proposal_args)
        first = worker.execute(request)
        self.assertTrue(first["ok"],first)
        before = self.count()
        again = worker.execute(copy.deepcopy(request))
        self.assertEqual(again["result"]["object_id"],first["result"]["object_id"])
        self.assertEqual(self.count(),before)
        changed = copy.deepcopy(request)
        changed["regions"][0]["reason"] = "Different original rationale"
        refused = worker.execute(changed)
        self.assertFalse(refused["ok"])
        self.assertEqual(refused["error"]["code"],"REQUEST_CONFLICT")
        self.assertEqual(self.count(),before)

    def test_review_retains_numeric_measurement_and_rejects_forged_original_points(self):
        object_id = self.measurement["object_id"]
        record = self.record(object_id)
        manifest = self.workspace/"objects"/object_id/"object.json"
        journal_path = self.workspace/"requests"/(record["request_id"]+".json")
        manifest_raw,journal_raw = manifest.read_bytes(),journal_path.read_bytes()
        try:
            changed = copy.deepcopy(record)
            changed["points"][1] = [.25,0]
            manifest.write_bytes(worker.canonical(changed)+b"\n")
            journal = worker.strict_json(journal_raw.decode("utf-8"))
            journal["object_manifest_sha256"] = worker.sha_file(manifest)
            journal["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,**changed}
            journal_path.write_bytes(worker.canonical(journal)+b"\n")
            own,_ = worker.Workspace(str(self.workspace),False)._object_record(object_id)
            self.assertEqual(own,changed)
            response = worker.execute(self.request("discovery_review",**{**self.review_args,"evidence_ids":[object_id]}))
            self.assertFalse(response["ok"], "Own hashes cannot authorize points different from the original scientific measurement request")
            self.assertEqual(response["error"]["code"],"CORRUPT_OBJECT",response)
        finally:
            manifest.write_bytes(manifest_raw)
            journal_path.write_bytes(journal_raw)
        observation = next(row for row in self.review["numerical_observations"] if row["object_id"]==object_id)
        self.assertIsInstance(observation["measurement"],dict,"A saved numeric measurement must not become a null review summary")
        self.assertEqual(observation["measurement"]["points"],record["points"])
        self.assertEqual(observation["measurement"]["d_spacing"],record["d_spacing"])
        self.assertEqual(observation["measurement"]["d_spacing_unit"],record["d_spacing_unit"])

    def test_current_scale_can_attach_to_saved_fft_without_recomputing_array(self):
        before = {p.parent.name:worker.sha_file(p) for p in (self.workspace/"objects").glob("*/data.npy")
                  if self.record(p.parent.name)["kind"] == "fft"}
        scale = self.call("calibrate",object_id=self.calibrated["object_id"],scope="image",
                          xy_scale={"x":.04,"y":-.03,"unit":"nm"},source_text="Explicit public synthetic scale correction")
        discovery = self.call("discovery",**{**self.proposal_args,"object_id":scale["object_id"]})
        attached = self.call("calibrate",object_id=self.fft["object_id"],calibration_object_id=scale["object_id"])
        measurement = self.call("measure",object_id=attached["object_id"],
                                coordinate_space="frequency_cycles_per_pixel",points=[[0,0],[.125,0]])
        review = self.call("discovery_review",object_id=discovery["object_id"],candidate_id=discovery["candidates"][0]["candidate_id"],
                           evidence_ids=[attached["object_id"],measurement["object_id"]],observation_text="Explicit current scale, unchanged original FFT")
        saved = next(v["measurement"] for v in review["numerical_observations"] if v["kind"] == "measure")
        self.assertAlmostEqual(saved["d_spacing"], .32)
        self.assertEqual(saved["d_spacing_unit"], "nm")
        stale = worker.execute(self.request("discovery_review",object_id=discovery["object_id"],candidate_id=discovery["candidates"][0]["candidate_id"],
                                            evidence_ids=[self.measurement["object_id"]],observation_text="Deliberate old-scale refusal"))
        self.assertFalse(stale["ok"])
        self.assertEqual(stale["error"]["code"],"DISCOVERY_SCOPE_MISMATCH")
        after = {p.parent.name:worker.sha_file(p) for p in (self.workspace/"objects").glob("*/data.npy")
                 if self.record(p.parent.name)["kind"] == "fft"}
        self.assertEqual(after,before)

    def test_foreign_roi_frame_and_calibration_do_not_become_same_candidate_evidence(self):
        frame = self.call("frame",object_id=self.opened["object_id"],frame_index=1)
        foreign = self.call("calibrate",object_id=frame["object_id"],scope="image",xy_scale={"x":.02,"y":-.03,"unit":"nm"},source_text="Other public synthetic frame")
        scale = self.call("calibrate",object_id=self.frame["object_id"],scope="image",xy_scale={"x":.04,"y":-.03,"unit":"nm"},source_text="Independent revised synthetic scale")
        for selected, rect in ((self.calibrated,[32,32,96,96]),(foreign,self.rect),(scale,self.rect)):
            fft = self.call("fft",object_id=selected["object_id"],rect=rect,window="none",subtract_mean=True,max_size=128)
            self.refuse("discovery_review",**{**self.review_args,"evidence_ids":[fft["object_id"]]})

    def test_discovery_and_review_history_are_bounded_and_old_records_remain_readable(self):
        old = self.record(self.discovery["object_id"])
        old_review = self.record(self.review["object_id"])
        previous = self.discovery
        previous_review = self.review
        for index in range(8):
            previous = self.call("discovery",**{**self.proposal_args,"previous_discovery_id":previous["object_id"]})
            previous_review = self.call("discovery_review",**{**self.review_args,"previous_review_id":previous_review["object_id"],"observation_text":"Bounded immutable review revision %d"%index})
        self.refuse("discovery",**{**self.proposal_args,"previous_discovery_id":previous["object_id"]})
        self.refuse("discovery_review",**{**self.review_args,"previous_review_id":previous_review["object_id"]})
        self.assertEqual(worker.Workspace(str(self.workspace),False).object(self.discovery["object_id"])[0],old)
        self.assertEqual(worker.Workspace(str(self.workspace),False).object(self.review["object_id"])[0],old_review)

    def test_coherent_own_hashes_cannot_hide_candidate_or_original_manual_parameter_tampering(self):
        object_id = self.discovery["object_id"]
        manifest = self.workspace/"objects"/object_id/"object.json"
        record = self.record(object_id)
        journal_path = self.workspace/"requests"/(record["request_id"]+".json")
        manifest_raw,journal_raw = manifest.read_bytes(),journal_path.read_bytes()
        for tamper in ("candidate","original_parameters"):
            try:
                changed = copy.deepcopy(record)
                journal = worker.strict_json(journal_raw.decode("utf-8"))
                if tamper=="candidate":
                    changed["candidates"][0]["rect"] = [25,24,89,88]
                    manifest.write_bytes(worker.canonical(changed)+b"\n")
                    journal["object_manifest_sha256"] = worker.sha_file(manifest)
                    journal["response"] = {"ok":True,"state":"completed","backend":worker.BACKEND,**changed}
                else:
                    journal["parameters"]["regions"][0]["reason"] = "Coherently altered original rationale"
                    journal["parameters_sha256"] = hashlib.sha256(worker.canonical(journal["parameters"])).hexdigest()
                journal_path.write_bytes(worker.canonical(journal)+b"\n")
                own,_ = worker.Workspace(str(self.workspace),False)._object_record(object_id)
                self.assertEqual(own,changed)
                denied = worker.execute(self.request("get",object_id=object_id))
                self.assertFalse(denied["ok"],denied)
                self.assertEqual(denied["error"]["code"],"CORRUPT_OBJECT",denied)
            finally:
                manifest.write_bytes(manifest_raw)
                journal_path.write_bytes(journal_raw)

    def test_fresh_recovery_and_invalid_regions_leave_source_and_original_fft_unchanged(self):
        counts = self.count(),self.count("fft")
        for record in (self.discovery,self.review):
            recovered = self.call("result",query_request_id=record["request_id"])
            self.assertEqual(recovered["object_id"],record["object_id"])
            self.assertEqual(worker.Workspace(str(self.workspace),False).object(record["object_id"])[0],self.record(record["object_id"]))
        self.assertEqual((self.count(),self.count("fft")),counts)
        for regions in ([{"rect":[0,0,129,64],"reason":"Outside source"}], [self.regions[0],self.regions[0]], [{"rect":self.rect,"reason":""}]):
            self.refuse("discovery",**{**self.proposal_args,"regions":regions})
        self.refuse("discovery",object_id=self.fft["object_id"],entry="manual",regions=self.regions)
        self.assertEqual(worker.sha_file(self.source),self.source_sha)

    def test_coherent_history_action_and_overview_redirection_are_not_authorized(self):
        revision = self.call("discovery",**{**self.proposal_args,"previous_discovery_id":self.discovery["object_id"]})
        record = self.record(revision["object_id"])
        self.assertEqual(record["history"][-1]["object_id"],self.discovery["object_id"])
        def redirect_action(value):
            value["next_actions"][0]["arguments"]["object_id"] = self.frame["object_id"]
        def redirect_overview(value):
            other = self.record(self.peaks["object_id"])
            value["overview_object_id"] = other["object_id"]
            value["overview_dependency"] = {"object_id":other["object_id"],"request_id":other["request_id"],
                                           "manifest_sha256":worker.sha_file(self.workspace/"objects"/other["object_id"]/"object.json")}
        for mutate in (lambda value:value.update(history=[]),redirect_action,redirect_overview,
                       lambda value:value["source_context"].update(dtype="uint16")):
            with self.subTest(mutation=mutate):
                self.assert_coherent_refusal(record,mutate)

    def test_coherent_review_history_gui_and_verification_claim_tampering_refuses(self):
        revision = self.call("discovery_review",**{**self.review_args,"previous_review_id":self.review["object_id"]})
        record = self.record(revision["object_id"])
        self.assertEqual(record["history"][-1]["object_id"],self.review["object_id"])
        for mutate in (lambda value:value.update(history=[]),
                       lambda value:value.update(gui_view_object_id=self.frame["object_id"]),
                       lambda value:value.update(review_is_scientific_verification=True),
                       lambda value:value.update(method_handoff={"tool":"image_method_plan","arguments":{"object_ids":[self.measurement["object_id"]]}}),
                       lambda value:value["cost"].update(new_fft_pixels=4096)):
            with self.subTest(mutation=mutate):
                self.assert_coherent_refusal(record,mutate)


if __name__=="__main__":
    unittest.main()
