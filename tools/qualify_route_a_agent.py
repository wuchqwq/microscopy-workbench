"""Opt-in, bounded Codex/MCP test launcher; not an Agent framework.

No model runs without --run-model. --dry-run only validates and writes a plan.
The model receives public tasks/Skills, never assessor truth or implementation.
Global Codex config/auth are neither read nor written by this launcher.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid

TASK_KEYS = {"schema_version", "task_id", "source_path", "source_sha256", "frame_index",
             "question", "material_context", "declared_calibration", "structure_candidates",
             "comparison_conditions", "budget"}
BUDGET_KEYS = {"maximum_roi_supports", "maximum_distinct_ffts", "maximum_simulations", "maximum_science_calls"}
CANDIDATE_KEYS = {"label", "source_path", "zone_axis_uvw", "in_plane_direction_uvw", "basis"}
TOOLS = [
    "image_open", "image_frame", "image_preview", "image_info", "image_result", "image_context",
    "image_calibrate", "image_fft", "image_peaks", "image_peak_measurements", "image_measure",
    "image_remeasure", "image_annotate", "image_spatial_atlas", "image_local_signature_compare",
    "image_feature_field", "image_panel_open", "image_panel_current", "image_panel_show",
    "image_panel_evidence", "structure_open", "structure_orient", "structure_simulate",
    "structure_general_compare", "structure_compare", "structure_compare_batch", "structure_info", "structure_result",
]
SKILLS = [
    "skills/scientific-agent/microscopy-router/SKILL.md",
    "skills/scientific-agent/microscopy-automation/SKILL.md",
    "skills/scientific-agent/microscopy-automation/references/peak-quality.md",
    "skills/scientific-agent/microscopy-automation/references/route-a-decisions.md",
    "skills/scientific-agent/microscopy-automation/references/shared-workspace.md",
    "skills/scientific-agent/microscopy-automation/references/image-first.md",
    "skills/scientific-agent/microscopy-observe-revise/SKILL.md",
    "skills/scientific-agent/crystallography-compare/references/general-evidence.md",
]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dump(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+"\n", encoding="utf-8")


def exact(value, keys, label):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError(label+" must contain exactly its public schema fields")


def explicit_file(path):
    p = Path(path)
    if not p.is_absolute() or not p.is_file():
        raise ValueError("An explicit absolute regular file is required")
    return p.resolve(strict=True)


def task_input(path):
    value = read_json(path)
    exact(value, TASK_KEYS, "task")
    if value["schema_version"] != 1 or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value["task_id"]):
        raise ValueError("Unknown task schema/ID")
    source = explicit_file(value["source_path"])
    if sha(source) != value["source_sha256"]:
        raise ValueError("Public source hash mismatch")
    if type(value["frame_index"]) is not int or value["frame_index"] < 0:
        raise ValueError("frame_index is a zero-based nonnegative integer")
    exact(value["budget"], BUDGET_KEYS, "budget")
    if any(type(v) is not int or v <= 0 for v in value["budget"].values()):
        raise ValueError("Positive finite integer budgets are required")
    calibration = value["declared_calibration"]
    if calibration is not None:
        exact(calibration, {"xy_scale", "source_text"}, "declared calibration")
        exact(calibration["xy_scale"], {"x", "y", "unit"}, "xy scale")
    if type(value["structure_candidates"]) is not list or len(value["structure_candidates"]) > 3:
        raise ValueError("At most three explicit finite candidates")
    for candidate in value["structure_candidates"]:
        exact(candidate, CANDIDATE_KEYS, "candidate")
        explicit_file(candidate["source_path"])
    conditions = value["comparison_conditions"]
    if conditions is not None:
        exact(conditions, {"registration", "max_residual_inv_angstrom", "simulation_parameters"}, "comparison conditions")
        exact(conditions["registration"], {"rotation_deg", "scale", "translation_inv_angstrom", "flip_y", "basis"}, "registration")
        exact(conditions["simulation_parameters"], {"voltage_kv", "reciprocal_radius_inv_angstrom", "max_excitation_error_inv_angstrom", "size", "sigma_pixels", "with_direct_beam", "native_float32"}, "simulation parameters")
    # Reject non-finite inputs instead of producing non-standard JSON.
    json.dumps(value, allow_nan=False)
    return value


def continuation_input(path):
    """References only; no previous final answer or hidden assessor fields."""
    value = read_json(path)
    exact(value, {"schema_version", "panel_id", "operator_message", "prior_references"}, "continuation")
    if value["schema_version"] != 1 or type(value["prior_references"]) is not list:
        raise ValueError("Unknown continuation schema")
    for row in value["prior_references"]:
        exact(row, {"provider", "object_id", "request_id"}, "prior reference")
        if row["provider"] not in ("image", "structure"):
            raise ValueError("Unknown reference provider")
    return value


def provider_files(config):
    root = Path(read_json(config)["workspace_root"]).resolve()
    return {str(p.relative_to(root)): sha(p)
            for provider in ("images", "structures") for namespace in ("objects", "requests")
            for p in sorted((root/provider/namespace).rglob("*")) if p.is_file()}


def source_hashes(task):
    return {str(explicit_file(p)): sha(p) for p in [task["source_path"],
            *(c["source_path"] for c in task["structure_candidates"])]}


def tool_events(path, allowed):
    calls, violations, errors, pending = [], [], [], {}
    for number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        try:
            event = json.loads(line)
        except ValueError:
            errors.append(number)
            continue
        item = event.get("item") or {}
        kind = item.get("type")
        if kind == "mcp_tool_call":
            if event.get("type") == "item.started":
                pending[item.get("id", str(number))] = item
            if event.get("type") != "item.completed":
                continue
            pending.pop(item.get("id"), None)
            content = (item.get("result") or {}).get("content", [])
            calls.append({"id": item.get("id"), "server": item.get("server"), "tool": item.get("tool"),
                          "arguments": item.get("arguments"), "error": item.get("error"),
                          "status": item.get("status"), "result_is_error": (item.get("result") or {}).get("isError"),
                          "actual_image_blocks": sum(r.get("type") == "image" for r in content if type(r) is dict)})
            if item.get("server") != "microscopy_workbench" or item.get("tool") not in allowed:
                violations.append({"id": item.get("id"), "type": "unpermitted_mcp", "tool": item.get("tool")})
        elif kind in ("command_execution", "web_search", "file_change") and event.get("type") == "item.completed":
            violations.append({"id": item.get("id"), "type": kind})
    return {"completed_mcp_calls": calls, "actual_image_blocks": sum(c["actual_image_blocks"] for c in calls),
            "protocol_violations": violations, "unparsed_event_lines": errors,
            "unfinished_mcp_events": list(pending.values()),
            "scope": "MCP-returned image blocks are not browser gestures or proof that a GUI was seen"}


def build_prompt(task, entry, panel_id, continuation, skill_text, prefix):
    public = dict(task)
    opening = "Use formal tools to open the supplied image and its zero-based frame, inspect actual returned images, and open a Panel for this same scientific workspace. Record its exact Panel ID."
    if entry in ("panel", "continue"):
        # Do not offer reopening a raw source as a way around dirty/stale state.
        public.pop("source_path")
        opening = "First call image_panel_current for exact Panel ID "+panel_id+". Read actual current saved view, annotations, calibration, interaction_gate, draft revision and evidence currentness. Do not reopen a source or create a replacement Panel. Saved human ROI choices retain their actor/reasons; any new Agent ROI choice must be identified as Agent proposed."
    if entry == "continue":
        opening += " Reread current state after the reported human intervention. Query each supplied old request/object outcome before deciding what remains usable. Human corrections supersede stale measurements; preserve old IDs/interpretations as history. New analyses require fresh request IDs."
    return """You are a fresh scientific analysis assistant, not a developer or truth assessor.
Use ONLY the configured microscopy_workbench MCP tools. No shell, filesystem, browser, web,
source-code, generator, oracle, report inspection or temporary script. Exact public Skills are
supplied below. Inspect actual image blocks returned by the tools; never claim GUI gestures.

Choose a bounded, justified analysis yourself: ROI support, peak hypotheses, preprocessing
contrasts, measurements and finite candidate explanations as appropriate. No required fixed
algorithm chain; a whole-image field, GPA/topology or simulation is not a prerequisite.
The task budget is a resource limit, not a scientific threshold. A candidate may remain a
working hypothesis without simulation. Do not make up material context, numeric SNR,
localization error, statistical significance, calibrated probability or supplied calibration.
Without calibration stay in pixels/cycles-per-pixel. Numerical validity is not measurement
qualification or physical confirmation. Processing contrasts of one image share evidence.
Do not keep lowering thresholds to obtain the expected answer or invent an expected answer.
Near/weak peaks may remain unresolved/unknown; a conditional number can still be reported.
Finite projection compatibility cannot uniquely establish phase, twin, defect or 3D geometry.
Record the basis of any preference and incompatible/undistinguished alternatives. Do not
plan further microscopy experiments. Missing qualifications restrict the corresponding
claim, not all observations or candidate discussion. Do not fabricate a physical diagnosis.

Respect actual Panel dirty drafts, currentness, source/calibration binding, pending saves and
expected-object/revision guards. Reread immediately before presentation. A dirty/changed
state must not be discarded or silently overwritten; report the blocker or query its outcome.
Preserve existing correctly sourced calibration; a conflicting scale is not permission to
replace it. Apply only explicitly supplied calibration to new records where appropriate.
Record authored notes as declared actor text (Agent proposal / test-operator intervention),
not as authenticated authorship or twinning confirmation. Do not populate twinning authority
as a generic notebook workaround. Reuse immutable scientific references; do not edit history.
Save original request IDs before dispatch. For unknown/timeouts query the ORIGINAL ID;
never replay its side effect or create a duplicate request just to obtain a successful reply.
If an advertised tool is denied/unavailable report it without an alternate access path.
New request IDs use prefix: """+prefix+"\n"+opening+"""

Return strict JSON with: decisions (selection, reason, evidence_refs, actual_action_refs,
result, remaining_unknown), sourced_observations, numerical_checks, measurement_reliability,
candidate_interpretations, actual original requests/objects, panel_feedback, budget_used,
and stopping_reason. Unassessed reliability is not failure. Indicate claim-specific missing
evidence. Return only actual IDs/results; unsuccessful/unknown requests remain visible.

Public research task:\n"""+json.dumps(public, ensure_ascii=False, indent=2)+(
        "\nContinuation references (not authoritative results):\n"+json.dumps(continuation, ensure_ascii=False, indent=2) if continuation else "")+"\n\n"+skill_text


def prepare(args):
    repo = args.repository.resolve(strict=True)
    config = explicit_file(args.config)
    settings_data = read_json(config)
    required = {"schema_version", "python", "workspace_root", "structures"}
    if not required <= set(settings_data) or set(settings_data)-required-{"structure_python"}:
        raise ValueError("Explicit plugin config schema required")
    if settings_data["schema_version"] != 1 or not Path(settings_data["workspace_root"]).is_absolute():
        raise ValueError("Config requires absolute independent workspace_root")
    task = task_input(args.task)
    if task["structure_candidates"] and settings_data["structures"] is not True:
        raise ValueError("Structure candidates require an explicitly enabled structure provider")
    if args.entry in ("panel", "continue") and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", args.panel_id or ""):
        raise ValueError("Panel/continue requires an exact bounded Panel identity")
    if args.entry == "image" and args.panel_id:
        raise ValueError("image entry opens a new Panel; do not supply an old identity")
    continuation = continuation_input(args.continuation) if args.continuation else None
    if (args.entry == "continue") != (continuation is not None):
        raise ValueError("Only continue mode requires --continuation")
    if continuation and continuation["panel_id"] != args.panel_id:
        raise ValueError("Continuation Panel ID mismatch")
    paths = [repo/relative for relative in SKILLS]
    # Deliberately fail until #54 shared-workspace and reviewed peak-quality
    # references coexist in the independent integration tree.
    skill_text = "\n\n".join("Provided public Skill: "+relative+"\n"+path.read_text(encoding="utf-8") for relative, path in zip(SKILLS, paths))
    executable = repo/"dist/tools/plugin_server.mjs"
    explicit_file(executable)
    allowed = list(TOOLS)
    if args.entry != "image":
        allowed = [t for t in allowed if t not in ("image_open", "image_frame", "image_panel_open")]
    if not settings_data["structures"]:
        allowed = [t for t in allowed if not t.startswith("structure_")]
    settings = {
        "approval_policy": "never",
        "mcp_servers.microscopy_workbench.command": str(Path(args.node).resolve()),
        "mcp_servers.microscopy_workbench.args": [str(executable), "--config", str(config)],
        "mcp_servers.microscopy_workbench.cwd": str(repo),
        "mcp_servers.microscopy_workbench.required": True,
        "mcp_servers.microscopy_workbench.startup_timeout_sec": 30,
        "mcp_servers.microscopy_workbench.tool_timeout_sec": 300,
        "mcp_servers.microscopy_workbench.enabled_tools": allowed,
        "mcp_servers.microscopy_workbench.default_tools_approval_mode": "prompt",
    }
    for tool in allowed:
        settings["mcp_servers.microscopy_workbench.tools."+tool+".approval_mode"] = "approve"
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    prefix = "route-a-"+uuid.uuid4().hex[:10]+"-"
    prompt = build_prompt(task, args.entry, args.panel_id, continuation, skill_text, prefix)
    argv = [args.codex, "exec", "--ignore-user-config", "--skip-git-repo-check", "--ephemeral", "--json", "--sandbox", "read-only", "-C", str(output)]
    if args.model:
        argv += ["--model", args.model]
    for key, value in settings.items():
        argv += ["-c", key+"="+json.dumps(value, ensure_ascii=True)]
    argv += ["-o", str(output/"final.txt"), "-"]
    dump(output/"launch.json", {"argv": argv, "entry": args.entry, "panel_id": args.panel_id,
         "task_sha256": sha(args.task), "request_prefix": prefix, "allowed_tools": allowed,
         "provided_skills": [{"path": str(p), "sha256": sha(p)} for p in paths],
         "model_requested": args.model or "CLI default (identity not yet observed)",
         "scope": "Explicit public Skills and authorized synthetic tool allowlist; not automatic Skill discovery",
         "global_config": "Not read or written by launcher; --ignore-user-config supplied",
         "dry_run": args.dry_run})
    dump(output/"test-policy-overrides.json", settings)
    (output/"prompt.txt").write_text(prompt, encoding="utf-8")
    return task, config, output, argv, prompt, allowed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--task", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--entry", choices=("image", "panel", "continue"), default="image")
    parser.add_argument("--panel-id")
    parser.add_argument("--continuation", type=Path)
    parser.add_argument("--model", help="Explicit requested model; not proof of actual identity")
    parser.add_argument("--codex", default=shutil.which("codex"))
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--timeout", type=int, default=900)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--run-model", action="store_true")
    args = parser.parse_args(argv)
    if not args.codex or not args.node or args.timeout <= 0:
        parser.error("Available Codex/Node and a positive timeout are required")
    task, config, output, command, prompt, allowed = prepare(args)
    if args.dry_run:
        dump(output/"summary.json", {"model_execution": "NOT_TESTED", "mcp_execution": "NOT_TESTED", "gui_gestures": "NOT_TESTED", "scope": "Schema/launch-plan preparation only"})
        print(str(output))
        return 0
    before_files, before_sources = provider_files(config), source_hashes(task)
    dump(output/"provider-before.json", before_files)
    started, timed_out = time.monotonic(), False
    with (output/"events.jsonl").open("w", encoding="utf-8") as stdout, (output/"stderr.txt").open("w", encoding="utf-8") as stderr:
        child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr, text=True, encoding="utf-8", errors="replace")
        try:
            child.communicate(prompt, timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            child.terminate()
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    after_files, after_sources = provider_files(config), source_hashes(task)
    events = tool_events(output/"events.jsonl", allowed)
    dump(output/"actual-tool-events.json", events)
    dump(output/"provider-after.json", after_files)
    summary = {"exit_code": child.returncode, "timed_out": timed_out, "elapsed_seconds": time.monotonic()-started,
               "source_sha256_before": before_sources, "source_sha256_after": after_sources,
               "all_prior_provider_files_unchanged": all(after_files.get(k) == v for k, v in before_files.items()),
               "sources_unchanged": before_sources == after_sources,
               "actual_mcp_calls": len(events["completed_mcp_calls"]), "actual_image_blocks": events["actual_image_blocks"],
               "failed_mcp_event_count": sum(c.get("status") == "failed" or c.get("result_is_error") is True for c in events["completed_mcp_calls"]),
               "protocol_violations": events["protocol_violations"], "unparsed_event_lines": events["unparsed_event_lines"],
               "unfinished_mcp_events": events["unfinished_mcp_events"],
               "gui_gestures": "NOT_TESTED by this launcher; requires separate browser evidence",
               "scientific_acceptance": "NOT_ASSESSED: independently review calls, provider records, bounded choices and hidden truth. Exit zero is not PASS."}
    dump(output/"summary.json", summary)
    print(json.dumps(summary, indent=2))
    return child.returncode or int(timed_out) or int(bool(events["protocol_violations"] or events["unparsed_event_lines"]))


if __name__ == "__main__":
    raise SystemExit(main())
