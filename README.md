# Microscopy Workbench

**Install the five scientific Skills, including PtyRAD.** The [zero-dependency npx installer](docs/SKILLS_INSTALL.md) copies the Skills on Windows, macOS, or Linux with Node.js 22 or 24. Use the tarball from a checkout or an asset pinned to a reviewed GitHub commit.

**An AI-assisted crystallography workbench, with the researcher in the loop.**

[English](README.md) · [简体中文](README.zh-CN.md)

Microscopy Workbench is an open-source workbench for building traceable crystallographic evidence from microscopy images. An AI Agent uses the **Model Context Protocol (MCP)** and installable **Skills** to automate bounded analysis with explicit scientific tools. The researcher guides the question, selects or corrects regions and measurements, reviews alternatives, and decides what the evidence supports.

The local Image Panel, structured CLI and MCP provider share saved scientific objects and request journals. You can also inspect images and measure them **without an AI model**. The core supports Windows, macOS and Linux without DigitalMicrograph, GMS or the separate `mcp-dm` repository. Native desktop and platform qualification have narrower, separately recorded scopes.

## The working loop

1. **Open and inspect.** Select the real source, frame or dataset. Inspect the original numerical data, signed calibration and explicit unknowns.
2. **Guide the analysis.** Select one or more ROIs. For the observation/Agent route, save an observation or question and hand the exact context to a connected Agent. Basic ROI → FFT does not require a reason or an explicit workspace save.
3. **Let the Agent do the bounded work.** Reuse saved FFTs and measurements where their inputs are verified. Run the relevant numerical tools, compare supplied structure hypotheses, or propose a budgeted next observation.
4. **Review and correct.** Return to the source beside the FFT, inspect unmatched evidence, adjust a saved ROI or peak, and explicitly continue from the revised record.
5. **Save and resume.** Save the analysis workspace, retain original request IDs, and reopen or query existing results before starting new work.

“Hand to Agent” prepares an explicit handoff for an already connected client. It does not embed a chat, select a model or automatically wake an Agent. See the bilingual [workflow guide](docs/WORKBENCH_WORKFLOW.md) and [Agent guide](README.agent.md).

## What is available

- **Image-first exploration.** Inspect supported TIFF and optional DM3/DM4 inputs, numerical values, profiles and calibrated or pixel-only measurements. Save multiple editable ROIs on one source frame, keep source/ROI/FFT views side by side, and return to the exact FFT input rather than a newer selection.
- **FFT and reflection evidence.** Compute local FFTs, locate/refine numerical peak candidates, and retain reciprocal vectors, spacings, uncertainties and unmatched observations. A numerical maximum is not automatically a true reflection.
- **Explicit crystallographic comparisons.** Use supplied structures and qualified ASE/diffsims operations to compare finite structure/orientation hypotheses across saved regions. Preserve FCC/BCC/HCP, multi-element and projection alternatives within each tool's declared scope. Generic relations are not automatically twins or identified phases.
- **Human-guided automation.** MCP tools and Skills compose ROI/FFT/measurement steps, bounded structural fields and incremental follow-up. The supported image-first observation route starts from a researcher's ROI and reason. Automatic spatial-feature proposals remain **EXPERIMENTAL** and can miss visible changes.
- **Conditional physical and topology evidence.** Classical single-domain GPA provides projected displacement, finite strain and rotation under explicit reference assumptions. Saved wrapped GPA phases support conditional projected winding evidence. The bounded twin and cross-method tools retain compatibility, ambiguity, missing information and stopping outcomes.
- **A shared analysis workspace.** GUI, CLI and Agent use the same provider records. Explicit saves, execution history, guarded recovery and source-proof metadata retain input identity. A retrospective source proof does not upgrade an originally unqualified FFT into strict reuse eligibility.
- **Local review and export.** Review sequences with explicit frame meaning, export scientific arrays/tables separately from display images, and compose figures. The Windows desktop development entry wraps the existing Panel; the headless CLI does not require Electron.

The [current status](docs/DEVELOPMENT_STATUS.md) separates implemented functionality from the tests actually performed. Individual method and acceptance reports retain their original dates and limitations.

## Quick start

**Convenient installer:** [macOS / Linux / Windows setup and standalone Skills installation](docs/INSTALL.md). Preview with `./install.sh --dry-run` or `install.cmd --dry-run`; no automatic MCP or authentication changes.

Use **Node.js 22.x or 24.x** and an independent scientific Python environment. **Python 3.13 is recommended and is the CI reference**. Scientific tools still declare Python 3.10+, which is not continuously CI-qualified; the optional configuration registrar needs 3.11+. See [runtime support](docs/CI_SUPPORT.md).

From a new checkout on macOS/Linux:

```bash
git clone https://github.com/wuchqwq/microscopy-workbench.git
cd microscopy-workbench
npm ci
npm run build

python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-images.txt

npm run inspect -- --source /absolute/path/to/image.tiff \
  --workspace /absolute/path/to/new-workspace \
  --python /absolute/path/to/microscopy-workbench/.venv/bin/python
```

Replace all example paths with real **absolute paths**. Keep the Inspector running and open the private local URL it prints. On Windows, create the environment with `py -3 -m venv .venv` and use `.venv\Scripts\python.exe`. Supported formats, explicit dataset/plane selection and safe MCP configuration are in [client setup](docs/CLIENT_SETUP.md).

For GPA and the upstream GPA records used by topology, install the optional requirements in the **same** scientific environment:

```bash
.venv/bin/python -m pip install -r requirements-gpa.txt
```

Structure simulations need their separately documented [optional dependencies](docs/STRUCTURE_DIFFRACTION_TOOLS.md). Do not install every optional package just to open an image.

### Choose an entry

- **Local image review:** start with the Inspector above. No Agent is required.
- **AI-assisted analysis:** connect the MCP provider and install the selected Skills or the [MCP + Skills plugin](docs/AUTOMATION_PLUGIN.md). The Agent uses the same saved science and guarded Panel operations. Model choice, credentials and client approval policy are not silently configured.
- **Windows desktop development trial:** follow [desktop setup](docs/DESKTOP.md). Its Electron runtime has a separate lockfile and requires Node 22.12+ within 22.x, or 24.x. This is not a clean-machine installer.
- **Headless analysis:** use the [structured CLI](docs/CLI.md) for explicit provider commands, saved-ROI comparisons, execution history and source-proof operations.
- **PtyRAD reconstruction:** use the standalone Skill and its CPU CLI to inspect raw 4D-STEM diffraction, compare rotation candidates, and measure apparent tilt from phase slices. Prepare and run the reconstruction with a separately configured PtyRAD environment. [PtyRAD CLI guide (中文)](skills/scientific-agent/ptyrad-reconstruction/README.md)

## Status and scientific limits

This checkout's Skills bundle includes PtyRAD diagnostics and a reconstruction workflow. For historical context, PR #131 integrated the reviewed workbench stack through #130, and PR #135 added the portable installer. Platform and real-specimen validation apply to the specific versions and workflows recorded in their acceptance reports. [Workbench integration](https://github.com/wuchqwq/microscopy-workbench/pull/131) · [Portable installer baseline](https://github.com/wuchqwq/microscopy-workbench/pull/135)

This is **research software** for guided microscopy analysis and standalone PtyRAD diagnostics. Use PtyRAD for reconstruction. Phase, twin, and dislocation claims require evidence beyond a local spectral match or compatible projected geometry. Live microscope control is outside this workflow.

Original arrays, display images and annotations remain separate. Saved results preserve sources, assumptions, units, revisions and unknown/ambiguous states. Synthetic numerical tests, DOM/HTTP tests, Agent trials, native mouse interaction, platform support and real-specimen physical accuracy are different evidence scopes. Passing one does not imply the others passed.

For development, follow [AGENTS.md](AGENTS.md) and [scoped regression](docs/CI_SCOPED_REGRESSION.md): test the changed layer and its affected contracts. Documentation-only changes need formatting, links and stated-contract checks, not an unrelated full numerical suite.

## Documentation

| Start here | English | 简体中文 |
| --- | --- | --- |
| Researcher/Agent working loop | [Workflow](docs/WORKBENCH_WORKFLOW.md) | [工作流程](docs/WORKBENCH_WORKFLOW.zh-CN.md) |
| Installation and MCP clients | [Client setup](docs/CLIENT_SETUP.md) | [客户端配置](docs/CLIENT_SETUP.zh-CN.md) |
| Agent responsibilities and recovery | [Agent guide](README.agent.md) | [Agent 使用说明](README.agent.zh-CN.md) |
| Current mainline and evidence boundaries | [Development status](docs/DEVELOPMENT_STATUS.md) | [开发状态](docs/DEVELOPMENT_STATUS.zh-CN.md) |

Detailed method guides: [image windows](docs/IMAGE_FIRST_WINDOWS.md), [manual ROI → crystal evidence](docs/MANUAL_CRYSTAL_WORKFLOW.md), [structure comparison](docs/GENERAL_CRYSTALLOGRAPHIC_EVIDENCE.md), [multiscale fields](docs/MULTISCALE_DOMAINS.md), [active follow-up](docs/ACTIVE_ANALYSIS.md), [GPA](docs/CLASSICAL_GPA.md), [projected topology](docs/PROJECTED_TOPOLOGY.md), [projected twin evidence](docs/PROJECTED_TWIN_EVIDENCE.md), [cross-method continuation](docs/CROSS_METHOD_ANALYSIS.md), [sequences](docs/SEQUENCE_PLUGIN.md), [Panel recovery](docs/INSPECTOR_PANEL_RECOVERY.md) and [Figure Composer](docs/FIGURE_COMPOSER.md).

## License

[MIT](LICENSE). Reproducible issues, scientific counterexamples and focused pull requests are welcome.
