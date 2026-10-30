"""Private boundary and intake failure cases; no private specimen or solver."""
import json
import logging
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import specimen_intake as intake


class SpecimenIntake(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="public-intake-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "case"
        intake.init_case(self.root, "test-001")
        self.source = self.root / "raw" / "asymmetric.tiff"
        tifffile.imwrite(self.source, np.arange(35, dtype=np.uint16).reshape(5, 7), metadata=None)
        self.data = intake.load_json(self.root / "manifest.json")
        self.data["data_kind"] = "synthetic"
        self.data["permissions"]["local_read_authorized"] = True
        self.data["files"][0].update(path="raw/asymmetric.tiff", format="tiff", original_array=True,
                                     shape=[5, 7], dtype="uint16", array_axes=["y", "x"], sha256=intake.digest(self.source))
        self.data["files"][0]["selection"]["frame_index"] = 0
        self.data["calibration"].update(coordinate_domain="real_space", signed_scale_xy=[.02, -.03],
                                       pixel_zero_xy=[-.025, -.075], unit="nm", source="declared synthetic metric",
                                       flipped_or_resampled=False)
        self.data["acquisition"].update(image_domain="real_space_lattice", domain_source="declared fixture")

    def save(self):
        (self.root / "manifest.json").write_text(json.dumps(self.data), encoding="utf-8")

    def run_check(self):
        self.save()
        return intake.preflight(self.root)

    def codes(self, report):
        return {row["code"] for row in report["checks"]}

    def test_signed_asymmetric_ready_is_not_real_specimen_or_physical_pass(self):
        self.save()
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        result = intake.preflight(self.root)
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["physical_conclusion"], "UNDETERMINED")
        self.assertEqual(result["real_specimen_validation"], "NOT_TESTED")
        self.assertEqual(result["independent_physics"], "NOT_TESTED")
        self.assertIn("HOLD", result["route_screening"]["F3b"])
        after = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after, "preflight must create or modify no case file")

    def test_unknown_metric_keeps_pixel_read_but_nonzero_partial(self):
        self.data["calibration"]["signed_scale_xy"] = None
        result = self.run_check()
        self.assertEqual(result["exit_code"], 2)
        self.assertEqual(result["files"][0]["status"], "PASS")
        self.assertIn("UNKNOWN_CALIBRATION_PIXEL_ONLY", self.codes(result))
        self.assertIsNone(intake.load_json(self.root / "manifest.json")["calibration"]["signed_scale_xy"])

    def test_absent_permission_never_reads_source(self):
        self.data["permissions"]["local_read_authorized"] = False
        with patch.object(intake, "inspect_image", side_effect=AssertionError("must not decode")):
            result = self.run_check()
        self.assertEqual(result["exit_code"], 1)
        self.assertEqual(result["files"], [])

    def test_expected_hash_mismatch_and_missing_hash(self):
        self.data["files"][0]["sha256"] = "0" * 64
        self.assertIn("SOURCE_HASH_MISMATCH", self.codes(self.run_check()))
        self.data["files"][0]["sha256"] = None
        self.assertEqual(self.run_check()["exit_code"], 2)

    def test_source_mutation_during_decode_is_reported(self):
        original = intake.inspect_image
        def changed(path, entry):
            result = original(path, entry)
            with path.open("ab") as stream:
                stream.write(b"changed-by-test")
            return result
        with patch.object(intake, "inspect_image", side_effect=changed):
            result = self.run_check()
        self.assertFalse(result["files"][0]["source_unchanged"])
        self.assertEqual(result["exit_code"], 1)

    def test_derived_primary_refused(self):
        self.data["files"][0]["original_array"] = False
        self.assertIn("DERIVED_AS_ORIGINAL_REFUSED", self.codes(self.run_check()))

    def test_frame_must_be_explicit_even_single_page(self):
        self.data["files"][0]["selection"]["frame_index"] = None
        self.assertIn("FRAME_SELECTION_REQUIRED", self.codes(self.run_check()))
        self.data["files"][0]["selection"]["frame_index"] = 1
        self.assertIn("FRAME_OUT_OF_BOUNDS", self.codes(self.run_check()))

    def test_stack_decodes_only_selected_page(self):
        with tifffile.TiffWriter(self.source) as writer:
            writer.write(np.zeros((3, 4), dtype=np.uint16), metadata=None)
            writer.write(np.ones((5, 7), dtype=np.uint16), metadata=None)
        self.data["files"][0]["sha256"] = intake.digest(self.source)
        self.data["files"][0]["selection"]["frame_index"] = 1
        result = self.run_check()
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["files"][0]["observed"]["frame_count"], 2)

    def test_truncated_payload_is_not_read_success(self):
        self.source.write_bytes(self.source.read_bytes()[:-4])
        self.data["files"][0]["sha256"] = intake.digest(self.source)
        result = self.run_check()
        self.assertIn("TRUNCATED_TIFF_PAYLOAD", self.codes(result))

    def test_shape_dtype_axes_and_format_conflicts(self):
        for key, value in (("shape", [7, 5]), ("dtype", "float32"), ("format", "dm4"), ("array_axes", ["x", "y"])):
            with self.subTest(key=key):
                original = self.data["files"][0][key]
                self.data["files"][0][key] = value
                self.assertEqual(self.run_check()["exit_code"], 1)
                self.data["files"][0][key] = original

    def test_zero_boolean_and_wrong_domain_calibration(self):
        for values in ([0, -.03], [True, -.03]):
            self.data["calibration"]["signed_scale_xy"] = values
            self.assertEqual(self.run_check()["exit_code"], 1)
        self.data["calibration"]["signed_scale_xy"] = [.02, -.03]
        self.data["calibration"]["coordinate_domain"] = "reciprocal_space"
        self.assertEqual(self.run_check()["exit_code"], 2)

    def test_nonfinite_float_and_unsupported_dtype(self):
        for array in (np.full((5, 7), np.nan, dtype=np.float32), np.ones((5, 7), dtype=np.float64)):
            tifffile.imwrite(self.source, array, metadata=None)
            self.data["files"][0]["sha256"] = intake.digest(self.source)
            self.assertEqual(self.run_check()["exit_code"], 1)

    def test_budget_is_checked_before_decode(self):
        with patch.object(intake, "MAX_PIXELS", 30), patch.object(tifffile.TiffPage, "asarray", side_effect=AssertionError("decode before budget")):
            self.assertIn("PLANE_BUDGET_EXCEEDED", self.codes(self.run_check()))

    def test_bounds_and_trace_never_clip(self):
        self.data["annotations"]["roi_a_xyxy"] = [0, 0, 8, 5]
        self.data["annotations"]["interface_xy"] = [[0, 0], [7, 4]]
        result = self.run_check()
        self.assertEqual(result["exit_code"], 1)
        self.assertIn("INTERFACE_PIXEL_CENTERS", self.codes(result))

    def test_absolute_and_traversal_paths_refused(self):
        for path in ("../other.tiff", "C:/secret.tiff", "/tmp/secret.tiff", "raw\\secret.tiff", "raw/../secret.tiff"):
            self.data["files"][0]["path"] = path
            self.assertEqual(self.run_check()["exit_code"], 1)

    def test_link_paths_refused(self):
        linked = self.root / "raw" / "linked.tiff"
        try:
            linked.symlink_to(self.source)
        except OSError:
            self.skipTest("creating links requires OS privilege")
        self.data["files"][0]["path"] = "raw/linked.tiff"
        self.assertIn("LINK_REFUSED", self.codes(self.run_check()))

    def test_reader_warning_is_not_silent_success(self):
        def warns(path, entry):
            logging.getLogger("tifffile").warning("private-reader-diagnostic")
            return {}
        with patch.object(intake, "inspect_image", side_effect=warns):
            result = self.run_check()
        self.assertEqual(result["exit_code"], 1)
        self.assertIn("READER_DIAGNOSTIC_REQUIRES_REVIEW", self.codes(result))
        self.assertNotIn("private-reader-diagnostic", json.dumps(result))

    def test_repository_case_guard_and_no_overwrite(self):
        repository = Path(self.tmp.name) / "checkout"
        (repository / ".git").mkdir(parents=True)
        with self.assertRaises(intake.IntakeError):
            intake.init_case(repository / "specimen", "test")
        intake.init_case(repository / "private" / "test", "test")
        with self.assertRaises(FileExistsError):
            intake.init_case(self.root, "test")
        target = self.root / "reports" / "result.json"
        intake.write_new(target, {"first": True})
        with self.assertRaises(FileExistsError):
            intake.write_new(target, {"second": True})

    def test_invalid_json_and_missing_file(self):
        for text in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":1e999}', '{'):
            (self.root / "manifest.json").write_text(text, encoding="utf-8")
            with self.assertRaises(intake.IntakeError):
                intake.preflight(self.root)
        self.source.unlink()
        self.assertIn("FILE_MISSING", self.codes(self.run_check()))

    def test_outside_crystal_scope_does_not_block_pixel_intake_or_claim_physics(self):
        self.data["sample"].update(f3b_model="hcp", material="declared compound", composition_source="declared synthetic source",
                                   ideal_full_occupancy_monospecies_conventional_cell=False)
        report = self.run_check()
        self.assertEqual(report["exit_code"], 0)
        self.assertIn("UNSUPPORTED_MODEL", report["route_screening"]["F3b_hold_reasons"])
        self.assertEqual(report["independent_physics"], "NOT_TESTED")

    def test_cli_report_is_private_exclusive_and_console_is_bounded(self):
        self.save()
        command = [sys.executable, "-B", str(ROOT / "tools/specimen_intake.py"), "preflight", "--case-dir", str(self.root), "--report", "reports/preflight.json"]
        done = subprocess.run(command, capture_output=True, text=True, timeout=20)
        self.assertEqual(done.returncode, 0, done.stdout)
        self.assertNotIn(str(self.root), done.stdout)
        self.assertNotIn(self.source.name, done.stdout)
        self.assertEqual(subprocess.run(command, capture_output=True, timeout=20).returncode, 1)

    def test_public_fixture_dry_run(self):
        report = intake.dry_run(Path(self.tmp.name) / "dry-run")
        self.assertEqual(report["exit_code"], 0)
        self.assertEqual(report["data_kind"], "synthetic")
        self.assertEqual(report["physical_conclusion"], "UNDETERMINED")

    def test_optional_dm_reader_and_stored_metric_conflict(self):
        try:
            from importlib.metadata import version
            if version("rosettasciio") != "0.15.0":
                self.skipTest("optional pinned DM reader absent")
        except ModuleNotFoundError:
            self.skipTest("optional pinned DM reader absent")
        sys.path.insert(0, str(ROOT / "tests/fixtures"))
        from dm4_fixture import create_fixtures
        created = create_fixtures(self.root / "raw" / "dm")
        path = created / "signed-uint32.dm4"
        self.data["files"][0].update(path=path.relative_to(self.root).as_posix(), format="dm4", shape=[5, 7], dtype="uint32", sha256=intake.digest(path))
        self.data["files"][0]["selection"]["dataset_index"] = 0
        self.save()
        command = [sys.executable, "-B", str(ROOT / "tools/specimen_intake.py"), "preflight", "--case-dir", str(self.root), "--report", "reports/dm.json"]
        done = subprocess.run(command, capture_output=True, text=True, timeout=40)
        report = intake.load_json(self.root / "reports" / "dm.json")
        self.assertEqual(done.returncode, 0, report)
        self.data["calibration"]["signed_scale_xy"][0] *= 2
        self.save()
        done = subprocess.run(command[:-1] + ["reports/conflict.json"], capture_output=True, text=True, timeout=40)
        report = intake.load_json(self.root / "reports" / "conflict.json")
        self.assertEqual(done.returncode, 1)
        self.assertIn("STORED_XY_AGREEMENT:x", self.codes(report))


if __name__ == "__main__":
    unittest.main()
