"""Finite cross-method decisions over existing scientific records.

The runtime Agent selects a saved action. This adapter invokes one existing
scientific tool, never a model or a new numerical engine. The original image
request journals own attempt reservations, failed outcomes and recovery.
"""
import copy
import hashlib
import time

from PIL import Image, ImageDraw

if __package__:
    from . import image_method_policy as policy
    from . import image_method_journal as journal
else:
    import image_method_policy as policy
    import image_method_journal as journal

FIELDS = {
    "method_plan": {"object_ids", "budget", "information"},
    "method_next": {"object_id", "information_patch", "user_stop"},
    "method_step": {"object_id", "root_plan_id", "action_id", "selection_reason"},
}
COST_KEYS = ("method_calls", "fft_pixels", "gpa_band_pixels", "topology_path_samples")
INFO_KEYS = {"goal", "followup_g_vectors", "followup_basis", "loops", "model_assumption_text"}
VERSION = "gpa-topology-decisions-v1"


def _cost(api, value):
    limits = dict(method_calls=8, fft_pixels=0, gpa_band_pixels=4194304, topology_path_samples=131072)
    api.need(type(value) is dict and set(value) == set(COST_KEYS) and
             all(api.integer(value[k], 0, limits[k]) for k in COST_KEYS), "Declare all finite method budget caps; first scope adds no source FFT")
    return copy.deepcopy(value)


def _info(api, value):
    api.need(type(value) is dict and set(value) <= INFO_KEYS and value.get("goal") == "projected_topology",
             "First cross-method scope requires the explicit projected_topology question")
    for key in ("followup_basis", "model_assumption_text"):
        api.need(key not in value or type(value[key]) is str and 1 <= len(value[key].strip()) <= 2000,
                 key + " must retain a bounded actual source or explicit working assumption")
    api.need("followup_g_vectors" not in value or type(value["followup_g_vectors"]) is list and
             len(value["followup_g_vectors"]) == 2 and all(type(p) is list and len(p) == 2 and all(api.number(v) for v in p)
                                                       for p in value["followup_g_vectors"]), "Follow-up uses two finite explicit reciprocal vectors")
    if "loops" in value:
        # Existing topology parser owns coordinate/orientation/resource admission.
        api.need(type(value["loops"]) is list and 2 <= len(value["loops"]) <= 8, "Supply2..8 explicit topology circuits")
    return copy.deepcopy(value)


def _seed(workspace, ids, api):
    api.need(type(ids) is list and 1 <= len(ids) <= 3 and len(set(ids)) == len(ids), "Select1..3 distinct immutable GPA records")
    values, refs = [], []
    for ident in ids:
        saved, directory = workspace.object(ident)
        api.need(saved.get("kind") == "gpa" and saved["parameters"]["reference_mode"] == "fixed_g",
                 "First cross-method scope starts from saved fixed_g GPA evidence; other tools remain directly callable", "UNSUPPORTED_OPERATION")
        values.append(saved)
        refs.append({"object_id": ident, "request_id": saved["request_id"], "manifest_sha256": api.sha_file(directory / "object.json")})
    # Existing source/grid/calibration/mask and conjugate-band admission, no new kernel.
    api.topology._source_bundle(workspace, ids, api)
    return values, refs


def _root(workspace, ident, api):
    saved, _ = workspace.object(ident)
    api.need(saved.get("kind") in ("method_plan", "method_step"), "Select a saved cross-method plan or step")
    plan = saved if saved["kind"] == "method_plan" else workspace.object(saved["plan_object_id"])[0]
    root = plan if plan["root_plan_id"] == plan["object_id"] else workspace.object(plan["root_plan_id"])[0]
    api.need(root.get("kind") == "method_plan" and root["root_plan_id"] == root["object_id"], "Invalid immutable method budget root", "CORRUPT_OBJECT")
    return root, plan


def _ledger(workspace, root, api, exclude=None):
    attempts = journal.read_attempts(workspace, root["object_id"], api, exclude_request_id=exclude)
    spent = {key: 0 for key in COST_KEYS}
    unknown = False
    for attempt in attempts:
        data = attempt.get("method_attempt") or {}
        receipt = data.get("child_receipt") or {}
        if data.get("child_request_id") and (attempt["state"] == "unknown" or receipt.get("state") == "unknown"):
            # Reobserve ONLY the saved original child; do not turn a historical
            # unknown parent into a fabricated completed step or replay it.
            child_request = data.get("child_request")
            child_id = data["child_request_id"]
            child_file = workspace.root / "requests" / (child_id + ".json")
            if child_file.is_file():
                saved = api.read_json(child_file)
                api.need(saved.get("parameters") == child_request and child_request.get("request_id") == child_id,
                         "Recovery child differs from the request saved before dispatch", "CORRUPT_OBJECT")
                response = api._execute({"workspace": str(workspace.root), "action": "result", "query_request_id": child_id})
                if response.get("ok") or response.get("state") == "failed":
                    attempt["observed_child_receipt"] = {"request_id": child_id,
                        "state": "completed" if response.get("ok") else "failed", "object_id": response.get("object_id"),
                        "error": response.get("error"), "automatic_retry": False}
        effective = attempt.get("observed_child_receipt") or receipt
        attempt["effective_state"] = effective.get("state", attempt["state"])
        reserved = attempt.get("reserved_cost")
        if reserved is None:
            unknown = True
            continue
        for key in COST_KEYS:
            spent[key] += reserved[key]
        unknown |= attempt["effective_state"] == "unknown"
    unquantified = any(a.get("reserved_cost") is None for a in attempts)
    remaining = {key: 0 if unquantified else max(0, root["budget"][key] - spent[key]) for key in COST_KEYS}
    return {"attempts": attempts, "spent": {k: None for k in COST_KEYS} if unquantified else spent,
            "known_spent_subtotal": spent, "remaining": remaining, "has_unknown": unknown,
            "snapshot_sha256": hashlib.sha256(api.canonical(attempts)).hexdigest(),
            "unquantified_reservations": [a["request_id"] for a in attempts if a.get("reserved_cost") is None],
            "cost_semantics": "Conservative full reservations charged for every dispatch, including failure/unknown; preflight refusal costs one attempt. Elapsed is observed, not estimated CPU work. Unknown is never zero.",
            "scope": {"provider": "external-image-workspace", "workspace": str(workspace.root), "session": "workspace-journal-v1", "root_plan_id": root["object_id"]}}


def _evidence(workspace, root, ledger, api):
    ids = list(root["seed_object_ids"])
    topology = None
    for attempt in ledger["attempts"]:
        data = attempt.get("method_attempt") or {}
        receipt = attempt.get("observed_child_receipt") or data.get("child_receipt") or {}
        if receipt.get("state") != "completed":
            continue
        saved, _ = workspace.object(receipt["object_id"])
        api.need(saved["request_id"] == receipt["request_id"] and saved["kind"] in ("gpa", "topology"),
                 "Method child receipt differs from its actual original result", "CORRUPT_OBJECT")
        if saved["kind"] == "gpa":
            if saved["object_id"] not in ids:
                ids.append(saved["object_id"])
        else:
            topology = saved
    gpas, refs = _seed(workspace, ids, api)
    return gpas, refs, topology


def _actions(raw, root, ledger, api):
    actions = []
    for value in raw:
        api.need(value.get("kind") in ("gpa", "topology", "request_information", "stop"), "Unknown method policy action", "CORRUPT_OBJECT")
        signature = {"root_plan_id": root["object_id"], "ledger_sha256": ledger["snapshot_sha256"], **value}
        actions.append({**value, "action_id": hashlib.sha256(api.canonical(signature)).hexdigest()[:32]})
    return actions


def _plan(workspace, request, metadata, api):
    if request["action"] == "method_plan":
        budget = _cost(api, request.get("budget"))
        information = _info(api, request.get("information"))
        gpas, refs = _seed(workspace, request.get("object_ids"), api)
        root = {"object_id": metadata["object_id"], "seed_object_ids": request["object_ids"], "budget": budget}
        history = []
    else:
        root, previous = _root(workspace, request["object_id"], api)
        patch = request.get("information_patch", {})
        api.need(type(patch) is dict and set(patch) <= INFO_KEYS, "Unknown method information patch")
        information = _info(api, {**previous["information"], **patch})
        history = [*previous.get("plan_history", []), previous["object_id"]]
        api.need(len(history) <= 16, "Method proposal history limit16 reached", "BUDGET_EXCEEDED")
        budget = root["budget"]
    ledger = _ledger(workspace, root, api)
    gpas, refs, topology = _evidence(workspace, root, ledger, api)
    stop = request.get("user_stop", False)
    api.need(type(stop) is bool, "user_stop must be boolean")
    if ledger["has_unknown"] or stop:
        result = {"actions": [], "decision": {"status": "blocked_unknown" if ledger["has_unknown"] else "stopped",
                  "reason": "Query original step/child IDs; unknown work is reserved and never replayed" if ledger["has_unknown"] else "User requested stop"}}
    else:
        attempted = [{**(row.get("method_attempt") or {}), "state": row["effective_state"]} for row in ledger["attempts"]]
        result = policy.propose(gpas, topology, information, ledger["remaining"], attempted)
    metadata.update(kind="method_plan", policy_version=VERSION, root_plan_id=root["object_id"],
                    seed_object_ids=root["seed_object_ids"], budget=budget, information=information,
                    plan_history=history, input_refs=refs, ledger=ledger, decision=result["decision"],
                    actions=_actions(result["actions"], root, ledger, api),
                    next_request_id=journal.method_request_id(root["object_id"], len(ledger["attempts"])+1, api) if len(ledger["attempts"])<8 else None,
                    latest_topology_object_id=topology["object_id"] if topology else None,
                    reused_input_cost={"gpa_records": len(root["seed_object_ids"]), "new_fft_pixels": 0,
                                       "historical_elapsed_ms": None, "not_charged_again": True},
                    interpretation_status="hypothesized", material_dislocation_confirmed=False,
                    source_arrays_modified=False, fft_recomputed=False)
    return metadata


def _step(workspace, request, metadata, api):
    plan, _ = workspace.object(request["object_id"])
    api.need(plan.get("kind") == "method_plan" and plan["root_plan_id"] == request.get("root_plan_id"), "Select the exact saved proposal in its budget root")
    root, _ = _root(workspace, plan["object_id"], api)
    ledger = _ledger(workspace, root, api, exclude=request["request_id"])
    expected = journal.method_request_id(root["object_id"], len(ledger["attempts"])+1, api)
    api.need(request["request_id"] == expected, "Save and use the proposal's deterministic next_request_id; other slot identities are refused")
    api.need(not ledger["has_unknown"] and ledger["snapshot_sha256"] == plan["ledger"]["snapshot_sha256"],
             "Proposal is stale or a prior attempt is unknown; inspect/recover and request a new proposal", "STALE_METHOD_PLAN")
    selected = [a for a in plan["actions"] if a["action_id"] == request.get("action_id")]
    api.need(len(selected) == 1, "Select an action actually saved in this proposal")
    selected = selected[0]
    api.need(selected["kind"] in ("gpa", "topology"),
             "Information/stop are decisions, not scientific steps; supply information_patch/user_stop via image_method_next")
    reason = request.get("selection_reason")
    api.need(type(reason) is str and 1<=len(reason.strip())<=2000, "Record the Agent's actual selection rationale")
    cost = selected["cost"]
    api.need(all(cost[key] <= ledger["remaining"][key] for key in COST_KEYS), "Selected method exceeds remaining reserved budget", "BUDGET_EXCEEDED")
    update = workspace.method_attempt_update
    child_id = api.automation.child_request_id(request["request_id"], "method")
    parameters = copy.deepcopy(selected["parameters"])
    receipt = None
    attempt = {"phase": "preflight", "kind": selected["kind"], "parameters": parameters, "action_id": selected["action_id"],
               "action_key": hashlib.sha256(api.canonical([selected["kind"], parameters])).hexdigest(),
               "reserved_cost": cost, "selection_reason": reason, "plan_object_id": plan["object_id"]}
    update(attempt)
    started = time.monotonic()
    if selected["kind"] in ("gpa", "topology"):
        child = {"workspace": str(workspace.root), "action": selected["kind"], "request_id": child_id, **parameters}
        # Journal these BEFORE dispatch; even a killed parent exposes original identity/reservation.
        update({"phase": "dispatching", "child_request_id": child_id, "child_request": child})
        response = api._execute(child)
        receipt = {"request_id": child_id, "state": "completed" if response.get("ok") else response.get("state", "unknown"),
                   "object_id": response.get("object_id"), "error": response.get("error"), "automatic_retry": False}
        update({"phase": "completed" if response.get("ok") else "failed", "child_receipt": receipt, "child_elapsed_ms": (time.monotonic()-started)*1000})
    else:
        update({"phase": "completed", "child_receipt": None, "child_elapsed_ms": 0})
    metadata.update(kind="method_step", policy_version=VERSION, root_plan_id=root["object_id"], plan_object_id=plan["object_id"],
                    selected_action=selected, selection_reason=reason, child_receipt=receipt,
                    attempt_cost=cost, source_arrays_modified=False, fft_recomputed=False,
                    interpretation_status="hypothesized", material_dislocation_confirmed=False)
    return metadata


def action(workspace, name, request, metadata, directory, api):
    started = time.monotonic()
    metadata = _step(workspace, request, metadata, api) if name == "method_step" else _plan(workspace, request, metadata, api)
    metadata["decision_or_step_wall_ms"] = (time.monotonic()-started)*1000
    # Small decision feedback, never a scientific image or a new viewer.
    image = Image.new("RGB", (800, 240), "#151c23")
    draw = ImageDraw.Draw(image)
    title = metadata.get("decision", {}).get("status", metadata.get("selected_action", {}).get("kind", "method step"))
    draw.text((16, 15), "Cross-method evidence | "+str(title), fill="#63dcdf")
    draw.text((16, 45), "Conditional image evidence. No confirmed material defect or unique 3D interpretation.", fill="white")
    for i, item in enumerate(metadata.get("actions", [])[:4]):
        draw.text((16, 80+32*i), (item["kind"]+": "+str(item["reason"]))[:115], fill="white")
    image.save(directory / "preview.png")
    api.write_new(directory / "method-decision.json", api.canonical(metadata)+b"\n")
    return metadata


def validate_references(workspace, metadata, api):
    api.need(metadata.get("policy_version") == VERSION, "Unknown cross-method policy version", "CORRUPT_OBJECT")
    if metadata["kind"] == "method_plan":
        gpas, refs = _seed(workspace, [r["object_id"] for r in metadata["input_refs"]], api)
        api.need(refs == metadata["input_refs"], "Method input evidence changed", "CORRUPT_OBJECT")
        _cost(api, metadata["budget"]); _info(api, metadata["information"])
        original = api.read_json(workspace.root / "requests" / (metadata["request_id"] + ".json"))["parameters"]
        if original["action"] == "method_plan":
            root = metadata
            api.need(metadata["root_plan_id"] == metadata["object_id"] and metadata["seed_object_ids"] == original["object_ids"] and
                     metadata["budget"] == original["budget"] and metadata["information"] == original["information"] and not metadata["plan_history"],
                     "Initial method proposal differs from original source/budget/information", "CORRUPT_OBJECT")
        else:
            api.need(original["action"] == "method_next", "Method plan has a different original action", "CORRUPT_OBJECT")
            root, previous = _root(workspace, original["object_id"], api)
            api.need(metadata["root_plan_id"] == root["object_id"] and metadata["seed_object_ids"] == root["seed_object_ids"] and
                     metadata["budget"] == root["budget"] and metadata["information"] == {**previous["information"], **original.get("information_patch", {})} and
                     metadata["plan_history"] == [*previous.get("plan_history", []), previous["object_id"]],
                     "Revised method proposal reset its budget/source/information history", "CORRUPT_OBJECT")
        # Reconstruct using the FROZEN observation of journals, not newer outcomes.
        ledger = metadata["ledger"]
        api.need(ledger["snapshot_sha256"] == hashlib.sha256(api.canonical(ledger["attempts"])).hexdigest(),
                 "Method proposal attempt snapshot changed", "CORRUPT_OBJECT")
        for slot, attempt in enumerate(ledger["attempts"], 1):
            api.need(attempt["request_id"] == journal.method_request_id(root["object_id"], slot, api) and
                     attempt["request_ref"] == {"provider": api.BACKEND, "workspace": str(workspace.root),
                        "session": "workspace-journal-v1", "request_id": attempt["request_id"]},
                     "Method proposal contains a foreign or omitted attempt", "CORRUPT_OBJECT")
        expected_gpas, expected_refs, topology = _evidence(workspace, root, ledger, api)
        api.need(refs == expected_refs and metadata["latest_topology_object_id"] == (topology["object_id"] if topology else None),
                 "Method proposal science differs from its frozen original attempts", "CORRUPT_OBJECT")
        if ledger["has_unknown"] or original.get("user_stop", False):
            proposed = []
        else:
            attempted = [{**(row.get("method_attempt") or {}), "state": row["effective_state"]} for row in ledger["attempts"]]
            expected = policy.propose(expected_gpas, topology, metadata["information"], ledger["remaining"], attempted)
            proposed = expected["actions"]
            api.need(metadata["decision"] == expected["decision"], "Method decision changed", "CORRUPT_OBJECT")
        api.need(metadata["actions"] == _actions(proposed, root, ledger, api), "Method actions/costs differ from frozen evidence", "CORRUPT_OBJECT")
    else:
        plan, _ = workspace.object(metadata["plan_object_id"])
        api.need(plan.get("kind") == "method_plan" and plan["root_plan_id"] == metadata["root_plan_id"] and
                 metadata["selected_action"] in plan["actions"], "Method step proposal changed", "CORRUPT_OBJECT")
        receipt = metadata.get("child_receipt")
        if receipt and receipt["state"] == "completed":
            child, _ = workspace.object(receipt["object_id"])
            api.need(child["request_id"] == receipt["request_id"] and child["kind"] == metadata["selected_action"]["kind"],
                     "Method result differs from original child", "CORRUPT_OBJECT")
