# Microscopy Core — coding boundaries

This repository is the DM-free scientific provider on Windows/macOS/Linux.
Use the existing image/structure tools and scientific journals; do not build
another Agent framework or duplicate numerical engines. No import or install
dependency on mcp-dm, DigitalMicrograph, Gatan SDKs, native DLLs or host scripts.

Keep original data read-only, dtype/axes/signed scales explicit, scientific
arrays distinct from PNG display and annotation layers, calibrated/DC-referenced
measurements traceable, and assumptions distinct from confirmed observations.
Do not infer physical units, image domains, chemical phases or resolved depth.
The saved native-capture verifier validates files only; it does not connect to DM.

Preserve original request IDs and query outcomes after cancellation/timeout;
never replay an unknown side effect. Keep provider journals authoritative and
AnalysisContext reference-only with CAS revisions. Do not alter old source IDs,
hashes, namespaces or worker validation tolerances to make migration pass.

## Regression scope: test the changed layer, do not repeat full suites

Choose regression tests from the actual diff, dependency/consumer impact and
scientific risk. A blanket `npm test` plus `npm run test:science` after every
change is NOT required. Do not run the same unchanged full suite again merely
because another Agent reviewed the work or a CI job already tested the exact SHA.

- **Scientific/numerical changes:** run affected Python algorithm tests with
  independent truths and relevant positive, negative and should-abstain cases.
  Add one narrowly scoped real provider/MCP/serialization check only when that
  boundary is affected. Do not repeat unrelated GUI, model, or whole-product
  tests; large stochastic/noise matrices and optional diffsims only when relevant.
- **Engineering/runtime/GUI changes:** run affected Node/TypeScript, UI and
  protocol/transport tests. Use a minimal representative science smoke only
  when a changed interface carries scientific data; do not rerun unrelated
  Python algorithm suites or expensive physical simulations.
- **Docs/Skills-only changes:** check formatting, links, stated tool contracts,
  and focused Skill/Agent behavior where guidance changed; no routine
  numerical-science or full browser regression.
- **Shared contracts/cross-layer changes:** test both affected sides and a
  bounded end-to-end handoff. Expand beyond this only for a documented
  dependency, regression, or newly found risk. Historical compatibility and
  source/request identity checks are mandatory when touched.

Before merging, check existing CI evidence for the exact commit; do not
manually duplicate already-passing CI runs unless diagnosing a failure or
checking a distinct environment. Repository CI may still independently run
broader suites under its current trigger rules; this instruction governs
discretionary development/regression runs, not an override of CI policy.
Record commands and PASS/FAIL/NOT_TESTED clearly; explain any full-suite run.
Never skip a directly affected safety, provenance or science regression to
save time. Optional structure packages and actual browser/model/Mac/Windows/DM
evidence are separate scopes. No real-host qualification follows from a
successful catalog or synthetic test. Never use private specimen data,
credentials or vendor binaries as fixtures. Do not publish or merge without
owner authorization.
