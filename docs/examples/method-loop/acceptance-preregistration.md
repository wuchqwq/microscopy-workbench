# F4-full first cross-method loop acceptance

This acceptance uses public analytic textures from
`tools/create_topology_fixtures.py`, an actual stdio Plugin MCP process, and the
independent Python environment selected through `MICROSCOPY_PYTHON`. It does not
use private specimen files, GMS, native DM, a browser, or a model session.

Each fixture opens a real float32 TIFF, extracts its frame, computes one explicit
unwindowed FFT, and saves an initial fixed-g GPA for `(g0,g1)`. Those common input
costs are reported separately. The method planner can then select the explicitly
supplied `(g0,g2)` GPA follow-up and raw wrapped-phase topology on the two nested
rectangles from the existing fixture. No automatic reflection discovery is
implied. Missing follow-up basis or circuits must request information.

The active strategy and the fixed additional-GPA-then-topology strategy receive
the same additional budget cap: two method calls, zero new forward FFT pixels,
131072 GPA band pixels, and 5328 reserved reflection-path samples. The GPA cost
is two bands times 256 times 256 pixels. The declared conservative API topology
reservation is six possible retained bands times the 888 supplied rectangle
boundary samples. The actual three unique reflections use 2664 band-path
samples, reported separately. A strategy may stop with
unused budget; equal caps do not imply equal spending. All attempts, including
failed and unknown outcomes, retain reserved costs and elapsed time. Neither
recovery nor a missing-information response is counted as a scientific call.

The positive continuum field prescribes winding `[-1,0,-1]` and projected
closure `[8,0]` pixels. The smooth single-valued displacement hotspot prescribes
zero net winding despite its nonzero strain gradient. The fixed-seed noise case
does not support projected topological evidence on these paths. These are
separate image-model truth distinctions, not material classifications.

The contrast-coefficient vortex has exactly the positive fixture's real image
intensities, but prescribed zero material displacement. The active loop must
therefore treat both as the same conditional image-phase evidence. Every
reported scientific conclusion remains `hypothesized`; material dislocation
confirmation and a unique conventional 3D Burgers vector remain false.

Acceptance checks the saved plan/action/root/child request chain, preallocated
child request IDs, immutable sources and prior FFT/GPA records, no new FFT in
the loop, bounded accounting, missing-information patches, explicit budget
stops, and fresh-client recovery without repeating calculations. A failed run
retains its report and raw error; truth thresholds are not widened to pass.

Run after building the current source:

```powershell
$env:MICROSCOPY_PYTHON = 'F:\microscopy-workbench-env\Scripts\python.exe'
$env:MICROSCOPY_SMOKE_OUTPUT = 'F:\new-absolute-evidence-directory'
node dist/tools/smoke_method_loop.mjs
```

Actual numerical outcomes and costs are emitted in `report.json`. They are not
a claim that active selection always outperforms a fixed sequence, nor ordinary
researcher, GUI, real-specimen, or real-host acceptance.
