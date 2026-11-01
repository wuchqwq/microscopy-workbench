"""Route A semantic boundaries, not a second science oracle.

Synthetic metadata cases specify independent expectations for claim scope. The
worker cases use actual public analytic TIFF inputs and preserve bytes/recovery.
A legacy-shaped fixture created without the attachment hook is labelled as such;
it is not a substitute for the separate frozen-producer compatibility run.
"""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import result_semantics as semantics
from tools import image_workspace as worker


def image(kind, **fields):
    return {"kind": kind, "backend": "external-image-workspace", **fields}


def structure(kind, **fields):
    return {"kind": kind, "backend": "external-structure-workspace", **fields}


def assessment(result, layer, aspect):
    rows = result[layer]["checks" if layer == "numerical" else "assessments"]
    return next(row for row in rows if row["aspect"] == aspect)


class ResultSemanticsTest(unittest.TestCase):
    def assert_unknown_measurement(self, result):
        for aspect in ("noise_significance", "localization_uncertainty", "resolvability", "parameter_sensitivity"):
            self.assertEqual(assessment(result, "measurement_reliability", aspect)["status"], "not_assessed")

    def test_numeric_peaks_do_not_qualify_noise_localization_or_resolution(self):
        record = image("fft_view", peak_detection={"version": 3}, peak_table=[{"refined": True, "status": "hypothesized"}],
                       peak_quality={"numerical_contrast": {"status": "resolved_amplitude_variation"}, "selection_limit_reached": False})
        result = semantics.build(record)
        self.assertEqual(result["numerical"]["execution"], "completed")
        self.assertEqual(assessment(result, "numerical", "global_numerical_contrast")["status"], "satisfied")
        self.assert_unknown_measurement(result)
        self.assertEqual(assessment(result, "interpretation", "peak_candidates")["status"], "not_assessed")
        record["peak_quality"]["numerical_contrast"]["status"] = "insufficient_evidence"
        record["peak_table"] = []
        result = semantics.build(record)
        self.assertEqual(result["numerical"]["execution"], "completed")
        self.assertEqual(assessment(result, "numerical", "global_numerical_contrast")["status"], "insufficient_evidence")

    def test_cap_is_specific_issue_not_physical_failure(self):
        result = semantics.build(image("fft_view", peak_detection={}, peak_quality={"selection_limit_reached": True}))
        self.assertEqual(assessment(result, "numerical", "selection_capacity")["status"], "issues_detected")
        self.assert_unknown_measurement(result)

    def test_pixel_measurements_survive_absent_calibration(self):
        result = semantics.build(image("measure", points=[[0, 0], [.125, 0]], coordinate_space="frequency_cycles_per_pixel",
                                       pixel_period=8., xy_calibration=None, measurement_domain="pixel_geometry"))
        self.assertEqual(assessment(result, "numerical", "coordinate_geometry")["status"], "satisfied")
        self.assertEqual(assessment(result, "numerical", "physical_coordinate_availability")["status"], "insufficient_evidence")
        self.assert_unknown_measurement(result)

    def test_physical_units_do_not_qualify_scale_uncertainty(self):
        result = semantics.build(image("measure", physical_frequency_magnitude=4., measurement_uncertainty=None))
        self.assertEqual(assessment(result, "numerical", "physical_coordinate_availability")["status"], "satisfied")
        self.assertEqual(assessment(result, "measurement_reliability", "calibration_uncertainty")["status"], "not_assessed")

    def test_single_family_feature_failure_is_scoped_to_multidirection_descriptor(self):
        record = image("feature_field", samples=[{"status": "insufficient_evidence", "features": {"families": [{"period": 8., "period_valid": True}]}}])
        before = copy.deepcopy(record)
        result = semantics.build(record)
        check = assessment(result, "numerical", "multidirection_descriptor_admission")
        self.assertEqual(check["status"], "insufficient_evidence")
        self.assertIn("not validity of every constituent period", check["scope"])
        self.assertEqual(record, before)
        self.assert_unknown_measurement(result)
        record["samples"][0]["status"] = "valid"
        self.assertEqual(assessment(semantics.build(record), "numerical", check["aspect"])["status"], "satisfied")
        self.assertEqual(assessment(semantics.build(record), "interpretation", "structure_descriptor")["status"], "not_assessed")

    def test_local_compare_version_and_scope_are_not_generic_string_conversion(self):
        legacy = image("local_signature_compare", relations=[{"status": "incompatible", "reason": "missing calibration"}])
        self.assertEqual(assessment(semantics.build(legacy), "interpretation", "finite_signature_comparison")["status"], "not_assessed")
        current = image("local_signature_compare", evidence_semantics_version=2, relations=[{"status": "insufficient_evidence"}])
        self.assertEqual(assessment(semantics.build(current), "interpretation", "finite_signature_comparison")["status"], "insufficient_evidence")
        current["relations"] = [{"status": "incompatible"}]
        self.assertEqual(assessment(semantics.build(current), "interpretation", "finite_signature_comparison")["status"], "issues_detected")

    def test_gpa_reuses_existing_boundary_not_verified_false_as_disproof(self):
        record = image("gpa", material_strain_verified=False, report={"quality": {}})
        self.assertEqual(assessment(semantics.build(record), "interpretation", "material_strain")["status"], "not_assessed")
        record["evidence_assessment"] = {"material_strain_status": "insufficient_evidence", "spatial_transfer": {"scope": "analytic"}}
        result = semantics.build(record)
        self.assertEqual(assessment(result, "interpretation", "material_strain")["status"], "insufficient_evidence")
        self.assertEqual(assessment(result, "measurement_reliability", "analytic_transfer")["status"], "satisfied")
        self.assert_unknown_measurement(result)

    def test_topology_actual_support_qualification_is_not_independence(self):
        record = image("topology", report={"loops": [{"reflections": [{"valid": True}, {"valid": False}]}],
                                           "band_dependency": {"qualified_cross_band_support": False},
                                           "status": "constrained_candidate_without_redundancy"})
        result = semantics.build(record)
        self.assertEqual(assessment(result, "numerical", "conditional_circuit_checks")["status"], "issues_detected")
        self.assertEqual(assessment(result, "measurement_reliability", "fourier_support_dependence")["status"], "issues_detected")
        record["report"]["band_dependency"]["qualified_cross_band_support"] = True
        result = semantics.build(record)
        self.assertEqual(assessment(result, "measurement_reliability", "fourier_support_dependence")["status"], "satisfied")
        self.assertIn("does not establish statistical independence", assessment(result, "measurement_reliability", "fourier_support_dependence")["basis"])
        self.assertEqual(assessment(result, "interpretation", "projected_phase_closure")["status"], "not_assessed")

    def test_registration_fit_and_held_out_geometry_are_separate(self):
        record = structure("register", fit_status="within_declared_tolerance", held_out_geometry_status="not_tested_no_held_out")
        result = semantics.build(record)
        self.assertEqual(assessment(result, "numerical", "registration_fit")["status"], "satisfied")
        self.assertEqual(assessment(result, "measurement_reliability", "held_out_geometry")["status"], "not_assessed")
        record["held_out_geometry_status"] = "held_out_geometry_consistent"
        self.assertEqual(assessment(semantics.build(record), "measurement_reliability", "held_out_geometry")["status"], "satisfied")
        self.assert_unknown_measurement(semantics.build(record))

    def test_structural_finite_compatibility_conflict_and_ambiguity(self):
        for kind in ("crystal_evidence", "twin_compare"):
            for old, expected in (("compatible", "satisfied"), ("incompatible", "issues_detected"), ("insufficient_evidence", "insufficient_evidence")):
                record = structure(kind, status=old, phase_identified=False)
                result = semantics.build(record)
                row = assessment(result, "interpretation", "finite_projected_candidates")
                self.assertEqual(row["status"], expected)
                self.assertIn("not unique phase", row["basis"])
                self.assert_unknown_measurement(result)
        result = semantics.build(structure("compare", comparison_status="within_declared_geometric_tolerance", ambiguity=[{"candidate": "second"}]))
        self.assertEqual(assessment(result, "interpretation", "finite_reciprocal_comparison")["status"], "satisfied")
        self.assertIn("ambiguity", assessment(result, "interpretation", "finite_reciprocal_comparison")["source_fields"])

    def test_batch_completion_is_not_candidate_acceptance(self):
        result = semantics.build(structure("compare_batch", batch_status="partial_or_failed", candidates=[]))
        self.assertEqual(result["numerical"]["execution"], "completed")
        self.assertEqual(assessment(result, "numerical", "child_comparison_completion")["status"], "issues_detected")
        self.assertEqual(assessment(result, "interpretation", "finite_candidate_batch")["status"], "not_assessed")

    def test_supported_scope_bounded_paths_and_no_recursive_copy(self):
        for kind in semantics.IMAGE_KINDS:
            record = image(kind, samples=[], report={}, regions=[], measurements=[], frame_observations=[], relations=[], domains=[], edges=[])
            result = semantics.build(record)
            self.assertLess(len(json.dumps(result).encode()), semantics.MAX_BYTES)
            for layer, key in (("numerical", "checks"), ("measurement_reliability", "assessments"), ("interpretation", "assessments")):
                self.assertLessEqual(len(result[layer][key]), 12)
                for row in result[layer][key]:
                    self.assertEqual(set(row), {"aspect", "scope", "status", "basis", "source_fields"})
                    if row["status"] == "satisfied":
                        self.assertTrue(row["source_fields"])
                    for path in row["source_fields"]:
                        self.assertIsNot(semantics._get(record, path), semantics._MISSING)
        for record in (image("frame"), image("fft_view"), image("gpa_view"), image("compare"), structure("structure"), {"kind": "fft"}):
            self.assertIsNone(semantics.build(record))

    def test_old_missing_and_future_fields_are_never_backfilled(self):
        for record in (image("measure"), image("measure", result_semantics={"version": 2, "future_field": [1, 2]})):
            before = copy.deepcopy(record)
            semantics.validate(record)
            self.assertEqual(record, before)
        record = image("measure", physical_distance=None)
        semantics.attach(record)
        semantics.validate(record)
        record["physical_distance"] = 10.
        with self.assertRaisesRegex(ValueError, "owning scientific fields"):
            semantics.validate(record)

    def test_new_display_publication_cannot_inherit_parent_assessment(self):
        parent = image("fft", dtype="complex128", algorithm="FFT")
        semantics.attach(parent)
        before = copy.deepcopy(parent)
        for kind in ("view", "fft_view", "annotate", "calibration", "gpa_view", "gpa_read"):
            fresh = image(kind, parent_object_id="a"*32, result_semantics=copy.deepcopy(parent["result_semantics"]))
            semantics.attach(fresh)
            self.assertNotIn("result_semantics", fresh)
        self.assertEqual(parent, before)


class ResultSemanticsWorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="route-a-semantics-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.number = 0

    def call(self, action, **parameters):
        self.number += 1
        request = {"workspace": str(self.workspace), "action": action, **parameters}
        if action not in ("get", "result"):
            request.setdefault("request_id", "semantics-" + str(self.number))
        reply = worker.execute(request)
        self.assertTrue(reply["ok"], reply)
        return reply["result"]

    def frame(self, array):
        source = self.root / ("source-%d.tif" % self.number)
        tifffile.imwrite(source, array.astype(np.float32))
        raw = source.read_bytes()
        opened = self.call("open", source_path=str(source))
        frame = self.call("frame", object_id=opened["object_id"], frame_index=0)
        self.assertNotIn("result_semantics", opened)
        self.assertNotIn("result_semantics", frame)
        return frame, source, raw

    def test_actual_tiff_fft_peak_measure_save_read_recovery(self):
        y, x = np.indices((64, 64))
        frame, source, raw = self.frame(100. + 4 * np.cos(2*np.pi*x/8) + 2*np.cos(2*np.pi*y/16))
        fft = self.call("fft", object_id=frame["object_id"], window="none", subtract_mean=False)
        before = Path(fft["array_path"]).read_bytes()
        peaks = self.call("peaks", object_id=fft["object_id"], max_peaks=8, refinement="none")
        self.assertGreaterEqual(len(peaks["peak_table"]), 4)
        point = peaks["peak_table"][0]["frequency_cycles_per_pixel"]
        measure = self.call("measure", object_id=fft["object_id"], points=[[0, 0], point])
        self.assertGreater(measure["pixel_period"], 0)
        self.assertEqual(assessment(measure["result_semantics"], "numerical", "physical_coordinate_availability")["status"], "insufficient_evidence")
        for record in (fft, peaks, measure):
            self.assertEqual(record["result_semantics"], self.call("get", object_id=record["object_id"])["result_semantics"])
            restored = self.call("result", query_request_id=record["request_id"])
            self.assertEqual(restored["result_semantics"], record["result_semantics"])
            self.assertIn("result_semantics.py", record["software_provenance"]["helper_modules_sha256"])
        self.assertEqual(source.read_bytes(), raw)
        self.assertEqual(Path(fft["array_path"]).read_bytes(), before)
        self.assertEqual(hashlib.sha256(before).hexdigest(), fft["files_sha256"]["data.npy"])
        view = self.call("view", object_id=peaks["object_id"])
        self.assertNotIn("result_semantics", view, "display must not claim fresh peak assessment")
        annotated = self.call("annotate", object_id=view["object_id"], annotations=[])
        restored_view = self.call("view", object_id=annotated["object_id"])
        calibrated = self.call("calibrate", object_id=frame["object_id"], scope="image",
                               xy_scale={"x": .02, "y": -.03, "unit": "nm"},
                               source_text="Analytic test metric, not independently verified calibration")
        scaled = self.call("view", object_id=calibrated["object_id"], scale_bar=True)
        for display in (annotated, restored_view, calibrated, scaled):
            self.assertNotIn("result_semantics", display)
            self.assertNotIn("result_semantics", self.call("get", object_id=display["object_id"]))

    def test_actual_original_impulse_rejection_remains_completed_numerical_result(self):
        array = np.full((63, 63), 100., dtype=np.float32)
        array[17, 29] = 101.
        frame, source, raw = self.frame(array)
        fft = self.call("fft", object_id=frame["object_id"], window="none", subtract_mean=False)
        peaks = self.call("peaks", object_id=fft["object_id"], max_peaks=16, min_separation_bins=16)
        self.assertEqual(peaks["peak_table"], [])
        result = peaks["result_semantics"]
        self.assertEqual(result["numerical"]["execution"], "completed")
        self.assertEqual(assessment(result, "numerical", "global_numerical_contrast")["status"], "insufficient_evidence")
        self.assertEqual(source.read_bytes(), raw)

    def test_actual_one_direction_atlas_keeps_period_while_feature_is_insufficient(self):
        y, x = np.indices((64, 64))
        frame, _, _ = self.frame(20 + 5*np.cos(2*np.pi*x/8))
        atlas = self.call("spatial_atlas", object_id=frame["object_id"], rects=[[0, 0, 64, 64]],
                          window="none", subtract_mean=True, max_peaks=8,
                          peak_options={"refinement": "none", "threshold_rel": .1}, max_size=256)
        field = self.call("feature_field", object_id=atlas["object_id"], coordinate_domain="pixel",
                          display_feature="shortest_period", max_size=256)
        self.assertEqual(field["samples"][0]["status"], "insufficient_evidence")
        families = field["samples"][0]["features"]["families"]
        self.assertEqual(len(families), 1)
        self.assertAlmostEqual(families[0]["period"], 8.)
        self.assertTrue(families[0]["period_valid"])
        self.assertEqual(assessment(field["result_semantics"], "numerical", "multidirection_descriptor_admission")["status"], "insufficient_evidence")
        self.assertEqual(self.call("get", object_id=field["object_id"])["result_semantics"], field["result_semantics"])

    def test_legacy_shaped_object_without_field_reads_and_recovers_unchanged(self):
        y, x = np.indices((32, 32))
        frame, _, _ = self.frame(np.cos(2*np.pi*x/8))
        # A deliberate missing-field fixture, not a claim to execute a frozen old producer.
        with patch.object(semantics, "attach", lambda value: value):
            old = self.call("fft", object_id=frame["object_id"])
        original = Path(old["manifest_path"]).read_bytes()
        self.assertNotIn("result_semantics", self.call("get", object_id=old["object_id"]))
        self.assertNotIn("result_semantics", self.call("result", query_request_id=old["request_id"]))
        self.assertEqual(original, Path(old["manifest_path"]).read_bytes())
        new = self.call("peaks", object_id=old["object_id"])
        self.assertIn("result_semantics", new)
        self.assertEqual(original, Path(old["manifest_path"]).read_bytes())

    def test_own_field_disagreement_rejected_and_future_version_preserved(self):
        y, x = np.indices((32, 32))
        frame, _, _ = self.frame(np.cos(2*np.pi*x/8))
        fft = self.call("fft", object_id=frame["object_id"])
        manifest = Path(fft["manifest_path"])
        journal_path = self.workspace / "requests" / (fft["request_id"] + ".json")
        original = json.loads(manifest.read_bytes())

        def synthetic_record(value):
            # Deliberately coherent temporary fixture: check semantics beyond own
            # hash consistency, not authentication against rewriting a whole store.
            record = copy.deepcopy(original)
            record["result_semantics"] = value
            raw = worker.canonical(record) + b"\n"
            manifest.write_bytes(raw)
            journal = json.loads(journal_path.read_bytes())
            journal["object_manifest_sha256"] = hashlib.sha256(raw).hexdigest()
            journal["response"]["result_semantics"] = value
            journal_path.write_bytes(worker.canonical(journal) + b"\n")

        false_assessment = copy.deepcopy(fft["result_semantics"])
        false_assessment["measurement_reliability"]["assessments"][0]["status"] = "satisfied"
        synthetic_record(false_assessment)
        reply = worker.execute({"workspace": str(self.workspace), "action": "get", "object_id": fft["object_id"]})
        self.assertFalse(reply["ok"])
        self.assertEqual(reply["error"]["code"], "CORRUPT_OBJECT")
        future = {"version": 2, "uninterpreted": {"new_contract": True}}
        synthetic_record(future)
        before = manifest.read_bytes()
        self.assertEqual(self.call("get", object_id=fft["object_id"])["result_semantics"], future)
        self.assertEqual(self.call("result", query_request_id=fft["request_id"])["result_semantics"], future)
        self.assertEqual(manifest.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
