# Saved-readback P2 repair validation

The reviewed candidate remains at
`3bb096f919a6521eda0dbc9a5def4f3c08f1181b` in its original clean checkout.
This repair uses a separate `--no-hardlinks` local clone and branch
`fix/conditional-s2-readback-p2-20261105`. It changes the Python read validator
and registers its new regression file in the existing CI job. It does not
change the numerical core, thresholds, optimizer, default route or UI.

| Reported problem | Reconstructed gate/source | Negative evidence and legitimate control |
| --- | --- | --- |
| P2-1: a coherent saved background solution could promote a rank-UNKNOWN result to CPE | Original request and resolved pixels rebuild B; zero counts precede zero columns, then SVD of B/column_mass must pass the unchanged 1e-10 gate | Constant100 image with three columns per site at x, x+1e-5, x+2e-5 has ratios 1.4279498711825025e-11 and 1.4279473684711251e-11; the original solver returns UNKNOWN with zero optimizer calls. Candidate accepts forged CPE through get/result/original-ID reuse; repaired reader rejects all three. Genuine rank/zero-count/zero-column UNKNOWN records remain readable. |
| P2-2: dtype, calibration and context could be relabeled with coherent own hashes | NumericReader checks actual NPY dtype; measurement_operand/resolved supplies the original request's selected calibration revision and effective user_context | Independently replaced/deleted metadata, missing null keys, report-only omissions and false-to-number0 changes are rejected through all three read paths. Nonempty context, explicit null value_unit, signed XY scale and calibration revision selected above an older measure all read correctly. |
| Related early-return bypass: coef=None accepted arbitrary UNKNOWN labels; zero-count CPE can have zero projected gradient | Reconstruct the frozen deterministic early diagnostic before coefficient/PG checks; admitted full-rank positive-count results require coefficients | Wrong UNKNOWN labels, zero-count and zero-column promotions, false evaluations and missing optimizer coefficients are refused. Original saved target CPE/reference UNKNOWN_NOT_CONVERGED remains unchanged and readable. |

Both outer object and `column-fit.json` must contain every reconstructible
scientific field returned by `numeric.common`, with identical canonical JSON
values and types. Historical software/runtime provenance is retained; current
package versions are not used to authenticate a historical execution. The
[qualification and threat boundary](READBACK-P2-BOUNDARY.md) explains why these
checks provide source/result consistency rather than external authenticity or
a signature. Here, trusted sources and original request parameters mean the
dependencies held fixed during validation; they are not authenticated external
anchors. An actor able to change the local original-request journal and the
necessary related results/hashes coherently can construct another consistent
analysis of the same image, without rewriting every file in a workspace.
These checks do not authenticate a historical request, optimizer execution,
author or timestamp.

| New evidence run | Result | Actual work |
| --- | --- | --- |
| candidate-attempt-1 | FAIL: 5 groups, 59 assertion/subtest failures, 0 errors | 7 fitter entries, 0 actual optimizers; 58 failures expose accepted bad records/missing rejection. One failure is an incorrectly specified rank fixture: a single pair at1e-5 spacing still passed the rank gate and reached the optimizer mock, which refused execution. This group produced **no P2-1 promotion evidence**. Historical group passed. |
| candidate-rank-attempt-2 | Expected FAIL: 1 group, 6 failed subtests, 0 errors | 2 deterministic fitter entries, 0 optimizers. Corrected, explicitly specified three-column fixture demonstrates original-reader acceptance of forged CPE and wrong UNKNOWN through all three read paths. This is an independent counterexample, not an exact replay of the original review's unspecified geometry. |
| fixed-attempt-1 | PASS: 5 groups, 0 failures/errors/skips | 8 deterministic fitter entries, 0 optimizers. 69 negative read requests return CORRUPT_OBJECT; 21 valid new read requests pass; one direct missing-coefficient check passes. The separate historical group passes 9 get/result/reuse requests for existing fit, export and review objects. |

The historical workspace's complete file/hash map is unchanged before/after
each historical check. The saved target remains CPE and the reference remains
UNKNOWN_NOT_CONVERGED; no new fit or optimizer is permitted by those checks.
New fixture creation also forbids any optimizer. All input TIFF/NPY arrays,
requests, original provider objects, exact coherent forged bytes, source
snapshots and actual read responses remain under the exclusive controlled run
directories in `outputs/conditional-s2-readback-p2/`. They are retained, not
TemporaryDirectory records recreated after teardown. Portable per-case outcomes,
source/raw hashes and redacted original logs are in `validation/readback-p2-*`.
The first attempt's original log and exact source snapshots are separate.

The exact commands, from the repair checkout, were:

```text
python -B scripts/validate_conditional_s2_readback.py --run-id candidate-attempt-1 --implementation-root ../conditional-s2-integration-v1 --historical-workspace ../conditional-s2-integration-v1/outputs/conditional-s2-diagnostic-reproduction-v1/images
python -B -c "import numpy as np;from tools import image_column_model as m;yy,xx=np.mgrid[16:25,16:25];p=np.column_stack([xx.ravel(),yy.ravel()]);B=np.column_stack([m.gaussian_pixels(p,[[20,20],[20.00001,20],[20.00002,20]],1.),m.background_basis(p)]);s=np.linalg.svd(B/B.sum(axis=0),compute_uv=False);print({'three_column_ratio':float(s[-1]/s[0]),'frozen_floor':1e-10})"
python -B scripts/validate_conditional_s2_readback.py --run-id candidate-rank-attempt-2 --only-rank --implementation-root ../conditional-s2-integration-v1 --historical-workspace ../conditional-s2-integration-v1/outputs/conditional-s2-diagnostic-reproduction-v1/images
python -B scripts/validate_conditional_s2_readback.py --run-id fixed-attempt-1 --historical-workspace ../conditional-s2-integration-v1/outputs/conditional-s2-diagnostic-reproduction-v1/images
git diff --check
```

The existing Python3.13.2 / NumPy2.2.6 / SciPy1.15.3 / Pillow11.2.1 environment
was reused without installation. The numerical core SHA256 remains
`6f60e322ba3378b20ea3983f09d21962a2cf56ec4e2336832db160a307bcae80`;
the research source model identity remains
`87c0cf265e2b663e01aea622ec4b7b032930d765ea7b45697f50bb5d9088d210`.
The frozen rank floor1e-10 and projected-gradient limit5e-6 are unchanged.
The fixed adapter's tested bytes and uncommitted source state are identified
in the run record; the eventual local commit contains those same source bytes.
New test/harness files have explicit LF checkout attributes. The original
redacted unittest logs retain their own trailing spaces under a rule scoped to
these new logs. The initial cached whitespace check flagged those spaces;
the final default check passes without editing the archived log content.
An initial staged-hash check also incorrectly compared unchanged platform-CRLF
dependencies against Git's LF blobs. The corrected check proves byte identity
for the changed adapter, frozen core, new tests and harness, and separately
checks the unchanged dependency working bytes against the recorded test hashes.
No science test was rerun for these archive/checkout checks.

Two default-sandbox local clone attempts failed before creating a target with
Git MSYS `NtCreateDirectoryObject` error0xC0000022; the second added `--local`
before the trusted-history check. The execution record preserves that ordering.
After checking target nonexistence and reading trusted conversation history,
one controlled `require_escalated` retry of the local clone succeeded. No ACL
change or alternate-path workaround occurred, and no test write was denied in
this repair round. No unresolved permission blocker remains.

No Node/stdio rerun was necessary for this Python-only read-validation change:
the three worker read/recovery paths and saved export/review dependency paths
are covered directly. No broad numerical suite, CI run, scientific matrix,
training or physical simulation was rerun. Full CI remains NOT_TESTED locally.
The scientific gate remains **FAIL** at10.034456% >10%; formal blind acceptance
remains **NOT_TESTED**. This branch is local only; it has not been pushed or merged.
