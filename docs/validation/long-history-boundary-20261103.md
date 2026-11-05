# Long saved-view history: formal boundary reproduction

2026-11-03. Runtime base: `8f6f08789fd7c6ae41639c1f8957170fd2d8dbff`
(the complete #104/#103 candidate stack). This work does not change production
depth, provenance, numerical algorithms, or admission rules.

## Method and evidence separation

The explicit manual probe uses the existing stdio MCP provider and real Panel
HTTP routes. It is not native mouse/keyboard evidence, a browser gesture, or a
scientific-accuracy test. Each case has its own new public workspace and a
generated 16×24 uint16 TIFF; no experimental file is read.

`image_open` → `image_frame` → `image_preview` creates the frame/view pair.
Each following `image_annotate` creates a genuine immutable revision: first a
stable rectangular ROI, then a distinct label-text revision while retaining its
identity and geometry. No object, parent field, request receipt, or hash is
edited to manufacture history. The ancestry count includes the initial view and
terminal frame, but not the TIFF-source object beyond the terminal frame:

`actual ancestry records = annotation revisions + 2`.

Thus 13/64/65 records are 11/62/63 annotation revisions in this particular
workflow. They are not a universal number of edits. Other context/view operations
can add different records, and this does not establish “the 65th edit fails.”

For each generated object the probe reads explicit
`image_info(include_frame_ancestry:true)`, starts the real Panel at that exact
object, requests its admitted saved-window asset if available, explicitly saves,
and attempts one GUI-protocol FFT followed by the existing exact
`return-spatial` action. It then saves, closes, and reopens the saved analysis
through its normal snapshot qualification. No new preview is used as a recovery
workaround; no unknown computation is replayed. Existing arrays, metadata, PNGs,
and source files are compared by SHA-256 after the operations.

## Results

The original per-case receipts, complete request journals and objects remain in
`long-history-evidence-run1-20261103`. The single probe run completed with exit
code 0. A separate post-run readback checked the actual savepoints, request kinds,
original file hashes and FFT array hashes; it did not submit more operations.

| Actual records | Source qualification | Asset | FFT / exact FFT-source return | Save / normal reopen |
| --- | --- | --- | --- | --- |
| 13 (11 annotation revisions) | Actual frame identity | HTTP 200 | One FFT 200; return 200, exact original view | Both saves 200; normal reopen retains frame; close 200 |
| 64 (62 annotation revisions) | Actual frame identity | HTTP 200 | One FFT 200; return 200, exact original view | Both saves 200; normal reopen retains frame; close 200 |
| 65 (63 annotation revisions) | Provider ancestry ends in a valid frame, but Panel `frame_identity=null` | No admitted source window; `unavailable_reason=unverified_frame`, so no asset window ID is fabricated | One attempted FFT HTTP 400: `GUI FFT input: exact source identities required`; exact return not reached | Both saves 200 with null frame; normal reopen succeeds but retains null frame and unavailable window; close 200 |

The 65-record case is a **confirmed source-qualification boundary limitation**.
It is not a failed PNG fetch or missing data. It does not establish a #103
regression: the Panel's ordinary resolver already has the same 64-iteration
behavior before the bundled asset read is requested.

The source/view and original frame identities are:

| Records | Exact saved source view | Original frame |
| --- | --- | --- |
| 13 | `8ff09ca5ef0047d18ddb6dd629883178` | `49e947fbe1b743a29483ffce303b81c0` |
| 64 | `5334aa9aaad44d078f30fb0fdb78ce6a` | `2adeaa6274f64f94a77a1bbda9dbe4aa` |
| 65 | `32b8f8b3b0db47f5811f3a6783e18a3c` | `82cdad582856444597923c6d953b9123` |

The two actual FFT requests were
`panel-9d9730a1f895907e89dcd9e105fc3258-1` and
`panel-9ceee7a726518b2da4db90870a04cc02-1`; each is completed exactly once.
Their result arrays still match their original saved response hashes after
return and reopening. The 65-record workspace contains **zero provider FFT
requests and zero FFT objects**, checked in the actual provider journals and
object store rather than inferred from HTTP 400.

Its 67 provider requests are 63 annotations, one open, one frame, one preview,
and the preview's existing receipt acknowledgement. The extra receipt is
`received-6f97f32e354753007a6d23af10bf1e0bdbf4fb197ef295fb`, action
`preview_acknowledge`, kind `preview_acknowledgement`, naming
`history-65-view`, with no result object ID. It predates the annotation chain;
it is not a context or FFT saved by the refused FFT attempt. The 65-record store
has the 66 seeded objects (source, frame, view, 63 annotations), not a claim that
there are no saved objects.

All three original TIFF hashes remain
`77d25ff9afca4d539d2ff01843689c93e554c548822c277975c02805e3b56d83`.
All 28/130/132 original object files respectively remain byte-identical,
including original arrays and PNGs. The 13/64 asset reads took about
918/1112 ms in this single protocol run. Normal reopen qualification took
39.4/151.3/234.9 seconds for 13/64/65 respectively. These are bounded samples
on this developer environment, not statistical performance guarantees or native
GUI timing. No timer or qualification limit was changed to make them pass.

## Proposed separate issue: explicit ancestry exhaustion and saved-null recovery

The current loop freshly reads the next object at its last iteration, then exits
without evaluating that already-read 65th object. In this real chain that object
is the frame. However, accepting it is not automatically a harmless off-by-one
change: the existing implementation can publish and reopen a savepoint whose
frame identity is null. A changed resolver would need an explicit compatibility
policy for those saved snapshots rather than silently rewriting them or treating
them as another frame.

Recommended first decision: expose a distinct `ancestry_budget_exhausted` reason
instead of conflating budget exhaustion, missing records and generic unverified
frame. Preserve the exact image/object, history, original requests and savepoint;
show which scientific actions remain unavailable and offer an explicit existing
saved-input/requalification path. Do not create a new preview or FFT to hide the
condition, invent a frame, or silently replace saved-null provenance.

Separately decide whether the supported qualification contract may evaluate an
already fully checked terminal object within the existing read budget. Before
such a change, define null-frame archive handling, exact frame/hash consistency,
cycle/depth negative cases, old saved-source return and restoration behavior.
This is an issue proposal for owner discussion, not an implemented change. No
constant increase, ancestor shortcut, cross-request cache, archive mutation, or
second scientific database is introduced here.

## Reproduction command and limits

After the repository's locked dependencies and formal build:

```powershell
node tests/manual-long-history-probe.mjs "F:\New public long-history evidence" "F:\Scientific Python\python.exe"
```

The output directory must be new and absolute; the script refuses an existing
directory and retains its generated public workspaces. Target counts are bounded
to 13, 64 and 65. Exit status indicates whether the probe process completed;
individual HTTP outcomes and source-qualification failures must be read in the
receipts and are not converted into product PASS by a process exit code.

The first probe setup failed before any scientific call because a source-tree
compatibility shim was mistaken for emitted runtime layout. That infrastructure
failure and empty output directory remain retained. The corrected source/dist
module selection is separate from any product result.

Only the required bounded public FFT executions for exact source-return checks
are made. No GPA, topology, scattering, crystal simulation or noise matrix suite
is run. These results do not identify the cause of the earlier indefinitely blank
Windows scene, validate material/strain/peak interpretation, or qualify arbitrary
history depth or all GUI recovery paths.
