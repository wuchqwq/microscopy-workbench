"""Explicit new Task A observation/export from unchanged transferred saved GPA.

Copies the original workspace to a NEW output directory. Does not repair/resave
historical records, relocate old PNG pointers or execute source FFT/GPA again.
"""
import argparse
import json
from pathlib import Path
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker


def run(payload, output, resume=False):
    assert payload.is_dir() and (output.is_dir() if resume else not output.exists())
    inventory = worker.read_json(payload / "MANIFEST.json")["files"]
    before = {name: worker.sha_file(payload / name) for name in inventory}
    assert before == {name: item["sha256"] for name, item in inventory.items()}
    if not resume: output.mkdir(parents=True)
    assert not (output / "receipt.json").exists()
    workspace = output / "workspace"
    source = payload / "hrtem-baseline-integration" / "positive" / "workspace"
    if not resume: shutil.copytree(source, workspace)
    protected = {str(p.relative_to(source)): worker.sha_file(p) for p in source.rglob("*") if p.is_file()}
    historical_id = "ec1a8c8a062b49eaba3ce4250204ff72"
    historical = worker.read_json(workspace / "objects" / historical_id / "object.json")
    def call(action, **args):
        result = worker.execute(dict(workspace=str(workspace), action=action, **args))
        assert result["ok"], result
        return result["result"]
    old = call("get", object_id=historical_id)
    assert all(old[key] == value for key, value in historical.items())
    # This is an explicit NEW observation over saved bands, not a migrated
    # historical decision. Preserve the original saved plan and its old pointers.
    parameters = dict(object_ids=historical["seed_object_ids"], information=historical["information"],
                      budget={"method_calls": 0, "fft_pixels": 0, "gpa_band_pixels": 0, "topology_path_samples": 0})
    plan = (call("result", query_request_id="closeout-transferred-band-observation") if resume else
            call("method_plan", request_id="closeout-transferred-band-observation", **parameters))
    report = plan["decision"]["peak_comparison"]
    assert report["status"] == "observed" and plan["actions"] == []
    for index, peak in enumerate(report["peaks"]):
        assert abs(peak["amplitude_ratio"] - 1.6) <= .003
        assert abs(peak["phase_difference_wrapped_rad"] - (.4 if index == 0 else -.4)) <= .003
    exported = (call("result", query_request_id="closeout-transferred-band-export") if resume else
                call("export", request_id="closeout-transferred-band-export", object_id=plan["object_id"], output_dir=str(output / "export")))
    for name, digest in exported["exported_files_sha256"].items():
        assert worker.sha_file(output / "export" / name) == digest
    assert (output / "export" / "peak-comparison.txt").is_file()
    assert (output / "export" / "preview.png").read_bytes() == (workspace / "objects" / plan["object_id"] / "preview.png").read_bytes()
    # Returned compatibility receipts describe this read operation, not saved
    # plan content. Bind every authoritative field exactly, with only known
    # delivery/validation additions allowed; never weaken decisions or values.
    saved = worker.read_json(workspace / "objects" / plan["object_id"] / "object.json")
    for reopened in (call("get", object_id=plan["object_id"]), call("result", query_request_id=plan["request_id"])):
        assert all(reopened[key] == value for key, value in saved.items())
        assert set(reopened) - set(saved) <= {"state", "gpa_analytic_read_validation", "peak_summary_read_validation"}
        assert reopened["state"] == "completed"
        for key in ("gpa_analytic_read_validation", "peak_summary_read_validation"):
            if key in reopened: assert reopened[key]["saved_records_modified"] is False
    assert all(worker.sha_file(workspace / name) == digest for name, digest in protected.items())
    assert {name: worker.sha_file(payload / name) for name in inventory} == before
    receipt = {"status": "PASS", "historical_plan_id": historical_id, "new_plan_id": plan["object_id"],
               "new_export_id": exported["object_id"], "original_files_unchanged": len(inventory),
               "copied_original_files_unchanged": len(protected), "parameters": parameters,
               "no_fft_or_gpa_dispatch": True, "exact_native_reopen": True,
               "resumed_by_original_queries": resume,
               "read_validation_receipts": {key: reopened[key] for key in ("gpa_analytic_read_validation", "peak_summary_read_validation") if key in reopened},
               "scope": "Explicit new observation from genuine transferred GPA; old full PNG relocation is not claimed",
               "workspace": str(workspace), "export_dir": str(output / "export")}
    (output / "receipt.json").write_bytes(worker.canonical(receipt) + b"\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resume", action="store_true", help="Query the original plan/export IDs after an interrupted check; never replay writes")
    args = parser.parse_args()
    run(args.payload.resolve(), args.output.resolve(), args.resume)
