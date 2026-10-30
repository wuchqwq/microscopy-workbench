# F4-lite acceptance record

Implementation begins from Draft PR #28 at `4449508`, based on main `3ac32f8`.
Later remote checks found main `c22dacb` and then `562416c` (documentation/CI merges);
PR #28 remained Draft at its frozen implementation. This stacked increment does
not rewrite that baseline or merge it into main.
This record is for reusable software and public analytic fixtures. It does not
qualify experimental specimens, physical boundary accuracy or phase labels.

| Scope | Status | Evidence |
| --- | --- | --- |
| Public analytic fixture generator | PASS | Analytic cosine vectors, fixed masks/positions and seeded controls; no FFT-generated truth. |
| Compiled MCP → Python active loop | PASS | Actual Windows compiled plugin: proposals → explicit additions → revised maps → budget stop, plus measurement correction without new FFT. |
| Fixed-budget uniform/stratified/active comparison | PASS execution; finite misses retained | Every strategy actually used eight windows /20,480 FFT pixels. Shifted narrow-strip boundary support was missed by all three policies. |
| Incremental identity/recovery/export | PASS | Old FFT IDs/hashes and unaffected measurements remained unchanged; exact new-FFT deltas, original-request/new-client recovery, named context CAS and scientific export checks passed. |
| Fresh compatible Agent | PASS, scoped explicit loading | Real ephemeral Codex model session loaded the packaged Skill and configured MCP provider, chose two saved actions, updated/recovered/exported the result and stopped. One initial Panel-absence error was handled. |
| Native plugin auto-discovery | NOT_TESTED | The actual model used an explicit temporary MCP configuration and packaged Skill; this does not qualify automatic marketplace/plugin discovery. |
| Actual browser gestures | NOT_TESTED | Prior Computer Use URL-safety stop is retained; no bypass. |
| Real specimen/GPA/twin/dislocation claims | NOT_TESTED | Outside this increment. |

## Preregistered finite controls

The main 128×128 source cases use the F1a reciprocal tones, a two-orientation
boundary, a translated boundary, 32-pixel strips centred at 48, 64 and 88 pixels,
single/translated patterns, constant data, fixed seeded noise and square
symmetry. The centre-64 strip reproduces F1a's analytic `[64,0,192,128]` crop.
The provider and a fresh Agent never receive the oracle, expected B vectors or
mask coordinates. A separate 160×160 consumer input is reserved for the model.

All benchmark strategies use the same initial 4×64 windows, FFT settings,
detector threshold 0.18 and bounded measurement engine. New-window comparisons
use 32-pixel windows. Uniform positions are geometric, stratified positions use
seed 20261030, and active positions come only from saved formal proposals.
Evaluation uses a preregistered 0.025 cycles/pixel antipodal vector tolerance;
this is a finite detection metric, not uncertainty or a fitted calibration.
The new comparison preregistered quadratic peak refinement, map tolerance
0.01 cycles/pixel and generic angle hypotheses `[0,30,45,60,90]`. Frozen F1a used
no sub-bin refinement, tolerance 0.003 and its submitted known-angle hypotheses.
Thus the narrow input reproduces the analytic crop, not the complete F1a
measurement settings. F1a's recorded coarse miss remains unchanged; differences
from that historical run cannot be attributed solely to the active policy.

Reports retain raw requests, every failed run, actual FFT/window pixels, usable
and unknown samples, B-vector evidence, boundary supports/false positives,
elapsed tool/decision cost and source hashes. A missed narrow strip stays a
miss. The benchmark makes no guaranteed gain or speedup claim. Startup or an
unreported worker phase remains unknown rather than being assigned zero.
Strategies run sequentially through the same Windows/Python installation;
there is no CPU affinity or exclusive-machine timing isolation. Their elapsed
times include validation, rendering, persistence and protocol waits, so these
measurements describe the actual acceptance workload rather than algorithm-only
benchmarks or a universal performance ratio.
The active-run wall time also includes its deliberate stale-proposal refusal
check. That acceptance-only cost is reported separately where its journal/tool
timing is available; it is not decision-algorithm work and creates no FFT.
The seeded-noise control explicitly retains at most four peaks, while the
signal/square controls and all comparison strategies retain at most sixteen.
Its quality stop and absence of a boundary qualify that declared finite control,
not every detector setting or every noisy image.

## Executed Windows scientific path

The independent environment was Windows 11, Node 24.16.0, Python 3.13.2, NumPy
2.5.4, SciPy 1.18.1, tifffile 2026.10.15 and Pillow 12.3.0. The compiled protocol run completed
in 1,172.934 seconds. Its acceptance-only baselines and controls account for
84 FFT objects and 233,472 FFT pixels across 114 formal calls. These totals are
not the cost of one user's eight-window task.

Each append created exactly its selected FFT count. All initial spectrum IDs
and data hashes survived; copied observations retained their ROI, detector and
measurement references. An explicit saved-measurement correction created a new
field/map with zero FFTs, retained the old measurement manifest and left the
unmodified measurement lists intact. Duplicate ROI and stale-proposal requests
were rejected without an extra FFT. Expected refusal receipts remain in the
private run journal; they were not overwritten or counted as successful writes.

Field and domain exports were independently hashed against their returned
manifests. The named AnalysisContext and exact original field request recovered
from a new MCP client without new FFTs. Panel HTTP returned 200 and actual
`image_panel_current` calls returned valid source-bound PNG blocks for a saved
proposal, extended field and final stop proposal. This establishes real
Panel/MCP content, **not actual browser gestures**.

Sanitized public evidence is in [summary.json](examples/f4/summary.json),
[benchmark.csv](examples/f4/benchmark.csv) and
[observations.csv](examples/f4/observations.csv). The summary preserves source
hashes and original spectrum identities/hashes without local paths, access
fragments or private configuration. Actual provider previews are
[proposal](examples/f4/proposal.png), [field](examples/f4/field.png) and
[domain candidates](examples/f4/domains.png); they are not browser screenshots.

## Fixed-budget observations and preserved misses

`New B` means added windows with both expected antipodal reciprocal vectors
within the preregistered tolerance; it does not identify a phase or establish a
pure window. `Bands` counts finite support bands intersecting an analytic
interface. A wide intersecting band is not accurate boundary localization.

| Input | Strategy | New B observations | Bands intersecting truth | Unknown samples | Wall seconds |
| --- | --- | ---: | ---: | ---: | ---: |
| Two domains | Active | 3 | 2 | 0/8 | 104.037 |
| Two domains | Uniform | 2 | 2 | 0/8 | 51.152 |
| Two domains | Stratified | 2 | 2 | 0/8 | 51.967 |
| 32px centre strip | Active | 2 | 1 | 0/8 | 116.125 |
| 32px centre strip | Uniform | 0 | 0 | 0/8 | 73.808 |
| 32px centre strip | Stratified | 1 | 0 | 0/8 | 74.810 |
| 32px shifted strip | Active | 3 | 0 | 2/8 | 135.958 |
| 32px shifted strip | Uniform | 2 | 0 | 2/8 | 88.161 |
| 32px shifted strip | Stratified | 2 | 0 | 2/8 | 85.767 |

Every row uses exactly eight windows and 20,480 FFT pixels. The active wall
times additionally include 9.085/9.985/11.569 seconds of deliberate stale-action
refusal calls; these values are separate in CSV. No strategy produced a B-vector
positive in a window containing zero analytic B support. One fixed random seed
and these finite cases do not establish a statistical advantage.

**Preserved scientific miss:** all three strategies returned no boundary band
for the shifted 32-pixel strip. Fine B-vector evidence was found, but the
available same-scale neighboring supports did not establish a supported boundary
relation. The two unknown samples remain unknown. No threshold, truth mask or
rotation hypothesis was changed after seeing this result.

The centre-strip input already had coarse B-vector evidence under this new
preregistered refinement/tolerance. Its finer active band is additional evidence,
not proof that active sampling alone repaired the original F1a miss. Frozen F1a
still records its original four usable windows, one dominant candidate and zero
bands with the original measurement settings.

The single-domain control had no band and retained exploration candidates.
The declared noise control had four unknown samples and stopped
`data_quality_limited`, with no band. The square control retained its ambiguity;
it was not assigned a unique orientation. Explicit window-budget and user-stop
requests returned finite stops without computing new FFTs.

## Cost location and remaining scopes

Before extension work, a read-only profile of the saved revised 18-window F1a
field took 45.611 seconds with zero FFT. It traversed 4,943 object calls,
18,083 hashes and 11,795 JSON reads. Cold process launch was 0.144 seconds;
cold worker import plus process was 2.460 seconds. Inclusive profile costs overlap
and cannot be added as independent compute/I/O phases. Dependency traversal was
a concrete bottleneck; increasing tool deadlines was not used as a repair.

After the scoped validation-handoff change, a fresh-process ABBA comparison on
one saved four-window map measured qualified reads/proposals at 5.554/5.333
seconds versus unconditional repeat-validation at 8.633/8.430 seconds. Hash calls
were 1,628 versus 3,227, JSON reads 1,074 versus 2,136, object calls 444 versus
885 and array loads 228 versus 456. Canonical result bytes were identical
(`b988328bf891f3056f62c3e60849ce62db8bab5dcec8f4ec917249752e27c316`), with
source/map hashes and workspace file statistics unchanged.
See [profile JSON](examples/f4/validation-profile.json) and
[profile CSV](examples/f4/validation-profile.csv).

This reuses an already validated snapshot within one operation, with guarded
reference handoff; it is not a persistent cache or disabled integrity check.
The ABBA comparison includes cProfile overhead, does not reset OS caches, has
only two repetitions per mode and excludes FFT, rendering, MCP transport and
browser work. It establishes a narrower reduction in repeated validation work,
not an FFT or complete interactive-workflow speedup.

The acceptance previews crowd some short labels on very small synthetic inputs;
the formal table/reasons remain available. Real browser pointer navigation,
native Codex plugin discovery and real specimen/physical-boundary accuracy are
separate unqualified scopes. No Computer Use fallback bypassed the prior URL
confidence stop. GPA, defect/twin conclusions and model training remain outside
this increment.

## Related final-code checks

Strict TypeScript typecheck/build passed. The lightweight Node suite ran 314
checks: 308 passed, six explicitly skipped, zero failed. Targeted actual Python
increment tests passed 9/9 in 59.325 seconds and candidate tests passed 8/8 in
21.946 seconds. The existing independent science smoke passed actual MCP,
direct-DFT/source-hash checks, restart recovery and Panel HTTP. Frozen old-JS
workspace/schema compatibility passed against the copied compiled candidate in
32.727 seconds, including no-FFT replay, context, export and Panel scope.

The complete active benchmark above preceded the small scope-envelope/schema
hardening. Its windows all lie inside the unchanged original scope; the final
outside-scope union and argument bounds have separate targeted qualification.
The final package and new-model scope are recorded separately below rather than
relabeling the earlier full-run snapshot. No full GMS/C++ or Mac qualification
was attempted.

The implementation commit `954e8a0` passed all eight initial GitHub CI jobs,
including Windows/Linux Node 18/22, reader coverage, compiled compatibility /
transport parity and the new targeted active-analysis job. These CI results do
not establish real browser or model behavior.

Final compiled read-only recovery also opened the original four-window F1a
narrow field/map and an eight-sample legacy R3 feature field, including original
request queries. It created zero FFTs and preserved exact SHA-256 for all 2,491
F1a and 950 R3 workspace files. See
[legacy recovery JSON](examples/f4/legacy-recovery.json).

The first legacy readback harness **failed** because its in-memory strict
comparison distinguished a manifest's `-0` rotation constant from Node's JSON
wire `0`. That failure log remains preserved. A separate read-only rerun
compared standard JSON-wire metadata and retained strict scientific-array and
whole-workspace hashes; it passed. No production code, source arrays or
scientific tolerance was changed to obtain that result.

## Actual new consumer Agent

A new ephemeral Codex CLI session used the installed configured
`gpt-6.1-terra` model with `ultra` reasoning and a copied final compiled package.
It loaded only the explicitly configured microscopy MCP provider and packaged
`microscopy-automation` Skill, with shell, web and other-Agent operations disabled.
No developer chat, oracle, expected vectors, preferred ROI or phase answer was
given. Its different public input was a 160×160 float32 reconstruction; an
existing named analysis held four coarse 64-pixel windows over `[0,0,128,128]`.
The original source, real user configuration and copied package remained
unchanged. Native plugin auto-discovery is a separate untested scope.

The model inspected the returned image and saved evidence, then selected
`[16,48,48,80]` as shifted exploration and `[80,48,112,80]` to inspect an unresolved
neighbor. It executed those saved actions, kept the initial spectra, queried
its original append request, updated the map with unchanged scientific settings,
and received `budget_exhausted` at six total windows /18,432 FFT pixels. It saved
`spatial_field`, `domains` and `active_plan` at context revision 6, exported the
field and opened/read the shared Panel. It explicitly retained unknown physical
scale, ambiguous coarse windows and correlated supports rather than identifying
a phase or ruling out narrow structures.

The session completed naturally in 221.177 seconds: 18 actual MCP calls, 17
successful and 14 valid PNG blocks. Its first `image_panel_current({})` failed
because this fresh workspace had no live Panel; it recovered by calling
`image_panel_open` and reading the actual current image. That error remains
recorded rather than being counted as a successful call. A separate new-client
audit checked the named current references, original append query, four unchanged
FFT IDs/data hashes, exactly two new FFTs, export hashes, pixel-only units and
unchanged source/configuration/package. See
[fresh Agent evidence](examples/f4/fresh-agent.json).

Only after the model ended, independent analytic truth checked its new vectors.
The exploration window agreed with the original A tones. The other window
contained 75% B support and retained a mixed three-family observation; its two
expected B-vector residuals were 0.000357 and 0.003635 cycles/pixel. This is
additional geometric evidence, not a pure-B assignment or a located boundary.

The client reported 1,212,359 cumulative input tokens, including 1,118,976 cached,
and 3,611 output tokens. These are session usage counters across repeated calls,
not one context length. Large nested scientific responses and validation waits
remain a practical multi-round cost; this run does not demonstrate low latency
or low model cost.

## Minimal reusable consumer request

Install/configure the existing plugin using its client instructions, then use a
saved task name rather than developer IDs. For an analysis that already has four
64-pixel windows, a bounded example request is:

> Continue the named analysis `<task-name>`. Inspect the current source image,
> field and domain candidates. Within a total cap of six windows and 18,432 FFT
> pixels, propose follow-up 32-pixel windows, retain an exploration check, and
> choose up to two explicit actions from the saved proposal. Execute them with
> the formal tools, update the field/map/proposal references, export to a new
> destination and stop with the recorded reason. Keep physical scale and material
> interpretation unknown when unsupported. Save request IDs before writes.

For another initial plan, use its actual reported work when choosing the cap;
the example numbers are not universal defaults. To reconnect, ask the Agent to
read `<task-name>` with `analysis_read`, inspect its current source-bound
references and query any unresolved original request. It need not recreate the
FFT or remember internal IDs from a prior chat. Existing single-image tools
remain directly callable without an AnalysisContext or this active loop.
