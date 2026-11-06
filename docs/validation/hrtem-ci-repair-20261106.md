# HRTEM CI repair, 2026-11-06

Review base: `4c7f0ad3a6b3614977ca596b5a66289e5caa7177` (PR #133).
The new commit is recorded in the external review receipt, rather than made
self-referential here. This increment has not been pushed or run on GitHub.

## Frozen contract and useful guidance

The standalone compiled compatibility job rejected the changed `image_export`
description. `docs/F4_F2A_INTEGRATION.md` requires exact legacy descriptions and
schemas, except named additive contracts. Restore the frozen `image_export`
description verbatim; do not weaken the comparator or update its baseline.
Keep the newer export advice in the already additive `image_method_plan` and
`image_discovery_review` descriptions. Report export contains saved JSON/text,
available PNG and provenance; amplitude/masks require exporting the GPA object.
The export implementation, scientific calculations and saved records are unchanged.

## Explicit portable CI coverage

`quick.yml` now explicitly invokes these files with
`python -B -m unittest discover -s tests -p '<filename>' -v`:

| Existing job | Explicit test files |
| --- | --- |
| `classical-gpa` | `test_gpa_assessment_compatibility.py`, `test_peak_comparison.py`, `test_peak_comparison_feedback.py`, `test_peak_summary_read_compatibility.py` |
| `projected-topology` | `test_hrtem_candidate_chain.py`, `test_hrtem_baseline_closeout.py` |

No fixture is generated to replace a historical artifact. Without
`HRTEM_HANDOFF_ROOT`, two original-GPA and two original-plan tests really skip.
Without `HRTEM_TASK_B_LEGACY_ROOT`, one historical Task B test really skips.
The portable tests still execute. A skip does not qualify historical migration.
No original package or private specimen image is uploaded: added fixture bytes
are **zero**. No fixture distribution framework or CI environment secret is added.
Existing job routing, gates and timeouts are retained; the hosted runner's actual
duration and result must be checked after a separately reviewed push.

## Local commands and results

Windows; Node 24.16; Python 3.13. All writable test temporaries are in the sibling
`hrtem-ci-repair-evidence-20261106/tmp` directory. Full logs remain in that sibling
directory. Commands below run from the repository; use the explicit installed
Python executable when reproducing in this environment.

| Command / scope | Observed result |
| --- | --- |
| `npm run build` | PASS |
| `npm run test:compiled:compat` (complete original entry point) | PASS, 3/3, zero skips; reached the frozen-JS workspace, copied plugin, request/context/export/remeasure and Panel asset checks |
| All six explicit Python files above, with both historical roots unset | PASS, 35 tests: 30 passed, 5 genuine historical skips; 184.828 s |
| Actual `OriginalHandoff`, `OriginalPlans`, `HistoricalTaskB` classes with the original local roots set | PASS, 5/5, no skips; 58.796 s; original get/result/compact, binding/tamper rejection and before/after package inventory hashes |
| `node --test dist/tests/discovery-contract.test.mjs dist/tests/method-loop-contract.test.mjs dist/tests/image-evidence-contract.test.mjs` | PASS, 11/11 |
| Python `ci_gate_test` and `ci_workflow_test` | PASS, 13/13 |
| `python -B -m unittest discover -s tests -p 'ci_*_test.py' -v` | FAILED locally: 35 tests, 30 subtest/test errors, all from CI-scope subprocess startup at unavailable WindowsApps `bash.exe` (`WinError 1920`); gate and workflow tests passed. No classifier code was changed to hide this limitation. |
| Hosted CI at this new commit | NOT RUN; no push or rerun this round |
| Browser gestures, actual specimen workflow, Mac, real material/dislocation confirmation | NOT RUN |

The initial sandboxed full compiled run had 2 passes and 1 failure before catalog
comparison: `EPERM` when the frozen implementation created its own temporary
hard link. After inspecting the test and obtaining tool approval for this exact
local command using the same authorized temporary directory, the complete host
run passed 3/3 in 34.714 s. No frozen source, helper, filesystem setting, tolerance
or test assertion was changed. Both logs are retained (`compiled-compat-full.log`,
`compiled-compat-host.log`). This is separate from the original CI description
regression, which the restored description addresses.

Portable reproduction without historical roots:

```python
import sys, unittest
sys.path.insert(0, "tests")
names = (
    "test_gpa_assessment_compatibility", "test_peak_comparison",
    "test_peak_comparison_feedback", "test_peak_summary_read_compatibility",
    "test_hrtem_candidate_chain", "test_hrtem_baseline_closeout",
)
suite = unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromName(n) for n in names)
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not result.wasSuccessful())
```

Historical reproduction uses the same loader with names
`test_gpa_assessment_compatibility.OriginalHandoff`,
`test_peak_summary_read_compatibility.OriginalPlans` and
`test_hrtem_candidate_chain.HistoricalTaskB`, and these existing local roots:

```text
HRTEM_HANDOFF_ROOT=<authorized workspace>/hrtem-handoff-drive-20261106/payload/hrtem-baseline-integration
HRTEM_TASK_B_LEGACY_ROOT=<authorized workspace>/hrtem-task-b-evidence-20261106
```

These local historical passes are not remote CI evidence. The exact local log
and review artifact hashes are recorded outside Git. No source image, private
Drive identifier, authenticated download link or application session token is
included in this repository document.

## Researcher E2E preparation boundary

The user-selected DM3 original has been identified through its original private
Drive folder, but local scientific bytes and the required DM reader are not yet
available. A private preparation note outside Git records the exact source and
environment. The supported reader is `rosettasciio==0.15.0` from
`requirements-dm4.txt`; it is missing from the selected Python. Built browser
Inspector entry points and Chrome are available; the Electron executable is
absent. No software was installed and no product session or specimen analysis
was launched this round.

The bounded proposed question is whether visible local periodicity/direction
and contrast differ between an explicitly selected band region and a nearby
reference. It requires inspecting actual pixels and that file's own dataset,
axes and calibration first. No coordinates or calibration from another image
are borrowed. The intended path is source/catalog -> explicit image/ROI ->
profile/FFT/measurement evidence -> saved export -> reopen original identities.
GPA is conditional on its existing prerequisites; the paused real-image
dislocation-confirmation path is not resumed. Automated synthetic tests do not
replace this still-pending human-facing product exercise.
