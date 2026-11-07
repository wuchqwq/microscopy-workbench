# S2 readback: qualification and source-binding repair

Reviewed candidate: `3bb096f919a6521eda0dbc9a5def4f3c08f1181b`.
Scope: the two independently reported P2 readback failures. No new estimator,
threshold, physical qualification or trained model is introduced.

## Why the first counterexample passes the old reader

For fixed nonnegative templates B and coefficients a, predicted pixels are
mu = B a. At a constant count image, the bilinear background alone can exactly
reproduce the image. The Poisson gradient is then zero even when Gaussian
columns are nearly dependent. Prediction/gradient agreement does not establish
the rank of the coefficient-to-image map. A forged optimizer_success flag adds
no independently checkable proof of the original optimization.

Readback must independently apply the existing solver's deterministic admission
order, without fitting:

1. Zero total count retains UNKNOWN_ZERO_COUNTS.
2. Every template column must have positive finite mass before normalization.
3. A = B / column_mass must satisfy the existing normalized SVD gate,
   smallest_singular_value > 1e-10 * largest_singular_value.
4. Only a structurally admitted result can proceed to coefficient, prediction,
   projected-gradient and accepted-output verification.

Genuine stored UNKNOWN records must remain readable. Their deterministically
checkable reason must agree with the source/design; a coef=None early return
must not waive this check. The frozen projected-gradient threshold remains
5e-6. No optimizer or fitter is invoked by get, original-ID result, export or
review. Recomputing small design matrices and their SVD is validation, not a new
fit or a new physical experiment.

## Source fields and trust boundaries

| Field | Verifiable local anchor | What this does not establish |
| --- | --- | --- |
| dtype and scientific grid | Actual NPY array plus the qualified source object/journal closure used by NumericReader | Authentic experimental acquisition |
| xy_calibration | measurement_operand's selected revision and inherited calibration record | Correct physical scale or a truthful calibration declaration |
| user_context | The existing resolved source/revision context chain | Truth of the user's material/domain description or authenticated authorship |
| intensity semantics, intensity_calibration_applied, coordinate_space, component, dm_called | The fixed current observation contract applied to the reconstructed source operand | Electron-count validity, an imaging model or chemical identity |
| B, column masses and numerical rank | Original saved request geometry/width, resolved source pixels and unchanged S2 numerical formulas | Statistical identifiability, shape adequacy or physical accuracy |

Bind all reconstructible scientific fields returned by numeric.common to both
the top-level object and its exported column-fit.json report. Require keys and
JSON types, including explicit nulls, to agree; do not treat omission as null or
the number 0 as a boolean false. Do not compare historical runtime package
versions to current versions as an authentication test.

This is a local consistency threat model: the verifier and the separately
resolved source/request dependencies are held fixed while result files and
their redundant hashes may be altered together. Under that model, a result
cannot promote a failed rank gate or relabel its dtype/calibration/context while
remaining consistent with those dependencies.

SHA-256 values are unkeyed integrity checks, not signatures. "Trusted" here
means source dependencies and original request parameters held fixed during
validation, not authenticated external anchors. The original parameters are
also in a writable local journal. A writer who can consistently change those
parameters and the necessary related result files/hashes can create another
internally consistent analysis of the same image; that does not require
rewriting every file in the workspace. These fixes do not authenticate a past
request or optimizer execution, the experiment, its timestamp or human author.
Protection against that adversary would require a separate trusted external
anchor/access boundary, which is outside this repair.

## Focused evidence required

- Reproduce the constant-100-count / near-coincident-column result promotion,
  including coherent payload, manifest and journal rehashing; reject it through
  both direct get and original request-ID result after repair.
- Cover zero-count and zero-column promotion under the same admission order.
- Tamper source-bound metadata independently on a zero-fit result, including
  omitted keys and type changes. Preserve source
  dependencies while rewriting the result's own redundant copies/hashes.
- Keep genuine saved zero-count, rank-unknown and available-result controls.
- Block fitter and optimizer calls during read/recovery/export/review checks.
- Preserve fixture inputs, test commands, original failures and outcomes with
  explicit source versions. Reuse saved records; do not repeat the prior large
  comparison matrix or describe these engineering tests as physical validation.

The original physical convergence gate remains FAIL (10.034456% > 10%); formal
physical blind acceptance remains NOT_TESTED. The optional S2 selection and
default HRTEM/ROI route are unchanged.
