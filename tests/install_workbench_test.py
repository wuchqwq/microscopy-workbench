"""Isolated stdlib installer tests; no downloads or real client writes."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('installer', ROOT / 'tools/install_workbench.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='microscopy install test ')
        self.addCleanup(self.temp.cleanup)
        self.destination = Path(self.temp.name) / 'client skills'
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def test_dry_run_no_writes_or_processes(self):
        with mock.patch.object(installer.subprocess, 'run', side_effect=AssertionError('spawn')):
            installer.main(['--skills-only', '--skills-dir', str(self.destination), '--dry-run'])
        self.assertFalse(self.destination.exists())

    def test_copy_complete_portable_and_source_unchanged(self):
        original = (ROOT / 'skills/scientific-agent/microscopy-automation/SKILL.md').read_bytes()
        installer.install_skills(self.destination)
        moved = self.destination.with_name('moved skills with spaces')
        self.destination.rename(moved)
        for name in ['microscopy-automation', 'microscopy-router', 'microscopy-observe-revise', 'crystallography-compare']:
            self.assertTrue((moved / name / 'SKILL.md').is_file())
        self.assertTrue((moved / 'microscopy-observe-revise/scripts/tiff_raw_probe.py').is_file())
        for document in moved.rglob('*.md'):
            for match in installer.LINK.finditer(document.read_text(encoding='utf-8')):
                link = installer.local_link(document, match['url'], moved)
                if link:
                    self.assertTrue(link[0].exists(), f'{document}: {match["url"]}')
        self.assertEqual(original, (ROOT / 'skills/scientific-agent/microscopy-automation/SKILL.md').read_bytes())
        report = json.loads((moved / installer.SUPPORT / 'install-report.json').read_text())
        self.assertIn('source_reference_notices', report)

    def test_existing_conflict_is_non_destructive(self):
        self.destination.mkdir()
        sentinel = self.destination / 'microscopy-router'
        sentinel.mkdir()
        (sentinel / 'mine').write_text('private')
        with self.assertRaisesRegex(ValueError, 'left untouched'):
            installer.install_skills(self.destination)
        self.assertEqual((sentinel / 'mine').read_text(), 'private')
        self.assertEqual(len(list(self.destination.iterdir())), 1)

    def test_explicit_backup_preserves_previous(self):
        installer.install_skills(self.destination)
        (self.destination / 'microscopy-router/mine').write_text('previous')
        installer.install_skills(self.destination, 'backup')
        backup_roots = list(self.destination.parent.glob('.' + self.destination.name + '.microscopy-backup-*'))
        self.assertEqual(len(backup_roots), 1)
        backups = [backup_roots[0] / 'microscopy-router']
        self.assertEqual(len(list(self.destination.glob('*/SKILL.md'))), 4)
        if os.name != 'nt':
            self.assertEqual(backup_roots[0].stat().st_mode & 0o777, 0o700)
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'mine').read_text(), 'previous')
        self.assertFalse((self.destination / 'microscopy-router/mine').exists())

    def test_partial_failure_rolls_back(self):
        installer.install_skills(self.destination)
        sentinel = self.destination / 'microscopy-router/mine'
        sentinel.write_text('previous')
        rename = Path.rename
        def fail_one(path, target):
            if path.name == 'microscopy-router' and path.parent.name.startswith('.microscopy-install-'):
                raise OSError('injected rename failure')
            return rename(path, target)
        with mock.patch.object(Path, 'rename', fail_one), self.assertRaisesRegex(OSError, 'injected'):
            installer.install_skills(self.destination, 'backup')
        self.assertEqual(sentinel.read_text(), 'previous')
        self.assertEqual(len(list(self.destination.iterdir())), 5)

    def test_existing_venv_refused_before_writes(self):
        venv = Path(self.temp.name) / 'existing env'
        venv.mkdir()
        with mock.patch.object(installer, 'node_tools', return_value=('node', 'npm')), mock.patch.object(installer, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Venv already exists'):
                installer.main(['--venv', str(venv)])
            run.assert_not_called()

    def test_existing_config_refused_before_writes(self):
        config = Path(self.temp.name) / 'my configuration'
        config.mkdir()
        with mock.patch.object(installer, 'node_tools', return_value=('node', 'npm')), mock.patch.object(installer, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'NEW directory'):
                installer.main(['--venv', str(config / 'venv'), '--config-output', str(config), '--workspace', str(config / 'workspace')])
            run.assert_not_called()

    def test_command_paths_stay_separate_arguments(self):
        base = Path(self.temp.name)
        with mock.patch.object(installer, 'node_tools', return_value=('node path', 'npm path')), mock.patch.object(installer, 'run') as run:
            installer.main(['--dry-run', '--venv', str(base / 'scientific env'), '--config-output', str(base / 'new config'), '--workspace', str(base / 'new workspace'), '--extra', 'structures', '--desktop'])
            config_cmd = run.call_args_list[-1].args[0]
            self.assertEqual(config_cmd[config_cmd.index('--workspace') + 1], base / 'new workspace')
            self.assertEqual(config_cmd[-1], '--structures')
            self.assertFalse((base / 'scientific env').exists())

    def test_missing_and_unsupported_node(self):
        with mock.patch.object(installer.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(ValueError, 'Install Node'):
                installer.node_tools()
        with mock.patch.object(installer.shutil, 'which', return_value='node'), mock.patch.object(installer.subprocess, 'check_output', return_value='v20.1.0'):
            with self.assertRaisesRegex(ValueError, 'Unsupported Node'):
                installer.node_tools()
        with mock.patch.object(installer.shutil, 'which', return_value='node'), mock.patch.object(installer.subprocess, 'check_output', return_value='v22.1.0'):
            with self.assertRaisesRegex(ValueError, '22.12'):
                installer.node_tools(True)

    def test_dependency_failure_stops_before_build_and_skills(self):
        with mock.patch.object(installer, 'node_tools', return_value=('node', 'npm')), mock.patch.object(installer, 'run', side_effect=subprocess.CalledProcessError(2, ['venv'])) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                installer.main(['--venv', str(Path(self.temp.name) / 'env'), '--skills-dir', str(self.destination)])
            self.assertEqual(run.call_count, 1)
            self.assertFalse(self.destination.exists())

    @unittest.skipIf(os.name == 'nt', 'symlink creation requires extra Windows privilege')
    def test_symlink_destination_rejected(self):
        self.destination.symlink_to(Path(self.temp.name), target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            installer.install_skills(self.destination)

    def test_missing_output_parent_refused(self):
        base = Path(self.temp.name)
        with mock.patch.object(installer, 'node_tools', return_value=('node', 'npm')), mock.patch.object(installer, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'parent must already exist'):
                installer.main(['--venv', str(base / 'env'), '--config-output', str(base / 'missing' / 'config'), '--workspace', str(base / 'workspace')])
            run.assert_not_called()

    def test_reuse_requires_real_venv(self):
        base = Path(self.temp.name)
        with mock.patch.object(installer, 'node_tools', return_value=('node', 'npm')), mock.patch.object(installer, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Not a usable venv'):
                installer.main(['--venv', str(base), '--reuse-venv'])
            run.assert_not_called()

    def test_reference_traversal_refused(self):
        base = Path(self.temp.name)
        with self.assertRaisesRegex(ValueError, 'escapes repository'):
            installer.local_link(base / 'SKILL.md', '../private.txt', base)

    def test_supported_node_versions(self):
        for version in ['v22.12.0', 'v24.1.0']:
            with mock.patch.object(installer.shutil, 'which', return_value='node'), mock.patch.object(installer.subprocess, 'check_output', return_value=version):
                self.assertEqual(installer.node_tools(True), ('node', 'node'))

    def test_cli_bad_combination(self):
        result = subprocess.run([sys.executable, str(ROOT / 'tools/install_workbench.py'), '--skills-only'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('requires --skills-dir', result.stderr)


if __name__ == '__main__':
    unittest.main()
