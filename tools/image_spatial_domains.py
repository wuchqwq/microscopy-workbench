"""Bounded multiscale observations and descriptive spatial-domain candidates.

Composition of existing atlas/feature records and reciprocal-vector assignment.
No FFT, peak detector, hidden rotation fit, interpolation or phase classifier.
"""
import copy
import csv
import hashlib
import io
import math
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from . import image_automation as automation
    from . import image_spatial_atlas as atlas
    from . import image_feature_field as feature
    from . import image_domain_compare as comparison
    from . import image_joint as joint
except ImportError:
    import image_automation as automation
    import image_spatial_atlas as atlas
    import image_feature_field as feature
    import image_domain_compare as comparison
    import image_joint as joint

FIELDS = {
    "spatial_field": {"object_id", "rect", "window_sizes", "stride_xy", "max_windows", "coordinate_domain",
                      "window", "subtract_mean", "peak_options", "max_peaks", "max_size", "previous_field_id", "measurement_overrides"},
    "domain_map": {"object_id", "tolerance", "angles_degrees", "max_size", "neighbor_policy"},
}
ALGORITHM = "bounded-window-neighbor-signatures-v1"
LEGACY_NEIGHBORS = "legacy_cardinal_v1"
CONTACT_NEIGHBORS = "support_contact_v1"
LIMITATIONS = [
    "Candidate domains are connected sampled-window signatures, not identified phases, twins or defects",
    "Only measured window supports are displayed; no interpolation or classification of unobserved pixels",
    "Boundary bands enclose the finite supports of differing neighbors; neither stride nor window width is localization precision",
    "No fitted angle, point group, mirror, scale or deformation; antipodal real-image observations share a family",
    "Overlapping and multiscale windows are correlated, not independent validation",
    "Thresholds are descriptive tolerances, not calibrated uncertainty or statistical confidence",
]


def qualified_field(workspace,ident,api):
    """Reuse complete qualification only within this one Workspace operation.

    Own bytes and creator journal are always re-read. This is the same narrow
    proof handoff as export_provenance, not a persistent cache or stat shortcut.
    """
    snapshot=getattr(workspace,"_spatial_export_snapshots",{}).get(ident)
    if snapshot is None:return workspace.object(ident)
    metadata,directory=workspace._object_record(ident)
    api.need(metadata.get("kind") in ("spatial_field","field_extend","domain_map") and metadata==snapshot
             and getattr(workspace,"_spatial_export_journal_hashes",{}).get(ident)==api.sha_file(workspace.root/"requests"/(metadata["request_id"]+".json")),
             "Qualified field changed after dependency validation","CORRUPT_OBJECT")
    return metadata,directory


def sampling(request, shape, api):
    rect = api.rectangle(request.get("rect", [0, 0, shape[1], shape[0]]), shape)
    sizes, stride = request.get("window_sizes"), request.get("stride_xy")
    maximum, domain = request.get("max_windows"), request.get("coordinate_domain")
    api.need(type(sizes) is list and 1 <= len(sizes) <= 4 and all(api.integer(v, 4, 1024) for v in sizes)
             and len(set(sizes)) == len(sizes), "window_sizes requires1..4 distinct integer square widths in4..1024")
    api.need(type(stride) is list and len(stride) == 2 and all(api.integer(v, 1, 4096) for v in stride), "stride_xy requires two positive pixel steps in1..4096")
    api.need(api.integer(maximum, 1, 32), "max_windows requires explicit1..32 budget")
    api.need(domain in ("pixel", "physical"), "coordinate_domain requires pixel or physical")
    fft, peaks, size = atlas._settings(request, api)
    api.need(size >= 256, "Spatial-field preview max_size requires256..1024")
    plan = []
    for scale in sizes:
        api.need(scale <= min(rect[2]-rect[0], rect[3]-rect[1]), "Every window size must fit selected sampling area")
        for row, y in enumerate(range(rect[1], rect[3]-scale+1, stride[1])):
            for col, x in enumerate(range(rect[0], rect[2]-scale+1, stride[0])):
                plan.append({"sample_index": len(plan), "scale_pixels": scale, "grid_xy": [col, row], "rect_xyxy": [x,y,x+scale,y+scale]})
                api.need(len(plan) <= maximum, "Sampling exceeds max_windows; increase stride or reduce area/scales; no silent truncation", "BUDGET_EXCEEDED")
    pixels = sum(p["scale_pixels"]**2 for p in plan)
    api.need(pixels <= api.MAX_PIXELS, "Aggregate FFT pixels exceed4194304 across all batches", "BUDGET_EXCEEDED")
    return {"rect_xyxy": rect, "window_sizes": sizes, "stride_xy": stride, "samples": plan,
            "window_count": len(plan), "fft_pixels": pixels, "max_windows": maximum,
            "coordinate_domain": domain, "fft_parameters": fft, "peak_parameters": peaks, "max_size": size,
            "edge_policy": "Only complete windows; no padding, no truncated last window or inferred coverage"}


def _overrides(request, count, api):
    rows = request.get("measurement_overrides", [])
    api.need(type(rows) is list and len(rows) <= count, "At most one override per sample")
    selected = {}
    for row in rows:
        api.need(type(row) is dict and set(row) == {"sample_index", "measurement_object_ids"}, "Overrides require sample_index and measurement_object_ids")
        i, ids = row["sample_index"], row["measurement_object_ids"]
        api.need(api.integer(i, 0, count-1) and i not in selected and type(ids) is list and 1 <= len(ids) <= 16
                 and all(type(v) is str and api.OBJECT_ID.fullmatch(v) for v in ids) and len(set(ids)) == len(ids), "Invalid or duplicate sample override")
        selected[i] = ids
    return selected


def _previous(workspace, request, plan, api):
    ident = request.get("previous_field_id")
    if not ident:
        return None
    previous, _ = workspace.object(ident)
    api.need(previous.get("kind") == "spatial_field" and previous.get("parent_object_id") == request["object_id"], "Previous field requires exact selected source/calibration revision")
    # Reserve one validation level for a future domain_map wrapper. Reject the
    # next revision before children, rather than publishing an unreadable chain.
    history=set();cursor=previous
    while cursor is not None:
        api.need(cursor["object_id"] not in history and len(history)<7,"Spatial-field revision history exceeds readable bound","BUDGET_EXCEEDED")
        history.add(cursor["object_id"])
        prior=cursor.get("previous_field_id")
        cursor=workspace.object(prior)[0] if prior else None
    api.need(len(history)<7,"At most7 spatial-field revisions are supported; next revision would not remain readable with a domain map","BUDGET_EXCEEDED")
    # Batch membership is part of the reuse contract. Change the sampling plan
    # in a separate new field, rather than silently borrowing unrelated groups.
    api.need(previous.get("sampling_plan") == plan, "Previous field requires unchanged exact sampling/FFT/detector settings")
    return previous


def _batch_parameters(request, plan, offset, previous, selected):
    subset = plan["samples"][offset:offset+8]
    result = {"object_id": request["object_id"], "rects": [p["rect_xyxy"] for p in subset], "max_size": plan["max_size"],
              **plan["fft_parameters"], "max_peaks": plan["peak_parameters"]["max_peaks"],
              "peak_options": {k:v for k,v in plan["peak_parameters"].items() if k != "max_peaks"}}
    if previous:
        result["previous_atlas_id"] = previous["batches"][offset//8]["atlas_object_id"]
    overrides = [{"region_index": i-offset, "measurement_object_ids": ids} for i,ids in selected.items() if offset <= i < offset+len(subset)]
    if overrides:
        result["measurement_overrides"] = overrides
    return result


def _checked(workspace, ident, action, expected, request_id, api):
    row = joint._parameters(workspace, ident, action, expected, api)
    api.need(row["request_id"] == request_id, "Spatial field child identity differs from original request", "CORRUPT_OBJECT")
    return row


def _flatten(plan, batches, fields, overview):
    samples = []
    for batch, field in zip(batches, fields):
        for local, row in enumerate(field["samples"]):
            i = batch["sample_indices"][local]
            samples.append({**copy.deepcopy(row), **plan["samples"][i], "atlas_object_id": batch["atlas_object_id"],
                            "atlas_region_index": local, "feature_field_object_id": field["object_id"],
                            "saved_overview_object_id": row["overview_object_id"], "overview_object_id": overview})
    return samples


def _supports(samples, shape):
    # These rasters encode measurement support only. A valid window is not a
    # claim that every included pixel belongs to its signature or material.
    coverage = np.zeros(shape, dtype=np.uint8)
    unknown = np.ones(shape, dtype=np.uint8)
    for row in samples:
        x0,y0,x1,y1 = row["rect_xyxy"]
        coverage[y0:y1,x0:x1] = 1
        if row["status"] == "valid" and row.get("domain_status") != "unknown":
            unknown[y0:y1,x0:x1] = 0
    for row in samples:
        if row["status"] != "valid" or row.get("domain_status") == "unknown":
            x0,y0,x1,y1 = row["rect_xyxy"]
            unknown[y0:y1,x0:x1] = 1
    return coverage, unknown


def _field_result(workspace, request, plan, batches, fields, overview, api):
    frame, _, context = workspace.resolved(request["object_id"])
    samples = _flatten(plan, batches, fields, overview)
    coverage, unknown = _supports(samples, frame["shape_yx"])
    result = {"kind": "spatial_field", "field_schema_version": 1, "algorithm_version": ALGORITHM,
              "parent_object_id": request["object_id"], "source_kind": "frame", "source_context": automation.context_record(frame, context),
              "xy_calibration": frame.get("xy_calibration"), "sampling_plan": plan, "batches": batches,
              "samples": samples, "sample_count": len(samples), "overview_object_id": overview,
              "coordinate_domain": plan["coordinate_domain"], "coordinate_unit": "cycles/nm" if plan["coordinate_domain"] == "physical" else "cycles/pixel",
              "period_unit": "nm" if plan["coordinate_domain"] == "physical" else "pixel", "display_feature": "family_count",
              "previous_field_id": request.get("previous_field_id"), "fft_parameters": plan["fft_parameters"], "peak_parameters": plan["peak_parameters"],
              "validity_mask": [s["status"] == "valid" for s in samples], "unknown_sample_indices": [s["sample_index"] for s in samples if s["status"] != "valid"],
              "coverage": {"sampled_pixel_count": int(coverage.sum()), "source_pixel_count": int(coverage.size),
                           "sampled_support_fraction": float(coverage.mean()), "unknown_support_fraction": float(unknown.mean()),
                           "meaning": "Union of observed window supports; overlap correlated, unknown includes unsampled/invalid support, not phase classification"},
              "field_image": feature.preview_plan(workspace, samples, "family_count", "observed families", plan["max_size"], api),
              "interpretation_status": "hypothesized", "uncertainty": None, "limitations": LIMITATIONS,
              "scientific_data_changed": False, "interpolated": False, "extrapolated": False,
              "new_fft_count": sum(not s["fft_reused"] for b in batches for s in b["regions"]),
              "reused_fft_count": sum(s["fft_reused"] for b in batches for s in b["regions"])}
    comparison.check_report_budget(result, api)
    return result, coverage, unknown


def _settings_domain(request, api):
    angles, tolerance, size = request.get("angles_degrees"), request.get("tolerance"), request.get("max_size", 768)
    api.need(type(angles) is list and 1 <= len(angles) <= 64 and all(api.number(a) and -180 <= a <= 180 for a in angles)
             and len(set(angles)) == len(angles), "angles_degrees requires1..64 distinct finite explicit angles in[-180,180]")
    api.need(api.number(tolerance) and tolerance > 0, "tolerance requires finite positive distance in the field's reciprocal unit")
    api.need(api.integer(size, 256, 1024), "max_size requires256..1024")
    return angles, tolerance, size


def _entry(sample):
    return {"families": sample["features"]["families"], "quality": sample["quality"]}


def _neighbors(samples, irregular=False):
    if irregular:
        # Explicit appended windows have no common grid index. Connect the
        # nearest saved center in each cardinal direction at the same scale;
        # the caller still masks positive support gaps as unobserved.
        for row in samples:
            r=row["rect_xyxy"];cx=r[0]+r[2];cy=r[1]+r[3]
            for axis in (0,1):
                candidates=[]
                for other in samples:
                    if other is row or other["scale_pixels"]!=row["scale_pixels"]:continue
                    s=other["rect_xyxy"];ox=s[0]+s[2];oy=s[1]+s[3]
                    distance=(ox-cx) if axis==0 and oy==cy else (oy-cy) if axis==1 and ox==cx else 0
                    if distance>0:candidates.append((distance,other))
                if candidates:yield row,min(candidates,key=lambda v:(v[0],v[1]["rect_xyxy"]))[1]
        return
    # Explicit grid indices plus source position, never string IDs or rank.
    lookup = {(s["scale_pixels"], *s["grid_xy"]): s for s in samples}
    for row in samples:
        scale, (x,y) = row["scale_pixels"], row["grid_xy"]
        for key in ((scale,x+1,y),(scale,x,y+1)):
            if key in lookup:
                yield row, lookup[key]


def _contact_geometry(left, right):
    """Half-open scientific supports, not FFT-center proximity or label rank."""
    r,s=left["rect_xyxy"],right["rect_xyxy"]
    width=min(r[2],s[2])-max(r[0],s[0])
    height=min(r[3],s[3])-max(r[1],s[1])
    area=max(0,width)*max(0,height)
    shared=height if width==0 and height>0 else width if height==0 and width>0 else 0
    return {"support_relation":"overlap" if area>0 else "shared_edge" if shared>0 else "gap_unknown" if width<0 or height<0 else "corner_only",
            "shared_edge_pixels":shared,"overlap_area_pixels":area}


def _policy_neighbors(samples, irregular, policy):
    if policy==LEGACY_NEIGHBORS:
        yield from _neighbors(samples,irregular)
        return
    # Keep historical cardinal-gap evidence explicitly unknown, but never use
    # it to connect support. Add every positive contact at the same scale; at
    # <=32 windows this finite graph needs no nearest-center approximation.
    pairs={}
    for left,right in _neighbors(samples,irregular):
        relation=_contact_geometry(left,right)["support_relation"]
        if relation=="gap_unknown":
            pairs[tuple(sorted((left["sample_index"],right["sample_index"])))] = (left,right)
    for i,left in enumerate(samples):
        for right in samples[i+1:]:
            if left["scale_pixels"]!=right["scale_pixels"]:continue
            if _contact_geometry(left,right)["support_relation"] in ("overlap","shared_edge"):
                pairs[tuple(sorted((left["sample_index"],right["sample_index"])))] = (left,right)
    for key in sorted(pairs):yield pairs[key]


def _domain_result(workspace, request, api):
    angles, tolerance, size = _settings_domain(request, api)
    policy=request.get("neighbor_policy",LEGACY_NEIGHBORS)
    api.need(policy in (LEGACY_NEIGHBORS,CONTACT_NEIGHBORS),"neighbor_policy requires legacy_cardinal_v1 or support_contact_v1")
    parent, directory = qualified_field(workspace,request["object_id"],api)
    api.need(parent.get("kind") in ("spatial_field","field_extend"), "Domain map requires a saved multiscale or incremental spatial field")
    samples = copy.deepcopy(parent["samples"])
    mixed = set()
    cross_scale = []
    # Do not force a coarse mixed signature into its own orientation domain.
    # This is a finite containment/geometry warning, not a phase-mixture model.
    for large in samples:
        if large["status"] != "valid":continue
        r=large["rect_xyxy"]
        contained=[s for s in samples if s["status"]=="valid" and s["scale_pixels"]<large["scale_pixels"]
                   and r[0]<=s["rect_xyxy"][0] and r[1]<=s["rect_xyxy"][1] and r[2]>=s["rect_xyxy"][2] and r[3]>=s["rect_xyxy"][3]]
        for i,left in enumerate(contained):
            for right in contained[i+1:]:
                if left["scale_pixels"]!=right["scale_pixels"]:continue
                difference=comparison.compare_families(_entry(left),_entry(right),[0.],tolerance)
                if difference["status"]!="incompatible":continue
                lpart=comparison.compare_families(_entry(large),_entry(left),[0.],tolerance)
                rpart=comparison.compare_families(_entry(large),_entry(right),[0.],tolerance)
                if lpart["status"]==rpart["status"]=="partial_match" and lpart["candidates"][0]["matched_pairs"] and rpart["candidates"][0]["matched_pairs"]:
                    mixed.add(large["sample_index"])
                    cross_scale.append({"sample_index":large["sample_index"],"finer_sample_indices":[left["sample_index"],right["sample_index"]],
                                        "status":"mixed_support_candidate","reason":"Coarse signature partially includes two conflicting finer signatures; interpretation unresolved"})
                    break
            if large["sample_index"] in mixed:break
    for sample in samples:
        sample["domain_status"]="unknown" if sample["status"]!="valid" or sample["sample_index"] in mixed else "candidate"
        sample["domain_unknown_reason"]="Conflicting finer signatures within this window support" if sample["sample_index"] in mixed else None
    graph = {s["sample_index"]:set() for s in samples if s["domain_status"] == "candidate"}
    edges, bands = [], []
    for left, right in _policy_neighbors(samples, parent["kind"]=="field_extend",policy):
        a,b = left["sample_index"],right["sample_index"]
        r,s=left["rect_xyxy"],right["rect_xyxy"]
        gap=[max(0,r[0]-s[2],s[0]-r[2]),max(0,r[1]-s[3],s[1]-r[3])]
        usable = left["domain_status"] == right["domain_status"] == "candidate" and not any(gap)
        if usable:
            zero = comparison.compare_families(_entry(left), _entry(right), [0.], tolerance)
            rotated = comparison.compare_families(_entry(left), _entry(right), angles, tolerance)
            status = "compatible" if zero["status"] == "compatible_signature" else "different" if zero["status"] == "incompatible" else "unknown"
        else:
            zero = {"status":"not_comparable","candidates":[],"accepted_angles_degrees":[],"reason":"Source window is masked, insufficient or unresolved across scales","interpretation_status":"hypothesized","uncertainty":None}
            if any(gap):zero["reason"]="Unsampled gap between source-window supports; structural continuity is unobserved"
            rotated = copy.deepcopy(zero)
            status = "unknown"
        band = None
        if status == "compatible":
            graph[a].add(b);graph[b].add(a)
        elif status == "different":
            r,s = left["rect_xyxy"],right["rect_xyxy"]
            # Entire finite support enclosure: not midpoint precision.
            band = [min(r[0],s[0]),min(r[1],s[1]),max(r[2],s[2]),max(r[3],s[3])]
            bands.append({"edge_index": len(edges), "sample_indices": [a,b], "rect_xyxy": band,
                          "status": "candidate", "localization_uncertainty": None,
                          "meaning": "Bounding support band of differing sampled windows; not a located interface or confidence interval"})
        edges.append({"edge_index":len(edges),"sample_indices":[a,b],"scale_pixels":left["scale_pixels"],
                      "orientation":zero,"lattice_geometry":rotated,"status":status,"boundary_band_xyxy":band,
                      "overlap_area_pixels": max(0,min(left["rect_xyxy"][2],right["rect_xyxy"][2])-max(left["rect_xyxy"][0],right["rect_xyxy"][0]))*
                          max(0,min(left["rect_xyxy"][3],right["rect_xyxy"][3])-max(left["rect_xyxy"][1],right["rect_xyxy"][1])),
                      "independence":"Overlapping/adjacent windows are correlated; descriptive comparison, not held-out validation"})
        if policy==CONTACT_NEIGHBORS:edges[-1].update(_contact_geometry(left,right))
    domains, assigned = [], {}
    for seed in sorted(graph):
        if seed in assigned:
            continue
        component, todo = [], [seed]
        while todo:
            current=todo.pop()
            if current in assigned:continue
            assigned[current] = len(domains)+1;component.append(current);todo.extend(sorted(graph[current],reverse=True))
        domains.append({"domain_id":"candidate-%d"%(len(domains)+1),"sample_indices":sorted(component),"status":"candidate",
                        "scale_pixels":samples[seed]["scale_pixels"],"support_rects":[samples[i]["rect_xyxy"] for i in sorted(component)],
                        "interpretation":"Connected zero-angle-compatible sampled signatures; no point group or phase assigned"})
    visual = copy.deepcopy(samples)
    for row in visual:
        row["display_value"] = assigned.get(row["sample_index"])
    _, domain_unknown = _supports(samples, parent["source_context"]["shape_yx"])
    result = {"kind":"domain_map","field_schema_version":1,"algorithm_version":ALGORITHM,
              "parent_object_id":parent["object_id"],"source_kind":parent["kind"],"source_context":parent["source_context"],
              "source_manifest_sha256":api.sha_file(directory/"object.json"),"samples":samples,"sample_count":len(samples),
              "sampling_plan":parent["sampling_plan"],"xy_calibration":parent.get("xy_calibration"),
              "coordinate_domain":parent["coordinate_domain"],"coordinate_unit":parent["coordinate_unit"],"period_unit":parent["period_unit"],
              "overview_object_id":parent["overview_object_id"],"angles_degrees":angles,"orientation_angles_degrees":[0.],"tolerance":tolerance,
              "edges":edges,"domains":domains,"boundary_bands":bands,"unknown_sample_indices":[s["sample_index"] for s in samples if s["domain_status"]=="unknown"],
              "validity_mask":[s["domain_status"]=="candidate" for s in samples],"coverage":{**parent["coverage"],"unknown_support_fraction":float(domain_unknown.mean())},
              "cross_scale_evidence":cross_scale,
              "cross_scale_policy":"Separate same-scale graphs; coarse partial containment of conflicting finer signatures is unknown, not a new phase; scales are not independent validation",
              "display_feature":"domain_candidate","field_image":feature.preview_plan(workspace,visual,"domain_candidate","candidate",size,api),
              "interpretation_status":"hypothesized","uncertainty":None,"limitations":LIMITATIONS,
              "fft_recomputed":False,"scientific_data_changed":False,"interpolated":False}
    # Old saved requests omit this option: retain their exact reconstructed
    # metadata/CSV/masks, rather than silently changing a global graph rule.
    if policy==CONTACT_NEIGHBORS:
        result.update(algorithm_version="bounded-window-support-contact-signatures-v1",neighbor_policy=policy,
                      neighbor_policy_meaning="Same-scale positive shared edges or overlap; cardinal support gaps stay unknown; no corner-only or cross-scale connections")
    comparison.check_report_budget(result,api)
    return result,parent


def _render(result,directory,api):
    feature.render_preview(result,directory,api)
    if result["kind"] == "domain_map":
        filename=directory/"preview.png"
        with Image.open(filename) as image:canvas=image.convert("RGB")
        draw=ImageDraw.Draw(canvas);font=ImageFont.load_default(size=12)
        draw.rectangle((0,0,canvas.width,48),fill="#181c22")
        draw.text((12,10),"Candidate sampled structure domains / not phase labels",fill="white",font=font)
        draw.text((12,29),"Zero-angle adjacency; orange bands are finite supports, not located boundaries",fill="#dddddd",font=font)
        for panel in result["field_image"]["panels"]:
            base=panel.get("base")
            if not base:continue
            x0,y0,x1,y1=panel["image_rect_xyxy"]
            for band in result["boundary_bands"]:
                r=api.coordinate_transform(band["rect_xyxy"],base["source_panel"],True,inverse=True)
                sx=(x1-x0)/base["original_size"][0];sy=(y1-y0)/base["original_size"][1]
                mapped=[x0+r[0]*sx,y0+r[1]*sy,x0+r[2]*sx,y0+r[3]*sy]
                draw.rectangle(mapped,outline="#ff9f36",width=3)
        # This is a newly owned preview, never an immutable source.
        filename.unlink();api.save_png(filename,canvas)


def _csv(result):
    stream=io.StringIO(newline="");writer=csv.writer(stream)
    writer.writerow(["sample_index","scale_pixels","grid_x","grid_y","x0","y0","x1","y1","status","coordinate_unit","family_count","fft_object_id","measurement_object_ids","candidate_domain","domain_status","domain_unknown_reason"])
    mapping={i:d["domain_id"] for d in result.get("domains",[]) for i in d["sample_indices"]}
    for s in result["samples"]:
        writer.writerow([s["sample_index"],s["scale_pixels"],*s["grid_xy"],*s["rect_xyxy"],s["status"],result["coordinate_unit"],s["features"]["family_count"],s["fft_object_id"],"|".join(s["measurement_object_ids"]),mapping.get(s["sample_index"]),s.get("domain_status"),s.get("domain_unknown_reason")])
    return stream.getvalue().encode("utf-8")


def _write(result,directory,coverage,unknown,api):
    prefix="spatial-field" if result["kind"]=="spatial_field" else "domain-map"
    api.write_new(directory/(prefix+".json"),api.canonical(result)+b"\n")
    api.write_new(directory/(prefix+".csv"),_csv(result))
    api.save_array(directory,"sampled-support.npy",coverage)
    api.save_array(directory,"unknown-support.npy",unknown)
    _render(result,directory,api)


def action(workspace,name,request,metadata,directory,api):
    started=time.monotonic()
    if name=="domain_map":
        result,parent=_domain_result(workspace,request,api)
        frame,_,_=workspace.resolved(parent["parent_object_id"])
        coverage,unknown=_supports(result["samples"],frame["shape_yx"])
    else:
        frame,context,values=automation.source_frame(workspace,request,api)
        plan=sampling(request,values.shape,api)
        selected=_overrides(request,len(plan["samples"]),api)
        previous=_previous(workspace,request,plan,api)
        api.need(not selected or previous is not None,"Manual overrides require previous_field_id")
        # Reject all invalid overrides before the first child operation.
        for i,ids in selected.items():
            fft,_=workspace.object(previous["samples"][i]["fft_object_id"])
            for ident in ids:joint.measurement_row(workspace,ident,fft,api)
        batches,fields=[],[]
        for offset in range(0,len(plan["samples"]),8):
            params=_batch_parameters(request,plan,offset,previous,selected)
            observed=automation.run_child(workspace,request,"batch-%d"%(offset//8),"spatial_atlas",**params)
            field=automation.run_child(workspace,request,"features-%d"%(offset//8),"feature_field",object_id=observed["object_id"],coordinate_domain=plan["coordinate_domain"],display_feature="family_count",max_size=plan["max_size"])
            batches.append({"batch_index":offset//8,"sample_indices":list(range(offset,min(offset+8,len(plan["samples"])))),
                            "atlas_object_id":observed["object_id"],"atlas_request_id":observed["request_id"],
                            "feature_field_object_id":field["object_id"],"feature_field_request_id":field["request_id"],
                            "regions":[{"fft_object_id":r["fft_object_id"],"fft_reused":r["fft_reused"]} for r in observed["regions"]]})
            fields.append(field)
        overview=automation.overview(workspace,request,[p["rect_xyxy"] for p in plan["samples"]],api)
        result,coverage,unknown=_field_result(workspace,request,plan,batches,fields,overview["object_id"],api)
    computed=time.monotonic()
    _write(result,directory,coverage,unknown,api)
    ended=time.monotonic()
    metadata.update(result,field_path=str(directory/("spatial-field.json" if name=="spatial_field" else "domain-map.json")),
                    table_path=str(directory/("spatial-field.csv" if name=="spatial_field" else "domain-map.csv")),
                    costs={"worker_processes":1,"startup_seconds":None,"compute_seconds":computed-started,"render_and_write_seconds":ended-computed,
                           "total_worker_seconds":ended-started,"window_count":len(result["samples"]),"fft_pixels":result["sampling_plan"]["fft_pixels"],
                           "new_fft_count":result.get("new_fft_count",0),"reused_fft_count":result.get("reused_fft_count",len(result["samples"]))})
    return metadata


def _reconstruct_field(workspace,request,metadata,api):
    parent,_,_=workspace.resolved(request["object_id"])
    plan=sampling(request,parent["shape_yx"],api)
    selected=_overrides(request,len(plan["samples"]),api)
    previous=_previous(workspace,request,plan,api)
    expected_batches,fields=[],[]
    saved=metadata.get("batches")
    api.need(type(saved)is list and len(saved)==math.ceil(len(plan["samples"])/8),"Spatial field batch receipts changed","CORRUPT_OBJECT")
    for offset,batch in zip(range(0,len(plan["samples"]),8),saved):
        n=offset//8
        observed=_checked(workspace,batch.get("atlas_object_id"),"spatial_atlas",_batch_parameters(request,plan,offset,previous,selected),automation.child_request_id(request["request_id"],"batch-%d"%n),api)
        field=_checked(workspace,batch.get("feature_field_object_id"),"feature_field",{"object_id":observed["object_id"],"coordinate_domain":plan["coordinate_domain"],"display_feature":"family_count","max_size":plan["max_size"]},automation.child_request_id(request["request_id"],"features-%d"%n),api)
        expected_batches.append({"batch_index":n,"sample_indices":list(range(offset,min(offset+8,len(plan["samples"])))),"atlas_object_id":observed["object_id"],"atlas_request_id":observed["request_id"],"feature_field_object_id":field["object_id"],"feature_field_request_id":field["request_id"],"regions":[{"fft_object_id":r["fft_object_id"],"fft_reused":r["fft_reused"]} for r in observed["regions"]]})
        fields.append(field)
    overview,_=workspace.object(metadata.get("overview_object_id"))
    # The complete view/ROI list is verified against its original child requests.
    view=_checked(workspace,overview.get("parent_object_id"),"view",{"object_id":request["object_id"],"max_size":plan["max_size"]},automation.child_request_id(request["request_id"],"context-view"),api)
    marks=[{"annotation_id":"region-%d"%(i+1),"kind":"rectangle","source_object_id":view["panels"][0]["source_object_id"],"coordinate_space":"source_pixels","coordinates":p["rect_xyxy"],"text":"R%d"%(i+1),"status":"hypothesized","color":"cyan"} for i,p in enumerate(plan["samples"])]
    _checked(workspace,overview["object_id"],"annotate",{"object_id":view["object_id"],"annotations":marks},automation.child_request_id(request["request_id"],"context-regions"),api)
    return _field_result(workspace,request,plan,expected_batches,fields,overview["object_id"],api)


def validate_references(workspace,metadata,api):
    active=getattr(workspace,"_spatial_domains_active",set())
    api.need(metadata["object_id"] not in active and len(active)<8,"Spatial-domain dependency cycle/depth exceeded","CORRUPT_OBJECT")
    workspace._spatial_domains_active=active;active.add(metadata["object_id"])
    try:
        request=automation._saved_parameters(workspace,metadata,api)
        api.need(request.get("action")==metadata.get("kind") and request.get("object_id")==metadata.get("parent_object_id"),"Spatial-domain original request differs","CORRUPT_OBJECT")
        if metadata["kind"]=="spatial_field":
            expected,coverage,unknown=_reconstruct_field(workspace,request,metadata,api)
            prefix="spatial-field"
        else:
            expected,parent=_domain_result(workspace,request,api)
            frame,_,_=workspace.resolved(parent["parent_object_id"])
            coverage,unknown=_supports(expected["samples"],frame["shape_yx"]);prefix="domain-map"
        directory=workspace.root/"objects"/metadata["object_id"]
        api.need(all(metadata.get(k)==v for k,v in expected.items()) and metadata.get("field_path")==str(directory/(prefix+".json"))
                 and metadata.get("table_path")==str(directory/(prefix+".csv")) and api.read_json(directory/(prefix+".json"))==expected
                 and (directory/(prefix+".csv")).read_bytes()==_csv(expected),"Spatial-domain report differs from authoritative children","CORRUPT_OBJECT")
        for name,value in (("sampled-support.npy",coverage),("unknown-support.npy",unknown)):
            saved=np.load(directory/name,allow_pickle=False)
            api.need(saved.dtype==np.uint8 and np.array_equal(saved,value),"Spatial support mask differs from actual saved windows","CORRUPT_OBJECT")
        costs=metadata.get("costs")
        api.need(type(costs)is dict and costs.get("worker_processes")==1 and costs.get("window_count")==len(expected["samples"])
                 and costs.get("fft_pixels")==expected["sampling_plan"]["fft_pixels"]
                 and costs.get("new_fft_count")==expected.get("new_fft_count",0) and costs.get("reused_fft_count")==expected.get("reused_fft_count",len(expected["samples"]))
                 and all(api.number(costs.get(k)) and costs[k]>=0 for k in ("compute_seconds","render_and_write_seconds","total_worker_seconds")),"Invalid measured execution costs","CORRUPT_OBJECT")
        with Image.open(directory/"preview.png") as image:
            api.need(list(image.size)==[expected["field_image"]["width"],expected["field_image"]["height"]],"Spatial-domain preview mapping changed","CORRUPT_OBJECT")
        # Scope is this Workspace operation only. The export parent traversal
        # may reuse complete qualification only after re-reading the object's
        # own current journal/manifest/payload hashes and comparing this copy.
        snapshots=getattr(workspace,"_spatial_export_snapshots",None)
        if snapshots is None:
            snapshots={};workspace._spatial_export_snapshots=snapshots
        snapshots[metadata["object_id"]]=copy.deepcopy(metadata)
        journals=getattr(workspace,"_spatial_export_journal_hashes",None)
        if journals is None:
            journals={};workspace._spatial_export_journal_hashes=journals
        journals[metadata["object_id"]]=api.sha_file(workspace.root/"requests"/(metadata["request_id"]+".json"))
    finally:active.remove(metadata["object_id"])


def recovery(workspace,saved,api):
    request=saved.get("parameters");ident=saved.get("request_id")
    api.need(type(request)is dict and type(ident)is str and api.REQUEST_ID.fullmatch(ident) and request.get("request_id")==ident
             and request.get("workspace")==str(workspace.root) and saved.get("parameters_sha256")==hashlib.sha256(api.canonical(request)).hexdigest(),"Spatial-field recovery request identity changed","CORRUPT_OBJECT")
    result={"parent_request_id":ident,"parent_state":saved.get("state"),"children":[],"automatic_retry":False,"scientific_operations_submitted":False}
    if request.get("action")!="spatial_field":return result
    try:
        frame,_,_=workspace.resolved(request["object_id"]);plan=sampling(request,frame["shape_yx"],api)
        selected=_overrides(request,len(plan["samples"]),api);previous=_previous(workspace,request,plan,api)
        for offset in range(0,len(plan["samples"]),8):
            child=automation.child_request_id(ident,"batch-%d"%(offset//8));path=workspace.root/"requests"/(child+".json")
            row={"request_id":child,"action":"spatial_atlas","batch_index":offset//8,"state":"not_submitted"}
            if path.exists():
                record=api.read_json(path);params=record.get("parameters",{});expected=_batch_parameters(request,plan,offset,previous,selected)
                api.need(record.get("request_id")==child and params.get("request_id")==child and params.get("workspace")==str(workspace.root)
                         and params.get("action")=="spatial_atlas" and record.get("parameters_sha256")==hashlib.sha256(api.canonical(params)).hexdigest()
                         and all(params.get(k)==v for k,v in expected.items()),"Partial spatial field child belongs to unrelated request","CORRUPT_OBJECT")
                row["state"]=record.get("state")
                if row["state"]=="completed":
                    child_object,_=workspace.object(record["response"]["object_id"]);row["object_id"]=child_object["object_id"]
                else:row["partial_results"]=atlas.recovery(workspace,record,api)
            result["children"].append(row)
    except Exception as error:
        result["inspection_error"]={"code":getattr(error,"code","INSPECTION_FAILED"),"message":str(error)}
    return result
