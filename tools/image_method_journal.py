"""Read bounded method-attempt slots from the image provider's own journal.

This is a projection of existing request records, not a second scientific
database. Unknown attempts keep their reservation and never authorize replay.
"""
import copy
import hashlib
import re


MAX_ATTEMPTS = 8
COST_KEYS = ("method_calls", "fft_pixels", "gpa_band_pixels", "topology_path_samples")
ROOT_ID = re.compile(r"[a-f0-9]{32}\Z")


def method_request_id(root_id, slot, api):
    api.need(type(root_id) is str and ROOT_ID.fullmatch(root_id),
             "Method budget root requires an immutable 32-hex plan identity")
    api.need(type(slot) is int and 1 <= slot <= MAX_ATTEMPTS,
             "Method attempt slot requires1..8")
    return "method-%s-%d" % (root_id, slot)


def _attempt(value, api):
    api.need(type(value) is dict and value.get("phase") in
             ("preflight", "dispatching", "completed", "failed", "finished"),
             "Invalid saved method attempt phase", "CORRUPT_OBJECT")
    costs = value.get("reserved_cost")
    api.need(type(costs) is dict and set(costs) == set(COST_KEYS) and
             all(type(costs[key]) is int and 0 <= costs[key] <= 2**53-1 for key in COST_KEYS) and
             costs["method_calls"] == 1,
             "Invalid saved method attempt reservation", "CORRUPT_OBJECT")
    return copy.deepcopy(value), copy.deepcopy(costs)


def read_attempts(workspace, root_id, api, exclude_request_id=None):
    """Inspect exactly eight deterministic slots without executing any work.

    Missing slots terminate the occupied prefix; a later occupied slot is a
    corrupt/holey chain. An unreadable occupied slot remains unknown with an
    unknown cost, so callers must stop rather than manufacture a free attempt.
    The current prepared request may be excluded from returned prior attempts,
    but its occupied slot still participates in identity and gap validation.
    """
    ids = [method_request_id(root_id, slot, api) for slot in range(1, MAX_ATTEMPTS+1)]
    api.need(exclude_request_id is None or exclude_request_id in ids,
             "Excluded method request must belong to this budget root")
    rows, gap = [], False
    for slot, ident in enumerate(ids, 1):
        path = workspace.root / "requests" / (ident + ".json")
        if not path.exists() and not path.is_symlink():
            gap = True
            continue
        api.need(not gap, "Method attempt journal contains a missing earlier slot", "CORRUPT_OBJECT")
        api.need(path.is_file() and not path.is_symlink(),
                 "Method attempt journal must be an original regular file", "CORRUPT_OBJECT")
        row = {"slot": slot, "request_id": ident, "state": "unknown", "status": "unknown",
               "verified": False, "method_attempt": None, "reserved_cost": None, "costs": None,
               "elapsed_ms": None, "automatic_retry": False,
               "request_ref": {"provider": api.BACKEND, "workspace": str(workspace.root),
                               "session": "workspace-journal-v1", "request_id": ident}}
        try:
            saved = api.read_json(path)
        except (OSError, ValueError, api.WorkspaceError):
            if ident != exclude_request_id:
                rows.append(row)
            continue
        parameters = saved.get("parameters") if type(saved) is dict else None
        api.need(type(parameters) is dict and saved.get("request_id") == ident and
                 parameters.get("request_id") == ident and parameters.get("workspace") == str(workspace.root) and
                 parameters.get("action") == "method_step" and parameters.get("root_plan_id") == root_id and
                 saved.get("parameters_sha256") == hashlib.sha256(api.canonical(parameters)).hexdigest(),
                 "Method attempt original scope, parameters or request identity changed", "CORRUPT_OBJECT")
        state = saved.get("state")
        api.need(state in ("prepared", "completed", "failed"),
                 "Invalid method request journal state", "CORRUPT_OBJECT")
        attempt, costs = _attempt(saved.get("method_attempt"), api)
        if state in ("completed", "failed"):
            response = saved.get("response")
            api.need(type(response) is dict and response.get("request_id") == ident and
                     response.get("backend") == api.BACKEND and response.get("state") == state and
                     response.get("ok") is (state == "completed"),
                     "Method attempt outcome belongs to another original request", "CORRUPT_OBJECT")
        elapsed = saved.get("elapsed_ms")
        api.need(elapsed is None or api.number(elapsed) and elapsed >= 0,
                 "Invalid saved method attempt elapsed time", "CORRUPT_OBJECT")
        row.update(state=state if state != "prepared" else "unknown",
                   status=state if state != "prepared" else "unknown", verified=True,
                   method_attempt=attempt, reserved_cost=costs, costs=copy.deepcopy(costs), elapsed_ms=elapsed)
        if state == "completed":
            row["object_id"] = saved["response"].get("object_id")
        elif state == "failed":
            row["error"] = copy.deepcopy(saved["response"].get("error"))
        if ident != exclude_request_id:
            rows.append(row)
    return rows


def recovery(workspace, saved, api):
    """Read-only diagnosis, never parent finalization or claim release.

    A child outcome does not establish that the parent owner has drained. The
    existing PID/nonce claim has no durable process-lifecycle proof, so it cannot
    safely authorize automatic interrupted-parent reconciliation.
    """
    api.need(type(saved) is dict and type(saved.get("parameters")) is dict,
             "Invalid method recovery parent", "CORRUPT_OBJECT")
    parameters = saved["parameters"]
    ident, root_id = saved.get("request_id"), parameters.get("root_plan_id")
    rows = read_attempts(workspace, root_id, api)
    matching = [row for row in rows if row["request_id"] == ident]
    api.need(len(matching) == 1 and matching[0]["verified"],
             "Method recovery requires the original verified parent journal", "CORRUPT_OBJECT")
    row = matching[0]
    attempt, children = row["method_attempt"], []
    # Even initial preflight has an original target plan/action and budget root.
    # It has not yet reserved the selected action's full scientific cost.
    plan, _ = workspace.object(parameters.get("object_id"))
    api.need(plan.get("object_id") == parameters.get("object_id") and plan.get("kind") == "method_plan" and
             plan.get("root_plan_id") == root_id and type(plan.get("actions")) is list and
             all(type(a) is dict for a in plan["actions"]),
             "Method recovery target plan identity changed", "CORRUPT_OBJECT")
    actions = [a for a in plan["actions"] if a.get("action_id") == parameters.get("action_id")]
    api.need(len(actions) == 1 and actions[0].get("kind") in ("gpa", "topology") and
             type(actions[0].get("parameters")) is dict,
             "Method recovery requires the original executable action", "CORRUPT_OBJECT")
    root = plan if plan["object_id"] == root_id else workspace.object(root_id)[0]
    cost = actions[0].get("cost")
    budget = root.get("budget")
    api.need(root.get("object_id") == root_id and root.get("kind") == "method_plan" and
             root.get("root_plan_id") == root_id and type(budget) is dict and type(cost) is dict and
             set(cost) == set(COST_KEYS) and all(type(budget.get(k)) is int and type(cost[k]) is int and
             0 <= cost[k] <= budget[k] for k in COST_KEYS) and cost["method_calls"] == 1 and
             row["slot"] <= budget["method_calls"],
             "Method recovery action/budget root binding changed", "CORRUPT_OBJECT")
    initial = set(attempt) == {"phase", "reserved_cost"}
    if initial:
        api.need(attempt["phase"] == "preflight" and attempt["reserved_cost"] ==
                 {"method_calls": 1, "fft_pixels": 0, "gpa_band_pixels": 0, "topology_path_samples": 0},
                 "Method recovery initial preflight reservation changed", "CORRUPT_OBJECT")
    else:
        api.need(attempt.get("plan_object_id") == parameters.get("object_id") and
                 attempt.get("action_id") == parameters.get("action_id") and
                 type(parameters.get("selection_reason")) is str and 1 <= len(parameters["selection_reason"].strip()) <= 2000 and
                 attempt.get("selection_reason") == parameters.get("selection_reason") and
                 all(attempt.get(key) == actions[0].get(key) for key in ("kind", "parameters")) and
                 attempt["reserved_cost"] == cost and
                 attempt.get("action_key") == hashlib.sha256(api.canonical([attempt.get("kind"), attempt.get("parameters")])).hexdigest(),
                 "Method recovery dispatch differs from its immutable selected plan", "CORRUPT_OBJECT")
    child_id = attempt.get("child_request_id")
    if child_id is None:
        api.need(attempt["phase"] == "preflight" and "child_request_id" not in attempt and
                 "child_request" not in attempt and "child_receipt" not in attempt,
                 "Method recovery is missing its dispatch identity", "CORRUPT_OBJECT")
    else:
        api.need(attempt["phase"] in ("dispatching", "completed", "failed"),
                 "Method recovery child dispatch phase changed", "CORRUPT_OBJECT")
        api.need(child_id == api.automation.child_request_id(ident, "method"),
                 "Method recovery child identity changed", "CORRUPT_OBJECT")
        child = attempt.get("child_request")
        api.need(attempt.get("kind") in ("gpa", "topology") and type(attempt.get("parameters")) is dict and
                 child == {**attempt["parameters"], "workspace": str(workspace.root),
                           "action": attempt["kind"], "request_id": child_id},
                 "Method recovery child differs from original dispatched parameters", "CORRUPT_OBJECT")
        path = workspace.root / "requests" / (child_id + ".json")
        receipt = {"request_id": child_id, "state": "missing", "automatic_retry": False}
        if path.exists() or path.is_symlink():
            api.need(path.is_file() and not path.is_symlink(), "Invalid recovery child journal", "CORRUPT_OBJECT")
            try:
                original = api.read_json(path)
            except (OSError, ValueError, api.WorkspaceError):
                receipt["state"] = "unknown"
            else:
                api.need(type(original) is dict and original.get("request_id") == child_id and original.get("parameters") == child and
                         original.get("parameters_sha256") == hashlib.sha256(api.canonical(child)).hexdigest(),
                         "Method recovery child original scope/hash changed", "CORRUPT_OBJECT")
                api.need(original.get("state") in ("prepared", "completed", "failed"),
                         "Invalid recovery child state", "CORRUPT_OBJECT")
                if original["state"] == "prepared":
                    receipt["state"] = "unknown"
                else:
                    response = original.get("response", {})
                    api.need(type(response) is dict and response.get("request_id") == child_id and response.get("backend") == api.BACKEND and
                             response.get("state") == original["state"] and
                             response.get("ok") is (original["state"] == "completed"),
                             "Method recovery child response identity changed", "CORRUPT_OBJECT")
                    if original["state"] == "completed":
                        # A different valid object can have its own valid creator.
                        # Qualification alone does not bind it to THIS child.
                        actual, _ = workspace.object(response.get("object_id"))
                        api.need(actual.get("object_id") == response.get("object_id") and
                                 actual.get("request_id") == child_id and actual.get("kind") == child["action"],
                                 "Method recovery completed object creator/kind differs from original child", "CORRUPT_OBJECT")
                    result = api._execute({"workspace": str(workspace.root), "action": "result", "query_request_id": child_id})
                    api.need(result.get("request_id") == child_id and result.get("backend") == api.BACKEND and
                             result.get("state") == original["state"] and result.get("ok") == response["ok"] and
                             result.get("object_id") == response.get("object_id"),
                             "Method recovery child outcome changed during verification", "CORRUPT_OBJECT")
                    receipt.update(state=result["state"], object_id=result.get("object_id"), error=result.get("error"))
        children.append(receipt)
    claim_path = workspace.root / "provider-execution.lock"
    claim = {"state": "absent", "owner_liveness": "not_established"}
    if claim_path.exists() or claim_path.is_symlink():
        claim["state"] = "unreadable_or_invalid"
        if claim_path.is_file() and not claim_path.is_symlink():
            try:
                value = api.read_json(claim_path)
                if (type(value) is dict and value.get("schema_version") == 1 and type(value.get("pid")) is int and value["pid"] > 0 and
                        type(value.get("nonce")) is str and re.fullmatch(r"[a-f0-9]{32}", value["nonce"]) and
                        type(value.get("request_id")) is str and api.REQUEST_ID.fullmatch(value["request_id"])):
                    claim.update(state="present", request_id=value["request_id"], pid=value["pid"],
                                 matches_parent=value["request_id"] == ident)
            except (OSError, ValueError, api.WorkspaceError):
                pass
    return {"parent_request_id": ident, "root_plan_id": root_id, "parent_journal_state": saved["state"],
            "reservation_binding": "initial_preflight_method_call" if initial else "selected_action",
            "reserved_cost": row["reserved_cost"], "children": children, "claim": claim,
            "automatic_retry": False, "release_authorized": False,
            "reconciliation": "owner_lifecycle_evidence_required",
            "next_queries": [ident] + ([child_id] if child_id else []),
            "message": "Query only these original IDs. Child completion does not finalize the parent or release its claim. "
                       "Wait for the original owner to finish/drain; if it cannot, this version has no safe automatic "
                       "prepared-parent reconciliation. Preserve journals/claim for lifecycle diagnosis; do not replay, "
                       "delete a lock, replace IDs or reset the budget."}
