"""Required-check failure injection, without GitHub/network/science packages."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ci_scope import GROUPS, QUICK_JOBS, F3B_JOBS
from ci_gate import validate


def needs_for(groups=(), workflow="quick"):
    jobs = QUICK_JOBS if workflow == "quick" else F3B_JOBS
    selected = set(groups)
    outputs = {"run_" + g: str(g in selected).lower() for g in GROUPS}
    outputs["run_full_ci"] = str(selected == set(GROUPS)).lower()
    return {"changes": {"result": "success", "outputs": outputs},
            **{j: {"result": "success" if g in selected else "skipped"} for j, g in jobs.items()}}


class GateTests(unittest.TestCase):
    def test_docs_skip_is_intentional(self):
        self.assertEqual(validate(needs_for(), "quick"), [])

    def test_gui_and_full_success(self):
        for selected in ({"node", "boundary"}, GROUPS):
            self.assertEqual(validate(needs_for(selected), "quick"), [])

    def test_required_skip_failure_cancel_or_missing_never_pass(self):
        for state in ("skipped", "failure", "cancelled", "neutral", "timed_out", None):
            with self.subTest(state=state):
                needs = needs_for({"node"})
                needs["node-smoke"] = {"result": state}
                self.assertTrue(validate(needs, "quick"))
        needs = needs_for({"node"}); del needs["node-smoke"]
        self.assertTrue(validate(needs, "quick"))

    def test_unselected_failure_not_hidden(self):
        needs = needs_for(); needs["classical-gpa"]["result"] = "failure"
        self.assertTrue(validate(needs, "quick"))

    def test_classifier_failure_or_skipped_or_missing(self):
        for state in ("failure", "skipped", "cancelled", None):
            needs = needs_for(); needs["changes"]["result"] = state
            self.assertTrue(validate(needs, "quick"))
        needs = needs_for(); del needs["changes"]
        self.assertTrue(validate(needs, "quick"))

    def test_bad_outputs_and_contract_drift(self):
        for bad in (None, {}, [], "TRUE", True):
            needs = needs_for(); needs["changes"]["outputs"]["run_node"] = bad
            self.assertTrue(validate(needs, "quick"))
        needs = needs_for(); needs["new-job"] = {"result": "success"}
        self.assertTrue(validate(needs, "quick"))
        needs = needs_for(); needs["changes"]["outputs"]["run_full_ci"] = "true"
        self.assertTrue(validate(needs, "quick"))

    def test_scattering_selected_and_deselected(self):
        self.assertEqual(validate(needs_for(workflow="f3b"), "f3b"), [])
        needs = needs_for({"crystal"}, "f3b")
        self.assertEqual(validate(needs, "f3b"), [])
        needs["actual-diffsims-mcp"]["result"] = "skipped"
        self.assertTrue(validate(needs, "f3b"))

    def test_invalid_gate_input_and_cli_exit_codes(self):
        self.assertTrue(validate(None, "quick"))
        self.assertTrue(validate({}, "unknown"))
        script = Path(__file__).resolve().parents[1] / "scripts" / "ci_gate.py"
        for payload, expected in ((json.dumps(needs_for()), 0), ("broken JSON", 1), ("{}", 1)):
            result = subprocess.run([sys.executable, str(script), "quick"],
                                    env={**os.environ, "CI_NEEDS": payload}, capture_output=True, text=True)
            self.assertEqual(result.returncode, expected, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
