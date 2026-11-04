"""Public provider metadata boundary checks; no numerical accuracy qualification.

One tiny existing FFT is made only by the FFT fixture; proof operations are
spied to forbid FFT, preview and measurements. No specimens or GUI gestures.
"""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker
from tools import image_source_proof as proof_module


JS_SIDECAR = r"""let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>raw+=s);process.stdin.on('end',()=>{
const r=JSON.parse(raw),crypto=require('node:crypto'),canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
r.request_id='panel-'+crypto.createHash('sha256').update(canonical(r)).digest('hex').slice(0,32)+'-'+r.sequence;process.stdout.write(JSON.stringify(r,null,2)+'\n');});"""


def snapshot(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in directory.rglob('*') if p.is_file()}


class SourceProofTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='public-source-proof-')
        self.root = Path(self.temporary.name)
        self.workspace = self.root / 'workspace'
        self.sequence = 0
        self.source = self.root / 'synthetic.tiff'
        tifffile.imwrite(self.source, np.arange(32 * 32, dtype=np.uint16).reshape(32, 32), metadata=None)
        opened = self.call('open', source_path=str(self.source))
        self.frame = self.call('frame', object_id=opened['object_id'], frame_index=0)
        self.view = self.call('view', object_id=self.frame['object_id'], max_size=64)

    def tearDown(self):
        self.temporary.cleanup()

    def call(self, action, *, request_id=None, **args):
        readonly = action in ('get', 'result', 'source_proof_info')
        if request_id is None and not readonly:
            self.sequence += 1
            request_id = 'proof-test-' + str(self.sequence)
        request = {'action': action, 'workspace': str(self.workspace), **args}
        if request_id is not None:
            request['request_id'] = request_id
        response = worker.execute(request)
        self.assertTrue(response.get('ok'), response)
        return response['result']

    def refuse(self, action, **args):
        self.sequence += 1
        response = worker.execute({'action': action, 'workspace': str(self.workspace),
                                   'request_id': 'refused-' + str(self.sequence), **args})
        self.assertFalse(response.get('ok'), response)
        return response

    def mint(self, root=None, **args):
        return self.call('source_proof', object_id=(root or self.view)['object_id'], purpose='saved_source', **args)

    def info(self, proof, **args):
        return self.call('source_proof_info', proof_object_id=proof['object_id'], **args)

    def forbid_science(self):
        original = worker.Workspace.action
        def controlled(workspace, action, *args, **kwargs):
            self.assertNotIn(action, ('fft', 'view', 'measure', 'remeasure'), 'Proof must not create science/display')
            return original(workspace, action, *args, **kwargs)
        return patch.object(worker.Workspace, 'action', controlled)

    def test_real_eighty_revision_source_is_fully_verified_without_changing_old_bytes(self):
        current = self.view
        for _ in range(80):
            current = self.call('annotate', object_id=current['object_id'], annotations=[])
        before = snapshot(self.workspace)
        with self.forbid_science():
            proof = self.mint(current)
            result = self.info(proof)
        self.assertEqual(result['status'], 'verified', result)
        self.assertEqual(result['frame_identity']['frame_object_id'], self.frame['object_id'])
        self.assertEqual(len(result['dependencies']), 83)
        self.assertFalse(result['eligible_for_strict_reuse'])
        after = snapshot(self.workspace)
        self.assertTrue(all(after[name] == digest for name, digest in before.items()))
        self.assertEqual(proof['proof']['budget']['max_objects'], 2048)

    def test_current_proof_does_not_claim_a_fresh_read_of_the_original_tiff(self):
        proof = self.mint()
        self.source.unlink()
        with self.forbid_science():
            result = self.info(proof)
        self.assertEqual(result['status'], 'verified', result)

    def test_parent_proof_scope_and_append_only_withdrawal(self):
        with self.forbid_science():
            parent = self.mint()
        later = self.call('annotate', object_id=self.view['object_id'], annotations=[])
        with self.forbid_science():
            child = self.mint(later, parent_proof_id=parent['object_id'])
            self.assertEqual(self.info(child)['status'], 'verified')
            before = snapshot(self.workspace)
            event = self.call('source_proof_revoke', proof_object_id=parent['object_id'], reason='Public test withdrawal')
            self.assertEqual(self.info(child)['status'], 'revoked')
            self.assertEqual(self.info(parent)['status'], 'revoked')
            recovered = self.call('result', query_request_id=event['request_id'])
        self.assertEqual(recovered['object_id'], event['object_id'])
        after = snapshot(self.workspace)
        self.assertTrue(all(after[name] == digest for name, digest in before.items()))

    def test_wrong_root_scope_parent_and_bad_expected_hash_abstain(self):
        parent = self.mint()
        other_view = self.call('view', object_id=self.frame['object_id'], rect=[2, 2, 20, 20], max_size=64,
                               resolved_preview={'request_id': self.view['request_id'], 'object_id': self.view['object_id']})
        refused = self.refuse('source_proof', object_id=other_view['object_id'], purpose='saved_source', parent_proof_id=parent['object_id'])
        self.assertRegex(refused['error']['message'], 'Parent proof')
        self.assertEqual(self.info(parent, expected_sha256='0' * 64)['status'], 'unavailable')

    def test_payload_corruption_after_issuance_is_not_hidden_by_proof(self):
        proof = self.mint()
        payload = self.workspace / 'objects' / self.frame['object_id'] / 'data.npy'
        raw = payload.read_bytes()
        payload.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
        with self.forbid_science():
            result = self.info(proof)
        self.assertEqual(result['status'], 'unavailable', result)
        self.assertIn('changed', result['reason'])

    def test_change_during_final_fresh_verification_refuses_issue(self):
        payload = self.workspace / 'objects' / self.frame['object_id'] / 'data.npy'
        original, verify = payload.read_bytes(), proof_module.Reads.verify
        def mutate(reads):
            payload.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
            return verify(reads)
        with self.forbid_science(), patch.object(proof_module.Reads, 'verify', mutate):
            result = self.refuse('source_proof', object_id=self.view['object_id'], purpose='saved_source')
        self.assertRegex(result['error']['message'], 'changed')

    def test_metadata_and_object_budget_do_not_return_a_partial_proof(self):
        before = snapshot(self.workspace)
        for field, value in [('MAX_METADATA', 100), ('MAX_OBJECTS', 1)]:
            with patch.object(proof_module, field, value), self.forbid_science():
                result = self.refuse('source_proof', object_id=self.view['object_id'], purpose='saved_source')
            self.assertEqual(result['error']['code'], 'BUDGET_EXCEEDED')
        after = snapshot(self.workspace)
        self.assertTrue(all(after[name] == digest for name, digest in before.items()))

    def test_unknown_withdrawal_keeps_original_identity_and_blocks_eligibility(self):
        proof = self.mint()
        request_id = 'withdrawal-response-not-known'
        params = {'workspace': str(self.workspace.resolve()), 'action': 'source_proof_revoke', 'request_id': request_id,
                  'proof_object_id': proof['object_id'], 'reason': 'Controlled admitted unknown'}
        file = self.workspace / 'requests' / (request_id + '.json')
        file.write_bytes(worker.canonical({'request_id': request_id, 'parameters': params,
            'parameters_sha256': hashlib.sha256(worker.canonical(params)).hexdigest(), 'state': 'submitted'}) + b'\n')
        before = file.read_bytes()
        result = self.info(proof)
        self.assertEqual(result['status'], 'unavailable', result)
        self.assertIn('unresolved', result['reason'])
        self.assertEqual(file.read_bytes(), before)

    def test_withdrawal_stays_possible_when_dependency_or_validator_is_bad(self):
        proof = self.mint()
        payload = self.workspace / 'objects' / self.frame['object_id'] / 'data.npy'
        raw = payload.read_bytes()
        payload.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
        with self.forbid_science(), patch.object(proof_module, 'validator_identity', side_effect=AssertionError('withdrawal must not requalify a bad proof')):
            event = self.call('source_proof_revoke', proof_object_id=proof['object_id'], reason='Dependency is no longer trustworthy')
        self.assertEqual(event['revocation']['proof_object_id'], proof['object_id'])
        self.assertEqual(event['kind'], 'source_proof_revocation')

    def test_self_cycle_and_missing_frame_index_do_not_become_qualified(self):
        class ControlledReads:
            api = worker
            def need(self, condition, message, code='SOURCE_PROOF_UNAVAILABLE'):
                worker.need(condition, message, code)
            def object(self, key):
                return {'value': {'object_id': key, 'kind': 'annotate', 'parent_object_id': key}}
        with self.assertRaisesRegex(worker.WorkspaceError, 'self-cycle'):
            proof_module.graph(ControlledReads(), 'a' * 32)
        original = proof_module.frame_path
        def no_index(reads, root):
            frame = copy.deepcopy(original(reads, root))
            frame.pop('frame_index')
            return frame
        with patch.object(proof_module, 'frame_path', no_index), self.forbid_science():
            failure = self.refuse('source_proof', object_id=self.view['object_id'], purpose='saved_source')
        self.assertIn('explicit selected frame index', failure['error']['message'])

    def test_complete_revocation_scan_does_not_hide_a_changed_target_parameter(self):
        proof = self.mint()
        event = self.call('source_proof_revoke', proof_object_id=proof['object_id'], reason='Exact target')
        file = self.workspace / 'requests' / (event['request_id'] + '.json')
        record = worker.read_json(file)
        record['parameters']['proof_object_id'] = 'f' * 32
        file.write_bytes(worker.canonical(record))
        result = self.info(proof)
        self.assertEqual(result['status'], 'unavailable', result)
        self.assertIn('withdrawal original request identity changed', result['reason'])

    def test_noncanonical_json_number_spelling_does_not_borrow_a_js_identity(self):
        reads = proof_module.Reads(worker.Workspace(str(self.workspace), False), worker)
        for token in ['1.0', '-0', '1e-07', '1e7', '1E-7', '0.0000001']:
            with self.subTest(token=token), self.assertRaises(worker.WorkspaceError):
                proof_module.encode_panel_tokens(proof_module.NumberLexeme(token), reads)

    def test_oversized_receipt_abstains_before_provider_publication(self):
        workspace = worker.Workspace(str(self.workspace), False)
        reads = proof_module.Reads(workspace, worker)
        oversized = proof_module.derive(reads, {'object_id': self.view['object_id'], 'purpose': 'saved_source'})
        oversized['input_binding'] = {'unbounded': 'x' * worker.MAX_JSON_BYTES}
        with patch.object(proof_module, 'derive', return_value=oversized), self.forbid_science():
            result = self.refuse('source_proof', object_id=self.view['object_id'], purpose='saved_source')
        self.assertEqual(result['error']['code'], 'BUDGET_EXCEEDED')

    def test_new_preexecution_input_binds_saved_source_proof_and_its_withdrawal(self):
        # A distinct new-input fixture is necessary: qualification and references
        # are part of the original request identity, never patched into an old FFT.
        source_proof = self.mint()
        reference = {'kind': 'source_proof_reference_v1', 'object_id': source_proof['object_id'],
                     'manifest_sha256': worker.sha_file(Path(source_proof['manifest_path']))}
        parameters = {'object_id': self.frame['object_id'], 'rect': [8, 8, 25, 25], 'window': 'hann', 'subtract_mean': True, 'max_size': 64}
        frozen = {'schema_version': 1, 'kind': 'gui_fft_input_v1', 'session_nonce': 'd' * 64, 'sequence': 1,
                  'created_utc': '2026-11-04T00:00:00.000Z', 'parameters': parameters,
                  'source_proof_refs': [reference], 'qualification': 'validated', 'qualification_reason': None,
                  'input_snapshot': {'schema_version': 1, 'annotation_id': None, 'source_view_object_id': self.view['object_id'],
                    'provider_input_object_id': self.frame['object_id'], 'frame_object_id': self.frame['object_id'],
                    'source_view_manifest_sha256': worker.sha_file(Path(self.view['manifest_path'])),
                    'provider_input_manifest_sha256': worker.sha_file(Path(self.frame['manifest_path'])),
                    'frame_manifest_sha256': worker.sha_file(Path(self.frame['manifest_path'])),
                    'frame_array_sha256': self.frame['files_sha256']['data.npy'],
                    'calibration_sha256': hashlib.sha256(b'null').hexdigest(), 'float_roi_xyxy': [8.25, 8.25, 24.75, 24.75],
                    'processing_rect_xyxy': parameters['rect'], 'recipe': {'window': 'hann', 'subtract_mean': True}, 'calibration_snapshot': None}}
        raw = subprocess.run(['node', '-e', JS_SIDECAR], input=json.dumps(frozen), text=True, capture_output=True, check=True).stdout.encode()
        frozen = worker.strict_json(raw.decode())
        request_id = frozen['request_id']
        directory = self.workspace / 'panel-journals' / 'public-new-proof-fixture'
        directory.mkdir(parents=True)
        file = directory / (request_id + '.input.json')
        file.write_bytes(raw)
        (directory / (request_id + '.request.json')).write_bytes(worker.canonical({'name': 'image_fft', 'arguments': {**parameters, 'request_id': request_id}}))
        fft = self.call('fft', request_id=request_id, **parameters)
        args = {'object_id': fft['object_id'], 'purpose': 'fft_input', 'input_relative_path': str(file.relative_to(self.workspace)).replace('\\', '/'), 'input_sha256': hashlib.sha256(raw).hexdigest()}
        before = snapshot(self.workspace)
        with self.forbid_science():
            proof = self.call('source_proof', **args)
            result = self.info(proof)
            self.assertEqual(result['status'], 'verified', result)
            self.assertTrue(result['eligible_for_strict_reuse'])
            self.assertEqual(result['input_binding']['source_proof_refs'], [reference])
            self.call('source_proof_revoke', proof_object_id=source_proof['object_id'], reason='Original qualification proof withdrawn')
            result = self.info(proof)
            self.assertEqual(result['status'], 'revoked', result)
            self.assertFalse(result['eligible_for_strict_reuse'])
            self.refuse('source_proof', **args)
        after = snapshot(self.workspace)
        self.assertTrue(all(after[name] == digest for name, digest in before.items()))
        self.assertEqual(file.read_bytes(), raw)

    def test_original_js_number_lexemes_match_actual_node_canonical_vectors(self):
        example = {'schema_version': 1, 'kind': 'gui_fft_input_v1', 'sequence': 1,
                   'parameters': {'max_size': 128, 'rect': [1e-7, 0.000001, 1e21, 7.8455], 'a1': 1, 'a_': 2, 'aa': 3},
                   'input_snapshot': {'calibration_snapshot': {'xy_scale': {'x': 1e-9, 'y': -1e-9}}}}
        raw = subprocess.run(['node', '-e', JS_SIDECAR], input=json.dumps(example), text=True, capture_output=True, check=True).stdout.encode()
        reads = proof_module.Reads(worker.Workspace(str(self.workspace), False), worker)
        parsed = worker.strict_json(raw.decode())
        expected = parsed['request_id'].split('-')[1]
        self.assertEqual(hashlib.sha256(proof_module.panel_canonical(raw, reads)).hexdigest()[:32], expected)
        self.assertIn(b'1e-7', raw)
        self.assertIn(b'1e+21', raw)

    def test_retrospective_fft_input_preserves_original_sidecar_and_never_recomputes(self):
        # One fixture FFT; all proof/info/revoke operations below forbid science.
        parameters = {'object_id': self.frame['object_id'], 'rect': [8, 8, 25, 25], 'window': 'hann', 'subtract_mean': True, 'max_size': 64}
        frozen = {'schema_version': 1, 'kind': 'gui_fft_input_v1', 'session_nonce': 'c' * 64, 'sequence': 1,
                  'created_utc': '2026-11-04T00:00:00.000Z', 'parameters': parameters,
                  'qualification': 'unavailable', 'qualification_reason': 'Controlled original unavailable evidence',
                  'input_snapshot': {'schema_version': 1, 'annotation_id': None, 'source_view_object_id': self.view['object_id'],
                    'provider_input_object_id': self.frame['object_id'], 'frame_object_id': self.frame['object_id'],
                    'source_view_manifest_sha256': None, 'provider_input_manifest_sha256': None, 'frame_manifest_sha256': None,
                    'frame_array_sha256': None, 'calibration_sha256': None, 'float_roi_xyxy': [7.9999999995, 8.25, 25.0000000005, 24.75],
                    'processing_rect_xyxy': parameters['rect'], 'recipe': {'window': 'hann', 'subtract_mean': True}, 'calibration_snapshot': None}}
        raw = subprocess.run(['node', '-e', JS_SIDECAR], input=json.dumps(frozen), text=True, capture_output=True, check=True).stdout.encode()
        frozen = worker.strict_json(raw.decode())
        request_id = frozen['request_id']
        directory = self.workspace / 'panel-journals' / 'public-proof-fixture'
        directory.mkdir(parents=True)
        file = directory / (request_id + '.input.json')
        file.write_bytes(raw)
        (directory / (request_id + '.request.json')).write_bytes(worker.canonical({'name': 'image_fft', 'arguments': {**parameters, 'request_id': request_id}}))
        fft = self.call('fft', request_id=request_id, **parameters)
        before = snapshot(self.workspace)
        args = {'object_id': fft['object_id'], 'purpose': 'fft_input', 'input_relative_path': str(file.relative_to(self.workspace)).replace('\\', '/'), 'input_sha256': hashlib.sha256(raw).hexdigest()}
        with self.forbid_science():
            proof = self.call('source_proof', **args)
            result = self.info(proof)
            self.assertEqual(result['status'], 'verified', result)
            self.assertEqual(result['basis'], 'retrospective')
            self.assertEqual(result['input_binding']['float_roi_xyxy'], frozen['input_snapshot']['float_roi_xyxy'])
            self.assertEqual(result['original_qualification'], 'unavailable')
            self.assertFalse(result['eligible_for_strict_reuse'])
            same = self.call('result', query_request_id=proof['request_id'])
            self.assertEqual(same['object_id'], proof['object_id'])
            bad = self.refuse('source_proof', **{**args, 'input_relative_path': '../outside.input.json'})
            self.assertIn('sidecar', bad['error']['message'])
        after = snapshot(self.workspace)
        self.assertTrue(all(after[name] == digest for name, digest in before.items()))
        self.assertEqual(file.read_bytes(), raw)


class SourceProofPureBoundaryTests(unittest.TestCase):
    def test_outward_support_keeps_original_edge_tolerance_and_does_not_round_float_input(self):
        near = [7.9999999995, 8.25, 25.0000000005, 24.75]
        before = copy.deepcopy(near)
        self.assertEqual(proof_module.outward_support(near), [8, 8, 25, 25])
        self.assertEqual(near, before)
        self.assertEqual(proof_module.outward_support([7.99999999, 8.25, 25.00000001, 24.75]), [7, 8, 26, 25])
        self.assertNotEqual(proof_module.outward_support([7.99999999, 8.25, 25.00000001, 24.75]), [8, 8, 25, 25])

    def test_mixed_wrapper_total_32_passes_original_resolver_and_33_refuses_before_it(self):
        class ControlledReads:
            def __init__(self, count):
                self.rows, self.original_calls = {}, []
                kinds = ['context', 'calibration', 'annotate', 'measure']
                for n in range(count):
                    kind = kinds[n % len(kinds)]
                    key = 'render_base_object_id' if kind == 'annotate' else 'parent_object_id' if kind == 'measure' else 'base_object_id'
                    self.rows[str(n)] = {'object_id': str(n), 'kind': kind, key: str(n + 1)}
                self.rows[str(count)] = {'object_id': str(count), 'kind': 'frame'}
                def original(ident):
                    self.original_calls.append(ident)
                    return ('original semantics', None, None)
                self.operands = type('Original', (), {'measurement_operand': staticmethod(original)})()
            def need(self, condition, message):
                worker.need(condition, message)
            def object(self, ident):
                return {'value': self.rows[ident]}
        legal = ControlledReads(32)
        self.assertEqual(proof_module.qualified_operand(legal, '0'), ('original semantics', None, None))
        self.assertEqual(legal.original_calls, ['0'])
        excessive = ControlledReads(33)
        with self.assertRaisesRegex(worker.WorkspaceError, 'operand ancestry'):
            proof_module.qualified_operand(excessive, '0')
        self.assertEqual(excessive.original_calls, [])


if __name__ == '__main__':
    unittest.main()
