"""Append-only derived source receipts. Provider objects/journals stay authoritative.

This module performs no numerical operation and never modifies an old record.
Hashes bind bytes; they are not signatures and do not waive payload verification.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import time

POLICY = "source-proof-v1"
FIELDS = {"source_proof": {"object_id", "purpose", "input_relative_path", "input_sha256", "parent_proof_id"},
          "source_proof_info": {"proof_object_id", "expected_sha256"},
          "source_proof_revoke": {"proof_object_id", "reason"}}
VALIDATOR_FILES = ("image_source_proof.py", "image_workspace.py", "image_calibration.py",
                   "image_annotation_updates.py", "result_semantics.py")
MAX_OBJECTS, MAX_METADATA, MAX_REQUESTS = 2048, 64 * 1024 * 1024, 8192
MAX_PAYLOAD = 256 * 1024 * 1024
MAX_SECONDS = 110
KINDS = {"tiff_source", "dm_source", "frame", "view", "fft", "fft_view", "annotate", "context", "calibration", "measure"}
LINKS = ("parent_object_id", "base_object_id", "source_object_id", "render_base_object_id", "spectrum_object_id")
HASH = re.compile(r"[a-f0-9]{64}\Z")
INPUT_PATH = re.compile(r"panel-journals/[A-Za-z0-9_-]{1,128}/(panel-[a-f0-9]{32}-[1-9][0-9]{0,15})\.input\.json\Z")


def validator_identity(api):
    files = {"tools/" + name: api.sha_file(Path(__file__).with_name(name)) for name in VALIDATOR_FILES}
    digest = hashlib.sha256("".join(name + "\0" + files[name] + "\n" for name in sorted(files)).encode("utf-8")).hexdigest()
    return files, digest


class Reads:
    def __init__(self, workspace, api):
        self.ws, self.api = workspace, api
        self.cache, self.files, self.ids = {}, {}, set()
        self.active_proofs, self.used_proof_ids = set(), set()
        self.bytes, self.calls, self.payload_bytes, self.started = 0, 0, 0, time.monotonic()
        # Existing operand semantics, with every lookup accounted for in this
        # one request's reader rather than a second unbounded read path.
        self.operands = type("ProofOperands", (), {
            "object": lambda _self, ident: (self.object(ident)["value"], self.ws.root / "objects" / ident),
            "resolved": api.Workspace.resolved, "measurement_operand": api.Workspace.measurement_operand,
            "measurement_grid": api.Workspace.measurement_grid})()

    def need(self, condition, message, code="SOURCE_PROOF_UNAVAILABLE"):
        self.api.need(condition, message, code)

    def tick(self):
        self.need(time.monotonic() - self.started <= MAX_SECONDS, "Source proof verification time budget exceeded", "BUDGET_EXCEEDED")

    def ordinary(self, file):
        file = Path(file)
        try:
            relative = file.relative_to(self.ws.root)
        except ValueError:
            self.need(False, "Proof path escapes the existing workspace")
        self.need(relative.parts and all(part not in ("..", ".") for part in relative.parts), "Unsafe proof path")
        current = self.ws.root
        for part in relative.parts:
            current = current / part
            self.need(not current.is_symlink(), "Linked proof path is unsupported")
        self.need(file.is_file() and file.resolve().is_relative_to(self.ws.root), "Proof record is missing or not ordinary")
        return file

    def raw(self, file):
        self.tick()
        file = self.ordinary(file)
        self.need(file.stat().st_size <= self.api.MAX_JSON_BYTES, "Proof metadata exceeds single-file bound", "BUDGET_EXCEEDED")
        raw = file.read_bytes()
        self.bytes += len(raw)
        self.need(len(raw) <= self.api.MAX_JSON_BYTES and self.bytes <= MAX_METADATA, "Source proof metadata budget exceeded", "BUDGET_EXCEEDED")
        return raw

    def json(self, file):
        raw = self.raw(file)
        value = self.api.strict_json(raw.decode("utf-8"))
        self.need(type(value) is dict, "Proof metadata must be a JSON object")
        return value, hashlib.sha256(raw).hexdigest()

    def object(self, ident, fresh=False):
        self.need(type(ident) is str and self.api.OBJECT_ID.fullmatch(ident), "Exact proof dependency ID required")
        if not fresh and ident in self.cache:
            return self.cache[ident]
        self.ids.add(ident)
        self.need(len(self.ids) <= MAX_OBJECTS, "Source proof object budget exceeded", "BUDGET_EXCEEDED")
        directory = self.ws.root / "objects" / ident
        self.need(directory.is_dir() and not directory.is_symlink(), "Proof dependency directory is missing or linked")
        value, manifest = self.json(directory / "object.json")
        creator = value.get("request_id")
        self.need(type(creator) is str and self.api.REQUEST_ID.fullmatch(creator), "Proof dependency creator is missing")
        journal, creator_hash = self.json(self.ws.root / "requests" / (creator + ".json"))
        parameters = journal.get("parameters")
        self.need(type(parameters) is dict and parameters.get("request_id") == creator and
                  parameters.get("workspace") == str(self.ws.root) and
                  journal.get("parameters_sha256") == hashlib.sha256(self.api.canonical(parameters)).hexdigest(),
                  "Proof dependency original request parameters changed")
        files = value.get("files_sha256", {})
        self.need(type(files) is dict, "Invalid dependency payload manifest")
        for name, digest in files.items():
            self.need(type(name) is str and Path(name).name == name and name not in (".", "..", "object.json") and
                      type(digest) is str and HASH.fullmatch(digest), "Unsafe proof dependency payload")
            file = self.ordinary(directory / name)
            size = file.stat().st_size
            limit = self.api.MAX_ARRAY_BYTES + 65536 if name.endswith(".npy") else self.api.MAX_JSON_BYTES
            self.need(size <= limit, "Proof payload exceeds existing single-file bound", "BUDGET_EXCEEDED")
            self.payload_bytes += size
            self.need(self.payload_bytes <= MAX_PAYLOAD, "Proof payload verification exceeds aggregate budget", "BUDGET_EXCEEDED")
            if name.endswith(".png"):
                with file.open("rb") as source:
                    self.need(source.read(8) == b"\x89PNG\r\n\x1a\n", "Proof dependency PNG signature is invalid")
        # This remains the original provider semantic/payload validation, not a
        # substitute based on copied digests. Its per-call cache never persists.
        # Workspace.object reopens these same own records; count that I/O too.
        self.bytes += (directory / "object.json").stat().st_size + (self.ws.root / "requests" / (creator + ".json")).stat().st_size
        self.need(self.bytes <= MAX_METADATA, "Source proof metadata budget exceeded", "BUDGET_EXCEEDED")
        actual, _ = self.ws.object(ident)
        self.need(actual == value, "Proof dependency changed during original provider qualification")
        if "data.npy" in files:
            array = self.api.load_array(directory / "data.npy", allow_complex=True)
            self.need(value.get("shape_yx") == list(array.shape) and value.get("dtype") == str(array.dtype),
                      "Proof scientific array shape or dtype differs from its manifest")
        result = {"value": value, "parameters": parameters, "manifest_sha256": manifest,
                  "creator_journal_sha256": creator_hash}
        self.calls += 1
        if fresh and ident in self.cache:
            self.need(result == self.cache[ident], "Proof dependency changed during final fresh verification")
        self.cache[ident] = result
        return result

    def remember_file(self, file):
        value, digest = self.json(file)
        key = str(file)
        if key in self.files:
            self.need(self.files[key] == digest, "Frozen source input record changed")
        self.files[key] = digest
        return value, digest

    def verify(self):
        for ident in list(self.cache):
            self.object(ident, fresh=True)
        for file, expected in list(self.files.items()):
            _, digest = self.json(file)
            self.need(digest == expected, "Frozen proof input changed during final verification")


def dependency(saved):
    value = saved["value"]
    return {"object_id": value["object_id"], "kind": value["kind"], "manifest_sha256": saved["manifest_sha256"],
            "creator_journal_sha256": saved["creator_journal_sha256"], "files_sha256": copy.deepcopy(value.get("files_sha256", {}))}


def graph(reads, root):
    colors, edges, found = {}, [], {}
    # Iterative DFS avoids making a longer source chain a Python stack limit.
    stack = [(root, False)]
    while stack:
        ident, leaving = stack.pop()
        if leaving:
            colors[ident] = 2
            continue
        reads.need(colors.get(ident) != 1, "Scientific dependency cycle")
        if colors.get(ident) == 2:
            continue
        saved = reads.object(ident)
        value = saved["value"]
        reads.need(value.get("kind") in KINDS, "Proof v1 requires a supported single-frame image object")
        found[ident], colors[ident] = saved, 1
        stack.append((ident, True))
        links = []
        for key in LINKS:
            target = value.get(key)
            if target is not None:
                reads.need(type(target) is str and reads.api.OBJECT_ID.fullmatch(target), "Invalid scientific dependency reference")
                reads.need(target != ident, "Scientific dependency self-cycle")
                links.append((key, target))
        for target in value.get("object_ids", []):
            links.append(("object_ids", target))
        record = value.get("xy_calibration")
        if record is not None:
            reads.need(type(record) is dict, "Invalid signed calibration record")
            target = record.get("calibration_id")
            if target and target != ident:
                links.append(("xy_calibration.calibration_id", target))
        for relation, target in reversed(links):
            edges.append({"from": ident, "to": target, "relation": relation})
            stack.append((target, False))
    return found, sorted(edges, key=lambda edge: (edge["from"], edge["relation"], edge["to"]))


def frame_path(reads, root):
    seen = set()
    while True:
        reads.need(root not in seen, "Frame-path cycle")
        seen.add(root)
        value = reads.object(root)["value"]
        if value["kind"] == "frame":
            return value
        reads.need(value["kind"] not in ("tiff_source", "dm_source", "compare"), "Frame path has no exact selected frame")
        target = next((value[key] for key in ("parent_object_id", "base_object_id", "source_object_id") if value.get(key) is not None), None)
        reads.need(target is not None, "Frame path is unavailable")
        root = target


def qualified_operand(reads, ident):
    """Keep the shared Node operand's total 32-wrapper obligation explicit.

    Python's original resolver has separate nested context/annotation loops;
    this proof contract uses their shared total before calling that resolver.
    """
    current, seen = ident, set()
    value = reads.object(current)["value"]
    while value["kind"] in ("calibration", "context", "measure", "annotate"):
        reads.need(current not in seen and len(seen) < 32, "Scientific operand ancestry is cyclic or exceeds budget")
        seen.add(current)
        key = "render_base_object_id" if value["kind"] == "annotate" else "parent_object_id" if value["kind"] == "measure" else "base_object_id"
        current = value.get(key)
        value = reads.object(current)["value"]
    return reads.operands.measurement_operand(ident)


def outward_support(coordinates):
    # Exact existing GUI/CLI outwardSourceRectangle policy, including its
    # numerical edge tolerance. No rounding of the stored original float ROI.
    return [math.floor(coordinates[0] + 1e-9), math.floor(coordinates[1] + 1e-9),
            math.ceil(coordinates[2] - 1e-9), math.ceil(coordinates[3] - 1e-9)]


class NumberLexeme(str):
    pass


def panel_tokens(raw, reads):
    # Existing sidecars are emitted by JSON.stringify. Preserve their original
    # JS numeric tokens instead of re-encoding IEEE754 via Python repr.
    def pairs(rows):
        result = {}
        for key, value in rows:
            reads.need(key not in result and re.fullmatch(r"[a-z][a-z0-9_]*", key), "Unsupported or duplicated sidecar key")
            result[key] = value
        return result
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_int=NumberLexeme,
                       parse_float=NumberLexeme, parse_constant=lambda _: reads.need(False, "Nonfinite original sidecar"))
    return value


def encode_panel_tokens(item, reads):
    if isinstance(item, NumberLexeme):
        value = float(item)
        reads.need(math.isfinite(value), "Nonfinite original sidecar number")
        reads.need(item != "-0" and not ("." in item and item.split("e")[0].endswith("0")), "Noncanonical original JS number token")
        if "e" in item:
            reads.need(re.fullmatch(r"-?[1-9](?:\.\d*[1-9])?e(?:\+[1-9]\d*|-[1-9]\d*)", item) and
                       (abs(value) >= 1e21 or 0 < abs(value) < 1e-6), "Noncanonical original JS exponent token")
        else:
            reads.need(value == 0 or 1e-6 <= abs(value) < 1e21, "Noncanonical original JS decimal token")
        return str(item)
    if type(item) is dict:
        # The existing JS localeCompare order for this restricted lowercase
        # ASCII vocabulary puts underscore before digits, then letters. Plain
        # Python sort instead puts digits before underscore.
        keys = sorted(item, key=lambda key: key.replace("_", "\0"))
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + encode_panel_tokens(item[k], reads) for k in keys) + "}"
    if type(item) is list:
        return "[" + ",".join(encode_panel_tokens(v, reads) for v in item) + "]"
    return json.dumps(item, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

def panel_canonical(raw, reads):
    value = panel_tokens(raw, reads)
    reads.need(type(value) is dict and "request_id" in value, "Original sidecar request is missing")
    del value["request_id"]
    return encode_panel_tokens(value, reads).encode("utf-8")


def input_binding(reads, request, fft, found):
    relative, expected = request.get("input_relative_path"), request.get("input_sha256")
    match = INPUT_PATH.fullmatch(relative) if type(relative) is str else None
    reads.need(match and type(expected) is str and HASH.fullmatch(expected), "FFT proof requires exact original sidecar path and hash")
    file = reads.ws.root.joinpath(*relative.split("/"))
    record, digest = reads.remember_file(file)
    raw = reads.raw(file)
    reads.need(digest == expected == hashlib.sha256(raw).hexdigest(), "Original sidecar hash differs")
    request_id = record.get("request_id")
    identity = "panel-" + hashlib.sha256(panel_canonical(raw, reads)).hexdigest()[:32] + "-" + str(record.get("sequence"))
    reads.need(type(record.get("schema_version")) is int and record["schema_version"] == 1 and record.get("kind") == "gui_fft_input_v1" and
               type(record.get("session_nonce")) is str and HASH.fullmatch(record["session_nonce"]) and
               type(record.get("sequence")) is int and 0 < record["sequence"] <= 9007199254740991 and
               request_id == identity == match.group(1), "Original sidecar request ID does not bind its exact frozen input")
    frozen = record.get("input_snapshot")
    reads.need(type(frozen) is dict and type(frozen.get("schema_version")) is int and frozen["schema_version"] == 1, "Original frozen FFT input is missing")
    parameters = record.get("parameters")
    panel_request, _ = reads.remember_file(file.with_name(request_id + ".request.json"))
    reads.need(type(parameters) is dict and panel_request == {"name": "image_fft", "arguments": {**parameters, "request_id": request_id}},
               "Original Panel request differs from its exact sidecar")
    reads.need(fft["value"].get("kind") == "fft" and fft["value"].get("request_id") == request_id and
               fft["parameters"] == {**parameters, "workspace": str(reads.ws.root), "action": "fft", "request_id": request_id},
               "Raw FFT does not belong to the original exact provider request")
    source_id, operand_id, frame_id = (frozen.get(k) for k in ("source_view_object_id", "provider_input_object_id", "frame_object_id"))
    source, operand, frame = reads.object(source_id), reads.object(operand_id), reads.object(frame_id)
    source_graph, source_edges = graph(reads, source_id)
    reads.need(fft["value"]["object_id"] not in source_graph, "Original sidecar source creates a scientific evidence cycle")
    reads.need(all(ident in found for ident in (operand_id, frame_id)) and frame["value"]["kind"] == "frame",
               "Actual operand and frame do not belong to this FFT dependency graph")
    found.update(source_graph)
    coords, support = frozen.get("float_roi_xyxy"), frozen.get("processing_rect_xyxy")
    reads.need(type(coords) is list and len(coords) == 4 and all(reads.api.number(v) for v in coords) and
               0 <= coords[0] < coords[2] and 0 <= coords[1] < coords[3], "Exact original float ROI is invalid")
    reads.need(support == outward_support(coords) and
               type(support) is list and all(type(v) is int for v in support), "Original float ROI and actual support differ")
    panels = source["value"].get("panels", [])
    reads.need(len(panels) == 1 and panels[0].get("domain") == "spatial_pixels" and panels[0].get("source_object_id") == frame_id,
               "Original source view is not one exact spatial frame")
    bounds = panels[0].get("source_rect_xyxy")
    reads.need(type(bounds) is list and len(bounds) == 4 and bounds[0] <= coords[0] < coords[2] <= bounds[2] and
               bounds[1] <= coords[1] < coords[3] <= bounds[3], "Original float ROI lies outside its actual source view")
    annotation = frozen.get("annotation_id")
    reads.need(annotation is None or type(annotation) is str and reads.api.REQUEST_ID.fullmatch(annotation), "Invalid original ROI annotation identity")
    if annotation is not None:
        mark = next((v for v in source["value"].get("annotations", []) if v.get("annotation_id") == annotation), None)
        reads.need(mark and mark.get("kind") == "rectangle" and mark.get("status") != "retracted" and
                   mark.get("anchor", {}).get("coordinates") == coords and mark["anchor"].get("source_object_id") == frame_id and
                   mark["anchor"].get("coordinate_space") == "source_pixels", "Original saved ROI identity or float geometry differs")
    recipe = frozen.get("recipe")
    reads.need(type(recipe) is dict and set(recipe) == {"window", "subtract_mean"} and recipe["window"] in ("none", "hann") and
               type(recipe["subtract_mean"]) is bool and parameters.get("object_id") == operand_id and parameters.get("rect") == support and
               parameters.get("window") == recipe["window"] and parameters.get("subtract_mean") == recipe["subtract_mean"] and
               fft["value"].get("source_rect_xyxy") == support and fft["value"].get("window") == recipe["window"] and
               fft["value"].get("subtract_mean") == recipe["subtract_mean"], "Original FFT recipe or processing support differs")
    calibration = frozen.get("calibration_snapshot")
    actual, _, _ = qualified_operand(reads, operand_id)
    reads.need(calibration == actual.get("xy_calibration") == source["value"].get("xy_calibration") == fft["value"].get("xy_calibration"),
               "Original signed calibration snapshot differs from actual operands")
    reads.need(frame_path(reads, source_id)["object_id"] == frame_id == frame_path(reads, operand_id)["object_id"],
               "Original sidecar selected a different source frame")
    qualification = record.get("qualification")
    reads.need(qualification in ("validated", "unavailable"), "Unknown original sidecar qualification")
    if qualification == "validated":
        hashes = {"source_view_manifest_sha256": source["manifest_sha256"], "provider_input_manifest_sha256": operand["manifest_sha256"],
                  "frame_manifest_sha256": frame["manifest_sha256"], "frame_array_sha256": frame["value"].get("files_sha256", {}).get("data.npy")}
        reads.need(all(frozen.get(k) == v for k, v in hashes.items()), "Original pre-execution provider hashes changed")
        # Calibration token spelling is preserved from its original sidecar.
        lexical = panel_tokens(raw, reads)
        cal_raw = encode_panel_tokens(lexical["input_snapshot"]["calibration_snapshot"], reads)
        reads.need(frozen.get("calibration_sha256") == hashlib.sha256(cal_raw.encode("utf-8")).hexdigest(), "Original calibration hash changed")
    response_file = file.with_name(request_id + ".response.json")
    if response_file.exists():
        response, _ = reads.remember_file(response_file)
        reads.need(response.get("request_id") == request_id and response.get("object_id") == fft["value"]["object_id"], "Original Panel result differs")
    binding = {"input_relative_path": relative, "input_sha256": digest, "request_id": request_id,
            "annotation_id": annotation, "source_view_object_id": source_id, "provider_input_object_id": operand_id,
            "frame_object_id": frame_id, "float_roi_xyxy": coords, "processing_rect_xyxy": support, "recipe": recipe,
            "calibration_snapshot": calibration, "original_qualification": qualification}
    if "source_proof_refs" in record:
        references = record["source_proof_refs"]
        reads.need(type(references) is list and 0 < len(references) <= 256, "Invalid original source proof references")
        for reference in references:
            reads.need(type(reference) is dict and set(reference) == {"kind", "object_id", "manifest_sha256"} and
                       reference.get("kind") == "source_proof_reference_v1", "Invalid original source proof reference")
            saved, proof_ids = validate_proof(reads, reference["object_id"])
            previous = saved["value"]["proof"]
            reads.need(saved["manifest_sha256"] == reference["manifest_sha256"] and previous["purpose"] == "saved_source" and
                       previous["basis"] == "current" and previous["frame_identity"]["frame_object_id"] == frame_id and
                       any(item["object_id"] == source_id and item["manifest_sha256"] == source["manifest_sha256"] for item in previous["dependencies"]),
                       "Original source proof does not cover this exact saved spatial input")
            reads.used_proof_ids.update(proof_ids)
        binding["source_proof_refs"] = references
    return binding, source_edges + [{"from": fft["value"]["object_id"], "to": source_id, "relation": "input_binding.source_view_object_id"}]


def derive(reads, request):
    root, purpose = request.get("object_id"), request.get("purpose")
    reads.need(purpose in ("saved_source", "fft_input"), "Explicit supported proof purpose required")
    found, edges = graph(reads, root)
    if purpose == "fft_input":
        binding, source_edges = input_binding(reads, request, found[root], found)
        by_edge = {(edge["from"], edge["relation"], edge["to"]): edge for edge in edges + source_edges}
        edges = [by_edge[key] for key in sorted(by_edge)]
        qualification = binding["original_qualification"]
        basis = "original_pre_execution" if qualification == "validated" else "retrospective"
    frames = [saved["value"] for saved in found.values() if saved["value"]["kind"] == "frame"]
    reads.need(len(frames) == 1, "Complete scientific DAG must contain exactly one selected frame")
    frame = frame_path(reads, root)
    reads.need(frame["object_id"] == frames[0]["object_id"], "Frame path and complete scientific DAG disagree")
    reads.need(type(frame.get("frame_index")) is int and 0 <= frame["frame_index"] <= 9007199254740991,
               "Proof needs the provider's explicit selected frame index; no default is invented")
    reads.need(frame.get("source_object_id") is None or type(frame["source_object_id"]) is str and reads.api.OBJECT_ID.fullmatch(frame["source_object_id"]),
               "Invalid selected frame source identity")
    operand, _, _ = qualified_operand(reads, root)
    reads.need(operand["kind"] in ("frame", "view", "fft", "fft_view"), "Proof root has no exact scalar scientific operand")
    grid = reads.operands.measurement_grid(root)
    if purpose == "saved_source":
        reads.need(grid["coordinate_space"] == "source_pixels" and operand["kind"] in ("frame", "view"), "saved_source needs a spatial scientific image")
        reads.need("input_relative_path" not in request and "input_sha256" not in request, "saved_source does not accept an FFT sidecar")
        binding, basis, qualification = None, "current", None
    identity = {"frame_object_id": frame["object_id"], "source_object_id": frame.get("source_object_id"), "frame_index": frame["frame_index"]}
    if "dm_dataset_index" in frame:
        identity["dataset_index"] = frame["dm_dataset_index"]
    if "dm_plane_selection" in frame:
        identity["plane_selection"] = frame["dm_plane_selection"]
    files, validator_hash = validator_identity(reads.api)
    return {"schema_version": 1, "policy_version": POLICY, "validator_files": files, "validator_sources_sha256": validator_hash,
            "purpose": purpose, "basis": basis, "original_qualification": qualification,
            "root": {k: v for k, v in dependency(found[root]).items() if k in ("object_id", "manifest_sha256", "creator_journal_sha256")},
            "frame_identity": identity, "scientific_grid_identity": grid, "calibration_snapshot": operand.get("xy_calibration"),
            "dependencies": [dependency(found[key]) for key in sorted(found)], "edges": edges,
            "parent_proof": None, "input_binding": binding}


def status_snapshot(reads, proof_ids):
    """Complete bounded status discovery, never a mutable revocation registry."""
    requests = reads.ws.root / "requests"
    files = sorted(requests.iterdir(), key=lambda p: p.name)
    reads.need(len(files) <= MAX_REQUESTS, "Proof status request listing exceeds budget", "BUDGET_EXCEEDED")
    statuses, revoked, completed_events = {}, set(), set()
    for file in files:
        reads.need(file.name.endswith(".json") and reads.api.REQUEST_ID.fullmatch(file.stem), "Unknown provider status entry")
        value, digest = reads.json(file)
        parameters = value.get("parameters")
        reads.need(type(parameters) is dict, "Provider status journal is incomplete")
        if parameters.get("action") != "source_proof_revoke" and value.get("response", {}).get("kind") != "source_proof_revocation":
            continue
        reads.need(parameters.get("action") == "source_proof_revoke" and value.get("request_id") == file.stem and
                   parameters.get("request_id") == file.stem and parameters.get("workspace") == str(reads.ws.root) and
                   value.get("parameters_sha256") == hashlib.sha256(reads.api.canonical(parameters)).hexdigest(),
                   "Proof withdrawal original request identity changed")
        target = parameters.get("proof_object_id")
        statuses[file.name] = digest
        if target in proof_ids:
            reads.need(value.get("state") in ("completed", "failed", "not_submitted"), "Proof withdrawal request remains unresolved")
        if value["state"] != "completed":
            continue
        event = reads.object(value.get("response", {}).get("object_id"))["value"]
        check_revocation(reads, event)
        completed_events.add(event["object_id"])
        if target in proof_ids:
            revoked.add(target)
    objects = sorted((reads.ws.root / "objects").iterdir(), key=lambda p: p.name)
    reads.need(len(objects) <= MAX_OBJECTS, "Proof withdrawal object listing exceeds budget", "BUDGET_EXCEEDED")
    for directory in objects:
        reads.need(directory.is_dir() and not directory.is_symlink() and reads.api.OBJECT_ID.fullmatch(directory.name), "Invalid provider object status entry")
        file = directory / "object.json"
        if not file.exists():
            # Existing provider publication creates the directory before the
            # manifest. An admitted withdrawal is covered by its journal above.
            continue
        value, _ = reads.json(file)
        if value.get("kind") == "source_proof_revocation":
            reads.need(directory.name in completed_events, "Uncommitted or hidden source proof withdrawal")
            check_revocation(reads, reads.object(directory.name)["value"])
    return statuses, revoked


def check_revocation(reads, value):
    event = value.get("revocation")
    reads.need(value.get("kind") == "source_proof_revocation" and type(event) is dict and event.get("schema_version") == 1 and
               event.get("policy_version") == POLICY, "Unsupported source proof withdrawal")
    target = reads.object(event.get("proof_object_id"))
    reads.need(target["value"].get("kind") == "source_proof" and event.get("proof_manifest_sha256") == target["manifest_sha256"], "Proof withdrawal target differs")
    params = reads.object(value["object_id"])["parameters"]
    reads.need(params.get("action") == "source_proof_revoke" and params.get("proof_object_id") == event["proof_object_id"] and
               params.get("reason") == event.get("reason"), "Proof withdrawal and original request disagree")


def validate_proof(reads, ident, seen=None):
    reads.need(ident not in reads.active_proofs, "Source proof reference cycle")
    reads.active_proofs.add(ident)
    try:
        return _validate_proof(reads, ident, seen)
    finally:
        reads.active_proofs.remove(ident)


def _validate_proof(reads, ident, seen=None):
    seen = set() if seen is None else seen
    reads.need(ident not in seen, "Parent proof cycle")
    seen.add(ident)
    saved = reads.object(ident)
    value, proof = saved["value"], saved["value"].get("proof")
    reads.need(value.get("kind") == "source_proof" and type(proof) is dict and proof.get("schema_version") == 1 and
               proof.get("policy_version") == POLICY and saved["parameters"].get("action") == "source_proof", "Unknown source proof kind or policy")
    files, digest = validator_identity(reads.api)
    reads.need(proof.get("validator_files") == files and proof.get("validator_sources_sha256") == digest, "Source proof validator version is not compatible")
    expected = derive(reads, saved["parameters"])
    parent = proof.get("parent_proof")
    if parent is not None:
        reads.need(type(parent) is dict and saved["parameters"].get("parent_proof_id") == parent.get("object_id"), "Parent proof binding differs")
        previous, previous_ids = validate_proof(reads, parent["object_id"], seen)
        reads.need(previous["manifest_sha256"] == parent.get("manifest_sha256"), "Parent proof manifest changed")
        inherit(reads, expected, previous["value"]["proof"])
        expected["parent_proof"] = parent
        seen.update(previous_ids)
    else:
        reads.need("parent_proof_id" not in saved["parameters"], "Original parent proof reference is missing")
    frozen = {k: v for k, v in proof.items() if k != "budget"}
    reads.need(frozen == expected, "Persisted source proof differs from freshly verified dependencies/input")
    return saved, seen


def inherit(reads, current, parent):
    reads.need(current["purpose"] == parent["purpose"] and current["frame_identity"] == parent["frame_identity"] and
               current["scientific_grid_identity"] == parent["scientific_grid_identity"] and current["calibration_snapshot"] == parent["calibration_snapshot"],
               "Parent proof does not qualify this exact frame, grid and signed calibration")
    reads.need(parent["root"]["object_id"] in {v["object_id"] for v in current["dependencies"]}, "Parent proof root is not an ancestor of this source")
    if current["purpose"] == "fft_input":
        reads.need(current["root"] == parent["root"] and current["input_binding"] == parent["input_binding"], "FFT parent proof input differs")


def action(workspace, action_name, request, metadata, directory, api):
    reads = Reads(workspace, api)
    if action_name == "source_proof_revoke":
        reason = request.get("reason")
        reads.need(type(reason) is str and 1 <= len(reason) <= 2000 and bool(reason.strip()), "A bounded proof withdrawal reason is required")
        target = reads.object(request.get("proof_object_id"))
        reads.need(target["value"].get("kind") == "source_proof", "Withdrawal requires an exact existing source proof")
        event = {"schema_version": 1, "policy_version": POLICY, "proof_object_id": request["proof_object_id"],
                 "proof_manifest_sha256": target["manifest_sha256"], "reason": reason}
        reads.verify()
        return {**metadata, "kind": "source_proof_revocation", "revocation": event}
    proof = derive(reads, request)
    proof_ids = set()
    if "parent_proof_id" in request:
        parent, proof_ids = validate_proof(reads, request["parent_proof_id"])
        inherit(reads, proof, parent["value"]["proof"])
        proof["parent_proof"] = {"object_id": request["parent_proof_id"], "manifest_sha256": parent["manifest_sha256"]}
    proof_ids.update(reads.used_proof_ids)
    before, revoked = status_snapshot(reads, proof_ids)
    reads.need(not revoked, "A parent source proof was withdrawn")
    reads.verify()
    after, revoked = status_snapshot(reads, proof_ids)
    reads.need(before == after and not revoked, "Source proof withdrawal state changed during final verification")
    proof["budget"] = {"objects_read": reads.calls, "metadata_bytes": reads.bytes, "payload_bytes": reads.payload_bytes,
                       "max_objects": MAX_OBJECTS, "max_metadata_bytes": MAX_METADATA, "max_payload_bytes": MAX_PAYLOAD}
    reads.need(len(api.canonical(proof)) <= api.MAX_JSON_BYTES - 32768, "Source proof receipt exceeds existing object metadata limit", "BUDGET_EXCEEDED")
    return {**metadata, "kind": "source_proof", "proof": proof}


def info(workspace, request, api):
    reads = Reads(workspace, api)
    ident = request.get("proof_object_id")
    result = {"ok": True, "state": "completed", "object_id": ident, "schema_version": 1, "backend": api.BACKEND, "status": "unavailable", "proof_object_id": ident,
              "manifest_sha256": None, "eligible_for_exact_scope": False, "eligible_for_strict_reuse": False}
    try:
        saved, proof_ids = validate_proof(reads, ident)
        proof_ids.update(reads.used_proof_ids)
        proof = saved["value"]["proof"]
        if "expected_sha256" in request:
            reads.need(request["expected_sha256"] == saved["manifest_sha256"], "Expected source proof hash differs")
        result.update(manifest_sha256=saved["manifest_sha256"], purpose=proof["purpose"], basis=proof["basis"],
                      original_qualification=proof["original_qualification"], root_object_id=proof["root"]["object_id"],
                      frame_identity=proof["frame_identity"], dependencies=proof["dependencies"], input_binding=proof["input_binding"], proof=proof)
        before, revoked = status_snapshot(reads, proof_ids)
        reads.verify()
        after, latest = status_snapshot(reads, proof_ids)
        reads.need(before == after and revoked == latest, "Proof withdrawal state changed during verification")
        result.update(status="revoked" if revoked else "verified", eligible_for_exact_scope=not revoked,
                      eligible_for_strict_reuse=not revoked and proof["purpose"] == "fft_input" and
                      proof["basis"] == "original_pre_execution" and proof["original_qualification"] == "validated")
    except Exception as error:
        result.update(status="unavailable", reason=str(error), code=getattr(error, "code", "SOURCE_PROOF_UNAVAILABLE"),
                      eligible_for_exact_scope=False, eligible_for_strict_reuse=False)
    return result
