#!/usr/bin/env python3
"""Register only this MCP table; preview by default, never rewrite other settings.

Python 3.11+. The adjacent exclusive lock coordinates this helper's writers.
Byte/inode checks detect observed edits, but cannot lock unrelated applications
or provide a cross-process compare-and-swap. Never roll back another writer.
POSIX backups use modes 700/600; Windows files inherit the chosen directory ACL.
Only the config leaf is checked for symlinks; parent aliases are not a sandbox.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import tomllib
import uuid

REPO = Path(__file__).resolve().parents[1]
SERVER = (REPO / "tools" if (REPO / "BUILD.json").is_file() else REPO / "dist" / "tools") / "plugin_server.mjs"


def absolute(value, label):
    path = Path(value)
    if not path.is_absolute():
        raise ValueError(label + " must be an absolute path")
    return path


def snapshot(path):
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return b"", None, 0o600
    if not stat.S_ISREG(mode):
        raise ValueError("Config must be a regular file, not a symlink")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        data = stream.read()
        after = os.fstat(stream.fileno())
    identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    if identity(before) != identity(after) or not stat.S_ISREG(after.st_mode):
        raise ValueError("Config changed while reading; no write performed")
    return data, identity(after), stat.S_IMODE(after.st_mode)


def parse(data):
    try:
        return tomllib.loads(data.decode("utf-8"))
    except (ValueError, UnicodeError) as error:
        raise ValueError("Config TOML is invalid; no write performed") from error


def check_unchanged(path, original):
    if snapshot(path) != original:
        raise ValueError("Config changed concurrently; no replacement performed")


def desired_entry(node, plugin_config):
    node = absolute(node, "Node")
    plugin_config = absolute(plugin_config, "Plugin config")
    if not node.is_file() or not os.access(node, os.X_OK):
        raise ValueError("Node must be an existing executable")
    result = subprocess.run([str(node), "--version"], capture_output=True, text=True, timeout=5)
    version = re.fullmatch(r"v(\d+)\.\d+\.\d+\s*", result.stdout)
    if result.returncode or version is None or int(version[1]) < 18:
        raise ValueError("Node executable must report version 18 or newer")
    if not SERVER.is_file():
        raise ValueError("Compiled plugin server missing; run npm run build first")
    try:
        data = plugin_config.read_bytes()
        settings = json.loads(data)
        allowed = {"schema_version", "python", "workspace_root", "structures", "structure_python"}
        if len(data) > 16384 or not isinstance(settings, dict) or set(settings) - allowed:
            raise ValueError()
        if type(settings.get("schema_version")) is not int or settings["schema_version"] != 1 or not isinstance(settings.get("structures", False), bool):
            raise ValueError()
        for key in ("python", "workspace_root"):
            absolute(settings[key], key)
        if "structure_python" in settings:
            absolute(settings["structure_python"], "structure_python")
    except (OSError, ValueError, TypeError, KeyError) as error:
        raise ValueError("Plugin config must be a readable valid absolute-path settings JSON") from error
    return {"command": str(node), "args": [str(SERVER), "--config", str(plugin_config)],
            "startup_timeout_sec": 30, "tool_timeout_sec": 300}


def backup_snapshot(directory, path, original):
    directory = absolute(directory, "Backup directory")
    resolved = directory.resolve()
    if resolved.is_relative_to(REPO) or any((p / ".git").exists() for p in (resolved, *resolved.parents)):
        raise ValueError("Private config backups must be outside the source checkout")
    if directory.is_symlink():
        raise ValueError("Backup directory must not be a symlink")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.name != "nt" and stat.S_IMODE(directory.stat().st_mode) != 0o700:
        raise ValueError("Backup directory must have private mode 700")
    backup = directory / (path.name + "." + uuid.uuid4().hex + ".bak")
    with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as stream:
        if hasattr(os, "fchmod"):
            os.fchmod(stream.fileno(), 0o600)
        stream.write(original[0])
        stream.flush()
        os.fsync(stream.fileno())
    return backup


def register(config, node, plugin_config, *, name="microscopy_workbench", apply=False, backup_dir=None):
    config = absolute(config, "Config")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name):
        raise ValueError("Server name must contain 1–64 ASCII letters, digits, underscores or hyphens")
    desired = desired_entry(node, plugin_config)
    original = snapshot(config)
    existing = parse(original[0])
    servers = existing.get("mcp_servers", {})
    if not isinstance(servers, dict):
        raise ValueError("mcp_servers is not a table; config unchanged")
    info = {"config": str(config), "name": name, "command": desired["command"], "args": desired["args"]}
    if name in servers:
        if servers[name] == desired:
            return {**info, "status": "already_configured", "existing_settings_preserved": True}
        raise ValueError("Server name already has different settings; inspect it instead of overwriting")
    entry = "\n\n[mcp_servers." + json.dumps(name) + "]\n"
    entry += "".join(key + " = " + json.dumps(value, ensure_ascii=False) + "\n" for key, value in desired.items())
    planned = original[0] + entry.encode("utf-8")
    updated = parse(planned)  # Also refuses extending an inline/closed mcp_servers table.
    expected = dict(existing)
    expected["mcp_servers"] = {**servers, name: desired}
    if updated != expected:
        raise ValueError("Planned entry would change existing settings; config unchanged")
    if not apply:
        return {**info, "status": "would_add", "existing_settings_preserved": True}
    config.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = config.with_name(config.name + ".microscopy-register.lock")
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    lock_identity = os.fstat(fd)
    nonce = uuid.uuid4().hex.encode()
    temporary = None
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(nonce)
        check_unchanged(config, original)
        backup = backup_snapshot(backup_dir or config.parent / "backups", config, original)
        fd, temporary = tempfile.mkstemp(prefix=".microscopy-config-", dir=config.parent)
        with os.fdopen(fd, "wb") as stream:
            if hasattr(os, "fchmod"):
                os.fchmod(stream.fileno(), original[2])
            else:
                os.chmod(temporary, original[2])
            stream.write(planned)
            stream.flush()
            os.fsync(stream.fileno())
        check_unchanged(config, original)
        os.replace(temporary, config)
        temporary = None
        if snapshot(config)[0] != planned:
            raise ValueError("Config changed after replacement; backup retained, no automatic rollback")
        return {**info, "status": "added", "backup": str(backup),
                "existed_before": original[1] is not None, "existing_settings_preserved": True,
                "before_sha256": hashlib.sha256(original[0]).hexdigest(),
                "after_sha256": hashlib.sha256(planned).hexdigest()}
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)
        try:
            current = lock.lstat()
            if (current.st_dev, current.st_ino) == (lock_identity.st_dev, lock_identity.st_ino) and lock.read_bytes() == nonce:
                lock.unlink()
        except FileNotFoundError:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path.home() / ".codex" / "config.toml")
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--plugin-config", required=True, type=Path)
    parser.add_argument("--name", default="microscopy_workbench")
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--apply", action="store_true", help="Apply the otherwise preview-only append")
    args = parser.parse_args()
    try:
        print(json.dumps(register(args.config, args.node, args.plugin_config, name=args.name,
                                  apply=args.apply, backup_dir=args.backup_dir), indent=2))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, "MCP registration refused: " + str(error) + "\n")


if __name__ == "__main__":
    main()
