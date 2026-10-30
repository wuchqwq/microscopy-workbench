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
