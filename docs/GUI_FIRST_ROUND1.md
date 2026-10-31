# GUI-first round 1: researcher checklist and integration scope

This candidate is stacked on open PR #48 (`integration/manual-crystal-evidence`
at `95c40b9`). #44/#46/#47 remain its dependencies; none was merged by this work.
It changes presentation and bounded evidence handoff, not scientific algorithms.

## What to try

Use the separate Python environment and existing public fixture/inspector entry.
The Agent or operator opens an explicit supported image through the existing
tools or `npm run inspect -- --source ABS_FILE --workspace ABS_NEW_DIRECTORY
--python ABS_PYTHON`. No DM/GMS installation is needed. Configure the optional
structure provider explicitly for candidate comparisons; image-only operation
continues without it. Original pixels/files stay read-only.

1. Find the source filename/frame above the image. Fit/zoom/pan the original.
   Empty result tables start collapsed; results appear when an operation returns.
2. Draw a rectangle. Choose **保存当前 ROI 观察**, write why it matters, then
   **保存 ROI 观察**. Repeat for a neighboring region. Short ROI labels, original
   anchors and actual processing edges are separate; saving attention does not
   confirm a phase, twin or defect. Saved observations appear under **观察与证据**.
3. Read the signed XY scale and its provenance. Unknown/withdrawn scale permits
   pixel work, not invented nm/Å. Review any warning that outward integer-pixel
   rounding changed a drawn gap/corner into overlapping/touching FFT windows.
   This support geometry is not physical interface evidence.
4. Choose **交给 Agent 继续**, copy the generated prompt into a compatible,
   already connected Agent and state the scientific question/candidate inputs.
   Connection details are attached automatically; no manual IDs/JSON required.
   This is an explicit continuation handoff, **not automatic model wake or an
   embedded chat**. Unsaved selections/reasons are not committed observations.
5. The Agent uses existing tools and can attach a fully admitted comparison with
   `image_panel_evidence`. Open **观察与证据** to see conditional statuses, counts,
   actual comparison image, unmatched/ambiguous evidence and expandable records.
   **返回观察原图** and **查看 ROI…的已保存 FFT** open referenced objects, not new FFTs.
6. Select/measure a peak, drag its scientific anchor, then measure/update through
   the existing tools. A changed peak/ROI/scale marks old comparison evidence
   **待更新**. Label placement/Gamma does not change scientific measurements.
   Keep the old version; ask the Agent to revise only affected evidence.
   The FFT link prefers the atlas's existing measurement-bound marking view,
   admitted by exact ROI/FFT/measurement anchors. It never fabricates marks.
   **交给 Agent 继续** also works from that FFT: original observations are shown
   as references to another saved view, not projected onto frequency coordinates.
   The prompt includes saved revised-measurement references for continuation.
7. Refresh or reopen the owned Panel URL. Re-read current state before any Agent
   action. Query original IDs after timeout; a failed/unknown write is not rerun.
   A cold helper restart may retain an **unvalidated snapshot**; the Agent must
   reattach via full provider admission before calling it current evidence.

## Presentation contract

The old three Panel tool names/schemas remain unchanged. The optional new tool is:

```text
image_panel_evidence(panel_id, comparison_object_id,
  observation_view_object_id?, expected_object_id, draft_revision, request_id)
```

It is registered only with an explicitly configured structure workspace. It
calls the existing `structure_info` admission, checks saved evidence/PNG hashes,
then attaches a bounded presentation beside the image. A structure comparison
is never relabeled as an image-provider scientific array. Current source frame,
calibration, canonical ROI support and saved FFT identity are checked; stale or
unsaved input refuses. The browser's normal Panel token cannot forge an admitted
comparison; the parent uses a separate private attachment capability.

Original scientific request/object references remain authoritative. Presentation
IDs recover through the original Panel tool/arguments, not `image_result`.
Same-ID receipt recovery does not recompute or revalidate as a new operation;
use `image_panel_current` to inspect today's state. Unknown child computations
retain null counts/attempt receipts, not zero matches or a fake completed result.
Displayed detail limits show totals/omitted counts and full original references.
Known preflight failures retain their original error under the original request
ID. A reserved request whose submission is unknown is queried, never restarted.

The existing auxiliary selection record stores a bounded reference/number
snapshot, excluding PNG Base64. Inspector reopen labels it unvalidated; reading
local JSON alone does not requalify scientific evidence. Unsaved drafts, saved
observations, immutable science and display images remain different layers.
Known peak/calibration changes retain bounded pending references across source
navigation. An old comparison, a comparison omitting the latest measurements,
or a replacement FFT cannot clear them. Unresolved deleted-marker bindings stay
pending; an update must use explicit scientific identities, not label guessing.

## Small public trial

Generate a fresh public analytic fixture without launching a model:

```powershell
python tools/qualify_manual_crystal_agent.py --prepare-fixture F:/new/gui-fixture
npm run inspect -- --source F:/new/gui-fixture/operator-texture.tiff `
  --workspace F:/new/gui-inspector --python F:/your-scientific-env/Scripts/python.exe
```

Use new directories and your separate environment. The synthetic input's scale
is **X +0.0225 / Y -0.0225 nm/px**, explicitly a synthetic user statement, not an
instrument calibration. The two regions occupy left/right halves of a 192×96
image. Save a reason for each; use the generated candidate CIFs only as finite
hypotheses. See the existing [plugin configuration and actual model launcher](
MANUAL_CRYSTAL_WORKFLOW.md#reproduce) to connect the optional structure provider.
Ordinary image observation does not require it or a model session.

## Current research limits

Finite projection compatibility is not a unique material, 3D interface, twin
law or independent experimental validation. Original F3b/F4 policies, detector
negative results and qualification limits remain unchanged. The previous-atlas
cross-calibration continuation boundary from #48 still applies; no implicit
recomputation/fallback is introduced. Real specimens, human usability and the
broader GPA/topology interruption tasks in Issues #40/#43 are separate scopes.

See [the actual round-1 record](GUI_FIRST_ROUND1_ACCEPTANCE.md) for browser,
MCP, numerical, recovery and NOT_TESTED distinctions.
