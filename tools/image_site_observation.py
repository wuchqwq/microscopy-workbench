"""Versioned feedback from already verified raw ROI observations; no detector/fit."""
import copy
import math
import textwrap

MODALITIES = ("haadf", "adf", "abf", "bf", "idpc", "dpc_component", "ptychography_reconstruction", "other", "unknown")
SIGNALS = ("raw_counts", "stored_scalar", "derived_scalar", "unknown")
FIELDS = {"question", "statistics_id", "expected_position_xy", "position_source_text", "modality", "signal_kind", "signal_source_text"}


def derive(context, observations, rect, api):
    """Context is a caller declaration. Statistics have passed source/ROI readback."""
    api.need(type(context) is dict and set(context) == FIELDS, "site_context requires question, selected statistics, expected position and sourced modality/signal declarations")
    for key in ("question", "position_source_text", "signal_source_text"):
        api.need(type(context[key]) is str and 1 <= len(context[key].strip()) <= 2000, "Provide bounded actual site question and source text")
    api.need(context["modality"] in MODALITIES and type(context["modality"]) is str and
             context["signal_kind"] in SIGNALS and type(context["signal_kind"]) is str, "Unsupported modality or signal declaration")
    point = context["expected_position_xy"]
    api.need(type(point) is list and len(point) == 2 and
             all(type(v) in (int, float) and math.isfinite(v) for v in point), "Expected position requires finite source-pixel X,Y")
    api.need(rect[0] <= point[0] < rect[2] and rect[1] <= point[1] < rect[3],
             "Expected position must remain inside the exact candidate ROI; no recentering", "DISCOVERY_SCOPE_MISMATCH")
    selected = [r for r in observations if r["object_id"] == context["statistics_id"] and r["kind"] == "statistics"]
    api.need(len(selected) == 1 and "reference_comparison" in selected[0]["numerical_evidence"],
             "site_context.statistics_id must select attached exact-ROI raw statistics with all references", "DISCOVERY_SCOPE_MISMATCH")
    numeric = selected[0]["numerical_evidence"]
    comp = numeric["reference_comparison"]
    deltas = comp["primary_mean_minus_each_reference"]
    positive, negative = any(d > 0 for d in deltas), any(d < 0 for d in deltas)
    # Exact signs describe the saved observations, not significance or detection.
    direction = ("references_straddle_target" if positive and negative else
                 "below_or_equal_to_all_references" if negative else
                 "above_or_equal_to_all_references" if positive else "equal_to_all_references")
    descriptions = {
        "references_straddle_target": "The target is below some references and above others; a single median hides this disagreement.",
        "below_or_equal_to_all_references": "The target raw mean is below at least one reference and above none.",
        "above_or_equal_to_all_references": "The target raw mean is above at least one reference and below none.",
        "equal_to_all_references": "The target and every reference have equal raw means on these fixed supports.",
    }
    profiles = [r["object_id"] for r in observations if r["kind"] == "profile"]
    if positive and negative:
        next_step = dict(kind="inspect_reference_comparability", tool=None,
                         reason="Inspect every supplied reference and local background/scan trend before interpreting the median; do not silently drop a reference.")
    elif context["modality"] == "unknown" or context["signal_kind"] == "unknown":
        next_step = dict(kind="request_acquisition_context", tool=None,
                         reason="Identify the channel and processing/count meaning before choosing a physical model; retain the raw comparison.")
    elif not profiles:
        next_step = dict(kind="inspect_local_profile", tool="image_profile",
                         reason="Inspect a width-one raw line through the expected position and neighbours for overlap/background. Use explicit supported endpoints; a larger context needs a separate ROI.")
    else:
        next_step = dict(kind="review_alternative_causes_or_stop", tool=None,
                         reason="Review the attached raw profile with the reference evidence. Stop at observed contrast unless acquisition or independent evidence distinguishes the remaining causes.")
    references = [dict(reference_index=i, rect=copy.deepcopy(r), mean=s["mean"], target_minus_reference=d)
                  for i, (r, s, d) in enumerate(zip(comp["reference_rects"], comp["reference_statistics"], deltas))]
    return dict(version=1, context=copy.deepcopy(context), coordinate_space="source_pixels", readout_rect_xyxy=copy.deepcopy(rect),
                position_status="expected_not_localized", measured_position_xy=None, position_changed=False,
                statistics_id=context["statistics_id"], profile_ids=profiles,
                raw_observation=dict(target_mean=numeric["statistics"]["mean"], references=references,
                    reference_mean_median=comp["reference_mean_median"],
                    target_minus_reference_median=comp["primary_mean_minus_reference_median"],
                    overlapping_roi_pairs=copy.deepcopy(comp["overlapping_roi_pairs"]),
                    reference_source_text=comp["source_text"], units="stored source scalar units; count declaration is not verified by this review"),
                comparison=dict(direction=direction, summary=descriptions[direction], basis="exact signs of saved raw mean differences; no significance threshold"),
                explanations=[dict(explanation="A consistent directional target/reference contrast", status="not_supported_by_all_references" if positive and negative else
                                   "not_observed_on_these_supports" if not positive and not negative else "observed_raw_contrast", basis=descriptions[direction]),
                              dict(explanation="Reference choice contributes to the apparent contrast", status="supported_by_sign_disagreement" if positive and negative else "not_excluded",
                                   basis="All original reference identities and differences are retained; same-class equivalence is unverified."),
                              dict(explanation="Background, scan, thickness, projection or overlapping signal", status="not_distinguished",
                                   basis="ROI mean differences alone cannot separate these causes."),
                              dict(explanation="Element, occupancy or material defect", status="insufficient_evidence",
                                   basis="Expected position is not a detected column; contrast and caller modality declarations do not establish a physical cause.")],
                measurement_reliability=dict(noise_significance="not_assessed", localization="not_assessed", reference_equivalence="not_verified",
                    modality_and_signal="caller_declared_not_verified", independent_validation=False),
                next_step=next_step, physical_conclusion=None, s2_dispatched=False,
                s2_status="not_assessed; optional separate tool requires sourced count model, fixed geometry/width and references",
                limitations=["No threshold, probability, defect classifier, column count or automatic position search",
                             "Equal means do not prove normal material; unequal means do not prove a defect",
                             "Derived iDPC/reconstruction values are not admitted as independent Poisson counts by this review",
                             "All references and failures remain in their original evidence; no scientific computation is dispatched"])


def report_lines(result):
    raw, context = result["raw_observation"], result["context"]
    lines = ["Expected-site raw observation (not physical identification)",
             "Declared channel: %s; signal: %s (unverified)" % (context["modality"], context["signal_kind"]),
             "Expected XY: %s; measured position: NOT_ASSESSED; position unchanged" % context["expected_position_xy"],
             "Target mean %.10g; reference median %.10g; difference %+.10g" %
             (raw["target_mean"], raw["reference_mean_median"], raw["target_minus_reference_median"])]
    lines.extend("Reference %d %s: mean %.10g; target - reference %+.10g" %
                 (r["reference_index"], r["rect"], r["mean"], r["target_minus_reference"]) for r in raw["references"])
    lines.extend([result["comparison"]["summary"], "Noise significance / reference equivalence / physical cause: NOT ESTABLISHED.",
                  "Next: " + result["next_step"]["reason"]])
    return lines


def report_text(result):
    return "\n".join(["Question: " + result["context"]["question"], *report_lines(result),
                       "Position source: " + result["context"]["position_source_text"],
                       "Signal source: " + result["context"]["signal_source_text"],
                       "Reference source: " + result["raw_observation"]["reference_source_text"], *result["limitations"]]) + "\n"


def save(directory, result, api):
    api.write_new(directory / "site-observation.json", api.canonical(result) + b"\n")
    api.write_new(directory / "site-observation.txt", report_text(result).encode("utf-8"))
    # Add feedback to this NEW review preview only. Original arrays/views stay intact.
    from PIL import Image, ImageDraw, ImageFont
    with Image.open(directory / "preview.png") as source:
        original = source.convert("RGB")
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    width = max(800, original.width)
    lines = [part for line in report_lines(result) for part in textwrap.wrap(line, width=95)]
    height = 22 * len(lines) + 24
    canvas = Image.new("RGB", (width, original.height + height), "#f4f7fa")
    canvas.paste(original, (0, 0))
    draw = ImageDraw.Draw(canvas)
    for i, line in enumerate(lines):
        draw.text((12, original.height + 12 + 22 * i), line, font=font, fill="#142738")
    canvas.save(directory / "preview.png")
