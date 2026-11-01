"""Disposable real-file config preservation tests; no user config/science packages."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import runpy
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "register_codex_mcp.py"
spec = importlib.util.spec_from_file_location("register_codex_mcp", SCRIPT)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="microscopy config with spaces ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / "user config" / "config.toml"
        self.backups = self.root / "private backups"
        self.plugin = self.root / "plugin settings.json"
        self.plugin.write_text(json.dumps({"schema_version": 1, "python": sys.executable,
                                          "workspace_root": str(self.root / "science workspace"),
                                          "structures": True}))
        self.node = shutil.which("node")
        if not self.node:
            self.skipTest("Node is required by the project, not a scientific dependency")
        self.server = self.root / "compiled plugin with spaces.mjs"
        self.server.write_text("// test launcher path, never executed\n")
        self.patcher = patch.object(helper, "SERVER", self.server)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def write(self, data):
        self.config.parent.mkdir(parents=True, exist_ok=True)
        self.config.write_bytes(data)
        return data

    def run_registration(self, **kwargs):
        return helper.register(self.config, self.node, self.plugin, backup_dir=self.backups, **kwargs)

    def test_append_preserves_raw_text_empty_allowlist_and_unknown_fields(self):
        old = self.write(b'# private comments\r\nmodel = "leave-this"\r\n'
                         b'[mcp_servers.other]\r\ncommand = "/old node"\r\nargs = []\r\n'
                         b'enabled_tools = []\r\ncustom_extension = { unknown = "retain" }\r\n'
                         b'[mcp_servers.other.env]\r\nPRIVATE_VALUE = "do-not-print"')
        result = self.run_registration(apply=True)
        new = self.config.read_bytes()
        self.assertTrue(new.startswith(old))
        data = tomllib.loads(new.decode())
        self.assertEqual(data["mcp_servers"]["other"], tomllib.loads(old.decode())["mcp_servers"]["other"])
        self.assertEqual(data["model"], "leave-this")
        self.assertNotIn("do-not-print", json.dumps(result))
        self.assertEqual(data["mcp_servers"]["microscopy_workbench"]["args"],
                         [str(self.server), "--config", str(self.plugin)])

    def test_cli_defaults_to_dry_run_without_creating_directories(self):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), "--config", str(self.config),
                                       "--node", self.node, "--plugin-config", str(self.plugin)]):
            with contextlib.redirect_stdout(output):
                helper.main()
        self.assertEqual(json.loads(output.getvalue())["status"], "would_add")
        self.assertFalse(self.config.parent.exists())
        self.assertFalse(self.backups.exists())

    def test_backup_full_bytes_and_private_modes(self):
        old = self.write(b'approval_policy = "on-request"\n')
        result = self.run_registration(apply=True)
        backup = Path(result["backup"])
        self.assertEqual(backup.read_bytes(), old)
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(self.backups.stat().st_mode), 0o700)
        self.assertTrue(result["existed_before"])

    def test_new_config_private_and_repeated_exact_entry_noop(self):
        first = self.run_registration(apply=True)
        before = helper.snapshot(self.config)
        backups = list(self.backups.iterdir())
        second = self.run_registration(apply=True)
        self.assertFalse(first["existed_before"])
        self.assertEqual(second["status"], "already_configured")
        self.assertEqual(helper.snapshot(self.config), before)
        self.assertEqual(list(self.backups.iterdir()), backups)
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o600)

    def test_conflicting_launcher_refused_without_backup(self):
        old = self.write(b'[mcp_servers.microscopy_workbench]\ncommand = "/old"\n')
        with self.assertRaisesRegex(ValueError, "different settings"):
            self.run_registration(apply=True)
        self.assertEqual(self.config.read_bytes(), old)
        self.assertFalse(self.backups.exists())

    def test_same_launcher_with_custom_env_is_not_overwritten(self):
        self.run_registration(apply=True)
        with self.config.open("ab") as file:
            file.write(b'\n[mcp_servers.microscopy_workbench.env]\nCUSTOM = "keep me"\n')
        old = self.config.read_bytes()
        with self.assertRaisesRegex(ValueError, "different settings"):
            self.run_registration(apply=True)
        self.assertEqual(self.config.read_bytes(), old)

    def test_inline_mcp_table_refused_without_mutation(self):
        old = self.write(b'mcp_servers = { other = { command = "/old" } }\n')
        with self.assertRaisesRegex(ValueError, "TOML is invalid"):
            self.run_registration(apply=True)
        self.assertEqual(self.config.read_bytes(), old)
        self.assertFalse(self.backups.exists())

    def test_existing_lock_is_not_removed_or_stolen(self):
        old = self.write(b'# existing\n')
        lock = self.config.with_name(self.config.name + ".microscopy-register.lock")
        lock.write_text("another helper or unresolved attempt")
        with self.assertRaises(FileExistsError):
            self.run_registration(apply=True)
        self.assertEqual(lock.read_text(), "another helper or unresolved attempt")
        self.assertEqual(self.config.read_bytes(), old)

    def test_observed_concurrent_edit_is_preserved_and_backup_retained(self):
        old = self.write(b'# initial\n')
        original_backup = helper.backup_snapshot
        def concurrent(*args):
            result = original_backup(*args)
            self.config.write_bytes(b'# external change\n')
            return result
        with patch.object(helper, "backup_snapshot", concurrent):
            with self.assertRaisesRegex(ValueError, "changed concurrently"):
                self.run_registration(apply=True)
        self.assertEqual(self.config.read_bytes(), b'# external change\n')
        self.assertEqual(next(self.backups.iterdir()).read_bytes(), old)
        self.assertFalse(self.config.with_name(self.config.name + ".microscopy-register.lock").exists())

    def test_same_bytes_but_replaced_inode_detected(self):
        old = self.write(b'# initial\n')
        original_backup = helper.backup_snapshot
        def replacement(*args):
            result = original_backup(*args)
            other = self.root / "external replacement"
            other.write_bytes(old)
            os.replace(other, self.config)
            return result
        with patch.object(helper, "backup_snapshot", replacement):
            with self.assertRaisesRegex(ValueError, "changed concurrently"):
                self.run_registration(apply=True)
        self.assertEqual(self.config.read_bytes(), old)

    def test_postwrite_change_has_no_blind_rollback(self):
        self.write(b'# initial\n')
        replace = os.replace
        def external_after_write(source, target):
            replace(source, target)
            Path(target).write_bytes(b'# external post-write edit\n')
        with patch.object(helper.os, "replace", external_after_write):
            with self.assertRaisesRegex(ValueError, "no automatic rollback"):
                self.run_registration(apply=True)
        self.assertEqual(self.config.read_bytes(), b'# external post-write edit\n')
        self.assertEqual(next(self.backups.iterdir()).read_bytes(), b'# initial\n')

    @unittest.skipIf(os.name == "nt", "Fixture uses POSIX symlinks")
    def test_symlink_config_refused(self):
        target = self.root / "other config"
        target.write_bytes(b'# must not change\n')
        self.config.parent.mkdir()
        self.config.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "not a symlink"):
            self.run_registration(apply=True)
        self.assertEqual(target.read_bytes(), b'# must not change\n')

    def test_backup_inside_source_checkout_refused(self):
        self.write(b'# initial\n')
        with self.assertRaisesRegex(ValueError, "outside the source"):
            helper.register(self.config, self.node, self.plugin, apply=True,
                            backup_dir=helper.REPO / "private backups must not be committed")
        self.assertEqual(self.config.read_bytes(), b'# initial\n')

    def test_relocated_compiled_package_resolves_server_without_extra_dist(self):
        package = self.root / "relocated compiled package"
        tools = package / "tools"
        tools.mkdir(parents=True)
        copied = tools / SCRIPT.name
        shutil.copyfile(SCRIPT, copied)
        (package / "BUILD.json").write_text('{}')
        resolved = runpy.run_path(str(copied), run_name="test_compiled_registration")
        self.assertEqual(resolved["SERVER"], (tools / "plugin_server.mjs").resolve())

    def test_schema_version_boolean_is_refused_like_plugin_server(self):
        value = json.loads(self.plugin.read_text())
        value["schema_version"] = True
        self.plugin.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "valid absolute-path"):
            self.run_registration(apply=True)
        self.assertFalse(self.config.exists())

    def test_node_older_than_project_engine_is_refused(self):
        result = type("Result", (), {"returncode": 0, "stdout": "v16.20.2\n"})()
        with patch.object(helper.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(ValueError, "18 or newer"):
                self.run_registration(apply=True)
        self.assertFalse(self.config.exists())

    def test_no_fchmod_fallback_creates_config(self):
        # Exercise the Windows code path on every host without altering user ACLs.
        with patch.dict(helper.os.__dict__):
            helper.os.__dict__.pop("fchmod", None)
            self.assertEqual(self.run_registration(apply=True)["status"], "added")
        self.assertTrue(self.config.is_file())

    def test_backup_in_another_git_checkout_refused(self):
        repository = self.root / "unrelated checkout"
        repository.mkdir()
        (repository / ".git").write_text("gitdir: elsewhere")
        self.write(b'# initial\n')
        with self.assertRaisesRegex(ValueError, "outside the source"):
            helper.register(self.config, self.node, self.plugin, apply=True,
                            backup_dir=repository / "backups")
        self.assertEqual(self.config.read_bytes(), b'# initial\n')

    @unittest.skipIf(os.name == "nt", "Windows uses inherited directory ACLs")
    def test_shared_backup_directory_is_refused_before_secret_copy(self):
        self.write(b'private_value = "must not enter shared backup"\n')
        self.backups.mkdir()
        self.backups.chmod(0o755)
        with self.assertRaisesRegex(ValueError, "private mode 700"):
            self.run_registration(apply=True)
        self.assertEqual(list(self.backups.iterdir()), [])
        self.assertEqual(self.config.read_bytes(), b'private_value = "must not enter shared backup"\n')

    def test_relative_paths_and_invalid_settings_refused(self):
        for key, value in (("config", Path("relative.toml")), ("node", Path("relative-node")),
                           ("plugin_config", Path("relative.json"))):
            kwargs = dict(config=self.config, node=self.node, plugin_config=self.plugin)
            kwargs[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "absolute"):
                helper.register(**kwargs)
        self.plugin.write_text('{"schema_version":1,"python":"relative","workspace_root":"relative"}')
        with self.assertRaisesRegex(ValueError, "valid absolute-path"):
            self.run_registration(apply=True)
        self.assertFalse(self.config.exists())


if __name__ == "__main__":
    unittest.main()
