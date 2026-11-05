"""Run only affected S2/legacy observation regressions; preserve every attempt."""
import argparse
import json
import os
from pathlib import Path
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]
for key in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
from tools import image_column_model as model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempt", required=True, type=int)
    options = parser.parse_args()
    dest = ROOT / "docs/conditional-s2/validation"
    log = dest / ("python-attempt-%d.txt" % options.attempt)
    summary = dest / ("python-attempt-%d.json" % options.attempt)
    assert not summary.exists(), "Do not overwrite an earlier validation attempt"
    stream = log.open("x", encoding="utf-8")
    calls = dict(fit_calls=0, optimizer_calls=0)
    original_fit, original_minimize = model.fit_linear_poisson, model.minimize
    def fit(*args, **kwargs):
        calls["fit_calls"] += 1
        if calls["fit_calls"] > 16:
            raise RuntimeError("S2 validation fit budget exceeded")
        return original_fit(*args, **kwargs)
    def minimize(*args, **kwargs):
        calls["optimizer_calls"] += 1
        return original_minimize(*args, **kwargs)
    model.fit_linear_poisson, model.minimize = fit, minimize
    started = time.monotonic()
    try:
        suite = unittest.TestSuite([
            unittest.defaultTestLoader.loadTestsFromName("image_column_fit_test"),
            unittest.defaultTestLoader.loadTestsFromName("image_point_observation_test.PointObservations")])
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
        # Reuse the exact integration fixture for the stdio transport boundary.
        # It is the same count realization, not another independent sample.
        if result.wasSuccessful():
            import tifffile
            from image_column_fit_test import ConditionalColumnFit
            fixture = ROOT / "outputs/conditional-s2-validation"
            fixture.mkdir(parents=True, exist_ok=True)
            tifffile.imwrite(fixture / "counts.tiff", ConditionalColumnFit.positive, photometric="minisblack")
        record = dict(status="PASS" if result.wasSuccessful() else "FAIL", tests=result.testsRun,
                      failures=len(result.failures), errors=len(result.errors), seconds=time.monotonic()-started,
                      **calls, scope="Bounded conditional-S2 software integration; not physical validation",
                      full_suite_run=False, generated_physical_simulations=0)
        summary.write_text(json.dumps(record, indent=2)+"\n", encoding="utf-8")
        print(json.dumps(record), flush=True)
        return 0 if result.wasSuccessful() else 1
    finally:
        model.fit_linear_poisson, model.minimize = original_fit, original_minimize
        stream.close()


if __name__ == "__main__":
    raise SystemExit(main())
