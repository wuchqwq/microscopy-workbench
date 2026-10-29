# Panel, figure and public entry migration

Stacked after the structure adapter slice. The owned loopback Panel producer,
MCP bridge and registration module, measurement-history reader and Figure asset
hydration are now strict TypeScript. The science composition root, researcher
inspector, package-preparation CLI and science entry are also migrated.

Producer state, draft acknowledgement, selection, pending result and client ports
have actual types used by production code. HTTP/Python/journal JSON remains
unknown until the original checks; identity-only inspection never qualifies
calibration, geometry, numeric measurements or the entire producer state. Late
results, original receipt recovery, numeric-result references, alias/manifest/hash
checks, figure paths and process ownership keep their original semantics.

There is one business implementation per source. The new science-server.mjs is a
compatibility launcher into dist, alongside the two existing startup shims. The
build skips all three shims when assembling the emitted package. Node >=18 and
ESM remain the runtime contract. The UI helper wiring test now allows compiler
whitespace around the same call; its behavior and numerical assertions stay.

Checks before publishing: strict compiled build, existing emitted Node suite
290 PASS / 5 SKIP. Independent bridge review/differential cases cover 15 groups,
including omitted-panel ambiguity, queued receipt recovery, abort-only-wait,
request conflicts and bounded failures. The producer/entry independent review
and final integrated browser/legacy-workspace acceptance are recorded separately
when complete, rather than repeating full science validation per type edit.
