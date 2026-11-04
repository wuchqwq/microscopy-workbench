# One core with horizontal and vertical context

This optional extension reuses `image_spatial_atlas`; it adds no numerical
engine, tool name, global controller, Context role or phase classifier.
The [Agent workflow](../skills/scientific-agent/microscopy-automation/references/core-cross-windows.md)
connects existing discovery, local observations, comparison, review and context.

Pass one integer half-open core in `rects` and `cross_window` with
`selection_origin` (`researcher`, `agent`, `unspecified`) and `source_text`.
Optional `arm_lengths` are pixel lengths `[left,right,top,bottom]`; defaults
are each max(core width,height), a geometric proposal. At least one arm on each
axis must be positive. Explicit zeros permit disclosed one-sided edge support.
Out-of-frame or over-budget proposals refuse before FFT children; no silent
clipping/padding. Non-square cores keep their exact support.

The ordinary atlas regions are0=core,1=horizontal,2=vertical. The horizontal
rectangle retains the core y interval, the vertical its x interval; their
intersection equals the core. Each region retains its existing ROI, FFT,
frequency axes, array hash, calibration, peaks, measurements and detection quality.
Long windows share the core and are correlated; different shapes/window responses
require frequency-domain comparisons, not raw bin or amplitude subtraction.
Image-axis roles are not crystallographic directions. Unknown metric stays pixel.

Optional `discovery_object_id` and `candidate_id` must appear together and bind
the exact selected source/frame/calibration and core. Manual origin declarations
must agree; they remain caller-reported, not authentication or physical proof.
The immutable `cross_window_plan` and original request are checked on later reads.
Old rectangular atlas records and calls without this option retain their schema.

Use only region0 FFT/peaks/measurements for an exact-core `image_discovery_review`.
Regions1/2 are context, not the same scientific ROI, and that review refuses them.
Existing sparse feature/local-signature tools can consume these atlas observations.
Do not insert long rectangles into square-only spatial_field/field_extend plans.
Existing broad field and GPA method loops remain available for their own questions.

Use existing previous_atlas_id and full measurement_overrides to incorporate
committed human point corrections; unchanged exact spectra are reused. Moving
the core requires a new discovery/observation. Original failed/unknown requests
are inspected, never automatically replayed. Existing named AnalysisContext/CAS
retains references and stales dependent old comparisons after point changes.

Arm stability remains `not_assessed`; geometric expansion is not stable-arm
discovery, calibrated resolution, peak-source attribution or material confirmation.
Automatic interest/complexity fields, adaptive stable-arm search, dense segmentation,
new GUI gestures, automatic model wake and all-child export bundles are not
implemented. Existing saved records/individual scientific exports remain usable.
No training/fine-tuning is part of this increment. A future complexity proposal
would need separate structural-change, spectral-dispersion and quality/unknown
evidence; noise or an unsupported model-uncertainty score is not an interest oracle.
