# Explicit ROI origin: original failure and local correction

## Confirmed implementation bug

At frozen #64 `7f0e523ba287de11c0913abd68f553655f008182`, a caller can use the
formal `discovery` worker action with `entry: manual` and an explicitly
Agent-proposed ROI. The producer nevertheless writes `entry_basis:
researcher_statement`. The precise violated rule is source attribution: explicit
coordinates do not imply that a researcher selected them. This is not a FFT
accuracy, noise, or physical identifiability failure.

Original locations: `tools/image_discovery.py:81–95`, report wording at `136`;
the formal MCP tool `image_discovery` describes researcher regions at
`lib/image_discovery_contract.mts:20–27`. The original validator at `269–271`
also reproduces those labels, so changing current words without versioning would
break or silently reinterpret old records.

`original-run/` was produced by the unmodified frozen worker **before** the
correction. It contains the actual synthetic TIFF, source/FFT arrays, immutable
objects and request journals, complete CLI calls, original expected-failure
assertion, and hashes. No recorded object or journal was edited to pass a test.
`environment.json` records the SHA/tree, worker/helper hashes and exact installed
scientific versions; `hashes.json` records source, arrays, requests and outputs.

## Local versioned behavior

- New discovery records use `image-first-discovery-v2`. Manual means explicitly
  supplied ROI coordinates, regardless of actor. `entry_basis` becomes
  `explicit_caller_supplied_roi`.
- Optional `selection_origin` accepts `researcher`, `agent` or `unspecified`
  for manual requests only. Omission stays `unspecified`, even if reason text
  mentions an Agent or researcher. `selection_origin_basis` explicitly says
  `caller_reported_not_authenticated`.
- This is a caller declaration, not identity authentication, numerical
  verification, or a physical confidence claim. Multiple ROIs in one request
  share the declared origin; submit separate records for distinct origins.
- v1 reads reconstruct original parameters, candidate hash and wording with
  the saved v1 policy. No new default is inserted. New reviews may reference a
  v1 candidate verbatim; they do not retrospectively correct its attribution.
- Candidate identity still depends on the source, ROI, entry and policy version,
  not free-text or actor declarations. Record/object identity and saved requests
  distinguish revisions; an origin edit does not imply a new independent image.

No peak criterion, scientific tolerance, numerical algorithm, GUI or Agent
framework was changed by this local correction.

## Executed checks

Environment: the existing independent locked scientific environment at
`/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python`;
no dependencies were installed or changed for this subtask. Exact versions are
in `original-run/environment.json`.

Original reproduction command:

```sh
"/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python" \
  analysis/selection-origin-original/reproduce.py \
  "/Volumes/External SSD/mircograph/peak-quality-guidance-20261102"
```

It saved `FAILED_AS_EXPECTED` for the wrong attribution. The script refuses to
overwrite its output; pass a new output directory to repeat it.

Regression command:

```sh
DISCOVERY_LEGACY_WORKER_ROOT="/Volumes/External SSD/mircograph/peak-quality-guidance-20261102" \
  "/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python" \
  -m unittest -v tests.test_discovery_selection_origin tests.test_image_discovery_workspace
```

Result: **23 tests passed**, zero skipped, logged in `regression.log`. The eight
new tests cover explicit origins, unknown/invalid origins, no actor inference
from text, feature-route separation, revisions, and real old-producer/new-reader
compatibility. The old producer is run as a subprocess at the fixed SHA; its
saved objects are never synthesized by altering a current object or patching a
version constant. If the legacy source environment variable is absent, those
three compatibility tests explicitly report **NOT_TESTED/skipped**.

Separately, the fixed formal Python CLI read and recovered the preserved original
discovery, review and feature records with **6 successful get/result calls**.
The complete returned JSON matched the original responses. All **36 recorded
file hashes stayed unchanged**. Actual calls/responses and worker hashes are in
`original-read-after-fix.json`.

Actual MCP stdio smoke, full Node suite, build/typecheck, browser gestures and
live model behavior are **NOT_TESTED by this subtask**; the parent integration
task owns those checks. The existing MCP manual-flow smoke expectation was
updated for the neutral entry basis and unspecified caller origin.
