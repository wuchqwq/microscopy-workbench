# Independent workbench import

The first commit `ce90e60db3ef21290ecfa051becdc775166341c1` imports the exported
science package byte-for-byte: 120 source files and `MIGRATION_MANIFEST.json`.
The reviewed recipe is mcp-dm PR #52 at
`97ff8a79bec18eb7547ab8f643fea3d4a4150e94`, using fixed #46
`e6f1301a29cb0d4e6d5e6a4b5856e2cdf6b3169a` and #50
`a158b1ac58af7d3b6e68d9e95afb17becaedfe2c`.
The source integration commit/tree and every copied/template/generated hash are
recorded in that manifest. This is a traceable source snapshot, not a rewritten
history claiming to preserve blame. LICENSE and the original repository remain.

Display naming is a separate commit. Package/server names, environment variables,
tools, scientific schemas and object/request namespaces were not renamed. The
manifest describes the original import; later changes belong to normal Git history.

## Executed acceptance

| Scope | Result |
| --- | --- |
| Independent exact export inventories/SHA, source/template bytes, LICENSE, dotfiles, .github and portable runtime | PASS |
| Initial checkout Git blobs/modes and working files equal science export | PASS |
| New checkout `npm test` | 197 PASS, 0 FAIL, 4 existing opt-in SKIP |
| Real `npm run test:science` with an independent Python environment | PASS |
| Packaged entrypoints/boundary: science | 3 PASS, 0 SKIP |
| Packaged entrypoints/boundary: DM candidate, including actual PowerShell fake-client registrar execution | 5 PASS, 0 SKIP |
| Actual Windows Chrome → new-checkout Panel → stdio → independent Python | PASS |

The browser path used the public `examples/make_microscopy_trial.py` TIFF:
explicit synthetic XY scale → ROI view → local FFT → saved reflection table →
peak drag and linked revision → original saved view → ROI statistics/profile →
actual CSV and paper SVG/PNG downloads. [Actual screenshot](examples/migration/browser-profile.png),
[profile CSV](examples/migration/profile.csv), [measurement CSV](examples/migration/measurements.csv).
Gestures were automated with Computer Use; the GUI required no model session.

Independent reopening checked nearest samples against raw TIFF/NPY, population
statistics, mathematical DFT, measurement coordinates/calibration, and paper
SVG/PNG/recipe identity. Original source and saved arrays stayed unchanged;
exactly one FFT was computed and its exported complex NPY was byte-identical.
The supplied 0.02 nm/px scale is a synthetic control, not experimental calibration.

The checkout, Python environment, source, worker workspace and browser evidence
all lived outside the old repository. Runtime import paths/catalog boundaries
were checked; no DM/GMS startup or real Codex configuration changes were used.
Only the science package was imported here. The separate DM candidate did not
replace the original mcp-dm repository.

Mac-specific device acceptance, actual GMS/native qualification, model vision,
optional ASE/diffsims execution and historical workspace relocation remain
NOT_TESTED in this migration. The previous optional extended-HTTP timeout and
other historical failures remain in the source PR; they are not relabeled PASS.
No complete GMS regression, native build or release was performed.

## Reproduce

Install `requirements-images.txt` into an independent Python environment and
use Node >=18. From this checkout:

```powershell
npm test
# Set MICROSCOPY_PYTHON to that environment's absolute interpreter first.
npm run test:science
python examples/make_microscopy_trial.py C:/analysis/new-synthetic-trial
node tools/researcher_inspector.mjs --source C:/analysis/new-synthetic-trial/periodic-sequence.tiff --workspace C:/analysis/new-workspace --python C:/analysis/image-env/Scripts/python.exe
```

Open the printed private loopback URL and keep the process running. The GUI
settings accept the explicitly synthetic scale; select regions/peaks and use
FFT, measurement, statistics/profile and the two distinct export entrances.
Reuse the workspace to resume saved objects. The optional DM peer is configured
separately; see [client setup](CLIENT_SETUP.md).
