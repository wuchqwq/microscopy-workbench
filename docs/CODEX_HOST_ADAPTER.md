# Replaceable host boundary — synthetic qualification only

**合成宿主测试，真实 Codex 尚未连接。** This increment tests a local synthetic
app-server peer. It does not run a model, inspect images, choose scientific
tools, accept a research candidate or modify scientific/workspace records.
Previous offline candidates retain their separate offline origin and labels.

## Shared entry and ownership

```sh
npm run build
node dist/tools/workbench_cli.mjs host-demo
```

The command accepts no workspace, question, image, executable, credentials or
other options. The Electron menu **帮助 → 宿主适配（合成测试；非 AI）** calls the
same `runSyntheticHostDemo` Node service with the already configured ordinary
Node runtime; it does not use Electron's executable as Node. The native dialog
reports the synthetic result without reading the open analysis or touching
drafts, recovery, source proofs, scientific requests or candidate acceptance.
The existing research/Agent handoff entries keep their existing guards and
behavior. The new menu is a diagnostic, not an AI analysis entry.

- `research_host.mts`: small host-neutral session interface, opaque task reference,
  handle, snapshot and INTERNAL events. DSH has no implementation or assumed API.
- `codex_stdio_host.mts`: Codex-specific stdio request/response translation.
  Construction requires an explicit absolute executable; no discovery, install,
  credential/configuration read, login or policy change. Connect is explicit.
  Its default provenance is unverified, not an authenticated model identity.
- `research_host_demo.mts`: fixed synthetic service used by CLI and Electron main.
- `synthetic_codex_app_server.mts`: actual local Node child process, deterministic
  messages labelled synthetic. It is not Codex or a model-response simulator
  that can qualify scientific behavior.

There is no tool executor/callback, numerical engine, new scientific database or
research save schema. `HostTaskRef.context_sha256` is a caller-supplied reference,
not provider validation or user authorization. The demo uses an artificial zero
digest. Resume checks the handle and prevents silent task-reference rebinding;
it does not verify a real saved question or authenticate a server's history.
Host RPC/thread/turn IDs do not replace provider request IDs or CAS revisions.

## Wire subset and internal observations

Fields/directions follow the official
[Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
(consulted2026-11-07). This is a small subset, not full schema/version conformance.

| Official wire direction/method | Adapter behavior |
| --- | --- |
| client `initialize` → response → client `initialized` notification | Once per transport; fixed clientInfo; no experimental capability or policy overrides |
| client `thread/start` / `thread/resume` | Preserve returned thread identity; resume names exact threadId and excludeTurns |
| client `turn/start` | Explicit bounded text; optionally caller-selected, SHA-256-checked local PNG files; no implicit workspace attachments |
| server `item/agentMessage/delta` | Correlated thread/turn/item text observation, never an accepted research result |
| server `item/completed` with `agentMessage` | Preserve exact final text and optional phase separately from deltas; no scientific adoption |
| server `turn/completed` | completed/interrupted/failed is terminal; an RPC acknowledgment alone is not |
| client `turn/interrupt` | Request once for that turn; wait for terminal notification |
| server approval/permission requests | Pending user action only; no grant/accept response is implemented |
| other server requests, including unadvertised experimental tool calls | JSON-RPC unsupported error; no command/provider dispatch or credentials |

The demo performs handshake → first completed turn → explicit same-thread resume
→ second turn with a blocked command approval → interrupt → interrupted → stdin
EOF and observed child close. It does not send approval decisions or call
`command/exec`. It registers no dynamicTools or experimental capability.

`host_state`, `host_text`, `host_message_completed`, `host_request_blocked`, `host_warning` and
`host_transport_closed` are adapter INTERNAL events; they are not invented
official wire events. The transport-close event records actual process close
separately from host turn completion. The CLI's completed envelope means this
diagnostic completed, not that Codex connected or analysis succeeded.
`host_text` preserves the wire `itemId` as internal `item_id`, alongside exact
thread_id/turn_id, and now explicitly carries `text_kind: delta`. It is a preview,
not final content. `host_message_completed` records the authoritative
`agentMessage` text from `item/completed`, with its item ID and optional phase.
The host's final text may differ from deltas, or arrive without any deltas.

The snapshot retains `agent_messages` and `unfinished_agent_message_ids` for the
CURRENT turn only. A new explicit turn/session clears that bounded view; event
subscribers may retain their own history. At most 64 observed message IDs and
1 MiB of completed text are retained; exceeding either fails the connection.
`item/started` or a delta records an unfinished message until its final arrives.
The adapter does not aggregate deltas, infer an answer from their concatenation,
or claim support for completion bodies of non-agent item types.

Exact duplicate final text/phase is ignored with a warning, without re-emission.
Conflicting text/phase for the same current-turn ID fails the connection and
marks the turn unknown, preserving the first observation without silently
overwriting it; callers must not adopt that conflicted turn. Late deltas cannot
alter a final. A final arriving after its own turn terminal may fill the exact
bound item with a warning; a different/old thread or turn is ignored. Early
notifications wait for the original turn/start response identity. No event is
silently rebound to another turn. Phase is preserved (including absent/null);
completion of a commentary/partial-answer item is not a whole research answer.
Live notifications and early-event replay share the same exception boundary:
an early replay validation or quota failure fails the connection, stops input
and retains the identified turn's unknown outcome and observed messages. A later
turn terminal cannot undo that failure.

`turn_state: completed` reports a HOST turn status, not a claim that every message
final was received or a research task was fulfilled. Known missing finals remain
listed and warn at terminal; even an empty missing-ID list cannot prove receipt
of unobserved items. Snapshots are bounded observations, not persisted sessions.

## Failure and permission boundaries

Responses correlate unique RPC IDs; duplicate/late replies do not replay requests.
Early turn notifications are bounded and held until the returned turn ID is
known. Old/unbound turn events cannot replace the new turn or its text. Invalid
wire messages fail the connection; pending calls reject rather than silently
reconnecting. A timeout or connection loss does not authorize resending a turn.
Routine close ends stdin and waits for real child close without killing. Input
framing has a separate defensive path: raw bytes are checked BEFORE copying
into a fixed 1 MiB frame buffer, then decoded with fatal UTF-8 validation. Invalid
UTF-8 is rejected rather than replaced with U+FFFD. Either invalid UTF-8 or a
frame exceeding that bound stops input, releases
the buffer, rejects pending RPCs/clears pending request bookkeeping, destroys
stdout, ends stdin and requests termination of this adapter's OWN direct child.
A termination request or signal return is not proof of exit; only the actual close event
confirms transport closure. Failed termination remains unconfirmed; no alternate
kill route or automatic resend is attempted. An active
turn without a terminal event remains unknown, and a close timeout is explicitly
unconfirmed. Session state is not persisted by this increment.

`close()` returning false describes that wait's timeout, not a final claim that
the child can never exit. A later actual close updates `connection: closed` and
snapshot `transport_close` (exit_code/signal); subsequent `close()` calls return
true. Before that event the receipt is null. No timeout triggers a resend or a
routine forced termination.

`CodexStdioHost.inputDiagnostics()` reports retained/peak frame bytes, capacity,
bytes observed before stop, pending RPC count and cleanup request/acknowledgment.
These are internal transport diagnostics, not official wire fields, total
process RSS or an output-consumer storage limit. Many individually valid frames
may exceed 1 MiB in aggregate and still continue normally. Terminating the direct
host is not a claim that its descendants or scientific work were cancelled;
real-model/process-tree behavior remains unqualified.

A host request is not user authorization. The adapter has no way to approve it
or route it into the scientific provider. Existing MCP/provider/CLI permissions,
original request journals, unknown/query-only rules, candidate editing/acceptance
and source/CAS/dirty/recovery guards are unchanged. No fake host event is adopted
as a scientific record or as an authenticated proposed_by identity.

This client boundary is **not a sandbox around a real Codex server**. Inherited
server tools/policies could execute server-side actions without a client approval
request. No claim that this adapter alone prevents that behavior is made. Real
integration must separately verify the existing authorized host's tools/policies,
identity and exact data disclosure before any real turn. This increment neither
changes those settings nor supplies flags to weaken approvals/network/security.

The demo sends fixed synthetic text locally, no images or research data. The
fake child receives only platform/temp environment fields; host authentication
variables, profile selectors and PATH are not forwarded to it. This fake-only
filter does not configure a real Codex profile or qualify real authentication.
The low-level real transport's inherited environment/configuration still needs
explicit review before future real use.
The low-level adapter's bounded input check is not a secret/path detector or a data
disclosure approval. Its optional raw wire observer is used only for known
synthetic evidence, not proposed as production telemetry. Future real delivery
requires an exact preview/review of free text, approved images and tool outputs,
no private paths/capability URLs/credentials, and validated source/lease bindings.
Related same-image/A-B/FFT/phase views must not become independent experiments.

An independent [saved-image input helper](RESEARCH_HOST_IMAGE_INPUT.md) now
prepares one existing spatial display PNG and its exact provider references.
The low-level adapter accepts this typed input, checks PNG bytes again, and
encodes the verified bytes in an official `image.url` data-URL item before
dispatching `turn/start`; Codex does not reopen the source pathname. The helper
rejects inherited/reprojected overlays and cross-frame panel mappings and sends
only whitelisted source fields, separately from the exact question text.
This is a library capability, not a new desktop/CLI
real-host entry or evidence that Codex read an image. Existing text callers and
the fixed synthetic demo retain their behavior. Tool dispatch and result adoption
are still unimplemented at this host boundary.

## Qualification and remaining gap

Targeted tests use actual local synthetic Node subprocesses. They cover request
ordering, completion/resume/interrupt, blocked approvals and unsupported tools,
spawn failure using a deliberately absent synthetic executable, invalid/missing
messages, duplicate/late replies, notifications before responses, wrong resumed
identity, close during initialization and close of an unresolved active turn.
Additional isolated peers exercise a finite 8 MiB unframed continuous flood,
observable bounded retention and actual child close, legal aggregate output
above 1 MiB with small frames, and interleaved item identities across two turns.
Further peers cover authoritative/no-delta/early/late/duplicate/conflicting final
messages, incomplete previews, message retention bounds, malformed UTF-8 and an
actual EOF-driven child exit after the close wait has timed out.
The CLI diagnostic is tested as an actual subprocess without workspace effects.
The desktop menu is wired to the tested service and checked by source/contract
tests; an actual native GUI click is NOT qualified by these tests.

The synthetic increment did not establish a real host handshake. A future real
run requires a confirmed executable and identity, permitted startup operations,
and the data/tool-policy checks above. Authentication files are not inspected by
this adapter. No real-model, multimodal,
autonomous tool-choice, candidate round-trip, cross-process resume, Mac/Linux or
remote CI qualification follows from this fake-host PASS.
