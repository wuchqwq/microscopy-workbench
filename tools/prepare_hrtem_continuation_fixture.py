"""Prepare two existing public analytic GPA fixtures, not GUI comparison results.

Run once with --output naming a NEW absolute directory. An interrupted output
must be inspected, not overwritten or automatically replayed. This preparation
is explicit fixture work through the real local provider, never blind inference
or a claim that the GUI autonomously created/found the bands.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
from test_peak_comparison import SavedComparison  # existing public generator
from tools import image_workspace as worker


def write_json(path, value):
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(output):
    if not output.is_absolute():
        raise ValueError("--output must be an explicit absolute path")
    if output.exists() or output.is_symlink():
        raise ValueError("Output already exists; inspect original requests instead of replaying preparation")
    if not output.parent.is_dir():
        raise ValueError("Output parent must already exist")
    output.mkdir()
    generator = ROOT / "tests/test_peak_comparison.py"
    statement = (
        "Public analytic software fixture reused from tests/test_peak_comparison.py. "
        "Not an experimental material image or a physical HRTEM image-formation simulation. "
        "Preparation explicitly runs the existing local open/frame/FFT/GPA provider. "
        "The researcher GUI will start from these saved bands; no comparison has been created. "
        "The executor has read the construction, so this is not an independent blind test."
    )
    write_json(output / "preparation-started.json", {
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "generator": str(generator), "generator_sha256": digest(generator),
        "statement": statement, "unknown_outcome_policy": "Inspect existing provider request journal; never replay this script over this output",
        "cases": ["comparable", "support_insufficient"],
        "initial_request_ids_per_case": {"case-1": "open", "case-2": "frame", "case-3": "fft", "case-4": "gpa"},
    })
    receipts = []
    for name, dark in (("comparable", False), ("support_insufficient", True)):
        directory = output / name
        directory.mkdir()
        conditions = {
            "origin": "public_analytic_synthetic_software_fixture",
            "statement": statement,
            "generator": "tests/test_peak_comparison.py:SavedComparison.seed",
            "generator_sha256": digest(generator),
            "arguments": {"changed": not dark, "dark": dark},
            "shape_yx": [256, 256], "dtype": "float32",
            "construction": "Two x/y cosine carriers, each period 8 pixels. Right half zero amplitude" if dark else "Two x/y cosine carriers, period 8 pixels. Right half amplitude 1.6 and phases +0.4/-0.4 radians",
            "physical_xy_scale": None, "material": None, "phase": None,
            "thickness": None, "defocus": None, "voltage": None,
            "noise_or_uncertainty_calibration": None,
            "known_answer_use": "Post-product comparison only; construction is not an experimental conclusion or independent inference",
            "recommended_target_rect_local_xyxy": [184, 96, 216, 128],
            "recommended_reference_rect_local_xyxy": [40, 96, 72, 128],
            "recommended_reference_text": "Explicit left-side analytic carrier reference from this public fixture; not independent material equivalence",
        }
        write_json(directory / "source_conditions.json", conditions)
        fixture = SavedComparison()
        fixture.root, fixture.workspace, fixture.counter = directory, directory / "workspace", 0
        # Exact existing test construction and real provider calls; no substitute
        # arrays are written into provider objects, no comparison is precomputed.
        bands = fixture.seed(changed=not dark, dark=dark)
        dependency = bands["input_dependency"]
        frame_id = dependency["source"]["object_id"]
        fft_id = dependency["fft"]["object_id"]
        context = fixture.call("context", object_id=frame_id, metadata={
            "input_origin": "simulation", "modality": "hrtem",
            "source_text": statement,
            "data_meaning": "Analytic x/y carrier fixture only; pixel-domain, not physical electron counts or real material",
        })
        view = fixture.call("view", object_id=context["object_id"], rect=[0, 0, 256, 256], max_size=768)
        # Acknowledgement means programmatic receipt, never visual inspection.
        fixture.call("preview_acknowledge", preview_request_id=view["request_id"], object_id=view["object_id"])
        manifests = {}
        objects = worker.Workspace(str(fixture.workspace), False)
        frame, _ = objects.object(frame_id)
        for label, ident in (("gpa", bands["object_id"]), ("fft", fft_id), ("frame", frame_id), ("view", view["object_id"]), ("source", frame["source_object_id"])):
            manifests[label] = {"object_id": ident, "manifest_sha256": digest(fixture.workspace / "objects" / ident / "object.json")}
        receipt = {
            "case": name, "workspace": str(fixture.workspace),
            "source_path": str(directory / "source.tiff"), "source_sha256": digest(directory / "source.tiff"),
            "source_conditions": str(directory / "source_conditions.json"),
            "gpa_object_id": bands["object_id"], "fft_object_id": fft_id,
            "frame_object_id": frame_id, "view_object_id": view["object_id"],
            "context_object_id": context["object_id"], "gpa_request_id": bands["request_id"],
            "saved_band_parameters": bands["parameters"], "input_dependency": dependency,
            "recommended_target_rect": conditions["recommended_target_rect_local_xyxy"],
            "recommended_reference_rect": conditions["recommended_reference_rect_local_xyxy"],
            "coordinate_space": "local_fft_pixels", "reference_text": conditions["recommended_reference_text"],
            "object_manifests": manifests, "preparation_provider_requests": fixture.counter,
            "comparison_created": False, "gui_autonomous_band_generation": False,
            "not_independent_blind_test": True, "not_real_material": True,
        }
        write_json(directory / "fixture-receipt.json", receipt)
        receipts.append(receipt)
    result = {"status": "PREPARED_NOT_GUI_VALIDATED", "statement": statement,
              "time_utc": datetime.now(timezone.utc).isoformat(), "cases": receipts,
              "comparisons_created": False, "model_requests": False}
    write_json(output / "fixture-receipt.json", result)
    print(json.dumps({"status": result["status"], "receipt": str(output / "fixture-receipt.json")}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    prepare(parser.parse_args().output)
