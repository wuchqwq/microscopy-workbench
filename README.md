# Microscopy Workbench

**From microscopy images to traceable structural evidence.**

[English](README.md) · [简体中文](README.zh-CN.md)

Microscopy Workbench is an open-source, cross-platform workbench for scientific microscopy analysis. It combines numerical tools, persistent scientific records, and a local Image Panel. Through the **Model Context Protocol (MCP)** and installable **Skills**, compatible AI agents can use those same tools to organize an analysis—not replace its numerical or physical foundations.

The workbench runs on **Windows, macOS, and Linux**, without DigitalMicrograph, GMS, or the separate `mcp-dm` repository. **No AI model is needed** to inspect and measure images locally.

![R3 local structural evidence in the Image Panel](docs/examples/r3/browser-field.png)

*R3 structural-field review in the local Panel, using a public synthetic test image. This is workflow evidence, not validation on real specimens.*

## What you can do

- **Inspect microscopy data.** Open supported TIFF images and, with an optional reader, selected DM3/DM4 files. Preserve original arrays, data types, axes, signed calibration, and explicit frame/ROI selections. Selected complex and higher-dimensional inputs require an explicit component or plane.
- **Measure reciprocal-space features.** Compute local FFTs, detect and refine peaks, measure reciprocal vectors and spacings, and compare explicit crystallographic candidates using optional structure tools.
- **Build spatial structural evidence (R3).** Connect sampled image windows, saved spectra, reflection families, and local periodicity into a sparse, revisable feature field. Compare specified in-plane rotation hypotheses without silently assigning phases or defects.
- **Examine saved sequences (R2).** Keep frame meaning and ROI correspondence explicit when comparing neighboring images or reconstructed outputs; frame indices are not assumed to be physical depth.
- **Review, correct, and export.** Open source-linked measurements in the Image Panel, revise annotations or peaks, and create scientific exports and publication figures with Figure Composer.
- **Resume reproducibly.** Scientific objects, request journals, source hashes, measurement dependencies, and named AnalysisContext references make it possible to continue a previous analysis without recomputing unchanged FFTs.

### How it fits together

```text
Researcher or optional AI Agent + Skills
                    |
            MCP server (TypeScript)
                    |
       Scientific tools (Python)
                    |
       Versioned scientific workspace
             /                 \
    Local Image Panel      Figure Composer
```

The Agent, when present, chooses and combines available operations. Scientific calculations are performed by explicit tools; the researcher can inspect and correct their results. Optional native DigitalMicrograph support lives in a **separate peer MCP server**, not inside this cross-platform core. The repository split and source attribution are documented in [MIGRATION_MANIFEST.json](MIGRATION_MANIFEST.json).

## Quick start — no Agent required

Requires **Node.js 18+** and **Python 3.10+** in a separate scientific environment.

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

Replace the example paths with real **absolute paths**. The inspector prints a private local Panel URL; keep its process running while using the Panel. On Windows, use `py -3 -m venv .venv` and `.venv\Scripts\python.exe`. See the [client setup guide](docs/CLIENT_SETUP.md) for platform-specific details and supported file types.

For development checks, run `npm run typecheck`, `npm test`, and—after setting `MICROSCOPY_PYTHON` to the absolute interpreter path—`npm run test:science`.

### Use it with an AI Agent

Connect the compiled MCP server to a compatible client, or install the packaged MCP + Skills plugin. The same science tools and local Panel are available with or without an Agent. See [client setup](docs/CLIENT_SETUP.md), [automation plugin setup](docs/AUTOMATION_PLUGIN.md), and the [Agent guide](README.agent.md). No model provider, API keys, or approval settings are silently configured by this project.

## Status and research roadmap

**Available on `main`:** the cross-platform TypeScript/MCP runtime, Python science providers, local inspection and visualization, source-linked FFT/measurement workflows, sequence evidence (R2), and sparse spatial structural fields (R3).

**Under review:** [F1a — multiscale structural fields and candidate domains (Draft PR #28)](https://github.com/wuchqwq/microscopy-workbench/pull/28) adds bounded multiscale sampling and candidate domain/boundary evidence. Its synthetic numerical tests have passed, but it is **not yet merged into `main`**, and the remaining GUI/browser scope must not be treated as verified.

**F2a implementation branch:** [classical single-domain GPA](docs/CLASSICAL_GPA.md) reuses saved unwindowed FFTs to extract geometric phases, projected displacement, finite Green–Lagrange strain and polar rotation. It requires explicit reference/domain assumptions; unknown XY metric permits image-coordinate fields only. Optional dependencies are in `requirements-gpa.txt`; [acceptance scopes](docs/F2A_ACCEPTANCE.md) distinguish synthetic verification from specimen validity and GUI gestures. This branch does not merge or depend on the F1a/F4 Draft stack.

**Planned:** [research roadmap #16](https://github.com/wuchqwq/microscopy-workbench/issues/16) retains evidence-guided follow-up analysis and later crystallographic defect evidence. The current roadmap does **not** include Encoder training or a foundation-model project.

## Scientific scope

This is **research software**, not an autonomous microscope controller or a universally validated phase-identification system. It does not currently perform ptychographic reconstruction, general automatic phase/twin/dislocation identification, or live instrument control. Missing calibration stays missing; local spectral agreement is not proof of a phase, a defect, or a three-dimensional structure. Successful synthetic tests do not imply accuracy on real specimens.

Original scientific data remain separate from display images and annotations. Saved evidence retains provenance, units, hypotheses, and unknown/ambiguous states rather than converting them into confident-looking labels.

## Documentation

| Topic | Guide |
| --- | --- |
| Installation and MCP clients | [Client setup](docs/CLIENT_SETUP.md) · [Automation plugin](docs/AUTOMATION_PLUGIN.md) |
| Local images and review | [Image Panel](docs/LOCAL_IMAGE_PANEL.md) · [Researcher inspector](docs/RESEARCHER_DATA_INSPECTOR.md) |
| Structural and sequence evidence | [R3 local structural fields](docs/SPATIAL_DOMAINS.md) · [R2 sequences](docs/SEQUENCE_PLUGIN.md) |
| Crystallography and publication | [Structure tools](docs/STRUCTURE_DIFFRACTION_TOOLS.md) · [Figure Composer](docs/FIGURE_COMPOSER.md) |
| Verified scopes and migration | [R3 acceptance](docs/R3_ACCEPTANCE.md) · [TypeScript completion](docs/TYPESCRIPT_COMPLETE.md) |

## License

[MIT](LICENSE). Reproducible issues, scientific counterexamples, and focused pull requests are welcome.
