#!/usr/bin/env python3
"""An always-running workflow gate: a required skipped job is not a pass."""
import json
import os
import sys

FLAGS = ('engineering', 'images', 'spatial', 'gpa', 'topology', 'crystal', 'skills')
JOBS = {
    'quick': {
        'client-setup': 'engineering', 'node-smoke': 'engineering',
        'compiled-compatibility': 'engineering', 'ui-science-smoke': 'engineering',
        'dm4-reader': 'images', 'spatial-evidence': 'spatial', 'active-analysis': 'spatial',
        'classical-gpa': 'gpa', 'f4-gpa-integration': 'gpa',
        'projected-topology': 'topology', 'projected-twin': 'crystal', 'skill-contract': 'skills',
    },
    'f3b': {'actual-diffsims-mcp': 'crystal'},
}


def validate(workflow, needs):
    if workflow not in JOBS or not isinstance(needs, dict):
        raise ValueError('Unknown gate or invalid needs')
    expected = {'changes', *JOBS[workflow]}
    if set(needs) != expected:
        raise ValueError('Gate dependency list differs from the tested job catalog')
    if needs['changes'].get('result') != 'success':
        raise ValueError('Scope classification did not succeed')
    outputs = needs['changes'].get('outputs', {})
    for flag in (*FLAGS, 'full_ci'):
        if outputs.get('run_' + flag) not in ('true', 'false'):
            raise ValueError('Missing/invalid scope output: ' + flag)
    full = all(outputs['run_' + flag] == 'true' for flag in FLAGS)
    if full != (outputs['run_full_ci'] == 'true'):
        raise ValueError('Contradictory full/scoped outputs')
    report = []
    for job, flag in JOBS[workflow].items():
        result = needs[job].get('result')
        required = outputs['run_' + flag] == 'true'
        if result != 'success' and (required or result != 'skipped'):
            raise ValueError('%s: required=%s, result=%r' % (job, required, result))
        report.append('%s: %s%s' % (job, result, '' if required else ' (outside impact scope)'))
    return report


if __name__ == '__main__':
    try:
        for line in validate(sys.argv[1], json.loads(os.environ['CI_NEEDS_JSON'])):
            print(line)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        print('CI gate FAILED: ' + str(exc), file=sys.stderr)
        sys.exit(1)
