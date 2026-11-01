# Independent review: constrained registration validation semantics

Reviewed 2026-11-02 by the explicitly requested `gpt-6-astra` reviewer. This is a literature and design review against main `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c` (tree `82facfce75c5909c510cb5014e228918904f5de4`), before implementation. Open audit/GUI/intake PRs are not assumed merged. `AGENTS.md` was read. The reviewer changed this document only; implementation and verification are separate work.

## Recommendation

Implement an executable separation between **conditional correspondence consistency** and **independent validation**. Keep the present determinant-constrained SO(2) solver, signed coordinate convention, scale=1, translation=0, exact-source bindings, fixed residual bounds, assignment, and retained ambiguities unchanged. A successful residual test remains useful and should remain available as a positive result. It must no longer set an independent-validation pass flag when the endpoint has no independently qualified source-peak grouping/resolution or validation protocol.

This is a substantive output-state fix: current requests should not return `held_out_validation_passed=true` on the near-duplicate/near-conjugate counterexamples. Merely appending another disclaimer while retaining that unqualified true is insufficient. Do not replace the solver or invent a physical separation threshold from one ULP, the caller's residual allowance, or one FFT bin. None of those quantities proves resolved source observations under this interface.

The current API cannot certify independent validation even for an excellent, well-separated positive fixture. It can still return the correct rotation, positive conditional geometric consistency, explicit fit/held residuals, and normal geometric comparisons. Reporting independent validation as insufficient is not equivalent to rejecting the alignment or calling its geometry incompatible.

## Literature and mature implementations

The following sources were searched/read on 2026-11-02. The conclusions below distinguish source claims from their application to this project.

| Source | Inspected version / material | Relevant result; application boundary |
|---|---|---|
| [Kabsch (1976), *A solution for the best rotation to relate two sets of vectors*, Acta Cryst. A32, 922–923](https://doi.org/10.1107/S0567739476001873), and [Kabsch (1978), *A discussion of the solution for the best rotation to relate two sets of vectors*, A34, 827–828](https://doi.org/10.1107/S0567739478001680) | Original publication records/abstracts at IUCr; 1978 explicitly concerns the best proper rotation | Establish the fixed-correspondence least-squares rotation problem. They do not turn data correspondence assertions into proof of independent observations. No evidence here warrants changing the working SVD construction. |
| [SciPy `Rotation.align_vectors`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.transform.Rotation.align_vectors.html) | Official documentation page identifies SciPy 1.18.0; earlier audited runtime was 1.18.1 | Separates fitted rotation/residual from a sensitivity matrix. Covariance requires observation variances and assumptions about small measurement errors; weights must be consistent with those variances. Do not import that 3D API as a substitute for the existing 2D fixed model, or infer covariance from its unweighted residual. |
| [Brünger (1992), *Free R value: a novel statistical quantity for assessing the accuracy of crystal structures*, Nature 355, 472–475](https://doi.org/10.1038/355472a0), and [Xplor-NIH official cross-validation manual](https://nmr.cit.nih.gov/xplor-nih/xplorMan/node338.html) | Original Nature abstract/search record; direct Nature page redirected to an inaccessible identity service. Official XPLOR interface-manual section was readable; its page gives no release number | Validation reflections are withheld from modelling/refinement; training fit alone can be misleading. This work concerns structure-factor amplitudes and refinement, not this tool's spot-coordinate geometry. Apply its separation principle, not an R-free formula or statistical claim to the present endpoint. |
| [CCP4 `FREERFLAG`](https://www.ccp4.ac.uk/html/freerflag.html), [CCP4 FreeR information](https://www.ccp4.ac.uk/html/freerunique.html) | Official supported-program/manual pages; unversioned pages accessed on review date | Unless NOSYM is requested, symmetry/twin-related reflections receive the same FreeR flag. Existing free sets should persist through related datasets/programs and remain unbiased by prior refinement. This is a concrete mature example of preserving related-observation groups and history. Its crystallographic symmetry rules do not specify the finite image-peak resolution policy missing here. |
| [scikit-learn `GroupKFold`](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html) | Official documentation identifies version 1.9.1 | Folds keep declared groups non-overlapping. This supports separating row identity from observation-group identity; it neither discovers physical groups nor proves their independence. No scikit-learn dependency or cross-validation loop is needed for this fix. |
| [Harris (1978), *On the Use of Windows for Harmonic Analysis with the Discrete Fourier Transform*, Proc. IEEE 66, 51–83](https://doi.org/10.1109/PROC.1978.10837), [original paper PDF](https://amst.ece.iastate.edu/paper/comparative_study/window_1.pdf) | Original paper, particularly window performance and minimum-resolution-bandwidth discussion, pp. 56–58 | Window bandwidth, nearby signals, leakage and dynamic range affect spectral resolution. The paper's windowed-DFT criteria are not a universal bound on localization precision or a complete multi-peak inference model. A caller acceptance radius or binary64 difference is not a substitute for qualified resolving-power evidence. |

No source found justifies a universally correct one-line numerical distance cutoff for this endpoint. The minimal supported fix is an evidence-admission/state change, with a future optional observation-group contract if and when it is scientifically qualified.

## Owning code and exact integration points

All locations below refer to the audited main, before edits.

1. `crystallography/registration_proposal.py:139–168` computes proper equal-weight uncentred Procrustes. Preserve its arithmetic. Only the fit index list enters `_proper_rotation` at line269. A held-out mismatch must not change the returned angle.
2. Lines222–265 enforce exact anchor/projection/Friedel disjointness and one-ULP warnings. Retain those existing guardrails and their honest numerical scope. They are not a complete physical independence test.
3. Lines288–310 currently combine fit/held residual success with the absence of a numerical alias warning into `held_out_validation_passed`. This is the main behavioral change. Introduce an explicit validation-semantics version (for example `registration_validation_semantics_version:2`, distinct from `experimental_geometry_binding.binding_version`) and a conditional geometry result. New outputs must separately state that source-peak independence, experimental resolving power, and statistical/external validation were not established.
4. `crystallography/structure_tools.py:684–711` loads a saved registration for `compare`, verifies exact simulation/measurement/calibration binding, and copies the old validation fields. Preserve these checks. Extend the propagated evidence with the source registration's semantics version, the conditional result and current independent-validation state. Do not allow a historical v1 true to become a new v2 independent-validation claim.
5. `StructureWorkspace.object` at lines493–533 verifies the original journal, object and file hashes. It does not recompute a registration or a plain comparison with the latest solver. `get`, `result`, and exact repeated original requests return their original saved records through `_execute` at lines764 onward. This makes byte-exact historical replay possible without maintaining a duplicate numerical registration engine.
6. `general_evidence.py` and `twin_tools.py` consume a caller-supplied shared transform, not a `registration_object_id`. They already characterize their comparisons as conditional and not independent validation. Preserve positive finite-candidate usefulness and do not silently turn compatible geometry into incompatible geometry. A copied transform is not an authenticated link to the proposal that produced it.
7. Update the public tool description/instructions in `lib/structure_workspace.mts:42,53`, the declarative gate/output descriptions in `lib/tools/structure_module.mts:103–110`, and `docs/CONSTRAINED_REGISTRATION.md` / `docs/CONTINUING_DIFFRACTION.md`. Current phrases implying separate coordinates alone supply independent held-out reflections should be narrowed consistently. These descriptions must reflect actual fields and behavior, not replace the behavior change.

## Suggested state contract

Names may be aligned with the final implementation, but the distinctions must be executable and unambiguous:

| Evidence | Conditional correspondence outcome | Independent-validation outcome |
|---|---|---|
| No held-out list | not tested, null conditional pass | not tested, null independent pass |
| Fit or held correspondence misses fixed tolerance | inconsistent, false conditional pass | insufficient/not established; no independent pass |
| All specified residuals pass, including a well-separated synthetic positive | consistent, true conditional pass | insufficient without a qualified independent-observation protocol; null independent pass |
| Residuals pass but anchors are unresolved/near duplicate/conjugate | numerical consistency may remain true; numerical alias warnings retained | insufficient; null independent pass |

A suitable minimal representation is a `held_out_geometry_status`/`held_out_geometry_consistent` pair plus an `independent_validation` object with `status`, `reason_codes`, `source_peak_independence`, `resolution_evidence`, and `statistical_validation` fields. Keep `held_out_validation_passed` null for current records that lack independent evidence, or remove it only under an explicitly versioned breaking schema. A legacy compatibility boolean must not still report true in the current namespace while a distant disclaimer says the opposite.

Do not add a caller checkbox such as `independent:true` or treat `confirmation.source='synthetic_fixture'`/`'user_confirmed'` as proof. Those are provenance assertions. Existing saved measurements do not supply an independently validated localization/resolution grouping schema. Future qualified evidence must bind exact source/frame/ROI/FFT, acquisition or resampling dependencies, peak/group identities, and the validation-selection protocol; source resolution alone is necessary in the counterexample but not sufficient for statistical independence from shared DC/calibration errors or candidate selection.

## Historical compatibility

Missing semantics version means historical v1, not new v2. Original `get`, `result`, and repeated request IDs must return their recorded outcome unchanged, including historical true. Do not add current fields to the old returned object, overwrite old manifests, recompute old fields, or refresh old module hashes.

For a **new** comparison consuming a valid v1 registration, retain its old validation fields as explicitly historical/source-version evidence and add the new comparison's current independence admission. An example is a `source_registration_validation_semantics_version:1` marker and `legacy_validation_evidence` snapshot together with a v2 `independent_validation.status='insufficient_evidence'`. The new comparison may still use the historical angle when all current scientific bindings pass; that does not validate its original source-peak independence. A new unknown future policy version must not silently default to v1 or qualify as independent.

There is no reason to rerun the SVD just to reinterpret a validation label. Same original request ID plus changed parameters remains a conflict, not a migration route. Any deliberate reanalysis uses a new request ID and preserves the old outcome.

## Required discriminating tests

- Full actual saved-worker positive: independently known nonzero rotation and signed anisotropic measurement geometry; unchanged numerical fit and positive conditional held geometry, but independent pass is not true without the missing protocol.
- Near-projection alias and near-conjugate saved measurements from the round-two counterexample: unchanged residuals/angles, conditional result visible, independent result insufficient. Keep original before-fix evidence; do not relabel the old record as a corrected one.
- Wrong held-out correspondence changes held geometry to false while fitted rotation is unchanged; wrong scale is not fitted away. No held-out list stays not tested/null.
- Existing exact duplicate/Friedel rejection, rank/nonuniqueness checks, assignment ambiguity and unmatched-reflection retention remain effective.
- New saved `compare` propagates the v2 distinction; conditional matching remains available. Copying an explicit transform into general/twin does not acquire independent validation.
- Actual historical v1 registration and comparison: read/query/repeat-original return the same payload and leave all original bytes/hashes unchanged. New comparison using that v1 registration marks original evidence historical and does not expose an unqualified current independent pass.
- Different simulation, changed calibration/centre/point grid, conflicting request ID, and incomplete original journal retain their existing refusal/unknown behavior; no replay of unknown work.
- Public descriptions and result projections preserve the distinction. Run affected unit tests, `npm test`, and `npm run test:science`; the existing standalone-science smoke principally covers image FFT/measurement and does not by itself exercise saved registration semantics.

A source/read-only review is not an implementation test. Final acceptance should record the exact changed revision, dependencies, before/after field values, actual public-worker requests/results, and historical-byte checks. No real-specimen accuracy, confidence calibration, universal peak resolution, automatic candidate-search performance, or GUI/model comprehension follows from this change.

## Implementation review checkpoint — 2026-11-02

The independent reviewer inspected the initial production diff and ran the eight tests in `tests/test_scientific_evidence_semantics.py` successfully. This checkpoint is not a substitute for the author's full saved-worker, historical-byte and repository suites.

The correlated-scale variance factorization `(a+rho*b)^2+(1-rho^2)*b^2` is algebraically equal to `J C Jᵀ`; retaining the rho=0 arithmetic path preserves the previous independent-scale computation. For a common multiplicative error with oppositely signed axes, the correlation of their signed scale errors is -1, not +1. The tests exercise both signs and a partially correlated forward Monte Carlo case. Exact folded endpoints correctly retain the unwrapped diagnostic while withholding a nonnegative-angle SD; near-endpoint coverage remains unqualified.

The GPA assessment's nominal untruncated Gaussian amplitude-kernel FWHM `sqrt(2 ln2)/(pi sigma)` and small-phase transfer `exp[-k²/(2 sigma²)] sin(2 pi k)/(2 pi k)` are appropriate within its explicitly centred-carrier, constant-amplitude, interior one-dimensional scope, with the declared hard cutoff. They must not be marketed as a measured PSF, instrument resolution, arbitrary-orientation tensor transfer, or large-phase correction.

Saved GPA views/reads inherit their parent's assessment. Ordinary compact get/result preserves the complete non-structural GPA object, and export manifests/provenance preserve the assessment. A view/read derived from a historical parent intentionally remains without the new assessment; document that inheritance exception instead of claiming all newly issued view/read calls acquire current semantics. Registration and local-signature history paths appear designed to retain old bytes and interpretation.

At the initial checkpoint, one actionable semantic issue was reported: `held_out_geometry_passed` included `not unresolved`, and its status reused an independence-unresolved label. That could make the newly named geometric pass false despite all residuals satisfying tolerance. The requested correction was to separate residuals from alias warnings and add a one-ULP regression case. **This issue is resolved in the re-reviewed implementation below.** No numerical threshold or solver changed.

The initial checkpoint also requested synchronized public descriptions, the signed-rho convention, and explicit distinction between the original v1 snapshot and current v2 admission. Those updates were inspected during the follow-up review below; the author's complete saved-worker/history suites remain a separate acceptance step.


## Follow-up implementation review — issue resolved

The reviewer re-read the updated production diff, tool descriptions and the changes to `CONSTRAINED_REGISTRATION.md`, `CLASSICAL_GPA.md`, and `CRYSTALLOGRAPHY_WORKFLOW.md`. The residual status no longer branches on numerical independence warnings, and `held_out_geometry_passed` now uses only `fit_pass and held_pass`. The new one-ULP regression verifies all three simultaneous outcomes: geometry passes, the alias-warning list is nonempty, and independent-validation pass remains null. The reviewer independently reran the eight-test scientific-evidence suite successfully after this change.

The copied source-registration evidence now contains its own `evidence_scope=historical_source_registration_snapshot` and `source_evidence_semantics_version`, in addition to the outer historical/version markers. Thus a legacy true remains explicitly historical even when the nested snapshot is read independently; current comparison admission remains insufficient. Signed-scale correlation, exact-fold output semantics, and conditional GPA transfer limitations are documented.

No unresolved implementation blocker was identified in this reviewed diff. This judgment is limited to the inspected numerical/semantic changes and targeted tests. Actual baseline-versus-current saved +23°/pseudo-holdout workflows, legacy byte preservation, affected suites, `npm test`, and `npm run test:science` must be reported by the implementation author; this review does not claim those runs have already completed.
