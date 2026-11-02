"""Preview-only durable dispatch admission. Provider journals remain authoritative.

Reservation is operational, never a scientific result. No timeout/PID inference
releases an unknown claim. Existing result-object references acknowledge a known
completed preview; changing request IDs or display size alone does not.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import uuid

VERSION = 1


def _hash(value, api):
    return hashlib.sha256(api.canonical(value)).hexdigest()


def _directories(workspace, api):
    root = workspace.root / "preview-admission-v1"
    for directory in (root, root / "intents", root / "resources", root / "locks", root / "acknowledged"):
        api.need(not directory.is_symlink(), "Linked preview admission path", "PREVIEW_ADMISSION_CORRUPT")
        directory.mkdir(exist_ok=True)
        api.need(directory.is_dir(), "Preview admission path is not a directory", "PREVIEW_ADMISSION_CORRUPT")
    return root


def _read(path, api):
    api.need(path.is_file() and not path.is_symlink() and path.stat().st_size <= 256 * 1024,
             "Missing or invalid preview admission record", "PREVIEW_ADMISSION_CORRUPT")
    value = api.strict_json(path.read_text(encoding="utf-8"))
    api.need(type(value) is dict and type(value.get("version")) is int and value.get("version") == VERSION,
             "Unsupported preview admission record", "PREVIEW_ADMISSION_CORRUPT")
    return value


def _write(path, value, api, exclusive=False):
    encoded = api.canonical(value) + b"\n"
    temporary = path if exclusive else path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    with temporary.open("xb") as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    if not exclusive:
        api.need(not path.is_symlink(), "Linked preview admission record", "PREVIEW_ADMISSION_CORRUPT")
        os.replace(temporary, path)
    # Directory fsync is supported on POSIX, not on all Windows filesystems.
    if os.name != "nt":
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def _binding(workspace, ident, api):
    parent, _, _ = workspace.measurement_operand(ident)
    if parent.get("kind") == "compare":
        source = parent.get("base_object_id", parent["object_id"])
    else:
        source = workspace.measurement_grid_identity(ident)["source_grid_object_id"]
    record, _ = workspace.object(source)
    # Reopening the same fixed file/frame is a known alias, not new evidence.
    # Provenance + plane selection + payload distinguish equal-valued frames.
    identity = record.get("source_identity")
    if record.get("kind") == "frame" and type(identity) is dict and identity.get("sha256") and identity.get("path"):
        grid = {"source_path": identity["path"], "source_sha256": identity["sha256"],
                "frame_index": record.get("frame_index"), "dataset_index": record.get("dm_dataset_index"),
                "plane_selection": record.get("dm_plane_selection"),
                "array_sha256": record["files_sha256"]["data.npy"], "shape_yx": record.get("shape_yx"), "dtype": record.get("dtype")}
    else:
        grid = {"source_grid_object_id": source, "source_files_sha256": record["files_sha256"]}
    binding = {"provider": api.BACKEND, "workspace": str(workspace.root), "grid": grid}
    return binding, _hash(binding, api)


def _references(workspace, ident, original, api):
    todo, seen = [ident], set()
    while todo:
        current = todo.pop()
        if current in seen:
            continue
        api.need(len(seen) < 64, "Preview result-reference ancestry exceeds budget", "PREVIEW_ADMISSION_CORRUPT")
        seen.add(current)
        record, _ = workspace.object(current)
        if current == original:
            return True
        todo.extend(record[key] for key in ("parent_object_id", "base_object_id", "render_base_object_id")
                    if type(record.get(key)) is str and api.OBJECT_ID.fullmatch(record[key]))
    return False


def _terminal(workspace, owner, api):
    path = workspace.root / "requests" / (owner + ".json")
    if not path.exists():
        return None
    try:
        record = api.read_json(path)
    except (ValueError, OSError):
        return None
    api.need(record.get("request_id") == owner, "Preview owner journal identity differs", "PREVIEW_ADMISSION_CORRUPT")
    api.need(record.get("parameters", {}).get("action") == "view", "Preview claim journal belongs to a different operation", "PREVIEW_ADMISSION_CORRUPT")
    if record.get("state") == "completed":
        result = workspace.object(record["response"]["object_id"])[0]
        return "completed", result["object_id"]
    if record.get("state") == "failed" and record.get("response", {}).get("request_id") == owner:
        return "failed", None
    return None


def _intent(root, ident, api):
    value = _read(root / "intents" / (ident + ".json"), api)
    hexadecimal = lambda item: type(item) is str and len(item) == 64 and all(c in "0123456789abcdef" for c in item)
    api.need(set(value) == {"version", "request_id", "state", "resource_key", "binding", "parameters_sha256", "ticket_sha256"} and
             value.get("request_id") == ident and value.get("state") in ("reserved", "dispatched", "not_submitted") and
             hexadecimal(value.get("resource_key")) and hexadecimal(value.get("parameters_sha256")) and hexadecimal(value.get("ticket_sha256")) and
             type(value.get("binding")) is dict and value["binding"].get("provider") == api.BACKEND and
             value["binding"].get("workspace") == str(root.parent) and _hash(value["binding"], api) == value["resource_key"],
             "Preview intent identity/binding is incomplete or inconsistent", "PREVIEW_ADMISSION_CORRUPT")
    fence_path = root / "intents" / (ident + ".dispatch")
    if value["state"] in ("dispatched", "not_submitted"):
        fence = _read(fence_path, api)
        api.need(set(fence) == {"version", "request_id", "state"} and fence.get("request_id") == ident and fence.get("state") == value["state"],
                 "Preview intent and dispatch fence disagree", "PREVIEW_ADMISSION_CORRUPT")
    if value["state"] == "not_submitted":
        journal = api.read_json(root.parent / "requests" / (ident + ".json"))
        api.need(journal.get("state") == "not_submitted" and journal.get("response", {}).get("state") == "not_submitted" and journal.get("parameters", {}).get("action") == "view",
                 "Aborted preview disagrees with original request journal", "PREVIEW_ADMISSION_CORRUPT")
    return value


def validate_parameters(workspace, request, api):
    root = _directories(workspace, api)
    intent = _intent(root, request["request_id"], api)
    api.need(intent["parameters_sha256"] == _hash({**request, "workspace": str(workspace.root)}, api),
             "Original preview execution parameters differ", "REQUEST_CONFLICT")
    return intent


def prepare(workspace, request, api):
    ident = request["request_id"]
    api.need(type(ident) is str and api.REQUEST_ID.fullmatch(ident), "Original preview request_id required")
    normalized = {**request, "workspace": str(workspace.root)}
    root = _directories(workspace, api)
    intent_path = root / "intents" / (ident + ".json")
    if intent_path.exists():
        prior = _intent(root, ident, api)
        api.need(prior.get("parameters_sha256") == _hash(normalized, api), "Same preview ID has different parameters", "REQUEST_CONFLICT")
        api.need(False, "Original preview intent already exists; query image_result request_id=" + ident + "; never redispatch it", "PREVIEW_ORIGINAL_ONLY")
    binding, resource = _binding(workspace, request["object_id"], api)
    lock = root / "locks" / resource
    try:
        lock.mkdir()
    except FileExistsError:
        api.need(False, "Preview admission is busy or interrupted; read original results, do not replace the lock", "PREVIEW_ADMISSION_BUSY")
    try:
        claim_path = root / "resources" / (resource + ".json")
        anchor_path = root / "resources" / (resource + ".anchor.json")
        api.need(claim_path.exists() == anchor_path.exists(), "Preview resource claim/anchor is missing; do not rebuild it from absence", "PREVIEW_ADMISSION_CORRUPT")
        if anchor_path.exists():
            anchor = _read(anchor_path, api)
            api.need(anchor.get("resource_key") == resource and anchor.get("binding") == binding,
                     "Preview resource anchor differs from immutable input", "PREVIEW_ADMISSION_CORRUPT")
        if claim_path.exists():
            claim = _read(claim_path, api)
            owner = claim["request_id"]
            api.need(type(owner) is str and api.REQUEST_ID.fullmatch(owner), "Invalid preview claim owner", "PREVIEW_ADMISSION_CORRUPT")
            old_intent = _intent(root, owner, api)
            api.need(claim.get("resource_key") == resource == old_intent["resource_key"], "Preview claim and original intent resource differ", "PREVIEW_ADMISSION_CORRUPT")
            terminal = _terminal(workspace, owner, api)
            acknowledged = False
            marker = root / "acknowledged" / (owner + ".json")
            if marker.exists() and terminal:
                proof = _read(marker, api)
                _acknowledgement_marker(workspace, owner, proof, api)
                api.need(proof.get("preview_request_id") == owner and proof.get("resource_key") == resource and proof.get("journal_sha256") == api.sha_file(workspace.root / "requests" / (owner + ".json")), "Preview acknowledgement no longer binds original journal", "PREVIEW_ADMISSION_CORRUPT")
                acknowledged = proof.get("object_id") == terminal[1] and proof.get("original_state") == terminal[0]
            if terminal:
                declared = request.get("resolved_preview")
                explicit = type(declared) is dict and declared.get("request_id") == owner
                acknowledged = acknowledged or (terminal[0] == "completed" and
                                (_references(workspace, request["object_id"], terminal[1], api) or
                                 explicit and declared.get("object_id") == terminal[1])) or terminal[0] == "failed" and explicit
            api.need(old_intent.get("state") == "not_submitted" or acknowledged,
                     "PREVIEW_OUTCOME_UNRESOLVED: original request_id=" + owner +
                     ("; saved object_id=" + terminal[1] if terminal and terminal[1] else "") +
                     "; original_provider_state=" + (terminal[0] if terminal else "unknown") + "; read the original outcome. A new ID, Panel or display size is not recovery. Continue only by explicitly referencing the resolved original result.",
                     "PREVIEW_OUTCOME_UNRESOLVED")
        # Reserve the SAME original request namespace before publishing a ticket.
        # Scientific writes and acknowledgement writes cannot race this ID.
        scientific = {key:value for key,value in normalized.items() if key != "resolved_preview"}
        reservation = {"schema_version":1,"request_id":ident,"state":"preview_reserved","parameters":scientific,
                       "parameters_sha256":_hash(scientific,api),"preview_admission_version":VERSION}
        try:
            _write(workspace.root / "requests" / (ident + ".json"),reservation,api,exclusive=True)
        except FileExistsError:
            api.need(False,"Original request ID is already reserved; recover it without dispatch","REQUEST_CONFLICT")
        # A rejected global-ID race must not strand an unused resource anchor.
        # The resource lock still excludes other preview reservations here.
        if not anchor_path.exists():
            _write(anchor_path, {"version":VERSION,"resource_key":resource,"binding":binding}, api, exclusive=True)
        ticket = secrets.token_hex(32)
        record = {"version": VERSION, "request_id": ident, "state": "reserved", "resource_key": resource,
                  "binding": binding, "parameters_sha256": _hash(normalized, api),
                  "ticket_sha256": hashlib.sha256(ticket.encode()).hexdigest()}
        try:
            _write(intent_path, record, api, exclusive=True)
        except FileExistsError:
            api.need(False, "Original preview intent already reserved; query original ID", "PREVIEW_ORIGINAL_ONLY")
        _write(claim_path, {"version": VERSION, "request_id": ident, "resource_key": resource}, api)
        return {"protocol": "preview-admission-v1", "phase": "reserved", "request_id": ident, "ticket": ticket}
    finally:
        lock.rmdir()


def dispatch(workspace, request, ticket, api, abort=False):
    root = _directories(workspace, api)
    path = root / "intents" / (request["request_id"] + ".json")
    intent = _intent(root, request["request_id"], api)
    api.need(type(ticket) is str and hashlib.sha256(ticket.encode()).hexdigest() == intent.get("ticket_sha256"),
             "Invalid original preview dispatch ticket", "PREVIEW_ORIGINAL_ONLY")
    api.need(intent["parameters_sha256"] == _hash({**request, "workspace": str(workspace.root)}, api),
             "Preview dispatch parameters differ from reservation", "REQUEST_CONFLICT")
    binding, resource = _binding(workspace, request["object_id"], api)
    api.need(resource == intent["resource_key"] and binding == intent["binding"], "Preview resource changed", "PREVIEW_ADMISSION_CORRUPT")
    claim = _read(root / "resources" / (resource + ".json"), api)
    api.need(claim["request_id"] == request["request_id"], "Preview claim belongs to another request", "PREVIEW_ORIGINAL_ONLY")
    fence = root / "intents" / (request["request_id"] + ".dispatch")
    try:
        _write(fence, {"version": VERSION, "request_id": request["request_id"], "state": "not_submitted" if abort else "dispatched"}, api, exclusive=True)
    except FileExistsError:
        api.need(False, "Original preview dispatch has already been fenced; query original request", "PREVIEW_ORIGINAL_ONLY")
    intent["state"] = "not_submitted" if abort else "dispatched"
    if abort:
        journal_path=workspace.root / "requests" / (request["request_id"] + ".json")
        journal=api.read_json(journal_path)
        api.need(journal.get("state")=="preview_reserved", "Preview is already beyond reservation", "PREVIEW_ORIGINAL_ONLY")
        journal.update(state="not_submitted",response={"ok":False,"backend":api.BACKEND,"state":"not_submitted","request_id":request["request_id"],"automatic_retry":False,
                       "error":{"code":"PREVIEW_NOT_SUBMITTED","message":"Original preview was positively aborted before dispatch; it will not replay"}})
        _write(journal_path,journal,api)
    _write(path, intent, api)
    return {"protocol": "preview-admission-v1", "phase": intent["state"], "request_id": request["request_id"]}


def _acknowledgement_marker(workspace, original, proof, api):
    ack_id = proof.get("ack_request_id")
    api.need(type(ack_id) is str and api.REQUEST_ID.fullmatch(ack_id), "Missing original acknowledgement identity", "PREVIEW_ADMISSION_CORRUPT")
    acknowledgement = api.read_json(workspace.root / "requests" / (ack_id + ".json"))
    parameters = acknowledgement.get("parameters", {})
    api.need(acknowledgement.get("request_id") == ack_id and parameters.get("action") == "preview_acknowledge" and
             parameters.get("preview_request_id") == original and parameters.get("object_id") == proof.get("object_id") and
             acknowledgement.get("parameters_sha256") == _hash(parameters, api),
             "Acknowledgement marker has no matching original prepared request", "PREVIEW_ADMISSION_CORRUPT")


def acknowledge(workspace, request, api):
    root = _directories(workspace, api)
    ident, original = request.get("request_id"), request.get("preview_request_id")
    api.need(type(ident) is str and api.REQUEST_ID.fullmatch(ident) and type(original) is str and api.REQUEST_ID.fullmatch(original), "Original preview and acknowledgement request IDs required")
    # The same authoritative request namespace reserves this ID before any marker
    # can be published. No separate check-then-write acknowledgement namespace.
    parent = api.read_json(workspace.root / "requests" / (ident + ".json"))
    api.need(parent.get("state") == "prepared" and parent.get("parameters") == {**request, "workspace": str(workspace.root)},
             "Acknowledgement has no original prepared request", "REQUEST_CONFLICT")
    intent = _intent(root, original, api)
    terminal = _terminal(workspace, original, api)
    api.need(terminal is not None, "Unknown preview cannot be acknowledged; query its original result", "PREVIEW_OUTCOME_UNRESOLVED")
    api.need((terminal[0] == "completed" and request.get("object_id") == terminal[1]) or
             (terminal[0] == "failed" and request.get("object_id") is None), "Acknowledgement requires the exact original completed object (or confirmed failed original)", "INVALID_PREVIEW_REFERENCE")
    proof = {"version": VERSION, "preview_request_id": original, "resource_key": intent["resource_key"],
             "object_id": terminal[1], "original_state": terminal[0], "ack_request_id": ident,
             "journal_sha256": api.sha_file(workspace.root / "requests" / (original + ".json"))}
    marker = root / "acknowledged" / (original + ".json")
    try:
        _write(marker, proof, api, exclusive=True)
    except FileExistsError:
        previous = _read(marker, api)
        _acknowledgement_marker(workspace, original, previous, api)
        api.need({k:v for k,v in previous.items() if k != "ack_request_id"} == {k:v for k,v in proof.items() if k != "ack_request_id"},
                 "Acknowledgement proof conflicts with original outcome", "PREVIEW_ADMISSION_CORRUPT")
    return {"ok": True, "backend": api.BACKEND, "state": "completed", "kind": "preview_acknowledgement",
            "request_id": ident, "preview_request_id": original, "original_state": terminal[0],
            "original_object_id": terminal[1], "operational_receipt": True, "scientific_object_created": False}


def outcome(workspace, ident, api):
    path = workspace.root / "preview-admission-v1" / "intents" / (ident + ".json")
    if not path.exists():
        return None
    try:
        record = _intent(workspace.root / "preview-admission-v1", ident, api)
    except (ValueError, OSError):
        record = {"state": "unreadable"}
    return {"ok": False, "state": "not_submitted" if record["state"] == "not_submitted" else "unknown",
            "backend": api.BACKEND, "request_id": ident, "automatic_retry": False,
            "error": {"code": "PREVIEW_NOT_SUBMITTED" if record["state"] == "not_submitted" else "INCOMPLETE_PREVIEW_INTENT",
                      "message": "Original preview admission is " + record["state"] + "; original journal not found; preserved without replay"}}
