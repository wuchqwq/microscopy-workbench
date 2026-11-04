"""Pin the two workflows' routing/gate wiring using stdlib, not a YAML dependency.

These are structural checks for the maintained YAML shape, not a YAML parser or
an emulator of the hosted runner. Hosted execution remains a separate gate.
"""
from pathlib import Path
import re
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ci_scope import GROUPS, QUICK_JOBS, F3B_JOBS
ROOT = Path(__file__).resolve().parents[1]


def jobs(text):
    pieces = re.split(r"^  ([a-z][a-z0-9-]*):\n", text.split("jobs:\n", 1)[1], flags=re.M)
    return dict(zip(pieces[1::2], pieces[2::2]))


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.texts = {"quick": (ROOT / ".github/workflows/quick.yml").read_text(),
                      "f3b": (ROOT / ".github/workflows/f3b-simulation.yml").read_text()}

    def test_all_work_jobs_are_in_gate_with_correct_condition(self):
        for suite, mapping, gate in (("quick", QUICK_JOBS, "ci-gate"), ("f3b", F3B_JOBS, "f3b-gate")):
            with self.subTest(suite=suite):
                actual = jobs(self.texts[suite])
                self.assertEqual(set(actual), {"changes", gate, *mapping})
                for job, group in mapping.items():
                    self.assertIn("    needs: changes\n", actual[job])
                    self.assertIn("    if: needs.changes.outputs.run_" + group + " == 'true'\n", actual[job])
                self.assertIn("    if: always()\n", actual[gate])
                needed = re.search(r"    needs: \[([^\]]+)\]", actual[gate]).group(1)
                self.assertEqual(set(needed.split(", ")), {"changes", *mapping})
                self.assertIn("CI_NEEDS: ${{ toJSON(needs) }}", actual[gate])
                self.assertIn("scripts/ci_gate.py " + suite, actual[gate])
                for group in GROUPS:
                    self.assertIn("run_" + group + ": ${{ steps.classify.outputs.run_" + group + " }}", actual["changes"])

    def test_no_workflow_level_path_skip_and_pr_only_cancellation(self):
        for text in self.texts.values():
            trigger = text.split("permissions:", 1)[0]
            self.assertIn("  merge_group:", trigger)
            self.assertNotIn("paths:", trigger)
            self.assertIn("branches: [main]", trigger)
            self.assertIn("github.event.pull_request.number || github.run_id", trigger)
            self.assertIn("cancel-in-progress: ${{ github.event_name == 'pull_request' }}", trigger)
            self.assertNotIn("pull_request_target", text)

    def test_build_is_not_preceded_by_duplicate_typecheck(self):
        for text in self.texts.values():
            self.assertNotIn("run: npm run typecheck", text)
        quick = jobs(self.texts["quick"])
        self.assertIn("- run: npm test", quick["node-smoke"])
        self.assertNotIn("- run: npm run build", quick["node-smoke"])
        # npm test has exactly one pretest build; build owns all three TS projects.
        import json
        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(package["scripts"]["pretest"], "npm run build")
        build = (ROOT / "scripts/build.mjs").read_text()
        for config in ("tsconfig.shared.json", "tsconfig.types.json", "tsconfig.node.json"):
            self.assertIn(config, build)

    def test_science_smoke_preserved_and_supported_node_versions_selected(self):
        quick = jobs(self.texts["quick"])
        self.assertIn("npm run test:science", quick["science-boundary"])
        self.assertNotIn("npm run test:science", quick["f4-gpa-integration"])
        self.assertIn("npm run test:integration:f4-gpa", quick["f4-gpa-integration"])
        self.assertIn("node: ['22', '24']", quick["node-smoke"])
        self.assertIn("fail-fast: false", quick["node-smoke"])
        self.assertIn("node-version: '22'", quick["compiled-compatibility"])
        boundary = quick["science-boundary"]
        for flag in ("DM_INSPECTOR_PANEL_REAL_TEST", "DM_PROBES_PANEL_REAL_TEST", "DM_PANEL_REAL_RECIPE_TEST"):
            self.assertIn(flag + ": '1'", boundary)
        f3b = jobs(self.texts["f3b"])["actual-diffsims-mcp"]
        for command in ("test_site_occupancy.py", "npm run test:twin", "npm run test:general-crystal", "npm run test:manual-crystal"):
            self.assertIn(command, f3b)

    def test_classifier_and_gate_regressions_always_run(self):
        self.assertIn("-p 'ci_*_test.py'", jobs(self.texts["quick"])["changes"])
        self.assertNotIn("unittest discover", jobs(self.texts["f3b"])["changes"])
        for text in self.texts.values():
            changes = jobs(text)["changes"]
            self.assertIn("fetch-depth: 0", changes)
            self.assertIn("BASE_SHA: ${{ github.event.pull_request.base.sha }}", changes)
            self.assertIn("HEAD_SHA: ${{ github.event.pull_request.head.sha }}", changes)
            self.assertIn("bash scripts/ci_scope.sh", changes)


if __name__ == "__main__":
    unittest.main(verbosity=2)
