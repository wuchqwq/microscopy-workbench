"""Small conditional-S2 regressions, not a new accuracy/noise matrix.

Truth images use independent math.erf pixel integrals, not the fitted model's
basis generator. Three fixed seeds and at most sixteen fit_linear_poisson
calls cover admitted/unknown paths. Read/recovery/export/review checks forbid
both fit_linear_poisson and minimize, including across fresh Workspace readers.
"""
import copy
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker, image_column_model as model
from preview_test_support import acknowledge_received_previews


def gaussian_integrals(shape, center, sigma):
    """Independent whole-plane unit-integral Gaussian, integrated per pixel."""
    def axis(n, c):
        return np.asarray([0.5 * (math.erf((i + 0.5 - c) / (sigma * math.sqrt(2))) -
                                 math.erf((i - 0.5 - c) / (sigma * math.sqrt(2))))
                           for i in range(n)])
    return np.outer(axis(shape[0], center[1]), axis(shape[1], center[0]))


def expected_image(target_integral=40000.0):
    image = np.full((64, 64), 20.0)
    centers, integrals = [], []
    for site, central in [((20, 20), target_integral), ((44, 44), 60000.0)]:
        x, y = site
        # The +6 neighbour contributes >0.005 in the 9x9 fit even though its
        # centre is outside the old erroneous 3-sigma centre prefilter.
        columns = [(x, y), (x - 4, y), (x + 4, y), (x, y - 4), (x, y + 4), (x + 6, y)]
        amplitudes = [central, 12000.0, 12000.0, 12000.0, 12000.0, 5000.0]
        for center, amplitude in zip(columns, amplitudes):
            centers.append(list(center)); integrals.append(amplitude)
            image += amplitude * gaussian_integrals(image.shape, center, 1.0)
    return image, centers, integrals


class ConditionalColumnFit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.truth, cls.columns, cls.integrals = expected_image()
        cls.positive = np.random.default_rng(202611051).poisson(cls.truth).astype(np.uint32)
        missing, _, _ = expected_image(target_integral=0.0)
        cls.zero_target = np.random.default_rng(202611052).poisson(missing).astype(np.uint32)
        cls.low_counts = np.random.default_rng(202611053).poisson(cls.truth * 0.0001).astype(np.uint32)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="conditional-column-fit-")
        self.root = Path(self.temp.name).resolve()
        self.workspace = self.root / "images"
        self.serial = 0
        self.requests = {}
        self.rect = [18, 18, 23, 23]
        self.refs = [[42, 42, 47, 47]]
        self.frame = self.make_frame(self.positive)

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, ok=True, **args):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), **args)
        if action not in ("get", "result"):
            request["request_id"] = "column-%d" % self.serial
            self.requests[request["request_id"]] = copy.deepcopy(request)
        reply = worker.execute(request)
        self.assertEqual(reply["ok"], ok, reply)
        if ok:
            acknowledge_received_previews(worker, self.workspace, reply["result"])
        return reply["result"] if ok else reply

    def make_frame(self, values):
        source = self.root / ("public-count-fixture-%d.tiff" % self.serial)
        tifffile.imwrite(source, values, photometric="minisblack")
        opened = self.call("open", source_path=str(source))
        return self.call("frame", object_id=opened["object_id"], frame_index=0)

    def parameters(self, frame=None):
        return dict(object_id=(frame or self.frame)["object_id"], rect=list(self.rect),
                    reference_comparison=dict(reference_rects=copy.deepcopy(self.refs),
                        source_text="Synthetic same-class references, caller supplied and unverified"),
                    geometry=dict(site_centers_xy=[[20, 20], [44, 44]],
                        supplied_columns_xy=copy.deepcopy(self.columns), sigma_pixels=1.0,
                        source_text="Independent analytic fixture: supplied fixed centres and width"),
                    count_interpretation=dict(model="independent_poisson_counts",
                        source_text="Public seeded independent Poisson counts; no gain or count conversion"))

    def fit(self, frame=None, **changes):
        args = self.parameters(frame); args.update(changes)
        return self.call("column_fit", **args)

    def assert_unknown(self, result, status):
        self.assertEqual(result["whole_comparison"]["status"], "UNKNOWN_REQUIRED_SITE")
        self.assertEqual([site["status"] for site in result["sites"]], [status, status])
        self.assertEqual(result["optimizer_calls"], 0)
        self.assertEqual(result["raw_baseline_status"], "AVAILABLE")
        self.assertIsNotNone(result["raw_baseline"]["statistics"]["mean"])
        for site in result["sites"]:
            self.assertEqual(site["accepted"], dict(fitted_total_roi_mean=None, central_integral=None))

    def assert_no_physical_claim(self, result):
        self.assertIsNone(result["confidence_interval"])
        self.assertEqual(result["physical_classification"], "UNKNOWN")
        self.assertFalse(result["physical_model_verified"])
        self.assertFalse(result["assumptions"]["verified"])
        self.assertIn("extrapolated", result["observables"]["central_integral"])

    def test_independent_count_truth_raw_baseline_and_distinct_readouts(self):
        result = self.fit()
        self.assertEqual(result["whole_comparison"]["status"], "CONDITIONAL_POINT_ESTIMATE")
        self.assertEqual(result["optimizer_calls"], 2)
        self.assert_no_physical_claim(result)
        stats = self.call("statistics", object_id=self.frame["object_id"], rect=self.rect,
                          reference_comparison=self.parameters()["reference_comparison"])
        for key in ("statistics", "reference_comparison", "source_rect_xyxy", "scientific_grid_identity"):
            self.assertEqual(result["raw_baseline"][key], stats[key])
        for index, true_integral in enumerate((40000.0, 60000.0)):
            site = result["sites"][index]
            self.assertEqual(site["readout_rect_xyxy"], [self.rect, *self.refs][index])
            x0, y0, x1, y1 = site["fit_rect_xyxy"]
            self.assertEqual([x1 - x0, y1 - y0], [9, 9])
            self.assertIn([26, 20] if index == 0 else [50, 44], site["selected_columns_xy"])
            self.assertLess(abs(site["accepted"]["central_integral"] - true_integral), 2500.0,
                            "High-count independent analytic truth; not a calibrated confidence interval")
            # Reconstruct saved predicted pixels independently from coefficients.
            coefficients = site["diagnostics"]["coefficients"]
            predicted = np.zeros((9, 9))
            for c, a in zip(site["selected_columns_xy"], coefficients[:-4]):
                predicted += a * gaussian_integrals((64, 64), c, 1.0)[y0:y1, x0:x1]
            v, u = np.mgrid[0:9, 0:9] / 8.0
            for a, basis in zip(coefficients[-4:], ((1-u)*(1-v), u*(1-v), (1-u)*v, u*v)):
                predicted += a * basis
            saved_mu = np.asarray(site["diagnostics"]["mu"]).reshape(9, 9)
            np.testing.assert_allclose(saved_mu, np.maximum(predicted, 1e-12), rtol=1e-10, atol=1e-8)
            self.assertAlmostEqual(site["accepted"]["fitted_total_roi_mean"],
                                   float(np.mean(saved_mu[2:7, 2:7])), places=10)

    def test_missing_or_unsupported_scientific_prerequisites_preserve_raw_without_fit(self):
        cases = []
        absent_geometry = self.parameters(); absent_geometry.pop("geometry")
        cases.append((absent_geometry, "UNKNOWN_NO_GEOMETRY"))
        absent_noise = self.parameters(); absent_noise.pop("count_interpretation")
        cases.append((absent_noise, "UNKNOWN_UNSUPPORTED_NOISE"))
        unsupported = self.parameters()
        unsupported["count_interpretation"]["model"] = "normalized_image_brightness"
        cases.append((unsupported, "UNKNOWN_UNSUPPORTED_NOISE"))
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Unexpected fit")) as fitting, \
             patch.object(model, "minimize", side_effect=AssertionError("Unexpected optimizer")) as optimizing:
            for args, status in cases:
                with self.subTest(status=status):
                    self.assert_unknown(self.call("column_fit", **args), status)
            for values in (np.full((64, 64), -1.0), np.full((64, 64), 0.5)):
                frame = self.make_frame(values)
                self.assert_unknown(self.fit(frame), "UNKNOWN_UNSUPPORTED_NOISE")
            fitting.assert_not_called(); optimizing.assert_not_called()

    def test_readout_size_and_surrounding_fit_boundary_are_explicit(self):
        args = self.parameters()
        args["rect"] = [18, 18, 22, 23]
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Unexpected fit")):
            self.call("column_fit", ok=False, **args)
            args = self.parameters()
            args["rect"] = [0, 0, 5, 5]
            args["reference_comparison"]["reference_rects"] = [[59, 59, 64, 64]]
            args["geometry"].update(site_centers_xy=[[2, 2], [61, 61]],
                                   supplied_columns_xy=[[2, 2], [61, 61]])
            result = self.call("column_fit", **args)
            self.assert_unknown(result, "UNKNOWN_FIT_SUPPORT_OUTSIDE_SOURCE")
            self.assertEqual(result["sites"][0]["fit_rect_xyxy"], [-2, -2, 7, 7])
            self.assertEqual(result["sites"][1]["fit_rect_xyxy"], [57, 57, 66, 66])

    def test_finite_pixels_with_unsafe_total_or_model_range_do_not_reach_optimizer(self):
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Unsafe fit")) as fitting:
            # Finite integer-valued pixels can still overflow a patch sum. Keep
            # enormous pixels outside the 5x5 readouts so raw S0 is representable.
            values = np.ones((64, 64), dtype=np.float64)
            values[16:18, 16:18] = 1e308
            values[40:42, 40:42] = 1e308
            self.assert_unknown(self.fit(self.make_frame(values)), "UNKNOWN_COUNT_RANGE")
            args = self.parameters()
            args["geometry"]["sigma_pixels"] = 1e-310
            self.assert_unknown(self.call("column_fit", **args), "UNKNOWN_MODEL_NUMERIC_RANGE")
            fitting.assert_not_called()

    def test_duplicate_and_too_many_selected_coefficients_are_rejected_before_svd(self):
        with patch.object(np.linalg, "svd", side_effect=AssertionError("SVD before admission")) as svd, \
             patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Unexpected fit")) as fitting:
            args = self.parameters()
            args["geometry"]["supplied_columns_xy"].append([20, 20])
            self.assert_unknown(self.call("column_fit", **args), "UNKNOWN_DUPLICATE_GEOMETRY")
            args = self.parameters()
            args["reference_comparison"]["reference_rects"] = [[22, 18, 27, 23]]
            args["geometry"]["site_centers_xy"] = [[20, 20], [24, 20]]
            args["geometry"]["supplied_columns_xy"] = [[20, 20], [24, 20]] + [
                [21.8 + 0.05*x, 19.8 + 0.05*y] for y in range(8) for x in range(10)]
            result = self.call("column_fit", **args)
            self.assert_unknown(result, "UNKNOWN_DESIGN_BUDGET")
            self.assertTrue(all(site["design_shape"][1] >= 81 for site in result["sites"]))
            svd.assert_not_called(); fitting.assert_not_called()

    def test_zero_support_and_failed_reference_preserve_per_site_and_whole_eligibility(self):
        zero = self.fit(self.make_frame(np.zeros((64, 64), np.uint32)))
        self.assertEqual([site["status"] for site in zero["sites"]], ["UNKNOWN_ZERO_COUNTS"] * 2)
        self.assertEqual(zero["whole_comparison"]["failed_site_indices"], [0, 1])
        values = self.positive.copy(); values[40:49, 40:49] = 0
        partial = self.fit(self.make_frame(values))
        self.assertEqual(partial["sites"][0]["status"], "CONDITIONAL_POINT_ESTIMATE")
        self.assertIsNotNone(partial["sites"][0]["accepted"]["central_integral"])
        self.assertEqual(partial["sites"][1]["status"], "UNKNOWN_ZERO_COUNTS")
        self.assertEqual(partial["whole_comparison"], dict(status="UNKNOWN_REQUIRED_SITE", failed_site_indices=[1],
            fitted_total_mean_difference=None, central_integral_difference=None))

    def test_zero_target_low_counts_and_wrong_width_do_not_become_classifications(self):
        for frame, sigma in ((self.make_frame(self.zero_target), 1.0),
                             (self.make_frame(self.low_counts), 1.0), (self.frame, 1.6)):
            with self.subTest(sigma=sigma, object_id=frame["object_id"]):
                geometry = self.parameters()["geometry"]; geometry["sigma_pixels"] = sigma
                result = self.fit(frame, geometry=geometry)
                self.assert_no_physical_claim(result)
                for site in result["sites"]:
                    self.assertTrue(site["status"] == "CONDITIONAL_POINT_ESTIMATE" or site["status"].startswith("UNKNOWN_"))
                    if site["status"] != "CONDITIONAL_POINT_ESTIMATE":
                        self.assertIsNone(site["accepted"]["central_integral"])
                if any(site["status"] != "CONDITIONAL_POINT_ESTIMATE" for site in result["sites"]):
                    self.assertEqual(result["whole_comparison"]["status"], "UNKNOWN_REQUIRED_SITE")

    def test_historical_read_recovery_export_review_and_original_request_never_refit(self):
        result = self.fit()
        self.assertEqual(result["whole_comparison"]["status"], "CONDITIONAL_POINT_ESTIMATE")
        original = copy.deepcopy(self.requests[result["request_id"]])
        discovery = self.call("discovery", object_id=self.frame["object_id"], entry="manual", selection_origin="agent",
            regions=[dict(rect=self.rect, reason="Explicit fixed expected-site ROI; no material identification")])
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Historical fit replay")) as fitting, \
             patch.object(model, "minimize", side_effect=AssertionError("Historical optimizer replay")) as optimizing:
            saved, _ = worker.Workspace(str(self.workspace), False).object(result["object_id"])
            self.assertEqual(saved["whole_comparison"], result["whole_comparison"])
            self.assertEqual(self.call("get", object_id=result["object_id"])["sites"], result["sites"])
            self.assertEqual(self.call("result", query_request_id=result["request_id"])["object_id"], result["object_id"])
            replay = worker.execute(original)
            self.assertTrue(replay["ok"], replay)
            self.assertEqual(replay["result"]["object_id"], result["object_id"])
            self.call("export", object_id=result["object_id"], output_dir=str(self.root / "export"))
            source_report = self.workspace / "objects" / result["object_id"] / "column-fit.json"
            self.assertEqual((self.root / "export" / "column-fit.json").read_bytes(), source_report.read_bytes())
            review = self.call("discovery_review", object_id=discovery["object_id"],
                candidate_id=discovery["candidates"][0]["candidate_id"], evidence_ids=[result["object_id"]],
                observation_text="Conditional stored component estimate; physical cause remains unknown")
            self.assertFalse(review["review_is_scientific_verification"])
            self.assertIsNone(review["physical_conclusion"])
            self.assertEqual(self.call("get", object_id=review["object_id"])["object_id"], review["object_id"])
            # Same pixels in a different committed frame do not grant source identity.
            other_frame = self.make_frame(self.positive.copy())
            other_discovery = self.call("discovery", object_id=other_frame["object_id"], entry="manual", selection_origin="agent",
                regions=[dict(rect=self.rect, reason="Different immutable source fixture")])
            mismatch = self.call("discovery_review", ok=False, object_id=other_discovery["object_id"],
                candidate_id=other_discovery["candidates"][0]["candidate_id"], evidence_ids=[result["object_id"]],
                observation_text="This source identity must be refused")
            self.assertEqual(mismatch["error"]["code"], "DISCOVERY_SCOPE_MISMATCH")
            fitting.assert_not_called(); optimizing.assert_not_called()

    def test_source_and_coherently_rehashed_coefficients_cannot_change_saved_evidence(self):
        result = self.fit()
        self.assertEqual(result["whole_comparison"]["status"], "CONDITIONAL_POINT_ESTIMATE")
        source = self.workspace / "objects" / self.frame["object_id"] / "data.npy"
        original_source = source.read_bytes()
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Tamper read must not refit")), \
             patch.object(model, "minimize", side_effect=AssertionError("Tamper read must not optimize")):
            try:
                source.write_bytes(original_source[:-1] + bytes([original_source[-1] ^ 1]))
                failed = self.call("get", ok=False, object_id=result["object_id"])
                self.assertEqual(failed["error"]["code"], "CORRUPT_OBJECT")
            finally:
                source.write_bytes(original_source)
            directory = self.workspace / "objects" / result["object_id"]
            manifest = directory / "object.json"
            journal_path = self.workspace / "requests" / (result["request_id"] + ".json")
            report_path, site_path = directory / "column-fit.json", directory / "column-fit-site-0.json"
            originals = {p: p.read_bytes() for p in (manifest, journal_path, report_path, site_path)}
            try:
                changed = copy.deepcopy(result)
                changed["sites"][0]["diagnostics"]["coefficients"][0] += 1000
                report = json.loads(originals[report_path]); report["sites"] = changed["sites"]
                site_path.write_bytes(worker.canonical(changed["sites"][0]) + b"\n")
                report_path.write_bytes(worker.canonical(report) + b"\n")
                for p in (site_path, report_path):
                    changed["files_sha256"][p.name] = worker.sha_file(p)
                manifest.write_bytes(worker.canonical(changed) + b"\n")
                journal = json.loads(originals[journal_path])
                journal["object_manifest_sha256"] = worker.sha_file(manifest)
                journal["response"] = {"ok": True, "state": "completed", "backend": worker.BACKEND, **changed}
                journal_path.write_bytes(worker.canonical(journal) + b"\n")
                # Ordinary own hashes have all been made coherent. Algebraic
                # reconstruction must still catch coefficients contradicting mu.
                worker.Workspace(str(self.workspace), False)._object_record(result["object_id"])
                failed = self.call("get", ok=False, object_id=result["object_id"])
                self.assertEqual(failed["error"]["code"], "CORRUPT_OBJECT")
            finally:
                for p, raw in originals.items():
                    p.write_bytes(raw)
            self.assertEqual(self.call("get", object_id=result["object_id"])["sites"], result["sites"])


if __name__ == "__main__":
    unittest.main()
