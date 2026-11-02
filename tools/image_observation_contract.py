"""Additive annotation intent; it does not qualify science or authenticate actors."""
PURPOSE = "resumable_observation"
VERSION = 1
ORIGINS = ("researcher", "agent", "unspecified")
BASIS = "caller_reported_not_authenticated"
INPUT_FIELDS = ("purpose", "selection_origin")


def fields(item, anchor, note, previous, incoming, need):
    # Only omission may inherit intent; an explicit null is not a legacy absence.
    if "purpose" in item:
        need(type(item["purpose"]) is str and item["purpose"] == PURPOSE,
             "Unsupported annotation purpose; omit the field to preserve existing intent")
    purpose = item.get("purpose", (previous or {}).get("purpose"))
    if purpose is None:
        need("selection_origin" not in item, "selection_origin requires purpose=resumable_observation")
        return {}
    need(purpose == PURPOSE, "Unsupported annotation purpose")
    need(bool(item.get("annotation_id")), "resumable_observation requires caller-supplied stable annotation_id")
    prior = previous if previous and previous.get("purpose") == PURPOSE else None
    if prior:
        need(type(prior.get("observation_contract_version")) is int and prior["observation_contract_version"] == VERSION and prior.get("selection_origin_basis") == BASIS,
             "Unsupported saved observation contract; do not infer its actor")
    if incoming is None:  # Existing immutable mark, reprojected without a new scientific selection.
        origin = item.get("selection_origin")
    elif "selection_origin" in incoming:
        origin = incoming["selection_origin"]
    elif prior:
        changed = anchor != prior.get("anchor") or note != prior.get("note", "")
        origin = "unspecified" if changed else prior.get("selection_origin")
    else:
        need(False, "resumable_observation requires explicit selection_origin: researcher, agent or unspecified")
    need(type(origin) is str and origin in ORIGINS, "selection_origin must be researcher, agent or unspecified; caller-reported, not authenticated")
    length = len(note.encode("utf-16-le", "surrogatepass")) // 2
    need(length <= 1000, "annotation.note: actual_length=%d; limit=1000 UTF-16 code units; not saved; no truncation" % length)
    return {"purpose": PURPOSE, "observation_contract_version": VERSION,
            "selection_origin": origin, "selection_origin_basis": BASIS}
