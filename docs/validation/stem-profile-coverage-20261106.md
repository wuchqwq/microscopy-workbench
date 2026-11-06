# P2: expected-site profile coverage

Base: `0ad49d3163793a54dfef38d03a0baa5de9c48f11` on the existing isolated
`feat/stem-expected-site-loop-20261106` branch. No HRTEM, push or merge.

The exact reported counterexample was reproduced before editing: expected XY
`[22.25,22.5]`, profile `[[20,20],[24,20]]`, all actual samples at row20. Version1
incorrectly suggested `review_alternative_causes_or_stop`. The complete result,
request workspace and pre-fix hashes are preserved separately.

## Coverage policy

New reviews use `site_observation.version=2` with
`profile_coverage.policy=finite_segment_nearest_samples_v1`. Every attached
profile stays in both evidence and the assessment list. At least one individual
profile must meet all criteria; geometry from one profile cannot certify
samples of another:

1. Its finite requested segment passes the ORIGINAL expected point. Orthogonal
   distance and finite along-segment bounds use only an eight-ULP arithmetic
   allowance based on endpoint/point/delta/length magnitudes. This is not a
   physical distance tolerance or an infinite-line extension.
2. The ACTUAL saved samples include the expected point's nearest source pixel,
   with the existing `floor(coordinate+0.5)` rule. Its pixel cell is half-open
   `[n-0.5,n+0.5)` in each axis. Endpoints alone or inferred interpolation between
   sparse samples do not prove this.
3. Actual samples at distinct other source pixels occur on both sides of the
   point along the requested finite path. An endpoint or one-sided trace cannot
   complete a request to inspect its neighbourhood.

This is a conservative minimum 1D sampling-support witness, not atom localization,
PSF/physical resolution, statistical uncertainty or proof of adequate background
context. Missing or insufficient coverage remains `not_verified` and recommends
checking coverage or adding a through-site profile. The expected position never
moves. Existing reference conflict/acquisition-information priorities remain.

## Historical semantics

Saved version1 feedback is reconstructed with its original derivation and text;
its old advice is historical and has no new coverage qualification. New reviews
are version2. A deliberate `previous_review_id` revision preserves the old object
and corrects the new next-step advice. Profile numerical-observation summaries
and original requests are unchanged; new coverage reads the already source-bound,
revalidated profile's full saved coordinates/samples.

## Validation

| Command / check | Result |
|---|---|
| `python -B -m unittest discover -s tests -p image_site_observation_test.py -v` | 11 PASS, no skip; includes off-site, through-site, finite extension, endpoint-only, sparse samples, half-open tie, diagonal/reversal, mixed profiles and ROI edge |
| `python -B -m unittest discover -s tests -p image_point_observation_test.py -v` | 11 PASS, no skip; unchanged numerical/source/ROI/reference and legacy contracts |
| `npm run build` | PASS; source/compiled Python and MCP harness byte mirrors checked |
| `node dist/tests/site-observation-stdio-smoke.mjs <fresh absolute directory> --profile-coverage` | 5/5 PASS; actual compiled MCP, JSON/text export, new-process original-ID/info recovery; all original object/request bytes unchanged |
| `python -B <evidence>/check_legacy_revision.py <repo>` | PASS; exact pre-fix v1 result reads unchanged, explicit linked v2 revision corrects next step, old object/request bytes unchanged |
| Preview inspection | Actually inspected delivered off-site/through-site PNGs; original point, retained profile, coverage/reason and next step readable |
| Freeze / whitespace / links | No implementation/harness change after pre-MCP freeze; only final validation narrative/record link updated; `git diff --check` and related document links PASS |

The fixed MCP cases all use expected `[22.25,22.5]`, a 5x5 target mean4 and
three reference means10. They have identical raw differences `[-6,-6,-6]`;
only their supplied profile geometry/sampling changes. These are finite known
scalar answers and sampling checks, not independent physical specimens:

| Profile | Coverage | Reason / next step |
|---|---|---|
| `[[20,20],[24,20]]` | not_verified | Off finite segment; inspect coverage |
| `[[20,22.5],[24,22.5]]` | covered | Target nearest pixel `[22,23]` sampled with two-sided distinct context; review alternatives or stop at observation |
| Same through line, `sample_count=2` | not_verified | Actual endpoints omit target nearest pixel; inspect coverage |
| `[[20,22.5],[22.25,22.5]]` | not_verified | Endpoint has no two-sided sampled neighbourhood |
| Through-line y=`22.499999999999996` | not_verified | Within arithmetic geometric roundoff, but actual nearest samples are row22 while the expected tie maps to row23 |

Runtime is the same local Windows / Node24 / Python3.13 environment as the prior
increment. Full inputs, before/after MCP responses, saved profiles with actual
sample coordinates, provider objects/journals, delivered previews, exports and
freeze hashes are in the separate local `stem-profile-coverage-evidence-20261106`
directory. `before-fix-reproduction.json` records the exact P2 at the base HEAD;
`legacy-v1-to-v2-revision.json` records the immutable old read and deliberate new
revision. `mcp-coverage-v1/results.json` is the complete five-case result.

No R64, simulation, noise draw or FFT/GPA/S2 benchmark was run. No algorithm or
configuration was tuned on these MCP outcomes. The schema/TypeScript contract
was unchanged, so unrelated Node contracts/full suites were not repeated; the
actual changed payload crossed MCP in the bounded run. Remote CI, local Node22,
other platforms, real specimens, physical resolution and human GUI gestures
remain NOT_TESTED. The original bug is retained only as historical version1
semantics, not a new coverage pass. No remaining execution blocker.
