"""Run the bounded P2 readback contract once per exclusive evidence run ID."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--only-rank", action="store_true")
    parser.add_argument("--implementation-root", type=Path, default=ROOT)
    parser.add_argument("--historical-workspace", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", args.run_id):
        parser.error("run-id must be a bounded lowercase evidence name")
    source = args.implementation_root.resolve()
    output = ROOT / "outputs/conditional-s2-readback-p2" / args.run_id
    output.mkdir(parents=True, exist_ok=False)
    os.environ["S2_READBACK_ARTIFACT_ROOT"] = str(output / "provider-records")
    os.environ["S2_READBACK_IMPLEMENTATION_ROOT"] = str(source)
    os.environ["S2_HISTORICAL_WORKSPACE"] = str(args.historical_workspace.resolve())
    for key in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ[key] = "2"
    sys.path[:0] = [str(source), str(ROOT / "tests")]
    import numpy
    import scipy
    import PIL
    from tools import image_column_model as model
    calls = dict(fit_calls=0, optimizer_calls=0)
    original_fit, original_minimize = model.fit_linear_poisson, model.minimize

    def fit(*a, **kw):
        calls["fit_calls"] += 1
        if calls["fit_calls"] > 8:
            raise RuntimeError("Readback deterministic-fit budget exceeded")
        return original_fit(*a, **kw)

    def minimize(*a, **kw):
        calls["optimizer_calls"] += 1
        raise AssertionError("No optimizer permitted for this readback regression")

    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    model.fit_linear_poisson, model.minimize = fit, minimize
    started = time.monotonic()
    try:
        with (output / "unittest.txt").open("x", encoding="utf-8") as stream:
            selected = "image_column_fit_readback_test"
            if args.only_rank:
                selected += ".ColumnFitReadback.test_rank_deficient_background_solution_and_wrong_unknown_are_refused"
            suite = unittest.defaultTestLoader.loadTestsFromName(selected)
            result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
        raw_files = {str(p.relative_to(output)).replace("\\", "/"): digest(p)
                     for p in sorted(output.rglob("*")) if p.is_file()}
        record = dict(run_id=args.run_id, status="PASS" if result.wasSuccessful() else "FAIL",
            expected_pre_fix_failure=args.run_id.startswith("candidate"), tests=result.testsRun,
            failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
            seconds=time.monotonic()-started, **calls,
            source_checkout=source.name,
            source_commit=subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip(),
            source_status=subprocess.check_output(["git", "-C", str(source), "status", "--short"], text=True).splitlines(),
            source_files_sha256={name: digest(source / name) for name in
                ("tools/image_column_fit.py", "tools/image_column_model.py", "tools/image_numeric.py", "tools/image_workspace.py")},
            test_sha256=digest(ROOT / "tests/image_column_fit_readback_test.py"),
            harness_sha256=digest(Path(__file__)),
            environment=dict(python=platform.python_version(), numpy=numpy.__version__, scipy=scipy.__version__, pillow=PIL.__version__),
            raw_artifacts=str(output.relative_to(ROOT)).replace("\\", "/"), raw_files_sha256=raw_files,
            historical_workspace_read_only_requested=True, full_suite_run=False, generated_physical_simulations=0,
            scientific_gate="FAIL: 10.034456% >10% (unchanged)", formal_blind="NOT_TESTED")
        summary = ROOT / "docs/conditional-s2/validation" / ("readback-p2-"+args.run_id+".json")
        with summary.open("x", encoding="utf-8") as stream:
            json.dump(record, stream, indent=2)
            stream.write("\n")
        print(json.dumps({k: v for k, v in record.items() if k != "raw_files_sha256"}), flush=True)
        return 0 if result.wasSuccessful() else 1
    finally:
        model.fit_linear_poisson, model.minimize = original_fit, original_minimize


if __name__ == "__main__":
    raise SystemExit(main())
