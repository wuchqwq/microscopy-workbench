# Versioned GPA analytic read validation: Windows review candidate

This records the `d78653a` scope and its then-unresolved upper-plan refusal.
The later, separate [saved-band summary read contract](../SAVED_BAND_SUMMARY_READ_COMPATIBILITY.md)
addresses coherence reductions without reinterpreting the historical failures
or extending the GPA analytic envelope.

Base: `7b63507c04415087e8f0f79b3e909278b610e43d`, branch
`research/hrtem-baseline-local-20261106`. Same isolated C: clone; no F: access,
STEM changes, main movement, push or merge. No original evidence was rewritten.

## Contract and implementation

Read the [compatibility contract](../GPA_ANALYTIC_READ_COMPATIBILITY.md) for
version eligibility, the closed 37-slot whitelist, gamma(n) derivation and
independent 80-digit Decimal reference. The old numerical kernels and their
tolerances are unchanged. States, structures, types, source/request parameters,
calibration, zeros, identity and payload hashes remain exact. Unknown algorithm
or assessment versions are refused; historical absent assessments stay absent.

The reader checks exact equality first, then permits only enumerated analytic
roundoff within the independent reference envelope. Both stored and locally
recomputed values are checked. The duplicate assessment copies must be identical.
The GPA report mask is now explicitly and exactly bound to submitted mask sigma.
A read receipt separates `exact` and `analytic_compatibility`; compatibility
get/result responses retain it in full metadata and compact evidence. Stored
metadata, creator response and artifacts are untouched. New executions record
the validator helper hash in software provenance.

## Original cross-platform fixture, not a regenerated replacement

The original verified payload is the sibling
`hrtem-handoff-drive-20261106/payload/hrtem-baseline-integration`.

| Original case | GPA ID | Full Python get/result | Built Node provider compact read |
| --- | --- | --- | --- |
| positive | `7d5e0f3f49524593a05a9850f053e1eb` | PASS | PASS |
| abstention | `89e86e9ae4d44cefbbdb7592539607a5` | PASS | PASS |

Each compatibility receipt lists nine actual differing analytic floats. All
original metadata fields match the immutable saved record after reading; all
87 package file hashes match the transferred manifest before/after the checks.
No new FFT, GPA, method step, request journal or savepoint is created.
The checked-in small analytic fixture is explicitly a projection of the real
positive assessment, anchored to original manifest SHA-256
`2df911677bd3b486e5b202bfeb915237d135ad4aba96f7eaa1cfeb222fb65cbc`.
Integration tests require the full real archive and never silently replace it
with a same-platform fixture. Without `HRTEM_HANDOFF_ROOT`, those two integration
tests explicitly skip.

## Executed checks

Windows Python 3.13.2 / NumPy 2.2.6 / SciPy 1.15.3 / scikit-image 0.26.0,
Node 24.16.0. `TMP` and `TEMP` use the authorized dedicated evidence temp.
Set `HRTEM_HANDOFF_ROOT` to the original payload path above.

| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests -p test_gpa_assessment_compatibility.py -v` | PASS, 7; original archive integration enabled, no skip |
| `python -m unittest discover -s tests -p test_peak_comparison_feedback.py -v` | PASS, 3 |
| `python -m unittest discover -s tests -p test_image_gpa_workspace.py` | PASS, 7 |
| `python -m unittest discover -s tests -p test_scientific_evidence_semantics.py` | PASS, 9 |
| `python -m unittest discover -s tests -p 'test_method_*.py'` | PASS, 19 |
| `python -m unittest discover -s tests -p test_peak_comparison.py` | PASS, 6 |
| `python -m unittest discover -s tests -p image_method_journal_test.py` | PASS, 11 |
| `npm run build` | PASS |
| `node --test dist/tests/gpa-contract.test.mjs dist/tests/method-loop-contract.test.mjs dist/tests/method-journal-contract.test.mjs dist/tests/image-evidence-contract.test.mjs` | PASS, 10 |
| Built `ImageWorkspace.call('image_info', {object_id, response_detail:'compact'})` against both original GPA objects | PASS, actual Node-to-Python reads with receipt and original IDs |
| Original archive read/diagnostic script, all original file hashes | PASS, 87 unchanged |
| `git diff --check`, changed-document local links | PASS |

Negative controls include changed journal state, array bytes, resealed wrong
parameters, a coherently regenerated assessment using the wrong report sigma,
resealed material status and resealed excessive analytic gain. All are refused.
Direct validator tests also reject NaN/infinities, excess error in every float
family, changed units/schema/periods/input fields, duplicate-copy disagreement,
future versions and nonzero perturbations of zero transfer. No global dictionary
`isclose` is used. Direct feedback tests cover units, rounding disclosure,
support/low amplitude, no input mutation, and usable amplitude with unavailable
incoherent phase. Focused tests were repeated only after relevant additions.
The first staged whitespace check flagged Windows CRLF on the newly generated
projected JSON test fixture. Only that new fixture was normalized to LF, with
parsed-value equality checked; no original handoff file was changed.

## Remaining refusal: upper Task A plan is not compatible

The original GPA read is repaired, but the old saved comparison plans still
return `CORRUPT_OBJECT: Method decision changed` on this host. Static diagnostics
show three differing `amplitude_weighted_phase_coherence` reductions for the
positive case and one for abstention, each around one binary64 last place.
These are data reductions, not whitelisted analytic functions. They remain
exact and are not admitted, silently changed, regenerated or saved over.
This is a separate unresolved compatibility issue; complete HRTEM closeout and
remote updating remain blocked pending an explicitly scoped review decision.

## Artifacts and untested scope

Sibling `hrtem-compat-evidence-20261106` contains raw logs, built provider replies,
complete original get/result replies, per-field numeric bounds and references,
original hash verification, upper-plan diagnostics and reproducible check scripts.
The commit/diff and review archive are recorded separately after committing.

No Task B, full unrelated suite, real specimen interpretation, material-strain
or dislocation confirmation, new experiment, live GUI/human acceptance, full
inline-image delivery after relocation, Mac run or blanket libm qualification
was performed. This policy enforces its stated envelope and can conservatively
refuse a different library's larger error; it is not a universal portability
certificate. The parent must independently review before any push/merge.
