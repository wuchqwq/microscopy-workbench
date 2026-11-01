# Standalone science provider: client setup

This is the current installation entry for Windows/macOS/Linux. No GMS,
DigitalMicrograph or old mcp-dm checkout is required. Copied technical references
may retain pre-split `DM_IMAGE_*` examples; use `MICROSCOPY_*` below for this server.
The repository's product name may change later; do not rename persisted object
formats or the server's existing protocol identity during the initial import.

## Independent environment

Use Node >=18 and a separate Python >=3.10. Install
[image requirements](../requirements-images.txt) with that environment's Python.
Use absolute interpreter, repository and workspace paths; do not use GMS Python.
For example, from the new checkout:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-images.txt
```

On Windows use `py -3 -m venv .venv` and
`.venv\Scripts\python.exe -m pip install -r requirements-images.txt`.
These are explicit user-run setup commands, not automatic package installation.

## Codex stdio configuration

Inspect the installed client's supported MCP configuration and existing providers
first. Preserve existing entries and approval policy; do not append a duplicate
`microscopy_core` table. The following is a template, not a file to replace a
user's full configuration with. Replace every path before use:

```toml
[mcp_servers.microscopy_core]
command = "/absolute/path/to/node"
args = ["/absolute/new-checkout/server.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 180

[mcp_servers.microscopy_core.env]
MICROSCOPY_PYTHON = "/absolute/new-checkout/.venv/bin/python"
MICROSCOPY_IMAGE_WORKSPACE = "/absolute/scientific-workspace"
```

For Windows, TOML strings can use forward-slash absolute paths, for example
`C:/Program Files/nodejs/node.exe`, `C:/work/new-checkout/server.mjs`,
`C:/work/new-checkout/.venv/Scripts/python.exe` and `C:/analysis/my-workspace`.
On macOS/Linux use the actual absolute Node and virtual-environment paths.
Quotes preserve spaces; these paths are examples, not assumptions about a host.

Alternatively use the installed CLI's `codex mcp add --help` and explicit env
options after checking existing names. **First save a complete private copy of
the configuration, not just its hash.** Some CLI versions reserialize existing
MCP tables while adding one server, including omission of empty/default fields.
Check all pre-existing entries and approval settings afterward; tool availability
alone does not establish configuration preservation. Keep copies outside the
repository and never publish their contents. See the
[official MCP configuration reference](https://developers.openai.com/codex/mcp/).
Restart/reconnect as the client requires. Verify the connection advertises
`microscopy-core` and `image_*` tools, not `dm_*`. Tools/list alone is not a
scientific task or proof the model has actually received an image.

Optional `MICROSCOPY_CONTEXT_WORKSPACE`, `MICROSCOPY_STRUCTURE_WORKSPACE` and
`MICROSCOPY_STRUCTURE_PYTHON` remain opt-in. Only install
[structure requirements](../requirements-structure-tools.txt) when those tasks
are needed. Materials Project is an independent optional provider, not a default
image dependency. Keep API keys out of repository files, command logs and chat.

As an **alternative** to the direct `microscopy_core` stdio template above,
the compiled plugin entry offers an append-only registrar. Pick one route to
avoid accidentally configuring two copies of the same scientific workspace.
The registrar uses setup Python >=3.11; this does not change the scientific
runtime's Python requirement. Prepare an explicit plugin JSON using the existing
[plugin configuration format](AUTOMATION_PLUGIN.md), then inspect a dry run:

```sh
python3 tools/register_codex_mcp.py --node /absolute/path/to/node \
  --plugin-config /absolute/private/plugin-config.json
```

Add `--apply` to register it. The helper preserves the existing TOML bytes,
backs them up privately before a write, checks for intervening edits, and refuses
an existing name with different settings. It does not call `codex mcp add`,
change approval policy, install a Skill, or overwrite another server. Use
`--config` for a non-default client configuration. Close other configuration
editors while applying; the checks do not lock out unrelated writers. An already
matching entry is a no-op. This prevents a new preservation gap; it cannot
reconstruct an old configuration for which only a hash was retained.
Backups use mode 700/600 on POSIX systems. On Windows, keep the client and backup
directories within the user's private inherited ACL; POSIX mode bits do not
establish Windows access control. Backups inside a Git checkout are refused.

## No-model GUI and first check

```sh
node tools/researcher_inspector.mjs --source /absolute/input.tiff --workspace /absolute/new-workspace --python /absolute/venv/bin/python
```

Use equivalent quoted absolute Windows paths. Keep the local process running;
open its private loopback URL without sharing the token. Supported TIFF types
remain limited; see [the inspector guide](RESEARCHER_DATA_INSPECTOR.md).

Run `npm test` for portable checks. With the configured independent Python,
run `npm run test:science` for the retained synthetic numerical/HTTP smoke.
Actual ordinary-client vision and full browser gestures are separate acceptance.
The [array/ROI/profile guide](IMAGE_NUMERIC_INSPECTION.md) and included screenshots
are source-pinned synthetic examples, not new platform or specimen evidence.

DM can be installed as a separate peer provider on a qualified Windows host.
Do not register this server with the old DM-only PowerShell helper or set
`DM_MCP_BACKEND=images`. A repository rename is not permission to move an old
scientific workspace whose saved paths and identities have not been validated.

The public screenshot assets retain their original source names and bytes; some
legacy `.png` names contain JPEG data. Browsers detect the actual format. They are
UI evidence, not raw scientific arrays, and their hashes are recorded in the
migration manifest. This import does not re-encode them or assert new acceptance.
