# Narrow raw TIFF fallback

Use only when the actual catalog/runtime lacks the requested raw readout and
local file execution is permitted. First record the observed missing tool and
why this smaller check answers part of the question. A provider refusal, unknown
request, inaccessible original or missing scientific premise is not a missing
capability. Do not route around it with this script. If the provider is available,
use its `image_statistics` or `image_profile` records instead.

`scripts/tiff_raw_probe.py` reads an explicitly selected original TIFF page and
integer half-open source ROI. It provides either five raw ROI statistics or one
horizontal/vertical raw array profile. It performs no FFT, peak detection,
calibration fit, interpolation, CIF simulation or model inference. It accepts
only finite 2-D scalar pages and uses already installed NumPy/tifffile; it neither
installs dependencies nor writes provider objects/journals.

Resolve `SKILL_ROOT` to the installed `microscopy-observe-revise` directory
containing `SKILL.md` (not the current project directory). Use its absolute path
so the script can be called from any working directory. `PYTHON` must identify
an existing permitted Python environment with NumPy and tifffile.

Example for an authorized original and a genuinely missing statistics tool:

```sh
SKILL_ROOT="/absolute/path/to/microscopy-observe-revise"
"$PYTHON" "$SKILL_ROOT/scripts/tiff_raw_probe.py" \
  --source /absolute/original.tiff --frame 0 --roi 10 20 30 40 \
  --operation statistics --missing-tool image_statistics \
  --capability-evidence "Actual catalog does not expose image_statistics" \
  --origin unknown --source-notes "Origin and physical scale not yet supplied" \
  --output /absolute/existing-parent/new-readout.json
```

For `--operation axis-profile`, the missing tool is `image_profile`; also supply
`--axis x --index 25` for the original array row y=25 (or axis y and fixed x).
Coordinates are integer original-array pixel indices, values are stored raw
scalars, and path distance is pixels. This is not the provider's general sampled
line profile and does not certify column separation or physical intensity.

Source file SHA/stat identity is checked before and after reading. The write-new
JSON reports source/page/ROI/dtype, explicit declarations, operation, script SHA,
Python/NumPy/tifffile versions and its own non-provider provenance. Existing output
is never replaced. Keep this report as supplemental evidence; a later provider
run gets its own original request and must be compared explicitly, not imported
as if the fallback were a native result.

The script deliberately ignores TIFF resolution/description as a physical
calibration. Unknown modality/domain and missing length/intensity units remain
unknown. A renderer-only PNG is outside this fallback. Hard limits restrict source to
64 MiB, page to 4,194,304 pixels and profile to 4096 samples; refusals do not
authorize quietly increasing budgets. A report's capability-evidence text is a
caller statement, not proof of tool absence or new permission.
