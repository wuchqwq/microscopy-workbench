# Full TypeScript migration ledger

Frozen scientific comparison: `3790b3d57e427010f0a5cbfce8a31143a7883eef`.
Owner instruction: complete the remaining business-source migration continuously
in small, reviewed, tested PRs, without merging or moving the baseline branch.

## Completed and published

| Slice | PR | Head | Scope |
| --- | --- | --- | --- |
| Build and first production modules | #17 | `7ba5a35` | Strict build, coordinates, schema, plugin/default entry; independent review recommendation posted; all seven CI jobs pass. |
| Core registry and MCP transport | #18 | `d3ecc0b` | Real registry/stdio contracts, exact frozen wire parity; all seven CI jobs pass. |
| Execution lifetime and observations | #19 | `c22dedd` | Separate waiter/worker/closure states; independent trace/type review and all seven CI jobs pass. |
| AnalysisContext and bindings | #20 | `2dc8fb5` | CAS, original request recovery, portable store, byte and bidirectional old/new compatibility; independent review and all seven CI jobs pass. |

All PRs remain unmerged. Later branches will be stacked and their dependencies
stated explicitly; published branch history will not be rewritten.

## Remaining sequence

1. ExecutionCoordinator and execution observation: waiter versus worker lifetime,
   scoped original-request identity, timeout/cancellation/resource retention.
2. AnalysisContext, CAS store and binding/module adapters: preserve independent
   canonical/hash implementations, original request recovery and revision bytes.
3. Image/structure providers and registration/composition adapters: retain Python
   authority, worker/process boundaries, metadata/measurement binding and guards.
4. Panel, figure hydration, structure viewer and public CLIs: preserve paths,
   child processes, drafts/late-result behavior, asset identity and relocation.
5. Shared/browser business modules: explicit Node/shared/DOM checks and emission;
   production uses the compiled modules in the actual browser.
6. Final inventory and historical acceptance: no residual business JS or duplicate
   implementations, documented boot/test exceptions, frozen workspace/schema and
   broader R2/R3/Figure continuation, installed-package/browser/new-Agent evidence.

Each slice records actual PASS/FAIL/NOT_TESTED evidence and an independent review.
No scientific algorithm, admission or numerical-tolerance changes belong here.
Runtime checks remain authoritative at JSON/Python/MCP/HTTP boundaries; TypeScript
does not qualify an unknown result as valid, calibrated or completed science.
