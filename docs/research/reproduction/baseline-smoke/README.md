# Supplied-ROI engineering smoke inputs

`inputs/source-A.tiff` is the exact128×128 float64 two-wave proxy used for the
baseline integration smoke. It has no noise, CTF, atomistic interface or physical
calibration. `generate-hrtem.py NEW_DIRECTORY` recreates its formula with NumPy,
tifffile and Pillow without touching the committed inputs. The historical
environment was Python3.13.2, NumPy2.5.4, tifffile2026.10.15 and Pillow12.3.0;
regeneration on another libm/platform is not guaranteed byte-identical.

The supplied core is `[48,48,80,80]`, arms `[32,32,32,32]`; the three separate
Hann/mean-subtracted FFT inputs total7168pixels. Their long supports are context,
not exact core evidence or independent measurements.

`inputs/source-B.tiff` is the exact48×40 float32 stored Poisson-count realization
from the earlier quality-limited static-IAM MoS2 simulation. It is a copy of an
already generated public synthetic input, not a new simulation or specimen.
The supplied6×6 ROI is `[24,3,30,9]`. The original physical grid gate remains
10.034456% >10% FAIL; intensity unit and physical interpretation are not inferred
by opening this ordinary TIFF. It is not a blind localization input.

The physical generator/protocol are separately archived under `../stem/`.
To regenerate physical datasets, follow that README in a fresh copy and preserve
all failure/quality records. Do not replace the committed B input with a new seed
or claim a new run inherits its byte identity. `fixture.json` records this smoke's
model/scope and original B hash; the collection manifest identifies all four
TIFF/PNG files. PNGs are display-only.

This two-input smoke demonstrates MCP/Skill composition and recovery. It is not
the comprehensive common-condition algorithm comparison planned for later.
