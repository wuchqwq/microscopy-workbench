#!/usr/bin/env python3
"""Explicit source-checkout installer. Python stdlib only; never edits client settings."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
SKILLS = Path('skills/scientific-agent')
SUPPORT = '.microscopy-workbench-references'
LINK = re.compile(r'(?P<prefix>!?\[[^\]\n]*\]\()(?P<url>[^)\n]+)(?P<suffix>\))')


def run(argv, dry_run=False):
    print('+ ' + json.dumps([str(x) for x in argv], ensure_ascii=False), flush=True)
    if not dry_run:
        subprocess.run([str(x) for x in argv], cwd=ROOT, check=True)


def existing(path):
    return path.exists() or path.is_symlink()


def local_link(source, url, root):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    target = (source.parent / urllib.parse.unquote(parsed.path)).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Reference escapes repository: ' + str(source) + ': ' + url)
    return target, parsed


def skill_plan(root=ROOT):
    """Bundle scientific Skills and reachable local Markdown references/assets."""
    root = root.resolve()
    source = root / SKILLS
    names = sorted(p.name for p in source.iterdir() if p.is_dir())
    if not names or any(not (source / name / 'SKILL.md').is_file() for name in names):
        raise ValueError('Missing scientific Skill package')
    files = set()
    for path in source.rglob('*'):
        if path.is_symlink():
            raise ValueError('Symlink in Skill package: ' + str(path))
        if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
            files.add(path)
    pending = list(files)
    missing = set()
    while pending:
        path = pending.pop()
        if path.suffix.lower() != '.md':
            continue
        for match in LINK.finditer(path.read_text(encoding='utf-8')):
            result = local_link(path, match['url'], root)
            if result is None:
                continue
            target, _ = result
            if target.is_dir() and target.is_relative_to(source):
                continue
            if not target.is_file():
                missing.add(path.relative_to(root).as_posix() + ' -> ' + match['url'])
                continue
            # Never follow linked files through symlinks into a private tree.
            lexical = path.parent / urllib.parse.unquote(urllib.parse.urlsplit(match['url']).path)
            if lexical.is_symlink():
                raise ValueError('Linked symlink: ' + str(lexical))
            if not target.is_relative_to(source) and target.suffix.lower() != '.md':
                missing.add(path.relative_to(root).as_posix() + ' -> ' + match['url'] + ' [artifact not bundled; see source checkout]')
                continue
            if target not in files:
                files.add(target)
                pending.append(target)
    def destination(path):
        if path.is_relative_to(source):
            return path.relative_to(source)
        return Path(SUPPORT) / path.relative_to(root)
    return {p: destination(p) for p in files}, names, sorted(missing)


def install_skills(destination, policy='fail', dry_run=False, root=ROOT):
    destination = destination.absolute()
    if destination.is_symlink():
        raise ValueError('Skill destination must not be a symlink')
    mapping, names, missing = skill_plan(root)
    entries = names + [SUPPORT]
    conflicts = [name for name in entries if existing(destination / name)]
    if conflicts and policy == 'fail':
        raise ValueError('Existing Skill entries left untouched: ' + ', '.join(conflicts)
                         + '. Use --existing-skills backup to explicitly replace with backups.')
    for name in conflicts:
        if (destination / name).is_symlink():
            raise ValueError('Refusing to replace a symlink: ' + str(destination / name))
    print('Skill destination: ' + str(destination))
    print('Skills: ' + ', '.join(names) + '; bundled files: ' + str(len(mapping)))
    if missing:
        print(str(len(missing)) + ' source-reference notices (historical missing documents or non-Markdown artifacts).')
        print('Installed text labels these links; details are saved in ' + SUPPORT + '/install-report.json.')
    if dry_run:
        return
    destination.mkdir(parents=True, exist_ok=True)
    # Stage before changing existing entries. Backups are retained on success.
    with tempfile.TemporaryDirectory(prefix='.microscopy-install-', dir=destination) as temp:
        stage = Path(temp)
        for source, relative in mapping.items():
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.suffix.lower() != '.md':
                shutil.copy2(source, target)
                continue
            def rewrite(match):
                result = local_link(source, match['url'], root.resolve())
                if result is None:
                    return match[0]
                linked, parsed = result
                if linked in mapping:
                    linked_dest = mapping[linked]
                elif linked.is_dir() and linked.is_relative_to(root.resolve() / SKILLS):
                    linked_dest = linked.relative_to(root.resolve() / SKILLS)
                else:
                    # Retain the label and original target, without a false local link.
                    reason = 'not bundled; see source checkout' if linked.exists() else 'unavailable in source snapshot'
                    return match['prefix'][:-1] + ' (' + reason + ': ' + match['url'] + ')'
                rel = os.path.relpath(linked_dest, relative.parent).replace(os.sep, '/')
                url = urllib.parse.quote(rel, safe='/.-_')
                if parsed.query:
                    url += '?' + parsed.query
                if parsed.fragment:
                    url += '#' + parsed.fragment
                return match['prefix'] + url + match['suffix']
            target.write_text(LINK.sub(rewrite, source.read_text(encoding='utf-8')), encoding='utf-8')
        (stage / SUPPORT).mkdir(exist_ok=True)
        (stage / SUPPORT / 'install-report.json').write_text(json.dumps({
            'skills': names, 'source_reference_notices': missing,
            'note': 'Keep this directory beside the installed Skills when moving them.'
        }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        backups, installed = [], []
        backup_root = None
        if conflicts:
            # Keep old SKILL.md files outside the client's scanned skills root.
            backup_root = Path(tempfile.mkdtemp(prefix='.' + destination.name + '.microscopy-backup-', dir=destination.parent))
            if os.name != 'nt':
                backup_root.chmod(0o700)
        try:
            for name in entries:
                final = destination / name
                if existing(final):
                    if policy != 'backup' or final.is_symlink():
                        raise ValueError('Destination changed while installing: ' + str(final))
                    if backup_root is None:
                        raise ValueError('Destination changed while installing: ' + str(final))
                    backup = backup_root / name
                    final.rename(backup)
                    backups.append((final, backup))
                (stage / name).rename(final)
                installed.append(final)
        except Exception:
            for final in reversed(installed):
                shutil.rmtree(final)
            for final, backup in reversed(backups):
                backup.rename(final)
            raise
        for _, backup in backups:
            print('Backup retained: ' + str(backup))


def node_tools(desktop=False):
    node = shutil.which('node')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not node or not npm:
        raise ValueError('Install Node.js 22.x or 24.x (including npm), then retry. Skills-only needs no Node.')
    version = subprocess.check_output([node, '--version'], text=True).strip()
    match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', version)
    if not match or int(match[1]) not in (22, 24):
        raise ValueError('Unsupported Node ' + version + '; use 22.x or 24.x.')
    if desktop and int(match[1]) == 22 and int(match[2]) < 12:
        raise ValueError('Desktop requires Node 22.12+ within 22.x, or 24.x.')
    return node, npm


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', '--check', dest='dry_run', action='store_true', help='Validate and print the plan without writes or downloads')
    parser.add_argument('--skills-only', action='store_true', help='Copy scientific Skills and references; skip Node, venv and build')
    parser.add_argument('--skills-dir', type=Path, help='Explicit client skills directory (no implicit user-config writes)')
    parser.add_argument('--existing-skills', choices=['fail', 'backup'], default='fail')
    parser.add_argument('--venv', type=Path, default=ROOT / '.venv')
    parser.add_argument('--reuse-venv', action='store_true', help='Explicitly allow dependency changes in an existing venv')
    parser.add_argument('--desktop', action='store_true', help='Install optional Electron runtime; do not launch it')
    parser.add_argument('--extra', choices=['gpa', 'structures', 'dm4'], action='append', default=[])
    parser.add_argument('--config-output', type=Path, help='NEW directory for independent JSON/TOML snippets')
    parser.add_argument('--workspace', type=Path, help='Scientific workspace path for those snippets')
    args = parser.parse_args(argv)
    if sys.version_info < (3, 10):
        raise ValueError('Python 3.10+ required; Python 3.13 recommended.')
    if args.skills_only and (not args.skills_dir or args.desktop or args.extra or args.config_output or args.reuse_venv):
        parser.error('--skills-only requires --skills-dir and cannot combine with runtime options')
    if bool(args.config_output) != bool(args.workspace):
        parser.error('--config-output and --workspace must be used together')
    # Preflight all destinations before downloads or runtime writes.
    if args.skills_dir:
        install_skills(args.skills_dir, args.existing_skills, True)
    if args.skills_only:
        if not args.dry_run:
            install_skills(args.skills_dir, args.existing_skills)
        return 0
    if not (ROOT / 'scripts/build.mjs').is_file() or not (ROOT / 'package-lock.json').is_file():
        raise ValueError('Runtime installation requires the full source checkout, not the built dist package.')
    node, npm = node_tools(args.desktop)
    venv = args.venv.absolute()
    python = venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if venv.is_symlink():
        raise ValueError('Refusing a symlink venv directory')
    if existing(venv):
        if not args.reuse_venv:
            raise ValueError('Venv already exists: ' + str(venv) + '. Choose a new --venv or explicitly --reuse-venv.')
        if not (venv / 'pyvenv.cfg').is_file() or not python.is_file():
            raise ValueError('Not a usable venv: ' + str(venv))
        actual = subprocess.check_output([str(python), '-c', 'import sys; print(sys.prefix)'], text=True).strip()
        if Path(actual).resolve() != venv.resolve():
            raise ValueError('Venv interpreter prefix does not match destination')
    if args.config_output:
        if existing(args.config_output.absolute()):
            raise ValueError('Config output must be a NEW directory: ' + str(args.config_output))
        if not args.config_output.absolute().parent.is_dir():
            raise ValueError('Config output parent must already exist: ' + str(args.config_output.absolute().parent))
    if not existing(venv):
        run([sys.executable, '-m', 'venv', venv], args.dry_run)
    requirements = ['requirements-images.txt'] + [
        {'gpa': 'requirements-gpa.txt', 'structures': 'requirements-structure-tools.txt', 'dm4': 'requirements-dm4.txt'}[x]
        for x in dict.fromkeys(args.extra)]
    run([python, '-m', 'pip', 'install'] + [x for req in requirements for x in ('-r', ROOT / req)], args.dry_run)
    run([npm, 'ci'], args.dry_run)
    run([npm, 'run', 'build'], args.dry_run)
    if args.desktop:
        run([npm, 'run', 'desktop:install'], args.dry_run)
    if args.config_output:
        cmd = [node, ROOT / 'dist/tools/prepare_plugin.mjs', '--python', python,
               '--workspace', args.workspace.absolute(), '--output', args.config_output.absolute()]
        if 'structures' in args.extra:
            cmd.append('--structures')
        run(cmd, args.dry_run)
    if args.skills_dir and not args.dry_run:
        install_skills(args.skills_dir, args.existing_skills)
    print('Plan checked.' if args.dry_run else 'Installation complete. No client configuration or authentication was changed.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print('Installation stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
