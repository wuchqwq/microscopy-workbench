"""Read-only, record-specific authoring check; no image inference or tool dispatch.

Only Python stdlib is required. This is not a general JSON Schema validator and
does not authenticate source text, receipt identities or scientific premises.
"""
import json
from pathlib import Path
import re
import sys

SKILL_ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((SKILL_ROOT / "references/method-decision-contract-v1.json").read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(value, expected, label):
    require(type(value) is dict and set(value) == set(expected), label + ": exact fields required (use explicit nulls)")


def text(value, label, limit=4000):
    require(type(value) is str and bool(value.strip()) and len(value) <= limit, label + ": nonempty bounded text required")


def object_id(value, label):
    require(type(value) is str and re.fullmatch(r"[a-f0-9]{32}", value) is not None, label + ": saved object ID required")


def request_id(value, label):
    text(value, label, 128)


def scope_locator(value, label):
    fields(value, CONTRACT["locator_fields"], label)
    text(value["provider"], label + ".provider", 256)
    text(value["workspace"], label + ".workspace", 1000)
    if value["session_id"] is not None:
        text(value["session_id"], label + ".session_id", 128)


def validate_record(record):
    """Validate an explicitly chosen record; return it unchanged or raise ValueError."""
    c = CONTRACT
    fields(record, c["record_fields"], "record")
    require(record["version"] == c["contract_version"], "unknown decision contract version")
    require(record["method_index_version"] == c["method_index_version"], "unknown method index version")
    request_id(record["decision_id"], "decision_id")
    require(record["selection_origin"] in ("agent", "researcher", "unspecified"), "invalid selection_origin")
    text(record["question"], "question")
    text(record["reason"], "reason")
    choice, method = record["choice"], record["method"]
    require(type(choice) is str and choice in c["choices"], "unknown explicit choice")
    require(type(method) is str and method in c["choices"][choice]["methods"], "method is unavailable for this explicit choice")
    require(record["estimand"] == c["estimands"][method], "keep baseline and central-component estimands separate")
    require(record["physical_status"] in c["physical_statuses"], "a numerical record cannot confirm physical interpretation")

    scope_locator(record["locator"], "locator")
    prior = record["prior_request"]
    partial_source = choice == "recover_original" or (choice == "retain_unknown" and type(prior) is dict and prior.get("outcome") in ("unknown", "pending"))
    source, rect = record["source"], None
    require(source is not None or partial_source, "new/saved measurement requires a complete source")
    if source is not None:
        fields(source, c["source_fields"], "source")
        for key in ("object_id", "source_object_id"):
            if not (partial_source and source[key] is None):
                object_id(source[key], "source." + key)
        frame = source["frame_index"]
        require((partial_source and frame is None) or (type(frame) is int and frame >= 0), "frame_index: explicit zero-based integer required for measurement")
        rect = source["rect"]
        if not (partial_source and rect is None):
            require(type(rect) is list and len(rect) == 4 and all(type(x) is int for x in rect), "rect: four original source-pixel integer edges")
            require(0 <= rect[0] < rect[2] and 0 <= rect[1] < rect[3], "rect: nonempty half-open source support required")
        if source["calibration_object_id"] is not None:
            object_id(source["calibration_object_id"], "source.calibration_object_id")

    baseline = record["baseline_evidence"]
    if baseline is not None:
        fields(baseline, c["baseline_fields"], "baseline_evidence")
        require(baseline["kind"] in ("raw_statistics", "fft_measurement", "column_fit_raw"), "unknown baseline evidence kind")
        object_id(baseline["object_id"], "baseline.object_id")
        request_id(baseline["request_id"], "baseline.request_id")
    premises = record["premises"]
    fields(premises, c["premises"], "premises")
    for name, premise in premises.items():
        fields(premise, c["premise_fields"], "premise." + name)
        require(premise["status"] in c["premise_statuses"], "invalid premise status")
        if premise["status"] == "supplied":
            text(premise["source_text"], "premise." + name + ".source_text")
        else:
            require(premise["source_text"] is None or type(premise["source_text"]) is str, "unknown premise source must be text or explicit null")

    prior, next_request, saved = (record[k] for k in ("prior_request", "next_request", "saved_result"))
    if prior is not None:
        fields(prior, c["request_fields"], "prior_request")
        request_id(prior["request_id"], "prior.request_id")
        require(prior["outcome"] in c["request_outcomes"], "unknown prior outcome")
        scope_locator(prior["locator"], "prior.locator")
    if next_request is not None:
        fields(next_request, c["next_request_fields"], "next_request")
        request_id(next_request["request_id"], "next.request_id")
        require(next_request["tool"] in ("image_column_fit", "image_result"), "record only an explicit S2 write or original-result read")
    if saved is not None:
        fields(saved, c["saved_result_fields"], "saved_result")
        object_id(saved["object_id"], "saved.object_id")
        request_id(saved["request_id"], "saved.request_id")
        require(saved["status"] in c["numerical_statuses"] and saved["comparison_status"] in c["numerical_statuses"], "saved numerical statuses must remain available or unknown")
        require(saved["status"] != "unknown" or saved["comparison_status"] == "unknown", "unknown target cannot promote whole comparison")
        require(next_request is None, "saved outcome is evidence, not a replay request")
    revision = record["revision_of_request_id"]
    if revision is not None:
        request_id(revision, "revision_of_request_id")
        require(prior is not None and revision == prior["request_id"] and prior["outcome"] in ("completed", "failed"), "revision needs the linked prior known outcome")
    if prior is not None and prior["outcome"] in ("unknown", "pending"):
        require(choice == "recover_original" or (choice == "retain_unknown" and next_request is None), "unknown/pending write permits original-ID recovery or a stopped write")
        require(record["locator"] == prior["locator"], "retain the original provider/workspace/session locator")

    if choice == "recover_original":
        require(prior is not None and next_request == {"tool": "image_result", "request_id": prior["request_id"]}, "recover exact original ID through image_result")
        require(record["locator"] == prior["locator"], "retain the original provider/workspace/session locator")
        require(saved is None and revision is None, "recovery does not revise or relabel a saved result")
    elif choice in ("conditional_s2", "save_s2_unknown"):
        all_supplied = all(p["status"] == "supplied" for p in premises.values())
        require(all_supplied if choice == "conditional_s2" else not all_supplied, "distinguish supplied-premise S2 from a missing-premise raw + UNKNOWN request")
        if choice == "save_s2_unknown":
            require(any(premises[name]["status"] != "supplied" for name in ("counts", "geometry", "width_shape")), "raw + UNKNOWN requires an unavailable worker prerequisite, not reference interpretation alone")
        require(baseline is not None and baseline["kind"] in ("raw_statistics", "column_fit_raw"), "retain the raw baseline evidence")
        require(rect[2] - rect[0] == 5 and rect[3] - rect[1] == 5, "S2 decision retains the fixed 5x5 primary readout")
        if saved is None:
            require(next_request is not None and next_request["tool"] == "image_column_fit", "planned S2 must name its explicit write")
            require(baseline["kind"] == "raw_statistics", "planned S2 needs existing baseline, not an invented future receipt")
        else:
            require(choice != "save_s2_unknown" or (saved["status"] == "unknown" and saved["comparison_status"] == "unknown"), "missing prerequisites cannot be labelled available")
            if baseline["kind"] == "column_fit_raw":
                require(baseline["object_id"] == saved["object_id"] and baseline["request_id"] == saved["request_id"], "saved raw must refer to the same column-fit receipt")
        new_id = saved["request_id"] if saved is not None else next_request["request_id"]
        if prior is not None:
            require(revision == prior["request_id"] and new_id != prior["request_id"], "deliberate revision uses a new ID linked to the prior result")
        else:
            require(revision is None, "revision has no prior request")
    else:
        require(next_request is None and saved is None and revision is None, "baseline/unknown/history choices dispatch no S2 operation")
        if choice == "baseline_sufficient":
            expected = "fft_measurement" if method == "H0" else "raw_statistics"
            require(baseline is not None and baseline["kind"] == expected, "baseline choice needs the matching saved observable")
    return record


def main():
    try:
        require(len(sys.argv) == 2, "usage: check_method_decision.py RECORD.json")
        record = validate_record(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
        print(json.dumps({"valid": True, "decision_id": record["decision_id"], "choice": record["choice"]}))
        return 0
    except (ValueError, OSError) as error:
        print(json.dumps({"valid": False, "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
