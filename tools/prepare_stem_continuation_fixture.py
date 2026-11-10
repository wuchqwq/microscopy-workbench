"""Prepare three existing public scalar fixtures, never scientific result objects.

Reuses the exact array construction in
``tests/image_site_observation_test.py:ExpectedSiteReview.fixture``. It writes
new input TIFFs and source/known-construction records only. GUI operations must
explicitly import, select, measure, review and continue these inputs. This is
neither an experimental STEM source nor AI/blind scientific validation.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
TARGET = [20, 20, 25, 25]
REFERENCES = [[4, 4, 9, 9], [40, 40, 45, 45]]
EXPECTED = [22.25, 22.5]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def prepare(output):
    if not output.is_absolute():
        raise ValueError("--output must name an explicit NEW absolute directory")
    if output.exists() or output.is_symlink():
        raise ValueError("Output exists; inspect it, do not overwrite or replay preparation")
    if not output.parent.is_dir():
        raise ValueError("Output parent must already exist")
    # Refuse an alias into another location. Output must not silently follow a
    # symlink parent supplied as though it were an isolated evidence directory.
    if output.parent.resolve() != output.parent:
        raise ValueError("Output parent must be its actual ordinary absolute path")
    generator = ROOT / "tests/image_site_observation_test.py"
    script = Path(__file__).resolve()
    if not generator.is_file():
        raise ValueError("Existing public fixture source is missing")
    output.mkdir()
    started = {
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "script": str(script), "script_sha256": digest(script),
        "generator": str(generator), "generator_sha256": digest(generator),
        "generator_function": "ExpectedSiteReview.fixture",
        "provider_dispatched": False, "model_invoked": False,
        "statement": "Exact public test array construction reused; only TIFF source and conditions are prepared. No statistics, discovery, review, profile or workspace is created.",
        "unknown_outcome_policy": "If interrupted, inspect this output; do not rerun into it or overwrite it.",
    }
    write_json(output / "preparation-started.json", started)
    receipt_cases = []
    cases = [
        ("continuable", 4, (10, 10), "haadf", "tool_proposed"),
        ("reference_conflict", 5, (2, 8), "haadf", "needs_reference_review"),
        ("missing_conditions", 4, (10, 10), "unknown", "needs_information"),
    ]
    for name, target, references, modality, status in cases:
        directory = output / name
        directory.mkdir()
        # Identical construction to the existing public fixture: background1,
        # constant target/reference supports, and a brighter neighbour OUTSIDE
        # the fixed target that must never replace the expected site.
        values = np.ones((64, 64), dtype=np.float32)
        for rect, value in zip([TARGET, *REFERENCES], [target, *references]):
            x0, y0, x1, y1 = rect
            values[y0:y1, x0:x1] = value
        values[22, 27] = 100
        image = directory / "source.tiff"
        tifffile.imwrite(image, values)
        conditions = {
            "origin": "public_analytic_synthetic_software_fixture",
            "is_experimental": False,
            "not_physical_STEM_simulation": True,
            "generator": "tests/image_site_observation_test.py:ExpectedSiteReview.fixture",
            "generator_sha256": digest(generator),
            "shape_yx": [64, 64], "dtype": "float32",
            "source_tiff_sha256": digest(image),
            "physical_xy_scale": None, "material": None, "phase": None,
            "thickness": None, "voltage": None, "detector_angles": None,
            "noise_count_calibration": None,
            "suggested_researcher_input": {
                "target_rect": TARGET,
                "reference_rects": REFERENCES,
                "reference_source_text": "Public analytic same-support controls from existing ExpectedSiteReview fixture; physical reference equivalence and independence are not established.",
                "expected_position_xy": EXPECTED,
                "position_source_text": "Researcher-supplied public fixture position, not localized; never replace it with the brighter neighbour at [27,22].",
                "question": "How does the supplied expected position differ from every reference, and what raw observation is still missing?",
                "modality": modality,
                "signal_kind": "stored_scalar",
                "signal_source_text": (
                    "Public analytic scalar fixture; acquisition channel intentionally unspecified, not independent Poisson counts."
                    if modality == "unknown" else
                    "Declared HAADF solely to exercise the software continuation gate on a public analytic scalar fixture, not an acquisition fact or independent Poisson counts."
                ),
            },
            "post_run_construction_check_only": {
                "target_mean": target,
                "reference_means": list(references),
                "target_minus_each_reference": [target - v for v in references],
                "expected_continuation_status": status,
                "profile_if_proposed": {
                    "points": [[20.25, 22.5], [24.25, 22.5]],
                    "sample_count": 5, "line_width": 1, "interpolation": "nearest",
                } if status == "tool_proposed" else None,
                "physical_conclusion": None,
            },
            "scope": "Software and source-array behavior only. Operator has read construction; not an independent blind test. Known values are post-product checks, not prefilled result objects.",
        }
        write_json(directory / "source_conditions.json", conditions)
        receipt_cases.append({
            "case": name, "source_path": str(image),
            "conditions_path": str(directory / "source_conditions.json"),
            "source_tiff_sha256": digest(image),
            "conditions_sha256": digest(directory / "source_conditions.json"),
            "provider_requests_created": 0,
        })
    files = {
        str(path.relative_to(output)): digest(path)
        for path in sorted(output.rglob("*")) if path.is_file()
    }
    receipt = {
        "status": "INPUTS_PREPARED_NOT_RESEARCH_RESULTS",
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "output": str(output), "source_fixture": started,
        "cases": receipt_cases, "files_sha256": files,
        "provider_requests_created": 0, "scientific_results_created": 0,
        "model_invoked": False,
        "next_step": "Explicit GUI import and researcher selection/measurement/review. Do not call these prepared TIFFs a completed workflow.",
    }
    write_json(output / "receipt.json", receipt)
    print(json.dumps(receipt, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.output)
