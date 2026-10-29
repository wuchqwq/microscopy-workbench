# Reusable microscopy automation plugin

This is a local MCP + Skills package for compatible Agent clients. It uses the
same scientific providers and GUI as the standalone workbench. The plugin does
not call a model, select a model vendor, manage API keys, install dependencies or
send specimen files to a service. The host Agent chooses the analysis strategy.
The GUI and old tools continue to work without an Agent or this package.

## Install once, use in new sessions

Use Node >=18 on PATH and an independent Python environment. Install
[image requirements](../requirements-images.txt). Candidate simulation/comparison
also needs [structure requirements](../requirements-structure-tools.txt); optional
DM file reading needs [reader requirements](../requirements-dm4.txt). Never install
these into GMS Python. No DM installation or old mcp-dm checkout is required.

In a clean source checkout, run `npm ci`, `npm run typecheck` and `npm run build`
once. Install or copy the **complete `dist/` directory** as the plugin root,
including its hidden manifests and Skills. It runs on Node >=18 without
TypeScript, npm installation or a build at startup. Keep private specimens,
scientific workspaces and connection settings outside the package. From inside
the built package, generate a new local configuration directory:

```sh
node tools/prepare_plugin.mjs --python /absolute/venv/bin/python --workspace /absolute/scientific-workspace --output /absolute/new-connection --structures
```

Use actual absolute paths on Windows, for example `C:/analysis/...`; quote paths
with spaces. Omit `--structures` for image-only use. `--structure-python` can
select another independent environment. The command writes `plugin-config.json`,
generic MCP JSON and a Codex TOML snippet. It refuses an existing output directory,
does not modify the source file or any client configuration, and does not start
science work. Retain the scientific workspace across sessions.

### Codex-compatible plugin

The built package is a plugin root: [.codex-plugin/plugin.json](../.codex-plugin/plugin.json)
declares the four scientific Skills and [.mcp.json](../.mcp.json) declares one
local stdio provider. The included [marketplace](../.agents/plugins/marketplace.json)
lets a compatible Codex client install it from the built package:

```sh
codex plugin marketplace add /absolute/microscopy-workbench/dist
codex plugin add microscopy-workbench@microscopy-workbench-local
```

Run those commands only when installing into the intended client configuration.
Set the client process environment `MICROSCOPY_PLUGIN_CONFIG` to the generated
`plugin-config.json`, or deliberately place that file at
`~/.microscopy-workbench/plugin-config.json`, the launcher's default location.
Reconnect/restart as the client requires. The package has no lifecycle hooks.
An installed copy is cached: updating the development checkout alone does not
update an installed plugin. Reinstall/update via the client's supported controls.

The stdio entry uses `cwd: "."` relative to the installed package and a relative
Node argv. It does not rely on `${CLAUDE_PLUGIN_ROOT}` interpolation. This was
checked against the official [Codex plugin parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/plugin_config.rs)
and the installed Windows CLI. Packaging follows the
[official plugin layout](https://developers.openai.com/plugins/build/plugins)
and [local-executor requirement](https://developers.openai.com/plugins/deploy/desktop-only).
This is not a public directory submission or a claim of compatibility with every
plugin host.

### Other MCP clients / explicit Codex configuration

Use the generated `mcp.json` or merge the generated `codex.toml` table into the
intended client configuration without replacing existing providers. The generated
command uses an absolute Node executable and package path; regenerate after
moving that checkout. It launches the same `tools/plugin_server.mjs` as the plugin.
Load the Skills from [skills/scientific-agent](../skills/scientific-agent), or
provide the entry Skill to a client that supports filesystem Skills. Do not
register both this connection and the plugin for the same workspace accidentally.
Keep the client's normal tool-approval controls. For an explicitly authorized
noninteractive test, grant only its chosen provider/tools the necessary approval:
`approval_policy=never` alone refuses an MCP write that still requires approval.
The configuration generator deliberately does not change approval policy.

With no settings file, the launcher honors existing explicit `MICROSCOPY_*`
variables and otherwise uses `~/.microscopy-workbench/workspace/images` and
`contexts`. Structure tools remain opt-in. A specified missing/invalid settings
file fails; it does not silently fall back to another scientific workspace.
An explicit settings file takes precedence over inherited provider paths.

## First usable tool chain

The [microscopy-automation Skill](../skills/scientific-agent/microscopy-automation/SKILL.md)
is the entry for a request such as:

> Inspect this local image. Propose several useful FFT windows, locate and measure
> peaks, compare my explicit candidate structures where the data supports it, and
> leave the results in the image panel for correction. Preserve the original.

| Interface | Reusable behavior |
| --- | --- |
| `image_open`, `image_frame`, `image_info`, `image_preview` | Explicit source, frame, scientific shape/dtype/calibration and view |
| `image_roi_propose` | Bounded multiscale candidate windows and source-position overview; no phase segmentation claim |
| `image_fft_batch` | Explicit windows processed by the existing FFT implementation, with original/ROI/FFT references |
| `image_peaks` | Numerical maxima/refinement from the saved scientific FFT, peak table and reviewable overlay |
| `image_peak_measurements` | Ordinary immutable `image_measure` results from selected detected peaks |
| `structure_open`, `structure_orient`, `structure_simulate` | Existing ASE/diffsims reference and explicit orientation path |
| `structure_compare_batch` | Several explicit saved simulation candidates compared against saved image measurements |
| `image_panel_open/current/show`, `image_annotate`, `image_remeasure` | Shared GUI review, point correction and affected-result update |
| `analysis_create/read/update`, original request queries | Named current references and recovery across client sessions |

Consult tools/list for the exact current schemas and budget limits. IDs returned
by one call are inputs to later calls; the Agent retains them. Candidate comparison
accepts `measurement_object_ids`, `current_image_object_id`, and up to three
`candidates` containing a label, `simulation_object_id` and explicit registration.
It resolves measurement records inside the configured image provider. It keeps
scale at one and translation zero; it does not tune experimental calibration to
make a candidate win. All comparison candidates remain hypothesized and absence
of held-out evidence remains `NOT_VALIDATED`.

Every scientific write needs a preselected request ID. Batch records retain child
references; recover the advertised original request, not a new anonymous run.
Incomplete work is not reported as a complete analysis. A named AnalysisContext
stores references only; provider journals remain authoritative. After reconnecting,
read that context and saved objects instead of recomputing FFTs to recover memory.

ROI changes create appropriate new FFTs. Display, scale and point corrections
reuse unchanged arrays and revise only the relevant measurements/comparisons.
An image panel's dirty draft cannot be overwritten by a late Agent result.
Numerical NPY exports, display PNGs and scientific provenance remain separate.
`image_export` requires a new destination with an already existing parent; choose
a new child of a known output/workspace parent rather than assuming an `exports`
directory is present. Existing files remain protected from overwrite.

## Scientific and delivery scope

Peak detection is not unique indexing or phase identification. FFT conjugate
pairs are not independent reflections. Explicit scale and signed anisotropic
axes control physical conversion; missing scale permits cycles/pixel and pixel
periods, not fabricated nm/Angstrom spacing. HRTEM/ptychography FFT intensity is
not generally comparable with SAED or kinematic simulated intensity.

The [R2 sequence increment](SEQUENCE_PLUGIN.md) adds sourced frame context,
bounded integer ROI correspondence, joint reflection evidence, saved-spectrum
reuse and named-task recovery. Its [acceptance record](SEQUENCE_PLUGIN_ACCEPTANCE.md)
separates numerical, protocol, browser and fresh model evidence. `image_compare`
remains available for explicit same-ROI observations. Sequence meanings stay
sourced statements, not inferred physical depth or axial resolution.

Automatic global phase/orientation search, multiphase segmentation, twin-interface
determination and dislocation/GPA remain outside this increment. Missing capabilities
are reported instead of invoking an absent script or substituting a prompt.

The pre-migration `hypothesis_explorer.py` and twin-feedback CLI recipes were not
present in this repository. The crystallography Skill now describes the shipped
tools and no longer sends a new session to those missing files.

## Verification boundaries

The packaging check copies only runtime directories into a different path,
launches the real stdio server there, and checks the image, context and optional
structure catalog. Configuration tests cover scoped paths, rejection of invalid
settings, and refusal to overwrite an existing output directory.

On Windows, Codex CLI `0.165.0-alpha.1.2` actually installed this plugin into an
isolated configuration, listed it as enabled, and resolved its local MCP command
to the cached installed package. This is package discovery, **not** by itself
proof of a fresh model completing the scientific chain. Real MCP science, GUI
interaction and new-model-session results are reported separately in the PR's
acceptance evidence. The launchers do not modify authentication or user secrets.

The fresh model acceptance used the installed package's server plus its packaged
Skills in a clean client project, with explicit per-invocation MCP configuration
and existing authentication. This manual MCP + Skills loading mode is distinct
from native plugin discovery. Its first attempt refused writes because the
noninteractive harness had not granted tool approval; that failure was retained.
The second attempt approved only the intended synthetic-task tools for that
process, completed the required observation/comparison/context/panel chain, and
reported two additional export refusals caused by a missing output parent.
Neither export failure was counted as success. Browser gestures and independent
scientific verification are separate from the model's tool calls.
After the missing-parent diagnostic and Skill guidance were corrected, a third
fresh session recovered the named context without supplied object IDs and
exported NPY/PNG/provenance successfully. Its nine calls created only an export
receipt/object, no new scientific arrays. All 114 prior provider files retained
their hashes; the exported NPY bytes matched the saved FFT and the context stayed
at revision 2. The earlier failed attempts remain recorded separately.
