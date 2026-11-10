# Saved-band HRTEM feedback: bounded Windows validation

This is the historical validation at the feedback increment. The later
[analytic read compatibility contract](../GPA_ANALYTIC_READ_COMPATIBILITY.md)
addresses the GPA assessment refusal only; it does not reinterpret the failures
recorded here or grant approximate comparison of upper method decisions.

Base: `7620f4accf1bb1e5857cf6347da3d077ef55a11c` (Task A), whose parent
is `31f4f014a4293d24de72402727b1efd084fc1022`. Work is isolated in
`hrtem-baseline-local-20261106`, branch `research/hrtem-baseline-local-20261106`.
The old F: repositories, original main, STEM work and transferred evidence were
not modified. No push or merge was performed.

## Change and practical scope

The old saved comparison preview contained a status and generic disclaimer.
New previews show each band's ROI/reference amplitude ratio, signed wrapped
phase difference, valid support and low-amplitude count. Units and display
rounding are stated. The text sidecar adds amplitude/phase admission,
coherence/reasons and next analysis suggestions. Missing phase does not erase
an admitted amplitude comparison. The advice never dispatches another tool.

Numerical summaries, thresholds, source admission, budget accounting, frozen
decision validation and historical artifacts retain their existing behavior.
The capability map and Agent route describe when FFT measurements, saved-band
comparison, GPA or topology can address the research question, and where to stop.
This is not Task B or general raw single-carrier HRTEM ingress.

## Transfer and original evidence

Both Drive parts matched their specified sizes and SHA-256. The merged ZIP was
118713431 bytes, SHA-256
`4f504051d98b81395a02326fa32b6271ca2b467b24c22975b1c0e1afb01625c7`.
ZIP CRC, all 87 manifest entries (86 evidence files and one bundle), and
`git bundle verify` passed. The bundle contains complete history and the exact
Task A commit. A fresh clone uses LF checkout and a new local branch; no old
checkout was used as a substitute.

**Original provider reopen: FAIL on this host.** Both transferred method plans
are rejected by the unchanged GPA validator: `GPA evidence semantics or analytic
transfer changed`. Static comparison finds nine analytic-transfer floating
values differing by up to about `1.11e-16`. This is not a byte-hash failure or
evidence of a material change. No tolerance, saved number, identity or old result
was altered to accept the transfer. The source of the platform/library rounding
difference and a compatible validation design remain unresolved.

## Executed checks

Environment: Windows, Node 24.16.0, Python 3.13.2, NumPy 2.2.6, SciPy 1.15.3,
scikit-image 0.26.0, tifffile 2026.3.3, Pillow 11.2.1. Test `TMP`/`TEMP` point
to the dedicated `hrtem-baseline-local-evidence-20261106/test-temp` sibling.

| Command or check | Outcome |
| --- | --- |
| `python -m unittest discover -s tests -p test_peak_comparison.py` | PASS, 6 tests after the inherited UTF-8 test-read fix |
| `python -m unittest discover -s tests -p 'test_method_*.py'` | PASS, 19 tests |
| `python -m unittest discover -s tests -p image_method_journal_test.py` | PASS, 11 tests |
| `npm run build` | PASS, standalone runtime and copied assets |
| `node --test dist/tests/method-loop-contract.test.mjs dist/tests/method-journal-contract.test.mjs` | PASS, 4 tests |
| Exact transferred synthetic inputs and request parameters, rebound to new local source paths and IDs | PASS, positive/abstention cases; each local plan reopens |
| `image_method_next` on those saved local plans | PASS, unchanged decisions; zero additional FFT/GPA; all 33 preceding object files per case unchanged |
| Direct synthetic incoherent-phase summary | PASS, amplitude ratio 1 retained, phase unavailable, matching feedback |
| Original package hashes after replay | PASS, all 87 entries unchanged |
| Actual PNG inspection | PASS for positive and abstention feedback; values, support and advice visible |
| `git diff --check` and changed-document local links | PASS |

Local replay executes one **new** FFT and one GPA per transferred synthetic
source in separate new workspaces to qualify this host. It does not repair,
replace or adopt the original execution. Comparing or revising the resulting
saved bands adds no FFT/GPA. Known answers are amplitude ratio about 1.6 and
wrapped phase about +0.4/-0.4 rad; the dark region retains null comparisons.

## Initial failures retained separately

- The initial download failed DNS resolution before receiving bytes. A later
  download completed.
- Offline npm installation missed cached `undici-types`; a normal locked local
  dependency install completed. No global settings
  or scientific package installations were changed.
- The first test invocation used an inaccessible sandbox virtual temporary
  directory. Tests were rerun using a dedicated workspace temporary directory.
- The next comparison run had one inherited test decoding UTF-8 with Windows
  default GBK. Only that test's `read_text` encoding was corrected; the six-test
  rerun passed. The first failed log remains separate.
- The first local replay harness assumed a nested journal response and failed
  before scientific dispatch. After inspecting the actual flattened stored
  response, its field lookup was corrected; a fresh run directory was used.

Local logs, replay script, full responses, analytic differences, new workspaces
and feedback references are in sibling
`hrtem-baseline-local-evidence-20261106`; transfer verification and original
payload are in sibling `hrtem-handoff-drive-20261106`. These are local review
artifacts, not remotely published fixtures.

## NOT_TESTED and remaining scope

No live GUI interaction, human usability acceptance, real specimen/strain or
dislocation accuracy, noise/parameter robustness, Mac qualification or full
unrelated suite was run. Preview inspection is not GUI acceptance. Task B lacks
an agreed input/output/acceptance definition in this handoff. Original provider
cross-environment reopening remains a blocker to claiming complete closeout.
The parent must independently review this increment before any remote update.
