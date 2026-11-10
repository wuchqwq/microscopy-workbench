# Local ROI → question → source statistics

This composes existing workbench actions; it does not connect local questions to
Codex, send images, accept answers as leads, or change scientific definitions.

1. Select a spatial rectangle, then choose **查看选区并提问** in the existing
   selection toolbar. This explicitly invokes the existing ROI-view action,
   which can create a local crop/display version. It does not compute statistics
   or FFT, save a question, or start a model.
2. Only after the returned ROI view is adopted and its frame matches does the
   existing local question editor open. A pending/unadopted result is retained
   for normal handling; the action is not repeated automatically.
3. Enter a question and **应用问题**. If an existing question has the same wording
   but another saved context, the explicit ROI-question action prepares a
   context-only draft; it still needs Apply or Cancel. The prior recorded
   question remains unchanged until Apply. Use **保存工作区** for a savepoint.
4. The editor shows the saved display's source-pixel range where available.
   A temporary selection does not silently change a recorded question's scope.
   Original floating selection and processing support retain the existing
   provider/journal meanings; the displayed mapping is not a new ROI contract.
5. **回到提问来源，查看同帧统计** returns through existing guarded saved-view/window
   navigation, verifies the same recorded question and source frame, then opens
   the existing statistics-history dialog. If already at the source, it does
   not reload the view or replace its selection.

Statistics history contains the existing same-frame records, including other
ROIs/input versions. They are not automatically evidence for the question. Use
each row's original request, object, ROI and input inspection/navigation actions;
lead/evidence adoption remains an explicit existing workflow. No record is
recomputed or adopted by opening this dialog.

`ResearchQuestion` remains version 1: text, context object, frame object and UTC.
The new ROI question uses the existing saved ROI view as `context_object_id`;
it does not append a guessed selection ID, change provider metadata or create a
second provenance store. Typed question drafts, observation drafts, unsettled
results and source guards are preserved. A question changed during navigation
prevents the shortcut from opening statistics under the old intent.

Validation is offline: compiled handlers with deterministic DOM/canvas/API
substitutes and focused presentation tests. Actual Electron layout, mouse flow
and close/save remain unaccepted pending normal permissions. This feature does
not retry localhost listeners, Electron control or blocked image review.

## Applied lead → exact saved statistic

From an applied manual lead, **核查这条原统计** revalidates that lead's
saved evidence reference, then opens the existing statistics-history dialog
with only the exact result. Result ID, original request, input/frame IDs and
all three manifest/statistics hashes must match. The row keeps the existing
ROI, numerical readouts, provenance details and **查看统计时的原图输入** action.
Normal history entry points continue to show the same-frame list.

This inspection does not change the current question, select evidence, create
another lead or compute new statistics. Historical/withdrawn proposals retain
their original question and meaning. Drafts and unsettled sources block the
shortcut. A missing, changed, duplicate or truncated-out reference shows no
substitute result; the existing read-only trace and source actions remain
available where their own validation permits. Native Electron interaction is
still unqualified; regression uses the compiled UI with offline DOM/API stubs.
