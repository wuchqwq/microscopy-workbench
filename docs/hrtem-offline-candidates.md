# Offline candidate review slice

This is a local synthetic-response demonstration, not an AI/model integration.
No network model call, account, credential or automatic inference is implemented.
The explicit origin label is caller-reported, not authenticated model identity.
It does not resume real-dislocation analysis.

## Electron workflow

1. Reopen an analysis workspace and apply a same-frame research question. No
   manually drawn ROI is required. Existing statistics may be reused.
2. Open **观察与证据 → 离线候选演示 → 准备离线上下文**. Expand the readonly
   packet to inspect exact sources. Nothing is sent externally.
3. Generate a labelled synthetic response, optionally a suggestion with no
   evidence. Preview the original readonly proposal, then save it as a
   **pending candidate** and explicitly save the workspace with Ctrl+S.
4. **核对来源并编辑 / 接受** explicitly requalifies the original immutable scope.
   Within this editor, inspect either saved input and its original ROI/statistics.
   That local readonly popup does not navigate the active canvas or discard edits.
   Closing the popup returns to the same candidate and edited form. Edit the
   hypothesis/interpretation, each included observation's support/opposition/unknown
   relation and reason, unknowns, and the unexecuted next-step plan. Saved ROI
   coordinates, numeric statistics and undeclared intensity units are readonly;
   exact result/request/input/hash details remain expandable. IDs are not inputs.
5. Accept an edited proposal or cancel editing. Cancel changes no saved candidate.
   Acceptance rechecks the exact evidence again and enters the existing lead
   commit/save contract; it does not execute the next-step plan. A pending
   no-evidence suggestion cannot pass the existing 1..8-statistics lead contract.
   It can remain pending or be explicitly rejected with a reason.
6. Save and reopen. Original response and binding remain separate from the edited,
   accepted lead. Reopening changes helper/CAS leases: explicitly review again;
   old runtime receipts cannot authorize a new write. If question, active source,
   selection, processing or retained source scope actually differs, return to the
   original saved context or explicitly prepare a new context. Never auto-rebind.

## Boundaries and reuse

- Local context uses at most 8 fresh validated same-frame statistics and a 48 KiB
  packet limit. It whitelists numeric diagnostics, source-pixel windows, component,
  dtype, original result/request/input/frame IDs and manifest/payload hashes.
  Question-context and active-view manifests, source frame, selection, adopted
  proofs and retained window/source scope are bound. Only some question-text
  patterns are refused; permitted free text is preserved verbatim, not silently
  rewritten. The checks are not complete path, URL or secret detection.
- The whitelist does not automatically attach source-file path fields, capability
  URL/token fields, PNG or raw arrays. It does **not** guarantee that the whole
  packet is path-free or contains no sensitive content: questions, hypotheses,
  notes and other free text may include such content. For example the literal
  question `/var/tmp/private/sample.tif` is retained, while the existing checks
  refuse the tested `https://...` and `file://...` examples. These are synthetic
  strings, not requests to read those files.
- This slice stays local, sends nothing externally and does not connect a real
  model. Before any future external delivery, show the exact send preview and
  explicitly review free text and the intended data scope. The limited pattern
  checks do not replace that review or authorize transmission.
- Explicit source inspection displays a bounded saved PNG locally; it is not
  added to the default context or a model request. Window geometry matching never
  proves identity.
- At most 8 offline candidates are retained in optional version-1 workspace
  metadata. Legacy savepoint content/hash shape is unchanged when it is absent.
  Provider arrays, journals and result objects remain authoritative and unchanged.
- Candidates store the original question/binding/response; accepted drafts or
  rejection reasons are separate. Acceptance visibly prefixes the lead with
  **离线合成演示；研究者接纳；非模型输出**. This marker is not model authentication.
- Reuse existing full-envelope attempt receipts, helper-scoped CAS, serial writes,
  unknown-request fencing and close/handoff guards. Lost replies are reconciled,
  never automatically resent. Identical applied transport copies acknowledge the
  original success; altered copies conflict. A fenced late command cannot apply.
- Related spatial/FFT/phase presentations and same-frame A/B windows are not
  independent repeat experiments. This increment performs no evidence weighting,
  automatic hypothesis test, material interpretation or scientific computation.

The main editor uses bounded forms and observation cards over the unchanged
structured contract. Original response JSON and context remain readonly audit
details, separately from the researcher-edited accepted draft. Unsaved review
edits are retained while inspecting sources; explicit cancel discards those edits,
not the original pending record. The pending record itself is not silently edited.
Researchers may explicitly include only references already bound to the context;
acceptance still requires 1–8 qualified same-frame statistics. Old candidates and
accepted records use their existing format without migration. A real Agent adapter,
external-session continuity and actual model performance remain unimplemented.

## Focused checks

```sh
npm run build
node --test dist/tests/offline-research-ui.test.mjs
node --test dist/tests/image-panel-statistics-history.test.mjs
```

Use an explicitly authorized writable temporary directory for fixtures. The latter
suite includes actual localhost HTTP and requires permitted loopback access.
Synthetic UI/transport checks do not constitute Electron human usability, real
specimen physics, Mac, model or hosted CI acceptance. See the private execution
report for the actual native Electron coverage and exact command outcomes.
