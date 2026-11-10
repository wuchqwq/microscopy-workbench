# Convenient source installation

[简体中文](INSTALL.zh-CN.md) · [Manual setup](CLIENT_SETUP.md)

The installer uses Python's standard library to orchestrate the existing venv,
`npm ci`, build, and configuration generator. It does not install Python/Node,
change authentication, register MCP servers, or edit client settings.

## Prerequisites

- Python **3.10+**, with `venv` and pip available; **3.13 recommended** (CI reference).
- Node.js **22.x or 24.x**, with npm, for the workbench. Desktop requires
  **22.12+ within 22.x**, or 24.x. Skills-only installation needs no Node.
- A source checkout (clone or extracted source ZIP), writable disk space, and
  internet access to the standard Python/npm registries for dependency installs.
  Some Linux distributions package `python3-venv` separately.
- Use an independent Python, never the Python managed by GMS/DigitalMicrograph.

This candidate installer is on the draft-PR branch, not yet on default `main`:

```sh
git clone --branch publish/mac-r5-skills-r2-install https://github.com/wuchqwq/microscopy-workbench.git
cd microscopy-workbench
```
Inspect the plan first; dry-run validates prerequisites and destinations without
creating files, downloading packages, or running a build:

```sh
# macOS / Linux
./install.sh --dry-run
./install.sh
```

```bat
REM Windows Command Prompt; in PowerShell use .\install.cmd
install.cmd --dry-run
install.cmd
```

Equivalent direct commands are `python3 tools/install_workbench.py` on macOS/Linux
or `py -3 tools/install_workbench.py` on Windows. If the Windows Python launcher
is unavailable, use your Python 3.10+ executable directly. Run `--help` for options.
The wrappers work from other directories and preserve quoted paths with spaces.

Default installation creates `.venv` inside the checkout, installs image
requirements there, runs `npm ci`, and builds `dist/`. It replaces checkout-local
`node_modules` and `dist` as those existing npm commands normally do. It starts
no server or desktop app. Keep the checkout at its final location.

An existing venv is **refused by default**. Pick a new `--venv "/absolute/new env"`,
or explicitly pass `--reuse-venv` to allow dependency updates in a verified existing
venv. Dependencies are not fully pinned for scientific Python; this is a setup
convenience, not a reproducible scientific-environment certification.

## Optional desktop and science dependencies

```sh
./install.sh --desktop --extra gpa --extra structures
```

Choose only what you need: `--desktop` installs Electron through the existing
separate desktop lockfile; `--extra gpa`, `--extra structures`, and `--extra dm4`
install the corresponding requirements in the chosen venv. DM reading uses an
optional GPL-3.0-or-later RosettaSciIO dependency; it is not bundled here. The
installer does not claim native desktop qualification on every OS. See
[desktop scope](DESKTOP.md) and [runtime support](CI_SUPPORT.md).

## Optional Skills, without touching MCP configuration

The four scientific Skills can be installed independently:

```sh
python3 tools/install_workbench.py --skills-only --skills-dir "$HOME/.codex/skills" --dry-run
python3 tools/install_workbench.py --skills-only --skills-dir "$HOME/.codex/skills"
```

```bat
py -3 tools\install_workbench.py --skills-only --skills-dir "%USERPROFILE%\.codex\skills" --dry-run
py -3 tools\install_workbench.py --skills-only --skills-dir "%USERPROFILE%\.codex\skills"
```

For another client, supply its actual Skills directory. To install runtime and
Skills together, add `--skills-dir` to the ordinary installation command.
This explicitly copies all four sibling Skills, their scripts/tests/examples,
and referenced Markdown documents into `.microscopy-workbench-references` beside
them. Local Markdown links are rewritten **only in the installed copies**.
Move all five directories together to preserve offline relative references.
Historical references absent from this source snapshot are clearly marked
unavailable in installed text and listed in that support directory's
`install-report.json`; no missing scientific content is invented. Linked non-Markdown repository artifacts
are not copied into client Skills; their labels direct you to the source checkout.

Existing entries cause a failure **before any copies**. To intentionally upgrade,
add `--existing-skills backup`: previous entries are retained in a unique sibling
`.skills.microscopy-backup-...` directory **outside** the chosen Skills root
(the prefix follows its actual directory name). POSIX permissions are 700; on
Windows the directory inherits its parent ACL, so use a private parent directory.
Backups are not inside the client's scanned Skills root.
An interrupted multi-entry replacement can need manual recovery from these
backups. The installer is not a lock against other writers: close client skill
editors and do not run concurrent installations. Unrelated Skills stay unchanged.
The optional Materials Project Skill is not installed by this command.

## Generate independent MCP templates during installation

Supply both paths, with an existing parent for the **new** output directory:

```sh
./install.sh --config-output "/absolute/private/new connection" \
  --workspace "/absolute/science workspace"
```

After installing the runtime, this reuses `dist/tools/prepare_plugin.mjs` to generate `plugin-config.json`,
`mcp.json` and `codex.toml`. It never merges them into actual user settings.
Add `--extra structures` to enable the structure provider and install its packages.
Inspect the generated snippets and follow [plugin connection instructions](AUTOMATION_PLUGIN.md).
Paths are individual subprocess arguments and JSON/TOML strings, preserving
spaces. Moving the checkout or venv requires regenerating these absolute-path
snippets into another new directory. Keep private configuration outside Git.

## Verify and recover

After setup, run `npm run inspect -- --source "/absolute/image.tiff" --workspace
"/absolute/workspace" --python "/absolute/checkout/.venv/bin/python"` (one line).
On Windows use `.venv\Scripts\python.exe`. Keep the process running and open the
local URL. See [manual setup](CLIENT_SETUP.md) for the full workflow.

Installation stops on the first failed subprocess and returns a nonzero status.
A network/build failure can leave a partial venv, node_modules or build output;
fix the reported cause and deliberately reuse that venv or choose a new one.
No rollback of downloaded runtime dependencies is promised. A conflicting
configuration output is never overwritten. Do not delete your scientific workspace
to recover setup. `--check` is an alias for `--dry-run`.

The isolated regression command is `python3 tests/install_workbench_test.py`
(or `py -3 tests/install_workbench_test.py`). It uses temporary directories, tests
portable copies, collision refusal, explicit backups and failure recovery, and
never installs dependencies or writes real client configuration. Passing it is
not an end-to-end clean-machine or native desktop qualification.
