# Install the four scientific Skills with npx

[简体中文](SKILLS_INSTALL.zh-CN.md) · [Full workbench installer](INSTALL.md)

**You do not need an npm account, an npm registry publication, Git, Python, or the
full repository to copy these Skills.** Use Node.js **22.x or 24.x**, including npm.
The checked-in, reproducible npm tarball is about **410 KiB** and has **zero runtime
dependencies** and **no lifecycle scripts**. The npm package is private to prevent
accidental registry publication. This is a candidate on draft PR #135, not a release.

## macOS / Linux

Choose your client's actual Skills directory. This example uses Codex:

```sh
npx --yes --ignore-scripts --package="https://raw.githubusercontent.com/wuchqwq/microscopy-workbench/publish/mac-r5-skills-r2-install/packages/skills/microscopy-scientific-skills.tgz" microscopy-skills --skills-dir "$HOME/.codex/skills" --dry-run
```

Check the destination, then run the same command **without `--dry-run`** to install.
For Windows PowerShell, use `npx.cmd` to avoid PowerShell's script-execution-policy
restriction on `npx.ps1`:

```powershell
npx.cmd --yes --ignore-scripts --package="https://raw.githubusercontent.com/wuchqwq/microscopy-workbench/publish/mac-r5-skills-r2-install/packages/skills/microscopy-scientific-skills.tgz" microscopy-skills --skills-dir "$env:USERPROFILE\.codex\skills" --dry-run
```

In Windows Command Prompt, use `%USERPROFILE%\.codex\skills` instead of the
PowerShell environment-variable expression. Quote paths containing spaces.
Restart the agent or refresh its skill discovery after installation.

**Pin for reproducibility:** the examples follow a movable development branch.
Replace `publish/mac-r5-skills-r2-install` in the URL with the **full 40-character
commit SHA** you reviewed on GitHub. The same command then selects that snapshot,
not whichever code happens to be latest. Do not use an unqualified registry command
such as `npx microscopy-scientific-skills`: no registry package is published by this
project. `npx` executes project code, so review the source and choose a trusted SHA.

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

## What is installed and what is not

Installed Skills **0.6.1-r2**, installer **0.6.1-r2.1**:

- `microscopy-router`
- `microscopy-observe-revise`
- `microscopy-automation`
- `crystallography-compare`
- `.microscopy-workbench-references` (support documents, not a fifth Skill)

Keep these five directories together. Relative Markdown links are rewritten in
installed copies; omitted historical/non-Markdown references are labeled and listed
in `.microscopy-workbench-references/install-report.json`. The optional Materials
Project Skill is not included. The installer touches no MCP, model, authentication,
client settings, shell profile, or unrelated Skills.

**Copying Skills does not install the scientific runtime.** The four Skills can be
discovered immediately, but their provider-dependent operations require the
[workbench and MCP setup](INSTALL.md). The included Python helpers require Python
and any dependencies their Skill declares when they are actually used. Skill
installation alone is not native desktop or scientific-accuracy qualification.

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
