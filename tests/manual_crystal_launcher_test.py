"""Manual qualification launcher contracts; no model/science or user config edits.

The child double applies the installed CLI's non-Git-directory preflight rule.
Actual scientific/calibration admission is separately qualified through MCP.
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "manual_crystal_launcher", ROOT / "tools" / "qualify_manual_crystal_agent.py"
)
LAUNCHER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAUNCHER)


class ManualLauncherTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="manual launcher non-git ")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.source = self.root / "synthetic input.tiff"
        self.source.write_bytes(b"Not decoded by this launcher-contract test")
        self.candidates = [self.root / (name + ".cif") for name in ("a", "b")]
        for candidate in self.candidates:
            candidate.write_text("data_contract_fixture\n", encoding="utf-8")
        task = {
            "source_path": str(self.source),
            "regions": [{"rect": [0, 0, 8, 8], "reason": "left"},
                        {"rect": [8, 0, 16, 8], "reason": "right"}],
            "xy_scale": {"x": .025, "y": -.025, "unit": "nm"},
            "calibration_source_text": "Explicit synthetic sampling; uncertainty unknown",
            "structure_candidates": [
                {"label": name, "source_path": str(candidate),
                 "zone_axis_uvw": [0, 0, 1], "in_plane_direction_uvw": [1, 0, 0],
                 "basis": "Finite synthetic hypothesis"}
                for name, candidate in zip(("a", "b"), self.candidates)
            ],
            "simulation_parameters": {}, "registration": {},
            "max_residual_inv_angstrom": .005,
        }
        self.task = self.root / "operator.json"
        self.task.write_text(json.dumps(task), encoding="utf-8")
        self.config = self.root / "plugin.json"
        self.config.write_text(json.dumps({"schema_version": 1, "python": sys.executable,
            "workspace_root": str(self.root / "science"), "structures": True}), encoding="utf-8")
        self.handoff = self.root / "handoff.json"
        self.handoff.write_text('{"request_id":"original-id"}', encoding="utf-8")
        self.launches = []

    def launch(self, *, panel=False, recovery=False):
        output = self.root / "new acceptance output"
        argv = ["qualify_manual_crystal_agent.py", "--config", str(self.config),
                "--output", str(output)]
        argv += ["--handoff", str(self.handoff)] if recovery else ["--input", str(self.task)]
        if panel:
            argv += ["--panel-id", "actual-saved-panel"]
        launches = self.launches

        class CodexChild:
            def __init__(self, command, **kwargs):
                self.returncode = 0 if "--skip-git-repo-check" in command else 1
                self.item = {"argv": command, "prompt": None}
                launches.append(self.item)
                if self.returncode:
                    kwargs["stderr"].write(
                        "Not inside a trusted directory and --skip-git-repo-check was not specified.\n"
                    )

            def communicate(self, prompt, timeout):
                self.item["prompt"] = prompt

        # Never inspect/copy a real global config or auth file in this test.
        user_config = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).resolve() / "config.toml"
        original_digest = LAUNCHER.digest

        def local_digest(path):
            return "unchanged-test-config" if Path(path) == user_config else original_digest(Path(path))

        sources_before = [path.read_bytes() for path in [self.source, *self.candidates]]
        with patch.object(sys, "argv", argv), patch.object(LAUNCHER.shutil, "which", side_effect=lambda name: sys.executable), \
                patch.object(LAUNCHER.subprocess, "Popen", CodexChild), patch.object(LAUNCHER, "digest", local_digest), \
                contextlib.redirect_stdout(io.StringIO()):
            result = LAUNCHER.main()
        self.assertEqual(result, 0)
        self.assertEqual(sources_before, [path.read_bytes() for path in [self.source, *self.candidates]])
        self.assertFalse((self.root / "science").exists())
        self.assertFalse((self.root / ".git").exists())
        return output, json.loads((output / "summary.json").read_text(encoding="utf-8"))

    def test_new_non_git_output_keeps_isolated_read_only_cli_policy(self):
        output, summary = self.launch()
        command = self.launches[0]["argv"]
        self.assertIn("--skip-git-repo-check", command)
        self.assertEqual(command[command.index("-C") + 1], str(output))
        self.assertEqual(command[command.index("--sandbox") + 1], "read-only")
        self.assertIn("--ignore-user-config", command)
        self.assertIn("--ephemeral", command)
        self.assertNotIn("--model", command)
        self.assertNotIn("-m", command)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", command)
        self.assertEqual(summary["actual_mcp_calls"], 0)
        self.assertTrue(summary["acceptance"].startswith("NOT_ASSESSED"))

    def test_panel_prompt_prepares_calibration_consistent_observation_before_science(self):
        output, summary = self.launch(panel=True)
        prompt = self.launches[0]["prompt"]
        task = json.loads(prompt.split("Operator task:\n", 1)[1].split("\n\n", 1)[0])
        self.assertNotIn("regions", task)
        self.assertEqual(task["panel_id"], "actual-saved-panel")
        self.assertNotIn("image_open", summary["allowed_tools"])
        self.assertNotIn("image_frame", summary["allowed_tools"])
        self.assertNotIn("image_panel_open", summary["allowed_tools"])
        # Regress the failure observed on the actual first pixel-only Panel:
        # an immutable old observation is not a future calibration binding.
        self.assertIn("original_observation_view_object_id, an immutable historical reference", prompt)
        self.assertIn("Before any FFT, measurement, simulation or comparison", prompt)
        self.assertIn("Only if the original saved observation is pixel-only", prompt)
        attach = prompt.index("Then call image_calibrate on original_observation_view_object_id")
        preview = prompt.index("Call image_preview on this wrapper", attach)
        verify = prompt.index("Verify the same calibration ID/revision", preview)
        show = prompt.index("image_panel_show the new saved view using those guards", verify)
        bind = prompt.index("Set observation_view_object_id to this NEW verified calibrated saved view", show)
        self.assertLess(bind, prompt.index("Continue from the following two explicitly operator-selected"))
        self.assertIn("exact source/frame and panel source extents", prompt)
        self.assertIn("original two annotation IDs, original anchors, reasons", prompt)
        self.assertIn("Do not replace an already correct calibration", prompt)
        self.assertIn("dirty draft or active gesture, stop", prompt)
        self.assertIn("verified calibration-consistent observation_view_object_id established before science", prompt)
        self.assertNotIn("pass the ORIGINAL saved observation_view_object_id", prompt)
        self.assertNotIn("analytic-truth-not-supplied", prompt)
        self.assertEqual((output / "prompt.txt").read_text(encoding="utf-8"), prompt)

    def test_query_only_recovery_does_not_gain_calibration_or_presentation_writes(self):
        _, summary = self.launch(recovery=True)
        prompt = self.launches[0]["prompt"]
        self.assertEqual(summary["allowed_tools"], LAUNCHER.RECOVERY_TOOLS)
        self.assertIn("Use query tools only; create no science, views", prompt)
        self.assertNotIn("Only if the original saved observation is pixel-only", prompt)
        self.assertIn("original-id", prompt)
        self.assertTrue(summary["query_only_recovery_bytes_unchanged"])


if __name__ == "__main__":
    unittest.main()
