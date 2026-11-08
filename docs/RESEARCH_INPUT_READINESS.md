# Local visual metadata readiness

`inspectVisualReadiness(snapshotJson, localJson, savedDisplayJson)` is a pure,
synchronous inspection of already available metadata. All three arguments must
be **primitive JSON strings**: up to 65,536, 4,096 and 1,024 UTF-16 code units,
respectively. It is exported from
`ui/image-panel/research-input-readiness.mts` for local callers. This increment
does not add a UI control, HTTP endpoint, host mode or visual sending path.

Objects, boxed strings, accessors and Proxy wrappers are rejected without
examining their properties, descriptors, prototypes, coercion hooks or iterators.
The function never stringifies a caller object. Missing, malformed or oversized
text returns blockers; input exceptions or text are not echoed. Only locally
parsed data is inspected, and numeric arrays are copied by their fixed indexes.
Use already available metadata JSON or serialize a trusted plain DTO at its
owner boundary; do not serialize arbitrary untrusted JavaScript objects to feed
this function. The implementation assumes standard untampered JS intrinsics.

`localJson` decodes to `LocalVisualInputState`, explicitly containing `view_id`, `state_revision`, `draft_revision` and
`settled`. A future UI caller must set `settled: false` while it has unpublished
question/observation/display edits, gestures, pending operations or publication
acknowledgments. Matching revisions do not prove fresh state or a trusted owner.
Missing or mismatched inputs block inspection readiness; the function never
publishes a draft, applies a question or guesses another image.

`snapshotJson` contains the Panel metadata fields inspected by the module.
The public Panel `object` does **not** expose `files_sha256` (see `publicObject`
in `tools/image_panel.mts`). Therefore `savedDisplayJson` must separately encode
exactly `{view_id, png_sha256}` for the intended saved view, using already
available saved-display metadata supplied explicitly by the caller. It is a
declaration, not verified provenance. Missing metadata blocks; another view ID
blocks. The inspector never substitutes `clean_png_sha256`, `render_base_id`,
the current camera or another preview. It does not read `object.files_sha256`.
No reader or endpoint to obtain this reference is added in this increment.

The result projects only view/frame IDs, saved source and display rectangles,
scalar dtype and shape, a declared PNG digest, question binding IDs, four local
revision numbers and fixed blocker codes. It excludes question text, paths,
image/array bytes, arbitrary source/provider metadata, labels and error detail.
The scope is the complete saved spatial view, not the visible camera viewport or
an active selection. A selection needs an explicitly saved view before this
narrow inspection can pass. A question bound to another view, even on the same
frame, is reported separately rather than silently rebound.

`status: "metadata_ready"` means only that these metadata conditions match.
It always returns `mode: "inspection_only"`, `approved: false`,
`model_can_view: false`, `owner_verified: false`, `image_bytes_checked: false`,
`provider_records_checked: false` and `requires_fresh_check: true`.

No file or PNG is opened, decoded, hashed or encoded. The declared PNG digest is
format-checked, not verified against a file. Provider journals, source frame
bounds, array hashes and actual saved annotations are not independently checked.
A caller-supplied snapshot can be stale or false. This function is neither a
security gate nor disclosure consent, and its result cannot replace the existing
[preparation](RESEARCH_HOST_IMAGE_INPUT.md) or
[live owner approval](RESEARCH_HOST_DISPATCH.md) contracts.

Existing metadata contracts determine blockers: one saved scalar spatial view,
no declared overlays/reprojection, consistent integer support and array shape,
exact applied question/view/frame, known revisions, settled draft publication,
no pending result, unresolved original request, source recheck, save or recovery.
Workspace metadata may be `new`, `dirty` or `clean`; dirty workspace metadata
is distinct from a dirty image edit. Unknown states abstain. Physical units,
material meaning and scientific evidence strength are not inferred.
An explicit `object.array_domain` must be `spatial`; frequency, reciprocal,
unknown or malformed declarations block even if the panel says `spatial_pixels`.
Historical absence of `array_domain` is allowed as a missing declaration, not
proof of spatial provenance. A contradictory domain returns no source rectangle.

Focused verification after building:

```sh
node --test dist/tests/research-input-readiness.test.mjs dist/tests/research-input-readiness-accessors.test.mjs
```

Tests use metadata JSON and refused raw objects, with changing/throwing getters,
custom iterators, ordinary and revoked Proxies, boxed strings and coercion hooks
to catch accidental execution or leakage. They cover offset source coordinates versus
display resolution, local/server revision disagreement, missing data, overlays,
FFT/composites, question scope, draft and original-request preservation. They do
not run the existing visual gate, a transport, provider, model or desktop app.
