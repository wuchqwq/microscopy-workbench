# One core through the existing analysis chain

Use actual advertised tools. The Agent remains the analyser; a human may select
a core or revise a measurement at any time. Panel selection does not wake the
model automatically. This is an optional core/context workflow, not a new
controller or a mandatory method for every image.

1. Inspect the immutable full frame/calibration wrapper, shape and an actual
   scientific preview. Take an explicit user core after reading the current
   Panel selection, or choose one from observed image/FFT/field evidence and
   explain its relevance. Use half-open integer source-pixel edges, minimum4x4.
   Fractional gestures need an explicitly reported integer sampling support;
   never silently round, clip or use screenshot coordinates. Unknown scale
   remains pixel-domain.
2. Save `image_discovery(entry="manual", selection_origin="agent"|"researcher",
   regions=[{rect,reason,...}])`. Manual means explicit coordinates, not a human
   requirement or physical confirmation. Origin is caller-reported, not
   authenticated. Experimental feature proposals may help attention, but an
   empty result does not prove normality or force human selection. The Agent
   can justify a core through other actual observations. Do not repeatedly
   lower heuristic thresholds; ask for missing context when it is needed.
3. Save a new `image_spatial_atlas` request with `rects:[core]` and
   `cross_window:{selection_origin,source_text,discovery_object_id,candidate_id}`.
   Use the actual discovery/candidate IDs. Their exact selected source, frame,
   calibration and core must agree before FFT work. Without that optional pair,
   the core has caller provenance only. Use the same path for both actors.
4. Read ordinary regions0=core,1=horizontal,2=vertical and the
   `cross_window_plan`. Default arms each equal max(core width,height), a
   geometric starting point, not an automatically stable-structure selection.
   Configure `arm_lengths:[left,right,top,bottom]` in source pixels, based on
   actual context/quality. No clipping or padding occurs; revise an out-of-frame
   proposal explicitly. Zero arms allow disclosed one-sided edge support;
   both opposite arms on an axis cannot be zero. Inspect `two_sided_support`.
   Non-square cores retain their exact rectangle: horizontal keeps its y span,
   vertical its x span, and their intersection equals the core. Roles describe
   stored image axes, not crystal directions or an assumed isotropic metric.
5. Existing FFT batches, v3 peaks and ordinary measurements save each rectangle's
   own FFT shape, frequency axes, calibration, hash, source support and quality.
   Choose/report window, mean and peak settings. Count all three windows and
   all attempted work, including earlier scans, in the task budget. Read
   `detection_quality`, empty/capped/unknown results, not just the contact PNG or
   `observed`/`valid`. Numerical contrast is not noise significance, calibrated
   localization uncertainty or nearby-component separability.
6. Use existing `image_local_signature_compare` with explicit finite angles,
   coordinate domain and tolerance, or `image_feature_field` for sparse
   descriptors when useful. Compare cycles/pixel or sourced physical vectors,
   not raw bin indices from different FFT shapes. Windows share the core and
   are correlated; common/missing/additional peaks do not uniquely locate a
   source or identify a phase. Do not subtract amplitude spectra for that claim.
7. Bind `image_discovery_review` only to region0 core FFT/peaks/measurements for
   this candidate. Regions1/2 retain their own long supports and are rejected as
   exact core evidence. Report contextual supports, mixtures, contradictory
   peaks and unknowns separately. Use GPA/method_plan/step/next only with their
   existing sourced prerequisites; this mode does not bypass those gates.
8. Existing broad follow-up remains spatial_field -> domain_map ->
   analysis_candidates -> field_extend -> reassess, under its square-window
   and cumulative-budget rules. Never insert these long rectangles into that
   plan or relabel sparse cross descriptors as a spatial_field. Cross atlases
   complement that route. Reliable automatic core/arm discovery is not promised.
9. After a user moves the core, save a new discovery/reason and atlas revision;
   old ROI evidence is history. For committed peak corrections on unchanged
   supports, use image_remeasure, previous_atlas_id and complete region-indexed
   measurement_overrides. Exact unchanged spectra are reused; revised geometry
   is new observation. Query original image_result after interruption; no replay.
10. Save the atlas in the existing named AnalysisContext atlas role using CAS;
    use only advertised roles for comparisons. Retain discovery/review/request
    IDs. Read `analysis_read`'s returned `context.revision` for the next CAS;
    promote the experiment, atlas and dependent comparison in their proper order.
    Before promoting ROI-specific points/measurements into those global roles,
    select that region's exact saved FFT in the existing `fft` role: the full
    spatial experiment grid is not its frequency/ROI grid. An atlas itself can
    retain all region corrections without relabeling them as one global grid.
    Reconnect by reading context and original records. No new Context role
    or second request authority is added. The atlas is a saved observation record;
    export core/long scientific FFTs and discovery/review separately through
    image_export, retaining the cross plan. A standalone all-child cross bundle
    and automatic model wake-up are not implemented by this increment.
