# Desktop saved ROI statistics history

Base: `805c5a79dc4462d3de197f60ffae71f1a19a13d4`.

The desktop previously restored only the latest statistics reference. Selecting
another saved ROI observation did not retrieve that region's older statistics.
The existing results area and Analysis History menu now both open a read-only
table of saved real-space statistics from the exact same frame. This also works
while viewing that frame's saved FFT. It neither computes statistics nor adopts
a new scientific result, changes selection, or saves a comparison report.

## Use

1. Reopen an existing analysis workspace with `npm run desktop -- --workspace
   <workspace> --python <existing-python>`.
2. Choose **分析历史 → 已保存 ROI 统计历史**, or expand the results area, choose
   **ROI 统计 → 查回已保存统计 / 历史对照**.
3. Read the original region, component, dtype, count, mean, population standard
   deviation, minimum and maximum side by side. Each row includes its saved UTC
   time and source, with expandable object/request IDs and hashes.
4. Close the table to return to the previous controls. Native Save/Exit and
   reopening the workspace retain access to the same committed records.

Names are drawn only from the statistics input's immutable annotations whose
outward integer bounds match that result's exact source-pixel ROI. This is an
explicit geometric naming aid, not a new annotation-to-result identity link.
Unmatched/ambiguous names are labeled accordingly; renaming or moving today's
annotation cannot relabel yesterday's numbers. Missing time, source or intensity
unit is shown as unknown. XY length units are never used as intensity units.

The table is historical intensity information, not a measurement of period,
orientation, strain or a material explanation. It does not identify defects or
designate another region as strain-free. Only same-frame `source_pixels`
statistics are included; frequency-domain and other-frame records are excluded.
An unresolved frame produces an explicit empty state. The bounded listing has a
256-row default and explicitly indicates truncation.

## Contract and validation

`GET /api/statistics-history?object_id=<exact-current-id>` uses the existing Panel
token/origin boundary and rejects stale, duplicate or extra identity parameters.
The projection reuses `readImageProviderRecords`: ordinary bounded metadata,
committed journal/manifest identity and response equality, exact input/parameter/
grid binding, statistics payload hash/equality and source-array hash. It checks
finite diagnostics and ROI sample count without recomputing their reductions.
It never writes an index, migrates a record or adds a provider request.

Direct tests (`tests/image-panel-statistics-history.test.mjs`) use public metadata
fixtures and actual UI handlers: full A/B values and original labels, exact frame
scope, unknown/empty/stale states, truncation, payload/parameter/array tampering,
invalid counts/nonfinite encoding, token/current-identity routing, read-only
behavior and close/focus behavior. `npm test` explicitly includes this file.

Commands:

```text
npm run build
node --test dist/tests/image-panel-statistics-history.test.mjs
node --test dist/tests/image-panel-statistics-history.test.mjs dist/tests/data-probes-ui.test.mjs dist/tests/image-panel-numeric-recovery.test.mjs dist/tests/image-panel-ui.test.mjs
git diff --check
```

Direct tests: 6/6 PASS, zero skips. Existing three-file affected regression:
275/275 PASS, zero skips. The initial combined run's only failure was the new
route test stub omitting `image_info` from its advertised tools; correcting the
stub made the direct six pass. No production behavior or assertion was weakened.
Build and whitespace checks pass. The prior font repair's completed broader
checks were not repeated. Hosted CI and Mac are not claimed for this unpushed
change. Private desktop operation and hash receipts remain outside the repository;
no private image, original path, screenshot or scientific fixture is committed.

Actual local Electron qualification: both entry points displayed the two existing
private-workspace statistics without recomputation; each row's object/request
details was opened. Native File/Save completed before audit, native Exit returned
zero, and a second desktop process reopened the same workspace and displayed both
rows again. Read-only receipts verified the original file hash, all 67 existing
object/request files, both statistics and FFT IDs/values, and zero new provider
requests. The completed savepoint/manifest was identical after restart. This is
assistant-operated Windows evidence, not a human usability study.

This fixes retrieval, not the whole research workflow. In the exercised desktop,
the results heading still says “尚无测量” despite existing statistics/FFTs; the
FFT observation panel says it has no spatial ROI even while the source image
shows observations; and qualifications such as “not assessed” do not yet guide
the user's particular question to its next evidence step. Those remaining
question/evidence-navigation decisions need product discussion, not another
scientific algorithm or an unsolicited interface redesign in this patch.
