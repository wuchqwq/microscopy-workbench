"""Four explicit synthetic candidates through real saved provider contracts.

Set HRTEM_TASK_B_OUTPUT to a NEW absolute directory to retain all inputs,
workspaces, journals and read receipts. This fixture client acknowledges receipt
of previews; it does not claim that a human inspected a GUI.
"""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import create_topology_fixtures as fixture
from tools import image_workspace as worker
from tools import image_candidate_assessment as assessment
from preview_test_support import acknowledge_received_previews


class CandidateClient:
    def __init__(self, root):
        self.root = root
        self.workspace = root / "workspace"
        self.serial = 0

    def request(self, action, **kwargs):
        self.serial += 1
        request_id = kwargs.pop("request_id", "candidate-%d" % self.serial)
        return dict(workspace=str(self.workspace), action=action,
                    **({"request_id": request_id} if action not in ("get", "result") else {}), **kwargs)

    def call(self, action, **kwargs):
        response = worker.execute(self.request(action, **kwargs))
        if not response.get("ok"):
            raise AssertionError(response)
        acknowledge_received_previews(worker, self.workspace, response["result"])
        return response["result"]


def write_json(path, value):
    path.write_bytes(worker.canonical(value) + b"\n")


def hashes(root):
    return {str(path.relative_to(root)): worker.sha_file(path) for path in root.rglob("*") if path.is_file()}


def build_case(root, name):
    root.mkdir()
    client = CandidateClient(root)
    case = fixture.null_fixture("none") if name == "negative" else (
        fixture.contrast_vortex_fixture() if name == "contrast_vortex" else fixture.volterra_fixture())
    image = case["image"].copy()
    if name == "low_amplitude":
        image[:, 152:] = 0  # explicit broad contrast loss crosses both right circuit edges
    source = root / "input.tiff"
    tifffile.imwrite(source, image.astype(np.float32))
    material_u = case.get("true_material_displacement_pixel_xy", case["displacement_pixel_xy"])
    np.save(root / "supplied-displacement-pixel-xy.npy", material_u, allow_pickle=False)
    truth = {"case": name, "origin": "explicit_synthetic_construction_not_independent_observation",
        "generator": "tools/create_topology_fixtures.py: " + (
            "null_fixture('none')" if name == "negative" else "contrast_vortex_fixture()" if name == "contrast_vortex" else "volterra_fixture()"),
        "generator_sha256": worker.sha_file(Path(fixture.__file__)),
        "formula": "I=sum_j A_j cos(2*pi*G_j*r-2*pi*G_j*u); u=b*atan2(y-128.5,x-128.5)/(2*pi), b=(8,0) pixels; A=tanh(radius/2)^abs(G*b)",
        "exception": {"negative": "u=0, A=1: no prescribed core", "low_amplitude": "I[:,152:]=0 after construction; reference remains left of stripe",
            "contrast_vortex": "Fixed lattice carriers, material u=0; complex contrast coefficients C_j=A_j exp(-i*(G_j*b)*theta) produce identical intensities",
            "positive": "Prescribed projected displacement texture; no atomistic/multislice/material validation"}[name],
        "material_burgers_pixel_xy": [0, 0] if name in ("negative", "contrast_vortex") else [8, 0],
        "image_phase_winding_oracle": [0, 0, 0] if name == "negative" else [-1, 0, -1],
        "oracle_basis": "Geometric enclosure and prescribed phase -G*b, independent of the sampled circulation kernel; unavailable paths must abstain",
        "source_sha256": worker.sha_file(source),
        "displacement_sha256": worker.sha_file(root / "supplied-displacement-pixel-xy.npy"),
        "real_specimen": False, "physical_units": "unknown; pixels only"}
    write_json(root / "supplied-truth.json", truth)
    opened = client.call("open", source_path=str(source))
    frame = client.call("frame", object_id=opened["object_id"], frame_index=0)
    discovery = client.call("discovery", object_id=frame["object_id"], entry="manual", selection_origin="agent",
        regions=[{"rect": [0, 0, 256, 256], "reason": "Explicit synthetic test candidate at (128.5,128.5); supplied construction, not automatic discovery"}], max_size=256)
    fft = client.call("fft", object_id=frame["object_id"], rect=[0, 0, 256, 256], window="none", subtract_mean=True, max_size=256)
    model = "Synthetic fixed-g multitone phase model phi=-2*pi*G*u. Contrast-only coefficients can give identical pixels; material displacement is NOT identified by this model fit."
    gpas = [client.call("gpa", object_id=fft["object_id"], g_vectors=fixture.G_VECTORS[indices].tolist(),
        mask_sigma=fixture.MASK_SIGMA, reference_rect=fixture.REFERENCE_RECT, reference_mode="fixed_g",
        source_domain="real_space_lattice", source_domain_text="Explicit synthetic multitone construction, not measured atomic structure",
        reference_text="Prescribed carrier basis and explicit reference [56,56,88,88]; not experimentally certified defect-free", max_size=256)
        for indices in ([0, 1], [0, 2])]
    loops = [{"loop_id": "loop%d" % i, "rect": rect, "orientation": "positive_image_xy"} for i, rect in enumerate(fixture.NESTED_LOOPS)]
    initial = client.call("method_plan", object_ids=[g["object_id"] for g in gpas],
        budget={"method_calls": 1, "fft_pixels": 0, "gpa_band_pixels": 0, "topology_path_samples": 10000},
        information={"goal": "projected_topology", "loops": loops, "model_assumption_text": model})
    actions = [a for a in initial["actions"] if a["kind"] == "topology"]
    step = None
    if actions:
        step = client.call("method_step", request_id=initial["next_request_id"], object_id=initial["object_id"],
            root_plan_id=initial["root_plan_id"], action_id=actions[0]["action_id"],
            selection_reason="Explicit synthetic Task B request: inspect known nested circuits without promoting image topology to material evidence")
        topology = client.call("get", object_id=step["child_receipt"]["object_id"])
        plan = client.call("method_next", object_id=step["object_id"])
    else:
        # Stop remains a stop. An explicitly requested negative/path refusal
        # control is a separate direct call, not a hidden method-loop expense.
        topology = client.call("topology", object_ids=[g["object_id"] for g in gpas], loops=loops,
            model_assumption_text=model, max_size=256)
        plan = initial
    observation = {
        "positive": "Supplied displacement construction has b=(8,0) pixels around the prescribed centre; this is truth input, not automatic lattice tracing.",
        "negative": "Supplied undeformed carrier construction has material u=0 and no core; it opposes the specified nonzero candidate within these paths.",
        "low_amplitude": "The prescribed right-side contrast loss crosses both circuit boundaries; real-space continuity is unavailable there.",
        "contrast_vortex": "Supplied fixed-carrier contrast-only construction has material u=0 despite the same image pixels and winding as the displacement example; it opposes a material-displacement explanation of this construction."}[name]
    supplied = {"hypothesis": "Specified candidate near (128.5,128.5): nonzero projected closure b=(8,0) pixels under the supplied displacement model",
        "real_space_evidence": {"origin": "synthetic_construction", "source_text": "supplied-truth.json sha256=" + worker.sha_file(root / "supplied-truth.json") + "; supplied-displacement-pixel-xy.npy sha256=" + truth["displacement_sha256"] + "; " + truth["generator"] + "; " + truth["exception"],
        "observation_text": observation, "relation": {"positive": "supports", "negative": "opposes", "low_amplitude": "unknown", "contrast_vortex": "opposes"}[name],
        "anchors_xy": [[128.5, 128.5], [175, 128], [191, 128]]}}
    args = dict(object_id=discovery["object_id"], candidate_id=discovery["candidates"][0]["candidate_id"],
        evidence_ids=[*[g["object_id"] for g in gpas], topology["object_id"], plan["object_id"]],
        observation_text="Explicit source-bound synthetic evidence composition; real-space statements retain supplied-input authority.",
        candidate_assessment=supplied)
    protected = hashes(root)
    review = client.call("discovery_review", **args)
    before_reads = hashes(root)
    reopened = client.call("get", object_id=review["object_id"])
    recovered = client.call("result", query_request_id=review["request_id"])
    compact = worker.execute(dict(workspace=str(client.workspace), action="get", object_id=review["object_id"], response_detail="compact"))
    assert compact["ok"], compact
    assert review == reopened == recovered
    assert compact["result"]["candidate_result"] == review["candidate_result"]
    assert hashes(root) == before_reads, "Reads changed saved files"
    assert all(worker.sha_file(root / path) == digest for path, digest in protected.items()), "Review changed prior evidence"
    receipt = {"case": name, "source_sha256": truth["source_sha256"], "frame": frame["object_id"],
        "discovery": discovery["object_id"], "candidate_id": args["candidate_id"], "gpa_ids": [g["object_id"] for g in gpas],
        "topology": topology["object_id"], "topology_status": topology["report"]["status"],
        "method_initial": initial["object_id"], "method_step": step["object_id"] if step else None,
        "method_plan": plan["object_id"], "method_initial_reason": initial["decision"]["reason"],
        "review": review["object_id"], "request_id": review["request_id"],
        "review_args": args, "get_result_exact": True, "compact_assessment_exact": True,
        "prior_evidence_unchanged": True, "reads_unchanged": True,
        "readable": str(Path(review["manifest_path"]).parent / "candidate-review.txt")}
    write_json(root / "receipt.json", receipt)
    write_json(root / "before-review-hashes.json", protected)
    return client, review, topology, receipt


class CandidateChain(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        retained = os.environ.get("HRTEM_TASK_B_OUTPUT")
        cls.temp = None if retained else tempfile.TemporaryDirectory(prefix="hrtem-candidate-chain-")
        cls.root = Path(retained or cls.temp.name).resolve()
        if retained:
            if not Path(retained).is_absolute() or cls.root.exists():
                raise ValueError("HRTEM_TASK_B_OUTPUT must name a new absolute directory")
            cls.root.mkdir(parents=True)
        cls.cases = {name: build_case(cls.root / name, name) for name in ("positive", "negative", "low_amplitude", "contrast_vortex")}

    @classmethod
    def tearDownClass(cls):
        if cls.temp:
            cls.temp.cleanup()

    def test_four_known_cases_and_same_pixel_counterexample(self):
        expected = {"positive": "projected_topological_evidence", "negative": "no_net_winding_detected",
                    "low_amplitude": "insufficient_loop_stability", "contrast_vortex": "projected_topological_evidence"}
        for name, (client, review, topology, receipt) in self.cases.items():
            with self.subTest(case=name):
                self.assertEqual(topology["report"]["status"], expected[name])
                result = review["candidate_result"]
                self.assertFalse(result["material_dislocation_confirmed"])
                self.assertFalse(result["automatic_real_space_tracing"])
                self.assertTrue(result["unknown"])
                self.assertTrue(result["next_tools"])
                self.assertEqual(result["conditions"]["gpa_references"][0]["reference_rect"], fixture.REFERENCE_RECT)
                self.assertEqual(result["conditions"]["loops"][0]["rect"], fixture.NESTED_LOOPS[0])
                self.assertIn("Supports:", Path(receipt["readable"]).read_text(encoding="utf-8"))
                self.assertTrue(receipt["get_result_exact"] and receipt["compact_assessment_exact"])
                if name in ("positive", "contrast_vortex"):
                    self.assertTrue(result["supports"])
                    np.testing.assert_allclose(topology["report"]["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-6)
                    np.testing.assert_array_equal(np.load(client.workspace / "objects" / topology["object_id"] / "loop_winding_integer.npy"), [[-1, 0, -1]] * 2)
                if name in ("negative", "contrast_vortex"):
                    self.assertTrue(result["opposes"])
        positive = self.cases["positive"][0].root
        contrast = self.cases["contrast_vortex"][0].root
        np.testing.assert_array_equal(tifffile.imread(positive / "input.tiff"), tifffile.imread(contrast / "input.tiff"))
        np.testing.assert_array_equal(np.load(contrast / "supplied-displacement-pixel-xy.npy"), 0)
        self.assertTrue(any("ineligible_path_pixel" in row["failures"] and row["low_amplitude_path_pixels"] > 0
            for loop in self.cases["low_amplitude"][2]["report"]["loops"] for row in loop["reflections"]))

    def test_missing_source_wrong_paths_and_foreign_frame_are_refused(self):
        client, review, topology, receipt = self.cases["positive"]
        for mutate in (
            lambda a: a["candidate_assessment"]["real_space_evidence"].pop("source_text"),
            lambda a: a["candidate_assessment"]["real_space_evidence"].update(anchors_xy=[[256, 128]]),
            lambda a: a["candidate_assessment"]["real_space_evidence"].update(anchors_xy=[[float("inf"), 128]]),
            lambda a: a.update(evidence_ids=receipt["gpa_ids"]),
            lambda a: a["candidate_assessment"].update(material_dislocation_confirmed=True),
        ):
            args = copy.deepcopy(receipt["review_args"]); mutate(args)
            response = worker.execute(client.request("discovery_review", **args))
            self.assertFalse(response["ok"], response)
        # Same frame, different sourced circuits: no silent plan/path substitution.
        other = client.call("method_plan", object_ids=receipt["gpa_ids"],
            budget={"method_calls": 0, "fft_pixels": 0, "gpa_band_pixels": 0, "topology_path_samples": 0},
            information={"goal": "projected_topology", "loops": [{"rect": [40, 40, 216, 216], "orientation": "positive_image_xy"},
                {"rect": [48, 48, 208, 208], "orientation": "positive_image_xy"}],
                "model_assumption_text": topology["parameters"]["model_assumption_text"]})
        args = copy.deepcopy(receipt["review_args"]); args["evidence_ids"][-1] = other["object_id"]
        response = worker.execute(client.request("discovery_review", **args))
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["error"]["code"], "DISCOVERY_SCOPE_MISMATCH")
        # Another opened copy has identical pixels but a distinct source/frame identity.
        opened = client.call("open", source_path=str(client.root / "input.tiff"))
        frame = client.call("frame", object_id=opened["object_id"], frame_index=0)
        foreign = client.call("discovery", object_id=frame["object_id"], entry="manual", regions=[{
            "rect": [0, 0, 256, 256], "reason": "Same pixels, different immutable frame"}], max_size=256)
        args = copy.deepcopy(receipt["review_args"]); args.update(object_id=foreign["object_id"], candidate_id=foreign["candidates"][0]["candidate_id"])
        response = worker.execute(client.request("discovery_review", **args))
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["error"]["code"], "DISCOVERY_SCOPE_MISMATCH")

    def test_saved_assessment_semantic_tamper_rejected_beyond_own_hash(self):
        client, review, _, _ = self.cases["positive"]
        manifest = client.workspace / "objects" / review["object_id"] / "object.json"
        journal_path = client.workspace / "requests" / (review["request_id"] + ".json")
        report_path = manifest.parent / "discovery-review.json"
        original = {p: p.read_bytes() for p in (manifest, journal_path, report_path)}
        try:
            changed = copy.deepcopy(review)
            changed["candidate_result"]["material_dislocation_confirmed"] = True
            report = worker.read_json(report_path); report["candidate_result"] = changed["candidate_result"]
            write_json(report_path, report)
            changed["files_sha256"]["discovery-review.json"] = worker.sha_file(report_path)
            write_json(manifest, changed)
            journal = worker.read_json(journal_path)
            journal["object_manifest_sha256"] = worker.sha_file(manifest)
            journal["response"] = {"ok": True, "state": "completed", "backend": worker.BACKEND, "request_id": changed["request_id"], **changed}
            write_json(journal_path, journal)
            worker.Workspace(str(client.workspace), False)._object_record(review["object_id"])
            response = worker.execute(client.request("get", object_id=review["object_id"]))
            self.assertFalse(response["ok"], response)
            self.assertEqual(response["error"]["code"], "CORRUPT_OBJECT")
        finally:
            for path, raw in original.items(): path.write_bytes(raw)
        self.assertEqual(client.call("get", object_id=review["object_id"]), review)

    def test_readable_units_origins_and_unknown_are_directly_visible(self):
        for _, review, _, receipt in self.cases.values():
            text = assessment.readable(review["candidate_result"])
            self.assertEqual(text, Path(receipt["readable"]).read_text(encoding="utf-8"))
            for expected in ("Supports:", "Opposes:", "Unknown:", "Next tools/data:", "source pixels", "synthetic_construction", "NOT confirmed", "Model assumption:", "GPA references:"):
                self.assertIn(expected, text)
            preview = "\n".join(assessment.preview_lines(review["candidate_result"]))
            for expected in ("Supports:", "Opposes:", "Unknown:", "Next:", "source pixels", "NOT confirmed", "caller relation="):
                self.assertIn(expected, preview)

    def test_export_retains_existing_method_chain_and_new_helper_identity(self):
        client, review, _, receipt = self.cases["positive"]
        exported = client.call("export", object_id=review["object_id"], output_dir=str(client.root / "exported-review"))
        provenance = worker.read_json(Path(exported["output_dir"]) / "provenance.json")
        for ident in [receipt["frame"], receipt["discovery"], *receipt["gpa_ids"], receipt["topology"],
                      receipt["method_initial"], receipt["method_step"], receipt["method_plan"], receipt["review"]]:
            self.assertIn(ident, provenance["objects"])
        for name, digest in exported["exported_files_sha256"].items():
            self.assertEqual(worker.sha_file(Path(exported["output_dir"]) / name), digest)
        self.assertEqual(review["software_provenance"]["helper_modules_sha256"]["image_candidate_assessment.py"], worker.sha_file(Path(assessment.__file__)))


if __name__ == "__main__":
    unittest.main()
