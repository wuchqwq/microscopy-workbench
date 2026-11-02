#!/usr/bin/env python3
"""Dependency-scoped PR checks. Unknown paths/inputs and main pushes run all.

No network, third-party packages, checkout mutation, or executable PR metadata.
Keep the safe leaf rules small; shared numerical/transport/build code is full.
"""
import os
from pathlib import PurePosixPath
import re
import subprocess

FLAGS = ('engineering', 'images', 'spatial', 'gpa', 'topology', 'crystal', 'skills')
GPA = {'tools/image_gpa.py', 'tools/image_gpa_core.py', 'tools/create_gpa_fixtures.py', 'tools/smoke_gpa.mts'}
TOPOLOGY = {'tools/image_topology.py', 'tools/image_topology_core.py', 'tools/image_topology_legacy_v1.py',
            'tools/create_topology_fixtures.py', 'tools/smoke_topology.mts', 'tools/smoke_topology_loop_groups.mts'}
SPATIAL = {'tools/image_spatial_atlas.py', 'tools/image_spatial_domains.py', 'tools/image_feature_field.py',
           'tools/image_domain_compare.py', 'tools/image_domain_neighbors.py', 'tools/image_field_increment.py',
           'tools/image_active_analysis.py', 'tools/image_evidence.py'}
CRYSTAL = {'tools/structure_worker.py', 'tools/crystal_qualification.py', 'tools/structure_viewer.mts',
           'tools/smoke_twin.mts', 'tools/smoke_general_evidence.mts', 'tools/smoke_manual_crystal.mts'}
ENGINEERING = {'tools/image_panel.mts', 'tools/researcher_inspector.mts',
               'tests/research-workspace-ui.test.mjs', 'tests/resumable-observations.test.mjs',
               'tests/panel-roi-handoff.test.mjs', 'tests/roi-observations.test.mjs',
               'tests/user-workflow.test.mjs', 'tests/inspector-panel-registration.test.mjs'}


def classify(paths):
    selected = set()
    if not paths:
        return set(FLAGS)
    for path in paths:
        p = PurePosixPath(path)
        if p.is_absolute() or '..' in p.parts:
            return set(FLAGS)
        if path in {'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'README.md'} or (
                len(p.parts) == 1 and path.startswith('README.') and path.endswith('.md')):
            continue
        if path.startswith('docs/') and path.endswith('.md'):
            continue
        if path.startswith('skills/') and path.endswith('.md'):
            selected.add('skills')
        elif (path.startswith('ui/image-panel/') and p.suffix in ('.mts', '.css', '.html')) or path in ENGINEERING or (
                path.startswith('tests/image-panel-') and path.endswith('.test.mjs')):
            selected.add('engineering')
        elif path in GPA or (path.startswith('tests/test_image_gpa_') and path.endswith('.py')):
            # Topology and the F4 integration consume GPA outputs.
            selected.update(('gpa', 'topology'))
        elif path in TOPOLOGY or (path.startswith('tests/test_') and 'topology' in p.name and path.endswith('.py')):
            selected.add('topology')
        elif path in SPATIAL:
            selected.update(('spatial', 'gpa', 'topology'))
        elif path in CRYSTAL or path.startswith('crystallography/') or (
                path.startswith('tests/test_') and p.name.startswith(('test_twin', 'test_general_', 'test_site_occupancy', 'test_crystal_qualification'))):
            selected.add('crystal')
            if path == 'tools/structure_viewer.mts':
                selected.add('engineering')
        else:
            # Includes shared workers, peaks/calibration, schema, runtime, build,
            # dependencies, CI itself, binary fixtures and new unmapped files.
            return set(FLAGS)
    return selected


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE, timeout=30)


def determine(env):
    if env.get('EVENT_NAME') != 'pull_request':
        return set(FLAGS), '', 'non_pr_full'
    base, head = env.get('BASE_SHA', ''), env.get('HEAD_SHA', '')
    if not all(re.fullmatch('[0-9a-fA-F]{40}', x) for x in (base, head)):
        return set(FLAGS), '', 'invalid_refs_full'
    try:
        comparison = git('merge-base', base, head).decode('ascii').strip()
        if not re.fullmatch('[0-9a-f]{40}', comparison):
            raise ValueError('Invalid merge base')
        raw = git('diff', '--name-only', '--no-renames', '-z', comparison, head, '--')
        if raw and not raw.endswith(b'\0'):
            raise ValueError('Truncated path list')
        paths = [x.decode('utf-8') for x in raw.split(b'\0') if x]
        selected = classify(paths)
        return selected, comparison, 'full' if selected == set(FLAGS) else 'scoped'
    except (OSError, subprocess.SubprocessError, ValueError, UnicodeError):
        return set(FLAGS), '', 'unreadable_diff_full'


def main():
    selected, comparison, reason = determine(os.environ)
    print('run_full_ci=' + str(selected == set(FLAGS)).lower())
    print('comparison_base=' + comparison)
    print('scope_reason=' + reason)
    for flag in FLAGS:
        print('run_' + flag + '=' + str(flag in selected).lower())


if __name__ == '__main__':
    main()
