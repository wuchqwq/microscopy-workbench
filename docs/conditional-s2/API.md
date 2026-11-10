> 来源：PR #134 精确版本 `51efc13c1ad6` 的历史说明；文中的“本轮”和旧验证数字属于原版本。
> 当前 Mac 候选、adapter v3 求解器配置及模态门槛和本地验证范围见 [Mac 隔离集成](../STEM_MAC_INTEGRATION.zh-CN.md)。

# Optional fixed-geometry column evidence

Call `image_column_fit` explicitly after baseline image inspection and raw ROI
statistics. `image_statistics` and HRTEM peak tools retain their existing
contracts. No model, geometry, width or count interpretation is inferred.

Required fields are `request_id`, the exact saved spatial `object_id`, a fixed
5x5 half-open `rect`, and `reference_comparison` containing 1..8 distinct 5x5
`reference_rects` and their actual selection `source_text`.

Version 2 adds an optional `acquisition_context` object with `modality` and
actual `source_text`. A caller-declared `haadf` or `adf` channel is required to
run the positive-column count fit. Omission, `unknown`, ABF/BF, iDPC/DPC and
reconstruction channels preserve raw evidence with `UNKNOWN_UNSUPPORTED_MODALITY`
and zero fit calls. This declaration is unverified. Old version-1 records are
read using their original gates without rewriting them or running the solver.

Other optional scientific prerequisites are:

- `geometry.site_centers_xy`: primary followed by references in rectangle order.
  Each X,Y center lies inside its half-open ROI; subpixel coordinates are allowed.
- `geometry.supplied_columns_xy`: the complete supplied column set, including
  each site center once, at most 256 columns. Duplicate geometry is UNKNOWN.
- `geometry.sigma_pixels`: one finite positive common isotropic width.
- `geometry.source_text`: actual source of the geometry/width assumptions.
- `count_interpretation.model`: the supported name is
  `independent_poisson_counts`. Other names or omission save raw + UNKNOWN.
- `count_interpretation.source_text`: actual acquisition/count explanation.

The supplied information remains unverified. Integer-valued floating data are
not counts merely because they pass the numeric check, and integer dtype also
proves nothing. Only finite nonnegative integer-valued fit pixels, patch totals
at most 2^53-1, and representable model arithmetic are admitted. There is no
gain/exposure conversion. Source admission remains the existing dtype/array
contract; this version does not add int64 TIFF or reciprocal/complex fitting.

The 9x9 support is formed by extending the fixed readout two pixels each way;
it is not recentered on the supplied subpixel center. Insufficient saved support
returns UNKNOWN without clipping or reducing its size. Gaussian mass >=0.005
selects all supplied neighbours. Gaussian columns plus four background columns
must number fewer than 81 before SVD. At most nine patch fits retain the research likelihood and scientific gates;
adapter v3 tightens only relative objective stopping `ftol` to `1e-13` (from `1e-11`). These limits bound computation, not physical validity.

Saved `kind="column_fit"` evidence separates:

1. `raw_baseline`: unchanged raw primary/reference statistics and signed median
   comparison. If binary64 raw reductions cannot be represented, the saved raw
   status is `UNKNOWN_RAW_NUMERIC_RANGE`; no finite number is invented.
2. `sites[].accepted.fitted_total_roi_mean`: all selected columns and background,
   in count pixels per pixel under the caller interpretation, on the same 5x5.
3. `sites[].accepted.central_integral`: counts extrapolated to the full plane
   under a Gaussian with unit full-plane integral. It is not an observed ROI sum.

Failed sites have null accepted values. Their coefficients, predicted pixels,
projected gradient and descriptive deviance can appear under `diagnostics` only.
Both fitted contrasts in `whole_comparison` require every requested site to
qualify; the target alone cannot rescue a failed reference. Exact support
coordinates and `overlapping_fit_support_pairs` disclose reused pixels. Fits
are joint across columns within a patch, not one independent target/ref likelihood.

`column-fit.json` and per-site JSON retain source/grid identities, caller text,
selected/omitted columns, budgets, gates, code hashes and actual SciPy version.
`image_info`, original-ID `image_result`, `image_export`, and exact-ROI
`image_discovery_review` verify stored evidence without optimizing again.
Source/ROI/calibration mismatches are refused. Revising assumptions requires a
new explicit request; do not replay an unknown operation under a new ID.

No CI, p-value, occupancy, vacancy probability, chemistry or phase classification
is provided. Numerical convergence does not establish statistical identifiability
or verify the Gaussian, width, geometry, count model or same-class references.
The Skill can propose this conditional tool; no Panel editor, automatic Panel
savepoint result slot or AnalysisContext registry is added in this increment.
