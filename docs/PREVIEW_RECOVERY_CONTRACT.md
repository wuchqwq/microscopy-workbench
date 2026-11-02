# Preview outcome recovery v1 (#70, approved route B)

Base: main `adf8860e852fb3ca447cd3a4c6e6e3e2d7788c19`, tree
`59f8bfe66164ea2c63e56c563f56de8797b2b494`. This is a preview-only
operational admission contract, not a scientific journal replacement.

## Submission and receipt

The common Python `_execute` boundary admits every `view`, including composed
children. An exclusive original request journal precedes a one-use reserve /
dispatch ticket. Node waits for the durable reservation before starting the
actual render worker. Concurrent processes share the same fixed-input claim.
Changing request ID, crop, size, or known same-file/frame alias cannot substitute
for resolving an earlier preview. No timeout, PID check, or missing result proves
non-execution. Other saved data remain readable.

`image_result` queries the original journal, including legacy objects, without
re-execution. A completed view can be shown directly. A deliberate new render
can use its exact saved view/descendant or `resolved_preview` request/object
reference. Composition requiring a frame can first use the explicit
`image_preview_acknowledge` tool with that completed original. A confirmed failed
original can be acknowledged without an object. Unknown originals cannot.
ACK reserves the same original `requests/` namespace as scientific writes, is
recoverable by its own ID, and creates no scientific object.

The first-party StdioImageClient acknowledges previews referenced by a complete
successful rendering-write response only after decoding that response. It never
acknowledges merely because server computation completed; read-only evidence,
probe, info and result queries do not acknowledge. This proves receipt at that
client boundary, not human viewing or Panel presentation. External clients can
use explicit result references/ACK. Composed children may consume only preview
results returned within their current parent invocation, never arbitrary disk
completion or cross-parent memory.

Panel open/resume/show use saved PNGs. A raw input without a saved display gets
`PREVIEW_REQUIRED` before Panel open is submitted; there is no implicit preview
fallback. GUI calibration deliberately submits its separately journalled preview.

## Failure states and diagnostics

- Proven spawn failure before a worker exists is `not_submitted` for that attempt.
  A positively aborted reserved ticket is fenced and cannot replay under its ID.
- A dispatched worker without a valid response remains `outcome_unknown`, even
  when its original scientific journal is missing/prepared.
- Completed-but-lost delivery recovers the exact original completed object.
- Worker diagnostics include original ID, provider/workspace, stage, exit,
  stdout length/hash and bounded redacted stderr; no raw arrays/PNG are dumped.
  A valid provider-reported failure remains distinct from transport uncertainty.

Resource binding includes workspace/provider, immutable source file identity,
frame/plane selection and array hash. A short exclusive resource lock protects
claim publication; interrupted locks are never cleared by guessed liveness.
Strict intent/fence validation and an immutable anchor detect a lost single
claim file. The owning scientific journal stays authoritative. Missing or
contradictory operational data fail closed; this change supplies no automatic
corruption repair, universal filesystem-failure recovery or protection against
wholesale deletion/tampering of the workspace. No transformation-equivalence
engine or general execution runtime is introduced.

## Compatibility and evidence

Original scientific requests, arrays, objects, hashes and interpretations are
unchanged. New previews add `preview_execution` provenance; old objects receive
no field retrofill. New operational receipts use a new action with no object.
Clients that deliberately request repeated raw-frame renders must now explicitly
resolve/acknowledge the preceding outcome. This intentional admission change is
not a numerical-algorithm or tolerance change.

Original unfixed failure, independent counterexamples, actual logs and file
hashes are retained under `analysis/issue70-validation/`. They include a public
synthetic TIFF and the original two-preview result after withheld delivery.
This controlled reproduction is not proof of the historical r63 parser's cause.
The later probes found and retained composition bypass, malformed fence,
ACK-ID race, readonly auto-ACK, missing claim and losing-ID anchor failures;
fixed tests preserve each operational invariant.

See `analysis/issue70-validation/REPORT.md` for actual commands and boundaries.
Real browser gestures remain **NOT_TESTED**, at the user's request. This fix
changes no measurement reliability, noise qualification or physical conclusion.
