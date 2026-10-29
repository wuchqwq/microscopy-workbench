"""Versioned sparse spatial features over existing saved reciprocal evidence.

No FFT, peak detector, interpolation, segmentation or material classifier is
implemented here. Every sample remains bound to its measured source window.
"""
import csv
import io
import math

from PIL import Image, ImageDraw, ImageFont

try:
    from . import image_automation as automation
    from . import image_domain_compare as comparison
except ImportError:
    import image_automation as automation
    import image_domain_compare as comparison


FIELDS = {"feature_field": {"object_id", "coordinate_domain", "display_feature", "max_size"}}
ALGORITHM_VERSION = "sparse-local-reciprocal-v1"
LIMITATIONS = [
    "Irregular sparse samples cover only saved ROI windows; no inferred stride, interpolation, segmentation or extrapolation",
    "Valid means usable saved numerical observations, not a unique orientation, phase or structural domain",
    "Conjugate peaks share one antipodal family; family directions are modulo180 degrees and are not independent evidence",
    "Pairwise direction angles are acute unoriented-line angles in[0,90] degrees, not 3D crystal misorientations",
    "Localization and statistical uncertainty remain unknown; FFT window width and frequency sampling are not error bars",
    "Detector non-detection is not zero crystallinity; sample ambiguity and missing physical calibration are masked",
    "R2 mappings retain their declared or estimated basis; shared coordinates do not prove structural continuity or axial resolution",
    "PNG colors and resized source previews are display only; original scientific arrays remain unchanged",
]


def settings(request, api):
    domain, feature = request.get("coordinate_domain"), request.get("display_feature")
    size = request.get("max_size", 768)
    api.need(domain in ("pixel", "physical"), "coordinate_domain requires explicit pixel or physical")
    api.need(feature in ("family_count", "shortest_period"), "display_feature requires family_count or shortest_period")
    api.need(api.integer(size, 256, 1024), "max_size requires256..1024 display pixels")
    return domain, feature, size


def features(entry, api):
    """Geometric summaries of actual family representatives, no fitted model."""
    if entry["geometry_status"] != "admitted":
        return {"family_count": None, "families": [], "shortest_period": None, "pairwise_angles_degrees": []}
    rows = []
    for family in entry["families"]:
        x, y = family["vector_xy"]
        radius = math.hypot(x, y)
        period = 1/radius if radius > 0 else None
        if period is not None and not math.isfinite(period):
            period = None
        angle = math.degrees(math.atan2(y, x)) % 180.
        rows.append({**family, "reciprocal_magnitude": radius, "period": period,
                     "direction_angle_mod180": angle, "direction_angle_mod180_degrees": angle,
                     "period_valid": period is not None})
    pairs = []
    for i, left in enumerate(rows):
        for right in rows[i+1:]:
            difference = abs(left["direction_angle_mod180"]-right["direction_angle_mod180"])
            pairs.append({"family_ids": [left["family_id"], right["family_id"]],
                          "acute_line_angle_degrees": min(difference, 180.-difference)})
    periods = [row["period"] for row in rows if row["period"] is not None]
    return {"family_count": len(rows), "families": rows, "shortest_period": min(periods) if periods else None,
            "pairwise_angles_degrees": pairs}


def _source(workspace, selected, api):
    parent, directory = workspace.object(selected)
    api.need(parent.get("kind") in ("spatial_atlas", "joint_observations", "local_signature_compare"),
             "Feature field requires saved spatial_atlas, joint_observations or local_signature_compare")
    source = parent
    source_directory = directory
    hypotheses = None
    if parent["kind"] == "local_signature_compare":
        source, source_directory = workspace.object(parent["parent_object_id"])
        api.need(source.get("kind") in ("spatial_atlas", "joint_observations"), "Comparison source is not an admitted local observation", "CORRUPT_OBJECT")
        hypotheses = {key: parent.get(key) for key in ("object_id", "request_id", "reference_index", "coordinate_domain", "coordinate_unit",
                     "angles_degrees", "tolerance", "relations", "interpretation_status", "independent_validation")}
    return parent, directory, source, source_directory, hypotheses


def _samples(workspace, source, entries, domain, display_feature, hypotheses, api):
    sequence_rows = {}
    if source["kind"] == "joint_observations":
        sequence, _ = workspace.object(source["sequence_object_id"])
        sequence_rows = {row["frame_index"]: row for row in sequence["frames"]}
    relations = {row["target_index"]: row for row in (hypotheses or {}).get("relations", [])}
    samples = []
    for entry in entries:
        context = entry.get("source_context") or source.get("source_context") or {}
        frame_info = sequence_rows.get(entry["index"], {})
        frame_id = frame_info.get("frame_object_id", context.get("frame_object_id"))
        api.need(type(frame_id) is str, "Spatial sample lacks an immutable source frame", "CORRUPT_OBJECT")
        frame, _ = workspace.object(frame_id)
        api.need(frame.get("kind") == "frame", "Spatial sample source is not a scientific frame", "CORRUPT_OBJECT")
        selected_id = frame_info.get("selected_object_id", source.get("parent_object_id"))
        selected, selected_directory = workspace.object(selected_id)
        rect = entry.get("rect")
        if rect is not None:
            rect = api.rectangle(rect, frame["shape_yx"])
        center = [(rect[0]+rect[2]-1)/2, (rect[1]+rect[3]-1)/2] if rect else None
        numeric = features(entry, api)
        reasons = []
        if entry["geometry_status"] != "admitted":
            reasons.append(entry.get("reason", "Source geometry is not admitted"))
        if rect is None:
            reasons.append("No verified target-frame ROI; spatial position remains unknown")
        if not entry["quality"]["has_two_noncollinear_families"]:
            reasons.append("Fewer than two numerically noncollinear reciprocal families")
        if any(row["period"] is None for row in numeric["families"]):
            reasons.append("A reciprocal period is not representable as a finite number")
        status = "insufficient_evidence" if reasons else "valid"
        if not reasons and (entry["quality"]["detection_truncated"] or relations.get(entry["index"], {}).get("status") in ("ambiguous", "partial_match")):
            status = "ambiguous"
        if entry["quality"]["detection_truncated"]:
            reasons.append("Saved detector reached its peak selection limit; signature completeness is unresolved")
            if entry["geometry_status"] == "admitted" and rect and numeric["families"]:
                status = "ambiguous"
        if relations.get(entry["index"], {}).get("status") in ("ambiguous", "partial_match"):
            reasons.append("Saved finite comparison has competing or partial geometric hypotheses; no single interpretation is selected")
        mapping = entry.get("mapping_evidence")
        mask = {"spatial_position": rect is not None, "reciprocal_vectors": entry["geometry_status"] == "admitted" and bool(numeric["families"]),
                "periods": bool(numeric["families"]) and all(row["period"] is not None for row in numeric["families"]),
                "two_noncollinear_families": entry["quality"]["has_two_noncollinear_families"],
                "display_feature": status == "valid" and numeric[display_feature] is not None}
        sample = {"sample_index": entry["index"], "index_kind": entry["index_kind"], "source_status": entry["source_status"],
                  "source_object_id": frame_id, "selected_object_id": selected_id,
                  "selected_manifest_sha256": api.sha_file(selected_directory / "object.json"),
                  "frame_identity": {"frame_object_id": frame_id, "source_object_id": frame.get("source_object_id"),
                                     "source_frame_index": frame.get("frame_index"),
                                     "sequence_index": entry["index"] if sequence_rows else None},
                  "source_context": context, "source_identity": frame.get("source_identity"),
                  "source_array": {"dtype": frame["dtype"], "shape_yx": frame["shape_yx"], "axes": frame.get("axes"),
                                   "array_sha256": frame["files_sha256"]["data.npy"], "array_domain": frame.get("array_domain")},
                  "source_requests": {"frame": frame["request_id"], "selected": selected["request_id"],
                                      "measurements": [row["measurement_request_id"] for row in entry["measurements"]]},
                  "rect_xyxy": rect, "center_xy": center, "coordinate_space": "source_pixels",
                  "center_convention": "mean of included source-pixel centers: ((x0+x1-1)/2,(y0+y1-1)/2); no physical origin inferred",
                  "mapping_evidence": mapping, "reference_rect_xyxy": mapping.get("reference_rect") if mapping else None,
                  "shift_xy": mapping.get("shift_xy") if mapping else None,
                  "fft_object_id": entry.get("fft_object_id"), "peaks_object_id": entry.get("peaks_object_id"),
                  "scientific_grid_identity": entry.get("scientific_grid_identity"), "fft_array_sha256": entry.get("fft_array_sha256"),
                  "xy_calibration": entry.get("xy_calibration", frame_info.get("xy_calibration")),
                  "measurement_object_ids": [row["measurement_object_id"] for row in entry["measurements"]],
                  "measurements": entry["measurements"], "features": numeric, "status": status, "invalid_reasons": reasons,
                  "validity_mask": mask, "quality": {**entry["quality"], "detector": entry.get("detection_quality")},
                  "uncertainty": None, "localization_uncertainty": None,
                  "frequency_sampling_step_cycles_per_pixel": entry.get("frequency_sampling_step_cycles_per_pixel"),
                  "overview_object_id": entry.get("overview_object_id"), "roi_object_id": entry.get("roi_object_id"),
                  "view_object_id": entry.get("view_object_id"), "override_source": entry.get("override_source"),
                  "display_value": numeric[display_feature] if mask["display_feature"] else None,
                  "comparison_hypothesis": relations.get(entry["index"]),
                  "interpretation_status": "hypothesized", "valid_status_meaning": "usable saved observations, not unique orientation or material identity"}
        if entry.get("fft_object_id"):
            fft, _ = workspace.object(entry["fft_object_id"])
            sample["source_requests"]["fft"] = fft["request_id"]
            sample["fft_processing"] = {key: fft.get(key) for key in ("algorithm", "window", "subtract_mean", "removed_mean", "dtype", "shape_yx", "computation")}
        if entry.get("peaks_object_id"):
            peaks, _ = workspace.object(entry["peaks_object_id"])
            sample["source_requests"]["peaks"] = peaks["request_id"]
        samples.append(sample)
    return samples


def _color(value, low, high):
    fraction = .5 if high == low else (value-low)/(high-low)
    return [int(round(a+fraction*(b-a))) for a, b in zip((42,120,212), (240,173,45))]


def preview_plan(workspace, samples, feature, unit, size, api):
    groups = []
    for sample in samples:
        key = (sample["source_object_id"], sample.get("overview_object_id"))
        group = next((g for g in groups if g["key"] == key), None)
        if group is None:
            group = {"key": key, "samples": []}
            groups.append(group)
        group["samples"].append(sample)
    values = [sample["display_value"] for sample in samples if sample["display_value"] is not None]
    low, high = (min(values), max(values)) if values else (None, None)
    columns = 1 if len(groups) == 1 else 2
    margin, header, footer, label = 12, 54, 70, 26
    tile = (size-margin*(columns+1))//columns
    row_count = math.ceil(len(groups)/columns)
    tile_height = min(tile, (2048-header-footer-margin*row_count)//row_count-label)
    panels, hotspots, top = [], [], header
    for row_start in range(0, len(groups), columns):
        batch, heights = groups[row_start:row_start+columns], []
        for column, group in enumerate(batch):
            source_id, overview_id = group["key"]
            left = margin+column*(tile+margin)
            base = None
            if overview_id:
                overview, _ = workspace.object(overview_id)
                candidates = [p for p in overview.get("panels", []) if p.get("domain") == "spatial_pixels" and p.get("source_object_id") == source_id]
                api.need(len(candidates) == 1, "Field preview needs exact source-frame spatial panel mapping", "CORRUPT_OBJECT")
                with Image.open(overview["image_path"]) as image:
                    width, height = image.size
                factor = min(tile/width, tile_height/height, 1.)
                rendered = [max(1, int(round(width*factor))), max(1, int(round(height*factor)))]
                base = {"overview_object_id": overview_id, "source_object_id": source_id,
                        "image_path": overview["image_path"], "image_sha256": api.sha_file(overview["image_path"]),
                        "original_size": [width, height], "source_panel": candidates[0]}
            else:
                rendered = [tile, min(tile, 120)]
            image_rect = [left, top+label, left+rendered[0], top+label+rendered[1]]
            p = {"panel_index": len(panels), "sample_indices": [s["sample_index"] for s in group["samples"]],
                 "source_object_id": source_id, "base": base, "image_rect_xyxy": image_rect,
                 "label_position_xy": [left, top+5], "overlays": []}
            if base:
                for sample in group["samples"]:
                    if sample["rect_xyxy"] is None:
                        continue
                    rectangle = api.coordinate_transform(sample["rect_xyxy"], base["source_panel"], True, inverse=True)
                    xfactor, yfactor = rendered[0]/base["original_size"][0], rendered[1]/base["original_size"][1]
                    projected = [left+rectangle[0]*xfactor, top+label+rectangle[1]*yfactor,
                                 left+rectangle[2]*xfactor, top+label+rectangle[3]*yfactor]
                    api.need(all(math.isfinite(v) for v in projected) and projected[0] >= left-1e-8 and projected[1] >= top+label-1e-8
                             and projected[2] <= image_rect[2]+1e-8 and projected[3] <= image_rect[3]+1e-8,
                             "Field ROI exceeds its saved source preview; no silent clipping", "CORRUPT_OBJECT")
                    color = _color(sample["display_value"], low, high) if sample["display_value"] is not None else [215,165,65] if sample["status"] == "ambiguous" else [155,155,155]
                    p["overlays"].append({"sample_index": sample["sample_index"], "rect_xyxy": projected, "rgb": color,
                                          "masked": sample["display_value"] is None, "status": sample["status"], "value": sample["display_value"]})
                    hotspots.append({"sample_index": sample["sample_index"], "rect_xyxy": projected,
                                     "view_object_id": sample["view_object_id"], "roi_object_id": sample["roi_object_id"],
                                     "overview_object_id": sample["overview_object_id"], "status": sample["status"]})
            panels.append(p)
            heights.append(label+rendered[1])
        top += max(heights)+margin
    height = top+footer
    api.need(height <= 2048 and size*height <= api.MAX_PIXELS, "Sparse feature display exceeds bounded mosaic size", "BUDGET_EXCEEDED")
    return {"width": size, "height": height, "size_requested": size, "hotspots": hotspots, "panels": panels,
            "display_feature": feature, "display_unit": "observed families" if feature == "family_count" else unit,
            "display_range": [low, high] if values else None, "legend_top": top,
            "mask_legend": {"ambiguous": "amber hatch, no numeric fill", "insufficient_evidence": "gray hatch, no numeric fill"},
            "overlapping_hotspots": "All sample rectangles retained; overlap never implies a unique sample or independent evidence",
            "interpolated": False, "display_only": True}


def derive(workspace, request, api):
    domain, feature, size = settings(request, api)
    parent, directory, source, source_directory, hypotheses = _source(workspace, request["object_id"], api)
    entries = comparison._entries(workspace, source, domain, api)
    samples = _samples(workspace, source, entries, domain, feature, hypotheses, api)
    unit = "nm" if domain == "physical" else "pixel"
    result = {"kind": "feature_field", "field_schema_version": 1, "algorithm_version": ALGORITHM_VERSION,
              "parent_object_id": parent["object_id"], "source_kind": parent["kind"], "input_request_id": parent["request_id"],
              "input_manifest_sha256": api.sha_file(directory / "object.json"),
              "source_parent_object_id": source["object_id"], "source_parent_kind": source["kind"], "source_parent_request_id": source["request_id"],
              "source_parent_manifest_sha256": api.sha_file(source_directory / "object.json"),
              "coordinate_domain": domain, "coordinate_unit": "cycles/nm" if domain == "physical" else "cycles/pixel", "period_unit": unit,
              "direction_angle_unit": "degree modulo180", "direction_scope": "physical projected reciprocal coordinates" if domain == "physical" else "image coordinates; pixel aspect not inferred",
              "display_feature": feature, "sampling": "irregular_sampling", "stride_xy": None,
              "sampling_support": "explicit saved half-open source-pixel rectangles; overlapping windows remain distinct",
              "fft_parameters": source.get("fft_parameters"), "peak_parameters": source.get("peak_parameters"),
              "samples": samples, "sample_count": len(samples), "validity_mask": [s["status"] == "valid" for s in samples],
              "comparison_hypotheses": hypotheses, "sequence_object_id": source.get("sequence_object_id"),
              "correspondence_object_id": source.get("correspondence_object_id"), "sequence_axis": source.get("sequence_axis"),
              "overview_object_id": next((s["overview_object_id"] for s in samples if s["overview_object_id"]), None),
              "field_image": preview_plan(workspace, samples, feature, unit, size, api),
              "uncertainty": None, "interpretation_status": "hypothesized", "limitations": LIMITATIONS,
              "interpolated": False, "extrapolated": False, "dense_array_created": False, "fft_recomputed": False,
              "scientific_data_changed": False, "display_only": True}
    comparison.check_report_budget(result, api)
    return result


def render_preview(result, directory, api):
    plan = result["field_image"]
    canvas = Image.new("RGB", (plan["width"], plan["height"]), "#181c22")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=12)
    draw.text((12, 10), "Sparse spatial feature field", fill="white", font=font)
    draw.text((12, 29), "Sampled windows only / no interpolation", fill="#d7d7d7", font=font)
    for panel in plan["panels"]:
        left, top, right, bottom = panel["image_rect_xyxy"]
        if panel["base"]:
            with Image.open(panel["base"]["image_path"]) as image:
                resized = image.convert("RGB").resize((right-left, bottom-top), Image.Resampling.BILINEAR)
            canvas.paste(resized, (left, top))
        else:
            draw.rectangle([left, top, right, bottom], fill="#33383f", outline="#888888")
            draw.text((left+5, top+10), "No saved mapped ROI", fill="#cccccc", font=font)
        draw.text(tuple(panel["label_position_xy"]), "Samples "+", ".join(str(i+1) for i in panel["sample_indices"]), fill="white", font=font)
        for overlay in panel["overlays"]:
            x0, y0, x1, y1 = overlay["rect_xyxy"]
            rgba = Image.new("RGBA", canvas.size, (0,0,0,0))
            paint = ImageDraw.Draw(rgba)
            color = tuple(overlay["rgb"])
            if overlay["masked"]:
                # Hatch each masked rectangle locally; no scalar zero fill.
                for y in range(int(math.ceil(y0))+4, int(y1), 9):
                    paint.line((x0, y, x1-1, y), fill=(*color, 140), width=1)
            else:
                paint.rectangle((x0, y0, max(x0,x1-1), max(y0,y1-1)), fill=(*color, 75))
            paint.rectangle((x0, y0, max(x0,x1-1), max(y0,y1-1)), outline=(*color,255), width=2)
            canvas = Image.alpha_composite(canvas.convert("RGBA"), rgba).convert("RGB")
            draw = ImageDraw.Draw(canvas)
            label = "S%d" % (overlay["sample_index"]+1)
            label += " %.4g" % overlay["value"] if overlay["value"] is not None else " masked"
            draw.text((x0+3, y0+3), label, fill="white", stroke_width=1, stroke_fill="black", font=font)
    legend = plan["legend_top"]
    scale = plan["display_range"]
    text = plan["display_feature"]+" / "+plan["display_unit"]
    text += " : %.5g to %.5g" % tuple(scale) if scale else " : no usable scalar samples"
    draw.text((12, legend+4), text, fill="white", font=font)
    draw.text((12, legend+23), "Blue-low / amber-high; gray masked; amber hatch ambiguous", fill="#cccccc", font=font)
    draw.text((12, legend+42), "Colors summarize ROI observations; no phase or boundary identification", fill="#cccccc", font=font)
    api.save_png(directory / "preview.png", canvas)


def report_csv(result):
    stream = io.StringIO(newline="")
    columns = ["sample_index", "index_kind", "status", "source_object_id", "source_frame_index", "source_dtype", "source_array_sha256",
               "x0", "y0", "x1", "y1", "center_x", "center_y", "coordinate_unit", "period_unit", "family_count", "shortest_period",
               "family_id", "gx", "gy", "period", "direction_angle_mod180", "measurement_object_ids", "fft_object_id",
               "mapping_status", "mapping_method", "shift_x", "shift_y", "display_value", "invalid_reasons"]
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for sample in result["samples"]:
        for family in sample["features"]["families"] or [{}]:
            row = {key: sample.get(key) for key in ("sample_index", "index_kind", "status", "source_object_id", "fft_object_id", "display_value")}
            row.update(source_frame_index=sample["frame_identity"]["source_frame_index"], source_dtype=sample["source_array"]["dtype"],
                       source_array_sha256=sample["source_array"]["array_sha256"], coordinate_unit=result["coordinate_unit"], period_unit=result["period_unit"],
                       family_count=sample["features"]["family_count"], shortest_period=sample["features"]["shortest_period"],
                       family_id=family.get("family_id"), period=family.get("period"), direction_angle_mod180=family.get("direction_angle_mod180"),
                       measurement_object_ids="|".join(family.get("measurement_object_ids", sample["measurement_object_ids"])),
                       invalid_reasons=" | ".join(sample["invalid_reasons"]))
            row.update(dict(zip(("x0","y0","x1","y1"), sample["rect_xyxy"] or [None]*4)))
            row.update(dict(zip(("center_x","center_y"), sample["center_xy"] or [None]*2)))
            row.update(dict(zip(("gx","gy"), family.get("vector_xy", [None]*2))))
            row.update(dict(zip(("shift_x","shift_y"), sample["shift_xy"] or [None]*2)))
            row.update(mapping_status=(sample["mapping_evidence"] or {}).get("status"), mapping_method=(sample["mapping_evidence"] or {}).get("method"))
            writer.writerow(row)
    return stream.getvalue().encode("utf-8")


def action(workspace, name, request, metadata, directory, api):
    api.need(name == "feature_field", "Unknown feature-field action")
    result = derive(workspace, request, api)
    render_preview(result, directory, api)
    api.write_new(directory / "feature-field.json", api.canonical(result)+b"\n")
    api.write_new(directory / "feature-field.csv", report_csv(result))
    metadata.update(result, field_path=str(directory / "feature-field.json"), table_path=str(directory / "feature-field.csv"),
                    field_preview_path=str(directory / "preview.png"))
    return metadata


def validate_references(workspace, metadata, api):
    active = getattr(workspace, "_feature_field_validation_active", set())
    api.need(metadata["object_id"] not in active and len(active) < 16, "Feature-field dependency cycle/depth exceeded", "CORRUPT_OBJECT")
    workspace._feature_field_validation_active = active
    active.add(metadata["object_id"])
    try:
        parameters = automation._saved_parameters(workspace, metadata, api)
        api.need(parameters.get("action") == "feature_field" and parameters.get("object_id") == metadata.get("parent_object_id"),
                 "Feature field differs from original request", "CORRUPT_OBJECT")
        expected = derive(workspace, parameters, api)
        api.need(all(metadata.get(key) == value for key, value in expected.items()), "Feature field differs from its saved numerical/spatial sources", "CORRUPT_OBJECT")
        directory = workspace.root / "objects" / metadata["object_id"]
        api.need(metadata.get("field_path") == str(directory / "feature-field.json") and metadata.get("table_path") == str(directory / "feature-field.csv")
                 and metadata.get("field_preview_path") == str(directory / "preview.png") and api.read_json(directory / "feature-field.json") == expected
                 and (directory / "feature-field.csv").read_bytes() == report_csv(expected),
                 "Feature-field report differs from the saved numerical/spatial evidence", "CORRUPT_OBJECT")
        with Image.open(directory / "preview.png") as image:
            api.need(list(image.size) == [expected["field_image"]["width"], expected["field_image"]["height"]],
                     "Feature-field preview dimensions differ from its hotspot mapping", "CORRUPT_OBJECT")
    finally:
        active.remove(metadata["object_id"])
