# TypeScript slice 2 — registry and MCP stdio contracts

Tracks [#15](https://github.com/wuchqwq/microscopy-workbench/issues/15), stacked on
PR #17 at `7ba5a35750accf62f7211e32468d975a70eeffc8`. This branch does not merge
its dependency or move the frozen R3 comparison.

## Scope and real type boundaries

`lib/runtime/tool_registry.mts` and `stdio_mcp_server.mts` replace their old
business `.mjs` files; the build emits the same relative runtime paths. Both
consume `contracts.mts`. Production registration, dispatch, stream input and
error construction now use these checked contracts.

- New TS modules register through `RegistryModule`: explicit enablement,
  object-root input Schema, execution/side-effect/recovery metadata and handlers.
  The implementation still accepts `unknown` internally and runs every existing
  registration check, preserving dynamic JS callers and registration atomicity.
- The single Schema type source distinguishes scalar, array and object
  containers (including nullable variants), requires their corresponding fields,
  and represents partial combinator clauses. `checkSchema` narrows unknown
  registration metadata; `validate` keeps its original argument checks.
- JSON-RPC IDs remain string/number transport identities, in a typed in-flight
  map. Parsed JSON and tool arguments start as `unknown`; they do not become
  provider request IDs, scientific records or completed tasks by declaration.
- Text/image tool content and request-identity **policies** are explicit unions.
  Unmigrated JS handler outputs remain `unknown` at the registry port, since this
  code never validated those results. A typed handler can promise `ToolResult`
  when constructing it. There is no fabricated schema-to-science type inference.

Localized casts express checked function/property seams and native JS property
access. They preserve the old getter read order and error behavior, including
non-Error rejection values; they do not replace JSON, parameter or provider
validation. Type-negative checks exercise incorrect registration, Schema,
content, policy and result assumptions.

Registration accepts `oneOf`/`anyOf`/`allOf`/`not` metadata, while the existing
argument validator does not implement those combinators. This slice deliberately
does not start enforcing new rules. Tool names, descriptors, message text,
budgets, side effects and provider recovery behavior are preserved.

## Bounded validation

```sh
npm ci
npm run typecheck
npm test
npm run test:runtime:parity
npm run test:science
npm run test:compiled:compat
```

All runtime tests import emitted `dist/` modules. The standalone parity script
requires the exact frozen Git object `3790b3d57e427010f0a5cbfce8a31143a7883eef`;
the installed runtime itself has no Git/compiler dependency. CI retains the
existing scientific checks and runs parity in the full-history compatibility job.

The new registry tests cover metadata snapshots, registration atomicity,
sealed/closure behavior, invalid Schema/contracts, pre-handler argument refusal,
signal forwarding and trusted accessor-backed registration. Transport scenarios
cover invalid/fragmented JSONL, the UTF-8 byte limit, string versus numeric IDs,
duplicate in-flight rejection, cancellation and late completion/error suppression,
legacy error mapping and idempotent close. The exact frozen and emitted transports
run the same scenarios and compare full wire text, calls and closure.

The existing frozen-workspace and standalone science smokes cover actual
MCP/Python operation, historical restoration/continuation/export, unchanged old
file hashes and FFT reuse. Their bounded public fixture is not every historical
R2/R3/Figure state. Browser assets and science algorithms are unchanged; browser
gestures and native plugin/model loading are not newly qualified by this slice.

Executed locally for this slice: typecheck/build PASS; lightweight Node
290 PASS / 5 existing opt-in SKIP / 0 FAIL; registry/stdio/frozen-parity targeted
checks plus standalone catalog 10 PASS; standalone science smoke PASS; copied-package frozen-workspace
compatibility PASS (48.9 s). The parity fixture compares 37 JSONL responses,
14 provider calls and one close for each implementation. CI results must be read
at the proposed PR head; no scientific threshold or skip was changed.

## Following slices

Migrate ExecutionCoordinator separately, distinguishing waiter state from worker
lifetime and preserving resource retention after timeout/unknown closure. Then
migrate AnalysisContext and its CAS store/bindings without unifying or changing
canonicalization, hash budgets or history. Provider identities and calibration
contracts belong at those actual usage sites rather than unused declarations in
this transport slice. Panel service and browser business modules follow.
