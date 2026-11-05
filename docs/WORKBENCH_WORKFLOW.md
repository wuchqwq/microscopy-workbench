# A researcher-guided crystallography workflow

[English](WORKBENCH_WORKFLOW.md) · [简体中文](WORKBENCH_WORKFLOW.zh-CN.md) · [Project overview](../README.md)

This guide describes the working relationship between the researcher, an optional AI Agent and the scientific provider. It follows merged main [c69424ac](https://github.com/wuchqwq/microscopy-workbench/commit/c69424ac25a35efd816d68cacd5904f5381c7485). It is a usage guide, not a new experiment or acceptance report.

## Roles

- **Researcher:** defines the question and available specimen knowledge, checks source/calibration, selects or corrects ROIs and observations, and reviews the scientific interpretation.
- **Agent + Skills:** reads the actual MCP schemas and saved context, selects appropriate tools, runs authorized bounded steps, retains alternatives and explains what is missing. The Agent manages internal object/request IDs.
- **Scientific tools:** perform explicit numerical operations and save their inputs, parameters, results and original requests. A language-model answer never substitutes for a numerical result.
- **Image Panel / CLI:** inspect and edit the shared workspace through their existing guards. Displaying a result, adopting a working reference and explicitly saving an analysis are different actions.

The Agent can automate a meaningful sequence without asking the researcher to click every peak or approve every numerical step. It must still stay within the user's task and client permissions, surface missing information, and stop when its budget or evidence is exhausted.

## 1. Start from the actual source

Use the [setup guide](CLIENT_SETUP.md) to open a supported file in an independent workspace. Select the exact dataset, frame and, where needed, scalar plane or complex component. Check dtype, axes, source hashes and signed calibration. A thumbnail is display data, not the scientific input.

Unknown scale permits pixel-domain observations. It does not permit invented nm/angstrom values, an assumed strain-free reference, or interpreting a frame index as physical depth. The core works without a live DM connection; an imported DM file is not DM-native execution.

## 2. Explore directly, then hand off when useful

For local exploration, select an explicit real-space ROI and run FFT directly. **An observation reason and an explicit workspace save are not prerequisites for basic ROI → FFT.** Move/resize or add another ROI as needed; the existing FFT keeps its original floating ROI, integer support and preprocessing.

For a guided Agent investigation:

1. Identify the intended ROI(s) and save an observation/question when using the observation route.
2. Use the explicit Agent handoff. The Agent reads the exact current Panel, ROI anchors, source/calibration and available saved FFT/measurement references.
3. State the scientific question and a bounded scope. For example: compare the local reciprocal geometry of two selected regions, reuse verified FFTs, retain unmatched peaks, and report what further evidence would distinguish the remaining hypotheses.

The handoff is for an already connected client. It does not launch a model or make every window a separate active editor. Historical FFT inputs and the latest working ROI can differ; neither should silently replace the other. See [image windows and multi-ROI handoff](IMAGE_FIRST_WINDOWS.md).

## 3. Choose only the needed analysis

| Question | Existing path | Interpretation boundary |
| --- | --- | --- |
| What local periods or reciprocal directions are visible? | Saved ROI → FFT → numerical peaks → explicit measurements | Maxima, harmonics, conjugates and artifacts need review; conjugates are not independent evidence. |
| How do two selected regions differ? | Saved atlas / local signature comparison / manual crystal route | Finite geometry and supplied hypotheses, not automatic phase segmentation. |
| Is an explicit structure/orientation compatible? | Qualified structure tools and finite general/twin comparisons | Keep unmatched reflections, competing models and model qualifications; compatibility is not identification. |
| Where should a bounded spatial investigation continue? | Multiscale fields, candidate domains and budgeted active follow-up | Unsampled support remains unknown; automatic image-feature proposals are experimental. |
| What projected displacement or strain follows under stated assumptions? | Qualified saved FFT → classical single-domain GPA | Reference, mask, metric and pseudo-strain limits remain explicit. |
| Is projected winding consistent on deliberate circuits? | Saved wrapped GPA bands → versioned topology evidence | Conditional projected closure, not a unique 3D Burgers vector or confirmed dislocation. |
| What changes across selected frames? | Explicit sequence meaning and ROI correspondence → joint observations | Frame order is not depth/resolution, and equal dimensions do not prove correspondence. |

Methods are composable, not a mandatory pipeline. Optional tools must be advertised and their dependencies qualified before use. The Agent should request missing evidence or stop rather than force every image through all methods.

## 4. Review beside the image

Use source/FFT comparison and saved measurements to inspect the actual numerical evidence. A measurement line between two nonzero frequency points is a difference vector; it is not automatically a DC-to-reflection spacing.

After a human peak correction, read the committed coordinates and revised measurement. Rebuild only affected downstream evidence and retain old results as history. Reuse an unchanged qualified FFT rather than recomputing it to refresh a report. A changed ROI, calibration or peak version must not silently inherit an older result's current status.

Keep these statements separate:

- The requested operation completed.
- Its numerical/source prerequisites are satisfied.
- A physical interpretation is supported.

Completion or a clean provenance record alone does not establish the third statement.

## 5. Save, recover and continue

The workspace separates working edits, explicit savepoints, immutable scientific executions, display preferences and unresolved requests.

**Save A → edit B → FFT(B) → Don't Save → reopen A:** A's saved analysis returns. B's completed execution stays in history but is not adopted into A. Closing a subwindow removes its display, not its scientific objects.

After a crash, explicitly recover or discard unsaved edits. After an unknown scientific or save outcome, query its original ID. Timeout, cancellation or a vanished process does not establish that nothing executed. Reopening a Panel must not replay science.

For a stopped owned registered helper, follow [Panel recovery](INSPECTOR_PANEL_RECOVERY.md). Legacy unregistered archives and unsupported states retain their own limits. Reattached crystal evidence must be revalidated against current dependencies; an old card can remain `restored_unvalidated`.

The [CLI](CLI.md) can inspect exact saved ROIs, compare verified inputs, read execution history and query original requests. Known existing/unqualified or unresolved FFTs are not missing computations. Persistent source proofs can record/check explicit existing dependencies; recording, adopting and saving are separate. A retrospective proof never upgrades an originally unavailable FFT input into strict pre-execution reuse.

## Evidence and limits

Read [current status](DEVELOPMENT_STATUS.md) and the linked method reports before claiming qualification. Current documentation does not turn an unmerged STEM candidate, a blind-test result, a synthetic success or historical acceptance into a released capability. Native Windows interaction, macOS/Linux desktop qualification, real-specimen physics and clean-machine installation each need their own evidence.

Further contracts: [analysis workspace](ANALYSIS_WORKSPACE.md), [manual crystal route](MANUAL_CRYSTAL_WORKFLOW.md), [scientific result semantics](SCIENTIFIC_RESULT_CONTRACT.md) and [Agent guide](../README.agent.md).
