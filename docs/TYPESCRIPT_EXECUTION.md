# TypeScript slice — execution lifetime and observation

Stacked on PR #18 (`d3ecc0b`), with the scientific comparison still pinned to
`3790b3d57e427010f0a5cbfce8a31143a7883eef`.

`execution_coordinator.mts` and `execution_module.mts` replace the old business
JS. The exported contracts are consumed by the running coordinator, observation
adapter and subsequent provider adapters. Generic worker results remain separate
from frozen parameters and durable provider outcomes.

The receipt models `WorkerState`, `WaitState` and `closed` independently. A stopped
waiter does not prove that a worker stopped; a completed result does not prove
closure. Recovery uses a query port and cannot acquire write resources. The
provider request brand records the identity checked by the existing coordinator,
not proof that the provider journal contains a completed result.

Canonical JSON, hashing, original request scope, FIFO/resource scheduling,
capacity, cancellation, timeout, stop requests, close rejection and resource
release retain their existing implementations and errors. Type-only negative
checks cover invalid recovery ports/resources, result types and state confusion.
No scientific validation is removed or moved into TypeScript.

The build now inventories migrated production sources and refuses to publish a
runtime if any `.mts` module lacks its corresponding emitted `.mjs`. Untouched
JS and Python assets retain their existing pass-through behavior. This prevents
a future browser-only migration from silently missing its runtime artifact.

Executed before publication: strict checks/build PASS; emitted execution tests
32/32 PASS; full lightweight Node 290 PASS / 5 existing opt-in SKIP / 0 FAIL;
actual standalone MCP/Python science smoke PASS; exact frozen-workspace to copied
compiled-plugin compatibility PASS, with old hashes and one FFT preserved.
CI evidence and independent review are recorded on the PR at its exact head.

AnalysisContext/CAS/binding types are the next independent slice. Their separate
canonical/hash budgets remain unchanged. Provider, Panel and browser business
modules remain in progress in the [full migration ledger](TS_MIGRATION_PROGRESS.md).
