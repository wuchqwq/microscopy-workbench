"""Reproduce a pinned, independently reviewed F4 + F2a integration.

Only run in a disposable clean checkout with MICROSCOPY_INTEGRATION_ASSEMBLE=1.
No remote refs are moved here. The numerical kernels and old records are not
changed. Unknown overlaps fail instead of choosing an entire side silently.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile

BASE = '562416cb56fb76034ebc219101ea86845ed5cea4'
F4 = '3678c54a0b8c57ec027fcfd03fd856489d26184c'
GPA = 'fc3a207fceeeab9f0285ab02596859d90b84d80c'


def git(*args, check=True):
    return subprocess.run(['git', *args], check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def source(ref, path):
    return git('show', f'{ref}:{path}').stdout


def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one integration anchor: {old[:140]!r}')
    return text.replace(old, new, 1)


def python_workspace(s):
    s = once(s, '    from . import image_evidence as evidence\n', '    from . import image_evidence as evidence\n    from . import image_gpa as gpa\n')
    s = once(s, '    import image_evidence as evidence\n', '    import image_evidence as evidence\n    import image_gpa as gpa\n')
    s = once(s, '    **evidence.FIELDS,\n', '    **evidence.FIELDS,\n    **gpa.FIELDS,\n')
    s = once(s, '            if metadata.get("kind") in active_analysis.FIELDS:\n                active_analysis.validate_references(self, metadata, sys.modules[__name__])\n', '            if metadata.get("kind") in active_analysis.FIELDS:\n                active_analysis.validate_references(self, metadata, sys.modules[__name__])\n            if metadata.get("kind") in gpa.FIELDS:\n                gpa.validate_references(self, metadata, sys.modules[__name__])\n')
    s = once(s, '            record = metadata.get("xy_calibration")\n            if record and record["calibration_id"] != current:', '            if metadata.get("kind") == "gpa":\n                pending_ids.extend(row["object_id"] for row in metadata.get("history", []))\n            record = metadata.get("xy_calibration")\n            if record and record["calibration_id"] != current:')
    s = once(s, '"image_field_increment.py", "image_active_analysis.py")', '"image_field_increment.py", "image_active_analysis.py", "image_gpa.py", "image_gpa_core.py")')
    s = once(s, '        elif action in feature_field.FIELDS:\n            metadata = feature_field.action(self, action, request, metadata, directory, sys.modules[__name__])\n', '        elif action in feature_field.FIELDS:\n            metadata = feature_field.action(self, action, request, metadata, directory, sys.modules[__name__])\n        elif action in gpa.FIELDS:\n            metadata = gpa.action(self, action, request, metadata, directory, sys.modules[__name__])\n')
    s = once(s, '            if parent["kind"] == "annotate":\n                scientific, _ = self.object(parent["render_base_object_id"])\n', '            if parent["kind"] == "annotate":\n                scientific, _ = self.object(parent["render_base_object_id"])\n            if scientific["kind"] == "gpa_view":\n                scientific, _ = self.object(scientific["gpa_object_id"])\n')
    anchor = '            feature_result = scientific["kind"] in ("feature_field", "spatial_field", "domain_map", "field_extend", "analysis_candidates")\n'
    s = once(s, anchor, anchor + '            gpa_result = scientific["kind"] in ("gpa", "gpa_read")\n            if gpa_result:\n                need(scientific.get("calibration_dependency") == calibration.dependency(record),\n                     "GPA fields/samples use an older XY metric. Revise image_gpa on the current calibrated FFT before exporting physical results",\n                     "STALE_CALIBRATION_RESULT")\n')
    s = once(s, '"analysis-candidates.json", "analysis-candidates.csv")]\n', '"analysis-candidates.json", "analysis-candidates.csv") or gpa_result and name in ("gpa-report.json", "gpa-summary.csv", "gpa-samples.json", "gpa-samples.csv")]\n')
    s = once(s, '            elif numeric_result or scientific.get("dtype") in ("complex64", "complex128"):', '            elif numeric_result or scientific["kind"] == "gpa_read" or scientific.get("dtype") in ("complex64", "complex128"):')
    return s


def ts_workspace(s):
    s = once(s, "import {activeTools,activeActions} from './image_active_contract.mjs';", "import {activeTools,activeActions} from './image_active_contract.mjs';\nimport {gpaTools,gpaActions} from './image_gpa_contract.mjs';")
    s = once(s, 'export const imageTools: ToolDefinition[]=[\n', 'export const imageTools: ToolDefinition[]=[\n  ...gpaTools,\n')
    return once(s, '={...automationActions,...sequenceActions,...domainActions,...activeActions,...evidenceActions,', '={...gpaActions,...automationActions,...sequenceActions,...domainActions,...activeActions,...evidenceActions,')


def ts_module(s):
    s = once(s, "import {activeRecipes} from '../image_active_contract.mjs';", "import {activeRecipes} from '../image_active_contract.mjs';\nimport {gpaRecipes} from '../image_gpa_contract.mjs';")
    return once(s, '  ...evidenceRecipes,\n', '  ...evidenceRecipes,\n  ...gpaRecipes,\n')


def package(s, theirs):
    data, other = json.loads(s), json.loads(theirs)
    path = 'dist/tests/gpa-contract.test.mjs'
    if path in data['scripts']['test']:
        raise RuntimeError('GPA contract already present')
    data['scripts']['test'] += ' ' + path
    data['scripts']['test:gpa'] = other['scripts']['test:gpa']
    data['scripts']['test:integration:f4-gpa'] = 'node --test dist/tests/f4-gpa-integration.test.mjs'
    return json.dumps(data, indent=2) + '\n'


def compatibility(s, theirs):
    additions = "const additions=['image_spatial_field','image_domain_map','image_analysis_candidates','image_field_extend','image_evidence'];"
    s = once(s, additions, additions[:-2] + ",'image_gpa','image_gpa_read','image_gpa_view'];")
    # Keep #36's strict negative catalog tests as well as #35's exact frozen
    # normalization of optional compact/context additions.
    block = theirs[theirs.index('const GPA_ADDITIONS='):theirs.index('function snapshot(')]
    s = once(s, 'function snapshot(', block + 'function snapshot(')
    return s


def skill(s, theirs):
    block = theirs[theirs.index('## Single-domain classical GPA'):theirs.index('Before each write choose and retain')]
    s = once(s, 'Before each write choose and retain', block + 'Before each write choose and retain')
    s = once(s, 'build bounded multiscale structural fields and candidate domains,', 'build bounded multiscale structural fields and candidate domains or explicit single-domain classical GPA,')
    s = once(s, 'dislocation/GPA\nor ptychography reconstruction.', 'automatic dislocation analysis\nor ptychography reconstruction. Classical GPA supports one explicit domain and a qualified saved FFT.')
    return s


def merge_text(path, ours, base, theirs):
    with tempfile.TemporaryDirectory(prefix='integration-merge-') as temporary:
        inputs = []
        for name, contents in [('ours', ours), ('base', base), ('theirs', theirs)]:
            p = Path(temporary) / name
            p.write_bytes(contents)
            inputs.append(str(p))
        result = git('merge-file', '-p', *inputs, check=False)
        if result.returncode:
            raise RuntimeError(f'Unreviewed conflict in {path}; refusing automatic side selection')
        return result.stdout


def main():
    if os.environ.get('MICROSCOPY_INTEGRATION_ASSEMBLE') != '1':
        raise SystemExit('Use an explicitly authorized disposable checkout; set MICROSCOPY_INTEGRATION_ASSEMBLE=1')
    if git('status', '--porcelain').stdout:
        raise SystemExit('Refusing to assemble in a dirty checkout')
    seed = git('rev-parse', 'HEAD').stdout.decode().strip()
    git('merge-base', '--is-ancestor', F4, seed)
    if git('merge-base', '--is-ancestor', GPA, seed, check=False).returncode == 0:
        raise SystemExit('GPA ancestry already present; do not rerun assembly')
    paths = git('diff', '--name-only', BASE, GPA).stdout.decode().splitlines()
    for path in paths:
        theirs = source(GPA, path)
        target = Path(path)
        old = git('show', f'{BASE}:{path}', check=False)
        if old.returncode:
            if target.exists():
                raise RuntimeError(f'Unexpected pre-existing GPA addition: {path}')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(theirs)
            continue
        ours = source(F4, path)
        if path == '.github/workflows/quick.yml':
            text = target.read_text()
            for job in ('changes:', 'active-analysis:', 'classical-gpa:', 'f4-gpa-integration:'):
                if '  ' + job not in text:
                    raise RuntimeError(f'Missing integrated CI job: {job}')
            continue  # Already reviewed/committed in the seed; no workflow push.
        handlers = {
            'tools/image_workspace.py': lambda a, b: python_workspace(a),
            'lib/image_workspace.mts': lambda a, b: ts_workspace(a),
            'lib/tools/image_module.mts': lambda a, b: ts_module(a),
            'package.json': package,
            'tests/compiled-baseline-compat.test.mjs': compatibility,
            'skills/scientific-agent/microscopy-automation/SKILL.md': skill,
        }
        if path in handlers:
            result = handlers[path](ours.decode(), theirs.decode()).encode()
        elif ours == old.stdout:
            result = theirs
        else:
            result = merge_text(path, ours, old.stdout, theirs)
        target.write_bytes(result)
    git('add', '--', *paths)
    # The candidate must preserve both exact numerical modules and the F4
    # contact/evidence algorithms; only shared registration/export adapters vary.
    for ref, path in [(GPA, 'tools/image_gpa.py'), (GPA, 'tools/image_gpa_core.py'),
                      (F4, 'tools/image_evidence.py'), (F4, 'tools/image_spatial_domains.py'),
                      (F4, 'tools/image_active_analysis.py'), (F4, 'tools/image_field_increment.py'),
                      (F4, 'README.zh-CN.md')]:
        if Path(path).read_bytes() != source(ref, path):
            raise RuntimeError(f'Unintended science/bilingual change: {path}')
    git('diff', '--check', '--cached')
    tree = git('write-tree').stdout.decode().strip()
    message = '[assembled] Integrate pinned F4-lite and F2a without changing numerical kernels'
    commit = git('commit-tree', tree, '-p', seed, '-p', GPA, '-m', message).stdout.decode().strip()
    git('checkout', '--detach', commit)
    print(json.dumps({'seed': seed, 'f4': F4, 'gpa': GPA, 'tree': tree, 'candidate': commit}, indent=2))


if __name__ == '__main__':
    main()
