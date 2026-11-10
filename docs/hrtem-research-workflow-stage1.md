# Research workflow: first stage

Start with a question or a qualified saved image. A researcher does not have to
draw or save an ROI before Agent can inspect the context and propose useful
observations. Tools that need a region still require their existing explicit
inputs; this change adds no scientific computation or new Agent engine.

## Desktop flow

1. Open an existing analysis workspace in Electron. Open **观察与证据**.
2. Enter **当前研究问题**, then **应用问题**. This records research intent and
   its exact saved view/frame, not a tested hypothesis. Leaving the question
   empty is also valid: Agent can begin by inspecting the qualified full image.
3. Use **同帧已保存 ROI 统计** to inspect existing results. Each qualified row
   offers **查看统计时的原图输入**, using its saved input object ID. The row's
   bounds describe the historical measurement support. No current annotation
   is selected or identified by matching those bounds, and no statistics run.
   Existing window and source/FFT controls expose the corresponding saved FFTs.
4. Use **准备 Agent 接续** or **Agent → 交给 Agent 继续**. The prompt retains
   the question's original context, qualified source/FFT references, unknowns
   and the instruction to distinguish hypothesis, supporting/opposing evidence
   and next steps. Copy it to the connected Agent; the desktop does not wake a
   model automatically. Existing MCP `image_panel_current` exposes the same
   applied question, while existing scientific tools remain directly callable.
5. **Ctrl+S** publishes the workspace savepoint. Close and reopen normally to
   retrieve the question with its original context. **返回提问时的保存图** uses
   that exact reference. Switching to another view never retargets the question;
   a different source frame cannot silently inherit it.

Unapplied question text is local input: apply or withdraw it before handoff,
workspace save or close. An uncertain apply is read back explicitly with
**核对应用状态**, never automatically replayed. Existing scientific dirty,
busy, pending-result, unresolved-request and source qualification gates remain.

## Persistence contract

Optional `research_question`, version 1, contains exact untrimmed nonempty text
(up to 2000 UTF-16 code units), `context_object_id`, `frame_object_id` and backend
`recorded_utc`. Blank input explicitly clears it. It is editable workspace
metadata, not a provider object, scientific result or authenticated observation.
Updates require the current object/state/draft/collection and working revisions.
Savepoints hash the content and both referenced manifests; save/restore also
verify the context-to-frame relationship through the existing provider reads.
Legacy savepoints without this field retain their original content hash shape.
No old file is migrated, rewritten or silently resaved.

## Remaining increments

The next implemented increment is described in
[Question-bound descriptive research leads](hrtem-research-leads.md).
It connects explicit proposals to existing statistics and original inputs;
the first-stage guarantees below remain applicable.

This stage connects question, existing evidence access, Agent handoff and exact
source navigation. It does **not** persist a hypothesis/evidence ledger or claim
that arbitrary free text was automatically understood or tested.

The next bounded increment should attach researcher/Agent-proposed hypotheses,
supporting/opposing/unknown entries and a chosen next action to existing saved
result/request IDs and source images. A subsequent increment can organize those
entries into a revisitable analysis lead and return Agent results to that same
question. Both should reuse current providers, immutable evidence and explicit
adoption gates rather than copy scientific state or add another execution engine.
Period, contrast, topology and material interpretation must retain their distinct
validity domains throughout; a numeric result alone does not settle the question.
