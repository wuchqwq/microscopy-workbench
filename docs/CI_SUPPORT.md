# Node support and scoped CI

The core, CLI and packaged provider support **Node 22.x and 24.x**. The separate
desktop development installer requires **22.12+ within 22.x, or 24.x**. Engines
and both root lock entries encode these ranges. TypeScript stays at 5.9.3;
Node typings are pinned to 22.20.5. Typings are not runtime qualification.

Scientific Python retains its existing declared **3.10+** minimum. **3.13 is
recommended and is the CI reference**. The optional configuration registrar
uses `tomllib` and needs **3.11+**. The 3.10 floor and other Python releases
are not continuously qualified. Upstream 3.10 reached end of life on
[2026-10-01](https://devguide.python.org/versions/). Raising the project floor
to 3.11 is a separate support decision requiring minimum-environment checks.
Scientific dependency bounds are unchanged.

## Published maintenance scope

| Job | Change | Cost policy |
| --- | --- | --- |
| `node-smoke` | Existing Linux/Windows matrix becomes Node 22/24 | Still four jobs and the original five-minute timeout. |
| `compiled-compatibility` | Existing Linux compatibility job uses Node 22 | Frozen oracle, exact schemas, original requests and no-replay assertions retained. |
| `science-boundary` | Enables four existing real Panel cases once on Linux | Reuses build/Python install, serial execution, original five-minute job timeout. |

The real cases cover calibrated and pixel-only measurement tables, array
probes/statistics/profiles, and exact spatial/FFT display restoration after a
lost response. Their fixtures explicitly create saved previews and use an exact
owned checkpoint on reopen, following current production guards. Their three
test-file paths select `node` and `boundary`. A missing interpreter/package
fails the opted-in job rather than producing a silent skip.

The existing classifier remains conservative: docs/CSS-only PRs retain their
light routes; unknown/shared dependencies, pushes to main, dispatch and queue
runs retain full selection. Required missing, skipped, failed and cancelled
jobs fail the aggregate gate. `CI scope gate` and `F3b scope gate` names remain.
The Node matrix contexts replace 18 with 24. Detailed branch-protection contexts
could not be read (403); protection was not modified.

Windows Node 22/24 builds and focused runtime checks passed locally. Each real
Panel case has an individual local pass; there is no final complete three-file
aggregate claim. New Linux Node 24 execution and the real Panel job's hosted
Linux duration require the candidate's actual hosted checks. See the
[validation and split receipt](validation/ci-runtime-maintenance-20261104.md).

## Deferred local candidate

The broader local candidate `a2704b78b65b0465b06a29e251d54ce9514e8b1d`
retains the following proposals, which are **not included in this branch**:

- Actions upgrades (checkout/setup-node/setup-python/upload-artifact): upstream
  inputs and static syntax were reviewed; upgraded hosted execution was not run.
- The added Windows/macOS platform-smoke matrix and its gate mapping: the basic
  Windows command has a local pass, but the new platform jobs and macOS command
  do not yet have corresponding hosted/platform validation. The combined addition
  is deferred intact; this branch adds **zero platform jobs**.
- Native Electron startup/installer, current macOS qualification and changes to
  Python minimum requirements are separate unvalidated scopes.

Existing Actions versions, artifact behavior and historical macOS workflow stay
at the baseline on this branch. Scientific dependencies, Electron, validators
and numerical tolerances are unchanged. Historical reports keep their original
versions and qualification scope.
