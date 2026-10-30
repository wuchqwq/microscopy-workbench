"""Bounded append-only observations over the existing spatial-field engine.

Old FFT, peak and measurement objects are references, not recomputed arrays.
"""
import copy
import hashlib
import time

import numpy as np
from PIL import Image

try:
    from . import image_automation as automation
    from . import image_spatial_atlas as atlas
    from . import image_feature_field as feature
    from . import image_spatial_domains as spatial
    from . import image_joint as joint
    from . import image_domain_compare as comparison
    from . import image_active_analysis as decisions
except ImportError:
    import image_automation as automation
    import image_spatial_atlas as atlas
    import image_feature_field as feature
    import image_spatial_domains as spatial
    import image_joint as joint
    import image_domain_compare as comparison
    import image_active_analysis as decisions

FIELDS={"field_extend":{"object_id","rects","candidate_set_id","action_ids","source_text","max_size","measurement_overrides"}}
ALGORITHM="bounded-explicit-field-extension-v1"


def observation_key(field,rect,api):
    """Identity uses scientific source/settings, never row numbers or labels."""
    return decisions.observation_key(field,rect,api)


def _depth(workspace,base,api):
    # base has already completed full qualification. Own-byte/journal reads
    # here enumerate that qualified ancestry without expanding it twice.
    seen=set();current=base
    while current is not None:
        api.need(current["object_id"] not in seen and len(seen)<7,
                 "Field history is cyclic or exceeds readable budget","BUDGET_EXCEEDED")
        seen.add(current["object_id"])
        prior=current.get("base_field_object_id") if current["kind"]=="field_extend" else current.get("previous_field_id")
        current=workspace._object_record(prior)[0] if prior else None
    api.need(len(seen)<7,"At most7 combined field revisions/extensions are readable with a domain wrapper","BUDGET_EXCEEDED")
    return len(seen)+1


def _source(workspace,request,api):
    base,directory=spatial.qualified_field(workspace,request.get("object_id"),api)
    api.need(base.get("kind") in ("spatial_field","field_extend"),"field_extend requires a saved spatial field")
    frame,_,_=workspace.resolved(base["parent_object_id"])
    api.need(frame.get("kind")=="frame","Incremental source must remain an immutable spatial frame")
    depth=_depth(workspace,base,api)
    return base,directory,frame,depth


def _selection(workspace,request,base,shape,api):
    explicit="rects" in request
    selected="candidate_set_id" in request or "action_ids" in request
    api.need(explicit != selected,"Supply rects OR candidate_set_id plus action_ids")
    action_ids=[];proposal=None
    if explicit:
        values=request["rects"]
    else:
        api.need(type(request.get("candidate_set_id"))is str and type(request.get("action_ids"))is list
                 and 1<=len(request["action_ids"])<=4 and len(set(request["action_ids"]))==len(request["action_ids"])
                 and all(type(v)is str and api.OBJECT_ID.fullmatch(v) for v in request["action_ids"]),
                 "Select1..4 distinct saved candidate action IDs")
        proposal,_=workspace.object(request["candidate_set_id"])
        api.need(proposal.get("kind")=="analysis_candidates" and proposal.get("field_object_id")==base["object_id"]
                 and proposal.get("source_selected_object_id")==base["parent_object_id"],
                 "Candidate set belongs to a different immutable field/source revision")
        api.need(not proposal.get("stopping",{}).get("stop"),"Stopped candidate sets cannot execute actions")
        by_id={a["action_id"]:a for a in proposal["actions"]}
        api.need(all(ident in by_id for ident in request["action_ids"]),"Selected candidate action does not exist")
        chosen=[by_id[ident] for ident in request["action_ids"]]
        for action in chosen:
            api.need(action.get("method")=="spatial_atlas" and action.get("observation_key")==observation_key(base,action["rect_xyxy"],api)
                     and action["action_id"]==action["observation_key"][:32]
                     and action.get("parameters")=={"fft_parameters":base["fft_parameters"],"peak_parameters":base["peak_parameters"],"coordinate_domain":base["coordinate_domain"]},
                     "Candidate action conflicts with inherited scientific settings")
        values=[a["rect_xyxy"] for a in chosen];action_ids=list(request["action_ids"])
    api.need(type(values)is list and len(values)<=4 and (len(values)>=1 or bool(request.get("measurement_overrides"))),"Append1..4 source ROIs, or provide a revision-only measurement override with empty rects")
    rects=[api.rectangle(r,shape) for r in values]
    api.need(all(4<=r[2]-r[0]<=1024 and r[2]-r[0]==r[3]-r[1] for r in rects),"Each appended ROI must be square,4..1024 pixels")
    keys=[observation_key(base,r,api) for r in rects]
    old_keys={observation_key(base,s["rect_xyxy"],api) for s in base["samples"]}
    api.need(len(set(keys))==len(keys) and not old_keys.intersection(keys),"Duplicate scientific ROI/settings observation; query/reuse its original saved result instead of recomputing","DUPLICATE_OBSERVATION")
    count=len(base["samples"])+len(rects);pixels=base["sampling_plan"]["fft_pixels"]+sum((r[2]-r[0])**2 for r in rects)
    api.need(count<=32 and pixels<=api.MAX_PIXELS,"Cumulative incremental field exceeds32 windows or4194304 FFT pixels","BUDGET_EXCEEDED")
    if proposal:
        api.need(count<=proposal["budget"]["windows"] and pixels<=proposal["budget"]["fft_pixels"],"Selected actions exceed the saved total candidate budget","BUDGET_EXCEEDED")
    size=request.get("max_size",base["sampling_plan"]["max_size"])
    api.need(api.integer(size,256,1024),"max_size requires256..1024")
    reason=request.get("source_text")
    api.need(reason is None or type(reason)is str and 1<=len(reason)<=2000,"source_text must be bounded explicit provenance")
    return rects,keys,action_ids,size


def _overrides(workspace,request,base,api):
    rows=request.get("measurement_overrides",[])
    api.need(type(rows)is list and len(rows)<=4,"At most4 stable-key measurement overrides per extension")
    by_key={observation_key(base,s["rect_xyxy"],api):s for s in base["samples"]};selected={}
    for row in rows:
        api.need(type(row)is dict and set(row)=={"observation_key","measurement_object_ids"},"Overrides require scientific observation_key and saved measurements")
        key,ids=row["observation_key"],row["measurement_object_ids"]
        api.need(type(key)is str and key in by_key and key not in selected,"Override does not identify a distinct saved scientific observation")
        api.need(type(ids)is list and 1<=len(ids)<=16 and all(type(i)is str and api.OBJECT_ID.fullmatch(i) for i in ids)
                 and len(set(ids))==len(ids),"Overrides require1..16 distinct committed measurement IDs")
        sample=by_key[key];fft,_=workspace.object(sample["fft_object_id"])
        for ident in ids:joint.measurement_row(workspace,ident,fft,api)
        selected[key]={"sample":sample,"ids":ids}
    return selected


def _correction_parameters(base,sample,ids,size):
    return {**_atlas_parameters(base,[sample["rect_xyxy"]],size),"previous_atlas_id":sample["atlas_object_id"],
            "measurement_overrides":[{"region_index":0,"measurement_object_ids":ids}]}


def _atlas_parameters(base,rects,size):
    return {"object_id":base["parent_object_id"],"rects":rects,"max_size":size,**base["fft_parameters"],
            "max_peaks":base["peak_parameters"]["max_peaks"],
            "peak_options":{k:v for k,v in base["peak_parameters"].items() if k!="max_peaks"}}


def _result(workspace,request,base,directory,frame,depth,rects,keys,action_ids,size,observed,features,overview,corrections,api):
    samples=copy.deepcopy(base["samples"])
    for row in samples:
        row["observation_key"]=observation_key(base,row["rect_xyxy"],api)
        correction=corrections.get(row["observation_key"])
        if correction:
            observed_override,feature_override=correction
            original={k:copy.deepcopy(row[k]) for k in ("sample_index","scale_pixels","grid_xy","rect_xyxy","observation_key")}
            row.update(copy.deepcopy(feature_override["samples"][0]),**original,
                       atlas_object_id=observed_override["object_id"],atlas_region_index=0,feature_field_object_id=feature_override["object_id"],
                       override_source={"request_id":request["request_id"],"observation_key":row["observation_key"]})
    first=len(samples)
    for local,row in enumerate(features["samples"] if features else []):
        r=rects[local]
        samples.append({**copy.deepcopy(row),"sample_index":first+local,"scale_pixels":r[2]-r[0],
                        "grid_xy":r[:2],"grid_coordinate_space":"source_pixel_origin","sampling_kind":"explicit_append",
                        "rect_xyxy":r,"observation_key":keys[local],"atlas_object_id":observed["object_id"],
                        "atlas_region_index":local,"feature_field_object_id":features["object_id"],
                        "saved_overview_object_id":row["overview_object_id"],"overview_object_id":overview["object_id"]})
    # Old observations retain all numerical anchors and scientific refs. Only
    # the source overview link is new for the current complete field display.
    for row in samples:row["overview_object_id"]=overview["object_id"]
    plan=copy.deepcopy(base["sampling_plan"])
    # An explicit in-frame append can enlarge the analysis scope. This is only
    # a coordinate envelope: sampled/unknown support still comes from the real
    # windows below, so any intervening gaps remain unobserved.
    previous_scope=plan["rect_xyxy"]
    envelope=[previous_scope,*rects]
    plan.update(mode="explicit_append",samples=[{k:s[k] for k in ("sample_index","scale_pixels","grid_xy","rect_xyxy")} for s in samples],
                rect_xyxy=[min(r[0] for r in envelope),min(r[1] for r in envelope),max(r[2] for r in envelope),max(r[3] for r in envelope)],
                window_count=len(samples),fft_pixels=sum(s["scale_pixels"]**2 for s in samples),max_windows=32,
                max_size=size,window_sizes=sorted(set(s["scale_pixels"] for s in samples)),stride_xy=None,
                edge_policy="Irregular measured supports; no inferred regular stride or interpolation")
    coverage,unknown=spatial._supports(samples,frame["shape_yx"])
    batch={"atlas_object_id":observed["object_id"],"atlas_request_id":observed["request_id"],
           "feature_field_object_id":features["object_id"],"feature_field_request_id":features["request_id"],
           "sample_indices":list(range(first,len(samples)))} if observed else None
    history=copy.deepcopy(base.get("increment_history",[]))
    history.append({"field_object_id":base["object_id"],"field_manifest_sha256":api.sha_file(directory/"object.json"),
                    "added_observation_keys":keys,"added_rects":rects,"executed_action_ids":action_ids,
                    "candidate_set_id":request.get("candidate_set_id"),"new_fft_count":len(rects),
                    "history_role":"append" if rects else "measurement_revision","corrected_observation_keys":sorted(corrections)})
    result={"kind":"field_extend","field_schema_version":1,"algorithm_version":ALGORITHM,
            "parent_object_id":base["parent_object_id"],"source_kind":"frame","source_context":base["source_context"],
            "xy_calibration":base.get("xy_calibration"),"base_field_object_id":base["object_id"],
            "base_manifest_sha256":api.sha_file(directory/"object.json"),"history_depth":depth,"increment_history":history,
            "sampling_plan":plan,"batches":copy.deepcopy(base["batches"])+([batch] if batch else []),"samples":samples,"sample_count":len(samples),
            "coordinate_domain":base["coordinate_domain"],"coordinate_unit":base["coordinate_unit"],"period_unit":base["period_unit"],
            "fft_parameters":base["fft_parameters"],"peak_parameters":base["peak_parameters"],"overview_object_id":overview["object_id"],
            "added_sample_indices":list(range(first,len(samples))),"added_observation_keys":keys,
            "corrected_observation_keys":sorted(corrections),"correction_batches":[{"observation_key":key,"atlas_object_id":value[0]["object_id"],"feature_field_object_id":value[1]["object_id"]} for key,value in sorted(corrections.items())],
            "executed_action_ids":action_ids,"candidate_set_id":request.get("candidate_set_id"),"source_text":request.get("source_text"),
            "validity_mask":[s["status"]=="valid" for s in samples],"unknown_sample_indices":[s["sample_index"] for s in samples if s["status"]!="valid"],
            "coverage":{"sampled_pixel_count":int(coverage.sum()),"source_pixel_count":int(coverage.size),"sampled_support_fraction":float(coverage.mean()),
                        "unknown_support_fraction":float(unknown.mean()),"meaning":"Measured-window support only; overlap correlated, unsampled remains unknown"},
            "field_image":feature.preview_plan(workspace,samples,"family_count","observed families",size,api),"display_feature":"family_count",
            "new_fft_count":len(rects),"reused_fft_count":first,"new_evidence":{"added_windows":len(rects),"new_valid_windows":sum(s["status"]=="valid" for s in samples[first:]),
                "old_observations_recomputed":False,"added_fft_pixels":sum((r[2]-r[0])**2 for r in rects)},
            "interpretation_status":"hypothesized","uncertainty":None,"limitations":spatial.LIMITATIONS,
            "scientific_data_changed":False,"interpolated":False,"extrapolated":False}
    comparison.check_report_budget(result,api)
    return result,coverage,unknown


def _write(result,directory,coverage,unknown,api):
    api.write_new(directory/"spatial-field.json",api.canonical(result)+b"\n")
    api.write_new(directory/"spatial-field.csv",spatial._csv(result))
    api.save_array(directory,"sampled-support.npy",coverage);api.save_array(directory,"unknown-support.npy",unknown)
    feature.render_preview(result,directory,api)


def action(workspace,name,request,metadata,directory,api):
    started=time.monotonic();base,base_dir,frame,depth=_source(workspace,request,api)
    rects,keys,action_ids,size=_selection(workspace,request,base,frame["shape_yx"],api)
    overrides=_overrides(workspace,request,base,api);corrections={}
    for key,row in sorted(overrides.items()):
        corrected=automation.run_child(workspace,request,"corrected-"+key[:12],"spatial_atlas",**_correction_parameters(base,row["sample"],row["ids"],size))
        corrected_feature=automation.run_child(workspace,request,"corrected-features-"+key[:12],"feature_field",object_id=corrected["object_id"],coordinate_domain=base["coordinate_domain"],display_feature="family_count",max_size=size)
        corrections[key]=(corrected,corrected_feature)
    observed=automation.run_child(workspace,request,"added-atlas","spatial_atlas",**_atlas_parameters(base,rects,size)) if rects else None
    features=automation.run_child(workspace,request,"added-features","feature_field",object_id=observed["object_id"],coordinate_domain=base["coordinate_domain"],display_feature="family_count",max_size=size) if observed else None
    shown=automation.overview(workspace,{**request,"object_id":base["parent_object_id"],"max_size":size},[s["rect_xyxy"] for s in base["samples"]]+rects,api)
    result,coverage,unknown=_result(workspace,request,base,base_dir,frame,depth,rects,keys,action_ids,size,observed,features,shown,corrections,api)
    computed=time.monotonic();_write(result,directory,coverage,unknown,api);ended=time.monotonic()
    metadata.update(result,field_path=str(directory/"spatial-field.json"),table_path=str(directory/"spatial-field.csv"),
                    costs={"worker_processes":1,"startup_seconds":None,"compute_seconds":computed-started,"render_and_write_seconds":ended-computed,
                           "total_worker_seconds":ended-started,"window_count":len(result["samples"]),"fft_pixels":result["sampling_plan"]["fft_pixels"],
                           "new_fft_count":len(rects),"reused_fft_count":len(base["samples"])})
    return metadata


def validate_references(workspace,metadata,api):
    active=getattr(workspace,"_spatial_domains_active",set())
    api.need(metadata["object_id"] not in active and len(active)<8,"Incremental field dependency depth/cycle exceeded","CORRUPT_OBJECT")
    workspace._spatial_domains_active=active;active.add(metadata["object_id"])
    try:
        request=automation._saved_parameters(workspace,metadata,api)
        api.need(request.get("action")=="field_extend" and request.get("object_id")==metadata.get("base_field_object_id"),"Incremental field creator/source changed","CORRUPT_OBJECT")
        base,base_dir,frame,depth=_source(workspace,request,api)
        rects,keys,action_ids,size=_selection(workspace,request,base,frame["shape_yx"],api)
        overrides=_overrides(workspace,request,base,api);corrections={}
        recorded={r["observation_key"]:r for r in metadata.get("correction_batches",[])}
        api.need(set(recorded)==set(overrides),"Correction receipts differ from original selected observations","CORRUPT_OBJECT")
        for key,row in sorted(overrides.items()):
            corrected=spatial._checked(workspace,recorded[key]["atlas_object_id"],"spatial_atlas",_correction_parameters(base,row["sample"],row["ids"],size),automation.child_request_id(request["request_id"],"corrected-"+key[:12]),api)
            corrected_feature=spatial._checked(workspace,recorded[key]["feature_field_object_id"],"feature_field",{"object_id":corrected["object_id"],"coordinate_domain":base["coordinate_domain"],"display_feature":"family_count","max_size":size},automation.child_request_id(request["request_id"],"corrected-features-"+key[:12]),api)
            corrections[key]=(corrected,corrected_feature)
        observed=spatial._checked(workspace,metadata["batches"][-1]["atlas_object_id"],"spatial_atlas",_atlas_parameters(base,rects,size),automation.child_request_id(request["request_id"],"added-atlas"),api) if rects else None
        features=spatial._checked(workspace,metadata["batches"][-1]["feature_field_object_id"],"feature_field",{"object_id":observed["object_id"],"coordinate_domain":base["coordinate_domain"],"display_feature":"family_count","max_size":size},automation.child_request_id(request["request_id"],"added-features"),api) if observed else None
        overview,_=workspace.object(metadata["overview_object_id"])
        view=spatial._checked(workspace,overview["parent_object_id"],"view",{"object_id":base["parent_object_id"],"max_size":size},automation.child_request_id(request["request_id"],"context-view"),api)
        all_rects=[s["rect_xyxy"] for s in base["samples"]]+rects
        marks=[{"annotation_id":"region-%d"%(i+1),"kind":"rectangle","source_object_id":view["panels"][0]["source_object_id"],"coordinate_space":"source_pixels","coordinates":r,"text":"R%d"%(i+1),"status":"hypothesized","color":"cyan"} for i,r in enumerate(all_rects)]
        spatial._checked(workspace,overview["object_id"],"annotate",{"object_id":view["object_id"],"annotations":marks},automation.child_request_id(request["request_id"],"context-regions"),api)
        expected,coverage,unknown=_result(workspace,request,base,base_dir,frame,depth,rects,keys,action_ids,size,observed,features,overview,corrections,api)
        directory=workspace.root/"objects"/metadata["object_id"]
        api.need(all(metadata.get(k)==v for k,v in expected.items()) and api.read_json(directory/"spatial-field.json")==expected
                 and (directory/"spatial-field.csv").read_bytes()==spatial._csv(expected),"Incremental field differs from scientific children/base","CORRUPT_OBJECT")
        for name,value in (("sampled-support.npy",coverage),("unknown-support.npy",unknown)):
            actual=np.load(directory/name,allow_pickle=False)
            api.need(actual.dtype==np.uint8 and np.array_equal(actual,value),"Incremental support mask changed","CORRUPT_OBJECT")
        api.need(metadata.get("field_path")==str(directory/"spatial-field.json") and metadata.get("table_path")==str(directory/"spatial-field.csv"),"Incremental report path changed","CORRUPT_OBJECT")
        costs=metadata.get("costs")
        api.need(type(costs)is dict and costs.get("worker_processes")==1 and costs.get("new_fft_count")==len(rects)
                 and costs.get("reused_fft_count")==len(base["samples"]) and costs.get("window_count")==len(expected["samples"])
                 and costs.get("fft_pixels")==expected["sampling_plan"]["fft_pixels"]
                 and all(api.number(costs.get(k)) and costs[k]>=0 for k in ("compute_seconds","render_and_write_seconds","total_worker_seconds")),"Invalid incremental cost record","CORRUPT_OBJECT")
        with Image.open(directory/"preview.png") as image:api.need(list(image.size)==[expected["field_image"]["width"],expected["field_image"]["height"]],"Incremental preview mapping changed","CORRUPT_OBJECT")
        if not hasattr(workspace,"_spatial_export_snapshots"):workspace._spatial_export_snapshots={};workspace._spatial_export_journal_hashes={}
        workspace._spatial_export_snapshots[metadata["object_id"]]=copy.deepcopy(metadata)
        workspace._spatial_export_journal_hashes[metadata["object_id"]]=api.sha_file(workspace.root/"requests"/(metadata["request_id"]+".json"))
    finally:active.remove(metadata["object_id"])


def recovery(workspace,saved,api):
    request=saved.get("parameters");ident=saved.get("request_id")
    api.need(type(request)is dict and type(ident)is str and api.REQUEST_ID.fullmatch(ident)
             and request.get("request_id")==ident and request.get("workspace")==str(workspace.root)
             and saved.get("parameters_sha256")==hashlib.sha256(api.canonical(request)).hexdigest(),"Incremental recovery request identity changed","CORRUPT_OBJECT")
    result={"parent_request_id":ident,"parent_state":saved.get("state"),"children":[],"automatic_retry":False,"scientific_operations_submitted":False}
    def inspect(label,action,expected):
        child=automation.child_request_id(ident,label);file=workspace.root/"requests"/(child+".json")
        row={"request_id":child,"action":action,"role":label,"state":"not_submitted"};result["children"].append(row)
        if not file.exists():return None
        record=api.read_json(file);params=record.get("parameters",{})
        api.need(record.get("request_id")==child and params.get("request_id")==child and params.get("workspace")==str(workspace.root)
                 and params.get("action")==action and record.get("parameters_sha256")==hashlib.sha256(api.canonical(params)).hexdigest(),
                 "Incremental child original identity changed","CORRUPT_OBJECT")
        if expected is None:
            row.update(state="unverified_relationship",original_state=record.get("state"),validated=False);return None
        api.need(all(params.get(k)==v for k,v in expected.items()),"Incremental child belongs to unrelated operation","CORRUPT_OBJECT")
        row["state"]=record.get("state")
        if row["state"]=="completed":
            obj,_=workspace.object(record["response"]["object_id"])
            api.need(obj["request_id"]==child,"Incremental child object has unrelated owner","CORRUPT_OBJECT")
            row.update(object_id=obj["object_id"],validated=True);return obj
        if row["state"]=="failed":row["error"]=record.get("response",{}).get("error")
        if action=="spatial_atlas":row["partial_results"]=atlas.recovery(workspace,record,api)
        return None
    try:
        base,_,frame,_=_source(workspace,request,api);rects,_,_,size=_selection(workspace,request,base,frame["shape_yx"],api)
        overrides=_overrides(workspace,request,base,api)
        for key,row in sorted(overrides.items()):
            observed=inspect("corrected-"+key[:12],"spatial_atlas",_correction_parameters(base,row["sample"],row["ids"],size))
            inspect("corrected-features-"+key[:12],"feature_field",{"object_id":observed["object_id"],"coordinate_domain":base["coordinate_domain"],"display_feature":"family_count","max_size":size} if observed else None)
        if rects:
            observed=inspect("added-atlas","spatial_atlas",_atlas_parameters(base,rects,size))
            inspect("added-features","feature_field",{"object_id":observed["object_id"],"coordinate_domain":base["coordinate_domain"],"display_feature":"family_count","max_size":size} if observed else None)
        view=inspect("context-view","view",{"object_id":base["parent_object_id"],"max_size":size})
        marks=[{"annotation_id":"region-%d"%(i+1),"kind":"rectangle","source_object_id":view["panels"][0]["source_object_id"],"coordinate_space":"source_pixels","coordinates":r,"text":"R%d"%(i+1),"status":"hypothesized","color":"cyan"} for i,r in enumerate([s["rect_xyxy"] for s in base["samples"]]+rects)] if view else None
        inspect("context-regions","annotate",{"object_id":view["object_id"],"annotations":marks} if view else None)
    except Exception as error:result["inspection_error"]={"code":getattr(error,"code","INSPECTION_FAILED"),"message":str(error)}
    return result
