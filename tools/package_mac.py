#!/usr/bin/env python3
"""Build a new local arm64 .app from explicit already-installed runtimes.

No downloads, package installation, credentials, private datasets or publishing.
The result still needs native GUI and distribution-signing qualification.
"""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def ordinary(value):
    p = Path(value)
    if not p.is_absolute() or p.is_symlink() or not p.is_dir():
        raise ValueError('Explicit ordinary input directory required: ' + str(p))
    return p.resolve()


def skip(_directory, names):
    return [n for n in names if n in {'__pycache__', '.pytest_cache', 'tests', 'test'} or n.endswith(('.pyc', '.pyo'))]


def copy(source, destination):
    if source.is_dir():
        shutil.copytree(source, destination, symlinks=True, ignore=skip)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def check_links(root):
    for file in root.rglob('*'):
        if file.is_symlink():
            if os.path.isabs(os.readlink(file)) or not file.resolve().is_relative_to(root.resolve()):
                raise ValueError('Runtime link escapes its payload: ' + str(file.relative_to(root)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['output', 'runtime', 'electron-app', 'node-root', 'python-base', 'python-site']:
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if not output.is_absolute() or output.suffix != '.app' or output.exists():
        raise ValueError('Output must be a NEW absolute .app path; existing data is never replaced')
    if not output.parent.is_dir():
        raise ValueError('Create/select the output parent directory first')
    runtime, electron, node, python, site = [ordinary(v) for v in [args.runtime, args.electron_app, args.node_root, args.python_base, args.python_site]]
    for file in [runtime/'tools/desktop_bundle_entry.mjs', runtime/'lib/research_joint_owner.mjs', electron/'Contents/MacOS/Electron', node/'bin/node', node/'LICENSE', python/'bin/python3.13']:
        if not file.is_file():
            raise ValueError('Required build input missing: ' + str(file))
    check_links(python)
    # Discover only installed distribution-owned roots, never a parent venv,
    # scripts, configuration, caches, credentials or arbitrary workspace files.
    roots = set()
    components = []
    for dist in metadata.distributions(path=[str(site)]):
        if dist.metadata['Name'].lower() == 'pip':
            continue
        if dist.read_text('direct_url.json'):
            raise ValueError('Local/direct-url package needs separate review: ' + dist.metadata['Name'])
        components.append({'name': dist.metadata['Name'], 'version': dist.version, 'license_expression': dist.metadata.get('License-Expression'), 'notices': 'retained in package dist-info'})
        for file in dist.files or []:
            if file.parts and file.parts[0] not in {'..', '__pycache__'}:
                roots.add(file.parts[0])
    required = {'numpy', 'scipy', 'pillow', 'tifffile'}
    if not required.issubset({c['name'].lower() for c in components}):
        raise ValueError('Image runtime needs numpy, scipy, Pillow and tifffile')
    app_info = plistlib.loads((electron/'Contents/Info.plist').read_bytes())
    version = json.loads((runtime/'package.json').read_text())['version']
    shutil.copytree(electron, output, symlinks=True)
    app = output/'Contents/Resources/app'
    app.mkdir()
    target_runtime = app/'runtime'
    target_runtime.mkdir()
    # Required standalone application code/assets only. Do not copy repository
    # docs/evidence/tests, profiles, .git, .codex, auth files or developer config.
    for name in ['lib', 'tools', 'ui', 'crystallography', 'capture_schemas']:
        if (runtime/name).exists():
            copy(runtime/name, target_runtime/name)
    for name in ['server.mjs', 'science-server.mjs', 'package.json', 'BUILD.json', 'LICENSE']:
        if (runtime/name).exists():
            copy(runtime/name, target_runtime/name)
    node_target = app/'runtimes/node'
    copy(node/'bin/node', node_target/'bin/node')
    copy(node/'LICENSE', node_target/'LICENSE')
    python_target = app/'runtimes/python'
    # Base Python has only pip in site-packages. Exclude that directory from the
    # base copy; add the explicitly enumerated scientific distributions below.
    base_site = python/'lib/python3.13/site-packages'
    def base_skip(directory, names):
        omitted = skip(directory, names)
        if Path(directory) == base_site.parent:
            omitted += ['site-packages']
        return omitted
    shutil.copytree(python, python_target, symlinks=True, ignore=base_skip)
    destination_site = python_target/'lib/python3.13/site-packages'
    destination_site.mkdir()
    for name in sorted(roots):
        if (site/name).exists():
            copy(site/name, destination_site/name)
    check_links(python_target)
    package = {'name': 'microscopy-workbench-local-demo', 'productName': 'Microscopy Workbench Local Demo', 'version': version, 'type': 'module', 'main': 'runtime/tools/desktop_bundle_entry.mjs', 'private': True, 'license': 'MIT'}
    (app/'package.json').write_text(json.dumps(package, indent=2) + '\n')
    # Only public deterministic synthetic samples, generated independently of
    # any user workspace or specimen. Generation does not run a model.
    samples = app/'examples'
    samples.mkdir()
    env = {k: v for k, v in os.environ.items() if k not in {'PYTHONHOME', 'PYTHONPATH'}}
    env['PYTHONNOUSERSITE'] = '1'
    generated = subprocess.run([str(python_target/'bin/python3.13'), '-B', '-c', 'import numpy as np,tifffile,sys; y,x=np.mgrid[:64,:64]; tifffile.imwrite(sys.argv[1],(100+200*(x>=32)+20*(y%2)).astype(np.uint16),metadata=None,photometric="minisblack")', str(samples/'PUBLIC-SYNTHETIC-intensity-64.tiff')], env=env, capture_output=True, text=True)
    if generated.returncode:
        raise RuntimeError('Bundled Python cannot generate the public sample: ' + generated.stderr[-2000:])
    (samples/'TRUTH.json').write_text(json.dumps({'synthetic': True, 'formula': '100+200*(x>=32)+20*(y%2)', 'shape_yx': [64, 64], 'dtype': 'uint16', 'units': 'unknown', 'source_sha256': digest(samples/'PUBLIC-SYNTHETIC-intensity-64.tiff')}, indent=2) + '\n')
    notices = app/'THIRD_PARTY_NOTICES'
    notices.mkdir()
    for name in ['LICENSE', 'LICENSES.chromium.html']:
        if (electron.parent/name).exists():
            copy(electron.parent/name, notices/('Electron-' + name))
    copy(python/'lib/python3.13/LICENSE.txt', notices/'Python-LICENSE.txt')
    (notices/'components.json').write_text(json.dumps(sorted(components, key=lambda x: x['name'].lower()), indent=2) + '\n')
    # Rebrand the copied application, never the installed Electron runtime.
    for file in [output/'Contents/Info.plist', *sorted((output/'Contents/Frameworks').glob('*.app/Contents/Info.plist'))]:
        info = plistlib.loads(file.read_bytes())
        suffix = '' if file == output/'Contents/Info.plist' else '.helper.' + file.parents[1].stem.lower().replace(' ', '-').replace('(', '').replace(')', '')
        info['CFBundleIdentifier'] = 'org.microscopy.workbench.localdemo' + suffix
        if not suffix:
            info['CFBundleName'] = 'Microscopy Workbench Local Demo'
            info['CFBundleDisplayName'] = 'Microscopy Workbench Local Demo'
            info['CFBundleShortVersionString'] = version
            info['CFBundleVersion'] = version
        file.write_bytes(plistlib.dumps(info))
    build = {'format': 1, 'kind': 'LOCAL_UNRELEASED_CANDIDATE', 'architecture': 'arm64', 'version': version, 'electron_version': app_info.get('CFBundleShortVersionString'), 'node_binary_sha256': digest(node_target/'bin/node'), 'python_binary_sha256': digest(python_target/'bin/python3.13'), 'components': components, 'real_model_requires': 'Separately installed official ChatGPT app/client with existing user login. No auth/client credentials bundled.', 'gui_acceptance': 'NOT_TESTED', 'clean_mac_acceptance': 'NOT_TESTED', 'developer_id_signing_notarization': 'NOT_DONE', 'rosettasciio_notice': 'Optional GPL-3.0-or-later decoder is included if present in the explicit scientific environment; licenses retained. No public release has been made.'}
    (app/'BUNDLE.json').write_text(json.dumps(build, indent=2) + '\n')
    source = {str(file.relative_to(target_runtime)): digest(file) for file in sorted(target_runtime.rglob('*')) if file.is_file() and not file.is_symlink()}
    (app/'RUNTIME-SHA256.json').write_text(json.dumps(source, indent=2) + '\n')
    (app/'README.txt').write_text('Local unreleased Mac arm64 candidate. Open the .app after native acceptance.\nBundled Node/Python run local image tools; no Homebrew or developer venv is required.\nFor a public sample choose examples/PUBLIC-SYNTHETIC-intensity-64.tiff inside the app payload.\nAI image sending remains limited to the exact public 64x64 full image, with native preview and confirmation.\n0059/other specimen images are not admitted for sending.\nExisting official ChatGPT client/login is required for the optional model connection; no credentials included.\nNative GUI, clean-machine installation and Developer ID/notarization remain unqualified. Do not publish this candidate.\n')
    print(json.dumps({'result': 'BUILT_LOCAL_NOT_QUALIFIED', 'output': str(output), 'runtime_files': len(source), 'python_distributions': len(components)}))


if __name__ == '__main__':
    main()
