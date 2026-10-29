# Reusable reconstructed-sequence observations

This R2 increment extends the installed MCP + Skills package from PR #9. It
records selected scientific frames, verifies bounded coordinate correspondence,
and composes existing FFT, peak and measurement operations. It does not run
ptychography reconstruction or infer material identity. The tools are optional:
existing single-image calls remain usable directly.

## Three formal interfaces

All writes require a caller-saved `request_id`. `image_info` reads the immutable
object; `image_result` queries its original request across client sessions. The
configured image workspace and ordinary provider journals remain authoritative.

| Tool | Inputs and output |
| --- | --- |
| `image_sequence_create` | `frames:[{object_id,label?}]` in explicit order, 2–8 existing real spatial frames; `axis:{meaning,source_text,step?,unit?}`. Returns frame/source identities, scientific shape/dtype, array hashes, signed calibration and source records without copying arrays. |
| `image_region_correspondence` | Saved `sequence_object_id`, `reference_index`, half-open `rect`, and `mode:identity/translation/estimate`. Returns a row per frame with actual source coordinates, evidence and status. |
| `image_joint_observations` | Saved `correspondence_object_id`, explicit FFT/peak settings and frequency tolerance. Returns ordinary saved per-frame views, FFTs, peaks, measurements and geometric correspondence evidence. `previous_observations_id` reuses unchanged science; `measurement_overrides` consumes explicit revised measurements. |

Consult the installed `tools/list` for exact bounds. A frame's `frame_index` in
these records is its position in the selected sequence. `source_frame_index`
retains the original file index. Labels are human convenience, not identity.
Separately imported planes may be selected explicitly; shared shape alone is
not evidence that they show the same physical region.

Axis meanings are `time`, `reconstruction_depth`, `defocus`, `tilt`, `iteration`,
`repeat` or `unknown`. The source statement is retained as supplied, not certified
independently. Step and unit must be supplied together. Missing step stays null;
neither file numbering nor nominal reconstruction depth becomes physical depth
resolution. Intensity semantics, XY scale and sequence semantics stay separate.

## Coordinate correspondence, not forced registration

`identity` needs an explicit `source_text` describing why the grids correspond.
`translation` additionally accepts `translations:[{frame_index,shift_xy}]` with
integer pixel shifts. The convention is **target XY = reference XY + shift XY**.
These modes retain their user-stated basis; accepting a declaration does not
independently prove physical correspondence.

`estimate` searches bounded integer shifts using SciPy normalized template
correlation. It preserves multiple separated maxima and uses explicit minimum
correlation/margin. Repeating patterns can remain ambiguous. No interpolation,
scale fit, mirror, elastic warp or source-array mutation is performed. An
automatic estimate is evidence of template agreement, not proof of atomic
continuity or absence of local change.

| Status | Consequence |
| --- | --- |
| `VERIFIED` | Full ROI has a declared or numerically accepted coordinate mapping; inspect the recorded basis. |
| `UNVERIFIED` | No sufficient shared-grid or shift statement; no automatic science on this row. |
| `AMBIGUOUS` | Competing translations or non-informative data; no arbitrary choice. |
| `OUT_OF_VIEW` | Complete mapped ROI cannot fit; no silent clipping. |
| `INCOMPATIBLE` | Calibration/grid requirements differ; no hidden rescaling or mirroring. |
| `UNMATCHED` | Available numerical agreement is below the declared criterion. |

Physical XY scales are compared with signed axes and explicit unit conversion.
Both absent scales permit pixel-only geometry. Mixed known/unknown or unequal
scales are not silently treated as physically comparable.

## Joint evidence and revisions

Only verified rows are processed. FFTs, numerical peaks and committed
measurements come from the existing provider implementations. Geometric matching
uses actual signed wave vectors and a declared cycles/pixel tolerance, not peak
rank or label. Unmatched extra peaks, absent detections and multiple matches are
retained. Non-detection is not proof that a reflection or structure is absent.
The table does not average frames or interpret intensity changes as a unique
phase, twin, defect or independently replicated confidence.

Opening the joint object in the existing Panel shows its saved evidence table
and per-frame original/ROI/FFT navigation. The Panel distinguishes the reference
frame, user-declared mappings and bounded numerical correspondence alongside the
unchanged status values; missing basis remains unknown. `VERIFIED` alone does
not establish physical identity or continuity. Its individual saved views are also
usable by Figure Composer. The contact image is display only. After a
GUI correction, save the changed scientific anchor with an ordinary measurement
revision and pass those measurement IDs as overrides. This avoids treating an
old detector table as the moved observation. Changing display parameters does
not change a saved measurement or complex spectrum.

Save `sequence`, `correspondence` and `observations` in a named AnalysisContext
using `provider:"image"` (the configured provider alias).
Reopen with `analysis_read`, then `image_info` and `image_panel_show` for a live
Panel (or `image_panel_open` when none is running); no FFT is
needed to reconstruct chat history. Context CAS revisions keep late results
historical instead of overwriting a newer selection. Query the original joint
request with `image_result` when a batch stops: its partial-result summary exposes
known child request identities and states. Query those existing child IDs if
needed. A missing child was not submitted, and an unknown batch is not
automatically replayed.

## Reproduce software acceptance

Use the same independent image Python environment as the normal package, with
NumPy, SciPy, tifffile and Pillow. No GMS installation or optional simulator is
required. The public fixture generator has a new-output-directory requirement:

```sh
python examples/make_sequence_trial.py /absolute/new-public-fixture
```

It creates three uint16 frames with integer translations, distinctive texture
and an additional local tone in one frame, plus a separate periodic ambiguity
control. `oracle.json` records the independent generator truth and hashes.
The data is explicitly synthetic and is not a reconstructed experimental sample.

The reusable protocol smoke is:

```sh
MICROSCOPY_PYTHON=/absolute/venv/bin/python node tools/smoke_sequence_plugin.mjs
```

On PowerShell set `$env:MICROSCOPY_PYTHON` first. To retain public evidence and
Panel connections, set `MICROSCOPY_SMOKE_OUTPUT` to a new absolute directory.
Its report separates actual MCP/Python/HTTP execution from real browser and
fresh model-session acceptance. Those latter scopes are recorded separately;
a valid PNG or HTTP response alone does not prove a model saw or used it.

Supported inputs are existing admitted real spatial frame objects. Float inputs
retain their dtype when admitted by the current reader. This increment does not
expand TIFF admission or silently derive real components from complex planes.
Multi-phase/global indexing, twins, defects/GPA and new reconstruction algorithms
remain outside R2.
