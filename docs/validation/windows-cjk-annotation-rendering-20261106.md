# Windows CJK annotation PNG repair, 2026-11-06

Review base: `9cd93c1f4a9debd570e827935abaa031ed81f60f`.
A private owner-provided DM3 researcher workflow exposed Chinese ROI names
rendering as missing-glyph boxes in the scientific export PNG, while the browser
and saved annotation text retained the correct names. Private source pixels,
screenshots, numerical results and source identity are not repository fixtures.

## Narrow display change

The backend `overlay` previously relied on Pillow's default font for every
annotation label. On the exercised Windows host it lacks CJK glyphs.
For CJK annotation text only, new raster overlays now try the existing Windows
Microsoft YaHei font (`msyh.ttc`, size 12). If unavailable, the existing default
fallback remains. No font is installed, downloaded, copied into the package or
made a mandatory dependency. Non-CJK labels keep the previous default font and
pixel rendering.

This changes only new label rendering. Original arrays, annotations and their
source coordinates, scientific parameters, object/request identity, old saved
PNG files, hashes and export semantics are not migrated or rewritten. A new
display revision/export is needed to obtain repaired text from an older saved
object. Reading/exporting its original PNG continues to preserve its bytes.
Font availability and glyph appearance remain platform-dependent: this is a
Windows qualification with an existing font, not a cross-platform font solution.

## Direct regression and CI entry

`tests/test_annotation_text_rendering.py` checks:

- Existing Latin overlay pixels exactly match the original Pillow-default
  rendering; input pixels, annotation text and coordinates stay unchanged.
- Missing optional fonts preserve the previous fallback instead of breaking an
  otherwise admitted operation.
- When the existing Windows font is available, different Chinese characters
  have distinct glyph masks, including distinction from an unassigned glyph.
- The actual overlay renders Chinese text differently from missing-glyph boxes,
  without relabeling or moving the annotation.

The four tests pass on the local Windows host, with zero skips. The existing
`dm4-reader` CI job explicitly calls this file. Its Ubuntu runner can execute
the two portable tests; its two actual Windows-glyph tests genuinely skip when
the required platform/font is absent. This does not claim hosted Windows glyph
qualification. No workflow routing, timeout, required gate, fixture distribution
or historical-fixture skip condition changed.

Commands:

```text
python -I -B tests/test_annotation_text_rendering.py
npm run build
npm run test:compiled:compat
node --test dist/tests/image-panel-figure-export.test.mjs dist/tests/figure-composer.test.mjs dist/tests/figure-composer-transport.test.mjs
```

Exact final results and the reviewed HEAD are recorded in the external private
review receipt. The complete compiled compatibility check still exercises its
unchanged frozen workspace/results and no-FFT-replay path. No unrelated science
suite or private image is substituted for those checks.

Local results: direct glyph/Latin/fallback regressions **4/4 PASS**, build PASS,
complete compiled compatibility **4/4 PASS** (zero skips, 28.401 s), focused
figure tests **26/26 PASS**. The initial sandboxed figure run had 25 passes and
one `EPERM` atomic-rename failure in the default virtual temporary directory.
The tool-approved host rerun used an explicitly authorized temporary directory
and passed all 26 tests. Both logs are retained; no test assertion was weakened.
The actual newly exported private PNG was inspected and its Chinese labels are
readable. The old missing-glyph export remains unchanged. New hosted CI has not
been run or claimed for this unpushed repair.

The actual researcher workflow separately distinguishes GUI ROI/statistics/FFT,
explicit save and scientific export from CLI export/readback of saved numeric
records. An actual process restart, browser reopen and immutable-record audit
passed before this repair. Those checks do not establish real dislocations,
strain accuracy, phase identity, quantified period/orientation accuracy or human
usability. Selecting an observation does not automatically retrieve every older
ROI statistic; an improved history/comparison UI remains a separate product
decision. No broader workflow or new scientific algorithm is added here.
