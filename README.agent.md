# Agent guide: independent microscopy science

Use this provider on Windows, macOS or Linux without DM/GMS or the old repository.
Start with [client setup](docs/CLIENT_SETUP.md). Discover the actual `image_*`,
optional `structure_*` and context tools from this connection. Missing optional
modules are not permission to call a peer DM provider or invent a capability.

The [no-model inspector](docs/RESEARCHER_DATA_INSPECTOR.md) uses the same saved
arrays and measurement records. [Numerical inspection](docs/IMAGE_NUMERIC_INSPECTION.md)
reads original values, not preview brightness. Keep coordinates, signed XY
calibration, frame/ROI and FFT ancestry explicit; unknown scale stays pixel-based.
For direct `.dm3` / `.dm4`, use the [optional reader adapter](docs/DM4_DIRECT_IMPORT.md):
open the scientific catalog, then select frame0 and an explicit dataset when
ambiguous. Stored file calibration has source `dm_file_metadata`; it is neither
user confirmation nor DM-native execution. Never analyze the RGB thumbnail.
Save original request IDs before scientific writes and query original outcomes
after timeout. Preserve data and existing user/client settings.

For [ordinary complex 2D DM data](docs/DM_COMPLEX_IMAGES.md), choose an explicit
`image_preview.component` before opening its panel; numeric observations also
require their own explicit component. Preserve complex dtype and both parts in
NPY. Do not infer FFT/wave/phase semantics or feed a displayed amplitude into
an unqualified complex FFT/comparison. Packed and nD complex remain refused.

[Panel usage](docs/LOCAL_IMAGE_PANEL.md), [annotation contracts](docs/IMAGE_ANNOTATIONS.md)
and [reflection comparison](docs/REFLECTION_COMPARISON.md) describe the retained
scientific behavior. Older copied technical examples mentioning `DM_IMAGE_*`
refer to the pre-split combined checkout; for this package use the `MICROSCOPY_*`
configuration in client setup. Do not install GMS to satisfy those old examples.

Skills are optional user-installed directories. Copy a whole selected Skill
with its scripts and references, refusing overwrite. They do not establish that
an external Materials Project provider is connected. Do not install dependencies
or alter approval settings without explicit authorization.

DM is a separately registered peer MCP. Its native failures do not trigger a
hidden fallback. Imported saved captures are read-only scientific file transfer,
not a live host connection. New repository naming does not justify renaming old
request IDs, manifests, stored schemas or calibration records.

For a rank 3–6 DM source, inspect the catalog and call `image_frame` with explicit
`plane_axes:[Y,X]` in original NumPy axis order and one `plane_indices` entry
per axis (null on the two plane axes, fixed zero-based integers elsewhere).
The returned `dm_plane_selection` is scientific provenance, not a depth or
resolution inference. nD complex and packed DM inputs remain refused. Ordinary
2D complex inputs use the explicit component path above; never relabel them as
a produced external FFT or discard their imaginary values. See the reader
guide for scalar planes and the separately qualified complex scope.
