"""Opt-in fresh Codex/MCP manual-ROI/crystal integration acceptance.

This is a test launcher, never a scientific-worker dependency or Agent runtime.
It does not edit/copy user config or auth and does not select a model. Exit zero
is not a scientific pass: inspect the actual calls and provider records.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid

try:
    from .qualify_method_agent import digest, mcp_settings
except ImportError:
    from qualify_method_agent import digest, mcp_settings


ANALYSIS_TOOLS = [
    "image_open", "image_frame", "image_calibrate", "image_preview", "image_info", "image_result",
    "image_discovery", "image_spatial_atlas", "image_discovery_review",
    "structure_open", "structure_orient", "structure_simulate", "structure_general_compare",
    "structure_info", "structure_result", "image_panel_open", "image_panel_current", "image_panel_show",
]
RECOVERY_TOOLS = ["image_info", "image_result", "structure_info", "structure_result", "image_panel_current"]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def provider_files(config):
    """Only the explicitly configured provider journals/objects, not user files."""
    settings = read_json(config)
    root = Path(settings["workspace_root"]).resolve()
    result = {}
    for provider in ("images", "structures"):
        for namespace in ("objects", "requests"):
            parent = root / provider / namespace
            if not parent.exists():
                continue
            for file in sorted(parent.rglob("*")):
                if file.is_file():
                    result[str(file.relative_to(root))] = digest(file)
    return result


def operator_input(path):
    value = read_json(path)
    required = {"source_path", "regions", "xy_scale", "calibration_source_text", "structure_candidates",
                "simulation_parameters", "registration", "max_residual_inv_angstrom"}
    if type(value) is not dict or set(value) != required:
        raise ValueError("Operator input must contain only the declared task fields; no truth/oracle/report fields")
    if type(value["regions"]) is not list or len(value["regions"]) != 2:
        raise ValueError("Provide exactly two operator-selected source-pixel ROI observations")
    for region in value["regions"]:
        if type(region) is not dict or set(region) != {"rect", "reason"}:
            raise ValueError("Each ROI needs exact source rect and actual operator reason")
    candidates = value["structure_candidates"]
    if type(candidates) is not list or len(candidates) != 2:
        raise ValueError("Provide two explicit finite candidate structures, not a hidden search")
    for candidate in candidates:
        if type(candidate) is not dict or set(candidate) != {"label", "source_path", "zone_axis_uvw", "in_plane_direction_uvw", "basis"}:
            raise ValueError("Candidate needs only explicit source/orientation/hypothesis basis")
        Path(candidate["source_path"]).resolve(strict=True)
    Path(value["source_path"]).resolve(strict=True)
    return value


def source_hashes(value):
    paths = [value["source_path"], *(row["source_path"] for row in value["structure_candidates"])]
    return {str(Path(path).resolve(strict=True)): digest(Path(path)) for path in paths}


def tool_events(path):
    calls, non_mcp, parse_errors = [], [], []
    for index, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            event = json.loads(line)
        except ValueError:
            parse_errors.append(index)
            continue
        item = event.get("item", {})
        if event.get("type") != "item.completed":
            continue
        if item.get("type") == "mcp_tool_call":
            content = (item.get("result") or {}).get("content", [])
            calls.append({"id": item.get("id"), "server": item.get("server"), "tool": item.get("tool"),
                          "arguments": item.get("arguments"), "error": item.get("error"),
                          "actual_image_blocks": sum(row.get("type") == "image" for row in content if type(row) is dict)})
        elif item.get("type") in ("command_execution", "web_search", "file_change"):
            non_mcp.append({"id": item.get("id"), "type": item.get("type")})
    return {"completed_mcp_calls": calls, "actual_image_blocks": sum(c["actual_image_blocks"] for c in calls),
            "non_mcp_actions": non_mcp, "unparsed_event_lines": parse_errors}


def prepare_public_fixture(directory):
    """Independent analytic test input, distinct from the integration smoke.

    Only operator-input.json goes to the model. The analytic truth file is for
    the independent acceptance assessor, not supplied context or tool output.
    """
    import numpy as np
    import tifffile
    from ase import Atoms
    from ase.io import write
    directory = directory.resolve()
    directory.mkdir(parents=True, exist_ok=False)
    edge, lattice = 96, 3.6
    yy, xx = np.mgrid[:edge, :edge]
    signal = sum(np.cos(2*np.pi*(fx*xx+fy*yy)) for fx, fy in ((.125, 0.), (0., .125), (.125, -.125)))
    values = np.concatenate([200+25*signal+.01*xx, 210+19*signal+.01*xx], axis=1).astype("float32")
    source = directory / "operator-texture.tiff"
    tifffile.imwrite(source, values, metadata=None)
    candidates = []
    sites = [[0,0,0], [0,.5,.5], [.5,0,.5], [.5,.5,0]]
    for label, cell in (("Candidate A", lattice), ("Candidate B", 4.8)):
        target = directory / ("candidate-a.cif" if label.endswith("A") else "candidate-b.cif")
        write(target, Atoms("Cu4", scaled_positions=sites, cell=np.eye(3)*cell, pbc=True), format="cif")
        candidates.append({"label": label, "source_path": str(target), "zone_axis_uvw": [0,0,1],
                           "in_plane_direction_uvw": [1,0,0],
                           "basis": "Finite supplied atomic candidate for geometric testing; not a material or orientation identification"})
    task = {"source_path": str(source),
            "regions": [{"rect": [0,0,edge,edge], "reason": "Synthetic test operator selects left periodic texture; physical explanation is unknown"},
                        {"rect": [edge,0,edge*2,edge], "reason": "Synthetic test operator selects neighboring right texture to compare; intensity change is not phase evidence"}],
            "xy_scale": {"x": .0225, "y": -.0225, "unit": "nm"},
            "calibration_source_text": "Explicit signed sampling of an independent public analytic test fixture, not experimental instrument calibration; uncertainty unspecified",
            "structure_candidates": candidates,
            "simulation_parameters": {"voltage_kv": 200, "reciprocal_radius_inv_angstrom": 1.1,
                                      "max_excitation_error_inv_angstrom": .02, "size": 64,
                                      "sigma_pixels": 1, "with_direct_beam": False, "native_float32": False},
            "registration": {"rotation_deg": 0, "scale": 1, "translation_inv_angstrom": [0,0], "flip_y": False,
                             "basis": "Declared shared Cartesian test frame with independently supplied signed XY scale; no candidate-dependent fit"},
            "max_residual_inv_angstrom": .005}
    truth = {"scope": "Independent analytic test truth; deliberately not supplied to the runtime Agent",
             "shape_yx": list(values.shape), "dtype": str(values.dtype), "cell_angstrom": lattice,
             "q_vectors_inv_angstrom": [[2/lattice,0], [0,2/lattice], [2/lattice,2/lattice]],
             "source_sha256": digest(source), "hypotheses_not_phase_identification": True}
    (directory/"operator-input.json").write_text(json.dumps(task, indent=2)+"\n", encoding="utf-8")
    (directory/"analytic-truth-not-supplied.json").write_text(json.dumps(truth, indent=2)+"\n", encoding="utf-8")
    print(str(directory/"operator-input.json"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--input", type=Path, help="Explicit operator task JSON, no numeric answers")
    parser.add_argument("--handoff", type=Path, help="Prior actual session references for query-only fresh recovery")
    parser.add_argument("--panel-id", help="Read the two actual saved ROI marks from this owned Panel instead of supplying their coordinates to the model")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--prepare-fixture", type=Path, help="Create a new public synthetic fixture only; no model run")
    args = parser.parse_args()
    if args.prepare_fixture:
        prepare_public_fixture(args.prepare_fixture)
        return 0
    codex, node = shutil.which("codex"), shutil.which("node")
    if not codex or not node or not args.config or not args.output or bool(args.input) == bool(args.handoff):
        parser.error("Installed Codex/Node, --config, --output and exactly one --input/--handoff required")
    repo = Path(__file__).resolve().parents[1]
    config = args.config.resolve(strict=True)
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    recovery = args.handoff is not None
    if args.panel_id and (recovery or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}",args.panel_id)):
        parser.error("--panel-id requires an analysis and an exact bounded Panel identity")
    task = None if recovery else operator_input(args.input.resolve(strict=True))
    allowed = list(RECOVERY_TOOLS if recovery else ANALYSIS_TOOLS)
    if args.panel_id:
        # The existing Panel already holds the exact frame/selection. This test
        # does not authorize another capture or helper instead of that state.
        allowed = [tool for tool in allowed if tool not in ("image_open", "image_frame", "image_panel_open")]
    _, settings = mcp_settings(repo, config, node, True)
    settings = {key:value for key,value in settings.items() if ".tools." not in key}
    settings["mcp_servers.microscopy_workbench.enabled_tools"] = allowed
    for tool in allowed:
        settings["mcp_servers.microscopy_workbench.tools."+tool+".approval_mode"] = "approve"
    paths = [repo/"skills/scientific-agent/microscopy-automation/SKILL.md",
             repo/"skills/scientific-agent/microscopy-automation/references/image-first.md",
             repo/"skills/scientific-agent/microscopy-automation/references/manual-crystal.md",
             repo/"skills/scientific-agent/crystallography-compare/SKILL.md",
             repo/"skills/scientific-agent/crystallography-compare/references/general-evidence.md"]
    instructions = "\n\n".join("Provided public Skill: "+str(path)+"\n"+path.read_text(encoding="utf-8") for path in paths)
    prefix = "manual-crystal-"+uuid.uuid4().hex[:10]+"-"
    model_task = dict(task) if task else None
    selection_note = ""
    if args.panel_id:
        model_task.pop("regions")
        model_task["panel_id"] = args.panel_id
        selection_note = ("First read image_panel_current for the supplied Panel ID. Prefer its actual read-only roi_handoff packet: use the two usable saved_rectangles with original_anchor and canonical rect_xyxy, keeping their IDs/text/status/reasons. No ROI coordinates are supplied in this prompt. Check source/frame/current calibration binding against the stated input. Use scientific_input.direct_input_object_id when supplied; if scientific_input.prepare_call is supplied, save a new request ID then call that exact image_calibrate recipe to attach the existing calibration record, not a newly declared scale. Do not round raw annotation coordinates yourself, reopen the TIFF, replace an already correct calibration, invent marks, or substitute an unsaved gesture/current selection for saved rectangles. If the packet has fewer than two usable adjacent saved rectangles or invalid binding, report the actual blocker. Use those packet-recorded rectangles and qualified scientific input for the manual observation and exact two-window atlas. ")
    question = ("A prior session supplied this handoff. Independently recover the actual original request outcomes, saved observation/FFT/measurement/review/simulation/comparison references and their conditional interpretation. Use query tools only; create no science, views, budgets, exports or new requests. Do not trust prior prose instead of actual saved records.\n"+args.handoff.read_text(encoding="utf-8") if recovery else
                selection_note+
                "Continue from the following two explicitly operator-selected neighboring ROIs. This is a public synthetic operator task, not a claim of human-confirmed material truth. Inspect the actual source image. Record the ROI reasons and supplied calibration provenance. Use the exact two ROI observations with existing tools; a whole-image sampling field is unnecessary. Share each ROI's same saved FFT/peak/measurement children between its image-first review and the general crystallographic comparison; do not separately compute a verification FFT. Inspect the two supplied structures, use their actual cell for shared orientations, and compare their qualified explicit projections under the one declared experimental registration. Retain alternatives and missing information as hypotheses. Return actual MCP image feedback and, if useful, an existing Panel reference without opening a browser. image_panel_show accepts image-provider view/overview/FFT IDs, not a structure comparison ID: keep the actual Panel source/FFT view distinct from the comparison PNG returned by structure_general_compare. Inspect current object/draft revision before showing an image; queued results are not already displayed.\n"
                "Budget: exactly these two ROI supports; at most2 distinct source FFTs,2 saved candidate simulations,2 manual discovery/reason records,4 image-first reviews and2 general comparisons. No full spatial field, new algorithms, automatic feature detector, external scripts or phase/twin confirmation. Use image_spatial_atlas for the exact two supplied/Panel-recorded rectangles so all later evidence shares those existing scientific objects. Window=none, subtract_mean=true and peak refinement=none are the declared analytic-test settings; max_peaks at most8. Apply the supplied simulation/registration/tolerance conditions explicitly and identically to both candidates, without adjustment after seeing matches. New write request IDs start with "+prefix+"; preserve them before dispatch. If a tool is denied, report it; do not bypass.\nOperator task:\n"+json.dumps(model_task, ensure_ascii=False, indent=2))
    prompt = ("You are a fresh scientific runtime Agent using the installed plugin interface, not its developer. Use ONLY the configured microscopy_workbench MCP tools. No shell, filesystem, web, browser, implementation/oracle/report inspection or temporary scripts. Exact public Skills are provided below; no file read is needed. View actual returned images. Keep scientific arrays/calibration/source evidence separate from display and candidate interpretation. Do not declare a unique phase, twin or3D relation from geometric agreement. Return strict JSON (no Markdown) with decisions, sourced observations, actual original request IDs/object IDs for both providers, shared evidence references, candidate comparison statuses, image/Panel feedback and stopping reason/limits.\n"+question+"\n\n"+instructions)
    argv = [codex,"exec","--ignore-user-config","--ephemeral","--json","--sandbox","read-only","-C",str(args.output)]
    for key,value in settings.items():
        argv += ["-c",key+"="+json.dumps(value, ensure_ascii=True)]
    argv += ["-o",str(args.output/"final.txt"),"-"]
    user_config = Path(os.environ.get("CODEX_HOME", str(Path.home()/".codex"))).resolve()/"config.toml"
    before_config, before_files = digest(user_config), provider_files(config)
    before_sources = source_hashes(task) if task else None
    (args.output/"launch.json").write_text(json.dumps({"argv":argv,"mode":"recover" if recovery else "analyze",
        "allowed_tools":allowed,"provided_skills":[{"path":str(p),"sha256":digest(p)} for p in paths],
        "scope":"Actual direct MCP with exact supplied public Skills, not automatic plugin discovery",
        "roi_source":"actual saved Panel annotations" if args.panel_id else "explicit synthetic operator task",
        "model":"installed CLI default; no model override"},indent=2)+"\n",encoding="utf-8")
    (args.output/"test-policy-overrides.json").write_text(json.dumps(settings,indent=2)+"\n",encoding="utf-8")
    (args.output/"prompt.txt").write_text(prompt,encoding="utf-8")
    (args.output/"provider-before.json").write_text(json.dumps(before_files,indent=2)+"\n",encoding="utf-8")
    started,timed_out=time.monotonic(),False
    with (args.output/"events.jsonl").open("w",encoding="utf-8") as stdout,(args.output/"stderr.txt").open("w",encoding="utf-8") as stderr:
        child=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=stdout,stderr=stderr,text=True,encoding="utf-8",errors="replace",creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            child.communicate(prompt,timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out=True;child.terminate();child.wait(timeout=15)
    after_files=provider_files(config)
    events=tool_events(args.output/"events.jsonl")
    (args.output/"actual-tool-events.json").write_text(json.dumps(events,indent=2)+"\n",encoding="utf-8")
    (args.output/"provider-after.json").write_text(json.dumps(after_files,indent=2)+"\n",encoding="utf-8")
    result={"exit_code":child.returncode,"timed_out":timed_out,"elapsed_seconds":time.monotonic()-started,
            "global_config_sha256_before":before_config,"global_config_sha256_after":digest(user_config),
            "source_sha256_before":before_sources,"source_sha256_after":source_hashes(task) if task else None,
            "provider_files_before":len(before_files),"provider_files_after":len(after_files),
            "all_prior_provider_files_unchanged":all(after_files.get(k)==v for k,v in before_files.items()),
            "query_only_recovery_bytes_unchanged":before_files==after_files if recovery else None,
            "allowed_tools":allowed,"actual_mcp_calls":len(events["completed_mcp_calls"]),"actual_image_blocks":events["actual_image_blocks"],
            "non_mcp_actions":events["non_mcp_actions"],
            "acceptance":"NOT_ASSESSED: independently inspect actual model calls, immutable provider references and scientific truth; exit0 is not PASS"}
    (args.output/"summary.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,indent=2))
    return child.returncode or int(timed_out)


if __name__ == "__main__":
    raise SystemExit(main())
