"""Actual worker/journal/NPY integration on public analytic TIFF fixtures only."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import create_topology_fixtures as fixture
from tools import image_workspace as worker


class TopologyWorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="microscopy-topology-workspace-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.workspace = self.root / "workspace"
        self.counter = 0
        case = fixture.volterra_fixture()
        self.source = self.root / "public-analytic-projected-vortex.tiff"
        tifffile.imwrite(self.source, case["image"].astype(np.float32))
        self.source_hash = worker.sha_file(self.source)
        opened = self.call("open", source_path=str(self.source))
        self.frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        self.calibration = self.call("calibrate", object_id=self.frame["object_id"], scope="image",
                                     xy_scale={"x": .02, "y": -.03, "unit": "nm"},
                                     source_text="Public synthetic image signed metric; not specimen calibration")
        self.fft = self.call("fft", object_id=self.calibration["object_id"], rect=[0, 0, 256, 256],
                             window="none", subtract_mean=True, max_size=256)
        self.gpa_parameters = dict(object_id=self.fft["object_id"], mask_sigma=fixture.MASK_SIGMA,
                                   reference_rect=fixture.REFERENCE_RECT, reference_mode="fixed_g",
                                   source_domain="real_space_lattice", max_size=256,
                                   source_domain_text="Known public synthetic real-space multitone texture",
                                   reference_text="Public analytic fixture fixed-g reciprocal basis")
        self.first = self.gpa([0, 1])
        self.second = self.gpa([0, 2])
        self.topology_parameters = dict(object_ids=[self.first["object_id"], self.second["object_id"]],
                                        loops=[{"rect": rect, "orientation": "positive_image_xy", "loop_id": "loop%d" % i}
                                               for i, rect in enumerate(fixture.NESTED_LOOPS)],
                                        model_assumption_text="Public prescribed Volterra texture; conditional image-phase topology only",
                                        burgers_candidates=[{"label": "b8x", "b_pixel_xy": [8, 0]}], max_size=256)

    def request(self, action, request_id=None, **kwargs):
        self.counter += 1
        return dict(workspace=str(self.workspace), action=action,
                    **({"request_id": request_id or "topology_integration_%d" % self.counter}
                       if action not in ("get", "result") else {}), **kwargs)

    def call(self, action, **kwargs):
        response = worker.execute(self.request(action, **kwargs))
        self.assertTrue(response["ok"], response)
        json.dumps(response, allow_nan=False)
        return response["result"]

    def refuse(self, action, code=None, **kwargs):
        response = worker.execute(self.request(action, **kwargs))
        self.assertFalse(response["ok"], response)
        if code is not None:
            self.assertEqual(response["error"]["code"], code, response)
        return response

    def gpa(self, indices, **kwargs):
        return self.call("gpa", **{**self.gpa_parameters,
                                   "g_vectors": fixture.G_VECTORS[indices].tolist(), **kwargs})

    def object_dir(self, record):
        return self.workspace / "objects" / record["object_id"]

    def science_identities(self):
        return {record["object_id"]: record["kind"]
                for path in (self.workspace / "objects").glob("*/object.json")
                if (record := worker.read_json(path))["kind"] in ("fft", "gpa")}

    def protected_hashes(self):
        return {path: worker.sha_file(path) for path in (self.workspace / "objects").glob("*/*")
                if path.is_file()}

    def rewrite_own_record(self, record):
        """Deliberately corrupt a local test fixture while retaining own hashes.

        This checks semantic bindings beyond a superficial own hash comparison;
        it is not a claim of authentication against rewriting every ancestor.
        """
        directory = self.object_dir(record)
        (directory / "object.json").write_bytes(worker.canonical(record) + b"\n")
        journal_file = self.workspace / "requests" / (record["request_id"] + ".json")
        journal = worker.read_json(journal_file)
        journal["response"] = {"ok": True, "state": "completed", "backend": worker.BACKEND,
                               "request_id": record["request_id"], **record}
        journal["object_manifest_sha256"] = worker.sha_file(directory / "object.json")
        journal_file.write_bytes(worker.canonical(journal) + b"\n")
        own, _ = worker.Workspace(str(self.workspace), False)._object_record(record["object_id"])
        self.assertEqual(own, record)

    def test_actual_pipeline_info_result_export_revision_and_immutable_sources(self):
        before = self.science_identities()
        protected = self.protected_hashes()
        result = self.call("topology", request_id="saved_topology", **self.topology_parameters)
        self.assertEqual(result["report"]["status"], "projected_topological_evidence")
        self.assertEqual(result["report"]["interpretation_status"], "hypothesized")
        self.assertFalse(result["material_dislocation_confirmed"])
        self.assertFalse(result["burgers_3d_unique"])
        self.assertFalse(result["fft_recomputed"])
        self.assertFalse(result["gpa_recomputed"])
        self.assertEqual(result["report"]["reflection_count"], 3)
        np.testing.assert_allclose(result["report"]["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-6)
        np.testing.assert_allclose(result["report"]["projected_burgers"]["b_nm_xy"], [.16, 0], atol=1e-6)
        self.assertEqual(result["input_dependency"]["common"]["fft"]["object_id"], self.fft["object_id"])
        self.assertEqual(result["input_dependency"]["common"]["source_mapping"]["source_object_id"], self.frame["object_id"])
        self.assertEqual(result["input_dependency"]["common"]["source_mapping"]["source_rect_xyxy"], [0, 0, 256, 256])
        self.assertEqual(result["calibration_dependency"]["calibration_id"], self.calibration["object_id"])
        directory = self.object_dir(result)
        winding = np.load(directory / "loop_winding_integer.npy", allow_pickle=False)
        np.testing.assert_array_equal(winding, [[-1, 0, -1], [-1, 0, -1]])
        phase = np.load(directory / "path_phase_radians.npy", allow_pickle=False)
        offsets = np.load(directory / "path_offsets.npy", allow_pickle=False)
        increments = np.load(directory / "wrapped_phase_step_radians.npy", allow_pickle=False)
        for start, end in zip(offsets[:-1], offsets[1:]):
            expected = (np.roll(phase[:, start:end], -1, axis=1) - phase[:, start:end] + np.pi) % (2 * np.pi) - np.pi
            np.testing.assert_array_equal(increments[:, start:end], expected)
        self.assertEqual(self.call("get", object_id=result["object_id"])["object_id"], result["object_id"])
        recovered = self.call("result", query_request_id="saved_topology")
        self.assertEqual(recovered, result)
        self.assertEqual(self.call("topology", request_id="saved_topology", **self.topology_parameters), result)
        exported = self.call("export", object_id=result["object_id"], output_dir=str(self.root / "exported-topology"))
        output = Path(exported["output_dir"])
        for name, digest in exported["exported_files_sha256"].items():
            self.assertEqual(worker.sha_file(output / name), digest)
        for name in ("topology-report.json", "topology-circuits.csv", "path_phase_radians.npy", "path_amplitude.npy"):
            self.assertEqual(worker.sha_file(output / name), result["files_sha256"][name])
        manifest = worker.read_json(output / "manifest.json")
        self.assertEqual(manifest["scientific_object"]["object_id"], result["object_id"])
        provenance = worker.read_json(output / "provenance.json")
        for source_id in [self.fft["object_id"], self.first["object_id"], self.second["object_id"], self.frame["object_id"]]:
            self.assertIn(source_id, provenance["objects"])
        revision = self.call("topology", **{**self.topology_parameters,
                             "loops": [{**loop, "orientation": "negative_image_xy"} for loop in self.topology_parameters["loops"]],
                             "previous_topology_id": result["object_id"]})
        self.assertEqual(revision["history"][-1]["object_id"], result["object_id"])
        np.testing.assert_allclose(revision["report"]["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-6)
        self.assertEqual(revision["report"]["loops"][0]["reflections"][0]["winding_integer"], 1)
        revision_export = self.call("export", object_id=revision["object_id"], output_dir=str(self.root / "exported-revision"))
        self.assertIn(result["object_id"], worker.read_json(Path(revision_export["output_dir"]) / "provenance.json")["objects"])
        self.assertEqual(self.science_identities(), before)
        self.assertEqual(worker.sha_file(self.source), self.source_hash)
        for path, digest in protected.items():
            self.assertEqual(worker.sha_file(path), digest)

    def test_fixed_g_only_and_exact_gpa_records_not_frame_or_gpa_view(self):
        fitted = self.gpa([0, 2], reference_mode="fit_reference")
        view = self.call("gpa_view", object_id=self.first["object_id"], component="phase_1", max_size=256)
        for record in (fitted, self.frame, view):
            self.refuse("topology", "UNSUPPORTED_OPERATION", **{**self.topology_parameters,
                        "object_ids": [self.first["object_id"], record["object_id"]]})

    def test_exact_fft_identity_is_required_even_when_array_bytes_match(self):
        same_fft_values = self.call("fft", object_id=self.calibration["object_id"], rect=[0, 0, 256, 256],
                                    window="none", subtract_mean=True, max_size=256)
        self.assertEqual(same_fft_values["files_sha256"]["data.npy"], self.fft["files_sha256"]["data.npy"])
        other = self.gpa([0, 2], object_id=same_fft_values["object_id"])
        self.refuse("topology", "TOPOLOGY_SCOPE_MISMATCH", **{**self.topology_parameters,
                    "object_ids": [self.first["object_id"], other["object_id"]]})
        previous = self.call("topology", **self.topology_parameters)
        other_first = self.gpa([0, 1], object_id=same_fft_values["object_id"])
        self.refuse("topology", "TOPOLOGY_SCOPE_MISMATCH", **{**self.topology_parameters,
                    "object_ids": [other_first["object_id"], other["object_id"]],
                    "previous_topology_id": previous["object_id"]})

    def test_nonzero_source_roi_origin_preserves_local_circuit_grid(self):
        padded = np.zeros((304, 320), dtype=np.float32)
        padded[24:280, 24:280] = fixture.volterra_fixture()["image"]
        source = self.root / "padded-public-analytic-texture.tiff"
        tifffile.imwrite(source, padded)
        opened = self.call("open", source_path=str(source))
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        calibrated = self.call("calibrate", object_id=frame["object_id"], scope="image",
                               xy_scale={"x": .02, "y": -.03, "unit": "nm"},
                               source_text="Public padded synthetic texture signed metric")
        view = self.call("view", object_id=calibrated["object_id"], rect=[16, 24, 288, 280], max_size=256)
        fft = self.call("fft", object_id=view["object_id"], rect=[8, 0, 264, 256],
                        window="none", subtract_mean=True, max_size=256)
        first = self.gpa([0, 1], object_id=fft["object_id"])
        second = self.gpa([0, 2], object_id=fft["object_id"])
        result = self.call("topology", **{**self.topology_parameters,
                           "object_ids": [first["object_id"], second["object_id"]]})
        self.assertEqual(result["input_dependency"]["common"]["source_mapping"]["source_object_id"], frame["object_id"])
        self.assertEqual(result["input_dependency"]["common"]["source_mapping"]["source_rect_xyxy"], [24, 24, 280, 280])
        self.assertEqual(result["report"]["loops"][0]["rect_xyxy"], fixture.NESTED_LOOPS[0])
        np.testing.assert_allclose(result["report"]["projected_burgers"]["b_pixel_xy"], [8, 0], atol=1e-6)
        path = np.load(self.object_dir(result) / "path_xy.npy", allow_pickle=False)
        np.testing.assert_array_equal(path[0], fixture.NESTED_LOOPS[0][:2])

    def test_exact_bandwidth_and_calibration_dependencies_must_match(self):
        different_mask = self.gpa([0, 2], mask_sigma=.014)
        selected = self.call("calibrate", object_id=self.fft["object_id"], scope="image",
                             xy_scale={"x": .03, "y": -.03, "unit": "nm"},
                             source_text="Public synthetic alternate calibration for rejection check")
        different_metric = self.gpa([0, 2], object_id=selected["object_id"])
        for other in (different_mask, different_metric):
            self.refuse("topology", "TOPOLOGY_SCOPE_MISMATCH", **{**self.topology_parameters,
                        "object_ids": [self.first["object_id"], other["object_id"]]})

    def test_duplicate_and_conjugate_saved_bands_do_not_create_redundancy(self):
        repeated = self.gpa([0, 1])
        conjugate = self.gpa([0, 1], g_vectors=(-fixture.G_VECTORS[[0, 1]]).tolist())
        result = self.call("topology", **{**self.topology_parameters,
                           "object_ids": [self.first["object_id"], repeated["object_id"], conjugate["object_id"]]})
        self.assertEqual(result["report"]["reflection_count"], 2)
        self.assertEqual(result["report"]["status"], "constrained_candidate_without_redundancy")
        self.assertFalse(result["report"]["projected_burgers"]["redundancy_validated"])
        self.assertEqual([len(row["aliases"]) for row in result["retained_reflections"]], [2, 2])
        self.assertTrue(all(any(alias["phase_sign_to_retained"] == -1 for alias in row["aliases"])
                            for row in result["retained_reflections"]))

    def test_contradictory_repeated_band_is_refused_despite_coherent_own_source_hashes(self):
        repeated = self.gpa([0, 1])
        path = self.object_dir(repeated) / "phase_demodulated_wrapped.npy"
        phase = np.load(path, allow_pickle=False)
        phase[0, 80, 80] = (phase[0, 80, 80] + .1 + np.pi) % (2 * np.pi) - np.pi
        with path.open("wb") as output:
            np.save(output, phase, allow_pickle=False)
        repeated["files_sha256"][path.name] = worker.sha_file(path)
        self.rewrite_own_record(repeated)
        self.assertEqual(self.call("get", object_id=repeated["object_id"])["object_id"], repeated["object_id"])
        response = self.refuse("topology", "CORRUPT_OBJECT", **{**self.topology_parameters,
                               "object_ids": [self.first["object_id"], repeated["object_id"]]})
        self.assertIn("contradictory saved bands", response["error"]["message"])

    def test_edge_invalid_circuits_are_unknown_with_nan_science_arrays(self):
        result = self.call("topology", **{**self.topology_parameters,
                           "loops": [{"rect": [2, 2, 28, 28], "orientation": "positive_image_xy"},
                                     {"rect": [8, 8, 20, 20], "orientation": "positive_image_xy"}]})
        self.assertEqual(result["report"]["status"], "insufficient_loop_stability")
        self.assertIsNone(result["report"]["projected_burgers"]["b_pixel_xy"])
        self.assertFalse(result["report"]["burgers_candidates"][0]["matches_saved_constraints"])
        for loop in result["report"]["loops"]:
            for row in loop["reflections"]:
                self.assertFalse(row["valid"])
                self.assertIsNone(row["winding_cycles"])
                self.assertIsNone(row["winding_integer"])
                self.assertIsNotNone(row["diagnostic_winding_integer"])
        self.assertTrue(np.isnan(np.load(self.object_dir(result) / "loop_winding_cycles.npy", allow_pickle=False)).all())
        self.assertFalse(np.load(self.object_dir(result) / "loop_valid.npy", allow_pickle=False).any())
        json.dumps(result, allow_nan=False)

    def test_stale_calibration_export_is_refused_without_creating_output(self):
        result = self.call("topology", **self.topology_parameters)
        selected = self.call("calibrate", object_id=result["object_id"], scope="image",
                             xy_scale={"x": .04, "y": -.06, "unit": "nm"},
                             source_text="Later synthetic scale must not relabel a saved topology result")
        output = self.root / "stale-export"
        self.refuse("export", "STALE_CALIBRATION_RESULT", object_id=selected["object_id"], output_dir=str(output))
        self.assertFalse(output.exists())

    def test_request_fingerprint_corruption_cannot_be_read_or_recovered(self):
        result = self.call("topology", request_id="fingerprint_topology", **self.topology_parameters)
        journal_file = self.workspace / "requests" / "fingerprint_topology.json"
        journal = worker.read_json(journal_file)
        journal["parameters"]["model_assumption_text"] = "Changed after completion without matching original fingerprint"
        journal_file.write_bytes(worker.canonical(journal) + b"\n")
        self.refuse("get", "CORRUPT_OBJECT", object_id=result["object_id"])
        self.refuse("result", "CORRUPT_OBJECT", query_request_id="fingerprint_topology")

    def test_own_array_hash_and_source_manifest_bindings_are_verified(self):
        result = self.call("topology", **self.topology_parameters)
        saved = self.object_dir(result) / "path_phase_radians.npy"
        with saved.open("r+b") as stream:
            stream.seek(-1, 2)
            stream.write(bytes([saved.read_bytes()[-1] ^ 1]))
        self.refuse("get", "CORRUPT_OBJECT", object_id=result["object_id"])

    def test_changed_source_manifest_is_refused_even_with_coherent_source_own_hashes(self):
        result = self.call("topology", **self.topology_parameters)
        changed = copy.deepcopy(self.second)
        # A presentation-only field still changes the exact saved GPA identity.
        changed["display"]["review_note"] = "Deliberate local tamper fixture"
        self.rewrite_own_record(changed)
        self.assertEqual(self.call("get", object_id=changed["object_id"])["object_id"], changed["object_id"])
        self.refuse("get", "CORRUPT_OBJECT", object_id=result["object_id"])
        self.refuse("export", "CORRUPT_OBJECT", object_id=result["object_id"], output_dir=str(self.root / "corrupt-export"))
        self.assertFalse((self.root / "corrupt-export").exists())

    def test_revision_ancestry_must_agree_with_original_previous_topology(self):
        first = self.call("topology", **self.topology_parameters)
        alternate = self.call("topology", **{**self.topology_parameters, "amplitude_floor_relative": .06})
        revision = self.call("topology", **{**self.topology_parameters, "previous_topology_id": first["object_id"]})
        revision["history"][-1] = {"object_id": alternate["object_id"], "request_id": alternate["request_id"],
                                   "manifest_sha256": worker.sha_file(self.object_dir(alternate) / "object.json")}
        self.rewrite_own_record(revision)
        self.refuse("get", "CORRUPT_OBJECT", object_id=revision["object_id"])

    def test_request_conflict_and_unsupported_inputs_do_not_create_new_science(self):
        self.call("topology", request_id="same_topology", **self.topology_parameters)
        before = self.science_identities()
        self.refuse("topology", "REQUEST_CONFLICT", request_id="same_topology",
                    **{**self.topology_parameters, "amplitude_floor_relative": .06})
        self.refuse("topology", "INVALID_ARGUMENT", **{**self.topology_parameters, "phase_step_limit": 3.0})
        self.refuse("topology", "INVALID_ARGUMENT", **{**self.topology_parameters, "model_assumption_text": ""})
        self.assertEqual(self.science_identities(), before)


if __name__ == "__main__":
    unittest.main()
