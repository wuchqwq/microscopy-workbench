# Inspector pre-helper failure retry — review fix

This is a bounded fix to PR #51, not another GUI feature or a platform migration.
The starting source tree is `791f4ed2310360b908835c9790f532f850fd0e15`, matching
PR #51 head `77892081ac8e6ae1c117d3757737cd0e9f80a06a`. The CI source archive's
checkout was the PR test merge `0ef07343887d2f5e1f60720d27af9d5f2408a001`;
its extracted Git tree was independently verified equal to that head tree.

## Failure and bounded correction

The Inspector acquires a per-Panel ownership claim before creating/initializing
its bootstrap scientific client. Previously, a synchronous constructor failure,
initialization rejection/error reply, or saved-object read failure could leave
that exclusive claim behind even though no Panel helper had been invoked. An
explicit retry with the original workspace then failed with `EEXIST`.

The Inspector now separates its pre-helper preparation from `openPanel` entry.
Only errors in the former scope may release this attempt's exact ownership lock.
The ownership layer checks the preparing handle, Panel/session/nonce, unchanged
registration, unchanged previous connection (or no connection on first start)
and an untouched empty helper journal. Attempt registrations and old checkpoints
are retained. Loaded helper handles and publication attempts cannot use this
release path; cancelled registration files cannot later launch a helper.

This is **not** a general stale-lock cleanup operation. Once helper entry has
started, an unknown outcome still keeps its claim. A changed nonce, changed
registration, journal activity or competing client also fails closed. Existing
locks left by older versions are not automatically removed.

Scientific request recovery is unchanged: saved startup IDs are queried with
`image_result`, never replayed or renamed. Releasing a helper claim neither
clears a failed scientific request nor makes it successful. No source array,
calibration rule, numerical tolerance or old scientific manifest is modified.

## Independent execution record

Executed in a separate Linux container, using the verified source archive and
controlled providers with real loopback helpers. Before the fix, the expanded
Inspector test suite had 4 PASS / 7 FAIL; the expected regressions reproduced
leftover locks (and the missing safe-rollback refusal diagnostic).

After the fix:

| Check | Result |
| --- | --- |
| Inspector + owned-Panel focused tests | 23 PASS, 0 FAIL, 0 SKIP |
| Full `npm test` (includes build) | 395 PASS, 5 conditional SKIP, 0 FAIL |
| `npm run typecheck` / build | PASS in the local environment below |
| Actual `npm run test:science` | PASS: TIFF, signed scale, ROI FFT, direct DFT, measurement, export, display revision, restart and Panel HTTP; source unchanged |
| Diff whitespace | PASS |

Local versions: Node 22.16.0, Python 3.13.5, NumPy 2.3.5, SciPy 1.17.0,
Pillow 12.3.0 and tifffile 2026.5.15. The container could not perform a network
`npm ci`; its supplemental local build used available TypeScript 5.8.3 and
Node types 22.19.7, **not** the lockfile's TypeScript 5.9.3 / Node types
18.19.130. No dependency manifest or lockfile was changed. GitHub's final-head
CI must separately establish the locked-dependency result.

The targeted cases include constructor and initialize failures, failed saved
reads during cold reopen, bootstrap-close failure after completed startup,
concurrent startup, foreign nonce, loaded/published claims, changed registration,
nonempty journals, unknown helper-entry outcomes and original failed scientific
requests remaining query-only. Old scoped-observation, pending-draft, generation,
capability and unknown-launch regressions remain in the focused suites.

Not executed here: Windows/macOS desktop gestures, the Windows-only forced-idle
helper smoke, frozen-package historical Git compatibility (the source archive
has no parent history), optional actual diffsims, real worker crash injection,
or a new model session. Existing PR #51 evidence retains its own original scope.
This record does not authorize merging, tagging or declaring a Mac release.
