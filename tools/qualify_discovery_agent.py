"""Opt-in real fresh-model test, separate from the scientific plugin runtime."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import time
import uuid

try:
    from .qualify_method_agent import digest, mcp_settings
except ImportError:
    from qualify_method_agent import digest, mcp_settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--handoff", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    codex, node = shutil.which("codex"), shutil.which("node")
    if not codex or not node or bool(args.source) == bool(args.handoff):
        parser.error("Installed Codex/Node and exactly one explicit source/handoff required")
    repo = Path(__file__).resolve().parents[1]
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    recovery = args.handoff is not None
    allowed, settings = mcp_settings(repo, args.config.resolve(strict=True), node, True)
    if not recovery:
        allowed = ["image_open","image_frame","image_preview","image_info","image_result","image_discovery",
                   "image_fft_batch","image_peaks","image_peak_measurements","image_discovery_review"]
    settings = {k:v for k,v in settings.items() if ".tools." not in k}
    settings["mcp_servers.microscopy_workbench.enabled_tools"] = allowed
    for tool in allowed:
        settings["mcp_servers.microscopy_workbench.tools."+tool+".approval_mode"] = "approve"
    sources = [repo/"skills/scientific-agent/microscopy-automation/SKILL.md",
               repo/"skills/scientific-agent/microscopy-automation/references/image-first.md"]
    instructions = "\n\n".join(p.read_text(encoding="utf-8") for p in sources)
    prefix = "f4b-"+uuid.uuid4().hex[:12]+"-"
    task = ("Recover this prior handoff using original request IDs and object reads only. Do not submit new science or repeat a discovery. Query the actual records rather than accepting prior prose:\n"+args.handoff.read_text(encoding="utf-8") if recovery else
            "Inspect the actual public input image "+str(args.source.resolve(strict=True))+" with the configured tools. No physical scale or material truth is supplied. "
            "Decide whether bounded image-first observation offers a useful ROI to inspect, choose an applicable existing FFT/peak/measurement route, "
            "retain a source-bound review and decide whether to stop or request missing information. No complete structure field is required. "
            "Budget: at most2 discovery calls, at most2 distinct window sizes32..128 per call, at most4 candidates, at most1 verification ROI/FFT "
            "of at most16384 pixels, at most4 detected peaks and2 saved peak measurements. Choose actual parameters from the image and evidence; "
            "do not force all steps if unsupported or no useful candidates. No researcher ROI is supplied, so do not invent a researcher statement using manual entry. "
            "New request IDs begin "+prefix+". Save each original ID before dispatch. Keep all attempts/costs, including a failed nomination. "
            "Return strict JSON with decisions, original source/frame/discovery/FFT/peaks/measurement/review IDs and request IDs, stop/missing-information reason and limits.")
    prompt = "You are a fresh scientific runtime Agent, not a developer. Use ONLY the configured local MCP tools. No shell, files, web, implementation/oracle/report inspection or scripts. Exact public Skill context is supplied below. Unknowns stay unknown; image morphology/FFT cannot confirm a material phase, twin or dislocation. If a tool is denied, report the actual blocker; do not bypass it.\n"+task+"\n\n"+instructions
    argv = [codex,"exec","--ignore-user-config","--ephemeral","--json","--sandbox","read-only","-C",str(args.output)]
    for key,value in settings.items():
        argv += ["-c",key+"="+json.dumps(value,ensure_ascii=True)]
    argv += ["-o",str(args.output/"final.txt"),"-"]
    config = Path.home()/".codex/config.toml"
    before = digest(config)
    (args.output/"launch.json").write_text(json.dumps({"argv":argv,"allowed_tools":allowed,"provided_skills":[{"path":str(p),"sha256":digest(p)} for p in sources]},indent=2),encoding="utf-8")
    (args.output/"prompt.txt").write_text(prompt,encoding="utf-8")
    started, timed_out = time.monotonic(), False
    with (args.output/"events.jsonl").open("w",encoding="utf-8") as out, (args.output/"stderr.txt").open("w",encoding="utf-8") as err:
        child = subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=out,stderr=err,text=True,encoding="utf-8",creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            child.communicate(prompt,timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            child.terminate()
            child.wait(timeout=15)
    result = {"exit_code":child.returncode,"timed_out":timed_out,"elapsed_seconds":time.monotonic()-started,
              "global_config_sha256_before":before,"global_config_sha256_after":digest(config),
              "allowed_tools":allowed,"acceptance":"NOT_ASSESSED: independently inspect actual model events and immutable provider records"}
    (args.output/"summary.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps(result,indent=2))
    return child.returncode or int(timed_out)


if __name__ == "__main__":
    raise SystemExit(main())
