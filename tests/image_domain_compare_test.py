"""Independent finite-angle geometry and saved-dependency checks for R3.

Analytic reciprocal vectors are the oracle, not the comparison implementation.
These tests do not claim experimental, browser or independent model acceptance.
"""
import copy
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import image_domain_compare as comparison
import image_joint as joint
import image_peaks
import image_workspace as worker


ANGLE = math.degrees(math.atan2(3, 4))
A = [(10/128, 0), (0, 15/128)]
B = [(8/128, 6/128), (-9/128, 12/128)]


def signature(vectors, prefix="m", truncated=False):
    observations = []
    for i, vector in enumerate(vectors):
        for sign in (-1, 1):
            point = [sign*v for v in vector]
            observations.append({"measurement_object_id": "%s-%d-%d" % (prefix, i, sign),
                                 "frequency_cycles_per_pixel": point, "vector_xy": point})
    return {"families": comparison.fold_families(observations), "quality": {"detection_truncated": truncated}}


class Geometry(unittest.TestCase):
    def test_analytic_rotation_and_antipodal_equivalence_keep_all_ids(self):
        first, second = signature(A, "a"), signature(B, "b")
        result = comparison.compare_families(first, second, [0., ANGLE, ANGLE-180.], 1e-12)
        self.assertEqual(result["status"], "compatible_signature")
        self.assertEqual(result["accepted_angles_degrees"], [ANGLE, ANGLE-180.])
        self.assertEqual(len(result["accepted_antipodal_angle_classes"]), 1)
        self.assertEqual(len(first["families"]), 2)
        self.assertEqual(sum(len(row["measurement_object_ids"]) for row in first["families"]), 4)
        accepted = result["candidates"][1]
        self.assertLess(accepted["max_residual"], 1e-15)
        self.assertTrue(all(len(pair["reference_measurement_object_ids"]) == 2 for pair in accepted["matched_pairs"]))
        self.assertEqual(accepted["independent_validation"], "not_tested_no_held_out_observations")
        self.assertIsNone(result["uncertainty"])

    def test_square_symmetry_and_nearby_allowed_angles_are_not_ranked_away(self):
        square = signature([(1/8, 0), (0, 1/8)])
        result = comparison.compare_families(square, square, [0., 90., 180.], 1e-12)
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["accepted_antipodal_angle_classes"]), 2)
        self.assertEqual(result["accepted_angles_degrees"], [0., 90., 180.])
        near = comparison.compare_families(signature(A), signature(B), [ANGLE, ANGLE+.01], .001)
        self.assertEqual(near["status"], "ambiguous")
        self.assertEqual(len(near["accepted_angles_degrees"]), 2)
        distinct = comparison.compare_families(signature(A), signature(A), [0., 1e-11], .001)
        self.assertEqual(distinct["status"], "ambiguous")
        self.assertEqual(len(distinct["accepted_antipodal_angle_classes"]), 2)

    def test_mixed_window_and_missing_reflection_remain_partial(self):
        mixed = comparison.compare_families(signature(A), signature(A+B), [0., ANGLE], 1e-12)
        self.assertEqual(mixed["status"], "partial_match")
        self.assertEqual(mixed["accepted_angles_degrees"], [])
        self.assertTrue(all(len(row["unmatched_target_family_ids"]) == 2 for row in mixed["candidates"]))
        one = comparison.compare_families(signature(A[:1]), signature(A[:1]), [0.], .01)
        self.assertEqual(one["status"], "insufficient_geometry")
        self.assertFalse(one["candidates"][0]["accepted_descriptive_match"])
        collinear = comparison.compare_families(signature([(1/8,0),(1/4,0)]), signature([(1/8,0),(1/4,0)]), [0.], .01)
        self.assertEqual(collinear["status"], "insufficient_geometry")

    def test_nonmatching_noise_constant_and_detector_truncation(self):
        # Detector input is independently generated numerical data, with fixed
        # thresholds before comparing. No claim of a calibrated noise model.
        noise = np.random.default_rng(8172).normal(size=(64, 64))
        spectrum = np.fft.fftshift(np.fft.fft2(noise))
        rows, _, quality = image_peaks.detect(spectrum, {"max_peaks": 16}, worker.need)
        observations = [{"measurement_object_id": row["peak_id"], "frequency_cycles_per_pixel": row["frequency_cycles_per_pixel"],
                         "vector_xy": row["frequency_cycles_per_pixel"]} for row in rows]
        noisy = {"families": comparison.fold_families(observations), "quality": {"detection_truncated": quality["selection_limit_reached"]}}
        result = comparison.compare_families(signature(A), noisy, [0., ANGLE], 1e-8)
        self.assertEqual(result["accepted_angles_degrees"], [])
        self.assertEqual(result["status"], "incomplete_detection")
        exact_but_cut = comparison.compare_families(signature(A), signature(A, truncated=True), [0.], .001)
        self.assertTrue(exact_but_cut["candidates"][0]["all_selected_families_matched"])
        self.assertFalse(exact_but_cut["candidates"][0]["accepted_descriptive_match"])
        constant = np.zeros((64, 64), dtype=np.complex128)
        peaks, _, _ = image_peaks.detect(constant, {}, worker.need)
        self.assertEqual(peaks, [])
        empty = comparison.compare_families(signature([]), signature(A), [0.], .001)
        self.assertEqual(empty["status"], "insufficient_geometry")

    def test_signed_anisotropic_physical_conversion_precedes_rotation(self):
        record = {"status": "active", "coordinate_domain": "real_space", "xy_scale": {"x": .02, "y": -.03, "unit": "nm"}}
        # Constructed with physical rotation R=[[4/5,-3/5],[3/5,4/5]]
        # followed by signed pixel calibration. A has unequal physical radii.
        first = [(10/128, 0), (0, 20/128)]
        second = [(8/128, -9/128), (8/128, 16/128)]
        def convert(vectors, supplied_record):
            measures = [{"measurement_object_id": str(i), "frequency_cycles_per_pixel": list(v)} for i, v in enumerate(vectors)]
            converted, reason = comparison.vectors_in_domain(measures, supplied_record, "physical", worker)
            self.assertIsNone(reason)
            return {"families": comparison.fold_families(converted), "quality": {"detection_truncated": False}}
        physical = comparison.compare_families(convert(first, record), convert(second, record), [ANGLE], 1e-12)
        self.assertEqual(physical["status"], "compatible_signature")
        pixel = comparison.compare_families(signature(first), signature(second), [ANGLE], 1e-12)
        self.assertEqual(pixel["accepted_angles_degrees"], [])
        angstrom = copy.deepcopy(record)
        angstrom["xy_scale"].update(x=.2, y=-.3, unit="angstrom")
        converted = convert(first, angstrom)
        np.testing.assert_allclose([r["vector_xy"] for r in converted["families"]],
                                   [r["vector_xy"] for r in convert(first, record)["families"]], atol=1e-14)
        self.assertIsNotNone(comparison.vectors_in_domain([], None, "physical", worker)[1])

    def test_fold_never_uses_matching_tolerance_or_averages(self):
        observations = [{"measurement_object_id": "a", "vector_xy": [1.,0.], "frequency_cycles_per_pixel": [1.,0.]},
                        {"measurement_object_id": "b", "vector_xy": [-1.,0.], "frequency_cycles_per_pixel": [-1.,0.]},
                        {"measurement_object_id": "c", "vector_xy": [1.00000001,0.], "frequency_cycles_per_pixel": [1.00000001,0.]}]
        families = comparison.fold_families(observations)
        self.assertEqual(len(families), 2)
        self.assertEqual(families[0]["vector_xy"], [1., 0.])
        self.assertEqual(families[0]["measurement_object_ids"], ["a", "b"])
        self.assertEqual(families[0]["members"][1]["vector_xy"], [-1., 0.])

    def test_bounded_assignment_does_not_force_far_peaks_and_handles_tiny_units(self):
        result = comparison.compare_families(signature(A), signature([(1/3,0),(0,1/3)]), [0.], 1e-12)
        self.assertEqual(result["candidates"][0]["matched_pairs"], [])
        tiny = signature([(1e-250,0),(0,2e-250)])
        match = comparison.compare_families(tiny, tiny, [0.], 1e-260)
        self.assertEqual(match["status"], "compatible_signature")
        permissive = comparison.compare_families(signature(A), signature(A), [0.], 1.)
        self.assertEqual(permissive["status"], "ambiguous")
        self.assertEqual(len(permissive["candidates"][0]["admissible_pairs"]), 4)

    def test_explicit_settings_and_bounds(self):
        valid = dict(reference_index=0, angles_degrees=[0., ANGLE], coordinate_domain="pixel", tolerance=.01)
        self.assertEqual(comparison.settings(valid, worker)[3], "pixel")
        for delta in ({"angles_degrees": []}, {"angles_degrees": [0., 0.]}, {"angles_degrees": [float("nan")]},
                      {"angles_degrees": [181.]}, {"tolerance": 0}, {"coordinate_domain": "guessed"},
                      {"target_indices": [0]}, {"reference_index": True}):
            with self.assertRaises(ValueError):
                comparison.settings({**valid, **delta}, worker)

    def test_dense_all_candidate_report_is_refused_without_edge_truncation(self):
        # Maximum16 families,64 trials and7 targets with deliberately huge
        # tolerance can exceed the ordinary provider JSON read budget.
        dense = signature([(i/100, .2+i*i/10000) for i in range(1,17)])
        relation = comparison.compare_families(dense, dense, [float(i) for i in range(64)], 1.)
        self.assertTrue(all(len(candidate["admissible_pairs"]) == 256 for candidate in relation["candidates"]))
        with self.assertRaisesRegex(ValueError, "no candidates were truncated") as error:
            comparison.check_report_budget({"relations": [relation]*7}, worker)
        self.assertEqual(error.exception.code, "BUDGET_EXCEEDED")
        comparison.check_report_budget({"relations": [comparison.compare_families(signature(A), signature(B), [ANGLE], .001)]}, worker)


class SavedWorkspace:
    """Focused provider dependency double: committed records are separate.

    Numerical truths are above. This fixture exercises original request,
    selected measurement, FFT grid and report binding without optional engines.
    """
    def __init__(self, root):
        self.root = root
        self.records, self.measurements = {}, {}
        (root / "requests").mkdir()
        (root / "objects").mkdir()

    def save(self, ident, value):
        self.records[ident] = {"object_id": ident, **value}
        directory = self.root / "objects" / ident
        directory.mkdir(exist_ok=True)
        (directory / "object.json").write_bytes(worker.canonical(self.records[ident]))
        return self.records[ident]

    def journal(self, ident, params):
        parameters = {"request_id": ident, "workspace": str(self.root), **params}
        (self.root / "requests" / (ident+".json")).write_bytes(worker.canonical({"parameters": parameters,
            "parameters_sha256": __import__("hashlib").sha256(worker.canonical(parameters)).hexdigest()}))

    def object(self, ident):
        return self.records[ident], self.root / "objects" / ident

    def committed_measurement(self, ident):
        return self.measurements[ident], self.root / "objects" / ident

    def measurement_grid(self, ident):
        return {"source_grid_object_id": ident, "shape_yx": [128,128]}


class Dependencies(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = SavedWorkspace(Path(self.temp.name))
        self.rows = []
        for index, vectors in enumerate((A, B)):
            fft_id, peaks_id = "fft%d" % index, "peaks%d" % index
            fft = self.workspace.save(fft_id, {"kind": "fft", "shape_yx": [128,128], "xy_calibration": None,
                "files_sha256": {"data.npy": str(index)*64}})
            self.workspace.save(peaks_id, {"request_id": peaks_id, "kind": "fft_view", "peak_quality": {"selection_limit_reached": False}})
            self.workspace.journal(peaks_id, {"action": "peaks", "object_id": fft_id})
            measures = []
            for ordinal, vector in enumerate(vectors):
                for sign in (-1,1):
                    ident = "measurement-%d-%d-%d" % (index, ordinal, sign)
                    self.workspace.measurements[ident] = {"object_id": ident, "request_id": ident, "parent_object_id": fft_id,
                        "coordinate_space": "frequency_cycles_per_pixel", "xy_calibration": None, "dc_reference_point_index": 0,
                        "points": [[0,0], [sign*v for v in vector]]}
                    measures.append(copy.deepcopy(joint.measurement_row(self.workspace, ident, fft, worker)))
            self.rows.append({"region_index": index, "status": "observed", "fft_object_id": fft_id,
                              "peaks_object_id": peaks_id, "xy_calibration": None, "measurements": measures,
                              "rect": [index*128,0,(index+1)*128,128]})
        self.workspace.save("atlas", {"kind": "spatial_atlas", "regions": self.rows})
        self.request = dict(action="local_signature_compare", object_id="atlas", reference_index=0,
                            angles_degrees=[0., ANGLE], coordinate_domain="pixel", tolerance=1e-12)

    def tearDown(self):
        self.temp.cleanup()

    def test_saved_measurements_reconstructed_and_physical_missing_scale_explicit(self):
        result = comparison.derive(self.workspace, self.request, worker)
        self.assertEqual(result["relations"][0]["status"], "compatible_signature")
        self.assertEqual(result["source_entries"][0]["index_kind"], "region_index")
        self.assertIn("image-coordinate", result["angle_scope"])
        self.assertFalse(result["fft_recomputed"])
        physical = comparison.derive(self.workspace, {**self.request, "coordinate_domain": "physical"}, worker)
        self.assertEqual(physical["relations"][0]["status"], "incompatible")
        self.assertEqual(physical["relations"][0]["candidates"], [])
        self.assertIn("cycles/pixel", comparison.report_csv(result).decode())

    def test_corrupt_measurement_geometry_and_wrong_peak_parent_refused(self):
        ident = self.rows[0]["measurements"][0]["measurement_object_id"]
        original = copy.deepcopy(self.workspace.measurements[ident])
        self.workspace.measurements[ident]["points"][1][0] += .01
        with self.assertRaisesRegex(ValueError, "committed measurements"):
            comparison.derive(self.workspace, self.request, worker)
        self.workspace.measurements[ident] = original
        self.workspace.journal("peaks0", {"action": "peaks", "object_id": "fft1"})
        with self.assertRaisesRegex(ValueError, "another FFT"):
            comparison.derive(self.workspace, self.request, worker)

    def test_r2_source_indices_mapping_basis_and_unverified_rows_preserved(self):
        rows = [{**row, "frame_index": row["region_index"], "status": "VERIFIED", "target_rect": row["rect"]} for row in self.rows]
        rows.append({"frame_index": 2, "status": "AMBIGUOUS", "measurements": []})
        mappings = [{"frame_index": 0, "status": "VERIFIED", "method": "reference_identity"},
                    {"frame_index": 1, "status": "VERIFIED", "method": "user_translation", "source_text": "Synthetic mapping statement"},
                    {"frame_index": 2, "status": "AMBIGUOUS", "candidates": [[1,0],[-1,0]]}]
        self.workspace.save("correspondence", {"kind": "region_correspondence", "rows": mappings})
        self.workspace.save("joint", {"kind": "joint_observations", "frame_observations": rows,
            "correspondence_object_id": "correspondence", "sequence_object_id": "sequence",
            "sequence_axis": {"meaning": "reconstruction_depth", "source_text": "Synthetic order only"}})
        result = comparison.derive(self.workspace, {**self.request, "object_id": "joint"}, worker)
        self.assertEqual(result["source_entries"][1]["mapping_evidence"], mappings[1])
        self.assertEqual(result["source_entries"][1]["index_kind"], "frame_index")
        self.assertEqual(result["relations"][1]["status"], "not_comparable")
        self.assertEqual(result["source_entries"][2]["measurements"], [])
        self.assertEqual(result["sequence_axis"]["meaning"], "reconstruction_depth")

    def test_report_validation_rederives_and_rejects_forged_result(self):
        result = comparison.derive(self.workspace, self.request, worker)
        ident, request_id = "comparison", "comparison-request"
        directory = self.workspace.root / "objects" / ident
        directory.mkdir()
        (directory / "relations.json").write_bytes(worker.canonical(result))
        (directory / "relations.csv").write_bytes(comparison.report_csv(result))
        metadata = {**result, "object_id": ident, "request_id": request_id,
                    "relations_path": str(directory / "relations.json"), "table_path": str(directory / "relations.csv")}
        self.workspace.journal(request_id, self.request)
        comparison.validate_references(self.workspace, metadata, worker)
        bad = copy.deepcopy(metadata)
        bad["relations"][0]["accepted_angles_degrees"] = [99.]
        with self.assertRaisesRegex(ValueError, "declared comparison"):
            comparison.validate_references(self.workspace, bad, worker)
        (directory / "relations.csv").write_bytes(b"forged CSV")
        with self.assertRaisesRegex(ValueError, "authoritative measurements"):
            comparison.validate_references(self.workspace, metadata, worker)


class WorkerIntegration(unittest.TestCase):
    def test_real_saved_atlas_comparison_recovery_revision_and_corrupt_child(self):
        with tempfile.TemporaryDirectory(prefix="domain-compare-") as temporary:
            directory = Path(temporary)
            workspace = directory / "workspace"
            y, x = np.indices((128, 128))
            # Independent real-space fixture, exact known integer Fourier bins.
            patches = [np.rint(20000+4000*np.cos(2*np.pi*(q[0][0]*x+q[0][1]*y))+
                               2500*np.cos(2*np.pi*(q[1][0]*x+q[1][1]*y))).astype(np.uint16) for q in (A, B)]
            filename = directory / "rotated-domains.tiff"
            tifffile.imwrite(filename, np.concatenate(patches, axis=1), photometric="minisblack")
            original_hash = worker.sha_file(filename)
            counter = 0

            def call(action, ok=True, **parameters):
                nonlocal counter
                counter += 1
                request = {"action": action, "workspace": str(workspace), **parameters}
                if action not in ("get", "result"):
                    request.setdefault("request_id", "compare-integration-%d" % counter)
                response = worker.execute(request)
                self.assertEqual(response["ok"], ok, response)
                return response["result"] if ok else response

            opened = call("open", source_path=str(filename))
            frame = call("frame", object_id=opened["object_id"], frame_index=0)
            options = {"object_id": frame["object_id"], "rects": [[0,0,128,128],[128,0,256,128]],
                       "window": "none", "subtract_mean": True, "max_peaks": 8,
                       "peak_options": {"refinement": "none", "threshold_rel": .1}}
            atlas = call("spatial_atlas", **options)
            inputs = {"object_id": atlas["object_id"], "reference_index": 0,
                      "angles_degrees": [0., ANGLE, ANGLE-180.], "coordinate_domain": "pixel", "tolerance": 1e-12}
            result = call("local_signature_compare", request_id="persisted-comparison", **inputs)
            self.assertEqual(result["relations"][0]["status"], "compatible_signature")
            self.assertEqual(result["relations"][0]["accepted_angles_degrees"], [ANGLE, ANGLE-180.])
            self.assertEqual(result, call("get", object_id=result["object_id"]))
            self.assertEqual(result, call("result", query_request_id="persisted-comparison"))
            count = len(list((workspace / "objects").iterdir()))
            self.assertEqual(result, call("local_signature_compare", request_id="persisted-comparison", **inputs))
            self.assertEqual(len(list((workspace / "objects").iterdir())), count)
            self.assertTrue(Path(result["table_path"]).read_bytes().startswith(b"source_kind,"))
            self.assertEqual(json.loads(Path(result["relations_path"]).read_text())["source_entries"], result["source_entries"])
            fft_paths = [workspace / "objects" / row["fft_object_id"] / "data.npy" for row in atlas["regions"]]
            fft_hashes = [worker.sha_file(path) for path in fft_paths]
            target = atlas["regions"][1]
            ident = target["measurements"][0]["measurement_object_id"]
            old_measure = call("get", object_id=ident)
            points = copy.deepcopy(old_measure["points"])
            points[1][0] += .01
            changed = call("remeasure", object_id=target["view_object_id"], measurement_object_id=ident,
                           points=points, source_text="Synthetic deliberate GUI-equivalent anchor correction")
            overrides = [changed["object_id"], *[row["measurement_object_id"] for row in target["measurements"][1:]]]
            revised = call("spatial_atlas", **options, previous_atlas_id=atlas["object_id"],
                           measurement_overrides=[{"region_index": 1, "measurement_object_ids": overrides}])
            updated = call("local_signature_compare", **{**inputs, "object_id": revised["object_id"]})
            self.assertEqual(updated["relations"][0]["accepted_angles_degrees"], [])
            self.assertEqual([worker.sha_file(path) for path in fft_paths], fft_hashes)
            self.assertEqual(worker.sha_file(filename), original_hash)
            self.assertEqual(len([path for path in (workspace / "objects").glob("*/object.json")
                                  if json.loads(path.read_text())["kind"] == "fft"]), 2)
            # A damaged measurement receipt must invalidate the derived object,
            # even though its own comparison JSON and PNG remain untouched.
            manifest = Path(old_measure["manifest_path"])
            tampered = json.loads(manifest.read_text())
            tampered["points"][1][0] += .01
            manifest.write_bytes(worker.canonical(tampered))
            rejected = call("get", ok=False, object_id=result["object_id"])
            self.assertEqual(rejected["error"]["code"], "CORRUPT_OBJECT")


if __name__ == "__main__":
    unittest.main()
