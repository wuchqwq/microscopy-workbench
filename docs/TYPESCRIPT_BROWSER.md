# Browser business and cross-layer contract migration

This slice follows the Panel PR. It migrates ten actual browser/shared modules:
viewport/history/workflow, annotation layout and measurement workspace, numerical
probes, saved sequence/domain evidence, rendering and Figure export/composition.
Module-local browser ports keep Node and shared ES2022 checks separate without
ambient DOM pollution. Node compilation emits every browser module and the
Panel serves those compiled mjs URLs.

Runtime guards and algorithmic operations are unchanged. An independent review
compared erased runtime ASTs and caught one type qualification error: shallow
composition admission was initially described as a complete producer recipe.
The validator now accepts unknown and returns ShallowCompositionRecipe; nested
scientific anchors, calibration, styles and frame data remain opaque where the
legacy checks do not validate them. readFigureRecipe returns raw style records.
Producer recipes retain their separate actual DTO. Type negative fixtures cover
these boundaries as well as coordinates, read-only snapshots, layouts and numeric
readouts. No new decoder, admission rule or science algorithm was introduced.

Strict typecheck/build and the full emitted Node suite pass: 295 PASS, 5 SKIP.
Affected helper/composition/interaction tests also execute compiled production
handlers. Two source-wiring markers tolerate compiler whitespace while preserving
the original calls, execution and assertions. Independent review found no
remaining blockers after the shallow-result correction. Final browser entry and
integrated old-workspace/real-browser acceptance are the next stacked slice.
