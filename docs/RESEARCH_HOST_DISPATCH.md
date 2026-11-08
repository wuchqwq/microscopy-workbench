# Bind research disclosure to its live scope

`createResearchSendGate` in `lib/research_host_dispatch.mts` is a process-local
guard for the existing host adapter. It does not run a model, create an Agent
framework, change tool schemas, adopt leads or authenticate a user.

## Owner boundary and approved content

The trusted Panel/CLI owner provides `readCurrent: () => ({workspace, panel})`.
For a colocated Panel it can read the existing `panel.state()` synchronously.
That reader must return the actual owner state in the same event loop that
dispatches, with monotonic state/draft/collection/working revisions. A frozen
HTTP response, filesystem checkpoint, async reader or separately running Panel
does not meet this contract. There is no remote-state/lock fallback. The real
CLI/desktop approval entry is not wired in this increment; the tests supply a
local mock owner explicitly, not a claim that an actual GUI user approved.

Preparation uses real provider checks and stores its original options privately.
`review(prepared)` accepts only that original deeply frozen object. It rechecks
the original workspace, journals, hashes and arrays, verifies the current
question text/frame and question-context lineage, and binds:

- Workspace canonical path plus device/inode identity.
- Exact applied question record and context manifest hash.
- Verified view/frame/array/PNG reference and exact outgoing payload.
- Existing Panel ID, helper/owner session, generation, state, draft, collection,
  and working revisions, analysis attachment and selection.

Dirty drafts, active gestures, pending results, source rechecks and submitted or
unknown original scientific outcomes refuse. No workspace path or owner lease
is added to the outgoing payload. The review exposes the exact bounded wire
items and their payload digest for the owner to inspect.

The owner starts the host session with `task.context_sha256` equal to the review's
context digest. After explicit user approval of that exact review, it calls
`approve(review, host, {ttlMs})`. That method rechecks live scope and binds the
specific adapter instance, thread, task and session revision. A resumed session
gets a new revision even if the visible thread ID stays the same. A session RPC
in flight also prevents a new turn. The approval lifetime is 1..300000 ms on a
monotonic clock. One review can grant only once; a new grant from the same owner
revokes its previous one. `revoke(handle)` is authority-specific and idempotent.

`approve` is a trusted owner action, **not** a model tool or automatically called
by preparation. This library cannot prove a human clicked a UI or defend against
arbitrary malicious JavaScript inside the trusted process. The owner must never
expose approval methods to model arguments or treat a returned JSON flag as
consent. Persisted or transferred handles are intentionally unusable; after a
restart, reconnect or changed scope, the user must review the new scope again.

## Last check and dispatch boundary

`host.startTurn(approvedHandle)` looks up the handle's private WeakMap entry;
spread/JSON copies and fake markers cannot pass. Image/source objects are not
directly sendable, including a legitimate preparation without approval. Once
the host has approved research scope, raw text follow-ups cannot bypass it.
Unbound text transport accepts **primitive strings only** for the existing
generic protocol diagnostics. Raw objects are rejected without inspecting their
properties, even if they look text-only or are frozen; boxed strings and Proxy
wrappers are also refused. WeakMap handle lookup does not invoke getters or
Proxy traps. The same immutable string value is then serialized, preventing
mutable/accessor inputs from changing classification into an image attachment.
This is not an image-research or user-approval entry. `hostTurnWireInput` remains
a separate inspection/serialization helper; its object support is not permission
to pass an unapproved object to the actual host transport.

The adapter first validates the scope before changing turn state. It then emits
the starting observation and invokes its optional `onWire` observer. After those
external callbacks return, it fixes the serialized RPC bytes, rereads current
owner state and rechecks original provider records, question, source, revisions,
approval revocation/expiry and exact session. Revocation/expiry is checked again
after that read. The grant is consumed immediately before `stdin.write`.
There is no await, event emission or further owner/observer callback between
the final successful guard and invocation of that write.

`onWire` observes a **prewrite attempt**, not a delivery receipt. Tests count
the actual mock Writable input. A failed guard writes zero bytes and retires
its RPC ID/timer; if the same session is still ready it restores the prior idle
or terminal observation. The grant stays revoked even if the state is changed
back. Transport failures after the write retain the existing unknown-outcome
fence; consumption is not rolled back, and no automatic resend occurs.

After `stdin.write` starts, a change/revocation cannot unsend accepted bytes.
This boundary does not prove process receipt, model decoding, inference, tool
execution or completed research. External filesystem mutation is detected by
hash/identity rechecks, but there is no atomic lock spanning every provider file
against an adversarial writer. The previously verified image-byte snapshot
still prevents substitution through a later host pathname reopen.

## Focused evidence and remaining work

Build with `node scripts/build.mjs`; `npm run test:research-host` includes the
input, dispatch and existing transport regressions. Dispatch tests use a local
mock Writable to assert zero actual `turn/start` deliveries for question/source/
workspace/revision changes, copied or forged inputs, wrong sessions, pending
session awaits, revoked/expired/superseded grants, and changes from starting,
wire and final owner-read callbacks. Normal delivery is one-shot; a postwrite
change cannot trigger replay. No tests call an external model.

The bounded provider smoke in `tools/smoke_research_host_image.mts` also builds
a review from actual saved provider objects with an explicitly synthetic owner
snapshot and refuses a changed mock question. It does not qualify live Panel
approval or distributed ownership. Use a new output directory each run.

Actual user approval UI, real Codex decoding/vision, experimental scientific
tool callbacks, iterative result checking and validated Panel CAS lead adoption
remain NOT_TESTED/unimplemented. They follow independent review of this guard;
this scoped change is not the completed research workflow.
