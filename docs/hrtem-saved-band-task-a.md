# Task A: saved-band ROI comparison

This small API increment uses `image_method_plan` and `image_method_next` with
`information.goal="peak_roi_comparison"`. Select exactly one saved `fixed_g`
GPA object. Supply `roi_rect`, `reference_rect` (local FFT input grid, half-open
integer XYXY), and an actual `reference_text` or explicitly stated assumption.
All four existing budget fields may be zero: there is no new FFT/GPA/topology
run, and no executable method action. The decision records summary pixel work
and the plan records observed wall time; read/summary cost is not a free science
execution. `image_method_step` continues to reject non-scientific decisions.

Example information:

```json
{"goal":"peak_roi_comparison","roi_rect":[184,96,216,128],"reference_rect":[40,96,72,128],"reference_text":"Same-image left reference; working assumption"}
```

The saved decision has per-band mean amplitudes, ratios, amplitude-weighted
circular phase and coherence, ROI-minus-reference wrapped phase difference,
valid/invalid/low-amplitude counts and reasons. High amplitude but incoherent
phase retains the amplitude ratio and abstains from a single phase difference.
The exact signed saved g and stable object/band IDs are retained; no conjugate
reassignment, local plane removal, frequency refitting or displacement inversion
is performed. The common demodulated phase gauge is preserved.

`peak-comparison.txt` is a researcher-readable sidecar; `method-decision.json`
and the authoritative object/journal preserve the structured result. Read with
`image_info`/`image_result` or reopen the workspace. `image_method_next` may revise
ROIs/reference without changing the budget root or goal. Old topology plans keep
the existing policy version and reopening path. No new GUI controls are added.

## Scientific boundary

This is **not general raw-image HRTEM ingress**. It inherits existing GPA
admission: two independent reflections, filter support, reference-connected
phase support and edge guards. Its conservative validity is the saved **joint
two-band mask**, additionally excluding per-band low amplitude. Therefore a
poor second band can suppress a good first band's region. These are current
adapter/model boundaries, not physical specimen failures or universal Task A
requirements. An all-zero source is refused upstream as insufficient evidence;
a low-signal region abstains. Band amplitude is filtered complex-band amplitude
(half an ideal real cosine's amplitude), not raw fringe amplitude.

Summary guards (at least 9 valid pixels, 90% valid support, phase coherence at
least 0.9 for a single phase summary) are explicit deterministic guards, not
confidence estimates. Mask/filter/window sensitivity remains unquantified.
Neither successful comparison nor a phase change admits physical strain or
identifies a material dislocation. Task B and real-image dislocation work are
outside this increment.

## Focused verification

- `python -m unittest discover -s tests -p test_peak_comparison.py`: known phase
  and amplitude changes, unchanged carrier under moved windows, dark ROI,
  zero input, incoherent phase with preserved amplitude, immutable save/reopen,
  result query, revisions and source-array tamper rejection.
- Existing `test_method_*.py` and `image_method_journal_test.py` cover historical
  source/reopen, accounting, proposal and journal semantics.
- Build and method-loop/journal Node contracts exercise the provider schema.

No full GUI suite, real microscope qualification, real-image interpretation,
publication or merging is implied by these synthetic checks.
