"""Real temporary-Git tests for CI scope; no scientific or third-party packages."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

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

    def test_agent_skill_and_nested_readme_are_not_exempt(self):
        for index, name in enumerate(("AGENTS.md", "skills/example/SKILL.md", "lib/README.md")):
            with self.subTest(path=name):
                self.git("checkout", "-q", "-b", "special-%d" % index, self.base)
                self.write(name)
                self.commit()
                self.assertEqual(self.scope()["run_full_ci"], "true")

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
        for event in ("workflow_dispatch", "push", ""):
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
