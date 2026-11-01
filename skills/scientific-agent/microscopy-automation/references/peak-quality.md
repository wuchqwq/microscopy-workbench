# Peak quality: choose checks without inventing qualification

Use this page for explicit image/ROI FFT measurements and a small set of
candidate explanations. It guides existing tools; it adds no provider gate,
statistical test, probability, or experimental-planning workflow. A missing
qualification limits the corresponding claim, not all observation or discussion.

## Read the saved evidence

Read the advertised schemas, source/frame/ROI, calibration source and signed
axes, FFT settings, original request outcomes and current saved selections.
Use original numerical arrays; preview gamma, zoom and filtering are display
choices. After human edits, read the committed measurements again. Retain the
same references across GUI-first and AI-first entry points.

For `image_peaks`, inspect these actual fields before interpreting a maximum:

| Read | Meaning and limit |
|---|---|
| `peak_detection.version`, `peak_quality.numerical_contrast` | v3 assesses overall amplitude variation against an **uncertified** normwise roundoff proxy using the complete FFT, including DC. `resolved_amplitude_variation` is not a certificate for every returned peak. Read `certified_fft_error_bound`, `individual_peak_resolution_established`, and `statistical_or_physical_validity`; all are false in v3. Missing fields in historical objects mean unknown, not newly qualified. |
| `bin_xy`, `refined_bin_xy`, `frequency_cycles_per_pixel`, `pixel_period` | Numerical geometry. Physical spacing requires sourced calibration and ordinary saved measurements. The frequency-vector direction is normal to image fringes; state which direction is reported. |
| `sampled_amplitude`, `local_median_amplitude`, `local_peak_to_median_ratio` | Local amplitude descriptors, **not SNR**, significance or candidate probability. The ratio can be null. |
| `refined`, `refinement_note`, `localization_uncertainty_bins` | A separable three-point log-amplitude estimate can reduce binning bias. Localization uncertainty is currently null; sub-bin coordinates neither supply an error bar nor prove two-peak resolution. |
| `conjugate_peak_ids`, `selection_limit_reached`, `local_maxima_above_threshold` | Real-image ±q are paired information. Selection limits can hide candidates. Different object IDs or filters do not create independent data. |
| `threshold_amplitude`, `strongest_outside_dc_amplitude`, saved peak parameters | Relative amplitude, DC exclusion and separation are explicit selection settings, not a calibrated noise test. |

Read downstream feature/comparison status with its limitations. `valid` can
describe an admitted numerical signature; `insufficient_evidence` can occur for
a correctly measured single direction because the downstream task needs more
families. Neither status alone decides whether a physical explanation is true.

## Choose a bounded operation

Use a task-specific small budget and retain all trials. Choose an action because
of observed evidence, not to force a preferred candidate through. A fixed whole
pipeline or a complete structure field is unnecessary.

| Observation | Optional existing operation | Parameter cost / stopping condition | Report |
|---|---|---|---|
| No sourced physical calibration | Continue `image_peak_measurements` and pixel-domain local comparison | Do not guess nm/pixel or fit the scale to a candidate. Stop physical-unit claims only. | cycles/pixel and pixel period; physical spacing unknown. |
| Leakage or edge discontinuity is plausible | One stated same-ROI comparison of `window:none` and `hann`, with mean setting explicit | Hann reduces sidelobes but widens the main lobe. Production subtracts the arithmetic mean **before** a symmetric separable Hann. Constant background then has a window spectrum; non-DC flatness applies only to the appropriate unwindowed impulse case. | A sensitivity comparison of the same observation, with both settings retained. A disappearing maximum is not by itself proven noise. |
| Weak maximum | Inspect local descriptors and selected-peak cap; save a conditional numerical measurement if useful | No qualified noise model, significance, or localization interval is currently supplied. Do not repeatedly lower thresholds until something passes. | Candidate frequency with detection/localization qualification unknown; no invented SNR or error bar. |
| Close maxima or asymmetric shoulders | Inspect original spectrum/support; compare a larger ROI only if spatially justified and within budget | Larger support may mix domains. Zero padding/display enlargement/refinement cannot alone prove resolution; minimum separation is an algorithm setting, not a physical resolution theorem. | Resolved candidates only to the extent observed; retain unresolved components/alternatives. |
| Multiple periods or changing contrast | Inspect spatial distribution; propose explicit sub-ROIs where supported | Disjoint supports may still share imaging/calibration errors; overlap is correlated. A single ROI may have no single-domain explanation. | Image texture or mixed candidate explanations; stop single-domain material interpretation where its premise fails. |
| Parameter sensitivity or conflicting candidates | Compare saved results, all finite trial angles and unmatched families | Preserve disagreement. No preferred fit, small residual, or best member of a finite list proves the list contains the true phase. | Compatible, conflicting and indistinguishable aspects separately. |
| Numerical contrast unresolved | Retain the empty result and original FFT | Stop automatic periodicity inference from this detector result. A new source/ROI question can be considered explicitly, without rewriting history. | Numerical resolution limit, not proof the specimen lacks periodic structure. |
| Unknown original request, stale/source-conflicting object or scientific rejection | Query `image_result` with the original `request_id`; inspect saved `image_info` where appropriate | Do not resubmit an unknown side effect under a new ID. A new analysis requires a known outcome and explicit changed intent; it does not overwrite the old interpretation. | Exact known/unknown state and recoverable reference. |

## Separate claims in the answer

State the image/ROI and units; actual observations and sources; candidate
explanations and why they were proposed; checks actually executed; compatibility,
conflicts and remaining ambiguity. Name which limit applies: numerical
resolution, unqualified detection under noise, unknown localization precision,
method assumption, or physical non-identifiability. Unknown does not mean zero.

Same-image processing contrasts, shared FFTs and conjugates are correlated
checks, not several independent experiments. Different reflections may add
geometrical constraints without being independent physical confirmations.
Keep candidate discussion available when simulation or statistical qualification
is missing; label those checks unperformed. A numerical GPA/feature mask or
geometric comparison does not establish material strain, unique phase, twin,
or a three-dimensional defect. This reference does not disable advanced APIs.

For the source assumptions and deliberately unadopted methods, see the
[literature review](../../../../docs/PEAK_QUALITY_LITERATURE_REVIEW.md).
