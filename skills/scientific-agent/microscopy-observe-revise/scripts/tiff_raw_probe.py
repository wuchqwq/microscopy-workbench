#!/usr/bin/env python3
"""Bounded raw TIFF readout; supplemental local script, not a provider/model."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile

import numpy as np
import tifffile

MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_PAGE_PIXELS = 4_194_304
MAX_PROFILE_SAMPLES = 4096


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(file):
    h = hashlib.sha256()
    with Path(file).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def identity(file):
    s = Path(file).stat()
    return {"device": s.st_dev, "inode": s.st_ino, "size": s.st_size,
            "mtime_ns": s.st_mtime_ns, "ctime_ns": s.st_ctime_ns}


def write_new(file, report):
    """Publish complete bytes with exclusive creation; never replace a file."""
    raw = (json.dumps(report, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode("utf-8")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".tiff-probe-", dir=file.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, file)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def run(args):
    source, output = Path(args.source), Path(args.output)
    require(source.is_absolute() and source.suffix.lower() in {".tif", ".tiff"}
            and source.is_file() and not source.is_symlink(), "Explicit ordinary absolute TIFF required")
    require(output.is_absolute() and output.suffix.lower() == ".json"
            and output.parent.is_dir() and not output.parent.is_symlink()
            and not output.exists() and not output.is_symlink(), "New absolute JSON in an existing ordinary parent required")
    require(type(args.frame) is int and args.frame >= 0, "Explicit zero-based frame required")
    require(args.operation in {"statistics", "axis-profile"}, "Unsupported readout")
    expected_tool = "image_statistics" if args.operation == "statistics" else "image_profile"
    require(args.missing_tool == expected_tool, "Missing capability must match requested operation; no generic replacement")
    require(type(args.capability_evidence) is str and 1 <= len(args.capability_evidence.strip()) <= 2000,
            "Record actual missing-capability evidence; a refusal/unknown outcome is not absence")
    require(re.search(r"\bUNSUPPORTED_LAYOUT\b", args.capability_evidence, re.IGNORECASE) is None,
            "UNSUPPORTED_LAYOUT is a provider input refusal; it does not establish a missing readout tool")
    require(type(args.source_notes) is str and 1 <= len(args.source_notes.strip()) <= 4000,
            "Explicit source/condition notes required")
    require(args.origin in {"unknown", "simulation", "experimental"}, "Explicit source declaration required")
    before_stat = identity(source)
    require(before_stat["size"] <= MAX_SOURCE_BYTES, "Source exceeds 64 MiB budget")
    before_hash = digest(source)
    with tifffile.TiffFile(source) as file:
        require(args.frame < len(file.pages), "Selected TIFF page does not exist")
        page = file.pages[args.frame]
        shape, dtype = tuple(page.shape), np.dtype(page.dtype)
        require(len(shape) == 2 and all(type(n) is int and n > 0 for n in shape)
                and math.prod(shape) <= MAX_PAGE_PIXELS, "One 2-D scalar page within pixel budget required")
        require(page.samplesperpixel == 1 and str(page.photometric) in {"0", "1"},
                "Only grayscale scalar TIFF pages; no RGB/palette/reinterpretation")
        require((dtype.kind in {"u", "i"} and dtype.itemsize in {1, 2, 4})
                or (dtype.kind == "f" and dtype.itemsize in {4, 8}), "Unsupported dtype; no silent conversion")
        array = page.asarray()
        require(array.shape == shape and array.dtype == dtype and np.isfinite(array).all(),
                "Raw page changed shape/dtype or contains non-finite values")
        rect = list(args.roi)
        require(len(rect) == 4 and all(type(n) is int for n in rect), "Integer source-pixel ROI required")
        x0, y0, x1, y1 = rect
        require(0 <= x0 < x1 <= shape[1] and 0 <= y0 < y1 <= shape[0],
                "ROI must stay inside the source; no clipping or display-coordinate guessing")
        roi = array[y0:y1, x0:x1]
        if args.operation == "statistics":
            require(args.axis is None and args.index is None, "Statistics does not accept profile parameters")
            with np.errstate(over="raise", invalid="raise"):
                values = {"sample_count": int(roi.size), "mean": float(np.mean(roi, dtype=np.float64)),
                          "stddev": float(np.std(roi, dtype=np.float64, ddof=0)),
                          "minimum": float(np.min(roi)), "maximum": float(np.max(roi))}
            require(all(math.isfinite(v) for v in values.values()), "Readout exceeds finite binary64 reduction range")
            result = {"statistics": values, "reduction_dtype": "float64", "stddev_ddof": 0}
        else:
            require(args.axis in {"x", "y"} and type(args.index) is int, "Axis and original-array fixed index required")
            require((y0 <= args.index < y1) if args.axis == "x" else (x0 <= args.index < x1),
                    "Fixed profile index is outside the source ROI")
            coordinates = ([[x, args.index] for x in range(x0, x1)] if args.axis == "x"
                           else [[args.index, y] for y in range(y0, y1)])
            require(len(coordinates) <= MAX_PROFILE_SAMPLES, "Profile exceeds 4096-sample budget")
            values = (array[args.index, x0:x1] if args.axis == "x" else array[y0:y1, args.index]).tolist()
            result = {"profile": {"axis": args.axis, "fixed_source_index": args.index,
                                  "coordinate_space": "original_array_pixel_indices", "points_xy": coordinates,
                                  "values": values, "sample_distance_unit": "pixel", "interpolation": "none"}}
        source_info = {"given_path": str(source), "resolved_path": str(source.resolve()),
                       "sha256": before_hash, "stat": before_stat, "page_index": args.frame,
                       "page_count": len(file.pages), "shape_yx": list(shape), "dtype": dtype.str,
                       "tiff_axes": page.axes, "photometric": str(page.photometric)}
    require(identity(source) == before_stat and digest(source) == before_hash,
            "Source changed during read; no output published")
    report = {"schema_version": 1, "status": "completed", "producer": {
        "kind": "local_script_fallback_not_provider", "script": Path(__file__).name,
        "script_sha256": digest(Path(__file__).resolve()),
        "versions": {"python": sys.version.split()[0], "numpy": np.__version__, "tifffile": tifffile.__version__}},
        "source": source_info, "source_origin": {"value": args.origin, "authority": "caller_declaration"},
        "source_notes": args.source_notes, "source_rect_xyxy": rect,
        "coordinate_space": "original_array_pixel_indices", "operation": args.operation,
        "physical_calibration": None, "modality": "unknown", "image_domain": "unknown", "intensity_unit": "unknown",
        "capability_preflight": {"missing_tool": args.missing_tool, "caller_evidence": args.capability_evidence,
                                 "independently_verified_by_script": False},
        "provider_request_id": None, "scientific_claim": "Raw stored-array readout only; no material, atom or resolution inference",
        "original_unchanged": True, **result}
    write_new(output, report)
    return report


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True)
    p.add_argument("--frame", type=int, required=True)
    p.add_argument("--roi", nargs=4, type=int, required=True, metavar=("X0", "Y0", "X1", "Y1"))
    p.add_argument("--operation", choices=["statistics", "axis-profile"], required=True)
    p.add_argument("--axis", choices=["x", "y"])
    p.add_argument("--index", type=int)
    p.add_argument("--missing-tool", choices=["image_statistics", "image_profile"], required=True)
    p.add_argument("--capability-evidence", required=True)
    p.add_argument("--origin", choices=["unknown", "simulation", "experimental"], default="unknown")
    p.add_argument("--source-notes", required=True)
    p.add_argument("--output", required=True)
    return p


if __name__ == "__main__":
    try:
        arguments = parser().parse_args()
        report = run(arguments)
        print(json.dumps({"status": "completed", "output": str(Path(arguments.output)),
                          "source_sha256": report["source"]["sha256"], "producer": "local_script_fallback_not_provider"}))
    except (ValueError, OSError, OverflowError, FloatingPointError, tifffile.TiffFileError) as error:
        print(json.dumps({"status": "failed", "producer": "local_script_fallback_not_provider", "error": str(error)}), file=sys.stderr)
        sys.exit(2)
