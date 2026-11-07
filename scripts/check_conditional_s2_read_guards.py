"""Zero-fit checks of the two explicit post-amendment adapter changes."""
import copy
import json
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import image_workspace as api, image_column_fit as columns, image_column_model as model

workspace = api.Workspace(str(ROOT / "outputs/conditional-s2-diagnostic-reproduction-v1/images"), False)
original = next(api.read_json(p) for p in (workspace.root / "objects").glob("*/object.json")
                if api.read_json(p).get("kind") == "column_fit")
request = api.read_json(workspace.root / "requests" / (original["request_id"]+".json"))["parameters"]
checks = []
with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("No fit permitted")) as fitting, \
     patch.object(model, "minimize", side_effect=AssertionError("No optimizer permitted")) as optimizing:
    changed = copy.deepcopy(request)
    changed["count_interpretation"]["model"] = "unsupported_for_zero_fit_check"
    changed["geometry"]["site_centers_xy"][0] = [22.75, 20]
    changed["geometry"]["supplied_columns_xy"][0] = [22.75, 20]
    _, raw, _, plans = columns._prepare(workspace, changed, api)
    assert raw is not None and plans[0]["center_xy"] == [22.75, 20]
    assert plans[0]["_status"] == "UNKNOWN_UNSUPPORTED_NOISE"
    checks.append("Subpixel center22.75 lies in half-open ROI[18,23), with no new nominal-distance restriction")
    changed["geometry"]["site_centers_xy"][0] = [23, 20]
    try:
        columns._prepare(workspace, changed, api)
        raise AssertionError("Exclusive ROI edge was admitted")
    except api.WorkspaceError as error:
        assert error.code == "INVALID_ARGUMENT"
    checks.append("Center exactly on exclusive edge23 is refused before fitting")
    saved, _ = workspace.object(original["object_id"])
    for key, value in (("physical_classification", "VACANCY_CONFIRMED"), ("physical_model_verified", True),
                       ("confidence_interval", [0, 1])):
        changed = copy.deepcopy(saved); changed[key] = value
        try:
            columns.validate_references(workspace, changed, api)
            raise AssertionError("Forged physical/interval meaning admitted")
        except api.WorkspaceError as error:
            assert error.code == "CORRUPT_OBJECT"
    checks.append("Changed physical classification/model-verification/CI labels are rejected on read")
    fitting.assert_not_called(); optimizing.assert_not_called()
record = dict(status="PASS", checks=checks, fit_calls=0, optimizer_calls=0,
              original_objects_changed=False, scientific_gates_changed=False)
dest = ROOT / "docs/conditional-s2/validation/post-amendment-zero-fit-checks.json"
with dest.open("x", encoding="utf-8") as stream:
    stream.write(json.dumps(record, indent=2)+"\n")
print(json.dumps(record))
