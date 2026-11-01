"""Unit/schema tests only. No model, MCP server, browser or scientific provider."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import numpy as np
import tifffile
import make_route_a_inputs as fixtures
import qualify_route_a_agent as launcher


class RuntimeDraftTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.inputs = fixtures.generate(self.root/"inputs")

    def tearDown(self):
        self.tmp.cleanup()

    def task_path(self, label="r17"):
        return self.inputs/"public"/(label+".task.json")

    def args(self, entry="image", label="r17"):
        repo = self.root/"fake-repository"
        for relative in launcher.SKILLS:
            p = repo/relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("Public stub Skill for schema selftest only.\n", encoding="utf-8")
        server = repo/"dist/tools/plugin_server.mjs"
        server.parent.mkdir(parents=True, exist_ok=True)
        server.write_text("// Test stub only; never executed.\n", encoding="utf-8")
        config = self.root/"plugin-config.json"
        launcher.dump(config, {"schema_version": 1, "python": "/not-executed/python", "workspace_root": str(self.root/"science"), "structures": True})
        return argparse.Namespace(repository=repo, config=config, task=self.task_path(label), output=self.root/"launch",
                                  entry=entry, panel_id="panel_test_123" if entry != "image" else None,
                                  continuation=None, node="/not-executed/node", codex="/not-executed/codex",
                                  model=None, dry_run=True)

    def test_all_nine_inputs_are_deterministic_float32_images_and_truth_is_separate(self):
        other = fixtures.generate(self.root/"second")
        tasks = launcher.read_json(self.inputs/"public/tasks.json")["tasks"]
        truth = launcher.read_json(self.inputs/"assessor/truth.json")
        self.assertEqual(len(tasks), 9)
        self.assertEqual(len({r["scenario"] for r in truth["records"]}), 9)
        for row in tasks:
            task = launcher.task_input(row["task_file"])
            image = tifffile.imread(task["source_path"])
            self.assertEqual(image.shape, (256, 256))
            self.assertEqual(image.dtype, np.float32)
            self.assertEqual(fixtures.sha(task["source_path"]), fixtures.sha(other/"public"/(row["task_id"]+".tiff")))
            self.assertTrue(np.isfinite(image).all())
            self.assertGreaterEqual(float(image.min()), 0)
            self.assertFalse({"truth", "seed", "scenario", "q_xy_cycles_per_pixel"} & set(task))
        self.assertFalse((self.inputs/"public/truth.json").exists())
        self.assertEqual(truth["records"][3]["q_xy_cycles_per_pixel"], [])
        # Positivity and zero-signal shape are generation invariants, not FFT tests.
        self.assertTrue(np.array_equal(fixtures.texture([], 0), np.ones((256, 256))))

    def test_explicit_projection_candidates_have_same_geometry_different_elements(self):
        a = (self.inputs/"public/reference-a.cif").read_text()
        b = (self.inputs/"public/reference-b.cif").read_text()
        self.assertEqual(a.replace("Cu", "Ni"), b)
        task = launcher.task_input(self.task_path("r95"))
        self.assertEqual(task["declared_calibration"]["xy_scale"], {"x": .0225, "y": -.0225, "unit": "nm"})
        self.assertEqual(len(task["structure_candidates"]), 2)
        self.assertEqual(task["comparison_conditions"]["registration"]["scale"], 1)

    def test_task_rejects_hidden_fields_and_mutated_source(self):
        value = launcher.read_json(self.task_path())
        value["truth"] = "must not enter prompt"
        path = self.root/"bad.json"
        launcher.dump(path, value)
        with self.assertRaisesRegex(ValueError, "public schema"):
            launcher.task_input(path)
        value.pop("truth")
        value["source_sha256"] = "0"*64
        launcher.dump(path, value)
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            launcher.task_input(path)

    def test_panel_prompt_reads_current_and_does_not_offer_source_reopen(self):
        args = self.args("panel")
        task, _, _, argv, prompt, allowed = launcher.prepare(args)
        self.assertNotIn(task["source_path"], prompt)
        self.assertIn("First call image_panel_current", prompt)
        self.assertNotIn("image_open", allowed)
        self.assertNotIn("image_frame", allowed)
        self.assertNotIn("image_panel_open", allowed)
        self.assertIn("read-only", argv)
        self.assertIn("--ignore-user-config", argv)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertFalse((self.root/"science").exists())
        self.assertNotIn("SCENARIOS", prompt)
        with self.assertRaises(FileExistsError):
            launcher.prepare(args)

    def test_continue_requires_exact_panel_and_reference_only_schema(self):
        args = self.args("continue", "r36")
        args.continuation = self.root/"continuation.json"
        value = {"schema_version": 1, "panel_id": "another_panel", "operator_message": "Test operator reports a saved edit; verify current state.",
                 "prior_references": [{"provider": "image", "object_id": "original_object", "request_id": "original_request"}]}
        launcher.dump(args.continuation, value)
        with self.assertRaisesRegex(ValueError, "Panel ID mismatch"):
            launcher.prepare(args)
        value["panel_id"] = args.panel_id
        launcher.dump(args.continuation, value)
        *_, prompt, _ = launcher.prepare(args)
        self.assertIn("original_request", prompt)
        self.assertIn("Human corrections supersede stale measurements", prompt)
        value["expected_answer"] = "hidden"
        launcher.dump(args.continuation, value)
        with self.assertRaisesRegex(ValueError, "public schema"):
            launcher.continuation_input(args.continuation)

    def test_missing_shared_workspace_skill_is_explicit(self):
        args = self.args()
        (args.repository/launcher.SKILLS[3]).unlink()
        with self.assertRaises(FileNotFoundError):
            launcher.prepare(args)
        self.assertFalse(args.output.exists())

    def test_cli_dry_run_never_spawns_process_or_science_workspace(self):
        args = self.args()
        with patch.object(launcher.subprocess, "Popen", side_effect=AssertionError("No model launch allowed")):
            result = launcher.main(["--repository", str(args.repository), "--config", str(args.config),
                                    "--task", str(args.task), "--output", str(args.output), "--dry-run",
                                    "--node", args.node, "--codex", args.codex])
        self.assertEqual(result, 0)
        summary = launcher.read_json(args.output/"summary.json")
        self.assertEqual(summary["model_execution"], "NOT_TESTED")
        self.assertEqual(summary["gui_gestures"], "NOT_TESTED")
        self.assertFalse((self.root/"science").exists())
        self.assertFalse((args.output/"events.jsonl").exists())

    def test_failed_event_is_recorded_even_when_outer_error_is_null(self):
        path = self.root/"failed-parser-fixture.jsonl"
        path.write_text(json.dumps({"type": "item.completed", "item": {"id": "bad", "type": "mcp_tool_call", "server": "microscopy_workbench", "tool": "image_preview", "status": "failed", "error": None, "result": {"content": [{"type": "text", "text": "Unexpected end of JSON input"}]}}}) + "\n")
        result = launcher.tool_events(path, launcher.TOOLS)
        self.assertEqual(result["completed_mcp_calls"][0]["status"], "failed")
        self.assertIsNone(result["completed_mcp_calls"][0]["error"])

    def test_synthetic_event_parser_marks_images_violations_and_unknown(self):
        # Fabricated parser fixtures, NEVER evidence of actual model/tool execution.
        events = [
            {"type": "item.started", "item": {"id": "pending", "type": "mcp_tool_call", "tool": "image_fft", "arguments": {"request_id": "original_unknown"}}},
            {"type": "item.completed", "item": {"id": "done", "type": "mcp_tool_call", "server": "microscopy_workbench", "tool": "image_preview", "arguments": {"request_id": "original_done"}, "result": {"content": [{"type": "image"}, {"type": "text", "text": "fixture"}]}}},
            {"type": "item.completed", "item": {"id": "shell", "type": "command_execution"}},
        ]
        path = self.root/"synthetic-parser-events.jsonl"
        path.write_text("\n".join(json.dumps(e) for e in events)+"\ninvalid JSON\n")
        result = launcher.tool_events(path, launcher.TOOLS)
        self.assertEqual(result["actual_image_blocks"], 1)
        self.assertEqual(result["completed_mcp_calls"][0]["arguments"]["request_id"], "original_done")
        self.assertEqual(result["unfinished_mcp_events"][0]["arguments"]["request_id"], "original_unknown")
        self.assertEqual(result["protocol_violations"][0]["type"], "command_execution")
        self.assertEqual(result["unparsed_event_lines"], [4])


if __name__ == "__main__":
    unittest.main(verbosity=2)
