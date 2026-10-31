"""Opt-in real Codex/MCP qualification; never invoked by the scientific worker.

Uses command-line overrides only. Global config/auth are neither copied nor
edited. Approval is scoped to named tools of this explicit synthetic workspace.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import uuid


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def mcp_settings(repo, config, node, recovery):
    """Independent allowlist with explicit per-tool approval, no global writes."""
    allowed = ["image_info", "image_result"]
    if not recovery:
        allowed += ["image_method_plan", "image_method_step", "image_method_next"]
    settings = {
        "approval_policy": "never",
        "mcp_servers.microscopy_workbench.command": str(Path(node).resolve()).replace("\\", "/"),
        "mcp_servers.microscopy_workbench.args": [str(repo / "dist/tools/plugin_server.mjs").replace("\\", "/"), "--config", str(config).replace("\\", "/")],
        "mcp_servers.microscopy_workbench.cwd": str(repo).replace("\\", "/"),
        "mcp_servers.microscopy_workbench.required": True,
        "mcp_servers.microscopy_workbench.startup_timeout_sec": 30,
        "mcp_servers.microscopy_workbench.tool_timeout_sec": 300,
        "mcp_servers.microscopy_workbench.enabled_tools": allowed,
        "mcp_servers.microscopy_workbench.default_tools_approval_mode": "prompt",
    }
    for tool in allowed:
        settings["mcp_servers.microscopy_workbench.tools." + tool + ".approval_mode"] = "approve"
    return allowed, settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path, help="Explicit independent plugin config")
    parser.add_argument("--output", required=True, type=Path, help="New acceptance directory")
    parser.add_argument("--seed", help="Saved fixed_g GPA ID for a new analysis")
    parser.add_argument("--handoff", type=Path, help="JSON references from the previous real session; read-only recovery")
    parser.add_argument("--codex", default=shutil.which("codex"))
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    if not args.codex or not args.node or bool(args.seed) == bool(args.handoff):
        parser.error("Supply available Codex/Node and exactly one of --seed or --handoff")
    repo = Path(__file__).resolve().parents[1]
    args.config = args.config.resolve(strict=True)
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    config_file = Path.home() / ".codex" / "config.toml"
    before = digest(config_file)
    recovery = args.handoff is not None
    request_prefix = "qualify-f4-" + uuid.uuid4().hex[:12] + "-"
    allowed, settings = mcp_settings(repo, args.config, args.node, recovery)
    sources = [repo / "skills/scientific-agent/microscopy-automation/SKILL.md",
               repo / "skills/scientific-agent/microscopy-automation/references/method-loop.md"]
    instructions = "\n\n".join("Provided public Skill context from " + str(p) + ":\n" + p.read_text(encoding="utf-8") for p in sources)
    common = """You are a fresh scientific runtime Agent qualifying an existing tool plugin, not its developer.
Use ONLY the configured microscopy_workbench MCP tools. Do not use shell, filesystem,
browser, web, implementation/oracle/report inspection, or scripts. The exact public Skill
context is supplied below, so no file read is necessary. Preserve source data, physical
unknowns and hypotheses. Do not force every method or identify a material dislocation.
If a tool is unavailable/denied, stop and report the actual blocker. Save all request IDs
before dispatch. Return concise JSON containing the actual original IDs, decision reasons,
root/plan/step/child references, budget spent, limits and reusable continuation references.
"""
    if recovery:
        question = """A previous session supplied the following handoff. Independently recover the
original requests and scientific evidence through the read-only MCP tools. Do not submit
new science, create a new budget root or repeat a method. Check that the saved decisions,
reserved costs, terminal state and conditional interpretation still agree. Explain what
can safely be continued. Do not trust the previous final prose as evidence: query its IDs.
Handoff:\n""" + args.handoff.read_text(encoding="utf-8")
    else:
        question = f"""Continue the bounded scientific question from saved GPA {args.seed}.
Decide whether further projected topology evidence is useful, inspect the saved evidence,
choose an applicable next action or request missing information/stop, and reassess after
each completed action. Do not follow a fixed list of methods. Use NEW root/next request IDs
beginning with {request_prefix} (step IDs must still use the tool's saved next_request_id).
Independent hypotheses supplied for this test:
followup_g_vectors=[[0.125,0],[0.125,0.125]], with basis 'Explicit candidate periodic
carrier directions in cycles/pixel; not confirmed material HKL'. The simple complete
projected closure model is only a working image model, not material-dislocation truth.
Permitted local oriented circuits: [80,80,176,176] and [64,64,192,192], both
positive_image_xy. Additional budget: method_calls=2, fft_pixels=0,
gpa_band_pixels=131072, topology_path_samples=5328. Reuse the existing source FFT.
Stop at the tool's finite conclusion, missing evidence, actual blocker or exhausted budget.
Include original plan/step/child request IDs and final object IDs for another NEW session.
"""
    prompt = common + "\n" + question + "\n\n" + instructions
    argv = [str(args.codex), "exec", "--ignore-user-config", "--ephemeral", "--json", "--sandbox", "read-only",
            "-C", str(args.output)]
    for name, value in settings.items():
        argv += ["-c", name + "=" + json.dumps(value, ensure_ascii=True)]
    argv += ["-o", str(args.output / "final.txt"), "-"]
    (args.output / "launch.json").write_text(json.dumps({"argv": argv, "mode": "recover" if recovery else "analyze",
        "new_request_prefix": None if recovery else request_prefix,
        "allowed_tools": allowed, "global_config_sha256_before": before,
        "provided_skills": [{"path": str(p), "sha256": digest(p)} for p in sources],
        "scope": "Direct MCP with exact provided Skill context, not automatic plugin discovery"}, indent=2), encoding="utf-8")
    (args.output / "test-policy-overrides.json").write_text(json.dumps(settings, indent=2), encoding="utf-8")
    (args.output / "prompt.txt").write_text(prompt, encoding="utf-8")
    start = time.monotonic()
    timed_out = False
    with (args.output / "events.jsonl").open("w", encoding="utf-8") as stdout, (args.output / "stderr.txt").open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr, text=True,
                                   encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            process.communicate(prompt, timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            process.terminate()  # This opt-in test's own CLI only, never a scientific host.
            process.wait(timeout=15)
    summary = {"exit_code": process.returncode, "timed_out": timed_out,
               "elapsed_seconds": time.monotonic()-start, "global_config_sha256_before": before,
               "global_config_sha256_after": digest(config_file), "allowed_tools": allowed,
               "acceptance": "NOT_ASSESSED: inspect real tool events and provider journals; exit0 alone is not a pass"}
    (args.output / "run-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return process.returncode or int(timed_out)


if __name__ == "__main__":
    raise SystemExit(main())
