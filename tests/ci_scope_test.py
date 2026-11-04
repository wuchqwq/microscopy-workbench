"""Real temporary-Git tests for CI scope; no scientific or third-party packages."""
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ci_scope import GROUPS, classify_paths, groups_for_path, scope

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ci_scope.sh"


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="microscopy-ci-scope-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q", "-b", "base")
        self.git("config", "user.name", "Scope test")
        self.git("config", "user.email", "scope-test@example.invalid")
        for name in ("README.md", "docs/manual.md", "lib/runner.mts"):
            self.write(name, "initial\n")
        self.base = self.commit()
        self.git("checkout", "-q", "-b", "topic")

    def git(self, *args):
        return subprocess.check_output(
            ["git", *args], cwd=self.root, text=True, stderr=subprocess.PIPE
        ).strip()

    def write(self, name, content="changed\n"):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def commit(self):
        self.git("add", "--all")
        self.git("commit", "-q", "-m", "test change")
        return self.git("rev-parse", "HEAD")

    def scope(self, *, event="pull_request", base=None, head=None):
        env = {**os.environ, "EVENT_NAME": event,
               "BASE_SHA": self.base if base is None else base,
               "HEAD_SHA": self.git("rev-parse", "HEAD") if head is None else head}
        result = subprocess.run(["bash", str(SCRIPT)], cwd=self.root, env=env,
                                capture_output=True, text=True, check=True)
        return dict(line.split("=", 1) for line in result.stdout.splitlines())

    @staticmethod
    def selected(result):
        return {group for group in GROUPS if result.get("run_" + group) == "true"}

    def test_ui_style_and_engineering_entry_are_scoped(self):
        for index, (path, expected) in enumerate((
                ("ui/image-panel/style.css", {"node"}),
                ("ui/image-panel/app.mts", {"node", "boundary"}),
                ("tools/researcher_inspector.mts", {"node", "boundary", "compat"}))):
            with self.subTest(path=path):
                self.git("checkout", "-q", "-b", "ui-%d" % index, self.base)
                self.write(path); self.commit()
                self.assertEqual(self.selected(self.scope()), expected)

    def test_known_groups_include_downstream_consumers(self):
        examples = {
            "tools/image_gpa_core.py": {"node", "gpa", "topology", "integration", "boundary"},
            "tools/image_topology_core.py": {"node", "topology", "integration", "boundary"},
            "tools/image_feature_field.py": {"node", "spatial", "active", "topology", "integration", "crystal", "boundary"},
            "crystallography/occupancy.py": {"node", "crystal", "compat", "boundary"},
            "tests/preview-recovery.test.mjs": {"node", "images", "boundary"},
            "tests/image-panel-ui.test.mjs": {"node"},
            "tests/image-panel-data-inspector.test.mjs": {"node", "boundary"},
            "tests/image-panel-data-probes.test.mjs": {"node", "boundary"},
            "tests/image-panel-presentation-transport.test.mjs": {"node", "boundary"},
            "tests/core-cross-window-contract.test.mjs": {"node"},
            "tests/image_core_cross_test.py": {"spatial"},
            "tests/image_point_observation_test.py": {"spatial"},
            "tests/point-observation-contract.test.mjs": {"node"},
        }
        for path, expected in examples.items():
            with self.subTest(path=path):
                self.assertEqual(groups_for_path(path), expected)

    def test_point_observation_checks_are_in_actual_execution_lists(self):
        root=Path(__file__).resolve().parents[1]
        self.assertIn("- run: python -B tests/image_point_observation_test.py", (root/".github/workflows/quick.yml").read_text())
        import json
        command=json.loads((root/"package.json").read_text())["scripts"]["test"]
        self.assertIn("dist/tests/point-observation-contract.test.mjs",command.split())

    def test_shared_unknown_and_unregistered_tests_expand(self):
        for path in ("scripts/build.mjs", "server.mts", "science-server.mts",
                     "lib/runtime/schema.mts", "lib/image_workspace.mts",
                     "tools/image_workspace.py", "tools/image_calibration.py",
                     "tools/image_peaks.py", "requirements-images.txt", "package-lock.json",
                     "tests/not-in-npm-catalog.test.mjs", "new/module.py",
                     "crystallography/capture.py", "crystallography/reflection_compare.py",
                     "ui/image-panel/roi-observations.mts", "ui/image-panel/result-semantics.mts",
                     "ui/image-panel/new-untested-module.mts", "crystallography/new_method.py",
                     "skills/example/helper.py", "skills/example/fixture.png",
                     "analysis/evidence.zip", "ui/new.bin", "../README.md", "/README.md"):
            with self.subTest(path=path):
                self.assertEqual(groups_for_path(path), set(GROUPS))

    def test_mixed_selection_is_union_not_last_path(self):
        self.assertEqual(classify_paths(["ui/image-panel/style.css", "crystallography/occupancy.py"]),
                         {"node", "crystal", "compat", "boundary"})
        self.assertEqual(classify_paths(["README.md", "lib/runtime/schema.mts"]), set(GROUPS))

    def test_known_code_rename_preserves_both_scopes(self):
        self.write("ui/old.css"); old = self.commit()
        self.git("mv", "ui/old.css", "docs/old.md"); self.commit()
        self.assertEqual(self.selected(self.scope(base=old)), {"node"})

    def test_broken_git_or_diff_cannot_suppress_checks(self):
        with patch("ci_scope.git", side_effect=OSError("git unavailable")):
            result = scope({"EVENT_NAME": "pull_request", "BASE_SHA": "x", "HEAD_SHA": "y"})
        self.assertEqual(self.selected(result), set(GROUPS))
        self.assertEqual(result["comparison_base"], "")

    def test_ref_option_injection_falls_back_to_full(self):
        self.assertEqual(self.selected(self.scope(base="--help")), set(GROUPS))

    def test_bilingual_readmes_are_light(self):
        self.write("README.md")
        self.write("README.zh-CN.md")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "false")

    def test_nested_markdown_is_light(self):
        self.write("docs/methods/new guide.md")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "false")

    def test_document_deletion_is_light(self):
        (self.root / "docs/manual.md").unlink()
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "false")

    def test_mixed_document_and_code_are_full(self):
        self.write("README.md")
        self.write("lib/runner.mts")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_agent_policy_is_light_skill_contracts_are_scoped(self):
        for index, (name, expected) in enumerate((
                ("AGENTS.md", set()),
                ("skills/example/SKILL.md", {"node", "client"}),
                ("lib/README.md", set(GROUPS)))):
            with self.subTest(path=name):
                self.git("checkout", "-q", "-b", "special-%d" % index, self.base)
                self.write(name)
                self.commit()
                self.assertEqual(self.selected(self.scope()), expected)

    def test_fixture_assets_are_not_exempt(self):
        for index, name in enumerate(("docs/examples/truth.json", "docs/examples/field.npy", "docs/examples/preview.png")):
            with self.subTest(path=name):
                self.git("checkout", "-q", "-b", "fixture-%d" % index, self.base)
                self.write(name)
                self.commit()
                self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_workflow_change_is_full(self):
        self.write(".github/workflows/quick.yml")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_code_rename_into_docs_is_full(self):
        self.git("mv", "lib/runner.mts", "docs/moved.md")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_document_rename_into_code_is_full(self):
        self.git("mv", "docs/manual.md", "lib/manual.mts")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_code_deletion_is_full(self):
        (self.root / "lib/runner.mts").unlink()
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_spaces_and_newlines_are_single_paths(self):
        self.write("docs/space and\nnewline.md")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "false")
        self.write("lib/new\nworker.mts")
        self.commit()
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_dispatch_or_unknown_event_is_full(self):
        for event in ("workflow_dispatch", "push", "merge_group", ""):
            with self.subTest(event=event):
                self.assertEqual(self.scope(event=event, base="", head="")["run_full_ci"], "true")

    def test_empty_diff_is_full(self):
        self.assertEqual(self.scope()["run_full_ci"], "true")

    def test_missing_or_unresolvable_refs_are_full(self):
        for base, head in (("", self.base), (self.base, ""), ("not-a-ref", self.base), (self.base, "not-a-ref")):
            with self.subTest(base=base, head=head):
                self.assertEqual(self.scope(base=base, head=head)["run_full_ci"], "true")

    def test_base_only_code_does_not_expand_pr_scope(self):
        self.write("README.md")
        head = self.commit()
        self.git("checkout", "-q", "base")
        self.write("lib/base-only.mts")
        advanced_base = self.commit()
        # Also exercise the checkout shape used by a pull_request merge ref.
        self.git("merge", "--no-edit", "topic")
        result = self.scope(base=advanced_base, head=head)
        self.assertEqual(result["run_full_ci"], "false")
        self.assertEqual(result["comparison_base"], self.base)


if __name__ == "__main__":
    unittest.main(verbosity=2)
