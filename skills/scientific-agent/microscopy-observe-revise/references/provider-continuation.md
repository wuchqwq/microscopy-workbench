# Optional provider and Panel continuation

Use these details only when the task actually needs the interactive Panel or an
existing retained session. The direct image-and-question route does not require it.

For mouse selection, call `image_panel_open` on the selected saved view and give
its returned URL. On “look here” or “continue”, read `image_panel_current`; retain
panel ID, current view/object, draft revision, exact selection, source panel and
domain. Resolve several panels by the retained ID, not recency. The Panel does
not automatically wake Codex.

Spatial processing uses source-pixel half-open edges. Saved FFT points are
cycles per original pixel or the exact declared provider coordinate space, not
PNG pixels. Commit a bound sparse `annotation_edit` with `image_annotate` before
measuring the changed anchor. An arrow's shortened drawn tail is not its endpoint.

Present an already saved result with `image_panel_show`, binding the object and
draft revision read before work. Queued is not accepted: preserve newer drafts,
let the researcher accept, and read again after a conflict. Do not manufacture a
newer revision or call a historical result a fresh observation.

For an externally computed FFT belonging to a saved ROI observation, retain its
exact saved spatial view and stable ROI annotation ID. Use its outward source
support and save/query the original FFT request. Then attach the existing
`input_reference` of kind `provider_fft` with that request, source view and
annotation to `image_panel_show`. The provider rechecks the actual operand,
range and calibration. This post-result association does not claim the GUI
dispatched the FFT, and a different/newer ROI cannot be attached to an old FFT.

A saved FFT can be re-rendered or zoomed with `image_preview.frequency_rect` in
its original fftshift-bin grid without recomputing the complex array. Zoom adds
no frequency resolution. Source changes, not display changes, invalidate anchors.

`image_info` reads a saved immutable object, not a live microscope. If a user
explicitly selected a separately qualified DM backend, obtain a fresh bounded
capture for a live edit; never query an old capture and call it current. A failed
native call does not authorize an external substitute.

Export exact selected revisions with `image_export` to a new directory whose
parent already exists. NPY is scientific data; PNG is a display and annotations
are separate. Keep parameter/provenance records and do not overwrite the original.
An export copy does not replace saving the continuing workspace or prove that
the client/model viewed its image. See the skill's CAS/original-request rules
before advancing any current reference.
