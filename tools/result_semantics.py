"""Additive Route A result semantics. No numerical engine, thresholds or migration.

Only new publication calls attach(). validate() never adds fields to old records.
Source paths refer to the owning manifest, not recursively copied evidence.
"""
import json

VERSION = 1
SCOPE = "candidate_measurement_and_assisted_interpretation"
MAX_BYTES = 24 * 1024
STATUSES = frozenset(("satisfied", "issues_detected", "not_assessed", "insufficient_evidence"))
IMAGE_KINDS = frozenset(("fft", "measure", "peak_measurements", "spatial_atlas", "joint_observations",
                         "local_signature_compare", "feature_field", "spatial_field", "field_extend",
                         "domain_map", "gpa", "topology"))
STRUCTURE_KINDS = frozenset(("compare", "register", "compare_batch", "crystal_evidence", "twin_compare"))
_MISSING = object()


def _get(record, path):
    value = record
    for part in path.split("."):
        if type(value) is not dict or part not in value:
            return _MISSING
        value = value[part]
    return value


def _row(record, aspect, scope, status, basis, *paths):
    references = [path for path in paths if _get(record, path) is not _MISSING]
    if status == "satisfied" and not references:
        status = "not_assessed"
        basis = "The owning manifest does not contain the fields needed to establish this check."
    return {"aspect": aspect, "scope": scope, "status": status, "basis": basis,
            "source_fields": references}


def _mapped(value, satisfied=(), issues=(), insufficient=()):
    # Explicit per-module mappings only. An unrecognized legacy status is unknown.
    return ("satisfied" if value in satisfied else "issues_detected" if value in issues else
            "insufficient_evidence" if value in insufficient else "not_assessed")


def _group_status(rows, field, satisfied, issues, insufficient):
    values = [_mapped(row.get(field), satisfied, issues, insufficient) for row in rows if type(row) is dict]
    if not values or "not_assessed" in values:
        return "not_assessed"
    if "issues_detected" in values:
        return "issues_detected"
    if "insufficient_evidence" in values:
        return "insufficient_evidence"
    return "satisfied"


def _unknown_reliability(record, scope):
    reasons = (
        ("noise_significance", "No qualified noise significance or false-discovery assessment is recorded by this operation."),
        ("localization_uncertainty", "Coordinates, interpolation and geometric residuals are not a calibrated localization uncertainty."),
        ("resolvability", "This operation does not independently establish separability of nearby observed components."),
        ("parameter_sensitivity", "This result alone does not execute a controlled parameter-sensitivity comparison."),
    )
    return [_row(record, aspect, scope, "not_assessed", basis) for aspect, basis in reasons]


def build(record):
    """Return bounded semantics for an explicit supported producer, else None.

    This consumes the owning algorithm's saved diagnostics; it does not recalculate
    an FFT or infer confidence from validity masks. Publication follows successful
    completion, while checks can still be insufficient or report issues.
    """
    backend, kind = record.get("backend"), record.get("kind")
    is_image = backend == "external-image-workspace"
    is_structure = backend == "external-structure-workspace"
    peaks = is_image and kind == "fft_view" and type(record.get("peak_detection")) is dict
    if not (is_image and (kind in IMAGE_KINDS or peaks) or is_structure and kind in STRUCTURE_KINDS):
        return None
    scope = "saved " + ("FFT peak candidate detection" if peaks else kind) + " result"
    checks, interpretations = [], []
    reliability = _unknown_reliability(record, scope)
    def check(aspect, scoped, status, basis, *paths):
        checks.append(_row(record, aspect, scoped, status, basis, *paths))
    def interpret(aspect, scoped, status, basis, *paths):
        interpretations.append(_row(record, aspect, scoped, status, basis, *paths))

    if peaks:
        contrast = _get(record, "peak_quality.numerical_contrast.status")
        check("global_numerical_contrast", "overall eligible non-DC FFT amplitude variation, not each peak",
              _mapped(contrast, ("resolved_amplitude_variation",), (), ("insufficient_evidence",)),
              "The saved detector's overall numerical-contrast policy is not noise significance, an individual-peak qualification or a certified FFT error bound.",
              "peak_quality.numerical_contrast", "peak_detection")
        cap = _get(record, "peak_quality.selection_limit_reached")
        check("selection_capacity", "the saved peak-table return cap",
              "issues_detected" if cap is True else "satisfied" if cap is False else "not_assessed",
              "Reaching the explicit cap leaves completeness unresolved; absence of cap truncation does not prove all reflections were detected.",
              "peak_quality.selection_limit_reached", "peak_parameters", "peak_table")
        interpret("peak_candidates", "reported local maxima and optional interpolated coordinates", "not_assessed",
                  "Saved peaks are working candidates. Their detection/refinement does not certify true lattice reflections or physical origin.", "peak_table", "peak_quality.limitations")
    elif is_image and kind == "fft":
        check("finite_fft", "the computed complex FFT after the recorded preprocessing", "satisfied",
              "The FFT producer rejected nonfinite output; this check does not assess periodicity or image formation.",
              "dtype", "shape_yx", "algorithm", "preprocessing_order", "window", "subtract_mean")
    elif is_image and kind == "measure":
        check("coordinate_geometry", "the two explicitly selected points on the saved grid", "satisfied",
              "The measurement producer checked coordinate domain, bounds and finite geometry. Point-selection accuracy is not thereby assessed.",
              "points", "coordinate_space", "scientific_grid_identity", "measurement_domain")
        physical = any(record.get(key) is not None for key in ("physical_distance", "physical_frequency_magnitude"))
        check("physical_coordinate_availability", "conversion to sourced physical units only",
              "satisfied" if physical else "insufficient_evidence",
              "A sourced active scale permits conditional physical geometry; missing scale leaves pixel-domain observations available and does not invalidate them.",
              "xy_calibration", "calibration_dependency", "measurement_domain", "physical_frequency_magnitude", "physical_distance")
        reliability.append(_row(record, "calibration_uncertainty", "localization and scale covariance", "not_assessed",
                                "Sourced scale values are not an independent metrological uncertainty estimate.", "measurement_uncertainty", "uncertainty_status"))
    elif is_image and kind == "local_signature_compare":
        rows = record.get("relations", [])
        status = _group_status(rows, "status", ("compatible_signature",), ("incompatible", "partial_match", "ambiguous"),
                               ("insufficient_evidence", "insufficient_geometry", "incomplete_detection", "not_comparable"))
        # Old semantics v1 could label missing physical calibration incompatible.
        if record.get("evidence_semantics_version", 1) != 2:
            status = "not_assessed"
        interpret("finite_signature_comparison", "selected reciprocal families, supplied angles, coordinate domain and tolerance", status,
                  "Only the saved versioned finite geometry comparison is summarized; unresolved or incompatible rows do not rule out all physical explanations. Legacy admission reasons retain their original meaning.",
                  "relations", "source_entries", "angles_degrees", "coordinate_domain", "tolerance", "evidence_semantics_version")
    elif is_image and kind in ("feature_field", "spatial_field", "field_extend"):
        rows = record.get("samples", [])
        status = _group_status(rows, "status", ("valid",), ("ambiguous",), ("insufficient_evidence",))
        check("multidirection_descriptor_admission", "stored descriptor rows, not validity of every constituent period", status,
              "Legacy valid admits saved geometry/ROI/two noncollinear families and finite descriptors. Individual row statuses remain authoritative. One-direction feature insufficiency does not invalidate a conditional one-direction period.",
              "samples", "validity_mask", "coordinate_domain")
        interpret("structure_descriptor", "image reciprocal descriptors under saved settings", "not_assessed",
                  "Numerical descriptor admission does not establish a reliable material lattice, orientation domain or phase. Overlapping windows share observations.", "samples", "limitations")
    elif is_image and kind == "domain_map":
        interpret("candidate_domains", "connected compatible sampled signatures at the declared tolerance", "not_assessed",
                  "Candidate graph domains and support-enclosing boundary bands are descriptive hypotheses, not material domains or located interfaces. Per-edge compatible/different/unknown statuses remain in the saved rows.",
                  "domains", "edges", "samples", "boundary_bands", "angles_degrees", "tolerance", "cross_scale_policy")
    elif is_image and kind in ("peak_measurements", "spatial_atlas", "joint_observations"):
        interpret("selected_observations", "the saved automatic or explicitly selected measurement rows", "not_assessed",
                  "Observed/VERIFIED describe saved measurements or coordinate correspondence, not physical verification. Manual selections remain caller selections; processing variants are not independent experiments.",
                  "measurements", "regions", "frame_observations", "matching", "interpretation_status")
    elif is_image and kind == "gpa":
        check("conditional_field_support", "GPA phase/displacement/tensor masks on the saved image and reference", "satisfied",
              "The producer checks finite conditional field support, band/reference guards and stable tensor geometry; only the saved masks identify eligible pixels. This is not material-strain validation.",
              "report.quality", "report.reference_semantics", "array_manifest", "parameters")
        assessment = record.get("evidence_assessment")
        status = _mapped(assessment.get("material_strain_status") if type(assessment) is dict else None,
                         (), (), ("insufficient_evidence",))
        interpret("material_strain", "material strain interpretation of the conditional image-phase field", status,
                  "Existing GPA evidence reasons and analytic transfer are preserved. A numerical validity mask or physical metric does not establish the displacement origin, model validity or material strain.",
                  "evidence_assessment", "material_strain_verified", "report.limitations")
        if type(assessment) is dict and "spatial_transfer" in assessment:
            reliability.append(_row(record, "analytic_transfer", "small-phase isolated-carrier model only", "satisfied",
                                    "An analytic transfer response was evaluated; it is not measured instrumental resolution, SNR or a corrected strain field.", "evidence_assessment.spatial_transfer"))
    elif is_image and kind == "topology":
        report = record.get("report", {})
        circuit_validity = [reflection.get("valid") for loop in report.get("loops", [])
                            for reflection in loop.get("reflections", [])]
        circuit_status = ("insufficient_evidence" if not circuit_validity else
                          "not_assessed" if any(type(value) is not bool for value in circuit_validity) else
                          "satisfied" if all(circuit_validity) else "issues_detected")
        check("conditional_circuit_checks", "per-loop wrapped-phase arithmetic and sampled-path checks", circuit_status,
              "This summarizes the saved circuit validity checks only; individual loop/reflection and group statuses remain authoritative. Integer residual is an arithmetic check, not confidence or a global Burgers fit.",
              "report.loops", "report.loop_groups", "report.status", "report.algorithm")
        dependency = report.get("band_dependency", {})
        qualified = dependency.get("qualified_cross_band_support")
        reliability.append(_row(record, "fourier_support_dependence", "actual saved Fourier masks modulo real-image conjugacy",
                                "satisfied" if qualified is True else "issues_detected" if qualified is False else "not_assessed",
                                "Disjoint saved support is only a necessary cross-band qualification; it does not establish statistical independence or a material model.", "report.band_dependency"))
        interpret("projected_phase_closure", "conditional projected phase constraints and per-group fits", "not_assessed",
                  "Retain the exact historical algorithm and grouped status. Conditional phase closure and finite candidate compatibility do not confirm a material dislocation or unique three-dimensional Burgers vector.",
                  "report.status", "report.projected_burgers", "report.loop_groups", "report.burgers_candidates", "material_dislocation_confirmed")
    elif is_structure and kind == "register":
        check("registration_fit", "fixed experimental scale/DC and fitted in-plane rotation",
              _mapped(record.get("fit_status"), ("within_declared_tolerance",), ("outside_declared_tolerance",)),
              "Fit residual acceptance is conditional on supplied correspondences and the declared deterministic tolerance, not candidate validation.",
              "fit_status", "fit_evidence", "allowed_degrees_of_freedom", "fixed_parameters", "max_residual_inv_angstrom")
        reliability.append(_row(record, "held_out_geometry", "saved disjoint-anchor geometric check, not independent experiment",
                                _mapped(record.get("held_out_geometry_status"), ("held_out_geometry_consistent",),
                                        ("fit_inconsistent", "held_out_inconsistent"), ()),
                                "No held-out points means not assessed. A consistent held-out geometry does not certify statistical or physical independent validation.",
                                "held_out_geometry_status", "validation_evidence", "held_out_independence", "independent_validation"))
    elif is_structure and kind == "compare":
        interpret("finite_reciprocal_comparison", "selected measured reflections versus one explicitly registered simulated candidate",
                  _mapped(record.get("comparison_status"), ("within_declared_geometric_tolerance",), ("partially_matched_or_inconsistent",)),
                  "Compatibility or conflict is conditional on the supplied candidate, calibration, registration and deterministic tolerance. Assignment ambiguity and unmatched reflections remain authoritative; no unique phase or certified HKL follows.",
                  "comparison_status", "ambiguity", "matched", "unmatched_experimental", "unmatched_simulated", "registration", "max_residual_inv_angstrom")
    elif is_structure and kind in ("crystal_evidence", "twin_compare"):
        interpret("finite_projected_candidates", "finite supplied projected candidates under the saved shared registration",
                  _mapped(record.get("status"), ("compatible",), ("incompatible",), ("insufficient_evidence",)),
                  "This is scoped geometric compatibility/conflict/insufficiency. Multiple projections can remain indistinguishable; conditional agreement is not unique phase, twin, three-dimensional structure or coherent interface verification.",
                  "status", "reason", "candidate_pairs", "projected_relation", "interface", "registration", "max_residual_inv_angstrom")
    elif is_structure and kind == "compare_batch":
        check("child_comparison_completion", "the requested finite comparison children",
              _mapped(record.get("batch_status"), ("completed",), ("partial_or_failed",)),
              "Child completion and receipts describe actual operations, not whether candidates are physically accepted. Unresolved children must not be replayed automatically.",
              "batch_status", "child_receipts", "requested_candidate_count", "completed_candidate_count")
        interpret("finite_candidate_batch", "per-candidate saved geometric comparisons", "not_assessed",
                  "Read each candidate/child result with its own scope. Aggregation does not provide independent evidence, calibrated candidate probabilities or unique structure identification.", "candidates", "scientific_limits")

    if not interpretations:
        interpret("physical_explanation", "physical interpretation beyond the saved numerical result", "not_assessed",
                  "This operation does not establish a unique material explanation. Conditional measurements and candidate discussion remain permitted.",
                  "reciprocal_interpretation", "scientific_limits", "limitations")
    value = {"version": VERSION, "scope": SCOPE,
             "numerical": {"execution": "completed", "scope": scope, "checks": checks},
             "measurement_reliability": {"scope": scope, "assessments": reliability},
             "interpretation": {"scope": "conditional candidate interpretation", "assessments": interpretations}}
    _check_shape(value)
    return value


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _check_shape(value):
    if len(_canonical(value).encode("utf-8")) > MAX_BYTES:
        raise ValueError("Result semantics exceeds its bounded 24 KiB contract")
    for section, field in (("numerical", "checks"), ("measurement_reliability", "assessments"), ("interpretation", "assessments")):
        rows = value[section][field]
        if len(rows) > 12 or len(value[section]["scope"]) > 1024:
            raise ValueError("Result semantics exceeds its bounded assessment contract")
        for row in rows:
            if row["status"] not in STATUSES or len(row["source_fields"]) > 8 or any(
                    type(text) is not str or len(text) > 1024 for text in [row["aspect"], row["scope"], row["basis"], *row["source_fields"]]):
                raise ValueError("Invalid scoped result semantics row")


def attach(record):
    """Publication-only on a fresh manifest: never inherit a parent's summary."""
    record.pop("result_semantics", None)
    value = build(record)
    if value is not None:
        record["result_semantics"] = value
    return record


def validate(record):
    """Known v1 must match its own fields. Missing/future versions are untouched.

    Changes to these emitted v1 meanings require a new semantics version and
    retaining this derivation for already saved records.
    """
    value = record.get("result_semantics")
    if type(value) is not dict or type(value.get("version")) is not int or value["version"] != VERSION:
        return
    expected = build(record)
    if expected is None or _canonical(value) != _canonical(expected):
        raise ValueError("Saved result_semantics v1 differs from its owning scientific fields")
