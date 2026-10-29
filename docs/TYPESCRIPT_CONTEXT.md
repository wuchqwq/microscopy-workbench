# TypeScript slice — reference contexts and immutable CAS storage

This slice follows the execution-lifetime PR, retaining the frozen comparison
`3790b3d57e427010f0a5cbfce8a31143a7883eef`.

The context core, file store, scientific bindings and registration adapter now
use strict `.mts` production sources. `context_contracts.mts` separates raw
selection/reference inputs from checked references, current/historical mutation
outcomes, CAS success/failure and store records. `AnalysisId`, `ContextRequestId`
and `ScopedObjectId` are used at internal record/snapshot sites only after their
existing checks; they do not assert provider scientific qualification.

Provider proof fields remain unknown until the core's original proof checks.
In particular, stored `scientific` fields were not all qualified as records by
the old reader and remain `unknown`. The bindings retain manifest identity,
workspace containment, byte/hash, grid, calibration and parent checks. No old
context or scientific object is rewritten to make migration pass.

The three existing canonical/hash implementations and their different budgets
remain separate. CAS revisions, proposal/history recovery, original request
conflicts, invalidation, fingerprinting, namespace and all refusal messages keep
their original behavior.

The original two-file portability regression initially caught a new runtime
dependency after the role constant moved into the contracts module. The constant
now remains in its original owner; contracts derive the role type through an
erased type-only import. The test was not weakened or changed. Both context and
store emitted files remain portable without a contracts runtime dependency.

Independent frozen-JS comparison passed: 14 result/error traces and seven saved
record JSON files are byte-identical; TS reads an old store and continues it
without changing the seven old files; old JS can read the TS-created revision.
The isolated two-file portable creation/recovery probe also passes. Five binding
proof/error cases, including malformed regions and null rows, preserve the old
results and native error wording.

Strict type checks/build and the original full Node suite pass after the
portability fix: 290 PASS / 5 existing opt-in SKIP / 0 FAIL. Real compiled science
and frozen-workspace/relocated-package acceptance are recorded at the proposed
head on the PR, with CI and independent review. This scope does not qualify all
private/real-specimen or native-host workflows.

Provider adapters, Panel and shared/browser business modules follow in separate
PRs. See the [migration ledger](TS_MIGRATION_PROGRESS.md).
