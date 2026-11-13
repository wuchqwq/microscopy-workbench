"""Read-only CPU diagnostics for 4D-STEM diffraction and phase data."""

import argparse
import json
import math
from pathlib import Path

import diffraction_check
import phase_tilt


def add_rotation_parser(commands):
    parser = commands.add_parser("rotation", help="compare rotation and mirror candidates from paired directions")
    vector_names = ("SCAN_Y", "SCAN_X", "DET_Y", "DET_X")
    parser.add_argument("--pair", action="append", nargs=4, type=float, required=True, metavar=vector_names,
                        help="corresponding center-relative vectors; repeat for at least two nonparallel directions")
    parser.add_argument("--check-pair", action="append", nargs=4, type=float, default=[], metavar=vector_names,
                        help="independent direction pair used only to check the fitted candidates")
    parser.add_argument("--oriented", action="store_true",
                        help="use signed vectors instead of lines with 180 degree ambiguity")
    parser.set_defaults(handler=compare_rotation)


def vector_angle(y, x):
    if not math.isfinite(y) or not math.isfinite(x) or (y == 0 and x == 0):
        raise ValueError("rotation vectors must be finite and nonzero")
    return math.atan2(y, x)


def pair_angles(pairs):
    return [(vector_angle(sy, sx), vector_angle(dy, dx)) for sy, sx, dy, dx in pairs]


def residuals(differences, theta, period):
    errors = [math.degrees((value - theta + period / 2) % period - period / 2) for value in differences]
    return {
        "signed_deg": errors,
        "rms_deg": math.sqrt(sum(error * error for error in errors) / len(errors)),
    }


def rotation_candidate(pairs, check_pairs, mirrored, oriented):
    harmonic = 1 if oriented else 2
    period = 2 * math.pi / harmonic

    def differences(values):
        return [det - (math.pi - scan if mirrored else scan) for scan, det in values]

    fit_diffs = differences(pairs)
    cx = sum(math.cos(harmonic * value) for value in fit_diffs)
    cy = sum(math.sin(harmonic * value) for value in fit_diffs)
    agreement = math.hypot(cx, cy) / len(fit_diffs)
    candidate = {"mirror_scan_x_before_rotation": mirrored, "mean_resultant_length": agreement}
    if agreement <= 1e-10:
        return {**candidate, "rotation_clockwise_deg": [], "status": "no_unique_fit"}

    theta = (math.atan2(cy, cx) / harmonic) % period
    rotation_deg = math.degrees(theta) % math.degrees(period)
    angles = [rotation_deg] if oriented else [rotation_deg, rotation_deg + 180]
    return {
        **candidate,
        "status": "candidate_only",
        "rotation_clockwise_deg": angles,
        "fit_errors": residuals(fit_diffs, theta, period),
        "held_out_errors": residuals(differences(check_pairs), theta, period) if check_pairs else None,
    }


def compare_rotation(args):
    pairs = pair_angles(args.pair)
    check_pairs = pair_angles(args.check_pair)
    for index, frame in enumerate(("scan", "detector")):
        spread = max(abs(math.sin(a[index] - b[index])) for a in pairs for b in pairs)
        if spread < 1e-6:
            raise ValueError(f"provide at least two nonparallel directions in the {frame} frame")
    return {
        "mapping": "scan to detector; y down, x right; mirror scan x before clockwise rotation",
        "mode": "oriented_vectors" if args.oriented else "unoriented_lines",
        "fit_pairs_yx_yx": args.pair,
        "held_out_pairs_yx_yx": args.check_pair,
        "candidates": [rotation_candidate(pairs, check_pairs, mirrored, args.oriented)
                       for mirrored in (False, True)],
        "interpretation": "Compare both hypotheses and held-out errors; these are not calibrated PtyRAD YAML angles.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="write JSON to a new file; place before the subcommand")
    commands = parser.add_subparsers(dest="command", required=True)
    diffraction_check.add_parser(commands)
    add_rotation_parser(commands)
    phase_tilt.add_parser(commands)
    args = parser.parse_args()

    try:
        if args.output is not None:
            arrays = getattr(args, "arrays", None)
            if arrays is not None and Path(arrays).resolve() == args.output.resolve():
                raise ValueError("JSON output and --arrays must use different paths")
            if args.output.exists():
                raise FileExistsError(f"output already exists: {args.output}")
            if not args.output.parent.is_dir():
                raise ValueError(f"output directory does not exist: {args.output.parent}")

        report = json.dumps(args.handler(args), ensure_ascii=True, indent=2, allow_nan=False) + "\n"
        if args.output is None:
            print(report, end="")
        else:
            with args.output.open("x", encoding="utf-8") as destination:
                destination.write(report)
    except (ImportError, OSError, RuntimeError, ValueError) as error:
        parser.exit(2, f"error: {error}\n")


if __name__ == "__main__":
    main()
