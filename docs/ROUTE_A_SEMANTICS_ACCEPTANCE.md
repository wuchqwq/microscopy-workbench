# Route A semantics: implementation and executed evidence

This increment implements the optional v1 contract in `SCIENTIFIC_RESULT_CONTRACT.md`.
The historical state audit remains in `SCIENTIFIC_STATUS_AUDIT.md`. Base is contract
commit `4b16ea6a719ad11d001905144a9b3b1c9b621217` on #64 → #63 → #61 → #60 →
#59 → #58 → #57. Main and #54 were not included or changed by this branch.

## Changes and limits

`tools/result_semantics.py` is the common publication adapter. It adds scoped
numerical checks, measurement qualifications and conditional interpretations to
explicitly supported image and structure results. Existing algorithms, scientific
thresholds, `valid`/other states and original interpretations are unchanged.
No aggregate confidence or statistical detector is introduced. Each satisfied row
names an actual owning check and existing source fields; noise significance,
localization uncertainty and resolvability remain unassessed when unmeasured.
One-direction feature insufficiency does not invalidate its constituent period.

New display objects do not inherit their parent's assessment. Original requests
return their original response. Historical missing fields stay absent; unknown
future versions remain raw and uninterpreted. A known v1 is checked against its
own saved diagnostics, not recomputed FFTs. Software provenance records the helper
hash. Future semantic rule changes require a new version, not changing v1 reads.

Panel and compact evidence deliver an exact bounded copy: 24 KiB UTF-8, at most
12 rows per layer and 8 source references per row, finite JSON, bounded strings.
Malformed/unknown/oversized presentation is explicitly unavailable, never
truncated into a plausible assessment. Legacy absence is not_recorded. Ordinary
measurement detail retains current/stale/history separately. Current-image cards
never borrow an older last_operation; domain, crystal and joint evidence retain
their own IDs. Historical peak producer metadata survives projection so its
missing assessment is visible. Full original-object reads remain authoritative.

The Skill reference `route-a-decisions.md` permits justified autonomous working
choices, with choice/actor → reason → evidence → execution → outcome → unknown.
It does not require a fixed workflow, full field, simulation or user approval at
every step. Declared physical assumptions and candidate preferences are distinct
from observations. Generic AI notes do not use twinning's user_confirmed authority.

## Confirmed implementation errors

1. **Selection authorship:** frozen #64 `image_discovery._candidate` marked an
   Agent's explicit ROI as researcher_statement. Original TIFF, requests, arrays
   and outputs are in `route_a_semantics_evidence/selection-origin-original.tar.gz`.
   New discovery v2 adds caller-reported researcher/agent/unspecified origin;
   default is unspecified. v1 parameter reconstruction and candidate hashes remain
   unchanged; a new review can reference an old candidate without reinterpreting it.
2. **In-development projection defects:** independent review caught stale
   last_operation display, incomplete compact shape checking, unbounded domain
   delivery, joint-observation omission and legacy-peak discriminator loss.
   Original failing projection/HTTP results are retained in review-failures.tar.gz.
   These are delivery bugs, not evidence for changing scientific thresholds.

GPT-6 astra was actually selected as the independent reviewer. Its original report
and failures are included. Owning numerical checks were inspected; two final Panel
omissions were reproduced with a real HTTP server and controlled provider records,
then fixed and regression-tested. That evidence is not browser or scientific-array
validation. Independent review is additional scrutiny, not a proof of correctness.

## Executed validation

Exact logs, package versions and artifact SHA-256 values are in
`route_a_semantics_evidence/`. Python used the existing exact locked environment
`fft-controlled-noise-20261102/.venv`: Python 3.13.18, NumPy 2.5.4, SciPy 1.18.1;
Node dependencies were installed with `npm ci` from package-lock.json.

- `npm run typecheck`, build and full Node suite: **421 PASS, 5 conditional SKIP**.
- Python owning-science/semantics regression: **93 PASS**, including 19 new focused
  cases, GPA/topology and ASE/diffsims save/recovery. Projection/evidence: **20 PASS**.
  Selection-origin suite plus discovery: **23 PASS**. Counts overlap owning coverage
  and must not be added into a claim of independent evidence.
- `npm run test:science`: actual TIFF → signed calibration → ROI FFT → 0.8 nm
  conditional measurement → direct DFT/NPY → display revision → restart recovery.
- Actual manual-discovery MCP smoke passed, including new declared origin.
- `MICROSCOPY_PYTHON=/ABS/LOCKED/PYTHON npm run test:result-semantics`:
  **80 formal MCP calls**, 16 new result records recovered after restart;
  451 original object/request files unchanged. Actual ASE/diffsims save, simulation,
  registration, single-candidate and general finite comparisons executed.
- Frozen #64 producer (SHA `7f0e523ba287de11c0913abd68f553655f008182`, tree
  `ade267286535291a42f0992fe34d8726318cfdb9`) generated 8 historical image records;
  current MCP info/original-result recovery retained absent fields and 105 old
  files byte-for-byte. A new child used v1 without backfilling the old FFT.
- Independent direct finite DFT error was `6.3253e-11` under the predeclared `1e-7`
  bound. The original 63×63 constant100+one101 no-window/no-mean counterexample
  remains rejected; the single-direction 8-pixel positive measurement remains.

The 80-call run records actual source/runtime hashes (126 compiled files unchanged),
not merely the nearby Git reference, because the test script and reviewed UI changes
were staged independently. First passing run and initial test-entry import errors
are retained locally; corrected commands/results are identified in the logs.

## What is not established

**Measurement uncertainty:** no new noise significance, localization confidence,
false-discovery rate or experimental accuracy was calibrated by this change.
**Method limits:** FFT image texture, GPA's conditional image-phase model and finite
kinematic candidate comparisons retain their existing assumptions.
**Non-identifiability:** compatible projected candidates remain alternatives; no
unique material, twin, defect or 3D interface is confirmed.

Actual autonomous Agent behavior and #54 dual-entry integration are separate
qualification work, not claimed by this branch. Browser gestures, private/real
specimen accuracy, and frozen old structure-provider compatibility are NOT_TESTED
here. Existing HTTP/DOM tests are not browser acceptance. No branch was merged
into main and no stable baseline or historical scientific record was changed.
