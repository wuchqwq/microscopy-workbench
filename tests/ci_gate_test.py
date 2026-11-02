"""Gate fail-closed and workflow wiring tests; standard library only."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ci_gate', ROOT / 'scripts/ci_gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def fixture(kind='quick', selected=()):
    outputs = {'run_' + f: str(f in selected).lower() for f in gate.FLAGS}
    outputs['run_full_ci'] = str(set(selected) == set(gate.FLAGS)).lower()
    return {'changes': {'result': 'success', 'outputs': outputs},
            **{job: {'result': 'success' if flag in selected else 'skipped'}
               for job, flag in gate.JOBS[kind].items()}}


class GateTests(unittest.TestCase):
    def test_selected_success_and_deliberately_skipped_unaffected_are_accepted(self):
        for kind in gate.JOBS:
            for flags in ((), ('engineering',), ('crystal',), gate.FLAGS):
                gate.validate(kind, fixture(kind, flags))

    def test_expected_skipped_failed_cancelled_missing_or_unknown_fail(self):
        for result in ('skipped', 'failure', 'cancelled', None, 'pending'):
            with self.subTest(result=result):
                data = fixture(selected=('engineering',))
                data['node-smoke']['result'] = result
                with self.assertRaises(ValueError): gate.validate('quick', data)

    def test_classifier_failures_cannot_turn_into_green(self):
        for result in ('skipped', 'failure', 'cancelled'):
            data = fixture()
            data['changes']['result'] = result
            with self.assertRaises(ValueError): gate.validate('quick', data)

    def test_missing_or_extra_dependency_fails(self):
        for key in ('node-smoke', 'new-unmapped-job'):
            data = fixture()
            if key in data: del data[key]
            else: data[key] = {'result': 'success'}
            with self.assertRaises(ValueError): gate.validate('quick', data)

    def test_missing_invalid_or_contradictory_output_fails(self):
        for value in (None, '', True, 'yes'):
            data = fixture()
            data['changes']['outputs']['run_engineering'] = value
            with self.assertRaises(ValueError): gate.validate('quick', data)
        data = fixture()
        data['changes']['outputs']['run_full_ci'] = 'true'
        with self.assertRaises(ValueError): gate.validate('quick', data)

    def test_unexpected_ran_failure_is_not_ignored(self):
        data = fixture()
        data['classical-gpa']['result'] = 'failure'
        with self.assertRaises(ValueError): gate.validate('quick', data)

    def test_f3b_missing_required_simulation_is_not_a_pass(self):
        data = fixture('f3b', ('crystal',))
        data['actual-diffsims-mcp']['result'] = 'skipped'
        with self.assertRaises(ValueError): gate.validate('f3b', data)

    def test_cli_reports_nonzero_for_bad_needs(self):
        env = {**os.environ, 'CI_NEEDS_JSON': '{}'}
        result = subprocess.run([sys.executable, str(ROOT/'scripts/ci_gate.py'), 'quick'],
                                env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FAILED', result.stderr)

    def test_workflow_jobs_conditions_and_gate_needs_match_catalog(self):
        for kind, filename in (('quick', 'quick.yml'), ('f3b', 'f3b-simulation.yml')):
            text = (ROOT/'.github/workflows'/filename).read_text()
            self.assertEqual(set(re.findall(r'^  ([a-z][a-z0-9-]*):$', text.split('jobs:\n', 1)[1], re.M)),
                             {'changes', 'ci-gate', *gate.JOBS[kind]})
            block = text.split('  ci-gate:\n', 1)[1]
            self.assertIn('if: ${{ always() }}', block)
            expected = ['changes', *gate.JOBS[kind]]
            self.assertIn('needs: [' + ', '.join(expected) + ']', block)
            for job, flag in gate.JOBS[kind].items():
                self.assertIn("  %s:\n    needs: changes\n    if: needs.changes.outputs.run_%s == 'true'" % (job, flag), text)
            self.assertNotIn('    paths:', text)  # Both gates must report on every PR.
            self.assertIn("cancel-in-progress: ${{ github.event_name == 'pull_request' }}", text)
            self.assertIn('github.event.pull_request.number || github.run_id', text)
            self.assertNotIn('run: npm run typecheck', text)  # Build already performs it.
            self.assertIn('python3 -B tests/ci_gate_test.py', text)
            for flag in gate.FLAGS:
                self.assertIn('run_' + flag + ': ${{ steps.classify.outputs.run_' + flag + ' }}', text)


if __name__ == '__main__':
    unittest.main(verbosity=2)
