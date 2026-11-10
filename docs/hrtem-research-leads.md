# Question-bound descriptive research leads

This stage connects one applied question to a proposed hypothesis, explicit
supporting/opposing/unknown relations to saved statistics, remaining unknowns,
and a next-step plan. It adds no algorithm, automatic model call or scientific
validation. Existing tools remain independently callable without a manual ROI.

## Electron workflow

1. Apply a question in the research sidebar, or continue an existing one.
2. Choose **用已有统计整理线索**. The editor reads existing same-frame spatial
   statistics, shows their actual bounds/values, and preserves original IDs.
   Alternatively, open **已保存 ROI 统计历史** and choose **用于当前研究问题整理线索**
   on a result. It rechecks and preselects that exact reference, including an older
   result outside the latest 32. It does not compute, infer a relationship or
   accept a lead. Changed source/question, invalid references or unsettled inputs
   refuse the handoff. CLI-created statistics use the same committed history;
   this shortcut adds no CLI question/lead editing command or AI call.
   During qualification only progress/cancel are shown. If qualification fails,
   that preparation dialog closes and history shows the cause and how to reselect.
   Cancelled/older reads cannot close or report errors into a newer editor.
3. Enter a hypothesis or interpretation proposal. Identify its proposer as
   researcher or Agent (caller reported, not authenticated).
4. Select 1–8 results. Explicitly choose supports/opposes/unknown and explain
   how each participates. These relationships are proposals, not computed tests.
   A pairwise comparison should say that both windows are needed; a single
   scalar does not independently establish a contrast mechanism.
5. Record unknowns and what to inspect next. The plan is labelled unexecuted.
6. Apply, then Ctrl+S. Reopen the workspace to continue the same lead.
7. Each entry rereads its exact saved reference. **返回准确原图输入** revalidates
   again before opening that historical input. No current annotation is selected
   by matching bounds. Expand the readonly result/request/hash details to audit.

Cancel/Escape discards only settled local editor input. A known rejected update
keeps the input editable. A lost response retains the exact original command,
lead ID, helper-instance identity and CAS revisions. Plain GET absence is not a
terminal result and cannot unlock cancel/save/close/handoff.

**核对并封存原提交** is an explicit coordination POST, not a readonly GET and
not a replay of the original write. It enters the same serial workspace queue.
After checking the exact original envelope and current persistence status, it
compares the complete proposed content (or withdrawal) with current metadata and
ensures state_revision is strictly greater than the original expected revision.
If equal, it advances/persists that runtime revision without changing semantic
content. All original writes require the same helper-instance session ID and
exact state CAS. State revisions never decrease within a live helper; a new
helper has a different research_lead_session_id. Thus an original command that
arrives after this acknowledged fence cannot mutate metadata, including after
close or helper restart. No scientific request or savepoint is generated.

Each explicit Apply has a fresh lead_attempt_id; transport copies keep that same
attempt ID. Exact create/withdraw envelopes retain per-helper terminal receipts.
The same attempt ID with different content, action or CAS scope is a conflict;
it cannot replace the original envelope or reuse its success. A fenced attempt
can only be reconciled, not admitted as a new write.
A duplicate delivery of an already applied envelope returns that original success
without another mutation, rather than a stale-CAS not_applied claim. A recorded
validation refusal remains the same refusal; persistence not confirmed stays
unknown. If an originally applied record has since been explicitly discarded or
changed, the duplicate is refused for unresolved currentness and must be
reconciled, not reported never-applied or re-executed. The receipt cache is bounded
to 256 commands with no eviction; at capacity new writes are refused until a clean
reopen. It is not scientific state and no old savepoint is migrated.

An exact matching record resolves as applied. Otherwise the terminal receipt is
not_present_fenced: no matching current record, and that old command cannot apply
later. This does not assert the command never ran historically (an explicit
workspace Discard may have removed an earlier unsaved proposal). Input stays
visible and editable; the researcher may cancel it or explicitly submit a new
attempt with fresh CAS. Creation receives a new lead ID when re-editing after a
fence. The original payload is never automatically resent. A lost fence reply
stays unknown; repeating only the fence can confirm the terminal state without
repeating the original write. A different helper, malformed/future scope,
unconfirmed persistence or identity mismatch remains fail-closed.
Question/lead drafts share the existing unload, close inspection, native close
and Agent handoff gates. Recovery, invalid adopted proofs, busy/dirty/gesture,
pending results and unresolved requests retain their existing protections.

## Ownership and history

An applied lead stores the exact question snapshot (including source view,
frame, text and application UTC). Reapplying or editing a question creates a
different snapshot, even if its text looks similar. Old leads remain historical
and are never automatically rebound or promoted to current support.

Leads are append-only proposals, with an explicit
withdrawal record: withdrawal retains the original question, evidence references
and text, adds a UTC/reason, and does not retract or edit scientific results.
Corrections can be a new proposal and an explicit withdrawal of the old one.
As with other working metadata, the explicit workspace Discard operation can
restore the last savepoint and discard changes that have not been explicitly
saved. Save first to retain a proposal across a deliberate workspace discard.
This first bounded history allows 16 leads, at most 8 evidence entries each;
the composer offers at most the latest 32 historical statistics and reports the
display limit. It does not silently delete older records.

## Reference and save contract

Optional workspace metadata research_leads version 1 contains no copied numeric
observations, images, arrays or provider execution state. Each advisory statistics
reference pins result ID, original request ID, input view ID, frame ID, and
result/input-manifest/statistics-payload SHA-256. Creation requires exact current
object/state/draft/collection and workspace CAS revisions, the same applied
question/frame, and a fresh successful existing statistics reader.

Advisory IDs use result_id/input_view_id/frame_id. Their expected hashes are part
of hashed workspace content, and the readonly resolver checks them independently
on each evidence read. Missing or changed advisory references become unavailable;
old values are never displayed from the metadata, recomputed, or substituted.
This permits retaining/withdrawing an unverifiable proposal. It does not weaken
the existing strict scientific savepoint references. Question context/frame
manifests remain strict dependencies, including historical questions. If a core
workspace dependency itself is invalid, the existing strict restore may reject.
Legacy savepoints with no research_leads retain their original hash shape.

MCP current returns the same metadata with explicit caller-proposal/unexecuted
plan and not-revalidated-reference semantics. Its ordinary state read does not
claim to resolve evidence. The external Agent handoff includes the lead history
and instructs the caller to check currentness, withdrawal and original references.
The desktop does not automatically wake or invoke an Agent.

## Limits

Only committed same-frame spatial statistics are supported as evidence in this
stage. FFT/GPA/topology, physical interpretations and their existing validity
domains are unchanged. Intensity units remain undeclared where the original
result did not declare them. Comparable thickness/orientation/composition,
causal contrast mechanisms, material strain, phase and real defects are not
established by a proposed relationship or readable file. No real-dislocation
confirmation workflow is resumed.

Same-frame A/B windows are not independent repeat experiments. Spatial, FFT,
phase and other derived presentations of the same input remain related. The
number of linked entries does not add independent experimental weight. Preserve
original image, window, reference and processing provenance when interpreting
these proposals. This stage implements no evidence-independence determination,
automatic weighting, automatic hypothesis test or broader evidence inference.
