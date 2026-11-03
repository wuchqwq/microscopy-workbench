# Issue 116: image-first canvas chrome

Base: `9156543` (parent #111). This is an incremental TypeScript frontend layout change. The existing multi-window editor, immutable science objects, request recovery, source identities, workspace save contract, navigation leases and camera metadata remain authoritative. No React or replacement window manager is introduced.

## Action audit

Paths below are relative to `ui/image-panel/` unless stated otherwise. Line references describe the base commit.

| Action | Existing handler and effect | Writes / target change | Existing guard to preserve |
| --- | --- | --- | --- |
| Back / forward | `app.mts:423,944,981`; `user-workflow.mts:56–71` | Existing saved object; no FFT | Visible target activates its existing window and parks work; other targets require clean draft before `show`. Busy, gestures, pending and unresolved requests block. |
| Return to spatial observation | `app.mts:417–421,983` | Exact saved FFT input, original ROI/reason/calibration; navigation lease changes | Requires verified `spatial_return.ready`; dirty, pending, gestures and unresolved original request block. Never substitute latest ROI or a new preview. |
| Latest ROI | `app.mts:273,364,892` | Explicit latest retained spatial observation object | Appears only when different latest ID exists; clean draft, idle and no pending result required. |
| Original / full frame (new display) | `user-workflow.mts:71`; `app.mts:423–429,982` | Reopens a known full-frame view, otherwise creates `image_preview` through `source_view:true` | Preserve dynamic “new display” label and navigation guards; no invented old display recipe. |
| View selection | `app.mts:808`; `user-workflow.mts:30` | New spatial/frequency `image_preview` object; no FFT | Valid rectangle in supported domain; existing action/draft/pending protections. It is not camera Fit. |
| Window list | `window-workspace.mts:169–178,223` | Menu is presentation only; activate/reopen changes editor; close retains work/science | Preserve park/context/CAS/readback in `app.mts:184–211`; first passive-image click only activates. |
| Results and history | `app.mts:39–45,90`; `execution-history.mts:16` | Opening lists/dialogs is read-only; showing a historical object uses protected `show` | Keep adoption and workspace Save explicit; menu opening must not adopt results or create science. |
| Undo / redo | `app.mts:386–409,831` | Selection/display draft, or compensating annotation version; historical records remain | Matching workflow scope and expected annotation values; do not reinterpret as view navigation. |
| Fit | `app.mts:823`; `window-workspace.mts:126` | Camera preference only; no scientific dirty state | Preserve switch locks and existing camera intent; no object navigation. |
| Tile, preserve zoom | `window-workspace.mts:180,196` | Window layout metadata only | Requires multiple visible windows and wide multi-window mode; preserve camera. |
| Tile and Fit all | `window-workspace.mts:181,198–209` | Layout and cameras only | Wait for qualified saved assets; abort on object/gesture/camera-intent change. No calculation fallback. |
| Continue with Agent | `app.mts:895–914` | Confirm draft/state/multi-ROI handoff, then display copyable prompt; no model wakeup | Preserve panel/helper/generation/object/draft/collection checks; dirty or pending blocks. |
| AI handoff of selection | `app.mts:808`; `tools/image_panel.mts:564` | Records explicit current selection handoff; no scientific object or model wakeup | Valid selection and existing action guard; distinct from multi-ROI continuation. |
| Complete spectrum | `app.mts:827`; `user-workflow.mts:27` | New display execution version of existing FFT array | Frequency view only; retain existing preview/draft/pending handling. Not return-to-space. |

Backend `tools/image_panel.mts:434–443,512–516` checks expected object, draft revision and window collection revision before adopting navigation, then advances the navigation lease. Moving controls must reuse these handlers.

## Minimum layout

```text
Source / frame                         Save workspace · save state
Tools | Back Forward Current view [Return spatial]  Observation  Results/history  View  Windows  Agent
      |                                                                                |
      | Existing image windows: active scientific editor + retained comparisons        | Properties
      |                                                                                | position / size
      |                                                                                | name / measurement
      |                                                                                | folded style/settings
      | ROI + selection summary                 View selection FFT Measure [context]
      | Status                                                Undo Redo · zoom
      | Data results · count                                      compact summary
```

- One canvas contextbar replaces the separate research, navigation and window control rows. Return-to-spatial stays visible for FFT. Its unavailable reason remains visible when needed.
- “Results and history” groups low-frequency object navigation, new display versions and existing evidence, with labels separating these meanings. Move existing controls without cloning IDs.
- “Windows” contains both tile variants, single/multiple-window mode and existing window rows. Keep the five-visible-window limit and retained closed windows.
- Camera Fit stays on the left toolbar; its existing secondary entry and image focus move into “View”. Undo/redo remain editing history.
- An independent on-demand Agent menu contains both existing handoff actions. No automatic model launch.
- Selection-specific scientific actions remain beside the selection summary below the image. `#selection-fft-relations` is an empty integration anchor for separately implemented related-result navigation.
- Figure tools move into the existing advanced settings. Position, dimensions, name and measurement lead object properties. Color/status live in a folded style group with the existing fields still mounted once.
- Bottom results retain an always-available compact summary; expanding uses the existing bounded result content and resizer. No default automatic expansion is added.
- At narrow widths, the contextbar may wrap but menus overlay the image rather than consuming a new persistent row. Existing bounded drawers remain mounted; changing layout does not Fit or alter selections.

Existing transient menus remain outside saved `ui_panels`. New View/Agent menu dismiss/focus behavior is integrated in `app.mts` separately. Existing IDs and button handlers must remain intact, including the hidden window collection wrapper used by the window manager.

## Bounded verification

For the HTML/CSS change: verify unique IDs, existing handler-target IDs and field mounting, document/CSS structure, and the explicit menu placements. Run only focused affected engineering checks after behavior integration. Scientific computations, browser/window operation, user usability, production image screenshots and full suites are outside this static change's evidence scope.
