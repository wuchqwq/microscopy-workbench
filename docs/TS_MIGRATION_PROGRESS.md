# TypeScript migration ledger

Frozen functional reference: `3790b3d57e427010f0a5cbfce8a31143a7883eef`.
Remote main at handoff: `3c21d019d19acf2c36af79240f8e4838daaaa56d`.
Neither reference was moved. The stack remains unmerged for owner acceptance.

| Order | PR | Scope |
| --- | --- | --- |
| 1 | #17 | Strict build, schema, coordinates and production entry points |
| 2 | #18 | Runtime registry and MCP stdio contracts |
| 3 | #19 | Execution worker/waiter/closure lifetime and original request observations |
| 4 | #20 | AnalysisContext, portable CAS store and scientific bindings |
| 5 | #21 | Independent image worker/probe and tool composition adapters |
| 6 | #22 | Structure worker, viewer alias/closure and typed browser initializer |
| 7 | #23 | Panel producer/bridge, measurement records, Figure hydration and CLIs |
| 8 | #24 | Browser/shared presentation, probes, evidence and Figure business |
| 9 | #25 (integrated, targets main) | Application entry, raw wire versus scientific types, production-only compiler and unified acceptance |

PRs #18–#24 are stacked for small reviews. PR #25 targets main and includes the
entire stack for one owner acceptance/merge, with no force push or automatic merge.
Review recommendations identify exact heads; CI conclusions apply to those heads.
The [completion guide](TYPESCRIPT_COMPLETE.md) records final source exceptions and
integrated validation. Historical slice guides retain their scope and limits.

Runtime JSON/Python/MCP/HTTP guards remain authoritative. Unknown scientific
payloads, shallow recipe validation and remote UI projections are distinguished
from validated object identities, coordinates, calibration and committed state.
The Python kernel, scientific admission, numerical tolerances, #13 depth preflight
and #14 deferred imports are unchanged.
