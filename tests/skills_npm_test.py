"""Real offline npm exec contract tests, isolated from actual client configuration."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'packages/skills/microscopy-scientific-skills.tgz'


class SkillsNpmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='mwb-npm-')
        cls.root = Path(cls.temp.name).resolve()
        cls.pkg = cls.root / 'package'
        with tarfile.open(ARCHIVE) as tar:
            # Known local build output, never an arbitrary user-supplied archive.
            tar.extractall(cls.root, filter='data')
        cls.npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        cls.node = shutil.which('node')
        if not cls.npm or not cls.node:
            raise unittest.SkipTest('Node and npm are required')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.dest = self.root / self._testMethodName / 'Skill 空间' / 'skills'

    def cli(self, *args, package=None, ok=True):
        result = subprocess.run([self.node, str((package or self.pkg) / 'install.mjs'), *map(str, args)],
                                text=True, encoding='utf-8', capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_archive_reproducible_and_has_no_dependencies_or_lifecycle(self):
        spec = importlib.util.spec_from_file_location('build', ROOT / 'tools/build_skills_npm.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        rebuilt = builder.build()
        def archive_files(data):
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                return {member.name: hashlib.sha256(archive.extractfile(member).read()).hexdigest()
                        for member in archive if member.isfile()}
        # Name a differing resource instead of dumping a huge compressed-byte diff.
        self.assertEqual(archive_files(ARCHIVE.read_bytes()), archive_files(rebuilt))
        self.assertEqual(hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), hashlib.sha256(rebuilt).hexdigest())
        package = json.loads((self.pkg / 'package.json').read_text())
        self.assertTrue(package['private'])
        for key in ['dependencies', 'optionalDependencies', 'devDependencies', 'scripts']:
            self.assertFalse(package.get(key))
        self.assertLess(ARCHIVE.stat().st_size, 1024 * 1024)

    def test_offline_npm_exec_installs_actual_tarball(self):
        # Empty npm cache + --offline proves no registry, Git or Python dependency.
        result = subprocess.run([self.npm, 'exec', '--yes', '--ignore-scripts', '--offline',
                                 '--cache', str(self.dest.parent / 'npm cache'),
                                 '--package=' + str(ARCHIVE), '--', 'microscopy-skills',
                                 '--skills-dir', str(self.dest)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list(self.dest.glob('*/SKILL.md'))), 4)
        self.assertFalse((self.dest / 'node_modules').exists())
        self.assert_bundle_bytes(self.dest)

    def assert_bundle_bytes(self, dest):
        manifest = json.loads((self.pkg / 'manifest.json').read_text())
        for entry in manifest['files']:
            self.assertEqual(hashlib.sha256((dest / entry['path']).read_bytes()).hexdigest(), entry['sha256'])

    def test_dry_run_and_argument_errors_never_create_destination(self):
        self.cli('--skills-dir', self.dest, '--dry-run')
        self.assertFalse(self.dest.parent.exists())
        for args in [[], ['--help'], ['--version'], ['--list']]:
            self.cli(*args)
        for args in [['--unknown'], ['--skills-dir'], ['--skills-dir', self.dest, '--existing-skills', 'overwrite']]:
            self.cli(*args, ok=False)
        self.assertFalse(self.dest.exists())

    def test_conflict_fails_before_writes_and_backup_preserves_unrelated(self):
        old = self.dest / 'microscopy-router'
        old.mkdir(parents=True)
        (old / 'SKILL.md').write_text('private local edits')
        other = self.dest / 'unrelated'
        other.mkdir()
        (other / 'SKILL.md').write_text('unrelated')
        result = self.cli('--skills-dir', self.dest, ok=False)
        self.assertIn('left untouched', result.stderr)
        self.assertEqual(sorted(p.name for p in self.dest.iterdir()), ['microscopy-router', 'unrelated'])
        self.cli('--skills-dir', self.dest, '--existing-skills', 'backup')
        backups = list(self.dest.parent.glob('.skills.microscopy-backup-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'microscopy-router/SKILL.md').read_text(), 'private local edits')
        self.assertEqual((other / 'SKILL.md').read_text(), 'unrelated')
        self.assertFalse(list(self.dest.glob('.microscopy-stage-*')))
        self.assert_bundle_bytes(self.dest)

    def test_corrupt_bundle_fails_before_destination_write(self):
        altered = self.dest.parent / 'corrupt package'
        shutil.copytree(self.pkg, altered)
        (altered / 'bundle/microscopy-router/SKILL.md').write_text('corrupt')
        result = self.cli('--skills-dir', self.dest, package=altered, ok=False)
        self.assertIn('checksum mismatch', result.stderr)
        self.assertFalse(self.dest.exists())

    def test_symlink_destination_or_entry_not_replaced(self):
        if os.name == 'nt':
            self.skipTest('Windows symlink creation needs privileges not required for installation')
        target = self.dest.parent / 'real'
        target.mkdir(parents=True)
        self.dest.symlink_to(target, target_is_directory=True)
        self.cli('--skills-dir', self.dest, '--existing-skills', 'backup', ok=False)
        self.dest.unlink()
        self.dest.mkdir()
        (self.dest / 'microscopy-router').symlink_to(target, target_is_directory=True)
        self.cli('--skills-dir', self.dest, '--existing-skills', 'backup', ok=False)
        self.assertEqual(list(target.iterdir()), [])

    def test_reported_rename_failure_restores_prior_entries(self):
        self.dest.mkdir(parents=True)
        for name in ['crystallography-compare', 'microscopy-automation']:
            entry = self.dest / name
            entry.mkdir()
            (entry / 'SKILL.md').write_text('original ' + name)
        hook = self.dest.parent / 'fail-second-rename.mjs'
        hook.write_text("import fs from 'node:fs'; const rename = fs.renameSync; "
                        "fs.renameSync = (a, b) => { if (String(a).includes('.microscopy-stage-') "
                        "&& String(a).endsWith('microscopy-automation')) throw new Error('injected rename failure'); "
                        "return rename(a, b); };", encoding='utf-8')
        result = subprocess.run([self.node, '--import', hook.as_uri(), str(self.pkg / 'install.mjs'),
                                 '--skills-dir', str(self.dest), '--existing-skills', 'backup'],
                                capture_output=True, text=True, encoding='utf-8')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('injected rename failure', result.stderr)
        self.assertEqual(sorted(p.name for p in self.dest.iterdir()), ['crystallography-compare', 'microscopy-automation'])
        for p in self.dest.iterdir():
            self.assertEqual((p / 'SKILL.md').read_text(), 'original ' + p.name)
        self.assertFalse(list(self.dest.parent.glob('.skills.microscopy-stage-*')))

    def test_existing_parent_alias_is_supported(self):
        if os.name == 'nt':
            self.skipTest('Windows symlink creation is not an installation requirement')
        real = self.dest.parent / 'real parent'
        real.mkdir(parents=True)
        alias = self.dest.parent / 'alias'
        alias.symlink_to(real, target_is_directory=True)
        self.cli('--skills-dir', alias / 'skills')
        self.assert_bundle_bytes(real / 'skills')

    def test_path_traversal_in_manifest_refused(self):
        altered = self.dest.parent / 'malformed package'
        shutil.copytree(self.pkg, altered)
        m = json.loads((altered / 'manifest.json').read_text())
        m['files'][0]['path'] = '../escape'
        (altered / 'manifest.json').write_text(json.dumps(m))
        result = self.cli('--skills-dir', self.dest, package=altered, ok=False)
        self.assertIn('Unsafe', result.stderr)
        self.assertFalse(self.dest.exists())


if __name__ == '__main__':
    unittest.main()
