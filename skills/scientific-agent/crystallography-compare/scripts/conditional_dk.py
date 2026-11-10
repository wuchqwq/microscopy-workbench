#!/usr/bin/env python3
"""Bounded model-conditioned scalar dk sidecar; never changes a calibration.

Uses explicit HKL correspondences and an existing un-rasterized reflection table.
No indexing, structure simulation, rotation fit, network or provider writes.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import sys
import tempfile

MAX_JSON = 2 * 1024 * 1024
MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
FRAME = "rotated laboratory xyz; beam +z; raster columns +x, rows +y"


def need(value, message):
    if not value:
        raise ValueError(message)


def finite(v):
    return type(v) in (int, float) and math.isfinite(v)


def text(v, maximum=2000):
    return type(v) is str and bool(v.strip()) and len(v) <= maximum


def vector(v, length, integer=False):
    return (type(v) is list and len(v) == length and
            all((type(x) is int if integer else finite(x)) and abs(x) <= 1e7 for x in v))


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def decode(raw):
    def invalid(value):
        raise ValueError("Non-finite JSON constant: " + value)
    return json.loads(raw, parse_constant=invalid)


def bounded_read(path, limit):
    need(path.is_absolute() and path.is_file() and not path.is_symlink(), "Explicit ordinary absolute input file required")
    need(path.stat().st_size <= limit, "Input exceeds byte budget")
    with path.open("rb") as stream:
        raw = stream.read(limit + 1)
    need(len(raw) <= limit, "Input grew past byte budget")
    return raw


def calculate(data, read_ref):
    """read_ref verifies a declared file hash; tests use actual ordinary files."""
    need(type(data) is dict and data.get("schema_version") == 1, "schema_version 1 required")
    need(set(data) <= {"schema_version", "capability_basis", "capability_ref", "source", "hypothesis", "theory_ref", "correspondences", "tolerance_inv_angstrom", "uncertainty_note", "alpha"}, "Unknown input field")
    need(text(data.get("capability_basis")) and text(data.get("uncertainty_note")), "Actual capability basis and uncertainty note required")
    read_ref(data.get("capability_ref"))
    source, hypothesis = data.get("source"), data.get("hypothesis")
    need(type(source) is dict and set(source) == {"file", "frame_index", "roi_xyxy", "coordinate_domain", "dc_xy", "isotropic_grid_basis"}, "Explicit source/frame/ROI/DC/isotropic premise required")
    read_ref(source["file"])
    need(type(source["frame_index"]) is int and source["frame_index"] >= 0, "Explicit zero-based frame required")
    need(source["coordinate_domain"] in ("diffraction_array_indices", "fftshift_bin_indices"), "Use original diffraction array indices or FFT bins, not display pixels or guessed units")
    roi, dc = source["roi_xyxy"], source["dc_xy"]
    need(vector(roi, 4) and roi[0] >= 0 and roi[1] >= 0 and roi[2] > roi[0] and roi[3] > roi[1] and vector(dc, 2), "Finite half-open source ROI and DC required")
    need(roi[0] <= dc[0] < roi[2] and roi[1] <= dc[1] < roi[3] and text(source["isotropic_grid_basis"]), "DC must lie in source support; scalar isotropic dk is an explicit premise")
    need(type(hypothesis) is dict and set(hypothesis) <= {"label", "structure_ref", "orientation_ref", "zone_axis_uvw", "scan_rotation_deg", "index_basis"}, "Explicit bounded model hypothesis required")
    need(text(hypothesis.get("label"), 200) and text(hypothesis.get("index_basis")), "Model label and correspondence/index basis required")
    zone = hypothesis.get("zone_axis_uvw")
    need(vector(zone, 3, True) and any(zone), "zone_axis_uvw must be an explicit nonzero integer triplet; 110 degrees is not [110]")
    need("scan_rotation_deg" not in hypothesis or finite(hypothesis["scan_rotation_deg"]), "scan_rotation_deg is a separate scalar angle")
    read_ref(hypothesis.get("structure_ref")); read_ref(hypothesis.get("orientation_ref"))
    raw_theory = read_ref(data.get("theory_ref"), json_file=True)
    theory = decode(raw_theory)
    need(type(theory) is dict and theory.get("coordinates_frame") == FRAME, "Exact declared projected laboratory frame required")
    convention = theory.get("reciprocal_convention")
    need(convention in ("cycles_per_angstrom_no_2pi", "radians_per_angstrom_2pi"), "Explicit cycles/Angstrom or angular 2pi convention required")
    factor = 1.0 if convention == "cycles_per_angstrom_no_2pi" else 1.0 / (2.0 * math.pi)
    coords, hkls = theory.get("coordinates_inv_angstrom"), theory.get("hkl")
    need(type(coords) is list and type(hkls) is list and 1 <= len(coords) == len(hkls) <= 4096, "Bounded un-rasterized reflection table required")
    need(all(vector(q, 3) for q in coords) and all(vector(h, 3) and all(x == int(x) for x in h) for h in hkls), "Finite reciprocal coordinates and integer-valued three-index theoretical HKLs required")
    # The official provider serializes HKLs as float-valued JSON numbers.
    # Normalize only that table; researcher zone/correspondence inputs stay int-only.
    hkls = [[int(x) for x in h] for h in hkls]
    need(len(set(map(tuple, hkls))) == len(hkls), "Duplicate theoretical HKL identity")
    projected = {tuple(h): math.hypot(q[0], q[1]) * factor for h, q in zip(hkls, coords)}
    points = data.get("correspondences")
    need(type(points) is list and 1 <= len(points) <= 32, "1..32 explicit correspondences required")
    records, ids, positions, used_hkls = [], set(), set(), set()
    for item in points:
        need(type(item) is dict and set(item) == {"id", "role", "hkl", "point_xy"}, "Each correspondence needs id/role/hkl/point_xy only")
        ident, role, hkl, point = item["id"], item["role"], item["hkl"], item["point_xy"]
        need(text(ident, 100) and ident not in ids and role in ("fit", "heldout") and vector(hkl, 3, True) and vector(point, 2), "Distinct bounded identities and explicit fit/heldout roles required")
        need(tuple(hkl) in projected and tuple(hkl) not in used_hkls and tuple(point) not in positions, "HKL must exist once; fit/heldout cannot reuse a reflection or point")
        need(roi[0] <= point[0] < roi[2] and roi[1] <= point[1] < roi[3], "Point outside exact source support")
        radius, g = math.hypot(point[0]-dc[0], point[1]-dc[1]), projected[tuple(hkl)]
        need(radius > 0 and g > 0, "Direct beam/zero transverse projection is not a scale correspondence")
        ids.add(ident); positions.add(tuple(point)); used_hkls.add(tuple(hkl))
        records.append({**item, "radius_px": radius, "predicted_transverse_g_cycles_per_angstrom": g})
    fits = [r for r in records if r["role"] == "fit"]
    heldout = [r for r in records if r["role"] == "heldout"]
    need(fits, "At least one explicit fit reflection required")
    tolerance = data.get("tolerance_inv_angstrom")
    need(finite(tolerance) and 0 < tolerance <= 1e6, "Declared positive matching tolerance required; it is not uncertainty")
    dk = math.fsum(r["radius_px"]*r["predicted_transverse_g_cycles_per_angstrom"] for r in fits) / math.fsum(r["radius_px"]**2 for r in fits)
    need(finite(dk) and 1e-12 <= dk <= 1e6, "Conditional scale outside calculation budget")
    for r in records:
        r["conditional_g_cycles_per_angstrom"] = dk*r["radius_px"]
        r["residual_inv_angstrom"] = r["conditional_g_cycles_per_angstrom"]-r["predicted_transverse_g_cycles_per_angstrom"]
        r["within_declared_tolerance"] = abs(r["residual_inv_angstrom"]) <= tolerance
    result = {"schema_version": 1, "kind": "model_conditioned_isotropic_dk_sidecar", "source": source, "hypothesis": hypothesis, "theory_ref": data["theory_ref"],
              "tolerance_inv_angstrom": tolerance, "dk_cycles_per_angstrom_per_pixel": dk, "input_reciprocal_convention": convention, "input_to_cycles_factor": factor,
              "method": "unweighted zero-intercept least squares: sum(r*g)/sum(r*r); radial projected geometry only",
              "fixed": {"dc": "supplied source anchor; not fitted", "translation": 0, "rotation": "not fitted or inferred", "cell_and_HKL": "supplied model, not searched"},
              "correspondences": records, "fit_ids": [r["id"] for r in fits], "heldout_ids": [r["id"] for r in heldout],
              "heldout_status": "NOT_VALIDATED_NO_HELDOUT" if not heldout else "MODEL_PREDICTION_CONSISTENT" if all(r["within_declared_tolerance"] for r in heldout) else "MODEL_PREDICTION_CONFLICT",
              "independent_absolute_scale_validation": "NOT_VALIDATED", "phase_identified": False,
              "uncertainty": {"status": "NOT_QUANTIFIED", "input_note": data["uncertainty_note"], "fit_residual_rms_inv_angstrom": math.sqrt(math.fsum(r["residual_inv_angstrom"]**2 for r in fits)/len(fits)), "meaning": "Residuals and matching tolerance are not measurement uncertainty, confidence intervals or model probability"},
              "limits": ["All values depend on supplied structure, indices, projection, DC and isotropic-grid premise", "Held-out agreement is model prediction consistency, not external absolute scale validation", "Index/roll choices made using these points are search evidence even if called heldout", "This helper verifies file hashes and geometry only; it does not certify the model, orientation, tool execution or original measurement accuracy", "No calibration, provider journal or original array is written"]}
    if "alpha" in data:
        a = data["alpha"]
        need(type(a) is dict and set(a) == {"disk_radius_px", "wavelength_angstrom", "basis"} and finite(a["disk_radius_px"]) and a["disk_radius_px"] > 0 and finite(a["wavelength_angstrom"]) and 0 < a["wavelength_angstrom"] < 1 and text(a["basis"]), "Alpha needs explicit sourced radius, wavelength and geometric basis")
        angle = a["wavelength_angstrom"] * a["disk_radius_px"] * dk
        need(0 < angle <= .1, "Paraxial alpha estimate outside this helper's <=0.1 rad budget")
        result["alpha"] = {**a, "conditional_alpha_mrad": 1000*angle, "approximation": "paraxial alpha_rad = wavelength_A * transverse_g_cycles_per_A; not a general camera-length calibration", "status": "MODEL_CONDITIONED_NOT_INDEPENDENTLY_VALIDATED", "uncertainty": "NOT_PROPAGATED"}
    return result


def run(input_path, output_path):
    need(output_path.is_absolute() and output_path.parent.is_dir() and not output_path.exists() and not output_path.is_symlink(), "New absolute output file with existing parent required")
    raw = bounded_read(input_path, MAX_JSON)
    refs, total = [], 0
    def read_ref(ref, json_file=False):
        nonlocal total
        need(type(ref) is dict and set(ref) == {"path", "sha256"} and type(ref["sha256"]) is str and len(ref["sha256"]) == 64 and all(c in "0123456789abcdef" for c in ref["sha256"]), "Exact file path/SHA256 reference required")
        p = Path(ref["path"])
        content = bounded_read(p, MAX_JSON if json_file else MAX_FILE)
        total += len(content); need(total <= MAX_TOTAL, "Referenced bytes exceed total budget")
        need(sha(content) == ref["sha256"], "Referenced file hash differs")
        refs.append({"path": str(p), "sha256": sha(content), "bytes": len(content)})
        return content
    result = calculate(decode(raw), read_ref)
    for ref in refs:
        need(sha(bounded_read(Path(ref["path"]), MAX_FILE)) == ref["sha256"], "Input changed during calculation")
    need(sha(bounded_read(input_path, MAX_JSON)) == sha(raw), "Input changed during calculation")
    result["provenance"] = {"input": {"path": str(input_path), "sha256": sha(raw)}, "references": refs,
                            "script_sha256": sha(Path(__file__).read_bytes()), "python": platform.python_version(), "dependencies": "Python standard library only", "capability_basis": decode(raw)["capability_basis"], "capability_ref": decode(raw)["capability_ref"], "execution": "local deterministic script, not provider or model execution"}
    need(output_path.is_absolute() and output_path.parent.is_dir() and not output_path.exists() and not output_path.is_symlink(), "New absolute output file with existing parent required")
    payload = (json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+"\n").encode()
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_path.parent, prefix=".conditional-dk-", delete=False) as stream:
            temporary = Path(stream.name); stream.write(payload); stream.flush(); os.fsync(stream.fileno())
        os.link(temporary, output_path)  # atomic, write-new; never replaces an existing report
    finally:
        if temporary is not None: temporary.unlink(missing_ok=True)
    return {"status": "COMPLETED_LOCAL_CONDITIONAL_CALCULATION", "output": str(output_path), "sha256": sha(payload), "independent_absolute_scale_validation": "NOT_VALIDATED"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.input, args.output), ensure_ascii=False))
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "REFUSED", "reason": str(error), "provider_or_model_executed": False}), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
