# Text-only research tool loop

This increment connects official app-server experimental tool callbacks to the
existing scientific registry. It is independent of the image-input review,
which remains blocked/not accepted. No image-gate review is rerun or replaced.
The new entry always uses primitive text input and text-only callback results;
it never consults the image dispatch gate or accepts its approval handles.

## What runs

`tools/research_text_loop.mts` creates a new public synthetic 64x64 uint16 TIFF,
opens its exact frame through the existing provider, and keeps that TIFF/NPY
locally. The host gets only frame ID, dtype/shape, hashes and a public question
about intensity variation. It receives no fixture formula or expected answer,
file path, PNG, pixel raster, encoded image or array attachment.

`createResearchTextTools` derives two bounded definitions from `registry.listTools`:

- `image_statistics`: model-selected half-open pixel ROI on the pinned frame.
  The bridge assigns and records the original request ID before calling the
  existing `registry.call`. One saved write at a time; at most 16 writes.
- `image_result`: read-only query of an original request created by that bridge.
  Unknown outcomes block replacement writes until a saved outcome is verified.

A terminal failed journal is distinct from an unknown result. After an unavailable
write outcome the bridge makes one read-only `image_result` query; it never
reinterprets a failed journal through Node's loose JSON decoder. The Python
provider uses its existing strict UTF-8/JSON parser on one byte snapshot and issues
a bounded failure receipt with exact parameters/hash and original journal hash.
Duplicate keys, non-finite numbers and invalid UTF-8 remain unknown and issue no
receipt. A stored `original_failure` field cannot substitute for a live receipt.
The bridge checks that provider receipt, workspace/action/arguments and parameter
hash before returning `failed`, its original request ID and a fixed error category.
It never forwards arbitrary provider diagnostics. A corrected new request may
then proceed; the original failed call remains cached and is never replayed.
Missing, incomplete, unreadable or mismatched journals stay unknown and continue
to block replacement writes. Failed requests still consume the bounded budget.

The provider performs all calculations. The bridge uses the existing journal,
manifest, array and saved-statistics reader to verify the actual result, then
projects only five finite statistics, pixel ROI, source/request/object IDs and
hashes. Raw provider content and arbitrary metadata are never forwarded, including
when a reply contains an image block or an error diagnostic. Same-frame checks
are explicitly dependent; material identity, physical scale and intensity units
remain unknown. This does not implement a new numerical or Agent engine.

The adapter opts into `experimentalApi`, registers function-shaped `dynamicTools`,
handles exact thread/turn-bound `item/tool/call`, and returns `inputText` content
in that same turn. RPC duplicates never redispatch; scientific call identity is
also cached by thread/turn/call ID, with conflicts refused. Cancellation/terminal
state stops queued callbacks and suppresses late delivery while preserving local
original request IDs. No unknown scientific work is automatically retried.
If an interrupt RPC is rejected, the connection becomes locally `failed` and
the active remote outcome stays `unknown`. Already-aborted callbacks are not
resurrected, later tool requests cannot dispatch, and repeated interruption sends
no new RPC. This is a local fence, not proof of remote cancellation or process
exit; an in-flight provider write can still finish and retains its original ID.

Official protocol context: [App Server](https://learn.chatgpt.com/docs/app-server#dynamic-tool-calls-experimental).
The local 0.166.0-alpha.5.1 schema snapshot is the implementation's protocol
reference. Per-session configuration requests shell/view-image tools off and
web search disabled, with an empty local model cwd. These reduce the session's
catalog; they do not relax system permissions or alter global settings.
Actual official thread/tool registration remains unqualified until an authenticated
run; a successful local peer does not prove the service accepted configuration.

## Run and reproduce

Use the existing external-SSD Node dependencies and Python environment. Build
first; set TMPDIR, Python and optional existing official runtime explicitly.
Every run requires a new output directory and retains local provider/audit data.

```sh
TASK_ROOT='/absolute/task-root'
export TMPDIR="$TASK_ROOT/runtime/tmp"
export PYTHONDONTWRITEBYTECODE=1
export MICROSCOPY_PYTHON="$TASK_ROOT/runtime/science-venv/bin/python"
cd "$TASK_ROOT/source"
node scripts/build.mjs
npm run test:research-text-tools
npm run research:text -- --local "$TASK_ROOT/evidence/text-tools-LOCAL-FRESH"
```

The focused recovery regression uses a separate public 4x4 analytic fixture and
the actual provider: invalid ROI, query that original failed request, then compute
a corrected ROI. A second journal-only matrix sends identical synthetic bytes to
the actual provider and bridge, checks classification parity and zero replacement
scientific writes for unknown records. It does not create a model/host session.
Python is opt-in; the
test is skipped when `MICROSCOPY_PYTHON` is absent. Retain evidence with a new path:

```sh
export MICROSCOPY_TEXT_RECOVERY_EVIDENCE="$TASK_ROOT/evidence/text-recovery-FRESH"
npm run test:research-text-recovery
```

`--local` launches an explicitly scripted Node peer, not Codex. It asks for whole
frame statistics, then selects another ROI only after inspecting the returned
variation, and continues a second text turn. This exercises actual provider work
and bidirectional streaming; it is **not autonomous model choice**.

For the real route, use only an already authorized official runtime; never copy
credentials or generate API keys for this command:

```sh
export MICROSCOPY_CODEX_HOME="$TASK_ROOT/runtime/codex-home"
npm run research:text -- --real "$TASK_ROOT/evidence/text-tools-REAL-FRESH" \
  /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
```

The real route first initializes the official binary and calls
`account/read(refreshToken=false)`, retaining only authentication booleans.
Without an authenticated account it stops before thread/turn submission. No login
API, token refresh, credential migration or alternate authentication is attempted.
This status concerns the configured runtime only, not every desktop App account.
`MICROSCOPY_CODEX_HOME` may select an existing authorized runtime; the operator is
responsible for choosing an external-SSD path. No auth directory is discovered.

`--real-existing NEW_ABS_DIR OFFICIAL_CODEX_ABS` explicitly selects the official
default local authentication source by omitting `CODEX_HOME`. It refuses a
simultaneous `MICROSCOPY_CODEX_HOME` override. The client uses its existing store;
the runner does not discover, read, copy or migrate credentials. Model cwd,
TMPDIR/TMP/TEMP, XDG_CACHE_HOME and application evidence stay in the new external
run directory. Default official profile may write small runtime state; desktop
cache sharing and all internal write locations have not been audited. No existing
configuration/session file is edited by the runner.

`--prepare NEW_ABS_DIR` only prepares the public fixture/provider frame and exact
`public-send-plan.json` questions/tool definitions. It does not spawn any host or
check authentication. Other modes also save this plan before connecting.
The plan excludes image bytes, pixels, local scientific paths and raw provider
content. **This is application-owned content, not an audit of the official
client's complete model request.** The already-reviewed adapter supplies cwd to
the local app-server; official client may generate additional environment or
instruction context. When authorization excludes even standard local directory
metadata, stop before the real run until that scope is resolved. Do not claim
that text-only application messages prove the absence of client-added context.

Authentication isolation was a choice for this trial, not a user requirement or
platform necessity. Project cwd/cache/state/log storage and credential storage
are separate concerns. The official [authentication guide](https://learn.chatgpt.com/docs/auth)
documents reuse of cached CLI/IDE login, but does not establish that this Mac's
current desktop App session is the same cache. Reusing existing official auth
should be checked before proposing a new login. No default desktop/CLI auth
inspection, configuration change or login was performed here. Redirecting runtime
state/logs while retaining default auth is an option to qualify separately using
the official [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
An isolated browser login would add persistent cached access unless an applicable
ephemeral flow is used; it requires a separate user decision and was not started.

If authentication is available, Codex chooses the tool calls and ROI arguments;
the harness does not dictate their sequence or pass expected numerical answers.
A second question continues the same thread using actual previous tool results.
`report.json`, `audit/tool-audit.json` and provider `workspace/requests/` retain
thread/turn/call/request/object relationships, source hashes and final messages.
The audit is an operational trace, not a replacement provider journal or a
crash-atomic transaction/restart service. Cross-process resumption is not enabled.

## Current evidence and remaining scope

The local provider trial produced full-frame mean 210 and population stddev
100.4987562112089, then left-half mean 110/stddev 10; these agree with the public
fixture's independent analytic values. Two text turns retained one thread. The
operator must distinguish those actual provider facts from the scripted peer's
choices and final wording.

The official attempt initialized and closed normally, but the configured external
runtime reported `authenticated=false`, `requiresOpenaiAuth=true`. Zero model
turns were attempted. Existing authorization must be confirmed by the user through
an approved official flow before retrying; this increment creates no persistent
access and does not inspect or copy credentials. It does not assert the desktop
App is signed out.

Real Codex tool choice, result-dependent continuation and final analysis remain
NOT_TESTED because of that authentication blocker. Image sending remains closed
and its blocked independent review was not retried. GUI approval, image vision,
research-lead validation/Panel CAS adoption and full research completion remain
outside this increment. Proceed to the real text-tool run only after the actual
authentication requirement is addressed within the user's authorized scope.
