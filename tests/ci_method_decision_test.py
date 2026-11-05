"""Lightweight CI Skill/state contracts: stdlib, no images, fitter or simulations."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/scientific-agent/microscopy-automation/scripts/check_method_decision.py"
spec = importlib.util.spec_from_file_location("method_decision_checker", SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
EXAMPLES = json.loads((SCRIPT.parent.parent / "references/method-decision-examples-v1.json").read_text(encoding="utf-8"))


class MethodDecisionContractTests(unittest.TestCase):
    def record(self, name):
        return deepcopy(next(r for r in EXAMPLES["records"] if r["decision_id"] == name))

    def rejects(self, record, reason):
        with self.assertRaisesRegex(ValueError, reason):
            checker.validate_record(record)

    def test_all_published_examples_are_accepted_without_mutation(self):
        for record in EXAMPLES["records"]:
            with self.subTest(choice=record["decision_id"]):
                before = deepcopy(record)
                self.assertIs(checker.validate_record(record), record)
                self.assertEqual(record, before)

    def test_each_missing_premise_can_be_retained_but_not_called_an_available_fit(self):
        for premise in checker.CONTRACT["premises"]:
            for status in ("missing", "unsupported", "conflicting"):
                with self.subTest(premise=premise, status=status):
                    record = self.record("synthetic-propose-s2")
                    record["premises"][premise] = {"status": status, "source_text": None}
                    self.rejects(record, "distinguish supplied-premise")
                    record["choice"] = "save_s2_unknown"
                    if premise == "reference_equivalence":
                        self.rejects(record, "unavailable worker prerequisite")
                        record["choice"], record["next_request"] = "retain_unknown", None
                    checker.validate_record(record)

    def test_supplied_assumption_needs_source_but_does_not_become_verified(self):
        record = self.record("synthetic-propose-s2")
        record["premises"]["counts"]["source_text"] = ""
        self.rejects(record, "source_text")
        record["premises"]["counts"]["source_text"] = "Caller assumption, not authenticated acquisition evidence"
        checker.validate_record(record)
        record["premises"]["counts"]["status"] = "verified"
        self.rejects(record, "invalid premise status")

    def test_saved_missing_prerequisite_unknown_can_retain_its_own_raw_receipt(self):
        record = self.record("synthetic-saved-unknown")
        checker.validate_record(record)
        record["saved_result"]["status"] = "available"
        self.rejects(record, "missing prerequisites cannot be labelled available")

    def test_saved_unknown_baseline_must_bind_the_same_receipt(self):
        for key in ("object_id", "request_id"):
            record = self.record("synthetic-saved-unknown")
            record["baseline_evidence"][key] = "f" * 32
            self.rejects(record, "same column-fit receipt")

    def test_numerical_unknown_is_legal_with_all_supplied_assumptions(self):
        record = self.record("synthetic-saved-unknown")
        record["choice"] = "conditional_s2"
        record["premises"] = self.record("synthetic-propose-s2")["premises"]
        checker.validate_record(record)

    def test_available_target_with_failed_reference_keeps_comparison_unknown(self):
        record = self.record("synthetic-saved-conditional")
        record["saved_result"]["comparison_status"] = "unknown"
        checker.validate_record(record)
        record["saved_result"]["status"] = "unknown"
        record["saved_result"]["comparison_status"] = "available"
        self.rejects(record, "unknown target cannot promote whole comparison")

    def test_unknown_or_pending_write_is_query_only_or_stopped(self):
        for outcome in ("unknown", "pending"):
            record = self.record("synthetic-recover")
            record["prior_request"]["outcome"] = outcome
            checker.validate_record(record)
            record["next_request"]["request_id"] = "new-id-is-not-recovery"
            self.rejects(record, "exact original ID")
            record = self.record("synthetic-propose-s2")
            record["prior_request"] = {"request_id": "unresolved-original", "outcome": outcome, "locator": deepcopy(record["locator"])}
            record["revision_of_request_id"] = "unresolved-original"
            self.rejects(record, "prior known outcome")
            record["revision_of_request_id"] = None
            self.rejects(record, "unknown/pending write")
            record["choice"], record["next_request"] = "retain_unknown", None
            checker.validate_record(record)

    def test_deliberate_revision_uses_new_id_after_known_outcome(self):
        for outcome in ("completed", "failed"):
            record = self.record("synthetic-revision")
            record["prior_request"]["outcome"] = outcome
            checker.validate_record(record)
            record["next_request"]["request_id"] = record["prior_request"]["request_id"]
            self.rejects(record, "new ID")
        record = self.record("synthetic-revision")
        record["revision_of_request_id"] = None
        self.rejects(record, "linked to the prior result")

    def test_baseline_does_not_silently_promote_historical_methods(self):
        for method in ("H1", "S1"):
            record = self.record("synthetic-baseline-s0")
            record["method"] = method
            self.rejects(record, "method is unavailable")
            record["choice"] = "research_only"
            record["estimand"] = checker.CONTRACT["estimands"][method]
            checker.validate_record(record)
            record["next_request"] = {"tool": "image_column_fit", "request_id": "not-a-research-tool"}
            self.rejects(record, "dispatch no S2")

    def test_raw_roi_and_central_component_are_not_interchangeable(self):
        record = self.record("synthetic-propose-s2")
        record["estimand"] = "raw_roi_contrast"
        self.rejects(record, "estimands separate")
        record = self.record("synthetic-baseline-s0")
        record["baseline_evidence"]["kind"] = "fft_measurement"
        self.rejects(record, "matching saved observable")

    def test_numerical_success_cannot_confirm_a_physical_label(self):
        for status in ("CONFIRMED", "vacancy", "occupancy", "phase_identified"):
            record = self.record("synthetic-saved-conditional")
            record["physical_status"] = status
            self.rejects(record, "cannot confirm physical")

    def test_original_source_coordinates_and_explicit_nulls_are_required(self):
        for key in checker.CONTRACT["source_fields"]:
            record = self.record("synthetic-propose-s2")
            del record["source"][key]
            self.rejects(record, "exact fields")
        for frame in (None, True, -1, 0.5):
            record = self.record("synthetic-propose-s2")
            record["source"]["frame_index"] = frame
            self.rejects(record, "zero-based integer")
        record = self.record("synthetic-propose-s2")
        record["source"]["rect"] = [10, 10, 16, 15]
        self.rejects(record, "fixed 5x5")

    def test_recovery_keeps_the_original_provider_workspace_and_session(self):
        for field in ("provider", "workspace", "session_id"):
            record = self.record("synthetic-recover")
            record["locator"][field] = "different-scope"
            self.rejects(record, "original provider/workspace/session")
        record = self.record("synthetic-recover")
        del record["prior_request"]["locator"]
        self.rejects(record, "exact fields")

    def test_recovery_and_stopped_unknown_do_not_require_fabricated_source_or_roi(self):
        for source in (None, {key: None for key in checker.CONTRACT["source_fields"]}):
            record = self.record("synthetic-recover")
            record["source"], record["baseline_evidence"] = source, None
            checker.validate_record(record)
            record["choice"], record["next_request"] = "retain_unknown", None
            checker.validate_record(record)
        record["prior_request"] = None
        self.rejects(record, "saved object ID")

    def test_new_measurements_require_full_source_and_sufficient_locator(self):
        record = self.record("synthetic-propose-s2")
        record["source"] = None
        self.rejects(record, "complete source")
        for field in ("provider", "workspace"):
            record = self.record("synthetic-recover")
            record["locator"][field] = None
            self.rejects(record, "nonempty bounded text")
        record = self.record("synthetic-propose-s2")
        record["premises"]["width_shape"]["source_text"] = "Width supplied; shape adequacy NOT_ASSESSED"
        checker.validate_record(record)

    def test_cli_reads_a_record_without_writing_or_executing_science(self):
        with tempfile.TemporaryDirectory(prefix="method-record-") as folder:
            record_path = Path(folder) / "decision.json"
            record_path.write_text(json.dumps(self.record("synthetic-propose-s2")), encoding="utf-8")
            before = record_path.read_bytes()
            result = subprocess.run([sys.executable, str(SCRIPT), str(record_path)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(json.loads(result.stdout)["valid"])
            self.assertEqual(record_path.read_bytes(), before)
            self.assertEqual([p.name for p in Path(folder).iterdir()], ["decision.json"])


if __name__ == "__main__":
    unittest.main()
