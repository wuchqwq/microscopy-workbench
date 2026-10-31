# Manual regions / crystal evidence integration acceptance

Executed 2026-11-01 Asia/Shanghai on Windows x64, Node 24.16.0, independent
Python 3.13.2, NumPy 2.5.4, SciPy 1.18.1, ASE 3.29.0, diffsims 0.7.0 and
diffpy.structure 3.5.0. Actual Chrome used Panel → MCP stdio → Python.
No GMS/DM, global client configuration or experimental original changed.

## Candidate and changes

Main rechecked as `9fbc769`. `integration/manual-crystal-evidence` normally
merged #46@dfda836 (including #44@9ca6b44), then #47@e2ad26b. No old PR/main
was merged on GitHub. #45 stays independent. Both test catalogs/docs were retained.

Actual browser diagnosis found healthy owned state/JS responses but a transitive
`evidence-contracts.mjs` request returning 403, leaving the page loading. The
existing exact whitelist/module-graph fix `79e4866` was reused with
`cherry-pick -x` as `2aa73b1`. The other product delta is pure read-only
`roi_handoff` metadata. No numerical kernel, detector threshold/window, scientific
gate/tolerance, source array or original F3b policy changed.

## Executed results

| Scope | Result |
| --- | --- |
| New coordinate/transport contract | PASS, 7 targeted checks: preserved view/PNG, anchors, source/scale, draft separation and bounded refusal |
| Actual manual → atlas → reviews → generic comparison | PASS, 85.867 s; public analytic FCC image/CIF, correct and wrong-metric actual simulations |
| Independent numerical oracle | Complete FFT arrays match finite direct DFT, max 6.326e-11 at unchanged 1e-7 tolerance; analytic HKL/q and signed metric checked |
| Formal revision/recovery | One anchor changes, other ROI's IDs/values/matching unchanged; exactly 2 FFTs / 2 simulations / 0 full fields; 28 scientific, 251 historical and 422 recovery files preserved |
| Actual browser ROI handoff | PASS for Codex-operated gestures: two saved fractional rectangles, canonical supports [0,0,96,96] / [96,0,192,96], exact frame/scale; not human usability qualification |
| Actual fresh runtime Agent | PASS_LIMITED_SYNTHETIC, changed 192×96 fixture/cell/scale; 19 MCP calls, 10 image blocks, 164.668 s; first reads Panel; no shell/oracle access; direct DFT max 3.210e-9, analytic q error 0 |
| Separate fresh-model recovery | PASS_LIMITED_QUERY_ONLY, 21 query calls / 8 images / 16 distinct original scientific objects; all 263 provider files identical, no new science, global config unchanged; 96.797 s |
| Browser correction/refresh → formal continuation | PASS: actual saved peak drag and explicit GUI measure survives refresh; period 0.15206222307056635 nm vs independent 0.15206222307056633 nm; other ROI unchanged; original 2 FFTs / 2 simulations and 263 old files preserved; 3 original continuation IDs recovered |
| Negative correction | Deliberate peak displacement makes the previous compatible candidate incompatible under unchanged tolerance; not peak-localization accuracy |
| Authorized local private sequence | DATA-PATH PASS: frames 10/20, 2 neighboring supports each, 4 FFTs; frame arrays exactly equal source uint16 TIFF, exported NPY byte-identical, original hash unchanged. PHYSICS_HOLD without independent candidate/reference |
| Lightweight npm | PASS: 335 passed / 6 existing conditional skips / 341 total |
| Strict types / compiled build | PASS |
| Frozen copied-package compatibility | PASS, 2 checks; old schema/workspace/request bytes and one saved FFT preserved |
| Standalone science smoke | PASS: direct DFT, signed scale, export, restart recovery, Panel HTTP |
| General-evidence Python regressions | PASS, 17 geometry/source/recovery checks |

Actual model sessions used the installed CLI default; its name was not emitted.
Exact public Skills were supplied, and scoped MCP tools authorized in an
ephemeral command. No automatic Skill installation/discovery is claimed.
Image blocks show delivery, not visual-recognition accuracy. The model retained
conditional hypotheses, correct A / incorrect B, and no unique phase/twin/3D
relation. Source/config/provider hashes from these sessions are distinct from
later browser edits. No private image was supplied to a model or uploaded.

## Evidence and retained failures

[Numerical summary](validation/manual-crystal/acceptance.json),
[CSV](validation/manual-crystal/reflections.csv),
[revised CSV](validation/manual-crystal/revised-reflections.csv),
[comparison PNG](validation/manual-crystal/general-evidence.png),
[browser rectangles](validation/manual-crystal/gui-two-rois.png),
[browser after correction/refresh](validation/manual-crystal/gui-peak-recovered.png).
These are new records; old automatic 64px misses and the post-hoc 32px diagnostic
are unchanged, not relabeled.

- Initial browser module-load failure is retained, followed by the existing fix.
- Fresh model's first review supplied 9 refs to a max-8 schema: rejected before
  worker/journal. It queried the ID (NOT_FOUND), then submitted a separate bounded
  review with existing FFT/peaks/bulk measurements. No science repeated; not
  cancellation/lost-response injection.
- Recovery also queried a Panel-show ID via `image_result`: NOT_FOUND retained,
  not counted as recovery. Historical presentation receipt recovery was
  NOT_TESTED by that query-only allowlist; current Panel state was read separately.
- Private first export used `output_directory` instead of `output_dir`; schema
  refused before worker. Continuation queried 6 completed original requests before
  new exports. Original failed report remains local.
- First optional GUI continuation checker compared disk -0 against MCP JSON +0
  by JS identity and failed after completed writes. New read-only verification
  queried all 3 original outcomes and compared saved records exactly, with old
  byte hashes and numeric tolerance unchanged. No replay. A local helper's wrong
  response nesting was corrected before presentation dispatch. These are not
  numerical-kernel failures; raw failed logs are preserved.

## Limits / remaining blocker

Changed calibration is correctly refused by old-atlas reuse and stale comparison;
cross-calibration atlas continuation is NOT_IMPLEMENTED. Standalone FFT batches
are not retrofitted into an atlas. Matching children may be rebuilt after a
revision; no zero-compute or speedup claim. Both model timings are observations,
not performance benchmarks. Exact final-HEAD CI is reported on the integration
PR; parent PRs' historical CI is not substituted.

Human-operated usability, automatic plugin discovery, injected worker interruption,
Mac desktop, DM/native, reliable automatic anomaly detection and real-specimen
physical interpretation remain NOT_TESTED.

[Issue #43](https://github.com/wuchqwq/microscopy-workbench/issues/43) remains
open. The authorized sequence's local data path works; physical validation needs
sourced candidate structures/orientations and independent experimental references
and uncertainty. The user's 0.0524 nm/px is user-provided, not independently
verified; phase radians or resolved depth are not inferred. Private paths,
pixels and source hashes are not public fixtures. Data-path PASS does not close
the physical-validation gate.
