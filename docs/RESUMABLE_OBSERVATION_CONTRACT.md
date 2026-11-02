# Resumable observations: additive contract v1 (#72)

The approved #72 route is an explicit optional intent on the existing annotation,
not a new scientific object, authentication system or physical qualification.
The implementation is based on main `adf8860e852fb3ca447cd3a4c6e6e3e2d7788c19`
(tree `59f8bfe66164ea2c63e56c563f56de8797b2b494`). It does not implement #70.

## Input and saved record

A new observation intended for handoff supplies, in `image_annotate.annotations`:

```json
{
  "annotation_id": "roi-working-1",
  "purpose": "resumable_observation",
  "selection_origin": "agent",
  "kind": "rectangle",
  "status": "hypothesized",
  "coordinate_space": "source_pixels",
  "source_object_id": "<exact frame ID from panels>",
  "coordinates": [8, 8, 40, 40],
  "note": "Inspect this support; its physical explanation remains unknown."
}
```

`annotation_id` is a caller-stable `[A-Za-z0-9_-]{1,64}` identity, independent of
`request_id` and ROI coordinates. New explicit intent requires an explicit
`selection_origin`: `researcher`, `agent` or `unspecified`. Missing identity or
origin is rejected before Python dispatch by the formal MCP input boundary.
Python independently validates the same intent.

Only these new intent records additionally save:

```json
{
  "purpose": "resumable_observation",
  "observation_contract_version": 1,
  "selection_origin": "agent",
  "selection_origin_basis": "caller_reported_not_authenticated"
}
```

The version belongs to this annotation contract, not the containing historical
object's schema. Origin means the caller's declaration for this scientific
selection/revision. It never authenticates a human or model. The GUI reuses its
existing stable-ID generator and explicitly declares `researcher`. Protocol
qualification uses `unspecified` and a `test_operator_protocol_simulation` note.

## Revisions and compatibility

- Sparse updates retain stable identity, intent and unspecified fields. An
  actual anchor or scientific `note` change without an explicitly supplied
  actor produces `selection_origin="unspecified"` in the new revision.
- An explicitly supplied origin declares that revision's actor. Layout/style,
  label text, unchanged note and pure preview reprojection preserve origin.
- Replacement revisions also compare the same stable ID with the immutable
  parent's anchor/note. Omitting intent does not strip an existing intent;
  omitting actor on a scientific change does not borrow the previous actor.
- Explicitly adding intent to an old stable annotation requires an explicit
  origin. Historical objects, original requests, hashes and explanations stay
  untouched. Anonymous display annotations remain legal under the old contract.
- No missing old field is filled in. Old stable ROI handoffs retain their prior
  eligibility rules; anonymous saved rectangles remain unavailable for handoff.
  UI/continuation labels say origin was not recorded, not `researcher`.
- The four fields survive sparse reconstruction, reprojection, Panel
  `originalMark` replacement, current handoff, model display and copied
  continuation text. The latter includes the stable annotation ID and the
  caller-reported origin qualification.

New MCP/GUI writes retain the existing limit of **1000 UTF-16 code units**
(JavaScript string length); 500 supplementary-plane emoji consume 1000 units.
Errors state the field, actual length, limit and `not_submitted`, with no
truncation. GUI input has no browser `maxlength` that could silently cut pasted
text. The full draft survives refusal; leading/trailing whitespace is preserved
and counted, while whitespace-only observations are rejected.

Legacy Python annotation input, read and reprojection still support their
2048-Unicode-codepoint note budget without added intent. A new explicit
resumable note is checked against 1000 UTF-16 units in Python too. A historical
long note is not made short or given new authorship to pass a test.

## Saved is not ready

After GUI observation save, the implementation reads actual Panel state before
clearing the exact submitted draft. It verifies exact object/annotation/source,
anchor, note, contract/origin and calibration dependency. It then publishes the
clean draft state and reads again before reporting current handoff readiness.
New edits during either read invalidate the previous readiness; a changed
current object/calibration or first-read failure preserves the draft. A saved
object with blocked/unknown handoff is reported as saved but not ready, without
replaying its write.

`purpose` is not `usable=true`. Existing `roi_handoff` still determines source,
frame, spatial support, retraction, calibration and interaction eligibility.
Missing calibration permits pixel-domain work. Dirty/active/unknown drafts,
pending results and unresolved operations prevent a ready handoff. Even ready
means only a usable current ROI reference, not a certified lattice or material.

## Validation and scope

Actual commands and original failure evidence are in
[`analysis/issue72-validation/REPORT.md`](../analysis/issue72-validation/REPORT.md).
New independent worker tests cover limits, intent/origin revisions and legacy
reprojection. A bounded formal MCP save/read/reconnect chain also covers actual
Panel replacement, stale presentation, normal helper close/resume and old
frozen-worker records, with source/arrays/manifests/request hashes unchanged.

Browser gestures and model behavior are **NOT_TESTED** in this change. The user
paused GUI qualification; DOM/API-port and protocol tests do not replace it.
No FFT, physical assumptions, scientific threshold or old evidence status changes.
