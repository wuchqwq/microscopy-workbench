# Saved-band summary read compatibility: original archive acceptance

Base: `d78653a3bbdddd20efb5b75a369fd7eb36e29b47`, branch
`research/hrtem-baseline-local-20261106`, same isolated C: repository. Initial
HEAD and clean state were verified. No F: access, STEM changes, main movement,
push, merge, Task B or new real-image experiment.

## Minimal contract

The [separate reduction contract](../SAVED_BAND_SUMMARY_READ_COMPATIBILITY.md)
whitelists only four `amplitude_weighted_phase_coherence` slots. All other
decision fields, types, statuses/nulls, source/region/mask/count bindings,
parameters, actions and budget remain exact. Original records are never rewritten.
The existing GPA analytic policy is neither extended nor used as a reduction
tolerance. A fresh read receipt traces the original plan hash and four bound
array hashes; compatibility rechecks those hashes before/after reference work.

An independent 80-digit Decimal weighted sine/cosine reference uses exact saved
binary64 samples. Its enclosure depends on original sample count n, positive
weight sum S, complex magnitude R, roundoff u and underflow eta. It retains
cancellation through an absolute component bound proportional to S, not an
ill-conditioned relative bound proportional to R. Grouping identical samples
accelerates only the reference; it never reduces n in the error estimate.
Every participating region is checked, including unchanged ones. An interval
containing the actual binary64 0.9 threshold refuses compatibility without
changing historical admission, nulls or actions.

## Real original objects, no regenerated substitute

| Original case | Original method plan | get/result/full Python metadata | compact Python and built Node provider |
| --- | --- | --- | --- |
| positive | `ec1a8c8a062b49eaba3ce4250204ff72` | PASS | PASS |
| abstention | `aa5cba25f18040fd8aeedc34ff32a46f` | PASS | PASS |

The accepted diagnostic differences are the three previously observed positive
coherence reductions and one abstention reference reduction. All historical
metadata fields and decisions are preserved exactly on full Python reads;
decisions, IDs, input refs, information, ledger, actions and budget are also
identical in compact responses. Separate GPA and summary receipts are retained.
The entire extracted payload has **88 unchanged files**, including its manifest;
all **87 manifest entries** match their original SHA-256. No FFT/GPA, method
step, new request journal, revision or savepoint was dispatched or saved.

## Negative controls and mathematical checks

- Copies of the genuine positive workspace reject changed source-array bytes,
  seed ID, ROI, reference region, mask bytes, valid count, filter parameter,
  actions and budget. Metadata-only controls reseal the plan manifest and its
  duplicate creator response, ensuring that semantic binding still rejects
  them with `CORRUPT_OBJECT`, rather than relying only on an obvious hash miss.
- Changing status, null, count type, reference, parameters or a cost field in
  direct diagnostic decisions is refused. NaN, infinities and diagnostics
  beyond the enclosure are refused.
- A reference region near 0.9 is refused even when its saved coherence is
  unchanged and the only differing diagnostic is in a safe ROI. No status or
  null is modified on this refusal.
- Equal positive weights with opposing phases exercise cancellation. The
  independent coherence is about 6e-17; zero lies in its absolute enclosure.
  The historical unavailable phase remains unavailable.
- The same 1e-13 diagnostic perturbation is refused at n=64 and admitted at
  n=4096 under the derived bounds, despite identical repeated sample values.
  This checks actual sample count rather than oracle group count.
- Zero weight keeps exact zero; an unresolved subnormal denominator and an
  over-resource reference are refused. These are read limitations, not new
  physical classifications or experimentally calibrated uncertainty.

## Executed commands and results

Windows Python 3.13.2, NumPy 2.2.6, SciPy 1.15.3, scikit-image 0.26.0,
Node 24.16.0. TMP/TEMP use the dedicated authorized evidence temp. Set
`HRTEM_HANDOFF_ROOT` to sibling
`hrtem-handoff-drive-20261106/payload/hrtem-baseline-integration`.

| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests -p test_peak_summary_read_compatibility.py -v` | PASS, 8; genuine archive integration enabled, no skip |
| `python -m unittest discover -s tests -p test_gpa_assessment_compatibility.py -v` | PASS, 7; original GPA checks enabled |
| `python -m unittest discover -s tests -p test_peak_comparison_feedback.py -v` | PASS, 3 |
| `python -m unittest discover -s tests -p test_peak_comparison.py -v` | PASS, 6 |
| `python -m unittest discover -s tests -p 'test_method_*.py' -v` | PASS, 19 |
| `python -m unittest discover -s tests -p image_method_journal_test.py -v` | PASS, 11 |
| `npm run build` | PASS |
| `node --test dist/tests/gpa-contract.test.mjs dist/tests/method-loop-contract.test.mjs dist/tests/method-journal-contract.test.mjs dist/tests/image-evidence-contract.test.mjs` | PASS, 10 |
| Built `ImageWorkspace.call` image_info/image_result compact on both original plans | PASS, four real Node-to-Python queries |
| Original-plan response/hash/control evidence script | PASS, original archive unchanged and controls distinguished |
| `git diff --check`, changed local Markdown links | PASS |

64 distinct tests passed. Focused checks were repeated only after directly
relevant changes. No unrelated full suite or new physical simulation was run.
The old failure reports remain historical; current success is independently
recorded with original objects and unchanged values, not by editing those reports.

## Review artifacts and limits

Sibling `hrtem-summary-compat-evidence-20261106` retains test/build logs, full
original get/result/compact replies, separate receipts and reference intervals,
all payload hashes, sample-count/cancellation/threshold controls, and the actual
built-provider responses. Scripts `check-original-plans.py` and
`check-built-plans.mjs` reproduce those checks from the repository cwd. The review
manifest, commit patch and archive receipt identify the final commit separately.

The observed original-plan reduction blocker is resolved within this contract.
This is not universal cross-platform portability: other diagnostic differences,
unknown versions, ambiguous 0.9 intervals, unresolved denominators and more than
65536 reference samples remain refused. Full inline-image delivery after
relocation, live GUI/human acceptance, Mac, real-material strain/dislocation
accuracy and Task B remain NOT_TESTED/outside this increment. Parent independent
review is still required before any remote update.
