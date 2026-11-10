# Codex notification observations

The first real text-tool run retained 63 generic warning labels, not their
notification payloads. The preserved provider journals, model finals and source
hashes still establish the measured text-loop results. They do not establish
complete protocol coverage or make the missing notifications harmless.

At source `3fa9d733f964e263c145a261fe9ab258902e5c04`, the warning branches prove:

| Original label | Count | What the branch establishes | What is unrecoverable |
|---|---:|---|---|
| `stale_or_unbound_notification` | 24 | The event did not satisfy the then-current thread/turn identity guard | Method, actual identity, whether legitimate global/thread metadata or a foreign/late event |
| `unsupported_completed_item_type` | 19 | Matching current thread/turn; `item/completed`; bounded nonempty item ID; string item type other than `agentMessage` | Actual item type, status, arguments, result and any unexpected execution |
| `unhandled_notification` | 20 | Matching thread/turn, not terminal, and no implemented method branch | Actual method and meaning, including whether an error/reroute or omitted metadata |

The counts and local snapshot positions are recoverable. The lost event contents
are not. Do not identify the 19 items as reasoning/tools, the 24 as usage/account
events, or the 20 as harmless reasoning deltas by inference from a later run.
No private/default profile history is read to try to fill those gaps.

## New handling

The installed protocol snapshot and official [App Server events and errors](https://learn.chatgpt.com/docs/app-server#events)
define shared item lifecycles, dynamic-tool status, thread status, and retry/error
notifications. The adapter now separates those scopes instead of passing every
event through a turn-only guard.

- Dynamic tool lifecycle emits `host_tool_status`, including its host-reported
  status and optional success flag. This is **host lifecycle only**, not provider
  scientific completion. No notification can itself execute a tool. Conflicting
  status is invalid; an unfinished item is marked unknown at turn termination.
- Thread status does not imply turn completion. A closed/unavailable selected
  thread fences further work; resolving a matching pending request clears that
  wait without granting approval or executing anything.
- Error notices preserve retry intent and a finite category/HTTP status when
  recognized. Only authoritative `turn/completed` determines terminal outcome.
  Model reroute, safety/config/auth notices remain visible warnings.
- Reasoning, plan, user-echo and known function-output lifecycle presence can be
  classified without retaining their contents. Unknown or foreign events retain
  a diagnostic and cannot overwrite model messages or trigger science.
- Unexpected execution/tool kinds in text-only mode raise a risk signal and
  fence the connection. This records uncertainty rather than assuming that an
  unsupported tool item is benign. The image-input gate is not exercised.
  Current-turn command output/terminal interaction, MCP progress, file-change
  output/patch and turn-diff notifications trigger the same fence without a
  preceding `item/started`. Standalone process APIs lack thread/turn IDs in the
  installed schema; this patch does not infer their association from a process
  handle. Such unbound notices still retain limited diagnostics.
- Each observed item ID is pinned to its type within the identified turn,
  including agent/reasoning/plan deltas before any lifecycle header. Conflicting
  type claims fence the connection before final output or callbacks can proceed.
  The bounded map retains ID/type digests only (maximum 256 per turn), is reset
  on a successful new turn/session binding, and ignores foreign/old-turn claims.

## Minimal diagnostic allowlist

`host_protocol_diagnostic` records a local sequence, fixed classification and
association labels, known method/item-type names, known status/waiting flags,
retry boolean, and recognized error category/HTTP status. Required correlation
IDs are SHA-256 digests, not their raw values. Unknown method/type labels are also
digested. No unknown payload is copied/stringified into the diagnostic.

It excludes account identity, credentials, paths, arguments, provider content,
images, URLs, error/details text, reasoning, plan text and arbitrary extra fields.
Existing authoritative agent-message output is separate from this metadata log.
The optional trusted `onWire` developer hook is not a sanitized logger; this
change does not authorize using it to collect raw live payloads.

Each connection emits at most 128 informational and 128 issue diagnostics.
Information saturation cannot consume the issue budget. Dropped counts are
queryable and retained by the text runner. Issue overflow fences the connection;
capture truncation is reported, not silently called complete. Tool lifecycle
tracking is separately bounded to 64 current-turn items.
The runner flags any warning, unfinished tool or observed model reroute separately;
an empty issue-diagnostic count alone does not qualify result completeness.

After building, run `npm run test:research-text-tools` for the affected protocol
and callback regressions. Fixtures are scripted/local and do not use a model,
credentials, image input or scientific computation.

This increment uses scripted protocol regressions. No new real model round is
needed to prove these handlers or recover the old payloads; the latter cannot be
recovered by rerunning. Real-server acceptance of the new classification remains
unqualified. The prior real scientific results are retained without expanding
their historical protocol claim. Vision and complete research/GUI adoption remain
outside this change.
