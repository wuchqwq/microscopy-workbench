# Receiving-fixture follow-up for #70 / #75

This follow-up changes test clients only. After an actual successful worker
response, they explicitly acknowledge the delivered preview and its saved render
references through `tests/preview_test_support.py`. Failed/unknown calls do not
acknowledge. No production, Skills, detector thresholds or frozen scientific
records are changed.

Updated clients: domain-compare integration, selection-origin fixture, twin
observations, flat-spectrum saved generator, FFT/DC saved generator. Nearby
`controlled_fft_saved.py` also repeatedly builds atlas/field configurations from
one frame, so its successful receiving boundary now acknowledges previews and
captures the resulting real acknowledgement journals. Saved-generator history
loops still recover/replay acknowledgement journals, but do not treat those
control receipts as scientific objects for `get`.

Validation used exact Python:
`/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python`.
From the #70 worktree, commands and results:

| Command (Python above, with `-B`) | Result |
| --- | --- |
| `-m unittest discover -s tests -p image_domain_compare_test.py` | PASS: 14 tests |
| `-m unittest discover -s tests -p test_discovery_selection_origin.py` | PASS: 5 tests, 3 legacy-baseline tests skipped because no frozen baseline supplied |
| `-m unittest discover -s tests -p test_twin_observations.py` | PASS: 7 tests |
| `tests/fixtures/flat_spectrum_saved.py create analysis/issue70-receiving-fixtures-20261102/flat-create` | PASS: 14 explicit science calls; impulse and periodic chains |
| `tests/fixtures/fft_dc_saved.py create analysis/issue70-receiving-fixtures-20261102/dc-create` | PASS: 24 explicit science calls; three source types, two preprocessing contrasts each |

A bounded direct import of `controlled_fft_saved.Harness` generated one fresh
32×64 public cosine TIFF, opened/framed it, then received atlas/feature-field
chains for `none` and `hann` windows: PASS, 6 calls and 6 explicit preview
acknowledgements. Its report is
`analysis/issue70-receiving-fixtures-20261102/controlled-bounded/bounded-report.json`.
This checks the changed receiving boundary without rerunning the full 27/510
source matrix. Generator call logs and manifests live in those new analysis
folders and are not historical evidence replacements.

NOT_TESTED: full scientific matrices, legacy history migration without the
frozen producer, browser/GUI gestures, actual model behavior, real specimen or
physical qualification. Existing frozen evidence files were not modified.
