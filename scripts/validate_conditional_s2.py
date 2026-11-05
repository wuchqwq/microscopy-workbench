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
    parser.add_argument("--followup", action="store_true")
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
        if calls["fit_calls"] > (2 if options.followup else 16):
            raise RuntimeError("S2 validation fit budget exceeded")
        return original_fit(*args, **kwargs)
    def minimize(*args, **kwargs):
        calls["optimizer_calls"] += 1
        return original_minimize(*args, **kwargs)
    model.fit_linear_poisson, model.minimize = fit, minimize
    started = time.monotonic()
    try:
        if options.followup:
            os.environ["S2_VALIDATION_ARTIFACT_ROOT"] = str(ROOT / "outputs/conditional-s2-diagnostic-reproduction-v1")
            selected = ["test_independent_count_truth_raw_baseline_and_distinct_readouts",
                        "test_historical_read_recovery_export_review_and_original_request_never_refit",
                        "test_source_and_coherently_rehashed_coefficients_cannot_change_saved_evidence"]
            suite = unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromName(
                "image_column_fit_test.ConditionalColumnFit."+name) for name in selected])
        else:
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
            if options.followup:
                original = ConditionalColumnFit._base_result
                # Original noisy ref remains in the diagnostic record. This new
                # repeated patch is solely a deterministic transport fixture.
                transport = ConditionalColumnFit.positive.copy()
                transport[40:49, 40:49] = transport[16:25, 16:25]
                tifffile.imwrite(fixture / "transport-counts.tiff", transport, photometric="minisblack")
                diagnostic = dict(run_id="conditional-s2-diagnostic-reproduction-v1", original_attempt_2=False,
                    original_attempt_2_diagnostics="UNKNOWN_NO_SAVED_DIAGNOSTIC", whole_comparison=original["whole_comparison"],
                    sites=[dict(site_index=s["site_index"], status=s["status"], accepted=s["accepted"],
                        optimizer_success=s["diagnostics"].get("optimizer_success"), projected_gradient=s["diagnostics"].get("projected_gradient"),
                        reason=s["diagnostics"].get("message"), iterations=s["diagnostics"].get("iterations"),
                        evaluations=s["diagnostics"].get("evaluations")) for s in original["sites"]],
                    scipy=original["numeric_provenance"]["scipy"],
                    source_array_sha256=original["scientific_grid_identity"]["array_sha256"],
                    stored_provider_records="outputs/conditional-s2-diagnostic-reproduction-v1/images",
                    transport_copy=dict(source_xyxy=[16,16,25,25], destination_xyxy=[40,40,49,49],
                        independent_observations=False, purpose="CPE transport only; no accuracy evidence"))
                (dest / "diagnostic-reproduction-v1.json").write_text(json.dumps(diagnostic,indent=2)+"\n",encoding="utf-8")
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
