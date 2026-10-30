"""Offline private intake, not a scientific solver or a second workspace.

Reads explicitly authorized case files; only init/dry-run and --report create
new files. Never connects to a provider, converts an image or assigns truth.
Requires Python >=3.10 in the independent images environment, optional DM reader.
"""
import argparse
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
import logging
import math
from pathlib import Path, PurePosixPath
import re
import sys
import warnings

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "docs" / "templates"
MAX_JSON = 2 * 1024 * 1024
MAX_FILE = 4 * 1024**3
MAX_PIXELS = 4 * 1024**2
MAX_BYTES = 64 * 1024**2
MAX_PAGES = 4096
UNKNOWN = (None, "unknown", "")


class IntakeError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(condition, code):
    if not condition:
        raise IntakeError(code)


def known(value):
    return value not in UNKNOWN


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def no_links(path):
    # Check every component before resolving: links/junctions must not turn a
    # private relative path into an unrelated input or output directory.
    for part in (path, *path.parents):
        require(not part.is_symlink() and not getattr(part, "is_junction", lambda: False)(), "LINK_REFUSED")


def case_root(path):
    path = Path(path).absolute()
    no_links(path)
    path = path.resolve()
    # In ANY Git checkout, private/ is the only permitted case tree. External
    # selected directories are preferred. This is a guard, not a privacy proof.
    for ancestor in (path, *path.parents):
        if (ancestor / ".git").exists():
            require(path.is_relative_to(ancestor / "private") and path != ancestor / "private", "USE_PRIVATE_CASE_DIRECTORY")
            break
    return path


def member(root, relative):
    require(type(relative) is str and bool(relative) and "\\" not in relative and ":" not in relative,
            "RELATIVE_PATH_REQUIRED")
    parts = PurePosixPath(relative)
    require(not parts.is_absolute() and ".." not in parts.parts and str(parts) == relative, "RELATIVE_PATH_REQUIRED")
    path = root.joinpath(*parts.parts)
    no_links(path)
    require(path.resolve().is_relative_to(root) and path != root, "PATH_ESCAPE")
    return path


def load_json(path):
    require(path.is_file() and path.stat().st_size <= MAX_JSON, "JSON_MISSING_OR_TOO_LARGE")
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "DUPLICATE_JSON_KEY")
            result[key] = value
        return result
    def invalid_constant(_):
        raise IntakeError("NONFINITE_JSON")
    def finite_float(text):
        value = float(text)
        require(math.isfinite(value), "NONFINITE_JSON")
        return value
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs,
                          parse_constant=invalid_constant, parse_float=finite_float)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise IntakeError("INVALID_JSON") from error


def write_new(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def init_case(directory, case_id):
    directory = case_root(directory)
    require(re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", case_id) is not None, "INVALID_CASE_ID")
    directory.mkdir(parents=True, exist_ok=False)
    for name in ("raw", "reference", "derived", "reports", "runs"):
        (directory / name).mkdir()
    # A nested guard also protects external directories later placed under Git.
    (directory / ".gitignore").write_text("*\n!.gitignore\n", encoding="ascii")
    for name in ("manifest", "protocol", "reference", "verdict"):
        value = load_json(TEMPLATES / ("specimen-" + name + ".json"))
        value["case_id"] = case_id
        write_new(directory / (name + ".json"), value)
    return directory


def bounded_plane(shape, dtype):
    require(len(shape) == 2 and all(type(v) is int and v > 0 for v in shape), "NOT_SCALAR_2D")
    require(math.prod(shape) <= MAX_PIXELS and math.prod(shape) * np.dtype(dtype).itemsize <= MAX_BYTES, "PLANE_BUDGET_EXCEEDED")


def inspect_image(path, entry):
    selection = entry.get("selection")
    require(type(selection) is dict, "SELECTION_REQUIRED")
    frame = selection.get("frame_index")
    require(type(frame) is int and frame >= 0, "FRAME_SELECTION_REQUIRED")
    suffix = path.suffix.lower()
    if suffix in (".tif", ".tiff"):
        require(all(selection.get(key) is None for key in ("dataset_index", "plane_axes", "plane_indices")), "TIFF_SELECTION_CONFLICT")
        with tifffile.TiffFile(path) as image:
            # Inspect the IFD chain in a bounded loop; do not compute len() on
            # an arbitrarily long chain or decode an entire series/stack.
            count = 0
            for page in image.pages:
                count += 1
                require(count <= MAX_PAGES, "PAGE_BUDGET_EXCEEDED")
                require(all(o > 0 and n > 0 and o + n <= path.stat().st_size
                            for o, n in zip(page.dataoffsets, page.databytecounts)), "TRUNCATED_TIFF_PAYLOAD")
            require(frame < count, "FRAME_OUT_OF_BOUNDS")
            page = image.pages[frame]
            shape, dtype = list(map(int, page.shape)), np.dtype(page.dtype)
            bounded_plane(shape, dtype)
            require(dtype in (np.dtype("uint16"), np.dtype("float32")) and page.samplesperpixel == 1
                    and int(page.photometric) in (0, 1), "UNSUPPORTED_TIFF_LAYOUT")
            values = page.asarray()
            require(list(values.shape) == shape and values.dtype == dtype, "DECODE_MISMATCH")
            require(bool(np.isfinite(values).all()), "NONFINITE_DATA")
            return {"format": "tiff", "shape": shape, "dtype": str(dtype), "frame_count": count,
                    "selected_shape_yx": shape, "reader": {"name": "tifffile", "version": tifffile.__version__},
                    "stored_calibration": "NOT_INTERPRETED; supply sourced XY metadata; TIFF resolution tags are not assumed specimen units"}
    require(suffix in (".dm3", ".dm4"), "UNSUPPORTED_FORMAT")
    require(frame == 0, "DM_FRAME_MUST_BE_ZERO")
    require(type(selection.get("dataset_index")) is int, "DATASET_SELECTION_REQUIRED")
    # Reuse the existing read-only, lazy catalog and explicit-plane decoder.
    # No new DM parser, image workspace or scientific operation is introduced.
    import image_dm
    catalog = image_dm.catalog_dm(path, MAX_PIXELS, MAX_BYTES)
    values, descriptor, index = image_dm.selected_plane(
        path, catalog, selection["dataset_index"], MAX_PIXELS, MAX_BYTES,
        selection.get("plane_axes"), selection.get("plane_indices"))
    require(not np.iscomplexobj(values), "REAL_IMAGE_REQUIRED_FOR_FIRST_CASE")
    return {"format": suffix[1:], "shape": descriptor["shape"], "dtype": descriptor["dtype"],
            "selected_shape_yx": list(map(int, values.shape)), "dataset_index": index,
            "reader": catalog["source_reader"], "stored_calibration": descriptor.get("calibration_xy")}


def quiet_inspect(path, entry):
    """Keep reader diagnostics private and do not accept partial-parse warnings."""
    class DiagnosticFilter(logging.Filter):
        seen = False

        def filter(self, record):
            if record.levelno >= logging.WARNING:
                self.seen = True
            return False

    guard = DiagnosticFilter()
    log = logging.getLogger("tifffile")
    log.addFilter(guard)
    output = io.StringIO()
    try:
        with warnings.catch_warnings(record=True) as notes, redirect_stderr(output), redirect_stdout(output):
            warnings.simplefilter("always")
            result = inspect_image(path, entry)
        require(not guard.seen and not notes and not output.getvalue(), "READER_DIAGNOSTIC_REQUIRES_REVIEW")
        return result
    finally:
        log.removeFilter(guard)


def calibration_check(value):
    require(type(value) is dict, "CALIBRATION_OBJECT_REQUIRED")
    scale, zero = value.get("signed_scale_xy"), value.get("pixel_zero_xy")
    for numbers, code in ((scale, "INVALID_SIGNED_SCALE"), (zero, "INVALID_PIXEL_ZERO")):
        if numbers is not None:
            require(type(numbers) is list and len(numbers) == 2
                    and all(type(v) in (int, float) and math.isfinite(v) for v in numbers), code)
    if scale is not None:
        require(all(v != 0 for v in scale), "ZERO_SCALE")
    if not all(known(value.get(key)) for key in ("signed_scale_xy", "pixel_zero_xy", "unit", "source", "coordinate_domain")):
        return "NOT_TESTED", "UNKNOWN_CALIBRATION_PIXEL_ONLY"
    if value["coordinate_domain"] != "real_space" or value["unit"] not in ("nm", "angstrom"):
        return "NOT_TESTED", "OUTSIDE_FIRST_CASE_REAL_SPACE_METRIC"
    if value.get("flipped_or_resampled") not in (False, True):
        return "NOT_TESTED", "TRANSFORM_HISTORY_UNKNOWN"
    if value["flipped_or_resampled"] and not known(value.get("coordinate_mapping_source")):
        return "NOT_TESTED", "TRANSFORM_MAPPING_MISSING"
    return "PASS", "DECLARED_SIGNED_XY_ONLY_NOT_EXPERIMENTALLY_VERIFIED"


def preflight(directory):
    root = case_root(directory)
    manifest_path = member(root, "manifest.json")
    data = load_json(manifest_path)
    before_manifest = digest(manifest_path)
    require(type(data) is dict and data.get("schema") == "specimen-intake-v1", "INVALID_MANIFEST_SCHEMA")
    require(type(data.get("case_id")) is str and re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", data["case_id"]) is not None, "INVALID_CASE_ID")
    require(data.get("data_kind") in ("experimental", "synthetic", "tool_generated", "unknown"), "INVALID_DATA_KIND")
    files = data.get("files")
    require(type(files) is list and 1 <= len(files) <= 32 and all(type(row) is dict for row in files), "INVALID_FILE_LIST")
    ids = [row.get("file_id") for row in files]
    require(all(type(v) is str and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", v) for v in ids)
            and len(set(ids)) == len(ids), "INVALID_FILE_IDS")
    require(sum(row.get("role") == "primary_image" for row in files) == 1, "ONE_PRIMARY_IMAGE_REQUIRED")
    require(all(row.get("role") in ("primary_image", "independent_evidence", "reference_cif", "acquisition_metadata", "derived") for row in files), "INVALID_FILE_ROLE")
    require(len({row.get("path") for row in files if type(row.get("path")) is str}) == len(files), "DUPLICATE_OR_INVALID_PATH")
    for field in ("permissions", "acquisition", "sample", "annotations", "independent_reference"):
        require(type(data.get(field)) is dict, "MISSING_MANIFEST_SECTION")
    references = data["independent_reference"].get("file_ids")
    require(type(references) is list and all(type(v) is str and v in ids for v in references), "UNKNOWN_REFERENCE_FILE_ID")
    cif_id = data["sample"].get("reference_cif_file_id")
    require(cif_id is None or type(cif_id) is str and any(row["file_id"] == cif_id and row["role"] == "reference_cif" for row in files), "UNKNOWN_CIF_FILE_ID")
    report = {"schema": "specimen-preflight-v1", "case_id": data["case_id"], "data_kind": data["data_kind"],
              "manifest_sha256": before_manifest, "tool_sha256": digest(Path(__file__)),
              "environment": {"python": sys.version.split()[0], "numpy": np.__version__, "tifffile": tifffile.__version__},
              "checks": [], "files": [], "physical_conclusion": "UNDETERMINED",
              "real_specimen_validation": "NOT_TESTED", "independent_physics": "NOT_TESTED"}
    def check(status, code):
        report["checks"].append({"status": status, "code": code})
    authorized = data["permissions"].get("local_read_authorized") is True
    check("PASS" if authorized else "FAIL", "LOCAL_READ_AUTHORIZATION")
    check("PASS" if data["data_kind"] != "unknown" else "NOT_TESTED", "DATA_KIND_DECLARATION")
    observed = None
    if authorized:
        for entry in files:
            record = {"file_id": entry["file_id"], "status": "NOT_TESTED"}
            report["files"].append(record)
            path = None
            initial_hash = None
            try:
                path = member(root, entry.get("path"))
                require(path.is_file(), "FILE_MISSING")
                require(0 < path.stat().st_size <= MAX_FILE, "FILE_SIZE_BUDGET")
                initial_hash = digest(path)
                record["observed_sha256"] = initial_hash
                expected = entry.get("sha256")
                if expected is None:
                    check("NOT_TESTED", "EXPECTED_HASH_MISSING:" + entry["file_id"])
                else:
                    require(type(expected) is str and re.fullmatch(r"[0-9a-f]{64}", expected), "INVALID_EXPECTED_SHA256")
                    require(initial_hash == expected, "SOURCE_HASH_MISMATCH")
                if entry.get("role") == "primary_image":
                    require(entry.get("original_array") is not False, "DERIVED_AS_ORIGINAL_REFUSED")
                    if entry.get("original_array") is not True:
                        check("NOT_TESTED", "ORIGINAL_ARRAY_UNCONFIRMED")
                    observed = quiet_inspect(path, entry)
                    record["observed"] = observed
                    for key in ("format", "shape", "dtype"):
                        if not known(entry.get(key)):
                            check("NOT_TESTED", "DECLARATION_MISSING:" + key)
                        else:
                            require(entry[key] == observed[key], "DECLARATION_MISMATCH:" + key)
                    axes = entry.get("array_axes")
                    if axes is None:
                        check("NOT_TESTED", "AXES_UNKNOWN")
                    else:
                        require(type(axes) is list and len(axes) == len(observed["shape"])
                                and all(type(v) is str and bool(v) for v in axes), "INVALID_AXES")
                        selection = entry["selection"]
                        yx = selection.get("plane_axes") or [0, 1]
                        require([axes[i] for i in yx] == ["y", "x"], "AXIS_ROLE_CONFLICT")
                record["status"] = "PASS"
            except Exception as error:
                code = getattr(error, "code", "READ_OR_PARSE_ERROR")
                record.update(status="FAIL", code=code)
                check("FAIL", str(code))
            finally:
                if initial_hash is not None:
                    try:
                        unchanged = digest(path) == initial_hash
                    except OSError:
                        unchanged = False
                    record["source_unchanged"] = unchanged
                    check("PASS" if unchanged else "FAIL", "SOURCE_INVARIANCE:" + entry["file_id"])
    try:
        cal_status, reason = calibration_check(data.get("calibration"))
        check(cal_status, reason)
    except IntakeError as error:
        cal_status = "FAIL"
        check("FAIL", error.code)
    # Do not activate calibration or quietly replace conflicting stored tags.
    if observed is not None and type(observed.get("stored_calibration")) is list and cal_status == "PASS":
        cal = data["calibration"]
        factors = {"nm": 1.0, "angstrom": 0.1, "Å": 0.1}
        for axis in observed["stored_calibration"]:
            if axis.get("usable") and axis.get("unit") in factors:
                index = 0 if axis["axis"] == "x" else 1
                factor = factors[axis["unit"]] / factors[cal["unit"]]
                agrees = (math.isclose(axis["signed_scale"] * factor, cal["signed_scale_xy"][index], rel_tol=1e-9, abs_tol=1e-12)
                          and math.isclose(axis["physical_pixel_zero"] * factor, cal["pixel_zero_xy"][index], rel_tol=1e-9, abs_tol=1e-12))
                check("PASS" if agrees else "FAIL", "STORED_XY_AGREEMENT:" + axis["axis"])
                if not agrees:
                    cal_status = "FAIL"
    acquisition = data["acquisition"]
    real_domain = acquisition.get("image_domain") == "real_space_lattice" and known(acquisition.get("domain_source"))
    check("PASS" if real_domain else "NOT_TESTED", "REAL_SPACE_DOMAIN_DECLARATION")
    # Coordinates are declared on the selected source plane, never on a PNG.
    if observed is not None:
        height, width = observed["selected_shape_yx"]
        for key in ("roi_a_xyxy", "roi_b_xyxy"):
            rect = data["annotations"].get(key)
            if rect is not None:
                valid = (type(rect) is list and len(rect) == 4 and all(type(v) is int for v in rect)
                         and 0 <= rect[0] < rect[2] <= width and 0 <= rect[1] < rect[3] <= height)
                check("PASS" if valid else "FAIL", "BOUNDS:" + key)
        trace = data["annotations"].get("interface_xy")
        if trace is not None:
            valid = (type(trace) is list and len(trace) == 2 and all(type(p) is list and len(p) == 2
                     and all(type(v) in (int, float) and math.isfinite(v) for v in p)
                     and 0 <= p[0] < width and 0 <= p[1] < height for p in trace) and trace[0] != trace[1])
            check("PASS" if valid else "FAIL", "INTERFACE_PIXEL_CENTERS")
    sample = data["sample"]
    f3b_holds = []
    if sample.get("f3b_model") not in ("fcc4", "diamond8"):
        f3b_holds.append("MODEL_UNKNOWN" if not known(sample.get("f3b_model")) else "UNSUPPORTED_MODEL")
    if sample.get("ideal_full_occupancy_monospecies_conventional_cell") is not True:
        f3b_holds.append("IDEAL_MONOSPECIES_CELL_UNCONFIRMED_OR_OUTSIDE_SCOPE")
    if not known(sample.get("parent_orientation_source")):
        f3b_holds.append("PARENT_ORIENTATION_SOURCE_MISSING")
    if not known(sample.get("material")) or not known(sample.get("composition_source")):
        f3b_holds.append("MATERIAL_COMPOSITION_BASIS_MISSING")
    if cal_status != "PASS":
        f3b_holds.append("REAL_SPACE_METRIC_UNRESOLVED")
    if not real_domain:
        f3b_holds.append("REAL_SPACE_DOMAIN_UNDECLARED")
    report["route_screening"] = {
        "pixel_observation": "REQUIRES_PREFLIGHT_PASS_OR_REVIEW_OF_PARTIAL",
        "F2a": "REQUIRES_SAVED_UNWINDOWED_FFT_TWO_G_AND_SINGLE_DOMAIN_REFERENCE",
        "F3a": "REQUIRES_SAVED_FIXED_G_BANDS_AND_VALID_NESTED_CIRCUITS",
        "F3b": "HOLD_UNKNOWN_OR_OUTSIDE_FIRST_SCOPE" if f3b_holds else "DECLARED_PREREQUISITES_ONLY_RUNTIME_MUST_VALIDATE",
        "F3b_hold_reasons": f3b_holds,
        "calibrated_physics": "DECLARED_METRIC_ONLY" if cal_status == "PASS" else "HOLD"}
    report["independent_reference_available_declaration"] = data["independent_reference"].get("available", "unknown")
    check("PASS" if digest(manifest_path) == before_manifest else "FAIL", "MANIFEST_INVARIANCE")
    statuses = {row["status"] for row in report["checks"]}
    report["intake_status"] = "BLOCKED" if "FAIL" in statuses else "PARTIAL" if "NOT_TESTED" in statuses else "READY_FOR_PROTOCOL_REVIEW"
    report["exit_code"] = 1 if "FAIL" in statuses else 2 if "NOT_TESTED" in statuses else 0
    return report


def dry_run(directory):
    """Use ONLY the committed public F3b generator; no fixture-as-specimen claim."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("public_intake_fixture", ROOT / "tests/fixtures/twin_f3b/create_fixture.py")
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    root = init_case(directory, "public-synthetic-001")
    made = fixture.create_fixture(root / "raw")
    data = load_json(root / "manifest.json")
    truth = made["truth_data"]
    data["data_kind"] = "synthetic"
    data["permissions"]["local_read_authorized"] = True
    data["files"][0].update(path="raw/" + Path(made["image"]).name, format="tiff", original_array=True,
                            shape=truth["shape_yx"], dtype="float32", array_axes=["y", "x"], sha256=digest(Path(made["image"])))
    data["files"][0]["selection"]["frame_index"] = 0
    data["acquisition"].update(image_domain="real_space_lattice", domain_source="public analytic cosine teaching model")
    data["calibration"].update(coordinate_domain="real_space", signed_scale_xy=truth["source_xy_scale_nm"],
                               pixel_zero_xy=[0, 0], unit="nm", source="public synthetic truth, not experimental calibration",
                               flipped_or_resampled=False)
    # Replace the NEW scaffold only during this explicit synthetic generation.
    (root / "manifest.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    report = preflight(root)
    require(report["exit_code"] == 0, "DRY_RUN_POSITIVE_FAILED")
    write_new(root / "reports" / "preflight.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "preflight", "dry-run"):
        child = sub.add_parser(name)
        child.add_argument("--case-dir", required=True, type=Path)
        if name == "init":
            child.add_argument("--case-id", default="case-001")
        if name == "preflight":
            child.add_argument("--report", help="New relative reports/*.json, private only; stdout omits source details")
    args = parser.parse_args()
    try:
        if args.command == "init":
            init_case(args.case_dir, args.case_id)
            print("PRIVATE_CASE_CREATED; all scientific verdicts NOT_TESTED")
            return 0
        report = dry_run(args.case_dir) if args.command == "dry-run" else preflight(args.case_dir)
        if args.command == "preflight" and args.report:
            target = member(case_root(args.case_dir), args.report)
            require(target.parent == case_root(args.case_dir) / "reports" and target.suffix == ".json", "REPORT_LOCATION_REQUIRED")
            write_new(target, report)
        print(json.dumps({key: report[key] for key in ("intake_status", "exit_code", "real_specimen_validation", "physical_conclusion")}))
        return report["exit_code"]
    except Exception as error:
        # Never echo parser exceptions, filenames, reader metadata or private paths.
        print(json.dumps({"intake_status": "BLOCKED", "code": getattr(error, "code", "INTAKE_ERROR"),
                          "real_specimen_validation": "NOT_TESTED"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
