"""Explicit conditional S2 evidence; replay/read/export never optimize.

X,Y geometry is caller supplied. Arrays are Y,X. The saved raw baseline, total
readout and extrapolated full-plane central integral are different observables.
"""
import copy
import hashlib
from importlib.metadata import PackageNotFoundError, version
import math
from pathlib import Path

import numpy as np

FIELDS = {"column_fit": {"object_id", "rect", "reference_comparison", "geometry", "count_interpretation"}}
VERSION = 1
SOURCE_MODEL_SHA256 = "87c0cf265e2b663e01aea622ec4b7b032930d765ea7b45697f50bb5d9088d210"
SOLVER = dict(method="L-BFGS-B", maxiter=200, maxfun=800, maxls=20,
              ftol=1e-11, gtol=1e-7, projected_gradient_limit=5e-6,
              singular_ratio_floor=1e-10, mean_floor=1e-12)
BUDGET = dict(max_sites=9, max_supplied_columns=256, pixels_per_fit=81,
              max_design_columns=80, max_optimizer_calls=9,
              max_patch_count_sum=2**53-1)
LIMITATIONS = [
    "Caller supplied independent-Poisson count interpretation is unverified; integer dtype is not evidence of counts",
    "Gaussian shape, common width, fixed geometry and same-class references are caller supplied and unverified",
    "Joint fitting means multiple columns within each patch; target/reference patches are not a global independent joint likelihood",
    "Fixed 5x5 raw and fitted total means differ from the extrapolated full-plane Gaussian central-column integral",
    "Numerical rank and convergence do not establish statistical identifiability or physical model validity",
    "Same-image or overlapping references can be correlated; failed references are never dropped",
    "Deviance is descriptive, not a chi-square p-value; no calibrated interval, occupancy, defect or phase conclusion",
]
OBSERVABLES = dict(
    raw_baseline="stored scalar counts per pixel only under the caller interpretation; unchanged raw fixed-ROI statistics",
    fitted_total_roi_mean="predicted count mean per pixel in the original 5x5 ROI, including background and all selected columns",
    central_integral="counts extrapolated to the full plane under the fixed unit-integral Gaussian shape; not an observed ROI sum")


def _model():
    if __package__:
        from . import image_column_model
    else:
        import image_column_model
    return image_column_model


def _finite(v):
    return type(v) in (int, float) and math.isfinite(v)


def _text(v):
    return type(v) is str and 1 <= len(v.strip()) <= 2000


def _coordinates(v, low, high):
    return (type(v) is list and low <= len(v) <= high and
            all(type(p) is list and len(p) == 2 and all(_finite(x) for x in p) for p in v))


def _clean(v):
    if isinstance(v, np.ndarray):
        return v.tolist()
    if isinstance(v, np.generic):
        return v.item()
    if type(v) is dict:
        return {k: _clean(x) for k, x in v.items()}
    if type(v) in (list, tuple):
        return [_clean(x) for x in v]
    return v


def _same_numbers(a, b):
    if type(a) is dict and type(b) is dict:
        return a.keys() == b.keys() and all(_same_numbers(a[k], b[k]) for k in a)
    if type(a) is list and type(b) is list:
        return len(a) == len(b) and all(_same_numbers(x, y) for x, y in zip(a, b))
    if type(a) is bool or type(b) is bool:
        return type(a) is type(b) and a == b
    if _finite(a) and _finite(b):
        return math.isclose(a, b, rel_tol=2e-11, abs_tol=2e-11)
    return a == b


def _baseline(workspace, request, api):
    raw = {k: request[k] for k in ("object_id", "rect", "reference_comparison")}
    try:
        with np.errstate(over="raise", invalid="raise"):
            return api.numeric.statistics(workspace, raw), None
    except (FloatingPointError, OverflowError):
        return None, "UNKNOWN_RAW_NUMERIC_RANGE"
    except api.numeric.NumericError as error:
        if "finite binary64 range" not in str(error):
            raise
        return None, "UNKNOWN_RAW_NUMERIC_RANGE"


def _prepare(workspace, request, api):
    """Deterministic admission only: no SVD, optimizer or random generation."""
    api.need(set(request) <= FIELDS["column_fit"] | {"action", "workspace", "request_id"}, "Unknown column-fit field")
    operand = api.numeric.NumericReader().operand(workspace, request)
    api.need(not operand["spectral"] and operand["coordinate_space"] == "source_pixels" and
             operand["component"] == "raw", "Column fit requires a spatial scalar source plane")
    rect = request.get("rect")
    bounds = operand["bounds"]
    def valid_rect(r):
        return (type(r) is list and len(r) == 4 and all(type(x) is int for x in r) and
                bounds[0] <= r[0] < r[2] <= bounds[2] and bounds[1] <= r[1] < r[3] <= bounds[3] and
                r[2]-r[0] == r[3]-r[1] == 5)
    api.need(valid_rect(rect), "Column-fit primary rect must be an in-bounds half-open 5x5 ROI")
    ref = request.get("reference_comparison")
    api.need(type(ref) is dict and set(ref) == {"reference_rects", "source_text"} and _text(ref.get("source_text")),
             "Provide reference_rects and actual same-class reference source_text")
    refs = ref.get("reference_rects")
    api.need(type(refs) is list and 1 <= len(refs) <= 8 and all(valid_rect(r) for r in refs),
             "Provide 1..8 same-image in-bounds 5x5 reference rects")
    rects = [rect, *refs]
    api.need(len({tuple(r) for r in rects}) == len(rects), "Duplicate or primary reference ROI")
    baseline, baseline_unknown = _baseline(workspace, request, api)
    noise, geometry = request.get("count_interpretation"), request.get("geometry")
    if noise is not None:
        api.need(type(noise) is dict and set(noise) == {"model", "source_text"} and
                 type(noise.get("model")) is str and 1 <= len(noise["model"]) <= 128 and _text(noise.get("source_text")),
                 "count_interpretation requires a bounded model and actual source_text")
    if geometry is not None:
        api.need(type(geometry) is dict and set(geometry) == {"site_centers_xy", "supplied_columns_xy", "sigma_pixels", "source_text"},
                 "Geometry requires site_centers_xy, supplied_columns_xy, sigma_pixels and source_text")
        api.need(_coordinates(geometry.get("site_centers_xy"), 2, 9) and len(geometry["site_centers_xy"]) == len(rects),
                 "Site centers must correspond exactly to target then each reference ROI")
        api.need(_coordinates(geometry.get("supplied_columns_xy"), 1, 256) and _finite(geometry.get("sigma_pixels")) and
                 geometry["sigma_pixels"] > 0 and _text(geometry.get("source_text")), "Bounded finite supplied columns, positive common sigma and source text required")
        api.need(all(r[0] <= c[0] < r[2] and r[1] <= c[1] < r[3]
                     for r, c in zip(rects, geometry["site_centers_xy"])), "Each supplied site center must lie inside its corresponding fixed half-open ROI")
    global_status = ("UNKNOWN_UNSUPPORTED_NOISE" if noise is None or noise["model"] != "independent_poisson_counts" else
                     "UNKNOWN_NO_GEOMETRY" if geometry is None else None)
    if global_status is None:
        columns = np.asarray(geometry["supplied_columns_xy"], dtype=float)
        # Compare bounded coordinate components rather than squaring huge floats.
        duplicate = any(np.max(np.abs(a-b)) <= 1e-6 for i, a in enumerate(columns) for b in columns[i+1:])
        if duplicate:
            global_status = "UNKNOWN_DUPLICATE_GEOMETRY"
        elif any(not any(np.max(np.abs(columns-c), axis=1) <= 1e-6) for c in geometry["site_centers_xy"]):
            global_status = "UNKNOWN_INCOMPLETE_SUPPLIED_GEOMETRY"
    plans = []
    for i, r in enumerate(rects):
        support = [r[0]-2, r[1]-2, r[2]+2, r[3]+2]
        plan = dict(site_index=i, role="target" if i == 0 else "reference", readout_rect_xyxy=r,
                    fit_rect_xyxy=support, center_xy=None if geometry is None else geometry["site_centers_xy"][i],
                    selected_columns_xy=[], omitted_by_support_columns_xy=[], design_shape=None)
        status = global_status
        if status is None and not (bounds[0] <= support[0] and bounds[1] <= support[1] and support[2] <= bounds[2] and support[3] <= bounds[3]):
            status = "UNKNOWN_FIT_SUPPORT_OUTSIDE_SOURCE"
        if status is None:
            x0, y0, x1, y1 = support
            yy, xx = np.mgrid[y0:y1, x0:x1]
            pixels = np.column_stack([xx.ravel(), yy.ravel()])
            values = operand["values"][y0-bounds[1]:y1-bounds[1], x0-bounds[0]:x1-bounds[0]].astype(float).ravel()
            if np.any(values < 0) or np.any(values != np.floor(values)):
                status = "UNKNOWN_UNSUPPORTED_NOISE"
            else:
                with np.errstate(over="ignore", invalid="ignore"):
                    total = float(np.sum(values))
                if not math.isfinite(total) or total > BUDGET["max_patch_count_sum"]:
                    status = "UNKNOWN_COUNT_RANGE"
            if status is None:
                model = _model()
                try:
                    with np.errstate(over="raise", invalid="raise", divide="raise"):
                        chosen = model.selected_centers(pixels, plan["center_xy"], columns, geometry["sigma_pixels"], "S2")
                        peak = model.gaussian_pixels(pixels, chosen, geometry["sigma_pixels"])
                        design = np.column_stack([peak, model.background_basis(pixels)])
                    plan["selected_columns_xy"] = chosen.tolist()
                    plan["omitted_by_support_columns_xy"] = [c.tolist() for c in columns
                        if not any(np.max(np.abs(c-a)) <= 1e-6 for a in chosen)]
                    plan["design_shape"] = list(design.shape)
                    if design.shape[1] >= design.shape[0]:
                        status = "UNKNOWN_DESIGN_BUDGET"
                    elif not np.isfinite(design).all() or np.any(design < 0):
                        status = "UNKNOWN_MODEL_NUMERIC_RANGE"
                    elif np.any((np.sum(design, axis=0) > 0) &
                                (np.sum(design, axis=0) < max(total, 1.)/np.finfo(float).max)):
                        status = "UNKNOWN_MODEL_NUMERIC_RANGE"
                    else:
                        plan.update(_design=design, _values=values)
                except (FloatingPointError, OverflowError, ValueError):
                    status = "UNKNOWN_MODEL_NUMERIC_RANGE"
        plan["_status"] = status
        plans.append(plan)
    return operand, baseline, baseline_unknown, plans


def _public_plan(plan):
    return {k: copy.deepcopy(v) for k, v in plan.items() if not k.startswith("_")}


def _accepted(fit):
    if fit["status"] != "CONDITIONAL_POINT_ESTIMATE":
        return dict(fitted_total_roi_mean=None, central_integral=None)
    mu = np.asarray(fit["mu"]).reshape(9, 9)
    return dict(fitted_total_roi_mean=float(np.mean(mu[2:7, 2:7])), central_integral=float(fit["coefficients"][0]))


def _whole(sites):
    failed = [s["site_index"] for s in sites if s["status"] != "CONDITIONAL_POINT_ESTIMATE"]
    if failed:
        return dict(status="UNKNOWN_REQUIRED_SITE", failed_site_indices=failed,
                    fitted_total_mean_difference=None, central_integral_difference=None)
    means = [s["accepted"]["fitted_total_roi_mean"] for s in sites]
    components = [s["accepted"]["central_integral"] for s in sites]
    return dict(status="CONDITIONAL_POINT_ESTIMATE", failed_site_indices=[],
                fitted_total_mean_difference=float(means[0]-np.median(means[1:])),
                central_integral_difference=float(components[0]-np.median(components[1:])))


def run(workspace, request, ident, directory, metadata, api):
    operand, baseline, baseline_unknown, plans = _prepare(workspace, request, api)
    sites, calls, optimizations = [], 0, 0
    for plan in plans:
        site = _public_plan(plan)
        if plan["_status"] is not None:
            site.update(status=plan["_status"], accepted=dict(fitted_total_roi_mean=None, central_integral=None), diagnostics=None)
        else:
            calls += 1
            fit = _model().fit_linear_poisson(plan["_values"], plan["_design"])
            optimizations += int(fit.get("evaluations", 0) > 0)
            site.update(status=fit["status"], accepted=_accepted(fit), diagnostics=_clean(fit))
        # Preserve each returned patch before publishing aggregate evidence.
        api.write_new(directory / ("column-fit-site-%d.json" % plan["site_index"]), api.canonical(site)+b"\n")
        sites.append(site)
    report = dict(column_fit_version=VERSION, algorithm="fixed_geometry_s2_v1", **api.numeric.common(operand),
                  parent_object_id=request["object_id"], source_rect_xyxy=request["rect"],
                  reference_rects=request["reference_comparison"]["reference_rects"],
                  raw_baseline=baseline, raw_baseline_status=baseline_unknown or "AVAILABLE",
                  assumptions=dict(geometry=request.get("geometry"), count_interpretation=request.get("count_interpretation"),
                                   reference_source_text=request["reference_comparison"]["source_text"], verified=False),
                  model_provenance=dict(research_model_sha256=SOURCE_MODEL_SHA256,
                       numerical_core_sha256=api.sha_file(Path(__file__).with_name("image_column_model.py")),
                       adapter_sha256=api.sha_file(Path(__file__))),
                  solver_configuration=SOLVER, operational_budget=BUDGET, fit_calls=calls, optimizer_calls=optimizations,
                  sites=sites, whole_comparison=_whole(sites), limitations=LIMITATIONS,
                  observables=OBSERVABLES,
                  confidence_interval=None, physical_classification="UNKNOWN", physical_model_verified=False)
    def overlaps(a, b):
        return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])
    report["overlapping_fit_support_pairs"] = [[i, j] for i, a in enumerate(sites) for j, b in enumerate(sites)
        if i < j and overlaps(a["fit_rect_xyxy"], b["fit_rect_xyxy"])]
    # The workspace publisher owns the outer software_provenance envelope.
    # Preserve this adapter's provenance in a separate immutable field.
    report["numeric_provenance"] = report.pop("software_provenance")
    try:
        report["numeric_provenance"]["scipy"] = version("scipy")
    except PackageNotFoundError:
        report["numeric_provenance"]["scipy"] = None
    report.pop("computation")
    api.write_new(directory / "column-fit.json", api.canonical(report)+b"\n")
    metadata.update(report)
    return metadata


def _validate_fit(plan, site, api):
    """Algebraic verification of saved values, never minimize/fit_linear_poisson."""
    fit = site.get("diagnostics")
    api.need(type(fit) is dict and fit.get("status") == site.get("status"), "Saved fit diagnostic status mismatch", "CORRUPT_OBJECT")
    B, y = plan["_design"], plan["_values"]
    # Reconstruct the frozen solver's admission order before inspecting saved
    # coefficients. A projected-gradient check alone cannot establish rank, and
    # zero counts can have zero projected gradient at the all-zero coefficients.
    masses = np.sum(B, axis=0)
    early = None
    if np.sum(y) == 0:
        early = dict(status="UNKNOWN_ZERO_COUNTS", evaluations=0, iterations=0,
                     mu=np.zeros_like(y).tolist(), coefficients=None)
    elif np.any(masses <= 0):
        early = dict(status="UNKNOWN_ZERO_DESIGN_COLUMN", evaluations=0, iterations=0,
                     mu=None, coefficients=None)
    else:
        A = B/masses
        singular = np.linalg.svd(A, compute_uv=False)
        if singular[-1] <= 1e-10*singular[0]:
            early = dict(status="UNKNOWN_NONIDENTIFIABLE_DESIGN", evaluations=0, iterations=0,
                         mu=None, coefficients=None,
                         smallest_singular_ratio=float(singular[-1]/singular[0]))
    if early is not None:
        api.need(type(fit.get("evaluations")) is int and type(fit.get("iterations")) is int and
                 _same_numbers(fit, early) and site["accepted"] == _accepted(early),
                 "Saved fit contradicts zero-count/design/rank admission", "CORRUPT_OBJECT")
        return
    coef, mu = fit.get("coefficients"), fit.get("mu")
    api.need(coef is not None and site["status"] in ("CONDITIONAL_POINT_ESTIMATE", "UNKNOWN_NOT_CONVERGED"),
             "Missing saved optimizer coefficients or invalid fit status", "CORRUPT_OBJECT")
    coef = np.asarray(coef, dtype=float)
    api.need(coef.shape == (B.shape[1],) and np.isfinite(coef).all() and np.all(coef >= 0), "Invalid saved coefficients", "CORRUPT_OBJECT")
    predicted = np.maximum(B @ coef, 1e-12)
    api.need(_same_numbers(mu, predicted.tolist()), "Saved predicted pixels disagree with coefficients", "CORRUPT_OBJECT")
    scale = max(float(np.sum(y)), 1.)
    x = coef*masses/scale
    _, gradient = _model().poisson_objective(x, A, y, scale)
    gradient[(x <= 1e-10) & (gradient > 0)] = 0
    pg = float(np.max(np.abs(gradient)))
    api.need(_same_numbers(pg, fit.get("projected_gradient")), "Changed saved projected gradient", "CORRUPT_OBJECT")
    if site["status"] == "CONDITIONAL_POINT_ESTIMATE":
        api.need(fit.get("optimizer_success") is True and pg <= 5e-6 and
                 _same_numbers(site["accepted"], _accepted(fit)), "Saved fit is not an eligible conditional estimate", "CORRUPT_OBJECT")
    else:
        api.need(site["accepted"] == dict(fitted_total_roi_mean=None, central_integral=None), "Failed fit exposed accepted values", "CORRUPT_OBJECT")


def validate_references(workspace, record, api):
    api.need(record.get("column_fit_version") == VERSION and record.get("algorithm") == "fixed_geometry_s2_v1", "Unsupported saved column-fit version", "CORRUPT_OBJECT")
    api.need(record.get("confidence_interval") is None and record.get("physical_classification") == "UNKNOWN" and
             record.get("physical_model_verified") is False and record.get("limitations") == LIMITATIONS and
             record.get("observables") == OBSERVABLES and record.get("component") == "raw" and record.get("coordinate_space") == "source_pixels",
             "Changed conditional/physical meaning of saved column-fit evidence", "CORRUPT_OBJECT")
    journal = api.read_json(workspace.root / "requests" / (record["request_id"]+".json"))
    request = journal.get("parameters")
    api.need(type(request) is dict and request.get("action") == "column_fit" and request.get("request_id") == record["request_id"] and
             request.get("workspace") == str(workspace.root) and request.get("object_id") == record.get("parent_object_id") and
             journal.get("parameters_sha256") == hashlib.sha256(api.canonical(request)).hexdigest(), "Column-fit original request identity changed", "CORRUPT_OBJECT")
    directory = workspace.root / "objects" / record["object_id"]
    report = api.read_json(directory / "column-fit.json")
    api.need(all(record.get(k) == v for k, v in report.items()), "Column-fit report and object disagree", "CORRUPT_OBJECT")
    operand, baseline, unknown, plans = _prepare(workspace, request, api)
    # These scientific fields are reconstructed from the original request's
    # selected source/revision, including the actual NPY dtype. Historical
    # runtime versions describe the original execution and are not rebuilt.
    source_common = {k: v for k, v in api.numeric.common(operand).items()
                     if k not in ("software_provenance", "computation")}
    api.need(all(all(k in saved for k in source_common) and
                 api.canonical({k: saved[k] for k in source_common}) == api.canonical(source_common)
                 for saved in (record, report)),
             "Column-fit source metadata/meaning changed", "CORRUPT_OBJECT")
    def science_baseline(value):
        return None if value is None else {k: v for k, v in value.items() if k not in ("software_provenance", "computation")}
    api.need(record.get("scientific_grid_identity") == operand["scientific_grid_identity"] and
             record.get("source_rect_xyxy") == request["rect"] and
             record.get("reference_rects") == request["reference_comparison"]["reference_rects"] and
             record.get("assumptions") == dict(geometry=request.get("geometry"), count_interpretation=request.get("count_interpretation"),
                 reference_source_text=request["reference_comparison"]["source_text"], verified=False) and
             science_baseline(record.get("raw_baseline")) == science_baseline(baseline) and
             record.get("raw_baseline_status") == (unknown or "AVAILABLE"), "Column-fit source/raw baseline/assumptions changed", "CORRUPT_OBJECT")
    sites = record.get("sites")
    api.need(type(sites) is list and len(sites) == len(plans), "Changed column-fit site count", "CORRUPT_OBJECT")
    overlaps = lambda a, b: max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])
    api.need(record.get("overlapping_fit_support_pairs") == [[i, j] for i, a in enumerate(plans) for j, b in enumerate(plans)
        if i < j and overlaps(a["fit_rect_xyxy"], b["fit_rect_xyxy"])], "Changed fit-support overlap evidence", "CORRUPT_OBJECT")
    for plan, site in zip(plans, sites):
        api.need(all(site.get(k) == v for k, v in _public_plan(plan).items()) and
                 api.read_json(directory / ("column-fit-site-%d.json" % plan["site_index"])) == site,
                 "Changed saved site support/geometry", "CORRUPT_OBJECT")
        if plan["_status"] is not None:
            api.need(site.get("status") == plan["_status"] and site.get("diagnostics") is None and
                     site.get("accepted") == dict(fitted_total_roi_mean=None, central_integral=None), "Changed admission UNKNOWN", "CORRUPT_OBJECT")
        else:
            _validate_fit(plan, site, api)
    api.need(record.get("whole_comparison") == _whole(sites) and
             record.get("fit_calls") == sum(p["_status"] is None for p in plans) and
             record.get("optimizer_calls") == sum(s["diagnostics"] is not None and s["diagnostics"].get("evaluations", 0) > 0 for s in sites) and
             record.get("solver_configuration") == SOLVER and record.get("operational_budget") == BUDGET and
             record.get("model_provenance", {}).get("research_model_sha256") == SOURCE_MODEL_SHA256,
             "Changed aggregate/gates/model identity", "CORRUPT_OBJECT")
    return record
