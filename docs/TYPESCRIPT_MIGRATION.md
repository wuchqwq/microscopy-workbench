# Incremental TypeScript migration — first runnable slice

Tracks [#15](https://github.com/wuchqwq/microscopy-workbench/issues/15).
The comparison remains the exact frozen R3 commit
`3790b3d57e427010f0a5cbfce8a31143a7883eef`; this branch starts at main
`3c21d019d19acf2c36af79240f8e4838daaaa56d`.

## Short engineering audit and decisions

The runtime was ESM JavaScript without a compiler, lockfile or typecheck.
Node and browser share the coordinate transformer. Worker, child-process and
static-resource locations derive from `import.meta.url`, so the build preserves
the existing relative directory layout. Python remains the scientific authority.

TypeScript 5.9.3 and Node 18 typings are pinned as development dependencies.
NodeNext/ES2022 output supports the existing Node >=18 runtime. Migrated modules
use `strict`; shared browser code is additionally checked without Node globals.
The [TypeScript migration guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
and [module options guidance](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
inform the incremental JS/TS build and separate environment checks.

The first production slice is:

- `lib/runtime/schema.mts`: the existing MCP argument validator, with external
  values typed `unknown` and the same runtime checks/errors. Internal schemas
  supply their array items/object properties; localized non-null assertions
  express that pre-existing internal invariant, not external-data validation.
- `ui/image-panel/coordinates.mts`: shared Node/browser transformation, panel and
  selection domain unions, object identity and coordinate centre/edge/bin tags.
  Type-only negative tests reject incompatible spaces and sampling semantics.
- `tools/plugin_server.mts`: configuration parsing from `unknown`, environment
  precedence and CLI startup, with the same validation order and messages.
- `server.mts`: the default entry. Source `server.mjs` and
  `tools/plugin_server.mjs` only launch/export the built implementations.

No second business implementation remains for these modules. Untouched `.mjs`
files pass through the build byte-for-byte (`allowJs`, `checkJs: false` during
transition). They are **not** claimed as strictly migrated. Later PRs migrate
runtime/request and scientific reference contracts (including request/annotation
IDs, calibration and task-state unions), then Node orchestration/Panel service,
then browser business modules. Remove each old implementation as it migrates;
only the two documented checkout entry shims may remain. Python algorithms,
admission, tolerances, #13 preflight and #14 imports are unchanged.

## Source checkout and installed runtime

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:science
npm run test:compiled:compat
```

Build checks the shared and type-negative projects, emits into a private staging
directory, copies runtime assets, and publishes `dist/` only after success. It
removes old output before building and removes staging on failure. A deliberately
injected type error was used to verify both old and staged output are absent
after failure. There is no install/compile step during startup or scientific calls.

`npm start`, `npm run inspect`, all existing science smoke scripts and the Node
test list point into `dist/`. Tests execute from `dist/tests`, so relative imports
resolve the emitted modules. Run direct commands shown in runtime guides from
inside `dist/`, not the mixed source tree. The root checkout entry shims require
an explicit successful build first.

Install/copy **all of `dist/`**, including `.mcp.json`, `.codex-plugin`, `.agents`,
`skills`, `tools/*.py`, `crystallography`, `ui` and documentation. In that package:

```sh
node tools/prepare_plugin.mjs --python /absolute/python --workspace /absolute/workspace --output /absolute/new-connection
node tools/plugin_server.mjs --config /absolute/new-connection/plugin-config.json
```

The installed runtime needs Node/Python and their existing scientific dependencies;
it needs no `node_modules`, compiler, source checkout or Git. Git is used only by
the compatibility **test** to extract the exact frozen comparison version.

## Executed acceptance and scope

- Strict typecheck/build PASS. Existing lightweight Node suite runs against the
  build: 282 PASS / 5 existing opt-in SKIP / 0 FAIL. Skips are not passes.
- Coordinate-specific tests on emitted code: 73 PASS.
- Node 18.20.8 emitted-code smoke: 9 PASS (coordinate constraints, plugin
  settings/relocation and standalone catalog). CI also checks Node 18/22 on
  Linux/Windows; CI results must be read for the actual PR head.
- Compiled standalone science smoke PASS: signed calibration, direct DFT oracle,
  display-only revision, fresh-client original-request recovery and Panel HTTP.
- Default compiled compatibility test PASS (38.8 s). An earlier run failed only
  during Windows temporary-CWD cleanup; the test CWD was corrected and the
  default cleanup path re-run successfully without production changes.
- `test:compiled:compat` creates a public synthetic workspace and full tools/list
  snapshot with frozen JS, closes it, then starts a complete copied build in a
  different directory with spaces, from another CWD and without node_modules.
  It compares schemas, original-request errors/recovery and named AnalysisContext,
  exports/revises a saved measurement, starts the real Panel/Python subprocesses,
  fetches static modules and checks every historical workspace file hash and the
  unchanged single FFT count. This is a bounded fixture, not every R2/R3 state.
- Actual in-app browser loaded that copied package's FFT and measurement table;
  pointer peak selection displayed cycles/pixel using emitted coordinate code.
  Browser error/warning log was empty within this navigation/selection scope.
  [Screenshot](examples/ts-build/compiled-panel.png) uses only public synthetic data.

Native plugin-discovery/model loading, a new Agent continuation session, real
specimens, GMS and macOS are NOT_TESTED in this first slice. Full R2/R3/Figure
history parity and broader type coverage remain later-stage gates; this PR does
not claim the whole application has migrated.

The following [registry and stdio slice](TYPESCRIPT_RUNTIME.md) consumes shared
runtime contracts and adds exact frozen-transport parity checks. It remains a
separate reviewable PR; execution lifetime and AnalysisContext/CAS migration are
subsequent scopes.
