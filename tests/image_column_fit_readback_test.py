"""Saved S2 admission/source regressions; no new optimizer or accuracy matrix.

Set S2_READBACK_ARTIFACT_ROOT to an exclusive output root to retain the exact
provider workspaces, original objects, coherent forgeries and read responses.
"""
from contextlib import contextmanager
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

SOURCE_ROOT = Path(os.environ.get("S2_READBACK_IMPLEMENTATION_ROOT", Path(__file__).resolve().parents[1]))
sys.path[:0] = [str(SOURCE_ROOT), str(Path(__file__).resolve().parent)]
from tools import image_workspace as api, image_column_fit as columns, image_column_model as model
from preview_test_support import acknowledge_received_previews


@contextmanager
def no_refit():
    with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("Readback refit")) as fit, \
         patch.object(model, "minimize", side_effect=AssertionError("Readback optimizer")) as opt:
        yield
        fit.assert_not_called()
        opt.assert_not_called()


class ColumnFitReadback(unittest.TestCase):
    def setUp(self):
        keep = os.environ.get("S2_READBACK_ARTIFACT_ROOT")
        self.temp = None if keep else tempfile.TemporaryDirectory(prefix="s2-readback-")
        self.root = (Path(keep) / self._testMethodName if keep else Path(self.temp.name)).resolve()
        if keep:
            self.root.mkdir(parents=True, exist_ok=False)
        self.workspace = self.root / "images"
        self.serial = 0
        self.observations = []

    def tearDown(self):
        if self.root.is_dir():
            (self.root / "readback-observations.json").write_bytes(api.canonical(self.observations)+b"\n")
        if self.temp is not None:
            self.temp.cleanup()

    def call(self, action, **kwargs):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), **kwargs)
        if action not in ("get", "result"):
            request["request_id"] = "readback-%d" % self.serial
        reply = api.execute(request)
        self.assertTrue(reply["ok"], reply)
        acknowledge_received_previews(api, self.workspace, reply["result"])
        return reply["result"]

    def frame(self, count):
        source = self.root / "public-uniform-counts.tiff"
        tifffile.imwrite(source, np.full((64, 64), count, dtype=np.uint32), photometric="minisblack")
        opened = self.call("open", source_path=str(source))
        return self.call("frame", object_id=opened["object_id"], frame_index=0)

    def fitted(self, parent, *, near_duplicate=False, sigma=1.0):
        supplied = [[20, 20], [44, 44]]
        if near_duplicate:
            # Three near-collinear templates have a second-order dependence;
            # a single close pair alone still passes the frozen 1e-10 gate.
            supplied += [[20.00001, 20], [20.00002, 20], [44.00001, 44], [44.00002, 44]]
        with patch.object(model, "minimize", side_effect=AssertionError("No optimizer permitted")) as opt:
            result = self.call("column_fit", object_id=parent["object_id"], rect=[18, 18, 23, 23],
                reference_comparison=dict(reference_rects=[[42, 42, 47, 47]],
                    source_text="Public uniform fixture references; caller supplied, unverified"),
                geometry=dict(site_centers_xy=[[20, 20], [44, 44]], supplied_columns_xy=supplied,
                    sigma_pixels=sigma, source_text="Fixed supplied public fixture geometry"),
                count_interpretation=dict(model="independent_poisson_counts",
                    source_text="Caller count interpretation for a deterministic software fixture"))
            opt.assert_not_called()
        return result

    def request(self, result):
        return api.read_json(self.workspace / "requests" / (result["request_id"]+".json"))["parameters"]

    def assert_read_paths(self, result, *, rejected=False, label="original"):
        requests = [dict(action="get", workspace=str(self.workspace), object_id=result["object_id"]),
                    dict(action="result", workspace=str(self.workspace), query_request_id=result["request_id"]),
                    self.request(result)]
        with no_refit():
            if not rejected:
                saved, _ = api.Workspace(str(self.workspace), False).object(result["object_id"])
                self.assertEqual(saved["sites"], result["sites"])
            for request in requests:
                reply = api.execute(request)
                self.observations.append(dict(label=label, action=request["action"], response=reply))
                with self.subTest(label=label, action=request["action"]):
                    self.assertEqual(reply["ok"], not rejected, reply)
                    if rejected:
                        self.assertEqual(reply["error"]["code"], "CORRUPT_OBJECT", reply)
                    else:
                        self.assertEqual(reply["result"]["object_id"], result["object_id"])

    @contextmanager
    def coherent_forgery(self, original, changed, label, *, report_drop=()):
        directory = self.workspace / "objects" / original["object_id"]
        manifest = directory / "object.json"
        journal_path = self.workspace / "requests" / (original["request_id"]+".json")
        report_path = directory / "column-fit.json"
        paths = [manifest, journal_path, report_path, *sorted(directory.glob("column-fit-site-*.json"))]
        originals = {p: p.read_bytes() for p in paths}
        archive = self.root / "coherent-forgeries" / label
        archive.mkdir(parents=True, exist_ok=False)
        try:
            report = json.loads(originals[report_path])
            for key in list(report):
                if key in changed:
                    report[key] = copy.deepcopy(changed[key])
                else:
                    del report[key]
            for key in report_drop:
                del report[key]
            for site in changed["sites"]:
                path = directory / ("column-fit-site-%d.json" % site["site_index"])
                path.write_bytes(api.canonical(site)+b"\n")
                changed["files_sha256"][path.name] = api.sha_file(path)
            report_path.write_bytes(api.canonical(report)+b"\n")
            changed["files_sha256"][report_path.name] = api.sha_file(report_path)
            manifest.write_bytes(api.canonical(changed)+b"\n")
            journal = json.loads(originals[journal_path])
            journal["object_manifest_sha256"] = api.sha_file(manifest)
            journal["response"] = {"ok": True, "state": "completed", "backend": api.BACKEND, **changed}
            journal_path.write_bytes(api.canonical(journal)+b"\n")
            # This specifically bypasses own-hash checks, not source qualification.
            api.Workspace(str(self.workspace), False)._object_record(original["object_id"])
            for path in paths:
                (archive / ("creator-request.json" if path == journal_path else path.name)).write_bytes(path.read_bytes())
            yield
        finally:
            for path, raw in originals.items():
                path.write_bytes(raw)

    def background_solution(self, original, count):
        changed = copy.deepcopy(original)
        request = self.request(original)
        _, _, _, plans = columns._prepare(api.Workspace(str(self.workspace), False), request, api)
        for site, plan in zip(changed["sites"], plans):
            coefficients = np.zeros(plan["_design"].shape[1])
            coefficients[-4:] = count
            mu = np.maximum(plan["_design"] @ coefficients, 1e-12)
            # Independent exact constant-background solution: for 100 counts,
            # B@coef == y; for zero counts the positive gradient is projected off.
            self.assertTrue(np.all(mu == (count or 1e-12)))
            site.update(status="CONDITIONAL_POINT_ESTIMATE",
                diagnostics=dict(status="CONDITIONAL_POINT_ESTIMATE", coefficients=coefficients.tolist(),
                    mu=mu.tolist(), projected_gradient=0.0, optimizer_success=True,
                    evaluations=1, iterations=0))
            site["accepted"] = dict(fitted_total_roi_mean=float(np.mean(mu.reshape(9, 9)[2:7, 2:7])),
                                    central_integral=0.0)
        changed["whole_comparison"] = dict(status="CONDITIONAL_POINT_ESTIMATE", failed_site_indices=[],
            fitted_total_mean_difference=0.0, central_integral_difference=0.0)
        changed["optimizer_calls"] = 2
        return changed

    def test_rank_deficient_background_solution_and_wrong_unknown_are_refused(self):
        result = self.fitted(self.frame(100), near_duplicate=True)
        self.assertEqual([s["status"] for s in result["sites"]], ["UNKNOWN_NONIDENTIFIABLE_DESIGN"]*2)
        self.assertEqual(result["optimizer_calls"], 0)
        self.assertTrue(all(s["diagnostics"]["smallest_singular_ratio"] <= 1e-10 for s in result["sites"]))
        self.assert_read_paths(result)
        changed = self.background_solution(result, 100)
        with self.coherent_forgery(result, changed, "rank-background-cpe"):
            self.assert_read_paths(result, rejected=True, label="rank-background-cpe")
        changed = copy.deepcopy(result)
        for site in changed["sites"]:
            site["status"] = site["diagnostics"]["status"] = "UNKNOWN_NOT_CONVERGED"
        with self.coherent_forgery(result, changed, "rank-wrong-unknown"):
            self.assert_read_paths(result, rejected=True, label="rank-wrong-unknown")
        self.assert_read_paths(result, label="restored")

    def test_zero_counts_precede_rank_and_cannot_be_forged_as_cpe(self):
        result = self.fitted(self.frame(0), near_duplicate=True)
        self.assertEqual([s["status"] for s in result["sites"]], ["UNKNOWN_ZERO_COUNTS"]*2)
        self.assert_read_paths(result)
        with self.coherent_forgery(result, self.background_solution(result, 0), "zero-count-cpe"):
            self.assert_read_paths(result, rejected=True, label="zero-count-cpe")
        changed = copy.deepcopy(result)
        for site in changed["sites"]:
            site["status"] = site["diagnostics"]["status"] = "UNKNOWN_NONIDENTIFIABLE_DESIGN"
        with self.coherent_forgery(result, changed, "zero-count-wrong-unknown"):
            self.assert_read_paths(result, rejected=True, label="zero-count-wrong-unknown")
        changed = copy.deepcopy(result)
        changed["sites"][0]["diagnostics"]["evaluations"] = False
        with self.coherent_forgery(result, changed, "zero-count-false-evaluations"):
            self.assert_read_paths(result, rejected=True, label="zero-count-false-evaluations")
        for key in ("xy_calibration", "user_context"):
            self.assertIsNone(result[key])
            changed = copy.deepcopy(result)
            del changed[key]
            with self.coherent_forgery(result, changed, "deleted-null-"+key):
                self.assert_read_paths(result, rejected=True, label="deleted-null-"+key)
        with self.coherent_forgery(result, copy.deepcopy(result), "report-only-deleted-null-calibration",
                                   report_drop=("xy_calibration",)):
            self.assert_read_paths(result, rejected=True, label="report-only-deleted-null-calibration")
        self.assert_read_paths(result, label="restored")

    def test_zero_design_and_missing_optimizer_coefficients_are_refused(self):
        result = self.fitted(self.frame(100), sigma=1e20)
        self.assertEqual([s["status"] for s in result["sites"]], ["UNKNOWN_ZERO_DESIGN_COLUMN"]*2)
        self.assert_read_paths(result)
        with self.coherent_forgery(result, self.background_solution(result, 100), "zero-column-cpe"):
            self.assert_read_paths(result, rejected=True, label="zero-column-cpe")
        changed = copy.deepcopy(result)
        for site in changed["sites"]:
            site["status"] = site["diagnostics"]["status"] = "UNKNOWN_NOT_CONVERGED"
        with self.coherent_forgery(result, changed, "zero-column-wrong-unknown"):
            self.assert_read_paths(result, rejected=True, label="zero-column-wrong-unknown")
        # An admitted full-rank positive-count fit always returns coefficients.
        # This bounded algebraic fixture requires no new scientific optimization.
        plan = dict(_design=np.eye(3), _values=np.ones(3))
        site = dict(status="UNKNOWN_NOT_CONVERGED", diagnostics=dict(status="UNKNOWN_NOT_CONVERGED",
                    coefficients=None, mu=None), accepted=dict(fitted_total_roi_mean=None, central_integral=None))
        with no_refit(), self.assertRaises(api.WorkspaceError) as error:
            columns._validate_fit(plan, site, api)
        self.assertEqual(error.exception.code, "CORRUPT_OBJECT")
        self.observations.append(dict(label="full-rank-missing-coefficients", status="CORRUPT_OBJECT"))

    def test_source_metadata_matches_selected_revision_and_exact_json_types(self):
        frame = self.frame(0)
        contextual = self.call("context", object_id=frame["object_id"],
            metadata=dict(data_meaning="Caller supplied synthetic counts", value_unit="counts"))
        first = self.call("calibrate", object_id=contextual["object_id"], scope="image",
            xy_scale=dict(x=.02, y=.03, unit="nm"), source_text="First public synthetic scale")
        measured = self.call("measure", object_id=first["object_id"], points=[[20, 20], [21, 21]])
        second = self.call("calibrate", object_id=measured["object_id"], scope="image",
            xy_scale=dict(x=-.04, y=.05, unit="nm"), source_text="Selected revised signed synthetic scale")
        selected = self.call("context", object_id=second["object_id"], metadata=dict(value_unit=None))
        result = self.fitted(selected)
        self.assertEqual(result["dtype"], "uint32")
        self.assertEqual(result["xy_calibration"], second["xy_calibration"])
        self.assertNotEqual(result["xy_calibration"], first["xy_calibration"])
        self.assertEqual(result["xy_calibration"]["xy_scale"]["x"], -.04)
        self.assertEqual(result["user_context"]["data_meaning"], "Caller supplied synthetic counts")
        self.assertIsNone(result["user_context"]["value_unit"])
        self.assert_read_paths(result)
        for key, value in [("dtype", "float64"), ("xy_calibration", None),
                           ("user_context", dict(data_meaning="Forged physical meaning")),
                           ("intensity_semantics", "verified physical counts"),
                           ("intensity_calibration_applied", 0), ("dm_called", 0)]:
            with self.subTest(key=key):
                changed = copy.deepcopy(result)
                changed[key] = value
                with self.coherent_forgery(result, changed, "changed-"+key):
                    self.assert_read_paths(result, rejected=True, label="changed-"+key)
        for key in ("dtype", "xy_calibration", "user_context", "intensity_semantics",
                    "intensity_calibration_applied", "dm_called"):
            with self.subTest(deleted=key):
                changed = copy.deepcopy(result)
                del changed[key]
                with self.coherent_forgery(result, changed, "deleted-"+key):
                    self.assert_read_paths(result, rejected=True, label="deleted-"+key)
        with self.coherent_forgery(result, copy.deepcopy(result), "report-only-deleted-context", report_drop=("user_context",)):
            self.assert_read_paths(result, rejected=True, label="report-only-deleted-context")
        self.assert_read_paths(result, label="restored")


@unittest.skipUnless(os.environ.get("S2_HISTORICAL_WORKSPACE"), "Optional preserved pre-fix provider records")
class HistoricalColumnFitReadback(unittest.TestCase):
    def test_saved_fit_review_export_and_original_id_without_refit(self):
        root = Path(os.environ["S2_HISTORICAL_WORKSPACE"]).resolve()
        before = {p: api.sha_file(p) for p in root.rglob("*") if p.is_file()}
        historical = []
        with no_refit():
            for path in sorted((root / "objects").glob("*/object.json")):
                record = api.read_json(path)
                if record["kind"] not in ("column_fit", "discovery_review", "export"):
                    continue
                request = api.read_json(root / "requests" / (record["request_id"]+".json"))["parameters"]
                for query in (dict(action="get", workspace=str(root), object_id=record["object_id"]),
                              dict(action="result", workspace=str(root), query_request_id=record["request_id"]), request):
                    reply = api.execute(query)
                    self.assertTrue(reply["ok"], reply)
                    self.assertEqual(reply["result"]["object_id"], record["object_id"])
                    historical.append(dict(kind=record["kind"], object_id=record["object_id"], action=query["action"], status="PASS"))
                if record["kind"] == "column_fit":
                    self.assertEqual([s["status"] for s in record["sites"]],
                        ["CONDITIONAL_POINT_ESTIMATE", "UNKNOWN_NOT_CONVERGED"])
        self.assertTrue(any(x["kind"] == "column_fit" for x in historical))
        self.assertEqual(before, {p: api.sha_file(p) for p in root.rglob("*") if p.is_file()})
        keep = os.environ.get("S2_READBACK_ARTIFACT_ROOT")
        if keep:
            (Path(keep) / "historical-readback.json").write_bytes(api.canonical(historical)+b"\n")


if __name__ == "__main__":
    unittest.main()
