"""Qualification only: real child commit, omitted parent finalization, normal exit.

No kill, ledger edits, lock creation/deletion, external services or fake objects.
This hook is not reachable through the production provider entry point.
"""
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import image_workspace as worker


class StopParentFinalization(BaseException):
    def __init__(self, child):
        self.child = child


def prepare(target):
    import numpy as np
    import tifffile
    from create_topology_fixtures import contrast_vortex_fixture, G_VECTORS, MASK_SIGMA, REFERENCE_RECT, NESTED_LOOPS
    target = Path(target)
    if target.exists():
        raise RuntimeError("Never overwrite a previous qualification input")
    fixture = contrast_vortex_fixture()
    tifffile.imwrite(target, fixture["image"].astype(np.float32))
    return {"scope": "public_analytic_contrast_only_vortex_not_material_verification",
            "generator": "create_topology_fixtures.contrast_vortex_fixture",
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "g": G_VECTORS.tolist(), "mask_sigma": MASK_SIGMA, "reference_rect": REFERENCE_RECT,
            "loops": [{"rect": rect, "orientation": "positive_image_xy"} for rect in NESTED_LOOPS],
            "true_material_burgers_pixel_xy": fixture["true_material_burgers_pixel_xy"]}


def controlled_step(request):
    if request.get("action") != "method_step":
        raise RuntimeError("Qualification entry accepts only its original method_step")
    original = worker._execute
    expected = worker.automation.child_request_id(request["request_id"], "method")
    observed = None
    calls = 0

    def execute(value):
        nonlocal calls
        result = original(value)
        if value.get("request_id") == expected and value.get("action") == "gpa":
            calls += 1
            if not result.get("ok"):
                raise RuntimeError("Qualification child must actually complete: " + str(result))
            # BaseException unwinds the open parent journal without converting
            # this controlled stop into a new failed/completed parent record.
            raise StopParentFinalization(result)
        return result

    worker._execute = execute
    try:
        worker.execute(request)
    except StopParentFinalization as stop:
        observed = stop.child
    finally:
        worker._execute = original
    if observed is None or calls != 1:
        raise RuntimeError("Expected exactly one original GPA child, never replayed")
    root = Path(request["workspace"])
    parent = worker.read_json(root / "requests" / (request["request_id"] + ".json"))
    if parent["state"] != "prepared" or parent["method_attempt"]["phase"] != "dispatching":
        raise RuntimeError("Controlled stop must leave original prepared dispatch record")
    claim = worker.read_json(root / "provider-execution.lock")
    if claim["request_id"] != request["request_id"]:
        raise RuntimeError("Original provider claim must still belong to this parent")
    print(json.dumps({"qualification_hook": "after_real_child_before_parent_receipt",
                      "parent_request_id": request["request_id"], "child_request_id": expected,
                      "child_object_id": observed["object_id"], "child_dispatch_calls": calls,
                      "parent_state": parent["state"], "claim_nonce": claim["nonce"],
                      "exit_intent": "normal_return_no_kill"}), file=sys.stderr)
    # Python read only: cannot clear the parent's Node-owned provider claim.
    return worker.execute({"workspace": request["workspace"], "action": "result",
                           "query_request_id": request["request_id"]})


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--prepare":
        print(json.dumps(prepare(sys.argv[2])))
    else:
        result = controlled_step(worker.strict_json(sys.stdin.buffer.read().decode("utf-8")))
        print(json.dumps(result, ensure_ascii=True, allow_nan=False))
        # Match the normal provider convention for an unknown result. This is
        # an ordinary program exit, not a hard kill or simulated close event.
        raise SystemExit(0 if result.get("ok") else 1)
