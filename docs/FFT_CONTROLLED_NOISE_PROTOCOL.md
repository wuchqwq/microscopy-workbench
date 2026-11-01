# Controlled synthetic FFT noise protocol — preregistration v2

Status: **design only; no detector results have been observed under this protocol**. The v1 draft is retained in `analysis/fixture-draft-1/`. Freeze the actual worker revision and deterministic DC handling before noise evaluation. Retain literal public requests, responses, errors, versions and hashes. Do not tune a threshold or change the matrix after seeing outcomes to make results pass. Label and report any later exploratory changes separately. The existing fixed analytic FFT regressions remain required.

## Model and full matrix

`tests/fixtures/controlled_fft_noise.py` constructs positive real intensities directly from specified cosines and backgrounds. It divides each exact ideal image by its mean and scales to dose D; independent Poisson counts have pixel means D × normalized ideal. Gaussian read noise, when specified, is independent with sigma 5 electrons/pixel. A Gaussian-read-only case uses the expected image plus independent Gaussian noise without Poisson sampling. Dose is the image-wide *expected* mean electrons/pixel, not a constant per-pixel mean. Negative read-noise outputs are allowed. These are controlled models, not a complete electron microscope, detector, correlated-noise model, or transfer simulation.

Each of 13 scenes has one deterministic noise-free expected-count baseline at D=500, saved as float32; it is not replaced by randomized data. Its raw quantization is part of the source under test. Eight base scenes each additionally have Poisson D=50, 500 and 2000 at every fixed seed 100–115. Five non-ideal imaging scenes each additionally have Poisson D=500 at every seed. Separate D=500 controls are one-wave Poisson plus read noise and uniform Gaussian-read-only noise, each with 16 seeds. Finally, an independent deterministic B+δ control is included. Thus full generation is **1 + 13 + 8×3×16 + 5×16 + 2×16 = 510 images**. Smoke substitutes two seeds (100, 101), giving **1 + 13 + 8×3×2 + 5×2 + 2×2 = 76 images**; it tests the harness only and does not replace the full matrix.

Generate into a fresh directory with `python tests/fixtures/controlled_fft_noise.py OUTPUT_DIR` or `--smoke`. Each TIFF is float32, with a manifest recording scene, noise model, seed, dose, parameters, analytic truth and both TIFF SHA-256 and canonical little-endian float32 array SHA-256. Record NumPy/tifffile versions. Preserve actual source TIFFs and hashes; the generator does not import or call the FFT or detector. Source quantization and nondeterministic samples must remain distinct from the ideal analytic truth. No seed selection is permitted.

| Scene | Prescribed image and expectation |
| --- | --- |
| delta_control | 63×63: B=100 everywhere and 101 at (25,20). No dose or randomness. With no window or mean subtraction, analytic modulus is 1 at every non-DC bin; exact DC has the background contribution. |
| uniform | Constant ideal; a noise sample can have numerical local maxima. |
| one | q=(8,5)/128 cycles/pixel, amplitude 0.25. |
| two | q=(8,5)/128 and (-4,10)/128, amplitudes 0.20. |
| weak | First q, amplitude 0.02; genuine signal may be missed. |
| near_doublet | q=(8,5)/128 and (8.6,5)/128, amplitudes 0.16; 0.6-bin separation is intentionally challenging and may merge. |
| resolvable_doublet | q=(8,5)/128 and (12,5)/128, amplitudes 0.16; 4-bin separation is the contrast to the near doublet, not a guarantee of recovery. |
| off_bin | q=(8.35,5.30)/128, amplitude 0.25; compares integer and quadratic refinement against independent sub-bin truth. |
| adjacent | Left 64×128 ROI has q=(6,4)/64 and (-3,8)/64; right has q=(5,-5)/64 and (9,3)/64. All amplitudes 0.20. Each region has two non-collinear carriers. Analyze both halves and the full image separately. |
| background_slope | One-wave scene plus linear x background ±0.3. |
| local_contrast | One-wave amplitude multiplied by 1 on the left and 0.25 on the right; the sharp edge also affects the spectrum. |
| gaussian_blur | One-wave with continuous Gaussian transfer attenuation exp(-2π²σ²|q|²), sigma 1.5 pixels; not discrete convolution or a complete transfer function. |
| affine | One-wave coordinates transformed by [[1.08,0.06],[-0.03,0.94]] and shifted by (3,-2) pixels. Effective q is Aᵀq; shift changes phase. |
| mixture | Two non-collinear prescribed q from the two scene, amplitudes 0.16; a mixed signal need not represent one lattice. |

Cosine phases are zero before affine translation. Pixel axes are x right and y increasing with row. The manifest records each component's q in cycles/pixel, period 1/|q| pixels, angle atan2(q_y,q_x) modulo 180°, and half-open pixel ROI. q and −q are equivalent. Local contrast, background shape, blur, affine/shift, and period/direction mixture are separate imaging factors, not a single noise parameter. Finite crops, transitions and background can produce leakage, shifted maxima, unequal strengths or ambiguity.

## Frozen requests and stopping rule

Before running noisy cases, establish deterministic behavior of the exact DC handling through the public worker. Run the fixed B+δ analytic control first with secondary settings below; with exact DC excluded the non-DC analytic modulus is constant. If expected behavior or errors are not deterministic and understood, **stop** and retain the failure; do not silently exclude or adjust it. A separately returned DC maximum is reported separately. Windowing changes the delta control's spectrum, so do not apply its no-window analytic truth to the primary windowed configuration.

Use primary window Hann with mean subtraction true and secondary window none with mean subtraction false. For both, freeze threshold_rel=0.05, max_peaks=16, min_separation_bins=3, DC exclusion radius=3 bins, and run both refinement=none and refinement=quadratic. The four combinations per image are **2,040 full-image evaluations** for the full 510-image matrix, or 304 in smoke. Analyze each of the two adjacent ROIs under the same four combinations: an additional 49×2×4=392 evaluations full, or 7×2×4=56 smoke, for **2,432 full / 360 smoke image-ROI-configuration evaluations**. Worker setup/field/compare calls are additional and must be counted separately. For local comparison use fixed angles [0,90] degrees and pixel tolerance 0.01; preserve exact request units/field names from the worker contract. Refined estimates and insufficient results remain outcomes; do not silently change settings to resolve the close doublet.

## Evaluation and interpretation

For all 16 seeds report processed/attempted, errors, timeouts and missing outputs. For each non-DC returned coordinate, map to cycles/pixel using the actual ROI geometry and documented transform convention. Match truth components one-to-one up to sign using elliptical bin distance `sqrt((Δqx*ROI_width)^2 + (Δqy*ROI_height)^2) <= 1.5`, choosing minimum total distance without reusing a returned peak. This fixed gate is a reporting convention, not a detector threshold or statistical guarantee. Retain raw coordinates and signs. For adjacent full-image mixed ROI report raw candidates and nearest-component distances without claiming region-local recovery; calculate match metrics independently for the two half ROIs.

Report per scene, model, dose, configuration and component: attempted and successful counts, count recovering at least one and all components, unmatched candidates per image, and matched q error (bin distance), period absolute/relative error and shortest modulo-180 direction error. Report doublet/two-wave both/one/neither and any merge or ambiguity flags; for uniform report candidate-count distribution and count with any non-DC candidate. For deterministic controls report all candidates and explicit unresolved/insufficient status. Report per-seed rows and descriptive counts/errors with denominators, including those for matched-only error summaries. Record local comparison outcomes including insufficiency and ambiguity. A CSV may use case, model, dose, seed, ROI, request ID, status, truth index, truth/detected q, match distance, period error, angle error, candidate count and source/output hashes, with explicit nulls.

Numerical contrast resolution, statistical significance and a physical lattice are distinct claims. This study does not calibrate a significance test, probabilities, false discovery rate or real microscopy accuracy. Unexpected candidates, weak-signal misses and merged doublets remain visible outcomes; noise is not required to lack local maxima. Never alter thresholds to obtain green results. A synthetic result does not qualify real specimens or establish material identity.

## Frozen execution tiers and independent evaluator

The full 510-image dataset is exercised by `tests/fixtures/evaluate_fft_noise.py` against each explicitly selected `--repository`, using the **same immutable dataset** and separate fresh output directories. It follows the public worker's numerical order (float64 conversion, optional mean subtraction, optional Hann, NumPy FFT and shift), then invokes that repository's actual `image_peaks.detect`, `image_calibration.geometry`, `image_domain_compare.fold_families`/`noncollinear`/`compare_families`, and `image_feature_field.features`. These are raw numerical calls; most evaluations do **not** traverse the saved public worker chain. The raw feature and comparison fields are labelled `diagnostic_*`; they are not fabricated public feature statuses. True public statuses come from the separate saved-chain tier below.

Before assignment, the evaluator groups peaks by their **exact integer-bin conjugacy**, preserving the original peak rows. An independent SciPy linear assignment maximizes the number of matched truth components, then minimizes distance; it never uses the product's reflection matcher for truth evaluation. Thus one conjugate pair cannot be credited to both near-doublet components. Both matched near-doublet components mean only two discrete candidates passed the matching convention; they do not establish Rayleigh or physical resolution. T=truth-component count, D=conjugate-group candidate count, matched count, errors, unmatched indices and exceptions are recorded; mixed full-image adjacent ROI has nearest-distance diagnostics only, with no asserted region-truth recovery. Adjacent half-ROI raw family comparisons retain their complete result for [0,90] and tolerance 0.01. Significance and physical lattice remain `not_assessed`.

Invoke, for example, `python tests/fixtures/evaluate_fft_noise.py --repository REPOSITORY --dataset DATASET --output NEW_OUTPUT`; use a separate new output for each old/new revision. `--self-test` tests only the independent oracle, with no detector. `run.json` records repository HEAD, loaded module hashes, generator manifest hash and runtime versions; `raw.jsonl` keeps source identity, all diagnostic rows and exceptions; `summary.json` and `summary.csv` retain counts and per-seed matches. Inspect and report errors and denominators, never treat errors as negatives.

The independently implemented **public saved-chain parity subset** is preregistered as the noise-free D500 image and the Poisson D500 seed 100 image for each of all 13 scenes, plus the deterministic delta control: 27 images. It uses both windows and both refinements (108 full-image evaluations); both adjacent halves add 16, for 124 image-ROI-configuration evaluations, plus eight same-image adjacent comparisons and any required setup/read calls. Preserve actual saved public statuses and compare numerical results to the raw harness with explicit exact parity checks. This subset is fixed before outcomes and is not a selection based on observed noise results; read-noise-only and other doses remain in the full raw tier.

## Coverage amendment before inspecting outcomes

The raw old/new runs completed with2432 reported rows each. At this amendment
only completion/counts have been read; no metric or status outcome has been
inspected. A coverage review found that the27-source subset alone would not
provide actual feature statuses across all16 seeds. Therefore additionally run
`controlled_fft_saved.py --full-primary` on all510 manifest sources with the
unchanged primary Hann/mean=true/quadratic request. Adjacent sources retain all
three ROIs. That is608 ROI evaluations and49 comparisons; add the original
delta's none/mean=false/quadratic control first, for609 ROI evaluations total.
The original27-source/four-configuration subset is retained, not replaced.
This adds public-status coverage, not a fitted threshold, selected seed or
change to the matrix's input data. Secondary configurations remain complete
in the raw tier and covered by the fixed public subset.

All outcomes will be separated into confirmed implementation bugs, measurement
uncertainty, method limitations and physical non-identifiability. A missing
match or insufficient_evidence is not automatically a bug; no per-seed monotonic
noise ordering is required. The study reports descriptive aggregate trends with
denominators, not a calibrated microscopy error rate. `valid` is read with its
saved numerical meaning, separately from measurement reliability and physical
interpretation. Redefining its contract or adding per-peak significance remains
paused pending the design discussion in the DC repair; this test increment
does not implement that architecture.

Model references checked2026-11-02: [NumPy Generator.poisson](https://numpy.org/doc/stable/reference/random/generated/numpy.random.Generator.poisson.html)
defines lambda as the expected count; [EMVA1288 Linear4.0](https://www.emva.org/wp-content/uploads/EMVA1288Linear_4.0Release.pdf)
distinguishes counting and readout terms for optical sensors. That standard is
not a qualification of this synthetic electron-count model or a specific
electron detector. Here each simulated event contributes one count, efficiency
and gain are assumed1, with no detector PSF, DQE, pileup, saturation, MTF,
spatial/temporal correlation or dynamical specimen image formation modeled.
