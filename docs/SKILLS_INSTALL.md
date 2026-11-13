# Install the five scientific Skills with npx

[简体中文](SKILLS_INSTALL.zh-CN.md) · [Full workbench installer](INSTALL.md)

Use Node.js **22.x or 24.x**, including npm, to copy the Skills. The checked-in
npm tarball has **zero runtime dependencies** and **no lifecycle scripts**.
You can use the tarball from a checkout or download it from a reviewed commit.
The npm package is private and distributed as a repository asset.

## Install from a checkout

Run from the root of a checkout containing installer **0.6.1-r3.1**. If you
need to clone the repository, check out the reviewed commit that contains
this guide and its accompanying tarball. Choose your client's actual Skills
directory. The macOS/Linux example uses Codex.

```sh
asset="$PWD/packages/skills/microscopy-scientific-skills.tgz"
npx --yes --ignore-scripts --offline --package="$asset" microscopy-skills --list
npx --yes --ignore-scripts --offline --package="$asset" microscopy-skills --skills-dir "$HOME/.codex/skills" --dry-run
```

For Windows PowerShell, use `npx.cmd` to avoid the script execution policy
restriction on `npx.ps1`.

```powershell
$asset = (Resolve-Path -LiteralPath '.\packages\skills\microscopy-scientific-skills.tgz').Path
npx.cmd --yes --ignore-scripts --offline --package="$asset" microscopy-skills --list
npx.cmd --yes --ignore-scripts --offline --package="$asset" microscopy-skills --skills-dir "$env:USERPROFILE\.codex\skills" --dry-run
```

Check that `--list` includes `ptyrad-reconstruction` and verify the destination,
then run the install command without `--dry-run`. In Windows Command Prompt,
use `%USERPROFILE%\.codex\skills` as the destination. Quote paths containing
spaces. Restart the agent or refresh its skill discovery after installation.

## Install from a pinned GitHub asset

Once the reviewed revision is available in this repository, set `commit` to
its full 40-character SHA. From a checkout at that revision, `git rev-parse HEAD`
prints the SHA. For macOS/Linux use:

```sh
commit=$(git rev-parse HEAD)
asset="https://raw.githubusercontent.com/wuchqwq/microscopy-workbench/$commit/packages/skills/microscopy-scientific-skills.tgz"
npx --yes --ignore-scripts --package="$asset" microscopy-skills --skills-dir "$HOME/.codex/skills" --dry-run
```

For Windows PowerShell use:

```powershell
$commit = (git rev-parse HEAD).Trim()
$asset = "https://raw.githubusercontent.com/wuchqwq/microscopy-workbench/$commit/packages/skills/microscopy-scientific-skills.tgz"
npx.cmd --yes --ignore-scripts --package="$asset" microscopy-skills --skills-dir "$env:USERPROFILE\.codex\skills" --dry-run
```

Without a checkout, set the SHA directly from the reviewed GitHub commit.
Use a revision that contains the five-Skill package. The older
`publish/mac-r5-skills-r2-install` asset belongs to the four-Skill bundle.
`npx` executes the installer, so use the explicit package path or reviewed
URL each time.

`npm exec --yes --ignore-scripts --package="URL" -- microscopy-skills ...` is
an equivalent invocation. `--dry-run` prevents writes by the Skills installer;
**npm may still download/cache the package** before it runs. `--ignore-scripts`
disables npm lifecycle scripts, not the explicitly requested installer executable.
No registry packages, Python packages, Electron, or scientific dependencies are
installed by this tarball. npm uses its normal cache and may make its usual metadata
requests. To avoid network entirely after download, use the next section.

## Download once, inspect, or install offline

Download `packages/skills/microscopy-scientific-skills.tgz` from the chosen commit.
Its source is in `packages/skills-installer/`; `tools/build_skills_npm.py` rebuilds
it from the existing Python portable-Skills bundler. `manifest.json` lists every
installed file with its SHA-256. Checksums detect damaged bundled content, not
malicious changes to a package and its manifest; pin and trust the source revision.

```sh
npm exec --yes --ignore-scripts --offline --package="/absolute/path/microscopy-scientific-skills.tgz" -- microscopy-skills --skills-dir "/absolute/client/skills"
```

Use `npm.cmd` and a quoted Windows path on Windows. This works from an empty npm
cache because the package has no dependencies. Alternatively extract the archive
and run `node package/install.mjs --skills-dir "/absolute/client/skills"`.
`--help`, `--version`, and `--list` show the interface, installer version, and names.

## Installed Skills and dependencies

Installed Skills **0.6.1-r3**, installer **0.6.1-r3.1**.

- `microscopy-router`
- `microscopy-observe-revise`
- `microscopy-automation`
- `crystallography-compare`
- `ptyrad-reconstruction`
- `.microscopy-workbench-references` (shared reference documents)

Keep these six directories together when moving the bundle. Relative Markdown links are rewritten in
installed copies; omitted historical/non-Markdown references are labeled and listed
in `.microscopy-workbench-references/install-report.json`. The optional Materials
Project Skill is not included. The installer touches no MCP, model, authentication,
client settings, shell profile, or unrelated Skills.

Provider-dependent operations require the [workbench and MCP setup](INSTALL.md).
PtyRAD ships standalone CPU helpers for diffraction and phase checks. Set up
Python and the dependencies required by the selected input format when running
those helpers. Prepare PtyRAD, GPU dependencies and any credentials separately
when running reconstruction. [PtyRAD CLI guide (中文)](../skills/scientific-agent/ptyrad-reconstruction/README.md)

## Upgrade and recovery

An existing managed entry is refused before any copying. To deliberately replace
it, append `--existing-skills backup`. Old entries are retained in a unique sibling
`.skills.microscopy-backup-...` directory **outside** the scanned Skills directory.
The prefix follows the chosen destination's basename. POSIX permissions are 700;
Windows inherits the parent's ACL, so choose a private parent directory. Symlink
entries and a symlink destination are not replaced. Unrelated Skills are preserved.

Close skill editors and run only one installer at a time. This is not a concurrent
writer lock. Reported copy failures attempt rollback, but an OS/process interruption
may require manual recovery. The backup path is printed before replacements. To
recover, stop the client, move the affected new managed directories aside, restore
the corresponding backup directories to their original locations, then refresh the
client. Keep backups until you verify the installation.

To remove only PtyRAD from skill discovery, move the installed
`ptyrad-reconstruction` directory outside the client's Skills directory and
refresh the client.

## Maintainers and verification scope

```sh
python3 -B tools/build_skills_npm.py
python3 -B tools/build_skills_npm.py --check
python3 -B tests/skills_npm_test.py
```

The builder uses Python's standard library, canonical UTF-8/LF resources, sorted
paths, and zeroed archive timestamps/ownership. Commit source changes and the
rebuilt tarball together. The tarball is a generated software distribution, not
private data or a scientific-evidence archive. Its size is guarded below 1 MiB.

[Installer CI](../.github/workflows/installers.yml) checks the packaged installer on
Windows, macOS, and Linux under Node 22/24. It checks reproducibility, byte hashes,
empty-cache offline npm installation, quoted Unicode paths, dry-run, default
conflicts, explicit backup, corruption/traversal rejection, and a real GitHub URL
installation for the PR head SHA. POSIX symlink tests are separate; Windows
symlink creation is not required. These are installer checks, not clean-machine
runtime dependency installation, GUI acceptance, or real-specimen validation.
