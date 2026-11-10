#!/usr/bin/env python3
"""Reproducibly bundle the existing portable Skills as a tiny, private npm tarball."""
import argparse
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / 'packages/skills/microscopy-scientific-skills.tgz'


def source_bytes(path):
    # All packaged resources are UTF-8 source text. Canonical LF keeps archives
    # identical after Windows Git checkouts without changing repository files.
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').encode('utf-8')


def build():
    spec = importlib.util.spec_from_file_location('installer', ROOT / 'tools/install_workbench.py')
    installer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(installer)
    template = ROOT / 'packages/skills-installer'
    package = json.loads((template / 'package.json').read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as temp:
        bundle = Path(temp) / 'bundle'
        with contextlib.redirect_stdout(io.StringIO()):
            installer.install_skills(bundle)
        files = {f'bundle/{p.relative_to(bundle).as_posix()}': source_bytes(p)
                 for p in bundle.rglob('*') if p.is_file()}
        manifest = {
            'format': 1, 'skills_version': '0.6.1-r2', 'installer_version': package['version'],
            'skills': sorted(p.name for p in bundle.iterdir() if p.name != installer.SUPPORT),
            'files': [{'path': name.removeprefix('bundle/'), 'sha256': hashlib.sha256(data).hexdigest()}
                      for name, data in sorted(files.items())],
        }
        files.update({'package.json': source_bytes(template / 'package.json'),
                      'install.mjs': source_bytes(template / 'install.mjs'),
                      'LICENSE': source_bytes(ROOT / 'LICENSE'),
                      'manifest.json': (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')})
        output = io.BytesIO()
        with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0, compresslevel=9) as gz:
            with tarfile.open(fileobj=gz, mode='w', format=tarfile.USTAR_FORMAT) as tar:
                for name, data in sorted(files.items()):
                    info = tarfile.TarInfo('package/' + name)
                    info.size = len(data)
                    info.mode = 0o755 if name == 'install.mjs' else 0o644
                    tar.addfile(info, io.BytesIO(data))
        return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT)
    parser.add_argument('--check', action='store_true', help='Compare with committed tarball without writing')
    args = parser.parse_args()
    data = build()
    if args.check:
        if not args.output.is_file() or args.output.read_bytes() != data:
            parser.exit(1, 'Skills tarball is stale. Run python tools/build_skills_npm.py and commit it.\n')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(data)
    print(f'{len(data)} bytes; sha256 {hashlib.sha256(data).hexdigest()}')


if __name__ == '__main__':
    main()
