# Saved-image input for the Codex host

This shared Node helper prepares one already saved scalar spatial view for the
host. It adds no numerical engine, provider mutation, tool dispatcher, real-host
entry point, automatic disclosure or lead adoption. The current CLI/desktop
entries remain synthetic diagnostics. This change is the input-boundary stage;
it is **not** the completed real research loop.

## Source qualification

`prepareResearchHostImage({workspace, view_id, view_sha256, frame_id, text})`
uses `readImageProviderRecords` to check the selected view's original committed
request, manifest, lineage, view array and frame array hashes. It requires:

- One ordinary `view`, one `spatial_pixels` panel, and one exact saved frame.
- No saved annotations and no annotation reprojection. An ordinary view can
  contain inherited overlays; `kind: view` alone is insufficient. Malformed
  annotation fields also refuse. No overlay is removed or silently re-rendered.
- `panel.source_object_id` and the resolved spatial grid ID equal that frame.
- Matching explicitly supported scalar dtype, valid frame/view shapes, and a
  source rectangle whose extent equals the view array and lies in the frame.
- A fixed ordinary `objects/<view_id>/preview.png`, its original PNG SHA-256,
  and an image rectangle within the verified PNG dimensions.

Complex, composite, annotated and frequency views require separate qualification.
A display or scale bar does not establish a physical scale, phase, material or
independent experiment. Existing provider journals remain authoritative.

## Exact disclosure shape

Preparation returns a deeply frozen `{text, source, images:[{path, sha256}]}`.
Its original verified provenance is held in a process-local WeakMap. A JSON
copy, spread, forged flag or independently supplied source is not a verified
preparation. `text` is the exact
caller-selected question. `source` contains only view/frame IDs, manifest/array/
PNG hashes, original request ID, scalar dtype, shapes and source/image rectangles.
It contains no provider panel object, user context, labels, filenames, local
paths or unknown fields. These allowed fields are also validated and projected
when serializing typed input. The raw serializer labels caller-supplied source
references **unverified**, even when their field shapes are valid. Unknown fields in the typed source are refused;
unknown provider/panel metadata is never copied. The local image path remains
an internal caller input and is absent from the wire.

`hostTurnWireInput` produces separate official input items: question text,
whitelisted reference text (explicitly described as a display and source-pixel
mapping), then `{type: "image", url: "data:image/png;base64,..."}`. Text-only
callers retain their existing single text item. At most two explicitly selected
PNGs are accepted, each at most 8 MiB and 16 megapixels. A source reference must
bind exactly one image with the matching PNG digest. No external URL is fetched.

## Image-read race guarantee and limits

Before any turn-state change or RPC, the helper opens the image with
`O_NOFOLLOW`, checks descriptor identity/size, reads a bounded buffer, verifies
that same buffer's SHA-256 and PNG header/dimensions, and checks descriptor
size/timestamps again. It encodes **that same buffer** into the wire item. Codex
receives the copied bytes; it never reopens the mutable source pathname. Changing,
removing or replacing the file after serialization cannot substitute another
image. A change before dispatch causes refusal. No temporary snapshot files,
source modifications or permission changes are needed.

This guarantees input-byte identity, not atomicity of all provider files against
an adversarial writer, scientific interpretation, or successful model decoding.
PNG-header checks are not a full decoder. All verified PNG bytes, including any
ancillary metadata, are retained; the helper is not a pixel/metadata scrubber.
It cannot recognize marks already embedded in original source pixels or repair
forged provider provenance. It does not detect secrets in arbitrary user text.
The caller still must review/authorize the exact question, reference and whole
image, and bind the live question/source/revision to the correct session before
sending. Generic typed input alone supplies no provider qualification. A hash
or a successful preparation is never disclosure consent.

The local 0.166.0-alpha.5.1 protocol snapshot exposes the official `image.url`
input. The [App Server reference](https://learn.chatgpt.com/docs/app-server#turns)
documents that input; the [vision guide](https://developers.openai.com/api/docs/guides/images-vision)
documents base64 data URLs. Actual app-server acceptance, decoding and model
vision remain **NOT_TESTED** until the independent input-boundary review permits
an explicitly approved public synthetic run. No auth, configuration or policy
changes are introduced by this helper.

## Focused checks

Build with `node scripts/build.mjs`, then run `npm run test:research-host`.
Synthetic tests cover committed source identities/hashes, overlay/reprojection
refusals, panel/frame disagreement, malformed mappings, unknown/private metadata,
text/source separation, unchanged fixture bytes, changed/linked PNGs, byte/pixel
bounds, and a source overwrite immediately before stdin serialization. They also
cover original thread/turn/item identities, failure, cancellation, duplicates,
late messages, unknown-outcome fences and actual synthetic child close.
These synthetic children do not decode images, run science or contact a model.

For one actual provider check, set `TMPDIR` and `MICROSCOPY_PYTHON` to explicit
project locations, then run:

```sh
node dist/tools/smoke_research_host_image.mjs /absolute/new/output-directory
```

The output directory must not exist. This uses `createScienceRuntime`'s catalog
and calls the existing image tools on a generated 32x32 public synthetic TIFF.
It verifies a real frame/view's encoded display and refuses a real ordinary view
that inherited a reprojected annotation. `report.json` retains exact provider
request/object/hash references. It tests the affected provider boundary, not
numerical algorithm performance, model vision or desktop interaction.

## Approved research dispatch

An image preparation is not directly sendable through `startTurn`. It must pass
the [live scope and approval gate](RESEARCH_HOST_DISPATCH.md). That gate checks
the owner state and original provider records again immediately before the
actual stdin write. Raw images/source objects and copied or forged approvals
are refused. Once an adapter has entered approved research mode, unapproved
text-only follow-ups are refused too. The generic serializer still accepts
caller-selected bytes for inspection, not authorization or actual delivery.

## Next stage after independent review

Connect official experimental `dynamicTools`/`item/tool/call` to the existing
science registry; bind exact question/source/revisions and original request IDs;
keep unknown outcomes query-only. Then run the explicitly authorized public
synthetic real-model loop: see image, choose tools, inspect results, revise the
check, propose source-linked leads with support/opposition/unknowns/next action.
Use `readLeadDraft`, `validateLeadEvidence` and the existing serialized Panel CAS
review/adoption path. Saved same-frame statistics are the currently supported
lead evidence. Real vision, tool choice, iteration, adoption and Save/Close/Reopen
remain NOT_TESTED in this input-boundary increment.
